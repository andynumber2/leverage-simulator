/**
 * tests/sweep/column-series.test.ts
 *
 * 07-01-PLAN.md Task 3: proves per-column series reuse (`src/sweep/resolve-column-series.ts`) is
 * correct, not just fast -- the first 07-VALIDATION.md Wave 0 requirement. Loads the real
 * committed bundle through the same Node loader `tests/data/kernel-inputs.test.ts` uses
 * (`loadBundleFromDisk`), so this file runs in the fast Node `unit` project, matched by the
 * existing recursive `tests/` directory test-file include with no vitest config change.
 *
 * Four behaviors, per the plan's own <behavior> block:
 * 1. `resolveColumnSeries`'s series arrays equal `buildKernelInputs`'s series, element for
 *    element, at three entry dates spanning the strict tier.
 * 2. Running `runBacktest` 50 times against one `resolveColumnSeries` result, varying only
 *    `params.leverage` across `leverageForRow(0)` through `leverageForRow(49)`, produces the same
 *    `finalValue`/`maxDrawdown`/`ruined` as calling `buildKernelInputs` freshly per leverage.
 * 3. An out-of-bounds entry date throws, naming both the offending date and the supported range.
 * 4. A fixed-period holding window that overruns is reported as a typed `incomplete` result, not
 *    a throw -- and is distinguishable from case 3 above.
 */

import { describe, expect, test } from 'vitest'

import { buildKernelInputs, type BacktestRequest } from '../../src/data/kernel-inputs.ts'
import { loadBundleFromDisk } from '../../src/data/load-bundle-node.ts'
import { runBacktest } from '../../src/kernel/backtest.ts'
import { LONG_GAP_FLAG_MIN_DAYS, type KernelOutputs, type KernelParams } from '../../src/kernel/backtest.types.ts'
import { resolveColumnSeries, type ColumnSeriesRequest } from '../../src/sweep/resolve-column-series.ts'
import { leverageForRow, SWEEP_ROWS } from '../../src/sweep/sweep-grid.ts'

/** Three entry dates spanning the strict tier (1988-01-05 to 2026-08-14): the first strict-tier
 * date, a date in the middle, and the last strict-tier date (deliberately close to the series'
 * own end, so this same set of dates does double duty proving the equality holds right up to the
 * edge the overrun test below explores). */
const ENTRY_DATES = ['1988-01-05', '2005-06-15', '2026-08-14'] as const

const EXPENSE_RATIO_PERCENT = 0.9
const FINANCING_SPREAD_PERCENT = 0.5
const INITIAL_INVESTMENT = 10_000

function baseColumnRequest(entryDate: string, overrides: Partial<ColumnSeriesRequest> = {}): ColumnSeriesRequest {
  return {
    symbol: 'SPX',
    dividendReinvest: true,
    entryDate,
    holdingPeriodBars: null,
    contributionAmount: 0,
    contributionFrequency: 'none',
    ...overrides,
  }
}

function baseBacktestRequest(
  entryDate: string,
  leverage: number,
  overrides: Partial<BacktestRequest> = {},
): BacktestRequest {
  return {
    symbol: 'SPX',
    dividendReinvest: true,
    leverage,
    entryDate,
    holdingPeriodBars: null,
    initialInvestment: INITIAL_INVESTMENT,
    contributionAmount: 0,
    contributionFrequency: 'none',
    expenseRatioPercent: EXPENSE_RATIO_PERCENT,
    financingSpreadPercent: FINANCING_SPREAD_PERCENT,
    ...overrides,
  }
}

describe('resolveColumnSeries: series equality against buildKernelInputs', () => {
  test.each(ENTRY_DATES)('matches buildKernelInputs element-for-element at entryDate %s', async (entryDate) => {
    const bundle = await loadBundleFromDisk()

    const columnResult = resolveColumnSeries(bundle, baseColumnRequest(entryDate))
    if (columnResult.incomplete) {
      throw new Error(`resolveColumnSeries: unexpected incomplete result for entryDate "${entryDate}"`)
    }

    const inputs = buildKernelInputs(bundle, baseBacktestRequest(entryDate, 3))

    // Deterministic typed arrays: exact element-wise equality, never a tolerance.
    expect(columnResult.returns).toEqual(inputs.series.returns)
    expect(columnResult.shortRate).toEqual(inputs.series.shortRate)
    expect(columnResult.calendarDaysElapsed).toEqual(inputs.series.calendarDaysElapsed)
    expect(columnResult.contributionFlags).toEqual(inputs.series.contributionFlags)
    expect(columnResult.barCount).toBe(inputs.window.barCount)
  })
})

