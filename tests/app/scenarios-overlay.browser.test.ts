/**
 * tests/app/scenarios-overlay.browser.test.ts
 *
 * 08-04-PLAN.md Task 3's full case list, mounted against the real app: SHARE-06's "one click from
 * the landing state, each a shareable permalink" proven end to end -- a real click, a real
 * decoded URL, a real resolved sweep grid, a real ExtendedTierWarning banner -- plus the two
 * UI-SPEC E2 backstop layout checks closed by measurement rather than left as notes.
 *
 * Mirrors `tests/app/methodology-overlay.browser.test.ts`'s open/close/Escape pattern,
 * `tests/app/permalink.browser.test.ts`'s trailing-edge-flush-then-decode pattern (the permalink
 * write is debounced 200ms; `flushPermalinkUrl()` performs the pending write synchronously rather
 * than waiting out the delay), `tests/app/sweep-controls.browser.test.ts`'s pattern for waiting on
 * a resolved sweep grid, and `tests/app/narrow-viewport.browser.test.ts`'s
 * scrollWidth-vs-clientWidth wrap-not-clip class of check.
 */

import { page } from 'vitest/browser'
import { afterEach, beforeEach, expect, test } from 'vitest'

import { mountApp } from '../../src/app/main.tsx'
import { BUNDLE_VERSION } from '../../src/data-bundle.generated.ts'
import { decodeParams } from '../../src/app/permalink.ts'
import { PRESET_DEFINITIONS, type PresetDefinition } from '../../src/app/presets.ts'
import {
  activeTier,
  backtestRequest,
  currentKernelInputs,
  displayedMetric,
  flushPermalinkUrl,
  resetAppState,
  resultMode,
  scaleMode,
  sweepGeneration,
  sweepGrid,
} from '../../src/app/state.ts'

const NARROW_VIEWPORT = { width: 320, height: 900 } as const
const DEFAULT_VIEWPORT = { width: 1280, height: 720 } as const

async function waitFor(predicate: () => boolean, timeoutMs = 20_000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('scenarios-overlay.browser.test: waitFor timed out waiting for a condition')
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

let container: HTMLDivElement | undefined
let disposeApp: (() => void) | undefined

// Same idiom every other tests/app/*.browser.test.ts file uses: the Vitest browser-mode iframe
// carries its own sessionId/iframeId query params, which the permalink decoder correctly rejects
// as unknown keys, so every mount starts from a clean query string unless a test sets one.
beforeEach(() => {
  window.history.replaceState(null, '', window.location.pathname)
})

afterEach(async () => {
  disposeApp?.()
  disposeApp = undefined
  container?.remove()
  container = undefined
  resetAppState()
  window.history.replaceState(null, '', window.location.pathname)
  await page.viewport(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height)
})

async function mountAndWaitForResult(): Promise<HTMLDivElement> {
  resetAppState()
  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)
  await waitFor(() => container!.querySelector('[data-testid="metrics-panel"]') !== null)
  return container
}

function presetById(id: string): PresetDefinition {
  const preset = PRESET_DEFINITIONS.find((p) => p.id === id)
  expect(preset, `expected a preset definition for "${id}"`).toBeDefined()
  return preset!
}

function presetCard(el: HTMLElement, id: string, scope = ''): HTMLButtonElement {
  const card = el.querySelector<HTMLButtonElement>(`${scope}[data-testid="preset-card"][data-preset-id="${id}"]`)
  expect(card, `expected a preset card for "${id}" (scope "${scope}")`).not.toBeNull()
  return card!
}

/** Opens the Scenarios overlay -- needed to reach any of the six non-featured presets (D-15
 * seats only 4 of the 10 in the always-visible featured row); every other preset is only ever
 * rendered inside the overlay's own `<For>`. */
async function openOverlay(el: HTMLElement): Promise<void> {
  const trigger = el.querySelector<HTMLButtonElement>('[data-testid="scenarios-trigger"]')!
  trigger.click()
  await waitFor(() => el.querySelector('[data-testid="scenarios-overlay"]') !== null)
}

