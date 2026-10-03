import {initialGPURequirements, validateGPURequirements, estimateGPUMemory,
  gpuCandidates, validateGPUProposal, gpuServerCandidates, gpuAdvisorReport} from './gpu-advisor.js';
import {strings} from './gpu-copy.js';
import {strings as serverStrings} from './i18n.js';
import {officialProductPages} from './server-links.js';
import {salesWhatsApp} from './sales-contact.js';
import {el, button, shell, focusHeading} from './studio-ui.js';

const KEY = 'aria-gpu-advisor-v1';
let host, data, lang = 'fa', notice = '', standalone = false;
let state = fresh();
function fresh() { return {version:1, step:0, requirements:initialGPURequirements(), gpuId:null}; }
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
    const requirements = validateGPURequirements(saved.requirements);
    const gpuId = saved.gpuId === null ? null : validateGPUProposal({version:1, requirements, gpuId:saved.gpuId}, data).gpuId;
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
  if (context.isCurrent()) render();
}
function go(step) {
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
  if (state.step === 0) needsPage(main);
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
      state.requirements = validateGPURequirements({...state.requirements, [key]:value});
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
function needsPage(main) {
  const form = el('form', null, 'gpu-discovery');
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
  const fields = el('div', null, 'gpu-fields');
  fields.append(inputField('modelName', {type:'text', hint:'modelNameHint'}),
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
  form.append(fields);
  const advanced = el('details', null, 'gpu-advanced');
  advanced.append(el('summary', t('advanced')));
  const extra = el('div', null, 'gpu-fields');
  extra.append(inputField('runtimeGB', {min:0, step:0.1, hint:'runtimeHint'}),
    inputField('measuredGB', {min:0.1, step:0.1, hint:'measuredHint'}),
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
      state.requirements = validateGPURequirements(answers);
      notice = ''; state.gpuId = null; go(1);
    } catch (error) {
      console.warn('Invalid GPU discovery data', error);
      notice = 'invalid'; render();
    }
  };
  main.append(form);
}
function gpuGraphic() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 240 110'); svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('gpu-graphic');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', 'M15 20h202v65H15z M217 32h10v42h-10 M32 85v12h105V85 M154 33h44 M154 44h44 M154 55h44 M154 66h44 M8 13v84');
  svg.append(path);
  for (const x of [58, 115]) {
    const fan = document.createElementNS(svg.namespaceURI, 'circle');
    fan.setAttribute('cx', x); fan.setAttribute('cy', '53'); fan.setAttribute('r', '21'); svg.append(fan);
    const blades = document.createElementNS(svg.namespaceURI, 'path');
    blades.setAttribute('d', `M${x - 15} 53h30 M${x} 38v30 M${x - 10} 43l20 20 M${x + 10} 43l-20 20`);
    svg.append(blades);
  }
  return svg;
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
    const link = el('a', t('manufacturerPage')); link.href = officialProductPages[model.id];
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
  if (state.requirements.modelName) overview.append(el('p', state.requirements.modelName, 'gpu-model-name'));
  const metrics = el('div', null, 'gpu-metrics');
  for (const [label, value] of [['weights', estimate.weightsGB], ['target', estimate.targetGB]]) {
    const metric = el('div'); metric.append(el('small', t(label)), el('strong', memory(value))); metrics.append(metric);
  }
  overview.append(metrics, el('p', t(estimate.basis === 'measured' ? 'measuredFormula' :
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
  main.append(el('p', t('rankNote'), 'small muted'));
  const grid = el('div', null, 'gpu-cards');
  const first = candidates.find(item => item.fit === 'capacity');
  for (const candidate of candidates.filter(item => state.step !== 2 || item.id === state.gpuId)) {
    const card = el('article', null, 'gpu-card' + (state.gpuId === candidate.id ? ' selected' : ''));
    card.dataset.gpuId = candidate.id;
    card.append(gpuGraphic());
    const name = el('h2', candidate.name); name.dir = 'ltr'; name.translate = false;
    card.append(name, el('small', t(candidate.layout)));
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
    else card.append(el('p', t('hpeUnlisted'), 'small muted'));
    const choose = button(t(state.gpuId === candidate.id ? 'selected' : 'select'), () => {
      state.gpuId = candidate.id; notice = ''; go(2);
    }, 'primary');
    choose.disabled = candidate.fit === 'insufficient' || candidate.usableGB === null;
    card.append(choose); grid.append(card);
  }
  const sales = el('section', null, 'gpu-sales');
  sales.append(el('h2', t('quote')), el('p', t('salesPath')), el('p', t('availability'), 'small muted'), el('p', t('quoteNote'), 'small muted'));
  const link = el('a', t('quote'), 'button primary');
  link.href = quoteURL(); link.target = '_blank'; link.rel = 'noopener noreferrer'; link.dataset.gpuQuote = '';
  sales.append(link);
  if (state.step === 2) {
    grid.classList.add('gpu-selected-grid');
    const solution = el('div', null, 'gpu-solution-row');
    solution.append(grid, sales); main.append(solution);
  } else main.append(grid, sales);
  if (state.gpuId && !standalone) serverProposals(main);
  if (state.gpuId && standalone) main.append(button(t('optionalServers'), () => {standalone = false; render();}));
}
function quoteURL() {
  const report = gpuAdvisorReport(data, state.requirements, state.gpuId);
  const req = report.requirements, selected = report.selected;
  const lines = [t('quoteTitle'), selected?.name || t('unknown'), `${t('quantity')}: ${number(req.replicas)}`,
    `${t('needs')}: ${t(req.workload)}`, req.modelName ? `${t('modelName')}: ${req.modelName}` : null,
    `${t('parametersB')}: ${req.parametersB === null ? t('unknown') : number(req.parametersB)}`,
    `${t('precision')}: ${t(req.precision === 'unknown' ? 'unknown' : 'bits' + req.precision)}`,
    `${t('concurrency')}: ${req.concurrency === null ? t('unknown') : number(req.concurrency)}`,
    `${t('contextTokens')}: ${req.contextTokens === null ? t('unknown') : number(req.contextTokens)}`,
    `${t('runtimeGB')}: ${memory(req.runtimeGB)}`, `${t('measuredGB')}: ${memory(req.measuredGB)}`,
    `${t('target')}: ${memory(report.estimate.targetGB)}`, t('limitations'),
    ...report.limitations.map(key => '- ' + t(key)), selected?.source, t('salesPath')];
  return `https://wa.me/${salesWhatsApp}?text=${encodeURIComponent(lines.filter(Boolean).join('\n'))}`;
}
function serverProposals(main) {
  const proposal = validateGPUProposal({version:1, requirements:state.requirements, gpuId:state.gpuId}, data);
  const servers = gpuServerCandidates(data, proposal);
  const section = el('section', null, 'gpu-server-section');
  section.append(el('h2', t('optionalServers')), el('p', t('optionalNote'), 'muted'));
  if (!servers.length) {
    section.append(el('p', t('hpeUnlisted'), 'storage-alert'));
    main.append(section); return;
  }
  section.append(el('p', t('hpePartNote'), 'small muted'));
  const grid = el('div', null, 'gpu-server-grid');
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
