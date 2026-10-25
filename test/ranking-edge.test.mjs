// Edge Function mierdi-ranking: se prueba el MISMO módulo que despliega Supabase
// (supabase/functions/mierdi-ranking/handler.js) con fetch y entorno inyectados.
// Nada sale a la red: el catálogo y la RPC son fakes en memoria.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../scripts/lib/paths.mjs';
import { createHandler, CATALOG_URL } from '../supabase/functions/mierdi-ranking/handler.js';

const SB = 'https://proyecto-test.supabase.co';
const SECRET = 'service-role-TEST-ONLY-no-es-real';
const PUB = 'sb_publishable_TESTONLY_cliente';
const PUB_ENV = { SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUB }) };
// JWT legacy de prueba (firma falsa): la función solo mira el claim role, no verifica firmas.
const jwt = (payload) => ['{"alg":"HS256","typ":"JWT"}', JSON.stringify(payload)].map((x) => Buffer.from(x).toString('base64url')).join('.') + '.firma-TESTONLY';
const ANON_JWT = jwt({ iss: 'supabase', role: 'anon' });
const SERVICE_JWT = jwt({ iss: 'supabase', role: 'service_role' });
const ORIGIN = 'https://mierdijuegos.com';
const CATALOG = [{ id: '001-espejo-invertido' }, { id: '030-brachistocrona' }, { id: '044-nuevo-juego' }];
const OK = { p_id_juego: '044-nuevo-juego', p_siglas: 'ABC', p_resultado: 12.5 };

function fakes({ catalog = () => json(CATALOG), rpc = (b) => json([{ siglas: b.p_siglas, resultado: b.p_resultado }]), env = { SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: SECRET, ...PUB_ENV } } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url) === CATALOG_URL) return catalog(init);
    if (String(url) === `${SB}/rest/v1/rpc/mierdi_enviar_resultado`) return rpc(JSON.parse(init.body), init);
    throw new Error('red no permitida: ' + url);
  };
  const handler = createHandler({ fetch, env: (k) => env[k], timeoutMs: 200 });
  return { handler, calls, rpcCalls: () => calls.filter((c) => c.url.includes('/rpc/')) };
}
function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}
function post(body, { origin = ORIGIN, apikey = PUB, headers = {}, raw } = {}) {
  return new Request('https://proyecto-test.supabase.co/functions/v1/mierdi-ranking', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, ...(apikey === null ? {} : { apikey }), ...headers },
    body: raw ?? JSON.stringify(body),
  });
}
async function call(handler, req) {
  const res = await handler(req);
  const text = await res.text();
  return { res, status: res.status, text, body: text ? JSON.parse(text) : null };
}

test('el catálogo es una URL fija y canónica', () => {
  assert.equal(CATALOG_URL, 'https://mierdijuegos.com/games/games.json');
});

test('envío válido a un juego publicado: catálogo fresco, RPC con secreto del servidor, ranking devuelto', async () => {
  const f = fakes();
  const r = await call(f.handler, post(OK));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, [{ siglas: 'ABC', resultado: 12.5 }]);
  assert.equal(r.res.headers.get('access-control-allow-origin'), ORIGIN);
  const [cat, rpc] = f.calls;
  assert.equal(cat.url, CATALOG_URL);
  assert.equal(cat.init.redirect, 'error');
  assert.ok(cat.init.signal, 'el catálogo tiene timeout');
  assert.equal(cat.init.method ?? 'GET', 'GET');
  assert.equal(rpc.init.method, 'POST');
  assert.equal(rpc.init.redirect, 'error');
  assert.equal(rpc.init.headers.apikey, SECRET);
  assert.equal(rpc.init.headers.Authorization, `Bearer ${SECRET}`);
  assert.deepEqual(JSON.parse(rpc.init.body), OK);
  assert.doesNotMatch(r.text, /TEST-ONLY|service/);
});

