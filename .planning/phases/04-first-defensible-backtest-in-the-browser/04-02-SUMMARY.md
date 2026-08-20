---
phase: 04-first-defensible-backtest-in-the-browser
plan: 02
subsystem: ui
tags: [solid-js, uplot, irr, cagr, bisection, fast-check, drawdown]

requires:
  - phase: 04-first-defensible-backtest-in-the-browser
    provides: "plan 01's tracer -- src/app/App.tsx's result-column slot, src/app/state.ts's rAF-coalesced scheduleRun, EquityCurveChart.tsx's measured y-axis gutter and native uPlot distr toggle scaffolding"
provides:
  - "src/kernel/backtest.types.ts / src/kernel/backtest.ts: KernelResult.maxDrawdown, tracked in-loop as two scalars (F-01, METR-03)"
  - "src/metrics/irr.ts: CashFlow, buildCashFlows, solveIrr -- bounded bisection over dated cash flows (D-08, METR-01)"
  - "src/metrics/cagr.ts: solveCagr, closed-form CAGR (METR-02)"
  - "src/metrics/format.ts: formatPercent/formatMultiple/formatCurrency, the one formatting contract"
  - "src/app/state.ts: DerivedMetrics (irr, cagr, finalValueMultiple, ruinDate) computed once per run; updateBacktestRequest, the one write path for future parameter controls"
  - "src/app/components/ResultColumn/MetricsPanel.tsx, RuinBanner.tsx, LogScaleToggle.tsx: the five-row metrics panel, the categorical ruin state change, and the visible log/linear control (METR-01 through METR-05, VIZ-08)"
affects: ["04-04/04-05 (parameter column controls will call updateBacktestRequest)", "04-06/04-07 (permalink and PERF-07/08 measurement build on the same rAF-coalesced recompute)", "Phase 7 (METR-06's sweep reuses maxDrawdown/IRR/CAGR from the same runBacktest call, in-loop drawdown already proven cheap)"]

actuals:
  tokens: 14192
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "In-loop drawdown: two more scalars (peakValue, maxDrawdown) alongside the existing six in runBacktest's per-bar loop, updated on every path that writes outValue[i] including the ruin bar and post-ruin bars, no new array (SIM-11 preserved)"
    - "IRR by bounded bisection only, never Newton: [-0.9999, 10.0] bracket, 100-iteration cap, 1e-9 tolerance, XIRR-style day-weighted discounting via calendarDaysElapsed cumulative sums, terminal-inflow-of-0 short-circuited to exactly -1 before bisecting"
    - "buildCashFlows reads ruinBarIndex's -1 sentinel to exclude post-ruin contributions, guaranteeing Descartes'-rule single sign change"
    - "One formatting contract (src/metrics/format.ts): every rendered metric value routes through it, verified never to emit NaN/Infinity for any float64 input via a fast-check property mirroring roundtrip.test.ts's float64-extremes generator"
    - "Ruin terminator as a second uPlot series carrying a value only at the last plotted index (points-only, no connecting line possible with a single non-null point) rather than any attempt to plot the ruin bar's own clamped 0 on a log scale"

key-files:
  created:
    - tests/kernel/drawdown.test.ts
    - src/metrics/irr.ts
    - src/metrics/cagr.ts
    - src/metrics/format.ts
    - tests/metrics/irr.test.ts
    - tests/metrics/format.test.ts
    - src/app/components/ResultColumn/MetricsPanel.tsx
    - src/app/components/ResultColumn/RuinBanner.tsx
    - src/app/components/ResultColumn/LogScaleToggle.tsx
    - tests/app/metrics.browser.test.ts
  modified:
    - src/kernel/backtest.types.ts
    - src/kernel/backtest.ts
    - src/app/state.ts
    - src/app/App.tsx
    - src/app/components/ResultColumn/EquityCurveChart.tsx
    - src/app/styles.css

