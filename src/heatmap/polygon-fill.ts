/**
 * src/heatmap/polygon-fill.ts
 *
 * 07-04-PLAN.md Task 1 (D-05/D-06): stitches `iso-lines.ts`'s UNSTITCHED marching-squares
 * segments into closed, hole-aware, categorical-aware band polygons -- the fill algorithm
 * `06-HEATMAP-SPEC.md` Finding A ranks first, since a filled-contour renderer conventionally
 * fills band POLYGONS derived from its own iso-line geometry rather than brute-forcing a
 * per-pixel resample.
 *
 * Grid-space fractional column and row coordinates only, never display pixels, matching
 * `iso-lines.ts`'s own convention: the caller (`paint-contour.ts`) does the grid-to-display
 * transform, exactly as `field-sampler.ts`'s `resampleField` already does, so a polygon always
 * lands on the same field the base pass painted.
 *
 * ALGORITHM, three parts:
 *
 * 1. Segment chaining (`chainEdgesIntoRings`). Every marching-squares crossing point lies
 *    exactly on a cell edge; two adjacent cells that share an edge compute that edge's crossing
 *    with the IDENTICAL linear-interpolation formula `iso-lines.ts`'s own `crossingOnEdge` uses,
 *    so the two floats are bit-identical (not merely close). Joining by a `toFixed(9)`-rounded
 *    point key is therefore exact for this module's own inputs, not a tolerance-based nicety.
 *
 * 2. Field-edge closure. A single LEVEL's "region where value >= level" is not just the interior
 *    marching-squares segments: it also needs whichever stretches of the field rectangle's own
 *    perimeter fall inside that region. `stitchBandRings` builds those boundary stretches
 *    directly from `values` (never assuming an orientation, per this module's own field-edge
 *    closure requirement): for every unit edge between two adjacent perimeter grid points, if
 *    both ends are >= `level`, the whole unit edge is a boundary graph edge; if exactly one end
 *    is, the edge is split at its own crossing (identical formula to `iso-lines.ts` again); if
 *    neither end is, the edge contributes nothing. Combined with the interior segments, every
 *    node in the resulting graph has degree exactly two, so the graph decomposes into closed
 *    rings with no special-casing beyond a plain shared-endpoint walk.
 *
 * 3. Holes. A ring fully contained inside another ring is a hole: classified by testing one
 *    ring's own vertex against every OTHER ring via ray-casting point-in-polygon, an odd
 *    containment count is a hole. `buildBandPolygons` derives a BAND's polygon (the region
 *    strictly between two consecutive levels) as the ABOVE-region rings at the lower level
 *    combined with the above-region rings at the upper level: since the upper region is always a
 *    subset of the lower one for a monotonic level pair, dumping both ring sets into one path and
 *    filling with the even-odd rule (`ctx.fill(path, 'evenodd')`, stated here as this module's
 *    chosen fill rule) yields exactly the lower-region-minus-upper-region band, with no
 *    dependency on either ring set's own winding direction. Identical rings appearing in BOTH
 *    sets (the degenerate case where a level pair brackets no data at all) are cancelled before
 *    the final hole classification runs, so an empty band returns a genuinely empty ring list
 *    rather than two ring lists that merely cancel visually.
 *
 * Categorical cells (`CELL_FLAG_RUINED`/`CELL_FLAG_INCOMPLETE`, resolved by the caller and passed
 * as `flags`) are excluded from the region computation entirely for topological simplicity (the
 * region-above-level pass never special-cases a categorical cell, so it always closes cleanly);
 * instead, every categorical cell's own grid rectangle (the same `[col, col+1] x [row, row+1]`
 * footprint `paint-contour.ts`'s ruin-hatch pass already draws) is tested against each band's
 * already-closed ring set and, when contained, punched out as an explicit hole ring. This matches
 * `paint-contour.ts`'s own two-pass convention (a fill pass, then a categorical overlay pass) and
 * keeps the ring-stitcher itself free of flags-aware branching.
 *
 * Zero imports outside `src/heatmap/`: this module accepts raw `ArrayLike<number>` grid data and
 * an optional flags array, mirroring `iso-lines.ts`'s own signature style, so it runs in the fast
 * Node `unit` project with no DOM and no fixture-type dependency.
 */

import { marchingSquaresSegments, type IsoSegment } from './iso-lines.ts'

/** One grid-space point: fractional column, fractional row. Named `col`/`row` rather than
 * `x`/`y` so a reader never mistakes this module's coordinates for display pixels. */
