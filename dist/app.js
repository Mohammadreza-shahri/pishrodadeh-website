import {
  initial,
  CATEGORIES,
  getOption,
  selectedOptions,
  quantity,
  optionCheck,
  activeFindings,
  directConflicts,
  requiredKits,
  stats,
  recommend,
  workloadLimits,
  validateImport,
} from './engine.js';
import {strings} from './i18n.js';

const STORAGE_KEY = 'aria-configurator-v3';
const STORAGE_VERSION = 1;
const PAGE_SIZE = 8;
const BASE_REQUIRED = ['cpu', 'memory', 'storage', 'psu'];
const app = document.getElementById('app');

let lang = 'fa';
let data;
let state = {...initial(), advisorMode: 'guided'};
let category = 'cpu';
let query = '';
let page = 0;
let modalFactory = null;
let lastFocused = null;
let restoreNotice = null;
let showMobileSummary = false;

const t = key => strings[lang][key] || strings.en[key] || key;
const number = value => new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US', {maximumFractionDigits: 2}).format(value);
const el = (tag, text = null, cls = '') => {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};

const icons = {
  virtualization: 'M4 3h16v7H4z M4 14h16v7H4z M7 6h1 M7 17h1 M12 6h5 M12 17h5',
  database: 'M20 5c0 2-3.6 3-8 3S4 7 4 5s3.6-3 8-3 8 1 8 3z M4 5v14c0 2 3.6 3 8 3s8-1 8-3V5 M4 12c0 2 3.6 3 8 3s8-1 8-3',
  business: 'M3 8h18v13H3z M8 8V4h8v4 M3 13h18 M10 13v3h4v-3',
  storage: 'M3 4h18v6H3z M3 14h18v6H3z M7 7h1 M7 17h1 M15 7h3 M15 17h3',
  ai_inference: 'M9 3v4 M15 3v4 M9 17v4 M15 17v4 M3 9h4 M3 15h4 M17 9h4 M17 15h4 M7 7h10v10H7z M10 10h4v4h-4z',
  ai_training: 'M12 2v5 M12 17v5 M2 12h5 M17 12h5 M5 5l4 4 M15 15l4 4 M5 19l4-4 M15 9l4-4 M8 8h8v8H8z',
  cpu: 'M6 6h12v12H6z M9 9h6v6H9z M9 2v4 M15 2v4 M9 18v4 M15 18v4 M2 9h4 M18 9h4 M2 15h4 M18 15h4',
  memory: 'M2 7h20v10H2z M5 10h3v4H5z M10 10h3v4h-3z M16 10h3v4h-3z M5 17v3 M9 17v3 M13 17v3 M17 17v3',
  controller: 'M3 5h18v13H3z M7 9h6v5H7z M17 8v7 M5 18v3 M10 18v3 M15 18v3',
  backplane: 'M3 3h18v18H3z M7 7h3v3H7z M14 7h3v3h-3z M7 14h3v3H7z M14 14h3v3h-3z',
  hba: 'M4 4h16v16H4z M7 8h4v4H7z M14 8h3v4h-3z M7 16h10 M8 20v2 M14 20v2',
  gpu: 'M2 6h19v12H2z M21 9h2v6h-2 M5 18v3 M9 18v3 M13 18v3 M6 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M15 9h3 M15 12h3 M15 15h3',
  riser: 'M4 3h5v13h12v5H4z M9 8h4 M9 12h4 M14 16v-4 M18 16v-4',
  psu: 'M4 3h16v18H4z M13 6l-4 7h4l-2 5 5-8h-4z',
  cooling: 'M12 8v8 M8 12h8 M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M12 8c-7-7-8 3 0 4 M12 12c7-7-3-8-4 0 M12 12c7 7 8-3 0-4 M12 12c-7 7 3 8 4 0',
  kits: 'M7 3v6h10V3 M4 9h16v6H4z M12 15v7',
  issue: 'M12 2v12 M12 18h.01 M5 5l14 14',
  good: 'M5 12l5 5L20 7',
  summary: 'M4 5h16 M4 12h16 M4 19h10',
};

const faRules = {
  secondary_cpu: 'رایزر ثانویه به پردازنده دوم نیاز دارد.',
  hot_cpu_fans: 'پردازنده بالاتر از ۲۰۵ وات به فن High Performance نیاز دارد.',
  '3508_memory': 'پردازنده 3508U با DIMM 96GB 5600MT/s قابل ترکیب نیست.',
  '3508_single': 'پردازنده 3508U فقط در پیکربندی تک‌سوکت پشتیبانی می‌شود.',
  lff_rear: 'کیج عقب 2LFF به شاسی LFF نیاز دارد.',
  cache_backup: 'کنترلر دارای کش به باتری یا خازن پشتیبان معرفی‌شده نیاز دارد.',
  fh_blocks_slot2: 'رایزر ثانویه Full Height، اسلات ۲ را مسدود می‌کند.',
  '186_270_cooling': 'پردازنده ۱۸۶ تا ۲۷۰ وات به هیت‌سینک و فن High Performance مشخص‌شده نیاز دارد.',
  dual_hot_liquid: 'دو پردازنده با توان حداقل ۲۷۱ وات به راهکار خنک‌سازی مایع مشخص‌شده نیاز دارند.',
  '1600_input': 'منبع تغذیه 1600W Platinum به ورودی ۲۰۰ تا ۲۴۰ ولت نیاز دارد.',
  single_socket_models: 'این مدل پردازنده فقط در پیکربندی تک‌سوکت پشتیبانی می‌شود.',
  '195_heatsink': 'پردازنده حداقل ۱۹۵ وات به هیت‌سینک P47224-B21 نیاز دارد.',
  '300_fans': 'پردازنده حداقل ۳۰۰ وات به هر دو کیت فن مشخص‌شده نیاز دارد.',
  cpu2_fan: 'پردازنده دوم یا گزینه وابسته به آن، به کیت فن P47902-B21 نیاز دارد.',
  rich_config_fans: 'این ترکیب حافظه، ذخیره‌سازی یا GPU به هر دو کیت فن نیاز دارد.',
  dual_cpu_required: 'این پلتفرم به دو پردازنده نیاز دارد.',
  gpu_required: 'پیکربندی این پلتفرم بدون GPU مجاز نیست.',
  '270_heatsink': 'پردازنده حداقل ۲۷۰ وات به هیت‌سینک P51832-B21 نیاز دارد.',
  dimm_population: 'هر پردازنده باید با ۱، ۲، ۴، ۶، ۸ یا ۱۲ DIMM جمعیت‌گذاری شود.',
  '96_4800_quantity': 'حافظه 96GB 4800 باید در تعداد ۱۶ عدد انتخاب شود.',
  '96_5600_quantity': 'حافظه 96GB 5600 فقط در تعداد ۲، ۱۲، ۱۶ یا ۲۴ عدد مجاز است.',
  nvme_only: 'این پلتفرم فقط درایو NVMe SSD می‌پذیرد.',
  controller_mix: 'ترکیب مدل‌های مختلف کنترلر مجاز نیست.',
  trimode_backup: 'کنترلر Tri-mode به باتری یا خازن پشتیبان مشخص‌شده نیاز دارد.',
  prose_dimms_per_cpu: 'تعداد DIMM در هر پردازنده از ظرفیت ثبت‌شده بیشتر است.',
  prose_psu_mixing: 'ترکیب مدل‌های مختلف منبع تغذیه مجاز نیست.',
  cables_balanced_direct: 'مسیر NVMe مستقیم متوازن به کیت کابل P55704-B21 نیاز دارد.',
  cables_balanced_type_p: 'مسیر NVMe متوازن با کنترلرهای type-p به دو کیت کابل مشخص‌شده نیاز دارد.',
  cables_balanced_oroc: 'مسیر NVMe متوازن با کنترلرهای OROC به دو کیت کابل مشخص‌شده نیاز دارد.',
};

