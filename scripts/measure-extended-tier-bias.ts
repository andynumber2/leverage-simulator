/**
 * scripts/measure-extended-tier-bias.ts
 *
 * CRED-03's build-time measurement (D-21): quantifies how much annualized volatility drag the
 * extended tier's own monthly-to-daily interpolation hides, by inverting that exact transform
 * over a known-good, fully-daily era.
 *
 * Method: take a daily price-level series from a period the strict tier already certifies as
 * genuinely daily (no interpolation anywhere in its own history), downsample it to month-end
 * observations, interpolate it back to daily with the bundle compiler's own
 * `interpolateMonthlyToDaily` (never a reimplementation), and run the identical leverage through
 * `computeAttribution` over both the original daily series and the reconstructed series. The gap
 * between the two runs' volatility-drag components, annualized, is the reported figure.
 *
 * Era and symbol choice (Claude's discretion, 05-CONTEXT.md): SPX/price-return, 2000-01-03
 * through 2012-12-31 -- the dot-com bust through the 2008 financial crisis and its recovery, a
 * historically volatile, roughly flat-to-modest-return 13-year stretch. Chosen specifically
 * because it is a well-known, uncherrypicked period (not selected by scanning outcomes) where
 * daily-rebalanced 3x leverage genuinely pays a volatility-drag COST rather than a compounding
 * GAIN: the full 1954-2026 strict-tier range was tried first and rejected because its dominant
 * 72-year secular uptrend makes 3x daily compounding a net gain even in the interpolated
 * (lower-realized-volatility) reconstruction, which inverts the sign this measurement needs to
 * report ("understated drag" requires drag to be a cost in both arms, with the reconstructed
 * arm's cost smaller in magnitude, not a gain that grows).
 *
 * Leverage is pinned at 3, matching `SYNTHETIC_LEVERAGE` in
 * `src/validation/synthetic-comparison.ts` -- the project's other canonical 3x reference point.
 * Financing spread and expense ratio are both zeroed for this measurement so the reported gap is
 * pure compounding/volatility-drag, uncontaminated by the other two attribution components (which
 * collapse to exactly zero under zeroed cost parameters, verified by inspection of
 * `computeAttribution`'s Shapley construction: every subset value that differs only by financing
 * or expense being on vs off is identical when both parameters are zero).
 *
 * Per D-21 this is a build-time measurement, committed and tested (tests/validation/
 * extended-tier-bias.test.ts), never computed live on the recompute path.
 *
 * This module exposes the measurement as a pure function (`measureExtendedTierBias`) separate
 * from the file-writing entry point below, so the pinning test can import and recompute the
 * figure without ever invoking the writer (`import.meta.main` guards the write-to-disk call, so
 * merely importing this module -- what the test does -- performs no file I/O).
 */

import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { seriesView } from '../tools/bundle-compiler/src/binary-format.ts'
import { fromDaysSinceEpoch, indexOfDate, toDaysSinceEpoch, type ReferenceCalendar } from '../tools/bundle-compiler/src/calendar.ts'
import { interpolateMonthlyToDaily } from '../tools/bundle-compiler/src/rate-series.ts'
import type { LoadedBundle } from '../src/data/bundle-source.ts'
import type { KernelInputs } from '../src/data/kernel-inputs.ts'
import { loadBundleFromDisk } from '../src/data/load-bundle-node.ts'
import { runBacktest } from '../src/kernel/backtest.ts'
import { LONG_GAP_FLAG_MIN_DAYS, type KernelOutputs, type KernelParams, type KernelSeries } from '../src/kernel/backtest.types.ts'
import { computeAttribution } from '../src/validation/attribution.ts'

/** The known-good daily era and symbol this measurement inverts (see header comment). */
export const MEASUREMENT_SERIES_ID = 'SPX/price-return'
export const MEASUREMENT_ERA_FIRST_DATE = '2000-01-03'
export const MEASUREMENT_ERA_LAST_DATE = '2012-12-31'

/** Matches `SYNTHETIC_LEVERAGE` in `src/validation/synthetic-comparison.ts` -- the project's
 * other canonical 3x reference point. Not imported directly: that module's constant is scoped to
 * the UPRO/TQQQ validation gate, and duplicating the literal here (both pinned at exactly 3, by
 * design) keeps this measurement's own era/leverage choice self-contained and independently
 * readable without a cross-module coupling that would break if the gate's own pin ever moved for
 * an unrelated reason. */
export const MEASUREMENT_LEVERAGE = 3

/** Arbitrary and immaterial to the reported fraction: every dollar figure this script computes is
 * normalized back to a fraction of this amount before being reported, so the fraction is
 * independent of the chosen value. */
