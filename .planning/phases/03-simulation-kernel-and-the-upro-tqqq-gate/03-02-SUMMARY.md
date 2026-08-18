---
phase: 03-simulation-kernel-and-the-upro-tqqq-gate
plan: 02
subsystem: testing
tags: [vitest, fast-check, typescript, float64array, financial-modeling]

requires:
  - phase: 03-01
    provides: runBacktest kernel, the KernelSeries/KernelParams/KernelOutputs/KernelResult contracts, and the loadBundleFromDisk/buildKernelInputs data-layer seam
provides:
  - PITFALLS.md section A as executable unit tests (A1, A2, A4, A8, A10, A11) plus D-03, D-05, D-07, D-08
  - PITFALLS A7's ruin semantics (clamp, flag, absorbing state, dropped contributions) as unit tests
  - D-04's long-gap flag proven against a fixed gap ladder and against the real committed SPX bundle
  - SIM-12's twelve-entry A1-A12 disposition table, asserted complete
  - tests/kernel/fixtures.ts, the shared makeKernelSeries/baseKernelParams/makeOutputs builders every later plan 03 test file reuses
affects: [03-03, 03-04, 03-05, 03-06]

actuals:
  tokens: 7623
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "fast-check property tests live alongside table-driven fixed cases in the same describe blocks, not segregated into a separate property-test file"
    - "Every describe block name carries the PITFALLS row id it covers, so a failing assertion names the pitfall directly in the test report, not just a generic test description"

key-files:
  created:
    - tests/kernel/fixtures.ts
    - tests/kernel/pitfalls-a.test.ts
    - tests/kernel/ruin.test.ts
  modified: []

key-decisions:
  - "A4's cross-bar-count expense-drag tolerance set to 1e-4 relative, not the plan-suggested 1e-12: a 249-bar and a 252-bar year compounding the identical 365 calendar days into a different number of discrete multiplicative steps produces a genuine O(expenseRatio^2) convexity difference between the two, analytically on the order of 1e-6 relative at a realistic 0.9% ER -- three orders of magnitude above 1e-12, so 1e-12 cannot pass on correct arithmetic. 1e-4 stays four orders of magnitude below PITFALLS A4's own named real-bug signature (a ~0.3-0.5%/year drift) while comfortably clearing the expected convexity noise, the same reasoning style D-06 already used for the 1e-9 SIM-04 bound."

patterns-established:
  - "PITFALLS-row disposition table: A1 through A12 each map to either a covered-by test name or a non-empty disposition reason, and the table is asserted to have exactly twelve entries so an added or renamed pitfall row fails the build instead of silently falling off the checklist"

requirements-completed: [SIM-01, SIM-02, SIM-03, SIM-04, SIM-05, SIM-12]

