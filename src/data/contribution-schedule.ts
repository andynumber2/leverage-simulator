/**
 * src/data/contribution-schedule.ts
 *
 * D-25 through D-28: calendar-date-anchored contribution resolution against the compiled trading
 * calendar. Resolves a request's contribution frequency into concrete bar indices exactly once,
 * outside any per-bar loop (D-25, mirroring D-31's "computed once, not per cell" rule for
 * `calendarDaysElapsed`), using the compiled calendar's own `Int32Array` of days-since-epoch as
 * the single source of trading-day truth. This module adds no holiday-rule library and consults
 * no second calendar -- `toDaysSinceEpoch`/`fromDaysSinceEpoch` from `tools/bundle-compiler/src/
 * calendar.ts` are the only date helpers this repo has and the only ones used here.
 *
 * `src/data/kernel-inputs.ts` calls `resolveContributionBars` once per request, then
 * `buildContributionFlags` once against the resolved schedule, before the kernel's hot loop runs
 * at all -- this keeps SIM-11's allocation-free-hot-loop contract intact: a 10,000-cell sweep
 * pays this module's cost once per cell setup, never once per bar.
 */

import { fromDaysSinceEpoch, toDaysSinceEpoch } from '../../tools/bundle-compiler/src/calendar.ts'

/**
 * `none` produces an empty schedule for any entry date and any window. `daily` needs no date
 * arithmetic at all: every bar but the entry bar receives a contribution. `monthly`, `quarterly`
 * and `yearly` step 1, 3 and 12 months per period respectively, clamping the day-of-month to the
 * target month's last day (D-27) and rolling forward to the next trading day present in the
 * compiled calendar (D-26).
 */
export type ContributionFrequency = 'none' | 'daily' | 'monthly' | 'quarterly' | 'yearly'

/**
 * `barIndices` are relative to the entry bar: index 0 is always the entry bar and is never
 * present here (D-28 -- the entry bar receives the initial investment only, never a recurring
 * contribution). `nominalDates` is the same length and carries each entry's *nominal* calendar
 * date, i.e. the date before any D-26 roll-forward was applied -- kept for diagnostics and for
 * the script's printed header, so a user can check the schedule by eye against what they asked
 * for without recomputing it.
 */
export interface ContributionSchedule {
  barIndices: Int32Array
  nominalDates: readonly string[]
}

const STEP_MONTHS: Record<'monthly' | 'quarterly' | 'yearly', number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * Splits a `toDaysSinceEpoch`-compatible day number into its integer UTC year, month (1-indexed)
 * and day, via `fromDaysSinceEpoch`'s own `Date.UTC`-based construction -- reusing the one
 * time-zone-independent day-number-to-date conversion this repo has rather than re-implementing
 * the same `Date.UTC` arithmetic a second time.
 */
function ymdFromDays(days: number): { year: number; month: number; day: number } {
  const iso = fromDaysSinceEpoch(days)
  const parts = iso.split('-')
  return { year: Number(parts[0]), month: Number(parts[1]), day: Number(parts[2]) }
}

/**
 * The last day-of-month for `year`/`month` (1-indexed month), via the standard "day 0 of the next
 * month" trick: `Date.UTC` treats its month parameter as 0-indexed, so passing the 1-indexed
 * `month` value directly names the *next* month 0-indexed, and day 0 of that month is the last
 * day of the 1-indexed `month` that was actually asked for.
 */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * First index in `calendar[lo..hi]` (inclusive) whose stored day number is `>= target`, or
 * `hi + 1` when no such index exists. Standard lower-bound binary search over the ascending
 * calendar array; `resolveContributionBars` is the only caller, always with `lo`/`hi` already
 * bounded to the run window so an out-of-range target simply returns "not found" rather than
 * reading past either end (T-03-14).
 */
