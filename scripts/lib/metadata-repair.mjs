// One bounded, deterministic repair for the only generator failure we fix without
// a new LLM call: description/mechanic over the catalog limit. Any other error
// (or none) returns null and the caller keeps failing closed.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { NEW_LIMITS, lengthError } from './catalog.mjs';

const FIELDS = ['description', 'mechanic'];
export const ALGORITHM = 'shortenText v1: if over max UTF-16 units, keep the longest prefix ending a sentence ([.!?…] + closing quotes, then space/end) when it keeps >= max/2; else cut at the last whitespace within max-1 units (>= max/2), drop trailing ,;:- and append "…"; else hard cut at max-1 units without splitting a surrogate pair and append "…"';
const SENTENCE_END = /[.!?…]+["'»”’)\]]*(?=\s|$)/g;

export function shortenText(text, max) {
  if (text.length <= max) return text;
  let sentence = 0;
  for (const m of text.matchAll(SENTENCE_END)) {
    const end = m.index + m[0].length;
    if (end > max) break;
    sentence = end;
  }
  if (sentence >= max / 2) return text.slice(0, sentence);
  const room = max - 1, window = text.slice(0, room + 1);
  const space = window.search(/\s+\S*$/);
  let kept = space > 0 ? window.slice(0, space).replace(/[\s,;:\-–—]+$/u, '') : '';
  if (kept.length < max / 2) {
    kept = text.slice(0, room);
    const last = kept.charCodeAt(kept.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) kept = kept.slice(0, -1);
    kept = kept.trimEnd();
  }
  return kept + '…';
}

// Leaves <output> (generator files) untouched: writes <run>/repaired/ with the
// shortened entry.json and a byte copy of index.html, plus <run>/metadata-repair.json.
export function repairOverlongMetadata({ output, run, errors }) {
  const repairable = new Map(FIELDS.map(f => [lengthError(f, NEW_LIMITS[f]), f]));
  if (!errors.length || !errors.every(e => repairable.has(e))) return null;
  const raw = JSON.parse(readFileSync(join(output, 'entry.json'), 'utf8'));
  const dir = join(run, 'repaired'), fields = {};
  for (const f of errors.map(e => repairable.get(e))) {
    const text = shortenText(raw[f], NEW_LIMITS[f]);
    fields[f] = {
      original: { text: raw[f], utf16: raw[f].length, codePoints: [...raw[f]].length },
      replacement: { text, utf16: text.length, codePoints: [...text].length },
    };
    raw[f] = text;
  }
  mkdirSync(dir);
  writeFileSync(join(dir, 'entry.json'), JSON.stringify(raw, null, 2));
  copyFileSync(join(output, 'index.html'), join(dir, 'index.html'));
  const htmlSha256 = createHash('sha256').update(readFileSync(join(output, 'index.html'))).digest('hex');
  const audit = { reason: errors, algorithm: ALGORITHM, maxUtf16: NEW_LIMITS.description, fields, htmlSha256, source: 'output/entry.json', repaired: 'repaired/entry.json' };
  writeFileSync(join(run, 'metadata-repair.json'), JSON.stringify(audit, null, 2));
  return { dir, summary: { status: 'applied', audit: 'metadata-repair.json', fields: Object.keys(fields) } };
}
