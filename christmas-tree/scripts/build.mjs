import {mkdir,copyFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),out=path.join(root,'dist');
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
for(const name of ['index.html','archive.html','app.js','tree3d.js','styles.css','config.json','tree-core.js']) {
  await copyFile(path.join(root,name),path.join(out,name));
}
await mkdir(path.join(out,'data'),{recursive:true});
await copyFile(path.join(root,'data','ornaments.json'),path.join(out,'data','ornaments.json'));
await copyFile(path.join(root,'data','archive.json'),path.join(out,'data','archive.json'));
await mkdir(path.join(out,'assets'),{recursive:true});
await copyFile(path.join(root,'assets','royal-tree.svg'),path.join(out,'assets','royal-tree.svg'));
await copyFile(path.join(root,'assets','royal-tree.avif'),path.join(out,'assets','royal-tree.avif'));
console.log('Cloudflare Pages build ready:',out);
