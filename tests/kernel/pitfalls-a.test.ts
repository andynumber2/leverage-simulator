/**
 * tests/kernel/pitfalls-a.test.ts
 *
 * PITFALLS.md section A as executable correctness checks (SIM-12), covering A1, A2, A4, A8, A10
 * and A11, plus D-03, D-05, D-07 and D-08 (03-02-PLAN.md Task 1). Every assertion here is
 * behavioral, against `runBacktest`'s outputs -- none asserts on comment text or source strings.
 * A3, A5, A6, A7, A9 and A12 are covered in tests/kernel/ruin.test.ts, either as tests (A7) or as
 * the asserted disposition table (A3, A5, A6, A9, A12).
 */

import fc from 'fast-check'
import { describe, expect, test } from 'vitest'

import { seriesView } from '../../tools/bundle-compiler/src/binary-format.ts'
import { buildKernelInputs, type BacktestRequest } from '../../src/data/kernel-inputs.ts'
import { loadBundleFromDisk } from '../../src/data/load-bundle-node.ts'
import { runBacktest } from '../../src/kernel/backtest.ts'
import { EXPENSE_DAY_COUNT_BASIS } from '../../src/kernel/backtest.types.ts'
import { baseKernelParams, makeKernelSeries, makeOutputs } from './fixtures.ts'

describe('PITFALLS A1: leverage applied to the daily return, never the cumulative period return', () => {
  test('a symmetric up-then-down window shows the leveraged run losing more than the naive L*totalReturn formula predicts (volatility drag)', () => {
    // bar0 is the cost-free entry anchor; bar1 is +20%, bar2 is -20%.
    const series = makeKernelSeries([0, 0.2, -0.2], [0, 0, 0], [0, 1, 1])
    const params = baseKernelParams({ leverage: 3, financingSpread: 0, expenseRatio: 0 })
    const outputs = makeOutputs(3)

    const result = runBacktest(params, series, outputs)

    // The unlevered (1x) total period return over the same window, computed independently of
    // the kernel -- the naive, PROJECT.md-named-explicitly error multiplies this single scalar
    // by leverage instead of compounding leverage day by day.
    const totalPeriodReturn = (1 + 0.2) * (1 - 0.2) - 1
    const naiveFinal = params.initialInvestment * (1 + params.leverage * totalPeriodReturn)

    expect(result.finalValue).toBeLessThan(naiveFinal)
    // Actual leveraged path: 10000 * (1 + 3*0.2) * (1 + 3*-0.2) = 10000 * 1.6 * 0.4 = 6400.
    expect(result.finalValue).toBeCloseTo(6400, 6)
    // Naive period-return formula: 10000 * (1 + 3 * -0.04) = 8800.
    expect(naiveFinal).toBeCloseTo(8800, 6)
  })
})

describe('PITFALLS A2: financing cost accrues on the borrowed (leverage - 1) portion, not the whole position', () => {
  test('a nonzero short rate strictly lowers the leveraged value versus the same run with the rate set to 0', () => {
    const seriesWithRate = makeKernelSeries([0, 0], [0, 0.05], [0, 1])
    const seriesNoRate = makeKernelSeries([0, 0], [0, 0], [0, 1])
    const params = baseKernelParams({ leverage: 3, financingSpread: 0, expenseRatio: 0 })

    const withRate = runBacktest(params, seriesWithRate, makeOutputs(2))
    const noRate = runBacktest(params, seriesNoRate, makeOutputs(2))

    expect(withRate.finalValue).toBeLessThan(noRate.finalValue)
  })

  test('the financing gap between a rated and an unrated run scales linearly with (leverage - 1)', () => {
    function financingGap(leverage: number): number {
      const seriesWithRate = makeKernelSeries([0, 0], [0, 0.05], [0, 1])
      const seriesNoRate = makeKernelSeries([0, 0], [0, 0], [0, 1])
      const params = baseKernelParams({ leverage, financingSpread: 0, expenseRatio: 0 })

      const withRate = runBacktest(params, seriesWithRate, makeOutputs(2))
      const noRate = runBacktest(params, seriesNoRate, makeOutputs(2))
      return noRate.finalValue - withRate.finalValue
    }

    const gapAtLeverage2 = financingGap(2)
    const gapAtLeverage5 = financingGap(5)

    // (5 - 1) / (2 - 1) = 4.
    expect(gapAtLeverage5 / gapAtLeverage2).toBeCloseTo(4, 9)
  })
})

