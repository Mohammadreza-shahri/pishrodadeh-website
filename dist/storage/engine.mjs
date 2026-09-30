// Deterministic planning module. No network, model calls, prices or stock claims.
import {message} from './copy.mjs';

const enums = {
  access:['block','object','file'], workload:['business','virtualization','database','analytics'],
  protocol:['fc','iscsi','sas','unknown'], availability:['standard','critical'],
  budgetTier:['value','balanced','performance'], lifecycle:['active','allow_retired'],
};
const numeric = {
  usableTB:[0.001,1e7], annualGrowthPct:[0,1000], years:[0,20], headroomPct:[0,90],
  backupTB:[0.001,1e7], changePct:[0,100], retentionDays:[1,36500], fullEveryDays:[1,36500],
  backupWindowHours:[0.01,168], rpoMinutes:[0,525600], rtoHours:[0.01,8760],
  iops:[0,1e9], latencyMs:[0.001,1e5], sequentialMBps:[0,1e9], existingLTO:[0,99],
};
const integers = new Set(['retentionDays','fullEveryDays','existingLTO']);
const booleans = ['offlineCopy','immutable'];
const textFields = ['backupSoftware','existingModel'];
const purposes = ['primary','backup','archive'];
const categories = ['base','drive','controller','adapter','enclosure','cache','power','cable','license','switch','tape_drive','media','accessory','capacity_upgrade'];
function object(x) { return x!==null && typeof x==='object' && !Array.isArray(x) && [Object.prototype,null].includes(Object.getPrototypeOf(x)); }
function error(reason) { throw new Error('Invalid storage input: '+reason); }
function finite(x,min,max) { return typeof x==='number' && Number.isFinite(x) && x>=min && x<=max; }
function boundedInteger(x,min,max) { return Number.isInteger(x)&&finite(x,min,max); }
function model(data,id) { const m=data.models.find(m=>m.id===id); if(!m)error('unknown model'); return m; }
function option(data,id) { const o=data.options.find(o=>o.id===id); if(!o)error('unknown option'); return o; }
function rulesFor(data,m) { return data.rules.filter(r=>r.qs_id===m.qs_id); }
function fact(rules,kind) { return rules.find(r=>r.kind===kind); }

export function initialRequirements() {
  return {purposes:[], ...Object.fromEntries([...Object.keys(enums),...Object.keys(numeric),...booleans,...textFields].map(k=>[k,null]))};
}
export function validateRequirements(input={}) {
  if(!object(input))error('requirements must be an object');
  const out=initialRequirements();
  for(const [key,value] of Object.entries(input)) {
    if(!Object.hasOwn(out,key))error('unknown requirement '+key);
    if(value===null) { out[key]=value; continue; }
    if(key==='purposes') {
      if(!Array.isArray(value)||value.length>3||new Set(value).size!==value.length||value.some(v=>!purposes.includes(v)))error('purposes');
      out[key]=[...value]; continue;
    }
    if(enums[key]&&!enums[key].includes(value))error(key);
    if(numeric[key]&&(!finite(value,...numeric[key])||(integers.has(key)&&!Number.isInteger(value))))error(key);
    if(booleans.includes(key)&&typeof value!=='boolean')error(key);
    if(textFields.includes(key)&&(typeof value!=='string'||value.length>200||/[\u0000-\u001f]/.test(value)))error(key);
    out[key]=value;
  }
  if(!Array.isArray(out.purposes))error('purposes');
  return out;
}

