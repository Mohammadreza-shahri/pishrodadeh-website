/* Browser implementation of the evidence-backed engine. No network/model calls. */
export const CATEGORIES=['cpu','memory','storage','controller','backplane','hba','gpu','riser','psu','cooling','kits'];
export function initial(){return {schema_version:2,model_id:null,chassis:null,selected:{},extraQty:{},cpuQty:1,memoryQty:8,driveQty:2,gpuQty:1,psuQty:2,raid:'1',inputV:230,cooling:'air',workload:'virtualization',workloadConfirmed:false,visitedSteps:[1],requirements:{ramGB:192,cores:16,storageTB:2,gpuGB:24,vms:20,ramPerVM:8},step:1};}
export function selectedOptions(s,data){return Object.values(s.selected).flat().map(sku=>data.options.find(o=>o.model_id===s.model_id&&o.sku===sku)).filter(Boolean);}
export function getOption(s,data,cat){return selectedOptions(s,data).find(o=>o.category===cat);}
export function quantity(s,o){return o.category==='cpu'?s.cpuQty:o.category==='memory'?s.memoryQty:o.category==='storage'?s.driveQty:o.category==='gpu'?s.gpuQty:o.category==='psu'?s.psuQty:(s.extraQty?.[o.sku]||1);}
function field(o,p){for(const k of p.split('.')){if(o==null||!(k in o))return null;o=o[k];}return o??null;}
export function expression(n,d){if(n==null||typeof n!=='object')return n;const run=x=>expression(x,d);switch(n.op){case 'field':return field(d,n.path);case 'literal':return n.value;case 'selected':return d.items.some(i=>i.sku===n.sku&&i.quantity>=(n.quantity||1));case 'all':{const a=n.args.map(run);return a.includes(false)?false:a.some(x=>x==null)?null:true;}case 'any':{const a=n.args.map(run);return a.includes(true)?true:a.some(x=>x==null)?null:false;}case 'not':{let a=run(n.arg);return a==null?null:!a;}default:{const a=run(n.left),b=run(n.right);if(a==null||b==null)return null;switch(n.op){case 'eq':return a===b;case 'ne':return a!==b;case 'gt':return a>b;case 'gte':return a>=b;case 'lt':return a<b;case 'lte':return a<=b;case 'in':return b.includes(a);default:throw Error('Unknown rule operator');}}}}
export function facts(s,data){const opts=selectedOptions(s,data),one=cat=>opts.find(o=>o.category===cat),cpu=one('cpu'),mem=one('memory'),drive=one('storage'),controller=one('controller');const risers=opts.filter(o=>o.category==='riser');const has=sku=>opts.some(o=>o.sku===sku);return {chassis:s.chassis,upgrade:false,cpu:cpu?{...cpu.attributes,count:s.cpuQty,mixed:false}:{count:s.cpuQty},items:opts.map(o=>({sku:o.sku,quantity:quantity(s,o)})),features:{secondary_riser:risers.some(o=>o.attributes.position==='secondary'),secondary_fh_riser:null,tertiary_riser:risers.some(o=>o.attributes.position==='tertiary'),high_performance_fans:has('P48820-B21')||has('P48908-B21'),controller_cache:controller?controller.attributes.cached:false,controller_count:controller?1:0,controller_mixed:false,trimode_controller:null,gpu_count:one('gpu')?s.gpuQty:0,gpu_mixed:false,drive_count:drive?s.driveQty:0,drive_protocol:drive?.attributes.protocol??null,ns204i:false,edsff:s.chassis?.includes('EDSFF')??false,sas4_mu:null,redundant_fans:null,psu_mixed:false,psu_family:one('psu')?.attributes.watts===1600&&one('psu').description.includes('Platinum')?'1600W Platinum':null,direct_liquid_cooling:s.cooling==='liquid',rear_primary_2lff:has('P48823-B21'),rear_secondary_2lff:has('P51095-B21'),primary_pcie_cards:null,secondary_pcie_cards:null,slots5_10_used:null,slot2_used:null,pcie_card_count:opts.filter(o=>['controller','hba','gpu'].includes(o.category)).length,media_box:null,storage_layout:null,vroc_nvme:null},power:{input_v:s.inputV},summary:{dimm_count:mem?s.memoryQty:0,max_dimms_per_cpu:mem?Math.ceil(s.memoryQty/s.cpuQty):0,has_96_5600:mem?mem.attributes.capacity_gb===96&&mem.attributes.speed_mts===5600:false,has_96_4800:mem?mem.attributes.capacity_gb===96&&mem.attributes.speed_mts===4800:false,count_96_4800:mem?.attributes.capacity_gb===96&&mem.attributes.speed_mts===4800?s.memoryQty:0,count_96_5600:mem?.attributes.capacity_gb===96&&mem.attributes.speed_mts===5600?s.memoryQty:0,has_256:mem?.attributes.capacity_gb===256,mixed_is_3ds:false,mixed_rank:false,mixed_width:false,population_380a_valid:mem?s.cpuQty===2&&s.memoryQty%2===0&&[1,2,4,6,8,12].includes(s.memoryQty/2):true}};}
export function activeFindings(s,data){const f=facts(s,data),out=[];for(const r of data.rules.filter(r=>r.model_id===s.model_id)){const when=expression(r.when,f),ok=expression(r.assert,f);if(when===false||ok===true)continue;out.push({...r,status:when==null||ok==null?'unknown':'conflict'});}return out;}
export function directConflicts(s,data,items=selectionItems(s)){const out=[],cpu=getOption(s,data,'cpu'),mem=getOption(s,data,'memory'),drive=getOption(s,data,'storage'),psu=getOption(s,data,'psu'),gpu=getOption(s,data,'gpu');const add=(key,category)=>out.push({key,category});

 if(mem&&cpu&&s.model_id==='16911'&&cpu.attributes.generation===5&&mem.attributes.speed_mts===4800)add('memoryGeneration','memory');
 if(mem&&cpu&&s.model_id==='16913'&&((cpu.attributes.generation===4&&mem.attributes.speed_mts!==4800)||(cpu.attributes.generation===5&&![5200,5600].includes(mem.attributes.speed_mts))))add('memoryGeneration','memory');
 if(drive&&s.model_id==='16913'&&drive.attributes.protocol!=='NVMe')add('nvmeOnly','storage');
 const form=s.chassis?.includes('SFF')?'SFF':s.chassis?.includes('LFF')?'LFF':s.chassis?.includes('EDSFF')?'EDSFF':s.model_id==='16913'?'SFF':null;
 if(drive&&drive.attributes.form&&form&&drive.attributes.form!==form&&drive.attributes.form!==getOption(s,data,'backplane')?.attributes.form)add('driveForm','storage');
 if(psu&&psu.attributes.highline&&(s.inputV<200||s.inputV>240))add('highline','psu');
 if(gpu&&s.workload.startsWith('ai')&&gpu.attributes.vram_gb<s.requirements.gpuGB)add('gpuMemory','gpu');
 if(mem&&s.memoryQty>(s.model_id==='16913'?24:32))add('memorySlots','memory');
 return out;}
