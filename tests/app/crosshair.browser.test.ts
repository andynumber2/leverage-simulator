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
 *
 * 07-08-PLAN.md Task 3's coverage (same file per the plan's own `<files>` list): drill-down --
 * clicking a cell writes the SAME `entryDate`/`leverage` fields the parameter column owns and
 * switching to Single run computes those exact parameters, without touching `sweepGeneration()`
 * or leaving a stale permalink -- plus D-17's keyboard path, proven with a REAL, trusted keyboard
 * interaction (`vitest/browser`'s `userEvent.keyboard`, not a synthetic `dispatchEvent`, since a
 * native `<input type="range">` only steps its value in response to a browser-trusted key event).
 * This section mounts the REAL app (`mountApp`), unlike Task 2's synthetic-grid section above --
 * Single run's own computed result and the permalink URL are both real-app concerns a standalone
 * `HeatmapPanel` render has no access to.
 *
 * 07-10-PLAN.md Task 2's coverage (same file, per that plan's own `<files>` list): pan/zoom
 * (D-34/D-35) -- a wheel gesture zooms toward the pointer without touching `sweepGeneration()`; a
 * pointer drag at fit scale is a genuine no-op (pixel-identical canvas); the field's own new
 * zoom-aware axis ticks always name a real `grid.meta.entryDates`/leverage value; a committed
 * crosshair survives a zoom (same grid cell, repainted at the transformed screen position); the
 * permalink carries no viewport key and a full pan-then-zoom-then-pan sequence leaves the URL
 * byte-identical.
 */

