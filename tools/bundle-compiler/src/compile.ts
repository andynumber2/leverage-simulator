/**
 * tools/bundle-compiler/src/compile.ts
 *
 * The compile pipeline as a callable function, independent of argv.
 *
 * Order: load raw inputs and their sidecars, load calendar-exceptions.json once, derive the
 * reference calendar, resolve every series' gap policy (D-09 through D-12) exactly once, group
 * the resolved series by scope, compute each asset's bytes, compute the bundle version from the
 * asset hashes, re-encode each asset with that bundle version in its header, write the calendar
 * asset, write one asset per scope, then build and write the manifest.
 *
 * Bundle version derivation is necessarily two-pass to avoid circularity: an asset's header
 * embeds the bundle version, but the bundle version is derived from the assets' own content
 * hashes. Pass 1 encodes every asset with an empty placeholder bundle version and hashes those
 * bytes; `computeBundleVersion` combines those hashes into the real bundle version. Pass 2
 * re-encodes every asset with that real bundle version. Because the underlying data bytes never
 * change between passes, this is deterministic and reproducible: recompiling unchanged raw inputs
 * always yields the same bundle version and the same final asset bytes. Gap policy resolution
 * (which determines those data bytes) is resolved once, up front, and reused by both passes.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'

import type { ReferenceCalendar } from './calendar.ts'
import { deriveCalendar, fromDaysSinceEpoch } from './calendar.ts'
import { contentHashedFilename, encodeCalendarAsset, encodeSeriesAsset, writeAsset } from './encode.ts'
import { applyGapPolicy, loadCalendarExceptions, type CalendarException, type GapPolicyResult } from './gap-policy.ts'
import { buildManifest, computeBundleVersion, writeManifest, type ManifestSeries } from './manifest.ts'
import { loadRawInputs, type RawSeries, type SidecarMeta } from './raw-input.ts'
import { SeamCollector, type SeamRecord } from './seams.ts'
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

function sha256Hex10(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 10)
}

function newestLastDate(inputs: ReadonlyArray<RawSeries>): string {
  let newest: string | undefined
  for (const series of inputs) {
    const last = series.dates[series.dates.length - 1]
    if (last !== undefined && (newest === undefined || last > newest)) newest = last
  }
  if (newest === undefined) {
    throw new Error('compile-data: no raw series loaded, nothing to derive a newest date from')
  }
  return newest
}

interface AlignedSeries {
  series: RawSeries
  kind: SeriesKind
  result: GapPolicyResult
  seams: SeamRecord[]
}

/**
 * Resolves every loaded series' gap policy exactly once. `applyGapPolicy` owns every fatal
 * decision (D-09 through D-12); this function does nothing but call it once per series with a
 * fresh SeamCollector, so each series' seams stay independent of every other series'.
 */
function alignAllSeries(
  inputs: ReadonlyArray<RawSeries>,
  calendar: ReferenceCalendar,
  exceptions: ReadonlyArray<CalendarException>,
  newestDate: string,
): AlignedSeries[] {
  return inputs.map((series) => {
    const kind = seriesKindToBinary(series.meta.seriesKind)
    const seams = new SeamCollector()
    const result = applyGapPolicy(series, calendar, exceptions, seams, newestDate)
    return { series, kind, result, seams: seams.records() }
  })
}

function sortAlignedByKind(items: ReadonlyArray<AlignedSeries>): AlignedSeries[] {
  return [...items].sort((a, b) => {
    const ka = a.series.meta.seriesKind
    const kb = b.series.meta.seriesKind
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })
}

function buildScopeAssetBytes(bundleVersion: string, scope: string, aligned: ReadonlyArray<AlignedSeries>): Uint8Array {
  const sorted = sortAlignedByKind(aligned)
  const descriptors: Array<Omit<SeriesDescriptor, 'dataByteOffset'>> = []
  const values: Float64Array[] = []

  for (const item of sorted) {
    descriptors.push({
      kind: item.kind,
      id: `${scope}/${item.kind}`,
      calendarStartIndex: item.result.calendarStartIndex,
      length: item.result.values.length,
    })
    values.push(item.result.values)
  }

  return encodeSeriesAsset(bundleVersion, scope, descriptors, values)
}

/**
 * Compiles `rawDir` into `outDir`: one shared calendar asset, one content-hashed asset per scope,
 * and a deterministic manifest. Adding a symbol (an additional CSV+sidecar pair) changes only the
 * emitted set, not this function.
 */
export function compileBundle(rawDir: string, outDir: string): CompileResult {
  const inputs = loadRawInputs(rawDir)
  const calendar = deriveCalendar(inputs)
  const exceptions = loadCalendarExceptions(rawDir)

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

  // D-11: an exception naming a scope no raw input provides is a stale override left behind
  // after a symbol was removed, and must be surfaced rather than silently ignored.
  const scopeSet = new Set(scopes)
  for (const exception of exceptions) {
    if (!scopeSet.has(exception.scope)) {
      throw new Error(
        `compile-data: raw/calendar-exceptions.json names scope "${exception.scope}" which no raw input provides; remove the stale entry or restore the input (D-11)`,
      )
    }
  }

  const newestDate = newestLastDate(inputs)
  const aligned = alignAllSeries(inputs, calendar, exceptions, newestDate)

  const alignedByScope = new Map<string, AlignedSeries[]>()
  for (const item of aligned) {
    const existing = alignedByScope.get(item.series.scope)
    if (existing) {
      existing.push(item)
    } else {
      alignedByScope.set(item.series.scope, [item])
    }
  }

  const warnings: string[] = []
  for (const item of aligned) warnings.push(...item.result.warnings)

  // Pass 1: placeholder bundle version, used only to derive a stable bundleVersion string.
  const PLACEHOLDER_BUNDLE_VERSION = ''
  const calendarBytesPass1 = encodeCalendarAsset(PLACEHOLDER_BUNDLE_VERSION, calendar.days)
  const scopeBytesPass1 = new Map<string, Uint8Array>()
  for (const scope of scopes) {
    scopeBytesPass1.set(scope, buildScopeAssetBytes(PLACEHOLDER_BUNDLE_VERSION, scope, alignedByScope.get(scope)!))
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
    scopeBytesFinal.set(scope, buildScopeAssetBytes(bundleVersion, scope, alignedByScope.get(scope)!))
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

    const sorted = sortAlignedByKind(alignedByScope.get(scope)!)
    const seriesIds: string[] = []
    for (const item of sorted) {
      const id = `${scope}/${item.kind}`
      seriesIds.push(id)
      const firstDate = fromDaysSinceEpoch(calendar.days[item.result.calendarStartIndex]!)
      const lastDate = fromDaysSinceEpoch(calendar.days[item.result.calendarStartIndex + item.result.values.length - 1]!)
      manifestSeries.push({
        id,
        scope,
        kind: item.kind,
        asset: filename,
        calendarStartIndex: item.result.calendarStartIndex,
        length: item.result.values.length,
        firstDate,
        lastDate,
        units: item.series.meta.units,
        sources: [
          {
            source: item.series.meta.source,
            url: item.series.meta.url,
            retrievedAt: item.series.meta.retrievedAt,
            license: item.series.meta.license,
            termsUrl: item.series.meta.termsUrl,
          },
        ],
        seams: item.seams,
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
    calendarExceptions: exceptions,
  })
  const manifestFile = writeManifest(outDir, manifest)

  return { bundleVersion, calendarFile, assetFiles, manifestFile, warnings }
}
