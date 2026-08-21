/**
 * .planning/phases/06-heatmap-design-pass/mockups/shared/iso-lines.ts
 *
 * 06-03-PLAN.md Task 1: emits UNSTITCHED marching-squares segments for a level curve over a
 * regular value grid. Both forms 2 and 4 (D-02) draw band boundaries and the breakeven boundary
 * this way. Stitching segments into a single continuous polyline is the genuinely hard part of
 * marching squares -- and is not needed here, because stroking many short, unstitched segments
 * with a shared `beginPath`/`stroke` renders visually identically to one stitched polyline. This
 * module skips that step entirely, so the whole geometry surface is one 16-case classification
 * (via edge-crossing counting, not a literal 16-row table) plus the standard mean-of-corners
 * saddle disambiguation for the two ambiguous (checkerboard) cases.
 *
 * Plain TypeScript, zero imports, no geometry constants of its own: every coordinate this module
 * emits is in GRID space (fractional column/row), never display pixels. The caller (a form's own
 * paint function) converts grid coordinates to display coordinates, exactly the same way
 * `field-sampler.ts`'s `resampleField` does for the base pass, so a segment always lands on the
 * exact same field the base pass painted.
 */

/** One unstitched line segment, in GRID coordinates (fractional column, fractional row). */
export interface IsoSegment {
  x1: number
  y1: number
  x2: number
  y2: number
}

interface Point {
  x: number
  y: number
}

/** `true` when `flags[index]` carries any categorical bit (D-18/D-20). `flags` is optional: a
 * caller with no categorical data (e.g. a purely analytic test field) can omit it and every cell
 * is treated as plain. */
function isCategorical(flags: ArrayLike<number> | undefined, index: number): boolean {
  if (flags === undefined) return false
  return (flags[index] ?? 0) !== 0
}

/**
 * The level-crossing point on the edge from grid point (`colA`, `rowA`) to (`colB`, `rowB`),
 * whose values are `valA`/`valB`, or `undefined` when the two corners are on the same side of
 * `level` (no crossing on this edge). Linear interpolation; degenerates to the edge's own
 * midpoint in the zero-span case (`valA === valB`), which never occurs when a crossing was found
 * (equal values are always classified on the same side), kept only so the arithmetic never
 * divides by zero if this function is ever called without the sign-change guard.
 */
function crossingOnEdge(
  colA: number,
  rowA: number,
  valA: number,
  colB: number,
  rowB: number,
  valB: number,
  level: number,
): Point | undefined {
  const aboveA = valA >= level
  const aboveB = valB >= level
  if (aboveA === aboveB) return undefined
  const span = valB - valA
  const t = span === 0 ? 0.5 : (level - valA) / span
  return { x: colA + t * (colB - colA), y: rowA + t * (rowB - rowA) }
}

/**
 * Emits unstitched iso-line segments for `level` over `values` (row-major, length `cols * rows`,
 * `values[row * cols + col]`). Walks every one of the `(cols - 1) * (rows - 1)` marching-squares
 * cells (the quads formed by four adjacent grid points), classifies each of the cell's four
 * edges for a level crossing, and:
 *
 * - 0 crossings: the cell is entirely above or entirely below `level` -- no segment.
 * - 2 crossings: exactly one way to connect them -- one segment.
 * - 4 crossings: the saddle/checkerboard case (opposite corners share a class, adjacent corners
 *   don't -- the classic cases 5 and 10). Resolved by comparing `level` against the mean of the
 *   four corners: if the mean's own above/below class matches the top-left corner's, the pairing
 *   isolates the top-left corner (its two adjacent edges, top and left) from the bottom-right
 *   corner (its two adjacent edges, bottom and right); otherwise the pairing isolates top-right
 *   from bottom-left. This is the standard "asymptotic decider" and is exactly the two-line rule
 *   06-03-PLAN.md's "Resolved before execution" note describes.
 *
 * Any cell with a categorical (`flags`) corner is skipped entirely (D-18/D-20): no iso-line is
 * ever drawn through a region that carries no computed value.
 */
export function marchingSquaresSegments(
  values: ArrayLike<number>,
  cols: number,
  rows: number,
  level: number,
  flags?: ArrayLike<number>,
): IsoSegment[] {
  const segments: IsoSegment[] = []
  if (cols < 2 || rows < 2) return segments

  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const iTL = row * cols + col
      const iTR = row * cols + col + 1
      const iBL = (row + 1) * cols + col
      const iBR = (row + 1) * cols + col + 1

      if (isCategorical(flags, iTL) || isCategorical(flags, iTR) || isCategorical(flags, iBL) || isCategorical(flags, iBR)) {
        continue
      }

      const vTL = values[iTL] ?? 0
      const vTR = values[iTR] ?? 0
      const vBL = values[iBL] ?? 0
      const vBR = values[iBR] ?? 0

      const pTop = crossingOnEdge(col, row, vTL, col + 1, row, vTR, level)
      const pRight = crossingOnEdge(col + 1, row, vTR, col + 1, row + 1, vBR, level)
      const pBottom = crossingOnEdge(col, row + 1, vBL, col + 1, row + 1, vBR, level)
      const pLeft = crossingOnEdge(col, row, vTL, col, row + 1, vBL, level)

      const crossingCount =
        (pTop !== undefined ? 1 : 0) +
        (pRight !== undefined ? 1 : 0) +
        (pBottom !== undefined ? 1 : 0) +
        (pLeft !== undefined ? 1 : 0)

      if (crossingCount === 0) continue

      if (crossingCount === 2) {
        const points = [pTop, pRight, pBottom, pLeft].filter((p): p is Point => p !== undefined)
        const a = points[0]!
        const b = points[1]!
        segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })
        continue
      }

      // crossingCount === 4: the saddle case. Every corner is guaranteed a crossing on both of
      // its own edges, so pTop/pRight/pBottom/pLeft are all defined here.
      const tlAbove = vTL >= level
      const center = (vTL + vTR + vBL + vBR) / 4
      const centerAbove = center >= level

      if (centerAbove === tlAbove) {
        segments.push({ x1: pTop!.x, y1: pTop!.y, x2: pLeft!.x, y2: pLeft!.y })
        segments.push({ x1: pBottom!.x, y1: pBottom!.y, x2: pRight!.x, y2: pRight!.y })
      } else {
        segments.push({ x1: pTop!.x, y1: pTop!.y, x2: pRight!.x, y2: pRight!.y })
        segments.push({ x1: pLeft!.x, y1: pLeft!.y, x2: pBottom!.x, y2: pBottom!.y })
      }
    }
  }

  return segments
}