export function nextQuestions(input={},lang='fa',limit=6) {
  const r=validateRequirements(input);
  if(!boundedInteger(limit,1,50))error('question limit');
  const keys=[];
  if(!r.purposes.length)keys.push('purposes');
  if(r.purposes.includes('primary')) {
    keys.push('access','workload','usableTB','annualGrowthPct','years','headroomPct','protocol','availability','rpoMinutes','rtoHours','budgetTier');
    if(['database','virtualization'].includes(r.workload))keys.push('iops','latencyMs');
    if(r.workload==='analytics'||r.access==='object')keys.push('sequentialMBps');
  }
  if(r.purposes.some(p=>['backup','archive'].includes(p)))keys.push('backupTB','changePct','retentionDays','fullEveryDays','headroomPct','backupWindowHours','rpoMinutes','rtoHours','offlineCopy','immutable','backupSoftware');
  if(r.purposes.includes('archive')) keys.push('existingLTO','protocol');
  if(r.purposes.length)keys.push('lifecycle');
  return [...new Set(keys)].filter(k=>k==='purposes'||r[k]===null||(k==='backupSoftware'&&!r[k])).slice(0,limit).map(key=>({
    key, text:message(key==='purposes'?'purpose':key,lang),
    type:key==='purposes'?'multiple':enums[key]||booleans.includes(key)?'choice':numeric[key]?'number':'text',
    ...(key==='purposes'?{choices:purposes.map(value=>({value,label:message(value,lang)}))}:{}),
    ...(enums[key]?{choices:enums[key].map(value=>({value,label:message(value,lang)}))}:{}),
    ...(booleans.includes(key)?{choices:[true,false].map(value=>({value,label:message(value?'yes':'no',lang)}))}:{}),
    ...(numeric[key]?{minimum:numeric[key][0],maximum:numeric[key][1],integer:integers.has(key)}:{}),
  }));
}

export function capacityPlan(input={}) {
  const r=validateRequirements(input);
  if(['usableTB','annualGrowthPct','years','headroomPct'].some(k=>r[k]===null))return {status:'unknown',usableTB:null,requiredTB:null};
  const grown=r.usableTB*(1+r.annualGrowthPct/100)**r.years;
  const required=grown/(1-r.headroomPct/100);
  return {status:'estimate',usableTB:grown,requiredTB:required,requiredTiB:required/1.099511627776,assumptions:{annualGrowthPct:r.annualGrowthPct,years:r.years,headroomPct:r.headroomPct,dataReductionRatio:1},basis:'Compound growth with free-space reserve; decimal TB; no data reduction credit.'};
}

export function backupPlan(input={}) {
  const r=validateRequirements(input);
  if(['backupTB','changePct','retentionDays','fullEveryDays'].some(k=>r[k]===null))return {status:'unknown',retainedTB:null,requiredTB:null};
  const fulls=Math.ceil(r.retentionDays/r.fullEveryDays), increments=Math.max(0,r.retentionDays-fulls);
  const retained=r.backupTB*(fulls+increments*r.changePct/100);
  return {status:'estimate',fullCopies:fulls,incrementalCopies:increments,retainedTB:retained,requiredTB:r.headroomPct===null?null:retained/(1-r.headroomPct/100),
    fullBackupMBps:r.backupWindowHours===null?null:r.backupTB*1e6/(r.backupWindowHours*3600),
    dailyIncrementalMBps:r.backupWindowHours===null?null:r.backupTB*r.changePct/100*1e6/(r.backupWindowHours*3600),
    restoreMBps:r.rtoHours===null?null:r.backupTB*1e6/(r.rtoHours*3600),
    assumptions:{dataReductionRatio:1,headroomPct:r.headroomPct,schedule:'Periodic retained fulls plus daily incrementals; conservative rolling retention; no synthetic-full or deduplication credit.'}};
}

