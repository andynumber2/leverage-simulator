/**
 * tests/app/controls.browser.test.ts
 *
 * 04-04-PLAN.md Task 3's full case list, mounted against the real app: selecting every bundled
 * symbol resolves a distinct series and repaints without throwing; the select's option order is
 * stable across mounts; the dividend toggle disables with a stated reason when a mode is missing
 * from the manifest; the NDX dividend-mode eviction clears the result and names the actual bound;
 * a partially typed date neither recomputes nor evicts; scrubbing the leverage slider coalesces
 * to one recompute per frame regardless of input-event count; an out-of-range leverage keystroke
 * is rejected at the control; clearing the leverage readout reverts to the last valid value on
 * blur; and every control in the parameter column is disabled while the load status is 'loading'.
 */

import { afterEach, expect, test, vi } from 'vitest'

import { MANIFEST_PATH } from '../../src/data-bundle.generated.ts'
import { mountApp } from '../../src/app/main.tsx'
import {
  backtestRequest,
  currentKernelInputs,
  currentKernelResult,
  currentValidationError,
  resetAppState,
  updateBacktestRequest,
} from '../../src/app/state.ts'

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('controls.browser.test: waitFor timed out waiting for a condition')
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

let container: HTMLDivElement | undefined
let disposeApp: (() => void) | undefined

afterEach(() => {
  disposeApp?.()
  disposeApp = undefined
  container?.remove()
  container = undefined
  performance.clearMeasures('app-recompute')
  vi.unstubAllGlobals()
})

async function mountAndWaitForResult(): Promise<HTMLDivElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)
  await waitFor(() => container!.querySelector('[data-testid="metrics-panel"]') !== null)
  return container
}

test('every control in the parameter column is disabled while the load status is loading', async () => {
  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)

  // loadStatus() is synchronously 'loading' the instant mountApp returns; the bundle fetch has
  // not resolved yet (it is genuinely asynchronous IO), so every control renders disabled.
  const select = container.querySelector<HTMLSelectElement>('[data-testid="symbol-select"]')
  const dividendToggle = container.querySelector<HTMLInputElement>('[data-testid="dividend-toggle"]')
  const dateInput = container.querySelector<HTMLInputElement>('[data-testid="entry-date-input"]')
  const slider = container.querySelector<HTMLInputElement>('[data-testid="leverage-slider"]')
  const readout = container.querySelector<HTMLInputElement>('[data-testid="leverage-readout"]')

  expect(select?.disabled).toBe(true)
  expect(dividendToggle?.disabled).toBe(true)
  expect(dateInput?.disabled).toBe(true)
  expect(slider?.disabled).toBe(true)
  expect(readout?.disabled).toBe(true)

  await waitFor(() => currentKernelResult() !== null)
  expect(select?.disabled).toBe(false)
})

test('selecting each of the eleven symbols in turn resolves a distinct meta.seriesId and repaints without throwing', async () => {
  const el = await mountAndWaitForResult()

  // Pick an entry date on/after every symbol's total-return strict-tier start (TQQQ, 2010-02-11,
  // is the latest of the eleven), so switching symbols alone never triggers a D-12 eviction here.
  updateBacktestRequest({ entryDate: '2015-01-30' })
  await waitFor(() => currentKernelInputs()?.window.firstDate === '2015-01-30')

  const select = el.querySelector<HTMLSelectElement>('[data-testid="symbol-select"]')!
  const options = Array.from(select.options).map((o) => o.value)
  expect(options.length).toBe(11)

  const seenSeriesIds = new Set<string>()
  for (const symbol of options) {
    select.value = symbol
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await waitFor(() => currentKernelInputs()?.meta.seriesId === `${symbol}/total-return`)
    seenSeriesIds.add(currentKernelInputs()!.meta.seriesId)
    expect(el.querySelector('[data-testid="equity-curve-chart"] canvas')).not.toBeNull()
  }
  expect(seenSeriesIds.size).toBe(11)
})

test("the select's option order is ascending and identical across two mounts", async () => {
  const first = await mountAndWaitForResult()
  const firstOptions = Array.from(
    first.querySelectorAll<HTMLOptionElement>('[data-testid="symbol-select"] option'),
  ).map((o) => o.value)
  expect(firstOptions).toEqual([...firstOptions].sort())
  expect(firstOptions.length).toBe(11)

  disposeApp?.()
  disposeApp = undefined
  container?.remove()
  container = undefined

  const second = await mountAndWaitForResult()
  const secondOptions = Array.from(
    second.querySelectorAll<HTMLOptionElement>('[data-testid="symbol-select"] option'),
  ).map((o) => o.value)

  expect(secondOptions).toEqual(firstOptions)
})

test('the dividend toggle is disabled with a stated reason for a symbol whose dividend mode is missing from the manifest', async () => {
  const originalFetch = window.fetch.bind(window)
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.endsWith(MANIFEST_PATH)) {
      const response = await originalFetch(input, init)
      const manifest = (await response.json()) as { series: Array<{ id: string }> }
      manifest.series = manifest.series.filter((s) => s.id !== 'SPX/price-return')
      return new Response(JSON.stringify(manifest), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return originalFetch(input, init)
  })

  // `initializeApp` reuses an already-loaded bundle, so without clearing it this mount would skip
  // the fetch entirely and never see the stub above -- the manifest would still carry
  // SPX/price-return and the toggle would correctly stay enabled, failing the assertion for a
  // reason that has nothing to do with what the test is checking.
  resetAppState()

  const el = await mountAndWaitForResult()

  // Module-level state in src/app/state.ts persists across tests within this file; force the
  // symbol back to SPX (whose price-return series this test's stub removed) rather than relying
  // on whatever a prior test left `backtestRequest().symbol` as.
  updateBacktestRequest({ symbol: 'SPX', dividendReinvest: true })
  await waitFor(() => currentKernelInputs()?.meta.seriesId === 'SPX/total-return')

  const toggle = el.querySelector<HTMLInputElement>('[data-testid="dividend-toggle"]')
  expect(toggle?.disabled).toBe(true)

  const citation = el.querySelector('[data-testid="symbol-control"] [data-testid="source-citation"]')
  expect(citation).not.toBeNull()
  expect(citation!.textContent).toMatch(/not available/i)
})

