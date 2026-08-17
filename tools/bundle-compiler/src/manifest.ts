/**
 * tools/bundle-compiler/src/manifest.ts
 *
 * Manifest type, deterministic builder, writer. Every provenance field is copied from the loaded
 * SidecarMeta; nothing in this file synthesizes a source, a url, a retrieval date, a licence or a
 * terms url (D-06). No wall-clock timestamp appears anywhere in the manifest, so recompiling
 * identical inputs is byte-reproducible.
 */

import { createHash } from 'node:crypto'

import { FORMAT_VERSION, type SeriesKind } from './binary-format.ts'
import { contentHashedFilename, writeAsset } from './encode.ts'
import type { SeamRecord } from './seams.ts'
import { computeTierRanges } from './tiers.ts'

export interface DateRange {
  firstDate: string
  lastDate: string
}

export interface ManifestSeries {
  id: string
  scope: string
  kind: SeriesKind
  asset: string
  calendarStartIndex: number
  length: number
  firstDate: string
  lastDate: string
  units: string
  sources: Array<{ source: string; url: string; retrievedAt: string; license: string; termsUrl: string }>
  seams: SeamRecord[]
  tiers: { strict: DateRange | null; extended: DateRange | null }
}

/** Everything `buildManifest` needs about one series before its `tiers` field is computed. */
export type ManifestSeriesInput = Omit<ManifestSeries, 'tiers'>

export interface Manifest {
  formatVersion: number
  bundleVersion: string
  calendar: { file: string; bytes: number; length: number; firstDate: string; lastDate: string }
  assets: Array<{ file: string; bytes: number; series: string[] }>
  series: ManifestSeries[]
  calendarExceptions: Array<{ scope: string; date: string; reason: string }>
}

/**
 * Returns the first 12 hex characters of the SHA-256 of FORMAT_VERSION joined with every emitted
 * asset's own content hash, `sortedAssetContentHashes` already given in sorted filename order.
 * Contains no wall-clock value, so recompiling identical inputs produces an identical bundle
 * version.
 */
export function computeBundleVersion(sortedAssetContentHashes: ReadonlyArray<string>): string {
  const hash = createHash('sha256')
  hash.update(String(FORMAT_VERSION))
  for (const contentHash of sortedAssetContentHashes) {
    hash.update(contentHash)
  }
  return hash.digest('hex').slice(0, 12)
}

export interface BuildManifestInput {
  bundleVersion: string
  calendar: Manifest['calendar']
  assets: Manifest['assets']
  series: ManifestSeriesInput[]
  /** The shared rate series' own seam records and date range, against which every pair's tier is
   * computed (D-14, D-16, DATA-05). Passing the rate series' own entry through this same path
   * (its own seams as both `pairSeams` and `rateSeams`, its own range as both `pairRange` and
   * `rateRange`) yields the correct self-referential tier for the rate series' own manifest entry,
   * with no special case needed. */
  rateSeams: SeamRecord[]
  rateRange: DateRange
  calendarExceptions: Manifest['calendarExceptions']
}

/**
 * Builds the manifest with `series` sorted scope ascending then kind ascending, `assets` sorted
 * filename ascending, `calendarExceptions` sorted scope ascending then date ascending (so a
 * recompile is byte-reproducible regardless of the exceptions file's authored order), and object
 * keys in a fixed authored order (criterion 3, DATA-06 ordering). Each series' `tiers` is computed
 * here, by scanning its own seam records against the shared rate series' (D-14, D-16): nothing
 * upstream declares a tier boundary as a literal.
 */
export function buildManifest(input: BuildManifestInput): Manifest {
  const series = [...input.series]
    .map((s): ManifestSeries => ({
      ...s,
      tiers: computeTierRanges(s.seams, input.rateSeams, { firstDate: s.firstDate, lastDate: s.lastDate }, input.rateRange),
    }))
    .sort((a, b) => {
      if (a.scope !== b.scope) return a.scope < b.scope ? -1 : 1
      if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1
      return 0
    })
  const assets = [...input.assets].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
  const calendarExceptions = [...input.calendarExceptions].sort((a, b) => {
    if (a.scope !== b.scope) return a.scope < b.scope ? -1 : 1
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    return 0
  })

  return {
    formatVersion: FORMAT_VERSION,
    bundleVersion: input.bundleVersion,
    calendar: input.calendar,
    assets,
    series,
    calendarExceptions,
  }
}

/**
 * Serializes `manifest` as UTF-8 JSON with no byte-order mark, writes it via the same
 * write-then-rename discipline as `writeAsset`, and names the file with
 * `contentHashedFilename('manifest', 'json', ...)` computed over the manifest bytes with the
 * bundle version already in place.
 */
export function writeManifest(outDir: string, manifest: Manifest): string {
  const json = JSON.stringify(manifest, null, 2)
  const bytes = new TextEncoder().encode(json)
  const filename = contentHashedFilename('manifest', 'json', bytes)
  writeAsset(outDir, filename, bytes)
  return filename
}