test('el catálogo se consulta en CADA envío, también para juegos con fila existente (sin caché)', async () => {
  let publicado = true;
  const f = fakes({ catalog: () => json(publicado ? CATALOG : CATALOG.filter((g) => g.id !== '044-nuevo-juego')) });
  assert.equal((await call(f.handler, post(OK))).status, 200);
  assert.equal((await call(f.handler, post({ ...OK, p_siglas: 'XYZ' }))).status, 200);
  publicado = false; // retirado del catálogo publicado: ya no se acepta aunque su fila exista
  assert.equal((await call(f.handler, post({ ...OK, p_siglas: 'QQQ' }))).status, 404);
  assert.equal(f.calls.filter((c) => c.url === CATALOG_URL).length, 3);
  assert.equal(f.rpcCalls().length, 2);
});

test('id con formato válido pero NO publicado: 404 y nunca llega a la RPC', async () => {
  const f = fakes();
  for (const id of ['045-no-publicado', '001-espejo', '001-espejo-invertido-x']) {
    const r = await call(f.handler, post({ ...OK, p_id_juego: id }));
    assert.equal(r.status, 404, id);
  }
  assert.equal(f.rpcCalls().length, 0);
});

test('entradas inválidas (id, siglas, resultado, forma del cuerpo): 400 sin consultar catálogo ni RPC', async () => {
  const f = fakes();
  const casos = [
    { ...OK, p_id_juego: 'Mal' }, { ...OK, p_id_juego: '44-x' }, { ...OK, p_id_juego: '044-' }, { ...OK, p_id_juego: '044-a--b' },
    { ...OK, p_id_juego: '044-' + 'a'.repeat(49) }, { ...OK, p_id_juego: '../../x' }, { ...OK, p_id_juego: 44 }, { ...OK, p_id_juego: null },
    { ...OK, p_siglas: 'abc' }, { ...OK, p_siglas: 'AB' }, { ...OK, p_siglas: 'ABCD' }, { ...OK, p_siglas: 'ÑAB' }, { ...OK, p_siglas: 'AB1' }, { ...OK, p_siglas: ' AB' }, { ...OK, p_siglas: ['ABC'] },
    { ...OK, p_resultado: -1 }, { ...OK, p_resultado: 1e9 + 1 }, { ...OK, p_resultado: '5' }, { ...OK, p_resultado: null }, { ...OK, p_resultado: 1.234 },
    { ...OK, p_id_juego: '030-brachistocrona', p_resultado: 0 },
    { p_id_juego: OK.p_id_juego, p_siglas: 'ABC' }, { ...OK, extra: 1 }, [OK], 'hola', null,
  ];
  for (const c of casos) assert.equal((await call(f.handler, post(c))).status, 400, JSON.stringify(c));
  for (const raw of ['{', '1e999', '{"p_id_juego":"044-nuevo-juego","p_siglas":"ABC","p_resultado":1e999}', '']) {
    assert.equal((await call(f.handler, post(null, { raw }))).status, 400, raw);
  }
  assert.equal(f.calls.length, 0);
});

test('límites válidos: 0 y 1e9 en desc, 030 positivo, 2 decimales', async () => {
  const f = fakes();
  for (const p_resultado of [0, 1e9, 0.29, 7]) assert.equal((await call(f.handler, post({ ...OK, p_resultado }))).status, 200, String(p_resultado));
  assert.equal((await call(f.handler, post({ ...OK, p_id_juego: '030-brachistocrona', p_resultado: 1.23 }))).status, 200);
});

test('método, tipo y tamaño del cuerpo acotados', async () => {
  const f = fakes();
  const get = await f.handler(new Request('https://x.test/functions/v1/mierdi-ranking', { method: 'GET', headers: { origin: ORIGIN, apikey: PUB } }));
  assert.equal(get.status, 405);
  assert.equal((await call(f.handler, post(OK, { headers: { 'content-type': 'text/plain' } }))).status, 415);
  const grande = JSON.stringify({ ...OK, p_siglas: 'A'.repeat(5000) });
  assert.equal((await call(f.handler, post(null, { raw: grande }))).status, 413);
  // Sin Content-Length fiable (stream): también se corta al pasar el límite.
  const stream = new ReadableStream({ start(c) { for (let i = 0; i < 50; i++) c.enqueue(new TextEncoder().encode(' '.repeat(100))); c.close(); } });
  const req = new Request('https://x.test/functions/v1/mierdi-ranking', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, apikey: PUB }, body: stream, duplex: 'half' });
  assert.equal((await call(f.handler, req)).status, 413);
  assert.equal(f.calls.length, 0);
});

