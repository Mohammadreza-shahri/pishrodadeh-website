import {initial, optionCheck, activeFindings, requiredKits} from './engine.js';
import {gpuCatalog} from './gpu-catalog.js';
import {gpuPurposes, isLanguageWorkload, gpuPurposeEligible, gpuPurposePriority, gpuServerWorkload} from './gpu-purposes.js';
import {selectedSoftware} from './gpu-software.js';

export const GPU_WORKLOADS = ['inference', 'finetune', 'training'];
export const PRECISIONS = ['unknown', '4', '8', '16', '32'];
export function initialGPURequirements() {
  return {workload:'inference', modelName:'', parametersB:null, precision:'unknown',
    concurrency:null, contextTokens:null, runtimeGB:null, measuredGB:null, replicas:1,
    useCase:'ai', task:'llm', softwareName:'', workloadDetails:'', channels:null, sharing:'unknown', computeType:'unknown',
    generation:'current', condition:'any'};
}

export function validateGPURequirements(value) {
  const defaults = initialGPURequirements();
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !Object.hasOwn(defaults, key))) throw Error('Invalid GPU requirements');
  const next = {...defaults, ...value};
  if (!GPU_WORKLOADS.includes(next.workload) || !PRECISIONS.includes(next.precision) ||
      typeof next.modelName !== 'string' || next.modelName.length > 160 ||
      /[\u0000-\u001f]/.test(next.modelName)) throw Error('Invalid GPU workload');
  if ((next.useCase !== null && !gpuPurposes.some(purpose => purpose.id === next.useCase)) ||
      !['llm','general'].includes(next.task) || !['unknown','dedicated','vgpu','mig'].includes(next.sharing) ||
      !['unknown','mixed','fp64'].includes(next.computeType) ||
      !['current','older','all'].includes(next.generation) ||
      !['any','new','used','refurbished'].includes(next.condition)) throw Error('Invalid GPU purpose');
  if (next.useCase !== null && next.task === 'llm' &&
      !['ai','generative','security'].includes(next.useCase)) throw Error('Language workload does not match GPU purpose');
  for (const key of ['softwareName','workloadDetails']) {
    if (typeof next[key] !== 'string' || next[key].length > 160 || /[\u0000-\u001f]/.test(next[key])) {
      throw Error('Invalid GPU workload description');
    }
  }
  for (const [key, max, integer, zero] of [
    ['parametersB', 1000, false, false], ['concurrency', 10000, true, false],
    ['contextTokens', 1000000, true, false], ['runtimeGB', 10000, false, true],
    ['measuredGB', 10000, false, false], ['replicas', 8, true, false],
    ['channels', 10000, true, false],
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
  const language = isLanguageWorkload(req);
  const weightsGB = language && req.parametersB !== null && req.precision !== 'unknown'
    ? req.parametersB * Number(req.precision) / 8 : null;
  let targetGB = null, basis = 'unknown';
  if (req.measuredGB !== null) {
    targetGB = Math.ceil(Math.max(req.measuredGB, weightsGB ?? 0) * 1.25 * 10) / 10;
    basis = 'measured';
  } else if (language && req.workload === 'inference' && weightsGB !== null) {
    targetGB = Math.ceil((weightsGB * 1.25 + (req.runtimeGB ?? 0)) * 10) / 10;
    basis = 'weights';
  }
  const unresolved = ['performance', 'software', 'hardware', 'noPooling', 'availability'];
  unresolved.push('conditionUnverified');
  if (['used','refurbished'].includes(req.condition)) unresolved.push('usedHealthReview','usedWarrantyReview');
  if (req.condition === 'refurbished') unresolved.push('refurbishedReview');
  if (req.useCase === null) unresolved.push('purposeUnknown');
  else if (!language) unresolved.push(...gpuPurposes.find(purpose => purpose.id === req.useCase).limits);
  if (['vdi','service'].includes(req.useCase) && req.sharing === 'mig') unresolved.push('sharingReview');
  if (req.measuredGB !== null && weightsGB !== null && req.measuredGB < weightsGB) unresolved.push('measuredBelowWeights');
  if (basis === 'weights') {
    unresolved.push('heuristic');
    if (req.runtimeGB === null) unresolved.push('runtimeUnknown');
  }
  if (targetGB === null) unresolved.push(!language ? 'workloadMemoryUnknown' : req.workload === 'inference' ? 'memoryUnknown' : 'trainingUnknown');
  if (req.concurrency !== null || req.contextTokens !== null || req.channels !== null) unresolved.push('loadUnverified');
  if (req.replicas > 1) unresolved.push('replicaCount');
  return {weightsGB, targetGB, basis, unresolved};
}

export function gpuCandidates(data, requirements) {
  const req = validateGPURequirements(requirements);
  if (!req.useCase) throw Error('GPU purpose must be selected before product screening');
  const estimate = estimateGPUMemory(req);
  return gpuCatalog.products.filter(product =>
    (req.generation === 'all' || (product.generation || 'current') === req.generation) &&
    gpuPurposeEligible(req, product)).map(product => ({
    ...product, usableGB:product.memoryGB,
    options:data.options.filter(option => option.category === 'gpu' && product.hpeSkus.includes(option.sku) &&
      option.attributes.vram_gb === product.memoryGB && option.evidence?.length),
  })).map(candidate => ({
    ...candidate,
    fit: candidate.usableGB === null || estimate.targetGB === null ? 'unknown'
      : candidate.usableGB >= estimate.targetGB ? 'capacity' : 'insufficient',
  })).sort((a, b) => {
    const rank = {capacity:0, unknown:1, insufficient:2};
    return rank[a.fit] - rank[b.fit] || gpuPurposePriority(req, a) - gpuPurposePriority(req, b) ||
      (a.usableGB ?? Infinity) - (b.usableGB ?? Infinity) ||
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
      workload:gpuServerWorkload(proposal.requirements),
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
  const software = !isLanguageWorkload(validated) ? selectedSoftware(validated) : null;
  return {schema:'ariaman-gpu-advisor', version:1, catalog_version:data.version, nvidia_catalog_version:gpuCatalog.version,
    status:'technical_review_required', requirements:validated, estimate,
    routing:{purpose:validated.useCase, language_model:isLanguageWorkload(validated),
      server_workload:gpuServerWorkload(validated), status:'capability_shortlist_not_software_qualification'},
    software_profile:software ? {id:software.id, name:software.name, source:software.source,
      status:'application_version_license_and_hardware_unverified'} : null,
    selected: selected ? {gpu_id:gpuId, name:selected.name, quantity:validated.replicas,
      condition_requested:validated.condition, condition_verified:false,
      generation:selected.generation || 'current', memory_per_device_gb:selected.usableGB, source:selected.source} : null,
    candidates:candidates.map(candidate => ({gpu_id:candidate.id, name:candidate.name, source:candidate.source,
      generation:candidate.generation || 'current', condition_verified:false,
      memory_per_device_gb:candidate.usableGB, capacity_fit:candidate.fit,
      evidence:candidate.options.map(option => ({model_id:option.model_id, evidence:option.evidence}))})),
    servers:proposal ? gpuServerCandidates(data, proposal).map(candidate => ({
      model_id:candidate.model.id, name:candidate.model.name, status:candidate.status,
      hpe_ordering_sku:candidate.option.sku,
      evidence:candidate.option.evidence,
      findings:candidate.findings.map(rule => ({id:rule.id, status:rule.status, message:rule.message, evidence:rule.evidence})),
      required_accessories:candidate.required,
    })) : [],
    source_listed_platforms:(selected?.hpePlatforms || []).map(platform => ({
      ...platform, status:'technical_review_required', configurable:false,
      quantity:validated.replicas, quantity_verified:false,
    })),
    limitations:[...new Set([...estimate.unresolved, ...(selected?.layout === 'nvl' ? ['nvlNote'] : []),
      ...(selected?.generation === 'older' ? ['olderSoftwareReview','olderHardwareReview','usedHealthReview','usedWarrantyReview','refurbishedReview'] : []),
      ...(selected?.hpePlatforms?.length ? ['hpePlatformReview'] : []),
      ...(selected && !selected.options.length && !selected.hpePlatforms?.length ? ['hpeUnlisted'] : [])])]};
}
