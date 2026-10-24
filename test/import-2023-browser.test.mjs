// Chromium REAL en móvil (390×844, táctil) para los seis juegos importados de 2023 y para la portada
// compilada con Astro real. Supabase está MOCKEADO (GET → top 5 vacío, RPC → eco): nada sale a la red
// y no se escribe en ninguna base de datos. Instrumentación SOLO de test, declarada en addInitScript:
// Math.random con semilla (partidas deterministas), envoltura de window.mierdiRanking (cuenta reset/fin)
// y un AudioContext espía que delega en el real (registra osciladores y frecuencias).
// Límite: termina de forma natural (colisión, fallo o tiempo agotado) donde cabe en un test; 043 se fuerza
// con mierdiTest.forceGameOver (= endGame real) porque su sesión dura 3 minutos. No prueba la diversión.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, symlinkSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { REPO_ROOT, repoPaths } from '../scripts/lib/paths.mjs';
import { servePublic } from '../scripts/lib/smoke.mjs';
import { command } from '../scripts/lib/command.mjs';
import { loadCatalog } from '../scripts/lib/catalog.mjs';
import { sortGamesNewestFirst } from '../src/lib/games.mjs';

const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'src/imports/diug22-mierdijuegos-2023/manifest.json'), 'utf8'));
const SUPA = 'https://grldrwbiovglfxqjdicv.supabase.co/';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' };

let browser, server;
before(async () => {
  server = await servePublic(REPO_ROOT);
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await server?.close(); });

function instrument(seed) {
  // Semilla (mulberry32): mismas partidas en cada ejecución.
  let a = seed >>> 0;
  Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  window.__fins = []; window.__resets = 0;
  let real;
  Object.defineProperty(window, 'mierdiRanking', {
    configurable: true,
    get: () => real,
    set: (v) => { real = { ...v, reset: () => { window.__resets++; v.reset(); }, fin: (r) => { window.__fins.push(r); v.fin(r); } }; },
  });
  window.__audio = { contexts: 0, tones: [] };
  const Real = window.AudioContext;
  if (Real) {
    window.AudioContext = class extends Real {
      constructor(...x) { super(...x); window.__audio.contexts++; }
      createOscillator() {
        const o = super.createOscillator(); const start = o.start.bind(o);
        o.start = (...y) => { window.__audio.tones.push(o.frequency.value); return start(...y); };
        return o;
      }
    };
    window.webkitAudioContext = window.AudioContext;
  }
}

async function open(id, seed) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const net = { gets: 0, posts: [], external: [] };
  await context.route('**/*', (route) => {
    const req = route.request(); const u = req.url();
    if (u.startsWith(server.url + '/')) return route.continue();
    if (u.startsWith(SUPA)) { // MOCK de Supabase
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const json = (b) => route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(b) });
      if (req.method() === 'GET') { net.gets++; return json([{ ranking: [] }]); }
      const b = JSON.parse(req.postData() || '{}'); net.posts.push(b);
      return json([{ siglas: b.p_siglas, resultado: b.p_resultado }]);
    }
    net.external.push(u); return route.abort();
  });
  await context.addInitScript(instrument, seed);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const res = await page.goto(`${server.url}/games/${id}/`, { waitUntil: 'load' });
  assert.equal(res.status(), 200);
  await page.waitForFunction(() => window.mierdiRanking && window.mierdiTest);
  const T = {
    id, page, net, errors,
    state: () => page.evaluate(() => window.mierdiTest.state()),
    score: () => page.evaluate(() => window.mierdiTest.score()),
    inputs: () => page.evaluate(() => window.mierdiTest.inputs()),
    view: () => page.evaluate(() => window.mierdiTest.view()),
    fins: () => page.evaluate(() => window.__fins),
    resets: () => page.evaluate(() => window.__resets),
    until: (s, timeout = 60000) => page.waitForFunction((x) => window.mierdiTest.state() === x, s, { timeout, polling: 100 }),
    tap: (x, y) => page.touchscreen.tap(x, y),
    drag: async (a, b, steps = 6) => { await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps }); await page.mouse.up(); },
    close: () => context.close(),
  };
  return T;
}

