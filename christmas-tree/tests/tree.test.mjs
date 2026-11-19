
import test from 'node:test';import assert from 'node:assert/strict';
import {stageForCount,noteArticleUrl,TREE_SPOTS,TREE_PAGE_SIZE} from '../tree-core.js';
test('tree transplants as approved works increase',()=>{
 for(const [count,expected] of [[0,1],[7,1],[8,2],[19,2],[20,3],[39,3],[40,4],[999,4]])assert.equal(stageForCount(count),expected);
});
test('tree has a stable tappable position for each page entry',()=>{
 assert.ok(TREE_SPOTS.length>=TREE_PAGE_SIZE);
 for(const p of TREE_SPOTS){assert.ok(p.x>=0&&p.x<=100);assert.ok(p.y>=0&&p.y<=100);}
});
test('note URL rules block invalid links',()=>{
 assert.equal(noteArticleUrl('https://note.com/alice/n/n123456'), 'https://note.com/alice/n/n123456');
 assert.equal(noteArticleUrl('https://example.org/bob/n/n123'),null);
 assert.equal(noteArticleUrl('javascript:alert(1)'),null);
});
