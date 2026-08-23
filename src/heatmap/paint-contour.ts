/**
 * src/heatmap/paint-contour.ts
 *
 * 07-01-PLAN.md Task 2: the production filled-contour renderer, adapted from
 * `.planning/phases/06-heatmap-design-pass/mockups/forms/form-2-filled-contour.ts`'s
 * `paintFilledContour` -- the D-02 form 2 the Phase 6 comparison chose (06-05-SUMMARY.md). Keeps
 * the mockup's two-pass render (a base fill, then `marchingSquaresSegments` strokes over
 * `BAND_LEVELS` with breakeven emphasised) and its ruin-hatch clip-and-fill exactly as painted
 * there, now importing `makeHatchPattern` from the graduated `src/heatmap/hatch-pattern.ts`
 * (07-01 Task 1) instead of `mockup-runtime.ts`.
 *
 * Two adaptations from the mockup: `paintSweepField` takes a live `src/sweep/sweep-grid.ts`
 * `SweepGrid` rather than a static, fixture-loaded `SweepFixture` (they share the same field
 * names and row-major indexing, so every call below reads identically against either); and it
 * reads `grid.cols`/`grid.rows` for every dimension rather than a hardcoded `200`/`50` (F-07), so
 * an arbitrary N by M field renders -- proven by painting a deliberately non-default grid in
 * `tests/app/sweep-tracer.browser.test.ts`.
 *
 * --- D-06/D-07 GATE OUTCOME (07-04-PLAN.md Tasks 2-4): resample ships; polygon was rejected ----
 *
 * The fill is routed through a `FillPath` seam (a named union): `'resample'` and `'polygon'`.
 * **`'resample'` is the SHIPPED default and D-08's permanent test oracle.** `'polygon'`
 * (07-04-PLAN.md Task 1's `polygon-fill.ts` band rings, the O(cells) approach
 * 06-HEATMAP-SPEC.md Finding A ranked first) was built, gated, measured, and REJECTED on
 * evidence -- kept in the source and test trees (never deleted) so a future reader can see why
 * without rebuilding it, and so `bench/heatmap-form-2.bench.test.ts`'s equivalence check keeps
 * running as a live regression detector on the rejected path.
 *
 * Measured on this dev sandbox (`hardwareConcurrency=9`, not the D-17 CI baseline), at the
 * declared 1200x400 shipped-panel geometry over the real committed fixture (`holdMode: 'fixed'`,
 * `holdingYears: 10`, `incompleteCount: 2600`):
 * - Equivalence: 12.92% of field pixels differed from the `'resample'` oracle (2.0% ceiling);
 *   35,532 categorical-cell pixels differed (0 ceiling); 9,677 non-categorical pixels differed
 *   beyond the 2px boundary-proximity tolerance (0 ceiling). Root cause: `resampleField`'s
 *   bilinear stencil smooths a ruined/incomplete cell's colour across its neighbouring cells (any
 *   display pixel whose 4-corner stencil touches a categorical grid point renders categorically),
 *   while `polygon-fill.ts`'s hole rings are exact to the flagged cell's own rectangle -- a
 *   genuine algorithmic disagreement, not a stitching bug.
 * - PERF-05 (repaint on a metric change), BOTH measured geometries, `'polygon'` vs the SHIPPED
 *   `'resample'` + D-09 offscreen cache (this file's own dev-sandbox figures,
 *   `bench/heatmap-form-2.bench.test.ts`'s own recorded info lines carry the authoritative,
 *   re-measured-on-every-run numbers): at the declared 1200x400 shipped-panel geometry, `'polygon'`
 *   measured ~149ms against the 16ms budget (~9.4x over); `'resample'` + D-09 measures ~8.2-8.5ms
 *   (within budget, source of the official PERF-05 row). At the Phase 6 mockup geometry (764x224,
 *   informational only, not gated), `'polygon'` measured ~146-158ms; `'resample'` + D-09 measures
 *   ~7.9-8.1ms.
 *
 * The owner independently reproduced this in the live app, interactively, at the shipped 800x240
 * geometry: with the app's default `holdMode: 'end-of-data'` (no categorical cells), resample
 * measured ~12-15ms and polygon ~16-20ms -- close enough that the bench gate alone looked
 * possibly unrepresentative. With a fixed ~10-year holding period (reintroducing the fixture's
 * ~2,600 contiguous incomplete cells), polygon jumped to ~110-130ms against resample's ~12-13ms,
 * independently reproducing the bench's 149.71ms figure. The polygon path degrades roughly 10x
 * precisely when ruin/incomplete cells appear on screen -- the case the heatmap exists to show --
 * so the committed fixture is a legitimate real user configuration, not a synthetic worst case.
 *
 * **Finding A is NOT closed.** The shipped path is D-09's documented mitigation (below), not the
 * O(cells) polygon rebuild Finding A hoped would make the whole finding evaporate. All four
 * downstream concerns Finding A named stay LIVE: the offscreen cache (implemented below, D-09),
 * the metric-switch breach (a metric change still forces one full resample -- the cache fixes
 * pan/zoom, it does not fix metric switching), the panel-size ceiling (repaint cost is still
 * bounded by `RESAMPLE_INTERNAL_MAX_AREA_PX`, not eliminated), and zoom softness (accepted:
 * `imageSmoothingEnabled` is deliberately on for the upscale draw).
 *
 * Reads chrome colours from CSS custom properties via `getComputedStyle` at render time,
 * following `EquityCurveChart.tsx`'s header rule (canvas gets no free `prefers-color-scheme`
 * styling) -- the heatmap palette itself does not swap by theme.
 */

