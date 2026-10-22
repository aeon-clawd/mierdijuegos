import { readFileSync, existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { SLUG_RE, formatGameNumber, validateNewEntry } from './catalog.mjs';
import { validateNewGameHtml } from './game-html.mjs';

export function readGeneratorOutput(dir, { catalog, number, today }) {
  const errors = [];
  const result = { errors, entry: null, novelty: null, html: null };
  if (existsSync(join(dir, 'FAILED.txt'))) {
    errors.push(readFileSync(join(dir, 'FAILED.txt'), 'utf8').slice(0, 2000));
    return result;
  }
  for (const name of ['entry.json', 'index.html']) {
    const file = join(dir, name);
    if (!existsSync(file) || !lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()) errors.push(`missing or unsafe ${name}`);
  }
  if (errors.length) return result;
  let raw;
  try { raw = JSON.parse(readFileSync(join(dir, 'entry.json'), 'utf8')); }
  catch (e) { errors.push(`entry.json: invalid JSON: ${e.message}`); return result; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { errors.push('entry.json must be an object'); return result; }
  if (typeof raw.slug !== 'string' || !SLUG_RE.test(raw.slug) || raw.slug.length > 48) errors.push('invalid slug');
  const novelty = raw.novelty;
  if (!Array.isArray(novelty?.candidates) || novelty.candidates.length !== 3 || novelty.candidates.some(c => !c?.name?.trim() || !c?.mechanic?.trim())) errors.push('novelty.candidates must contain three ideas');
  if (!Number.isInteger(novelty?.chosen) || novelty.chosen < 0 || novelty.chosen > 2) errors.push('invalid novelty.chosen (zero based)');
  if (!Array.isArray(novelty?.nearest) || !novelty.nearest.length || novelty.nearest.some(n => !catalog.some(g => g.id === n.id) || !n.difference?.trim())) errors.push('novelty.nearest must compare known catalog games');
  const dimensions = ['control', 'rules', 'feedback', 'win-loss'];
  if (!Array.isArray(novelty?.differs_in) || !novelty.differs_in.length || novelty.differs_in.some(d => !dimensions.includes(d))) errors.push('novelty.differs_in must identify gameplay changes, not theme');
  const entry = { id: `${formatGameNumber(number)}-${raw.slug}`, title: raw.title, date: today, description: raw.description, mechanic: raw.mechanic, emoji: raw.emoji };
  errors.push(...validateNewEntry(entry, catalog, { today, expectedNumber: number }));
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  errors.push(...validateNewGameHtml(html).errors);
  return { errors, entry, novelty, html };
}
