/**
 * bench/backtest-ablation-variants.ts
 *
 * Measurement variants for quick-260824-r5d, the last unmeasured PERF-03 lever: whether per-cell
 * kernel compute at the real 17-column chunk shape is itself reducible. This is NOT the shipped
 * kernel. `src/kernel/backtest.ts` remains the one simulation kernel under SIM-10. Nothing under
 * `src/` may import this file; it exists only to be timed against the shipped kernel by
 * `bench/kernel-ablation.bench.test.ts`, gated on a correctness proof that runs before any clock
 * starts.
 *
 * Every variant here re-declares `FINANCING_DAY_COUNT_BASIS = 360` and
 * `EXPENSE_DAY_COUNT_BASIS = 365` locally, exactly as `src/kernel/backtest.ts` and
 * `bench/backtest-scalar-only.ts` both do, so the emitted module has no runtime imports.
 */

import type { KernelOutputs, KernelParams, KernelResult, KernelSeries } from '../src/kernel/backtest.types.ts'

/** Mirrors FINANCING_DAY_COUNT_BASIS in ../src/kernel/backtest.types.ts (D-01). */
const FINANCING_DAY_COUNT_BASIS = 360

/** Mirrors EXPENSE_DAY_COUNT_BASIS in ../src/kernel/backtest.types.ts (D-02). */
const EXPENSE_DAY_COUNT_BASIS = 365

/** Shared type every ablation variant below matches, identical to `runBacktest`'s own signature,
 * so `bench/chunk-metrics-kernel-ablation.ts` can accept any variant interchangeably. */
export type AblationKernel = (params: KernelParams, series: KernelSeries, outputs: KernelOutputs) => KernelResult

/**
 * Candidate 1: the three `?? 0` guards on `calendarDaysElapsed[i]`, `returns[i]` and
 * `shortRate[i]` become non-null assertions. This is the ONLY difference from `runBacktest`.
 * Every other statement, operator, constant, branch condition, order of operations and pre-loop
 * length guard is character-for-character the shipped kernel's.
 *
 * Expected bit-preserving: a Float64Array or Int32Array in-range read never yields `undefined`,
 * so `?? 0` is a redundant runtime check here, not a semantic one -- the pre-loop length guards
 * below already prove every index this loop touches is in range. Whether the guard actually
 * costs anything on this engine is the measurement, not an assumption.
 */
export function runBacktestNoGuards(
  params: KernelParams,
  series: KernelSeries,
  outputs: KernelOutputs,
): KernelResult {
  const { returns, shortRate, calendarDaysElapsed, contributionFlags } = series
  const { outValue, outRuined, outLongGap } = outputs
  const barCount = returns.length

  if (outValue.length < barCount || outRuined.length < barCount || outLongGap.length < barCount) {
    throw new Error(
      `runBacktestNoGuards: output arrays must be at least as long as series.returns ` +
        `(returns.length=${barCount}, outValue.length=${outValue.length}, ` +
        `outRuined.length=${outRuined.length}, outLongGap.length=${outLongGap.length})`,
    )
  }
  if (shortRate.length < barCount || calendarDaysElapsed.length < barCount || contributionFlags.length < barCount) {
    throw new Error(
      `runBacktestNoGuards: series arrays must be at least as long as series.returns ` +
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

    // The one difference from runBacktest: `!` instead of `?? 0`.
    const calendarGap = calendarDaysElapsed[i]!
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

    // The one difference from runBacktest: `!` instead of `?? 0`.
    const dailyReturn = returns[i]!
    const rate = shortRate[i]!

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

    // D-21: contribution added after the ruin check, so a contribution on the bar that ruins the
    // position can never resurrect it.
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
