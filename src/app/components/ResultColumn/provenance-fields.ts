/**
 * src/app/components/ResultColumn/provenance-fields.ts
 *
 * D-13 through D-16: the ONLY place a provenance string the strip renders is composed.
 * `buildProvenanceFields` returns one record per Copywriting Contract row (tier, date range,
 * sources, seams-crossed, bundle version), each carrying a `manifestPath` naming exactly where its
 * content came from -- what makes D-16's traceability test possible: a rendered string with no
 * resolvable manifest origin is a build-time failure, never a rendering decision (see
 * `resolveManifestPath` below and `tests/app/provenance-strip.test.ts`'s real-bundle case).
 *
 * D-15: this module never reads a source's usage-terms text or its terms-of-use link -- only the
 * `source` display name and the `url` an anchor should point at. Neither of those two fields is
 * named anywhere in this file, including in comments, so a future edit that accidentally wires one
 * in is at least visible on inspection.
 *
 * No JSX and no reactive-framework import here: this module is a plain `.ts` sibling of
 * `log-axis-splits.ts`, testable in the Node `unit` vitest project (that project cannot parse
 * `.tsx`).
 */

import type { Manifest, ManifestSeries } from '../../../../tools/bundle-compiler/src/manifest.ts'
import type { SeamRecord } from '../../../../tools/bundle-compiler/src/seams.ts'
import type { Tier } from '../../bounds.ts'

/** The minimal shape `crossedSeams`/`buildProvenanceFields` need from a run's actual computed
 * window -- `KernelInputs['window']` satisfies this structurally without importing the whole
 * (much larger) `KernelInputs` type into a module that has no other reason to know about it. */
export interface ProvenanceWindow {
  firstDate: string
  lastDate: string
}

/** One source's display name and outbound link, carried separately from `ProvenanceField.value`
 * (which holds the plain-text fallback) so the renderer can build a real anchor per source
 * (T-05-08: only when `url` is `http(s)`, plain text otherwise -- that check belongs to the
 * renderer, not here). */
export interface ProvenanceSourceLink {
  name: string
  url: string
}

/** One row the provenance strip renders. `value` is the field's full, Copywriting-Contract-exact
 * rendered text (D-13's "generated from manifest provenance" fields are already sentence-shaped:
 * "Bundle v{version}" and "{N} seam{s} in this run: {summary}" have no common "label: value" split,
 * so `value` intentionally carries the whole composed string rather than a bare fragment).
 * `manifestPath` is a dotted path string that `resolveManifestPath` below can walk against a
 * `Manifest` object to find exactly the value `value` was built from; every field declares one,
 * because a field with no manifest origin cannot be constructed at all -- there is no optional
 * variant of this type. */
export interface ProvenanceField {
  id: 'tier' | 'date-range' | 'sources' | 'seams-crossed' | 'bundle-version'
  label: string
  value: string
  manifestPath: string
  /** Only present on the sources field; one entry per `ManifestSeries.sources[]` record, in
   * manifest array order. */
  sourceLinks?: ProvenanceSourceLink[]
}

/**
 * Resolves a dotted `path` against `manifest`, supporting three segment shapes:
 *   - a plain object-property name (`bundleVersion`)
 *   - `series[<id>]`, which looks the named series up in `manifest.series` by its `id` (series ids
 *     contain `/` but never `.`, so this segment is always exactly one dot-separated token)
 *   - `<name>[<index>]`, a numeric array index into the property named `<name>` on the current
 *     object (`sources[0]`, `seams[2]`)
 * Returns `undefined` the moment any segment fails to resolve, rather than throwing -- the D-16
 * traceability test treats an unresolved path as a failing assertion, not a crashed test run.
 */
export function resolveManifestPath(manifest: Manifest, path: string): unknown {
  const segments = path.split('.')
  let current: unknown = manifest

  for (const segment of segments) {
    if (current === null || current === undefined) return undefined

    const seriesMatch = /^series\[(.+)\]$/.exec(segment)
    if (seriesMatch) {
      const id = seriesMatch[1]!
      const manifestObj = current as Manifest
      if (!Array.isArray(manifestObj.series)) return undefined
      current = manifestObj.series.find((s) => s.id === id)
      continue
    }

    const arrayMatch = /^(\w+)\[(\d+)\]$/.exec(segment)
    if (arrayMatch) {
      const key = arrayMatch[1]!
      const index = Number(arrayMatch[2]!)
      const container = (current as Record<string, unknown>)[key]
      current = Array.isArray(container) ? container[index] : undefined
      continue
    }

    current = (current as Record<string, unknown>)[segment]
  }

  return current
}

function findManifestSeries(manifest: Manifest, seriesId: string): ManifestSeries {
  const entry = manifest.series.find((s) => s.id === seriesId)
  if (entry === undefined) {
    const existingIds = manifest.series.map((s) => s.id).sort()
    throw new Error(
      `provenance-fields: no series named "${seriesId}" in the manifest; existing series ids: ${existingIds.join(', ')}`,
    )
  }
  return entry
}

