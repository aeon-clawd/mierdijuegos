// Importación de los seis juegos visibles de diug22/Mierdijuegos (2023), dirigida por el manifiesto
// src/imports/diug22-mierdijuegos-2023/manifest.json. Estático, sin navegador.
// - Los 37 juegos previos se comparan byte a byte con el commit baseline de la importación.
// - Las fechas se verifican contra el historial git del snapshot fuente si está en .local/import-source
//   (no versionado: en un clon limpio esos tests se saltan explícitamente).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, repoPaths } from '../scripts/lib/paths.mjs';
import { loadCatalog, validateCatalog, FIELDS, parseId } from '../scripts/lib/catalog.mjs';
import { validateNewGameHtml } from '../scripts/lib/game-html.mjs';
import { madridDate } from '../scripts/lib/dates.mjs';
import { sortGamesNewestFirst } from '../src/lib/games.mjs';

const MANIFEST_REL = 'src/imports/diug22-mierdijuegos-2023/manifest.json';
const PROVENANCE_REL = 'src/imports/diug22-mierdijuegos-2023/PROVENANCE.md';
const SOURCE_DIR = join(REPO_ROOT, '.local/import-source');
// Commit del repo actual justo antes de la importación: 37 juegos (001–037).
export const IMPORT_BASELINE = 'd23f1a92836f1f1411f7f9cc7e10d3a4352b52c3';
const SOURCE_COMMIT = 'b6e551dea8f9354afd6e5178f89b6d1dd20f283f';

// Doble anotación: lo que el manifiesto DEBE decir (id fuente, id destino, fecha, commit de evidencia).
const EXPECTED = [
  ['zig_zag_salto', '038-zigzag-salto', '2023-03-18', 'a360432c8b0741aea50e18e71e4b71c3bb3c176e'],
  ['cazador_estrellas', '039-cazador-de-estrellas', '2023-03-19', 'a2de361701ead880435d508ef30f4ad9ba8f474b'],
  ['conexion_cuantica', '040-conexion-cuantica', '2023-03-19', '743c8b367715c9d1d0d71db71449044181589e43'],
  ['colorblitz', '041-colorblitz', '2023-03-19', 'edd0f54f61eb3d39c96b0b246ebeda5b41f2fddf'],
  ['wave_river', '042-wave-river', '2023-03-21', '398ee1818ec08a769e0334ecbb28ed5eafba9237'],
  ['sound_scape', '043-sound-scape', '2023-03-21', '03b26159fde64d8364497ceaa3f8d450440ac1ff'],
];

const live = repoPaths();
const read = (rel) => readFileSync(join(REPO_ROOT, rel), 'utf8');
const manifest = () => JSON.parse(read(MANIFEST_REL));
const gitHere = (args, opts = {}) => execFileSync('git', args, { cwd: REPO_ROOT, maxBuffer: 1 << 26, ...opts });
const atBaseline = (path) => gitHere(['show', `${IMPORT_BASELINE}:${path}`]);
const baselineCatalog = () => JSON.parse(atBaseline('public/games/games.json').toString('utf8'));
const hasSource = existsSync(join(SOURCE_DIR, '.git'));
const src = (args) => execFileSync('git', args, { cwd: SOURCE_DIR, encoding: 'utf8', maxBuffer: 1 << 26 }).trim();
const NO_SOURCE = hasSource ? false : 'snapshot fuente ausente en .local/import-source (no versionado): evidencia git no verificable aquí';

test('manifiesto: repo/commit fuente y exactamente los seis juegos esperados, en orden', () => {
  const m = manifest();
  assert.equal(m.source.repo, 'https://github.com/diug22/Mierdijuegos');
  assert.equal(m.source.commit, SOURCE_COMMIT);
  assert.equal(m.baseline.commit, IMPORT_BASELINE);
  assert.equal(m.baseline.games, 37);
  assert.deepEqual(m.games.map((g) => [g.sourceId, g.targetId, g.originalDate, g.evidence.commit]), EXPECTED);
  for (const g of m.games) {
    for (const k of ['sourceName', 'sourceRating', 'sourceScript', 'title']) assert.equal(typeof g[k], 'string', `${g.targetId}.${k}`);
    assert.equal(typeof g.evidence.path, 'string');
    assert.equal(typeof g.evidence.subject, 'string');
    assert.match(g.evidence.authorDate, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/);
    assert.ok(Array.isArray(g.pathChain) && g.pathChain.length >= 1, `${g.targetId}: falta pathChain`);
    assert.equal(g.pathChain[0].path, g.evidence.path);
    assert.equal(typeof g.ranking?.score, 'string', `${g.targetId}: falta ranking.score`);
    assert.equal(typeof g.ranking?.end, 'string', `${g.targetId}: falta ranking.end`);
  }
});