function finding(key,status,lang,params={},evidence=[]) { return {key,status,message:message(key,lang,params),evidence}; }
export function recommend(data,input={},lang='fa') {
  const r=validateRequirements(input), roles={primary:[],backup:[],archive:[]}, findings=[];
  const eligible=m=>(r.lifecycle!=='active'||m.lifecycle==='active_in_snapshot')&&(!r.existingModel||m.id===r.existingModel);
  if(r.existingModel)model(data,r.existingModel);
  for(const role of r.purposes) {
    for(const m of data.models.filter(eligible)) {
      const modes=m.access_modes||[m.access];
      if(role==='primary'&&(!modes.some(a=>['block','object','file'].includes(a))||(r.access&&!modes.includes(r.access))))continue;
      if(role==='backup'&&!['backup','secondary'].includes(m.access))continue;
      if(role==='archive'&&m.access!=='tape')continue;
      let score=50;
      const reasons=[finding('role','inference',lang,{},m.evidence)];
      if(m.lifecycle==='active_in_snapshot')score+=15;
      else reasons.push(finding('retired','unknown',lang,{},m.evidence));
      if(role==='primary') {
        if(r.budgetTier==='value'&&m.family==='msa') { score+=20; reasons.push(finding('value_fit','inference',lang,{},m.evidence)); }
        const flash=m.short.startsWith('AF')||/^6\d{3}$/.test(m.short)||['primera'].includes(m.family)||['9060','9080','B10000'].includes(m.short);
        if((r.workload==='database'||r.latencyMs!==null)&&flash) { score+=15; reasons.push(finding('flash_fit','inference',lang,{},m.evidence)); }
        if(r.availability==='critical'&&(m.family==='primera'||['9060','9080','B10000'].includes(m.short))) { score+=20; reasons.push(finding('resilience_fit','inference',lang,{},m.evidence)); }
      }
      const bases=data.options.filter(o=>o.category==='base'&&o.model_ids.includes(m.id));
      if(!bases.length)reasons.push(finding('base_unknown','unknown',lang,{},m.evidence));
      roles[role].push({model:m,score,assurance:'planning_candidate',reasons,base_options:bases.map(o=>o.id),performance:'unknown',capacity:'unknown'});
    }
    roles[role].sort((a,b)=>b.score-a.score||a.model.id.localeCompare(b.model.id));
  }
  if(r.access==='file'&&r.purposes.includes('primary'))findings.push(finding('file_gap','unknown',lang,{},roles.primary.flatMap(x=>x.model.evidence)));
  if(r.offlineCopy&&r.purposes.includes('backup')&&!r.purposes.includes('archive'))findings.push(finding('offline_gap','advisory',lang));
  if(r.immutable)findings.push(finding('immutable_gap','unknown',lang));
  if(r.rpoMinutes!==null&&r.rpoMinutes<60&&r.purposes.includes('backup'))findings.push(finding('rpo_gap','unknown',lang));
  const questions=nextQuestions(r,lang,50);
  if(questions.length)findings.push(finding('incomplete_answers','unknown',lang));
  findings.push(finding('performance_unknown','unknown',lang));
  return {schema_version:1,requirements:r,roles,questions,capacity:capacityPlan(r),backup:backupPlan(r),findings,ranking_basis:'Deterministic engineering shortlist policy, not a measured performance or price comparison.'};
}

export function initialConfiguration(model_id) { return {schema_version:1,model_id,host_protocol:null,items:[],diskGroups:[]}; }
export function validateConfiguration(input,data) {
  if(!object(input)||input.schema_version!==1||typeof input.model_id!=='string')error('configuration schema');
  model(data,input.model_id);
  if(Object.keys(input).some(k=>!['schema_version','model_id','host_protocol','items','diskGroups'].includes(k)))error('configuration field');
  if(input.host_protocol!==null&&!['fc','iscsi','sas'].includes(input.host_protocol))error('host protocol');
  if(!Array.isArray(input.items)||input.items.length>300||!Array.isArray(input.diskGroups)||input.diskGroups.length>128)error('selection arrays');
  const ids=new Set();
  const items=input.items.map(item=>{
    if(!object(item)||Object.keys(item).some(k=>!['option_id','quantity'].includes(k))||typeof item.option_id!=='string'||!boundedInteger(item.quantity,1,10000))error('selection');
    option(data,item.option_id);
    if(ids.has(item.option_id))error('duplicate option');
    ids.add(item.option_id);return {...item};
  });
  const diskGroups=input.diskGroups.map(group=>{
    if(!object(group)||Object.keys(group).some(k=>!['option_id','disks','spares','raid','location'].includes(k)))error('disk group');
    const o=option(data,group.option_id);
    if(o.category!=='drive'||!ids.has(group.option_id)||!boundedInteger(group.disks,1,10000)||!boundedInteger(group.spares,0,10000)||group.spares>=group.disks||!['0','1','5','6','10','MSA-DP+','vendor'].includes(group.raid)||typeof group.location!=='string')error('disk group values');
    if(group.location!=='base') {
      const location=option(data,group.location);
      if(location.category!=='enclosure'||!ids.has(group.location))error('disk location');
    }
    return {...group};
  });
  return {schema_version:1,model_id:input.model_id,host_protocol:input.host_protocol,items,diskGroups};
}

