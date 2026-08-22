/**
 * .planning/phases/06-heatmap-design-pass/mockups/forms/form-2-filled-contour.ts
 *
 * D-02 form 2: the pork-chop plot -- the same 10,000-cell field as form 1, painted as smooth
 * filled iso-contour bands rather than one flat colour per fixture cell, with band boundaries
 * (including breakeven) stroked on top. PROJECT.md records the pork-chop plot as the owner's own
 * stated intuition for this heatmap, so this form is on trial rather than assumed (06-03-PLAN.md
 * objective) -- built to the same standard as every other form: same fixture, same colour
 * function (`field-sampler.ts`'s `resampleField`, itself built on `valueToColor`), same legend
 * and caveat (`mockup-runtime.ts`), own geometry (D-12).
 *
 * The base pass never builds contour polygons: `resampleField` bilinearly resamples the field at
 * DISPLAY resolution and quantises into `BAND_LEVELS`' bands (round multiples, not an even split
 * of ramp position), so the band edges come out
 * smooth and curved for free, with no polygon stitching or self-intersection risk (this plan's
 * own "Resolved before execution" note). The annotation pass strokes those same band boundaries
 * with `marchingSquaresSegments`, run over the field's RAMP POSITIONS (not raw metric values) at
 * each of `BAND_LEVELS`' own values -- the identical space `resampleField`'s own quantisation
 * operates in, so a stroked boundary always lands exactly on the base pass's own visible band
 * edge, never merely close to it.
 */

import { CELL_FLAG_RUINED, type SweepFixture } from '../../../../../src/data/sweep-fixture-format.ts'
import { RUIN_BASE_RGBA, rampPositionFor } from '../../../../../src/colorscale/value-to-color.ts'
import { integerLeverageTicks, makeHatchPattern } from '../../../../../src/heatmap/hatch-pattern.ts'
import type { MockupGeometry } from '../shared/mockup-runtime.ts'
import { BAND_LEVELS, resampleField, type Metric } from '../../../../../src/heatmap/field-sampler.ts'
import { marchingSquaresSegments } from '../../../../../src/heatmap/iso-lines.ts'

export type { Metric }

/** D-12: form 2 is taller than form 1 (240 vs 200 display px) because a contour form wants a
 * smoother field and less vertical compression than the dense grid's near-square cells need.
 * `cellSizePx` is declared as `widthPx / cols` (4px), matching form 1's own value -- per
 * `MockupGeometry`'s own doc comment, a form whose geometry is not a uniform grid still declares
 * the display pixel size its canvas actually renders at, and the column dimension is the more
 * representative of the two here since the field itself is continuously resampled, not diced
 * into discrete per-cell rectangles. */
export const FORM_2_GEOMETRY: MockupGeometry = {
  cols: 200,
  rows: 50,
  cellSizePx: 4,
  widthPx: 800,
  heightPx: 240,
}

/** Left gutter width (leverage row labels) and bottom gutter height (entry-year column labels),
 * in display pixels -- the identical values `form-1-dense-grid.ts` reserves, kept consistent
 * across forms for comparability. Reserved from the SAME canvas `FORM_2_GEOMETRY` declares, never
 * adding to its total size. */
const AXIS_GUTTER_LEFT_PX = 36
const AXIS_GUTTER_BOTTOM_PX = 16

export interface FieldRect {
  x: number
  y: number
  width: number
  height: number
}

/** The field's own paint rectangle within a `canvasWidthPx` by `canvasHeightPx` canvas: the full
 * canvas area minus the axis-label gutter. Exported so `bench/heatmap-form-2.bench.test.ts`
 * computes sample-pixel positions from this single definition rather than a second,
 * independently-drifting copy of the same arithmetic (mirrors `form-1-dense-grid.ts`'s own
 * `fieldRect`). */
export function fieldRect(canvasWidthPx: number, canvasHeightPx: number): FieldRect {
  return {
    x: AXIS_GUTTER_LEFT_PX,
    y: 0,
    width: canvasWidthPx - AXIS_GUTTER_LEFT_PX,
    height: canvasHeightPx - AXIS_GUTTER_BOTTOM_PX,
  }
}

