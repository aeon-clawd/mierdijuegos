// Chromium REAL (móvil) en cada juego del catálogo con el ranking.js real y Supabase MOCKEADO.
// Pulsa los botones reales de JUGAR/REINTENTAR (incluidos los que el juego genera con innerHTML)
// y dispara la función terminal real desde fuera. Comprueba que fin() recibe el valor real, que
// los fines duplicados no abren otro ranking y que reintentar lo rearma.
// Límite: el fin se provoca llamando a la función terminal del juego (o poniendo su condición, 031);
// no demuestra que se pueda ganar/perder jugando ni la diversión.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { REPO_ROOT } from '../scripts/lib/paths.mjs';
import { servePublic } from '../scripts/lib/smoke.mjs';
import { FIN } from './ranking-fin.mjs';

const OC = '[onclick="startGame()"]';
const MT = { start: '[data-action="start"]', retry: '[data-action="retry"]' };
// end: JS que pone un resultado reconocible y llama al fin real. expect: valor que debe llegar a fin().
const S = (end, extra = {}) => ({ end: `score=4321;${end}`, expect: 4321, ...extra });
const GAMES = {
  '001-espejo-invertido': S('endGame()', { start: '#btn-start', retry: '#btn-retry' }),
  '002-memoria-ciega': S('endGame(false)', { start: '#btn-start', retry: '#btn-retry' }),
  '003-gravedad-liquida': S('endGame()', { start: '#btn-start', retry: '#btn-retry' }),
  '004-ritmo-caotico': S('endGame()', { start: '#btn-start', retry: '#btn-retry' }),
  // 005 y 028 viven dentro de una IIFE: no se puede llamar a su fin desde fuera, así que se espera a que
  // el jugador quieto muera de verdad y se compara con la puntuación final que pinta el propio juego.
  '005-eco-temporal': { start: '#sbtn', retry: '#rbtn', natural: '#fscore' }, // overlay a los 700 ms
  '006-latido': { start: OC, retry: OC, end: "game.score=4321;game.die('x')", expect: 4321 }, // overlay a los 800 ms
  '007-peso-muerto': S('gameOver()', { start: OC, retry: OC }),
  '008-tres-cuerpos': S("state='gameover';showGameOver()", { start: '#start-btn', retry: '#retry-btn' }),
  '009-chladni': S('gameOver()', { start: '#bs', retry: '#br' }),
  '010-pulsar': S('gameOver()', { start: '#btn-start', retry: '#btn-retry' }),
  // PREEXISTENTE (3412ee1): #overlay-end conserva class="hidden" (!important) y su REINTENTAR nunca se ve.
  '011-refraccion': S('onGameOver()', { start: '#btn-start', retry: '#btn-retry', dispatch: true }),
  '012-efecto-doppler': S('doGameOver()', { start: '#sb2', retry: '#rb' }),
  '013-demonio-maxwell': S('over()', { start: '[onclick="init()"]', retry: '[onclick="init()"]' }),
  // PREEXISTENTE (3412ee1): la barra táctil #ctrl tapa REINTENTAR a 390×844.
  '014-automata': S('gameOver()', { start: OC, retry: OC, dispatch: true }),
  '015-fourier': S('gameOver()', { start: '#startBtn', retry: '#retryBtn' }),
  '016-morfogenesis': S("endGame('time')", { start: '#start-btn', retry: OC }),
  '017-lissajous': S('endGame()', { start: '#btn-start', retry: '#btn-retry' }),
  '018-ising': S('endGame()', { start: '#start-btn', retry: '#retry-btn' }),
  '019-bloqueo-mareal': S('gameOver()', { start: '#btn-start', retry: '#btn-retry' }),
  '020-bifurcacion': S('endGame()', { start: OC, retry: OC }),
  '021-soliton': S('gameOver()', { start: '#start-btn', retry: '[onclick="location.reload()"]', reload: true }), // reintento = recarga
  '022-penrose': S('endGame()', { start: OC, retry: OC }),
  '023-eigenvalor': S('gameOver()', { start: '#btn-start', retry: '#btn-retry' }),
  '024-efecto-tunel': S('endGame()', { start: '#btn-start', retry: '#btn-retry' }),
  '025-eco-espin': S('endGame()', { start: '#startBtn', retry: '#retryBtn' }),
  '026-apolonio': S('endGame()', { start: '#btnStart', retry: '#btnRetry' }),
  '027-percolacion': S('endGame(false)', { start: '#btn-start', retry: '#btn-retry' }),
  '028-geodesica': { start: '#btn-start', retry: '#btn-retry', natural: '#final-score', tap: true }, // dispara tocando hasta fallar 3 veces
  '029-cristal-de-tiempo': S("gameState='over';showGameOver()", { start: '#btn-start', retry: '#btn-retry' }),
  // Solo la rama de éxito (bola en la meta) envía; ascendente.
  '030-brachistocrona': { start: OC, retry: '[onclick="resetGame()"]', end: 'ballPosition={x:END_X,y:END_Y};currentTime=1.234;finishSimulation()', expect: 1.23,
    fail: 'ballPosition={x:END_X-200,y:END_Y-200};currentTime=10.02;finishSimulation()' },
  '031-fase-de-berry': { start: OC, retry: 'body', end: 'score=4321;health=0', expect: 4321, reload: true }, // transición en el bucle; reintento = clic en document → recarga
  '032-resonancia-forzada': S('endGame()', { start: OC, retry: OC }),
  '033-mobius-persecucion': S('gameRunning=false;endGame()', { start: OC, retry: OC }),
  '034-topologico': { start: '.play-button', retry: '.retry-button', end: 'gameState.score=4321;endGame()', expect: 4321 },
  '035-ventanilla-tres': S('mierdiTest.forceGameOver()', MT),
  '036-tortilla-al-vuelo': { ...MT, end: 'mierdiTest.forceGameOver()', expect: 'mierdiTest.score()' }, // IIFE: no se puede fijar score
  '037-rebano-rebelde': S('endGame()', MT),
};

