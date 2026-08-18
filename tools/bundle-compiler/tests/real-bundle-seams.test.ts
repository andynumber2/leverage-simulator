/**
 * tools/bundle-compiler/tests/real-bundle-seams.test.ts
 *
 * DATA-06 against the REAL committed bundle, not a fixture.
 *
 * manifest.test.ts and seams.test.ts already prove seam recording and tier computation on
 * synthetic fixtures. What was only ever checked by a human reading `public/data/manifest.*.json`
 * (02-VERIFICATION.md truth 3) is that the real bundle actually carries those records: that
 * SPX/total-return still declares its interpolation and splice seams, that the rate series still
 * declares the seven splices of its source chain, and that the strict/extended tiers the UI will
 * label from are consistent with the seams sitting beside them.
 *
 * The tier check below RE-DERIVES the narrowing rule from tiers.ts's documented contract rather
 * than calling `computeTierRanges`. Calling it would compare the compiler against itself and pass
 * for any self-consistent output, including one that lost a seam. Re-deriving means a seam that
 * silently disappears moves the recomputed strict start earlier than the declared one and fails.
 *
 * Every assertion runs against data loaded at module scope, so no test depends on another test
 * having run first, and no test can pass by returning early when the data it needs is absent.
 */

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import { fromDaysSinceEpoch, toDaysSinceEpoch } from '../src/calendar.ts'
import type { DateRange, Manifest, ManifestSeries } from '../src/manifest.ts'
import type { SeamRecord } from '../src/seams.ts'

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..')
const OUT_DIR = path.join(REPO_ROOT, 'public', 'data')

function loadRealManifest(): Manifest {
  const found = readdirSync(OUT_DIR).filter(
    (entry) => entry.startsWith('manifest.') && entry.endsWith('.json'),
  )
  if (found.length !== 1) {
    throw new Error(
      `real-bundle-seams.test.ts: expected exactly one manifest.*.json in ${OUT_DIR}, found ${found.length}. Run "npm run compile-data raw public/data" first.`,
    )
  }
  return JSON.parse(readFileSync(path.join(OUT_DIR, found[0]!), 'utf8')) as Manifest
}

const MANIFEST = loadRealManifest()

/** Throws rather than returning undefined: a missing series must fail the test that needs it,
 * never let it pass vacuously. */
function seriesById(id: string): ManifestSeries {
  const found = MANIFEST.series.find((s) => s.id === id)
  if (!found) {
    throw new Error(
      `real-bundle-seams.test.ts: series "${id}" is absent from the real manifest. Present ids: ${MANIFEST.series.map((s) => s.id).join(', ')}`,
    )
  }
  return found
}

const SPX_TOTAL_RETURN = seriesById('SPX/total-return')
const RATE = seriesById('@rate/rate')

function expectCompleteProvenance(seam: SeamRecord, label: string): void {
  for (const field of ['kind', 'firstDate', 'lastDate', 'sourceBefore', 'sourceAfter', 'method'] as const) {
    const value = seam[field]
    expect(typeof value, `${label}: ${field} must be a string`).toBe('string')
    expect((value as string).trim().length, `${label}: ${field} must not be empty`).toBeGreaterThan(0)
  }
  expect(typeof seam.degradesToNonDaily, `${label}: degradesToNonDaily must be a boolean`).toBe(
    'boolean',
  )
}