/**
 * Splits a 365-calendar-day year across `tradingBars` bars (after the cost-free anchor bar) as
 * evenly as integers allow -- `remainder` bars carry one extra day, the rest carry the floor.
 * This minimizes the compounding's own convexity term (see the A4 tolerance comment below)
 * relative to any lumpier split of the same 365-day total, so it is the fairest possible
 * comparison between a 249-bar and a 252-bar year.
 */
function makeSyntheticYear(tradingBars: number): { returns: number[]; shortRate: number[]; calendarDaysElapsed: number[] } {
  const base = Math.floor(365 / tradingBars)
  const remainder = 365 - base * tradingBars
  const returns = [0]
  const shortRate = [0]
  const calendarDaysElapsed = [0]
  for (let i = 0; i < tradingBars; i++) {
    returns.push(0)
    shortRate.push(0)
    calendarDaysElapsed.push(i < remainder ? base + 1 : base)
  }
  return { returns, shortRate, calendarDaysElapsed }
}

describe('PITFALLS A4: the expense ratio accrues on a calendar-day basis, invariant to trading-bar count', () => {
  test('a 249-bar year and a 252-bar year, both with calendarDaysElapsed summing to 365, charge nearly identical total expense drag, both tracking the theoretical daily-compounded annual figure', () => {
    const expenseRatio = 0.009 // 0.90%, an ordinary product-scale figure.
    const yearA = makeSyntheticYear(249)
    const yearB = makeSyntheticYear(252)

    const paramsA = baseKernelParams({ leverage: 3, financingSpread: 0, expenseRatio })
    const paramsB = baseKernelParams({ leverage: 3, financingSpread: 0, expenseRatio })

    const seriesA = makeKernelSeries(yearA.returns, yearA.shortRate, yearA.calendarDaysElapsed)
    const seriesB = makeKernelSeries(yearB.returns, yearB.shortRate, yearB.calendarDaysElapsed)

    const resultA = runBacktest(paramsA, seriesA, makeOutputs(seriesA.returns.length))
    const resultB = runBacktest(paramsB, seriesB, makeOutputs(seriesB.returns.length))

    const dragA = 1 - resultA.finalValue / paramsA.initialInvestment
    const dragB = 1 - resultB.finalValue / paramsB.initialInvestment

    // Reference: a hypothetical 365-bar year of exactly 1 calendar day per bar, compounded
    // the same way the kernel compounds every other bar.
    const referenceDrag = 1 - Math.pow(1 - expenseRatio / EXPENSE_DAY_COUNT_BASIS, 365)

    // A 249-bar year and a 252-bar year both compound the SAME 365 total calendar days, but
    // into a DIFFERENT number of discrete multiplicative steps, so they cannot match the
    // 365-step reference (or each other) bit-for-bit: compounding fewer, larger steps versus
    // more, smaller steps over the same total is a genuine second-order (convexity) effect of
    // size O(expenseRatio^2), not a bug -- deriving it analytically for expenseRatio=0.009
    // puts it on the order of 1e-6 relative to the annual drag. That is roughly four orders of
    // magnitude below the ~0.3-0.5%/year signature PITFALLS A4 itself names for a real
    // day-count bug (a flat /252 divisor instead of the calendar-day basis), so 1e-4 relative
    // is a tolerance that cannot pass a real structural bug while comfortably clearing the
    // expected convexity noise. (An earlier, tighter figure of 1e-12 relative was considered
    // and rejected: it sits below what any genuinely different bar-count partition of the same
    // 365 days can achieve, for the same reason D-06's 1e-12 figure was withdrawn as sitting
    // below its own accumulation floor.)
    const A4_TOLERANCE = 1e-4

    expect(
      Math.abs(dragA - referenceDrag) / referenceDrag,
      `249-bar year: dragA=${dragA} referenceDrag=${referenceDrag}`,
    ).toBeLessThan(A4_TOLERANCE)
    expect(
      Math.abs(dragB - referenceDrag) / referenceDrag,
      `252-bar year: dragB=${dragB} referenceDrag=${referenceDrag}`,
    ).toBeLessThan(A4_TOLERANCE)
    expect(
      Math.abs(dragA - dragB) / referenceDrag,
      `249-bar vs 252-bar: dragA=${dragA} dragB=${dragB}`,
    ).toBeLessThan(A4_TOLERANCE)
  })
})

