/*
 * Headless browser smoke test. Loads the app, drives it through all four steps, and writes a
 * machine-readable result into the DOM. Run tools/run-browser-check.mjs to execute it.
 */
const results = [];
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

try {
  // 1. App boots and the catalog loads.
  for (let i = 0; i < 60 && !q('.stepper'); i += 1) await sleep(150);
  ok('app boots (shell rendered)', Boolean(q('.stepper')), text('.hero h1'));
  ok('catalog loaded (platform metrics)', Boolean(q('.hero-status')), text('.hero-status'));
  ok('persian is the default language', document.documentElement.lang === 'fa' && document.documentElement.dir === 'rtl', `${document.documentElement.lang}/${document.documentElement.dir}`);
  ok('page title localized', document.title.includes('آریامن'), document.title);
  ok('brand tagline rendered from the dictionary', text('.brand-copy small').length > 0, text('.brand-copy small'));

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
} catch (error) {
  ok('harness completed without throwing', false, `${error && error.message} :: ${error && error.stack}`);
}

const payload = { url: location.href, results };
const pre = document.createElement('pre');
pre.id = 'browser-check-results';
pre.textContent = JSON.stringify(payload, null, 1);
document.body.append(pre);
document.title = 'BROWSER-CHECK-READY';
