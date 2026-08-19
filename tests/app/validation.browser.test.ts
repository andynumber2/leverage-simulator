/**
 * tests/app/validation.browser.test.ts
 *
 * 04-05-PLAN.md Task 3's full case list: a fixed holding period deliberately longer than the
 * remaining data renders the D-10 caveat naming the limiting date while the chart and the metrics
 * panel both remain in the DOM; an evicted entry date (D-12) removes both and leaves only the
 * explanation; a state carrying both an eviction and a caveat renders both, in the fixed stacking
 * order, rather than one; the happy path renders no explanation element at all; a negative
 * contribution amount and a negative expense ratio are each rejected at their control with the
 * value unchanged; and clearing a cost field restores the imported default.
 *
 * The "both an eviction and a caveat" case is exercised by mounting `ValidationExplanation`
 * directly with a synthetic `variants` array (calling the component as a plain function rather
 * than through JSX, which this `.ts` file's loader does not transform) -- the two variants are
 * mutually exclusive from any single real `scheduleRun` outcome (an evicted entry date throws
 * before `buildKernelInputs` ever reaches the holding-period check), so this is the only way to
 * exercise the stacking order itself rather than an unreachable combination of app state.
 */

import { afterEach, expect, test } from 'vitest'
import { render } from 'solid-js/web'

import { mountApp } from '../../src/app/main.tsx'
import { ValidationExplanation, type ExplanationVariant } from '../../src/app/components/ResultColumn/ValidationExplanation.tsx'
import { buildKernelInputs } from '../../src/data/kernel-inputs.ts'
import { GENERIC_3X_EXPENSE_RATIO } from '../../src/validation/cost-parameters.ts'
import {
  backtestRequest,
  currentCaveatMessage,
  currentValidationError,
  loadedBundle,
  updateBacktestRequest,
} from '../../src/app/state.ts'

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('validation.browser.test: waitFor timed out waiting for a condition')
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
})

async function mountAndWaitForResult(): Promise<HTMLDivElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)
  await waitFor(() => container!.querySelector('[data-testid="metrics-panel"]') !== null)
  return container
}

test('the happy path renders no explanation element at all', async () => {
  const el = await mountAndWaitForResult()

  // The raw hold-to-today default legitimately carries D-29's rate-coverage caveat (a real,
  // permanent fact of this bundled data -- exercised in its own test below), so this asserts the
  // "absent by default" rendering behavior against a parameter state that genuinely has none of
  // the three variants active: a short fixed holding period, well inside every bound.
  const fixedRadio = el.querySelector<HTMLInputElement>('[data-testid="holding-mode-fixed"]')!
  fixedRadio.click()
  await waitFor(() => currentValidationError() === null && currentCaveatMessage() === null && backtestRequest().holdingPeriodBars !== null)

  expect(el.querySelectorAll('[data-testid="validation-explanation"]').length).toBe(0)
})

test('the raw hold-to-today default carries the D-29 rate-coverage caveat while the chart and metrics stay on screen', async () => {
  const el = await mountAndWaitForResult()

  // state.ts's request store is a module-level singleton that persists across tests in this file
  // (KNOWN HAZARD): an earlier test may have left holdingPeriodBars set to a fixed value, so this
  // explicitly returns to hold-to-today mode rather than relying on the module's original default.
  updateBacktestRequest({ holdingPeriodBars: null })
  await waitFor(() => currentCaveatMessage() !== null)
  expect(backtestRequest().holdingPeriodBars).toBeNull()

  const explanation = el.querySelector('[data-variant="cross-field-caveat"]')
  expect(explanation).not.toBeNull()
  expect(explanation!.textContent).toMatch(/runs past the last supported bar/)

  expect(currentValidationError()).toBeNull()
  expect(el.querySelector('[data-testid="equity-curve-chart"] canvas')).not.toBeNull()
  expect(el.querySelector('[data-testid="metrics-panel"]')).not.toBeNull()
})

