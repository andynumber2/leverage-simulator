/**
 * tools/bundle-compiler/src/compile.ts
 *
 * The compile pipeline as a callable function, independent of argv.
 *
 * Order: load raw inputs and their sidecars, load calendar-exceptions.json once, derive the
 * reference calendar, resolve every price/total-return series' gap policy (D-09 through D-12)
 * exactly once, splice the four rate inputs into one shared daily rate series (D-04, D-13,
 * rate-series.ts), construct each scope's pre-real-total-return run where a dividend-monthly
 * input exists (D-15, total-return.ts), compute strict/extended tiers per pair by scanning seam
 * records (D-14, D-16, tiers.ts), group the resolved series by scope, compute each asset's bytes,
 * compute the bundle version from the asset hashes, re-encode each asset with that bundle version
 * in its header, write the calendar asset, write one asset per scope plus the shared rate asset,
 * then build and write the manifest.
 *
 * Bundle version derivation is necessarily two-pass to avoid circularity: an asset's header
 * embeds the bundle version, but the bundle version is derived from the assets' own content
 * hashes. Pass 1 encodes every asset with an empty placeholder bundle version and hashes those
 * bytes; `computeBundleVersion` combines those hashes into the real bundle version. Pass 2
 * re-encodes every asset with that real value. Because the underlying data bytes never change
 * between passes, this is deterministic and reproducible. Gap policy resolution and total-return
 * construction (which determine those data bytes) are resolved once, up front, and reused by both
 * passes.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { ReferenceCalendar } from './calendar.ts'
import { deriveCalendar, fromDaysSinceEpoch, toDaysSinceEpoch } from './calendar.ts'
import { contentHashedFilename, encodeCalendarAsset, encodeSeriesAsset, writeAsset } from './encode.ts'
import { applyGapPolicy, loadCalendarExceptions, type CalendarException, type GapPolicyResult } from './gap-policy.ts'
import { buildManifest, computeBundleVersion, writeManifest, type DateRange, type ManifestSeriesInput } from './manifest.ts'
import { loadRawInputs, type RawSeries, type SidecarMeta } from './raw-input.ts'
import { buildShortRateSeries, RATE_SOURCE_PRECEDENCE } from './rate-series.ts'
import { SeamCollector } from './seams.ts'
import { assertTotalReturnSourceExists, buildTotalReturnSeries, type AlignedInputSeries } from './total-return.ts'
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
/** The raw-input scope that all four `RATE_SOURCE_PRECEDENCE` stems share (their sidecars all
 * declare `"scope": "RATE"`, derived from each filename's stem up to its first "-"). */
const RATE_SOURCE_SCOPE = 'RATE'
/** The synthetic scope the spliced rate series is emitted under in the compiled bundle. */
const RATE_SCOPE = '@rate'

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
        'compile-data: seriesKind "dividend-monthly" is a total-return construction input, not a directly compiled series',
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
  seamCollector: SeamCollector
  /** Overrides the default single-source `sources` entry when set (total-return construction). */
  extraSourceMetas?: SidecarMeta[]
}

/**
 * Resolves every compilable (price/total-return) series' gap policy exactly once. `applyGapPolicy`
 * owns every fatal decision (D-09 through D-12); this function does nothing but call it once per
 * series with a fresh SeamCollector, so each series' seams stay independent of every other
 * series'.
 */
function alignAllSeries(
  inputs: ReadonlyArray<RawSeries>,
  calendar: ReferenceCalendar,
  exceptions: ReadonlyArray<CalendarException>,
  newestDate: string,
): AlignedSeries[] {
  return inputs.map((series) => {
    const kind = seriesKindToBinary(series.meta.seriesKind)
    const seamCollector = new SeamCollector()
    const result = applyGapPolicy(series, calendar, exceptions, seamCollector, newestDate)
    return { series, kind, result, seamCollector }
  })
}

function sortAlignedByKind(items: ReadonlyArray<AlignedSeries>): AlignedSeries[] {
  return [...items].sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0))
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

function sourceEntry(meta: SidecarMeta): ManifestSeriesInput['sources'][number] {
  return { source: meta.source, url: meta.url, retrievedAt: meta.retrievedAt, license: meta.license, termsUrl: meta.termsUrl }
}

