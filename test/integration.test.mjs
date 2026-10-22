import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,symlinkSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {REPO_ROOT} from '../scripts/lib/paths.mjs';
import {runNightly} from '../scripts/lib/nightly.mjs';
import {command} from '../scripts/lib/command.mjs';
import {smokeGame} from '../scripts/lib/smoke.mjs';
test('TEST-ONLY generator, REAL Chromium and REAL Astro: complete staged promotion without touching live games',async()=>{
 const root=mkdtempSync(join(tmpdir(),'mierdi-e2e-test-'));
 const livePath=join(REPO_ROOT,'public/games/games.json');
 const liveBefore=readFileSync(livePath,'utf8');
 const baseline=JSON.parse(liveBefore);
 const nextId=String(Math.max(...baseline.map(g=>Number.parseInt(g.id,10)))+1).padStart(3,'0')+'-test-only-e2e';
 for(const n of ['public','src','package.json','package-lock.json','astro.config.mjs','tsconfig.json'])cpSync(join(REPO_ROOT,n),join(root,n),{recursive:true});
 symlinkSync(join(REPO_ROOT,'node_modules'),join(root,'node_modules'),'dir');
 const html=readFileSync(new URL('./fixtures/test-only-good-game.html',import.meta.url),'utf8');
 const out=await runNightly({root,today:'2099-10-21',generate:async({output,catalog})=>{
  writeFileSync(join(output,'index.html'),html);
  writeFileSync(join(output,'entry.json'),JSON.stringify({slug:'test-only-e2e',title:'Prueba no publicable',description:'Fixture, no LLM',mechanic:'Test-only fixture',emoji:'🧪',novelty:{candidates:[{name:'a',mechanic:'a'},{name:'b',mechanic:'b'},{name:'c',mechanic:'c'}],chosen:0,nearest:[{id:catalog[0].id,difference:'Test-only'}],differs_in:['rules']}}));
  return {testOnly:true};
 },smoke:smokeGame,build:async({site,run})=>command('npm',['run','build'],{cwd:site,timeout:120000,log:join(run,'real-astro-build.log')})});
 assert.equal(out.status,'ready');assert.equal(out.entry.id,nextId);
 assert.equal(JSON.parse(readFileSync(join(root,'public/games/games.json'))).length,baseline.length+1);
 assert.equal(readFileSync(livePath,'utf8'),liveBefore);
});