import { afterEach, beforeEach, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'solid-js/web'

import { mountApp } from '../../src/app/main.tsx'
import { HeatmapPanel } from '../../src/app/components/ResultColumn/HeatmapPanel.tsx'
import { nearestRowForLeverage } from '../../src/app/components/ResultColumn/SliceChart.tsx'
import { PERMALINK_KEYS } from '../../src/app/permalink.ts'
import { CELL_FLAG_RUINED } from '../../src/data/sweep-fixture-format.ts'
import { gridColToDisplayX, gridRowToDisplayY } from '../../src/heatmap/paint-contour.ts'
import { createSweepGrid, type SweepGrid, type SweepGridMeta } from '../../src/sweep/sweep-grid.ts'
import {
  backtestRequest,
  crosshairCell,
  currentKernelInputs,
  flushPermalinkUrl,
  loadStatus,
  resetAppState,
  resultMode,
  sweepGeneration,
  sweepGrid,
  updateBacktestRequest,
} from '../../src/app/state.ts'

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
let appContainer: HTMLDivElement | undefined
let disposeApp: (() => void) | undefined

beforeEach(() => {
  resetAppState()
})

afterEach(() => {
  dispose?.()
  dispose = undefined
  container?.remove()
  container = undefined

  disposeApp?.()
  disposeApp = undefined
  appContainer?.remove()
  appContainer = undefined
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

/** A real wheel notch at `(xPx, yPx)` in the overlay's own field-rect (screen) space --
 * `deltaY < 0` zooms in, `deltaY > 0` zooms out, matching `HeatmapPanel.tsx`'s own `handleWheel`. */
function dispatchWheel(el: HTMLElement, xPx: number, yPx: number, deltaY: number): void {
  const rect = el.getBoundingClientRect()
  el.dispatchEvent(
    new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + xPx,
      clientY: rect.top + yPx,
      deltaY,
    }),
  )
}

/** A full pointerdown -> N pointermoves -> pointerup drag from `(fromX, fromY)` to `(toX, toY)`,
 * in the overlay's own field-rect (screen) space -- `buttons: 1` throughout, matching a real
 * primary-button press, so `HeatmapPanel.tsx`'s own pan-drag tracking (armed on pointerdown, only
 * a genuine pan once movement exceeds `PAN_DRAG_THRESHOLD_PX`) engages exactly as it would for a
 * real user drag. */
function dispatchPointerDrag(el: HTMLElement, fromX: number, fromY: number, toX: number, toY: number, steps = 10): void {
  const rect = el.getBoundingClientRect()
  const pointerId = 1
  el.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      clientX: rect.left + fromX,
      clientY: rect.top + fromY,
      pointerId,
      buttons: 1,
    }),
  )
  for (let i = 1; i <= steps; i++) {
    const x = fromX + ((toX - fromX) * i) / steps
    const y = fromY + ((toY - fromY) * i) / steps
    el.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: rect.left + x,
        clientY: rect.top + y,
        pointerId,
        buttons: 1,
      }),
    )
  }
  el.dispatchEvent(
    new PointerEvent('pointerup', {
      bubbles: true,
      clientX: rect.left + toX,
      clientY: rect.top + toY,
      pointerId,
      buttons: 0,
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

// -------------------------------------------------------------------------------------------
// Task 3: drill-down -- click writes entryDate/leverage, no re-sweep, permalink, keyboard sync
// -------------------------------------------------------------------------------------------

async function waitFor(predicate: () => boolean, timeoutMs = 30_000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('crosshair.browser.test: waitFor timed out waiting for a condition')
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

async function mountRealAppInSweepMode(): Promise<HTMLDivElement> {
  window.history.replaceState(null, '', window.location.pathname)
  appContainer = document.createElement('div')
  document.body.appendChild(appContainer)
  disposeApp = mountApp(appContainer)
  await waitFor(() => loadStatus() === 'ready')
  // `resetAppState` deliberately leaves the last resolved sweep grid in place (see its own
  // comment in `state.ts`: the grid is a pure function of a subsequent `scheduleSweep`, not
  // app-load state). This file mounts the real app more than once, so a bare
  // `sweepGrid()!.cols === 200` wait would resolve instantly against the PREVIOUS test's grid and
  // let this mount's own sweep land mid-assertion -- which is exactly what made the
  // `sweepGeneration()`-unchanged assertion below see a spurious bump. `runSweepNow` builds a
  // fresh `SweepGrid` object per pass, so gating on reference inequality waits for THIS mount's
  // own full pass and nothing earlier.
  const staleGrid = sweepGrid()
  appContainer.querySelector<HTMLInputElement>('[data-testid="sweep-mode-sweep"]')!.click()
  expect(resultMode()).toBe('sweep')
  await waitFor(() => {
    const g = sweepGrid()
    return g !== null && g !== staleGrid && g.cols === 200 && g.rows === 50
  }, 35_000)
  return appContainer
}

test(
  'clicking a cell writes entryDate/leverage, and switching to Single run computes those exact parameters',
  async () => {
    const el = await mountRealAppInSweepMode()
    const grid = sweepGrid()!
    const overlay = el.querySelector<HTMLCanvasElement>('[data-testid="heatmap-crosshair-overlay"]')!

    const col = 40
    const row = 10
    const expectedEntryDate = grid.meta.entryDates[col]!
    const expectedLeverage = grid.meta.leverages[row]!
    const { x, y } = cellDisplayXY(col, row, grid)
    dispatchClick(overlay, x, y)

    await waitFor(() => backtestRequest().entryDate === expectedEntryDate)
    expect(backtestRequest().leverage).toBeCloseTo(expectedLeverage, 6)
    expect(crosshairCell()).toEqual({ col, row })

    el.querySelector<HTMLInputElement>('[data-testid="sweep-mode-single"]')!.click()
    expect(resultMode()).toBe('single')

    await waitFor(() => currentKernelInputs()?.window.firstDate === expectedEntryDate, 30_000)
    expect(currentKernelInputs()!.params.leverage).toBeCloseTo(expectedLeverage, 6)
    expect(el.querySelector('[data-testid="metrics-panel"]')).not.toBeNull()
  },
  40_000,
)

test(
  'committing a crosshair cell does not change sweepGeneration()',
  async () => {
    const el = await mountRealAppInSweepMode()
    const grid = sweepGrid()!
    const overlay = el.querySelector<HTMLCanvasElement>('[data-testid="heatmap-crosshair-overlay"]')!

    const generationBefore = sweepGeneration()
    const col = 20
    const row = 30
    const { x, y } = cellDisplayXY(col, row, grid)
    dispatchClick(overlay, x, y)

    await waitFor(() => backtestRequest().entryDate === grid.meta.entryDates[col])
    await nextFrame()
    await nextFrame()

    expect(sweepGeneration()).toBe(generationBefore)
  },
  40_000,
)

test(
  'the URL query string carries the clicked cell entryDate/leverage once the permalink sync flushes',
  async () => {
    const el = await mountRealAppInSweepMode()
    const grid = sweepGrid()!
    const overlay = el.querySelector<HTMLCanvasElement>('[data-testid="heatmap-crosshair-overlay"]')!

    const col = 90
    const row = 25
    const expectedEntryDate = grid.meta.entryDates[col]!
    const expectedLeverage = grid.meta.leverages[row]!
    const { x, y } = cellDisplayXY(col, row, grid)
    dispatchClick(overlay, x, y)

    await waitFor(() => backtestRequest().entryDate === expectedEntryDate)
    // The permalink is written on the trailing edge of a COMPLETED run (`storeSuccessfulRun` ->
    // `schedulePermalinkSync`), and `updateBacktestRequest`'s store write is synchronous while
    // its `scheduleRun` is rAF-coalesced -- so the wait above resolves before any run has been
    // recomputed. Flushing there would find nothing pending and leave the URL untouched. Wait for
    // the run that carries the clicked entry date to actually resolve, then flush.
    await waitFor(() => currentKernelInputs()?.window.firstDate === expectedEntryDate, 30_000)
    flushPermalinkUrl()

    const params = new URLSearchParams(window.location.search)
    expect(params.get('entryDate')).toBe(expectedEntryDate)
    expect(Number(params.get('leverage'))).toBeCloseTo(expectedLeverage, 2)
  },
  40_000,
)

test(
  'no double-click affordance exists anywhere in the result column',
  () => {
    expect(document.querySelectorAll('[ondblclick]').length).toBe(0)
  },
)

// -------------------------------------------------------------------------------------------
// 07-10-PLAN.md Task 2: pan/zoom (D-34/D-35)
// -------------------------------------------------------------------------------------------

function buffersIdentical(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

test('the permalink carries no viewport key: PERMALINK_KEYS still has exactly seventeen entries', () => {
  expect(PERMALINK_KEYS.length).toBe(17)
})

test('a pan drag at fit scale leaves the field canvas pixel content unchanged', async () => {
  const grid = makeSyntheticGrid()
  const { container: el, overlay } = mountPanel(grid)
  await nextFrame()

  const canvas = el.querySelector<HTMLCanvasElement>('[data-testid="heatmap-canvas"]')!
  const ctx = canvas.getContext('2d')!
  const before = ctx.getImageData(0, 0, HEATMAP_WIDTH_PX, HEATMAP_HEIGHT_PX).data

  dispatchPointerDrag(overlay, 400, 120, 250, 60)
  await nextFrame()

  const after = ctx.getImageData(0, 0, HEATMAP_WIDTH_PX, HEATMAP_HEIGHT_PX).data
  expect(buffersIdentical(before, after)).toBe(true)
})

test('a pan drag at fit scale never commits a crosshair cell (a drag is not a click)', async () => {
  const grid = makeSyntheticGrid()
  const { overlay } = mountPanel(grid)
  await nextFrame()

  expect(crosshairCell()).toBeNull()
  dispatchPointerDrag(overlay, 400, 120, 250, 60)
  await nextFrame()
  expect(crosshairCell()).toBeNull()
})

test('zooming in renders entry-date axis tick labels that all appear in the grid own meta.entryDates', async () => {
  const grid = makeSyntheticGrid()
  const { container: el, overlay } = mountPanel(grid)
  await nextFrame()

  dispatchWheel(overlay, 400, 120, -100)
  await nextFrame()
  dispatchWheel(overlay, 400, 120, -100)
  await nextFrame()

  // 07-10-PLAN.md Task 2's own D-14 fixed-slot-count discipline: the tick strip always renders a
  // constant element count, padding empty (zero-width, no-op) placeholders when there is no real
  // tick to show -- filter those out before asserting on rendered TEXT content.
  const tickEls = Array.from(el.querySelectorAll('[data-testid="heatmap-axis-tick-entry-date"]')).filter(
    (tickEl) => (tickEl.textContent ?? '') !== '',
  )
  expect(tickEls.length).toBeGreaterThan(0)
  for (const tickEl of tickEls) {
    const text = tickEl.textContent ?? ''
    expect(grid.meta.entryDates).toContain(text)
  }
})

test('zooming in renders leverage axis tick labels that all lie within the 1x to 5x range', async () => {
  const grid = makeSyntheticGrid()
  const { container: el, overlay } = mountPanel(grid)
  await nextFrame()

  dispatchWheel(overlay, 400, 120, -100)
  await nextFrame()
  dispatchWheel(overlay, 400, 120, -100)
  await nextFrame()

  const tickEls = Array.from(el.querySelectorAll('[data-testid="heatmap-axis-tick-leverage"]')).filter(
    (tickEl) => (tickEl.textContent ?? '') !== '',
  )
  expect(tickEls.length).toBeGreaterThan(0)
  for (const tickEl of tickEls) {
    const text = tickEl.textContent ?? ''
    const value = Number.parseFloat(text.replace('x', ''))
    expect(Number.isFinite(value)).toBe(true)
    expect(value).toBeGreaterThanOrEqual(1)
    expect(value).toBeLessThanOrEqual(5)
  }
})

test('a committed crosshair survives a zoom centred on its own screen position: same grid cell, same on-screen pixel', async () => {
  const grid = makeSyntheticGrid()
  const { overlay } = mountPanel(grid)
  await nextFrame()

  // A roughly-central cell so zooming toward its own position never runs into clampViewport's
  // pan-bound clamp at any scale this test reaches.
  const col = 100
  const row = 25
  const committed = cellDisplayXY(col, row, grid)
  dispatchClick(overlay, committed.x, committed.y)
  await nextFrame()
  expect(crosshairCell()).toEqual({ col, row })

  const beforeGaps = countTransparentAlongVertical(overlay, committed.x, committed.y - 20, committed.y - 4)
  expect(beforeGaps).toBe(0) // solid, matching the existing "committed crosshair is solid" assertion

  // Zoom in several times, centred EXACTLY on the committed cell's own screen position --
  // zoomViewportAt's own guarantee ("zooming toward a pointer keeps the grid cell under that
  // pointer fixed") means this cell's own screen pixel should not move.
  dispatchWheel(overlay, committed.x, committed.y, -100)
  await nextFrame()
  dispatchWheel(overlay, committed.x, committed.y, -100)
  await nextFrame()
  dispatchWheel(overlay, committed.x, committed.y, -100)
  await nextFrame()

  // Same grid cell: zoom never touches crosshairCell().
  expect(crosshairCell()).toEqual({ col, row })

  // Same on-screen pixel: the vertical (entry-date) guide line is a straight line at constant
  // screen x regardless of y, so any y still inside the field after the zoom finds it here.
  const afterPixel = readPixel(overlay, committed.x, committed.y - 4)
  expect(afterPixel.a).toBeGreaterThan(200)
  expect(colorClose({ r: afterPixel.r, g: afterPixel.g, b: afterPixel.b }, ACCENT_RGB)).toBe(true)
})

test(
  'a zoom gesture does not change sweepGeneration() and does change the field canvas pixel content',
  async () => {
    const el = await mountRealAppInSweepMode()
    const canvas = el.querySelector<HTMLCanvasElement>('[data-testid="heatmap-canvas"]')!
    const overlay = el.querySelector<HTMLCanvasElement>('[data-testid="heatmap-crosshair-overlay"]')!
    const ctx = canvas.getContext('2d')!
    await nextFrame()

    const before = ctx.getImageData(0, 0, HEATMAP_WIDTH_PX, HEATMAP_HEIGHT_PX).data
    const generationBefore = sweepGeneration()

    dispatchWheel(overlay, 400, 120, -100)
    dispatchWheel(overlay, 400, 120, -100)
    dispatchWheel(overlay, 400, 120, -100)
    await nextFrame()

    expect(sweepGeneration()).toBe(generationBefore)

    const after = ctx.getImageData(0, 0, HEATMAP_WIDTH_PX, HEATMAP_HEIGHT_PX).data
    expect(buffersIdentical(before, after)).toBe(false)
  },
  40_000,
)

test(
  'a full pan-then-zoom-then-pan sequence leaves the URL query string byte-identical',
  async () => {
    const el = await mountRealAppInSweepMode()
    const overlay = el.querySelector<HTMLCanvasElement>('[data-testid="heatmap-crosshair-overlay"]')!

    // Settle any pending trailing-edge permalink write from the initial sweep before capturing
    // the baseline -- otherwise that unrelated write firing mid-test (its own 200ms timer) could
    // be mistaken for one caused by the gestures below.
    flushPermalinkUrl()
    const before = window.location.search

    dispatchPointerDrag(overlay, 400, 120, 300, 80)
    await nextFrame()
    dispatchWheel(overlay, 400, 120, -100)
    await nextFrame()
    dispatchPointerDrag(overlay, 300, 80, 450, 150)
    await nextFrame()

    // Idempotent: a no-op unless the gestures above scheduled a new write, which they must not.
    flushPermalinkUrl()
    const after = window.location.search

    expect(after).toBe(before)
  },
  40_000,
)

test(
  'a keyboard-driven leverage change moves an already-committed crosshair to the corresponding row',
  async () => {
    const el = await mountRealAppInSweepMode()
    const grid = sweepGrid()!
    const overlay = el.querySelector<HTMLCanvasElement>('[data-testid="heatmap-crosshair-overlay"]')!

    // A low starting row leaves headroom for several ArrowUp presses to cross at least one row
    // boundary (row spacing is (LEVERAGE_MAX - LEVERAGE_MIN) / (SWEEP_ROWS - 1) =~ 0.0816x; the
    // slider's own step is 0.01x, so ten presses comfortably crosses it).
    const col = 60
    const row = 5
    const { x, y } = cellDisplayXY(col, row, grid)
    dispatchClick(overlay, x, y)
    await waitFor(() => crosshairCell() !== null && crosshairCell()!.col === col && crosshairCell()!.row === row)

    const leverageSlider = el.querySelector<HTMLInputElement>('[data-testid="leverage-slider"]')!
    await userEvent.click(leverageSlider)
    await userEvent.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}')

    await waitFor(() => backtestRequest().leverage > grid.meta.leverages[row]!, 10_000)

    const currentGrid = sweepGrid()!
    const expectedRow = nearestRowForLeverage(currentGrid, backtestRequest().leverage)
    await waitFor(() => crosshairCell() !== null && crosshairCell()!.row === expectedRow, 10_000)
    expect(crosshairCell()!.row).not.toBe(row)
  },
  40_000,
)