coverage:
  - id: D1
    description: "PITFALLS A1 (leverage on the daily return, never the cumulative period return) as a unit test"
    requirement: SIM-02
    verification:
      - kind: unit
        ref: "tests/kernel/pitfalls-a.test.ts#PITFALLS A1: leverage applied to the daily return, never the cumulative period return > a symmetric up-then-down window shows the leveraged run losing more than the naive L*totalReturn formula predicts (volatility drag)"
        status: pass
    human_judgment: false
  - id: D2
    description: "PITFALLS A2 (financing accrues on the borrowed (leverage-1) portion) as a unit test, including linear scaling with (leverage-1)"
    requirement: SIM-03
    verification:
      - kind: unit
        ref: "tests/kernel/pitfalls-a.test.ts#PITFALLS A2: financing cost accrues on the borrowed (leverage - 1) portion, not the whole position > the financing gap between a rated and an unrated run scales linearly with (leverage - 1)"
        status: pass
    human_judgment: false
  - id: D3
    description: "PITFALLS A4 (expense ratio day-count convention) proven invariant to whether a calendar year carries 249 or 252 trading bars"
    requirement: SIM-03
    verification:
      - kind: unit
        ref: "tests/kernel/pitfalls-a.test.ts#PITFALLS A4: the expense ratio accrues on a calendar-day basis, invariant to trading-bar count > a 249-bar year and a 252-bar year, both with calendarDaysElapsed summing to 365, charge nearly identical total expense drag, both tracking the theoretical daily-compounded annual figure"
        status: pass
    human_judgment: false
  - id: D4
    description: "PITFALLS A8 (calendar-day, not flat trading-day, financing accrual), including the real 1933 12-day closure's exact ratio"
    requirement: SIM-03
    verification:
      - kind: unit
        ref: "tests/kernel/pitfalls-a.test.ts#PITFALLS A8: financing accrues on calendar days elapsed, not a flat per-trading-day fraction > a 3-calendar-day gap costs exactly 3x a 1-calendar-day gap, and a 12-day gap costs exactly 12x"
        status: pass
    human_judgment: false
  - id: D5
    description: "PITFALLS A10 / SIM-04's 1x-exactness invariant against the real committed SPX bundle within D-06's 1e-9 relative bound"
    requirement: SIM-04
    verification:
      - kind: unit
        ref: "tests/kernel/pitfalls-a.test.ts#PITFALLS A10 / SIM-04: 1x reproduces the unlevered bundled series exactly (D-06, D-07) > leverage 1, expense ratio 0, financing spread 0 reproduces the direct compounded return series within 1e-9 relative deviation on every bar"
        status: pass
    human_judgment: false
  - id: D6
    description: "PITFALLS A11 (float64 compounding drift) checked against a direct level[last]/level[first] ratio on the real bundle"
    requirement: SIM-04
    verification:
      - kind: unit
        ref: "tests/kernel/pitfalls-a.test.ts#PITFALLS A11: the same 1x run tracks a direct level[last] / level[first] ratio within the same bound > outValue at the last bar divided by initialInvestment matches the raw price level ratio within 1e-9 relative deviation"
        status: pass
    human_judgment: false
  - id: D7
    description: "PITFALLS A7 ruin boundary: exact-zero clamp, categorical flag, absorbing state, non-negative under extreme leverage, and dropped-contribution accounting"
    requirement: SIM-05
    verification:
      - kind: unit
        ref: "tests/kernel/ruin.test.ts#PITFALLS A7: the ruin boundary is clamped, flagged and absorbing > contributions applied before the ruin bar count toward totalContributed; contributions flagged at or after the ruin bar are dropped and reported in droppedContributionsTotal"
        status: pass
      - kind: unit
        ref: "tests/kernel/ruin.test.ts#PITFALLS A7: the ruin boundary is clamped, flagged and absorbing > a -90% bar at leverage 20 still writes exactly 0, never a negative number, on the ruin bar and every bar after it"
        status: pass
    human_judgment: false
  - id: D8
    description: "D-04's long-gap flag fires exactly on the two real multi-day closures (the 1933 bank holiday and the 2001 closure) and nowhere else"
    requirement: SIM-05
    verification:
      - kind: unit
        ref: "tests/kernel/ruin.test.ts#D-04: the long-gap flag fires exactly on bars whose calendarDaysElapsed is at or above LONG_GAP_FLAG_MIN_DAYS > over the real committed bundle across the full SPX window, longGapBarCount is exactly 2, corresponding to the 1933 bank holiday and the 2001 closure"
        status: pass
    human_judgment: false
  - id: D9
    description: "SIM-12's twelve-entry PITFALLS A1-A12 disposition table, asserted complete"
    requirement: SIM-12
    verification:
      - kind: unit
        ref: "tests/kernel/ruin.test.ts#SIM-12: the PITFALLS section A checklist has an entry for every row > the checklist table has exactly twelve entries, one for each of A1 through A12"
        status: pass
    human_judgment: false

duration: 13min
completed: 2026-08-18
status: complete
---

# Phase 03 Plan 02: PITFALLS Correctness Checklist Summary

**PITFALLS.md section A turned into 20 passing unit tests against the real kernel and the committed SPX bundle, plus a twelve-entry disposition table closing out SIM-12.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-08-18T03:37:53Z (prior plan's HEAD)
- **Completed:** 2026-08-18T03:51:00Z
- **Tasks:** 2
- **Files modified:** 3 (all new)

## Accomplishments

- `tests/kernel/pitfalls-a.test.ts` covers A1 (leverage on daily, not cumulative, return), A2 (financing on the borrowed portion, linear in `leverage - 1`), A4 (expense ratio invariant to 249 vs. 252 trading bars), A8 (calendar-day financing accrual, including the real 1933 12-day gap), A10/SIM-04 (1x exactness against the real bundle within 1e-9 relative), and A11 (float64 compounding drift bounded the same way), plus D-03, D-05 (fast-check leverage-continuity property), D-07 and D-08.
- `tests/kernel/ruin.test.ts` covers A7's full ruin contract (exact-zero clamp, categorical flag and `ruinBarIndex`, absorbing state under +50%/+100%/-90% follow-on returns, non-negative even at leverage 20, and dropped-contribution accounting split across before/at/after the ruin bar) and D-04's long-gap flag, proven both on a fixed gap ladder and against the real committed bundle where `longGapBarCount` resolves to exactly the 1933 bank holiday and the 2001 closure.
- The SIM-12 checklist table maps every one of A1-A12 to either a covered-by test name or a disposition object with a non-empty reason (A3, A5, A6, A9, A12), and asserts the table stays at exactly twelve entries, so a future edit to PITFALLS.md's row set fails this test rather than silently going unnoticed.
- `tests/kernel/fixtures.ts` gives every later plan-03 test file the same three builders (`makeKernelSeries`, `baseKernelParams`, `makeOutputs`) rather than each file redeclaring its own.

## Task Commits

Each task was committed atomically:

1. **Task 1: PITFALLS A1, A2, A4, A8, A10 and A11 as unit tests, including the 1x exactness invariant** - `d2dbdd3` (test)
2. **Task 2: PITFALLS A7 ruin semantics, the D-04 long-gap flag, and an asserted disposition for every remaining A-row** - `c907ac7` (test)

## Files Created/Modified

- `tests/kernel/fixtures.ts` - `makeKernelSeries`/`baseKernelParams`/`makeOutputs` builders for hand-built kernel inputs, shared across `pitfalls-a.test.ts` and `ruin.test.ts`
- `tests/kernel/pitfalls-a.test.ts` - A1, A2, A4, A8, A10, A11, D-03, D-05, D-07, D-08 as behavioral assertions against `runBacktest`
- `tests/kernel/ruin.test.ts` - A7's ruin contract, D-04's long-gap flag, and the SIM-12 disposition table

## Decisions Made

See `key-decisions` in the frontmatter. The load-bearing one is the A4 tolerance: the plan's suggested 1e-12 relative figure for comparing a 249-bar year's total expense drag against a 252-bar year's is mathematically unreachable for any genuinely different bar-count partition of the same 365 calendar days -- it is a real second-order (convexity) effect of the compounding itself, not a bug, and forcing the assertion to 1e-12 would either make the test flaky or force a structural change to correct, already-correct code. 1e-4 relative was derived analytically (documented inline in the test) to sit four orders of magnitude below PITFALLS A4's own named real-bug signature while still comfortably clearing the true ~1e-6 convexity noise.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/spec-precision] A4's expense-drag cross-comparison tolerance corrected from the plan's suggested 1e-12 relative to an analytically-derived 1e-4 relative**

