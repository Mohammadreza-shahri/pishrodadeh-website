# Server and storage integration — 2026-09-30

Implemented on `feature/storage-engine`. Local integration is verified; production has not been published.

- The first screen asks for server or storage.
- HPE server and storage adapters have separate engines, catalogs and drafts.
- A shared product registry supports additional vendors and product types. Multiple entries for a type open a vendor chooser.
- Storage includes requirements, planning shortlist, source-filtered parts, physical disk groups, technical review, JSON round-trip import/export, CSV and browser printing.
- QuickSpecs excerpts are displayed as text with source links. Unknown compatibility and performance remain unresolved.
- Server behavior remains unchanged in the guarded deterministic engine.

Verification passed:

- 52 browser checks at desktop and mobile sizes. Includes original server flow, language and routing,
  draft isolation, MSA RAID6 capacity (11.52 TB), StoreOnce 3760 local capacity (216 TB),
  MSL2024 native tape capacity (432 TB), actual exports, valid/invalid imports and page overflow.
- 33 storage engine checks.
- Existing server checks: 22 focused engine tests, 6 valid / 5 invalid mobile formats,
  equivalence over 225,060 option pairs and 242 states, 12 bilingual checks and 8 unresolved-rule checks.
- Product registration, bilingual UI copy, safe DOM rendering, generated server translation blocks,
  shipped storage asset identity and JavaScript syntax checks.

The supplied catalog's 29 documents and 2,582 exact excerpts were verified in the storage engine
stage; source extraction is unchanged by this integration. Runtime copies are checked against canonical files.

Remaining technical limitations are visible in the review: source snapshot lifecycle, unencoded
vendor support matrices, workload qualification, price and stock. Models without an extracted
orderable base remain comparison-only unless a source-listed software license can be configured.

Future vendor integration is described in [product-configurators.md](product-configurators.md).
