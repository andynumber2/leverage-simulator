/**
 * tools/bundle-compiler/tests/seams.test.ts
 *
 * Task 3 proof: computeTierRanges scans seam records (never a hand-declared literal) to compute
 * the strict and extended range for one (scope, dividend mode) pair, driven directly by hand-built
 * seam lists so the tier rule is tested independently of the compile pipeline (D-14, D-16).
 */

import { describe, expect, test } from 'vitest'

import { computeTierRanges } from '../src/tiers.ts'
import type { SeamRecord } from '../src/seams.ts'

function seam(overrides: Partial<SeamRecord> & Pick<SeamRecord, 'firstDate' | 'lastDate' | 'degradesToNonDaily'>): SeamRecord {
  return {
    kind: 'interpolation',
    sourceBefore: 'TEST',
    sourceAfter: 'TEST',
    method: 'test seam',
    ...overrides,
  }
}

describe('computeTierRanges', () => {
  test('extended is the intersection of the pair range and the rate range', () => {
    const result = computeTierRanges([], [], { firstDate: '1990-01-01', lastDate: '2020-12-31' }, { firstDate: '1954-01-01', lastDate: '2020-12-31' })
    expect(result.extended).toEqual({ firstDate: '1990-01-01', lastDate: '2020-12-31' })
  })

  test('extended is null when the pair range and rate range do not intersect', () => {
    const result = computeTierRanges([], [], { firstDate: '1990-01-01', lastDate: '1995-01-01' }, { firstDate: '2000-01-01', lastDate: '2020-01-01' })
    expect(result.extended).toBeNull()
    expect(result.strict).toBeNull()
  })

  test('strict equals extended when no degrading seam overlaps, and both are emitted', () => {
    const pairSeams: SeamRecord[] = [seam({ firstDate: '1990-01-01', lastDate: '1990-01-05', degradesToNonDaily: false, kind: 'carry-forward' })]
    const result = computeTierRanges(pairSeams, [], { firstDate: '1988-01-04', lastDate: '2020-12-31' }, { firstDate: '1954-01-01', lastDate: '2020-12-31' })
    expect(result.extended).toEqual({ firstDate: '1988-01-04', lastDate: '2020-12-31' })
    expect(result.strict).toEqual(result.extended)
  })

  test('strict narrows to the day after the latest degrading seam overlapping extended', () => {
    const pairSeams: SeamRecord[] = [seam({ firstDate: '1927-12-30', lastDate: '1987-12-31', degradesToNonDaily: true, kind: 'interpolation' })]
    const result = computeTierRanges(pairSeams, [], { firstDate: '1927-12-30', lastDate: '2020-12-31' }, { firstDate: '1920-01-01', lastDate: '2020-12-31' })
    expect(result.extended).toEqual({ firstDate: '1927-12-30', lastDate: '2020-12-31' })
    expect(result.strict).toEqual({ firstDate: '1988-01-01', lastDate: '2020-12-31' })
  })

  test('a pair whose degrading seams cover its whole extended range emits strict: null, never zero-length or inverted', () => {
    const pairSeams: SeamRecord[] = [seam({ firstDate: '1927-12-30', lastDate: '2020-12-31', degradesToNonDaily: true, kind: 'interpolation' })]
    const result = computeTierRanges(pairSeams, [], { firstDate: '1927-12-30', lastDate: '2020-12-31' }, { firstDate: '1920-01-01', lastDate: '2020-12-31' })
    expect(result.strict).toBeNull()
    expect(result.extended).toEqual({ firstDate: '1927-12-30', lastDate: '2020-12-31' })
  })

  test('a series with no seams emits equal strict and extended ranges', () => {
    const result = computeTierRanges([], [], { firstDate: '2000-01-01', lastDate: '2020-01-01' }, { firstDate: '1990-01-01', lastDate: '2025-01-01' })
    expect(result.strict).toEqual(result.extended)
  })

  test('a seam entirely outside the extended range does not narrow strict', () => {
    const pairSeams: SeamRecord[] = [seam({ firstDate: '1900-01-01', lastDate: '1905-01-01', degradesToNonDaily: true, kind: 'interpolation' })]
    const result = computeTierRanges(pairSeams, [], { firstDate: '1990-01-01', lastDate: '2020-01-01' }, { firstDate: '1954-01-01', lastDate: '2020-01-01' })
    expect(result.strict).toEqual(result.extended)
  })

  test('the tier is a property of the pair: price-return and total-return pairs for the same scope narrow independently', () => {
    // R: the rate series degrades to monthly before 1954-07-01 (DFF's own first date).
    const rateSeams: SeamRecord[] = [
      seam({ firstDate: '1920-01-01', lastDate: '1954-06-30', degradesToNonDaily: true, kind: 'interpolation', sourceBefore: 'RATE-TB3MS' }),
    ]
    // S: the scope's total-return construction covers everything before 1988-01-04.
    const priceReturnPairSeams: SeamRecord[] = []
    const totalReturnPairSeams: SeamRecord[] = [
      seam({ firstDate: '1927-12-30', lastDate: '1988-01-03', degradesToNonDaily: true, kind: 'interpolation', sourceBefore: 'SPX-DIV-MONTHLY' }),
    ]
    const rateRange = { firstDate: '1920-01-01', lastDate: '2026-08-14' }
    const priceReturnRange = { firstDate: '1927-12-30', lastDate: '2026-08-17' }
    const totalReturnRange = { firstDate: '1988-01-04', lastDate: '2026-08-17' }

    const priceReturnTiers = computeTierRanges(priceReturnPairSeams, rateSeams, priceReturnRange, rateRange)
    const totalReturnTiers = computeTierRanges(totalReturnPairSeams, rateSeams, totalReturnRange, rateRange)

    // Price-return strict starts the day after R (1954-06-30 + 1 = 1954-07-01).
    expect(priceReturnTiers.strict!.firstDate).toBe('1954-07-01')
    // Total-return strict starts the day after S (1988-01-03 + 1 = 1988-01-04), later than R.
    expect(totalReturnTiers.strict!.firstDate).toBe('1988-01-04')
    expect(totalReturnTiers.strict!.firstDate > priceReturnTiers.strict!.firstDate).toBe(true)
  })
})
