// Vercel Web Analytics: home (Layout.astro → /analytics.js) y juegos estáticos (/ranking.js → /analytics.js).
// Chromium REAL; mierdijuegos.com, el script de Vercel y Supabase están MOCKEADOS con route.fulfill:
// ninguna petición sale a la red y no se envía telemetría real.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { REPO_ROOT } from '../scripts/lib/paths.mjs';
import { servePublic } from '../scripts/lib/smoke.mjs';

const layout = readFileSync(join(REPO_ROOT, 'src/layouts/Layout.astro'), 'utf8');
const pub = (f) => join(REPO_ROOT, 'public', f);
const INSIGHTS = '/_vercel/insights/script.js';
const SUPA = 'https://grldrwbiovglfxqjdicv.supabase.co';
const GAME = readFileSync(join(REPO_ROOT, 'test/fixtures/test-only-good-game.html'), 'utf8');
// La home es Layout.astro: su etiqueta de analítica tal como sale compilada (is:inline no la toca).
const HOME_TAG = '<script defer src="/analytics.js"></script>';
const HOME = `<!doctype html><html lang="es"><head><title>Mierdijuegos</title>${HOME_TAG}</head><body><h1>home</h1></body></html>`;
// Sustituto del script oficial: registra su ejecución y manda una "vista" como la de Vercel.
const FAKE_VERCEL = `window.__vercelRuns=(window.__vercelRuns||0)+1;
navigator.sendBeacon('/_vercel/insights/view',JSON.stringify({o:location.href,r:document.referrer,q:(window.vaq||[]).map(a=>[...a])}));`;

test('Layout carga /analytics.js con is:inline y sin el tracker antiguo del VPS', () => {
  assert.match(layout, /<script is:inline defer src="\/analytics\.js"><\/script>/);
  assert.doesNotMatch(layout, /vps-dee05c78|data-website-id/);
});

