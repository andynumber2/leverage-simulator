/**
 * tests/app/crosshair.browser.test.ts
 *
 * 07-08-PLAN.md Task 2's coverage: `HeatmapPanel.tsx`'s hover-only GHOST crosshair (1px dashed,
 * muted), the click-committed crosshair (2px solid, accent), the off-grid leverage clamp's
 * dashed leverage guide, and `HoverReadout.tsx`'s field-by-field content (including the ruined
 * cell's categorical replacement and the bottom-right corner's on-screen containment).
 *
 * `HeatmapPanel` is mounted STANDALONE against a synthetic `SweepGrid`
 * (`solid-js/web`'s `render`, the same pattern `tests/app/slice-charts.browser.test.ts` already
 * uses for `HorizontalSliceChart`), rather than through the full app -- this makes every cell's
 * own flags/values/geometry deterministic (a real ruined cell, an exact corner cell), instead of
 * depending on whichever real bundle history happens to ruin at whatever entry date/leverage a
 * live sweep lands on.
 *
 * Ghost/committed strokes are distinguished by sampling the overlay canvas's own pixels along
 * each guide line's known path (`gridColToDisplayX`/`gridRowToDisplayY`, the SAME conversion
 * `HeatmapPanel.tsx` itself uses), rather than inspecting any canvas-internal drawing state --
 * colour is read directly from `getImageData`, and "dashed vs solid" is read by counting fully
 * transparent samples along a known stretch of the line (a solid 2px stroke has none; a `[4, 3]`
 * dashed 1px stroke has several).
 */

import { afterEach, beforeEach, expect, test } from 'vitest'
import { render } from 'solid-js/web'

import { HeatmapPanel } from '../../src/app/components/ResultColumn/HeatmapPanel.tsx'
import { CELL_FLAG_RUINED } from '../../src/data/sweep-fixture-format.ts'
import { gridColToDisplayX, gridRowToDisplayY } from '../../src/heatmap/paint-contour.ts'
import { createSweepGrid, type SweepGrid, type SweepGridMeta } from '../../src/sweep/sweep-grid.ts'
import { backtestRequest, crosshairCell, resetAppState, updateBacktestRequest } from '../../src/app/state.ts'

const HEATMAP_WIDTH_PX = 800
const HEATMAP_HEIGHT_PX = 240
const COLS = 200
const ROWS = 50

