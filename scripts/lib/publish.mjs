import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { command } from './command.mjs';
import { parseId,loadCatalog,validateCatalog } from './catalog.mjs';
import { validateNewGameHtml } from './game-html.mjs';
import { acquireLock } from './lock.mjs';
import { smokeGame } from './smoke.mjs';
import { repoPaths } from './paths.mjs';

export function checkPublishScope(changed,id) {
  if(!parseId(id)) throw new Error('invalid game id');
  const allowed=new Set(['public/games/games.json',`public/games/${id}/index.html`]);
  for(const file of changed) if(!allowed.has(file)) throw new Error(`unrelated change blocks publishing: ${file}`);
}
export async function verifiedGame(origin,id,expected,fetcher=fetch) {
  const u=new URL(origin);
  if(u.protocol!=='https:'||!(u.hostname==='mierdijuegos.com'||u.hostname==='www.mierdijuegos.com'||u.hostname.endsWith('.vercel.app'))) throw new Error('unexpected deployment host');
  if(!parseId(id)) throw new Error('invalid game id');
  const response=await fetcher(`${u.origin}/games/${id}/`,{signal:AbortSignal.timeout(20000),cache:'no-store'});
  if(response.status!==200||await response.text()!==expected) throw new Error(`deployment readback failed: ${u.origin}/games/${id}/`);
  return true;
}
export async function publishGame({root,id}) {
  const p=repoPaths(root),release=acquireLock(p.lock);
  let record;
  const journal=join(p.local,'publish-result.json');
  const save=()=>writeFileSync(journal,JSON.stringify(record,null,2));
  try {
    const ready=JSON.parse(readFileSync(join(p.local,'ready.json'),'utf8'));
    if(ready.status!=='ready'||ready.entry?.id!==id) throw new Error('no validated ready run for this id');
    const html=readFileSync(join(p.gamesDir,id,'index.html'),'utf8');
    const sha=data=>createHash('sha256').update(data).digest('hex');
    if(sha(html)!==ready.htmlSha256||sha(readFileSync(p.catalog))!==ready.catalogSha256) throw new Error('game or catalog changed since validated run');
    const catalog=loadCatalog(p.catalog);
    const issues=[...validateCatalog(catalog,{gamesDir:p.gamesDir}).errors,...validateNewGameHtml(html).errors];
    if(issues.length) throw new Error(issues.join('\n'));
    const git=args=>command('git',args,{cwd:root});
    if(git(['remote','get-url','origin']).trim()!=='https://github.com/aeon-clawd/mierdijuegos.git') throw new Error('unexpected Git origin');
    const branch=git(['branch','--show-current']).trim();
    if(!['main','master'].includes(branch)) throw new Error('publish only from main/master');
    const linked=JSON.parse(readFileSync(join(root,'.vercel/project.json'),'utf8'));
    if(linked.projectId!=='prj_7XSsoVEPcCXNqYEF3EOLt8MPJdom') throw new Error('unexpected Vercel project');
    const changed=[...git(['diff','--name-only','-z','HEAD']).split('\0'),...git(['ls-files','--others','--exclude-standard','-z']).split('\0')].filter(Boolean);
    checkPublishScope(changed,id);
    record={id,status:'validating',run:ready.run};save();
    command('npm',['test'],{cwd:root,timeout:120000,log:join(p.local,'publish-tests.log')});
    await smokeGame({site:root,entry:ready.entry,run:ready.run});
    command('npm',['run','build'],{cwd:root,timeout:120000,log:join(p.local,'publish-build.log')});
    git(['add','--','public/games/games.json',`public/games/${id}/index.html`]);
    const staged=git(['diff','--cached','--name-only','-z']).split('\0').filter(Boolean);
    checkPublishScope(staged,id);
    if(staged.length) git(['commit','-m',`🎮 Nuevo mierdijuego: ${ready.entry.title}`]);
    record.commit=git(['rev-parse','HEAD']).trim();record.status='committed';save();
    const output=command('vercel',['deploy','--yes','--prod'],{cwd:root,timeout:600000,log:join(p.local,'vercel-deploy.log')});
    const urls=output.match(/https:\/\/[a-z0-9.-]+\.vercel\.app/gi)||[];
    if(!urls.length) throw new Error('Vercel did not return a deployment URL');
    record.deployment=urls.at(-1);record.status='deployed-unverified';save();
    await verifiedGame(record.deployment,id,html);
    await verifiedGame('https://mierdijuegos.com',id,html);
    record.status='deployed-verified';save();
    git(['push','origin',branch]);
    const remote=git(['ls-remote','origin',`refs/heads/${branch}`]).split(/\s/)[0];
    if(remote!==record.commit) throw new Error('GitHub commit readback mismatch');
    record.status='published';record.url=`https://mierdijuegos.com/games/${id}/`;save();
    // Only full success clears the pending pointer; any earlier throw leaves it 'ready' for retry.
    writeFileSync(join(p.local,'ready.json'),JSON.stringify({...ready,status:'published',publishedAt:new Date().toISOString(),commit:record.commit,url:record.url},null,2));
    return record;
  } catch(e) {
    if(record){record.error=e.message;save();}
    throw e;
  } finally {release();}
}
