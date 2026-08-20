/**
 * tests/app/provenance-strip.browser.test.ts
 *
 * Task 3: the strip is present inside the D-20 screenshot region on a default landing run; the
 * D-14 "Show all seams" disclosure reveals seam entries the active series carries outside the run
 * window (the default SPX/total-return landing run crosses zero of its two seams, both dated
 * before the strict tier's earliest date -- see 03-01-PLAN.md's D-14 tier-boundary computation --
 * so every entry the disclosure reveals is, by construction, one the collapsed strip never
 * showed); and the strip renders no field at all during the loading state (E9/UI-SPEC F3 empty:
 * hidden alongside the rest of the result column's loading treatment).
 */

import { afterEach, beforeEach, expect, test } from 'vitest'

import { mountApp } from '../../src/app/main.tsx'
import { resetAppState } from '../../src/app/state.ts'

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('provenance-strip.browser.test: waitFor timed out waiting for a condition')
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

let container: HTMLDivElement | undefined
let disposeApp: (() => void) | undefined

// Plan 04-07's iframe-harness-param note: clear the Vitest browser-mode iframe's own incidental
// query params before every mount, same as the other tests/app/*.browser.test.ts files.
beforeEach(() => {
  window.history.replaceState(null, '', window.location.pathname)
})

afterEach(() => {
  disposeApp?.()
  disposeApp = undefined
  container?.remove()
  container = undefined
})

async function mountAndWaitForStrip(): Promise<HTMLDivElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)
  await waitFor(() => container!.querySelector('[data-testid="provenance-strip"]') !== null)
  return container
}

test('the strip is present inside the screenshot region on a default landing run', async () => {
  const el = await mountAndWaitForStrip()

  const screenshotRegion = el.querySelector('[data-testid="screenshot-region"]')
  const strip = el.querySelector('[data-testid="provenance-strip"]')
  expect(screenshotRegion).not.toBeNull()
  expect(strip).not.toBeNull()
  expect(screenshotRegion!.contains(strip)).toBe(true)

  expect(el.querySelector('[data-testid="provenance-tier"]')?.textContent).toBe('Tier: Strict')
  expect(el.querySelector('[data-testid="provenance-date-range"]')?.textContent).toMatch(/^Data: \d{4}-\d{2}-\d{2}–\d{4}-\d{2}-\d{2}$/)
  expect(el.querySelector('[data-testid="provenance-sources"]')?.textContent).toMatch(/^Sources: .+/)
  expect(el.querySelector('[data-testid="provenance-bundle-version"]')?.textContent).toMatch(/^Bundle v[0-9a-f]{12}$/)
})

test('"Show all seams" reveals seam entries the collapsed strip never showed, for a series whose seams sit outside the run window', async () => {
  const el = await mountAndWaitForStrip()

  // D-14: the default landing run (SPX/total-return, strict tier) crosses zero seams, so the
  // seams-crossed field is omitted entirely -- nothing about SPX's two seams is visible yet.
  expect(el.querySelector('[data-testid="provenance-seams-crossed"]')).toBeNull()
  expect(el.querySelector('[data-testid="provenance-all-seams"]')).toBeNull()

  const disclosureButton = el.querySelector<HTMLButtonElement>('[data-testid="provenance-seam-disclosure"]')
  expect(disclosureButton).not.toBeNull()
  expect(disclosureButton!.textContent).toContain('Show all seams for SPX')

  disclosureButton!.click()
  await waitFor(() => el.querySelector('[data-testid="provenance-all-seams"]') !== null)

  const seamEntries = el.querySelectorAll('[data-testid="provenance-all-seams"] li')
  expect(seamEntries.length).toBeGreaterThanOrEqual(1)
})

test('the strip renders no field at all during the loading state', async () => {
  // `initializeApp` is idempotent and reuses an already-loaded bundle across mounts (state.ts);
  // clearing it forces this mount to genuinely start from `loadStatus() === 'loading'` rather than
  // reusing a prior test's cached, already-ready bundle.
  resetAppState()

  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)

  // Synchronously, right after mount and before the bundle fetch resolves: no provenance field of
  // any kind is present, matching the rest of the result column's loading treatment.
  expect(container.querySelector('[data-testid="provenance-strip"]')).toBeNull()
  expect(container.querySelector('[data-testid^="provenance-"]')).toBeNull()

  await waitFor(() => container!.querySelector('[data-testid="provenance-strip"]') !== null)
  expect(container.querySelector('[data-testid="provenance-tier"]')).not.toBeNull()
})