// ---------------------------------------------------------------------------------------------
// The featured row: exactly 4 cards, in D-15's literal declaration order
// ---------------------------------------------------------------------------------------------

test("the featured row renders exactly 4 cards, in D-13/D-15's literal declaration order", async () => {
  const el = await mountAndWaitForResult()
  const row = el.querySelector('[data-testid="featured-preset-row"]')
  expect(row).not.toBeNull()
  const ids = Array.from(row!.querySelectorAll('[data-testid="preset-card"]')).map((card) =>
    card.getAttribute('data-preset-id'),
  )
  // Named as a literal expected array (not derived from PRESET_DEFINITIONS.filter here) so a
  // reordering of the featured set is a visible test diff, not a change this test silently
  // re-derives and passes regardless.
  expect(ids).toEqual(['tqqq-covid-crash', 'upro-covid-crash', 'spx-3x-2000-peak', 'upro-since-inception'])
})

// ---------------------------------------------------------------------------------------------
// Clicking a featured card: the result changes and the settled URL decodes to that preset
// ---------------------------------------------------------------------------------------------

test('clicking a featured card changes the on-screen result and, once the permalink write settles, produces a URL that decodes to that preset\'s parameter set, with bundleVersion from the live manifest', async () => {
  const el = await mountAndWaitForResult()
  const preset = presetById('tqqq-covid-crash')

  const card = presetCard(el, preset.id)
  card.click()

  await waitFor(() => currentKernelInputs()?.meta.seriesId.startsWith(`${preset.request.symbol}/`) === true)
  await waitFor(
    () =>
      backtestRequest().entryDate === preset.request.entryDate &&
      backtestRequest().holdingPeriodBars === preset.request.holdingPeriodBars,
  )
  expect(activeTier()).toBe(preset.tier)
  expect(scaleMode()).toBe(preset.scale)
  expect(resultMode()).toBe(preset.mode)
  expect(displayedMetric()).toBe(preset.metric)

  // Two frames past the recompute settling, past-the-debounce flush -- same discipline
  // permalink.browser.test.ts's own scenario tests use before reading window.location.
  await nextFrame()
  await nextFrame()
  flushPermalinkUrl()

  const decoded = decodeParams(new URLSearchParams(window.location.search))
  expect(decoded.status, decoded.status === 'error' ? decoded.error : decoded.status).toBe('ok')
  if (decoded.status !== 'ok') return

  expect(decoded.params.symbol).toBe(preset.request.symbol)
  expect(decoded.params.dividendReinvest).toBe(preset.request.dividendReinvest)
  expect(decoded.params.leverage).toBe(preset.request.leverage)
  expect(decoded.params.entryDate).toBe(preset.request.entryDate)
  expect(decoded.params.holdingPeriodBars).toBe(preset.request.holdingPeriodBars)
  expect(decoded.params.initialInvestment).toBe(preset.request.initialInvestment)
  expect(decoded.params.contributionAmount).toBe(preset.request.contributionAmount)
  expect(decoded.params.contributionFrequency).toBe(preset.request.contributionFrequency)
  expect(decoded.params.expenseRatioPercent).toBe(preset.request.expenseRatioPercent)
  expect(decoded.params.financingSpreadPercent).toBe(preset.request.financingSpreadPercent)
  expect(decoded.params.tier).toBe(preset.tier)
  expect(decoded.params.scale).toBe(preset.scale)
  expect(decoded.params.mode).toBe(preset.mode)
  expect(decoded.params.metric).toBe(preset.metric)
  // D-19: bundleVersion in the resulting URL is the LIVE BUNDLE_VERSION, never read from the
  // preset definition, which carries none.
  expect(decoded.params.bundleVersion).toBe(BUNDLE_VERSION)
})

// ---------------------------------------------------------------------------------------------
// The sweep-mode preset: opens the sweep, resolves a grid, carries mode=sweep, one sweep only
// ---------------------------------------------------------------------------------------------

