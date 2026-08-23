---
phase: 07-sweep-engine-and-the-heatmap
plan: 07
subsystem: viz
tags: [uplot, canvas2d, legend, caption, slice-chart, sweep, heatmap]

requires:
  - phase: 07-sweep-engine-and-the-heatmap
    plan: "07-02"
    provides: "src/colorscale/value-to-color.ts's per-metric colour authority (scaleTypeForMetric, rampPositionForMetric, bandLevelsForMetric, emphasizedBandLevelFor, legendTicksForMetric)"
  - phase: 07-sweep-engine-and-the-heatmap
    plan: "07-05"
    provides: "src/app/state.ts's coarseSweepGrid/sweepGeneration/sweepFailedCellCount/displayedMetric/crosshairCell signals"
provides:
  - "src/app/components/ResultColumn/SliceChart.tsx: HorizontalSliceChart (uPlot, VIZ-01), VerticalSliceChart (hand-rolled Canvas 2D, VIZ-02), buildHorizontalSliceSeries/buildVerticalSliceValues (pure data-prep, exported for direct testing)"
  - "src/app/components/ResultColumn/SweepLegend.tsx: the two-variant (diverging/sequential) legend"
  - "src/app/components/ResultColumn/SweepCaption.tsx: the VIZ-04 mode statement + VIZ-10 caveat + conditional chunk-failure line"
  - "src/sweep/sweep-grid.ts: SweepGridMeta.holdingPeriodBars (optional, Rule 2 addition)"
affects: [07-08, 07-09, 07-10]

actuals:
  tokens: 16820
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "A component mounts unconditionally even before its data exists (grid: SweepGrid | null), rendering the SAME DOM/chart shape with empty data rather than being Show-gated, so the DOM's own element shape never changes across the null-to-coarse loading transition -- required by tests/app/sweep-progressive.browser.test.ts's pre-existing DOM-fingerprint stability proof, which any Show-gated mount breaks the moment its data first resolves"
    - "A measured layout dimension (uPlot's own y-axis gutter width) is reported OUTWARD via a callback prop (onGutterMeasured) so a sibling element's CSS can be set to the exact same number, making a visual alignment claim ('same left gutter') true by construction rather than by matching two independently-tuned guesses"
    - "Pure data-preparation functions (buildHorizontalSliceSeries/buildVerticalSliceValues) are exported separately from the chart-rendering component that calls them, so a 'N points, read from the grid, broken at every categorical cell' contract is testable without mounting uPlot or a canvas"

key-files:
  created:
    - src/app/components/ResultColumn/SliceChart.tsx
    - src/app/components/ResultColumn/SweepLegend.tsx
    - src/app/components/ResultColumn/SweepCaption.tsx
    - tests/app/slice-charts.browser.test.ts
    - tests/app/sweep-caption.browser.test.ts
  modified:
    - src/app/components/ResultColumn/HeatmapPanel.tsx
    - src/sweep/sweep-grid.ts
    - src/app/state.ts

key-decisions:
  - "HeatmapPanel.tsx now wires displayedMetric() into paintSweepField's metric option (Rule 2): the file's own prior comment flagged this as 'plan 07-06's job', but 07-06-PLAN.md's actual files_modified excludes HeatmapPanel.tsx, and without this wiring the metric toggle 07-06 builds would have zero visible effect on the field, contradicting this plan's own key_link that a metric change re-colors all three (field, slices, legend) from one source"
  - "paint-contour.ts's own per-metric contour-line bug (its local getRampValues never routes drawdown/annualized through value-to-color.ts's bandLevelsForMetric) was deliberately left untouched: 07-09-PLAN.md (wave 4) already declares src/heatmap/paint-contour.ts in its own files_modified and owns that fix"
  - "SweepGridMeta.holdingPeriodBars added as OPTIONAL (Rule 2): the caption's fixed-period wording needs the real requested bar count, which meta.holdingYears has stayed a deferred 0 for since 07-05-PLAN.md -- optional so the five pre-existing SweepGridMeta object literals in tests/benches outside this plan's scope keep compiling unchanged"
  - "The vertical slice is a hand-rolled Canvas 2D polyline, not uPlot: uPlot's independent variable is always its own x axis with no transpose, so a leverage-on-y chart cannot be a uPlot configuration -- 07-UI-SPEC.md's E4 uPlot instruction is a planner default this plan's own <planner_assumptions> already flagged as a departure"
  - "Row/column picking (when no crosshair cell is committed, which is always true within this plan's own scope, since 07-08 owns the crosshair) falls back to the CURRENT single-run parameters (backtestRequest().leverage/entryDate), resolved to the nearest grid row/column via the live grid's own meta.leverages/meta.entryDates rather than sweep-grid.ts's rowForLeverage, which assumes the full 50-row axis and would misindex a coarse-pass grid"
  - "SweepCaption accepts an optional failedCellCount override prop (defaulting to the real sweepFailedCellCount() signal) purely for deterministic testability of the E6 error line, without simulating a real Worker-pool chunk failure; HeatmapPanel.tsx never passes it, so production always reads the live signal"

