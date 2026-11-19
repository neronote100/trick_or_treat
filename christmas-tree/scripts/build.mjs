
import {mkdir,copyFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),out=path.join(root,'dist');
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
for(const name of ['index.html','admin.html','app.js','styles.css','config.json','tree-core.js']) {
  await copyFile(path.join(root,name),path.join(out,name));
}
console.log('Cloudflare Pages build ready:',out);
