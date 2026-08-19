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

import { seriesView } from '../../tools/bundle-compiler/src/binary-format.ts'
import { fromDaysSinceEpoch, toDaysSinceEpoch } from '../../tools/bundle-compiler/src/calendar.ts'
import { buildKernelInputs, type BacktestRequest, type LoadedBundle } from '../../src/data/kernel-inputs.ts'
import { loadBundleFromDisk } from '../../src/data/load-bundle-node.ts'
import { runBacktest } from '../../src/kernel/backtest.ts'
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

// D-13's two rate-regime era boundaries. These, and only these, are ISO dates written as literals
// in this file: they are era definitions the plan names explicitly, not data facts read off the
// manifest. Every other date in this file (fund/index coverage, the resolved overlap window, both
// sub-window boundaries' bar positions) is derived at run time.
const NEAR_ZERO_RATE_ERA_END = '2015-12-31'
const HIGH_RATE_ERA_START = '2022-01-01'

/** ROADMAP criterion 2 / T-03-22: a data refresh that silently truncates either fund's history
 * must fail this gate rather than narrow it into a flattering pass. */
const MIN_OVERLAP_YEARS = 15

const LEVERAGE = 3
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

/** Reads one manifest series' full decoded level array, plus the fields needed to slice it to an
 * arbitrary absolute-calendar-index window. */
function readSeriesLevels(
  bundle: LoadedBundle,
  seriesId: string,
): { levels: Float64Array; calendarStartIndex: number; lastDate: string } {
  const entry = bundle.manifest.series.find((s) => s.id === seriesId)
  if (entry === undefined) {
    throw new Error(`upro-tqqq-gate: no series named "${seriesId}" in the manifest`)
  }
  const asset = bundle.assets.get(entry.asset)
  if (asset === undefined) {
    throw new Error(`upro-tqqq-gate: asset file "${entry.asset}" for series "${seriesId}" was not loaded`)
  }
  const descriptor = asset.header.descriptors.find((d) => d.id === seriesId)
  if (descriptor === undefined) {
    throw new Error(`upro-tqqq-gate: no descriptor named "${seriesId}" in the decoded asset header`)
  }
  return {
    levels: seriesView(asset.buffer, asset.header, descriptor),
    calendarStartIndex: descriptor.calendarStartIndex,
    lastDate: entry.lastDate,
  }
}

/** Slices a full decoded level series to the exact `[entryAbsIndex, entryAbsIndex + barCount)`
 * absolute-calendar-index window the synthetic run occupies. */
function sliceLevelsToWindow(
  levels: Float64Array,
  calendarStartIndex: number,
  entryAbsIndex: number,
  barCount: number,
): Float64Array {
  const sliced = new Float64Array(barCount)
  for (let k = 0; k < barCount; k++) {
    const localIndex = entryAbsIndex + k - calendarStartIndex
    const value = levels[localIndex]
    if (value === undefined) {
      throw new Error(`upro-tqqq-gate: series level missing at local index ${localIndex} (bar ${k})`)
    }
    sliced[k] = value
  }
  return sliced
}

/** Derives daily returns from a level/value series the same way `src/data/kernel-inputs.ts` does:
 * `level[k] / level[k-1] - 1`. Bar 0 is defined as 0, matching D-03's cost-free-anchor convention
 * both the kernel's own `outValue` and every level series here already follow at their own bar 0. */
function deriveReturns(values: Float64Array): Float64Array {
  const returns = new Float64Array(values.length)
  returns[0] = 0
  for (let k = 1; k < values.length; k++) {
    const previous = values[k - 1] as number
    const current = values[k] as number
    returns[k] = previous !== 0 ? current / previous - 1 : 0
  }
  return returns
}

/** Standard lower-bound binary search over the local bar range `[0, barCount)`, returning the
 * greatest local bar index `k` whose absolute calendar day is `<= targetDays`, or -1 if none. */
function localIndexAtOrBefore(
  calendar: Int32Array,
  entryAbsIndex: number,
  barCount: number,
  targetDays: number,
): number {
  let lo = 0
  let hi = barCount - 1
  let result = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const days = calendar[entryAbsIndex + mid] as number
    if (days <= targetDays) {
      result = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return result
}

/** Mirror of `localIndexAtOrBefore`: the least local bar index `k` whose absolute calendar day is
 * `>= targetDays`, or `barCount` if none. */
function localIndexAtOrAfter(
  calendar: Int32Array,
  entryAbsIndex: number,
  barCount: number,
  targetDays: number,
): number {
  let lo = 0
  let hi = barCount - 1
  let result = barCount
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const days = calendar[entryAbsIndex + mid] as number
    if (days >= targetDays) {
      result = mid
      hi = mid - 1
    } else {
      lo = mid + 1
    }
  }
  return result
}

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

      // D-10: the overlap window's first bar is the LATER of the two series' own firstDate --
      // for both fund pairs, that is the fund's own inception date, read from the manifest, never
      // hardcoded.
      const overlapFirstDate = indexEntry!.firstDate > fundEntry!.firstDate ? indexEntry!.firstDate : fundEntry!.firstDate

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
        entryDate: overlapFirstDate,
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

      // T-03-22: the resolved window must be derived from the manifest at run time and must clear
      // 15 years, so a data refresh that silently truncates history fails the gate rather than
      // narrowing it into a flattering pass.
      const overlapYears =
        (toDaysSinceEpoch(inputs.window.lastDate) - toDaysSinceEpoch(inputs.window.firstDate)) / 365.25
      expect(
        overlapYears,
        `${config.fundName} overlap window (${inputs.window.firstDate}..${inputs.window.lastDate}) is only ` +
          `${overlapYears.toFixed(2)} years, below the required ${MIN_OVERLAP_YEARS}`,
      ).toBeGreaterThanOrEqual(MIN_OVERLAP_YEARS)

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

      const nearZeroRateLastBar = localIndexAtOrBefore(
        calendar,
        entryAbsIndex,
        barCount,
        toDaysSinceEpoch(NEAR_ZERO_RATE_ERA_END),
      )
      const highRateFirstBar = localIndexAtOrAfter(
        calendar,
        entryAbsIndex,
        barCount,
        toDaysSinceEpoch(HIGH_RATE_ERA_START),
      )

      // D-13: reported only, never gated. Only built when the fund's own window actually reaches
      // into that era with at least the 2 bars computeTrackingError requires.
      const subWindows: TrackingErrorWindow[] = []
      if (nearZeroRateLastBar >= 1) {
        subWindows.push({
          label: `${config.fundName} near-zero-rate era (through ${NEAR_ZERO_RATE_ERA_END})`,
          firstBar: 0,
          lastBar: nearZeroRateLastBar,
          firstDayNumber: calendar[entryAbsIndex] as number,
          lastDayNumber: calendar[entryAbsIndex + nearZeroRateLastBar] as number,
        })
      }
      if (highRateFirstBar <= barCount - 2) {
        subWindows.push({
          label: `${config.fundName} high-rate era (from ${HIGH_RATE_ERA_START})`,
          firstBar: highRateFirstBar,
          lastBar: barCount - 1,
          firstDayNumber: calendar[entryAbsIndex + highRateFirstBar] as number,
          lastDayNumber: calendar[entryAbsIndex + barCount - 1] as number,
        })
      }

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