/**
 * D-14: an inclusive interval-overlap filter -- a seam is crossed when its `firstDate` is at or
 * before the window's `lastDate` AND its `lastDate` is at or after the window's `firstDate`, so a
 * seam whose boundary exactly touches a run-window boundary counts as crossed. ISO `YYYY-MM-DD`
 * strings compare correctly with plain `<`/`>` (lexicographic order matches calendar order for a
 * fixed-width, zero-padded format).
 *
 * Sorted ascending by `firstDate`. `Array.prototype.sort` has been a stable sort since ES2019, and
 * `.filter` preserves the input array's relative order, so two seams sharing a `firstDate` keep
 * their original `seams` array order here without any extra bookkeeping -- stably, across repeated
 * calls with the same input.
 */
export function crossedSeams(seams: readonly SeamRecord[], window: ProvenanceWindow): SeamRecord[] {
  return seams
    .filter((seam) => seam.firstDate <= window.lastDate && seam.lastDate >= window.firstDate)
    .sort((a, b) => {
      if (a.firstDate === b.firstDate) return 0
      return a.firstDate < b.firstDate ? -1 : 1
    })
}

/** D-14: one crossed seam's dates and kind, dense enough for a strip that must stay bounded by how
 * many seams a single run window can cross (never by the series' total seam count). */
function formatSeamEntry(seam: SeamRecord): string {
  return `${seam.firstDate}–${seam.lastDate} (${seam.kind})`
}

/**
 * Builds the ordered field list the provenance strip renders (Copywriting Contract order: tier,
 * date range, sources, seams-crossed, bundle version), for `seriesId`'s manifest entry over the
 * run's actual `window`. Throws if `seriesId` is not in `manifest.series`, or if `tier` names a
 * tier range the series' manifest entry does not carry (`tiers.strict`/`tiers.extended` is
 * `null`) -- both are programmer/data-integrity errors, not something a reader can recover from by
 * seeing a blank field.
 */
export function buildProvenanceFields(
  manifest: Manifest,
  seriesId: string,
  window: ProvenanceWindow,
  tier: Tier,
  bundleVersion: string,
): ProvenanceField[] {
  const series = findManifestSeries(manifest, seriesId)
  const fields: ProvenanceField[] = []

  // Tier. D-16's traceability check for this one field is necessarily existence-only (does
  // `series.tiers.<tier>` resolve to a real, non-null range?) rather than substring containment:
  // the manifest never spells "Strict"/"Extended" out as a literal string value anywhere -- those
  // words name which of the two nullable tier ranges is active, they are not manifest DATA. A
  // series claiming a tier the manifest has no range for is exactly the drift D-16 exists to catch,
  // so the path still has to resolve to something real; there is just no literal text to quote.
  const tierRange = tier === 'strict' ? series.tiers.strict : series.tiers.extended
  if (tierRange === null) {
    throw new Error(`provenance-fields: series "${seriesId}" has no "${tier}" tier range in the manifest`)
  }
  fields.push({
    id: 'tier',
    label: 'Tier',
    value: `Tier: ${tier === 'strict' ? 'Strict' : 'Extended'}`,
    manifestPath: `series[${seriesId}].tiers.${tier}`,
  })

  // Date range: the run's EFFECTIVE window (D-13), not the series' full declared range -- matching
  // `ResultSummaryHeader`'s prior behaviour. `manifestPath` names the series' own `firstDate` as the
  // value's conceptual origin (a run's window is always bounded by it); the two coincide exactly
  // when `window` covers the series' own full range, which is how the D-16 real-bundle test in
  // `tests/app/provenance-strip.test.ts` deliberately invokes this function for every series.
  fields.push({
    id: 'date-range',
    label: 'Data',
    value: `Data: ${window.firstDate}–${window.lastDate}`,
    manifestPath: `series[${seriesId}].firstDate`,
  })

  // Sources: never reads a usage-terms field of any kind (D-15) -- only `source` (display name)
  // and `url` (outbound link) are ever read off `series.sources[]`.
  const sourceLinks: ProvenanceSourceLink[] = series.sources.map((s) => ({ name: s.source, url: s.url }))
  const sourceNames = sourceLinks.map((s) => s.name).join(', ')
  fields.push({
    id: 'sources',
    label: 'Sources',
    value: `Sources: ${sourceNames}`,
    manifestPath: `series[${seriesId}].sources[0].source`,
    sourceLinks,
  })

  // Seams-crossed: D-14, omitted entirely (no record at all) when the window crosses zero seams,
  // never rendered as a zero count. Singular/plural per the Copywriting Contract.
  const crossed = crossedSeams(series.seams, window)
  if (crossed.length > 0) {
    const seamWord = crossed.length === 1 ? 'seam' : 'seams'
    const summary = crossed.map(formatSeamEntry).join('; ')
    const firstCrossedIndex = series.seams.indexOf(crossed[0]!)
    fields.push({
      id: 'seams-crossed',
      label: 'Seams',
      value: `${crossed.length} ${seamWord} in this run: ${summary}`,
      manifestPath: `series[${seriesId}].seams[${firstCrossedIndex}].firstDate`,
    })
  }

  // Bundle version: unchanged display from the prior header, now sourced through this builder --
  // `bundleVersion` is the caller's already-resolved `KernelInputs.meta.bundleVersion`, which is
  // always `manifest.bundleVersion` in production (`src/data/kernel-inputs.ts`).
  fields.push({
    id: 'bundle-version',
    label: 'Bundle',
    value: `Bundle v${bundleVersion}`,
    manifestPath: 'bundleVersion',
  })

  return fields
}
