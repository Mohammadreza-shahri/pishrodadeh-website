import {initial, optionCheck, activeFindings, requiredKits} from './engine.js';
import {gpuCatalog} from './gpu-catalog.js';

export const GPU_WORKLOADS = ['inference', 'finetune', 'training'];
export const PRECISIONS = ['unknown', '4', '8', '16', '32'];
export function initialGPURequirements() {
  return {workload:'inference', modelName:'', parametersB:null, precision:'unknown',
    concurrency:null, contextTokens:null, runtimeGB:null, measuredGB:null, replicas:1};
}

export function validateGPURequirements(value) {
  const defaults = initialGPURequirements();
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !Object.hasOwn(defaults, key))) throw Error('Invalid GPU requirements');
  const next = {...defaults, ...value};
  if (!GPU_WORKLOADS.includes(next.workload) || !PRECISIONS.includes(next.precision) ||
      typeof next.modelName !== 'string' || next.modelName.length > 160 ||
      /[\u0000-\u001f]/.test(next.modelName)) throw Error('Invalid GPU workload');
  for (const [key, max, integer, zero] of [
    ['parametersB', 1000, false, false], ['concurrency', 10000, true, false],
    ['contextTokens', 1000000, true, false], ['runtimeGB', 10000, false, true],
    ['measuredGB', 10000, false, false], ['replicas', 8, true, false],
  ]) {
    const number = next[key];
    if (number === null && key !== 'replicas') continue;
    if (typeof number !== 'number' || !Number.isFinite(number) || number > max ||
        number < (zero ? 0 : Number.MIN_VALUE) || integer && !Number.isInteger(number)) {
      throw Error('Invalid GPU number: ' + key);
    }
  }
  return next;
}

export function estimateGPUMemory(value) {
  const req = validateGPURequirements(value);
  const weightsGB = req.parametersB !== null && req.precision !== 'unknown'
    ? req.parametersB * Number(req.precision) / 8 : null;
  let targetGB = null, basis = 'unknown';
  if (req.measuredGB !== null) {
    targetGB = Math.ceil(Math.max(req.measuredGB, weightsGB ?? 0) * 1.25 * 10) / 10;
    basis = 'measured';
  } else if (req.workload === 'inference' && weightsGB !== null) {
    targetGB = Math.ceil((weightsGB * 1.25 + (req.runtimeGB ?? 0)) * 10) / 10;
    basis = 'weights';
  }
  const unresolved = ['performance', 'software', 'hardware', 'noPooling', 'availability'];
  if (req.measuredGB !== null && weightsGB !== null && req.measuredGB < weightsGB) unresolved.push('measuredBelowWeights');
  if (basis === 'weights') {
    unresolved.push('heuristic');
    if (req.runtimeGB === null) unresolved.push('runtimeUnknown');
  }
  if (targetGB === null) unresolved.push(req.workload === 'inference' ? 'memoryUnknown' : 'trainingUnknown');
  if (req.concurrency !== null || req.contextTokens !== null) unresolved.push('loadUnverified');
  if (req.replicas > 1) unresolved.push('replicaCount');
  return {weightsGB, targetGB, basis, unresolved};
}

export function gpuCandidates(data, requirements) {
  const estimate = estimateGPUMemory(requirements);
  return gpuCatalog.products.map(product => ({
    ...product, usableGB:product.memoryGB,
    options:data.options.filter(option => option.category === 'gpu' && product.hpeSkus.includes(option.sku) &&
      option.attributes.vram_gb === product.memoryGB && option.evidence?.length),
  })).map(candidate => ({
    ...candidate,
    fit: candidate.usableGB === null || estimate.targetGB === null ? 'unknown'
      : candidate.usableGB >= estimate.targetGB ? 'capacity' : 'insufficient',
  })).sort((a, b) => {
    const rank = {capacity:0, unknown:1, insufficient:2};
    return rank[a.fit] - rank[b.fit] || (a.usableGB ?? Infinity) - (b.usableGB ?? Infinity) ||
      a.name.localeCompare(b.name, 'en');
  });
}

export function validateGPUProposal(value, data) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1 ||
      Object.keys(value).some(key => !['version', 'requirements', 'gpuId'].includes(key)) ||
      typeof value.gpuId !== 'string') throw Error('Invalid GPU proposal');
  const requirements = validateGPURequirements(value.requirements);
  const candidate = gpuCandidates(data, requirements).find(item => item.id === value.gpuId);
  if (!candidate || candidate.fit === 'insufficient' || candidate.usableGB === null) {
    throw Error('GPU proposal does not match this catalog or memory target');
  }
  return {version:1, requirements, gpuId:value.gpuId};
}

export function gpuServerCandidates(data, value) {
  const proposal = validateGPUProposal(value, data);
  const gpu = gpuCandidates(data, proposal.requirements).find(item => item.id === proposal.gpuId);
  return data.models.flatMap(model => {
    const option = gpu.options.find(item => item.model_id === model.id);
    if (!option?.evidence?.length) return [];
    const trial = {...initial(), model_id:model.id, chassis:model.chassis[0],
      workload:proposal.requirements.workload === 'inference' ? 'ai_inference' : 'ai_training',
      gpuQty:proposal.requirements.replicas, selected:{gpu:[option.sku]},
      cpuQty:model.cpu_counts?.[0] || (model.id === '16913' ? 2 : 1),
      requirements:{...initial().requirements, gpuGB:option.attributes.vram_gb}};
    const check = optionCheck(trial, data, option);
    const findings = activeFindings(trial, data);
    return [{model, option, blocked:check.hidden, status:check.hidden ? 'conflict' : 'review',
      findings, required:requiredKits(trial, data)}];
  });
}

export function gpuAdvisorReport(data, requirements, gpuId = null) {
  const validated = validateGPURequirements(requirements);
  const estimate = estimateGPUMemory(validated);
  const candidates = gpuCandidates(data, validated);
  const selected = gpuId ? candidates.find(candidate => candidate.id === gpuId) : null;
  if (gpuId && (!selected || selected.fit === 'insufficient' || selected.usableGB === null)) throw Error('Invalid GPU report selection');
  const proposal = selected ? {version:1, requirements:validated, gpuId} : null;
  return {schema:'ariaman-gpu-advisor', version:1, catalog_version:data.version, nvidia_catalog_version:gpuCatalog.version,
    status:'technical_review_required', requirements:validated, estimate,
    selected: selected ? {gpu_id:gpuId, name:selected.name, quantity:validated.replicas, memory_per_device_gb:selected.usableGB, source:selected.source} : null,
    candidates:candidates.map(candidate => ({gpu_id:candidate.id, name:candidate.name, source:candidate.source,
      memory_per_device_gb:candidate.usableGB, capacity_fit:candidate.fit,
      evidence:candidate.options.map(option => ({model_id:option.model_id, evidence:option.evidence}))})),
    servers:proposal ? gpuServerCandidates(data, proposal).map(candidate => ({
      model_id:candidate.model.id, name:candidate.model.name, status:candidate.status,
      hpe_ordering_sku:candidate.option.sku,
      evidence:candidate.option.evidence,
      findings:candidate.findings.map(rule => ({id:rule.id, status:rule.status, message:rule.message, evidence:rule.evidence})),
      required_accessories:candidate.required,
    })) : [],
    limitations:[...estimate.unresolved, ...(selected?.layout === 'nvl' ? ['nvlNote'] : []),
      ...(selected && !selected.options.length ? ['hpeUnlisted'] : [])]};
}
