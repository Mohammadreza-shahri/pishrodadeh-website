# Verification report

## Completed checks
- `node --check dist/app.js`
- `node --check dist/engine.js`
- `node --check dist/i18n.js`
- `node --check dist/quote.js`
- `node tools/test-engine.mjs` — 22 focused engine tests
- `node tools/test-quote.mjs` — 6 valid and 5 invalid Iranian mobile formats
- `node tools/test-equivalence.mjs` — 5 checks over 225,060 (state, option) pairs and 242 build states
- `node tools/test-i18n.mjs` — 12 bilingual integrity checks
- `node tools/build-rule-i18n.mjs` — generated rule prose confirmed current
- Headless Chromium verification against a local HTTP server (`node tools/serve.mjs 8123`)
- Headless Chromium smoke test with 27 assertions (`tools/browser-check/`)

## Visibility equivalence guard (`tools/test-equivalence.mjs`)

`optionCheck` decides which options a customer may see, and it used to run `activeFindings` once
per option on every render. It was rewritten to evaluate the rules once per category and let each
option answer only the SKU-dependent questions. To prove that this changed nothing,
`tools/build-equivalence-test.mjs` copies `expression`, `field`, `selectedOptions`, `quantity`,
`selectionItems`, `facts`, `directConflicts` and the two constants they close over **verbatim**
out of `dist/engine.js` and embeds them in the test as the frozen reference, together with the
pre-optimisation `referenceOptionCheck`.

The corpus is deterministic and deliberately includes invalid builds (mismatched memory
generations, wrong drive form factors, 110 V with high-line PSUs, out-of-range DIMM and CPU
counts, every chassis and workload). The guard fails unless all 225,060 pairs match on `hidden`,
`reasons`, `requirements`, `conflicts` and `review`, and unless the corpus actually exercises the
hidden path, direct-conflict reasons and rule conflicts — so the comparison cannot pass vacuously.

Three behaviours were corrected against the reference during this work, each caught as a real
mismatch rather than assumed:

1. `requirements` is scoped to rules that are relevant to the tested category and only to
   conflicting rules.
2. `facts.cpu` describes the CPU that is **already selected** (a CPU under consideration is not in
   `selected` yet), which the thermal rules read through `cpu.tdp_w`.
3. A conflicting option that is already selected stays `hidden: true` with an empty `reasons`
   list — that is how `renderParts` discovers it for the "selected but incompatible" callout.

## Bilingual integrity guard (`tools/test-i18n.mjs`)

`dist/i18n.js` is an object literal, so a duplicated key is silently overwritten and an ESM import
cannot see it. The guard parses the source text instead. It verifies that neither locale has
duplicated keys, that both locale key sets are identical, that no English value contains Persian
text (the language switcher excepted), that every one of the 42 catalog rule suffixes has Persian
and English prose, that every direct-conflict key and rule domain has copy, that every literal
`t('...')` in `dist/app.js` resolves, and that no user-facing string is hardcoded in `dist/app.js`.

Defects this work fixed, all found by audit rather than by a failing test:

- `storage` was defined twice in each locale. The later definition (the component-category label)
  silently overwrote the workload label, and `dist/app.js` carried a hardcoded workaround that
  existed only because of that collision. The workload label is now `workloadStorage`.
- 13 of 42 rules had no Persian prose, so `ruleText()` fell back to a single generic sentence.
- `renderParts` rendered an incompatible selected option's reason with `t(reason)`, and the reason
  key `gpuMemory` collided with the unrelated BOM metric label "Memory per GPU". Reasons are now
  namespaced as `conflict_*`.
- The "triggered by" line printed the raw engine domain token (`thermal`, `power`, `pcie`) inside a
  Persian sentence. Domains are now `domain_*` keys.
- A counts line interpolated `${...}` inside a plain string, so it displayed the literal text.
- Twelve user-visible strings bypassed the dictionary, including the page title, the logo `alt`
  text, the brand tagline, the language-switch label, the stepper `aria-label`, the hero eyebrow
  and the CPU core unit.

## Browser flows verified in headless Chromium
- Persian default landing page renders without console errors or failed requests.
- Workload → server comparison → component selection → technical review journey completes.
- Language switching on the review screen preserves the active configuration.
- Desktop (1440px), tablet (768px), and mobile (390px) renders were exercised.
- Mobile summary drawer opens and closes.
- Empty search results render a useful empty state.
- CSV export, JSON export, and print-to-PDF output were generated.
- Quotation request validates a required name and Iranian mobile number, accepts Persian/Arabic numerals and international Iranian prefixes, and leaves email optional.
- The WhatsApp draft includes contact details and selected server/component details; the user must review and send it. Configuration remains in browser storage, while contact fields are not persisted.
- The workload selector shows the storage workload label rather than the component-category label.
- Rule prose renders in Persian on the Persian page and from the catalog on the English page, with no raw `rule_*`, `conflict_*` or `domain_*` key ever visible.
- Component pagination holds the page to eight cards and paging renders a different page.

