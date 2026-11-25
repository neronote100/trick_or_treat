import {noteArticleUrl,imageUrl,TREE_CAPACITY,SANTA_GIFT_CAPACITY,SANTA_FOREST_IDS,santaGiftsForForest,santaGiftOrbit,projectSantaGift,grovePage,ornamentOrbit,projectOrbit,stepSway,clamp,AUTO_ROTATION_DEG_PER_SEC} from './tree-core.js';
const el=id=>document.getElementById(id);
const archiveMode=document.body.dataset.mode==='archive';
const giftPreviewMode=document.body.dataset.mode==='gift-preview';
// The P1 demonstration must never affect real Santa open-state history.
const GIFT_STORAGE_KEY=giftPreviewMode?'heartful-tree:p1-gift-preview:opened:v1':'christmas-kingdom-2026:santa-opened:v1';
const state={config:null,articles:[],selected:'letter',page:0,query:'',openedGifts:new Set()};
function visibleForests(){return state.config?.projects.filter(p=>p.display!=='gifts')||[];}
function giftsForForest(forestId){
 if(archiveMode||!SANTA_FOREST_IDS.includes(forestId))return [];
 return santaGiftsForForest(state.articles,forestId);
}
function readOpenedGifts(){
 try{
  const saved=JSON.parse(localStorage.getItem(GIFT_STORAGE_KEY)||'[]');
  return new Set(Array.isArray(saved)?saved.filter(x=>noteArticleUrl(x)).slice(0,3000):[]);
 }catch{return new Set();}
}
function rememberOpenedGift(url){
 state.openedGifts.add(url);
 try{localStorage.setItem(GIFT_STORAGE_KEY,JSON.stringify([...state.openedGifts].slice(-3000)));}catch{}
}
function wasGiftOpened(article){
 const url=noteArticleUrl(article.url);return Boolean(url&&state.openedGifts.has(url));
}

function text(node,value){node.textContent=String(value);return node;}
function make(tag,className,value){
 const n=document.createElement(tag);if(className)n.className=className;if(value!==undefined)text(n,value);return n;
}
function currentProject(){return visibleForests().find(x=>x.id===state.selected)||visibleForests()[0];}
function articlesFor(project){return state.articles.filter(x=>x.project_id===project);}
function buildNavigation(){
 const nav=el('project-nav');nav.replaceChildren();
 for(const p of visibleForests()){
  const count=articlesFor(p.id).length;
  const gifts=giftsForForest(p.id).length;
  const button=make('button','project-card');
  button.type='button';button.dataset.id=p.id;button.dataset.palette=p.theme||'rose';
  button.setAttribute('aria-pressed',String(p.id===state.selected));
  button.append(make('span','project-icon',p.icon),
                make('strong','',p.name),
                make('small','',p.subtitle),
                make('span','project-count',count+' 作品'));
  if(gifts)button.append(make('span','project-gift-count','🎁 '+gifts+' 個のプレゼント'));
  if(!p.accepting&&!archiveMode&&!giftPreviewMode)button.append(make('em','coming-soon','企画準備中'));
  button.addEventListener('click',()=>{
   state.selected=p.id;state.page=0;
   history.replaceState(null,'',location.pathname+'?tree='+encodeURIComponent(p.id)+location.hash);
   render();el('tree-panel').scrollIntoView({behavior:'smooth'});
  });
  nav.append(button);
 }
}

function fallback(){return make('span','fallback','✦');}
function picture(article){
 const src=imageUrl(article.thumbnail);if(!src)return fallback();
 const img=new Image();img.loading='lazy';img.decoding='async';img.alt='';
 img.src=src;img.onerror=()=>{img.replaceWith(fallback());};return img;
}


