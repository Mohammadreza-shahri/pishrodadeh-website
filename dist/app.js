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
import {normalizeIranMobile} from './quote.js';

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
  node.translate = false;
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
  } else if (state.advisorMode === 'advanced') {
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
  input.name = id || label.toLowerCase().replace(/\s+/g, '-');
  input.autocomplete = 'off';
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
  const focus = focusSnapshot();
  mutator();
  if (resetList) {
    query = '';
    page = 0;
  }
  persistState();
  render();
  restoreFocus(focus);
  if (announce) toast(announce);
}

function focusSnapshot() {
  const active = document.activeElement;
  if (!active || !app.contains(active)) return null;
  const tagName = active.tagName.toLowerCase();
  const peers = [...app.querySelectorAll(tagName)];
  return {
    tagName,
    id: active.id,
    name: active.getAttribute('name'),
    ariaLabel: active.getAttribute('aria-label'),
    text: active.textContent.trim(),
    index: peers.indexOf(active),
  };
}

function restoreFocus(snapshot) {
  if (!snapshot) return;
  let target = snapshot.id ? document.getElementById(snapshot.id) : null;
  if (!target && snapshot.name) target = app.querySelector(`${snapshot.tagName}[name="${CSS.escape(snapshot.name)}"]`);
  if (!target && snapshot.ariaLabel) target = [...app.querySelectorAll(snapshot.tagName)].find(node => node.getAttribute('aria-label') === snapshot.ariaLabel);
  if (!target && snapshot.text) target = [...app.querySelectorAll(snapshot.tagName)].find(node => node.textContent.trim() === snapshot.text);
  if (!target) target = app.querySelectorAll(snapshot.tagName)[snapshot.index];
  target?.focus();
}

function refreshParts(root, issues, selection = null) {
  const focus = focusSnapshot();
  renderParts(root, issues);
  restoreFocus(focus);
  if (selection && document.activeElement?.classList.contains('search')) {
    document.activeElement.setSelectionRange(selection.start, selection.end);
  }
}

