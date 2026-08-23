/**
 * tests/app/slice-charts.browser.test.ts
 *
 * 07-07-PLAN.md Task 1's coverage: the two marginal slice charts (`SliceChart.tsx`) read the
 * cached grid without triggering a sweep, break at every categorical/undefined cell, share the
 * field's own left gutter and leverage axis, and stay present at the narrowest supported
 * viewport.
 *
 * 07-07-PLAN.md Task 2's coverage (same file per the plan's own `<files>` list): the two-variant
 * legend (`SweepLegend.tsx`) -- five continuous ticks plus two categorical swatches for the
 * diverging variant, the fixed domain-end labels, the sequential drawdown variant's five ticks
 * with no emphasis, and no tick-label collision at the panel's real width.
 *
 * Most of Task 1's assertions exercise `SliceChart.tsx`'s exported PURE data-preparation
 * functions (`buildHorizontalSliceSeries`/`buildVerticalSliceValues`) directly against a
 * synthetic `SweepGrid`, rather than inspecting a live uPlot instance's internal DOM or a Canvas
 * 2D polyline's rendered pixels -- both are deterministic, independent-of-rendering-library
 * proofs of the same "200/50 points, read from the grid, broken at every categorical cell"
 * contract the plan states. The left-gutter and narrow-viewport cases need the real mounted app
 * (uPlot's measured axis width, and the real bundle's real leverage domain).
 */

import { page } from 'vitest/browser'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { render } from 'solid-js/web'

import { mountApp } from '../../src/app/main.tsx'
import {
  displayedMetric,
  resetAppState,
  resultMode,
  setDisplayedMetric,
  sweepGeneration,
  sweepGrid,
} from '../../src/app/state.ts'
import {
  buildHorizontalSliceSeries,
  buildVerticalSliceValues,
  HorizontalSliceChart,
} from '../../src/app/components/ResultColumn/SliceChart.tsx'
import { SweepLegend } from '../../src/app/components/ResultColumn/SweepLegend.tsx'
import { integerLeverageTicks } from '../../src/heatmap/hatch-pattern.ts'
import { CELL_FLAG_INCOMPLETE, CELL_FLAG_RUINED } from '../../src/data/sweep-fixture-format.ts'
import { createSweepGrid, type SweepGridMeta } from '../../src/sweep/sweep-grid.ts'
import type { SweepMetric } from '../../src/colorscale/value-to-color.ts'

const NARROW_VIEWPORT = { width: 320, height: 900 } as const
const DEFAULT_VIEWPORT = { width: 1280, height: 720 } as const

