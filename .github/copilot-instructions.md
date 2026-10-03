# Copilot instructions

- Deployment is authorized only to `https://staging.aria-man.com/` through `deploy-staging.yml`. Do not deploy to or modify the root domain, or run `deploy-production.yml`.

- Keep the site as a static application served from `dist/`.
- Preserve the deterministic rule engine in `dist/engine.js`; do not weaken unknown compatibility states into verified compatibility.
- Keep Persian as the default language and preserve bilingual parity in `dist/i18n.js`.
- Use safe DOM APIs only; render catalog and evidence content with text nodes, not `innerHTML`.
- Validate imported or restored configuration data before using it.
- Treat CSV/JSON exports as customer-facing output: include unresolved issues and keep CSV formula-safe.
- Source-linked evidence and model-specific filtering are product-critical and must remain intact.

## Before you commit

Run the checks the staging workflow runs:

```sh
node --check dist/app.js && node --check dist/engine.js && node --check dist/i18n.js && node --check dist/quote.js
node tools/test-engine.mjs
node tools/test-quote.mjs
node tools/test-equivalence.mjs
node tools/test-i18n.mjs
node tools/test-inert-rules.mjs
node tools/build-rule-i18n.mjs      # fails if dist/i18n.js rule prose drifts from the catalog
```

- **`dist/engine.js` is guarded.** `tools/test-equivalence.mjs` compares `optionCheck` against a frozen copy of the pre-optimisation implementation over ~225k (state, option) pairs. If you change rule evaluation, run `node tools/build-equivalence-test.mjs` to refresh the frozen copy **only** when the behaviour change is intended, and say so in the commit.
- **`dist/i18n.js` is guarded.** `tools/test-i18n.mjs` parses the literal source (an import would hide duplicate keys) and checks that both locales carry the same keys, that every catalog rule suffix has prose, and that no user-facing string is hardcoded in `dist/app.js`. Rule prose is generated: edit `tools/rule-fa.json` and run `node tools/build-rule-i18n.mjs --write`.
- **Do not add files to `dist/` that are not part of the shipped site.** `dist/` is uploaded verbatim by the deploy job.
