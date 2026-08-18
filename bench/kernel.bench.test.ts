/**
 * bench/kernel.bench.test.ts: Task 1 (03-05), PERF-02 measurement. One full leveraged backtest
 * over the real ~25,000-bar bundled SPX history, following the same measure -> normalize ->
 * record -> assert shape as bench/canvas-repaint.bench.test.ts (plan 01-01). Measures
 * `runBacktest` from `src/kernel/backtest.ts`, the kernel that ships, against the committed
 * bundle -- not the Phase 1 spike (`runSpikeBacktest`) against a seeded synthetic series.
 */

import { commands } from 'vitest/browser'
import { expect, test } from 'vitest'

import { PERF_BUDGETS } from '../perf-budgets.ts'
import type { KernelOutputs, KernelParams, KernelSeries } from '../src/kernel/backtest.types.ts'
import { runBacktest } from '../src/kernel/backtest.ts'
import { measureBatchedMinOfN, normalize, REPEAT_COUNT } from './calibration.ts'
import { resolveRunCalibration } from './canonical-calibration.ts'
import { captureEnvironment } from './environment-block.ts'
import { assertWithinBudget, checkBudget, type MeasurementRow } from './report.ts'

// A single production-kernel call's raw cost is close enough to the Phase 1 spike's recorded
// 0.09999999962747097ms (01-SPIKE-RESULTS.md section 2) that measureMinOfN's MIN_MEASUREMENT_MS
// floor still requires batching. 500 calls per timed unit lands near 50ms, roughly five times the
// floor, at a total repeat cost (500 * 5 repeats) well inside BENCH_TOTAL_RUNTIME_CAP_MS.
const PERF_02_BATCH_SIZE = 500

test('PERF-02: a single full-history backtest over 25,000 bars stays under budget', async () => {
  // Real bundled series and kernel params, decoded Node-side (bench/kernel-series-bridge.ts) and
  // rebuilt into typed-array views here, before the timed region: the measurement must reflect
  // the recurrence's own cost, not series decoding or view construction.
  const payload = await commands.readKernelSeries()

  const series: KernelSeries = {
    returns: Float64Array.from(payload.returns),
    shortRate: Float64Array.from(payload.shortRate),
    calendarDaysElapsed: Int32Array.from(payload.calendarDaysElapsed),
    contributionFlags: new Uint8Array(payload.barCount),
  }
  const params: KernelParams = {
    leverage: payload.leverage,
    initialInvestment: payload.initialInvestment,
    contributionAmount: payload.contributionAmount,
    financingSpread: payload.financingSpread,
    expenseRatio: payload.expenseRatio,
    longGapMinDays: payload.longGapMinDays,
  }
  const outputs: KernelOutputs = {
    outValue: new Float64Array(payload.barCount),
    outRuined: new Uint8Array(payload.barCount),
    outLongGap: new Uint8Array(payload.barCount),
  }

  // The run's canonical calibration figure, shared with every other bench file in this run.
  const score = await resolveRunCalibration()

  // T-03-20: measureMinOfN throws when the batch total falls below MIN_MEASUREMENT_MS, rather
  // than returning a sub-floor figure silently. If the production kernel is fast enough that the
  // declared 500-call batch no longer clears the floor, the remedy is a larger batch, recorded
  // through recordInfoLine below -- never lowering MIN_MEASUREMENT_MS or retuning calibration.
  let batchSize = PERF_02_BATCH_SIZE
  let rawMs: number
  try {
    rawMs = await measureBatchedMinOfN(REPEAT_COUNT, batchSize, () => {
      runBacktest(params, series, outputs)
    })
  } catch {
    batchSize = PERF_02_BATCH_SIZE * 10
    rawMs = await measureBatchedMinOfN(REPEAT_COUNT, batchSize, () => {
      runBacktest(params, series, outputs)
    })
  }
  const normalizedMs = normalize(rawMs, score)

  await commands.recordEnvironment(captureEnvironment(score))

  // Reproducibility (T-01-14): print the batch size and the batch minimum the per-call figure
  // was derived from, plus the real bar count and resolved series id, so the reported figure
  // names the history it was measured over, not just the amortization.
  await commands.recordInfoLine(
    'PERF-02-batch',
    `PERF-02 batch: batchSize=${batchSize} batchMinMs=${(rawMs * batchSize).toFixed(4)} ` +
      `perCallMs=${rawMs.toFixed(4)} barCount=${payload.barCount} seriesId=${payload.seriesId}`,
  )

  const budget = PERF_BUDGETS['PERF-02']
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

  // The precise per-metric signal: fails this test next to the code that measured the value.
  // The authoritative gate is the verdict check inside assertRunInvariants, which fails the run
  // even if this line is removed.
  expect(() => assertWithinBudget(row)).not.toThrow()
})
