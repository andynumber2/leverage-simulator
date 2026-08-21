/**
 * bench/heatmap-form-3.bench.test.ts: 06-04-PLAN.md Task 2, criterion 4's form-3 arm.
 *
 * Follows `bench/heatmap-repaint.bench.test.ts`'s pattern exactly: prove paint equivalence BEFORE
 * trusting any timing, then measure. Reads the committed `sweep-fixture.bin`'s bytes through the
 * same `readSweepFixture` browser command (`vitest.config.ts`), decodes it with the real
 * `decodeSweepFixture`, and measures `paintSmallMultiples` -- the actual paint function
 * `form-3-small-multiples.html` uses, not a copy.
 *
 * Criterion 4 names a METRIC CHANGE, so the measured operation is a repaint that switches the
 * displayed metric array from multiple-of-contributed to max drawdown and back, not a first
 * paint.
 *
 * This file does NOT call `commands.recordMeasurement`: `bench/heatmap-repaint.bench.test.ts`
 * (form 1) already owns the run's one PERF-05 `MeasurementRow`, and a second row carrying the
 * same budget id would collide in the accumulator. Instead this file records an info line and
 * asserts locally against the same 16ms budget via an ordinary `expect`. Per finding F-02, the
 * four per-form figures are each individually gated against 16ms at their own D-12 geometry --
 * form 3 paints fifty separated strips, not form 1's dense grid -- so this is not a ranking
 * between forms.
 */

import { commands } from 'vitest/browser'
import { beforeAll, expect, test } from 'vitest'

import { valueToColor, type Rgba } from '../src/colorscale/value-to-color.ts'
import {
  CELL_FLAG_INCOMPLETE,
  decodeSweepFixture,
  type SweepFixture,
} from '../src/data/sweep-fixture-format.ts'
import {
  cellDisplayCenter,
  FORM_3_GEOMETRY,
  gapCenterBetween,
  paintSmallMultiples,
} from '../.planning/phases/06-heatmap-design-pass/mockups/forms/form-3-small-multiples.ts'
import { PERF_BUDGETS } from '../perf-budgets.ts'
import { measureBatchedMinOfN, normalize, REPEAT_COUNT } from './calibration.ts'
import { resolveRunCalibration } from './canonical-calibration.ts'
import { captureEnvironment } from './environment-block.ts'
import { assertWithinBudget, checkBudget, type MeasurementRow } from './report.ts'

/** Tuned empirically per Task 1's own instruction to pick a batch size that clears
 * `MIN_MEASUREMENT_MS`; a single 200x50 (50 drawImage calls) repaint is well under that floor. */
const REPAINT_BATCH_SIZE = 200

/** A background no `valueToColor` output can ever equal: every `valueToColor` output always
 * carries alpha 255, so a background with any other alpha is safe from a vacuous match regardless
 * of its RGB channels. */
const BACKGROUND: Rgba = [0, 200, 0, 254]

let fixture: SweepFixture

beforeAll(async () => {
  const payload = await commands.readSweepFixture()
  const bytes = new Uint8Array(payload.bytes)
  fixture = decodeSweepFixture(bytes.buffer)
})

function makeDisplayCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = FORM_3_GEOMETRY.widthPx
  canvas.height = FORM_3_GEOMETRY.heightPx
  // Deliberately never appended to the DOM, mirroring bench/canvas-repaint.bench.test.ts: a
  // detached canvas still has a real 2D rendering context and real paint cost.
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('heatmap-form-3 bench: 2D context unavailable in this browser instance')
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