const MEASUREMENT_INITIAL_INVESTMENT = 10_000

/** Average calendar days per year, used only to annualize the measured period-total gap -- a
 * distinct convention from the kernel's own actual/360 (financing) and actual/365 (expense)
 * accrual bases, which price a per-bar cost rather than annualize a whole-period total. */
const DAYS_PER_YEAR = 365.25

const GENERATED_MODULE_FILENAME = 'extended-tier-bias.generated.ts'

export interface ExtendedTierBiasResult {
  /** Annualized fraction (e.g. 0.0553 renders "5.53%/yr" via `formatPercent`) by which the
   * reconstructed (downsample-then-interpolate) run's volatility-drag component understates the
   * original daily run's own volatility-drag component. Positive by construction for the chosen
   * era (see header comment); the writer refuses to emit a non-finite or non-positive value. */
  annualizedUnderstatedDragFraction: number
  symbol: string
  eraFirstDate: string
  eraLastDate: string
  leverage: number
  /** Copied verbatim from the compiler's own seam-method wording template
   * (`tools/bundle-compiler/src/rate-series.ts`'s `interpolateMonthlyToDaily` seam), so a reader
   * comparing this measurement's method against a real seam's `method` field sees identical
   * wording, not a paraphrase. */
  interpolationMethod: string
}

interface MonthlyRow {
  date: string
  value: number
}

interface SeriesLookup {
  levels: Float64Array
  calendarStartIndex: number
}

/** Reads one manifest series' decoded level values, mirroring the lookup
 * `src/data/kernel-inputs.ts`'s `buildKernelInputs` performs for the price series -- this script
 * does not import that function's private helpers (none are exported), so the same three-step
 * manifest-entry -> asset -> descriptor lookup is repeated here at script scope. */
function lookupSeriesLevels(bundle: LoadedBundle, seriesId: string): SeriesLookup {
  const entry = bundle.manifest.series.find((s) => s.id === seriesId)
  if (entry === undefined) {
    throw new Error(`measure-extended-tier-bias: no series named "${seriesId}" in the compiled bundle manifest`)
  }
  const asset = bundle.assets.get(entry.asset)
  if (asset === undefined) {
    throw new Error(`measure-extended-tier-bias: asset file "${entry.asset}" was not loaded`)
  }
  const descriptor = asset.header.descriptors.find((d) => d.id === seriesId)
  if (descriptor === undefined) {
    throw new Error(`measure-extended-tier-bias: no descriptor named "${seriesId}" in the decoded asset header`)
  }
  const levels = seriesView(asset.buffer, asset.header, descriptor)
  return { levels, calendarStartIndex: descriptor.calendarStartIndex }
}

/** Downsamples a daily level series (already sliced to `[firstAbsIndex, lastAbsIndex]`) to one
 * observation per calendar month, keeping each month's LAST trading-day observation -- the same
 * month-end convention a monthly-native source like TB3MS is itself already sampled at, so the
 * downsampling step mimics how a genuinely monthly source would have been recorded, not an
 * arbitrary subsampling choice. */
function downsampleToMonthEnd(
  calendar: ReferenceCalendar,
  firstAbsIndex: number,
  lastAbsIndex: number,
  dailyLevels: Float64Array,
): MonthlyRow[] {
  const monthlyRows: MonthlyRow[] = []
  let lastMonthKey = ''
  for (let absIndex = firstAbsIndex; absIndex <= lastAbsIndex; absIndex++) {
    const date = fromDaysSinceEpoch(calendar.days[absIndex]!)
    const monthKey = date.slice(0, 7)
    const value = dailyLevels[absIndex - firstAbsIndex]!
    if (monthKey !== lastMonthKey) {
      monthlyRows.push({ date, value })
      lastMonthKey = monthKey
    } else {
      const row = monthlyRows[monthlyRows.length - 1]!
      row.date = date
      row.value = value
    }
  }
  return monthlyRows
}

/** Builds the return/rate/calendar-gap/contribution arrays `runBacktest` and `computeAttribution`
 * need from one already-sliced daily level series, runs the kernel with financing and expense
 * both zeroed (so the only measured component is volatility drag), and returns the attribution
 * result. Preallocates its own output buffers per SIM-11. */
