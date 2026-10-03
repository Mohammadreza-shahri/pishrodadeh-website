import {readFile, writeFile, rename, rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {modelPublishers, validateLanguageModels} from '../dist/language-models.js';

const target = new URL('../dist/language-models.json', import.meta.url);
const temporary = new URL('../dist/language-models.json.tmp', import.meta.url);

async function getJSON(url, {optional = false} = {}) {
  const response = await fetch(url, {signal:AbortSignal.timeout(30000)});
  if (optional && [401, 403, 404].includes(response.status)) {
    console.warn(`Publisher configuration unavailable (${response.status}): ${url}; configuration-only defaults stay unknown.`);
    return null;
  }
  if (!response.ok) throw Error(`Model source returned ${response.status}: ${url}`);
  return response.json();
}

export function modelEntry(value, publisher, config = null) {
  if (!value || typeof value.id !== 'string' || !value.id.startsWith(publisher + '/') ||
      value.pipeline_tag !== 'text-generation' || value.private === true || value.disabled === true ||
      !/^[a-f0-9]{40}$/.test(value.sha || '')) throw Error('Unexpected publisher model response');
  const total = value.safetensors?.total;
  // Total weights, including all MoE experts; never use active-parameter counts or names for sizing.
  const quantized = Boolean(value.config?.quantization_config || config?.quantization_config) ||
    Object.keys(value.safetensors?.parameters || {}).some(dtype => !['F64', 'F32', 'F16', 'BF16'].includes(dtype));
  const parametersB = !quantized && Number.isSafeInteger(total) && total > 0 && total <= 1e12
    ? Math.max(0.1, Math.ceil(total / 1e8) / 10) : null;
  const dtypes = Object.keys(value.safetensors?.parameters || {});
  const dtype = config?.torch_dtype || config?.dtype || (dtypes.length === 1 ? dtypes[0] : null);
  const precision = !quantized ? ({BF16:'16', F16:'16', F32:'32', bfloat16:'16', float16:'16', float32:'32'}[dtype] || 'unknown') : 'unknown';
  const context = config?.max_position_embeddings || config?.text_config?.max_position_embeddings;
  const contextTokens = Number.isSafeInteger(context) && context > 0 && context <= 1000000 ? context : null;
  return {id:value.id, source:`https://huggingface.co/${value.id}`, revision:value.sha, parametersB,
    defaults:{precision, contextTokens}};
}

export async function collectLanguageModels(get = getJSON, now = new Date()) {
  const models = [];
  for (const publisher of modelPublishers) {
    const ids = new Set();
    for (const [sort, limit] of [['downloads', 8], ['createdAt', 4]]) {
      const url = new URL('https://huggingface.co/api/models');
      url.search = new URLSearchParams({author:publisher, pipeline_tag:'text-generation',
        sort, direction:'-1', limit:String(limit)});
      const rows = await get(url.href);
      if (!Array.isArray(rows) || !rows.length || rows.length > limit) throw Error('Invalid publisher feed: ' + publisher);
      for (const row of rows) {
        if (typeof row.id !== 'string' || !row.id.startsWith(publisher + '/') ||
            !/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(row.id) ||
            row.pipeline_tag !== 'text-generation') throw Error('Invalid model listing');
        // Pre-quantized conversions are not interchangeable with original model weight counts.
        if (!/(?:gguf|gptq|awq|fp8|int4|int8|4bit|8bit)/i.test(row.id)) ids.add(row.id);
      }
    }
    if (!ids.size) throw Error('No usable models for publisher: ' + publisher);
    for (const id of ids) {
      const metadata = await get(`https://huggingface.co/api/models/${id}`);
      if (metadata.id !== id) throw Error('Model metadata does not match requested repository');
      const config = await get(`https://huggingface.co/${id}/raw/${metadata.sha}/config.json`, {optional:true});
      if (config !== null && (typeof config !== 'object' || Array.isArray(config))) throw Error('Invalid publisher model configuration');
      models.push(modelEntry(metadata, publisher, config));
    }
  }
  models.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  return validateLanguageModels({version:1, updatedAt:now.toISOString(), models});
}

async function main() {
  let previous;
  try {
    const saved = JSON.parse(await readFile(target, 'utf8'));
    previous = process.argv.includes('--force') ? saved : validateLanguageModels(saved);
  }
  catch (error) {
    if (error.code !== 'ENOENT' || !process.argv.includes('--force')) throw error;
    console.log('Initializing the language-model catalog from publisher feeds.');
  }
  if (previous && !process.argv.includes('--force') && Date.now() - Date.parse(previous.updatedAt) < 3 * 86400000) {
    console.log('Language-model catalog was checked less than three days ago.');
    return;
  }
  const next = await collectLanguageModels();
  try {
    await writeFile(temporary, JSON.stringify(next, null, 2) + '\n');
    await rename(temporary, target);
  } finally { await rm(temporary, {force:true}); }
  console.log(`Refreshed ${next.models.length} publisher models from Hugging Face.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {console.error(error); process.exitCode = 1;});
}