import { CELL_FLAG_INCOMPLETE, CELL_FLAG_RUINED } from '../data/sweep-fixture-format.ts'
import {
  bandLevelsForMetric,
  emphasizedBandLevelFor,
  INCOMPLETE_RGBA,
  interpolateRamp,
  rampPositionForMetric,
  RUIN_BASE_RGBA,
  type Rgba,
} from '../colorscale/value-to-color.ts'
import { makeHatchPattern } from './hatch-pattern.ts'
import { BAND_LEVELS, resampleField, type Metric } from './field-sampler.ts'
import { marchingSquaresSegments } from './iso-lines.ts'
import { buildBandPolygons } from './polygon-fill.ts'
import { paintShortHorizonRule, shortHorizonColumn } from './short-horizon.ts'
import type { SweepGrid } from '../sweep/sweep-grid.ts'

/** The two selectable fill paths: `'resample'` (07-01, D-08's permanent oracle, and -- per
 * 07-04-PLAN.md Task 3's decision -- the SHIPPED default) and `'polygon'` (07-04-PLAN.md Task 1,
 * gated in Task 2, REJECTED in Task 3 -- kept in the tree, never deleted, so the rejection is
 * checkable rather than merely remembered). Every switch over this union in this file must be
 * exhaustive, so adding a member here is a compile-time-enforced swap, never a silent no-op. */
export type FillPath = 'resample' | 'polygon'

export interface SweepPaintOptions {
  metric: Metric
  /** Defaults to `'resample'` -- the shipped default 07-04-PLAN.md Task 3 decided on. */
  fillPath?: FillPath
}

function getCssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value === '' ? fallback : value
}

/**
 * Converts a fractional GRID column (as `iso-lines.ts`'s `marchingSquaresSegments` and
 * `polygon-fill.ts`'s `buildBandPolygons` both return, in the grid's own unflipped column
 * indexing) to a display-pixel x-coordinate, the exact inverse of this file's own pixel-to-grid
 * mapping (mirrors the mockup's `gridColToDisplayX`, generalized to `cols` rather than the
 * mockup's fixed `FORM_2_GEOMETRY.cols`). Exported so `bench/heatmap-form-2.bench.test.ts`'s
 * equivalence gate can locate a band boundary at the exact same display coordinate this module's
 * own stroke and polygon-fill passes use, rather than a second, independently-drifting copy of
 * this arithmetic.
 */
export function gridColToDisplayX(colF: number, widthPx: number, cols: number): number {
  const cellWidthPx = widthPx / cols
  return (colF + 0.5) * cellWidthPx - 0.5
}

/**
 * Converts a fractional GRID row to a display-pixel y-coordinate, applying the same A-E5
 * vertical flip the mockup's `resampleField`/`gridRowToDisplayY` bake in: grid row 0 (the lowest
 * leverage) paints at the BOTTOM. Exported for the same reason `gridColToDisplayX` is.
 */
export function gridRowToDisplayY(rowF: number, heightPx: number, rows: number): number {
  const cellHeightPx = heightPx / rows
  const imgRowF = rows - 1 - rowF
  return (imgRowF + 0.5) * cellHeightPx - 0.5
}

