/**
 * tests/app/naive-ghost-series.test.ts
 *
 * 05-02-PLAN.md Task 1: unit coverage of `buildNaiveGhostData`'s null-gap construction, run in the
 * Node `unit` vitest project (this file lands there automatically -- that project includes
 * `tests/**\/*.test.ts` and excludes only `tests/app/**\/*.browser.test.ts`).
 *
 * The recovery-case fixture (test 3) is shaped like the historical drawdown windows
 * 05-RESEARCH.md's Pitfall 1 names (1929-1932, 2000-2002, 2008-2009: a drawdown deeper than
 * `1/leverage` followed by a recovery) but is a synthetic return array, not a bundle load.
 */

import { expect, test } from 'vitest'

import { runBacktest } from '../../src/kernel/backtest.ts'
import { LONG_GAP_FLAG_MIN_DAYS, type KernelOutputs, type KernelParams, type KernelResult, type KernelSeries } from '../../src/kernel/backtest.types.ts'
import type { KernelInputs } from '../../src/data/kernel-inputs.ts'
import { computeAttribution } from '../../src/validation/attribution.ts'
import { buildNaiveGhostData } from '../../src/app/components/ResultColumn/naive-series.ts'

function buildInputsAndResult(
  params: KernelParams,
  series: KernelSeries,
  contributionCount = 0,
): { inputs: KernelInputs; actualResult: KernelResult } {
  const barCount = series.returns.length
  const outputs: KernelOutputs = {
    outValue: new Float64Array(barCount),
    outRuined: new Uint8Array(barCount),
    outLongGap: new Uint8Array(barCount),
  }
  const actualResult = runBacktest(params, series, outputs)
  const inputs: KernelInputs = {
    params,
    series,
    outputs,
    window: { entryIndex: 0, barCount, firstDate: '2000-01-01', lastDate: '2000-01-01' },
    meta: {
      seriesId: 'TEST/total-return',
      bundleVersion: 'test',
      truncatedForRateCoverage: false,
      contributionCount,
      contributionNominalDates: [],
    },
  }
  return { inputs, actualResult }
}

const BASE_PARAMS: Omit<KernelParams, 'leverage' | 'contributionAmount'> = {
  initialInvestment: 10_000,
  financingSpread: 0,
  expenseRatio: 0,
  longGapMinDays: LONG_GAP_FLAG_MIN_DAYS,
}

test('buildNaiveGhostData: every bar is finite and positive, with no null, for a monotonically rising return series', () => {
  const barCount = 8
  const returns = new Float64Array(barCount)
  for (let i = 1; i < barCount; i++) returns[i] = 0.01
  const shortRate = new Float64Array(barCount)
  const calendarDaysElapsed = new Int32Array(barCount)
  const contributionFlags = new Uint8Array(barCount)
  const params: KernelParams = { ...BASE_PARAMS, leverage: 2, contributionAmount: 0 }
  const series: KernelSeries = { returns, shortRate, calendarDaysElapsed, contributionFlags }
  const { inputs } = buildInputsAndResult(params, series)

  const data = buildNaiveGhostData(inputs, barCount)

  expect(data.length).toBe(barCount)
  for (const value of data) {
    expect(value).not.toBeNull()
    expect(Number.isFinite(value as number)).toBe(true)
    expect(value as number).toBeGreaterThan(0)
  }
})

test('buildNaiveGhostData: null appears at and after the bar where the naive value first goes non-positive, with earlier bars staying numeric', () => {
  const barCount = 5
  // leverage 3: bar 1's cumulative index return (-0.2) keeps the naive value positive
  // (10000 * (1 + 3*-0.2) = 4000); bar 2 onward crosses below -1/3 and stays there, never
  // recovering in this fixture (the recovery case is covered separately below).
  const returns = Float64Array.from([0, -0.2, -0.2, -0.1, -0.05])
  const shortRate = new Float64Array(barCount)
  const calendarDaysElapsed = new Int32Array(barCount)
  const contributionFlags = new Uint8Array(barCount)
  const params: KernelParams = { ...BASE_PARAMS, leverage: 3, contributionAmount: 0 }
  const series: KernelSeries = { returns, shortRate, calendarDaysElapsed, contributionFlags }
  const { inputs } = buildInputsAndResult(params, series)

  const data = buildNaiveGhostData(inputs, barCount)

  expect(data.length).toBe(barCount)
  expect(data[0]).not.toBeNull()
  expect(data[1]).not.toBeNull()
  expect(data[2]).toBeNull()
  expect(data[3]).toBeNull()
  expect(data[4]).toBeNull()
})

