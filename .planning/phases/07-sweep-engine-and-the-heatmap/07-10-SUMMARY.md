---
phase: 07-sweep-engine-and-the-heatmap
plan: 10
subsystem: viz
tags: [canvas2d, pan, zoom, viewport-transform, performance, heatmap]

requires:
  - phase: 07-sweep-engine-and-the-heatmap
    plan: "07-04"
    provides: "src/heatmap/paint-contour.ts's shipped 'resample' fill path (D-09 offscreen-cache mitigation), the seam this plan's viewport transform composes with directly (ctx.translate/scale wrapping the unmodified paintSweepField call)"
  - phase: 07-sweep-engine-and-the-heatmap
    plan: "07-08"
    provides: "src/heatmap/crosshair.ts's FieldRect/crosshairCellFor and HeatmapPanel.tsx's pointer-event overlay canvas, both extended (not replaced) by this plan's pan/zoom gesture handlers"
provides:
  - "src/heatmap/viewport.ts: SweepViewport, applyViewportTransform/invertViewportTransform, clampViewport, zoomViewportAt (zoom-toward-pointer), visibleDomainFor, ZOOM_MIN_SCALE (1.0) / ZOOM_MAX_SCALE (8.0), FIT_VIEWPORT -- pure transform maths, no DOM, no solid-js"
  - "HeatmapPanel.tsx: a local-only SweepViewport signal (never in the app store or permalink), wheel-to-zoom-toward-pointer and pointer-drag-to-pan gesture handlers, zoom-aware entryDateTicks/leverageTicks DOM axis labels"
  - "bench/heatmap-panzoom.bench.test.ts: the single PERF-09 recorder, pan and zoom arms, worse-of-two figure"
affects: []

actuals:
  tokens: 17401
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "The viewport transform is applied via the canvas 2D context's own affine transform (ctx.translate/scale) wrapping an UNMODIFIED call to the existing paintSweepField, rather than a parallel viewport-aware renderer -- the D-09 offscreen-fill cache stays warm across pan/zoom (drawImage transform of the cached bitmap, D-34's 'goes soft past 1:1' tradeoff) while every stroke pass (band boundaries, ruin hatch, short-horizon rule, curve label) is genuinely redrawn under the transform and stays crisp, with zero changes to paint-contour.ts"
    - "Every hit test inverts the raw pointer position through the CURRENT viewport (invertViewportTransform) before calling crosshairCellFor, so panning/zooming never changes which grid cell a given screen pixel names"
    - "New DOM axis ticks (not canvas text) so their content is directly readable text rather than requiring pixel OCR in tests; both accessors return a FIXED slot count regardless of data state (D-14 shape-stability precedent from HorizontalSliceChart/VerticalSliceChart), padding empty placeholders rather than varying element count"
    - "A drag-vs-click gesture disambiguates via a pointerdown-armed movement threshold (PAN_DRAG_THRESHOLD_PX) plus a lastGestureWasDrag flag consumed by the click handler, rather than intercepting the click event itself -- native click always fires after pointerup regardless of intervening movement, so the suppression has to live in application state, not event semantics"

key-files:
  created:
    - src/heatmap/viewport.ts
    - tests/heatmap/viewport.test.ts
    - bench/heatmap-panzoom.bench.test.ts
  modified:
    - src/app/components/ResultColumn/HeatmapPanel.tsx
    - tests/app/crosshair.browser.test.ts

key-decisions:
  - "The viewport transform composes with paint-contour.ts via the canvas context's own affine transform (ctx.save/translate/scale/paintSweepField/restore) rather than a parallel viewport-aware paint function -- paint-contour.ts stays entirely unmodified (not in this plan's declared files_modified), and the bench file measures this exact call sequence, so there is no separate viewport-aware renderer that could drift out of sync with production."
  - "Axis-tick DOM elements (entryDateTicks/leverageTicks) always render a FIXED slot count (5 entry-date ticks, LEVERAGE_MAX-LEVERAGE_MIN+1=5 leverage ticks), padded with empty-text placeholders when there is no real tick to show. Found via a real regression: tests/app/sweep-progressive.browser.test.ts asserts the DOM's own element shape is identical before and after the coarse sweep pass resolves (D-14, 'no progress affordance'), and a naive variable-length <For> over grid===null-guarded ticks broke that invariant (0 elements before any grid resolves, 10 after). Fixed by always returning the same element count, mirroring HorizontalSliceChart/VerticalSliceChart's own established 'same shape, zero data points' pattern."
  - "PERF-09's bench file (heatmap-panzoom.bench.test.ts) re-derives the identical ctx.translate/scale + paintSweepField sequence HeatmapPanel.tsx's own repaint() uses, rather than importing a shared helper -- there is no shared module to import without adding a new export surface to paint-contour.ts, which this plan's own files_modified deliberately excludes. The bench file's own header documents this is measuring the real production path (not a parallel one) precisely because paint-contour.ts is unmodified."

