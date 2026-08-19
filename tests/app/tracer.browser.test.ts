/**
 * tests/app/tracer.browser.test.ts
 *
 * The end-to-end browser regression for Task 3's tracer path: mounts the real app (through
 * `mountApp`, the same path production's `main.tsx` uses), waits for the bundle to load, and
 * asserts the default landing run reaches a painted chart with both `app-data-ready` and
 * `app-interactive` performance marks recorded in order. A second case stubs the manifest fetch
 * to decode to zero series and asserts the named bundle-load failure line renders instead of a
 * blank chart or an empty control (DATA-08 empty edge).
 */

import { afterEach, expect, test, vi } from 'vitest'

import { MANIFEST_PATH } from '../../src/data-bundle.generated.ts'
import { mountApp } from '../../src/app/main.tsx'
import { axisSizeForLabels } from '../../src/app/components/ResultColumn/EquityCurveChart.tsx'
import { currentKernelInputs, currentKernelResult } from '../../src/app/state.ts'

/** uPlot's built-in default `axis.size`. The landing run's equity values are wider than this at
 * the chart's 12px monospace axis font, which is why the gutter must be measured, not defaulted. */
const UPLOT_DEFAULT_AXIS_SIZE_PX = 50

function performanceEntries(name: string): PerformanceEntryList {
  return performance.getEntriesByName(name)
}

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('tracer.browser.test: waitFor timed out waiting for a condition')
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

let container: HTMLDivElement | undefined
let disposeApp: (() => void) | undefined

afterEach(() => {
  disposeApp?.()
  disposeApp = undefined
  container?.remove()
  container = undefined
  performance.clearMarks('app-data-ready')
  performance.clearMarks('app-interactive')
  performance.clearMeasures('app-recompute')
  vi.unstubAllGlobals()
})

test('the default landing run computes and paints a real SPX 3x total-return equity curve', async () => {
  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)

  await waitFor(() => container!.querySelector('[data-testid="equity-curve-chart"] canvas') !== null)

  const canvas = container.querySelector('[data-testid="equity-curve-chart"] canvas')
  expect(canvas).not.toBeNull()

  await waitFor(() => performanceEntries('app-data-ready').length > 0)
  await waitFor(() => performanceEntries('app-interactive').length > 0)

  const dataReady = performanceEntries('app-data-ready')
  const interactive = performanceEntries('app-interactive')
  expect(dataReady.length).toBe(1)
  expect(interactive.length).toBe(1)
  expect(dataReady[0]!.startTime).toBeLessThanOrEqual(interactive[0]!.startTime)

  const manifestResponse = await fetch(MANIFEST_PATH)
  const manifest = (await manifestResponse.json()) as {
    series: Array<{ id: string; tiers: { strict: { firstDate: string } | null } }>
  }
  const spxTotalReturn = manifest.series.find((s) => s.id === 'SPX/total-return')
  expect(spxTotalReturn).toBeDefined()
  expect(spxTotalReturn!.tiers.strict).not.toBeNull()

  const inputs = currentKernelInputs()
  expect(inputs).not.toBeNull()
  expect(inputs!.meta.seriesId).toBe('SPX/total-return')
  expect(inputs!.window.firstDate).toBe(spxTotalReturn!.tiers.strict!.firstDate)

  const result = currentKernelResult()
  expect(result).not.toBeNull()
  expect(Number.isFinite(result!.finalValue)).toBe(true)
  expect(result!.finalValue).toBeGreaterThan(0)

  await waitFor(() => performance.getEntriesByName('app-recompute', 'measure').length >= 1)
  const recomputeMeasures = performance.getEntriesByName('app-recompute', 'measure')
  expect(recomputeMeasures.length).toBeGreaterThanOrEqual(1)
})

test('a manifest that decodes to zero series renders the named failure line, never a blank chart', async () => {
  const originalFetch = window.fetch.bind(window)
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.endsWith(MANIFEST_PATH)) {
      const response = await originalFetch(input, init)
      const manifest = await response.json()
      manifest.series = []
      return new Response(JSON.stringify(manifest), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return originalFetch(input, init)
  })

  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)

  await waitFor(() => container!.querySelector('[data-testid="load-failure"]') !== null)

  const failureEl = container.querySelector('[data-testid="load-failure"]')
  expect(failureEl).not.toBeNull()
  expect(failureEl!.textContent).toMatch(/no series named/i)

  expect(container.querySelector('[data-testid="equity-curve-chart"] canvas')).toBeNull()
  expect(container.querySelector('canvas')).toBeNull()
})

test('the y-axis gutter is measured from its labels, so wide equity values are not clipped', async () => {
  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)

  await waitFor(() => container!.querySelector('[data-testid="equity-curve-chart"] canvas') !== null)

  // uPlot positions `.u-over` (the plotting area) inset by exactly the axis sizes it allotted,
  // so its offsetLeft IS the rendered y-axis gutter width in CSS pixels.
  const over = container.querySelector<HTMLElement>('[data-testid="equity-curve-chart"] .u-over')
  expect(over).not.toBeNull()

  const gutterPx = over!.offsetLeft
  expect(gutterPx).toBeGreaterThan(UPLOT_DEFAULT_AXIS_SIZE_PX)

  const labels = Array.from(
    container.querySelectorAll<HTMLElement>('[data-testid="equity-curve-chart"] .u-legend'),
  )
  expect(labels.length).toBeGreaterThan(0) // the chart mounted fully, not just a bare canvas
})

test('axisSizeForLabels sizes to the widest label plus the tick and gap', () => {
  // One stub character width, so the expected number is arithmetic rather than font-dependent.
  const measure = (label: string): number => label.length * 7
  const size = axisSizeForLabels(measure, ['10', '1,000', '1,000,000'], 10, 5)
  expect(size).toBe(10 + 5 + '1,000,000'.length * 7)

  // No labels: the gutter still has to hold the tick and gap.
  expect(axisSizeForLabels(measure, [], 10, 5)).toBe(15)

  // Fractional measurements round up -- a gutter half a pixel short still clips.
  expect(axisSizeForLabels(() => 20.2, ['x'], 10, 5)).toBe(36)
})