// Pantalla inicial, JUGAR real, y comprobaciones comunes de fin → ranking → REINTENTAR.
async function start(T, g) {
  assert.equal(await T.state(), 'menu');
  const menu = await T.page.locator('#menu').innerText();
  assert.ok(menu.includes(g.originalDate) && menu.includes('diug22/Mierdijuegos'), 'procedencia visible antes de jugar');
  await T.page.locator('[data-action="start"]').click();
  await T.until('playing', 3000);
  assert.equal(await T.resets(), 1, 'JUGAR llama a reset()');
}
async function ended(T, round) {
  await T.until('over');
  const score = await T.score();
  const fins = await T.fins();
  assert.equal(fins.length, round, 'un solo fin() por partida');
  assert.equal(fins.at(-1), score, 'fin() recibe la puntuación real');
  assert.ok((await T.page.locator('#over').innerText()).includes(String(score)), 'la pantalla final muestra el resultado');
  const dialog = T.page.locator('#mierdi-ranking [role="dialog"]');
  await dialog.waitFor({ timeout: 5000 });
  const estado = T.page.locator('#mierdi-ranking [data-r="estado"]');
  await T.page.waitForFunction(() => /top 5!|No entras/.test(document.querySelector('#mierdi-ranking').shadowRoot.querySelector('[data-r=estado]').textContent));
  assert.equal(T.net.gets, round, 'el ranking (mock) se consulta una vez por partida');
  if (round === 1) { // primera partida: guarda iniciales contra el MOCK de la RPC
    await T.page.locator('#mierdi-ranking input[name="siglas"]').fill('tst');
    await T.page.locator('#mierdi-ranking [data-r="guardar"]').click();
    await T.page.locator('#mierdi-ranking li.tu').waitFor({ timeout: 5000 });
    assert.match(await estado.innerText(), /Guardado/);
    assert.deepEqual(T.net.posts, [{ p_id_juego: T.id, p_siglas: 'TST', p_resultado: score }]);
  }
  await T.page.locator('#mierdi-ranking [data-r="cerrar"]').click();
  await dialog.waitFor({ state: 'hidden' });
  return score;
}
async function retry(T, round) {
  await T.page.locator('[data-action="retry"]').click();
  await T.until('playing', 3000);
  assert.equal(await T.resets(), round, 'REINTENTAR vuelve a llamar a reset()');
  assert.equal(await T.score(), 0, 'REINTENTAR empieza de cero');
}
async function finish(T) {
  assert.equal(await T.page.locator('[data-action="back"]').getAttribute('href'), '/');
  assert.deepEqual(T.errors, []);
  assert.deepEqual(T.net.external, [], 'sin peticiones externas');
  assert.equal(T.net.posts.length, 1, 'solo la primera partida guardó (mock); nada real');
}
const G = (id) => manifest.games.find((g) => g.targetId === id);