describe('real bundle, SPX/total-return seams (DATA-06)', () => {
  test('carries exactly the two documented seams, an interpolation then a splice', () => {
    expect(SPX_TOTAL_RETURN.seams.map((s) => s.kind)).toEqual(['interpolation', 'splice'])
  })

  test('every seam carries complete, non-empty provenance', () => {
    SPX_TOTAL_RETURN.seams.forEach((seam, i) => {
      expectCompleteProvenance(seam, `SPX/total-return seam ${i} (${seam.kind})`)
    })
  })

  test('both seams degrade to non-daily: the interpolation itself, and the splice that hands off out of it', () => {
    const [interpolation, splice] = SPX_TOTAL_RETURN.seams as [SeamRecord, SeamRecord]
    expect(
      interpolation.degradesToNonDaily,
      'the monthly dividend interpolation is what makes the extended tier non-strict (D-14)',
    ).toBe(true)
    expect(
      splice.degradesToNonDaily,
      'the splice hands off FROM the interpolated construction, so the day it lands on is still not genuinely daily; it degrades too, and strict starts the day after it',
    ).toBe(true)
    expect(splice.sourceBefore, 'the splice leaves the interpolated construction').toContain(
      'interpolated',
    )
  })

  test('the interpolation seam precedes the splice and the two do not overlap', () => {
    const [interpolation, splice] = SPX_TOTAL_RETURN.seams as [SeamRecord, SeamRecord]
    expect(interpolation.lastDate < splice.firstDate).toBe(true)
  })
})

describe('real bundle, @rate/rate seams (DATA-06, DATA-04)', () => {
  test('carries exactly seven seams', () => {
    expect(RATE.seams.length, 'the rate series splices four sources across seven seams').toBe(7)
  })

  test('every seam carries complete, non-empty provenance', () => {
    RATE.seams.forEach((seam, i) => {
      expectCompleteProvenance(seam, `@rate/rate seam ${i} (${seam.kind})`)
    })
  })

  test('seams are ordered by firstDate ascending', () => {
    const dates = RATE.seams.map((s) => s.firstDate)
    expect(dates).toEqual([...dates].sort())
  })

  test('the splice seams form a contiguous chain in RATE_SOURCE_PRECEDENCE order', () => {
    // Only splice seams move between sources. An interpolation seam resamples one source in
    // place and a carry-forward repeats one source's last value, so both legitimately carry
    // sourceBefore === sourceAfter and must not be read as links in the chain.
    const splices = RATE.seams.filter((s) => s.kind === 'splice')
    const chain = [splices[0]!.sourceBefore, ...splices.map((s) => s.sourceAfter)]
    expect(
      chain,
      'the rate series splices NBER to TB3MS to DTB3 to DFF, in precedence order with no hole',
    ).toEqual(['RATE-NBER', 'RATE-TB3MS', 'RATE-DTB3', 'RATE-DFF'])
  })

  test('the non-splice seams stay within a single source, which is why they are not chain links', () => {
    for (const seam of RATE.seams) {
      if (seam.kind === 'splice') continue
      expect(
        seam.sourceAfter,
        `a ${seam.kind} seam must not change source, but ${seam.sourceBefore} became ${seam.sourceAfter}`,
      ).toBe(seam.sourceBefore)
    }
  })

  test('at least one seam degrades to non-daily, which is what makes any strict tier narrower than its extended tier', () => {
    expect(RATE.seams.some((s) => s.degradesToNonDaily)).toBe(true)
  })
})

/**
 * Re-derives tiers.ts's documented narrowing rule: strict.firstDate is the day after the lastDate
 * of the latest degrading seam (on the pair or on the rate series) that overlaps extended, or
 * extended.firstDate when none overlaps; strict is null when that start would pass extended's end.
 * Deliberately NOT a call to computeTierRanges, so this cannot pass by agreeing with itself.
 */
function deriveStrict(
  pairSeams: readonly SeamRecord[],
  rateSeams: readonly SeamRecord[],
  extended: DateRange,
): DateRange | null {
  let latest: string | undefined
  for (const seam of [...pairSeams, ...rateSeams]) {
    if (!seam.degradesToNonDaily) continue
    if (seam.lastDate < extended.firstDate || seam.firstDate > extended.lastDate) continue
    if (latest === undefined || seam.lastDate > latest) latest = seam.lastDate
  }
  if (latest === undefined) return { ...extended }
  const firstDate = fromDaysSinceEpoch(toDaysSinceEpoch(latest) + 1)
  if (firstDate > extended.lastDate) return null
  return { firstDate, lastDate: extended.lastDate }
}

