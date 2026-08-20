/**
 * tests/attribution/shapley.test.ts
 *
 * 05-01-PLAN.md Task 2: the D-01/D-03 Shapley decomposition over the eight counterfactual arms.
 * Fixed fixtures cover the leverage-1 boundary (financing structurally zero), the zero-cost case
 * (drag equals the whole gap) and the "financing off must zero the short-rate array too" case
 * (RESEARCH.md Code Example 1). Two `fast-check` property tests cover the reconciliation identity
 * and order-independence over arbitrary finite parameter combinations.
 */

import fc from 'fast-check'
import { expect, test } from 'vitest'

import { runBacktest } from '../../src/kernel/backtest.ts'
import {
  EXPENSE_DAY_COUNT_BASIS,
  FINANCING_DAY_COUNT_BASIS,
  LONG_GAP_FLAG_MIN_DAYS,
  type KernelOutputs,
  type KernelParams,
  type KernelResult,
  type KernelSeries,
} from '../../src/kernel/backtest.types.ts'
import type { KernelInputs } from '../../src/data/kernel-inputs.ts'
import { computeAttribution } from '../../src/validation/attribution.ts'

// --- Shared fixture-building helpers -----------------------------------------------------

function buildInputsAndResult(params: KernelParams, series: KernelSeries): { inputs: KernelInputs; actualResult: KernelResult } {
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
      contributionCount: 0,
      contributionNominalDates: [],
    },
  }
  return { inputs, actualResult }
}

function reconciliationTolerance(totalGap: number): number {
  return 1e-6 * Math.max(Math.abs(totalGap), 1)
}

// --- Fixed fixtures ------------------------------------------------------------------------

test('zero financing spread, zero short rate and zero expense ratio: financing and expense are exactly 0 and volatility drag equals the whole gap', () => {
  const barCount = 6
  const returns = Float64Array.from([0, 0.02, -0.01, 0.015, -0.03, 0.04])
  const shortRate = new Float64Array(barCount)
  const calendarDaysElapsed = Int32Array.from([0, 1, 1, 3, 1, 1])
  const contributionFlags = new Uint8Array(barCount)
  const params: KernelParams = {
    leverage: 3,
    initialInvestment: 10_000,
    contributionAmount: 0,
    financingSpread: 0,
    expenseRatio: 0,
    longGapMinDays: LONG_GAP_FLAG_MIN_DAYS,
  }
  const series: KernelSeries = { returns, shortRate, calendarDaysElapsed, contributionFlags }
  const { inputs, actualResult } = buildInputsAndResult(params, series)
  const attribution = computeAttribution(inputs, actualResult)

  expect(attribution.financingCost).toBe(0)
  expect(attribution.expenseRatio).toBe(0)
  expect(Math.abs(attribution.volatilityDrag - attribution.totalGap)).toBeLessThan(reconciliationTolerance(attribution.totalGap))
})

test('at leverage exactly 1, the financing component is exactly 0 regardless of the short-rate array', () => {
  const barCount = 5
  const returns = Float64Array.from([0, 0.01, -0.02, 0.03, -0.01])
  const shortRate = Float64Array.from([0.02, 0.03, 0.01, 0.04, 0.02])
  const calendarDaysElapsed = Int32Array.from([0, 1, 3, 1, 1])
  const contributionFlags = new Uint8Array(barCount)
  const params: KernelParams = {
    leverage: 1,
    initialInvestment: 10_000,
    contributionAmount: 0,
    financingSpread: 0.005,
    expenseRatio: 0.009,
    longGapMinDays: LONG_GAP_FLAG_MIN_DAYS,
  }
  const series: KernelSeries = { returns, shortRate, calendarDaysElapsed, contributionFlags }
  const { inputs, actualResult } = buildInputsAndResult(params, series)
  const attribution = computeAttribution(inputs, actualResult)

  expect(attribution.financingCost).toBe(0)
})