test('a fixed holding period deliberately longer than the remaining data renders the caveat naming the limiting date while the chart and metrics panel both remain in the DOM', async () => {
  const el = await mountAndWaitForResult()

  const fixedRadio = el.querySelector<HTMLInputElement>('[data-testid="holding-mode-fixed"]')!
  fixedRadio.click()
  await nextFrame()

  const barsInput = el.querySelector<HTMLInputElement>('[data-testid="holding-period-bars-input"]')!
  barsInput.value = '100000'
  barsInput.dispatchEvent(new Event('input', { bubbles: true }))

  await waitFor(() => currentCaveatMessage() !== null)

  // The caveat's text is buildKernelInputs' own thrown message, compared against that message
  // directly rather than against a literal date.
  let expectedMessage = ''
  try {
    buildKernelInputs(loadedBundle()!, { ...backtestRequest(), holdingPeriodBars: 100_000 })
  } catch (err) {
    expectedMessage = err instanceof Error ? err.message : String(err)
  }
  expect(expectedMessage).not.toBe('')
  expect(currentCaveatMessage()).toBe(expectedMessage)

  const explanation = el.querySelector('[data-variant="cross-field-caveat"]')
  expect(explanation).not.toBeNull()
  expect(explanation!.textContent).toBe(expectedMessage)

  expect(currentValidationError()).toBeNull()
  expect(el.querySelector('[data-testid="equity-curve-chart"] canvas')).not.toBeNull()
  expect(el.querySelector('[data-testid="metrics-panel"]')).not.toBeNull()
})

test('an evicted entry date removes both the chart and the metrics panel and leaves only the explanation', async () => {
  const el = await mountAndWaitForResult()

  // SPX total return's strict tier starts 1988-01-05 (04-CONTEXT.md D-09); well before that is
  // out of range regardless of any other parameter.
  updateBacktestRequest({ entryDate: '1950-01-01' })
  await waitFor(() => currentValidationError() !== null)

  const explanation = el.querySelector('[data-variant="single-field-eviction"]')
  expect(explanation).not.toBeNull()

  expect(currentCaveatMessage()).toBeNull()
  expect(el.querySelector('[data-testid="equity-curve-chart"] canvas')).toBeNull()
  expect(el.querySelector('[data-testid="metrics-panel"]')).toBeNull()
})

test('a state carrying both an eviction and a caveat renders both, in the fixed stacking order, rather than one', () => {
  const variants: ExplanationVariant[] = [
    { kind: 'cross-field-caveat', message: 'a caveat message naming a limiting date' },
    { kind: 'single-field-eviction', message: 'an eviction message naming a bound' },
  ]

  const el = document.createElement('div')
  document.body.appendChild(el)
  // Calling the component directly (not via JSX, which this .ts file's loader does not
  // transform) rather than authoring `<ValidationExplanation variants={variants} />`.
  const dispose = render(() => ValidationExplanation({ variants }), el)

  const nodes = Array.from(el.querySelectorAll('[data-testid="validation-explanation"]'))
  expect(nodes.length).toBe(2)
  expect(nodes[0]!.getAttribute('data-variant')).toBe('single-field-eviction')
  expect(nodes[1]!.getAttribute('data-variant')).toBe('cross-field-caveat')

  dispose()
  el.remove()
})

test('a negative contribution amount is rejected at its control with the value unchanged', async () => {
  const el = await mountAndWaitForResult()
  const before = backtestRequest().contributionAmount

  const amountInput = el.querySelector<HTMLInputElement>('[data-testid="contribution-amount-input"]')!
  amountInput.value = '-500'
  amountInput.dispatchEvent(new Event('input', { bubbles: true }))
  await nextFrame()

  expect(backtestRequest().contributionAmount).toBe(before)
  const error = el.querySelector('[data-testid="contribution-amount-error"]')
  expect(error).not.toBeNull()
  expect(error!.textContent).toMatch(/zero or greater/)
})

test('a negative expense ratio is rejected at its control with the value unchanged', async () => {
  const el = await mountAndWaitForResult()
  const before = backtestRequest().expenseRatioPercent

  const input = el.querySelector<HTMLInputElement>('[data-testid="expense-ratio-input"]')!
  input.value = '-1'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await nextFrame()

  expect(backtestRequest().expenseRatioPercent).toBe(before)
  const error = el.querySelector('[data-testid="expense-ratio-error"]')
  expect(error).not.toBeNull()
  expect(error!.textContent).toMatch(/zero or greater/)
})

test('clearing a cost field restores the imported default', async () => {
  const el = await mountAndWaitForResult()
  const defaultPercent = GENERIC_3X_EXPENSE_RATIO * 100

  const input = el.querySelector<HTMLInputElement>('[data-testid="expense-ratio-input"]')!
  input.value = '2.50'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await waitFor(() => backtestRequest().expenseRatioPercent === 2.5)

  input.value = ''
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await waitFor(() => backtestRequest().expenseRatioPercent === defaultPercent)

  expect(backtestRequest().expenseRatioPercent).toBe(defaultPercent)
})
