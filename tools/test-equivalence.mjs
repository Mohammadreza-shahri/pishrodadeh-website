/*
 * Equivalence guard for option visibility.
 *
 * WHY THIS EXISTS
 * `renderParts` calls `optionCheck` once per option in the active category on every
 * render. That is the hottest path in the app (174 storage options on the DL360), so it
 * is worth optimising — but `optionCheck` decides what a customer is allowed to see, and
 * the project rule is that compatibility states may never be silently weakened. So the
 * optimisation is guarded by a frozen copy of the previous implementation.
 *
 * HOW IT WORKS
 * The functions below marked "verbatim from dist/engine.js" are copied mechanically out
 * of the engine by tools/build-equivalence-test.mjs. The two composite functions
 * (`activeFindingsRef`, `referenceOptionCheck`) are the pre-optimisation versions. The
 * test asserts that the current engine produces an identical decision for every
 * (state, option) pair in a deterministic corpus, including deliberately invalid ones.
 *
 * Regenerate after an intentional engine change:
 *   node tools/build-equivalence-test.mjs   # refresh the frozen copy
 *   node tools/test-equivalence.mjs         # re-verify
 *
 * Run: node tools/test-equivalence.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, '..', 'dist', 'catalog.json'), 'utf8'));

const engine = await import(new URL('../dist/engine.js', import.meta.url).href);
const { initial, CATEGORIES, getOption, optionCheck, activeFindings } = engine;

const MULTI_CATEGORIES=['riser','cooling','kits'];
const RULE_PATHS={cpu:['cpu.','summary.'],memory:['summary.'],storage:['features.drive_'],controller:['features.controller_','features.trimode'],gpu:['features.gpu_'],riser:['features.secondary','features.tertiary','features.pcie'],psu:['features.psu_','power.'],nic:['features.nic_'],backplane:['chassis','features.rear_'],cooling:['features.high_performance_fans'],kits:[]};

/* ---- verbatim from dist/engine.js: expression ---- */
function expression(n,d){if(n==null||typeof n!=='object')return n;const run=x=>expression(x,d);switch(n.op){case 'field':return field(d,n.path);case 'literal':return n.value;case 'selected':return d.items.some(i=>i.sku===n.sku&&i.quantity>=(n.quantity||1));case 'all':{const a=n.args.map(run);return a.includes(false)?false:a.some(x=>x==null)?null:true;}case 'any':{const a=n.args.map(run);return a.includes(true)?true:a.some(x=>x==null)?null:false;}case 'not':{let a=run(n.arg);return a==null?null:!a;}default:{const a=run(n.left),b=run(n.right);if(a==null||b==null)return null;switch(n.op){case 'eq':return a===b;case 'ne':return a!==b;case 'gt':return a>b;case 'gte':return a>=b;case 'lt':return a<b;case 'lte':return a<=b;case 'in':return b.includes(a);default:throw Error('Unknown rule operator');}}}}

/* ---- verbatim from dist/engine.js: field ---- */
function field(o,p){for(const k of p.split('.')){if(o==null||!(k in o))return null;o=o[k];}return o??null;}

/* ---- verbatim from dist/engine.js: selectedOptions ---- */
function selectedOptions(s,data){return Object.values(s.selected).flat().map(sku=>data.options.find(o=>o.model_id===s.model_id&&o.sku===sku)).filter(Boolean);}

/* ---- verbatim from dist/engine.js: quantity ---- */
function quantity(s,o){return o.category==='cpu'?s.cpuQty:o.category==='memory'?s.memoryQty:o.category==='storage'?s.driveQty:o.category==='gpu'?s.gpuQty:o.category==='psu'?s.psuQty:(s.extraQty?.[o.sku]||1);}

/* ---- verbatim from dist/engine.js: selectionItems ---- */
function selectionItems(s){
 const items=[];
 for(const [cat,skus] of Object.entries(s.selected))for(const sku of skus)items.push({sku,quantity:quantity(s,{category:cat})});
 return items;
}

