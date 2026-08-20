/**
 * src/validation/attribution.ts
 *
 * ATTR-01/ATTR-02: decomposes the gap between the naive `leverage * cumulativeReturn` claim
 * (D-02) and the actual run into three named causes -- volatility drag, financing cost and
 * expense ratio -- reported in signed dollars and as a signed share of the total gap (D-06).
 *
 * D-01: sibling to `src/validation/tracking-error.ts` -- pure compute, no Solid/app import. The
 * module type-imports `KernelInputs` from `../data/kernel-inputs.ts` and `KernelResult` from
 * `../kernel/backtest.types.ts`; it imports `runBacktest` (a value, not a type) from
 * `../kernel/backtest.ts` to run the compounding-on counterfactual arms, and the two day-count
 * constants (`FINANCING_DAY_COUNT_BASIS`, `EXPENSE_DAY_COUNT_BASIS`) from
 * `../kernel/backtest.types.ts` rather than re-declaring them -- this module is NOT part of the
 * kernel's own zero-runtime-import discipline (SIM-10 binds `backtest.ts` only).
 *
 * D-02: the naive baseline is `initial * (1 + leverage * cumulativeIndexReturn)`, PITFALLS A1's
 * exact error and the literal form of the internet argument this tool exists to settle.
 * `cumulativeIndexReturn` is the product of `(1 + series.returns[i])` over the run window minus
 * 1, using the same `KernelSeries.returns` array the kernel consumes -- never a second decode.
 *
 * D-05: with `params.contributionAmount` non-zero, the naive final value generalizes to a sum
 * over cash flows: the initial investment (treated as the cash flow at bar 0) plus every bar
 * flagged by `series.contributionFlags[i] === 1`, each contributing
 * `cashFlow * (1 + leverage * cumulativeIndexReturnFromItsOwnBarToTheEnd)`.
 *
 * D-01/D-03: the three components are measured by counterfactual runs over all eight subsets of
 * three binary factors (`compounding`, `financing`, `expense`), reduced to three Shapley values
 * -- each factor's marginal contribution to the final value, averaged over every ordering the
 * three factors could be "switched on" in (the standard weighted-subset formula, mathematically
 * equivalent to averaging over all 3! = 6 orderings directly). This reconciles to the total gap
 * by construction (the Shapley efficiency property: the three values always sum to
 * `v(allFactorsOn) - v(noFactorsOn)`) and is order-independent -- no fixed narrative ladder
 * silently decides which component absorbs the interaction between factors.
 *
 * The four subsets containing `compounding` are real `runBacktest` calls (financing off requires
 * BOTH `financingSpread: 0` AND a zero-filled `shortRate` array -- the kernel's financing term is
 * `(leverage - 1) * (shortRate[i] + financingSpread)`, so zeroing only the spread would leave the
 * base short-rate cost live in an arm that is supposed to carry no financing at all). The all-
 * factors-on arm reads `actualResult.finalValue` directly rather than re-running the kernel a
 * ninth time.
 *
 * The four subsets WITHOUT `compounding` have no meaning inside the kernel at all -- "naive L*R
 * with financing but without expense ratio" is not a case the kernel can run. ASSUMED: this
 * module's own reasoned resolution (05-RESEARCH.md Finding F-03, not an externally sourced
 * convention) is to apply financing/expense as simple, non-compounded annualized deductions over
 * the same per-bar `series.calendarDaysElapsed` array and the same two day-count bases the
 * kernel uses, accrued against each bar's outstanding principal (initial investment plus every
 * contribution flagged at or before that bar, D-05's own per-cash-flow rule). This reconciles
 * exactly for any consistent definition; the *interpretation* of each component does not, and is
 * stated on the CRED-04 methodology page (plan 05-07), not decided silently here.
 *
 * Rounding discipline: no value in this module is ever rounded. Rounding happens only at render
 * time, inside `src/metrics/format.ts`.
 */

