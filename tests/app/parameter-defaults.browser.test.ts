/**
 * tests/app/parameter-defaults.browser.test.ts
 *
 * 05-08-PLAN.md Task 3's case list, mounted against the real app and the real committed bundle:
 * a cold arrival with no query string renders the default badge on all ten defaulted parameters
 * and no reset control; editing any one of them swaps that parameter's badge for a reset control
 * and leaves the other nine badges in place; clicking that reset restores the badge and the
 * parameter's value; resetting the entry date restores the manifest-resolved strict-tier earliest
 * date; typing an invalid value into a numeric control leaves the reset control enabled and
 * clicking it clears the invalid state; and the initial-investment control edits the value that
 * reaches the result.
 */

import { afterEach, beforeEach, expect, test } from 'vitest'

import { resolveEntryDateBounds } from '../../src/app/bounds.ts'
import { mountApp } from '../../src/app/main.tsx'
import type { ParameterId } from '../../src/app/parameter-defaults.ts'
import {
  backtestRequest,
  currentKernelInputs,
  currentKernelResult,
  DEFAULT_REQUEST,
  loadedBundle,
  resetAppState,
  updateBacktestRequest,
} from '../../src/app/state.ts'

const ALL_PARAMETER_IDS: ParameterId[] = [
  'leverage',
  'entryDate',
  'holdingMode',
  'initialInvestment',
  'contributionAmount',
  'contributionFrequency',
  'tier',
  'dividendMode',
  'expenseRatio',
  'financingSpread',
]

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('parameter-defaults.browser.test: waitFor timed out waiting for a condition')
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
  // `resetAppState` clears the bundle/tier/overlay signals but deliberately never touches the
  // `BacktestRequest` store (every other browser test file in this repo restores the specific
  // fields it mutated itself, per controls.browser.test.ts's own documented reasoning) -- this
  // file mutates every one of the ten defaulted parameters across its cases, so it restores the
  // whole store back to `DEFAULT_REQUEST` here rather than leaving that to each test.
  updateBacktestRequest({ ...DEFAULT_REQUEST })
  resetAppState()
  window.history.replaceState(null, '', window.location.pathname)
})

async function mountAndWaitForResult(): Promise<HTMLDivElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)
  await waitFor(() => container!.querySelector('[data-testid="metrics-panel"]') !== null)
  // A freshly mounted component's very first frame can still be settling module-level signals
  // left over from a previous test in this file (module-level state persists across mounts,
  // matching controls.browser.test.ts's own documented reasoning) -- two frames lets that
  // redundant recompute flush before a "before" baseline is captured.
  await nextFrame()
  await nextFrame()
  return container
}

function badge(el: HTMLElement, id: ParameterId): Element | null {
  return el.querySelector(`[data-testid="default-badge-${id}"]`)
}

function resetButton(el: HTMLElement, id: ParameterId): HTMLButtonElement | null {
  return el.querySelector<HTMLButtonElement>(`[data-testid="reset-button-${id}"]`)
}

test('a cold arrival with no query string renders the default badge on all ten defaulted parameters and no reset control', async () => {
  const el = await mountAndWaitForResult()

  for (const id of ALL_PARAMETER_IDS) {
    expect(badge(el, id), `expected a default badge for ${id}`).not.toBeNull()
    expect(resetButton(el, id), `expected no reset button for ${id}`).toBeNull()
  }
})

test('editing one parameter swaps that badge for a reset control and leaves the other nine badges in place', async () => {
  const el = await mountAndWaitForResult()

  updateBacktestRequest({ leverage: 5 })
  await waitFor(() => resetButton(el, 'leverage') !== null)

  expect(badge(el, 'leverage')).toBeNull()
  expect(resetButton(el, 'leverage')).not.toBeNull()

  for (const id of ALL_PARAMETER_IDS) {
    if (id === 'leverage') continue
    expect(badge(el, id), `expected ${id} to still read as default`).not.toBeNull()
    expect(resetButton(el, id), `expected ${id} to still have no reset button`).toBeNull()
  }
})

