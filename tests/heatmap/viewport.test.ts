/**
 * tests/heatmap/viewport.test.ts: 07-10-PLAN.md Task 1, correctness assertions for
 * `src/heatmap/viewport.ts`'s pure pan/zoom transform maths. Runs in the fast Node `unit` project:
 * `viewport.ts` has no DOM dependency and no `solid-js` import.
 */

import { describe, expect, test } from 'vitest'

import { crosshairCellFor, type FieldRect } from '../../src/heatmap/crosshair.ts'
import {
  applyViewportTransform,
  clampViewport,
  FIT_VIEWPORT,
  invertViewportTransform,
  visibleDomainFor,
  zoomViewportAt,
  ZOOM_MAX_SCALE,
  ZOOM_MIN_SCALE,
  type FieldSize,
  type SweepViewport,
} from '../../src/heatmap/viewport.ts'
import { SWEEP_COLS, SWEEP_ROWS } from '../../src/sweep/sweep-grid.ts'

// Mirrors HeatmapPanel.tsx's own field geometry (D-12).
const HEATMAP_WIDTH_PX = 800
const HEATMAP_HEIGHT_PX = 240
const FIELD: FieldSize = { widthPx: HEATMAP_WIDTH_PX, heightPx: HEATMAP_HEIGHT_PX }
const FIELD_RECT: FieldRect = { x: 0, y: 0, width: HEATMAP_WIDTH_PX, height: HEATMAP_HEIGHT_PX }
const GRID = { cols: SWEEP_COLS, rows: SWEEP_ROWS }

describe('applyViewportTransform', () => {
  test('is the identity at scale 1.0 with zero offset', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 400, y: 120 },
      { x: 799, y: 239 },
    ]
    for (const point of points) {
      expect(applyViewportTransform(FIT_VIEWPORT, point)).toEqual(point)
    }
  })

  test('scales and translates a point away from the identity when zoomed and panned', () => {
    const viewport: SweepViewport = { scale: 2, offsetX: -100, offsetY: -50 }
    expect(applyViewportTransform(viewport, { x: 10, y: 10 })).toEqual({ x: -80, y: -30 })
  })
})

describe('invertViewportTransform', () => {
  test('is the exact inverse of applyViewportTransform at an arbitrary zoomed/panned viewport', () => {
    const viewport: SweepViewport = { scale: 3.5, offsetX: -212, offsetY: -68 }
    const logical = { x: 137.25, y: 41.5 }
    const screen = applyViewportTransform(viewport, logical)
    const roundTripped = invertViewportTransform(viewport, screen)
    expect(roundTripped.x).toBeCloseTo(logical.x, 9)
    expect(roundTripped.y).toBeCloseTo(logical.y, 9)
  })
})

describe('clampViewport', () => {
  test('a pan request at fit scale leaves both offsets at zero', () => {
    const result = clampViewport({ scale: ZOOM_MIN_SCALE, offsetX: 250, offsetY: -90 }, FIELD)
    expect(result).toEqual({ scale: ZOOM_MIN_SCALE, offsetX: 0, offsetY: 0 })
  })

  test('a pan request above fit scale is clamped so the visible rectangle stays inside the field bounds, at all four edges', () => {
    const scale = 2
    const minOffsetX = FIELD.widthPx * (1 - scale)
    const minOffsetY = FIELD.heightPx * (1 - scale)

    // Pan far past the right/bottom edge: offset clamps to its max (0).
    const pastRightBottom = clampViewport({ scale, offsetX: 10_000, offsetY: 10_000 }, FIELD)
    expect(pastRightBottom.offsetX).toBe(0)
    expect(pastRightBottom.offsetY).toBe(0)

    // Pan far past the left/top edge: offset clamps to its min.
    const pastLeftTop = clampViewport({ scale, offsetX: -10_000, offsetY: -10_000 }, FIELD)
    expect(pastLeftTop.offsetX).toBe(minOffsetX)
    expect(pastLeftTop.offsetY).toBe(minOffsetY)

    // A within-bounds offset passes through unchanged.
    const midOffsetX = minOffsetX / 2
    const midOffsetY = minOffsetY / 2
    const withinBounds = clampViewport({ scale, offsetX: midOffsetX, offsetY: midOffsetY }, FIELD)
    expect(withinBounds.offsetX).toBe(midOffsetX)
    expect(withinBounds.offsetY).toBe(midOffsetY)
  })

  test('scale is clamped to [ZOOM_MIN_SCALE, ZOOM_MAX_SCALE]', () => {
    expect(clampViewport({ scale: 0.1, offsetX: 0, offsetY: 0 }, FIELD).scale).toBe(ZOOM_MIN_SCALE)
    expect(clampViewport({ scale: 999, offsetX: 0, offsetY: 0 }, FIELD).scale).toBe(ZOOM_MAX_SCALE)
  })
})

