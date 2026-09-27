# Verification report

## Completed checks
- `node --check dist/app.js`
- `node --check dist/engine.js`
- `node --check dist/i18n.js`
- `node tools/test-engine.mjs`
- Headless Chromium verification against a local HTTP server (`python -m http.server 8000 --directory dist`)

## Browser flows verified in headless Chromium
- Persian default landing page renders without console errors or failed requests.
- Workload → server comparison → component selection → technical review journey completes.
- Language switching on the review screen preserves the active configuration.
- Desktop (1440px), tablet (768px), and mobile (390px) renders were exercised.
- Mobile summary drawer opens and closes.
- Empty search results render a useful empty state.
- CSV export, JSON export, and print-to-PDF output were generated.

## Representative compatibility scenarios exercised
- Single-socket CPU conflict becomes visible after increasing CPU quantity to two.
- Incompatible memory search returns no selectable result for a 3508U + DDR5-4800 path.
- Cached controller selection surfaces the backup-power accessory requirement.
- High-line PSU options disappear when input voltage is changed to 110 V.
- Engine regression coverage also still checks riser, storage protocol/form-factor, RAID, evidence, and import validation paths.

## Not fully tested
- Real-device touch behavior outside headless Chromium.
- Screen-reader specific behavior across NVDA, JAWS, VoiceOver, or TalkBack.
- Full keyboard-only audit of every control combination beyond the semantic browser checks used here.
- Production or staging deployment, because no destination or credentials were provided.
- Independent HPE qualification review beyond the encoded rules and source evidence.
