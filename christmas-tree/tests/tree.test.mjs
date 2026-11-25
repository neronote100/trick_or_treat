import test from 'node:test';
import assert from 'node:assert/strict';
import {
 stageForCount,noteArticleUrl,RING_TIERS,TREE_CAPACITY,TREES_PER_PAGE,TREE_PAGE_SIZE,
 treeCountForWorks,grovePage,ornamentOrbit,projectOrbit,stepSway,
 SANTA_GIFT_CAPACITY,SANTA_FOREST_IDS,santaGiftDestination,santaGiftsForForest,
 santaGiftOrbit,projectSantaGift,TREE_CANOPY_LIFT,TREE_CAMERA,GIFT_GROUND_Y,GIFT_PLATFORM_RADIUS
} from '../tree-core.js';
test('tree stays in four growth stages',()=>{
 for(const [n,expected] of [[0,1],[8,2],[20,3],[40,4],[999,4]])
  assert.equal(stageForCount(n),expected);
});
test('48 positions live on four height-separated 360-degree rings',()=>{
 assert.equal(TREE_CAPACITY,48);
 assert.equal(RING_TIERS.reduce((n,t)=>n+t.count,0),TREE_CAPACITY);
 const all=Array.from({length:TREE_CAPACITY},(_,i)=>ornamentOrbit(i));
 assert.equal(ornamentOrbit(-1),null);
 assert.equal(ornamentOrbit(48),null);
 assert.equal(new Set(all.map(o=>o.tier+':'+o.angle)).size,48);
 assert.deepEqual([...new Set(all.map(o=>o.y))],[28,42,56,72]);
 assert.equal(TREE_PAGE_SIZE,TREE_CAPACITY*TREES_PER_PAGE);
});
test('360-degree ring rotates, fades hidden rear ornaments, restores front',()=>{
 const orbit=ornamentOrbit(0);
 const initial=projectOrbit(orbit,0);
 const back=projectOrbit(orbit,180);
 const fullTurn=projectOrbit(orbit,360);
 assert.ok(initial.interactive);
 assert.ok(!back.interactive);
 assert.ok(initial.opacity>back.opacity);
 assert.ok(Math.abs(initial.x-fullTurn.x)<1e-8);
 assert.ok(Math.abs(initial.y-fullTurn.y)<1e-8);
 assert.ok(initial.x>=0 && initial.x<=100);
 for(let i=0;i<48;i++){
  for(let angle=0;angle<360;angle+=15){
   const pos=projectOrbit(ornamentOrbit(i),angle);
   assert.ok(pos.x>=10 && pos.x<=90);
   assert.ok(pos.y>=25 && pos.y<=78);
  }
 }
});
test('inertia-induced sway damps toward zero when rotation stops',()=>{
 let state={angle:0,velocity:0};
 for(let n=0;n<18;n++)state=stepSway(state,130,70,1/60,1);
 assert.ok(Math.abs(state.angle)>0.05);
 for(let n=0;n<420;n++)state=stepSway(state,0,0,1/60,1);
 assert.ok(Math.abs(state.angle)<0.07,JSON.stringify(state));
 assert.ok(Math.abs(state.velocity)<0.07,JSON.stringify(state));
});
test('a new tree is planted after 48 works, three trees per garden page',()=>{
 for(const [n,trees] of [[0,1],[1,1],[24,1],[48,1],[49,2],[96,2],[97,3],[144,3],[145,4],[195,5],[548,12]])
   assert.equal(treeCountForWorks(n),trees);
 const all=Array.from({length:195},(_,i)=>({id:i}));
 const first=grovePage(all,0),second=grovePage(all,1);
 assert.deepEqual(first.trees.map(x=>x.works.length),[48,48,48]);
 assert.deepEqual(second.trees.map(x=>x.number),[4,5]);
 assert.equal(first.pages,2);
 assert.equal(grovePage(all,99).page,1);
 assert.equal(grovePage([],0).trees.length,1);
});
test('note article links are origin restricted',()=>{
 assert.equal(noteArticleUrl('https://note.com/alice/n/n123456'),'https://note.com/alice/n/n123456');
 assert.equal(noteArticleUrl('https://bad.com/n/n123'),null);
});

