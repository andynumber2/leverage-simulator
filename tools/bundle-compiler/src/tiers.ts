/**
 * tools/bundle-compiler/src/tiers.ts
 *
 * Computes the strict and extended date range for one (scope, dividend mode) pair by scanning
 * seam records, never by a hand-declared literal (D-14, D-16, ROADMAP.md criterion 3, DATA-05).
 */

import { fromDaysSinceEpoch, toDaysSinceEpoch } from './calendar.ts'
import type { DateRange } from './manifest.ts'
import type { SeamRecord } from './seams.ts'

export interface TierRanges {
  strict: DateRange | null
  extended: DateRange | null
}

function intersectRanges(a: DateRange, b: DateRange): DateRange | null {
  const firstDate = a.firstDate > b.firstDate ? a.firstDate : b.firstDate
  const lastDate = a.lastDate < b.lastDate ? a.lastDate : b.lastDate
  if (firstDate > lastDate) return null
  return { firstDate, lastDate }
}

/**
 * `extended` is the intersection of the pair's own date range with the rate series' date range.
 * `strict` narrows `extended` at the front past every seam with `degradesToNonDaily` true on
 * either the pair's own series or the rate series: `strict.firstDate` is the day after the latest
 * such seam's `lastDate` that overlaps `extended`, or `extended.firstDate` when no such seam
 * overlaps. `strict.lastDate` always equals `extended.lastDate`. When the narrowed start would
 * fall after `extended.lastDate`, `strict` is `null`, never a zero-length or inverted range.
 */
export function computeTierRanges(
  pairSeams: ReadonlyArray<SeamRecord>,
  rateSeams: ReadonlyArray<SeamRecord>,
  pairRange: DateRange,
  rateRange: DateRange,
): TierRanges {
  const extended = intersectRanges(pairRange, rateRange)
  if (extended === null) {
    return { strict: null, extended: null }
  }

  let latestDegradingLastDate: string | undefined
  for (const seam of [...pairSeams, ...rateSeams]) {
    if (!seam.degradesToNonDaily) continue
    // Only a seam whose range overlaps the extended range can push the strict start forward.
    if (seam.lastDate < extended.firstDate || seam.firstDate > extended.lastDate) continue
    if (latestDegradingLastDate === undefined || seam.lastDate > latestDegradingLastDate) {
      latestDegradingLastDate = seam.lastDate
    }
  }

  if (latestDegradingLastDate === undefined) {
    return { strict: { ...extended }, extended }
  }

  const strictFirstDate = fromDaysSinceEpoch(toDaysSinceEpoch(latestDegradingLastDate) + 1)
  if (strictFirstDate > extended.lastDate) {
    return { strict: null, extended }
  }
  return { strict: { firstDate: strictFirstDate, lastDate: extended.lastDate }, extended }
}
