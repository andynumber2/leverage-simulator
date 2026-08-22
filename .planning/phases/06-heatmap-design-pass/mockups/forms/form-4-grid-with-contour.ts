/**
 * .planning/phases/06-heatmap-design-pass/mockups/forms/form-4-grid-with-contour.ts
 *
 * D-02 form 4: the hybrid position -- the same dense 10,000-cell grid form 1 paints, with exactly
 * TWO iso-lines stroked on top as a sparse annotation, rather than form 2's own filled bands.
 * Form 4's whole question is whether a contour reads better as an ANNOTATION over the dense grid
 * than as the primary mark; it deliberately reuses form 1's base layer verbatim (`paintDenseGrid`,
 * imported, not copied) so the comparison against form 1 measures the annotation's own value, not
 * a geometry difference (D-12 still gives form 4 its own declared geometry, but that geometry is
 * numerically identical to form 1's -- 200x50 cells at 4px, an 800x200 canvas -- which is the
 * point: same base, only the annotation differs).
 */

import type { SweepFixture } from '../../../../../src/data/sweep-fixture-format.ts'
import { rampPositionFor } from '../../../../../src/colorscale/value-to-color.ts'
import type { MockupGeometry } from '../shared/mockup-runtime.ts'
import { marchingSquaresSegments } from '../../../../../src/heatmap/iso-lines.ts'
import { fieldRect, paintDenseGrid, type FieldRect, type Metric } from './form-1-dense-grid.ts'

export type { Metric }

/** D-12: numerically identical to `FORM_1_GEOMETRY` -- form 4's whole question is whether a
 * contour reads better as a sparse ANNOTATION over the dense grid than as the primary mark
 * (D-02), so it deliberately shares form 1's exact base geometry rather than declaring its own;
 * the comparison against form 1 must measure the annotation's own value, not a geometry
 * difference. */
export const FORM_4_GEOMETRY: MockupGeometry = {
  cols: 200,
  rows: 50,
  cellSizePx: 4,
  widthPx: 800,
  heightPx: 200,
}

/** The breakeven boundary's own ramp position: `rampPositionFor(1.0)`, guaranteed by
 * `field-sampler.ts`'s `BAND_LEVELS` construction to be exactly `0.5`. Stroked heavier and in the
 * text colour (D-13), matching form 2's own emphasis. */
const BREAKEVEN_LEVEL = rampPositionFor(1.0)

/** The ruin-adjacent region's own boundary: `rampPositionFor(0.05)`, "you kept 5% of capital" --
 * chosen on its OWN merits (the lowest labelled band edge `field-sampler.ts`'s `BAND_MULTIPLES`
 * declares) rather than inherited from `BAND_LEVELS[1]`'s array position, which would silently
 * track whatever `field-sampler.ts` happens to put second in that array. Stroked in
 * `var(--color-destructive)`, distinct from every other boundary, so the reader can find the edge
 * of the worst-outcome region without it being confused for a routine band edge. */
const RUIN_ADJACENT_LEVEL = rampPositionFor(0.05)

function getCssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value === '' ? fallback : value
}

/** Converts a fractional GRID column (as `iso-lines.ts` returns, in the fixture's own unflipped
 * column indexing) to a display-pixel x-coordinate within `field`, the exact inverse of
 * `field-sampler.ts`'s own pixel-to-grid mapping -- the same formula
 * `form-2-filled-contour.ts` uses, so both contour forms register their strokes identically
 * against the underlying field. */
function gridColToDisplayX(colF: number, field: FieldRect, cols: number): number {
  const cellWidthPx = field.width / cols
  return field.x + (colF + 0.5) * cellWidthPx - 0.5
}

/** Converts a fractional GRID row to a display-pixel y-coordinate within `field`, applying the
 * same A-E5 vertical flip form 1's own `cellDisplayCenter` uses: fixture row 0 (1.00x) paints at
 * the BOTTOM of the field. */
function gridRowToDisplayY(rowF: number, field: FieldRect, rows: number): number {
  const cellHeightPx = field.height / rows
  const imgRowF = rows - 1 - rowF
  return field.y + (imgRowF + 0.5) * cellHeightPx - 0.5
}

/** Reused across calls, the same discipline `form-2-filled-contour.ts`'s `getRampValues` uses. */
let cachedRampValues: Float64Array | undefined
let cachedRampValuesLength = -1

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

function strokeLevel(
  ctx: CanvasRenderingContext2D,
  rampValues: Float64Array,
  fixture: SweepFixture,
  field: FieldRect,
  level: number,
  lineWidthPx: number,
  strokeColor: string,
): void {
  const segments = marchingSquaresSegments(rampValues, fixture.cols, fixture.rows, level, fixture.flags)
  if (segments.length === 0) return

  ctx.save()
  ctx.beginPath()
  for (const segment of segments) {
    const x1 = gridColToDisplayX(segment.x1, field, fixture.cols)
    const y1 = gridRowToDisplayY(segment.y1, field, fixture.rows)
    const x2 = gridColToDisplayX(segment.x2, field, fixture.cols)
    const y2 = gridRowToDisplayY(segment.y2, field, fixture.rows)
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
  }
  ctx.lineWidth = lineWidthPx
  ctx.strokeStyle = strokeColor
  ctx.stroke()
  ctx.restore()
}

/**
 * Paints `fixture`'s `metric` array as form 1's dense grid (`paintDenseGrid`, reused verbatim --
 * base cells, the D-18 ruin hatch, and axis labels all come from that single call), then strokes
 * exactly TWO iso-lines on top as a sparse annotation: the breakeven boundary
 * (`BREAKEVEN_LEVEL`, 2px, `var(--color-text)`) and the ruin-adjacent region's boundary
 * (`RUIN_ADJACENT_LEVEL`, 1.5px, `var(--color-destructive)`). Two lines, not `BAND_LEVELS.length`
 * (form 2's count), because form 4's own position is that a contour is worth having as a sparse annotation
 * -- drawing every band boundary here would make it form 2 with extra steps and would not test
 * the position D-02 wants tested.
 */
export function paintGridWithContour(ctx: CanvasRenderingContext2D, fixture: SweepFixture, metric: Metric): void {
  paintDenseGrid(ctx, fixture, metric)

  const field = fieldRect(ctx.canvas.width, ctx.canvas.height)
  const rampValues = getRampValues(fixture, metric)

  const destructiveColor = getCssVar('--color-destructive', '#c4341f')
  const textColor = getCssVar('--color-text', '#14161a')

  strokeLevel(ctx, rampValues, fixture, field, RUIN_ADJACENT_LEVEL, 1.5, destructiveColor)
  strokeLevel(ctx, rampValues, fixture, field, BREAKEVEN_LEVEL, 2, textColor)
}
