---
phase: 08-export-and-the-canonical-arguments
plan: 03
subsystem: data
tags: [presets, build-time-generation, permalink, share-06, irr, cagr]

requires:
  - phase: 04-first-defensible-backtest-in-the-browser
    provides: "computeDerivedMetrics (state.ts), buildKernelInputs/runBacktest, the DerivedMetrics shape"
  - phase: 07-sweep-engine-and-the-heatmap
    provides: "src/app/permalink.ts's mode/metric keys (D-04), the full 17-key PermalinkParams contract"
provides:
  - "PRESET_DEFINITIONS (src/app/presets.ts): ten typed canonical-argument parameter sets, unflattering-first, four featured"
  - "PRESET_OUTCOMES (src/app/presets.generated.ts): every preset's headline figure, computed once at build time, committed"
  - "scripts/compute-presets.ts: the generator (computePresetOutcomes) plus the npm run compute-presets writer"
  - "computeDerivedMetrics exported from src/app/state.ts, callable from Node (F-07)"
  - "The pinning test (presets.generated.test.ts) and the structural test suite (presets.test.ts): D-16, featured invariant, uniqueness, permalink round trip, criterion-3 coverage, ordering stability"
affects: [08-04]

actuals:
  tokens: 9960
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Generated module + pinning test (D-18), a direct structural copy of measure-extended-tier-bias.ts/extended-tier-bias.generated.ts: write-to-temp-then-rename, import.meta.main-guarded writer, a pure exported compute function the pinning test recomputes against."
    - "PRESET_DEFINITIONS is Object.freeze()'d at module scope, not merely declared as const, so 'no consumer ever sorts this array' is a runtime-enforced invariant a test can assert (Object.isFrozen), not only a documented convention."

key-files:
  created:
    - src/app/presets.ts
    - src/app/presets.generated.ts
    - scripts/compute-presets.ts
    - tests/app/presets.test.ts
    - tests/app/presets.generated.test.ts
  modified:
    - src/app/state.ts
    - package.json

key-decisions:
  - "computeDerivedMetrics required no extraction into a Solid-free module: importing src/app/state.ts from Node executes its top-level createSignal/createStore calls without error (verified empirically by Task 1's smoke test, closing RESEARCH Assumption A3), so the export-in-place approach the plan preferred was sufficient."
  - "All ten preset entry dates resolved to real trading-calendar bars on the first attempt against the committed bundle (manifest 45a9f1ae6444) -- no date correction or whyThisWindow substitution note was needed."
  - "PRESET_DEFINITIONS wrapped in Object.freeze() (plan said 'as const', which is TypeScript-only and has no runtime effect) so the ordering-stability test's frozen-ness assertion is a genuine runtime check, not a vacuous Array.isArray tautology."

requirements-completed: [SHARE-06]

coverage:
  - id: D1
    description: "computeDerivedMetrics is exported from state.ts and callable from a Node script against the real on-disk bundle, with no browser-only global touched on its call path"
    requirement: SHARE-06
    verification:
      - kind: unit
        ref: "tests/app/presets.test.ts#F-07: computeDerivedMetrics is callable from Node against the real bundle > a short single run produces a DerivedMetrics object with the expected shape"
        status: pass
    human_judgment: false
  - id: D2
    description: "PRESET_DEFINITIONS has 10 entries covering roadmap criterion 3's four named windows, declared unflattering-first with exactly 4 featured in the D-15 order"
    requirement: SHARE-06
    verification:
      - kind: unit
        ref: "tests/app/presets.test.ts#SHARE-06: the preset library structural assertions > the featured invariant: at least 8 presets, exactly 4 featured, in the stated declaration order"
        status: pass
      - kind: unit
        ref: "tests/app/presets.test.ts#SHARE-06: the preset library structural assertions > criterion-3 coverage: every one of the four named windows is represented by a preset"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every real-fund preset (TQQQ, UPRO) sets leverage exactly 1.0 and expenseRatioPercent exactly 0 (D-16), asserted by a test with a message stating the double-charge consequence"
    requirement: SHARE-06
    verification:
      - kind: unit
        ref: "tests/app/presets.test.ts#SHARE-06: the preset library structural assertions > D-16: every real-fund preset sets leverage exactly 1.0 and expenseRatioPercent exactly 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every preset's headline figure is computed once at build time against the compiled bundle and committed; a pinning test fails CI when the figure no longer matches a live recomputation"
    requirement: SHARE-06
    verification:
      - kind: unit
        ref: "tests/app/presets.generated.test.ts#D-18: the committed preset outcomes match a live recomputation > every outcome deeply equals the committed PRESET_OUTCOMES to full float64 precision"
        status: pass
    human_judgment: false
  - id: D5
    description: "A preset is nothing more than a named parameter set: every preset's request round-trips through encodeParams/decodeParams unchanged, and no two presets encode to the same query string"
    requirement: SHARE-06
    verification:
      - kind: unit
        ref: "tests/app/presets.test.ts#SHARE-06: the preset library structural assertions > the round trip: decodeParams(encodeParams(params)) returns the same parameter set for every preset"
        status: pass
      - kind: unit
        ref: "tests/app/presets.test.ts#SHARE-06: the preset library structural assertions > uniqueness: no two presets encode to the same permalink query string"
        status: pass
    human_judgment: false

