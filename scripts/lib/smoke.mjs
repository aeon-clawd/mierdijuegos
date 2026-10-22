import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';

export async function servePublic(site) {
  const root=realpathSync(join(site,'public'));
  const server=createServer((req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost');
      let path=decodeURIComponent(url.pathname);
      if(path.endsWith('/')) path+='index.html';
      const file=realpathSync(join(root,path));
      if(!file.startsWith(root+sep)) throw new Error('forbidden');
      res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':file.endsWith('.js')?'application/javascript':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.json')?'application/json':'application/octet-stream');
      res.end(readFileSync(file));
    } catch {res.statusCode=404;res.end('Not found');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return {url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(r=>server.close(r))};
}

export async function smokeGame({site,entry,run}) {
  const server=await servePublic(site);
  let browser;
  const errors=[],externalRequests=[];
  const viewport={width:390,height:844};
  try {
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,serviceWorkers:'block',permissions:[]});
    const url=`${server.url}/games/${entry.id}/`;
    await context.route('**/*',route=>{
      if(route.request().url()===url && route.request().isNavigationRequest()) return route.continue();
      externalRequests.push(route.request().url());return route.abort();
    });
    await context.routeWebSocket('**/*',socket=>{externalRequests.push(socket.url());socket.close();});
    const page=await context.newPage();
    page.setDefaultTimeout(6000);
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
    const response=await page.goto(url,{waitUntil:'load',timeout:10000});
    if(response?.status()!==200) throw new Error('game did not return HTTP 200');
    await page.locator('[data-action="start"]').click();
    await page.waitForFunction(()=>window.mierdiTest?.state()==='playing');
    const before=await page.evaluate(()=>window.mierdiTest.inputs?.()??window.mierdiTest.score());
    const canvas=page.locator('canvas').first();
    const box=await canvas.boundingBox();
    if(!box||box.width<100||box.height<100) throw new Error('no usable game canvas');
    await page.touchscreen.tap(box.x+box.width*.5,box.y+box.height*.55);
    await page.mouse.move(box.x+box.width*.3,box.y+box.height*.6);
    await page.mouse.down();
    await page.mouse.move(box.x+box.width*.7,box.y+box.height*.45,{steps:8});
    await page.mouse.up();
    await page.waitForTimeout(350);
    const after=await page.evaluate(()=>window.mierdiTest.inputs?.()??window.mierdiTest.score());
    if(typeof before!=='number'||typeof after!=='number'||after<=before) throw new Error('game did not acknowledge gameplay input');
    // Deliberately forced loss to exercise the actual end/retry path; not proof of natural loss or fun.
    await page.evaluate(()=>window.mierdiTest.forceGameOver());
    await page.waitForFunction(()=>window.mierdiTest.state()==='over');
    await page.locator('[data-action="retry"]').click();
    await page.waitForFunction(()=>window.mierdiTest.state()==='playing');
    if(await page.locator('[data-action="back"]').getAttribute('href')!=='/') throw new Error('bad back link');
    if(run) await page.screenshot({path:join(run,'smoke.png')});
    if(errors.length||externalRequests.length) throw new Error([...errors,...externalRequests.map(r=>`forbidden network request: ${r}`)].join('\n'));
    return {viewport,errors,externalRequests,inputBefore:before,inputAfter:after,retry:true,end:'forced-test-hook'};
  } catch(e) {
    const detail=[...errors,...externalRequests.map(r=>`forbidden network request: ${r}`)].join('\n');
    throw new Error(detail ? `${e.message}\n${detail}` : e.message);
  } finally {if(browser) await browser.close();await server.close();}
}
