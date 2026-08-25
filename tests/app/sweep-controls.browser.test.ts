/**
 * tests/app/sweep-controls.browser.test.ts
 *
 * 07-06-PLAN.md Task 2/3's full case list, mounted against the real app: SweepModeToggle fills
 * the D-21 result slot without disabling, removing or duplicating the entry-date/leverage
 * controls (D-17), preserves position across a Sweep-then-Single round trip, and is disabled with
 * the rest of the surface while `loadStatus()` is `loading`; MetricToggle always renders exactly
 * three segments, whose third segment alternates IRR/CAGR by `contributionAmount` (D-24), defaults
 * to `Multiple of contributed`, and a metric change is proven to re-color (not re-sweep) the
 * cached grid.
 *
 * MetricToggle's "canvas pixel content did change" proof (acceptance criterion) is asserted
 * against a LOCALLY-OWNED canvas fed by the real, live `sweepGrid()` through the real production
 * `paintSweepField`, rather than reading `HeatmapPanel.tsx`'s own mounted canvas -- that file is
 * plan 07-07's declared scope (running concurrently in a sibling worktree, not yet wired to read
 * `displayedMetric()`) and is out of bounds for this plan's `files_modified`. Combined with the
 * `sweepGeneration()`-unchanged assertion (proving the toggle never re-sweeps), painting the SAME
 * live grid through the SAME shipped `paintSweepField` at two different metrics and finding the
 * pixels differ is the exact claim D-24 makes -- metric selection is a re-color over identical
 * data, not a new computation -- independent of which canvas element ends up on screen.
 */

import { page } from 'vitest/browser'
import { afterEach, beforeEach, expect, test } from 'vitest'

import { mountApp } from '../../src/app/main.tsx'
import { paintSweepField } from '../../src/heatmap/paint-contour.ts'
import {
  backtestRequest,
  displayedMetric,
  loadStatus,
  resetAppState,
  resultMode,
  setResultMode,
  sweepGeneration,
  sweepGrid,
  updateBacktestRequest,
} from '../../src/app/state.ts'

const NARROW_VIEWPORT = { width: 320, height: 900 } as const
const DEFAULT_VIEWPORT = { width: 1280, height: 720 } as const

async function waitFor(predicate: () => boolean, timeoutMs = 20_000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('sweep-controls.browser.test: waitFor timed out waiting for a condition')
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

let container: HTMLDivElement | undefined
let disposeApp: (() => void) | undefined

beforeEach(() => {
  // Same harness-param clearing every tests/app/*.browser.test.ts file does: the Vitest
  // browser-mode iframe carries its own sessionId/iframeId query params, unrelated to this app's
  // own permalink decode. resetAppState() (matching tests/app/sweep-progressive.browser.test.ts's
  // own convention) clears the module-singleton resultMode()/displayedMetric() left over from a
  // previous test in this file, back to 'single'/'multiple'.
  window.history.replaceState(null, '', window.location.pathname)
  resetAppState()
  // resetAppState() does not reset `request` (the BacktestRequest store) -- it is deliberately
  // reload-scoped, not parameter-scoped (see its own doc comment). Explicitly returning
  // contributionAmount to the shipped default here keeps each test in this file starting from
  // the same D-24 "no contributions" baseline, regardless of what a previous test left behind.
  updateBacktestRequest({ contributionAmount: 0, contributionFrequency: 'none' })
})

afterEach(async () => {
  disposeApp?.()
  disposeApp = undefined
  container?.remove()
  container = undefined
  await page.viewport(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height)
})

async function mountAndWaitForReady(): Promise<HTMLDivElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)
  await waitFor(() => loadStatus() === 'ready')
  return container
}

async function mountEnterSweepAndWaitForGrid(): Promise<HTMLDivElement> {
  const el = await mountAndWaitForReady()
  const sweepRadio = el.querySelector<HTMLInputElement>('[data-testid="sweep-mode-sweep"]')
  expect(sweepRadio).not.toBeNull()
  sweepRadio!.click()
  expect(resultMode()).toBe('sweep')
  await waitFor(() => sweepGrid() !== null && sweepGrid()!.cols === 200 && sweepGrid()!.rows === 50, 30_000)
  return el
}

// -------------------------------------------------------------------------------------------
// SweepModeToggle (Task 2)
// -------------------------------------------------------------------------------------------