describe('PITFALLS A8: financing accrues on calendar days elapsed, not a flat per-trading-day fraction', () => {
  test('a 3-calendar-day gap costs exactly 3x a 1-calendar-day gap, and a 12-day gap costs exactly 12x', () => {
    const params = baseKernelParams({ leverage: 3, financingSpread: 0.005, expenseRatio: 0 })

    function financingLoss(gapDays: number): number {
      const series = makeKernelSeries([0, 0], [0, 0.02], [0, gapDays])
      const result = runBacktest(params, series, makeOutputs(2))
      return params.initialInvestment - result.finalValue
    }

    const loss1 = financingLoss(1)
    const loss3 = financingLoss(3)
    const loss12 = financingLoss(12) // F-03: the 1933 bank holiday's actual gap size.

    expect(loss1).toBeGreaterThan(0)
    expect(loss3).toBeCloseTo(loss1 * 3, 9)
    expect(loss12).toBeCloseTo(loss1 * 12, 9)
  })
})

function baseRealBundleRequest(bundleFirstDate: string): BacktestRequest {
  return {
    symbol: 'SPX',
    dividendReinvest: false,
    leverage: 1,
    entryDate: bundleFirstDate,
    holdingPeriodBars: null,
    initialInvestment: 10_000,
    contributionAmount: 0,
    contributionFrequency: 'none',
    expenseRatioPercent: 0,
    financingSpreadPercent: 0,
  }
}

describe('PITFALLS A10 / SIM-04: 1x reproduces the unlevered bundled series exactly (D-06, D-07)', () => {
  /**
   * D-06: SIM-04's "exactly" is enforced as a maximum relative deviation of 1e-9 from the raw
   * bundled series across all bars. Bit-for-bit equality is unreachable over 24,773 bars:
   * per-step reproduction is exact (Sterbenz: 1 + (x-1) === x for 0.5 <= x <= 2, which every
   * daily return satisfies), but the running product drifts from a direct P[t]/P[0] by roughly
   * n*eps, about 5e-12 relative -- the accumulation floor. 1e-9 sits about 200x above that
   * floor and about 800x below the smallest possible real modelling error (one day of a 0.03%
   * fee leaking in is about 8e-7 relative), so it cannot false-fail on correct arithmetic and
   * cannot pass a genuine modelling error. (An earlier proposal of 1e-12 was withdrawn during
   * discussion because it sits below the accumulation floor.)
   */
  const SIM_04_MAX_RELATIVE_DEVIATION = 1e-9

  test('leverage 1, expense ratio 0, financing spread 0 reproduces the direct compounded return series within 1e-9 relative deviation on every bar', async () => {
    const bundle = await loadBundleFromDisk()
    const request = baseRealBundleRequest(bundle.manifest.calendar.firstDate)
    const inputs = buildKernelInputs(bundle, request)
    const result = runBacktest(inputs.params, inputs.series, inputs.outputs)

    // D-07: 1x means the bare index -- ER defaults to 0, no product wrapper, no fee -- which is
    // exactly what makes this comparison to a directly compounded return series meaningful.
    expect(inputs.params.expenseRatio).toBe(0)
    expect(inputs.params.financingSpread).toBe(0)

    const barCount = inputs.window.barCount
    const reference = new Float64Array(barCount)
    reference[0] = inputs.params.initialInvestment
    for (let k = 1; k < barCount; k++) {
      reference[k] = (reference[k - 1] ?? 0) * (1 + (inputs.series.returns[k] ?? 0))
    }

    let maxRelativeDeviation = 0
    for (let k = 0; k < barCount; k++) {
      const actual = inputs.outputs.outValue[k] ?? 0
      const ref = reference[k] ?? 0
      const relativeDeviation = ref === 0 ? Math.abs(actual - ref) : Math.abs(actual - ref) / Math.abs(ref)
      if (relativeDeviation > maxRelativeDeviation) maxRelativeDeviation = relativeDeviation
    }

    expect(
      maxRelativeDeviation,
      `measured maximum relative deviation ${maxRelativeDeviation} against a direct compounded reference over ${barCount} bars`,
    ).toBeLessThanOrEqual(SIM_04_MAX_RELATIVE_DEVIATION)
    expect(result.ruined).toBe(false)
  })
})