test('buildNaiveGhostData: a window that dips below the non-positive threshold and later recovers renders numeric, then null, then numeric again -- never truncated', () => {
  const barCount = 10
  const returns = Float64Array.from([0, -0.3, -0.3, -0.02, -0.02, 0.1, 0.2, 0.15, 0.1, 0.5])
  const shortRate = new Float64Array(barCount)
  const calendarDaysElapsed = new Int32Array(barCount)
  const contributionFlags = new Uint8Array(barCount)
  const params: KernelParams = { ...BASE_PARAMS, leverage: 3, contributionAmount: 0 }
  const series: KernelSeries = { returns, shortRate, calendarDaysElapsed, contributionFlags }
  const { inputs } = buildInputsAndResult(params, series)

  const data = buildNaiveGhostData(inputs, barCount)

  // Never truncated: the returned array always has exactly the requested plotted bar count.
  expect(data.length).toBe(barCount)

  const nullIndices = data.reduce<number[]>((acc, value, i) => {
    if (value === null) acc.push(i)
    return acc
  }, [])
  expect(nullIndices.length, 'expected this drawdown/recovery fixture to produce at least one null bar').toBeGreaterThan(0)

  const lastNullIndex = nullIndices[nullIndices.length - 1] as number
  expect(lastNullIndex, 'expected the recovery to happen before the last plotted bar').toBeLessThan(barCount - 1)

  // Numeric before the drawdown.
  expect(data[0]).not.toBeNull()
  expect(Number.isFinite(data[0] as number)).toBe(true)

  // Numeric again at an index strictly greater than the last null index -- the recovery segment.
  const recoveredValue = data[lastNullIndex + 1]
  expect(recoveredValue, 'expected a numeric value immediately after the last null bar').not.toBeNull()
  expect(Number.isFinite(recoveredValue as number)).toBe(true)
  expect(recoveredValue as number).toBeGreaterThan(0)
})

test("buildNaiveGhostData's final-bar value agrees with computeAttribution's naiveFinalValue within 1e-9 relative tolerance, zero-contribution case", () => {
  const barCount = 12
  const returns = new Float64Array(barCount)
  const shortRate = new Float64Array(barCount)
  const calendarDaysElapsed = new Int32Array(barCount)
  const contributionFlags = new Uint8Array(barCount)
  for (let i = 1; i < barCount; i++) {
    returns[i] = i % 2 === 0 ? 0.015 : -0.01
    calendarDaysElapsed[i] = 1
  }
  const params: KernelParams = { ...BASE_PARAMS, leverage: 3, contributionAmount: 0 }
  const series: KernelSeries = { returns, shortRate, calendarDaysElapsed, contributionFlags }
  const { inputs, actualResult } = buildInputsAndResult(params, series)

  const data = buildNaiveGhostData(inputs, barCount)
  const attribution = computeAttribution(inputs, actualResult)

  const finalGhostValue = data[barCount - 1]
  expect(finalGhostValue).not.toBeNull()
  const relativeError = Math.abs((finalGhostValue as number) - attribution.naiveFinalValue) / Math.max(Math.abs(attribution.naiveFinalValue), 1)
  expect(relativeError).toBeLessThan(1e-9)
})

test("buildNaiveGhostData's final-bar value agrees with computeAttribution's naiveFinalValue within 1e-9 relative tolerance, contribution-bearing case", () => {
  const barCount = 12
  const returns = new Float64Array(barCount)
  const shortRate = new Float64Array(barCount)
  const calendarDaysElapsed = new Int32Array(barCount)
  const contributionFlags = new Uint8Array(barCount)
  for (let i = 1; i < barCount; i++) {
    returns[i] = i % 2 === 0 ? 0.015 : -0.01
    calendarDaysElapsed[i] = 1
    if (i % 3 === 0) contributionFlags[i] = 1
  }
  const params: KernelParams = { ...BASE_PARAMS, leverage: 3, contributionAmount: 500 }
  const series: KernelSeries = { returns, shortRate, calendarDaysElapsed, contributionFlags }
  const { inputs, actualResult } = buildInputsAndResult(params, series, 3)

  const data = buildNaiveGhostData(inputs, barCount)
  const attribution = computeAttribution(inputs, actualResult)

  const finalGhostValue = data[barCount - 1]
  expect(finalGhostValue).not.toBeNull()
  const relativeError = Math.abs((finalGhostValue as number) - attribution.naiveFinalValue) / Math.max(Math.abs(attribution.naiveFinalValue), 1)
  expect(relativeError).toBeLessThan(1e-9)
})

test('buildNaiveGhostData: a zero plotted bar count returns a zero-length array without throwing', () => {
  const barCount = 6
  const returns = new Float64Array(barCount)
  const shortRate = new Float64Array(barCount)
  const calendarDaysElapsed = new Int32Array(barCount)
  const contributionFlags = new Uint8Array(barCount)
  const params: KernelParams = { ...BASE_PARAMS, leverage: 3, contributionAmount: 0 }
  const series: KernelSeries = { returns, shortRate, calendarDaysElapsed, contributionFlags }
  const { inputs } = buildInputsAndResult(params, series)

  expect(() => buildNaiveGhostData(inputs, 0)).not.toThrow()
  expect(buildNaiveGhostData(inputs, 0)).toEqual([])
})