## Representative compatibility scenarios exercised
- Single-socket CPU conflict becomes visible after increasing CPU quantity to two.
- Incompatible memory search returns no selectable result for a 3508U + DDR5-4800 path.
- Cached controller selection surfaces the backup-power accessory requirement.
- High-line PSU options disappear when input voltage is changed to 110 V.
- Engine regression coverage also still checks riser, storage protocol/form-factor, RAID, evidence, and import validation paths.
- No-memory builds do not emit DIMM slot/population findings; those rules activate after a DIMM choice.
- Headless Edge covered Persian layouts at 390 px, 768 px, and 1440 px; English switching; keyboard focus retention; modal focus return; empty search; mobile summary; known conflicts; increased text; CSV/JSON downloads; and print-to-PDF.

## Performance

Measured with a warm process, model 16910, 174 storage options, Node 24 on the development
machine. `optionCheck` no longer copies the state per call and the component page no longer
evaluates options it does not render:

| Work | Before | After |
|---|---|---|
| `optionCheck` for all 174 storage options | ~54 ms | ~24 ms |
| `optionCheck` for the 8 options actually rendered | ~1.4 ms | ~1.3 ms |
| Component-page render per keystroke | ~54 ms of engine work | ~1.3 ms of engine work |

## Not fully tested
- Real-device touch behavior outside headless Chromium.
- Screen-reader specific behavior across NVDA, JAWS, VoiceOver, or TalkBack.
- Full keyboard-only audit of every control combination beyond the focused browser checks listed above.
- Production deployment; the authorized staging target is operationally verified separately.
- Independent HPE qualification review beyond the encoded rules and source evidence.

## Known engine limitations carried forward

Eleven engine facts are never populated by `dist/engine.js`:

`secondary_fh_riser`, `trimode_controller`, `sas4_mu`, `redundant_fans`, `primary_pcie_cards`,
`secondary_pcie_cards`, `slots5_10_used`, `slot2_used`, `media_box`, `storage_layout`, `vroc_nvme`.

Six rules are gated by such a fact, so they can never fire — their `when` clause resolves to `null`
or `false`, and the interface reports them as unknown checks rather than as passes:

| Rule suffix | Never-populated fact it reads in `when` |
| --- | --- |
| `fh_blocks_slot2` (16910) | `secondary_fh_riser` |
| `slots_5_10` (16912) | `slots5_10_used` |
| `cables_balanced_direct` (16913) | `storage_layout` |
| `cables_balanced_type_p` (16913) | `storage_layout` |
| `cables_balanced_oroc` (16913) | `storage_layout` |
| `trimode_backup` (16913) | `trimode_controller` |

Three further rules do fire, but their verdict always resolves to `unknown` because the `assert`
reads such a fact, so their affected SKUs are never emitted as requirements:

| Rule suffix | Never-populated fact it reads in `assert` |
| --- | --- |
| `rear_blocks_primary` (16911) | `primary_pcie_cards` |
| `media_box` (16911) | `media_box` |
| `vroc_cpu` (16912) | `vroc_nvme` |

`tools/test-inert-rules.mjs` pins all of this: it derives the list above from the catalog, asserts
that none of these rules ever reaches a verdict, and asserts that no option is hidden and no
requirement is raised on the strength of an unknown state. If one of these facts is ever
populated, the test fails and forces a deliberate decision about the rules that depend on it.

Two related facts are **not** in the list, because they are populated once the relevant part is
selected: `drive_protocol` (from the chosen drive) and `psu_family` (from a 1600 W Platinum PSU).
`rich_config_fans` and `rear_blocks_secondary` each test one never-populated fact alongside live
ones, so they can still fire legitimately and were deliberately left out.

These gaps are the reason the interface keeps unresolved states visible instead of claiming
complete compatibility. Closing them is catalog work — populating the facts — and must never be
done by turning the affected rules into passes.

## Bulletin Gen11 / Gen12 extension

See [server-extension.md](server-extension.md) for five added platforms, source versions,
encoded rules and qualification limits. Source hashes/evidence, imports, platform limits and
kit quantities pass `tools/test-server-extension.mjs`. The original four-platform reference
passed 225,060 state/option pairs before the deliberate extension reference refresh.
Desktop (1440 x 1000) and mobile (390 x 844) each passed 130 browser checks, including every
new model's CPU controls, DIMM controls and review in Persian and English. These checks do
not independently certify HPE compatibility or validate physical installation conditions.
