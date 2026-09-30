/*
 * Undecidable-rule guard.
 *
 * The browser engine deliberately leaves unknown compatibility states visible instead of treating
 * them as passes. Some facts are never populated by `dist/engine.js`, which makes the rules that
 * depend on them permanently undecidable. This test pins that behaviour so the gap can never
 * quietly become a verified pass: if someone starts populating one of these facts, the test fails
 * and forces a deliberate decision about the rules that depend on it.
 *
 * Two distinct situations are covered:
 *   A. the rule can never fire, because its `when` reads a fact that is always null;
 *   B. the rule fires, but its verdict always resolves to `unknown`, because its `assert` reads
 *      such a fact.
 *
 * See docs/verification-report.md ("Known engine limitations carried forward").
 *
 * Run: node tools/test-inert-rules.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const data = JSON.parse(readFileSync(join(root, 'dist', 'catalog.json'), 'utf8'));
const eng = await import(new URL('../dist/engine.js', import.meta.url).href);

/* Facts the engine never populates. Update only with a deliberate engine change. */
const NEVER_POPULATED = [
  'secondary_fh_riser',
  'trimode_controller',
  'sas4_mu',
  'redundant_fans',
  'primary_pcie_cards',
  'secondary_pcie_cards',
  'slots5_10_used',
  'slot2_used',
  'media_box',
  'storage_layout',
  'vroc_nvme',
];

/*
 * Never-firing rules: their `when` reads a fact that is always null, so the rule can never be
 * satisfied. The interface reports them as unknown checks.
 */
const NEVER_FIRES = [
  '16910:fh_blocks_slot2',
  '16912:slots_5_10',
  '16913:cables_balanced_direct',
  '16913:cables_balanced_type_p',
  '16913:cables_balanced_oroc',
  '16913:trimode_backup',
];

/* Firing but undecidable rules: they do fire, but the `assert` reads a fact that is always null,
 * so their verdict is always `unknown`. */
const UNDECIDABLE = [
  '16911:rear_blocks_primary',
  '16911:media_box',
  '16912:vroc_cpu',
];

const checks = [];
function check(label, condition, detail = '') {
  checks.push({ label, ok: Boolean(condition) });
  console.log(`${condition ? 'PASS' : 'FAIL'} ${label}${condition || !detail ? '' : `\n     ${detail}`}`);
}

function fieldsOf(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.op === 'field') out.push(node.path);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((v) => fieldsOf(v, out));
    else if (value && typeof value === 'object') fieldsOf(value, out);
  }
  return out;
}
const bare = (path) => path.replace(/^features\./, '');
const ruleById = new Map(data.rules.map((r) => [r.id, r]));

/* A maximally populated state per model, so nothing is null merely because a selection is missing. */
function saturatedState(model) {
  const selected = {};
  for (const option of data.options) {
    if (option.model_id !== model.id) continue;
    if (['riser', 'cooling', 'kits'].includes(option.category)) (selected[option.category] ||= []).push(option.sku);
    else selected[option.category] ||= [option.sku];
  }
  return {
    ...eng.initial(),
    model_id: model.id,
    chassis: model.chassis[0],
    selected,
    cpuQty: 2, memoryQty: 8, driveQty: 4, gpuQty: 1, psuQty: 2,
    inputV: 230, cooling: 'air', workload: 'ai_inference',
  };
}
const states = data.models.map(saturatedState);

/* ------------------------------------------------------------------ *
 * 1. The facts really are never populated
 * ------------------------------------------------------------------ */

const nullAcrossCorpus = new Set(NEVER_POPULATED);
for (const key of NEVER_POPULATED) {
  for (const state of states) {
    if (eng.facts(state, data).features[key] !== null) nullAcrossCorpus.delete(key);
  }
}
const revived = NEVER_POPULATED.filter((k) => !nullAcrossCorpus.has(k));
check('Documented facts are still never populated', revived.length === 0,
  `now populated: ${revived.join(', ')} — decide whether the rules below should start firing, then update this test and docs/verification-report.md`);

/* ------------------------------------------------------------------ *
 * 2. Every list entry has the structural cause its category claims
 * ------------------------------------------------------------------ */

