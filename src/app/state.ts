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
 */

import { createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'

import type { LoadedBundle } from '../data/bundle-source.ts'
import { loadBundleFromFetch } from '../data/load-bundle-browser.ts'
import { buildKernelInputs, type BacktestRequest, type KernelInputs } from '../data/kernel-inputs.ts'
import { runBacktest } from '../kernel/backtest.ts'
import type { KernelResult } from '../kernel/backtest.types.ts'
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

export function backtestRequest(): BacktestRequest {
  return request
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
