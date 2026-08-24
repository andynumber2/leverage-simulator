/**
 * bench/backtest-scalar-only.ts
 *
 * Measurement variant for PERF-03 lever 1 (07.1-PERF-03-BASELINE.md section 9: the kernel's
 * write-only per-bar output arrays). This is NOT the shipped kernel. `src/kernel/backtest.ts`
 * remains the one simulation kernel under SIM-10. Nothing under `src/` may import this file; it
 * exists only to be timed against the shipped kernel in `bench/kernel-scalar-arrays.bench.test.ts`,
 * gated on a bit-identical equivalence proof that runs before any clock starts.
 *
 * A faithful copy of `runBacktest` (`src/kernel/backtest.ts`) with exactly these differences and
 * no others:
 *   - the eleven per-bar array write statements to `outValue`, `outRuined` and `outLongGap` are
 *     removed (`src/sweep/sweep.worker.ts` never reads these arrays back; they are write-only
 *     scratch in the sweep path)
 *   - the four `outValue[...]` readback sites are replaced with scalar substitutions: the bar-0
 *     anchor reads `initialInvestment`, both ruin branches read the literal `0` (the value they
 *     write is always exactly 0), and the ordinary path reads the `value` scalar
 *   - `finalValue` is built from the `value` scalar instead of an `outValue` readback
 * No arithmetic, operator, order of operations, constant or branch condition changes from the
 * shipped kernel.
 */

import type { KernelOutputs, KernelParams, KernelResult, KernelSeries } from '../src/kernel/backtest.types.ts'

/** Mirrors FINANCING_DAY_COUNT_BASIS in ../src/kernel/backtest.types.ts (D-01). */
const FINANCING_DAY_COUNT_BASIS = 360

/** Mirrors EXPENSE_DAY_COUNT_BASIS in ../src/kernel/backtest.types.ts (D-02). */
const EXPENSE_DAY_COUNT_BASIS = 365

/**
 * Runs one full leveraged backtest over `series`, exactly as `runBacktest` does, except it never
 * writes a per-bar output array. `outputs` is still accepted and its length-checked in the
 * pre-loop guard below, so the two arms differ only by the per-bar writes, not by argument
 * handling or a dropped guard.
 */
export function runBacktestScalarOnly(
  params: KernelParams,
  series: KernelSeries,
  outputs: KernelOutputs,
): KernelResult {
  const { returns, shortRate, calendarDaysElapsed, contributionFlags } = series
  const { outValue, outRuined, outLongGap } = outputs
  const barCount = returns.length

  if (outValue.length < barCount || outRuined.length < barCount || outLongGap.length < barCount) {
    throw new Error(
      `runBacktestScalarOnly: output arrays must be at least as long as series.returns ` +
        `(returns.length=${barCount}, outValue.length=${outValue.length}, ` +
        `outRuined.length=${outRuined.length}, outLongGap.length=${outLongGap.length})`,
    )
  }
  if (shortRate.length < barCount || calendarDaysElapsed.length < barCount || contributionFlags.length < barCount) {
    throw new Error(
      `runBacktestScalarOnly: series arrays must be at least as long as series.returns ` +
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
  let peakValue = initialInvestment
  let maxDrawdown = 0

  for (let i = 0; i < barCount; i++) {
    if (i === 0) {
      // D-03: the entry bar is a cost-free anchor. outValue[0] readback substituted with the
      // initialInvestment scalar, which is exactly what that bar was written as.
      if (initialInvestment > peakValue) {
        peakValue = initialInvestment
      } else if (peakValue > 0) {
        const drawdown = 1 - initialInvestment / peakValue
        if (drawdown > maxDrawdown) maxDrawdown = drawdown
      }
      continue
    }

    const calendarGap = calendarDaysElapsed[i] ?? 0
    if (calendarGap >= longGapMinDays) {
      longGapBarCount++
    }

    if (ruined) {
      // outValue[i] readback substituted with the literal 0: this branch always writes exactly 0.
      if (0 > peakValue) {
        peakValue = 0
      } else if (peakValue > 0) {
        const drawdown = 1 - 0 / peakValue
        if (drawdown > maxDrawdown) maxDrawdown = drawdown
      }
      if (contributionFlags[i] === 1) {
        droppedContributionsTotal += contributionAmount
      }
      continue
    }

    const dailyReturn = returns[i] ?? 0
    const rate = shortRate[i] ?? 0

    // D-01/D-05: leverage applied to the daily return and compounded.
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
      // outValue[i] readback substituted with the literal 0, same reasoning as the ruined branch
      // above: this crossing always drives maxDrawdown to exactly 1 against a positive prior peak.
      if (0 > peakValue) {
        peakValue = 0
      } else if (peakValue > 0) {
        const drawdown = 1 - 0 / peakValue
        if (drawdown > maxDrawdown) maxDrawdown = drawdown
      }
      if (contributionFlags[i] === 1) {
        droppedContributionsTotal += contributionAmount
      }
      continue
    }

    // D-21: contribution added after the ruin check.
    if (contributionFlags[i] === 1) {
      value += contributionAmount
      totalContributed += contributionAmount
    }

    // outValue[i] readback substituted with the value scalar, which was just assigned above.
    if (value > peakValue) {
      peakValue = value
    } else if (peakValue > 0) {
      const drawdown = 1 - value / peakValue
      if (drawdown > maxDrawdown) maxDrawdown = drawdown
    }
  }

  // finalValue's outValue[barCount - 1] readback substituted with the value scalar: value already
  // equals that array element on every path (initialInvestment at bar 0, exactly 0 after ruin,
  // the post-contribution value otherwise).
  const finalValue = barCount > 0 ? value : initialInvestment

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