const wrongCategory = [];
for (const id of [...NEVER_FIRES, ...UNDECIDABLE]) {
  const rule = ruleById.get(id);
  if (!rule) {
    wrongCategory.push(`${id} (missing from catalog)`);
    continue;
  }
  const whenDead = fieldsOf(rule.when).map(bare).filter((f) => NEVER_POPULATED.includes(f));
  const assertDead = fieldsOf(rule.assert).map(bare).filter((f) => NEVER_POPULATED.includes(f));
  if (NEVER_FIRES.includes(id) && whenDead.length === 0) wrongCategory.push(`${id} is not gated by a never-populated fact in \`when\``);
  if (UNDECIDABLE.includes(id) && assertDead.length === 0) wrongCategory.push(`${id} does not read a never-populated fact in \`assert\``);
}
check('Each rule has the structural cause its category claims', wrongCategory.length === 0, wrongCategory.join(' | '));

/* ------------------------------------------------------------------ *
 * 3. A: never-firing rules never fire
 *     A `when` that reads a null fact evaluates to null, not false, so the rule is recorded as
 *     `unknown` rather than omitted. Either outcome is acceptable and visible; what must never
 *     happen is a verdict.
 * ------------------------------------------------------------------ */

const firedAnyway = [];
for (const state of states) {
  const byId = new Map(eng.activeFindings(state, data).map((f) => [f.id, f]));
  for (const id of NEVER_FIRES) {
    if (id.split(':')[0] !== state.model_id) continue;
    const finding = byId.get(id);
    if (finding && finding.status !== 'unknown') firedAnyway.push(`${id} -> ${finding.status}`);
  }
}
check('Never-firing rules never reach a verdict', firedAnyway.length === 0, firedAnyway.join(', '));

/* ------------------------------------------------------------------ *
 * 4. B: undecidable rules never resolve to a verdict
 * ------------------------------------------------------------------ */

const verdicts = [];
const observations = { unknown: 0, notApplicable: 0 };
for (const state of states) {
  const byId = new Map(eng.activeFindings(state, data).map((f) => [f.id, f]));
  for (const id of UNDECIDABLE) {
    if (id.split(':')[0] !== state.model_id) continue;
    const finding = byId.get(id);
    if (!finding) observations.notApplicable += 1;
    else if (finding.status === 'unknown') observations.unknown += 1;
    else verdicts.push(`${id} -> ${finding.status}`);
  }
}
check('Undecidable rules never resolve to a verdict', verdicts.length === 0, verdicts.join(', '));
console.log(`INFO undecidable rule observations: ${observations.unknown} reported unknown, ${observations.notApplicable} not applicable for that build.`);

/* ------------------------------------------------------------------ *
 * 5. No option is ever hidden, and no conflict claimed, on an unknown state
 * ------------------------------------------------------------------ */

const hiddenOnUnknown = [];
const conflictOnDeadField = [];
for (const state of states) {
  for (const option of data.options) {
    if (option.model_id !== state.model_id) continue;
    const result = eng.optionCheck(state, data, option);
    if (result.hidden) {
      const unknownDriven = (result.conflicts || []).filter((r) => r.status === 'unknown');
      if (unknownDriven.length) hiddenOnUnknown.push(`${unknownDriven[0].id} -> ${option.sku}`);
    }
    for (const rule of result.requirements || []) {
      const dead = fieldsOf(rule.assert).map(bare).filter((f) => NEVER_POPULATED.includes(f));
      if (dead.length) conflictOnDeadField.push(`${rule.id} -> ${option.sku}`);
    }
  }
}
check('No option is hidden on the strength of an unknown state alone', hiddenOnUnknown.length === 0,
  `examples: ${[...new Set(hiddenOnUnknown)].slice(0, 5).join(', ')}`);
check('No requirement is raised from an assert that reads a never-populated fact', conflictOnDeadField.length === 0,
  `examples: ${[...new Set(conflictOnDeadField)].slice(0, 5).join(', ')}`);

/* ------------------------------------------------------------------ *
 * 6. The documentation keeps naming the gap
 * ------------------------------------------------------------------ */

const doc = readFileSync(join(root, 'docs', 'verification-report.md'), 'utf8');
const undocumented = NEVER_POPULATED.filter((k) => !doc.includes(k));
check('Every unpopulated fact is documented in docs/verification-report.md', undocumented.length === 0,
  `undocumented: ${undocumented.join(', ')}`);

// The report lists the rule suffixes in prose, so match on the suffix rather than the full id.
const undocumentedRules = [...NEVER_FIRES, ...UNDECIDABLE].filter((id) => !doc.includes(id.split(':')[1]));
check('Every affected rule is documented in docs/verification-report.md', undocumentedRules.length === 0,
  `undocumented: ${undocumentedRules.join(', ')}`);

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length} undecidable-rule checks passed${failed.length ? `, ${failed.length} FAILED` : ''}.`);
if (failed.length) process.exit(1);
