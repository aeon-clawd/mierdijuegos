import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const layout = readFileSync(new URL('../src/layouts/Layout.astro', import.meta.url), 'utf8');

test('footer aeon-link points to joaquinbrotonscandela.com and keeps its label', () => {
  const anchor = layout.match(/<a\b[^>]*class="aeon-link"[^>]*>([\s\S]*?)<\/a>/);
  assert.ok(anchor, 'aeon-link anchor not found');
  assert.match(anchor[0], /href="https:\/\/joaquinbrotonscandela\.com"/);
  assert.match(anchor[1], /Aeon Infinitive/);
});
