/**
 * tests/app/permalink.browser.test.ts
 *
 * 04-07-PLAN.md Task 3's full case list, mounted against the real app: a golden permalink URL
 * loaded fresh reproduces the same rendered metric strings as driving the controls to the same
 * parameters; scrubbing the leverage slider updates the URL's `leverage` param, once flushed,
 * without growing `window.history.length` (D-03: `replaceState`, never `pushState`); a
 * `bundleVersion` mismatch renders the D-15 banner naming both versions while the chart and
 * metrics still render; a URL missing a required key renders the named decode explanation and no
 * chart; the Copy link button is disabled while the load status is `loading`; and, with clipboard
 * permission denied, the button shows its failure label and the permalink appears as selectable
 * text.
 *
 * Gap-closure fix (post-04-07, PERF-07 regression): the permalink write is now trailing-edge
 * debounced (`src/app/state.ts`'s `schedulePermalinkSync`/`flushPermalinkUrl`), not synchronous
 * with every coalesced recompute. Tests that assert URL state now call the exported
 * `flushPermalinkUrl()` explicitly rather than waiting extra animation frames, and one test below
 * asserts the coalescing directly: several recomputes across one scrub produce exactly one
 * `replaceState` call once flushed, not one per recompute.
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { BUNDLE_VERSION } from '../../src/data-bundle.generated.ts'
import { mountApp } from '../../src/app/main.tsx'
import { encodeParams, type PermalinkParams } from '../../src/app/permalink.ts'
import { backtestRequest, currentKernelResult, flushPermalinkUrl, resetAppState } from '../../src/app/state.ts'

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('permalink.browser.test: waitFor timed out waiting for a condition')
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

function setLocationSearch(qs: string): void {
  const suffix = qs === '' ? '' : `?${qs}`
  window.history.replaceState(null, '', window.location.pathname + suffix)
}

let container: HTMLDivElement | undefined
let disposeApp: (() => void) | undefined
let clipboardDescriptor: PropertyDescriptor | undefined

beforeEach(() => {
  // `navigator.clipboard` is captured (not touched) here so the failure test can restore it
  // exactly, regardless of which test runs it -- Chromium's own descriptor is otherwise shared
  // module/browser-context state.
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
})

afterEach(() => {
  disposeApp?.()
  disposeApp = undefined
  container?.remove()
  container = undefined
  if (clipboardDescriptor !== undefined) {
    Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
  }
  // D-13: `resetAppState` clears `permalinkApplied` (among other module singletons) so the next
  // test's `window.location.search` is genuinely re-decoded rather than a stale no-op.
  resetAppState()
  setLocationSearch('')
})

/** Resets every module singleton `state.ts` holds (bundle, permalink-applied guard, every
 * signal), sets `window.location.search` to `qs`, and mounts a fresh app into a fresh container --
 * the one path every scenario in this file needs, since each scenario boots from a DIFFERENT URL. */
async function mountFresh(qs: string): Promise<HTMLDivElement> {
  resetAppState()
  setLocationSearch(qs)
  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)
  return container
}

async function mountAndWaitForResult(qs: string): Promise<HTMLDivElement> {
  const el = await mountFresh(qs)
  await waitFor(() => el.querySelector('[data-testid="metrics-panel"]') !== null)
  return el
}

function readMetricStrings(el: HTMLElement): {
  irr: string | null
  cagr: string | null
  maxDrawdown: string | null
  finalMultiple: string | null
} {
  return {
    irr: el.querySelector('[data-testid="metric-headline-value"]')?.textContent ?? null,
    cagr: el.querySelector('[data-testid="metric-cagr-value"]')?.textContent ?? null,
    maxDrawdown: el.querySelector('[data-testid="metric-max-drawdown"] .metric-value')?.textContent ?? null,
    finalMultiple: el.querySelector('[data-testid="metric-final-multiple"] .metric-value')?.textContent ?? null,
  }
}

// A deliberately non-default scenario (leverage, entry date, a fixed holding period, and a
// monthly contribution all differ from DEFAULT_REQUEST), so reproducing it via a golden URL is a
// real test of the decode -> buildKernelInputs -> render path, not an accident of both mounts
// happening to already sit at the same defaults.
const SCENARIO_ENTRY_DATE = '2010-01-04'
const SCENARIO_LEVERAGE = '2.00'
const SCENARIO_HOLDING_PERIOD_BARS = 500
const SCENARIO_CONTRIBUTION_AMOUNT = 200

const SCENARIO_PERMALINK_PARAMS: PermalinkParams = {
  symbol: 'SPX',
  dividendReinvest: true,
  leverage: 2,
  entryDate: SCENARIO_ENTRY_DATE,
  holdingPeriodBars: SCENARIO_HOLDING_PERIOD_BARS,
  initialInvestment: 10_000,
  contributionAmount: SCENARIO_CONTRIBUTION_AMOUNT,
  contributionFrequency: 'monthly',
  expenseRatioPercent: 0.9,
  financingSpreadPercent: 0.5,
  holdMode: 'fixed',
  resolvedEndDate: '2011-12-30',
  tier: 'strict',
  scale: 'log',
  bundleVersion: BUNDLE_VERSION,
  // 07-06-PLAN.md Task 1: PermalinkParams' two new fields -- this scenario tests single-run
  // parameter round-tripping, unaffected by either.
  mode: 'single',
  metric: 'multiple',
}

