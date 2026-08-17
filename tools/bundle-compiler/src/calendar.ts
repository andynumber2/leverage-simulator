/**
 * tools/bundle-compiler/src/calendar.ts
 *
 * Reference calendar derivation from the longest daily series and index lookup (D-08, Pattern
 * 2). Does not consult a holiday-rule library and does not synthesize a date that no input
 * carries.
 */

import type { RawSeries } from './raw-input.ts'

export interface ReferenceCalendar {
  days: Int32Array
}

const MS_PER_DAY = 86_400_000

/**
 * Time-zone-independent day count since the Unix epoch: `toDaysSinceEpoch('1970-01-01')` is `0`,
 * `toDaysSinceEpoch('1970-01-02')` is `1`. Parses with `Date.UTC` on the three integer
 * components, never the process's local time zone.
 */
export function toDaysSinceEpoch(iso: string): number {
  const parts = iso.split('-')
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY)
}

/** Inverts `toDaysSinceEpoch`. */
export function fromDaysSinceEpoch(days: number): string {
  const date = new Date(days * MS_PER_DAY)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Selects the `price`-kind input with the earliest first date and the greatest row count, and
 * builds the reference calendar from that series' own dates in ascending order. Throws if no
 * price-kind input exists.
 */
export function deriveCalendar(inputs: ReadonlyArray<RawSeries>): ReferenceCalendar {
  const priceInputs = inputs.filter((series) => series.meta.seriesKind === 'price')
  if (priceInputs.length === 0) {
    throw new Error('compile-data: no price-kind series found to derive the reference calendar from')
  }

  let best = priceInputs[0]!
  for (const candidate of priceInputs.slice(1)) {
    const candidateFirst = candidate.dates[0]
    const bestFirst = best.dates[0]
    if (candidateFirst === undefined || bestFirst === undefined) continue
    if (candidateFirst < bestFirst) {
      best = candidate
    } else if (candidateFirst === bestFirst && candidate.dates.length > best.dates.length) {
      best = candidate
    }
  }

  const days = Int32Array.from(best.dates.map(toDaysSinceEpoch))
  return { days }
}

/** Binary search over the ascending calendar array. Returns -1 when `days` is absent. */
export function indexOfDate(calendar: ReferenceCalendar, days: number): number {
  let lo = 0
  let hi = calendar.days.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const value = calendar.days[mid]!
    if (value === days) return mid
    if (value < days) {
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return -1
}
