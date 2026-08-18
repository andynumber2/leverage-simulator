# Phase 3: Simulation Kernel and the UPRO/TQQQ Gate - Research

**Researched:** 2026-08-18
**Domain:** Deterministic financial simulation kernel (TypeScript, allocation-free hot loop) + empirical validation against real leveraged-ETF history
**Confidence:** MEDIUM — the numeric recurrence, day-count, ruin, and contribution mechanics are HIGH confidence (fully specified in 03-CONTEXT.md and cross-checked against the Phase 1 spike kernel and Phase 2's compiled bundle format). The two gate cost parameters (expense ratio, financing spread) are MEDIUM/LOW confidence: current-value figures were read directly from ProShares' own fact sheets, but **inception-era** figures — the ones D-17 requires — could not be independently confirmed against a primary SEC filing this session (SEC EDGAR blocked automated fetches; see Sources).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Day-Count Conventions**

Three sources in this repo stated three different conventions before this discussion:
PROJECT.md said financing `days/360` and ER `days/365`; PITFALLS A1/A4 said flat `/252` for both;
the Phase 1 spike kernel (`bench/kernel.ts`) used calendar `/365` financing with flat `/252` ER.
The following settles it. PROJECT.md's statement wins, because it matches both the USD
money-market convention and how funds actually accrue.

- **D-01:** Financing accrues on **actual/360, scaled by calendar days elapsed since the prior
  trading day**: `(L-1) * (shortRate + spread) * (calendarDaysElapsed / 360)`. This is the USD
  money-market convention that real swap financing uses, and it is what PROJECT.md already
  states. The difference from `/365` is 1.39%, roughly 15bp/yr at 3x in a 5% rate regime, which
  is material against the tracking gate rather than cosmetic. A flat `/252` per bar is rejected
  outright: PITFALLS A8 names it as the specific pitfall, because it undercharges every weekend
  and both multi-day market closures.
  — **Reversibility:** costly — the tracking-error tolerance (D-14) is derived against this
  convention, and every attribution figure in Phase 5 decomposes costs computed this way.
- **D-02:** The expense ratio accrues on **actual/365, also scaled by calendar days elapsed**:
  `ER * (calendarDaysElapsed / 365)`. PITFALLS A4 records that fund prospectuses accrue the
  annual figure daily on a 365-day basis internally. This totals to exactly `ER` per year
  regardless of how many trading bars that year contains, which matters here because the bundled
  calendar carries 249 bars in 1929 and 252 in 2024. Deliberately a **different basis from
  financing** (D-01): PITFALLS A8 states the two have genuinely different real-world accrual
  bases and conflating them is a subtler form of the same error.
- **D-03:** **The entry bar is a cost-free anchor.** Bar 0 sets `value = initialInvestment`,
  applies no return and accrues no cost. Costs first accrue on bar 1, using the calendar gap from
  bar 0 to bar 1. This matches buying at the entry close, where the holding period is zero days.
  Charging bar 0 would overstate cost on every run and make a same-day entry and exit show a loss.
- **D-04:** **Long market closures accrue financing in full, with no cap, and the kernel exposes
  which bars carried an outsized calendar gap.** Only two gaps in 98 years exceed 5 calendar days:
  1933-03-03 to 1933-03-15 (12 days, the bank holiday) and 2001-09-10 to 2001-09-17 (7 days,
  9/11). Interest on borrowed money runs whether or not the exchange is open, so capping would be
  a hidden subsidy in exactly the era the extended tier exists to reach. The flag exists because
  the two cases are **not** equally well supported: see F-03 below. It costs one output array and
  no hot-loop branch, since the calendar gap is already read every bar.
  — **Reversibility:** reversible — the flag is an additive output; removing it does not change
  any computed value.

### What 1x Means

- **D-05:** **The kernel never branches on the value of `leverage`.** Financing zeroes itself
  structurally because it is scaled by `(L-1)`. The expense ratio is whatever the caller passes,
  so SIM-04's invariant test passes `ER = 0`. Rejected: a `leverage === 1` special case, which
  introduces a floating-point magic constant, is brittle against a leverage value arriving as
  0.9999999999, and creates a discontinuity where a 1.0x run and a 1.0001x run differ by a full
  expense ratio. Also rejected: scaling ER by `(L-1)` so both terms vanish at 1x, which is
  economically wrong (funds charge ER on NAV, not on the borrowed portion) and would understate
  every leveraged run, corrupting the gate.
- **D-06:** **SIM-04's "exactly" is enforced as a maximum relative deviation of 1e-9** from the
  raw bundled series across all bars. Bit-for-bit equality is not achievable over 24,773 bars:
  per-step reproduction is exact (Sterbenz: `1 + (x-1) === x` for `0.5 <= x <= 2`, which every
  daily return satisfies), but the running product drifts from a direct `P[t]/P[0]` by roughly
  `n * eps`, about 5e-12 relative. 1e-9 sits about 200x above that floor and about 800x below the
  smallest possible real bug (one day of a 0.03% fee leaking in is 8e-7 relative), so it cannot
  false-fail on correct arithmetic and cannot pass a genuine modelling error. **An earlier
  proposal of 1e-12 was withdrawn during discussion because it sits below the accumulation
  floor.**
- **D-07:** **1x means the bare index**, ER defaulting to 0, no product wrapper and no fee. This
  is the reading PITFALLS A10 says PROJECT.md implies, and it is what makes SIM-04's invariant
  literally true. A user who wants a fair fight against a real index fund types an ER into the
  editable field.
- **D-08:** **Sub-1x leverage produces a negative financing term, and that is intended.** At
  `L = 0.5`, `(L-1) = -0.5`, so the term becomes a credit: the uninvested half earns the short
  rate. Economically correct and it falls out of the formula with no extra code. **This needs an
  explicit test**, so a later reader does not mistake it for a sign bug and clamp it.
- **D-09:** **The kernel's rate arguments are fractions, not percentages.** The caller converts.
  The compiled bundle stores `units: "percent-annualized"` and the stored values are literally
  1.245, 3.5, 0.938, so the data layer divides by 100 exactly once when building the typed array.
  The Phase 1 spike kernel does not convert, because its synthetic rates were already fractions.
  A silent 100x financing error is exactly the class of bug that would fail the UPRO gate in a
  confusing way.

### The Tracking-Error Gate

- **D-10:** **The gate compares synthetic 3x built from the index price-return series against the
  fund's total-return series.** UPRO and TQQQ track the S&P 500 and Nasdaq-100 **price** indices,
  so the synthetic applies 3x to `SPX/price-return` and `NDX/price-return`. The comparison target
  is `UPRO/total-return` and `TQQQ/total-return`, the series Phase 2 reconstructed from close plus
  dividend events (02-CONTEXT D-24), because both funds distribute and comparing against their
  price return alone would show the distribution yield as phantom underperformance. Rejected:
  applying 3x to a total-return index, since neither fund tracks one.
  — **Reversibility:** costly — the tolerance in D-14 is derived against this exact pairing, and
  Phase 5's in-app synthetic-vs-real view (VALID-04) renders the same comparison.
- **D-11:** **Two gates, not one.** Gate 1 is **annualized tracking error**, the standard
  deviation of daily return differences times `sqrt(252)`, which catches mechanism errors such as
  leverage applied to the wrong quantity. Gate 2 is the **annualized return difference (drift)**,
  which catches cost-model errors. Both are needed because PITFALLS A4, A6 and A8 all describe
  their warning signs as *drift* patterns, and gate 1 alone is blind to a steady bias. Rejected:
  a cumulative-path max-deviation gate, which conflates precision and bias and over 17 years is
  dominated by drift; and a terminal-gap gate, which a model wrong in both directions can pass.
- **D-12:** **VALID-01's single shared tracking-error function is a module separate from the
  kernel.** SIM-10 says the kernel imports nothing from the data, sweep or chart layers; tracking
  error is not part of the recurrence. The same function is called by the phase tests, by the CI
  data-change check, and by Phase 5's in-app view.
- **D-13:** **The build fails on the full overlap window; rate-regime sub-windows are reported but
  not gated.** Overlaps are UPRO 2009-06-25 to present (17.1y) and TQQQ 2010-02-11 to present
  (16.5y). Both statistics are additionally reported split across the near-zero-rate era
  (2009-2015) and the high-rate era (2022-present), because PITFALLS A6 states that spread
  mis-calibration shows up specifically as a rate-regime-dependent divergence that a single
  full-window average can cancel out. Gating each era separately was rejected as multiplying the
  ways a legitimate build goes red without a defensible per-era tolerance.

### No-Fitting Enforcement (VALID-03)

STATE.md carries this as a standing Phase 3 blocker: *"Cost parameters must be sourced and
documented before validation is first run. Adjusting them afterward to tighten the fit invalidates
the gate."* ROADMAP criterion 2 additionally requires that the git history show it.

- **D-14:** **The tolerance is derived from enumerated un-modelled mechanisms, written and
  committed before validation first runs.** List what the two-parameter model does not capture
  (swap dealer spread variation, fund trading and rebalance costs, collateral yield differences,
  the expense ratio's 365-day internal accrual per PITFALLS A4), attach a cited or reasoned bp/yr
  estimate to each, sum with a safety factor, commit that as the threshold. **No trial tracking
  error was computed during this discussion**, deliberately: any number measured before the
  tolerance is set would anchor the tolerance to the fit, which is the fitting VALID-03 exists to
  prevent.
- **D-15:** **The tolerance is revisable after the first measurement, but only by naming a
  mechanism, never by picking a number.** The no-fitting rule protects against tuning parameters,
  which are free variables with no independent anchor. It does not protect a *wrong tolerance*.
  A frozen tolerance set too tight would force structural changes to correct code, which is the
  mirror image of overfitting and worse, because a distorted structure is harder to spot in
  review than a tweaked constant. This was raised by the user during discussion and the protocol
  was revised in response.
- **D-16:** **Expense ratio defaults are per-fund for the gate and generic for hypothetical runs.**
  The UPRO and TQQQ gate runs use each fund's own published prospectus ER, because the gate asks
  whether the model reproduces that specific product. A hypothetical 3x SPX run a user builds
  defaults to a generic figure (PROJECT.md says roughly 0.90%) explicitly labelled as
  representative of real 3x products.
- **D-17:** **Per-fund ER is held constant at the inception-era figure**, sourced from the
  earliest available prospectus for each fund, not today's figure and not a time-weighted average.
  These funds' expense ratios have been cut over their lives. Holding the inception-era number
  makes any later fee cut appear as the synthetic running slightly *expensive* versus the real
  fund: a visible, one-directional, explainable residual. Today's figure was rejected because over
  a 17-year window where fees only fell it biases the model toward flattering leverage, the wrong
  direction for this tool's credibility. A time-weighted average was rejected as a fitted-looking
  number matching no document a skeptic can pull up. Time-varying ER (stepping at each documented
  change date) is the most accurate option and is **deferred**, not rejected: it needs a sourced
  fee history per fund and adds a per-bar parameter array that touches SIM-11's preallocation
  contract.
- **D-18:** **The financing spread default is the midpoint of a researched, cited range.** No fund
  itemizes swap financing spread in any public disclosure; PITFALLS A9 says so and calls a stable
  unexplained residual a *feature* of an honest model. Research a defensible range from public
  sources (fund annual report swap schedules disclose counterparty terms, plus published research
  on LETF financing costs), commit the range with its citations, default to the midpoint. The
  bounds then become the sensitivity story rather than a hidden knob. **Explicitly rejected on the
  record:** solving for the spread that fits UPRO over some window and using it elsewhere. That is
  precisely the fitting VALID-03 prohibits, recorded here so it is not rediscovered as an idea
  later.
- **D-19:** **The no-tuning claim is backed by commit ordering plus a pinned test.** The plan
  sequence commits the sourced parameters with their citations as **its own atomic commit, before
  any validation code exists**, so ROADMAP criterion 2's git-history claim is literally true. A
  test additionally pins each constant to its cited value, so changing a parameter forces changing
  the citation in the same diff where a reviewer sees it. A CI check asserting commit ordering was
  rejected as brittle against rebases, squashes and unrelated formatting commits.
  — **Reversibility:** one-way — the git-history claim in ROADMAP criterion 2 cannot be
  reconstructed after the fact. If the parameters land in the same commit as the validation code,
  the evidence that criterion asks for does not exist and no later commit can create it.
- **D-20:** **A first-run gate failure is diagnosed by the residual's pattern, with three
  permitted outcomes.** Classify against the PITFALLS signature table before changing anything:

  | Residual pattern | Cause | Outcome |
  |---|---|---|
  | Steady ~0.3-0.5%/yr gap, uncorrelated with rate regime | ER or day-count (A4) | Fix structure |
  | Divergence concentrated in the high-rate era | Spread mis-calibration (A6) | Widen tolerance, Key Decision |
  | Bias tracking the count of 3-day weekends per year | Calendar accrual (A8) | Fix structure |
  | Synthetic far too pessimistic overall | Wrong rate type, retail instead of wholesale (A3) | Fix structure |
  | Small, stable, patternless | Genuinely un-modelled cost | Accept, record the number |

  **Cost parameters stay untouched in all three outcomes.** The last row is load-bearing: a small
  stable patternless residual is the expected result of an honest two-parameter model, and the
  protocol says so out loud so nobody chases it.

### Ruin Semantics

- **D-21:** **Post-ruin contributions are dropped, and the amount dropped is reported.**
  Contributions stop at ruin. The kernel additionally returns how much was scheduled but never
  invested, because without it Phase 4's METR-03 (final value as a multiple of total contributed)
  is ambiguous: the denominator either includes money that never went in or silently shrinks, and
  both readings are defensible. The Phase 1 spike drops them silently; that is the behavior being
  corrected. Restarting a fresh position post-ruin is **out of scope for this phase**: PITFALLS A7
  permits it only as an explicit separately-labelled event with its own curve and metrics.
- **D-22:** **The ruin flag is categorical and metrics are still computed.** The kernel outputs
  `ruined` plus the bar index where it occurred. Final value (0) and drawdown (100%) remain real
  numbers, but the flag is what Phase 4 and Phase 7 render, so ruin is never inferred from a
  number near zero. This is ROADMAP criterion 3's "absorbing state rather than an extreme value"
  requirement. Returning null or NaN was rejected because NaN propagating through the Phase 7
  sweep and into a colour scale is its own class of bug.
- **D-23:** **Ruin triggers on `value <= 0` evaluated after the return and both cost terms are
  applied**, exactly as PITFALLS A7 specifies. This catches the crossing case, not only the
  exact-zero case. An epsilon threshold ("effectively ruined at 1e-9 of starting value") was
  rejected as a fabricated parameter that changes results and would need its own justification.
- **D-24:** **The ruin bar and every subsequent bar are written as exactly 0.** The pre-clamp
  negative value is discarded, so no negative number appears anywhere in any value series, which
  is PITFALLS A7's stated warning sign.

### Contribution Schedule

- **D-25:** **Contribution frequency is a calendar date anchored to the entry date.** Entry on the
  17th means contributions on the 17th of each month, quarter or year. The Phase 1 spike used a
  fixed bar count (`outIdx % contributionIntervalBars`); that is rejected because 21 bars is not a
  month (real months carry 19 to 23 bars), so over a multi-decade run the contribution dates drift
  arbitrarily from the entry day and the contribution count will not match what a user computes by
  hand. Date-to-bar-index resolution happens **once, outside the hot loop**.
- **D-26:** **A contribution date falling on a non-trading day rolls forward to the next trading
  day.** Standard business-day-following convention. It never places money before it existed, and
  it handles both multi-day closures without a special rule.
- **D-27:** **Month-end clamps, then rolls.** Entry on the 31st becomes the 30th in a 30-day month
  and the 28th or 29th in February, then rolls forward per D-26 if that is not a session. This
  keeps the count at exactly one contribution per period, so total contributed equals
  `amount * periods`. Rolling into the next month was rejected because it produces months with
  zero contributions and months with two.
- **D-28:** **The entry bar receives the initial investment only, never a recurring
  contribution.** The first recurring contribution lands one period later. This keeps the two
  parameters distinct and makes total contributed equal `initial + amount * periodsElapsed`,
  which is what a user will check by hand.

### Kernel Boundary and Data Edges

- **D-29:** **The data layer truncates a run at the last bar where every input it needs exists.**
  The rate series currently ends 2026-08-14 while price series end 2026-08-17, so one trailing bar
  has a price and no rate, and that offset changes with each refresh. Hold-to-today therefore ends
  at the last fully-supported bar, and the UI states the effective end date (which Phase 5 must
  surface regardless). The kernel never sees a missing rate and needs no hot-loop branch.
  Runtime carry-forward was rejected because Phase 2's D-09 made carry-forward a
  manifest-recorded seam precisely so it is never silent; doing it at runtime would be silent.
  Treating a missing rate as zero was rejected as a free-leverage day, invisible, in the direction
  that flatters leverage.
- **D-30:** **The kernel accepts typed arrays and scalars only.** `Float64Array` views plus
  numbers. The caller resolves symbol, date range, tier and dividend mode to indices and slices
  before calling. This satisfies SIM-10's no-imports rule literally, makes the sweep worker path
  identical to the single-run path, and keeps the module testable against synthetic arrays with no
  bundle present.
  — **Reversibility:** costly — Phase 7's sweep worker is written against this signature, and
  widening it to accept a bundle handle would reintroduce the data-layer import SIM-10 forbids.
- **D-31:** **`calendarDaysElapsed` is precomputed once by the caller** from the compiled calendar
  asset at load time, into a typed array the kernel reads per bar. The 10,000-cell sweep then
  computes it once in total rather than once per cell, and the kernel stays free of date
  arithmetic. Emitting it from the compiler as a new bundle field was rejected because it reopens
  Phase 2's binary format and D-19's no-transform rule for a value trivially derivable at load.
- **D-32:** **The caller rejects an out-of-range holding period before calling; the kernel asserts
  the range fits, outside the hot loop.** Phase 4 criterion 3 already requires impossible
  parameter combinations be prevented or explained on screen and never silently coerced, so the
  validity check belongs at the boundary. The kernel's assert exists so a sweep bug fails loudly
  rather than reading past the end of a buffer. Kernel-side truncation was rejected as exactly the
  silent coercion Phase 4 criterion 3 prohibits.

### Findings (not decisions — recorded for downstream agents)

- **F-01: Phase 2's D-08 rationale is factually wrong about this bundle.** 02-CONTEXT D-08 justifies
  deriving the trading calendar from the daily S&P series because it "gets the pre-1952 Saturday
  sessions right by construction, which covers roughly a quarter of this project's deepest
  history." **The compiled calendar contains zero Saturday sessions.** Measured directly from
  `public/data/calendar.51c75c1cba.bin`: 24,773 bars, day-of-week counts are Mon 4,765 / Tue 5,033
  / Wed 5,050 / Thu 4,973 / Fri 4,952, and Sat 0. Yahoo's `^GSPC` does not carry Saturday bars.
  1929 has 249 bars, 2024 has 252. The *decision* to derive the calendar from the S&P series may
  still be correct; its stated *reason* is not, and anything citing that reason downstream will be
  citing something false. This is not a Phase 3 blocker.
- **F-02: The bundled rate series stores percent, not fractions.** Manifest declares
  `units: "percent-annualized"` and stored values are 1.245, 3.5, 0.938. Handled by D-09; recorded
  separately because a 100x financing error is silent, plausible-looking, and would surface only
  as a confusing tracking-gate failure.
- **F-03: The 1933 bank holiday charges financing at an interpolated monthly rate.** The bundle
  carries 0.938% at the 1933-03-15 bar, produced by linear interpolation of NBER *monthly*
  observations (manifest seam: `kind: "interpolation"`, 1920-01-01 to 1933-12-31,
  `degradesToNonDaily: true`). Real call-money rates during the March 1933 bank holiday were
  violently dislocated; the model charges a smooth number over the most chaotic fortnight in the
  series. By contrast the 2001 gap uses observed `DFF` (2.13% at the 2001-09-17 bar), so full
  accrual there is straightforwardly what happened. **This is concrete evidence for Phase 2's
  D-17**, which recorded that Phase 5 criterion 4's stated extended-tier bias ("interpolated
  monthly data understates volatility drag") is probably wrong and that the real bias is
  financing-cost precision. D-04's flag is what lets Phase 5 say so with a specific bar to point
  at.
- **F-04: The 1929-1933 era is counterfactual by construction.** No leveraged ETF and no
  total-return swap market existed. The era's actual leverage mechanism was the broker call loan,
  which did accrue interest daily including through the bank holiday, so full accrual is the right
  model. Worth stating plainly wherever Phase 5 presents a 1929 entry.

### Claude's Discretion

Not raised during discussion; planner and researcher decide:

- The kernel's exact output array set beyond value and ruin flag, and whether the D-04 long-gap
  flag, the D-21 dropped-contribution total and the D-22 ruin bar index are separate outputs or
  fields on a returned summary object.
- Whether the kernel is one exported function or a small family sharing an inner loop, provided
  SIM-10's one-module rule holds.
- Buffer ownership and reuse strategy across calls, and how SIM-11's no-allocation claim is
  actually verified (a GC-pressure assertion, an allocation counter, or a benchmark delta).
- Where the D-12 shared tracking-error module lives in the tree and its exact function signature.
- Test file organization: whether PITFALLS section A becomes one checklist file or one file per
  pitfall, and whether fast-check property tests or table-driven cases carry each invariant.
- The concrete numeric threshold for D-04's "outsized calendar gap" flag.
- Whether the criterion-4 end-to-end script is a permanent repo tool or a throwaway, and its
  output format.
- How the contribution schedule's date-to-bar-index resolution is structured and where it lives
  relative to the kernel boundary in D-30.
- Whether PERF-02's bench row replaces or supplements the existing spike-kernel row in
  `bench/kernel.bench.test.ts`, given the spike kernel is explicitly throwaway.
- The dividend-reinvest toggle's mechanics for selecting between the two bundled series (SIM-07),
  which is a data-layer lookup rather than a kernel concern under D-30.

### Deferred Ideas (OUT OF SCOPE)

- **Time-varying expense ratio** stepped at each documented fee-change date (D-17). Most accurate
  option, deferred because it needs a sourced fee history per fund and adds a per-bar parameter
  array touching SIM-11's preallocation contract. Revisit if D-20's diagnosis points at ER drift.
- **Post-ruin restart as a separate labelled position** (D-21). PITFALLS A7 permits it only with
  its own curve and its own metrics. Belongs in Phase 4 or 5 if wanted at all.
- **Correcting Phase 2's D-08 rationale** (F-01). Editing another phase's committed CONTEXT.md is
  outside this phase's boundary; recorded here so the false claim is not propagated.
- **Restating Phase 5 criterion 4's extended-tier bias** (F-03). Phase 2's D-17 already flagged it
  and deliberately did not revise another phase's success criteria. This phase adds the concrete
  evidence; the restatement itself is Phase 5's.
- **Attribution decomposition** (ATTR-01 through ATTR-03) is Phase 5. Whether the kernel computes
  the three components in the same pass or Phase 5 recomputes them is a live question that touches
  PERF-02's 16ms budget, and was noted but not discussed.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SIM-01 | Arbitrary positive leverage 1x-20x, fractional allowed | Recurrence in Code Examples; D-05 (no branch on leverage); Phase 1 spike's `SpikeKernelParams.leverage: number` shape reused unchanged |
| SIM-02 | Leverage applied to daily returns, compounded, never to cumulative return | PITFALLS A1; per-bar recurrence in Code Examples; SIM-04's invariant test is the mechanical check |
| SIM-03 | Financing + ER accrue on calendar days elapsed, day-count documented | D-01/D-02 (two different bases, deliberately not conflated); Calendar-Day Accrual Mechanics section; `calendarDaysElapsed` sourced from `calendar.ts:18-27`/`binary-format.ts:242-249` |
| SIM-04 | 1x reproduces unlevered series exactly (test invariant) | D-05/D-06/D-07/D-10 (A10); 1e-9 relative tolerance derivation in D-06 |
| SIM-05 | Ruin clamps at zero, flags, absorbing state | PITFALLS A7; D-21 through D-24; Common Pitfalls section |
| SIM-06 | Initial + recurring contribution at daily/monthly/quarterly/yearly | D-25 through D-28; Contribution Scheduling section |
| SIM-07 | Dividend-reinvest toggle switches bundled series | 02-CONTEXT D-24 (TR reconstruction); data-layer concern per D-30, not a kernel branch |
| SIM-08 | Entry date + fixed holding period or hold-to-today | D-29 (data-layer truncation), D-32 (caller-side range validation) |
| SIM-09 | ER + financing spread user-editable, sourced defaults | Cost Parameter Sourcing section (this file); D-16 through D-19 |
| SIM-10 | Kernel is one module, no imports from data/sweep/chart layers | D-30 (typed-array-and-scalar boundary); Architecture Patterns |
| SIM-11 | Hot loop allocates nothing, 10k invocations produce no GC pressure | Allocation-Free Hot Loop and GC-Pressure Measurement sections; Phase 1's `bench/kernel.ts` preallocated-buffer pattern |
| SIM-12 | PITFALLS §A checklist exists as unit tests before UI work | Common Pitfalls section maps every A1-A11 item to a test; `tests/kernel.test.ts` is the existing pattern to extend |
| VALID-01 | Synthetic 3x vs real UPRO/TQQQ, shared tracking-error function | D-10 through D-13; Tracking-Error Gate Methodology section |
| VALID-02 | Documented, build-failing tracking-error tolerance | D-14/D-15/D-20; Tracking-Error Tolerance Derivation section |
| VALID-03 | Cost parameters sourced independently, never tuned; residual reported | D-14/D-18/D-19/D-20; Cost Parameter Sourcing section; No-Fitting Enforcement Mechanics |
| PERF-02 | Full-history single backtest under 16ms, measured on real hardware | `perf-budgets.ts` (threshold already locked at 16ms, `implementedInPhase: 3`); `bench/kernel.bench.test.ts` is the existing harness to extend; Phase 1 measured the spike kernel at 0.21ms (D-17 CI baseline), leaving very large headroom |

</phase_requirements>

## Summary

This phase has almost no open architectural questions: 03-CONTEXT.md already locks the full
recurrence, every day-count convention, the ruin boundary, the contribution schedule, and the
kernel's typed-array-only boundary against 32 numbered decisions. The Phase 1 spike kernel
(`bench/kernel.ts`) already proves the allocation-free branch structure hits the PERF-02 budget by
a wide margin (0.21ms measured on the CI baseline against a 16ms budget), and Phase 2 already
shipped the compiled bundle this kernel consumes, including the exact binary layout, the calendar
asset's day-count semantics, and the manifest's rate units. What remains for planning is narrower
than a typical phase: port the spike kernel's structure to the locked conventions (financing
`/360`, ER `/365`, calendar-anchored contributions, percent-to-fraction conversion), write the
PITFALLS §A checklist as unit tests, build the shared tracking-error module, and — the
highest-risk item — source and commit the two gate cost parameters (UPRO/TQQQ inception-era
expense ratio, financing spread range) with citations, in their own commit, before any validation
code exists.

**That last item is this research pass's weakest link.** ProShares' own current fact sheets
(fetched and read directly this session) give clean, dated figures for *today's* expense ratio,
but D-17 requires the **inception-era** figure (2009 for UPRO, 2010 for TQQQ), and SEC EDGAR
blocked every automated fetch attempted this session (see Sources). A WebSearch-derived claim of
"UPRO's 2009 summary prospectus stated 0.95% net" surfaced but is not independently confirmed
against a primary document read this session, so it is tagged `[ASSUMED]`, not `[VERIFIED]` or
`[CITED]`. The financing spread has the same shape of problem, but by design: PITFALLS A9 already
predicts "no fund itemizes swap financing spread in any public disclosure," and this session's
research corroborates that (Direxion's own public FAQ states the spread "varies by both Fund and
counterparty" with no number given). D-18 anticipates exactly this and asks for a defensible
*range* from indirect sources, not an itemized figure — this research pass supplies a candidate
range with its reasoning, flagged at the confidence level it actually earned.

**Primary recommendation:** Port `bench/kernel.ts`'s branch structure and allocation discipline
directly, replacing the three specific conventions 03-CONTEXT.md overrides (financing `/365` →
`/360`, ER as a flat `/252` bar-count-driven convention → calendar-day `/365`, contribution
scheduling by bar count → by calendar date), add the missing percent-to-fraction conversion, and
treat cost-parameter sourcing as its own gating task with a `checkpoint:human-verify` before the
D-19 atomic commit, since this research pass could not independently confirm the inception-era
figures against a primary SEC filing.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Leveraged daily recurrence (SIM-01/02/03/04/05) | Kernel module (pure compute) | — | D-30: typed arrays and scalars only, no imports from any other layer |
| Contribution date → bar index resolution (SIM-06) | Data/caller layer | Kernel (reads precomputed indices) | D-25: resolved once outside the hot loop; kernel stays date-arithmetic-free |
| Dividend-reinvest series selection (SIM-07) | Data layer | — | D-30/PITFALLS C3: a manifest lookup between two bundled series, not a kernel branch |
| `calendarDaysElapsed` precomputation (SIM-03) | Data/caller layer | Kernel (reads the typed array) | D-31: derived once from the compiled calendar asset, not per-cell |
| Entry-date/holding-period validation (SIM-08) | Data/caller layer (rejects) | Kernel (asserts, does not coerce) | D-32: Phase 4 criterion 3 forbids silent coercion; validity check belongs at the boundary |
| Cost parameter defaults + sourcing (SIM-09) | Constants module (kernel-adjacent, not kernel) | UI (Phase 4, editable fields) | D-16/D-17/D-18: sourced, citation-pinned, imported by kernel callers but not derived inside the kernel |
| Tracking-error computation (VALID-01/02) | Standalone module, sibling to kernel | Test suite, CI check, Phase 5 UI | D-12: explicitly not part of the kernel; three independent callers share it |
| PERF-02 measurement | Bench harness (`bench/`) | — | Existing Phase 1 infrastructure (`measureBatchedMinOfN`, `perf-budgets.ts`) already covers this budget; this phase swaps the input kernel |

## Standard Stack

### Core

No new runtime dependencies. The kernel is plain TypeScript operating on `Float64Array`/typed
arrays, consistent with `.claude/CLAUDE.md`'s locked stack decision (Q1: "Plain JS in a Worker
pool over `Float64Array`... WASM measured ~1.20x SLOWER than JS" — Phase 1 D-11/D-13, confirmed
again in `01-SPIKE-RESULTS.md` §3). Test and bench infrastructure is already installed and
configured:

| Library | Version (installed, `package.json`) | Purpose | Why Standard (already decided) |
|---------|---------|---------|--------------|
| TypeScript | 5.9.3 | Language | Already the project language; `tsconfig.json` already configured |
| Vitest | 4.1.10 | Test runner, `unit`/`bench`/`bench-selftest` projects already wired in `vitest.config.ts` | Native Vite integration; browser-mode bench project already exercises the real Chromium/Playwright boundary |
| fast-check | 4.9.0 | Property-based testing | Installed; not yet used in `tests/kernel.test.ts` (currently table-driven only) — this phase is the natural first user for invariants like SIM-04 (1x exactness) and D-08 (sub-1x credit sign) across arbitrary input ranges |
| @vitest/browser-playwright + playwright | 4.1.10 / 1.62.1 | Headless Chromium for `bench` project | Already the PERF-02 measurement environment (Phase 1); this phase's PERF-02 row swaps in the real kernel, no new tooling |

### Supporting

None. `comlink` (already a dependency, `4.4.2`) is Phase 7's sweep-worker concern (SIM-10's
"imported unchanged by both the single-run path and the sweep worker path" is a *contract* this
phase must satisfy, not a Comlink integration this phase performs).

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fast-check for SIM-04/D-08 invariants | Table-driven fixed cases only (Phase 1 spike's pattern) | fast-check catches edge cases (leverage values arbitrarily close to 1.0, extreme fractional leverage) a hand-picked table would miss; table-driven remains appropriate for the ruin detection test (D-23's exact `-40% at 3x` scenario is a fixed regression case, not a property) |
| Plain TS kernel | AssemblyScript/Rust→WASM | Already rejected at Phase 1 with a measured ratio (WASM ~1.20x SLOWER); no new evidence this phase changes that conclusion, and PERF-02 clears budget by two orders of magnitude in the spike measurement |