test('clicking the sweep-mode preset switches the app into sweep mode, resolves a grid, carries the sweep mode key in the URL, and schedules exactly one sweep', async () => {
  const el = await mountAndWaitForResult()
  const preset = presetById('spx-3x-entry-sensitivity')
  expect(preset.mode).toBe('sweep')

  const generationBefore = sweepGeneration()
  // spx-3x-entry-sensitivity is not featured (D-15's four featured slots are all single-mode) --
  // reachable only from the overlay.
  await openOverlay(el)
  const card = presetCard(el, preset.id, '[data-testid="scenarios-overlay"] ')
  card.click()

  await waitFor(() => resultMode() === 'sweep')
  await waitFor(() => sweepGrid() !== null && sweepGrid()!.cols === 200 && sweepGrid()!.rows === 50, 30_000)

  // T-08-20/Task 1's skipSweep: exactly one sweep dispatched for the one click, not two.
  expect(sweepGeneration()).toBe(generationBefore + 1)

  await nextFrame()
  await nextFrame()
  flushPermalinkUrl()

  const decoded = decodeParams(new URLSearchParams(window.location.search))
  expect(decoded.status, decoded.status === 'error' ? decoded.error : decoded.status).toBe('ok')
  if (decoded.status !== 'ok') return
  expect(decoded.params.mode).toBe('sweep')
})

// ---------------------------------------------------------------------------------------------
// The Scenarios overlay: open, 10 cards, close by button and by Escape, absent from the DOM
// while closed
// ---------------------------------------------------------------------------------------------

test('the Scenarios trigger opens the overlay; the overlay renders every entry in the library; the close button and Escape key each close it; no overlay DOM exists while closed', async () => {
  const el = await mountAndWaitForResult()
  // The overlay-closed assertion checks that the element does not exist in the DOM, not merely
  // that it is hidden -- matching methodology-overlay.browser.test.ts's own discipline.
  expect(el.querySelector('[data-testid="scenarios-overlay"]')).toBeNull()

  await openOverlay(el)

  const cards = el.querySelectorAll('[data-testid="scenarios-overlay"] [data-testid="preset-card"]')
  expect(PRESET_DEFINITIONS.length).toBeGreaterThanOrEqual(8)
  expect(cards.length).toBe(PRESET_DEFINITIONS.length)

  const closeButton = el.querySelector<HTMLButtonElement>('[data-testid="scenarios-overlay-close"]')!
  closeButton.click()
  await waitFor(() => el.querySelector('[data-testid="scenarios-overlay"]') === null)
  expect(el.querySelector('[data-testid="scenarios-overlay"]')).toBeNull()

  await openOverlay(el)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await waitFor(() => el.querySelector('[data-testid="scenarios-overlay"]') === null)
  expect(el.querySelector('[data-testid="scenarios-overlay"]')).toBeNull()
})

test('applying a preset from inside the overlay closes the overlay and lands on the result', async () => {
  const el = await mountAndWaitForResult()
  await openOverlay(el)

  const preset = presetById('spx-3x-2010s')
  const card = presetCard(el, preset.id, '[data-testid="scenarios-overlay"] ')
  card.click()

  await waitFor(() => el.querySelector('[data-testid="scenarios-overlay"]') === null)
  await waitFor(
    () => backtestRequest().entryDate === preset.request.entryDate && backtestRequest().holdingPeriodBars === preset.request.holdingPeriodBars,
  )
  expect(el.querySelector('[data-testid="metrics-panel"]')).not.toBeNull()
})

// ---------------------------------------------------------------------------------------------
// Tags: extended-tier still shows the full ExtendedTierWarning banner; synthetic shows its tag
// ---------------------------------------------------------------------------------------------

