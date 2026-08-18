/**
 * src/data/kernel-inputs.ts
 *
 * The single data-layer seam (D-30): resolves a symbol/date/parameter request into the typed
 * arrays and scalars `src/kernel/backtest.ts` accepts. Owns bundle decode, symbol/dividend-mode
 * series lookup (SIM-07), percent-to-fraction conversion (D-09), `calendarDaysElapsed`
 * precomputation (D-31), run-window resolution and rate-coverage truncation (D-29), and
 * out-of-range parameter validation (D-32). This is the only module that imports both the
 * kernel's types and the bundle decoder; the kernel itself imports nothing from here (SIM-10).
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import {
  calendarView,
  decodeHeader,
  seriesView,
  type AssetHeader,
  type SeriesDescriptor,
} from '../../tools/bundle-compiler/src/binary-format.ts'
import { fromDaysSinceEpoch, indexOfDate, toDaysSinceEpoch } from '../../tools/bundle-compiler/src/calendar.ts'
import type { Manifest, ManifestSeries } from '../../tools/bundle-compiler/src/manifest.ts'
import { BUNDLE_VERSION, MANIFEST_PATH } from '../data-bundle.generated.ts'
import { LONG_GAP_FLAG_MIN_DAYS, type KernelOutputs, type KernelParams, type KernelSeries } from '../kernel/backtest.types.ts'

/** The request surface a single-run script or future UI resolves before calling the kernel. */
export interface BacktestRequest {
  symbol: string
  dividendReinvest: boolean
  leverage: number
  entryDate: string
  /** `null` means hold to the last fully-supported bar (D-29). */
  holdingPeriodBars: number | null
  initialInvestment: number
  contributionAmount: number
  contributionFrequency: 'none' | 'daily' | 'monthly' | 'quarterly' | 'yearly'
  /** Annualized, as a PERCENTAGE (e.g. 0.9 means 0.9%); converted to a fraction here (D-09). */
  expenseRatioPercent: number
  /** Annualized, as a PERCENTAGE; converted to a fraction here (D-09). */
  financingSpreadPercent: number
}

/** The decoded manifest, every asset's decoded header/buffer, and the shared calendar view. */
export interface LoadedBundle {
  manifest: Manifest
  calendar: Int32Array
  assets: Map<string, { buffer: ArrayBuffer; header: AssetHeader }>
}

export interface KernelInputs {
  params: KernelParams
  series: KernelSeries
  outputs: KernelOutputs
  window: {
    /** Absolute index into the shared compiled calendar (not a series-relative index). */
    entryIndex: number
    barCount: number
    firstDate: string
    lastDate: string
  }
  meta: {
    seriesId: string
    bundleVersion: string
    /** True when D-29's rate-coverage truncation shortened the window below what the price
     * series alone would have supported. */
    truncatedForRateCoverage: boolean
  }
}

async function readAsArrayBuffer(filePath: string): Promise<ArrayBuffer> {
  const buf = await readFile(filePath)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

/**
 * Resolves the manifest at `path.join(rootDir ?? process.cwd(), 'public', MANIFEST_PATH)`, reads
 * every `assets[].file` plus the shared calendar file from the same directory, and calls
 * `decodeHeader(buffer, BUNDLE_VERSION)` on each so a stale cached asset raises
 * `BundleVersionMismatchError` at load rather than returning numbers that quietly disagree with
 * the manifest describing them.
 */
export async function loadBundleFromDisk(rootDir?: string): Promise<LoadedBundle> {
  const baseDir = rootDir ?? process.cwd()
  const manifestPath = path.join(baseDir, 'public', MANIFEST_PATH)
  const manifestJson = await readFile(manifestPath, 'utf-8')
  const manifest = JSON.parse(manifestJson) as Manifest
  const dataDir = path.dirname(manifestPath)

  const assets = new Map<string, { buffer: ArrayBuffer; header: AssetHeader }>()

  const calendarBuffer = await readAsArrayBuffer(path.join(dataDir, manifest.calendar.file))
  const calendarHeader = decodeHeader(calendarBuffer, BUNDLE_VERSION)
  assets.set(manifest.calendar.file, { buffer: calendarBuffer, header: calendarHeader })
  const calendar = calendarView(calendarBuffer, calendarHeader)

  for (const asset of manifest.assets) {
    const buffer = await readAsArrayBuffer(path.join(dataDir, asset.file))
    const header = decodeHeader(buffer, BUNDLE_VERSION)
    assets.set(asset.file, { buffer, header })
  }

  return { manifest, calendar, assets }
}

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error(`kernel-inputs: "${name}" must be a finite number, got ${value}`)
  }
}

function findManifestSeries(manifest: Manifest, id: string): ManifestSeries {
  const entry = manifest.series.find((s) => s.id === id)
  if (entry === undefined) {
    throw new Error(`kernel-inputs: no series named "${id}" in the compiled bundle manifest`)
  }
  return entry
}

function getAsset(bundle: LoadedBundle, file: string): { buffer: ArrayBuffer; header: AssetHeader } {
  const asset = bundle.assets.get(file)
  if (asset === undefined) {
    throw new Error(`kernel-inputs: asset file "${file}" was not loaded by loadBundleFromDisk`)
  }
  return asset
}

