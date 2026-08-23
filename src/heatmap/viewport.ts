/**
 * src/heatmap/viewport.ts
 *
 * 07-10-PLAN.md Task 1 (D-34/D-35, PERF-09): pure transform maths for the field's pan/zoom
 * gesture -- no DOM, no Solid import -- so it runs in the fast Node `unit` project exactly like
 * its sibling modules (`crosshair.ts`, `field-sampler.ts`, `iso-lines.ts`).
 *
 * A `SweepViewport` is a scale plus an x and y pan offset, defined entirely in FIELD-RECTANGLE
 * DISPLAY-PIXEL space -- the same coordinate space `crosshair.ts`'s `FieldRect`, `paint-contour.ts`'s
 * `gridColToDisplayX`/`gridRowToDisplayY`, and `HeatmapPanel.tsx`'s own field stack all already
 * share. `applyViewportTransform` maps a LOGICAL (un-zoomed) display point to the SCREEN point a
 * caller should paint or hit-test at; `invertViewportTransform` is its exact inverse, used to turn
 * a raw pointer position back into the logical field-rect coordinate `crosshairCellFor` expects.
 * Composing with the A-E5 vertical flip is deliberately NOT this module's job (D-34's own action
 * text): `resampleField`/`gridRowToDisplayY`/`crosshairCellFor` already apply that flip once, and
 * this module's transform sits purely ON TOP of whatever logical display point they hand back, so
 * there remains exactly one place in the codebase that knows row 0 paints at the bottom.
 *
 * `ZOOM_MAX_SCALE` (8.0) is a planner-authored value, not sourced from any prior artifact: at 8x a
 * 200-column entry-date axis shows 25 columns and a 50-row leverage axis shows about 6 rows, well
 * past the point where individual cells are pointable, and going further would magnify past any
 * useful reading of the field.
 *
 * `HeatmapPanel.tsx` applies the SAME `SweepViewport` to the field canvas's 2D context via
 * `ctx.translate(offsetX, offsetY); ctx.scale(scale, scale)` before re-invoking
 * `paintSweepField` -- this is deliberate and requires no change to `paint-contour.ts`: the FILL
 * pass (`paintResampleFill`) already reads the D-09 offscreen-cache bitmap via `drawImage` at the
 * grid's unchanged `generation`/`metric`/`cols`/`rows`, so the cache stays warm and the transform
 * alone stretches the cached bitmap (the "goes soft past 1:1" tradeoff D-34 names); every stroke
 * pass (band boundaries, the ruin hatch, the short-horizon rule, the curve label) is genuinely
 * REDRAWN under the same canvas transform, so those stay crisp at any zoom rather than blurring
 * with the bitmap.
 */

import type { FieldRect } from './crosshair.ts'

/** D-34: zoom never goes below "fit" -- the field's own native, un-zoomed scale. */
export const ZOOM_MIN_SCALE = 1.0

/** Planner-authored (this module's own header): past 8x, individual cells are already well past
 * pointable and further magnification reads nothing useful. */
export const ZOOM_MAX_SCALE = 8.0

/** A scale plus an x/y pan offset, both in field-rectangle DISPLAY-PIXEL space (this module's own
 * header). `offsetX`/`offsetY` are always non-positive at `scale >= ZOOM_MIN_SCALE` for a viewport
 * that has passed through `clampViewport` -- the field's own top-left corner never moves right of
 * or below the canvas origin. */
export interface SweepViewport {
  scale: number
  offsetX: number
  offsetY: number
}

/** The field rectangle's own pixel dimensions -- deliberately NOT `crosshair.ts`'s full `FieldRect`
 * (which also carries an `x`/`y` origin irrelevant to a pan clamp computed purely from span). */
export interface FieldSize {
  widthPx: number
  heightPx: number
}

/** A plain 2D point, in whichever space a given function's own doc comment names. */
export interface ViewportPoint {
  x: number
  y: number
}

