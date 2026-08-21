/**
 * .planning/phases/06-heatmap-design-pass/mockups/forms/form-1-dense-grid.ts
 *
 * D-02 form 1: one cell per (entry-date, leverage) pair, painted through the same `putImageData`
 * path Phase 1 measured as decisively faster than per-cell `fillRect`
 * (`bench/canvas-grid.ts`'s `paintPutImageData`; `.claude/CLAUDE.md` "Q2: Charting").
 *
 * The canvas reserves a small axis-label gutter (left, for leverage row labels; bottom, for
 * entry-year column labels) OUTSIDE the field's own paint rectangle, so axis text ink and field
 * data ink never share a pixel -- an early implementation drew labels directly over the field at
 * `x=0`/`y=canvas.height`, which corrupted the corner cells' own colour (caught by
 * `bench/heatmap-repaint.bench.test.ts`'s equivalence proof before any timing was trusted). The
 * field itself still renders the full 10,000-cell grid; only the gutter strips are label space.
 */

import {
  CELL_FLAG_INCOMPLETE,
  CELL_FLAG_RUINED,
  type SweepFixture,
} from '../../../../../src/data/sweep-fixture-format.ts'
import { RUIN_BASE_RGBA, valueToColor } from '../../../../../src/colorscale/value-to-color.ts'
import { makeHatchPattern, type MockupGeometry } from '../shared/mockup-runtime.ts'

/** D-12: form 1 picks near-square cells and its own geometry -- 200 cols by 50 rows at 4px per
 * cell, giving the same 10,000 cells the Phase 1 canvas benchmark measured. `widthPx`/`heightPx`
 * are the canvas's own total display-pixel size; the field paints into a slightly smaller
 * sub-rectangle of it (`fieldRect` below) so the axis-label gutter never overlaps a data cell. */
export const FORM_1_GEOMETRY: MockupGeometry = {
  cols: 200,
  rows: 50,
  cellSizePx: 4,
  widthPx: 800,
  heightPx: 200,
}

export type Metric = 'multiple' | 'drawdown'

/** Left gutter width (leverage row labels) and bottom gutter height (entry-year column labels),
 * in display pixels. Reserved from the SAME canvas `FORM_1_GEOMETRY` declares, never adding to
 * its total size -- the field's paint rectangle shrinks by exactly this much instead. */
const AXIS_GUTTER_LEFT_PX = 36
const AXIS_GUTTER_BOTTOM_PX = 16

export interface FieldRect {
  x: number
  y: number
  width: number
  height: number
}

/** The field's own paint rectangle within a `canvasWidthPx` by `canvasHeightPx` canvas: the full
 * canvas area minus the axis-label gutter. Exported so `bench/heatmap-repaint.bench.test.ts`
 * computes sample-cell pixel positions from this single definition rather than a second,
 * independently-drifting copy of the same arithmetic. */
export function fieldRect(canvasWidthPx: number, canvasHeightPx: number): FieldRect {
  return {
    x: AXIS_GUTTER_LEFT_PX,
    y: 0,
    width: canvasWidthPx - AXIS_GUTTER_LEFT_PX,
    height: canvasHeightPx - AXIS_GUTTER_BOTTOM_PX,
  }
}

/**
 * The display-pixel centre of fixture cell (`row`, `col`) within a `canvasWidthPx` by
 * `canvasHeightPx` canvas, accounting for A-E5's vertical flip: fixture row 0 (1.00x) paints at
 * the BOTTOM of the field. The single source of truth `paintDenseGrid` and the bench equivalence
 * test both use.
 */
export function cellDisplayCenter(
  fixture: SweepFixture,
  row: number,
  col: number,
  canvasWidthPx: number,
  canvasHeightPx: number,
): { x: number; y: number } {
  const field = fieldRect(canvasWidthPx, canvasHeightPx)
  const cellWidthPx = field.width / fixture.cols
  const cellHeightPx = field.height / fixture.rows
  const imgRow = fixture.rows - 1 - row
  return {
    x: field.x + col * cellWidthPx + cellWidthPx / 2,
    y: field.y + imgRow * cellHeightPx + cellHeightPx / 2,
  }
}

let bufferCanvas: HTMLCanvasElement | undefined
let bufferCtx: CanvasRenderingContext2D | undefined
let bufferImageData: ImageData | undefined

/** Created once, on first use, and reused on every subsequent `paintDenseGrid` call -- the
 * measured repaint figure (`bench/heatmap-repaint.bench.test.ts`) must reflect painting, not
 * allocation, mirroring `bench/canvas-grid.ts`'s own reused-buffer discipline. */
