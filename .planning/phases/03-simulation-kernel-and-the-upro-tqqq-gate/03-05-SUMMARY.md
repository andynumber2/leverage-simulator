---
phase: 03-simulation-kernel-and-the-upro-tqqq-gate
plan: 05
subsystem: bench-harness
tags: [typescript, vitest, benchmarking, gc, typed-arrays]

requires:
  - phase: 03-simulation-kernel-and-the-upro-tqqq-gate
    plan: 01
    provides: runBacktest, KernelSeries/KernelParams/KernelOutputs/KernelResult, and the
      loadBundleFromDisk/buildKernelInputs data-layer seam PERF-02 now measures
provides:
  - readProductionKernelSeries / ProductionKernelSeriesPayload, the Node-side bridge that hands
    the browser bench context a real bundled SPX series across the structured-clone boundary
  - PERF-02 measured against the production kernel and the real ~25,000-bar bundle
  - tests/kernel/allocation.test.ts, SIM-11's forced-collection heap-delta proof plus a
    batch-flatness cross-check
affects: [phase-07-sweep-worker]

actuals:
  tokens: 24500
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Node-side browser-command bridge for real data: readProductionKernelSeries follows
      readBundleBytes's exact shape (decode Node-side, convert to plain arrays, register in
      vitest.config.ts's browser.commands, rebuild typed-array views browser-side outside the
      timed region)"
    - "vitest@4.1.10 project-level `execArgv` (not a nested `poolOptions.forks.execArgv`, which
      does not exist in this installed version) is how a project's worker processes receive
      Node flags like --expose-gc"

key-files:
  created:
    - bench/kernel-series-bridge.ts
    - tests/kernel/allocation.test.ts
  modified:
    - bench/kernel.bench.test.ts
    - bench/kernel.ts
    - bench/browser-commands.d.ts
    - vitest.config.ts

key-decisions:
  - "SPX_ENTRY_DATE fixed at the series' own first supported bar (1927-12-30) so the measured
    PERF-02 window spans the full committed history (24,772 bars) rather than a shorter slice"
  - "financingSpreadPercent/expenseRatioPercent chosen (0.5/0.95) to reproduce the Phase 1
    spike's exact fractions (0.005/0.0095) through buildKernelInputs's percent-to-fraction
    conversion, so switching kernels does not also change the cost profile being measured"
  - "vitest 4's poolOptions.forks.execArgv does not exist (verified against the installed
    package's own type declarations and pool-spawn source); used the equivalent top-level
    execArgv field instead, which vitest 4 threads directly into the forked worker's execArgv"

patterns-established:
  - "GC-pressure proof: force collection at a fixed interval inside a 10,000-call loop (not only
    at its ends), because V8's old-generation collector prefers an idle thread and a tight
    synchronous loop never idles"

requirements-completed: [SIM-10, SIM-11, PERF-02]

