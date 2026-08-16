---
phase: 01-performance-spike-and-budget-lock
plan: 02
subsystem: perf-spike
tags: [comlink, web-worker, vitest, browser-mode, performance-budget, typescript]

# Dependency graph
requires:
  - "perf-budgets.ts (plan 01-01): PERF_BUDGETS table, ESCALATION_TRIGGER_RATIO, BENCH_TOTAL_RUNTIME_CAP_MS"
  - "bench/calibration.ts, bench/report.ts, bench/environment-block.ts (plan 01-01): measure -> normalize -> record -> assert chain"
  - "bench/accumulator-store.ts, bench/global-setup.ts, vitest.config.ts (plan 01-01): browser-to-Node filesystem bridge, extended in this plan"
provides:
  - "bench/synthetic-data.ts: deterministic seeded 25,000-bar GBM series (mulberry32 + Box-Muller, documented for a bit-identical Rust port in plan 01-04)"
  - "bench/kernel.ts: runSpikeBacktest, the allocation-free branchy per-bar leveraged recurrence — the one recurrence implementation the JS spike arm uses everywhere"
  - "bench/sweep.worker.ts / bench/sweep-pool.ts: a real Comlink Worker pool sweeping 10,000 cells with transferred (not cloned) result buffers"
  - "npm run bench: two more real measured rows — PERF-02 (single backtest) and PERF-03 (full sweep), both source=spike-synthetic"
  - "bench/accumulator-store.ts's recordInfoLine bridge: a general free-text stdout-reporting escape hatch for future *.bench.test.ts files, beyond the typed MeasurementRow shape"
affects: [03-simulation-kernel, 07-sweep-engine]

# Actuals (#2632)
actuals:
  tokens: 8825
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Exactly one recurrence implementation (runSpikeBacktest) is imported by every arm that runs a backtest — the bench test, the worker, and the serial reference — never duplicated"
    - "Comlink.transfer(buffer, [buffer]) used in both directions of the worker boundary (main->worker request buffer, worker->main response buffer), not just one, since PITFALLS F3's copy-stall risk applies to both directions of postMessage traffic"
    - "A shared pull-based work queue (drainQueue) across all workers, not a fixed per-worker chunk assignment, so a worker that finishes early immediately picks up the next unclaimed chunk instead of idling"
    - "Fresh workers constructed inside every runSpikeSweep call, not pooled/reused across measureMinOfN repeats, so worker-construction cost is included in every repeat of the measured figure, not hidden after the first"

key-files:
  created:
    - bench/synthetic-data.ts
    - bench/kernel.ts
    - bench/kernel.bench.test.ts
    - tests/kernel.test.ts
    - bench/sweep.worker.ts
    - bench/sweep-pool.ts
    - bench/sweep.bench.test.ts
  modified:
    - bench/accumulator-store.ts
    - bench/browser-commands.d.ts
    - bench/global-setup.ts
    - vitest.config.ts

key-decisions:
  - "Sweep cell -> params mapping (paramsForCell in bench/kernel.ts) sweeps leverage 1-20 across SWEEP_ROWS and entryIndex 0-199 across SWEEP_COLS, keeping every cell's backtest at 99.2%+ of the full 25,000-bar series — close enough to 'a full sweep is 10,000 backtests over ~25,000 bars each' that PERF-03 is not flattered by artificially short cells, while still giving the pool 10,000 genuinely distinct backtests rather than one repeated 10,000 times"
  - "Serial reference for the pool-vs-serial equality check uses a 50-cell deterministic stride sample (stride 197, coprime with 10,000), not the full grid — a full 10,000-cell serial pass measured independently would add multiple seconds to this bench file alone; the assertion message and this file both say so explicitly, per the plan's own instruction for this case"
  - "Workers are NOT reused across measureMinOfN's 5 repeats — each repeat pays full worker construction + termination cost, so the measured PERF-03 figure includes that cost on every repeat, not just the first"
  - "Added a recordInfoLine browser-to-Node bridge command (bench/accumulator-store.ts, vitest.config.ts, bench/browser-commands.d.ts, bench/global-setup.ts) — see Deviations"

requirements-completed: [PERF-10, PERF-11]