test('SweepModeToggle renders exactly the segment labels "Single run" and "Sweep"', async () => {
  const el = await mountAndWaitForReady()
  const toggle = el.querySelector('[data-testid="sweep-mode-toggle"]')
  expect(toggle).not.toBeNull()
  expect(toggle!.textContent).toContain('Single run')
  expect(toggle!.textContent).toContain('Sweep')
})

test('switching to Sweep and back to Single run leaves entryDate and leverage unchanged', async () => {
  const el = await mountAndWaitForReady()
  const entryDateBefore = backtestRequest().entryDate
  const leverageBefore = backtestRequest().leverage

  el.querySelector<HTMLInputElement>('[data-testid="sweep-mode-sweep"]')!.click()
  expect(resultMode()).toBe('sweep')
  expect(backtestRequest().entryDate).toBe(entryDateBefore)
  expect(backtestRequest().leverage).toBe(leverageBefore)

  el.querySelector<HTMLInputElement>('[data-testid="sweep-mode-single"]')!.click()
  expect(resultMode()).toBe('single')
  expect(backtestRequest().entryDate).toBe(entryDateBefore)
  expect(backtestRequest().leverage).toBe(leverageBefore)
})

test('D-17: the entry-date and leverage controls are present and enabled in sweep mode', async () => {
  const el = await mountAndWaitForReady()
  el.querySelector<HTMLInputElement>('[data-testid="sweep-mode-sweep"]')!.click()
  expect(resultMode()).toBe('sweep')

  const entryDateInput = el.querySelector<HTMLInputElement>('[data-testid="entry-date-input"]')
  const leverageSlider = el.querySelector<HTMLInputElement>('[data-testid="leverage-slider"]')
  expect(entryDateInput).not.toBeNull()
  expect(leverageSlider).not.toBeNull()
  expect(entryDateInput!.disabled).toBe(false)
  expect(leverageSlider!.disabled).toBe(false)
})

test('the SweepModeToggle switch is disabled while loadStatus() is loading', async () => {
  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)

  // loadStatus() is synchronously 'loading' the instant mountApp returns (matches
  // tests/app/controls.browser.test.ts's own "disabled while loading" pattern) -- the toggle
  // itself is present in the DOM (D-18's own landing requirement needs it mounted before ready),
  // just disabled, matching every other control's loading treatment.
  const singleRadio = container.querySelector<HTMLInputElement>('[data-testid="sweep-mode-single"]')
  const sweepRadio = container.querySelector<HTMLInputElement>('[data-testid="sweep-mode-sweep"]')
  expect(singleRadio).not.toBeNull()
  expect(sweepRadio).not.toBeNull()
  expect(singleRadio!.disabled).toBe(true)
  expect(sweepRadio!.disabled).toBe(true)

  await waitFor(() => loadStatus() === 'ready')
  expect(singleRadio!.disabled).toBe(false)
  expect(sweepRadio!.disabled).toBe(false)
})

// -------------------------------------------------------------------------------------------
// MetricToggle (Task 3)
// -------------------------------------------------------------------------------------------

test('MetricToggle always renders exactly three segments, with contributions at zero and at non-zero', async () => {
  const el = await mountEnterSweepAndWaitForGrid()

  expect(backtestRequest().contributionAmount).toBe(0)
  let radios = el.querySelectorAll('[data-testid="metric-toggle"] input[type="radio"]')
  expect(radios.length).toBe(3)

  updateBacktestRequest({ contributionAmount: 200, contributionFrequency: 'monthly' })
  await waitFor(() => backtestRequest().contributionAmount === 200)
  radios = el.querySelectorAll('[data-testid="metric-toggle"] input[type="radio"]')
  expect(radios.length).toBe(3)
})

test('D-24: the third segment reads CAGR when contributionAmount is 0 and IRR when non-zero, never both at once', async () => {
  const el = await mountEnterSweepAndWaitForGrid()

  expect(backtestRequest().contributionAmount).toBe(0)
  const toggleText = () => el.querySelector('[data-testid="metric-toggle"]')!.textContent ?? ''
  expect(toggleText()).toContain('CAGR')
  expect(toggleText()).not.toContain('IRR')

  updateBacktestRequest({ contributionAmount: 200, contributionFrequency: 'monthly' })
  await waitFor(() => backtestRequest().contributionAmount === 200)
  expect(toggleText()).toContain('IRR')
  expect(toggleText()).not.toContain('CAGR')
})