function createTurningTree(canvas,theme,variant){
 const scene=make('div','turning-tree-scene');
 scene.setAttribute('aria-hidden','true');
 const fallback=new Image();
 fallback.className='tree-3d-fallback';
 fallback.alt='';fallback.draggable=false;
 fallback.src='./assets/royal-tree.avif';
 fallback.onerror=()=>{if(!fallback.src.endsWith('/royal-tree.svg'))fallback.src='./assets/royal-tree.svg';};
 scene.append(fallback);canvas.append(scene);
 let engine=null,disposed=false,pendingRotation=0,pendingSways=[];
 return {
   scene,
   init(ornamentCount,giftCount=0){
     import('./tree3d.js').then(module=>{
       if(disposed)return;
       try{
         engine=module.createRealChristmasTree(scene,canvas,ornamentCount,theme,variant,giftCount);
         // A first WebGL frame MUST be painted before the static artwork hides.
         // This also prevents an empty tree if initialization happens offscreen.
         engine.draw(pendingRotation,pendingSways);
         fallback.hidden=true;
         canvas.dataset.rendering='webgl-3d';
       }catch(error){
         console.warn('3D rendering unavailable. Showing accessible illustration.',error);
         canvas.dataset.rendering='static-fallback';
       }
     }).catch(error=>{
       console.warn('3D module loading failed. Showing accessible illustration.',error);
       canvas.dataset.rendering='static-fallback';
     });
   },
   draw(rotation,sways){
     pendingRotation=rotation;pendingSways=sways;
     try{return engine?engine.draw(rotation,sways):null;}
     catch(error){
       console.warn('3D renderer fallback',error);
       engine?.dispose();engine=null;
       fallback.hidden=false;
       canvas.dataset.rendering='static-fallback';
       return null;
     }
   },
   destroy(){disposed=true;engine?.dispose();engine=null;}
 };
}