test('ranking.js carga /analytics.js solo en producción y analytics.js usa el script oficial same-origin', () => {
  assert.ok(existsSync(pub('analytics.js')), 'falta public/analytics.js');
  const a = readFileSync(pub('analytics.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(a.includes(INSIGHTS) && a.includes('mierdijuegos.com'));
  assert.doesNotMatch(a, /localStorage|document\.cookie|sessionStorage|va\(\s*'event'|track\(/);
  const r = readFileSync(pub('ranking.js'), 'utf8');
  assert.ok(r.includes("'/analytics.js'") && r.includes('mierdijuegos'));
});

let browser, server;
before(async () => {
  server = await servePublic(REPO_ROOT);
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await server?.close(); });

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
const json = (body) => ({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });

// origin: 'https://mierdijuegos.com' (producción simulada) o null (servidor local 127.0.0.1).
async function abrir({ origin = 'https://mierdijuegos.com', path, bloquearVercel = false }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const base = origin || server.url;
  const log = { analytics: 0, insights: 0, views: [], supabase: [], otras: [] };
  await context.route('**/*', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.origin === base) {
      if (u.pathname === '/analytics.js') log.analytics++;
      if (u.pathname === INSIGHTS) {
        log.insights++;
        if (bloquearVercel) return route.abort('blockedbyclient');
        return route.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_VERCEL });
      }
      if (u.pathname.startsWith('/_vercel/')) { log.views.push(req.postData() || ''); return route.fulfill({ status: 200, body: '' }); }
      const fijo = { '/': HOME, '/games/test/': GAME }[u.pathname];
      if (!origin && !fijo) return route.continue();
      const body = fijo || readFileSync(pub(u.pathname.slice(1)));
      const type = u.pathname.endsWith('.js') ? 'application/javascript' : 'text/html; charset=utf-8';
      return route.fulfill({ status: 200, contentType: type, body });
    }
    if (u.origin === SUPA) {
      log.supabase.push(req.postData() || '');
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (req.method() === 'GET') return route.fulfill(json([{ ranking: [] }]));
      if (u.pathname !== '/functions/v1/mierdi-ranking') { log.otras.push(req.url()); return route.abort(); }
      const b = JSON.parse(req.postData());
      return route.fulfill(json([{ siglas: b.p_siglas, resultado: b.p_resultado }]));
    }
    log.otras.push(req.url());
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + path, { waitUntil: 'load' });
  return { page, log, errors, close: () => context.close() };
}
const scripts = (page, src) => page.evaluate((s) => document.querySelectorAll(`script[src="${s}"]`).length, src);

test('home en producción: un solo script de Vercel, una vista y nada del tracker antiguo', async () => {
  const s = await abrir({ path: '/' });
  try {
    await s.page.waitForFunction(() => window.__vercelRuns === 1);
    // Reevaluar el bootstrap no duplica nada.
    await s.page.addScriptTag({ url: '/analytics.js' });
    await s.page.waitForTimeout(150);
    assert.equal(await scripts(s.page, INSIGHTS), 1);
    assert.equal(await s.page.evaluate(() => window.__vercelRuns), 1);
    assert.equal(await s.page.evaluate(() => typeof window.va), 'function');
    assert.equal(s.log.views.length, 1);
    assert.deepEqual(s.log.otras, []);
    assert.equal(await s.page.evaluate(() => document.cookie + localStorage.length + sessionStorage.length), '00');
    assert.deepEqual(s.errors, []);
  } finally { await s.close(); }
});

test('juego en producción: ranking.js inyecta analytics una vez, el ranking va igual y la vista no lleva siglas ni resultado', async () => {
  const s = await abrir({ path: '/games/test/' });
  try {
    await s.page.waitForFunction(() => window.__vercelRuns === 1 && window.mierdiRanking);
    assert.equal(await scripts(s.page, '/analytics.js'), 1);
    assert.equal(await scripts(s.page, INSIGHTS), 1);
    await s.page.evaluate(() => window.mierdiRanking.fin(4321));
    await s.page.locator('#mierdi-ranking input[name="siglas"]').fill('qzx');
    await s.page.locator('#mierdi-ranking [data-r="guardar"]').click();
    await s.page.locator('#mierdi-ranking li.tu').waitFor();
    assert.ok(s.log.supabase.some((b) => b.includes('QZX') && b.includes('4321')), 'el ranking debe enviar a Supabase como siempre');
    assert.equal(s.log.views.length, 1);
    for (const v of s.log.views) assert.doesNotMatch(v, /QZX|qzx|4321|supabase|apikey/i);
    assert.equal(s.log.analytics, 1);
    assert.deepEqual(s.log.otras, []);
    assert.deepEqual(s.errors, []);
  } finally { await s.close(); }
});

test('Vercel bloqueado: el juego y el ranking siguen funcionando sin errores', async () => {
  const s = await abrir({ path: '/games/test/', bloquearVercel: true });
  try {
    await s.page.waitForFunction(() => window.mierdiRanking);
    await s.page.waitForTimeout(150);
    assert.equal(s.log.insights, 1);
    await s.page.locator('[data-action="start"]').click();
    await s.page.waitForFunction(() => window.mierdiTest?.state() === 'playing');
    await s.page.evaluate(() => window.mierdiTest.forceGameOver());
    await s.page.locator('#mierdi-ranking [role="dialog"]').waitFor();
    assert.equal(s.log.views.length, 0);
    assert.deepEqual(s.errors, []);
  } finally { await s.close(); }
});

test('www en producción sí carga; un preview *.vercel.app queda inerte', async () => {
  for (const [origin, n] of [['https://www.mierdijuegos.com', 1], ['https://mierdijuegos-abc123.vercel.app', 0]]) {
    const s = await abrir({ origin, path: '/games/test/' });
    try {
      await s.page.waitForFunction(() => window.mierdiRanking);
      await s.page.waitForTimeout(200);
      assert.equal(s.log.insights, n, origin);
      assert.equal(s.log.views.length, n, origin);
      assert.deepEqual(s.errors, [], origin);
    } finally { await s.close(); }
  }
});

test('local (127.0.0.1): ni la home ni los juegos piden el script de Vercel ni envían nada', async () => {
  for (const path of ['/', '/games/test/', '/games/034-topologico/']) {
    const s = await abrir({ origin: null, path });
    try {
      await s.page.waitForTimeout(300);
      assert.equal(s.log.insights, 0, path);
      assert.equal(s.log.views.length, 0, path);
      assert.equal(await s.page.evaluate(() => typeof window.va), 'undefined', path);
      assert.equal(await scripts(s.page, INSIGHTS), 0, path);
      assert.deepEqual(s.errors, [], path);
    } finally { await s.close(); }
  }
});
