/**
 * bench/kernel-series-bridge.ts: Task 1 (03-05), the Node-side loader PERF-02 uses to hand the
 * browser bench context real bundled series, in place of the seeded synthetic series the Phase 1
 * spike measured. Mirrors bench/bundle-bytes.ts's Node-only separation: this module transitively
 * imports node:fs (via src/data/kernel-inputs.ts), so it must never be imported by a
 * *.bench.test.ts file directly, only through vitest.config.ts's `browser.commands` bridge --
 * exactly as `readBundleBytes` delegates to `measureBundleBytes`.
 *
 * The payload crosses a structured-clone boundary into the browser context. Typed arrays do not
 * survive that boundary intact, so every array here is converted to a plain `number[]` for
 * transport; the browser side (bench/kernel.bench.test.ts) rebuilds `Float64Array`/`Int32Array`
 * views once, outside the timed region.
 */

import path from 'node:path'

import { buildKernelInputs, type BacktestRequest } from '../src/data/kernel-inputs.ts'
import { loadBundleFromDisk } from '../src/data/load-bundle-node.ts'

/** SPX's first supported bar (manifest firstDate, calendarStartIndex 0): the earliest possible
 * entry so the measured window spans the full ~25,000-bar committed history, not a shorter slice
 * of it. */
const SPX_ENTRY_DATE = '1927-12-30'

/** Matches the Phase 1 spike's SpikeKernelParams fractions (financingSpread 0.005, expenseRatio
 * 0.0095) via buildKernelInputs's percent-to-fraction conversion (D-09), so PERF-02's cost profile
 * is not accidentally cheapened or inflated by switching to the production kernel. */
const FINANCING_SPREAD_PERCENT = 0.5
const EXPENSE_RATIO_PERCENT = 0.95

export interface ProductionKernelSeriesPayload {
  returns: number[]
  shortRate: number[]
  calendarDaysElapsed: number[]
  leverage: number
  initialInvestment: number
  contributionAmount: number
  financingSpread: number
  expenseRatio: number
  longGapMinDays: number
  seriesId: string
  barCount: number
}

/**
 * Loads the committed bundle and builds one SPX price-return (dividendReinvest false) backtest at
 * leverage 3 from `SPX_ENTRY_DATE` to the last bar both the price and rate series cover
 * (holdingPeriodBars null), then converts the resulting `KernelSeries`/`KernelParams` into a
 * plain-array payload.
 *
 * `bundleDir` is the same `COMPILED_BUNDLE_DIR` constant `vitest.config.ts` already resolves
 * (`<repoRoot>/public/data`); `loadBundleFromDisk` resolves `<rootDir>/public/<MANIFEST_PATH>`
 * from its own `rootDir` argument, so `bundleDir`'s grandparent is that root.
 */
export async function readProductionKernelSeries(
  bundleDir: string,
): Promise<ProductionKernelSeriesPayload> {
  const rootDir = path.resolve(bundleDir, '..', '..')
  const bundle = await loadBundleFromDisk(rootDir)

  const request: BacktestRequest = {
    symbol: 'SPX',
    dividendReinvest: false,
    leverage: 3,
    entryDate: SPX_ENTRY_DATE,
    holdingPeriodBars: null,
    initialInvestment: 10_000,
    contributionAmount: 100,
    contributionFrequency: 'none',
    expenseRatioPercent: EXPENSE_RATIO_PERCENT,
    financingSpreadPercent: FINANCING_SPREAD_PERCENT,
  }

  const inputs = buildKernelInputs(bundle, request)

  return {
    returns: Array.from(inputs.series.returns),
    shortRate: Array.from(inputs.series.shortRate),
    calendarDaysElapsed: Array.from(inputs.series.calendarDaysElapsed),
    leverage: inputs.params.leverage,
    initialInvestment: inputs.params.initialInvestment,
    contributionAmount: inputs.params.contributionAmount,
    financingSpread: inputs.params.financingSpread,
    expenseRatio: inputs.params.expenseRatio,
    longGapMinDays: inputs.params.longGapMinDays,
    seriesId: inputs.meta.seriesId,
    barCount: inputs.window.barCount,
  }
}
