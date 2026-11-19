import {stageForCount,noteArticleUrl,imageUrl,TREE_SPOTS,TREE_CAPACITY,grovePage,treeCountForWorks} from './tree-core.js';
const el=id=>document.getElementById(id);
const archiveMode=document.body.dataset.mode==='archive';
const state={config:null,articles:[],selected:'letter',page:0,query:''};
const STAGE_NAMES=['芽吹き','成長','開花','満開'];
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
 const point=TREE_SPOTS[index];if(!point)return null;
 const a=make('a','ornament');
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
 const items=articlesFor(p.id),count=items.length;
 const layout=grovePage(items,state.page);state.page=layout.page;
 const stage=stageForCount(count,state.config.stage_thresholds);
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
   const stageLabel=unit.works.length===TREE_CAPACITY?'満開':'成長中';
   const canvas=make('div','tree-canvas');
   canvas.dataset.growth=stageLabel;
   const img=new Image();img.className='grand-tree-art';img.loading=unit.number>2?'lazy':'eager';
   img.alt='';img.src='./assets/royal-tree.avif';
   img.addEventListener('error',()=>{img.src='./assets/royal-tree.svg';},{once:true});canvas.append(img);
   const ornamentLayer=make('div','ornament-layer');ornamentLayer.setAttribute('aria-label',unit.number+'本目のオーナメント');
   unit.works.forEach((article,i)=>{const link=createOrnament(article,i);if(link)ornamentLayer.append(link);});
   canvas.append(ornamentLayer);
   if(!unit.works.length){
     const empty=make('div','tree-unit-empty','最初のオーナメントを待っています ✧');
     canvas.append(empty);
   }
   card.append(caption,canvas);grove.append(card);
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
