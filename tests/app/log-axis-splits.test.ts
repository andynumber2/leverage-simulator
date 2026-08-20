/**
 * tests/app/log-axis-splits.test.ts
 *
 * Unit-project (Node, plain `.test.ts`) coverage of `logDecadeSplits`'s totality: the property
 * whose absence is exactly what hangs uPlot's own log-axis split generator. This file lands in
 * the `unit` project automatically -- that project includes `tests/**\/*.test.ts` and excludes
 * only `tests/app/**\/*.browser.test.ts`.
 */

import { expect, test } from 'vitest'

import { logDecadeSplits, TARGET_DECADE_SPLIT_COUNT } from '../../src/app/components/ResultColumn/log-axis-splits.ts'

/** Asserts strict monotonic increase with `toBeGreaterThan`, never `toBeGreaterThanOrEqual`:
 * equality between adjacent splits is precisely the failure that hangs uPlot's real axis. */
function assertStrictlyIncreasing(splits: number[], label: string): void {
  for (let i = 1; i < splits.length; i++) {
    expect(splits[i], `${label}: splits[${i}] (${splits[i]}) is not strictly greater than splits[${i - 1}] (${splits[i - 1]})`).toBeGreaterThan(
      splits[i - 1]!,
    )
  }
}

const RANGE_TABLE: Array<{ label: string; min: number; max: number }> = [
  { label: 'the real NDX repro range', min: 1e-24, max: 1e5 },
  { label: 'the near-miss boundary at 1e-22', min: 1e-22, max: 1 },
  { label: 'the near-miss boundary at 1e-23', min: 1e-23, max: 1 },
  { label: 'an ordinary landing-page range', min: 5_000, max: 50_000 },
  { label: 'a single decade', min: 1, max: 10 },
]

test.each(RANGE_TABLE)('logDecadeSplits is strictly increasing for $label', ({ min, max }) => {
  const splits = logDecadeSplits(min, max)
  expect(splits.length, `${min} to ${max}: expected a non-empty split list`).toBeGreaterThan(0)
  assertStrictlyIncreasing(splits, `${min} to ${max}`)
})

test.each(RANGE_TABLE)('logDecadeSplits spans from at or below min to at or above max for $label', ({ min, max }) => {
  const splits = logDecadeSplits(min, max)
  expect(splits[0], `${min} to ${max}: first split (${splits[0]}) is above scaleMin (${min})`).toBeLessThanOrEqual(min)
  expect(splits[splits.length - 1], `${min} to ${max}: last split is below scaleMax (${max})`).toBeGreaterThanOrEqual(max)
})

test('logDecadeSplits length never exceeds TARGET_DECADE_SPLIT_COUNT + 2, including on absurd spans', () => {
  const cases: Array<[number, number]> = [
    [1e-24, 1e5],
    [1e-300, 1e300],
    [1, 1e308],
  ]
  for (const [min, max] of cases) {
    const splits = logDecadeSplits(min, max)
    expect(splits.length, `${min} to ${max}: split count ${splits.length} exceeds the bound`).toBeLessThanOrEqual(
      TARGET_DECADE_SPLIT_COUNT + 2,
    )
  }
})

test.each([
  ['NaN as min', Number.NaN, 100],
  ['NaN as max', 1, Number.NaN],
  ['Infinity as min', Number.POSITIVE_INFINITY, 100],
  ['Infinity as max', 1, Number.POSITIVE_INFINITY],
  ['-Infinity as min', Number.NEGATIVE_INFINITY, 100],
  ['-Infinity as max', 1, Number.NEGATIVE_INFINITY],
  ['zero as min', 0, 100],
  ['zero as max', 1, 0],
  ['a negative min', -5, 100],
  ['a negative max', 1, -5],
] as const)('logDecadeSplits returns an empty array for %s', (_label, min, max) => {
  expect(logDecadeSplits(min, max)).toEqual([])
})

test('logDecadeSplits returns the same list for swapped arguments as for the ordered call', () => {
  const ordered = logDecadeSplits(1e-24, 1e5)
  const swapped = logDecadeSplits(1e5, 1e-24)
  expect(swapped).toEqual(ordered)
})

test('logDecadeSplits returns a non-empty list when min exactly equals max', () => {
  const splits = logDecadeSplits(100, 100)
  expect(splits.length).toBeGreaterThan(0)
  assertStrictlyIncreasing(splits, 'min === max')
})
