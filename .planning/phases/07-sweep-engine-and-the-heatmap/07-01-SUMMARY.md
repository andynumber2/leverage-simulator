---
phase: 07-sweep-engine-and-the-heatmap
plan: 01
subsystem: viz
tags: [solid-js, comlink, web-worker, canvas, marching-squares, sweep, heatmap]

requires:
  - phase: 06-heatmap-design-pass
    provides: "iso-lines.ts/field-sampler.ts geometry, form-2-filled-contour design (D-02), the BAND_LEVELS/hatch/caveat constants"
  - phase: 03-kernel-and-costs
    provides: "runBacktest, buildKernelInputs, the KernelSeries/KernelParams/KernelOutputs contract"
provides:
  - "src/heatmap/ (iso-lines, field-sampler, hatch-pattern, sweep-copy, paint-contour): the shared geometry/render modules both the Phase 6 mockups and production now consume"
  - "src/sweep/ (sweep-grid, resolve-column-series, sweep.worker, sweep-pool): the live sweep engine -- grid geometry, per-column series resolution, the Worker chunk runner, and the persistent pool"
  - "ResultMode/resultMode/setResultMode/sweepGrid/scheduleSweep in src/app/state.ts, wired into App.tsx behind a minimal toggle"
  - "HeatmapPanel.tsx: the Solid mount that paints a live SweepGrid via paintSweepField"
affects: [07-02, 07-03, 07-04, 07-05, 07-06, 07-07, 07-08, 07-09, 07-10]

actuals:
  tokens: 29100
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "src/ never imports a VALUE from .planning/ -- only a type, or nothing. Two deviations from the plan's literal instructions (fixtureRowForLeverage staying behind, FORM_2_GEOMETRY not being imported) both trace back to this one rule"
    - "sweep.worker.ts and sweep-pool.ts share layout/geometry constants (chunkBufferByteLength, SWEEP_COLS/ROWS) via sweep-grid.ts rather than importing each other as values, so neither side ever pulls Comlink.expose's module-load side effect onto the wrong global scope"
    - "A live, mutable SweepGrid drives a Solid signal via { equals: false } rather than cloning a 10,000-cell typed-array structure on every completed sweep"

key-files:
  created:
    - src/heatmap/iso-lines.ts
    - src/heatmap/field-sampler.ts
    - src/heatmap/hatch-pattern.ts
    - src/heatmap/sweep-copy.ts
    - src/heatmap/paint-contour.ts
    - src/sweep/sweep-grid.ts
    - src/sweep/resolve-column-series.ts
    - src/sweep/sweep.worker.ts
    - src/sweep/sweep-pool.ts
    - src/app/components/ResultColumn/HeatmapPanel.tsx
    - tests/sweep/column-series.test.ts
    - tests/app/sweep-tracer.browser.test.ts
  modified:
    - .planning/phases/06-heatmap-design-pass/mockups/shared/mockup-runtime.ts
    - .planning/phases/06-heatmap-design-pass/mockups/forms/form-1-dense-grid.ts
    - .planning/phases/06-heatmap-design-pass/mockups/forms/form-2-filled-contour.ts
    - .planning/phases/06-heatmap-design-pass/mockups/forms/form-3-small-multiples.ts
    - .planning/phases/06-heatmap-design-pass/mockups/forms/form-4-grid-with-contour.ts
    - tests/iso-lines.test.ts
    - tests/field-sampler.test.ts
    - bench/heatmap-form-2.bench.test.ts
    - src/app/state.ts
    - src/app/App.tsx

key-decisions:
  - "fixtureRowForLeverage graduates alongside integerLeverageTicks into src/heatmap/hatch-pattern.ts, despite the plan's prohibition list naming it to stay behind in mockup-runtime.ts -- it is integerLeverageTicks' only caller anywhere in the repo, and leaving it behind would either strand it as dead code or force src/ to import a value back from .planning/"
  - "HeatmapPanel.tsx declares its own 800x240 canvas geometry constants rather than importing FORM_2_GEOMETRY from the Phase 6 mockup file, for the same src/-never-imports-.planning/-as-a-value reason"
  - "sweep.worker.ts loads the real compiled bundle itself, once per worker instance, via fetch -- no bundle bytes ever cross postMessage, and SweepChunkRequest carries only params plus explicit column/row index lists"
  - "resolveColumnSeries reports a fixed-period overrun as a typed { incomplete: true } result rather than throwing, distinguishing it from the out-of-range-entry-date throw buildKernelInputs already uses (D-28 vs D-32)"

