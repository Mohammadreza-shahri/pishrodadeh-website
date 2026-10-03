export const gpuPurposes = [
  {id:'ai', questions:['softwareName','workloadDetails','concurrency'], limits:['applicationReview']},
  {id:'generative', questions:['softwareName','workloadDetails','concurrency'], limits:['applicationReview']},
  {id:'vdi', questions:['softwareName','workloadDetails','concurrency','sharing'], limits:['virtualizationReview','applicationReview']},
  {id:'render', questions:['softwareName','workloadDetails','concurrency'], limits:['graphicsReview','applicationReview']},
  {id:'video', questions:['softwareName','workloadDetails','channels'], limits:['videoReview','applicationReview']},
  {id:'vision', questions:['softwareName','workloadDetails','channels'], limits:['videoReview','applicationReview']},
  {id:'security', questions:['softwareName','workloadDetails','concurrency'], limits:['applicationReview']},
  {id:'hpc', questions:['softwareName','workloadDetails','computeType'], limits:['scientificReview','applicationReview']},
  {id:'analytics', questions:['softwareName','workloadDetails','concurrency'], limits:['analyticsReview','applicationReview']},
  {id:'twin', questions:['softwareName','workloadDetails','concurrency'], limits:['graphicsReview','applicationReview']},
  {id:'service', questions:['softwareName','workloadDetails','concurrency','sharing'], limits:['virtualizationReview','applicationReview']},
];
export const gpuPurposeGroups = [
  {id:'ai', purposes:['ai','generative']},
  {id:'desktop', purposes:['vdi','service']},
  {id:'design', purposes:['render','twin']},
  {id:'media', purposes:['video','vision']},
  {id:'compute', purposes:['hpc']},
  {id:'data', purposes:['analytics','security']},
];
export function isLanguageWorkload(requirements) {
  return ['ai','generative','security'].includes(requirements.useCase) && requirements.task === 'llm';
}
export function gpuPurposeEligible(requirements, product) {
  if (['vdi','service'].includes(requirements.useCase) && requirements.sharing === 'mig' &&
      !product.capabilities.mig) return false;
  if (['vdi','render','twin'].includes(requirements.useCase) ||
      requirements.useCase === 'service' && requirements.sharing === 'vgpu') return product.capabilities.graphics;
  if (requirements.useCase === 'video') return product.capabilities.video;
  if (requirements.useCase === 'hpc' && requirements.computeType === 'fp64') return product.capabilities.fp64;
  return true;
}
export function gpuPurposePriority(requirements, product) {
  if (requirements.useCase === 'hpc') return product.capabilities.fp64 ? 0 : 1;
  if (['video','vision'].includes(requirements.useCase) ||
      requirements.useCase === 'generative' && requirements.task === 'general') return product.capabilities.graphics ? 0 : 1;
  return 0;
}
export function gpuServerWorkload(requirements) {
  if (isLanguageWorkload(requirements)) return requirements.workload === 'inference' ? 'ai_inference' : 'ai_training';
  if (['vdi','service'].includes(requirements.useCase)) return 'virtualization';
  if (requirements.useCase === 'analytics') return 'database';
  return 'business';
}