const orbitControllers=[];
function disposeOrbitControllers(){
  for(const controller of orbitControllers)controller.destroy();
  orbitControllers.length=0;
}
function createOrnament(article,index){
 const href=noteArticleUrl(article.url),orbit=ornamentOrbit(index);
 if(!href||!orbit)return null;
 const slot=make('div','orbital-slot');
 const hanger=make('div','orbital-hanger');
 const cord=make('span','orbital-cord');cord.setAttribute('aria-hidden','true');
 const link=make('a','orbital-link');
 link.href=href;link.target='_blank';link.rel='noopener noreferrer';
 link.title=(article.title||'作品')+'｜'+(article.author||'作者');
 link.setAttribute('aria-label',link.title+'（noteへ）');link.tabIndex=-1;
 if(article.featured_by)link.classList.add('featured');
 link.append(picture(article));
 hanger.append(cord,link);slot.append(hanger);
 return {slot,hanger,link,orbit,sway:{angle:0,velocity:0},front:false};
}
function createOrbitController(canvas,ornaments,number,controls,art,gifts=[]){
 const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
 let reduced=motion.matches,rotation=(number*43)%360,velocity=0,previousVelocity=0;
 let previousFrame=0,frameId=0,visible=true,auto=!reduced,idleUntil=0;
 let pointer=null,suppressClickUntil=0,disposed=false,hovering=false;
 const observer=('IntersectionObserver' in window)
  ?new IntersectionObserver(entries=>{visible=entries.some(x=>x.isIntersecting);},{rootMargin:'110px'}):null;
 observer?.observe(canvas);
 const {left,right,toggle}=controls;
 function showToggle(){
   toggle.textContent=auto?'⏸ 自動回転を止める':'▶ 自動回転する';
   toggle.setAttribute('aria-pressed',String(auto));
   toggle.disabled=reduced;
   toggle.title=reduced?'端末のアニメーション軽減設定が有効です':'';
 }
 function draw(dt=0,angularAcceleration=0,now=0){
   for(let i=0;i<ornaments.length;i++){
     const o=ornaments[i];
     if(reduced){
       o.sway={angle:0,velocity:0};
       o.hanger.style.transform='rotate(0deg)';
     }else{
       o.sway=stepSway(o.sway,velocity,angularAcceleration,dt,o.orbit.weight);
       const breeze=0.35*Math.sin(now*0.00096+i*2.3);
       o.hanger.style.transform='rotate('+(o.sway.angle+breeze).toFixed(2)+'deg)';
     }
   }
   // WebGL projects each DOM article link from its real 3D bauble position.
   const projections=art.draw(rotation,ornaments.map(o=>o.sway.angle));
   const coordinates=Array.isArray(projections)?projections:projections?.ornaments;
   for(let i=0;i<ornaments.length;i++){
     const o=ornaments[i],p=coordinates?.[i]||projectOrbit(o.orbit,rotation);
     o.slot.style.left=p.x.toFixed(3)+'%';
     o.slot.style.top=p.y.toFixed(3)+'%';
     o.slot.style.opacity=p.opacity.toFixed(3);
     o.slot.style.zIndex=String(p.zIndex);
     o.slot.style.transform='translate(-50%,-50%) scale('+p.scale.toFixed(3)+')';
     o.slot.style.pointerEvents=p.interactive?'auto':'none';
     const destination=p.depth<-0.08?art.rear:art.front;
     if(o.slot.parentNode!==destination)destination.append(o.slot);
     if(o.front!==p.interactive){
       o.front=p.interactive;
       o.link.tabIndex=p.interactive?0:-1;
       o.link.setAttribute('aria-hidden',String(!p.interactive));
     }
   }
   // Present boxes share the same rotation as the real 3D tree. Projecting
   // DOM links from tree-attached anchors keeps unwrapping accessible.
   const projectedGifts=projections?.gifts;
   for(let i=0;i<gifts.length;i++){
     const g=gifts[i],p=projectedGifts?.[i]||
      projectSantaGift(g.orbit,rotation,canvas.clientWidth/canvas.clientHeight);
     if(!p)continue;
     g.slot.style.left=p.x.toFixed(3)+'%';
     g.slot.style.top=p.y.toFixed(3)+'%';
     g.slot.style.opacity=p.opacity.toFixed(3);
     g.slot.style.zIndex=String(p.zIndex);
     g.slot.style.transform='translate(-50%,-100%) scale('+p.scale.toFixed(3)+')';
     g.slot.style.pointerEvents=p.interactive?'auto':'none';
     const destination=p.depth>-.08?art.giftFront:art.giftRear;
     if(destination&&g.slot.parentNode!==destination)destination.append(g.slot);
     g.slot.dataset.facing=p.interactive?'front':'rear';
     g.box.tabIndex=p.interactive&&!g.slot.classList.contains('is-open')?0:-1;
     const link=g.slot.querySelector('.gift-article');
     if(link)link.tabIndex=p.interactive?0:-1;
   }
 }
 function frame(now){
   if(disposed)return;
   // Cap expensive DOM projection writes to about 30 fps on mobile.
   if(previousFrame && now-previousFrame<32){frameId=requestAnimationFrame(frame);return;}
   const dt=previousFrame?Math.min(.05,Math.max(.001,(now-previousFrame)/1000)):1/30;
   previousFrame=now;
   if(visible&&!document.hidden){
     if(!reduced&&!pointer?.dragging&&!canvas.contains(document.activeElement)){
       if(auto&&now>idleUntil&&!hovering)
         velocity+=(AUTO_ROTATION_DEG_PER_SEC-velocity)*Math.min(1,dt*1.7);
       else velocity*=Math.exp(-2.2*dt);
       rotation=(rotation+velocity*dt)%360;
     }
     const acceleration=clamp((velocity-previousVelocity)/dt,-1800,1800);
     previousVelocity=velocity;draw(dt,acceleration,now);
   }else previousVelocity=velocity;
   frameId=requestAnimationFrame(frame);
 }
 function down(e){
   if(e.pointerType==='mouse'&&e.button!==0)return;
   pointer={id:e.pointerId,startX:e.clientX,startY:e.clientY,lastX:e.clientX,lastTime:performance.now(),dragging:false};
 }
 function move(e){
   if(!pointer||pointer.id!==e.pointerId)return;
   const dx=e.clientX-pointer.startX,dy=e.clientY-pointer.startY;
   if(!pointer.dragging){
     if(Math.abs(dx)<8||Math.abs(dx)<Math.abs(dy)*1.25)return;
     pointer.dragging=true;
     try{canvas.setPointerCapture(e.pointerId);}catch{}
     canvas.classList.add('is-dragging');
   }
   const now=performance.now(),delta=e.clientX-pointer.lastX;
   const seconds=Math.max(.014,(now-pointer.lastTime)/1000),degrees=delta*.55;
   rotation=(rotation+degrees)%360;
   velocity=clamp(velocity*.32+degrees/seconds*.68,-220,220);
   pointer.lastX=e.clientX;pointer.lastTime=now;idleUntil=now+3600;
   if(e.cancelable)e.preventDefault();
   if(reduced)draw();
 }
 function end(e){
   if(!pointer||pointer.id!==e.pointerId)return;
   if(pointer.dragging)suppressClickUntil=performance.now()+450;
   pointer=null;canvas.classList.remove('is-dragging');
   if(reduced){velocity=0;draw();}
 }
 function interceptClick(e){
   if(performance.now()<suppressClickUntil){e.preventDefault();e.stopPropagation();}
 }
 function focus(){velocity=0;}
 function hoverIn(e){if(e.pointerType==='mouse')hovering=true;}
 function hoverOut(e){if(e.pointerType==='mouse')hovering=false;}
 function turnLeft(){
   idleUntil=performance.now()+3600;rotation=(rotation-28+360)%360;
   velocity=reduced?0:clamp(velocity-34,-150,150);if(reduced)draw();
 }
 function turnRight(){
   idleUntil=performance.now()+3600;rotation=(rotation+28)%360;
   velocity=reduced?0:clamp(velocity+34,-150,150);if(reduced)draw();
 }
 function toggleAuto(){
   if(reduced)return;
   auto=!auto;idleUntil=performance.now()+1500;showToggle();
 }
 function motionChanged(e){
   reduced=e.matches;auto=!reduced;
   velocity=0;previousVelocity=0;showToggle();draw();
 }
 canvas.addEventListener('pointerdown',down);
 canvas.addEventListener('pointermove',move);
 canvas.addEventListener('pointerup',end);
 canvas.addEventListener('pointercancel',end);
 canvas.addEventListener('click',interceptClick,true);
 canvas.addEventListener('focusin',focus);
 canvas.addEventListener('pointerenter',hoverIn);
 canvas.addEventListener('pointerleave',hoverOut);
 left.addEventListener('click',turnLeft);
 right.addEventListener('click',turnRight);
 toggle.addEventListener('click',toggleAuto);
 motion.addEventListener?.('change',motionChanged);
 art.init(ornaments.length,gifts.length);
 showToggle();draw();frameId=requestAnimationFrame(frame);
 return {destroy(){
   disposed=true;cancelAnimationFrame(frameId);observer?.disconnect();art.destroy();
   canvas.removeEventListener('pointerdown',down);
   canvas.removeEventListener('pointermove',move);
   canvas.removeEventListener('pointerup',end);
   canvas.removeEventListener('pointercancel',end);
   canvas.removeEventListener('click',interceptClick,true);
   canvas.removeEventListener('focusin',focus);
   canvas.removeEventListener('pointerenter',hoverIn);
   canvas.removeEventListener('pointerleave',hoverOut);
   left.removeEventListener('click',turnLeft);
   right.removeEventListener('click',turnRight);
   toggle.removeEventListener('click',toggleAuto);
   motion.removeEventListener?.('change',motionChanged);
 }};
}