coverage:
  - id: D1
    description: "PERF-02 measures runBacktest from src/kernel/backtest.ts over the real
      ~25,000-bar bundled history, not runSpikeBacktest over a synthetic series, and its
      recorded MeasurementRow.source is production"
    requirement: PERF-02
    verification:
      - kind: other
        ref: "npm run bench (PERF-02 row: source=production, measured=0.22ms, budget=16ms,
          verdict=pass, barCount=24772, seriesId=SPX/price-return); .bench/bench-results.json
          row confirms source=production"
        status: pass
    human_judgment: false
  - id: D2
    description: "npm run bench:selftest still exits non-zero on the deliberately over-budget
      fixture, proving the gate is still live"
    requirement: PERF-02
    verification:
      - kind: other
        ref: "npm run bench:selftest exits 1, assertRunInvariants throws naming PERF-05 as
          failing budget (re-run independently after Task 2's vitest.config.ts change)"
        status: pass
    human_judgment: false
  - id: D3
    description: "10,000 back-to-back runBacktest calls against the same preallocated buffers
      leave heapUsed within a documented tolerance, with global.gc() forced at fixed intervals
      inside the loop"
    requirement: SIM-11
    verification:
      - kind: unit
        ref: "tests/kernel/allocation.test.ts#runBacktest performs 10,000 real invocations into
          reused buffers with no net heap growth after forced collection"
        status: pass
    human_judgment: false
  - id: D4
    description: "Per-call time at batch size 5,000 is not more than 1.5x per-call time at batch
      size 500, the flatness a genuinely allocation-free call produces"
    requirement: SIM-11
    verification:
      - kind: unit
        ref: "tests/kernel/allocation.test.ts#per-call cost stays flat from batch size 500 to
          batch size 5000 (no per-call allocation signature)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The heap-delta guard fails loud (naming --expose-gc) rather than skipping when
      globalThis.gc is unavailable"
    requirement: SIM-11
    verification:
      - kind: other
        ref: "Manually removed vitest.config.ts's execArgv entry and re-ran
          npm run test -- tests/kernel/allocation.test.ts: failed naming --expose-gc, did not
          skip. Entry restored and re-verified passing afterward."
        status: pass
    human_judgment: false
  - id: D6
    description: "bench/kernel.ts remains in the tree solely as PERF-03's sweep-cell workload
      and its header says so; no correctness or PERF-02 claim rests on it"
    requirement: SIM-10
    verification:
      - kind: other
        ref: "bench/kernel.ts header comment rewritten; grep -c runSpikeBacktest
          bench/kernel.bench.test.ts returns 0, grep -c runBacktest returns 4"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-08-18
status: complete
---

# Phase 03 Plan 05: PERF-02 Handover and the SIM-11 Heap-Delta Proof Summary

**PERF-02 now measures `runBacktest` against the real ~25,000-bar bundled SPX history instead of the Phase 1 spike against synthetic data, and SIM-11's no-GC-pressure claim is proven by a forced-collection heap-delta measurement over 10,000 real invocations plus a batch-flatness cross-check.**

## Performance

- **Duration:** 25 min
- **Tasks:** 2
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- `bench/kernel-series-bridge.ts` decodes the committed bundle Node-side (via `loadBundleFromDisk`/`buildKernelInputs`) and hands the browser bench context a real SPX price-return series (leverage 3, dividendReinvest false, full history from 1927-12-30) as a plain-array payload across the structured-clone boundary, registered as `vitest.config.ts`'s `readKernelSeries` browser command.
- `bench/kernel.bench.test.ts` rebuilds the payload into `Float64Array`/`Int32Array`/`Uint8Array` views outside the timed region and measures `runBacktest` from `src/kernel/backtest.ts`, recording `MeasurementRow.source = 'production'`. Measured result: 0.22ms normalized against the 16ms budget, well clear of the D-20 70% escalation trigger, barCount 24772 (above the required 24000), seriesId `SPX/price-return`.
- `bench/kernel.ts`'s header now records that it is no longer the PERF-02 subject and survives solely as PERF-03's sweep-cell workload until Phase 7 replaces it.
- `tests/kernel/allocation.test.ts` proves SIM-11 with two independent signals: a heap-delta measurement over 10,000 `runBacktest` calls into one set of preallocated buffers (collection forced every 1,000 iterations, not only at the ends, since V8's old-generation collector prefers an idle thread), and a batch-flatness cross-check (`measureBatchedMinOfN` at 500 vs 5000) asserting per-call cost does not grow super-linearly.
- `vitest.config.ts`'s `unit` project gained an `execArgv: ['--expose-gc']` entry so `npm run test` keeps being the single command that runs the allocation suite.

## Task Commits

1. **Task 1: Measure PERF-02 against the production kernel and the real bundled history** - `e3441fe` (feat)
2. **Task 2: Prove SIM-11's no-GC-pressure claim with a forced-collection heap delta and a batch-flatness cross-check** - `305e6bd` (test)

## Files Created/Modified

- `bench/kernel-series-bridge.ts` - Node-side loader converting the real bundle into a `ProductionKernelSeriesPayload`
- `bench/kernel.bench.test.ts` - PERF-02 rewired onto `runBacktest` and the real bundled series
- `bench/kernel.ts` - header comment updated to record its sole remaining role (PERF-03's sweep workload)
- `bench/browser-commands.d.ts` - `readKernelSeries` command type added (deviation, see below)
- `vitest.config.ts` - `readKernelSeries` browser command registered; `unit` project gained `execArgv: ['--expose-gc']`
- `tests/kernel/allocation.test.ts` - the SIM-11 heap-delta and batch-flatness proof

## Decisions Made

See `key-decisions` in the frontmatter. The load-bearing one is the `poolOptions` correction: the plan specified `poolOptions.forks.execArgv`, but that key does not exist in the installed `vitest@4.1.10` (confirmed against its own `.d.ts` declarations and the pool-spawn source in `node_modules/vitest/dist/chunks/cli-api.*.js`, which reads `project.config.execArgv` directly). The equivalent, currently-supported field is a top-level `execArgv` on the project's `test` block.

## Deviations from Plan

**1. [Rule 3 - blocking issue] `bench/browser-commands.d.ts` gained a `readKernelSeries` type declaration**

- **Found during:** Task 1
- **Issue:** `commands.readKernelSeries()` typed as `never` without a matching entry in the `BrowserCommands` module augmentation, exactly the problem this file's own header comment documents for every other command.
- **Fix:** added a `readKernelSeries` entry following the file's existing pattern (one doc comment per command, referencing the task and requirement it backs).
- **Files modified:** `bench/browser-commands.d.ts` (not listed in the plan's `files_modified`)
- **Verification:** `npm run typecheck` exits 0
- **Committed in:** `e3441fe`

**2. [Rule 1 - bug] `poolOptions.forks.execArgv` replaced with the top-level `execArgv` field**

- **Found during:** Task 2
- **Issue:** the plan's action text specifies adding a `poolOptions` entry to the `unit` project supplying `--expose-gc` via `execArgv` on the `forks` pool. `poolOptions` does not exist anywhere in `vitest@4.1.10`'s type declarations or runtime source; the config key was renamed/flattened in this major version.
- **Fix:** used the equivalent, currently-supported top-level `execArgv: ['--expose-gc']` field on the `unit` project's `test` block, verified to reach the forked worker process by reading `vitest`'s own pool-spawn code (`project.config.execArgv` feeds directly into the fork's `execArgv`).
- **Files modified:** `vitest.config.ts`
- **Verification:** `globalThis.gc` is a function inside the unit-project test process; removing the entry makes the suite fail naming `--expose-gc` (not skip); restoring it makes the suite pass again. `npm run test` (343 tests) and `npm run bench` both green afterward.
- **Committed in:** `305e6bd`

---

**Total deviations:** 2 (1 blocking-issue auto-fix, 1 bug auto-fix). No architectural deviation; no PERF budget row or threshold touched; `src/` untouched by this plan.

## Issues Encountered

None beyond the two deviations above, both resolved inline per the executor's Rule 1/Rule 3 discretion.

## Verification at Close-Out

| Check | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run bench` | exit 0; PERF-02 row source=production, measured=0.22ms, budget=16ms, verdict=pass, escalate=no |
| `.bench/bench-results.json` PERF-02 row | `source: 'production'` |
| `grep -c runSpikeBacktest bench/kernel.bench.test.ts` | 0 |
| `grep -c runBacktest bench/kernel.bench.test.ts` | 4 |
| `npm run bench:selftest` | exit 1 (gate still live) |
| `npm run test -- tests/kernel/allocation.test.ts` | 2 passed |
| `npm run test` (full unit project) | 343 passed |
| Removing `vitest.config.ts`'s `execArgv` entry | allocation suite fails naming `--expose-gc`, does not skip; entry restored |
| `git diff <base>..HEAD -- src/ perf-budgets.ts` | empty (no changes) |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- PERF-02 is now denominated against the shipping kernel and the real committed bundle; no later plan needs to repeat this handover.
- SIM-11's no-allocation contract has a mechanical, non-skippable proof in `tests/kernel/allocation.test.ts`.
- `bench/kernel.ts` (`runSpikeBacktest`, `paramsForCell`) remains live for PERF-03's sweep workload; Phase 7 replaces it when it builds the real sweep worker.

---
*Phase: 03-simulation-kernel-and-the-upro-tqqq-gate*
*Completed: 2026-08-18*
