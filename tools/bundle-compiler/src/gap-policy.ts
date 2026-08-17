/**
 * tools/bundle-compiler/src/gap-policy.ts
 *
 * Gap classification and resolution for one series against the reference calendar (D-09, D-10,
 * D-11, D-12). This module owns every fatal-versus-fill decision the compiler makes about a
 * mismatch between a series' own dates and the shared reference calendar; compile.ts calls
 * `applyGapPolicy` once per loaded series and does nothing else to decide fatality.
 *
 * Classification order, applied per series:
 *   1. A date present in the series but absent from the reference calendar is an extra bar.
 *      Fatal unless an exception names that exact scope and that exact date (D-10, D-11).
 *   2. A calendar date missing from a price/total-return series, strictly inside that series'
 *      own first and last dates, is an interior price gap. Fatal unless an exception matches
 *      (D-09).
 *   3. A calendar date missing from a rate series, strictly inside its own range, is carried
 *      forward when the day-count to the next present observation is at most
 *      RATE_CARRY_FORWARD_LIMIT_DAYS; beyond that it is fatal, with no exception override (D-09).
 *   4. Calendar dates before a series' first date or after its last date are ragged edges, never
 *      a gap. A ragged right edge produces a staleness warning past the declared threshold and
 *      never an abort (D-12); a ragged left edge is always silent.
 *
 * Storage note (deviation from the plan's literal wording, documented in the plan's SUMMARY): an
 * exception-approved interior price gap is filled by carry-forward, identically to a within-limit
 * rate gap, rather than leaving the array shorter than the calendar span it covers. Plan 02-01's
 * binary format stores one `calendarStartIndex` and one contiguous `length` per series with no
 * per-value date list, so any internal gap in the middle of a series' own range must be filled to
 * keep the format's `index i -> calendar.days[calendarStartIndex + i]` invariant intact. The seam
 * record is what makes a filled day visible; it is never a fabricated number if unrecorded.
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { fromDaysSinceEpoch, hasDate, indexOfDate, toDaysSinceEpoch, type ReferenceCalendar } from './calendar.ts'
import type { RawSeries } from './raw-input.ts'
import type { SeamCollector } from './seams.ts'

/**
 * Maximum permitted difference in days-since-epoch between two adjacent rate observations before
 * the gap is fatal. D-09's stated driver is Columbus Day and Veterans Day, when the bond market
 * closes and the stock market stays open. A bond-market holiday falling on a Monday puts the
 * previous observation on the Friday and the next on the Tuesday, a difference of 4. A plain
 * weekend is 3. Four therefore admits every legitimate case D-09 names and nothing wider.
 */
export const RATE_CARRY_FORWARD_LIMIT_DAYS = 4

/**
 * A series whose last date trails the newest date in the bundle by strictly more than this many
 * calendar days emits a warning. A current daily series is at most 4 calendar days behind over a
 * long weekend, so 10 leaves real slack while still catching a refresh that failed weeks ago,
 * which is the operational failure D-12 exists to detect.
 */
export const STALENESS_WARN_DAYS = 10

export interface CalendarException {
  scope: string
  date: string
  reason: string
}

export interface GapPolicyResult {
  values: Float64Array
  calendarStartIndex: number
  firstDate: string
  lastDate: string
  warnings: string[]
}

const EXCEPTION_ALLOWED_KEYS = ['scope', 'date', 'reason'] as const
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isAllowedExceptionKey(key: string): key is (typeof EXCEPTION_ALLOWED_KEYS)[number] {
  return (EXCEPTION_ALLOWED_KEYS as ReadonlyArray<string>).includes(key)
}

/**
 * Reads `calendar-exceptions.json` from `rawDir`. Returns an empty list when the file is absent.
 * Validates each entry against the explicit three-key allowlist, building each returned object
 * key by key into a fresh literal rather than spreading the parsed value (T-02-01, T-02-10), so a
 * `__proto__` or `constructor` key in the file can never reach compiler-owned state. Throws naming
 * the entry index when `reason` is empty or whitespace, when `date` is not exactly `YYYY-MM-DD`,
 * or when an entry carries any fourth key. Matching downstream is exact string equality on both
 * scope and date: no range, no prefix, no glob (D-11).
 */