const RULE_PATHS={cpu:['cpu.','summary.'],memory:['summary.'],storage:['features.drive_'],controller:['features.controller_','features.trimode'],gpu:['features.gpu_'],riser:['features.secondary','features.tertiary','features.pcie'],psu:['features.psu_','power.'],backplane:['chassis','features.rear_'],cooling:['features.high_performance_fans'],kits:[]};
const MULTI_CATEGORIES=['riser','cooling','kits'];
function selectionItems(s){
 const items=[];
 for(const [cat,skus] of Object.entries(s.selected))for(const sku of skus)items.push({sku,quantity:quantity(s,{category:cat})});
 return items;
}
export function optionCheck(s,data,o){
 if(o.model_id!==s.model_id)return{hidden:true,reasons:['platform']};
 const multi=MULTI_CATEGORIES.includes(o.category);
 const paths=RULE_PATHS[o.category]||[];
 function relevant(n){if(!n||typeof n!=='object')return false;if(n.op==='field')return paths.some(p=>n.path.startsWith(p));if(n.op==='selected')return n.sku===o.sku;return Object.values(n).some(v=>Array.isArray(v)?v.some(relevant):relevant(v));}
 const selectedNow=s.selected[o.category]||[];
 const forced=multi?[...new Set([...selectedNow,o.sku])]:[o.sku];
 /* Forcing the category replaces its `selected` entries wholesale, so every rule-visible fact
    except the tested SKU is fixed for the whole category. Evaluate the rules ONCE against the
    trial that keeps the other categories intact, then let each option answer only the two
    SKU-dependent questions: is the rule relevant/conflicting for this SKU (`relevant`), and
    does its assert name this SKU (`containsSelected`). */
 const trial={...s,selected:{...s.selected,[o.category]:forced}};
 const items=selectionItems(trial);
 const findings=activeFindings(trial,data);
 const conflicts=new Set();
 const requires=new Set();
 for(const r of findings){
  if(r.status!=='conflict')continue;
  if(!(relevant(r.when)||relevant(r.assert)))continue;
  conflicts.add(r.id);
  if(containsSelected(r.assert)||r.domain==='thermal')requires.add(r.id);
 }
 const requirements=findings.filter(r=>requires.has(r.id));
 const incompatible=findings.filter(r=>conflicts.has(r.id)&&!requires.has(r.id)&&!(r.minimum_required&&r.domain==='gpu'&&o.category!=='gpu'));
 /* A conflicting option that is ALREADY selected stays hidden with no reason keys, which is how
    renderParts discovers it for the "selected but incompatible" callout. Preserve that exactly. */
 const direct=directConflicts(trial,data,items).filter(x=>x.category===o.category);
 const reasons=direct.map(x=>x.key);
 return{hidden:direct.length>0||incompatible.length>0,reasons,requirements,conflicts:incompatible,review:true};
}

