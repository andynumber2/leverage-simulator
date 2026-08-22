/**
 * tests/value-to-color.test.ts
 *
 * 06-01-PLAN.md Task 2: pure-function coverage for `src/colorscale/value-to-color.ts`, the
 * graduated colour function (D-27a). Runs in the fast Node `unit` project, table-driven in the
 * style `tests/canvas-grid.test.ts` already uses. No DOM, no canvas, no browser: every function
 * under test is a pure typed-array-free colour calculation.
 */

import { describe, expect, test } from 'vitest'

import {
  DOMAIN_LOG_MAX,
  DOMAIN_LOG_MIN,
  INCOMPLETE_RGBA,
  RUIN_BASE_RGBA,
  interpolateRamp,
  oklabToSrgb,
  rampPositionFor,
  srgbToOklab,
  valueToColor,
  type Rgba,
} from '../src/colorscale/value-to-color.ts'

const SAMPLE_VALUES = [1e-6, 1e-4, 1e-2, 0.1, 0.5, 1, 2, 5, 10, 100, 1e4, 1e6]

describe('valueToColor: channel shape', () => {
  test('returns four integers in 0 to 255 for every value across 1e-6 to 1e6, including 0 and negative inputs', () => {
    const values = [...SAMPLE_VALUES, 0, -1, -1e6]
    for (const value of values) {
      const rgba = valueToColor({ value, ruined: false, incomplete: false })
      for (const channel of rgba) {
        expect(Number.isInteger(channel)).toBe(true)
        expect(channel).toBeGreaterThanOrEqual(0)
        expect(channel).toBeLessThanOrEqual(255)
        expect(Number.isNaN(channel)).toBe(false)
      }
    }
  })
})

describe('valueToColor: diverging centre (D-13, D-14)', () => {
  test('value exactly 1.0 returns the neutral midpoint stop, byte for byte, not an approximation', () => {
    const atOne = valueToColor({ value: 1, ruined: false, incomplete: false })
    const midpoint = interpolateRamp(0.5)
    expect(atOne).toEqual(midpoint)
  })

  test('rampPositionFor is symmetric about 1.0x to within 1e-12', () => {
    const above = rampPositionFor(10) - 0.5
    const below = 0.5 - rampPositionFor(0.1)
    expect(Math.abs(above - below)).toBeLessThan(1e-12)
  })

  test('valueToColor(10) and valueToColor(0.1) sit at ramp positions 0.75 and 0.25, equidistant from 0.5', () => {
    expect(rampPositionFor(10)).toBeCloseTo(0.75, 12)
    expect(rampPositionFor(0.1)).toBeCloseTo(0.25, 12)
  })
})

describe('valueToColor: categorical branches (D-18, D-20)', () => {
  test('ruined: true returns RUIN_BASE_RGBA for every value tested, including 1.0 and 1e6', () => {
    for (const value of SAMPLE_VALUES) {
      expect(valueToColor({ value, ruined: true, incomplete: false })).toEqual(RUIN_BASE_RGBA)
    }
  })

  test('incomplete: true returns INCOMPLETE_RGBA for every value tested', () => {
    for (const value of SAMPLE_VALUES) {
      expect(valueToColor({ value, ruined: false, incomplete: true })).toEqual(INCOMPLETE_RGBA)
    }
  })

  test('ruined wins over incomplete when both flags are set', () => {
    const result = valueToColor({ value: 1, ruined: true, incomplete: true })
    expect(result).toEqual(RUIN_BASE_RGBA)
    expect(result).not.toEqual(INCOMPLETE_RGBA)
  })
})

describe('valueToColor: fixed domain clamping (D-16)', () => {
  test('values below 10 ** DOMAIN_LOG_MIN and above 10 ** DOMAIN_LOG_MAX clamp to the endpoint colours and never return NaN channels', () => {
    const belowDomain = valueToColor({ value: 10 ** (DOMAIN_LOG_MIN - 3), ruined: false, incomplete: false })
    const atMinEndpoint = valueToColor({ value: 10 ** DOMAIN_LOG_MIN, ruined: false, incomplete: false })
    expect(belowDomain).toEqual(atMinEndpoint)

    const aboveDomain = valueToColor({ value: 10 ** (DOMAIN_LOG_MAX + 3), ruined: false, incomplete: false })
    const atMaxEndpoint = valueToColor({ value: 10 ** DOMAIN_LOG_MAX, ruined: false, incomplete: false })
    expect(aboveDomain).toEqual(atMaxEndpoint)

    for (const rgba of [belowDomain, atMinEndpoint, aboveDomain, atMaxEndpoint]) {
      for (const channel of rgba) {
        expect(Number.isNaN(channel)).toBe(false)
      }
    }
  })

  test('zero and negative values clamp to the domain minimum endpoint colour, never NaN', () => {
    const zero = valueToColor({ value: 0, ruined: false, incomplete: false })
    const negative = valueToColor({ value: -5, ruined: false, incomplete: false })
    const atMinEndpoint = valueToColor({ value: 10 ** DOMAIN_LOG_MIN, ruined: false, incomplete: false })
    expect(zero).toEqual(atMinEndpoint)
    expect(negative).toEqual(atMinEndpoint)
  })
})

function sampleRampAtEvenlySpacedT(count: number): Rgba[] {
  const samples: Rgba[] = []
  for (let i = 0; i < count; i++) {
    samples.push(interpolateRamp(i / (count - 1)))
  }
  return samples
}

describe('valueToColor: incomplete-hold separability (D-20)', () => {
  test('INCOMPLETE_RGBA is not equal to any colour the ramp produces at 33 evenly spaced samples of t', () => {
    const samples = sampleRampAtEvenlySpacedT(33)
    for (const sample of samples) {
      expect(sample).not.toEqual(INCOMPLETE_RGBA)
    }
  })
})

describe('valueToColor: perceptual uniformity (VIZ-07)', () => {
  test('the ratio of the largest to the smallest Oklab distance between 33 adjacent ramp samples is at most 2.5', () => {
    const samples = sampleRampAtEvenlySpacedT(33).map((rgba) => srgbToOklab(rgba))
    const distances: number[] = []
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i]!
      const b = samples[i + 1]!
      distances.push(Math.sqrt((a.L - b.L) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2))
    }
    const max = Math.max(...distances)
    const min = Math.min(...distances)
    expect(max / min).toBeLessThanOrEqual(2.5)
  })
})

describe('srgbToOklab / oklabToSrgb: round-trip (T-06-04)', () => {
  test('oklabToSrgb(srgbToOklab(c)) returns c for a fixed set of colours', () => {
    const colours: Rgba[] = [
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
      [0, 0, 0, 255],
      [255, 255, 255, 255],
      [196, 52, 31, 255],
      [110, 115, 120, 255],
      [8, 81, 156, 255],
      [166, 54, 3, 255],
    ]
    for (const colour of colours) {
      const roundTripped = oklabToSrgb(srgbToOklab(colour))
      expect(roundTripped).toEqual(colour)
    }
  })
})
