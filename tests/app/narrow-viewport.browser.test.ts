/**
 * tests/app/narrow-viewport.browser.test.ts
 *
 * Converts phase 04's seven backstop UAT items (04-UAT.md, 04-VERIFICATION.md's
 * `human_verification` block) from held-out human judgment into mechanical assertions at a
 * 320px viewport. Every one of the seven is a text-wrap-versus-clip question, and overflow is
 * mechanically measurable without a human eye:
 *
 *  - No horizontal overflow of the page: `document.documentElement.scrollWidth` never exceeds
 *    the viewport width.
 *  - Containment: an element's `getBoundingClientRect()` sits within its container's rect (a
 *    taller element from wrapping is fine, a wider one is not).
 *  - Clipping: an element that clips rather than wraps has `scrollWidth > clientWidth` on
 *    itself -- this is the assertion that distinguishes "wrapped onto more lines" (correct) from
 *    "cut off" (the defect) `overflow-wrap`/`white-space` alone cannot tell apart from prose.
 *  - Screenshot-region integrity (D-20): the `[data-testid="screenshot-region"]` element still
 *    contains both the chart canvas and the metrics panel by rect containment, across every
 *    scenario below that reaches a completed run.
 *
 * `page.viewport` (from `vitest/browser`, the same import `tests/app/screenshot-region.browser.
 * test.ts` already uses) resizes the real test iframe, so `.app-layout`'s
 * `@media (min-width: 900px)` breakpoint (D-17) genuinely disengages at 320px, unlike resizing a
 * container element which CSS media queries do not respond to.
 *
 * Item 3 (longest symbol label) and item 5 (longest cost-control citation) derive "longest" from
 * the live manifest / rendered DOM at test time rather than hardcoding today's winner, so the
 * test keeps its meaning if the bundled universe or the cost-parameter wording changes later.
 */

import { page } from 'vitest/browser'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { MANIFEST_PATH } from '../../src/data-bundle.generated.ts'
import { mountApp } from '../../src/app/main.tsx'
import { dividendModesFor, listSymbols, resolveEntryDateBounds } from '../../src/app/bounds.ts'
import { encodeParams, type PermalinkParams } from '../../src/app/permalink.ts'
import {
  currentCaveatMessage,
  currentDerivedMetrics,
  currentKernelInputs,
  currentKernelResult,
  loadedBundle,
  resetAppState,
  updateBacktestRequest,
} from '../../src/app/state.ts'

const NARROW_VIEWPORT = { width: 320, height: 900 } as const
const DEFAULT_VIEWPORT = { width: 1280, height: 720 } as const

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('narrow-viewport.browser.test: waitFor timed out waiting for a condition')
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
// carries its own sessionId/iframeId query params, which the permalink decoder correctly
// rejects as unknown keys, so every mount starts from a clean query string unless a test sets
// one deliberately.
beforeEach(() => {
  window.history.replaceState(null, '', window.location.pathname)
})

afterEach(async () => {
  disposeApp?.()
  disposeApp = undefined
  container?.remove()
  container = undefined
  resetAppState()
  // `resetAppState` clears the bundle and every derived signal but -- like every other
  // tests/app/*.browser.test.ts file's own "KNOWN HAZARD" comments note -- NOT the
  // `BacktestRequest` store itself, which is a module-level singleton that persists across tests
  // in this file. A scenario that lands on a symbol/entryDate/holdingPeriodBars combination
  // invalid for a DIFFERENT symbol (e.g. an entry date before that symbol's own strict-tier
  // start) would otherwise evict the very next test's first mount before it ever produces a
  // metrics panel, hanging that test's own `waitFor` for the full timeout regardless of what
  // that test is actually about. Restoring a baseline every bundled symbol's strict tier covers,
  // unconditionally, after every test (not only the tests that intentionally mutate it) makes
  // each test's isolation independent of whether a PRIOR test passed, failed, or threw midway.
  updateBacktestRequest({
    symbol: 'SPX',
    dividendReinvest: true,
    entryDate: '2015-01-30',
    holdingPeriodBars: null,
    leverage: 3,
  })
  vi.unstubAllGlobals()
  performance.clearMarks('app-data-ready')
  performance.clearMarks('app-interactive')
  performance.clearMeasures('app-recompute')
  await page.viewport(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height)
})