coverage:
  - id: D1
    description: "makeSeededGbmSeries(seed) is deterministic, BAR_COUNT-length (25000), plausible drift/volatility"
    requirement: PERF-10
    verification:
      - kind: unit
        ref: "tests/kernel.test.ts#makeSeededGbmSeries (3 tests: determinism, length, volatility/drift)"
        status: pass
    human_judgment: false
  - id: D2
    description: "runSpikeBacktest carries the branchy recurrence: leverage-1 identity, ruin clamp + absorbing state, calendar-day financing scaling"
    requirement: PERF-10
    verification:
      - kind: unit
        ref: "tests/kernel.test.ts#runSpikeBacktest (5 tests: leverage=1 identity, ruin single-bar, ruin absorbing-state, calendar-day financing, allocation-free repeatability)"
        status: pass
      - kind: other
        ref: "npx vitest run --project unit -t \"ruin\" exits 0 (2 matched tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "npm run bench reports a real measured PERF-02 figure, source=spike-synthetic"
    requirement: PERF-10
    verification:
      - kind: integration
        ref: "npm run bench stdout: PERF-02 | source=spike-synthetic | measured=0.18ms | budget=16ms | verdict=pass"
        status: pass
    human_judgment: false
  - id: D4
    description: "A real Worker pool genuinely partitions and computes all 10,000 cells, proven equal to a serial reference before timing is trusted"
    requirement: PERF-10
    verification:
      - kind: unit
        ref: "bench/sweep.bench.test.ts: full-grid no-NaN/no-holes, determinism across two runs, pool-vs-serial-reference equality (all 3 run and pass before the PERF-03 timing test)"
        status: pass
      - kind: other
        ref: "manual: inverted the pool-vs-serial equality assertion (.not.toBeCloseTo), ran npx vitest run --project bench -t \"serial reference\" -> exit 1 (AssertionError, expected difference 0 but wanted 5e-7); reverted"
        status: pass
    human_judgment: false
  - id: D5
    description: "npm run bench reports a real measured PERF-03 figure, source=spike-synthetic, with resolved worker count and chosen chunk count printed for reproducibility"
    requirement: PERF-10
    verification:
      - kind: integration
        ref: "npm run bench stdout: PERF-03 | source=spike-synthetic | measured=328.81ms | budget=1000ms | verdict=pass, followed by 'PERF-03 sweep: workerCount=8 chunkCount=32'"
        status: pass
    human_judgment: false
  - id: D6
    description: "npm run bench still shows all eight PERF-02..PERF-09 requirement headers; total runtime stays under BENCH_TOTAL_RUNTIME_CAP_MS"
    requirement: PERF-11
    verification:
      - kind: integration
        ref: "npm run bench stdout shows === PERF-02 === through === PERF-09 ===; Total bench runtime: ~2.7-2.9s (cap: 30000ms)"
        status: pass
    human_judgment: false

duration: ~12min
completed: 2026-08-16
status: complete
---

# Phase 1 Plan 2: Kernel and Sweep Spike, Measured Against PERF-02 and PERF-03 Summary

**A real Worker pool genuinely partitions and computes a 10,000-cell leveraged-ETF sweep using a single allocation-free branchy recurrence over a deterministic 25,000-bar synthetic series, replacing research's 150-600ms napkin estimate with a measured ~329ms (normalized) figure on this machine — both PERF-02 (single backtest, ~0.18ms) and PERF-03 (full sweep) now report real, spike-synthetic-labelled numbers in `npm run bench`.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-08-16
- **Tasks:** 2
- **Files:** 7 created, 4 modified

## Accomplishments

- `bench/synthetic-data.ts`: deterministic mulberry32 + trigonometric-Box-Muller seeded GBM series, 25,000 bars, with a header comment precise enough to port bit-for-bit to Rust in plan 01-04 (algorithm, seed constant, state update, normal transform all spelled out)
- `bench/kernel.ts`: `runSpikeBacktest`, the allocation-free per-bar recurrence carrying every branch PITFALLS names — leverage-on-daily-return compounding (never cumulative), financing on the borrowed portion at the calendar-day accrual basis, expense ratio at the flat trading-day accrual basis (deliberately a different basis, not conflated), and a ruin clamp with a true absorbing state (no compounding, no contribution, ever resurrects a ruined position)
- A real Comlink Worker pool (`bench/sweep-pool.ts` + `bench/sweep.worker.ts`): sized to `hardwareConcurrency - 1` (floored at 1), partitions the 10,000-cell sweep into 4-chunks-per-worker with a shared pull queue, transfers (never structured-clones) the result buffer in both directions, times wall-clock from the call to the final cell including worker construction on every repeat
- Correctness proven before any timing is trusted: the pool grid has 10,000 finite cells with no holes, is deterministic across two independent runs with the same seed, and matches a serial-computed reference sample — all three checks run and pass ahead of the PERF-03 timing test in the same file
- Two more real measured rows in `npm run bench`: PERF-02 at ~0.18ms (budget 16ms) and PERF-03 at ~329ms normalized on this machine (budget 1000ms), both `source=spike-synthetic`

