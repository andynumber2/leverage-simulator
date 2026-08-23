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
 *
 * 07.1-03-PLAN.md Task 1 (Lever A): `07.1-PERF-03-PROFILE.md` section 3 measured
 * `npvEvaluationsPerSolve=105.01` per solve against 07.1-RESEARCH.md's naive `log2(11/1e-9)~=33.4`
 * estimate -- a 3.14x gap. Root cause: the loop's only termination test was `|npv(mid)| < TOLERANCE`,
 * a DOLLAR-denominated NPV magnitude. Against cash flows running to five, six or seven figures over
 * holds up to ~98 years, driving `|npv|` below `$1e-9` needs precision the bracket has usually
 * already overshot, so the loop almost always ran to `MAX_ITERATIONS` (100) instead of converging
 * near the 33-34 iterations the bracket's own width predicts. `RATE_TOLERANCE` adds a second,
 * rate-space termination test -- `hi - lo <= RATE_TOLERANCE` -- that bounds the RETURNED RATE's own
 * absolute error at 1e-9, four orders of magnitude below `SweepGrid.annualized`'s Float32 storage
 * precision and five below `formatPercent`'s two-decimal display. `TOLERANCE`, `MAX_ITERATIONS`,
 * `LOWER_BRACKET` and `UPPER_BRACKET` are unchanged: the NPV test stays the early exit it already
 * was for well-conditioned solves, and the iteration cap stays the backstop it already was. Adding
 * a reachable criterion alongside an unreachable one is strictly smaller than retuning the
 * unreachable one, and keeps every existing guarantee.
 *
 * 07.1-03-PLAN.md Task 1 (Lever B): `07.1-PERF-03-PROFILE.md` section 3 measured
 * `cashFlowCount=1185` for a representative sweep cell (a ~98-year hold, monthly contributions).
 * The former `CashFlow[]` representation pushed a freshly constructed object literal per flow --
 * across 10,000 sweep cells at that count, millions of short-lived heap objects per sweep, and an
 * `npv` inner loop walking an array of heap objects rather than contiguous numbers. `CashFlows`
 * replaces that with a pair of parallel `Float64Array` buffers (`daysSinceEntry`, `amount`) plus a
 * `count` of valid entries. `buildCashFlows`'s `reuse` parameter grows those buffers in place: a
 * fresh pair is allocated only when a call needs more capacity than the buffers already hold (the
 * largest cell's flow count seen so far in the chunk), never per call once the buffers reach that
 * high-water mark -- eliminating the per-flow allocations entirely, not just the outer container's.
 * `npv`'s existing log/exp hoist (F-06, above) is unchanged; only the container it reads changed.
 */

import type { KernelOutputs, KernelParams, KernelResult, KernelSeries } from '../kernel/backtest.types.ts'

/** The dated cash-flow sequence `solveIrr` discounts, as two parallel `Float64Array` buffers
 * (07.1-03-PLAN.md Task 1, Lever B) rather than an array of per-flow objects: `daysSinceEntry[i]`
 * and `amount[i]` together describe flow `i`, for `i` in `[0, count)`. A negative amount is money
 * going in (invested); a positive amount is money coming out. The initial investment sits at day
 * 0. Entries at or beyond `count` are stale leftovers from a previous, larger `buildCashFlows` call
 * that reused these buffers -- never read past `count`. */
export interface CashFlows {
  daysSinceEntry: Float64Array
  amount: Float64Array
  count: number
}

const LOWER_BRACKET = -0.9999
const UPPER_BRACKET = 10.0
const MAX_ITERATIONS = 100
const TOLERANCE = 1e-9
/** 07.1-03-PLAN.md Task 1 (Lever A): a rate-space bracket-width termination test, alongside (not
 * instead of) the dollar-denominated `TOLERANCE` test above -- see this file's header for why the
 * dollar test alone under-converges for large cash flows. Bounds the returned rate's own absolute
 * error at 1e-9. */
const RATE_TOLERANCE = 1e-9

/**
 * Builds the dated cash-flow sequence for one run: the initial investment as a negative amount at
 * day 0, each contribution flagged strictly before `ruinBarIndex` (or all of them, when the run
 * never ruined -- `ruinBarIndex === -1`) as a negative amount at that bar's cumulative
 * calendar-day offset from entry, and the final bar's value as a single positive amount at the
 * last bar's cumulative day offset. A contribution flagged at or after the ruin bar is a
 * `droppedContributionsTotal` line item (D-21), never a cash flow here -- that exclusion is what
 * guarantees the sequence has exactly one sign change.
 *
 * 07-03-PLAN.md Task 1 (SIM-11), superseded by 07.1-03-PLAN.md Task 1 (Lever B): `reuse`, when
 * supplied, has its `daysSinceEntry`/`amount` buffers grown in place only when this call's flow
 * count exceeds their current capacity, and is filled and returned instead of allocating a fresh
 * pair every call -- `src/sweep/sweep.worker.ts`'s hot loop passes one `CashFlows` it grows to the
 * chunk's largest cell, not one per cell, across all 10,000 sweep cells. Omit `reuse` (the
 * single-run call site in `src/app/state.ts` does) and a fresh, exactly-sized pair is allocated and
 * returned.
 */
export function buildCashFlows(
  params: KernelParams,
  series: KernelSeries,
  outputs: KernelOutputs,
  result: KernelResult,
  reuse?: CashFlows,
): CashFlows {
  const lastIndex = result.barCount - 1
  // 1 initial investment + up to `lastIndex` contributions + 1 final value -- the exact upper
  // bound the loop below can produce, computed once so the buffers below never need a second grow
  // within this call.
  const maxFlows = 2 + Math.max(lastIndex, 0)

  let flows = reuse
  if (flows === undefined) {
    flows = { daysSinceEntry: new Float64Array(maxFlows), amount: new Float64Array(maxFlows), count: 0 }
  } else if (flows.daysSinceEntry.length < maxFlows) {
    flows.daysSinceEntry = new Float64Array(maxFlows)
    flows.amount = new Float64Array(maxFlows)
  }

  let count = 0
  flows.daysSinceEntry[count] = 0
  flows.amount[count] = -params.initialInvestment
  count++

  let cumulativeDays = 0
  for (let i = 1; i <= lastIndex; i++) {
    cumulativeDays += series.calendarDaysElapsed[i] ?? 0
    const beforeRuin = result.ruinBarIndex === -1 || i < result.ruinBarIndex
    if (beforeRuin && series.contributionFlags[i] === 1) {
      flows.daysSinceEntry[count] = cumulativeDays
      flows.amount[count] = -params.contributionAmount
      count++
    }
  }

  const finalValue = lastIndex >= 0 ? (outputs.outValue[lastIndex] ?? result.finalValue) : result.finalValue
  flows.daysSinceEntry[count] = cumulativeDays
  flows.amount[count] = finalValue
  count++

  flows.count = count
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
 * reduction). Reads the `CashFlows` typed-array container (07.1-03-PLAN.md Task 1, Lever B)
 * rather than an array of per-flow objects -- the reduction itself is unchanged, only the loop's
 * source data is.
 */
export function npv(rate: number, flows: CashFlows): number {
  const k = Math.log(1 + rate) / 365
  const { daysSinceEntry, amount, count } = flows
  let total = 0
  for (let i = 0; i < count; i++) {
    total += amount[i]! * Math.exp(-k * daysSinceEntry[i]!)
  }
  return total
}

/** The cash flow with the largest `daysSinceEntry` -- the last money movement in the sequence,
 * chronologically, regardless of buffer order. `undefined` only when `count` is 0, which never
 * happens for a `buildCashFlows`-produced sequence (it always emits at least the initial
 * investment and the final value). */
function terminalFlow(flows: CashFlows): { daysSinceEntry: number; amount: number } | undefined {
  if (flows.count === 0) return undefined
  let terminalIndex = 0
  for (let i = 1; i < flows.count; i++) {
    if (flows.daysSinceEntry[i]! >= flows.daysSinceEntry[terminalIndex]!) {
      terminalIndex = i
    }
  }
  return { daysSinceEntry: flows.daysSinceEntry[terminalIndex]!, amount: flows.amount[terminalIndex]! }
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
 *
 * 07.1-03-PLAN.md Task 1 (Lever A): terminates on whichever of two tests fires first -- the
 * existing dollar-denominated `|npv(mid)| < TOLERANCE` test, or the added rate-space
 * `hi - lo <= RATE_TOLERANCE` bracket-width test. See this file's header for why the dollar test
 * alone under-converges for large cash flows.
 */
export function solveIrr(flows: CashFlows): number | null {
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
    // Lever A: the bracket has already narrowed past the rate precision that matters (see this
    // file's header) even though the dollar-denominated NPV test above has not fired yet.
    if (hi - lo <= RATE_TOLERANCE) {
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
