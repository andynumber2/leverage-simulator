---
phase: quick-260820-4qx
plan: 01
subsystem: equity-curve-chart
tags: [uplot, log-scale, renderer-hang, dos-fix, uat]
status: complete
dependency-graph:
  requires: []
  provides: [logDecadeSplits, formatLogAxisValue]
  affects: [EquityCurveChart.tsx, phase-04-uat]
tech-stack:
  added: []
  patterns: [pure-function-module-for-node-testability, loop-safe-integer-step-generator]
key-files:
  created:
    - src/app/components/ResultColumn/log-axis-splits.ts
    - tests/app/log-axis-splits.test.ts
    - tests/app/log-axis-splits.browser.test.ts
  modified:
    - src/app/components/ResultColumn/EquityCurveChart.tsx
    - .planning/phases/04-first-defensible-backtest-in-the-browser/04-UAT.md
    - .planning/STATE.md
decisions:
  - "uPlot's built-in logAxisSplits cannot advance below a roughly 1e-22 log y-scale minimum, so the log y axis now supplies its own decade splits plus an identity filter, chosen over clamping the range or truncating the series so the full curve stays visible."
metrics:
  duration: ~55min
  completed: 2026-08-20
actuals:
  tokens: 46000
  tasks: 3
  commits: 2
---

# Quick Task 260820-4qx: Fix uPlot log-scale renderer hang in equity curve chart Summary

Loop-safe decade splits on the log y axis stop uPlot's built-in split generator from hanging
the Chromium renderer below a ~1e-22 log-scale minimum, and phase 04's seven backstop UAT items
are now recorded as automation-covered.

## What Was Built

**Root cause (locked diagnosis from planning, not re-investigated):** uPlot's built-in
`logAxisSplits` (`node_modules/uplot/dist/uPlot.esm.js:1495`) runs a `do...while` loop that
advances by repeated multiplication; `roundDec` can snap `split + foundIncr` back onto `split`
once the log y-scale minimum drops below roughly 1e-22, so the loop never advances and the
renderer is killed. The NDX/total-return leverage-10 entry-1999-03-04 permalink decays to a
plotted minimum below 1e-24 before its ruin bar and reliably triggers it.

