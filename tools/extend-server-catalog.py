"""Rebuild the Bulletin extension from checked-in, entity-decoded QuickSpecs text.

Original four platforms are preserved. Only complete description/SKU pairs are
imported; conditional tables remain explicit technical-review gaps.
"""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / 'docs/server-sources'
SPECS = {
    '17118': ('ML30 Gen11', 27, 'tower', None, 1, 4, ['4LFF-NHP', '4LFF-HP', '8SFF-HP']),
    '16305': ('ML110 Gen11', 40, 'tower', None, 1, 16, ['4LFF-NHP', '4LFF-HP', '8SFF-HP', '16SFF-HP', '8LFF-HP']),
    '17105': ('ML350 Gen12', 17, 'tower', None, 2, 32, ['8SFF', '4LFF', '12EDSFF']),
    '17119': ('DL20 Gen11', 29, 'rack', 1, 1, 4, ['4SFF-HP', '2LFF-HP', '2LFF-NHP']),
    '17258': ('DL580 Gen12', 12, 'rack', 4, 4, 64, ['8SFF', '16SFF', '24SFF', '32SFF', '8EDSFF', '16EDSFF', '24EDSFF', '32EDSFF']),
}
PATTERNS = {
    'cpu': r'Intel[®]? (?:Xeon[®]?(?:-(?:Gold|Silver|Bronze))?|Pentium[®]?) ([E\dG][\w-]+(?: \dP)?) ([\d.]+)GHz (\d+)-core (\d+)W (?:FIO )?Processor for HPE (P\d{5}-B21)',
    'memory': r'HPE (\d+)GB \(1x\d+GB\) (Single|Dual|Quad|Octal) Rank x([48]) DDR5-(\d+) [^:]{0,90}?Memory Kit (P\d{5}-[BF]21)',
    'storage': r'HPE ([\d.]+)(TB|GB) (?:SAS|SATA|NVMe)[^:()]{0,145}?(?:SSD|HDD) ((?:P\d{5}|\d{6})-B21)',
    'controller': r'HPE (?:MR|SR)\d{3,4}i-[op][^:]{0,100}?Storage Controller (P\d{5}-B21)',
    'psu': r'HPE (?:\d+W(?:-\d+W)?) (?:Flex Slot|M-CRPS) (?:Platinum|Titanium)[^:.]{0,65}?Power Supply Kit ((?:P\d{5}|\d{6})-B21)',
    'gpu': r'NVIDIA (?:RTX )?[^:]{0,45}?\d+\s?GB [^:]{0,50}?Accelerator(?: for HPE)? ([A-Z][0-9][A-Z0-9]{3}C)',
    'backplane': r'HPE ProLiant (?:Compute )?(?:ML\d+|DL20|DL580) Gen1[12] [^:()]{0,80}?Drive Cage Kit (P\d{5}-B21)',
    'riser': r'HPE ProLiant (?:Compute )?(?:ML\d+|DL20|DL580) Gen1[12](?:/Gen12)? [^:()]{0,80}?Riser Kit (P\d{5}-B21)',
    'cooling': r'HPE ProLiant (?:Compute )?[^:()]{0,55}?Gen1[12] [^:()]{0,55}?(?:Fan Kit|Fan and Baffle Kit|Heatsink Kit|Heat Sink Kit) (P\d{5}-B21)',
    'nic': r'(?:Broadcom|Intel[®]?|Mellanox|NVIDIA) [^:]{0,120}?Ethernet [^:]{0,100}?Adapter(?: for HPE)? (P\d{5}-B21)',
    'hba': r'HPE SN\d{4}[EQ] \d+Gb [12]-port Fibre Channel Host Bus Adapter ([A-Z][0-9][A-Z0-9]{3}A)',
    'kits': r'HPE (?:ProLiant (?:Compute )?[^:()]{0,95}?|NS204i[^:()]{0,80}?|\d+W Smart Storage [^:()]{0,80}?|Smart Storage [^:()]{0,80}?)(?:Kit|Device) (P\d{5}-B21)',
}

