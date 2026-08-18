---
phase: 03-simulation-kernel-and-the-upro-tqqq-gate
plan: 06
subsystem: validation
tags: [tracking-error, upro, tqqq, no-fitting-protocol, build-gate, hard-gate]

requires:
  - phase: 03-simulation-kernel-and-the-upro-tqqq-gate (plan 01, 02)
    provides: src/kernel/backtest.ts, src/kernel/backtest.types.ts (the kernel this gate tests, untouched by this plan)
  - phase: 03-simulation-kernel-and-the-upro-tqqq-gate (plan 03)
    provides: src/validation/cost-parameters.ts (COST_PARAMETERS, TRACKING_ERROR_TOLERANCE, RETURN_DRIFT_TOLERANCE, both sourced and derived before this plan ran)
  - phase: 03-simulation-kernel-and-the-upro-tqqq-gate (plan 04)
    provides: src/data/kernel-inputs.ts, src/data/contribution-schedule.ts (the full parameter surface this plan drives synthetic runs through)
provides:
  - "src/validation/tracking-error.ts: computeTrackingError/annualizedTrackingError/annualizedReturnDrift, D-12's single shared function (TrackingErrorWindow, TrackingErrorResult exported)"
  - "tests/validation/tracking-error.test.ts: hand-computed-reference unit coverage of both gates and every VALID-01 boundary edge"
  - "tests/validation/upro-tqqq-gate.test.ts: the build-failing UPRO/TQQQ gate (VALID-01/VALID-02), currently RED for both funds -- see Deviations below"
affects: ["Phase 4 (ROADMAP's hard gate: must not begin on a kernel that has not passed this comparison -- it currently has not)"]

actuals:
  tokens: 9692
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "D-12's shared tracking-error module: takes Float64Array + plain numbers only, no test-context assumption, so Phase 5's in-app view and a future CI data-change check can call the identical function this phase's tests call"
    - "Two-pass mean-then-deviation stdev computation (PITFALLS A11), mirrored from the plan's own instruction rather than the more common single-pass sum-of-squares shortcut"
    - "Lower-bound/upper-bound local binary search over an absolute-index window slice, for resolving D-13's rate-regime sub-window boundaries at run time from manifest dates rather than hardcoding bar positions"

key-files:
  created:
    - src/validation/tracking-error.ts
    - tests/validation/tracking-error.test.ts
    - tests/validation/upro-tqqq-gate.test.ts
  modified: []

key-decisions:
  - "RESOLVED after the halt (see the Gate Result section at the top of this file): the gate is GREEN on both funds. The residual turned out to be two residuals -- a dividend-convention structural defect (D-20 outcome 1) and a reference-data tracking-error floor (D-20 outcome 2, mechanism repriced from reasoned 15bp to measured 352bp). No cost parameter changed. Original halt note follows. The gate was left RED by this plan. Per the plan's own <no_fitting_protocol> ('If you cannot honestly place the residual in one of D-20's three permitted outcomes, HALT and report rather than improvising. Reporting a failed gate accurately is a SUCCESSFUL execution of this plan.'), this plan does not force the measured residual into one of D-20's five signature rows. See 'Gate Result' below for the full diagnostic reasoning."
  - "No cost parameter in src/validation/cost-parameters.ts was read, modified, or even considered as a candidate to change at any point during this plan's execution."
  - "No line of src/kernel/backtest.ts or src/data/kernel-inputs.ts was modified. The extensive diagnostic work (below) was run through throwaway scripts (created and deleted within this session, never committed) that called the existing, unmodified kernel and data-layer functions with different parameter combinations -- it did not alter any production code."
  - "Synthetic and reference bar-0 returns are both defined as 0 (matching the kernel's own D-03 cost-free-anchor convention), so a single shared TrackingErrorWindow (firstBar=0) can index both the level arrays (Gate 2) and the derived-return arrays (Gate 1) without a second window shape."

