import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadCatalog,
  validateCatalog,
  nextGameNumber,
  formatGameNumber,
  validateNewEntry,
} from '../scripts/lib/catalog.mjs';
import { repoPaths } from '../scripts/lib/paths.mjs';

const live = repoPaths();

function fixture(entries, { files = entries.map((e) => e.id) } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'mierdi-cat-'));
  for (const id of files) {
    mkdirSync(join(dir, id), { recursive: true });
    writeFileSync(join(dir, id, 'index.html'), '<!doctype html><title>x</title>');
  }
  return dir;
}

const entry = (id, date, extra = {}) => ({
  id,
  title: `T ${id}`,
  date,
  description: 'desc',
  mechanic: 'mech',
  emoji: '🎮',
  ...extra,
});

test('the live catalog preserves the original games and passes structural validation', () => {
  const games = loadCatalog(live.catalog);
  assert.ok(games.length >= 34);
  const res = validateCatalog(games, { gamesDir: live.gamesDir });
  assert.deepEqual(res.errors, []);
});

test('next id is max numeric prefix + 1, not list length', () => {
  const games = [entry('001-a', '2026-01-01'), entry('002-b', '2026-01-02'), entry('010-c', '2026-01-03')];
  assert.equal(nextGameNumber(games), 11);
  assert.equal(formatGameNumber(11), '011');
  assert.equal(formatGameNumber(1234), '1234');
  assert.equal(nextGameNumber([]), 1);
});

test('rejects duplicate ids and duplicate numeric prefixes', () => {
  const games = [entry('001-a', '2026-01-01'), entry('001-a', '2026-01-02'), entry('001-b', '2026-01-03')];
  const dir = fixture(games, { files: ['001-a', '001-b'] });
  const { errors } = validateCatalog(games, { gamesDir: dir });
  assert.ok(errors.some((e) => /duplicate id/.test(e)), errors.join('\n'));
  assert.ok(errors.some((e) => /duplicate number/.test(e)), errors.join('\n'));
});

test('rejects path traversal and malformed ids', () => {
  for (const id of ['../001-x', '001-../../etc', '/abs', '001-A', '1-x', '001_x', '001-x/', '001-x\\y', '']) {
    const games = [entry(id, '2026-01-01')];
    const { errors } = validateCatalog(games, { gamesDir: fixture([]) });
    assert.ok(errors.some((e) => /invalid id/.test(e)), `id ${JSON.stringify(id)} should be rejected`);
  }
});

test('rejects missing files and missing/bad fields', () => {
  const games = [
    entry('001-a', '2026-01-01'),
    entry('002-b', '2026-02-30'),
    { id: '003-c', title: '', date: '2026-01-03', description: 'd', mechanic: 'm' },
    entry('004-d', '2026-01-04', { title: 42 }),
  ];
  const dir = fixture(games, { files: ['002-b', '003-c', '004-d'] });
  const { errors } = validateCatalog(games, { gamesDir: dir });
  assert.ok(errors.some((e) => e.includes('001-a') && /missing file/.test(e)), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('002-b') && /date/.test(e)), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('003-c') && /title/.test(e)), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('003-c') && /emoji/.test(e)), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('004-d') && /title/.test(e)), errors.join('\n'));
});

test('rejects a game file that is a symlink escaping the games dir', () => {
  const outside = mkdtempSync(join(tmpdir(), 'mierdi-out-'));
  writeFileSync(join(outside, 'index.html'), 'secret');
  const dir = fixture([]);
  symlinkSync(outside, join(dir, '001-a'));
  const { errors } = validateCatalog([entry('001-a', '2026-01-01')], { gamesDir: dir });
  assert.ok(errors.some((e) => /outside/.test(e)), errors.join('\n'));
  rmSync(outside, { recursive: true, force: true });
});

test('catalog must be a JSON array', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mierdi-cat-'));
  writeFileSync(join(dir, 'games.json'), '{"id":"x"}');
  assert.throws(() => loadCatalog(join(dir, 'games.json')), /array/);
  writeFileSync(join(dir, 'games.json'), '[{');
  assert.throws(() => loadCatalog(join(dir, 'games.json')), /JSON/);
});

test('legacy duplicate dates are allowed structurally, but a new entry needs a fresh date', () => {
  const games = [entry('001-a', '2026-01-01'), entry('002-b', '2026-01-01')];
  assert.deepEqual(validateCatalog(games, { gamesDir: fixture(games) }).errors, []);

  const ok = validateNewEntry(entry('003-c', '2026-01-02'), games, { today: '2026-01-02', expectedNumber: 3 });
  assert.deepEqual(ok, []);

  const sameDay = validateNewEntry(entry('003-c', '2026-01-01'), games, { today: '2026-01-01', expectedNumber: 3 });
  assert.ok(sameDay.some((e) => /already has a game/.test(e)), sameDay.join('\n'));

  const notToday = validateNewEntry(entry('003-c', '2026-01-05'), games, { today: '2026-01-02', expectedNumber: 3 });
  assert.ok(notToday.some((e) => /today/.test(e)), notToday.join('\n'));

  const wrongNum = validateNewEntry(entry('005-c', '2026-01-02'), games, { today: '2026-01-02', expectedNumber: 3 });
  assert.ok(wrongNum.some((e) => /number/.test(e)), wrongNum.join('\n'));

  const reusedSlug = validateNewEntry(entry('003-a', '2026-01-02'), games, { today: '2026-01-02', expectedNumber: 3 });
  assert.ok(reusedSlug.some((e) => /slug/.test(e)), reusedSlug.join('\n'));

  const dupTitle = validateNewEntry(entry('003-c', '2026-01-02', { title: 't 001-A' }), games, { today: '2026-01-02', expectedNumber: 3 });
  assert.ok(dupTitle.some((e) => /title/.test(e)), dupTitle.join('\n'));

  const extra = validateNewEntry(entry('003-c', '2026-01-02', { novelty: {} }), games, { today: '2026-01-02', expectedNumber: 3 });
  assert.ok(extra.some((e) => /unexpected field/.test(e)), extra.join('\n'));
});
