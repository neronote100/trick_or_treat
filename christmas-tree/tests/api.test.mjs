
import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeNoteUrl,validImage,entityDecode,metaValue,PROJECT_IDS} from '../functions/_utils.js';
test('normalizes ordinary note article links only',()=>{
 assert.equal(normalizeNoteUrl('https://note.com/nero/n/nabc123?from=x'),'https://note.com/nero/n/nabc123');
 assert.equal(normalizeNoteUrl('https://evil.example/n/nabc123'),null);
 assert.equal(normalizeNoteUrl('http://note.com/nero/n/nabc123'),null);
 assert.equal(normalizeNoteUrl('https://note.com.evil.com/a/n/nabc123'),null);
 assert.equal(normalizeNoteUrl('https://note.com/nero/m/m123'),null);
});
test('extracts metadata regardless of attribute order',()=>{
 const html=`<meta content="雪の夜" property="og:title"><meta property='og:image' content='https://images.example.org/a.jpg'>`;
 assert.equal(metaValue(html,'og:title'),'雪の夜');
 assert.equal(metaValue(html,'og:image'),'https://images.example.org/a.jpg');
});
test('accepts project IDs only from allowlist',()=>{assert.ok(PROJECT_IDS.has('letter'));assert.equal(PROJECT_IDS.has('unknown'),false);});
test('normalizes images and decodes entities',()=>{
 assert.equal(validImage('javascript:alert(1)'),'');
 assert.equal(entityDecode('恋 &amp; 雪'),'恋 & 雪');
});
