/**
 * src/metrics/irr.ts
 *
 * Phase 4, D-08: money-weighted return (IRR) over a run's dated cash-flow sequence, solved by
 * bounded bisection ONLY -- D-08 rejects a two-solver fallback path for a solve that runs once
 * per parameter change over a few hundred cash flows, where speed is not the constraint. A pure
 * numeric module: no I/O, no import from src/app/, src/data/ or tools/.
 *
 * The bracket ([-0.9999, 10.0]), the iteration cap (100) and the tolerance (1e-9) are Claude's
 * Discretion per 04-CONTEXT.md, subject to D-08's stated bracket (roughly -99.99% to +1000%) and
 * its undefined-result requirement: when the bracket does not straddle zero, `solveIrr` returns
 * `null` rather than NaN or Infinity, and the panel prints the undefined copy in place of a
 * number.
 *
 * `buildCashFlows` reads `KernelResult.ruinBarIndex`'s `-1` sentinel (D-21's post-ruin
 * contribution drop is already enforced at the kernel level; this module reads that guarantee
 * rather than re-deriving it), so the produced sequence has exactly one sign change --
 * Descartes' rule then guarantees bisection cannot converge to a wrong root.
 */

import type { KernelOutputs, KernelParams, KernelResult, KernelSeries } from '../kernel/backtest.types.ts'

/** One dated cash flow in the sequence `solveIrr` discounts. A negative amount is money going in
 * (invested); a positive amount is money coming out. The initial investment sits at day 0. */
export interface CashFlow {
  daysSinceEntry: number
  amount: number
}

const LOWER_BRACKET = -0.9999
const UPPER_BRACKET = 10.0
const MAX_ITERATIONS = 100
const TOLERANCE = 1e-9

/**
 * Builds the dated cash-flow sequence for one run: the initial investment as a negative amount at
 * day 0, each contribution flagged strictly before `ruinBarIndex` (or all of them, when the run
 * never ruined -- `ruinBarIndex === -1`) as a negative amount at that bar's cumulative
 * calendar-day offset from entry, and the final bar's value as a single positive amount at the
 * last bar's cumulative day offset. A contribution flagged at or after the ruin bar is a
 * `droppedContributionsTotal` line item (D-21), never a cash flow here -- that exclusion is what
 * guarantees the sequence has exactly one sign change.
 */
export function buildCashFlows(
  params: KernelParams,
  series: KernelSeries,
  outputs: KernelOutputs,
  result: KernelResult,
): CashFlow[] {
  const flows: CashFlow[] = [{ daysSinceEntry: 0, amount: -params.initialInvestment }]

  const lastIndex = result.barCount - 1
  let cumulativeDays = 0

  for (let i = 1; i <= lastIndex; i++) {
    cumulativeDays += series.calendarDaysElapsed[i] ?? 0
    const beforeRuin = result.ruinBarIndex === -1 || i < result.ruinBarIndex
    if (beforeRuin && series.contributionFlags[i] === 1) {
      flows.push({ daysSinceEntry: cumulativeDays, amount: -params.contributionAmount })
    }
  }

  const finalValue = lastIndex >= 0 ? (outputs.outValue[lastIndex] ?? result.finalValue) : result.finalValue
  flows.push({ daysSinceEntry: cumulativeDays, amount: finalValue })

  return flows
}

function npv(rate: number, flows: readonly CashFlow[]): number {
  let total = 0
  for (const flow of flows) {
    total += flow.amount / Math.pow(1 + rate, flow.daysSinceEntry / 365)
  }
  return total
}

/** The cash flow with the largest `daysSinceEntry` -- the last money movement in the sequence,
 * chronologically, regardless of array order. */
function terminalFlow(flows: readonly CashFlow[]): CashFlow | undefined {
  let terminal: CashFlow | undefined
  for (const flow of flows) {
    if (terminal === undefined || flow.daysSinceEntry >= terminal.daysSinceEntry) {
      terminal = flow
    }
  }
  return terminal
}

/**
 * Solves for the annualized rate that zeroes the NPV of `flows`, by bounded bisection over
 * `[LOWER_BRACKET, UPPER_BRACKET]`, discounting each flow XIRR-style by
 * `(1 + rate) ^ (daysSinceEntry / 365)` since contributions land on trading days with irregular
 * calendar gaps rather than a uniform bars-per-year cadence.
 *
 * A terminal inflow of exactly 0 (a ruined run) is handled before bisecting: the NPV is negative
 * at every rate in the bracket, so there is no sign change to bisect and the boundary result -1
 * (total loss, -100%) must be returned by definition rather than searched for -- this is not the
 * special-casing D-08's rationale hoped to avoid, it is the one input shape bisection cannot
 * itself resolve. When the bracket does not straddle zero otherwise, returns `null`: the caller
 * prints the undefined copy rather than a number. Never returns NaN or Infinity from any path.
 */
export function solveIrr(flows: readonly CashFlow[]): number | null {
  const terminal = terminalFlow(flows)
  if (terminal !== undefined && terminal.amount === 0) {
    return -1
  }

  let lo = LOWER_BRACKET
  let hi = UPPER_BRACKET
  const npvLo = npv(lo, flows)
  const npvHi = npv(hi, flows)

  // No sign change across the declared bracket: undefined, not NaN (D-08).
  if ((npvLo > 0 && npvHi > 0) || (npvLo < 0 && npvHi < 0)) {
    return null
  }

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const mid = (lo + hi) / 2
    const npvMid = npv(mid, flows)
    if (Math.abs(npvMid) < TOLERANCE) {
      return mid
    }
    const sameSignAsLo = (npvMid > 0) === (npvLo > 0)
    if (sameSignAsLo) {
      lo = mid
    } else {
      hi = mid
    }
  }

  return (lo + hi) / 2
}