function createSantaGift(article,index){
 const url=noteArticleUrl(article.url);if(!url)return null;
 const gift=make('div','santa-gift');
 gift.dataset.wrap=String(index%6);
 const box=make('button','gift-box');
 box.type='button';
 box.setAttribute('aria-label',(index+1)+'番目のプレゼントを開ける');
 for(const className of ['gift-body','gift-ribbon-v','gift-ribbon-h','gift-bow'])
  box.append(make('span',className));
 const revealed=make('div','gift-reveal');
 const number=make('span','gift-number','GIFT '+String(index+1).padStart(2,'0'));
 const face=make('div','gift-flip');
 face.append(box,revealed);
 gift.append(face,number);
 function unwrap(restoring=false){
  if(gift.classList.contains('is-open'))return;
  gift.classList.add('is-open');
  if(restoring)gift.classList.add('gift-restored');
  box.disabled=true;box.tabIndex=-1;
  box.setAttribute('aria-label','開封済みのプレゼント');
  const link=make('a','gift-article');
  link.href=url;link.target='_blank';link.rel='noopener noreferrer';
  link.title=(article.title||'作品')+'｜'+(article.author||'作者');
  link.setAttribute('aria-label',link.title+'をnoteで読む');
  const image=make('span','gift-thumbnail');image.append(picture(article));
  const caption=make('span','gift-article-title',article.title||'記事を読む');
  link.append(image,caption);revealed.append(link);
  if(!restoring){rememberOpenedGift(url);if(giftPreviewMode)renderWorks();}
 }
 box.addEventListener('click',()=>unwrap(false));
 if(wasGiftOpened(article))unwrap(true);
 return gift;
}

