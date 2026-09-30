# HPE storage planning engine

Standalone, deterministic engine built against website `main` revision `16bdb02`.
It is ready for engineering review before the storage interface is integrated.
The existing server application in `dist/` is unchanged. Nothing is deployed.

## Use

```sh
node tools/test-storage.mjs
node tools/demo-storage.mjs
node tools/demo-storage.mjs --write
```

```js
import {nextQuestions, recommend, initialConfiguration, review} from './engine.mjs';
const questions = nextQuestions({purposes:['primary']}, 'fa');
const advice = recommend(catalog, {
  purposes:['primary'], access:'block', workload:'virtualization',
  usableTB:10, annualGrowthPct:20, years:3, headroomPct:20,
  protocol:'fc', availability:'standard', budgetTier:'value', lifecycle:'active'
}, 'fa');
const configuration = initialConfiguration('msa-2060');
// items use catalog option IDs, e.g. "16615:R0Q74B", and integer pack quantities.
// diskGroups reference selected drives with physical disk counts, RAID and location.
const report = review(catalog, configuration, advice.requirements, 'fa');
```

Load `catalog.json` once through the future application. The engine has no network
or model calls. Persian is the default; all question and finding text also has
English copy. Imported requirements and configurations are validated strictly.

## Source coverage

The source is the supplied local `Catalogs/Worldwide QuickSpecs` library. Its
SQLite index is opened read-only, and its `.RS` ZIP packages are read without
extracting into or modifying the original folder. The builder stores document
versions, dates, SHA-256 hashes, source file identities and exact excerpt offsets.
`inventory` records relevant documents, including ones outside the array scope.

| Family | Model coverage |
|---|---|
| MSA | P2000 G3; 1040/1050/1060; 2040/2042/2050/2052/2060/2062/2070/2072 |
| MSL | MSL2024, MSL4048, MSL3040, MSL6480 |
| Alletra | 5010H/5010/5030/5050; 6010/6030/6050/6070/6090; 9060/9080; B10000; X10000 |
| Nimble | HF20C/HF20H/HF20/HF40C/HF40/HF60C/HF60; AF20Q/AF20/AF40/AF60/AF80; SF100/SF300 |
| Primera | A630/C630, A650/C650, A670/C670 |
| StoreOnce | 3720/3760/5720/7700; 3660/5260/5660; 2700/4500/4700/4900/6500; D2D, B6200, VSA |

The lifecycle flag describes the QuickSpecs document's status in the supplied
snapshot. It does not certify today's orderability, support entitlement, regional
availability or stock. Older products remain available for installed-base planning
and can be filtered out. Models not present in this library, including older Nimble
CS models, are not fabricated. Alletra cloud-only products, storage servers, dHCI,
SAN switches and obsolete MSL5000/6000 documents are inventoried separately.

## Advisor and sizing

The advisor asks conditional questions about primary storage, disk backup, tape
archive or combinations; block/object/file access; workload; capacity and growth;
free-space reserve; host connectivity; availability; investment tier; backup size,
change rate, retained full/incremental backups, backup window, RPO/RTO; offline
copies; immutability; existing LTO tapes; backup software; and lifecycle preference.

Recommendations expose their engineering-policy reasons. Ranking is a planning
shortlist, not a vendor benchmark, price comparison or final qualified solution.
All source-listed candidates carry technical-review status. File access is only
shortlisted where explicitly identified in the selected model's source.

- Primary sizing compounds annual growth and adds the requested free-space reserve.
- TB is decimal; TiB uses 1 TiB = 1.099511627776 TB.
- Backup sizing counts retained fulls plus daily incremental changes. It is a
  conservative planning estimate, with no automatic deduplication or compression.
- Ingestion and recovery estimates report required average MB/s. They do not
  promise actual array, network, backup-software or tape performance.
- Missing values stay unknown. Unknown is never converted to zero or verified.

## Configuration checks

Selections distinguish source-listed, model-specific, matrix-listed and unresolved
family-level scope. Foreign-document parts, mismatched named base/controller
identities and explicit matrix exclusions conflict. Missing variants and footnoted
matrix conditions remain unknown. Bare SKU
co-occurrence is never sufficient to create an ordering option.

Encoded checks cover documented MSA enclosure/bay limits and RAID exclusions;
physical disk-pack quantities and allocation; drive/enclosure form; host protocol;
Primera controller/base node counts, A/C media restrictions and initial population;
documented power-cord requirements; tape module/drive limits and LTO read/write
generations; native tape capacity; and selected StoreOnce local-capacity tables.
The MSL3040 expansion revision, licenses and power remain explicit review items.

Homogeneous RAID arithmetic is an estimate before metadata and system reserve.
MSA-DP+, mixed-disk groups, flash-array vendor layouts and unencoded RAID remain
unknown. Generic RAID arithmetic never establishes Nimble/Alletra usable capacity.
Disk groups contain physical disk counts; BOM quantities count purchasable packs.
The current layout supports a group assigned to one selected enclosure type;
groups spanning enclosure locations require a separate topology review.

StoreOnce raw, local usable, effective and Cloud Bank capacity are kept separate.
Validated 3760/5720/7700/3660/5260/5660 upgrade tables establish local capacity;
3720's combined physical expansion and capacity enablement remains unknown beyond
the documented base. Tape capacity uses native capacity rather than advertised
compressed capacity. Extra tape cartridges can be rotated/offsite and are not
silently counted as simultaneously installed library slots.

## Review status and remaining work

`blocked` means known conflicts; `incomplete` means planning selections are missing;
`needs_review` preserves unresolved qualification. No report claims full HPE
qualification. JSON and formula-safe UTF-8 CSV exports include unresolved findings.

X10000 currently has advisory coverage: no base ordering row was extracted from
this QuickSpec. Its object/NFS capability is source-backed, but exact ordering and
topology must be supplied before SKU configuration. VSA software licenses and older
StoreOnce generations have listed options but incomplete model capacity matrices.
Base-system ordering is also unresolved for P2000 G3, D2D, B6200 and StoreOnce
2700/4500/4700/6500. The machine-readable coverage section lists these gaps.
Automatic selection of a complete BOM is deliberately not claimed.

Before ordering, complete SPOCK/StoreEver host/OS/HBA and backup-software checks,
firmware, connectivity, power, license, encryption/key-management and topology
qualification. Full CTO matrices and measured workload performance still need
model-specific expansion. The future website must display these findings and must
not label a source-listed part as fully compatible.

## Rebuild and source audit

```powershell
python tools/build-storage-catalog.py --source 'C:\ProgramData\HPE Product Bulletin\Catalogs\Worldwide QuickSpecs'
python tools/build-storage-catalog.py --source 'C:\ProgramData\HPE Product Bulletin\Catalogs\Worldwide QuickSpecs' --check
python tools/verify-storage-sources.py --source 'C:\ProgramData\HPE Product Bulletin\Catalogs\Worldwide QuickSpecs'
```

Use an installed Python 3 runtime; the scripts use only the standard library.
Rebuilds fail on missing required documents. New rules must retain exact evidence
and regression checks; refresh the snapshot after reviewing any source changes.