const CASES = {
  // Toque = cambia de dirección. Fin natural: sin tocar, la bola acaba chocando con una barra.
  '038-zigzag-salto': async (T, g) => {
    await start(T, g);
    const before = await T.view();
    await T.tap(195, 600);
    await T.page.waitForTimeout(100);
    assert.equal((await T.view()).dir, -before.dir, 'tocar invierte el zigzag');
    assert.equal(await T.inputs(), 1);
    const s1 = await ended(T, 1);
    assert.ok(s1 > 0, 'puntos por tiempo/barras superadas');
    await retry(T, 2);
    await ended(T, 2);
  },
  // Toque a un lado = paso de 50 px hacia ese lado. Fin natural: un asteroide golpea a la nave quieta.
  '039-cazador-de-estrellas': async (T, g) => {
    await start(T, g);
    const x0 = (await T.view()).px;
    await T.tap(5, 500);
    assert.equal((await T.view()).px, x0 - 50, 'toque a la izquierda: 50 px a la izquierda');
    await T.tap(385, 500);
    assert.equal((await T.view()).px, x0, 'toque a la derecha: vuelve');
    assert.equal(await T.inputs(), 2);
    await ended(T, 1);
    await retry(T, 2);
    await ended(T, 2);
  },
  // Arrastres reales entre qubits hasta completar la red (10 conexiones); fin natural: se agota el minuto.
  '040-conexion-cuantica': async (T, g) => {
    await start(T, g);
    const { qubits } = await T.view();
    assert.equal(qubits.length, 5);
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) await T.drag(qubits[i], qubits[j]);
    const v = await T.view();
    assert.equal(v.redes, 1, 'red completa (todas las parejas) cuenta y genera otra');
    assert.equal(await T.score(), 10, 'puntuación = conexiones');
    assert.notDeepEqual(v.qubits, qubits, 'nueva red');
    await T.drag(v.qubits[0], v.qubits[0]); // soltar en el mismo qubit no conecta
    assert.equal(await T.score(), 10);
    assert.ok(v.left <= 60 && v.left > 0);
    const s = await ended(T, 1); // tiempo agotado de verdad (60 s)
    assert.equal(s, 10);
    await retry(T, 2);
    await T.page.evaluate(() => window.mierdiTest.forceGameOver()); // FORZADO (2.ª ronda): solo rearme del ranking
    await ended(T, 2);
  },
  // Tocar la celda distinta: +1, rejilla mayor, +1 s. Fallar termina (natural). Ronda 2: se agota el tiempo.
  '041-colorblitz': async (T, g) => {
    await start(T, g);
    const cell = (v, k) => ({ x: v.board.x + ((k % v.grid) + 0.5) * v.board.size / v.grid, y: v.board.y + (Math.floor(k / v.grid) + 0.5) * v.board.size / v.grid });
    for (let n = 1; n <= 3; n++) {
      const v = await T.view();
      await T.tap(cell(v, v.odd).x, cell(v, v.odd).y);
      assert.equal(await T.score(), n);
      assert.equal((await T.view()).grid, 3 + n);
    }
    const v = await T.view();
    await T.tap(cell(v, (v.odd + 1) % (v.grid * v.grid)).x, cell(v, (v.odd + 1) % (v.grid * v.grid)).y);
    assert.equal(await ended(T, 1), 3);
    await retry(T, 2);
    assert.equal((await T.view()).grid, 3);
    assert.equal(await ended(T, 2), 0); // 10 s sin tocar: fin por tiempo
  },
  // Toque = el surfista avanza un 10 % hacia el dedo. Fin natural: obstáculo encima del surfista quieto.
  '042-wave-river': async (T, g) => {
    await start(T, g);
    const x0 = (await T.view()).sx;
    await T.tap(x0 + 200, 400);
    const x1 = (await T.view()).sx;
    assert.ok(x1 > x0 + 15 && x1 < x0 + 25, `10 % hacia el toque (${x0} → ${x1})`);
    await ended(T, 1);
    await retry(T, 2);
    await ended(T, 2);
  },
  // Audio real tras gesto, tono = distancia por el laberinto, deslizar mueve, toque no mueve, silencio.
  '043-sound-scape': async (T, g) => {
    assert.equal(await T.page.evaluate(() => window.__audio.contexts), 0, 'ningún AudioContext antes del gesto');
    await start(T, g);
    assert.equal(await T.page.evaluate(() => window.__audio.contexts), 1, 'AudioContext creado con el gesto de JUGAR');
    const tones = () => T.page.evaluate(() => window.__audio.tones);
    let v = await T.view();
    const p0 = v.player;
    await T.tap(195, 500);
    assert.deepEqual((await T.view()).player, p0, 'un toque solo escucha, no mueve');
    assert.deepEqual(await tones(), [Math.fround(v.scale[Math.min(v.path, v.scale.length - 1)])], 'tono según la distancia A* a la salida');
    // Silencio: el toque ya no suena; al reactivar vuelve a sonar.
    await T.page.locator('#mute').click();
    assert.equal(await T.page.locator('#mute').getAttribute('aria-pressed'), 'true');
    await T.tap(195, 500);
    assert.equal((await tones()).length, 1, 'silenciado: sin tono');
    await T.page.locator('#mute').click();
    // Recorre el camino más corto con deslizamientos reales hasta la salida.
    v = await T.view();
    const route = shortest(v.maze, v.player, v.exit);
    const D = { '1,0': [80, 0], '-1,0': [-80, 0], '0,1': [0, 80], '0,-1': [0, -80] };
    for (let k = 1; k < route.length; k++) {
      const [dx, dy] = D[`${route[k].x - route[k - 1].x},${route[k].y - route[k - 1].y}`];
      await T.drag({ x: 195, y: 450 }, { x: 195 + dx, y: 450 + dy }, 4);
      if (k < route.length - 1) assert.deepEqual((await T.view()).player, route[k]);
    }
    assert.equal(await T.score(), 1, 'salir del laberinto suma 1');
    const t = await tones();
    assert.ok(t.length >= route.length, 'cada gesto escucha su posición');
    assert.ok(t.at(-1) <= t[1], 'más cerca de la salida = más grave');
    const left = (await T.view()).left;
    await T.page.waitForTimeout(1200);
    assert.ok((await T.view()).left < left - 0.8, 'el reloj de la sesión corre');
    await T.page.evaluate(() => window.mierdiTest.forceGameOver()); // FORZADO: la sesión dura 180 s
    assert.equal(await ended(T, 1), 1);
    await retry(T, 2);
    await T.page.evaluate(() => window.mierdiTest.forceGameOver());
    await ended(T, 2);
  },
};

