/*
 * i18n integrity guard.
 *
 * `i18n.js` is a plain object literal, so a duplicated key inside a locale is a silent bug: the
 * later definition wins, the earlier string disappears, and an ESM import cannot see it. This
 * guard parses the literal source instead of importing it, so duplicates are caught.
 *
 * Run: node tools/test-i18n.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const source = readFileSync(join(root, 'dist', 'i18n.js'), 'utf8');
const appSource = readFileSync(join(root, 'dist', 'app.js'), 'utf8');
const engineSource = readFileSync(join(root, 'dist', 'engine.js'), 'utf8');
const catalog = JSON.parse(readFileSync(join(root, 'dist', 'catalog.json'), 'utf8'));

const strings = (await import(new URL('../dist/i18n.js', import.meta.url).href)).strings;

const checks = [];
function check(label, condition, detail = '') {
  checks.push({ label, ok: Boolean(condition) });
  console.log(`${condition ? 'PASS' : 'FAIL'} ${label}${condition || !detail ? '' : `\n     ${detail}`}`);
}

/* ------------------------------------------------------------------ *
 * 1. Parse each locale block from source, preserving duplicates
 * ------------------------------------------------------------------ */

function localeBlock(locale) {
  const marker = `\n  ${locale}: {`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`locale block not found: ${locale}`);
  const open = start + marker.length;
  let depth = 1;
  let i = open;
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return source.slice(open, i);
}

/** Returns every `key: 'value'` pair at the top level of a locale body, duplicates included. */
function parseEntries(body) {
  const entries = [];
  const re = /^ {4}([A-Za-z_][\w]*):\s*'((?:[^'\\]|\\.)*)',\s*$/gm;
  for (const match of body.matchAll(re)) entries.push({ key: match[1], value: match[2] });
  return entries;
}

const locales = ['fa', 'en'];
const entries = Object.fromEntries(locales.map((l) => [l, parseEntries(localeBlock(l))]));

for (const locale of locales) {
  const seen = new Map();
  const duplicates = [];
  for (const { key } of entries[locale]) {
    if (seen.has(key)) duplicates.push(key);
    seen.set(key, true);
  }
  check(`${locale}: no duplicated keys in the literal`, duplicates.length === 0, `duplicated: ${[...new Set(duplicates)].join(', ')}`);
}

const keys = Object.fromEntries(locales.map((l) => [l, new Set(entries[l].map((e) => e.key))]));
const missingEn = [...keys.fa].filter((k) => !keys.en.has(k));
const missingFa = [...keys.en].filter((k) => !keys.fa.has(k));
check('Locale key sets are identical', missingEn.length === 0 && missingFa.length === 0, `missing in en: ${missingEn.join(', ')} | missing in fa: ${missingFa.join(', ')}`);
check('Parsed counts match the imported dictionary', entries.fa.length === Object.keys(strings.fa).length && entries.en.length === Object.keys(strings.en).length,
  `parsed fa=${entries.fa.length} import fa=${Object.keys(strings.fa).length}; parsed en=${entries.en.length} import en=${Object.keys(strings.en).length}`);

/* ------------------------------------------------------------------ *
 * 2. No Persian text in the English locale, no blanks
 * ------------------------------------------------------------------ */

const PERSIAN = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
// The language switcher is intentionally written in the *other* language.
const PERSIAN_ALLOWED_IN_EN = new Set(['languageSwitch']);
const persianInEn = entries.en.filter((e) => PERSIAN.test(e.value) && !PERSIAN_ALLOWED_IN_EN.has(e.key)).map((e) => e.key);
check('English locale contains no Persian text', persianInEn.length === 0, persianInEn.join(', '));

const blanks = locales.flatMap((l) => entries[l].filter((e) => e.value.trim() === '').map((e) => `${l}.${e.key}`));
check('No empty string values', blanks.length === 0, blanks.join(', '));

/* ------------------------------------------------------------------ *
 * 3. Every rule suffix has prose in both locales
 * ------------------------------------------------------------------ */

const suffixes = [...new Set(catalog.rules.map((r) => r.id.split(':')[1]))];
const untranslated = suffixes.filter((s) => !keys.fa.has(`rule_${s}`) || !keys.en.has(`rule_${s}`));
check(`All ${suffixes.length} catalog rule suffixes have Persian + English prose`, untranslated.length === 0, `missing: ${untranslated.join(', ')}`);

