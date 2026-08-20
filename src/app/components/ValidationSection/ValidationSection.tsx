/**
 * src/app/components/ValidationSection/ValidationSection.tsx
 *
 * VALID-04/D-09: a permanently reachable, own-canonical-parameters section that builds synthetic
 * 3x from the bundled total-return index and compares it against real UPRO/TQQQ history, so a
 * reader can check the model's own credibility claim without running any code. Mounted below the
 * two-column run layout in `App.tsx`, outside the D-20 screenshot region (D-09: independent of
 * whatever run is currently on screen).
 *
 * D-10 (AMENDED, 03-GATE-DIAGNOSIS.md): the synthetic is always built from the `${index}/total-
 * return` series, never the dividend-stripped leg -- a total-return swap counterparty delivers
 * the index's total return in exchange for financing, which is what the financing term already
 * prices. (T-05-05: this file's own series-id construction below is grepped for the literal
 * absence of the dividend-stripped leg's own series suffix, so that suffix is deliberately never
 * spelled out anywhere in this file, including this comment.)
 * Leverage is pinned at `SYNTHETIC_LEVERAGE` (never a numeric literal at the call site) and the
 * comparison window is the resolved inception overlap (`resolveOverlapWindow`,
 * `src/validation/synthetic-comparison.ts`). What is NOT pinned is cost: `expenseRatioPercent`
 * and `financingSpreadPercent` are read live from `backtestRequest()` on every recompute, so
 * editing either in the parameter column moves the figures rendered here.
 *
 * D-12: both gate statistics route through the single shared `computeTrackingError`
 * (`src/validation/tracking-error.ts`) -- no second stdev/geometric-return calculator exists in
 * this directory.
 *
 * F6: while the bundle has not finished loading, this section renders the same LoadingNotice
 * treatment the main result column uses and computes nothing. Once loaded, it never shows an
 * empty state -- a default fund (UPRO) is selected from the section's first render, independent
 * of whatever run is on screen. When `resolveOverlapWindow` reports the overlap is too short, the
 * section states that explicitly rather than rendering a small-sample tracking-error figure.
 * Switching the fund selector recomputes and replaces the window, both headline figures and (Task
 * 3) the sub-window table together, from one `createMemo` keyed on the fund signal, so no partial
 * state (some figures reflecting one fund, others the other) can exist.
 */

import { createMemo, createSignal, Show } from 'solid-js'

import { buildKernelInputs, type BacktestRequest } from '../../../data/kernel-inputs.ts'
import { runBacktest } from '../../../kernel/backtest.ts'
import {
  deriveReturns,
  readSeriesLevels,
  resolveOverlapWindow,
  sliceLevelsToWindow,
  SYNTHETIC_LEVERAGE,
} from '../../../validation/synthetic-comparison.ts'
import { computeTrackingError, type TrackingErrorResult, type TrackingErrorWindow } from '../../../validation/tracking-error.ts'
import { backtestRequest, loadedBundle, loadStatus } from '../../state.ts'
import { FundSelector, type Fund } from './FundSelector.tsx'
import { TrackingErrorSummary } from './TrackingErrorSummary.tsx'

interface ValidationFundConfig {
  indexSymbol: string
  indexSeriesId: string
  fundSeriesId: string
  indexDisplayName: string
}

/** D-10: SPX pairs with UPRO, NDX pairs with TQQQ (the existing gate test's own mapping, read
 * from the manifest at the series-id level, never guessed at the symbol level). */
const FUND_CONFIGS: Record<Fund, ValidationFundConfig> = {
  UPRO: {
    indexSymbol: 'SPX',
    indexSeriesId: 'SPX/total-return',
    fundSeriesId: 'UPRO/total-return',
    indexDisplayName: 'S&P 500',
  },
  TQQQ: {
    indexSymbol: 'NDX',
    indexSeriesId: 'NDX/total-return',
    fundSeriesId: 'TQQQ/total-return',
    indexDisplayName: 'Nasdaq-100',
  },
}