/* ---- verbatim from dist/engine.js: facts ---- */
function facts(s,data){const opts=selectedOptions(s,data),one=cat=>opts.find(o=>o.category===cat),cpu=one('cpu'),mem=one('memory'),drive=one('storage'),controller=one('controller');const risers=opts.filter(o=>o.category==='riser');const has=sku=>opts.some(o=>o.sku===sku);return {chassis:s.chassis,upgrade:false,cpu:cpu?{...cpu.attributes,count:s.cpuQty,mixed:false}:{count:s.cpuQty},items:opts.map(o=>({sku:o.sku,quantity:quantity(s,o)})),features:{secondary_riser:risers.some(o=>o.attributes.position==='secondary'),secondary_fh_riser:null,tertiary_riser:risers.some(o=>o.attributes.position==='tertiary'),high_performance_fans:has('P48820-B21')||has('P48908-B21'),controller_cache:controller?controller.attributes.cached:false,controller_count:controller?1:0,controller_mount:controller?.attributes.mount??null,nic_count:opts.filter(o=>o.category==='nic').length,nic_mount:one('nic')?.attributes.mount??null,backplane_count:one('backplane')?quantity(s,one('backplane')):0,psu_count:one('psu')?s.psuQty:0,psu_watts:one('psu')?.attributes.watts??null,drive_form:drive?.attributes.form??null,drive_needs_ml110_fan:drive?drive.attributes.form==='SFF'&&drive.attributes.protocol==='SAS'&&(/(?:10K|15K)/.test(drive.description)||/SAS (?:24G|24Gb)/.test(drive.description)):false,controller_mixed:false,trimode_controller:null,gpu_count:one('gpu')?s.gpuQty:0,gpu_mixed:false,drive_count:drive?s.driveQty:0,drive_protocol:drive?.attributes.protocol??null,ns204i:false,edsff:s.chassis?.includes('EDSFF')??false,sas4_mu:null,redundant_fans:null,psu_mixed:false,psu_family:one('psu')?.attributes.watts===1600&&one('psu').description.includes('Platinum')?'1600W Platinum':null,direct_liquid_cooling:s.cooling==='liquid',rear_primary_2lff:has('P48823-B21'),rear_secondary_2lff:has('P51095-B21'),primary_pcie_cards:null,secondary_pcie_cards:null,slots5_10_used:null,slot2_used:null,pcie_card_count:opts.filter(o=>['controller','hba','nic','gpu'].includes(o.category)).length,media_box:null,storage_layout:null,vroc_nvme:null},power:{input_v:s.inputV},summary:{dimm_count:mem?s.memoryQty:0,dimms_per_cpu:mem?s.memoryQty/s.cpuQty:0,max_dimms_per_cpu:mem?Math.ceil(s.memoryQty/s.cpuQty):0,has_96_5600:mem?mem.attributes.capacity_gb===96&&mem.attributes.speed_mts===5600:false,has_96_4800:mem?mem.attributes.capacity_gb===96&&mem.attributes.speed_mts===4800:false,count_96_4800:mem?.attributes.capacity_gb===96&&mem.attributes.speed_mts===4800?s.memoryQty:0,count_96_5600:mem?.attributes.capacity_gb===96&&mem.attributes.speed_mts===5600?s.memoryQty:0,has_256:mem?.attributes.capacity_gb===256,mixed_is_3ds:false,mixed_rank:false,mixed_width:false,population_380a_valid:mem?s.cpuQty===2&&s.memoryQty%2===0&&[1,2,4,6,8,12].includes(s.memoryQty/2):true}};}

/* ---- verbatim from dist/engine.js: directConflicts ---- */
function directConflicts(s,data,items=selectionItems(s)){const out=[],cpu=getOption(s,data,'cpu'),mem=getOption(s,data,'memory'),drive=getOption(s,data,'storage'),psu=getOption(s,data,'psu'),gpu=getOption(s,data,'gpu');const add=(key,category)=>out.push({key,category});

 if(mem&&cpu&&s.model_id==='16911'&&cpu.attributes.generation===5&&mem.attributes.speed_mts===4800)add('memoryGeneration','memory');
 if(mem&&cpu&&s.model_id==='16913'&&((cpu.attributes.generation===4&&mem.attributes.speed_mts!==4800)||(cpu.attributes.generation===5&&![5200,5600].includes(mem.attributes.speed_mts))))add('memoryGeneration','memory');
 if(drive&&s.model_id==='16913'&&drive.attributes.protocol!=='NVMe')add('nvmeOnly','storage');
 const form=s.chassis?.includes('SFF')?'SFF':s.chassis?.includes('LFF')?'LFF':s.chassis?.includes('EDSFF')?'EDSFF':s.model_id==='16913'?'SFF':null;
 if(drive&&!(drive.attributes.form==='M.2'&&data.models.find(m=>m.id===s.model_id)?.cpu_counts)&&drive.attributes.form&&form&&drive.attributes.form!==form&&drive.attributes.form!==getOption(s,data,'backplane')?.attributes.form)add('driveForm','storage');
 if(psu&&psu.attributes.highline&&(s.inputV<200||s.inputV>240))add('highline','psu');
 if(gpu&&s.workload.startsWith('ai')&&gpu.attributes.vram_gb<s.requirements.gpuGB)add('gpuMemory','gpu');
 if(mem&&s.memoryQty>(data.models.find(m=>m.id===s.model_id)?.dimms??(s.model_id==='16913'?24:32)))add('memorySlots','memory');
 return out;}

