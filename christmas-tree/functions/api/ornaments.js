
import {json} from '../_utils.js';
export async function onRequestGet({env}) {
  if (!env.ORNAMENTS_DB) return json({error:'DB_NOT_CONFIGURED',articles:[]},503);
  const data=await env.ORNAMENTS_DB.prepare(`SELECT project_id,url,title,author,thumbnail,featured_by,
    created_at,reviewed_at FROM submissions WHERE status='approved'
    ORDER BY created_at ASC,id ASC LIMIT 1000`).all();
  return json({updated_at:new Date().toISOString(),articles:(data.results||[]).map(x=>({
    project_id:x.project_id,url:x.url,title:x.title,author:x.author,
    thumbnail:x.thumbnail,featured_by:x.featured_by,first_seen:x.created_at,approved_at:x.reviewed_at
  }))});
}
