/**
 * bench/canvas-repaint.bench.test.ts — D-15: both hand-rolled canvas repaint arms, measured on
 * the identical 10,000-cell grid.
 *
 * `paintFillRect` and `paintPutImageData` (bench/canvas-grid.ts) paint the same
 * `makeGridValues` output through the same `mapValueToRgba` mapping, so this file settles D-15's
 * internal implementation fork with two comparable figures rather than a directional guess.
 *
 * The measurement itself is calibration-normalized (D-06) and compared against the real PERF-05
 * threshold in `perf-budgets.ts` via an ordinary Vitest `expect` — that `expect` call, not
 * `checkBudget`, is what fails CI on a breach (D-03). The faster arm's normalized figure is
 * recorded as the PERF-05 row; the slower arm's figure is preserved in stdout and in the JSON
 * artifact via the `recordInfoLine` bridge (introduced in plan 01-02), since a browser-context
 * `console.log` does not reach `npm run bench`'s stdout under the default reporter.
 *
 * Task 2 adds the equivalence proof that must pass before either figure below is trusted —
 * without it, an arm could win this comparison by painting less.
 */

import { commands } from 'vitest/browser'
import { beforeEach, expect, test } from 'vitest'

import {
  CELL_SIZE_PX,
  GRID_COLS,
  GRID_ROWS,
  makeGridValues,
  paintFillRect,
  paintPutImageData,
} from './canvas-grid.ts'
import { PERF_BUDGETS } from '../perf-budgets.ts'
import { calibrationScore, measureMinOfN, normalize, REPEAT_COUNT } from './calibration.ts'
import { captureEnvironment } from './environment-block.ts'
import { checkBudget, type MeasurementRow } from './report.ts'

const CANVAS_WIDTH = GRID_COLS * CELL_SIZE_PX
const CANVAS_HEIGHT = GRID_ROWS * CELL_SIZE_PX

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

let values: Float64Array

beforeEach(() => {
  values = makeGridValues(0x5eed)
})

test('PERF-05: both hand-rolled canvas arms measured on the identical 10,000-cell grid', async () => {
  const score = calibrationScore()

  const { ctx: fillRectCtx } = makeDisplayCanvas()
  const fillRectRawMs = await measureMinOfN(REPEAT_COUNT, () => {
    paintFillRect(fillRectCtx, values)
  })
  const fillRectNormalizedMs = normalize(fillRectRawMs, score)

  const { ctx: putImageDataCtx } = makeDisplayCanvas()
  const putImageDataRawMs = await measureMinOfN(REPEAT_COUNT, () => {
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

  // Reproducibility (D-15): print both arms' figures and name which one the PERF-05 verdict was
  // asserted against, so the record preserves the comparison rather than only the winner.
  await commands.recordInfoLine(
    'PERF-05-canvas-arms',
    `PERF-05 canvas arms: fillRect=${fillRectNormalizedMs.toFixed(2)}ms ` +
      `putImageData=${putImageDataNormalizedMs.toFixed(2)}ms ` +
      `winner=${winner.name} (asserted against PERF-05) loser=${loser.name}`,
  )

  // The actual gate: an ordinary Vitest assertion, so a breach fails the run through the normal
  // test-runner failure path with no separate reporting pipeline (D-03). A value exactly at
  // threshold passes, matching PERF-01's "fails only when a measured value exceeds its budget".
  expect(winner.normalizedMs).toBeLessThanOrEqual(budget.thresholdMs)
})
