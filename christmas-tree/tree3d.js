// Genuine WebGL / three.js 3D Christmas tree. The old crossed-image panels are NOT used.
// A volumetric conifer (many opaque 3D meshes), trunk, 3D star, helix garlands,
// instanced needles and lamps, and pendant baubles all rotate as one real object.
// The note article images remain DOM links projected from matching 3D anchors
// so they can open in the browser without cross-origin canvas texture problems.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import {ornamentOrbit} from './tree-core.js';

const DEG=Math.PI/180;
const UP=new THREE.Vector3(0,1,0);
const COLORS=[0x0a3a2b,0x104a34,0x16543c,0x1d6546,0x31754d,0x205b43];
const BAUBLE=[0xc99b64,0xe1c189,0xb58c9d,0x9cb5b5,0xe3ae76,0xc79491];
function seeded(seed) {
 let n=seed>>>0;
 return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};
}
const radiusAt=y=>Math.max(.06,2.62*Math.pow(Math.max(.004,1-(y-.55)/5.96),.83));
const cylinder=(a,b,h,segments=10)=>new THREE.CylinderGeometry(a,b,h,segments);
function addMesh(group,geo,mat,x=0,y=0,z=0){
 const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);group.add(m);return m;
}
function createGlitterMap(){
 const c=document.createElement('canvas');c.width=c.height=64;
 const ctx=c.getContext('2d');
 const radial=ctx.createRadialGradient(32,32,0,32,32,32);
 radial.addColorStop(0,'rgba(255,255,240,1)');
 radial.addColorStop(.14,'rgba(255,247,189,.88)');
 radial.addColorStop(.42,'rgba(255,223,126,.36)');
 radial.addColorStop(1,'rgba(255,220,100,0)');
 ctx.fillStyle=radial;ctx.fillRect(0,0,64,64);
 return new THREE.CanvasTexture(c);
}
function starGeometry(){
 const s=new THREE.Shape();
 for(let n=0;n<10;n++){
  const a=Math.PI/2+n*Math.PI/5,rad=n%2? .135:.33;
  const x=Math.cos(a)*rad,y=Math.sin(a)*rad;
  if(n===0)s.moveTo(x,y);else s.lineTo(x,y);
 }
 s.closePath();
 return new THREE.ExtrudeGeometry(s,{
   depth:.115,bevelEnabled:true,bevelThickness:.045,bevelSize:.028,
   bevelSegments:2,curveSegments:2,steps:1
 });
}
function placeGlow(group,random){
 const positions=[],colors=[];
 const shades=[new THREE.Color(0xffe9aa),new THREE.Color(0xffe4be),
               new THREE.Color(0xb4f0ff),new THREE.Color(0xffb3be)];
 for(let n=0;n<620;n++){
  const y=.82+random()*5.36;
  const a=random()*Math.PI*2;
  const r=radiusAt(y)*(0.99+random()*.07);
  positions.push(Math.sin(a)*r,y,Math.cos(a)*r);
  const color=shades[Math.floor(random()*shades.length)];
  colors.push(color.r,color.g,color.b);
 }
 const geo=new THREE.BufferGeometry();
 geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 const texture=createGlitterMap();
 const material=new THREE.PointsMaterial({
  size:.30,map:texture,transparent:true,vertexColors:true,depthWrite:false,
  blending:THREE.AdditiveBlending,sizeAttenuation:true,opacity:1
 });
 const points=new THREE.Points(geo,material);group.add(points);
 return texture;
}
function buildFoliage(tree,random){
 // Opaque overlapping cones are real 3D volumes, not flat crossed planes.
 const layerMats=COLORS.map(c=>new THREE.MeshStandardMaterial({
  color:c,roughness:.92,metalness:0,side:THREE.FrontSide
 }));
 for(let layer=0;layer<8;layer++){
  const bottom=.66+layer*.655;
  const top=Math.min(6.41,bottom+2.13);
  const radius=radiusAt(bottom)*(.96+random()*.065);
  const cone=addMesh(tree,new THREE.ConeGeometry(radius,top-bottom,28,3),
   layerMats[layer%layerMats.length],0,(bottom+top)/2,0);
  cone.rotation.y=random()*Math.PI;
 }
 // Hundreds of five-sided boughs radiate out in three dimensions.
 const geo=new THREE.ConeGeometry(.155,.76,6,1);
 const materials=COLORS.map(c=>new THREE.MeshLambertMaterial({color:c}));
 const transforms=materials.map(()=>[]);
 const quat=new THREE.Quaternion(),dummy=new THREE.Object3D();
 const direction=new THREE.Vector3();
 for(let level=0;level<30;level++){
  const y=.82+level*.181;
  const radius=radiusAt(y),spokes=Math.max(9,Math.round(21-y*1.5));
  for(let spoke=0;spoke<spokes;spoke++){
   const a=(spoke/spokes)*Math.PI*2+level*.39+(random()-.5)*.14;
   const r=radius*(.74+random()*.14);
   const shade=Math.floor(random()*materials.length);
   direction.set(Math.sin(a),.24+(random()-.5)*.25,Math.cos(a)).normalize();
   quat.setFromUnitVectors(UP,direction);
   dummy.position.set(Math.sin(a)*r,y+(random()-.5)*.18,Math.cos(a)*r);
   dummy.quaternion.copy(quat);
   const size=.76+random()*.56;
   dummy.scale.set(size,size, size);
   dummy.updateMatrix();
   transforms[shade].push(dummy.matrix.clone());
  }
 }
 for(let k=0;k<transforms.length;k++){
  const matrices=transforms[k];
  const mesh=new THREE.InstancedMesh(geo,materials[k],matrices.length);
  matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));
  mesh.instanceMatrix.needsUpdate=true;
  mesh.frustumCulled=false;
  tree.add(mesh);
 }
 // Fine needle clusters give the silhouette volume at side-on angles.
 const needleGeo=new THREE.ConeGeometry(.066,.36,5,1);
 const fineMats=[0x368b68,0x2c805e,0x1f7456].map(color=>new THREE.MeshLambertMaterial({color}));
 for(let materialIndex=0;materialIndex<fineMats.length;materialIndex++){
  const mesh=new THREE.InstancedMesh(needleGeo,fineMats[materialIndex],320);
  for(let n=0;n<320;n++){
   const y=.75+random()*5.48,a=random()*Math.PI*2;
   const r=radiusAt(y)*(.83+random()*.19);
   dummy.position.set(Math.sin(a)*r,y,Math.cos(a)*r);
   direction.set(Math.sin(a),.32+(random()-.5)*.3,Math.cos(a)).normalize();
   dummy.quaternion.setFromUnitVectors(UP,direction);
   const sz=.7+random()*.85;dummy.scale.set(sz,sz,sz);
   dummy.updateMatrix();mesh.setMatrixAt(n,dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate=true;mesh.frustumCulled=false;
  tree.add(mesh);
 }
}
function addGarlands(tree){
 const gold=new THREE.MeshStandardMaterial({color:0xf8ca72,metalness:.48,roughness:.3});
 const cream=new THREE.MeshStandardMaterial({color:0xffe9b4,metalness:.32,roughness:.35});
 for(let strand=0;strand<2;strand++){
  const pts=[];
  const count=380;
  for(let i=0;i<=count;i++){
   const t=i/count;
   const y=5.9-4.95*t;
   const r=radiusAt(y)+.08;
   const a=(t*5.1+strand*.49)*Math.PI*2;
   pts.push(new THREE.Vector3(Math.sin(a)*r,y,Math.cos(a)*r));
  }
  const curve=new THREE.CatmullRomCurve3(pts);
  const geometry=new THREE.TubeGeometry(curve,340,strand===0?.021:.014,5,false);
  tree.add(new THREE.Mesh(geometry,strand===0?gold:cream));
 }
}
function createBaubles(tree,count){
 const entries=[];
 const gold=new THREE.MeshStandardMaterial({color:0xffdf98,roughness:.3,metalness:.68});
 const ballGeo=new THREE.SphereGeometry(.158,16,12);
 const hookGeo=cylinder(.021,.021,.23,6);
 const capGeo=cylinder(.08,.075,.055,8);
 for(let i=0;i<count;i++){
  const orbit=ornamentOrbit(i);
  if(!orbit)continue;
  const angle=orbit.angle*DEG;
  const anchor=new THREE.Group();
  anchor.position.set(Math.sin(angle)*orbit.worldRadius,orbit.worldY,Math.cos(angle)*orbit.worldRadius);
  tree.add(anchor);
  const pendulum=new THREE.Group();anchor.add(pendulum);
  addMesh(pendulum,hookGeo,gold,0,-.10,0);
  addMesh(pendulum,capGeo,gold,0,-.235,0);
  const material=new THREE.MeshPhysicalMaterial({
   color:BAUBLE[i%BAUBLE.length],metalness:.59,roughness:.19,
   clearcoat:1,clearcoatRoughness:.16,
   emissive:BAUBLE[i%BAUBLE.length],emissiveIntensity:.045
  });
  const ball=addMesh(pendulum,ballGeo,material,0,-.445,0);
  entries.push({anchor,pendulum,ball,orbit});
 }
 return entries;
}
export function createRealChristmasTree(stage,canvas,ornamentCount){
 if(!window.WebGLRenderingContext && !window.WebGL2RenderingContext)
  throw new Error('WebGL is unavailable');
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.45));
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;
 renderer.toneMappingExposure=1.4;
 renderer.setClearColor(0x09172c,0);
 renderer.domElement.className='real-tree-webgl';
 renderer.domElement.setAttribute('aria-hidden','true');
 stage.append(renderer.domElement);
 const scene=new THREE.Scene();
 const camera=new THREE.PerspectiveCamera(38,1,.1,55);
 camera.position.set(0,3.45,13.2);camera.lookAt(0,3.45,0);
 scene.add(new THREE.HemisphereLight(0xb2d8ff,0x0a1d16,2.3));
 const warm=new THREE.DirectionalLight(0xffdcac,3.3);warm.position.set(3.8,8,6);scene.add(warm);
 const cold=new THREE.DirectionalLight(0xa5e3ff,1.75);cold.position.set(-5,5,-4);scene.add(cold);
 const tree=new THREE.Group();scene.add(tree);
 const rand=seeded(20261225);
 const bark=new THREE.MeshStandardMaterial({color:0x704a32,roughness:1});
 addMesh(tree,cylinder(.10,.20,5.9,12),bark,0,3.02,0);
 buildFoliage(tree,rand);
 addGarlands(tree);
 const starMat=new THREE.MeshPhysicalMaterial({
  color:0xffe3a5,emissive:0xffd45e,emissiveIntensity:.48,
  metalness:.55,roughness:.22,clearcoat:1
 });
 const star=addMesh(tree,starGeometry(),starMat,0,6.64,0);
 star.rotation.y=.16;
 // Thin layered ground cover stays stationary, making rotation obvious.
 const glowMap=placeGlow(tree,rand);
 // A luminous crown that remains dimensional as the tree turns.
 const crown=new THREE.Sprite(new THREE.SpriteMaterial({
   map:glowMap,color:0xffd47a,transparent:true,opacity:.86,
   depthWrite:false,blending:THREE.AdditiveBlending
 }));
 crown.position.set(0,6.70,0);crown.scale.set(1.45,1.45,1);
 tree.add(crown);
 const crownLight=new THREE.PointLight(0xffd28b,5,4.7);
 crownLight.position.set(0,6.60,.1);tree.add(crownLight);
 // Background snowfall is in its OWN depth plane, behind the actual 3D tree.
 const skyPositions=[];
 for(let n=0;n<210;n++){
   skyPositions.push((rand()-.5)*11,rand()*8.2,-3.4-rand()*5.6);
 }
 const skyGeometry=new THREE.BufferGeometry();
 skyGeometry.setAttribute('position',new THREE.Float32BufferAttribute(skyPositions,3));
 const sky=new THREE.Points(skyGeometry,new THREE.PointsMaterial({
   map:glowMap,size:.16,color:0xbdd9ff,transparent:true,
   blending:THREE.AdditiveBlending,depthWrite:false,opacity:.54
 }));
 scene.add(sky);
 const balls=createBaubles(tree,Math.max(0,Math.min(48,ornamentCount)));
 const ground=new THREE.Mesh(new THREE.CircleGeometry(3.2,48),
   new THREE.MeshBasicMaterial({color:0x9cc7dc,transparent:true,opacity:.10,side:THREE.DoubleSide}));
 ground.rotation.x=-Math.PI/2;ground.position.y=.11;scene.add(ground);
 let disposed=false,w=0,h=0;
 const working=new THREE.Vector3(),projected=new THREE.Vector3();
 function resize(){
  const width=Math.max(1,Math.round(canvas.clientWidth));
  const height=Math.max(1,Math.round(canvas.clientHeight));
  if(w===width&&h===height)return;
  w=width;h=height;
  camera.aspect=w/h;camera.updateProjectionMatrix();
  renderer.setSize(w,h,false);
 }
 const resizeObserver=new ResizeObserver(resize);
 resizeObserver.observe(canvas);resize();
 return {
   draw(rotationDegrees,sways=[]){
    if(disposed)return [];
    resize();
    canvas.dataset.rotation=rotationDegrees.toFixed(2);
    tree.rotation.y=rotationDegrees*DEG;
    for(let i=0;i<balls.length;i++)balls[i].pendulum.rotation.z=(sways[i]||0)*DEG;
    scene.updateMatrixWorld(true);
    renderer.render(scene,camera);
    return balls.map(({ball})=>{
      ball.getWorldPosition(working);
      projected.copy(working).project(camera);
      const depth=working.z;
      const interactive=depth>.28&&projected.z<1&&projected.z>-1&&
        Math.abs(projected.x)<.94&&Math.abs(projected.y)<.95;
      return {
        x:(projected.x+1)*50,y:(1-projected.y)*50,depth,
        opacity:interactive?1:0,
        interactive,zIndex:Math.round(50+depth*12),
        scale:Math.min(1.13,Math.max(.78,.88+depth*.055)),
      };
    });
   },
   dispose(){
    if(disposed)return;disposed=true;
    resizeObserver.disconnect();
    scene.traverse(o=>{
     o.geometry?.dispose();
     if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());
     else o.material?.dispose();
    });
    glowMap.dispose();renderer.dispose();
    renderer.domElement.remove();
   },
   metrics(){return {objects:tree.children.length,baubles:balls.length,triangles:renderer.info.render.triangles};},
 };
}
