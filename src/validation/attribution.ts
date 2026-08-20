/**
 * src/validation/attribution.ts
 *
 * ATTR-01/ATTR-02: decomposes the gap between the naive `leverage * cumulativeReturn` claim
 * (D-02) and the actual run into a named cause. This task (05-01 Task 1) implements only the
 * naive-versus-actual pair -- `naiveFinalValue`, `actualFinalValue`, `totalGap`. Task 2 extends
 * `AttributionResult` with the three Shapley-allocated cost components (volatility drag,
 * financing cost, expense ratio) and their shares of `totalGap`; this module carries no stubbed
 * zero for those fields until that task lands, so no consumer can read a fake value.
 *
 * D-01: sibling to `src/validation/tracking-error.ts` -- pure compute, no Solid/app import, no
 * runtime import from the kernel beyond types. The module type-imports `KernelInputs` from
 * `../data/kernel-inputs.ts` and `KernelResult` from `../kernel/backtest.types.ts` only.
 *
 * D-02: the naive baseline is `initial * (1 + leverage * cumulativeIndexReturn)`, PITFALLS A1's
 * exact error and the literal form of the internet argument this tool exists to settle.
 * `cumulativeIndexReturn` is the product of `(1 + series.returns[i])` over the run window minus
 * 1, using the same `KernelSeries.returns` array the kernel consumes -- never a second decode.
 *
 * D-05: with `params.contributionAmount` non-zero, the naive final value generalizes to a sum
 * over cash flows: the initial investment (treated as the cash flow at bar 0) plus every bar
 * flagged by `series.contributionFlags[i] === 1`, each contributing
 * `cashFlow * (1 + leverage * cumulativeIndexReturnFromItsOwnBarToTheEnd)`. `actualFinalValue` is
 * read directly from the already-computed `actualResult.finalValue` -- never a second kernel
 * call for the all-factors-on case.
 */

import type { KernelResult } from '../kernel/backtest.types.ts'
import type { KernelInputs } from '../data/kernel-inputs.ts'

/**
 * D-01/D-02/D-05: the naive-versus-actual gap. `naiveFinalValue` minus `actualFinalValue`, never
 * the reverse -- a positive `totalGap` means the naive claim overstated the actual result.
 */
export interface AttributionResult {
  naiveFinalValue: number
  actualFinalValue: number
  totalGap: number
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
 * Computes the naive-versus-actual attribution for one completed run. `actualResult` must be the
 * `KernelResult` already produced for `inputs` (the same object `runBacktest` returned) -- this
 * function never re-runs the kernel for the all-factors-on case.
 */
export function computeAttribution(inputs: KernelInputs, actualResult: KernelResult): AttributionResult {
  const naiveFinalValue = computeNaiveFinalValue(inputs)
  const actualFinalValue = actualResult.finalValue
  const totalGap = naiveFinalValue - actualFinalValue
  return { naiveFinalValue, actualFinalValue, totalGap }
}
