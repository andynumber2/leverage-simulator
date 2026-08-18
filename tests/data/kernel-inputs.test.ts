/**
 * tests/data/kernel-inputs.test.ts
 *
 * The end-to-end assertion for plan 03-01's tracer slice: load the real committed bundle, build
 * inputs for a real backtest, run the kernel against them, and assert the properties this plan's
 * <behavior> and <acceptance_criteria> require. Also ports the spike's 3-day-gap financing test
 * (tests/kernel.test.ts) onto the real kernel's actual/360 basis (D-01).
 */

import { describe, expect, test } from 'vitest'

import { runBacktest } from '../../src/kernel/backtest.ts'
import type { KernelOutputs, KernelParams, KernelSeries } from '../../src/kernel/backtest.types.ts'
import { buildKernelInputs, loadBundleFromDisk, type BacktestRequest, type LoadedBundle } from '../../src/data/kernel-inputs.ts'

function baseRequest(overrides: Partial<BacktestRequest> = {}): BacktestRequest {
  return {
    symbol: 'SPX',
    dividendReinvest: true,
    leverage: 3,
    entryDate: '1990-01-02',
    holdingPeriodBars: 2520,
    initialInvestment: 10_000,
    contributionAmount: 0,
    contributionFrequency: 'none',
    expenseRatioPercent: 0.9,
    financingSpreadPercent: 0.5,
    ...overrides,
  }
}

describe('buildKernelInputs + runBacktest (end-to-end tracer)', () => {
  test('runs a real SPX backtest with a cost-free entry bar and a fully non-negative value series', async () => {
    const bundle: LoadedBundle = await loadBundleFromDisk()
    const request = baseRequest()
    const inputs = buildKernelInputs(bundle, request)

    expect(inputs.window.barCount).toBe(request.holdingPeriodBars)

    const result = runBacktest(inputs.params, inputs.series, inputs.outputs)

    expect(inputs.outputs.outValue[0]).toBe(request.initialInvestment)
    expect(Number.isFinite(result.finalValue)).toBe(true)
    expect(result.finalValue).toBeGreaterThan(0)

    for (let i = 0; i < inputs.outputs.outValue.length; i++) {
      expect(inputs.outputs.outValue[i]).toBeGreaterThanOrEqual(0)
    }
  })

  test('percent-to-fraction conversion happens exactly once, in the data layer (D-09)', async () => {
    const bundle: LoadedBundle = await loadBundleFromDisk()
    const request = baseRequest({ expenseRatioPercent: 0.9, financingSpreadPercent: 0.5 })
    const inputs = buildKernelInputs(bundle, request)

    expect(inputs.params.expenseRatio).toBe(request.expenseRatioPercent / 100)
    expect(inputs.params.financingSpread).toBe(request.financingSpreadPercent / 100)
  })

  test('a second identical call into the same preallocated buffers reproduces the first call element for element (PERF-02 idempotency edge)', async () => {
    const bundle: LoadedBundle = await loadBundleFromDisk()
    const request = baseRequest({ holdingPeriodBars: 100 })
    const inputs = buildKernelInputs(bundle, request)

    const first = runBacktest(inputs.params, inputs.series, inputs.outputs)
    const firstSnapshot = Array.from(inputs.outputs.outValue)
    const second = runBacktest(inputs.params, inputs.series, inputs.outputs)

    expect(Array.from(inputs.outputs.outValue)).toEqual(firstSnapshot)
    expect(second.finalValue).toBe(first.finalValue)
    expect(second.ruined).toBe(first.ruined)
  })
})

describe('runBacktest financing (D-01, ported from tests/kernel.test.ts for the actual/360 basis)', () => {
  function makeFixedSeries(returns: number[], shortRate: number[], calendarDaysElapsed: number[]): KernelSeries {
    return {
      returns: Float64Array.from(returns),
      shortRate: Float64Array.from(shortRate),
      calendarDaysElapsed: Int32Array.from(calendarDaysElapsed),
      contributionFlags: new Uint8Array(returns.length),
    }
  }

  function baseParams(overrides: Partial<KernelParams> = {}): KernelParams {
    return {
      leverage: 3,
      initialInvestment: 10_000,
      contributionAmount: 0,
      financingSpread: 0,
      expenseRatio: 0,
      longGapMinDays: 6,
      ...overrides,
    }
  }

  function makeOutputs(length: number): KernelOutputs {
    return {
      outValue: new Float64Array(length),
      outRuined: new Uint8Array(length),
      outLongGap: new Uint8Array(length),
    }
  }

  test('financing cost scales with calendarDaysElapsed: a 3-day gap costs 3x a 1-day gap', () => {
    const params = baseParams({ leverage: 3, financingSpread: 0.005 })

    const seriesOneDay = makeFixedSeries([0, 0], [0, 0.02], [0, 1])
    const outputsOneDay = makeOutputs(2)
    runBacktest(params, seriesOneDay, outputsOneDay)

    const seriesThreeDay = makeFixedSeries([0, 0], [0, 0.02], [0, 3])
    const outputsThreeDay = makeOutputs(2)
    runBacktest(params, seriesThreeDay, outputsThreeDay)

    const loss1 = params.initialInvestment - (outputsOneDay.outValue[1] ?? 0)
    const loss3 = params.initialInvestment - (outputsThreeDay.outValue[1] ?? 0)

    expect(loss1).toBeGreaterThan(0)
    expect(loss3).toBeCloseTo(loss1 * 3, 6)
  })
})
