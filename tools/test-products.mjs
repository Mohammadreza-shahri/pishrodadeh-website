import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {products,productTypes,productsFor} from '../dist/products.js';
import {copy} from '../dist/studio-copy.js';
import {strings} from '../dist/storage-ui-copy.js';
import {strings as gpuStrings} from '../dist/gpu-copy.js';
import {gpuPurposes, gpuPurposeGroups} from '../dist/gpu-purposes.js';
import {gpuSoftware, gpuWorkloadExamples} from '../dist/gpu-software.js';
assert.equal(new Set(products.map(p=>p.id)).size,products.length);
for(const product of products){
  assert(productTypes.includes(product.type));
  assert(product.vendor&&typeof product.load==='function');
}
assert.deepEqual(productsFor('servers').map(p=>p.id),['hpe-servers']);
assert.deepEqual(productsFor('storage').map(p=>p.id),['hpe-storage']);
assert.deepEqual(productsFor('gpu').map(p=>p.id),['nvidia-gpu']);
assert.deepEqual(productsFor('unshipped-vendor'),[]);
for(const dictionary of [copy,strings,gpuStrings]){
  assert.deepEqual(Object.keys(dictionary.fa).sort(),Object.keys(dictionary.en).sort());
  for(const [key,value] of Object.entries(dictionary.en)){
    assert(value.length&&dictionary.fa[key].length,key);
    if(key!=='language')assert(!/[\u0600-\u06ff]/.test(value),key);
  }
}
const source=await readFile(new URL('../dist/storage-ui.js',import.meta.url),'utf8');
for(const [,key] of source.matchAll(/\bt\('([^']+)'\)/g))assert(Object.hasOwn(strings.en,key),'Missing UI copy '+key);
const gpuSource=await readFile(new URL('../dist/gpu-ui.js',import.meta.url),'utf8');
for (const group of gpuPurposeGroups) {
  assert(Object.hasOwn(gpuStrings.en,'group_'+group.id));
  assert(Object.hasOwn(gpuStrings.en,'group_'+group.id+'Hint'));
}
for (const software of gpuSoftware) assert(Object.hasOwn(gpuStrings.en,'guide_'+software.guide));
for (const example of gpuWorkloadExamples) {
  for (const locale of ['fa','en']) {
    assert(Object.hasOwn(gpuStrings[locale],'example_'+example.id));
    assert(gpuStrings[locale]['example_'+example.id].length<=160);
  }
}
for (const purpose of gpuPurposes) {
  for (const key of ['purpose_'+purpose.id, 'purpose_'+purpose.id+'Hint', 'route_'+purpose.id,
    ...purpose.limits, ...purpose.questions.filter(key => !['sharing','computeType'].includes(key)).flatMap(key => [key,key+'Hint'])]) {
    assert(Object.hasOwn(gpuStrings.en,key),'Missing purpose copy '+key);
  }
}
for(const [,key] of gpuSource.matchAll(/\bt\('([^']+)'\)/g))assert(Object.hasOwn(gpuStrings.en,key),'Missing GPU UI copy '+key);
for(const path of ['../dist/studio-ui.js','../dist/studio.js','../dist/storage-ui.js','../dist/gpu-ui.js']){
  const text=await readFile(new URL(path,import.meta.url),'utf8');
  assert(!/innerHTML|outerHTML|insertAdjacentHTML|eval\(/.test(text),'Unsafe rendering in '+path);
}
console.log('Product registration, bilingual UI copy and safe rendering checks passed.');