/** The BREAKEVEN band boundary's own ramp position: `rampPositionFor(1.0)`, which
 * `field-sampler.ts`'s `BAND_LEVELS` construction guarantees is exactly `0.5` (an entry in
 * `BAND_LEVELS` itself, never merely close to one). Stroked heavier and in the text colour so the
 * reader's eye finds breakeven first (D-13) -- the question this tool exists to answer. */
const BREAKEVEN_RAMP_POSITION = rampPositionFor(1.0)

/**
 * Converts a fractional GRID column (as `iso-lines.ts`'s `marchingSquaresSegments` returns, in
 * the fixture's own unflipped column indexing) to a display-pixel x-coordinate within `field`,
 * using the exact inverse of `field-sampler.ts`'s own pixel-to-grid mapping, so a stroked
 * boundary registers exactly against the base pass's own painted pixels rather than merely near
 * them.
 */
function gridColToDisplayX(colF: number, field: FieldRect, cols: number): number {
  const cellWidthPx = field.width / cols
  return field.x + (colF + 0.5) * cellWidthPx - 0.5
}

/**
 * Converts a fractional GRID row to a display-pixel y-coordinate within `field`, applying the
 * same A-E5 vertical flip `field-sampler.ts`'s `resampleField` bakes in: fixture row 0 (1.00x)
 * paints at the BOTTOM of the field, matching form 1's own convention.
 */
function gridRowToDisplayY(rowF: number, field: FieldRect, rows: number): number {
  const cellHeightPx = field.height / rows
  const imgRowF = rows - 1 - rowF
  return field.y + (imgRowF + 0.5) * cellHeightPx - 0.5
}

function getCssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value === '' ? fallback : value
}

/** Reused across calls so a repeat paint's cost reflects painting the ramp-position field, not
 * allocating it (mirrors `field-sampler.ts`'s own reused-buffer discipline for `resampleField`). */
let cachedRampValues: Float64Array | undefined
let cachedRampValuesLength = -1

/** The fixture's `metric` array, transformed into ramp positions once per repaint (not once per
 * marching-squares call -- `BAND_LEVELS` has twelve entries, and this array is shared across all
 * twelve `marchingSquaresSegments` calls below). Same space `resampleField`'s own quantisation
 * operates in (see this file's header comment), which is what keeps the annotation pass
 * registered against the base pass. */
function getRampValues(fixture: SweepFixture, metric: Metric): Float64Array {
  const cellCount = fixture.cols * fixture.rows
  if (cachedRampValues === undefined || cachedRampValuesLength !== cellCount) {
    cachedRampValues = new Float64Array(cellCount)
    cachedRampValuesLength = cellCount
  }
  const values = metric === 'multiple' ? fixture.multiples : fixture.drawdowns
  for (let i = 0; i < cellCount; i++) {
    cachedRampValues[i] = rampPositionFor(values[i] ?? 0)
  }
  return cachedRampValues
}

/**
 * Draws integer leverage row labels (1x, 2x, 3x ...) into the left gutter and entry-year column
 * labels (every 20th fixture column) into the bottom gutter, identically to
 * `form-1-dense-grid.ts`'s own `drawAxisLabels` (including its value-interpolated row placement),
 * at this form's own `field` geometry.
 */
