import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sortGamesNewestFirst } from '../src/lib/games.mjs';

const catalog = JSON.parse(readFileSync(new URL('../public/games/games.json', import.meta.url), 'utf8'));

test('newest game by date comes first even when catalog order is not chronological', () => {
  const games = [
    { id: '002-b', date: '2026-01-02' },
    { id: '003-c', date: '2026-01-05' },
    { id: '001-a', date: '2026-01-01' },
  ];
  assert.deepEqual(sortGamesNewestFirst(games).map((g) => g.id), ['003-c', '002-b', '001-a']);
});

test('same-date games fall back to the higher numeric id first', () => {
  const games = [
    { id: '008-tres-cuerpos', date: '2026-02-24' },
    { id: '007-peso-muerto', date: '2026-02-24' },
    { id: '010-x', date: '2026-02-24' },
  ];
  assert.deepEqual(sortGamesNewestFirst(games).map((g) => g.id), ['010-x', '008-tres-cuerpos', '007-peso-muerto']);
});

test('does not mutate its input', () => {
  const games = [{ id: '001-a', date: '2026-01-01' }, { id: '002-b', date: '2026-01-02' }];
  sortGamesNewestFirst(games);
  assert.equal(games[0].id, '001-a');
});

test('real catalog: 023 (listed before 019) is placed by date, latest is 034', () => {
  const legacyCatalog = catalog.filter(g => Number.parseInt(g.id,10) <= 34);
  const ids = sortGamesNewestFirst(legacyCatalog).map((g) => g.id);
  assert.equal(ids[0], '034-topologico');
  assert.equal(ids.length, legacyCatalog.length);
  assert.ok(ids.indexOf('024-efecto-tunel') < ids.indexOf('023-eigenvalor'));
  assert.ok(ids.indexOf('023-eigenvalor') < ids.indexOf('022-penrose'));
  // The old implementation (plain reverse) gets this wrong:
  const reversed = [...legacyCatalog].reverse().map((g) => g.id);
  assert.notDeepEqual(reversed, ids);
});
