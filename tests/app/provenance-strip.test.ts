/**
 * tests/app/provenance-strip.test.ts
 *
 * Task 1: `buildProvenanceFields`/`crossedSeams` against a synthetic manifest fixture with a
 * controlled seam set -- two seams sharing a first date, a seam touching each window boundary, and
 * a source carrying non-empty usage-terms text the strip must never render or trace to.
 *
 * Task 3 adds the D-16 traceability case below, run against the REAL committed bundle manifest
 * (`loadBundleFromDisk`) rather than this file's fixture: for every series, `buildProvenanceFields`
 * is called over that series' own full declared date range specifically so every field's
 * `manifestPath` resolves to a value the field's rendered `value` genuinely contains (see
 * `provenance-fields.ts`'s own header comment on why the date-range field's path only provably
 * holds under that exact window choice).
 */

import { describe, expect, test } from 'vitest'

import type { Manifest, ManifestSeries } from '../../tools/bundle-compiler/src/manifest.ts'
import type { SeamRecord } from '../../tools/bundle-compiler/src/seams.ts'
import { loadBundleFromDisk } from '../../src/data/load-bundle-node.ts'
import {
  buildProvenanceFields,
  crossedSeams,
  resolveManifestPath,
  type ProvenanceField,
} from '../../src/app/components/ResultColumn/provenance-fields.ts'

const NON_MANIFEST_USAGE_TERMS_TEXT = 'Personal-use-only, no redistribution grant of any kind'

function makeSeam(overrides: Partial<SeamRecord>): SeamRecord {
  return {
    kind: 'splice',
    firstDate: '2000-01-01',
    lastDate: '2000-01-01',
    sourceBefore: 'SRC-A',
    sourceAfter: 'SRC-B',
    method: 'test fixture seam',
    degradesToNonDaily: false,
    ...overrides,
  }
}

// D-14 fixture: touches both window boundaries, two seams sharing a firstDate (in a deliberately
// non-sorted array position so the stable-order assertion is meaningful), and one seam entirely
// outside the test window (used by the zero-crossed-seams case below with a different window).
const FIXTURE_SEAMS: SeamRecord[] = [
  makeSeam({ kind: 'interpolation', firstDate: '2000-03-01', lastDate: '2000-05-01' }), // shared-firstDate #2
  makeSeam({ kind: 'carry-forward', firstDate: '1990-01-01', lastDate: '1990-12-31' }), // outside window
  makeSeam({ kind: 'splice', firstDate: '2000-03-01', lastDate: '2000-04-01' }), // shared-firstDate #1
  makeSeam({ kind: 'interpolation', firstDate: '1999-01-01', lastDate: '2000-01-01' }), // touches lower bound
  makeSeam({ kind: 'splice', firstDate: '2000-12-31', lastDate: '2001-06-01' }), // touches upper bound
]

const FIXTURE_SERIES_ID = 'FIX/total-return'

function makeFixtureSeries(overrides: Partial<ManifestSeries> = {}): ManifestSeries {
  return {
    id: FIXTURE_SERIES_ID,
    scope: 'FIX',
    kind: 'total-return',
    asset: 'fix.deadbeef.bin',
    calendarStartIndex: 0,
    length: 100,
    firstDate: '1980-01-01',
    lastDate: '2020-01-01',
    units: 'index-level',
    sources: [
      {
        source: 'Fixture Primary Source',
        url: 'https://example.test/primary',
        retrievedAt: '2026-01-01',
        license: NON_MANIFEST_USAGE_TERMS_TEXT,
        termsUrl: 'https://example.test/terms',
      },
      {
        source: 'Fixture Secondary Source',
        url: 'https://example.test/secondary',
        retrievedAt: '2026-01-01',
        license: 'Explicitly redistributable',
        termsUrl: 'https://example.test/terms2',
      },
    ],
    seams: FIXTURE_SEAMS,
    tiers: {
      strict: { firstDate: '1990-01-01', lastDate: '2020-01-01' },
      extended: { firstDate: '1980-01-01', lastDate: '2020-01-01' },
    },
    ...overrides,
  }
}

function makeFixtureManifest(series: ManifestSeries[] = [makeFixtureSeries()]): Manifest {
  return {
    formatVersion: 1,
    bundleVersion: 'abc123def456',
    calendar: { file: 'calendar.deadbeef.bin', bytes: 100, length: 100, firstDate: '1980-01-01', lastDate: '2020-01-01' },
    assets: [{ file: 'fix.deadbeef.bin', bytes: 100, series: [FIXTURE_SERIES_ID] }],
    series,
    calendarExceptions: [],
  }
}