**Installation:** None required — every listed package is already present in `package.json`.

**Version verification:** All versions above were read directly from
`/workspace/-Users-abarcinski-myrepos-leverage-simulator/package.json` (Read tool, this session),
not queried against the npm registry, since nothing new is being installed. `[VERIFIED:
package.json]`.

## Package Legitimacy Audit

**Not applicable.** This phase introduces zero new external packages. Every library referenced
above is already installed (`package.json`, read directly this session) and was audited in prior
phases (Phase 1's `01-RESEARCH.md` Package Legitimacy Audit covers `vitest`, `fast-check`,
`playwright`, `@vitest/browser-playwright`; Phase 2's covers nothing new for this phase's needs).
No `checkpoint:human-verify` for package installation is owed.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────────┐
                    │  Compiled bundle (Phase 2, on disk)          │
                    │  *.bin assets + manifest.json                │
                    └───────────────────┬───────────────────────────┘
                                        │ decodeHeader / seriesView / calendarView
                                        │ (tools/bundle-compiler/src/binary-format.ts)
                                        ▼
                    ┌─────────────────────────────────────────────┐
                    │  Data/caller layer (this phase's ONE new     │
                    │  seam — not the kernel itself, D-30)         │
                    │  - percent→fraction conversion (D-09)        │
                    │  - calendarDaysElapsed diff (D-31)           │
                    │  - contribution date→bar index (D-25/D-31)   │
                    │  - entry/holding-period validation (D-32)    │
                    │  - dividend-mode series selection (SIM-07)   │
                    └───────────────────┬───────────────────────────┘
                                        │ Float64Array views + scalar params
                                        │ (SpikeKernelParams-shaped input)
                                        ▼
                    ┌─────────────────────────────────────────────┐
                    │  KERNEL MODULE (SIM-10: one module, no       │
                    │  imports from data/sweep/chart layers)       │
                    │                                               │
                    │  for each bar:                               │
                    │   1. leveraged daily return (D-05, SIM-02)   │
                    │   2. financing on (L-1), calendar/360 (D-01) │
                    │   3. expense ratio, calendar/365 (D-02)      │
                    │   4. ruin check, clamp+flag (D-23/D-24)      │
                    │   5. contribution add, post-ruin drop (D-21) │
                    │  writes into preallocated outValue/outRuined │
                    └──────┬────────────────────────┬───────────────┘
                            │                        │
             single-run path                sweep worker path (Phase 7,
             (Phase 4)                       not built here — D-30's
                                             signature is what makes this
                                             possible without a second impl)
                            │
                            ▼
                    ┌─────────────────────────────────────────────┐
                    │  Tracking-error module (D-12, sibling to     │
                    │  kernel, NOT imported by it)                 │
                    │  - annualized tracking error (Gate 1)        │
                    │  - annualized return drift (Gate 2)          │
                    └──────┬────────────────┬───────────────┬───────┘
                            │                │               │
                    Phase 3 tests    CI data-change    Phase 5 UI
                    (build-failing)   check              (VALID-04)
