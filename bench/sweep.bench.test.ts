/**
 * bench/sweep.bench.test.ts — Task 2: correctness assertions for the real Worker pool sweep,
 * then the PERF-03 measurement. The `<behavior>` assertions run first and must all pass before
 * any timing figure is trusted — a sweep that is fast because it computed nothing must not be
 * able to produce a passing figure.
 */

import { commands } from 'vitest/browser'
import { expect, test } from 'vitest'

import { paramsForCell, runSpikeBacktest, SWEEP_COLS, SWEEP_ROWS } from './kernel.ts'
import { PERF_BUDGETS } from '../perf-budgets.ts'
import { calibrationScore, measureMinOfN, normalize, REPEAT_COUNT } from './calibration.ts'
import { captureEnvironment } from './environment-block.ts'
import { assertWithinBudget, checkBudget, type MeasurementRow } from './report.ts'
import { resolveWorkerCount, runSpikeSweep } from './sweep-pool.ts'
import { BAR_COUNT, DEFAULT_SEED, makeSeededGbmSeries } from './synthetic-data.ts'

const CELL_COUNT = SWEEP_COLS * SWEEP_ROWS

/**
 * A small deterministic stride sample of cells (not the full 10,000-cell grid), computed
 * serially on the calling thread as the correctness reference for the pool-computed grid. A
 * full 10,000-cell serial pass (no partitioning, no worker parallelism) would add several
 * seconds to this bench file's own runtime on top of every other registered arm, pushing the
 * whole suite toward BENCH_TOTAL_RUNTIME_CAP_MS — see 01-02-SUMMARY.md for the measured cost
 * this traded off against and why a 50-cell stride sample is sufficient to catch a partitioning
 * bug (it samples across both the leverage axis and the entry-date axis, not a single row/column).
 */
const SERIAL_REFERENCE_SAMPLE_COUNT = 50
const SERIAL_REFERENCE_STRIDE = 197 // coprime with 10,000 -> visits distinct rows and columns

function computeSerialReferenceSample(): Map<number, number> {
  const series = makeSeededGbmSeries(DEFAULT_SEED)
  const outValue = new Float64Array(BAR_COUNT)
  const outRuined = new Uint8Array(BAR_COUNT)
  const reference = new Map<number, number>()
  for (let i = 0; i < SERIAL_REFERENCE_SAMPLE_COUNT; i++) {
    const cell = (i * SERIAL_REFERENCE_STRIDE) % CELL_COUNT
    const row = Math.floor(cell / SWEEP_COLS)
    const col = cell % SWEEP_COLS
    const params = paramsForCell(row, col)
    const result = runSpikeBacktest(params, series, outValue, outRuined)
    reference.set(cell, result.finalValue)
  }
  return reference
}

test('resolveWorkerCount: floors at 1 and reserves one core for the calling thread', () => {
  const workerCount = resolveWorkerCount()
  const expected = Math.max(1, (navigator.hardwareConcurrency || 1) - 1)
  expect(workerCount).toBe(expected)
  expect(workerCount).toBeGreaterThanOrEqual(1)
})

test('sweep pool: full grid has 10,000 finite cells with no holes', async () => {
  const { grid } = await runSpikeSweep(DEFAULT_SEED)
  expect(grid.length).toBe(CELL_COUNT)
  let finiteCount = 0
  for (let i = 0; i < grid.length; i++) {
    const value = grid[i] ?? Number.NaN
    expect(Number.isNaN(value)).toBe(false)
    if (Number.isFinite(value)) {
      finiteCount++
    }
  }
  expect(finiteCount).toBe(CELL_COUNT)
})

test('sweep pool: two runs with the same seed produce an element-wise identical grid', async () => {
  const first = await runSpikeSweep(DEFAULT_SEED)
  const second = await runSpikeSweep(DEFAULT_SEED)
  expect(Array.from(second.grid)).toEqual(Array.from(first.grid))
})

test(
  'sweep pool: pool-computed cells match a serial reference sample (subset, not the full ' +
    '10,000 cells — see 01-02-SUMMARY.md); inverting this assertion must fail the run',
  async () => {
    const reference = computeSerialReferenceSample()
    const { grid } = await runSpikeSweep(DEFAULT_SEED)
    for (const [cell, expectedValue] of reference) {
      expect(grid[cell] ?? Number.NaN).toBeCloseTo(expectedValue, 6)
    }
  },
)

test('PERF-03: a full 10,000-cell sweep on a real Worker pool stays under budget', async () => {
  const score = calibrationScore()
  let workerCount = 0
  let chunkCount = 0
  const rawMs = await measureMinOfN(REPEAT_COUNT, async () => {
    const result = await runSpikeSweep(DEFAULT_SEED)
    workerCount = result.workerCount
    chunkCount = result.chunkCount
  })
  const normalizedMs = normalize(rawMs, score)

  await commands.recordEnvironment(captureEnvironment(score))

  const budget = PERF_BUDGETS['PERF-03']
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

  // Reproducibility (acceptance criteria): print the resolved worker count and chosen chunk
  // count that produced this figure. Routed through the recordInfoLine bridge, not a plain
  // console.log, because a browser-context console.log does not reach `npm run bench`'s stdout
  // under the default (non-verbose) Vitest reporter — see bench/accumulator-store.ts.
  await commands.recordInfoLine(
    'PERF-03-sweep',
    `PERF-03 sweep: workerCount=${workerCount} chunkCount=${chunkCount}`,
  )

  // The precise per-metric signal: fails this test next to the code that measured the value.
  // The authoritative gate is the verdict check inside assertRunInvariants, which fails the run
  // even if this line is removed.
  expect(() => assertWithinBudget(row)).not.toThrow()
})