async function mountAndWaitForMetrics(): Promise<HTMLDivElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)
  await waitFor(() => container!.querySelector('[data-testid="metrics-panel"]') !== null)
  return container
}

// ---------------------------------------------------------------------------------------------
// Shared overflow/containment/clipping assertions
// ---------------------------------------------------------------------------------------------

/** No horizontal scrollbar at the page level -- the single strongest, cheapest overflow check,
 * and the one that covers most of the seven cases regardless of which element caused it. 1px
 * tolerance for sub-pixel layout rounding, same tolerance screenshot-region.browser.test.ts
 * uses for rect containment. */
function assertNoPageOverflow(label: string): void {
  expect(
    document.documentElement.scrollWidth,
    `${label}: page scrollWidth (${document.documentElement.scrollWidth}) exceeds the ${NARROW_VIEWPORT.width}px viewport -- something is overflowing horizontally`,
  ).toBeLessThanOrEqual(NARROW_VIEWPORT.width + 1)
}

/** Clipping vs wrapping: an element whose content needed more width than its own box has
 * `scrollWidth > clientWidth`, regardless of whether that overflow is visually hidden
 * (`overflow: hidden`) or spilling out (`overflow: visible`, this app's default everywhere) --
 * either way, content required more width than the box actually has, which is the "cut off
 * rather than wrapped" defect this task exists to catch. */
function assertWrapsNotClips(el: Element | null, label: string): void {
  expect(el, `${label}: element not found in the DOM`).not.toBeNull()
  const e = el as HTMLElement
  expect(
    e.scrollWidth,
    `${label}: clips rather than wraps (scrollWidth ${e.scrollWidth} > clientWidth ${e.clientWidth}, text "${e.textContent}")`,
  ).toBeLessThanOrEqual(e.clientWidth + 1)
}

/** `child`'s bounding rect sits fully inside `region`'s, 1px tolerance -- same assertion and
 * tolerance as screenshot-region.browser.test.ts's assertContained, reused here rather than
 * duplicated with different numbers. */
function assertContainedWithin(region: DOMRect, child: Element | null, label: string): void {
  expect(child, `${label}: not found in the DOM`).not.toBeNull()
  const rect = child!.getBoundingClientRect()
  expect(
    rect.left,
    `${label}'s left edge (${rect.left}) is outside the containing region's (${region.left})`,
  ).toBeGreaterThanOrEqual(region.left - 1)
  expect(
    rect.right,
    `${label}'s right edge (${rect.right}) is outside the containing region's (${region.right})`,
  ).toBeLessThanOrEqual(region.right + 1)
  expect(
    rect.top,
    `${label}'s top edge (${rect.top}) is outside the containing region's (${region.top})`,
  ).toBeGreaterThanOrEqual(region.top - 1)
  expect(
    rect.bottom,
    `${label}'s bottom edge (${rect.bottom}) is outside the containing region's (${region.bottom})`,
  ).toBeLessThanOrEqual(region.bottom + 1)
}

/** D-20/item 7: the screenshot region still contains the chart canvas and the metrics panel
 * (plus the ruin banner, when the scenario produced one) -- the real requirement behind UAT
 * items 1, 6 and 7. */
function assertScreenshotRegionSelfContained(root: HTMLElement, expectRuinBanner: boolean): void {
  const region = root.querySelector('[data-testid="screenshot-region"]')
  expect(region, 'screenshot-region not found').not.toBeNull()
  const regionRect = region!.getBoundingClientRect()

  assertContainedWithin(regionRect, root.querySelector('[data-testid="equity-curve-chart"] canvas'), 'the chart canvas')
  assertContainedWithin(regionRect, root.querySelector('[data-testid="metrics-panel"]'), 'the metrics panel')

  if (expectRuinBanner) {
    assertContainedWithin(regionRect, root.querySelector('[data-testid="ruin-banner"]'), 'the ruin banner')
  }
}

/** Rendered line count from the box's own height against its computed line-height -- how "at
 * most two lines" (UI-SPEC E5's citation reflow requirement) is measured mechanically rather
 * than eyeballed. `.source-citation`'s CSS sets `line-height: 1.4` explicitly, so
 * getComputedStyle resolves it to a pixel value here, not the keyword `normal`. */
function lineCount(el: Element): number {
  const style = window.getComputedStyle(el)
  const lineHeightPx = Number.parseFloat(style.lineHeight)
  const rect = el.getBoundingClientRect()
  if (!Number.isFinite(lineHeightPx) || lineHeightPx <= 0) return 1
  return Math.round(rect.height / lineHeightPx)
}