patterns-established:
  - "Pattern: graduated geometry modules (src/heatmap/) carry a header note stating which plan/decision moved them and why, so a later reader can trace the graduation without archaeology"
  - "Pattern: a chunk-transfer buffer's byte layout is declared once as a pure function (chunkBufferByteLength) in the module both sides of the Worker boundary can safely import, rather than duplicated inline arithmetic on each side"

requirements-completed: [VIZ-03, VIZ-06]

coverage:
  - id: D1
    description: "Phase 6 heatmap geometry (iso-lines.ts, field-sampler.ts) and its pure helpers (hatch-pattern.ts, sweep-copy.ts) graduate into src/heatmap/ with exactly one definition each, consumed by both the Phase 6 mockups and production"
    requirement: VIZ-03
    verification:
      - kind: unit
        ref: "tests/iso-lines.test.ts, tests/field-sampler.test.ts -- unchanged assertions, green post-graduation"
        status: pass
      - kind: unit
        ref: "npm run typecheck -- whole repo including the four re-pointed mockup form files"
        status: pass
      - kind: other
        ref: "npm run bench -- --run bench/heatmap-form-2.bench.test.ts -t equivalence (paintFilledContour's output still matches resampleField's own buffer post-graduation)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Switching the result column to sweep mode runs a real 200x50-cell sweep over the real compiled bundle through runBacktest, on a persistent Worker pool, and paints a real filled-contour field -- no synthetic series, no committed fixture"
    requirement: VIZ-06
    verification:
      - kind: automated_ui
        ref: "tests/app/sweep-tracer.browser.test.ts#switching to sweep mode paints a real filled-contour field computed from the real bundle through the real kernel"
        status: pass
      - kind: automated_ui
        ref: "tests/app/sweep-tracer.browser.test.ts#the sweep pool is persistent: two consecutive sweeps report the same worker count and construct no new workers"
        status: pass
      - kind: automated_ui
        ref: "tests/app/sweep-tracer.browser.test.ts#paintSweepField renders a deliberately non-default 51x14 grid without error"
        status: pass
    human_judgment: false
  - id: D3
    description: "Per-column series reuse (resolveColumnSeries) is proven byte-identical to buildKernelInputs's per-cell series resolution across all 50 leverage rows, with the D-28/D-32 failure modes distinguishable"
    verification:
      - kind: unit
        ref: "tests/sweep/column-series.test.ts (7 assertions: series equality at 3 entry dates, 50-row leverage equality, out-of-bounds throw, D-28 overrun distinguishability)"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-08-22
status: complete
---

# Phase 07 Plan 01: Sweep Engine Tracer Summary

**Clicking into sweep mode now runs a real 200x50-cell sweep over the real compiled bundle through `runBacktest`, on a persistent Worker pool, and paints a real filled-contour field on canvas -- the Phase 6 mockup geometry graduated to `src/heatmap/`, and `src/sweep/` now exists as the module boundary the rest of Phase 7 expands from.**

## Performance

- **Duration:** 55min (includes a paused interval awaiting human approval at the tracer feedback gate)
- **Started:** 2026-08-22T22:44:52Z
- **Completed:** 2026-08-22T23:39:31Z
- **Tasks:** 3
- **Files modified:** 17 (12 created, 5 modified in `src`/`tests`/`bench`; 5 modified + 2 moved in `.planning/phases/06-heatmap-design-pass/mockups/`)

## Accomplishments

- Graduated `iso-lines.ts` and `field-sampler.ts` out of the Phase 6 mockup tree into `src/heatmap/`, verbatim except for shortened import paths, plus the three pure helpers (`makeHatchPattern`, `integerLeverageTicks`, `VIZ10_CAVEAT_SENTENCES`) `mockup-runtime.ts` had defined but D-11 never named for graduation
- Built the full tracer path end to end: `resolveColumnSeries` (per-column `KernelSeries` resolution, leverage absent from its type entirely), `sweep.worker.ts` (Comlink-exposed chunk runner, columns outside/rows inside per PERF-03), `sweep-pool.ts` (a persistent Worker pool, never torn down between sweeps), and `paint-contour.ts`'s `paintSweepField` (the same two-pass fill+contour render Phase 6 chose, now grid-size agnostic per F-07)
- Wired `src/app/state.ts`'s `ResultMode`/`scheduleSweep` and `App.tsx`'s result-column branch so a real click reaches a real painted field, proven by a browser test that samples actual canvas pixels rather than trusting a code path ran
- Proved the per-column reuse this whole architecture depends on is a correctness claim, not only a performance one: `resolveColumnSeries`'s series arrays are byte-identical to `buildKernelInputs`'s at three entry dates, and 50 leverage rows against one resolved column match 50 fresh `buildKernelInputs` calls exactly

