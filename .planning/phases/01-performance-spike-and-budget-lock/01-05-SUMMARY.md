---
phase: 01-performance-spike-and-budget-lock
plan: 05
subsystem: testing
tags: [vitest, child_process, spawnSync, performance-budget, gate-liveness]

# Dependency graph
requires:
  - phase: 01-performance-spike-and-budget-lock (plan 04)
    provides: measured PERF-02/PERF-03/PERF-05 figures and the locked PERF_BUDGETS table this
      plan's backstop enforces
provides:
  - assertWithinBudget, the single per-metric delegate over checkBudget, exported from bench/report.ts
  - A run-level verdict === 'fail' backstop inside assertRunInvariants, sorted ascending by budget id
  - resolveBenchResultsDir, a guarded BENCH_RESULTS_DIR resolver in bench/accumulator-store.ts
  - The bench-selftest Vitest project and bench/selftest/over-budget.selftest.ts fixture
  - The bench:selftest npm script and a rewritten D-09 self-test that spawns it
affects: [phase-02, phase-03, phase-04, phase-06, phase-07]

# Actuals (#2632)
actuals:
  tokens: 7744
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Run-level invariant as the authoritative gate, per-file expect() as a diagnostic-only delegate over one shared comparison (checkBudget)"
    - "Spawned-child-process self-test (node:child_process spawnSync) to prove a harness command's exit code, rather than testing a pure function in isolation"
    - "BENCH_RESULTS_DIR env var + guarded resolver to isolate a self-test's filesystem writes from the real bench artifact"

key-files:
  created:
    - bench/selftest/over-budget.selftest.ts
  modified:
    - bench/report.ts
    - bench/accumulator-store.ts
    - bench/global-setup.ts
    - vitest.config.ts
    - package.json
    - tests/perf-budgets.selftest.test.ts
    - tests/report.test.ts
    - bench/kernel.bench.test.ts
    - bench/canvas-repaint.bench.test.ts
    - bench/sweep.bench.test.ts

key-decisions:
  - "assertRunInvariants's verdict check is promoted to the authoritative gate; the per-file expect() is demoted to a diagnostic delegate over assertWithinBudget, per the plan's assumption_delta_decision"
  - "bench/global-setup.ts sets process.exitCode = 1 immediately before rethrowing from assertRunInvariants, as a structural backstop, even though the bare throw alone already produced a non-zero exit in this environment"
  - "The D-09 self-test's spawned bench:selftest run uses BENCH_RESULTS_DIR=.bench/selftest so it cannot clobber the real .bench/bench-results.json artifact"

patterns-established:
  - "Every future bench file records a MeasurementRow and asserts through assertWithinBudget(row) against that same object, never a hand-written normalizedMs > budgetMs comparison"

requirements-completed: [PERF-01, PERF-10]

coverage:
  - id: D1
    description: "assertRunInvariants throws when any row carries verdict fail, independent of any bench file's own expect, and bench/global-setup.ts's teardown turns that throw into a non-zero process exit"
    requirement: PERF-01
    verification:
      - kind: unit
        ref: "tests/report.test.ts#assertRunInvariants > throws when any row carries verdict fail, naming the failing budget id"
        status: pass
      - kind: integration
        ref: "npm run bench:selftest (manual confirmation: exit=1, output names PERF-05 and 'failed budget')"
        status: pass
    human_judgment: false
  - id: D2
    description: "A permanent self-test spawns the real bench:selftest harness command against a deliberately over-budget fixture and asserts a non-zero exit naming the failing budget id"
    requirement: PERF-01
    verification:
      - kind: integration
        ref: "tests/perf-budgets.selftest.test.ts#gate-liveness self-test (D-09) > spawning the real bench:selftest command against the over-budget fixture exits non-zero (D-09 proof)"
        status: pass
    human_judgment: false
  - id: D3
    description: "checkBudget is the single numeric comparison; assertWithinBudget is the only delegate, and all three bench files assert through it against the row they recorded"
    requirement: PERF-01
    verification:
      - kind: unit
        ref: "tests/report.test.ts#assertWithinBudget"
        status: pass
      - kind: integration
        ref: "npm run bench (manual confirmation: lowering PERF-03's thresholdMs to 0 fails both the per-file assertion in bench/sweep.bench.test.ts and the run-level backstop, naming PERF-03 in both; reverted, npm run bench green again)"
        status: pass
    human_judgment: false
  - id: D4
    description: "resolveBenchResultsDir isolates the self-test's writes so a spawned run cannot clobber .bench/bench-results.json"
    requirement: PERF-01
    verification:
      - kind: unit
        ref: "tests/report.test.ts#resolveBenchResultsDir"
        status: pass
      - kind: integration
        ref: "npm run bench then npm test (manual confirmation: .bench/bench-results.json rows carry no fail verdict after the isolated self-test spawn)"
        status: pass
    human_judgment: false
  - id: D5
    description: "npm run bench prints exactly one row per budget id every run and a run measuring nothing fails loudly, unchanged by this plan's edits"
    requirement: PERF-10
    verification:
      - kind: integration
        ref: "npm run bench (manual confirmation: 9 of 9 tests passing, table unchanged in structure)"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-08-16
status: complete
---

# Phase 1 Plan 05: Run-Level Budget Backstop and Spawned Gate-Liveness Proof Summary

**`assertRunInvariants` now fails a bench run on any `verdict === 'fail'` row independent of any single bench file's own assertion, and a permanent self-test spawns the real `bench:selftest` harness command against a deliberately over-budget fixture to prove the exit code is non-zero.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-16T04:02:22Z
- **Completed:** 2026-08-16T04:17:31Z
- **Tasks:** 2
- **Files modified:** 10 (1 created, 9 modified)