export interface GridPoint {
  col: number
  row: number
}

/** A single closed ring: `points[0]` equals `points[points.length - 1]` by construction. `hole`
 * is `true` when this ring's interior is EXCLUDED from its band's fill (nested inside another
 * ring of the same band at odd depth), `false` for an outer boundary. */
export interface BandRing {
  points: readonly GridPoint[]
  hole: boolean
}

interface GraphEdge {
  a: GridPoint
  b: GridPoint
}

/** Rounds to 9 decimal places for point-identity joins. `iso-lines.ts`'s own crossings and this
 * module's own boundary crossings share the identical interpolation formula for the same edge
 * (see this file's header), so their floats coincide bit-for-bit; this rounding is a
 * belt-and-braces safety net, not a load-bearing tolerance, mirroring
 * `tests/iso-lines.test.ts`'s own `endpointKey` pattern. */
function pointKey(p: GridPoint): string {
  return `${p.col.toFixed(9)}:${p.row.toFixed(9)}`
}

function segmentToPoints(segment: IsoSegment): [GridPoint, GridPoint] {
  return [
    { col: segment.x1, row: segment.y1 },
    { col: segment.x2, row: segment.y2 },
  ]
}

/**
 * Walks an undirected multigraph of `edges` into closed rings via plain shared-endpoint
 * chaining. Every node the callers of this function ever produce has degree exactly two (see
 * this file's header, part 2), so a well-formed input always decomposes fully into closed loops.
 * A chain that cannot close (a defensive fallback, not an expected path for this module's own
 * callers) is dropped rather than thrown, so a degenerate or future caller input never crashes
 * the renderer -- it simply contributes no ring for that dangling fragment.
 */
function chainEdgesIntoRings(edges: readonly GraphEdge[]): BandRing[] {
  if (edges.length === 0) return []

  interface WalkEdge {
    a: GridPoint
    b: GridPoint
    used: boolean
  }
  const walkEdges: WalkEdge[] = edges.map((e) => ({ a: e.a, b: e.b, used: false }))

  const adjacency = new Map<string, number[]>()
  const pointOf = new Map<string, GridPoint>()

  walkEdges.forEach((e, idx) => {
    const aKey = pointKey(e.a)
    const bKey = pointKey(e.b)
    pointOf.set(aKey, e.a)
    pointOf.set(bKey, e.b)
    const aList = adjacency.get(aKey)
    if (aList) aList.push(idx)
    else adjacency.set(aKey, [idx])
    const bList = adjacency.get(bKey)
    if (bList) bList.push(idx)
    else adjacency.set(bKey, [idx])
  })

  const rings: BandRing[] = []

  for (let startIdx = 0; startIdx < walkEdges.length; startIdx++) {
    const startEdge = walkEdges[startIdx]!
    if (startEdge.used) continue
    startEdge.used = true

    const startKey = pointKey(startEdge.a)
    const points: GridPoint[] = [startEdge.a, startEdge.b]
    let currentKey = pointKey(startEdge.b)
    let closed = currentKey === startKey
    let dangling = false

    while (!closed) {
      const candidates = adjacency.get(currentKey) ?? []
      const nextIdx = candidates.find((idx) => !walkEdges[idx]!.used)
      if (nextIdx === undefined) {
        dangling = true
        break
      }
      const nextEdge = walkEdges[nextIdx]!
      nextEdge.used = true
      const nextPoint = pointKey(nextEdge.a) === currentKey ? nextEdge.b : nextEdge.a
      points.push(nextPoint)
      currentKey = pointKey(nextPoint)
      closed = currentKey === startKey
    }

    if (!dangling && points.length >= 4) {
      rings.push({ points, hole: false })
    }
  }

  return rings
}

/** Ray-casting point-in-polygon: `true` when (`col`, `row`) lies strictly inside `points` (a
 * closed ring, first point equal to last -- the trailing duplicate is skipped). Winding-direction
 * independent, matching this module's even-odd fill choice. */
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

/** How many of `rings` (excluding `rings[skipIndex]` when given) contain point (`col`, `row`).
 * Odd depth means the point is a HOLE relative to the set; used both for per-set hole
 * classification and for testing whether a band's own fill covers a given point. */
function containmentDepth(col: number, row: number, rings: readonly BandRing[], skipIndex = -1): number {
  let depth = 0
  for (let i = 0; i < rings.length; i++) {
    if (i === skipIndex) continue
    if (pointInRing(col, row, rings[i]!.points)) depth++
  }
  return depth
}

