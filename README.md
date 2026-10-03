# ARIA — HPE Configuration Studio

A Persian-first, bilingual static configurator for HPE servers and storage, with an independent NVIDIA GPU solution advisor. The site preserves the deterministic rule engines and source-linked catalogs.

The deployable application stays in `dist/` and can be hosted from any static web server.

## What is in scope

The configurator helps enterprise IT buyers, infrastructure engineers, and procurement teams move through this flow:

1. describe the workload and sizing targets
2. compare a small set of relevant server platforms
3. configure source-backed components
4. review missing selections, known conflicts, unresolved checks, and required accessories
5. export a CSV BOM, JSON technical report, and print-friendly output

### Independent NVIDIA GPU solutions

The product chooser also offers a GPU-first path. Buyers can describe a language-model
workload, explore source-linked NVIDIA products, download an advisory JSON report, and
request pricing through a prefilled WhatsApp message without choosing a server.

The initial catalog includes L4, L40, L40S, H100 NVL (94 GB per GPU, PCIe), H200 NVL
(141 GB per GPU, PCIe), and RTX PRO 6000 Blackwell Server Edition (96 GB, air variant).
These are product specifications, not confirmations of stock or HPE qualification.
NVIDIA source links and the reviewed snapshot date are in `dist/gpu-catalog.js`.

Inference screening uses parameter count × weight bits ÷ 8 (decimal GB), a heuristic
25% weight margin, and any explicitly supplied runtime/KV memory. If runtime memory
is blank, the result is an initial floor and stays unresolved. Fine-tuning and full
training remain exploratory unless the buyer supplies a measured peak per GPU.
Measured peaks get a heuristic 25% margin, using known raw weight size as a floor
and flagging inconsistent measurements. No throughput, latency, training duration,
automatic GPU-count estimate, or pooled-memory guarantee is made. Concurrency and
context are recorded for technical review, not used to invent KV cache sizes.

Optional HPE suggestions require an exact source-listed HPE ordering SKU, model
scope and encoded-rule checks. They remain **needs review**, not fully qualified.
Standalone cards with the same GPU name are not automatically HPE-qualified.
GPUs absent from the HPE snapshot remain eligible for standalone sales inquiry;
absence is not reported as proof of incompatibility.

Continuing to server selection requires a deliberate click and confirmation before
replacing an existing server draft. Selecting a server then carries the corresponding
HPE GPU ordering part and requested quantity into the existing component workflow.
GPU proposals, findings and accessory requirements remain in advisory JSON reports.
Server JSON exports also retain the originating GPU proposal when present; server
CSV exports include its unresolved advisory limitations.

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
- `dist/gpu-catalog.js` — independently sourced NVIDIA specifications and explicit HPE part mappings
- `dist/gpu-advisor.js` — validated GPU needs, advisory memory screening and HPE proposals
- `dist/gpu-ui.js`, `dist/gpu-copy.js` — bilingual GPU discovery, standalone inquiry and optional server handoff
- `tools/test-gpu.mjs` — thresholds, unknown states, data validation and model-specific mapping checks
- `tools/test-engine.mjs` — focused engine regression tests
- `tools/test-equivalence.mjs` — generated guard proving option visibility is unchanged (see below)
- `tools/build-equivalence-test.mjs` — regenerates the frozen reference inside `tools/test-equivalence.mjs`
- `tools/test-i18n.mjs` — bilingual parity, duplicated-key, and hardcoded-string guard
- `tools/test-inert-rules.mjs` — pins the rules that can never be decided, so the gap stays visible
- `tools/build-rule-i18n.mjs` — regenerates the `rule_*` prose blocks in `dist/i18n.js`
- `tools/rule-fa.json` — reviewed Persian prose for every catalog rule
- `tools/test-quote.mjs` — quotation contact validation tests
- `tools/build-data.py` — catalog rebuild utility
- `tools/serve.mjs` — static file server for local verification
- `tools/browser-check/` — headless browser smoke test (staged into `dist/` only while running)
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
node tools/test-equivalence.mjs
node tools/test-i18n.mjs
node tools/test-inert-rules.mjs
node tools/test-gpu.mjs
node tools/test-products.mjs
node tools/build-rule-i18n.mjs   # fails if the generated rule prose is stale
node tools/serve.mjs 8123
```

Open `http://127.0.0.1:8123/`.

