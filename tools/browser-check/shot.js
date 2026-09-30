/*
 * Screenshot harness for visual review. Drives the configurator to a named step and stops.
 *
 * Usage (staged into dist/ beside index.html):
 *   ?shot=workload   step 1, guided workload picker
 *   ?shot=servers    step 2, server comparison
 *   ?shot=parts      step 3, component workspace (storage)
 *   ?shot=review     step 4, technical review
 *
 * Pairs with tools/browser-check/stage.mjs --shot to copy it in, and
 * tools/screenshot.mjs to run Chrome and capture the frames.
 */
const shot = new URLSearchParams(location.search).get('shot') || 'workload';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (sel) => document.querySelector(sel);
const all = (sel) => [...document.querySelectorAll(sel)];
const clickText = (sel, needle) => {
  const node = all(sel).find((n) => n.textContent.includes(needle));
  if (node) node.click();
  return Boolean(node);
};

// Start clean so every frame shows the same default state.
try {
  localStorage.clear();
} catch {}

async function waitFor(test, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    if (test()) return true;
    await sleep(120);
  }
  return false;
}

await waitFor(() => q('.stepper'));

if (shot === 'workload') {
  // Step 1 is the landing experience; nothing else to drive.
} else {
  // Step 1 -> pick virtualization (renders rich cards) and continue.
  clickText('.workload-card', 'مجازی');
  await sleep(200);
  clickText('.bottom-action button', '');
  await waitFor(() => q('.server-card'));

  if (shot === 'servers') {
    // Give the comparison a selected build so states are visible.
    const choose = all('.server-card .server-actions button').find((b) => !b.disabled);
    if (choose) choose.click();
    await sleep(500);
  } else {
    const choose = all('.server-card .server-actions button').find((b) => !b.disabled);
    if (choose) choose.click();
    await waitFor(() => q('.category-nav'));

    // Populate a believable build so the summary and status grids have content.
    const pickFirst = async (label) => {
      const nav = all('.category-link').find((b) => b.textContent.includes(label));
      if (!nav) return;
      nav.click();
      await sleep(350);
      const add = all('.part-card .part-actions button').find((b) => !b.disabled);
      if (add) add.click();
      await sleep(250);
    };
    if (shot === 'parts') {
      await pickFirst('پردازنده');
      await pickFirst('حافظه RAM');
      await pickFirst('ذخیره‌سازی');
      // Land on storage so the longest option list is on screen.
      const nav = all('.category-link').find((b) => b.textContent.includes('ذخیره‌سازی'));
      if (nav) nav.click();
      await sleep(500);
    } else {
      await pickFirst('پردازنده');
      await pickFirst('حافظه RAM');
      await pickFirst('ذخیره‌سازی');
      await pickFirst('منبع تغذیه');
      clickText('.summary-footer button', '');
      await waitFor(() => q('.review-grid'));
      await sleep(400);
    }
  }
}

await sleep(300);
document.title = 'SHOT-READY';
const marker = document.createElement('div');
marker.id = 'shot-ready';
marker.style.cssText = 'position:fixed;inset:auto 0 0 0;height:0';
document.body.append(marker);

// Diagnostic: report viewport metrics and any element that overflows the viewport width, so
// horizontal-scroll bugs can be seen from a screenshot run without DevTools.
const vw = document.documentElement.clientWidth;
const offenders = [...document.querySelectorAll('body *')]
  .map((node) => {
    const r = node.getBoundingClientRect();
    return { sel: node.tagName.toLowerCase() + (node.className && typeof node.className === 'string' ? '.' + node.className.trim().split(/\s+/).slice(0, 3).join('.') : ''), w: Math.round(r.width), right: Math.round(r.right), left: Math.round(r.left) };
  })
  .filter((x) => x.w > vw + 1 || x.right > vw + 1 || x.left < -1)
  .slice(0, 25);
const rect = (sel) => {
  const node = document.querySelector(sel);
  if (!node) return null;
  const r = node.getBoundingClientRect();
  return { top: Math.round(r.top), height: Math.round(r.height), width: Math.round(r.width) };
};
// Inspect the category rail: a squeezed label column is a layout failure that a
// screenshot alone can misread.
const rail = document.querySelector('.category-nav');
const link = document.querySelector('.category-link');
const label = link ? link.querySelector('span:nth-child(2)') : null;
const diag = document.createElement('pre');
diag.id = 'shot-diag';
diag.textContent = JSON.stringify({
  shot,
  scrollY: Math.round(window.scrollY),
  clientWidth: vw,
  scrollWidth: document.documentElement.scrollWidth,
  overflowPx: document.documentElement.scrollWidth - vw,
  docHeight: document.documentElement.scrollHeight,
  header: rect('.site-header'),
  hero: rect('.hero'),
  stepper: rect('.stepper'),
  mainContent: rect('#main-content'),
  rail: rail ? { width: Math.round(rail.getBoundingClientRect().width), clientWidth: rail.clientWidth, scrollWidth: rail.scrollWidth } : null,
  railPad: rail ? getComputedStyle(rail).paddingInlineStart : null,
  linkWidth: link ? Math.round(link.getBoundingClientRect().width) : null,
  labelWidth: label ? Math.round(label.getBoundingClientRect().width) : null,
  labelClipped: label ? label.scrollWidth > label.clientWidth + 1 : null,
  labelText: label ? label.textContent : null,
  offenders,
}, null, 1);
document.body.append(diag);
