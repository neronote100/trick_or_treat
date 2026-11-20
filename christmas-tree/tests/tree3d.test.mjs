import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../tree3d.js',import.meta.url),'utf8');
test('3D tree is actual WebGL geometry, not flat image crossed panels',()=>{
 assert.match(src,/new THREE\.WebGLRenderer/);
 assert.match(src,/new THREE\.InstancedMesh/);
 assert.match(src,/new THREE\.ConeGeometry/);
 assert.match(src,/new THREE\.ExtrudeGeometry/);
 assert.match(src,/new THREE\.TubeGeometry/);
 assert.match(src,/renderer\.render\(scene,camera\)/);
 assert.doesNotMatch(src,/tree-facet/);
});
test('3D ornaments project to HTML links and dispose GPU resources',()=>{
 assert.match(src,/ball\.getWorldPosition/);
 assert.match(src,/project\(camera\)/);
 assert.match(src,/resizeObserver\.disconnect\(\)/);
 assert.match(src,/renderer\.dispose\(\)/);
 assert.match(src,/pendulum\.rotation\.z/);
});