function makeSyntheticMeta(cols: number, rows: number): SweepGridMeta {
  return {
    bundleVersion: 'test',
    symbol: 'TEST',
    dividendReinvest: true,
    entryDates: Array.from({ length: cols }, (_, i) => {
      const day = (i % 28) + 1
      const month = 1 + (Math.floor(i / 28) % 12)
      return `2000-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }),
    leverages: Array.from({ length: rows }, (_, i) => 1 + (i * 4) / (rows - 1)),
    holdingYears: 10,
    initialInvestment: 10_000,
    expenseRatioPercent: 0.9,
    financingSpreadPercent: 0.5,
    ruinedCount: 0,
    incompleteCount: 0,
    minMultiple: 0,
    maxMultiple: 10,
    clippedBelowCount: 0,
    clippedAboveCount: 0,
    holdMode: 'fixed',
    endOfDataDate: '2020-01-01',
    holdingPeriodBars: 2520,
  }
}

function makeSyntheticGrid(): SweepGrid {
  const grid = createSweepGrid(COLS, ROWS, makeSyntheticMeta(COLS, ROWS))
  for (let i = 0; i < grid.multiples.length; i++) {
    grid.multiples[i] = 1.5
    grid.drawdowns[i] = 0.25
    grid.annualized[i] = 0.08
  }
  return grid
}

let container: HTMLDivElement | undefined
let dispose: (() => void) | undefined

beforeEach(() => {
  resetAppState()
})

afterEach(() => {
  dispose?.()
  dispose = undefined
  container?.remove()
  container = undefined
})

function mountPanel(grid: SweepGrid | null): { container: HTMLDivElement; overlay: HTMLCanvasElement; stack: HTMLElement } {
  container = document.createElement('div')
  document.body.appendChild(container)
  dispose = render(() => HeatmapPanel({ grid }), container)
  const overlay = container.querySelector<HTMLCanvasElement>('[data-testid="heatmap-crosshair-overlay"]')
  const stack = container.querySelector<HTMLElement>('[data-testid="heatmap-field-stack"]')
  if (overlay === null || stack === null) {
    throw new Error('crosshair.browser.test: mountPanel could not find the overlay canvas or field stack')
  }
  return { container, overlay, stack }
}

function dispatchPointer(el: HTMLElement, type: 'pointermove' | 'pointerleave', xPx: number, yPx: number): void {
  const rect = el.getBoundingClientRect()
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      clientX: rect.left + xPx,
      clientY: rect.top + yPx,
      pointerId: 1,
    }),
  )
}

function dispatchClick(el: HTMLElement, xPx: number, yPx: number): void {
  const rect = el.getBoundingClientRect()
  el.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      clientX: rect.left + xPx,
      clientY: rect.top + yPx,
    }),
  )
}

function cellDisplayXY(col: number, row: number, grid: SweepGrid): { x: number; y: number } {
  return {
    x: gridColToDisplayX(col, HEATMAP_WIDTH_PX, grid.cols),
    y: gridRowToDisplayY(row, HEATMAP_HEIGHT_PX, grid.rows),
  }
}

/** Reads the 1px RGBA sample at `(x, y)`. Every guide line drawn by `HeatmapPanel.tsx` is
 * centred at a half-integer coordinate (`gridColToDisplayX`/`gridRowToDisplayY`'s own `- 0.5`),
 * which is the standard "crisp line" alignment: a 1px or 2px stroke centred there fully covers
 * the pixel column/row starting at `Math.floor(x)`/`Math.floor(y)`, with only partial coverage
 * (anti-aliased, unreliable to sample) on the pixel `Math.round` would otherwise pick. `floor` is
 * therefore the coordinate this file always samples at, never `round`. */
function readPixel(overlay: HTMLCanvasElement, x: number, y: number): { r: number; g: number; b: number; a: number } {
  const ctx = overlay.getContext('2d')
  if (ctx === null) throw new Error('crosshair.browser.test: 2D context unavailable')
  const data = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data
  return { r: data[0] ?? 0, g: data[1] ?? 0, b: data[2] ?? 0, a: data[3] ?? 0 }
}

/** Counts fully-transparent 1px samples along a vertical stretch of the overlay at fixed `x`,
 * from `fromY` to `toY` inclusive -- a solid stroke has none, a `[4, 3]`-dashed stroke (period 7)
 * has several across a stretch this long. */
function countTransparentAlongVertical(overlay: HTMLCanvasElement, x: number, fromY: number, toY: number): number {
  let count = 0
  for (let y = fromY; y <= toY; y++) {
    if (readPixel(overlay, x, y).a < 50) count++
  }
  return count
}

function cssColorToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '')
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

/** Light theme's own fixed hex values (`src/app/styles.css`) -- the app is not switched to dark
 * theme by any test in this file, so these are the values the overlay canvas actually reads via
 * `getComputedStyle` at render time. */
const ACCENT_RGB = cssColorToRgb('#2e6bd6')
const TEXT_MUTED_RGB = cssColorToRgb('#5b6169')

function colorClose(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, tolerance = 20): boolean {
  return Math.abs(a.r - b.r) <= tolerance && Math.abs(a.g - b.g) <= tolerance && Math.abs(a.b - b.b) <= tolerance
}

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

// -------------------------------------------------------------------------------------------
// E5 empty: before any pointer interaction, neither crosshair nor readout renders
// -------------------------------------------------------------------------------------------

test('before any pointer interaction, no crosshair pixel is painted and no readout is mounted', async () => {
  const grid = makeSyntheticGrid()
  const { overlay, container: el } = mountPanel(grid)
  await nextFrame()

  const ctx = overlay.getContext('2d')!
  const buffer = ctx.getImageData(0, 0, HEATMAP_WIDTH_PX, HEATMAP_HEIGHT_PX).data
  let maxAlpha = 0
  for (let i = 3; i < buffer.length; i += 4) {
    const alpha = buffer[i] ?? 0
    if (alpha > maxAlpha) maxAlpha = alpha
  }
  expect(maxAlpha).toBe(0)
  expect(el.querySelector('[data-testid="hover-readout"]')).toBeNull()
  expect(crosshairCell()).toBeNull()
})

// -------------------------------------------------------------------------------------------
// Ghost crosshair (hover)
// -------------------------------------------------------------------------------------------

test('hovering paints a dashed, muted ghost crosshair, commits nothing, and leaves crosshairCell() unchanged', async () => {
  const grid = makeSyntheticGrid()
  const { overlay } = mountPanel(grid)
  await nextFrame()

  const before = crosshairCell()
  const { x, y } = cellDisplayXY(50, 10, grid)
  dispatchPointer(overlay, 'pointermove', x, y)
  await nextFrame()

  // Colour: sampled well within the dash pattern's own first "on" segment ([0, 4) from the
  // line's moveTo origin), so this is deterministically opaque regardless of the dash phase.
  const pixel = readPixel(overlay, x, 1)
  expect(pixel.a).toBeGreaterThan(200)
  expect(colorClose({ r: pixel.r, g: pixel.g, b: pixel.b }, TEXT_MUTED_RGB)).toBe(true)

  // Dash pattern: a 24px stretch of a period-7 [4, 3] dash must contain multiple transparent gaps.
  const transparentCount = countTransparentAlongVertical(overlay, x, 0, 24)
  expect(transparentCount).toBeGreaterThan(3)

  expect(crosshairCell()).toEqual(before)
})

test('moving the pointer off the field clears the ghost crosshair', async () => {
  const grid = makeSyntheticGrid()
  const { overlay } = mountPanel(grid)
  const { x, y } = cellDisplayXY(50, 10, grid)
  dispatchPointer(overlay, 'pointermove', x, y)
  await nextFrame()
  expect(readPixel(overlay, x, 1).a).toBeGreaterThan(200)

  dispatchPointer(overlay, 'pointerleave', x, y)
  await nextFrame()
  expect(readPixel(overlay, x, 1).a).toBe(0)
})

// -------------------------------------------------------------------------------------------
// Committed crosshair (click)
// -------------------------------------------------------------------------------------------

test('clicking a cell paints a solid, 2px accent committed crosshair, distinct from the ghost in both colour and dash pattern', async () => {
  const grid = makeSyntheticGrid()
  const { overlay } = mountPanel(grid)

  const ghost = cellDisplayXY(30, 8, grid)
  dispatchPointer(overlay, 'pointermove', ghost.x, ghost.y)
  await nextFrame()

  const committed = cellDisplayXY(150, 40, grid)
  dispatchClick(overlay, committed.x, committed.y)
  await nextFrame()

  expect(crosshairCell()).toEqual({ col: 150, row: 40 })

  const committedPixel = readPixel(overlay, committed.x, 1)
  expect(committedPixel.a).toBeGreaterThan(200)
  expect(colorClose({ r: committedPixel.r, g: committedPixel.g, b: committedPixel.b }, ACCENT_RGB)).toBe(true)

  // Solid: no transparent gaps anywhere along a 24px stretch.
  const committedGaps = countTransparentAlongVertical(overlay, committed.x, 0, 24)
  expect(committedGaps).toBe(0)

  // The ghost crosshair (still hovered) remains dashed and muted at its own, distinct position.
  const ghostPixel = readPixel(overlay, ghost.x, 1)
  expect(colorClose({ r: ghostPixel.r, g: ghostPixel.g, b: ghostPixel.b }, TEXT_MUTED_RGB)).toBe(true)
  const ghostGaps = countTransparentAlongVertical(overlay, ghost.x, 0, 24)
  expect(ghostGaps).toBeGreaterThan(3)

  // Colour distinguishes the two strokes.
  expect(colorClose({ r: committedPixel.r, g: committedPixel.g, b: committedPixel.b }, TEXT_MUTED_RGB)).toBe(false)
})

test('a second click moves the committed crosshair rather than adding a second one', async () => {
  const grid = makeSyntheticGrid()
  const { overlay } = mountPanel(grid)

  const first = cellDisplayXY(20, 5, grid)
  dispatchClick(overlay, first.x, first.y)
  await nextFrame()
  expect(crosshairCell()).toEqual({ col: 20, row: 5 })

  const second = cellDisplayXY(180, 45, grid)
  dispatchClick(overlay, second.x, second.y)
  await nextFrame()
  expect(crosshairCell()).toEqual({ col: 180, row: 45 })

  // The first position no longer carries an accent stroke -- only one committed crosshair exists.
  const firstPixel = readPixel(overlay, first.x, 1)
  expect(colorClose({ r: firstPixel.r, g: firstPixel.g, b: firstPixel.b }, ACCENT_RGB)).toBe(false)
})

// -------------------------------------------------------------------------------------------
// Off-grid leverage clamp (T-07-17, this plan's own must_haves)
// -------------------------------------------------------------------------------------------

test('a stored leverage outside [1, 5] draws the committed leverage guide dashed, never solid', async () => {
  const grid = makeSyntheticGrid()
  const { overlay } = mountPanel(grid)

  const cell = cellDisplayXY(100, 49, grid)
  dispatchClick(overlay, cell.x, cell.y)
  await nextFrame()

  updateBacktestRequest({ leverage: 10 })
  await nextFrame()

  expect(backtestRequest().leverage).toBe(10)

  // The leverage guide is the HORIZONTAL line, at fixed y = cell.y. Sample along x, well within
  // the dash pattern's own first "on" segment from the line's own moveTo(0, cell.y) origin.
  let transparentAlongRow = 0
  for (let x = 0; x <= 24; x++) {
    if (readPixel(overlay, x, cell.y).a < 50) transparentAlongRow++
  }
  expect(transparentAlongRow).toBeGreaterThan(3)

  // The entry-date guide (the VERTICAL line) has no off-grid case and stays solid.
  const colGaps = countTransparentAlongVertical(overlay, cell.x, 0, 24)
  expect(colGaps).toBe(0)
})

// -------------------------------------------------------------------------------------------
// Hover readout (D-20)
// -------------------------------------------------------------------------------------------

test('the readout renders all five field labels for a normal cell', async () => {
  const grid = makeSyntheticGrid()
  const { overlay, container: el } = mountPanel(grid)

  const { x, y } = cellDisplayXY(60, 20, grid)
  dispatchPointer(overlay, 'pointermove', x, y)
  await nextFrame()

  const readout = el.querySelector('[data-testid="hover-readout"]')
  expect(readout).not.toBeNull()
  const rows = el.querySelectorAll('[data-testid="hover-readout-row"]')
  expect(rows.length).toBe(5)

  const text = readout!.textContent ?? ''
  expect(text).toContain('Entry')
  expect(text).toContain('Leverage')
  expect(text).toContain('Multiple')
  expect(text).toContain('Drawdown')
  expect(text).toContain('CAGR')
  expect(el.querySelector('[data-testid="hover-readout-categorical"]')).toBeNull()
})

test('the readout over a ruined cell shows "Ruined" and omits the multiple/drawdown/annualized rows', async () => {
  const grid = makeSyntheticGrid()
  const ruinedCol = 70
  const ruinedRow = 15
  grid.flags[ruinedRow * grid.cols + ruinedCol] = CELL_FLAG_RUINED
  const { overlay, container: el } = mountPanel(grid)

  const { x, y } = cellDisplayXY(ruinedCol, ruinedRow, grid)
  dispatchPointer(overlay, 'pointermove', x, y)
  await nextFrame()

  const categorical = el.querySelector('[data-testid="hover-readout-categorical"]')
  expect(categorical).not.toBeNull()
  expect(categorical!.textContent).toBe('Ruined')

  // Only Entry and Leverage remain as ordinary rows.
  const rows = el.querySelectorAll('[data-testid="hover-readout-row"]')
  expect(rows.length).toBe(2)
  const readoutText = el.querySelector('[data-testid="hover-readout"]')!.textContent ?? ''
  expect(readoutText).not.toContain('Multiple')
  expect(readoutText).not.toContain('Drawdown')
})

test('the readout at the field bottom-right corner cell stays entirely inside the panel', async () => {
  const grid = makeSyntheticGrid()
  const { overlay, stack } = mountPanel(grid)

  const { x, y } = cellDisplayXY(grid.cols - 1, 0, grid)
  dispatchPointer(overlay, 'pointermove', x, y)
  await nextFrame()

  const readout = stack.querySelector<HTMLElement>('[data-testid="hover-readout"]')
  expect(readout).not.toBeNull()

  const readoutRect = readout!.getBoundingClientRect()
  const panelRect = stack.getBoundingClientRect()

  const EPSILON = 0.5
  expect(readoutRect.left).toBeGreaterThanOrEqual(panelRect.left - EPSILON)
  expect(readoutRect.top).toBeGreaterThanOrEqual(panelRect.top - EPSILON)
  expect(readoutRect.right).toBeLessThanOrEqual(panelRect.right + EPSILON)
  expect(readoutRect.bottom).toBeLessThanOrEqual(panelRect.bottom + EPSILON)
})