/* ------------------------------------------------------------------ *
 * Frozen reference: pre-optimisation optionCheck / activeFindings
 * ------------------------------------------------------------------ */

function activeFindingsRef(s) {
  const f = facts(s, data);
  const out = [];
  for (const r of data.rules.filter((r) => r.model_id === s.model_id)) {
    const when = expression(r.when, f);
    const ok = expression(r.assert, f);
    if (when === false || ok === true) continue;
    out.push({ ...r, status: when == null || ok == null ? 'unknown' : 'conflict' });
  }
  return out;
}

function containsSelected(n) {
  return n && typeof n === 'object' && (n.op === 'selected' || Object.values(n).some((x) => (Array.isArray(x) ? x.some(containsSelected) : containsSelected(x))));
}

function forceSelection(s, o) {
  const trial = structuredClone(s);
  const multi = ['riser', 'cooling', 'kits'].includes(o.category);
  trial.selected[o.category] = multi ? [...new Set([...(trial.selected[o.category] || []), o.sku])] : [o.sku];
  return trial;
}

function referenceOptionCheck(s, o) {
  if (o.model_id !== s.model_id) return { hidden: true, reasons: ['platform'] };
  const trial = forceSelection(s, o);
  const direct = directConflicts(trial, data).filter((x) => x.category === o.category);
  const paths = {
    cpu: ['cpu.', 'summary.'],
    memory: ['summary.'],
    storage: ['features.drive_'],
    controller: ['features.controller_', 'features.trimode'],
    gpu: ['features.gpu_'],
    riser: ['features.secondary', 'features.tertiary', 'features.pcie'],
    psu: ['features.psu_', 'power.'],
    nic: ['features.nic_'],
    backplane: ['chassis', 'features.rear_'],
    cooling: ['features.high_performance_fans'],
    kits: [],
  }[o.category] || [];
  function relevant(n) {
    if (!n || typeof n !== 'object') return false;
    if (n.op === 'field') return paths.some((p) => n.path.startsWith(p));
    if (n.op === 'selected') return n.sku === o.sku;
    return Object.values(n).some((v) => (Array.isArray(v) ? v.some(relevant) : relevant(v)));
  }
  const conflicts = activeFindingsRef(trial).filter((r) => r.status === 'conflict' && (relevant(r.when) || relevant(r.assert)));
  const requirements = conflicts.filter((r) => containsSelected(r.assert) || r.domain === 'thermal');
  const incompatible = conflicts.filter((r) => !requirements.includes(r) && !(r.minimum_required && r.domain === 'gpu' && o.category !== 'gpu'));
  return { hidden: direct.length > 0 || incompatible.length > 0, reasons: direct.map((x) => x.key), requirements, conflicts: incompatible, review: true };
}

/* ------------------------------------------------------------------ *
 * Deterministic corpus of (state, option) pairs
 * ------------------------------------------------------------------ */

let seed = 20260929;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pickOne = (arr) => arr[Math.floor(rnd() * arr.length)];
const optionsFor = (modelId, cat) => data.options.filter((o) => o.model_id === modelId && o.category === cat);

function buildCorpus() {
  const corpus = [];
  for (const m of data.models) {
    const cats = CATEGORIES.filter((c) => optionsFor(m.id, c).length);
    for (let n = 0; n < 60; n += 1) {
      const selected = {};
      for (const cat of cats) {
        const pool = optionsFor(m.id, cat);
        const multi = ['riser', 'cooling', 'kits'].includes(cat);
        const count = multi ? (rnd() < 0.4 ? 2 : 0) : rnd() < 0.75 ? 1 : 0;
        const chosen = new Set();
        for (let i = 0; i < count; i += 1) chosen.add(pickOne(pool).sku);
        if (chosen.size) selected[cat] = [...chosen];
      }
      corpus.push({
        ...initial(),
        model_id: m.id,
        chassis: m.chassis[Math.floor(rnd() * m.chassis.length)],
        selected,
        cpuQty: 1 + Math.floor(rnd() * 2),
        memoryQty: 1 + Math.floor(rnd() * 32),
        driveQty: 1 + Math.floor(rnd() * 12),
        gpuQty: 1 + Math.floor(rnd() * 4),
        psuQty: 1 + Math.floor(rnd() * 4),
        raid: pickOne(['0', '1', '5', '6', '10']),
        inputV: pickOne([110, 200, 230, 240, 277]),
        cooling: pickOne(['air', 'liquid']),
        workload: pickOne(['virtualization', 'database', 'business', 'storage', 'ai_inference', 'ai_training']),
      });
    }
  }
  // Hand-built edge states: nothing selected, and a multi-select riser/cooling build.
  corpus.push({ ...initial(), model_id: '16910', chassis: data.models[0].chassis[0], selected: {} });
  corpus.push({ ...initial(), model_id: '16913', chassis: data.models.find((m) => m.id === '16913').chassis[0], selected: {} });
  return corpus;
}