/** Drives the real parameter controls (dispatching the exact DOM events each control's own
 * `onInput`/`onChange` listens for -- never `updateBacktestRequest` directly) to
 * `SCENARIO_PERMALINK_PARAMS`'s ten `BacktestRequest` fields, starting from the default landing
 * run a fresh empty-query mount produces. */
async function driveControlsToScenario(el: HTMLElement): Promise<void> {
  const slider = el.querySelector<HTMLInputElement>('[data-testid="leverage-slider"]')!
  slider.value = SCENARIO_LEVERAGE
  slider.dispatchEvent(new Event('input', { bubbles: true }))

  const dateInput = el.querySelector<HTMLInputElement>('[data-testid="entry-date-input"]')!
  dateInput.value = SCENARIO_ENTRY_DATE
  dateInput.dispatchEvent(new Event('change', { bubbles: true }))

  const fixedRadio = el.querySelector<HTMLInputElement>('[data-testid="holding-mode-fixed"]')!
  fixedRadio.click()
  await nextFrame()

  const barsInput = el.querySelector<HTMLInputElement>('[data-testid="holding-period-bars-input"]')!
  barsInput.value = String(SCENARIO_HOLDING_PERIOD_BARS)
  barsInput.dispatchEvent(new Event('input', { bubbles: true }))

  const amountInput = el.querySelector<HTMLInputElement>('[data-testid="contribution-amount-input"]')!
  amountInput.value = String(SCENARIO_CONTRIBUTION_AMOUNT)
  amountInput.dispatchEvent(new Event('input', { bubbles: true }))

  await waitFor(() => {
    const r = backtestRequest()
    return (
      r.leverage === 2 &&
      r.entryDate === SCENARIO_ENTRY_DATE &&
      r.holdingPeriodBars === SCENARIO_HOLDING_PERIOD_BARS &&
      r.contributionAmount === SCENARIO_CONTRIBUTION_AMOUNT &&
      r.contributionFrequency === 'monthly'
    )
  })
  await nextFrame()
  await nextFrame()
}

test('a golden permalink URL loaded fresh reproduces the same rendered metric strings as driving the controls to the same parameters', async () => {
  const driven = await mountAndWaitForResult('')
  await driveControlsToScenario(driven)
  const drivenMetrics = readMetricStrings(driven)

  disposeApp?.()
  disposeApp = undefined
  container?.remove()
  container = undefined

  const qs = encodeParams(SCENARIO_PERMALINK_PARAMS).toString()
  const golden = await mountAndWaitForResult(qs)
  const goldenMetrics = readMetricStrings(golden)

  expect(goldenMetrics).toEqual(drivenMetrics)
  expect(goldenMetrics.irr).not.toBeNull()
})

test('once flushed, the URL after a slider scrub carries the scrubbed leverage and window.history.length is unchanged across the scrub', async () => {
  const el = await mountAndWaitForResult('')
  const historyLengthBefore = window.history.length

  const slider = el.querySelector<HTMLInputElement>('[data-testid="leverage-slider"]')!
  const STEP_COUNT = 35
  let finalValue = '0.50'
  for (let i = 0; i < STEP_COUNT; i++) {
    finalValue = (0.5 + (i / STEP_COUNT) * 10).toFixed(2)
    slider.value = finalValue
    slider.dispatchEvent(new Event('input', { bubbles: true }))
  }

  await waitFor(() => backtestRequest().leverage === Number(finalValue))
  await nextFrame()
  await nextFrame()

  // Gap-closure fix: the write is trailing-edge debounced, not synchronous with the recompute --
  // this asserts the CONTRACT (the URL is correct once flushed), not the timing of the debounce
  // itself, which the coalescing test below covers directly.
  flushPermalinkUrl()

  expect(window.history.length).toBe(historyLengthBefore)

  const currentUrl = new URL(window.location.href)
  expect(currentUrl.searchParams.get('leverage')).toBe(Number(finalValue).toFixed(2))
})