## Task Commits

1. **Task 1: Seeded 25,000-bar synthetic series and the branchy per-bar recurrence, measured against PERF-02** - `7c76280` (feat)
2. **Task 2: Real Worker pool sweeps 10,000 cells, measured wall clock to final cell against PERF-03** - `817fd2a` (feat)

## Files Created/Modified

- `bench/synthetic-data.ts` - `BAR_COUNT`, `DEFAULT_SEED`, `SyntheticSeries`, `makeSeededGbmSeries`
- `bench/kernel.ts` - `SWEEP_COLS`/`SWEEP_ROWS`, `SpikeKernelParams`, `SpikeKernelResult`, `runSpikeBacktest`, `paramsForCell` (shared cell->params mapping, additional export beyond the plan's literal list)
- `bench/kernel.bench.test.ts` - PERF-02 measurement
- `tests/kernel.test.ts` - determinism, length, volatility/drift, leverage=1 identity, ruin clamp + absorbing state, calendar-day financing scaling, allocation-free repeatability
- `bench/sweep.worker.ts` - Comlink-exposed `runChunk`, transfers result buffer both directions
- `bench/sweep-pool.ts` - `resolveWorkerCount`, `runSpikeSweep`, shared pull-queue dispatch
- `bench/sweep.bench.test.ts` - correctness assertions (full grid, determinism, serial reference) then PERF-03 measurement
- `bench/accumulator-store.ts` - added `persistInfoLine`/`loadInfoLines` (see Deviations)
- `bench/browser-commands.d.ts` - added `recordInfoLine` command type augmentation (see Deviations)
- `bench/global-setup.ts` - prints accumulated info lines after the measurement table (see Deviations)
- `vitest.config.ts` - added `recordInfoLine` browser command implementation (see Deviations)

## Decisions Made

- **Sweep cell mapping (`paramsForCell`)**: leverage sweeps 1-20 across the 50 rows, entry index sweeps across only the first 200 of 25,000 bars across the 200 columns. This keeps every cell's backtest length at 99.2%+ of the full series (24,801-25,000 bars), so the measured PERF-03 figure reflects something close to "10,000 backtests over ~25,000 bars each" rather than being artificially cheapened by short backtests, while still giving the pool 10,000 genuinely different (not repeated) cells so ruin and varied compute paths are actually exercised.
- **Serial reference is a 50-cell stride sample, not the full grid.** A full 10,000-cell serial (unpartitioned, unparallelized) pass would add multiple seconds to this bench file's own runtime on top of every other arm registered so far, pushing toward `BENCH_TOTAL_RUNTIME_CAP_MS` (30s). The sample uses a stride (197, coprime with 10,000) that visits distinct rows and columns rather than one contiguous block, so a partitioning-order bug would still likely be caught. Both the assertion's own test name and this SUMMARY say a subset was used, per the plan's explicit instruction for this tradeoff.
- **Workers are not reused across `measureMinOfN`'s 5 repeats.** Each of the 5 repeats constructs a fresh pool of `resolveWorkerCount()` (8, on this machine's 9-core environment) Workers and terminates them at the end of that repeat. Worker construction is therefore included in every repeat's timing, not hidden after a warm-up — this was one of the costs research explicitly hand-waved, and D-10 exists to surface it rather than let a reused-pool measurement understate real first-sweep cost.
- **Chunk count: `workerCount * 4`** (32 chunks across 8 workers on this machine). Each worker pulls the next unclaimed chunk from a shared queue rather than being assigned a fixed slice up front, so a chunk that happens to land more high-leverage (and therefore more ruin-clamp-branch-heavy) cells does not strand that one worker while the others sit idle — the queue naturally rebalances.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added a `recordInfoLine` browser-to-Node bridge command, touching four files outside this plan's `files_modified` list**
- **Found during:** Task 2, verifying the acceptance criterion "`npm run bench` stdout reports the resolved worker count and the chosen chunk count."
- **Issue:** A plain `console.log` inside `bench/sweep.bench.test.ts` (a browser-context test) does not reach `npm run bench`'s stdout under Vitest's default (non-verbose) reporter — verified empirically: the identical `console.log` call is visible only when running with `--reporter=verbose`, and this project's `bench` npm script does not pass that flag. This is architecturally the same class of problem plan 01-01 already solved for measurement rows and the environment block (browser-context state does not reliably reach the Node-side process through ordinary channels in this Vitest 4.1.10 browser-mode setup).
- **Fix:** Extended the existing filesystem-backed accumulator bridge (`bench/accumulator-store.ts`) with a narrow, additive `persistInfoLine`/`loadInfoLines` pair for free-text reproducibility lines, a corresponding `commands.recordInfoLine` implementation in `vitest.config.ts`, a type augmentation in `bench/browser-commands.d.ts`, and a print step in `bench/global-setup.ts`'s teardown (after the main table, only when at least one info line was recorded this run). `bench/sweep.bench.test.ts` calls `commands.recordInfoLine('PERF-03-sweep', ...)` instead of `console.log`.
- **Files modified:** `bench/accumulator-store.ts`, `bench/browser-commands.d.ts`, `bench/global-setup.ts`, `vitest.config.ts` (all outside this plan's declared `files_modified`, all from plan 01-01).
- **Verification:** `npm run bench` stdout now shows `PERF-03 sweep: workerCount=8 chunkCount=32` after the measurement table; `npm run typecheck` exits 0.
- **Committed in:** `817fd2a` (Task 2 commit).

**2. [Rule 1 - Bug] Removed a stale Vitest browser-mode failure screenshot before committing**
- **Found during:** Task 2, after the deliberate temporary inversion of the pool-vs-serial-reference assertion (run to confirm the acceptance criterion "inverting that assertion makes `npm run bench` exit non-zero"), which produced a failure screenshot under `bench/__screenshots__/`.
- **Fix:** Deleted `bench/__screenshots__/` before staging (it is also gitignored via the existing `**/__screenshots__/` pattern from plan 01-01, so this was housekeeping, not a tracked-file leak).
- **Files modified:** none tracked; directory removed from the working tree.
- **Verification:** `git status --short` after cleanup shows no `__screenshots__` entries.
- **Committed in:** not committed (untracked, gitignored; removed before Task 2's commit).

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug). The blocking deviation was necessary for the plan's own explicit acceptance criterion ("stdout reports the resolved worker count and the chosen chunk count") to actually hold under this project's real Vitest browser-mode reporter behavior — not scope creep beyond what that criterion required.
**Impact on plan:** No plan acceptance criterion was reduced or skipped. `paramsForCell` was added as an additional export from `bench/kernel.ts` beyond the plan's literal export list, purely to give the worker, the pool, and the serial-reference test one shared cell-to-params mapping rather than three copies of the same logic.

## Issues Encountered

None beyond the deviation above (the reporter/stdout behavior), which was discovered and resolved during Task 2's own verification, not deferred.

## User Setup Required

None. This plan adds no new dependency, no new external service, and no new environment variable.

## Next Phase Readiness

- Plan 01-03 and 01-04 (remaining Phase 1 plans) can proceed; nothing in this plan blocks them.
- `bench/kernel.ts`'s `runSpikeBacktest` and `bench/synthetic-data.ts`'s `makeSeededGbmSeries` are the shared surface plan 01-04's Rust port must reproduce bit-for-bit — the header comments in both files document exactly what needs porting (PRNG algorithm/seed/state update/normal transform in `synthetic-data.ts`; the recurrence formula and day-count conventions in `kernel.ts`).
- The measured PERF-03 figure on this sandbox (~329ms normalized, 8 workers, 32 chunks, 9 logical cores) sits comfortably under the 1000ms budget and lands inside research's original 150-600ms pooled estimate — a first genuine data point for plan 01-04's Key Decisions on the WASM-vs-plain-JS question, though it is `spike-synthetic`, not a production figure, and this sandbox's core count may not match the D-17 `ubuntu-latest` CI baseline.
- `bench/accumulator-store.ts`'s new `persistInfoLine`/`loadInfoLines` pair is available to any future `*.bench.test.ts` file that needs a free-text reproducibility line in stdout beyond what `MeasurementRow`'s typed shape carries.

## Self-Check: PASSED

All 11 claimed files verified present on disk (`bench/synthetic-data.ts` through `vitest.config.ts`). Both claimed commit hashes (`7c76280`, `817fd2a`) verified present in `git log --oneline --all`.

---
*Phase: 01-performance-spike-and-budget-lock*
*Completed: 2026-08-16*
