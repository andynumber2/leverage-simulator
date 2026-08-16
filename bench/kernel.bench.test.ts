/**
 * bench/kernel.bench.test.ts — Task 1: PERF-02 measurement. One full leveraged backtest over
 * the 25,000-bar seeded synthetic series, following the same measure -> normalize -> record ->
 * assert shape as bench/canvas-repaint.bench.test.ts (plan 01-01).
 */

import { commands } from 'vitest/browser'
import { expect, test } from 'vitest'

import { PERF_BUDGETS } from '../perf-budgets.ts'
import { calibrationScore, measureMinOfN, normalize, REPEAT_COUNT } from './calibration.ts'
import { captureEnvironment } from './environment-block.ts'
import { runSpikeBacktest, type SpikeKernelParams } from './kernel.ts'
import { assertWithinBudget, checkBudget, type MeasurementRow } from './report.ts'
import { BAR_COUNT, makeSeededGbmSeries } from './synthetic-data.ts'

test('PERF-02: a single full-history backtest over 25,000 bars stays under budget', async () => {
  // Series and output buffers preallocated once, outside the timed region, per D-06/F1 — the
  // measurement must reflect the recurrence's own cost, not series generation or allocation.
  const series = makeSeededGbmSeries()
  const outValue = new Float64Array(BAR_COUNT)
  const outRuined = new Uint8Array(BAR_COUNT)
  const params: SpikeKernelParams = {
    leverage: 3,
    entryIndex: 0,
    initialInvestment: 10_000,
    contributionAmount: 100,
    contributionIntervalBars: 21,
    financingSpread: 0.005,
    expenseRatio: 0.0095,
  }

  const score = calibrationScore()
  const rawMs = await measureMinOfN(REPEAT_COUNT, () => {
    runSpikeBacktest(params, series, outValue, outRuined)
  })
  const normalizedMs = normalize(rawMs, score)

  await commands.recordEnvironment(captureEnvironment(score))

  const budget = PERF_BUDGETS['PERF-02']
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

  // The precise per-metric signal: fails this test next to the code that measured the value.
  // The authoritative gate is the verdict check inside assertRunInvariants, which fails the run
  // even if this line is removed.
  expect(() => assertWithinBudget(row)).not.toThrow()
})