```

### Recommended Project Structure

Following the existing `bench/` and `tests/` split (Phase 1's pattern) and the data-layer seam
D-30 describes:

```
src/
├── kernel/
│   ├── backtest.ts          # the one module SIM-10 requires: runBacktest(params, series, outValue, outRuined) -> summary
│   └── backtest.types.ts    # KernelParams/KernelSeries/KernelResult shapes (typed arrays + scalars only, D-30)
├── validation/
│   └── tracking-error.ts    # D-12: shared function, imported by tests, CI check, and Phase 5 (not by the kernel)
├── data/                    # this phase's one new seam (not the kernel): manifest lookup,
│                             # percent-to-fraction, calendarDaysElapsed, contribution-date resolution
tests/
├── kernel.test.ts           # extend Phase 1's file, OR
├── kernel/
│   └── pitfalls-a.test.ts   # SIM-12: PITFALLS §A as an explicit checklist (Claude's Discretion: file split)
└── validation/
    └── upro-tqqq-gate.test.ts  # VALID-01/02: build-failing tracking-error test
scripts/
└── run-backtest.ts          # ROADMAP criterion 4: one-shot end-to-end script against the compiled bundle
bench/
└── kernel.bench.test.ts     # existing PERF-02 row; swap runSpikeBacktest for the real kernel (Claude's Discretion: replace vs. supplement)
```

### Pattern 1: Allocation-free hot loop with caller-owned output buffers

**What:** Every per-bar write goes into a `Float64Array`/`Uint8Array` the caller preallocated and
passed in; the function returns only a small summary object (finalValue, ruined, ruinBarIndex,
droppedContributions) constructed once, after the loop, not per bar.

**When to use:** Always, for this kernel — it is the mechanism SIM-11 depends on and the one
`bench/kernel.ts` already demonstrates clearing PERF-02's budget by roughly 90x on the CI baseline.

**Example (verified against the actual Phase 1 spike source, read this session):**
```typescript
// Source: bench/kernel.ts (this repo, read 2026-08-18) — the STRUCTURE is directly reusable;
// the arithmetic conventions below are the ones 03-CONTEXT.md OVERRIDES (see inline notes).
export function runSpikeBacktest(
  params: SpikeKernelParams,
  series: SyntheticSeries,
  outValue: Float64Array,   // caller-preallocated, written per bar, never read back mid-loop
  outRuined: Uint8Array,    // caller-preallocated; ruin flag lives in its own typed array (F2:
                             // never mix a sentinel value into the value array)
): SpikeKernelResult {
  const { returns, shortRate, calendarDaysElapsed } = series
  let value = params.initialInvestment
  let ruined = false

  for (let i = params.entryIndex; i < returns.length; i++) {
    const outIdx = i - params.entryIndex
    if (ruined) { outValue[outIdx] = 0; outRuined[outIdx] = 1; continue }

    const dailyReturn = returns[i] ?? 0
    const rate = shortRate[i] ?? 0
    const calendarGap = calendarDaysElapsed[i] ?? 1

    value = value * (1 + params.leverage * dailyReturn)          // A1: never on cumulative return

    if (params.leverage > 1) {
      // NOTE: this spike used /365. D-01 overrides this to /360 for the real kernel.
      const financingCost = value * (params.leverage - 1) *
        (rate + params.financingSpread) * (calendarGap / 365)
      value -= financingCost
    }

    // NOTE: this spike used a flat /252 (trading-day, not calendar-day) ER convention.
    // D-02 overrides this to `expenseRatio * (calendarGap / 365)` for the real kernel.
    value -= value * (params.expenseRatio / 252)

    if (value <= 0) { value = 0; ruined = true; outValue[outIdx] = 0; outRuined[outIdx] = 1; continue }

    // NOTE: this spike used outIdx % contributionIntervalBars (bar-count driven). D-25
    // overrides this to a precomputed calendar-date-anchored bar-index array.
    if (params.contributionIntervalBars > 0 && outIdx > 0 &&
        outIdx % params.contributionIntervalBars === 0) {
      value += params.contributionAmount
    }

    outValue[outIdx] = value
    outRuined[outIdx] = 0
  }
  // ... summary constructed once, after the loop
}
```

### Pattern 2: Calendar-day gap as a precomputed typed array, not per-bar date arithmetic

**What:** `calendarDaysElapsed[i]` is `calendar[i] - calendar[i-1]` in the compiled calendar's
own day-since-epoch units, computed once by the caller (D-31), never inside the kernel.

**Verified source (read this session, quoted verbatim):**
```typescript
// Source: tools/bundle-compiler/src/calendar.ts:18-27 (this repo, read 2026-08-18)
/**
 * Time-zone-independent day count since the Unix epoch: `toDaysSinceEpoch('1970-01-01')` is `0`,
 * `toDaysSinceEpoch('1970-01-02')` is `1`. Parses with `Date.UTC` on the three integer
 * components, never the process's local time zone.
 */