export function loadCalendarExceptions(rawDir: string): CalendarException[] {
  const filePath = path.join(rawDir, 'calendar-exceptions.json')
  if (!existsSync(filePath)) return []

  const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'))
  if (!Array.isArray(parsed)) {
    throw new Error(`compile-data: ${filePath} must contain a JSON array`)
  }

  return parsed.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`compile-data: ${filePath} entry ${index} must be a JSON object`)
    }
    const record = entry as Record<string, unknown>
    for (const key of Object.keys(record)) {
      if (!isAllowedExceptionKey(key)) {
        throw new Error(`compile-data: ${filePath} entry ${index} carries unknown key "${key}", not in the allowed field list`)
      }
    }

    const scope = record['scope']
    if (typeof scope !== 'string' || scope.length === 0) {
      throw new Error(`compile-data: ${filePath} entry ${index} is missing required string field "scope"`)
    }
    const date = record['date']
    if (typeof date !== 'string' || !ISO_DATE_PATTERN.test(date)) {
      throw new Error(`compile-data: ${filePath} entry ${index} has date "${String(date)}", expected YYYY-MM-DD`)
    }
    const reason = record['reason']
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      throw new Error(`compile-data: ${filePath} entry ${index} has an empty or whitespace "reason"`)
    }

    return { scope, date, reason }
  })
}

function matchesException(exceptions: ReadonlyArray<CalendarException>, scope: string, date: string): boolean {
  return exceptions.some((exception) => exception.scope === scope && exception.date === date)
}

/**
 * Resolves one series against the reference calendar, filling or refusing every mismatch per the
 * classification order documented at the top of this file. Collects every violation of a given
 * classification before throwing, so one compile run names everything that needs fixing rather
 * than the first offender only. `newestDate` is the newest last date across every loaded series in
 * the bundle, computed once by the caller, used only for the D-12 staleness warning.
 */
