import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateNewGameHtml, MAX_NEW_GAME_BYTES, RANKING_SCRIPT } from '../scripts/lib/game-html.mjs';
import { readGeneratorOutput } from '../scripts/lib/generator-output.mjs';
import { loadCatalog, validateCatalog } from '../scripts/lib/catalog.mjs';
import { repoPaths } from '../scripts/lib/paths.mjs';

const good = readFileSync(new URL('./fixtures/test-only-good-game.html', import.meta.url), 'utf8');
const live = repoPaths();

test('the test-only fixture satisfies the new-game rules', () => {
  const { errors } = validateNewGameHtml(good);
  assert.deepEqual(errors, []);
});

const mutations = {
  'external script': (h) => h.replace('</head>', '<script src="https://cdn.example.com/x.js"></script></head>'),
  'protocol-relative asset': (h) => h.replace('</head>', '<link rel="stylesheet" href="//fonts.example.com/a.css"></head>'),
  'css url to network': (h) => h.replace('body {', 'body { background-image: url(https://x.example/a.png);'),
  fetch: (h) => h.replace('loop();\n', 'loop(); fetch("/api");\n'),
  XMLHttpRequest: (h) => h.replace('loop();\n', 'loop(); new XMLHttpRequest();\n'),
  WebSocket: (h) => h.replace('loop();\n', 'loop(); new WebSocket("ws://x");\n'),
  sendBeacon: (h) => h.replace('loop();\n', 'loop(); navigator.sendBeacon("/t");\n'),
  microphone: (h) => h.replace('loop();\n', 'loop(); navigator.mediaDevices.getUserMedia({audio:true});\n'),
  geolocation: (h) => h.replace('loop();\n', 'loop(); navigator.geolocation.getCurrentPosition(()=>{});\n'),
  'orientation permission': (h) => h.replace('loop();\n', 'loop(); DeviceOrientationEvent.requestPermission();\n'),
  'dynamic import': (h) => h.replace('loop();\n', 'loop(); import("./x.js");\n'),
  iframe: (h) => h.replace('<canvas', '<iframe src="/"></iframe><canvas'),
  'missing lang es': (h) => h.replace('<html lang="es">', '<html lang="en">'),
  'missing viewport': (h) => h.replace(/<meta name="viewport"[^>]*>/, ''),
  'missing start': (h) => h.replaceAll('data-action="start"', ''),
  'missing retry': (h) => h.replaceAll('data-action="retry"', ''),
  'missing back link': (h) => h.replace('<a href="/" data-action="back">', '<a href="/x" data-action="back">'),
  'missing test hook': (h) => h.replace('window.mierdiTest', 'window.other'),
  'touch only, no mouse/pointer': (h) => h.replace("'pointerdown'", "'touchstart'"),
  'missing ranking script': (h) => h.replace('<script src="/ranking.js" defer></script>', ''),
  'duplicated ranking script': (h) => h.replace('</head>', '<script src="/ranking.js" defer></script></head>'),
  'other same-origin script src': (h) => h.replace('</head>', '<script src="/otro.js"></script></head>'),
  'ranking script with changed attributes': (h) => h.replace('<script src="/ranking.js" defer></script>', '<script src="/ranking.js" async></script>'),
  'ranking script from elsewhere': (h) => h.replace('src="/ranking.js"', 'src="/games/ranking.js"'),
  'missing ranking end hook': (h) => h.replace('window.mierdiRanking?.fin(score)', 'void 0'),
  'two ranking end hooks': (h) => h.replace('loop();\n', 'loop(); window.mierdiRanking?.fin(score);\n'),
  'missing ranking reset hook': (h) => h.replace('window.mierdiRanking?.reset()', 'void 0'),
  'own ranking network call': (h) => h.replace('loop();\n', 'loop(); fetch("https://grldrwbiovglfxqjdicv.supabase.co/rest/v1/mierdi_ranking");\n'),
  'api key looking secret': (h) => h.replace('loop();\n', 'loop(); const k = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz";\n'),
};

for (const [name, mutate] of Object.entries(mutations)) {
  test(`rejects: ${name}`, () => {
    const html = mutate(good);
    assert.notEqual(html, good, 'mutation did not apply');
    const { errors } = validateNewGameHtml(html);
    assert.ok(errors.length > 0, `${name} should be rejected`);
  });
}

test('rejects files over the size ceiling but allows more than the old 15KB', () => {
  const padded = good.replace('</style>', `/*${'x'.repeat(30_000)}*/</style>`);
  assert.deepEqual(validateNewGameHtml(padded).errors, []);
  const huge = good.replace('</style>', `/*${'x'.repeat(MAX_NEW_GAME_BYTES)}*/</style>`);
  assert.ok(validateNewGameHtml(huge).errors.some((e) => /size/.test(e)));
});

test('svg namespace URIs are not treated as network access', () => {
  const html = good.replace('loop();\n', 'loop(); document.createElementNS("http://www.w3.org/2000/svg", "svg");\n');
  assert.deepEqual(validateNewGameHtml(html).errors, []);
});

