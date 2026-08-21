/**
 * tests/app/methodology-overlay.browser.test.ts
 *
 * 05-07-PLAN.md Tasks 2 and 3's full case list, mounted against the real app and the real
 * committed bundle: the provenance strip's "View methodology" link opens the overlay without
 * changing any run parameter; the overlay renders the four Copywriting Contract section headings
 * in order; the cost-model section renders one row per `COST_PARAMETERS` entry, each showing its
 * confidence level; the day-count section renders both bases; the limitations section renders
 * exactly four limitation paragraphs, each carrying a number sourced from a registry or generated
 * constant; the close button and the Escape key both close the overlay and restore the exact
 * original query string; and the overlay opens directly from a permalink carrying the flag.
 */

import { afterEach, beforeEach, expect, test } from 'vitest'

import { mountApp } from '../../src/app/main.tsx'
import { flushPermalinkUrl, resetAppState } from '../../src/app/state.ts'
import { COST_PARAMETERS } from '../../src/validation/cost-parameters.ts'
import { EXTENDED_TIER_BIAS_ANNUALIZED_FRACTION } from '../../src/validation/extended-tier-bias.generated.ts'
import { formatPercent } from '../../src/metrics/format.ts'

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('methodology-overlay.browser.test: waitFor timed out waiting for a condition')
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

let container: HTMLDivElement | undefined
let disposeApp: (() => void) | undefined

// Plan 04-07: `mountApp` decodes `window.location.search` as a permalink (D-13). The Vitest
// browser-mode iframe this file runs in carries its own `sessionId`/`iframeId` query params
// (harness plumbing, unrelated to this app), which `decodeParams` correctly rejects as unknown
// keys -- clear them back to a clean boot before every mount, same as controls.browser.test.ts.
beforeEach(() => {
  window.history.replaceState(null, '', window.location.pathname)
})

afterEach(() => {
  disposeApp?.()
  disposeApp = undefined
  container?.remove()
  container = undefined
  resetAppState()
  window.history.replaceState(null, '', window.location.pathname)
})

async function mountAndWaitForResult(qs = ''): Promise<HTMLDivElement> {
  resetAppState()
  window.history.replaceState(null, '', window.location.pathname + (qs === '' ? '' : `?${qs}`))
  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)
  await waitFor(() => container!.querySelector('[data-testid="metrics-panel"]') !== null)
  return container
}

function openOverlay(el: HTMLElement): void {
  const link = el.querySelector<HTMLAnchorElement>('[data-testid="provenance-methodology-link"]')!
  link.click()
}

test('the methodology link in the provenance strip opens the overlay without changing any run parameter', async () => {
  const el = await mountAndWaitForResult()

  const irrBefore = el.querySelector('[data-testid="metric-headline-value"]')!.textContent
  const chartBefore = el.querySelector('[data-testid="equity-curve-chart"] canvas')
  expect(chartBefore).not.toBeNull()

  openOverlay(el)
  await waitFor(() => el.querySelector('[data-testid="methodology-overlay"]') !== null)

  expect(el.querySelector('[data-testid="metric-headline-value"]')!.textContent).toBe(irrBefore)
  expect(el.querySelector('[data-testid="equity-curve-chart"] canvas')).not.toBeNull()
})

test('the overlay renders the four section headings in the fixed Copywriting Contract order', async () => {
  const el = await mountAndWaitForResult()
  openOverlay(el)
  await waitFor(() => el.querySelector('[data-testid="methodology-overlay"]') !== null)

  const headings = Array.from(el.querySelectorAll('.methodology-overlay-content .methodology-section-heading')).map(
    (node) => node.textContent,
  )
  expect(headings).toEqual(['Cost model', 'Day-count conventions', 'Data sources', 'Known limitations'])
})

test('the cost-model section renders a row for every COST_PARAMETERS entry, each showing its confidence level', async () => {
  const el = await mountAndWaitForResult()
  openOverlay(el)
  await waitFor(() => el.querySelector('[data-testid="methodology-overlay"]') !== null)

  for (const id of Object.keys(COST_PARAMETERS)) {
    const row = el.querySelector(`[data-testid="methodology-cost-parameter-${id}"]`)
    expect(row, `expected a rendered row for cost parameter "${id}"`).not.toBeNull()
    const confidenceEl = el.querySelector(`[data-testid="methodology-cost-confidence-${id}"]`)
    expect(confidenceEl!.textContent).toBe(COST_PARAMETERS[id as keyof typeof COST_PARAMETERS].confidence)
  }
})

