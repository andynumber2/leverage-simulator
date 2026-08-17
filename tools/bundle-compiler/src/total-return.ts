/**
 * tools/bundle-compiler/src/total-return.ts
 *
 * Constructs the pre-real-total-return portion of a scope's total-return series from daily price
 * return plus a dividend yield interpolated from a monthly input, spliced to the real daily
 * total-return series at its own first date (D-15, D-16, D-20). Applies generically wherever a
 * monthly yield input exists for a scope; in the current universe that is the S&P alone.
 *
 * Day-count convention: the dividend contribution for a bar equals the interpolated annualized
 * yield for that bar's own date, times calendar days elapsed since the previous trading day,
 * divided by 365 -- calendar-day accrual, matching SIM-03's convention. A bar following a
 * three-calendar-day weekend accrues three days of dividend, not one trading day's worth. Phase 3
 * inherits this exact convention rather than choosing its own.
 */

import { fromDaysSinceEpoch, indexOfDate, toDaysSinceEpoch, type ReferenceCalendar } from './calendar.ts'
import { interpolateMonthlyToDaily } from './rate-series.ts'
import type { RawSeries } from './raw-input.ts'
import type { SeamCollector } from './seams.ts'

/** The minimal shape `buildTotalReturnSeries` needs for its two input series: an already
 * calendar-aligned (gap-policy-resolved) run of daily values, plus the raw stem name it came from
 * (used only to label the seam records it produces). */
export interface AlignedInputSeries {
  values: Float64Array
  calendarStartIndex: number
  firstDate: string
  lastDate: string
  sourceName: string
}

export interface TotalReturnResult {
  values: Float64Array
  calendarStartIndex: number
}

function firstCalendarIndexOnOrAfter(calendar: ReferenceCalendar, days: number): number | undefined {
  for (let i = 0; i < calendar.days.length; i++) {
    if (calendar.days[i]! >= days) return i
  }
  return undefined
}

/**
 * Throws naming `scope` when neither a real total-return input nor a dividend-monthly input is
 * available for it, so no scope's compiled bundle silently ships a price-return series under a
 * total-return id. No symbol in the current universe reaches this branch (every one carries a
 * real total-return raw input, per plans 02-06/02-07); it guards against a future symbol added
 * without one.
 */
export function assertTotalReturnSourceExists(scope: string, hasRealTotalReturn: boolean, hasDividendInput: boolean): void {
  if (!hasRealTotalReturn && !hasDividendInput) {
    throw new Error(
      `compile-data: scope "${scope}" has neither a real total-return raw input nor a dividend-monthly input to construct one from; refusing to emit its price-return series under a total-return id (D-15)`,
    )
  }
}

/**
 * Builds the full total-return series for `scope`: the real daily series on and after its own
 * first date `S`, and a constructed run before `S` chained backward from `S`'s exact real value
 * using daily price return plus the interpolated dividend contribution. Bounded at the front by
 * whichever runs out first: the price series' own start, or the monthly yield series' own first
 * anchor date (never extrapolated before it). Returns the real series unchanged (no construction)
 * when the two do not overlap at all.
 */
