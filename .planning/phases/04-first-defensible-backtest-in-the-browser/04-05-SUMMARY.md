---
phase: 04-first-defensible-backtest-in-the-browser
plan: 05
subsystem: ui
tags: [solid-js, forms, validation, cost-parameters, caveat-and-compute]

requires:
  - phase: 04-first-defensible-backtest-in-the-browser
    provides: "plan 04's ParameterColumn/SourceCitation/ValidationExplanation scaffolding, bounds.ts, and scheduleRun's D-11/D-12 catch-and-clear path"
provides:
  - "src/app/components/ParameterColumn/{HoldingModeControl,ContributionControl,CostControls}.tsx: the remaining parameter column, all wired through updateBacktestRequest"
  - "src/app/components/ResultColumn/ValidationExplanation.tsx: the full three-variant explanation surface (bundle-mismatch slot, single-field-eviction, cross-field-caveat) with its fixed stacking order"
  - "src/app/state.ts: scheduleRun now distinguishes the D-12 range-rejection throw from the D-10 holding-period-overrun throw, retries the latter to a caveat-and-compute result, and derives D-29's rate-coverage caveat correctly for hold-to-today mode only"
affects: ["04-07 (permalink encodes holdingPeriodBars/contributionAmount/contributionFrequency/expenseRatioPercent/financingSpreadPercent; BundleVersionBanner fills the reserved bundle-mismatch variant slot in ValidationExplanation)"]

actuals:
  tokens: 11638
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Record<Union, T> exhaustiveness over hand-written arrays: ContributionControl's FREQUENCY_LABELS is typed Record<ContributionFrequency, string> so TypeScript rejects a missing/extra key if the five-member union ever changes, mirroring cost-parameters.ts's own exhaustiveness check -- the closed set cannot silently drift from the schedule resolver even without a runtime array export to introspect."
    - "Percent/fraction boundary crossed exactly twice, in two different files: CostControls.tsx seeds its two fields from GENERIC_3X_EXPENSE_RATIO/FINANCING_SPREAD_DEFAULT (fraction -> percent, once per field); buildKernelInputs converts back (percent -> fraction) on the way into the kernel. Every other percent figure in CostControls.tsx (range bounds, the 'sourced default was X%' wording) routes through formatPercent, which does its own internal conversion in a different file -- kept CostControls.tsx's own grep-checked conversion count at exactly 2."
    - "Caller-supplied caveat, not helper-derived: storeSuccessfulRun(bundle, inputs, result, caveat) takes the resolved caveat string as a parameter rather than deriving it internally, because the two success paths (the first try, and the D-10 retry) compute it from genuinely different sources -- folding that decision into the shared helper would have hidden which source won when both could apply (which is exactly the bug this plan found and fixed, see Deviations)."

key-files:
  created:
    - src/app/components/ParameterColumn/HoldingModeControl.tsx
    - src/app/components/ParameterColumn/ContributionControl.tsx
    - src/app/components/ParameterColumn/CostControls.tsx
    - tests/app/validation.browser.test.ts
  modified:
    - src/app/components/ParameterColumn/ParameterColumn.tsx
    - src/app/components/ResultColumn/ValidationExplanation.tsx
    - src/app/state.ts
    - src/app/App.tsx
    - src/app/styles.css

key-decisions:
  - "meta.truncatedForRateCoverage is a DATASET-WIDE fact (the shared @rate/rate series ends a few trading days before every price series, per cost-parameters.ts's own ragged-right-edge-truncation mechanism) -- true for effectively every run over this bundle regardless of the requested window. It only faithfully describes THIS run's own end date in hold-to-today mode, where buildKernelInputs always resolves endAbsIndex to exactly that boundary by construction. holdToTodayRateCoverageCaveat (state.ts) gates on holdingPeriodBars === null for this reason; a fixed period gets its D-10 caveat exclusively from the explicit overrun throw, whose message is accurate to the specific requested window rather than this dataset-wide flag."
  - "ValidationExplanation takes an ExplanationVariant[] array (not a single message) and owns the STACK_ORDER sort internally, so the stacking order lives in exactly one place regardless of what order a caller supplies variants in. App.tsx's explanationVariants() only collects what currently applies; it never orders anything."
  - "The 'two simultaneous violations' stacking-order test calls ValidationExplanation({ variants }) directly (not via JSX) inside a render() call, because the file must keep the .browser.test.ts suffix the vitest 'app' project globs on, and that suffix's .ts extension is not JSX-transformed. Calling the already-compiled component as a plain function sidesteps the extension conflict without needing a synthetic app state -- eviction and caveat are mutually exclusive from any single real scheduleRun outcome (an evicted entry date throws before buildKernelInputs ever reaches the holding-period check), so no real app interaction can produce both at once anyway."