import {
  EXPENSE_DAY_COUNT_BASIS,
  FINANCING_DAY_COUNT_BASIS,
  type KernelOutputs,
  type KernelParams,
  type KernelResult,
  type KernelSeries,
} from '../kernel/backtest.types.ts'
import { runBacktest } from '../kernel/backtest.ts'
import type { KernelInputs } from '../data/kernel-inputs.ts'

/**
 * D-01/D-02/D-03/D-05/D-06: the full attribution result. `naiveFinalValue`, `actualFinalValue`
 * and `totalGap` (naive minus actual, so a positive gap means the naive claim overstated the
 * actual result) come from Task 1. `volatilityDrag`, `financingCost` and `expenseRatio` are each
 * a signed dollar amount (D-04: a component may be reported as a gain, negative, with no
 * reframing or clamping); their `*Share` counterparts are each component divided by `totalGap`,
 * also unclamped and signed -- D-06's shares visibly sum to 100% by construction (the Shapley
 * efficiency property), never by rounding or residual absorption.
 */
export interface AttributionResult {
  naiveFinalValue: number
  actualFinalValue: number
  totalGap: number
  volatilityDrag: number
  financingCost: number
  expenseRatio: number
  volatilityDragShare: number
  financingCostShare: number
  expenseRatioShare: number
}

/**
 * D-02: the running cumulative index return from bar 0 through each bar `i` --
 * `product_{j=1}^{i} (1 + returns[j]) - 1` (bar 0 itself carries no return of its own, D-03, so
 * `cumulative[0]` is exactly 0). Exported so `naive-series.ts`'s per-bar ghost curve (05-02-PLAN
 * Task 1) and this module's own final-bar naive value walk the identical return recurrence --
 * never two independently hand-rolled cumulative-product loops that could silently drift apart.
 */
export function computeCumulativeIndexReturns(returns: Float64Array): Float64Array {
  const barCount = returns.length
  const cumulative = new Float64Array(barCount)
  let product = 1
  for (let i = 1; i < barCount; i++) {
    product *= 1 + (returns[i] ?? 0)
    cumulative[i] = product - 1
  }
  return cumulative
}

/**
 * D-02/D-05: computes the naive final value as a sum over cash flows. `suffixProduct[j]` is
 * `product_{i=j+1}^{barCount-1} (1 + returns[i])`, i.e. the cumulative index return realized from
 * bar `j` through the end of the run -- computed once, backward, so every cash flow's own
 * "from its own bar to the end" cumulative return (D-05) is a single array lookup rather than an
 * O(n) re-scan per contribution.
 */
function computeNaiveFinalValue(inputs: KernelInputs): number {
  const { params, series } = inputs
  const { leverage, initialInvestment, contributionAmount } = params
  const { returns, contributionFlags } = series
  const barCount = returns.length

  if (barCount === 0) return initialInvestment

  const suffixProduct = new Float64Array(barCount)
  suffixProduct[barCount - 1] = 1
  for (let i = barCount - 2; i >= 0; i--) {
    suffixProduct[i] = (suffixProduct[i + 1] as number) * (1 + (returns[i + 1] ?? 0))
  }

  // D-03 (kernel): bar 0 is the cost-free entry anchor and carries no return of its own; the
  // initial investment's cumulative index return is realized entirely over bars 1..end, which is
  // exactly suffixProduct[0].
  const initialCumulativeReturn = (suffixProduct[0] as number) - 1
  let naiveFinalValue = initialInvestment * (1 + leverage * initialCumulativeReturn)

  for (let i = 1; i < barCount; i++) {
    if (contributionFlags[i] === 1) {
      const cumulativeReturnFromThisBar = (suffixProduct[i] as number) - 1
      naiveFinalValue += contributionAmount * (1 + leverage * cumulativeReturnFromThisBar)
    }
  }

  return naiveFinalValue
}

/**
 * D-05: `principal[i]` is the outstanding principal AT bar `i` -- the initial investment plus
 * every contribution flagged at or before bar `i`. Feeds the non-compounding cost arms' per-bar
 * deduction base (F-03).
 */
