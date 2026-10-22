import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runNightly } from '../scripts/lib/nightly.mjs';
const html = readFileSync(new URL('./fixtures/test-only-good-game.html', import.meta.url), 'utf8');
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mierdi-pipeline-test-'));
  mkdirSync(join(root, 'public/games/007-legacy'), { recursive: true });
  writeFileSync(join(root, 'public/games/007-legacy/index.html'), '<html>legacy</html>');
  writeFileSync(join(root, 'public/games/games.json'), JSON.stringify([{id:'007-legacy',title:'Legacy',date:'2026-01-01',description:'d',mechanic:'m',emoji:'🎮'}]));
  return root;
}
function testOnlyGenerate({ output }) {
  writeFileSync(join(output, 'index.html'), html);
  writeFileSync(join(output, 'entry.json'), JSON.stringify({slug:'test-nuevo',title:'Nuevo',description:'Prueba',mechanic:'Prueba',emoji:'🎮',novelty:{candidates:[{name:'a',mechanic:'a'},{name:'b',mechanic:'b'},{name:'c',mechanic:'c'}],chosen:0,nearest:[{id:'007-legacy',difference:'Regla distinta'}],differs_in:['rules']}}));
  return { modelUsage: {'TEST-ONLY-NOT-LLM':{}} };
}
const today = '2026-10-21';
const base = { today, generate: testOnlyGenerate, smoke: async () => {}, build: async () => {} };
test('test-only generation stages and validates before adding exactly one game; same day rerun is a no-op', async () => {
  const root = fixture();
  let calls=0;
  const opts = { ...base, root, generate: async o => {calls++; return testOnlyGenerate(o);} };
  const out = await runNightly(opts);
  assert.equal(out.status, 'ready');
  assert.equal(out.entry.id, '008-test-nuevo');
  assert.ok(existsSync(join(root, 'public/games/008-test-nuevo/index.html')));
  assert.equal(JSON.parse(readFileSync(join(root, 'public/games/games.json'))).length, 2);
  assert.equal((await runNightly(opts)).status, 'already-exists');
  assert.equal(calls, 1);
});
for (const stage of ['generate','smoke','build']) {
  test(`a failing ${stage} leaves live catalog and games untouched and releases lock`, async () => {
    const root=fixture(), path=join(root,'public/games/games.json'), before=readFileSync(path,'utf8');
    await assert.rejects(runNightly({...base,root,[stage]:async()=>{throw new Error('TEST-ONLY intentional '+stage);}}), /TEST-ONLY/);
    assert.equal(readFileSync(path,'utf8'),before);
    assert.equal(existsSync(join(root,'public/games/008-test-nuevo')),false);
    assert.equal(existsSync(join(root,'.local/nightly.lock')),false);
  });
}
test('bad output cannot reach browser/build or modify the live catalog', async()=>{
 const root=fixture(); let checked=false;
 await assert.rejects(runNightly({...base,root,generate:async({output})=>{writeFileSync(join(output,'entry.json'),'{}');},smoke:async()=>{checked=true;}}), /index.html/);
 assert.equal(checked,false);
});
test('an unpublished ready game blocks the next date instead of overwriting the recovery pointer', async()=>{
 const root=fixture();await runNightly({...base,root});
 let calls=0;
 await assert.rejects(runNightly({...base,root,today:'2026-10-22',generate:async o=>{calls++;return testOnlyGenerate(o);}}),/pending|unpublished/);
 assert.equal(calls,0);
 assert.equal(JSON.parse(readFileSync(join(root,'.local/ready.json'))).entry.id,'008-test-nuevo');
});
test('a published ready pointer allows the next date to generate', async()=>{
 const root=fixture();await runNightly({...base,root});
 const path=join(root,'.local/ready.json');
 writeFileSync(path,JSON.stringify({...JSON.parse(readFileSync(path)),status:'published'}));
 const gen=async({output})=>{testOnlyGenerate({output});const e=JSON.parse(readFileSync(join(output,'entry.json')));writeFileSync(join(output,'entry.json'),JSON.stringify({...e,slug:'test-otro',title:'Otro'}));};
 const out=await runNightly({...base,root,today:'2026-10-22',generate:gen});
 assert.equal(out.status,'ready');assert.equal(out.entry.id,'009-test-otro');
});

test('concurrent nightly run fails closed rather than generating twice', async()=>{
 const root=fixture(); let unblock; const blocked=new Promise(r=>{unblock=r;}); let entered;
 const started=new Promise(r=>{entered=r;});
 const first=runNightly({...base,root,generate:async o=>{entered();await blocked;return testOnlyGenerate(o);}});
 await started;
 await assert.rejects(runNightly({...base,root}), /lock/);
 unblock(); await first;
});