const FIXTURE_WINDOW = { firstDate: '2000-01-01', lastDate: '2000-12-31' }

/** Resolves `field.manifestPath` against `manifest` and asserts the built `value` genuinely
 * contains the resolved value's string form -- the same check `tests/app/provenance-strip.test.ts`
 * (this file, real-bundle case) makes D-16's build-failing assertion for every field. Structural
 * (non-primitive) resolved values are checked for existence only, matching the tier field's own
 * documented exception in `provenance-fields.ts`. */
function assertFieldTraces(manifest: Manifest, field: ProvenanceField): void {
  const resolved = resolveManifestPath(manifest, field.manifestPath)
  expect(resolved, `manifestPath "${field.manifestPath}" for field "${field.id}" did not resolve`).not.toBeUndefined()
  if (typeof resolved === 'string' || typeof resolved === 'number') {
    expect(
      field.value.includes(String(resolved)),
      `field "${field.id}"'s rendered value "${field.value}" does not contain its manifestPath's resolved value "${String(resolved)}"`,
    ).toBe(true)
  }
}

describe('buildProvenanceFields', () => {
  test('every field traces to a resolvable manifest path, and no field renders a usage-terms string', () => {
    // Window = the fixture series' own full declared range, deliberately (not FIXTURE_WINDOW):
    // the date-range field's manifestPath names the series' own firstDate as its origin
    // (provenance-fields.ts's header comment), which only provably appears inside the rendered
    // value when the run's window covers the series' full range -- exactly how the real-bundle
    // D-16 case below invokes buildProvenanceFields for every series.
    const series = makeFixtureSeries()
    const manifest = makeFixtureManifest([series])
    const fullRangeWindow = { firstDate: series.firstDate, lastDate: series.lastDate }
    const fields = buildProvenanceFields(manifest, FIXTURE_SERIES_ID, fullRangeWindow, 'strict', manifest.bundleVersion)

    expect(fields.map((f) => f.id)).toEqual(['tier', 'date-range', 'sources', 'seams-crossed', 'bundle-version'])
    for (const field of fields) {
      assertFieldTraces(manifest, field)
      expect(field.value.includes(NON_MANIFEST_USAGE_TERMS_TEXT)).toBe(false)
      expect(field.value.includes('https://example.test/terms')).toBe(false)
    }
  })

  test('a window crossing zero seams produces no seams-crossed field at all', () => {
    const manifest = makeFixtureManifest()
    const remoteWindow = { firstDate: '1900-01-01', lastDate: '1900-12-31' }
    const fields = buildProvenanceFields(manifest, FIXTURE_SERIES_ID, remoteWindow, 'strict', manifest.bundleVersion)
    expect(fields.find((f) => f.id === 'seams-crossed')).toBeUndefined()
  })

  test('a window crossing exactly one seam renders singular copy', () => {
    const manifest = makeFixtureManifest([
      makeFixtureSeries({ seams: [makeSeam({ kind: 'splice', firstDate: '2000-06-01', lastDate: '2000-06-15' })] }),
    ])
    const fields = buildProvenanceFields(manifest, FIXTURE_SERIES_ID, FIXTURE_WINDOW, 'strict', manifest.bundleVersion)
    const seamField = fields.find((f) => f.id === 'seams-crossed')
    expect(seamField?.value.startsWith('1 seam in this run:')).toBe(true)
  })

  test('a window crossing two or more seams renders plural copy', () => {
    const manifest = makeFixtureManifest()
    const fields = buildProvenanceFields(manifest, FIXTURE_SERIES_ID, FIXTURE_WINDOW, 'strict', manifest.bundleVersion)
    const seamField = fields.find((f) => f.id === 'seams-crossed')
    expect(seamField?.value.startsWith('4 seams in this run:')).toBe(true)
  })

  test('a seam whose lastDate equals the window firstDate is reported as crossed', () => {
    const crossed = crossedSeams(FIXTURE_SEAMS, FIXTURE_WINDOW)
    expect(crossed.some((s) => s.firstDate === '1999-01-01' && s.lastDate === '2000-01-01')).toBe(true)
  })

  test('a seam whose firstDate equals the window lastDate is reported as crossed', () => {
    const crossed = crossedSeams(FIXTURE_SEAMS, FIXTURE_WINDOW)
    expect(crossed.some((s) => s.firstDate === '2000-12-31' && s.lastDate === '2001-06-01')).toBe(true)
  })

  test('a seam entirely outside the window is not reported as crossed', () => {
    const crossed = crossedSeams(FIXTURE_SEAMS, FIXTURE_WINDOW)
    expect(crossed.some((s) => s.firstDate === '1990-01-01')).toBe(false)
  })

  test('crossed seams are ordered ascending by firstDate, and two seams sharing a firstDate keep manifest array order, stably across repeated calls', () => {
    const firstCall = crossedSeams(FIXTURE_SEAMS, FIXTURE_WINDOW)
    const secondCall = crossedSeams(FIXTURE_SEAMS, FIXTURE_WINDOW)

    const dates = firstCall.map((s) => s.firstDate)
    const sortedDates = [...dates].sort()
    expect(dates).toEqual(sortedDates)

    // The two 2000-03-01 seams appear in FIXTURE_SEAMS as [interpolation, ..., splice] (index 0
    // before index 2); their relative order among the crossed, sorted results must match that.
    const sharedFirstDateSeams = firstCall.filter((s) => s.firstDate === '2000-03-01')
    expect(sharedFirstDateSeams.map((s) => s.kind)).toEqual(['interpolation', 'splice'])

    expect(secondCall.map((s) => `${s.firstDate}|${s.kind}`)).toEqual(firstCall.map((s) => `${s.firstDate}|${s.kind}`))
  })

  test('sources field carries one sourceLink per manifest source, name and url only', () => {
    const manifest = makeFixtureManifest()
    const fields = buildProvenanceFields(manifest, FIXTURE_SERIES_ID, FIXTURE_WINDOW, 'strict', manifest.bundleVersion)
    const sourcesField = fields.find((f) => f.id === 'sources')
    expect(sourcesField?.sourceLinks).toEqual([
      { name: 'Fixture Primary Source', url: 'https://example.test/primary' },
      { name: 'Fixture Secondary Source', url: 'https://example.test/secondary' },
    ])
  })

  test('the tier field renders "Strict" for the strict tier and "Extended" for the extended tier', () => {
    const manifest = makeFixtureManifest()
    const strictFields = buildProvenanceFields(manifest, FIXTURE_SERIES_ID, FIXTURE_WINDOW, 'strict', manifest.bundleVersion)
    const extendedFields = buildProvenanceFields(manifest, FIXTURE_SERIES_ID, FIXTURE_WINDOW, 'extended', manifest.bundleVersion)
    expect(strictFields.find((f) => f.id === 'tier')?.value).toBe('Tier: Strict')
    expect(extendedFields.find((f) => f.id === 'tier')?.value).toBe('Tier: Extended')
  })

  test('the bundle-version field renders the caller-supplied bundle version', () => {
    const manifest = makeFixtureManifest()
    const fields = buildProvenanceFields(manifest, FIXTURE_SERIES_ID, FIXTURE_WINDOW, 'strict', 'zzz999yyy888')
    expect(fields.find((f) => f.id === 'bundle-version')?.value).toBe('Bundle vzzz999yyy888')
  })

  test('an unknown series id throws, naming the offending id', () => {
    const manifest = makeFixtureManifest()
    expect(() => buildProvenanceFields(manifest, 'NOPE/total-return', FIXTURE_WINDOW, 'strict', manifest.bundleVersion)).toThrowError(
      /NOPE\/total-return/,
    )
  })

  test('a tier the series manifest carries no range for throws', () => {
    const manifest = makeFixtureManifest([makeFixtureSeries({ tiers: { strict: null, extended: { firstDate: '1980-01-01', lastDate: '2020-01-01' } } })])
    expect(() => buildProvenanceFields(manifest, FIXTURE_SERIES_ID, FIXTURE_WINDOW, 'strict', manifest.bundleVersion)).toThrowError(/strict/)
  })
})

describe('D-16: real-bundle manifest traceability (build-failing gate)', () => {
  test('every field, for every series in the real committed bundle, traces to a resolvable manifest path with no usage-terms leakage', async () => {
    const bundle = await loadBundleFromDisk()
    const manifest = bundle.manifest
    expect(manifest.series.length).toBeGreaterThan(0)

    for (const series of manifest.series) {
      const window = { firstDate: series.firstDate, lastDate: series.lastDate }
      const fields = buildProvenanceFields(manifest, series.id, window, 'strict', manifest.bundleVersion)

      for (const field of fields) {
        assertFieldTraces(manifest, field)
      }

      const usageTermsStrings = series.sources.flatMap((s) => [s.license, s.termsUrl])
      for (const field of fields) {
        for (const forbidden of usageTermsStrings) {
          if (forbidden === '') continue
          expect(
            field.value.includes(forbidden),
            `series "${series.id}" field "${field.id}" rendered a usage-terms string: "${forbidden}"`,
          ).toBe(false)
        }
      }
    }
  })
})
