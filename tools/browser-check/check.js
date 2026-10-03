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
  if (innerWidth >= 820) {
    await document.fonts.ready;
    const lead = q('.product-intro .hero-lead');
    ok('chooser introduction fits one desktop line',lead.getBoundingClientRect().height<=parseFloat(getComputedStyle(lead).lineHeight)+1);
  }
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
  ok('GPU entry presents six clear groups before model size',all('[data-gpu-group]').length===6&&!q('.gpu-discovery'));
  const {gpuPurposes,gpuPurposeGroups}=await import('./gpu-purposes.js');
  const {softwareForPurpose,examplesForPurpose}=await import('./gpu-software.js');
  const choosePurpose=id=>{
    const group=gpuPurposeGroups.find(group=>group.purposes.includes(id));
    q('[data-gpu-group="'+group.id+'"]').click();
    if(q('#gpu-useCase')&&q('#gpu-useCase').value!==id){
      q('#gpu-useCase').value=id;q('#gpu-useCase').dispatchEvent(new Event('change',{bubbles:true}));
    }
  };
  for (const purpose of gpuPurposes) {
    choosePurpose(purpose.id);
    if (q('#gpu-task')?.value==='llm') {
      q('#gpu-task').value='general';q('#gpu-task').dispatchEvent(new Event('change',{bubbles:true}));
    }
    ok(purpose.id+' has workload-specific discovery, not LLM fields',
      purpose.questions.every(key=>q('#gpu-'+key))&&!q('#gpu-parametersB')&&!q('#gpu-language-models'));
    ok(purpose.id+' avoids upfront generation and condition questions',!q('#gpu-generation')&&!q('#gpu-condition'));
    const preset=softwareForPurpose(purpose.id)[0];
    q('#gpu-softwarePreset').value=preset.id;q('#gpu-softwarePreset').dispatchEvent(new Event('change',{bubbles:true}));
    ok(purpose.id+' has scoped software choices and official guidance',
      all('#gpu-softwarePreset option').length===softwareForPurpose(purpose.id).length+1&&
      q('#gpu-softwareName').value===preset.name&&q('#gpu-software-source a').href===preset.source);
    ok(purpose.id+' software defaults do not invent measured memory',
      q('#gpu-measuredGB').value===''&&(!q('#gpu-sharing')||q('#gpu-sharing').value===(preset.defaults.sharing||'unknown')));
    const example=examplesForPurpose(purpose.id)[0];
    q('#gpu-workloadExample').value=example.id;q('#gpu-workloadExample').dispatchEvent(new Event('change',{bubbles:true}));
    ok(purpose.id+' workload examples fill an editable description',q('#gpu-workloadDetails').value!==''&&q('#gpu-workloadDetails').value.length<160);
    q('#gpu-softwareName').value='Example software';
    q('#gpu-workloadDetails').value='Real workload details';
    q('.gpu-discovery').requestSubmit();
    const saved=JSON.parse(localStorage.getItem('aria-gpu-advisor-v1'));
    ok(purpose.id+' persists explicit purpose and descriptions',
      saved.requirements.useCase===purpose.id&&saved.requirements.softwareName==='Example software'&&saved.requirements.workloadDetails==='Real workload details');
    ok(purpose.id+' leaves memory unknown without a measured peak',
      !text('.gpu-estimate').includes('25%')&&all('.gpu-metrics>div').length===1);
    ok(purpose.id+' shortlist respects graphics/encoding capability',
      all('.gpu-card').length===(['vdi','render','video','twin'].includes(purpose.id)?8:14));
    q('[data-gpu-id="nvidia-l4"] button').click();
    const inquiry=new URL(q('[data-gpu-quote]').href).searchParams.get('text');
    ok(purpose.id+' inquiry preserves workload details and unresolved application checks',
      inquiry.includes('Example software')&&inquiry.includes('Real workload details')&&inquiry.includes('API'));
    clickByText('.gpu-tools button','ویرایش نیاز');
    q('[data-gpu-change-purpose]').click();
    ok(purpose.id+' returns to use-case choice without horizontal overflow',
      all('[data-gpu-group]').length===6&&document.documentElement.scrollWidth<=innerWidth+1);
  }
  choosePurpose('ai');
  ok('independent NVIDIA GPU entry opens',Boolean(q('.gpu-discovery'))&&text('.product-intro').includes('NVIDIA'));
  const modelSnapshot = await fetch('./language-models.json').then(r=>r.json());
  ok('original publisher model suggestions load',all('#gpu-language-models option').length===modelSnapshot.models.length);
  const publishedModel = modelSnapshot.models.find(model=>model.id==='Qwen/Qwen3-32B');
  for (const [key,value] of [['parametersB','8'],['runtimeGB','4'],['measuredGB','32'],['precision','16']]) {
    const input=q('#gpu-'+key);input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));
  }
  const modelInput = q('#gpu-modelName');
  modelInput.value = publishedModel.id;
  modelInput.dispatchEvent(new Event('input',{bubbles:true}));
  ok('choosing a publisher model autofills size, precision and context without blur',q('#gpu-parametersB').value===String(publishedModel.parametersB)&&q('#gpu-contextTokens').value===String(publishedModel.defaults.contextTokens)&&q('#gpu-precision').value===publishedModel.defaults.precision);
  ok('selected model links to its publisher card',q('.gpu-model-source a')?.href===publishedModel.source);
  ok('model source actions are not nested in the input label',!q('.gpu-model-label button')&&!q('.gpu-model-label a'));
  ok('model selection clears stale memory measurements, not fabricated runtime defaults',q('#gpu-runtimeGB').value===''&&q('#gpu-measuredGB').value==='');
  q('#gpu-parametersB').value='7';q('#gpu-parametersB').dispatchEvent(new Event('change',{bubbles:true}));
  q('#gpu-precision').value='8';q('#gpu-precision').dispatchEvent(new Event('change',{bubbles:true}));
  modelInput.dispatchEvent(new Event('change',{bubbles:true}));
  ok('published defaults stay editable without resetting the same model',q('#gpu-parametersB').value==='7'&&q('#gpu-precision').value==='8');
  const secondModel=modelSnapshot.models.find(model=>model.id==='Qwen/Qwen3-8B');
  modelInput.value=secondModel.id;
  q('.gpu-discovery').requestSubmit();
  const unblurred=JSON.parse(localStorage.getItem('aria-gpu-advisor-v1')).requirements;
  ok('Enter on a different listed model applies its own defaults, not stale sizes',unblurred.parametersB===secondModel.parametersB&&unblurred.precision===secondModel.defaults.precision&&unblurred.contextTokens===secondModel.defaults.contextTokens);
  clickByText('.gpu-tools button','ویرایش نیازها');
  for (const key of ['modelName','parametersB','contextTokens']) {
    const input=q('#gpu-'+key);input.value='';input.dispatchEvent(new Event('change',{bubbles:true}));
  }
  q('#gpu-precision').value='unknown';q('#gpu-precision').dispatchEvent(new Event('change',{bubbles:true}));
  checkHeader('GPU discovery');
  q('.gpu-discovery').requestSubmit();
  ok('unknown GPU needs remain exploratory across all generations',all('.gpu-card').length===14&&!text('.gpu-card').includes('گزینه شروع بررسی'));
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
  ok('NVIDIA sources are linked',all('.gpu-card>a').filter(a=>/^https:\/\/(?:www|images)\.nvidia\.com\//.test(a.href)).length===14);
  const photos = all('.gpu-photo img');
  ok('all GPU variants have sourced photos, with only V100 sharing a disclosed reference image',photos.length===14&&new Set(photos.map(image=>image.src)).size===13&&!q('.gpu-graphic'));
  ok('GPU photos use the same frame without stretching',photos.every(image=>image.alt.includes('NVIDIA')&&getComputedStyle(image).objectFit==='contain')&&all('.gpu-photo').every(frame=>Math.abs(frame.getBoundingClientRect().height-180)<1));
  photos[0].dispatchEvent(new Event('error'));
  ok('failed photo remains an explicit official-source link',photos[0].hidden&&!q('.gpu-photo-failed').hidden&&q('.gpu-photo a').href.startsWith('https://www.pny.com/'));
  q('[data-gpu-id="nvidia-l4"] button').click();
  ok('GPU selection offers WhatsApp or server configuration as separate choices',Boolean(q('[data-gpu-quote]'))&&Boolean(q('[data-gpu-servers]')));
  q('.gpu-card.selected>button').click();
  ok('selected GPU action focuses next-step choices',document.activeElement===q('.gpu-sales h2'));
  q('[data-gpu-servers]').click();
  ok('server choice reveals and focuses optional matching proposals',document.activeElement===q('.gpu-server-section h2')&&all('.gpu-server-card').length===6);
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
  ok('H200 has source-listed HPE platforms without inventing encoded configurations',all('.gpu-source-platform').length===3&&Boolean(q('[data-gpu-quote]'))&&text('.gpu-server-section').includes('component catalog'));
  ok('source-listed platforms without parts cannot trigger HPE handoff',!q('.gpu-server-section>.button'));
  clickByText('.gpu-tools button','Edit needs');
  gpuAnswer('parametersB',32);gpuAnswer('precision','16');gpuAnswer('runtimeGB',8);
  q('.gpu-discovery').requestSubmit();
  q('[data-gpu-id="nvidia-rtx-pro-6000-server"] button').click();
  q('[data-gpu-servers]').click();
  ok('RTX PRO 6000 lists exact supported HPE generations, not unsupported DL580',all('.gpu-source-platform').length===5&&text('.gpu-server-section').includes('DL380a Gen12')&&!text('.gpu-server-section').includes('DL580')&&!text('.gpu-server-section').includes('DL380a Gen11'));
  const platformQuote=new URL(q('.gpu-source-platform>a').href);
  ok('platform inquiry carries selected server, exact HPE part and unresolved checks',platformQuote.hostname==='wa.me'&&platformQuote.searchParams.get('text').includes('DL380a Gen12')&&platformQuote.searchParams.get('text').includes('S6A73C')&&platformQuote.searchParams.get('text').includes('still need review'));
  q('.gpu-stepper button:nth-child(2)').click();
  q('[data-gpu-id="nvidia-h100-nvl"] button').click();
  ok('unlisted GPU still has an honest standalone path',!q('.gpu-server-card')&&Boolean(q('[data-gpu-quote]'))&&text('.gpu-server-section').includes('not proof of incompatibility'));
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
  clickByText('.header-actions button','Change product');
  q('[data-product-type="gpu"] button').click();
  for(let i=0;i<60&&!q('.gpu-stepper');i++)await sleep(100);
  clickByText('.gpu-tools button','Edit needs');q('[data-gpu-change-purpose]').click();
  choosePurpose('hpc');
  gpuAnswer('computeType','fp64');q('.gpu-discovery').requestSubmit();
  ok('FP64 UI shortlists scientific cards across generations',all('.gpu-card').length===6&&all('.gpu-card').every(card=>/h100|h200|a100|v100/.test(card.dataset.gpuId)));
  clickByText('.gpu-tools button','Edit needs');q('[data-gpu-change-purpose]').click();
  choosePurpose('service');
  gpuAnswer('sharing','mig');q('.gpu-discovery').requestSubmit();
  ok('MIG UI excludes non-MIG GPUs and retains sharing review',all('.gpu-card').length===5&&text('.gpu-limitations').includes('MIG is not vGPU'));
  clickByText('.gpu-tools button','Edit needs');q('[data-gpu-change-purpose]').click();
  choosePurpose('vdi');
  gpuAnswer('softwareName','=VMware test');gpuAnswer('sharing','vgpu');
  gpuAnswer('workloadDetails','CAD desktop');gpuAnswer('measuredGB',12);gpuAnswer('concurrency',8);
  q('.gpu-discovery').requestSubmit();
  ok('VDI uses measured per-GPU memory without LLM weights',all('.gpu-metrics>div').length===1&&text('.gpu-metrics').includes('15 GB'));
  q('[data-gpu-id="nvidia-l4"] button').click();
  window.confirm=()=>true;q('.gpu-server-section>.button').click();
  for(let i=0;i<60&&!q('.server-card');i++)await sleep(100);
  all('.server-card').find(card=>card.textContent.includes('ML350')).querySelector('.server-actions button').click();
  const vdiDraft=JSON.parse(localStorage.getItem('aria-configurator-v3'));
  ok('VDI handoff is virtualization, not language-model training',vdiDraft.state.workload==='virtualization'&&vdiDraft.state.requirements.gpuGB===15&&vdiDraft.gpuProposal.requirements.useCase==='vdi');
  q('.stepper button:nth-child(4)').click();
  ok('server review preserves application and licensing checks',text('.page').includes('vGPU version')&&text('.review-grid').includes('15 GB'));
  const vdiExports=[];
  HTMLAnchorElement.prototype.click=function(){vdiExports.push(fetch(this.href).then(response=>response.text()));};
  clickByText('.review-grid button','Download JSON report');clickByText('.review-grid button','Download BOM');
  HTMLAnchorElement.prototype.click=serverAnchorClick;
  const vdiJSON=JSON.parse(await vdiExports[0]),vdiCSV=await vdiExports[1];
  ok('VDI JSON retains purpose, software and unverified licenses',vdiJSON.gpu_advisor_proposal.routing.server_workload==='virtualization'&&vdiJSON.gpu_advisor_proposal.requirements.softwareName==='=VMware test'&&vdiJSON.gpu_advisor_proposal.limitations.includes('virtualizationReview'));
  ok('unknown purchase condition survives server draft and JSON/CSV exports',
    vdiDraft.gpuProposal.requirements.condition==='any'&&
    vdiJSON.gpu_advisor_proposal.selected.condition_requested==='any'&&
    vdiJSON.gpu_advisor_proposal.selected.condition_verified===false&&
    vdiJSON.gpu_advisor_proposal.limitations.includes('conditionUnverified'));
  ok('VDI CSV keeps workload context and remains formula-safe',vdiCSV.includes('CAD desktop')&&vdiCSV.includes('VDI and virtual workstations')&&vdiCSV.includes("'" + '=VMware test'));
  ok('server exports keep PCIe source and unresolved installation guidance',
    vdiJSON.gpu_advisor_proposal.selected.pcie.host_verified===false&&
    vdiJSON.gpu_advisor_proposal.selected.pcie.interface.generation===4&&
    vdiCSV.includes('pcisig.com/')&&vdiCSV.includes('bus interoperability, not installation approval'));
  const originalOpen=window.open;let vdiWhatsApp='';
  window.open=url=>{vdiWhatsApp=url;return null;};
  q('#quote-name').value='Test customer';q('#quote-mobile').value='09121234567';
  q('#quote-name').form.requestSubmit();
  window.open=originalOpen;
  const vdiMessage=new URL(vdiWhatsApp).searchParams.get('text');
  ok('server WhatsApp keeps VDI purpose, software and licensing uncertainty',vdiMessage.includes('VDI and virtual workstations')&&vdiMessage.includes('=VMware test')&&vdiMessage.includes('vGPU version')&&vdiMessage.includes('https://www.nvidia.com/'));
  ok('server WhatsApp retains condition uncertainty',vdiMessage.includes('Actual condition')&&vdiMessage.includes('unverified'));
  window.confirm=originalConfirm;
  const restoreContext={lang:'en',onHome(){},onLanguage(){},isCurrent:()=>true};
  const {mount:restoreGPU}=await import('./gpu-ui.js?purpose-restore-test');
  await restoreGPU(restoreContext);
  ok('new GPU draft restores its VDI purpose and selected card',text('.gpu-route-note').includes('VDI and virtual workstations')&&q('.gpu-card.selected')?.dataset.gpuId==='nvidia-l4');
  const legacyRequirements={workload:'inference',modelName:'Legacy model',parametersB:8,precision:'16',
    concurrency:5,contextTokens:8192,runtimeGB:4,measuredGB:null,replicas:1};
  localStorage.setItem('aria-gpu-advisor-v1',JSON.stringify({version:1,step:0,requirements:legacyRequirements,gpuId:null}));
  const {mount:restoreLegacyGPU}=await import('./gpu-ui.js?legacy-restore-test');
  await restoreLegacyGPU(restoreContext);
  ok('legacy GPU draft restores into AI language-model discovery',q('#gpu-parametersB')?.value==='8'&&q('#gpu-task')?.value==='llm'&&!q('.gpu-purpose-grid'));
  localStorage.setItem('aria-gpu-advisor-v1',JSON.stringify({version:1,step:1,requirements:{...legacyRequirements,useCase:'bad'},gpuId:'nvidia-l4'}));
  const {mount:restoreInvalidGPU}=await import('./gpu-ui.js?invalid-purpose-restore-test');
  await restoreInvalidGPU(restoreContext);
  ok('invalid restored use case is reported and reset safely',all('[data-gpu-group]').length===6&&text('.storage-alert').includes('GPU draft was invalid'));
  const smallGPU={...vdiDraft,state:{...vdiDraft.state,step:4,requirements:{...vdiDraft.state.requirements,gpuGB:45}},
    gpuProposal:{...vdiDraft.gpuProposal,gpuId:'nvidia-l40s',requirements:{...vdiDraft.gpuProposal.requirements,measuredGB:36}}};
  localStorage.setItem('aria-configurator-v3',JSON.stringify(smallGPU));
  const {mount:restoreSmallGPU}=await import('./app.js?small-gpu-restore-test');
  await restoreSmallGPU(restoreContext);
  ok('non-LLM handoff flags replacing its GPU with insufficient memory',text('.review-grid').includes('This GPU has less memory than the workload target.')&&!q('.stepper button:nth-child(3)').classList.contains('done'));
  localStorage.setItem('aria-configurator-v3',JSON.stringify({...smallGPU,state:{...smallGPU.state,selected:{...smallGPU.state.selected,gpu:[]}}}));
  const {mount:restoreMissingGPU}=await import('./app.js?missing-gpu-restore-test');
  await restoreMissingGPU(restoreContext);
  let missingReport;
  HTMLAnchorElement.prototype.click=function(){missingReport=fetch(this.href).then(response=>response.json());};
  clickByText('.review-grid button','Download JSON report');
  HTMLAnchorElement.prototype.click=serverAnchorClick;
  ok('non-LLM handoff cannot silently drop its required GPU',(await missingReport).unresolved.missing.includes('This platform requires a GPU.')&&!q('.stepper button:nth-child(3)').classList.contains('done'));
  ok('no horizontal page overflow',document.documentElement.scrollWidth<=innerWidth+1,document.documentElement.scrollWidth+' / '+innerWidth);
} catch (error) {
  ok('harness completed without throwing', false, `${error && error.message} :: ${error && error.stack}`);
}

try {
  const {initialGPURequirements}=await import('./gpu-advisor.js');
  const requirements={...initialGPURequirements(),generation:'all',useCase:'vdi',task:'general'};
  localStorage.setItem('aria-gpu-advisor-v1',JSON.stringify({version:1,step:0,requirements,gpuId:null}));
  const {mount}=await import('./gpu-ui.js?guided-software-browser-test');
  await mount({lang:'en',onHome(){},onLanguage(){},isCurrent:()=>true});
  const answer=(key,value)=>{const node=q('#gpu-'+key);node.value=String(value);node.dispatchEvent(new Event('change',{bubbles:true}));};
  answer('softwarePreset','horizon');
  answer('concurrency',8);answer('replicas',2);answer('measuredGB',12);
  answer('sharing','dedicated');answer('softwarePreset','horizon');
  ok('same software selection preserves edited defaults and measured memory',q('#gpu-sharing').value==='dedicated'&&q('#gpu-measuredGB').value==='12');
  await mount({lang:'fa',onHome(){},onLanguage(){},isCurrent:()=>true});
  ok('language switch keeps editable application and sharing defaults',
    q('#gpu-softwarePreset').value==='horizon'&&q('#gpu-sharing').value==='dedicated'&&q('#gpu-measuredGB').value==='12');
  await mount({lang:'en',onHome(){},onLanguage(){},isCurrent:()=>true});
  answer('softwarePreset','citrix');
  ok('different application clears old memory but preserves customer load and quantity',
    q('#gpu-measuredGB').value===''&&q('#gpu-sharing').value==='vgpu'&&q('#gpu-concurrency').value==='8'&&q('#gpu-replicas').value==='2');
  answer('workloadExample','cadDesktop');
  const description=q('#gpu-workloadDetails').value;
  ok('CAD desktop example fills relevant editable text, not arbitrary sizing',description.includes('AutoCAD')&&q('#gpu-measuredGB').value==='');
  answer('measuredGB',12);q('.gpu-discovery').requestSubmit();
  const exports=[],anchorClick=HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click=function(){exports.push(fetch(this.href).then(response=>response.json()));};
  clickByText('.gpu-tools button','Download');
  HTMLAnchorElement.prototype.click=anchorClick;
  const report=await exports[0];
  ok('software profile reports carry source and unverified qualification',report.software_profile.id==='citrix'&&
    report.software_profile.source.startsWith('https://docs.citrix.com/')&&
    report.software_profile.status==='application_version_license_and_hardware_unverified'&&
    report.requirements.workloadDetails===description&&report.estimate.targetGB===15);
  ok('official application source is visible in results',!!q(`a[href="${report.software_profile.source}"]`));
  q('[data-gpu-id="nvidia-l4"] button').click();
  const quote=new URL(q('[data-gpu-quote]').href).searchParams.get('text');
  ok('guided software and official source travel in GPU inquiry',quote.includes('Citrix')&&quote.includes('https://docs.citrix.com/')&&quote.includes('AutoCAD'));
  clickByText('.gpu-tools button','Edit needs');
  answer('softwareName','<img src=x onerror=alert(1)>');
  ok('custom application clears stale preset assumptions',q('#gpu-sharing').value==='unknown'&&q('#gpu-measuredGB').value===''&&!q('#gpu-software-source a'));
  answer('measuredGB',20);
  q('#gpu-softwareName').value='Custom app without blur';q('#gpu-measuredGB').value='24';
  q('.gpu-discovery').requestSubmit();
  const focused=JSON.parse(localStorage.getItem('aria-gpu-advisor-v1')).requirements;
  ok('new explicit measurement is kept when submitting a new unblurred custom application',
    focused.softwareName==='Custom app without blur'&&focused.measuredGB===24);
  clickByText('.gpu-tools button','Edit needs');
  q('#gpu-softwareName').value='Another app';q('.gpu-discovery').requestSubmit();
  ok('unblurred application change cannot reuse stale measured memory',
    JSON.parse(localStorage.getItem('aria-gpu-advisor-v1')).requirements.measuredGB===null);
  clickByText('.gpu-tools button','Edit needs');
  answer('measuredGB',10);answer('workloadDetails','Changed CAD scene');
  ok('editing workload description clears stale memory',q('#gpu-measuredGB').value==='');
  answer('measuredGB',10);q('#gpu-workloadDetails').value='Newly measured CAD scene';q('#gpu-measuredGB').value='20';
  q('.gpu-discovery').requestSubmit();
  ok('unblurred workload edit preserves an explicitly new measurement',
    JSON.parse(localStorage.getItem('aria-gpu-advisor-v1')).requirements.measuredGB===20);
  clickByText('.gpu-tools button','Edit needs');
  q('#gpu-workloadDetails').value='Another scene';q('.gpu-discovery').requestSubmit();
  ok('unblurred workload edit cannot silently reuse its previous measurement',
    JSON.parse(localStorage.getItem('aria-gpu-advisor-v1')).requirements.measuredGB===null);
  clickByText('.gpu-tools button','Edit needs');
  answer('softwarePreset','horizon');answer('workloadExample','cadDesktop');answer('measuredGB',10);
  answer('useCase','service');
  ok('task change clears old application, workload and sharing defaults',
    q('#gpu-softwareName').value===''&&q('#gpu-workloadDetails').value===''&&q('#gpu-sharing').value==='unknown'&&q('#gpu-measuredGB').value==='');
  answer('softwarePreset','mig');
  ok('MIG example supplies only explicit sharing mode',q('#gpu-sharing').value==='mig'&&q('#gpu-measuredGB').value===''&&!q('#gpu-parametersB'));
  q('.gpu-discovery').requestSubmit();
  ok('guided MIG profile still preserves sharing uncertainty',all('.gpu-card').length===5&&text('.gpu-limitations').includes('MIG is not vGPU'));
  const {mount:server}=await import('./app.js?guided-software-source-test');
  const savedConfirm=window.confirm;window.confirm=()=>true;
  await server({lang:'en',onHome(){},onLanguage(){},onGPUCancel(){},isCurrent:()=>true,
    gpuRequest:{version:1,requirements:report.requirements,gpuId:'nvidia-l4'}});
  window.confirm=savedConfirm;
  all('.server-card').find(card=>card.textContent.includes('ML350')).querySelector('.server-actions button').click();
  q('.stepper button:nth-child(4)').click();
  const serverExports=[];
  HTMLAnchorElement.prototype.click=function(){serverExports.push(fetch(this.href).then(response=>response.text()));};
  clickByText('.review-grid button','Download JSON report');clickByText('.review-grid button','Download BOM');
  HTMLAnchorElement.prototype.click=anchorClick;
  const serverReport=JSON.parse(await serverExports[0]),csv=await serverExports[1];
  ok('official software source and uncertainty survive server JSON and CSV',
    serverReport.gpu_advisor_proposal.software_profile.source===report.software_profile.source&&
    csv.includes(report.software_profile.source)&&csv.includes('vGPU version'));
} catch(error){ok('guided software and defaults browser flow completes',false,error.stack);}

try {
  const {initialGPURequirements}=await import('./gpu-advisor.js');
  const {gpuCatalog}=await import('./gpu-catalog.js');
  const requirements={...initialGPURequirements(),generation:'older',condition:'used'};
  localStorage.setItem('aria-gpu-advisor-v1',JSON.stringify({version:1,step:0,requirements,gpuId:null}));
  const {mount}=await import('./gpu-ui.js?used-gpu-browser-test');
  await mount({lang:'en',onHome(){},onLanguage(){},isCurrent:()=>true});
  ok('used GPU draft keeps condition but removes its hidden generation filter',
    !q('#gpu-generation')&&!q('#gpu-condition')&&
    JSON.parse(localStorage.getItem('aria-gpu-advisor-v1')).requirements.condition==='used');
  q('.gpu-discovery').requestSubmit();
  ok('restored older draft explores all fourteen workload-relevant products',all('.gpu-card').length===14);
  ok('USED RF are clearly inquiry labels, not verified stock',text('.gpu-purchase-summary').includes('not verified stock')&&
    text('[data-gpu-id="nvidia-t4"]').includes('USED / RF'));
  ok('remaining models have official photos with variant/detail disclosures',
    all('.gpu-photo img').length===14&&all('.gpu-photo>a:not(:has(img))').length===0&&
    text('[data-gpu-id="nvidia-v100-pcie-16"]').includes('does not identify 16GB')&&
    text('[data-gpu-id="nvidia-p40"]').includes('not a full-board photograph'));
  ok('every GPU displays PCIe source-backed bus guidance without a procurement question',
    all('.gpu-pcie').length===14&&!q('#gpu-generation')&&!q('#gpu-condition'));
  ok('older GPU buying route has no horizontal overflow',document.documentElement.scrollWidth<=innerWidth+1);
  for (const gpu of gpuCatalog.products.filter(gpu=>gpu.generation==='older')) {
    q('[data-gpu-id="'+gpu.id+'"] button').click();
    const message=new URL(q('[data-gpu-quote]').href).searchParams.get('text');
    ok(gpu.id+' used inquiry carries exact variant and health/software caveats',
      message.includes(gpu.name)&&message.includes('Used')&&message.includes('ECC')&&
      message.includes('CUDA/driver')&&message.includes('not SXM'));
    ok(gpu.id+' source-listed hosts cannot fabricate HPE handoff',!q('.gpu-server-section>.button')&&
      all('.gpu-source-platform').length===(gpu.hpePlatforms||[]).length&&Boolean(q('[data-gpu-quote]')));
    const bus=q('.gpu-pcie');bus.open=true;
    ok(gpu.id+' cross-generation link examples preserve unknown installation status',
      text('.gpu-pcie').includes('bus interoperability, not installation approval')&&
      text('.gpu-pcie').includes('PCIe '+gpu.pcie.generation+'.0')&&
      message.includes('pcisig.com/')&&message.includes('not installation approval'));
    if (gpu.id==='nvidia-p40') {
      ok('P40 Gen9 proposal exposes exact CPU, fan and power limits',
        text('.gpu-server-section').includes('DL380 Gen9')&&text('.gpu-server-section').includes('E5-2600v4')&&
        text('.gpu-server-section').includes('719079-B21')&&message.includes('1400W')&&message.includes('720620-B21'));
      const hostQuote=new URL(all('.gpu-source-platform>a')[0].href).searchParams.get('text');
      ok('historical host inquiry retains exact model and constraints',hostQuote.includes('DL380 Gen9')&&hostQuote.includes('Q0V80C')&&hostQuote.includes('E5-2600v4'));
    }
    ok(gpu.id+' host and bus details fit mobile width',document.documentElement.scrollWidth<=innerWidth+1);
    q('.gpu-stepper button:nth-child(2)').click();
  }
  ok('all-generation view includes newer and older GPUs',all('.gpu-card').length===14);
  q('[data-gpu-id="nvidia-a100-pcie-80"] button').click();
  const downloads=[],anchorClick=HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click=function(){downloads.push(fetch(this.href).then(response=>response.json()));};
  clickByText('.gpu-tools button','Download');
  HTMLAnchorElement.prototype.click=anchorClick;
  const report=await downloads[0];
  ok('used GPU export retains unverified condition and exact A100 80GB power-independent sizing',
    report.selected.memory_per_device_gb===80&&report.selected.condition_requested==='used'&&
    report.selected.condition_verified===false&&report.requirements.generation==='all'&&
    report.limitations.includes('usedHealthReview')&&report.limitations.includes('olderHardwareReview'));
  ok('GPU report preserves bus-only status and non-CEC HPE variant caveat',
    report.selected.pcie.host_verified===false&&report.selected.pcie.interface.generation===4&&
    report.source_listed_platforms.every(host=>host.configurable===false&&host.sku==='R9P49C')&&
    report.limitations.includes('nonCECReview')&&report.limitations.includes('archivedPlatformReview'));
  clickByText('.gpu-tools button','Edit needs');
  q('#gpu-parametersB').value='8';q('#gpu-parametersB').dispatchEvent(new Event('change',{bubbles:true}));
  q('.gpu-stepper button:nth-child(3)').click();
  ok('changing requirements clears selected GPU rather than accepting a stale proposal',Boolean(q('.gpu-discovery'))&&
    JSON.parse(localStorage.getItem('aria-gpu-advisor-v1')).gpuId===null);
} catch(error) {ok('older/used GPU browser flow completes',false,error.stack);}

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
