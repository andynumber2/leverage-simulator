---
phase: 03-simulation-kernel-and-the-upro-tqqq-gate
plan: 01
subsystem: simulation-kernel
tags: [typescript, float64array, typed-arrays, vitest, binary-bundle, cli]

requires:
  - phase: 02-compiled-data-bundle
    provides: the committed binary bundle, its manifest, decodeHeader/seriesView/calendarView, BUNDLE_VERSION and MANIFEST_PATH
  - phase: 01-performance-spike-and-budget-lock
    provides: bench/kernel.ts's branch order and caller-preallocated-buffer discipline
provides:
  - runBacktest, the allocation-free daily-rebalanced leveraged kernel, with no runtime imports
  - KernelSeries / KernelParams / KernelOutputs / KernelResult, the contracts every later plan in this phase and Phase 7's sweep worker build against
  - the data-layer seam (loadBundleFromDisk, buildKernelInputs) that owns all bundle decoding, percent-to-fraction conversion, return derivation and window resolution
  - npm run run-backtest, a CLI printing a dated equity curve from the real committed bundle
  - a mechanical SIM-10 module-boundary test and the D-32 fail-loud range assertions
affects: [03-02, 03-03, 03-04, 03-05, 03-06, phase-07-sweep-worker]

actuals:
  tokens: 9900
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Kernel imports types only — the emitted module has zero runtime imports, asserted by a source-text test rather than a comment"
    - "All unit conversion (percent to fraction) happens exactly once, in the data layer, never in the kernel"
    - "Daily returns are derived once from stored index levels in the data layer, so a 10,000-cell sweep pays the cost a single time"

key-files:
  created:
    - src/kernel/backtest.types.ts
    - src/kernel/backtest.ts
    - src/data/kernel-inputs.ts
    - scripts/run-backtest.ts
    - tests/data/kernel-inputs.test.ts
    - tests/kernel/module-boundary.test.ts
  modified:
    - package.json

key-decisions:
  - "LONG_GAP_FLAG_MIN_DAYS set to 6 inclusive (D-04): only the 1933 bank holiday (12 days) and the 2001 closure (7 days) clear it; ordinary 3- and 4-day holiday weekends do not"
  - "Financing uses a 360 day-count basis and the expense ratio uses 365 (D-01/D-02); the two bases are declared as separate constants and are never shared"
  - "Financing is structurally zero at leverage 1 via the (leverage - 1) factor, with no comparison against the value 1 anywhere in the kernel (D-05), which also leaves the leverage-0.5 credit unclamped (D-08)"
  - "Contribution frequencies other than 'none' throw an error naming plan 03-04 rather than silently no-op'ing, so the functionality gap is loud"
  - "bench/kernel.ts was left untouched: it still backs PERF-03's sweep, and plan 03-05 owns the PERF-02 handover onto the promoted kernel"

patterns-established:
  - "Module-boundary enforcement by source-text assertion: tests/kernel/module-boundary.test.ts reads the kernel source with node:fs and extracts import specifiers with a regex, so adding a data-layer import turns the test red with no other change"
  - "Fail-loud range validation: buildKernelInputs throws with both the offending value and the supported range, never truncating silently (D-32)"

requirements-completed: [SIM-01, SIM-02, SIM-03, SIM-05, SIM-08, SIM-10, SIM-11]