function containsSelected(n){return n&&typeof n==='object'&&(n.op==='selected'||Object.values(n).some(x=>Array.isArray(x)?x.some(containsSelected):containsSelected(x)));}
export function itemNeeds(n,f){if(expression(n,f)===true)return[];if(!n||typeof n!=='object')return[];if(n.op==='selected')return[{any:[n.sku],quantity:n.quantity||1}];if(n.op==='all')return n.args.flatMap(x=>itemNeeds(x,f));if(n.op==='any'){const skus=n.args.filter(x=>x.op==='selected').map(x=>x.sku);return skus.length?[{any:skus,quantity:1}]:[];}return[];}
export function requiredKits(s,data){const f=facts(s,data),seen=new Set();return activeFindings(s,data).filter(r=>expression(r.when,f)===true).flatMap(r=>itemNeeds(r.assert,f).map(n=>({...n,rule:r}))).filter(n=>{const key=n.any.join('|');if(seen.has(key))return false;seen.add(key);return true;});}
export function stats(s,data){const c=getOption(s,data,'cpu'),m=getOption(s,data,'memory'),d=getOption(s,data,'storage'),g=getOption(s,data,'gpu'),p=getOption(s,data,'psu');let usable=null,raidError=false;const n=s.driveQty,cap=d?.attributes.capacity_gb;if(d){switch(s.raid){case'0':usable=n*cap;break;case'1':if(n===2)usable=cap;else raidError=true;break;case'5':if(n>=3)usable=(n-1)*cap;else raidError=true;break;case'6':if(n>=4)usable=(n-2)*cap;else raidError=true;break;case'10':if(n>=4&&n%2===0)usable=n/2*cap;else raidError=true;break;}}return {cores:c?c.attributes.cores*s.cpuQty:0,memory:m?m.attributes.capacity_gb*s.memoryQty:0,raw:d?cap*n:0,usable,raidError,gpuMemory:g?g.attributes.vram_gb:0,psu:p?p.attributes.watts:0,psuQty:p?s.psuQty:0};}
export function recommend(data,workload){const orders={virtualization:['16911','16910','16912','16913'],database:['16911','16912','16910','16913'],business:['16912','16911','16910','16913'],storage:['16911','16912','16910','16913'],ai_inference:['16913','16911','16912','16910'],ai_training:['16913','16911','16912','16910']};const ids=orders[workload]||orders.virtualization;return ids.map(id=>data.models.find(m=>m.id===id)).filter(Boolean);}
export function validateImport(x,data){if(!x||x.schema_version!==2||!data.models.some(m=>m.id===x.model_id))throw Error('Invalid configuration');const s={...initial(),...x};if(!s.selected||typeof s.selected!=='object')throw Error('Invalid selections');for(const [cat,skus]of Object.entries(s.selected)){if(!CATEGORIES.includes(cat)||!Array.isArray(skus)||skus.length>30)throw Error('Invalid category');for(const sku of skus)if(!data.options.some(o=>o.model_id===s.model_id&&o.sku===sku&&o.category===cat))throw Error('Unknown part');}for(const k of ['cpuQty','memoryQty','driveQty','gpuQty','psuQty'])if(!Number.isInteger(s[k])||s[k]<1||s[k]>128)throw Error('Invalid quantity');s.step=3;return s;}

export function workloadLimits(m,data,req,workload){
 const opts=data.options.filter(o=>o.model_id===m.id),max=(cat,field)=>Math.max(0,...opts.filter(o=>o.category===cat).map(o=>o.attributes[field]||0));
 const limits={memory:max('memory','capacity_gb')*m.dimms,cores:max('cpu','cores')*2,gpu:max('gpu','vram_gb')};
 const blockers=[];if(limits.memory&&req.ramGB>limits.memory)blockers.push('memory');if(limits.cores&&req.cores>limits.cores)blockers.push('cores');if(workload.startsWith('ai')&&req.gpuGB>limits.gpu)blockers.push('gpu');
 return {limits,blockers};
}