def field(path): return {'op': 'field', 'path': path}
def compare(op, path, value): return {'op': op, 'left': field(path), 'right': {'op': 'literal', 'value': value}}
def both(*args): return {'op': 'all', 'args': list(args)}
def either(*args): return {'op': 'any', 'args': list(args)}
def selected(sku, quantity=1): return {'op': 'selected', 'sku': sku, 'quantity': quantity}

def build():
    catalog_path = ROOT / 'dist/catalog.json'
    data = json.loads(catalog_path.read_text(encoding='utf-8'))
    for key in ['models', 'options', 'rules']:
        data[key] = [entry for entry in data[key] if entry.get('model_id', entry.get('id')) not in SPECS]
    fa_path = ROOT / 'tools/rule-fa.json'
    fa = json.loads(fa_path.read_text(encoding='utf-8'))
    report = []
    for mid, (short, version, form, rack, sockets, dimms, chassis) in SPECS.items():
        raw = (SOURCES / f'{mid}.txt').read_text(encoding='utf-8')
        sha = hashlib.sha256(raw.encode()).hexdigest()
        docid = f'{mid}:{version}:{sha[:12]}'
        def evidence(quote):
            start = raw.index(quote)
            return dict(qs_id=mid, version=version, document_id=docid, sha256=sha, start=start, end=start+len(quote), quote=quote)
        def quote(pattern):
            match = re.search(pattern, raw, re.I)
            if not match: raise ValueError(f'{mid}: missing evidence: {pattern}')
            return match[0]
        opts = {}
        for category, pattern in PATTERNS.items():
            for match in re.finditer(pattern, raw):
                desc, sku = match[0], match.groups()[-1]
                if sku in opts or any(word in desc for word in ['Notes:', 'Not Supported', 'requires ', 'HPE HPE']): continue
                # Never join two option rows into one description.
                if len(re.findall(r'\b(?:P\d{5}-[BF]21|\d{6}-B21|[A-Z][0-9][A-Z0-9]{3}[AC])\b', desc)) != 1: continue
                attrs = {}
                if category == 'cpu':
                    model, ghz, cores, watts, _ = match.groups()
                    model = model.replace(' ', '')
                    attrs = dict(model=model, brand='Intel Pentium' if 'Pentium' in desc else 'Intel Xeon', cores=int(cores), tdp_w=int(watts), base_ghz=float(ghz), generation=6 if 'Gen12' in short else int(model[1]) if re.match(r'[3456][45]\d\d', model) else None)
                if category == 'memory':
                    cap, rank, width, speed, _ = match.groups()
                    attrs = dict(capacity_gb=int(cap), rank={'Single':1,'Dual':2,'Quad':4,'Octal':8}[rank], width=int(width), speed_mts=int(speed), type='UDIMM' if 'Unbuffered' in desc else 'RDIMM')
                if category in ['storage', 'backplane']:
                    attrs['form'] = 'EDSFF' if any(x in desc for x in ['E3S','E3.S','EDSFF']) else 'SFF' if 'SFF' in desc else 'LFF' if 'LFF' in desc else 'M.2' if 'M.2' in desc else None
                    if category == 'storage':
                        attrs.update(capacity_gb=float(match[1])*(1000 if match[2]=='TB' else 1), protocol=next(p for p in ['NVMe','SAS','SATA'] if p in desc))
                    else: attrs['protocols'] = ['SAS','SATA','NVMe'] if 'Tri-Mode' in desc else ['NVMe'] if any(x in desc for x in ['NVMe','EDSFF']) else ['SAS','SATA']
                if category == 'psu': attrs.update(watts=int(re.search(r'HPE (\d+)W',desc)[1]), highline=False, variable_output='W-' in desc)
                if category == 'gpu': attrs['vram_gb']=int(re.search(r'(\d+)\s?GB',desc)[1])
                if category == 'controller': attrs.update(cached='Cache' in desc and 'without Cache' not in desc, mount='OCP' if 'OCP' in desc else 'PCIe')
                if category == 'riser': attrs['position']='secondary' if 'Secondary' in desc or 'Second GPU' in desc else 'tertiary' if 'Tertiary' in desc else 'primary'
                if category == 'nic': attrs['mount']='OCP' if 'OCP' in desc else 'PCIe'
                opts[sku] = dict(model_id=mid, sku=sku, category=category, description=desc, attributes=attrs, assurance='listed', evidence=[evidence(desc)])
        rules = []
        def rule(suffix, domain, when, assertion, message, persian, source, minimum=False):
            rules.append(dict(id=f'{mid}:{suffix}', model_id=mid, domain=domain, when=when, assert_=assertion, message=message, repair=None, minimum_required=minimum, classification='explicit_hpe', review_status='source_checked_not_independently_certified', evidence=[evidence(source)]))
            rules[-1]['assert'] = rules[-1].pop('assert_')
            fa[suffix] = persian
        def kit(suffix, when, skus, source, domain='thermal'):
            rule(suffix,domain,when,both(*(selected(s) for s in skus)), 'Selected configuration requires kit(s): '+', '.join(skus), 'این پیکربندی به کیت‌های زیر نیاز دارد: '+', '.join(skus),source)
        def review(suffix, domain, source, when=True):
            rule(suffix,domain,when,compare('eq','review.'+suffix,True), 'Technical review required: '+domain+' configuration, limits and accessory requirements.', 'بررسی فنی پیکربندی، محدودیت‌ها و لوازم موردنیاز در بخش '+{'storage':'ذخیره‌سازی','thermal':'خنک‌سازی','pcie':'اسلات‌های توسعه','power':'توان','memory':'حافظه','network':'شبکه','base':'شاسی'}[domain]+' لازم است.',source)
        # Platform limits are source-backed model facts, also applied to imports and UI controls.
        slot_quote = quote(r'DIMM Slots Available.{0,140}?DIMM[s]? [Ss]lots?[^.]{0,90}' if mid not in ['17118','17119'] else r'(?:four|4) DIMMs? slots[^.]{0,100}')
        rule('bulletin_cpu_count_'+mid,'cpu',True,compare('in','cpu.count',[2,4] if mid=='17258' else list(range(1,sockets+1))),f'This platform supports CPU quantities: {"2 or 4" if mid=="17258" else "1" if sockets==1 else "1 or 2"}.',f'تعداد پردازنده مجاز برای این مدل: {"۲ یا ۴" if mid=="17258" else "۱" if sockets==1 else "۱ یا ۲"}.',quote(r'2 or 4 Processor Configurations' if mid=='17258' else r'Processor Sockets 1 Socket available' if mid=='16305' else r'With one processor installed, four DIMMs slots are available' if mid in ['17118','17119'] else r'Up to 2 of the following processors'))
        rule('bulletin_dimm_limit_'+mid,'memory',compare('gt','summary.dimm_count',0),compare('lte','summary.max_dimms_per_cpu',dimms//sockets),f'Maximum {dimms//sockets} DIMMs per installed processor.',f'حداکثر {dimms//sockets} ماژول حافظه به ازای هر پردازنده نصب‌شده.',slot_quote)
        if mid in ['16305','17105']:
            allowed=[1,2,4,6,8,12,16] if mid=='16305' else [1,2,4,8,12,16]
            rule('bulletin_dimm_population_'+mid,'memory',compare('gt','summary.dimm_count',0),compare('in','summary.dimms_per_cpu',allowed),'DIMMs must be balanced across installed CPUs; allowed per-CPU counts: '+', '.join(map(str,allowed))+'.','حافظه باید به‌طور متوازن میان پردازنده‌ها توزیع شود؛ تعداد مجاز برای هر پردازنده: '+', '.join(map(str,allowed))+'.',quote(r'(?:Quantity|quantity) of memory DIMMs selected per socket must be[^.]+'))
        if mid=='16305':
            rule('bulletin_96gb_cpu','memory',compare('in','cpu.model',['4510','4509Y','3508U']),compare('eq','summary.has_96_5600',False),'96GB DDR5-5600 is not supported with 4510, 4509Y or 3508U.','حافظه ۹۶ گیگابایتی DDR5-5600 با پردازنده‌های 4510، 4509Y و 3508U پشتیبانی نمی‌شود.',quote(r'96GB DDR5-5600 DIMM is not supported with 4510, 4509Y and 3508U processors'))
            kit('bulletin_ml110_gpu_fan',compare('gt','features.gpu_count',0),['P49984-B21'],quote(r'Redundant Fan Kit \(P49984-B21\) is required for any accelerators'))
            kit('bulletin_ml110_l4_kits',selected('S0K89C'),['P53487-B21','P66618-B21'],quote(r'This GPU requires Redundant Fan Kit \(P49984-B21\), GPU Riser Kit \(P53487-B21\), L4 GPU Support Kit \(P66618-B21\)[^.]+'))
            kit('bulletin_ml110_second_l4',both(selected('S0K89C'),compare('gt','features.gpu_count',1)),['P53488-B21'],quote(r'Second GPU Riser Kit \(P53488-B21\) is required for additional L4 GPU'))
            kit('bulletin_ml110_second_riser',selected('P53488-B21'),['P53487-B21'],quote(r'When this Riser Kit is selected, HPE ProLiant ML110 Gen11 GPU Riser Kit \(P53487-B21\) is required'), 'pcie')
            rule('bulletin_ml110_l4_tdp','cpu',selected('S0K89C'),compare('lte','cpu.tdp_w',150),'L4 GPU requires CPU TDP at most 150W.','با کارت L4، توان حرارتی پردازنده نباید بیش از ۱۵۰ وات باشد.',quote(r'When this GPU is selected, Processor is limited to up to 150W TDP'))
            rule('bulletin_ml110_gpu_limit','gpu',compare('gt','features.gpu_count',0),compare('lte','features.gpu_count',2),'Maximum two GPUs on this platform.','حداکثر دو کارت گرافیک برای این مدل مجاز است.',quote(r'Supports up to 2x L4 GPUs'))
            kit('bulletin_ml110_sas_fan',compare('eq','features.drive_needs_ml110_fan',True),['P49984-B21'],quote(r'Redundant Fan Kit \(P49984-B21\) is required for SAS 10K SFF HDD, SAS 15K SFF HDD and SAS4 SFF SSD'))
            kit('bulletin_ml110_boot_kits',selected('P48183-B21'),['P49984-B21','P61742-B21'],quote(r'HPE NS204i-u Gen11 NVMe Hot Plug Boot Optimized Storage Device P48183-B21.{0,900}?When NS204i-u is selected, this Enablement Kit is required'))
            rule('bulletin_ml110_nhp_boot','storage',selected('P48183-B21'),compare('ne','chassis','4LFF-NHP'),'NS204i-u is not supported on the NHP chassis.','دستگاه بوت NS204i-u روی شاسی NHP پشتیبانی نمی‌شود.',quote(r'NS204i-u is not supported by NHP CTO server'))
        if mid=='17118':
            kit('bulletin_ml30_heatsink',compare('eq','cpu.tdp_w',95),['P65108-B21'],quote(r'Requires High Performance Heatsink \(P65108-B21\)'))
            kit('bulletin_ml30_hp_fan',compare('in','chassis',['4LFF-HP','8SFF-HP']),['P65106-B21'],quote(r'Must be selected in 4LFF Hot Plug CTO Server and 8SFF Hot Plug CTO Server'))
            kit('bulletin_ml30_pcie_fan',both(compare('eq','chassis','4LFF-NHP'),compare('gt','features.pcie_card_count',0)),['P65106-B21'],quote(r'Must be selected in 4LFF NHP CTO Server[^.]+'))
            kit('bulletin_ml30_rps',compare('in','features.psu_watts',[500,800,1000]),['P65104-B21'],quote(r'Required for HPE 500W, 800W and 1000W Redundant Flex Slot Power Supplies'), 'power')
            kit('bulletin_ml30_mr216_cable',both(selected('P47785-B21'),compare('eq','chassis','4LFF-HP')),['P57104-B21'],quote(r'Required if MR216i-p controller is selected; 1 pc for 4LFF model server'), 'storage')
            kit('bulletin_ml30_6353_heatsink',selected('P77164-B21'),['P65108-B21'],quote(r'Intel[®]? Xeon[®]? 6353P.{0,150}?Requires High Performance Heatsink \(P65108-B21\)'))
            kit('bulletin_ml30_sff_cable',both(compare('eq','chassis','8SFF-HP'),compare('gt','features.controller_count',0)),['P67850-B21'],quote(r'HPE ProLiant ML30 Gen11 SFF PCIe Cable Kit P67850-B21 Notes: Required for 8SFF model with controller only'), 'storage')
            kit('bulletin_ml30_m2',compare('eq','features.drive_form','M.2'),['P65741-B21'],quote(r'HPE ProLiant ML30 Gen11 iLO/NIC/M\.2/COM Port Kit P65741-B21 Notes:.{0,210}?M\.2 SSD installation'), 'storage')
            kit('bulletin_ml30_m2_fan',both(compare('eq','features.drive_form','M.2'),compare('eq','chassis','4LFF-NHP')),['P65106-B21'],quote(r'Must be selected in 4LFF NHP CTO Server[^.]+'))
        if mid in ['17118','17119']:
            review('bulletin_udimm_channels_'+mid,'memory',quote(r'Symmetric configurations are required within each channel[^.]+'))
        if mid=='17119':
            rule('bulletin_dl20_nhp_controller','storage',compare('eq','chassis','2LFF-NHP'),compare('eq','features.controller_count',0),'Tri-mode controllers are not supported on the 2LFF NHP model.','کنترلرهای Tri-mode روی مدل 2LFF NHP پشتیبانی نمی‌شوند.',quote(r'Tri-Mode controllers are not supported on the 2LFF NHP Model Server'))
            kit('bulletin_dl20_controller_ocp',both(compare('ne','chassis','2LFF-NHP'),compare('eq','features.controller_mount','OCP')),['P65412-B21'],quote(r'HPE ProLiant DL20 Gen11 2LFF/4SFF OCP Cable Kit P65412-B21 Notes:[^.]+'), 'storage')
            kit('bulletin_dl20_controller_pcie',both(compare('ne','chassis','2LFF-NHP'),compare('eq','features.controller_mount','PCIe')),['P65413-B21'],quote(r'HPE ProLiant DL20 Gen11 2LFF/4SFF PCIe Cable Kit P65413-B21 Notes:[^.]+'), 'storage')
            kit('bulletin_dl20_nvme_cage',both(compare('eq','features.drive_protocol','NVMe'),compare('ne','features.drive_form','M.2')),['P65406-B21'],quote(r'NVMe U.3 drives can be selected only if P65406-B21[^.]+'), 'storage')
            rule('bulletin_dl20_nvme_count','storage',both(compare('eq','features.drive_protocol','NVMe'),compare('ne','features.drive_form','M.2')),compare('lte','features.drive_count',2),'Maximum two U.3 NVMe drives.','حداکثر دو درایو NVMe U.3 مجاز است.',quote(r'Maximum of two NVMe U.3 is allowed per configuration'))
            rule('bulletin_dl20_nvme_chassis','storage',both(compare('eq','features.drive_protocol','NVMe'),compare('ne','features.drive_form','M.2')),compare('eq','chassis','4SFF-HP'),'U.3 NVMe expansion requires the 4SFF platform; M.2 needs separate review.','توسعه NVMe U.3 به شاسی 4SFF نیاز دارد؛ پیکربندی M.2 باید جداگانه بررسی شود.',quote(r'HPE ProLiant DL20 Gen11 2SFF HDD Enablement Kit P65406-B21 Notes:[^.]+'))
            kit('bulletin_dl20_m2',compare('eq','features.drive_form','M.2'),['P65407-B21'],quote(r'Selection of P65407-B21.{0,140}?required to support M\.2 SSD Drives'), 'storage')
            kit('bulletin_dl20_ocp_nic',compare('eq','features.nic_mount','OCP'),['P65411-B21'],quote(r'HPE ProLiant DL20 Gen11 External OCP Cable Kit P65411-B21 Notes: This option required to support OCP Networking adaptors'), 'network')
            kit('bulletin_dl20_boot',selected('P48183-B21'),['P65410-B21'],quote(r'HPE ProLiant DL20 Gen11 NS204i-u Hot Plug Boot Optimized Storage Device Cable Kit P65410-B21'), 'storage')
        if mid=='17105':
            for suffix,op,tdp,sku in [('standard','lt',225,'P72358-B21'),('performance','gte',225,'P72359-B21')]:
                for qty in [1,2]:
                    rule(f'bulletin_ml350g12_{suffix}_sink_{qty}','thermal',both(compare(op,'cpu.tdp_w',tdp),compare('eq','cpu.count',qty)),selected(sku,qty),'Select the required heatsink type, one per processor: '+sku+'.','برای هر پردازنده یک هیت‌سینک از نوع موردنیاز انتخاب کنید: '+sku+'.',quote(r'Heat Sink Select heat sink that matching processor quantity\.'))
            kit('bulletin_ml350g12_300w_fans',compare('gte','cpu.tdp_w',300),['P47219-B21','P47902-B21'],quote(r'Processors with TDP equal to or greater than 300W require both Redundant Fan Kit \(P47219-B21\) and Second CPU Fan Kit \(P47902-B21\)'))
            kit('bulletin_ml350g12_256_fan',compare('eq','summary.has_256',True),['P47219-B21'],quote(r'Redundant fan configuration is required for 256GB memory'))
            kit('bulletin_ml350g12_gpu_fan',compare('gt','features.gpu_count',0),['P47219-B21'],quote(r'Redundant fan feature is required, 300W~350W TDP processor, 256GB memory, EDSFF, GPU selected'))
            kit('bulletin_ml350g12_second_fan',either(compare('eq','cpu.count',2),compare('gt','features.gpu_count',0),compare('eq','summary.has_256',True),compare('eq','features.edsff',True)),['P47902-B21'],quote(r'Both Redundant Fan Kit \(P47219-B21\) and Second CPU Fan Kit \(P47902-B21\) are required.{0,240}?GPU selected'))
            kit('bulletin_ml350g12_edsff_fan',compare('eq','features.edsff',True),['P47219-B21'],quote(r'Redundant fan feature is required, 300W~350W TDP processor, 256GB memory, EDSFF, GPU selected'))
            rule('bulletin_ml350g12_second_cpu','pcie',compare('eq','features.secondary_riser',True),compare('eq','cpu.count',2),'Secondary riser slots require CPU 2.','اسلات‌های رایزر ثانویه به پردازنده دوم نیاز دارند.',quote(r'Secondary Riser 4x8 Slots[^.]+?5 CPU 2 PCIe 5.0'))
            for sku,limit in [('S0K90C',4),('S2L70C',2),('S6W30C',4),('S5T74C',8),('S0K89C',4)]:
                rule('bulletin_ml350g12_gpu_limit_'+sku,'gpu',selected(sku),compare('lte','features.gpu_count',limit),f'Maximum {limit} accelerators of this type.',f'حداکثر {limit} کارت شتاب‌دهنده از این نوع مجاز است.',quote(r'Accelerator configuration information.{0,1600}?S6W30C NVIDIA RTX PRO 4500 32GB Accelerator for HPE 165W Gen5 x16 4'))
            for qty in [1,2,3,4]:
                rule(f'bulletin_ml350g12_gpu_power_{qty}','thermal',both(either(*(selected(s) for s in ['S0K90C','S2L70C','S6W30C'])),compare('eq','features.gpu_count',qty)),selected('P47221-B21',qty),'Select one P47221-B21 GPU power cable per accelerator.','برای هر شتاب‌دهنده یک کابل توان P47221-B21 انتخاب کنید.',quote(r'This power Cable Kit \(P47221-B21\) is required for L40, L40S, RTX PRO 4500 Accelerator\. - Each power Cable Kit supports up to one accelerator'))
            kit('bulletin_ml350g12_l4_external_fan',selected('S0K89C'),['P47220-B21'],quote(r'External GPU Fan Kit \(P47220-B21\) is required to provide advanced cooling with this GPU'))
            review('bulletin_ml350g12_gpu_layout','thermal',quote(r'Refer to following GPU information table[^.]+'),compare('gt','features.gpu_count',0))
        if mid=='17258':
            rule('bulletin_dl580_psu_2p','power',compare('eq','cpu.count',2),compare('in','features.psu_count',[1,2]),'Two-CPU configurations require one or two PSUs.','پیکربندی دو پردازنده به یک یا دو منبع تغذیه نیاز دارد.',quote(r'For 2 processor configurations, select a minimum \(1\) and a maximum \(2\) power supplies'))
            rule('bulletin_dl580_psu_4p','power',compare('eq','cpu.count',4),compare('in','features.psu_count',[2,4]),'Four-CPU configurations require two or four PSUs.','پیکربندی چهار پردازنده به دو یا چهار منبع تغذیه نیاز دارد.',quote(r'For 4 processor configurations, select either \(2\) or \(4\) power supplies'))
            rule('bulletin_dl580_nic','network',True,compare('gte','features.nic_count',1),'Select a network adapter: this platform has no embedded production networking.','یک کارت شبکه انتخاب کنید؛ این مدل شبکه داخلی برای ترافیک کاری ندارد.',quote(r'Network Ports None as standard\. The choice of stand-up or OCP networking card is required'),True)
            for qty in [2,4]:
                rule(f'bulletin_dl580_sinks_{qty}','thermal',both(compare('eq','cpu.count',qty),compare('eq','features.direct_liquid_cooling',False)),selected('P80382-B21',qty),'Air cooling requires one P80382-B21 heatsink per CPU.','در خنک‌سازی هوایی، برای هر پردازنده یک هیت‌سینک P80382-B21 لازم است.',quote(r'Contains one Heat Sink per Kit'))
            kit('bulletin_dl580_dlc',compare('eq','features.direct_liquid_cooling',True),['P78016-B21','P62042-B21'],quote(r'HPE ProLiant Compute DL580 Gen12 Direct Liquid Cooling Configure-to-order FIO Kit P78016-B21.{0,600}?Qty 1 55cm Tube Kit must be selected'))
            review('bulletin_dl580_memory_layout','memory',slot_quote)
            rule('bulletin_dl580_dlc_no_air','thermal',selected('P78016-B21'),{'op':'not','arg':selected('P80382-B21')},'Direct liquid cooling cannot be mixed with air heatsinks.','خنک‌سازی مستقیم مایع نباید با هیت‌سینک هوایی ترکیب شود.',quote(r'Cannot be mixed with any other heat sinks'))
        if mid in ['17105','17258']:
            rule('bulletin_drive_cage_'+mid,'base',True,compare('gte','features.backplane_count',1),'Select the required drive cage/backplane for the chassis.','کیت قفسه درایو یا بک‌پلین موردنیاز شاسی را انتخاب کنید.',quote(r'Chassis Types.{0,300}' if mid=='17105' else r'Drive Cages Choice of.{0,180}'),True)
        if mid in ['17118','16305','17119']:
            review('bulletin_nhp_storage_'+mid,'storage',quote(r'(?:Non-Hot Plug|NHP).{0,200}'),compare('eq','chassis','2LFF-NHP' if mid=='17119' else '4LFF-NHP'))
        if mid in ['17118','16305']:
            rule('bulletin_nhp_sata_'+mid,'storage',both(compare('eq','chassis','4LFF-NHP'),compare('gt','features.drive_count',0),compare('ne','features.drive_form','M.2')),compare('eq','features.drive_protocol','SATA'),'Non-hot-plug LFF drive cages support SATA drives only.','قفسه LFF غیرهات‌پلاگ فقط از درایو SATA پشتیبانی می‌کند.',quote(r'Non-Hot Plug LFF SATA.{0,60}' if mid=='17118' else r'4 LFF NHP SATA Drive Cage'))
        if mid=='16305':
            rule('bulletin_ml110_sas_controller','storage',compare('eq','features.drive_protocol','SAS'),compare('gte','features.controller_count',1),'SAS drives require a storage controller.','درایو SAS به کنترلر ذخیره‌سازی نیاز دارد.',quote(r'Embedded controller can only support SATA drive, additional storage controller is required to support SAS drive'))
        if mid!='17258':
            rule('bulletin_psu_limit_'+mid,'power',compare('gt','features.psu_count',0),compare('lte','features.psu_count',2),'Maximum two power supplies on this platform.','حداکثر دو منبع تغذیه برای این مدل مجاز است.',quote(r'(?:Add a second 500W Flex Slot Power Supply to get 1\+1 power redundancy|Selection of two HPE Flex Slot power supplies provide 1\+1 power redundancy)'))
        # Cached controllers require source-listed battery/capacitor options, with exact model cable length.
        battery = ['P01367-B21','P02381-B21'] if mid in ['16305','17105','17258'] else ['P01366-B21']
        present = [s for s in battery if s in raw]
        if any(o['category']=='controller' and o['attributes']['cached'] for o in opts.values()):
            rule('bulletin_cache_backup_'+mid,'storage',compare('eq','features.controller_cache',True),either(*(selected(s) for s in present)),'Cached storage controllers require the appropriate battery/capacitor: '+', '.join(present)+'.','کنترلر ذخیره‌سازی دارای کش به باتری یا خازن مناسب نیاز دارد: '+', '.join(present)+'.',quote(r'(?:HPE 96W Smart Storage[^.]{0,130}P0136[67]-B21)'))
        # Preserve table-driven constraints as unresolved, never as certified compatibility.
        for suffix,domain,pattern in [('storage_layout','storage',r'(?:Storage Controllers|Drive Cage and Backplane).{0,450}'),('thermal_envelope','thermal',r'(?:System Fans|Heat Sinks).{0,450}'),('power_budget','power',r'(?:HPE Power Advisor|Power Supplies).{0,350}'),('pcie_layout','pcie',r'(?:Expansion Slots|Riser Cards).{0,450}')]:
            review('bulletin_'+suffix+'_'+mid,domain,quote(pattern))
        # Add source-listed accessory identities referenced by rules, never fabricate SKUs.
        def references(node):
            if not isinstance(node,dict): return []
            found=[node['sku']] if node.get('op')=='selected' else []
            for value in node.values():
                if isinstance(value,dict): found+=references(value)
                if isinstance(value,list):
                    for item in value: found+=references(item)
            return found
        for r in rules:
            for sku in references(r['assert'])+references(r['when']):
                if sku not in opts:
                    desc=quote(r'(?:HPE|NVIDIA) [^:]{0,150}?'+re.escape(sku))
                    # If a row cannot be isolated, show the SKU with its exact occurrence as evidence.
                    if len(re.findall(r'\bP\d{5}-B21\b',desc))>1: desc=sku
                    opts[sku]=dict(model_id=mid,sku=sku,category='cooling' if any(x in desc for x in ['Fan','Sink','Heatsink']) else 'kits',description=desc,attributes={},assurance='requirement_reference',required_by=[r['id']],evidence=[evidence(desc)])
        for cat in ['cpu','memory','storage','psu']:
            if not any(o['category']==cat for o in opts.values()): raise ValueError(f'{mid}: no {cat} options')
        for o in opts.values():
            if o['category']=='psu' and o['sku'] in ['P38997-B21','P44712-B21']:o['attributes']['highline']=True
        model=dict(id=mid,name='HPE ProLiant '+('Compute ' if 'Gen12' in short else '')+short,short=short,document_id=docid,version=version,form_factor=form,rack_u=rack,tags=['general','tower' if form=='tower' else 'expansion'],evidence=[evidence(quote(r'Form Factor[^.]{0,180}'))],coverage={d:'partial' if any(r['domain']==d and not r['id'].split(':')[1].startswith('bulletin_'+d+'_layout') for r in rules) else 'missing' for d in ['base','cpu','memory','storage','pcie','gpu','power','thermal','network','firmware','licensing','ecosystem']},rule_count=len(rules),qualification='partial_rules',dimms=dimms,sockets=sockets,cpu_counts=[2,4] if mid=='17258' else list(range(1,sockets+1)),chassis=chassis,generation=12 if 'Gen12' in short else 11,requires_nic=mid=='17258',requires_backplane=mid in ['17105','17258'],psu_slots=4 if mid=='17258' else 2)
        data['models'].append(model);data['options'].extend(opts.values());data['rules'].extend(rules)
        counts={cat:sum(o['category']==cat for o in opts.values()) for cat in PATTERNS}
        report.append(dict(id=mid,model=short,version=version,sha256=sha,source=f'docs/server-sources/{mid}.txt',counts=counts,rules=len(rules)))
        print(short,counts,'rules',len(rules))
    data['version']='snapshot-61a873388fa7-rules1-bulletin-gen11-gen12-v1'
    catalog_path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    fa_path.write_text(json.dumps(fa,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (SOURCES/'manifest.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')

if __name__=='__main__': build()