/** Arbitrary and irrelevant to both D-11 gates -- both are ratio-based, so the starting dollar
 * amount cancels out, the same reasoning the CI gate test's own `GATE_INITIAL_INVESTMENT` states. */
const VALIDATION_INITIAL_INVESTMENT = 10_000

export interface ValidationInsufficientOverlap {
  ok: false
  reason: string
}

export interface ValidationComputed {
  ok: true
  headline: TrackingErrorResult
}

export type ValidationComputation = ValidationInsufficientOverlap | ValidationComputed

function computeValidation(fund: Fund): ValidationComputation | null {
  if (loadStatus() !== 'ready') return null
  const bundle = loadedBundle()
  if (bundle === null) return null

  const config = FUND_CONFIGS[fund]
  const request = backtestRequest()

  let window
  try {
    window = resolveOverlapWindow(bundle, config.indexSeriesId, config.fundSeriesId)
  } catch (err) {
    // F6 error rule: a too-short overlap (or a missing series, defensively) states the failure
    // explicitly rather than computing a small-sample or undefined figure.
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }

  const kernelRequest: BacktestRequest = {
    symbol: config.indexSymbol,
    dividendReinvest: true,
    leverage: SYNTHETIC_LEVERAGE,
    entryDate: window.entryDate,
    holdingPeriodBars: null,
    initialInvestment: VALIDATION_INITIAL_INVESTMENT,
    contributionAmount: 0,
    contributionFrequency: 'none',
    // D-10's live pass-through: the only two values NOT pinned by the canonical config.
    expenseRatioPercent: request.expenseRatioPercent,
    financingSpreadPercent: request.financingSpreadPercent,
  }
  const inputs = buildKernelInputs(bundle, kernelRequest)
  runBacktest(inputs.params, inputs.series, inputs.outputs)

  const syntheticValues = inputs.outputs.outValue
  const syntheticReturns = deriveReturns(syntheticValues)

  const fundSeries = readSeriesLevels(bundle, config.fundSeriesId)
  const fundValues = sliceLevelsToWindow(
    fundSeries.levels,
    fundSeries.calendarStartIndex,
    inputs.window.entryIndex,
    inputs.window.barCount,
  )
  const fundReturns = deriveReturns(fundValues)

  const fullWindow: TrackingErrorWindow = {
    label: `${fund} full overlap window`,
    firstBar: 0,
    lastBar: inputs.window.barCount - 1,
    firstDayNumber: bundle.calendar[inputs.window.entryIndex] as number,
    lastDayNumber: bundle.calendar[inputs.window.entryIndex + inputs.window.barCount - 1] as number,
  }

  const headline = computeTrackingError(syntheticValues, fundValues, syntheticReturns, fundReturns, fullWindow)

  return { ok: true, headline }
}

export function ValidationSection() {
  const [fund, setFund] = createSignal<Fund>('UPRO')

  const computation = createMemo<ValidationComputation | null>(() => computeValidation(fund()))

  const subheading = createMemo(() => `Synthetic 3x ${FUND_CONFIGS[fund()].indexDisplayName} vs. real ${fund()}`)

  return (
    <section class="validation-section" id="validation" data-testid="validation-section">
      <h2 class="validation-heading">Does the model match reality?</h2>
      <p class="validation-subheading" data-testid="validation-subheading">
        {subheading()}
      </p>

      <Show when={loadStatus() === 'ready'} fallback={<p class="loading-notice">Loading market data...</p>}>
        <FundSelector fund={fund()} onChange={setFund} />

        <Show when={computation() !== null}>
          <Show
            when={computation()!.ok}
            fallback={
              <p class="validation-insufficient-overlap" data-testid="validation-insufficient-overlap">
                {(computation() as ValidationInsufficientOverlap).reason}
              </p>
            }
          >
            <TrackingErrorSummary headline={(computation() as ValidationComputed).headline} />
          </Show>
        </Show>
      </Show>
    </section>
  )
}