function lowerBound(calendar: Int32Array, lo: number, hi: number, target: number): number {
  let low = lo
  let high = hi + 1
  while (low < high) {
    const mid = (low + high) >>> 1
    const value = calendar[mid]
    if (value !== undefined && value < target) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  return low
}

/**
 * Resolves `frequency` into concrete bar indices against `calendar`, searching only
 * `[entryCalendarIndex + 1, lastCalendarIndex]` (D-28: index 0, the entry bar, is never a
 * candidate).
 *
 * `daily` returns every bar index from 1 through `lastCalendarIndex - entryCalendarIndex`
 * inclusive, with no date arithmetic at all.
 *
 * `monthly`, `quarterly` and `yearly` walk forward one period at a time in integer
 * days-since-epoch: for period `p` starting at 1, add `p * stepMonths` months to the entry's year
 * and month, clamp the day-of-month to `min(entryDayOfMonth, lastDayOfTargetMonth)` (D-27),
 * convert the clamped year/month/day back to a day number via `toDaysSinceEpoch`, then
 * binary-search the calendar slice for the first trading day on or after that nominal day (D-26).
 * The walk stops the moment a nominal date's roll-forward would land past `lastCalendarIndex`,
 * since every later period's nominal date is later still and would land past it too.
 *
 * Throws if two nominal dates resolve to the same trading bar, naming both nominal dates and the
 * shared bar's ISO date: a `Uint8Array` contribution-flag array (`buildContributionFlags` below)
 * can carry at most one contribution per bar, so a collision must fail loudly rather than
 * silently dropping the second contribution (T-03-13).
 */
export function resolveContributionBars(
  calendar: Int32Array,
  entryCalendarIndex: number,
  lastCalendarIndex: number,
  frequency: ContributionFrequency,
): ContributionSchedule {
  if (frequency === 'none') {
    return { barIndices: new Int32Array(0), nominalDates: [] }
  }

  if (frequency === 'daily') {
    const count = Math.max(0, lastCalendarIndex - entryCalendarIndex)
    const barIndices = new Int32Array(count)
    const nominalDates: string[] = new Array(count)
    for (let i = 0; i < count; i++) {
      const barIndex = i + 1
      barIndices[i] = barIndex
      const absIndex = entryCalendarIndex + barIndex
      const days = calendar[absIndex]
      nominalDates[i] = days !== undefined ? fromDaysSinceEpoch(days) : ''
    }
    return { barIndices, nominalDates }
  }

  const entryDays = calendar[entryCalendarIndex]
  if (entryDays === undefined) {
    throw new Error(
      `contribution-schedule: entryCalendarIndex ${entryCalendarIndex} is out of range for the given calendar`,
    )
  }

  // T-03-15/D-32: a value outside the declared union (reachable at runtime from an unvalidated
  // caller, even though TypeScript rejects it at compile time) fails loud rather than silently
  // producing NaN-poisoned month arithmetic below.
  const stepMonths = STEP_MONTHS[frequency]
  if (stepMonths === undefined) {
    throw new Error(
      `contribution-schedule: unknown contribution frequency "${String(frequency)}"; supported values are ` +
        `none, daily, monthly, quarterly, yearly`,
    )
  }
  const entry = ymdFromDays(entryDays)

  const barIndices: number[] = []
  const nominalDates: string[] = []

  for (let period = 1; ; period++) {
    const totalMonths = entry.month - 1 + period * stepMonths
    const targetYear = entry.year + Math.floor(totalMonths / 12)
    const targetMonth = (totalMonths % 12) + 1
    const day = Math.min(entry.day, lastDayOfMonth(targetYear, targetMonth))
    const nominalIso = `${targetYear}-${pad2(targetMonth)}-${pad2(day)}`
    const nominalDays = toDaysSinceEpoch(nominalIso)

    const resolvedAbsIndex = lowerBound(calendar, entryCalendarIndex + 1, lastCalendarIndex, nominalDays)
    if (resolvedAbsIndex > lastCalendarIndex) {
      // This nominal date's roll-forward lands past the window's last bar; every later period's
      // nominal date is later still, so no further period can ever be scheduled either.
      break
    }

    const barIndex = resolvedAbsIndex - entryCalendarIndex
    const previousBarIndex = barIndices[barIndices.length - 1]
    if (previousBarIndex !== undefined && barIndex <= previousBarIndex) {
      const sharedDays = calendar[resolvedAbsIndex]
      const sharedDate = sharedDays !== undefined ? fromDaysSinceEpoch(sharedDays) : `abs index ${resolvedAbsIndex}`
      const previousNominal = nominalDates[nominalDates.length - 1]
      throw new Error(
        `contribution-schedule: nominal dates "${previousNominal}" and "${nominalIso}" both resolve to ` +
          `trading bar ${resolvedAbsIndex} (${sharedDate}); a contribution flag can carry at most one ` +
          `contribution per bar`,
      )
    }

    barIndices.push(barIndex)
    nominalDates.push(nominalIso)
  }

  return { barIndices: Int32Array.from(barIndices), nominalDates }
}

/**
 * Allocates one `Uint8Array` of `barCount`, writing 1 at every index `schedule.barIndices` names.
 * Allocates exactly once, outside any per-bar loop the kernel will run -- what keeps SIM-11's
 * allocation-free hot-loop contract intact for the contribution path specifically.
 */
export function buildContributionFlags(barCount: number, schedule: ContributionSchedule): Uint8Array {
  const flags = new Uint8Array(barCount)
  for (const barIndex of schedule.barIndices) {
    flags[barIndex] = 1
  }
  return flags
}
