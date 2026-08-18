/**
 * tests/kernel/fixtures.ts
 *
 * Shared hand-built-input helpers for tests/kernel/pitfalls-a.test.ts and tests/kernel/ruin.test.ts
 * (03-02-PLAN.md Task 1). Mirrors tests/kernel.test.ts's makeFixedSeries/baseParams pair, updated
 * for src/kernel/backtest.ts's real KernelSeries/KernelParams/KernelOutputs contract. This file is
 * a helper module, not a suite: it carries no `test()` call and does not end in `.test.ts`, so the
 * `unit` project's `tests/**\/*.test.ts` glob does not collect it.
 */

import { LONG_GAP_FLAG_MIN_DAYS, type KernelOutputs, type KernelParams, type KernelSeries } from '../../src/kernel/backtest.types.ts'

/**
 * Builds a `KernelSeries` from plain number arrays. `contributionFlags` defaults to an
 * all-zero array the same length as `returns` when omitted, matching the common case of a
 * run with no recurring contribution schedule under test.
 */
export function makeKernelSeries(
  returns: number[],
  shortRate: number[],
  calendarDaysElapsed: number[],
  contributionFlags?: number[],
): KernelSeries {
  return {
    returns: Float64Array.from(returns),
    shortRate: Float64Array.from(shortRate),
    calendarDaysElapsed: Int32Array.from(calendarDaysElapsed),
    contributionFlags: Uint8Array.from(contributionFlags ?? returns.map(() => 0)),
  }
}

/**
 * Defaults to leverage 3, a $10,000 initial investment, no recurring contribution, zero
 * financing spread, zero expense ratio, and `longGapMinDays` sourced from the kernel's own
 * `LONG_GAP_FLAG_MIN_DAYS` constant (D-04) rather than a re-typed literal.
 */
export function baseKernelParams(overrides: Partial<KernelParams> = {}): KernelParams {
  return {
    leverage: 3,
    initialInvestment: 10_000,
    contributionAmount: 0,
    financingSpread: 0,
    expenseRatio: 0,
    longGapMinDays: LONG_GAP_FLAG_MIN_DAYS,
    ...overrides,
  }
}

/** Preallocates the three caller-owned output arrays `runBacktest` writes into (SIM-11). */
export function makeOutputs(length: number): KernelOutputs {
  return {
    outValue: new Float64Array(length),
    outRuined: new Uint8Array(length),
    outLongGap: new Uint8Array(length),
  }
}