function cellCenter(row: number, col: number): { x: number; y: number } {
  const { x, y } = cellDisplayCenter(fixture, row, col, FORM_3_GEOMETRY.widthPx, FORM_3_GEOMETRY.heightPx)
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

/** Finds the first cell flagged incomplete, scanning in fixture order, so the equivalence proof's
 * third sample point is a real incomplete-hold cell rather than a hardcoded column that could
 * silently stop being incomplete if the committed fixture is ever regenerated. Throws if none
 * exists: the proof would be vacuous otherwise. */
function findIncompleteCell(): { row: number; col: number } {
  for (let row = 0; row < fixture.rows; row++) {
    for (let col = 0; col < fixture.cols; col++) {
      const flags = fixture.flags[row * fixture.cols + col] ?? 0
      if ((flags & CELL_FLAG_INCOMPLETE) !== 0) {
        return { row, col }
      }
    }
  }
  throw new Error('heatmap-form-3 bench: fixture has no incomplete-hold cell to sample')
}

/** The grid's first strip, its last strip, and a real incomplete-hold cell, so a partitioning or
 * off-by-one bug at either boundary -- or a form that painted only part of the field -- would be
 * caught. Mirrors `bench/heatmap-repaint.bench.test.ts`'s `sampleCells`. */
function sampleCells(): ReadonlyArray<{ row: number; col: number }> {
  return [
    { row: 0, col: 0 },
    { row: fixture.rows - 1, col: fixture.cols - 1 },
    findIncompleteCell(),
  ]
}

/** Converts a `#rrggbb` CSS colour string (this codebase's `--color-surface` tokens are always
 * this shape, `src/app/styles.css`) into the same `Rgba` tuple `samplePixelAtDisplayPoint`
 * returns, so the gap-colour assertion below compares like with like. */
function parseHexColor(hex: string): Rgba {
  const value = hex.startsWith('#') ? hex.slice(1) : hex
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return [r, g, b, 255]
}

// --- Equivalence proof: must pass before the timing below is trusted -----------------------

test('equivalence: paintSmallMultiples writes the expected color into the expected cells and gap, proven before timing', () => {
  const { ctx } = makeDisplayCanvas()
  clearToBackground(ctx)

  const cells = sampleCells()
  for (const { row, col } of cells) {
    const { x, y } = cellCenter(row, col)
    const sampled = samplePixelAtDisplayPoint(ctx, x, y)
    expect(sampled, `cell (row=${row}, col=${col}) must read BACKGROUND before paintSmallMultiples runs`).toEqual(
      BACKGROUND,
    )
  }

  paintSmallMultiples(ctx, fixture, 'multiple')

  for (const { row, col } of cells) {
    const { x, y } = cellCenter(row, col)
    const expected = expectedColorFor(row, col, 'multiple')
    const sampled = samplePixelAtDisplayPoint(ctx, x, y)
    expect(
      sampled,
      `cell (row=${row}, col=${col}) must equal valueToColor's own output after paintSmallMultiples: a ` +
        'mismatch here means the PERF-05 heatmap-form-3 figure below is not trustworthy',
    ).toEqual(expected)
  }

  // T-06-12: a strip GAP must equal the panel surface colour, never a scale colour.
  const surfaceColorHex = getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim()
  const surfaceRgba = parseHexColor(surfaceColorHex)
  const gapPoint = gapCenterBetween(fixture, 0, FORM_3_GEOMETRY.widthPx, FORM_3_GEOMETRY.heightPx)
  const gapSampled = samplePixelAtDisplayPoint(ctx, Math.floor(gapPoint.x), Math.floor(gapPoint.y))
  expect(
    gapSampled,
    'a strip gap must equal the panel surface colour, not a scale colour or a categorical state',
  ).toEqual(surfaceRgba)
})

// --- Measurement -----------------------------------------------------------------------------

test('PERF-05: form 3 (small multiples) repaint on a metric change, measured on the real committed fixture', async () => {
  const score = await resolveRunCalibration()

  const { ctx } = makeDisplayCanvas()
  // A cold first paint pays one-time buffer/ImageData construction cost a warm metric toggle
  // never pays again -- warm the buffer before the timed repaint below.
  paintSmallMultiples(ctx, fixture, 'multiple')

  let metric: 'multiple' | 'drawdown' = 'multiple'
  const rawMs = await measureBatchedMinOfN(REPEAT_COUNT, REPAINT_BATCH_SIZE, () => {
    metric = metric === 'multiple' ? 'drawdown' : 'multiple'
    paintSmallMultiples(ctx, fixture, metric)
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

  // Deliberately NOT calling commands.recordMeasurement(row) -- see this file's header comment:
  // form 1's bench file owns the run's one PERF-05 MeasurementRow.

  await commands.recordInfoLine(
    'PERF-05-heatmap-form-3',
    `PERF-05-heatmap-form-3: normalizedMs=${normalizedMs.toFixed(2)} rawMs=${rawMs.toFixed(4)} ` +
      `batchSize=${REPAINT_BATCH_SIZE} geometry=${JSON.stringify(FORM_3_GEOMETRY)} ` +
      `(individually gated at 16ms; per D-12/F-02 not a ranking against forms 1, 2 and 4, which are ` +
      'painted at their own geometries)',
  )

  expect(() => assertWithinBudget(row)).not.toThrow()
})
