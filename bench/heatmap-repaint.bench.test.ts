/**
 * bench/heatmap-repaint.bench.test.ts: 06-01-PLAN.md Task 1(f), criterion 4's form-1 arm.
 *
 * Follows `bench/canvas-repaint.bench.test.ts`'s pattern exactly: prove paint equivalence BEFORE
 * trusting any timing, then measure. Reads the committed `sweep-fixture.bin`'s bytes through the
 * `readSweepFixture` browser command (`vitest.config.ts`), decodes it with the real
 * `decodeSweepFixture`, and measures `paintDenseGrid` -- the actual paint function
 * `form-1-dense-grid.html` uses, not a copy.
 *
 * Criterion 4 names a METRIC CHANGE, so the measured operation is a repaint that switches the
 * displayed metric array from multiple-of-contributed to max drawdown and back, not a first
 * paint (a cold first paint would also pay one-time buffer/`ImageData` construction cost that a
 * production metric toggle, painting into an already-warm buffer, never pays again).
 *
 * This file records the run's ONE PERF-05 row (from this form's own repaint measurement). Forms
 * 2, 3 and 4 (plans 06-02 through 06-05) each add their own bench file that records an info line
 * and asserts locally against the same 16ms budget, but does NOT record a second PERF-05
 * `MeasurementRow` -- the run's row set must never carry a duplicate budget id. The four per-form
 * figures are each individually gated against 16ms; per D-12 they are painted at four different
 * geometries, so they are NOT a ranking between forms (finding F-02).
 */

import { commands } from 'vitest/browser'
import { beforeAll, expect, test } from 'vitest'

import { valueToColor, type Rgba } from '../src/colorscale/value-to-color.ts'
import { decodeSweepFixture, type SweepFixture } from '../src/data/sweep-fixture-format.ts'
import {
  cellDisplayCenter,
  FORM_1_GEOMETRY,
  paintDenseGrid,
} from '../.planning/phases/06-heatmap-design-pass/mockups/forms/form-1-dense-grid.ts'
import { PERF_BUDGETS } from '../perf-budgets.ts'
import { measureBatchedMinOfN, normalize, REPEAT_COUNT } from './calibration.ts'
import { resolveRunCalibration } from './canonical-calibration.ts'
import { captureEnvironment } from './environment-block.ts'
import { assertWithinBudget, checkBudget, type MeasurementRow } from './report.ts'

/** Tuned empirically per Task 1's own instruction to pick a batch size that clears
 * `MIN_MEASUREMENT_MS`; a single 200x50 `putImageData` repaint is well under that floor. */
const REPAINT_BATCH_SIZE = 200

/** A background no `valueToColor` output can ever equal: every `valueToColor` output (the
 * continuous ramp via `oklabToSrgb`, `RUIN_BASE_RGBA`, and `INCOMPLETE_RGBA`) always carries
 * alpha 255, so a background with any other alpha is safe from a vacuous match regardless of its
 * RGB channels. */
const BACKGROUND: Rgba = [0, 200, 0, 254]

let fixture: SweepFixture

beforeAll(async () => {
  const payload = await commands.readSweepFixture()
  const bytes = new Uint8Array(payload.bytes)
  fixture = decodeSweepFixture(bytes.buffer)
})

function makeDisplayCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = FORM_1_GEOMETRY.widthPx
  canvas.height = FORM_1_GEOMETRY.heightPx
  // Deliberately never appended to the DOM, mirroring bench/canvas-repaint.bench.test.ts: a
  // detached canvas still has a real 2D rendering context and real paint cost.
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('heatmap-repaint bench: 2D context unavailable in this browser instance')
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

/** The grid's first cell (row 0, col 0) and its last cell (row `rows-1`, col `cols-1`), so a
 * partitioning or off-by-one bug at either boundary would be caught -- mirroring
 * `bench/canvas-repaint.bench.test.ts`'s `SAMPLE_CELLS`. */
function sampleCells(): ReadonlyArray<{ row: number; col: number }> {
  return [
    { row: 0, col: 0 },
    { row: fixture.rows - 1, col: fixture.cols - 1 },
  ]
}

/** The display-pixel centre of fixture cell (`row`, `col`), via the same `cellDisplayCenter`
 * `form-1-dense-grid.ts:paintDenseGrid` uses internally -- one source of truth for the field's
 * geometry (axis-gutter-inset rectangle plus the A-E5 vertical flip), not a second, independently
 * drifting copy of the same arithmetic. */
function cellCenter(row: number, col: number): { x: number; y: number } {
  const { x, y } = cellDisplayCenter(fixture, row, col, FORM_1_GEOMETRY.widthPx, FORM_1_GEOMETRY.heightPx)
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

test('equivalence: paintDenseGrid writes the expected color into the expected cells, proven before timing', () => {
  const { ctx } = makeDisplayCanvas()
  clearToBackground(ctx)

  for (const { row, col } of sampleCells()) {
    const { x, y } = cellCenter(row, col)
    const sampled = samplePixelAtDisplayPoint(ctx, x, y)
    expect(sampled, `cell (row=${row}, col=${col}) must read BACKGROUND before paintDenseGrid runs`).toEqual(
      BACKGROUND,
    )
  }

  paintDenseGrid(ctx, fixture, 'multiple')

  for (const { row, col } of sampleCells()) {
    const { x, y } = cellCenter(row, col)
    const expected = expectedColorFor(row, col, 'multiple')
    const sampled = samplePixelAtDisplayPoint(ctx, x, y)
    expect(
      sampled,
      `cell (row=${row}, col=${col}) must equal valueToColor's own output after paintDenseGrid: a ` +
        'mismatch here means the PERF-05 heatmap-form-1 figure below is not trustworthy',
    ).toEqual(expected)
  }
})

// --- Measurement -----------------------------------------------------------------------------

test('PERF-05: form 1 (dense grid) repaint on a metric change, measured on the real committed fixture', async () => {
  const score = await resolveRunCalibration()

  const { ctx } = makeDisplayCanvas()
  // A cold first paint pays one-time buffer/ImageData construction cost a warm metric toggle
  // never pays again -- warm the buffer before the timed repaint below.
  paintDenseGrid(ctx, fixture, 'multiple')

  let metric: 'multiple' | 'drawdown' = 'multiple'
  const rawMs = await measureBatchedMinOfN(REPEAT_COUNT, REPAINT_BATCH_SIZE, () => {
    metric = metric === 'multiple' ? 'drawdown' : 'multiple'
    paintDenseGrid(ctx, fixture, metric)
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
  await commands.recordMeasurement(row)

  await commands.recordInfoLine(
    'PERF-05-heatmap-form-1',
    `PERF-05-heatmap-form-1: normalizedMs=${normalizedMs.toFixed(2)} rawMs=${rawMs.toFixed(4)} ` +
      `batchSize=${REPAINT_BATCH_SIZE} geometry=${JSON.stringify(FORM_1_GEOMETRY)} ` +
      `(individually gated at 16ms; per D-12/F-02 not a ranking against forms 2-4, which are ` +
      'painted at their own geometries)',
  )

  expect(() => assertWithinBudget(row)).not.toThrow()
})
