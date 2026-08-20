/**
 * tests/metrics/irr.test.ts
 *
 * Every case in 04-02-PLAN.md Task 2's `<behavior>` block for `solveIrr`, `buildCashFlows` and
 * `solveCagr`: single-cash-flow agreement with the closed-form CAGR, a monthly-contribution
 * schedule solving ABOVE the naive ratio return, the total-loss boundary, the undefined-bracket
 * null, D-21's post-ruin contribution exclusion, and a fast-check property over the
 * single-outflow-single-inflow case.
 *
 * The plan wrote "below" for the monthly-contribution case and was wrong: later contributions
 * compound for less time, so the money-weighted rate must exceed the time-blind ratio. The test
 * at the bottom of this file asserts the correct direction; this header used to repeat the
 * plan's error. Recorded as broken window #4.
 */

import fc from 'fast-check'
import { describe, expect, test } from 'vitest'

import { solveCagr } from '../../src/metrics/cagr.ts'
import { buildCashFlows, solveIrr, type CashFlow } from '../../src/metrics/irr.ts'
import type { KernelOutputs, KernelParams, KernelResult, KernelSeries } from '../../src/kernel/backtest.types.ts'

function makeSeries(calendarDaysElapsed: number[], contributionFlags: number[]): KernelSeries {
  return {
    returns: new Float64Array(calendarDaysElapsed.length),
    shortRate: new Float64Array(calendarDaysElapsed.length),
    calendarDaysElapsed: Int32Array.from(calendarDaysElapsed),
    contributionFlags: Uint8Array.from(contributionFlags),
  }
}

function makeParams(overrides: Partial<KernelParams> = {}): KernelParams {
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

function makeResult(overrides: Partial<KernelResult> = {}): KernelResult {
  return {
    finalValue: 0,
    ruined: false,
    ruinBarIndex: -1,
    droppedContributionsTotal: 0,
    totalContributed: 0,
    longGapBarCount: 0,
    barCount: 0,
    maxDrawdown: 0,
    ...overrides,
  }
}

describe('solveIrr: bounded bisection over a dated cash-flow sequence', () => {
  test('a single outflow at day 0 and a single inflow at day 365 that doubles the money solves to an IRR of 1.0 within 1e-6', () => {
    const flows: CashFlow[] = [
      { daysSinceEntry: 0, amount: -10_000 },
      { daysSinceEntry: 365, amount: 20_000 },
    ]
    const irr = solveIrr(flows)
    expect(irr).not.toBeNull()
    expect(Math.abs(irr! - 1.0)).toBeLessThan(1e-6)
  })

  test('the same single-cash-flow case solves to a value equal to the closed-form CAGR within 1e-9', () => {
    const flows: CashFlow[] = [
      { daysSinceEntry: 0, amount: -10_000 },
      { daysSinceEntry: 365, amount: 20_000 },
    ]
    const irr = solveIrr(flows)
    const cagr = solveCagr(10_000, 20_000, 365)
    expect(irr).not.toBeNull()
    expect(cagr).not.toBeNull()
    expect(Math.abs(irr! - cagr!)).toBeLessThan(1e-9)
  })

  test('a monthly-contribution schedule ending above total contributed solves to a positive IRR that diverges from the naive (non-money-weighted) ratio-based return, because later money compounds for less time', () => {
    // Deviation from the plan's literal "strictly less than" wording (Rule 1 -- see 04-02-SUMMARY.md):
    // for a front-loaded schedule with monotonic growth, the money-weighted IRR is verifiably
    // GREATER than the naive final/totalContributed ratio, not less. Later contributions have
    // little time to compound, so achieving the same observed total profit requires a HIGHER
    // annualized rate than the naive, time-blind ratio implies (the naive ratio implicitly
    // credits every dollar with the full period's exposure, understating the true rate). Verified
    // independently by hand (NPV at the naive rate is strictly positive, so bisection must raise
    // the rate further to reach zero) before writing this assertion.
    const flows: CashFlow[] = [{ daysSinceEntry: 0, amount: -10_000 }]
    let totalContributed = 10_000
    for (let month = 1; month <= 12; month++) {
      flows.push({ daysSinceEntry: month * 30, amount: -1_000 })
      totalContributed += 1_000
    }
    const finalValue = 30_000
    flows.push({ daysSinceEntry: 365, amount: finalValue })

    const irr = solveIrr(flows)
    const naiveRatioReturn = finalValue / totalContributed - 1

    expect(irr).not.toBeNull()
    expect(irr!).toBeGreaterThan(0)
    expect(irr!).toBeGreaterThan(naiveRatioReturn)
  })

  test('a run whose terminal inflow is exactly 0 returns exactly -1, the definitional total-loss result', () => {
    const flows: CashFlow[] = [
      { daysSinceEntry: 0, amount: -10_000 },
      { daysSinceEntry: 90, amount: -500 },
      { daysSinceEntry: 400, amount: 0 },
    ]
    expect(solveIrr(flows)).toBe(-1)
  })

  test('a cash-flow sequence whose NPV has the same sign at both bracket ends and a non-zero terminal inflow returns null, never NaN and never Infinity', () => {
    // Terminal inflow of $0.50 at day 365 is too small relative to the $10,000 outflow to
    // produce a sign change anywhere in the [-0.9999, 10.0] bracket: NPV stays negative at both
    // ends.
    const flows: CashFlow[] = [
      { daysSinceEntry: 0, amount: -10_000 },
      { daysSinceEntry: 365, amount: 0.5 },
    ]
    const irr = solveIrr(flows)
    expect(irr).toBeNull()
  })

  test('fast-check: for any single-outflow-single-inflow pair with a positive inflow and a positive day span, solveIrr and solveCagr agree within 1e-6', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -0.5, max: 5, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 1, max: 3650 }),
        fc.double({ min: 100, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
        (rate, days, initial) => {
          const finalValue = initial * Math.pow(1 + rate, days / 365)
          const flows: CashFlow[] = [
            { daysSinceEntry: 0, amount: -initial },
            { daysSinceEntry: days, amount: finalValue },
          ]
          const irr = solveIrr(flows)
          const cagr = solveCagr(initial, finalValue, days)
          expect(irr).not.toBeNull()
          expect(cagr).not.toBeNull()
          expect(Math.abs(irr! - cagr!)).toBeLessThan(1e-6)
        },
      ),
    )
  })
})

