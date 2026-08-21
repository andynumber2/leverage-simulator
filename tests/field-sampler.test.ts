/**
 * tests/field-sampler.test.ts: 06-03-PLAN.md Task 1, pure determinism and interpolation
 * assertions for `mockups/shared/field-sampler.ts`'s two rendering primitives, against analytic
 * fields, in the style `tests/canvas-grid.test.ts` uses. Runs in the fast Node `unit` project:
 * `field-sampler.ts` has no DOM dependency.
 */

import { describe, expect, test } from 'vitest'

import {
  CELL_FLAG_INCOMPLETE,
  CELL_FLAG_RUINED,
  type SweepFixture,
  type SweepFixtureMeta,
} from '../src/data/sweep-fixture-format.ts'
import { DOMAIN_LOG_MAX, DOMAIN_LOG_MIN, rampPositionFor } from '../src/colorscale/value-to-color.ts'
import { BAND_LEVELS, bandIndexFor, resampleField, sampleField } from '../.planning/phases/06-heatmap-design-pass/mockups/shared/field-sampler.ts'

function makeMeta(cols: number, rows: number): SweepFixtureMeta {
  return {
    bundleVersion: 'test',
    symbol: 'TEST',
    dividendReinvest: true,
    entryDates: Array.from({ length: cols }, (_, i) => `2000-01-${String((i % 28) + 1).padStart(2, '0')}`),
    leverages: Array.from({ length: rows }, (_, i) => i + 1),
    holdingYears: 20,
    initialInvestment: 1000,
    expenseRatioPercent: 0,
    financingSpreadPercent: 0,
    ruinedCount: 0,
    incompleteCount: 0,
    minMultiple: 0,
    maxMultiple: 1,
    clippedBelowCount: 0,
    clippedAboveCount: 0,
  }
}

function makeFixture(
  cols: number,
  rows: number,
  multiples: Float32Array,
  flags?: Uint8Array,
): SweepFixture {
  return {
    cols,
    rows,
    meta: makeMeta(cols, rows),
    multiples,
    drawdowns: new Float32Array(cols * rows),
    flags: flags ?? new Uint8Array(cols * rows),
  }
}

describe('BAND_LEVELS', () => {
  test('is eleven evenly spaced boundaries across [0, 1], giving ten bands', () => {
    expect(BAND_LEVELS.length).toBe(11)
    expect(BAND_LEVELS[0]).toBe(0)
    expect(BAND_LEVELS[BAND_LEVELS.length - 1]).toBe(1)
  })

  test('contains the value 0.5, so breakeven is always a band edge', () => {
    expect(BAND_LEVELS).toContain(0.5)
  })
})

describe('bandIndexFor', () => {
  test('places a value exactly equal to a band boundary in the UPPER band', () => {
    // BAND_LEVELS[4] = 0.4 is the boundary between band 3 ([0.3, 0.4)) and band 4 ([0.4, 0.5)).
    expect(bandIndexFor(0.4)).toBe(4)
    // The breakeven boundary itself, 0.5, is the boundary between band 4 and band 5.
    expect(bandIndexFor(0.5)).toBe(5)
  })

  test('a value strictly inside a band stays in that band', () => {
    expect(bandIndexFor(0.05)).toBe(0)
    expect(bandIndexFor(0.45)).toBe(4)
    expect(bandIndexFor(0.95)).toBe(9)
  })

  test('t = 0 resolves to the first band, t = 1 resolves to the last band (inclusive top)', () => {
    expect(bandIndexFor(0)).toBe(0)
    expect(bandIndexFor(1)).toBe(9)
  })

  test('clamps out-of-range input rather than throwing or returning an out-of-range index', () => {
    expect(bandIndexFor(-5)).toBe(0)
    expect(bandIndexFor(5)).toBe(9)
  })
})

describe('sampleField: bilinear interpolation of a linear-in-column-index analytic field', () => {
  test('returns a ramp position linear in the fractional column, to within 1e-9', () => {
    const cols = 21
    const rows = 5
    const row = 2
    const multiples = new Float32Array(cols * rows)
    // Constructed so rampPositionFor(value(col)) is (to double precision) linear in col: this
    // is the inverse of rampPositionFor's own symlog transform. `multiples` is a Float32Array
    // (the real SweepFixture format's own field type), so the STORED value carries float32
    // rounding the idealized formula does not -- the expectation below is therefore built from
    // that same stored (rounded) value, so this test isolates sampleField's OWN bilinear
    // interpolation arithmetic (which must be linear to double precision) from the unrelated,
    // unavoidable float32-storage rounding of the input data itself.
    for (let col = 0; col < cols; col++) {
      const t = col / (cols - 1)
      const logValue = DOMAIN_LOG_MIN + t * (DOMAIN_LOG_MAX - DOMAIN_LOG_MIN)
      multiples[row * cols + col] = 10 ** logValue
    }
    const fixture = makeFixture(cols, rows, multiples)

    const storedRampPositionAt = (col: number) => rampPositionFor(multiples[row * cols + col]!)

    for (const colF of [0, 0.3, 1.7, 5.5, 10, 15.25, cols - 1]) {
      const col0 = Math.min(Math.floor(colF), cols - 1)
      const col1 = Math.min(col0 + 1, cols - 1)
      const fx = colF - col0
      const expected = (1 - fx) * storedRampPositionAt(col0) + fx * storedRampPositionAt(col1)

      const sample = sampleField(fixture, 'multiple', colF, row)
      expect(sample.categorical).toBeNull()
      expect(sample.rampPosition).toBeCloseTo(expected, 9)
    }
  })
})

