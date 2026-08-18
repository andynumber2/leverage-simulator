/**
 * tests/validation/tracking-error.test.ts
 *
 * Unit coverage of `src/validation/tracking-error.ts` against hand-computed references built in
 * this file, never against the compiled bundle (03-06-PLAN.md Task 1). The real UPRO/TQQQ
 * comparison lives in tests/validation/upro-tqqq-gate.test.ts.
 */

import { describe, expect, test } from 'vitest'

import {
  annualizedReturnDrift,
  annualizedTrackingError,
  computeTrackingError,
  type TrackingErrorWindow,
} from '../../src/validation/tracking-error.ts'

const CALENDAR_DAYS_PER_YEAR = 365.25

/** Builds a window spanning `barCount` bars starting at local index 0, with `firstDayNumber`
 * fixed at 0 and `lastDayNumber` chosen so the window spans exactly `years` of elapsed calendar
 * time (rounded to the nearest whole day, since `TrackingErrorWindow.lastDayNumber` is an
 * integer day count). */
function makeWindow(label: string, barCount: number, years: number): TrackingErrorWindow {
  return {
    label,
    firstBar: 0,
    lastBar: barCount - 1,
    firstDayNumber: 0,
    lastDayNumber: Math.round(years * CALENDAR_DAYS_PER_YEAR),
  }
}

/** Independent oracle for the sample (n - 1) standard deviation of an array, computed with the
 * same two-pass mean-then-deviation method the module under test claims to use, but written
 * separately here so this test does not merely assert the implementation agrees with itself. */
function sampleStdDev(values: readonly number[]): number {
  const n = values.length
  const mean = values.reduce((sum, v) => sum + v, 0) / n
  const sumSquaredDeviation = values.reduce((sum, v) => sum + (v - mean) * (v - mean), 0)
  return Math.sqrt(sumSquaredDeviation / (n - 1))
}

