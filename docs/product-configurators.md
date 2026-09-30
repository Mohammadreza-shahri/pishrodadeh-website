# Product configurators

The site begins with a product type chooser. HPE servers and HPE storage are available.
Server behavior stays in its original deterministic engine; storage uses its own source-backed engine.

## Add a vendor or product type

1. Implement a local module exporting async `mount(context)`.
2. Add a product record to `dist/products.js`: unique `id`, `type`, `vendor`, and lazy `load` function.
3. For a new type (for example networking or security), add its key to `productTypes` and paired labels/descriptions to `studio-copy.js`.
4. Give the adapter its own versioned draft key, input validation, catalog and review rules.
5. Add meaningful catalog/engine and browser coverage before enabling the record.

The chooser opens the only available configurator directly. When several vendors support a type,
it first shows a vendor choice. Cisco and Fortinet can therefore use independent catalogs and
compatibility rules without changing HPE engines. Unimplemented vendors are not presented to customers.
Vendor catalogs are loaded only after selection.

The adapter receives `{lang, onHome, onLanguage, isCurrent}`:

- `lang` is `fa` or `en`. Report language changes through `onLanguage(lang)`.
- `onHome()` returns to the product chooser.
- Check `isCurrent()` after async work before rendering, to avoid overwriting another product.
- Render into `#app` using safe DOM APIs. Keep drafts separate; validate restored and imported data.

## Storage

The four stages are requirements, shortlist, parts and technical review. Customers can select
primary storage, backup and/or tape archive. Each BOM describes one selected system.
Questions remain editable; unknown answers stay unknown. Ranking is a planning policy, not
a price, performance or full compatibility claim.

Parts come from model-filtered QuickSpecs ordering rows. Order quantities count packs;
disk groups count physical disks including spares and specify RAID and installation location.
The review reports source-backed capacity, known conflicts, missing parts and unresolved qualification.
JSON exports include requirements, configuration, BOM and findings and can be imported again.
CSV includes BOM and unresolved findings with formula protection. Print supports PDF through the browser.
Source document dates/lifecycle reflect the supplied snapshot.

Drafts: `aria-configurator-v3` for servers, `aria-hpe-storage-v1` for storage.
Language preference: `aria-studio-language`. The opening chooser is shown on every fresh page load.

Canonical storage data and engine live in `storage/`.
Run `node tools/build-storage-assets.mjs` after changing them. Only the three runtime assets
are copied into `dist/storage/`; extraction scripts, tests and example reports stay outside the deployment.
`--check` detects stale shipped copies.

## Verification

Run the existing server checks, `tools/test-storage.mjs`, `tools/test-products.mjs`,
and `tools/build-storage-assets.mjs --check`.

For the local browser regression:

1. `node tools/serve.mjs 8123`
2. `node tools/browser-check/stage.mjs`
3. `node tools/test-browser.mjs` and `node tools/test-browser.mjs --mobile`
4. `node tools/browser-check/stage.mjs --clean`

The browser runner uses an existing Chrome installation; set `CHROME_PATH` for another executable.
Temporary profiles are isolated and removed. The harness checks the chooser, original server flow,
storage questions, an MSA BOM and capacity, source evidence, actual exported content, language
switches, draft isolation and page overflow.
