---
phase: 07-sweep-engine-and-the-heatmap
plan: 05
subsystem: viz
tags: [sweep, cancellation, generation-token, progressive-paint, coarse-to-fine, worker-pool, perf-bench]

requires:
  - phase: 07-sweep-engine-and-the-heatmap
    plan: 01
    provides: "src/sweep/sweep-pool.ts's persistent Worker pool, src/app/state.ts's ResultMode/sweepGrid/scheduleSweep, and paint-contour.ts's grid-size-agnostic paintSweepField"
provides:
  - "src/sweep/sweep-pool.ts: isStaleGeneration/mergeChunkResult (pure, exported for direct testing), SweepRunHandle, generation-gated cancellation, chunk-failure degradation to CELL_FLAG_INCOMPLETE, dispose()"
  - "src/app/state.ts: coarse-then-full progressive sweep painting (D-12/D-13/D-14), COARSE_COL_STRIDE/COARSE_ROW_STRIDE/strideIndices, coarseSweepGrid/sweepGeneration/sweepFailedCellCount/displayedMetric/setDisplayedMetric/crosshairCell/setCrosshairCell signals, live re-sweep-on-drag wiring in updateBacktestRequest (D-32)"
  - "bench/sweep-progressive.bench.test.ts: the sole PERF-04 and PERF-06 recorder"
affects: [07-06, 07-07, 07-08]

actuals:
  tokens: 16835
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Cancellation as a monotonic generation counter compared inside a pure merge function (mergeChunkResult), never a pool teardown -- the ONLY thing standing between an arriving chunk and the live grid is one integer comparison, directly testable with no pool, no Worker and no browser"
    - "A chunk-level failure (timeout or worker error) degrades to CELL_FLAG_INCOMPLETE cells and a counter rather than rejecting the whole sweep, routed through the exact same generation-gated merge path a successful chunk uses"
    - "Two-stage progressive paint through ONE existing reactive signal (sweepGrid): the coarse pass and the full pass both write the SAME signal in sequence, so the canvas-painting component needs zero changes -- a second signal (coarseSweepGrid) exists purely for introspection, never drives the canvas itself"

key-files:
  created:
    - tests/sweep/cancellation.test.ts
    - tests/app/sweep-progressive.browser.test.ts
    - bench/sweep-progressive.bench.test.ts
  modified:
    - src/sweep/sweep-pool.ts
    - src/app/state.ts
    - tests/app/sweep-tracer.browser.test.ts

key-decisions:
  - "SweepRunRequest.rowIndices is optional and generalizes the merge path to an arbitrary-size target grid (grid.cols/grid.rows drive every index computation instead of the hardcoded SWEEP_COLS/SWEEP_ROWS), which is what lets the SAME runSweep serve both the coarse pass's 51x14 grid and the full pass's 200x50 grid with no branching"
  - "The coarse and full passes of one sweep share ONE generation number (bumped once, in state.ts, before either pool.runSweep call) -- isStaleGeneration treats equal generations as current, not stale, so the full pass's own chunks still merge after the coarse pass has already 'spent' that generation bumping the pool's currentGeneration"
  - "sweepGrid() is written twice per sweep (coarse, then full) rather than introducing a second signal HeatmapPanel.tsx would need to read -- HeatmapPanel.tsx required zero changes, staying entirely outside this plan's declared files_modified, because paintSweepField is already grid-size agnostic (F-07, plan 07-01)"
  - "PERF-06's bench measurement uses a deliberately small (1 column x 1 row, single-worker) but still fully real grid/pool/bundle, matching bench/sweep.bench.test.ts's own SERIAL_REFERENCE_SAMPLE_COUNT precedent for a reduced-but-real correctness sample -- a full 200x50 cancel-storm at the batch size needed to clear the 10ms timer floor would have spent tens of seconds of real background compute for no additional proof value, since what PERF-06 measures is the O(1) main-thread bump, not sweep throughput"