function shortest(maze, from, to) {
  const key = (p) => `${p.x},${p.y}`;
  const prev = new Map([[key(from), null]]);
  const q = [from];
  while (q.length) {
    const c = q.shift();
    if (c.x === to.x && c.y === to.y) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: c.x + dx, y: c.y + dy };
      if (n.y < 0 || n.y >= maze.length || n.x < 0 || n.x >= maze[0].length || maze[n.y][n.x] !== 0 || prev.has(key(n))) continue;
      prev.set(key(n), c); q.push(n);
    }
  }
  const out = [];
  for (let c = to; c; c = prev.get(key(c))) out.unshift(c);
  return out;
}

test('hay un caso de navegador por cada juego del manifiesto', () => {
  assert.deepEqual(Object.keys(CASES), manifest.games.map((g) => g.targetId));
});

describe('juegos importados en Chromium móvil (Supabase MOCK)', { concurrency: 6 }, () => {
  manifest.games.forEach((g, i) => {
    test(`${g.targetId}: JUGAR, entrada real, fin, ranking (mock) y REINTENTAR`, { timeout: 120000 }, async () => {
      const T = await open(g.targetId, 1000 + i);
      try {
        await CASES[g.targetId](T, g);
        await finish(T);
      } finally { await T.close(); }
    });
  });

});

test('portada compilada (Astro real): 037 sigue siendo el del día y los seis aparecen con su fecha y origen', { timeout: 180000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'mierdi-import-home-'));
  for (const n of ['public', 'src', 'package.json', 'package-lock.json', 'astro.config.mjs', 'tsconfig.json']) cpSync(join(REPO_ROOT, n), join(root, n), { recursive: true });
  symlinkSync(join(REPO_ROOT, 'node_modules'), join(root, 'node_modules'), 'dir');
  mkdirSync(join(root, '.local'), { recursive: true });
  await command('npm', ['run', 'build'], { cwd: root, timeout: 150000, log: join(root, '.local', 'build.log') });
  const site = join(root, 'site');
  mkdirSync(site);
  symlinkSync(join(root, 'dist'), join(site, 'public'), 'dir');
  const home = await servePublic(site);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.route('**/*', (r) => (r.request().url().startsWith(home.url + '/') ? r.continue() : r.abort()));
  try {
    const page = await context.newPage();
    await page.goto(home.url, { waitUntil: 'load' });
    const catalog = sortGamesNewestFirst(loadCatalog(repoPaths().catalog));
    assert.equal(await page.locator('.today-card').getAttribute('href'), `/games/${catalog[0].id}/`);
    assert.ok(!manifest.games.some((g) => g.targetId === catalog[0].id));
    const hrefs = await page.locator('.archive-card').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    assert.deepEqual(hrefs, catalog.slice(1).map((g) => `/games/${g.id}/`), 'archivo ordenado por fecha');
    for (const g of manifest.games) {
      const card = page.locator(`.archive-card[href="/games/${g.targetId}/"]`);
      const text = await card.innerText();
      assert.ok(text.includes(g.title) && text.includes(g.originalDate), `${g.targetId}: título y fecha visibles`);
      assert.match(text, /2023/);
      assert.match(await card.locator('.origin').innerText(), /diug22/);
    }
    assert.equal(await page.locator('.archive-card .origin').count(), 6, 'solo los importados llevan etiqueta de origen');
    // Cada tarjeta importada lleva a su juego compilado.
    for (const g of manifest.games) {
      const r = await page.request.get(`${home.url}/games/${g.targetId}/`);
      assert.equal(r.status(), 200);
      assert.match(await r.text(), new RegExp(`<title>${g.title}`));
    }
    await page.screenshot({ path: join(REPO_ROOT, '.local/import-verification/home-mobile.png'), fullPage: true }).catch(() => {});
  } finally { await context.close(); await home.close(); }
});