function findDescriptor(header: AssetHeader, id: string): SeriesDescriptor {
  const descriptor = header.descriptors.find((d) => d.id === id)
  if (descriptor === undefined) {
    throw new Error(`kernel-inputs: no descriptor named "${id}" in the decoded asset header`)
  }
  return descriptor
}

function dateAtAbsIndex(calendar: Int32Array, absIndex: number): string {
  const days = calendar[absIndex]
  if (days === undefined) {
    throw new Error(`kernel-inputs: absolute calendar index ${absIndex} is out of range`)
  }
  return fromDaysSinceEpoch(days)
}

/**
 * Resolves `request.symbol` plus `request.dividendReinvest` to the series id
 * `${symbol}/total-return` when true and `${symbol}/price-return` when false (SIM-07), reads
 * that series and the shared `@rate/rate` series through `seriesView`, converts percent-annualized
 * rate/spread/expense-ratio inputs to fractions exactly once (D-09/F-02), precomputes
 * `calendarDaysElapsed` from the shared compiled calendar (D-31), and truncates the run window at
 * the last bar both the selected series and the rate series cover (D-29). Validates before
 * building and throws with the offending value and the supported range on an out-of-range entry
 * date or a holding period that runs past the last supported bar (D-32); never truncates silently.
 */
export function buildKernelInputs(bundle: LoadedBundle, request: BacktestRequest): KernelInputs {
  assertFinite('leverage', request.leverage)
  assertFinite('initialInvestment', request.initialInvestment)
  assertFinite('expenseRatioPercent', request.expenseRatioPercent)
  assertFinite('financingSpreadPercent', request.financingSpreadPercent)

  if (request.contributionFrequency !== 'none') {
    throw new Error(
      `kernel-inputs: contributionFrequency "${request.contributionFrequency}" is not implemented yet; ` +
        `plan 03-04 adds calendar-anchored contribution schedules`,
    )
  }

  const seriesId = `${request.symbol}/${request.dividendReinvest ? 'total-return' : 'price-return'}`
  const priceSeriesEntry = findManifestSeries(bundle.manifest, seriesId)
  const rateSeriesEntry = findManifestSeries(bundle.manifest, '@rate/rate')

  // D-32: the entry date must fall within the selected series' own supported range.
  if (request.entryDate < priceSeriesEntry.firstDate || request.entryDate > priceSeriesEntry.lastDate) {
    throw new Error(
      `kernel-inputs: entryDate "${request.entryDate}" is outside "${seriesId}"'s supported range ` +
        `[${priceSeriesEntry.firstDate}, ${priceSeriesEntry.lastDate}]`,
    )
  }

  const entryDays = toDaysSinceEpoch(request.entryDate)
  const entryAbsIndex = indexOfDate({ days: bundle.calendar }, entryDays)
  if (entryAbsIndex === -1) {
    throw new Error(`kernel-inputs: entryDate "${request.entryDate}" is not a trading session in the compiled calendar`)
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
  const truncatedForRateCoverage = rateLastAbsIndex < priceLastAbsIndex

  let endAbsIndex: number
  if (request.holdingPeriodBars === null) {
    endAbsIndex = runLastAbsIndex
  } else {
    endAbsIndex = entryAbsIndex + request.holdingPeriodBars - 1
    if (endAbsIndex > runLastAbsIndex) {
      const maxBars = runLastAbsIndex - entryAbsIndex + 1
      throw new Error(
        `kernel-inputs: holdingPeriodBars ${request.holdingPeriodBars} from entryDate "${request.entryDate}" ` +
          `runs past the last supported bar (max ${maxBars} bars, ending ${dateAtAbsIndex(bundle.calendar, runLastAbsIndex)})`,
      )
    }
  }

  const barCount = endAbsIndex - entryAbsIndex + 1

  // D-09/F-02: percent-to-fraction, exactly once, here.
  const expenseRatio = request.expenseRatioPercent / 100
  const financingSpread = request.financingSpreadPercent / 100

  const returns = new Float64Array(barCount)
  const shortRate = new Float64Array(barCount)
  const calendarDaysElapsed = new Int32Array(barCount)
  // request.contributionFrequency is validated to be 'none' above, so this stays zero-filled.
  const contributionFlags = new Uint8Array(barCount)

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

  const outValue = new Float64Array(barCount)
  const outRuined = new Uint8Array(barCount)
  const outLongGap = new Uint8Array(barCount)

  const params: KernelParams = {
    leverage: request.leverage,
    initialInvestment: request.initialInvestment,
    contributionAmount: request.contributionAmount,
    financingSpread,
    expenseRatio,
    longGapMinDays: LONG_GAP_FLAG_MIN_DAYS,
  }

  const series: KernelSeries = { returns, shortRate, calendarDaysElapsed, contributionFlags }
  const outputs: KernelOutputs = { outValue, outRuined, outLongGap }

  return {
    params,
    series,
    outputs,
    window: {
      entryIndex: entryAbsIndex,
      barCount,
      firstDate: dateAtAbsIndex(bundle.calendar, entryAbsIndex),
      lastDate: dateAtAbsIndex(bundle.calendar, endAbsIndex),
    },
    meta: {
      seriesId,
      bundleVersion: bundle.manifest.bundleVersion,
      truncatedForRateCoverage,
    },
  }
}
