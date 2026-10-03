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
const graphics = ['nvidia-l4','nvidia-l40','nvidia-l40s','nvidia-rtx-pro-6000-server'];
const scientific = ['nvidia-h100-nvl','nvidia-h200-nvl'];
export function isLanguageWorkload(requirements) {
  return ['ai','generative','security'].includes(requirements.useCase) && requirements.task === 'llm';
}
export function gpuPurposeEligible(requirements, product) {
  if (['vdi','service'].includes(requirements.useCase) && requirements.sharing === 'mig' &&
      ![...scientific, 'nvidia-rtx-pro-6000-server'].includes(product.id)) return false;
  if (['vdi','render','twin','video'].includes(requirements.useCase) ||
      requirements.useCase === 'service' && requirements.sharing === 'vgpu') return graphics.includes(product.id);
  if (requirements.useCase === 'hpc' && requirements.computeType === 'fp64') return scientific.includes(product.id);
  return true;
}
export function gpuPurposePriority(requirements, product) {
  if (requirements.useCase === 'hpc') return scientific.includes(product.id) ? 0 : 1;
  if (['video','vision'].includes(requirements.useCase) ||
      requirements.useCase === 'generative' && requirements.task === 'general') return graphics.includes(product.id) ? 0 : 1;
  return 0;
}
export function gpuServerWorkload(requirements) {
  if (isLanguageWorkload(requirements)) return requirements.workload === 'inference' ? 'ai_inference' : 'ai_training';
  if (['vdi','service'].includes(requirements.useCase)) return 'virtualization';
  if (requirements.useCase === 'analytics') return 'database';
  return 'business';
}