test('the first segment reads exactly "Multiple of contributed" and is the default selection', async () => {
  const el = await mountEnterSweepAndWaitForGrid()
  expect(displayedMetric()).toBe('multiple')
  const multipleRadio = el.querySelector<HTMLInputElement>('[data-testid="metric-toggle-multiple"]')
  expect(multipleRadio).not.toBeNull()
  expect(multipleRadio!.checked).toBe(true)
  expect(el.querySelector('[data-testid="metric-toggle"]')!.textContent).toContain('Multiple of contributed')
})

test('a metric change leaves sweepGeneration() unchanged and re-colors the field, proven against the live grid through the shipped paintSweepField', async () => {
  const el = await mountEnterSweepAndWaitForGrid()
  const generationBefore = sweepGeneration()

  const drawdownRadio = el.querySelector<HTMLInputElement>('[data-testid="metric-toggle-drawdown"]')
  expect(drawdownRadio).not.toBeNull()
  drawdownRadio!.click()

  expect(displayedMetric()).toBe('drawdown')
  // METR-06/D-24: a metric change is a store write only -- never scheduleSweep, never a new
  // generation.
  expect(sweepGeneration()).toBe(generationBefore)

  const grid = sweepGrid()!
  const canvasA = document.createElement('canvas')
  canvasA.width = 200
  canvasA.height = 60
  const canvasB = document.createElement('canvas')
  canvasB.width = 200
  canvasB.height = 60
  const ctxA = canvasA.getContext('2d')!
  const ctxB = canvasB.getContext('2d')!

  paintSweepField(ctxA, grid, { metric: 'multiple' })
  paintSweepField(ctxB, grid, { metric: displayedMetric() })

  const dataA = ctxA.getImageData(0, 0, canvasA.width, canvasA.height).data
  const dataB = ctxB.getImageData(0, 0, canvasB.width, canvasB.height).data
  expect(dataA.length).toBe(dataB.length)
  let differingBytes = 0
  for (let i = 0; i < dataA.length; i++) {
    if (dataA[i] !== dataB[i]) differingBytes++
  }
  expect(differingBytes).toBeGreaterThan(0)
})

test('MetricToggle stays interactive mid-sweep: switching segments never blocks on a pending sweep', async () => {
  const el = await mountEnterSweepAndWaitForGrid()

  const drawdownRadio = el.querySelector<HTMLInputElement>('[data-testid="metric-toggle-drawdown"]')
  const annualizedRadio = el.querySelector<HTMLInputElement>('[data-testid="metric-toggle-annualized"]')
  expect(drawdownRadio!.disabled).toBe(false)
  expect(annualizedRadio!.disabled).toBe(false)

  drawdownRadio!.click()
  expect(displayedMetric()).toBe('drawdown')
  annualizedRadio!.click()
  expect(displayedMetric()).toBe('annualized')
})

test('E2 overflow/long-text backstop: at the narrowest supported viewport, MetricToggle stays within its column', async () => {
  const el = await mountEnterSweepAndWaitForGrid()
  await page.viewport(NARROW_VIEWPORT.width, NARROW_VIEWPORT.height)
  // Yields a frame so the viewport resize's layout reflow has settled before reading rects.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

  const resultColumn = el.querySelector('[data-testid="result-slot"]')
  const toggle = el.querySelector('[data-testid="metric-toggle"]')
  expect(resultColumn).not.toBeNull()
  expect(toggle).not.toBeNull()

  const columnRect = resultColumn!.getBoundingClientRect()
  const toggleRect = toggle!.getBoundingClientRect()

  expect(toggleRect.left, 'metric-toggle left edge outside its column').toBeGreaterThanOrEqual(columnRect.left - 1)
  expect(toggleRect.right, 'metric-toggle right edge outside its column').toBeLessThanOrEqual(columnRect.right + 1)

  // MetricToggle itself neither clips nor overflows its own box -- distinct from a whole-page
  // scroll-width assertion, which this scenario deliberately does NOT make: HeatmapPanel's fixed
  // 800px canvas (07-01, unmodified by this plan) is out of this plan's files_modified and is
  // 07-UI-SPEC.md E3's own separate overflow backstop, owned by a different plan (07-07/07-08).
  const toggleEl = toggle as HTMLElement
  expect(
    toggleEl.scrollWidth,
    `metric-toggle clips rather than wraps (scrollWidth ${toggleEl.scrollWidth} > clientWidth ${toggleEl.clientWidth})`,
  ).toBeLessThanOrEqual(toggleEl.clientWidth + 1)
})
