/**
 * .planning/phases/06-heatmap-design-pass/mockups/forms/form-3-small-multiples.ts
 *
 * D-02 form 3: fifty stacked one-dimensional leverage strips, each a full 200-column entry-date
 * band, separated by a visible gap filled with the panel's own surface colour (never a scale
 * colour, T-06-12). Renders the same 10,000-cell field as every other form, through the same
 * `valueToColor` and the same shared `mountMockup` chrome (D-27, D-28).
 *
 * Follows `form-1-dense-grid.ts`'s axis-gutter-inset convention: `FORM_3_GEOMETRY`'s declared
 * `widthPx`/`heightPx` are the canvas's own total size, and the field (all fifty strips) paints
 * into a smaller sub-rectangle carved from that same canvas -- a left gutter for leverage row
 * labels and a bottom gutter for entry-year column labels -- so axis text ink and field data ink
 * never share a pixel. `cellWidthPx`/`stripHeightPx`/`stripGapPx` on `FORM_3_GEOMETRY` are this
 * form's own declared NOMINAL per-cell/per-strip sizes; the actual rendered strip height is
 * derived from the field rectangle at paint time (see `stripLayout` below), the same
 * declared-nominal/derived-actual relationship `FORM_1_GEOMETRY.cellSizePx` has to
 * `form-1-dense-grid.ts`'s own `cellWidthPx`/`cellHeightPx`.
 *
 * Because the strip gaps mean the canvas is not a clean integer upscale of the 200x50 field, each
 * strip paints through its own reusable 200x1 `ImageData` row buffer and 200x1 offscreen buffer
 * canvas, `drawImage`d stretched into that strip's own rectangle with `imageSmoothingEnabled =
 * false` -- fifty `drawImage` calls per repaint, not 10,000 `fillRect` calls, reusing both buffers
 * across strips and across repaints (mirrors `bench/canvas-grid.ts`'s `getPutImageDataBuffer`
 * precedent). The buffer is allocated lazily on first paint, never at module load: this module is
 * also imported by the `unit` project's typecheck, where `document` does not exist.
 */

import {
  CELL_FLAG_INCOMPLETE,
  CELL_FLAG_RUINED,
  type SweepFixture,
} from '../../../../../src/data/sweep-fixture-format.ts'
import { RUIN_BASE_RGBA, valueToColor } from '../../../../../src/colorscale/value-to-color.ts'
import { integerLeverageTicks, makeHatchPattern, type MockupGeometry } from '../shared/mockup-runtime.ts'

export type Metric = 'multiple' | 'drawdown'

/** D-12: form 3's own geometry -- fifty stacked strips (one per leverage row), each a full
 * 200-column entry-date band. `cellSizePx` mirrors `cellWidthPx` (both 4) so this object also
 * satisfies `MockupGeometry`'s shape for `mountMockup`. */
export const FORM_3_GEOMETRY: MockupGeometry & {
  cellWidthPx: number
  stripHeightPx: number
  stripGapPx: number
} = {
  cols: 200,
  rows: 50,
  cellSizePx: 4,
  cellWidthPx: 4,
  stripHeightPx: 6,
  stripGapPx: 2,
  widthPx: 800,
  heightPx: 400,
}

/** Left gutter (leverage row labels) and bottom gutter (entry-year column labels), in display
 * pixels, carved from the SAME canvas `FORM_3_GEOMETRY` declares -- never adding to its total
 * size, mirroring `form-1-dense-grid.ts`'s `AXIS_GUTTER_LEFT_PX`/`AXIS_GUTTER_BOTTOM_PX`. */
const AXIS_GUTTER_LEFT_PX = 36
const AXIS_GUTTER_BOTTOM_PX = 16

export interface FieldRect {
  x: number
  y: number
  width: number
  height: number
}

/** The field's own paint rectangle within a `canvasWidthPx` by `canvasHeightPx` canvas: the full
 * canvas area minus both axis-label gutters. Exported so `bench/heatmap-form-3.bench.test.ts`
 * computes sample-cell/sample-gap pixel positions from this single definition rather than a
 * second, independently-drifting copy of the same arithmetic. */