requirements-completed: [APP-04]

coverage:
  - id: D1
    description: "HoldingModeControl: fixed-period vs hold-to-today choice; fixed mode's bar-count input has min=0 (0 means a one-bar run per SIM-08, not empty) and rejects negatives at the control; hold-to-today mode renders no bar-count input and holdingPeriodBars is null"
    requirement: APP-04
    verification:
      - kind: unit
        ref: "npm run typecheck && npm run build (min attribute asserted via component source; DOM presence asserted in tests/app/validation.browser.test.ts's holding-mode-fixed interactions)"
        status: pass
    human_judgment: false
  - id: D2
    description: "ContributionControl: amount plus frequency, frequency options derived from Record<ContributionFrequency, string> so the closed set cannot drift from the schedule resolver (grep -c \"'daily'\" is 0); empty amount means zero (Default Landing Run); frequency defaults to monthly, labelled as a default, the moment a non-zero amount lands with none selected; negative amount rejected at the control"
    requirement: APP-04
    verification:
      - kind: e2e
        ref: "tests/app/validation.browser.test.ts > a negative contribution amount is rejected at its control with the value unchanged"
        status: pass
      - kind: other
        ref: "grep -c \"'daily'\" src/app/components/ParameterColumn/ContributionControl.tsx == 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "CostControls: expense ratio and financing spread seeded from GENERIC_3X_EXPENSE_RATIO/FINANCING_SPREAD_DEFAULT (fraction->percent exactly once per field, grep-bounded to 2 occurrences); default state cites via SourceCitation's costParameterId form (CITED/ASSUMED visible in the DOM); financing spread always names both FINANCING_SPREAD_RANGE bounds regardless of edited state; editing drops the default label for user-supplied wording naming the sourced default it replaced; clearing restores the default; negative/non-numeric values rejected at the control; src/validation/ untouched"
    requirement: APP-04
    verification:
      - kind: e2e
        ref: "tests/app/validation.browser.test.ts > a negative expense ratio is rejected at its control with the value unchanged; > clearing a cost field restores the imported default"
        status: pass
      - kind: other
        ref: "grep -c '/ 100\\|\\* 100' src/app/components/ParameterColumn/CostControls.tsx == 2; git diff --exit-code -- src/validation exits 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "ValidationExplanation: three-variant stacked surface (bundle-mismatch slot, single-field-eviction, cross-field-caveat) in a fixed order regardless of input order; absent by default (empty array -> zero DOM nodes); a caveat retains the chart and metrics on screen, an eviction removes both"
    requirement: APP-04
    verification:
      - kind: e2e
        ref: "tests/app/validation.browser.test.ts > the happy path renders no explanation element at all; > a fixed holding period... renders the caveat... while the chart and metrics panel both remain in the DOM; > an evicted entry date removes both the chart and the metrics panel; > a state carrying both an eviction and a caveat renders both, in the fixed stacking order"
        status: pass
      - kind: other
        ref: "grep -rc 'innerHTML' src/app == 0 (every file)"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-10's cross-field caveat: a fixed holding period running past the last supported bar is accepted, retried against holdingPeriodBars=null, and rendered with buildKernelInputs' own thrown text verbatim; D-29's rate-coverage truncation reaches the same caveat class through hold-to-today mode specifically (never through fixed mode, where the dataset-wide flag would be misleading)"
    requirement: APP-04
    verification:
      - kind: e2e
        ref: "tests/app/validation.browser.test.ts > a fixed holding period deliberately longer than the remaining data renders the caveat naming the limiting date...; > the raw hold-to-today default carries the D-29 rate-coverage caveat while the chart and metrics stay on screen"
        status: pass
    human_judgment: false

