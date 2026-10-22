#!/usr/bin/env node
// Read-only re-check of the last publish: no deploy, no generation, ready.json untouched.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { REPO_ROOT, repoPaths } from './lib/paths.mjs';
import { command } from './lib/command.mjs';
import { parseId } from './lib/catalog.mjs';
import { verifiedGame, verifiedDeployment, verifiedRemoteCommit } from './lib/publish.mjs';

const root=REPO_ROOT,p=repoPaths(root),out=join(p.local,'deploy-verification.json');
const result={checkedAt:new Date().toISOString(),status:'failed',checks:{}};
try {
  const record=JSON.parse(readFileSync(join(p.local,'publish-result.json'),'utf8'));
  const {id,deployment,commit}=record;
  if(!parseId(id)||!deployment||!commit) throw new Error('publish-result.json lacks id/deployment/commit');
  const html=readFileSync(join(p.gamesDir,id,'index.html'),'utf8');
  Object.assign(result,{id,deployment,commit,htmlSha256:createHash('sha256').update(html).digest('hex')});
  const check=async(name,fn)=>{try{await fn();result.checks[name]='ok';}catch(e){result.checks[name]=`failed: ${e.message}`;}};
  await check('deployment',()=>verifiedDeployment(deployment,id,html,{cwd:root}));
  await check('canonical',()=>verifiedGame('https://mierdijuegos.com',id,html));
  await check('github',()=>verifiedRemoteCommit(args=>command('git',args,{cwd:root}),'master',commit));
  if(Object.values(result.checks).every(v=>v==='ok')) result.status='verified';
} catch(e) {result.error=e.message;}
writeFileSync(out,JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
if(result.status!=='verified') process.exitCode=1;