## Task Commits

Each task was committed atomically:

1. **Task 1: Graduate the Phase 6 geometry and pure mockup-runtime helpers into src/heatmap/** - `502d208` (feat)
2. **Task 2 (tracer): End-to-end "a user sees a real swept field" tracer** - `cf88047` (feat)
3. **Task 3: Prove the per-column series reuse is correct, not just fast** - `bef7069` (test)

**Plan metadata:** (recorded after this SUMMARY commits)

## Files Created/Modified

- `src/heatmap/iso-lines.ts` - Graduated verbatim: marching-squares segment emitter (D-11)
- `src/heatmap/field-sampler.ts` - Graduated verbatim: bilinear field resampler + BAND_LEVELS (D-11)
- `src/heatmap/hatch-pattern.ts` - New: `makeHatchPattern`, `integerLeverageTicks` (+ private `fixtureRowForLeverage`, deviation)
- `src/heatmap/sweep-copy.ts` - New: `VIZ10_CAVEAT_SENTENCES`
- `src/heatmap/paint-contour.ts` - New: `paintSweepField`, the production filled-contour renderer, grid-size agnostic (F-07)
- `src/sweep/sweep-grid.ts` - New: `SWEEP_COLS`/`SWEEP_ROWS`/`LEVERAGE_MIN`/`MAX`, `leverageForRow`/`rowForLeverage`, `SweepGrid`/`SweepGridMeta`, `createSweepGrid`, `chunkBufferByteLength`
- `src/sweep/resolve-column-series.ts` - New: `resolveColumnSeries`, factored out of `buildKernelInputs`'s series-construction loop
- `src/sweep/sweep.worker.ts` - New: the Comlink-exposed chunk runner, loads the real bundle itself
- `src/sweep/sweep-pool.ts` - New: the persistent Worker pool
- `src/app/components/ResultColumn/HeatmapPanel.tsx` - New: the Solid canvas mount for sweep mode
- `tests/sweep/column-series.test.ts` - New: per-column series reuse correctness proof
- `tests/app/sweep-tracer.browser.test.ts` - New: end-to-end sweep-mode browser regression
- `.planning/phases/06-heatmap-design-pass/mockups/shared/mockup-runtime.ts` - Re-imports the three graduated symbols from `src/heatmap/`
- `.planning/phases/06-heatmap-design-pass/mockups/forms/form-{1,2,3,4}-*.ts` - Re-pointed at `src/heatmap/`
- `tests/iso-lines.test.ts`, `tests/field-sampler.test.ts`, `bench/heatmap-form-2.bench.test.ts` - Re-pointed at `src/heatmap/`
- `src/app/state.ts` - `ResultMode`/`resultMode`/`setResultMode`/`sweepGrid`/`scheduleSweep`
- `src/app/App.tsx` - Result-column branch on `resultMode()`, minimal sweep-mode toggle

## Decisions Made

- **`fixtureRowForLeverage` graduates too, as a deviation (Rule 1).** The plan's prohibition list named it to stay behind in `mockup-runtime.ts` alongside genuinely DOM-facing scaffolding (`renderLegend`, `mountMockup`, `loadSweepFixture`). But it is `integerLeverageTicks`' sole dependency with no other caller anywhere in the repo -- leaving it behind would either strand it as dead code once `integerLeverageTicks` moved, or force `src/heatmap/` (production code) to import a value back from `.planning/` (a directory that does not survive a milestone archive). It moves as a private, unexported helper in `hatch-pattern.ts`.
- **`HeatmapPanel.tsx` declares its own 800x240 geometry constants** rather than importing `FORM_2_GEOMETRY` from the Phase 6 mockup file, for the identical src/-never-imports-.planning/-as-a-value reason.
- **`sweep.worker.ts` loads the bundle itself, via `fetch`, once per worker instance.** `SweepChunkRequest` carries no bundle bytes at all -- only params, explicit column indices + resolved entry dates, and explicit row indices. This kept the chunk protocol small and let the pool's own tests exercise real bundle resolution without any bundle-serialization machinery.
- **`resolveColumnSeries` returns a typed `{ incomplete: true }` result for a fixed-period overrun** rather than throwing (D-28), explicitly distinguished from the out-of-range-entry-date throw (D-32) `buildKernelInputs` already uses -- proven distinguishable by two dedicated test cases in `tests/sweep/column-series.test.ts`.
- **The sweep result buffer's byte layout (`chunkBufferByteLength`) lives in `sweep-grid.ts`**, imported by value from both `sweep.worker.ts` and `sweep-pool.ts`, rather than either worker-side or pool-side module importing the other as a value -- a value import of `sweep.worker.ts` from the main thread would pull `Comlink.expose(...)`'s module-load side effect into the wrong global scope.
- **`sweepGrid()` is a `{ equals: false }` Solid signal** holding the SAME mutated `SweepGrid` object across a sweep's own run, rather than cloning a 10,000-cell structure on every completed sweep to satisfy `Object.is` reactivity.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/inconsistency] `fixtureRowForLeverage` graduated alongside `integerLeverageTicks`, contradicting the plan's literal prohibition list**
- **Found during:** Task 1
- **Issue:** The plan instructs `integerLeverageTicks` to graduate into `src/heatmap/hatch-pattern.ts` "moved verbatim," but that function's own body calls `fixtureRowForLeverage`, which the same plan's prohibition list names to stay behind in `mockup-runtime.ts`. Honoring both instructions literally is impossible without either creating a circular import between `hatch-pattern.ts` and `mockup-runtime.ts`, or having production `src/` code import a value from `.planning/` (architecturally wrong, and breaks if that directory is ever archived).
- **Fix:** `fixtureRowForLeverage` moves into `hatch-pattern.ts` as a private, unexported helper (not re-exported, since nothing outside `integerLeverageTicks` calls it). Removed entirely from `mockup-runtime.ts` rather than left as dead code.
- **Files modified:** `src/heatmap/hatch-pattern.ts`, `.planning/phases/06-heatmap-design-pass/mockups/shared/mockup-runtime.ts`
- **Verification:** `npm run typecheck` and `npm run test` green; `grep` acceptance criteria for the task (single-definition checks) all pass
- **Committed in:** `502d208` (Task 1 commit)

**2. [Rule 1 - Bug/inconsistency] `HeatmapPanel.tsx` declares local geometry constants instead of importing `FORM_2_GEOMETRY`**
- **Found during:** Task 2
- **Issue:** The plan's action text for `HeatmapPanel.tsx` says "a Solid component owning one canvas at `FORM_2_GEOMETRY`'s 800 by 240 size" -- read literally, this means importing that constant from the Phase 6 mockup file (`.planning/phases/06-heatmap-design-pass/mockups/forms/form-2-filled-contour.ts`), which was never graduated by Task 1 (only `iso-lines`/`field-sampler`/the three pure helpers were). Importing it would create the same src/-imports-.planning/-as-a-value problem Task 1's deviation #1 avoided.
- **Fix:** Declared `HEATMAP_WIDTH_PX`/`HEATMAP_HEIGHT_PX` locally in `HeatmapPanel.tsx` at the identical 800/240 values, with a header comment explaining the deviation and cross-referencing the Task 1 precedent.
- **Files modified:** `src/app/components/ResultColumn/HeatmapPanel.tsx`
- **Verification:** `npm run typecheck` green; browser test asserts `canvas.width === 800` and `canvas.height === 240`
- **Committed in:** `cf88047` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 -- the same underlying "src/ never imports a value from .planning/" principle applied twice)
**Impact on plan:** Both auto-fixes preserve the plan's actual intent (one definition of the hatch/tick geometry; the same 800x240 canvas size) while avoiding an architectural dependency (`src/` on a planning-phase directory) that would break at milestone-archive time. No scope creep -- neither deviation added a feature the plan didn't already call for.

## Issues Encountered

None beyond the two deviations above. The tracer feedback gate (an interactive-mode-only checkpoint after Task 2, since `workflow._auto_chain_active`/`workflow.auto_advance` were both `false`) required a human to review a dev server I started, and was approved without requested changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `src/heatmap/` and `src/sweep/` exist with the module boundaries plans 07-02 through 07-10 expand from (polygon fill, coarse pass + cancellation, metric toggle, crosshair, viewport, curve labels, legend, caption).
- `paint-contour.ts`'s `FillPath` seam is a swap point, not a rewrite target, for plan 07-04's polygon-fill path.
- `SweepChunkRequest.generation` is threaded through the worker/pool already; plan 07-05 adds the actual staleness check as a comparison against this existing field.
- No blockers. The one open item from the plan's own `<planner_assumptions>` (VIZ-03/VIZ-06 unclassified edge families) was reviewed manually during this plan and no additional edge category was found to apply beyond what `06-HEATMAP-SPEC.md` and the D-18/D-20 branch-order tie already govern.

---
*Phase: 07-sweep-engine-and-the-heatmap*
*Completed: 2026-08-22*