describe('resolveColumnSeries: per-column series reuse across all 50 leverage rows', () => {
  test('produces identical finalValue/maxDrawdown/ruined to per-cell buildKernelInputs resolution, for every leverage row', async () => {
    const bundle = await loadBundleFromDisk()
    const entryDate = ENTRY_DATES[0]

    const columnResult = resolveColumnSeries(bundle, baseColumnRequest(entryDate))
    if (columnResult.incomplete) {
      throw new Error(`resolveColumnSeries: unexpected incomplete result for entryDate "${entryDate}"`)
    }

    // Scratch output arrays reused across all 50 leverages, the same discipline
    // `src/sweep/sweep.worker.ts` uses -- proves reuse is correct against fresh per-leverage
    // buffers too, not just against a first call.
    const outputs: KernelOutputs = {
      outValue: new Float64Array(columnResult.barCount),
      outRuined: new Uint8Array(columnResult.barCount),
      outLongGap: new Uint8Array(columnResult.barCount),
    }

    for (let row = 0; row < SWEEP_ROWS; row++) {
      const leverage = leverageForRow(row)

      const reusedParams: KernelParams = {
        leverage,
        initialInvestment: INITIAL_INVESTMENT,
        contributionAmount: 0,
        financingSpread: FINANCING_SPREAD_PERCENT / 100,
        expenseRatio: EXPENSE_RATIO_PERCENT / 100,
        longGapMinDays: LONG_GAP_FLAG_MIN_DAYS,
      }
      const reused = runBacktest(reusedParams, columnResult, outputs)

      const freshInputs = buildKernelInputs(bundle, baseBacktestRequest(entryDate, leverage))
      const fresh = runBacktest(freshInputs.params, freshInputs.series, freshInputs.outputs)

      expect(reused.finalValue, `row ${row} (leverage ${leverage}) finalValue`).toBe(fresh.finalValue)
      expect(reused.maxDrawdown, `row ${row} (leverage ${leverage}) maxDrawdown`).toBe(fresh.maxDrawdown)
      expect(reused.ruined, `row ${row} (leverage ${leverage}) ruined`).toBe(fresh.ruined)
    }
  })
})

describe('resolveColumnSeries: out-of-bounds entry date (D-32)', () => {
  test('throws an error naming both the offending date and the supported range', async () => {
    const bundle = await loadBundleFromDisk()
    const outOfRangeDate = '1900-01-01' // before SPX/total-return's own 1927-12-30 start

    expect(() => resolveColumnSeries(bundle, baseColumnRequest(outOfRangeDate))).toThrowError(
      new RegExp(outOfRangeDate.replace(/-/g, '\\-')),
    )
    // The same throw also names the supported range's start (D-32: never a bare "out of range").
    expect(() => resolveColumnSeries(bundle, baseColumnRequest(outOfRangeDate))).toThrowError(/1927-12-30/)
  })
})

describe('resolveColumnSeries: D-28 fixed-period overrun, distinguishable from the D-32 throw above', () => {
  test('reports a typed incomplete result rather than throwing', async () => {
    const bundle = await loadBundleFromDisk()
    const entryDate = ENTRY_DATES[2] // 2026-08-14, deliberately close to the series' own end
    const requestedBars = 100_000 // unreachable from this late an entry date

    const result = resolveColumnSeries(bundle, baseColumnRequest(entryDate, { holdingPeriodBars: requestedBars }))

    expect(result.incomplete).toBe(true)
    if (!result.incomplete) throw new Error('resolveColumnSeries: expected an incomplete result')
    expect(result.requestedBars).toBe(requestedBars)
    expect(result.maxBars).toBeGreaterThan(0)
    expect(result.maxBars).toBeLessThan(requestedBars)
  })

  test('is distinguishable from the out-of-bounds throw: the overrun case never throws at all', async () => {
    const bundle = await loadBundleFromDisk()
    const entryDate = ENTRY_DATES[2]

    expect(() =>
      resolveColumnSeries(bundle, baseColumnRequest(entryDate, { holdingPeriodBars: 100_000 })),
    ).not.toThrow()
  })
})
