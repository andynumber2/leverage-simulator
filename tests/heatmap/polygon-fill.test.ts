/**
 * tests/heatmap/polygon-fill.test.ts: 07-04-PLAN.md Task 1, correctness assertions for
 * `src/heatmap/polygon-fill.ts`'s ring-stitcher, against analytic fields (a linear ramp, a
 * bullseye, a constant field, and fields with a ruined block at the edge and in the interior)
 * rather than the committed fixture, so each named failure mode is isolated. Runs in the fast
 * Node `unit` project: `polygon-fill.ts` has no DOM dependency.
 */

import { describe, expect, test } from 'vitest'

import { CELL_FLAG_RUINED } from '../../src/data/sweep-fixture-format.ts'
import {
  buildBandPolygons,
  stitchBandRings,
  type BandRing,
  type GridPoint,
} from '../../src/heatmap/polygon-fill.ts'
import { marchingSquaresSegments } from '../../src/heatmap/iso-lines.ts'

/** Absolute tolerance for area comparisons in this file: the analytic fields below (a linear
 * ramp, a constant field) produce exact rational areas, so a discrepancy this small can only come
 * from genuine floating-point roundoff, never from a real coverage gap or overlap. */
const AREA_EPSILON = 1e-6

/** Shoelace formula: the absolute area enclosed by one closed ring (`points[0]` equal to the
 * last point). Winding-direction independent, matching `polygon-fill.ts`'s own even-odd choice. */
function ringArea(points: readonly GridPoint[]): number {
  let sum = 0
  const n = points.length - 1
  for (let i = 0; i < n; i++) {
    const p1 = points[i]!
    const p2 = points[i + 1]!
    sum += p1.col * p2.row - p2.col * p1.row
  }
  return Math.abs(sum) / 2
}

/** A band's total filled area under the even-odd rule: outer rings add their area, hole rings
 * subtract theirs. */
function bandArea(rings: readonly BandRing[]): number {
  let total = 0
  for (const ring of rings) {
    const area = ringArea(ring.points)
    total += ring.hole ? -area : area
  }
  return total
}

/** Ray-casting point-in-polygon, duplicated here (rather than imported) in the same style
 * `tests/iso-lines.test.ts` duplicates its own small geometry helpers: this module's internal
 * `pointInRing` is not exported, and re-deriving it independently in the test is itself a check
 * that the module's public output (the ring point lists) is self-consistent geometry, not merely
 * whatever the module's own internals happen to produce. */
function pointInRing(col: number, row: number, points: readonly GridPoint[]): boolean {
  const n = points.length - 1
  let inside = false
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = points[i]!
    const pj = points[j]!
    const crosses = pi.row > row !== pj.row > row
    if (!crosses) continue
    const xAtRow = ((pj.col - pi.col) * (row - pi.row)) / (pj.row - pi.row) + pi.col
    if (col < xAtRow) inside = !inside
  }
  return inside
}

/** `true` when (`col`, `row`) is painted by `rings` under the even-odd rule (an odd number of
 * rings contain the point, regardless of each ring's own recorded `hole` flag). */
function pointInsideBand(col: number, row: number, rings: readonly BandRing[]): boolean {
  let count = 0
  for (const ring of rings) {
    if (pointInRing(col, row, ring.points)) count++
  }
  return count % 2 === 1
}

function assertRingClosed(ring: BandRing): void {
  const first = ring.points[0]!
  const last = ring.points[ring.points.length - 1]!
  expect(first.col).toBeCloseTo(last.col, 9)
  expect(first.row).toBeCloseTo(last.row, 9)
}

// --- Fixture builders --------------------------------------------------------------------------

/** A linear ramp: `values[row, col] = col`, constant down each column. Its iso-lines are exactly
 * vertical, so band polygons at non-integer levels are exact rectangle strips with no
 * interpolation error -- letting the coverage and field-edge tests assert exact areas. */
function makeLinearRampField(cols: number, rows: number): Float64Array {
  const values = new Float64Array(cols * rows)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      values[row * cols + col] = col
    }
  }
  return values
}

/** A bullseye: a circular high-value (`10`) island of radius `radius` centred at (`cx`, `cy`) in
 * a low-value (`0`) background, binary rather than smoothly varying so the level=5 contour lands
 * on a clean, unambiguous crossing at every boundary cell. Mirrors `tests/iso-lines.test.ts`'s
 * own `makeRadialField` margin discipline: a 41x41 grid with a radius-6 island keeps the whole
 * contour well inside the grid, never touching the field boundary. */
function makeBullseyeField(cols: number, rows: number, cx: number, cy: number, radius: number): Float64Array {
  const values = new Float64Array(cols * rows)
  const radiusSquared = radius * radius
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const dx = col - cx
      const dy = row - cy
      values[row * cols + col] = dx * dx + dy * dy <= radiusSquared ? 10 : 0
    }
  }
  return values
}