export function fieldRect(canvasWidthPx: number, canvasHeightPx: number): FieldRect {
  return {
    x: AXIS_GUTTER_LEFT_PX,
    y: 0,
    width: canvasWidthPx - AXIS_GUTTER_LEFT_PX,
    height: canvasHeightPx - AXIS_GUTTER_BOTTOM_PX,
  }
}

export interface StripLayout {
  field: FieldRect
  /** Vertical span, in display pixels, from one strip's top edge to the next strip's top edge. */
  periodPx: number
  /** The rendered strip height, in display pixels -- `periodPx` minus the fixed gap. */
  stripHeightPx: number
  /** The fixed, literal gap between strips, in display pixels (`FORM_3_GEOMETRY.stripGapPx`). */
  gapPx: number
}

/** Derives the field rectangle and the per-strip vertical geometry for a `rows`-row field inside
 * a `canvasWidthPx` by `canvasHeightPx` canvas. The gap is held at the declared, literal
 * `FORM_3_GEOMETRY.stripGapPx`; the rendered strip height absorbs whatever the field's own height
 * leaves after every gap is subtracted -- the same declared-nominal/derived-actual relationship
 * `form-1-dense-grid.ts` has between `FORM_1_GEOMETRY.cellSizePx` and its real per-cell size. */
export function stripLayout(canvasWidthPx: number, canvasHeightPx: number, rows: number): StripLayout {
  const field = fieldRect(canvasWidthPx, canvasHeightPx)
  const periodPx = field.height / rows
  const gapPx = FORM_3_GEOMETRY.stripGapPx
  const stripHeightPx = periodPx - gapPx
  return { field, periodPx, stripHeightPx, gapPx }
}

/** The display-pixel rectangle of fixture row `row`'s own strip. A-E5: fixture row 0 (1.00x)
 * paints at the BOTTOM of the field, so image row (`rows-1-row`) carries this fixture row's own
 * strip. */
export function stripRect(
  fixture: SweepFixture,
  row: number,
  canvasWidthPx: number,
  canvasHeightPx: number,
): FieldRect {
  const layout = stripLayout(canvasWidthPx, canvasHeightPx, fixture.rows)
  const imgRow = fixture.rows - 1 - row
  return {
    x: layout.field.x,
    y: layout.field.y + imgRow * layout.periodPx,
    width: layout.field.width,
    height: layout.stripHeightPx,
  }
}

/** The display-pixel centre of fixture cell (`row`, `col`) within its own strip. Column 0 (the
 * earliest entry date) paints at the LEFT (A-E5), matching every other form. */
export function cellDisplayCenter(
  fixture: SweepFixture,
  row: number,
  col: number,
  canvasWidthPx: number,
  canvasHeightPx: number,
): { x: number; y: number } {
  const strip = stripRect(fixture, row, canvasWidthPx, canvasHeightPx)
  const cellWidthPx = strip.width / fixture.cols
  return {
    x: strip.x + col * cellWidthPx + cellWidthPx / 2,
    y: strip.y + strip.height / 2,
  }
}

/** A display-pixel point inside the GAP between fixture row `lowerRow`'s strip and fixture row
 * `lowerRow + 1`'s strip. Valid for `lowerRow` in `[0, fixture.rows - 2]`. Used by
 * `bench/heatmap-form-3.bench.test.ts` (T-06-12) to prove a gap pixel equals the panel surface
 * colour, never a scale colour. */
export function gapCenterBetween(
  fixture: SweepFixture,
  lowerRow: number,
  canvasWidthPx: number,
  canvasHeightPx: number,
): { x: number; y: number } {
  const layout = stripLayout(canvasWidthPx, canvasHeightPx, fixture.rows)
  const upperStrip = stripRect(fixture, lowerRow + 1, canvasWidthPx, canvasHeightPx)
  return {
    x: upperStrip.x + upperStrip.width / 2,
    y: upperStrip.y + upperStrip.height + layout.gapPx / 2,
  }
}

