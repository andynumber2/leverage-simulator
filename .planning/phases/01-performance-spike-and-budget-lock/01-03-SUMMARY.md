---
phase: 01-performance-spike-and-budget-lock
plan: 03
subsystem: perf-spike
tags: [canvas-2d, putimagedata, fillrect, vitest, browser-mode, performance-budget, typescript]

# Dependency graph
requires:
  - "perf-budgets.ts (plan 01-01): PERF_BUDGETS table"
  - "bench/calibration.ts, bench/report.ts, bench/environment-block.ts (plan 01-01): measure -> normalize -> record -> assert chain"
  - "bench/accumulator-store.ts's recordInfoLine bridge (plan 01-02): free-text stdout-reporting escape hatch, reused here for the loser arm's figure"
provides:
  - "bench/canvas-grid.ts: GRID_COLS/GRID_ROWS, makeGridValues, mapValueToRgba, paintFillRect, paintPutImageData — the shared 10,000-cell grid fixture and both hand-rolled Canvas 2D paint arms, settling D-15"
  - "npm run bench: PERF-05 now measures both arms, records the winner as the budget row, and prints/persists both figures"
  - "bench/global-setup.ts: JSON artifact (.bench/bench-results.json) now also carries infoLines, so a free-text reproducibility figure survives past the terminal scrollback"
affects: [06-heatmap-design, 07-sweep-engine]

# Actuals (#2632)
actuals:
  tokens: 6149
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A shared value-to-color mapping (mapValueToRgba) consumed by every paint arm, so two rendering strategies can be compared without also comparing two different pictures"
    - "Rendered-equivalence proof precedes any measureMinOfN call in the same test file: clear to a background the mapping can never produce, prove the background is present, run the arm, then prove the expected color landed — invalidated by a no-op arm or by removing the background pre-check (both manually verified to fail)"
    - "The winning arm's figure becomes the budget row; the losing arm's figure is preserved via recordInfoLine, now flowing into both stdout and the JSON artifact"

key-files:
  created:
    - bench/canvas-grid.ts
    - tests/canvas-grid.test.ts
  modified:
    - bench/canvas-repaint.bench.test.ts
    - bench/global-setup.ts

key-decisions:
  - "makeGridValues produces log-uniformly distributed values across ~6 orders of magnitude (1e-3 to 1e3), not the uniform [0,1) grid plan 01-01's inline version used — the real heatmap's outcome metrics (final value multiple, IRR) span magnitudes, and mapValueToRgba's log10-based mapping is designed against that range"
  - "mapValueToRgba fixes its green channel at a constant 64 for every input, which is what makes the equivalence proof's background color (green=200) structurally incapable of colliding with any painted output — not an arbitrary implementation detail, a property the proof depends on"
  - "bench/global-setup.ts's JSON payload gained an infoLines field (Rule 2 — missing functionality, outside this plan's declared files_modified) because the plan's own acceptance criterion ('.bench/bench-results.json records both arm figures') has no home in the existing MeasurementRow schema for a losing arm's figure; only the winner becomes a budget row"
  - "The equivalence proof samples exactly two cells — (0,0) and (199,49), the grid's first and last — center-pixel only, to avoid antialiasing false negatives at fillRect cell edges, per the plan's explicit guidance"

requirements-completed: [PERF-10, PERF-11]

coverage:
  - id: D1
    description: "makeGridValues(seed) is deterministic and CELL_COUNT (10,000) long; two calls with the same seed are element-wise identical"
    requirement: PERF-10
    verification:
      - kind: unit
        ref: "tests/canvas-grid.test.ts#makeGridValues (length, determinism, different-seed divergence, order-of-magnitude spread)"
        status: pass
    human_judgment: false
  - id: D2
    description: "mapValueToRgba is a pure function returning four integer channels in [0,255], deterministic for a given input"
    requirement: PERF-10
    verification:
      - kind: unit
        ref: "tests/canvas-grid.test.ts#mapValueToRgba (channel range, determinism, low/high visibly different, all 10,000 grid values map deterministically)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Both paintFillRect and paintPutImageData are proven to write the expected color into the expected cells before either timing figure is recorded, and the check is not vacuous"
    requirement: PERF-10
    verification:
      - kind: unit
        ref: "bench/canvas-repaint.bench.test.ts: two equivalence tests (background pre-assertion + post-paint sampled-pixel assertion at cell (0,0) and (199,49)), both running and passing before the PERF-05 measurement test in the same file"
        status: pass
      - kind: other
        ref: "manual: made paintPutImageData a no-op -> npx vitest run --project bench exits 1 on the equivalence assertion (not a suspiciously fast pass); reverted. Removed the background pre-assertion and cleared the canvas after painting -> still exits 1 on the final sampled-pixel assertion; reverted"
        status: pass
    human_judgment: false
  - id: D4
    description: "npm run bench reports both canvas arm figures, names the winner, and asserts PERF-05 against it; .bench/bench-results.json records both figures"
    requirement: PERF-11
    verification:
      - kind: integration
        ref: "npm run bench stdout: 'PERF-05 canvas arms: fillRect=4.60ms putImageData=0.00ms winner=putImageData (asserted against PERF-05) loser=fillRect'; .bench/bench-results.json rows[PERF-05] + infoLines both present"
        status: pass
    human_judgment: false
  - id: D5
    description: "No charting library dependency added; banned-dependency check still passes"
    requirement: PERF-10
    verification:
      - kind: other
        ref: "node -e banned-dependency check (uplot/echarts/plotly.js/@observablehq/plot) exits 0"
        status: pass
    human_judgment: false