test('at leverage 1.01 with financingSpread 0 and a positive short rate on one bar, the financing component is strictly non-zero (proves financing-off zeroes the short-rate array, not only the spread)', () => {
  const barCount = 5
  const returns = Float64Array.from([0, 0.01, -0.01, 0.02, -0.005])
  const shortRate = Float64Array.from([0, 0.03, 0, 0, 0])
  const calendarDaysElapsed = Int32Array.from([0, 1, 1, 1, 1])
  const contributionFlags = new Uint8Array(barCount)
  const params: KernelParams = {
    leverage: 1.01,
    initialInvestment: 10_000,
    contributionAmount: 0,
    financingSpread: 0,
    expenseRatio: 0,
    longGapMinDays: LONG_GAP_FLAG_MIN_DAYS,
  }
  const series: KernelSeries = { returns, shortRate, calendarDaysElapsed, contributionFlags }
  const { inputs, actualResult } = buildInputsAndResult(params, series)
  const attribution = computeAttribution(inputs, actualResult)

  expect(attribution.financingCost).not.toBe(0)
})

test('a sustained uptrend produces a negative (gain) volatility-drag component, returned signed with no clamping', () => {
  const barCount = 40
  const returns = new Float64Array(barCount)
  const calendarDaysElapsed = new Int32Array(barCount)
  for (let i = 1; i < barCount; i++) {
    returns[i] = 0.01
    calendarDaysElapsed[i] = 1
  }
  const shortRate = new Float64Array(barCount)
  const contributionFlags = new Uint8Array(barCount)
  const params: KernelParams = {
    leverage: 3,
    initialInvestment: 10_000,
    contributionAmount: 0,
    financingSpread: 0,
    expenseRatio: 0,
    longGapMinDays: LONG_GAP_FLAG_MIN_DAYS,
  }
  const series: KernelSeries = { returns, shortRate, calendarDaysElapsed, contributionFlags }
  const { inputs, actualResult } = buildInputsAndResult(params, series)
  const attribution = computeAttribution(inputs, actualResult)

  expect(attribution.volatilityDrag).toBeLessThan(0)
})

test('a financing-off counterfactual (zero spread AND zero short-rate array) is deterministic, and differs from a run where only the spread is zeroed while the short rate stays live', () => {
  const barCount = 5
  const returns = Float64Array.from([0, 0.01, -0.02, 0.015, -0.005])
  const shortRate = Float64Array.from([0, 0.03, 0.02, 0.04, 0.01])
  const calendarDaysElapsed = Int32Array.from([0, 1, 1, 1, 1])
  const contributionFlags = new Uint8Array(barCount)
  const baseParams: KernelParams = {
    leverage: 2,
    initialInvestment: 10_000,
    contributionAmount: 0,
    financingSpread: 0,
    expenseRatio: 0,
    longGapMinDays: LONG_GAP_FLAG_MIN_DAYS,
  }

  const zeroedRateSeries: KernelSeries = { returns, shortRate: new Float64Array(barCount), calendarDaysElapsed, contributionFlags }
  const liveRateSeries: KernelSeries = { returns, shortRate, calendarDaysElapsed, contributionFlags }

  const outputsA: KernelOutputs = { outValue: new Float64Array(barCount), outRuined: new Uint8Array(barCount), outLongGap: new Uint8Array(barCount) }
  const outputsB: KernelOutputs = { outValue: new Float64Array(barCount), outRuined: new Uint8Array(barCount), outLongGap: new Uint8Array(barCount) }
  const outputsC: KernelOutputs = { outValue: new Float64Array(barCount), outRuined: new Uint8Array(barCount), outLongGap: new Uint8Array(barCount) }

  const trueFinancingOff = runBacktest(baseParams, zeroedRateSeries, outputsA).finalValue
  const trueFinancingOffAgain = runBacktest({ ...baseParams }, { ...zeroedRateSeries }, outputsB).finalValue
  const spreadOnlyZeroed = runBacktest(baseParams, liveRateSeries, outputsC).finalValue

  expect(trueFinancingOff).toBe(trueFinancingOffAgain)
  expect(trueFinancingOff).not.toBe(spreadOnlyZeroed)
})