test('CORS: solo mierdijuegos.com y www; preflight sin tocar red (CORS no es la seguridad)', async () => {
  const f = fakes();
  for (const origin of [ORIGIN, 'https://www.mierdijuegos.com']) {
    const pre = await f.handler(new Request('https://x.test/functions/v1/mierdi-ranking', { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'apikey,content-type' } }));
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), origin);
    assert.match(pre.headers.get('access-control-allow-headers'), /apikey/);
    assert.match(pre.headers.get('access-control-allow-headers'), /content-type/);
    assert.match(pre.headers.get('access-control-allow-methods'), /POST/);
    assert.match(pre.headers.get('vary'), /Origin/);
  }
  const ajeno = await call(f.handler, post(OK, { origin: 'https://evil.example' }));
  assert.equal(ajeno.res.headers.get('access-control-allow-origin'), null);
  assert.equal((await f.handler(new Request('https://x.test/', { method: 'OPTIONS', headers: { origin: 'https://mierdijuegos.com.evil.example' } }))).headers.get('access-control-allow-origin'), null);
  assert.equal(f.calls.filter((c) => c.url === CATALOG_URL).length, 1, 'solo el POST consulta el catálogo');
});

test('catálogo caído, redirigido, lento, enorme o malformado: falla cerrado (503) sin llamar a la RPC', async () => {
  const fallos = {
    http500: () => json({ error: 'x' }, 500),
    red: () => { throw new TypeError('fetch failed'); },
    redirect: () => { throw new TypeError('unexpected redirect'); },
    'no-json': () => new Response('<html>', { status: 200 }),
    objeto: () => json({ games: CATALOG }),
    vacio: () => json([]),
    'entrada-sin-id': () => json([...CATALOG, { title: 'x' }]),
    'id-malformado': () => json([...CATALOG, { id: 'Mal Id' }]),
    'entrada-null': () => json([...CATALOG, null]),
    enorme: () => new Response('[' + '{"id":"001-espejo-invertido"},'.repeat(60000) + '{"id":"044-nuevo-juego"}]', { status: 200 }),
    'enorme-declarado': () => new Response('[]', { status: 200, headers: { 'content-length': String(50 * 1024 * 1024) } }),
    colgado: (init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))),
    'cuerpo-colgado': () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('[')); } }), { status: 200 }),
  };
  for (const [nombre, catalog] of Object.entries(fallos)) {
    const f = fakes({ catalog });
    const r = await call(f.handler, post(OK));
    assert.equal(r.status, 503, nombre);
    assert.equal(f.rpcCalls().length, 0, nombre);
    assert.doesNotMatch(r.text, /fetch failed|redirect|aborted|html/i, nombre);
  }
});

test('errores de la RPC no se filtran: 22023 → 400 genérico; resto → 502; respuesta rara → 502', async () => {
  const filtrar = 'detalle interno con ' + SECRET;
  const casos = [
    [() => json({ code: '22023', message: filtrar }, 400), 400],
    [() => json({ code: '42501', message: filtrar }, 401), 502],
    [() => json({ message: filtrar }, 500), 502],
    [() => json({ no: 'array' }), 502],
    [() => json([{ siglas: '<b>', resultado: 1 }]), 502],
    [() => json(Array.from({ length: 6 }, () => ({ siglas: 'AAA', resultado: 1 }))), 502],
    [() => new Response('x'.repeat(100000), { status: 200 }), 502],
    [() => { throw new Error(filtrar); }, 502],
  ];
  for (const [rpc, status] of casos) {
    const f = fakes({ rpc });
    const r = await call(f.handler, post(OK));
    assert.equal(r.status, status);
    assert.doesNotMatch(r.text, /TEST-ONLY|detalle|service/);
  }
});

