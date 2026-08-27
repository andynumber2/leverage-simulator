---
schema_version: 1
open_count: 0
waived_count: 4
fixed_count: 4
total_count: 8
last_updated: 2026-08-27T00:27:15.922Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | quick-260816-p8z | unrun-verify | bench/report.ts |  | Task 3's live end-to-end proof (npm run bench, .bench/bench-results.json score coherence) could not be run: Playwright chromium requires system libs (libnspr4/libnss3/etc) absent in this sandbox, install needs sudo. Coherence-check logic is covered by unit tests in tests/report.test.ts instead. | fixed |  | 2026-08-16T18:22:38.854Z | 2026-08-16T23:38:38.818Z |
| 2 | quick-260816-qae | unmet-truth | bench/calibration.ts |  | Calibration under-corrects for CI runner speed variance, the thing normalize() exists to absorb. Across three D-17 baseline runs (31963076671, 31965951474, 31980066804) the raw PERF-03 sweep spanned 653.1ms to 856.4ms, a 31% spread; after dividing by calibrationScore the normalized figures still read 70.0%, 80.8% and 70.3% of budget. A fully working anchor would collapse those toward one number, so every normalized figure carries roughly 10 percentage points of runner noise. Bites from Phase 6/7 on, when PERF-03 headroom decisions get made against normalized numbers. Do NOT resolve by retuning NOMINAL_REFERENCE_MS (budget-denominating, PERF-01a): investigate whether the scalar reference loop is representative of a Worker-pool workload's runner sensitivity. | fixed | DEFERRED TO BEFORE PHASE 4 PLANNING, not indefinitely. Waived only to unship-block Phase 3, whose own measurements are nowhere near their budget lines (PERF-02 measured 0.22ms against a 16ms budget, so plus or minus 10 percentage points of runner noise cannot move it near the threshold) and which touched no calibration code. The deferral expires at Phase 4: criterion 5 measures PERF-07 and PERF-08 for the first time (cold load under 1500ms, decode under 1000ms, warm under 300ms, no task over 50ms), and those run through the same normalize() path as PERF-03, so Phase 4 would bank four new budget decisions on a yardstick known to carry roughly 10 percentage points of noise. This entry's own text saying it bites from Phase 6/7 understates it: normalize() is used by kernel.bench.test.ts, sweep.bench.test.ts, canvas-repaint.bench.test.ts and decode-time.bench.test.ts, not only the sweep. Resolve by investigating whether the scalar reference loop is representative of a Worker-pool workload's runner sensitivity. Do NOT resolve by retuning NOMINAL_REFERENCE_MS (PERF-01a): the only effect would be to un-trip the D-20 escalation. | 2026-08-16T23:51:15.010Z | 2026-08-18T23:21:30.953Z |
| 3 | 03 | unmet-truth | tests/validation/upro-tqqq-gate.test.ts |  | VALID-01/02 gate was RED on first run for both UPRO (tracking error 3.164% vs 0.66% tolerance, drift -6.968%) and TQQQ (3.565% vs 0.66%, drift -3.861%); plan 03-06 correctly halted rather than force a D-20 classification. RESOLVED in commit 330724a: the residual was two residuals. (1) Drift was a dividend-convention structural defect in the gate harness, the synthetic being built from the price-return index while compared against the dividend-inclusive fund series -- D-20 outcome 1, synthetic rebuilt from the total-return index, drift moved to +0.254% and +0.399%, D-10 amended in 03-CONTEXT.md. (2) Tracking error was a floor in the reference data itself: each fund's own daily return against 3x its own benchmark, with NO cost model applied, already measures 3.198% and 3.519% annualized, because UPRO/TQQQ are Yahoo market closes rather than NAV -- D-20 outcome 2, the named fund-nav-vs-market-close-pricing-basis mechanism repriced from a reasoned 15bp to that measured 352bp, so TRACKING_ERROR_TOLERANCE recomputed 0.66% -> 3.955% without any tolerance constant being edited directly. No cost parameter was changed at any point (VALID-03 verified from git history by the phase verifier). Gate now GREEN: UPRO TE 3.2149% drift +0.2538%, TQQQ TE 3.5331% drift +0.3986%. Full evidence in 03-GATE-DIAGNOSIS.md | fixed |  | 2026-08-18T04:32:41.779Z | 2026-08-18T04:57:51.944Z |
| 4 | 04 | deviation | tests/metrics/irr.test.ts |  | Plan's monthly-contribution-schedule test case stated IRR solves strictly below the naive ratio-based return; verified by hand this is backwards for a front-loaded schedule with monotonic growth (later money compounds for less time, so the required annualized rate is higher). Test asserts the mathematically correct direction (IRR greater than naive). | fixed |  | 2026-08-19T19:33:39.696Z | 2026-08-20T04:16:52.275Z |
| 5 | 05 | deviation | perf-budgets.ts |  | ATTR-01/ATTR-02's counterfactual Shapley decomposition (src/validation/attribution.ts's buildSubsetValues) performs 3 extra runBacktest calls per recompute beyond the 1 base run scheduleRun already makes -- 05-09 Task 1 measured PERF-07b (the recompute this attribution now runs inside of) at 7.90ms normalized, 49.4% of its 16ms budget, this dev-sandbox run (not the D-17 CI baseline), comfortable headroom for a single-run parameter change. PERF-03 (the full 10,000-cell sweep) is already the project's highest-percentage budget: 807.92ms normalized, 80.8% of its 1000ms budget on the D-17 baseline, with a recorded D-20 escalation in PROJECT.md Key Decisions and no budget relaxed. If attribution's per-recompute cost were computed for every heatmap cell rather than once per single-run parameter change, it would multiply the sweep's per-cell kernel work by attribution's own 3-extra-arm (4x total including the base run) factor, landing on the budget with the least headroom in the project. Phase 6 and 7 must therefore decide, not assume: (1) whether the heatmap needs per-cell attribution at all, and (2) if it does, whether that computation belongs in the sweep worker pool rather than on the recompute path. Not decided here -- this phase has no heatmap and no authority over its design. | waived | Not a defect: a forward-looking finding for Phase 6/7 to inherit, per 05-09-PLAN.md Task 2. This phase has no heatmap and no authority to decide whether per-cell attribution belongs in the sweep worker pool -- that decision is explicitly deferred to Phase 6/7, which must read this entry before assuming per-cell attribution is free. | 2026-08-21T01:57:19.129Z | 2026-08-21T01:57:23.313Z |
| 6 | 07.1 | deviation | bench/sweep-pool-profile.bench.test.ts |  | Rule 3 fix: adapted this 07.1-01-owned diagnostic file to the new CashFlows typed-array shape (irr.ts Lever B) so it kept compiling; not in 07.1-03's declared files_modified. | waived | Not a defect. Rule 3 compile-keeping edit: 07.1-03 adapted this 07.1-01-owned diagnostic bench file to irr.ts Lever B's new CashFlows typed-array shape so the file kept compiling. The only irregularity is that the file was outside 07.1-03's declared files_modified, which is a scope-declaration deviation, not a behavioral one. No open technical question; 07.1-06 had nothing to settle here. | 2026-08-23T22:46:51.998Z | 2026-08-27T00:27:15.675Z |
| 7 | 07.1 | deviation | bench/sweep.bench.test.ts |  | 07.1-03 Task 2: raised the solveIrr contribution-schedule arm's sampleCount from 1 to 2 per the plan's acceptance criteria, but this task's own ceiling derivation (Task 1's measured 1.83x local reduction, well short of the profile's 3.14x iteration-count projection) shows N=2 projects to ~7975ms baseline, ~9.2% OVER the arm's own stated 7,303.90ms bench-runtime ceiling. Disclosed in the arm's own info line (runtimeCeilingDisposition=outside) and carried into the Task 3 checkpoint rather than resolved unilaterally. Plan 07.1-06's CI run against the real D-17 baseline settles it. | waived | Settled as escalated, not fixed. This entry deferred itself to plan 07.1-06's authoritative D-17 CI run; that run happened (CI 32676218114) and confirmed the breach is real. 07.1-06-SUMMARY.md records totalRuntimeMs at 45,709-66,527ms across all four D-17 runs against the 30,000ms cap, with this run at 56,141ms, disposition UNCLOSED and unchanged. The solveIrr arm itself measured normalizedMs=3992.09 at sampleCount=2, a third confirming figure, still roughly 3.9-4.0x over budget. PERF-03 closes phase 07.1 as FAILED, carried in PROJECT.md Key Decisions as a live escalation with Newton-with-bisection-fallback named as the remaining lever for a future phase. Waived so the ledger stops blocking ship; the escalation itself remains open in PROJECT.md and REQUIREMENTS.md, which is where it belongs. | 2026-08-23T22:46:57.437Z | 2026-08-27T00:27:15.797Z |
| 8 | 07.1 | deviation | bench/sweep-contention.bench.test.ts |  | 07.1-05 Task 1: read the plan's 'keep the cold-versus-warm pair' instruction as keeping the warm/cold STRUCTURE, not the warm sweep's exact size, and narrowed both the warm-baseline and in-flight sweeps to a shared CONTENTION_COLS axis rather than only the in-flight one -- a literal-only reading would have left the arm's budget unreachable in principle. Disclosed in 07.1-05-SUMMARY.md's Deviations section. | waived | Not a defect. A plan-interpretation call, disclosed in 07.1-05-SUMMARY.md's Deviations section: 07.1-05 Task 1 read 'keep the cold-versus-warm pair' as preserving the warm/cold structure rather than the warm sweep's exact size, and narrowed both the warm-baseline and in-flight sweeps to a shared CONTENTION_COLS axis. The stated rationale stands: a literal-only reading would have left the arm's budget unreachable in principle. 07.1-06 does not re-litigate this reading (its bench-runtime Key Decision addresses the general shortfall, not this axis choice), so there is no later measurement contradicting it. | 2026-08-23T23:45:14.753Z | 2026-08-27T00:27:15.922Z |

