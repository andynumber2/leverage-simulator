/**
 * src/validation/tracking-error.ts
 *
 * D-12's single shared tracking-error function: sibling to the kernel, never imported by it
 * (SIM-10). Implements D-11's two gates over a synthetic-vs-real comparison window:
 *
 * - **Gate 1 (`annualizedTrackingError`)**: the standard deviation of the per-bar daily-return
 *   differences, annualized by `sqrt(252)`. A precision measure -- catches mechanism errors
 *   (leverage applied to the wrong quantity, a sign error) even when they average out over time.
 * - **Gate 2 (`annualizedReturnDrift`)**: the difference between each series' own geometric
 *   annualized return over the window. A bias measure -- catches cost-model errors (a
 *   persistently too-cheap or too-expensive synthetic) that Gate 1 alone would not surface if the
 *   daily dispersion itself stays small.
 *
 * `computeTrackingError` takes `Float64Array` arguments and plain numbers only, imports nothing
 * from the kernel, the data layer or the chart layer, and assumes no test context: this phase's
 * tests, a future CI data-change check, and Phase 5's in-app synthetic-vs-real view (VALID-04)
 * are its three callers, and D-12 exists so there is exactly one implementation for all three.
 *
 * Precision discipline (PITFALLS A11, D-11): the tracking-error standard deviation is computed in
 * two passes (mean, then sum of squared deviations from that mean) rather than the single-pass
 * sum-of-squares shortcut, which loses precision when the mean is large relative to the
 * dispersion. No value is rounded at any intermediate step.
 */

/**
 * One named comparison window, expressed as local indices into the arrays `computeTrackingError`
 * and its two component functions are called with (`firstBar`/`lastBar`, inclusive, 0-indexed),
 * plus the calendar day numbers (days-since-epoch, `tools/bundle-compiler/src/calendar.ts`'s
 * `toDaysSinceEpoch` convention) at those two bars. `years` is always derived from
 * `firstDayNumber`/`lastDayNumber`, never from `lastBar - firstBar`, so annualization stays
 * comparable across windows with different trading-bar densities (D-11).
 */
export interface TrackingErrorWindow {
  label: string
  firstBar: number
  lastBar: number
  firstDayNumber: number
  lastDayNumber: number
}

/** The full result of comparing one synthetic series against one reference series over one
 * window: both D-11 gates, plus each series' own annualized return so a caller (or a failure
 * message) can show the two figures Gate 2's difference was computed from. */
export interface TrackingErrorResult {
  label: string
  barCount: number
  years: number
  /** D-11 Gate 1: the annualized standard deviation of the per-bar return differences. Always
   * >= 0. */
  annualizedTrackingError: number
  /** D-11 Gate 2: `syntheticAnnualizedReturn - referenceAnnualizedReturn`. Can be negative. */
  annualizedReturnDrift: number
  syntheticAnnualizedReturn: number
  referenceAnnualizedReturn: number
}

const TRADING_DAYS_PER_YEAR = 252
const CALENDAR_DAYS_PER_YEAR = 365.25

function windowBarCount(window: TrackingErrorWindow): number {
  return window.lastBar - window.firstBar + 1
}

function windowYears(window: TrackingErrorWindow): number {
  return (window.lastDayNumber - window.firstDayNumber) / CALENDAR_DAYS_PER_YEAR
}

/** VALID-01 boundary edge: a window whose bar count is below 2 throws naming the window's own
 * label and bar count, rather than letting a downstream division (n - 1, or the fund coverage
 * check) silently produce NaN or Infinity. */
function assertWindowHasAtLeastTwoBars(window: TrackingErrorWindow): void {
  const barCount = windowBarCount(window)
  if (barCount < 2) {
    throw new Error(
      `tracking-error: window "${window.label}" has ${barCount} bar(s) ` +
        `(firstBar=${window.firstBar}, lastBar=${window.lastBar}); at least 2 bars are required`,
    )
  }
}

/** VALID-01 boundary edge: unequal input lengths throw naming both lengths, so a caller passing
 * mismatched synthetic/reference arrays fails loudly instead of silently reading past one array's
 * end or comparing bars that do not correspond to the same calendar day. */
function assertEqualLength(nameA: string, a: Float64Array, nameB: string, b: Float64Array): void {
  if (a.length !== b.length) {
    throw new Error(
      `tracking-error: "${nameA}" (length ${a.length}) and "${nameB}" (length ${b.length}) must have equal length`,
    )
  }
}

/** VALID-01 boundary edge: a non-finite value anywhere inside the window throws naming the
 * offending array and index, so a data refresh that produces a NaN or Infinity fails here rather
 * than propagating into a Phase 7 colour scale. */
function assertFiniteWithinWindow(name: string, values: Float64Array, window: TrackingErrorWindow): void {
  for (let i = window.firstBar; i <= window.lastBar; i++) {
    const value = values[i]
    if (value === undefined || !Number.isFinite(value)) {
      throw new Error(
        `tracking-error: "${name}" contains a non-finite value at index ${i} within window "${window.label}"`,
      )
    }
  }
}

