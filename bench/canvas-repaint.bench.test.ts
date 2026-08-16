/**
 * bench/canvas-repaint.bench.test.ts — the one real measurement in this slice.
 *
 * Paints a deterministic 200x50 (10,000-cell) grid onto a detached `<canvas>` with one
 * `fillRect` call per cell, hand-rolled with no charting library (D-14) — uPlot has no heatmap
 * mark, and every general-purpose charting library surveyed in RESEARCH.md degrades or defaults
 * to SVG well under 10,000 cells. The measurement is calibration-normalized (D-06) and compared
 * against the real PERF-05 threshold in `perf-budgets.ts` via an ordinary Vitest `expect` — that
 * `expect` call, not `checkBudget`, is what fails CI on a breach (D-03).
 */

import { commands } from 'vitest/browser'
import { expect, test } from 'vitest'

import { PERF_BUDGETS } from '../perf-budgets.ts'
import { calibrationScore, measureMinOfN, normalize, REPEAT_COUNT } from './calibration.ts'
import { captureEnvironment } from './environment-block.ts'
import { checkBudget, type MeasurementRow } from './report.ts'

const GRID_COLS = 200
const GRID_ROWS = 50
const CELL_COUNT = GRID_COLS * GRID_ROWS
const CELL_SIZE_PX = 4

/** Deterministic PRNG (mulberry32) so the grid's values — and therefore the exact sequence of
 * `fillRect` calls and fill-style strings — are identical across machines and runs, per D-16's
 * "deterministic across machines and runs" requirement for this phase's synthetic input. */
function mulberry32(seed: number): () => number {
  let state = seed
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeGridValues(seed: number): Float64Array {
  const rng = mulberry32(seed)
  const values = new Float64Array(CELL_COUNT)
  for (let i = 0; i < CELL_COUNT; i++) {
    values[i] = rng()
  }
  return values
}

/** Hand-rolled two-color linear interpolation (no d3-scale) — this measurement only needs a
 * cheap, deterministic mapping from a normalized value to a fill color, not a real color scale
 * design; the real heatmap's color scale is a later phase's UI concern. */
function mapValueToRgba(value: number): string {
  const clamped = Math.min(1, Math.max(0, value))
  const r = Math.round(255 * clamped)
  const b = Math.round(255 * (1 - clamped))
  return `rgb(${r}, 64, ${b})`
}

function paintFillRect(ctx: CanvasRenderingContext2D, values: Float64Array): void {
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const value = values[row * GRID_COLS + col] ?? 0
      ctx.fillStyle = mapValueToRgba(value)
      ctx.fillRect(col * CELL_SIZE_PX, row * CELL_SIZE_PX, CELL_SIZE_PX, CELL_SIZE_PX)
    }
  }
}

test('PERF-05: 10,000-cell canvas fillRect repaint stays under budget', async () => {
  const canvas = document.createElement('canvas')
  canvas.width = GRID_COLS * CELL_SIZE_PX
  canvas.height = GRID_ROWS * CELL_SIZE_PX
  // Deliberately never appended to the DOM — a detached canvas still has a real 2D rendering
  // context and real fillRect cost, per D-02's "real Canvas" requirement, without needing a
  // page layout to host it.
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('canvas-repaint bench: 2D context unavailable in this browser instance')
  }
  ctx.imageSmoothingEnabled = false

  const values = makeGridValues(0x5eed)

  const score = calibrationScore()
  const rawMs = await measureMinOfN(REPEAT_COUNT, () => {
    paintFillRect(ctx, values)
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
    source: 'spike-synthetic',
    verdict: checkBudget({ normalizedMs, budgetMs: budget.thresholdMs }),
  }
  await commands.recordMeasurement(row)

  // The actual gate: an ordinary Vitest assertion, so a breach fails the run through the normal
  // test-runner failure path with no separate reporting pipeline (D-03). A value exactly at
  // threshold passes, matching PERF-01's "fails only when a measured value exceeds its budget".
  expect(normalizedMs).toBeLessThanOrEqual(budget.thresholdMs)
})