// A suffix can carry more than one catalog wording (e.g. "requires CPU2" vs "requires two
// processors"), so accept any variant for that suffix rather than one canonical sentence.
const EN_VARIANTS = new Map();
for (const r of catalog.rules) {
  const suffix = r.id.split(':')[1];
  if (!EN_VARIANTS.has(suffix)) EN_VARIANTS.set(suffix, new Set());
  EN_VARIANTS.get(suffix).add(r.message);
}
const mismatched = suffixes.filter((s) => !EN_VARIANTS.get(s).has(strings.en[`rule_${s}`]));
check('English rule prose is a catalog wrapping', mismatched.length === 0,
  mismatched.map((s) => `${s}: "${strings.en[`rule_${s}`]}" not in ${[...EN_VARIANTS.get(s)].join(' | ')}`).join('\n     '));

/* ------------------------------------------------------------------ *
 * 4. Every t('...') key in app.js exists; no hardcoded fa/en ternaries
 * ------------------------------------------------------------------ */

const literalKeys = [...appSource.matchAll(/\bt\('([^']+)'\)/g)].map((m) => m[1]);
const unknownKeys = [...new Set(literalKeys)].filter((k) => !keys.fa.has(k) && !keys.en.has(k));
check('Every literal t(\'...\') key in app.js resolves', unknownKeys.length === 0, unknownKeys.join(', '));

// Direct-conflict reasons are namespaced; keep them in step with the engine.
const conflictKeys = [...engineSource.matchAll(/add\('(\w+)',\s*'\w+'\)/g)].map((m) => m[1]);
const missingConflicts = conflictKeys.filter((k) => !keys.fa.has(`conflict_${k}`) || !keys.en.has(`conflict_${k}`));
check(`All ${conflictKeys.length} engine direct-conflict keys have conflict_* copy`, missingConflicts.length === 0, `missing: ${missingConflicts.join(', ')}`);

const domains = [...new Set(catalog.rules.map((r) => r.domain))];
const missingDomains = domains.filter((d) => !keys.fa.has(`domain_${d}`) || !keys.en.has(`domain_${d}`));
check(`All ${domains.length} rule domains have domain_* copy`, missingDomains.length === 0, `missing: ${missingDomains.join(', ')}`);

// `lang === 'fa' ? 'some string'` is a user-facing string that bypassed the dictionary. Locale
// codes, text direction and the locale code used by the toggle are legitimate and are the only
// allowed forms — everything else must go through t().
const ALLOWED_TERNARIES = new Set(['fa-IR', 'rtl', 'en']);
const occurrences = [...appSource.matchAll(/lang === 'fa' \? ['"]([^'"]*)['"]/g)].map((m) => m[1]);
const hardcoded = occurrences.filter((value) => !ALLOWED_TERNARIES.has(value));
check('No inline lang === \'fa\' ? \'…\' string ternaries remain in app.js', hardcoded.length === 0, `found: ${hardcoded.join(', ')}`);

/* ------------------------------------------------------------------ *
 * 5. Dictionary hygiene: no orphan keys
 * ------------------------------------------------------------------ */

const dynamicPrefixes = ['rule_', 'conflict_', 'domain_', 'profile_', 'categoryState_', 'why_', 'tradeoff_'];
const referenced = new Set([
  ...literalKeys,
  ...dynamicPrefixes.flatMap((p) => [...keys.fa].filter((k) => k.startsWith(p))),
  .../t\(key === 'storage' \? 'workloadStorage'/.test(appSource) ? ['workloadStorage'] : [],
  ...domains.map((d) => d),
  ...['virtualization', 'database', 'business', 'storage', 'ai_inference', 'ai_training'],
  ...catalog.models.map((m) => m.id).length ? [] : [],
]);
// Template-literal lookups (`t(\`${key}Desc\`)`, `t(category)`, `t(state.workload)` …) make a
// strict orphan report noisy, so this is reported as information rather than a failure.
const orphanCandidates = [...keys.fa].filter((k) => !referenced.has(k) && !appSource.includes(`'${k}'`) && !appSource.includes(`\`${k}\``));
console.log(`INFO orphan-looking keys (review manually, template lookups hide some): ${orphanCandidates.length}`);
if (orphanCandidates.length) console.log(`     ${orphanCandidates.join(', ')}`);

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length} i18n checks passed${failed.length ? `, ${failed.length} FAILED` : ''}.`);
if (failed.length) process.exit(1);
