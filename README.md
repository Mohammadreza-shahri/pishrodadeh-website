# ARIA — HPE Configuration Studio

A Persian-first, bilingual static configurator for HPE server planning. The site keeps the existing deterministic rule engine and source-linked catalog, then wraps them in a clearer workload advisor, server comparison flow, component workflow, and technical review output.

The deployable application stays in `dist/` and can be hosted from any static web server.

## What is in scope

The configurator helps enterprise IT buyers, infrastructure engineers, and procurement teams move through this flow:

1. describe the workload and sizing targets
2. compare a small set of relevant server platforms
3. configure source-backed components
4. review missing selections, known conflicts, unresolved checks, and required accessories
5. export a CSV BOM, JSON technical report, and print-friendly output

## What is intentionally not claimed

This release does **not** claim full HPE qualification.

- Unknown compatibility states remain unresolved and visible.
- Visible options are source-listed and pass encoded checks, but complete power, thermal, cabling, firmware, and physical-layout validation is still required.
- RAID capacity math is advisory only.
- PSU wattage is nominal only and not a certified power budget.
- No prices, fake stock, fake benchmarks, or ordering workflow are shown.

## Key files

- `dist/index.html` — static entry document
- `dist/style.css` — design system and responsive layout
- `dist/app.js` — UI flow, bilingual rendering, persistence, reporting, and exports
- `dist/engine.js` — deterministic compatibility logic and calculations
- `dist/i18n.js` — Persian and English interface strings
- `dist/quote.js` — Iranian mobile number normalization for quote requests
- `dist/catalog.json` — source-backed model, option, and rule snapshot
- `tools/test-engine.mjs` — focused engine regression tests
- `tools/test-quote.mjs` — quotation contact validation tests
- `tools/build-data.py` — catalog rebuild utility
- `docs/design-system.md` — concise UI system notes
- `docs/verification-report.md` — completed vs untested verification areas
- `.github/copilot-instructions.md` — contributor conventions for future agent runs

## Local preview

Run the existing checks, then serve `dist/` over HTTP:

```sh
node --check dist/app.js
node --check dist/engine.js
node --check dist/i18n.js
node --check dist/quote.js
node tools/test-engine.mjs
node tools/test-quote.mjs
python -m http.server 8000 --directory dist
```

Open `http://127.0.0.1:8000/`.

## Browser behavior

- Persian is the default language; English is available without losing the active configuration.
- Persian UI text prefers IRANSans, IRANSansX, and Iran Sans when installed, with the bundled Vazirmatn web font as a safe fallback. A licensed IRANSans webfont can be added to `dist/` later if a copy is provided.
- Configuration state is stored locally in the browser only and validated before restore.
- The final quotation form requires a name and Iranian mobile number; email is optional. Selected configuration details are included in a prefilled WhatsApp message, and the user reviews and sends it themselves.
- Contact details are not saved by the configurator. The configuration draft stays on the current device; the quotation request is shared with Ariaman only if the user sends the WhatsApp message.
- The summary remains persistent on desktop and becomes an explicit drawer on smaller screens.
- Step completion reflects actual workload, server, and required-component state rather than navigation history.
- The technical report separates missing selections, known conflicts, unknown rule outcomes, and capacity advisories, with links back to affected component groups.
- CSV output is UTF-8 BOM encoded for Persian spreadsheet compatibility and includes formula-injection protection.
- CSV and JSON outputs retain the technical-review limitation; JSON also separates unresolved issues and required accessory findings.
- The technical report can be printed/saved as a branded PDF and shared through a prefilled WhatsApp handoff to 09123624305; the PDF remains a user attachment because browsers cannot silently attach files to WhatsApp.

## Deployment

The site is prepared for static hosting from `dist/`.

Typical deployment options:

- GitHub Pages or another static file host pointed at `dist/`
- object storage/CDN static hosting
- an existing web server configured to serve the contents of `dist/`

No automated live deployment is configured here, and this task did not deploy to production.

## Validation completed for this revision

- JavaScript syntax checks passed.
- `tools/test-engine.mjs` passed.
- Headless Chromium verification covered responsive rendering, language switching, exports, print-to-PDF, empty states, and several representative compatibility scenarios.

See `docs/verification-report.md` for the exact completed and untested areas.

## Known limitations

Current catalog limitations still include incomplete coverage for:

- full memory population and effective-speed matrices
- complete backplane/controller/cable topology
- full riser and physical slot layout qualification
- GPU power, cable, and thermal matrices
- PSU derating and final power-group approval
- firmware, OS, and end-to-end platform qualification

Those gaps are why the interface keeps unresolved states visible instead of claiming complete compatibility.

Memory-slot and DL380a population rules are treated as vacuously satisfied until a DIMM is selected. Missing memory is reported only as a missing required selection, avoiding a misleading DIMM population warning while preserving the same checks once memory exists.