**Fix (the user's chosen approach, implemented exactly, no alternative):** a new
`src/app/components/ResultColumn/log-axis-splits.ts` module exports `logDecadeSplits(scaleMin,
scaleMax)`, a pure, total decade-split generator built from integer decade exponents stepped by
an integer `step >= 1` — every step provably advances regardless of how small the minimum is.
It is a separate plain `.ts` module rather than an export inside the `.tsx` component because
the Node `unit` vitest project cannot parse `.tsx` (no `vite-plugin-solid` on that project,
`"jsx": "preserve"` in tsconfig).

`EquityCurveChart.tsx`'s log branch (`isLog === true` only) now sets three axis keys:
- `splits`: delegates to `logDecadeSplits`.
- `filter`: identity — required because uPlot installs `log10AxisValsFilt` by default for a
  distr-3/log-10 scale, which blanks any split not at its own expected granularity.
- `values`: a new `formatLogAxisValue` formatter, a deliberate addition beyond the locked fix
  text. uPlot's default `numAxisVals` formats through `Intl.NumberFormat` with 3 max fraction
  digits, collapsing every sub-1e-4 decade to the literal string "0" — unreadable on the 1e-24
  repro. `formatLogAxisValue` switches to `toExponential(0)` past ±4 decades and keeps
  `toLocaleString()` otherwise, so ordinary landing-run magnitudes are unaffected and the
  measured gutter stays wider than uPlot's 50px default.

The linear axis branch is untouched — no new keys, same uPlot defaults as before.

A floating-point correction was needed in `logDecadeSplits` beyond the plan's original
algorithm text: `10 ** floor(log10(x))` can land a few ULPs above `x` due to `log10`/`pow` not
being exact bitwise inverses, which broke the "first element at or below scaleMin" guarantee at
the exact 1e-24/1e-23 boundary in a unit test. Added a small bounded correction loop (capped at
4 iterations, not user-controlled) that nudges the decade exponent down/up until the bound holds
exactly.

**Task 2** wrote `tests/app/log-axis-splits.test.ts` in the Node `unit` project, covering the
strictly-increasing invariant, span bounds, the `TARGET_DECADE_SPLIT_COUNT + 2` length bound on
absurd 1e-300/1e300 spans, empty-array returns for every non-finite/non-positive input in either
argument position, swapped-argument equality, and `min === max`. All 23 assertions pass. Ran
`narrow-viewport.browser.test.ts` unmodified — all six tests already pass against the Task 1
fix, so no edit to that file was needed or made.

**Task 3** updated `04-UAT.md`: status `complete`, all seven items recorded as covered by
`tests/app/narrow-viewport.browser.test.ts`, item 5 recorded honestly as PARTIALLY covered (the
"reflows to at most two lines" sub-claim is unmet by the real `cost-parameters.ts` content, not
by a CSS defect), summary `total: 7, passed: 6, issues: 1, pending: 0`. Updated `STATE.md`:
`completed_plans` corrected from 21 to 28 (verified count of committed SUMMARY.md files),
`status` from `executing` to `verifying`, Current Position updated to 8 of 8 plans executed with
phase 04 at verification, one new Decision bullet, one new Quick Tasks Completed row. Left
`total_phases: 4` / `completed_phases: 3` unchanged as explicitly out of scope (re-denominating
the milestone against the ROADMAP's actual eight phases is a user decision, noted here instead).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Floating-point ULP error broke the exact scaleMin/scaleMax boundary guarantee**
- **Found during:** Task 2, writing the "spans from at or below min to at or above max" unit test
- **Issue:** `10 ** Math.floor(Math.log10(1e-24))` evaluates to `1.0000000000000001e-24`, a few
  ULPs above the literal `1e-24`, because `Math.log10`/`10 ** n` are not exact bitwise inverses.
  This broke the "first element at or below scaleMin" guarantee exactly at the real repro
  boundary.
- **Fix:** added a bounded correction loop (capped at 4 iterations) in `logDecadeSplits` that
  nudges the decade exponent down (for the lower bound) or up (for the upper bound) until
  `10 ** exponent` genuinely clears the target, rather than trusting `floor`/`ceil` of `log10`
  alone.
- **Files modified:** `src/app/components/ResultColumn/log-axis-splits.ts`
- **Commit:** a55b611

### Adjustments to the plan's stated test approach

The plan's Task 1 action specified collecting "the rendered y-axis label strings" from the DOM
to assert no two adjacent labels are equal. Investigation of `node_modules/uplot/dist/
uPlot.esm.js` (lines ~4638-4664) showed uPlot draws axis values with `ctx.fillText` directly
onto the canvas, not into queryable DOM nodes — `axis._el` is only an empty positioning overlay
with no text content. No DOM-based label collection is possible. Instead, `formatLogAxisValue`
was exported from `EquityCurveChart.tsx` (matching the existing pattern `axisSizeForLabels`
already uses, per `tracer.browser.test.ts`), and the browser test exercises the actual composed
pipeline (`logDecadeSplits` then `formatLogAxisValue`) against the real data-derived min/max
from the mounted NDX 10x run, asserting no two adjacent formatted labels are identical. This
tests the exact functions the real axis calls, against the exact data the real run produces —
the closest achievable proxy for "rendered labels" given canvas's opacity to DOM queries.

## Auth Gates

None.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary schema changes. The threat model's
two `mitigate` items (loop termination in the axis's log branch, and in `logDecadeSplits` itself)
are addressed by Task 1's totality guards and Task 2's exhaustive non-finite/non-positive/swapped/
equal-argument test coverage.

## Self-Check: PASSED

- FOUND: src/app/components/ResultColumn/log-axis-splits.ts
- FOUND: tests/app/log-axis-splits.test.ts
- FOUND: tests/app/log-axis-splits.browser.test.ts
- FOUND: commit a55b611 (fix: loop-safe decade splits)
- FOUND: commit 0491895 (test: unit-test logDecadeSplits totality)
- FOUND: .planning/phases/04-first-defensible-backtest-in-the-browser/04-UAT.md updated (uncommitted, per dispatch instructions — orchestrator commits docs)
- FOUND: .planning/STATE.md updated (uncommitted, per dispatch instructions — orchestrator commits docs)

## Final Gate Results

- `npm run typecheck`: **PASS** (exit 0, no output)
- `npm test` (unit project): **PASS** — 39 test files, 546 tests passed
- `npm run test:app` (browser project, Chromium via Playwright): **PASS on the final run** — 10
  test files, 53 tests passed. One transient failure was observed on an earlier full-suite run
  (`tests/app/offline.browser.test.ts`, `reachedInteractive` false), unrelated to any file this
  plan touches; it passed both in isolation and on a subsequent full-suite re-run, consistent
  with pre-existing flake rather than a regression from this change. Per the scope boundary, this
  file was not modified.