/** The un-zoomed, un-panned viewport: identity scale, zero offset. */
export const FIT_VIEWPORT: SweepViewport = { scale: ZOOM_MIN_SCALE, offsetX: 0, offsetY: 0 }

function clampScale(scale: number): number {
  return Math.min(ZOOM_MAX_SCALE, Math.max(ZOOM_MIN_SCALE, scale))
}

/**
 * Clamps `viewport` against `field`'s own pixel span (T-07-22): the scale is bounded to
 * `[ZOOM_MIN_SCALE, ZOOM_MAX_SCALE]` first, then the pan offset.
 *
 * At or below `ZOOM_MIN_SCALE` (fit scale or narrower, though narrower never legitimately occurs
 * once clamped), the pan offset is pinned to zero: panning a fit-scale field does nothing, which is
 * D-34's own "pan becomes meaningful only once zoomed past fit."
 *
 * Above fit scale, the offset is bounded so the visible field-rect-space rectangle
 * `[0, field.widthPx) x [0, field.heightPx)` never extends past the SCALED field's own bounds in
 * either axis: `offsetX` in `[field.widthPx * (1 - scale), 0]`, `offsetY` in
 * `[field.heightPx * (1 - scale), 0]`. Both bounds collapse to a single point (zero) exactly at
 * `scale === ZOOM_MIN_SCALE`, matching the fit-scale case above by construction, not as a special
 * case.
 */
export function clampViewport(viewport: SweepViewport, field: FieldSize): SweepViewport {
  const scale = clampScale(viewport.scale)
  if (scale <= ZOOM_MIN_SCALE) {
    return { scale, offsetX: 0, offsetY: 0 }
  }
  const minOffsetX = field.widthPx * (1 - scale)
  const minOffsetY = field.heightPx * (1 - scale)
  const offsetX = Math.min(0, Math.max(minOffsetX, viewport.offsetX))
  const offsetY = Math.min(0, Math.max(minOffsetY, viewport.offsetY))
  return { scale, offsetX, offsetY }
}

/**
 * Maps a LOGICAL (un-zoomed) field-rect-space point to the SCREEN point the same content paints
 * or hit-tests at under `viewport`. At `viewport === FIT_VIEWPORT` (scale 1.0, zero offset) this is
 * the identity -- `applyViewportTransform(FIT_VIEWPORT, p)` returns a point equal to `p` -- so the
 * rendered field is pixel-identical to the un-zoomed field exactly as PERF-09's own must_have
 * states.
 */
export function applyViewportTransform(viewport: SweepViewport, point: ViewportPoint): ViewportPoint {
  return {
    x: point.x * viewport.scale + viewport.offsetX,
    y: point.y * viewport.scale + viewport.offsetY,
  }
}

/**
 * The exact inverse of `applyViewportTransform`: given a SCREEN point (e.g. a raw pointer position
 * read off the crosshair overlay canvas's own unchanged CSS box), returns the LOGICAL field-rect
 * point `crosshairCellFor` expects. `HeatmapPanel.tsx` calls this before every hit test so panning
 * and zooming never change which grid cell a given screen pixel resolves to relative to what the
 * reader is actually looking at.
 */
export function invertViewportTransform(viewport: SweepViewport, point: ViewportPoint): ViewportPoint {
  return {
    x: (point.x - viewport.offsetX) / viewport.scale,
    y: (point.y - viewport.offsetY) / viewport.scale,
  }
}

/**
 * Applies a zoom gesture centred on `screenPoint` (a SCREEN-space point, e.g. the pointer position
 * a wheel event fired at): computes the new scale (`viewport.scale * scaleFactor`, clamped to
 * `[ZOOM_MIN_SCALE, ZOOM_MAX_SCALE]`) and the offset that keeps the LOGICAL point currently under
 * `screenPoint` mapped to that exact same `screenPoint` after the scale changes -- "zooming toward
 * a pointer keeps the grid cell under that pointer fixed" (this plan's own behavior list).
 *
 * A zoom-out request already at `ZOOM_MIN_SCALE`, or a zoom-in request already at `ZOOM_MAX_SCALE`,
 * clamps to the SAME scale the input viewport already carries -- returns `viewport` UNCHANGED
 * (reference-stable, not merely value-equal) rather than a no-op recomputation, so a caller can
 * short-circuit a repaint on an unchanged reference if it chooses to.
 */
