// Chromium REAL en móvil (390×844, touch) contra public/ranking.js. Supabase está MOCKEADO con
// route.fulfill: ninguna petición sale a la red y nada se escribe en ninguna base de datos.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { REPO_ROOT } from '../scripts/lib/paths.mjs';
import { servePublic } from '../scripts/lib/smoke.mjs';

const SUPA = 'https://grldrwbiovglfxqjdicv.supabase.co';
const PAGE = `<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1">
<title>pagina de prueba del ranking</title><script src="/ranking.js" defer></script></head>
<body style="background:#0a0a0a"><button id="retry" style="font-size:20px">REINTENTAR</button>
<script>
window.cuenta={click:0,keydown:0,keyup:0,touchstart:0,touchend:0,pointerdown:0};
for(const t of Object.keys(cuenta)){document.addEventListener(t,()=>cuenta[t]++);window.addEventListener(t,()=>cuenta[t]++);}
window.retries=0;
document.getElementById('retry').addEventListener('click',()=>{retries++;window.mierdiRanking?.reset();});
</script></body></html>`;

let browser, server;
before(async () => {
  const site = mkdtempSync(join(tmpdir(), 'mierdi-ranking-ui-'));
  mkdirSync(join(site, 'public'));
  copyFileSync(join(REPO_ROOT, 'public/ranking.js'), join(site, 'public/ranking.js'));
  for (const id of ['001-espejo-invertido', '030-brachistocrona']) {
    mkdirSync(join(site, 'public/games', id), { recursive: true });
    writeFileSync(join(site, 'public/games', id, 'index.html'), PAGE);
  }
  server = await servePublic(site);
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await server?.close(); });

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
const json = (body, status = 200) => ({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const fila = (...rs) => [{ ranking: rs.map((r, i) => ({ siglas: 'AA' + 'BCDEFG'[i], resultado: r })) }];
const deferred = () => { let resolve; const p = new Promise((r) => { resolve = r; }); return { p, resolve }; };

// get/post: (n, request) => respuesta | 'colgar' | Promise<respuesta>. Se registra cada llamada.
async function abrir({ id = '001-espejo-invertido', get = () => json(fila()), post } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const calls = { get: [], post: [], otras: [] };
  await context.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith(server.url + '/')) return route.continue();
    if (!url.startsWith(SUPA + '/')) { calls.otras.push(url); return route.abort(); }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const isPost = req.method() === 'POST';
    const list = isPost ? calls.post : calls.get;
    list.push({ url, headers: req.headers(), body: isPost ? JSON.parse(req.postData()) : null });
    const res = await (isPost ? post : get)(list.length - 1, req);
    if (res === 'colgar') return; // nunca responde: lo corta el timeout del cliente
    return route.fulfill(res).catch(() => {}); // abortada por el cliente
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${server.url}/games/${id}/`);
  await page.waitForFunction(() => window.mierdiRanking);
  return { page, calls, errors, close: () => context.close() };
}
const dialog = (page) => page.locator('#mierdi-ranking [role="dialog"]');
const estado = (page) => page.locator('#mierdi-ranking [data-r="estado"]');
const filas = (page) => page.locator('#mierdi-ranking [data-r="lista"] li').allTextContents();
const tap = (page, sel) => page.locator(sel).tap(); // toque táctil real; espera a que el botón esté estable
const cuenta = (page) => page.evaluate(() => ({ ...window.cuenta }));
const limpiar = (page) => page.evaluate(() => { for (const k in window.cuenta) window.cuenta[k] = 0; });

test('entra en el top 5: sin teclado forzado, iniciales por toque, POST exacto, ranking resaltado y eventos aislados', async () => {
  const s = await abrir({
    get: () => json(fila(50, 40, 30, 20)),
    post: () => json([{ siglas: 'AAB', resultado: 50 }, { siglas: 'AAC', resultado: 40 }, { siglas: 'ABC', resultado: 35 }, { siglas: 'AAD', resultado: 30 }, { siglas: 'AAE', resultado: 20 }]),
  });
  try {
    await s.page.evaluate(() => window.mierdiRanking.fin(35));
    await dialog(s.page).waitFor();
    assert.equal(s.calls.get.length, 1);
    assert.match(s.calls.get[0].url, /\/rest\/v1\/mierdi_ranking\?select=ranking&id_juego=eq\.001-espejo-invertido$/);
    assert.equal(s.calls.get[0].headers.apikey, 'sb_publishable_kZd05N2bT3RFmYf_pUvDyw_jVwWXIwn');
    assert.equal(s.calls.get[0].headers.authorization, undefined);
    assert.equal(await s.page.evaluate(() => document.getElementById('mierdi-ranking').shadowRoot.activeElement?.tagName), 'DIV', 'foco en el diálogo, no en el input');
    assert.equal(await s.page.evaluate(() => document.activeElement?.id), 'mierdi-ranking');
    assert.deepEqual(await filas(s.page), ['1. AAB 50', '2. AAC 40', '3. AAD 30', '4. AAE 20', '5. --- ---']);
    await s.page.locator('#mierdi-ranking input[name="siglas"]').waitFor();
    await limpiar(s.page);
    await tap(s.page, '#mierdi-ranking input[name="siglas"]');
    await s.page.keyboard.type('abc');
    assert.equal(await s.page.locator('#mierdi-ranking input[name="siglas"]').inputValue(), 'ABC');
    await tap(s.page, '#mierdi-ranking [data-r="guardar"]');
    await s.page.locator('#mierdi-ranking [data-r="lista"] li.tu').waitFor();
    assert.deepEqual(s.calls.post.map((c) => c.body), [{ p_id_juego: '001-espejo-invertido', p_siglas: 'ABC', p_resultado: 35 }]);
    assert.match(s.calls.post[0].url, /\/rest\/v1\/rpc\/mierdi_enviar_resultado$/);
    assert.equal(await s.page.locator('#mierdi-ranking [data-r="lista"] li.tu').textContent(), '3. ABC 35');
    assert.equal(await s.page.locator('#mierdi-ranking input[name="siglas"]').isVisible(), false);
    assert.deepEqual(await cuenta(s.page), { click: 0, keydown: 0, keyup: 0, touchstart: 0, touchend: 0, pointerdown: 0 }, 'ningún evento del panel llega al juego');
    await tap(s.page, '#mierdi-ranking [data-r="cerrar"]');
    await dialog(s.page).waitFor({ state: 'hidden' });
    assert.deepEqual(s.calls.otras, []);
    assert.deepEqual(s.errors, []);
  } finally { await s.close(); }
});

test('no entra (incluido empatar con el 5º): enseña el top 5 sin formulario ni POST', async () => {
  const s = await abrir({ get: () => json(fila(50, 40, 30, 20, 10)), post: () => { throw new Error('no debe enviar'); } });
  try {
    await s.page.evaluate(() => window.mierdiRanking.fin(10));
    await dialog(s.page).waitFor();
    await s.page.waitForFunction(() => /No entras/.test(document.getElementById('mierdi-ranking').shadowRoot.querySelector('[data-r="estado"]').textContent));
    assert.equal(await s.page.locator('#mierdi-ranking input[name="siglas"]').isVisible(), false);
    assert.equal((await filas(s.page)).length, 5);
    assert.equal(s.calls.post.length, 0);
  } finally { await s.close(); }
});

test('030 ascendente: menos es mejor; 0, negativos y no finitos se ignoran sin abrir nada', async () => {
  const s = await abrir({ id: '030-brachistocrona', get: () => json(fila(2, 3, 4, 5, 6)) });
  try {
    for (const bad of ['0', '-1', 'NaN', 'Infinity', '"7"', 'undefined', '2e9']) await s.page.evaluate(`window.mierdiRanking.fin(${bad})`);
    await s.page.waitForTimeout(150);
    assert.equal(s.calls.get.length, 0);
    assert.equal(await dialog(s.page).isVisible(), false);
    await s.page.evaluate(() => window.mierdiRanking.fin(1.5));
    await s.page.locator('#mierdi-ranking input[name="siglas"]').waitFor();
    assert.equal((await filas(s.page))[0], '1. AAB 2 s');
    await s.page.evaluate(() => { window.mierdiRanking.reset(); window.mierdiRanking.fin(6); });
    await s.page.waitForFunction(() => /No entras/.test(document.getElementById('mierdi-ranking').shadowRoot.querySelector('[data-r="estado"]').textContent));
    assert.equal(s.calls.get.length, 2);
  } finally { await s.close(); }
});

test('iniciales inválidas: mensaje y ningún POST', async () => {
  const s = await abrir({ post: () => { throw new Error('no debe enviar'); } });
  try {
    await s.page.evaluate(() => window.mierdiRanking.fin(5));
    const input = s.page.locator('#mierdi-ranking input[name="siglas"]');
    await input.waitFor();
    assert.equal(await input.getAttribute('maxlength'), '3');
    for (const bad of ['a1', 'ab', 'ñab', 'é b', '   ']) {
      await input.fill(bad);
      await tap(s.page, '#mierdi-ranking [data-r="guardar"]');
      await s.page.waitForFunction(() => /3 letras/.test(document.getElementById('mierdi-ranking').shadowRoot.querySelector('[data-r="estado"]').textContent));
    }
    assert.equal(s.calls.post.length, 0);
    assert.equal(await input.isEnabled(), true);
  } finally { await s.close(); }
});

test('GET con error HTTP y GET colgado (timeout) → mensaje y REINTENTAR hasta que carga', async () => {
  const s = await abrir({ get: (n) => (n === 0 ? json({ message: 'boom' }, 500) : n === 1 ? 'colgar' : json(fila(9))) });
  try {
    await s.page.evaluate(() => { window.mierdiRanking.timeoutMs = 300; window.mierdiRanking.fin(5); });
    const retry = s.page.locator('#mierdi-ranking [data-r="reintentar"]');
    await retry.waitFor();
    assert.match(await estado(s.page).textContent(), /no disponible/i);
    await tap(s.page, '#mierdi-ranking [data-r="reintentar"]');
    await s.page.waitForFunction(() => document.getElementById('mierdi-ranking').shadowRoot.querySelector('[data-r="reintentar"]').offsetParent);
    assert.equal(s.calls.get.length, 2);
    await tap(s.page, '#mierdi-ranking [data-r="reintentar"]');
    await s.page.locator('#mierdi-ranking input[name="siglas"]').waitFor();
    assert.equal(s.calls.get.length, 3);
    assert.equal(await retry.isVisible(), false);
    assert.deepEqual(s.errors, []);
  } finally { await s.close(); }
});

test('POST con error o sin respuesta: incertidumbre, siglas bloqueadas y reintento con el MISMO payload', async () => {
  const s = await abrir({ post: (n) => (n === 0 ? json({ message: 'boom' }, 500) : n === 1 ? 'colgar' : json([{ siglas: 'XYZ', resultado: 7 }])) });
  try {
    await s.page.evaluate(() => { window.mierdiRanking.timeoutMs = 300; window.mierdiRanking.fin(7); });
    const input = s.page.locator('#mierdi-ranking input[name="siglas"]');
    await input.fill('xyz');
    await tap(s.page, '#mierdi-ranking [data-r="guardar"]');
    await s.page.waitForFunction(() => /No sé si se guardó/.test(document.getElementById('mierdi-ranking').shadowRoot.querySelector('[data-r="estado"]').textContent));
    assert.equal(await input.isDisabled(), true);
    await tap(s.page, '#mierdi-ranking [data-r="guardar"]');
    await s.page.waitForFunction(() => document.getElementById('mierdi-ranking').shadowRoot.querySelector('[data-r="estado"]').textContent.includes('No sé'));
    await s.page.waitForFunction(() => !document.getElementById('mierdi-ranking').shadowRoot.querySelector('[data-r="guardar"]').disabled);
    await tap(s.page, '#mierdi-ranking [data-r="guardar"]');
    await s.page.locator('#mierdi-ranking li.tu').waitFor();
    assert.equal(s.calls.post.length, 3);
    for (const c of s.calls.post) assert.deepEqual(c.body, { p_id_juego: '001-espejo-invertido', p_siglas: 'XYZ', p_resultado: 7 });
  } finally { await s.close(); }
});

test('doble toque en GUARDAR mientras envía: un solo POST', async () => {
  const gate = deferred();
  const s = await abrir({ post: async () => { await gate.p; return json([{ siglas: 'DOB', resultado: 3 }]); } });
  try {
    await s.page.evaluate(() => window.mierdiRanking.fin(3));
    await s.page.locator('#mierdi-ranking input[name="siglas"]').fill('dob');
    await s.page.evaluate(() => { const b = document.getElementById('mierdi-ranking').shadowRoot.querySelector('[data-r="guardar"]'); b.click(); b.click(); b.click(); });
    await s.page.waitForTimeout(100);
    gate.resolve();
    await s.page.locator('#mierdi-ranking li.tu').waitFor();
    assert.equal(s.calls.post.length, 1);
  } finally { await s.close(); }
});

test('varios intentos: callbacks terminales duplicados se ignoran por intento; reset() cierra y rearma', async () => {
  const s = await abrir({ get: () => json(fila(100)) });
  try {
    await s.page.evaluate(() => { const r = window.mierdiRanking; r.fin(10); r.fin(10); r.fin(20); });
    await dialog(s.page).waitFor();
    await s.page.waitForTimeout(100);
    await s.page.evaluate(() => window.mierdiRanking.fin(30)); // otro callback más tarde, mismo intento
    await s.page.waitForTimeout(100);
    assert.equal(s.calls.get.length, 1);
    assert.match(await estado(s.page).textContent(), /\b10\b/);
    await s.page.evaluate(() => window.mierdiRanking.reset());
    await dialog(s.page).waitFor({ state: 'hidden' });
    await s.page.evaluate(() => window.mierdiRanking.fin(30));
    await dialog(s.page).waitFor();
    await s.page.locator('#mierdi-ranking input[name="siglas"]').waitFor();
    assert.equal(s.calls.get.length, 2);
    assert.match(await estado(s.page).textContent(), /\b30\b/);
  } finally { await s.close(); }
});

test('respuestas obsoletas: un GET o POST del intento anterior no pisa el intento actual', async () => {
  const gateGet = deferred(), gatePost = deferred();
  const s = await abrir({
    get: async (n) => { if (n === 0) { await gateGet.p; return json(fila(1, 1, 1, 1, 1)); } return json(fila(500, 400, 300, 200, 100)); },
    post: async () => { await gatePost.p; return json([{ siglas: 'OLD', resultado: 999 }]); },
  });
  try {
    await s.page.evaluate(() => { window.mierdiRanking.fin(50); window.mierdiRanking.reset(); window.mierdiRanking.fin(60); });
    await s.page.waitForFunction(() => /No entras/.test(document.getElementById('mierdi-ranking').shadowRoot.querySelector('[data-r="estado"]').textContent));
    gateGet.resolve();
    await s.page.waitForTimeout(200);
    assert.equal((await filas(s.page))[0], '1. AAB 500', 'el GET viejo no se pinta');
    assert.match(await estado(s.page).textContent(), /\b60\b/);
    // POST en vuelo y reset antes de que responda.
    await s.page.evaluate(() => { window.mierdiRanking.reset(); window.mierdiRanking.fin(1000); });
    await s.page.locator('#mierdi-ranking input[name="siglas"]').fill('old');
    await tap(s.page, '#mierdi-ranking [data-r="guardar"]');
    await s.page.waitForFunction(() => document.getElementById('mierdi-ranking').shadowRoot.querySelector('[data-r="guardar"]').disabled);
    await s.page.evaluate(() => window.mierdiRanking.reset());
    gatePost.resolve();
    await s.page.waitForTimeout(200);
    assert.equal(await dialog(s.page).isVisible(), false, 'el POST viejo no reabre el panel');
    assert.deepEqual(s.errors, []);
  } finally { await s.close(); }
});

test('teclado y toques aislados; Escape/CERRAR liberan el REINTENTAR del juego y devuelven el foco', async () => {
  const s = await abrir();
  try {
    await s.page.locator('#retry').focus();
    await s.page.evaluate(() => window.mierdiRanking.fin(4));
    await s.page.locator('#mierdi-ranking input[name="siglas"]').waitFor();
    await limpiar(s.page);
    for (const k of ['ArrowLeft', 'ArrowRight', 'a', ' ', 'Enter']) await s.page.keyboard.press(k);
    await s.page.touchscreen.tap(20, 820); // fondo del overlay
    await tap(s.page, '#mierdi-ranking input[name="siglas"]');
    await s.page.keyboard.press('ArrowLeft');
    assert.deepEqual(await cuenta(s.page), { click: 0, keydown: 0, keyup: 0, touchstart: 0, touchend: 0, pointerdown: 0 });
    await s.page.keyboard.press('Escape');
    await dialog(s.page).waitFor({ state: 'hidden' });
    assert.equal(await s.page.evaluate(() => document.activeElement?.id), 'retry', 'foco devuelto');
    await tap(s.page, '#retry');
    assert.equal(await s.page.evaluate(() => window.retries), 1, 'el reintento del juego sigue funcionando');
    // CERRAR durante la carga tampoco bloquea nada.
    await s.page.evaluate(() => window.mierdiRanking.fin(4));
    await tap(s.page, '#mierdi-ranking [data-r="cerrar"]');
    await dialog(s.page).waitFor({ state: 'hidden' });
    await tap(s.page, '#retry');
    assert.equal(await s.page.evaluate(() => window.retries), 2);
  } finally { await s.close(); }
});

test('juego sin fila sembrada y datos hostiles del servidor: texto plano, sin formulario', async () => {
  const s = await abrir({ get: (n) => json(n === 0 ? [] : [{ ranking: [{ siglas: '<img src=x onerror=window.pwned=1>', resultado: 5 }] }]) });
  try {
    await s.page.evaluate(() => window.mierdiRanking.fin(3));
    await s.page.locator('#mierdi-ranking [data-r="reintentar"]').waitFor();
    assert.match(await estado(s.page).textContent(), /no disponible/i);
    assert.equal(await s.page.locator('#mierdi-ranking input[name="siglas"]').isVisible(), false);
    await tap(s.page, '#mierdi-ranking [data-r="reintentar"]');
    await s.page.waitForFunction(() => /entra en el top 5/.test(document.getElementById('mierdi-ranking').shadowRoot.querySelector('[data-r="estado"]').textContent));
    assert.equal(await s.page.evaluate(() => document.getElementById('mierdi-ranking').shadowRoot.querySelectorAll('img').length), 0);
    assert.equal(await s.page.evaluate(() => window.pwned), undefined);
    assert.match((await filas(s.page))[0], /<img/);
  } finally { await s.close(); }
});