test('the NDX dividend-mode eviction clears the result and names 1999-03-04, with chart and metrics absent from the DOM', async () => {
  const el = await mountAndWaitForResult()

  updateBacktestRequest({ symbol: 'NDX', dividendReinvest: false, entryDate: '1990-01-02' })
  await waitFor(() => currentKernelInputs()?.meta.seriesId === 'NDX/price-return')

  updateBacktestRequest({ dividendReinvest: true })
  await waitFor(() => currentValidationError() !== null)

  const explanation = el.querySelector('[data-testid="validation-explanation"]')
  expect(explanation).not.toBeNull()
  expect(explanation!.textContent).toMatch(/1999-03-04/)

  expect(el.querySelector('[data-testid="equity-curve-chart"] canvas')).toBeNull()
  expect(el.querySelector('[data-testid="metrics-panel"]')).toBeNull()
})

test('a partially typed date does not recompute or evict', async () => {
  const el = await mountAndWaitForResult()

  const beforeResult = currentKernelResult()
  const beforeInputs = currentKernelInputs()

  const dateInput = el.querySelector<HTMLInputElement>('[data-testid="entry-date-input"]')!
  // A native date input fires `input` as the user types into a sub-field, but `.value` stays
  // empty until all three sub-fields are complete. This control only listens for `change`
  // (fires once a value is complete, or the field is cleared and blurred), so an `input` event
  // alone must not recompute or evict.
  dateInput.dispatchEvent(new Event('input', { bubbles: true }))
  await nextFrame()
  await nextFrame()

  expect(currentKernelResult()).toBe(beforeResult)
  expect(currentKernelInputs()).toBe(beforeInputs)
  expect(currentValidationError()).toBeNull()
})

test('dragging the leverage slider across its range issues at most one kernel run per animation frame', async () => {
  const el = await mountAndWaitForResult()
  const slider = el.querySelector<HTMLInputElement>('[data-testid="leverage-slider"]')!

  performance.clearMeasures('app-recompute')

  // Burst 1: 35 `input` events dispatched synchronously within one task, simulating a scrub
  // faster than the frame rate. All of them must coalesce into exactly one recompute (D-03),
  // never one recompute per event.
  for (let i = 0; i < 35; i++) {
    slider.value = (0.5 + (i / 35) * 19).toFixed(2)
    slider.dispatchEvent(new Event('input', { bubbles: true }))
  }
  await waitFor(() => performance.getEntriesByName('app-recompute', 'measure').length >= 1)
  await nextFrame()
  await nextFrame()
  expect(performance.getEntriesByName('app-recompute', 'measure').length).toBe(1)

  // Burst 2: a second synchronous burst in a later frame produces exactly one more recompute --
  // proving the count tracks frames, not the 70 total input events dispatched across both bursts.
  for (let i = 0; i < 35; i++) {
    slider.value = (0.5 + (i / 35) * 19).toFixed(2)
    slider.dispatchEvent(new Event('input', { bubbles: true }))
  }
  await waitFor(() => performance.getEntriesByName('app-recompute', 'measure').length >= 2)
  await nextFrame()
  await nextFrame()
  expect(performance.getEntriesByName('app-recompute', 'measure').length).toBe(2)
})

test('a leverage keystroke that would exceed 20 is rejected at the control and the value is unchanged', async () => {
  const el = await mountAndWaitForResult()

  const readout = el.querySelector<HTMLInputElement>('[data-testid="leverage-readout"]')!
  const before = backtestRequest().leverage

  readout.value = '25'
  readout.dispatchEvent(new Event('input', { bubbles: true }))
  await nextFrame()

  expect(backtestRequest().leverage).toBe(before)

  const error = el.querySelector('[data-testid="leverage-range-error"]')
  expect(error).not.toBeNull()
  expect(error!.textContent).toMatch(/20/)
})

test('clearing the leverage readout restores the last valid value on blur', async () => {
  const el = await mountAndWaitForResult()
  const readout = el.querySelector<HTMLInputElement>('[data-testid="leverage-readout"]')!
  const before = backtestRequest().leverage

  readout.value = ''
  readout.dispatchEvent(new Event('input', { bubbles: true }))
  readout.dispatchEvent(new Event('blur', { bubbles: true }))
  await nextFrame()

  expect(backtestRequest().leverage).toBe(before)
  expect(readout.value).toBe(before.toFixed(2))
})

test("the leverage readout element's computed font-family resolves to the monospace stack", async () => {
  const el = await mountAndWaitForResult()
  const readout = el.querySelector<HTMLInputElement>('[data-testid="leverage-readout"]')!

  const fontFamily = window.getComputedStyle(readout).fontFamily
  expect(fontFamily).toMatch(/ui-monospace|SFMono-Regular|Menlo|Consolas|monospace/i)
})
