---
phase: quick-260818-v2d
reviewed: 2026-08-18T23:28:27Z
depth: quick
files_reviewed: 7
files_reviewed_list:
  - bench/calibration.ts
  - bench/report.ts
  - bench/sweep-pool.ts
  - bench/sweep.bench.test.ts
  - perf-budgets.ts
  - tests/report.test.ts
  - tests/sweep-pool.test.ts
findings:
  critical: 0
  warning: 0
  info: 1
  total: 1
status: clean
---

# Quick 260818-v2d: Code Review Report

**Reviewed:** 2026-08-18T23:28:27Z
**Depth:** quick (escalated to targeted line-by-line tracing on the seven attention points named in the review brief)
**Files Reviewed:** 7
**Status:** clean

## Summary

Reviewed the diff `c09ee38..HEAD` for the seven listed files against the six specific attention
points in the review brief: guard non-bypassability and placement, single source of truth for the
baseline width, `NOMINAL_REFERENCE_MS` staying 40, no back-door budget-denominating constant, and
CLAUDE.md style rules (no em dash, no nested ternaries). Traced `assertRunInvariants`'s full
execution order by hand against `bench/selftest/over-budget.selftest.ts` and
`tests/perf-budgets.selftest.test.ts`, cross-checked the plan's `<established_figures>` block
against `normalize()`'s replaced doc comment, and ran `npm run typecheck` and the three affected
test files (63/63 pass). No blockers or warnings found.