export function buildTotalReturnSeries(
  scope: string,
  priceSeries: AlignedInputSeries,
  realTotalReturnSeries: AlignedInputSeries,
  monthlyYieldSeries: RawSeries,
  calendar: ReferenceCalendar,
  seams: SeamCollector,
): TotalReturnResult {
  if (monthlyYieldSeries.dates.length === 0) {
    throw new Error(`compile-data: dividend-monthly input for scope "${scope}" has zero data rows`)
  }

  const sIndex = indexOfDate(calendar, toDaysSinceEpoch(realTotalReturnSeries.firstDate))
  if (sIndex === -1) {
    throw new Error(
      `compile-data: total-return construction for "${scope}": real series first date "${realTotalReturnSeries.firstDate}" is not present in the reference calendar`,
    )
  }

  const priceStartIndex = priceSeries.calendarStartIndex
  const yieldFirstIndex = firstCalendarIndexOnOrAfter(calendar, toDaysSinceEpoch(monthlyYieldSeries.dates[0]!))
  const constructionStartIndex = Math.max(priceStartIndex, yieldFirstIndex ?? priceStartIndex)
  const constructionEndIndex = sIndex - 1

  if (constructionStartIndex > constructionEndIndex) {
    // No room to construct anything before S (price data and/or yield data does not reach back
    // far enough): the compiled series is exactly the real series, unchanged.
    return { values: realTotalReturnSeries.values, calendarStartIndex: realTotalReturnSeries.calendarStartIndex }
  }

  const yieldRows = monthlyYieldSeries.dates.map((date, i) => ({ date, value: monthlyYieldSeries.values[i]! }))
  // Interpolated yield across the constructed run AND day S itself: day S's own yield value is
  // what the last backward step (S-1 -> S) accrues against.
  const yieldValues = interpolateMonthlyToDaily(yieldRows, calendar, constructionStartIndex, sIndex)

  const priceAt = (calendarIndex: number): number => priceSeries.values[calendarIndex - priceStartIndex]!

  const constructedLength = sIndex - constructionStartIndex
  const levels = new Float64Array(constructedLength + 1) // index 0..constructedLength, last slot holds S's own real value
  levels[constructedLength] = realTotalReturnSeries.values[0]!

  for (let i = sIndex - 1; i >= constructionStartIndex; i--) {
    const nextLevel = levels[i + 1 - constructionStartIndex]!
    const priceReturn = priceAt(i + 1) / priceAt(i) - 1
    const daysElapsed = calendar.days[i + 1]! - calendar.days[i]!
    const yieldAtNext = yieldValues[i + 1 - constructionStartIndex]!
    const dividendContribution = (yieldAtNext * daysElapsed) / 365
    const denom = 1 + priceReturn + dividendContribution
    const level = nextLevel / denom
    if (!Number.isFinite(level) || denom === 0) {
      throw new Error(
        `compile-data: total-return construction for "${scope}" produced a non-finite level at "${fromDaysSinceEpoch(calendar.days[i]!)}"`,
      )
    }
    levels[i - constructionStartIndex] = level
  }

  const combined = new Float64Array(constructedLength + realTotalReturnSeries.values.length)
  combined.set(levels.subarray(0, constructedLength), 0)
  combined.set(realTotalReturnSeries.values, constructedLength)

  const constructedFirstDate = fromDaysSinceEpoch(calendar.days[constructionStartIndex]!)
  const constructedLastDate = fromDaysSinceEpoch(calendar.days[sIndex - 1]!)
  const constructedSourceLabel = `${priceSeries.sourceName} + ${monthlyYieldSeries.rawStem} (interpolated)`

  seams.add({
    kind: 'interpolation',
    firstDate: constructedFirstDate,
    lastDate: constructedLastDate,
    sourceBefore: monthlyYieldSeries.rawStem,
    sourceAfter: monthlyYieldSeries.rawStem,
    method: `Constructed pre-"${realTotalReturnSeries.firstDate}" total return for "${scope}" from daily price return plus a dividend yield linearly interpolated from "${monthlyYieldSeries.rawStem}"'s monthly observations, with calendar-day accrual (SIM-03 convention).`,
    degradesToNonDaily: true,
  })
  seams.add({
    kind: 'splice',
    firstDate: realTotalReturnSeries.firstDate,
    lastDate: realTotalReturnSeries.firstDate,
    sourceBefore: constructedSourceLabel,
    sourceAfter: realTotalReturnSeries.sourceName,
    method: `Hand-off from the constructed pre-"${realTotalReturnSeries.firstDate}" run to "${realTotalReturnSeries.sourceName}"'s real daily total-return value, exactly one source contributing on the splice date.`,
    degradesToNonDaily: true,
  })

  return { values: combined, calendarStartIndex: constructionStartIndex }
}
