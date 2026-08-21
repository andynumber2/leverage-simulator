/**
 * tests/app/validation-section.browser.test.ts
 *
 * 05-03-PLAN.md Task 2/Task 3: VALID-04's in-app validation view. The section renders with UPRO
 * selected by default and shows both D-11 headline figures; the rate-regime sub-window table
 * renders one row per regime including the post-2022 high-rate row, every row sharing an
 * identical class list (T-05-07); switching the fund selector replaces the headline figures and
 * every table row together (D-09's atomicity requirement, no mixed-fund state); and editing the
 * expense-ratio control in the parameter column moves the rendered tracking-error figure (D-10's
 * live cost pass-through).
 */

import { afterEach, beforeEach, expect, test } from 'vitest'

import { mountApp } from '../../src/app/main.tsx'

async function waitFor(predicate: () => boolean, timeoutMs = 10000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('validation-section.browser.test: waitFor timed out waiting for a condition')
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

let container: HTMLDivElement | undefined
let disposeApp: (() => void) | undefined

// Same harness-param clearing as tests/app/attribution.browser.test.ts (D-13): the Vitest
// browser-mode iframe carries its own sessionId/iframeId query params, which decodeParams would
// otherwise reject as unknown permalink keys.
beforeEach(() => {
  window.history.replaceState(null, '', window.location.pathname)
})

afterEach(() => {
  disposeApp?.()
  disposeApp = undefined
  container?.remove()
  container = undefined
})

async function mountAndWaitForValidation(): Promise<HTMLDivElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)
  await waitFor(() => container!.querySelector('[data-testid="tracking-error-summary"]') !== null)
  await waitFor(() => container!.querySelector('[data-testid="sub-window-table"]') !== null)
  await waitFor(() => container!.querySelector('[data-testid="screenshot-region"]') !== null)
  return container
}

function subWindowRows(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>('[data-testid="sub-window-row"]'))
}

test('the section renders with UPRO selected by default, outside the screenshot region, and shows both headline figures', async () => {
  const el = await mountAndWaitForValidation()

  const section = el.querySelector('[data-testid="validation-section"]')
  expect(section).not.toBeNull()
  expect(section!.getAttribute('id')).toBe('validation')

  const screenshotRegion = el.querySelector('[data-testid="screenshot-region"]')
  expect(screenshotRegion).not.toBeNull()
  expect(screenshotRegion!.contains(section)).toBe(false)

  const uproRadio = el.querySelector<HTMLInputElement>('[data-testid="fund-selector-upro"]')!
  expect(uproRadio.checked).toBe(true)

  const trackingErrorFigure = el.querySelector('[data-testid="tracking-error-figure"] .metric-value')
  const returnDriftFigure = el.querySelector('[data-testid="return-drift-figure"] .metric-value')
  expect(trackingErrorFigure?.textContent).toMatch(/^-?\d+\.\d{2}%$/)
  expect(returnDriftFigure?.textContent).toMatch(/^[+-]\d+\.\d{2}%$/)
})

test('the table renders one row per regime, including the high-rate regime, with figures as formatted percentages', async () => {
  const el = await mountAndWaitForValidation()

  const rows = subWindowRows(el)
  expect(rows.length).toBeGreaterThanOrEqual(1)

  const highRateRow = rows.find((row) => (row.textContent ?? '').includes('high-rate era'))
  expect(highRateRow).not.toBeUndefined()

  const figureValues = highRateRow!.querySelectorAll('.sub-window-row__figure-value')
  expect(figureValues.length).toBe(2)
  for (const value of Array.from(figureValues)) {
    expect(value.textContent).toMatch(/^[+-]?\d+\.\d{2}%$/)
  }
})

test('every rendered regime row element carries an identical class attribute value', async () => {
  const el = await mountAndWaitForValidation()

  const rows = subWindowRows(el)
  expect(rows.length).toBeGreaterThanOrEqual(1)

  const classLists = rows.map((row) => row.getAttribute('class'))
  const firstClassList = classLists[0]
  expect(firstClassList).not.toBeNull()
  for (const classList of classLists) {
    expect(classList).toBe(firstClassList)
  }
})

test('switching to TQQQ changes the headline figures and every table row together, with no mixed state', async () => {
  const el = await mountAndWaitForValidation()

  const subheadingBefore = el.querySelector('[data-testid="validation-subheading"]')?.textContent
  const trackingErrorBefore = el.querySelector('[data-testid="tracking-error-figure"] .metric-value')?.textContent
  const rowLabelsBefore = subWindowRows(el).map((row) => row.querySelector('.sub-window-row__label')?.textContent)
  expect(subheadingBefore).toContain('UPRO')
  expect(rowLabelsBefore.every((label) => (label ?? '').includes('UPRO'))).toBe(true)

  const tqqqRadio = el.querySelector<HTMLInputElement>('[data-testid="fund-selector-tqqq"]')!
  tqqqRadio.click()
  await waitFor(() => (el.querySelector('[data-testid="validation-subheading"]')?.textContent ?? '').includes('TQQQ'))
  await nextFrame()

  const subheadingAfter = el.querySelector('[data-testid="validation-subheading"]')?.textContent
  const trackingErrorAfter = el.querySelector('[data-testid="tracking-error-figure"] .metric-value')?.textContent
  const rowLabelsAfter = subWindowRows(el).map((row) => row.querySelector('.sub-window-row__label')?.textContent)

  expect(subheadingAfter).toContain('TQQQ')
  expect(subheadingAfter).not.toContain('UPRO')
  expect(trackingErrorAfter).not.toBe(trackingErrorBefore)
  expect(rowLabelsAfter.length).toBeGreaterThanOrEqual(1)
  // No mixed state: every row after the switch names TQQQ, never UPRO.
  expect(rowLabelsAfter.every((label) => (label ?? '').includes('TQQQ'))).toBe(true)
  expect(rowLabelsAfter.some((label) => (label ?? '').includes('UPRO'))).toBe(false)
})

test('editing the expense-ratio control in the parameter column changes the rendered tracking-error figure', async () => {
  const el = await mountAndWaitForValidation()

  const trackingErrorBefore = el.querySelector('[data-testid="tracking-error-figure"] .metric-value')?.textContent
  expect(trackingErrorBefore).not.toBeUndefined()

  const expenseRatioInput = el.querySelector<HTMLInputElement>('[data-testid="expense-ratio-input"]')!
  expenseRatioInput.value = '3.50'
  expenseRatioInput.dispatchEvent(new Event('input', { bubbles: true }))

  await waitFor(() => {
    const current = el.querySelector('[data-testid="tracking-error-figure"] .metric-value')?.textContent
    return current !== undefined && current !== trackingErrorBefore
  })

  const trackingErrorAfter = el.querySelector('[data-testid="tracking-error-figure"] .metric-value')?.textContent
  expect(trackingErrorAfter).not.toBe(trackingErrorBefore)
})
