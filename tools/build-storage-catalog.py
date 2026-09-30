"""Read the supplied Product Bulletin library; write a conservative storage snapshot.

No source files are changed. HTML ordering rows, not bare SKU co-occurrence, are
used for parts. Every exported assertion has an exact normalized-text excerpt.
Run with --source PATH; use --check to verify reproducibility without writing.
"""
import argparse
import hashlib
import json
import re
import sqlite3
import zipfile
from datetime import datetime, timedelta
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPECS = {
    '13551': ('msa', 'block', ['P2000 G3']),
    '14884': ('msa', 'block', ['1040']), '15896': ('msa', 'block', ['1050']),
    '14603': ('msa', 'block', ['2040']), '15639': ('msa', 'block', ['2042']),
    '15935': ('msa', 'block', ['2050']), '15936': ('msa', 'block', ['2052']),
    '16614': ('msa', 'block', ['1060']), '16615': ('msa', 'block', ['2060']),
    '16616': ('msa', 'block', ['2062']), '17254': ('msa', 'block', ['2070', '2072']),
    '13258': ('msl', 'tape', ['MSL4048']),
    '17271': ('msl', 'tape', ['MSL2024']), '16082': ('msl', 'tape', ['MSL3040']),
    '14604': ('msl', 'tape', ['MSL6480']),
    '16891': ('alletra', 'block', ['5010H', '5010', '5030', '5050']),
    '16722': ('alletra', 'block', ['6010', '6030', '6050', '6070', '6090']),
    '16726': ('alletra', 'block', ['9060', '9080']),
    '17095': ('alletra', 'block', ['B10000']), '17247': ('alletra', 'object', ['X10000']),
    '15933': ('nimble', 'block', ['HF20C', 'HF20H', 'HF20', 'HF40C', 'HF40', 'HF60C', 'HF60']),
    '15932': ('nimble', 'block', ['AF20Q', 'AF20', 'AF40', 'AF60', 'AF80']),
    '15934': ('nimble', 'secondary', ['SF100', 'SF300']),
    '16425': ('primera', 'block', ['A630', 'C630', 'A650', 'C650', 'A670', 'C670']),
    '14996': ('storeonce', 'backup', ['3720', '3760', '5720', '7700', '3660', '5260', '5660']),
    '16420': ('storeonce', 'backup', ['VSA']),
    '14450': ('storeonce', 'backup', ['2700', '4500', '4700', '4900', '6500']),
    '13218': ('storeonce', 'backup', ['D2D']), '14153': ('storeonce', 'backup', ['B6200']),
}
SKU = re.compile(r'(?:[A-Z]{1,2}\d[A-Z0-9]{2,6}|(?:P\d{5}|\d{6})-[A-Z0-9]{3})(?:#[A-Z0-9]{3})?')

def normal(text):
    return re.sub(r'\s+', ' ', text).strip()

