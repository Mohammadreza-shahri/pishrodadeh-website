"""Verify every exported excerpt against the supplied read-only source database."""
import argparse
import hashlib
import json
import re
import sqlite3
import zipfile
from pathlib import Path

ap=argparse.ArgumentParser(description=__doc__)
ap.add_argument('--source',type=Path,required=True)
args=ap.parse_args()
root=Path(__file__).resolve().parents[1]
data=json.loads((root/'storage/catalog.json').read_text(encoding='utf-8'))
db=sqlite3.connect((args.source/'index.db').as_uri()+'?mode=ro',uri=True)
db.row_factory=sqlite3.Row
texts={}
for doc in data['documents']:
    row=db.execute('select * from QuickSpecs where QSRecordId=?',(doc['id'],)).fetchone()
    assert row is not None,doc['id']
    assert row['QSVersion']==doc['version'],doc['id']
    text=re.sub(r'\s+',' ',str(row['QSSearchText'])).strip()
    assert hashlib.sha256(text.encode('utf-8')).hexdigest()==doc['sha256'],doc['id']
    with zipfile.ZipFile(args.source/doc['archive']) as archive:
        assert hashlib.sha256(archive.read(doc['primary_file'])).hexdigest()==doc['html_sha256'],doc['id']
    texts[doc['id']]=text
checked=0
for entity in [*data['models'],*data['options'],*data['rules']]:
    for e in entity['evidence']:
        assert texts[e['qs_id']][e['start']:e['end']]==e['quote'],entity['id']
        checked+=1
assert len({r['id'] for r in data['rules']})==len(data['rules'])
assert len({m['id'] for m in data['models']})==len(data['models'])
print(f"Verified {len(texts)} document hashes and {checked} exact source excerpts. Source library opened read-only.")