test("the extended-tier preset's card shows the extended-tier tag, and applying it still shows the full ExtendedTierWarning banner on the result screen", async () => {
  const el = await mountAndWaitForResult()
  const preset = presetById('spx-3x-high-rate-1979')
  expect(preset.tags).toContain('extended-tier')

  // Not featured -- reachable only from the overlay.
  await openOverlay(el)
  const card = presetCard(el, preset.id, '[data-testid="scenarios-overlay"] ')
  const tagTexts = Array.from(card.querySelectorAll('.preset-card-tag')).map((t) => t.textContent)
  expect(tagTexts).toContain('Extended tier - interpolated data')

  card.click()
  await waitFor(
    () => backtestRequest().entryDate === preset.request.entryDate && backtestRequest().holdingPeriodBars === preset.request.holdingPeriodBars,
  )
  await waitFor(() => el.querySelector('[data-testid="extended-tier-warning"]') !== null)
  expect(activeTier()).toBe('extended')
})

test("the synthetic preset's card shows the synthetic tag", async () => {
  const el = await mountAndWaitForResult()
  const preset = presetById('ndx-3x-2000-peak')
  expect(preset.tags).toContain('synthetic')

  // Not featured -- reachable only from the overlay.
  await openOverlay(el)
  const card = presetCard(el, preset.id, '[data-testid="scenarios-overlay"] ')
  const tagTexts = Array.from(card.querySelectorAll('.preset-card-tag')).map((t) => t.textContent)
  expect(tagTexts).toContain('Synthetic 3x, not the real fund')
})

// ---------------------------------------------------------------------------------------------
// Backstop layout checks (UI-SPEC E2 overflow/long-text), closed by assertion, not left as notes
// ---------------------------------------------------------------------------------------------

test('backstop: the four-card featured row wraps to a narrower grid rather than overflowing horizontally below the app\'s existing 900px stacking breakpoint', async () => {
  await page.viewport(NARROW_VIEWPORT.width, NARROW_VIEWPORT.height)
  const el = await mountAndWaitForResult()

  const row = el.querySelector<HTMLElement>('[data-testid="featured-preset-row"]')!
  expect(
    row.scrollWidth,
    `featured row clips rather than wraps (scrollWidth ${row.scrollWidth} > clientWidth ${row.clientWidth})`,
  ).toBeLessThanOrEqual(row.clientWidth + 1)
})

test("backstop: at the narrowest supported viewport, the longest card in the set wraps within its cell rather than being clipped or forcing the cell wider, and the overlay's own scroll container is scrollable rather than clipping", async () => {
  await page.viewport(NARROW_VIEWPORT.width, NARROW_VIEWPORT.height)
  const el = await mountAndWaitForResult()

  await openOverlay(el)

  // spx-3x-high-rate-1979: the longest combination in the library -- a long title, the
  // extended-tier tag, and an outcome line together (08-UI-SPEC.md E2 long-text).
  const preset = presetById('spx-3x-high-rate-1979')
  const card = presetCard(el, preset.id, '[data-testid="scenarios-overlay"] ')

  expect(
    card.scrollWidth,
    `card clips rather than wraps (scrollWidth ${card.scrollWidth} > clientWidth ${card.clientWidth})`,
  ).toBeLessThanOrEqual(card.clientWidth + 1)
  expect(
    card.scrollHeight,
    `card clips rather than wraps (scrollHeight ${card.scrollHeight} > clientHeight ${card.clientHeight})`,
  ).toBeLessThanOrEqual(card.clientHeight + 1)

  // The overlay ROOT is the element that actually scrolls (`.scenarios-overlay` mirrors
  // `.methodology-overlay`'s own overflow-y: auto exactly, per this plan's own action text) --
  // asserted here against the real scrolling element rather than a child that merely holds the
  // content.
  const overlay = el.querySelector<HTMLElement>('[data-testid="scenarios-overlay"]')!
  const overflowY = window.getComputedStyle(overlay).overflowY
  expect(['auto', 'scroll'], `overlay computed overflow-y was "${overflowY}"`).toContain(overflowY)
  expect(overlay.scrollHeight).toBeGreaterThan(0)
})