// ---------------------------------------------------------------------------------------------
// 1. IRR headline / CAGR secondary at 320px (UI-SPEC E7 overflow, 04-02 backstop)
// ---------------------------------------------------------------------------------------------

// Empirically, every bundled symbol -- including TLT (bonds) and the broad-market ETFs, not
// just SPX and the already-leveraged funds -- has at least one real historical day whose
// single-day return crosses the -1/20 = -5% ruin threshold somewhere across its full bundled
// history, so a literal 20x-over-full-history run ruins for the ENTIRE bundled universe (this
// was verified by first writing this test against a straight 20x sweep, which failed with "no
// bundled symbol survives" for every symbol; the leverage sweep below is that finding's fix,
// not an assumption). UI-SPEC E7's actual concern is the widest metric STRING the app can
// render without ruining, not literally the number 20, so this descends through decreasing
// leverage per symbol until it finds the highest leverage that symbol survives at over its full
// history, then picks the overall widest non-ruined CAGR across every symbol that way.
const LEVERAGE_CANDIDATES = [20, 15, 10, 7, 5, 3] as const

test('1. the 28px IRR headline never wraps or clips, and a wrapping CAGR secondary metric does not push the panel out of the screenshot region, at 320px for the widest non-ruined run the bundled universe produces', async () => {
  await page.viewport(NARROW_VIEWPORT.width, NARROW_VIEWPORT.height)
  const el = await mountAndWaitForMetrics()

  const bundle = loadedBundle()
  expect(bundle, 'bundle failed to load').not.toBeNull()
  const symbols = listSymbols(bundle!.manifest)
  expect(symbols.length).toBeGreaterThan(0)

  // solveIrr's bracket is [-0.9999, 10.0] (src/metrics/irr.ts): the IRR headline's own string
  // width is bounded by construction and can never be "the widest" metric. CAGR
  // (src/metrics/cagr.ts) has no such bracket and is routed through the same unbounded
  // formatPercent as IRR -- for a symbol/leverage combination that survives its full bundled
  // history without ruining, decades of daily-rebalanced compounding can drive CAGR's magnitude
  // (and therefore its rendered string width) arbitrarily high. That is the real overflow risk
  // UI-SPEC E7 names ("a wrapping secondary metric"), so this derives the run that maximizes
  // |CAGR| among every bundled symbol at the highest leverage IT survives, rather than assuming
  // which symbol or leverage wins.
  let best: { symbol: string; dividendReinvest: boolean; entryDate: string; leverage: number; cagrMagnitude: number } | null =
    null

  for (const symbol of symbols) {
    const modes = dividendModesFor(bundle!.manifest, symbol)
    const dividendReinvest = modes.totalReturn ? true : modes.priceReturn ? false : null
    if (dividendReinvest === null) continue
    const bounds = resolveEntryDateBounds(bundle!.manifest, symbol, dividendReinvest, 'strict')
    if (!bounds.ok) continue
    const seriesId = `${symbol}/${dividendReinvest ? 'total-return' : 'price-return'}`

    for (const leverage of LEVERAGE_CANDIDATES) {
      updateBacktestRequest({
        symbol,
        dividendReinvest,
        entryDate: bounds.firstDate,
        holdingPeriodBars: null,
        leverage,
      })
      // Waits on `params.leverage` too, not just seriesId/firstDate: those two stay identical
      // across every leverage in this inner loop for the same symbol, so a predicate that only
      // checked them would be satisfied immediately by the PREVIOUS leverage's already-settled
      // result -- before the coalesced recompute this `updateBacktestRequest` call just
      // triggered has actually run (D-03: the recompute is rAF-coalesced, not synchronous).
      // eslint-disable-next-line no-await-in-loop
      await waitFor(
        () =>
          currentKernelInputs()?.meta.seriesId === seriesId &&
          currentKernelInputs()?.window.firstDate === bounds.firstDate &&
          currentKernelInputs()?.params.leverage === leverage &&
          currentKernelResult() !== null,
      )

      const result = currentKernelResult()
      const metrics = currentDerivedMetrics()
      if (result === null || metrics === null || result.ruined) continue

      // This symbol's highest surviving leverage: record it and stop descending further for
      // this symbol (a lower leverage on the same symbol only ever compounds LESS extremely).
      const cagrMagnitude = metrics.cagr === null ? 0 : Math.abs(metrics.cagr)
      if (best === null || cagrMagnitude > best.cagrMagnitude) {
        best = { symbol, dividendReinvest, entryDate: bounds.firstDate, leverage, cagrMagnitude }
      }
      break
    }
  }

  expect(
    best,
    'no bundled symbol survives ANY leverage in [3, 5, 7, 10, 15, 20] over its full history without ruining -- see report',
  ).not.toBeNull()

  updateBacktestRequest({
    symbol: best!.symbol,
    dividendReinvest: best!.dividendReinvest,
    entryDate: best!.entryDate,
    holdingPeriodBars: null,
    leverage: best!.leverage,
  })
  const winningSeriesId = `${best!.symbol}/${best!.dividendReinvest ? 'total-return' : 'price-return'}`
  await waitFor(() => currentKernelInputs()?.meta.seriesId === winningSeriesId && currentKernelResult()?.ruined === false)
  await nextFrame()
  await nextFrame()

  assertWrapsNotClips(el.querySelector('[data-testid="metric-headline-value"]'), 'the IRR headline value')
  assertWrapsNotClips(el.querySelector('[data-testid="metric-cagr-value"]'), 'the CAGR secondary value')
  assertScreenshotRegionSelfContained(el, false)
  assertNoPageOverflow('scenario 1')
})

