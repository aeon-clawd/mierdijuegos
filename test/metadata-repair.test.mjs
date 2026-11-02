// TEST-ONLY fixtures: fake generator, no LLM call, no deployment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { runNightly } from '../scripts/lib/nightly.mjs';
import { validateNewEntry } from '../scripts/lib/catalog.mjs';
import { shortenText } from '../scripts/lib/metadata-repair.mjs';
import { buildPrompt, generateFromSaved } from '../scripts/lib/generate.mjs';
const html = readFileSync(new URL('./fixtures/test-only-good-game.html', import.meta.url), 'utf8');
const sha = s => createHash('sha256').update(s).digest('hex');
const legacy = {id:'007-legacy',title:'Legacy',date:'2026-01-01',description:'d',mechanic:'m',emoji:'🎮'};
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mierdi-repair-test-'));
  mkdirSync(join(root, 'public/games/007-legacy'), { recursive: true });
  writeFileSync(join(root, 'public/games/007-legacy/index.html'), '<html>legacy</html>');
  writeFileSync(join(root, 'public/games/games.json'), JSON.stringify([legacy]));
  return root;
}
const novelty = {candidates:[{name:'a',mechanic:'a'},{name:'b',mechanic:'b'},{name:'c',mechanic:'c'}],chosen:0,nearest:[{id:'007-legacy',difference:'Regla distinta'}],differs_in:['rules']};
const entryJson = fields => JSON.stringify({slug:'test-largo',title:'Largo',description:'Prueba',mechanic:'Prueba',emoji:'🎮',novelty,...fields},null,2);
// Shaped like run 2026-11-02T031522-a3am: valid game, only description/mechanic over 300.
const longDescription = 'Sirves chupitos de capas sin que se mezclen. '.repeat(9).trim();
const longMechanic = 'Mantén pulsado para verter y suelta a tiempo para que cada capa flote sobre la anterior sin desbordar el vaso '.repeat(4).trim();
function generator(fields, gameHtml = html) {
  const calls = [];
  const generate = async ({ output }) => {
    calls.push(output);
    writeFileSync(join(output, 'index.html'), gameHtml);
    writeFileSync(join(output, 'entry.json'), entryJson(fields));
    return { modelUsage: {'TEST-ONLY-NOT-LLM':{}}, session_id: 'test-only' };
  };
  return { generate, calls };
}
const today = '2026-10-21';
const base = { today, smoke: async () => {}, build: async () => {} };

test('overlong description/mechanic only: deterministic repair, audit, same HTML, then normal promotion; same day no-op', async () => {
  const root = fixture(), g = generator({ description: longDescription, mechanic: longMechanic });
  let smoked = 0;
  const out = await runNightly({ ...base, root, generate: g.generate, smoke: async () => { smoked++; } });
  assert.equal(out.status, 'ready');
  assert.equal(smoked, 1);
  assert.equal(out.entry.id, '008-test-largo');
  for (const f of ['description', 'mechanic']) {
    assert.ok(out.entry[f].length <= 300 && out.entry[f].trim().length > 0, f);
  }
  assert.deepEqual(validateNewEntry(out.entry, [legacy], { today, expectedNumber: 8 }), []);
  // Generator provenance and generator output are untouched.
  assert.deepEqual(out.generator, { modelUsage: {'TEST-ONLY-NOT-LLM':{}}, session_id: 'test-only' });
  assert.equal(readFileSync(join(out.run, 'output/entry.json'), 'utf8'), entryJson({ description: longDescription, mechanic: longMechanic }));
  assert.equal(readFileSync(join(out.run, 'output/index.html'), 'utf8'), html);
  // HTML promoted byte-for-byte.
  assert.equal(readFileSync(join(root, 'public/games/008-test-largo/index.html'), 'utf8'), html);
  assert.equal(out.htmlSha256, sha(html));
  const audit = JSON.parse(readFileSync(join(out.run, 'metadata-repair.json'), 'utf8'));
  assert.equal(audit.htmlSha256, sha(html));
  assert.deepEqual(audit.reason, ['field "description" longer than 300 characters', 'field "mechanic" longer than 300 characters']);
  assert.equal(typeof audit.algorithm, 'string');
  assert.equal(audit.maxUtf16, 300);
  assert.deepEqual(audit.fields.description.original, { text: longDescription, utf16: longDescription.length, codePoints: [...longDescription].length });
  assert.equal(audit.fields.description.replacement.text, out.entry.description);
  assert.equal(audit.fields.description.replacement.utf16, out.entry.description.length);
  assert.equal(audit.fields.mechanic.original.text, longMechanic);
  assert.equal(audit.fields.mechanic.replacement.text, out.entry.mechanic);
  assert.deepEqual(out.metadataRepair, { status: 'applied', audit: 'metadata-repair.json', fields: ['description', 'mechanic'] });
  assert.deepEqual(JSON.parse(readFileSync(join(root, '.local/ready.json'), 'utf8')).metadataRepair, out.metadataRepair);
  assert.equal((await runNightly({ ...base, root, generate: g.generate })).status, 'already-exists');
  assert.equal(g.calls.length, 1);
});