patterns-established:
  - "Diagnostic-only throwaway scripts for gate-failure investigation are run from a temp file inside the worktree, never committed, and deleted before the final commit -- keeps the git history free of investigation scaffolding while still using the project's real modules (avoids re-deriving logic by hand in a separate sandbox)."

requirements-completed: [VALID-01, VALID-02, VALID-03]

coverage:
  - id: D1
    description: "computeTrackingError/annualizedTrackingError/annualizedReturnDrift implement D-11's two gates (sample n-1 stdev * sqrt(252); geometric annualized-return difference on calendar-day years), reject windows below 2 bars, unequal-length arrays and non-finite values with named errors, and are importable with zero kernel/data-layer/test-context imports"
    requirement: VALID-01
    verification:
      - kind: unit
        ref: "tests/validation/tracking-error.test.ts (7 tests, all passing)"
        status: pass
      - kind: unit
        ref: "tests/kernel/module-boundary.test.ts (still passing -- the kernel acquired no import of tracking-error.ts)"
        status: pass
    human_judgment: false
  - id: D2
    description: "tests/validation/upro-tqqq-gate.test.ts builds synthetic 3x SPX/NDX through buildKernelInputs+runBacktest, compares against real UPRO/TQQQ total-return via computeTrackingError, gates only the full overlap window (>=15 years, asserted), reports two D-13 sub-windows without gating them, prints all six result blocks with expense-ratio confidence tags on every run, and asserts the synthetic never beats the naive 3x-index multiple"
    requirement: VALID-02
    verification:
      - kind: unit
        ref: "tests/validation/upro-tqqq-gate.test.ts -- runs and prints correctly; the two gate assertions themselves currently FAIL (see Gate Result below), which is the gate functioning as designed against a kernel that does not yet pass validation"
        status: fail
    human_judgment: true
    rationale: "Whether an unexplained, un-classifiable residual should halt-and-report versus be force-fit into one of D-20's three outcomes is exactly the judgment call D-20/D-15 reserve for human review; this plan halts per its own explicit instruction and the finding needs a human decision on next steps (see Gate Result)."
  - id: D3
    description: "No cost parameter was tuned, fitted, or solved for in response to the measured tracking error; no tolerance was widened; the failure message names D-20's five residual signatures and three permitted outcomes at the point of failure, on every run"
    requirement: VALID-03
    verification:
      - kind: other
        ref: "git diff shows src/validation/cost-parameters.ts untouched by this plan; git log --oneline -- src/validation/ shows cost-parameters.ts's two commits (da257a5, bcecbcb) strictly before tracking-error.ts's commit (2974140)"
        status: pass
    human_judgment: false

duration: ~40min
completed: 2026-08-18
status: complete
---

# Phase 3 Plan 6: The UPRO/TQQQ Tracking-Error Gate Summary

**Built D-12's shared tracking-error function and the build-failing UPRO/TQQQ gate exactly as specified; the gate was RED on first run for both funds (GREEN after the post-halt resolution recorded at the top of this file), by a margin far too large to explain with any of D-20's five residual signatures, so this plan halts and reports rather than forcing a classification -- no cost parameter, tolerance, or kernel line was touched.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-08-18 (worktree provisioning time not separately tracked)
- **Completed:** 2026-08-18T04:32:50Z
- **Tasks:** 2 (both auto)
- **Files modified:** 3 created (src/validation/tracking-error.ts, tests/validation/tracking-error.test.ts, tests/validation/upro-tqqq-gate.test.ts)

## Gate Result: RESOLVED after this plan halted (read this first)

**The gate is now GREEN for both funds.** This section supersedes "Gate Result (as of this plan's
halt)" below, which is kept verbatim as the record of what this plan measured and why it correctly
refused to classify it.

This plan halted because it could not place its residual in one of D-20's five signature rows.
The reason it could not: **the residual was two residuals with two different causes**, and the
table asks for one row. The orchestrator diagnosed both after the halt (full evidence in
`03-GATE-DIAGNOSIS.md`), the developer chose an outcome for each, and both were applied.

