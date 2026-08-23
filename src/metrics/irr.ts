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
 *
 * 07-03-PLAN.md Task 3 (F-06): D-24's lead proposed reducing `npv` to a Horner-style loop (one
 * multiply per flow, no `pow` at all) on the premise that a regular monthly schedule makes the
 * discount factors a geometric progression. CHECKED AGAINST THIS MODULE'S OWN CODE AND DID NOT
 * HOLD: contributions land on trading days with irregular calendar gaps (weekends, holidays,
 * `buildCashFlows` accumulates `series.calendarDaysElapsed` per bar, not a uniform days-per-month
 * constant), so consecutive `daysSinceEntry` gaps are not constant and the factors are not a
 * geometric progression -- a Horner loop over non-constant gaps computes the wrong answer, not
 * merely a slower one. The valid reduction for irregular offsets hoists the logarithm out of the
 * per-flow loop instead: `k = ln(1 + rate) / 365` computed ONCE per `npv` call, each flow
 * discounted by `Math.exp(-k * daysSinceEntry)`, replacing one `Math.pow` per flow (which V8
 * itself computes as one `log` plus one `exp` internally for a non-integer exponent) with one
 * `Math.exp` per flow plus one `Math.log` per call -- roughly halving the transcendental-function
 * cost, not eliminating it. Measured against the real production sweep pool
 * (`bench/sweep.bench.test.ts`'s contribution-schedule info line, F-06): the monthly-contribution
 * sweep measured several times the CAGR branch's cost and well over the PERF-03 budget even before
 * this change, so D-24's "noise against PERF-03" hope does not hold either -- this reduction
 * narrows the gap, it does not close it. See PROJECT.md's Key Decisions for the recorded PERF-03
 * escalation this measurement feeds.
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
 *
 * 07-03-PLAN.md Task 1 (SIM-11): `reuse`, when supplied, is cleared and filled in place and
 * returned instead of allocating a fresh array -- `src/sweep/sweep.worker.ts`'s hot loop passes
 * one array it allocates once per chunk, not once per cell, across all 10,000 sweep cells. Omit
 * `reuse` (the single-run call site in `src/app/state.ts` does) and this function's existing
 * signature and behavior are unchanged: a fresh array is allocated and returned, exactly as
 * before.
 */
export function buildCashFlows(
  params: KernelParams,
  series: KernelSeries,
  outputs: KernelOutputs,
  result: KernelResult,
  reuse?: CashFlow[],
): CashFlow[] {
  const flows = reuse ?? []
  flows.length = 0
  flows.push({ daysSinceEntry: 0, amount: -params.initialInvestment })

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

/**
 * `(1 + rate) ^ (daysSinceEntry / 365)` is algebraically `Math.exp(k * daysSinceEntry)` with
 * `k = Math.log(1 + rate) / 365` -- computed ONCE per call rather than re-derived (via `Math.pow`'s
 * own internal log) once per flow. `1 + rate` is always strictly positive here: bisection only
 * ever evaluates rates inside `[LOWER_BRACKET, UPPER_BRACKET]` (`-0.9999` to `10.0`), so
 * `Math.log`'s domain is never violated. Exported so `tests/metrics/irr.test.ts`'s property test
 * can compare this reduction against an independent `Math.pow`-based oracle (this module's own
 * header explains why a Horner-style loop, not this log/exp hoist, would have been the wrong
 * reduction).
 */
export function npv(rate: number, flows: readonly CashFlow[]): number {
  const k = Math.log(1 + rate) / 365
  let total = 0
  for (const flow of flows) {
    total += flow.amount * Math.exp(-k * flow.daysSinceEntry)
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