patterns-established:
  - "Pan-drag vs click disambiguation: pointerdown arms a possible pan (captures the origin screen position and the viewport at that moment); pointermove accumulates movement and only becomes an active pan once past PAN_DRAG_THRESHOLD_PX (clampViewport pins the offset to zero at fit scale, so a fit-scale drag is a real no-op, not a special case); pointerup records whether the gesture ended as a drag; the subsequent native click event checks that flag and swallows itself if so."
  - "A pure viewport module (viewport.ts) that knows only 'field-rectangle display-pixel space' and nothing about the A-E5 vertical flip, canvas contexts, or Solid -- the caller (HeatmapPanel.tsx) is the only place that composes the viewport transform with the flip crosshair.ts/paint-contour.ts already apply, keeping 'row 0 paints at the bottom' knowledge in exactly one place, per this plan's own action text."

requirements-completed: [PERF-09]

coverage:
  - id: D1
    description: "src/heatmap/viewport.ts exports SweepViewport, clampViewport, applyViewportTransform, visibleDomainFor, ZOOM_MIN_SCALE and ZOOM_MAX_SCALE, pure transform maths with no DOM/solid-js import, running in the fast Node unit project"
    requirement: PERF-09
    verification:
      - kind: unit
        ref: "tests/heatmap/viewport.test.ts -- 12 tests: identity at fit scale, pan clamped to zero at fit scale, pan clamped at all four edges above fit scale, scale clamped to [ZOOM_MIN_SCALE, ZOOM_MAX_SCALE], zoom no-ops at both scale limits, zoom-toward-pointer keeps the grid cell fixed at three pointer positions, visibleDomainFor index ranges stay within grid bounds across the full 1.0-8.0 scale sweep and at extreme pan offsets"
        status: pass
    human_judgment: false
  - id: D2
    description: "HeatmapPanel.tsx wires wheel-to-zoom-toward-pointer and pointer-drag-to-pan into the field, composing with the shipped resample fill path via the canvas context transform, with sweepGeneration/scheduleSweep never touched by the gesture, the marginal slice charts left un-zoomed, and new zoom-aware DOM axis ticks that always name a real entryDate/leverage value"
    requirement: PERF-09
    verification:
      - kind: automated_ui
        ref: "tests/app/crosshair.browser.test.ts -- 8 new tests: PERMALINK_KEYS still 17 entries; a pan drag at fit scale leaves the field canvas pixel-identical and never commits a cell; zooming in renders entry-date/leverage tick labels that all name real grid.meta values; a committed crosshair zoomed exactly at its own screen position stays on the same cell at the same pixel; a zoom gesture against the real app leaves sweepGeneration() unchanged while the field canvas pixel content changes; a full pan-then-zoom-then-pan sequence against the real app leaves the URL query string byte-identical"
        status: pass
      - kind: automated_ui
        ref: "tests/app/sweep-progressive.browser.test.ts (pre-existing, unmodified) -- DOM-fingerprint assertion continues to pass after the new axis-tick elements were made fixed-slot-count"
        status: pass
    human_judgment: false
  - id: D3
    description: "PERF-09 is measured from a scripted pan and a scripted zoom sequence at the full 200x50 = 10,000-cell grid, with correctness (real fixture, genuinely different pixel content per step, unchanged sweep generation) asserted before the stopwatch, recording the worse of the two arms and no budget/calibration/geometry relaxed"
    requirement: PERF-09
    verification:
      - kind: other
        ref: "bench/heatmap-panzoom.bench.test.ts's own recordMeasurement call and .bench/bench-results.json's PERF-09 row (source: production, verdict: pass); measured on this dev sandbox at worseArm normalizedMs ~1.4-1.7ms against the 16ms budget"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-08-23
status: complete
---

# Phase 07 Plan 10: Pan and Zoom (D-34/D-35, PERF-09) Summary

**Wheel-to-zoom-toward-pointer and pointer-drag-to-pan on the heatmap field, implemented as a canvas context transform wrapping the unmodified `paintSweepField`, with PERF-09 measured at ~1.4-1.7ms against a 16ms budget from a scripted 300-step pan and a scripted fit-to-8x-and-back zoom sequence at the full 10,000-cell grid.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments

