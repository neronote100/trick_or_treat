
import {normalizeNoteUrl,PROJECT_IDS,json,readNoteMetadata,verifyTurnstile,allowAttempt} from '../_utils.js';
export async function onRequestPost({request,env}) {
  if (!env.ORNAMENTS_DB) return json({error:'DB_NOT_CONFIGURED'},503);
  if (env.REGISTRATION_OPEN !== 'true') return json({error:'REGISTRATION_CLOSED'},403);
  if (!env.TURNSTILE_SECRET) return json({error:'TURNSTILE_NOT_CONFIGURED'},503);
  if (!(request.headers.get('content-type')||'').includes('application/json')) return json({error:'INVALID_CONTENT_TYPE'},415);
  if (Number(request.headers.get('content-length')||0)>8192) return json({error:'TOO_LARGE'},413);
  let body;try {const txt=await request.text();if(txt.length>8192)return json({error:'TOO_LARGE'},413);body=JSON.parse(txt);}catch{return json({error:'INVALID_JSON'},400);}
  const project=String(body.project_id||''),url=normalizeNoteUrl(body.url);
  if(!PROJECT_IDS.has(project)||!url) return json({error:'INVALID_ENTRY'},400);
  if(body.consent!==true || body.is_author_or_authorized!==true) return json({error:'CONSENT_REQUIRED'},400);
  try {
    if(!await verifyTurnstile(env.TURNSTILE_SECRET,String(body.turnstile_token||''),request.headers.get('CF-Connecting-IP')||'')) return json({error:'CHALLENGE_FAILED'},400);
  } catch {return json({error:'CHALLENGE_UNAVAILABLE'},503);}
  if(!await allowAttempt(env.ORNAMENTS_DB,request.headers.get('CF-Connecting-IP')||'')) return json({error:'RATE_LIMITED'},429);
  let metadata={title:'記事タイトル確認中',author:'noteクリエイター',thumbnail:''};
  try {metadata=await readNoteMetadata(url);} catch(e){console.warn('note metadata unavailable',String(e).slice(0,100));}
  const date=new Date().toISOString(),id=crypto.randomUUID();
  await env.ORNAMENTS_DB.prepare(`INSERT OR IGNORE INTO submissions
    (id,project_id,url,title,author,thumbnail,status,consent_at,created_at)
    VALUES (?,?,?,?,?,?,'pending',?,?)`)
    .bind(id,project,url,metadata.title,metadata.author,metadata.thumbnail,date,date).run();
  // Return same result for existing entries: don't expose moderation states to other visitors.
  return json({ok:true,message:'受付しました。確認後、ツリーに飾られます。'},202);
}
