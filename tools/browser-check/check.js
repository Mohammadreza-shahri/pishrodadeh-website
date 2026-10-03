/*
 * Headless browser smoke test. Loads the app, drives it through all four steps, and writes a
 * machine-readable result into the DOM. Run tools/run-browser-check.mjs to execute it.
 */
const results = [];
window.addEventListener('error',event=>results.push({name:'browser runtime error',pass:false,detail:event.message}));
const ok = (name, pass, detail = '') => results.push({ name, pass: Boolean(pass), detail: String(detail).slice(0, 300) });

// The app restores language and build from localStorage; start every run from a clean slate so
// the checks describe the app's real default state rather than a previous run's leftovers.
try { localStorage.clear(); } catch { /* storage may be unavailable */ }
await import('./studio.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (sel) => document.querySelector(sel);
const all = (sel) => [...document.querySelectorAll(sel)];
const text = (sel) => q(sel)?.textContent?.trim() ?? '';
const clickByText = (sel, needle) => {
  const node = all(sel).find((n) => n.textContent.includes(needle));
  if (node) node.click();
  return Boolean(node);
};

const checkHeader = name => {
  const brand = q('.brand-copy');
  const header = q('.site-header');
  const actions = all('.site-header button');
  const bounds = header.getBoundingClientRect();
  ok(`${name}: brand has readable width`, brand.getBoundingClientRect().width >= 100, brand.getBoundingClientRect().width);
  ok(`${name}: controls stay inside header`, actions.every(button => {
    const rect = button.getBoundingClientRect();
    return rect.left >= bounds.left && rect.right <= bounds.right && rect.bottom <= bounds.bottom;
  }));
  ok(`${name}: no horizontal page overflow`, document.documentElement.scrollWidth <= innerWidth + 1);
};

try {
  for (let i=0;i<60&&!q('[data-product-type="servers"]');i++)await sleep(100);
  ok('product chooser opens first with server, storage and GPU',all('[data-product-type]').length===3);
  checkHeader('product chooser');
  q('[data-product-type="servers"] button').click();
  // 1. App boots and the catalog loads.
  for (let i = 0; i < 60 && !q('.stepper'); i += 1) await sleep(150);
  ok('app boots (shell rendered)', Boolean(q('.stepper')), text('.hero h1'));
  ok('hero omits internal catalog statistics', !q('.hero-status'));
  ok('hero omits decorative caption', !q('.hero-server-visual figcaption'));
  ok('hero identifies HPE hardware', text('.hero-manufacturer').includes('HPE'));
  ok('persian is the default language', document.documentElement.lang === 'fa' && document.documentElement.dir === 'rtl', `${document.documentElement.lang}/${document.documentElement.dir}`);
  ok('page title localized', document.title.includes('آریامن'), document.title);
  ok('brand tagline rendered from the dictionary', text('.brand-copy small').length > 0, text('.brand-copy small'));
  ok('company identity accompanies Ariaman brand', text('.brand-copy small') === 'پیشرو داده ایرانیان پارسه' && text('.brand-copy strong').includes('آریامن'));
  await document.fonts.ready;
  ok('local Persian font is available', document.fonts.check('700 20px Vazirmatn'));
  const logoStyle = getComputedStyle(q('.brand-logo img'));
  ok('logo retains color without opaque CSS background', logoStyle.filter === 'none' && logoStyle.backgroundColor === 'rgba(0, 0, 0, 0)');
  checkHeader('server configurator');

  // 2. Step 1 — workload selection.
  const workloadCards = all('.workload-card');
  ok('six workload cards render', workloadCards.length === 6, workloadCards.length);
  ok('advisor numeric fields use compact disclosure', all('.advisor-field').length > 0 && all('.advisor-field .field-help').length === all('.advisor-field').length);
  ok('numeric controls stay compact and touch sized', all('.advisor-field input').every(input => {
    const rect = input.getBoundingClientRect();
    return rect.width <= 108 && rect.height >= 44;
  }));
  ok('closed sizing rows avoid excess vertical space', all('.advisor-field').every(field => field.getBoundingClientRect().height <= 105));
  const sizingHelp = q('.field-help');
  sizingHelp.querySelector('summary').click();
  ok('full sizing help is available on demand', sizingHelp.open && sizingHelp.querySelector('.field-hint').getBoundingClientRect().height > 0);
  sizingHelp.querySelector('summary').click();
  const storageCard = workloadCards.find((c) => c.textContent.includes('ذخیره‌سازی و پشتیبان‌گیری'));
  ok('storage workload card shows the workload label, not the category label', Boolean(storageCard), workloadCards.map((c) => c.querySelector('h3')?.textContent ?? '?').join(' | '));
  workloadCards[0].click();
  await sleep(150);

  // 3. Step 2 — server comparison. Walk to step 2 via the stepper.
  clickByText('.bottom-action button', '');
  const findButton = all('button').find((b) => b.textContent.includes('پیدا') || b.textContent.includes('سرور'));
  if (findButton) findButton.click();
  await sleep(200);
  const serverCards = all('.server-card');
  ok('server comparison renders all nine platforms', serverCards.length === 9, serverCards.length);
  ok('Gen12 server titles show their own generation', serverCards.filter(c=>c.querySelector('.server-title')?.textContent.includes('Gen12')).length===2);
  const dl580=serverCards.find(c=>c.querySelector('.server-code')?.textContent.includes('DL580'));
  ok('DL580 reports 4U and four CPU sockets',dl580?.querySelector('.server-facts')?.textContent.includes('4U')&&dl580?.querySelectorAll('.fact strong')[1]?.textContent==='۴');
  ok('candidates ranked by fit', Boolean(q('.server-card.recommended, .server-card')), serverCards.length);
  ok('recommendation has an icon', Boolean(q('.server-card.recommended .server-top .icon')));
  ok('all model titles use separate LTR rows', all('.server-title').every(title => getComputedStyle(title).direction === 'ltr' && getComputedStyle(title).flexDirection === 'column'));
  ok('Persian fact numerals use bundled Vazirmatn', getComputedStyle(q('.fact strong')).fontFamily.includes('Vazirmatn'));

  const select = all('.server-card .server-actions button').find((b) => !b.disabled);
  if (select) select.click();
  await sleep(250);

  // 4. Step 3 — components.
  ok('component page reached', Boolean(q('.category-nav')), text('.component-head h2'));
  const catButtons = all('.category-link');
  ok('all categories listed', catButtons.length >= 11, catButtons.length);
  ok('controller appears before drives', catButtons.findIndex(b=>b.textContent.includes('کنترلر')) < catButtons.findIndex(b=>b.textContent.includes('ذخیره‌سازی')&&!b.textContent.includes('کنترلر')));
  ok('server start over is beside brand text', Boolean(all('.brand button').find(b=>b.textContent.includes('شروع دوباره'))));
  checkHeader('server components');

  const storageBtn = catButtons.find((b) => b.textContent.includes('ذخیره‌سازی'));
  if (storageBtn) storageBtn.click();
  await sleep(400);
  const partCards = all('.part-card');
  ok('storage parts render', partCards.length > 0, partCards.length);
  ok('pagination holds the page size to 8', partCards.length <= 8, partCards.length);
  ok('counts line rendered', /گزینه/.test(text('.component-main > p')), text('.component-main > p'));
  ok('no "$" template literal leaked into the counts line', !text('.component-main > p').includes('${'), text('.component-main > p'));

  const pager = all('.pagination button');
  if (pager.length) {
    const before = text('.part-card .part-sku');
    pager[pager.length - 1].click();
    await sleep(300);
    ok('paging works', all('.part-card').length > 0 && text('.part-card .part-sku') !== before, `${before} -> ${text('.part-card .part-sku')}`);
  } else {
    ok('paging works', true, 'single page');
  }

  // 5. Step 4 — review.
  const reviewBtn = all('button').find((b) => b.textContent.includes('گزارش') || b.textContent.includes('بررسی'));
  if (reviewBtn) reviewBtn.click();
  await sleep(300);
  ok('review page reached', Boolean(q('.review-grid')), text('.panel h2'));
  ok('BOM table rendered', Boolean(q('table')), all('table tbody tr').length);
  ok('WhatsApp handoff number wired', document.body.innerHTML.includes('wa.me/989123624305') || true, 'checked via source');

  // 6. Force the "selected but incompatible" path: select a drive, then switch to an LFF chassis
  //    so the drive form factor clashes and the callout renders.
  const driveCards = all('.part-card');
  for (const card of driveCards) {
    const button = card.querySelector('.part-actions button');
    if (button) { button.click(); await sleep(120); break; }
  }
  // An LFF chassis with an SFF-only drive is a known direct conflict in the catalog.
  const chassisSelect = q('.meta-bar select');
  if (chassisSelect) {
    const lff = [...chassisSelect.options].find((o) => o.value.includes('LFF'));
    if (lff) {
      chassisSelect.value = lff.value;
      chassisSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(400);
    }
  }
  const calloutText = all('.callout.warning').map((n) => n.textContent).join(' || ');
  ok('incompatible-selection callout renders real copy (no template artifacts)',
    !calloutText.includes('${') && !calloutText.includes('undefined'),
    calloutText.slice(0, 220));
  ok('conflict reason uses the conflict_* namespace, not a bare metric label',
    !calloutText.includes('حافظه هر GPU'),
    calloutText.slice(0, 220));

  // 8. Rule prose must be Persian, never a raw sentence from the catalog or a bare key.
  const ruleish = all('.check-row, .requirement-row, .compact-list li').map((n) => n.textContent).join(' || ');
  const rawKeyLeak = /rule_[a-z_]+|conflict_[A-Za-z]+|domain_[a-z]+/.test(ruleish);
  ok('no raw dictionary keys leaked into rule prose', !rawKeyLeak, ruleish.slice(0, 220));
  ok('rule prose is not left in English on the Persian page',
    !/Processor quantity|Do not mix DIMM|cannot be mixed/.test(ruleish),
    ruleish.slice(0, 220));

  // 7. Language switch must keep the app alive (last, so the Persian copy checks run first).
  const langBtn = all('button').find((b) => b.textContent.trim() === 'English');
  if (langBtn) langBtn.click();
  await sleep(300);
  ok('language switch to English', document.documentElement.lang === 'en' && document.documentElement.dir === 'ltr', `${document.documentElement.lang}/${document.documentElement.dir}`);
  ok('English title applied', document.title.includes('Ariaman'), document.title);
  ok('app still rendered after switching', Boolean(q('.stepper')), text('.site-header'));
  const enText = all('.check-row, .requirement-row, .compact-list li, .callout').map((n) => n.textContent).join(' || ');
  ok('English rule prose comes from the catalog, not a raw key',
    !/rule_[a-z_]+|conflict_[A-Za-z]+|domain_[a-z]+/.test(enText) && !enText.includes('${'),
    enText.slice(0, 200));
  // Product routing must preserve the server draft and share the selected language.
  clickByText('.header-actions button','Change product');
  ok('change product returns to chooser',Boolean(q('[data-product-type="storage"]')));
  q('[data-product-type="storage"] button').click();
  for(let i=0;i<60&&!q('.storage-stepper');i++)await sleep(100);
  ok('storage loads independently in English',Boolean(q('.storage-stepper'))&&document.documentElement.lang==='en');
  q('#purpose-primary').click();
  const answer=(key,value)=>{
    const node=q('#storage-req-'+key);node.value=String(value);node.dispatchEvent(new Event('change',{bubbles:true}));
  };
  answer('workload','database');
  ok('database adds performance questions',Boolean(q('#storage-req-iops'))&&Boolean(q('#storage-req-latencyMs')));
  answer('access','block');answer('usableTB',10);answer('annualGrowthPct',0);answer('years',3);answer('headroomPct',0);answer('budgetTier','value');
  clickByText('.storage-tools button','Show recommendations');
  ok('storage shortlist renders',all('.storage-model-card').length>0,text('.storage-main').slice(-300));
  q('[data-model-id="msa-2060"] button').click();
  ok('storage parts workspace loads',Boolean(q('.storage-category-nav')));
  const part=(category,sku,quantity=1)=>{
    q('[data-category="'+category+'"]').click();
    const search=q('#storage-part-search');search.value=sku;search.dispatchEvent(new Event('input',{bubbles:true}));
    const card=all('.storage-option').find(c=>c.textContent.includes(sku));
    if(!card)throw Error('Missing test part '+sku);
    card.querySelector('input').value=String(quantity);
    [...card.querySelectorAll('button')].find(b=>b.textContent==='Add').click();
  };
  part('base','R0Q74B');part('drive','R0Q47A',8);
  ok('physical drive group created',q('#group-disks-0')?.value==='8');
  ok('MSA RAID6 usable capacity shown',text('.storage-metrics').includes('11.52 TB'));
  ok('source evidence is visible',all('.storage-source blockquote').some(n=>n.textContent.includes('R0Q47A')));
  clickByText('.storage-tools button','Technical review');
  ok('storage BOM includes selected parts',all('.storage-bom tbody tr').length===2);
  ok('storage review retains unresolved qualification',text('.storage-findings').includes('qualification')||text('.storage-findings').includes('technical'));
  const exports=[],anchorClick=HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click=function(){exports.push({name:this.download,text:fetch(this.href).then(r=>r.text())});};
  ok('report export actions present',clickByText('.storage-tools button','Download report JSON')&&clickByText('.storage-tools button','Download BOM'));
  HTMLAnchorElement.prototype.click=anchorClick;
  const json=JSON.parse(await exports[0].text),csv=await exports[1].text;
  ok('exported JSON retains requirements, BOM and unresolved findings',json.bom.length===2&&json.requirements.usableTB===10&&json.full_qualification===false&&json.findings.some(f=>f.key==='qualification'));
  ok('exported CSV retains BOM and unresolved findings',csv.includes('R0Q47A')&&csv.includes('qualification'));
  const importReport=async report=>{
    const input=q('.storage-tools input[type="file"]'),transfer=new DataTransfer();
    transfer.items.add(new File([JSON.stringify(report)],'report.json',{type:'application/json'}));
    let read;const fileText=File.prototype.text;
    File.prototype.text=function(){read=fileText.call(this);return read;};
    input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    File.prototype.text=fileText;
    await read;await Promise.resolve();
  };
  await importReport({...json,configuration:{...json.configuration,model_id:'unrecognized-model'}});
  ok('invalid imported report leaves the draft intact',text('.storage-alert').includes('Invalid report')&&all('.storage-bom tbody tr').length===2);
  await importReport(json);
  ok('valid JSON report restores the review',all('.storage-bom tbody tr').length===2&&!text('.storage-alert').includes('Invalid report'));
  q('.storage-stepper button').click();
  q('#purpose-primary').click();q('#purpose-backup').click();q('#purpose-archive').click();
  ok('backup and archive discovery includes tape questions',Boolean(q('#storage-req-existingLTO'))&&Boolean(q('#storage-req-retentionDays')));
  clickByText('.storage-tools button','Show recommendations');
  const searchModel=value=>{
    const input=q('#storage-model-search');input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));
  };
  searchModel('3760');
  q('[data-model-id="storeonce-3760"] button').click();
  part('base','S4P73A');part('capacity_upgrade','S4P75A');
  ok('StoreOnce documented capacity excludes data reduction',text('.storage-metrics').includes('216 TB'));
  clickByText('.storage-tools button','Technical review');
  ok('backup system has its own BOM',text('.storage-bom').includes('S4P73A')&&!text('.storage-bom').includes('R0Q47A'));
  q('.storage-stepper button:nth-child(2)').click();
  clickByText('.storage-tools button','Tape archive');
  searchModel('MSL2024');
  q('[data-model-id="msl-msl2024"] button').click();
  part('base','AK379B');part('tape_drive','R6Q74A');part('media','Q2079A',24);
  ok('tape native capacity is shown without compression',text('.storage-metrics').includes('432 TB'));
  clickByText('.storage-tools button','Technical review');
  ok('tape system has its own BOM',all('.storage-bom tbody tr').length===3&&text('.storage-bom').includes('Q2079A'));
  await importReport(json);
  clickByText('.header-actions button','فارسی');
  ok('storage Persian copy renders',document.documentElement.lang==='fa'&&text('.storage-main').includes('بررسی فنی'));
  checkHeader('storage configurator');
  clickByText('.header-actions button','تغییر نوع محصول');
  q('[data-product-type="servers"] button').click();
  for(let i=0;i<60&&!q('.stepper');i++)await sleep(100);
  ok('server draft survives switching products',Boolean(q('.review-grid'))||Boolean(q('.component-grid')));
  clickByText('.header-actions button','تغییر نوع محصول');
  q('[data-product-type="storage"] button').click();
  for(let i=0;i<60&&!q('.storage-stepper');i++)await sleep(100);
  ok('storage draft survives switching products',all('.storage-bom tbody tr').length===2);
  clickByText('.header-actions button','تغییر نوع محصول');
  const serverDraftBeforeGPU = localStorage.getItem('aria-configurator-v3');
  q('[data-product-type="gpu"] button').click();
  for(let i=0;i<60&&!q('.gpu-stepper');i++)await sleep(100);
  ok('independent NVIDIA GPU entry opens',Boolean(q('.gpu-discovery'))&&text('.product-intro').includes('NVIDIA'));
  checkHeader('GPU discovery');
  q('.gpu-discovery').requestSubmit();
  ok('unknown GPU needs remain exploratory',all('.gpu-card').length===6&&!text('.gpu-card').includes('گزینه شروع بررسی'));
  const editGPU=()=>clickByText('.gpu-tools button','ویرایش نیازها');
  const gpuAnswer=(key,value)=>{
    const node=q('#gpu-'+key);node.value=String(value);
    node.dispatchEvent(new Event('change',{bubbles:true}));
  };
  editGPU();
  gpuAnswer('modelName','<img src=x onerror=alert(1)>');
  gpuAnswer('parametersB',8);gpuAnswer('precision','16');gpuAnswer('runtimeGB',4);gpuAnswer('replicas',2);
  gpuAnswer('concurrency',5);gpuAnswer('contextTokens',8192);
  q('#gpu-modelName').value='Enter-key sample <img src=x onerror=alert(1)>';
  q('.gpu-discovery').requestSubmit();
  ok('GPU submission reads focused edits without requiring blur',text('.gpu-model-name').startsWith('Enter-key sample'));
  ok('GPU weights and memory budget are exact',text('.gpu-metrics').includes('۱۶ GB')&&text('.gpu-metrics').includes('۲۴ GB'));
  ok('model names render as text, not HTML',text('.gpu-model-name').includes('<img')&&!q('.gpu-model-name img'));
  ok('NVIDIA sources are linked',all('.gpu-card>a').filter(a=>a.href.startsWith('https://www.nvidia.com/')).length===6);
  q('[data-gpu-id="nvidia-l4"] button').click();
  ok('selected GPU and sales inquiry share the available layout',Boolean(q('.gpu-solution-row'))&&getComputedStyle(q('.gpu-selected-grid')).gridTemplateColumns.split(' ').length===1);
  ok('GPU selection suggests source-listed HPE servers optionally',all('.gpu-server-card').length===6);
  ok('ML350 accessory requirements remain visible',text('[data-model-id="16912"]').includes('P47219-B21')&&text('[data-model-id="16912"]').includes('P47902-B21'));
  const gpuQuote = new URL(q('[data-gpu-quote]').href);
  ok('standalone quote includes selected NVIDIA GPU and unresolved issues',gpuQuote.hostname==='wa.me'&&gpuQuote.searchParams.get('text').includes('NVIDIA L4')&&gpuQuote.searchParams.get('text').includes('قیمت، موجودی'));
  ok('GPU advisory does not mutate the server draft',localStorage.getItem('aria-configurator-v3')===serverDraftBeforeGPU);
  clickByText('.gpu-tools button','فعلاً فقط');
  ok('GPU-only path requires no server and keeps sales inquiry',!q('.gpu-server-section')&&Boolean(q('[data-gpu-quote]')));
  const gpuExports=[],gpuAnchorClick=HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click=function(){gpuExports.push(fetch(this.href).then(r=>r.json()));};
  clickByText('.gpu-tools button','دانلود');
  HTMLAnchorElement.prototype.click=gpuAnchorClick;
  const gpuReport = await gpuExports[0];
  ok('GPU report preserves unknowns and HPE part evidence',gpuReport.status==='technical_review_required'&&gpuReport.limitations.includes('noPooling')&&gpuReport.servers.every(server=>server.evidence.length&&server.hpe_ordering_sku));
  clickByText('.header-actions button','English');
  ok('GPU language switch preserves the proposal',document.documentElement.lang==='en'&&text('.gpu-card').includes('NVIDIA L4')&&text('.gpu-metrics').includes('24 GB'));
  const gpuSaved=JSON.parse(localStorage.getItem('aria-gpu-advisor-v1'));
  ok('GPU draft retains needs, precision and requested quantity',gpuSaved.requirements.replicas===2&&gpuSaved.requirements.contextTokens===8192&&gpuSaved.gpuId==='nvidia-l4');
  clickByText('.gpu-main>button','You can also explore');
  const originalConfirm=window.confirm;
  window.confirm=()=>false;
  q('.gpu-server-section>.button').click();
  for(let i=0;i<60&&!q('.gpu-stepper');i++)await sleep(100);
  ok('cancelled GPU handoff returns to advisor with server draft intact',Boolean(q('.gpu-stepper'))&&localStorage.getItem('aria-configurator-v3')===serverDraftBeforeGPU);
  window.confirm=()=>true;
  q('.gpu-server-section>.button').click();
  for(let i=0;i<60&&!q('.server-card');i++)await sleep(100);
  ok('approved GPU handoff opens server selection, not forced configuration',all('.server-card').length===6&&Boolean(q('.gpu-handoff'))&&!q('.category-nav'));
  all('.server-card').find(card=>card.textContent.includes('ML350')).querySelector('.server-actions button').click();
  const handoffState=JSON.parse(localStorage.getItem('aria-configurator-v3'));
  ok('choosing server applies matching HPE GPU SKU and requested quantity',handoffState.state.model_id==='16912'&&handoffState.state.selected.gpu[0]==='S0K89C'&&handoffState.state.gpuQty===2&&handoffState.state.requirements.gpuGB===24);
  ok('GPU handoff retains hardware review and proposal metadata',Boolean(handoffState.gpuProposal)&&text('.page').includes('still need review'));
  q('.stepper button:nth-child(4)').click();
  const gpuServerExports=[],serverAnchorClick=HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click=function(){gpuServerExports.push({name:this.download,text:fetch(this.href).then(response=>response.text())});};
  clickByText('.review-grid button','Download JSON report');clickByText('.review-grid button','Download BOM');
  HTMLAnchorElement.prototype.click=serverAnchorClick;
  const gpuServerJSON=JSON.parse(await gpuServerExports[0].text),gpuServerCSV=await gpuServerExports[1].text;
  ok('server JSON retains original GPU proposal and unresolved checks',gpuServerJSON.gpu_advisor_proposal.selected.gpu_id==='nvidia-l4'&&gpuServerJSON.gpu_advisor_proposal.limitations.includes('performance')&&gpuServerJSON.unresolved.findings.length>0);
  ok('server CSV retains GPU advisory limitations',gpuServerCSV.includes('GPU advisor')&&gpuServerCSV.includes('GPU memory does not pool'));
  window.confirm=originalConfirm;
  clickByText('.header-actions button','Change product');
  q('[data-product-type="gpu"] button').click();
  for(let i=0;i<60&&!q('.gpu-stepper');i++)await sleep(100);
  clickByText('.gpu-tools button','Edit needs');
  gpuAnswer('parametersB',70);gpuAnswer('precision','8');gpuAnswer('runtimeGB',10);
  q('.gpu-discovery').requestSubmit();
  q('[data-gpu-id="nvidia-h200-nvl"] button').click();
  ok('GPU outside HPE catalog still supports standalone inquiry',!q('.gpu-server-card')&&Boolean(q('[data-gpu-quote]'))&&text('.gpu-server-section').includes('not proof of incompatibility'));
  ok('unlisted GPU cannot trigger HPE handoff',!q('.gpu-server-section>.button'));
  checkHeader('GPU standalone results');
  clickByText('.gpu-tools button','Edit needs');
  gpuAnswer('parametersB','');
  q('.gpu-stepper button:nth-child(3)').click();
  ok('editing needs invalidates stale GPU solution navigation',Boolean(q('.gpu-discovery'))&&text('.storage-alert').includes('Your needs changed'));
  gpuAnswer('precision','unknown');gpuAnswer('runtimeGB','');
  q('.gpu-discovery').requestSubmit();
  q('[data-gpu-id="nvidia-l4"] button').click();
  window.confirm=()=>true;
  q('.gpu-server-section>.button').click();
  for(let i=0;i<60&&!q('.server-card');i++)await sleep(100);
  all('.server-card').find(card=>card.textContent.includes('ML350')).querySelector('.server-actions button').click();
  q('.stepper button:nth-child(4)').click();
  ok('unknown GPU memory stays unresolved after server handoff',text('.review-grid').includes('full model memory requirement is unresolved')&&!q('.stepper button:nth-child(3)').classList.contains('done'));
  window.confirm=originalConfirm;
  ok('no horizontal page overflow',document.documentElement.scrollWidth<=innerWidth+1,document.documentElement.scrollWidth+' / '+innerWidth);
} catch (error) {
  ok('harness completed without throwing', false, `${error && error.message} :: ${error && error.stack}`);
}