key-decisions:
  - "Documented deviation (Rule 1, recorded in tests/metrics/irr.test.ts and WINDOWS.md entry 4): the plan's monthly-contribution-schedule test case stated IRR solves strictly BELOW the naive finalValue/totalContributed ratio. Verified by hand (NPV at the naive rate is strictly positive, so bisection must raise the rate further) that this is backwards for a front-loaded schedule with monotonic growth -- later money compounds for less time, so the annualized rate required to produce the observed profit is HIGHER than the time-blind naive ratio implies, not lower. The test asserts the mathematically correct direction; the implementation itself follows D-08's bisection specification exactly as given."
  - "buildCashFlows and the ruin terminator marker both plot at the LAST bar strictly before ruinBarIndex, not the ruin bar itself, since the ruin bar's clamped value is always exactly 0 and a log-distributed series can never accept a zero. The RuinBanner (fed by a separately-resolved ruinDate through inputs.window.entryIndex + ruinBarIndex) is what names the exact ruin date; the chart marks where the curve had to stop."
  - "updateBacktestRequest (src/app/state.ts) was added ahead of 04-04/04-05's parameter column, as the one write path this plan's browser test needed to force a ruined run (leverage 20 against the real bundled SPX window, which includes the 2008 and 2020 single-day crashes). Future parameter controls will call the same function rather than a second write path being introduced later."

requirements-completed: [METR-01, METR-02, METR-03, METR-04, METR-05, VIZ-08]

coverage:
  - id: D1
    description: "KernelResult.maxDrawdown, tracked as two in-loop scalars with no new array; 0 for a monotonic run, exactly 1 for a ruined run, correct for multi-peak declines, and strictly between 0 and 1 for the real bundled SPX 3x series"
    requirement: METR-03
    verification:
      - kind: unit
        ref: "tests/kernel/drawdown.test.ts (5 cases) -- all pass"
        status: pass
      - kind: unit
        ref: "tests/kernel/allocation.test.ts, tests/kernel/module-boundary.test.ts, tests/validation/upro-tqqq-gate.test.ts -- unchanged and green; git diff --exit-code -- src/validation confirmed no cost parameter moved"
        status: pass
    human_judgment: false
  - id: D2
    description: "solveIrr: bounded bisection over dated cash flows, agrees with closed-form CAGR for a single cash flow within 1e-9, resolves a terminal-0 inflow to exactly -1, returns null (never NaN/Infinity) when the bracket does not straddle zero"
    requirement: METR-01
    verification:
      - kind: unit
        ref: "tests/metrics/irr.test.ts (7 cases including a fast-check property over the single-outflow-single-inflow domain) -- all pass"
        status: pass
    human_judgment: false
  - id: D3
    description: "buildCashFlows excludes contributions at or after ruinBarIndex (D-21), guaranteeing exactly one sign change in the produced sequence"
    requirement: METR-01
    verification:
      - kind: unit
        ref: "tests/metrics/irr.test.ts > buildCashFlows: D-21 post-ruin contribution exclusion (2 cases)"
        status: pass
    human_judgment: false
  - id: D4
    description: "solveCagr closed-form CAGR, matching solveIrr's -1 total-loss convention on a ruined run"
    requirement: METR-02
    verification:
      - kind: unit
        ref: "tests/metrics/irr.test.ts (single-cash-flow agreement case, fast-check property)"
        status: pass
    human_judgment: false
  - id: D5
    description: "formatPercent/formatMultiple/formatCurrency: exactly-two-decimal formatting, scientific notation above 1e6 for multiples, never emit NaN or Infinity for any float64 input including the extremes"
    requirement: METR-04
    verification:
      - kind: unit
        ref: "tests/metrics/format.test.ts (6 example cases + 3 fast-check properties over float64 extremes) -- all pass"
        status: pass
    human_judgment: false
  - id: D6
    description: "MetricsPanel: five fixed rows (IRR headline, CAGR + qualifier, max drawdown, final-value multiple, dropped-contributions), IRR headline label and identity never change with contribution state, IRR-equals-CAGR note and CAGR qualifier correctly gated on contribution amount, dropped-contributions row omitted (not zeroed) when absent"
    requirement: METR-01
    verification:
      - kind: e2e
        ref: "tests/app/metrics.browser.test.ts > headline/qualifier/note gating (2 cases), five-row fixed order (1 case)"
        status: pass
      - kind: other
        ref: "grep -c 'toFixed\\|toLocaleString\\|toPrecision' src/app/components/ResultColumn/MetricsPanel.tsx == 0"
        status: pass
    human_judgment: false
  - id: D7
    description: "RuinBanner + chart terminator: a ruined run renders the banner above the retained metrics, the chart paints without throwing, no zero value enters the plotted series, and IRR resolves to exactly -100.00%"
    requirement: METR-05
    verification:
      - kind: e2e
        ref: "tests/app/metrics.browser.test.ts > a deliberately ruined run renders the ruin banner above the retained metrics, paints without throwing on the log scale, and reports IRR -100.00%"
        status: pass
      - kind: other
        ref: "grep -rl '#C4341F' src/app --include=*.tsx and grep -rl '#E2604B' src/app --include=*.tsx both return nothing (destructive color lives only in styles.css)"
        status: pass
    human_judgment: false
  - id: D8
    description: "LogScaleToggle: both log and linear labels always in the DOM (never conditionally shown), 44x44 minimum hit area, active state changes on click without the chart throwing"
    requirement: VIZ-08
    verification:
      - kind: e2e
        ref: "tests/app/metrics.browser.test.ts > the log/linear toggle renders both labels in the DOM at all times, and clicking switches the active scale without the chart throwing"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-08-19