function getOffscreenBuffer(
  cols: number,
  rows: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; imageData: ImageData } {
  if (!bufferCanvas || !bufferCtx || !bufferImageData || bufferCanvas.width !== cols || bufferCanvas.height !== rows) {
    const canvas = document.createElement('canvas')
    canvas.width = cols
    canvas.height = rows
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('form-1-dense-grid: 2D context unavailable for the offscreen buffer canvas')
    }
    bufferCanvas = canvas
    bufferCtx = ctx
    bufferImageData = ctx.createImageData(cols, rows)
  }
  return { canvas: bufferCanvas, ctx: bufferCtx, imageData: bufferImageData }
}

function getCssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value === '' ? fallback : value
}

/**
 * Draws leverage row labels (every 10th fixture row) into the left gutter and entry-year column
 * labels (every 20th fixture column) into the bottom gutter, in `var(--font-mono)` at
 * `var(--font-size-label)`. Both gutters are outside `field`, so this never overdraws a data
 * cell.
 */
function drawAxisLabels(
  ctx: CanvasRenderingContext2D,
  fixture: SweepFixture,
  field: FieldRect,
  cellWidthPx: number,
  cellHeightPx: number,
): void {
  const fontMono = getCssVar('--font-mono', 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace')
  const fontSizeLabel = getCssVar('--font-size-label', '12px')
  const textColor = getCssVar('--color-text-muted', '#5b6169')

  ctx.save()
  ctx.font = `${fontSizeLabel} ${fontMono}`
  ctx.fillStyle = textColor

  // Leverage row labels, every 10th fixture row, in the left gutter (x < field.x). A-E5: fixture
  // row 0 (1.00x) paints at the BOTTOM of the field.
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  for (let row = 0; row < fixture.rows; row += 10) {
    const imgRow = fixture.rows - 1 - row
    const y = field.y + imgRow * cellHeightPx + cellHeightPx / 2
    const label = `${(fixture.meta.leverages[row] ?? 0).toFixed(2)}x`
    ctx.fillText(label, 2, y)
  }

  // Entry-year column labels, every 20th fixture column, in the bottom gutter (y > field.y +
  // field.height). Column 0 (the earliest entry date) paints at the LEFT (A-E5).
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
 * Paints `fixture`'s `metric` array (`multiples` for multiple-of-contributed, `drawdowns` for max
 * drawdown) onto `ctx` as a dense 200x50 grid, into `fieldRect(ctx.canvas.width,
 * ctx.canvas.height)`'s rectangle. Writes one pixel per cell into a reused `cols`x`rows`
 * `ImageData` through `valueToColor` (D-27), applies it to a reused offscreen buffer canvas via
 * `putImageData`, then `drawImage`s that buffer upscaled into the field rectangle with
 * `imageSmoothingEnabled = false` for crisp cell edges. After the base pass, fills the union of
 * ruined cells (still clipped to the field rectangle) with the D-18 hatch under a clip path, so
 * ruin is texture layered on top rather than a colour step in the base pass -- incomplete cells
 * are already flat `INCOMPLETE_RGBA` from the base pass and receive no texture (D-20: texture
 * means exactly one thing).
 */
export function paintDenseGrid(ctx: CanvasRenderingContext2D, fixture: SweepFixture, metric: Metric): void {
  const { cols, rows } = fixture
  const { canvas: buffer, ctx: offscreenCtx, imageData } = getOffscreenBuffer(cols, rows)
  const data = imageData.data
  const values = metric === 'multiple' ? fixture.multiples : fixture.drawdowns

  for (let fixtureRow = 0; fixtureRow < rows; fixtureRow++) {
    // A-E5: fixture row 0 (1.00x) paints at the BOTTOM, so image row (rows-1-fixtureRow) carries
    // this fixture row's pixels.
    const imgRow = rows - 1 - fixtureRow
    for (let col = 0; col < cols; col++) {
      const cellIndex = fixtureRow * cols + col
      const flags = fixture.flags[cellIndex] ?? 0
      const ruined = (flags & CELL_FLAG_RUINED) !== 0
      const incomplete = (flags & CELL_FLAG_INCOMPLETE) !== 0
      const value = values[cellIndex] ?? 0
      const [r, g, b, a] = valueToColor({ value, ruined, incomplete })
      const pixelIndex = (imgRow * cols + col) * 4
      data[pixelIndex] = r
      data[pixelIndex + 1] = g
      data[pixelIndex + 2] = b
      data[pixelIndex + 3] = a
    }
  }
  offscreenCtx.putImageData(imageData, 0, 0)

  const field = fieldRect(ctx.canvas.width, ctx.canvas.height)

  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.drawImage(buffer, 0, 0, cols, rows, field.x, field.y, field.width, field.height)

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

  drawAxisLabels(ctx, fixture, field, cellWidthPx, cellHeightPx)
}