## Accomplishments

- Closed both `01-VERIFICATION.md` Gap 1 items: the run-level invariant now checks `verdict === 'fail'`, and a permanent self-test spawns the real harness command and asserts a non-zero exit.
- Centralized the budget comparison: `checkBudget` is the only place `normalizedMs` is compared against `budgetMs`; `assertWithinBudget` is the single delegate every enforcement site (three bench files, the run-level backstop) routes through.
- Isolated the self-test's filesystem writes from the real `.bench/bench-results.json` artifact via a guarded `BENCH_RESULTS_DIR` resolver, so running the unit suite forever cannot clobber the figures `01-SPIKE-RESULTS.md` transcribes.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end proof that a fail verdict exits non-zero, through the real teardown** - `b23e33b` (feat, tracer/tdd)
2. **Task 2: Route every per-metric assertion through the one shared comparison** - `d7c9b70` (refactor)

## Files Created/Modified

- `bench/selftest/over-budget.selftest.ts` - New. Deliberately over-budget PERF-05 fixture; builds its row through the real `checkBudget`, persists it through the real accumulator store.
- `bench/report.ts` - Added `assertWithinBudget`; added the `verdict === 'fail'` run-level backstop (sorted ascending by budget id) inside `assertRunInvariants`; rewrote the file-header comment.
- `bench/accumulator-store.ts` - Added `resolveBenchResultsDir` with an absolute-path/parent-segment guard; replaced the frozen `RAW_DIR` constant with a per-call `rawDir()` composed from the resolver.
- `bench/global-setup.ts` - Imports `resolveBenchResultsDir` instead of hardcoding `.bench`; wraps the `assertRunInvariants` call to set `process.exitCode = 1` before rethrowing.
- `vitest.config.ts` - Added the `bench-selftest` project (Node environment, no browser block, reuses `bench/global-setup.ts`).
- `package.json` - Added the `bench:selftest` script.
- `tests/perf-budgets.selftest.test.ts` - Rewrote the D-09 gate-liveness describe block to spawn `npm run bench:selftest` via `spawnSync` and assert a non-zero exit; kept `makeRow` and the `PERF-01a anchor invariant` block untouched.
- `tests/report.test.ts` - Added coverage for `assertWithinBudget`, the verdict-fail backstop (including the ordering guarantee), and `resolveBenchResultsDir`'s three outcomes.
- `bench/kernel.bench.test.ts`, `bench/canvas-repaint.bench.test.ts`, `bench/sweep.bench.test.ts` - Replaced each file's inline `expect(normalizedMs).toBeLessThanOrEqual(...)` with `expect(() => assertWithinBudget(row)).not.toThrow()`.

## Decisions Made

- Promoted `assertRunInvariants`'s verdict check to the authoritative gate; the per-file `expect()` survives as a diagnostic-only delegate, per the plan's `assumption_delta_decision`.
- Added the `process.exitCode = 1` wrap in `bench/global-setup.ts` as a structural backstop even though empirical confirmation showed the bare throw already produced exit code 1 in this environment — the plan required verifying the claim empirically rather than trusting the pre-existing comment, and the wrap makes the guarantee hold by construction rather than by this environment's specific Vitest/Node behavior.

## Deviations from Plan

None - plan executed exactly as written. Both `must_haves.prohibitions` held: no budget threshold was permanently raised (the Task 2 acceptance-criteria threshold lowering on `PERF-03` was reverted immediately, confirmed via `git diff` showing no change to `perf-budgets.ts`), and no spike-synthetic figure was presented as production.

## Issues Encountered

- The Task 2 acceptance criterion suggested lowering `PERF-02`'s threshold to `0` to prove dual-site failure reporting. In this sandboxed headless-Chromium environment, `PERF-02`'s single-call measurement occasionally lands at exactly `0.00ms` raw (timer-resolution artifact on a sub-millisecond operation), which would pass even at a `0ms` budget and not exercise the failure path deterministically. Used `PERF-03` instead (consistently measured at ~325ms), which reliably reproduced the failure at both the per-file assertion in `bench/sweep.bench.test.ts` and the run-level backstop, naming `PERF-03` in both. This is a substitution of which requirement id was used for the manual confirmation step, not a change to the plan's actual code or tests.
- Running `npm run bench:selftest` directly (without the isolating `BENCH_RESULTS_DIR` the D-09 test sets) writes into the real `.bench` directory, as literally instructed by the plan's acceptance criteria. Restored the real `.bench/bench-results.json` via `npm run bench` after each direct manual confirmation run, and confirmed via `npm test` afterward that the artifact still carries no `fail` verdict.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The budget gate can no longer rot into a no-op: the authoritative check lives at the run level, the numeric comparison exists exactly once, and a permanent spawned-process test proves the exit code. Every later phase (2, 3, 4, 6, 7) that adds a bench file inherits this gate and the `assertWithinBudget(row)` call pattern.
- Known limitation carried forward unresolved by design: no GitHub remote exists in this repository, so whether GitHub Actions renders the harness's non-zero exit as a red check remains unverified (recorded in the plan's "Known Limitations," not hidden).
- Plan 01-06 owns the remaining edge-probe rows for PERF-01a (concurrency, boundary, empty, ordering, precision) not covered by this plan.

---
*Phase: 01-performance-spike-and-budget-lock*
*Completed: 2026-08-16*

## Self-Check: PASSED

All 11 files_modified paths and the SUMMARY.md itself confirmed present on disk; both task commit hashes (`b23e33b`, `d7c9b70`) confirmed present in `git log --oneline --all`.