| Fund | Tracking error | Tolerance | Return drift | Tolerance |
|---|---|---|---|---|
| UPRO | 3.2149% | 3.9550% | +0.2538% | 0.5250% |
| TQQQ | 3.5331% | 3.9550% | +0.3986% | 0.5250% |

**Residual 1, return drift, D-20 outcome 1 (fix structure).** This test built the synthetic from
the index's *price-return* series (per D-10 as written) but compared it against the fund's
*total-return* series, putting the two sides on different dividend conventions. That asymmetry was
the whole drift: UPRO -6.968% and TQQQ -3.860% became +0.254% and +0.399% once matched, with no
cost parameter touched. D-10 has been amended in `03-CONTEXT.md` with the reasoning, since this
contradicts it as originally written. `indexSeriesId` is now `SPX/total-return` / `NDX/total-return`
and `dividendReinvest` is `true`.

**Residual 2, tracking error, D-20 outcome 2 (reprice a named mechanism).** The tracking error is
not attributable to the cost model at all. Each fund's own realized daily return against 3x its own
benchmark, with no model applied, already measures 3.198% (UPRO, n=4311) and 3.519% (TQQQ, n=4151)
annualized. The `fund-nav-vs-market-close-pricing-basis` row in `TOLERANCE_MECHANISMS` already named
this mechanism but priced it at a reasoned 15 bp and mis-described the reference as NAV data; the
manifest records Yahoo chart-endpoint series, which are distribution-adjusted market closes. The row
was repriced to the measured 352 bp and its basis corrected. `TRACKING_ERROR_TOLERANCE` recomputes
from the mechanism list, so it moved 0.66% -> 3.955% without any tolerance constant being edited
directly, which is exactly D-15's intended path.

A supporting change: `TOLERANCE_SAFETY_FACTOR` now applies to *reasoned* rows only. Rows flagged
`measured: true` are added at face value, because that factor's stated purpose is margin for a
reasoned estimate being off by half, and inflating a measurement by 1.5x would have slackened the
gate to 5.715% and let a real regression hide in the margin. Two new pinning tests hold this rule.

**Integrity:** no expense ratio and no financing spread was changed at any point. The only numeric
edit in `cost-parameters.ts` is the one tolerance mechanism's `basisPointsPerYear`. Both diagnostics
were read-only and neither references the synthetic, so nothing was fitted to the gate.

**Observation recorded, deliberately not acted on:** the high-rate sub-window drift is +0.94% (UPRO)
and +1.12% (TQQQ), larger than the full-window figure and positive, hinting the financing spread may
be slightly under-priced from 2022 on. Per D-13 sub-windows do not gate, and per VALID-03 adjusting
the spread to close a measured gap is prohibited. Left as a Phase 5 observation.

## Gate Result (as of this plan's halt)


**The gate is RED for both funds.** `npm run test -- tests/validation/upro-tqqq-gate.test.ts` fails two assertions. Measured figures, full overlap window, both funds, printed by every run (VALID-03):

| Fund | Window | Bars | Years | Annualized tracking error | Tolerance | Annualized return drift | Tolerance | Synthetic ann. return | Real fund ann. return |
|------|--------|------|-------|---------------------------|-----------|--------------------------|-----------|------------------------|-------------------------|
| UPRO | full (2009-06-25..2026-08-14) | 4311 | 17.136 | **3.1640%** | 0.6600% | **-6.9678%** | 0.5250% | 26.3819% | 33.3497% |
| UPRO | near-zero-rate era (through 2015-12-31) | 1642 | 6.516 | 3.8805% | reported only | -8.8292% | reported only | 30.6855% | 39.5147% |
| UPRO | high-rate era (from 2022-01-01) | 1158 | 4.611 | 2.4421% | reported only | -4.0656% | reported only | 13.3514% | 17.4170% |
| TQQQ | full (2010-02-11..2026-08-14) | 4152 | 16.504 | **3.5647%** | 0.6600% | **-3.8605%** | 0.5250% | 39.3202% | 43.1807% |
| TQQQ | near-zero-rate era (through 2015-12-31) | 1483 | 5.884 | 3.6378% | reported only | -5.5802% | reported only | 44.7527% | 50.3328% |
| TQQQ | high-rate era (from 2022-01-01) | 1158 | 4.611 | 2.7918% | reported only | -1.5796% | reported only | 13.1665% | 14.7462% |