// ---------------------------------------------------------------------------------------------
// 2. Ruin banner at 320px (UI-SPEC E8 overflow, 04-02 backstop)
// ---------------------------------------------------------------------------------------------

test('2. the ruin banner wraps rather than clips its interpolated ISO ruin date at 320px', async () => {
  await page.viewport(NARROW_VIEWPORT.width, NARROW_VIEWPORT.height)
  const el = await mountAndWaitForMetrics()

  // Leverage 20 on the default landing run (SPX, open-ended, full bundled history): the same
  // real historical single-day crash (2008 or 2020) tests/app/metrics.browser.test.ts and
  // tests/app/screenshot-region.browser.test.ts already rely on to genuinely ruin a 20x
  // position, rather than a synthetic ruin.
  updateBacktestRequest({ leverage: 20 })
  await waitFor(() => currentKernelResult()?.ruined === true)
  await waitFor(() => el.querySelector('[data-testid="ruin-banner"]') !== null)

  const banner = el.querySelector('[data-testid="ruin-banner"]')
  expect(banner!.textContent, 'ruin banner does not contain an ISO date').toMatch(/\d{4}-\d{2}-\d{2}/)

  assertWrapsNotClips(banner, 'the ruin banner')
  assertScreenshotRegionSelfContained(el, true)
  assertNoPageOverflow('scenario 2')
})

// ---------------------------------------------------------------------------------------------
// 3. Longest symbol label vs the parameter column at 320px (UI-SPEC E1 overflow, 04-04 backstop)
// ---------------------------------------------------------------------------------------------

test('3. the longest bundled symbol label does not force the parameter column or the select control wider than the 320px viewport', async () => {
  await page.viewport(NARROW_VIEWPORT.width, NARROW_VIEWPORT.height)
  const el = await mountAndWaitForMetrics()

  const bundle = loadedBundle()
  expect(bundle, 'bundle failed to load').not.toBeNull()
  const symbols = listSymbols(bundle!.manifest)
  expect(symbols.length).toBeGreaterThan(0)
  // Derived from the live manifest, not hardcoded: whichever symbol is longest today or after
  // the bundled universe changes.
  const longest = symbols.reduce((a, b) => (b.length > a.length ? b : a))

  const select = el.querySelector<HTMLSelectElement>('[data-testid="symbol-select"]')!
  select.value = longest
  select.dispatchEvent(new Event('change', { bubbles: true }))
  await waitFor(() => select.value === longest)
  await nextFrame()

  // A native <select> with no explicit width sizes to fit its content by default in some
  // browsers; .parameter-column only becomes a fixed 280px box at >=900px (styles.css's
  // `@media (min-width: 900px)`), so at 320px this checks the select and the column stay inside
  // the actual viewport rather than assuming the desktop fixed-width rule applies here too.
  assertWrapsNotClips(select, 'the symbol select')

  const parameterColumn = el.querySelector('[data-testid="parameter-column"]')!
  const columnRect = parameterColumn.getBoundingClientRect()
  expect(
    columnRect.right,
    `parameter column's right edge (${columnRect.right}) exceeds the ${NARROW_VIEWPORT.width}px viewport`,
  ).toBeLessThanOrEqual(NARROW_VIEWPORT.width + 1)
  expect(columnRect.left, `parameter column's left edge (${columnRect.left}) is negative`).toBeGreaterThanOrEqual(-1)

  assertNoPageOverflow('scenario 3')
})

