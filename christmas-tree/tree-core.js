
export function stageForCount(n, thresholds=[0,8,20,40]) {
  const count=Math.max(0,Number(n)||0);
  let stage=1;
  for(let i=0;i<thresholds.length;i++) if(count>=thresholds[i]) stage=i+1;
  return Math.min(4,stage);
}
export function noteArticleUrl(raw) {
  try {
    const u=new URL(String(raw||''));
    return u.protocol==='https:' && ['note.com','www.note.com'].includes(u.hostname) &&
      /^\/[a-zA-Z0-9_-]+\/n\/n[a-zA-Z0-9]+\/?$/.test(u.pathname) ? u.href : null;
  }catch{return null;}
}
export function imageUrl(raw) {
  try {const u=new URL(String(raw||''));return u.protocol==='https:' ? u.href:null;}catch{return null;}
}
export const TREE_PAGE_SIZE=75;
export const TREE_SPOTS=(()=>{
  const spots=[];
  for(let row=0;row<10;row++) {
    const n=3+row, half=7+row*3.2;
    for(let j=0;j<n;j++) spots.push({x:50+((j/(n-1))*2-1)*half,y:22+row*5.1+(j%2?0.8:0)});
  }
  return spots;
})();
