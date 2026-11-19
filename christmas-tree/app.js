import {stageForCount,noteArticleUrl,imageUrl,TREE_SPOTS,TREE_PAGE_SIZE} from './tree-core.js';
const el=id=>document.getElementById(id);
const state={config:null,articles:[],selected:'letter',page:0,query:'',turnstileId:null};
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
   if(!p.accepting) button.append(make('em','coming-soon','企画準備中'));
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
 const option=el('entry-project').querySelector('option[value="'+state.selected+'"]');
 if(option && !option.disabled)el('entry-project').value=state.selected;
}
async function loadTurnstile(sitekey){
 await new Promise((resolve,reject)=>{
  if(window.turnstile)return resolve();
  const s=document.createElement('script');s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  s.onload=resolve;s.onerror=reject;document.head.append(s);
 });
 state.turnstileId=window.turnstile.render('#turnstile-slot',{sitekey,theme:'dark',language:'ja'});
}
function initForm(){
 const select=el('entry-project');select.replaceChildren();
 for(const p of state.config.projects){
  const opt=make('option','',p.icon+' '+p.name+(p.accepting?'':'（準備中）'));
  opt.value=p.id;opt.disabled=!p.accepting;select.append(opt);
 }
 const active=state.config.projects.find(p=>p.accepting);
 if(active)select.value=active.id;
 const canOpen=Boolean(state.config.event_open && active && state.config.turnstile_site_key);
 if(canOpen){
   loadTurnstile(state.config.turnstile_site_key).then(()=>{
    el('submit-button').disabled=false;text(el('entry-status'),'作品を選んで、エントリーしてください🌙');
   }).catch(()=>text(el('entry-status'),'認証の読み込みに失敗しました。再読み込みしてください。'));
 } else {
   el('submit-button').disabled=true;
   text(el('entry-status'),'現在は受付準備中です。開催日・ハッシュタグが決まったらオープンします。');
 }
 el('entry-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const p=state.config.projects.find(x=>x.id===select.value);
  if(!canOpen||!p?.accepting)return;
  const url=el('entry-url').value.trim();
  if(!noteArticleUrl(url)){text(el('entry-status'),'note記事のURL（/n/n...）を入力してください。');return;}
  if(!el('entry-consent').checked||!el('entry-owner').checked){text(el('entry-status'),'同意項目を確認してください。');return;}
  const token=window.turnstile?.getResponse(state.turnstileId)||'';
  if(!token){text(el('entry-status'),'認証チェックを完了してください。');return;}
  const button=el('submit-button');button.disabled=true;text(el('entry-status'),'エントリーを送信中…');
  try{
   const r=await fetch('./api/submit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({project_id:select.value,url,consent:true,is_author_or_authorized:true,turnstile_token:token})});
   const data=await r.json();
   if(!r.ok)throw new Error(data.error||'送信に失敗しました');
   text(el('entry-status'),'🎄 受付しました！運営の確認後、ツリーに灯ります。');
   el('entry-url').value='';el('entry-owner').checked=false;el('entry-consent').checked=false;
  }catch(error){text(el('entry-status'),'登録できませんでした（'+error.message+'）。時間をおいてお試しください。');}
  finally{window.turnstile?.reset(state.turnstileId);button.disabled=false;}
 });
}
async function init(){
 try{
  const cfg=await fetch('./config.json',{cache:'no-store'});if(!cfg.ok)throw Error('config unavailable');
  state.config=await cfg.json();
  if(!Array.isArray(state.config.projects)||!state.config.projects.length)throw Error('projects missing');
  const target=new URLSearchParams(location.search).get('tree');
  if(state.config.projects.some(x=>x.id===target))state.selected=target;
  initForm();
  el('search').addEventListener('input',e=>{state.query=e.target.value.toLocaleLowerCase('ja');renderWorks();});
  el('prev-tree').addEventListener('click',()=>{state.page--;renderTree();});
  el('next-tree').addEventListener('click',()=>{state.page++;renderTree();});
  try{
   const r=await fetch('./api/ornaments',{cache:'no-store'});
   if(!r.ok)throw Error('not deployed');
   const data=await r.json();
   state.articles=(Array.isArray(data.articles)?data.articles:[]).filter(x=>noteArticleUrl(x.url) && state.config.projects.some(p=>p.id===x.project_id));
  }catch{
   const info=make('p','system-notice','公開データベースはまだ接続されていません。ツリーは0件で表示しています。');
   document.querySelector('.forest').append(info);
  }
  render();
 }catch(e){console.warn(e);text(el('forest-title'),'ただいま準備中です');text(el('entry-status'),'設定を確認しています。');}
}
init();