/** Reused across calls so a repeat paint's cost reflects painting, not allocating (mirrors the
 * mockup's own `cachedRampValues` discipline) -- one ramp position per grid cell, recomputed at
 * the head of every `paintSweepField` call since the underlying `multiples`/`drawdowns` values
 * can have changed. */
let cachedRampValues: Float64Array | undefined
let cachedRampValuesLength = -1

/** Orchestrator-routed fix (originating from 07-07-SUMMARY.md's known-defect report): the
 * metric-to-array selection, exhaustive over `Metric`'s three members so a future fourth metric
 * is a compile-time error here rather than a silent wrong-array read -- the same exhaustiveness
 * discipline `paintFill`'s own `FillPath` switch already documents. Exported for direct,
 * DOM-free unit testing (`tests/heatmap/paint-contour.test.ts`), mirroring this file's own
 * `gridColToDisplayX`/`gridRowToDisplayY` precedent of exporting an internal helper specifically
 * so a regression is checkable without mounting a canvas. */
export function valuesForContourMetric(grid: SweepGrid, metric: Metric): Float32Array {
  switch (metric) {
    case 'multiple':
      return grid.multiples
    case 'drawdown':
      return grid.drawdowns
    case 'annualized':
      return grid.annualized
    default: {
      const exhaustive: never = metric
      throw new Error(`paint-contour: unknown metric "${String(exhaustive)}"`)
    }
  }
}

/** Orchestrator-routed fix: `rampPositionFor` alone is the `multiple` metric's own symlog
 * transform -- calling it unconditionally for every metric (the prior code) mapped `drawdown`'s
 * `[0, 0.8]` fraction and `annualized`'s `[-0.3, 0.3]` fraction through the WRONG domain
 * (`DOMAIN_LOG_MIN/MAX`, a log10 window meant for a return multiple), producing band-crossing
 * geometry that could not agree with `field-sampler.ts`'s own per-metric fill (`rampPositionForMetric`,
 * `resampleField`'s `getRampPositions`). Both the array selection and the ramp-position transform
 * must be metric-aware together -- swapping only the array while still calling the multiple-only
 * transform would still be wrong for `drawdown`/`annualized`. Exported (like
 * `valuesForContourMetric` above) so `tests/heatmap/paint-contour.test.ts` can assert the full
 * fixed pipeline directly, without mounting a canvas -- this function touches no DOM. Reuses the
 * module-level `cachedRampValues` buffer exactly as `paintSweepField` does; safe for sequential
 * test calls since each call fully overwrites the buffer before returning. */
export function getRampValues(grid: SweepGrid, metric: Metric): Float64Array {
  const cellCount = grid.cols * grid.rows
  if (cachedRampValues === undefined || cachedRampValuesLength !== cellCount) {
    cachedRampValues = new Float64Array(cellCount)
    cachedRampValuesLength = cellCount
  }
  const values = valuesForContourMetric(grid, metric)
  for (let i = 0; i < cellCount; i++) {
    cachedRampValues[i] = rampPositionForMetric(values[i] ?? 0, metric)
  }
  return cachedRampValues
}

/**
 * D-09's mitigation for Finding A, and 07-04-PLAN.md Task 3's decided outcome (d09-fallback):
 * resample BELOW display resolution and upscale, rather than resampling at full display
 * resolution every repaint. `RESAMPLE_INTERNAL_MAX_AREA_PX` is anchored to the measured
 * 171,136px / 12.80ms CI figure (06-HEATMAP-SPEC.md Finding A, this file's original 07-01
 * geometry) with headroom below the 16ms PERF-05 budget, not an arbitrary fraction of the
 * display's own area -- at the declared 1200x400 shipped-panel geometry (480,000px) this yields
 * an internal resample close to that same anchor area, which is the number the 12.80ms figure
 * was actually measured against. Below this area, no downscaling happens at all (small canvases
 * already fit the budget at native resolution).
 */
const RESAMPLE_INTERNAL_MAX_AREA_PX = 175_000

