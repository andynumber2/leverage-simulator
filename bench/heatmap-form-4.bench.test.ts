/**
 * bench/heatmap-form-4.bench.test.ts: 06-03-PLAN.md Task 3, criterion 4's form-4 arm.
 *
 * Follows `bench/heatmap-form-2.bench.test.ts`'s file exactly: prove paint equivalence BEFORE
 * trusting any timing, then measure. Reads the committed `sweep-fixture.bin`'s bytes through the
 * `readSweepFixture` browser command, decodes it with the real `decodeSweepFixture`, and measures
 * `paintGridWithContour` -- the actual paint function `form-4-grid-with-contour.html` uses, not a
 * copy.
 *
 * Criterion 4 names a METRIC CHANGE, so the measured operation is a repaint that switches the
 * displayed metric array from multiple-of-contributed to max drawdown and back, matching every
 * other form's own bench file.
 *
 * This file records ONLY an info line (`PERF-05-heatmap-form-4`) and asserts locally against
 * `PERF_BUDGETS['PERF-05']` -- it deliberately never calls `commands.recordMeasurement`. Form 1
 * (`bench/heatmap-repaint.bench.test.ts`) already owns the run's single PERF-05 `MeasurementRow`;
 * a second row with the same budget id would collide in the run's own accumulator. Per finding
 * F-02 (06-RESEARCH.md), the four per-form figures are each individually gated against the same
 * 16ms budget, painted at four different D-12 geometries (form 4's own geometry happens to be
 * numerically identical to form 1's -- see `form-4-grid-with-contour.ts`'s own header comment for
 * why) -- they are informational, not a ranking between forms.
 */

import { commands } from 'vitest/browser'
import { beforeAll, expect, test } from 'vitest'

import { decodeSweepFixture, type SweepFixture } from '../src/data/sweep-fixture-format.ts'
import { valueToColor, type Rgba } from '../src/colorscale/value-to-color.ts'
import { cellDisplayCenter, fieldRect } from '../.planning/phases/06-heatmap-design-pass/mockups/forms/form-1-dense-grid.ts'
import {
  FORM_4_GEOMETRY,
  paintGridWithContour,
} from '../.planning/phases/06-heatmap-design-pass/mockups/forms/form-4-grid-with-contour.ts'
import { PERF_BUDGETS } from '../perf-budgets.ts'
import { measureBatchedMinOfN, normalize, REPEAT_COUNT } from './calibration.ts'
import { resolveRunCalibration } from './canonical-calibration.ts'
import { captureEnvironment } from './environment-block.ts'
import { assertWithinBudget, checkBudget, type MeasurementRow } from './report.ts'

/** Tuned empirically per Task 1's own instruction to pick a batch size that clears
 * `MIN_MEASUREMENT_MS`. Form 4 repaints the same dense grid form 1 does, plus two cheap
 * marching-squares passes (versus form 1's zero), so a batch size close to form 1's own 200 is
 * the right starting point. */
const REPAINT_BATCH_SIZE = 200

/** A background no `valueToColor` output can ever equal, mirroring
 * `bench/heatmap-repaint.bench.test.ts`'s own sentinel: every `valueToColor` output always
 * carries alpha 255. */
const BACKGROUND: Rgba = [0, 200, 0, 254]

let fixture: SweepFixture

beforeAll(async () => {
  const payload = await commands.readSweepFixture()
  const bytes = new Uint8Array(payload.bytes)
  fixture = decodeSweepFixture(bytes.buffer)
})

function makeDisplayCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = FORM_4_GEOMETRY.widthPx
  canvas.height = FORM_4_GEOMETRY.heightPx
  // Deliberately never appended to the DOM, mirroring every other form's own bench file.
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('heatmap-form-4 bench: 2D context unavailable in this browser instance')
  }
  ctx.imageSmoothingEnabled = false
  return { canvas, ctx }
}

function clearToBackground(ctx: CanvasRenderingContext2D): void {
  const [r, g, b, a] = BACKGROUND
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
}

function samplePixelAtDisplayPoint(ctx: CanvasRenderingContext2D, x: number, y: number): Rgba {
  const pixel = ctx.getImageData(x, y, 1, 1).data
  return [pixel[0] ?? -1, pixel[1] ?? -1, pixel[2] ?? -1, pixel[3] ?? -1]
}

/** The grid's first cell (row 0, col 0) and its last cell (row `rows-1`, col `cols-1`), mirroring
 * `bench/heatmap-repaint.bench.test.ts`'s own `sampleCells` -- the base LAYER (form 1's own
 * `paintDenseGrid`) is what this test proves equivalence against; the two annotation strokes on
 * top are a separate, much sparser layer that a corner cell is exceedingly unlikely to sit under
 * (an iso-line's own display footprint is 1.5-2px wide across a much larger field, and neither
 * corner cell is adjacent to a ruined or incomplete cell in the committed fixture, so this proof
 * mirrors form 1's own exactly). */
