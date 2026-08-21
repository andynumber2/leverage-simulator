/**
 * tests/iso-lines.test.ts: 06-03-PLAN.md Task 1, pure determinism and topology assertions for
 * `mockups/shared/iso-lines.ts`'s marching-squares segment emitter, against analytic fields, in
 * the style `tests/canvas-grid.test.ts` uses. Runs in the fast Node `unit` project:
 * `iso-lines.ts` has no DOM dependency.
 */

import { describe, expect, test } from 'vitest'

import { marchingSquaresSegments } from '../.planning/phases/06-heatmap-design-pass/mockups/shared/iso-lines.ts'

describe('marchingSquaresSegments: vertical-line analytic field f(col, row) = col', () => {
  test('at level = col + 0.5 emits segments that all lie on the vertical line x = col + 0.5, to within 1e-9', () => {
    const cols = 8
    const rows = 5
    const values = new Float64Array(cols * rows)
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        values[row * cols + col] = col
      }
    }
    const level = 3.5

    const segments = marchingSquaresSegments(values, cols, rows, level)

    expect(segments.length).toBe(rows - 1)
    for (const segment of segments) {
      expect(segment.x1).toBeCloseTo(level, 9)
      expect(segment.x2).toBeCloseTo(level, 9)
    }
  })
})

describe('marchingSquaresSegments: constant field', () => {
  test('emits zero segments at any level not equal to that constant', () => {
    const cols = 6
    const rows = 6
    const values = new Float64Array(cols * rows).fill(7)

    expect(marchingSquaresSegments(values, cols, rows, 3)).toEqual([])
    expect(marchingSquaresSegments(values, cols, rows, 100)).toEqual([])
    expect(marchingSquaresSegments(values, cols, rows, -5)).toEqual([])
  })
})

describe('marchingSquaresSegments: degenerate grid sizes', () => {
  test('a grid with fewer than 2 columns or rows returns an empty array, never undefined or a throw', () => {
    expect(marchingSquaresSegments(new Float64Array(5), 5, 1, 2)).toEqual([])
    expect(marchingSquaresSegments(new Float64Array(5), 1, 5, 2)).toEqual([])
    expect(marchingSquaresSegments(new Float64Array(0), 0, 0, 2)).toEqual([])
  })

  test('a single-cell (2x2) grid with a real crossing returns exactly one segment, never undefined or a throw', () => {
    // TL=0, TR=10, BL=0, BR=10: a level of 5 crosses the top and bottom edges only.
    const values = new Float64Array([0, 10, 0, 10])
    const segments = marchingSquaresSegments(values, 2, 2, 5)
    expect(Array.isArray(segments)).toBe(true)
    expect(segments.length).toBe(1)
  })

  test('a single-cell (2x2) grid with no crossing returns an empty array', () => {
    const values = new Float64Array([0, 1, 0, 1])
    const segments = marchingSquaresSegments(values, 2, 2, 100)
    expect(segments).toEqual([])
  })
})

describe('marchingSquaresSegments: categorical skip (D-18/D-20)', () => {
  test('skips a cell with any categorical corner, even when the level genuinely crosses it', () => {
    const values = new Float64Array([0, 10, 0, 10])
    const flagsNone = new Uint8Array([0, 0, 0, 0])
    const flagsOneCorner = new Uint8Array([0, 1, 0, 0])

    expect(marchingSquaresSegments(values, 2, 2, 5, flagsNone).length).toBe(1)
    expect(marchingSquaresSegments(values, 2, 2, 5, flagsOneCorner)).toEqual([])
  })
})

/** Squared Euclidean distance from a radial field's centre, a smooth, radially symmetric
 * analytic field whose level-`radiusSquared` contour is a closed, fully-interior circle when the
 * grid has enough margin around the centre -- the standard soundness test for a marching-squares
 * implementation: a closed contour's segment endpoints must pair up exactly, with no dropped or
 * duplicated edge. */
function makeRadialField(cols: number, rows: number, cx: number, cy: number): Float64Array {
  const values = new Float64Array(cols * rows)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const dx = col - cx
      const dy = row - cy
      values[row * cols + col] = dx * dx + dy * dy
    }
  }
  return values
}

