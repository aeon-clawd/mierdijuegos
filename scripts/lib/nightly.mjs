import { mkdirSync, readFileSync, writeFileSync, cpSync, existsSync, symlinkSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { repoPaths } from './paths.mjs';
import { madridDate, runStamp } from './dates.mjs';
import { acquireLock } from './lock.mjs';
import { loadCatalog, validateCatalog, nextGameNumber } from './catalog.mjs';
import { readGeneratorOutput } from './generator-output.mjs';
import { RANKING_AUTO } from './ranking-seed.mjs';

export function prepareSite(root, site) {
  mkdirSync(site, { recursive: true });
  for (const name of ['public','src','package.json','package-lock.json','astro.config.mjs','tsconfig.json']) {
    if (existsSync(join(root,name))) cpSync(join(root,name),join(site,name),{recursive:true});
  }
  if (existsSync(join(root,'node_modules'))) symlinkSync(join(root,'node_modules'),join(site,'node_modules'),'dir');
}

// Dependency injection exists only for tests. Production CLI supplies real Claude,
// Chromium smoke and Astro build; no synthetic fallback is ever selected.
export async function runNightly({ root, today=madridDate(), generate, smoke, build }) {
  const p=repoPaths(root), release=acquireLock(p.lock);
  let run, result;
  try {
    const baseline=readFileSync(p.catalog,'utf8'), catalog=loadCatalog(p.catalog);
    const check=validateCatalog(catalog,{gamesDir:p.gamesDir});
    if(check.errors.length) throw new Error(check.errors.join('\n'));
    const existing=catalog.find(g=>g.date===today);
    if(existing) return {status:'already-exists',entry:existing};
    // A validated but unpublished game is the recovery pointer for an explicit
    // `npm run publish -- <id> --yes`; never replace it with a new generation.
    const readyPath=join(p.local,'ready.json');
    if(existsSync(readyPath)) {
      const ready=JSON.parse(readFileSync(readyPath,'utf8'));
      if(ready.status==='ready'&&ready.entry?.date!==today) throw new Error(`pending unpublished game ${ready.entry?.id} (${ready.entry?.date}); retry with npm run publish -- ${ready.entry?.id} --yes before generating another`);
    }
    run=join(p.runs,runStamp());
    const output=join(run,'output'),site=join(run,'site');
    mkdirSync(output,{recursive:true});
    result={status:'generating',today,run};
    const save=()=>writeFileSync(join(run,'result.json'),JSON.stringify(result,null,2));
    save();
    const number=nextGameNumber(catalog);
    result.generator=await generate({root,output,run,catalog,number,today});
    const parsed=readGeneratorOutput(output,{catalog,number,today});
    if(parsed.errors.length) throw new Error(parsed.errors.join('\n'));
    result.entry=parsed.entry;
    result.novelty=parsed.novelty;
    result.status='validating';save();
    prepareSite(root,site);
    const stageGames=join(site,'public/games');
    mkdirSync(join(stageGames,parsed.entry.id));
    writeFileSync(join(stageGames,parsed.entry.id,'index.html'),parsed.html);
    const next=[...catalog,parsed.entry];
    writeFileSync(join(stageGames,'games.json'),JSON.stringify(next,null,2)+'\n');
    await smoke({root,site,entry:parsed.entry,run});
    await build({root,site,run});
    // Guard human changes while the generator was running, too.
    if(readFileSync(p.catalog,'utf8')!==baseline) throw new Error('catalog changed during generation; refusing promotion');
    const target=join(p.gamesDir,parsed.entry.id);
    if(existsSync(target)) throw new Error('target game directory already exists');
    const pending=join(p.gamesDir,`.pending-${parsed.entry.id}`);
    const catalogTemp=join(p.gamesDir,`.catalog-${process.pid}.tmp`);
    try {
      mkdirSync(pending);
      writeFileSync(join(pending,'index.html'),parsed.html);
      writeFileSync(catalogTemp,JSON.stringify(next,null,2)+'\n');
      renameSync(pending,target);
      try { renameSync(catalogTemp,p.catalog); }
      catch(e) { rmSync(target,{recursive:true,force:true});throw e; }
    } finally {
      rmSync(pending,{recursive:true,force:true});rmSync(catalogTemp,{force:true});
    }
    result.status='ready';
    // No ranking seed: once published, the mierdi-ranking Edge Function validates the id against the
    // live catalog and the RPC creates the row on the first submission. No Supabase credentials here.
    result.ranking=RANKING_AUTO;
    result.htmlSha256=createHash('sha256').update(parsed.html).digest('hex');
    result.catalogSha256=createHash('sha256').update(readFileSync(p.catalog)).digest('hex');
    save();
    writeFileSync(join(p.local,'ready.json'),JSON.stringify(result,null,2));
    return result;
  } catch(e) {
    if(run) {result={...result,status:'failed',error:e.message};writeFileSync(join(run,'result.json'),JSON.stringify(result,null,2));}
    throw e;
  } finally { release(); }
}
