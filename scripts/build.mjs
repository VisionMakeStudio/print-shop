import {mkdir,readFile,writeFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
if(!html.includes('CLERK_PHASE_FIVE'))throw new Error('The Phase 5 Clerk dashboard index.html is missing.');
await mkdir(new URL('../dist/',import.meta.url),{recursive:true});
await writeFile(new URL('../dist/index.html',import.meta.url),html);
console.log('Dashboard ready. Only dist/index.html is published; server files stay outside dist.');