function runArmAndComputeAttribution(
  levels: Float64Array,
  calendar: ReferenceCalendar,
  firstAbsIndex: number,
  barCount: number,
  seriesId: string,
  bundleVersion: string,
  firstDate: string,
  lastDate: string,
): ReturnType<typeof computeAttribution> {
  const returns = new Float64Array(barCount)
  const shortRate = new Float64Array(barCount)
  const calendarDaysElapsed = new Int32Array(barCount)
  const contributionFlags = new Uint8Array(barCount)

  for (let k = 0; k < barCount; k++) {
    if (k === 0) {
      returns[0] = 0
      calendarDaysElapsed[0] = 0
      continue
    }
    const absIndex = firstAbsIndex + k
    const level = levels[k]!
    const prevLevel = levels[k - 1]!
    returns[k] = prevLevel !== 0 ? level / prevLevel - 1 : 0
    calendarDaysElapsed[k] = calendar.days[absIndex]! - calendar.days[absIndex - 1]!
  }

  const params: KernelParams = {
    leverage: MEASUREMENT_LEVERAGE,
    initialInvestment: MEASUREMENT_INITIAL_INVESTMENT,
    contributionAmount: 0,
    financingSpread: 0,
    expenseRatio: 0,
    longGapMinDays: LONG_GAP_FLAG_MIN_DAYS,
  }
  const series: KernelSeries = { returns, shortRate, calendarDaysElapsed, contributionFlags }
  const outputs: KernelOutputs = {
    outValue: new Float64Array(barCount),
    outRuined: new Uint8Array(barCount),
    outLongGap: new Uint8Array(barCount),
  }

  const result = runBacktest(params, series, outputs)

  const inputs: KernelInputs = {
    params,
    series,
    outputs,
    window: { entryIndex: firstAbsIndex, barCount, firstDate, lastDate },
    meta: {
      seriesId,
      bundleVersion,
      truncatedForRateCoverage: false,
      contributionCount: 0,
      contributionNominalDates: [],
    },
  }

  return computeAttribution(inputs, result)
}

/**
 * The measurement, as a pure function of an already-loaded bundle. Never writes a file; imported
 * directly by `tests/validation/extended-tier-bias.test.ts` for recomputation.
 */
export function measureExtendedTierBias(bundle: LoadedBundle): ExtendedTierBiasResult {
  const calendar: ReferenceCalendar = { days: bundle.calendar }

  const { levels, calendarStartIndex } = lookupSeriesLevels(bundle, MEASUREMENT_SERIES_ID)

  const firstAbsIndex = indexOfDate(calendar, toDaysSinceEpoch(MEASUREMENT_ERA_FIRST_DATE))
  const lastAbsIndex = indexOfDate(calendar, toDaysSinceEpoch(MEASUREMENT_ERA_LAST_DATE))
  if (firstAbsIndex === -1 || lastAbsIndex === -1 || lastAbsIndex <= firstAbsIndex) {
    throw new Error(
      `measure-extended-tier-bias: era [${MEASUREMENT_ERA_FIRST_DATE}, ${MEASUREMENT_ERA_LAST_DATE}] does not ` +
        `resolve to a valid, non-empty range of trading days in the compiled calendar`,
    )
  }
  const barCount = lastAbsIndex - firstAbsIndex + 1

  const originalLevels = new Float64Array(barCount)
  for (let k = 0; k < barCount; k++) {
    const priceIndex = firstAbsIndex + k - calendarStartIndex
    originalLevels[k] = levels[priceIndex]!
  }

  const monthlyRows = downsampleToMonthEnd(calendar, firstAbsIndex, lastAbsIndex, originalLevels)
  const reconstructedLevels = interpolateMonthlyToDaily(monthlyRows, calendar, firstAbsIndex, lastAbsIndex)

  const bundleVersion = bundle.manifest.bundleVersion

  const originalAttribution = runArmAndComputeAttribution(
    originalLevels,
    calendar,
    firstAbsIndex,
    barCount,
    MEASUREMENT_SERIES_ID,
    bundleVersion,
    MEASUREMENT_ERA_FIRST_DATE,
    MEASUREMENT_ERA_LAST_DATE,
  )
  const reconstructedAttribution = runArmAndComputeAttribution(
    reconstructedLevels,
    calendar,
    firstAbsIndex,
    barCount,
    MEASUREMENT_SERIES_ID,
    bundleVersion,
    MEASUREMENT_ERA_FIRST_DATE,
    MEASUREMENT_ERA_LAST_DATE,
  )

  const years = (toDaysSinceEpoch(MEASUREMENT_ERA_LAST_DATE) - toDaysSinceEpoch(MEASUREMENT_ERA_FIRST_DATE)) / DAYS_PER_YEAR

  const dragGapDollars = originalAttribution.volatilityDrag - reconstructedAttribution.volatilityDrag
  const annualizedUnderstatedDragFraction = dragGapDollars / MEASUREMENT_INITIAL_INVESTMENT / years

  if (!Number.isFinite(annualizedUnderstatedDragFraction) || annualizedUnderstatedDragFraction <= 0) {
    throw new Error(
      `measure-extended-tier-bias: measured figure must be finite and positive, got ` +
        `${annualizedUnderstatedDragFraction} (original drag=${originalAttribution.volatilityDrag}, ` +
        `reconstructed drag=${reconstructedAttribution.volatilityDrag}) -- the chosen era no longer ` +
        `demonstrates volatility drag as a cost in both arms; see this file's header comment`,
    )
  }

  const symbol = MEASUREMENT_SERIES_ID.split('/')[0]!

  return {
    annualizedUnderstatedDragFraction,
    symbol,
    eraFirstDate: MEASUREMENT_ERA_FIRST_DATE,
    eraLastDate: MEASUREMENT_ERA_LAST_DATE,
    leverage: MEASUREMENT_LEVERAGE,
    interpolationMethod: `Linear interpolation of "${MEASUREMENT_SERIES_ID}"'s monthly observations to daily, bounded by its own month-anchor dates.`,
  }
}