test('strict rules apply only to the new game: legacy games fail them but the legacy catalog stays valid', () => {
  const catalog = loadCatalog(live.catalog);
  assert.deepEqual(validateCatalog(catalog, { gamesDir: live.gamesDir }).errors, []);
  const legacy = readFileSync(join(live.gamesDir, '034-topologico', 'index.html'), 'utf8');
  assert.ok(validateNewGameHtml(legacy).errors.length > 0);
});

function outDir({ entry, html = good, failed } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'mierdi-out-'));
  mkdirSync(dir, { recursive: true });
  if (entry !== undefined) writeFileSync(join(dir, 'entry.json'), typeof entry === 'string' ? entry : JSON.stringify(entry));
  if (html !== null) writeFileSync(join(dir, 'index.html'), html);
  if (failed) writeFileSync(join(dir, 'FAILED.txt'), failed);
  return dir;
}

const catalog = [
  { id: '001-a', title: 'A', date: '2026-01-01', description: 'd', mechanic: 'm', emoji: '🎮' },
  { id: '002-b', title: 'B', date: '2026-01-02', description: 'd', mechanic: 'm', emoji: '🎮' },
];
const goodEntry = {
  slug: 'nuevo-juego',
  title: 'Nuevo Juego',
  description: 'Descripción',
  mechanic: 'Mecánica',
  emoji: '🧪',
  novelty: {
    candidates: [
      { name: 'uno', mechanic: 'm1' },
      { name: 'dos', mechanic: 'm2' },
      { name: 'tres', mechanic: 'm3' },
    ],
    chosen: 1,
    nearest: [{ id: '002-b', difference: 'otra regla' }],
    differs_in: ['control', 'win-loss'],
  },
};
const ctx = { catalog, number: 3, today: '2026-01-03' };

test('generator output: valid entry becomes a catalog entry with parent-assigned id and date', () => {
  const res = readGeneratorOutput(outDir({ entry: goodEntry }), ctx);
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.entry, {
    id: '003-nuevo-juego',
    title: 'Nuevo Juego',
    date: '2026-01-03',
    description: 'Descripción',
    mechanic: 'Mecánica',
    emoji: '🧪',
  });
  assert.equal(res.novelty.chosen, 1);
});

test('generator output: FAILED.txt is surfaced as an honest failure', () => {
  const res = readGeneratorOutput(outDir({ failed: 'cuota agotada' }), ctx);
  assert.ok(res.errors.some((e) => /cuota agotada/.test(e)));
});

test('generator output: missing files, bad json, bad slug, bad novelty are rejected', () => {
  assert.ok(readGeneratorOutput(outDir({ entry: goodEntry, html: null }), ctx).errors.some((e) => /index.html/.test(e)));
  assert.ok(readGeneratorOutput(outDir({}), ctx).errors.some((e) => /entry.json/.test(e)));
  assert.ok(readGeneratorOutput(outDir({ entry: '{nope' }), ctx).errors.some((e) => /JSON/.test(e)));
  for (const slug of ['../evil', 'Mayus', 'a/b', '', 'a'.repeat(50)]) {
    assert.ok(readGeneratorOutput(outDir({ entry: { ...goodEntry, slug } }), ctx).errors.length > 0, `slug ${slug}`);
  }
  const twoCandidates = { ...goodEntry, novelty: { ...goodEntry.novelty, candidates: goodEntry.novelty.candidates.slice(0, 2) } };
  assert.ok(readGeneratorOutput(outDir({ entry: twoCandidates }), ctx).errors.some((e) => /candidates/.test(e)));
  const unknownNearest = { ...goodEntry, novelty: { ...goodEntry.novelty, nearest: [{ id: '099-zz', difference: 'x' }] } };
  assert.ok(readGeneratorOutput(outDir({ entry: unknownNearest }), ctx).errors.some((e) => /nearest/.test(e)));
  const reskin = { ...goodEntry, novelty: { ...goodEntry.novelty, differs_in: ['theme'] } };
  assert.ok(readGeneratorOutput(outDir({ entry: reskin }), ctx).errors.some((e) => /differs_in/.test(e)));
  const reusedSlug = { ...goodEntry, slug: 'a' };
  assert.ok(readGeneratorOutput(outDir({ entry: reusedSlug }), ctx).errors.some((e) => /slug/.test(e)));
});

test('generator output: strict html errors are included', () => {
  const res = readGeneratorOutput(outDir({ entry: goodEntry, html: good.replace('window.mierdiTest', 'window.x') }), ctx);
  assert.ok(res.errors.some((e) => /mierdiTest/.test(e)));
});

test('generator contract asks for exactly the ranking hooks the validator enforces', () => {
  const contract = readFileSync(live.instructions, 'utf8');
  assert.ok(contract.includes(RANKING_SCRIPT));
  assert.ok(contract.includes('window.mierdiRanking?.fin(score)'));
  assert.ok(contract.includes('window.mierdiRanking?.reset()'));
  assert.match(contract, /más es mejor/);
  assert.doesNotMatch(contract, /scripts src, fetch/, 'old blanket ban on script src must name the single exception');
});
