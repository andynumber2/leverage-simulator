/**
 * tests/app/screenshot-region.browser.test.ts
 *
 * D-20: proves the `[data-testid="screenshot-region"]` element's bounding rectangle fully
 * contains the bounding rectangles of the symbol label, the effective date range, the bundle
 * version, the chart canvas and the metrics panel (plus the ruin banner, when present) -- in both
 * the normal and the ruined states, at both the widest and the narrowest supported viewport
 * widths. `page.viewport` (from `@vitest/browser/context`) resizes the real test iframe, so
 * `.app-layout`'s `@media (min-width: 900px)` breakpoint (D-17) genuinely engages or doesn't,
 * unlike resizing a container element which CSS media queries do not respond to.
 *
 * 320px (a common smallest-supported mobile width) is the narrowest viewport; 1440px (a common
 * desktop width) is the widest -- 04-UI-SPEC.md names no exact pixel values, only "narrowest/
 * widest supported viewport" as a backstop category, so these are Claude's Discretion picks
 * bracketing D-17's >=900px desktop breakpoint on both sides.
 */

import { page } from 'vitest/browser'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { mountApp } from '../../src/app/main.tsx'
import { currentKernelResult, resetAppState, updateBacktestRequest } from '../../src/app/state.ts'

const NARROWEST_VIEWPORT = { width: 320, height: 900 } as const
const WIDEST_VIEWPORT = { width: 1440, height: 900 } as const
const DEFAULT_VIEWPORT = { width: 1280, height: 720 } as const

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('screenshot-region.browser.test: waitFor timed out waiting for a condition')
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

let container: HTMLDivElement | undefined
let disposeApp: (() => void) | undefined

// Plan 04-07's iframe-harness-param note: clear the Vitest browser-mode iframe's own incidental
// query params before every mount, same as the other tests/app/*.browser.test.ts files.
beforeEach(() => {
  window.history.replaceState(null, '', window.location.pathname)
})

afterEach(async () => {
  disposeApp?.()
  disposeApp = undefined
  container?.remove()
  container = undefined
  resetAppState()
  vi.unstubAllGlobals()
  performance.clearMarks('app-data-ready')
  performance.clearMarks('app-interactive')
  performance.clearMeasures('app-recompute')
  await page.viewport(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height)
})

async function mountAndWaitForMetrics(): Promise<HTMLDivElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)
  await waitFor(() => container!.querySelector('[data-testid="metrics-panel"]') !== null)
  return container
}

/** Asserts `child`'s bounding rectangle is fully contained within `region`'s, with a 1px
 * tolerance for sub-pixel layout rounding -- the specific tolerance the containment claim needs
 * to be robust to browser rounding without masking a genuine overflow. */
function assertContained(region: DOMRect, child: Element | null, label: string): void {
  expect(child, `${label} not found in the DOM`).not.toBeNull()
  const rect = child!.getBoundingClientRect()
  expect(rect.left, `${label}'s left edge (${rect.left}) is outside the screenshot region's (${region.left})`).toBeGreaterThanOrEqual(
    region.left - 1,
  )
  expect(
    rect.right,
    `${label}'s right edge (${rect.right}) is outside the screenshot region's (${region.right})`,
  ).toBeLessThanOrEqual(region.right + 1)
  expect(rect.top, `${label}'s top edge (${rect.top}) is outside the screenshot region's (${region.top})`).toBeGreaterThanOrEqual(
    region.top - 1,
  )
  expect(
    rect.bottom,
    `${label}'s bottom edge (${rect.bottom}) is outside the screenshot region's (${region.bottom})`,
  ).toBeLessThanOrEqual(region.bottom + 1)
}

/** The five elements D-20 names, plus the ruin banner when `expectRuinBanner` is true. */
function assertRegionIsSelfContained(el: HTMLDivElement, expectRuinBanner: boolean): void {
  const region = el.querySelector('[data-testid="screenshot-region"]')
  expect(region, 'screenshot-region not found').not.toBeNull()
  const regionRect = region!.getBoundingClientRect()

  assertContained(regionRect, el.querySelector('[data-testid="result-summary-symbol"]'), 'the symbol label')
  assertContained(regionRect, el.querySelector('[data-testid="result-summary-date-range"]'), 'the effective date range')
  assertContained(regionRect, el.querySelector('[data-testid="result-summary-bundle-version"]'), 'the bundle version')
  assertContained(regionRect, el.querySelector('[data-testid="equity-curve-chart"] canvas'), 'the chart canvas')
  assertContained(regionRect, el.querySelector('[data-testid="metrics-panel"]'), 'the metrics panel')

  if (expectRuinBanner) {
    assertContained(regionRect, el.querySelector('[data-testid="ruin-banner"]'), 'the ruin banner')
  }
}

test('normal state: the screenshot region is self-contained at the widest supported viewport', async () => {
  await page.viewport(WIDEST_VIEWPORT.width, WIDEST_VIEWPORT.height)
  const el = await mountAndWaitForMetrics()
  assertRegionIsSelfContained(el, false)
})

test('normal state: the screenshot region is self-contained at the narrowest supported viewport', async () => {
  await page.viewport(NARROWEST_VIEWPORT.width, NARROWEST_VIEWPORT.height)
  const el = await mountAndWaitForMetrics()
  assertRegionIsSelfContained(el, false)
})

test('ruined state: the screenshot region (including the ruin banner) is self-contained at the widest supported viewport', async () => {
  await page.viewport(WIDEST_VIEWPORT.width, WIDEST_VIEWPORT.height)
  const el = await mountAndWaitForMetrics()
  // Leverage 20 (UI-SPEC's own stated maximum, E2), same as metrics.browser.test.ts's ruin case:
  // a real historical single-day crash inside the bundled SPX strict-tier window genuinely drives
  // the position to zero.
  updateBacktestRequest({ leverage: 20 })
  await waitFor(() => currentKernelResult()?.ruined === true)
  await waitFor(() => el.querySelector('[data-testid="ruin-banner"]') !== null)
  assertRegionIsSelfContained(el, true)
})

test('ruined state: the screenshot region (including the ruin banner) is self-contained at the narrowest supported viewport', async () => {
  await page.viewport(NARROWEST_VIEWPORT.width, NARROWEST_VIEWPORT.height)
  const el = await mountAndWaitForMetrics()
  updateBacktestRequest({ leverage: 20 })
  await waitFor(() => currentKernelResult()?.ruined === true)
  await waitFor(() => el.querySelector('[data-testid="ruin-banner"]') !== null)
  assertRegionIsSelfContained(el, true)
})
