// Real Chromium interaction tests for the isolated #王子ごっこP1 gift preview.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','dist');
const autumnArchive=JSON.parse(await readFile(path.join(root,'data','archive.json'),'utf8'));
const autumnWorks=autumnArchive.articles.filter(a=>a.project_id==='autumn-reading');
const autumnNoteUrls=new Set(autumnWorks.map(a=>a.url));
const giftCount=35;
const expectedTotal=autumnWorks.length+giftCount;
assert.ok(autumnWorks.length>=120,'Real 秋読コレクション archives are required for combined preview');

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
 await page.waitForFunction(n=>document.getElementById('all-works')?.textContent===String(n),expectedTotal,{timeout:65000});
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
 await page.waitForFunction(n=>document.getElementById('all-works')?.textContent===String(n),expectedTotal,{timeout:65000});
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

 // Real combined test, not a fabricated fixture: the preview itself now hangs
 // every 秋読コレクション archive article and scatters 35 P1 parcels beneath it.
 await page.locator('#reset-preview-gifts').click();
 await page.locator('.project-card').first().click();
 const tree=page.locator('.tree-unit').first();
 await tree.locator('.tree-canvas').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>document.querySelector('.tree-unit .tree-canvas')?.dataset.rendering==='webgl-3d',
  null,{timeout:40000});
 assert.equal(await tree.locator('.orbital-slot').count(),48,'First tree must hold 48 autumn article ornaments');
 assert.equal(await tree.locator('.santa-gift').count(),12,'First tree must hold 12 P1 gifts');
 const links=await tree.locator('a.orbital-link').evaluateAll(items=>items.map(a=>a.href));
 assert.equal(new Set(links).size,48);
 assert.ok(links.every(u=>autumnNoteUrls.has(u)),'All 48 ornaments must come from 秋読コレクション');

 const collision=await tree.evaluate(unit=>{
  const c=unit.querySelector('.tree-canvas');
  const ornaments=[...c.querySelectorAll('.orbit-layer-front .orbital-slot')]
    .filter(el=>el.style.pointerEvents==='auto');
  const gifts=[...c.querySelectorAll('.gift-orbit-front .santa-gift')]
    .filter(el=>el.dataset.facing==='front');
  const rect=c.getBoundingClientRect();
  const snowNear=parseFloat(c.dataset.snowFrontY);
  const snowFar=parseFloat(c.dataset.snowBackY);
  let overlap=0,outsidePlatform=0;
  const giftPositions=[];
  for(const g of gifts){
   const gr=g.getBoundingClientRect();
   const baseline=(gr.bottom-rect.top)/rect.height*100;
   giftPositions.push({id:g.querySelector('.gift-number')?.textContent,
    cssTop:g.style.top,cssLeft:g.style.left,baseline,
    boxHeight:gr.height,computedPosition:getComputedStyle(g).position,
    offsetTop:g.offsetTop,offsetParent:g.offsetParent?.className,
    parent:g.parentElement?.className,parentTop:g.parentElement?.getBoundingClientRect().top,
    transform:g.style.transform});
   if(baseline>snowNear+.6||baseline<snowFar-.6)outsidePlatform++;
   for(const o of ornaments){
    const a=o.getBoundingClientRect();
    const w=Math.max(0,Math.min(a.right,gr.right)-Math.max(a.left,gr.left));
    const h=Math.max(0,Math.min(a.bottom,gr.bottom)-Math.max(a.top,gr.top));
    if(w*h>4)overlap++;
   }
  }
  return {ornamentCount:c.querySelectorAll('.orbital-slot').length,
   giftCount:c.querySelectorAll('.santa-gift').length,
   frontOrnaments:ornaments.length,frontGifts:gifts.length,
   snowNear,snowFar,outsidePlatform,overlap,giftPositions};
 });
 console.log('AUTUMN_P1_REAL_COMBINATION',JSON.stringify(collision));
 const photo=await tree.locator('.tree-canvas').screenshot({type:'jpeg',quality:62});
 console.log('AUTUMN_P1_REAL_COMBINATION_JPEG_B64:'+photo.toString('base64'));
 assert.equal(collision.ornamentCount,48);
 assert.equal(collision.giftCount,12);
 assert.ok(collision.snowFar>72&&collision.snowNear<97,
  'Full real snow-platform disc must fit within mobile canvas');
 assert.ok(collision.snowNear>collision.snowFar,'3D snow circle must be correctly projected');
 assert.equal(collision.outsidePlatform,0,'Presents must be grounded INSIDE the real 3D snow circle');
 assert.equal(collision.overlap,0,'Autumn note ornaments must not overlap P1 presents');


 assert.equal(errors.length,0,'Unexpected page errors: '+JSON.stringify(errors));
 console.log('GIFT_PREVIEW_BROWSER_PASS',JSON.stringify({gifts:35,autumnOrnaments:autumnWorks.length,forests:forestCounts,rotationX:[xBefore,xAfter],firstTitle:title,firstHref:href,image}));
}finally{
 await browser.close();await new Promise(resolve=>server.close(resolve));
}
