/**
 * bench/canvas-repaint.bench.test.ts — D-15: both hand-rolled canvas repaint arms, measured on
 * the identical 10,000-cell grid.
 *
 * `paintFillRect` and `paintPutImageData` (bench/canvas-grid.ts) paint the same
 * `makeGridValues` output through the same `mapValueToRgba` mapping, so this file settles D-15's
 * internal implementation fork with two comparable figures rather than a directional guess.
 * Before either figure is trusted, both arms are proven to have painted the expected colors into
 * the expected cells (see the equivalence assertions below, which run and pass before any
 * `measureMinOfN` call) — an arm cannot win this comparison by painting less.
 *
 * The measurement itself is calibration-normalized (D-06) and compared against the real PERF-05
 * threshold in `perf-budgets.ts` via an ordinary Vitest `expect` — that `expect` call, not
 * `checkBudget`, is what fails CI on a breach (D-03). The faster arm's normalized figure is
 * recorded as the PERF-05 row; the slower arm's figure is preserved in stdout and in the JSON
 * artifact via the `recordInfoLine` bridge (introduced in plan 01-02), since a browser-context
 * `console.log` does not reach `npm run bench`'s stdout under the default reporter.
 */

import { commands } from 'vitest/browser'
import { beforeEach, expect, test } from 'vitest'

import {
  CELL_SIZE_PX,
  GRID_COLS,
  GRID_ROWS,
  makeGridValues,
  mapValueToRgba,
  paintFillRect,
  paintPutImageData,
  type RgbaColor,
} from './canvas-grid.ts'
import { PERF_BUDGETS } from '../perf-budgets.ts'
import { calibrationScore, measureBatchedMinOfN, normalize, REPEAT_COUNT } from './calibration.ts'
import { captureEnvironment } from './environment-block.ts'
import { assertWithinBudget, checkBudget, type MeasurementRow } from './report.ts'

const CANVAS_WIDTH = GRID_COLS * CELL_SIZE_PX
const CANVAS_HEIGHT = GRID_ROWS * CELL_SIZE_PX

// Both arms' raw single-call cost is under measureMinOfN's MIN_MEASUREMENT_MS floor (the
// fillRect arm's recorded normalized figure of 4.41ms against a 0.57 calibration score implies a
// raw cost of roughly 2.5ms/call; the putImageData arm recorded a literal 0ms raw). Each arm
// amortizes through its own batch size and divides by that same size, so the two per-call
// figures stay directly comparable and the PERF-05 winner comparison is unchanged in meaning.
// Tuned empirically per Task 1 Step 6.
const FILL_RECT_BATCH_SIZE = 8
const PUT_IMAGE_DATA_BATCH_SIZE = 500

/** A background no `mapValueToRgba` output can ever equal: `mapValueToRgba` always returns
 * green=64, so any background with a different green channel is safe from a vacuous match. */
const BACKGROUND: RgbaColor = [0, 200, 0, 255]

function makeDisplayCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT
  // Deliberately never appended to the DOM — a detached canvas still has a real 2D rendering
  // context and real paint cost, per D-02's "real Canvas" requirement, without needing page
  // layout to host it.
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('canvas-repaint bench: 2D context unavailable in this browser instance')
  }
  ctx.imageSmoothingEnabled = false
  return { canvas, ctx }
}

function clearToBackground(ctx: CanvasRenderingContext2D): void {
  const [r, g, b] = BACKGROUND
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
}

/** Samples the single pixel at the center of cell (col, row) as a 4-channel RGBA tuple. */
function samplePixelAtCellCenter(ctx: CanvasRenderingContext2D, col: number, row: number): RgbaColor {
  const x = col * CELL_SIZE_PX + Math.floor(CELL_SIZE_PX / 2)
  const y = row * CELL_SIZE_PX + Math.floor(CELL_SIZE_PX / 2)
  const pixel = ctx.getImageData(x, y, 1, 1).data
  return [pixel[0] ?? -1, pixel[1] ?? -1, pixel[2] ?? -1, pixel[3] ?? -1]
}

// The two sample cells used throughout: the grid's first cell and its last cell, so a
// partitioning or off-by-one bug at either boundary would be caught.
const SAMPLE_CELLS: ReadonlyArray<{ col: number; row: number }> = [
  { col: 0, row: 0 },
  { col: GRID_COLS - 1, row: GRID_ROWS - 1 },
]

function cellIndex(col: number, row: number): number {
  return row * GRID_COLS + col
}

let values: Float64Array

beforeEach(() => {
  values = makeGridValues(0x5eed)
})

// --- Equivalence proof (Task 2): must pass before either arm's timing is trusted -------------
// Sampling would pass vacuously against a stale or default canvas state if the background were
// never asserted first, or if the same two pixels happened to already hold the expected colors
// from a prior arm's paint. Each block below re-clears to BACKGROUND, re-proves the background
// is present at both sample points, then runs exactly one arm and re-samples.