/** Reclassifies every ring's `hole` flag from its nesting depth within `rings` itself (never
 * inherited from wherever a ring originated), so combining ring sets from two different levels
 * (`buildBandPolygons`) always produces a self-consistent classification for the COMBINED set. */
function classifyHoles(rings: readonly BandRing[]): BandRing[] {
  return rings.map((ring, i) => {
    const probe = ring.points[0]!
    const depth = containmentDepth(probe.col, probe.row, rings, i)
    return { points: ring.points, hole: depth % 2 === 1 }
  })
}

/** `true` when point (`col`, `row`) is painted by `rings` under the even-odd rule: an odd number
 * of rings (regardless of their own individually-recorded `hole` flag) contain the point. */
function isPointFilledByRings(col: number, row: number, rings: readonly BandRing[]): boolean {
  return containmentDepth(col, row, rings) % 2 === 1
}

/** A stable identity for a ring's geometry, independent of its starting vertex or winding
 * direction, so two geometrically identical rings (e.g. the same field-rectangle boundary
 * produced at two different, but equally-covering, threshold levels) compare equal. Rotates to
 * start at the lexicographically smallest vertex, then keeps whichever of the two possible
 * traversal directions sorts first. */
function canonicalRingKey(ring: BandRing): string {
  const pts = ring.points.slice(0, -1)
  if (pts.length === 0) return ''
  let minIdx = 0
  for (let i = 1; i < pts.length; i++) {
    const candidate = pts[i]!
    const current = pts[minIdx]!
    if (candidate.col < current.col || (candidate.col === current.col && candidate.row < current.row)) {
      minIdx = i
    }
  }
  const n = pts.length
  const toKey = (p: GridPoint): string => `${p.col.toFixed(9)},${p.row.toFixed(9)}`
  const forward: string[] = []
  const backward: string[] = []
  for (let k = 0; k < n; k++) {
    forward.push(toKey(pts[(minIdx + k) % n]!))
    backward.push(toKey(pts[(minIdx - k + n) % n]!))
  }
  const forwardKey = forward.join('|')
  const backwardKey = backward.join('|')
  return forwardKey < backwardKey ? forwardKey : backwardKey
}

/** Removes exactly-coincident ring pairs between `loRings` (the lower level's region) and
 * `hiRings` (the upper level's region): the degenerate case where the two levels bracket no data
 * at all, so the band is genuinely empty rather than two rings that merely cancel under even-odd
 * fill. Each cancellation removes exactly one matching ring from each side. */
function cancelIdenticalRings(loRings: readonly BandRing[], hiRings: readonly BandRing[]): BandRing[] {
  const hiRemaining = hiRings.slice()
  const result: BandRing[] = []
  for (const lo of loRings) {
    const loKey = canonicalRingKey(lo)
    const matchIndex = hiRemaining.findIndex((hi) => canonicalRingKey(hi) === loKey)
    if (matchIndex >= 0) {
      hiRemaining.splice(matchIndex, 1)
    } else {
      result.push(lo)
    }
  }
  result.push(...hiRemaining)
  return result
}

/**
 * Stitches `segments` (a single level's UNSTITCHED `marchingSquaresSegments` output, always
 * called WITHOUT `flags` here -- see this file's header on why categorical exclusion is a
 * separate, later step) into the closed ring set for the region where `values >= level` over the
 * `cols` by `rows` field, INCLUDING whichever stretches of the field rectangle's own perimeter
 * fall inside that region (field-edge closure, part 2 of this file's header). `values` and
 * `level` are required (beyond `segments`, `cols`, `rows`) precisely because the field-edge
 * closure direction can only be determined by testing a real grid value, never assumed from
 * orientation alone.
 *
 * Degenerate grids (`cols` below 2 or `rows` below 2) return an empty ring list rather than
 * throwing, matching `marchingSquaresSegments`'s own contract.
 */