export function applyGapPolicy(
  series: RawSeries,
  calendar: ReferenceCalendar,
  exceptions: ReadonlyArray<CalendarException>,
  seams: SeamCollector,
  newestDate: string,
): GapPolicyResult {
  const scope = series.scope
  const seriesKind = series.meta.seriesKind
  const source = series.meta.source

  // --- Classification 1: extra bars ---
  const keptDates: string[] = []
  const keptValues: number[] = []
  const extraBarDates: string[] = []

  for (let i = 0; i < series.dates.length; i++) {
    const date = series.dates[i]!
    const days = toDaysSinceEpoch(date)
    if (hasDate(calendar, days)) {
      keptDates.push(date)
      keptValues.push(series.values[i]!)
    } else if (matchesException(exceptions, scope, date)) {
      // Exception-approved extra bar: dropped. Safe to drop without breaking the format's
      // contiguous-index invariant, because a non-calendar date never occupied a calendar slot.
      continue
    } else {
      extraBarDates.push(date)
    }
  }

  if (extraBarDates.length > 0) {
    const sorted = [...new Set(extraBarDates)].sort()
    throw new Error(
      `compile-data: series "${scope}/${seriesKind}" carries a bar on date(s) ${sorted.join(', ')} that the reference calendar does not contain (D-10). Dropping the bar risks deleting real data, and extending the calendar would let one vendor's bad row create a phantom trading day that cascades into false failures for every other symbol; add a scoped entry to raw/calendar-exceptions.json to accept it.`,
    )
  }

  if (keptDates.length === 0) {
    throw new Error(`compile-data: series "${scope}/${seriesKind}" has no dates remaining after removing exception-approved extra bars`)
  }

  const firstDate = keptDates[0]!
  const lastDate = keptDates[keptDates.length - 1]!
  const startIndex = indexOfDate(calendar, toDaysSinceEpoch(firstDate))
  const endIndex = indexOfDate(calendar, toDaysSinceEpoch(lastDate))
  if (startIndex === -1 || endIndex === -1) {
    throw new Error(`compile-data: series "${scope}/${seriesKind}" first/last date is not present in the reference calendar`)
  }

  const keptSet = new Set(keptDates.map(toDaysSinceEpoch))
  const valueByDays = new Map<number, number>()
  for (let i = 0; i < keptDates.length; i++) {
    valueByDays.set(toDaysSinceEpoch(keptDates[i]!), keptValues[i]!)
  }

  const isPriceKind = seriesKind === 'price' || seriesKind === 'total-return'
  const isRateKind = seriesKind === 'rate'

  const fatalGapDates: string[] = []
  const outValues: number[] = []
  let lastKnownValue: number | undefined

  let i = startIndex
  while (i <= endIndex) {
    const days = calendar.days[i]!
    if (keptSet.has(days)) {
      const value = valueByDays.get(days)!
      outValues.push(value)
      lastKnownValue = value
      i++
      continue
    }

    // Missing calendar date: gather the contiguous run of missing calendar entries.
    const runStartIdx = i
    while (i <= endIndex && !keptSet.has(calendar.days[i]!)) {
      i++
    }
    const runEndIdx = i - 1
    const runFirstDate = fromDaysSinceEpoch(calendar.days[runStartIdx]!)
    const runLastDate = fromDaysSinceEpoch(calendar.days[runEndIdx]!)
    const prevDays = calendar.days[runStartIdx - 1]!
    const nextDays = calendar.days[runEndIdx + 1]!
    const widthDays = nextDays - prevDays
    const runDates: string[] = []
    for (let d = runStartIdx; d <= runEndIdx; d++) runDates.push(fromDaysSinceEpoch(calendar.days[d]!))

    if (isRateKind) {
      if (widthDays <= RATE_CARRY_FORWARD_LIMIT_DAYS) {
        const fillValue = lastKnownValue!
        for (let d = runStartIdx; d <= runEndIdx; d++) outValues.push(fillValue)
        lastKnownValue = fillValue
        seams.add({
          kind: 'carry-forward',
          firstDate: runFirstDate,
          lastDate: runLastDate,
          sourceBefore: source,
          sourceAfter: source,
          method: `Rate-series gap of ${widthDays} day(s) carried forward by repeating the previous observation, checked against the declared ${RATE_CARRY_FORWARD_LIMIT_DAYS}-day carry-forward limit.`,
          // A bond-market holiday inside a daily source does not make that source stop being
          // daily; treating it as a degradation would collapse every strict tier to nothing.
          degradesToNonDaily: false,
        })
      } else {
        fatalGapDates.push(...runDates)
      }
      continue
    }

    if (isPriceKind) {
      const allExcepted = runDates.every((date) => matchesException(exceptions, scope, date))
      if (allExcepted) {
        const fillValue = lastKnownValue!
        for (let d = runStartIdx; d <= runEndIdx; d++) outValues.push(fillValue)
        lastKnownValue = fillValue
        seams.add({
          kind: 'carry-forward',
          firstDate: runFirstDate,
          lastDate: runLastDate,
          sourceBefore: source,
          sourceAfter: source,
          method: `Exception-approved interior gap filled by repeating the previous observation (raw/calendar-exceptions.json).`,
          // Same reasoning as the rate-series carry-forward above: a single-day fill inside an
          // otherwise-daily source is not a degradation to a lower frequency.
          degradesToNonDaily: false,
        })
      } else {
        for (const date of runDates) {
          if (!matchesException(exceptions, scope, date)) fatalGapDates.push(date)
        }
      }
      continue
    }

    // Any other series kind reaching this branch (should not happen; dividend-monthly is
    // rejected earlier in compile.ts) is treated as fatal, with no exception override.
    fatalGapDates.push(...runDates)
  }

  if (fatalGapDates.length > 0) {
    const sorted = [...new Set(fatalGapDates)].sort()
    const label = isRateKind
      ? 'a rate-series gap wider than the declared carry-forward limit'
      : 'an interior gap'
    throw new Error(
      `compile-data: series "${scope}/${seriesKind}" has ${label} on date(s) ${sorted.join(', ')} (D-09). Add a scoped entry to raw/calendar-exceptions.json to accept a specific date, or fix the raw input.`,
    )
  }

  const warnings: string[] = []
  const trailingDays = toDaysSinceEpoch(newestDate) - toDaysSinceEpoch(lastDate)
  if (trailingDays > STALENESS_WARN_DAYS) {
    warnings.push(
      `series "${scope}/${seriesKind}" last date ${lastDate} trails the newest date ${newestDate} by ${trailingDays} day(s), past the declared ${STALENESS_WARN_DAYS}-day staleness threshold (D-12)`,
    )
  }

  return { values: Float64Array.from(outValues), calendarStartIndex: startIndex, firstDate, lastDate, warnings }
}