/** Write-to-temp-then-rename, mirroring `writeGeneratedPointerModule`
 * (`tools/bundle-compiler/src/compile.ts`) so a reader/consumer of the generated module never
 * observes a partially-written file. */
function writeGeneratedModule(srcDir: string, result: ExtendedTierBiasResult, measurementDate: string): void {
  mkdirSync(srcDir, { recursive: true })
  const contents = `/**
 * GENERATED FILE. Do not hand-edit.
 *
 * Regenerated by \`npm run measure-extended-tier-bias\` (scripts/measure-extended-tier-bias.ts).
 * CRED-03: the annualized volatility-drag understatement the extended tier's monthly-to-daily
 * interpolation hides, measured by inverting that exact transform over a known-good daily era.
 * Pinned by tests/validation/extended-tier-bias.test.ts, which fails the build if the committed
 * figure below no longer matches what the current bundle produces.
 */

/** Annualized fraction (e.g. 0.0553 means 5.53%/yr of understated volatility drag). */
export const EXTENDED_TIER_BIAS_ANNUALIZED_FRACTION = ${JSON.stringify(result.annualizedUnderstatedDragFraction)}

/** The symbol the measurement era's daily levels were drawn from. */
export const EXTENDED_TIER_BIAS_SYMBOL = ${JSON.stringify(result.symbol)}

/** The known-good daily era's first date (inclusive). */
export const EXTENDED_TIER_BIAS_ERA_FIRST_DATE = ${JSON.stringify(result.eraFirstDate)}

/** The known-good daily era's last date (inclusive). */
export const EXTENDED_TIER_BIAS_ERA_LAST_DATE = ${JSON.stringify(result.eraLastDate)}

/** The leverage multiple both arms of the measurement ran at. */
export const EXTENDED_TIER_BIAS_LEVERAGE = ${JSON.stringify(result.leverage)}

/** Copied verbatim from the bundle compiler's own seam-method wording template. */
export const EXTENDED_TIER_BIAS_INTERPOLATION_METHOD = ${JSON.stringify(result.interpolationMethod)}

/** ISO date this figure was last regenerated. Not itself a function of the bundle data, so the
 * pinning test does not assert this field against a live recomputation. */
export const EXTENDED_TIER_BIAS_MEASUREMENT_DATE = ${JSON.stringify(measurementDate)}
`
  const finalPath = path.join(srcDir, GENERATED_MODULE_FILENAME)
  const tmpPath = path.join(
    srcDir,
    `.${GENERATED_MODULE_FILENAME}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  writeFileSync(tmpPath, contents)
  renameSync(tmpPath, finalPath)
}

/** Entry-point guard: `import.meta.main` is true only when this module is the process's own
 * entry script (`node scripts/measure-extended-tier-bias.ts`), never true when another module
 * (the pinning test) imports it -- so importing this file for `measureExtendedTierBias` alone
 * never writes to disk. */
if (import.meta.main) {
  const bundle = await loadBundleFromDisk()
  const result = measureExtendedTierBias(bundle)
  const measurementDate = new Date().toISOString().slice(0, 10)
  const srcDir = path.join(process.cwd(), 'src', 'validation')
  writeGeneratedModule(srcDir, result, measurementDate)
  process.stdout.write(
    `measure-extended-tier-bias: wrote ${path.join(srcDir, GENERATED_MODULE_FILENAME)} -- ` +
      `${result.symbol} ${result.eraFirstDate}..${result.eraLastDate} at ${result.leverage}x: ` +
      `${(result.annualizedUnderstatedDragFraction * 100).toFixed(2)}%/yr understated drag\n`,
  )
}