patterns-established:
  - "Diverging metrics (multiple/annualized) render their five legend ticks via legendTicksForMetric directly; only 'multiple' additionally renders a separate domain-end row, because legendTicksForMetric('annualized') already bakes the clipped-domain wording into its own first/last tick labels, while 'multiple's five ticks are the plain interior LEGEND_TICK_MULTIPLES"

requirements-completed: [VIZ-01, VIZ-02, VIZ-04]

coverage:
  - id: D1
    description: "The horizontal slice chart (VIZ-01) is a direct read of one row of the cached grid via uPlot, sharing the field's entry-date axis, never triggering a sweep"
    requirement: VIZ-01
    verification:
      - kind: unit
        ref: "tests/app/slice-charts.browser.test.ts -- buildHorizontalSliceSeries returns 200 points for a 200-col grid, reading the exact stored multiple at a given cell"
        status: pass
      - kind: automated_ui
        ref: "tests/app/slice-charts.browser.test.ts -- changing the displayed metric updates the slice without changing sweepGeneration()"
        status: pass
    human_judgment: false
  - id: D2
    description: "The vertical slice chart (VIZ-02) is a hand-rolled Canvas 2D polyline, a direct read of one column of the cached grid, sharing the field's leverage axis row-for-row via the same gridRowToDisplayY mapping"
    requirement: VIZ-02
    verification:
      - kind: unit
        ref: "tests/app/slice-charts.browser.test.ts -- buildVerticalSliceValues returns 50 points for a 50-row grid, reading the exact stored multiple at a given cell"
        status: pass
      - kind: automated_ui
        ref: "tests/app/slice-charts.browser.test.ts -- at the narrowest supported viewport the vertical slice canvas mounts and its leverage tick source yields at least three ticks"
        status: pass
    human_judgment: false
  - id: D3
    description: "Both slices break the line at a ruined, incomplete, or annualized-undefined cell rather than interpolating through it"
    verification:
      - kind: unit
        ref: "tests/app/slice-charts.browser.test.ts -- a ruined cell in the horizontal series and an incomplete cell in the vertical series both produce null at that index; an annualized cell carrying the undefined sentinel also breaks"
        status: pass
    human_judgment: false
  - id: D4
    description: "The horizontal slice and the heatmap field share the same left gutter width, by construction"
    verification:
      - kind: automated_ui
        ref: "tests/app/slice-charts.browser.test.ts -- the field wrapper's computed padding-left equals a standalone chart's own measured y-axis gutter, built from the same real grid/metric"
        status: pass
    human_judgment: false
  - id: D5
    description: "The two-variant legend: five continuous ticks at true ramp positions plus two categorical swatches for the diverging metric, breakeven emphasised, fixed domain-end labels; the sequential drawdown variant's five ticks with no emphasis; no tick-label collision at real width"
    requirement: VIZ-04
    verification:
      - kind: unit
        ref: "tests/app/slice-charts.browser.test.ts -- diverging legend exactly five ticks + two swatches with one emphasised tick; end labels exactly '0.01x and below'/'100.00x and above'; drawdown legend exactly five ticks '0.00%'..'80.00% and above' with none emphasised; both swatch labels exact under all three metrics; no two tick label bounding boxes overlap for either variant"
        status: pass
    human_judgment: false
  - id: D6
    description: "The VIZ-04 mode statement and the VIZ-10 caveat sit inside the sweep panel's own screenshot region, describing the PAINTED grid, never a pending mode change"
    requirement: VIZ-04
    verification:
      - kind: unit
        ref: "tests/app/sweep-caption.browser.test.ts -- fixed-period text exactly 'Every cell held for 10.0/10.5 years.' for 2520/2646 bars; open-ended text contains 'end of data' and a 10-char ISO date, never 'today'; both VIZ10_CAVEAT_SENTENCES render verbatim; a forced failure count renders a third line while lines 1/2 remain"
        status: pass
      - kind: automated_ui
        ref: "tests/app/sweep-caption.browser.test.ts -- both caption lines' bounding boxes fall inside [data-testid=screenshot-region]; a real mid-sweep mode change (clicking the fixed-period radio) leaves the caption matching the newly painted grid's own meta.holdMode"
        status: pass
    human_judgment: false