duration: ~25min
completed: 2026-08-19
status: complete
---

# Phase 4 Plan 5: Holding Mode, Contributions, Costs, and the Explanation Surface Summary

**The rest of the parameter column (holding mode, contribution schedule, cited/editable cost parameters) plus `ValidationExplanation`'s full three-variant stacking surface, with `state.ts`'s `scheduleRun` now telling apart a D-12 range-rejection eviction from a D-10 caveat-and-compute holding-period overrun and correctly scoping D-29's rate-coverage caveat to hold-to-today mode only.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3
- **Files modified:** 9 (4 created, 5 modified)
- **Commits:** 3

## Accomplishments

- `HoldingModeControl`, `ContributionControl`: the fixed-period/hold-to-today choice and the amount+frequency schedule, both disabled with the rest of the column until the manifest decodes, both writing through the existing `updateBacktestRequest`/`scheduleRun` coalescing path.
- `CostControls`: expense ratio and financing spread, editable in place, each carrying its `COST_PARAMETERS` citation and confidence tag (CITED for the expense ratio, ASSUMED for both financing-spread bounds) until edited, at which point the citation restates itself as user-supplied naming the sourced default it replaced -- `src/validation/` itself is never touched (`git diff --exit-code` proves it).
- `ValidationExplanation` extended from one hard-coded message to a `variants: ExplanationVariant[]` array with its own internal fixed stacking order (bundle mismatch, then single-field eviction, then cross-field caveat) -- the order lives in exactly one place and cannot be supplied out of order by any caller.
- `state.ts`'s `scheduleRun` now tells apart the D-12 entry-date range rejection (clear-and-explain) from the D-10 holding-period-overrun throw (caveat-and-compute: retried against `holdingPeriodBars: null`, the exact window the thrown message already names, with the original thrown text kept as the caveat verbatim).
- Found and fixed, before committing, a real semantic bug in the naive reading of "raise the caveat when `meta.truncatedForRateCoverage` is true": that flag is a dataset-wide fact (the bundled `@rate/rate` series ends a few days before every price series), not run-specific, and applying it unconditionally would have shown a caveat on every single run including the Default Landing Run's own happy path -- see Deviations.
- 8 new browser-test cases in `tests/app/validation.browser.test.ts`, including a stacking-order test that renders `ValidationExplanation` directly (not through JSX, since the required `.browser.test.ts` filename suffix keeps this file's extension `.ts`) with a synthetic two-variant array, since eviction and caveat are mutually exclusive from any single real app interaction.

## Task Commits

1. **Task 1: Holding mode and the contribution schedule** - `f4152ab` (feat)
2. **Task 2: Editable cost parameters with their sources cited inline** - `3bf0c7b` (feat)
3. **Task 3: The three-variant explanation surface and its stacking order** - `c8f670f` (feat)

## Files Created/Modified

- `src/app/components/ParameterColumn/HoldingModeControl.tsx` - fixed/hold-to-today radio pair, min-0 bar-count input
- `src/app/components/ParameterColumn/ContributionControl.tsx` - amount + frequency, `Record<ContributionFrequency, string>`-derived options
- `src/app/components/ParameterColumn/CostControls.tsx` - expense ratio + financing spread, seeded/cited/editable
- `src/app/components/ParameterColumn/ParameterColumn.tsx` - wires all three new control groups in after entry date
- `src/app/components/ResultColumn/ValidationExplanation.tsx` - `ExplanationVariant[]` prop, internal `STACK_ORDER` sort
- `src/app/state.ts` - `currentCaveatMessage`, `holdToTodayRateCoverageCaveat`, `storeSuccessfulRun`/`clearForEviction` helpers, the overrun-throw retry path
- `src/app/App.tsx` - `explanationVariants()`, chart/metrics gated only on eviction (not on a caveat)
- `src/app/styles.css` - holding-mode/contribution/cost-control tokens
- `tests/app/validation.browser.test.ts` - the full Task 3 case list plus the D-29-scoping regression coverage

## Decisions Made

See `key-decisions` in frontmatter: the dataset-wide-vs-run-specific `truncatedForRateCoverage` gating, `ValidationExplanation`'s array-owns-the-order design, and the direct-function-call stacking-order test.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, self-caught before final verification] Unconditional `truncatedForRateCoverage` caveat broke the plan's own "happy path renders nothing" acceptance criterion**
- **Found during:** Task 3, first `npm run test:app` run against the new `tests/app/validation.browser.test.ts`
- **Issue:** The plan's action text says to "raise this variant when `meta.truncatedForRateCoverage` is true." Implemented literally (unconditionally, in the shared `storeSuccessfulRun` helper), this showed a caveat on *every* successful run over this bundle, including the raw Default Landing Run (SPX, hold-to-today) -- because the bundled `@rate/rate` series ends a few trading days before every price series it's paired with (a real, permanent, dataset-wide fact recorded in `cost-parameters.ts`'s `ragged-right-edge-truncation` mechanism), not because any specific run's window was actually shortened by it. This directly contradicted the plan's own Task 3 acceptance criterion ("On the happy path `document.querySelectorAll` for the explanation element returns zero nodes") and also caused a second test (the fixed-holding-period-overrun caveat test) to read a *stale* caveat message left over from an unrelated intermediate state, since `currentCaveatMessage() !== null` was already true before the overrun update even landed.
- **Fix:** `holdToTodayRateCoverageCaveat` now gates on `holdingPeriodBars === null` (hold-to-today mode) before consulting the flag, matching the flag's own doc comment ("shortened the window below what the price series alone would have supported") -- true and meaningful only in hold-to-today mode, where `buildKernelInputs` always resolves the window's end to exactly the rate-coverage boundary by construction. In fixed mode a run's own end is whatever bar count was asked for, unrelated to this dataset-wide flag; a fixed period that actually reaches the boundary still gets an accurate, window-specific caveat from the explicit overrun-throw retry path, unchanged. `storeSuccessfulRun` was restructured to take the resolved caveat as a parameter (from two different call-site sources) rather than deriving it internally, so the two success paths can never silently disagree about which caveat won.
- **Files modified:** `src/app/state.ts`, `tests/app/validation.browser.test.ts` (added a dedicated test asserting the real hold-to-today default's caveat still fires correctly, and adjusted the happy-path test to use a genuinely caveat-free fixed-period scenario)
- **Verification:** `npm run typecheck && npm test && npm run test:app && npm run build` all exit 0 (496 + 28 tests); the happy-path test and the new hold-to-today-caveat test both pass; the holding-period-overrun test's message now matches `buildKernelInputs`' own thrown text exactly, compared programmatically rather than against a literal.
- **Committed in:** `c8f670f` (Task 3's own commit; found and fixed before committing, never shipped broken)

---

**Total deviations:** 1 (self-caught bug, fixed before commit)
**Impact on plan:** No scope creep. The fix stayed inside the two files Task 3 already owned (`state.ts`, the new test file) and clarified the plan's own literal wording against a real fact about the bundled data that the plan's author likely wasn't aware conflicts with a from-scratch mount.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Every parameter the phase's requirements name is now a real, wired control: symbol, leverage, entry date (04-04), holding mode, contributions, costs (this plan).
- `ValidationExplanation`'s `bundle-mismatch` variant slot and its position in the stacking order (first) are declared and ready; plan 04-07 supplies the comparison logic and fills the variant without touching this component's ordering or `App.tsx`'s `explanationVariants()` collection logic.
- `BacktestRequest`'s full surface (`holdingPeriodBars`, `contributionAmount`, `contributionFrequency`, `expenseRatioPercent`, `financingSpreadPercent`) is now reachable from real UI, giving 04-06/04-07's permalink encoder every field it needs to round-trip.
- `holdToTodayRateCoverageCaveat`'s dataset-wide-vs-run-specific distinction is a pattern future plans touching `meta.truncatedForRateCoverage` should reuse rather than re-deriving: the flag itself never changed meaning, only where it's trusted to describe the CURRENT run changed.
- No blockers carried forward from this plan.

## Self-Check: PASSED

All 9 claimed files verified present on disk; all 3 claimed commit hashes (`f4152ab`, `3bf0c7b`, `c8f670f`) verified present in `git log`.

---
*Phase: 04-first-defensible-backtest-in-the-browser*
*Completed: 2026-08-19*
