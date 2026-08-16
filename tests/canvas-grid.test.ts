/**
 * tests/canvas-grid.test.ts: Task 1, pure determinism and color-mapping assertions for
 * bench/canvas-grid.ts's shared fixture. Runs in the fast Node `unit` project. The paint
 * functions (`paintFillRect`, `paintPutImageData`) need a real canvas and stay in the browser
 * project's bench/canvas-repaint.bench.test.ts.
 */

import { describe, expect, test } from 'vitest'

import { CELL_COUNT, GRID_COLS, GRID_ROWS, makeGridValues, mapValueToRgba } from '../bench/canvas-grid.ts'

describe('grid dimensions', () => {
  test('GRID_COLS x GRID_ROWS is the 10,000-cell grid every phase criterion names', () => {
    expect(GRID_COLS).toBe(200)
    expect(GRID_ROWS).toBe(50)
    expect(CELL_COUNT).toBe(10_000)
  })
})

describe('makeGridValues', () => {
  test('returns a Float64Array of length CELL_COUNT', () => {
    const values = makeGridValues(1)
    expect(values).toBeInstanceOf(Float64Array)
    expect(values.length).toBe(CELL_COUNT)
  })

  test('two calls with the same seed are element-wise identical', () => {
    const a = makeGridValues(0x5eed)
    const b = makeGridValues(0x5eed)
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  test('two calls with different seeds are not identical', () => {
    const a = makeGridValues(1)
    const b = makeGridValues(2)
    expect(Array.from(a)).not.toEqual(Array.from(b))
  })

  test('values span several orders of magnitude, not a narrow uniform band', () => {
    const values = makeGridValues(0x5eed)
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    for (const value of values) {
      expect(value).toBeGreaterThan(0)
      if (value < min) min = value
      if (value > max) max = value
    }
    // At least two orders of magnitude apart across 10,000 log-uniform draws.
    expect(max / min).toBeGreaterThan(100)
  })
})

describe('mapValueToRgba', () => {
  test('returns four integer channel values, each in [0, 255]', () => {
    for (const value of [1e-4, 1e-3, 0.5, 1, 10, 100, 1000, 1e4]) {
      const [r, g, b, a] = mapValueToRgba(value)
      for (const channel of [r, g, b, a]) {
        expect(Number.isInteger(channel)).toBe(true)
        expect(channel).toBeGreaterThanOrEqual(0)
        expect(channel).toBeLessThanOrEqual(255)
      }
    }
  })

  test('deterministic: identical input always produces an identical output', () => {
    expect(mapValueToRgba(3.14159)).toEqual(mapValueToRgba(3.14159))
  })

  test('every value from makeGridValues maps to exactly one deterministic RGBA, for all 10,000 cells', () => {
    // The pure half of D-15's equivalence proof: there is exactly one color mapping, so neither
    // paint arm can consume a different color for the same cell than the other. See
    // bench/canvas-repaint.bench.test.ts for the rendered half of this proof (Task 2).
    const values = makeGridValues(0x5eed)
    for (let i = 0; i < CELL_COUNT; i++) {
      const value = values[i] ?? 0
      const first = mapValueToRgba(value)
      const second = mapValueToRgba(value)
      expect(second).toEqual(first)
    }
  })

  test('low and high values map to visibly different colors', () => {
    const low = mapValueToRgba(1e-3)
    const high = mapValueToRgba(1e3)
    expect(low).not.toEqual(high)
  })
})
