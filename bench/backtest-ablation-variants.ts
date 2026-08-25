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

/** Candidate 2 (day-count LUT): two precomputed exact-quotient lookup tables, shared as pure data
 * by `runBacktestDayCountLut` and `runBacktestCombined`. Each entry is computed by the SAME
 * division the shipped kernel performs, so every entry is bit-identical to the division it
 * replaces by construction (IEEE 754 double division is deterministic for the same operands).
 * Building the tables is a one-time module-load cost, not part of any measured per-bar loop, so
 * sharing them introduces no measurement confound. Length 32 comfortably covers the observed
 * calendar-gap range (typically 1 to 4; the largest in the bundled data is the 1933 bank holiday
 * at 12 days); a gap outside the table falls back to the division at each call site, so
 * correctness never depends on the observed gap range. */
const DAY_COUNT_LUT_LENGTH = 32
const financingGapFractionLut = new Float64Array(DAY_COUNT_LUT_LENGTH)
const expenseGapFractionLut = new Float64Array(DAY_COUNT_LUT_LENGTH)
for (let g = 0; g < DAY_COUNT_LUT_LENGTH; g++) {
  financingGapFractionLut[g] = g / FINANCING_DAY_COUNT_BASIS
  expenseGapFractionLut[g] = g / EXPENSE_DAY_COUNT_BASIS
}

/** Candidate 2 variant (reciprocal): precomputed reciprocals of the two day-count bases, shared
 * by `runBacktestDayCountReciprocal` only (never by the combined arm -- this candidate is NOT
 * bit-preserving, so it is excluded from the "all bit-preserving candidates at once" arm). Neither
 * 1/360 nor 1/365 is exactly representable in binary64, so `calendarGap * FINANCING_RECIPROCAL`
 * differs from `calendarGap / FINANCING_DAY_COUNT_BASIS` at the bit level for at least some
 * `calendarGap` values; adopting this variant would change displayed figures. */
const FINANCING_RECIPROCAL = 1 / FINANCING_DAY_COUNT_BASIS
const EXPENSE_RECIPROCAL = 1 / EXPENSE_DAY_COUNT_BASIS

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

/**
 * Candidate 2 (day-count LUT): the two per-bar divisions by 360 and 365 replaced by a lookup into
 * `financingGapFractionLut`/`expenseGapFractionLut` above. This is the ONLY difference from
 * `runBacktest`. Whether a table lookup is actually cheaper than a division on this hardware is
 * the measurement, not an assumption.
 *
 * Expected bit-preserving: each table entry equals the division it replaces by construction, and
 * the out-of-range fallback is literally the same division expression, so the multiplication that
 * consumes the fraction sees a bit-identical operand either way.
 */