class TableRows(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.cells, self.rows = [], [], []
        self.sup = 0
        self.row_notes, self.conditional_rows = [], set()
    def handle_starttag(self, tag, attrs):
        if tag == 'sup':
            self.sup += 1
            self.row_notes[:] = [True for _ in self.row_notes]
        if tag == 'tr':
            self.stack.append([])
            self.row_notes.append(False)
        if tag in ('td', 'th'): self.cells.append([])
        if tag in ('p', 'br', 'li'):
            for cell in self.cells: cell.append(' ')
    def handle_data(self, text):
        if self.sup: return
        for cell in self.cells: cell.append(text)
    def handle_endtag(self, tag):
        if tag == 'sup': self.sup = max(0,self.sup-1)
        if tag in ('td', 'th') and self.cells:
            cell = normal(''.join(self.cells.pop()))
            if self.stack: self.stack[-1].append(cell)
        if tag == 'tr' and self.stack:
            row = self.stack.pop()
            notes = self.row_notes.pop()
            if row:
                if notes: self.conditional_rows.add(len(self.rows))
                self.rows.append(row)

def category(description):
    d = description.lower()
    if 'service' in d or 'care pack' in d or 'tech care' in d: return None
    if 'drive upgrade kit' in d and 'ultrium' in d: return 'tape_drive'
    if 'data cartridge' in d and 'cleaning' not in d: return 'media'
    if 'capacity upgrade' in d or 'capacity enablement' in d: return 'capacity_upgrade'
    if 'expansion' in d and any(x in d for x in ['shelf', 'enclosure', 'module']): return 'enclosure'
    if 'drive enclosure' in d: return 'enclosure'
    if 'cache' in d and any(x in d for x in ['bundle', 'upgrade']): return 'cache'
    if any(x in d for x in ['flash bundle', 'hdd bundle', 'hdd configure', 'ssd', 'hdd', 'solid state drive', 'hard drive']) and not any(x in d for x in ['cable', 'adapter', 'base array', 'controller']): return 'drive'
    if 'disk enclosure' in d: return 'enclosure'
    if re.search(r'\bmsa\b', d) and re.search(r'\bstorage(?:\s|$)',d) and not any(x in d for x in ['license','ltu','kit','cable','sfp','enclosure','drive','controller upgrade']): return 'base'
    if 'controller' in d and 'base array' not in d and 'storage array' not in d: return 'controller'
    if any(x in d for x in ['base array', 'base system', 'base module', 'storage base', '0-drive', 'base configuration', '2u chassis']): return 'base'
    if re.search(r'\bmsa\b', d) and 'storage' in d and not any(x in d for x in ['license', 'ltu', 'kit', 'bundle', 'cable', 'sfp', 'enclosure', 'drive']): return 'base'
    if any(x in d for x in ['adapter', 'host bus', 'hba']): return 'adapter'
    if 'switch' in d: return 'switch'
    if any(x in d for x in ['license', 'ltu', 'saas', 'software and support']): return 'license'
    if 'power supply' in d: return 'power'
    if any(x in d for x in ['cable', 'cord', 'transceiver', 'sfp']): return 'cable'
    if any(x in d for x in ['rail', 'rackmount', 'encryption kit', 'magazine', 'barcode', 'bar code']): return 'accessory'
    return None

def attributes(desc, cat):
    a = {}
    if 'SFF' in desc: a['form'] = 'SFF'
    elif 'LFF' in desc: a['form'] = 'LFF'
    if 'NVMe' in desc: a['protocol'] = 'NVMe'
    elif 'SAS' in desc: a['protocol'] = 'SAS'
    elif 'SATA' in desc: a['protocol'] = 'SATA'
    if 'iSCSI' in desc: a['host_protocol'] = 'iscsi'
    elif re.search(r'Fibre Channel|\bFC\b', desc, re.I): a['host_protocol'] = 'fc'
    elif cat in ('base', 'tape_drive') and 'SAS' in desc: a['host_protocol'] = 'sas'
    if cat == 'drive':
        a['media_type'] = 'ssd' if any(x in desc for x in ['SSD','Flash','Solid State']) else 'hdd'
        if '10K' in desc: a['rpm'] = 10000
        elif '7.2K' in desc: a['rpm'] = 7200
        # A bundle's headline capacity is not the capacity of an individual disk.
        bundle = re.search(r'(\d+)\s*[xX]\s*([\d.]+)\s*(TB|GB)', desc)
        cap = re.search(r'([\d.]+)\s*(TB|GB)', desc)
        if bundle:
            a.update(pack_qty=int(bundle[1]), capacity_tb=float(bundle[2]) / (1000 if bundle[3] == 'GB' else 1))
        elif cap and not any(x in desc.lower() for x in ['bundle', 'pack']):
            a.update(pack_qty=1, capacity_tb=float(cap[1]) / (1000 if cap[2] == 'GB' else 1))
        else: a.update(pack_qty=None, capacity_tb=None)
    if cat in ('tape_drive', 'media'):
        lto = re.search(r'LTO[- ]?(\d+)', desc)
        if lto: a['lto'] = int(lto[1])
        a['worm'] = 'WORM' in desc
        pack = re.search(r'(\d+) (?:Data )?Cartridges|(?:Library Pack|Labeled) (\d+)', desc, re.I)
        a['pack_qty'] = int(next(g for g in pack.groups() if g)) if pack else None
        if cat == 'media' and not any(x in desc for x in ['Pallet', 'Pack', 'Cartridges']): a['pack_qty'] = 1
    if cat == 'enclosure':
        slots = re.search(r'(\d+)[- ]drive', desc, re.I)
        if slots: a['slots'] = int(slots[1])
    if cat == 'controller':
        nodes = re.search(r'(\d+)[- ]node', desc, re.I)
        if nodes: a['nodes'] = int(nodes[1])
    return a

def build(source):
    con = sqlite3.connect((source / 'index.db').as_uri() + '?mode=ro', uri=True)
    con.row_factory = sqlite3.Row
    data = dict(schema_version=1, source='Supplied HPE Product Bulletin snapshot', documents=[], models=[], options=[], rules=[], inventory=[], coverage=dict(full_qualification=False))
    for row in con.execute('select * from QuickSpecs order by cast(QSRecordId as integer)'):
        qs = str(row['QSRecordId'])
        text = normal(str(row['QSSearchText']))
        title = text.split(' Overview')[0][:180]
        if re.search(r'\b(MSA|MSL\d*|Alletra|Nimble|Primera|StoreOnce)\b', title, re.I):
            data['inventory'].append(dict(qs_id=qs, title=title, version=row['QSVersion'], retired_in_snapshot=bool(row['QSDiscontinued']), included=qs in SPECS))
        if qs not in SPECS: continue
        with zipfile.ZipFile(source / row['QSFileName']) as archive:
            raw = archive.read(row['QSPrimaryFileName'])
        encoding = 'utf-8' if b'charset=utf-8' in raw.lower() else 'cp1252'
        parser = TableRows()
        parser.feed(raw.decode(encoding, errors='replace'))
        sha = hashlib.sha256(text.encode('utf-8')).hexdigest()
        doc = dict(id=qs, title=title, version=row['QSVersion'], sha256=sha, html_sha256=hashlib.sha256(raw).hexdigest(), text_normalization='collapse whitespace in QSSearchText; trim', snapshot_modified=(datetime(1899,12,30)+timedelta(days=row['QSLastModified'])).date().isoformat(), retired_in_snapshot=bool(row['QSDiscontinued']), archive=row['QSFileName'], primary_file=row['QSPrimaryFileName'])
        # Arbitrary links in a QuickSpec often point to other products or services.
        # Only explicitly identified official document links belong to this source.
        doc['url'] = {'17254':'https://www.hpe.com/psnow/doc/a50009222enw', '17271':'https://www.hpe.com/us/en/collaterals/collateral.a50009239enw.html', '16082':'https://www.hpe.com/us/en/collaterals/collateral.a00026511enw.html', '13258':'https://www.hpe.com/us/en/collaterals/collateral.c04154359.html'}.get(qs)
        data['documents'].append(doc)

        def evidence(quote):
            start = text.find(quote)
            if start < 0: return None
            return dict(qs_id=qs, version=doc['version'], sha256=sha, start=start, end=start+len(quote), quote=quote, url=doc['url'])

        family, access, names = SPECS[qs]
        for name in names:
            key = f'{family}-{name.lower().replace(" ", "-")}'
            prefix = {'msa':'HPE MSA ', 'msl':'HPE ', 'alletra':'HPE Alletra ', 'nimble':'HPE Nimble ', 'primera':'HPE Primera ', 'storeonce':'HPE StoreOnce '}[family]
            anchor = re.search(r'\b'+re.escape(name)+r'\b', text)
            if not anchor: raise ValueError(f'Model {name} absent from {qs}')
            ev = evidence(text[max(0,anchor.start()-40):min(len(text),anchor.end()+100)])
            data['models'].append(dict(id=key, name=prefix+name, short=name, family=family, access=access, access_modes=[access], qs_id=qs, lifecycle='retired_in_snapshot' if doc['retired_in_snapshot'] else 'active_in_snapshot', lifecycle_basis='QuickSpecs document status; model availability and entitlement require confirmation.', evidence=[ev]))

        seen, matrix = set(), []
        for row_index,cells in enumerate(parser.rows):
            header = [c for c in cells if c in names]
            if len(header)>1: matrix = header
            sku_cells = [c for c in cells if SKU.fullmatch(c)]
            descriptions = [c for c in cells if re.match(r'^(?:HPE|HP|Nimble) ', c) and len(c)<350]
            if len(sku_cells)!=1 or len(descriptions)!=1: continue
            sku, desc = sku_cells[0], descriptions[0]
            if sku in seen: continue
            cat = category(desc)
            if not cat: continue
            quote = normal(' '.join(cells))
            ev = evidence(quote)
            if ev is None: continue  # Never manufacture offsets from HTML alone.
            seen.add(sku)
            named = [n for n in names if re.search(r'\b'+re.escape(n)+r'\b', desc)]
            flags = [c for c in cells if re.fullmatch(r'(?:Yes|No)\d*\*?', c, re.I)]
            supported, rejected = [], []
            scope = 'unknown'
            conditional_matrix=bool(flags and (row_index in parser.conditional_rows or any(c not in ('Yes','No') for c in flags)))
            if conditional_matrix:
                scope = 'unknown'  # Superscript conditions are absent from the search-text excerpt.
            elif matrix and len(flags)==len(matrix) and all(c in ('Yes','No') for c in flags):
                supported = [n for n,f in zip(matrix,flags) if f=='Yes']
                rejected = [n for n,f in zip(matrix,flags) if f=='No']
                scope = 'matrix'
            elif named:
                supported, scope = named, 'named'
            elif len(names)==1:
                supported, scope = names, 'document'
            model_ids = [m['id'] for m in data['models'] if m['qs_id']==qs and (m['short'] in supported or scope=='unknown')]
            a = attributes(desc,cat)
            data['options'].append(dict(id=f'{qs}:{sku}', qs_id=qs, sku=sku, description=desc, category=cat, attributes=a, model_ids=model_ids, excluded_models=[m['id'] for m in data['models'] if m['qs_id']==qs and m['short'] in rejected], scope=scope, conditional_matrix=conditional_matrix, assurance='source_listed', evidence=[ev]))

        # Only constraints with a matching source excerpt are emitted.
        def rule(kind, pattern, **params):
            match = re.search(pattern, text, re.I)
            if not match: return
            if any(r['id']==f'{qs}:{kind}' for r in data['rules']): return
            ev = evidence(match[0])
            data['rules'].append(dict(id=f'{qs}:{kind}', qs_id=qs, kind=kind, params=params, evidence=[ev]))
        if family=='msa':
            rule('raid', r'RAID (?:Levels supported:|levels supported:|level support:).{0,200}', levels=['1','5','6','10']+(['MSA-DP+'] if 'MSA-DP+' in text else []))
            rule('msa_bays', r'Maximum number of drives per (?:2U )?array enclosure 24 SFF (?:or|/) 12 LFF', slots={'SFF':24,'LFF':12})
            if qs=='16614': rule('msa_bays', r'Maximum number of drives per (?:2U )?array enclosure 24 SFF', slots={'SFF':24})
            expansion = re.search(r'Expansion Drive Enclosures 0\s*[-–]\s*(\d+) enclosures', text, re.I)
            if expansion: rule('max_enclosures', re.escape(expansion[0]), maximum=int(expansion[1]))
            rule('read_cache_only', r'RAID 0 \(Striping\) is supported for [Rr]ead [Cc]ache only\.')
        if qs=='17247':
            match=re.search(r'Native.namespace NFSv4\.1 file system is now supported.{0,50}object storage',text,re.I)
            if match:
                for m in data['models']:
                    if m['qs_id']==qs:
                        m['access_modes'].append('file')
                        m['evidence'].append(evidence(match[0]))
        if qs=='17271':
            rule('tape_limits', r'Maximum Number of Drives 2 Maximum Capacity.{0,160}', slots=24, max_drives=2, max_modules=1)
            rule('lto_media', r'Eighth-generation LTO Ultrium drives read and write LTO -7 and LTO-8 media\. Ninth-generation LTO Ultrium drives read and write LTO-8 and LTO-9 media\.', generations={'8':[7,8],'9':[8,9]})
            rule('lto_legacy', r'The LTO standard for backward compatibility up to generation seven is to write back one generation and read back two generations\.', reads={str(n):[n-2,n-1,n] for n in (5,6,7)}, writes={str(n):[n-1,n] for n in (5,6,7)})
            rule('lto_capacity', r'Maximum\s*Capacity Native 432 TB \(LTO-9\) 288 TB \(LTO-8\)', native_tb={'9':18,'8':12}, basis='Native library capacity divided by its documented 24 slots.')
        if qs in ('16082','14604','13258'):
            slots, drives, modules = {'16082':(40,3,16),'14604':(80,6,7),'13258':(48,4,1)}[qs]
            # Values must occur together in a source performance/configuration row;
            # do not emit a rule just because a product name contains the numbers.
            relevant = next((normal(' '.join(r)) for r in parser.rows if any(k in normal(' '.join(r)).lower() for k in ['maximum number of drives','number of cartridge slots','maximum capacity']) and all(str(x) in normal(' '.join(r)) for x in [slots,drives])),None)
            if relevant and evidence(relevant): rule('tape_limits', re.escape(relevant), slots=slots, max_drives=drives, max_modules=modules)
            if qs=='16082':
                emitted=next((r for r in data['rules'] if r['id']==qs+':tape_limits'),None)
                scaling=re.search(r'from 40.slot Base Library Module to 640 slots.{0,50}15 Expansion Modules',text,re.I)
                if emitted and scaling: emitted['evidence'].append(evidence(scaling[0]))
                elif emitted: emitted['params']['max_modules']=None
                drives=re.search(r'Maximum Number of Drives\s*- Per Module 3 HH \(per Module\)',text,re.I)
                if emitted and drives: emitted['evidence'].append(evidence(drives[0]))
                elif emitted: emitted['params']['max_drives']=None
            if qs=='14604':
                rule('tape_limits', r'Number of Slots\s*- Per Module\s*- Per fully expanded Library 80 \(per Module\) 560 \(per Library\)', slots=80, max_drives=6, max_modules=7)
                # The 6-drive limit is a separate excerpt; attach both premises.
                emitted = next((r for r in data['rules'] if r['id']==qs+':tape_limits'),None)
                drive_match = re.search(r'Maximum Number of Drives\s*- Per Module\s*- Per fully expanded Library 6 HH \(per Module\) 42 HH \(per Library\)',text)
                if emitted and drive_match: emitted['evidence'].append(evidence(drive_match[0]))
                elif emitted: data['rules'].remove(emitted)
        if qs=='16425':
            rule('raid', r'HPE Primera only supports RAID 6 for all drive types\.', levels=['6'])
            rule('primera_population', r'For each drive type installed in the array, the minimum supported initial quantity is eight.{0,250}', min_ssd_per_pair=8, min_hdd_per_pair=12)
            rule('primera_media', r'NVMe SSDs are supported in slots 16-23 \(rightmost\) on Primera A-controllers only\. SAS HDDs are supported with Primera C-controllers only\.')
            rule('primera_base', r'The 2-way Storage Configuration Base can host 2 controller nodes.{0,400}')
        if qs=='16726': rule('raid', r'HPE Alletra Storage 9000 only supports RAID 6\.', levels=['6'])
        if family in ('alletra','nimble'):
            rule('power_cords', r'(?:arrays and expansion shelves|arrays and shelves).{0,120}require a minimum of 2 power cords per system\.')
        if qs=='14996':
            canonical_tables=list(re.finditer(r'Raw capacity.{0,160}?Usable capacity.{0,180}?SKUs required.{0,350}?(?=Cloud Bank|Max Cloud|Max system|Max total)',text))
            for sku, tb in [('S4P72A',18),('S4P73A',108),('R6U02A',56)]:
                pattern = r'base system \('+sku+r'\) has '+str(tb)+r' TB usable capacity'
                rule('usable_capacity_'+sku, pattern, sku=sku, usable_tb=tb)
            # Ordering table columns establish local capacity without adding Cloud Bank.
            # 3720 enablement combines hardware and different licenses; keep upgrades unknown.
            table3720=next((m[0] for m in canonical_tables if 'S4P72A' in m[0]),None)
            if table3720 and evidence(table3720): rule('usable_capacity_S4P72A',re.escape(table3720),sku='S4P72A',usable_tb=18)
            tables=[('S4P73A',108,'S4P75A',108,1),('S4X41A',144,'S4X43A',144,3),('S6U05A',92,'S6X17A',92,5),('R6U02A',56,'R7M22A',72,2),('R6U03A',0,'R7M23A',144,4),('R6U04A',0,'R7M23A',144,8)]
            for sku,base_tb,upgrade,step,maximum in tables:
                table=next((m[0] for m in canonical_tables if sku in m[0]),None)
                if table and evidence(table):
                    rule('storeonce_capacity_'+sku,re.escape(table),sku=sku,usable_tb=base_tb,upgrade_sku=upgrade,upgrade_tb=step,max_upgrades=maximum,minimum_upgrades=1 if base_tb==0 else 0)
                    # The 5660 eight-upgrade ceiling is demonstrated in its second table.
                    if sku=='R6U04A':
                        tail=next((m[0] for m in canonical_tables if sku in m[0] and '1,152 TB' in m[0]),None)
                        if tail: data['rules'][-1]['evidence'].append(evidence(tail))
                        else: data['rules'][-1]['params']['max_upgrades']=4
    missing = sorted(set(SPECS)-{d['id'] for d in data['documents']})
    if missing: raise ValueError(f'Missing required QuickSpecs: {missing}')
    data['coverage'].update(families=sorted({m['family'] for m in data['models']}), gaps=['SPOCK host/OS/HBA/firmware and backup-software interoperability', 'Full model-specific drive, cache, network, power and license matrices', 'Validated workload performance and usable capacity for CTO flash/hybrid arrays', 'Regional availability, pricing, support entitlement and lifecycle after this snapshot', 'Older Nimble CS-series and other generations absent from the selected library'], excluded_inventory='Cloud-only Alletra, storage servers, dHCI, SAN switches and obsolete MSL5000/6000 are inventoried but outside this array/tape engine.')
    data['coverage']['models_without_base_ordering_rows']=[m['id'] for m in data['models'] if m['short']!='VSA' and not any(o['category']=='base' and m['id'] in o['model_ids'] for o in data['options'])]
    return data

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--source', type=Path, required=True)
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()
    data = build(args.source)
    content = json.dumps(data, ensure_ascii=False, indent=2)+'\n'
    path = ROOT/'storage/catalog.json'
    if args.check:
        if path.read_text(encoding='utf-8')!=content: raise SystemExit('Storage catalog is stale')
    else:
        path.parent.mkdir(exist_ok=True)
        path.write_text(content,encoding='utf-8')
    print(f"Storage snapshot: {len(data['documents'])} documents, {len(data['models'])} models, {len(data['options'])} ordering rows, {len(data['rules'])} rules")

if __name__=='__main__': main()
