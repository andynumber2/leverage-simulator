/**
 * src/validation/synthetic-comparison.ts
 *
 * F-01: the synthetic-construction helpers `tests/validation/upro-tqqq-gate.test.ts` used to
 * define privately, extracted so a second caller -- Phase 5's in-app `ValidationSection`
 * (VALID-04) -- can reach them without a second, drifting copy. D-11/D-12 exists so there is
 * exactly one implementation for both the CI gate and the browser view, the same discipline
 * `src/validation/tracking-error.ts` already established for the two D-11 gate statistics
 * themselves.
 *
 * No-fitting protocol (D-14 through D-20, restated here so it binds both callers): no value in
 * `src/validation/cost-parameters.ts`'s `COST_PARAMETERS` is ever edited in response to a
 * measurement taken through this module -- not by the CI gate test, and not by the in-app
 * validation view. See that file's own header for the full three-outcome protocol.
 *
 * Import discipline (matching `tracking-error.ts`): types plus pure functions only. No `vitest`
 * import, no `node:` import, no import from `src/app/`, and no import from `src/data/`'s
 * request-building layer (`kernel-inputs.ts`) -- `resolveOverlapWindow` below resolves the same
 * D-29 rate-coverage-truncated window `buildKernelInputs` would, directly from the manifest,
 * calendar and asset headers, so this module stays a sibling to the data layer rather than built
 * on top of it, deterministically producing the identical window a caller's own later
 * `buildKernelInputs` call (with its real leverage and cost parameters, which this module never
 * needs) will also resolve to.
 */

import { seriesView } from '../../tools/bundle-compiler/src/binary-format.ts'
import { fromDaysSinceEpoch, indexOfDate, toDaysSinceEpoch } from '../../tools/bundle-compiler/src/calendar.ts'
import type { LoadedBundle } from '../data/bundle-source.ts'
import type { TrackingErrorWindow } from './tracking-error.ts'

/** D-13's two rate-regime era boundaries -- the only literal ISO dates in this module. Everything
 * else derived here (the resolved overlap window, both sub-window boundaries' bar positions) is
 * computed from the bundle at run time. */
export const NEAR_ZERO_RATE_ERA_END = '2015-12-31'
export const HIGH_RATE_ERA_START = '2022-01-01'

/** ROADMAP criterion 2 / T-03-22: a data refresh that silently truncates either fund's history
 * must fail loudly here rather than narrowing into a flattering pass. */
export const MIN_OVERLAP_YEARS = 15

/** D-10 AMENDED: the leverage this module's synthetic construction is always pinned to, for both
 * the CI gate and the in-app view. Renamed on export from the gate test's own private `LEVERAGE`
 * so its meaning is unambiguous to a second caller outside that file. */
export const SYNTHETIC_LEVERAGE = 3

/** Reads one manifest series' full decoded level array, plus the fields needed to slice it to an
 * arbitrary absolute-calendar-index window. */
export function readSeriesLevels(
  bundle: LoadedBundle,
  seriesId: string,
): { levels: Float64Array; calendarStartIndex: number; lastDate: string } {
  const entry = bundle.manifest.series.find((s) => s.id === seriesId)
  if (entry === undefined) {
    throw new Error(`synthetic-comparison: no series named "${seriesId}" in the manifest`)
  }
  const asset = bundle.assets.get(entry.asset)
  if (asset === undefined) {
    throw new Error(`synthetic-comparison: asset file "${entry.asset}" for series "${seriesId}" was not loaded`)
  }
  const descriptor = asset.header.descriptors.find((d) => d.id === seriesId)
  if (descriptor === undefined) {
    throw new Error(`synthetic-comparison: no descriptor named "${seriesId}" in the decoded asset header`)
  }
  return {
    levels: seriesView(asset.buffer, asset.header, descriptor),
    calendarStartIndex: descriptor.calendarStartIndex,
    lastDate: entry.lastDate,
  }
}

/** Slices a full decoded level series to the exact `[entryAbsIndex, entryAbsIndex + barCount)`
 * absolute-calendar-index window a run occupies. */
export function sliceLevelsToWindow(
  levels: Float64Array,
  calendarStartIndex: number,
  entryAbsIndex: number,
  barCount: number,
): Float64Array {
  const sliced = new Float64Array(barCount)
  for (let k = 0; k < barCount; k++) {
    const localIndex = entryAbsIndex + k - calendarStartIndex
    const value = levels[localIndex]
    if (value === undefined) {
      throw new Error(`synthetic-comparison: series level missing at local index ${localIndex} (bar ${k})`)
    }
    sliced[k] = value
  }
  return sliced
}