test('secreto solo del entorno del servidor: SERVICE_ROLE_KEY o SUPABASE_SECRET_KEYS; sin él, 500 genérico', async () => {
  const moderno = fakes({ env: { SUPABASE_URL: SB, SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_TESTONLY' }), ...PUB_ENV } });
  assert.equal((await call(moderno.handler, post(OK))).status, 200);
  const h = moderno.rpcCalls()[0].init.headers;
  assert.equal(h.apikey, 'sb_secret_TESTONLY');
  assert.equal(h.Authorization, undefined, 'las sb_secret_ no son JWT: solo cabecera apikey');
  for (const env of [{ SUPABASE_URL: SB }, { SUPABASE_SERVICE_ROLE_KEY: SECRET }, { SUPABASE_URL: 'http://inseguro.test', SUPABASE_SERVICE_ROLE_KEY: SECRET },
    { SUPABASE_URL: SB, SUPABASE_SECRET_KEYS: '{roto' }, { SUPABASE_URL: SB, SUPABASE_SECRET_KEYS: '{"default":""}' }]) {
    const f = fakes({ env: { ...env, ...PUB_ENV } });
    const r = await call(f.handler, post(OK));
    assert.equal(r.status, 500, JSON.stringify(env));
    assert.equal(f.rpcCalls().length, 0);
    assert.doesNotMatch(r.text, /TEST-ONLY|sb_secret/);
  }
});

const colgado = () => new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{')); } }); // nunca cierra

test('apikey: sin cabecera o con una clave que no es publishable → 401, antes de leer el cuerpo y sin red', async () => {
  const f = fakes({ env: { SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: SECRET, SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_TESTONLY' }), ...PUB_ENV } });
  const malas = [null, '', 'x', PUB + 'x', PUB.slice(0, -1), PUB.toUpperCase(), `Bearer ${PUB}`, SECRET, 'sb_secret_TESTONLY', SERVICE_JWT, ANON_JWT];
  for (const apikey of malas) {
    const r = await call(f.handler, post(OK, { apikey }));
    assert.equal(r.status, 401, String(apikey));
    assert.deepEqual(r.body, { error: 'apikey' });
    assert.equal(r.res.headers.get('access-control-allow-origin'), ORIGIN, 'el navegador puede leer el 401');
    assert.doesNotMatch(r.text, /TEST-ONLY|TESTONLY|sb_/);
  }
  // Authorization sin apikey tampoco vale: la clave publishable va en la cabecera apikey.
  assert.equal((await call(f.handler, post(OK, { apikey: null, headers: { authorization: `Bearer ${PUB}` } }))).status, 401);
  // Se comprueba ANTES de leer el cuerpo: un cuerpo colgado sin clave responde 401 al momento.
  const req = new Request('https://x.test/functions/v1/mierdi-ranking', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: colgado(), duplex: 'half' });
  assert.equal((await call(f.handler, req)).status, 401);
  // También antes de método/tipo: sin clave no se revela nada más.
  assert.equal((await f.handler(new Request('https://x.test/', { method: 'GET', headers: { origin: ORIGIN } }))).status, 401);
  assert.equal(f.calls.length, 0, 'sin clave válida no se toca el catálogo ni la RPC');
});

test('apikey: SUPABASE_PUBLISHABLE_KEYS (preferida) o SUPABASE_ANON_KEY legacy; sin configuración, falla cerrado sin red', async () => {
  // Varias publishable en el diccionario: vale cualquiera; un valor que no sea sb_publishable_ se ignora.
  const varias = fakes({ env: { SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: SECRET, SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUB, web: 'sb_publishable_TESTONLY_web', mal: 'sb_secret_TESTONLY', vacia: '' }) } });
  assert.equal((await call(varias.handler, post(OK))).status, 200);
  assert.equal((await call(varias.handler, post(OK, { apikey: 'sb_publishable_TESTONLY_web' }))).status, 200);
  assert.equal((await call(varias.handler, post(OK, { apikey: 'sb_secret_TESTONLY' }))).status, 401);
  assert.equal((await call(varias.handler, post(OK, { apikey: '' }))).status, 401);

  // Legacy: solo si no hay publishable modernas, y solo un JWT con role anon (o una sb_publishable_).
  const legacy = fakes({ env: { SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: SECRET, SUPABASE_ANON_KEY: ANON_JWT } });
  assert.equal((await call(legacy.handler, post(OK, { apikey: ANON_JWT }))).status, 200);
  assert.equal((await call(legacy.handler, post(OK, { apikey: PUB }))).status, 401);
  const ambas = fakes({ env: { SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: SECRET, SUPABASE_ANON_KEY: ANON_JWT, ...PUB_ENV } });
  assert.equal((await call(ambas.handler, post(OK))).status, 200);
  assert.equal((await call(ambas.handler, post(OK, { apikey: ANON_JWT }))).status, 401, 'con publishable modernas, la anon legacy no se acepta');
  const legacyPub = fakes({ env: { SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: SECRET, SUPABASE_ANON_KEY: PUB } });
  assert.equal((await call(legacyPub.handler, post(OK))).status, 200);

  // Sin configuración utilizable (ausente, rota, vacía, solo secretas, anon que es service_role…): 500 genérico, sin red.
  const sinConfig = [{}, { SUPABASE_PUBLISHABLE_KEYS: '{roto' }, { SUPABASE_PUBLISHABLE_KEYS: '{}' }, { SUPABASE_PUBLISHABLE_KEYS: '["' + PUB + '"]' },
    { SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_secret_TESTONLY' }) }, { SUPABASE_ANON_KEY: '' }, { SUPABASE_ANON_KEY: SERVICE_JWT },
    { SUPABASE_ANON_KEY: 'sb_secret_TESTONLY' }, { SUPABASE_ANON_KEY: 'no-es-jwt' }, { SUPABASE_ANON_KEY: SECRET }];
  for (const extra of sinConfig) {
    const f = fakes({ env: { SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: SECRET, ...extra } });
    for (const apikey of [PUB, SERVICE_JWT, 'sb_secret_TESTONLY', SECRET, null]) {
      const r = await call(f.handler, post(OK, { apikey }));
      assert.equal(r.status, 500, JSON.stringify(extra) + ' ' + apikey);
      assert.deepEqual(r.body, { error: 'config' });
    }
    assert.equal(f.calls.length, 0, JSON.stringify(extra));
  }
});

test('OPTIONS no necesita apikey (preflight) y no toca la red, aunque falte la configuración', async () => {
  const f = fakes({ env: {} });
  const pre = await f.handler(new Request('https://x.test/functions/v1/mierdi-ranking', { method: 'OPTIONS', headers: { origin: ORIGIN } }));
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(f.calls.length, 0);
});

test('cuerpo entrante colgado (o que gotea sin cerrar): falla con timeout acotado y sin red', async () => {
  const f = fakes();
  const req = new Request('https://x.test/functions/v1/mierdi-ranking', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, apikey: PUB }, body: colgado(), duplex: 'half' });
  const t0 = Date.now();
  const r = await call(f.handler, req);
  assert.equal(r.status, 408);
  assert.deepEqual(r.body, { error: 'lento' });
  assert.ok(Date.now() - t0 < 2000, 'respeta el timeout inyectado (200 ms)');
  let i = 0;
  const goteo = new ReadableStream({ async pull(c) { await new Promise((ok) => setTimeout(ok, 50)); if (i++ < 1000) c.enqueue(new TextEncoder().encode(' ')); } });
  const req2 = new Request('https://x.test/functions/v1/mierdi-ranking', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, apikey: PUB }, body: goteo, duplex: 'half' });
  assert.equal((await call(f.handler, req2)).status, 408, 'el timeout es total, no por trozo');
  assert.equal(f.calls.length, 0);
});

test('la entrada Deno importa el mismo módulo (sin duplicar lógica) y la función no exige JWT', () => {
  const dir = join(REPO_ROOT, 'supabase/functions/mierdi-ranking');
  const entry = readFileSync(join(dir, 'index.ts'), 'utf8');
  assert.match(entry, /from '\.\/handler\.js'/);
  assert.match(entry, /Deno\.serve\(/);
  assert.doesNotMatch(entry, /games\.json|mierdi_enviar_resultado|\^\[A-Z\]/);
  const handler = readFileSync(join(dir, 'handler.js'), 'utf8');
  assert.doesNotMatch(handler, /^\s*import\s/m, 'sin dependencias externas');
  assert.doesNotMatch(handler, /\bDeno\b|\bprocess\b|node:/, 'solo APIs web estándar');
  const config = readFileSync(join(REPO_ROOT, 'supabase/config.toml'), 'utf8');
  assert.match(config, /\[functions\.mierdi-ranking\]\s*\nverify_jwt = false/);
});
