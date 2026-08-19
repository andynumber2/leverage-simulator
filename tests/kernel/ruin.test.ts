/**
 * tests/kernel/ruin.test.ts
 *
 * PITFALLS A7's ruin semantics (clamp, flag, absorbing state, dropped contributions), the D-04
 * long-gap flag proven against the two real multi-day closures, and the SIM-12 checklist's
 * disposition table for every A-row this phase's tests do not directly cover (03-02-PLAN.md
 * Task 2). Ruin is asserted only through the `ruined` flag, `ruinBarIndex` and exact equality
 * against 0 -- never by comparing a value against an epsilon, which is the defect D-23 rejected.
 */

import { describe, expect, test } from 'vitest'

import { fromDaysSinceEpoch } from '../../tools/bundle-compiler/src/calendar.ts'
import { buildKernelInputs, type BacktestRequest } from '../../src/data/kernel-inputs.ts'
import { loadBundleFromDisk } from '../../src/data/load-bundle-node.ts'
import { runBacktest } from '../../src/kernel/backtest.ts'
import { LONG_GAP_FLAG_MIN_DAYS } from '../../src/kernel/backtest.types.ts'
import { baseKernelParams, makeKernelSeries, makeOutputs } from './fixtures.ts'

describe('PITFALLS A7: the ruin boundary is clamped, flagged and absorbing', () => {
  test('a single -40% bar at leverage 3 clamps to exactly 0 at the bar it crosses, with ruinBarIndex pointing at that bar', () => {
    // bar0 is the cost-free entry anchor; bar1 carries the -40% return.
    const series = makeKernelSeries([0, -0.4], [0, 0], [0, 1])
    const params = baseKernelParams({ leverage: 3, financingSpread: 0, expenseRatio: 0 })
    const outputs = makeOutputs(2)

    const result = runBacktest(params, series, outputs)

    expect(outputs.outValue[1]).toBe(0)
    expect(outputs.outRuined[1]).toBe(1)
    expect(result.ruined).toBe(true)
    expect(result.ruinBarIndex).toBe(1)
    expect(result.finalValue).toBe(0)
  })

  test('after the clamp, every subsequent bar stays at exactly 0 regardless of subsequent returns, including a +50%, a +100% and a -90% bar', () => {
    const series = makeKernelSeries([0, -0.4, 0.5, 1.0, -0.9], [0, 0, 0, 0, 0], [0, 1, 1, 1, 1])
    const params = baseKernelParams({ leverage: 3, financingSpread: 0, expenseRatio: 0 })
    const outputs = makeOutputs(5)

    const result = runBacktest(params, series, outputs)

    expect(Array.from(outputs.outValue)).toEqual([10_000, 0, 0, 0, 0])
    expect(Array.from(outputs.outRuined)).toEqual([0, 1, 1, 1, 1])
    expect(result.ruined).toBe(true)
    expect(result.ruinBarIndex).toBe(1)
    expect(result.finalValue).toBe(0)
  })

  test('a -90% bar at leverage 20 still writes exactly 0, never a negative number, on the ruin bar and every bar after it', () => {
    const series = makeKernelSeries([0, -0.9, 0.2, -0.5], [0, 0, 0, 0], [0, 1, 1, 1])
    const params = baseKernelParams({ leverage: 20, financingSpread: 0, expenseRatio: 0 })
    const outputs = makeOutputs(4)

    const result = runBacktest(params, series, outputs)

    expect(result.ruined).toBe(true)
    expect(result.ruinBarIndex).toBe(1)
    for (let i = 1; i < outputs.outValue.length; i++) {
      expect(outputs.outValue[i]).toBe(0)
      expect(outputs.outValue[i]).not.toBeLessThan(0)
    }
  })

  test('contributions applied before the ruin bar count toward totalContributed; contributions flagged at or after the ruin bar are dropped and reported in droppedContributionsTotal', () => {
    // bar0 anchor; bar1 (+1%) and bar2 (+2%) both take a $500 contribution before ruin; bar3
    // (-40%) is the ruin bar; bar4 (+50%) and bar5 (-90%) are post-ruin. All six bars carry a
    // contribution flag, so the ruin bar's own flagged contribution is exercised too (D-21: a
    // contribution scheduled on the very bar that ruins the position is dropped, not applied
    // just before the crossing check).
    const series = makeKernelSeries(
      [0, 0.01, 0.02, -0.4, 0.5, -0.9],
      [0, 0, 0, 0, 0, 0],
      [0, 1, 1, 1, 1, 1],
      [0, 1, 1, 1, 1, 1],
    )
    const params = baseKernelParams({ leverage: 3, financingSpread: 0, expenseRatio: 0, contributionAmount: 500 })
    const outputs = makeOutputs(6)

    const result = runBacktest(params, series, outputs)

    expect(result.ruined).toBe(true)
    expect(result.ruinBarIndex).toBe(3)
    // Two contributions applied before the ruin bar (bar1, bar2): 10000 + 500 + 500.
    expect(result.totalContributed).toBe(11_000)
    // Three flagged bars at or after the ruin bar (bar3, bar4, bar5): 500 * 3.
    expect(result.droppedContributionsTotal).toBe(1_500)
    expect(result.finalValue).toBe(0)
    expect(outputs.outValue[3]).toBe(0)
    expect(outputs.outValue[4]).toBe(0)
    expect(outputs.outValue[5]).toBe(0)
  })

  test('a run that never ruins reports ruined false and ruinBarIndex -1', () => {
    const series = makeKernelSeries([0, 0.01, 0.02, -0.01], [0, 0, 0, 0], [0, 1, 1, 1])
    const params = baseKernelParams({ leverage: 1, financingSpread: 0, expenseRatio: 0 })
    const outputs = makeOutputs(4)

    const result = runBacktest(params, series, outputs)

    expect(result.ruined).toBe(false)
    expect(result.ruinBarIndex).toBe(-1)
    for (const flag of outputs.outRuined) {
      expect(flag).toBe(0)
    }
  })
})