// --- Behavior 1: coverage (linear ramp, no categorical cells) ----------------------------------

describe('buildBandPolygons: linear ramp, no categorical cells -- full coverage', () => {
  test('every band is closed, and the union of all bands own areas equals the field rectangle area within AREA_EPSILON', () => {
    const cols = 10
    const rows = 6
    const values = makeLinearRampField(cols, rows)
    // Fractional levels throughout (never an exact grid-point value) so each band is an exact
    // rectangle strip with a hand-computable area.
    const bandLevels = [-0.5, 2.5, 5.5, 9.5]

    const bands = buildBandPolygons(values, cols, rows, bandLevels)
    expect(bands.length).toBe(bandLevels.length - 1)

    let totalArea = 0
    for (const band of bands) {
      for (const ring of band) {
        assertRingClosed(ring)
      }
      totalArea += bandArea(band)
    }

    const fieldRectArea = (cols - 1) * (rows - 1)
    expect(Math.abs(totalArea - fieldRectArea)).toBeLessThanOrEqual(AREA_EPSILON)
  })
})

// --- Behavior 2: field-edge closure --------------------------------------------------------------

describe('buildBandPolygons: a band that runs off the side of the field', () => {
  test('closes along the field rectangle own edge, with area matching the full vertical strip -- not truncated at the last iso-segment', () => {
    const cols = 10
    const rows = 6
    const values = makeLinearRampField(cols, rows)
    const bandLevels = [-0.5, 2.5, 5.5, 9.5]

    const bands = buildBandPolygons(values, cols, rows, bandLevels)
    // Band 1 (2.5 to 5.5) is an interior vertical strip spanning the FULL row range: its rings
    // must include the top (row 0) and bottom (row rows - 1) boundary runs, or the naked interior
    // iso-segments (a LINE, not an enclosed AREA) would fail to close at all -- a failed closure
    // is dropped by the stitcher (a dangling, non-returning chain), so a truncated ring would
    // show up here as an area of zero or as fewer rings than the field actually has, not as a
    // ring whose area merely undershoots.
    const band1 = bands[1]!
    expect(band1.length).toBeGreaterThan(0)
    for (const ring of band1) {
      assertRingClosed(ring)
    }

    const expectedArea = (5.5 - 2.5) * (rows - 1)
    expect(Math.abs(bandArea(band1) - expectedArea)).toBeLessThanOrEqual(AREA_EPSILON)

    // At least one ring reaches BOTH the field's top (row 0) and bottom (row rows - 1) edges,
    // proving the ring was closed along the field rectangle's own boundary rather than stopping
    // short at the last iso-segment endpoint.
    const touchesTopAndBottom = band1.some((ring) => {
      const touchesTop = ring.points.some((p) => Math.abs(p.row - 0) < 1e-9)
      const touchesBottom = ring.points.some((p) => Math.abs(p.row - (rows - 1)) < 1e-9)
      return touchesTop && touchesBottom
    })
    expect(touchesTopAndBottom).toBe(true)
  })
})

// --- Behavior 3: bullseye (hole handling) -------------------------------------------------------

describe('buildBandPolygons: bullseye field (a high-value island in a low-value field)', () => {
  test('the outer band produces exactly one outer ring and one hole ring, and the even-odd fill leaves the island unpainted', () => {
    const cols = 41
    const rows = 41
    const cx = 20
    const cy = 20
    const radius = 6
    const values = makeBullseyeField(cols, rows, cx, cy, radius)
    // Level 5 sits exactly between the background (0) and island (10) values; 10.5 exceeds the
    // field's own maximum (10), so the top level's own region is empty and band 1 captures the
    // whole island with nothing left uncovered.
    const bandLevels = [0, 5, 10.5]

    const bands = buildBandPolygons(values, cols, rows, bandLevels)
    const outerBand = bands[0]!

    expect(outerBand.length).toBe(2)
    const outerRings = outerBand.filter((r) => !r.hole)
    const holeRings = outerBand.filter((r) => r.hole)
    expect(outerRings.length).toBe(1)
    expect(holeRings.length).toBe(1)

    for (const ring of outerBand) {
      assertRingClosed(ring)
    }

    // The island's own centre must NOT be painted by the outer band: the hole ring cancels the
    // outer ring's own coverage there.
    expect(pointInsideBand(cx, cy, outerBand)).toBe(false)

    // A point well outside the island, but inside the field, MUST be painted by the outer band.
    expect(pointInsideBand(2, 2, outerBand)).toBe(true)
  })
})

// --- Behavior 4: categorical exclusion -----------------------------------------------------------