- `src/heatmap/viewport.ts`: pure, DOM-free, Solid-free transform maths -- `SweepViewport` (scale plus x/y pan offset, in field-rectangle display-pixel space), `applyViewportTransform`/`invertViewportTransform` (exact inverses), `clampViewport` (pan pinned to zero at or below fit scale; above fit scale, bounded so the visible rectangle never leaves the field), `zoomViewportAt` (zoom toward a pointer, keeping the logical point under it fixed on screen, with a reference-stable no-op at either scale limit), and `visibleDomainFor` (the transformed grid-index range currently visible, for real axis ticks rather than rounded display pixels). `ZOOM_MAX_SCALE` is 8.0, planner-authored and documented as such: past 8x a 200-column axis shows 25 columns, well past useful reading.
- `HeatmapPanel.tsx` holds the viewport as local-only component state (never the app store, never the permalink -- D-35) and applies it to BOTH canvases via `ctx.translate(offsetX, offsetY); ctx.scale(scale, scale)` immediately before the existing `paintSweepField` call and the crosshair guide-line paint. `paint-contour.ts` is entirely unmodified: at unchanged `generation`/`metric`/`cols`/`rows` its D-09 offscreen-fill cache stays warm, so the transform alone stretches the cached bitmap (the accepted "goes soft past 1:1" tradeoff), while every stroke pass genuinely redraws under the transform and stays crisp.
- A wheel (or trackpad pinch, delivered as a wheel event) zooms toward the pointer; a pointer drag past a small movement threshold pans, with `clampViewport` making a fit-scale drag a real no-op rather than a special case. Every hit test inverts the raw pointer position through the current viewport before `crosshairCellFor`, so pan/zoom never changes which cell a screen pixel names. Neither gesture ever calls `updateBacktestRequest`/`scheduleSweep`.
- New zoom-aware axis ticks (`entryDateTicks`/`leverageTicks`) render as plain DOM `<span>` elements -- always naming a real `grid.meta.entryDates`/leverage value derived from `visibleDomainFor`'s transformed index range, never a rounded display pixel -- rather than canvas text, so their content is directly readable (by a person or a test) without pixel OCR.
- The two marginal slice charts (`HorizontalSliceChart`/`VerticalSliceChart`) are deliberately NOT fed the viewport and stay un-zoomed, per this plan's own planner assumption (a slice is a cut of the whole grid, not a view of the visible region); this is documented in the component's own header.
- `bench/heatmap-panzoom.bench.test.ts` measures PERF-09 by re-deriving the exact `ctx.translate/scale` + `paintSweepField` sequence `HeatmapPanel.tsx`'s own `repaint()` uses, against the real committed 200x50 fixture. A 300-step scripted pan drag at 4x zoom (matching `perf-07.bench.test.ts`'s own step-count discipline) and a 300-step scripted zoom sequence (fit to `ZOOM_MAX_SCALE` and back, built from `viewport.ts`'s own `zoomViewportAt`) are each measured; the worse of the two normalized figures is the official row. Correctness asserted before the stopwatch: the grid is genuinely 10,000 cells, each arm's sequence paints materially different pixel content step to step, and `grid.generation` never changes.

## Task Commits

1. **Task 1: The viewport transform, clamped and axis-aware** - `96257f2` (feat)
2. **Task 2: Wire pan and zoom into the panel without touching the sweep** - `024a1a9` (feat)
3. **Task 3: Measure PERF-09 at full cell count** - `be6755b` (test)

## Files Created/Modified

- `src/heatmap/viewport.ts` - Pure pan/zoom transform maths (new)
- `tests/heatmap/viewport.test.ts` - 12 unit tests for the viewport module (new)
- `src/app/components/ResultColumn/HeatmapPanel.tsx` - viewport signal, gesture handlers, transform-wrapped repaint, zoom-aware axis ticks (modified)
- `tests/app/crosshair.browser.test.ts` - 8 new pan/zoom browser tests (modified)
- `bench/heatmap-panzoom.bench.test.ts` - PERF-09 measurement (new)

## Decisions Made

See `key-decisions` in the frontmatter: composing the viewport transform via the canvas context's own affine transform (no change to `paint-contour.ts`), the fixed-slot-count axis-tick padding fix, and the bench file re-deriving the identical repaint sequence rather than importing a shared helper.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] New axis-tick DOM elements broke `sweep-progressive.browser.test.ts`'s DOM-shape-stability invariant**
- **Found during:** Task 2, running the full `npm run test:app` suite before committing
- **Issue:** `entryDateTicks()`/`leverageTicks()` initially returned `[]` when `props.grid` was `null` and a real array of ticks once a grid resolved, so the `<For>`-rendered tick spans went from 0 elements to 10 elements the moment the coarse sweep pass landed. `tests/app/sweep-progressive.browser.test.ts` asserts the DOM's own element-tag fingerprint is byte-identical before and after the coarse pass (D-14: "no progress affordance anywhere in the DOM, nothing was added and then removed"), and this broke that assertion.
- **Fix:** Both accessors now always return a FIXED slot count (`ENTRY_DATE_TICK_COUNT = 5`; `LEVERAGE_TICK_SLOT_COUNT` derived from `LEVERAGE_MAX - LEVERAGE_MIN + 1`), padding with empty-text, zero-footprint placeholder entries whenever there is no real tick to show -- mirroring `HorizontalSliceChart`/`VerticalSliceChart`'s own established "same shape, zero data points before the first sweep pass" precedent, which this file's own header already cites for the field canvas.
- **Files modified:** `src/app/components/ResultColumn/HeatmapPanel.tsx`, `tests/app/crosshair.browser.test.ts` (the two new tick-content tests now filter out empty placeholder spans before asserting on rendered text)
- **Verification:** `npm run test:app` (full suite) passes, including `sweep-progressive.browser.test.ts`'s DOM-fingerprint assertion and both new tick-content tests
- **Committed in:** `024a1a9` (Task 2 commit; found and fixed within the same task before committing, not a separate commit)

---

**Total deviations:** 1 auto-fixed (Rule 1: a DOM-shape-stability regression against a pre-existing test, caught before committing).
**Impact on plan:** No scope change. The fix strengthens the tick rendering to match an established codebase pattern (fixed-shape DOM regardless of data state) rather than working around the test.

## Issues Encountered

- **`npm run bench` run in isolation for this single file** (the plan's own literal `<verify>` command) trips the run-level PERF-08-coverage invariant at teardown, because that isolated run omits the OTHER bench files that measure PERF-08. Confirmed pre-existing and unrelated to this plan: `07-04-SUMMARY.md` documents the identical exposure for `bench/heatmap-form-2.bench.test.ts`. The PERF-09 measurement itself completes and is recorded correctly (`verdict: pass`, confirmed directly in `.bench/bench-results.json`) before this unrelated teardown check fires. Not fixed, per the deviation rules' scope boundary (pre-existing, not caused by this plan's changes).
- **The full `npm run bench` suite (all 11 files) exceeds `BENCH_TOTAL_RUNTIME_CAP_MS` (30,000ms)** on this dev sandbox, both WITH and WITHOUT this plan's new bench file (confirmed by temporarily removing it and re-running: 30,837ms without, 33,817ms with -- this file adds roughly 3s of the pre-existing overage, it did not create the overage). `PERF-09` itself measures cleanly within budget (`verdict: pass`) in both runs; only the run-level total-runtime invariant trips at teardown. Per `perf-budgets.ts`'s own header, raising `BENCH_TOTAL_RUNTIME_CAP_MS` requires a recorded Key Decision, which is out of scope for this plan (it is a suite-wide creep across every phase's bench file, not something this plan's own ~3s addition caused on its own). Not fixed, per the deviation rules' scope boundary.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Pan and zoom are fully wired, gated by real correctness assertions (browser tests) and a real perf measurement (bench), with `paint-contour.ts` left entirely unmodified.
- **Carried forward (not fixed by this plan, both pre-existing and out of scope):** the full `npm run bench` suite's total runtime exceeds its own 30s cap; running any single bench file in isolation trips the unrelated PERF-08-coverage invariant. Both are suite-wide bench-harness concerns spanning every phase's bench file, not specific to PERF-09 or this plan's own additions.
- No blockers for closing out phase 07.

## Self-Check: PASSED

All five created/modified files this plan touches are tracked (`git status --short` clean after each
commit): `src/heatmap/viewport.ts`, `tests/heatmap/viewport.test.ts`,
`src/app/components/ResultColumn/HeatmapPanel.tsx`, `tests/app/crosshair.browser.test.ts`,
`bench/heatmap-panzoom.bench.test.ts`. All three task commit hashes this SUMMARY cites (`96257f2`,
`024a1a9`, `be6755b`) are present in `git log --oneline -3`, verified immediately before this
SUMMARY was written.

---
*Phase: 07-sweep-engine-and-the-heatmap*
*Completed: 2026-08-23*
