import {cp, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=resolve(root,'docs/mockups/report-builder');
const destination=resolve(root,'public/report-builder');
await mkdir(destination,{recursive:true});
for(const file of ['index.html','styles.css','app.js','job-fields.mjs','image-layouts.mjs','assets']) {
  await cp(resolve(source,file),resolve(destination,file),{recursive:true,force:true});
}