duration: ~50min
completed: 2026-08-23
status: complete
---

# Phase 07 Plan 07: Marginal Slice Charts, Two-Variant Legend, and Caption Strip Summary

**The heatmap field now ships with its two 1D cuts (a uPlot entry-date slice and a hand-rolled Canvas 2D leverage slice, sharing the field's own axes and breaking at every categorical cell), a two-variant legend swapped by the active metric, and a caption strip whose VIZ-04 mode statement and VIZ-10 caveat travel inside the field's own screenshot region.**

## Performance

- **Duration:** ~50min
- **Completed:** 2026-08-23
- **Tasks:** 3
- **Files modified:** 8 (5 created, 3 modified)

## Accomplishments

- `SliceChart.tsx`'s `HorizontalSliceChart` (VIZ-01) follows `EquityCurveChart.tsx`'s uPlot destroy-and-recreate pattern exactly: log scale via `logDecadeSplits`/`formatLogAxisValue` only for the `multiple` metric, `onThemeChange`-driven rebuilds, and a measured y-axis gutter reported outward via `onGutterMeasured` so `HeatmapPanel.tsx` can give the field canvas the identical left padding -- "same left gutter" is true by construction, proven by an equality assertion against an independently mounted standalone chart built from the same real grid.
- `SliceChart.tsx`'s `VerticalSliceChart` (VIZ-02) is a hand-rolled Canvas 2D polyline, per this plan's own flagged departure from `07-UI-SPEC.md`'s uPlot instruction (uPlot has no transpose): its row-to-pixel mapping reuses `paint-contour.ts`'s own `gridRowToDisplayY` at the field's own `heightPx`/`rows`, and its leverage ticks come from `integerLeverageTicks`, the field's own tick source.
- Both slices break the line (a `null` in the uPlot series, a lifted pen in the Canvas polyline) at every `CELL_FLAG_RUINED`/`CELL_FLAG_INCOMPLETE` cell, and at every `annualized` cell carrying the non-finite `ANNUALIZED_UNDEFINED` sentinel -- proven directly against the exported pure `buildHorizontalSliceSeries`/`buildVerticalSliceValues` functions, independent of uPlot/canvas rendering.
- `SweepLegend.tsx` reimplements the Phase 6 mockup's `renderLegend` layout as a Solid component: the diverging variant (`multiple`/`annualized`) gets five true-position ticks plus a separate domain-end row (`multiple` only -- `annualized`'s own ticks already carry that wording); the sequential `drawdown` variant gets five ticks with no emphasis. Both variants share the same two detached categorical swatches.
- `SweepCaption.tsx` mounts inside `HeatmapPanel.tsx`'s own `screenshot-region`, reading the PAINTED grid's `meta.holdMode`/`meta.holdingPeriodBars`/`meta.endOfDataDate` (never the pending request) for the VIZ-04 mode statement, `VIZ10_CAVEAT_SENTENCES` for the caveat, and an optional third line when `sweepFailedCellCount()` is nonzero.
- Two Rule-2 additions kept the plan's own promises true end to end: `HeatmapPanel.tsx` now wires `displayedMetric()` into the field's own paint call (previously hardcoded to `'multiple'`), and `SweepGridMeta` gained an optional `holdingPeriodBars` field so the caption has a real bar count to read in fixed mode (`meta.holdingYears` has stayed a deferred `0` since 07-05).

