// Real Chromium interaction tests for the isolated #王子ごっこP1 gift preview.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','dist');
const mime={'.html':'text/html; charset=utf-8','.json':'application/json; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.avif':'image/avif'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  const rel=decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const full=path.resolve(root,rel||'index.html');
  if(!full.startsWith(root+path.sep))throw Error('Path outside demo');
  const body=await readFile(full);
  res.writeHead(200,{'content-type':mime[path.extname(full)]||'application/octet-stream','cache-control':'no-store'});
  res.end(body);
 }catch(error){res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address();
const browser=await chromium.launch({headless:true,args:[
 '--use-gl=angle','--use-angle=swiftshader','--enable-webgl',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 page.setDefaultTimeout(60000);
 const errors=[];
 page.on('pageerror',err=>errors.push(err.message));
 await page.goto('http://127.0.0.1:'+address.port+'/gift-preview.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.getElementById('all-works')?.textContent==='35',null,{timeout:65000});
 assert.equal(await page.locator('.project-card').count(),3,'Three forests only');
 const firstCount=await page.locator('.santa-gift').count();
 assert.ok(firstCount>0&&firstCount<=12,'First tree must show between 1 and 12 presents');
 assert.equal(await page.locator('.santa-gift.is-open').count(),0);
 const first=page.locator('.santa-gift').first();
 await first.locator('button.gift-box').click();
 await page.waitForFunction(()=>document.querySelector('.santa-gift.is-open .gift-article img')?.src?.includes('assets.st-note.com'),null,{timeout:15000});
 const href=await first.locator('a.gift-article').getAttribute('href');
 const image=await first.locator('a.gift-article img').getAttribute('src');
 const title=await first.locator('.gift-article-title').innerText();
 assert.match(href,/^https:\/\/note\.com\/[a-zA-Z0-9_-]+\/n\/n[a-zA-Z0-9]+$/);
 assert.match(image,/^https:\/\/assets\.st-note\.com\//);
 assert.ok(title.length>0);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.getElementById('all-works')?.textContent==='35',null,{timeout:65000});
 assert.equal(await page.locator('.santa-gift.is-open').count(),1,'Opened box must persist after reload');
 await page.locator('#reset-preview-gifts').click();
 assert.equal(await page.locator('.santa-gift.is-open').count(),0,'Reset returns boxes to unopened state');
 const forestCounts=[];
 for(let n=0;n<3;n++){
  await page.locator('.project-card').nth(n).click();
  let seen=0,turns=0;
  for(;;){
   seen+=await page.locator('.santa-gift').count();
   const next=page.locator('#next-tree');
   if(await next.isHidden()||await next.isDisabled())break;
   if(++turns>12)throw Error('Unexpected infinite gift pages');
   await next.click();
  }
  forestCounts.push(seen);
 }
 assert.equal(forestCounts.reduce((n,v)=>n+v,0),35,'All P1 notes must appear as gifts once, across the three forests');
 await page.locator('#open-all-preview-gifts').click();
 await page.waitForFunction(()=>document.querySelectorAll('.work-card').length===35,null,{timeout:15000});
 assert.equal(await page.locator('.santa-gift.is-open').count(),await page.locator('.santa-gift').count(),'All visible gifts open');
 assert.equal(errors.length,0,'Unexpected page errors: '+JSON.stringify(errors));
 console.log('GIFT_PREVIEW_BROWSER_PASS',JSON.stringify({sample:35,forests:forestCounts,firstTitle:title,firstHref:href,image}));
}finally{
 await browser.close();await new Promise(resolve=>server.close(resolve));
}