function drawAxisLabels(ctx: CanvasRenderingContext2D, fixture: SweepFixture, field: FieldRect): void {
  const cellWidthPx = field.width / fixture.cols
  const cellHeightPx = field.height / fixture.rows
  const fontMono = getCssVar('--font-mono', 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace')
  const fontSizeLabel = getCssVar('--font-size-label', '12px')
  const textColor = getCssVar('--color-text-muted', '#5b6169')

  ctx.save()
  ctx.font = `${fontSizeLabel} ${fontMono}`
  ctx.fillStyle = textColor

  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  for (const tick of integerLeverageTicks(fixture.meta.leverages)) {
    const imgRowF = fixture.rows - 1 - tick.rowF
    const y = field.y + imgRowF * cellHeightPx + cellHeightPx / 2
    ctx.fillText(`${tick.leverage}x`, 2, y)
  }

  ctx.textBaseline = 'bottom'
  ctx.textAlign = 'center'
  for (let col = 0; col < fixture.cols; col += 20) {
    const x = field.x + col * cellWidthPx + cellWidthPx / 2
    const entryDate = fixture.meta.entryDates[col] ?? ''
    const label = entryDate.slice(0, 4)
    ctx.fillText(label, x, ctx.canvas.height - 1)
  }

  ctx.restore()
}

/**
 * Paints `fixture`'s `metric` array as smooth filled iso-contour bands (D-02 form 2): the base
 * pass calls `resampleField` and writes its RGBA buffer with one `putImageData` directly at
 * display resolution (`resampleField` already resamples at the field's own display size, so no
 * upscale/`drawImage` step is needed the way form 1's dense-cell buffer requires one). The
 * annotation pass strokes every `BAND_LEVELS` boundary via `marchingSquaresSegments` over the
 * ramp-position field, one `beginPath`/`stroke` pair per level, with the breakeven boundary
 * emphasised (2px, `var(--color-text)`) over every other boundary (1px, `var(--color-border)`) so
 * the reader's eye finds breakeven first (D-13). Overlays the ruin hatch under a clip path (D-18)
 * exactly as form 1 does; incomplete cells stay flat, untextured `INCOMPLETE_RGBA` from the base
 * pass (D-20). Draws the same axis labels form 1 draws.
 */
export function paintFilledContour(ctx: CanvasRenderingContext2D, fixture: SweepFixture, metric: Metric): void {
  const field = fieldRect(ctx.canvas.width, ctx.canvas.height)
  const { cols, rows } = fixture

  const buffer = resampleField(fixture, metric, { widthPx: field.width, heightPx: field.height })
  const imageData = new ImageData(buffer, field.width, field.height)

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.putImageData(imageData, field.x, field.y)

  const rampValues = getRampValues(fixture, metric)

  const borderColor = getCssVar('--color-border', '#d0d3d8')
  const textColor = getCssVar('--color-text', '#14161a')

  for (const level of BAND_LEVELS) {
    const segments = marchingSquaresSegments(rampValues, cols, rows, level, fixture.flags)
    if (segments.length === 0) continue

    const isBreakeven = Math.abs(level - BREAKEVEN_RAMP_POSITION) < 1e-9
    ctx.save()
    ctx.beginPath()
    for (const segment of segments) {
      const x1 = gridColToDisplayX(segment.x1, field, cols)
      const y1 = gridRowToDisplayY(segment.y1, field, rows)
      const x2 = gridColToDisplayX(segment.x2, field, cols)
      const y2 = gridRowToDisplayY(segment.y2, field, rows)
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
    }
    ctx.lineWidth = isBreakeven ? 2 : 1
    ctx.strokeStyle = isBreakeven ? textColor : borderColor
    ctx.stroke()
    ctx.restore()
  }

  const cellWidthPx = field.width / cols
  const cellHeightPx = field.height / rows

  let anyRuined = false
  ctx.save()
  ctx.beginPath()
  for (let fixtureRow = 0; fixtureRow < rows; fixtureRow++) {
    const imgRow = rows - 1 - fixtureRow
    for (let col = 0; col < cols; col++) {
      const cellIndex = fixtureRow * cols + col
      const flags = fixture.flags[cellIndex] ?? 0
      if ((flags & CELL_FLAG_RUINED) !== 0) {
        anyRuined = true
        ctx.rect(field.x + col * cellWidthPx, field.y + imgRow * cellHeightPx, cellWidthPx, cellHeightPx)
      }
    }
  }
  if (anyRuined) {
    ctx.clip()
    const pattern = makeHatchPattern(ctx, RUIN_BASE_RGBA)
    ctx.fillStyle = pattern
    ctx.fillRect(field.x, field.y, field.width, field.height)
  }
  ctx.restore()

  drawAxisLabels(ctx, fixture, field)
}
