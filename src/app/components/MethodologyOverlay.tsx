/**
 * src/app/components/MethodologyOverlay.tsx
 *
 * CRED-04/D-17/D-18: the receipts page. Renders nothing when `methodologyOverlayOpen()` is
 * false; when open, a full-screen overlay with the Copywriting Contract's four fixed sections in
 * order -- cost model, day-count conventions, data sources, known limitations -- generated from
 * the code's own registries (`COST_PARAMETERS`, `TOLERANCE_MECHANISMS`, the kernel's day-count
 * constants, the loaded manifest, the D-21 generated bias figure) rather than written as prose
 * about them. Every number routes through `src/metrics/format.ts`; no value here is re-rounded,
 * re-derived from an already-computed metric, or duplicated as a numeric literal that could drift
 * from the registry it names.
 *
 * D-19c/D-19d's two gate-diagnosis figures (TQQQ's margin against the tracking-error tolerance,
 * and the post-2022 high-rate return-drift figures for both funds) are not committed constants
 * anywhere in this codebase -- unlike the D-21 extended-tier-bias figure, no generated module
 * pins them. Rather than hand-author them as literals that could silently drift from the model
 * (T-05-19's own prohibition), this component computes them live, once, from the already-loaded
 * bundle -- the same canonical construction `tests/validation/upro-tqqq-gate.test.ts` and
 * `ValidationSection.tsx` already use (`resolveOverlapWindow`, `buildKernelInputs`,
 * `runBacktest`, `buildRateRegimeWindows`, `computeTrackingError`), pinned to the gate's own
 * inception-era expense ratios and `FINANCING_SPREAD_DEFAULT` rather than the parameter column's
 * live, user-editable values, so the methodology page states a fixed methodological fact rather
 * than one that moves with whatever the reader happens to have the cost sliders set to right now.
 * "Already resident in memory by the time it can be opened" (this plan's own must-have) is
 * satisfied because the overlay can only be reached from an existing result, which requires the
 * bundle to already be loaded -- the memo below is keyed on `loadedBundle()` and therefore never
 * shows an independent loading state of its own.
 */

import { createMemo, For, onCleanup, onMount, Show } from 'solid-js'

import type { LoadedBundle } from '../../data/bundle-source.ts'
import { buildKernelInputs, type BacktestRequest } from '../../data/kernel-inputs.ts'
import { EXPENSE_DAY_COUNT_BASIS, FINANCING_DAY_COUNT_BASIS, LONG_GAP_FLAG_MIN_DAYS } from '../../kernel/backtest.types.ts'
import { runBacktest } from '../../kernel/backtest.ts'
import { formatPercent } from '../../metrics/format.ts'
import {
  buildRateRegimeWindows,
  deriveReturns,
  readSeriesLevels,
  resolveOverlapWindow,
  sliceLevelsToWindow,
  SYNTHETIC_LEVERAGE,
} from '../../validation/synthetic-comparison.ts'
import {
  COST_PARAMETERS,
  FINANCING_SPREAD_DEFAULT,
  FINANCING_SPREAD_RANGE,
  RETURN_DRIFT_TOLERANCE,
  TOLERANCE_MECHANISMS,
  TQQQ_INCEPTION_ERA_EXPENSE_RATIO,
  TRACKING_ERROR_TOLERANCE,
  UPRO_INCEPTION_ERA_EXPENSE_RATIO,
  type CostParameterId,
} from '../../validation/cost-parameters.ts'
import { EXTENDED_TIER_BIAS_ANNUALIZED_FRACTION } from '../../validation/extended-tier-bias.generated.ts'
import { computeTrackingError, type TrackingErrorWindow } from '../../validation/tracking-error.ts'
import { closeMethodologyOverlay, loadedBundle, methodologyOverlayOpen } from '../state.ts'

/** Fixed emission order, matching the registry's own key order -- never re-sorted, so an added
 * cost parameter appears here the moment it is added to `COST_PARAMETERS`. */
const COST_PARAMETER_ORDER: readonly CostParameterId[] = [
  'upro-inception-era-expense-ratio',
  'tqqq-inception-era-expense-ratio',
  'generic-3x-expense-ratio',
  'financing-spread-lower',
  'financing-spread-upper',
]

interface FundGateConfig {
  fund: 'UPRO' | 'TQQQ'
  indexSymbol: string
  indexSeriesId: string
  fundSeriesId: string
  expenseRatio: number
}