function endpointKey(x: number, y: number): string {
  // Round to 9 decimal places so floating-point noise from independent edge interpolations
  // (the same grid edge is visited by two adjacent cells, computed identically, so this is a
  // belt-and-braces tolerance rather than a load-bearing one) does not split one true endpoint
  // into two distinct map keys.
  return `${x.toFixed(9)}:${y.toFixed(9)}`
}

function assertEndpointsPairUp(segments: ReturnType<typeof marchingSquaresSegments>): void {
  const counts = new Map<string, number>()
  for (const segment of segments) {
    const keyA = endpointKey(segment.x1, segment.y1)
    const keyB = endpointKey(segment.x2, segment.y2)
    counts.set(keyA, (counts.get(keyA) ?? 0) + 1)
    counts.set(keyB, (counts.get(keyB) ?? 0) + 1)
  }
  expect(counts.size).toBeGreaterThan(0)
  for (const [key, count] of counts) {
    expect(count, `endpoint ${key} must be shared by exactly one other segment (count === 2), got ${count}`).toBe(2)
  }
}

describe('marchingSquaresSegments: radially symmetric field, closed-contour endpoint pairing', () => {
  const cols = 41
  const rows = 41
  const cx = 20
  const cy = 20
  const values = makeRadialField(cols, rows, cx, cy)
  // Radius 6 keeps the whole contour well inside the 41x41 grid's margin (14 cells of clearance
  // to the nearest edge), so the loop is fully closed and never touches the grid boundary.
  const level = 36

  test('every segment endpoint is shared by exactly one other segment, to within 1e-9 (via rounding)', () => {
    const segments = marchingSquaresSegments(values, cols, rows, level)
    expect(segments.length).toBeGreaterThan(0)
    assertEndpointsPairUp(segments)
  })
})

/**
 * A degree-count check alone cannot distinguish a correct saddle disambiguation from a naive
 * constant one: whichever of the two valid perfect-matchings a saddle cell picks, every one of
 * its four crossing points is still used in exactly one segment, so every point's global usage
 * count is still 2 either way (empirically confirmed: no cell in the radially symmetric field
 * above is even a checkerboard/saddle case at all -- a convex field like squared-distance never
 * produces one). What the disambiguation branch actually controls is WHICH TWO corners the
 * contour isolates, which only a worked single-cell example with known corner values can pin
 * down precisely -- so these two tests assert the exact emitted segment endpoints for a
 * hand-computed checkerboard cell in each of the two disambiguation directions.
 */