let browser, server;
before(async () => {
  server = await servePublic(REPO_ROOT);
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await server?.close(); });

const SUPA = 'https://grldrwbiovglfxqjdicv.supabase.co/';
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };

test('hay un caso de navegador por cada juego cableado', () => assert.deepEqual(Object.keys(GAMES).sort(), Object.keys(FIN).sort()));

// Cada juego en su propio contexto: se ejecutan en paralelo para que npm test siga siendo rápido.
describe('fin real por juego', { concurrency: 8 }, () => {
for (const [id, g] of Object.entries(GAMES)) {
  test(`fin real de ${id}: fin(${FIN[id]}) una vez por partida y REINTENTAR lo rearma`, async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const gets = [];
    await context.route('**/*', (route) => {
      const u = route.request().url();
      if (u.startsWith(server.url + '/')) return route.continue();
      if (u.startsWith(SUPA)) {
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        gets.push(u);
        return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: '[{"ranking":[]}]' });
      }
      return route.abort(); // fuentes/analítica históricas
    });
    // Instrumentación SOLO de test: envuelve el módulo real para registrar llamadas (sigue funcionando igual).
    await context.addInitScript(() => {
      window.__fins = []; window.__resets = 0;
      let real;
      Object.defineProperty(window, 'mierdiRanking', {
        configurable: true,
        get: () => real,
        set: (v) => {
          real = { ...v, reset: () => { window.__resets++; v.reset(); }, fin: (r) => { window.__fins.push(r); v.fin(r); } };
          Object.defineProperty(real, 'timeoutMs', { get: () => v.timeoutMs, set: (t) => { v.timeoutMs = t; } });
        },
      });
      // Congelador de requestAnimationFrame (SOLO test): entre el clic real de JUGAR y el fin inyectado no
      // corre ningún frame, así el juego no puede terminar solo (p. ej. 001: obstáculo que nace encima).
      const raf = window.requestAnimationFrame.bind(window), caf = window.cancelAnimationFrame.bind(window);
      let held = null, next = 1e9;
      window.requestAnimationFrame = (cb) => { if (!held) return raf(cb); held.set(++next, cb); return next; };
      window.cancelAnimationFrame = (id) => (held?.delete(id) ? undefined : caf(id));
      // Espera dos frames nativos: cualquier callback ya programado se ejecuta y queda reencolado en held.
      window.__holdRaf = () => { held ??= new Map(); return new Promise((r) => raf(() => raf(r))); };
      window.__releaseRaf = () => { const q = held ? [...held.values()] : []; held = null; q.forEach((cb) => raf(cb)); };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const dialog = page.locator('#mierdi-ranking [role="dialog"]');
    const click = (sel) => page.locator(sel).locator('visible=true').first().click();
    const retry = () => (g.dispatch ? page.locator(g.retry).last().dispatchEvent('click') : click(g.retry));
    // tap: juega de verdad tocando el canvas (disparos) hasta que el juego termina solo.
    const end = async () => {
      if (!g.natural) return page.evaluate(g.end);
      const n = await page.evaluate(() => window.__fins.length);
      for (let i = 0; g.tap && i < 60 && await page.evaluate((k) => window.__fins.length === k, n); i++) {
        await page.touchscreen.tap(30 + (i % 5) * 70, 200 + (i % 3) * 150).catch(() => {});
        await page.waitForTimeout(400);
      }
    };
    // Juegos con fin inyectado: clic real + fin sin frames de por medio. Los naturales juegan con RAF libre.
    const play = async (act) => {
      if (!g.natural) await page.evaluate(() => window.__holdRaf());
      await act();
      await end();
      if (!g.natural) await page.evaluate(() => window.__releaseRaf());
    };
    const T = g.natural ? 60000 : 4000;
    const fins = () => page.evaluate(() => window.__fins);
    try {
      await page.goto(`${server.url}/games/${id}/`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.mierdiRanking);
      if (g.fail) {
        await click(g.start);
        await page.evaluate(g.fail);
        await page.waitForTimeout(150);
        assert.deepEqual(await fins(), [], 'un intento fallido no envía');
        await play(() => click(g.retry)); // resetGame() vuelve directo a jugar: no hay JUGAR que pulsar
      } else await play(() => click(g.start));
      assert.ok(await page.evaluate(() => window.__resets) >= 1, 'JUGAR llama a reset()');
      await page.waitForFunction(() => window.__fins.length > 0, null, { timeout: T });
      const expected = g.natural ? Number.parseInt(await page.locator(g.natural).textContent(), 10)
        : typeof g.expect === 'number' ? g.expect : await page.evaluate(g.expect);
      assert.deepEqual(await fins(), [expected]);
      await dialog.waitFor();
      // Fin duplicado en la misma partida: no abre otro ranking.
      if (!g.natural) { await page.evaluate(g.end).catch(() => {}); await page.waitForTimeout(g.end.includes('die(') ? 900 : 150); }
      assert.equal(gets.length, 1, 'un solo GET por partida');
      await page.locator('#mierdi-ranking [data-r="cerrar"]').click();
      await dialog.waitFor({ state: 'hidden' });
      // REINTENTAR real del juego (puede recargar la página: 021, 031).
      if (g.reload) {
        await Promise.all([page.waitForNavigation(), retry()]);
        await page.waitForFunction(() => window.mierdiRanking);
        await play(() => click(g.start));
      } else await play(retry);
      assert.ok(await page.evaluate(() => window.__resets) >= 1);
      await dialog.waitFor({ timeout: T });
      assert.equal(gets.length, 2, 'la segunda partida vuelve a abrir el ranking');
      assert.ok(gets.every((u) => u.endsWith(`id_juego=eq.${id}`)));
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}
});
