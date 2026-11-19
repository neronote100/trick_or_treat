const el=id=>document.getElementById(id),txt=(e,v)=>(e.textContent=String(v),e);
let token='';
function n(tag,cl,value){const x=document.createElement(tag);if(cl)x.className=cl;if(value!==undefined)txt(x,value);return x;}
async function request(method,body) {
 const r=await fetch('./api/admin',{method,headers:{'authorization':'Bearer '+token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const data=await r.json();if(!r.ok)throw Error(data.error||'通信失敗');return data;
}
async function load(){
 token=el('admin-token').value.trim();if(!token){txt(el('admin-message'),'トークンを入力してください');return;}
 try{const data=await request('GET');render(data.items||[]);txt(el('admin-message'),data.items.length+'件読み込みました。未承認は公開されません。');}
 catch(e){txt(el('admin-message'),'確認できません: '+e.message);}
}
function field(label,value){const wrap=n('label','admin-field');wrap.append(n('span','',label));const input=n('input');input.value=value||'';wrap.append(input);return {wrap,input};}
function render(items){
 const list=el('admin-list');list.replaceChildren();
 for(const a of items){
  const card=n('article','admin-card');card.append(n('strong','',a.title),n('small','',a.status+' ・ '+a.project_id+' ・ '+a.created_at));
  const link=n('a','',a.url);link.href=a.url;link.target='_blank';link.rel='noopener noreferrer';card.append(link);
  const title=field('タイトル',a.title),author=field('作者',a.author),thumb=field('サムネURL',a.thumbnail),featured=field('おすすめ者（任意）',a.featured_by);
  for(const f of [title,author,thumb,featured])card.append(f.wrap);
  const actions=n('div','admin-actions');
  for(const [status,label] of [['approved','承認・公開'],['rejected','非掲載'],['pending','保留に戻す']]){
   const b=n('button','',label);b.type='button';b.addEventListener('click',async()=>{
    b.disabled=true;
    try{
      await request('POST',{id:a.id,status,title:title.input.value,author:author.input.value,thumbnail:thumb.input.value,featured_by:featured.input.value});
      txt(el('admin-message'),'更新しました: '+a.url);await load();
    }catch(e){txt(el('admin-message'),'更新失敗: '+e.message);b.disabled=false;}
   });actions.append(b);
  }
  card.append(actions);list.append(card);
 }
}
el('load').addEventListener('click',load);