function buildPrincipalOutstanding(inputs: KernelInputs): Float64Array {
  const { params, series } = inputs
  const barCount = series.returns.length
  const principal = new Float64Array(barCount)
  let running = params.initialInvestment
  for (let i = 0; i < barCount; i++) {
    if (series.contributionFlags[i] === 1) running += params.contributionAmount
    principal[i] = running
  }
  return principal
}

/**
 * F-03: the total non-compounded financing and expense deductions over the run window, each a
 * simple sum of `principalOutstandingAtBar * rate * (calendarDaysElapsed / dayCountBasis)` per
 * bar, using the same two day-count bases the kernel itself uses (imported, never re-declared).
 * Bar 0 (the cost-free entry anchor, D-03) contributes nothing to either sum.
 */
function computeNonCompoundingDeductions(
  inputs: KernelInputs,
  principal: Float64Array,
): { financingDeduction: number; expenseDeduction: number } {
  const { params, series } = inputs
  const { shortRate, calendarDaysElapsed } = series
  const barCount = series.returns.length

  let financingDeduction = 0
  let expenseDeduction = 0
  for (let i = 1; i < barCount; i++) {
    const gap = calendarDaysElapsed[i] ?? 0
    const p = principal[i] as number
    financingDeduction += p * (params.leverage - 1) * ((shortRate[i] ?? 0) + params.financingSpread) * (gap / FINANCING_DAY_COUNT_BASIS)
    expenseDeduction += p * params.expenseRatio * (gap / EXPENSE_DAY_COUNT_BASIS)
  }
  return { financingDeduction, expenseDeduction }
}

/**
 * A real `runBacktest` call with `financing`/`expense` switched on or off per D-03's counterfactual
 * arm definitions. Financing off zeroes BOTH `financingSpread` and the per-bar `shortRate` array
 * (RESEARCH.md Code Example 1) -- setting only the spread would leave the kernel's base
 * `(leverage - 1) * shortRate[i]` cost live in an arm that is supposed to carry no financing at
 * all. Preallocates its own `KernelOutputs` buffers (SIM-11), once per call.
 */
function runCounterfactualArm(inputs: KernelInputs, financingOn: boolean, expenseOn: boolean): number {
  const { params, series } = inputs
  const barCount = series.returns.length

  const armParams: KernelParams = {
    ...params,
    financingSpread: financingOn ? params.financingSpread : 0,
    expenseRatio: expenseOn ? params.expenseRatio : 0,
  }
  const armSeries: KernelSeries = financingOn ? series : { ...series, shortRate: new Float64Array(barCount) }
  const outputs: KernelOutputs = {
    outValue: new Float64Array(barCount),
    outRuined: new Uint8Array(barCount),
    outLongGap: new Uint8Array(barCount),
  }

  return runBacktest(armParams, armSeries, outputs).finalValue
}

/** Bitmask factor identities (D-03's three binary factors), used to index the eight-subset value
 * array below. Bit position carries no semantic weight beyond "which factor" -- Shapley's own
 * order-independence does not depend on this numbering. */
const FACTOR_COMPOUNDING = 0b001
const FACTOR_FINANCING = 0b010
const FACTOR_EXPENSE = 0b100

/**
 * D-03: evaluates the value function `v(S)` over all eight subsets `S` of `{compounding,
 * financing, expense}`, indexed by bitmask 0..7. Subsets containing `compounding` are real kernel
 * arms (`runCounterfactualArm`, or the cached `actualResult.finalValue` for the all-on subset);
 * subsets without it are the naive baseline with F-03's non-compounding cost deductions applied.
 */
function buildSubsetValues(inputs: KernelInputs, actualResult: KernelResult, naiveFinalValue: number): Float64Array {
  const principal = buildPrincipalOutstanding(inputs)
  const { financingDeduction, expenseDeduction } = computeNonCompoundingDeductions(inputs, principal)

  const values = new Float64Array(8)
  for (let mask = 0; mask < 8; mask++) {
    const compoundingOn = (mask & FACTOR_COMPOUNDING) !== 0
    const financingOn = (mask & FACTOR_FINANCING) !== 0
    const expenseOn = (mask & FACTOR_EXPENSE) !== 0

    if (compoundingOn) {
      values[mask] = financingOn && expenseOn ? actualResult.finalValue : runCounterfactualArm(inputs, financingOn, expenseOn)
    } else {
      let value = naiveFinalValue
      if (financingOn) value -= financingDeduction
      if (expenseOn) value -= expenseDeduction
      values[mask] = value
    }
  }
  return values
}