for (const [name, fields, gameHtml] of [
  ['overlong title', { description: longDescription, title: 'T'.repeat(41) }],
  ['invalid slug', { mechanic: longMechanic, slug: 'Mal Slug' }],
  ['invalid HTML', { description: longDescription }, '<html>no contract</html>'],
]) {
  test(`overlong metadata plus ${name}: no repair, original errors, no smoke, no promotion`, async () => {
    const root = fixture(), path = join(root, 'public/games/games.json'), before = readFileSync(path, 'utf8');
    let smoked = false, run;
    const g = generator(fields, gameHtml);
    await assert.rejects(runNightly({ ...base, root, generate: async o => { run = o.run; return g.generate(o); }, smoke: async () => { smoked = true; } }), /longer than 300/);
    assert.equal(smoked, false);
    assert.equal(readFileSync(path, 'utf8'), before);
    assert.equal(existsSync(join(run, 'metadata-repair.json')), false);
    const result = JSON.parse(readFileSync(join(run, 'result.json'), 'utf8'));
    assert.equal(result.status, 'failed');
    assert.equal(result.metadataRepair, undefined);
    assert.equal(existsSync(join(root, '.local/ready.json')), false);
  });
}

test('exactly 300 characters is valid and untouched: no repair, no audit', async () => {
  const exact = 'a'.repeat(299) + '.', root = fixture();
  assert.equal(shortenText(exact, 300), exact);
  const out = await runNightly({ ...base, root, generate: generator({ description: exact, mechanic: exact }).generate });
  assert.equal(out.status, 'ready');
  assert.equal(out.entry.description, exact);
  assert.equal(out.entry.mechanic, exact);
  assert.equal(out.metadataRepair, undefined);
  assert.equal(existsSync(join(out.run, 'metadata-repair.json')), false);
  assert.equal(existsSync(join(out.run, 'repaired')), false);
});

test('sentence boundary: keeps the longest run of whole sentences, no ellipsis', () => {
  const sentences = Array.from({ length: 12 }, (_, i) => `Frase ${i} con algo de chicha, vale${'!?.'[i % 3]}`);
  const text = sentences.join(' ');
  let expected = '';
  for (const s of sentences) { const next = expected ? `${expected} ${s}` : s; if (next.length > 300) break; expected = next; }
  assert.ok(text.length > 300 && expected.length > 150);
  assert.equal(shortenText(text, 300), expected);
});

test('word boundary with ellipsis when there is no usable sentence end', () => {
  const text = 'Hola. ' + 'arrastra la jarra hasta el vaso '.repeat(12).trim();
  const out = shortenText(text, 300);
  assert.ok(out.length <= 300, String(out.length));
  assert.ok(out.endsWith('…'));
  const kept = out.slice(0, -1);
  assert.ok(text.startsWith(kept));
  assert.match(text[kept.length], /\s/);
  assert.doesNotMatch(kept, /\s$/);
  assert.ok(kept.length > 250);
  assert.equal(shortenText(text, 300), out);
});

