/**
 * src/sweep/resolve-column-series.ts
 *
 * 07-01-PLAN.md Task 2: resolves ONE entry-date column's `KernelSeries` -- the exact per-bar
 * series shape `src/data/kernel-inputs.ts`'s `buildKernelInputs` builds internally, factored out
 * so `src/sweep/sweep.worker.ts` can resolve it once per column and reuse it across all 50
 * leverage rows in that column, instead of calling `buildKernelInputs` (and rebuilding an
 * identical series) once per cell. `leverage` is absent from `ColumnSeriesRequest`'s type
 * entirely: nothing in a `KernelSeries` depends on it (`buildKernelInputs` itself only ever
 * threads `leverage` into `KernelParams`, never into the series arrays), which is the whole basis
 * for per-column reuse being correct, not just fast (proven in `tests/sweep/column-series.test.ts`).
 *
 * Reuses `buildKernelInputs`'s per-bar loop logic and its fail-loud out-of-range-entry-date
 * validation (D-32) verbatim. The one behavioral difference: a fixed holding period that runs
 * past the last supported bar is D-28's categorical case, not a programmer error, and a sweep
 * column landing there is expected (a late entry date paired with a long fixed hold overruns the
 * data by construction) -- so this function reports that condition as a typed `incomplete` result
 * rather than throwing, and the caller (`sweep.worker.ts`) flags every cell in that column
 * `CELL_FLAG_INCOMPLETE` with a `0` value, never running `runBacktest` against a truncated series
 * to produce a partial value (D-20).
 */

import {
  seriesView,
  type AssetHeader,
  type SeriesDescriptor,
} from '../../tools/bundle-compiler/src/binary-format.ts'
import { fromDaysSinceEpoch, indexOfDate, toDaysSinceEpoch } from '../../tools/bundle-compiler/src/calendar.ts'
import type { Manifest, ManifestSeries } from '../../tools/bundle-compiler/src/manifest.ts'
import type { KernelSeries } from '../kernel/backtest.types.ts'
import type { LoadedBundle } from '../data/bundle-source.ts'
import { buildContributionFlags, resolveContributionBars, type ContributionFrequency } from '../data/contribution-schedule.ts'

/**
 * The subset of `BacktestRequest` (`src/data/kernel-inputs.ts`) that determines a `KernelSeries`.
 * `leverage`, `initialInvestment`, `expenseRatioPercent` and `financingSpreadPercent` are
 * deliberately absent: none of them affect any array this module builds, only `KernelParams`,
 * which the caller assembles separately per leverage row. `contributionAmount` is carried
 * through even though it plays no role in `contributionFlags` (only `contributionFrequency`
 * does) -- kept for symmetry with the request shapes this type is sliced from, so a caller
 * reading `ColumnSeriesRequest` next to `BacktestRequest`/`SweepChunkRequest` sees the same field
 * spelled the same way rather than a silently renamed or reordered one.
 */
export interface ColumnSeriesRequest {
  symbol: string
  dividendReinvest: boolean
  entryDate: string
  /** `null` means hold to the last fully-supported bar (D-29), same meaning as
   * `BacktestRequest.holdingPeriodBars`. */
  holdingPeriodBars: number | null
  contributionAmount: number
  contributionFrequency: ContributionFrequency
}

/** A successfully resolved column: the `KernelSeries` itself plus the window `runBacktest`'s
 * caller needs to interpret it (mirrors `KernelInputs.window` minus the fields that don't apply
 * to a leverage-agnostic series). `incomplete: false` is a literal discriminant so a caller can
 * narrow with a single `if (result.incomplete)` check. */
export interface ColumnSeriesOk extends KernelSeries {
  incomplete: false
  /** Absolute index into the shared compiled calendar (not a series-relative index). */
  entryIndex: number
  barCount: number
  firstDate: string
  lastDate: string
}

/** D-28: a fixed holding period that runs past the last supported bar. Not an error -- the
 * caller flags every cell in this column `CELL_FLAG_INCOMPLETE` with value `0` rather than
 * running `runBacktest` against a truncated series (D-20: never a partial value). */
