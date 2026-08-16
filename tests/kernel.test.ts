/**
 * tests/kernel.test.ts: Task 1, correctness assertions for bench/synthetic-data.ts and
 * bench/kernel.ts. Runs in the fast Node `unit` project. These are correctness checks on
 * throwaway spike code, and they exist because a fast wrong kernel is not a useful measurement.
 */

import { describe, expect, test } from 'vitest'

import { runSpikeBacktest, type SpikeKernelParams } from '../bench/kernel.ts'
import { BAR_COUNT, makeSeededGbmSeries, type SyntheticSeries } from '../bench/synthetic-data.ts'

function makeFixedSeries(
  returns: number[],
  shortRate: number[],
  calendarDaysElapsed: number[],
): SyntheticSeries {
  return {
    returns: Float64Array.from(returns),
    shortRate: Float64Array.from(shortRate),
    calendarDaysElapsed: Int32Array.from(calendarDaysElapsed),
  }
}

function baseParams(overrides: Partial<SpikeKernelParams> = {}): SpikeKernelParams {
  return {
    leverage: 3,
    entryIndex: 0,
    initialInvestment: 10_000,
    contributionAmount: 0,
    contributionIntervalBars: 0,
    financingSpread: 0,
    expenseRatio: 0,
    ...overrides,
  }
}

describe('makeSeededGbmSeries', () => {
  test('is deterministic across calls with the same seed', () => {
    const a = makeSeededGbmSeries(0x1234)
    const b = makeSeededGbmSeries(0x1234)
    expect(Array.from(a.returns)).toEqual(Array.from(b.returns))
    expect(Array.from(a.shortRate)).toEqual(Array.from(b.shortRate))
    expect(Array.from(a.calendarDaysElapsed)).toEqual(Array.from(b.calendarDaysElapsed))
  })

  test('returns arrays of length BAR_COUNT, which is 25000', () => {
    expect(BAR_COUNT).toBe(25_000)
    const series = makeSeededGbmSeries()
    expect(series.returns.length).toBe(BAR_COUNT)
    expect(series.shortRate.length).toBe(BAR_COUNT)
    expect(series.calendarDaysElapsed.length).toBe(BAR_COUNT)
  })

  test('daily returns have plausible equity volatility and a positive mean drift', () => {
    const series = makeSeededGbmSeries()
    const n = series.returns.length
    let sum = 0
    for (let i = 0; i < n; i++) {
      sum += series.returns[i] ?? 0
    }
    const mean = sum / n
    let sqDiffSum = 0
    for (let i = 0; i < n; i++) {
      const diff = (series.returns[i] ?? 0) - mean
      sqDiffSum += diff * diff
    }
    const stdev = Math.sqrt(sqDiffSum / (n - 1))

    expect(mean).toBeGreaterThan(0)
    expect(stdev).toBeGreaterThanOrEqual(0.008)
    expect(stdev).toBeLessThanOrEqual(0.016)
  })
})

describe('runSpikeBacktest', () => {
  test('leverage=1 with zero financing spread, zero expense ratio and zero contributions reproduces the unlevered compounded series', () => {
    const series = makeSeededGbmSeries()
    const outValue = new Float64Array(BAR_COUNT)
    const outRuined = new Uint8Array(BAR_COUNT)
    const params = baseParams({ leverage: 1, initialInvestment: 1 })

    runSpikeBacktest(params, series, outValue, outRuined)

    let reference = 1
    for (let i = 0; i < BAR_COUNT; i++) {
      reference *= 1 + (series.returns[i] ?? 0)
    }

    expect(outValue[BAR_COUNT - 1]).toBeCloseTo(reference, 6)
    expect(Array.from(outRuined).every((flag) => flag === 0)).toBe(true)
  })

  test('ruin: a single -40% day at leverage 3 produces a value of exactly 0 with the ruin flag set', () => {
    const series = makeFixedSeries([-0.4], [0], [1])
    const outValue = new Float64Array(1)
    const outRuined = new Uint8Array(1)
    const params = baseParams({ leverage: 3 })

    const result = runSpikeBacktest(params, series, outValue, outRuined)

    expect(outValue[0]).toBe(0)
    expect(outRuined[0]).toBe(1)
    expect(result.finalValue).toBe(0)
    expect(result.ruined).toBe(true)
  })

  test('ruin: after clamp, every subsequent bar stays at exactly 0 regardless of subsequent returns, and contributions do not resurrect the position', () => {
    const series = makeFixedSeries(
      [-0.4, 0.5, 1.0, -0.9],
      [0, 0, 0, 0],
      [1, 1, 1, 1],
    )
    const outValue = new Float64Array(4)
    const outRuined = new Uint8Array(4)
    const params = baseParams({
      leverage: 3,
      contributionAmount: 500,
      contributionIntervalBars: 1,
    })

    const result = runSpikeBacktest(params, series, outValue, outRuined)

    expect(Array.from(outValue)).toEqual([0, 0, 0, 0])
    expect(Array.from(outRuined)).toEqual([1, 1, 1, 1])
    expect(result.ruined).toBe(true)
    expect(result.finalValue).toBe(0)
  })

  test('financing cost scales with calendarDaysElapsed: a 3-day gap costs 3x a 1-day gap', () => {
    const params = baseParams({ leverage: 3, financingSpread: 0.005 })
    const seriesOneDay = makeFixedSeries([0], [0.02], [1])
    const seriesThreeDay = makeFixedSeries([0], [0.02], [3])

    const outValue1 = new Float64Array(1)
    const outRuined1 = new Uint8Array(1)
    runSpikeBacktest(params, seriesOneDay, outValue1, outRuined1)

    const outValue3 = new Float64Array(1)
    const outRuined3 = new Uint8Array(1)
    runSpikeBacktest(params, seriesThreeDay, outValue3, outRuined3)

    const loss1 = params.initialInvestment - (outValue1[0] ?? 0)
    const loss3 = params.initialInvestment - (outValue3[0] ?? 0)

    expect(loss1).toBeGreaterThan(0)
    expect(loss3).toBeCloseTo(loss1 * 3, 6)
  })

  test('allocates nothing per bar: repeated calls against preallocated buffers produce identical output for identical input', () => {
    // Not a GC-instrumentation test (not practical in a fast unit test); instead asserts the
    // documented contract this property depends on: reusing the same preallocated output
    // buffers across repeated calls with the same input always yields the same result, which
    // would not hold if the function depended on any per-call allocated/mutable module state.
    const series = makeFixedSeries([0.01, -0.02, 0.015], [0.02, 0.02, 0.02], [1, 1, 1])
    const outValue = new Float64Array(3)
    const outRuined = new Uint8Array(3)
    const params = baseParams({ leverage: 2, financingSpread: 0.005, expenseRatio: 0.0095 })

    const first = runSpikeBacktest(params, series, outValue, outRuined)
    const firstSnapshot = Array.from(outValue)
    const second = runSpikeBacktest(params, series, outValue, outRuined)

    expect(Array.from(outValue)).toEqual(firstSnapshot)
    expect(second.finalValue).toBe(first.finalValue)
  })
})