````json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "quick-260816-p8z",
    "file": "bench/report.ts",
    "line": null,
    "description": "Task 3's live end-to-end proof (npm run bench, .bench/bench-results.json score coherence) could not be run: Playwright chromium requires system libs (libnspr4/libnss3/etc) absent in this sandbox, install needs sudo. Coherence-check logic is covered by unit tests in tests/report.test.ts instead.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-16T18:22:38.854Z",
    "resolved_at": "2026-08-16T23:38:38.818Z"
  },
  {
    "id": 2,
    "kind": "unmet-truth",
    "phase": "quick-260816-qae",
    "file": "bench/calibration.ts",
    "line": null,
    "description": "Calibration under-corrects for CI runner speed variance, the thing normalize() exists to absorb. Across three D-17 baseline runs (31963076671, 31965951474, 31980066804) the raw PERF-03 sweep spanned 653.1ms to 856.4ms, a 31% spread; after dividing by calibrationScore the normalized figures still read 70.0%, 80.8% and 70.3% of budget. A fully working anchor would collapse those toward one number, so every normalized figure carries roughly 10 percentage points of runner noise. Bites from Phase 6/7 on, when PERF-03 headroom decisions get made against normalized numbers. Do NOT resolve by retuning NOMINAL_REFERENCE_MS (budget-denominating, PERF-01a): investigate whether the scalar reference loop is representative of a Worker-pool workload's runner sensitivity.",
    "status": "fixed",
    "reason": "DEFERRED TO BEFORE PHASE 4 PLANNING, not indefinitely. Waived only to unship-block Phase 3, whose own measurements are nowhere near their budget lines (PERF-02 measured 0.22ms against a 16ms budget, so plus or minus 10 percentage points of runner noise cannot move it near the threshold) and which touched no calibration code. The deferral expires at Phase 4: criterion 5 measures PERF-07 and PERF-08 for the first time (cold load under 1500ms, decode under 1000ms, warm under 300ms, no task over 50ms), and those run through the same normalize() path as PERF-03, so Phase 4 would bank four new budget decisions on a yardstick known to carry roughly 10 percentage points of noise. This entry's own text saying it bites from Phase 6/7 understates it: normalize() is used by kernel.bench.test.ts, sweep.bench.test.ts, canvas-repaint.bench.test.ts and decode-time.bench.test.ts, not only the sweep. Resolve by investigating whether the scalar reference loop is representative of a Worker-pool workload's runner sensitivity. Do NOT resolve by retuning NOMINAL_REFERENCE_MS (PERF-01a): the only effect would be to un-trip the D-20 escalation.",
    "recorded_at": "2026-08-16T23:51:15.010Z",
    "resolved_at": "2026-08-18T23:21:30.953Z"
  },
  {
    "id": 3,
    "kind": "unmet-truth",
    "phase": "03",
    "file": "tests/validation/upro-tqqq-gate.test.ts",
    "line": null,
    "description": "VALID-01/02 gate was RED on first run for both UPRO (tracking error 3.164% vs 0.66% tolerance, drift -6.968%) and TQQQ (3.565% vs 0.66%, drift -3.861%); plan 03-06 correctly halted rather than force a D-20 classification. RESOLVED in commit 330724a: the residual was two residuals. (1) Drift was a dividend-convention structural defect in the gate harness, the synthetic being built from the price-return index while compared against the dividend-inclusive fund series -- D-20 outcome 1, synthetic rebuilt from the total-return index, drift moved to +0.254% and +0.399%, D-10 amended in 03-CONTEXT.md. (2) Tracking error was a floor in the reference data itself: each fund's own daily return against 3x its own benchmark, with NO cost model applied, already measures 3.198% and 3.519% annualized, because UPRO/TQQQ are Yahoo market closes rather than NAV -- D-20 outcome 2, the named fund-nav-vs-market-close-pricing-basis mechanism repriced from a reasoned 15bp to that measured 352bp, so TRACKING_ERROR_TOLERANCE recomputed 0.66% -> 3.955% without any tolerance constant being edited directly. No cost parameter was changed at any point (VALID-03 verified from git history by the phase verifier). Gate now GREEN: UPRO TE 3.2149% drift +0.2538%, TQQQ TE 3.5331% drift +0.3986%. Full evidence in 03-GATE-DIAGNOSIS.md",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T04:32:41.779Z",
    "resolved_at": "2026-08-18T04:57:51.944Z"
  },
  {
    "id": 4,
    "kind": "deviation",
    "phase": "04",
    "file": "tests/metrics/irr.test.ts",
    "line": null,
    "description": "Plan's monthly-contribution-schedule test case stated IRR solves strictly below the naive ratio-based return; verified by hand this is backwards for a front-loaded schedule with monotonic growth (later money compounds for less time, so the required annualized rate is higher). Test asserts the mathematically correct direction (IRR greater than naive).",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-19T19:33:39.696Z",
    "resolved_at": "2026-08-20T04:16:52.275Z"
  },
  {
    "id": 5,
    "kind": "deviation",
    "phase": "05",
    "file": "perf-budgets.ts",
    "line": null,
    "description": "ATTR-01/ATTR-02's counterfactual Shapley decomposition (src/validation/attribution.ts's buildSubsetValues) performs 3 extra runBacktest calls per recompute beyond the 1 base run scheduleRun already makes -- 05-09 Task 1 measured PERF-07b (the recompute this attribution now runs inside of) at 7.90ms normalized, 49.4% of its 16ms budget, this dev-sandbox run (not the D-17 CI baseline), comfortable headroom for a single-run parameter change. PERF-03 (the full 10,000-cell sweep) is already the project's highest-percentage budget: 807.92ms normalized, 80.8% of its 1000ms budget on the D-17 baseline, with a recorded D-20 escalation in PROJECT.md Key Decisions and no budget relaxed. If attribution's per-recompute cost were computed for every heatmap cell rather than once per single-run parameter change, it would multiply the sweep's per-cell kernel work by attribution's own 3-extra-arm (4x total including the base run) factor, landing on the budget with the least headroom in the project. Phase 6 and 7 must therefore decide, not assume: (1) whether the heatmap needs per-cell attribution at all, and (2) if it does, whether that computation belongs in the sweep worker pool rather than on the recompute path. Not decided here -- this phase has no heatmap and no authority over its design.",
    "status": "waived",
    "reason": "Not a defect: a forward-looking finding for Phase 6/7 to inherit, per 05-09-PLAN.md Task 2. This phase has no heatmap and no authority to decide whether per-cell attribution belongs in the sweep worker pool -- that decision is explicitly deferred to Phase 6/7, which must read this entry before assuming per-cell attribution is free.",
    "recorded_at": "2026-08-21T01:57:19.129Z",
    "resolved_at": "2026-08-21T01:57:23.313Z"
  },
  {
    "id": 6,
    "kind": "deviation",
    "phase": "07.1",
    "file": "bench/sweep-pool-profile.bench.test.ts",
    "line": null,
    "description": "Rule 3 fix: adapted this 07.1-01-owned diagnostic file to the new CashFlows typed-array shape (irr.ts Lever B) so it kept compiling; not in 07.1-03's declared files_modified.",
    "status": "waived",
    "reason": "Not a defect. Rule 3 compile-keeping edit: 07.1-03 adapted this 07.1-01-owned diagnostic bench file to irr.ts Lever B's new CashFlows typed-array shape so the file kept compiling. The only irregularity is that the file was outside 07.1-03's declared files_modified, which is a scope-declaration deviation, not a behavioral one. No open technical question; 07.1-06 had nothing to settle here.",
    "recorded_at": "2026-08-23T22:46:51.998Z",
    "resolved_at": "2026-08-27T00:27:15.675Z"
  },
  {
    "id": 7,
    "kind": "deviation",
    "phase": "07.1",
    "file": "bench/sweep.bench.test.ts",
    "line": null,
    "description": "07.1-03 Task 2: raised the solveIrr contribution-schedule arm's sampleCount from 1 to 2 per the plan's acceptance criteria, but this task's own ceiling derivation (Task 1's measured 1.83x local reduction, well short of the profile's 3.14x iteration-count projection) shows N=2 projects to ~7975ms baseline, ~9.2% OVER the arm's own stated 7,303.90ms bench-runtime ceiling. Disclosed in the arm's own info line (runtimeCeilingDisposition=outside) and carried into the Task 3 checkpoint rather than resolved unilaterally. Plan 07.1-06's CI run against the real D-17 baseline settles it.",
    "status": "waived",
    "reason": "Settled as escalated, not fixed. This entry deferred itself to plan 07.1-06's authoritative D-17 CI run; that run happened (CI 32676218114) and confirmed the breach is real. 07.1-06-SUMMARY.md records totalRuntimeMs at 45,709-66,527ms across all four D-17 runs against the 30,000ms cap, with this run at 56,141ms, disposition UNCLOSED and unchanged. The solveIrr arm itself measured normalizedMs=3992.09 at sampleCount=2, a third confirming figure, still roughly 3.9-4.0x over budget. PERF-03 closes phase 07.1 as FAILED, carried in PROJECT.md Key Decisions as a live escalation with Newton-with-bisection-fallback named as the remaining lever for a future phase. Waived so the ledger stops blocking ship; the escalation itself remains open in PROJECT.md and REQUIREMENTS.md, which is where it belongs.",
    "recorded_at": "2026-08-23T22:46:57.437Z",
    "resolved_at": "2026-08-27T00:27:15.797Z"
  },
  {
    "id": 8,
    "kind": "deviation",
    "phase": "07.1",
    "file": "bench/sweep-contention.bench.test.ts",
    "line": null,
    "description": "07.1-05 Task 1: read the plan's 'keep the cold-versus-warm pair' instruction as keeping the warm/cold STRUCTURE, not the warm sweep's exact size, and narrowed both the warm-baseline and in-flight sweeps to a shared CONTENTION_COLS axis rather than only the in-flight one -- a literal-only reading would have left the arm's budget unreachable in principle. Disclosed in 07.1-05-SUMMARY.md's Deviations section.",
    "status": "waived",
    "reason": "Not a defect. A plan-interpretation call, disclosed in 07.1-05-SUMMARY.md's Deviations section: 07.1-05 Task 1 read 'keep the cold-versus-warm pair' as preserving the warm/cold structure rather than the warm sweep's exact size, and narrowed both the warm-baseline and in-flight sweeps to a shared CONTENTION_COLS axis. The stated rationale stands: a literal-only reading would have left the arm's budget unreachable in principle. 07.1-06 does not re-litigate this reading (its bench-runtime Key Decision addresses the general shortfall, not this axis choice), so there is no later measurement contradicting it.",
    "recorded_at": "2026-08-23T23:45:14.753Z",
    "resolved_at": "2026-08-27T00:27:15.922Z"
  }
]
````
