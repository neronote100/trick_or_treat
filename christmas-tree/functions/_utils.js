export const PROJECT_IDS = new Set(['letter','confession','card','santa']);
export function normalizeNoteUrl(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    if (u.protocol !== 'https:' || !['note.com','www.note.com'].includes(u.hostname)) return null;
    if (!/^\/[a-zA-Z0-9_-]+\/n\/n[a-zA-Z0-9]+\/?$/.test(u.pathname)) return null;
    return 'https://note.com' + u.pathname.replace(/\/$/, '');
  } catch { return null; }
}
export function validImage(raw) {
  try { const u = new URL(String(raw || '').trim()); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; }
  catch { return ''; }
}
export function json(data, status=200) {
  return new Response(JSON.stringify(data), {status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
export function entityDecode(s) {
  return String(s || '').replace(/&(?:amp|lt|gt|quot|#39|apos|#x([0-9a-f]+)|#(\d+));/gi, (all,hex,dec)=>{
    if (hex || dec) {const n=parseInt(hex||dec,hex?16:10);return Number.isInteger(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}
    return {'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'",'&apos;':"'"}[all.toLowerCase()] || all;
  });
}
export function metaValue(html, key) {
  const tags = String(html).match(/<meta\s+[^>]*>/gi) || [];
  for (const tag of tags) {
    const attrs={};
    const re=/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g; let m;
    while ((m=re.exec(tag))) attrs[m[1].toLowerCase()]=m[2]??m[3]??m[4];
    if ((attrs.property||attrs.name||'').toLowerCase()===key.toLowerCase()) return entityDecode(attrs.content||'');
  }
  return '';
}
export async function readNoteMetadata(url) {
  let current=url;
  for (let i=0;i<3;i++) {
    const response=await fetch(current,{redirect:'manual',headers:{'accept':'text/html','user-agent':'Mozilla/5.0 ChristmasForest/1.0'}});
    if (response.status>=300 && response.status<400) {
      const next=new URL(response.headers.get('location')||'',current);
      if (next.protocol!=='https:' || !['note.com','www.note.com'].includes(next.hostname)) throw new Error('note redirected outside');
      current=next.href;continue;
    }
    if (!response.ok) throw new Error('metadata HTTP '+response.status);
    if (!(response.headers.get('content-type')||'').includes('text/html')) throw new Error('not HTML');
    const length=Number(response.headers.get('content-length')||0);
    if(length>900000)throw new Error('article HTML too large');
    const html=(await response.text()).slice(0,900000);
    const author=metaValue(html,'author')||metaValue(html,'article:author')||'noteクリエイター';
    return {
      title:(metaValue(html,'og:title')||metaValue(html,'twitter:title')||'記事タイトル確認中').slice(0,220),
      author:author.slice(0,100),
      thumbnail:validImage(metaValue(html,'og:image')||metaValue(html,'twitter:image'))
    };
  }
  throw new Error('too many redirects');
}
export async function verifyTurnstile(secret, token, remoteIp) {
  if (!secret || !token || token.length>3000) return false;
  const form=new FormData();form.set('secret',secret);form.set('response',token);
  if(remoteIp)form.set('remoteip',remoteIp);
  const res=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:form});
  if(!res.ok)return false;
  return (await res.json()).success===true;
}
export async function allowAttempt(db,ip) {
  // Hash the IP; no raw visitor address is stored. D1 TTL is cleaned up on write.
  const hashData=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip || 'unknown'));
  const key=Array.from(new Uint8Array(hashData)).map(x=>x.toString(16).padStart(2,'0')).join('');
  const now=Math.floor(Date.now()/1000),windowStart=Math.floor(now/3600)*3600;
  await db.prepare('DELETE FROM request_limits WHERE window_start < ?').bind(windowStart-3600).run();
  await db.prepare(`INSERT INTO request_limits (client_hash,window_start,attempts) VALUES (?,?,1)
    ON CONFLICT(client_hash) DO UPDATE SET
    attempts=CASE WHEN window_start=excluded.window_start THEN attempts+1 ELSE 1 END,
    window_start=excluded.window_start`).bind(key,windowStart).run();
  const row=await db.prepare('SELECT attempts FROM request_limits WHERE client_hash=?').bind(key).first();
  return (row?.attempts||0)<=12;
}
export function authorized(request, token) {
  const h=request.headers.get('authorization') || '';
  return Boolean(token && token.length>=24 && h.startsWith('Bearer ') && h.slice(7)===token);
}
