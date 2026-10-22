import {test} from 'node:test';
import assert from 'node:assert/strict';
import { checkPublishScope, verifiedGame, verifiedDeployment, verifiedRemoteCommit } from '../scripts/lib/publish.mjs';
test('publisher refuses unrelated or staged secrets, traversal and empty ids',()=>{
 assert.doesNotThrow(()=>checkPublishScope(['public/games/games.json','public/games/035-test/index.html'],'035-test'));
 for(const paths of [['.env'],['src/pages/index.astro'],['public/games/034-old/index.html']]) assert.throws(()=>checkPublishScope(paths,'035-test'),/unrelated/);
 assert.throws(()=>checkPublishScope([],'../evil'),/id/);
});
test('deployment readback must be HTTP 200 and exact game HTML, not a CLI success',async()=>{
 const html='<!doctype html>test';
 const testOnlyFetch=async()=>({status:200,text:async()=>html});
 assert.equal(await verifiedGame('https://mierdijuegos.com','035-test',html,testOnlyFetch),true);
 await assert.rejects(verifiedGame('https://mierdijuegos.com','035-test',html,async()=>({status:200,text:async()=>'old page'})),/readback/);
 await assert.rejects(verifiedGame('https://evil.example','035-test',html,testOnlyFetch),/host/);
});
test('protected deployment readback uses authenticated vercel curl with bounded timeout and exact HTML',async()=>{
 const html='<!doctype html>test',dep='https://mierdijuegos-1uzz6223t-diug22s-projects.vercel.app',calls=[];
 const testOnlyRun=(bin,args,opts)=>{calls.push({bin,args,opts});return html;};
 assert.equal(await verifiedDeployment(dep,'035-test',html,{cwd:'/repo',run:testOnlyRun}),true);
 assert.equal(calls[0].bin,'vercel');
 assert.deepEqual(calls[0].args,['curl','/games/035-test/','--deployment',dep,'--','--fail','--silent','--show-error','--max-time','20']);
 assert.equal(calls[0].opts.cwd,'/repo');
 assert.ok(calls[0].opts.timeout>0&&calls[0].opts.timeout<=60000);
 await assert.rejects(verifiedDeployment(dep,'035-test',html,{run:()=>'<html>Log in to Vercel</html>'}),/readback/);
 for(const bad of ['http://x.vercel.app','https://evil.example','https://x.vercel.app.evil.example','https://a.b.vercel.app','https://x.vercel.app:8443','https://u:p@x.vercel.app','https://x.vercel.app/path','https://x.vercel.app/?q=1','--help'])
  await assert.rejects(verifiedDeployment(bad,'035-test',html,{run:()=>{throw new Error('must not run CLI');}}),/host|URL/i);
 await assert.rejects(verifiedDeployment(dep,'../evil',html,{run:()=>html}),/id/);
});
test('remote Git readback must match the exact commit',()=>{
 const sha='26f5662a97d7c28d11315c34e314f996066d1aa2',calls=[];
 const git=args=>{calls.push(args);return `${sha}\trefs/heads/master\n`;};
 assert.equal(verifiedRemoteCommit(git,'master',sha),true);
 assert.deepEqual(calls[0],['ls-remote','origin','refs/heads/master']);
 assert.throws(()=>verifiedRemoteCommit(git,'master','0'.repeat(40)),/GitHub/);
});
