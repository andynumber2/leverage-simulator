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
  ANNUALIZED_DOMAIN_MAX,
  ANNUALIZED_DOMAIN_MIN,
  DOMAIN_LOG_MAX,
  DOMAIN_LOG_MIN,
  DRAWDOWN_DOMAIN_MAX,
  DRAWDOWN_DOMAIN_MIN,
  INCOMPLETE_RGBA,
  RUIN_BASE_RGBA,
  bandLevelsForMetric,
  buildRampInterpolator,
  interpolateRamp,
  interpolateSequentialRamp,
  oklabToSrgb,
  rampPositionFor,
  rampPositionForMetric,
  scaleTypeForMetric,
  srgbToOklab,
  valueToColor,
  type Rgba,
  type SweepMetric,
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

// -------------------------------------------------------------------------------------------
// 07-02-PLAN.md Task 1: buildRampInterpolator's mechanical refactor must not move a single
// existing diverging-ramp output. Every assertion above this line is UNCHANGED from before this
// plan (git diff on this file shows additions only below).
// -------------------------------------------------------------------------------------------

describe('buildRampInterpolator: equivalence with the pre-refactor interpolateRamp', () => {
  const equivalenceT = [0, 0.001, 0.25, 0.5, 0.75, 0.999, 1]

  test('buildRampInterpolator(RAMP_STOPS)(t) equals interpolateRamp(t) at seven fixed points', () => {
    const rebuilt = buildRampInterpolator([
      { t: 0.0, hex: '#08519C' },
      { t: 0.25, hex: '#3182BD' },
      { t: 0.5, hex: '#A9A29A' },
      { t: 0.75, hex: '#E6550D' },
      { t: 1.0, hex: '#A63603' },
    ])
    for (const t of equivalenceT) {
      expect(rebuilt(t)).toEqual(interpolateRamp(t))
    }
  })

  test('buildRampInterpolator(RAMP_STOPS)(t) equals interpolateRamp(t) across 33 evenly spaced samples', () => {
    const rebuilt = buildRampInterpolator([
      { t: 0.0, hex: '#08519C' },
      { t: 0.25, hex: '#3182BD' },
      { t: 0.5, hex: '#A9A29A' },
      { t: 0.75, hex: '#E6550D' },
      { t: 1.0, hex: '#A63603' },
    ])
    for (let i = 0; i < 33; i++) {
      const t = i / 32
      expect(rebuilt(t)).toEqual(interpolateRamp(t))
    }
  })

  test('a stops array with fewer than two entries throws', () => {
    expect(() => buildRampInterpolator([{ t: 0, hex: '#000000' }])).toThrow()
  })

  test('a two-element stops array with descending t throws', () => {
    expect(() =>
      buildRampInterpolator([
        { t: 1, hex: '#ffffff' },
        { t: 0, hex: '#000000' },
      ]),
    ).toThrow()
  })
})

// -------------------------------------------------------------------------------------------
// 07-02-PLAN.md Task 2: the sequential drawdown ramp (D-25) and the three fixed per-metric
// domains (D-26).
// -------------------------------------------------------------------------------------------

describe('interpolateSequentialRamp: endpoints and separation from the diverging ramp', () => {
  test('interpolateSequentialRamp(0) is #EEEBFB and interpolateSequentialRamp(1) is #3B1B7E', () => {
    expect(interpolateSequentialRamp(0)).toEqual([0xee, 0xeb, 0xfb, 255])
    expect(interpolateSequentialRamp(1)).toEqual([0x3b, 0x1b, 0x7e, 255])
  })

  test('interpolateSequentialRamp differs from interpolateRamp at t = 0.25, 0.5 and 0.75', () => {
    for (const t of [0.25, 0.5, 0.75]) {
      expect(interpolateSequentialRamp(t)).not.toEqual(interpolateRamp(t))
    }
  })
})

describe('interpolateSequentialRamp: perceptual uniformity (VIZ-07)', () => {
  test('the ratio of the largest to the smallest Oklab distance between 33 adjacent ramp samples is at most 2.5', () => {
    const samples: Rgba[] = []
    for (let i = 0; i < 33; i++) {
      samples.push(interpolateSequentialRamp(i / 32))
    }
    const oklabSamples = samples.map((rgba) => srgbToOklab(rgba))
    const distances: number[] = []
    for (let i = 0; i < oklabSamples.length - 1; i++) {
      const a = oklabSamples[i]!
      const b = oklabSamples[i + 1]!
      distances.push(Math.sqrt((a.L - b.L) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2))
    }
    const max = Math.max(...distances)
    const min = Math.min(...distances)
    expect(max / min).toBeLessThanOrEqual(2.5)
  })
})

describe('scaleTypeForMetric', () => {
  test('drawdown is sequential; multiple and annualized are diverging', () => {
    expect(scaleTypeForMetric('drawdown')).toBe('sequential')
    expect(scaleTypeForMetric('multiple')).toBe('diverging')
    expect(scaleTypeForMetric('annualized')).toBe('diverging')
  })
})

describe('rampPositionForMetric: diverging centres land at exactly 0.5', () => {
  test('rampPositionForMetric(1.0, "multiple") is exactly 0.5', () => {
    expect(rampPositionForMetric(1.0, 'multiple')).toBe(0.5)
  })

  test('rampPositionForMetric(0, "annualized") is exactly 0.5', () => {
    expect(rampPositionForMetric(0, 'annualized')).toBe(0.5)
  })

  test('rampPositionForMetric(0, "drawdown") is exactly 0', () => {
    expect(rampPositionForMetric(0, 'drawdown')).toBe(0)
  })

  test('values beyond a metric domain clamp to 0 or 1 rather than throwing or extrapolating', () => {
    expect(rampPositionForMetric(DRAWDOWN_DOMAIN_MIN - 5, 'drawdown')).toBe(0)
    expect(rampPositionForMetric(DRAWDOWN_DOMAIN_MAX + 5, 'drawdown')).toBe(1)
    expect(rampPositionForMetric(ANNUALIZED_DOMAIN_MIN - 5, 'annualized')).toBe(0)
    expect(rampPositionForMetric(ANNUALIZED_DOMAIN_MAX + 5, 'annualized')).toBe(1)
  })
})

describe('bandLevelsForMetric', () => {
  const metrics: readonly SweepMetric[] = ['multiple', 'drawdown', 'annualized']

  test.each(metrics)('%s: starts at 0, ends at 1, and is strictly ascending', (metric) => {
    const levels = bandLevelsForMetric(metric)
    expect(levels[0]).toBe(0)
    expect(levels[levels.length - 1]).toBe(1)
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]!).toBeGreaterThan(levels[i - 1]!)
    }
  })
})