describe('zoomViewportAt', () => {
  test('a zoom-out request at ZOOM_MIN_SCALE returns the unchanged viewport', () => {
    const result = zoomViewportAt(FIT_VIEWPORT, FIELD, { x: 400, y: 120 }, 0.5)
    expect(result).toBe(FIT_VIEWPORT)
  })

  test('a zoom-in request at ZOOM_MAX_SCALE returns the unchanged viewport', () => {
    const atMax: SweepViewport = clampViewport({ scale: ZOOM_MAX_SCALE, offsetX: 0, offsetY: 0 }, FIELD)
    const result = zoomViewportAt(atMax, FIELD, { x: 400, y: 120 }, 2)
    expect(result).toBe(atMax)
  })

  test('zooming toward a pointer keeps the grid cell under that pointer fixed, at three separate pointer positions', () => {
    const pointerPositions = [
      { x: 40, y: 20 }, // near top-left
      { x: 400, y: 120 }, // centre
      { x: 760, y: 220 }, // near bottom-right
    ]

    for (const screenPoint of pointerPositions) {
      const before = crosshairCellFor(screenPoint.x, screenPoint.y, FIELD_RECT, GRID.cols, GRID.rows)
      expect(before).not.toBeNull()

      const zoomed = zoomViewportAt(FIT_VIEWPORT, FIELD, screenPoint, 3)
      expect(zoomed.scale).toBeGreaterThan(FIT_VIEWPORT.scale)

      const logicalAfter = invertViewportTransform(zoomed, screenPoint)
      const after = crosshairCellFor(logicalAfter.x, logicalAfter.y, FIELD_RECT, GRID.cols, GRID.rows)

      expect(after).toEqual(before)
    }
  })
})

describe('visibleDomainFor', () => {
  test('at fit scale the visible domain spans the whole grid', () => {
    const domain = visibleDomainFor(FIT_VIEWPORT, FIELD, GRID)
    expect(domain.firstCol).toBe(0)
    expect(domain.lastCol).toBe(GRID.cols - 1)
    expect(domain.firstRow).toBe(0)
    expect(domain.lastRow).toBe(GRID.rows - 1)
  })

  test('index ranges stay within [0, SWEEP_COLS - 1] and [0, SWEEP_ROWS - 1] at every scale from 1.0 to 8.0', () => {
    for (let scale = ZOOM_MIN_SCALE; scale <= ZOOM_MAX_SCALE; scale += 0.5) {
      // Exercise several pan positions at this scale, including the extremes clampViewport allows.
      const candidates: SweepViewport[] = [
        clampViewport({ scale, offsetX: 0, offsetY: 0 }, FIELD),
        clampViewport({ scale, offsetX: -10_000, offsetY: -10_000 }, FIELD),
        clampViewport({ scale, offsetX: 10_000, offsetY: 10_000 }, FIELD),
      ]
      for (const viewport of candidates) {
        const domain = visibleDomainFor(viewport, FIELD, GRID)
        expect(domain.firstCol).toBeGreaterThanOrEqual(0)
        expect(domain.lastCol).toBeLessThanOrEqual(GRID.cols - 1)
        expect(domain.firstCol).toBeLessThanOrEqual(domain.lastCol)
        expect(domain.firstRow).toBeGreaterThanOrEqual(0)
        expect(domain.lastRow).toBeLessThanOrEqual(GRID.rows - 1)
        expect(domain.firstRow).toBeLessThanOrEqual(domain.lastRow)
      }
    }
  })

  test('a zoomed-in domain is a proper subset of the fit-scale domain', () => {
    const zoomed = clampViewport({ scale: 4, offsetX: -1000, offsetY: -300 }, FIELD)
    const domain = visibleDomainFor(zoomed, FIELD, GRID)
    const fitDomain = visibleDomainFor(FIT_VIEWPORT, FIELD, GRID)
    const zoomedSpan = domain.lastCol - domain.firstCol
    const fitSpan = fitDomain.lastCol - fitDomain.firstCol
    expect(zoomedSpan).toBeLessThan(fitSpan)
  })
})