test('a burst of updates spanning several coalesced recomputes produces exactly one replaceState call once flushed', async () => {
  const el = await mountAndWaitForResult('')
  // Clears any write pending from the initial default-landing-run recompute above, so the spy
  // below observes only what this test does.
  flushPermalinkUrl()

  const replaceStateSpy = vi.spyOn(window.history, 'replaceState')

  const slider = el.querySelector<HTMLInputElement>('[data-testid="leverage-slider"]')!
  const BURST_COUNT = 6
  for (let burst = 0; burst < BURST_COUNT; burst++) {
    const value = (0.5 + burst * 0.3).toFixed(2)
    slider.value = value
    slider.dispatchEvent(new Event('input', { bubbles: true }))
    // Lets THIS burst's rAF-coalesced recompute complete before the next burst fires, so the
    // sequence produces BURST_COUNT separate `storeSuccessfulRun` calls -- the same shape (many
    // recomputes across one continuous drag) that produced one `replaceState` call per recompute
    // before this fix (PERF-07a/07b: ~285 calls across a 300-step drag).
    // eslint-disable-next-line no-await-in-loop
    await nextFrame()
  }

  // Not yet flushed: each recompute above pushed the trailing-edge timer back out, so nothing has
  // been written to the address bar yet despite BURST_COUNT completed recomputes.
  expect(replaceStateSpy).not.toHaveBeenCalled()

  flushPermalinkUrl()

  expect(replaceStateSpy).toHaveBeenCalledTimes(1)

  replaceStateSpy.mockRestore()
})

test('a bundleVersion mismatch renders the D-15 banner naming both versions while the chart and metrics still render', async () => {
  const staleBundleVersion = '000000000000'
  const params: PermalinkParams = { ...SCENARIO_PERMALINK_PARAMS, bundleVersion: staleBundleVersion }
  const qs = encodeParams(params).toString()

  const el = await mountAndWaitForResult(qs)

  const banner = el.querySelector('[data-variant="bundle-mismatch"]')
  expect(banner).not.toBeNull()
  expect(banner!.textContent).toContain(staleBundleVersion)
  expect(banner!.textContent).toContain(BUNDLE_VERSION)

  expect(el.querySelector('[data-testid="equity-curve-chart"] canvas')).not.toBeNull()
  expect(el.querySelector('[data-testid="metrics-panel"]')).not.toBeNull()
})

test('a URL missing a required key renders the named decode explanation and no chart', async () => {
  const qs = new URLSearchParams(encodeParams(SCENARIO_PERMALINK_PARAMS).toString())
  qs.delete('symbol')

  const el = await mountFresh(qs.toString())
  await waitFor(() => el.querySelector('[data-variant="single-field-eviction"]') !== null)

  const explanation = el.querySelector('[data-variant="single-field-eviction"]')
  expect(explanation).not.toBeNull()
  expect(explanation!.textContent).toContain('symbol')

  expect(el.querySelector('[data-testid="equity-curve-chart"] canvas')).toBeNull()
  expect(el.querySelector('[data-testid="metrics-panel"]')).toBeNull()
})

test('the Copy link button is disabled while the load status is loading, and enabled once a result exists', async () => {
  const el = await mountFresh('')
  const button = el.querySelector<HTMLButtonElement>('[data-testid="copy-link-button"]')!

  // `loadStatus()` is synchronously 'loading' the instant `mountApp` returns -- the bundle fetch
  // has not resolved yet, so the button renders disabled with no window in which it could copy a
  // link to nothing (UI-SPEC E10 loading).
  expect(button.disabled).toBe(true)

  await waitFor(() => currentKernelResult() !== null)
  expect(button.disabled).toBe(false)
})

test('the Copy link button never resizes across its default, confirmation and failure states', async () => {
  const el = await mountAndWaitForResult('')
  const button = el.querySelector<HTMLButtonElement>('[data-testid="copy-link-button"]')!
  const defaultWidth = button.getBoundingClientRect().width

  const writtenValues: string[] = []
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (text: string) => { writtenValues.push(text); return Promise.resolve() } },
  })

  button.click()
  await waitFor(() => button.getAttribute('data-copy-state') === 'confirmed')
  expect(button.textContent).toMatch(/copied/i)
  expect(button.getBoundingClientRect().width).toBeCloseTo(defaultWidth, 0)
  expect(writtenValues).toEqual([window.location.href])

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: () => Promise.reject(new Error('permalink.browser.test: simulated permission denial')),
    },
  })

  button.click()
  await waitFor(() => button.getAttribute('data-copy-state') === 'failed')
  expect(button.textContent).toMatch(/failed/i)
  expect(button.getBoundingClientRect().width).toBeCloseTo(defaultWidth, 0)
})

test('with clipboard permission denied, the button shows its failure label and the permalink appears as selectable text', async () => {
  const el = await mountAndWaitForResult('')

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: () => Promise.reject(new Error('permalink.browser.test: simulated permission denial')),
    },
  })

  const button = el.querySelector<HTMLButtonElement>('[data-testid="copy-link-button"]')!
  const widthBefore = button.getBoundingClientRect().width

  button.click()
  await waitFor(() => button.getAttribute('data-copy-state') === 'failed')

  expect(button.textContent).toMatch(/failed/i)
  expect(button.getBoundingClientRect().width).toBeCloseTo(widthBefore, 0)

  const fallback = el.querySelector<HTMLInputElement>('[data-testid="copy-link-fallback"]')!
  expect(fallback).not.toBeNull()
  expect(fallback.value).toBe(window.location.href)
  expect(fallback.readOnly).toBe(true)
})
