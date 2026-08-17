/**
 * tools/bundle-compiler/src/compile.ts
 *
 * The compile pipeline as a callable function, independent of argv.
 *
 * Order: load raw inputs and their sidecars, derive the reference calendar, align each series to
 * the calendar, group series by scope, compute each asset's bytes, compute the bundle version
 * from the asset hashes, re-encode each asset with that bundle version in its header, write the
 * calendar asset, write one asset per scope, then build and write the manifest.
 *
 * Bundle version derivation is necessarily two-pass to avoid circularity: an asset's header
 * embeds the bundle version, but the bundle version is derived from the assets' own content
 * hashes. Pass 1 encodes every asset with an empty placeholder bundle version and hashes those
 * bytes; `computeBundleVersion` combines those hashes into the real bundle version. Pass 2
 * re-encodes every asset with that real bundle version. Because the underlying data bytes never
 * change between passes, this is deterministic and reproducible: recompiling unchanged raw inputs
 * always yields the same bundle version and the same final asset bytes.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'

import type { ReferenceCalendar } from './calendar.ts'
import { deriveCalendar, fromDaysSinceEpoch, indexOfDate, toDaysSinceEpoch } from './calendar.ts'
import { contentHashedFilename, encodeCalendarAsset, encodeSeriesAsset, writeAsset } from './encode.ts'
import { buildManifest, computeBundleVersion, writeManifest, type ManifestSeries } from './manifest.ts'
import { loadRawInputs, type RawSeries, type SidecarMeta } from './raw-input.ts'
import type { SeriesDescriptor, SeriesKind } from './binary-format.ts'

export interface CompileResult {
  bundleVersion: string
  calendarFile: string
  assetFiles: string[]
  manifestFile: string
  warnings: string[]
}

const BIN_FILE_PATTERN = /\.bin$/
const MANIFEST_FILE_PATTERN = /^manifest\..*\.json$/

function pruneOutputDir(outDir: string): void {
  if (!existsSync(outDir)) return
  for (const entry of readdirSync(outDir)) {
    if (BIN_FILE_PATTERN.test(entry) || MANIFEST_FILE_PATTERN.test(entry)) {
      rmSync(path.join(outDir, entry))
    }
  }
}

function seriesKindToBinary(sidecarKind: SidecarMeta['seriesKind']): SeriesKind {
  switch (sidecarKind) {
    case 'price':
      return 'price-return'
    case 'total-return':
      return 'total-return'
    case 'rate':
      return 'rate'
    case 'dividend-monthly':
      throw new Error(
        'compile-data: seriesKind "dividend-monthly" is an interpolation input for a later plan, not a directly compiled series',
      )
    default: {
      const exhaustive: never = sidecarKind
      throw new Error(`compile-data: unhandled seriesKind "${String(exhaustive)}"`)
    }
  }
}

function alignSeriesToCalendar(calendar: ReferenceCalendar, series: RawSeries): number {
  const firstDateStr = series.dates[0]
  if (firstDateStr === undefined) {
    throw new Error(`compile-data: series "${series.scope}/${series.meta.seriesKind}" has no rows`)
  }

  const startIndex = indexOfDate(calendar, toDaysSinceEpoch(firstDateStr))
  if (startIndex === -1) {
    throw new Error(
      `compile-data: series "${series.scope}/${series.meta.seriesKind}" first date ${firstDateStr} is not present in the reference calendar`,
    )
  }

  for (let i = 0; i < series.dates.length; i++) {
    const expectedDays = calendar.days[startIndex + i]
    const actualDays = toDaysSinceEpoch(series.dates[i]!)
    if (expectedDays === undefined || expectedDays !== actualDays) {
      throw new Error(
        `compile-data: series "${series.scope}/${series.meta.seriesKind}" date ${series.dates[i]} is not a contiguous run of calendar dates starting from ${firstDateStr}`,
      )
    }
  }

  return startIndex
}

function sortByKind(series: ReadonlyArray<RawSeries>): RawSeries[] {
  return [...series].sort((a, b) => (a.meta.seriesKind < b.meta.seriesKind ? -1 : a.meta.seriesKind > b.meta.seriesKind ? 1 : 0))
}

function buildScopeAssetBytes(
  bundleVersion: string,
  scope: string,
  seriesList: ReadonlyArray<RawSeries>,
  calendar: ReferenceCalendar,
): Uint8Array {
  const sorted = sortByKind(seriesList)
  const descriptors: Array<Omit<SeriesDescriptor, 'dataByteOffset'>> = []
  const values: Float64Array[] = []

  for (const series of sorted) {
    const kind = seriesKindToBinary(series.meta.seriesKind)
    const calendarStartIndex = alignSeriesToCalendar(calendar, series)
    descriptors.push({ kind, id: `${scope}/${kind}`, calendarStartIndex, length: series.values.length })
    values.push(Float64Array.from(series.values))
  }

  return encodeSeriesAsset(bundleVersion, scope, descriptors, values)
}

function sha256Hex10(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 10)
}

/**
 * Compiles `rawDir` into `outDir`: one shared calendar asset, one content-hashed asset per scope,
 * and a deterministic manifest. Adding a symbol (an additional CSV+sidecar pair) changes only the
 * emitted set, not this function.
 */
