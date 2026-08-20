/**
 * src/app/components/ResultColumn/naive-series.ts
 *
 * ATTR-03/D-07: the per-bar naive `leverage * cumulativeIndexReturn` value (D-02/D-05), built for
 * every plotted bar so `EquityCurveChart.tsx` can draw it as a permanent second uPlot series
 * beside the real result. A plain `.ts` sibling of the `.tsx` chart component, following
 * `log-axis-splits.ts`'s precedent, so it is unit-testable in the Node `unit` vitest project
 * without a browser (that project cannot parse `.tsx`).
 *
 * D-02/D-05: at bar `i`, the naive value is the sum over every cash flow at or before `i`
 * (the initial investment at bar 0, plus every bar `series.contributionFlags[k] === 1`) of
 * `cashFlow_k * (1 + leverage * cumulativeIndexReturnFromBarKToBarI)`. This module reuses
 * `computeAttribution`'s own exported `computeCumulativeIndexReturns` (the running cumulative
 * index return from bar 0) rather than re-deriving a second, slightly different recurrence --
 * the ghost curve and the attribution panel's naive final value must never be able to disagree
 * about what "naive" means.
 *
 * Re-parametrizing `computeAttribution`'s suffix-product ("from this bar to the end") walk into
 * a prefix-product ("from bar 0 to this bar") walk is what makes computing the naive value at
 * EVERY bar an O(n) pass rather than an O(n^2) one: letting `P_i = 1 + cumulativeIndexReturns[i]`,
 * cash flow `k`'s contribution to bar `i`'s naive value is
 * `cashFlow_k * (1 + leverage * (P_i / P_k - 1))`, which expands to
 * `cashFlow_k * (1 - leverage) + cashFlow_k * leverage * P_i / P_k`. Summing over every cash flow
 * at or before `i` and pulling `P_i` out of the second term gives
 * `naive_i = (1 - leverage) * totalInvested_i + leverage * P_i * weightedFlows_i`, where
 * `totalInvested_i` and `weightedFlows_i = sum(cashFlow_k / P_k)` are both running sums updated
 * once per bar. This is the same mathematical quantity `computeAttribution`'s final-bar figure
 * computes, just walked forward instead of backward, so the two necessarily agree (up to
 * floating-point associativity) at the final bar.
 *
 * F-02/Pitfall 1 (05-RESEARCH.md): unlike ruin, a non-positive naive value is not an absorbing
 * state -- the naive curve can recover after a deep enough drawdown. So every bar's naive value
 * is computed independently and substituted with `null` only where it is `<= 0` (uPlot's log
 * distribution cannot render zero or a negative number); the array is never truncated at the
 * first non-positive bar, matching `EquityCurveChart.tsx`'s existing `buildTerminatorData`
 * `(number | null)[]` idiom, reused here for a different fill pattern.
 */

import { computeCumulativeIndexReturns } from '../../../validation/attribution.ts'
import type { KernelInputs } from '../../../data/kernel-inputs.ts'

/**
 * Builds the naive ghost-curve data for the first `plottedBarCount` bars of `inputs`. `null` is
 * substituted at every bar whose naive value is `<= 0`; every other bar carries the finite naive
 * value. Never truncates the array and never clamps a non-positive value to a small positive
 * epsilon -- the recurrence above is evaluated at every bar independently, so a window that dips
 * negative and later recovers produces numeric values, then nulls, then numeric values again.
 */
export function buildNaiveGhostData(inputs: KernelInputs, plottedBarCount: number): (number | null)[] {
  if (plottedBarCount === 0) return []

  const { params, series } = inputs
  const { leverage, initialInvestment, contributionAmount } = params
  const { returns, contributionFlags } = series

  const cumulativeIndexReturns = computeCumulativeIndexReturns(returns)

  const data: (number | null)[] = new Array(plottedBarCount)

  // Running sums, updated once per bar rather than re-summing every cash flow at every bar:
  // `totalInvested` is the sum of every cash flow through the current bar, `weightedFlows` is
  // the sum of `cashFlow_k / P_k` through the current bar (see the module header for the
  // derivation of why this pair is sufficient to reconstruct bar i's naive value).
  let totalInvested = 0
  let weightedFlows = 0

  for (let i = 0; i < plottedBarCount; i++) {
    // D-03: bar 0 is the cost-free entry anchor and carries the initial investment as its own
    // cash flow (matching computeAttribution's own bar-0 treatment); every later cash flow bar
    // is flagged by series.contributionFlags (D-05).
    const isCashFlowBar = i === 0 || contributionFlags[i] === 1
    const cumulativeReturnAtI = cumulativeIndexReturns[i] ?? 0
    const prefixProductAtI = 1 + cumulativeReturnAtI

    if (isCashFlowBar) {
      const cashFlow = i === 0 ? initialInvestment : contributionAmount
      totalInvested += cashFlow
      weightedFlows += cashFlow / prefixProductAtI
    }

    const value = (1 - leverage) * totalInvested + leverage * prefixProductAtI * weightedFlows
    data[i] = value > 0 ? value : null
  }

  return data
}
