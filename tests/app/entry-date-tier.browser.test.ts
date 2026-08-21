/**
 * tests/app/entry-date-tier.browser.test.ts
 *
 * 05-05-PLAN.md Task 3's case list, mounted against the real app and the real committed bundle:
 * on a default landing run the entry-date input's `min` follows the strict tier; selecting the
 * extended tier widens `min` to the extended tier's earlier start for a series whose extended
 * range genuinely starts earlier (SPX/total-return); the holding-mode control's stated end date
 * is resolved from the currently selected tier; the entry-date citation names the currently
 * selected tier; and for a series whose extended range starts on the same date as its strict
 * range (QQQ/total-return), selecting extended leaves the min bound unchanged while the extended
 * option stays selected and enabled.
 */

import { afterEach, beforeEach, expect, test } from 'vitest'

import { resolveEntryDateBounds } from '../../src/app/bounds.ts'
import { mountApp } from '../../src/app/main.tsx'
import { currentKernelInputs, loadedBundle, resetAppState, updateBacktestRequest } from '../../src/app/state.ts'

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('entry-date-tier.browser.test: waitFor timed out waiting for a condition')
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

async function mountAndWaitForResult(): Promise<HTMLDivElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)
  await waitFor(() => container!.querySelector('[data-testid="metrics-panel"]') !== null)
  return container
}

function selectExtendedTier(el: HTMLElement): void {
  const radio = el.querySelector<HTMLInputElement>('[data-testid="tier-radio-extended"]')!
  radio.click()
}

test('on a default landing run the entry-date input min equals the active series strict-tier earliest date', async () => {
  const el = await mountAndWaitForResult()

  const dateInput = el.querySelector<HTMLInputElement>('[data-testid="entry-date-input"]')!
  // SPX/total-return's strict-tier firstDate (D-09's original pin, unchanged by this plan).
  expect(dateInput.min).toBe('1988-01-05')
})

test('selecting the extended tier widens the entry-date min to the extended tier earliest date for a series whose extended range starts earlier', async () => {
  const el = await mountAndWaitForResult()

  const dateInput = el.querySelector<HTMLInputElement>('[data-testid="entry-date-input"]')!
  expect(dateInput.min).toBe('1988-01-05')

  selectExtendedTier(el)
  await waitFor(() => dateInput.min === '1927-12-30')
  expect(dateInput.min).toBe('1927-12-30')
})

test("the holding-mode control's stated end date is resolved from the currently selected tier", async () => {
  const el = await mountAndWaitForResult()

  const bundle = loadedBundle()!
  const strictExpected = resolveEntryDateBounds(bundle.manifest, 'SPX', true, 'strict')
  expect(strictExpected.ok).toBe(true)
  const openEndedOption = el.querySelector('[data-testid="holding-mode-open-ended"]')!.closest('label')!
  if (strictExpected.ok) {
    expect(openEndedOption.textContent).toContain(strictExpected.lastDate)
  }

  selectExtendedTier(el)
  await nextFrame()
  await nextFrame()

  const extendedExpected = resolveEntryDateBounds(bundle.manifest, 'SPX', true, 'extended')
  expect(extendedExpected.ok).toBe(true)
  if (extendedExpected.ok) {
    expect(openEndedOption.textContent).toContain(extendedExpected.lastDate)
  }
})

test('the entry-date citation text names the currently selected tier', async () => {
  const el = await mountAndWaitForResult()

  const citation = el.querySelector('[data-testid="entry-date-control"] [data-testid="source-citation"]')!
  expect(citation.textContent).toMatch(/strict tier/)

  selectExtendedTier(el)
  await waitFor(() => /extended tier/.test(citation.textContent ?? ''))
  expect(citation.textContent).toMatch(/extended tier/)
})

test('for a series whose extended range starts on the same date as its strict range, selecting extended leaves the min bound unchanged and stays selected and enabled', async () => {
  const el = await mountAndWaitForResult()

  // QQQ/total-return: strict and extended tiers both start 1999-03-10 (identical, unlike SPX).
  updateBacktestRequest({ symbol: 'QQQ', dividendReinvest: true, entryDate: '2015-01-30' })
  await waitFor(() => currentKernelInputs()?.meta.seriesId === 'QQQ/total-return')

  const dateInput = el.querySelector<HTMLInputElement>('[data-testid="entry-date-input"]')!
  const beforeMin = dateInput.min
  expect(beforeMin).toBe('1999-03-10')

  const extendedRadio = el.querySelector<HTMLInputElement>('[data-testid="tier-radio-extended"]')!
  extendedRadio.click()
  await nextFrame()
  await nextFrame()

  expect(dateInput.min).toBe(beforeMin)
  expect(extendedRadio.checked).toBe(true)
  expect(extendedRadio.disabled).toBe(false)
})