/** Derives daily returns from a level/value series the same way `src/data/kernel-inputs.ts` does:
 * `level[k] / level[k-1] - 1`. Bar 0 is defined as 0, matching D-03's cost-free-anchor convention
 * both the kernel's own `outValue` and every level series here already follow at their own bar 0. */
export function deriveReturns(values: Float64Array): Float64Array {
  const returns = new Float64Array(values.length)
  returns[0] = 0
  for (let k = 1; k < values.length; k++) {
    const previous = values[k - 1] as number
    const current = values[k] as number
    returns[k] = previous !== 0 ? current / previous - 1 : 0
  }
  return returns
}

/** Standard lower-bound binary search over the local bar range `[0, barCount)`, returning the
 * greatest local bar index `k` whose absolute calendar day is `<= targetDays`, or -1 if none. */
export function localIndexAtOrBefore(
  calendar: Int32Array,
  entryAbsIndex: number,
  barCount: number,
  targetDays: number,
): number {
  let lo = 0
  let hi = barCount - 1
  let result = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const days = calendar[entryAbsIndex + mid] as number
    if (days <= targetDays) {
      result = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return result
}

/** Mirror of `localIndexAtOrBefore`: the least local bar index `k` whose absolute calendar day is
 * `>= targetDays`, or `barCount` if none. */
export function localIndexAtOrAfter(
  calendar: Int32Array,
  entryAbsIndex: number,
  barCount: number,
  targetDays: number,
): number {
  let lo = 0
  let hi = barCount - 1
  let result = barCount
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const days = calendar[entryAbsIndex + mid] as number
    if (days >= targetDays) {
      result = mid
      hi = mid - 1
    } else {
      lo = mid + 1
    }
  }
  return result
}

/** `resolveOverlapWindow`'s successful result: the resolved entry date (the LATER of the index's
 * and the fund's own manifest `firstDate`), the D-29 rate-coverage-truncated window it resolves
 * to, and the absolute-calendar-index coordinates a caller needs to slice a decoded level series
 * to that same window (`sliceLevelsToWindow`) or build kernel inputs over it. */
export interface ResolvedOverlapWindow {
  entryDate: string
  firstDate: string
  lastDate: string
  /** Elapsed calendar time, in years (`365.25`-day years, matching `tracking-error.ts`'s own
   * `windowYears`), never a bar count. */
  years: number
  /** Absolute index into the shared compiled calendar. */
  entryIndex: number
  barCount: number
}

/**
 * D-10/D-11: resolves the entry date for a synthetic-vs-real comparison as the LATER of the
 * index's and the fund's own manifest `firstDate` (a fund's own inception date, in every bundled
 * pair) and truncates the window at the last bar BOTH the index series and the shared
 * `@rate/rate` series cover -- the identical D-29 rule `buildKernelInputs` applies to every real
 * run, computed here directly from the manifest and decoded asset headers so a caller's own later
 * `buildKernelInputs` call (with its real leverage and cost parameters, irrelevant to the window
 * itself) resolves to the exact same window deterministically.
 *
 * Throws, naming the resolved window and the shortfall, when the resulting span is below
 * `MIN_OVERLAP_YEARS` (T-03-22): a data refresh that silently truncates either series' history
 * must fail loudly here rather than narrowing into a flattering pass, for both the CI gate and
 * VALID-04's in-app view -- "a stated failure when the overlap is shorter, never a silently short
 * window."
 */