function renderTree(){
 const p=currentProject();if(!p)return;
 disposeOrbitControllers();
 const items=articlesFor(p.id);
 const count=items.length;
 const gifts=giftsForForest(p.id);
 // Santa gifts never replace ornaments: each tree may hold 48 articles and 12 boxes.
 // Additional gift-filled trees remain part of this same ornament forest.
 const giftTreeCount=Math.max(1,Math.ceil(gifts.length/SANTA_GIFT_CAPACITY));
 const layout=grovePage(items,state.page,TREE_CAPACITY,giftTreeCount);state.page=layout.page;
 el('tree-panel').dataset.theme=p.theme||'rose';
 el('tree-panel').dataset.hasGifts=String(gifts.length>0);
 document.body.dataset.theme=p.theme||'rose';
 document.body.dataset.forestVariant=String(state.page%3);
 text(el('tree-icon'),p.icon);text(el('tree-title'),p.name);text(el('tree-subtitle'),p.subtitle);
 text(el('tree-count'),count+'作品'+(gifts.length?' · 🎁 '+gifts.length+'個':''));
 text(el('tree-stage'),layout.totalTrees+'本のツリー / 1本48作品・12プレゼントまで');
 el('stage-fill').style.width=count?((count-1)%TREE_CAPACITY+1)/TREE_CAPACITY*100+'%':'0%';
 const description=document.querySelector('.tree-bottom>p');
 if(description)text(description,'✦ 伸びた幹の根元に並ぶプレゼント。ツリーと一緒に360°回り、箱の正面が記事サムネイルに変わります ✦');
 text(el('works-title'),'このツリーに飾られた作品');
 const grove=el('tree-grove');grove.replaceChildren();
 for(const unit of layout.trees){
  const unitGifts=gifts.slice((unit.number-1)*SANTA_GIFT_CAPACITY,unit.number*SANTA_GIFT_CAPACITY);
  const card=make('section','tree-unit');
  const caption=make('div','tree-unit-head');
  caption.append(make('span','tree-sequence','TREE '+String(unit.number).padStart(2,'0')),
                 make('strong','',unit.number+'本目のツリー'),
                 make('span','tree-work-count',unit.works.length+' / '+TREE_CAPACITY+' 作品'));
  if(unitGifts.length)caption.append(make('span','tree-gift-count','🎁 '+unitGifts.length+' プレゼント'));
  const canvas=make('div','tree-canvas');
  const treeVariant=(unit.number-1)%3;
  canvas.dataset.treeVariant=String(treeVariant);
  canvas.dataset.hasGifts=String(unitGifts.length>0);
  canvas.dataset.growth=unit.works.length===TREE_CAPACITY?'満開':'成長中';
  canvas.setAttribute('aria-label',unit.number+'本目の360度回転オーナメントツリー');
  const rear=make('div','orbit-layer orbit-layer-rear');
  rear.setAttribute('aria-hidden','true');
  const artwork=createTurningTree(canvas,p.theme||'rose',treeVariant);
  const front=make('div','orbit-layer orbit-layer-front');
  front.setAttribute('aria-label',unit.number+'本目の360度オーナメント');
  const ornaments=[];
  unit.works.forEach((article,i)=>{
   const entry=createOrnament(article,i);
   if(entry){ornaments.push(entry);front.append(entry.slot);}
  });
  canvas.append(rear,front);
  if(!unit.works.length&&!unitGifts.length)
   canvas.append(make('div','tree-unit-empty','最初のオーナメントを待っています ✧'));
  const controls=make('div','orbit-controls');
  const left=make('button','orbit-button','↶ 左に回す');
  const toggle=make('button','orbit-button orbit-auto','⏸ 自動回転を止める');
  const right=make('button','orbit-button','右に回す ↷');
  for(const button of [left,toggle,right])button.type='button';
  left.setAttribute('aria-label',unit.number+'本目を左へ回転');
  right.setAttribute('aria-label',unit.number+'本目を右へ回転');
  controls.append(left,toggle,right);
  const hint=make('p','orbit-hint',unitGifts.length
   ?'幹の根元に届いたプレゼントも一緒に回転。箱をタップすると正面がサムネイルに変わるよ'
   :'3Dツリーを360°回転 · 飾りをタップしてnoteへ');
  const giftEntries=[];
  const giftRear=make('div','gift-orbit-layer gift-orbit-rear');
  giftRear.setAttribute('aria-hidden','true');
  const giftFront=make('div','gift-orbit-layer gift-orbit-front');
  giftFront.setAttribute('aria-label',p.name+'のツリーの根元のプレゼント');
  if(unitGifts.length){
   unitGifts.forEach((article,i)=>{
    const gift=createSantaGift(article,(unit.number-1)*SANTA_GIFT_CAPACITY+i);
    const orbit=santaGiftOrbit(i);
    if(gift&&orbit){
     gift.classList.add('orbiting-gift');
     giftFront.append(gift);
     giftEntries.push({slot:gift,orbit,box:gift.querySelector('.gift-box')});
    }
   });
   // Both gift layers sit INSIDE the 3D tree projection surface, not below it.
   canvas.append(giftRear,giftFront);
  }
  card.append(caption,canvas,controls,hint);grove.append(card);
  orbitControllers.push(createOrbitController(canvas,ornaments,unit.number,
   {left,toggle,right},{...artwork,rear,front,giftRear,giftFront},giftEntries));
 }
 const paging=el('tree-paging');paging.hidden=layout.pages<=1;
 text(el('tree-page-label'),(layout.page+1)+' / '+layout.pages+' エリア');
 el('prev-tree').disabled=layout.page===0;
 el('next-tree').disabled=layout.page>=layout.pages-1;
 for(const card of document.querySelectorAll('.project-card'))
  card.setAttribute('aria-pressed',String(card.dataset.id===p.id));
}