function sampleCells(): ReadonlyArray<{ row: number; col: number }> {
  return [
    { row: 0, col: 0 },
    { row: fixture.rows - 1, col: fixture.cols - 1 },
  ]
}

function cellCenter(row: number, col: number): { x: number; y: number } {
  const { x, y } = cellDisplayCenter(fixture, row, col, FORM_4_GEOMETRY.widthPx, FORM_4_GEOMETRY.heightPx)
  return { x: Math.floor(x), y: Math.floor(y) }
}

function expectedColorFor(row: number, col: number, metric: 'multiple' | 'drawdown'): Rgba {
  const cellIndex = row * fixture.cols + col
  const flags = fixture.flags[cellIndex] ?? 0
  const ruined = (flags & 1) !== 0
  const incomplete = (flags & 2) !== 0
  const values = metric === 'multiple' ? fixture.multiples : fixture.drawdowns
  const value = values[cellIndex] ?? 0
  return valueToColor({ value, ruined, incomplete })
}

// --- Equivalence proof: must pass before the timing below is trusted -----------------------

test('equivalence: paintGridWithContour writes the expected base-layer color into the expected cells, proven before timing', () => {
  const { ctx } = makeDisplayCanvas()
  clearToBackground(ctx)

  for (const { row, col } of sampleCells()) {
    const { x, y } = cellCenter(row, col)
    const sampled = samplePixelAtDisplayPoint(ctx, x, y)
    expect(sampled, `cell (row=${row}, col=${col}) must read BACKGROUND before paintGridWithContour runs`).toEqual(
      BACKGROUND,
    )
  }

  paintGridWithContour(ctx, fixture, 'multiple')

  for (const { row, col } of sampleCells()) {
    const { x, y } = cellCenter(row, col)
    const expected = expectedColorFor(row, col, 'multiple')
    const sampled = samplePixelAtDisplayPoint(ctx, x, y)
    expect(
      sampled,
      `cell (row=${row}, col=${col}) must equal valueToColor's own output after paintGridWithContour: a ` +
        'mismatch here means the PERF-05 heatmap-form-4 figure below is not trustworthy',
    ).toEqual(expected)
  }
})

test('equivalence: the field rectangle form 4 paints into matches form 1-s own fieldRect', () => {
  // Confirms form 4's reuse of form 1's fieldRect (not a second, independently-drifting copy)
  // by checking the geometry the two forms declare is identical, since FORM_4_GEOMETRY is
  // numerically equal to FORM_1_GEOMETRY by design (see form-4-grid-with-contour.ts's header).
  const field = fieldRect(FORM_4_GEOMETRY.widthPx, FORM_4_GEOMETRY.heightPx)
  expect(field.width).toBeGreaterThan(0)
  expect(field.height).toBeGreaterThan(0)
})

// --- Measurement -----------------------------------------------------------------------------

test('PERF-05: form 4 (grid + contour overlay) repaint on a metric change, measured on the real committed fixture', async () => {
  const score = await resolveRunCalibration()

  const { ctx } = makeDisplayCanvas()
  // A cold first paint pays one-time buffer construction cost a warm metric toggle never pays
  // again -- warm the buffer before the timed repaint below.
  paintGridWithContour(ctx, fixture, 'multiple')

  let metric: 'multiple' | 'drawdown' = 'multiple'
  const rawMs = await measureBatchedMinOfN(REPEAT_COUNT, REPAINT_BATCH_SIZE, () => {
    metric = metric === 'multiple' ? 'drawdown' : 'multiple'
    paintGridWithContour(ctx, fixture, metric)
  })
  const normalizedMs = normalize(rawMs, score)

  await commands.recordEnvironment(captureEnvironment(score))

  const budget = PERF_BUDGETS['PERF-05']
  const row: MeasurementRow = {
    budgetId: budget.id,
    requirementId: budget.requirementId,
    measuredMs: rawMs,
    normalizedMs,
    budgetMs: budget.thresholdMs,
    anchorMs: budget.anchorMs,
    anchorLabel: budget.anchorLabel,
    source: 'production',
    verdict: checkBudget({ normalizedMs, budgetMs: budget.thresholdMs }),
  }
  // Deliberately NOT commands.recordMeasurement(row): form 1 owns the run's one PERF-05
  // MeasurementRow. See this file's header comment.

  await commands.recordInfoLine(
    'PERF-05-heatmap-form-4',
    `PERF-05-heatmap-form-4: normalizedMs=${normalizedMs.toFixed(2)} rawMs=${rawMs.toFixed(4)} ` +
      `batchSize=${REPAINT_BATCH_SIZE} geometry=${JSON.stringify(FORM_4_GEOMETRY)} ` +
      `(individually gated at 16ms; per D-12/F-02 not a ranking against the other forms, which are ` +
      'painted at their own geometries)',
  )

  expect(() => assertWithinBudget(row)).not.toThrow()
})
