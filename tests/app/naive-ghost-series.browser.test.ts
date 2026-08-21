/**
 * tests/app/naive-ghost-series.browser.test.ts
 *
 * 05-02-PLAN.md Task 2: the naive ghost series is unconditional and always drawn -- present in
 * the legend on the default landing run at both scale modes, still rendering the real series
 * (T-05-03's regression guard) on the deep-drawdown high-leverage repro that already killed the
 * log-scale renderer once this milestone (`quick-260820-4qx`), and repainting through a theme
 * change alongside the real series.
 *
 * uPlot draws axis/series strokes directly onto canvas (no queryable DOM for the drawn pixels),
 * but its default legend renders one `<tr class="u-series">` per series with a `.u-label` div
 * whose `textContent` is that series' own `label` string (uPlot.esm.js's `initLegendRow`) -- this
 * is how a series' *presence* is asserted without reading canvas pixels.
 */

import { afterEach, beforeEach, expect, test } from 'vitest'

import { mountApp } from '../../src/app/main.tsx'
import {
  currentKernelInputs,
  currentKernelResult,
  resetAppState,
  setScaleMode,
  updateBacktestRequest,
} from '../../src/app/state.ts'
import { resetThemeState, setThemeOverride } from '../../src/app/theme.ts'

// Verbatim from 05-UI-SPEC.md's Copywriting Contract -- the same literal string
// EquityCurveChart.tsx's NAIVE_GHOST_LEGEND_LABEL constant is built from.
const NAIVE_GHOST_LEGEND_LABEL = 'Naive: leverage × return, no costs (dashed)'
const EQUITY_LEGEND_LABEL = 'Equity'

async function waitFor(predicate: () => boolean, timeoutMs = 20_000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('naive-ghost-series.browser.test: waitFor timed out waiting for a condition')
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

let container: HTMLDivElement | undefined
let disposeApp: (() => void) | undefined

beforeEach(() => {
  window.history.replaceState(null, '', window.location.pathname)
})

afterEach(() => {
  disposeApp?.()
  disposeApp = undefined
  container?.remove()
  container = undefined
  resetAppState()
  resetThemeState()
})

async function mountAndWaitForChart(): Promise<HTMLDivElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)
  await waitFor(() => container!.querySelector('[data-testid="equity-curve-chart"] canvas') !== null)
  return container
}

function legendLabels(el: HTMLDivElement): string[] {
  const nodes = el.querySelectorAll<HTMLElement>('[data-testid="equity-curve-chart"] .u-legend .u-label')
  return Array.from(nodes).map((node) => node.textContent ?? '')
}

test('the ghost series is present in the legend alongside the real series on a default landing run, on the log scale', async () => {
  const el = await mountAndWaitForChart()

  const labels = legendLabels(el)
  expect(labels).toContain(NAIVE_GHOST_LEGEND_LABEL)
  expect(labels).toContain(EQUITY_LEGEND_LABEL)
})

test('the ghost series is present in the legend alongside the real series on the linear scale', async () => {
  const el = await mountAndWaitForChart()

  setScaleMode('linear')
  await nextFrame()
  await nextFrame()

  const labels = legendLabels(el)
  expect(labels).toContain(NAIVE_GHOST_LEGEND_LABEL)
  expect(labels).toContain(EQUITY_LEGEND_LABEL)

  const canvas = el.querySelector('[data-testid="equity-curve-chart"] canvas')
  expect(canvas, 'no canvas painted on the linear scale').not.toBeNull()
})

test(
  'a deep-drawdown high-leverage permalink (NDX 10x from 1999-03-04, log scale) renders without throwing and the real series still renders alongside the ghost series',
  async () => {
    const el = await mountAndWaitForChart()

    // Same repro tests/app/log-axis-splits.browser.test.ts uses: leverage 10 drives the naive
    // baseline (D-02: initial * (1 + 10 * cumulativeIndexReturn)) deeply negative across this
    // window, well past T-05-03's non-positive/log-scale failure mode this plan's threat model
    // names.
    updateBacktestRequest({
      symbol: 'NDX',
      dividendReinvest: true,
      entryDate: '1999-03-04',
      holdingPeriodBars: null,
      leverage: 10,
    })

    await waitFor(() => currentKernelInputs()?.meta.seriesId === 'NDX/total-return' && currentKernelResult() !== null)
    await nextFrame()
    await nextFrame()

    // The real series still renders: a painted canvas, and uPlot has finished layout (a
    // zero-width `.u-over` means layout has not happened yet).
    const chartRoot = el.querySelector('[data-testid="equity-curve-chart"]')
    expect(chartRoot, 'equity curve chart root not found').not.toBeNull()
    const canvas = chartRoot!.querySelector('canvas')
    expect(canvas, 'no canvas painted for the NDX 10x deep-drawdown repro').not.toBeNull()
    const over = chartRoot!.querySelector('.u-over') as HTMLElement | null
    expect(over, 'uPlot .u-over element not found').not.toBeNull()
    expect(over!.offsetWidth, 'uPlot has not finished layout (.u-over has zero width)').toBeGreaterThan(0)

    // The ghost series is still present (unconditional, D-07) even though this window drives its
    // values non-positive for long stretches.
    const labels = legendLabels(el)
    expect(labels).toContain(NAIVE_GHOST_LEGEND_LABEL)
    expect(labels).toContain(EQUITY_LEGEND_LABEL)
  },
  30_000,
)

test('toggling the theme leaves both the real series and the ghost series drawn', async () => {
  const el = await mountAndWaitForChart()

  const labelsBefore = legendLabels(el)
  expect(labelsBefore).toContain(NAIVE_GHOST_LEGEND_LABEL)
  expect(labelsBefore).toContain(EQUITY_LEGEND_LABEL)

  setThemeOverride('dark')
  await nextFrame()
  await nextFrame()

  const canvasAfterDark = el.querySelector('[data-testid="equity-curve-chart"] canvas')
  expect(canvasAfterDark, 'no canvas painted after switching to dark theme').not.toBeNull()
  const labelsAfterDark = legendLabels(el)
  expect(labelsAfterDark).toContain(NAIVE_GHOST_LEGEND_LABEL)
  expect(labelsAfterDark).toContain(EQUITY_LEGEND_LABEL)

  setThemeOverride('light')
  await nextFrame()
  await nextFrame()

  const canvasAfterLight = el.querySelector('[data-testid="equity-curve-chart"] canvas')
  expect(canvasAfterLight, 'no canvas painted after switching back to light theme').not.toBeNull()
  const labelsAfterLight = legendLabels(el)
  expect(labelsAfterLight).toContain(NAIVE_GHOST_LEGEND_LABEL)
  expect(labelsAfterLight).toContain(EQUITY_LEGEND_LABEL)
})
