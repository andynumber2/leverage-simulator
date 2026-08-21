/**
 * tests/validation/upro-tqqq-gate.test.ts
 *
 * VALID-01/VALID-02's build-failing gate: synthetic 3x S&P 500 (built from `SPX/price-return`)
 * compared against real UPRO (`UPRO/total-return`), and synthetic 3x Nasdaq-100 (built from
 * `NDX/price-return`) against real TQQQ (`TQQQ/total-return`), through
 * `src/validation/tracking-error.ts`'s single shared `computeTrackingError` (D-10, D-12). Runs in
 * the Node `unit` project (03-06-PLAN.md Task 2): it needs filesystem access to the committed
 * `public/data/` bundle and is a correctness gate rather than a timing measurement.
 *
 * VALID-03/D-20's no-fitting protocol governs a failure here: classify the residual's pattern
 * against `src/validation/cost-parameters.ts`'s D-20 table before changing anything.
 * `COST_PARAMETERS` (`src/validation/cost-parameters.ts`) is never edited in response to a
 * measurement taken by this file, in any of D-20's three permitted outcomes.
 */

import { describe, expect, test } from 'vitest'

import { fromDaysSinceEpoch } from '../../tools/bundle-compiler/src/calendar.ts'
import { buildKernelInputs, type BacktestRequest } from '../../src/data/kernel-inputs.ts'
import { loadBundleFromDisk } from '../../src/data/load-bundle-node.ts'
import { runBacktest } from '../../src/kernel/backtest.ts'
import {
  buildRateRegimeWindows,
  deriveReturns,
  readSeriesLevels,
  resolveOverlapWindow,
  sliceLevelsToWindow,
  SYNTHETIC_LEVERAGE as LEVERAGE,
} from '../../src/validation/synthetic-comparison.ts'
import {
  computeTrackingError,
  type TrackingErrorResult,
  type TrackingErrorWindow,
} from '../../src/validation/tracking-error.ts'
import {
  COST_PARAMETERS,
  FINANCING_SPREAD_DEFAULT,
  RETURN_DRIFT_TOLERANCE,
  TQQQ_INCEPTION_ERA_EXPENSE_RATIO,
  TRACKING_ERROR_TOLERANCE,
  UPRO_INCEPTION_ERA_EXPENSE_RATIO,
} from '../../src/validation/cost-parameters.ts'

/** Arbitrary and irrelevant to every statistic this file computes: both D-11 gates are ratio-
 * based (a return, not a dollar amount), so the starting dollar amount cancels out. Chosen only
 * to match the CLI's own default for readability of any ad-hoc debugging run. */
const GATE_INITIAL_INVESTMENT = 10_000

/**
 * D-20's residual-diagnosis protocol, restated verbatim (mirroring `cost-parameters.ts`'s header
 * table) so a reader who sees a red build gets the diagnosis protocol at the point of failure
 * without having to find it. Cost parameters (`COST_PARAMETERS`) stay untouched in all three
 * permitted outcomes -- stated explicitly here per VALID-03.
 */
const D20_RESIDUAL_DIAGNOSIS = `
D-20's first-run failure protocol -- classify the residual's pattern against this table BEFORE
changing anything. Cost parameters in src/validation/cost-parameters.ts's COST_PARAMETERS stay
UNTOUCHED in every one of the three permitted outcomes below.

| Residual pattern                                                | Cause                        | Outcome                        |
|-------------------------------------------------------------------|--------------------------------|----------------------------------|
| Steady ~0.3-0.5%/yr gap, uncorrelated with rate regime             | ER or day-count (A4)           | Fix structure                    |
| Divergence concentrated in the high-rate era                      | Spread mis-calibration (A6)    | Widen tolerance, Key Decision    |
| Bias tracking the count of 3-day weekends per year                 | Calendar accrual (A8)          | Fix structure                    |
| Synthetic far too pessimistic overall                             | Wrong rate type, retail (A3)   | Fix structure                    |
| Small, stable, patternless                                        | Genuinely un-modelled cost     | Accept, record the number        |

Permitted outcomes, exactly one of which applies:
  1. Fix a genuine structural defect in the model.
  2. Widen the tolerance ONLY by naming the specific un-modelled mechanism and adding it to
     TOLERANCE_MECHANISMS (src/validation/cost-parameters.ts) with its own basis and confidence.
  3. Accept and record the number as-is (the "small, stable, patternless" row is load-bearing: an
     honest two-parameter model is expected to leave a small residual).
Cost parameters stay untouched in all three outcomes.
`.trim()

interface FundGateConfig {
  fundName: string
  indexSymbol: string
  indexSeriesId: string
  fundSeriesId: string
  expenseRatio: number
  expenseRatioConfidence: string
}