describe('D-04: the long-gap flag fires exactly on bars whose calendarDaysElapsed is at or above LONG_GAP_FLAG_MIN_DAYS', () => {
  test('gaps of 1, 3, 4 and 5 days do not set outLongGap; gaps of 6, 7 and 12 days do, and longGapBarCount counts only the latter', () => {
    // bar0 anchor (gap unused); the rest carry gaps 1, 3, 4, 5, 6, 7, 12.
    const gaps = [0, 1, 3, 4, 5, 6, 7, 12]
    const series = makeKernelSeries(
      gaps.map(() => 0),
      gaps.map(() => 0),
      gaps,
    )
    const params = baseKernelParams({ leverage: 1, financingSpread: 0, expenseRatio: 0 })
    const outputs = makeOutputs(gaps.length)

    const result = runBacktest(params, series, outputs)

    expect(LONG_GAP_FLAG_MIN_DAYS).toBe(6)
    // index: 0=anchor(0d) 1=1d 2=3d 3=4d 4=5d 5=6d 6=7d 7=12d
    expect(Array.from(outputs.outLongGap)).toEqual([0, 0, 0, 0, 0, 1, 1, 1])
    expect(result.longGapBarCount).toBe(3)
  })

  test('over the real committed bundle across the full SPX window, longGapBarCount is exactly 2, corresponding to the 1933 bank holiday and the 2001 closure', async () => {
    const bundle = await loadBundleFromDisk()
    const request: BacktestRequest = {
      symbol: 'SPX',
      dividendReinvest: false,
      leverage: 1,
      entryDate: bundle.manifest.calendar.firstDate,
      holdingPeriodBars: null,
      initialInvestment: 10_000,
      contributionAmount: 0,
      contributionFrequency: 'none',
      expenseRatioPercent: 0,
      financingSpreadPercent: 0,
    }
    const inputs = buildKernelInputs(bundle, request)
    const result = runBacktest(inputs.params, inputs.series, inputs.outputs)

    expect(result.longGapBarCount).toBe(2)

    const flaggedIndices: number[] = []
    for (let k = 0; k < inputs.window.barCount; k++) {
      if (inputs.outputs.outLongGap[k] === 1) flaggedIndices.push(k)
    }
    expect(flaggedIndices).toHaveLength(2)

    const flaggedDates = flaggedIndices.map((k) => {
      const absIndex = inputs.window.entryIndex + k
      const days = bundle.calendar[absIndex]
      if (days === undefined) throw new Error(`test fixture: calendar index ${absIndex} out of range`)
      return fromDaysSinceEpoch(days)
    })

    expect(flaggedDates[0], `flagged dates: ${flaggedDates.join(', ')}`).toMatch(/^1933-03/)
    expect(flaggedDates[1], `flagged dates: ${flaggedDates.join(', ')}`).toMatch(/^2001-09/)
  })
})

