
import {json,authorized,PROJECT_IDS,normalizeNoteUrl,validImage} from '../_utils.js';
function auth(request,env){return authorized(request,env.ADMIN_TOKEN);}
export async function onRequestGet({request,env}) {
  if(!auth(request,env))return json({error:'UNAUTHORIZED'},401);
  if(!env.ORNAMENTS_DB)return json({error:'DB_NOT_CONFIGURED'},503);
  const result=await env.ORNAMENTS_DB.prepare(`SELECT id,project_id,url,title,author,thumbnail,status,created_at,reviewed_at,featured_by
    FROM submissions ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END,created_at DESC LIMIT 500`).all();
  return json({items:result.results||[]});
}
export async function onRequestPost({request,env}) {
  if(!auth(request,env))return json({error:'UNAUTHORIZED'},401);
  if(!env.ORNAMENTS_DB)return json({error:'DB_NOT_CONFIGURED'},503);
  let body;try{const text=await request.text();if(text.length>8192)return json({error:'TOO_LARGE'},413);body=JSON.parse(text);}catch{return json({error:'INVALID_JSON'},400);}
  const id=String(body.id||'');
  const status=String(body.status||'');
  if(!/^[a-f0-9-]{36}$/.test(id)||!['approved','rejected','pending'].includes(status))return json({error:'INVALID_ACTION'},400);
  const current=await env.ORNAMENTS_DB.prepare('SELECT * FROM submissions WHERE id=?').bind(id).first();
  if(!current)return json({error:'NOT_FOUND'},404);
  const title=String(body.title||current.title).slice(0,220),author=String(body.author||current.author).slice(0,100);
  const thumbnail=body.thumbnail===undefined?current.thumbnail:validImage(body.thumbnail);
  const featured=String(body.featured_by??current.featured_by??'').slice(0,40);
  await env.ORNAMENTS_DB.prepare(`UPDATE submissions SET status=?,title=?,author=?,thumbnail=?,
    featured_by=?,reviewed_at=? WHERE id=?`)
    .bind(status,title,author,thumbnail,featured,status==='pending'?null:new Date().toISOString(),id).run();
  return json({ok:true});
}
