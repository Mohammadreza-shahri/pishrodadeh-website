import {initialGPURequirements, validateGPURequirements, estimateGPUMemory,
  gpuCandidates, validateGPUProposal, gpuServerCandidates, gpuAdvisorReport} from './gpu-advisor.js';
import {strings} from './gpu-copy.js';
import {gpuCatalog} from './gpu-catalog.js';
import {strings as serverStrings} from './i18n.js';
import {officialProductPages} from './server-links.js';
import {salesWhatsApp} from './sales-contact.js';
import {validateLanguageModels, applyLanguageModel} from './language-models.js';
import {gpuPurposes, gpuPurposeGroups, isLanguageWorkload} from './gpu-purposes.js';
import {softwareForPurpose, selectedSoftware, applySoftwareProfile, examplesForPurpose} from './gpu-software.js';
import {el, button, shell, focusHeading} from './studio-ui.js';

const KEY = 'aria-gpu-advisor-v1';
let host, data, lang = 'fa', notice = '', standalone = false;
let languageModels = null, modelCatalogFailed = false;
let state = fresh();
function fresh() { return {version:1, step:0, requirements:{...initialGPURequirements(), generation:'all', useCase:null}, gpuId:null}; }
const t = key => strings[lang][key];
const number = value => new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US', {maximumFractionDigits:2}).format(value);
const memory = value => value === null ? t('unknown') : `${number(value)} GB`;
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (error) { notice = 'saveFailed'; console.warn('GPU draft could not be saved', error); }
}
function restore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved || saved.version !== 1 || ![0, 1, 2].includes(saved.step) ||
        Object.keys(saved).some(key => !['version', 'step', 'requirements', 'gpuId'].includes(key)) ||
        saved.step === 2 && !saved.gpuId) throw Error('Invalid GPU draft');
    const original = validateGPURequirements(saved.requirements);
    const requirements = {...original, generation:'all'};
    if (!requirements.useCase && saved.step !== 0) throw Error('GPU draft has no selected purpose');
    const gpuId = saved.gpuId === null ? null : validateGPUProposal({version:1, requirements:original, gpuId:saved.gpuId}, data).gpuId;
    state = {version:1, step:saved.step, requirements, gpuId};
    notice = 'restored';
  } catch (error) {
    console.warn('Invalid GPU draft', error);
    state = fresh(); notice = 'corrupt';
    try { localStorage.removeItem(KEY); }
    catch (storageError) { console.warn('GPU draft could not be removed', storageError); }
  }
}
export async function mount(context) {
  host = context; lang = context.lang;
  if (!data) {
    const response = await fetch('./catalog.json');
    if (!response.ok) throw Error('GPU catalog unavailable');
    const loaded = await response.json();
    if (!context.isCurrent()) return;
    data = loaded; restore();
  }
  if (!languageModels) {
    try {
      const response = await fetch('./language-models.json');
      if (!response.ok) throw Error('Language-model catalog unavailable');
      const loaded = validateLanguageModels(await response.json());
      if (!context.isCurrent()) return;
      languageModels = loaded; modelCatalogFailed = false;
    } catch (error) {
      console.warn('Language-model suggestions could not be loaded', error);
      modelCatalogFailed = true;
    }
  }
  if (context.isCurrent()) render();
}
function go(step) {
  if (step > 0 && !state.requirements.useCase) {
    notice = 'purposeUnknown'; render(); focusHeading(); return;
  }
  if (step === 2 && !state.gpuId) {
    notice = 'needsChanged'; render(); focusHeading(); return;
  }
  state.step = step; standalone = false;
  render(); focusHeading();
  window.scrollTo({top:0, behavior:'auto'});
}
function render() {
  if (!host.isCurrent()) return;
  persist();
  const main = shell(lang, {onHome:host.onHome, onLanguage:value => {
    lang = value; host.onLanguage(value); render(); focusHeading();
  }}, t('title'), t('lead'));
  main.classList.add('gpu-main');
  main.closest('.shell').querySelector('.brand').append(button(t('reset'), () => {
    if (!confirm(t('resetConfirm'))) return;
    state = fresh(); notice = ''; go(0);
  }, 'ghost brand-reset'));
  const nav = el('nav', null, 'gpu-stepper');
  nav.setAttribute('aria-label', t('title'));
  for (const [index, key] of ['needs', 'results', 'servers'].entries()) {
    const node = button(`${number(index + 1)} · ${t(key)}`, () => go(index), state.step === index ? 'primary' : 'ghost');
    node.disabled = index === 1 && state.step === 0 || index === 2 && !state.gpuId;
    if (state.step === index) node.setAttribute('aria-current', 'step');
    nav.append(node);
  }
  main.append(nav);
  if (notice) {
    const alert = el('p', t(notice), 'storage-alert');
    alert.setAttribute('role', 'status'); main.append(alert);
  }
  if (state.step === 0 && !state.requirements.useCase) purposePage(main);
  else if (state.step === 0) needsPage(main);
  else resultsPage(main);
}
function inputField(key, {max = 10000, min = 1, step = 1, hint = null, type = 'number'} = {}) {
  const label = el('label', null, 'field');
  label.append(el('span', t(key), 'field-label'));
  const input = el('input');
  input.id = `gpu-${key}`; input.name = key; input.type = type;
  input.value = state.requirements[key] ?? '';
  if (type === 'number') {
    input.min = min; input.max = max; input.step = step;
    input.inputMode = step === 1 ? 'numeric' : 'decimal';
    if (key === 'replicas') input.required = true;
  } else input.maxLength = 160;
  input.oninput = () => input.setCustomValidity('');
  input.onchange = () => {
    if (!input.checkValidity()) {input.reportValidity(); return;}
    const value = type === 'number' ? input.value === '' ? null : Number(input.value) : input.value.trim();
    try {
      const changedWorkload = key === 'workloadDetails' && value !== state.requirements.workloadDetails;
      state.requirements = validateGPURequirements(resetChangedModel({...state.requirements, [key]:value,
        ...(changedWorkload ? {runtimeGB:null, measuredGB:null} : {})}));
      if (changedWorkload) {
        for (const name of ['runtimeGB','measuredGB']) {
          const control = document.getElementById(`gpu-${name}`);
          if (control) control.value = '';
        }
      }
      if (key === 'modelName') {
        for (const name of ['parametersB', 'runtimeGB', 'measuredGB', 'precision', 'contextTokens']) {
          const control = document.getElementById(`gpu-${name}`);
          if (control) control.value = state.requirements[name] ?? '';
        }
      }
      state.gpuId = null; persist();
    } catch (error) {
      input.setCustomValidity(t('invalid')); input.reportValidity();
      console.warn('Invalid GPU field: ' + key, error);
    }
  };
  label.append(input);
  if (hint) {
    const help = el('small', t(hint), 'field-hint'); help.id = `${input.id}-help`;
    input.setAttribute('aria-describedby', help.id); label.append(help);
  }
  return label;
}
function resetChangedModel(answers) {
  const model = answers.modelName !== state.requirements.modelName &&
    isLanguageWorkload(answers) &&
    languageModels?.models.find(model => model.id === answers.modelName);
  return model ? applyLanguageModel(answers, model) : answers;
}
function purposePage(main) {
  const section = el('section', null, 'gpu-purpose-section');
  section.append(el('h2', t('purposeTitle')), el('p', t('purposeLead'), 'muted'));
  const grid = el('div', null, 'gpu-purpose-grid');
  for (const group of gpuPurposeGroups) {
    const choice = button('', () => {
      const useCase = group.purposes[0];
      state.requirements = {...initialGPURequirements(), generation:'all', useCase,
        task:useCase === 'ai' ? 'llm' : 'general'};
      state.gpuId = null; notice = ''; render(); focusHeading();
    }, 'gpu-purpose');
    choice.dataset.gpuGroup = group.id;
    choice.append(el('strong', t('group_' + group.id)), el('span', t('group_' + group.id + 'Hint')));
    grid.append(choice);
  }
  section.append(grid); main.append(section);
}
function selectField(key, choices, hint, onChange = null) {
  const label = el('label', null, 'field');
  label.append(el('span', t(key), 'field-label'));
  const select = el('select'); select.id = `gpu-${key}`; select.name = key;
  for (const value of choices) {
    const option = el('option', t(key === 'useCase' ? 'purpose_' + value : key + '_' + value)); option.value = value; select.append(option);
  }
  select.value = state.requirements[key];
  select.onchange = () => {
    state.requirements = validateGPURequirements({...state.requirements, [key]:select.value});
    state.gpuId = null;
    if (onChange) onChange();
    persist(); render(); document.getElementById(select.id).focus();
  };
  const help = el('small', t(hint), 'field-hint'); help.id = select.id + '-help';
  select.setAttribute('aria-describedby', help.id); label.append(select, help); return label;
}
function needsPage(main) {
  const purpose = gpuPurposes.find(purpose => purpose.id === state.requirements.useCase);
  const group = gpuPurposeGroups.find(group => group.purposes.includes(purpose.id));
  const language = isLanguageWorkload(state.requirements);
  const summary = el('div', null, 'gpu-purpose-summary');
  const changePurpose = button(t('changePurpose'), () => {
    state = fresh(); notice = ''; render(); focusHeading();
  });
  changePurpose.dataset.gpuChangePurpose = '';
  summary.append(el('strong', t('group_' + group.id)), changePurpose);
  main.append(summary);
  const form = el('form', null, 'gpu-discovery');
  if (group.purposes.length > 1) form.append(selectField('useCase', group.purposes, 'useCaseHint', () => {
    const {useCase, replicas, condition} = state.requirements;
    state.requirements = {...initialGPURequirements(), generation:'all', useCase, replicas, condition,
      task:useCase === 'ai' ? 'llm' : 'general'};
  }));
  if (['ai','generative','security'].includes(purpose.id)) {
    form.append(selectField('task', ['llm','general'], 'taskHint', () => {
      state.requirements = {...state.requirements, modelName:'', parametersB:null, precision:'unknown',
        contextTokens:null, runtimeGB:null, measuredGB:null, softwareName:'', workloadDetails:'',
        sharing:'unknown', computeType:'unknown'};
    }));
  }
  form.append(el('p', t(language ? 'languageRoute' : 'route_' + purpose.id), 'gpu-route-note'));
  if (language) {
    const types = el('fieldset', null, 'gpu-workloads');
    types.append(el('legend', t('needs')));
    for (const key of ['inference', 'finetune', 'training']) {
      const choice = button('', () => {
        state.requirements.workload = key; state.gpuId = null; render();
        document.getElementById(`gpu-workload-${key}`).focus();
      }, 'gpu-workload' + (state.requirements.workload === key ? ' selected' : ''));
      choice.id = `gpu-workload-${key}`; choice.setAttribute('aria-pressed', String(state.requirements.workload === key));
      choice.append(el('strong', t(key)), el('span', t(key + 'Hint')));
      types.append(choice);
    }
    form.append(types);
  }
  const fields = el('div', null, 'gpu-fields');
  if (language) {
    fields.append(modelField(),
      inputField('parametersB', {min:0.1, max:1000, step:0.1, hint:'parametersHint'}));
    const precision = el('label', null, 'field');
    precision.append(el('span', t('precision'), 'field-label'));
    const select = el('select'); select.id = 'gpu-precision'; select.name = 'precision';
    for (const key of ['unknown', '4', '8', '16', '32']) {
      const option = el('option', t(key === 'unknown' ? key : 'bits' + key)); option.value = key; select.append(option);
    }
    select.value = state.requirements.precision;
    select.onchange = () => {
      state.requirements = validateGPURequirements({...state.requirements, precision:select.value});
      state.gpuId = null; persist();
    };
    const precisionHelp = el('small', t('precisionHint'), 'field-hint');
    precisionHelp.id = 'gpu-precision-help'; select.setAttribute('aria-describedby', precisionHelp.id);
    precision.append(select, precisionHelp); fields.append(precision);
    fields.append(inputField('concurrency', {hint:'loadHint'}), inputField('contextTokens', {max:1000000}));
  } else {
    for (const key of purpose.questions) {
      if (key === 'sharing') fields.append(selectField(key, ['unknown','dedicated','vgpu','mig'], 'sharingHint'));
      else if (key === 'computeType') fields.append(selectField(key, ['unknown','mixed','fp64'], 'computeHint'));
      else if (key === 'softwareName') fields.append(softwareField());
      else if (key === 'workloadDetails') fields.append(workloadField(purpose));
      else {
        fields.append(inputField(key, {hint:key + 'Hint'}));
      }
    }
  }
  form.append(fields);
  const advanced = el('details', null, 'gpu-advanced');
  advanced.append(el('summary', t('advanced')));
  const extra = el('div', null, 'gpu-fields');
  if (language) extra.append(inputField('runtimeGB', {min:0, step:0.1, hint:'runtimeHint'}));
  extra.append(inputField('measuredGB', {min:0.1, step:0.1, hint:language ? 'measuredHint' : 'workloadMeasuredHint'}),
    inputField('replicas', {max:8, hint:'replicasHint'}));
  advanced.append(extra); form.append(advanced);
  const submit = button(t('find'), () => {}, 'primary'); submit.type = 'submit';
  form.append(submit);
  form.onsubmit = event => {
    event.preventDefault();
    try {
      const answers = {...state.requirements};
      for (const input of form.elements) {
        if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement) || !input.name) continue;
        answers[input.name] = input.type === 'number'
          ? input.value === '' ? null : Number(input.value) : input.value.trim();
      }
      if (!language && (answers.softwareName !== state.requirements.softwareName ||
          answers.workloadDetails !== state.requirements.workloadDetails)) {
        if (answers.runtimeGB === state.requirements.runtimeGB) answers.runtimeGB = null;
        if (answers.measuredGB === state.requirements.measuredGB) answers.measuredGB = null;
      }
      if (!language && answers.softwareName !== state.requirements.softwareName) {
        if (answers.sharing === state.requirements.sharing) answers.sharing = 'unknown';
        if (answers.computeType === state.requirements.computeType) answers.computeType = 'unknown';
      }
      state.requirements = validateGPURequirements(resetChangedModel(answers));
      notice = ''; state.gpuId = null; go(1);
    } catch (error) {
      console.warn('Invalid GPU discovery data', error);
      notice = 'invalid'; render();
    }
  };
  main.append(form);
  if (!language) renderSoftwareSource();
}
function renderSoftwareSource() {
  const status = document.getElementById('gpu-software-source');
  if (!status) return;
  status.replaceChildren();
  const item = selectedSoftware(state.requirements);
  const select = document.getElementById('gpu-softwarePreset');
  if (select) select.value = item?.id || '';
  if (!item) {
    status.append(el('p', t('softwareCustomNote'), 'small muted')); return;
  }
  const link = el('a', t('softwareSource'));
  link.href = item.source; link.target = '_blank'; link.rel = 'noopener noreferrer';
  status.append(el('p', t('guide_' + item.guide), 'small muted'), link,
    el('p', t('softwareUnverified'), 'small muted'));
}
function workloadField(purpose) {
  const field = el('div', null, 'field');
  const label = el('label', null, 'field');
  label.append(el('span', t('workloadExample'), 'field-label'));
  const select = el('select'); select.id = 'gpu-workloadExample';
  const custom = el('option', t('exampleCustom')); custom.value = ''; select.append(custom);
  for (const example of examplesForPurpose(purpose.id)) {
    const option = el('option', t('example_' + example.id)); option.value = example.id; select.append(option);
    if (['fa','en'].some(locale => strings[locale]['example_' + example.id] === state.requirements.workloadDetails)) {
      option.selected = true;
    }
  }
  select.onchange = () => {
    const example = examplesForPurpose(purpose.id).find(item => item.id === select.value);
    if (!example && select.value) {
      console.warn('Invalid GPU workload example'); notice = 'invalid'; render(); return;
    }
    state.requirements = {...state.requirements, workloadDetails:example ? t('example_' + example.id) : '',
      runtimeGB:null, measuredGB:null};
    state.gpuId = null; persist(); render(); document.getElementById('gpu-workloadExample').focus();
  };
  label.append(select);
  const customField = inputField('workloadDetails', {type:'text',
    hint:['video','vision'].includes(purpose.id) ? 'videoDetailsHint' : 'workloadDetailsHint'});
  const item = selectedSoftware(state.requirements);
  if (item) customField.querySelector('input').placeholder = t('guide_' + item.guide);
  field.append(label, customField); return field;
}
function softwareField() {
  const field = el('div', null, 'field gpu-software-field');
  const label = el('label', null, 'field');
  label.append(el('span', t('softwarePreset'), 'field-label'));
  const select = el('select'); select.id = 'gpu-softwarePreset';
  const custom = el('option', t('softwareCustom')); custom.value = ''; select.append(custom);
  for (const item of softwareForPurpose(state.requirements.useCase)) {
    const option = el('option', item.name); option.value = item.id; select.append(option);
  }
  select.value = selectedSoftware(state.requirements)?.id || '';
  select.onchange = () => {
    if (select.value && select.value === selectedSoftware(state.requirements)?.id) return;
    try {
      state.requirements = select.value
        ? validateGPURequirements(applySoftwareProfile(state.requirements, select.value))
        : {...state.requirements, softwareName:'', workloadDetails:'', measuredGB:null, runtimeGB:null,
          sharing:'unknown', computeType:'unknown'};
      state.gpuId = null; persist(); render();
      document.getElementById('gpu-softwarePreset').focus();
    } catch (error) {
      console.warn('Invalid GPU software profile', error); notice = 'invalid'; render();
    }
  };
  label.append(select, el('small', t('softwarePresetHint'), 'field-hint'));
  const customField = inputField('softwareName', {type:'text', hint:'softwareNameHint'});
  const input = customField.querySelector('input');
  const status = el('div'); status.id = 'gpu-software-source'; status.setAttribute('aria-live', 'polite');
  field.append(label, customField, status);
  input.onchange = () => {
    if (!input.checkValidity()) {input.reportValidity(); return;}
    const value = input.value.trim();
    try {
      if (value !== state.requirements.softwareName) {
        state.requirements = validateGPURequirements({...state.requirements, softwareName:value,
          runtimeGB:null, measuredGB:null, sharing:'unknown', computeType:'unknown'});
        state.gpuId = null; persist(); render(); document.getElementById('gpu-softwareName').focus();
      }
    } catch (error) {
      console.warn('Invalid GPU application name', error);
      input.setCustomValidity(t('invalid')); input.reportValidity();
    }
  };
  return field;
}
function modelField() {
  const label = inputField('modelName', {type:'text', hint:'modelNameHint'});
  label.className = 'gpu-model-label';
  const field = el('div', null, 'field gpu-model-field'); field.append(label);
  const input = label.querySelector('input');
  input.placeholder = t('modelSearch'); input.autocomplete = 'off';
  const status = el('div', null, 'gpu-model-source');
  status.setAttribute('aria-live', 'polite');
  if (modelCatalogFailed) {
    status.append(el('span', t('modelCatalogFailed')), button(t('retry'), () => mount(host)));
  } else if (languageModels) {
    const list = el('datalist'); list.id = 'gpu-language-models';
    for (const model of languageModels.models) {
      const option = el('option'); option.value = model.id; list.append(option);
    }
    input.setAttribute('list', list.id); field.append(list);
    const showSource = () => {
      status.replaceChildren();
      const model = languageModels.models.find(item => item.id === input.value.trim());
      const checked = new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR' : 'en-US').format(new Date(languageModels.updatedAt));
      status.append(el('span', `${t('modelCatalogDate')} ${checked}`));
      if (!model) return;
      const link = el('a', t('modelSource')); link.href = model.source;
      link.target = '_blank'; link.rel = 'noopener noreferrer'; status.append(link);
      status.append(el('span', t('modelSizeNote')));
      if (model.parametersB === null) status.append(el('span', t('modelSizeUnknown')));
    };
    input.addEventListener('input', () => {
      if (languageModels.models.some(model => model.id === input.value.trim())) input.onchange();
      showSource();
    });
    input.addEventListener('change', showSource);
    showSource();
  }
  field.append(status);
  return field;
}
function gpuPhoto(candidate) {
  const frame = el('div', null, 'gpu-photo');
  if (!candidate.image) {
    const source = el('a', t('photoUnavailable'), 'gpu-photo-failed');
    source.href = candidate.source; source.target = '_blank'; source.rel = 'noopener noreferrer';
    frame.append(source); return frame;
  }
  const source = el('a'); source.href = candidate.image.source;
  source.target = '_blank'; source.rel = 'noopener noreferrer'; source.title = t('photoSource');
  const image = el('img'); image.alt = candidate.name;
  if (new URL(candidate.image.url).hostname === 'd2vfia6k6wrouk.cloudfront.net') image.classList.add('gpu-photo-cutout');
  image.width = 800; image.height = 800; image.loading = 'lazy'; image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  const failure = el('span', t('photoFailed'), 'gpu-photo-failed'); failure.hidden = true;
  image.onerror = () => {
    console.warn('Official GPU photo could not load: ' + candidate.id);
    image.hidden = true; failure.hidden = false;
  };
  image.src = candidate.image.url; source.append(image, failure); frame.append(source);
  return frame;
}
function sourceDetails(options) {
  const details = el('details', null, 'gpu-source');
  details.append(el('summary', t('sources')));
  for (const option of options) {
    const model = data.models.find(item => item.id === option.model_id);
    const section = el('section');
    section.append(el('strong', model.name));
    for (const evidence of option.evidence) {
      const quote = el('blockquote', evidence.quote); quote.dir = 'ltr'; quote.translate = false;
      section.append(el('small', `QuickSpecs ${evidence.qs_id} · v${evidence.version} · ${option.sku}`), quote);
    }
    const link = el('a', t('manufacturerPage')); link.href = officialProductPages[model.id] || 'https://www.hpe.com/us/en/servers.html';
    link.target = '_blank'; link.rel = 'noopener noreferrer'; section.append(link);
    details.append(section);
  }
  return details;
}
function downloadReport() {
  const report = gpuAdvisorReport(data, state.requirements, state.gpuId);
  const blob = new Blob([JSON.stringify(report, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob), link = el('a');
  link.href = url; link.download = 'ARIAMAN-GPU-proposal.json';
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function resultsPage(main) {
  const estimate = estimateGPUMemory(state.requirements);
  const overview = el('section', null, 'gpu-estimate');
  overview.append(el('h2', t('planning')));
  const language = isLanguageWorkload(state.requirements);
  overview.append(el('p', `${t('purpose_' + state.requirements.useCase)} · ${t(language ? 'languageRoute' : 'route_' + state.requirements.useCase)}`, 'gpu-route-note'));
  overview.append(el('p', t('productConditionNote'), 'gpu-purchase-summary small muted'));
  if (language && state.requirements.modelName) overview.append(el('p', state.requirements.modelName, 'gpu-model-name'));
  if (!language && state.requirements.softwareName) overview.append(el('p', state.requirements.softwareName, 'gpu-model-name'));
  const software = !language ? selectedSoftware(state.requirements) : null;
  if (software) {
    const source = el('a', t('softwareSource'));
    source.href = software.source; source.target = '_blank'; source.rel = 'noopener noreferrer';
    overview.append(source, el('p', t('softwareUnverified'), 'small muted'));
  }
  const metrics = el('div', null, 'gpu-metrics');
  for (const [label, value] of [['weights', estimate.weightsGB], ['target', estimate.targetGB]]) {
    if (!language && label === 'weights') continue;
    const metric = el('div'); metric.append(el('small', t(label)), el('strong', memory(value))); metrics.append(metric);
  }
  overview.append(metrics, el('p', t(!language ? estimate.basis === 'measured' ? 'workloadMeasuredFormula' : 'workloadMemoryUnknown' : estimate.basis === 'measured' ? 'measuredFormula' :
    state.requirements.workload !== 'inference' ? 'trainingFormula' : 'formula'), 'small muted'));
  if (estimate.targetGB === null) overview.append(el('p', t('noEstimate'), 'storage-alert'));
  if (estimate.unresolved.includes('runtimeUnknown')) overview.append(el('p', t('runtimeUnknown'), 'storage-alert'));
  const limits = el('details', null, 'gpu-limitations');
  limits.append(el('summary', `${t('limitations')} (${number(estimate.unresolved.length)})`));
  const list = el('ul'); for (const key of estimate.unresolved) list.append(el('li', t(key)));
  limits.append(list); overview.append(limits);
  main.append(overview);
  const tools = el('div', null, 'gpu-tools');
  const inquiry = el('a', t('quote'), 'button primary');
  inquiry.href = quoteURL(); inquiry.target = '_blank'; inquiry.rel = 'noopener noreferrer';
  tools.append(inquiry, button(t('edit'), () => go(0)), button(t('report'), downloadReport),
    button(t('onlyGPU'), () => {standalone = true; notice = ''; render(); focusHeading();}));
  main.append(tools);
  if (standalone) {
    const status = el('p', t('standalone'), 'storage-alert'); status.setAttribute('role', 'status'); main.append(status);
  }
  const candidates = gpuCandidates(data, state.requirements);
  if (estimate.targetGB !== null && !candidates.some(item => item.fit === 'capacity')) main.append(el('p', t('noFit'), 'storage-alert'));
  main.append(el('p', t(language ? 'rankNote' : 'purposeRankNote'), 'small muted'));
  if (candidates.length < gpuCatalog.products.length) main.append(el('p', t('purposeFilterNote'), 'small muted'));
  const grid = el('div', null, 'gpu-cards');
  const first = candidates.find(item => item.fit === 'capacity');
  for (const candidate of candidates.filter(item => state.step !== 2 || item.id === state.gpuId)) {
    const card = el('article', null, 'gpu-card' + (state.gpuId === candidate.id ? ' selected' : ''));
    card.dataset.gpuId = candidate.id;
    card.append(gpuPhoto(candidate));
    const name = el('h2', candidate.name); name.dir = 'ltr'; name.translate = false;
    card.append(name, el('small', t(candidate.layout)));
    card.append(el('span', t(candidate.generation === 'older' ? 'usedProductLabel' : 'productConditionLabel'), 'chip outline'));
    if (candidate.generation === 'older') {
      card.append(el('span', t('olderGeneration'), 'chip outline'), el('p', t('olderSoftwareReview'), 'small muted'));
    }
    if (first?.id === candidate.id) card.append(el('span', '★ ' + t('first'), 'chip good'));
    card.append(el('strong', memory(candidate.usableGB)), el('small', t('perDevice')),
      el('span', t(candidate.fit === 'unknown' ? 'unknownFit' : candidate.fit), 'chip ' + (candidate.fit === 'insufficient' ? 'red' : 'outline')));
    card.append(el('p', t(candidate.usableGB === null ? 'topologyUnknown' : 'capacityNote'), 'small muted'));
    if (candidate.usableGB === null) card.append(el('small', `${t('boardMemory')}: ${memory(candidate.boardGB)}`));
    card.append(el('small', `${t('gpuPower')}: ${number(candidate.watts)} W`), el('p', t('powerNote'), 'small muted'));
    if (candidate.layout === 'nvl') card.append(el('p', t('nvlNote'), 'small muted'));
    const source = el('a', t('vendorSource')); source.href = candidate.source;
    source.target = '_blank'; source.rel = 'noopener noreferrer'; card.append(source);
    if (candidate.options.length) card.append(sourceDetails(candidate.options));
    else card.append(el('p', t(candidate.hpePlatforms?.length ? 'hpePlatformReview' : 'hpeUnlisted'), 'small muted'));
    const choose = button(t(state.step === 2 ? 'nextStep' : state.gpuId === candidate.id ? 'selected' : 'select'), () => {
      if (state.step === 2) {focusSection('.gpu-sales'); return;}
      state.gpuId = candidate.id; notice = ''; go(2); focusSection('.gpu-sales');
    }, 'primary');
    choose.disabled = candidate.fit === 'insufficient' || candidate.usableGB === null;
    card.append(choose); grid.append(card);
  }
  const sales = el('section', null, 'gpu-sales');
  sales.append(el('h2', t(state.step === 2 ? 'nextStep' : 'quote')), el('p', t('salesPath')), el('p', t('availability'), 'small muted'), el('p', t('quoteNote'), 'small muted'));
  const link = el('a', t('quoteWhatsApp'), 'button primary');
  link.href = quoteURL(); link.target = '_blank'; link.rel = 'noopener noreferrer'; link.dataset.gpuQuote = '';
  sales.append(link);
  if (state.step === 2) {
    const continueButton = button(t('showMatchingServers'), () => {
      standalone = false; render(); focusSection('.gpu-server-section');
    }, 'ghost');
    continueButton.dataset.gpuServers = '';
    sales.append(el('p', t('nextStepNote'), 'small muted'), continueButton);
  }
  if (state.step === 2) {
    grid.classList.add('gpu-selected-grid');
    const solution = el('div', null, 'gpu-solution-row');
    solution.append(grid, sales); main.append(solution);
  } else main.append(grid, sales);
  if (state.gpuId && !standalone) serverProposals(main);
  if (state.gpuId && standalone) main.append(button(t('optionalServers'), () => {standalone = false; render();}));
}
function focusSection(selector) {
  const heading = document.querySelector(selector + ' h2');
  if (!heading) return;
  heading.tabIndex = -1; heading.focus({preventScroll:true});
  heading.scrollIntoView({block:'start', behavior:'auto'});
}
function quoteURL() {
  const report = gpuAdvisorReport(data, state.requirements, state.gpuId);
  const req = report.requirements, selected = report.selected;
  const lines = [t('quoteTitle'), selected?.name || t('unknown'), `${t('quantity')}: ${number(req.replicas)}`,
    `${t('purposeTitle')}: ${t('purpose_' + req.useCase)}`,
    `${t('generation')}: ${t('generation_' + req.generation)}`,
    `${t('condition')}: ${t('condition_' + req.condition)}`,
    ...(isLanguageWorkload(req) ? [
      `${t('needs')}: ${t(req.workload)}`, req.modelName ? `${t('modelName')}: ${req.modelName}` : null,
      `${t('parametersB')}: ${req.parametersB === null ? t('unknown') : number(req.parametersB)}`,
      `${t('precision')}: ${t(req.precision === 'unknown' ? 'unknown' : 'bits' + req.precision)}`,
      `${t('contextTokens')}: ${req.contextTokens === null ? t('unknown') : number(req.contextTokens)}`,
      `${t('runtimeGB')}: ${memory(req.runtimeGB)}`,
    ] : [
      `${t('softwareName')}: ${req.softwareName || t('unknown')}`,
      `${t('workloadDetails')}: ${req.workloadDetails || t('unknown')}`,
      `${t('channels')}: ${req.channels === null ? t('unknown') : number(req.channels)}`,
      `${t('sharing')}: ${t('sharing_' + req.sharing)}`,
      `${t('computeType')}: ${t('computeType_' + req.computeType)}`,
    ]),
    `${t('concurrency')}: ${req.concurrency === null ? t('unknown') : number(req.concurrency)}`,
    `${t('measuredGB')}: ${memory(req.measuredGB)}`,
    ...(report.software_profile ? [
      `${t('softwareSource')}: ${report.software_profile.source}`, t('softwareUnverified'),
    ] : []),
    `${t('target')}: ${memory(report.estimate.targetGB)}`, t('limitations'),
    ...report.limitations.map(key => '- ' + t(key)), selected?.source,
    ...report.source_listed_platforms.map(platform => `${platform.name} · ${platform.sku} · ${t('review')} · ${platform.source}`),
    t('salesPath')];
  return `https://wa.me/${salesWhatsApp}?text=${encodeURIComponent(lines.filter(Boolean).join('\n'))}`;
}
function serverProposals(main) {
  const proposal = validateGPUProposal({version:1, requirements:state.requirements, gpuId:state.gpuId}, data);
  const servers = gpuServerCandidates(data, proposal);
  const gpu = gpuCandidates(data, state.requirements).find(candidate => candidate.id === state.gpuId);
  const platforms = gpu.hpePlatforms || [];
  const section = el('section', null, 'gpu-server-section');
  section.append(el('h2', t('optionalServers')), el('p', t('optionalNote'), 'muted'));
  if (!servers.length && !platforms.length) {
    section.append(el('p', t('hpeUnlisted'), 'storage-alert'));
    main.append(section); return;
  }
  section.append(el('p', t('hpePartNote'), 'small muted'));
  const grid = el('div', null, 'gpu-server-grid');
  for (const platform of platforms) {
    const card = el('article', null, 'gpu-server-card gpu-source-platform');
    const name = el('h3', platform.name); name.dir = 'ltr'; name.translate = false;
    card.append(name, el('span', t('review'), 'chip outline'), el('p', `${platform.sku} · ${platform.cpuFamily}`, 'code'),
      el('p', t('hpePlatformReview'), 'small muted'), el('p', t('hardware'), 'small muted'));
    const evidence = el('details'); evidence.append(el('summary', t('sources')));
    const quote = el('blockquote', platform.quote); quote.dir = 'ltr';
    const source = el('a', t('manufacturerPage')); source.href = platform.source;
    source.target = '_blank'; source.rel = 'noopener noreferrer';
    evidence.append(quote, el('small', `${t('modelCatalogDate')} ${platform.checkedAt}`), source);
    const inquiry = el('a', t('platformQuote'), 'button primary');
    inquiry.href = quoteURL() + encodeURIComponent(`\n${t('platformQuote')}: ${platform.name} · ${platform.sku}\n${platform.source}`);
    inquiry.target = '_blank'; inquiry.rel = 'noopener noreferrer';
    card.append(evidence, inquiry); grid.append(card);
  }
  for (const candidate of servers) {
    const card = el('article', null, 'gpu-server-card'); card.dataset.modelId = candidate.model.id;
    const name = el('h3', candidate.model.name); name.dir = 'ltr'; name.translate = false;
    card.append(name, el('span', t(candidate.blocked ? 'conflict' : 'review'), 'chip ' + (candidate.blocked ? 'red' : 'outline')));
    card.append(el('p', t('hardware'), 'small muted'));
    const kits = el('details'); kits.append(el('summary', t('accessories')));
    if (!candidate.required.length) kits.append(el('p', t('noAccessories'), 'small'));
    for (const item of candidate.required) {
      const row = el('p', `${item.any.join(' / ')} × ${number(item.quantity)}`, 'code'); row.dir = 'ltr'; kits.append(row);
    }
    card.append(kits);
    if (candidate.findings.length) {
      const rules = el('details'); rules.append(el('summary', t('ruleReview')));
      for (const rule of candidate.findings) {
        const copy = serverStrings[lang]['rule_' + rule.id.split(':')[1]] || rule.message;
        rules.append(el('p', `${t(rule.status === 'conflict' ? 'conflict' : 'review')}: ${copy}`, 'small'));
      }
      card.append(rules);
    }
    card.append(sourceDetails([candidate.option])); grid.append(card);
  }
  section.append(grid);
  if (!servers.length) {main.append(section); return;}
  if (!servers.some(candidate => !candidate.blocked)) section.append(el('p', t('noServers'), 'storage-alert'));
  const next = button(t('chooseServer'), async () => {
    next.disabled = true;
    try { await host.onServer(proposal); }
    catch (error) { console.error('GPU proposal handoff failed', error); notice = 'handoffFailed'; render(); }
  }, 'primary');
  next.disabled = !servers.some(candidate => !candidate.blocked);
  section.append(el('p', t('handoffNote'), 'small muted'), next);
  main.append(section);
}