describe('buildBandPolygons: categorical (ruined/incomplete) cells', () => {
  test('a ruined cell at the field edge and another in the interior are excluded from every band polygon', () => {
    const cols = 10
    const rows = 6
    const values = makeLinearRampField(cols, rows)
    const bandLevels = [-0.5, 2.5, 5.5, 9.5]

    const flags = new Uint8Array(cols * rows)
    const edgeCell = { col: 0, row: 0 }
    const interiorCell = { col: 6, row: 3 }
    flags[edgeCell.row * cols + edgeCell.col] = CELL_FLAG_RUINED
    flags[interiorCell.row * cols + interiorCell.col] = CELL_FLAG_RUINED

    const bands = buildBandPolygons(values, cols, rows, bandLevels, flags)
    expect(bands.length).toBe(bandLevels.length - 1)

    const samplePointsInside = (cell: { col: number; row: number }): GridPoint[] => [
      { col: cell.col + 0.5, row: cell.row + 0.5 },
      { col: cell.col + 0.1, row: cell.row + 0.1 },
      { col: cell.col + 0.9, row: cell.row + 0.9 },
    ]

    for (const cell of [edgeCell, interiorCell]) {
      for (const point of samplePointsInside(cell)) {
        for (const band of bands) {
          expect(
            pointInsideBand(point.col, point.row, band),
            `point (${point.col}, ${point.row}) inside ruined cell (${cell.col}, ${cell.row}) must not be painted by any band`,
          ).toBe(false)
        }
      }
    }
  })
})

// --- Behavior 5: constant field --------------------------------------------------------------

describe('buildBandPolygons: a field of exactly one constant value', () => {
  test('produces one ring covering the whole field rectangle for that value own band, and empty ring lists for every other band', () => {
    const cols = 8
    const rows = 8
    const values = new Float64Array(cols * rows).fill(5)
    const bandLevels = [0, 3, 7, 10]

    const bands = buildBandPolygons(values, cols, rows, bandLevels)
    expect(bands.length).toBe(3)

    expect(bands[0]).toEqual([])
    expect(bands[2]).toEqual([])

    const containingBand = bands[1]!
    expect(containingBand.length).toBe(1)
    expect(containingBand[0]!.hole).toBe(false)
    assertRingClosed(containingBand[0]!)

    const fieldRectArea = (cols - 1) * (rows - 1)
    expect(Math.abs(bandArea(containingBand) - fieldRectArea)).toBeLessThanOrEqual(AREA_EPSILON)
  })
})

// --- Behavior 6: degenerate grid sizes ---------------------------------------------------------

describe('buildBandPolygons: degenerate grid sizes', () => {
  test('a grid with fewer than 2 columns returns empty ring lists for every band, never throws', () => {
    const values = new Float64Array(5)
    expect(() => buildBandPolygons(values, 1, 5, [0, 1, 2])).not.toThrow()
    const bands = buildBandPolygons(values, 1, 5, [0, 1, 2])
    expect(bands).toEqual([[], []])
  })

  test('a grid with fewer than 2 rows returns empty ring lists for every band, never throws', () => {
    const values = new Float64Array(5)
    expect(() => buildBandPolygons(values, 5, 1, [0, 1])).not.toThrow()
    const bands = buildBandPolygons(values, 5, 1, [0, 1])
    expect(bands).toEqual([[]])
  })
})

// --- stitchBandRings: the standalone stitcher, exercised directly ------------------------------

describe('stitchBandRings: degenerate grid sizes', () => {
  test('a grid with fewer than 2 columns or 2 rows returns an empty ring list, never throws', () => {
    const values = new Float64Array(5)
    expect(() => stitchBandRings([], 1, 5, values, 0)).not.toThrow()
    expect(stitchBandRings([], 1, 5, values, 0)).toEqual([])
    expect(stitchBandRings([], 5, 1, values, 0)).toEqual([])
  })
})

describe('stitchBandRings: a single interior region, matches marchingSquaresSegments own geometry', () => {
  test('stitching the bullseye field own level-5 segments produces one closed ring whose area is close to the analytic disc area', () => {
    const cols = 41
    const rows = 41
    const cx = 20
    const cy = 20
    const radius = 6
    const values = makeBullseyeField(cols, rows, cx, cy, radius)
    const level = 5

    const segments = marchingSquaresSegments(values, cols, rows, level)
    const rings = stitchBandRings(segments, cols, rows, values, level)

    expect(rings.length).toBe(1)
    expect(rings[0]!.hole).toBe(false)
    assertRingClosed(rings[0]!)

    const analyticArea = Math.PI * radius * radius
    // The staircase polygon a binary-valued marching-squares grid produces is a coarse
    // approximation of the true circle at this resolution; a generous relative tolerance
    // confirms the ring is topologically sound and roughly the right size, not pixel-exact.
    expect(Math.abs(ringArea(rings[0]!.points) - analyticArea) / analyticArea).toBeLessThan(0.25)
  })
})
