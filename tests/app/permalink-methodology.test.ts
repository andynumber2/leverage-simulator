/**
 * tests/app/permalink-methodology.test.ts
 *
 * 05-07-PLAN.md Task 1: the `methodology` URL flag is read and stripped from a copy of
 * `window.location.search` before `decodeParams` ever sees it (T-05-17), and the overlay opens
 * independent of whether the remaining decode succeeds or fails (T-05-18). Runs in the Node
 * `unit` project -- `src/app/state.ts` only ever touches `window`/`document`/`fetch` inside
 * function bodies, never at module load, so a minimal in-memory stand-in for
 * `window.location`/`window.history` (no jsdom, no real DOM) is enough to exercise the boot-time
 * decode path and the methodology-flag URL writes without a browser.
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { encodeParams, type PermalinkParams } from '../../src/app/permalink.ts'
import {
  activeTier,
  backtestRequest,
  closeMethodologyOverlay,
  currentValidationError,
  initializeApp,
  methodologyOverlayOpen,
  openMethodologyOverlay,
  resetAppState,
  scaleMode,
} from '../../src/app/state.ts'

interface FakeWindow {
  location: { readonly search: string; readonly pathname: string; readonly hash: string; readonly href: string }
  history: { replaceState: (state: unknown, title: string, url: string) => void }
  addEventListener: () => void
  removeEventListener: () => void
}

/** A minimal in-memory stand-in for `window.location`/`window.history`: real enough that a
 * `history.replaceState` call is immediately readable back off `location.search`/`pathname`/
 * `hash`, the same round trip a real browser provides, without pulling in jsdom for a Node
 * project that otherwise has no DOM at all. */