status: complete
---

# Phase 4 Plan 2: Metrics, Ruin, and the Scale Toggle Summary

**IRR (bounded bisection, XIRR-style day weighting) as a permanent headline metric alongside CAGR, maximum drawdown tracked in-loop on the kernel, a categorical ruin banner with a non-zero-value chart terminator, and a persistently visible log/linear scale toggle -- five fixed metric rows wired into plan 01's result-column slot.**

## Performance

- **Duration:** 15 min
- **Tasks:** 3
- **Files modified:** 16 (10 created, 6 modified)
- **Commits:** 4

## Accomplishments

- `KernelResult.maxDrawdown`: two more in-loop scalars (running peak, running max drawdown), no new array, verified exactly 0/1 at the boundaries and strictly between 0 and 1 for the real bundled SPX 3x series over its full strict-tier window, with SIM-11's allocation proof and the Phase 3 UPRO/TQQQ gate both staying green.
- `src/metrics/irr.ts`, `cagr.ts`, `format.ts`: three pure numeric modules -- bounded bisection IRR (never Newton), closed-form CAGR sharing the -1 total-loss convention, and the single formatting contract, all proven with example plus fast-check property coverage.
- `MetricsPanel.tsx`: five fixed rows in a fixed identity and order -- IRR headline (28px monospace, never changes identity), CAGR secondary with its contribution-gated qualifier, maximum drawdown, final value as a multiple of total contributed, and the dropped-contributions line (omitted, not zeroed, when absent).
- `RuinBanner.tsx` + `EquityCurveChart.tsx`'s new terminator series: a ruined run becomes a categorical state change -- the banner names the ruin date, the metrics stay on screen subordinate to it, and the chart's points-only terminator marker never carries the ruin bar's clamped 0 into a log-distributed series.
- `LogScaleToggle.tsx`: both "log" and "linear" labels always in the DOM, active state a color change rather than a label swap, wired to plan 01's `scale` signal.

## Task Commits

1. **Task 1: Maximum drawdown as two in-loop scalars on KernelResult** - `c2a4459` (feat)
2. **Task 2: IRR by bounded bisection, CAGR, and the one formatting contract** - `778ff1b` (feat)
3. **Task 3: The five-row metrics panel, the ruin state change, and the visible scale choice** - `9c2739c` (feat)
4. **Follow-up: LogScaleToggle test coverage** - `318c1c0` (test, closes an acceptance-criteria gap found during self-review before this SUMMARY)

## Files Created/Modified