### Two guarded files

`dist/engine.js` decides which options a customer is allowed to see, so changes to it are
verified against a frozen copy of the previous implementation over ~225,000 (state, option)
pairs:

```sh
node tools/test-equivalence.mjs        # compare the engine with the frozen reference
node tools/build-equivalence-test.mjs  # refresh the frozen copy after an intended change
```

`dist/i18n.js` cannot be checked by importing it, because a duplicated key inside the object
literal is silently overwritten by the later definition. `tools/test-i18n.mjs` therefore parses
the source text and also asserts that every catalog rule has Persian and English prose and that
no user-facing string is hardcoded in `dist/app.js`. The `rule_*` prose is generated:

```sh
# edit tools/rule-fa.json, then:
node tools/build-rule-i18n.mjs --write
```

## Browser behavior

- Persian is the default language; English is available without losing the active configuration.
- Persian UI text and numbers use the bundled Vazirmatn web font with system fallbacks.
- Configuration state is stored locally in the browser only and validated before restore.
- The final quotation form requires a name and Iranian mobile number; email is optional. Selected configuration details are included in a prefilled WhatsApp message, and the user reviews and sends it themselves.
- Contact details are not saved by the configurator. The configuration draft stays on the current device; the quotation request is shared with Ariaman only if the user sends the WhatsApp message.
- The summary remains persistent on desktop and becomes an explicit drawer on smaller screens.
- Step completion reflects actual workload, server, and required-component state rather than navigation history.
- The technical report separates missing selections, known conflicts, unknown rule outcomes, and capacity advisories, with links back to affected component groups.
- CSV output is UTF-8 BOM encoded for Persian spreadsheet compatibility and includes formula-injection protection.
- CSV and JSON outputs retain the technical-review limitation; JSON also separates unresolved issues and required accessory findings.
- The technical report can be printed/saved as a branded PDF and shared through a prefilled WhatsApp handoff to 09123624305; the PDF remains a user attachment because browsers cannot silently attach files to WhatsApp.
- Rule explanations come from `dist/i18n.js` (`rule_<suffix>` keys) in both languages rather than from an inline Persian table, so no rule falls back to a generic "needs review" line.
- Direct-conflict reasons are namespaced as `conflict_*` keys, so a reason such as `gpuMemory` can never be confused with the unrelated BOM metric label of the same name.
- The component list evaluates visibility only for the eight option cards it renders, instead of restating per-category totals; the counts line reports how many options the current search hides.

## Deployment

The site is prepared for static hosting from `dist/`.

Typical deployment options:

- GitHub Pages or another static file host pointed at `dist/`
- object storage/CDN static hosting
- an existing web server configured to serve the contents of `dist/`

Automated staging deployment is configured in `.github/workflows/deploy-staging.yml`.

Every push to `mohammadreza-shahri-deploy-pishrodadeh-staging` runs the syntax and regression checks first, then uploads only `dist/` to `https://staging.aria-man.com/` over SSH. The workflow can also be started manually from the Actions tab.

One-time GitHub setup is required:

1. Create a repository environment named `staging`.
2. Add these environment secrets:
  - `STAGING_HOST` — staging server hostname or IP
  - `STAGING_USER` — SSH deployment user
  - `STAGING_PORT` — optional SSH port; defaults to `22`
  - `STAGING_PATH` — the nginx document root for this site
  - `STAGING_SSH_KEY` — private key for the deployment user
  - `STAGING_KNOWN_HOSTS` — the pinned `known_hosts` line for the server
3. Add the workflow's public key to the deployment user's `authorized_keys`.

After that setup, changes pushed to the staging branch deploy automatically without a manual request. The SSH user should be restricted to the staging document root and should not have broad administrative access.

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