let rowBufferCanvas: HTMLCanvasElement | undefined
let rowBufferCtx: CanvasRenderingContext2D | undefined
let rowBufferImageData: ImageData | undefined

/** Created once, on first use, and reused on every subsequent `paintSmallMultiples` call and
 * every strip within a single call -- the measured repaint figure
 * (`bench/heatmap-form-3.bench.test.ts`) must reflect painting, not allocation, mirroring
 * `bench/canvas-grid.ts`'s own reused-buffer discipline. Sized `cols`x1: one row of the field at
 * a time, never the whole 10,000-cell field, since each strip is its own one-dimensional band. */
function getRowBuffer(
  cols: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; imageData: ImageData } {
  if (!rowBufferCanvas || !rowBufferCtx || !rowBufferImageData || rowBufferCanvas.width !== cols) {
    const canvas = document.createElement('canvas')
    canvas.width = cols
    canvas.height = 1
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('form-3-small-multiples: 2D context unavailable for the row buffer canvas')
    }
    rowBufferCanvas = canvas
    rowBufferCtx = ctx
    rowBufferImageData = ctx.createImageData(cols, 1)
  }
  return { canvas: rowBufferCanvas, ctx: rowBufferCtx, imageData: rowBufferImageData }
}

function getCssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value === '' ? fallback : value
}

/**
 * Draws integer leverage row labels (1x, 2x, 3x ...) into the left gutter and entry-year column
 * labels (every 20th fixture column) into the bottom gutter, in `var(--font-mono)` at
 * `var(--font-size-label)`. Both gutters are outside the field rectangle, so this never overdraws
 * a data cell -- mirrors `form-1-dense-grid.ts`'s `drawAxisLabels`. Integer leverages do not, in
 * general, land on an exact strip's own row, so each label's Y position is interpolated from its
 * VALUE (`integerLeverageTicks`) into a fractional position along `stripLayout`'s periodic strip
 * spacing, never picked by nearest strip.
 */