patterns-established:
  - "Pattern: a pool-level failure counter (failedCellCount) is summed by the caller across a sweep's multiple pool.runSweep calls (coarse + full), rather than the pool itself tracking cross-call state -- keeps each runSweep call's own return value a complete, self-contained answer"

requirements-completed: [PERF-04, PERF-06]

coverage:
  - id: D1
    description: "A parameter change during an in-flight sweep bumps the generation and returns within one frame; the pool is never torn down and no worker is reconstructed to cancel"
    requirement: PERF-06
    verification:
      - kind: unit
        ref: "tests/sweep/cancellation.test.ts -- 50 consecutive generation bumps leave a constant worker count and construct no new Worker"
        status: pass
      - kind: automated_ui
        ref: "tests/app/sweep-progressive.browser.test.ts -- a holding-period change bumps sweepGeneration() within a single animation frame (elapsed < 100ms)"
        status: pass
      - kind: other
        ref: "bench/sweep-progressive.bench.test.ts PERF-06 -- 0.0126ms normalized against the 16ms budget (0.08%), asserting no Worker was constructed during the cancel storm"
        status: pass
    human_judgment: false
  - id: D2
    description: "A chunk result carrying a stale generation is discarded on arrival and never merged into the live grid"
    requirement: PERF-06
    verification:
      - kind: unit
        ref: "tests/sweep/cancellation.test.ts -- a stale-generation chunk result fed directly into mergeChunkResult leaves the target grid byte-identical"
        status: pass
      - kind: other
        ref: "bench/sweep-progressive.bench.test.ts PERF-06 -- a real superseded sweep's grid is asserted to carry generation 0 and zero touched cells"
        status: pass
    human_judgment: false
  - id: D3
    description: "The first paint is a COMPLETE low-resolution contour field, never a partially-filled grid, painting within PERF-04's 100ms, and the full grid replaces it whole when it resolves"
    requirement: PERF-04
    verification:
      - kind: automated_ui
        ref: "tests/app/sweep-progressive.browser.test.ts -- the coarse pass's axis endpoints match the full pass's, and the DOM's own element shape is identical before/after the coarse paint (no progress affordance)"
        status: pass
      - kind: other
        ref: "bench/sweep-progressive.bench.test.ts PERF-04 -- 23.50ms normalized against the 100ms budget (23.5%), asserting the coarse grid is complete (zero holes) before trusting the figure"
        status: pass
    human_judgment: false
  - id: D4
    description: "No spinner, progress bar, percentage or live cell count anywhere in sweep mode; a mid-sweep parameter change never blanks the canvas"
    requirement: PERF-04
    verification:
      - kind: automated_ui
        ref: "tests/app/sweep-progressive.browser.test.ts -- no [role=\"progressbar\"], no [aria-busy=\"true\"], and the canvas is never uniform-blank on the frame after a mid-sweep parameter change"
        status: pass
    human_judgment: false

duration: 30min
completed: 2026-08-23
status: complete
---

# Phase 07 Plan 05: Coarse-to-Fine Progressive Sweep with Generation Cancellation Summary

**Sweep cancellation is now an O(1) generation comparison rather than a pool teardown, and every sweep paints a complete low-resolution field within 100ms before refining to the full grid, with PERF-04 and PERF-06 measured at 23.5% and 0.08% of budget respectively.**

## Performance

- **Duration:** ~30min
- **Tasks:** 3
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments

