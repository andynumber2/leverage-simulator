---
schema_version: 1
open_count: 2
waived_count: 0
fixed_count: 1
total_count: 3
last_updated: 2026-08-18T04:32:41.779Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | quick-260816-p8z | unrun-verify | bench/report.ts |  | Task 3's live end-to-end proof (npm run bench, .bench/bench-results.json score coherence) could not be run: Playwright chromium requires system libs (libnspr4/libnss3/etc) absent in this sandbox, install needs sudo. Coherence-check logic is covered by unit tests in tests/report.test.ts instead. | fixed |  | 2026-08-16T18:22:38.854Z | 2026-08-16T23:38:38.818Z |
| 2 | quick-260816-qae | unmet-truth | bench/calibration.ts |  | Calibration under-corrects for CI runner speed variance, the thing normalize() exists to absorb. Across three D-17 baseline runs (31963076671, 31965951474, 31980066804) the raw PERF-03 sweep spanned 653.1ms to 856.4ms, a 31% spread; after dividing by calibrationScore the normalized figures still read 70.0%, 80.8% and 70.3% of budget. A fully working anchor would collapse those toward one number, so every normalized figure carries roughly 10 percentage points of runner noise. Bites from Phase 6/7 on, when PERF-03 headroom decisions get made against normalized numbers. Do NOT resolve by retuning NOMINAL_REFERENCE_MS (budget-denominating, PERF-01a): investigate whether the scalar reference loop is representative of a Worker-pool workload's runner sensitivity. | open |  | 2026-08-16T23:51:15.010Z |  |
| 3 | 03 | unmet-truth | tests/validation/upro-tqqq-gate.test.ts |  | VALID-01/02 gate is RED on first run for both UPRO (tracking error 3.164% vs 0.66% tolerance, drift -6.968% vs tolerance) and TQQQ (3.565% vs 0.66%, drift -3.861%); root cause not conclusively isolated to any of D-20's five signature rows, see 03-06-SUMMARY.md | open |  | 2026-08-18T04:32:41.779Z |  |

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
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-16T23:51:15.010Z",
    "resolved_at": null
  },
  {
    "id": 3,
    "kind": "unmet-truth",
    "phase": "03",
    "file": "tests/validation/upro-tqqq-gate.test.ts",
    "line": null,
    "description": "VALID-01/02 gate is RED on first run for both UPRO (tracking error 3.164% vs 0.66% tolerance, drift -6.968% vs tolerance) and TQQQ (3.565% vs 0.66%, drift -3.861%); root cause not conclusively isolated to any of D-20's five signature rows, see 03-06-SUMMARY.md",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-18T04:32:41.779Z",
    "resolved_at": null
  }
]
````