**Guard placement (verdict-fail gate keeps precedence):** Confirmed by direct read of
`bench/report.ts:292-402`. The unconditional `verdict === 'fail'` check (lines 325-331) runs
*before* the `if (environment)` block that contains the new host-width guard (lines 338-361).
`bench/selftest/over-budget.selftest.ts` records `hardwareConcurrency: 1` with a deliberately
failing PERF-05 row; because the verdict-fail check is unconditional and runs first, that fixture
throws `assertRunInvariants: 1 row(s) failed budget: PERF-05` regardless of environment or host
width, never reaching the new guard. `tests/perf-budgets.selftest.test.ts`'s assertions
(`/PERF-05/`, `/failed budget/i`) still hold — verified by running the spawned selftest indirectly
via the full `unit` project test run (63/63 pass, including
`tests/report.test.ts`'s own "verdict gate keeps precedence over the host guard" case).

**Non-bypassability of the off-baseline guard:** Traced both branches inside
`if (!hostMatchesPerf03Baseline(environment))`:
- `environment.ci === true` throws unconditionally, independent of what any row (including
  PERF-03's own) carries. This is stricter than "withhold the verdict" — an off-baseline CI run
  hard-fails the entire run, not just PERF-03. This matches the plan's explicit, previously
  recorded design decision ("withhold locally, hard-fail on CI") in
  `260818-v2d-PLAN.md`'s `<action>` block, so it is not a defect, but it is worth flagging as an
  operational consequence: if GitHub Actions ever changes `ubuntu-latest`'s core count away from
  4, every CI run fails outright (not just PERF-03's verdict) until `PERF_03_BASELINE_HARDWARE_CONCURRENCY`
  is deliberately updated. Filed as IN-01 below since it is intended behavior, not a bug, but the
  operational blast radius is broader than "withhold PERF-03" might suggest to a future reader of
  the ledger entry alone.
- `environment.ci === false` throws only if a PERF-03 row exists with `verdict !== 'unmeasured'`,
  which is exactly what would happen if a future edit to `bench/sweep.bench.test.ts` deleted its
  own off-baseline branch and let a pinned-width measurement fall through to
  `checkBudget`'s `pass`/`fail` output on a non-baseline host. Confirmed unreachable-with-missing-row
  concern is moot: `assertRunInvariants`'s earlier "missing requirement group header" check
  (lines 297-303) would already throw before the guard runs if a `PERF-03` row were absent
  entirely, since `PERF-03` is both the sole budget id and the sole requirement id in that group.

**Single source of truth for the baseline width:** `grep` across the full non-`.planning`,
non-`node_modules` tree confirms `PERF_03_BASELINE_HARDWARE_CONCURRENCY = 4` is defined exactly
once (`perf-budgets.ts:100`) and every other reference (`bench/sweep-pool.ts`, `bench/report.ts`,
`bench/sweep.bench.test.ts`, both test files) imports it rather than restating the literal `4`.
`BASELINE_WORKER_COUNT` is derived once via the extracted `workerCountForCores`, shared with
`resolveWorkerCount()`'s host-following path, so the flooring rule (`Math.max(1, cores - 1)`)
also has exactly one implementation.

**`NOMINAL_REFERENCE_MS` and budget thresholds:** `bench/calibration.ts:108` still reads
`const NOMINAL_REFERENCE_MS = 40` (diff touches only the doc comment above `normalize()`, no
executable line). `perf-budgets.ts`'s diff is additive only (`PERF_03_BASELINE_HARDWARE_CONCURRENCY`
plus its doc comment); every `thresholdMs`/`anchorMs`/`relaxationReason` in `PERF_BUDGETS` is
byte-identical to `c09ee38`.

**No back-door budget-denominating constant:** `grep` for any division by
`PERF_03_BASELINE_HARDWARE_CONCURRENCY` or `BASELINE_WORKER_COUNT` across `bench/*.ts` and
`perf-budgets.ts` returns nothing — the new constant is used only in equality comparisons
(`hostMatchesPerf03Baseline`) and as a `workerCount` option value, never as a divisor, matching
its own doc comment's claim. `bench/canonical-calibration.ts` has zero diff against `c09ee38`,
confirmed via `git diff`, satisfying the plan's prohibition 3 (it stays browser-bundle-safe with
no new Node-only import).

**Style rules:** No em dash (U+2014) in any of the seven files (`grep` for the UTF-8 byte
sequence `\xe2\x80\x94` returns nothing). No nested ternaries introduced — the only new ternary
is the single, non-nested `row.verdict === 'unmeasured' ? 'withheld' : 'rendered'` in
`bench/sweep.bench.test.ts:183`; the PERF-03 baseline/off-baseline row construction and the CI/
non-CI guard branches are both written with `if`/`else`, as the plan's hard prohibition 7
required.

**Doc-comment figure fidelity:** Cross-checked every numeric claim in `normalize()`'s replaced
doc comment (`bench/calibration.ts:171-201`) against the plan's `<established_figures>` block —
CV figures (11.03%/6.36% PERF-03, 11.10%/7.12% PERF-02), the excluded-cohort figures
(0.31%/3.07%), the correlation figures (0.874, 0.057, -0.007), the interference-elasticity
figures (+7.8%/+12.1%/+24.5%/+60.2% raw, +4.0%/+15.5%/48.6% residual), the power-analysis figures
(~26/~7 runs), and the rejected-regression figures (slope 1.051, CI 0.626-1.476, 0.02pp) all
match verbatim. No invented number found.

**Test/typecheck verification:** `npm run typecheck` passes clean. `npx vitest run
tests/report.test.ts tests/sweep-pool.test.ts tests/perf-budgets.selftest.test.ts --project
unit` passes 63/63, including the new `hostMatchesPerf03Baseline`, PERF-03 host-width guard, and
withheld-banner test groups.

## Info

### IN-01: CI-off-baseline throws hard-fail the whole run, not a scoped PERF-03-only failure

**File:** `bench/report.ts:346-351`
**Issue:** When `environment.ci` is `true` and the host's `hardwareConcurrency` differs from
`PERF_03_BASELINE_HARDWARE_CONCURRENCY`, `assertRunInvariants` throws unconditionally, failing
the entire bench run (all budgets, not just PERF-03) with a non-zero exit. This is deliberate and
documented (`260818-v2d-PLAN.md`'s "Answer to the research's open design question" paragraph:
"withhold locally, hard-fail on CI"), and is exercised by tests. Not a defect against the plan as
written. Flagging only because a future reader of `WINDOWS.md`'s closed-entry summary, without
the plan's full design-question paragraph in view, could reasonably expect "withhold PERF-03's
verdict" to mean a scoped, single-metric degradation on CI too, when the actual CI behavior is an
all-budgets hard stop the moment GitHub Actions' `ubuntu-latest` core count ever drifts from 4.
**Fix:** No code change needed. If `WINDOWS.md` or `STATE.md`'s closing summary (out of scope for
this review's file list) doesn't already state "hard-fails the whole CI run, not just PERF-03,"
consider adding that clause so the operational consequence is discoverable without re-reading the
full plan.

---

_Reviewed: 2026-08-18T23:28:27Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