export function optionCheck(data,model_id,option_id,lang='fa') {
  const m=model(data,model_id),o=option(data,option_id);
  const identityMismatch=['base','controller'].includes(o.category)&&o.scope==='named'&&!o.model_ids.includes(m.id);
  if(o.qs_id!==m.qs_id||o.excluded_models.includes(m.id)||identityMismatch)return {status:'conflict',hidden:true,findings:[finding('scope','conflict',lang,{},o.evidence)]};
  // An absent model/variant in a family matrix is not an explicit "No".
  if(o.scope==='unknown'||!o.model_ids.includes(m.id))return {status:'unknown',hidden:false,findings:[finding('scope_unknown','unknown',lang,{},o.evidence)]};
  return {status:'listed',hidden:false,findings:[],evidence:o.evidence};
}
export function optionsFor(data,model_id,category=null) {
  const m=model(data,model_id);
  if(category!==null&&!categories.includes(category))error('option category');
  return data.options.filter(o=>o.qs_id===m.qs_id&&(!category||o.category===category)&&!optionCheck(data,model_id,o.id).hidden);
}

function raidCapacity(cap,disks,spares,raid) {
  if(!finite(cap,0.000001,1e7))return {status:'unknown',usableTB:null};
  const n=disks-spares;
  if((raid==='1'&&n!==2)||(raid==='5'&&n<3)||(raid==='6'&&n<4)||(raid==='10'&&(n<4||n%2!==0)))return {status:'conflict',usableTB:null};
  const factors={'0':n,'1':1,'5':n-1,'6':n-2,'10':n/2};
  return Object.hasOwn(factors,raid)?{status:'estimate',usableTB:factors[raid]*cap}:{status:'unknown',usableTB:null};
}

