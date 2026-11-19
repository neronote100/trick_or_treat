import {stageForCount,noteArticleUrl,imageUrl,TREE_SPOTS,TREE_PAGE_SIZE} from './tree-core.js';
const el=id=>document.getElementById(id);
const archiveMode=document.body.dataset.mode==='archive';
const state={config:null,articles:[],selected:'letter',page:0,query:''};
const STAGE_NAMES=['芽吹き','若木','大きな木','完成'];
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
function createOrnament(article,index){
 const href=noteArticleUrl(article.url);if(!href)return;
 const point=TREE_SPOTS[index],a=make('a','ornament');
 a.href=href;a.target='_blank';a.rel='noopener noreferrer';
 a.title=(article.title||'作品')+'｜'+(article.author||'作者');
 a.setAttribute('aria-label',a.title+'（noteへ）');
 a.style.left=point.x+'%';a.style.top=point.y+'%';
 a.style.animationDelay=Math.min(index*0.035,0.7)+'s';
 if(article.featured_by)a.classList.add('featured');
 a.append(picture(article));
 return a;
}
function renderTree(){
 const p=currentProject();if(!p)return;
 const items=articlesFor(p.id),count=items.length,stage=stageForCount(count,state.config.stage_thresholds);
 el('tree-panel').dataset.theme=p.theme||'rose';
 el('tree-scene').dataset.stage=String(stage);
 text(el('tree-icon'),p.icon);text(el('tree-title'),p.name);text(el('tree-subtitle'),p.subtitle);
 text(el('tree-count'),count+' 作品');text(el('tree-stage'),'第'+stage+'段階・'+STAGE_NAMES[stage-1]);
 const targets=state.config.stage_thresholds,lower=targets[stage-1]||0,upper=targets[stage]??Math.max(1,count);
 const progress=stage===4?100:Math.min(100,Math.max(5,((count-lower)/Math.max(1,upper-lower))*100));
 el('stage-fill').style.width=progress+'%';
 const maxPages=Math.max(1,Math.ceil(count/TREE_PAGE_SIZE));
 state.page=Math.max(0,Math.min(state.page,maxPages-1));
 const start=state.page*TREE_PAGE_SIZE,section=items.slice(start,start+TREE_PAGE_SIZE);
 const layer=el('ornament-layer');layer.replaceChildren();
 section.forEach((article,i)=>{const link=createOrnament(article,i);if(link)layer.append(link);});
 el('tree-empty').hidden=count!==0;
 el('tree-paging').hidden=maxPages<=1;
 text(el('tree-page-label'),(state.page+1)+' / '+maxPages);
 el('prev-tree').disabled=state.page===0;el('next-tree').disabled=state.page>=maxPages-1;
 const cards=document.querySelectorAll('.project-card');for(const card of cards)card.setAttribute('aria-pressed',String(card.dataset.id===p.id));
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
 const uniqueAuthors=new Set(state.articles.map(x=>(x.author||'').trim()).filter(Boolean));
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
  el('prev-tree').addEventListener('click',()=>{state.page--;renderTree();});
  el('next-tree').addEventListener('click',()=>{state.page++;renderTree();});
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
