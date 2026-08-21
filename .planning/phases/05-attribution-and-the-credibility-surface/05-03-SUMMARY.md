---
phase: 05-attribution-and-the-credibility-surface
plan: 03
subsystem: validation
tags: [synthetic-comparison, validation-section, tracking-error, solid-component, extraction]
status: complete
dependency-graph:
  requires:
    - src/validation/tracking-error.ts (computeTrackingError, TrackingErrorWindow, TrackingErrorResult)
    - src/data/kernel-inputs.ts (buildKernelInputs, BacktestRequest)
    - src/kernel/backtest.ts (runBacktest)
    - src/app/state.ts (backtestRequest, loadedBundle, loadStatus)
    - src/metrics/format.ts (formatPercent, formatSignedPercent)
    - tests/validation/upro-tqqq-gate.test.ts (the private helpers this plan extracted out of it)
  provides:
    - src/validation/synthetic-comparison.ts (readSeriesLevels, sliceLevelsToWindow, deriveReturns,
      localIndexAtOrBefore, localIndexAtOrAfter, resolveOverlapWindow, buildRateRegimeWindows,
      MIN_OVERLAP_YEARS, SYNTHETIC_LEVERAGE, NEAR_ZERO_RATE_ERA_END, HIGH_RATE_ERA_START)
    - src/app/components/ValidationSection/ (ValidationSection, FundSelector, TrackingErrorSummary,
      SubWindowTable)
  affects:
    - tests/validation/upro-tqqq-gate.test.ts (rewritten to import from the new module)
    - src/app/App.tsx (mounts ValidationSection below the app-layout shell)
    - src/app/styles.css (--space-2xl token, seven new validation-section classes)
tech-stack:
  added: []
  patterns:
    - "resolveOverlapWindow resolves the D-29 rate-coverage-truncated window directly from the
      manifest/calendar/asset headers, deliberately never importing buildKernelInputs, so the
      new module stays a sibling to the data layer (tracking-error.ts's own import discipline)"
    - "One createMemo per fund selection drives both the headline figures and the sub-window
      table together, so no partial cross-fund state can exist"
    - "Every sub-window row shares one static CSS class (no classList, no conditional styling)
      so an unfavourable regime cannot be selectively de-emphasized without failing a test"
key-files:
  created:
    - src/validation/synthetic-comparison.ts
    - tests/validation/synthetic-comparison.test.ts
    - src/app/components/ValidationSection/ValidationSection.tsx
    - src/app/components/ValidationSection/FundSelector.tsx
    - src/app/components/ValidationSection/TrackingErrorSummary.tsx
    - src/app/components/ValidationSection/SubWindowTable.tsx
    - tests/app/validation-section.browser.test.ts
  modified:
    - tests/validation/upro-tqqq-gate.test.ts
    - src/app/App.tsx
    - src/app/styles.css
decisions:
  - "resolveOverlapWindow duplicates the D-29 rate-coverage-truncation arithmetic directly against
    the manifest/asset headers rather than calling buildKernelInputs, matching
    tracking-error.ts's own no-kernel/no-data-layer import discipline stated in this plan's Task 1
    acceptance criteria and read_first list"
  - "The gate test's overlap-window-resolution block (compute the later firstDate, call
    buildKernelInputs, assert MIN_OVERLAP_YEARS) is replaced by one resolveOverlapWindow call that
    throws on failure, rather than a discriminated-union return, matching buildKernelInputs' own
    throwing convention already used throughout the data layer"
  - "The Copywriting Contract's cost-parameter note substitutes a plain hyphen for its literal em
    dash, the same substitution 05-01-PLAN.md's D-04 gain-suffix copy already made, per this
    project's absolute em-dash prohibition"
  - "Sub-window rows stack in a single column at every viewport width (never a fixed grid), so the
    F6 overflow backstop (no column clipping at the narrowest supported viewport) is a structural
    guarantee rather than a media-query-dependent one"
metrics:
  duration: ~50min
  completed: 2026-08-20
actuals:
  tokens: 16036
  tasks: 3
  commits: 3
---

# Phase 05 Plan 03: The Validation Section and the Credibility Surface Summary

