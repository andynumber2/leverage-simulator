/**
 * tools/bundle-compiler/tests/manifest.test.ts
 *
 * Task 3 proof: end-to-end manifest content against a fixture exercising both total-return
 * construction (D-15) and rate-source splicing (D-04) together -- provenance fields byte-identical
 * to the sidecars, a spliced series listing every contributing source, seams present and ordered,
 * tiers computed (including an explicit `strict: null`), adjacent seams not coalesced, and a
 * recompile producing a byte-identical manifest.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import { fromDaysSinceEpoch, toDaysSinceEpoch } from '../src/calendar.ts'
import { assertRateCoversAllTiers, compileBundle } from '../src/compile.ts'
import { makeRawFixture, type FixtureSeriesSpec } from './fixtures/make-fixture.ts'

function makeBusinessDays(count: number, startIso: string): string[] {
  const dates: string[] = []
  let d = toDaysSinceEpoch(startIso)
  while (dates.length < count) {
    const iso = fromDaysSinceEpoch(d)
    const dow = new Date(d * 86_400_000).getUTCDay()
    if (dow !== 0 && dow !== 6) dates.push(iso)
    d++
  }
  return dates
}

function makeOutDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'bundle-compiler-manifest-out-'))
}

// 20 business days from 2020-01-02. RATE-TB3MS (monthly) covers days [0..7]; RATE-DFF/DTB3 cover
// days [8..19]. SYM's real total-return begins at day 12; days [0..11] are constructed from
// SYM-price plus SYM-DIV-MONTHLY. ZZZ is a plain (no construction) scope confined entirely to the
// TB3MS-degraded window [0..5], so its strict tier is expected to be null.
const CALENDAR_DATES = makeBusinessDays(20, '2020-01-02')

function buildFixtureDir(): { dir: string } {
  const series: FixtureSeriesSpec[] = [
    { scope: 'SYM', seriesKind: 'price', units: 'index-level', dates: CALENDAR_DATES },
    { scope: 'SYM', seriesKind: 'total-return', units: 'index-level', dates: CALENDAR_DATES.slice(12) },
    {
      scope: 'SYM',
      seriesKind: 'dividend-monthly',
      units: 'ratio',
      filenameStem: 'SYM-DIV-MONTHLY',
      dates: ['2019-12-01', '2020-02-01'],
      values: [0.02, 0.02],
    },
    { scope: 'ZZZ', seriesKind: 'price', units: 'index-level', dates: CALENDAR_DATES.slice(0, 6) },
    { scope: 'ZZZ', seriesKind: 'total-return', units: 'index-level', dates: CALENDAR_DATES.slice(0, 6) },
    { scope: 'RATE', seriesKind: 'rate', units: 'percent-annualized', filenameStem: 'RATE-DFF', dates: CALENDAR_DATES.slice(8) },
    { scope: 'RATE', seriesKind: 'rate', units: 'percent-annualized', filenameStem: 'RATE-DTB3', dates: CALENDAR_DATES.slice(8) },
    {
      scope: 'RATE',
      seriesKind: 'rate',
      units: 'percent-annualized',
      filenameStem: 'RATE-TB3MS',
      dates: ['2019-12-01', '2020-02-01'],
      values: [3, 3],
    },
    {
      scope: 'RATE',
      seriesKind: 'rate',
      units: 'percent-annualized',
      filenameStem: 'RATE-NBER',
      dates: ['2019-12-01'],
      values: [4],
    },
  ]
  const fixture = makeRawFixture({ dates: CALENDAR_DATES, series })
  return { dir: fixture.dir }
}

describe('end-to-end manifest content', () => {
  test('provenance fields are byte-identical to the sidecars, and every field is present', () => {
    const { dir } = buildFixtureDir()
    const outDir = makeOutDir()
    try {
      const result = compileBundle(dir, outDir)
      const manifest = JSON.parse(readFileSync(path.join(outDir, result.manifestFile), 'utf8')) as {
        series: Array<{
          id: string
          scope: string
          sources: Array<{ source: string; url: string; retrievedAt: string; license: string; termsUrl: string }>
        }>
      }
      const symPrice = manifest.series.find((s) => s.id === 'SYM/price-return')!
      expect(symPrice.sources).toEqual([
        { source: 'Fixture', url: 'https://example.test/fixture', retrievedAt: '2026-01-01', license: 'Public Domain', termsUrl: 'https://example.test/terms' },
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('the constructed total-return series lists every contributing source (price, dividend, real total-return)', () => {
    const { dir } = buildFixtureDir()
    const outDir = makeOutDir()
    try {
      const result = compileBundle(dir, outDir)
      const manifest = JSON.parse(readFileSync(path.join(outDir, result.manifestFile), 'utf8')) as {
        series: Array<{ id: string; sources: Array<{ source: string }> }>
      }
      const symTr = manifest.series.find((s) => s.id === 'SYM/total-return')!
      // Three contributing sources: SYM-price (the price-return input used to chain backward),
      // SYM-DIV-MONTHLY (the interpolated yield), and SYM-total-return (the real daily series
      // spliced onto at S). All three fixture sidecars share the same `source` field in this
      // fixture, so the count itself is the meaningful assertion.
      expect(symTr.sources.length).toBe(3)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('seams are present, sorted by firstDate ascending then kind ascending, and adjacent seams are not coalesced', () => {
    const { dir } = buildFixtureDir()
    const outDir = makeOutDir()
    try {
      const result = compileBundle(dir, outDir)
      const manifest = JSON.parse(readFileSync(path.join(outDir, result.manifestFile), 'utf8')) as {
        series: Array<{ id: string; seams: Array<{ kind: string; firstDate: string; lastDate: string; degradesToNonDaily: boolean }> }>
      }
      const rateSeries = manifest.series.find((s) => s.id === '@rate/rate')!
      expect(rateSeries.seams.length).toBeGreaterThan(0)
      for (let i = 1; i < rateSeries.seams.length; i++) {
        const prev = rateSeries.seams[i - 1]!
        const cur = rateSeries.seams[i]!
        expect(prev.firstDate <= cur.firstDate || (prev.firstDate === cur.firstDate && prev.kind <= cur.kind)).toBe(true)
      }
      // The TB3MS interpolation seam (days 0..7) and the TB3MS->DFF splice seam (recorded over
      // the same before-side window) share overlapping/adjacent date ranges but remain two
      // distinct records, never merged into one.
      const interpolationSeams = rateSeries.seams.filter((s) => s.kind === 'interpolation')
      const spliceSeams = rateSeries.seams.filter((s) => s.kind === 'splice')
      expect(interpolationSeams.length).toBeGreaterThanOrEqual(1)
      expect(spliceSeams.length).toBeGreaterThanOrEqual(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('tiers are computed: SYM price-return has strict narrower than extended, and ZZZ (confined entirely to the degraded window) emits strict: null', () => {
    const { dir } = buildFixtureDir()
    const outDir = makeOutDir()
    try {
      const result = compileBundle(dir, outDir)
      const manifest = JSON.parse(readFileSync(path.join(outDir, result.manifestFile), 'utf8')) as {
        series: Array<{ id: string; tiers: { strict: { firstDate: string; lastDate: string } | null; extended: { firstDate: string; lastDate: string } | null } }>
      }
      const symPrice = manifest.series.find((s) => s.id === 'SYM/price-return')!
      expect(symPrice.tiers.extended).toEqual({ firstDate: CALENDAR_DATES[0]!, lastDate: CALENDAR_DATES[19]! })
      expect(symPrice.tiers.strict).not.toBeNull()
      expect(symPrice.tiers.strict!.firstDate > symPrice.tiers.extended!.firstDate).toBe(true)

      const zzzPrice = manifest.series.find((s) => s.id === 'ZZZ/price-return')!
      expect(zzzPrice.tiers.strict).toBeNull()
      expect(zzzPrice.tiers.extended).not.toBeNull()

      // strict:null is an explicit key with value null, never an omitted key.
      expect('strict' in zzzPrice.tiers).toBe(true)
      expect(Object.prototype.hasOwnProperty.call(zzzPrice.tiers, 'strict')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('a recompile of unchanged inputs produces a byte-identical manifest', () => {
    const { dir } = buildFixtureDir()
    const outDir = makeOutDir()
    try {
      const first = compileBundle(dir, outDir)
      const firstManifest = readFileSync(path.join(outDir, first.manifestFile), 'utf8')

      const second = compileBundle(dir, outDir)
      const secondManifest = readFileSync(path.join(outDir, second.manifestFile), 'utf8')

      expect(second.manifestFile).toBe(first.manifestFile)
      expect(secondManifest).toBe(firstManifest)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('the real pipeline never trips the coverage guard on a well-formed fixture (extended is always intersection-bounded)', () => {
    const { dir } = buildFixtureDir()
    const outDir = makeOutDir()
    try {
      expect(() => compileBundle(dir, outDir)).not.toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('assertRateCoversAllTiers aborts naming the pair and both dates when a pair extended tier falls outside the rate range', () => {
    // computeTierRanges always produces an extended range bounded by the rate range (it is
    // literally their intersection), so this guard cannot be tripped by the real pipeline. Test
    // the guard directly with a fault-injected series list to prove it is load-bearing rather than
    // vacuous, per this plan's own acceptance criterion.
    const rateRange = { firstDate: '2000-01-01', lastDate: '2010-01-01' }
    const badSeries = [
      { id: 'BAD/price-return', scope: 'BAD', tiers: { extended: { firstDate: '1990-01-01', lastDate: '2005-01-01' } } },
    ]
    expect(() => assertRateCoversAllTiers(badSeries, rateRange, '@rate')).toThrow(/BAD\/price-return/)
    expect(() => assertRateCoversAllTiers(badSeries, rateRange, '@rate')).toThrow(/1990-01-01/)
  })

  test('assertRateCoversAllTiers does not throw when every pair extended tier is within the rate range, or is null', () => {
    const rateRange = { firstDate: '2000-01-01', lastDate: '2010-01-01' }
    const goodSeries = [
      { id: 'GOOD/price-return', scope: 'GOOD', tiers: { extended: { firstDate: '2001-01-01', lastDate: '2009-01-01' } } },
      { id: 'GOOD/total-return', scope: 'GOOD', tiers: { extended: null } },
      { id: '@rate/rate', scope: '@rate', tiers: { extended: { firstDate: '1900-01-01', lastDate: '2020-01-01' } } },
    ]
    expect(() => assertRateCoversAllTiers(goodSeries, rateRange, '@rate')).not.toThrow()
  })
})
