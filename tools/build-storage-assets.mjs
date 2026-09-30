import {readFile,writeFile,mkdir} from 'node:fs/promises';
const check=process.argv.includes('--check');
const source=new URL('../storage/',import.meta.url), target=new URL('../dist/storage/',import.meta.url);
if(!check)await mkdir(target,{recursive:true});
for(const name of ['engine.mjs','copy.mjs','catalog.json']) {
  const bytes=await readFile(new URL(name,source));
  if(check) {
    const actual=await readFile(new URL(name,target));
    if(!bytes.equals(actual))throw new Error('Stale shipped storage asset: '+name);
  } else await writeFile(new URL(name,target),bytes);
}
console.log(check?'Shipped storage assets match source.':'Storage runtime assets built.');