describe('PITFALLS A11: the same 1x run tracks a direct level[last] / level[first] ratio within the same bound', () => {
  test('outValue at the last bar divided by initialInvestment matches the raw price level ratio within 1e-9 relative deviation', async () => {
    const bundle = await loadBundleFromDisk()
    const seriesId = 'SPX/price-return'
    const request = baseRealBundleRequest(bundle.manifest.calendar.firstDate)
    const inputs = buildKernelInputs(bundle, request)
    runBacktest(inputs.params, inputs.series, inputs.outputs)

    const manifestEntry = bundle.manifest.series.find((s) => s.id === seriesId)
    if (manifestEntry === undefined) throw new Error(`test fixture: no manifest series "${seriesId}"`)
    const asset = bundle.assets.get(manifestEntry.asset)
    if (asset === undefined) throw new Error(`test fixture: asset "${manifestEntry.asset}" was not loaded`)
    const descriptor = asset.header.descriptors.find((d) => d.id === seriesId)
    if (descriptor === undefined) throw new Error(`test fixture: no descriptor "${seriesId}" in the decoded header`)
    const priceLevels = seriesView(asset.buffer, asset.header, descriptor)

    const firstPriceIndex = inputs.window.entryIndex - descriptor.calendarStartIndex
    const lastPriceIndex = firstPriceIndex + inputs.window.barCount - 1
    const levelFirst = priceLevels[firstPriceIndex] ?? 0
    const levelLast = priceLevels[lastPriceIndex] ?? 0
    const referenceRatio = levelLast / levelFirst

    const actualRatio = (inputs.outputs.outValue[inputs.window.barCount - 1] ?? 0) / inputs.params.initialInvestment
    const relativeDeviation = Math.abs(actualRatio - referenceRatio) / Math.abs(referenceRatio)

    expect(relativeDeviation, `actualRatio=${actualRatio} referenceRatio=${referenceRatio}`).toBeLessThanOrEqual(1e-9)
  })
})

describe('D-03: the entry bar is a cost-free anchor', () => {
  test('outValue[0] equals initialInvestment bit-for-bit across a range of parameter combinations', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 20, noNaN: true }),
        fc.double({ min: 0, max: 0.05, noNaN: true }),
        fc.double({ min: 0, max: 0.05, noNaN: true }),
        fc.double({ min: 1, max: 1_000_000, noNaN: true }),
        (leverage, financingSpread, expenseRatio, initialInvestment) => {
          const series = makeKernelSeries([0, 0.05, -0.1], [0, 0.03, 0.03], [0, 1, 3])
          const params = baseKernelParams({ leverage, financingSpread, expenseRatio, initialInvestment })
          const outputs = makeOutputs(3)
          runBacktest(params, series, outputs)
          return outputs.outValue[0] === initialInvestment
        },
      ),
      { numRuns: 200 },
    )
  })
})

describe('D-05: value is a continuous function of leverage -- no special case at leverage === 1', () => {
  // These fixture defaults are load-bearing for the bugSignature comparison below: both must
  // match baseKernelParams({ leverage }) exactly (only leverage is overridden here).
  const DEFAULT_INITIAL_INVESTMENT = 10_000
  const financingSpread = 0.005
  const expenseRatio = 0.009

  function oneBarValue(leverage: number): number {
    const series = makeKernelSeries([0, 0], [0, 0], [0, 1])
    const params = baseKernelParams({ leverage, financingSpread, expenseRatio })
    const result = runBacktest(params, series, makeOutputs(2))
    return result.finalValue
  }

  test('value(L) and value(L + 1e-9) differ by far less than what a leverage === 1 special case would cause', () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 20, noNaN: true }), (leverage) => {
        const a = oneBarValue(leverage)
        const b = oneBarValue(leverage + 1e-9)
        // What a `leverage === 1` special-cased expense-ratio gate would look like: the full
        // one-bar expense charge appearing or disappearing discontinuously at exactly L=1.
        const bugSignature = (DEFAULT_INITIAL_INVESTMENT * expenseRatio) / EXPENSE_DAY_COUNT_BASIS
        return Math.abs(a - b) < bugSignature * 1e-3
      }),
      { numRuns: 200 },
    )
  })

  test('leverage exactly 1 and leverage 0.9999999999 charge the same expense ratio', () => {
    const atOne = oneBarValue(1)
    const justBelowOne = oneBarValue(0.9999999999)

    expect(Math.abs(atOne - justBelowOne)).toBeLessThan(1e-4)
  })
})

describe('D-08: sub-1x leverage produces a financing credit, and it is not clamped to zero', () => {
  test('leverage 0.5 with a positive short rate and zero return increases value above initialInvestment after one bar', () => {
    const series = makeKernelSeries([0, 0], [0, 0.05], [0, 1])
    const params = baseKernelParams({ leverage: 0.5, financingSpread: 0, expenseRatio: 0 })
    const result = runBacktest(params, series, makeOutputs(2))

    expect(result.finalValue).toBeGreaterThan(params.initialInvestment)
  })
})
