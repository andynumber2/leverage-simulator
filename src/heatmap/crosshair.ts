/**
 * src/heatmap/crosshair.ts
 *
 * 07-08-PLAN.md Task 1 (D-19/D-21, T-07-16/T-07-17): pure grid-space geometry for the field's
 * pointer -- no DOM, no Solid import -- so it runs in the fast Node `unit` project exactly like
 * its sibling modules (`field-sampler.ts`, `iso-lines.ts`, `polygon-fill.ts`).
 *
 * `crosshairCellFor` resolves a display-space pointer position to the grid cell whose CENTRE is
 * nearest it, INVERTING the same vertical flip `field-sampler.ts`'s `resampleField` and
 * `paint-contour.ts`'s `gridRowToDisplayY` bake in (fixture/grid row 0, the lowest leverage,
 * paints at the BOTTOM of the field). Getting that inversion backwards is the trap this module
 * exists to close (T-07-16): a hit test that forgets it would point at a leverage that is the
 * MIRROR of the one the reader actually clicked, and it would look entirely plausible while doing
 * it, since every row still resolves to SOME in-range leverage.
 *
 * On-boundary tie rule (stated explicitly per this plan's own acceptance criterion): for a
 * uniformly spaced grid, "nearest cell centre" and "the cell whose half-open interval
 * `[c, c+1)` contains the point" are the identical partition everywhere except exactly on a cell
 * boundary, where the two would otherwise disagree only by floating-point luck. This module
 * resolves that tie with a plain `Math.floor` over the pointer's fractional grid position, so a
 * pointer exactly on the boundary between cell `c` and cell `c+1` always resolves to `c+1` (the
 * cell whose interval BEGINS at that boundary), never to floating-point chance.
 *
 * `clampLeverageToGrid` answers Pitfall 6 (`07-RESEARCH.md` Open Question 2, `07-CONTEXT.md`
 * left undecided): `LeverageControl.tsx` accepts `(0, 20]` but D-01 fixes the sweep grid's own
 * leverage axis at `[1, 5]` over `SWEEP_ROWS` rows, so a leverage set in Single run mode can have
 * no corresponding grid row. This plan's adopted rule, following D-21's snap-to-nearest
 * precedent: clamp the DRAWN crosshair to the nearest grid edge row and leave the STORED leverage
 * value completely untouched -- the caller decides what "untouched" means for its own write path,
 * this function only reports the row and whether clamping occurred, so the drawn position is
 * never presented as an exact one (T-07-17).
 */

import { LEVERAGE_MAX, LEVERAGE_MIN, rowForLeverage, SWEEP_ROWS } from '../sweep/sweep-grid.ts'

/** A display-pixel rectangle the field paints into, in the SAME coordinate space the pointer
 * position is measured in -- mirrors
 * `.planning/phases/06-heatmap-design-pass/mockups/forms/form-2-filled-contour.ts`'s own
 * `FieldRect`, generalized so a caller whose canvas reserves no internal axis gutter (the
 * production `HeatmapPanel.tsx`, whose gutter lives OUTSIDE the canvas as wrapper padding) can
 * pass `{ x: 0, y: 0, width: canvasWidthPx, height: canvasHeightPx }` with no adaptation. */
export interface FieldRect {
  x: number
  y: number
  width: number
  height: number
}

/** The grid cell (column, row) a display-space pointer position resolves to, in the grid's own
 * unflipped row indexing (row 0 is the lowest leverage), matching `src/app/state.ts`'s
 * `CrosshairCell` shape. */
export interface CrosshairCellHit {
  col: number
  row: number
}

function clampIndex(value: number, max: number): number {
  return Math.min(max, Math.max(0, value))
}

/**
 * Resolves `(displayX, displayY)` to the `cols` by `rows` grid cell whose centre is nearest it,
 * within `fieldRect`. Returns `null` when the pointer lies outside `fieldRect` (`displayX`/
 * `displayY` before the rect's origin, or at or past its far edge -- the far edge is EXCLUSIVE,
 * matching a typical canvas's own `[0, widthPx)` pixel addressing).
 *
 * Applies the A-E5 vertical flip explicitly: the fractional row nearest the pointer, measured
 * from the TOP of `fieldRect` (`imgRow`), is inverted to the grid's own row indexing via
 * `rows - 1 - imgRow`, the exact inverse of `field-sampler.ts`'s `resampleField`/
 * `paint-contour.ts`'s `gridRowToDisplayY` mapping.
 */
export function crosshairCellFor(
  displayX: number,
  displayY: number,
  fieldRect: FieldRect,
  cols: number,
  rows: number,
): CrosshairCellHit | null {
  const localX = displayX - fieldRect.x
  const localY = displayY - fieldRect.y
  if (localX < 0 || localX >= fieldRect.width || localY < 0 || localY >= fieldRect.height) {
    return null
  }

  const cellWidthPx = fieldRect.width / cols
  const cellHeightPx = fieldRect.height / rows

  const col = clampIndex(Math.floor(localX / cellWidthPx), cols - 1)
  const imgRow = clampIndex(Math.floor(localY / cellHeightPx), rows - 1)
  const row = rows - 1 - imgRow

  return { col, row }
}

/** `clampLeverageToGrid`'s own return shape: the nearest grid row (always within
 * `[0, SWEEP_ROWS - 1]`) and whether reaching it required clamping `leverage` into
 * `[LEVERAGE_MIN, LEVERAGE_MAX]` first. `clamped` is `false` whenever `leverage` already falls
 * inside the grid's own range (rounding a value like 3.0 to its nearest row is ordinary
 * quantisation, not the off-grid clamp this flag reports), including at the two range edges
 * (1.0 and 5.0) themselves. */
export interface ClampedLeverage {
  row: number
  clamped: boolean
}

/**
 * Never throws for any finite input and never returns a row outside `[0, SWEEP_ROWS - 1]`
 * (T-07-17) -- a non-finite input is treated as `LEVERAGE_MIN` rather than propagating `NaN`
 * through the row calculation, so this holds even for a caller that does not itself guard against
 * `NaN`/`Infinity`.
 */
export function clampLeverageToGrid(leverage: number): ClampedLeverage {
  const finiteLeverage = Number.isFinite(leverage) ? leverage : LEVERAGE_MIN
  const boundedLeverage = Math.min(LEVERAGE_MAX, Math.max(LEVERAGE_MIN, finiteLeverage))
  const clamped = boundedLeverage !== finiteLeverage

  const rawRow = rowForLeverage(boundedLeverage)
  const row = Math.min(SWEEP_ROWS - 1, Math.max(0, Math.round(rawRow)))

  return { row, clamped }
}