function renderWorks(){
 // Santa articles are intentionally excluded here until a person opens a box.
 // Their links and thumbnails are revealed inside their assigned gift box only.
 const all=giftPreviewMode?state.articles.filter(a=>a.project_id==='santa'&&wasGiftOpened(a)):articlesFor(state.selected);
 const items=all.filter(x=>
  (String(x.title||'')+' '+String(x.author||'')).toLocaleLowerCase('ja').includes(state.query));
 const list=el('work-list');list.replaceChildren();
 for(const a of items){
  const url=noteArticleUrl(a.url);if(!url)continue;
  const link=make('a','work-card');link.href=url;link.target='_blank';link.rel='noopener noreferrer';
  const thumb=make('span','work-thumb');thumb.append(picture(a));
  const detail=make('span','work-detail');
  detail.append(make('strong','',a.title||'無題の作品'),make('small','',a.author||'noteクリエイター'));
  if(a.featured_by)detail.append(make('em','featured-note','✦ '+a.featured_by+'さんのおすすめ'));
  link.append(thumb,detail);list.append(link);
 }
 text(el('work-total'),giftPreviewMode?all.length+' / '+state.articles.filter(a=>a.project_id==='santa').length+' 個 開封済み':items.length+' 作品');
 el('work-empty').hidden=items.length!==0;
 text(el('work-empty'),state.query?'検索条件に合う作品がありません。':
  giftPreviewMode?'プレゼントを開けると、その記事がここにも表示されます🎁':'このツリーのオーナメント作品を待っています。サンタのプレゼントはツリーの下に届きます🎁');
}

function render(){
 const uniqueAuthors=new Set(state.articles.map(x=>(x.author_id||x.author||'').trim()).filter(Boolean));
 text(el('all-works'),state.articles.length);text(el('all-authors'),uniqueAuthors.size);
 if(giftPreviewMode){
  const countOrnaments=state.articles.filter(a=>a.project_id!=='santa').length;
  const countGifts=state.articles.filter(a=>a.project_id==='santa').length;
  const countA=el('preview-ornament-count'),countG=el('preview-present-count');
  if(countA)text(countA,countOrnaments);
  if(countG)text(countG,countGifts);
 }
 text(el('all-trees'),giftPreviewMode?visibleForests().length:state.config.projects.length);
 buildNavigation();renderTree();renderWorks();

}
function renderHashtagGuide() {
 const box=el('tag-guide');if(!box)return;
 box.replaceChildren();
 for(const p of state.config.projects){
  const row=make('div','tag-guide-row');
  const header=make('div','tag-guide-name',p.icon+' '+p.name);
  const tag=make('a','tag-chip','#'+p.hashtag);
  tag.href='https://note.com/hashtag/'+encodeURIComponent(p.hashtag);
  tag.target='_blank';tag.rel='noopener noreferrer';
  const note=make('span','tag-guide-note',p.accepting?'募集中':'企画準備中');
  row.append(header,tag,note);box.append(row);
 }
 const common=el('common-hashtag');
 if(common){
  common.textContent='#'+state.config.common_hashtag;
  common.href='https://note.com/hashtag/'+encodeURIComponent(state.config.common_hashtag);
 }
}