test('emoji: never splits a surrogate pair, stays nonempty, at word or hard boundary', () => {
  for (const text of ['🍸'.repeat(200), '🍸🍹🥃 '.repeat(60), 'x' + '🍸'.repeat(200), 'Supercalifragilístico'.repeat(20)]) {
    const out = shortenText(text, 300);
    assert.ok(out.length <= 300 && out.length > 1, text.slice(0, 10));
    assert.ok(out.isWellFormed(), `lone surrogate for ${text.slice(0, 10)}`);
    assert.ok(out.endsWith('…'));
    assert.ok(text.startsWith(out.slice(0, -1)));
  }
});

test('emoji-only overlong description passes the same validator after repair', async () => {
  const root = fixture(), description = '🍸'.repeat(301);
  const out = await runNightly({ ...base, root, generate: generator({ description }).generate });
  assert.equal(out.status, 'ready');
  assert.ok(out.entry.description.isWellFormed() && out.entry.description.length <= 300);
  assert.deepEqual(out.metadataRepair.fields, ['description']);
  assert.equal(out.entry.mechanic, 'Prueba');
});

for (const stage of ['smoke', 'build']) {
  test(`repaired metadata with a failing ${stage}: no promotion, audit kept, run marked failed`, async () => {
    const root = fixture(), path = join(root, 'public/games/games.json'), before = readFileSync(path, 'utf8');
    let run;
    const g = generator({ description: longDescription, mechanic: longMechanic });
    await assert.rejects(runNightly({ ...base, root, generate: async o => { run = o.run; return g.generate(o); }, [stage]: async () => { throw new Error(`TEST-ONLY intentional ${stage}`); } }), /TEST-ONLY/);
    assert.equal(readFileSync(path, 'utf8'), before);
    assert.equal(existsSync(join(root, 'public/games/008-test-largo')), false);
    assert.equal(existsSync(join(root, '.local/ready.json')), false);
    assert.equal(existsSync(join(root, '.local/nightly.lock')), false);
    assert.ok(existsSync(join(run, 'metadata-repair.json')));
    const result = JSON.parse(readFileSync(join(run, 'result.json'), 'utf8'));
    assert.equal(result.status, 'failed');
    assert.equal(result.metadataRepair.status, 'applied');
  });
}

test('saved-run recovery (--resume path) repairs the same way and keeps the raw Claude response byte-for-byte', async () => {
  const root = fixture();
  mkdirSync(join(root, 'scripts'));
  writeFileSync(join(root, 'scripts/generate-game.md'), 'TEST-ONLY generator contract');
  const from = join(root, '.local/runs/2026-10-21T031522-test');
  mkdirSync(from, { recursive: true });
  writeFileSync(join(from, 'prompt.txt'), buildPrompt({ root, catalog: [legacy], number: 8, today }));
  const output = { entry: JSON.parse(entryJson({ description: longDescription, mechanic: longMechanic })), html };
  const raw = JSON.stringify({ subtype: 'success', is_error: false, result: JSON.stringify(output), structured_output: output, modelUsage: {'TEST-ONLY-NOT-LLM':{}}, usage: { output_tokens: 1 }, session_id: 'saved' }) + '\n';
  writeFileSync(join(from, 'claude.raw.log'), raw);
  const out = await runNightly({ ...base, root, generate: o => generateFromSaved({ ...o, from }) });
  assert.equal(out.status, 'ready');
  assert.deepEqual(out.generator, { modelUsage: {'TEST-ONLY-NOT-LLM':{}}, usage: { output_tokens: 1 }, session_id: 'saved', recoveredFrom: from });
  assert.deepEqual(out.metadataRepair.fields, ['description', 'mechanic']);
  assert.equal(readFileSync(join(out.run, 'claude.json'), 'utf8'), raw);
  assert.equal(readFileSync(join(from, 'claude.raw.log'), 'utf8'), raw);
  assert.equal(readFileSync(join(root, 'public/games/008-test-largo/index.html'), 'utf8'), html);
  assert.equal(JSON.parse(readFileSync(join(out.run, 'metadata-repair.json'), 'utf8')).htmlSha256, sha(html));
});
