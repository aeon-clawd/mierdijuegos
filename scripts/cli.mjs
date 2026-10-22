#!/usr/bin/env node
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, repoPaths } from './lib/paths.mjs';
import { loadCatalog, validateCatalog } from './lib/catalog.mjs';
import { runNightly } from './lib/nightly.mjs';
import { generate, generateFromSaved, resolveSavedRun } from './lib/generate.mjs';
import { smokeGame } from './lib/smoke.mjs';
import { publishGame } from './lib/publish.mjs';
import { command } from './lib/command.mjs';
import { madridDate } from './lib/dates.mjs';

const [action,...args]=process.argv.slice(2),root=REPO_ROOT,p=repoPaths(root);
mkdirSync(p.local,{recursive:true});
const smoke=async o=>{const result=await smokeGame(o);writeFileSync(join(o.run,'smoke.json'),JSON.stringify(result,null,2));};
const build=async({site,run})=>command('npm',['run','build'],{cwd:site,log:join(run,'build.log'),timeout:120000});
try {
  if(action==='preflight') {
    if(args.length) throw new Error('preflight does not take arguments');
    const catalog=loadCatalog(p.catalog),check=validateCatalog(catalog,{gamesDir:p.gamesDir});
    if(check.errors.length) throw new Error(check.errors.join('\n'));
    const claude=command('claude',['--version'],{cwd:root}).trim();
    const auth=JSON.parse(command('claude',['auth','status'],{cwd:root}));
    if(!auth.loggedIn) throw new Error('Claude is not authenticated');
    command('gh',['auth','status'],{cwd:root});
    command('vercel',['whoami'],{cwd:root});
    const project=JSON.parse(readFileSync(join(root,'.vercel/project.json'),'utf8'));
    if(project.projectId!=='prj_7XSsoVEPcCXNqYEF3EOLt8MPJdom') throw new Error('wrong Vercel project');
    command('vercel',['project','inspect','mierdijuegos'],{cwd:root});
    const remote=command('git',['remote','get-url','origin'],{cwd:root}).trim();
    if(remote!=='https://github.com/aeon-clawd/mierdijuegos.git') throw new Error('wrong origin');
    command('git',['ls-remote','origin','HEAD'],{cwd:root});
    command('npm',['test'],{cwd:root,timeout:120000,log:join(p.local,'preflight-tests.log')});
    command('npm',['run','build'],{cwd:root,timeout:120000,log:join(p.local,'preflight-build.log')});
    const result={status:'preflight-ok',games:catalog.length,date:madridDate(),timezone:'Europe/Madrid',claude,model:process.env.MIERDI_MODEL||'opus',github:true,vercel:true,browser:'real Chromium fixture tests passed',llmGeneration:'not exercised; auth does not establish available quota',warnings:check.warnings};
    writeFileSync(join(p.local,'preflight.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
  } else if(action==='nightly') {
    const usage='usage: npm run nightly -- [--resume RUN_STAMP] [--publish]';
    const rest=[...args],ri=rest.indexOf('--resume');
    // --resume reuses a genuine saved Claude response from .local/runs/RUN_STAMP; it never calls Claude.
    const from=ri<0?null:resolveSavedRun(root,rest.splice(ri,2)[1]);
    if(rest.some(a=>a!=='--publish')||rest.length>1) throw new Error(usage);
    const result=await runNightly({root,generate:from?o=>generateFromSaved({...o,from}):generate,smoke,build});
    console.log(JSON.stringify(result,null,2));
    // Only a run validated just now is auto-published; pending retries stay explicit (npm run publish).
    if(args.includes('--publish')&&result.status==='ready') console.log(JSON.stringify(await publishGame({root,id:result.entry.id}),null,2));
  } else if(action==='publish') {
    const [id,confirm]=args;
    if(!id||confirm!=='--yes'||args.length!==2) throw new Error('usage: npm run publish -- NNN-slug --yes (real production deploy + Git push)');
    console.log(JSON.stringify(await publishGame({root,id}),null,2));
  } else throw new Error('usage: node scripts/cli.mjs preflight | nightly [--resume RUN_STAMP] [--publish] | publish NNN-slug --yes');
} catch(e) {console.error(`MIERDIJUEGOS FAILED: ${e.message}`);process.exitCode=1;}