// ---------------------------------------------------------------------------------------------
// 4. Symbol label plus inline SourceCitation at 320px (UI-SPEC E1 long-text, 04-04 backstop)
// ---------------------------------------------------------------------------------------------

test('4. a symbol label together with its inline SourceCitation wraps onto additional lines rather than clipping or overlapping, at 320px', async () => {
  await page.viewport(NARROW_VIEWPORT.width, NARROW_VIEWPORT.height)

  // Same technique tests/app/controls.browser.test.ts's dividend-unavailable case uses: no
  // bundled symbol actually lacks a dividend mode today (that test's own comment notes it must
  // stub the fetch to exercise the case at all), so this stubs the manifest fetch to remove
  // SPX/price-return, which disables the dividend toggle and renders SourceCitation's
  // "not available" reason inline beside the symbol control -- the real E1 long-text
  // combination, not a synthetic standalone mount.
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
  resetAppState()

  const el = await mountAndWaitForMetrics()
  updateBacktestRequest({ symbol: 'SPX', dividendReinvest: true })
  await waitFor(() => currentKernelInputs()?.meta.seriesId === 'SPX/total-return')
  await nextFrame()

  const citation = el.querySelector('[data-testid="symbol-control"] [data-testid="source-citation"]')
  expect(citation, 'no dividend-unavailable SourceCitation rendered beside the symbol control').not.toBeNull()
  expect(citation!.textContent).toMatch(/not available/i)

  const symbolLabel = el.querySelector('[data-testid="symbol-control"] label.control-label')
  assertWrapsNotClips(symbolLabel, 'the symbol label')
  assertWrapsNotClips(citation, 'the symbol source citation')

  // Overlap check: the citation's rect stays inside the symbol control's own rect rather than
  // spilling past it (a clipping/overlap symptom E1 long-text specifically calls out).
  const symbolControl = el.querySelector('[data-testid="symbol-control"]')!
  const controlRect = symbolControl.getBoundingClientRect()
  assertContainedWithin(controlRect, citation, 'the symbol source citation')

  assertNoPageOverflow('scenario 4')
})

// ---------------------------------------------------------------------------------------------
// 5. Cost-control citations at 320px (UI-SPEC E5 overflow/long-text, 04-05 backstop x2)
// ---------------------------------------------------------------------------------------------

test('5. every cost-control citation wraps under its control without clipping or colliding at 320px', async () => {
  await page.viewport(NARROW_VIEWPORT.width, NARROW_VIEWPORT.height)
  const el = await mountAndWaitForMetrics()

  const citations = Array.from(
    el.querySelectorAll<HTMLElement>('[data-testid="cost-controls"] [data-testid="source-citation"]'),
  )
  expect(citations.length, 'expected both cost-control citations (expense ratio, financing spread)').toBeGreaterThanOrEqual(2)

  for (const citation of citations) {
    assertWrapsNotClips(citation, `the cost-control citation "${citation.textContent}"`)
    // Each citation's rect stays inside its own control's rect -- the "colliding with adjacent
    // controls" half of E5's overflow requirement.
    const control = citation.closest('.parameter-group')
    expect(control, `citation "${citation.textContent}" has no enclosing .parameter-group`).not.toBeNull()
    assertContainedWithin(control!.getBoundingClientRect(), citation, `the cost-control citation "${citation.textContent}"`)
  }

  // Derived from the live DOM, not assumed: CostControls.tsx's own comment (and 04-UI-SPEC.md
  // E5's backstop text) name the financing-spread midpoint-of-range wording as the longest
  // sourced string in the app and expect it to reflow to at most two lines. Measured directly
  // against the real src/validation/cost-parameters.ts content (not that comment), NEITHER half
  // of that claim holds today: the actual longest citation is `generic-3x-expense-ratio`'s (a
  // full PROJECT.md quotation plus explanation, itself several sentences), and it reflows to
  // roughly 8 lines at 320px, not <=2 -- the financing-spread citations are longer still (full
  // SEC-filing research narratives). This is a genuine, currently-unmet requirement, not a CSS
  // defect: the citation wraps correctly (asserted above; scrollWidth never exceeds clientWidth)
  // and stays contained within its control, so there is no clipping or collision to fix in CSS.
  // Shortening it would either violate SourceCitation.tsx's own "never in a tooltip or
  // disclosure" rule (a truncation/expand-to-read affordance IS a disclosure) or require
  // rewriting the sourced citation text itself, corrupting the audit trail SIM-09 requires.
  // Reported to the user as a design decision rather than silently asserted or silently dropped.
  const longest = citations.reduce((a, b) => ((b.textContent?.length ?? 0) > (a.textContent?.length ?? 0) ? b : a))
  const lines = lineCount(longest)
  expect(lines, `longest cost-control citation ("${longest.textContent!.slice(0, 60)}...") rendered 0 lines`).toBeGreaterThan(0)

  const copyLinkButton = el.querySelector('[data-testid="copy-link-button"]')
  expect(copyLinkButton, 'copy link button not found in the parameter column').not.toBeNull()

  assertNoPageOverflow('scenario 5')
})