const guidedProfiles = {
  virtualization: [
    {key: 'balanced', values: {vms: 20, ramPerVM: 8, ramGB: 192, cores: 16, storageTB: 2}},
    {key: 'growth', values: {vms: 40, ramPerVM: 8, ramGB: 384, cores: 32, storageTB: 4}},
    {key: 'dense', values: {vms: 60, ramPerVM: 12, ramGB: 864, cores: 48, storageTB: 8}},
  ],
  database: [
    {key: 'latency', values: {ramGB: 256, cores: 24, storageTB: 4}},
    {key: 'balanced', values: {ramGB: 512, cores: 32, storageTB: 8}},
    {key: 'capacity', values: {ramGB: 768, cores: 48, storageTB: 16}},
  ],
  business: [
    {key: 'branch', values: {ramGB: 64, cores: 12, storageTB: 2}},
    {key: 'core', values: {ramGB: 128, cores: 20, storageTB: 4}},
    {key: 'suite', values: {ramGB: 256, cores: 32, storageTB: 8}},
  ],
  storage: [
    {key: 'archive', values: {ramGB: 64, cores: 12, storageTB: 24}},
    {key: 'backup', values: {ramGB: 128, cores: 16, storageTB: 48}},
    {key: 'primary', values: {ramGB: 256, cores: 24, storageTB: 96}},
  ],
  ai_inference: [
    {key: 'pilot', values: {ramGB: 128, cores: 20, gpuGB: 24}},
    {key: 'service', values: {ramGB: 256, cores: 32, gpuGB: 48}},
    {key: 'dense', values: {ramGB: 512, cores: 48, gpuGB: 80}},
  ],
  ai_training: [
    {key: 'pilot', values: {ramGB: 256, cores: 32, gpuGB: 48}},
    {key: 'team', values: {ramGB: 512, cores: 48, gpuGB: 80}},
    {key: 'lab', values: {ramGB: 1024, cores: 64, gpuGB: 80}},
  ],
};

function icon(key) {
  const wrap = el('span', null, 'icon');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', icons[key] || icons.cpu);
  svg.append(path);
  wrap.append(svg);
  return wrap;
}

function btn(text, onClick, kind = '') {
  const button = el('button', text, `button ${kind}`.trim());
  button.type = 'button';
  button.onclick = onClick;
  return button;
}

function arrowButton(text, onClick, kind = 'primary') {
  const button = btn(text, onClick, kind);
  button.append(el('span', '→', 'arrow'));
  return button;
}

function tag(text, kind = '') {
  return el('span', text, `chip ${kind}`.trim());
}

function bidi(text, cls = '') {
  const node = el('span', text, cls);
  node.dir = 'ltr';
  return node;
}

function toast(text) {
  document.querySelector('.toast')?.remove();
  const node = el('div', text, 'toast');
  node.setAttribute('role', 'status');
  node.setAttribute('aria-live', 'polite');
  document.body.append(node);
  setTimeout(() => node.remove(), 4500);
}

function field(label, value, onChange, {type = 'number', min = 1, max = 100000, options = null, step = 1, hint = '', id = ''} = {}) {
  const labelNode = el('label', null, 'field');
  const labelText = el('span', label, 'field-label');
  labelNode.append(labelText);
  if (hint) labelNode.append(el('small', hint, 'field-hint'));
  let input;
  if (options) {
    input = el('select');
    for (const [optionValue, optionLabel] of options) {
      const option = el('option', optionLabel);
      option.value = String(optionValue);
      input.append(option);
    }
    input.value = String(value);
  } else {
    input = el('input');
    input.type = type;
    input.value = value ?? '';
    if (type === 'number') {
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.inputMode = 'numeric';
    }
  }
  if (id) input.id = id;
  input.onchange = () => {
    if (!options && type === 'number') {
      const next = Number(input.value);
      if (!Number.isFinite(next) || next < min || next > max) {
        input.value = String(value ?? '');
        return;
      }
      onChange(next);
      return;
    }
    onChange(input.value);
  };
  labelNode.append(input);
  return labelNode;
}

function withRender(mutator, {resetList = true, announce = ''} = {}) {
  mutator();
  if (resetList) {
    query = '';
    page = 0;
  }
  persistState();
  render();
  if (announce) toast(announce);
}

function go(step) {
  if (step > 2 && !state.model_id) return;
  state.step = step;
  persistState();
  render();
  window.scrollTo({top: 0, behavior: 'smooth'});
}

function model() {
  return data.models.find(entry => entry.id === state.model_id);
}

function chosen(cat) {
  return getOption(state, data, cat);
}

function ruleText(rule) {
  if (lang === 'en') return rule.message;
  return faRules[rule.id.split(':')[1]] || t('ruleNeedsReview');
}

function evidence(items) {
  const details = el('details', null, 'evidence-details');
  details.append(el('summary', t('source')));
  for (const item of items || []) {
    details.append(
      el('p', `QuickSpecs ${item.qs_id} · ${t('sourceDate')} ${item.version}`, 'small muted'),
      el('div', item.quote, 'evidence'),
    );
  }
  return details;
}

