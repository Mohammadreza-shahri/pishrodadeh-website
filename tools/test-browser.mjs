// Requires an existing Chrome/Chromium and tools/serve.mjs on port 8123.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,basename,resolve} from 'node:path';
const chrome=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile=await mkdtemp(join(tmpdir(),'aria-browser-'));
const home=process.argv.includes('--home');
const screenshot=home&&process.argv.includes('--screenshot');
const shotPath=resolve('_shots',home?'product-home.png':process.argv.includes('--mobile')?'storage-mobile.png':'storage-desktop.png');
if(screenshot)await mkdir(dirname(shotPath),{recursive:true});
try {
  const {stdout}=await promisify(execFile)(chrome,[
    '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--run-all-compositor-stages-before-draw',
    '--user-data-dir='+profile,'--virtual-time-budget=20000',
    '--window-size='+ (process.argv.includes('--mobile')?'390,844':'1440,1000'),
    ...(screenshot?['--screenshot='+shotPath]:[]),
    '--dump-dom','http://127.0.0.1:8123/'+(home?'':'__browser-check.html'),
  ],{timeout:60000,maxBuffer:10*1024*1024});
  if(home){
    if(!stdout.includes('data-product-type="servers"')||!stdout.includes('data-product-type="storage"'))throw Error('Opening chooser missing');
    console.log('Opening product chooser rendered.');
    if(screenshot)console.log('Screenshot: '+shotPath);
  } else {
  const match=stdout.match(/<pre id="browser-check-results">([\s\S]*?)<\/pre>/);
  if(!match)throw Error('Browser harness did not complete: '+stdout.slice(-1000));
  const payload=JSON.parse(match[1].replaceAll('&quot;','"').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&'));
  for(const result of payload.results)console.log((result.pass?'PASS ':'FAIL ')+result.name+(result.pass?'':' :: '+result.detail));
  if(payload.results.some(result=>!result.pass))process.exitCode=1;
  else console.log(payload.results.length+' browser checks passed.');
  if(screenshot)console.log('Screenshot: '+shotPath);
  }
} finally {
  // This directory is created by this process, directly under the OS temp directory.
  if(dirname(resolve(profile))!==resolve(tmpdir())||!basename(profile).startsWith('aria-browser-'))throw Error('Unsafe temporary path');
  await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:300});
}