test('clicking reset restores the badge and the leverage value', async () => {
  const el = await mountAndWaitForResult()
  const before = backtestRequest().leverage

  updateBacktestRequest({ leverage: 7 })
  await waitFor(() => resetButton(el, 'leverage') !== null)

  resetButton(el, 'leverage')!.click()
  await waitFor(() => badge(el, 'leverage') !== null)

  expect(backtestRequest().leverage).toBe(before)
  expect(resetButton(el, 'leverage')).toBeNull()
})

test('resetting the entry date restores the manifest-resolved strict-tier earliest date', async () => {
  const el = await mountAndWaitForResult()

  updateBacktestRequest({ entryDate: '2015-01-30' })
  await waitFor(() => resetButton(el, 'entryDate') !== null)

  resetButton(el, 'entryDate')!.click()
  await waitFor(() => badge(el, 'entryDate') !== null)

  const bundle = loadedBundle()!
  const strict = resolveEntryDateBounds(bundle.manifest, backtestRequest().symbol, backtestRequest().dividendReinvest, 'strict')
  expect(strict.ok).toBe(true)
  if (strict.ok) {
    expect(backtestRequest().entryDate).toBe(strict.firstDate)
  }
})

test('typing an invalid leverage value leaves the reset control enabled and clicking it clears the invalid state', async () => {
  const el = await mountAndWaitForResult()

  // Off-default first (a valid edit), so the reset control is already present -- the rejected
  // keystroke below never reaches the store (UI-SPEC E2: out-of-range input is rejected outright,
  // not committed), so the control's own default-vs-off-default reading is unaffected by it.
  updateBacktestRequest({ leverage: 5 })
  await waitFor(() => resetButton(el, 'leverage') !== null)

  const readout = el.querySelector<HTMLInputElement>('[data-testid="leverage-readout"]')!
  readout.value = '25'
  readout.dispatchEvent(new Event('input', { bubbles: true }))
  await nextFrame()

  const error = el.querySelector('[data-testid="leverage-range-error"]')
  expect(error).not.toBeNull()

  const reset = resetButton(el, 'leverage')!
  expect(reset).not.toBeNull()
  expect(reset.disabled).toBe(false)

  reset.click()
  await waitFor(() => el.querySelector('[data-testid="leverage-range-error"]') === null)

  expect(el.querySelector('[data-testid="leverage-range-error"]')).toBeNull()
  expect(backtestRequest().leverage).toBe(DEFAULT_REQUEST.leverage)
  expect(badge(el, 'leverage')).not.toBeNull()
})

test('the initial-investment control edits the value that reaches the result', async () => {
  const el = await mountAndWaitForResult()

  const input = el.querySelector<HTMLInputElement>('[data-testid="initial-investment-input"]')!
  expect(input.value).toBe(String(backtestRequest().initialInvestment))

  input.value = '25000'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await waitFor(() => backtestRequest().initialInvestment === 25_000)

  await waitFor(() => currentKernelInputs()?.params.initialInvestment === 25_000)
  expect(currentKernelResult()).not.toBeNull()
  expect(resetButton(el, 'initialInvestment')).not.toBeNull()
  expect(badge(el, 'initialInvestment')).toBeNull()
})

test('a negative initial investment is rejected at the control with an inline message and does not reach the result', async () => {
  const el = await mountAndWaitForResult()
  const before = backtestRequest().initialInvestment

  const input = el.querySelector<HTMLInputElement>('[data-testid="initial-investment-input"]')!
  input.value = '-500'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await nextFrame()

  const error = el.querySelector('[data-testid="initial-investment-error"]')
  expect(error).not.toBeNull()
  expect(error!.textContent).toMatch(/zero or greater/)
  expect(backtestRequest().initialInvestment).toBe(before)
})

test('ParameterColumn renders InitialInvestmentControl before ContributionControl', async () => {
  const el = await mountAndWaitForResult()

  const column = el.querySelector('[data-testid="parameter-column"]')!
  const initialInvestment = column.querySelector('[data-testid="initial-investment-control"]')!
  const contribution = column.querySelector('[data-testid="contribution-control"]')!
  expect(initialInvestment).not.toBeNull()
  expect(contribution).not.toBeNull()

  const position = initialInvestment.compareDocumentPosition(contribution)
  // eslint-disable-next-line no-bitwise
  expect(Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
})
