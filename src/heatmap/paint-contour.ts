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
 * The fill itself is routed through a `FillPath` seam (a named union): this task's only member is
 * `'resample'`, the per-pixel `resampleField` path (D-09's documented fallback, D-08's permanent
 * test oracle). Plan 07-04's polygon-fill path adds a second member here and is a swap at this
 * seam, not a rewrite of this file.
 *
 * Reads chrome colours from CSS custom properties via `getComputedStyle` at render time,
 * following `EquityCurveChart.tsx`'s header rule (canvas gets no free `prefers-color-scheme`
 * styling) -- the heatmap palette itself does not swap by theme.
 */

import { CELL_FLAG_RUINED } from '../data/sweep-fixture-format.ts'
import { RUIN_BASE_RGBA, rampPositionFor } from '../colorscale/value-to-color.ts'
import { makeHatchPattern } from './hatch-pattern.ts'
import { BAND_LEVELS, resampleField, type Metric } from './field-sampler.ts'
import { marchingSquaresSegments } from './iso-lines.ts'
import type { SweepGrid } from '../sweep/sweep-grid.ts'

/** This task's only fill path: the per-pixel `resampleField` bilinear resample. Plan 07-04 adds
 * `'polygon'` here; every switch over this union in this file must be exhaustive so that addition
 * is a compile-time-enforced swap, not a silent no-op. */
export type FillPath = 'resample'

export interface SweepPaintOptions {
  metric: Metric
  /** Defaults to `'resample'` -- this task's only implemented member. */
  fillPath?: FillPath
}

/** The BREAKEVEN band boundary's own ramp position: `rampPositionFor(1.0)`, which
 * `field-sampler.ts`'s `BAND_LEVELS` construction guarantees is exactly `0.5`. Stroked heavier
 * and in the text colour (D-13), matching the mockup's own emphasis. */
const BREAKEVEN_RAMP_POSITION = rampPositionFor(1.0)

function getCssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value === '' ? fallback : value
}

/**
 * Converts a fractional GRID column (as `iso-lines.ts`'s `marchingSquaresSegments` returns, in
 * the grid's own unflipped column indexing) to a display-pixel x-coordinate, the exact inverse of
 * this file's own pixel-to-grid mapping (mirrors the mockup's `gridColToDisplayX`, generalized to
 * `cols` rather than the mockup's fixed `FORM_2_GEOMETRY.cols`).
 */
function gridColToDisplayX(colF: number, widthPx: number, cols: number): number {
  const cellWidthPx = widthPx / cols
  return (colF + 0.5) * cellWidthPx - 0.5
}

/**
 * Converts a fractional GRID row to a display-pixel y-coordinate, applying the same A-E5
 * vertical flip the mockup's `resampleField`/`gridRowToDisplayY` bake in: grid row 0 (the lowest
 * leverage) paints at the BOTTOM.
 */
function gridRowToDisplayY(rowF: number, heightPx: number, rows: number): number {
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

function getRampValues(grid: SweepGrid, metric: Metric): Float64Array {
  const cellCount = grid.cols * grid.rows
  if (cachedRampValues === undefined || cachedRampValuesLength !== cellCount) {
    cachedRampValues = new Float64Array(cellCount)
    cachedRampValuesLength = cellCount
  }
  const values = metric === 'multiple' ? grid.multiples : grid.drawdowns
  for (let i = 0; i < cellCount; i++) {
    cachedRampValues[i] = rampPositionFor(values[i] ?? 0)
  }
  return cachedRampValues
}

/** This task's only `FillPath` member: the per-pixel bilinear resample, written directly at
 * display resolution via a single `putImageData` (no upscale/`drawImage` step needed, mirroring
 * the mockup). */
function paintResampleFill(ctx: CanvasRenderingContext2D, grid: SweepGrid, metric: Metric, widthPx: number, heightPx: number): void {
  const buffer = resampleField(grid, metric, { widthPx, heightPx })
  const imageData = new ImageData(buffer, widthPx, heightPx)
  ctx.clearRect(0, 0, widthPx, heightPx)
  ctx.putImageData(imageData, 0, 0)
}

function paintFill(ctx: CanvasRenderingContext2D, grid: SweepGrid, metric: Metric, fillPath: FillPath, widthPx: number, heightPx: number): void {
  switch (fillPath) {
    case 'resample':
      paintResampleFill(ctx, grid, metric, widthPx, heightPx)
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
 * pass strokes every `BAND_LEVELS` boundary via `marchingSquaresSegments` over the ramp-position
 * field, with the breakeven boundary emphasised (2px, `var(--color-text)`) over every other
 * boundary (1px, `var(--color-border)`); the ruin-hatch pass fills the union of `CELL_FLAG_RUINED`
 * cells under a clip path, exactly as the mockup does it. Reads `grid.cols`/`grid.rows` for every
 * dimension (F-07): never a hardcoded `200`/`50`.
 */
export function paintSweepField(ctx: CanvasRenderingContext2D, grid: SweepGrid, options: SweepPaintOptions): void {
  const { cols, rows } = grid
  const widthPx = ctx.canvas.width
  const heightPx = ctx.canvas.height
  const fillPath = options.fillPath ?? 'resample'

  paintFill(ctx, grid, options.metric, fillPath, widthPx, heightPx)

  const rampValues = getRampValues(grid, options.metric)

  const borderColor = getCssVar('--color-border', '#d0d3d8')
  const textColor = getCssVar('--color-text', '#14161a')

  for (const level of BAND_LEVELS) {
    const segments = marchingSquaresSegments(rampValues, cols, rows, level, grid.flags)
    if (segments.length === 0) continue

    const isBreakeven = Math.abs(level - BREAKEVEN_RAMP_POSITION) < 1e-9
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
    ctx.lineWidth = isBreakeven ? 2 : 1
    ctx.strokeStyle = isBreakeven ? textColor : borderColor
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
}
