import test from 'node:test';
import assert from 'node:assert/strict';
import {
 stageForCount,noteArticleUrl,RING_TIERS,TREE_CAPACITY,TREES_PER_PAGE,TREE_PAGE_SIZE,
 treeCountForWorks,grovePage,ornamentOrbit,projectOrbit,stepSway
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