function factorial(n: number): number {
  return n <= 1 ? 1 : n * factorial(n - 1)
}

/**
 * D-03: the standard Shapley value for one factor (`factorBit`), given the eight subset values
 * and the bitmasks of the OTHER two factors. Sums the factor's marginal contribution
 * `v(S | factorBit) - v(S)` over every subset `S` of the other two factors, weighted by
 * `|S|!(n-|S|-1)!/n!` -- the closed-form equivalent of averaging over all `3! = 6` orderings the
 * three factors could be switched on in. Never enumerates the other two factors in a fixed order
 * itself: it sums over every subset of them (neither, either, or both), so permuting which factor
 * is asked about, or which two are named "the others", cannot change the result.
 */
function shapleyValue(values: Float64Array, factorBit: number, otherBits: readonly [number, number]): number {
  const n = 3
  let total = 0
  for (let otherMask = 0; otherMask < 4; otherMask++) {
    const bitA = (otherMask & 1) !== 0 ? otherBits[0] : 0
    const bitB = (otherMask & 2) !== 0 ? otherBits[1] : 0
    const subsetMask = bitA | bitB
    const subsetSize = (bitA !== 0 ? 1 : 0) + (bitB !== 0 ? 1 : 0)
    const weight = (factorial(subsetSize) * factorial(n - subsetSize - 1)) / factorial(n)
    const withFactor = values[subsetMask | factorBit] as number
    const withoutFactor = values[subsetMask] as number
    total += weight * (withFactor - withoutFactor)
  }
  return total
}

/**
 * Computes the full ATTR-01/ATTR-02 attribution for one completed run. `actualResult` must be the
 * `KernelResult` already produced for `inputs` (the same object `runBacktest` returned) -- this
 * function never re-runs the kernel for the all-factors-on case.
 */
export function computeAttribution(inputs: KernelInputs, actualResult: KernelResult): AttributionResult {
  const naiveFinalValue = computeNaiveFinalValue(inputs)
  const actualFinalValue = actualResult.finalValue
  const totalGap = naiveFinalValue - actualFinalValue

  const values = buildSubsetValues(inputs, actualResult, naiveFinalValue)

  // D-03: each Shapley value is the factor's average marginal contribution to the FINAL VALUE --
  // positive when switching the factor on INCREASES the final value. A cost component's signed
  // dollar amount is the negation of that: a factor that reduces the final value (financing,
  // expense, or compounding when it hurts) yields a positive cost; D-04's gain case is exactly
  // when a factor's Shapley value is positive (switching it on helped), which negates to a
  // negative signed component -- rendered as a gain, never clamped or re-signed.
  const volatilityDrag = -shapleyValue(values, FACTOR_COMPOUNDING, [FACTOR_FINANCING, FACTOR_EXPENSE])
  const financingCost = -shapleyValue(values, FACTOR_FINANCING, [FACTOR_COMPOUNDING, FACTOR_EXPENSE])
  const expenseRatio = -shapleyValue(values, FACTOR_EXPENSE, [FACTOR_COMPOUNDING, FACTOR_FINANCING])

  return {
    naiveFinalValue,
    actualFinalValue,
    totalGap,
    volatilityDrag,
    financingCost,
    expenseRatio,
    // D-06: unclamped by construction -- a share can exceed 100% or go negative (D-04), and no
    // residual is ever absorbed to force the three shares to visibly sum to 100%. They do sum to
    // 100% on their own, because the three dollar components already reconcile exactly to
    // totalGap (the Shapley efficiency property).
    volatilityDragShare: volatilityDrag / totalGap,
    financingCostShare: financingCost / totalGap,
    expenseRatioShare: expenseRatio / totalGap,
  }
}