- **Found during:** Task 1, while implementing the A4 test
- **Issue:** The plan's `<action>` text suggested asserting a 249-bar-year vs. 252-bar-year expense drag comparison "to within 1e-12 relative." Working the math (both years compound the same 365 total calendar days into a different number of discrete multiplicative steps, so their products differ by a genuine `O(expenseRatio^2)` convexity term) shows this is on the order of 1e-6 to 1e-9 relative for any realistic expense ratio -- three to six orders of magnitude above 1e-12. Asserting 1e-12 literally would either fail on entirely correct arithmetic or require choosing an unrealistically tiny expense ratio that itself runs into floating-point cancellation noise at a comparable scale, defeating the purpose of the tolerance.
- **Fix:** Derived and documented (inline comment in the test, mirroring D-06's own style) a 1e-4 relative tolerance: four orders of magnitude below PITFALLS A4's own stated real-bug signature (a ~0.3-0.5%/year drift from a genuine day-count bug), comfortably above the true ~1e-6 convexity noise the correct kernel produces.
- **Files modified:** `tests/kernel/pitfalls-a.test.ts`
- **Verification:** `npm run test -- tests/kernel/pitfalls-a.test.ts` passes; the same test would fail if the kernel used a flat `/252` divisor instead of the calendar-day basis (that error is roughly three orders of magnitude larger than the 1e-4 tolerance).
- **Committed in:** `d2dbdd3` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 spec-precision correction)
**Impact on plan:** No change to what is tested or to kernel code (untouched, as required). The tolerance figure in one assertion was corrected to a mathematically achievable, still-tight value; the underlying invariant (day-count invariance of the expense accrual) is proven exactly as the plan intended.

## Issues Encountered

None. `src/` was not touched, matching the plan's own verification requirement that the kernel is under test, not under edit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SIM-12 is closed: every PITFALLS section A row is either a named passing test or an asserted, non-empty disposition, and the disposition table's key/count assertion means a future edit to PITFALLS.md's row set is a build-visible failure, not a silent gap.
- `tests/kernel/fixtures.ts` is now the shared builder module for plan 03 test files; later plans in this phase (03-04, 03-05, 03-06) can import `makeKernelSeries`/`baseKernelParams`/`makeOutputs` directly rather than redeclaring them.
- Plan 03-03 (running in parallel) creates `src/validation/cost-parameters.ts`; this plan does not read or depend on anything under `src/validation/`, preserving that plan's one-way commit-ordering requirement.
- Open item carried forward from 03-01: `bench/kernel.ts` remains the PERF-02/PERF-03 workload; plan 03-05 owns swapping PERF-02 onto `src/kernel/backtest.ts`.

---
*Phase: 03-simulation-kernel-and-the-upro-tqqq-gate*
*Completed: 2026-08-18*

## Self-Check: PASSED

All created files found on disk (`tests/kernel/fixtures.ts`, `tests/kernel/pitfalls-a.test.ts`, `tests/kernel/ruin.test.ts`, this SUMMARY). Both task commits (`d2dbdd3`, `c907ac7`) found in `git log --oneline --all`.