export function compileBundle(rawDir: string, outDir: string): CompileResult {
  const warnings: string[] = []

  const inputs = loadRawInputs(rawDir)
  const calendar = deriveCalendar(inputs)

  const byScope = new Map<string, RawSeries[]>()
  for (const input of inputs) {
    const existing = byScope.get(input.scope)
    if (existing) {
      existing.push(input)
    } else {
      byScope.set(input.scope, [input])
    }
  }
  const scopes = Array.from(byScope.keys()).sort()

  // Pass 1: placeholder bundle version, used only to derive a stable bundleVersion string.
  const PLACEHOLDER_BUNDLE_VERSION = ''
  const calendarBytesPass1 = encodeCalendarAsset(PLACEHOLDER_BUNDLE_VERSION, calendar.days)
  const scopeBytesPass1 = new Map<string, Uint8Array>()
  for (const scope of scopes) {
    scopeBytesPass1.set(scope, buildScopeAssetBytes(PLACEHOLDER_BUNDLE_VERSION, scope, byScope.get(scope)!, calendar))
  }

  const hashEntries: Array<{ name: string; hash: string }> = [
    { name: 'calendar', hash: sha256Hex10(calendarBytesPass1) },
    ...scopes.map((scope) => ({ name: scope, hash: sha256Hex10(scopeBytesPass1.get(scope)!) })),
  ]
  hashEntries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const bundleVersion = computeBundleVersion(hashEntries.map((entry) => entry.hash))

  // Pass 2: final bundle version embedded in every header.
  const calendarBytesFinal = encodeCalendarAsset(bundleVersion, calendar.days)
  const scopeBytesFinal = new Map<string, Uint8Array>()
  for (const scope of scopes) {
    scopeBytesFinal.set(scope, buildScopeAssetBytes(bundleVersion, scope, byScope.get(scope)!, calendar))
  }

  pruneOutputDir(outDir)
  mkdirSync(outDir, { recursive: true })

  const calendarFile = contentHashedFilename('calendar', 'bin', calendarBytesFinal)
  writeAsset(outDir, calendarFile, calendarBytesFinal)

  const assetFiles: string[] = []
  const manifestSeries: ManifestSeries[] = []
  const manifestAssets: Array<{ file: string; bytes: number; series: string[] }> = []

  for (const scope of scopes) {
    const bytes = scopeBytesFinal.get(scope)!
    const filename = contentHashedFilename(scope.toLowerCase(), 'bin', bytes)
    writeAsset(outDir, filename, bytes)
    assetFiles.push(filename)

    const sorted = sortByKind(byScope.get(scope)!)
    const seriesIds: string[] = []
    for (const series of sorted) {
      const kind = seriesKindToBinary(series.meta.seriesKind)
      const id = `${scope}/${kind}`
      seriesIds.push(id)
      const calendarStartIndex = alignSeriesToCalendar(calendar, series)
      const firstDate = series.dates[0]!
      const lastDate = series.dates[series.dates.length - 1]!
      manifestSeries.push({
        id,
        scope,
        kind,
        asset: filename,
        calendarStartIndex,
        length: series.values.length,
        firstDate,
        lastDate,
        units: series.meta.units,
        sources: [
          {
            source: series.meta.source,
            url: series.meta.url,
            retrievedAt: series.meta.retrievedAt,
            license: series.meta.license,
            termsUrl: series.meta.termsUrl,
          },
        ],
        seams: [],
        tiers: {
          strict: { firstDate, lastDate },
          extended: { firstDate, lastDate },
        },
      })
    }
    manifestAssets.push({ file: filename, bytes: bytes.length, series: seriesIds })
  }

  const calendarFirstDate = calendar.days[0]
  const calendarLastDate = calendar.days[calendar.days.length - 1]
  if (calendarFirstDate === undefined || calendarLastDate === undefined) {
    throw new Error('compile-data: derived calendar has no dates')
  }

  const manifest = buildManifest({
    bundleVersion,
    calendar: {
      file: calendarFile,
      bytes: calendarBytesFinal.length,
      length: calendar.days.length,
      firstDate: fromDaysSinceEpoch(calendarFirstDate),
      lastDate: fromDaysSinceEpoch(calendarLastDate),
    },
    assets: manifestAssets,
    series: manifestSeries,
    calendarExceptions: [],
  })
  const manifestFile = writeManifest(outDir, manifest)

  return { bundleVersion, calendarFile, assetFiles, manifestFile, warnings }
}