export function review(data,input,requirements={},lang='fa') {
  const s=validateConfiguration(input,data),r=validateRequirements(requirements),m=model(data,s.model_id),rules=rulesFor(data,m);
  const selected=s.items.map(i=>({...option(data,i.option_id),quantity:i.quantity})),of=cat=>selected.filter(o=>o.category===cat),findings=[];
  const add=(key,status,params={},evidence=[])=>findings.push(finding(key,status,lang,params,evidence));
  for(const o of selected)findings.push(...optionCheck(data,m.id,o.id,lang).findings);
  if(m.lifecycle==='retired_in_snapshot')add('retired','unknown',{},m.evidence);
  const required=m.access==='tape'?['base','tape_drive','media']:m.short==='VSA'?['license']:m.access==='backup'?['base']:['base','drive'];
  if(m.family==='primera'||['9060','9080','B10000'].includes(m.short))required.push('controller');
  if(m.short.startsWith('HF')||['5010H','5010','5030','5050','SF100','SF300'].includes(m.short))required.push('cache');
  for(const cat of required)if(!of(cat).length)add('missing','missing',{category:cat},m.evidence);
  if(of('base').reduce((n,o)=>n+o.quantity,0)>1)add('scope','conflict',{},of('base').flatMap(o=>o.evidence));
  const base=of('base')[0];
  for(const o of [...of('base'),...of('tape_drive')])if(s.host_protocol&&o.attributes.host_protocol&&s.host_protocol!==o.attributes.host_protocol)add('host_protocol','conflict',{},o.evidence);
  const enclosures=of('enclosure'),maximum=fact(rules,'max_enclosures');
  if(maximum&&enclosures.reduce((n,o)=>n+o.quantity,0)>maximum.params.maximum)add('enclosure_count','conflict',{},maximum.evidence);

  const groups=[],allocations=new Map(),locations=new Map();
  for(const g of s.diskGroups) {
    const o=option(data,g.option_id),loc=g.location==='base'?base:option(data,g.location);
    const computed=raidCapacity(o.attributes.capacity_tb,g.disks,g.spares,g.raid);
    allocations.set(o.id,(allocations.get(o.id)||0)+g.disks);
    locations.set(g.location,(locations.get(g.location)||0)+g.disks);
    const raidRule=fact(rules,'raid');
    if(raidRule&&!raidRule.params.levels.includes(g.raid))add('raid','conflict',{},raidRule.evidence);
    else if(!raidRule||['MSA-DP+','vendor'].includes(g.raid))add('raid_unknown','unknown',{},raidRule?.evidence||o.evidence);
    if(computed.status==='conflict')add('raid_count','conflict',{},o.evidence);
    if(loc?.attributes.form&&o.attributes.form&&loc.attributes.form!==o.attributes.form)add('form','conflict',{},[...loc.evidence,...o.evidence]);
    if(!loc?.attributes.form||!o.attributes.form)add('bay_unknown','unknown',{},o.evidence);
    groups.push({...g,...computed,rawTB:o.attributes.capacity_tb===null||o.attributes.capacity_tb===undefined?null:g.disks*o.attributes.capacity_tb});
  }
  for(const o of of('drive')) {
    const physical=o.attributes.pack_qty===null||o.attributes.pack_qty===undefined?null:o.quantity*o.attributes.pack_qty;
    if(physical!==null&&(allocations.get(o.id)||0)>physical)add('allocation','conflict',{},o.evidence);
    if(physical===null||(allocations.get(o.id)||0)!==physical)add('capacity_unknown','unknown',{},o.evidence);
  }
  for(const [location,disks] of locations) {
    const o=location==='base'?base:option(data,location);
    const qty=location==='base'?1:selected.find(i=>i.id===location).quantity;
    // MSA chassis capacity follows its documented SFF/LFF form; explicit rule below.
    const bays=o?.attributes.slots??(location==='base'&&o?.attributes.form?fact(rules,'msa_bays')?.params.slots[o.attributes.form]:undefined);
    if(bays!==undefined&&disks>bays*qty)add('bay_count','conflict',{location},o.evidence);
    else if(bays===undefined)add('bay_unknown','unknown',{},o?.evidence||[]);
  }
  const controller=of('controller')[0],population=fact(rules,'primera_population');
  if(population&&controller) {
    const pairs=controller.attributes.nodes?controller.attributes.nodes/2:null;
    if(pairs) {
      const counts={};
      for(const o of of('drive'))if(o.attributes.pack_qty) {
        const type=o.attributes.media_type==='hdd'?(o.attributes.rpm===10000?'hdd10k':o.attributes.rpm===7200?'hdd7k':'unknown'):'ssd';
        counts[type]=(counts[type]||0)+o.quantity*o.attributes.pack_qty;
      }
      for(const [type,n] of Object.entries(counts)) {
        if(type==='unknown')add('raid_unknown','unknown',{},population.evidence);
        else if(n%2||n<pairs*(type==='hdd7k'?population.params.min_hdd_per_pair:population.params.min_ssd_per_pair))add('population','conflict',{},population.evidence);
      }
    }
    const mediaRule=fact(rules,'primera_media');
    if(mediaRule&&of('drive').some(o=>(m.short.startsWith('A')&&o.attributes.media_type==='hdd')||(m.short.startsWith('C')&&o.attributes.protocol==='NVMe')))add('primera_media','conflict',{},mediaRule.evidence);
    if(base&&/2-way/.test(base.description)&&controller.attributes.nodes>2)add('primera_base','conflict',{},fact(rules,'primera_base')?.evidence||base.evidence);
  }
  const cords=fact(rules,'power_cords');
  if(cords&&of('cable').filter(o=>/Power Cord/i.test(o.description)).reduce((n,o)=>n+o.quantity,0)<2*(1+enclosures.reduce((n,o)=>n+o.quantity,0)))add('power_cords','missing',{},cords.evidence);

  let tape={status:'unknown',nativeTB:null,slots:null};
  if(m.access==='tape') {
    const limit=fact(rules,'tape_limits'),modules=1+enclosures.reduce((n,o)=>n+o.quantity,0),drives=of('tape_drive');
    if(limit) {
      tape.slots=limit.params.slots*modules;
      if(limit.params.max_modules!==null&&modules>limit.params.max_modules)add('tape_modules','conflict',{},limit.evidence);
      if(limit.params.max_drives!==null&&drives.reduce((n,o)=>n+o.quantity,0)>limit.params.max_drives*modules)add('tape_drives','conflict',{},limit.evidence);
    }
    if(enclosures.length)add('tape_expansion','unknown',{},enclosures.flatMap(o=>o.evidence));
    const compat=data.rules.find(rule=>rule.kind==='lto_media'),legacy=data.rules.find(rule=>rule.kind==='lto_legacy'),caps=data.rules.find(rule=>rule.kind==='lto_capacity');
    for(const media of of('media')) {
      for(const drive of drives) {
        const allowed=compat?.params.generations[drive.attributes.lto]||legacy?.params.writes[drive.attributes.lto];
        if(allowed&&!allowed.includes(media.attributes.lto))add('tape_media','conflict',{},compat.evidence);
        else if(!allowed)add('tape_media_unknown','unknown',{},media.evidence);
      }
    }
    if(r.existingLTO)for(const drive of drives) {
      const readable=compat?.params.generations[drive.attributes.lto]||legacy?.params.reads[drive.attributes.lto];
      if(readable&&!readable.includes(r.existingLTO))add('tape_media','conflict',{},compat.evidence);
      else if(!readable)add('tape_media_unknown','unknown',{},drive.evidence);
    }
    const total=of('media').reduce((n,o)=>n+(o.attributes.pack_qty??0)*o.quantity,0);
    if(tape.slots!==null&&total>tape.slots)add('bay_count','advisory',{location:'tape slots; rotate or store excess media offline'},limit.evidence);
    if(caps&&of('media').length&&of('media').every(o=>o.attributes.pack_qty&&caps.params.native_tb[o.attributes.lto])) {
      tape.nativeTB=of('media').reduce((n,o)=>n+o.quantity*o.attributes.pack_qty*caps.params.native_tb[o.attributes.lto],0);
      tape.status='estimate';add('tape_capacity','advisory',{},caps.evidence);
    }
  }
  const usableRule=base?(rules.find(rule=>rule.kind.startsWith('storeonce_capacity_')&&rule.params.sku===base.sku)||rules.find(rule=>rule.params.sku===base.sku&&Object.hasOwn(rule.params,'usable_tb'))):null;
  let usableTB=null,basis='unknown';
  const fullyAllocated=of('drive').length>0&&of('drive').every(o=>o.attributes.pack_qty&&allocations.get(o.id)===o.quantity*o.attributes.pack_qty);
  const supportedRAID=fact(rules,'raid');
  if(groups.length&&fullyAllocated&&groups.every(g=>g.status==='estimate'&&supportedRAID?.params.levels.includes(g.raid))) { usableTB=groups.reduce((n,g)=>n+g.usableTB,0);basis='raid_estimate';add('capacity_estimate','advisory'); }
  if(usableRule) {
    const upgrades=of('capacity_upgrade'),p=usableRule.params;
    if(p.upgrade_sku&&upgrades.every(o=>o.sku===p.upgrade_sku)) {
      const count=upgrades.reduce((n,o)=>n+o.quantity,0);
      if(count>p.max_upgrades)add('enclosure_count','conflict',{},usableRule.evidence);
      else if(count<p.minimum_upgrades)add('missing','missing',{category:'capacity_upgrade'},usableRule.evidence);
      else {usableTB=p.usable_tb+p.upgrade_tb*count;basis='documented_local';}
    } else if(!upgrades.length&&!of('enclosure').length) {usableTB=p.usable_tb;basis='documented_base';}
    // Cloud Bank licenses and mixed/unencoded upgrades do not increase local capacity.
  }
  if(findings.some(f=>f.status==='conflict')) {usableTB=null;basis='unknown';}
  if(usableTB===null&&m.access!=='tape')add('capacity_unknown','unknown');
  const target=capacityPlan(r).requiredTB,backup=backupPlan(r);
  const needed=m.access==='block'||m.access==='object'?target:backup.requiredTB;
  const available=m.access==='tape'?tape.nativeTB:usableTB;
  if(needed!==null&&available!==null&&available<needed)add('capacity_short','conflict');
  add('qualification','unknown',{},m.evidence);add('performance_unknown','unknown');
  if(r.immutable)add('immutable_gap','unknown');
  const status=findings.some(f=>f.status==='conflict')?'blocked':findings.some(f=>f.status==='missing')?'incomplete':'needs_review';
  const bom=selected.map(o=>({option_id:o.id,sku:o.sku,description:o.description,category:o.category,quantity:o.quantity,assurance:o.assurance,evidence:o.evidence}));
  return {schema_version:1,status,full_qualification:false,model:m,configuration:s,requirements:r,capacity:{usableTB,basis,groups,tape},planning:{primary:capacityPlan(r),backup},findings,bom};
}

export function exportJSON(report) { return JSON.stringify(report,null,2); }
export function exportCSV(report,lang='en') {
  const cell=value=>{let text=String(value??''); if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  const rows=[['csvSKU','csvDescription','csvCategory','csvQuantity','csvAssurance','csvStatus'].map(key=>message(key,lang)),...report.bom.map(o=>[o.sku,o.description,o.category,o.quantity,o.assurance,report.status]),[message('csvReview',lang),message('qualification',lang),'','','',report.status],...report.findings.map(f=>[message('csvFinding',lang),f.message,f.key,'',f.status,report.status])];
  return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