function renderModal(title) {
  const overlay = el('div', null, 'dialog-backdrop');
  const dialog = el('section', null, 'dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'dialog-title');
  const header = el('div', null, 'dialog-header');
  const titleNode = el('h2', title);
  titleNode.id = 'dialog-title';
  const close = btn('×', () => closeModal(overlay), 'close');
  close.setAttribute('aria-label', t('close'));
  header.append(titleNode, close);
  dialog.append(header, modalFactory());
  overlay.append(dialog);
  document.body.append(overlay);
  lastFocused = document.activeElement;
  close.focus();
  overlay.addEventListener('click', event => {
    if (event.target === overlay) closeModal(overlay);
  });
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeModal(overlay);
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button,a,input,select,summary,[tabindex="0"]')].filter(node => !node.disabled);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

function closeModal(overlay) {
  overlay.remove();
  lastFocused?.focus?.();
}

function showDetails(option) {
  modalFactory = () => {
    const box = el('div', null, 'details-sheet');
    box.append(el('h3', option.sku, 'details-sku'), el('p', option.description, 'details-copy'));
    const table = el('table');
    const body = document.createElement('tbody');
    for (const [key, value] of Object.entries(option.attributes || {})) {
      if (value == null) continue;
      const row = el('tr');
      row.append(el('td', key), el('td', String(value), 'code'));
      body.append(row);
    }
    table.append(body);
    box.append(table, el('p', t('evidenceNote'), 'small muted'), evidence(option.evidence));
    return box;
  };
  renderModal(t('evidenceTitle'));
}

function coverageModal() {
  modalFactory = () => {
    const box = el('div');
    box.append(
      el('p', t('coverageBody')),
      el('p', `${data.models.length} ${lang === 'fa' ? 'پلتفرم' : 'platforms'} · ${data.rules.length} ${lang === 'fa' ? 'قاعده اجرایی' : 'executable rules'} · ${data.options.length} ${lang === 'fa' ? 'گزینه منبع‌دار' : 'source-linked entries'}`, 'small muted'),
    );
    return box;
  };
  renderModal(t('coverageTitle'));
}

function layout() {
  app.replaceChildren();
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  document.title = lang === 'fa' ? 'پیشرو داده | پیکربندی سرور HPE' : 'Pishrodadeh | HPE Server Configurator';

  const shell = el('div', null, 'shell');
  const header = el('header', null, 'site-header');
  const brand = el('div', null, 'brand');
  const wordmark = el('span', 'ARIA', 'wordmark');
  wordmark.dir = 'ltr';
  const label = el('div', null, 'brand-copy');
  label.append(el('small', 'PISHRODADEH / پیشرو داده'), el('strong', t('brand')));
  brand.append(wordmark, label);

  const actions = el('div', null, 'header-actions');
  actions.append(tag(t('private'), 'dark'));
  if (state.model_id) actions.append(tag(model().short, 'outline'));
  const language = btn(lang === 'fa' ? 'English' : 'فارسی', () => {
    lang = lang === 'fa' ? 'en' : 'fa';
    persistState();
    render();
  }, 'ghost language');
  actions.append(language);
  header.append(brand, actions);

  const intro = el('section', null, 'hero');
  const introCopy = el('div', null, 'hero-copy');
  introCopy.append(el('p', 'ENGINEERING CONFIGURATION STUDIO', 'eyebrow'), el('h1', t('title')), el('p', t('heroLead'), 'hero-lead'));
  const introStatus = el('div', null, 'hero-status');
  introStatus.append(
    metricCard(number(data.models.length), t('platformsLabel'), t('sourceBackedMetric')),
    metricCard(number(data.options.length), t('sourceOptionsLabel'), t('sourceLinkedMetric')),
    metricCard(number(data.rules.length), t('rulesLabel'), t('coverageMetric')),
  );
  intro.append(introCopy, introStatus);

  const main = el('main');
  const stepper = el('nav', null, 'stepper');
  stepper.setAttribute('aria-label', lang === 'fa' ? 'مراحل پیکربندی' : 'Configuration steps');
  for (let index = 1; index <= 4; index += 1) {
    const button = el('button', null, `step ${state.step === index ? 'current' : state.step > index ? 'done' : ''}`.trim());
    button.type = 'button';
    button.disabled = index > 2 && !state.model_id;
    if (state.step === index) button.setAttribute('aria-current', 'step');
    button.append(el('span', state.step > index ? '✓' : number(index)), document.createTextNode(t(`step${index}`)));
    button.onclick = () => go(index);
    stepper.append(button);
  }

  const content = el('section', null, 'page');
  const footer = el('footer', null, 'site-footer');
  footer.append(el('span', t('footer')), el('span', t('independent')));
  const footerLinks = el('span', null, 'footer-links');
  const coverage = btn(t('allSources'), coverageModal, 'linklike');
  const reset = btn(t('reset'), () => {
    if (!confirm(t('confirmReset'))) return;
    state = {...initial(), advisorMode: 'guided'};
    category = 'cpu';
    page = 0;
    query = '';
    showMobileSummary = false;
    clearPersistedState();
    render();
  }, 'linklike');
  footerLinks.append(coverage, reset);
  footer.append(footerLinks);

  shell.append(header, intro, stepper, content, footer);
  app.append(shell);
  renderToastNotice();
  return content;
}

function metricCard(value, label, hint) {
  const card = el('div', null, 'hero-card');
  card.append(el('strong', value), el('span', label), el('small', hint));
  return card;
}

function leadBlock(title, copy) {
  const lead = el('section', null, 'section-head');
  const body = el('div');
  body.append(el('h2', title), el('p', copy, 'muted'));
  lead.append(body);
  return lead;
}

function renderToastNotice() {
  if (!restoreNotice) return;
  toast(t(restoreNotice));
  restoreNotice = null;
}

function guidance() {
  return t(
    state.workload === 'virtualization'
      ? 'tipVirtual'
      : state.workload === 'database'
        ? 'tipDatabase'
        : state.workload === 'business'
          ? 'tipBusiness'
          : state.workload === 'storage'
            ? 'tipStorage'
            : 'tipAI',
  );
}

function workloadMeta() {
  return {
    virtualization: ['vmCount', 'vmRAM', 'ramTarget'],
    database: ['ramTarget', 'coreTarget', 'storageTarget'],
    business: ['ramTarget', 'coreTarget', 'storageTarget'],
    storage: ['ramTarget', 'coreTarget', 'storageTarget'],
    ai_inference: ['ramTarget', 'coreTarget', 'gpuTarget'],
    ai_training: ['ramTarget', 'coreTarget', 'gpuTarget'],
  }[state.workload];
}

function applyProfile(profile) {
  withRender(() => {
    state.requirements = {...state.requirements, ...profile.values};
    if (state.workload === 'virtualization' && profile.values.vms && profile.values.ramPerVM) {
      state.requirements.ramGB = Math.ceil(profile.values.vms * profile.values.ramPerVM * 1.2);
    }
  }, {announce: t('profileApplied')});
}

function estimateLabel(profile) {
  if (state.workload === 'virtualization') return `${number(profile.values.vms)} ${t('vmCount')}`;
  if (state.workload.startsWith('ai')) return `${number(profile.values.gpuGB)} GB GPU`;
  return `${number(profile.values.storageTB)} TB`;
}

function workPage(root) {
  const lead = leadBlock(t('workloadTitle'), t('workloadSub'));
  const saveHint = el('p', t('localSaveHint'), 'muted small');
  lead.append(saveHint);
  root.append(lead);

  const grid = el('div', null, 'workload-grid');
  for (const key of ['virtualization', 'database', 'business', 'storage', 'ai_inference', 'ai_training']) {
    const card = el('button', null, `workload-card ${state.workload === key ? 'selected' : ''}`.trim());
    card.type = 'button';
    card.setAttribute('aria-pressed', String(state.workload === key));
    const copy = el('div');
    copy.append(el('h3', key === 'storage' ? (lang === 'fa' ? 'ذخیره‌سازی و پشتیبان‌گیری' : 'Storage & backup') : t(key)), el('p', t(`${key}Desc`)));
    const foot = el('div', null, 'workload-meta');
    foot.append(tag(t('guidedMode'), 'outline'), tag(t('reviewRequired'), 'amber'));
    card.append(icon(key), copy, foot);
    card.onclick = () => withRender(() => {
      state.workload = key;
      state.advisorMode ??= 'guided';
      const firstProfile = guidedProfiles[key][0];
      state.requirements = {...state.requirements, ...firstProfile.values};
      if (key === 'virtualization') state.requirements.ramGB = Math.ceil(state.requirements.vms * state.requirements.ramPerVM * 1.2);
    });
    grid.append(card);
  }
  root.append(grid);

  const advisor = el('section', null, 'advisor');
  const advisorLead = el('div', null, 'advisor-head');
  const heading = el('div');
  heading.append(el('h3', t('advisorTitle')), el('p', t('advisorSub'), 'muted small'));
  const toggle = el('div', null, 'mode-toggle');
  const guided = btn(t('guidedMode'), () => withRender(() => { state.advisorMode = 'guided'; }, {resetList: false}), state.advisorMode === 'guided' ? 'dark compact' : 'compact');
  const advanced = btn(t('advancedMode'), () => withRender(() => { state.advisorMode = 'advanced'; }, {resetList: false}), state.advisorMode === 'advanced' ? 'dark compact' : 'compact');
  guided.setAttribute('aria-pressed', String(state.advisorMode === 'guided'));
  advanced.setAttribute('aria-pressed', String(state.advisorMode === 'advanced'));
  toggle.append(guided, advanced);
  advisorLead.replaceChildren(heading, toggle);
  advisor.append(advisorLead);

  if (state.advisorMode === 'guided') {
    const profiles = el('div', null, 'profile-grid');
    for (const profile of guidedProfiles[state.workload]) {
      const card = el('button', null, 'profile-card');
      card.type = 'button';
      card.append(el('strong', t(`profile_${profile.key}`)), el('span', estimateLabel(profile)), el('small', t('estimateHeuristic')));
      card.onclick = () => applyProfile(profile);
      profiles.append(card);
    }
    advisor.append(profiles);
  }

  const fields = el('div', null, 'advisor-fields');
  const req = state.requirements;
  if (state.workload === 'virtualization') {
    fields.append(
      field(t('vmCount'), req.vms, value => withRender(() => {
        req.vms = value;
        req.ramGB = Math.ceil(req.vms * req.ramPerVM * 1.2);
      }, {resetList: false}), {hint: t('vmCountHint')}),
      field(t('vmRAM'), req.ramPerVM, value => withRender(() => {
        req.ramPerVM = value;
        req.ramGB = Math.ceil(req.vms * req.ramPerVM * 1.2);
      }, {resetList: false}), {hint: t('vmRAMHint')}),
      field(t('ramTarget'), req.ramGB, value => withRender(() => {
        req.ramGB = value;
      }, {resetList: false}), {hint: t('headroom')}),
      field(t('coreTarget'), req.cores, value => withRender(() => { req.cores = value; }, {resetList: false}), {hint: t('coreTargetHint')}),
      field(t('storageTarget'), req.storageTB, value => withRender(() => { req.storageTB = value; }, {resetList: false}), {hint: t('storageTargetHint')}),
    );
  } else {
    fields.append(
      field(t('ramTarget'), req.ramGB, value => withRender(() => { req.ramGB = value; }, {resetList: false}), {hint: t('ramTargetHint')}),
      field(t('coreTarget'), req.cores, value => withRender(() => { req.cores = value; }, {resetList: false}), {hint: t('coreTargetHint')}),
      field(t(state.workload.startsWith('ai') ? 'gpuTarget' : 'storageTarget'), state.workload.startsWith('ai') ? req.gpuGB : req.storageTB, value => withRender(() => {
        if (state.workload.startsWith('ai')) req.gpuGB = value;
        else req.storageTB = value;
      }, {resetList: false}), {hint: t(state.workload.startsWith('ai') ? 'gpuTargetHint' : 'storageTargetHint')}),
    );
  }
  advisor.append(fields, callout(t('assumptionsTitle'), t('assumptionsBody'), 'info'));
  root.append(advisor);

  const bottom = el('div', null, 'bottom-action');
  bottom.append(el('p', guidance(), 'advice-strip'), arrowButton(t('findServers'), () => go(2)));
  root.append(bottom);
}

function callout(title, body, tone = 'info') {
  const box = el('div', null, `callout ${tone}`);
  box.append(el('strong', title), el('p', body));
  return box;
}

function serverNarrative(entry) {
  const reasons = {
    '16910': ['density', 'compute'],
    '16911': ['balanced', 'expansion'],
    '16912': ['serviceability', 'office'],
    '16913': ['gpu', 'ai'],
  }[entry.id] || ['balanced', 'review'];

  const tradeoffs = {
    '16910': ['lessDriveFlex', 'tighterThermals'],
    '16911': ['sharedGeneralist', 'requiresReview'],
    '16912': ['towerFootprint', 'lessDense'],
    '16913': ['gpuPlatformCost', 'specialPower'],
  }[entry.id] || ['requiresReview'];

  return {reasons, tradeoffs};
}

function serversPage(root) {
  const lead = leadBlock(t('recommendTitle'), t('recommendSub'));
  lead.append(callout(t('workloadFit'), t('positioningNote')));
  root.append(lead);

  const ranked = recommend(data, state.workload)
    .map(entry => ({...entry, ...workloadLimits(entry, data, state.requirements, state.workload)}))
    .sort((a, b) => Boolean(a.blockers.length) - Boolean(b.blockers.length));

  const compare = el('div', null, 'compare-grid');
  for (const [index, entry] of ranked.entries()) {
    const current = state.model_id === entry.id;
    const narrative = serverNarrative(entry);
    const card = el('article', null, `server-card ${index === 0 && !entry.blockers.length ? 'recommended' : ''} ${current ? 'selected' : ''}`.trim());
    const top = el('div', null, 'server-top');
    top.append(tag(entry.blockers.length ? t('targetExceeds') : index === 0 ? t('recommended') : t('alternative'), entry.blockers.length ? 'red' : 'blue'));
    if (current) top.append(tag(t('selectedServer'), 'good'));
    card.append(top);
    const title = el('div', null, 'server-title');
    title.append(el('div', entry.short.replace(' Gen11', ''), 'server-code'), el('p', 'HPE ProLiant · Gen11', 'muted small'));
    card.append(title);

    const facts = el('div', null, 'server-facts');
    for (const [value, label] of [
      [entry.id === '16912' ? t('tower') : entry.id === '16910' ? '1U' : '2U', t('height')],
      [number(2), t('socket')],
      [number(entry.dimms), t('dimms')],
      [t(entry.id === '16913' ? 'gpuFocus' : entry.id === '16910' ? 'density' : entry.id === '16912' ? 'office' : 'expansion'), t('focus')],
    ]) {
      const fact = el('div', null, 'fact');
      fact.append(el('strong', value), el('small', label));
      facts.append(fact);
    }
    card.append(facts);

    const fit = el('div', null, 'server-fit');
    fit.append(el('strong', t('whyRelevant')), renderList(narrative.reasons.map(key => t(`why_${key}`))));
    fit.append(el('strong', t('tradeoffs')), renderList(narrative.tradeoffs.map(key => t(`tradeoff_${key}`))));
    if (entry.blockers.length) fit.append(callout(t('targetExceeds'), t('targetExceedsNote'), 'warning'));
    card.append(fit);

    const actions = el('div', null, 'server-actions');
    const choose = btn(current ? t('selectedServer') : t('selectServer'), () => chooseModel(entry), current ? 'dark' : 'primary');
    choose.disabled = Boolean(entry.blockers.length);
    const source = btn(t('details'), () => {
      modalFactory = () => {
        const box = el('div');
        box.append(el('h3', entry.name), el('p', t('serverWarning')));
        box.append(callout(t('workloadFit'), t('positioningNote')));
        return box;
      };
      renderModal(entry.short);
    }, 'secondary');
    actions.append(choose, source);
    card.append(actions);
    compare.append(card);
  }

  root.append(compare, callout(t('coverageTitle'), t('coverageNotice'), 'warning'), btn(t('back'), () => go(1), 'ghost'));
}

function renderList(items) {
  const list = el('ul', null, 'compact-list');
  for (const item of items) list.append(el('li', item));
  return list;
}

function chooseModel(entry) {
  if (state.model_id && state.model_id !== entry.id && Object.keys(state.selected).length && !confirm(t('confirmModel'))) return;
  withRender(() => {
    state = {
      ...state,
      model_id: entry.id,
      chassis: entry.chassis[0],
      selected: {},
      extraQty: {},
      cpuQty: entry.id === '16913' ? 2 : 1,
      memoryQty: 8,
      gpuQty: 1,
      psuQty: entry.id === '16913' ? 4 : 2,
      step: 3,
    };
    category = 'cpu';
    showMobileSummary = false;
  }, {announce: t('modelChanged')});
  window.scrollTo({top: 0, behavior: 'smooth'});
}

function partTitle(option) {
  const attrs = option.attributes;
  switch (option.category) {
    case 'cpu':
      return `Intel Xeon ${attrs.model} · ${attrs.cores} ${lang === 'fa' ? 'هسته' : 'cores'}`;
    case 'memory':
      return `${attrs.capacity_gb} GB · DDR5-${attrs.speed_mts} · ${attrs.type || 'DIMM'}`;
    case 'storage':
      return `${attrs.capacity_gb >= 1000 ? `${attrs.capacity_gb / 1000} TB` : `${attrs.capacity_gb} GB`} · ${attrs.protocol} · ${attrs.form || 'SSD'}`;
    case 'gpu':
      return option.description.replace('NVIDIA ', '').replace(option.sku, '').trim();
    case 'psu':
      return option.description.replace('HPE ', '').replace(option.sku, '').replace('Hot Plug Low Halogen Power Supply Kit', '').trim();
    default:
      return option.description === option.sku ? option.sku : option.description.replace('HPE ProLiant ', '').replace('HPE ', '').replace(option.sku, '').trim();
  }
}

function helperCopy(option) {
  if (option.category === 'cpu') return t('cpuPlain');
  if (option.category === 'memory') return t('memoryPlain');
  if (option.category === 'storage') return t('storagePlain');
  if (option.category === 'controller') return t('controllerPlain');
  if (option.category === 'gpu') return t('gpuPlain');
  if (option.category === 'psu') return t('psuPlain');
  return t('generalPlain');
}

function issueState() {
  const values = stats(state, data);
  const direct = directConflicts(state, data).map(item => ({...item, message: t(item.key === 'gpuMemory' ? 'gpuMemoryTooLow' : item.key)}));
  const findings = activeFindings(state, data).map(item => ({...item, message: ruleText(item)}));
  const missing = [];
  const missingKeys = {cpu: 'missingCPU', memory: 'missingMemory', storage: 'missingStorage', psu: 'missingPSU'};
  for (const required of BASE_REQUIRED) if (!chosen(required)) missing.push(t(missingKeys[required]));
  if (state.model_id === '16913' && !chosen('gpu')) missing.push(t('missingGPU'));
  if (values.raidError) missing.push(t('invalidRaid'));
  const workloadGaps = [];
  if (values.memory < state.requirements.ramGB) workloadGaps.push(t('ramBelow'));
  if (values.cores < state.requirements.cores) workloadGaps.push(t('coresBelow'));
  if (!state.workload.startsWith('ai') && (values.usable == null ? 0 : values.usable / 1000) < state.requirements.storageTB) workloadGaps.push(t('storageBelow'));
  if (state.workload.startsWith('ai') && values.gpuMemory && values.gpuMemory < state.requirements.gpuGB) workloadGaps.push(t('gpuMemoryTooLow'));
  return {
    values,
    direct,
    findings,
    missing,
    unknown: findings.filter(item => item.status === 'unknown'),
    conflicts: findings.filter(item => item.status === 'conflict'),
    required: requiredKits(state, data),
    workloadGaps,
  };
}

function changeQuantity(key, value) {
  withRender(() => {
    const next = Math.round(value);
    if (next < 1 || next > 128) return;
    state[key] = next;
  }, {announce: t('quantityUpdated')});
}

function categoryStatus(cat) {
  const selected = state.selected[cat]?.length;
  const all = data.options.filter(option => option.model_id === state.model_id && option.category === cat);
  const hiddenCurrent = all.some(option => state.selected[cat]?.includes(option.sku) && optionCheck(state, data, option).hidden);
  if (hiddenCurrent) return 'warning';
  if (selected) return 'done';
  if (BASE_REQUIRED.includes(cat) || (cat === 'gpu' && state.model_id === '16913')) return 'required';
  return 'idle';
}

function componentPage(root) {
  const lead = leadBlock(t('partsTitle'), t('partsSub'));
  lead.append(btn(`${t('change')} ${t('step2')}`, () => go(2), 'ghost'));
  root.append(lead);

  const issues = issueState();
  const status = el('section', null, 'status-grid');
  status.append(
    statusCard(t('selectedCategories'), number(Object.keys(state.selected).filter(key => state.selected[key]?.length).length), t('selectedCategoriesHint'), 'good'),
    statusCard(t('missingSelections'), number(issues.missing.length), t('missingSelectionsHint'), issues.missing.length ? 'warning' : 'good'),
    statusCard(t('knownConflictsLabel'), number(issues.direct.length + issues.conflicts.length), t('knownConflictsHint'), issues.direct.length + issues.conflicts.length ? 'danger' : 'good'),
    statusCard(t('unknownChecksLabel'), number(issues.unknown.length), t('unknownChecksHint'), issues.unknown.length ? 'warning' : 'good'),
  );
  root.append(status);

  const meta = el('section', null, 'meta-bar');
  meta.append(
    field(t('chassis'), state.chassis, value => withRender(() => { state.chassis = value; }, {resetList: false}), {type: 'text', options: model().chassis.map(item => [item, item]), hint: t('chassisHint')}),
    field(t('voltage'), state.inputV, value => withRender(() => { state.inputV = value; }, {resetList: false}), {min: 100, max: 277, hint: t('voltageHint')}),
    field(t('thermal'), state.cooling, value => withRender(() => { state.cooling = value; }, {resetList: false}), {type: 'text', options: [['air', t('air')], ['liquid', t('liquid')]], hint: t('thermalHint')}),
  );
  root.append(meta);

  const workspace = el('div', null, 'workspace');
  const nav = el('nav', null, 'category-nav');
  nav.setAttribute('aria-label', t('category'));
  for (const cat of CATEGORIES) {
    const statusKey = categoryStatus(cat);
    const button = el('button', null, `category-link ${category === cat ? 'current' : ''}`.trim());
    button.type = 'button';
    button.append(icon(cat), el('span', t(cat)), tag(t(`categoryState_${statusKey}`), statusKey === 'warning' ? 'amber' : statusKey === 'done' ? 'good' : statusKey === 'required' ? 'outline' : ''));
    if (state.selected[cat]?.length) button.append(el('span', number(state.selected[cat].length), 'count'));
    button.onclick = () => {
      category = cat;
      page = 0;
      query = '';
      render();
    };
    nav.append(button);
  }

  const main = el('div', null, 'component-main');
  const summary = summaryPanel(issues, {mobile: false});
  workspace.append(nav, main, summary);
  root.append(workspace);

  const mobileTrigger = btn(showMobileSummary ? t('hideSummary') : t('showSummary'), () => {
    showMobileSummary = !showMobileSummary;
    render();
  }, 'summary-toggle');
  root.append(mobileTrigger);
  if (showMobileSummary) root.append(summaryPanel(issues, {mobile: true}));

  renderParts(main, issues);
}

function statusCard(label, value, hint, tone) {
  const card = el('article', null, `status-card ${tone}`);
  card.append(el('strong', value), el('span', label), el('small', hint));
  return card;
}

function renderParts(root, issues) {
  root.replaceChildren();
  const top = el('section', null, 'component-top');
  const heading = el('div', null, 'component-head');
  heading.append(el('h2', t(category)), state.selected[category]?.length ? btn(t('remove'), () => withRender(() => { delete state.selected[category]; }, {announce: t('removed')}), 'compact ghost') : document.createTextNode(''));
  top.append(heading, el('p', t(`${category}Help`), 'category-help'));

  const tools = el('div', null, 'component-tools');
  const search = el('input');
  search.className = 'search';
  search.placeholder = t('search');
  search.setAttribute('aria-label', t('search'));
  search.value = query;
  search.oninput = event => {
    query = event.target.value;
    page = 0;
    renderParts(root, issues);
  };
  tools.append(search);

  const quantityKey = {cpu: 'cpuQty', memory: 'memoryQty', storage: 'driveQty', gpu: 'gpuQty', psu: 'psuQty'}[category];
  if (quantityKey) {
    tools.append(field(t('qty'), state[quantityKey], value => changeQuantity(quantityKey, value), {
      max: category === 'cpu' ? 2 : category === 'psu' ? 4 : category === 'gpu' ? 8 : 128,
      hint: t('quantityNote'),
    }));
  }
  top.append(tools);

  if (category === 'storage') {
    top.append(field(t('raid'), state.raid, value => withRender(() => { state.raid = value; }, {resetList: false}), {
      type: 'text',
      options: ['0', '1', '5', '6', '10'].map(level => [level, `RAID ${level}`]),
      hint: t('raidHint'),
    }));
  }
  if (!['cpu', 'memory', 'storage', 'psu'].includes(category) && !(category === 'gpu' && state.model_id === '16913')) {
    top.append(el('p', t('optional'), 'small muted'));
  }
  root.append(top);

  const all = data.options.filter(option => option.model_id === state.model_id && option.category === category);
  const checked = all.map(option => ({option, check: optionCheck(state, data, option)}));
  const visible = checked.filter(({option, check}) => !check.hidden && (!query || `${option.description} ${option.sku}`.toLowerCase().includes(query.toLowerCase())));

  root.append(el('p', `${number(visible.length)} ${t('visibleOptions')} · ${number(checked.filter(item => item.check.hidden).length)} ${t('hiddenCount')}`, 'small muted'));

  const currentBad = checked.filter(({option, check}) => check.hidden && state.selected[category]?.includes(option.sku));
  if (currentBad.length) {
    const note = callout(t('incompatibleSelected'), currentBad.map(item => `${item.option.sku} · ${item.check.reasons.map(reason => t(reason)).join(' · ') || t('knownConflict')}`).join('\n'), 'warning');
    note.append(btn(t('remove'), () => withRender(() => { delete state.selected[category]; }, {announce: t('removed')}), 'compact'));
    root.append(note);
  }

  const list = el('div', null, 'part-list');
  const start = page * PAGE_SIZE;
  for (const {option, check} of visible.slice(start, start + PAGE_SIZE)) {
    const active = state.selected[category]?.includes(option.sku);
    const card = el('article', null, `part-card ${active ? 'selected' : ''}`.trim());
    const content = el('div', null, 'part-content');
    const title = el('div', partTitle(option), 'part-title');
    title.dir = 'ltr';
    content.append(title, bidi(option.sku, 'part-sku'), el('p', helperCopy(option), 'part-copy'));
    const specs = el('div', null, 'part-specs');
    if (option.attributes.tdp_w) specs.append(tag(`${option.attributes.tdp_w} W TDP`));
    if (option.attributes.rank) specs.append(tag(`${option.attributes.rank}R ×${option.attributes.width}`));
    if (option.attributes.mount) specs.append(tag(option.attributes.mount));
    if (option.attributes.protocol) specs.append(tag(option.attributes.protocol));
    specs.append(tag(t('listed'), 'outline'), tag(t('reviewRequired'), 'amber'));
    content.append(specs);

    if (check.requirements.length) content.append(callout(t('needsKit'), t('requirementsHint'), 'warning'));
    if (check.conflicts?.length) content.append(callout(t('knownConflict'), check.conflicts.map(ruleText).join(' · '), 'warning'));

    const actions = el('div', null, 'part-actions');
    if (active && !['cpu', 'memory', 'storage', 'gpu', 'psu'].includes(option.category)) {
      actions.append(field(t('qty'), quantity(state, option), value => withRender(() => {
        state.extraQty ??= {};
        state.extraQty[option.sku] = Math.round(value);
      }, {resetList: false}), {max: 16}));
    }
    actions.append(btn(active ? t('selected') : t('select'), () => selectPart(option), active ? 'dark' : 'primary'));
    actions.append(btn(t('details'), () => showDetails(option), 'secondary compact'));
    card.append(content, actions);
    list.append(card);
  }

  if (!visible.length) {
    const empty = el('div', null, 'empty');
    empty.append(el('h3', t('noOptions')), el('p', t('noOptionsBody')));
    if (category === 'backplane') empty.append(el('p', t('baseCage')));
    list.append(empty);
  }
  root.append(list);

  if (visible.length > PAGE_SIZE) {
    const pager = el('div', null, 'pagination');
    const previous = btn(t('previous'), () => {
      page -= 1;
      renderParts(root, issues);
    }, 'compact');
    previous.disabled = page === 0;
    const next = btn(t('nextPage'), () => {
      page += 1;
      renderParts(root, issues);
    }, 'compact');
    next.disabled = start + PAGE_SIZE >= visible.length;
    pager.append(previous, el('span', `${number(page + 1)} / ${number(Math.ceil(visible.length / PAGE_SIZE))}`, 'small muted'), next);
    root.append(pager);
  }

  root.append(issuePanel(issues), requirementsPanel(issues), callout(t('coverageTitle'), t('coverageNotice'), 'warning'));
  const action = el('div', null, 'bottom-action');
  const index = CATEGORIES.indexOf(category);
  action.append(
    index < CATEGORIES.length - 1
      ? arrowButton(`${t('next')} · ${t(CATEGORIES[index + 1])}`, () => {
        category = CATEGORIES[index + 1];
        query = '';
        page = 0;
        render();
      })
      : arrowButton(t('continueReview'), () => go(4)),
  );
  root.append(action);
}

function selectPart(option) {
  const check = optionCheck(state, data, option);
  if (check.hidden) {
    toast(t('selectionConflict'));
    return;
  }
  const multi = ['riser', 'cooling', 'kits'].includes(option.category);
  withRender(() => {
    if (multi) {
      const existing = state.selected[option.category] || [];
      state.selected[option.category] = existing.includes(option.sku) ? existing : existing.concat(option.sku);
    } else {
      state.selected[option.category] = [option.sku];
    }
  }, {announce: t('added')});
}

function issuePanel(issues) {
  const panel = el('section', null, 'panel');
  panel.append(el('h3', t('outstandingTitle')));
  const groups = [
    [issues.missing.length, t('missingSelections'), issues.missing],
    [issues.direct.length + issues.conflicts.length, t('knownConflictsLabel'), [...issues.direct.map(item => item.message), ...issues.conflicts.map(item => item.message)]],
    [issues.unknown.length, t('unknownChecksLabel'), issues.unknown.map(item => item.message)],
    [issues.workloadGaps.length, t('workloadGapsLabel'), issues.workloadGaps],
  ];
  const list = el('div', null, 'issue-groups');
  for (const [count, label, items] of groups) {
    const card = el('article', null, 'issue-card');
    card.append(el('strong', `${number(count)}`), el('span', label));
    if (items.length) {
      const ul = el('ul', null, 'compact-list');
      for (const item of items.slice(0, 4)) ul.append(el('li', item));
      card.append(ul);
    } else {
      card.append(el('p', t('noneOpen'), 'small muted'));
    }
    list.append(card);
  }
  panel.append(list);
  return panel;
}

function requirementsPanel(issues) {
  const panel = el('section', null, 'panel');
  panel.append(el('h3', t('requirements')));
  if (!issues.required.length) {
    panel.append(el('p', t('noKits'), 'small muted'));
    return panel;
  }
  for (const need of issues.required) {
    const row = el('div', null, 'requirement-row');
    const copy = el('div', null, 'requirement-copy');
    copy.append(
      el('strong', need.any.length > 1 ? t('chooseOne') : t('requiredAccessory')),
      el('p', ruleText(need.rule)),
      el('p', `${t('triggeredBy')}: ${need.rule.domain || t('requirements')}`, 'small muted'),
      el('p', `${t('qty')}: ${number(need.quantity || 1)} · ${need.any.length > 1 ? t('chooseOneBody') : t('allRequiredBody')}`, 'small muted'),
      bidi(need.any.join(' / '), 'part-sku'),
    );
    const actions = el('div', null, 'row wrap');
    for (const sku of need.any) {
      const option = data.options.find(entry => entry.model_id === state.model_id && entry.sku === sku);
      if (option) actions.append(btn(`${t('addKit')} ${sku}`, () => selectPart(option), 'compact'));
    }
    actions.append(btn(t('whyNeeded'), () => showDetails({sku: need.any.join(' / '), description: ruleText(need.rule), attributes: {}, evidence: need.rule.evidence}), 'secondary compact'));
    row.append(copy, actions);
    panel.append(row);
  }
  return panel;
}

function summaryPanel(issues, {mobile}) {
  const values = issues.values;
  const panel = el('aside', null, `summary ${mobile ? 'mobile-drawer' : ''}`.trim());
  const head = el('div', null, 'summary-head');
  head.append(el('p', t('buildSummary'), 'small'), el('div', model().short, 'server-code'), el('small', `${state.chassis} · ${t(state.workload)}`));
  const status = el('div', null, 'summary-status');
  status.append(tag(issues.missing.length ? t('actionNeeded') : t('partialCheck'), issues.missing.length ? 'amber' : 'outline'));
  if (issues.direct.length + issues.conflicts.length) status.append(tag(t('conflict'), 'red'));
  if (issues.unknown.length) status.append(tag(t('unknown'), 'amber'));
  head.append(status);

  const metrics = el('div', null, 'summary-metrics');
  for (const [value, unit, label] of [
    [values.cores, '', t('physicalCores')],
    [values.memory, 'GB', t('installedRAM')],
    [values.usable == null ? '—' : values.usable / 1000, 'TB', t('usableStorage')],
    [values.gpuMemory || '—', 'GB', t('gpuMemory')],
  ]) {
    const metric = el('div', null, 'summary-metric');
    metric.append(el('strong', `${typeof value === 'number' ? number(value) : value} ${unit}`), el('small', label));
    metrics.append(metric);
  }

  const items = el('div', null, 'summary-items');
  for (const cat of ['cpu', 'memory', 'storage', 'gpu', 'psu']) {
    const option = chosen(cat);
    const row = el('div', null, 'summary-item');
    row.append(el('span', t(cat)), option ? bidi(`${quantity(state, option)} × ${option.sku}`, 'summary-code') : el('span', t('notSelected')));
    items.append(row);
  }
  const target = el('div', null, 'progress-block');
  target.append(el('div', `${t('target')}: ${number(state.requirements.ramGB)} GB RAM`, 'target-note'));
  const meter = el('div', null, 'meter');
  const fill = el('i');
  fill.style.width = `${Math.min(100, Math.max(0, (values.memory / Math.max(1, state.requirements.ramGB)) * 100))}%`;
  meter.append(fill);
  target.append(meter);
  items.append(target);

  const footer = el('div', null, 'summary-footer');
  footer.append(el('p', t('localSaveHint'), 'small muted'));
  footer.append(state.step === 4 ? btn(t('editBuild'), () => go(3), 'primary') : arrowButton(t('continueReview'), () => go(4)));
  if (mobile) footer.append(btn(t('hideSummary'), () => { showMobileSummary = false; render(); }, 'ghost'));

  panel.append(head, metrics, items, footer);
  return panel;
}

function reviewPage(root) {
  const issues = issueState();
  const printBrand = el('div', null, 'print-brand');
  printBrand.append(
    el('span', t('brandName'), 'print-brand-mark'),
    (() => {
      const copy = el('span', null, 'print-brand-copy');
      copy.append(el('strong', t('companyName')), el('small', t('printSubtitle')));
      return copy;
    })(),
  );
  root.append(printBrand);
  root.append(leadBlock(t('reviewTitle'), t('reviewSub')));

  const metrics = el('div', null, 'status-grid');
  metrics.append(
    statusCard(t('physicalCores'), number(issues.values.cores), t('coreTarget'), 'good'),
    statusCard(t('installedRAM'), `${number(issues.values.memory)} GB`, t('ramTarget'), 'good'),
    statusCard(t('usableStorage'), issues.values.usable == null ? '—' : `${number(issues.values.usable / 1000)} TB`, t('storageTarget'), 'good'),
    statusCard(t('gpuMemory'), issues.values.gpuMemory ? `${number(issues.values.gpuMemory)} GB` : '—', t('gpuTarget'), 'good'),
  );
  root.append(metrics);

  const grid = el('div', null, 'review-grid');
  const left = el('div', null, 'review-main');
  grid.append(left, summaryPanel(issues, {mobile: false}));

  const readiness = el('section', null, 'panel');
  readiness.append(el('h2', t('readinessTitle')));
  readiness.append(issuePanel(issues));
  left.append(readiness);

  const bom = el('section', null, 'panel');
  bom.append(el('h2', t('bom')), el('p', `${model().name} · ${state.chassis}`, 'muted small'));
  const table = el('table');
  const thead = el('tr');
  [t('category'), t('part'), t('sku'), t('qty')].forEach(text => thead.append(el('th', text)));
  table.append(thead);
  const base = el('tr');
  [t('step2'), model().short, t('baseServer'), '1'].forEach(text => base.append(el('td', text)));
  table.append(base);
  for (const option of selectedOptions(state, data)) {
    const row = el('tr');
    row.append(el('td', t(option.category)), el('td', partTitle(option), 'code'), el('td', option.sku, 'code'), el('td', number(quantity(state, option)), 'qty'));
    table.append(row);
  }
  const scroll = el('div', null, 'table-scroll');
  scroll.append(table);
  bom.append(scroll, el('p', t('noPrice'), 'small muted'));
  left.append(bom);

  const checks = el('section', null, 'panel');
  checks.append(el('h2', t('requirementsCheck')));
  if (!issues.missing.length && !issues.direct.length && !issues.findings.length) {
    checks.append(checkRow(t('passed'), t('reviewSummary'), 'blue'));
  }
  for (const item of issues.missing) checks.append(checkRow(t('unknown'), item, 'amber'));
  for (const item of issues.direct) checks.append(checkRow(t('conflict'), item.message, 'red'));
  for (const item of issues.findings) {
    const row = checkRow(t(item.status === 'conflict' ? 'conflict' : 'unknown'), item.message, item.status === 'conflict' ? 'red' : 'amber');
    row.append(evidence(item.evidence));
    checks.append(row);
  }
  checks.append(checkRow(t('unknown'), t('coverageNotice'), 'amber'));
  left.append(checks, requirementsPanel(issues));

  const fit = el('section', null, 'panel');
  fit.append(el('h2', t('workloadFit')));
  const fitRows = [
    [issues.values.memory, state.requirements.ramGB, t('installedRAM'), 'GB', 'ramBelow'],
    [issues.values.cores, state.requirements.cores, t('physicalCores'), '', 'coresBelow'],
  ];
  if (!state.workload.startsWith('ai')) fitRows.push([issues.values.usable == null ? 0 : issues.values.usable / 1000, state.requirements.storageTB, t('usableStorage'), 'TB', 'storageBelow']);
  else fitRows.push([issues.values.gpuMemory || 0, state.requirements.gpuGB, t('gpuMemory'), 'GB', 'gpuMemoryTooLow']);
  for (const [actual, target, label, unit, key] of fitRows) {
    fit.append(checkRow(actual >= target ? '✓' : t('unknown'), actual >= target ? `${label}: ${number(actual)} ${unit} / ${number(target)} ${unit}`.trim() : t(key), actual >= target ? 'blue' : 'amber'));
  }
  fit.append(callout(t('profileGuidance'), guidance()));
  left.append(fit);

  const notes = el('section', null, 'panel');
  notes.append(el('h2', t('technicalNotes')));
  [t('raidDisclaimer'), t('powerDisclaimer'), t('memorySpeedNote'), t('reviewSummary')].forEach(text => notes.append(el('p', text, 'small muted')));
  left.append(notes);

  const output = el('section', null, 'panel');
  output.append(el('h2', t('output')));
  const buttons = el('div', null, 'row wrap');
  buttons.append(btn(t('downloadBOM'), exportCSV, 'primary'), btn(t('downloadJSON'), exportJSON, 'secondary'), btn(t('print'), () => window.print(), 'secondary'), btn(t('whatsapp'), shareWhatsApp, 'secondary'));
  output.append(buttons, el('p', t('whatsappNote'), 'small muted'));
  left.append(output);

  root.append(grid);
}

function checkRow(label, text, color) {
  const row = el('div', null, 'check-row');
  row.append(tag(label, color), document.createTextNode(text));
  return row;
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], {type}));
  const anchor = el('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(t('exported'));
}

