# Storage engine verification — 30 September 2026

Built locally on `feature/storage-engine`, based on `main` commit `16bdb02`.
The engine is standalone under `storage/`; website integration and deployment are
separate steps. The HPE source library was read without modifying its files.

| Verified output | Result |
|---|---|
| Relevant source inventory | 43 documents |
| Selected QuickSpecs | 29 documents, all source hashes verified |
| Model entries | 64 across MSA, MSL, Alletra, Nimble, Primera and StoreOnce |
| Extracted ordering rows | 2,465 with exact SKU and source evidence |
| Encoded source-backed rules | 48 |
| Exact excerpt verification | 2,582 excerpts match original SQLite text offsets |
| Storage regressions | 33 checks passed |
| Existing server regressions | 22 focused checks passed |
| Existing option equivalence | 225,060 state/option pairs, 242 states, all passed |
| Existing quote validation | 6 valid and 5 invalid formats passed |
| Existing bilingual checks | 12 passed |
| Existing unresolved-rule checks | 8 passed |
| Existing generated rule text | Passed; verifier now handles Windows CRLF |
| JavaScript syntax | Passed |

The catalog rebuild was also reproduced using `--check`. The original `dist/`
application has no content changes. The one existing tooling change normalizes
CRLF before checking the generated translation block, avoiding a false stale-file
failure on Windows checkouts.

## Reviewable examples

Run `node tools/demo-storage.mjs` to reproduce these cases. `--write` refreshes
the JSON reports in Persian and English and the CSV BOMs under `storage/examples/`.

| Example | Result | Basis |
|---|---|---|
| MSA 2060 FC SFF with 8 × 1.92 TB SSD, RAID 6 | 11.52 TB estimated usable | Homogeneous RAID estimate, before metadata/reserve |
| StoreOnce 3760 plus one capacity expansion | 216 TB local usable | Exact QuickSpecs capacity table; no reduction credit |
| MSL2024 with LTO-9 drive and 24 LTO-9 cartridges | 432 TB native media | 18 TB per cartridge; no compressed-capacity guarantee |

All three reports retain `needs_review`. None claims complete HPE qualification.
The tests also reject foreign-model bases, explicit compatibility conflicts,
incorrect drive form, overallocated drives, excess enclosures, invalid RAID,
unsupported tape generations and malformed imports. Unknown family variants and
footnoted matrices remain unknown. CSV output retains findings and protects
against spreadsheet formula injection.

## Remaining qualification

This is an engineering planning and configuration review engine. Full CTO
drive/cache/adapter/power/license matrices, SPOCK/StoreEver software and firmware
interoperability, exact topology, measured workload performance and regional
support/availability remain review items. X10000 and several legacy products lack
extracted base ordering rows; these are explicitly recorded in catalog coverage.
See `README.md` for the exact generation coverage and limitations.