const FUND_GATE_CONFIGS: readonly FundGateConfig[] = [
  {
    fund: 'UPRO',
    indexSymbol: 'SPX',
    indexSeriesId: 'SPX/total-return',
    fundSeriesId: 'UPRO/total-return',
    expenseRatio: UPRO_INCEPTION_ERA_EXPENSE_RATIO,
  },
  {
    fund: 'TQQQ',
    indexSymbol: 'NDX',
    indexSeriesId: 'NDX/total-return',
    fundSeriesId: 'TQQQ/total-return',
    expenseRatio: TQQQ_INCEPTION_ERA_EXPENSE_RATIO,
  },
]

interface FundGateSnapshot {
  /** D-11 Gate 1 over the full overlap window, at the gate's own canonical (non-user-editable)
   * cost parameters -- the same figure `TRACKING_ERROR_TOLERANCE` gates in CI. */
  fullTrackingError: number
  /** D-11 Gate 2 over the high-rate sub-window (from 2022-01-01) only, or `null` when the
   * resolved overlap does not reach into that era with the two bars `computeTrackingError`
   * requires. */
  highRateDrift: number | null
}

/** The gate's own canonical construction (same config `tests/validation/upro-tqqq-gate.test.ts`
 * runs in CI): the fund's own inception-era expense ratio, `FINANCING_SPREAD_DEFAULT`, and the
 * resolved overlap window -- never the parameter column's live values, which this component does
 * not read. */
function computeFundGateSnapshot(bundle: LoadedBundle, config: FundGateConfig): FundGateSnapshot {
  const resolvedWindow = resolveOverlapWindow(bundle, config.indexSeriesId, config.fundSeriesId)

  const request: BacktestRequest = {
    symbol: config.indexSymbol,
    dividendReinvest: true,
    leverage: SYNTHETIC_LEVERAGE,
    entryDate: resolvedWindow.entryDate,
    holdingPeriodBars: null,
    initialInvestment: 10_000,
    contributionAmount: 0,
    contributionFrequency: 'none',
    expenseRatioPercent: config.expenseRatio * 100,
    financingSpreadPercent: FINANCING_SPREAD_DEFAULT * 100,
  }
  const inputs = buildKernelInputs(bundle, request)
  runBacktest(inputs.params, inputs.series, inputs.outputs)

  const barCount = inputs.window.barCount
  const entryAbsIndex = inputs.window.entryIndex
  const calendar = bundle.calendar

  const syntheticValues = inputs.outputs.outValue
  const syntheticReturns = deriveReturns(syntheticValues)

  const fundSeries = readSeriesLevels(bundle, config.fundSeriesId)
  const fundValues = sliceLevelsToWindow(fundSeries.levels, fundSeries.calendarStartIndex, entryAbsIndex, barCount)
  const fundReturns = deriveReturns(fundValues)

  const fullWindow: TrackingErrorWindow = {
    label: `${config.fund} full overlap window`,
    firstBar: 0,
    lastBar: barCount - 1,
    firstDayNumber: calendar[entryAbsIndex] as number,
    lastDayNumber: calendar[entryAbsIndex + barCount - 1] as number,
  }
  const fullResult = computeTrackingError(syntheticValues, fundValues, syntheticReturns, fundReturns, fullWindow)

  const regimeWindows = buildRateRegimeWindows(calendar, entryAbsIndex, barCount, config.fund)
  const highRateWindow = regimeWindows.find((w) => w.label.includes('high-rate'))
  const highRateDrift =
    highRateWindow === undefined
      ? null
      : computeTrackingError(syntheticValues, fundValues, syntheticReturns, fundReturns, highRateWindow)
          .annualizedReturnDrift

  return { fullTrackingError: fullResult.annualizedTrackingError, highRateDrift }
}

/** The one measured (not reasoned) row in `TOLERANCE_MECHANISMS` -- the premium/discount noise
 * from comparing against Yahoo market closes rather than fund NAV, D-15's repriced entry (see
 * that file's own header). Read by id rather than array position, so a reordering of the
 * registry cannot silently point this component at the wrong row. */
function findMeasuredNoiseMechanism() {
  const mechanism = TOLERANCE_MECHANISMS.find((m) => m.id === 'fund-nav-vs-market-close-pricing-basis')
  if (mechanism === undefined) {
    throw new Error(
      'MethodologyOverlay: TOLERANCE_MECHANISMS no longer carries the "fund-nav-vs-market-close-pricing-basis" row',
    )
  }
  return mechanism
}