export function zoomViewportAt(
  viewport: SweepViewport,
  field: FieldSize,
  screenPoint: ViewportPoint,
  scaleFactor: number,
): SweepViewport {
  const targetScale = clampScale(viewport.scale * scaleFactor)
  if (targetScale === viewport.scale) return viewport

  const logical = invertViewportTransform(viewport, screenPoint)
  const candidate: SweepViewport = {
    scale: targetScale,
    offsetX: screenPoint.x - targetScale * logical.x,
    offsetY: screenPoint.y - targetScale * logical.y,
  }
  return clampViewport(candidate, field)
}

/** The grid index range currently visible under `viewport`, in the grid's own unflipped indexing
 * (matching `crosshair.ts`'s `CrosshairCellHit`): the FIRST and LAST entry-date column index, and
 * the FIRST and LAST leverage row index, whose cell centre or any part of whose cell rectangle
 * falls within `field`'s own pixel bounds once the viewport's pan/zoom is applied. Every field is
 * always within `[0, cols - 1]`/`[0, rows - 1]`, clamped rather than allowed to run past the grid's
 * own bounds even at the most extreme pan offset `clampViewport` allows. */
export interface VisibleDomain {
  firstCol: number
  lastCol: number
  firstRow: number
  lastRow: number
}

function clampIndex(value: number, max: number): number {
  return Math.min(max, Math.max(0, value))
}

/**
 * Derives `VisibleDomain` from the TRANSFORMED domain -- inverting `viewport` at the field's own
 * four corners to find the logical field-rect span currently on screen, then converting that span
 * to grid column/row indices via the SAME cell-width/cell-height division `crosshairCellFor` uses
 * -- never from rounded display pixels, so a caller drawing axis ticks from this range always names
 * a real entry date / real leverage (D-34's "axes rescale... keep stating real dates and
 * leverages").
 *
 * Applies the A-E5 vertical flip the same way `crosshairCellFor` does: the visible range is first
 * computed in TOP-based image-row space, then inverted (`rows - 1 - imgRow`) to the grid's own
 * unflipped row indexing, swapping which bound is "first" and which is "last" in the process (the
 * image-row range's LOWER bound corresponds to the grid's own HIGHER row index, since row 0 paints
 * at the bottom).
 */
export function visibleDomainFor(viewport: SweepViewport, field: FieldSize, grid: { cols: number; rows: number }): VisibleDomain {
  const { cols, rows } = grid
  const cellWidthPx = field.widthPx / cols
  const cellHeightPx = field.heightPx / rows

  const topLeft = invertViewportTransform(viewport, { x: 0, y: 0 })
  const bottomRight = invertViewportTransform(viewport, { x: field.widthPx, y: field.heightPx })

  const firstCol = clampIndex(Math.floor(topLeft.x / cellWidthPx), cols - 1)
  const lastCol = clampIndex(Math.ceil(bottomRight.x / cellWidthPx) - 1, cols - 1)

  const firstImgRow = clampIndex(Math.floor(topLeft.y / cellHeightPx), rows - 1)
  const lastImgRow = clampIndex(Math.ceil(bottomRight.y / cellHeightPx) - 1, rows - 1)

  return {
    firstCol: Math.min(firstCol, lastCol),
    lastCol: Math.max(firstCol, lastCol),
    firstRow: clampIndex(rows - 1 - lastImgRow, rows - 1),
    lastRow: clampIndex(rows - 1 - firstImgRow, rows - 1),
  }
}