/**
 * DATA-04's coverage guarantee: the shared rate series must cover every pair's own extended tier
 * at both ends. `extended` is defined as the intersection with the rate range (tiers.ts), so this
 * always holds by construction when `computeTierRanges` is correct; this assertion is what keeps
 * that true as symbols are added, naming the pair and both dates when it does not. Exported
 * (rather than inlined) so the guard is directly unit-testable against a fault-injected series
 * list, independent of whether the full pipeline can naturally produce a violating input.
 */
export function assertRateCoversAllTiers(
  series: ReadonlyArray<{ id: string; scope: string; tiers: { extended: DateRange | null } }>,
  rateRange: DateRange,
  rateScope: string,
): void {
  for (const entry of series) {
    if (entry.scope === rateScope) continue
    const extended = entry.tiers.extended
    if (extended === null) continue
    if (rateRange.firstDate > extended.firstDate || rateRange.lastDate < extended.lastDate) {
      throw new Error(
        `compile-data: the shared rate series (${rateRange.firstDate} to ${rateRange.lastDate}) does not cover pair "${entry.id}"'s extended tier (${extended.firstDate} to ${extended.lastDate}) (DATA-04)`,
      )
    }
  }
}

const GENERATED_POINTER_FILENAME = 'data-bundle.generated.ts'

/**
 * Writes `src/data-bundle.generated.ts` (D-22): the browser-reachable, content-hashed manifest
 * path and the bundle version stamped into every asset header, so Phase 4 locates the manifest
 * through a generated pointer module rather than an unhashed, fetched-by-fixed-path document.
 * `manifestPath` is the URL the app fetches (`/data/<manifestFile>`), not a filesystem path.
 * Deterministic (a pure function of `manifestFile` and `bundleVersion`, no wall-clock value), so
 * recompiling unchanged inputs produces byte-identical output. Uses the same write-then-rename
 * discipline as `writeAsset` so an interrupted compile never leaves a truncated pointer module.
 */
