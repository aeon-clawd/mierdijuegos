// Catalog (public/games/games.json) loading and validation.
// validateCatalog() is structural and applies to every game, legacy included.
// validateNewEntry() adds the stricter rules that only a newly generated game must meet.
import { readFileSync, existsSync, statSync, realpathSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';

export const ID_RE = /^(\d{3,})-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const FIELDS = ['id', 'title', 'date', 'description', 'mechanic', 'emoji'];

const NEW_LIMITS = { title: 40, description: 300, mechanic: 300, emoji: 16 };

export function loadCatalog(path) {
  let data;
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`catalog ${path} is not valid JSON: ${err.message}`);
  }
  if (!Array.isArray(data)) throw new Error(`catalog ${path} must be a JSON array`);
  return data;
}

export function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function parseId(id) {
  const m = typeof id === 'string' ? ID_RE.exec(id) : null;
  return m ? { number: Number.parseInt(m[1], 10), slug: m[2] } : null;
}

export function validateCatalog(entries, { gamesDir }) {
  const errors = [];
  const warnings = [];
  const ids = new Set();
  const numbers = new Map();
  let realGamesDir = gamesDir;
  try { realGamesDir = realpathSync(gamesDir); } catch { /* reported per entry */ }

  entries.forEach((g, i) => {
    const label = `#${i} ${typeof g?.id === 'string' ? g.id : JSON.stringify(g?.id)}`;
    if (!g || typeof g !== 'object' || Array.isArray(g)) {
      errors.push(`${label}: entry is not an object`);
      return;
    }
    for (const f of FIELDS) {
      if (f === 'id') continue;
      if (typeof g[f] !== 'string' || g[f].trim() === '') errors.push(`${label}: field "${f}" must be a non-empty string`);
    }
    for (const k of Object.keys(g)) if (!FIELDS.includes(k)) warnings.push(`${label}: unknown field "${k}"`);
    if (g.date !== undefined && typeof g.date === 'string' && !isValidDate(g.date)) errors.push(`${label}: invalid date "${g.date}"`);

    const parsed = parseId(g.id);
    if (!parsed) {
      errors.push(`${label}: invalid id (expected NNN-kebab-slug)`);
      return;
    }
    if (ids.has(g.id)) errors.push(`${label}: duplicate id`);
    ids.add(g.id);
    if (numbers.has(parsed.number) && numbers.get(parsed.number) !== g.id) {
      errors.push(`${label}: duplicate number ${parsed.number} (also ${numbers.get(parsed.number)})`);
    }
    numbers.set(parsed.number, g.id);

    const file = join(gamesDir, g.id, 'index.html');
    if (!existsSync(file)) {
      errors.push(`${label}: missing file ${file}`);
      return;
    }
    const real = realpathSync(file);
    if (!real.startsWith(realGamesDir + sep)) errors.push(`${label}: index.html resolves outside the games dir`);
    else if (statSync(real).size === 0) errors.push(`${label}: index.html is empty`);
  });

  if (existsSync(gamesDir)) {
    for (const d of readdirSync(gamesDir, { withFileTypes: true })) {
      if (d.isDirectory() && !ids.has(d.name)) warnings.push(`orphan directory public/games/${d.name} is not in the catalog`);
    }
  }
  return { errors, warnings };
}

export function nextGameNumber(entries) {
  let max = 0;
  for (const g of entries) {
    const p = parseId(g?.id);
    if (p && p.number > max) max = p.number;
  }
  return max + 1;
}

export function formatGameNumber(n) {
  return String(n).padStart(3, '0');
}

// Stricter rules for the one new game being added on `today` (Europe/Madrid date).
export function validateNewEntry(entry, existing, { today, expectedNumber }) {
  const errors = [];
  if (!entry || typeof entry !== 'object') return ['new entry is not an object'];
  for (const k of Object.keys(entry)) if (!FIELDS.includes(k)) errors.push(`unexpected field "${k}" in catalog entry`);
  for (const f of FIELDS) {
    if (typeof entry[f] !== 'string' || entry[f].trim() === '') errors.push(`field "${f}" must be a non-empty string`);
  }
  for (const [f, max] of Object.entries(NEW_LIMITS)) {
    if (typeof entry[f] === 'string' && [...entry[f]].length > max) errors.push(`field "${f}" longer than ${max} characters`);
  }
  const parsed = parseId(entry.id);
  if (!parsed) errors.push(`invalid id "${entry.id}"`);
  else {
    if (parsed.number !== expectedNumber) errors.push(`id number ${parsed.number} != expected ${expectedNumber}`);
    if (existing.some((g) => g.id === entry.id)) errors.push(`id ${entry.id} already exists`);
    if (existing.some((g) => parseId(g.id)?.slug === parsed.slug)) errors.push(`slug "${parsed.slug}" already used`);
  }
  if (!isValidDate(entry.date)) errors.push(`invalid date "${entry.date}"`);
  else {
    if (entry.date !== today) errors.push(`date ${entry.date} is not today (${today}, Europe/Madrid)`);
    if (existing.some((g) => g.date === entry.date)) errors.push(`catalog already has a game dated ${entry.date}`);
    const latest = existing.reduce((m, g) => (typeof g.date === 'string' && g.date > m ? g.date : m), '');
    if (entry.date < latest) errors.push(`date ${entry.date} is before latest catalog date ${latest}`);
  }
  if (typeof entry.title === 'string') {
    const t = entry.title.trim().toLowerCase();
    if (existing.some((g) => String(g.title).trim().toLowerCase() === t)) errors.push(`title "${entry.title}" already used`);
  }
  return errors;
}