coverage:
  - id: D1
    description: "One real SPX backtest runs end to end from the committed Phase 2 bundle through the data-layer seam and the kernel to a printed, dated equity curve"
    requirement: SIM-01
    verification:
      - kind: unit
        ref: "tests/data/kernel-inputs.test.ts#runs a real SPX backtest with a cost-free entry bar and a fully non-negative value series"
        status: pass
      - kind: other
        ref: "npm run run-backtest -- --symbol SPX --leverage 3 --entry 1990-01-02 --holding-bars 2520 --initial 10000 (exit 0; header names SPX/total-return, bundleVersion 45a9f1ae6444, window 1990-01-02..1999-12-20)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The entry bar is the cost-free anchor: outValue[0] is exactly initialInvestment, with no return applied and no financing or expense accrued (D-03)"
    requirement: SIM-02
    verification:
      - kind: unit
        ref: "tests/data/kernel-inputs.test.ts#runs a real SPX backtest with a cost-free entry bar and a fully non-negative value series"
        status: pass
    human_judgment: false
  - id: D3
    description: "Financing scales linearly with elapsed calendar days on a 360 basis, separately from the expense ratio's 365 basis (D-01, D-02, SIM-03)"
    requirement: SIM-03
    verification:
      - kind: unit
        ref: "tests/data/kernel-inputs.test.ts#financing cost scales with calendarDaysElapsed: a 3-day gap costs 3x a 1-day gap"
        status: pass
    human_judgment: false
  - id: D4
    description: "Percent-to-fraction conversion happens exactly once, in the data layer (D-09)"
    requirement: SIM-08
    verification:
      - kind: unit
        ref: "tests/data/kernel-inputs.test.ts#percent-to-fraction conversion happens exactly once, in the data layer (D-09)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Repeat calls into the same preallocated buffers are byte-identical, the PERF-02 idempotency precondition"
    requirement: SIM-11
    verification:
      - kind: unit
        ref: "tests/data/kernel-inputs.test.ts#a second identical call into the same preallocated buffers reproduces the first call element for element (PERF-02 idempotency edge)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The SIM-10 one-module boundary is held mechanically: the kernel imports only ./backtest.types.ts and declares no top-level mutable binding"
    requirement: SIM-10
    verification:
      - kind: unit
        ref: "tests/kernel/module-boundary.test.ts#src/kernel/backtest.ts imports only ./backtest.types.ts"
        status: pass
      - kind: unit
        ref: "tests/kernel/module-boundary.test.ts#src/kernel/backtest.types.ts imports nothing at all"
        status: pass
      - kind: unit
        ref: "tests/kernel/module-boundary.test.ts#src/kernel/backtest.ts declares no top-level mutable binding outside a function body (PERF-02 concurrency backstop)"
        status: pass
    human_judgment: false
  - id: D7
    description: "D-32 boundary validation fails loud: out-of-range entry dates and over-long holding periods throw messages naming the offending value and the supported range"
    requirement: SIM-05
    verification:
      - kind: unit
        ref: "tests/kernel/module-boundary.test.ts#an entry date before the selected series' firstDate throws, naming the offending date"
        status: pass
      - kind: unit
        ref: "tests/kernel/module-boundary.test.ts#an entry date after the selected series' lastDate throws, naming the offending date"
        status: pass
      - kind: unit
        ref: "tests/kernel/module-boundary.test.ts#an entry date exactly at firstDate succeeds"
        status: pass
      - kind: unit
        ref: "tests/kernel/module-boundary.test.ts#a holdingPeriodBars one larger than the remaining supported bars throws while the exact remaining count succeeds"
        status: pass
      - kind: unit
        ref: "tests/kernel/module-boundary.test.ts#an undersized outValue throws a message containing both lengths"
        status: pass
    human_judgment: false

duration: 32min
completed: 2026-08-18
status: complete
---

# Phase 03 Plan 01: Simulation Kernel Tracer Slice Summary

**An allocation-free, zero-runtime-import `runBacktest` kernel plus the `kernel-inputs` data-layer seam, proven end to end by an `npm run run-backtest` CLI that prints a real dated SPX equity curve from the committed Phase 2 binary bundle.**

## Performance

- **Duration:** 32 min
- **Started:** 2026-08-18T02:59:39Z
- **Completed:** 2026-08-18T03:31:47Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- `src/kernel/backtest.ts` ports the Phase 1 spike's branch order and preallocated-buffer discipline while applying every correction 03-PATTERNS.md required: financing on a 360 basis, the expense ratio moved from a flat per-bar 252 divisor to a calendar-gap-aware 365 basis, `contributionFlags[i]` replacing the modulo-on-bar-index test, bar 0 as a cost-free anchor, and a `KernelResult` carrying `ruinBarIndex`, `droppedContributionsTotal`, `totalContributed`, `longGapBarCount` and `barCount`.
- `src/data/kernel-inputs.ts` concentrates every conversion and window decision in one place: the rate series and the two request percentages are divided by 100 exactly once, `calendarDaysElapsed` is differenced from the shared calendar view, returns are derived once from stored index levels, and the run window is resolved against both the price series' and the rate series' coverage with `meta.truncatedForRateCoverage` recording the difference.
- `scripts/run-backtest.ts` and the `run-backtest` package script make the whole path runnable from one command, with the two placeholder cost percentages labelled as PROJECT.md placeholders in the printed header so plan 03-04 can repoint them at plan 03-03's sourced constants without ambiguity.
- SIM-10 is enforced by a test that reads the kernel source and extracts its import specifiers, not by a comment.

## Task Commits

1. **Task 1: One real SPX backtest end to end** and **Task 2: Hold the SIM-10 module boundary and the D-32 range assert** - `540c073` (feat)

_Note: both tasks landed in a single commit rather than one commit per task. See Deviations._

## Files Created/Modified

