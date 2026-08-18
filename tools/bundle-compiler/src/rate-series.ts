/**
 * tools/bundle-compiler/src/rate-series.ts
 *
 * Splices the four locked rate source raw stems into one daily short-rate series spanning the
 * full range every tier needs (D-04, D-13, D-16, DATA-04). Every source hand-off and every
 * monthly-to-daily interpolated run is recorded as a typed seam.
 *
 * Precedence rule: each source owns its entire own date range. A lower-precedence source is used
 * only for calendar dates strictly before the first date of every higher-precedence source, never
 * interleaved with one. Every boundary is read from the loaded data's own first dates, never
 * hardcoded, which is what resolves RATE-NBER and RATE-TB3MS's three-month overlap by
 * construction: RATE-TB3MS owns its whole range and RATE-NBER is used strictly before it begins.
 */

import { RATE_CARRY_FORWARD_LIMIT_DAYS } from './gap-policy.ts'
import { fromDaysSinceEpoch, toDaysSinceEpoch, type ReferenceCalendar } from './calendar.ts'
import type { RawSeries } from './raw-input.ts'
import type { SeamCollector } from './seams.ts'

/** Highest precedence first (plan 02-04 `<interfaces>` table). */
export const RATE_SOURCE_PRECEDENCE = ['RATE-DFF', 'RATE-DTB3', 'RATE-TB3MS', 'RATE-NBER'] as const

export type RateSourceStem = (typeof RATE_SOURCE_PRECEDENCE)[number]

/** The two monthly-native sources among RATE_SOURCE_PRECEDENCE; interpolated to daily. */
const MONTHLY_STEMS = new Set<RateSourceStem>(['RATE-TB3MS', 'RATE-NBER'])

interface MonthlyAnchor {
  days: number
  value: number
}

/**
 * Linear interpolation between the two bracketing monthly anchors, one value per calendar date at
 * `calendar.days[firstIndex..lastIndex]`. Dates before the first anchor or after the last are not
 * extrapolated: callers must bound `firstIndex`/`lastIndex` to fall within the anchors' own date
 * range. The value at an anchor's own date equals that anchor's value exactly.
 */
export function interpolateMonthlyToDaily(
  monthlyRows: ReadonlyArray<{ date: string; value: number }>,
  calendar: ReferenceCalendar,
  firstIndex: number,
  lastIndex: number,
): Float64Array {
  if (monthlyRows.length === 0) {
    throw new Error('compile-data: interpolateMonthlyToDaily received zero monthly anchor rows')
  }
  const anchors: MonthlyAnchor[] = monthlyRows.map((row) => ({ days: toDaysSinceEpoch(row.date), value: row.value }))
  const out = new Float64Array(Math.max(0, lastIndex - firstIndex + 1))

  let a = 0
  for (let i = firstIndex; i <= lastIndex; i++) {
    const days = calendar.days[i]!
    while (a + 1 < anchors.length && anchors[a + 1]!.days <= days) a++
    const before = anchors[a]!
    const after = anchors[Math.min(a + 1, anchors.length - 1)]!

    let value: number
    if (days <= before.days || before.days === after.days) {
      value = before.value
    } else if (days >= after.days) {
      value = after.value
    } else {
      const t = (days - before.days) / (after.days - before.days)
      value = before.value + t * (after.value - before.value)
    }
    out[i - firstIndex] = value
  }
  return out
}

function assertStrictlyAscendingNoDuplicates(series: RawSeries): void {
  for (let i = 1; i < series.dates.length; i++) {
    if (series.dates[i]! === series.dates[i - 1]!) {
      throw new Error(
        `compile-data: rate input "${series.rawStem}" carries date "${series.dates[i]!}" twice from the same source (D-04)`,
      )
    }
    if (series.dates[i]! < series.dates[i - 1]!) {
      throw new Error(
        `compile-data: rate input "${series.rawStem}" is not strictly ascending at date "${series.dates[i]!}" (D-04)`,
      )
    }
  }
}

function dayBefore(iso: string): string {
  return fromDaysSinceEpoch(toDaysSinceEpoch(iso) - 1)
}

interface RankWindow {
  stem: RateSourceStem
  series: RawSeries
  isMonthly: boolean
  /** Inclusive date range this rank is actually used for, per the precedence rule. */
  windowFirstDate: string
  windowLastDate: string
}

