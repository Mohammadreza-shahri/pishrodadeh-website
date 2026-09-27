# Copilot instructions

- Keep the site as a static application served from `dist/`.
- Preserve the deterministic rule engine in `dist/engine.js`; do not weaken unknown compatibility states into verified compatibility.
- Keep Persian as the default language and preserve bilingual parity in `dist/i18n.js`.
- Use safe DOM APIs only; render catalog and evidence content with text nodes, not `innerHTML`.
- Validate imported or restored configuration data before using it.
- Treat CSV/JSON exports as customer-facing output: include unresolved issues and keep CSV formula-safe.
- Source-linked evidence and model-specific filtering are product-critical and must remain intact.