describe('marchingSquaresSegments: saddle-cell (checkerboard) disambiguation, worked examples', () => {
  test('when the mean of the four corners agrees with the top-left corner\'s class, the pairing isolates top-left from bottom-right', () => {
    const values = new Float64Array([20, 0, 0, 6]) // TL, TR, BL, BR (row-major, 2x2)
    const level = 5
    // TL=20 (above), BR=6 (above), TR=0 (below), BL=0 (below): a checkerboard cell. Mean =
    // (20+0+0+6)/4 = 6.5 (above), which agrees with TL's own "above" class -- so the pairing
    // isolates TL (top+left edges) from BR (bottom+right edges).
    const segments = marchingSquaresSegments(values, 2, 2, level)
    expect(segments.length).toBe(2)

    // pTop: TL=20 -> TR=0 crosses at t=(5-20)/(0-20)=0.75 -> x=0.75, y=0.
    // pLeft: TL=20 -> BL=0 crosses at t=(5-20)/(0-20)=0.75 -> x=0, y=0.75.
    // pBottom: BL=0 -> BR=6 crosses at t=(5-0)/(6-0)=5/6 -> x=5/6, y=1.
    // pRight: TR=0 -> BR=6 crosses at t=(5-0)/(6-0)=5/6 -> x=1, y=5/6.
    const topLeftSegment = segments.find(
      (s) =>
        (Math.abs(s.x1 - 0.75) < 1e-9 && Math.abs(s.y1 - 0) < 1e-9) ||
        (Math.abs(s.x2 - 0.75) < 1e-9 && Math.abs(s.y2 - 0) < 1e-9),
    )
    expect(topLeftSegment, 'expected one segment through the top edge crossing at (0.75, 0)').toBeDefined()
    const otherX = topLeftSegment!.x1 === 0.75 ? topLeftSegment!.x2 : topLeftSegment!.x1
    const otherY = topLeftSegment!.x1 === 0.75 ? topLeftSegment!.y2 : topLeftSegment!.y1
    expect(otherX).toBeCloseTo(0, 9)
    expect(otherY).toBeCloseTo(0.75, 9)

    const bottomRightSegment = segments.find((s) => s !== topLeftSegment)!
    const brPoints = [
      { x: bottomRightSegment.x1, y: bottomRightSegment.y1 },
      { x: bottomRightSegment.x2, y: bottomRightSegment.y2 },
    ]
    expect(brPoints.some((p) => Math.abs(p.x - 5 / 6) < 1e-9 && Math.abs(p.y - 1) < 1e-9)).toBe(true)
    expect(brPoints.some((p) => Math.abs(p.x - 1) < 1e-9 && Math.abs(p.y - 5 / 6) < 1e-9)).toBe(true)
  })

  test('when the mean of the four corners disagrees with the top-left corner\'s class, the pairing isolates top-right from bottom-left instead', () => {
    // TL=6, TR=0, BL=0, BR=6, level=5: TL and BR are both "above" (>= 5), individually, exactly
    // like a case-A cell -- but the mean, (6+0+0+6)/4=3, is BELOW 5, disagreeing with TL's own
    // "above" class. The disambiguation must flip the pairing to isolate TR/BL instead, even
    // though TL/BR's own above/below classification looks identical to the case-A example above.
    const values = new Float64Array([6, 0, 0, 6]) // TL, TR, BL, BR
    const level = 5
    const segments = marchingSquaresSegments(values, 2, 2, level)
    expect(segments.length).toBe(2)

    // pTop: TL=6 -> TR=0 crosses at t=(5-6)/(0-6)=1/6 -> x=1/6, y=0.
    // pRight: TR=0 -> BR=6 crosses at t=(5-0)/(6-0)=5/6 -> x=1, y=5/6.
    // pLeft: TL=6 -> BL=0 crosses at t=(5-6)/(0-6)=1/6 -> x=0, y=1/6.
    // pBottom: BL=0 -> BR=6 crosses at t=5/6 -> x=5/6, y=1.
    const topRightSegment = segments.find(
      (s) =>
        (Math.abs(s.x1 - 1 / 6) < 1e-9 && Math.abs(s.y1 - 0) < 1e-9) ||
        (Math.abs(s.x2 - 1 / 6) < 1e-9 && Math.abs(s.y2 - 0) < 1e-9),
    )
    expect(topRightSegment, 'expected one segment through the top edge crossing at (1/6, 0)').toBeDefined()
    const otherX = Math.abs(topRightSegment!.x1 - 1 / 6) < 1e-9 ? topRightSegment!.x2 : topRightSegment!.x1
    const otherY = Math.abs(topRightSegment!.x1 - 1 / 6) < 1e-9 ? topRightSegment!.y2 : topRightSegment!.y1
    expect(otherX).toBeCloseTo(1, 9)
    expect(otherY).toBeCloseTo(5 / 6, 9)

    const bottomLeftSegment = segments.find((s) => s !== topRightSegment)!
    const blPoints = [
      { x: bottomLeftSegment.x1, y: bottomLeftSegment.y1 },
      { x: bottomLeftSegment.x2, y: bottomLeftSegment.y2 },
    ]
    expect(blPoints.some((p) => Math.abs(p.x - 0) < 1e-9 && Math.abs(p.y - 1 / 6) < 1e-9)).toBe(true)
    expect(blPoints.some((p) => Math.abs(p.x - 5 / 6) < 1e-9 && Math.abs(p.y - 1) < 1e-9)).toBe(true)
  })
})
