/**
 * bench/kernel.ts — Task 1: the allocation-free per-bar leveraged recurrence, including the
 * branchy parts (PITFALLS A1, A2, A4, A7, A8; CONTEXT D-12). This is throwaway spike code — the
 * real kernel is Phase 3's — but it must carry the same branches Phase 3's kernel will, so the
 * measured PERF-02/PERF-03 figures are not flattered by a stripped arithmetic loop.
 *
 * Day-count convention (PITFALLS A4/A8, deliberately two different bases, not conflated):
 * - Financing accrues on a 365-calendar-day basis: `(leverage-1) * (shortRate+spread) *
 *   (calendarDaysElapsed/365)`, so a bar following a weekend or holiday cluster is charged for
 *   every elapsed calendar day, not just the one trading day the bar represents.
 * - The expense ratio accrues on the flat 252-trading-day convention every bar, regardless of
 *   the calendar gap: `expenseRatio/252`.
 *
 * Ruin (PITFALLS A7): the instant a bar's computed value would reach or cross zero, the position
 * clamps to exactly 0, the bar's ruin flag (and every subsequent bar's) is set, and no further
 * compounding or contribution can move the value away from 0.
 *
 * Allocation discipline (PITFALLS F1/F2): every accumulator is a preallocated `Float64Array`/
 * `Uint8Array` supplied by the caller; the ruin flag lives in a separate `Uint8Array` rather than
 * a sentinel value mixed into the value array; no object, array, or boxed value is created
 * inside the per-bar loop.
 */

import type { SyntheticSeries } from './synthetic-data.ts'

/** 200 x 50 = 10,000 cells, the PERF-03 sweep size. */
export const SWEEP_COLS = 200
export const SWEEP_ROWS = 50

const TRADING_DAYS_PER_YEAR = 252
const CALENDAR_DAYS_PER_YEAR = 365

export interface SpikeKernelParams {
  leverage: number
  entryIndex: number
  initialInvestment: number
  contributionAmount: number
  /** 0 disables contributions entirely. */
  contributionIntervalBars: number
  financingSpread: number
  expenseRatio: number
}

export interface SpikeKernelResult {
  /** The last written bar's value (post-clamp if ruined). */
  finalValue: number
  ruined: boolean
}

/**
 * Runs one full leveraged backtest over `series` starting at `params.entryIndex`. Writes the
 * per-bar value into `outValue` and the per-bar ruin flag into `outRuined`, both indexed relative
 * to `entryIndex` (index 0 of the output corresponds to `series` index `entryIndex`). Both output
 * arrays must be preallocated by the caller and sized at least `series.returns.length -
 * entryIndex`; nothing is allocated inside this function.
 */
export function runSpikeBacktest(
  params: SpikeKernelParams,
  series: SyntheticSeries,
  outValue: Float64Array,
  outRuined: Uint8Array,
): SpikeKernelResult {
  const { returns, shortRate, calendarDaysElapsed } = series
  const barCount = returns.length
  const {
    leverage,
    entryIndex,
    initialInvestment,
    contributionAmount,
    contributionIntervalBars,
    financingSpread,
    expenseRatio,
  } = params

  let value = initialInvestment
  let ruined = false
  let lastOutIdx = -1

  for (let i = entryIndex; i < barCount; i++) {
    const outIdx = i - entryIndex
    lastOutIdx = outIdx

    if (ruined) {
      outValue[outIdx] = 0
      outRuined[outIdx] = 1
      continue
    }

    const dailyReturn = returns[i] ?? 0
    const rate = shortRate[i] ?? 0
    const calendarGap = calendarDaysElapsed[i] ?? 1

    // A1: leverage applied to the daily return and compounded — never to a cumulative return.
    value = value * (1 + leverage * dailyReturn)

    // A2/A8: financing on the borrowed portion (leverage - 1), calendar-day accrual. At
    // leverage 1 this term is structurally zero (A10), not just arithmetically small.
    if (leverage > 1) {
      const financingCost =
        value * (leverage - 1) * (rate + financingSpread) * (calendarGap / CALENDAR_DAYS_PER_YEAR)
      value -= financingCost
    }

    // A4: expense ratio on the flat trading-day convention — a genuinely different accrual
    // basis from financing, applied every bar regardless of calendar gap.
    value -= value * (expenseRatio / TRADING_DAYS_PER_YEAR)

    // A7: ruin clamp — the instant the computed value would reach or cross zero.
    if (value <= 0) {
      value = 0
      ruined = true
      outValue[outIdx] = 0
      outRuined[outIdx] = 1
      continue
    }

    // Contribution added after the ruin check, so a contribution on the ruin bar itself can
    // never resurrect the position; subsequent bars are caught by the `ruined` branch above.
    if (
      contributionIntervalBars > 0 &&
      outIdx > 0 &&
      outIdx % contributionIntervalBars === 0
    ) {
      value += contributionAmount
    }

    outValue[outIdx] = value
    outRuined[outIdx] = 0
  }

  const finalValue = lastOutIdx >= 0 ? outValue[lastOutIdx] ?? 0 : initialInvestment
  return { finalValue, ruined }
}

// --- Sweep cell -> params mapping --------------------------------------------------------------
// Shared by bench/sweep.worker.ts (per-cell computation) and bench/sweep.bench.test.ts (the
// serial reference), so there is exactly one mapping from a sweep grid position to backtest
// parameters. Not a production feature — Phase 7 owns the real entry-date x leverage sweep UI;
// this exists only so PERF-03's measured sweep does real, varied, ruin-capable work rather than
// running 10,000 identical backtests.

const LEVERAGE_MIN = 1
const LEVERAGE_MAX = 20
const DEFAULT_FINANCING_SPREAD = 0.005
const DEFAULT_EXPENSE_RATIO = 0.0095
const DEFAULT_INITIAL_INVESTMENT = 10_000

/**
 * Row sweeps leverage from LEVERAGE_MIN to LEVERAGE_MAX; column sweeps entryIndex across the
 * first SWEEP_COLS bars (0..199 of 25,000), so every cell's backtest still spans ~99.2%+ of the
 * full series — close enough to "10,000 backtests over ~25,000 daily bars each" that the
 * measured PERF-03 figure is not meaningfully flattered by shorter-than-representative cells.
 */
export function paramsForCell(row: number, col: number): SpikeKernelParams {
  const leverage =
    SWEEP_ROWS > 1
      ? LEVERAGE_MIN + (row / (SWEEP_ROWS - 1)) * (LEVERAGE_MAX - LEVERAGE_MIN)
      : LEVERAGE_MIN
  return {
    leverage,
    entryIndex: col,
    initialInvestment: DEFAULT_INITIAL_INVESTMENT,
    contributionAmount: 0,
    contributionIntervalBars: 0,
    financingSpread: DEFAULT_FINANCING_SPREAD,
    expenseRatio: DEFAULT_EXPENSE_RATIO,
  }
}
