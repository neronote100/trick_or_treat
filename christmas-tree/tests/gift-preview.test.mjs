import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {noteArticleUrl,imageUrl,santaGiftsForForest,SANTA_FOREST_IDS,SANTA_GIFT_CAPACITY,grovePage,TREE_CAPACITY} from '../tree-core.js';

const sample=JSON.parse(readFileSync(new URL('../data/gift-preview-p1.json',import.meta.url),'utf8'));
const html=readFileSync(new URL('../gift-preview.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('P1 sample has 35 real public note articles and working metadata fields',()=>{
 assert.equal(sample.preview,true);
 assert.equal(sample.source_hashtag,'王子ごっこP1');
 assert.equal(sample.articles.length,35);
 assert.equal(new Set(sample.articles.map(x=>x.url)).size,sample.articles.length);
 for(const x of sample.articles){
  assert.equal(x.project_id,'santa');
  assert.ok(noteArticleUrl(x.url),'Invalid note URL: '+x.url);
  assert.ok(imageUrl(x.thumbnail),'Missing or invalid note thumbnail: '+x.url);
  assert.ok(x.title.length>0);
  assert.ok(x.author.length>0);
 }
});
test('P1 note articles appear only as Santa gifts under three existing trees',()=>{
 const groupings=SANTA_FOREST_IDS.map(f=>santaGiftsForForest(sample.articles,f));
 assert.equal(SANTA_FOREST_IDS.length,3);
 assert.equal(groupings.flat().length,35);
 assert.equal(new Set(groupings.flat().map(x=>x.url)).size,35);
 assert.ok(groupings.every(g=>g.length>0));
 for(const group of groupings){
  const layout=grovePage([],0,TREE_CAPACITY,Math.ceil(group.length/SANTA_GIFT_CAPACITY));
  assert.equal(layout.totalTrees,Math.max(1,Math.ceil(group.length/12)));
  for(const tree of layout.trees) assert.ok(group.slice((tree.number-1)*12,tree.number*12).length<=12);
 }
});
test('P1 preview page is clearly separated from real events and search indexing',()=>{
 assert.match(html,/<body data-mode="gift-preview">/);
 assert.match(html,/name="robots" content="noindex,nofollow"/);
 assert.match(html,/#王子ごっこP1/);
 assert.match(html,/参加したという意味ではありません/);
 assert.match(html,/id="open-all-preview-gifts"/);
 assert.match(html,/id="reset-preview-gifts"/);
 assert.match(app,/heartful-tree:p1-gift-preview:opened:v1/);
 assert.match(app,/data\/gift-preview-p1\.json/);
 assert.match(app,/if\(!archiveMode&&!giftPreviewMode\)/);
});
