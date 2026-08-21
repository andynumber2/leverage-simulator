/**
 * src/app/state.ts
 *
 * The reactive parameter store and the rAF-coalesced recompute effect (D-03). Input events
 * (none exist yet in this plan -- the parameter column ships in 04-04/04-05) write
 * `request`/`scale`; every write calls `scheduleRun()`, which coalesces any number of writes
 * within one animation frame into a single `buildKernelInputs` + `runBacktest` call, per
 * 04-RESEARCH.md Pattern 5.
 *
 * D-01: the single backtest runs synchronously on the main thread. No worker, no Comlink, no
 * `postMessage` round trip -- PERF-02 measured 0.21ms against a 16ms frame budget, so there is no
 * budget pressure a worker would relieve.
 *
 * Phase 4 plan 02: the same rAF callback also computes `DerivedMetrics` -- IRR, CAGR, the
 * final-value multiple and the ruin date -- once per completed run, not per render. Nothing added
 * here allocates per frame beyond these scalars: `buildCashFlows` and `solveIrr`/`solveCagr` run
 * exactly once, inside the same coalesced callback `runBacktest` already runs in.
 *
 * Phase 4 plan 04: `buildKernelInputs` itself is the single-field bound and range validator
 * (D-32); it already throws a named `Error` on an out-of-range entry date, naming the offending
 * value and the supported range. `scheduleRun` now catches that throw rather than letting it
 * escape the rAF callback, clears the run (D-11: no stale result stays on screen alongside
 * controls that no longer describe it) and stores the thrown message verbatim for
 * `ValidationExplanation` to render (D-12: explained, never silently moved). This is also the
 * mechanism a D-12 eviction reaches the screen through: `EntryDateControl` does not re-derive its
 * own is-this-date-still-valid check, it relies on this same catch firing when a bound recomputes
 * out from under an already-set value.
 *
 * Phase 4 plan 05: D-10's other half. A fixed holding period running past the last supported bar
 * is a DIFFERENT throw than the D-12 range rejection above (its message contains "runs past the
 * last supported bar" -- `HOLDING_PERIOD_OVERRUN_PATTERN` below), and is caveat-and-compute, not
 * clear-and-explain: `scheduleRun` catches it, retries with `holdingPeriodBars: null` (which
 * resolves to the exact same supported window the thrown message already names), stores the
 * successful retry's result so the chart and metrics stay on screen, and keeps the original
 * thrown message as the caveat text -- rendered verbatim, the same discipline as the eviction
 * path. D-29's rate-coverage truncation deliberately produces no caveat at all; see the note
 * above `scheduleRun` for why naming the end date on the control is the honest fix instead.
 *
 * Plan 04-07 (D-13 through D-16): `applyPermalinkFromLocation` decodes `window.location.search`
 * exactly once per module lifetime, at the very top of `initializeApp`, before either the cached
 * or fresh-load branch runs `applyLoadedBundle` -- ordering that matters, because
 * `applyLoadedBundle`'s own entry-date default only fires when `request.entryDate` is still `''`
 * (see the comment above it), so a permalink-supplied entry date must already be in the store
 * before that check runs, or it would be silently clobbered back to the series' first date on
 * every load.
 *
 * Gap-closure fix (post-04-07, PERF-07 regression): `storeSuccessfulRun` used to call
 * `history.replaceState` synchronously on every completed run. D-03's rAF coalescing bounds that
 * to once per animation frame, not once per input event, but a continuous slider drag still
 * completes a run on nearly every frame -- PERF-07a/07b measured this as ~285 `replaceState`
 * calls across a 300-step drag, each one a real main-thread cost `history.replaceState` imposes
 * at animation frequency (and browsers additionally rate-limit it). `storeSuccessfulRun` now only
 * marks the permalink dirty (`schedulePermalinkSync`); the actual `encodeParams` +
 * `history.replaceState` write happens on a trailing-edge timer that a further recompute within
 * the delay window keeps pushing out, so a whole scrub produces exactly one write once it
 * settles. `flushPermalinkUrl` (exported) performs that pending write synchronously and is the
 * correctness backstop: `CopyLinkButton` calls it before reading `window.location.href`, and it
 * also runs on `visibilitychange`/`pagehide`, so a copy or a tab close mid-drag never observes a
 * stale URL. `resetAppState` clears any pending flush so a reset cannot strand a stale scheduled
 * write behind it.
 *
 * Plan 05-07 (CRED-04): the `methodology` URL flag is read and stripped from a COPY of
 * `window.location.search` before `decodeParams` ever sees it (`applyPermalinkFromLocation`
 * below) -- `methodology` is deliberately never added to `PERMALINK_KEYS`, so leaving it in would
 * make the allow-list's required-key sweep reject every permalink carrying it, and its
 * required-key sweep would in turn demand it on every permalink generated before this phase. The
 * decode's own pass/fail result still governs whether a run renders; the overlay opens
 * independent of that outcome (T-05-18). `openMethodologyOverlay`/`closeMethodologyOverlay` write
 * only that one key through `window.history.replaceState`, following the same entry-replacing
 * discipline as `writePermalinkUrl`, and flush any pending trailing-edge permalink write first
 * (T-05-20) so a queued run-parameter write cannot fire moments later and silently drop the flag
 * -- `writePermalinkUrl` itself also re-adds the flag when the overlay is currently open, so a
 * run-parameter change made while the overlay is open cannot strip it either.
 */

import { createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'

import { fromDaysSinceEpoch, toDaysSinceEpoch } from '../../tools/bundle-compiler/src/calendar.ts'
import type { LoadedBundle } from '../data/bundle-source.ts'
import { loadBundleFromFetch } from '../data/load-bundle-browser.ts'
import { buildKernelInputs, type BacktestRequest, type KernelInputs } from '../data/kernel-inputs.ts'
import { runBacktest } from '../kernel/backtest.ts'
import type { KernelResult } from '../kernel/backtest.types.ts'
import { solveCagr } from '../metrics/cagr.ts'
import { buildCashFlows, solveIrr } from '../metrics/irr.ts'
import { computeAttribution, type AttributionResult } from '../validation/attribution.ts'
import { FINANCING_SPREAD_DEFAULT, GENERIC_3X_EXPENSE_RATIO } from '../validation/cost-parameters.ts'
import { BUNDLE_VERSION } from '../data-bundle.generated.ts'
import type { Tier } from './bounds.ts'
import { decodeParams, encodeParams, type PermalinkParams } from './permalink.ts'

export type LoadStatus = 'loading' | 'ready' | 'failed'
export type ScaleMode = 'log' | 'linear'

/** UI-SPEC "Default Landing Run". `entryDate` is resolved from the loaded manifest's
 * `SPX/total-return` strict-tier `firstDate` in `initializeApp`, not hard-coded here -- until the
 * bundle loads it is an empty string, which `buildKernelInputs` never sees because `scheduleRun`
 * only fires after `status` becomes 'ready'. D-09/F-02: `expenseRatioPercent` and
 * `financingSpreadPercent` are PERCENTAGES; `GENERIC_3X_EXPENSE_RATIO` and
 * `FINANCING_SPREAD_DEFAULT` are FRACTIONS, multiplied by 100 exactly once, here. */
const DEFAULT_REQUEST: BacktestRequest = {
  symbol: 'SPX',
  dividendReinvest: true,
  leverage: 3,
  entryDate: '',
  holdingPeriodBars: null,
  initialInvestment: 10_000,
  contributionAmount: 0,
  contributionFrequency: 'none',
  expenseRatioPercent: GENERIC_3X_EXPENSE_RATIO * 100,
  financingSpreadPercent: FINANCING_SPREAD_DEFAULT * 100,
}

const [request, setRequestStore] = createStore<BacktestRequest>({ ...DEFAULT_REQUEST })
const [scale, setScaleSignal] = createSignal<ScaleMode>('log')
/** 05-05: the live history-tier selection (APP-02). Seeded to `'strict'`, same as the permalink's
 * previously-pinned wire value, so a first load with no permalink and no user interaction behaves
 * identically to Phase 4's fixed tier. Bounds the entry date and selects which manifest tier range
 * the UI reads; it does not enter `BacktestRequest` or the kernel (see `activeTier`'s doc comment). */
const [tier, setTierSignal] = createSignal<Tier>('strict')
/** 05-07/D-17: whether the full-screen methodology overlay is currently open. Never enters
 * `BacktestRequest`/`PermalinkParams` -- it is UI chrome, not a run parameter -- but it does
 * gate one key on the URL (`methodology`), read/written outside the strict permalink codec (see
 * this module's header comment). */
const [methodologyOverlayOpenSignal, setMethodologyOverlayOpenSignal] = createSignal<boolean>(false)
const [status, setStatus] = createSignal<LoadStatus>('loading')
const [loadErrorMessage, setLoadErrorMessage] = createSignal<string | null>(null)
const [bundle, setBundle] = createSignal<LoadedBundle | null>(null)
const [kernelInputs, setKernelInputs] = createSignal<KernelInputs | null>(null)
const [kernelResult, setKernelResult] = createSignal<KernelResult | null>(null)
const [validationError, setValidationError] = createSignal<string | null>(null)
const [caveatMessage, setCaveatMessage] = createSignal<string | null>(null)

/** D-15: the `bundleVersion` a decoded permalink carried, or `null` when this session did not
 * boot from a permalink at all (an empty query string, or a decode error, which reads as "no
 * comparable link version" rather than a mismatch of its own). `BundleVersionBanner` compares
 * this against the imported `BUNDLE_VERSION` constant. */
const [linkBundleVersion, setLinkBundleVersion] = createSignal<string | null>(null)

export function currentLinkBundleVersion(): string | null {
  return linkBundleVersion()
}

/** METR-01 through METR-05's four derived values, computed once per completed run (D-05/D-06/
 * D-07/D-08). `irr`/`cagr` are `null` exactly when `solveIrr`/`solveCagr` are (D-08's undefined
 * bracket, or CAGR's non-positive-domain guard); `ruinDate` is `null` exactly when the run did not
 * ruin. */
export interface DerivedMetrics {
  irr: number | null
  cagr: number | null
  finalValueMultiple: number
  ruinDate: string | null
}

const [derivedMetrics, setDerivedMetrics] = createSignal<DerivedMetrics | null>(null)

export function currentDerivedMetrics(): DerivedMetrics | null {
  return derivedMetrics()
}

/** ATTR-01/ATTR-02/D-08: the current run's cost-decomposition result, computed inside the same
 * rAF-coalesced pass as `derivedMetrics` (see `storeSuccessfulRun` below) so the attribution panel
 * never shows a value from a previous run while the chart/metrics show the current one. `null`
 * exactly when `currentKernelResult()` is `null` -- the two states are mutually exclusive by
 * construction, same discipline as `derivedMetrics`. */
const [attribution, setAttribution] = createSignal<AttributionResult | null>(null)

export function currentAttribution(): AttributionResult | null {
  return attribution()
}

/** D-06: the resolved calendar date of `ruinBarIndex`, read through the same absolute-calendar-
 * index arithmetic `kernel-inputs.ts` uses (`window.entryIndex + ruinBarIndex`), never
 * recomputed via a bar-count-per-year approximation. */
function resolveRuinDate(currentBundle: LoadedBundle, inputs: KernelInputs, result: KernelResult): string | null {
  if (!result.ruined || result.ruinBarIndex < 0) return null
  const absIndex = inputs.window.entryIndex + result.ruinBarIndex
  const days = currentBundle.calendar[absIndex]
  if (days === undefined) return null
  return fromDaysSinceEpoch(days)
}

function computeDerivedMetrics(currentBundle: LoadedBundle, inputs: KernelInputs, result: KernelResult): DerivedMetrics {
  const cashFlows = buildCashFlows(inputs.params, inputs.series, inputs.outputs, result)
  const irr = solveIrr(cashFlows)
  const calendarDays = toDaysSinceEpoch(inputs.window.lastDate) - toDaysSinceEpoch(inputs.window.firstDate)
  const cagr = solveCagr(inputs.params.initialInvestment, result.finalValue, calendarDays)
  const finalValueMultiple = result.totalContributed > 0 ? result.finalValue / result.totalContributed : 0
  const ruinDate = resolveRuinDate(currentBundle, inputs, result)
  return { irr, cagr, finalValueMultiple, ruinDate }
}

export function backtestRequest(): BacktestRequest {
  return request
}

/** Writes a partial patch onto the reactive request store and schedules the coalesced recompute
 * (D-03). No parameter control exists yet in this plan (04-04/04-05 fill the parameter column);
 * this is the one write path both those future controls and this plan's browser test use to
 * change what `scheduleRun` computes against. */
export function updateBacktestRequest(patch: Partial<BacktestRequest>): void {
  setRequestStore(patch)
  scheduleRun()
}

export function scaleMode(): ScaleMode {
  return scale()
}

export function setScaleMode(mode: ScaleMode): void {
  setScaleSignal(mode)
  scheduleRun()
}

/** 05-05: the one live tier value every consumer (`EntryDateControl`, `HoldingModeControl`,
 * `ProvenanceStrip`, `writePermalinkUrl`) reads, instead of each holding its own literal. Does not
 * enter `BacktestRequest`/`buildKernelInputs`/the kernel: the tier bounds the entry date and
 * selects a manifest tier range, it is not itself a run parameter, and adding it to
 * `BacktestRequest` would create a second definition of what a run is (`src/data/kernel-inputs.ts`
 * carries no tier field, asserted by this plan's no-diff acceptance criterion). */
export function activeTier(): Tier {
  return tier()
}

export function setActiveTier(newTier: Tier): void {
  setTierSignal(newTier)
  scheduleRun()
}

/** 05-07/D-17: whether the methodology overlay is open. */
export function methodologyOverlayOpen(): boolean {
  return methodologyOverlayOpenSignal()
}

/** T-05-20: adds or removes exactly the `methodology` key on the current address bar, through
 * the same entry-replacing `window.history.replaceState` discipline `writePermalinkUrl` already
 * uses -- never a navigation, never touching any other query parameter or the hash. Flushes any
 * pending trailing-edge permalink write first: `writePermalinkUrl` rebuilds the query string from
 * `PERMALINK_KEYS` alone (it does not know about this key on its own), so a write that fired a
 * moment after this function's own `replaceState` call would otherwise silently drop the flag it
 * just wrote. Callers set `methodologyOverlayOpenSignal` before calling this, so a flush
 * triggered from inside this function already sees the correct open/closed state and (via
 * `writePermalinkUrl`'s own check) writes the flag consistently on its own. */
function writeMethodologyFlagToUrl(present: boolean): void {
  flushPermalinkUrl()
  const params = new URLSearchParams(window.location.search)
  if (present) {
    params.set('methodology', '1')
  } else {
    params.delete('methodology')
  }
  const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`
  window.history.replaceState(null, '', newUrl)
}

/** 05-07/D-17: opens the full-screen methodology overlay over whatever run is currently on
 * screen, leaving every run parameter untouched. */
export function openMethodologyOverlay(): void {
  setMethodologyOverlayOpenSignal(true)
  writeMethodologyFlagToUrl(true)
}

/** 05-07/D-17: closes the overlay, returning to the exact run underneath it -- removes only the
 * `methodology` key, leaving every other query parameter and the browser history entry count
 * unchanged. */
export function closeMethodologyOverlay(): void {
  setMethodologyOverlayOpenSignal(false)
  writeMethodologyFlagToUrl(false)
}

export function loadStatus(): LoadStatus {
  return status()
}

export function loadError(): string | null {
  return loadErrorMessage()
}

export function loadedBundle(): LoadedBundle | null {
  return bundle()
}

export function currentKernelInputs(): KernelInputs | null {
  return kernelInputs()
}

export function currentKernelResult(): KernelResult | null {
  return kernelResult()
}

/** D-11/D-12: the message `buildKernelInputs` threw for the most recent run attempt, or `null`
 * when the most recent attempt succeeded. Non-null exactly when `currentKernelInputs()` and
 * `currentKernelResult()` are `null` -- the two states are mutually exclusive by construction in
 * `scheduleRun` below. */
export function currentValidationError(): string | null {
  return validationError()
}

/** D-10: non-`null` exactly when the most recent successful run carries a cross-field caveat --
 * either a fixed holding period that was accepted and resolved to the supported window, or D-29's
 * rate-coverage truncation reached without a throw at all. Independent of
 * `currentValidationError()`: a caveat coexists with a completed, still-rendered run, never with
 * an evicted one. */
export function currentCaveatMessage(): string | null {
  return caveatMessage()
}

/** D-10: the exact substring `buildKernelInputs` uses when a fixed holding period runs past the
 * last supported bar -- the one D-32 range-rejection throw this plan treats as caveat-and-compute
 * rather than clear-and-explain. Matched against the thrown message rather than re-derived, so
 * this stays correct even if the message's surrounding wording changes; only this fragment needs
 * to stay stable. */
const HOLDING_PERIOD_OVERRUN_PATTERN = 'runs past the last supported bar'

/**
 * D-13 through D-15: re-serializes `inputs`' completed run through `encodeParams` and writes it
 * into the address bar with `history.replaceState` -- an entry-replacing write, never a
 * new-entry-appending one (D-03: the rAF-coalesced recompute can fire on nearly every
 * slider-drag frame; a new-entry-appending write there would put thousands of entries behind the
 * back button in a single scrub). `holdMode`/`holdingPeriodBars` are derived from
 * `request.holdingPeriodBars` (D-13's "every parameter, always" applies to what was actually
 * asked for, not a resolved fallback: a fixed period that overran and was retried still encodes
 * as `holdMode=fixed` with the ORIGINAL requested bar count, so reopening the link reproduces the
 * exact same D-10 caveat-and-compute retry, not a silently different fixed-mode run).
 * `resolvedEndDate` is `inputs.window.lastDate`, the actual end THIS run computed to (D-14) --
 * informational only; decode never feeds it back into `buildKernelInputs`, which recomputes the
 * window itself from `entryDate`/`holdingPeriodBars` alone. `tier` is `activeTier()`, the live
 * signal (05-05 lifts D-09's Phase-4 pin) and `bundleVersion` is the imported `BUNDLE_VERSION` (D-15:
 * the currently deployed bundle -- the only one this build can address, per `MANIFEST_PATH`
 * pointing at exactly one manifest).
 *
 * Reads `request`/`scale()`/`activeTier()` at call time rather than at the moment the write was
 * scheduled -- safe because the only way any of the three changes is through
 * `updateBacktestRequest`/`setScaleMode`/`setActiveTier`, all of which call `scheduleRun()` and so
 * produce a further `storeSuccessfulRun` call that reschedules the pending write with fresh
 * `inputs` before this one would have fired (see `schedulePermalinkSync` below). This function
 * performs the actual write; callers never call it directly -- `schedulePermalinkSync` and
 * `flushPermalinkUrl` are the two entry points.
 */
function writePermalinkUrl(inputs: KernelInputs): void {
  const params: PermalinkParams = {
    symbol: request.symbol,
    dividendReinvest: request.dividendReinvest,
    leverage: request.leverage,
    entryDate: request.entryDate,
    holdingPeriodBars: request.holdingPeriodBars,
    initialInvestment: request.initialInvestment,
    contributionAmount: request.contributionAmount,
    contributionFrequency: request.contributionFrequency,
    expenseRatioPercent: request.expenseRatioPercent,
    financingSpreadPercent: request.financingSpreadPercent,
    holdMode: request.holdingPeriodBars === null ? 'end-of-data' : 'fixed',
    resolvedEndDate: inputs.window.lastDate,
    tier: activeTier(),
    scale: scale(),
    bundleVersion: BUNDLE_VERSION,
  }
  const qs = encodeParams(params)
  // T-05-20: re-adds the methodology flag when the overlay is currently open -- this is the
  // OTHER half of the race `writeMethodologyFlagToUrl` guards against: a run-parameter change
  // made WHILE the overlay is open reaches this function through the normal
  // `schedulePermalinkSync`/`flushPermalinkUrl` path, which knows nothing about `methodology` on
  // its own (it is deliberately outside `PERMALINK_KEYS`, see this module's header comment).
  if (methodologyOverlayOpenSignal()) qs.set('methodology', '1')
  const newUrl = `${window.location.pathname}?${qs.toString()}${window.location.hash}`
  window.history.replaceState(null, '', newUrl)
}

/** Gap-closure fix: how long a trailing-edge write waits for the drag/scrub to settle before
 * actually touching the address bar. `requestIdleCallback` was considered and rejected -- it is
 * not implemented in every target browser (notably Safari, as of this writing), and this project
 * ships no polyfill; a plain trailing `setTimeout` is simpler, universally supported, and the
 * delay only needs to comfortably exceed one animation frame (~16.67ms) so consecutive
 * rAF-coalesced recomputes during a drag keep pushing the write out rather than each firing one.
 * 200ms is well past that floor while still being unnoticeable as "the link updates after I stop
 * moving the slider." */
const PERMALINK_FLUSH_DELAY_MS = 200

let permalinkFlushTimer: ReturnType<typeof setTimeout> | undefined
let pendingPermalinkInputs: KernelInputs | null = null

/** Marks the permalink dirty and (re)schedules the trailing-edge flush, called once per completed
 * run instead of writing immediately. Any further call before the timer fires -- i.e. another
 * frame of the same drag completing -- clears and restarts it, so a continuous scrub produces
 * exactly one `history.replaceState` call once it settles, not one per coalesced recompute. */
function schedulePermalinkSync(inputs: KernelInputs): void {
  pendingPermalinkInputs = inputs
  if (permalinkFlushTimer !== undefined) clearTimeout(permalinkFlushTimer)
  permalinkFlushTimer = setTimeout(() => {
    permalinkFlushTimer = undefined
    flushPermalinkUrl()
  }, PERMALINK_FLUSH_DELAY_MS)
}

/** Performs any pending permalink write synchronously, right now, and cancels the trailing-edge
 * timer that would otherwise have done it later. This is the correctness guarantee the trailing
 * edge alone cannot provide: `CopyLinkButton` calls this before reading `window.location.href`,
 * so a copy issued during or immediately after a drag can never yield a stale link, and the
 * module-level `visibilitychange`/`pagehide` listeners below call it so a tab backgrounded or
 * closed mid-drag still leaves a correct URL behind. A no-op when nothing is pending. */
export function flushPermalinkUrl(): void {
  if (permalinkFlushTimer !== undefined) {
    clearTimeout(permalinkFlushTimer)
    permalinkFlushTimer = undefined
  }
  if (pendingPermalinkInputs === null) return
  const inputs = pendingPermalinkInputs
  pendingPermalinkInputs = null
  writePermalinkUrl(inputs)
}

/** Idempotent registration guard, same pattern as `theme.ts`'s `changeListenerAttached` --
 * `visibilitychange`/`pagehide` are page-lifetime events, not tied to a particular loaded bundle,
 * so this is attached once per module lifetime and never torn down by `resetAppState`. */
let flushListenersAttached = false

/** D-13 gap closure: flush on `visibilitychange` (covers the tab being backgrounded) and
 * `pagehide` (covers navigation/close, and is the documented reliable replacement for `unload` on
 * mobile Safari/bfcache-participating browsers) -- both cheap, both a no-op when nothing is
 * pending, both closing the same window a bare trailing-edge timer alone would leave open: a user
 * who scrubs and immediately switches tabs or closes the page before the timer fires. */
function attachPermalinkFlushListeners(): void {
  if (flushListenersAttached) return
  flushListenersAttached = true
  // `visibilitychange` is dispatched on `document`, never `window` -- `pagehide` is the reverse.
  document.addEventListener('visibilitychange', () => flushPermalinkUrl())
  window.addEventListener('pagehide', () => flushPermalinkUrl())
}

/** Stores a completed run plus its already-resolved caveat state (D-10), shared by the normal path
 * and the D-10 retry path below so both write through the same three signals in the same order.
 * `caveat` is supplied by the caller rather than re-derived here: the two success paths compute it
 * from different sources (see call sites), and folding that decision into this helper would hide
 * which source won when both could apply. */
function storeSuccessfulRun(
  currentBundle: LoadedBundle,
  inputs: KernelInputs,
  result: KernelResult,
  caveat: string | null,
): void {
  setKernelInputs(inputs)
  setKernelResult(result)
  setDerivedMetrics(computeDerivedMetrics(currentBundle, inputs, result))
  // ATTR-01/D-08: computed here, inside the same rAF-coalesced pass runBacktest already ran in
  // (PERF-07b) -- no second requestAnimationFrame, no second performance.mark pair.
  setAttribution(computeAttribution(inputs, result))
  setValidationError(null)
  setCaveatMessage(caveat)
  schedulePermalinkSync(inputs)
}

/* D-29's rate-coverage truncation deliberately produces NO caveat in the open-ended mode.
 * `meta.truncatedForRateCoverage` is a dataset-wide fact, not a property of a particular run: the
 * shared `@rate/rate` series ends one trading day before the price series it is paired with
 * (`src/validation/cost-parameters.ts`'s `ragged-right-edge-truncation` mechanism), so the flag is
 * true for effectively every run over this bundle. Caveating it made the default landing view
 * carry a permanent `role="alert"` about a one-bar publication lag on a multi-decade backtest,
 * which spends the explanation surface's credibility on the one thing that cannot change a
 * conclusion -- and stayed silent about the far larger gap, that a manually-refreshed bundle can
 * be months behind the wall clock.
 *
 * `HoldingModeControl` now names the resolved end date instead of promising "today", so the
 * control and the run agree by construction and there is no discrepancy left to explain. A fixed
 * holding period that genuinely overruns still gets its caveat from the explicit throw below,
 * whose message is accurate to the specific requested window.
 */

/** D-11: clears the result area rather than retaining a stale run under a stale marker -- no
 * number stays on screen that no longer corresponds to the controls beside it. */
function clearForEviction(message: string): void {
  setKernelInputs(null)
  setKernelResult(null)
  setDerivedMetrics(null)
  setAttribution(null)
  setValidationError(message)
  setCaveatMessage(null)
}

/** D-03/Pattern 5: a module-level guard so any number of writes within one animation frame
 * collapse into exactly one `buildKernelInputs` + `runBacktest` call. */
let scheduled = false

export function scheduleRun(): void {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(() => {
    scheduled = false
    const currentBundle = bundle()
    if (currentBundle === null || status() !== 'ready') return

    performance.mark('recompute-start')
    try {
      const inputs = buildKernelInputs(currentBundle, { ...request })
      const result = runBacktest(inputs.params, inputs.series, inputs.outputs)
      storeSuccessfulRun(currentBundle, inputs, result, null)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes(HOLDING_PERIOD_OVERRUN_PATTERN)) {
        // D-10: accepted as input, not blocked -- resolve to the supported window (the exact
        // window the thrown message's own "max bars"/"ending" already name, since `null` means
        // "hold to the last fully-supported bar", D-29) and render the caveat above a
        // still-computed result, rather than clearing it (clear-and-explain is variant 1 only).
        // buildKernelInputs' own thrown text is the caveat, rendered verbatim (D-10's key link) --
        // accurate to the specific requested window, unlike the dataset-wide rate-coverage flag.
        try {
          const fallbackInputs = buildKernelInputs(currentBundle, { ...request, holdingPeriodBars: null })
          const fallbackResult = runBacktest(fallbackInputs.params, fallbackInputs.series, fallbackInputs.outputs)
          storeSuccessfulRun(currentBundle, fallbackInputs, fallbackResult, message)
        } catch (fallbackErr) {
          // Unreachable in practice: every other field already validated on the first attempt,
          // and holdingPeriodBars: null cannot itself trigger this same range check. Falls
          // through to eviction rather than leaving a stale run on screen if it is ever reached.
          const fallbackMessage = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
          clearForEviction(fallbackMessage)
        }
      } else {
        // D-11/D-12: single-field eviction, clear-and-explain. buildKernelInputs' own thrown
        // message already names the offending value and the supported range (D-32); displayed
        // verbatim rather than re-authored here.
        clearForEviction(message)
      }
    } finally {
      performance.mark('recompute-end')
      performance.measure('app-recompute', 'recompute-start', 'recompute-end')
      performance.clearMarks('recompute-start')
      performance.clearMarks('recompute-end')
    }
  })
}

/** The in-flight load, so concurrent `initializeApp` calls share one fetch instead of racing
 * several. Cleared when the load settles, so the Retry button can start a genuinely new one. */
let loadInFlight: Promise<void> | null = null

/** D-13: `applyPermalinkFromLocation` (below) only ever reads `window.location.search` once per
 * module lifetime -- a real page load never wants a second decode of the same URL clobbering
 * whatever the user has since typed into the controls. `resetAppState` clears it (alongside
 * `loadInFlight`) so a test that changes `window.location.search` and wants a genuinely fresh
 * decode can force one, the same way it forces a fresh bundle fetch. */
let permalinkApplied = false

/** D-11/D-12: set for exactly the one `applyLoadedBundle` call that follows a boot-time decode
 * error, so that call's own `scheduleRun()` is skipped -- the decode error already evicted the
 * run (`clearForEviction`, called synchronously inside `applyPermalinkFromLocation`, before the
 * bundle has even loaded); without this, `applyLoadedBundle`'s normal `scheduleRun()` would
 * immediately compute a fresh, valid default-landing-run result and silently overwrite that
 * eviction, leaving nothing on screen to explain what went wrong with the link. */
let permalinkDecodeFailedAtBoot = false

/**
 * Discards the loaded bundle and every derived signal, so the next `initializeApp` performs a
 * real fetch rather than reusing the cached bundle.
 *
 * The module holds app state in singletons, which is what lets `initializeApp` be idempotent.
 * Anything that needs to observe a DIFFERENT load outcome from the same module -- a test
 * stubbing `fetch` to exercise the failure path, a test that wants a fresh permalink decode
 * against a different `window.location.search`, or a future in-app bundle swap -- has to clear
 * that cache explicitly, because "load it again" is otherwise indistinguishable from "you
 * already have it".
 *
 * Gap-closure fix: also cancels any pending trailing-edge permalink write and discards the
 * `KernelInputs` it would have written, rather than letting it fire later against whatever the
 * next `initializeApp` puts in the store -- a scheduled write must not survive the state it was
 * scheduled from.
 */
export function resetAppState(): void {
  loadInFlight = null
  permalinkApplied = false
  permalinkDecodeFailedAtBoot = false
  if (permalinkFlushTimer !== undefined) {
    clearTimeout(permalinkFlushTimer)
    permalinkFlushTimer = undefined
  }
  pendingPermalinkInputs = null
  setBundle(null)
  setStatus('loading')
  setLoadErrorMessage(null)
  setKernelInputs(null)
  setKernelResult(null)
  setDerivedMetrics(null)
  setAttribution(null)
  setValidationError(null)
  setCaveatMessage(null)
  setLinkBundleVersion(null)
  setTierSignal('strict')
  setMethodologyOverlayOpenSignal(false)
}

/**
 * D-13/D-11/D-12: decodes `window.location.search` exactly once (guarded by `permalinkApplied`)
 * and seeds the request store and scale from the result, called from the very top of
 * `initializeApp` -- before `applyLoadedBundle` runs, so a permalink-supplied `entryDate` is
 * already in the store by the time that function's own default-entry-date check reads it.
 *
 * An empty query string (`decoded.status === 'empty'`) leaves `DEFAULT_REQUEST` untouched: the
 * default landing run. A successful decode (`'ok'`) seeds every one of `BacktestRequest`'s ten
 * fields plus `scale` and `tier` (05-05: the tier signal, seeded through `setActiveTier` so a
 * decoded link's tier flows through the same path a user selection would), and records the link's
 * `bundleVersion` for `BundleVersionBanner`. A decode
 * error (`'error'`) leaves the request store at its default shape (still "the default landing
 * run", per the plan's own wording) but evicts the run that would otherwise follow -- see
 * `permalinkDecodeFailedAtBoot`'s doc comment -- and raises the explanation through the same
 * D-11/D-12 surface a live single-field eviction uses, naming the offending key verbatim from
 * `decodeParams`' own error message.
 *
 * Plan 05-07/T-05-17: the `methodology` key is read off a COPY of `window.location.search` and
 * deleted from that copy before `decodeParams` ever sees it -- by its own literal name, through
 * an explicit `.has`/`.delete` call, never a dynamic property read. `methodology` is not a
 * `PermalinkKey`, so leaving it in would make `decodeParams`'s allow-list reject the whole
 * permalink as an unknown key. T-05-18: the overlay opens whenever the flag was present,
 * regardless of whether the decode below succeeds, fails or is empty -- a flagged permalink
 * carrying an invalid run still shows its own D-11/D-12 eviction explanation, with the flag never
 * masking or bypassing that validation.
 */
function applyPermalinkFromLocation(): void {
  if (permalinkApplied) return
  permalinkApplied = true

  const rawParams = new URLSearchParams(window.location.search)
  const methodologyRequested = rawParams.has('methodology')
  rawParams.delete('methodology')

  const decoded = decodeParams(rawParams)
  if (decoded.status === 'ok') {
    const { params } = decoded
    setLinkBundleVersion(params.bundleVersion)
    setRequestStore({
      symbol: params.symbol,
      dividendReinvest: params.dividendReinvest,
      leverage: params.leverage,
      entryDate: params.entryDate,
      holdingPeriodBars: params.holdingPeriodBars,
      initialInvestment: params.initialInvestment,
      contributionAmount: params.contributionAmount,
      contributionFrequency: params.contributionFrequency,
      expenseRatioPercent: params.expenseRatioPercent,
      financingSpreadPercent: params.financingSpreadPercent,
    })
    setScaleSignal(params.scale)
    setActiveTier(params.tier)
  } else if (decoded.status === 'error') {
    permalinkDecodeFailedAtBoot = true
    clearForEviction(decoded.error)
  }
  // decoded.status === 'empty': nothing to seed -- DEFAULT_REQUEST is already in place.

  // T-05-18: independent of the decode outcome above -- the URL already carries the flag, so this
  // only needs to set the in-memory signal, never `openMethodologyOverlay`'s own URL-rewriting
  // path (that would perform a needless `replaceState` at boot for a URL that is already correct).
  if (methodologyRequested) {
    setMethodologyOverlayOpenSignal(true)
  }
}

/**
 * Fetches and decodes the bundle (`loadBundleFromFetch`), resolves the default entry date from
 * the loaded manifest's `SPX/total-return` strict-tier `firstDate` (D-09: Phase 4 pins the
 * strict tier), and schedules the first run. A thrown error -- a non-OK asset response or a
 * manifest that decodes to zero series -- sets `status` to 'failed' carrying the thrown message,
 * which already names the failing detail.
 *
 * IDEMPOTENT. `App`'s `onMount` calls this on every mount, and the bundle is ~1.6 MB across 14
 * assets -- re-fetching and re-decoding all of it because a component mounted a second time is
 * pure waste in the browser, and in the app test suite it was the direct cause of flaky runs
 * (eight mounts, eight full bundle loads, tests timing out non-deterministically at whichever
 * one happened to cross the budget). An already-loaded bundle short-circuits; a load already in
 * flight is awaited rather than duplicated. `resetAppState` is the way to force a real reload.
 *
 * The Retry button is unaffected: it is only reachable from `status === 'failed'`, where the
 * bundle is null and no load is in flight, so it always performs a genuine retry.
 */
export async function initializeApp(): Promise<void> {
  attachPermalinkFlushListeners()
  applyPermalinkFromLocation()

  const cached = bundle()
  if (cached !== null && status() === 'ready') {
    // Only the FETCH is skipped. Everything a mount does AFTER the bytes arrive still runs, so a
    // cached mount is indistinguishable from a fresh one apart from the wire time: the entry date
    // is re-resolved for the current symbol, and a run is scheduled. Skipping those too was the
    // bug in the first cut of this cache -- a mount left holding a symbol whose window no longer
    // contains the previous entry date evicted and never recovered, because nothing re-resolved
    // the date and nothing scheduled a recompute.
    try {
      applyLoadedBundle(cached)
    } catch (err) {
      setLoadErrorMessage(err instanceof Error ? err.message : String(err))
      setStatus('failed')
    }
    return
  }
  if (loadInFlight !== null) return loadInFlight

  const load = runInitialLoad()
  loadInFlight = load
  try {
    await load
  } finally {
    loadInFlight = null
  }
}

/**
 * Everything a load does once the bytes are in hand: resolve the entry date for the currently
 * selected series (D-09 pins the strict tier) and schedule the first run. Shared by the fresh-load
 * and cached-bundle paths so the two cannot drift -- the difference between them is the fetch, and
 * only the fetch.
 *
 * Plan 04-07: the entry-date default below is now conditional on `request.entryDate` still being
 * `''` (the store's un-set sentinel, `DEFAULT_REQUEST`'s own value). Unconditionally overwriting
 * it, as this function did before, silently clobbered a permalink-supplied entry date on every
 * load -- `applyPermalinkFromLocation` (called before this, from `initializeApp`) may already have
 * seeded a real date here, and this is the ONE place in the app that ever assigns to `entryDate`
 * without a user action driving it, so it is the one place that needed to learn not to overwrite a
 * caller-supplied value. A mount that reuses the cached bundle (D-02's idempotency) still resolves
 * correctly: `permalinkApplied`'s guard means `applyPermalinkFromLocation` is a no-op on a second
 * mount, and `request.entryDate` is already non-empty (either the permalink's date or the first
 * mount's own resolved default), so this check continues to correctly skip re-defaulting either
 * way.
 */
function applyLoadedBundle(loaded: LoadedBundle): void {
  const seriesId = `${request.symbol}/${request.dividendReinvest ? 'total-return' : 'price-return'}`
  const seriesEntry = loaded.manifest.series.find((s) => s.id === seriesId)
  if (seriesEntry === undefined) {
    const existingIds = loaded.manifest.series.map((s) => s.id).sort()
    throw new Error(
      `app: no series named "${seriesId}" in the loaded bundle manifest (${loaded.manifest.series.length} series decoded); ` +
        `existing series ids: ${existingIds.join(', ') || '(none)'}`,
    )
  }
  if (seriesEntry.tiers.strict === null) {
    throw new Error(`app: series "${seriesId}" has no strict-tier date range in the loaded bundle manifest`)
  }

  // 05-05/A4: deliberately reads `tiers.strict`, never `activeTier()`, regardless of a later tier
  // selection. D-23's "longest window the strict tier allows" default-landing-run rule stays
  // derivable from this one sentence rather than moving with the control; a tier selected before
  // this point (e.g. from a decoded permalink) still only affects the entry-date/holding-mode
  // BOUNDS, never which date the default landing run resolves to.
  if (request.entryDate === '') {
    setRequestStore('entryDate', seriesEntry.tiers.strict.firstDate)
  }
  setStatus('ready')

  if (permalinkDecodeFailedAtBoot) {
    // D-11: the boot-time decode error already evicted the run (see
    // `applyPermalinkFromLocation`'s `clearForEviction` call); skip this one scheduled run so a
    // freshly computed default-landing-run result does not silently overwrite that eviction.
    permalinkDecodeFailedAtBoot = false
    return
  }
  scheduleRun()
}

async function runInitialLoad(): Promise<void> {
  setStatus('loading')
  setLoadErrorMessage(null)
  try {
    const loadedBundleResult = await loadBundleFromFetch()
    setBundle(loadedBundleResult)
    applyLoadedBundle(loadedBundleResult)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    setLoadErrorMessage(message)
    setStatus('failed')
  }
}