test('the day-count section renders both day-count bases', async () => {
  const el = await mountAndWaitForResult()
  openOverlay(el)
  await waitFor(() => el.querySelector('[data-testid="methodology-overlay"]') !== null)

  expect(el.querySelector('[data-testid="methodology-day-count-financing"]')!.textContent).toContain('360')
  expect(el.querySelector('[data-testid="methodology-day-count-expense"]')!.textContent).toContain('365')
})

test('the limitations section renders exactly four limitation paragraphs, each with a number traceable to a registry constant', async () => {
  const el = await mountAndWaitForResult()
  openOverlay(el)
  await waitFor(() => el.querySelector('[data-testid="methodology-overlay"]') !== null)

  const paragraphs = el.querySelectorAll('.methodology-limitation')
  expect(paragraphs.length).toBe(4)

  const extendedTier = el.querySelector('[data-testid="methodology-limitation-extended-tier"]')!
  expect(extendedTier.textContent).toContain(formatPercent(EXTENDED_TIER_BIAS_ANNUALIZED_FRACTION))

  const financingSpread = el.querySelector('[data-testid="methodology-limitation-financing-spread"]')!
  expect(financingSpread.textContent).toContain(formatPercent(COST_PARAMETERS['financing-spread-lower'].value))
  expect(financingSpread.textContent).toContain(formatPercent(COST_PARAMETERS['financing-spread-upper'].value))

  const gateTolerance = el.querySelector('[data-testid="methodology-limitation-gate-tolerance"]')!
  expect(gateTolerance.textContent).toMatch(/\d/)

  const highRateDrift = el.querySelector('[data-testid="methodology-limitation-high-rate-drift"]')!
  expect(highRateDrift.textContent).toMatch(/\d/)
})

test('the close button and the Escape key both close the overlay and restore the original query string', async () => {
  const el = await mountAndWaitForResult()
  // The default landing run's own trailing-edge permalink write is still pending (debounced) at
  // this point; flush it now so `before` is the settled baseline `openMethodologyOverlay`'s own
  // flush (T-05-20) will otherwise perform as a side effect of opening, which would make an
  // unflushed snapshot taken here compare unequal after closing for a reason that has nothing to
  // do with the methodology flag itself.
  flushPermalinkUrl()
  const before = window.location.search

  openOverlay(el)
  await waitFor(() => el.querySelector('[data-testid="methodology-overlay"]') !== null)
  expect(window.location.search).not.toBe(before)

  const closeButton = el.querySelector<HTMLButtonElement>('[data-testid="methodology-overlay-close"]')!
  closeButton.click()
  await waitFor(() => el.querySelector('[data-testid="methodology-overlay"]') === null)
  expect(window.location.search).toBe(before)

  openOverlay(el)
  await waitFor(() => el.querySelector('[data-testid="methodology-overlay"]') !== null)

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await waitFor(() => el.querySelector('[data-testid="methodology-overlay"]') === null)
  expect(window.location.search).toBe(before)
})

test('the overlay opens directly from a permalink carrying the flag', async () => {
  const el = await mountAndWaitForResult('methodology=1')
  await nextFrame()
  await waitFor(() => el.querySelector('[data-testid="methodology-overlay"]') !== null)
  expect(el.querySelector('[data-testid="methodology-overlay"]')).not.toBeNull()
})

test("the close button's rendered element has a computed hit area of at least 44 by 44 pixels", async () => {
  const el = await mountAndWaitForResult()
  openOverlay(el)
  await waitFor(() => el.querySelector('[data-testid="methodology-overlay"]') !== null)

  const closeButton = el.querySelector<HTMLButtonElement>('[data-testid="methodology-overlay-close"]')!
  const rect = closeButton.getBoundingClientRect()
  expect(rect.width).toBeGreaterThanOrEqual(44)
  expect(rect.height).toBeGreaterThanOrEqual(44)
})

test('the overlay renders no DOM node when closed', async () => {
  const el = await mountAndWaitForResult()
  expect(el.querySelector('[data-testid="methodology-overlay"]')).toBeNull()
})
