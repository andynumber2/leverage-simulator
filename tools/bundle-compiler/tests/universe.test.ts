/**
 * tools/bundle-compiler/tests/universe.test.ts
 *
 * Coverage assertion over the real, committed manifest (not a fixture) — the manifest produced
 * by `npm run compile-data raw public/data` against the committed `raw/` tree. Asserts:
 * every symbol in DATA-07's declared universe carries exactly one price-return and one
 * total-return series entry; the shared rate series and the calendar are present; every series
 * carries at least one source with a non-empty url, license and termsUrl; every series carries an
 * explicit `tiers` object with both keys present; and the rate series' range covers the widest
 * extended range across all pairs at both ends (DATA-04's coverage guarantee, also enforced live
 * by `assertRateCoversAllTiers` in compile.ts).
 *
 * The expected symbol list is a literal here, not derived from the manifest itself (per this
 * plan's own instruction), so adding a symbol to the bundle without updating this list is caught
 * rather than silently accepted.
 */

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import type { Manifest } from '../src/manifest.ts'

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..')
const OUT_DIR = path.join(REPO_ROOT, 'public', 'data')

/** DATA-07's declared bundled universe. */
const EXPECTED_SYMBOLS = ['SPX', 'NDX', 'QQQ', 'UPRO', 'TQQQ', 'SSO', 'QLD', 'VTI', 'EFA', 'EEM', 'TLT'] as const

function loadRealManifest(): Manifest {
  const manifestFiles = readdirSync(OUT_DIR).filter((entry) => entry.startsWith('manifest.') && entry.endsWith('.json'))
  if (manifestFiles.length !== 1) {
    throw new Error(
      `universe.test.ts: expected exactly one manifest.*.json in ${OUT_DIR}, found ${manifestFiles.length}. Run "npm run compile-data raw public/data" first.`,
    )
  }
  return JSON.parse(readFileSync(path.join(OUT_DIR, manifestFiles[0]!), 'utf8')) as Manifest
}

describe('real compiled bundle: universe coverage (DATA-07)', () => {
  const manifest = loadRealManifest()

  test('every declared symbol has exactly one price-return and one total-return series', () => {
    for (const symbol of EXPECTED_SYMBOLS) {
      const priceReturnCount = manifest.series.filter((s) => s.scope === symbol && s.kind === 'price-return').length
      const totalReturnCount = manifest.series.filter((s) => s.scope === symbol && s.kind === 'total-return').length
      expect(priceReturnCount, `${symbol} price-return count`).toBe(1)
      expect(totalReturnCount, `${symbol} total-return count`).toBe(1)
    }
  })

  test('no unexpected symbol is present, and no expected symbol is missing', () => {
    const compiledScopes = new Set(manifest.series.filter((s) => s.kind !== 'rate').map((s) => s.scope))
    expect([...compiledScopes].sort()).toEqual([...EXPECTED_SYMBOLS].sort())
  })

  test('the shared rate series and the calendar are present', () => {
    const rate = manifest.series.find((s) => s.kind === 'rate')
    expect(rate).toBeDefined()
    expect(rate?.scope).toBe('@rate')
    expect(manifest.calendar.length).toBeGreaterThan(0)
    expect(manifest.calendar.file.length).toBeGreaterThan(0)
  })

  test('every series carries at least one source with a non-empty url, license and termsUrl', () => {
    for (const series of manifest.series) {
      expect(series.sources.length, `${series.id} source count`).toBeGreaterThan(0)
      for (const source of series.sources) {
        expect(source.url.length, `${series.id} source url`).toBeGreaterThan(0)
        expect(source.license.length, `${series.id} source license`).toBeGreaterThan(0)
        expect(source.termsUrl.length, `${series.id} source termsUrl`).toBeGreaterThan(0)
      }
    }
  })

  test('every series carries an explicit tiers object with both keys present', () => {
    for (const series of manifest.series) {
      expect(series.tiers, series.id).toHaveProperty('strict')
      expect(series.tiers, series.id).toHaveProperty('extended')
    }
  })

  test("the rate series' range covers the widest extended range across all pairs at both ends (DATA-04)", () => {
    const rate = manifest.series.find((s) => s.kind === 'rate')
    expect(rate).toBeDefined()

    let widestFirst: string | undefined
    let widestLast: string | undefined
    for (const series of manifest.series) {
      if (series.kind === 'rate') continue
      const extended = series.tiers.extended
      if (extended === null) continue
      if (widestFirst === undefined || extended.firstDate < widestFirst) widestFirst = extended.firstDate
      if (widestLast === undefined || extended.lastDate > widestLast) widestLast = extended.lastDate
    }
    expect(widestFirst).toBeDefined()
    expect(widestLast).toBeDefined()
    expect(rate!.firstDate <= widestFirst!).toBe(true)
    expect(rate!.lastDate >= widestLast!).toBe(true)
  })

  // Assert presence of both series per symbol only, never equal start dates: ragged left edges
  // are normal and are now asymmetric within a symbol as well as across symbols (D-12, D-14).
  // Verified against 02-06-SUMMARY.md and 02-07-SUMMARY.md's recorded ranges.
  test('NDX price-return and total-return carry different, legitimately ragged left edges (D-12, D-14)', () => {
    const priceReturn = manifest.series.find((s) => s.id === 'NDX/price-return')
    const totalReturn = manifest.series.find((s) => s.id === 'NDX/total-return')
    expect(priceReturn?.firstDate).toBe('1985-10-01')
    expect(totalReturn?.firstDate).toBe('1999-03-04')
  })

  test('SPX price-return and total-return strict tiers start on different dates (D-14: tier is a property of the pair)', () => {
    const priceReturn = manifest.series.find((s) => s.id === 'SPX/price-return')
    const totalReturn = manifest.series.find((s) => s.id === 'SPX/total-return')
    expect(priceReturn?.tiers.strict?.firstDate).not.toBe(totalReturn?.tiers.strict?.firstDate)
  })

  test('no calendar disagreement was resolved by weakening the gap policy: exceptions file may be empty, but every entry present carries a written reason', () => {
    for (const exception of manifest.calendarExceptions) {
      expect(exception.reason.trim().length, `exception on ${exception.scope}/${exception.date}`).toBeGreaterThanOrEqual(20)
    }
  })
})
