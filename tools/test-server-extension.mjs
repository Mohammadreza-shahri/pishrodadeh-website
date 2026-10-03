import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial, optionCheck, activeFindings, requiredKits, directConflicts, recommend, validateImport, workloadLimits} from '../dist/engine.js';

const data=JSON.parse(readFileSync(new URL('../dist/catalog.json',import.meta.url)));
const manifest=JSON.parse(readFileSync(new URL('../docs/server-sources/manifest.json',import.meta.url)));
const model=id=>data.models.find(m=>m.id===id);
const setup=id=>({...initial(),model_id:id,chassis:model(id).chassis[0],cpuQty:model(id).cpu_counts[0],memoryQty:Math.min(8,model(id).dimms)});
const part=(id,category,predicate=()=>true)=>data.options.find(o=>o.model_id===id&&o.category===category&&predicate(o));
const needs=s=>requiredKits(s,data).flatMap(n=>n.any);
const select=(s,category,option)=>{assert(option,category);s.selected[category]=[option.sku];};

assert.equal(data.models.length,9);
assert.equal(new Set(data.models.map(m=>m.id)).size,9);
assert.equal(new Set(data.rules.map(r=>r.id)).size,data.rules.length);
assert.equal(new Set(data.options.map(o=>o.model_id+':'+o.sku)).size,data.options.length);
for(const source of manifest){
  const raw=readFileSync(new URL('../'+source.source,import.meta.url),'utf8');
  assert.equal(createHash('sha256').update(raw).digest('hex'),source.sha256);
  const entries=[model(source.id),...data.options.filter(o=>o.model_id===source.id),...data.rules.filter(r=>r.model_id===source.id)];
  for(const entry of entries)for(const ev of entry.evidence){
    assert.equal(ev.sha256,source.sha256);
    assert.equal(ev.version,source.version);
    assert.equal(raw.slice(ev.start,ev.end),ev.quote);
    if(entry.sku)assert(ev.quote.includes(entry.sku));
  }
  for(const category of ['cpu','memory','storage','psu','nic'])assert(part(source.id,category));
  const s=setup(source.id);
  assert(activeFindings(s,data).some(r=>r.status==='unknown'),'Unresolved source tables remain visible');
  assert.equal(model(source.id).qualification,'partial_rules');
  assert.equal(model(source.id).rule_count,data.rules.filter(r=>r.model_id===source.id).length);
  assert.equal(validateImport(s,data).model_id,s.model_id);
  const cpu=part(source.id,'cpu');
  select(s,'cpu',cpu);
  const foreign=part(source.id==='17118'?'17105':'17118','cpu');
  assert(optionCheck(s,data,foreign).hidden);
  s.cpuQty=source.id==='17258'?3:model(source.id).sockets+1;
  assert(optionCheck(s,data,cpu).hidden);
  assert.throws(()=>validateImport(s,data));
}
for(const id of ['17118','16305','17119']){
  const s=setup(id);select(s,'memory',part(id,'memory'));s.memoryQty=model(id).dimms+1;
  assert(directConflicts(s,data).some(r=>r.key==='memorySlots'));
  const m2=part(id,'storage',o=>o.attributes.form==='M.2');
  const boot=setup(id);assert(!optionCheck(boot,data,m2).hidden,'Listed M.2 options are not treated as front-bay drives');
  boot.extraQty={[part(id,'psu').sku]:-1};assert.throws(()=>validateImport(boot,data));
  boot.extraQty={};boot.selected.psu=[part(id,'psu').sku];boot.psuQty=3;
  assert(optionCheck(boot,data,part(id,'psu')).hidden,'PSU quantities cannot exceed platform slots');
}
for(const workload of ['business','database','ai_training'])assert.equal(recommend(data,workload).length,9);
assert.equal(workloadLimits(model('17118'),data,{ramGB:129,cores:1,gpuGB:1},'business').blockers.includes('memory'),true);
assert.equal(workloadLimits(model('17258'),data,{ramGB:1,cores:1,gpuGB:1},'database').limits.cores,344);