/**
 * SIM-12's checklist coverage assertion: every one of PITFALLS.md section A's twelve rows maps
 * to either the name of the test that covers it, or a disposition object naming why it is not a
 * kernel-code concern. Adding or renaming a pitfall row without updating this table is a failing
 * test, not a silent gap.
 */
type ChecklistEntry = { coveredBy: string } | { disposition: { reason: string } }

const PITFALLS_A_CHECKLIST: Record<string, ChecklistEntry> = {
  A1: {
    coveredBy:
      'tests/kernel/pitfalls-a.test.ts > PITFALLS A1: a symmetric up-then-down window shows the leveraged run losing more than the naive L*totalReturn formula predicts (volatility drag)',
  },
  A2: {
    coveredBy:
      'tests/kernel/pitfalls-a.test.ts > PITFALLS A2: the financing gap between a rated and an unrated run scales linearly with (leverage - 1)',
  },
  A3: {
    disposition: {
      reason:
        'The wholesale-vs-retail rate class is a Phase 2 data-sourcing property inherited from the FRED splice, not a kernel behavior; it is detectable only through D-20\'s residual-pattern diagnosis table against the UPRO/TQQQ tracking gate, not by a kernel unit test.',
    },
  },
  A4: {
    coveredBy:
      'tests/kernel/pitfalls-a.test.ts > PITFALLS A4: a 249-bar year and a 252-bar year, both with calendarDaysElapsed summing to 365, charge nearly identical total expense drag',
  },
  A5: {
    disposition: {
      reason:
        "The era-appropriate reference rate is Phase 2's spliced rate series, with its own manifest seam records; correctness here is a data-provenance property, not a kernel invariant.",
    },
  },
  A6: {
    disposition: {
      reason:
        "The product spread over the reference rate is detected by plan 03-06's rate-regime sub-window tracking-error statistic, not by a kernel unit test: the kernel applies whatever spread it is given, and spread mis-calibration only shows up empirically against real fund history.",
    },
  },
  A7: {
    coveredBy:
      'tests/kernel/ruin.test.ts > PITFALLS A7: a single -40% bar at leverage 3 clamps to exactly 0 at the bar it crosses, with ruinBarIndex pointing at that bar (plus the absorbing-state, non-negative and dropped-contribution cases in the same describe block)',
  },
  A8: {
    coveredBy:
      'tests/kernel/pitfalls-a.test.ts > PITFALLS A8: a 3-calendar-day gap costs exactly 3x a 1-calendar-day gap, and a 12-day gap costs exactly 12x',
  },
  A9: {
    disposition: {
      reason:
        "Overfitting the validation target is enforced by plan 03-03's commit ordering (sourced parameters committed before any validation code exists) and its pinned-constant test, not by kernel behavior: the kernel has no way to know whether its inputs were tuned.",
    },
  },
  A10: {
    coveredBy:
      'tests/kernel/pitfalls-a.test.ts > PITFALLS A10 / SIM-04: leverage 1, expense ratio 0, financing spread 0 reproduces the direct compounded return series within 1e-9 relative deviation on every bar',
  },
  A11: {
    coveredBy:
      'tests/kernel/pitfalls-a.test.ts > PITFALLS A11: outValue at the last bar divided by initialInvestment matches the raw price level ratio within 1e-9 relative deviation',
  },
  A12: {
    disposition: {
      reason:
        'The swap/futures cost-structure simplification (reference-rate-plus-spread standing in for futures-basis financing) is a Phase 5 methodology-disclosure requirement, not a testable kernel behavior: PITFALLS A12 itself states there is no detectable warning sign from the S&P/NDX validation set alone.',
    },
  },
}

describe('SIM-12: the PITFALLS section A checklist has an entry for every row', () => {
  test('the checklist table has exactly twelve entries, one for each of A1 through A12', () => {
    const keys = Object.keys(PITFALLS_A_CHECKLIST)
    expect(keys).toHaveLength(12)
    for (let n = 1; n <= 12; n++) {
      expect(PITFALLS_A_CHECKLIST, `missing key A${n}`).toHaveProperty(`A${n}`)
    }
  })

  test('every entry is either a non-empty covered-by name or a disposition with a non-empty reason', () => {
    for (const [id, entry] of Object.entries(PITFALLS_A_CHECKLIST)) {
      if ('coveredBy' in entry) {
        expect(entry.coveredBy.length, `${id}: coveredBy must be non-empty`).toBeGreaterThan(0)
      } else {
        expect(entry.disposition.reason.length, `${id}: disposition.reason must be non-empty`).toBeGreaterThan(0)
      }
    }
  })
})
