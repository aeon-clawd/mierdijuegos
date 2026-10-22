import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseClaudeResponse, buildPrompt, resolveSavedRun, generateFromSaved } from '../scripts/lib/generate.mjs';
const audit={ 'claude-opus-5-5': {inputTokens:1} };
test('Claude response requires real successful structured output plus model audit',()=>{
 const output={entry:{slug:'a'},html:'<!doctype html>'};
 assert.deepEqual(parseClaudeResponse(JSON.stringify({subtype:'success',structured_output:output,modelUsage:audit})).output,output);
});
test('quota text is failure even when Claude labels the result success',()=>{
 assert.throws(()=>parseClaudeResponse(JSON.stringify({subtype:'success',result:"You have hit your session limit",modelUsage:audit})),/limit/i);
 assert.throws(()=>parseClaudeResponse(JSON.stringify({subtype:'error_max_turns',modelUsage:audit})),/success/);
 assert.throws(()=>parseClaudeResponse(JSON.stringify({subtype:'success',structured_output:{entry:{},html:'x'}})),/model/);
 assert.throws(()=>parseClaudeResponse('not json'),/JSON/);
});
test('valid structured success is not quota even if result echoes HTML mentioning hit limit and resets',()=>{
 // Regression: real run 2026-10-22T054232-eiss — result duplicates the game, whose prose/code says "hit ... limit" and "resets".
 const html='<!doctype html><p>If you hit the speed limit the board resets.</p><script>if(hits>limit)resets++;</script>';
 const output={entry:{slug:'ventanilla-tres'},html};
 const raw=JSON.stringify({subtype:'success',is_error:false,result:JSON.stringify(output),structured_output:output,modelUsage:audit,usage:{output_tokens:9},session_id:'s1'});
 const r=parseClaudeResponse(raw);
 assert.equal(r.output.html,html);
 assert.equal(r.session_id,'s1');
});
test('limit error message is bounded',()=>{
 const long=`You have hit your usage limit · resets 5am ${'x'.repeat(50000)}`;
 assert.throws(()=>parseClaudeResponse(JSON.stringify({subtype:'success',result:long,modelUsage:audit})),e=>/limit/i.test(e.message)&&e.message.length<1000);
});

function fixtureRoot() {
 const root=mkdtempSync(join(tmpdir(),'mierdi-resume-'));
 mkdirSync(join(root,'scripts'),{recursive:true});
 writeFileSync(join(root,'scripts/generate-game.md'),'TEST-ONLY generator contract');
 return root;
}
const ctx={catalog:[{id:'001-a',date:'2026-10-21'}],number:2,today:'2026-10-22'};
function savedRun(root,stamp,{prompt}={}) {
 const dir=join(root,'.local/runs',stamp);
 mkdirSync(dir,{recursive:true});
 writeFileSync(join(dir,'prompt.txt'),prompt??buildPrompt({root,...ctx}));
 const output={entry:{slug:'b'},html:'<!doctype html><p>hit limit, resets</p>'};
 writeFileSync(join(dir,'claude.raw.log'),JSON.stringify({subtype:'success',is_error:false,result:JSON.stringify(output),structured_output:output,modelUsage:audit,usage:{output_tokens:5},session_id:'orig'})+'\n\n');
 return dir;
}
test('resume id must be a strict run stamp under .local/runs',()=>{
 const root=fixtureRoot();
 savedRun(root,'2026-10-22T054232-eiss');
 assert.equal(resolveSavedRun(root,'2026-10-22T054232-eiss'),join(root,'.local/runs/2026-10-22T054232-eiss'));
 for(const bad of ['../2026-10-22T054232-eiss','2026-10-22T054232-EISS','2026-10-22T054232-eiss/..','/tmp/x','2026-10-22T05423-eiss','2026-10-22T054232-eiss-x','',undefined,'2026-10-22T054232-ei.s'])
  assert.throws(()=>resolveSavedRun(root,bad),/run stamp/,String(bad));
 assert.throws(()=>resolveSavedRun(root,'2026-10-22T000000-none'),/not found/);
 // A symlinked run dir pointing outside .local/runs is rejected.
 const outside=mkdtempSync(join(tmpdir(),'mierdi-outside-'));
 symlinkSync(outside,join(root,'.local/runs/2026-10-22T111111-link'));
 assert.throws(()=>resolveSavedRun(root,'2026-10-22T111111-link'),/outside/);
});
test('resume refuses a saved prompt that differs from the current expected prompt',()=>{
 const root=fixtureRoot();
 const from=savedRun(root,'2026-10-22T054232-eiss',{prompt:buildPrompt({root,...ctx,number:3})});
 const run=join(root,'.local/runs/new'),output=join(run,'output');mkdirSync(output,{recursive:true});
 assert.throws(()=>generateFromSaved({root,output,run,...ctx,from}),/prompt/);
 assert.ok(!existsSync(join(output,'entry.json')));
 assert.ok(!existsSync(join(output,'index.html')));
});
test('resume writes saved genuine output into the new run without calling Claude',()=>{
 const root=fixtureRoot();
 const from=savedRun(root,'2026-10-22T054232-eiss');
 const run=join(root,'.local/runs/new'),output=join(run,'output');mkdirSync(output,{recursive:true});
 const r=generateFromSaved({root,output,run,...ctx,from});
 assert.deepEqual(r,{modelUsage:audit,usage:{output_tokens:5},session_id:'orig',recoveredFrom:from});
 assert.deepEqual(JSON.parse(readFileSync(join(output,'entry.json'),'utf8')),{slug:'b'});
 assert.equal(readFileSync(join(output,'index.html'),'utf8'),'<!doctype html><p>hit limit, resets</p>');
 assert.equal(readFileSync(join(run,'prompt.txt'),'utf8'),buildPrompt({root,...ctx}));
});