// --- Property tests (arbitrary finite parameter combinations) ------------------------------

const BAR_COUNT = 5

interface RunFixtureInput {
  leverage: number
  financingSpread: number
  expenseRatio: number
  initialInvestment: number
  contributionAmount: number
  returns: number[]
  shortRate: number[]
  calendarGaps: number[]
  contributionFlagsRaw: boolean[]
}

const runFixtureArb: fc.Arbitrary<RunFixtureInput> = fc.record({
  leverage: fc.double({ min: 0.5, max: 8, noNaN: true }),
  financingSpread: fc.double({ min: 0, max: 0.02, noNaN: true }),
  expenseRatio: fc.double({ min: 0, max: 0.02, noNaN: true }),
  initialInvestment: fc.double({ min: 100, max: 100_000, noNaN: true }),
  contributionAmount: fc.double({ min: 0, max: 1000, noNaN: true }),
  returns: fc.array(fc.double({ min: -0.1, max: 0.1, noNaN: true }), { minLength: BAR_COUNT, maxLength: BAR_COUNT }),
  shortRate: fc.array(fc.double({ min: 0, max: 0.05, noNaN: true }), { minLength: BAR_COUNT, maxLength: BAR_COUNT }),
  calendarGaps: fc.array(fc.integer({ min: 1, max: 5 }), { minLength: BAR_COUNT, maxLength: BAR_COUNT }),
  contributionFlagsRaw: fc.array(fc.boolean(), { minLength: BAR_COUNT, maxLength: BAR_COUNT }),
})

function buildFixture(f: RunFixtureInput): { inputs: KernelInputs; actualResult: KernelResult } {
  const returns = Float64Array.from(f.returns)
  returns[0] = 0
  const shortRate = Float64Array.from(f.shortRate)
  const calendarDaysElapsed = Int32Array.from(f.calendarGaps)
  calendarDaysElapsed[0] = 0
  const contributionFlags = Uint8Array.from(f.contributionFlagsRaw.map((b) => (b ? 1 : 0)))
  contributionFlags[0] = 0

  const params: KernelParams = {
    leverage: f.leverage,
    initialInvestment: f.initialInvestment,
    contributionAmount: f.contributionAmount,
    financingSpread: f.financingSpread,
    expenseRatio: f.expenseRatio,
    longGapMinDays: LONG_GAP_FLAG_MIN_DAYS,
  }
  const series: KernelSeries = { returns, shortRate, calendarDaysElapsed, contributionFlags }
  return buildInputsAndResult(params, series)
}

test('property: the three components sum to totalGap within 1e-6 relative tolerance, for arbitrary finite parameter combinations', () => {
  fc.assert(
    fc.property(runFixtureArb, (f) => {
      const { inputs, actualResult } = buildFixture(f)
      const attribution = computeAttribution(inputs, actualResult)
      const sum = attribution.volatilityDrag + attribution.financingCost + attribution.expenseRatio
      expect(Math.abs(sum - attribution.totalGap)).toBeLessThan(reconciliationTolerance(attribution.totalGap))
    }),
    { numRuns: 200 },
  )
})

// --- Order-independence: closed-form Shapley vs. a full-permutation brute-force reference --

type Factor = 'compounding' | 'financing' | 'expense'
const ALL_FACTORS: readonly Factor[] = ['compounding', 'financing', 'expense']

function buildPrincipalOutstandingReference(inputs: KernelInputs): Float64Array {
  const { params, series } = inputs
  const barCount = series.returns.length
  const principal = new Float64Array(barCount)
  let running = params.initialInvestment
  for (let i = 0; i < barCount; i++) {
    if (series.contributionFlags[i] === 1) running += params.contributionAmount
    principal[i] = running
  }
  return principal
}

