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
      setKernelInputs(inputs)
      setKernelResult(result)
      setDerivedMetrics(computeDerivedMetrics(currentBundle, inputs, result))
      setValidationError(null)
    } catch (err) {
      // D-11: clear the result area rather than retaining a stale run under a stale marker --
      // no number stays on screen that no longer corresponds to the controls beside it.
      // D-12: `buildKernelInputs`' own thrown message already names the offending value and the
      // supported range (D-32); it is displayed verbatim rather than re-authored here.
      const message = err instanceof Error ? err.message : String(err)
      setKernelInputs(null)
      setKernelResult(null)
      setDerivedMetrics(null)
      setValidationError(message)
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