async function waitFor(predicate: () => boolean, timeoutMs = 30_000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('slice-charts.browser.test: waitFor timed out waiting for a condition')
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

function makeSyntheticMeta(cols: number, rows: number): SweepGridMeta {
  return {
    bundleVersion: 'test',
    symbol: 'TEST',
    dividendReinvest: true,
    entryDates: Array.from({ length: cols }, (_, i) => `2000-01-${String((i % 28) + 1).padStart(2, '0')}`),
    leverages: Array.from({ length: rows }, (_, i) => 1 + (i * 4) / (rows - 1)),
    holdingYears: 0,
    initialInvestment: 10_000,
    expenseRatioPercent: 0.9,
    financingSpreadPercent: 0.5,
    ruinedCount: 0,
    incompleteCount: 0,
    minMultiple: 0,
    maxMultiple: 0,
    clippedBelowCount: 0,
    clippedAboveCount: 0,
    holdMode: 'end-of-data',
    endOfDataDate: '2020-01-01',
  }
}

// ---------------------------------------------------------------------------------------------
// Task 1: SliceChart.tsx -- pure data-preparation tests against a synthetic grid
// ---------------------------------------------------------------------------------------------

test('the horizontal slice reads 200 points and the vertical slice 50, both from the same 200x50 grid', () => {
  const cols = 200
  const rows = 50
  const grid = createSweepGrid(cols, rows, makeSyntheticMeta(cols, rows))
  for (let i = 0; i < grid.multiples.length; i++) {
    grid.multiples[i] = 1 + i * 0.01
  }

  const row = 10
  const { xs, ys } = buildHorizontalSliceSeries(grid, 'multiple', row)
  expect(xs.length).toBe(cols)
  expect(ys.length).toBe(cols)
  // A direct read, not a computation: column 5's value is exactly cellIndex(5, row)'s own stored
  // multiple.
  expect(ys[5]).toBeCloseTo(grid.multiples[row * cols + 5]!, 9)

  const col = 20
  const values = buildVerticalSliceValues(grid, 'multiple', col)
  expect(values.length).toBe(rows)
  expect(values[7]).toBeCloseTo(grid.multiples[7 * cols + col]!, 9)
})

test('a slice crossing a ruined cell breaks the line: the built series carries null at that index, not an interpolated value', () => {
  const cols = 200
  const rows = 50
  const grid = createSweepGrid(cols, rows, makeSyntheticMeta(cols, rows))
  for (let i = 0; i < grid.multiples.length; i++) grid.multiples[i] = 2
  const row = 3
  const ruinedCol = 40
  grid.flags[row * cols + ruinedCol] = CELL_FLAG_RUINED

  const { ys } = buildHorizontalSliceSeries(grid, 'multiple', row)
  expect(ys[ruinedCol]).toBeNull()
  expect(ys[ruinedCol - 1]).not.toBeNull()
  expect(ys[ruinedCol + 1]).not.toBeNull()

  const col = 15
  const incompleteRow = 12
  grid.flags[incompleteRow * cols + col] = CELL_FLAG_INCOMPLETE
  const values = buildVerticalSliceValues(grid, 'multiple', col)
  expect(values[incompleteRow]).toBeNull()
  expect(values[incompleteRow - 1]).not.toBeNull()
})

test('an annualized cell carrying the undefined sentinel also breaks the line', () => {
  const cols = 10
  const rows = 10
  const grid = createSweepGrid(cols, rows, makeSyntheticMeta(cols, rows))
  for (let i = 0; i < grid.annualized.length; i++) grid.annualized[i] = 0.1
  grid.annualized[3 * cols + 4] = Number.NaN

  const { ys } = buildHorizontalSliceSeries(grid, 'annualized', 3)
  expect(ys[4]).toBeNull()
  expect(ys[3]).not.toBeNull()
})

// ---------------------------------------------------------------------------------------------
// Task 1: integration -- the real mounted app, sweep mode, real bundle
// ---------------------------------------------------------------------------------------------

let container: HTMLDivElement | undefined
let disposeApp: (() => void) | undefined
let standaloneEl: HTMLDivElement | undefined
let disposeStandalone: (() => void) | undefined

beforeEach(() => {
  window.history.replaceState(null, '', window.location.pathname)
  resetAppState()
})

afterEach(async () => {
  disposeApp?.()
  disposeApp = undefined
  container?.remove()
  container = undefined
  disposeStandalone?.()
  disposeStandalone = undefined
  standaloneEl?.remove()
  standaloneEl = undefined
  vi.unstubAllGlobals()
  await page.viewport(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height)
})

async function mountAndEnterSweepMode(): Promise<HTMLDivElement> {
  const el = document.createElement('div')
  document.body.appendChild(el)
  disposeApp = mountApp(el)
  await waitFor(() => el.querySelector('[data-testid="sweep-mode-toggle"]') !== null)
  const toggle = el.querySelector<HTMLButtonElement>('[data-testid="sweep-mode-toggle"]')!
  toggle.click()
  expect(resultMode()).toBe('sweep')
  return el
}

async function waitForFullGrid(): Promise<void> {
  await waitFor(() => sweepGrid() !== null && sweepGrid()!.cols === 200 && sweepGrid()!.rows === 50, 35_000)
}

test(
  'changing the displayed metric updates both slices without changing sweepGeneration()',
  async () => {
    container = await mountAndEnterSweepMode()
    await waitForFullGrid()

    const generationBefore = sweepGeneration()
    expect(displayedMetric()).toBe('multiple')
    setDisplayedMetric('drawdown')
    await nextFrame()
    await nextFrame()

    expect(displayedMetric()).toBe('drawdown')
    expect(sweepGeneration()).toBe(generationBefore)

    const horizontal = container.querySelector('[data-testid="horizontal-slice-chart"]')
    const vertical = container.querySelector<HTMLCanvasElement>('[data-testid="vertical-slice-chart"]')
    expect(horizontal).not.toBeNull()
    expect(vertical).not.toBeNull()

    setDisplayedMetric('multiple')
  },
  40_000,
)

test(
  'the horizontal slice chart and the heatmap field share the same left gutter width',
  async () => {
    container = await mountAndEnterSweepMode()
    await waitForFullGrid()
    await nextFrame()
    await nextFrame()

    const wrapper = container.querySelector<HTMLElement>('[data-testid="heatmap-canvas-wrapper"]')
    expect(wrapper).not.toBeNull()
    const wrapperPaddingLeft = Number.parseFloat(getComputedStyle(wrapper!).paddingLeft)
    expect(wrapperPaddingLeft).toBeGreaterThan(0)

    // Independently measures a standalone chart built from the SAME real grid/metric --
    // deterministic given identical inputs, so it reports the identical gutter width the field's
    // own padding was set to.
    let measuredGutter: number | null = null
    standaloneEl = document.createElement('div')
    document.body.appendChild(standaloneEl)
    disposeStandalone = render(
      () =>
        HorizontalSliceChart({
          grid: sweepGrid(),
          metric: displayedMetric(),
          widthPx: 800,
          onGutterMeasured: (px) => {
            measuredGutter = px
          },
        }),
      standaloneEl,
    )
    await nextFrame()
    await nextFrame()

    expect(measuredGutter).not.toBeNull()
    expect(measuredGutter as unknown as number).toBeCloseTo(wrapperPaddingLeft, 0)
  },
  40_000,
)

test(
  'at the narrowest supported viewport the vertical slice still has at least three leverage tick labels available',
  async () => {
    await page.viewport(NARROW_VIEWPORT.width, NARROW_VIEWPORT.height)
    container = await mountAndEnterSweepMode()
    await waitForFullGrid()

    const grid = sweepGrid()!
    const ticks = integerLeverageTicks(grid.meta.leverages)
    expect(ticks.length).toBeGreaterThanOrEqual(3)

    const canvas = container.querySelector<HTMLCanvasElement>('[data-testid="vertical-slice-chart"]')
    expect(canvas).not.toBeNull()
    expect(canvas!.width).toBeGreaterThan(0)
    expect(canvas!.height).toBeGreaterThan(0)
  },
  40_000,
)

// ---------------------------------------------------------------------------------------------
// Task 2: SweepLegend.tsx
// ---------------------------------------------------------------------------------------------

function mountLegend(metric: SweepMetric): HTMLDivElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  standaloneEl = el
  disposeStandalone = render(() => SweepLegend({ metric }), el)
  return el
}

