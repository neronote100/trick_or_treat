import {noteArticleUrl,imageUrl,TREE_CAPACITY,grovePage,ornamentOrbit,projectOrbit,stepSway,clamp,AUTO_ROTATION_DEG_PER_SEC} from './tree-core.js';
const el=id=>document.getElementById(id);
const archiveMode=document.body.dataset.mode==='archive';
const state={config:null,articles:[],selected:'letter',page:0,query:''};
function text(node,value){node.textContent=String(value);return node;}
function make(tag,className,value){
 const n=document.createElement(tag);if(className)n.className=className;if(value!==undefined)text(n,value);return n;
}
function currentProject(){return state.config?.projects.find(x=>x.id===state.selected)||state.config?.projects[0];}
function articlesFor(project){return state.articles.filter(x=>x.project_id===project);}
function buildNavigation(){
 const nav=el('project-nav');nav.replaceChildren();
 for(const p of state.config.projects){
   const count=articlesFor(p.id).length,button=make('button','project-card');
   button.type='button';button.dataset.id=p.id;button.setAttribute('aria-pressed',String(p.id===state.selected));
   button.append(make('span','project-icon',p.icon),make('strong','',p.name),make('small','',p.subtitle),make('span','project-count',count+' 作品'));
   if(!p.accepting && !archiveMode) button.append(make('em','coming-soon','企画準備中'));
   button.addEventListener('click',()=>{state.selected=p.id;state.page=0;history.replaceState(null,'',location.pathname+'?tree='+encodeURIComponent(p.id)+location.hash);render();el('tree-panel').scrollIntoView({behavior:'smooth'});});
   nav.append(button);
 }
}
function fallback(){return make('span','fallback','✦');}
function picture(article){
 const src=imageUrl(article.thumbnail);if(!src)return fallback();
 const img=new Image();img.loading='lazy';img.decoding='async';img.alt='';
 img.src=src;img.onerror=()=>{img.replaceWith(fallback());};return img;
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
function createOrbitController(canvas,ornaments,number,controls){
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
     const o=ornaments[i],p=projectOrbit(o.orbit,rotation);
     o.slot.style.left=p.x.toFixed(3)+'%';
     o.slot.style.top=p.y.toFixed(3)+'%';
     o.slot.style.opacity=p.opacity.toFixed(3);
     o.slot.style.zIndex=String(p.zIndex);
     o.slot.style.transform='translate(-50%,-50%) scale('+p.scale.toFixed(3)+')';
     o.slot.style.pointerEvents=p.interactive?'auto':'none';
     if(o.front!==p.interactive){
       o.front=p.interactive;
       o.link.tabIndex=p.interactive?0:-1;
       o.link.setAttribute('aria-hidden',String(!p.interactive));
     }
     if(reduced){
       o.sway={angle:0,velocity:0};o.hanger.style.transform='rotate(0deg)';
     }else{
       o.sway=stepSway(o.sway,velocity,angularAcceleration,dt,o.orbit.weight);
       const breeze=0.38*Math.sin(now*0.00096+i*2.3);
       o.hanger.style.transform='rotate('+(o.sway.angle+breeze).toFixed(2)+'deg)';
     }
   }
 }
 function frame(now){
   if(disposed)return;
   const dt=previousFrame?Math.min(.05,Math.max(.001,(now-previousFrame)/1000)):1/60;
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
 showToggle();draw();frameId=requestAnimationFrame(frame);
 return {destroy(){
   disposed=true;cancelAnimationFrame(frameId);observer?.disconnect();
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
function renderTree(){
 const p=currentProject();if(!p)return;
 disposeOrbitControllers();
 const items=articlesFor(p.id),count=items.length;
 const layout=grovePage(items,state.page);state.page=layout.page;
 el('tree-panel').dataset.theme=p.theme||'rose';
 text(el('tree-icon'),p.icon);text(el('tree-title'),p.name);text(el('tree-subtitle'),p.subtitle);
 text(el('tree-count'),count+'作品');
 text(el('tree-stage'),layout.totalTrees+'本のツリー / 1本あたり'+TREE_CAPACITY+'作品');
 el('stage-fill').style.width=count?((count-1)%TREE_CAPACITY+1)/TREE_CAPACITY*100+'%':'0%';
 const grove=el('tree-grove');grove.replaceChildren();
 for(const unit of layout.trees){
   const card=make('section','tree-unit');
   const caption=make('div','tree-unit-head');
   caption.append(make('span','tree-sequence','TREE '+String(unit.number).padStart(2,'0')),
                  make('strong','',unit.number+'本目のツリー'),
                  make('span','tree-work-count',unit.works.length+' / '+TREE_CAPACITY+' 作品'));
   const canvas=make('div','tree-canvas');
   canvas.dataset.growth=unit.works.length===TREE_CAPACITY?'満開':'成長中';
   canvas.setAttribute('aria-label',unit.number+'本目の360度回転ツリー');
   const img=new Image();img.className='grand-tree-art';
   img.loading=unit.number>2?'lazy':'eager';img.alt='';img.draggable=false;
   img.src='./assets/royal-tree.avif';
   img.addEventListener('error',()=>{if(!img.src.endsWith('/royal-tree.svg'))img.src='./assets/royal-tree.svg';});
   canvas.append(img);
   const layer=make('div','orbit-layer');
   layer.setAttribute('aria-label',unit.number+'本目の360度オーナメント');
   const ornaments=[];
   unit.works.forEach((article,i)=>{
     const entry=createOrnament(article,i);
     if(entry){ornaments.push(entry);layer.append(entry.slot);}
   });
   canvas.append(layer);
   if(!unit.works.length)canvas.append(make('div','tree-unit-empty','最初のオーナメントを待っています ✧'));
   const controls=make('div','orbit-controls');
   const left=make('button','orbit-button','↶ 左に回す');
   const toggle=make('button','orbit-button orbit-auto','⏸ 自動回転を止める');
   const right=make('button','orbit-button','右に回す ↷');
   for(const button of [left,toggle,right])button.type='button';
   left.setAttribute('aria-label',unit.number+'本目を左へ回転');
   right.setAttribute('aria-label',unit.number+'本目を右へ回転');
   controls.append(left,toggle,right);
   const hint=make('p','orbit-hint','横スワイプで360°回転 · 飾りをタップしてnoteへ');
   card.append(caption,canvas,controls,hint);grove.append(card);
   orbitControllers.push(createOrbitController(canvas,ornaments,unit.number,{left,toggle,right}));
 }
 const paging=el('tree-paging');paging.hidden=layout.pages<=1;
 text(el('tree-page-label'),(layout.page+1)+' / '+layout.pages+' エリア');
 el('prev-tree').disabled=layout.page===0;
 el('next-tree').disabled=layout.page>=layout.pages-1;
 for(const card of document.querySelectorAll('.project-card'))
   card.setAttribute('aria-pressed',String(card.dataset.id===p.id));
}

function renderWorks(){
 const items=articlesFor(state.selected).filter(x=>(String(x.title||'')+' '+String(x.author||'')).toLocaleLowerCase('ja').includes(state.query));
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
 text(el('work-total'),items.length+' 作品');
 el('work-empty').hidden=items.length!==0;
 text(el('work-empty'),state.query?'検索条件に合う作品がありません。':'まだ作品がありません。最初のオーナメントを待っています🌙');
}
function render(){
 const uniqueAuthors=new Set(state.articles.map(x=>(x.author_id||x.author||'').trim()).filter(Boolean));
 text(el('all-works'),state.articles.length);text(el('all-authors'),uniqueAuthors.size);
 text(el('all-trees'),state.config.projects.length);
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

async function init(){
 try{
  const cfg=await fetch('./config.json',{cache:'no-store'});if(!cfg.ok)throw Error('config unavailable');
  state.config=await cfg.json();
  if(archiveMode)state.config.projects=state.config.archive_projects;
  if(!Array.isArray(state.config.projects)||!state.config.projects.length)throw Error('projects missing');
  state.selected=state.config.projects[0].id;
  const target=new URLSearchParams(location.search).get('tree');
  if(state.config.projects.some(x=>x.id===target))state.selected=target;
  renderHashtagGuide();
  el('search').addEventListener('input',e=>{state.query=e.target.value.toLocaleLowerCase('ja');renderWorks();});
  el('prev-tree').addEventListener('click',()=>{state.page--;renderTree();el('tree-panel').scrollIntoView({behavior:'smooth'});});
  el('next-tree').addEventListener('click',()=>{state.page++;renderTree();el('tree-panel').scrollIntoView({behavior:'smooth'});});
  try{
   const r=await fetch(archiveMode?'./data/archive.json':'./data/ornaments.json',{cache:'no-store'});
   if(!r.ok)throw Error('ornament data unavailable');
   const data=await r.json();
   state.articles=(Array.isArray(data.articles)?data.articles:[]).filter(x=>noteArticleUrl(x.url) && state.config.projects.some(p=>p.id===x.project_id));
  }catch{
   const info=make('p','system-notice','作品データを読み込めませんでした。時間をおいて再読み込みしてください。');
   document.querySelector('.forest').append(info);
  }
  render();
 }catch(e){console.warn(e);text(el('forest-title'),'ただいま準備中です');}
}
init();