export function stitchBandRings(
  segments: readonly IsoSegment[],
  cols: number,
  rows: number,
  values: ArrayLike<number>,
  level: number,
): BandRing[] {
  if (cols < 2 || rows < 2) return []

  const isAbove = (col: number, row: number): boolean => (values[row * cols + col] ?? 0) >= level

  // The field rectangle's perimeter, in grid-space integer coordinates, walked once around
  // (clockwise in grid-index terms; even-odd fill does not depend on winding direction).
  const perimeter: GridPoint[] = []
  for (let col = 0; col < cols; col++) perimeter.push({ col, row: 0 })
  for (let row = 1; row < rows; row++) perimeter.push({ col: cols - 1, row })
  for (let col = cols - 2; col >= 0; col--) perimeter.push({ col, row: rows - 1 })
  for (let row = rows - 2; row >= 1; row--) perimeter.push({ col: 0, row })

  const edges: GraphEdge[] = []
  const perimeterLength = perimeter.length
  for (let i = 0; i < perimeterLength; i++) {
    const a = perimeter[i]!
    const b = perimeter[(i + 1) % perimeterLength]!
    const aboveA = isAbove(a.col, a.row)
    const aboveB = isAbove(b.col, b.row)
    if (aboveA && aboveB) {
      edges.push({ a, b })
    } else if (aboveA !== aboveB) {
      // Identical formula to iso-lines.ts's own crossingOnEdge (this file's header, part 1), so
      // this crossing is bit-identical to any interior segment's crossing on the same edge.
      const valA = values[a.row * cols + a.col] ?? 0
      const valB = values[b.row * cols + b.col] ?? 0
      const span = valB - valA
      const t = span === 0 ? 0.5 : (level - valA) / span
      const crossing: GridPoint = { col: a.col + t * (b.col - a.col), row: a.row + t * (b.row - a.row) }
      edges.push(aboveA ? { a, b: crossing } : { a: crossing, b })
    }
  }

  for (const segment of segments) {
    const [a, b] = segmentToPoints(segment)
    edges.push({ a, b })
  }

  return classifyHoles(chainEdgesIntoRings(edges))
}

function categoricalHoleRing(col: number, row: number): BandRing {
  return {
    points: [
      { col, row },
      { col: col + 1, row },
      { col: col + 1, row: row + 1 },
      { col, row: row + 1 },
      { col, row },
    ],
    hole: true,
  }
}

/**
 * Builds, per band (the `bandLevels.length - 1` consecutive-level pairs), the closed ring list
 * that fills it: band `i`'s rings are the region-above-`bandLevels[i]` rings combined with the
 * region-above-`bandLevels[i + 1]` rings (this file's header, part 3), with identical rings
 * between the two levels cancelled first and the final combined set's hole flags reclassified
 * from scratch.
 *
 * Every cell carrying a non-zero `flags` byte (`CELL_FLAG_RUINED`/`CELL_FLAG_INCOMPLETE`,
 * resolved by the caller) is excluded from every band whose already-closed ring set would
 * otherwise cover it: its own `[col, col + 1] x [row, row + 1]` grid rectangle is punched out as
 * an explicit hole ring on that one band, matching `paint-contour.ts`'s own ruin-hatch rectangle
 * convention.
 *
 * Degenerate grids (`cols` below 2 or `rows` below 2) return an empty ring list for every band
 * rather than throwing.
 */
export function buildBandPolygons(
  values: ArrayLike<number>,
  cols: number,
  rows: number,
  bandLevels: readonly number[],
  flags?: ArrayLike<number>,
): BandRing[][] {
  const numBands = Math.max(bandLevels.length - 1, 0)
  if (cols < 2 || rows < 2 || numBands === 0) {
    return Array.from({ length: numBands }, () => [])
  }

  const regionRingsByLevel: BandRing[][] = bandLevels.map((level) => {
    const segments = marchingSquaresSegments(values, cols, rows, level)
    return stitchBandRings(segments, cols, rows, values, level)
  })

  const categoricalCells: GridPoint[] = []
  if (flags !== undefined) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if ((flags[row * cols + col] ?? 0) !== 0) {
          categoricalCells.push({ col, row })
        }
      }
    }
  }

  const bands: BandRing[][] = []
  for (let i = 0; i < numBands; i++) {
    const loRings = regionRingsByLevel[i]!
    const hiRings = regionRingsByLevel[i + 1]!
    const combined = classifyHoles(cancelIdenticalRings(loRings, hiRings))

    let bandRings = combined
    for (const cell of categoricalCells) {
      const centerCol = cell.col + 0.5
      const centerRow = cell.row + 0.5
      if (isPointFilledByRings(centerCol, centerRow, bandRings)) {
        bandRings = [...bandRings, categoricalHoleRing(cell.col, cell.row)]
      }
    }

    bands.push(bandRings)
  }

  return bands
}