function computeNonCompoundingDeductionsReference(
  inputs: KernelInputs,
  principal: Float64Array,
): { financingDeduction: number; expenseDeduction: number } {
  const { params, series } = inputs
  const { shortRate, calendarDaysElapsed } = series
  const barCount = series.returns.length
  let financingDeduction = 0
  let expenseDeduction = 0
  for (let i = 1; i < barCount; i++) {
    const gap = calendarDaysElapsed[i] ?? 0
    const p = principal[i] as number
    financingDeduction += p * (params.leverage - 1) * ((shortRate[i] ?? 0) + params.financingSpread) * (gap / FINANCING_DAY_COUNT_BASIS)
    expenseDeduction += p * params.expenseRatio * (gap / EXPENSE_DAY_COUNT_BASIS)
  }
  return { financingDeduction, expenseDeduction }
}

function referenceValueFunction(
  inputs: KernelInputs,
  actualResult: KernelResult,
  naiveFinalValue: number,
  financingDeduction: number,
  expenseDeduction: number,
): (factors: readonly Factor[]) => number {
  return (factors) => {
    const compoundingOn = factors.includes('compounding')
    const financingOn = factors.includes('financing')
    const expenseOn = factors.includes('expense')
    if (compoundingOn) {
      if (financingOn && expenseOn) return actualResult.finalValue
      const { params, series } = inputs
      const barCount = series.returns.length
      const armParams: KernelParams = {
        ...params,
        financingSpread: financingOn ? params.financingSpread : 0,
        expenseRatio: expenseOn ? params.expenseRatio : 0,
      }
      const armSeries: KernelSeries = financingOn ? series : { ...series, shortRate: new Float64Array(barCount) }
      const outputs: KernelOutputs = {
        outValue: new Float64Array(barCount),
        outRuined: new Uint8Array(barCount),
        outLongGap: new Uint8Array(barCount),
      }
      return runBacktest(armParams, armSeries, outputs).finalValue
    }
    let value = naiveFinalValue
    if (financingOn) value -= financingDeduction
    if (expenseOn) value -= expenseDeduction
    return value
  }
}

function permutations<T>(arr: readonly T[]): T[][] {
  if (arr.length <= 1) return [[...arr]]
  const result: T[][] = []
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)]
    for (const perm of permutations(rest)) {
      result.push([arr[i] as T, ...perm])
    }
  }
  return result
}

function bruteForceShapley(v: (factors: readonly Factor[]) => number, factor: Factor): number {
  const perms = permutations(ALL_FACTORS)
  let total = 0
  for (const perm of perms) {
    const idx = perm.indexOf(factor)
    const before = perm.slice(0, idx)
    const after = perm.slice(0, idx + 1)
    total += v(after) - v(before)
  }
  return total / perms.length
}

test('property: the closed-form Shapley result equals a brute-force average over all 3! orderings, so no fixed internal enumeration order changes any component value', () => {
  fc.assert(
    fc.property(runFixtureArb, (f) => {
      const { inputs, actualResult } = buildFixture(f)
      const attribution = computeAttribution(inputs, actualResult)

      const principal = buildPrincipalOutstandingReference(inputs)
      const { financingDeduction, expenseDeduction } = computeNonCompoundingDeductionsReference(inputs, principal)
      const v = referenceValueFunction(inputs, actualResult, attribution.naiveFinalValue, financingDeduction, expenseDeduction)

      const bruteDrag = -bruteForceShapley(v, 'compounding')
      const bruteFinancing = -bruteForceShapley(v, 'financing')
      const bruteExpense = -bruteForceShapley(v, 'expense')

      const tolerance = reconciliationTolerance(attribution.totalGap)
      expect(Math.abs(bruteDrag - attribution.volatilityDrag)).toBeLessThan(tolerance)
      expect(Math.abs(bruteFinancing - attribution.financingCost)).toBeLessThan(tolerance)
      expect(Math.abs(bruteExpense - attribution.expenseRatio)).toBeLessThan(tolerance)
    }),
    { numRuns: 50 },
  )
})
