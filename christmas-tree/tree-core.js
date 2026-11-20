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

// Three tapered horizontal rings around the tree, not a flat 24-item grid.
// Every ornament has its own angle on one of the 360-degree rings.
export const RING_TIERS=Object.freeze([
  Object.freeze({count:6, y:28, radius:16, worldY:4.85, worldRadius:1.12, start:0}),
  Object.freeze({count:10,y:42, radius:24, worldY:3.90, worldRadius:1.58, start:11}),
  Object.freeze({count:14,y:56, radius:31, worldY:2.80, worldRadius:2.02, start:7}),
  Object.freeze({count:18,y:72, radius:38, worldY:1.55, worldRadius:2.45, start:3}),
]);
export const TREE_CAPACITY=RING_TIERS.reduce((n,t)=>n+t.count,0);
export const TREES_PER_PAGE=3;
export const TREE_PAGE_SIZE=TREE_CAPACITY*TREES_PER_PAGE;
export const AUTO_ROTATION_DEG_PER_SEC=2.8;

export const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));

export function ornamentOrbit(index) {
  if(!Number.isInteger(index)||index<0||index>=TREE_CAPACITY)return null;
  let offset=index;
  for(let tier=0;tier<RING_TIERS.length;tier++){
    const t=RING_TIERS[tier];
    if(offset<t.count) {
      return {
        tier,
        angle:t.start+(360*offset)/t.count,
        radius:t.radius,
        y:t.y,
        worldY:t.worldY,
        worldRadius:t.worldRadius,
        weight:0.84+((index*7)%9)/20,
      };
    }
    offset-=t.count;
  }
  return null;
}

export function projectOrbit(orbit, rotationDegrees=0) {
  const radians=(orbit.angle+rotationDegrees)*Math.PI/180;
  const depth=Math.cos(radians);
  const facing=depth>0.22;
  return {
    x:50+orbit.radius*Math.sin(radians),
    y:orbit.y+1.8*depth,
    depth,
    scale:0.76+0.25*((depth+1)/2),
    opacity:depth<=-0.12?0.09:clamp((depth+0.12)*0.9,0.10,1),
    interactive:facing,
    zIndex:Math.round(50+depth*40),
  };
}

// A spring/damper, driven by changes in ring speed rather than a
// perpetual identical CSS wiggle. Uses degrees and seconds.
export function stepSway(state, angularVelocity, angularAcceleration, dt, weight=1) {
  const d=clamp(dt,0,0.05);
  const spring=26/weight;
  const damping=7/weight;
  const target=clamp(-angularVelocity*0.022-angularAcceleration*0.0026,-9,9);
  const v=(state.velocity||0)+(spring*(target-(state.angle||0))-damping*(state.velocity||0))*d;
  return {angle:clamp((state.angle||0)+v*d,-10,10),velocity:v};
}

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