function internalResampleDimensions(widthPx: number, heightPx: number): { internalWidthPx: number; internalHeightPx: number } {
  const displayArea = widthPx * heightPx
  if (displayArea <= RESAMPLE_INTERNAL_MAX_AREA_PX) {
    return { internalWidthPx: widthPx, internalHeightPx: heightPx }
  }
  const scale = Math.sqrt(RESAMPLE_INTERNAL_MAX_AREA_PX / displayArea)
  return {
    internalWidthPx: Math.max(1, Math.round(widthPx * scale)),
    internalHeightPx: Math.max(1, Math.round(heightPx * scale)),
  }
}

interface ResampleOffscreenCache {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  internalWidthPx: number
  internalHeightPx: number
  generation: number
  metric: Metric | undefined
  cols: number
  rows: number
}

/** D-09: the offscreen cache is invalidated per DATA or METRIC change (`grid.generation`,
 * `metric`, `cols`, `rows`), never per frame -- a pan/zoom repaint at unchanged data reuses the
 * cached bitmap via `drawImage`'s own upscale, paying no resample cost at all. A metric change
 * still forces one fresh resample (Finding A's own stated limit: the cache fixes pan/zoom, it
 * does not fix metric switching), but that resample now runs at the reduced internal resolution
 * rather than full display resolution. */
let resampleCache: ResampleOffscreenCache | undefined

function ensureResampleCache(internalWidthPx: number, internalHeightPx: number): ResampleOffscreenCache {
  if (
    resampleCache === undefined ||
    resampleCache.internalWidthPx !== internalWidthPx ||
    resampleCache.internalHeightPx !== internalHeightPx
  ) {
    const canvas = document.createElement('canvas')
    canvas.width = internalWidthPx
    canvas.height = internalHeightPx
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('paint-contour: 2D context unavailable for the D-09 offscreen resample cache')
    }
    resampleCache = {
      canvas,
      ctx,
      internalWidthPx,
      internalHeightPx,
      generation: -1,
      metric: undefined,
      cols: -1,
      rows: -1,
    }
  }
  return resampleCache
}

/** The `'resample'` `FillPath` member (D-08's permanent oracle, and -- per 07-04-PLAN.md Task 3's
 * decision -- the shipped default): bilinearly resamples `grid` at a reduced INTERNAL resolution
 * into an offscreen canvas cached across repaints, then draws that cached bitmap upscaled onto
 * `ctx` via `drawImage`. `imageSmoothingEnabled` is left on for the upscale draw specifically
 * (D-09's own stated tradeoff: zoom/upscale softness is accepted so the metric-change repaint
 * itself stays inside budget), even though every other pass in this file disables it for crisp,
 * unblurred strokes and hatch fills.
 */
function paintResampleFill(ctx: CanvasRenderingContext2D, grid: SweepGrid, metric: Metric, widthPx: number, heightPx: number): void {
  const { internalWidthPx, internalHeightPx } = internalResampleDimensions(widthPx, heightPx)
  const cache = ensureResampleCache(internalWidthPx, internalHeightPx)

  const stale =
    cache.generation !== grid.generation ||
    cache.metric !== metric ||
    cache.cols !== grid.cols ||
    cache.rows !== grid.rows

  if (stale) {
    const buffer = resampleField(grid, metric, { widthPx: internalWidthPx, heightPx: internalHeightPx })
    const imageData = new ImageData(buffer, internalWidthPx, internalHeightPx)
    cache.ctx.putImageData(imageData, 0, 0)
    cache.generation = grid.generation
    cache.metric = metric
    cache.cols = grid.cols
    cache.rows = grid.rows
  }

  ctx.clearRect(0, 0, widthPx, heightPx)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(cache.canvas, 0, 0, internalWidthPx, internalHeightPx, 0, 0, widthPx, heightPx)
  ctx.imageSmoothingEnabled = false
}

/** One `BAND_LEVELS` band's own representative colour, cached at its CENTRE ramp position (never
 * its edge), mirroring `field-sampler.ts`'s own (unexported) `BAND_COLORS` construction exactly
 * -- this module does not import that private array, so it re-derives the identical figure from
 * the same public `BAND_LEVELS`/`interpolateRamp` this file already imports, built once at module
 * load rather than per repaint. */
const BAND_FILL_COLORS: readonly Rgba[] = BAND_LEVELS.slice(0, -1).map((level, i) => {
  const upper = BAND_LEVELS[i + 1]!
  return interpolateRamp((level + upper) / 2)
})

function rgbaToCss(rgba: Rgba): string {
  const [r, g, b, a] = rgba
  return `rgba(${r}, ${g}, ${b}, ${a / 255})`
}