function computeRankWindows(ranked: ReadonlyArray<RawSeries>): RankWindow[] {
  return ranked.map((series, r) => {
    const stem = RATE_SOURCE_PRECEDENCE[r]!
    const ownFirst = series.dates[0]!
    const ownLast = series.dates[series.dates.length - 1]!

    let cutoff: string | undefined
    for (let h = 0; h < r; h++) {
      const higherFirst = ranked[h]!.dates[0]!
      if (cutoff === undefined || higherFirst < cutoff) cutoff = higherFirst
    }
    const windowLastDate = cutoff === undefined ? ownLast : dayBefore(cutoff)

    return { stem, series, isMonthly: MONTHLY_STEMS.has(stem), windowFirstDate: ownFirst, windowLastDate }
  })
}

function findWindowForDate(windows: ReadonlyArray<RankWindow>, date: string): RankWindow | undefined {
  return windows.find((w) => date >= w.windowFirstDate && date <= w.windowLastDate)
}

export interface ShortRateSeriesResult {
  values: Float64Array
  calendarStartIndex: number
}

/**
 * Builds one daily short-rate series spanning the reference calendar's own trading days, spliced
 * from the four rate sources in `RATE_SOURCE_PRECEDENCE` order. `rateInputs` must contain exactly
 * the four raw stems in `RATE_SOURCE_PRECEDENCE` (any order, matched by `rawStem`); each must carry
 * at least one row and strictly ascending dates with no duplicates.
 */