function go(step) {
  if (step > 2 && !state.model_id) return;
  if (step === 2 && state.step === 1) state.workloadConfirmed = true;
  state.step = step;
  state.visitedSteps = [...new Set([...(state.visitedSteps || [1]), step])];
  persistState();
  render();
  document.getElementById('main-content')?.focus();
  window.scrollTo({top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
}

function stepComplete(step) {
  if (step === 1) return Boolean((state.workloadConfirmed || state.model_id) && state.workload && state.requirements.ramGB && state.requirements.cores);
  if (step === 2) return Boolean(state.model_id);
  if (step === 3) {
    if (!state.model_id) return false;
    const issues = issueState();
    return !issues.missing.length && !issues.direct.length && !issues.conflicts.length && !issues.unknown.length;
  }
  return false;
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
  details.append(el('summary', `${t('source')} (${number((items || []).length)})`));
  if (!items?.length) details.append(el('p', t('noEvidence'), 'small muted'));
  for (const item of items || []) {
    details.append(
      el('p', `QuickSpecs ${item.qs_id} · ${t('sourceDate')} ${item.version}`, 'small muted'),
      el('div', item.quote, 'evidence'),
    );
    details.lastElementChild.translate = false;
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
  document.body.classList.add('modal-open');
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
  document.body.classList.remove('modal-open');
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
    const coverage = model()?.coverage;
    box.append(
      el('p', t('coverageBody')),
      el('p', `${data.models.length} ${lang === 'fa' ? 'پلتفرم' : 'platforms'} · ${data.rules.length} ${lang === 'fa' ? 'قاعده اجرایی' : 'executable rules'} · ${data.options.length} ${lang === 'fa' ? 'گزینه منبع‌دار' : 'source-linked entries'}`, 'small muted'),
    );
    if (coverage) {
      const groups = el('div', null, 'coverage-groups');
      for (const status of ['partial', 'missing']) {
        const group = el('section');
        group.append(el('strong', t(status === 'partial' ? 'coveragePartial' : 'coverageMissing')));
        const values = Object.entries(coverage).filter(([, value]) => value === status).map(([key]) => key);
        group.append(el('p', values.join(' · '), 'code small'));
        groups.append(group);
      }
      box.append(groups);
    }
    return box;
  };
  renderModal(t('coverageTitle'));
}

function layout() {
  app.replaceChildren();
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  document.title = lang === 'fa' ? 'آریامن | پیکربندی سرور HPE' : 'Ariaman | HPE Server Configurator';

  const shell = el('div', null, 'shell');
  const header = el('header', null, 'site-header');
  const brand = el('div', null, 'brand');
  const logoLink = el('a', null, 'brand-logo');
  logoLink.href = 'https://aria-man.com/';
  logoLink.target = '_blank';
  logoLink.rel = 'noreferrer';
  const logo = document.createElement('img');
  logo.src = './ariaman-logo.png';
  logo.alt = lang === 'fa' ? 'نشان آریامن' : 'Ariaman logo';
  logoLink.append(logo);
  const label = el('div', null, 'brand-copy');
  label.append(el('small', lang === 'fa' ? 'فروشگاه سرور و تجهیزات شبکه' : 'HPE servers & network equipment'), el('strong', t('brand')));
  brand.append(logoLink, label);

  const actions = el('div', null, 'header-actions');
  actions.append(btn(t('coverageDetails'), coverageModal, 'ghost coverage-link'));
  if (state.model_id) actions.append(tag(model().short, 'outline'));
  const language = btn(lang === 'fa' ? 'English' : 'فارسی', () => {
    const focus = focusSnapshot();
    lang = lang === 'fa' ? 'en' : 'fa';
    persistState();
    render();
    restoreFocus(focus);
  }, 'ghost language');
  actions.append(language);
  header.append(brand, actions);

  const intro = el('section', null, 'hero');
  const introCopy = el('div', null, 'hero-copy');
  introCopy.append(el('h1', t('title')), el('p', t('heroLead'), 'hero-lead'));
  intro.append(introCopy);

  const main = el('main');
  main.id = 'main-content';
  main.tabIndex = -1;
  const stepper = el('nav', null, 'stepper');
  stepper.setAttribute('aria-label', lang === 'fa' ? 'مراحل پیکربندی' : 'Configuration steps');
  for (let index = 1; index <= 4; index += 1) {
    const complete = stepComplete(index);
    const visited = state.visitedSteps?.includes(index);
    const stepState = state.step === index ? 'current' : complete ? 'done' : visited ? 'incomplete' : '';
    const button = el('button', null, `step ${stepState}`.trim());
    button.type = 'button';
    button.disabled = index > 2 && !state.model_id;
    if (state.step === index) button.setAttribute('aria-current', 'step');
    button.append(el('span', complete ? '✓' : number(index)), document.createTextNode(t(`step${index}`)));
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

  shell.append(header, intro, stepper, main, footer);
  main.append(content);
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
  const target = {...state.requirements, ...profile.values};
  if (state.workload === 'virtualization') target.ramGB = Math.ceil(target.vms * target.ramPerVM * 1.2);
  const values = [`${number(target.cores)} ${t('coreUnit')}`, `${number(target.ramGB)} GB RAM`];
  values.push(`${number(target.storageTB)} TB ${t('storageTargetShort')}`);
  if (state.workload.startsWith('ai')) values.push(`${number(target.gpuGB)} GB ${t('gpuTargetShort')}`);
  return values.join(' · ');
}

function targetPreview() {
  const preview = el('div', null, 'target-preview');
  const targets = [
    [`${number(state.requirements.cores)} ${t('coreUnit')}`, t('coreTarget')],
    [`${number(state.requirements.ramGB)} GB`, t('ramTarget')],
    [`${number(state.requirements.storageTB)} TB`, t('storageTarget')],
  ];
  if (state.workload.startsWith('ai')) targets.push([`${number(state.requirements.gpuGB)} GB`, t('gpuTarget')]);
  for (const [value, label] of targets) {
    const item = el('div', null, 'target-preview-item');
    item.append(el('strong', value), el('small', label));
    preview.append(item);
  }
  return preview;
}

function workPage(root) {
  const lead = leadBlock(t('workloadTitle'), t('workloadSub'));
  root.append(lead);

  const grid = el('div', null, 'workload-grid');
  for (const key of ['virtualization', 'database', 'business', 'storage', 'ai_inference', 'ai_training']) {
    const card = el('button', null, `workload-card ${state.workload === key ? 'selected' : ''}`.trim());
    card.type = 'button';
    card.setAttribute('aria-pressed', String(state.workload === key));
    const copy = el('div');
    copy.append(el('h3', key === 'storage' ? (lang === 'fa' ? 'ذخیره‌سازی و پشتیبان‌گیری' : 'Storage & backup') : t(key)), el('p', t(`${key}Desc`)));
    card.append(icon(key), copy);
    card.onclick = () => withRender(() => {
      state.workload = key;
      state.workloadConfirmed = true;
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
      card.append(el('strong', t(`profile_${profile.key}`)), el('span', estimateLabel(profile)));
      card.onclick = () => applyProfile(profile);
      profiles.append(card);
    }
    advisor.append(profiles);
  }

  const fields = el(state.advisorMode === 'advanced' ? 'div' : 'div', null, 'advisor-fields');
  const req = state.requirements;
  if (state.advisorMode === 'advanced' && state.workload === 'virtualization') {
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
  if (state.advisorMode === 'advanced') advisor.append(fields);
  else advisor.append(targetPreview());
  advisor.append(field(t('deploymentPreference'), state.deployment || 'any', value => withRender(() => {
    state.deployment = value;
  }, {resetList: false}), {
    type: 'text',
    options: [['any', t('deploymentAny')], ['rack_only', t('deploymentRack')]],
  }));
  const estimateDetails = el('details', null, 'estimate-details');
  estimateDetails.append(el('summary', t('estimateNoteTitle')), el('p', t('estimateNoteBody'), 'small muted'));
  advisor.append(estimateDetails);
  root.append(advisor);

  const bottom = el('div', null, 'bottom-action');
  bottom.append(arrowButton(t('findServers'), () => go(2)));
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

function chassisGraphic(entry) {
  const figure = el('figure', null, `chassis chassis-${entry.id}`);
  figure.setAttribute('aria-label', `${entry.name}: ${entry.id === '16912' ? t('tower') : `${entry.rack_u || (entry.id === '16910' ? 1 : 2)}U`}`);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 320 92');
  svg.setAttribute('role', 'img');
  const title = document.createElementNS(svg.namespaceURI, 'title');
  title.textContent = t('illustrativeChassis');
  svg.append(title);
  const body = document.createElementNS(svg.namespaceURI, 'rect');
  body.setAttribute('x', entry.id === '16912' ? '102' : '12');
  body.setAttribute('y', entry.id === '16912' ? '5' : entry.id === '16910' ? '27' : '14');
  body.setAttribute('width', entry.id === '16912' ? '116' : '296');
  body.setAttribute('height', entry.id === '16912' ? '82' : entry.id === '16910' ? '38' : '64');
  body.setAttribute('rx', '7');
  body.setAttribute('class', 'chassis-body');
  svg.append(body);
  const bays = entry.id === '16912' ? 4 : entry.id === '16913' ? 6 : 8;
  for (let index = 0; index < bays; index += 1) {
    const bay = document.createElementNS(svg.namespaceURI, 'rect');
    const tower = entry.id === '16912';
    bay.setAttribute('x', String((tower ? 114 : 25) + (tower ? index % 2 : index) * (tower ? 45 : 25)));
    bay.setAttribute('y', String((tower ? 18 + Math.floor(index / 2) * 30 : entry.id === '16910' ? 38 : 27)));
    bay.setAttribute('width', tower ? '32' : '17');
    bay.setAttribute('height', tower ? '20' : entry.id === '16910' ? '16' : '34');
    bay.setAttribute('rx', '2');
    bay.setAttribute('class', 'chassis-bay');
    svg.append(bay);
  }
  const vent = document.createElementNS(svg.namespaceURI, 'circle');
  vent.setAttribute('cx', entry.id === '16912' ? '193' : '282');
  vent.setAttribute('cy', '46');
  vent.setAttribute('r', entry.id === '16910' ? '9' : '17');
  vent.setAttribute('class', 'chassis-vent');
  svg.append(vent);
  figure.append(svg, el('figcaption', t('illustrativeOnly')));
  return figure;
}

function serversPage(root) {
  const lead = leadBlock(t('recommendTitle'), t('recommendSub'));
  lead.append(el('p', t('recommendDisclaimer'), 'small muted'));
  root.append(lead);

  const ranked = recommend(data, state.workload, state.requirements, state.deployment || 'any');
  const compare = el('div', null, 'comparison-list');
  for (const [index, entry] of ranked.entries()) {
    const current = state.model_id === entry.id;
    const narrative = serverNarrative(entry);
    const card = el('article', null, `comparison-row ${entry.blockers.length ? 'target-limited' : ''} ${current ? 'selected' : ''}`.trim());
    const top = el('div', null, 'server-top');
    top.append(tag(`${t('step2')} ${number(index + 1)}`, 'outline'));
    top.append(tag(entry.blockers.length ? t('targetExceeds') : t('withinListedLimits'), entry.blockers.length ? 'amber' : 'outline'));
    if (current) top.append(tag(t('selectedServer'), 'good'));
    card.append(top);
    const title = el('div', null, 'server-title');
    title.append(bidi(entry.short.replace(' Gen11', ''), 'server-code'), bidi('HPE ProLiant · Gen11', 'muted small'));
    const capabilities = modelCapabilities(entry);
    const detailsGrid = el('dl', null, 'server-capabilities');
    for (const [label, value] of [
      [t('height'), entry.form_factor === 'tower' ? t('tower') : `${entry.rack_u}U ${t('rack')}`],
      [t('dimms'), `${number(entry.dimms)} · ${number(capabilities.maxMemoryGB)} GB ${t('listedMemoryMax')}`],
      [t('storageTarget'), `${number(state.requirements.storageTB)} TB · ${number(capabilities.largestDriveTB)} TB ${t('largestListedDrive')}`],
      [t('gpuFocus'), capabilities.gpu ? `${number(capabilities.gpuMaxGB)} GB ${t('gpuPerCard')} · ${number(capabilities.riserCount)} ${t('riserOptions')}` : t('noGpuOptionListed')],
      [t('pcieSuitability'), `${number(capabilities.riserCount)} ${t('riserOptions')} · ${t(entry.coverage?.pcie === 'partial' ? 'coveragePartial' : 'coverageMissing')}`],
    ]) {
      const item = el('div', null, 'server-capability');
      item.append(el('dt', label), el('dd', value));
      detailsGrid.append(item);
    }
    const reasons = el('div', null, 'server-reasons');
    reasons.append(el('strong', t('whyRelevant')), el('p', `${t('workloadTargets')}: ${workloadTargetSummary()}`, 'small'));
    reasons.append(renderList(narrative.reasons.slice(0, 1).map(key => t(`why_${key}`))));
    if (entry.blockers.length) {
      reasons.append(el('p', `${t('belowKnownLimits')}: ${entry.blockers.map(key => t(`target_${key}`)).join(' · ')}`, 'target-warning'));
    }
    const more = el('details', null, 'server-details');
    more.append(el('summary', t('tradeoffs')));
    more.append(renderList(narrative.tradeoffs.map(key => t(`tradeoff_${key}`))), evidence(entry.evidence));
    card.append(title, detailsGrid, reasons, more);

    const actions = el('div', null, 'server-actions');
    const choose = btn(current ? t('selectedServer') : t('selectServer'), () => chooseModel(entry), current ? 'dark' : 'primary');
    const source = btn(t('details'), () => {
      modalFactory = () => {
        const box = el('div');
        const modelName = el('h3', entry.name);
        modelName.dir = 'ltr';
        modelName.translate = false;
        box.append(modelName, el('p', t('serverWarning')), callout(t('workloadFit'), t('recommendDisclaimer')));
        box.append(evidence(entry.evidence));
        return box;
      };
      renderModal(entry.short);
    }, 'secondary');
    actions.append(choose, source);
    card.append(actions);
    compare.append(card);
  }

  root.append(compare, btn(t('back'), () => go(1), 'ghost'));
}

function modelCapabilities(entry) {
  const options = data.options.filter(option => option.model_id === entry.id);
  const maxDimmGB = Math.max(0, ...options.filter(option => option.category === 'memory').map(option => option.attributes.capacity_gb || 0));
  const largestDriveGB = Math.max(0, ...options.filter(option => option.category === 'storage').map(option => option.attributes.capacity_gb || 0));
  const gpuOptions = options.filter(option => option.category === 'gpu');
  return {
    maxMemoryGB: maxDimmGB * entry.dimms,
    largestDriveTB: largestDriveGB / 1000,
    gpu: gpuOptions.length > 0,
    gpuMaxGB: Math.max(0, ...gpuOptions.map(option => option.attributes.vram_gb || 0)),
    riserCount: options.filter(option => option.category === 'riser').length,
  };
}

function workloadTargetSummary() {
  const values = [
    `${number(state.requirements.cores)} ${t('coreUnit')}`,
    `${number(state.requirements.ramGB)} GB RAM`,
    `${number(state.requirements.storageTB)} TB ${t('storageTargetShort')}`,
  ];
  if (state.workload.startsWith('ai')) values.push(`${number(state.requirements.gpuGB)} GB ${t('gpuTargetShort')}`);
  return values.join(' · ');
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
      visitedSteps: [...new Set([...(state.visitedSteps || [1]), 2, 3])],
    };
    category = 'cpu';
    showMobileSummary = false;
  }, {announce: t('modelChanged')});
  window.scrollTo({top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
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
  const missingActions = [];
  const missingKeys = {cpu: 'missingCPU', memory: 'missingMemory', storage: 'missingStorage', psu: 'missingPSU'};
  for (const required of BASE_REQUIRED) if (!chosen(required)) {
    missing.push(t(missingKeys[required]));
    missingActions.push(required);
  }
  if (state.model_id === '16913' && !chosen('gpu')) {
    missing.push(t('missingGPU'));
    missingActions.push('gpu');
  }
  if (values.raidError) {
    missing.push(t('invalidRaid'));
    missingActions.push('storage');
  }
  const workloadGaps = [];
  if (chosen('memory') && values.memory < state.requirements.ramGB) workloadGaps.push(t('ramBelow'));
  if (chosen('cpu') && values.cores < state.requirements.cores) workloadGaps.push(t('coresBelow'));
  if (chosen('storage') && values.usable != null && values.usable / 1000 < state.requirements.storageTB) workloadGaps.push(t('storageBelow'));
  if (state.workload.startsWith('ai') && chosen('gpu') && values.gpuMemory < state.requirements.gpuGB) workloadGaps.push(t('gpuMemoryTooLow'));
  return {
    values,
    direct,
    findings,
    missing,
    unknown: findings.filter(item => item.status === 'unknown'),
    conflicts: findings.filter(item => item.status === 'conflict'),
    required: requiredKits(state, data),
    workloadGaps,
    missingActions: [...new Set(missingActions)],
  };
}

function changeQuantity(key, value) {
  withRender(() => {
    const next = Math.round(value);
    if (next < 1 || next > 128) return;
    state[key] = next;
  }, {announce: t('quantityUpdated')});
}

function categoryStatus(cat, issues) {
  const selected = state.selected[cat]?.length;
  const all = data.options.filter(option => option.model_id === state.model_id && option.category === cat);
  const hiddenCurrent = all.some(option => state.selected[cat]?.includes(option.sku) && optionCheck(state, data, option).hidden);
  const needsCategory = requiredOptions(issues).some(option => option.category === cat);
  const hasIssue = issues.direct.some(item => item.category === cat)
    || issues.unknown.some(item => item.domain === cat)
    || issues.conflicts.some(item => item.domain === cat && !issues.required.some(need => need.rule.id === item.id));
  if (hiddenCurrent || hasIssue) return 'warning';
  if (needsCategory) return 'requiredForBuild';
  if (selected) return 'done';
  if (BASE_REQUIRED.includes(cat) || (cat === 'gpu' && state.model_id === '16913')) return 'required';
  return 'idle';
}

function requiredOptions(issues) {
  return issues.required.flatMap(need => need.any.map(sku => data.options.find(option => option.model_id === state.model_id && option.sku === sku)).filter(Boolean));
}

function componentPage(root) {
  const lead = leadBlock(t('partsTitle'), t('partsSub'));
  lead.append(btn(`${t('change')} ${t('step2')}`, () => go(2), 'ghost'));
  root.append(lead);

  const issues = issueState();
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
    const statusKey = categoryStatus(cat, issues);
    const button = el('button', null, `category-link ${category === cat ? 'current' : ''}`.trim());
    button.type = 'button';
    button.append(icon(cat), el('span', t(cat)), tag(t(`categoryState_${statusKey}`), statusKey === 'warning' ? 'amber' : statusKey === 'done' ? 'good' : ['required', 'requiredForBuild'].includes(statusKey) ? 'outline' : ''));
    if (state.selected[cat]?.length) button.append(el('span', number(state.selected[cat].length), 'count'));
    button.onclick = () => {
      withRender(() => {
        category = cat;
      });
    };
    nav.append(button);
  }

  const main = el('div', null, 'component-main');
  const summary = summaryPanel(issues, {mobile: false});
  workspace.append(nav, main, summary);
  root.append(workspace);

  const mobileTrigger = btn(showMobileSummary ? t('hideSummary') : t('showSummary'), () => {
    withRender(() => {
      showMobileSummary = !showMobileSummary;
    }, {resetList: false});
  }, 'summary-toggle');
  mobileTrigger.setAttribute('aria-expanded', String(showMobileSummary));
  mobileTrigger.setAttribute('aria-controls', 'mobile-summary');
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
  search.name = 'component-search';
  search.autocomplete = 'off';
  search.value = query;
  search.oninput = event => {
    query = event.target.value;
    page = 0;
    refreshParts(root, issues, {start: event.target.selectionStart, end: event.target.selectionEnd});
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
  const requiredSkus = new Set(requiredOptions(issues).map(option => option.sku));
  const checked = all.map(option => {
    const check = optionCheck(state, data, option);
    return {option, check, target: optionTarget(option), required: requiredSkus.has(option.sku)};
  });
  const visible = checked.filter(({option, check}) => !check.hidden && (!query || `${option.description} ${option.sku}`.toLowerCase().includes(query.toLowerCase())));
  visible.sort((a, b) => Number(b.required) - Number(a.required)
    || Number(b.target.meets) - Number(a.target.meets)
    || a.target.distance - b.target.distance);

  root.append(el('p', `${number(visible.length)} ${t('visibleOptions')} · ${number(checked.filter(item => item.check.hidden).length)} ${t('hiddenCount')}`, 'small muted'));

  const currentBad = checked.filter(({option, check}) => check.hidden && state.selected[category]?.includes(option.sku));
  if (currentBad.length) {
    const note = callout(t('incompatibleSelected'), currentBad.map(item => `${item.option.sku} · ${item.check.reasons.map(reason => t(reason)).join(' · ') || t('knownConflict')}`).join('\n'), 'warning');
    note.prepend(tag(t('incompatible'), 'red'));
    note.append(btn(t('remove'), () => withRender(() => { delete state.selected[category]; }, {announce: t('removed')}), 'compact'));
    root.append(note);
  }

  const list = el('div', null, 'part-list');
  const start = page * PAGE_SIZE;
  for (const {option, check, target, required} of visible.slice(start, start + PAGE_SIZE)) {
    const active = state.selected[category]?.includes(option.sku);
    const card = el('article', null, `part-card ${active ? 'selected' : ''}`.trim());
    const content = el('div', null, 'part-content');
    const title = el('div', partTitle(option), 'part-title');
    title.dir = 'ltr';
    title.translate = false;
    content.append(title, bidi(option.sku, 'part-sku'), el('p', helperCopy(option), 'part-copy'));
    const specs = el('div', null, 'part-specs');
    if (option.attributes.tdp_w) specs.append(tag(`${option.attributes.tdp_w} W TDP`));
    if (option.attributes.rank) specs.append(tag(`${option.attributes.rank}R ×${option.attributes.width}`));
    if (option.attributes.mount) specs.append(tag(option.attributes.mount));
    if (option.attributes.protocol) specs.append(tag(option.attributes.protocol));
    const status = partStatus(option, check, active, issues, target);
    specs.append(tag(t(status), status === 'incompatible' ? 'red' : status === 'belowTarget' || status === 'requiresReview' ? 'amber' : status === 'selectedKnownChecks' ? 'good' : 'outline'));
    if (required) specs.append(tag(t('requiredForBuild'), 'amber'));
    content.append(specs);

    if (check.requirements.length) content.append(callout(t('needsKit'), t('requirementsHint'), 'warning'));
    if (check.conflicts?.length) content.append(callout(t('knownConflict'), check.conflicts.map(ruleText).join(' · '), 'warning'));
    if (check.unknowns?.length) {
      const review = el('details', null, 'candidate-review');
      review.append(el('summary', t('reviewRequired')), renderList(check.unknowns.map(ruleText)));
      content.append(review);
    }

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
      refreshParts(root, issues);
    }, 'compact');
    previous.disabled = page === 0;
    const next = btn(t('nextPage'), () => {
      page += 1;
      refreshParts(root, issues);
    }, 'compact');
    next.disabled = start + PAGE_SIZE >= visible.length;
    pager.append(previous, el('span', `${number(page + 1)} / ${number(Math.ceil(visible.length / PAGE_SIZE))}`, 'small muted'), next);
    root.append(pager);
  }

  root.append(issuePanel(issues), requirementsPanel(issues));
  const action = el('div', null, 'bottom-action');
  const index = CATEGORIES.indexOf(category);
  action.append(
    index < CATEGORIES.length - 1
      ? arrowButton(`${t('next')} · ${t(CATEGORIES[index + 1])}`, () => {
        withRender(() => {
          category = CATEGORIES[index + 1];
        });
      })
      : arrowButton(t('continueReview'), () => go(4)),
  );
  root.append(action);
}

function optionTarget(option) {
  const category = option.category;
  const target = category === 'cpu' ? state.requirements.cores
    : category === 'memory' ? state.requirements.ramGB
      : category === 'storage' ? state.requirements.storageTB
        : category === 'gpu' ? state.requirements.gpuGB : null;
  if (target == null) return {applicable: false, meets: true, distance: 0};
  const trial = structuredClone(state);
  trial.selected[category] = [option.sku];
  const values = stats(trial, data);
  const achieved = category === 'cpu' ? values.cores
    : category === 'memory' ? values.memory
      : category === 'storage' ? values.usable == null ? values.raw / 1000 : values.usable / 1000
        : values.gpuMemory;
  return {
    applicable: true,
    meets: achieved >= target,
    distance: achieved >= target ? achieved - target : target - achieved + target,
  };
}

function partStatus(option, check, active, issues, target) {
  if (check.hidden) return 'incompatible';
  if (active) {
    if (issues.direct.some(item => item.category === option.category)) return 'incompatible';
    const categoryNeeds = issues.required.some(item => item.rule.domain === option.category);
    if (categoryNeeds || issues.unknown.some(item => item.domain === option.category) || check.requirements.length || check.unknowns?.length) return 'requiresReview';
    if (issues.conflicts.some(item => item.domain === option.category)) return 'incompatible';
    return 'selectedKnownChecks';
  }
  if (check.requirements.length || check.conflicts?.length || check.unknowns?.length) return 'requiresReview';
  if (target.applicable && !target.meets) return 'belowTarget';
  return 'noKnownConflict';
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
  const requiredIds = new Set(issues.required.map(item => item.rule.id));
  const conflicts = issues.conflicts.filter(item => !requiredIds.has(item.id));
  const missingRequirements = issues.required.map(item => `${ruleText(item.rule)} · ${item.any.join(' / ')}`);
  const requiredActions = issues.required.flatMap(item => item.any.map(sku => data.options.find(option => option.model_id === state.model_id && option.sku === sku)?.category).filter(Boolean));
  const groups = [
    [issues.missing.length, t('missingSelections'), issues.missing, issues.missingActions],
    [missingRequirements.length, t('requiredAccessories'), missingRequirements, requiredActions],
    [issues.direct.length + conflicts.length, t('knownConflictsLabel'), [...issues.direct.map(item => item.message), ...conflicts.map(item => item.message)], [...issues.direct.map(item => item.category), ...conflicts.map(item => item.domain)]],
    [issues.unknown.length, t('unknownChecksLabel'), issues.unknown.map(item => item.message), issues.unknown.map(item => item.domain)],
    [issues.workloadGaps.length, t('advisoriesLabel'), issues.workloadGaps, []],
  ];
  const list = el('div', null, 'issue-groups');
  for (const [count, label, items, actions] of groups) {
    const card = el('article', null, 'issue-card');
    card.append(el('strong', `${number(count)}`), el('span', label));
    if (items.length) {
      const ul = el('ul', null, 'compact-list');
      for (const item of items.slice(0, 4)) ul.append(el('li', item));
      card.append(ul);
    } else {
      card.append(el('p', t('noneOpen'), 'small muted'));
    }
    const validActions = [...new Set(actions)].filter(cat => CATEGORIES.includes(cat));
    if (validActions.length) {
      const links = el('div', null, 'correction-actions');
      for (const cat of validActions.slice(0, 3)) links.append(btn(`${t('fixIn')} ${t(cat)}`, () => {
        category = cat;
        go(3);
      }, 'compact secondary'));
      card.append(links);
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
  if (mobile) panel.id = 'mobile-summary';
  const head = el('div', null, 'summary-head');
  head.append(el('p', t('buildSummary'), 'small'), bidi(model().short, 'server-code'), el('small', `${state.chassis} · ${t(state.workload)}`));
  const status = el('div', null, 'summary-status');
  const requiredIds = new Set(issues.required.map(item => item.rule.id));
  const unresolvedConflicts = issues.conflicts.filter(item => !requiredIds.has(item.id));
  const needsAction = issues.missing.length + issues.direct.length + unresolvedConflicts.length + issues.required.length + issues.unknown.length + issues.workloadGaps.length > 0;
  status.append(tag(needsAction ? t('actionNeeded') : t('partialCheck'), needsAction ? 'amber' : 'outline'));
  if (issues.direct.length + unresolvedConflicts.length) status.append(tag(t('conflict'), 'red'));
  if (issues.unknown.length) status.append(tag(t('unknown'), 'amber'));
  head.append(status);

  const metrics = el('div', null, 'summary-metrics');
  for (const [value, unit, label] of [
    [chosen('cpu') ? values.cores : t('notSelected'), '', t('physicalCores')],
    [chosen('memory') ? values.memory : t('notSelected'), chosen('memory') ? 'GB' : '', t('installedRAM')],
    [chosen('storage') ? values.usable == null ? t('unknownValue') : values.usable / 1000 : t('notSelected'), chosen('storage') && values.usable != null ? 'TB' : '', t('usableStorage')],
    [chosen('gpu') ? values.gpuMemory : state.workload.startsWith('ai') || state.model_id === '16913' ? t('notSelected') : t('notApplicable'), chosen('gpu') ? 'GB' : '', t('gpuMemory')],
  ]) {
    const metric = el('div', null, 'summary-metric');
    metric.append(el('strong', `${typeof value === 'number' ? number(value) : value} ${unit}`), el('small', label));
    metrics.append(metric);
  }

  const items = el('div', null, 'summary-items');
  for (const cat of ['cpu', 'memory', 'storage', 'gpu', 'psu']) {
    const option = chosen(cat);
    const row = el('div', null, 'summary-item');
    const value = el('span', null, 'summary-part');
    if (option) {
      value.append(el('strong', `${number(quantity(state, option))} × ${partTitle(option)}`), bidi(option.sku, 'summary-code'));
    } else {
      value.append(el('span', cat === 'gpu' && !state.workload.startsWith('ai') && state.model_id !== '16913' ? t('notApplicable') : t('notSelected')));
    }
    row.append(el('span', t(cat)), value);
    items.append(row);
  }
  const targets = [
    [t('physicalCores'), values.cores, state.requirements.cores, chosen('cpu')],
    [t('installedRAM'), values.memory, state.requirements.ramGB, chosen('memory'), 'GB'],
    [t('usableStorage'), values.usable == null ? null : values.usable / 1000, state.requirements.storageTB, chosen('storage'), 'TB'],
  ];
  if (state.workload.startsWith('ai') || state.model_id === '16913') {
    targets.push([t('gpuMemory'), values.gpuMemory, state.requirements.gpuGB, chosen('gpu'), 'GB']);
  }
  const target = el('div', null, 'summary-targets');
  for (const [label, actual, goal, selected, unit = ''] of targets) {
    const row = el('div', null, 'summary-target-row');
    row.append(
      el('span', label),
      el('strong', selected && actual != null ? `${number(actual)} / ${number(goal)} ${unit}`.trim() : `${t('notSelected')} / ${number(goal)} ${unit}`.trim()),
    );
    target.append(row);
  }
  items.append(target);

  const footer = el('div', null, 'summary-footer');
  footer.append(el('p', t('localSaveHint'), 'small muted'));
  footer.append(state.step === 4 ? btn(t('editBuild'), () => go(3), 'primary') : arrowButton(t('continueReview'), () => go(4)));
  if (mobile) footer.append(btn(t('hideSummary'), () => withRender(() => { showMobileSummary = false; }, {resetList: false}), 'ghost'));

  panel.append(head, metrics, items, footer);
  return panel;
}

function reviewPage(root) {
  const issues = issueState();
  const requiredIds = new Set(issues.required.map(item => item.rule.id));
  const openConflicts = issues.conflicts.filter(item => !requiredIds.has(item.id));
  const openCount = issues.missing.length + issues.direct.length + openConflicts.length + issues.required.length + issues.unknown.length + issues.workloadGaps.length + 1;
  const reportStatus = callout(openCount ? t('actionNeeded') : t('noOpenButLimited'), openCount ? `${number(openCount)} ${t('outstandingSummary')}` : t('withinLimitsNote'), openCount ? 'warning' : 'info');
  reportStatus.classList.add('report-status');
  root.append(reportStatus);
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

  root.append(decisionSummary(issues));
  const unknownChassis = callout(t('unknownChassisSku'), t('chassisSkuQuoteNotice'), 'warning');
  unknownChassis.classList.add('chassis-sku-warning');
  root.append(unknownChassis);

  const readiness = el('section', null, 'panel');
  readiness.append(el('h2', t('readinessTitle')), compactOpenItems(issues));
  root.append(readiness);

  const bom = el('section', null, 'panel');
  bom.append(el('h2', t('bom')), el('p', `${model().name} · ${state.chassis}`, 'muted small'));
  const table = el('table');
  const thead = document.createElement('thead');
  const headRow = el('tr');
  [t('category'), t('part'), t('sku'), t('qty')].forEach(text => {
    const cell = el('th', text);
    cell.scope = 'col';
    headRow.append(cell);
  });
  thead.append(headRow);
  const tbody = document.createElement('tbody');
  const base = el('tr');
  [t('step2'), model().name, t('unknownChassisSku'), number(1)].forEach(text => base.append(el('td', text)));
  tbody.append(base);
  for (const option of selectedOptions(state, data)) {
    const row = el('tr');
    const skuCell = el('td');
    skuCell.append(bidi(option.sku, 'code'));
    row.append(el('td', t(option.category)), el('td', partTitle(option)), skuCell, el('td', number(quantity(state, option)), 'qty'));
    tbody.append(row);
  }
  table.append(thead, tbody);
  const scroll = el('div', null, 'table-scroll');
  scroll.append(table);
  bom.append(scroll, el('p', t('noPrice'), 'small muted'));
  root.append(bom);

  const checks = el('details', null, 'panel report-details');
  checks.append(el('summary', t('structuredChecks')));
  if (!issues.direct.length && !issues.findings.length) checks.append(checkRow(t('noneOpen'), t('noStructuredFindings'), 'blue'));
  for (const item of issues.direct) checks.append(checkRow(t('conflict'), item.message, 'red'));
  for (const item of issues.findings.filter(finding => !requiredIds.has(finding.id))) {
    const row = checkRow(t(item.status === 'conflict' ? 'conflict' : 'unknown'), item.message, item.status === 'conflict' ? 'red' : 'amber');
    row.append(evidence(item.evidence));
    checks.append(row);
  }
  checks.append(el('p', t('coverageNotice'), 'small muted'));
  root.append(checks, requirementsPanel(issues));

  const notes = el('details', null, 'panel report-details');
  notes.append(el('summary', t('technicalNotes')));
  [t('raidDisclaimer'), t('powerDisclaimer'), t('memorySpeedNote'), t('reviewSummary')].forEach(text => notes.append(el('p', text, 'small muted')));
  notes.append(el('p', guidance(), 'small muted'));
  root.append(notes);

  const output = el('section', null, 'panel');
  output.append(el('h2', t('output')));
  const buttons = el('div', null, 'row wrap');
  buttons.append(btn(t('downloadBOM'), exportCSV, 'secondary'), btn(t('downloadJSON'), exportJSON, 'secondary'), btn(t('print'), () => window.print(), 'secondary'));
  output.append(buttons, quotationForm());
  root.append(output);
}

function decisionSummary(issues) {
  const panel = el('section', null, 'panel decision-summary');
  panel.append(
    el('h2', t('decisionSummary')),
    el('p', `${t('chassisSelection')}: ${model().short} · ${state.chassis}`, 'small muted chassis-selection'),
  );
  const rows = [
    [t('physicalCores'), issues.values.cores, state.requirements.cores, Boolean(chosen('cpu')), ''],
    [t('installedRAM'), issues.values.memory, state.requirements.ramGB, Boolean(chosen('memory')), 'GB'],
    [t('usableStorage'), issues.values.usable == null ? null : issues.values.usable / 1000, state.requirements.storageTB, Boolean(chosen('storage')), 'TB'],
  ];
  if (state.workload.startsWith('ai') || state.model_id === '16913') {
    rows.push([t('gpuMemory'), issues.values.gpuMemory, state.requirements.gpuGB, Boolean(chosen('gpu')), 'GB']);
  }
  const table = el('table');
  const head = document.createElement('thead');
  const header = el('tr');
  [t('category'), t('target'), t('achieved'), t('requirementsCheck')].forEach(label => {
    const cell = el('th', label);
    cell.scope = 'col';
    header.append(cell);
  });
  head.append(header);
  const body = document.createElement('tbody');
  for (const [label, actual, target, selected, unit] of rows) {
    const row = el('tr');
    const within = selected && actual != null && actual >= target;
    const status = !selected ? t('notSelected') : actual == null ? t('unknownValue') : within ? t('meetsTarget') : t('belowTarget');
    row.append(
      el('th', label),
      el('td', `${number(target)} ${unit}`.trim()),
      el('td', selected && actual != null ? `${number(actual)} ${unit}`.trim() : t('notSelected')),
      el('td', status),
    );
    body.append(row);
  }
  table.append(head, body);
  const scroll = el('div', null, 'table-scroll');
  scroll.append(table);
  panel.append(scroll);
  return panel;
}

function compactOpenItems(issues) {
  const requiredIds = new Set(issues.required.map(item => item.rule.id));
  const groups = [
    [t('missingSelections'), issues.missing],
    [t('requiredAccessories'), issues.required.map(item => `${ruleText(item.rule)} · ${item.any.join(' / ')}`)],
    [t('knownConflictsLabel'), [...issues.direct.map(item => item.message), ...issues.conflicts.filter(item => !requiredIds.has(item.id)).map(item => item.message)]],
    [t('unknownChecksLabel'), issues.unknown.map(item => item.message)],
    [t('advisoriesLabel'), issues.workloadGaps],
  ].filter(([, items]) => items.length);
  const list = el('ul', null, 'open-items');
  if (!groups.length) {
    list.append(el('li', t('noStructuredFindings')));
    return list;
  }
  for (const [label, items] of groups) {
    const item = el('li');
    item.append(el('strong', `${label}: `), document.createTextNode(items.join(' · ')));
    list.append(item);
  }
  return list;
}

function quotationForm() {
  const form = el('form', null, 'quotation-form');
  form.append(el('h3', t('quoteTitle')), el('p', t('quoteIntro'), 'small muted'));
  form.append(el('p', t('quoteDraftReview'), 'quote-save-note'));

  const mobileLabel = el('label', null, 'field');
  mobileLabel.append(el('span', t('quoteMobile'), 'field-label'));
  const mobile = el('input');
  mobile.type = 'tel';
  mobile.name = 'mobile';
  mobile.id = 'quote-mobile';
  mobile.autocomplete = 'tel-national';
  mobile.inputMode = 'tel';
  mobile.required = true;
  mobile.maxLength = 20;
  mobile.placeholder = t('quoteMobilePlaceholder');
  mobile.setAttribute('aria-describedby', 'quote-mobile-hint');
  mobileLabel.append(mobile, el('small', t('quoteMobileHint'), 'field-hint'));
  mobileLabel.lastElementChild.id = 'quote-mobile-hint';

  const nameLabel = el('label', null, 'field');
  nameLabel.append(el('span', t('quoteName'), 'field-label'));
  const name = el('input');
  name.type = 'text';
  name.name = 'name';
  name.id = 'quote-name';
  name.autocomplete = 'name';
  name.required = true;
  name.maxLength = 100;
  nameLabel.append(name);

  const emailLabel = el('label', null, 'field');
  emailLabel.append(el('span', t('quoteEmail'), 'field-label'));
  const email = el('input');
  email.type = 'email';
  email.name = 'email';
  email.id = 'quote-email';
  email.autocomplete = 'email';
  email.maxLength = 254;
  emailLabel.append(email);

  const fields = el('div', null, 'quotation-fields');
  fields.append(mobileLabel, nameLabel, emailLabel);
  form.append(fields, el('p', t('quoteSaveNotice'), 'quote-save-note'));
  const submit = el('button', t('whatsapp'), 'button primary');
  submit.type = 'submit';
  form.append(submit);

  mobile.addEventListener('input', () => mobile.setCustomValidity(''));
  form.addEventListener('submit', event => {
    event.preventDefault();
    const normalizedMobile = normalizeIranMobile(mobile.value);
    if (!normalizedMobile) {
      mobile.setCustomValidity(t('quotePhoneInvalid'));
      mobile.reportValidity();
      return;
    }
    mobile.setCustomValidity('');
    shareWhatsApp({
      name: name.value.trim(),
      mobile: normalizedMobile,
      email: email.value.trim(),
    });
  });
  return form;
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
    limitations: {
      qualification: 'technical_review_required',
      notice: t('coverageNotice'),
      coverage: data.coverage,
    },
    coverage: data.coverage,
  };
}

function exportJSON() {
  download(`ARIA-${model().short.replaceAll(' ', '-')}.json`, JSON.stringify(exportPayload(), null, 2), 'application/json');
}

function shareWhatsApp(contact) {
  const issues = issueState();
  const unresolved = issues.missing.length + issues.direct.length + issues.findings.length;
  const selections = selectedOptions(state, data);
  const text = [
    t('quoteMessageTitle'),
    `${t('quoteName')}: ${contact.name}`,
    `${t('quoteMobile')}: ${contact.mobile}`,
    contact.email ? `${t('quoteEmail')}: ${contact.email}` : null,
    '',
    `${t('step2')}: ${model().short}`,
    `${t('workloadTitle')}: ${t(state.workload)}`,
    `${t('chassis')}: ${state.chassis}`,
    `${t('voltage')}: ${number(state.inputV)} V`,
    `${t('thermal')}: ${t(state.cooling)}`,
    `${t('raid')}: ${state.raid}`,
    `${t('ramTarget')}: ${number(state.requirements.ramGB)} GB`,
    `${t('coreTarget')}: ${number(state.requirements.cores)}`,
    state.requirements.storageTB ? `${t('storageTarget')}: ${number(state.requirements.storageTB)} TB` : null,
    state.workload.startsWith('ai') ? `${t('gpuTarget')}: ${number(state.requirements.gpuGB)} GB` : null,
    selections.length ? t('quoteParts') : t('quoteNoParts'),
    ...selections.map(option => `- ${t(option.category)}: ${partTitle(option)} (${option.sku}) × ${number(quantity(state, option))}`),
    `${t('output')}: ${unresolved ? `${unresolved} ${t('unknown')}` : t('passed')}`,
    t('quoteReviewNotice'),
    window.location.href,
  ].filter(Boolean).join('\n');
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
    [t('step2'), model().name, t('unknownChassisSku'), 1, t('reviewRequired')],
    ...selectedOptions(state, data).map(option => [t(option.category), partTitle(option), option.sku, quantity(state, option), t('reviewRequired')]),
    [],
    [t('limitations'), t('coverageNotice'), '', '', t('reviewRequired')],
  ];
  download('ARIA-HPE-BOM.csv', `\ufeff${rows.map(row => row.map(safe).join(',')).join('\r\n')}`, 'text/csv;charset=utf-8');
}

function sanitizeDraft(savedState) {
  const next = {...initial(), advisorMode: savedState?.advisorMode === 'advanced' ? 'advanced' : 'guided'};
  if (!savedState || typeof savedState !== 'object') return next;
  if (typeof savedState.workload === 'string') next.workload = savedState.workload;
  if (savedState.requirements && typeof savedState.requirements === 'object') next.requirements = {...next.requirements, ...savedState.requirements};
  if (Number.isInteger(savedState.step) && savedState.step >= 1 && savedState.step <= 2) next.step = savedState.step;
  next.workloadConfirmed = savedState.workloadConfirmed === true || next.step === 2;
  const visited = Array.isArray(savedState.visitedSteps)
    ? savedState.visitedSteps.filter(step => Number.isInteger(step) && step >= 1 && step <= 2)
    : [];
  next.visitedSteps = [...new Set([1, ...visited, next.step])];
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
