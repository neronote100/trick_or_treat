
import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestPost as submit} from '../functions/api/submit.js';
import {onRequestGet as ornaments} from '../functions/api/ornaments.js';
import {onRequestPost as adminUpdate} from '../functions/api/admin.js';
const fakeDB=()=>{
 const rows=new Map(), limits=new Map();
 return {rows,prepare(sql){
  let args=[];
  const query={
   bind(...values){args=values;return query;},
   async run(){
    if(sql.includes('INSERT INTO request_limits')){const [id,window]=args;const before=limits.get(id);limits.set(id,{attempts:before?.window===window?before.attempts+1:1,window});}
    if(sql.includes('DELETE FROM request_limits')){for(const [k,v] of limits)if(v.window<args[0])limits.delete(k);}
    if(sql.includes('INSERT OR IGNORE INTO submissions')){
      const [id,project,url,title,author,thumbnail,consent,created]=args;
      if(![...rows.values()].some(x=>x.project_id===project&&x.url===url)) rows.set(id,{id,project_id:project,url,title,author,thumbnail,consent_at:consent,created_at:created,status:'pending',featured_by:'',reviewed_at:null});
    }
    if(sql.includes('UPDATE submissions')){
      const [status,title,author,thumbnail,featured_by,reviewed_at,id]=args;Object.assign(rows.get(id),{status,title,author,thumbnail,featured_by,reviewed_at});
    }
    return {success:true};
   },
   async first(){
    if(sql.includes('SELECT attempts'))return {attempts:limits.get(args[0])?.attempts||0};
    if(sql.includes('SELECT * FROM submissions'))return rows.get(args[0])||null;
    return null;
   },
   async all(){
    if(sql.includes("status='approved'"))return {results:[...rows.values()].filter(x=>x.status==='approved')};
    return {results:[...rows.values()]};
   }
  };return query;
 }};
};
const env=db=>({ORNAMENTS_DB:db,REGISTRATION_OPEN:'true',OPEN_PROJECTS:'letter',TURNSTILE_SECRET:'fake-secret',ADMIN_TOKEN:'0123456789abcdefghijklmnopqrst'});
const makeRequest=(obj)=>new Request('https://site.example/api/submit',{method:'POST',headers:{'content-type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify(obj)});
const valid={project_id:'letter',url:'https://note.com/writer/n/nabc123',consent:true,is_author_or_authorized:true,turnstile_token:'pass'};
test('submission rejects unconfigured or unconsented requests',async()=>{
 const db=fakeDB();
 assert.equal((await submit({request:makeRequest(valid),env:{}})).status,503);
 assert.equal((await submit({request:makeRequest({...valid,consent:false}),env:env(db)})).status,400);
 assert.equal((await submit({request:makeRequest({...valid,project_id:'card'}),env:env(db)})).status,403);
 assert.equal((await submit({request:makeRequest({...valid,url:'https://evil.example/unsafe'}),env:env(db)})).status,400);
});
test('URL registration is deduplicated, hidden until admin approval, then public',async()=>{
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(input)=>{
  const url=String(input);
  if(url.includes('siteverify'))return new Response(JSON.stringify({success:true}),{status:200,headers:{'content-type':'application/json'}});
  return new Response('<html><head><meta property="og:title" content="雪の日の手紙"><meta content="https://img.example/s.jpg" property="og:image"><meta name="author" content="作者さん"></head></html>',{status:200,headers:{'content-type':'text/html'}});
 };
 try{
  const db=fakeDB(),e=env(db);
  assert.equal((await submit({request:makeRequest(valid),env:e})).status,202);
  assert.equal((await submit({request:makeRequest(valid),env:e})).status,202);
  assert.equal(db.rows.size,1);
  assert.equal((await (await ornaments({env:e})).json()).articles.length,0);
  const id=[...db.rows.keys()][0];
  const req=new Request('https://site.example/api/admin',{method:'POST',headers:{'authorization':'Bearer '+e.ADMIN_TOKEN,'content-type':'application/json'},body:JSON.stringify({id,status:'approved',featured_by:'らて'})});
  assert.equal((await adminUpdate({request:req,env:e})).status,200);
  const visible=(await (await ornaments({env:e})).json()).articles;
  assert.equal(visible.length,1);
  assert.equal(visible[0].title,'雪の日の手紙');
  assert.equal(visible[0].featured_by,'らて');
  assert.equal(visible[0].project_id,'letter');
 }finally{globalThis.fetch=originalFetch;}
});
