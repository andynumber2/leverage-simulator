/**
 * tests/app/extended-tier-warning.browser.test.ts
 *
 * 05-06-PLAN.md Task 3: mounts the real app against the real committed bundle and asserts
 * `ExtendedTierWarning`'s F5 state coverage (05-UI-SPEC.md) -- absent on strict, present inside
 * the screenshot region on every extended-tier result, naming the bias direction with a real
 * measured magnitude, and carrying no dismiss/acknowledge affordance.
 */

import { afterEach, beforeEach, expect, test } from 'vitest'

import { mountApp } from '../../src/app/main.tsx'
import { resetAppState, updateBacktestRequest } from '../../src/app/state.ts'
import { EXTENDED_TIER_BIAS_ANNUALIZED_FRACTION } from '../../src/validation/extended-tier-bias.generated.ts'
import { formatPercent } from '../../src/metrics/format.ts'

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('extended-tier-warning.browser.test: waitFor timed out waiting for a condition')
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

let container: HTMLDivElement | undefined
let disposeApp: (() => void) | undefined

// Vitest browser-mode's iframe carries its own sessionId/iframeId query params, unrelated to the
// app; clear them back to a clean boot before every mount (same pattern as
// entry-date-tier.browser.test.ts, controls.browser.test.ts).
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

function selectStrictTier(el: HTMLElement): void {
  const radio = el.querySelector<HTMLInputElement>('[data-testid="tier-radio-strict"]')!
  radio.click()
}

test('the warning banner is absent from the DOM entirely on the strict (default) tier, no placeholder', async () => {
  const el = await mountAndWaitForResult()
  expect(el.querySelector('[data-testid="extended-tier-warning"]')).toBeNull()
})

test('selecting the extended tier renders the banner inside the screenshot region', async () => {
  const el = await mountAndWaitForResult()
  selectExtendedTier(el)
  await waitFor(() => el.querySelector('[data-testid="extended-tier-warning"]') !== null)

  const region = el.querySelector('[data-testid="screenshot-region"]')!
  const banner = el.querySelector('[data-testid="extended-tier-warning"]')!
  expect(region.contains(banner)).toBe(true)
})

test('switching back to strict removes the banner again, no residual footprint', async () => {
  const el = await mountAndWaitForResult()
  selectExtendedTier(el)
  await waitFor(() => el.querySelector('[data-testid="extended-tier-warning"]') !== null)

  selectStrictTier(el)
  await waitFor(() => el.querySelector('[data-testid="extended-tier-warning"]') === null)
  expect(el.querySelector('[data-testid="extended-tier-warning"]')).toBeNull()
})

test('the heading states the direction of the bias', async () => {
  const el = await mountAndWaitForResult()
  selectExtendedTier(el)
  await waitFor(() => el.querySelector('[data-testid="extended-tier-warning"]') !== null)

  const heading = el.querySelector('.extended-tier-warning-heading')!
  expect(heading.textContent).toBe('Extended tier understates volatility drag')
})

test('the body renders the committed formatted percentage, not an empty placeholder', async () => {
  const el = await mountAndWaitForResult()
  selectExtendedTier(el)
  await waitFor(() => el.querySelector('[data-testid="extended-tier-warning"]') !== null)

  const body = el.querySelector('.extended-tier-warning-body')!
  const expectedFigure = formatPercent(EXTENDED_TIER_BIAS_ANNUALIZED_FRACTION)
  expect(body.textContent).toContain(`${expectedFigure}/yr`)
  expect(body.textContent).not.toContain('undefined')
  expect(body.textContent).not.toContain('n/a')
})

test('the banner renders no button or dismiss control', async () => {
  const el = await mountAndWaitForResult()
  selectExtendedTier(el)
  await waitFor(() => el.querySelector('[data-testid="extended-tier-warning"]') !== null)

  const banner = el.querySelector('[data-testid="extended-tier-warning"]')!
  expect(banner.querySelector('button')).toBeNull()
  expect(banner.getAttribute('role')).toBe('status')
})

test('the banner renders again after a parameter change while still on the extended tier', async () => {
  const el = await mountAndWaitForResult()
  selectExtendedTier(el)
  await waitFor(() => el.querySelector('[data-testid="extended-tier-warning"]') !== null)

  updateBacktestRequest({ leverage: 4 })
  await waitFor(() => el.querySelector('[data-testid="metrics-panel"]') !== null)

  expect(el.querySelector('[data-testid="extended-tier-warning"]')).not.toBeNull()
  const heading = el.querySelector('.extended-tier-warning-heading')!
  expect(heading.textContent).toBe('Extended tier understates volatility drag')
})
