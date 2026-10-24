// Cableado del ranking en los juegos del catálogo (estático, sin navegador).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoPaths } from '../scripts/lib/paths.mjs';
import { loadCatalog } from '../scripts/lib/catalog.mjs';
import { RANKING_SCRIPT } from '../scripts/lib/game-html.mjs';
import { FIN, LEGACY, gitBaseline } from './ranking-fin.mjs';

const catalog = loadCatalog(repoPaths().catalog);
const html = (id) => readFileSync(join(repoPaths().gamesDir, id, 'index.html'), 'utf8');

// Quita exactamente lo que añade el cableado: la etiqueta, las llamadas en línea propia (con un
// `if (...)` o `setTimeout(()=>…,N)` delante si hace falta) y las llamadas insertadas en una línea.
export function sinRanking(h) {
  return h
    .replace(RANKING_SCRIPT + '\n', '')
    .replace(/\n[ \t]*(?:if \([^\n]*\) |setTimeout\(\(\)=>)window\.mierdiRanking\?\.fin\([^;\n]*?\)(?:,\d+\))?;(?=\n)/g, '')
    .replace(/\n[ \t]*window\.mierdiRanking\?\.(?:fin|reset)\([^;\n]*\);(?=\n)/g, '')
    .replace(/window\.mierdiRanking\?\.(?:fin|reset)\([^;\n]*\);/g, '');
}

// Catálogo vivo: deben seguir todos los legados; los juegos posteriores (sin entrada en FIN) solo
// tienen que cumplir el contrato actual del ranking, el mismo que exige validateGameHtml.
export function problemasCatalogo(ids, htmlOf) {
  const out = LEGACY.filter((id) => !ids.includes(id)).map((id) => `falta el juego legado ${id}`);
  for (const id of ids.filter((id) => !LEGACY.includes(id))) {
    const h = htmlOf(id);
    if (h.split(RANKING_SCRIPT).length - 1 !== 1) out.push(`${id}: no tiene exactamente una ${RANKING_SCRIPT}`);
    if (/<script\b[^>]*\bsrc\s*=/i.test(h.replaceAll(RANKING_SCRIPT, ''))) out.push(`${id}: otro script src aparte del ranking`);
    if ((h.match(/window\.mierdiRanking\?\.fin\(/g) || []).length !== 1) out.push(`${id}: no tiene exactamente un fin()`);
    if (!/window\.mierdiRanking\?\.reset\(\)/.test(h)) out.push(`${id}: falta reset()`);
  }
  return out;
}

test('el baseline congelado tiene los 37 juegos legados y todos tienen una expresión de fin declarada', () => {
  assert.equal(LEGACY.length, 37);
  assert.deepEqual([...LEGACY].sort(), Object.keys(FIN).sort());
});

test('catálogo vivo: legados presentes y juegos posteriores con etiqueta, reset() y un fin()', () => {
  assert.deepEqual(problemasCatalogo(catalog.map((g) => g.id), html), []);
});

for (const id of LEGACY) {
  test(`cableado ${id}: una etiqueta, un fin(${FIN[id]}), reset() y mecánicas intactas`, () => {
    const h = html(id);
    assert.equal(h.split(RANKING_SCRIPT).length - 1, 1, 'una sola etiqueta exacta');
    assert.equal(h.match(/<script\b[^>]*\bsrc\s*=/gi).length, 1, 'ningún otro script src');
    const fins = [...h.matchAll(/window\.mierdiRanking\?\.fin\(([^)]*)\)/g)].map((m) => m[1]);
    assert.deepEqual(fins, [FIN[id]]);
    assert.ok((h.match(/window\.mierdiRanking\?\.reset\(\)/g) || []).length >= 1, 'reset() al empezar/reintentar');
    const before = gitBaseline(`public/games/${id}/index.html`);
    assert.equal(sinRanking(h), before, 'quitando el cableado queda el juego original byte a byte');
  });
}

test('regresión: un juego futuro añadido se acepta; falta de legado o de ganchos del futuro se detecta', () => {
  const ids = [...Object.keys(FIN), '038-futuro'];
  const bueno = `${RANKING_SCRIPT}\n<script>function empezar(){window.mierdiRanking?.reset();}\nfunction acabar(){window.mierdiRanking?.fin(puntos);}</script>`;
  const con = (h) => (id) => (id === '038-futuro' ? h : html(id));
  assert.deepEqual(problemasCatalogo(ids, con(bueno)), []);
  assert.deepEqual(problemasCatalogo(ids.filter((id) => id !== '012-efecto-doppler'), con(bueno)), ['falta el juego legado 012-efecto-doppler']);
  assert.match(problemasCatalogo(ids, con(bueno.replace(RANKING_SCRIPT, ''))).join(), /038-futuro: .*ranking\.js/);
  assert.match(problemasCatalogo(ids, con(bueno.replace('window.mierdiRanking?.reset();', ''))).join(), /038-futuro: .*reset/);
  assert.match(problemasCatalogo(ids, con(bueno.replace('window.mierdiRanking?.fin(puntos);', ''))).join(), /038-futuro: .*fin/);
  assert.match(problemasCatalogo(ids, con(bueno + '<script src="/otro.js"></script>')).join(), /038-futuro: .*script src/);
});