export function runBacktestDayCountLut(
  params: KernelParams,
  series: KernelSeries,
  outputs: KernelOutputs,
): KernelResult {
  const { returns, shortRate, calendarDaysElapsed, contributionFlags } = series
  const { outValue, outRuined, outLongGap } = outputs
  const barCount = returns.length

  if (outValue.length < barCount || outRuined.length < barCount || outLongGap.length < barCount) {
    throw new Error(
      `runBacktestDayCountLut: output arrays must be at least as long as series.returns ` +
        `(returns.length=${barCount}, outValue.length=${outValue.length}, ` +
        `outRuined.length=${outRuined.length}, outLongGap.length=${outLongGap.length})`,
    )
  }
  if (shortRate.length < barCount || calendarDaysElapsed.length < barCount || contributionFlags.length < barCount) {
    throw new Error(
      `runBacktestDayCountLut: series arrays must be at least as long as series.returns ` +
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

    const financingGapFraction =
      calendarGap >= 0 && calendarGap < DAY_COUNT_LUT_LENGTH
        ? financingGapFractionLut[calendarGap]!
        : calendarGap / FINANCING_DAY_COUNT_BASIS
    const expenseGapFraction =
      calendarGap >= 0 && calendarGap < DAY_COUNT_LUT_LENGTH
        ? expenseGapFractionLut[calendarGap]!
        : calendarGap / EXPENSE_DAY_COUNT_BASIS

    value = value * (1 + leverage * dailyReturn)
    const financingCost = value * (leverage - 1) * (rate + financingSpread) * financingGapFraction
    value -= financingCost

    const expenseCost = value * expenseRatio * expenseGapFraction
    value -= expenseCost

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

/**
 * Candidate 2 variant (reciprocal): `calendarGap * FINANCING_RECIPROCAL` and
 * `calendarGap * EXPENSE_RECIPROCAL` instead of the two per-bar divisions. This is the ONLY
 * difference from `runBacktest`.
 *
 * NOT bit-preserving: neither 1/360 nor 1/365 is exactly representable in binary64, so this
 * variant is expected to diverge from the shipped kernel's output at the bit level, and adopting
 * it would change displayed figures.
 */
export function runBacktestDayCountReciprocal(
  params: KernelParams,
  series: KernelSeries,
  outputs: KernelOutputs,
): KernelResult {
  const { returns, shortRate, calendarDaysElapsed, contributionFlags } = series
  const { outValue, outRuined, outLongGap } = outputs
  const barCount = returns.length

  if (outValue.length < barCount || outRuined.length < barCount || outLongGap.length < barCount) {
    throw new Error(
      `runBacktestDayCountReciprocal: output arrays must be at least as long as series.returns ` +
        `(returns.length=${barCount}, outValue.length=${outValue.length}, ` +
        `outRuined.length=${outRuined.length}, outLongGap.length=${outLongGap.length})`,
    )
  }
  if (shortRate.length < barCount || calendarDaysElapsed.length < barCount || contributionFlags.length < barCount) {
    throw new Error(
      `runBacktestDayCountReciprocal: series arrays must be at least as long as series.returns ` +
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

    value = value * (1 + leverage * dailyReturn)
    const financingCost = value * (leverage - 1) * (rate + financingSpread) * (calendarGap * FINANCING_RECIPROCAL)
    value -= financingCost

    const expenseCost = value * expenseRatio * (calendarGap * EXPENSE_RECIPROCAL)
    value -= expenseCost

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

/**
 * Candidate 3 (drawdown skip): adds a `minValueSincePeak` scalar so the `1 - barValue / peakValue`
 * division is evaluated only when a bar's value is strictly below the smallest value seen since
 * the current peak was set, resetting that scalar whenever the peak advances. Every other
 * statement is identical to `runBacktest`.
 *
 * Expected bit-preserving: for a fixed positive peak, `1 - v / peak` is monotone non-increasing in
 * v under correctly-rounded IEEE division. Every skipped candidate v therefore has
 * `drawdown(v) <= drawdown(minValueSincePeak)`, and `drawdown(minValueSincePeak)` was itself
 * already compared against `maxDrawdown` at the moment `minValueSincePeak` was set (it is only
 * ever set at a site that just performed that comparison). So `maxDrawdown` after that comparison
 * already dominates every later skipped candidate's drawdown, and the running maximum is preserved
 * exactly, not approximately. The `peakValue > 0` guard is preserved verbatim.
 */
export function runBacktestDrawdownSkip(
  params: KernelParams,
  series: KernelSeries,
  outputs: KernelOutputs,
): KernelResult {
  const { returns, shortRate, calendarDaysElapsed, contributionFlags } = series
  const { outValue, outRuined, outLongGap } = outputs
  const barCount = returns.length

  if (outValue.length < barCount || outRuined.length < barCount || outLongGap.length < barCount) {
    throw new Error(
      `runBacktestDrawdownSkip: output arrays must be at least as long as series.returns ` +
        `(returns.length=${barCount}, outValue.length=${outValue.length}, ` +
        `outRuined.length=${outRuined.length}, outLongGap.length=${outLongGap.length})`,
    )
  }
  if (shortRate.length < barCount || calendarDaysElapsed.length < barCount || contributionFlags.length < barCount) {
    throw new Error(
      `runBacktestDrawdownSkip: series arrays must be at least as long as series.returns ` +
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
  let minValueSincePeak = initialInvestment

  for (let i = 0; i < barCount; i++) {
    if (i === 0) {
      outValue[0] = initialInvestment
      outRuined[0] = 0
      outLongGap[0] = 0
      if (outValue[0]! > peakValue) {
        peakValue = outValue[0]!
        minValueSincePeak = outValue[0]!
      } else if (peakValue > 0 && outValue[0]! < minValueSincePeak) {
        const drawdown = 1 - outValue[0]! / peakValue
        if (drawdown > maxDrawdown) maxDrawdown = drawdown
        minValueSincePeak = outValue[0]!
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
        minValueSincePeak = outValue[i]!
      } else if (peakValue > 0 && outValue[i]! < minValueSincePeak) {
        const drawdown = 1 - outValue[i]! / peakValue
        if (drawdown > maxDrawdown) maxDrawdown = drawdown
        minValueSincePeak = outValue[i]!
      }
      if (contributionFlags[i] === 1) {
        droppedContributionsTotal += contributionAmount
      }
      continue
    }

    const dailyReturn = returns[i] ?? 0
    const rate = shortRate[i] ?? 0

    value = value * (1 + leverage * dailyReturn)
    const financingCost = value * (leverage - 1) * (rate + financingSpread) * (calendarGap / FINANCING_DAY_COUNT_BASIS)
    value -= financingCost

    const expenseCost = value * expenseRatio * (calendarGap / EXPENSE_DAY_COUNT_BASIS)
    value -= expenseCost

    if (value <= 0) {
      value = 0
      ruined = true
      ruinBarIndex = i
      outValue[i] = 0
      outRuined[i] = 1
      if (outValue[i]! > peakValue) {
        peakValue = outValue[i]!
        minValueSincePeak = outValue[i]!
      } else if (peakValue > 0 && outValue[i]! < minValueSincePeak) {
        const drawdown = 1 - outValue[i]! / peakValue
        if (drawdown > maxDrawdown) maxDrawdown = drawdown
        minValueSincePeak = outValue[i]!
      }
      if (contributionFlags[i] === 1) {
        droppedContributionsTotal += contributionAmount
      }
      continue
    }

    if (contributionFlags[i] === 1) {
      value += contributionAmount
      totalContributed += contributionAmount
    }

    outValue[i] = value
    outRuined[i] = 0
    if (outValue[i]! > peakValue) {
      peakValue = outValue[i]!
      minValueSincePeak = outValue[i]!
    } else if (peakValue > 0 && outValue[i]! < minValueSincePeak) {
      const drawdown = 1 - outValue[i]! / peakValue
      if (drawdown > maxDrawdown) maxDrawdown = drawdown
      minValueSincePeak = outValue[i]!
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

/**
 * Candidate 4 (peel bar zero): the bar-0 anchor work is performed once before the loop, which
 * starts at `i = 1`, removing the `if (i === 0)` branch from the ~24,772-iteration body. The
 * peeled block is guarded on `barCount > 0`. No arithmetic changes from `runBacktest`.
 */
export function runBacktestPeelBarZero(
  params: KernelParams,
  series: KernelSeries,
  outputs: KernelOutputs,
): KernelResult {
  const { returns, shortRate, calendarDaysElapsed, contributionFlags } = series
  const { outValue, outRuined, outLongGap } = outputs
  const barCount = returns.length

  if (outValue.length < barCount || outRuined.length < barCount || outLongGap.length < barCount) {
    throw new Error(
      `runBacktestPeelBarZero: output arrays must be at least as long as series.returns ` +
        `(returns.length=${barCount}, outValue.length=${outValue.length}, ` +
        `outRuined.length=${outRuined.length}, outLongGap.length=${outLongGap.length})`,
    )
  }
  if (shortRate.length < barCount || calendarDaysElapsed.length < barCount || contributionFlags.length < barCount) {
    throw new Error(
      `runBacktestPeelBarZero: series arrays must be at least as long as series.returns ` +
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

  if (barCount > 0) {
    outValue[0] = initialInvestment
    outRuined[0] = 0
    outLongGap[0] = 0
    if (outValue[0]! > peakValue) {
      peakValue = outValue[0]!
    } else if (peakValue > 0) {
      const drawdown = 1 - outValue[0]! / peakValue
      if (drawdown > maxDrawdown) maxDrawdown = drawdown
    }
  }

  for (let i = 1; i < barCount; i++) {
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

    value = value * (1 + leverage * dailyReturn)
    const financingCost = value * (leverage - 1) * (rate + financingSpread) * (calendarGap / FINANCING_DAY_COUNT_BASIS)
    value -= financingCost

    const expenseCost = value * expenseRatio * (calendarGap / EXPENSE_DAY_COUNT_BASIS)
    value -= expenseCost

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

/**
 * Candidate 5 (dedup drawdown): the four duplicated copies of the drawdown-update block collapse
 * into a single site every path reaches, driven by a `barValue` scalar each path assigns before
 * reaching it. `continue` statements are restructured only as far as this requires -- no
 * arithmetic, operator, constant or comparison change from `runBacktest`.
 */
export function runBacktestDedupDrawdown(
  params: KernelParams,
  series: KernelSeries,
  outputs: KernelOutputs,
): KernelResult {
  const { returns, shortRate, calendarDaysElapsed, contributionFlags } = series
  const { outValue, outRuined, outLongGap } = outputs
  const barCount = returns.length

  if (outValue.length < barCount || outRuined.length < barCount || outLongGap.length < barCount) {
    throw new Error(
      `runBacktestDedupDrawdown: output arrays must be at least as long as series.returns ` +
        `(returns.length=${barCount}, outValue.length=${outValue.length}, ` +
        `outRuined.length=${outRuined.length}, outLongGap.length=${outLongGap.length})`,
    )
  }
  if (shortRate.length < barCount || calendarDaysElapsed.length < barCount || contributionFlags.length < barCount) {
    throw new Error(
      `runBacktestDedupDrawdown: series arrays must be at least as long as series.returns ` +
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
    let barValue: number
    let doContributionDropCheck = false

    if (i === 0) {
      outValue[0] = initialInvestment
      outRuined[0] = 0
      outLongGap[0] = 0
      barValue = outValue[0]!
    } else {
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
        barValue = outValue[i]!
        doContributionDropCheck = true
      } else {
        const dailyReturn = returns[i] ?? 0
        const rate = shortRate[i] ?? 0

        value = value * (1 + leverage * dailyReturn)
        const financingCost = value * (leverage - 1) * (rate + financingSpread) * (calendarGap / FINANCING_DAY_COUNT_BASIS)
        value -= financingCost

        const expenseCost = value * expenseRatio * (calendarGap / EXPENSE_DAY_COUNT_BASIS)
        value -= expenseCost

        if (value <= 0) {
          value = 0
          ruined = true
          ruinBarIndex = i
          outValue[i] = 0
          outRuined[i] = 1
          barValue = outValue[i]!
          doContributionDropCheck = true
        } else {
          if (contributionFlags[i] === 1) {
            value += contributionAmount
            totalContributed += contributionAmount
          }
          outValue[i] = value
          outRuined[i] = 0
          barValue = outValue[i]!
        }
      }
    }

    // Candidate 5: the single, deduplicated drawdown-update site every path above funnels into.
    if (barValue > peakValue) {
      peakValue = barValue
    } else if (peakValue > 0) {
      const drawdown = 1 - barValue / peakValue
      if (drawdown > maxDrawdown) maxDrawdown = drawdown
    }

    if (doContributionDropCheck && contributionFlags[i] === 1) {
      droppedContributionsTotal += contributionAmount
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

/**
 * Candidate 8 (combined): every bit-preserving candidate at once (1 no-guards, 2-lut day-count
 * LUT, 3 drawdown skip, 4 peeled bar zero, 5 deduplicated drawdown update, and 6 the scalar-only
 * substitution of the per-bar array writes exactly as `bench/backtest-scalar-only.ts` performs
 * it, including its four documented readback substitutions). Candidate 2's reciprocal variant is
 * NOT included: it is not bit-preserving. This is the arm the measured combined figure comes from
 * -- it is never summed or multiplied from the individual ratios, because the candidates
 * interact.
 */
export function runBacktestCombined(
  params: KernelParams,
  series: KernelSeries,
  outputs: KernelOutputs,
): KernelResult {
  const { returns, shortRate, calendarDaysElapsed, contributionFlags } = series
  const { outValue, outRuined, outLongGap } = outputs
  const barCount = returns.length

  if (outValue.length < barCount || outRuined.length < barCount || outLongGap.length < barCount) {
    throw new Error(
      `runBacktestCombined: output arrays must be at least as long as series.returns ` +
        `(returns.length=${barCount}, outValue.length=${outValue.length}, ` +
        `outRuined.length=${outRuined.length}, outLongGap.length=${outLongGap.length})`,
    )
  }
  if (shortRate.length < barCount || calendarDaysElapsed.length < barCount || contributionFlags.length < barCount) {
    throw new Error(
      `runBacktestCombined: series arrays must be at least as long as series.returns ` +
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
  let minValueSincePeak = initialInvestment

  // Candidate 4 (peel bar zero) + candidate 6 (scalar-only): bar-0's anchor work performed once,
  // the outValue[0] readback substituted with the initialInvestment scalar, guarded on
  // barCount > 0.
  if (barCount > 0) {
    if (initialInvestment > peakValue) {
      peakValue = initialInvestment
      minValueSincePeak = initialInvestment
    } else if (peakValue > 0 && initialInvestment < minValueSincePeak) {
      const drawdown = 1 - initialInvestment / peakValue
      if (drawdown > maxDrawdown) maxDrawdown = drawdown
      minValueSincePeak = initialInvestment
    }
  }

  for (let i = 1; i < barCount; i++) {
    // Candidate 1 (no-guards): `!` instead of `?? 0`.
    const calendarGap = calendarDaysElapsed[i]!
    if (calendarGap >= longGapMinDays) {
      longGapBarCount++
    }

    let barValue: number
    let doContributionDropCheck = false

    if (ruined) {
      // Candidate 6 (scalar-only): outValue[i] readback substituted with the literal 0.
      barValue = 0
      doContributionDropCheck = true
    } else {
      // Candidate 1 (no-guards): `!` instead of `?? 0`.
      const dailyReturn = returns[i]!
      const rate = shortRate[i]!

      // Candidate 2-lut: the two per-bar divisions replaced by a precomputed exact-quotient
      // lookup, bit-identical to the division by construction.
      const financingGapFraction =
        calendarGap >= 0 && calendarGap < DAY_COUNT_LUT_LENGTH
          ? financingGapFractionLut[calendarGap]!
          : calendarGap / FINANCING_DAY_COUNT_BASIS
      const expenseGapFraction =
        calendarGap >= 0 && calendarGap < DAY_COUNT_LUT_LENGTH
          ? expenseGapFractionLut[calendarGap]!
          : calendarGap / EXPENSE_DAY_COUNT_BASIS

      value = value * (1 + leverage * dailyReturn)
      const financingCost = value * (leverage - 1) * (rate + financingSpread) * financingGapFraction
      value -= financingCost

      const expenseCost = value * expenseRatio * expenseGapFraction
      value -= expenseCost

      if (value <= 0) {
        value = 0
        ruined = true
        ruinBarIndex = i
        // Candidate 6 (scalar-only): same literal-0 readback substitution as the ruined branch.
        barValue = 0
        doContributionDropCheck = true
      } else {
        if (contributionFlags[i] === 1) {
          value += contributionAmount
          totalContributed += contributionAmount
        }
        // Candidate 6 (scalar-only): outValue[i] readback substituted with the value scalar.
        barValue = value
      }
    }

    // Candidate 3 (drawdown skip) + candidate 5 (dedup drawdown): the single, deduplicated
    // drawdown-update site every path above funnels into, evaluated only when barValue beats the
    // smallest value seen since the current peak was set.
    if (barValue > peakValue) {
      peakValue = barValue
      minValueSincePeak = barValue
    } else if (peakValue > 0 && barValue < minValueSincePeak) {
      const drawdown = 1 - barValue / peakValue
      if (drawdown > maxDrawdown) maxDrawdown = drawdown
      minValueSincePeak = barValue
    }

    if (doContributionDropCheck && contributionFlags[i] === 1) {
      droppedContributionsTotal += contributionAmount
    }
  }

  // Candidate 6 (scalar-only): finalValue's outValue[barCount - 1] readback substituted with the
  // value scalar, which already equals that array element on every path.
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
