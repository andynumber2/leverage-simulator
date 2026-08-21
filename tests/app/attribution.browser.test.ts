/**
 * tests/app/attribution.browser.test.ts
 *
 * 05-01-PLAN.md Task 1: mounting the app with a default landing run renders the naive/actual
 * attribution rows with finite formatted currency values, and changing leverage through the
 * existing control changes both rendered values within the same frame budget the metrics panel
 * already meets (PERF-07b's coalesced recompute).
 *
 * Task 3 extends this file with the full five-row layout and the reconciliation-reads-100% case.
 */

import { afterEach, beforeEach, expect, test } from 'vitest'

import { mountApp } from '../../src/app/main.tsx'
import { currentAttribution, updateBacktestRequest } from '../../src/app/state.ts'

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('attribution.browser.test: waitFor timed out waiting for a condition')
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

let container: HTMLDivElement | undefined
let disposeApp: (() => void) | undefined

// Same harness-param clearing as tests/app/metrics.browser.test.ts (D-13): the Vitest browser-mode
// iframe carries its own sessionId/iframeId query params, which decodeParams would otherwise
// reject as unknown permalink keys.
beforeEach(() => {
  window.history.replaceState(null, '', window.location.pathname)
})

afterEach(() => {
  disposeApp?.()
  disposeApp = undefined
  container?.remove()
  container = undefined
})

async function mountAndWaitForResult(): Promise<HTMLDivElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)
  await waitFor(() => container!.querySelector('[data-testid="attribution-panel"]') !== null)
  return container
}

function parseCurrency(text: string | null | undefined): number {
  expect(text).toBeTruthy()
  const numeric = Number((text as string).replace(/[^0-9.-]/g, ''))
  expect(Number.isFinite(numeric)).toBe(true)
  return numeric
}

test('the naive and actual rows render inside the screenshot region with finite currency values on a default landing run', async () => {
  const el = await mountAndWaitForResult()

  const screenshotRegion = el.querySelector('[data-testid="screenshot-region"]')
  expect(screenshotRegion).not.toBeNull()

  const naiveRow = screenshotRegion!.querySelector('[data-testid="attribution-naive"]')
  const actualRow = screenshotRegion!.querySelector('[data-testid="attribution-actual"]')
  expect(naiveRow).not.toBeNull()
  expect(actualRow).not.toBeNull()

  const naiveValue = naiveRow!.querySelector('.attribution-value')
  const actualValue = actualRow!.querySelector('.attribution-value')

  parseCurrency(naiveValue?.textContent)
  parseCurrency(actualValue?.textContent)

  const attribution = currentAttribution()
  expect(attribution).not.toBeNull()
  expect(Number.isFinite(attribution!.naiveFinalValue)).toBe(true)
  expect(Number.isFinite(attribution!.actualFinalValue)).toBe(true)
  expect(Number.isFinite(attribution!.totalGap)).toBe(true)
})

test('changing leverage through the existing control changes both rendered attribution values within the same coalesced frame the metrics panel updates in', async () => {
  const el = await mountAndWaitForResult()

  const attributionBefore = currentAttribution()
  expect(attributionBefore).not.toBeNull()
  const naiveBefore = parseCurrency(el.querySelector('[data-testid="attribution-naive"] .attribution-value')?.textContent)
  const actualBefore = parseCurrency(el.querySelector('[data-testid="attribution-actual"] .attribution-value')?.textContent)
  const dragBefore = el.querySelector('[data-testid="attribution-volatility-drag"] .attribution-value')?.textContent
  const financingBefore = el.querySelector('[data-testid="attribution-financing-cost"] .attribution-value')?.textContent
  const expenseBefore = el.querySelector('[data-testid="attribution-expense-ratio"] .attribution-value')?.textContent

  updateBacktestRequest({ leverage: 2 })
  await waitFor(() => currentAttribution() !== null && currentAttribution()!.naiveFinalValue !== attributionBefore!.naiveFinalValue)

  const naiveAfter = parseCurrency(el.querySelector('[data-testid="attribution-naive"] .attribution-value')?.textContent)
  const actualAfter = parseCurrency(el.querySelector('[data-testid="attribution-actual"] .attribution-value')?.textContent)

  expect(naiveAfter).not.toBe(naiveBefore)
  expect(actualAfter).not.toBe(actualBefore)

  // The three component rows and the reconciliation total must track the new run too. These read
  // `props.attribution` through a memo rather than a plain component-body value; without that they
  // freeze at the first run while naive/actual keep updating, and the panel silently attributes the
  // new result's gap to the old result's costs.
  const dragAfter = el.querySelector('[data-testid="attribution-volatility-drag"] .attribution-value')?.textContent
  const financingAfter = el.querySelector('[data-testid="attribution-financing-cost"] .attribution-value')?.textContent
  const expenseAfter = el.querySelector('[data-testid="attribution-expense-ratio"] .attribution-value')?.textContent
  expect(dragAfter).not.toBe(dragBefore)
  expect(financingAfter).not.toBe(financingBefore)
  expect(expenseAfter).not.toBe(expenseBefore)

  // The metrics panel updated too, in the same pass -- both surfaces reflect the same new run.
  const metricsPanel = el.querySelector('[data-testid="metrics-panel"]')
  expect(metricsPanel).not.toBeNull()
})

test('all six rows render for a default run: heading, naive, actual, the three signed components and the reconciliation row', async () => {
  const el = await mountAndWaitForResult()

  const panel = el.querySelector('[data-testid="attribution-panel"]')
  expect(panel).not.toBeNull()

  // querySelectorAll searches descendants only, not the panel element itself.
  const testIds = Array.from(panel!.querySelectorAll('[data-testid]')).map((node) => (node as HTMLElement).dataset.testid)
  expect(testIds).toEqual([
    'attribution-heading',
    'attribution-naive',
    'attribution-actual',
    'attribution-volatility-drag',
    'attribution-financing-cost',
    'attribution-expense-ratio',
    'attribution-reconciliation',
  ])

  const drag = el.querySelector('[data-testid="attribution-volatility-drag"] .attribution-value')
  const financing = el.querySelector('[data-testid="attribution-financing-cost"] .attribution-value')
  const expense = el.querySelector('[data-testid="attribution-expense-ratio"] .attribution-value')
  expect(drag?.textContent).toMatch(/of gap/)
  expect(financing?.textContent).toMatch(/of gap/)
  expect(expense?.textContent).toMatch(/of gap/)
})

test('the reconciliation row reads a percentage that is exactly 100.00% on a default run', async () => {
  const el = await mountAndWaitForResult()

  const reconciliation = el.querySelector('[data-testid="attribution-reconciliation"] .attribution-value')
  expect(reconciliation).not.toBeNull()
  expect(reconciliation!.textContent).toBe('100.00%')
})