describe('computeTrackingError / annualizedTrackingError / annualizedReturnDrift', () => {
  test('two identical return series yield exactly 0 for both statistics', () => {
    const returns = Float64Array.from([0, 0.01, -0.02, 0.03, 0.005, -0.011])
    const values = Float64Array.from([100, 101, 98.98, 101.9494, 102.4592, 101.331])
    const window = makeWindow('identical series', returns.length, 5)

    const result = computeTrackingError(values, values, returns, returns, window)

    expect(result.annualizedTrackingError).toBe(0)
    expect(result.annualizedReturnDrift).toBe(0)
    expect(annualizedTrackingError(returns, returns, window)).toBe(0)
    expect(annualizedReturnDrift(values, values, window)).toBe(0)
  })

  test('a constant per-bar return difference yields 0 tracking error and a drift whose sign matches the difference', () => {
    const barCount = 253
    const referenceReturns = new Float64Array(barCount)
    const syntheticReturns = new Float64Array(barCount)
    const referenceValues = new Float64Array(barCount)
    const syntheticValues = new Float64Array(barCount)

    const perBarReturn = 0.0006
    const perBarDelta = 0.0002 // constant positive difference: synthetic always outperforms

    referenceValues[0] = 100
    syntheticValues[0] = 100
    for (let k = 1; k < barCount; k++) {
      referenceReturns[k] = perBarReturn
      syntheticReturns[k] = perBarReturn + perBarDelta
      referenceValues[k] = (referenceValues[k - 1] as number) * (1 + perBarReturn)
      syntheticValues[k] = (syntheticValues[k - 1] as number) * (1 + perBarReturn + perBarDelta)
    }

    // Bar 0's return is 0 for both series by construction (the cost-free entry-bar convention),
    // which is NOT part of the constant `perBarDelta` sequence -- so the window under test starts
    // at bar 1, where the per-bar difference really is constant across every remaining bar.
    const window: TrackingErrorWindow = {
      label: 'constant delta',
      firstBar: 1,
      lastBar: barCount - 1,
      firstDayNumber: 0,
      lastDayNumber: Math.round(1 * CALENDAR_DAYS_PER_YEAR),
    }
    const result = computeTrackingError(syntheticValues, referenceValues, syntheticReturns, referenceReturns, window)

    // The per-bar difference is exactly `perBarDelta` for every bar in [1, barCount) -- constant,
    // so its sample standard deviation is 0.
    expect(result.annualizedTrackingError).toBeCloseTo(0, 12)
    expect(result.annualizedReturnDrift).toBeGreaterThan(0)
    expect(Math.sign(result.annualizedReturnDrift)).toBe(Math.sign(perBarDelta))

    // The mirror case: a negative constant delta produces a negative-signed drift.
    const negatedSyntheticReturns = new Float64Array(barCount)
    const negatedSyntheticValues = new Float64Array(barCount)
    negatedSyntheticValues[0] = 100
    for (let k = 1; k < barCount; k++) {
      negatedSyntheticReturns[k] = perBarReturn - perBarDelta
      negatedSyntheticValues[k] = (negatedSyntheticValues[k - 1] as number) * (1 + perBarReturn - perBarDelta)
    }
    const negatedResult = computeTrackingError(
      negatedSyntheticValues,
      referenceValues,
      negatedSyntheticReturns,
      referenceReturns,
      window,
    )
    expect(negatedResult.annualizedTrackingError).toBeCloseTo(0, 12)
    expect(negatedResult.annualizedReturnDrift).toBeLessThan(0)
  })

  test('the s * sqrt(252) identity holds to within 1e-12 relative, pinning the n-1 denominator', () => {
    // A deliberately asymmetric (nonzero-mean) set of per-bar differences, so this test does not
    // rely on symmetry to cancel out a wrong-denominator or wrong-pass-order bug.
    const diffs = [0.011, -0.004, 0.022, -0.013, 0.031, -0.028, 0.017, -0.006, 0.024, -0.019, 0.013]
    const barCount = diffs.length
    const expectedStdDev = sampleStdDev(diffs)
    const expectedAnnualized = expectedStdDev * Math.sqrt(252)

    const referenceReturns = new Float64Array(barCount)
    const syntheticReturns = new Float64Array(barCount)
    for (let k = 0; k < barCount; k++) {
      referenceReturns[k] = 0.0003 * k // arbitrary nonzero base, irrelevant to the difference
      syntheticReturns[k] = (referenceReturns[k] as number) + (diffs[k] as number)
    }
    const values = new Float64Array(barCount).fill(100) // unused by annualizedTrackingError directly

    const window = makeWindow('known stdev', barCount, 2)
    const measured = annualizedTrackingError(syntheticReturns, referenceReturns, window)

    const relativeError = Math.abs(measured - expectedAnnualized) / expectedAnnualized
    expect(relativeError).toBeLessThan(1e-12)

    // Sanity check that this identity would NOT hold under an n (not n-1) denominator, so this
    // assertion is actually pinning the sample convention rather than a coincidence of scale.
    const populationStdDev = Math.sqrt(
      diffs.reduce((sum, v) => sum + (v - diffs.reduce((s, x) => s + x, 0) / barCount) ** 2, 0) / barCount,
    )
    const populationAnnualized = populationStdDev * Math.sqrt(252)
    expect(Math.abs(measured - populationAnnualized) / populationAnnualized).toBeGreaterThan(1e-6)

    void values
  })

  test('a 1-bar window throws an error naming the window label and its bar count', () => {
    const returns = Float64Array.from([0])
    const values = Float64Array.from([100])
    const window: TrackingErrorWindow = {
      label: 'too-short-window',
      firstBar: 0,
      lastBar: 0,
      firstDayNumber: 0,
      lastDayNumber: 1,
    }

    expect(() => annualizedTrackingError(returns, returns, window)).toThrowError(/too-short-window/)
    expect(() => annualizedTrackingError(returns, returns, window)).toThrowError(/\b1\b/)
    expect(() => annualizedReturnDrift(values, values, window)).toThrowError(/too-short-window/)
    expect(() => computeTrackingError(values, values, returns, returns, window)).toThrowError(/too-short-window/)
  })

  test('unequal input lengths throw an error containing both lengths', () => {
    const shortArr = Float64Array.from([0, 0.01])
    const longArr = Float64Array.from([0, 0.01, 0.02])
    const window = makeWindow('mismatched lengths', 2, 1)

    expect(() => annualizedTrackingError(shortArr, longArr, window)).toThrowError(/\b2\b.*\b3\b|\b3\b.*\b2\b/)
    expect(() => annualizedReturnDrift(shortArr, longArr, window)).toThrowError(/\b2\b.*\b3\b|\b3\b.*\b2\b/)
    expect(() => computeTrackingError(shortArr, longArr, shortArr, shortArr, window)).toThrowError(
      /\b2\b.*\b3\b|\b3\b.*\b2\b/,
    )
  })

  test('a non-finite value inside the window throws rather than propagating NaN or Infinity', () => {
    const returns = Float64Array.from([0, 0.01, NaN, 0.02])
    const reference = Float64Array.from([0, 0.01, 0.02, 0.02])
    const window = makeWindow('non-finite value', 4, 1)

    expect(() => annualizedTrackingError(returns, reference, window)).toThrowError(/index 2/)

    const values = Float64Array.from([100, 101, Infinity, 103])
    const refValues = Float64Array.from([100, 101, 102, 103])
    expect(() => annualizedReturnDrift(values, refValues, window)).toThrowError(/index 2/)
  })

  test("years is computed from the window's firstDayNumber/lastDayNumber divided by 365.25, not from the bar count", () => {
    // 253 trading bars (roughly a calendar year in a real trading calendar) but a window spanning
    // exactly 730.5 calendar days (2 years) -- if `years` were derived from the bar count instead
    // of the calendar-day span, this test's expected annualized figures would not match.
    const barCount = 253
    const values = new Float64Array(barCount)
    const returns = new Float64Array(barCount)
    values[0] = 100
    for (let k = 1; k < barCount; k++) {
      returns[k] = 0.001
      values[k] = (values[k - 1] as number) * 1.001
    }

    const window: TrackingErrorWindow = {
      label: 'two-year span, one trading year of bars',
      firstBar: 0,
      lastBar: barCount - 1,
      firstDayNumber: 0,
      lastDayNumber: 731, // ~2 calendar years
    }

    const result = computeTrackingError(values, values, returns, returns, window)
    const expectedYears = 731 / 365.25
    expect(result.years).toBeCloseTo(expectedYears, 12)

    const expectedTotalReturn = (values[barCount - 1] as number) / (values[0] as number)
    const expectedAnnualizedReturn = Math.pow(expectedTotalReturn, 1 / expectedYears) - 1
    expect(result.syntheticAnnualizedReturn).toBeCloseTo(expectedAnnualizedReturn, 12)
  })
})
