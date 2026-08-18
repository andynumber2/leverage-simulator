/**
 * src/kernel/backtest.types.ts
 *
 * SIM-10/D-30: the simulation kernel's typed-array-and-scalar-only boundary contract. Every
 * export in this file is a type or one of the three declared constants below; there is no
 * runtime logic here. `src/kernel/backtest.ts` type-imports these shapes only (SIM-10: the
 * kernel imports nothing from the data, sweep or chart layers) and re-declares the two numeric
 * day-count constants locally rather than importing them at runtime, so the kernel module itself
 * carries zero runtime imports at all.
 */

/**
 * The per-run input series, already sliced to the run window by the caller (D-30: the kernel
 * accepts typed arrays and scalars only, never a bundle handle or an entry index). Every array
 * has the same length as the run window; index 0 is the entry bar (D-03).
 */
export interface KernelSeries {
  /** Daily price/total return for the underlying. Index 0 is unused: the entry bar applies no
   * return (D-03). */
  returns: Float64Array
  /** Annualized short rate as a FRACTION, never a percentage (D-09) -- the caller divides the
   * bundle's percent-annualized units by 100 exactly once, before this array is built. */
  shortRate: Float64Array
  /** Calendar days elapsed since the prior bar. Index 0 is 0, because the entry bar accrues
   * nothing (D-03, D-31): precomputed once by the caller from the compiled calendar asset. */
  calendarDaysElapsed: Int32Array
  /** 1 when a scheduled contribution lands on this bar, else 0. Date-to-bar-index resolution
   * (D-25/D-26/D-27) happens once, outside the kernel; the kernel only reads this flag. */
  contributionFlags: Uint8Array
}

/**
 * `financingSpread` and `expenseRatio` are annualized FRACTIONS, never percentages (D-09): the
 * caller converts. `longGapMinDays` mirrors `LONG_GAP_FLAG_MIN_DAYS` below but is carried as a
 * parameter (not read as a kernel-side constant), so the kernel never imports it at runtime while
 * still letting the data layer source it from one place.
 */
export interface KernelParams {
  leverage: number
  initialInvestment: number
  contributionAmount: number
  financingSpread: number
  expenseRatio: number
  longGapMinDays: number
}

/**
 * All three arrays are caller-preallocated to the run-window length (SIM-11: `runBacktest`
 * allocates nothing internally). The ruin flag lives in its own array, never a sentinel value
 * mixed into `outValue` (D-22).
 */
export interface KernelOutputs {
  outValue: Float64Array
  outRuined: Uint8Array
  /** 1 when `calendarDaysElapsed[i] >= longGapMinDays`, else 0 (D-04). */
  outLongGap: Uint8Array
}

/** The small summary object `runBacktest` builds once, after the loop. */
export interface KernelResult {
  /** The last written bar's value (post-clamp if ruined). */
  finalValue: number
  ruined: boolean
  /** The first bar index where `value <= 0` was evaluated as true; -1 when the run never ruined
   * (D-22). */
  ruinBarIndex: number
  /** Contributions scheduled at or after the ruin bar that were never invested (D-21). */
  droppedContributionsTotal: number
  /** The initial investment plus every contribution actually applied (D-28). */
  totalContributed: number
  /** Count of bars whose `calendarDaysElapsed >= longGapMinDays` (D-04). */
  longGapBarCount: number
  barCount: number
}

/**
 * D-04: the outsized-calendar-closure flag threshold, inclusive. Only the 1933 bank holiday
 * (12 days) and the 2001 closure (7 days) clear it in the compiled calendar; ordinary 3- and
 * 4-day holiday weekends do not.
 */
export const LONG_GAP_FLAG_MIN_DAYS = 6

/**
 * D-01: financing accrues on actual/360, the USD money-market convention that real swap
 * financing uses -- deliberately a different basis from the expense ratio below.
 */
export const FINANCING_DAY_COUNT_BASIS = 360

/**
 * D-02: the expense ratio accrues on actual/365, matching how fund prospectuses accrue the
 * annual figure daily -- deliberately a different basis from financing above, never conflated.
 */
export const EXPENSE_DAY_COUNT_BASIS = 365