/** The categorical branch colour for a cell's own flag byte (D-18 wins over D-20, the identical
 * branch order `field-sampler.ts`'s `categoricalFor`/`valueToColor` already use), or `null` for a
 * plain, valued cell. `polygon-fill.ts`'s `buildBandPolygons` excludes every categorical cell from
 * every band polygon as a hole, so this pass paints their own flat rectangle FIRST, before any
 * band polygon is filled on top -- mirroring `resampleField`'s own categorical override, which
 * this fill path has no other way to reproduce, since a band polygon by construction never
 * touches that area. */
function categoricalFillColor(flags: number): Rgba | null {
  if ((flags & CELL_FLAG_RUINED) !== 0) return RUIN_BASE_RGBA
  if ((flags & CELL_FLAG_INCOMPLETE) !== 0) return INCOMPLETE_RGBA
  return null
}

/** The `'polygon'` `FillPath` member (07-04-PLAN.md Task 2): fills `polygon-fill.ts`'s band rings
 * directly, GPU work proportional to cells rather than JS work proportional to display pixels
 * (06-HEATMAP-SPEC.md Finding A). Every ring vertex is converted through this file's own
 * `gridColToDisplayX`/`gridRowToDisplayY` -- the exact inverse of `resampleField`'s own
 * pixel-to-grid sampling formula (this file's header) -- so a polygon edge lands on the same
 * display coordinate the oracle's own per-pixel classification would, up to the anti-aliasing
 * `bench/heatmap-form-2.bench.test.ts`'s equivalence tolerance already accounts for.
 *
 * REJECTED as the shipped default (07-04-PLAN.md Task 3, this file's own header): kept callable
 * and kept covered by `tests/heatmap/polygon-fill.test.ts` and the bench file's own (now
 * `test.fails`-marked) equivalence check, never deleted, so the rejection stays checkable. */
function paintPolygonFill(ctx: CanvasRenderingContext2D, grid: SweepGrid, metric: Metric, widthPx: number, heightPx: number): void {
  const { cols, rows } = grid
  ctx.clearRect(0, 0, widthPx, heightPx)

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const color = categoricalFillColor(grid.flags[row * cols + col] ?? 0)
      if (color === null) continue
      const x1 = gridColToDisplayX(col, widthPx, cols)
      const x2 = gridColToDisplayX(col + 1, widthPx, cols)
      const y1 = gridRowToDisplayY(row, heightPx, rows)
      const y2 = gridRowToDisplayY(row + 1, heightPx, rows)
      ctx.fillStyle = rgbaToCss(color)
      ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1))
    }
  }

  const rampValues = getRampValues(grid, metric)
  const bands = buildBandPolygons(rampValues, cols, rows, BAND_LEVELS, grid.flags)

  for (let bandIndex = 0; bandIndex < bands.length; bandIndex++) {
    const rings = bands[bandIndex]!
    if (rings.length === 0) continue

    const path = new Path2D()
    for (const ring of rings) {
      const points = ring.points
      const first = points[0]!
      path.moveTo(gridColToDisplayX(first.col, widthPx, cols), gridRowToDisplayY(first.row, heightPx, rows))
      for (let i = 1; i < points.length; i++) {
        const point = points[i]!
        path.lineTo(gridColToDisplayX(point.col, widthPx, cols), gridRowToDisplayY(point.row, heightPx, rows))
      }
      path.closePath()
    }

    ctx.fillStyle = rgbaToCss(BAND_FILL_COLORS[bandIndex]!)
    ctx.fill(path, 'evenodd')
  }
}

function paintFill(ctx: CanvasRenderingContext2D, grid: SweepGrid, metric: Metric, fillPath: FillPath, widthPx: number, heightPx: number): void {
  switch (fillPath) {
    case 'resample':
      paintResampleFill(ctx, grid, metric, widthPx, heightPx)
      return
    case 'polygon':
      paintPolygonFill(ctx, grid, metric, widthPx, heightPx)
      return
    default: {
      const exhaustive: never = fillPath
      throw new Error(`paint-contour: unknown fill path "${String(exhaustive)}"`)
    }
  }
}