test('equivalence: paintFillRect writes the expected color into the expected cells, proven before timing', () => {
  const { ctx } = makeDisplayCanvas()
  clearToBackground(ctx)

  for (const { col, row } of SAMPLE_CELLS) {
    const sampled = samplePixelAtCellCenter(ctx, col, row)
    // A failure here means the sampling assertion below would pass vacuously — invalidating the
    // paintFillRect timing figure below, not just this render check.
    expect(sampled, `cell (${col}, ${row}) must read BACKGROUND before paintFillRect runs`).toEqual(
      BACKGROUND,
    )
  }

  paintFillRect(ctx, values)

  for (const { col, row } of SAMPLE_CELLS) {
    const expected = mapValueToRgba(values[cellIndex(col, row)] ?? 0)
    const sampled = samplePixelAtCellCenter(ctx, col, row)
    expect(
      sampled,
      `cell (${col}, ${row}) must equal mapValueToRgba's output after paintFillRect — a ` +
        'mismatch here means the PERF-05 fillRect figure is not trustworthy',
    ).toEqual(expected)
  }
})

test('equivalence: paintPutImageData writes the expected color into the expected cells, proven before timing', () => {
  const { ctx } = makeDisplayCanvas()
  clearToBackground(ctx)

  for (const { col, row } of SAMPLE_CELLS) {
    const sampled = samplePixelAtCellCenter(ctx, col, row)
    expect(
      sampled,
      `cell (${col}, ${row}) must read BACKGROUND before paintPutImageData runs`,
    ).toEqual(BACKGROUND)
  }

  paintPutImageData(ctx, values)

  for (const { col, row } of SAMPLE_CELLS) {
    const expected = mapValueToRgba(values[cellIndex(col, row)] ?? 0)
    const sampled = samplePixelAtCellCenter(ctx, col, row)
    expect(
      sampled,
      `cell (${col}, ${row}) must equal mapValueToRgba's output after paintPutImageData — a ` +
        'mismatch here means the PERF-05 putImageData figure is not trustworthy',
    ).toEqual(expected)
  }
})

// --- Measurement -------------------------------------------------------------------------------

test('PERF-05: both hand-rolled canvas arms measured on the identical 10,000-cell grid', async () => {
  const score = calibrationScore()

  const { ctx: fillRectCtx } = makeDisplayCanvas()
  const fillRectRawMs = await measureBatchedMinOfN(REPEAT_COUNT, FILL_RECT_BATCH_SIZE, () => {
    paintFillRect(fillRectCtx, values)
  })
  const fillRectNormalizedMs = normalize(fillRectRawMs, score)

  const { ctx: putImageDataCtx } = makeDisplayCanvas()
  const putImageDataRawMs = await measureBatchedMinOfN(REPEAT_COUNT, PUT_IMAGE_DATA_BATCH_SIZE, () => {
    paintPutImageData(putImageDataCtx, values)
  })
  const putImageDataNormalizedMs = normalize(putImageDataRawMs, score)

  await commands.recordEnvironment(captureEnvironment(score))

  const winner =
    fillRectNormalizedMs <= putImageDataNormalizedMs
      ? { name: 'fillRect' as const, normalizedMs: fillRectNormalizedMs, rawMs: fillRectRawMs }
      : { name: 'putImageData' as const, normalizedMs: putImageDataNormalizedMs, rawMs: putImageDataRawMs }
  const loser =
    winner.name === 'fillRect'
      ? { name: 'putImageData' as const, normalizedMs: putImageDataNormalizedMs }
      : { name: 'fillRect' as const, normalizedMs: fillRectNormalizedMs }

  const budget = PERF_BUDGETS['PERF-05']
  const row: MeasurementRow = {
    budgetId: budget.id,
    requirementId: budget.requirementId,
    measuredMs: winner.rawMs,
    normalizedMs: winner.normalizedMs,
    budgetMs: budget.thresholdMs,
    anchorMs: budget.anchorMs,
    anchorLabel: budget.anchorLabel,
    source: 'spike-synthetic',
    verdict: checkBudget({ normalizedMs: winner.normalizedMs, budgetMs: budget.thresholdMs }),
  }
  await commands.recordMeasurement(row)

  // Reproducibility (D-15, T-01-14): print both arms' figures, both batch sizes and both batch
  // minimums, and name which one the PERF-05 verdict was asserted against, so the record
  // preserves the comparison and the amortization rather than only the winner. Each batch minimum
  // is recovered by multiplying its arm's per-call raw figure back out by its own batch size.
  await commands.recordInfoLine(
    'PERF-05-canvas-arms',
    `PERF-05 canvas arms: fillRect=${fillRectNormalizedMs.toFixed(2)}ms ` +
      `(batchSize=${FILL_RECT_BATCH_SIZE} batchMinMs=${(fillRectRawMs * FILL_RECT_BATCH_SIZE).toFixed(4)}) ` +
      `putImageData=${putImageDataNormalizedMs.toFixed(2)}ms ` +
      `(batchSize=${PUT_IMAGE_DATA_BATCH_SIZE} batchMinMs=${(putImageDataRawMs * PUT_IMAGE_DATA_BATCH_SIZE).toFixed(4)}) ` +
      `winner=${winner.name} (asserted against PERF-05) loser=${loser.name}`,
  )

  // The precise per-metric signal: fails this test next to the code that measured the value.
  // The authoritative gate is the verdict check inside assertRunInvariants, which fails the run
  // even if this line is removed.
  expect(() => assertWithinBudget(row)).not.toThrow()
})
