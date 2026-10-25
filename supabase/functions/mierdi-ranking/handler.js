// Edge Function mierdi-ranking: única puerta de escritura del ranking arcade.
// Recibe {p_id_juego, p_siglas, p_resultado} desde ranking.js; lo primero exige que la cabecera
// apikey sea una clave publishable del proyecto (verify_jwt=false, así que la comprueba la función).
// Después lee el cuerpo con tamaño y tiempo acotados, lo valida estrictamente, comprueba en CADA envío que el id está en el catálogo publicado y canónico
// (https://mierdijuegos.com/games/games.json, URL fija) y solo entonces llama a la RPC
// public.mierdi_enviar_resultado con el secreto del servidor (EXECUTE solo para service_role).
// La RPC crea la fila del juego si no existe. Falla cerrado ante cualquier duda.
// JS estándar sin dependencias ni APIs propias del runtime: index.ts lo sirve en Supabase y
// test/ranking-edge.test.mjs prueba este mismo fichero en Node con fetch/entorno inyectados.

export const CATALOG_URL = 'https://mierdijuegos.com/games/games.json';
const ORIGINS = new Set(['https://mierdijuegos.com', 'https://www.mierdijuegos.com']);
const ID_RE = /^[0-9]{3}-[a-z0-9]+(-[a-z0-9]+)*$/;
const ASC = new Set(['030-brachistocrona']); // menos es mejor (> 0); debe coincidir con la RPC y ranking.js
const MAX_RESULTADO = 1e9;
const MAX_BODY = 1024;
const MAX_CATALOG = 1024 * 1024;
const MAX_RPC = 16 * 1024;

class Fallo extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

// Lee como mucho `max` bytes; si hay más (o Content-Length lo anuncia), corta y lanza.
// Si `signal` se aborta (timeout), cancela el stream para no dejar la lectura colgada.
async function leerAcotado(res, max, status, code, signal) {
  const declarado = Number(res.headers.get('content-length'));
  if (declarado > max) { res.body?.cancel().catch(() => {}); throw new Fallo(status, code); }
  if (!res.body) return '';
  const reader = res.body.getReader();
  signal?.addEventListener('abort', () => reader.cancel().catch(() => {}), { once: true });
  const trozos = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { reader.cancel().catch(() => {}); throw new Fallo(status, code); }
    trozos.push(value);
  }
  const bytes = new Uint8Array(total);
  let o = 0;
  for (const t of trozos) { bytes.set(t, o); o += t.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

// Ejecuta `trabajo(signal)` con un timeout total: al vencer, aborta y lanza Fallo(status, code).
async function conTimeout(timeoutMs, status, code, trabajo) {
  const c = new AbortController();
  let timer;
  const limite = new Promise((_, reject) => { timer = setTimeout(() => { c.abort(); reject(new Fallo(status, code)); }, timeoutMs); });
  try { return await Promise.race([limite, trabajo(c.signal)]); } finally { clearTimeout(timer); }
}

// fetch + lectura acotada bajo un único timeout (también si el cuerpo se queda colgado).
async function pedir(fetchFn, url, init, max, timeoutMs, status, code) {
  try {
    return await conTimeout(timeoutMs, status, code, async (signal) => {
      const res = await fetchFn(url, { ...init, redirect: 'error', signal });
      return { res, text: await leerAcotado(res, max, status, code, signal) };
    });
  } catch (e) {
    throw e instanceof Fallo ? e : new Fallo(status, code);
  }
}

// Claves publishable aceptadas en la cabecera apikey. Preferencia: SUPABASE_PUBLISHABLE_KEYS
// (diccionario JSON nombre → sb_publishable_…); solo si no hay ninguna válida, SUPABASE_ANON_KEY
// legacy (JWT con role anon, o una sb_publishable_). Nunca una clave secreta ni service_role.
// Lista vacía = sin configuración: el handler falla cerrado.
function publicas(env) {
  let modernas = [];
  try {
    const d = JSON.parse(env('SUPABASE_PUBLISHABLE_KEYS') || 'null');
    if (d && typeof d === 'object' && !Array.isArray(d)) modernas = Object.values(d).filter(esPublishable);
  } catch { modernas = []; }
  if (modernas.length) return modernas;
  const anon = env('SUPABASE_ANON_KEY');
  return esPublishable(anon) || rolJwt(anon) === 'anon' ? [anon] : [];
}
function esPublishable(k) { return typeof k === 'string' && /^sb_publishable_[A-Za-z0-9_-]+$/.test(k); }
function rolJwt(k) {
  if (typeof k !== 'string') return null;
  const partes = k.split('.');
  if (partes.length !== 3) return null;
  try {
    const p = JSON.parse(atob(partes[1].replace(/-/g, '+').replace(/_/g, '/')));
    return p && typeof p === 'object' && typeof p.role === 'string' ? p.role : null;
  } catch { return null; }
}
// Comparación sin salida temprana por contenido (la longitud de una clave publishable no es secreta).
function igual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function validar(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const keys = Object.keys(body).sort().join(',');
  if (keys !== 'p_id_juego,p_resultado,p_siglas') return null;
  const { p_id_juego: id, p_siglas: siglas, p_resultado: r } = body;
  if (typeof id !== 'string' || id.length > 52 || !ID_RE.test(id)) return null;
  if (typeof siglas !== 'string' || !/^[A-Z]{3}$/.test(siglas)) return null;
  if (typeof r !== 'number' || !Number.isFinite(r) || Math.round(r * 100) / 100 !== r) return null;
  if (r < 0 || r > MAX_RESULTADO || (ASC.has(id) && r <= 0)) return null;
  return { p_id_juego: id, p_siglas: siglas, p_resultado: r };
}

async function publicado(fetchFn, id, timeoutMs) {
  const { res, text } = await pedir(fetchFn, CATALOG_URL, { method: 'GET', headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } },
    MAX_CATALOG, timeoutMs, 503, 'catalogo');
  if (!res.ok) throw new Fallo(503, 'catalogo');
  let catalogo;
  try { catalogo = JSON.parse(text); } catch { throw new Fallo(503, 'catalogo'); }
  // Un catálogo raro (vacío, entradas sin id válido…) invalida todo el catálogo: falla cerrado.
  if (!Array.isArray(catalogo) || catalogo.length === 0) throw new Fallo(503, 'catalogo');
  for (const g of catalogo) {
    if (!g || typeof g !== 'object' || typeof g.id !== 'string' || g.id.length > 52 || !ID_RE.test(g.id)) throw new Fallo(503, 'catalogo');
  }
  return catalogo.some((g) => g.id === id);
}

