/**
 * tests/app/log-axis-splits.browser.test.ts
 *
 * FAILURE MODE WARNING: if the fix this file guards regresses, this test does not fail with an
 * assertion. It hangs uPlot's own log-axis split loop, which kills the Chromium renderer, and
 * vitest reports "Browser connection was closed while running tests" with the test taking 0ms --
 * treat that string as a renderer death, not flake.
 *
 * Proves the real repro end to end: symbol NDX, total-return, leverage 10, entry 1999-03-04 (the
 * symbol's own first strict-tier date, per 04-01's manifest) on the default log scale decays to a
 * plotted equity minimum below 1e-22 before its ruin bar, which is exactly the range where
 * uPlot's built-in `logAxisSplits` never advances (uPlot.esm.js:1495). Kept to this one symbol's
 * 6905 bars, not a sweep, because this repo's container is memory constrained and the `app`
 * project already runs with `fileParallelism: false` for that same reason.
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { mountApp } from '../../src/app/main.tsx'
import { formatLogAxisValue } from '../../src/app/components/ResultColumn/EquityCurveChart.tsx'
import { logDecadeSplits } from '../../src/app/components/ResultColumn/log-axis-splits.ts'
import {
  currentKernelInputs,
  currentKernelResult,
  resetAppState,
  setScaleMode,
  updateBacktestRequest,
} from '../../src/app/state.ts'

const PATHOLOGICAL_MINIMUM_THRESHOLD = 1e-22

async function waitFor(predicate: () => boolean, timeoutMs = 20_000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('log-axis-splits.browser.test: waitFor timed out waiting for a condition')
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
  vi.unstubAllGlobals()
})

async function mountAndWaitForMetrics(): Promise<HTMLDivElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)
  await waitFor(() => container!.querySelector('[data-testid="metrics-panel"]') !== null)
  return container
}

test(
  'the NDX 10x log-scale repro paints a canvas with a genuinely pathological plotted minimum, distinct adjacent y labels, and the linear toggle still works',
  async () => {
    const el = await mountAndWaitForMetrics()

    updateBacktestRequest({
      symbol: 'NDX',
      dividendReinvest: true,
      entryDate: '1999-03-04',
      holdingPeriodBars: null,
      leverage: 10,
    })
    setScaleMode('log')

    await waitFor(
      () => currentKernelInputs()?.meta.seriesId === 'NDX/total-return' && currentKernelResult() !== null,
    )
    await nextFrame()
    await nextFrame()

    // The repro's own precondition: the plotted (pre-ruin) minimum positive value is genuinely
    // below 1e-22, exactly as buildSeriesData in EquityCurveChart.tsx computes it -- otherwise
    // this test could silently drift onto a benign range and keep "passing" without exercising
    // the bug at all.
    const inputs = currentKernelInputs()!
    const result = currentKernelResult()!
    const { outValue } = inputs.outputs
    const plottableBars = result.ruined && result.ruinBarIndex >= 0 ? result.ruinBarIndex : inputs.window.barCount
    let minPositive = Number.POSITIVE_INFINITY
    for (let k = 0; k < plottableBars; k++) {
      const v = outValue[k] ?? 0
      if (v > 0 && v < minPositive) minPositive = v
    }
    expect(
      minPositive,
      `NDX 10x from 1999-03-04 no longer reproduces a plotted minimum below ${PATHOLOGICAL_MINIMUM_THRESHOLD} ` +
        `(got ${minPositive}) -- this test needs new repro parameters`,
    ).toBeLessThan(PATHOLOGICAL_MINIMUM_THRESHOLD)

    // The canvas painted rather than hanging the renderer, and uPlot finished layout (a
    // zero-width `.u-over` means uPlot has not laid out yet).
    const chartRoot = el.querySelector('[data-testid="equity-curve-chart"]')
    expect(chartRoot, 'equity curve chart root not found').not.toBeNull()
    const canvas = chartRoot!.querySelector('canvas')
    expect(canvas, 'no canvas painted for the NDX 10x log-scale repro').not.toBeNull()
    const over = chartRoot!.querySelector('.u-over') as HTMLElement | null
    expect(over, 'uPlot .u-over element not found').not.toBeNull()
    expect(over!.offsetWidth, 'uPlot has not finished layout (.u-over has zero width)').toBeGreaterThan(0)

    // uPlot draws axis values with `ctx.fillText` directly onto the canvas (uPlot.esm.js:4664),
    // not into queryable DOM nodes -- `axis._el` is only an empty positioning overlay, no text
    // content. So the composed pipeline the axis actually calls (`logDecadeSplits` then
    // `formatLogAxisValue`, both exported for exactly this reason) is exercised directly against
    // the real data-derived range, which is what catches the Intl.NumberFormat collapse of every
    // sub-1e-4 decade to the literal string "0": no two adjacent rendered y-axis labels may be
    // identical.
    let maxValue = 0
    for (let k = 0; k < plottableBars; k++) {
      const v = outValue[k] ?? 0
      if (v > maxValue) maxValue = v
    }
    const splits = logDecadeSplits(minPositive, maxValue)
    expect(splits.length, 'logDecadeSplits produced no splits for the repro range').toBeGreaterThan(0)
    const yLabels = splits.map(formatLogAxisValue)
    for (let i = 1; i < yLabels.length; i++) {
      expect(
        yLabels[i],
        `adjacent y-axis labels are identical ("${yLabels[i - 1]}"), which is the Intl.NumberFormat collapse this fix must prevent`,
      ).not.toBe(yLabels[i - 1])
    }

    // The linear branch of the axis config is untouched by this fix: the same run still renders
    // on the linear scale.
    setScaleMode('linear')
    await nextFrame()
    await nextFrame()
    const linearCanvas = chartRoot!.querySelector('canvas')
    expect(linearCanvas, 'no canvas painted after toggling to the linear scale').not.toBeNull()
  },
  30_000,
)