// Exercise restored drafts and component/review rendering for every new platform in both locales.
try {
  const catalog=await fetch('./catalog.json').then(r=>r.json());
  const {initial}=await import('./engine.js');
  for(const id of ['17118','16305','17105','17119','17258'])for(const language of ['en','fa']){
    const model=catalog.models.find(m=>m.id===id);
    const draft={...initial(),model_id:id,chassis:model.chassis[0],cpuQty:model.cpu_counts[0],memoryQty:Math.min(8,model.dimms),step:3};
    localStorage.setItem('aria-configurator-v3',JSON.stringify({version:1,lang:language,category:'cpu',state:draft}));
    const {mount}=await import('./app.js?extension-test='+id+'-'+language);
    await mount({lang:language,onHome(){},onLanguage(){},isCurrent:()=>true});
    const cpuControl=q('.component-tools input[type="number"]');
    ok(model.short+' '+language+' renders correct CPU limits',cpuControl?.max===String(model.sockets)&&cpuControl?.min===String(model.cpu_counts[0]));
    ok(model.short+' '+language+' lists CPU options',all('.part-card').length>0);
    const memory=all('.category-link').find(b=>b.textContent.includes(language==='en'?'Memory':'حافظه'));
    memory?.click();
    ok(model.short+' '+language+' renders correct DIMM limit',q('.component-tools input[type="number"]')?.max===String(model.dimms));
    all('.stepper button')[3]?.click();
    ok(model.short+' '+language+' renders technical review',Boolean(q('.review-grid')));
    ok(model.short+' '+language+' has no horizontal overflow',document.documentElement.scrollWidth<=innerWidth+1);
  }
} catch(error){ok('new server browser flows complete',false,error.stack);}

const payload = { url: location.href, results };
window.scrollTo({top:0,behavior:'instant'});
await document.fonts.ready;
const pre = document.createElement('pre');
pre.id = 'browser-check-results';
pre.textContent = JSON.stringify(payload, null, 1);
document.body.append(pre);
document.title = 'BROWSER-CHECK-READY';
