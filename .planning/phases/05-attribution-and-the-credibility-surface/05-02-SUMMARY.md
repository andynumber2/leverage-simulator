---
phase: 05-attribution-and-the-credibility-surface
plan: 02
subsystem: attribution
tags: [equity-chart, uplot, ghost-series, null-gap]
status: complete
dependency-graph:
  requires:
    - src/validation/attribution.ts (computeAttribution, now also computeCumulativeIndexReturns)
    - src/data/kernel-inputs.ts (KernelInputs)
    - src/app/components/ResultColumn/EquityCurveChart.tsx (buildTerminatorData's (number | null)[] null-gap precedent)
    - src/app/components/ResultColumn/log-axis-splits.ts (plain-.ts-sibling-of-.tsx precedent)
  provides:
    - src/app/components/ResultColumn/naive-series.ts (buildNaiveGhostData)
    - src/validation/attribution.ts (computeCumulativeIndexReturns, newly exported)
    - src/app/components/ResultColumn/EquityCurveChart.tsx (unconditional ghost uPlot series)
  affects: []
tech-stack:
  added: []
  patterns:
    - "Prefix-product re-parametrization of a suffix-product recurrence, so the same cash-flow-weighted formula computes a per-bar series in O(n) instead of recomputing the final-bar sum from scratch at every bar"
    - "null-gap uPlot series (existing buildTerminatorData idiom), reused for a non-absorbing negative-value case rather than an absorbing one"
key-files:
  created:
    - src/app/components/ResultColumn/naive-series.ts
    - tests/app/naive-ghost-series.test.ts
    - tests/app/naive-ghost-series.browser.test.ts
  modified:
    - src/validation/attribution.ts
    - src/app/components/ResultColumn/EquityCurveChart.tsx
decisions:
  - "computeCumulativeIndexReturns added as a new exported helper in attribution.ts rather than refactoring computeNaiveFinalValue's existing suffix-product walk -- the existing, already-tested code stays untouched; naive-series.ts imports the new shared prefix-product helper instead of hand-rolling a second recurrence"
  - "Ghost series presence asserted in browser tests via uPlot's own legend DOM (.u-legend .u-label textContent), not canvas pixel sampling -- uPlot draws series strokes directly to canvas with no other queryable DOM for series identity"
metrics:
  duration: ~35min
  completed: 2026-08-20
actuals:
  tokens: 6806
  tasks: 2
  commits: 2
---

# Phase 05 Plan 02: Naive Ghost Curve Summary

A permanent, always-on dashed naive-value series drawn behind the real equity curve, computed
per-bar via a prefix-product re-parametrization of `computeAttribution`'s own cash-flow recurrence
so the ghost curve and the attribution panel's naive figure can never disagree, with `null`
substituted (never truncated) at every bar the naive value is non-positive.

## What Was Built

**Task 1 (`tdd`-flavored, pure module):** `buildNaiveGhostData(inputs, plottedBarCount)` in the new
`src/app/components/ResultColumn/naive-series.ts`, a plain `.ts` sibling of `EquityCurveChart.tsx`
(no `solid-js`/`uplot` imports, following `log-axis-splits.ts`'s precedent) so it is unit-testable
in the Node `unit` vitest project. Rather than re-deriving D-02/D-05's naive-value recurrence a
second time, `attribution.ts` gained one new exported helper, `computeCumulativeIndexReturns`, the
running cumulative index return from bar 0 forward. `naive-series.ts` re-parametrizes
`computeAttribution`'s existing suffix-product ("cash flow to end of run") walk into a
prefix-product ("bar 0 to current bar") walk: letting `P_i = 1 + cumulativeIndexReturns[i]`, a
cash flow's contribution to bar `i` expands to `cashFlow*(1-leverage) + cashFlow*leverage*P_i/P_k`,
so two running sums (`totalInvested`, `weightedFlows = sum(cashFlow_k/P_k)`) are enough to compute
every bar's naive value in one O(n) forward pass rather than an O(n^2) re-sum. `null` is substituted
at every bar whose value is `<= 0`; the array is never truncated, so a drawdown deeper than
`1/leverage` that later recovers (05-RESEARCH.md Pitfall 1) renders both segments.

`tests/app/naive-ghost-series.test.ts` (6 tests, `unit` project): a monotonically-rising series
with no null anywhere; a one-way drawdown where null appears at and after the threshold crossing
with earlier bars staying numeric; a synthetic drawdown/recovery fixture proving the array is never
truncated (`data.length` always equals `plottedBarCount`) and a numeric value exists at an index
strictly after the last null; final-bar agreement with `computeAttribution`'s `naiveFinalValue`
within 1e-9 relative tolerance for both a zero-contribution and a contribution-bearing run; a
zero-bar-count input returning `[]` without throwing.

**Task 2:** `EquityCurveChart.tsx` gained a third, unconditional `uPlot.Series` entry --
`ghostSeries` (`stroke: textMuted`, `width: 1.5`, `dash: [4, 3]`, `points: { show: false }`,
label verbatim from 05-UI-SPEC.md's Copywriting Contract: `"Naive: leverage × return, no costs
(dashed)"`) -- inserted immediately after the x-series placeholder and before `equitySeries` in
both the `series` array and the `uPlot.AlignedData` tuple, so it draws behind the accent stroke by
array order alone (no explicit z-index needed). Unlike the ruin terminator, the ghost series is
never `undefined`-guarded: a non-ruined run renders three series entries (x, ghost, equity), a
ruined run renders four (x, ghost, equity, ruin) -- verified by reading the final diff, both
branches of the ternary carry `ghostSeries`/`ghostData` unconditionally. `ghostData` is computed
from `buildNaiveGhostData(props.inputs, xs.length)`, the same plottable bar count `ys` already
uses. No change to the y-scale `distr` handling, log decade splits, axis sizing hook, or the
`themeVersion` effect -- the ghost series repaints on theme change for free through the existing
full-instance rebuild.

`tests/app/naive-ghost-series.browser.test.ts` (4 tests, `app` project): since uPlot draws series
strokes directly to canvas with no other queryable DOM for series identity, series presence is
asserted through uPlot's own default legend DOM (`.u-legend .u-label` `textContent`, matching each
series' own `label` string) rather than canvas pixel sampling. Covers: ghost + real series present
in the legend on a default landing run at the default log scale; both present after toggling to
linear; the NDX 10x from 1999-03-04 deep-drawdown high-leverage repro (the same fixture
`log-axis-splits.browser.test.ts` uses for T-05-03's related log-scale DoS regression) rendering
without a thrown error, with both series still present and uPlot laid out (`.u-over` non-zero
width); both series surviving a theme toggle (dark then back to light).

## Verification

- `npx vitest run --project unit tests/app/naive-ghost-series.test.ts`: 6/6 passing
- `npx vitest run --project app tests/app/naive-ghost-series.browser.test.ts`: 4/4 passing
- `npm test` (full unit project, after `npm run build` to satisfy `static-build.test.ts`'s
  pre-existing `dist/` precondition, unrelated to this plan): 573/573 passing
- `npm run test:app` (full browser project): 61/61 passing
- `npx tsc --noEmit`: clean
- `grep -cE "from 'solid-js'|from 'uplot'" src/app/components/ResultColumn/naive-series.ts` == 0
- `grep -c "buildNaiveGhostData" src/app/components/ResultColumn/EquityCurveChart.tsx` == 3
- `grep -c "dash:" src/app/components/ResultColumn/EquityCurveChart.tsx` == 1

## Deviations from Plan

None. Both tasks executed exactly as written. The one environment condition encountered --
`npm test`'s `tests/app/static-build.test.ts` failing on a missing `dist/` directory -- is a
pre-existing precondition of that unrelated test file (it fails loudly by design on a missing
production build) and was resolved by running `npm run build` once before the final `npm test`
pass, not a code change.

## Authentication Gates

None encountered.

## Known Stubs

None. `buildNaiveGhostData` is a real computation over the run's own return series; no hardcoded,
mocked, or placeholder data exists anywhere in this plan's changes.

## Threat Flags

None. T-05-03 (DoS via a non-positive value reaching the log-scale renderer) and T-05-04 (naive
value definition drift between the chart and the attribution panel) are exactly the mitigations
this plan implements, not new surface: `buildNaiveGhostData` substitutes `null` before any value
reaches uPlot, and the final-bar-agreement test pins the ghost curve against
`computeAttribution`'s own `naiveFinalValue`. No new network endpoint, auth path, file access
pattern, or schema change was introduced.

## Backstop Items Not Independently Verified

The plan's `must_haves.truths` mark two rows `verification: backstop` (rendered-pixel questions,
not provable in prose): the dash pattern staying visually distinguishable from the solid accent
stroke at ~25,000 bars compressed into the chart width, and the two-entry legend not crowding the
log/linear toggle or theme control at the narrowest supported viewport without either 44x44px touch
target shrinking. No dedicated narrow-viewport or dense-bar-count screenshot test was added in this
plan (neither task's `<acceptance_criteria>` requires one); per the UI-SPEC's own routing rule for
backstop rows with no wired evidence, both are flagged here for phase-level UI review rather than
asserted as independently verified.

## Self-Check: PASSED

- FOUND: src/app/components/ResultColumn/naive-series.ts
- FOUND: tests/app/naive-ghost-series.test.ts
- FOUND: tests/app/naive-ghost-series.browser.test.ts
- FOUND: 0fa2eac (Task 1 commit)
- FOUND: c598d26 (Task 2 commit)
