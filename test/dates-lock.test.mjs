import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { madridDate } from '../scripts/lib/dates.mjs';
import { acquireLock } from '../scripts/lib/lock.mjs';

test('madridDate uses the Europe/Madrid calendar day, including DST edges', () => {
  // CEST (UTC+2): 22:30Z is already the next day in Madrid.
  assert.equal(madridDate(new Date('2026-10-21T22:30:00Z')), '2026-10-22');
  assert.equal(madridDate(new Date('2026-10-21T21:59:59Z')), '2026-10-21');
  // CET (UTC+1) after the October change.
  assert.equal(madridDate(new Date('2026-10-25T22:59:00Z')), '2026-10-25');
  assert.equal(madridDate(new Date('2026-10-25T23:00:00Z')), '2026-10-26');
  // Spring forward night.
  assert.equal(madridDate(new Date('2026-03-28T23:30:00Z')), '2026-03-29');
  assert.equal(madridDate(new Date('2026-03-28T22:59:00Z')), '2026-03-28');
});

const tmpLock = () => join(mkdtempSync(join(tmpdir(), 'mierdi-lock-')), 'nightly.lock');

test('lock prevents a second holder while the first is alive', () => {
  const path = tmpLock();
  const release = acquireLock(path);
  assert.ok(existsSync(path));
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).pid, process.pid);
  assert.throws(() => acquireLock(path), (err) => err.code === 'ELOCKED');
  release();
  assert.equal(existsSync(path), false);
  const again = acquireLock(path);
  again();
});

test('dead-owner lock requires explicit operator cleanup, avoiding unsafe reclamation races', () => {
  const path = tmpLock();
  writeFileSync(path, JSON.stringify({ pid: 999999, startedAt: new Date().toISOString() }));
  assert.throws(() => acquireLock(path, { isAlive: () => false }), err => err.code === 'ELOCKED');
});

test('an old lock still owned by a live pid is never stolen', () => {
  const path = tmpLock();
  writeFileSync(path, JSON.stringify({ pid: 1, startedAt: '2020-01-01T00:00:00Z' }));
  assert.throws(() => acquireLock(path, { isAlive: () => true, staleMs: 60_000 }), err => err.code === 'ELOCKED');
});

test('fresh lock with a live pid is respected', () => {
  const path = tmpLock();
  writeFileSync(path, JSON.stringify({ pid: 1, startedAt: new Date().toISOString() }));
  assert.throws(() => acquireLock(path, { isAlive: () => true }), (err) => err.code === 'ELOCKED');
});

test('an empty or malformed lock fails closed (another process may still be writing it)', () => {
  const path = tmpLock();
  writeFileSync(path, 'not json');
  assert.throws(() => acquireLock(path), err => err.code === 'ELOCKED');
});

test('release does not delete a lock taken over by someone else', () => {
  const path = tmpLock();
  const release = acquireLock(path);
  writeFileSync(path, JSON.stringify({ pid: 4242, startedAt: new Date().toISOString() }));
  release();
  assert.ok(existsSync(path));
});