export interface ColumnSeriesIncomplete {
  incomplete: true
  /** The `holdingPeriodBars` the request asked for (never `null`: an open-ended hold can never
   * overrun by construction, D-29). */
  requestedBars: number
  /** The greatest bar count this entry date actually supports. */
  maxBars: number
}

export type ColumnSeriesResolution = ColumnSeriesOk | ColumnSeriesIncomplete

/** SIM-07-style miss: names both the requested id and the sorted list of every series id the
 * manifest actually carries, mirroring `kernel-inputs.ts`'s `findManifestSeries`. */
function findManifestSeries(manifest: Manifest, id: string): ManifestSeries {
  const entry = manifest.series.find((s) => s.id === id)
  if (entry === undefined) {
    const existingIds = manifest.series.map((s) => s.id).sort()
    throw new Error(
      `resolve-column-series: no series named "${id}" in the compiled bundle manifest; existing series ids: ` +
        existingIds.join(', '),
    )
  }
  return entry
}

function getAsset(bundle: LoadedBundle, file: string): { buffer: ArrayBuffer; header: AssetHeader } {
  const asset = bundle.assets.get(file)
  if (asset === undefined) {
    throw new Error(`resolve-column-series: asset file "${file}" was not loaded by loadBundleFromDisk`)
  }
  return asset
}

function findDescriptor(header: AssetHeader, id: string): SeriesDescriptor {
  const descriptor = header.descriptors.find((d) => d.id === id)
  if (descriptor === undefined) {
    throw new Error(`resolve-column-series: no descriptor named "${id}" in the decoded asset header`)
  }
  return descriptor
}

function dateAtAbsIndex(calendar: Int32Array, absIndex: number): string {
  const days = calendar[absIndex]
  if (days === undefined) {
    throw new Error(`resolve-column-series: absolute calendar index ${absIndex} is out of range`)
  }
  return fromDaysSinceEpoch(days)
}

/**
 * Resolves `request.symbol` plus `request.dividendReinvest` to the series id
 * `${symbol}/total-return` when true and `${symbol}/price-return` when false (SIM-07), reads that
 * series and the shared `@rate/rate` series, precomputes `calendarDaysElapsed` from the shared
 * compiled calendar (D-31), and truncates the run window at the last bar both the selected series
 * and the rate series cover (D-29) -- the identical per-bar loop `buildKernelInputs` runs.
 *
 * Throws, naming both the offending value and the supported range (D-32), when `entryDate` falls
 * outside the selected series' own range or is not a trading session in the compiled calendar --
 * both are genuine caller errors (a sweep's entry-date axis is built from
 * `resolveEntryDateBounds`, so this should never fire in practice, same as `buildKernelInputs`).
 *
 * Returns `{ incomplete: true, ... }` rather than throwing when a FIXED `holdingPeriodBars` runs
 * past the last supported bar (D-28): that overrun is expected sweep geometry, not a validation
 * failure.
 */
