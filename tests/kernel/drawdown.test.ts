/**
 * tests/kernel/drawdown.test.ts
 *
 * Phase 4 F-01/METR-03: `KernelResult.maxDrawdown`, the largest peak-to-trough fractional decline
 * of the portfolio value series, tracked in-loop (04-02-PLAN.md Task 1). Covers every case in
 * Task 1's `<behavior>` block: monotonic non-decreasing (0), ruin (exactly 1), a single decline
 * followed by a new high (the decline, not swallowed by the later peak), two peaks with the
 * deeper trough after the second (the larger fractional decline), and the real bundled SPX
 * total-return series at 3x over the full strict tier (strictly between 0 and 1).
 */

import { describe, expect, test } from 'vitest'

import { buildKernelInputs, type BacktestRequest } from '../../src/data/kernel-inputs.ts'
import { loadBundleFromDisk } from '../../src/data/load-bundle-node.ts'
import { runBacktest } from '../../src/kernel/backtest.ts'
import { baseKernelParams, makeKernelSeries, makeOutputs } from './fixtures.ts'

describe('F-01/METR-03: maxDrawdown is the largest peak-to-trough fractional decline', () => {
  test('a monotonically non-decreasing value series yields maxDrawdown exactly 0', () => {
    // bar0 anchor; bars 1-3 each post a positive return, so the value never falls below its
    // running peak.
    const series = makeKernelSeries([0, 0.01, 0.02, 0.005], [0, 0, 0, 0], [0, 1, 1, 1])
    const params = baseKernelParams({ leverage: 1, financingSpread: 0, expenseRatio: 0 })
    const outputs = makeOutputs(4)

    const result = runBacktest(params, series, outputs)

    expect(result.ruined).toBe(false)
    expect(result.maxDrawdown).toBe(0)
  })

  test('a run that ruins yields maxDrawdown exactly 1, because the ruin bar clamps to exactly 0 against a strictly positive prior peak', () => {
    const series = makeKernelSeries([0, -0.4], [0, 0], [0, 1])
    const params = baseKernelParams({ leverage: 3, financingSpread: 0, expenseRatio: 0 })
    const outputs = makeOutputs(2)

    const result = runBacktest(params, series, outputs)

    expect(result.ruined).toBe(true)
    expect(result.maxDrawdown).toBe(1)
  })

  test('a 40% decline from the entry peak, followed by a recovery to a new high, yields maxDrawdown 0.4 -- not the (zero) drawdown from the later, higher peak', () => {
    // bar0 anchor at 10,000 (the first peak); bar1 falls 40% to 6,000 (peak-to-trough 0.4);
    // bar2 rises 150% to 15,000, a new peak with no decline after it.
    const series = makeKernelSeries([0, -0.4, 1.5], [0, 0, 0], [0, 1, 1])
    const params = baseKernelParams({ leverage: 1, financingSpread: 0, expenseRatio: 0 })
    const outputs = makeOutputs(3)

    const result = runBacktest(params, series, outputs)

    expect(result.ruined).toBe(false)
    expect(outputs.outValue[2]).toBeCloseTo(15_000, 6)
    expect(result.maxDrawdown).toBeCloseTo(0.4, 12)
  })

  test('two separate peaks with the deeper trough after the second peak yields the larger of the two fractional declines', () => {
    // bar0 anchor at 10,000 (peak 1); bar1 falls 20% to 8,000 (decline 0.2); bar2 rises 50% to
    // 12,000 (peak 2, a new high); bar3 falls 50% to 6,000 (decline 0.5 off peak 2) -- the larger
    // of the two declines, not the first one found.
    const series = makeKernelSeries([0, -0.2, 0.5, -0.5], [0, 0, 0, 0], [0, 1, 1, 1])
    const params = baseKernelParams({ leverage: 1, financingSpread: 0, expenseRatio: 0 })
    const outputs = makeOutputs(4)

    const result = runBacktest(params, series, outputs)

    expect(result.ruined).toBe(false)
    expect(outputs.outValue[1]).toBeCloseTo(8_000, 6)
    expect(outputs.outValue[2]).toBeCloseTo(12_000, 6)
    expect(outputs.outValue[3]).toBeCloseTo(6_000, 6)
    expect(result.maxDrawdown).toBeCloseTo(0.5, 12)
  })

  test('the real bundled SPX total-return series over the full strict tier at 3x yields a maxDrawdown strictly between 0 and 1', async () => {
    const bundle = await loadBundleFromDisk()
    const seriesEntry = bundle.manifest.series.find((s) => s.id === 'SPX/total-return')
    expect(seriesEntry).toBeDefined()
    expect(seriesEntry!.tiers.strict).not.toBeNull()

    const request: BacktestRequest = {
      symbol: 'SPX',
      dividendReinvest: true,
      leverage: 3,
      entryDate: seriesEntry!.tiers.strict!.firstDate,
      holdingPeriodBars: null,
      initialInvestment: 10_000,
      contributionAmount: 0,
      contributionFrequency: 'none',
      expenseRatioPercent: 0.9,
      financingSpreadPercent: 0.5,
    }
    const inputs = buildKernelInputs(bundle, request)
    const result = runBacktest(inputs.params, inputs.series, inputs.outputs)

    expect(result.maxDrawdown).toBeGreaterThan(0)
    expect(result.maxDrawdown).toBeLessThan(1)
  })
})
