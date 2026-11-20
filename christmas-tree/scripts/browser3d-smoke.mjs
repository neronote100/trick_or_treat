import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const url=process.env.CHRISTMAS_PREVIEW_URL||
 'https://feature-christmas-turning-tr.christmas-kingdom-2026.pages.dev/archive.html';
const browser=await chromium.launch({
 headless:true,
 args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl',
       '--enable-unsafe-swiftshader','--disable-dev-shm-usage']
});
const context=await browser.newContext({
 viewport:{width:430,height:940},deviceScaleFactor:1,
 reducedMotion:'reduce'
});
const page=await context.newPage();
page.setDefaultTimeout(60000);
const errors=[];
page.on('pageerror',error=>errors.push('JS: '+error.message));
page.on('console',msg=>{
 if(msg.type()==='error'&&/WebGL|three|module|Failed to fetch/i.test(msg.text()))
  errors.push('Console: '+msg.text().slice(0,250));
});
try{
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:55000});
 await page.waitForFunction(()=>{
   const works=document.getElementById('tree-count');
   return works&&parseInt(works.textContent,10)>=190;
 },null,{timeout:55000});
 await page.waitForFunction(()=>{
   const canvas=document.querySelector('.tree-canvas');
   return canvas?.dataset.rendering==='webgl-3d'||
          canvas?.dataset.rendering==='static-fallback';
 },null,{timeout:60000});
 const state=await page.evaluate(()=>{
  const canvas=document.querySelector('.tree-canvas');
  const actual=canvas?.querySelector('canvas.real-tree-webgl');
  return {
    status:canvas?.dataset.rendering,
    rotation:canvas?.dataset.rotation,
    ornaments:canvas?.querySelectorAll('.orbital-slot').length,
    imageLoaded:!!actual&&actual.width>0&&actual.height>0,
    treeCount:document.querySelector('#tree-stage')?.textContent,
    resolution:actual?[actual.width,actual.height]:null,
  };
 });
 console.log('WEBGL_3D_STATE',JSON.stringify(state));
 assert.equal(state.status,'webgl-3d','WebGL fallback or module load failure');
 assert.equal(state.ornaments,48);
 assert.ok(state.imageLoaded,'Missing 3D WebGL canvas');
 assert.match(state.treeCount,/48作品/);
 // Read-only screenshot of actual generated WebGL pixels for visual review.
 const cap=await page.locator('.tree-canvas').first().screenshot({type:'jpeg',quality:47});
 console.log('3D_SCREENSHOT_B64:'+cap.toString('base64'));
 // Check controls move the REAL tree's recorded 3D rotation.
 const before=Number(await page.locator('.tree-canvas').first().getAttribute('data-rotation'));
 await page.getByRole('button',{name:'1本目を右へ回転'}).click();
 await page.waitForTimeout(420);
 const after=Number(await page.locator('.tree-canvas').first().getAttribute('data-rotation'));
 console.log('ROTATION_BEFORE_AFTER',before,after);
 assert.ok(Number.isFinite(before)&&Number.isFinite(after)&&Math.abs(after-before)>1,
  'Actual WebGL tree rotation was not updated');
 assert.equal(errors.length,0,'Browser errors: '+JSON.stringify(errors));
 console.log('3D_BROWSER_PASS');
}finally{
 await browser.close();
}