export function buildShortRateSeries(
  rateInputs: ReadonlyArray<RawSeries>,
  calendar: ReferenceCalendar,
  seams: SeamCollector,
): ShortRateSeriesResult {
  const byStem = new Map<string, RawSeries>()
  for (const input of rateInputs) byStem.set(input.rawStem, input)

  const ranked: RawSeries[] = RATE_SOURCE_PRECEDENCE.map((stem) => {
    const found = byStem.get(stem)
    if (found === undefined) {
      throw new Error(`compile-data: rate source "${stem}" is missing from the loaded rate inputs (D-04)`)
    }
    if (found.dates.length === 0) {
      throw new Error(`compile-data: rate input "${stem}" has zero data rows (D-04)`)
    }
    assertStrictlyAscendingNoDuplicates(found)
    return found
  })

  const windows = computeRankWindows(ranked)

  // Splice seams: one per adjacent used hand-off, from the deepest (lowest-precedence, oldest)
  // rank forward. windows[] is already in precedence order (index 0 = highest precedence), so the
  // hand-off from rank r+1 (before, lower precedence) to rank r (after, higher precedence) is
  // recorded once per adjacent pair, in chronological (oldest-first) order.
  for (let r = windows.length - 1; r > 0; r--) {
    const before = windows[r]!
    const after = windows[r - 1]!
    seams.add({
      kind: 'splice',
      firstDate: before.windowFirstDate,
      lastDate: before.windowLastDate,
      sourceBefore: before.stem,
      sourceAfter: after.stem,
      method: `Rate source hand-off from "${before.stem}" to "${after.stem}" at "${after.stem}"'s own first date (${after.series.dates[0]!}), per the declared rate source precedence order (D-04).`,
      degradesToNonDaily: before.isMonthly,
    })
  }

  // Interpolation seams: one per monthly-kind rank's whole used window.
  for (const window of windows) {
    if (!window.isMonthly) continue
    seams.add({
      kind: 'interpolation',
      firstDate: window.windowFirstDate,
      lastDate: window.windowLastDate,
      sourceBefore: window.stem,
      sourceAfter: window.stem,
      method: `Linear interpolation of "${window.stem}"'s monthly observations to daily, bounded by its own month-anchor dates.`,
      degradesToNonDaily: true,
    })
  }

  // Pre-index each daily source's own dates for fast exact-date lookup, and precompute each
  // monthly source's interpolated values across its own window in one pass.
  const dailyValueByDate = new Map<string, Map<string, number>>()
  const monthlyValueByDate = new Map<string, Map<string, number>>()
  for (const window of windows) {
    if (window.isMonthly) {
      const wFirstIdx = firstCalendarIndexOnOrAfter(calendar, window.windowFirstDate)
      const wLastIdx = lastCalendarIndexOnOrBefore(calendar, window.windowLastDate)
      const map = new Map<string, number>()
      if (wFirstIdx !== undefined && wLastIdx !== undefined && wFirstIdx <= wLastIdx) {
        const rows = window.series.dates.map((date, i) => ({ date, value: window.series.values[i]! }))
        const interpolated = interpolateMonthlyToDaily(rows, calendar, wFirstIdx, wLastIdx)
        for (let i = wFirstIdx; i <= wLastIdx; i++) {
          map.set(fromDaysSinceEpoch(calendar.days[i]!), interpolated[i - wFirstIdx]!)
        }
      }
      monthlyValueByDate.set(window.stem, map)
    } else {
      const map = new Map<string, number>()
      for (let i = 0; i < window.series.dates.length; i++) map.set(window.series.dates[i]!, window.series.values[i]!)
      dailyValueByDate.set(window.stem, map)
    }
  }

  // Walk every calendar trading day in order, assigning the value from whichever rank's window
  // covers it. Coverage is contiguous by construction (the windows partition the covered range
  // with no gap); once coverage begins and then stops (e.g. past the most-current source's own
  // last date), that is the natural end of the compiled rate series, not an error.
  const outValues: number[] = []
  let calendarStartIndex: number | undefined
  const lastDailyValueByStem = new Map<string, { date: string; value: number }>()
  let carryRunStart: { stem: string; firstDate: string } | undefined
  let carryRunLastDate: string | undefined

  function flushCarryRun(): void {
    if (carryRunStart === undefined || carryRunLastDate === undefined) return
    seams.add({
      kind: 'carry-forward',
      firstDate: carryRunStart.firstDate,
      lastDate: carryRunLastDate,
      sourceBefore: carryRunStart.stem,
      sourceAfter: carryRunStart.stem,
      method: `Rate source "${carryRunStart.stem}" gap carried forward by repeating the previous observation, checked against the declared ${RATE_CARRY_FORWARD_LIMIT_DAYS}-day carry-forward limit.`,
      degradesToNonDaily: false,
    })
    carryRunStart = undefined
    carryRunLastDate = undefined
  }

  for (let i = 0; i < calendar.days.length; i++) {
    const date = fromDaysSinceEpoch(calendar.days[i]!)
    const window = findWindowForDate(windows, date)
    if (window === undefined) {
      if (calendarStartIndex !== undefined) {
        // Coverage started and has now ended (the deepest-ranked source used has no more data
        // past this point) -- the natural end of the compiled rate series, not an error.
        break
      }
      continue
    }
    if (calendarStartIndex === undefined) calendarStartIndex = i

    let value: number
    if (window.isMonthly) {
      flushCarryRun()
      value = monthlyValueByDate.get(window.stem)!.get(date)!
    } else {
      const exact = dailyValueByDate.get(window.stem)!.get(date)
      if (exact !== undefined) {
        flushCarryRun()
        value = exact
        lastDailyValueByStem.set(window.stem, { date, value })
      } else {
        const last = lastDailyValueByStem.get(window.stem)
        if (last === undefined) {
          throw new Error(
            `compile-data: rate source "${window.stem}" has no observation on or before "${date}" within its own used window (D-04)`,
          )
        }
        const gapDays = toDaysSinceEpoch(date) - toDaysSinceEpoch(last.date)
        if (gapDays > RATE_CARRY_FORWARD_LIMIT_DAYS) {
          throw new Error(
            `compile-data: rate source "${window.stem}" has a gap wider than the declared ${RATE_CARRY_FORWARD_LIMIT_DAYS}-day carry-forward limit ending on "${date}" (D-04)`,
          )
        }
        value = last.value
        if (carryRunStart === undefined || carryRunStart.stem !== window.stem) {
          flushCarryRun()
          carryRunStart = { stem: window.stem, firstDate: date }
        }
        carryRunLastDate = date
      }
    }
    outValues.push(value)
  }
  flushCarryRun()

  if (calendarStartIndex === undefined) {
    throw new Error('compile-data: no calendar date is covered by any rate source (D-04)')
  }

  return { values: Float64Array.from(outValues), calendarStartIndex }
}

function firstCalendarIndexOnOrAfter(calendar: ReferenceCalendar, date: string): number | undefined {
  const target = toDaysSinceEpoch(date)
  for (let i = 0; i < calendar.days.length; i++) {
    if (calendar.days[i]! >= target) return i
  }
  return undefined
}

function lastCalendarIndexOnOrBefore(calendar: ReferenceCalendar, date: string): number | undefined {
  const target = toDaysSinceEpoch(date)
  let result: number | undefined
  for (let i = 0; i < calendar.days.length; i++) {
    if (calendar.days[i]! <= target) result = i
    else break
  }
  return result
}
