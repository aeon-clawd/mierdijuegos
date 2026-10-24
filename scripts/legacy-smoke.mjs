#!/usr/bin/env node
// Manual acceptance check on the real compiled homepage and one legacy game.
// Blocks historical analytics/fonts; this is NOT a generated-game acceptance test.
import { chromium } from 'playwright';
import { mkdirSync,symlinkSync,existsSync,writeFileSync } from 'node:fs';
import {join} from 'node:path';
import {REPO_ROOT,repoPaths} from './lib/paths.mjs';
import {servePublic} from './lib/smoke.mjs';
import {loadCatalog} from './lib/catalog.mjs';
import {sortGamesNewestFirst} from '../src/lib/games.mjs';
// Catalog size and latest game grow nightly; 034-topologico is always the fixed legacy probe.
const catalog=loadCatalog(repoPaths().catalog);
const expectedLatest=`/games/${sortGamesNewestFirst(catalog)[0].id}/`;
const work=join(REPO_ROOT,'.local/legacy-smoke');mkdirSync(work,{recursive:true});
if(!existsSync(join(work,'public'))) symlinkSync(join(REPO_ROOT,'dist'),join(work,'public'),'dir');
const server=await servePublic(work);
let browser;
try {
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const blocked=[],errors=[];
 await context.route('**/*',r=>{if(r.request().url().startsWith(server.url+'/'))return r.continue();blocked.push(r.request().url());return r.abort();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.url,{waitUntil:'load'});
 if(!(await page.title()).includes('Mierdijuegos')) throw new Error('wrong home title');
 // Compiled home: Vercel analytics bootstrap once (inert on 127.0.0.1), old VPS tracker gone.
 if(await page.locator('script[src="/analytics.js"]').count()!==1||await page.locator('script[src*="vps-dee05c78"]').count()) throw new Error('unexpected home analytics tags');
 const cards=await page.locator('a[href^="/games/"]').count();
 const latest=await page.locator('.today-card').getAttribute('href');
 if(cards!==catalog.length||latest!==expectedLatest)throw new Error(`unexpected homepage: ${cards} cards, ${latest}`);
 await page.screenshot({path:join(work,'homepage-mobile.png'),fullPage:true});
 await page.goto(server.url+'/games/034-topologico/',{waitUntil:'load'});
 await page.locator('.play-button').click();
 const state=await page.evaluate(()=>({running:gameState.running,edges:gameState.totalEdges,canvas:{width:canvas.width,height:canvas.height}}));
 if(!state.running||state.edges!==5)throw new Error('legacy game failed to start');
 const before=await page.evaluate(()=>gameState.score);
 await page.evaluate(()=>{
  // Real DOM click handlers, not a fabricated game state: select start then neighbor.
  for(const i of [0,1]) {const n=gameState.nodes[i];canvas.dispatchEvent(new MouseEvent('click',{clientX:n.x,clientY:n.y,bubbles:true}));}
 });
 const after=await page.evaluate(()=>gameState.score);
 if(after<=before)throw new Error('legacy click input did not traverse an edge');
 await page.screenshot({path:join(work,'topologico-mobile.png')});
 if(errors.length) throw new Error(errors.join('\n'));
 const result={status:'passed',homepageCards:cards,latest,game:'034-topologico',state,inputScoreBefore:before,inputScoreAfter:after,pageErrors:errors,blockedHistoricalThirdParties:[...new Set(blocked)],limitations:'one real legacy game; no claim of solvability or all-game QA'};
 writeFileSync(join(work,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
} finally {if(browser)await browser.close();await server.close();}