export function toDaysSinceEpoch(iso: string): number {
  const parts = iso.split('-')
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY)
}
```
`[VERIFIED: tools/bundle-compiler/src/calendar.ts:18-27]` — quote above is verbatim.

The calendar asset itself is decoded via:
```typescript
// Source: tools/bundle-compiler/src/binary-format.ts:242-249 (this repo, read 2026-08-18)
export function calendarView(buffer: ArrayBuffer, header: AssetHeader): Int32Array {
  const descriptor = header.descriptors.find((d) => d.kind === 'calendar')
  if (descriptor === undefined) {
    throw new Error('binary-format: calendarView called on an asset with no calendar descriptor')
  }
  return new Int32Array(buffer, header.headerByteLength + descriptor.dataByteOffset, descriptor.length)
}
```
`[VERIFIED: tools/bundle-compiler/src/binary-format.ts:242-249]` — this is an `Int32Array` of
days-since-epoch, one value per calendar bar, `[VERIFIED: tools/bundle-compiler/src/binary-format.ts:8]`
(header comment: `"days-since-epoch \`Int32Array\`"`). The caller diffs consecutive values against
each series' `calendarStartIndex` (`[VERIFIED: tools/bundle-compiler/src/binary-format.ts:64-72]`,
`SeriesDescriptor.calendarStartIndex` field) to produce `calendarDaysElapsed` per D-31.

### Pattern 3: Manifest rate units require a percent-to-fraction conversion at the data-layer boundary

**Verified source (read this session, quoted verbatim):**
```json
// Source: public/data/manifest.f0a9dfbdfa.json (this repo, read 2026-08-18)
{
  "id": "@rate/rate",
  "units": "percent-annualized",
  ...
}
```
`[VERIFIED: public/data/manifest.f0a9dfbdfa.json]` — the `units` field is literally the string
`"percent-annualized"`, confirming F-02. The kernel's `rate`/`financingSpread` scalar and array
arguments must therefore be fractions (D-09); the data layer divides by 100 exactly once when
building the typed array the kernel receives.

### Anti-Patterns to Avoid

- **Branching on `leverage === 1`:** D-05 explicitly rejects this — brittle against floating-point
  leverage values near 1.0, and creates a discontinuity a `leverage=0.9999999999` run would fall
  the wrong side of.
- **Bar-count-driven contribution scheduling** (`outIdx % intervalBars`): the Phase 1 spike does
  this and D-25 explicitly names it as the behavior being corrected — 21 trading bars is not a
  calendar month.
- **Reading the calendar asset or doing date arithmetic inside the kernel's hot loop:** D-30/D-31
  require `calendarDaysElapsed` to arrive as a precomputed typed array; the kernel must stay
  free of any date library or `Date` object construction in its per-bar path (also protects
  PITFALLS F2 — a `Date` object per bar is exactly the deoptimizing polymorphic allocation that
  pitfall warns about).
- **Applying the ER's `/252` convention to financing, or the financing `/360` convention to ER:**
  D-01/D-02 are deliberately different bases; PITFALLS A8 calls conflating them "a subtler form of
  the same error" as ignoring calendar-day accrual altogether.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Property-based invariant testing (SIM-04 exactness, D-08 sign correctness across arbitrary leverage) | Hand-written loops generating random test inputs | `fast-check` (already installed, `4.9.0`) | De facto standard, integrates directly with Vitest's `test()`, no new dependency |
| Business-day-following date roll (D-26/D-27) | A hand-rolled `Date`-based next-business-day walker inside the kernel or data layer | Index-walk against the already-compiled calendar's `Int32Array` (binary search or linear scan for the next index whose date >= target) | The compiled calendar (Phase 2) is already the single source of truth for which days are trading days; a second date-library-based calendar (e.g. NYSE holiday rules) would be a second implementation that can drift, exactly what Phase 2's D-21 was designed to prevent |
| GC-pressure measurement (SIM-11) | A custom heap-diffing harness built from scratch | Node's `--expose-gc` + `process.memoryUsage()` deltas around N repeated calls (Node-side unit test), cross-checked with the existing bench harness's batched-timing methodology (`measureBatchedMinOfN`) for the browser-side PERF-02 figure | Both are documented, standard techniques (see GC-Pressure Measurement section below); a custom V8 heap-snapshot parser is unjustified complexity for what a `process.memoryUsage()` delta and a stable per-call time already demonstrate |

**Key insight:** Nearly everything this phase needs already exists in this repo (the compiled
calendar, the manifest's rate series, the bench harness's calibration/batching methodology, the
Phase 1 spike's branch structure) or is already an installed dependency (`fast-check`). The
kernel itself should be the one genuinely new artifact; almost everything around it is
integration, not invention.

## Common Pitfalls

Every item below is PITFALLS.md §A, which the file's own header states is written to double as
this kernel's correctness checklist (SIM-12 requires exactly this). 03-CONTEXT.md's decisions
(D-01 through D-32) already resolve *how* to avoid each one; this table exists so the plan can
map one unit test per row.

### A1: Leverage applied to cumulative return instead of daily return
**What goes wrong:** `final = initial * (1 + L * total_period_return)` instead of compounding
day by day. **How D-01/D-05 avoid it:** the recurrence multiplies `value` by `(1 + L*r[i])` every
bar; cumulative return is never an input. **Test:** assert a leveraged run differs from
`L * total_return` on any volatile window (PITFALLS' own suggested test).

### A2: Financing on the borrowed portion ignored or mis-scaled
**What goes wrong:** only `L*r` is modelled; `(L-1)` is treated as free. **How D-01 avoids it:**
financing term scaled explicitly by `(leverage - 1)`. **Test:** cost attribution nonzero and
rate-sensitive at `L > 1`; zero at `L <= 1` structurally (D-05).

### A3: Wrong rate class (retail margin vs. institutional swap rate)
**What goes wrong:** using a broker margin rate (7-11%) instead of a wholesale short rate.
**How avoided:** the bundled `@rate/rate` series is FRED-sourced (DFF/DTB3/TB3MS splice, per
02-CONTEXT and PITFALLS §B), a wholesale rate by construction — this is a data-sourcing
correctness property inherited from Phase 2, not something this phase's kernel code enforces.
**Test:** D-20's diagnosis table — "synthetic far too pessimistic overall" is the warning sign if
this were ever wrong.

### A4: Expense ratio day-count convention
**What goes wrong:** ER applied inconsistently with financing's day-count, or on the wrong basis.
**How D-02 avoids it:** ER on actual/365 scaled by `calendarDaysElapsed`, deliberately different
from financing's actual/360. **Test:** known ER over a fixed calendar period sums to exactly the
annual ER regardless of trading-day count that year.

### A5: Wrong reference rate for the historical era
**Phase 2's problem, not this phase's** — the bundled rate series already splices NBER
monthly → TB3MS → DTB3/DFF with seam records (02-CONTEXT D-13). This phase's kernel just consumes
whatever rate the data layer hands it per bar; provenance display is Phase 5.

### A6: Broker/product spread over the reference rate omitted
**What goes wrong:** modelling financing as exactly the reference rate, no spread — understates
cost, makes synthetic outperform the real fund. **How D-01/D-18 avoid it:** `financingSpread` is
a distinct additive parameter, sourced independently (see Cost Parameter Sourcing below).
**Test:** VALID-01's high-rate-era sub-window statistic (D-13) is the detection mechanism —
"spread mis-calibration shows up disproportionately... in the high-rate 2022-2024 period."

### A7: Ruin boundary mishandled
**What goes wrong:** value goes negative and later "recovers" via compounding from a negative
base. **How D-23/D-24 avoid it:** `value <= 0` check every bar, clamp to exactly 0, freeze via a
`ruined` flag, no further compounding or contribution ever moves it. **Test (from PITFALLS
itself):** feed a synthetic single-day `-40%` return at `L=3`, assert output is exactly `0`, ruin
flag `true`, and all subsequent bars remain `0` regardless of subsequent input returns. This exact
test already exists in `tests/kernel.test.ts` against the spike kernel — port it.

### A8: Weekend/holiday financing accrual (calendar days vs. trading days)
**What goes wrong:** financing computed on a flat per-trading-day fraction, undercounting the
extra calendar days over a weekend/holiday. **How D-01/D-31 avoid it:** `calendarDaysElapsed`
read per bar from the precomputed array, financing scaled by it directly. **Test (exists in
`tests/kernel.test.ts` already, port and adjust for /360):** a 3-day gap costs 3x a 1-day gap's
financing, all else equal.

### A9: Overfitting the cost model to the validation target
**What goes wrong:** tuning ER/spread until UPRO/TQQQ tracking error looks tight, then presenting
that as evidence the model is correct. **How D-14/D-19/D-20 avoid it:** parameters sourced and
committed before any validation code exists (git-history-verifiable), tolerance derived from
enumerated un-modelled mechanisms rather than backed into from a measured residual, and D-20's
three-outcome diagnosis explicitly forbids touching cost parameters even on a gate failure.
**This is the phase's highest-discipline requirement** — see No-Fitting Enforcement Mechanics
below for the concrete commit-ordering mechanism.

### A10: 1x does not reproduce the unlevered series exactly
**How D-05/D-06/D-07 avoid it:** the cost model is structurally, not just arithmetically, gated
off at `L=1` (financing zeroes via `(L-1)`, ER defaults to 0 and is caller-supplied, never forced
nonzero). **Test:** `L=1, ER=0` run matches the raw bundled series within the 1e-9 relative
tolerance D-06 derives (not bit-for-bit — see D-06's floating-point accumulation-floor reasoning).

### A11: Floating-point compounding drift over ~25,000 daily steps
**How avoided:** `float64` (JS's native `number`) throughout, direct multiplicative compounding
(`value *= (1+r)`), no log-space round-trips. **Test:** D-06's 1e-9 tolerance is derived exactly
from this pitfall's own failure mode (`n * eps` accumulation, measured at ~5e-12 relative over
24,773 bars) — the tolerance IS the test for this pitfall, no separate test needed beyond SIM-04's.

### A12: Swap/futures cost-structure simplification
**Not a kernel bug** — a documentation/disclosure requirement (Phase 5's methodology page states
the reference-rate-plus-spread model is a simplification of real swap/futures financing,
defensible for broad-index products like UPRO/TQQQ per PITFALLS A12's own reasoning). Recorded
here because SIM-09's "documented as estimates" language touches it.

## Cost Parameter Sourcing (SIM-09, VALID-03, D-16 through D-19)

This is the section 03-CONTEXT.md's research emphasis is most focused on, and the weakest part
of this research pass's confidence. It is written to be directly copy-able into the phase's
D-19 "sourced-parameters" commit, with each figure's actual confidence tag preserved — **do not
silently upgrade an `[ASSUMED]` figure to `[CITED]` when writing that commit; re-verify first.**

### Expense ratio

| Fund | Current ER (fetched directly, 2026-08-18) | Inception-era ER (D-17's actual requirement) | Confidence |
|------|------|------|------|
| UPRO | Gross 0.91%, Net 0.91% (no active waiver) | Inception 2009-06-23; a WebSearch-derived claim states the 2009 summary prospectus's Total Net Annual Operating Expenses was 0.95% | Current figure `[CITED: proshares.com official UPRO fact sheet PDF, "As of 6/30/2026", fetched and read directly this session]`. Inception-era figure `[ASSUMED]` — not independently confirmed against a primary document this session (SEC EDGAR fetch blocked; see Sources) |
| TQQQ | Gross 0.97%, Net 0.84% (contractual waiver through 2026-09-30; the pre-waiver cap was itself disclosed at 0.95% in 2023/2024 SEC 497K filings per WebSearch synthesis) | Inception 2010-02-09 | Current figure `[CITED: proshares.com official TQQQ fact sheet PDF, "As of 6/30/2026", fetched and read directly this session]`. Inception-era figure `[ASSUMED]` — same caveat as UPRO |

**What was actually verified this session:** the Read tool was used directly on the two PDF
fact sheets fetched from `proshares.com/globalassets/proshares/fact-sheet/...` (not a
WebSearch summary — the raw PDF bytes were read and the figures above transcribed verbatim from
the "KEY FACTS" table on page 1 of each). Inception dates (`UPRO 06/23/09`, `TQQQ 02/09/10`) came
from the same read and are `[CITED: proshares.com official fact sheets]`, consistent with (though
not bit-identical to — see below) 03-CONTEXT.md's stated overlap-window start dates (UPRO
2009-06-25, TQQQ 2010-02-11), which are first-*trading-day-with-bundled-data* dates, a few
sessions after each fund's fact-sheet inception/launch date — not a discrepancy, two different
events.

**What was not verified:** the specific 0.95%-at-inception figures for either fund. A WebSearch
query returned an unsourced claim that UPRO's "2009 Summary Prospectus" stated 0.95%; this could
not be corroborated against a primary document because every `sec.gov` fetch attempted this
session (both `WebFetch` on specific filing URLs and an attempt at the Wayback Machine) returned
HTTP 403. `gsd-tools`' `classify-confidence` seam rates `webfetch` results as LOW confidence even
when verified=true, so even the successfully-fetched ProShares fact sheets are formally `LOW` per
that seam's calibration, despite being read directly from the primary source's own PDF — this
research pass tags them `[CITED]` rather than `[VERIFIED]` to reflect that the *content* is
primary-sourced even though the seam's provider-tier discount applies.

**Recommendation for the plan:** treat inception-era ER sourcing as its own task, gated behind
`checkpoint:human-verify`, before the D-19 atomic commit. A human (or an agent with working SEC
EDGAR / Wayback Machine access) should pull the actual 2009 UPRO and 2010 TQQQ summary
prospectuses (`sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001174610&type=497`, both
funds are under CIK 1174610 "ProShares Trust," not the CIK 1415311 "ProShares Trust II" some
search results conflated this with) and record the exact "Total Annual Fund Operating Expenses"
figure from the fee table, with the filing's accession number as the citation.

### Financing spread

PITFALLS A9/D-18 both anticipate that no fund itemizes swap financing spread publicly, and this
session's research corroborates that directly: Direxion's own public FAQ (a leveraged-ETF issuer,
same product category as ProShares' UPRO/TQQQ) states "[t]he spread varies by both Fund and
counterparty and is a function of market demand, hedging costs, access to balance sheet, borrow
volatility, current counterparty exposure and administrative costs" with **no number given**.
`[CITED: direxion.com FAQ, via WebSearch synthesis]` — MEDIUM/LOW confidence per the
`classify-confidence` seam for an unverified WebSearch result.

One WebSearch result cited a much larger figure — SOFR + 3.7% to 4.5% (all-in 8.06%-8.86%),
attributed to a Medium blog post — for an unspecified leveraged-ETF example. **This research pass
does not recommend using that figure.** It is an order of magnitude above every other signal
found (PROJECT.md's own placeholder default of "~0.5% over the short rate," general derivatives
literature on liquid broad-equity-index swap spreads typically citing tens of basis points, not
hundreds), is sourced from a single non-authoritative blog post, and its context (which fund,
which underlying, which period) was not established. It is flagged here so it is not
rediscovered and mistaken for a stronger source later. `[ASSUMED — explicitly rejected candidate]`.

**Recommended range for D-18's commit:** given the absence of any itemized public figure, this
research pass's most defensible position is to retain PROJECT.md's own placeholder — "roughly
0.5% over the short rate" — as the *center* of a cited range (e.g., 20bp-80bp, a plausible band
for institutional broad-market-index total-return swap spreads per general market-structure
commentary), rather than inventing a tighter range this session cannot actually defend. **This
entire paragraph is `[ASSUMED]`** and is the single largest gap this research pass leaves for the
plan to close — D-18 explicitly calls for "a defensible range from public sources," and this
session's tool access (no SEC EDGAR, no N-CSR filing fetch) could not produce one. The plan should
budget a dedicated task (`checkpoint:human-verify` before the D-19 commit) to pull actual swap
rate schedules from UPRO/TQQQ (or comparable ProShares/Direxion products') N-CSR/N-CSRS annual and
semi-annual reports on SEC EDGAR, which — per this session's WebSearch findings — **do disclose
per-swap reset rates** (e.g., "SOFR + X.XX%" line items in the fund's schedule of open swap
contracts), directly contradicting PITFALLS A9's stated confidence that no itemized figure exists
in *any* public disclosure. That confidence should be revised: itemized swap rates likely exist
in N-CSR filings, they were simply not reachable with this session's tools.

## Tracking-Error Gate Methodology (VALID-01, VALID-02, D-10 through D-13)

**Two gates, each a distinct statistic (D-11), both computed by one shared function (D-12):**

1. **Gate 1 — annualized tracking error:** `stdev(dailySyntheticReturn - dailyFundReturn) *
   sqrt(252)`. Catches mechanism errors (e.g., leverage applied to the wrong quantity) — a
   precision measure, not a bias measure.
2. **Gate 2 — annualized return difference (drift):** the annualized total-return gap between the
   synthetic series and the real fund's total-return series over the full overlap window. Catches
   cost-model errors (wrong ER, wrong spread, wrong day-count) — a bias measure, distinct from
   Gate 1's precision measure.

This two-statistic split is a standard distinction in the ETF tracking-error literature: multiple
academic sources found this session (`tandfonline.com/doi/full/10.1080/14697688.2023.2222753`,
"Leveraged funds: robust replication and performance evaluation"; a Bridgeport
University working paper on LETF tracking errors) both describe "tracking error" and "tracking
difference" as the two standard indicators, corroborating D-11's framing.
`[CITED: academic tracking-error literature, general framing only — not a specific numeric
tolerance source]`.

**Comparison pairing (D-10), already locked, verified against Phase 2's actual output this
session:** synthetic 3x built from `SPX/price-return` and `NDX/price-return` (the index series),
compared against `UPRO/total-return` and `TQQQ/total-return` (the reconstructed fund series). Both
series exist in the compiled bundle today — confirmed via the manifest read this session
(`public/data/manifest.f0a9dfbdfa.json` lists `UPRO/price-return`, `UPRO/total-return`,
`TQQQ/price-return`, `TQQQ/total-return`, `SPX/price-return`, `SPX/total-return`, `NDX` similarly)
`[VERIFIED: public/data/manifest.f0a9dfbdfa.json]`.

**Overlap windows (D-13), stated in 03-CONTEXT.md as UPRO 2009-06-25 to present (17.1y) and TQQQ
2010-02-11 to present (16.5y).** These dates were not independently re-derived from the manifest
this session (they were read from 03-CONTEXT.md, itself presumably derived from the actual
per-symbol `firstDate` fields Phase 2 populated) — treat as `[CITED: 03-CONTEXT.md D-13]`, and the
plan should re-derive them programmatically from the manifest's `firstDate` fields at
implementation time rather than hardcoding the dates from this document, since the manifest is the
actual source of truth and its content-hash changes on every data refresh.

## Tracking-Error Tolerance Derivation (VALID-02, D-14, D-15)

D-14 requires the tolerance be **derived from enumerated un-modelled mechanisms**, each with a
cited or reasoned bp/yr estimate, summed with a safety factor — not measured from a trial run.
This research pass cannot compute that number (doing so risks exactly the anchoring D-14 exists to
prevent, and this document is research, not the phase's actual tolerance-setting commit), but it
can enumerate the mechanisms the plan should price, drawn from PITFALLS §A and this session's
research:

| Mechanism | Direction | Rough magnitude (for the plan to refine, not adopt verbatim) | Source |
|---|---|---|---|
| ER's real 365-day internal accrual vs. this model's calendar-day approximation of it | Small, bidirectional | A few bp/yr at most — D-02 already uses the 365-day convention PITFALLS A4 recommends, so this residual should be near zero if D-02 is implemented correctly | PITFALLS A4 |
| Swap dealer spread variation over time (D-18's spread is a single constant; real spreads move with counterparty balance-sheet cost) | Bidirectional, larger in stressed/high-rate periods | Plausibly tens of bp/yr in the 2022+ high-rate era specifically (this is exactly what D-13's rate-regime sub-window split is designed to surface) | Direxion FAQ (spread "varies... is a function of... hedging costs, access to balance sheet"); PITFALLS A6 |
| Fund trading/rebalance costs (bid-ask spread crossed on daily rebalance, not modelled at all) | One-directional (costs the fund, not the synthetic) | Small but nonzero; scales with underlying volatility (more rebalancing "work" in volatile periods) | General leveraged-ETF mechanics (PITFALLS A2/A12) |
| Securities lending revenue offsetting expenses (real funds may earn lending income the model doesn't credit) | One-directional (helps the fund, not the synthetic) | Small, fund-dependent, not quantified this session | Not independently researched this session — `[ASSUMED — needs its own citation before D-14's commit]` |
| Inception-era ER uncertainty itself (Cost Parameter Sourcing section above) | Bidirectional | Could be the single largest term if the `[ASSUMED]` 0.95% figures are wrong by more than a few bp | This document |

**Recommendation:** the plan's tolerance-setting task should treat the last row as a genuine risk
— an unverified ER input feeding directly into a tolerance-setting exercise is backwards from
D-14's intent. Resolving the `checkpoint:human-verify` on inception-era ER (Cost Parameter
Sourcing section) before deriving the final tolerance number is the correct ordering, even though
both could technically land in the same D-19 commit.

