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
 * path. D-29's rate-coverage truncation reaches the identical caveat class through a route that
 * never throws at all, but only in hold-to-today mode (`holdToTodayRateCoverageCaveat` below) --
 * `meta.truncatedForRateCoverage` is a dataset-wide fact, true for effectively every run over this
 * bundle regardless of the requested window, and only describes THIS run's own end in hold-to-
 * today mode, where `buildKernelInputs` always resolves the window to that exact boundary.
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
import { FINANCING_SPREAD_DEFAULT, GENERIC_3X_EXPENSE_RATIO } from '../validation/cost-parameters.ts'

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
const [status, setStatus] = createSignal<LoadStatus>('loading')
const [loadErrorMessage, setLoadErrorMessage] = createSignal<string | null>(null)
const [bundle, setBundle] = createSignal<LoadedBundle | null>(null)
const [kernelInputs, setKernelInputs] = createSignal<KernelInputs | null>(null)
const [kernelResult, setKernelResult] = createSignal<KernelResult | null>(null)
const [validationError, setValidationError] = createSignal<string | null>(null)
const [caveatMessage, setCaveatMessage] = createSignal<string | null>(null)

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
  setValidationError(null)
  setCaveatMessage(caveat)
}

/** D-29 reaching D-10's caveat class through a route that never throws (hold-to-today mode only).
 * `meta.truncatedForRateCoverage` is a DATASET-WIDE fact (the shared `@rate/rate` series ends a
 * few trading days before every price series it is paired with, `src/validation/
 * cost-parameters.ts`'s `ragged-right-edge-truncation` mechanism) -- true for effectively every
 * run over this bundle regardless of the requested window, NOT specific to whether THIS run's own
 * end was actually determined by it. It is only a faithful "this run was cut short by rate
 * coverage" statement when `holdingPeriodBars` is `null`: `buildKernelInputs` sets
 * `endAbsIndex = runLastAbsIndex` (the min of both series) in exactly that case, by construction,
 * so the run's own end date genuinely IS the rate-coverage boundary. In fixed mode the run's end
 * is whatever bar count was asked for and is unrelated to this flag; a fixed period that actually
 * reaches the boundary gets its caveat from the explicit overrun throw below instead, whose
 * message is accurate to the SPECIFIC requested window rather than this dataset-wide flag. */
function holdToTodayRateCoverageCaveat(holdingPeriodBars: number | null, inputs: KernelInputs): string | null {
  if (holdingPeriodBars !== null || !inputs.meta.truncatedForRateCoverage) return null
  return `Holding period runs past the last supported bar (${inputs.window.lastDate}). Showing results through that date.`
}

/** D-11: clears the result area rather than retaining a stale run under a stale marker -- no
 * number stays on screen that no longer corresponds to the controls beside it. */
function clearForEviction(message: string): void {
  setKernelInputs(null)
  setKernelResult(null)
  setDerivedMetrics(null)
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
      storeSuccessfulRun(currentBundle, inputs, result, holdToTodayRateCoverageCaveat(request.holdingPeriodBars, inputs))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes(HOLDING_PERIOD_OVERRUN_PATTERN)) {
        // D-10: accepted as input, not blocked -- resolve to the supported window (the exact
        // window the thrown message's own "max bars"/"ending" already name, since `null` means
        // "hold to the last fully-supported bar", D-29) and render the caveat above a
        // still-computed result, rather than clearing it (clear-and-explain is variant 1 only).
        // buildKernelInputs' own thrown text is the caveat, rendered verbatim (D-10's key link) --
        // accurate to the specific requested window, unlike the dataset-wide flag
        // holdToTodayRateCoverageCaveat reads.
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

/**
 * Fetches and decodes the bundle (`loadBundleFromFetch`), resolves the default entry date from
 * the loaded manifest's `SPX/total-return` strict-tier `firstDate` (D-09: Phase 4 pins the
 * strict tier), and schedules the first run. A thrown error -- a non-OK asset response or a
 * manifest that decodes to zero series -- sets `status` to 'failed' carrying the thrown message,
 * which already names the failing detail.
 */
export async function initializeApp(): Promise<void> {
  setStatus('loading')
  setLoadErrorMessage(null)
  try {
    const loadedBundleResult = await loadBundleFromFetch()
    setBundle(loadedBundleResult)

    const seriesId = `${request.symbol}/${request.dividendReinvest ? 'total-return' : 'price-return'}`
    const seriesEntry = loadedBundleResult.manifest.series.find((s) => s.id === seriesId)
    if (seriesEntry === undefined) {
      const existingIds = loadedBundleResult.manifest.series.map((s) => s.id).sort()
      throw new Error(
        `app: no series named "${seriesId}" in the loaded bundle manifest (${loadedBundleResult.manifest.series.length} series decoded); ` +
          `existing series ids: ${existingIds.join(', ') || '(none)'}`,
      )
    }
    if (seriesEntry.tiers.strict === null) {
      throw new Error(`app: series "${seriesId}" has no strict-tier date range in the loaded bundle manifest`)
    }

    setRequestStore('entryDate', seriesEntry.tiers.strict.firstDate)
    setStatus('ready')
    scheduleRun()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    setLoadErrorMessage(message)
    setStatus('failed')
  }
}