function secreto(env) {
  const url = env('SUPABASE_URL');
  if (typeof url !== 'string' || !/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(url.replace(/\/$/, ''))) return null;
  let key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) {
    try {
      const keys = JSON.parse(env('SUPABASE_SECRET_KEYS') || 'null');
      key = keys && typeof keys === 'object' ? (keys.default ?? Object.values(keys)[0]) : null;
    } catch { key = null; }
  }
  if (typeof key !== 'string' || !key) return null;
  // Las claves sb_secret_ no son JWT: van solo en apikey. La service_role legacy (JWT) también en Authorization.
  const headers = key.startsWith('sb_') ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
  return { rpc: `${url.replace(/\/$/, '')}/rest/v1/rpc/mierdi_enviar_resultado`, headers };
}

function rankingValido(x) {
  return Array.isArray(x) && x.length <= 5 && x.every((e) => e && typeof e === 'object'
    && typeof e.siglas === 'string' && /^[A-Z]{3}$/.test(e.siglas) && typeof e.resultado === 'number' && Number.isFinite(e.resultado));
}

export function createHandler({ fetch: fetchFn, env, timeoutMs = 5000 }) {
  return async function handler(req) {
    const origin = req.headers.get('origin');
    const cors = { Vary: 'Origin' };
    if (origin && ORIGINS.has(origin)) cors['Access-Control-Allow-Origin'] = origin;
    const responder = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), {
      status, headers: { ...cors, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), 'Cache-Control': 'no-store' },
    });

    if (req.method === 'OPTIONS') {
      cors['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
      cors['Access-Control-Allow-Headers'] = 'apikey, authorization, content-type, x-client-info';
      cors['Access-Control-Max-Age'] = '600';
      return responder(204);
    }
    try {
      // Lo primero (antes de leer el cuerpo o tocar la red): clave publishable en la cabecera apikey.
      const claves = publicas(env);
      if (!claves.length) throw new Fallo(500, 'config');
      const apikey = req.headers.get('apikey') || '';
      if (!claves.some((k) => igual(apikey, k))) throw new Fallo(401, 'apikey');
      if (req.method !== 'POST') throw new Fallo(405, 'metodo');
      if (!/^application\/json(\s*;.*)?$/i.test(req.headers.get('content-type') || '')) throw new Fallo(415, 'tipo');
      let datos;
      try {
        datos = JSON.parse(await conTimeout(timeoutMs, 408, 'lento', (signal) => leerAcotado(req, MAX_BODY, 413, 'grande', signal)));
      } catch (e) {
        if (e instanceof Fallo) throw e;
        throw new Fallo(400, 'invalido');
      }
      const payload = validar(datos);
      if (!payload) throw new Fallo(400, 'invalido');
      const srv = secreto(env);
      if (!srv) throw new Fallo(500, 'config');
      if (!(await publicado(fetchFn, payload.p_id_juego, timeoutMs))) throw new Fallo(404, 'juego-no-publicado');

      const { res, text } = await pedir(fetchFn, srv.rpc, {
        method: 'POST', headers: { ...srv.headers, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload),
      }, MAX_RPC, timeoutMs, 502, 'servidor');
      let out;
      try { out = JSON.parse(text); } catch { throw new Fallo(502, 'servidor'); }
      if (!res.ok) throw res.status === 400 && out?.code === '22023' ? new Fallo(400, 'invalido') : new Fallo(502, 'servidor');
      if (!rankingValido(out)) throw new Fallo(502, 'servidor');
      return responder(200, out.map((e) => ({ siglas: e.siglas, resultado: e.resultado })));
    } catch (e) {
      // Nunca se reenvía el detalle de un fallo (catálogo, PostgREST, red): solo un código fijo.
      return e instanceof Fallo ? responder(e.status, { error: e.code }) : responder(500, { error: 'interno' });
    }
  };
}
