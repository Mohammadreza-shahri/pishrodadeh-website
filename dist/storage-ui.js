import {
  initialRequirements,validateRequirements,nextQuestions,recommend,initialConfiguration,
  validateConfiguration,optionsFor,optionCheck,review,exportJSON,exportCSV,
} from './storage/engine.mjs';
import {message} from './storage/copy.mjs';
import {strings} from './storage-ui-copy.js';
import {el,button,shell,focusHeading} from './studio-ui.js';

const KEY='aria-hpe-storage-v1';
const categories=['base','drive','controller','adapter','enclosure','cache','power','cable','license','switch','tape_drive','media','accessory','capacity_upgrade'];
const steps=['needs','models','parts','review'];
let host,data,lang='fa',state=fresh(),notice='',category='base',query='',family='',role='',limit=8;
function fresh(){return {version:1,step:0,requirements:initialRequirements(),configuration:null};}
const t=key=>strings[lang][key]||strings.en[key]||key;
const number=value=>new Intl.NumberFormat(lang==='fa'?'fa-IR':'en',{maximumFractionDigits:2}).format(value);
const capacity=value=>value===null||value===undefined?t('unknownValue'):number(value)+' TB';
function persist(){
  try{localStorage.setItem(KEY,JSON.stringify(state));}catch{notice='saveFailed';}
}
function restore(){
  try{
    const raw=localStorage.getItem(KEY);if(!raw)return;
    const saved=JSON.parse(raw);
    if(saved.version!==1||!Number.isInteger(saved.step)||saved.step<0||saved.step>3)throw Error('draft');
    const requirements=validateRequirements(saved.requirements);
    const configuration=saved.configuration===null?null:validateConfiguration(saved.configuration,data);
    if(saved.step>0&&!requirements.purposes.length||saved.step>1&&!configuration)throw Error('draft');
    state={version:1,step:saved.step,requirements,configuration};notice='restored';
  }catch{
    state=fresh();notice='corrupt';try{localStorage.removeItem(KEY);}catch{}
  }
}
export async function mount(context){
  host=context;lang=context.lang;
  if(!data){
    const response=await fetch('./storage/catalog.json');
    if(!response.ok)throw Error('Storage catalog unavailable');
    const loaded=await response.json();
    if(!context.isCurrent())return;
    data=loaded;restore();
  }
  if(!context.isCurrent())return;
  render();
}
function go(step){
  state.step=step;query='';limit=8;render();focusHeading();
  window.scrollTo({top:0,behavior:'smooth'});
}
function render(){
  if(!host.isCurrent())return;
  persist();
  const active=document.activeElement, id=active?.id;
  const selection=active?.selectionStart;
  const main=shell(lang,{onHome:()=>{persist();host.onHome();},onLanguage:value=>{
    lang=value;host.onLanguage(value);render();
  }},t('title'),t('lead'));
  main.classList.add('storage-main');
  main.closest('.shell').querySelector('.header-actions').append(button(t('reset'),()=>{
    if(!window.confirm(t('resetConfirm')))return;
    state=fresh();notice='';category='base';role='';family='';go(0);
  }));
  const nav=el('nav',null,'storage-stepper');nav.setAttribute('aria-label',t('title'));
  steps.forEach((key,index)=>{
    const node=button(number(index+1)+' · '+t(key),()=>go(index),index===state.step?'primary':'ghost');
    node.disabled=index===1&&!state.requirements.purposes.length||index>1&&!state.configuration;
    if(index===state.step)node.setAttribute('aria-current','step');
    nav.append(node);
  });
  main.append(nav);
  if(notice){const alert=el('p',t(notice),'storage-alert');alert.setAttribute('role','status');main.append(alert);}
  if(state.step===0)requirementsPage(main);
  if(state.step===1)modelsPage(main);
  if(state.step===2)partsPage(main);
  if(state.step===3)reviewPage(main);
  const footer=el('div',null,'storage-tools');
  const importer=el('input');importer.type='file';importer.accept='.json,application/json';importer.hidden=true;
  importer.addEventListener('change',async()=>{
    const owner=host,file=importer.files[0];if(!file)return;
    try{
      if(file.size>5e6)throw Error('size');
      const report=JSON.parse(await file.text());
      const requirements=validateRequirements(report.requirements);
      const configuration=validateConfiguration(report.configuration,data);
      if(!requirements.purposes.length)throw Error('purpose');
      if(!owner.isCurrent())return;
      state={version:1,step:3,requirements,configuration};notice='';render();focusHeading();
    }catch{if(owner.isCurrent()){notice='importFailed';render();}}
  });
  footer.append(button(t('import'),()=>importer.click()),importer);
  main.append(footer);
  if(id){
    const node=document.getElementById(id);
    if(node){node.focus({preventScroll:true});if(typeof selection==='number'&&['text','search'].includes(node.type))node.setSelectionRange(selection,selection);}
  }
}
function field(label,node,hint){
  const wrap=el('label',null,'field');wrap.append(el('span',label,'field-label'),node);
  if(hint)wrap.append(el('small',hint,'field-hint'));
  return wrap;
}
function selectControl(id,value,choices,onChange,unknown=true){
  const node=el('select');node.id=id;
  if(unknown){const option=el('option',t('unspecified'));option.value='';node.append(option);}
  for(const choice of choices){const option=el('option',choice.label);option.value=String(choice.value);node.append(option);}
  node.value=value===null||value===undefined?'':String(value);
  node.addEventListener('change',()=>onChange(node.value));return node;
}
function numericControl(id,value,min,max,onChange,integer=false){
  const node=el('input');node.id=id;node.type='number';node.min=min;node.max=max;node.step=integer?'1':'any';
  node.value=value===null?'':value;node.inputMode=integer?'numeric':'decimal';
  node.addEventListener('change',()=>{
    if(!node.checkValidity()){node.reportValidity();return;}
    onChange(node.value===''?null:Number(node.value));
  });return node;
}
function requirementsPage(main){
  main.append(el('h2',t('purpose')),el('p',t('noAssumption'),'muted'));
  const grid=el('div',null,'storage-purpose-grid');
  for(const key of ['primary','backup','archive']){
    const chosen=state.requirements.purposes.includes(key);
    const node=button('',()=>{
      state.requirements.purposes=chosen?state.requirements.purposes.filter(p=>p!==key):[...state.requirements.purposes,key];
      notice='';render();
    },'storage-purpose'+(chosen?' selected':''));
    node.id='purpose-'+key;node.setAttribute('aria-pressed',String(chosen));
    node.append(el('strong',t(key)),el('span',t(key+'Lead')));grid.append(node);
  }
  main.append(grid);
  const relevant={purposes:state.requirements.purposes};
  // Conditional questions depend on answers; clear only those answers to retain editable controls.
  const base=nextQuestions(relevant,lang,50);
  const conditional=nextQuestions({...relevant,workload:state.requirements.workload,access:state.requirements.access},lang,50);
  const questions=[...new Map([...base,...conditional].map(q=>[q.key,q])).values()].filter(q=>q.key!=='purposes');
  const fields=el('div',null,'storage-fields');
  for(const q of questions){
    const value=state.requirements[q.key],id='storage-req-'+q.key;
    const update=next=>{
      try{state.requirements=validateRequirements({...state.requirements,[q.key]:next});notice='';render();}
      catch{notice='invalid';render();}
    };
    let input;
    if(q.type==='choice')input=selectControl(id,value,q.choices,raw=>{
      update(raw===''?null:raw==='true'?true:raw==='false'?false:raw);
    });
    else if(q.type==='number')input=numericControl(id,value,q.minimum,q.maximum,update,q.integer);
    else{
      input=el('input');input.id=id;input.type='text';input.maxLength=200;input.value=value??'';
      input.addEventListener('change',()=>update(input.value||null));
    }
    fields.append(field(q.text,input));
  }
  main.append(fields);
  if(state.requirements.purposes.length)planning(main,recommend(data,state.requirements,lang));
  const next=button(t('continue'),()=>go(1),'primary');next.disabled=!state.requirements.purposes.length;
  const tools=el('div',null,'storage-tools');tools.append(next);main.append(tools);
}
function planning(main,advisor){
  const grid=el('div',null,'storage-metrics');
  if(state.requirements.purposes.includes('primary')){
    const card=el('div',null,'storage-metric');
    card.append(el('small',t('target')),el('strong',capacity(advisor.capacity?.requiredTB??advisor.primary?.requiredTB)),el('span',t('estimate')));
    grid.append(card);
  }
  if(state.requirements.purposes.some(p=>p==='backup'||p==='archive')){
    const card=el('div',null,'storage-metric');
    card.append(el('small',t('backupTarget')),el('strong',capacity(advisor.backup.requiredTB)),el('span',t('backupBasis')));
    grid.append(card);
  }
  main.append(grid);
}
function sourceDetails(parent,evidence=[],qsId){
  const document=data.documents.find(d=>d.id===String(qsId||evidence[0]?.qs_id));
  if(!document&&!evidence.length)return;
  const details=el('details',null,'storage-source');details.append(el('summary',t('source')));
  if(document){
    const label=document.title+' · QuickSpecs '+document.id+' · v'+document.version;
    if(document.url){
      const link=el('a',label);
      try{const url=new URL(document.url);if(url.protocol==='https:'){link.href=url.href;link.target='_blank';link.rel='noreferrer';}}catch{}
      details.append(link);
    }else details.append(el('p',label));
    details.append(el('p',document.snapshot_modified));
  }
  for(const item of evidence.slice(0,3)){
    if(item.quote)details.append(el('blockquote',item.quote));
    else if(item.excerpt)details.append(el('blockquote',item.excerpt));
    else if(item.text)details.append(el('blockquote',item.text));
  }
  parent.append(details);
}
function findings(main,list){
  const group=el('div',null,'storage-findings');
  for(const finding of list){
    const card=el('article',null,'storage-finding '+finding.status);
    card.append(el('p',finding.message));
    sourceDetails(card,finding.evidence);group.append(card);
  }
  main.append(group);
}
function searchInput(id,onChange){
  const input=el('input');input.type='search';input.id=id;input.placeholder=t('search');input.value=query;
  input.addEventListener('input',()=>{query=input.value;limit=8;onChange();});
  return field(t('search'),input);
}
function modelsPage(main){
  const advisor=recommend(data,state.requirements,lang);
  if(!state.requirements.purposes.includes(role))role=state.requirements.purposes[0];
  main.append(el('h2',t('shortlist')),el('p',t('shortlistNote'),'muted'),el('p',t('sourceNote'),'muted'));
  const tabs=el('div',null,'storage-tools');
  for(const key of state.requirements.purposes){
    const tab=button(t(key),()=>{role=key;family='';query='';limit=8;render();},role===key?'primary':'ghost');
    tab.setAttribute('aria-pressed',String(role===key));tabs.append(tab);
  }
  main.append(tabs);
  const filters=el('div',null,'storage-filters');
  const families=[...new Set(advisor.roles[role].map(c=>c.model.family))].sort();
  if(!families.includes(family))family='';
  const choice=selectControl('storage-family',family,[{value:'',label:t('all')},...families.map(value=>({value,label:value}))],value=>{family=value;limit=8;render();},false);
  filters.append(searchInput('storage-model-search',render),field(t('models'),choice));main.append(filters);
  const candidates=advisor.roles[role].filter(c=>(!family||c.model.family===family)&&(!query||c.model.name.toLowerCase().includes(query.toLowerCase())||c.model.id.includes(query.toLowerCase())));
  const grid=el('div',null,'storage-model-grid');
  for(const candidate of candidates.slice(0,limit)){
    const m=candidate.model,card=el('article',null,'storage-model-card');card.dataset.modelId=m.id;
    card.append(el('p','HPE / '+m.family,'eyebrow'),el('h3',m.name),
      el('span',t(m.lifecycle==='retired_in_snapshot'?'retired':'sourceActive'),'chip'),
      el('p',t('unknown')+' · '+t('capacity')+' / '+t('technical'),'muted'));
    findings(card,candidate.reasons);sourceDetails(card,m.evidence,m.qs_id);
    const canConfigure=candidate.base_options.length||optionsFor(data,m.id,'license').length;
    if(canConfigure){
      card.append(button(t('select'),()=>{
        if(state.configuration?.model_id!==m.id)state.configuration=initialConfiguration(m.id);
        category='base';notice='';go(2);
      },'primary'));
    }else card.append(el('p',t('missingBase'),'storage-alert'));
    grid.append(card);
  }
  main.append(grid);
  if(!candidates.length)main.append(el('p',t('empty')));
  if(candidates.length>limit)main.append(button(t('more'),()=>{limit+=8;render();}));
  planning(main,advisor);findings(main,advisor.findings);
  main.append(button(t('editNeeds'),()=>go(0)));
}
function model(){return data.models.find(m=>m.id===state.configuration.model_id);}
function currentReport(){return review(data,state.configuration,state.requirements,lang);}
function updateConfiguration(next){
  try{state.configuration=validateConfiguration(next,data);notice='';render();}
  catch{notice='invalid';render();}
}
function setQuantity(option,quantity){
  const next=structuredClone(state.configuration);
  const previous=next.items.find(item=>item.option_id===option.id)?.quantity||0;
  next.items=next.items.filter(item=>item.option_id!==option.id);
  if(quantity>0){
    // A configuration represents one base system.
    if(option.category==='base')next.items=next.items.filter(item=>data.options.find(o=>o.id===item.option_id).category!=='base');
    next.items.push({option_id:option.id,quantity});
  }else{
    next.diskGroups=next.diskGroups.filter(group=>group.option_id!==option.id);
    for(const group of next.diskGroups)if(group.location===option.id)group.location='base';
  }
  const pack=option.attributes.pack_qty;
  if(option.category==='drive'&&quantity>0&&pack){
    const groups=next.diskGroups.filter(group=>group.option_id===option.id);
    if(!groups.length)next.diskGroups.push({option_id:option.id,disks:quantity*pack,spares:0,raid:model().family==='msa'?'6':'vendor',location:'base'});
    else if(groups.length===1&&groups[0].disks===previous*pack&&quantity*pack>groups[0].spares)groups[0].disks=quantity*pack;
  }
  updateConfiguration(next);
}
function reportSummary(main,report){
  const grid=el('div',null,'storage-metrics');
  const card=el('div',null,'storage-metric');
  const isTape=model().access==='tape';
  card.append(el('small',t(isTape?'nativeTape':'capacity')),el('strong',capacity(isTape?report.capacity.tape?.nativeTB:report.capacity.usableTB)),el('span',t('estimate')));
  const status=el('div',null,'storage-metric status-'+report.status);
  status.append(el('small',t('status')),el('strong',t(report.status)),el('span',t('reportLead')));
  grid.append(card,status);main.append(grid);
}
function partsPage(main){
  const m=model(),report=currentReport();
  const heading=el('div',null,'storage-section-head');heading.append(el('h2',m.name),button(t('changeModel'),()=>go(1)));main.append(heading);
  sourceDetails(main,m.evidence,m.qs_id);
  main.append(field(t('hostProtocol'),selectControl('storage-host-protocol',state.configuration.host_protocol,
    ['fc','iscsi','sas'].map(value=>({value,label:message(value,lang)})),
    value=>updateConfiguration({...state.configuration,host_protocol:value||null}))));
  reportSummary(main,report);
  const available=optionsFor(data,m.id);
  const supported=categories.filter(key=>available.some(o=>o.category===key));
  if(!supported.includes(category))category=supported[0];
  const nav=el('nav',null,'storage-category-nav');nav.setAttribute('aria-label',t('parts'));
  for(const key of supported){
    const node=button(t(key),()=>{category=key;query='';limit=8;render();},category===key?'primary':'ghost');
    node.dataset.category=key;node.setAttribute('aria-pressed',String(category===key));nav.append(node);
  }
  main.append(nav,searchInput('storage-part-search',render));
  const matches=available.filter(o=>o.category===category&&(!query||(o.sku+' '+o.description).toLowerCase().includes(query.toLowerCase())));
  const list=el('div',null,'storage-options');
  for(const option of matches.slice(0,limit)){
    const card=el('article',null,'storage-option');card.dataset.optionId=option.id;
    const check=optionCheck(data,m.id,option.id,lang);
    const content=el('div');content.append(el('strong',option.sku,'code'),el('p',option.description),el('span',t(check.status==='listed'?'sourceListed':'unknown'),'chip'));
    sourceDetails(content,option.evidence,option.qs_id);
    const selected=state.configuration.items.find(item=>item.option_id===option.id);
    const actions=el('div',null,'storage-option-actions');
    const quantity=numericControl('qty-'+option.id,selected?.quantity??1,1,option.category==='base'?1:10000,value=>{
      if(selected&&value!==null)setQuantity(option,value);
    },true);
    actions.append(field(t('quantity'),quantity));
    if(selected)actions.append(el('span',t('chosen'),'chip'),button(t('remove'),()=>setQuantity(option,0)));
    else actions.append(button(t('add'),()=>{
      if(quantity.checkValidity()&&quantity.value)setQuantity(option,Number(quantity.value));else quantity.reportValidity();
    },'primary'));
    card.append(content,actions);list.append(card);
  }
  main.append(list);
  if(!matches.length)main.append(el('p',t('empty')));
  if(matches.length>limit)main.append(button(t('more'),()=>{limit+=8;render();}));
  selectedParts(main,report,true);diskGroups(main);
  const tools=el('div',null,'storage-tools');tools.append(button(t('back'),()=>go(1)),button(t('review'),()=>go(3),'primary'));main.append(tools);
}
function selectedParts(main,report,editable=false){
  main.append(el('h2',t('selectedParts')));
  if(!report.bom.length){main.append(el('p',t('noParts')));return;}
  const wrap=el('div',null,'storage-table-wrap'),table=el('table',null,'storage-bom');
  const head=el('tr');for(const key of ['sku','description','quantity'])head.append(el('th',t(key)));
  if(editable)head.append(el('th',t('parts')));
  const thead=el('thead');thead.append(head);table.append(thead);
  const body=el('tbody');
  for(const item of report.bom){
    const row=el('tr');row.append(el('td',item.sku,'code'),el('td',item.description),el('td',number(item.quantity)));
    if(editable){const cell=el('td');cell.append(button(t('remove'),()=>setQuantity(data.options.find(o=>o.id===item.option_id),0)));row.append(cell);}
    body.append(row);
  }
  table.append(body);wrap.append(table);main.append(wrap);
}
function diskGroups(main){
  const drives=state.configuration.items.map(item=>data.options.find(o=>o.id===item.option_id)).filter(o=>o.category==='drive');
  if(!drives.length)return;
  main.append(el('h2',t('driveGroups')),el('p',t('groupLead'),'muted'));
  for(const drive of drives){
    const section=el('section',null,'storage-disk-section');section.append(el('h3',drive.sku));
    const groups=state.configuration.diskGroups.map((group,index)=>({...group,index})).filter(group=>group.option_id===drive.id);
    for(const group of groups){
      const fields=el('div',null,'storage-group-fields');
      const update=(key,value)=>{
        if(value===null){notice='invalid';render();return;}
        const next=structuredClone(state.configuration);next.diskGroups[group.index][key]=value;updateConfiguration(next);
      };
      fields.append(
        field(t('disks'),numericControl('group-disks-'+group.index,group.disks,1,10000,value=>update('disks',value),true)),
        field(t('spares'),numericControl('group-spares-'+group.index,group.spares,0,group.disks-1,value=>update('spares',value),true)),
        field(t('raid'),selectControl('group-raid-'+group.index,group.raid,
          ['vendor','0','1','5','6','10','MSA-DP+'].map(value=>({value,label:value==='vendor'?t('vendorRaid'):value})),value=>update('raid',value),false)),
        field(t('location'),selectControl('group-location-'+group.index,group.location,
          [{value:'base',label:t('baseLocation')},...state.configuration.items.map(item=>data.options.find(o=>o.id===item.option_id)).filter(o=>o.category==='enclosure').map(o=>({value:o.id,label:o.sku}))],
          value=>update('location',value),false)),
        button(t('removeGroup'),()=>updateConfiguration({...state.configuration,diskGroups:state.configuration.diskGroups.filter((_,index)=>index!==group.index)})));
      section.append(fields);
    }
    if(!drive.attributes.pack_qty)section.append(el('p',t('packageUnknown'),'storage-alert'));
    section.append(button(t('addGroup'),()=>updateConfiguration({...state.configuration,diskGroups:[...state.configuration.diskGroups,
      {option_id:drive.id,disks:1,spares:0,raid:'vendor',location:'base'}]})));
    main.append(section);
  }
}
function download(text,type,extension){
  const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),link=el('a');
  link.href=url;link.download='HPE-'+model().id+'-storage-report.'+extension;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function reviewPage(main){
  const report=currentReport();
  main.append(el('h2',model().name),el('p',t('reportLead'),'storage-alert'));
  reportSummary(main,report);planning(main,report.planning);
  const missing=nextQuestions(state.requirements,lang,50);
  if(missing.length){
    const details=el('details',null,'storage-source');details.append(el('summary',t('missingAnswers')+' · '+number(missing.length)));
    for(const question of missing)details.append(el('p',question.text));
    details.append(button(t('editNeeds'),()=>go(0)));main.append(details);
  }
  selectedParts(main,report);main.append(el('h2',t('findings')));findings(main,report.findings);
  const tools=el('div',null,'storage-tools');
  tools.append(button(t('back'),()=>go(2)),
    button(t('json'),()=>download(exportJSON(report),'application/json','json'),'primary'),
    button(t('csv'),()=>download(exportCSV(report,lang),'text/csv;charset=utf-8','csv')),
    button(t('print'),()=>window.print()));main.append(tools);
}