const summarize = (result) => JSON.stringify({
  hidden: result.hidden,
  reasons: result.reasons,
  requirements: (result.requirements || []).map((r) => r.id).sort(),
  conflicts: (result.conflicts || []).map((r) => r.id).sort(),
  review: result.review,
});

const checks = [];
function check(label, condition, detail = '') {
  checks.push({ label, ok: Boolean(condition) });
  console.log(`${condition ? 'PASS' : 'FAIL'} ${label}${condition || !detail ? '' : `\n     ${detail}`}`);
}

const corpus = buildCorpus();
let pairs = 0;
let mismatches = 0;
const samples = [];
const byCategory = new Map();
const byField = new Map();

// A category-level fast path must never change the answer for ANY option, selected or not.
for (const state of corpus) {
  for (const option of data.options) {
    pairs += 1;
    const expected = summarize(referenceOptionCheck(state, option));
    const actual = summarize(optionCheck(state, data, option));
    if (expected !== actual) {
      mismatches += 1;
      byCategory.set(option.category, (byCategory.get(option.category) || 0) + 1);
      const e = JSON.parse(expected);
      const a = JSON.parse(actual);
      for (const key of ['hidden', 'reasons', 'requirements', 'conflicts']) {
        if (JSON.stringify(e[key]) !== JSON.stringify(a[key])) byField.set(key, (byField.get(key) || 0) + 1);
      }
      if (samples.length < 5) samples.push({ model: state.model_id, chassis: state.chassis, category: option.category, sku: option.sku, expected, actual, state: JSON.stringify({ selected: state.selected, cpuQty: state.cpuQty, memoryQty: state.memoryQty, driveQty: state.driveQty, gpuQty: state.gpuQty, psuQty: state.psuQty, cooling: state.cooling, inputV: state.inputV, workload: state.workload, raid: state.raid }) });
    }
  }
}

if (mismatches) {
  console.log(`\nMismatches by category: ${JSON.stringify(Object.fromEntries([...byCategory].sort()))}`);
  console.log(`Mismatches by field   : ${JSON.stringify(Object.fromEntries([...byField].sort()))}`);
  console.log(`First ${samples.length} samples:`);
  for (const s of samples) console.log('  ' + JSON.stringify(s));
  console.log('');
}

check(`Option visibility identical over ${pairs} (state, option) pairs`, mismatches === 0, samples.map((s) => JSON.stringify(s)).join('\n     '));

let findingMismatch = 0;
for (const state of corpus) {
  const expected = activeFindingsRef(state).map((r) => `${r.id}:${r.status}`).sort();
  const actual = activeFindings(state, data).map((r) => `${r.id}:${r.status}`).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) findingMismatch += 1;
}
check(`Active findings identical over ${corpus.length} states (id + status)`, findingMismatch === 0);

// The corpus must actually exercise the interesting paths, or the guard is theatre.
const hiddenCount = corpus.reduce((acc, s) => acc + data.options.filter((o) => optionCheck(s, data, o).hidden).length, 0);
const directReasons = new Set();
const conflictDomains = new Set();
for (const s of corpus) {
  for (const o of data.options) {
    const r = optionCheck(s, data, o);
    for (const reason of r.reasons) directReasons.add(reason);
    for (const c of r.conflicts || []) conflictDomains.add(c.domain);
  }
}
check('Corpus exercises the hidden path (>1000 hidden pairs)', hiddenCount > 1000, `hidden=${hiddenCount}`);
check('Corpus exercises direct-conflict reasons', directReasons.size >= 3, `reasons=${[...directReasons].join(',')}`);
check('Corpus exercises rule conflict paths', conflictDomains.size >= 2, `domains=${[...conflictDomains].join(',')}`);

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length} equivalence checks passed${failed.length ? `, ${failed.length} FAILED` : ''} (${pairs} pairs, ${corpus.length} states).`);
if (failed.length) process.exit(1);
