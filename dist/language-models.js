export const modelPublishers = ['meta-llama', 'Qwen', 'google', 'mistralai', 'deepseek-ai', 'microsoft', 'openai'];

export function validateLanguageModels(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.models) ||
      value.models.length < modelPublishers.length || value.models.length > 100 ||
      typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) {
    throw Error('Invalid language-model catalog');
  }
  const seen = new Set();
  for (const model of value.models) {
    if (!model || typeof model.id !== 'string' || model.id.length > 160 ||
        !/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(model.id) ||
        !modelPublishers.includes(model.id.split('/')[0]) || seen.has(model.id) ||
        model.source !== `https://huggingface.co/${model.id}` ||
        typeof model.revision !== 'string' || !/^[a-f0-9]{40}$/.test(model.revision) ||
        !model.defaults || !['unknown','4','8','16','32'].includes(model.defaults.precision) ||
        model.defaults.contextTokens !== null && (!Number.isSafeInteger(model.defaults.contextTokens) ||
          model.defaults.contextTokens < 1 || model.defaults.contextTokens > 1000000) ||
        model.parametersB !== null && (typeof model.parametersB !== 'number' ||
          !Number.isFinite(model.parametersB) || model.parametersB < 0.1 || model.parametersB > 1000)) {
      throw Error('Invalid language-model entry');
    }
    seen.add(model.id);
  }
  for (const publisher of modelPublishers) {
    if (!value.models.some(model => model.id.startsWith(publisher + '/'))) {
      throw Error('Missing language-model publisher: ' + publisher);
    }
  }
  return value;
}

export function applyLanguageModel(answers, model) {
  return {...answers, modelName:model.id, parametersB:model.parametersB,
    precision:model.defaults.precision, contextTokens:model.defaults.contextTokens,
    runtimeGB:null, measuredGB:null};
}