describe('real bundle, tier labels cannot drift from the seams beside them (DATA-06, DATA-05)', () => {
  test('every series in the bundle is covered by this check, so none can be skipped silently', () => {
    expect(MANIFEST.series.length, 'the real bundle carries 23 series').toBe(23)
  })

  test('every declared strict tier equals the tier re-derived from that series own seam records', () => {
    const drifted: string[] = []
    for (const series of MANIFEST.series) {
      const extended = series.tiers.extended
      if (extended === null) {
        // With no extended range there is nothing to narrow; strict must be null too.
        expect(series.tiers.strict, `${series.id}: extended is null so strict must be null`).toBeNull()
        continue
      }
      const rateSeams = series.id === RATE.id ? [] : RATE.seams
      const derived = deriveStrict(series.seams, rateSeams, extended)
      const declared = series.tiers.strict
      const same = JSON.stringify(derived) === JSON.stringify(declared)
      if (!same) {
        drifted.push(
          `${series.id}: declared ${JSON.stringify(declared)} but seams imply ${JSON.stringify(derived)}`,
        )
      }
    }
    expect(drifted, `tier labels disagree with the seam records they are computed from:\n${drifted.join('\n')}`).toEqual([])
  })

  test('a series whose strict start is later than its extended start has a degrading seam that actually explains the gap', () => {
    let checked = 0
    for (const series of MANIFEST.series) {
      const { strict, extended } = series.tiers
      if (extended === null || strict === null) continue
      if (strict.firstDate <= extended.firstDate) continue
      checked++
      const rateSeams = series.id === RATE.id ? [] : RATE.seams
      const explaining = [...series.seams, ...rateSeams].filter(
        (s) =>
          s.degradesToNonDaily &&
          s.lastDate >= extended.firstDate &&
          s.firstDate <= extended.lastDate &&
          fromDaysSinceEpoch(toDaysSinceEpoch(s.lastDate) + 1) === strict.firstDate,
      )
      expect(
        explaining.length,
        `${series.id}: strict starts ${strict.firstDate} but no degrading seam ends the day before it`,
      ).toBeGreaterThan(0)
    }
    expect(checked, 'no narrowed series was found, so this check proved nothing').toBeGreaterThan(0)
  })

  test('a series with no degrading seam anywhere in scope has strict equal to extended', () => {
    let checked = 0
    for (const series of MANIFEST.series) {
      const extended = series.tiers.extended
      if (extended === null) continue
      const rateSeams = series.id === RATE.id ? [] : RATE.seams
      const anyDegrading = [...series.seams, ...rateSeams].some(
        (s) =>
          s.degradesToNonDaily &&
          s.lastDate >= extended.firstDate &&
          s.firstDate <= extended.lastDate,
      )
      if (anyDegrading) continue
      checked++
      expect(series.tiers.strict, `${series.id}: nothing degrades it, so strict must equal extended`).toEqual(
        extended,
      )
    }
    expect(
      checked,
      'no undegraded series was found, so this check proved nothing; if the bundle genuinely has none, delete this test rather than let it pass empty',
    ).toBeGreaterThan(0)
  })
})

describe('real bundle, seam record sanity across every series (DATA-06)', () => {
  test('no seam has firstDate after lastDate', () => {
    for (const series of MANIFEST.series) {
      series.seams.forEach((seam, i) => {
        expect(
          seam.firstDate <= seam.lastDate,
          `${series.id} seam ${i}: firstDate ${seam.firstDate} is after lastDate ${seam.lastDate}`,
        ).toBe(true)
      })
    }
  })

  test('every seam kind is one the format defines', () => {
    const known = ['interpolation', 'splice', 'carry-forward']
    for (const series of MANIFEST.series) {
      for (const seam of series.seams) {
        expect(known, `${series.id} carries an unknown seam kind "${seam.kind}"`).toContain(seam.kind)
      }
    }
  })

  test('only SPX/total-return and @rate/rate carry seams; every other series is natively daily from one source', () => {
    const withSeams = MANIFEST.series.filter((s) => s.seams.length > 0).map((s) => s.id).sort()
    expect(withSeams).toEqual(['@rate/rate', 'SPX/total-return'])
  })
})