test('manifiesto: fecha = día Europe/Madrid del commit de evidencia; ids 038+ por orden de introducción', () => {
  const { games } = manifest();
  for (const g of games) assert.equal(madridDate(new Date(g.evidence.authorDate)), g.originalDate, g.targetId);
  const t = games.map((g) => Date.parse(g.evidence.authorDate));
  assert.deepEqual([...t].sort((a, b) => a - b), t, 'ids asignados por fecha/hora de primera introducción');
  games.forEach((g, i) => assert.equal(parseId(g.targetId).number, 38 + i));
  // Las fechas son de 2023, no la fecha de migración ni la última modificación.
  for (const g of games) assert.ok(g.originalDate < '2023-03-23', `${g.targetId}: ${g.originalDate}`);
});

test('manifiesto: boucing_bots (oculto, sin terminar) excluido con motivo', () => {
  const { excluded, games } = manifest();
  assert.deepEqual(excluded.map((e) => e.sourceId), ['boucing_bots']);
  assert.match(excluded[0].reason, /is_visible/);
  assert.match(excluded[0].reason, /sin terminar|inacabad|incomplet/i);
  assert.ok(!games.some((g) => /bouc|bots/.test(g.sourceId + g.targetId)));
});

test('snapshot fuente: HEAD es el commit del manifiesto y fileList.json tiene 6 visibles + boucing_bots oculto', { skip: NO_SOURCE }, () => {
  const m = manifest();
  assert.equal(src(['rev-parse', 'HEAD']), m.source.commit);
  const list = JSON.parse(src(['show', `${m.source.commit}:src/fileList.json`]));
  assert.deepEqual(list.filter((f) => f.is_visible).map((f) => f.id).sort(), m.games.map((g) => g.sourceId).sort());
  assert.deepEqual(list.filter((f) => !f.is_visible).map((f) => f.id), ['boucing_bots']);
  for (const g of m.games) {
    const f = list.find((x) => x.id === g.sourceId);
    assert.equal(f.name, g.sourceName);
    assert.equal(f.rating, g.sourceRating);
    assert.equal(f.scriptUrl.replace(/^\//, ''), g.sourceScript);
  }
});

// Normaliza un script para comparar lógica: sin espacios, sin líneas vacías ni llaves sueltas, sin la
// envoltura initGame() que añadió la extracción a .js (f67e2a4).
const norm = (s) => s.split('\n').map((l) => l.replace(/\s+/g, '')).filter((l) => l && l !== '}' && l !== 'functioninitGame(){');

for (const [sourceId, targetId] of EXPECTED) {
  test(`evidencia git de ${targetId}: commit que añade el juego, cadena de rutas y nada anterior`, { skip: NO_SOURCE }, () => {
    const g = manifest().games.find((x) => x.targetId === targetId);
    const { commit, path, authorDate, subject } = g.evidence;
    assert.equal(src(['log', '-1', '--format=%aI', commit]), authorDate);
    assert.equal(src(['log', '-1', '--format=%s', commit]), subject);
    const added = src(['show', '--format=', '--name-status', '--diff-filter=A', commit]).split('\n').map((l) => l.split('\t')[1]);
    assert.ok(added.includes(path), `${commit} no añade ${path}`);
    // Cada paso de la cadena es un renombrado exacto (R100) registrado en su commit, o la extracción
    // del script inline a .js con lógica idéntica.
    for (const step of g.pathChain.slice(1)) {
      if (step.via === 'rename') {
        const st = src(['show', '--format=', '--name-status', '-M', step.commit]);
        assert.ok(st.split('\n').includes(`R100\t${step.from}\t${step.path}`), `${step.commit}: falta R100 ${step.from} → ${step.path}`);
      } else {
        assert.equal(step.via, 'extract');
        const inline = src(['show', `${step.commit}^:${step.from}`]);
        const body = inline.slice(inline.indexOf('<script>') + 8, inline.lastIndexOf('</script>'));
        assert.deepEqual(norm(src(['show', `${step.commit}:${step.path}`])), norm(body), `${step.commit}: la lógica extraída difiere`);
      }
    }
    // Ninguna ruta de la cadena (ni la carpeta del juego) aparece en un commit anterior a la evidencia.
    const paths = [...new Set([...g.pathChain.map((s) => s.path), `juegos/${sourceId}`])];
    const first = src(['log', '--reverse', '--format=%H', '--', ...paths]).split('\n')[0];
    assert.equal(first, commit);
    // El script final de la fuente es el último eslabón de la cadena.
    assert.equal(g.pathChain.at(-1).path, g.sourceScript);
  });
}

test('el --follow ingenuo sobre los index.html stub se equivoca (por eso la cadena es explícita)', { skip: NO_SOURCE }, () => {
  const naive = (id) => src(['log', '--follow', '--diff-filter=A', '--format=%H', '--', `juegos/${id}/index.html`]).split('\n').at(-1);
  const byId = Object.fromEntries(manifest().games.map((g) => [g.sourceId, g.evidence.commit]));
  assert.notEqual(naive('wave_river'), byId.wave_river);
  assert.notEqual(naive('sound_scape'), byId.sound_scape);
  assert.equal(src(['log', '--format=%H', '--diff-filter=A', '--', 'juegos/wave_river/wave_river.js']), byId.wave_river);
  assert.equal(src(['log', '--format=%H', '--diff-filter=A', '--', 'juegos/sound_scape/sound_scape.js']), byId.sound_scape);
});

test('los 37 juegos del baseline siguen igual: mismas entradas, mismo orden, HTML byte a byte', () => {
  const base = baselineCatalog();
  assert.equal(base.length, 37);
  const cat = loadCatalog(live.catalog);
  assert.deepEqual(cat.slice(0, 37), base);
  for (const g of base) {
    const now = readFileSync(join(live.gamesDir, g.id, 'index.html'));
    assert.ok(now.equals(atBaseline(`public/games/${g.id}/index.html`)), `${g.id} cambió`);
  }
  // Analítica y migración histórica intactas (ranking.js cambió después con la Edge Function
  // mierdi-ranking; lo cubren test/ranking-ui.test.mjs y los tests de juegos).
  for (const p of ['public/analytics.js', 'supabase/migrations/20261024120000_mierdi_ranking.sql']) {
    assert.ok(readFileSync(join(REPO_ROOT, p)).equals(atBaseline(p)), `${p} cambió`);
  }
});

test('catálogo: exactamente los seis importados tras el baseline, con su fecha original y sin campos extra', () => {
  const m = manifest();
  const cat = loadCatalog(live.catalog);
  const ids = new Set(m.games.map((g) => g.targetId));
  const imported = cat.filter((g) => ids.has(g.id));
  assert.deepEqual(imported.map((g) => g.id), m.games.map((g) => g.targetId));
  assert.deepEqual(cat.slice(37, 43).map((g) => g.id), m.games.map((g) => g.targetId), 'añadidos tras los 37');
  for (const g of m.games) {
    const e = cat.find((x) => x.id === g.targetId);
    assert.equal(e.date, g.originalDate);
    assert.equal(e.title, g.title);
    assert.deepEqual(Object.keys(e), FIELDS);
  }
  // Nada más de 2023 ni del prototipo oculto.
  assert.deepEqual(cat.filter((g) => g.date < '2026-01-01').map((g) => g.id), m.games.map((g) => g.targetId));
  assert.ok(!cat.some((g) => /bouc|bots/.test(g.id)));
  assert.ok(!readdirSync(live.gamesDir).some((d) => /bouc|bots/.test(d)));
  const res = validateCatalog(cat, { gamesDir: live.gamesDir });
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.warnings, []);
});

for (const [, targetId, date, commit] of EXPECTED) {
  test(`HTML de ${targetId}: contrato actual del juego nuevo, autocontenido y con procedencia`, () => {
    const h = readFileSync(join(live.gamesDir, targetId, 'index.html'), 'utf8');
    assert.deepEqual(validateNewGameHtml(h).errors, []);
    assert.doesNotMatch(h, /https?:\/\//, 'ni una URL absoluta: sin assets externos');
    assert.match(h, /#0a0a0a/i);
    assert.ok(h.includes('diug22/Mierdijuegos'), 'atribución de la fuente');
    assert.ok(h.includes(date), 'fecha original visible');
    assert.ok(h.includes(commit.slice(0, 7)), 'commit de evidencia');
    assert.match(h, /window\.mierdiTest\s*=/);
  });
}

test('portada: ordena por FECHA, no por id; los importados de 2023 no desplazan a 037', () => {
  const m = manifest();
  const ids = new Set([...baselineCatalog().map((g) => g.id), ...m.games.map((g) => g.targetId)]);
  const cat = loadCatalog(live.catalog).filter((g) => ids.has(g.id));
  const sorted = sortGamesNewestFirst(cat).map((g) => g.id);
  assert.equal(sorted[0], '037-rebano-rebelde');
  assert.deepEqual(sorted.slice(-6), ['043-sound-scape', '042-wave-river', '041-colorblitz', '040-conexion-cuantica', '039-cazador-de-estrellas', '038-zigzag-salto']);
  const byId = [...cat].sort((a, b) => parseId(b.id).number - parseId(a.id).number).map((g) => g.id);
  assert.equal(byId[0], '043-sound-scape', 'ordenar por id pondría un juego de 2023 como "del día"');
  // Catálogo vivo (puede crecer cada noche): el del día nunca es un importado.
  const all = sortGamesNewestFirst(loadCatalog(live.catalog));
  assert.ok(!m.games.some((g) => g.targetId === all[0].id));
  assert.deepEqual(all.slice(-6).map((g) => g.id), sorted.slice(-6));
});

test('migración SQL aditiva: solo siembra los seis ids nuevos con ON CONFLICT DO NOTHING', () => {
  const m = manifest();
  assert.match(m.seedMigration, /^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/);
  assert.doesNotMatch(m.seedMigration, /ranking/, 'no debe confundirse con la migración histórica en ranking-sql.test');
  const sql = read(m.seedMigration);
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  const ids = [...code.matchAll(/\('(\d{3}-[a-z0-9-]+)'\)/g)].map((x) => x[1]);
  assert.deepEqual(ids, m.games.map((g) => g.targetId));
  const statements = code.split(';').map((s) => s.trim()).filter(Boolean);
  assert.equal(statements.length, 1);
  assert.match(statements[0], /^insert into public\.mierdi_ranking \(id_juego\) values\s/);
  assert.match(statements[0], /on conflict \(id_juego\) do nothing$/);
  assert.doesNotMatch(code, /\b(delete|update|truncate|drop|alter|create|grant|revoke|policy|function|ranking\s*=)\b/i);
  // Ninguna otra migración entre la histórica y esta; las posteriores (p. ej. la RPC perezosa) van detrás.
  const migs = readdirSync(join(REPO_ROOT, 'supabase/migrations')).sort();
  const seed = m.seedMigration.split('/').pop();
  assert.deepEqual(migs.slice(0, 2), ['20261024120000_mierdi_ranking.sql', seed]);
  for (const later of migs.slice(2)) assert.ok(later > seed, `${later} debe ser posterior a ${seed}`);
});

test('documento de procedencia: commit, ruta y fecha de cada juego, exclusión y aviso sobre --follow', () => {
  const doc = read(PROVENANCE_REL);
  const m = manifest();
  assert.ok(doc.includes(m.source.commit));
  for (const g of m.games) {
    for (const s of [g.targetId, g.sourceId, g.evidence.commit, g.evidence.path, g.originalDate, g.evidence.authorDate]) assert.ok(doc.includes(s), `${g.targetId}: falta ${s}`);
  }
  assert.match(doc, /boucing_bots/);
  assert.match(doc, /--follow/);
  assert.match(read('README.md'), /imports\/diug22-mierdijuegos-2023/);
});