Extracted the UPRO/TQQQ gate test's private synthetic-construction helpers into
`src/validation/synthetic-comparison.ts` (byte-identical gate figures before/after, verified via
git stash comparison) and built a permanently reachable `ValidationSection` that computes both
D-11 tracking-error gates live in the browser from the same helpers, with a live rate-regime
sub-window breakdown.

## What Was Built

**Task 1:** `src/validation/synthetic-comparison.ts` exports `readSeriesLevels`,
`sliceLevelsToWindow`, `deriveReturns`, `localIndexAtOrBefore`, `localIndexAtOrAfter` (moved
verbatim out of `tests/validation/upro-tqqq-gate.test.ts`), plus two new exports that consolidate
logic the gate test previously inlined: `resolveOverlapWindow` (the later-of-two-firstDate
resolution, the D-29 rate-coverage truncation, and the `MIN_OVERLAP_YEARS` check, throwing a
stated failure rather than returning a silently short window) and `buildRateRegimeWindows` (the
near-zero-rate/high-rate sub-window enumeration from `NEAR_ZERO_RATE_ERA_END`/
`HIGH_RATE_ERA_START`). The gate test was rewritten to import all of these; its own assertions,
tolerances, era boundaries and expected values are unchanged. `resolveOverlapWindow` resolves the
window directly from the manifest, calendar and decoded asset headers rather than calling
`buildKernelInputs`, matching `tracking-error.ts`'s own "no kernel import, no data-layer import"
discipline, so a caller's own later `buildKernelInputs` call (with its real leverage and cost
parameters) resolves deterministically to the identical window.

Verified behaviour-preservation two ways: `npx vitest run` on both the rewritten gate test and the
new `tests/validation/synthetic-comparison.test.ts` (19 tests) pass, and a `git stash` comparison
confirmed the gate's logged UPRO/TQQQ tracking-error and return-drift figures are byte-identical
before and after the extraction (e.g. UPRO full-window `annualizedTrackingError=3.2149%`,
`annualizedReturnDrift=0.2538%` unchanged).

**Task 2:** `ValidationSection.tsx` (a new `src/app/components/ValidationSection/` directory) owns
a fund signal defaulting to UPRO and a `createMemo` that, for the selected fund: resolves the
overlap window through `resolveOverlapWindow`, builds and runs the synthetic 3x series through
`buildKernelInputs`/`runBacktest` with leverage pinned to `SYNTHETIC_LEVERAGE` and the
`${index}/total-return` series (never the dividend-stripped leg), and computes both D-11 gates
through `computeTrackingError`. Cost (`expenseRatioPercent`/`financingSpreadPercent`) is read live
from `backtestRequest()` on every recompute, so editing either in the parameter column moves the
rendered figures. `FundSelector.tsx` is a two-option radio-style control with the Copywriting
Contract's exact option strings. `TrackingErrorSummary.tsx` renders both headline figures through
`src/metrics/format.ts` plus the cost-parameter note. Mounted in `App.tsx` after the closing tag of
the `app-layout` two-column shell, `id="validation"`, a sibling of (never inside) the
`screenshot-region` element. Added `--space-2xl` (48px) to `styles.css`'s spacing tokens.

**Task 3:** `SubWindowTable.tsx` renders one row per rate-regime window from
`buildRateRegimeWindows`, columns for the regime label, annualized tracking error and annualized
return drift, every cell through `format.ts`. Every row shares the identical `sub-window-row`
class with no conditional styling -- verified by a browser test asserting every rendered row's
`class` attribute is byte-identical. Wired into `ValidationSection.tsx` from the same `createMemo`
that produces the headline figures, so a fund switch replaces the window, both gate figures and the
whole table together atomically. `tests/app/validation-section.browser.test.ts` (5 tests) covers:
UPRO selected by default with both figures rendered outside the screenshot region; one row per
regime including the high-rate row with formatted-percentage figures; identical row class lists;
switching to TQQQ replacing the figures and every row together with no mixed-fund state; and
editing the expense-ratio control moving the rendered tracking-error figure.

## Verification