function writeGeneratedPointerModule(srcDir: string, manifestFile: string, bundleVersion: string): void {
  mkdirSync(srcDir, { recursive: true })
  const manifestPath = `/data/${manifestFile}`
  const contents = `/**
 * GENERATED FILE. Do not hand-edit.
 *
 * Regenerated on every \`npm run compile-data raw public/data\` run (tools/bundle-compiler/src/
 * compile.ts's writeGeneratedPointerModule). Points at the content-hashed manifest this build
 * produced and carries the bundle version stamped into every compiled asset's header, so a
 * consumer can locate the manifest without fetching it from a fixed, unhashed path (D-22).
 */

/** Browser-reachable, content-hashed path to this build's manifest. */
export const MANIFEST_PATH = '${manifestPath}'

/** The bundle version stamped into every compiled asset header, matching the manifest's own field. */
export const BUNDLE_VERSION = '${bundleVersion}'
`
  const finalPath = path.join(srcDir, GENERATED_POINTER_FILENAME)
  const tmpPath = path.join(
    srcDir,
    `.${GENERATED_POINTER_FILENAME}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  writeFileSync(tmpPath, contents)
  renameSync(tmpPath, finalPath)
}

function rangeOf(result: { calendarStartIndex: number; values: Float64Array | number[] }, calendar: ReferenceCalendar): DateRange {
  const length = 'length' in result.values ? result.values.length : 0
  return {
    firstDate: fromDaysSinceEpoch(calendar.days[result.calendarStartIndex]!),
    lastDate: fromDaysSinceEpoch(calendar.days[result.calendarStartIndex + length - 1]!),
  }
}

/**
 * Compiles `rawDir` into `outDir`: one shared calendar asset, one shared rate asset under the
 * reserved `@rate` scope, one content-hashed asset per symbol scope, and a deterministic
 * manifest. Adding a symbol (an additional CSV+sidecar pair) changes only the emitted set, not
 * this function.
 *
 * `srcDir`, when given, also emits `${srcDir}/data-bundle.generated.ts` (D-22). Optional and
 * defaulted to skip: the compiler's own unit tests call `compileBundle` against throwaway
 * temp-directory fixtures with no real `src/` sibling, and unconditionally writing there would
 * either fail (no writable path two levels above an arbitrary OS temp directory) or, worse,
 * silently clobber the real repo's committed pointer module with fixture-derived content on
 * every test run. Only the CLI entry point (`cli.ts`), which resolves `srcDir` against the
 * actual working directory the same way it already resolves `rawDir`/`outDir`, passes it.
 */
export function compileBundle(rawDir: string, outDir: string, srcDir?: string): CompileResult {
  const allInputs = loadRawInputs(rawDir)
  const calendar = deriveCalendar(allInputs)
  const exceptions = loadCalendarExceptions(rawDir)

  // The reserved rate-source scope (all four RATE_SOURCE_PRECEDENCE raw stems share it) is
  // matched by its own `scope`, not by `seriesKind === 'rate'`: a scope other than "RATE" can
  // carry its own ordinary rate-kind series (e.g. a test fixture exercising D-09's carry-forward
  // path on a non-reserved scope), which stays in the normal per-scope compile path below.
  const rateInputs = allInputs.filter((input) => input.scope === RATE_SOURCE_SCOPE)
  const dividendMonthlyByScope = new Map<string, RawSeries>()
  for (const input of allInputs) {
    if (input.meta.seriesKind === 'dividend-monthly') dividendMonthlyByScope.set(input.scope, input)
  }
  const compilableInputs = allInputs.filter(
    (input) => input.scope !== RATE_SOURCE_SCOPE && input.meta.seriesKind !== 'dividend-monthly',
  )

  const byScope = new Map<string, RawSeries[]>()
  for (const input of compilableInputs) {
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

  const newestDate = newestLastDate(compilableInputs)
  const aligned = alignAllSeries(compilableInputs, calendar, exceptions, newestDate)

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

  // D-04/D-13: splice the four locked rate inputs into one shared daily rate series.
  const rateSeamCollector = new SeamCollector()
  const rateResult = buildShortRateSeries(rateInputs, calendar, rateSeamCollector)
  const rateRange: DateRange = {
    firstDate: fromDaysSinceEpoch(calendar.days[rateResult.calendarStartIndex]!),
    lastDate: fromDaysSinceEpoch(calendar.days[rateResult.calendarStartIndex + rateResult.values.length - 1]!),
  }

  // D-15: construct each scope's pre-real-total-return run wherever a dividend-monthly input
  // exists for it. Applies generically (no scope literal): in the current universe, only the
  // S&P carries a dividend-monthly raw input.
  for (const scope of scopes) {
    const items = alignedByScope.get(scope)!
    const priceItem = items.find((i) => i.kind === 'price-return')
    const totalReturnItem = items.find((i) => i.kind === 'total-return')
    const dividendInput = dividendMonthlyByScope.get(scope)

    // Only a scope that carries its own price-return series is a "symbol" D-15 requires a
    // total-return counterpart for; a scope whose only series is e.g. a bare rate-kind fixture
    // input is exempt (never a (price, total-return) pair in the first place).
    if (priceItem === undefined) continue

    assertTotalReturnSourceExists(scope, totalReturnItem !== undefined, dividendInput !== undefined)

    if (totalReturnItem === undefined || dividendInput === undefined) continue

    const priceAligned: AlignedInputSeries = {
      values: priceItem.result.values,
      calendarStartIndex: priceItem.result.calendarStartIndex,
      firstDate: priceItem.result.firstDate,
      lastDate: priceItem.result.lastDate,
      sourceName: priceItem.series.rawStem,
    }
    const realTrAligned: AlignedInputSeries = {
      values: totalReturnItem.result.values,
      calendarStartIndex: totalReturnItem.result.calendarStartIndex,
      firstDate: totalReturnItem.result.firstDate,
      lastDate: totalReturnItem.result.lastDate,
      sourceName: totalReturnItem.series.rawStem,
    }

    const constructed = buildTotalReturnSeries(
      scope,
      priceAligned,
      realTrAligned,
      dividendInput,
      calendar,
      totalReturnItem.seamCollector,
    )

    if (constructed.calendarStartIndex !== realTrAligned.calendarStartIndex) {
      totalReturnItem.result = {
        ...totalReturnItem.result,
        values: constructed.values,
        calendarStartIndex: constructed.calendarStartIndex,
        firstDate: fromDaysSinceEpoch(calendar.days[constructed.calendarStartIndex]!),
        lastDate: totalReturnItem.result.lastDate,
      }
      totalReturnItem.extraSourceMetas = [priceItem.series.meta, dividendInput.meta, totalReturnItem.series.meta]
    }
  }

  // Pass 1: placeholder bundle version, used only to derive a stable bundleVersion string.
  const PLACEHOLDER_BUNDLE_VERSION = ''
  const calendarBytesPass1 = encodeCalendarAsset(PLACEHOLDER_BUNDLE_VERSION, calendar.days)
  const scopeBytesPass1 = new Map<string, Uint8Array>()
  for (const scope of scopes) {
    scopeBytesPass1.set(scope, buildScopeAssetBytes(PLACEHOLDER_BUNDLE_VERSION, scope, alignedByScope.get(scope)!))
  }
  const rateDescriptorPass1: Omit<SeriesDescriptor, 'dataByteOffset'> = {
    kind: 'rate',
    id: `${RATE_SCOPE}/rate`,
    calendarStartIndex: rateResult.calendarStartIndex,
    length: rateResult.values.length,
  }
  const rateBytesPass1 = encodeSeriesAsset(PLACEHOLDER_BUNDLE_VERSION, RATE_SCOPE, [rateDescriptorPass1], [rateResult.values])

  const hashEntries: Array<{ name: string; hash: string }> = [
    { name: 'calendar', hash: sha256Hex10(calendarBytesPass1) },
    { name: RATE_SCOPE, hash: sha256Hex10(rateBytesPass1) },
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
  const rateBytesFinal = encodeSeriesAsset(bundleVersion, RATE_SCOPE, [rateDescriptorPass1], [rateResult.values])

  pruneOutputDir(outDir)
  mkdirSync(outDir, { recursive: true })

  const calendarFile = contentHashedFilename('calendar', 'bin', calendarBytesFinal)
  writeAsset(outDir, calendarFile, calendarBytesFinal)

  const assetFiles: string[] = []
  const manifestSeries: ManifestSeriesInput[] = []
  const manifestAssets: Array<{ file: string; bytes: number; series: string[] }> = []

  // The shared rate asset and its manifest entry.
  const rateFile = contentHashedFilename(RATE_SCOPE.replace('@', 'rate-').toLowerCase(), 'bin', rateBytesFinal)
  writeAsset(outDir, rateFile, rateBytesFinal)
  assetFiles.push(rateFile)
  const rateSeamRecords = rateSeamCollector.records()
  const rateContributingMetas = RATE_SOURCE_PRECEDENCE.map((stem) => rateInputs.find((i) => i.rawStem === stem)?.meta).filter(
    (m): m is SidecarMeta => m !== undefined,
  )
  const rateId = `${RATE_SCOPE}/rate`
  manifestSeries.push({
    id: rateId,
    scope: RATE_SCOPE,
    kind: 'rate',
    asset: rateFile,
    calendarStartIndex: rateResult.calendarStartIndex,
    length: rateResult.values.length,
    firstDate: rateRange.firstDate,
    lastDate: rateRange.lastDate,
    units: 'percent-annualized',
    sources: rateContributingMetas.map(sourceEntry),
    seams: rateSeamRecords,
  })
  manifestAssets.push({ file: rateFile, bytes: rateBytesFinal.length, series: [rateId] })

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
      const pairRange = rangeOf(item.result, calendar)
      const contributingMetas = item.extraSourceMetas ?? [item.series.meta]
      const sortedMetas = [...contributingMetas].sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : 0))
      const pairSeamRecords = item.seamCollector.records()
      manifestSeries.push({
        id,
        scope,
        kind: item.kind,
        asset: filename,
        calendarStartIndex: item.result.calendarStartIndex,
        length: item.result.values.length,
        firstDate: pairRange.firstDate,
        lastDate: pairRange.lastDate,
        units: item.series.meta.units,
        sources: sortedMetas.map(sourceEntry),
        seams: pairSeamRecords,
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
    rateSeams: rateSeamRecords,
    rateRange,
    calendarExceptions: exceptions,
  })

  assertRateCoversAllTiers(manifest.series, rateRange, RATE_SCOPE)

  const manifestFile = writeManifest(outDir, manifest)

  if (srcDir !== undefined) {
    writeGeneratedPointerModule(srcDir, manifestFile, bundleVersion)
  }

  return { bundleVersion, calendarFile, assetFiles, manifestFile, warnings }
}
