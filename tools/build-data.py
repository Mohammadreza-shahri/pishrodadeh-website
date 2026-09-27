"""Export the existing engine and conservative, source-linked option descriptions."""
import json,sqlite3,re,html,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path('/workspace/scratch/6f974c23d2ce')
pack=json.loads((SOURCE/'hpe-engine/data/rules.json').read_text())
ids=['16911','16910','16912','16913']
con=sqlite3.connect(SOURCE/'inspect/hpe_copilot_catalog/catalog.sqlite');con.row_factory=sqlite3.Row
options=[]
for opt in pack['options']:
 if opt['model_id'] in ids:options.append({**opt,'category':'memory' if opt['category']=='memory' else 'cpu','attributes':{**opt['attributes']},'assurance':'listed'})
# Only complete single-option name + SKU sequences. Thermal table rows and bare co-occurrences are excluded.
patterns={
 'controller':r'HPE (?:MR|SR)\d{3,4}i-[op][^:]{0,110}?Storage Controller (P\d{5}-B21)',
 'hba':r'HPE SN\d{4}[EQ] \d+Gb [12]-port Fibre Channel Host Bus Adapter ([A-Z][0-9][A-Z0-9]{3}A)',
 'psu':r'HPE (?:\d+W(?:-\d+W)?) Flex Slot (?:Platinum|Titanium)[^:]{0,65}?Power Supply Kit ((?:P\d{5}|\d{6})-B21)',
 'backplane':r'HPE ProLiant (?:DL380|DL360|ML350|DL380a) Gen11 [^:()]{0,95}?(?:Drive Cage Kit|Riser Cage Kit) (P\d{5}-B21)',
 'riser':r'HPE ProLiant (?:DL380|DL360|ML350|DL380a) Gen11 [^:()]{0,80}?Riser Kit (P\d{5}-B21)',
 'cooling':r'HPE ProLiant [^:()]{0,60}?Gen11 [^:()]{0,45}?(?:Fan Kit|Heatsink Kit|Heat Sink Kit) (P\d{5}-B21)',
 'gpu':r'NVIDIA (?:H100 NVL 94|H100 80|L40S 48|L40 48|L4 24|A16 64|A2 16)\s?GB (?:PCIe Accelerator|PCIe Non-CEC Accelerator)(?: for HPE)? ([A-Z][0-9][A-Z0-9]{3}C)',
 'storage':r'HPE (?:\d+(?:\.\d+)?)(?:TB|GB) (?:SAS|SATA|NVMe)[^:()]{0,145}?(?:SSD|HDD) (P\d{5}-B21)',
}
for qs in ids:
 row=con.execute('select * from products where qs_record_id=?',(qs,)).fetchone();raw=row['quickspec_text'];sha=hashlib.sha256(raw.encode()).hexdigest();docid=f"{qs}:{row['qs_version']}:{sha[:12]}"
 for cat,pattern in patterns.items():
  seen=set()
  for m in re.finditer(pattern,raw):
   sku=m[1];desc=m[0]
   if sku in seen or any(t in desc for t in ['Notes',' - ','Not Supported','@','must ','requires ','HPE HPE']):continue
   if len(re.findall(r'\b(?:P\d{5}-B21|[A-Z][0-9][A-Z0-9]{3}[AC])\b',desc))!=1:continue
   seen.add(sku);attrs={}
   if cat=='storage':
    cap=re.search(r'HPE ([\d.]+)(TB|GB)',desc);attrs['capacity_gb']=float(cap[1])*(1000 if cap[2]=='TB' else 1)
    attrs['protocol']=next(p for p in ['NVMe','SAS','SATA'] if p in desc)
    attrs['form']='EDSFF' if any(x in desc for x in ['E3S','E3.S','EDSFF']) else 'SFF' if 'SFF' in desc else 'LFF' if 'LFF' in desc else None
   if cat=='gpu':attrs['vram_gb']=int(re.search(r'(\d+)\s?GB',desc)[1])
   if cat=='psu':attrs['watts']=int(re.search(r'HPE (\d+)W',desc)[1]);attrs['highline']=attrs['watts']>=1600;attrs['variable_output']='W-' in desc
   if cat=='controller':attrs['cached']='without Cache' not in desc and 'Cache' in desc;attrs['mount']='OCP' if 'OCP' in desc else 'PCIe'
   if cat=='backplane':
    attrs['form']='EDSFF' if 'EDSFF' in desc else 'SFF' if 'SFF' in desc else 'LFF' if 'LFF' in desc else None
    attrs['protocols']=['SAS','SATA','NVMe'] if 'Tri-Mode' in desc else ['NVMe'] if 'NVMe' in desc or 'EDSFF' in desc else ['SAS','SATA'] if 'SAS/SATA' in desc else None
   if cat=='riser':attrs['position']='secondary' if 'Secondary' in desc else 'tertiary' if 'Tertiary' in desc else 'primary'
   options.append(dict(model_id=qs,sku=sku,category=cat,description=html.unescape(desc),attributes=attrs,assurance='listed',evidence=[dict(qs_id=qs,version=row['qs_version'],document_id=docid,sha256=sha,start=m.start(),end=m.end(),quote=desc)]))
