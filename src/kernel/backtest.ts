/**
 * src/kernel/backtest.ts
 *
 * The one simulation kernel module (SIM-10): the allocation-free daily-rebalanced leveraged
 * recurrence, ported from the Phase 1 throwaway spike (`bench/kernel.ts`) with every correction
 * 03-PATTERNS.md records as required, not optional.
 *
 * Day-count convention (deliberately two different bases, never conflated -- D-01/D-02):
 * - Financing accrues on actual/360: `(leverage-1) * (shortRate+spread) *
 *   (calendarDaysElapsed/360)`, the USD money-market convention real swap financing uses.
 * - The expense ratio accrues on actual/365, scaled by the same calendar gap:
 *   `expenseRatio * (calendarDaysElapsed/365)` -- this totals to exactly `expenseRatio` per
 *   year regardless of how many trading bars that year contains.
 *
 * Bar 0 is a cost-free anchor (D-03): it is written as exactly `initialInvestment`, with no
 * return applied and no cost accrued. Costs first accrue on bar 1, using the calendar gap from
 * bar 0 to bar 1.
 *
 * The kernel never branches on the value of `leverage` (D-05): financing is structurally zero at
 * leverage 1 because it is scaled by `(leverage - 1)`, and negative at leverage below 1 (D-08),
 * a credit that is not clamped.
 *
 * Ruin (D-22/D-23/D-24): evaluated after both the return and both cost terms are applied, on a
 * `value <= 0` crossing. The ruin bar and every subsequent bar are written as exactly 0; no
 * negative number ever appears in `outValue`, and no later return or contribution can move the
 * value away from 0. A contribution scheduled at or after the ruin bar is never applied but is
 * counted in `droppedContributionsTotal` (D-21).
 *
 * Allocation discipline (SIM-11): every accumulator is a scalar; the three output arrays are
 * preallocated by the caller; the result object is built once, after the loop. No module-level
 * mutable binding exists in this file, so concurrent callers holding their own output buffers
 * cannot interfere with one another. Phase 4 F-01/METR-03 adds two more scalars, a running peak
 * and a running maximum drawdown, updated once per bar from `outValue[i]` after it is finalized
 * on every path that writes it -- still two `let` bindings and no new array.
 *
 * Import discipline (SIM-10): this module type-imports its own types from `./backtest.types.ts`
 * and nothing else. `FINANCING_DAY_COUNT_BASIS` and `EXPENSE_DAY_COUNT_BASIS` are re-declared
 * below as local numeric literals rather than imported at runtime, so the emitted module has no
 * runtime imports at all -- they must stay numerically identical to the same-named constants
 * exported by `./backtest.types.ts`.
 */

import type { KernelOutputs, KernelParams, KernelResult, KernelSeries } from './backtest.types.ts'

/** D-01: mirrors FINANCING_DAY_COUNT_BASIS in ./backtest.types.ts. */
const FINANCING_DAY_COUNT_BASIS = 360

/** D-02: mirrors EXPENSE_DAY_COUNT_BASIS in ./backtest.types.ts. */
const EXPENSE_DAY_COUNT_BASIS = 365

/**
 * Runs one full leveraged backtest over `series`, writing per-bar results into `outputs`.
 * `series` and `outputs` are already sliced to the run window: index 0 is the entry bar, and the
 * loop runs `i` from 0 to `series.returns.length - 1` (no `entryIndex` parameter, per D-30).
 * Every output array must be preallocated by the caller and at least as long as
 * `series.returns`; nothing is allocated inside this function.
 */
