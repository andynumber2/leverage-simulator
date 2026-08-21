/**
 * bench/heatmap-form-2.bench.test.ts: 06-03-PLAN.md Task 2, criterion 4's form-2 arm.
 *
 * Follows `bench/heatmap-repaint.bench.test.ts`'s pattern exactly: prove paint equivalence
 * BEFORE trusting any timing, then measure. Reads the committed `sweep-fixture.bin`'s bytes
 * through the `readSweepFixture` browser command, decodes it with the real `decodeSweepFixture`,
 * and measures `paintFilledContour` -- the actual paint function `form-2-filled-contour.html`
 * uses, not a copy.
 *
 * Criterion 4 names a METRIC CHANGE, so the measured operation is a repaint that switches the
 * displayed metric array from multiple-of-contributed to max drawdown and back, matching
 * `bench/heatmap-repaint.bench.test.ts`'s own convention.
 *
 * This file records ONLY an info line (`PERF-05-heatmap-form-2`) and asserts locally against
 * `PERF_BUDGETS['PERF-05']` -- it deliberately never calls `commands.recordMeasurement`.
 * `bench/heatmap-repaint.bench.test.ts` (form 1) already owns the run's single PERF-05
 * `MeasurementRow`; a second row with the same budget id would collide in the run's own
 * accumulator. Per finding F-02 (06-RESEARCH.md), the four per-form figures are each
 * individually gated against the same 16ms budget, painted at four different D-12 geometries --
 * they are informational, not a ranking between forms.
 */

import { commands } from 'vitest/browser'
import { beforeAll, expect, test } from 'vitest'

import { decodeSweepFixture, type SweepFixture } from '../src/data/sweep-fixture-format.ts'
import type { Rgba } from '../src/colorscale/value-to-color.ts'
import { resampleField } from '../.planning/phases/06-heatmap-design-pass/mockups/shared/field-sampler.ts'
import {
  fieldRect,
  FORM_2_GEOMETRY,
  paintFilledContour,
} from '../.planning/phases/06-heatmap-design-pass/mockups/forms/form-2-filled-contour.ts'
import { PERF_BUDGETS } from '../perf-budgets.ts'
import { measureBatchedMinOfN, normalize, REPEAT_COUNT } from './calibration.ts'
import { resolveRunCalibration } from './canonical-calibration.ts'
import { captureEnvironment } from './environment-block.ts'
import { assertWithinBudget, checkBudget, type MeasurementRow } from './report.ts'

/** Tuned empirically per Task 1's own instruction to pick a batch size that clears
 * `MIN_MEASUREMENT_MS`; form 2's repaint does far more per-pixel work than form 1's (a 764x224
 * bilinear resample plus eleven marching-squares passes, versus form 1's 200x50 flat lookup), so
 * a smaller batch than form 1's 200 already clears the floor. */
const REPAINT_BATCH_SIZE = 50

let fixture: SweepFixture

beforeAll(async () => {
  const payload = await commands.readSweepFixture()
  const bytes = new Uint8Array(payload.bytes)
  fixture = decodeSweepFixture(bytes.buffer)
})

function makeDisplayCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = FORM_2_GEOMETRY.widthPx
  canvas.height = FORM_2_GEOMETRY.heightPx
  // Deliberately never appended to the DOM, mirroring bench/heatmap-repaint.bench.test.ts: a
  // detached canvas still has a real 2D rendering context and real paint cost.
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('heatmap-form-2 bench: 2D context unavailable in this browser instance')
  }
  ctx.imageSmoothingEnabled = false
  return { canvas, ctx }
}

function samplePixelAtDisplayPoint(ctx: CanvasRenderingContext2D, x: number, y: number): Rgba {
  const pixel = ctx.getImageData(x, y, 1, 1).data
  return [pixel[0] ?? -1, pixel[1] ?? -1, pixel[2] ?? -1, pixel[3] ?? -1]
}

// --- Equivalence proof: must pass before the timing below is trusted -----------------------

test('equivalence: paintFilledContour writes resampleField-s own output into the field, proven before timing', () => {
  const field = fieldRect(FORM_2_GEOMETRY.widthPx, FORM_2_GEOMETRY.heightPx)

  // Two extreme field-pixel corners: the top-left field pixel (highest leverage row, earliest
  // entry-date column, per the A-E5 vertical flip) and the bottom-right (lowest leverage row,
  // latest entry-date column). Computed from resampleField's OWN (shared, reused) buffer FIRST,
  // before paintFilledContour's own internal resampleField call mutates that same buffer.
  const expectedBuffer = resampleField(fixture, 'multiple', { widthPx: field.width, heightPx: field.height })
  const cornerAt = (px: number, py: number): Rgba => {
    const i = (py * field.width + px) * 4
    return [expectedBuffer[i] ?? -1, expectedBuffer[i + 1] ?? -1, expectedBuffer[i + 2] ?? -1, expectedBuffer[i + 3] ?? -1]
  }
  const expectedTopLeft = cornerAt(0, 0)
  const expectedBottomRight = cornerAt(field.width - 1, field.height - 1)

  const { ctx } = makeDisplayCanvas()
  paintFilledContour(ctx, fixture, 'multiple')

  const sampledTopLeft = samplePixelAtDisplayPoint(ctx, field.x, field.y)
  expect(
    sampledTopLeft,
    'field pixel (0, 0) must equal resampleField-s own output after paintFilledContour: a mismatch ' +
      'here means the PERF-05 heatmap-form-2 figure below is not trustworthy',
  ).toEqual(expectedTopLeft)

  const sampledBottomRight = samplePixelAtDisplayPoint(ctx, field.x + field.width - 1, field.y + field.height - 1)
  expect(
    sampledBottomRight,
    'field pixel (width-1, height-1) must equal resampleField-s own output after paintFilledContour',
  ).toEqual(expectedBottomRight)
})

// --- Measurement -----------------------------------------------------------------------------

test('PERF-05: form 2 (filled contour) repaint on a metric change, measured on the real committed fixture', async () => {
  const score = await resolveRunCalibration()

  const { ctx } = makeDisplayCanvas()
  // A cold first paint pays one-time buffer construction cost a warm metric toggle never pays
  // again -- warm the buffer before the timed repaint below.
  paintFilledContour(ctx, fixture, 'multiple')

  let metric: 'multiple' | 'drawdown' = 'multiple'
  const rawMs = await measureBatchedMinOfN(REPEAT_COUNT, REPAINT_BATCH_SIZE, () => {
    metric = metric === 'multiple' ? 'drawdown' : 'multiple'
    paintFilledContour(ctx, fixture, metric)
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
  // Deliberately NOT commands.recordMeasurement(row): form 1 (bench/heatmap-repaint.bench.test.ts)
  // owns the run's one PERF-05 MeasurementRow. See this file's header comment.

  await commands.recordInfoLine(
    'PERF-05-heatmap-form-2',
    `PERF-05-heatmap-form-2: normalizedMs=${normalizedMs.toFixed(2)} rawMs=${rawMs.toFixed(4)} ` +
      `batchSize=${REPAINT_BATCH_SIZE} geometry=${JSON.stringify(FORM_2_GEOMETRY)} ` +
      `(individually gated at 16ms; per D-12/F-02 not a ranking against the other forms, which are ` +
      'painted at their own geometries)',
  )

  expect(() => assertWithinBudget(row)).not.toThrow()
})
