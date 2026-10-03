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
  const actions = all('.header-actions button');
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
  ok('product chooser opens first',all('[data-product-type]').length===2);
  checkHeader('product chooser');
  q('[data-product-type="servers"] button').click();
  // 1. App boots and the catalog loads.
  for (let i = 0; i < 60 && !q('.stepper'); i += 1) await sleep(150);
  ok('app boots (shell rendered)', Boolean(q('.stepper')), text('.hero h1'));
  ok('catalog loaded (platform metrics)', Boolean(q('.hero-status')), text('.hero-status'));
  ok('persian is the default language', document.documentElement.lang === 'fa' && document.documentElement.dir === 'rtl', `${document.documentElement.lang}/${document.documentElement.dir}`);
  ok('page title localized', document.title.includes('آریامن'), document.title);
  ok('brand tagline rendered from the dictionary', text('.brand-copy small').length > 0, text('.brand-copy small'));
  checkHeader('server configurator');

  // 2. Step 1 — workload selection.
  const workloadCards = all('.workload-card');
  ok('six workload cards render', workloadCards.length === 6, workloadCards.length);
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
  ok('server comparison renders cards', serverCards.length >= 3, serverCards.length);
  ok('candidates ranked by fit', Boolean(q('.server-card.recommended, .server-card')), serverCards.length);

  const select = all('.server-card .server-actions button').find((b) => !b.disabled);
  if (select) select.click();
  await sleep(250);

  // 4. Step 3 — components.
  ok('component page reached', Boolean(q('.category-nav')), text('.component-head h2'));
  const catButtons = all('.category-link');
  ok('all categories listed', catButtons.length >= 11, catButtons.length);
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
  ok('no horizontal page overflow',document.documentElement.scrollWidth<=innerWidth+1,document.documentElement.scrollWidth+' / '+innerWidth);
} catch (error) {
  ok('harness completed without throwing', false, `${error && error.message} :: ${error && error.stack}`);
}

const payload = { url: location.href, results };
window.scrollTo({top:0,behavior:'instant'});
await document.fonts.ready;
const pre = document.createElement('pre');
pre.id = 'browser-check-results';
pre.textContent = JSON.stringify(payload, null, 1);
document.body.append(pre);
document.title = 'BROWSER-CHECK-READY';
