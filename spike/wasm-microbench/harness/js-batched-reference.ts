/**
 * spike/wasm-microbench/harness/js-batched-reference.ts — a secondary, above-noise-floor JS
 * timing figure, for the same reason harness/index.html's batched WASM measurement exists: a
 * single `runSpikeBacktest` call lands at/below `performance.now()`'s effective resolution (see
 * the PERF-02 raw figure recorded in 01-02-SUMMARY.md and reproduced by this crate's own
 * single-call measurement), so BATCH_SIZE calls inside one timed unit is used to recover a
 * genuinely resolvable per-call cost.
 *
 * Runs under Node's V8, not headless Chromium's V8 (D-02 governs the *permanent* PERF-02..09
 * harness, not this throwaway ratio). Both are V8, and this per-call arithmetic cost is
 * engine-behavior-dominated rather than environment-dominated, but this figure is explicitly a
 * supplementary data point, not a substitute for the primary same-environment (headless
 * Chromium) single-call ratio against the already-recorded PERF-02 figure.
 */

import { runSpikeBacktest, type SpikeKernelParams } from '../../../bench/kernel.ts'
import { BAR_COUNT, DEFAULT_SEED, makeSeededGbmSeries } from '../../../bench/synthetic-data.ts'

const REPEAT_COUNT = 5
const BATCH_SIZE = 5000

const series = makeSeededGbmSeries(DEFAULT_SEED)
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

function measureMinOfN(n: number, fn: () => void): number {
  let min = Number.POSITIVE_INFINITY
  for (let i = 0; i < n; i++) {
    const start = performance.now()
    fn()
    const elapsed = performance.now() - start
    if (elapsed < min) min = elapsed
  }
  return min
}

const batchRawMs = measureMinOfN(REPEAT_COUNT, () => {
  for (let i = 0; i < BATCH_SIZE; i++) {
    runSpikeBacktest(params, series, outValue, outRuined)
  }
})
const perCallRawMs = batchRawMs / BATCH_SIZE

process.stdout.write(
  JSON.stringify({
    engine: 'node-v8',
    batchSize: BATCH_SIZE,
    batchRawMs,
    perCallRawMs,
  }),
)