export function MethodologyOverlay() {
  // Gated on `methodologyOverlayOpen()`, not just `loadedBundle()`: the overlay can only ever be
  // reached from an existing result, so the bundle it needs is always already resident in memory
  // by the time this actually runs, and gating this way means a bundle that loaded (or
  // half-loaded, e.g. a manifest that failed `applyLoadedBundle`'s own series lookup after
  // `setBundle` had already fired) while the overlay was never opened never triggers this
  // computation at all. Wrapped in `try`/`catch` as defence in depth beyond that gate: a
  // synchronous throw inside a Solid `createMemo` is not contained to this component, it
  // propagates out through the reactive graph and can take an unrelated part of the app down with
  // it, so a bundle that (defensively) turns out to be missing one of the gate's fund/index series
  // degrades this one figure to "not yet available" rather than crashing anything.
  const gateSnapshots = createMemo(() => {
    if (!methodologyOverlayOpen()) return null
    const bundle = loadedBundle()
    if (bundle === null) return null
    try {
      return {
        UPRO: computeFundGateSnapshot(bundle, FUND_GATE_CONFIGS[0]!),
        TQQQ: computeFundGateSnapshot(bundle, FUND_GATE_CONFIGS[1]!),
      }
    } catch {
      return null
    }
  })

  const noiseMechanism = findMeasuredNoiseMechanism()
  const noiseFraction = noiseMechanism.basisPointsPerYear / 10_000
  const noiseShareOfTolerance = noiseFraction / TRACKING_ERROR_TOLERANCE

  const tqqqMargin = createMemo(() => {
    const snapshots = gateSnapshots()
    if (snapshots === null) return null
    return (TRACKING_ERROR_TOLERANCE - snapshots.TQQQ.fullTrackingError) / TRACKING_ERROR_TOLERANCE
  })

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && methodologyOverlayOpen()) {
      closeMethodologyOverlay()
    }
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeydown)
  })
  onCleanup(() => {
    document.removeEventListener('keydown', handleKeydown)
  })

  return (
    <Show when={methodologyOverlayOpen()}>
      <div class="methodology-overlay" data-testid="methodology-overlay" role="dialog" aria-modal="true">
        <div class="methodology-overlay-header">
          <h1 class="methodology-overlay-title">Methodology</h1>
          <button
            type="button"
            class="methodology-overlay-close"
            data-testid="methodology-overlay-close"
            aria-label="Close"
            onClick={() => closeMethodologyOverlay()}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <line x1="2" y1="2" x2="14" y2="14" stroke-linecap="round" />
              <line x1="14" y1="2" x2="2" y2="14" stroke-linecap="round" />
            </svg>
          </button>
        </div>

        <div class="methodology-overlay-content">
          <section class="methodology-section" data-testid="methodology-section-cost-model">
            <h2 class="methodology-section-heading">Cost model</h2>
            <For each={COST_PARAMETER_ORDER}>
              {(id) => {
                const parameter = COST_PARAMETERS[id]
                return (
                  <div class="methodology-row" data-testid={`methodology-cost-parameter-${id}`}>
                    <span class="methodology-row-name">{parameter.description}</span>
                    <span class="methodology-row-value">{formatPercent(parameter.value)}</span>
                    <span class="methodology-row-confidence" data-testid={`methodology-cost-confidence-${id}`}>
                      {parameter.confidence}
                    </span>
                    <span class="methodology-row-citation">{parameter.citation}</span>
                  </div>
                )
              }}
            </For>

            <p class="methodology-prose">
              Costs are attributed to volatility drag, financing cost and expense ratio through a
              Shapley allocation over three factors (compounding, financing, expense ratio),
              evaluated across all eight combinations of the three switched on or off. This is an
              ASSUMED modelling choice, not a cited convention: the four combinations that omit
              compounding have no meaning inside the daily-rebalanced kernel itself, so financing
              and expense ratio are applied as simple, non-compounded annualized deductions over
              the same per-bar day-count arithmetic the kernel itself uses for those arms.
            </p>

            <h3 class="methodology-subheading">Validation tolerance breakdown</h3>
            <For each={TOLERANCE_MECHANISMS}>
              {(mechanism) => (
                <div class="methodology-row" data-testid={`methodology-tolerance-mechanism-${mechanism.id}`}>
                  <span class="methodology-row-name">{mechanism.basis}</span>
                  <span class="methodology-row-value">{formatPercent(mechanism.basisPointsPerYear / 10_000)}/yr</span>
                  <span class="methodology-row-confidence">{mechanism.appliesTo}, {mechanism.direction}{mechanism.measured === true ? ', measured' : ''}</span>
                </div>
              )}
            </For>
            <div class="methodology-row" data-testid="methodology-tolerance-totals">
              <span class="methodology-row-name">Tracking-error tolerance (Gate 1)</span>
              <span class="methodology-row-value">{formatPercent(TRACKING_ERROR_TOLERANCE)}</span>
            </div>
            <div class="methodology-row" data-testid="methodology-tolerance-totals-drift">
              <span class="methodology-row-name">Return-drift tolerance (Gate 2)</span>
              <span class="methodology-row-value">{formatPercent(RETURN_DRIFT_TOLERANCE)}</span>
            </div>
          </section>

          <section class="methodology-section" data-testid="methodology-section-day-count">
            <h2 class="methodology-section-heading">Day-count conventions</h2>
            <div class="methodology-row" data-testid="methodology-day-count-financing">
              <span class="methodology-row-name">Financing accrual basis</span>
              <span class="methodology-row-value">actual/{FINANCING_DAY_COUNT_BASIS}</span>
            </div>
            <div class="methodology-row" data-testid="methodology-day-count-expense">
              <span class="methodology-row-name">Expense-ratio accrual basis</span>
              <span class="methodology-row-value">actual/{EXPENSE_DAY_COUNT_BASIS}</span>
            </div>
            <div class="methodology-row" data-testid="methodology-day-count-long-gap">
              <span class="methodology-row-name">Long-calendar-gap flag threshold</span>
              <span class="methodology-row-value">{LONG_GAP_FLAG_MIN_DAYS} calendar days</span>
            </div>
          </section>

          <section class="methodology-section" data-testid="methodology-section-data-sources">
            <h2 class="methodology-section-heading">Data sources</h2>
            <Show when={loadedBundle() !== null} fallback={<p class="methodology-prose">No bundle loaded.</p>}>
              <For each={loadedBundle()!.manifest.series}>
                {(series) => (
                  <div class="methodology-row" data-testid={`methodology-source-${series.id}`}>
                    <span class="methodology-row-name">{series.id}</span>
                    <span class="methodology-row-value">
                      {series.sources.map((s) => s.source).join(', ')}
                    </span>
                    <Show when={series.seams.length > 0}>
                      <span class="methodology-row-citation">
                        {series.seams.length} seam{series.seams.length === 1 ? '' : 's'}:{' '}
                        {series.seams.map((seam) => `${seam.firstDate}–${seam.lastDate} (${seam.kind})`).join('; ')}
                      </span>
                    </Show>
                  </div>
                )}
              </For>
            </Show>
          </section>

          <section class="methodology-section" data-testid="methodology-section-limitations">
            <h2 class="methodology-section-heading">Known limitations</h2>

            <p class="methodology-limitation" data-testid="methodology-limitation-extended-tier">
              The extended tier's interpolated monthly data understates volatility drag by{' '}
              {formatPercent(EXTENDED_TIER_BIAS_ANNUALIZED_FRACTION)}/yr, making leverage look
              better than it was in the pre-1954 era the tier exists to reach.
            </p>

            <p class="methodology-limitation" data-testid="methodology-limitation-financing-spread">
              The financing spread is ASSUMED, not CITED: five retrieval attempts, including two
              full fund filings, found no fund that itemizes its swap financing spread. It is set
              at {formatPercent(FINANCING_SPREAD_RANGE.lower)} to{' '}
              {formatPercent(FINANCING_SPREAD_RANGE.upper)} over the short rate - the most
              load-bearing cost parameter in the model is the one with the weakest sourcing.
            </p>

            <p class="methodology-limitation" data-testid="methodology-limitation-gate-tolerance">
              The gate's {formatPercent(TRACKING_ERROR_TOLERANCE)} tracking-error tolerance is
              weaker than its headline number: roughly {formatPercent(noiseShareOfTolerance)} of
              it comes from one measured mechanism, {formatPercent(noiseFraction)}/yr of
              premium/discount noise from comparing against market closing prices rather than fund
              NAV.{' '}
              <Show when={tqqqMargin() !== null} fallback="TQQQ's margin against the tolerance is not yet available.">
                TQQQ's own margin against the tolerance is a thin {formatPercent(tqqqMargin()!)}.
              </Show>
            </p>

            <p class="methodology-limitation" data-testid="methodology-limitation-high-rate-drift">
              Since 2022, the model tracks slightly worse in the high-rate regime than its{' '}
              {formatPercent(RETURN_DRIFT_TOLERANCE)} full-window return-drift tolerance would
              suggest, hinting the financing spread may be a little under-priced.{' '}
              <Show
                when={gateSnapshots() !== null && gateSnapshots()!.UPRO.highRateDrift !== null && gateSnapshots()!.TQQQ.highRateDrift !== null}
                fallback="The high-rate sub-window drift is not yet available."
              >
                UPRO drifts {formatPercent(gateSnapshots()!.UPRO.highRateDrift!)}/yr and TQQQ drifts{' '}
                {formatPercent(gateSnapshots()!.TQQQ.highRateDrift!)}/yr against the reference fund
                over that sub-window.
              </Show>{' '}
              Left alone deliberately: this project does not adjust a cost parameter to close a
              measured gap.
            </p>
          </section>
        </div>
      </div>
    </Show>
  )
}
