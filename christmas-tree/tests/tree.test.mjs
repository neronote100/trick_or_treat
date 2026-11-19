import test from 'node:test';
import assert from 'node:assert/strict';
import {stageForCount,noteArticleUrl,TREE_SPOTS,TREE_CAPACITY,TREES_PER_PAGE,TREE_PAGE_SIZE,grovePage,treeCountForWorks} from '../tree-core.js';
test('growth retains four stages',()=>{
 for(const [n,expected] of [[0,1],[8,2],[20,3],[40,4],[999,4]])assert.equal(stageForCount(n),expected);
});
test('ornaments have 15 spacious and unique slots',()=>{
 assert.equal(TREE_SPOTS.length,TREE_CAPACITY);
 assert.equal(new Set(TREE_SPOTS.map(p=>p.x+':'+p.y)).size,TREE_CAPACITY);
 for(const p of TREE_SPOTS){assert.ok(p.x>=18&&p.x<=82);assert.ok(p.y>=20&&p.y<=74);}
 assert.equal(TREE_PAGE_SIZE,TREE_CAPACITY*TREES_PER_PAGE);
});
test('new tree after capacity; three trees per garden page',()=>{
 for(const [n,trees] of [[0,1],[1,1],[15,1],[16,2],[30,2],[31,3],[45,3],[46,4],[75,5],[220,15]])
   assert.equal(treeCountForWorks(n),trees);
 const sample=Array.from({length:75},(_,i)=>({id:i}));
 const first=grovePage(sample,0),last=grovePage(sample,1);
 assert.equal(first.trees.length,3);
 assert.deepEqual(first.trees.map(x=>x.works.length),[15,15,15]);
 assert.deepEqual(last.trees.map(x=>x.works.length),[15,15]);
 assert.equal(last.pages,2);
 assert.equal(grovePage([],0).trees.length,1);
 assert.equal(grovePage(sample,99).page,1);
});
test('note links are origin restricted',()=>{
 assert.equal(noteArticleUrl('https://note.com/alice/n/n123456'),'https://note.com/alice/n/n123456');
 assert.equal(noteArticleUrl('https://bad.com/n/n123'),null);
});
