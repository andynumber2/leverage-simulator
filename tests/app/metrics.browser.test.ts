/**
 * tests/app/metrics.browser.test.ts
 *
 * 04-02-PLAN.md Task 3's full case list, mounted against the real app: the IRR headline label in
 * both the zero- and non-zero-contribution states, the CAGR qualifier and the IRR-equals-CAGR
 * note gated on contribution amount, the five fixed metric rows with the dropped-contributions
 * row absent on a non-ruined run, and a deliberately ruined run (leverage 20, chosen so a real
 * historical crash in the bundled SPX window genuinely reaches zero) rendering the ruin banner
 * above the retained metrics, painting the chart without throwing on the log scale, and reporting
 * an IRR of exactly -100.00%.
 */

import { afterEach, expect, test } from 'vitest'

import { mountApp } from '../../src/app/main.tsx'
import { currentDerivedMetrics, currentKernelInputs, currentKernelResult, updateBacktestRequest } from '../../src/app/state.ts'

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('metrics.browser.test: waitFor timed out waiting for a condition')
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
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

test('the headline slot is labelled IRR and the IRR-equals-CAGR note appears with zero contributions', async () => {
  const el = await mountAndWaitForResult()

  const headlineLabel = el.querySelector('[data-testid="metric-headline-label"]')
  expect(headlineLabel?.textContent).toBe('Annualized return (IRR)')

  const note = el.querySelector('[data-testid="irr-equals-cagr-note"]')
  expect(note).not.toBeNull()
  expect(note!.textContent).toMatch(/IRR equals CAGR for a single cash flow/)

  const qualifier = el.querySelector('[data-testid="cagr-qualifier"]')
  expect(qualifier).toBeNull()
})

test('the CAGR qualifier appears and the IRR-equals-CAGR note disappears once contributions are non-zero, and the headline stays labelled IRR', async () => {
  const el = await mountAndWaitForResult()

  updateBacktestRequest({ contributionAmount: 500, contributionFrequency: 'monthly' })
  await waitFor(() => el.querySelector('[data-testid="cagr-qualifier"]') !== null)

  const headlineLabel = el.querySelector('[data-testid="metric-headline-label"]')
  expect(headlineLabel?.textContent).toBe('Annualized return (IRR)')

  const qualifier = el.querySelector('[data-testid="cagr-qualifier"]')
  expect(qualifier!.textContent).toMatch(/CAGR is misleading with contributions - see IRR above/)

  const note = el.querySelector('[data-testid="irr-equals-cagr-note"]')
  expect(note).toBeNull()
})

test('the log/linear toggle renders both labels in the DOM at all times, and clicking switches the active scale without the chart throwing', async () => {
  const el = await mountAndWaitForResult()

  const logButton = el.querySelector<HTMLButtonElement>('[data-testid="log-scale-toggle-log"]')
  const linearButton = el.querySelector<HTMLButtonElement>('[data-testid="log-scale-toggle-linear"]')
  expect(logButton).not.toBeNull()
  expect(linearButton).not.toBeNull()
  expect(logButton!.textContent).toBe('log')
  expect(linearButton!.textContent).toBe('linear')
  expect(logButton!.getAttribute('aria-pressed')).toBe('true')

  linearButton!.click()
  await waitFor(() => logButton!.getAttribute('aria-pressed') === 'false')

  // Both labels remain in the DOM after the switch; only the active state changed.
  expect(el.querySelector('[data-testid="log-scale-toggle-log"]')).not.toBeNull()
  expect(el.querySelector('[data-testid="log-scale-toggle-linear"]')).not.toBeNull()
  expect(linearButton!.getAttribute('aria-pressed')).toBe('true')

  const canvas = el.querySelector('[data-testid="equity-curve-chart"] canvas')
  expect(canvas).not.toBeNull()
})

test('five metric rows render in the fixed order for a non-ruined run, and the dropped-contributions row is absent', async () => {
  const el = await mountAndWaitForResult()

  const result = currentKernelResult()
  expect(result).not.toBeNull()
  expect(result!.ruined).toBe(false)

  const testIds = [
    'metric-headline',
    'metric-cagr',
    'metric-max-drawdown',
    'metric-final-multiple',
  ]
  const rows = Array.from(el.querySelectorAll('.metrics-panel > .metric-row')).map((row) =>
    (row as HTMLElement).dataset.testid,
  )
  expect(rows).toEqual(testIds)

  expect(el.querySelector('[data-testid="metric-dropped-contributions"]')).toBeNull()
})

test('a deliberately ruined run renders the ruin banner above the retained metrics, paints without throwing on the log scale, and reports IRR -100.00%', async () => {
  const el = await mountAndWaitForResult()

  // Leverage 20 (the UI-SPEC's own stated maximum, E2) is chosen so a real historical single-day
  // crash inside the bundled SPX strict-tier window (e.g. 2008 or 2020) genuinely drives the
  // position to zero: any daily return at or below -5% ruins a 20x position.
  updateBacktestRequest({ leverage: 20 })
  await waitFor(() => currentKernelResult()?.ruined === true)

  const result = currentKernelResult()!
  expect(result.ruined).toBe(true)
  expect(result.ruinBarIndex).toBeGreaterThanOrEqual(0)

  await waitFor(() => el.querySelector('[data-testid="ruin-banner"]') !== null)

  const banner = el.querySelector('[data-testid="ruin-banner"]')
  const metricsPanel = el.querySelector('[data-testid="metrics-panel"]')
  expect(banner).not.toBeNull()
  expect(metricsPanel).not.toBeNull()

  // The banner precedes the (still-present, subordinate) metrics panel in document order.
  const position = banner!.compareDocumentPosition(metricsPanel!)
  expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

  // The chart painted without throwing: a canvas exists in the DOM.
  const canvas = el.querySelector('[data-testid="equity-curve-chart"] canvas')
  expect(canvas).not.toBeNull()

  // Pitfall 3 / acceptance criterion: for a ruined run, the chart's plotted y series (every bar
  // strictly before ruinBarIndex) contains no value equal to 0 -- the ruin bar's own clamped 0
  // never enters the log-distributed series.
  const inputs = currentKernelInputs()
  expect(inputs).not.toBeNull()
  for (let i = 0; i < result.ruinBarIndex; i++) {
    expect(inputs!.outputs.outValue[i]).not.toBe(0)
  }
  expect(inputs!.outputs.outValue[result.ruinBarIndex]).toBe(0)

  const metrics = currentDerivedMetrics()
  expect(metrics).not.toBeNull()
  expect(metrics!.irr).toBe(-1)

  const headlineValue = el.querySelector('[data-testid="metric-headline-value"]')
  expect(headlineValue?.textContent).toBe('-100.00%')
})
