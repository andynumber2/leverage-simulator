/**
 * tests/heatmap/crosshair.test.ts: 07-08-PLAN.md Task 1, correctness assertions for
 * `src/heatmap/crosshair.ts`'s pure grid-space geometry. Runs in the fast Node `unit` project:
 * `crosshair.ts` has no DOM dependency and no `solid-js` import.
 */

import { describe, expect, test } from 'vitest'

import { clampLeverageToGrid, crosshairCellFor, type FieldRect } from '../../src/heatmap/crosshair.ts'
import { LEVERAGE_MAX, LEVERAGE_MIN, SWEEP_COLS, SWEEP_ROWS } from '../../src/sweep/sweep-grid.ts'

// Mirrors the production `HeatmapPanel.tsx` geometry (D-12): the field canvas reserves no
// internal axis gutter of its own, so its own field rect is simply its full canvas area.
const HEATMAP_WIDTH_PX = 800
const HEATMAP_HEIGHT_PX = 240
const FIELD_RECT: FieldRect = { x: 0, y: 0, width: HEATMAP_WIDTH_PX, height: HEATMAP_HEIGHT_PX }

describe('crosshairCellFor', () => {
  test('a pointer one pixel inside the top-left corner resolves to the top-left cell (col 0, row SWEEP_ROWS - 1)', () => {
    // A-E5: fixture/grid row 0 (the lowest leverage) paints at the BOTTOM of the field, so the
    // visual top-left corner is grid column 0 (earliest entry date) at the HIGHEST leverage row.
    const hit = crosshairCellFor(1, 1, FIELD_RECT, SWEEP_COLS, SWEEP_ROWS)
    expect(hit).toEqual({ col: 0, row: SWEEP_ROWS - 1 })
  })

  test('a pointer one pixel inside the bottom-right corner resolves to the bottom-right cell (col SWEEP_COLS - 1, row 0)', () => {
    const hit = crosshairCellFor(HEATMAP_WIDTH_PX - 1, HEATMAP_HEIGHT_PX - 1, FIELD_RECT, SWEEP_COLS, SWEEP_ROWS)
    expect(hit).toEqual({ col: SWEEP_COLS - 1, row: 0 })
  })

  test('a pointer at the exact centre of the field resolves near the grid centre', () => {
    const hit = crosshairCellFor(HEATMAP_WIDTH_PX / 2, HEATMAP_HEIGHT_PX / 2, FIELD_RECT, SWEEP_COLS, SWEEP_ROWS)
    expect(hit).not.toBeNull()
    expect(hit!.col).toBeGreaterThanOrEqual(0)
    expect(hit!.col).toBeLessThan(SWEEP_COLS)
    expect(hit!.row).toBeGreaterThanOrEqual(0)
    expect(hit!.row).toBeLessThan(SWEEP_ROWS)
  })

  test('a pointer exactly on a cell boundary resolves to the cell whose interval begins at that boundary', () => {
    const cellWidthPx = HEATMAP_WIDTH_PX / SWEEP_COLS
    // Exactly on the boundary between column 9 and column 10.
    const hit = crosshairCellFor(cellWidthPx * 10, 1, FIELD_RECT, SWEEP_COLS, SWEEP_ROWS)
    expect(hit).not.toBeNull()
    expect(hit!.col).toBe(10)
  })

  test('returns null for a pointer outside the field rectangle on every side', () => {
    expect(crosshairCellFor(-1, 10, FIELD_RECT, SWEEP_COLS, SWEEP_ROWS)).toBeNull()
    expect(crosshairCellFor(10, -1, FIELD_RECT, SWEEP_COLS, SWEEP_ROWS)).toBeNull()
    expect(crosshairCellFor(HEATMAP_WIDTH_PX, 10, FIELD_RECT, SWEEP_COLS, SWEEP_ROWS)).toBeNull()
    expect(crosshairCellFor(10, HEATMAP_HEIGHT_PX, FIELD_RECT, SWEEP_COLS, SWEEP_ROWS)).toBeNull()
  })

  test('respects a non-zero field rect origin', () => {
    const offsetRect: FieldRect = { x: 36, y: 4, width: HEATMAP_WIDTH_PX, height: HEATMAP_HEIGHT_PX }
    // One pixel inside the offset rect's own top-left corner.
    const hit = crosshairCellFor(37, 5, offsetRect, SWEEP_COLS, SWEEP_ROWS)
    expect(hit).toEqual({ col: 0, row: SWEEP_ROWS - 1 })
    // The same absolute point, before the rect's origin, is out of bounds.
    expect(crosshairCellFor(10, 5, offsetRect, SWEEP_COLS, SWEEP_ROWS)).toBeNull()
  })
})

describe('clampLeverageToGrid', () => {
  test('a leverage inside [LEVERAGE_MIN, LEVERAGE_MAX] is unclamped, including the two range edges', () => {
    expect(clampLeverageToGrid(3.0).clamped).toBe(false)
    expect(clampLeverageToGrid(LEVERAGE_MIN).clamped).toBe(false)
    expect(clampLeverageToGrid(LEVERAGE_MAX).clamped).toBe(false)
  })

  test('LEVERAGE_MIN and LEVERAGE_MAX resolve to the two edge rows', () => {
    expect(clampLeverageToGrid(LEVERAGE_MIN).row).toBe(0)
    expect(clampLeverageToGrid(LEVERAGE_MAX).row).toBe(SWEEP_ROWS - 1)
  })

  test('a leverage below LEVERAGE_MIN clamps to row 0', () => {
    const result = clampLeverageToGrid(0.5)
    expect(result.clamped).toBe(true)
    expect(result.row).toBe(0)
  })

  test('a leverage above LEVERAGE_MAX clamps to the last row', () => {
    const result = clampLeverageToGrid(10)
    expect(result.clamped).toBe(true)
    expect(result.row).toBe(SWEEP_ROWS - 1)
  })

  test('every row is within [0, SWEEP_ROWS - 1] for a wide range of finite inputs', () => {
    const inputs = [
      Number.MAX_VALUE,
      -Number.MAX_VALUE,
      Number.MIN_VALUE,
      0,
      -0,
      -1000,
      1000,
      1.0,
      5.0,
      2.5,
      LEVERAGE_MIN - 1e-9,
      LEVERAGE_MAX + 1e-9,
    ]
    for (const input of inputs) {
      const result = clampLeverageToGrid(input)
      expect(result.row).toBeGreaterThanOrEqual(0)
      expect(result.row).toBeLessThanOrEqual(SWEEP_ROWS - 1)
      expect(Number.isFinite(result.row)).toBe(true)
    }
  })

  test('never throws for non-finite input and still returns an in-range row', () => {
    for (const input of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => clampLeverageToGrid(input)).not.toThrow()
      const result = clampLeverageToGrid(input)
      expect(result.row).toBeGreaterThanOrEqual(0)
      expect(result.row).toBeLessThanOrEqual(SWEEP_ROWS - 1)
    }
  })
})