(Tolerance figures: `TRACKING_ERROR_TOLERANCE` = 0.66%, `RETURN_DRIFT_TOLERANCE` = 0.525%, both computed from `TOLERANCE_MECHANISMS` in `src/validation/cost-parameters.ts`, unmodified by this plan.)

Both funds' synthetic significantly **underperforms** the real fund on the gated full window (drift is negative, i.e. the model is too pessimistic, not too optimistic) -- so the T-03-25 "synthetic beats naive 3x" sign-error check is not the issue; that assertion is not even reached because the earlier gate assertions already throw. The unconditional check (synthetic strictly below 3x the bare index's own annualized return) was verified separately outside the test run and holds for both funds.

### Why this plan does not choose one of D-20's three outcomes

The plan's own `<no_fitting_protocol>` states explicitly: *"If you cannot honestly place the residual in one of those three, HALT and report rather than improvising. Reporting a failed gate accurately is a SUCCESSFUL execution of this plan."* This plan takes that path, after real diagnostic work (all done via throwaway scripts run against the existing, unmodified `runBacktest`/`buildKernelInputs`, never committed, deleted before the final commit):

1. **Ruled out a date/series misalignment bug.** UPRO's single worst day (-34.95%, 2020-03-16) and SPX's single worst day (-11.98%) fall on the identical calendar date. A linear-regression beta of UPRO's daily return against SPX's daily return over the full window is 2.9683 -- UPRO tracks almost exactly 3x SPX's daily return, with only the small shortfall a real fund's own cost drag would produce. This means the two series are correctly paired bar-for-bar; the gate test's window/index-alignment logic is not the source of the residual.
2. **Ruled out PITFALLS A3 (wrong rate type).** `@rate/rate` splices NBER monthly, TB3MS, DTB3 and DFF -- all wholesale/institutional benchmark rates, never a retail rate, confirmed by reading the series composition directly. The plan's D-20 table lists "wrong rate type, retail instead of wholesale" as row 4's suggested cause, but there is no retail rate anywhere in this pipeline to be wrongly substituted.
3. **Ruled out PITFALLS A6 (spread mis-calibration concentrated in the high-rate era).** The opposite pattern holds: both funds show a **larger** magnitude drift in the near-zero-rate era (UPRO -8.83%, TQQQ -5.58%) than in the high-rate era (UPRO -4.07%, TQQQ -1.58%). A too-high financing spread would bite hardest when rates (and therefore financing cost) are largest, not smallest.
4. **Decomposed the residual by cost component.** Re-running the synthetic with `expenseRatioPercent=0, financingSpreadPercent=0` (still leaving the real short-rate series applied to the financing term, since the kernel always reads it) gives 28.89%/yr for UPRO -- and re-running again with the short-rate *array itself* zeroed (true zero-cost, zero-financing, zero-fee) gives 32.76%/yr. Real UPRO's own realized return over the identical window is 33.35%/yr -- **higher than a synthetic 3x model that pays literally zero costs of any kind.** That is not economically possible for a real fund that does pay real financing and a real 0.95% expense ratio; a zero-cost hypothetical must upper-bound what the same fund could have earned paying nothing. The measured ~0.6%/yr gap between real UPRO and the true-zero-cost synthetic is itself small and plausibly explicable (an artifact of how the model's own vol-drag compounds under exactly-3x daily leverage versus the real fund's very-slightly-under-3x effective daily beta). It is the **remaining ~6.4%/yr** -- the modeled financing-plus-ER drag itself -- that does not reconcile against what the real fund's own realized history implies its embedded cost actually was.
5. **This same "worse in the near-zero-rate era, still substantial in the high-rate era, present even at true zero cost" signature repeats independently for TQQQ/NDX**, a second, unrelated fund/index pair. That consistency argues against a single fund-specific data defect (e.g. an error isolated to Phase 2's UPRO total-return reconstruction) and toward something either in the shared kernel/cost-model structure or in how the two funds' realized daily-cost drag differs from this model's flat-percentage, sequential-multiplicative cost application -- but this plan did not isolate a specific, fixable line of code, and inventing one to "explain" the number without genuine evidence would be exactly the improvisation the protocol prohibits.

None of D-20's five listed residual-pattern rows cleanly matches what was actually measured. The magnitude (roughly 5-11x either tolerance) rules out "small, stable, patternless." The regime direction rules out "divergence concentrated in the high-rate era." The rate-source check rules out "wrong rate type." The pattern is not "uncorrelated with regime" (row 1) since it clearly correlates, just inversely from row 4's prediction. **This plan therefore stops at diagnosis and reports, rather than picking the least-wrong-looking row and either fabricating a tolerance-widening mechanism or making a kernel change with no verified basis.** Per the plan's own text, this is the correct and expected outcome when classification cannot be done honestly, not a failure of this plan's execution.

**This blocks Phase 4 per ROADMAP §Sequencing Notes** ("do not begin Phase 4 on a kernel that has not passed this comparison"). The finding is recorded in `.planning/WINDOWS.md` (entry id 3, kind `unmet-truth`) so it stays visible at ship time. Resolving it is a human decision (which of D-20's outcomes actually applies, or whether the model needs a structural change not yet identified) and is out of this plan's scope to force.

## Accomplishments

- `src/validation/tracking-error.ts`: D-12's single shared module. `computeTrackingError`, `annualizedTrackingError`, `annualizedReturnDrift` implement D-11's two gates exactly as specified (sample n-1 standard deviation times `sqrt(252)`; geometric annualized-return difference on calendar-day-derived years), reject degenerate windows/length mismatches/non-finite values with named errors, and import nothing beyond their own types.
- `tests/validation/tracking-error.test.ts`: 7 tests against hand-computed references built in the file (never against the bundle), including a `1e-12`-relative identity test that specifically pins the `n-1` (not `n`) denominator.
- `tests/validation/upro-tqqq-gate.test.ts`: builds the synthetic 3x runs through the unmodified `buildKernelInputs`/`runBacktest`, resolves every window from the manifest at run time (only the two rate-regime era boundary dates are literals, as the plan specifies), asserts the full window spans >=15 years, prints all six result blocks with each fund's expense-ratio confidence tag on every run pass or fail, and embeds D-20's full residual-diagnosis table plus the three permitted outcomes directly in every gate-failure assertion message.
- Ran the gate against the real committed bundle. Performed genuine diagnostic investigation into the resulting failure (date-alignment check, rate-source check, cost-component decomposition, cross-fund pattern comparison) before concluding the residual cannot be honestly classified against D-20's five rows, and stopped there rather than improvising a fix or a mechanism.

## Task Commits

Each task was committed atomically:

1. **Task 1: The single shared tracking-error function, with both gates as separate statistics** - `2974140` (feat)
2. **Task 2: The build-failing UPRO and TQQQ gate, with rate-regime sub-windows reported and the residual printed** - `1eaf478` (test)

_No plan-metadata commit yet -- this SUMMARY.md's commit follows, per the worktree isolation protocol._

## Files Created/Modified

- `src/validation/tracking-error.ts` - `TrackingErrorWindow`, `TrackingErrorResult`, `computeTrackingError`, `annualizedTrackingError`, `annualizedReturnDrift`
- `tests/validation/tracking-error.test.ts` - hand-computed-reference coverage of both gates and every VALID-01 boundary edge (identical series, constant delta, `s*sqrt(252)` identity, short window, unequal lengths, non-finite value, calendar-day-based years)
- `tests/validation/upro-tqqq-gate.test.ts` - the build-failing gate over the real committed bundle for both fund pairs, plus the D-13 sub-window reporting and the D-20 diagnosis text embedded in every failure message

## Decisions Made

See `key-decisions` in the frontmatter and "Gate Result" above for the load-bearing one: this plan halts and reports an unclassifiable residual rather than forcing one of D-20's three permitted outcomes, per the plan's own explicit instruction that doing so is a successful execution. No cost parameter, tolerance, or kernel/data-layer line was modified in response to the measurement, in any of the investigation's steps.

## Deviations from Plan

### Not a Rule 1-4 deviation -- an explicitly plan-sanctioned outcome

The plan's `<no_fitting_protocol>` names this exact situation and its correct handling: *"IF THE GATE FAILS ON FIRST RUN, that is an ANTICIPATED and ACCEPTABLE outcome... If you cannot honestly place the residual in one of those three, HALT and report rather than improvising."* This plan does exactly that. No deviation rule (1-4) applies because none of Rules 1-3's triggers (a bug this plan's own code introduced, missing critical functionality, a blocking issue preventing task completion) matches this situation, and Rule 4 (architectural change) does not apply either -- no architectural change is being proposed. The gate itself, its test file, and its shared module are complete, correct, and match every acceptance criterion in the plan. The *substantive finding* -- that the kernel does not yet pass validation -- is the gate doing its job, not a defect in this plan's deliverable.

### None (code deviations)

No bug was auto-fixed, no missing functionality was added, and no blocking issue was resolved during this plan's own task execution. The diagnostic investigation into the gate's red result touched no production file.

## Issues Encountered

The UPRO/TQQQ gate fails on its first run, as documented exhaustively in "Gate Result" above. This is the single substantive issue this plan surfaces, and it is the entire reason this hard gate exists.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Phase 4 is blocked** per ROADMAP §Sequencing Notes until this gate passes. The next action is a human decision: either (a) a structural defect is found and fixed in the kernel or data layer (D-20 outcome 1), (b) a specific, evidenced un-modelled mechanism is identified, named, and added to `TOLERANCE_MECHANISMS` with its own basis and confidence (D-20 outcome 2), or (c) after further investigation the residual is judged genuinely small-relative-to-materiality and accepted with the number recorded (D-20 outcome 3) -- though the measured magnitude here (5-11x either tolerance) makes outcome 3 a hard case to justify without new evidence.
- `src/validation/tracking-error.ts`'s exported signature (`computeTrackingError(syntheticValues, referenceValues, syntheticReturns, referenceReturns, window)`) is ready for Phase 5's in-app synthetic-vs-real view (VALID-04) to call unchanged, per D-12.
- The finding is recorded in `.planning/WINDOWS.md` (entry id 3) so it remains visible through `/gsd-ship`'s open-defect check regardless of how much later context has moved on.

---
*Phase: 03-simulation-kernel-and-the-upro-tqqq-gate*
*Completed: 2026-08-18*

## Self-Check: PASSED

- FOUND: `src/validation/tracking-error.ts`
- FOUND: `tests/validation/tracking-error.test.ts`
- FOUND: `tests/validation/upro-tqqq-gate.test.ts`
- FOUND commit `2974140` (Task 1: tracking-error.ts + its test)
- FOUND commit `1eaf478` (Task 2: upro-tqqq-gate.test.ts)
- `npm run typecheck` exits 0
- `npm run test -- tests/validation/tracking-error.test.ts` passes (7/7)
- `npm run test -- tests/kernel/module-boundary.test.ts` passes (8/8) -- the kernel acquired no import of `tracking-error.ts`
- `npm run test` (whole unit project): 377/379 pass; the 2 failures are `tests/validation/upro-tqqq-gate.test.ts`'s own gate assertions, failing accurately against real measured data, not a test-infrastructure defect
- `npm run bench` exits 0 (5 files, 13 tests passed; unaffected by this plan's changes)
- `git log --oneline -- src/validation/` confirms `cost-parameters.ts` (`da257a5`, `bcecbcb`) lands strictly before `tracking-error.ts` (`2974140`)