- `npx vitest run --project unit tests/validation/upro-tqqq-gate.test.ts tests/validation/synthetic-comparison.test.ts`: 21/21 passing
- `npx vitest run --project app tests/app/validation-section.browser.test.ts`: 5/5 passing
- `npm test` (full unit project): 584/584 passing
- `npm run test:app` (full browser project, against a real `npm run build`): 62/62 passing
- `npx tsc --noEmit`: clean
- `git stash` comparison: UPRO/TQQQ gate figures byte-identical before and after the extraction
- `grep -cE "from 'vitest'|from \"vitest\"|from 'node:" src/validation/synthetic-comparison.ts` == 0
- `grep -c "from '../app/" src/validation/synthetic-comparison.ts` == 0
- `grep -c "price-return" src/app/components/ValidationSection/ValidationSection.tsx` == 0
- `grep -c "total-return" src/app/components/ValidationSection/ValidationSection.tsx` >= 1
- `grep -c "SYNTHETIC_LEVERAGE" src/app/components/ValidationSection/ValidationSection.tsx` >= 1, no numeric leverage literal passed to `buildKernelInputs`
- `grep -cE "Math.sqrt|Math.pow\(" src/app/components/ValidationSection/*.tsx` == 0

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Acceptance-criteria grep failure] The module head comment's own prose tripped the
`price-return` absence grep**
- **Found during:** Task 2 verification
- **Issue:** `ValidationSection.tsx`'s original head comment explained the D-10 pinning by naming
  the literal string `price-return` in prose ("never `price-return`"), which the acceptance
  criterion's `grep -c "price-return"` (checking for the absence of any user-reachable path to the
  dividend-stripped leg, T-05-05) counted as a match, returning 1 instead of the required 0.
- **Fix:** Reworded the comment to describe the leg without spelling out its series-id suffix
  literally, and added a note explaining why the exact string is deliberately never written in this
  file, including in comments.
- **Files modified:** `src/app/components/ValidationSection/ValidationSection.tsx`
- **Commit:** e928066

None of the above required an architectural decision (Rule 4) or a checkpoint.

## Authentication Gates

None encountered.

## Known Stubs

None. Every figure `ValidationSection` renders is a real `computeTrackingError` result over a real
`runBacktest` call; no hardcoded, mocked, or placeholder data exists anywhere in this plan's
changes.

## Threat Flags

None beyond the threat model's own named mitigations, which this plan implements directly:
T-05-05 (dividend-stripped-leg tampering) is closed by the fixed `total-return` suffix and the
`price-return`-absence grep; T-05-06 (cost-parameter fitting) is closed by the no-fitting header
comment carried into the new module and the unchanged CI gate; T-05-07 (sub-window row suppression)
is closed by every row sharing one static class, asserted by a browser test. No new network
endpoint, auth path, file access pattern, or schema change was introduced.

## Backstop Items Not Independently Verified

The plan's `must_haves.truths` marks one row `verification: backstop`: the rate-regime sub-window
table degrading to a stacked or horizontally scrollable layout rather than clipping columns at the
narrowest supported viewport. `.sub-window-row` uses `flex-direction: column` unconditionally (no
fixed-column grid at any breakpoint), so every row stacks its label above its two figures at every
viewport width -- a structural guarantee rather than a media-query-dependent one, but no dedicated
narrow-viewport screenshot test was added in this plan. Flagged here for phase-level UI review
rather than asserted as independently verified.

## Self-Check: PASSED

- FOUND: src/validation/synthetic-comparison.ts
- FOUND: tests/validation/synthetic-comparison.test.ts
- FOUND: src/app/components/ValidationSection/ValidationSection.tsx
- FOUND: src/app/components/ValidationSection/FundSelector.tsx
- FOUND: src/app/components/ValidationSection/TrackingErrorSummary.tsx
- FOUND: src/app/components/ValidationSection/SubWindowTable.tsx
- FOUND: tests/app/validation-section.browser.test.ts
- FOUND: d97511d (Task 1 commit)
- FOUND: e928066 (Task 2 commit)
- FOUND: 799ca47 (Task 3 commit)