- `src/sweep/sweep-pool.ts` now tracks its own monotonic `currentGeneration`, bumped synchronously the moment a new sweep starts (`runSweep`, before any `await`), so a caller starting a new sweep never waits on a prior in-flight generation and never tears down or reconstructs a Worker to cancel. `isStaleGeneration`/`mergeChunkResult` are pure functions standing between every arriving chunk and the live grid, directly provable in the Node `unit` project with no pool, no Worker and no browser.
- A chunk whose worker call times out or fails now degrades to `CELL_FLAG_INCOMPLETE` cells and a `failedCellCount` counter rather than rejecting the whole sweep -- routed through the identical generation-gated merge every successful chunk uses, so a stale failure can't corrupt a live grid either.
- `runSweepNow` (`src/app/state.ts`) splits every sweep into a coarse pass (51x14, every 4th column/row plus the last, `COARSE_COL_STRIDE`/`COARSE_ROW_STRIDE`) and a full pass (200x50), sharing one generation number. The coarse pass paints a complete field first; the full pass replaces it whole once resolved. `HeatmapPanel.tsx` needed zero changes -- both passes write the same `sweepGrid()` signal it already repaints on.
- `updateBacktestRequest` now also calls `scheduleSweep()` when sweep mode is active, so dragging the holding-period control re-sweeps live and cancels the prior sweep per D-32 -- proven in the browser test with a real DOM click, not a direct store write.
- `bench/sweep-progressive.bench.test.ts` is the sole PERF-04/PERF-06 recorder, both measured against the real bundle through the real production pool, each with its own correctness assertion (coarse-grid completeness; stale-chunk-never-merged plus no-Worker-constructed) running before its stopwatch.

## Task Commits

Each task was committed atomically:

1. **Task 1: Cancel a sweep by generation, never by tearing down the pool** - `df69ff0` (feat)
2. **Task 2: Paint a complete coarse field first, then refine, with no flash and no spinner** - `5e0a858` (feat)
3. **Task 3: Measure PERF-04 and PERF-06 against the shipped path** - `2f0ecb7` (test)

## Files Created/Modified

- `src/sweep/sweep-pool.ts` - `isStaleGeneration`, `mergeChunkResult`, `SweepRunHandle`, `dispose()`, generalized `SweepRunRequest.rowIndices`, chunk-failure degradation
- `src/app/state.ts` - Coarse-then-full progressive paint, `COARSE_COL_STRIDE`/`COARSE_ROW_STRIDE`/`strideIndices`, `coarseSweepGrid`/`sweepGeneration`/`sweepFailedCellCount`/`displayedMetric`/`setDisplayedMetric`/`crosshairCell`/`setCrosshairCell`, live re-sweep wiring in `updateBacktestRequest`
- `tests/sweep/cancellation.test.ts` - New: pure merge-path proofs plus pool-level 50-cycle/chunk-failure behavior tests
- `tests/app/sweep-progressive.browser.test.ts` - New: coarse-endpoint proof, DOM-stability proof, canvas-never-blank proof, generation-bump-timing proof
- `bench/sweep-progressive.bench.test.ts` - New: PERF-04 and PERF-06 measurement
- `tests/app/sweep-tracer.browser.test.ts` - Deviation fix: `waitFor` now targets the full 200x50 grid specifically (see Deviations)

## Decisions Made

