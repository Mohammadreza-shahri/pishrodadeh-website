import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {modelPublishers, validateLanguageModels, applyLanguageModel} from '../dist/language-models.js';
import {collectLanguageModels, modelEntry} from './refresh-language-models.mjs';
import {gpuCatalog} from '../dist/gpu-catalog.js';

const snapshot = JSON.parse(await readFile(new URL('../dist/language-models.json', import.meta.url), 'utf8'));
assert.equal(validateLanguageModels(snapshot), snapshot);
const clone = () => structuredClone(snapshot);
for (const change of [
  value => {value.models[0].id = 'untrusted/fake';},
  value => {value.models[0].source = 'javascript:alert(1)';},
  value => {value.models[0].revision = 'main';},
  value => {value.models[0].parametersB = '8';},
  value => {value.models[0].parametersB = -1;},
  value => {value.models[0].parametersB = Infinity;},
  value => {value.models[0].defaults.precision = 'bf16';},
  value => {value.models[0].defaults.contextTokens = 1000001;},
  value => {value.models.push(value.models[0]);},
  value => {value.updatedAt = 'not-a-date';},
  value => {value.models = value.models.filter(model => !model.id.startsWith('Qwen/'));},
]) {
  const value = clone(); change(value);
  assert.throws(() => validateLanguageModels(value));
}
const metadata = {id:'Qwen/example', sha:'a'.repeat(40), pipeline_tag:'text-generation',
  safetensors:{total:8030000001, parameters:{BF16:8030000001}}};
assert.equal(modelEntry(metadata, 'Qwen').parametersB, 8.1);
assert.equal(modelEntry({...metadata, safetensors:undefined}, 'Qwen').parametersB, null);
assert.equal(modelEntry({...metadata, config:{quantization_config:{quant_method:'fp8'}}}, 'Qwen').parametersB, null);
assert.equal(modelEntry({...metadata, safetensors:{total:8000000000, parameters:{U8:8000000000}}}, 'Qwen').parametersB, null);
assert.deepEqual(modelEntry(metadata, 'Qwen', {torch_dtype:'bfloat16', max_position_embeddings:40960}).defaults,
  {precision:'16', contextTokens:40960});
assert.deepEqual(modelEntry(metadata, 'Qwen', {torch_dtype:'float32', max_position_embeddings:1000001}).defaults,
  {precision:'32', contextTokens:null});
assert.equal(modelEntry({...metadata, config:{quantization_config:{quant_method:'mxfp4'}}}, 'Qwen').defaults.precision, 'unknown');
const filled = applyLanguageModel({concurrency:10, replicas:2, runtimeGB:12, measuredGB:40}, {
  ...metadata, parametersB:8.1, defaults:{precision:'16', contextTokens:40960}});
assert.deepEqual(filled, {modelName:metadata.id, parametersB:8.1, precision:'16', contextTokens:40960,
  concurrency:10, replicas:2, runtimeGB:null, measuredGB:null});
assert.throws(() => modelEntry({...metadata, private:true}, 'Qwen'));
assert.throws(() => modelEntry({...metadata, id:'other/fake'}, 'Qwen'));
assert.throws(() => modelEntry({...metadata, sha:'main'}, 'Qwen'));
let requests = 0;
const get = async url => {
  requests++;
  const parsed = new URL(url);
  if (parsed.pathname.endsWith('/config.json')) return {torch_dtype:'bfloat16', max_position_embeddings:40960};
  if (parsed.search) {
    const publisher = parsed.searchParams.get('author');
    assert(modelPublishers.includes(publisher));
    return [{id:`${publisher}/example`, pipeline_tag:'text-generation'},
      {id:`${publisher}/example-GGUF`, pipeline_tag:'text-generation'}];
  }
  return {...metadata, id:parsed.pathname.slice('/api/models/'.length)};
};
const generated = await collectLanguageModels(get, new Date('2026-10-03T00:00:00Z'));
assert.equal(generated.models.length, modelPublishers.length);
assert.equal(requests, modelPublishers.length * 4);
assert(generated.models.every(model => model.parametersB === 8.1));
await assert.rejects(collectLanguageModels(async () => {throw Error('Source unavailable');}), /Source unavailable/);
await assert.rejects(collectLanguageModels(async () => []), /Invalid publisher feed/);
await assert.rejects(collectLanguageModels(async () => [{id:'other/fake', pipeline_tag:'text-generation'}]), /Invalid model listing/);
const before = await readFile(new URL('../dist/language-models.json', import.meta.url), 'utf8');
const failedRefresh = spawnSync(process.execPath, [
  '--import', 'data:text/javascript,globalThis.fetch=async()=>{throw new Error("Fixture source unavailable")}',
  fileURLToPath(new URL('./refresh-language-models.mjs', import.meta.url)), '--force',
], {encoding:'utf8'});
assert.equal(failedRefresh.status, 1, failedRefresh.stderr);
assert.match(failedRefresh.stderr, /Fixture source unavailable/);
assert.equal(await readFile(new URL('../dist/language-models.json', import.meta.url), 'utf8'), before);
const images = new Set();
for (const gpu of gpuCatalog.products) {
  assert(gpu.image,gpu.id);
  if (images.has(gpu.image.url)) {
    const siblings=gpuCatalog.products.filter(product=>product.image?.url===gpu.image.url);
    assert.deepEqual(siblings.map(product=>product.id).sort(),['nvidia-v100-pcie-16','nvidia-v100-pcie-32']);
    assert.deepEqual(gpu.image.sharedVariants,siblings.map(product=>product.id));
  }
  images.add(gpu.image.url);
  const source = new URL(gpu.image.source);
  if (gpu.image.url.startsWith('./')) {
    assert.equal(gpu.id,'nvidia-p40');assert.equal(gpu.image.url,'./assets/gpu/nvidia-p40-detail.jpg');
    assert.equal(gpu.image.detail,true);assert.equal(gpu.image.page,1);
    const bytes=await readFile(new URL('../dist/assets/gpu/nvidia-p40-detail.jpg',import.meta.url));
    assert.deepEqual([...bytes.subarray(0,3)],[255,216,255]);assert(bytes.length>30000);
  } else {
    const image = new URL(gpu.image.url);
    assert.equal(image.protocol, 'https:');
    assert(['www.nvidia.com', 'd2vfia6k6wrouk.cloudfront.net'].includes(image.hostname));
    assert(!/sxm|workstation-edition|max-q/i.test(image.pathname));
  }
  assert.equal(source.protocol,'https:');
  assert(['www.nvidia.com', 'www.pny.com'].includes(source.hostname));
}
console.log(`Language-model validation, safe refresh and ${gpuCatalog.products.length} official photo mappings (${images.size} distinct images) passed.`);