- `src/kernel/backtest.types.ts` / `src/kernel/backtest.ts` - `maxDrawdown` field and its two-scalar in-loop tracking
- `tests/kernel/drawdown.test.ts` - the five behavior cases (monotonic, ruin, decline-then-new-high, two-peaks, real bundle)
- `src/metrics/irr.ts` - `CashFlow`, `buildCashFlows`, `solveIrr`
- `src/metrics/cagr.ts` - `solveCagr`
- `src/metrics/format.ts` - `formatPercent`, `formatMultiple`, `formatCurrency`
- `tests/metrics/irr.test.ts`, `tests/metrics/format.test.ts` - example + fast-check property coverage
- `src/app/state.ts` - `DerivedMetrics`, `computeDerivedMetrics`, `resolveRuinDate`, `updateBacktestRequest`
- `src/app/App.tsx` - wires `LogScaleToggle` beside the chart, `RuinBanner` above `MetricsPanel`
- `src/app/components/ResultColumn/MetricsPanel.tsx`, `RuinBanner.tsx`, `LogScaleToggle.tsx` - new components
- `src/app/components/ResultColumn/EquityCurveChart.tsx` - the ruin terminator series
- `src/app/styles.css` - metrics panel, ruin banner, and log-scale-toggle tokens/layout
- `tests/app/metrics.browser.test.ts` - the full Task 3 case list, mounted against the real app

## Decisions Made

See `key-decisions` in frontmatter: the documented IRR-test-direction correction, the terminator-marker-plots-at-the-last-valid-bar decision, and the early addition of `updateBacktestRequest`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - documented in test, not a code bug] Plan's stated IRR-vs-naive-ratio test direction was mathematically backwards**
- **Found during:** Task 2, writing `tests/metrics/irr.test.ts`
- **Issue:** The plan's `<behavior>` block asserted a monthly-contribution schedule solves to an IRR "strictly less than the naive ratio-based return." Hand verification (computing NPV at the naive rate, confirming it is strictly positive so bisection must raise the rate further) shows the opposite holds for a front-loaded schedule with monotonic growth: the naive, time-blind ratio understates the true annualized rate, so IRR is strictly greater.
- **Fix:** Wrote the test asserting the mathematically correct direction, with the reasoning documented inline. `solveIrr` itself is unchanged from D-08's specification -- this was a test-authoring correction, not an implementation bug.
- **Files modified:** `tests/metrics/irr.test.ts`
- **Verification:** Test passes with the corrected assertion; also recorded in `.planning/WINDOWS.md` entry 4 for cross-phase visibility.
- **Committed in:** `778ff1b`

**2. [Rule 3 - blocking, self-caught before commit] Newton mentioned in a doc comment tripped the plan's own acceptance grep**
- **Found during:** Task 2, running the acceptance-criteria greps before committing
- **Issue:** `grep -c 'Newton' src/metrics/irr.ts` must be 0 per the plan's acceptance criteria; the header comment explaining why bisection was chosen over Newton contained the literal word.
- **Fix:** Reworded the comment to convey the same rationale without the literal string.
- **Files modified:** `src/metrics/irr.ts`
- **Verification:** `grep -c 'Newton' src/metrics/irr.ts` returns 0.
- **Committed in:** `778ff1b`

---

**Total deviations:** 2 (1 documented test-direction correction, 1 self-caught wording fix)
**Impact on plan:** No scope creep; both stayed inside the files the plan already named. The implementation itself follows D-08's bisection specification exactly.

## Issues Encountered

None beyond the two deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `updateBacktestRequest` is the one write path 04-04/04-05's parameter controls should call.
- `DerivedMetrics` is computed once per run and available via `currentDerivedMetrics()` for any future component (e.g. the permalink encoder in 04-06/04-07) that needs IRR/CAGR/the final multiple/ruin date without recomputing.
- `KernelResult.maxDrawdown` is available to Phase 7's sweep worker from the same `runBacktest` call, per F-01/Pattern 3's rationale -- no second pass needed at 10,000-cell scale.
- No blockers carried forward from this plan.

## Self-Check: PASSED

All 16 claimed files verified present on disk; all 4 claimed commit hashes (`c2a4459`, `778ff1b`, `9c2739c`, `318c1c0`) verified present in `git log --all`.

---
*Phase: 04-first-defensible-backtest-in-the-browser*
*Completed: 2026-08-19*