function createFakeWindow(initialSearch: string): FakeWindow {
  let current = new URL(`http://localhost/${initialSearch === '' ? '' : `?${initialSearch}`}`)
  return {
    location: {
      get search() {
        return current.search
      },
      get pathname() {
        return current.pathname
      },
      get hash() {
        return current.hash
      },
      get href() {
        return current.href
      },
    },
    history: {
      replaceState(_state: unknown, _title: string, url: string) {
        current = new URL(url, current)
      },
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
}

/** `initializeApp` always resolves (a fetch failure is caught internally and turns into
 * `status: 'failed'`, never a thrown/rejected top-level promise) -- stubbed here so the boot path
 * never attempts a real network request from the Node `unit` project. `requestAnimationFrame` is
 * stubbed as a no-op too: a decoded `tier` seeds through `setActiveTier`, which schedules a
 * coalesced recompute the same way a live selection would (see `state.ts`'s own comment), but
 * this suite never loads a bundle for that scheduled callback to run against. */
function stubBrowserGlobalsForBoot(initialSearch: string): FakeWindow {
  const fakeWindow = createFakeWindow(initialSearch)
  vi.stubGlobal('window', fakeWindow)
  vi.stubGlobal('document', { addEventListener: () => {}, removeEventListener: () => {} })
  vi.stubGlobal('fetch', () => Promise.reject(new Error('permalink-methodology.test: no network in unit test')))
  vi.stubGlobal('requestAnimationFrame', () => 0)
  return fakeWindow
}

const VALID_PARAMS: PermalinkParams = {
  symbol: 'SPX',
  dividendReinvest: true,
  leverage: 3,
  entryDate: '1990-01-02',
  holdingPeriodBars: null,
  initialInvestment: 10_000,
  contributionAmount: 0,
  contributionFrequency: 'none',
  expenseRatioPercent: 0.9,
  financingSpreadPercent: 0.5,
  holdMode: 'end-of-data',
  resolvedEndDate: '2020-01-01',
  tier: 'strict',
  scale: 'log',
  bundleVersion: '0123456789ab',
  // 07-06-PLAN.md Task 1: PermalinkParams' two new fields -- this suite tests the methodology
  // overlay flag, unaffected by either.
  mode: 'single',
  metric: 'multiple',
}

function withMethodologyFlag(qs: string): string {
  const params = new URLSearchParams(qs)
  params.set('methodology', '1')
  return params.toString()
}

beforeEach(() => {
  resetAppState()
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetAppState()
})

test('a permalink with the flag plus a full valid run decodes every run parameter and opens the overlay', async () => {
  const qs = withMethodologyFlag(encodeParams(VALID_PARAMS).toString())
  stubBrowserGlobalsForBoot(qs)

  await initializeApp()

  expect(methodologyOverlayOpen()).toBe(true)
  expect(currentValidationError()).toBeNull()

  const request = backtestRequest()
  expect(request.symbol).toBe(VALID_PARAMS.symbol)
  expect(request.dividendReinvest).toBe(VALID_PARAMS.dividendReinvest)
  expect(request.leverage).toBe(VALID_PARAMS.leverage)
  expect(request.entryDate).toBe(VALID_PARAMS.entryDate)
  expect(request.holdingPeriodBars).toBe(VALID_PARAMS.holdingPeriodBars)
  expect(request.initialInvestment).toBe(VALID_PARAMS.initialInvestment)
  expect(request.contributionAmount).toBe(VALID_PARAMS.contributionAmount)
  expect(request.contributionFrequency).toBe(VALID_PARAMS.contributionFrequency)
  expect(request.expenseRatioPercent).toBe(VALID_PARAMS.expenseRatioPercent)
  expect(request.financingSpreadPercent).toBe(VALID_PARAMS.financingSpreadPercent)
  expect(activeTier()).toBe(VALID_PARAMS.tier)
  expect(scaleMode()).toBe(VALID_PARAMS.scale)
})

test('a flagged permalink carrying a full valid run decodes to the same parameters as the identical unflagged permalink', async () => {
  const baseQs = encodeParams(VALID_PARAMS).toString()

  stubBrowserGlobalsForBoot(baseQs)
  await initializeApp()
  const unflaggedRequest = { ...backtestRequest() }
  const unflaggedTier = activeTier()
  const unflaggedScale = scaleMode()
  expect(methodologyOverlayOpen()).toBe(false)

  vi.unstubAllGlobals()
  resetAppState()

  stubBrowserGlobalsForBoot(withMethodologyFlag(baseQs))
  await initializeApp()

  expect({ ...backtestRequest() }).toEqual(unflaggedRequest)
  expect(activeTier()).toBe(unflaggedTier)
  expect(scaleMode()).toBe(unflaggedScale)
  expect(methodologyOverlayOpen()).toBe(true)
})

test('a permalink with the flag plus an invalid run still produces the eviction and also opens the overlay', async () => {
  const params = new URLSearchParams(encodeParams(VALID_PARAMS).toString())
  params.delete('symbol')
  const qs = withMethodologyFlag(params.toString())
  stubBrowserGlobalsForBoot(qs)

  await initializeApp()

  expect(methodologyOverlayOpen()).toBe(true)
  expect(currentValidationError()).not.toBeNull()
  expect(currentValidationError()).toContain('symbol')
})

test('a permalink without the flag leaves the overlay closed', async () => {
  const qs = encodeParams(VALID_PARAMS).toString()
  stubBrowserGlobalsForBoot(qs)

  await initializeApp()

  expect(methodologyOverlayOpen()).toBe(false)
})

test('opening then closing the overlay leaves the query string byte-identical to what it was before opening', () => {
  const qs = encodeParams(VALID_PARAMS).toString()
  const fakeWindow = createFakeWindow(qs)
  vi.stubGlobal('window', fakeWindow)

  const before = fakeWindow.location.search

  openMethodologyOverlay()
  expect(fakeWindow.location.search).not.toBe(before)
  expect(new URLSearchParams(fakeWindow.location.search).get('methodology')).toBe('1')
  expect(methodologyOverlayOpen()).toBe(true)

  closeMethodologyOverlay()
  expect(fakeWindow.location.search).toBe(before)
  expect(methodologyOverlayOpen()).toBe(false)
})
