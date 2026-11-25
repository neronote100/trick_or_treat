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
 await page.waitForSelector('.santa-gift',{timeout:10000}).catch(()=>{});
 const diag=await page.evaluate(()=>({
  mode:document.body.dataset.mode,
  total:document.getElementById('all-works')?.textContent,
  cards:document.querySelectorAll('.project-card').length,
  treeUnits:document.querySelectorAll('.tree-unit').length,
  gifts:document.querySelectorAll('.santa-gift').length,
  stage:document.getElementById('tree-stage')?.textContent,
  panel:document.getElementById('tree-panel')?.textContent?.slice(0,270)
 }));
 console.log('P1_GIFT_PREVIEW_DIAGNOSTICS',JSON.stringify({diag,errors}));
 const firstCount=await page.locator('.santa-gift').count();
 assert.ok(firstCount>0,'First forest page should contain Santa presents');
 const perTree=await page.locator('.tree-unit').evaluateAll(units=>units.map(u=>u.querySelectorAll('.santa-gift').length));
 assert.equal(perTree.reduce((n,c)=>n+c,0),firstCount);
 assert.ok(perTree.every(c=>c>=0&&c<=12),'Each individual tree must have at most 12 gifts');
 assert.equal(await page.locator('.santa-gift.is-open').count(),0);

 // The gift is a small grounded square, not a tall box with an upward lid.
 await page.waitForFunction(()=>document.querySelector('.tree-canvas')?.dataset.rendering==='webgl-3d',
  null,{timeout:40000});
 assert.equal(await page.locator('.gift-lid').count(),0,'No upward opening lids remain');
 assert.equal(await page.locator('.gift-flip').count(),firstCount);
 const placement=await page.locator('.gift-orbit-front .santa-gift').first().evaluate(g=>{
  const box=g.getBoundingClientRect();
  const canvas=g.closest('.tree-canvas').getBoundingClientRect();
  return {
   baseline:(box.bottom-canvas.top)/canvas.height*100,
   dimension:box.width/box.height,
   imageFace:!!g.querySelector('.gift-reveal .gift-thumbnail'),
   canopyLift:g.closest('.tree-canvas').dataset.canopyLift||''
  };
 });
 console.log('GROUNDED_PRESENT',JSON.stringify(placement));
 assert.ok(placement.baseline>77&&placement.baseline<100,
  'Gift base should touch the lower snow surface, not float among baubles');
 assert.ok(placement.dimension>.55&&placement.dimension<1.5,
  'Gift should be compact and square, not a tall pillar');
 // The 3D gifts must live INSIDE the canvas, not in the old fixed floor grid.
 assert.equal(await page.locator('.santa-gift-floor').count(),0);
 assert.equal(await page.locator('.tree-canvas .santa-gift').count(),firstCount);
 await page.waitForFunction(()=>document.querySelector('.tree-canvas .santa-gift')?.style.left?.endsWith('%'));
 const rotatingGift=page.locator('.tree-unit').first().locator('.santa-gift').first();
 const xBefore=parseFloat(await rotatingGift.evaluate(g=>g.style.left));
 const turnRight=page.getByRole('button',{name:'1本目を右へ回転'});
 await turnRight.click();
 const xAfter=parseFloat(await rotatingGift.evaluate(g=>g.style.left));
 assert.ok(Math.abs(xBefore-xAfter)>1,'Gift box must move when the 3D tree turns');
 await page.getByRole('button',{name:'1本目を左へ回転'}).click();
 // Back-facing presents are hidden behind the tree and cannot be activated.
 assert.ok(await page.locator('.gift-orbit-rear .santa-gift').count()>0);
 assert.ok(await page.locator('.gift-orbit-front .santa-gift').count()>0);
 const first=page.locator('.gift-orbit-front .santa-gift').first();
 await first.locator('button.gift-box').click();
 await page.waitForFunction(()=>document.querySelector('.santa-gift.is-open .gift-article img')?.src?.includes('assets.st-note.com'),null,{timeout:15000});
 const href=await first.locator('a.gift-article').getAttribute('href');
 const image=await first.locator('a.gift-article img').getAttribute('src');
 const title=await first.locator('.gift-article-title').innerText();
 const faceState=await first.evaluate(g=>{
  const flip=g.querySelector('.gift-flip'),face=g.querySelector('.gift-reveal'),image=g.querySelector('.gift-thumbnail');
  const a=face.getBoundingClientRect(),b=image.getBoundingClientRect();
  return {
   flipped:getComputedStyle(flip).transform,
   thumbnailCoversFace:Math.abs(a.width-b.width)<3&&Math.abs(a.height-b.height)<3,
   lidCount:g.querySelectorAll('.gift-lid').length
  };
 });
 assert.equal(faceState.lidCount,0);
 assert.ok(faceState.thumbnailCoversFace,'Opened present should show a full-face thumbnail');
 assert.notEqual(faceState.flipped,'none','Present front must rotate to reveal its image');

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

 // Match the actual user-facing mixed preview URL: all 133 real
 // #秋読コレクション ornaments (48+48+37), plus 35 #王子ごっこP1 presents.
 const autumn=JSON.parse(await readFile(path.join(root,'data','archive.json'),'utf8'))
  .articles.filter(a=>a.project_id==='autumn-reading'&&a.thumbnail);
 assert.equal(autumn.length,133,'Expected archived Autumn Reading thumbnails');
 const mixedPage=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 const mixedErrors=[];
 mixedPage.on('pageerror',error=>mixedErrors.push(error.message));
 try{
  await mixedPage.goto('http://127.0.0.1:'+address.port+
   '/gift-preview.html?ornaments=autumn',{waitUntil:'domcontentloaded'});
  await mixedPage.waitForFunction(()=>
   document.querySelector('.tree-canvas .orbital-slot')?.style.left?.endsWith('%'),
   null,{timeout:35000});
  await mixedPage.waitForFunction(()=>
   document.querySelector('.tree-canvas')?.dataset.rendering==='webgl-3d',
   null,{timeout:40000});
  assert.equal(await mixedPage.locator('#all-works').innerText(),'35',
   'The Santa gift count must not include Autumn ornaments');
  assert.match(await mixedPage.locator('#autumn-preview-info').innerText(),
   /秋読コレクション 133作品/);
  const ornamentsInForests=[];
  for(let n=0;n<3;n++){
   await mixedPage.locator('.project-card').nth(n).click();
   await mixedPage.waitForFunction(()=>
    document.querySelector('.tree-unit')?.querySelectorAll('.orbital-slot').length>0);
   ornamentsInForests.push(await mixedPage.locator('.tree-unit').first().locator('.orbital-slot').count());
  }
  assert.deepEqual(ornamentsInForests,[48,48,37]);
  await mixedPage.locator('.project-card').first().click();
  await mixedPage.waitForFunction(()=>
   document.querySelector('.tree-canvas')?.dataset.rendering==='webgl-3d',
   null,{timeout:40000});
  const tree=mixedPage.locator('.tree-unit').first();
  await tree.locator('.tree-canvas').scrollIntoViewIfNeeded();
  const collision=await tree.evaluate(unit=>{
   const c=unit.querySelector('.tree-canvas');
   const ornaments=[...c.querySelectorAll('.orbit-layer-front .orbital-slot')]
    .filter(el=>el.style.pointerEvents==='auto');
   const gifts=[...c.querySelectorAll('.gift-orbit-front .santa-gift')]
    .filter(el=>el.dataset.facing==='front');
   let overlap=0;
   for(const o of ornaments)for(const g of gifts){
    const a=o.getBoundingClientRect(),b=g.getBoundingClientRect();
    const w=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left));
    const h=Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
    if(w*h>4)overlap++;
   }
   const rimContainer=c.getBoundingClientRect();
   const giftBottoms=gifts.map(g=>
    (g.getBoundingClientRect().bottom-rimContainer.top)/rimContainer.height*100);
   const giftDebug=gifts.map(g=>{
    const rect=g.getBoundingClientRect();
    const parent=g.parentElement.getBoundingClientRect();
    return {
     topStyle:g.style.top,bottomStyle:g.style.bottom,
     computedPosition:getComputedStyle(g).position,transform:g.style.transform,
     cssHeight:getComputedStyle(g).height,
     visualTop:(rect.top-rimContainer.top)/rimContainer.height*100,
     visualBottom:(rect.bottom-rimContainer.top)/rimContainer.height*100,
     parentTop:(parent.top-rimContainer.top)/rimContainer.height*100,
     parentHeight:parent.height
    };
   });
   return {
    ornamentCount:c.querySelectorAll('.orbital-slot').length,
    giftCount:c.querySelectorAll('.santa-gift').length,
    frontOrnaments:ornaments.length,frontGifts:gifts.length,overlap,
    giftBottoms,giftDebug,decorativeOval:getComputedStyle(c,'::before').content
   };
  });
  console.log('AUTUMN_ORNAMENTS_P1_PRESENTS_ON_CIRCLE',JSON.stringify(collision));
  assert.equal(collision.ornamentCount,48);
  assert.equal(collision.giftCount,12);
  assert.equal(collision.overlap,0,'Grounded presents must not cover hanging Autumn ornaments');
  assert.ok(collision.giftDebug.every(g=>g.computedPosition==='absolute'),
   'Gift boxes must be absolute and not stacked in document flow');
  assert.ok(collision.giftBottoms.every(y=>y>70&&y<97),
   'Every present bottom must stay within the visible ground area');
  assert.ok(collision.decorativeOval==='none'||collision.decorativeOval==='normal',
   'Fake CSS snow ellipse must not cover actual Three.js circular ground');
  assert.deepEqual(mixedErrors,[],'Mixed preview must not throw JavaScript errors');
  const photo=await tree.locator('.tree-canvas').screenshot({type:'jpeg',quality:67});
  console.log('AUTUMN_GIFTS_CIRCLE_JPEG_B64:'+photo.toString('base64'));
 }finally{await mixedPage.close();}

 assert.equal(errors.length,0,'Unexpected page errors: '+JSON.stringify(errors));
 console.log('GIFT_PREVIEW_BROWSER_PASS',JSON.stringify({sample:35,forests:forestCounts,rotationX:[xBefore,xAfter],firstTitle:title,firstHref:href,image}));
}finally{
 await browser.close();await new Promise(resolve=>server.close(resolve));
}