/**
 * Paints `grid`'s `options.metric` array onto `ctx`'s full canvas as smooth filled iso-contour
 * bands (D-02 form 2): the base pass fills via `options.fillPath` (`paintFill`); the annotation
 * pass strokes every `bandLevelsForMetric(options.metric)` boundary via `marchingSquaresSegments`
 * over the ramp-position field, with the metric's own emphasised boundary
 * (`emphasizedBandLevelFor`, `null` for `drawdown`) drawn at 2px `var(--color-text)` over every
 * other boundary (1px, `var(--color-border)`); the ruin-hatch pass fills the union of
 * `CELL_FLAG_RUINED` cells under a clip path, exactly as the mockup does it. Reads
 * `grid.cols`/`grid.rows` for every dimension (F-07): never a hardcoded `200`/`50`.
 *
 * Orchestrator-routed fix (07-07-SUMMARY.md's known-defect report): band levels and the
 * emphasised boundary are now resolved per `options.metric` (`bandLevelsForMetric`/
 * `emphasizedBandLevelFor`) rather than the prior hardcoded, `multiple`-only `BAND_LEVELS`/
 * `BREAKEVEN_RAMP_POSITION` -- the array swap in `getRampValues` alone was not sufficient,
 * since `drawdown`'s own band levels include a boundary that lands at ramp position 0.5 by
 * construction (its own 40%-drawdown band edge), which the old hardcoded breakeven check would
 * have wrongly emphasised as if it were a multiple-of-contributed breakeven.
 */
export function paintSweepField(ctx: CanvasRenderingContext2D, grid: SweepGrid, options: SweepPaintOptions): void {
  const { cols, rows } = grid
  const widthPx = ctx.canvas.width
  const heightPx = ctx.canvas.height
  const fillPath = options.fillPath ?? 'resample'

  paintFill(ctx, grid, options.metric, fillPath, widthPx, heightPx)

  const rampValues = getRampValues(grid, options.metric)
  const bandLevels = bandLevelsForMetric(options.metric)
  const emphasizedLevel = emphasizedBandLevelFor(options.metric)

  const borderColor = getCssVar('--color-border', '#d0d3d8')
  const textColor = getCssVar('--color-text', '#14161a')

  for (const level of bandLevels) {
    const segments = marchingSquaresSegments(rampValues, cols, rows, level, grid.flags)
    if (segments.length === 0) continue

    const isEmphasized = emphasizedLevel !== null && Math.abs(level - emphasizedLevel) < 1e-9
    ctx.save()
    ctx.beginPath()
    for (const segment of segments) {
      const x1 = gridColToDisplayX(segment.x1, widthPx, cols)
      const y1 = gridRowToDisplayY(segment.y1, heightPx, rows)
      const x2 = gridColToDisplayX(segment.x2, widthPx, cols)
      const y2 = gridRowToDisplayY(segment.y2, heightPx, rows)
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
    }
    ctx.lineWidth = isEmphasized ? 2 : 1
    ctx.strokeStyle = isEmphasized ? textColor : borderColor
    ctx.stroke()
    ctx.restore()
  }

  const cellWidthPx = widthPx / cols
  const cellHeightPx = heightPx / rows

  let anyRuined = false
  ctx.save()
  ctx.beginPath()
  for (let row = 0; row < rows; row++) {
    const imgRow = rows - 1 - row
    for (let col = 0; col < cols; col++) {
      const cellIdx = row * cols + col
      const flags = grid.flags[cellIdx] ?? 0
      if ((flags & CELL_FLAG_RUINED) !== 0) {
        anyRuined = true
        ctx.rect(col * cellWidthPx, imgRow * cellHeightPx, cellWidthPx, cellHeightPx)
      }
    }
  }
  if (anyRuined) {
    ctx.clip()
    const pattern = makeHatchPattern(ctx, RUIN_BASE_RGBA)
    ctx.fillStyle = pattern
    ctx.fillRect(0, 0, widthPx, heightPx)
  }
  ctx.restore()

  // 07-09-PLAN.md Task 1 (D-29): the short-horizon rule paints LAST, after every band fill, band
  // boundary stroke, and the ruin hatch, so it layers above the whole field rather than floating
  // over it in the DOM. Gated on shortHorizonColumn returning non-null: fixed-period mode (and
  // an open-ended sweep where no column crosses the threshold) gets no rule at all.
  const shortHorizonCol = shortHorizonColumn(grid)
  if (shortHorizonCol !== null) {
    paintShortHorizonRule(ctx, { widthPx, heightPx }, shortHorizonCol, cols)
  }
}