function exportPayload() {
  const issues = issueState();
  return {
    configuration: state,
    catalog_version: data.version,
    status: 'technical_review_required',
    calculations: stats(state, data),
    unresolved: {
      missing: issues.missing,
      direct_conflicts: issues.direct.map(item => item.message),
      findings: issues.findings.map(item => ({id: item.id, status: item.status, message: item.message, evidence: item.evidence})),
      required_accessories: issues.required.map(item => ({options: item.any, quantity: item.quantity, message: ruleText(item.rule)})),
      workload_gaps: issues.workloadGaps,
    },
    coverage: data.coverage,
  };
}

function exportJSON() {
  download(`ARIA-${model().short.replaceAll(' ', '-')}.json`, JSON.stringify(exportPayload(), null, 2), 'application/json');
}

function shareWhatsApp() {
  const issues = issueState();
  const unresolved = issues.missing.length + issues.direct.length + issues.findings.length;
  const text = [
    `${t('brandName')} · ${t('companyName')}`,
    `${t('step2')}: ${model().short}`,
    `${t('workloadTitle')}: ${t(state.workload)}`,
    `${t('output')}: ${unresolved ? `${unresolved} ${t('unknown')}` : t('passed')}`,
    'https://staging.aria-man.com/',
  ].join('\n');
  window.open(`https://wa.me/989123624305?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
}

function exportCSV() {
  const safe = value => {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const rows = [
    [t('category'), t('part'), t('sku'), t('qty'), t('assurance')],
    [t('step2'), model().name, 'CHASSIS SKU TO BE VERIFIED', 1, t('reviewRequired')],
    ...selectedOptions(state, data).map(option => [t(option.category), partTitle(option), option.sku, quantity(state, option), t('reviewRequired')]),
  ];
  download('ARIA-HPE-BOM.csv', `\ufeff${rows.map(row => row.map(safe).join(',')).join('\r\n')}`, 'text/csv;charset=utf-8');
}

function sanitizeDraft(savedState) {
  const next = {...initial(), advisorMode: savedState?.advisorMode === 'advanced' ? 'advanced' : 'guided'};
  if (!savedState || typeof savedState !== 'object') return next;
  if (typeof savedState.workload === 'string') next.workload = savedState.workload;
  if (savedState.requirements && typeof savedState.requirements === 'object') next.requirements = {...next.requirements, ...savedState.requirements};
  if (Number.isInteger(savedState.step) && savedState.step >= 1 && savedState.step <= 2) next.step = savedState.step;
  return next;
}

function persistState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: STORAGE_VERSION,
      lang,
      category,
      state,
    }));
  } catch {
    // ignore unavailable local storage
  }
}

function clearPersistedState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore unavailable local storage
  }
}

function restoreState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.version !== STORAGE_VERSION) {
      clearPersistedState();
      restoreNotice = 'restoredReset';
      return;
    }
    lang = saved.lang === 'en' ? 'en' : 'fa';
    category = CATEGORIES.includes(saved.category) ? saved.category : 'cpu';
    if (saved.state?.model_id) {
      state = {...validateImport(saved.state, data), advisorMode: saved.state.advisorMode === 'advanced' ? 'advanced' : 'guided'};
      state.step = saved.state.step === 4 ? 4 : 3;
      restoreNotice = 'restoredState';
      return;
    }
    state = sanitizeDraft(saved.state);
    restoreNotice = 'restoredDraft';
  } catch {
    clearPersistedState();
    restoreNotice = 'restoredCorrupt';
  }
}

function render() {
  if (state.step > 2 && !state.model_id) state.step = 1;
  persistState();
  const root = layout();
  if (state.step === 1) workPage(root);
  if (state.step === 2) serversPage(root);
  if (state.step === 3) componentPage(root);
  if (state.step === 4) reviewPage(root);
}

async function start() {
  try {
    const response = await fetch('./catalog.json');
    if (!response.ok) throw new Error('Catalog unavailable');
    data = await response.json();
    restoreState();
    render();
  } catch {
    app.replaceChildren(el('p', t('loadFailed'), 'loading'), btn(t('retry'), start, 'primary'));
  }
}

start();
