/*
 * Keeps the rule_* translation block in dist/i18n.js in step with dist/catalog.json.
 *
 * English comes from the catalog message. Persian comes from the reviewed table in
 * tools/rule-fa.json, which carries forward the wording that previously shipped inline in
 * app.js. Both locales get the same sorted key set.
 *
 * Usage:
 *   node tools/build-rule-i18n.mjs          # verify (exit 1 on drift)
 *   node tools/build-rule-i18n.mjs --write  # rewrite the rule_* block in both locales
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const catalog = JSON.parse(readFileSync(join(root, 'dist', 'catalog.json'), 'utf8'));
const fa = JSON.parse(readFileSync(join(here, 'rule-fa.json'), 'utf8'));
delete fa._comment;

const I18N = join(root, 'dist', 'i18n.js');

const suffixes = [...new Set(catalog.rules.map((r) => r.id.split(':')[1]))].sort();
const en = new Map();
for (const r of catalog.rules) {
  const suffix = r.id.split(':')[1];
  if (!en.has(suffix)) en.set(suffix, r.message);
}

const missingFa = suffixes.filter((s) => typeof fa[s] !== 'string' || !fa[s]);
const extraFa = Object.keys(fa).filter((s) => !suffixes.includes(s));
if (missingFa.length || extraFa.length) {
  console.error(`tools/rule-fa.json out of step with the catalog.`);
  console.error(`  missing Persian prose: ${missingFa.join(', ') || 'none'}`);
  console.error(`  no such rule suffix : ${extraFa.join(', ') || 'none'}`);
  process.exit(1);
}

const quote = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const lines = (pick) => suffixes.map((s) => `    rule_${s}: ${quote(pick(s))},`).join('\n');
const faBlock = lines((s) => fa[s]);
const enBlock = lines((s) => en.get(s));

if (!process.argv.includes('--write')) {
  const i18n = readFileSync(I18N, 'utf8').replace(/\r\n/g, '\n');
  const hasFa = i18n.includes(faBlock);
  const hasEn = i18n.includes(enBlock);
  console.log(`catalog rule suffixes: ${suffixes.length}`);
  console.log(`Persian rule block current: ${hasFa}`);
  console.log(`English rule block current: ${hasEn}`);
  if (!hasFa || !hasEn) {
    console.error('\nRun: node tools/build-rule-i18n.mjs --write');
    process.exit(1);
  }
  process.exit(0);
}

/**
 * Idempotently installs the canonical rule block into one locale body: replaces the contiguous
 * run of rule_* lines that follows the `ruleNeedsReview` anchor, or inserts one if absent.
 */
function installRuleBlock(source, anchorLine, block) {
  const lines = source.split(/\r?\n/);
  const anchor = lines.findIndex((l) => l.trimStart().startsWith(anchorLine));
  if (anchor < 0) throw new Error(`anchor not found: ${anchorLine}`);
  const isRuleLine = (l) => /^ {4}rule_\w+: /.test(l);
  let end = anchor;
  while (end + 1 < lines.length && isRuleLine(lines[end + 1])) end += 1;
  return [...lines.slice(0, anchor + 1), ...block.split('\n'), ...lines.slice(end + 1)].join('\n');
}

const anchors = ["ruleNeedsReview: 'برای این انتخاب", "ruleNeedsReview: 'The source-backed technical requirement"];
const original = readFileSync(I18N, 'utf8');
const updated = installRuleBlock(installRuleBlock(original, anchors[0], faBlock), anchors[1], enBlock);

if (updated === original) {
  console.log('dist/i18n.js already current; nothing written.');
  process.exit(0);
}
writeFileSync(I18N, updated);
console.log(`Wrote ${suffixes.length * 2} rule_* keys (${suffixes.length} suffixes x fa,en) into dist/i18n.js.`);