## Task Commits

Each task was committed in the pairing the shared files (`HeatmapPanel.tsx`, `tests/app/slice-charts.browser.test.ts`) forced:

1. **Tasks 1 + 2: marginal slice charts and the two-variant sweep legend** - `b029c7b` (feat)
2. **Task 3: sweep caption strip with the VIZ-04 mode statement and VIZ-10 caveat** - `17793a2` (feat)

## Files Created/Modified

- `src/app/components/ResultColumn/SliceChart.tsx` - `HorizontalSliceChart`, `VerticalSliceChart`, `buildHorizontalSliceSeries`, `buildVerticalSliceValues`, `nearestRowForLeverage`, `nearestColForEntryDate`
- `src/app/components/ResultColumn/SweepLegend.tsx` - `SweepLegend`
- `src/app/components/ResultColumn/SweepCaption.tsx` - `SweepCaption`
- `src/app/components/ResultColumn/HeatmapPanel.tsx` - mounts all three, wires `displayedMetric()` into the field paint, keeps the field canvas's left padding in sync with the horizontal slice's measured gutter
- `src/sweep/sweep-grid.ts` - `SweepGridMeta.holdingPeriodBars` (optional)
- `src/app/state.ts` - `buildSweepGridMeta` now populates `holdingPeriodBars`
- `tests/app/slice-charts.browser.test.ts` - Tasks 1/2 coverage
- `tests/app/sweep-caption.browser.test.ts` - Task 3 coverage

## Decisions Made