describe('buildCashFlows: D-21 post-ruin contribution exclusion', () => {
  test('never emits a contribution scheduled at or after ruinBarIndex, so the sequence has exactly one sign change', () => {
    // bar0 anchor; bars 1-5 are all flagged for a $500 contribution; the run ruins at bar 3, so
    // only bars 1 and 2 are strictly before the ruin bar.
    const series = makeSeries([0, 1, 1, 1, 1, 1], [0, 1, 1, 1, 1, 1])
    const params = makeParams({ contributionAmount: 500 })
    const outputs: KernelOutputs = {
      outValue: Float64Array.from([10_000, 10_050, 10_100, 0, 0, 0]),
      outRuined: Uint8Array.from([0, 0, 0, 1, 1, 1]),
      outLongGap: new Uint8Array(6),
    }
    const result = makeResult({ barCount: 6, ruinBarIndex: 3, finalValue: 0, ruined: true })

    const flows = buildCashFlows(params, series, outputs, result)

    // 1 initial investment + 2 pre-ruin contributions (bars 1, 2) + 1 final value.
    expect(flows).toHaveLength(4)
    expect(flows[0]).toEqual({ daysSinceEntry: 0, amount: -10_000 })
    const contributionFlows = flows.slice(1, -1)
    expect(contributionFlows).toHaveLength(2)
    for (const flow of contributionFlows) {
      expect(flow.amount).toBe(-500)
    }
    const terminal = flows[flows.length - 1]!
    expect(terminal.amount).toBe(0)

    // solveIrr sees a terminal amount of exactly 0: the definitional total-loss result.
    expect(solveIrr(flows)).toBe(-1)
  })

  test('with no ruin (ruinBarIndex -1), every flagged bar becomes a cash flow', () => {
    const series = makeSeries([0, 1, 1, 1], [0, 1, 0, 1])
    const params = makeParams({ contributionAmount: 250 })
    const outputs: KernelOutputs = {
      outValue: Float64Array.from([10_000, 10_260, 10_270, 10_530]),
      outRuined: new Uint8Array(4),
      outLongGap: new Uint8Array(4),
    }
    const result = makeResult({ barCount: 4, ruinBarIndex: -1, finalValue: 10_530 })

    const flows = buildCashFlows(params, series, outputs, result)

    // 1 initial + 2 flagged contributions (bars 1, 3) + 1 final value.
    expect(flows).toHaveLength(4)
    expect(flows[1]).toEqual({ daysSinceEntry: 1, amount: -250 })
    expect(flows[2]).toEqual({ daysSinceEntry: 3, amount: -250 })
    expect(flows[3]).toEqual({ daysSinceEntry: 3, amount: 10_530 })
  })
})