export function runBacktest(params: KernelParams, series: KernelSeries, outputs: KernelOutputs): KernelResult {
  const { returns, shortRate, calendarDaysElapsed, contributionFlags } = series
  const { outValue, outRuined, outLongGap } = outputs
  const barCount = returns.length

  // T-03-01/D-32: pre-loop length asserts, outside the hot path, so an out-of-range window
  // throws instead of reading or writing past a buffer end.
  if (outValue.length < barCount || outRuined.length < barCount || outLongGap.length < barCount) {
    throw new Error(
      `runBacktest: output arrays must be at least as long as series.returns ` +
        `(returns.length=${barCount}, outValue.length=${outValue.length}, ` +
        `outRuined.length=${outRuined.length}, outLongGap.length=${outLongGap.length})`,
    )
  }
  if (shortRate.length < barCount || calendarDaysElapsed.length < barCount || contributionFlags.length < barCount) {
    throw new Error(
      `runBacktest: series arrays must be at least as long as series.returns ` +
        `(returns.length=${barCount}, shortRate.length=${shortRate.length}, ` +
        `calendarDaysElapsed.length=${calendarDaysElapsed.length}, contributionFlags.length=${contributionFlags.length})`,
    )
  }

  const { leverage, initialInvestment, contributionAmount, financingSpread, expenseRatio, longGapMinDays } = params

  let value = initialInvestment
  let ruined = false
  let ruinBarIndex = -1
  let droppedContributionsTotal = 0
  let totalContributed = initialInvestment
  let longGapBarCount = 0
  // F-01/METR-03: running peak and running maximum drawdown, updated once per bar below.
  let peakValue = initialInvestment
  let maxDrawdown = 0

  for (let i = 0; i < barCount; i++) {
    if (i === 0) {
      // D-03: the entry bar is a cost-free anchor.
      outValue[0] = initialInvestment
      outRuined[0] = 0
      outLongGap[0] = 0
      if (outValue[0]! > peakValue) {
        peakValue = outValue[0]!
      } else if (peakValue > 0) {
        const drawdown = 1 - outValue[0]! / peakValue
        if (drawdown > maxDrawdown) maxDrawdown = drawdown
      }
      continue
    }

    const calendarGap = calendarDaysElapsed[i] ?? 0
    if (calendarGap >= longGapMinDays) {
      outLongGap[i] = 1
      longGapBarCount++
    } else {
      outLongGap[i] = 0
    }

    if (ruined) {
      outValue[i] = 0
      outRuined[i] = 1
      if (outValue[i]! > peakValue) {
        peakValue = outValue[i]!
      } else if (peakValue > 0) {
        const drawdown = 1 - outValue[i]! / peakValue
        if (drawdown > maxDrawdown) maxDrawdown = drawdown
      }
      if (contributionFlags[i] === 1) {
        droppedContributionsTotal += contributionAmount
      }
      continue
    }

    const dailyReturn = returns[i] ?? 0
    const rate = shortRate[i] ?? 0

    // D-01/D-05: leverage applied to the daily return and compounded. Financing is structurally
    // zero at leverage 1 (scaled by `leverage - 1`), never a branch on the value 1.
    value = value * (1 + leverage * dailyReturn)
    const financingCost = value * (leverage - 1) * (rate + financingSpread) * (calendarGap / FINANCING_DAY_COUNT_BASIS)
    value -= financingCost

    // D-02: a genuinely different accrual basis from financing.
    const expenseCost = value * expenseRatio * (calendarGap / EXPENSE_DAY_COUNT_BASIS)
    value -= expenseCost

    // D-22/D-23: ruin evaluated after the return and both cost terms are applied.
    if (value <= 0) {
      value = 0
      ruined = true
      ruinBarIndex = i
      outValue[i] = 0
      outRuined[i] = 1
      // D-22/D-23: the ruin bar's value is exactly 0 against a strictly positive prior peak, so
      // this crossing always drives maxDrawdown to exactly 1.
      if (outValue[i]! > peakValue) {
        peakValue = outValue[i]!
      } else if (peakValue > 0) {
        const drawdown = 1 - outValue[i]! / peakValue
        if (drawdown > maxDrawdown) maxDrawdown = drawdown
      }
      if (contributionFlags[i] === 1) {
        droppedContributionsTotal += contributionAmount
      }
      continue
    }

    // D-21: contribution added after the ruin check, so a contribution on the bar that ruins
    // the position can never resurrect it.
    if (contributionFlags[i] === 1) {
      value += contributionAmount
      totalContributed += contributionAmount
    }

    outValue[i] = value
    outRuined[i] = 0
    if (outValue[i]! > peakValue) {
      peakValue = outValue[i]!
    } else if (peakValue > 0) {
      const drawdown = 1 - outValue[i]! / peakValue
      if (drawdown > maxDrawdown) maxDrawdown = drawdown
    }
  }

  const finalValue = barCount > 0 ? (outValue[barCount - 1] ?? 0) : initialInvestment

  return {
    finalValue,
    ruined,
    ruinBarIndex,
    droppedContributionsTotal,
    totalContributed,
    longGapBarCount,
    barCount,
    maxDrawdown,
  }
}