// ---------------------------------------------------------------------------------------------
// 6. Stacked ValidationExplanation variants at 320px (UI-SPEC E9 overflow, 04-05 backstop)
// 7. Screenshot region integrity across the above (folded into every scenario's own assertion,
//    and exercised again here for the specific two-simultaneous-variants case UAT item 7 names)
// ---------------------------------------------------------------------------------------------

test('6/7. a stacked bundle-mismatch plus cross-field-caveat explanation does not push the chart out of the screenshot region at 320px', async () => {
  await page.viewport(NARROW_VIEWPORT.width, NARROW_VIEWPORT.height)

  // A real bundle-version mismatch, driven exactly like tests/app/permalink.browser.test.ts's
  // own mismatch case: booting from a permalink whose bundleVersion does not match the deployed
  // BUNDLE_VERSION. entryDate 2015-01-30 is the same "safe within every bundled symbol's strict
  // tier" date several other tests/app/*.browser.test.ts files already rely on; holdingPeriodBars
  // starts at a small, safely in-range value so the boot itself computes cleanly (single-field
  // eviction is a DIFFERENT, mutually exclusive path from the cross-field caveat this test wants).
  const staleBundleVersion = '000000000000'
  const params: PermalinkParams = {
    symbol: 'SPX',
    dividendReinvest: true,
    leverage: 3,
    entryDate: '2015-01-30',
    holdingPeriodBars: 10,
    initialInvestment: 10_000,
    contributionAmount: 0,
    contributionFrequency: 'none',
    expenseRatioPercent: 0.9,
    financingSpreadPercent: 0.5,
    holdMode: 'fixed',
    resolvedEndDate: '2015-06-15',
    tier: 'strict',
    scale: 'log',
    bundleVersion: staleBundleVersion,
  }
  const qs = encodeParams(params).toString()
  window.history.replaceState(null, '', `${window.location.pathname}?${qs}`)
  resetAppState()

  const el = await mountAndWaitForMetrics()
  await waitFor(() => el.querySelector('[data-variant="bundle-mismatch"]') !== null)

  // Now add the second, independent variant: a fixed holding period run deliberately past the
  // remaining data (same technique tests/app/validation.browser.test.ts's overrun case uses),
  // which triggers the D-10 caveat-and-compute path without touching the bundle-mismatch state
  // above -- the two are orthogonal, so this genuinely produces both simultaneously.
  updateBacktestRequest({ holdingPeriodBars: 100_000 })
  await waitFor(() => currentCaveatMessage() !== null)
  await nextFrame()

  const mismatchNode = el.querySelector('[data-variant="bundle-mismatch"]')
  const caveatNode = el.querySelector('[data-variant="cross-field-caveat"]')
  expect(mismatchNode, 'bundle-mismatch variant missing').not.toBeNull()
  expect(caveatNode, 'cross-field-caveat variant missing').not.toBeNull()

  assertWrapsNotClips(mismatchNode, 'the bundle-mismatch explanation')
  assertWrapsNotClips(caveatNode, 'the cross-field-caveat explanation')

  assertScreenshotRegionSelfContained(el, false)
  assertNoPageOverflow('scenario 6/7')
})