## No-Fitting Enforcement Mechanics (D-19)

Concretely, for the plan to structure as tasks:

1. **Commit 1 (atomic, before any validation code exists):** the sourced ER and financing-spread
   constants, each with an inline citation comment (source, retrieval/filing date, confidence
   tag). A test in the same commit pins each constant to its cited value (e.g.,
   `expect(UPRO_INCEPTION_ERA_ER).toBe(0.0095)`), so a later change to the constant without
   changing the citation comment fails CI.
2. **Commit(s) after:** the tracking-error module, the gate test, the tolerance-derivation
   document/constant (D-14's enumerated-mechanisms sum).
3. **Git history is the evidence** ROADMAP criterion 2 asks for — verify via `git log --oneline
   -- <constants file>` showing the constants commit predates the gate test's first commit, as
   part of the phase's own verification step, not just as a claim in a SUMMARY.md.

## Allocation-Free Hot Loop and GC-Pressure Measurement (SIM-11)

**The allocation discipline itself is already fully specified** by Phase 1's PITFALLS F1/F2 and
demonstrated working in `bench/kernel.ts` (preallocated `Float64Array`/`Uint8Array` outputs,
scalar accumulators only inside the loop, no per-bar object/array construction, ruin flag in a
separate typed array rather than a sentinel mixed into values). Port that structure directly.

**Measuring "no measurable GC pressure" (the harder half of SIM-11) — two complementary
techniques, neither requiring new tooling:**

1. **Node-side, `--expose-gc` heap-delta test** (new, for `tests/` — this repo's `unit` Vitest
   project already runs under Node): run the kernel N times (e.g., 10,000, matching SIM-11's own
   stated count) against the same preallocated buffers, call `global.gc()` before and after (Node
   must be invoked with `--expose-gc`; Vitest supports passing Node flags via `NODE_OPTIONS` or a
   `poolOptions.execArgv` entry), and assert `process.memoryUsage().heapUsed` after the run is
   within a small, documented tolerance of its value before the run. This is a standard,
   documented Node technique — `[CITED: nodejs.org/learn/diagnostics/memory/understanding-and-tuning-memory,
   nodejs.org/learn/diagnostics/memory/using-gc-traces]`. Caveat found this session and worth
   carrying into the plan: V8's old-generation GC is designed to run when the JS thread is idle,
   so a tight synchronous loop can leave little room for GC to actually run mid-loop, which can
   make a heap-delta assertion pass even with real allocation happening (the garbage just hasn't
   been collected yet) — mitigate by explicitly forcing `global.gc()` calls at fixed intervals
   inside the measurement loop, not only at the very start and end.
2. **Browser-side, batched-timing consistency** (reuses existing infrastructure): if the kernel
   truly allocates nothing per call, `bench/kernel.bench.test.ts`'s existing
   `measureBatchedMinOfN` pattern (already used for PERF-02) should show a flat per-call time
   across batch sizes — a kernel with hidden per-call allocation would show super-linear growth
   in batch time as GC pauses start interleaving with the measured work at larger batch sizes.
   This is not a new technique to build, just an additional assertion (e.g., compare per-call time
   at batch size 500 vs. 5,000) layered onto the existing PERF-02 bench file.

Both approaches are within `[CITED]`/documented-technique confidence; neither requires a new
dependency (Node's `--expose-gc` and `process.memoryUsage()` are built-in;
`performance.measureUserAgentSpecificMemory()` — the browser-native equivalent — was also found
this session but is Chromium-only and requires cross-origin-isolation headers not otherwise needed
by this project, so the simpler `--expose-gc` Node approach is recommended over it for this
phase's purposes).

## Contribution Scheduling (SIM-06, D-25 through D-28)

Already fully specified by 03-CONTEXT.md's decisions; the implementation-relevant detail this
research pass adds is **where the date-to-bar-index resolution algorithm should live** (explicitly
left to Claude's Discretion) and its shape:

1. Starting from the entry date, generate the sequence of nominal contribution dates (entry date +
   1 period, +2 periods, ...) up to the run's end date, applying D-27's month-end clamp for
   monthly/quarterly/yearly frequencies (daily frequency has no month-end edge case).
2. For each nominal date, roll forward per D-26 to the next trading day present in the compiled
   calendar (binary search over the calendar's `Int32Array`, since it's sorted ascending by
   construction).
3. Produce a sorted array of bar indices (relative to `entryIndex`, matching the kernel's output
   indexing) at which a contribution should be added; the kernel loop then does an O(1) check per
   bar (e.g., a precomputed `Uint8Array` contribution-flag array the same length as the output, or
   a monotonically-advancing pointer into the sorted index array — either avoids the spike
   kernel's `%` modulo check, which D-25 already rules out as bar-count-driven).

This keeps the kernel itself free of date logic (D-30) while producing an O(1)-per-bar check
inside the hot loop, preserving SIM-11's allocation-free contract (the schedule array is built
once, outside the loop, by the caller).

## State of the Art

| Old Approach (Phase 1 spike, explicitly throwaway) | Current Approach (this phase, per 03-CONTEXT.md) | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Financing on calendar `/365` | Financing on calendar `/360` (money-market convention) | D-01, this phase's context discussion | ~1.39% relative difference, ~15bp/yr at 3x in a 5% rate regime — material against the tracking gate |
| ER on flat trading-day `/252` | ER on calendar `/365`, calendar-day-scaled | D-02, this phase's context discussion | Matches how fund prospectuses actually accrue (PITFALLS A4); previously undercharged in low-trading-day years |
| Contributions on bar-count modulo | Contributions on calendar-date resolution, precomputed once | D-25, this phase's context discussion | Contribution count now matches what a user computes by hand (`amount * periods`), not drifting with trading-day-count-per-month variance |
| No percent-to-fraction conversion | Explicit /100 conversion at the data-layer boundary | D-09/F-02, this phase's context discussion | Corrects a latent 100x financing bug the spike kernel's synthetic (already-fractional) test data never exercised |

**No deprecated/outdated external dependency concerns** — no new external tooling is introduced
this phase; see State of the Art notes above, which are entirely internal (spike-kernel-to-real-
kernel convention corrections), not ecosystem changes.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | UPRO's inception-era (2009) prospectus expense ratio was 0.95% | Cost Parameter Sourcing | If wrong, the gate's per-fund ER default (D-16/D-17) is miscalibrated, directly biasing VALID-01's measured tracking error in a direction that could either mask a real bug or manufacture a false gate failure |
| A2 | TQQQ's inception-era (2010) prospectus expense ratio was ~0.95% (pre-waiver cap language found for 2023/2024, not independently confirmed for 2010 specifically) | Cost Parameter Sourcing | Same risk as A1, for TQQQ |
| A3 | A defensible financing-spread range centers near PROJECT.md's placeholder ("~0.5% over the short rate"), roughly 20-80bp | Cost Parameter Sourcing (Financing spread) | This is explicitly the weakest-evidence claim in this document; if the true institutional spread for these specific funds is meaningfully outside this band, D-18's midpoint default would be wrong in a way the no-fitting protocol (D-19) then locks in until a named-mechanism revision (D-15) |
| A4 | Direxion's public FAQ language ("no fund itemizes swap financing spread") generalizes to ProShares/UPRO/TQQQ specifically | Cost Parameter Sourcing (Financing spread) | Low risk — this reasoning already matches PITFALLS A9's independent prior conclusion; used only to corroborate, not as the sole basis |
| A5 | UPRO and TQQQ's N-CSR/N-CSRS annual reports likely disclose itemized per-swap financing rates (a finding that revises PITFALLS A9's stated confidence) | Cost Parameter Sourcing (Financing spread), recommendation to the plan | If these filings turn out not to itemize swap rates clearly, the plan's recommended `checkpoint:human-verify` task would need to fall back to D-18's original "researched range" approach rather than finding a precise itemized figure |
| A6 | Enumerated-mechanism bp/yr magnitudes in the Tracking-Error Tolerance Derivation table (e.g., "a few bp/yr," "tens of bp/yr") | Tracking-Error Tolerance Derivation | These are directional placeholders for the plan to replace with cited or reasoned figures per D-14's actual requirement — presenting them as final numbers would violate D-14's "cited or reasoned" bar |

**Recommendation:** every row above should be resolved (or explicitly re-confirmed as the best
available answer) via a `checkpoint:human-verify` task before the D-19 atomic parameter commit,
per this document's Cost Parameter Sourcing section.

## Open Questions

1. **What are UPRO's and TQQQ's actual inception-era prospectus expense ratios?**
   - What we know: current (2026) figures verified directly from ProShares' own fact sheets
     (UPRO 0.91%, TQQQ 0.97% gross / 0.84% net); a plausible but unconfirmed 0.95% figure for
     UPRO's 2009 prospectus surfaced via WebSearch.
   - What's unclear: the exact inception-era figure for either fund, confirmed against a primary
     SEC filing.
   - Recommendation: a dedicated sourcing task with SEC EDGAR or Wayback Machine access (this
     session's `WebFetch` tool was blocked by SEC.gov's WAF on every attempt) should pull the
     original 497K/485BPOS filing's fee table before the D-19 commit.

2. **What is a defensible, cited financing-spread range for UPRO/TQQQ specifically?**
   - What we know: PROJECT.md's placeholder is "~0.5% over the short rate"; general industry
     commentary confirms spreads exist and vary by counterparty/fund but are not itemized in
     ProShares' own public marketing materials; N-CSR-style annual reports for comparable
     leveraged-ETF issuers appear to itemize per-swap rates in principle.
   - What's unclear: whether UPRO's/TQQQ's own N-CSR filings actually itemize a rate, and what
     that rate has been across the 2009-2026 window (it would plausibly have moved with SOFR/
     Fed funds level and counterparty conditions, complicating "a single constant spread").
   - Recommendation: same sourcing task as above should also attempt to pull one or two years of
     N-CSR "schedule of open swap contracts" data for UPRO/TQQQ, which — if available — would be
     a much stronger citation than any secondary commentary found this session.

3. **Does the kernel's output need a per-bar "outsized calendar gap" flag as a full-length typed
   array, or a sparse list of (barIndex, gapDays) pairs?**
   - What we know: D-04 requires the flag to exist; only two gaps in 98 years exceed 5 calendar
     days (1933 bank holiday, 2001-09-11), per F-03.
   - What's unclear: whether a full `Uint8Array`/`Float64Array` the length of the run (mostly
     zeros/ones) or a sparse structure is more consistent with SIM-11's allocation-free contract
     and Phase 5's consumption pattern.
   - Recommendation: left to Claude's Discretion per 03-CONTEXT.md; a full-length typed array is
     simplest to preallocate and is consistent with every other kernel output (`outValue`,
     `outRuined`), so it is the more consistent default unless Phase 5's actual consumption
     pattern argues otherwise.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Kernel, unit tests, `--expose-gc` GC-pressure test | ✓ | 22.19.5 types installed (`@types/node`); runtime confirmed present via earlier phases' bench runs | — |
| Vitest (`unit` project) | SIM-12's PITFALLS §A test suite | ✓ | 4.1.10, already configured in `vitest.config.ts` | — |
| Vitest (`bench` project, headless Chromium via Playwright) | PERF-02 measurement | ✓ | Already configured; Phase 1 already measured PERF-02 successfully on this exact harness | — |
| `--expose-gc` Node flag | SIM-11's GC-pressure test | Not yet wired into any existing npm script | — | Add via `NODE_OPTIONS='--expose-gc'` in the test script invocation, or Vitest's `poolOptions.execArgv`; both are standard, no new dependency |
| SEC EDGAR / Wayback Machine access | Cost Parameter Sourcing (inception-era ER, N-CSR swap-rate data) | ✗ (this session) | — | `checkpoint:human-verify` task, or a future session/tool with working SEC.gov access (WebFetch returned HTTP 403 on every `sec.gov` URL attempted this session, including a `web.archive.org` fallback attempt) |

**Missing dependencies with no fallback:** none — every missing item above has a documented
fallback.

**Missing dependencies with fallback:** SEC EDGAR access (fallback: `checkpoint:human-verify`
task, documented extensively above); `--expose-gc` wiring (fallback: trivial addition to the test
script, no blocker).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10, already configured with three projects (`unit`, `bench`, `bench-selftest`) in `vitest.config.ts` |
| Config file | `/workspace/-Users-abarcinski-myrepos-leverage-simulator/vitest.config.ts` (existing, read this session) |
| Quick run command | `npm run test` (runs the `unit` project only — Node environment, fast) |
| Full suite command | `npm run test && npm run bench` (unit correctness + PERF-02 budget gate; `bench:selftest` is a gate-liveness proof, not part of the normal loop) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SIM-01 | Leverage 1x-20x fractional | unit (fast-check property) | `vitest run --project unit tests/kernel.test.ts` | ❌ Wave 0 — new kernel module and its test file |
| SIM-02 | Daily, not cumulative, compounding | unit (fixed-case + fast-check) | same | ❌ Wave 0 |
| SIM-03 | Calendar-day accrual, both bases | unit (fixed-case, ports existing 3-day-gap test pattern) | same | ❌ Wave 0 (existing pattern in `tests/kernel.test.ts` against the spike kernel, needs porting to the real kernel + `/360` convention) |
| SIM-04 | 1x exactness (1e-9 relative) | unit | same | ❌ Wave 0 |
| SIM-05 | Ruin clamp/flag/absorbing | unit (existing fixed-case pattern) | same | ❌ Wave 0 (ports directly from `tests/kernel.test.ts`'s existing ruin tests) |
| SIM-06 | Contribution scheduling | unit | same, plus a new date-resolution test file | ❌ Wave 0 |
| SIM-09 | Cost parameters pinned to citation | unit (constant-pinning test, D-19) | `vitest run --project unit tests/kernel/cost-parameters.test.ts` (proposed path) | ❌ Wave 0 |
| SIM-11 | No allocation / no GC pressure | unit (Node `--expose-gc` heap-delta) | `node --expose-gc ./node_modules/.bin/vitest run --project unit` (or wired via `NODE_OPTIONS`) | ❌ Wave 0 — needs the `--expose-gc` wiring described in Environment Availability |
| SIM-12 | PITFALLS §A full checklist | unit | same as above | ❌ Wave 0 |
| VALID-01/02 | Tracking-error gate, build-failing | unit (real-data comparison, not synthetic) | `vitest run --project unit tests/validation/upro-tqqq-gate.test.ts` (proposed path) | ❌ Wave 0 — needs the compiled bundle actually present (already produced by Phase 2, `npm run compile-data` output committed under `public/data/`) |
| PERF-02 | <16ms single backtest, real hardware | bench | `npm run bench` | ✓ exists (`bench/kernel.bench.test.ts`), needs its `runSpikeBacktest` import swapped for the real kernel |

### Sampling Rate
- **Per task commit:** `npm run test` (unit project — fast, Node-only)
- **Per wave merge:** `npm run test && npm run bench` (adds the browser-mode PERF-02 gate)
- **Phase gate:** both green, plus a manual/`checkpoint` confirmation that the D-19 cost-parameter
  commit genuinely predates the validation-test commit in git history (ROADMAP criterion 2's
  literal requirement — not fully automatable per D-19's own reasoning: "A CI check asserting
  commit ordering was rejected as brittle").

### Wave 0 Gaps
- [ ] `tests/kernel.test.ts` (or a new `tests/kernel/` split) — the real kernel's PITFALLS §A
      checklist; the file already exists against the throwaway spike kernel and is the direct
      structural template.
- [ ] `tests/validation/upro-tqqq-gate.test.ts` (or similar) — the build-failing tracking-error
      gate; entirely new, needs the compiled bundle loaded via the existing
      `tools/bundle-compiler/src/binary-format.ts` decode path.
- [ ] `src/kernel/cost-parameters.ts` (or similar) — the sourced, citation-pinned constants module,
      committed atomically before the gate test per D-19.
- [ ] `--expose-gc` wiring for the SIM-11 GC-pressure test — either a new npm script or a
      Vitest `poolOptions.execArgv` entry; does not exist yet.
- [ ] `scripts/run-backtest.ts` (ROADMAP criterion 4's one-shot end-to-end script) — does not
      exist yet.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth surface in this phase — pure compute kernel, no backend (APP-03) |
| V3 Session Management | No | Same reasoning |
| V4 Access Control | No | Same reasoning |
| V5 Input Validation | Yes (narrow) | D-32's caller-side range/parameter validation (leverage, holding period, entry index bounds) before the kernel is called; the kernel itself asserts (fails loudly, does not coerce) rather than validating user-facing input directly |
| V6 Cryptography | No | No cryptographic operations in this phase |

### Known Threat Patterns for this stack

This phase is a pure numeric compute module with no network, no user-authored code execution, and
no persistence — the conventional web-app threat surface (injection, auth bypass, XSS) does not
apply. The one relevant class of risk is **numeric/logic correctness treated as a security
property**, since this tool's entire value proposition is that its numbers are defensible:

| Pattern | STRIDE-adjacent category | Standard Mitigation |
|---------|--------|---------------------|
| Silent parameter coercion (e.g., an out-of-range holding period silently clamped rather than rejected) | Tampering (of a different kind — data integrity of the *result*, not an attacker) | D-32: caller rejects before calling, kernel asserts rather than coerces; already locked |
| A crafted/adversarial input causing the kernel to read past a buffer's end (e.g., a holding period longer than the bundle's data) | Information disclosure / crash (via out-of-bounds typed-array read) | D-32's kernel-side assert on the caller-provided range, outside the hot loop, exactly to fail loudly rather than read garbage or crash unpredictably inside the loop |
| Floating-point edge cases (NaN/Infinity propagating from a malformed input, e.g. leverage=0 combined with certain contribution patterns) | Denial of service (a NaN propagating through Phase 7's sweep and into a color scale, per D-22's own stated concern) | D-22's categorical ruin flag (never null/NaN); the kernel's typed-array-only, scalar-only boundary (D-30) limits the input surface to values the caller has already validated |

No `security_asvs_level` escalation is warranted for this phase given the absence of any
network/auth/persistence surface; the table above is included because `security_enforcement` is
enabled in `.planning/config.json` and V5 has a genuine, if narrow, applicability here.

## Sources

### Primary (HIGH confidence)
- This repository, read directly this session: `tools/bundle-compiler/src/calendar.ts`,
  `tools/bundle-compiler/src/binary-format.ts`, `public/data/manifest.f0a9dfbdfa.json`,
  `bench/kernel.ts`, `tests/kernel.test.ts`, `bench/kernel.bench.test.ts`, `bench/calibration.ts`,
  `bench/report.ts`, `vitest.config.ts`, `package.json`, `perf-budgets.ts`, `.planning/PROJECT.md`,
  `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/research/PITFALLS.md`,
  `.planning/phases/03-simulation-kernel-and-the-upro-tqqq-gate/03-CONTEXT.md`,
  `.planning/phases/02-compiled-data-bundle/02-CONTEXT.md`,
  `.planning/phases/01-performance-spike-and-budget-lock/01-SPIKE-RESULTS.md`.

### Secondary (MEDIUM confidence)
- ProShares UPRO and TQQQ official fact sheet PDFs
  (`proshares.com/globalassets/proshares/fact-sheet/prosharesfactsheetupro.pdf` and
  `...tqqq.pdf`), fetched and read directly (not summarized) this session, "As of 6/30/2026" —
  current expense ratios and inception dates. Note: the `gsd-tools` `classify-confidence` seam
  rates the `webfetch` provider as LOW even when the fetch succeeds; this document tags these
  figures `[CITED]` on the basis that the content itself is a direct primary-source read, while
  acknowledging the seam's own calibration would rate the provider LOW.
- Direxion public FAQ (via WebSearch synthesis) — swap spread "varies by fund and counterparty,"
  no itemized figure — corroborates PITFALLS A9.
- Academic tracking-error framing (tandfonline.com/doi/full/10.1080/14697688.2023.2222753;
  scholarworks.bridgeport.edu LETF tracking-error working paper) — general "tracking error vs.
  tracking difference" distinction, not a specific numeric tolerance.

### Tertiary (LOW confidence)
- WebSearch-synthesized claim that UPRO's 2009 summary prospectus stated 0.95% net expenses —
  not independently confirmed against a primary document this session; tagged `[ASSUMED]`
  throughout this document.
- WebSearch-synthesized claim regarding TQQQ's 2023/2024 pre-waiver expense cap (0.95%) from SEC
  497K filing search snippets — plausible but not independently read from the primary filing.
- A single Medium blog post's SOFR+3.7%-4.5% financing-spread example — explicitly flagged in
  this document as a rejected candidate, not a recommended figure.
- Node.js GC-pressure measurement techniques (`--expose-gc`, `process.memoryUsage()`,
  `performance.measureUserAgentSpecificMemory()`) — sourced from nodejs.org's own diagnostics
  documentation (found via WebSearch, not independently fetched and read this session) — treated
  as MEDIUM confidence given nodejs.org is the authoritative source, but the specific page content
  was not directly read via WebFetch this session, only summarized via WebSearch.

## Metadata

**Confidence breakdown:**
- Kernel recurrence, day-count, ruin, contribution mechanics: HIGH — fully specified by
  03-CONTEXT.md's 32 decisions, cross-checked against the working Phase 1 spike kernel and Phase 2's
  actual compiled bundle format (read directly this session).
- Cost parameter sourcing (expense ratio, financing spread): LOW/MEDIUM — current-value figures
  verified directly from primary ProShares documents; inception-era figures (the ones the phase
  actually needs per D-17) and any itemized financing spread remain unconfirmed against a primary
  filing due to this session's SEC EDGAR access being blocked.
- Performance/allocation discipline (PERF-02, SIM-11): HIGH for the pattern (already measured
  working in Phase 1 at 0.21ms/16ms budget on the CI baseline), MEDIUM for the specific
  GC-pressure measurement technique (standard, documented, but not yet implemented/tested in this
  repo).
- Tracking-error gate architecture: HIGH for the two-gate structure and comparison pairing
  (fully locked in 03-CONTEXT.md, corroborated by general academic framing found this session);
  LOW for the actual tolerance number (deliberately not computed by this research pass, per D-14).

**Research date:** 2026-08-18
**Valid until:** The kernel-mechanics portions are stable (no external dependency, ~90-day
validity typical for locked internal decisions). The Cost Parameter Sourcing section should be
treated as valid only until the recommended `checkpoint:human-verify` sourcing task runs — do not
carry the `[ASSUMED]` figures in this document past that task without re-confirmation.