export function resolveColumnSeries(bundle: LoadedBundle, request: ColumnSeriesRequest): ColumnSeriesResolution {
  // D-32: fail loud on a negative holding period rather than letting it fall through to
  // arithmetic that would silently produce a nonsensical (or empty/negative-length) window.
  if (request.holdingPeriodBars !== null && request.holdingPeriodBars < 0) {
    throw new Error(`resolve-column-series: holdingPeriodBars must be >= 0, got ${request.holdingPeriodBars}`)
  }

  const seriesId = `${request.symbol}/${request.dividendReinvest ? 'total-return' : 'price-return'}`
  const priceSeriesEntry = findManifestSeries(bundle.manifest, seriesId)
  const rateSeriesEntry = findManifestSeries(bundle.manifest, '@rate/rate')

  // D-32: the entry date must fall within the selected series' own supported range.
  if (request.entryDate < priceSeriesEntry.firstDate || request.entryDate > priceSeriesEntry.lastDate) {
    throw new Error(
      `resolve-column-series: entryDate "${request.entryDate}" is outside "${seriesId}"'s supported range ` +
        `[${priceSeriesEntry.firstDate}, ${priceSeriesEntry.lastDate}]`,
    )
  }

  const entryDays = toDaysSinceEpoch(request.entryDate)
  const entryAbsIndex = indexOfDate({ days: bundle.calendar }, entryDays)
  if (entryAbsIndex === -1) {
    throw new Error(
      `resolve-column-series: entryDate "${request.entryDate}" is not a trading session in the compiled calendar`,
    )
  }

  const priceAsset = getAsset(bundle, priceSeriesEntry.asset)
  const priceDescriptor = findDescriptor(priceAsset.header, seriesId)
  const priceLevels = seriesView(priceAsset.buffer, priceAsset.header, priceDescriptor)

  const rateAsset = getAsset(bundle, rateSeriesEntry.asset)
  const rateDescriptor = findDescriptor(rateAsset.header, '@rate/rate')
  const ratePercent = seriesView(rateAsset.buffer, rateAsset.header, rateDescriptor)

  const priceLastAbsIndex = priceDescriptor.calendarStartIndex + priceDescriptor.length - 1
  const rateLastAbsIndex = rateDescriptor.calendarStartIndex + rateDescriptor.length - 1
  const runLastAbsIndex = Math.min(priceLastAbsIndex, rateLastAbsIndex)

  let endAbsIndex: number
  if (request.holdingPeriodBars === null) {
    // D-29: open-ended hold resolves to the last fully-supported bar and can never overrun.
    endAbsIndex = runLastAbsIndex
  } else {
    // SIM-08 empty edge: 0 is in-range and means "just the entry bar" (a 1-bar run), matching
    // buildKernelInputs's own clamp.
    const effectiveBars = Math.max(1, request.holdingPeriodBars)
    const requestedEndAbsIndex = entryAbsIndex + effectiveBars - 1
    if (requestedEndAbsIndex > runLastAbsIndex) {
      // D-28: an overrun in fixed-period mode is a categorical case, not a validation failure --
      // reported to the caller rather than thrown.
      const maxBars = runLastAbsIndex - entryAbsIndex + 1
      return { incomplete: true, requestedBars: request.holdingPeriodBars, maxBars }
    }
    endAbsIndex = requestedEndAbsIndex
  }

  const barCount = endAbsIndex - entryAbsIndex + 1

  // D-25 through D-28: resolved once here, outside any per-bar loop the kernel will run.
  const schedule = resolveContributionBars(bundle.calendar, entryAbsIndex, endAbsIndex, request.contributionFrequency)
  const contributionFlags = buildContributionFlags(barCount, schedule)

  const returns = new Float64Array(barCount)
  const shortRate = new Float64Array(barCount)
  const calendarDaysElapsed = new Int32Array(barCount)

  for (let k = 0; k < barCount; k++) {
    const absIndex = entryAbsIndex + k
    const priceIndex = absIndex - priceDescriptor.calendarStartIndex
    const rateIndex = absIndex - rateDescriptor.calendarStartIndex

    if (k === 0) {
      // D-03/D-31: bar 0 accrues nothing and has no return.
      returns[0] = 0
      calendarDaysElapsed[0] = 0
    } else {
      const level = priceLevels[priceIndex] ?? 0
      const prevLevel = priceLevels[priceIndex - 1] ?? 0
      returns[k] = prevLevel !== 0 ? level / prevLevel - 1 : 0
      calendarDaysElapsed[k] = (bundle.calendar[absIndex] ?? 0) - (bundle.calendar[absIndex - 1] ?? 0)
    }

    shortRate[k] = (ratePercent[rateIndex] ?? 0) / 100
  }

  return {
    incomplete: false,
    returns,
    shortRate,
    calendarDaysElapsed,
    contributionFlags,
    entryIndex: entryAbsIndex,
    barCount,
    firstDate: dateAtAbsIndex(bundle.calendar, entryAbsIndex),
    lastDate: dateAtAbsIndex(bundle.calendar, endAbsIndex),
  }
}