describe('sampleField: constant field', () => {
  test('returns the same ramp position everywhere, including at the four corners', () => {
    const cols = 10
    const rows = 6
    const multiples = new Float32Array(cols * rows).fill(2.5)
    const fixture = makeFixture(cols, rows, multiples)

    const expected = sampleField(fixture, 'multiple', 0, 0).rampPosition
    const points: Array<[number, number]> = [
      [0, 0],
      [cols - 1, 0],
      [0, rows - 1],
      [cols - 1, rows - 1],
      [3.7, 2.2],
    ]
    for (const [colF, rowF] of points) {
      const sample = sampleField(fixture, 'multiple', colF, rowF)
      expect(sample.categorical).toBeNull()
      expect(sample.rampPosition).toBeCloseTo(expected, 9)
    }
  })
})

describe('resampleField: constant field', () => {
  test('returns that constant colour everywhere, including at the four canvas corners', () => {
    const cols = 8
    const rows = 4
    const multiples = new Float32Array(cols * rows).fill(3)
    const fixture = makeFixture(cols, rows, multiples)
    const widthPx = 32
    const heightPx = 16

    const buffer = resampleField(fixture, 'multiple', { widthPx, heightPx })
    expect(buffer.length).toBe(widthPx * heightPx * 4)

    const at = (px: number, py: number): [number, number, number, number] => {
      const i = (py * widthPx + px) * 4
      return [buffer[i]!, buffer[i + 1]!, buffer[i + 2]!, buffer[i + 3]!]
    }

    const expected = at(0, 0)
    expect(at(widthPx - 1, 0)).toEqual(expected)
    expect(at(0, heightPx - 1)).toEqual(expected)
    expect(at(widthPx - 1, heightPx - 1)).toEqual(expected)
    expect(at(Math.floor(widthPx / 2), Math.floor(heightPx / 2))).toEqual(expected)
  })
})

describe('sampleField: categorical hard edge, no blending with a valued neighbour', () => {
  test('a stencil touching one ruined corner returns ruined, not an interpolated value', () => {
    const cols = 2
    const rows = 2
    const multiples = new Float32Array([1, 100, 1, 100])
    const flags = new Uint8Array([0, CELL_FLAG_RUINED, 0, 0])
    const fixture = makeFixture(cols, rows, multiples, flags)

    // Pixel near the plain corner (0,0), still inside the same single 2x2 stencil that also
    // touches the ruined corner (row=0, col=1).
    const sample = sampleField(fixture, 'multiple', 0.1, 0.1)
    expect(sample.categorical).toBe('ruined')
  })

  test('a stencil touching one incomplete corner returns incomplete, not an interpolated value', () => {
    const cols = 2
    const rows = 2
    const multiples = new Float32Array([1, 100, 1, 100])
    const flags = new Uint8Array([0, 0, CELL_FLAG_INCOMPLETE, 0])
    const fixture = makeFixture(cols, rows, multiples, flags)

    const sample = sampleField(fixture, 'multiple', 0.9, 0.1)
    expect(sample.categorical).toBe('incomplete')
  })

  test('D-18: ruined wins over incomplete when a single cell carries both flags', () => {
    const cols = 2
    const rows = 2
    const multiples = new Float32Array(4)
    const flags = new Uint8Array([CELL_FLAG_RUINED | CELL_FLAG_INCOMPLETE, 0, 0, 0])
    const fixture = makeFixture(cols, rows, multiples, flags)

    const sample = sampleField(fixture, 'multiple', 0, 0)
    expect(sample.categorical).toBe('ruined')
  })
})

describe('sampleField: nearest-cell tie rule (edge assumption A-E3)', () => {
  test('an equidistant pixel between a ruined corner and an incomplete corner resolves toward the LOWER ROW first', () => {
    const cols = 2
    const rows = 2
    const multiples = new Float32Array(4)
    // (row=0, col=1) ruined; (row=1, col=0) incomplete -- both exactly sqrt(0.5) from (0.5, 0.5).
    const flags = new Uint8Array([0, CELL_FLAG_RUINED, CELL_FLAG_INCOMPLETE, 0])
    const fixture = makeFixture(cols, rows, multiples, flags)

    const sample = sampleField(fixture, 'multiple', 0.5, 0.5)
    // Lower row wins the tie: row=0 (the ruined corner) beats row=1 (the incomplete corner),
    // regardless of which flag either one carries -- this is a positional rule, not a
    // flag-priority rule (that D-18 rule only applies within a single cell, tested above).
    expect(sample.categorical).toBe('ruined')
  })

  test('the same tie with the flags swapped still resolves toward the lower row, proving the rule is positional, not flag-priority', () => {
    const cols = 2
    const rows = 2
    const multiples = new Float32Array(4)
    // (row=0, col=1) incomplete; (row=1, col=0) ruined -- same tie geometry as above, flags swapped.
    const flags = new Uint8Array([0, CELL_FLAG_INCOMPLETE, CELL_FLAG_RUINED, 0])
    const fixture = makeFixture(cols, rows, multiples, flags)

    const sample = sampleField(fixture, 'multiple', 0.5, 0.5)
    expect(sample.categorical).toBe('incomplete')
  })

  test('a tie between two corners in the same row resolves toward the lower column', () => {
    const cols = 2
    const rows = 2
    const multiples = new Float32Array(4)
    // (row=0, col=0) ruined; (row=0, col=1) incomplete -- a pixel centred exactly between them,
    // at the top row, is equidistant (0.5) from both, and the row is already tied (both row=0),
    // so this isolates the column tie-break specifically.
    const flags = new Uint8Array([CELL_FLAG_RUINED, CELL_FLAG_INCOMPLETE, 0, 0])
    const fixture = makeFixture(cols, rows, multiples, flags)

    const sample = sampleField(fixture, 'multiple', 0.5, 0)
    expect(sample.categorical).toBe('ruined')
  })
})
