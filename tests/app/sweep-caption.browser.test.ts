/**
 * tests/app/sweep-caption.browser.test.ts
 *
 * 07-07-PLAN.md Task 3's coverage: the VIZ-04 mode statement (fixed-period precision, open-ended
 * "end of data" framing, never "today"), the VIZ-10 caveat rendered verbatim, the conditional
 * chunk-failure third line, both lines' containment inside the sweep panel's own screenshot
 * region, and the "describes the field currently painted, not a pending one" rule under an
 * in-flight mode change.
 *
 * Most cases mount `SweepCaption` directly against a synthetic `SweepGrid` (`render()`, the same
 * plain-function-call pattern `tests/app/validation.browser.test.ts` already establishes for a
 * `.ts` test file, which has no JSX transform) -- deterministic and independent of a real sweep's
 * timing. The screenshot-region and in-flight-mode-change cases need the real mounted app.
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { render } from 'solid-js/web'

import { mountApp } from '../../src/app/main.tsx'
import { resetAppState, resultMode, sweepGrid } from '../../src/app/state.ts'
import { SweepCaption } from '../../src/app/components/ResultColumn/SweepCaption.tsx'
import { VIZ10_CAVEAT_SENTENCES } from '../../src/heatmap/sweep-copy.ts'
import { createSweepGrid, type SweepGrid, type SweepGridMeta } from '../../src/sweep/sweep-grid.ts'

async function waitFor(predicate: () => boolean, timeoutMs = 35_000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('sweep-caption.browser.test: waitFor timed out waiting for a condition')
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

function baseMeta(overrides: Partial<SweepGridMeta>): SweepGridMeta {
  return {
    bundleVersion: 'test',
    symbol: 'TEST',
    dividendReinvest: true,
    entryDates: ['2000-01-01'],
    leverages: [1],
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
    endOfDataDate: '2026-08-14',
    ...overrides,
  }
}

function makeGrid(overrides: Partial<SweepGridMeta>): SweepGrid {
  return createSweepGrid(1, 1, baseMeta(overrides))
}

let standaloneEl: HTMLDivElement | undefined
let disposeStandalone: (() => void) | undefined

function mountCaption(grid: SweepGrid | null, failedCellCount?: number): HTMLDivElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  standaloneEl = el
  disposeStandalone = render(() => SweepCaption({ grid, failedCellCount }), el)
  return el
}

afterEach(() => {
  disposeStandalone?.()
  disposeStandalone = undefined
  standaloneEl?.remove()
  standaloneEl = undefined
})

// ---------------------------------------------------------------------------------------------
// Line 1: the VIZ-04 mode statement
// ---------------------------------------------------------------------------------------------

test('the fixed-period caption renders exactly "Every cell held for 10.0 years." for 2520 bars', () => {
  const grid = makeGrid({ holdMode: 'fixed', holdingPeriodBars: 2520 })
  const el = mountCaption(grid)
  const mode = el.querySelector('[data-testid="sweep-caption-mode"]')
  expect(mode!.textContent).toBe('Every cell held for 10.0 years.')
})

test('the fixed-period caption renders exactly "Every cell held for 10.5 years." for 2646 bars', () => {
  const grid = makeGrid({ holdMode: 'fixed', holdingPeriodBars: 2646 })
  const el = mountCaption(grid)
  const mode = el.querySelector('[data-testid="sweep-caption-mode"]')
  expect(mode!.textContent).toBe('Every cell held for 10.5 years.')
})

test('the open-ended caption contains "end of data" and a ten-character ISO date, and never the word "today"', () => {
  const grid = makeGrid({ holdMode: 'end-of-data', endOfDataDate: '2026-08-14' })
  const el = mountCaption(grid)
  const mode = el.querySelector('[data-testid="sweep-caption-mode"]')!.textContent!
  expect(mode).toContain('end of data')
  expect(mode).toMatch(/\d{4}-\d{2}-\d{2}/)
  expect(mode.toLowerCase()).not.toContain('today')
})

// ---------------------------------------------------------------------------------------------
// Line 2: the VIZ-10 caveat, verbatim
// ---------------------------------------------------------------------------------------------

test('both VIZ10_CAVEAT_SENTENCES strings render verbatim in the strip', () => {
  const grid = makeGrid({})
  const el = mountCaption(grid)
  const caveat = el.querySelector('[data-testid="sweep-caption-caveat"]')!.textContent!
  expect(caveat).toContain(VIZ10_CAVEAT_SENTENCES[0])
  expect(caveat).toContain(VIZ10_CAVEAT_SENTENCES[1])
})

// ---------------------------------------------------------------------------------------------
// Line 3: conditional chunk-failure line
// ---------------------------------------------------------------------------------------------

test('a forced chunk failure renders three lines, and lines 1 and 2 are still present', () => {
  const grid = makeGrid({ holdMode: 'fixed', holdingPeriodBars: 2520 })
  const el = mountCaption(grid, 7)
  const mode = el.querySelector('[data-testid="sweep-caption-mode"]')
  const caveat = el.querySelector('[data-testid="sweep-caption-caveat"]')
  const failures = el.querySelector('[data-testid="sweep-caption-failures"]')
  expect(mode).not.toBeNull()
  expect(caveat).not.toBeNull()
  expect(failures).not.toBeNull()
  expect(failures!.textContent).toBe('7 cells could not be computed. Try a different parameter.')
  expect(mode!.textContent).toBe('Every cell held for 10.0 years.')
})

test('with zero failed cells the third line is absent', () => {
  const grid = makeGrid({})
  const el = mountCaption(grid, 0)
  expect(el.querySelector('[data-testid="sweep-caption-failures"]')).toBeNull()
})

// ---------------------------------------------------------------------------------------------
// Integration: the real mounted app
// ---------------------------------------------------------------------------------------------

let container: HTMLDivElement | undefined
let disposeApp: (() => void) | undefined

beforeEach(() => {
  window.history.replaceState(null, '', window.location.pathname)
  resetAppState()
})

afterEach(() => {
  disposeApp?.()
  disposeApp = undefined
  container?.remove()
  container = undefined
  vi.unstubAllGlobals()
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

test(
  'both caption lines fall inside the sweep panel screenshot region',
  async () => {
    container = await mountAndEnterSweepMode()
    await waitFor(() => sweepGrid() !== null)
    await nextFrame()

    const region = container.querySelector('[data-testid="screenshot-region"]')
    expect(region).not.toBeNull()
    const regionRect = region!.getBoundingClientRect()

    const mode = container.querySelector('[data-testid="sweep-caption-mode"]')
    const caveat = container.querySelector('[data-testid="sweep-caption-caveat"]')
    expect(mode).not.toBeNull()
    expect(caveat).not.toBeNull()

    for (const el of [mode, caveat]) {
      const rect = el!.getBoundingClientRect()
      expect(rect.left).toBeGreaterThanOrEqual(regionRect.left - 1)
      expect(rect.right).toBeLessThanOrEqual(regionRect.right + 1)
      expect(rect.top).toBeGreaterThanOrEqual(regionRect.top - 1)
      expect(rect.bottom).toBeLessThanOrEqual(regionRect.bottom + 1)
    }
  },
  40_000,
)

test(
  'a mode change mid-sweep leaves the caption describing whichever grid is currently painted',
  async () => {
    container = await mountAndEnterSweepMode()
    await waitFor(() => sweepGrid() !== null && sweepGrid()!.cols === 200 && sweepGrid()!.rows === 50, 35_000)
    expect(sweepGrid()!.meta.holdMode).toBe('end-of-data')

    const fixedRadio = container.querySelector<HTMLInputElement>('[data-testid="holding-mode-fixed"]')
    expect(fixedRadio).not.toBeNull()
    fixedRadio!.click()

    // Waits for the NEW sweep's own coarse pass to replace the painted grid -- the caption reads
    // props.grid (the painted grid), so once this resolves the caption's own text must already
    // agree with it (T-07-05: never a pending-request description).
    await waitFor(() => sweepGrid() !== null && sweepGrid()!.meta.holdMode === 'fixed', 35_000)
    await nextFrame()

    const mode = container.querySelector('[data-testid="sweep-caption-mode"]')!.textContent!
    expect(mode).toMatch(/^Every cell held for \d+\.\d years\.$/)
    expect(mode).not.toContain('end of data')
  },
  60_000,
)
