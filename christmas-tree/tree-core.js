
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
export const TREE_CAPACITY=15;
export const TREES_PER_PAGE=3;
export const TREE_PAGE_SIZE=TREE_CAPACITY*TREES_PER_PAGE;
export const TREE_SPOTS=[
  {x:50,y:23},
  {x:42,y:35},{x:58,y:35},
  {x:33,y:47},{x:50,y:47},{x:67,y:47},
  {x:27,y:59},{x:42,y:59},{x:58,y:59},{x:73,y:59},
  {x:20,y:72},{x:35,y:72},{x:50,y:72},{x:65,y:72},{x:80,y:72}
];
export function treeCountForWorks(count) {
  return Math.max(1,Math.ceil(Math.max(0,Number(count)||0)/TREE_CAPACITY));
}
export function grovePage(items,page=0) {
  const all=Array.isArray(items)?items:[];
  const totalTrees=treeCountForWorks(all.length);
  const pages=Math.max(1,Math.ceil(totalTrees/TREES_PER_PAGE));
  const safePage=Math.max(0,Math.min(pages-1,Math.trunc(Number(page)||0)));
  const trees=[];
  for(let tree=safePage*TREES_PER_PAGE;tree<Math.min(totalTrees,(safePage+1)*TREES_PER_PAGE);tree++){
    const works=all.slice(tree*TREE_CAPACITY,(tree+1)*TREE_CAPACITY);
    trees.push({number:tree+1,works});
  }
  return {page:safePage,pages,totalTrees,trees};
}