duration: ~55min
completed: 2026-08-26
status: complete
---

# Phase 8 Plan 3: The Preset Library and Its Build-Time Generator Summary

**Ten typed canonical-argument parameter sets (unflattering-first, four featured) with every headline figure computed once at build time against the compiled bundle, pinned by a test that fails CI on drift, and proven never to double-charge a real fund's own expense ratio.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-08-26T04:22:00Z (approx)
- **Completed:** 2026-08-26T04:48:30Z
- **Tasks:** 3
- **Files modified:** 7 (5 created, 2 modified)

## Accomplishments

- Exported `computeDerivedMetrics` from `src/app/state.ts` and proved empirically (not just by reading callees) that it is callable from a Node context against the real on-disk bundle, with no `window`/`document`/`performance`/Solid-render dependency on its call path — closing RESEARCH Assumption A3.
- Built `src/app/presets.ts`: `PRESET_DEFINITIONS`, ten typed parameter sets declared unflattering-first (D-13), covering all four windows roadmap criterion 3 names — 1929 (extended tier), a synthetic 3x NDX from the March 2000 peak (D-10's substitution for the unreachable TQQQ-from-2000), the 1979-1982 high-rate regime (extended tier, D-11), and the 2010s in isolation. Four entries carry `featured: true` at exactly the positions D-15's declaration order requires.
- Every real-fund preset (TQQQ COVID, UPRO COVID, UPRO since inception) sets `leverage: 1` and `expenseRatioPercent: 0` (D-16) — verified by a test whose failure message states the double-charge consequence in `backtest.ts`'s cost model, not just the rule.
- Built `scripts/compute-presets.ts`, a structural copy of the existing `measure-extended-tier-bias.ts` precedent: a pure `computePresetOutcomes` the pinning test recomputes against, an `import.meta.main`-guarded writer using write-to-temp-then-rename, calling the newly exported `computeDerivedMetrics` rather than reimplementing IRR/CAGR selection (F-07).
- Generated and committed `src/app/presets.generated.ts` — ten outcomes, verified byte-identical across two consecutive `npm run compute-presets` runs.
- Wrote the pinning test (`tests/app/presets.generated.test.ts`, mirroring `extended-tier-bias.test.ts`'s four-test shape) and extended `tests/app/presets.test.ts` with the library's structural assertions: D-16, the featured invariant, permalink query-string uniqueness, the encode/decode round trip (the assumption-delta decision's contract test), criterion-3 coverage, and ordering stability.
- Ran both required deliberate-break checks and observed the expected failures (see below), proving neither test is vacuous.

## Task Commits

1. **Task 1: Export computeDerivedMetrics and prove a Node caller can use it** — `6db3775` (feat)
2. **Task 2: The preset library as data, and the build-time generator that computes its figures** — `881c215` (feat)
3. **Task 3: The pinning test, D-16's assertion, and the permalink round trip** — `011dd17` (test)

## Files Created/Modified

- `src/app/state.ts` — `computeDerivedMetrics` changed from module-private to exported, with a doc comment stating why (F-07)
- `src/app/presets.ts` — `PRESET_DEFINITIONS` (frozen array of ten `PresetDefinition` entries), `PresetTag`, `PresetOutcomeMetric`, `presetById`
- `src/app/presets.generated.ts` — GENERATED, committed: `PRESET_OUTCOMES` (ten entries), `PRESET_OUTCOMES_BUNDLE_VERSION`, `PRESET_OUTCOMES_MEASUREMENT_DATE`
- `scripts/compute-presets.ts` — `computePresetOutcomes` (pure), `PresetOutcome`, the `import.meta.main`-guarded writer
- `package.json` — added the `compute-presets` script alongside `measure-extended-tier-bias`
- `tests/app/presets.test.ts` — the Node smoke test (Task 1) plus the library's structural assertions (Task 3)
- `tests/app/presets.generated.test.ts` — the D-18 pinning test

## Decisions Made

- **No extraction into a Solid-free module was needed.** The plan flagged this as a real possibility (RESEARCH Assumption A3, the module-level Solid-signal hazard). Task 1's smoke test proved empirically that importing `src/app/state.ts` from Node, executing its top-level `createSignal`/`createStore` calls, and calling `computeDerivedMetrics` all work with no DOM present — Solid's core reactive primitives run outside a render context without a browser global. The simpler export-in-place approach was sufficient.
- **`PRESET_DEFINITIONS` is `Object.freeze()`'d**, not only declared `as const`. `as const` is TypeScript-only and has no runtime effect — a genuine `Object.isFrozen()` assertion needed the runtime wrapper too, so the ordering-stability test checks a real invariant (a `.sort()` call on the frozen array would throw) rather than a tautology.
- **No preset entry date needed correction.** All ten dates resolved to real trading-calendar bars against the committed bundle (manifest `45a9f1ae6444`) on the generator's first run; the plan's fallback path (correct-and-note-in-whyThisWindow) was not exercised.

## Deliberate-Break Verification (plan-required, non-vacuous proof)

Per the plan's acceptance criteria, both pinning mechanisms were deliberately broken, observed to fail with the stated message, and reverted cleanly before the final commit:

1. **Pinning test (D-18).** Changed `spx-3x-1929`'s committed `finalValueMultiple` from `1612.387339213996` to `9999.999` in `presets.generated.ts` and reran `presets.generated.test.ts`. Observed failure:
   ```
   AssertionError: expected [ { id: 'spx-3x-1929', ... } ] to deeply equal [ { id: 'spx-3x-1929', ... } ]
   - "finalValueMultiple": 9999.999,
   + "finalValueMultiple": 1612.387339213996,
   ```
   File restored; `diff` against the pre-break copy was empty.

2. **D-16 assertion.** Changed `tqqq-covid-crash`'s `expenseRatioPercent` from `0` to `0.91` in `presets.ts` and reran the D-16 test. Observed failure:
   ```
   AssertionError: preset "tqqq-covid-crash" (symbol TQQQ) must have expenseRatioPercent exactly 0:
   backtest.ts's expenseCost is NOT leverage-scaled, so a non-zero expense ratio here would charge
   the fund's own fee a second time on top of the fee already embedded in its real price history,
   making the preset understate the fund it claims to show: expected 0.91 to be +0
   ```
   File restored; the diff against the last commit matched exactly the intended `Object.freeze()` change from Task 3 (no residual break).

## Deviations from Plan

None — plan executed exactly as written. No architectural changes, no scope additions beyond what Tasks 1-3 specified.

## Test Results

- `npm run typecheck` — exits 0.
- `npm run test` (unit project) — 830/830 passed (819 pre-existing + 11 new: 4 in `presets.generated.test.ts`, 7 in `presets.test.ts`), including `tests/app/static-build.test.ts` (requires a prior `npm run build`; run once during this plan's verification to produce `dist/`, gitignored, not committed).
- `npm run compute-presets` — reproducible: two consecutive runs produced byte-identical `presets.generated.ts` (no non-determinism, run did not cross a UTC midnight boundary).
- `npm run test:app` (browser project) — 178/178 passed, run cleanly in isolation. An earlier concurrent run (while a separate `npm run typecheck` background process was also active) produced 3 unrelated failures on this sandbox's constrained ~1.9GB RAM: two `crosshair.browser.test.ts` timeouts and one `offline.browser.test.ts` failure because `dist/` did not yet exist. All three were re-run individually/in a clean full-suite run afterward and passed — confirmed not regressions from exporting `computeDerivedMetrics`, but resource contention from running two heavy processes at once on this host, consistent with the documented sandbox characteristic noted in plan 08-01's SUMMARY.

## User Setup Required

None — no external service configuration required. No new runtime dependency was added (this plan uses only `node:fs`/`node:path`, existing kernel/data modules, and the already-installed `html-to-image`/`solid-js` from plan 08-01).

## Next Phase Readiness

- `PRESET_DEFINITIONS`, `PRESET_OUTCOMES`, and `presetById` are the data layer plan 08-04 needs to build the featured row and the Scenarios overlay — applying a preset writes `preset.request` through the same validated store setters any parameter control uses (D-19), filling in `bundleVersion` from the live manifest at apply time.
- `preset.outcomeMetric` names which of `finalValueMultiple`/`irr`/`cagr`/`maxDrawdown` each preset's card should headline; `PRESET_OUTCOMES` carries the pre-computed value for exactly that metric (plus every other field) so plan 08-04 never needs to recompute anything live.
- No blockers.

---
*Phase: 08-export-and-the-canonical-arguments*
*Completed: 2026-08-26*