// Check the static note feed after new deployments, without forcing a page reload.
async function checkForNewDeliveries(){
 if(document.hidden||!state.config)return;
 try{
  const response=await fetch(archiveMode?'./data/archive.json':giftPreviewMode?'./data/gift-preview-p1.json':'./data/ornaments.json',{cache:'no-store'});
  if(!response.ok)return;
  const data=await response.json();
  const next=(Array.isArray(data.articles)?data.articles:[]).filter(x=>noteArticleUrl(x.url)&&state.config.projects.some(p=>p.id===x.project_id));
  const signature=works=>works.map(a=>a.project_id+':'+a.url).join('|');
  if(signature(next)!==signature(state.articles)){
   state.articles=next;render();
  }
 }catch(error){console.warn('Periodic note article refresh failed',error);}
}

async function init(){
 try{
  const cfg=await fetch('./config.json',{cache:'no-store'});if(!cfg.ok)throw Error('config unavailable');
  state.config=await cfg.json();
  state.openedGifts=readOpenedGifts();
  if(archiveMode)state.config.projects=state.config.archive_projects;
  if(!Array.isArray(state.config.projects)||!state.config.projects.length)throw Error('projects missing');
  state.selected=visibleForests()[0].id;
  const target=new URLSearchParams(location.search).get('tree');
  if(visibleForests().some(x=>x.id===target))state.selected=target;
  renderHashtagGuide();
  el('search').addEventListener('input',e=>{state.query=e.target.value.toLocaleLowerCase('ja');renderWorks();});
  el('prev-tree').addEventListener('click',()=>{state.page--;renderTree();el('tree-panel').scrollIntoView({behavior:'smooth'});});
  el('next-tree').addEventListener('click',()=>{state.page++;renderTree();el('tree-panel').scrollIntoView({behavior:'smooth'});});
  try{
   const r=await fetch(archiveMode?'./data/archive.json':giftPreviewMode?'./data/gift-preview-p1.json':'./data/ornaments.json',{cache:'no-store'});
   if(!r.ok)throw Error('ornament data unavailable');
   const data=await r.json();
   state.articles=(Array.isArray(data.articles)?data.articles:[])
    .filter(x=>noteArticleUrl(x.url)&&state.config.projects.some(p=>p.id===x.project_id));
   if(giftPreviewMode){
    // Preview only: REAL public 秋読コレクション thumbnails hang as ornaments.
    // Keep P1 gift articles separate; neither dataset becomes event entries.
    const archived=await fetch('./data/archive.json',{cache:'no-store'});
    if(!archived.ok)throw Error('autumn archive unavailable');
    const history=await archived.json();
    const autumn=(Array.isArray(history.articles)?history.articles:[])
     .filter(a=>a.project_id==='autumn-reading'&&noteArticleUrl(a.url))
     .slice(0,SANTA_FOREST_IDS.length*TREE_CAPACITY)
     .map((a,i)=>({...a,
      project_id:SANTA_FOREST_IDS[Math.min(SANTA_FOREST_IDS.length-1,Math.floor(i/TREE_CAPACITY))],
      demo_source_hashtag:'秋読コレクション'
     }));
    if(!autumn.length)throw Error('No 秋読コレクション articles in archive');
    state.articles.push(...autumn);
   }
  }catch{
   const info=make('p','system-notice','作品データを読み込めませんでした。時間をおいて再読み込みしてください。');
   document.querySelector('.forest').append(info);
  }
  render();
  if(giftPreviewMode){
   el('open-all-preview-gifts')?.addEventListener('click',()=>{
    state.openedGifts=new Set(state.articles.filter(a=>a.project_id==='santa').map(a=>noteArticleUrl(a.url)).filter(Boolean));
    try{localStorage.setItem(GIFT_STORAGE_KEY,JSON.stringify([...state.openedGifts]));}catch{}
    render();
   });
   el('reset-preview-gifts')?.addEventListener('click',()=>{
    state.openedGifts=new Set();
    try{localStorage.removeItem(GIFT_STORAGE_KEY);}catch{}
    render();
   });
  }
  if(!archiveMode&&!giftPreviewMode){
   window.setInterval(checkForNewDeliveries,5*60*1000);
   document.addEventListener('visibilitychange',()=>{
    if(!document.hidden)checkForNewDeliveries();
   });
  }
 }catch(e){console.warn(e);text(el('forest-title'),'ただいま準備中です');}
}
init();
