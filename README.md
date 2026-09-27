# ARIA — HPE Configuration Studio

A Persian-first, bilingual website built on the previous offline engine's source-linked data and three-valued rule model. No runtime LLM or external API is used. The deployable website is in `dist/`; it works from any static HTTP server.

## Experience

Workload and sizing targets → platform positioning → components and dependencies → technical review, CSV BOM, JSON report and browser print/PDF.

The customer flow currently covers **DL380 Gen11, DL360 Gen11, ML350 Gen11 and DL380a Gen11**. It includes 930 model-specific source-linked option entries across processor, memory, storage, controller, drive cage/backplane, Fibre Channel HBA, GPU, riser, PSU, cooling and accessory categories. Entries can repeat across platforms. Some categories have no safely extracted option for a particular model; the interface explains that rather than inventing one.

Persian and English labels, layout direction, number formatting, guides, empty states, major conflict messages and output headers are supported. Official part names and exact original QuickSpecs excerpts stay in English. The interface is responsive and keyboard-usable; evidence panels provide focus trapping and Escape dismissal. CSV uses UTF-8 BOM for Persian spreadsheet compatibility.

## Compatibility boundary

**This is a private review release, not a complete HPE qualification service.**

The earlier engine did not have every relation/requirement for every platform. The site makes that limitation explicit. It rejects known conflicts and uses model-specific source listings; it cannot prove fully qualified compatibility when required source matrices have not been encoded. Every option and report therefore remains marked for technical review. It must not be marketed as offering only fully certified configurations yet.

- Dependencies are evaluated using the current CPU, memory, chassis, selected components, quantities and input voltage.
- Selection lists exclude known conflicts. Accessory requirements can remain selectable because the required kits are then explicitly shown.
- Changing an upstream selection does not silently remove customer choices. A selected part that becomes conflicting is shown with a removal action and remains in the report until resolved.
- Kit additions are explicit customer actions. Kit quantities can be edited; default presence quantities are not proof of a complete thermal/cabling design.
- Partial rules do not establish complete electrical, physical, thermal, storage-path or firmware qualification.
- The user chooses one CPU/DIMM/drive model per category; multiple risers/cooling/accessory kits can be selected. Multiple heterogeneous storage pools and mixed GPU models are intentionally not offered in this release.
- Workload ordering is transparent internal positioning. Target checks use conservative extracted upper bounds, not guaranteed realizable configurations or application benchmarks.
- RAID capacity assumes equal drives and does not imply controller support. PSU wattage is nominal; load, voltage derating, distribution and thermal approval remain unresolved.
- No prices, fake stock, fake quotes, order submission or artificial performance claims are shown.

## Files

- `dist/app.js`: customer flow, bilingual UI, evidence dialogs and reports.
- `dist/engine.js`: deterministic rules, filtering, dependencies and planning arithmetic.
- `dist/i18n.js`: English/Persian interface text.
- `dist/catalog.json`: platform/option/rule snapshot, with exact evidence.
- `tools/build-data.py`: reproducible export from the preceding engine and supplied source SQLite. Input location is specified in `SOURCE`; adjust it if rebuilding elsewhere.
- `tools/test-engine.mjs`: focused compatibility tests.

## Validate locally

```sh
node --check dist/app.js
node --check dist/engine.js
node --check dist/i18n.js
node tools/test-engine.mjs
python -m http.server 8000 --directory dist
```

Open `http://localhost:8000`. Python serves files only; it is not required by hosting. The engine is deterministic browser JavaScript, and the deployed static files need no database or cloud model.

## Verification

Focused source/constraint tests and JavaScript syntax checks passed. All option evidence excerpts were checked against raw source offsets. A graphical browser session was unavailable in the managed static-site workflow, so visual rendering, native browser printing and real-device behavior are not claimed as tested. Passing unit tests does not substitute for independent HPE rule review.

## Next data priorities

Exact base/CTO SKUs and included-kit mappings; complete memory population and effective-speed tables; backplane/controller/cable topology; riser/slot physical layouts; GPU power/thermal matrices; PSU derating and power groups; firmware/OS support; independent qualification review. These are the prerequisites for changing the customer promise from “known conflicts filtered” to fully qualified compatible configurations.