function geometricAnnualizedReturn(values: Float64Array, window: TrackingErrorWindow): number {
  const first = values[window.firstBar] as number
  const last = values[window.lastBar] as number
  const years = windowYears(window)
  return Math.pow(last / first, 1 / years) - 1
}

/**
 * D-11 Gate 1: the annualized standard deviation of the per-bar return differences
 * (`syntheticReturns[k] - referenceReturns[k]`) across the inclusive window, using the sample
 * (`n - 1`) denominator and a `sqrt(252)` annualization factor. Computed in two passes (mean,
 * then sum of squared deviations) rather than the sum-of-squares shortcut, per PITFALLS A11.
 */
export function annualizedTrackingError(
  syntheticReturns: Float64Array,
  referenceReturns: Float64Array,
  window: TrackingErrorWindow,
): number {
  assertEqualLength('syntheticReturns', syntheticReturns, 'referenceReturns', referenceReturns)
  assertWindowHasAtLeastTwoBars(window)
  assertFiniteWithinWindow('syntheticReturns', syntheticReturns, window)
  assertFiniteWithinWindow('referenceReturns', referenceReturns, window)

  const n = windowBarCount(window)

  let sumOfDifferences = 0
  for (let i = window.firstBar; i <= window.lastBar; i++) {
    sumOfDifferences += (syntheticReturns[i] as number) - (referenceReturns[i] as number)
  }
  const mean = sumOfDifferences / n

  let sumOfSquaredDeviations = 0
  for (let i = window.firstBar; i <= window.lastBar; i++) {
    const difference = (syntheticReturns[i] as number) - (referenceReturns[i] as number)
    const deviation = difference - mean
    sumOfSquaredDeviations += deviation * deviation
  }
  const sampleVariance = sumOfSquaredDeviations / (n - 1)
  const sampleStdDev = Math.sqrt(sampleVariance)

  return sampleStdDev * Math.sqrt(TRADING_DAYS_PER_YEAR)
}

/**
 * D-11 Gate 2: `syntheticValues`' geometric annualized return over the window minus
 * `referenceValues`'s own, where each series' annualized return is
 * `(last / first) ** (1 / years) - 1` and `years` is
 * `(window.lastDayNumber - window.firstDayNumber) / 365.25` -- elapsed calendar time, never a
 * bar count, so the figure stays comparable across windows with different trading-bar densities.
 */
export function annualizedReturnDrift(
  syntheticValues: Float64Array,
  referenceValues: Float64Array,
  window: TrackingErrorWindow,
): number {
  assertEqualLength('syntheticValues', syntheticValues, 'referenceValues', referenceValues)
  assertWindowHasAtLeastTwoBars(window)
  assertFiniteWithinWindow('syntheticValues', syntheticValues, window)
  assertFiniteWithinWindow('referenceValues', referenceValues, window)

  const syntheticAnnualizedReturn = geometricAnnualizedReturn(syntheticValues, window)
  const referenceAnnualizedReturn = geometricAnnualizedReturn(referenceValues, window)
  return syntheticAnnualizedReturn - referenceAnnualizedReturn
}

/**
 * D-12's single shared entry point: validates all four arrays and the window once, then returns
 * both D-11 gates plus each series' own annualized return in one `TrackingErrorResult`. Takes
 * `Float64Array` arguments and plain numbers only -- no test context, no kernel import, no data-
 * layer import.
 */
export function computeTrackingError(
  syntheticValues: Float64Array,
  referenceValues: Float64Array,
  syntheticReturns: Float64Array,
  referenceReturns: Float64Array,
  window: TrackingErrorWindow,
): TrackingErrorResult {
  assertEqualLength('syntheticValues', syntheticValues, 'referenceValues', referenceValues)
  assertEqualLength('syntheticReturns', syntheticReturns, 'referenceReturns', referenceReturns)
  assertWindowHasAtLeastTwoBars(window)
  assertFiniteWithinWindow('syntheticValues', syntheticValues, window)
  assertFiniteWithinWindow('referenceValues', referenceValues, window)
  assertFiniteWithinWindow('syntheticReturns', syntheticReturns, window)
  assertFiniteWithinWindow('referenceReturns', referenceReturns, window)

  const syntheticAnnualizedReturn = geometricAnnualizedReturn(syntheticValues, window)
  const referenceAnnualizedReturn = geometricAnnualizedReturn(referenceValues, window)

  return {
    label: window.label,
    barCount: windowBarCount(window),
    years: windowYears(window),
    annualizedTrackingError: annualizedTrackingError(syntheticReturns, referenceReturns, window),
    annualizedReturnDrift: syntheticAnnualizedReturn - referenceAnnualizedReturn,
    syntheticAnnualizedReturn,
    referenceAnnualizedReturn,
  }
}