duration: ~7min
completed: 2026-08-16
status: complete
---

# Phase 1 Plan 3: Canvas Repaint Arms, Measured and Proven Equivalent Summary

**Both hand-rolled Canvas 2D repaint arms — one `fillRect` per cell and a single `putImageData` pass — are measured on the identical 10,000-cell grid, each proven to paint the expected color into the expected cells before either figure is trusted; `putImageData` wins decisively (~0.00ms normalized vs. fillRect's ~4-7ms on this machine) and its figure is what `npm run bench` asserts against the PERF-05 budget, settling D-15.**

## Performance

- **Duration:** ~7 min
- **Completed:** 2026-08-16
- **Tasks:** 2
- **Files:** 2 created, 2 modified

## Accomplishments

- `bench/canvas-grid.ts`: the shared fixture — `GRID_COLS`/`GRID_ROWS` (200x50), `makeGridValues` (deterministic, log-uniform across ~6 orders of magnitude so the input resembles a real outcome-metric grid rather than a uniform `[0,1)` band), `mapValueToRgba` (one pure value-to-color mapping both arms consume, green channel fixed at 64), `paintFillRect`, and `paintPutImageData` (buffer canvas + `ImageData` allocated once and reused, upscaled with `imageSmoothingEnabled = false`)
- `bench/canvas-repaint.bench.test.ts` rewritten: both arms measured with `measureMinOfN`/`calibrationScore`, the faster arm's normalized figure recorded as the PERF-05 row, both figures reported via `recordInfoLine`
- The equivalence proof (D-15's precondition for trusting either figure): each arm's test clears to a background color `mapValueToRgba` can never produce, proves that background is present at both sample-cell centers, runs the arm, then proves the sampled pixels at cell (0,0) and cell (199,49) equal the expected RGBA — manually verified non-vacuous by breaking each half in turn and confirming `npm run bench` fails
- `tests/canvas-grid.test.ts`: pure Node-project coverage for grid dimensions, `makeGridValues`, and `mapValueToRgba`, including the 10,000-value determinism sweep that is the pure half of the equivalence proof
- `bench/global-setup.ts` extended (Rule 2) to persist `infoLines` into `.bench/bench-results.json`, so the losing arm's figure survives in the JSON artifact, not only in stdout

## Task Commits

1. **Task 1: Shared grid fixture and both hand-rolled paint arms, both measured** - `9f30546` (feat)
2. **Task 2: Prove both arms paint the same picture before either timing figure is trusted** - `be0b28f` (test)

## Files Created/Modified

- `bench/canvas-grid.ts` - `GRID_COLS`, `GRID_ROWS`, `CELL_COUNT`, `CELL_SIZE_PX`, `RgbaColor`, `makeGridValues`, `mapValueToRgba`, `paintFillRect`, `paintPutImageData`
- `bench/canvas-repaint.bench.test.ts` - both arms measured against PERF-05, plus the two equivalence tests that must pass first
- `tests/canvas-grid.test.ts` - grid dimensions, `makeGridValues` behavior, `mapValueToRgba` behavior (fast Node `unit` project)
- `bench/global-setup.ts` - JSON payload gained an `infoLines` field (see Deviations)

## Decisions Made

- **Values span orders of magnitude, not `[0,1)`.** Plan 01-01's inline grid used a uniform `[0,1)` draw; this plan's `makeGridValues` instead log-uniformly spreads values across roughly 1e-3 to 1e3, matching the real heatmap's outcome metrics (final value multiple, IRR) more closely than a narrow uniform band would, and exercising `mapValueToRgba`'s log10-based clamp rather than leaving it untested at its boundaries.
- **Green channel fixed at 64 in every `mapValueToRgba` output.** This is what makes the equivalence proof's background color (chosen with green=200) structurally incapable of colliding with a painted cell — the proof depends on this property, not merely on picking "a different-looking" background.
- **The faster arm's figure becomes the PERF-05 row; the slower arm's figure is preserved via `recordInfoLine`, not dropped.** D-15 asks for both figures on record, not only a winner, so Phase 6/7 inherit the comparison, not just the conclusion.
- **`bench/global-setup.ts` now writes `infoLines` into the JSON artifact.** Previously `recordInfoLine` payloads only reached stdout (per 01-02's original design). This plan's own acceptance criterion — "`.bench/bench-results.json` records both arm figures" — has no home in the single-row-per-budget-id `MeasurementRow` schema for a losing arm, so the JSON gained the same `infoLines` array stdout already prints.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] `bench/global-setup.ts`'s JSON artifact did not carry `recordInfoLine` payloads**
- **Found during:** Task 1, verifying the acceptance criterion "`.bench/bench-results.json` records both arm figures."
- **Issue:** Plan 01-02 added `recordInfoLine`/`persistInfoLine`/`loadInfoLines` as a stdout-only reproducibility bridge; `bench/global-setup.ts`'s teardown printed `infoLines` to the console but never included them in the JSON payload written to `.bench/bench-results.json`. Since PERF-05 has exactly one `MeasurementRow` slot and only the winning arm occupies it, the losing arm's figure had no path into the JSON artifact without this change.
- **Fix:** Added `infoLines` to the JSON payload object alongside `environment`, `rows`, and `totalRuntimeMs`.
- **Files modified:** `bench/global-setup.ts` (outside this plan's declared `files_modified`, from plan 01-01/01-02).
- **Verification:** `npm run bench` then `.bench/bench-results.json` contains an `infoLines` array with the `PERF-05 canvas arms: ...` line.
- **Committed in:** `9f30546` (Task 1 commit).

---

**Total deviations:** 1 auto-fixed (Rule 2). Necessary for this plan's own explicit acceptance criterion to hold; not scope creep beyond what that criterion required.
**Impact on plan:** No plan acceptance criterion was reduced. `bench/global-setup.ts`'s change is purely additive (one new JSON field) and does not alter any existing consumer of `.bench/bench-results.json`.

## TDD Gate Compliance

Both tasks are `type="auto" tdd="true"`. Task 1 committed the grid fixture, both paint arms, the rewritten measurement test, and pure unit tests together as a single `feat` commit (`9f30546`) after `npm run typecheck`, `npx vitest run --project unit`, and `npm run bench` all passed — RED was observed organically (`tests/canvas-grid.test.ts` and the rewritten bench test could not import from a nonexistent `bench/canvas-grid.ts` prior to its creation) rather than as a separately committed failing state, matching the precedent set in 01-01-SUMMARY.md. Task 2 is a genuine `test`-labeled commit (`be0b28f`): the equivalence assertions were added, run, and confirmed to fail non-vacuously under two independent manual mutations (no-op arm; missing background pre-check) before being reverted and committed passing.

## Issues Encountered

None beyond the JSON-artifact gap above, discovered and resolved during Task 1's own acceptance-criteria verification.

## User Setup Required

None. This plan adds no new dependency, no new external service, and no new environment variable.

## Observations Worth Flagging for Phase 7

- **`putImageData`'s normalized figure measured at or near 0.00ms on this machine across every run**, while `fillRect` measured 4-7ms. This is a genuinely large, one-sided margin — not a close call research's napkin estimate would have left ambiguous — but at this magnitude the figure is close to `performance.now()`'s effective resolution in headless Chromium, so the *exact* ratio (10x? 50x?) should be treated as "putImageData is dramatically faster" rather than a precise multiplier, and re-verified once measured for real on the D-17 `ubuntu-latest` CI baseline alongside `NOMINAL_REFERENCE_MS`'s own pending re-verification (carried over from 01-01).
- Nothing observed while adding the equivalence assertions changes the recommendation itself — `putImageData` is not merely faster, it correctly painted every sampled cell in every run, including the deliberately-broken-then-reverted checks. Phase 6/7 can treat `putImageData` as the settled implementation choice for the production heatmap, with `fillRect`'s figure on record as the alternative that was actually measured, not assumed inferior.

## Next Phase Readiness

- Plan 01-04 (the remaining Phase 1 plan) can proceed; nothing in this plan blocks it. Its Key Decision on the canvas implementation fork can now cite this plan's measured `putImageData` figure directly, per D-15/D-14.
- `bench/canvas-grid.ts`'s exports (`GRID_COLS`, `GRID_ROWS`, `makeGridValues`, `mapValueToRgba`, `paintFillRect`, `paintPutImageData`) are the shared surface Phase 6's mockups and Phase 7's real heatmap implementation should reuse or mirror, rather than re-deriving the color mapping or grid geometry independently.
- `bench/global-setup.ts`'s `infoLines`-in-JSON change is available to any future `*.bench.test.ts` file that needs a free-text figure to survive in the JSON artifact, the same way `recordInfoLine` already made it survive in stdout.

## Self-Check: PASSED

All 4 claimed files verified present on disk (`bench/canvas-grid.ts`, `bench/canvas-repaint.bench.test.ts`, `tests/canvas-grid.test.ts`, `bench/global-setup.ts`). Both claimed commit hashes (`9f30546`, `be0b28f`) verified present in `git log --oneline --all`.

---
*Phase: 01-performance-spike-and-budget-lock*
*Completed: 2026-08-16*