test('Santa delivers to one of three original forests, in a stable random-looking pattern',()=>{
 assert.deepEqual(SANTA_FOREST_IDS,['letter','confession','card']);
 const gifts=Array.from({length:120},(_,i)=>({
  project_id:'santa',url:'https://note.com/creator/n/n'+String(i).padStart(6,'0'),
  first_seen:String(i).padStart(6,'0')
 }));
 const groups=SANTA_FOREST_IDS.map(id=>santaGiftsForForest(gifts,id));
 assert.equal(groups.reduce((n,g)=>n+g.length,0),120);
 assert.deepEqual(new Set(groups.flat().map(g=>g.url)).size,120);
 for(const group of groups)assert.ok(group.length>10,'Santa should visit every original forest');
 for(const gift of gifts){
  const destination=santaGiftDestination(gift.url);
  assert.ok(SANTA_FOREST_IDS.includes(destination));
  assert.equal(santaGiftDestination(gift.url),destination);
  assert.ok(santaGiftsForForest(gifts,destination).includes(gift));
 }
 const additional={project_id:'santa',url:'https://note.com/creator/n/n999999'};
 for(const gift of gifts)assert.equal(santaGiftDestination(gift.url),santaGiftDestination(gift.url));
 for(const id of SANTA_FOREST_IDS)
  assert.deepEqual(santaGiftsForForest([...gifts,additional],id).slice(0,groups[SANTA_FOREST_IDS.indexOf(id)].length),
                   groups[SANTA_FOREST_IDS.indexOf(id)]);
 assert.equal(santaGiftDestination('javascript:alert(1)'),null);
 assert.equal(santaGiftsForForest(gifts,'santa').length,0); // No fourth gift-only forest.
});
test('Santa boxes and normal ornaments coexist without overflow or lost gifts',()=>{
 assert.equal(SANTA_GIFT_CAPACITY,12);
 for(const [giftCount,requiredTrees] of [[0,1],[1,1],[12,1],[13,2],[36,3],[37,4],[144,12]])
  assert.equal(treeCountForWorks(giftCount,SANTA_GIFT_CAPACITY),requiredTrees);
 const ornaments=[{id:1},{id:2}];
 const gifts=Array.from({length:41},(_,i)=>({id:'gift-'+i}));
 const minTrees=treeCountForWorks(gifts.length,SANTA_GIFT_CAPACITY);
 const first=grovePage(ornaments,0,TREE_CAPACITY,minTrees);
 const second=grovePage(ornaments,1,TREE_CAPACITY,minTrees);
 assert.equal(first.totalTrees,4);
 assert.equal(first.pages,2);
 assert.deepEqual(first.trees.map(t=>t.works.length),[2,0,0]);
 assert.equal(second.trees[0].number,4);
 assert.deepEqual(second.trees[0].works,[]);
 const distributed=[...first.trees,...second.trees].flatMap(t=>
  gifts.slice((t.number-1)*SANTA_GIFT_CAPACITY,t.number*SANTA_GIFT_CAPACITY));
 assert.deepEqual(distributed,gifts);
 assert.equal(grovePage(ornaments,0).totalTrees,1);
 assert.equal(grovePage(Array.from({length:98},(_,i)=>({id:i})),0,TREE_CAPACITY,2).totalTrees,3);
});

test('Santa gifts are grounded on the real tree rotation axis, never in a static grid',()=>{
 const gifts=Array.from({length:SANTA_GIFT_CAPACITY},(_,i)=>santaGiftOrbit(i));
 assert.equal(gifts.length,12);
 assert.ok(gifts.every(g=>g&&Math.abs(g.worldY-GIFT_GROUND_Y)<1e-9&&g.worldRadius>1.4&&g.worldRadius<2.1));
 assert.ok(TREE_CANOPY_LIFT>=.8&&TREE_CANOPY_LIFT<=1.25);
 assert.ok(TREE_CAMERA.y>3.3&&TREE_CAMERA.y<3.6&&TREE_CAMERA.z>=13.5);
 assert.ok(Math.max(...gifts.map(g=>g.worldRadius))+.45<GIFT_PLATFORM_RADIUS,
  'Gift boxes, not only their centers, must lie inside the actual snow circle');
 for(const angle of [0,90,180,270]){
  const circumference=projectSantaGift({angle,worldRadius:GIFT_PLATFORM_RADIUS,
   worldY:GIFT_GROUND_Y},0);
  assert.ok(circumference.y>70&&circumference.y<97,
   'Visible snow circle must never be clipped by canvas edges');
 }
 assert.equal(new Set(gifts.map(g=>g.angle)).size,12);
 assert.equal(santaGiftOrbit(-1),null);
 assert.equal(santaGiftOrbit(12),null);
 const orbit=gifts[0];
 const initial=projectSantaGift(orbit,0);
 const quarter=projectSantaGift(orbit,90);
 const opposite=projectSantaGift(orbit,180);
 const fullTurn=projectSantaGift(orbit,360);
 assert.ok(initial.interactive,'front-facing present is tappable');
 assert.ok(initial.y>85&&initial.y<99,'present bottom must sit on the ground line');
 assert.ok(1.55+TREE_CANOPY_LIFT-GIFT_GROUND_Y>2,
  'bottom-tier ornaments must hang more than two world units above the gift bases');
 assert.equal(opposite.interactive,false,'present behind tree cannot be tapped');
 assert.ok(Math.abs(initial.x-quarter.x)>12,'turning moves presents horizontally');
 assert.ok(Math.abs(initial.x-fullTurn.x)<1e-9);
 assert.ok(Math.abs(initial.y-fullTurn.y)<1e-9);
 assert.ok(opposite.opacity<initial.opacity);
 assert.ok(opposite.scale<initial.scale,'perspective shrinks presents behind tree');
 for(let i=0;i<12;i++){
  for(let angle=0;angle<360;angle+=20){
   const p=projectSantaGift(gifts[i],angle);
   assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
   assert.ok(p.scale>.7&&p.scale<1.2);
  }
 }
});
