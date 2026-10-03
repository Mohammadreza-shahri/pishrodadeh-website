# HPE Bulletin server extension

Added platforms from the locally supplied HPE Product Bulletin Worldwide QuickSpecs:

| Platform | QuickSpecs ID / version | CPU quantities | DIMM slots | Rules |
| --- | --- | --- | --- | --- |
| ML30 Gen11 | 17118 / 27 | 1 | 4 | 20 |
| ML110 Gen11 | 16305 / 40 | 1 | 16 | 22 |
| ML350 Gen12 | 17105 / 17 | 1 or 2 | 32 | 31 |
| DL20 Gen11 | 17119 / 29 | 1 | 4 | 19 |
| DL580 Gen12 | 17258 / 12 | 2 or 4 | 64 | 16 |

ML350 Gen11 remains one of the original four platforms, with its original source snapshot and rules. No unavailable generation/model combinations were invented.

## Source and reproducibility

`docs/server-sources/*.txt` holds the corresponding `QSSearchText` records from the read-only local Bulletin `Catalogs/Worldwide QuickSpecs/index.db`, with HTML entities decoded and line endings normalized to LF. No Bulletin database or archive was modified. Evidence offsets and SHA-256 hashes refer to these exact normalized snapshots, not to the original ZIP archives. `manifest.json` records versions, hashes, imported category counts and rule counts.

Only complete description/SKU pairs are imported. Both explicitly listed FIO memory and standalone memory entries retain their own identities. A listed option means that HPE listed it for this platform; it does not certify every possible combination. DC supplies are omitted because the interface models AC voltage. Ambiguous table rows and unparsed options are not fabricated. Reused Gen11 accessory names in a Gen12 QuickSpec are retained as listed by HPE.

Rebuild the extension without the old unavailable catalog database:

```sh
python tools/extend-server-catalog.py
node tools/build-rule-i18n.mjs --write
node tools/test-server-extension.mjs
```

The extension builder preserves the original four platform records, options and rules. Its reviewed rule expressions remain explicit, rather than attempting to interpret arbitrary HPE prose automatically. The original `tools/build-data.py` rebuilds only the original snapshot; run the extension builder afterward if that legacy source becomes available.

## Encoded conditions

- CPU/socket limits, DIMM limits per installed processor, and the documented ML110/ML350 Gen12 population counts.
- ML30 95W heatsink, the explicitly listed 6353P heatsink requirement, hot-plug/M.2/PCIe fan conditions, redundant PSU enablement and controller/M.2 cable kits.
- ML110 96GB memory CPU exclusions, two-GPU limit, L4 CPU TDP restriction, GPU/support/riser dependencies, SAS cooling, SAS controller and NS204i-u dependencies.
- DL20 NHP tri-mode-controller exclusion, OCP/PCIe controller cables, OCP NIC cable, U.3 NVMe chassis/two-drive/enablement restrictions, M.2 and boot-device kits.
- ML350 Gen12 heatsink type and quantity, high-TDP/second-CPU/256GB/EDSFF/GPU fan requirements, secondary-riser CPU requirement, per-SKU GPU quantities and per-accelerator power cables.
- DL580 Gen12 two/four-CPU configurations, CPU-dependent PSU quantities, required production NIC, air-heatsink quantity and liquid-cooling kit/exclusivity requirements.
- Source-listed cached-controller backup accessories, drive form factors, high-line restrictions explicitly noted for relevant Flex Slot supplies, and required drive cages on the Gen12 platforms.

## Qualification limits

All new platforms retain `partial_rules` qualification. Storage/controller/cage/riser layout, physical slot allocation, ambient-temperature tables, power budgets, firmware/OS/VROC licensing, regional ordering restrictions and accessory combinations still need technical review. UDIMM channel placement/symmetry and DL580 memory-layout qualification remain unresolved. The browser does not collect all facts needed to evaluate these conditions, and never treats an unresolved rule as a pass.

Source-backed `review.*` assertions keep these gaps visible in the review and JSON report. They are intentionally unknown; merely adding a listed cage, GPU or PSU does not certify its full layout or power budget. Not every listed option or QuickSpecs condition is encoded. Complete HPE qualification is not claimed, consistent with the existing four-platform implementation.

## Validation

`tools/test-server-extension.mjs` verifies snapshot hashes and every evidence offset, platform isolation, imports, CPU/DIMM limits, GPU/storage/power conflicts, kit quantities and unresolved findings. It runs in both deployment workflows.

Before refreshing the intentional engine changes in the equivalence reference, the previous reference passed all 225,060 original-platform state/option cases and 242 finding states. The refreshed reference additionally covers the new platforms. The browser harness renders every new platform's CPU controls, DIMM controls and review in both Persian and English, alongside the existing server/storage/export checks.