- **`HeatmapPanel.tsx` mounts every new element unconditionally**, even before any sweep pass has ever resolved (`grid: SweepGrid | null` throughout), rendering the SAME DOM/chart shape with empty data rather than being `Show`-gated. This was a mid-execution correction: gating on `grid !== null` broke `tests/app/sweep-progressive.browser.test.ts`'s pre-existing DOM-fingerprint stability proof (new elements appearing the moment the coarse pass first resolves reads as a "progress affordance" to that test). uPlot's own DOM shape is a function of its `options` (series/axis config), not its data, so building the chart with zero-length arrays before any grid exists and rebuilding with real data once it resolves keeps the fingerprint stable.
- **`HeatmapPanel.tsx` now wires `displayedMetric()` into the field's own paint call** (Rule 2) rather than leaving the file's prior hardcoded `'multiple'` in place -- see `key-decisions` in the frontmatter for the full reasoning.
- **`paint-contour.ts`'s own per-metric contour-line bug was deliberately left untouched** -- it belongs to `07-09-PLAN.md` (wave 4), which already declares that file in its own `files_modified`.
- **`SweepGridMeta.holdingPeriodBars` is optional**, not required, specifically so the five pre-existing `SweepGridMeta` object literals in `tests/app/sweep-tracer.browser.test.ts`, `tests/sweep/cancellation.test.ts`, `bench/sweep-progressive.bench.test.ts`, `bench/sweep.bench.test.ts` and `bench/heatmap-form-2.bench.test.ts` (none in this plan's scope) keep compiling unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Wired `displayedMetric()` into `HeatmapPanel.tsx`'s field paint call**
- **Found during:** Task 1 (mounting the slices, which needed to read the same active metric the field paints)
- **Issue:** `HeatmapPanel.tsx` hardcoded `metric: 'multiple'` in its `paintSweepField` call, with a comment noting the wiring was "plan 07-06's job" -- but 07-06-PLAN.md's actual `files_modified` excludes `HeatmapPanel.tsx`, so nothing in this wave would have made the metric toggle 07-06 builds visibly affect the field, contradicting this plan's own `key_links` promise that a metric change "re-colors all three [field, slices, legend] from one source."
- **Fix:** `HeatmapPanel.tsx`'s `repaint()` now reads `displayedMetric()` instead of the hardcoded literal, tracked in its own `createEffect`.
- **Files modified:** `src/app/components/ResultColumn/HeatmapPanel.tsx`
- **Verification:** `tests/app/slice-charts.browser.test.ts`'s metric-change test; `npm run typecheck`
- **Committed in:** `b029c7b` (Task 1/2 commit)

**2. [Rule 2 - Missing Critical] Added `SweepGridMeta.holdingPeriodBars` and populated it in `buildSweepGridMeta`**
- **Found during:** Task 3 (the caption's fixed-period wording)
- **Issue:** The live grid's `meta.holdingYears` has stayed a deferred `0` since 07-05-PLAN.md ("Deferred to the plan that surfaces this in the UI"), so there was no field anywhere on the grid carrying the actual requested bar count for a fixed-mode sweep -- the caption could not have produced the plan's own required exact text ("Every cell held for 10.0 years.") without it.
- **Fix:** Added an optional `holdingPeriodBars: number | null` field to `SweepGridMeta` (`src/sweep/sweep-grid.ts`) and populated it in `buildSweepGridMeta` (`src/app/state.ts`) from the request that dispatched the sweep.
- **Files modified:** `src/sweep/sweep-grid.ts`, `src/app/state.ts`
- **Verification:** `tests/app/sweep-caption.browser.test.ts`'s two exact-text fixed-period tests; `npm run typecheck`; confirmed the five pre-existing `SweepGridMeta` object literals outside this plan's files still compile (`npm run typecheck` covers the whole repo)
- **Committed in:** `17793a2` (Task 3 commit)

**3. [Rule 1 - Bug] Removed the `Show`-gated mounting of the slices/caption that broke DOM-fingerprint stability**
- **Found during:** Task 1, while running the full regression suite before committing
- **Issue:** `HeatmapPanel.tsx`'s first draft wrapped `HorizontalSliceChart`/`VerticalSliceChart`/`SweepCaption` in `<Show when={grid !== null}>`, which added a large new DOM subtree the instant the coarse pass first resolved -- `tests/app/sweep-progressive.browser.test.ts`'s pre-existing "no progress affordance anywhere in the DOM" assertion (a before/after DOM-element fingerprint comparison across that exact transition) failed.
- **Fix:** Mounted every new element unconditionally with `grid: SweepGrid | null` props, building the same chart/DOM shape with empty data before the first grid exists (see `key-decisions` above for why this works for uPlot specifically).
- **Files modified:** `src/app/components/ResultColumn/SliceChart.tsx`, `src/app/components/ResultColumn/SweepCaption.tsx`, `src/app/components/ResultColumn/HeatmapPanel.tsx`
- **Verification:** `tests/app/sweep-progressive.browser.test.ts` green again; `tests/app/sweep-tracer.browser.test.ts` green
- **Committed in:** `b029c7b`/`17793a2` (the fix landed before either commit was made; no separate commit needed)

---

**Total deviations:** 3 auto-fixed (2 Rule 2, 1 Rule 1)
**Impact on plan:** All three were necessary for the plan's own stated contracts to hold end to end (the metric toggle actually affecting the field, the caption having real data to read, and not regressing a prior plan's own DOM-stability proof). No scope creep beyond what each required.

## Issues Encountered

None beyond the deviations above, which were resolved during execution before any commit landed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `crosshairCell()` (07-08's territory) is already read by both slice charts' row/column resolution (`resolveFixedRow`/`resolveFixedCol`), falling back to the current single-run parameters when unset -- 07-08 needs no signature change to make the crosshair drive the slices once it starts writing that signal.
- `paint-contour.ts`'s per-metric contour-line bug (drawdown/annualized routed through the wrong array and the wrong band levels in the marching-squares stroke pass) is a known, pre-existing, separately-owned gap: 07-09-PLAN.md already declares `src/heatmap/paint-contour.ts` in its own `files_modified`.
- `SweepGridMeta.holdingPeriodBars` is available for any later plan that needs the live grid's own requested bar count.
- No blockers.

## Self-Check: PASSED

All 8 files this plan created or modified are tracked (`git status --short` shows a clean tree after the final commit). Both commit hashes this SUMMARY cites (`b029c7b`, `17793a2`) are present in `git log`.

---
*Phase: 07-sweep-engine-and-the-heatmap*
*Completed: 2026-08-23*
