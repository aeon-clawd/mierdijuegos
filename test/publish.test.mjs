import {test} from 'node:test';
import assert from 'node:assert/strict';
import { checkPublishScope, verifiedGame } from '../scripts/lib/publish.mjs';
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