const FUND_GATE_CONFIGS: readonly FundGateConfig[] = [
  {
    fundName: 'UPRO',
    indexSymbol: 'SPX',
    indexSeriesId: 'SPX/total-return',
    fundSeriesId: 'UPRO/total-return',
    expenseRatio: UPRO_INCEPTION_ERA_EXPENSE_RATIO,
    expenseRatioConfidence: COST_PARAMETERS['upro-inception-era-expense-ratio'].confidence,
  },
  {
    fundName: 'TQQQ',
    indexSymbol: 'NDX',
    indexSeriesId: 'NDX/total-return',
    fundSeriesId: 'TQQQ/total-return',
    expenseRatio: TQQQ_INCEPTION_ERA_EXPENSE_RATIO,
    expenseRatioConfidence: COST_PARAMETERS['tqqq-inception-era-expense-ratio'].confidence,
  },
]

function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(4)}%`
}

function gateFailureMessage(fundName: string, metricName: string, measured: number, tolerance: number): string {
  return (
    `${fundName} ${metricName} gate FAILED: measured ${formatPercent(measured)} exceeds tolerance ` +
    `${formatPercent(tolerance)} (fund: ${fundName}).\n\n${D20_RESIDUAL_DIAGNOSIS}`
  )
}

describe('VALID-01/VALID-02: UPRO and TQQQ tracking-error gate', () => {
  for (const config of FUND_GATE_CONFIGS) {
    test(`${config.fundName}: synthetic 3x ${config.indexSymbol} tracks real ${config.fundName} total return within tolerance`, async () => {
      const bundle = await loadBundleFromDisk()

      const indexEntry = bundle.manifest.series.find((s) => s.id === config.indexSeriesId)
      const fundEntry = bundle.manifest.series.find((s) => s.id === config.fundSeriesId)
      expect(indexEntry, `manifest series "${config.indexSeriesId}" not found`).toBeDefined()
      expect(fundEntry, `manifest series "${config.fundSeriesId}" not found`).toBeDefined()

      // D-10/T-03-22: resolveOverlapWindow both derives the overlap start (the LATER of the two
      // series' own firstDate) and throws a stated failure if the resolved, rate-coverage-
      // truncated window is below MIN_OVERLAP_YEARS -- a data refresh that silently truncates
      // history fails this gate rather than narrowing it into a flattering pass.
      const resolvedWindow = resolveOverlapWindow(bundle, config.indexSeriesId, config.fundSeriesId)

      const request: BacktestRequest = {
        symbol: config.indexSymbol,
        // D-10 AMENDED (03-GATE-DIAGNOSIS.md): the synthetic applies leverage to the
        // TOTAL-return index. D-10 as originally written said price-return, which put the two
        // sides of this comparison on different dividend conventions -- the synthetic excluded
        // dividends while the reference fund series includes its distributions -- and that
        // asymmetry, not any cost, was the entire Gate 2 residual (UPRO -6.968%, TQQQ -3.860%).
        // Matching the conventions moves them to +0.254% and +0.399%. It is also the more
        // defensible model: a total-return swap counterparty delivers the index's total return
        // in exchange for financing, which is what the financing term already prices.
        dividendReinvest: true,
        leverage: LEVERAGE,
        entryDate: resolvedWindow.entryDate,
        holdingPeriodBars: null, // hold-to-today: buildKernelInputs applies D-29's rate-coverage truncation.
        initialInvestment: GATE_INITIAL_INVESTMENT,
        contributionAmount: 0,
        contributionFrequency: 'none',
        // D-16/D-17: the fund's own inception-era expense ratio for the gate run, never the
        // generic hypothetical-run default.
        expenseRatioPercent: config.expenseRatio * 100,
        financingSpreadPercent: FINANCING_SPREAD_DEFAULT * 100,
      }

      const inputs = buildKernelInputs(bundle, request)

      // Defensive: the fund's own coverage must reach at least as far as the resolved (price/rate-
      // truncated) window's own end, so a future refresh that shortens fund coverage below the
      // index/rate coverage cannot silently compare against stale fund bars.
      expect(
        fundEntry!.lastDate >= inputs.window.lastDate,
        `${config.fundName}'s own lastDate (${fundEntry!.lastDate}) is before the resolved window's ` +
          `lastDate (${inputs.window.lastDate})`,
      ).toBe(true)

      const result = runBacktest(inputs.params, inputs.series, inputs.outputs)
      expect(
        result.ruined,
        `${config.fundName} synthetic 3x run unexpectedly ruined at bar ${result.ruinBarIndex} -- the real ` +
          'fund never went to zero over this window, so a ruined synthetic indicates a modelling bug, not a ' +
          'tolerance question',
      ).toBe(false)

      const barCount = inputs.window.barCount
      const entryAbsIndex = inputs.window.entryIndex
      const calendar = bundle.calendar

      const syntheticValues = inputs.outputs.outValue
      const syntheticReturns = deriveReturns(syntheticValues)

      const fundSeries = readSeriesLevels(bundle, config.fundSeriesId)
      const fundValues = sliceLevelsToWindow(fundSeries.levels, fundSeries.calendarStartIndex, entryAbsIndex, barCount)
      const fundReturns = deriveReturns(fundValues)

      const indexSeries = readSeriesLevels(bundle, config.indexSeriesId)
      const indexValues = sliceLevelsToWindow(indexSeries.levels, indexSeries.calendarStartIndex, entryAbsIndex, barCount)
      const indexReturns = deriveReturns(indexValues)

      const fullWindow: TrackingErrorWindow = {
        label: `${config.fundName} full overlap window`,
        firstBar: 0,
        lastBar: barCount - 1,
        firstDayNumber: calendar[entryAbsIndex] as number,
        lastDayNumber: calendar[entryAbsIndex + barCount - 1] as number,
      }

      // D-13: reported only, never gated. Only built when the fund's own window actually reaches
      // into that era with at least the 2 bars computeTrackingError requires.
      const subWindows = buildRateRegimeWindows(calendar, entryAbsIndex, barCount, config.fundName)

      const allWindows = [fullWindow, ...subWindows]
      const allResults: TrackingErrorResult[] = allWindows.map((window) =>
        computeTrackingError(syntheticValues, fundValues, syntheticReturns, fundReturns, window),
      )

      // VALID-03: the residual is printed as a number on EVERY run, pass or fail -- reported, not
      // narrowed. Each fund's expense-ratio confidence tag is printed alongside every block so a
      // reader sees immediately whether the figure driving the fit was CITED or still ASSUMED.
      for (let i = 0; i < allWindows.length; i++) {
        const window = allWindows[i] as TrackingErrorWindow
        const windowResult = allResults[i] as TrackingErrorResult
        console.log(
          `[UPRO/TQQQ gate] ${window.label} | bars=${windowResult.barCount} years=${windowResult.years.toFixed(3)} ` +
            `dates=${fromDaysSinceEpoch(window.firstDayNumber)}..${fromDaysSinceEpoch(window.lastDayNumber)} | ` +
            `annualizedTrackingError=${formatPercent(windowResult.annualizedTrackingError)} ` +
            `annualizedReturnDrift=${formatPercent(windowResult.annualizedReturnDrift)} ` +
            `syntheticAnnualizedReturn=${formatPercent(windowResult.syntheticAnnualizedReturn)} ` +
            `referenceAnnualizedReturn=${formatPercent(windowResult.referenceAnnualizedReturn)} | ` +
            `expenseRatio=${formatPercent(config.expenseRatio)} (${config.expenseRatioConfidence})`,
        )
      }

      const fullResult = allResults[0] as TrackingErrorResult

      // VALID-01/D-11 Gate 1: the build fails when the full-window annualized tracking error
      // exceeds TRACKING_ERROR_TOLERANCE. Gated ONLY on the full window (D-13); neither sub-window
      // above gates anything.
      expect(
        fullResult.annualizedTrackingError,
        gateFailureMessage(
          config.fundName,
          'annualized tracking error',
          fullResult.annualizedTrackingError,
          TRACKING_ERROR_TOLERANCE,
        ),
      ).toBeLessThanOrEqual(TRACKING_ERROR_TOLERANCE)

      // VALID-02/D-11 Gate 2: the build fails when the full-window annualized return drift's
      // magnitude exceeds RETURN_DRIFT_TOLERANCE, in either direction.
      expect(
        Math.abs(fullResult.annualizedReturnDrift),
        gateFailureMessage(
          config.fundName,
          'annualized return drift',
          fullResult.annualizedReturnDrift,
          RETURN_DRIFT_TOLERANCE,
        ),
      ).toBeLessThanOrEqual(RETURN_DRIFT_TOLERANCE)

      // T-03-25: unconditional on either tolerance -- the synthetic's own annualized return must
      // be strictly below 3x the bare index's own annualized return over the identical window.
      // This is volatility drag plus costs and it must be present; a synthetic that BEAT the
      // naive multiple would mean a sign error somewhere in the cost model, caught here
      // independently of whether either tolerance above happened to be loose.
      const indexComparison = computeTrackingError(syntheticValues, indexValues, syntheticReturns, indexReturns, fullWindow)
      const naiveMultipleReturn = 3 * indexComparison.referenceAnnualizedReturn
      expect(
        indexComparison.syntheticAnnualizedReturn,
        `${config.fundName}: synthetic's annualized return (${formatPercent(indexComparison.syntheticAnnualizedReturn)}) ` +
          `must be strictly below 3x the index's own annualized return ` +
          `(${formatPercent(naiveMultipleReturn)}) -- a synthetic beating the naive multiple would indicate a ` +
          'sign error in the cost model, independent of either tolerance above',
      ).toBeLessThan(naiveMultipleReturn)
    })
  }
})