export function resolveOverlapWindow(
  bundle: LoadedBundle,
  indexSeriesId: string,
  fundSeriesId: string,
): ResolvedOverlapWindow {
  const indexEntry = bundle.manifest.series.find((s) => s.id === indexSeriesId)
  const fundEntry = bundle.manifest.series.find((s) => s.id === fundSeriesId)
  if (indexEntry === undefined) {
    throw new Error(`synthetic-comparison: no series named "${indexSeriesId}" in the manifest`)
  }
  if (fundEntry === undefined) {
    throw new Error(`synthetic-comparison: no series named "${fundSeriesId}" in the manifest`)
  }

  // D-10: the overlap window's first bar is the LATER of the two series' own firstDate -- for
  // both bundled fund pairs, that is the fund's own inception date, read from the manifest, never
  // hardcoded.
  const overlapFirstDate = indexEntry.firstDate > fundEntry.firstDate ? indexEntry.firstDate : fundEntry.firstDate
  const entryDays = toDaysSinceEpoch(overlapFirstDate)
  const entryAbsIndex = indexOfDate({ days: bundle.calendar }, entryDays)
  if (entryAbsIndex === -1) {
    throw new Error(
      `synthetic-comparison: overlap start "${overlapFirstDate}" is not a trading session in the compiled calendar`,
    )
  }

  // D-29: truncate at the last bar BOTH the index series and the shared rate series cover, the
  // same rule buildKernelInputs applies to every run.
  const indexSeries = readSeriesLevels(bundle, indexSeriesId)
  const rateSeries = readSeriesLevels(bundle, '@rate/rate')
  const indexLastAbsIndex = indexSeries.calendarStartIndex + indexSeries.levels.length - 1
  const rateLastAbsIndex = rateSeries.calendarStartIndex + rateSeries.levels.length - 1
  const runLastAbsIndex = Math.min(indexLastAbsIndex, rateLastAbsIndex)

  if (runLastAbsIndex < entryAbsIndex) {
    throw new Error(
      `synthetic-comparison: resolved overlap end (absolute index ${runLastAbsIndex}) is before the resolved ` +
        `overlap start (absolute index ${entryAbsIndex})`,
    )
  }

  const barCount = runLastAbsIndex - entryAbsIndex + 1
  const firstDate = fromDaysSinceEpoch(bundle.calendar[entryAbsIndex] as number)
  const lastDate = fromDaysSinceEpoch(bundle.calendar[runLastAbsIndex] as number)
  const years = (toDaysSinceEpoch(lastDate) - toDaysSinceEpoch(firstDate)) / 365.25

  if (years < MIN_OVERLAP_YEARS) {
    throw new Error(
      `synthetic-comparison: overlap window (${firstDate}..${lastDate}) is only ${years.toFixed(2)} years, ` +
        `below the required ${MIN_OVERLAP_YEARS}`,
    )
  }

  return { entryDate: overlapFirstDate, firstDate, lastDate, years, entryIndex: entryAbsIndex, barCount }
}

/**
 * D-13: the rate-regime sub-window set (near-zero-rate era, high-rate era) reported alongside the
 * full-window comparison -- never gated, only reported (D-13: sub-windows do not gate, only the
 * full window does). Returns the ordered list a caller enumerates as-is: zero, one, or two
 * entries, depending on whether the resolved window actually reaches into either era with at
 * least the 2 bars `computeTrackingError` requires. `labelPrefix` names the comparison in each
 * window's own label (the CI gate test uses the fund name; `SubWindowTable` may use the same or
 * a shorter prefix), so the in-app table and the gate test enumerate the same regimes from one
 * definition.
 */
export function buildRateRegimeWindows(
  calendar: Int32Array,
  entryAbsIndex: number,
  barCount: number,
  labelPrefix: string,
): TrackingErrorWindow[] {
  const nearZeroRateLastBar = localIndexAtOrBefore(
    calendar,
    entryAbsIndex,
    barCount,
    toDaysSinceEpoch(NEAR_ZERO_RATE_ERA_END),
  )
  const highRateFirstBar = localIndexAtOrAfter(calendar, entryAbsIndex, barCount, toDaysSinceEpoch(HIGH_RATE_ERA_START))

  const windows: TrackingErrorWindow[] = []
  if (nearZeroRateLastBar >= 1) {
    windows.push({
      label: `${labelPrefix} near-zero-rate era (through ${NEAR_ZERO_RATE_ERA_END})`,
      firstBar: 0,
      lastBar: nearZeroRateLastBar,
      firstDayNumber: calendar[entryAbsIndex] as number,
      lastDayNumber: calendar[entryAbsIndex + nearZeroRateLastBar] as number,
    })
  }
  if (highRateFirstBar <= barCount - 2) {
    windows.push({
      label: `${labelPrefix} high-rate era (from ${HIGH_RATE_ERA_START})`,
      firstBar: highRateFirstBar,
      lastBar: barCount - 1,
      firstDayNumber: calendar[entryAbsIndex + highRateFirstBar] as number,
      lastDayNumber: calendar[entryAbsIndex + barCount - 1] as number,
    })
  }
  return windows
}