- **`SweepRunRequest.rowIndices` is optional and generalizes the merge path.** `grid.cols`/`grid.rows` drive every index computation instead of the hardcoded `SWEEP_COLS`/`SWEEP_ROWS`, which is what lets one `runSweep` implementation serve both the coarse pass's 51x14 grid and the full pass's 200x50 grid with no branching.
- **The coarse and full passes share one generation number.** `isStaleGeneration` treats equal generations as current, not stale, so the full pass's own chunks still merge after the coarse pass has already "spent" that generation bumping the pool's `currentGeneration`.
- **`sweepGrid()` is written twice per sweep rather than introducing a signal `HeatmapPanel.tsx` would need to read.** `HeatmapPanel.tsx` required zero changes and stayed entirely outside this plan's `files_modified`, because `paintSweepField` is already grid-size agnostic (F-07, plan 07-01). `coarseSweepGrid` is a second, introspection-only signal for later plans, never wired to the canvas itself.
- **PERF-06's bench measurement uses a deliberately small (1x1, single-worker) but still fully real grid/pool/bundle.** Matches `bench/sweep.bench.test.ts`'s own `SERIAL_REFERENCE_SAMPLE_COUNT` precedent for a reduced-but-real correctness sample. A full 200x50 cancel-storm at the batch size needed to clear the 10ms timer floor would have spent tens of seconds of real background compute for no additional proof value -- what PERF-06 measures is the O(1) main-thread bump, not sweep throughput.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `tests/app/sweep-tracer.browser.test.ts`'s `waitFor` assumed single-stage sweep resolution**
- **Found during:** Task 2
- **Issue:** This plan 07-01 test waited for `sweepGrid() !== null` and immediately asserted `grid.cols === 200`. Once `sweepGrid()` legitimately resolves in two stages (coarse 51x14, then full 200x50), the test's `waitFor` could observe the coarse grid first and fail the `cols === 200` assertion.
- **Fix:** `waitFor` now waits for `sweepGrid() !== null && sweepGrid()!.cols === 200 && sweepGrid()!.rows === 50` specifically, which is what the test's own subsequent assertions are actually about.
- **Files modified:** `tests/app/sweep-tracer.browser.test.ts`
- **Verification:** `npm run test:app -- --run tests/app/sweep-tracer.browser.test.ts` green (3/3 tests)
- **Committed in:** `5e0a858` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** The fix preserves the plan-07-01 test's actual intent (proving a real 200x50 sweep paints) while accommodating this plan's own, deliberate two-stage resolution change. No scope creep.

## Issues Encountered

**Bench floor tuning (not a deviation, routine measurement work):** PERF-06's initial 20-call batch measured 0.2ms total, far below `MIN_MEASUREMENT_MS`'s 10ms floor -- resolved with the same auto-doubling batch pattern `bench/decode-time.bench.test.ts` already establishes, converging at batch size 1600.

## User Setup Required

None - no external service configuration required.

## Known Issues (pre-existing, out of scope)

`tests/app/static-build.test.ts`, `bench/perf-07.bench.test.ts` and `bench/perf-08.bench.test.ts` all fail in this worktree because `dist/` does not exist (`npm run build` has not been run). This is a pre-existing environment gap, not caused by any change in this plan -- confirmed present before Task 1 started, and confirmed unrelated by running an existing bench file (`heatmap-form-2`) in isolation, which hits the identical `dist/`-dependent teardown warning independent of this plan's files. `npm run typecheck`, `npm run test` (all other tests), `npm run test:app` (all other tests) and this plan's own `bench/sweep-progressive.bench.test.ts` (both PERF-04 and PERF-06, standalone and inside the full `npm run bench` run) are all green.

## Next Phase Readiness

- `coarseSweepGrid`, `sweepGeneration`, `sweepFailedCellCount`, `displayedMetric`/`setDisplayedMetric`, `crosshairCell`/`setCrosshairCell` are all defined and exported from `src/app/state.ts` for plans 07-06 (metric toggle), 07-07 (hover readout/crosshair, caption strip's chunk-failure line) and 07-08 (viewport) to consume.
- `SweepPool.dispose()` exists but is unused in this plan -- a future "leave sweep mode entirely" affordance is the natural caller, per its own doc comment; not wired here since no such affordance exists yet.
- No blockers.

## Self-Check: PASSED

All 6 files this plan created or modified are tracked (`git status --short` shows a clean tree after the final commit): `src/sweep/sweep-pool.ts`, `src/app/state.ts`, `tests/sweep/cancellation.test.ts`, `tests/app/sweep-progressive.browser.test.ts`, `bench/sweep-progressive.bench.test.ts`, `tests/app/sweep-tracer.browser.test.ts`. All three commit hashes this SUMMARY cites (`df69ff0`, `5e0a858`, `2f0ecb7`) are present in `git log`.

---
*Phase: 07-sweep-engine-and-the-heatmap*
*Completed: 2026-08-23*
