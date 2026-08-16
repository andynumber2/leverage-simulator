/**
 * spike/wasm-microbench/harness/js-reference.ts — computes the JS arm's finalValue/ruined for
 * the exact same seed and params the WASM harness (harness/index.html) uses, by importing
 * bench/kernel.ts and bench/synthetic-data.ts directly (not a reimplementation), so the
 * equivalence check in harness/run.mjs compares against the real JS arm, not a restatement of
 * it. Run with `node --experimental-strip-types` (Node 22's native TS type-stripping) — no
 * separate build step, no new devDependency.
 */

import { runSpikeBacktest, type SpikeKernelParams } from '../../../bench/kernel.ts'
import { BAR_COUNT, DEFAULT_SEED, makeSeededGbmSeries } from '../../../bench/synthetic-data.ts'

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

const result = runSpikeBacktest(params, series, outValue, outRuined)

process.stdout.write(JSON.stringify(result))
