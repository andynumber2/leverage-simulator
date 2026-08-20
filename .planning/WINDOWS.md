---
schema_version: 1
open_count: 0
waived_count: 0
fixed_count: 4
total_count: 4
last_updated: 2026-08-20T04:16:52.275Z
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
  }
]
````