# Source-referenced accessory identities used in activated requirements, kept in their own kits category.
for qs in ids:
 row=con.execute('select * from products where qs_record_id=?',(qs,)).fetchone();raw=row['quickspec_text'];sha=hashlib.sha256(raw.encode()).hexdigest()
 def selected(n):
  if not isinstance(n,dict):return []
  result=[n['sku']] if n.get('op')=='selected' else []
  for v in n.values():
   if isinstance(v,dict):result+=selected(v)
   if isinstance(v,list):
    for x in v:result+=selected(x)
  return result
 for rule in [r for r in pack['rules'] if r['model_id']==qs]:
  for sku in selected(rule['assert']):
   if any(o['model_id']==qs and o['sku']==sku for o in options):continue
   if sku not in raw:continue
   category='cooling' if rule['domain']=='thermal' else 'kits'
   options.append(dict(model_id=qs,sku=sku,category=category,description=sku,attributes={},assurance='requirement_reference',required_by=[rule['id']],evidence=rule['evidence']))
for o in options:
 if o['category']=='cpu':
  model=o['attributes']['model'];o['attributes']['generation']=int(model[1]) if len(model)>=4 and model[1] in '45' else None
 # Generation is decoded from the documented x4xx/x5xx model convention; sources included in original engine.
 if o['category']=='riser' and o['attributes'].get('position')=='primary':o['assurance']='listed'
options=sorted(options,key=lambda o:(ids.index(o['model_id']),o['category'],o['sku']))
models=[m for m in pack['models'] if m['id'] in ids]
for m in models:
 m['short']={'16911':'DL380 Gen11','16910':'DL360 Gen11','16912':'ML350 Gen11','16913':'DL380a Gen11'}[m['id']]
 m['dimms']=24 if m['id']=='16913' else 32
 m['chassis']={'16911':['8SFF','24SFF','8LFF','12LFF','12EDSFF'],'16910':['8SFF','4LFF','20EDSFF'],'16912':['8SFF','4LFF'],'16913':['4DW','8SW']}[m['id']]
result=dict(version=pack['version'],models=models,options=options,rules=[r for r in pack['rules'] if r['model_id'] in ids],coverage={'full_qualification':False,'source':'Supplied HPE QuickSpecs snapshot','note':'Option filtering rejects known conflicts; remaining qualification gaps require technical review.'})
(ROOT/'dist/catalog.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print('Option entries',len(options))
for qs in ids:print(qs,{cat:sum(o['model_id']==qs and o['category']==cat for o in options) for cat in ['cpu','memory',*patterns,'kits']})