- `src/kernel/backtest.types.ts` - `KernelSeries`/`KernelParams`/`KernelOutputs`/`KernelResult` and the `LONG_GAP_FLAG_MIN_DAYS` / `FINANCING_DAY_COUNT_BASIS` / `EXPENSE_DAY_COUNT_BASIS` constants
- `src/kernel/backtest.ts` - the daily-rebalanced leveraged kernel, allocation-free in the loop, type-only import
- `src/data/kernel-inputs.ts` - `loadBundleFromDisk` and `buildKernelInputs`, the only place bundle decoding and unit conversion happen
- `scripts/run-backtest.ts` - the CLI that prints the header block, the dated equity curve and the summary line
- `tests/data/kernel-inputs.test.ts` - the end-to-end assertion over the real bundle plus the 3-day financing ratio
- `tests/kernel/module-boundary.test.ts` - the SIM-10 import-set and top-level-mutability assertions plus the D-32 range cases
- `package.json` - the `run-backtest` script entry

## Decisions Made

See `key-decisions` in the frontmatter. The load-bearing one is `LONG_GAP_FLAG_MIN_DAYS = 6`: planner discretion under D-04, chosen so ordinary 3- and 4-day holiday weekends do not trip the outsized-closure flag while the 1933 bank holiday and the 2001 closure do.

## Deviations from Plan

**1. [Commit protocol] Both tasks committed together rather than atomically per task**

- **Found during:** post-hoc close-out of this plan
- **Issue:** the executor produced a single `feat(03-01)` commit (`540c073`) covering both Task 1 and Task 2, instead of the one-commit-per-task the executor protocol specifies. Task 2's defensive length assert in `runBacktest` is a Task-2-scoped edit to a Task-1 file, which is the likely reason the two were merged.
- **Fix:** none applied. Splitting a merged, already-verified commit retroactively is a history rewrite with no correctness benefit; the deviation is recorded here instead.
- **Files modified:** none
- **Verification:** all acceptance criteria for both tasks verified independently at close-out (see below)
- **Committed in:** n/a

**2. [Artifact] SUMMARY.md written by the orchestrator, not the executor**

- **Found during:** the `safe_resume_gate` at the start of the next `/gsd-execute-phase` run
- **Issue:** the executor ran inside the locked worktree `.claude/worktrees/agent-ad7e598ba197099d9` and merged its production commit without writing `03-01-SUMMARY.md` or updating STATE.md.
- **Fix:** this file was written by the orchestrator from the actual commit contents plus a fresh independent verification run; STATE.md was updated in the same close-out.
- **Files modified:** `.planning/phases/03-simulation-kernel-and-the-upro-tqqq-gate/03-01-SUMMARY.md`, `.planning/STATE.md`
- **Verification:** every acceptance criterion re-run from a clean checkout of the merged branch
- **Committed in:** the close-out `docs(03-01)` commit

---

**Total deviations:** 2 (1 commit-protocol, 1 artifact) — both procedural. No code deviation from the plan.
**Impact on plan:** none on the delivered interfaces or behavior. Both are bookkeeping.

## Issues Encountered

None during planned work. The plan's `<interfaces>` block was implemented as written, so plans 03-02 through 03-06 can build against it unchanged.

## Verification at Close-Out

Re-run independently against the merged branch, not inherited from the executor's report:

| Check | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run test -- tests/data/kernel-inputs.test.ts tests/kernel/module-boundary.test.ts` | 12 passed / 12 |
| `npm run run-backtest -- --symbol SPX --leverage 3 --entry 1990-01-02 --holding-bars 2520 --initial 10000` | exit 0, `SPX/total-return`, bundle `45a9f1ae6444`, window `1990-01-02..1999-12-20` (2520 bars), `truncatedForRateCoverage=true` |
| `npm run run-backtest -- --symbol SPX --entry 1800-01-02` | exit 1, message names both `1800-01-02` and the supported range `[1927-12-30, 2026-08-17]` |
| `npm run run-backtest -- --symbol SPX --entry 1990-01-02 --frequency monthly` | exit non-zero, message names plan `03-04` |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The `<interfaces>` contract is live and stable. Plans 03-02 through 03-06 add optional fields only.
- Open item carried forward: `bench/kernel.ts` remains the PERF-02/PERF-03 workload. Plan `03-05` owns swapping PERF-02 onto `src/kernel/backtest.ts` and re-heading `bench/kernel.ts`.
- Open item carried forward: the CLI's `--expense-ratio 0.90` and `--financing-spread 0.50` defaults are PROJECT.md placeholders. Plan `03-04` repoints them at plan `03-03`'s sourced constants. Per the Phase 3 blocker in STATE.md, these must be sourced and documented before the UPRO/TQQQ validation gate is first run.

---
*Phase: 03-simulation-kernel-and-the-upro-tqqq-gate*
*Completed: 2026-08-18*