let s=setup('17118');
select(s,'cpu',part(s.model_id,'cpu',o=>o.attributes.tdp_w===95));
assert(needs(s).includes('P65108-B21'));
s.chassis='4LFF-HP';assert(needs(s).includes('P65106-B21'));
select(s,'psu',part(s.model_id,'psu',o=>o.attributes.watts===500));assert(needs(s).includes('P65104-B21'));

s=setup('16305');select(s,'gpu',part(s.model_id,'gpu',o=>o.sku==='S0K89C'));
assert(needs(s).includes('P49984-B21')&&needs(s).includes('P53487-B21')&&needs(s).includes('P66618-B21'));
s.gpuQty=2;assert(needs(s).includes('P53488-B21'));
assert(optionCheck(s,data,part(s.model_id,'cpu',o=>o.attributes.tdp_w>150)).hidden);
s.gpuQty=3;assert(optionCheck(s,data,part(s.model_id,'gpu')).hidden);
s=setup('16305');select(s,'cpu',part(s.model_id,'cpu',o=>o.attributes.model==='3508U'));
assert(optionCheck(s,data,part(s.model_id,'memory',o=>o.attributes.capacity_gb===96)).hidden);

s=setup('17119');s.chassis='2LFF-NHP';assert(optionCheck(s,data,part(s.model_id,'controller')).hidden);
s.chassis='4SFF-HP';select(s,'controller',part(s.model_id,'controller',o=>o.attributes.mount==='OCP'));
assert(needs(s).includes('P65412-B21'));
select(s,'storage',part(s.model_id,'storage',o=>o.attributes.protocol==='NVMe'&&o.attributes.form==='SFF'));
assert(needs(s).includes('P65406-B21'));s.driveQty=3;
assert(optionCheck(s,data,part(s.model_id,'storage',o=>o.attributes.protocol==='NVMe'&&o.attributes.form==='SFF')).hidden);

s=setup('17105');s.cpuQty=2;select(s,'cpu',part(s.model_id,'cpu',o=>o.attributes.tdp_w>=300));
assert(needs(s).includes('P47219-B21')&&needs(s).includes('P47902-B21'));
const heat=requiredKits(s,data).find(n=>n.any.includes('P72359-B21'));assert.equal(heat.quantity,2);
s.selected.cooling=['P72359-B21','P47219-B21','P47902-B21'];s.extraQty={'P72359-B21':2};
assert(!needs(s).includes('P72359-B21'));
select(s,'gpu',part(s.model_id,'gpu',o=>o.sku==='S2L70C'));s.gpuQty=3;
assert(optionCheck(s,data,part(s.model_id,'gpu',o=>o.sku==='S2L70C')).hidden);
s.gpuQty=2;assert.equal(requiredKits(s,data).find(n=>n.any.includes('P47221-B21')).quantity,2);

s=setup('17258');s.cpuQty=4;select(s,'psu',part(s.model_id,'psu'));s.psuQty=1;
assert(optionCheck(s,data,part(s.model_id,'psu')).hidden);
s.psuQty=2;assert(!optionCheck(s,data,part(s.model_id,'psu')).hidden);
assert(activeFindings(s,data).some(r=>r.id.endsWith(':bulletin_dl580_nic')&&r.status==='conflict'));
assert(!optionCheck(s,data,part(s.model_id,'nic')).hidden);
select(s,'nic',part(s.model_id,'nic'));
assert(!activeFindings(s,data).some(r=>r.id.endsWith(':bulletin_dl580_nic')));
assert.equal(requiredKits(s,data).find(n=>n.any.includes('P80382-B21')).quantity,4);
s.cooling='liquid';assert(needs(s).includes('P78016-B21')&&needs(s).includes('P62042-B21'));
assert(!needs(s).includes('P80382-B21'));
s.selected.cooling=['P78016-B21','P80382-B21'];
assert(activeFindings(s,data).some(r=>r.id.endsWith(':bulletin_dl580_dlc_no_air')&&r.status==='conflict'));

console.log('Five server platforms: source integrity, limits, imports, dependencies, GPU/storage/power conflicts and unresolved checks passed.');