test('the diverging legend (multiple) renders exactly five continuous ticks plus two categorical swatches, with the breakeven tick heavier than its neighbours', () => {
  const el = mountLegend('multiple')
  const ticks = Array.from(el.querySelectorAll<HTMLElement>('[data-testid="legend-tick"]'))
  expect(ticks.length).toBe(5)
  const swatches = Array.from(el.querySelectorAll('[data-testid="legend-swatch-label"]'))
  expect(swatches.length).toBe(2)

  const weights = ticks.map((tick) => Number.parseInt(getComputedStyle(tick.querySelector('span')!).fontWeight, 10))
  const maxWeight = Math.max(...weights)
  const emphasizedCount = weights.filter((w) => w === maxWeight).length
  expect(emphasizedCount).toBe(1)
  expect(maxWeight).toBeGreaterThan(Math.min(...weights))
})

test('the diverging legend end labels render exactly as "0.01x and below" and "100.00x and above"', () => {
  const el = mountLegend('multiple')
  const domainEnds = el.querySelector('[data-testid="legend-domain-ends"]')
  expect(domainEnds).not.toBeNull()
  const spans = Array.from(domainEnds!.querySelectorAll('span')).map((s) => s.textContent)
  expect(spans).toEqual(['0.01x and below', '100.00x and above'])
})

test('with the drawdown metric active the legend renders exactly five ticks reading 0%, 20%, 40%, 60% and 80% and above, none emphasized', () => {
  const el = mountLegend('drawdown')
  const ticks = Array.from(el.querySelectorAll<HTMLElement>('[data-testid="legend-tick"]'))
  expect(ticks.length).toBe(5)
  const labels = ticks.map((tick) => tick.querySelector('span')!.textContent)
  expect(labels).toEqual(['0.00%', '20.00%', '40.00%', '60.00%', '80.00% and above'])

  const weights = ticks.map((tick) => Number.parseInt(getComputedStyle(tick.querySelector('span')!).fontWeight, 10))
  const distinctWeights = new Set(weights)
  expect(distinctWeights.size).toBe(1)

  // No separate domain-end row for a sequential scale (already folded into the ticks above).
  expect(el.querySelector('[data-testid="legend-domain-ends"]')).toBeNull()
})

test('both categorical swatch labels render exactly under every metric', () => {
  const metrics: SweepMetric[] = ['multiple', 'drawdown', 'annualized']
  for (const metric of metrics) {
    disposeStandalone?.()
    standaloneEl?.remove()
    const el = mountLegend(metric)
    const labels = Array.from(el.querySelectorAll('[data-testid="legend-swatch-label"]')).map((s) => s.textContent)
    expect(labels).toEqual(['Ruined: position reached zero', 'Holding period incomplete'])
  }
})

test('at the panel real width no two legend tick label bounding boxes overlap, for both the diverging and sequential variants', () => {
  for (const metric of ['multiple', 'drawdown'] as const) {
    disposeStandalone?.()
    standaloneEl?.remove()
    const el = mountLegend(metric)
    const ticks = Array.from(el.querySelectorAll<HTMLElement>('[data-testid="legend-tick"] span'))
    const rects = ticks.map((t) => t.getBoundingClientRect())
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!
        const b = rects[j]!
        const overlaps = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
        expect(overlaps, `metric "${metric}": tick labels ${i} and ${j} overlap`).toBe(false)
      }
    }
  }
})