function drawAxisLabels(
  ctx: CanvasRenderingContext2D,
  fixture: SweepFixture,
  canvasWidthPx: number,
  canvasHeightPx: number,
): void {
  const fontMono = getCssVar('--font-mono', 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace')
  const fontSizeLabel = getCssVar('--font-size-label', '12px')
  const textColor = getCssVar('--color-text-muted', '#5b6169')

  ctx.save()
  ctx.font = `${fontSizeLabel} ${fontMono}`
  ctx.fillStyle = textColor

  // Leverage row labels, one per integer leverage in the fixture's own range, in the left gutter
  // (x < field.x). A-E5: fixture row 0 (1.00x) paints at the BOTTOM of the field.
  const layout = stripLayout(canvasWidthPx, canvasHeightPx, fixture.rows)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  for (const tick of integerLeverageTicks(fixture.meta.leverages)) {
    const imgRowF = fixture.rows - 1 - tick.rowF
    const y = layout.field.y + imgRowF * layout.periodPx + layout.stripHeightPx / 2
    ctx.fillText(`${tick.leverage}x`, 2, y)
  }

  // Entry-year column labels, every 20th fixture column, in the bottom gutter. Column 0 (the
  // earliest entry date) paints at the LEFT (A-E5).
  const field = fieldRect(canvasWidthPx, canvasHeightPx)
  const cellWidthPx = field.width / fixture.cols
  ctx.textBaseline = 'bottom'
  ctx.textAlign = 'center'
  for (let col = 0; col < fixture.cols; col += 20) {
    const x = field.x + col * cellWidthPx + cellWidthPx / 2
    const entryDate = fixture.meta.entryDates[col] ?? ''
    const label = entryDate.slice(0, 4)
    ctx.fillText(label, x, canvasHeightPx - 1)
  }

  ctx.restore()
}

/**
 * Paints `fixture`'s `metric` array (`multiples` for multiple-of-contributed, `drawdowns` for max
 * drawdown) onto `ctx` as fifty stacked one-dimensional leverage strips, one row of fixture cells
 * per strip. Each strip writes one pixel per cell into a reused `cols`x1 `ImageData` via
 * `valueToColor` (D-27), applies it to a reused offscreen 1-row buffer canvas via
 * `putImageData`, then `drawImage`s that buffer upscaled into the strip's own rectangle with
 * `imageSmoothingEnabled = false` for crisp cell edges. The whole canvas is cleared to
 * `var(--color-surface)` first, so every pixel not covered by a strip -- every gap -- reads as
 * panel background rather than a colour on the scale (D-06, T-06-12). After the base pass, fills
 * the union of ruined cells (clipped to each strip's own rectangle) with the D-18 hatch under a
 * clip path, so ruin is texture layered on top rather than a colour step in the base pass --
 * incomplete cells are already flat `INCOMPLETE_RGBA` from the base pass and receive no texture
 * (D-20).
 */
export function paintSmallMultiples(ctx: CanvasRenderingContext2D, fixture: SweepFixture, metric: Metric): void {
  const { cols, rows } = fixture
  const { canvas: rowBuffer, ctx: rowBufferCtxLocal, imageData } = getRowBuffer(cols)
  const data = imageData.data
  const values = metric === 'multiple' ? fixture.multiples : fixture.drawdowns

  const canvasWidthPx = ctx.canvas.width
  const canvasHeightPx = ctx.canvas.height

  const surfaceColor = getCssVar('--color-surface', '#ffffff')
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, canvasWidthPx, canvasHeightPx)
  ctx.fillStyle = surfaceColor
  ctx.fillRect(0, 0, canvasWidthPx, canvasHeightPx)

  // Base pass: one drawImage per strip, via the reused cols-by-1 row buffer.
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cellIndex = row * cols + col
      const flags = fixture.flags[cellIndex] ?? 0
      const ruined = (flags & CELL_FLAG_RUINED) !== 0
      const incomplete = (flags & CELL_FLAG_INCOMPLETE) !== 0
      const value = values[cellIndex] ?? 0
      const [r, g, b, a] = valueToColor({ value, ruined, incomplete })
      const pixelIndex = col * 4
      data[pixelIndex] = r
      data[pixelIndex + 1] = g
      data[pixelIndex + 2] = b
      data[pixelIndex + 3] = a
    }
    rowBufferCtxLocal.putImageData(imageData, 0, 0)

    const strip = stripRect(fixture, row, canvasWidthPx, canvasHeightPx)
    ctx.drawImage(rowBuffer, 0, 0, cols, 1, strip.x, strip.y, strip.width, strip.height)
  }

  // Ruin hatch overlay (D-18): the union of ruined cells, clipped, filled once -- texture layered
  // on top of the base pass rather than a colour step within it.
  let anyRuined = false
  ctx.save()
  ctx.beginPath()
  for (let row = 0; row < rows; row++) {
    const strip = stripRect(fixture, row, canvasWidthPx, canvasHeightPx)
    const cellWidthPx = strip.width / cols
    for (let col = 0; col < cols; col++) {
      const cellIndex = row * cols + col
      const flags = fixture.flags[cellIndex] ?? 0
      if ((flags & CELL_FLAG_RUINED) !== 0) {
        anyRuined = true
        ctx.rect(strip.x + col * cellWidthPx, strip.y, cellWidthPx, strip.height)
      }
    }
  }
  if (anyRuined) {
    ctx.clip()
    const pattern = makeHatchPattern(ctx, RUIN_BASE_RGBA)
    ctx.fillStyle = pattern
    const field = fieldRect(canvasWidthPx, canvasHeightPx)
    ctx.fillRect(field.x, field.y, field.width, field.height)
  }
  ctx.restore()

  drawAxisLabels(ctx, fixture, canvasWidthPx, canvasHeightPx)
}
