# Phase 3: Simulation Kernel and the UPRO/TQQQ Gate - Context

**Gathered:** 2026-08-18
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers one numeric module and the evidence that it is right. Specifically:

1. **The simulation kernel**: a single module implementing the daily-rebalanced leveraged
   recurrence with its full cost model (leveraged daily return, financing on the borrowed
   portion, expense ratio, ruin clamp, contributions), allocation-free in its hot loop and
   importable unchanged by both the single-run path and the future sweep worker.
2. **The correctness test suite**: every item on PITFALLS.md section A as a unit test, passing
   before any UI code exists.
3. **The UPRO/TQQQ validation gate**: synthetic 3x compared against real leveraged-ETF history
   through a single shared tracking-error function, enforced as a build-failing test, with cost
   parameters sourced and committed before validation first runs.
4. **A one-shot end-to-end script** that runs a real backtest against the compiled bundle and
   prints the equity curve, exercising the full parameter surface.
5. **PERF-02 measured**: a single backtest over the full ~25,000-bar history under 16ms on real
   hardware, reported by the existing `npm run bench` harness.

Not in scope: any UI, any chart, the sweep engine, the worker pool, attribution decomposition,
the in-app synthetic-vs-real view (VALID-04 is Phase 5), IRR and drawdown metrics (Phase 4), and
the permalink. This phase produces the kernel those phases call and the proof that calling it is
worth anything.

**Hard gate.** ROADMAP §Sequencing Notes: do not begin Phase 4 on a kernel that has not passed
this comparison. The cost of a kernel bug found after the UI exists is every downstream number
being quietly wrong.

</domain>

<decisions>
## Implementation Decisions

### Day-Count Conventions

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

  > **D-10 AMENDED, 2026-08-18, after plan 03-06 first ran the gate.** The synthetic now applies
  > 3x to **`SPX/total-return` and `NDX/total-return`**, not the price-return series. Evidence and
  > full derivation: `03-GATE-DIAGNOSIS.md`.
  >
  > What was wrong: D-10 correctly identified that comparing against the funds' *price* return
  > would show their distribution yield as phantom underperformance, and correctly chose
  > `UPRO/total-return` / `TQQQ/total-return` as the target. It then left the *synthetic* on the
  > price-return index, which put the two sides of the comparison on **different dividend
  > conventions** and reintroduced the same phantom underperformance on the other side of the
  > subtraction. That asymmetry, not any cost, was the entire Gate 2 residual: UPRO measured
  > -6.968% and TQQQ -3.860% annualized drift against a 0.525% tolerance. Matching the conventions
  > moves them to **+0.254%** and **+0.399%**, both inside tolerance, with no cost parameter
  > touched. This was D-20 outcome 1, a structural fix.
  >
  > The original rejection reason ("neither fund tracks a total-return index") conflates the
  > fund's stated *benchmark* with the correct *model input*. A leveraged ETF gains its exposure
  > through a total-return swap: the counterparty delivers the index's total return and is paid
  > financing on the notional. The kernel's financing term already prices that leg, so the return
  > leg it is paired with must be the total return. Pairing a financing charge with a
  > dividend-stripped return leg charges for exposure the model never credits.
  >
  > Note this does not change what the funds track, and it does not change Gate 1: the tracking
  > error is unmoved (UPRO 3.164% -> 3.215%, TQQQ 3.565% -> 3.533%) because it has a separate
  > cause, priced separately in `TOLERANCE_MECHANISMS`'s
  > `fund-nav-vs-market-close-pricing-basis` row.
  >
  > **Carried forward for Phase 5:** VALID-04's in-app synthetic-vs-real view must render this
  > same amended pairing. A view built against the original D-10 wording would display the
  > ~7%/yr phantom gap to users as if it were real cost.
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and scope
- `.planning/REQUIREMENTS.md` §Simulation Kernel — SIM-01 through SIM-12 in full (lines 87-118).
  SIM-10's one-module rule and SIM-11's no-allocation rule constrain the kernel's signature.
- `.planning/REQUIREMENTS.md` §Validation — VALID-01, VALID-02, VALID-03 (lines 122-132).
  VALID-04 is Phase 5, not this phase.
- `.planning/REQUIREMENTS.md` PERF-02 (line 27) — the 16ms single-backtest budget this phase
  first measures.
- `.planning/ROADMAP.md` §"Phase 3: Simulation Kernel and the UPRO/TQQQ Gate" — the five success
  criteria this phase is verified against. Criterion 2's no-fitting-with-git-history requirement
  and criterion 5's no-GC-pressure requirement are the two hardest.
- `.planning/ROADMAP.md` §Sequencing Notes — "Phase 3 is a hard gate."

### The correctness checklist (this phase's primary source)
- `.planning/research/PITFALLS.md` §A — **the whole section**. A1 (leverage on daily not
  cumulative), A2 (financing on the borrowed portion), A3 (wholesale not retail rate), A4 (ER and
  day-count), A5 (rate series by era), A6 (product spread), A7 (ruin boundary, includes a concrete
  detection test), A8 (calendar vs trading day accrual), A9 (overfitting the validation target),
  A10 (the 1x invariant), A11 (float64 compounding drift), A12 (swap and futures cost structure).
  PITFALLS.md's own header states section A is written to double as the kernel's correctness
  checklist and that every line item should become a unit test. SIM-12 requires exactly that.
- `.planning/research/PITFALLS.md` §B — the historical rate series treatment behind A5, needed to
  understand what the bundled rate series actually is by era.

### Project constraints and prior decisions
- `.planning/PROJECT.md` §Requirements "Simulation engine" — the cost formula and the calendar-day
  accrual rule this phase implements.
- `.planning/PROJECT.md` §Key Decisions — the row "Financing accrues on calendar days, not trading
  rows", and the row committing plain JS over WASM for the compute path.
- `.planning/STATE.md` §Blockers/Concerns — the standing Phase 3 entry on cost-parameter sourcing.
- `.planning/phases/02-compiled-data-bundle/02-CONTEXT.md` — D-08 (calendar derivation, see F-01),
  D-09 (gap policy and carry-forward seams), D-12 (ragged right edges, the reasoning behind D-29),
  D-14 (tier is a property of symbol and dividend mode), D-16 (typed seam records), D-17 (the
  extended-tier bias claim, see F-03), D-19 (raw float64, no transform), D-20 (index levels stored,
  kernel derives returns), D-21 (shared calendar asset, start index and length per series),
  D-24 (ETF total return reconstructed from close plus dividends, the D-10 comparison target).
- `.planning/phases/01-performance-spike-and-budget-lock/01-CONTEXT.md` — D-19 (budgets locked),
  D-20 (70% escalation trigger), D-21 (`perf-budgets.ts` as single source of truth).
- `.planning/phases/01-performance-spike-and-budget-lock/01-SPIKE-RESULTS.md` — the measured
  PERF-02 figure from the spike kernel and the method behind it.

### Existing code this phase extends or replaces
- `bench/kernel.ts` — the Phase 1 **throwaway** spike kernel. Its own header says so. Carries the
  right branch structure but three conventions this phase overrides (ER on flat /252, financing on
  /365, bar-count contributions) plus the missing percent-to-fraction conversion (F-02). Read it
  for the allocation discipline and the branch set, not for the arithmetic.
- `perf-budgets.ts` — PERF-02's threshold lives here, locked under Phase 1's D-19. Adding a row is
  permitted; relaxing one requires a Key Decision.
- `bench/kernel.bench.test.ts` — the existing PERF-02 bench row this phase's real kernel replaces
  or supplements.
- `tests/kernel.test.ts` — the spike kernel's existing tests, a starting reference for structure.
- `tools/bundle-compiler/src/binary-format.ts` — the header layout and decoder entry point the
  data layer uses to produce D-30's typed arrays.
- `src/data-bundle.generated.ts` — generated pointer to the content-hashed manifest and bundle
  version.
- `public/data/manifest.f0a9dfbdfa.json` — the live manifest. Series ids, calendar start indices,
  lengths, units, and the seam records behind F-03.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `bench/kernel.ts` `runSpikeBacktest`: the branch structure (ruin short-circuit, structural
  financing gate, contribution-after-ruin-check ordering) and the caller-supplied preallocated
  output array pattern are both directly reusable. The arithmetic conventions are not (D-01,
  D-02, D-25 all override it) and the percent conversion is missing (F-02).
- `bench/` harness: `measureMinOfN` / `measureBatchedMinOfN`, the calibration score, the
  `assertRunInvariants` budget gate, and the JSON artifact writer all already exist and are how
  PERF-02 gets reported. Phase 1's D-21 makes `perf-budgets.ts` the single source of truth.
- `tools/bundle-compiler/src/binary-format.ts`: the decode path from `.bin` to `Float64Array`
  views already exists and round-trip tests already assert exactness against the compiler's
  in-memory series.

### Established Patterns
- Preallocated typed arrays supplied by the caller, never allocated in the loop (Phase 1 F1/F2
  discipline, already followed in `bench/kernel.ts`).
- Budgets are declared in `perf-budgets.ts` with a perception anchor, gated in CI, and never
  silently relaxed. PERF-02 is already declared and already gated.
- Manifest-recorded seams over silent data fixes (Phase 2 D-09, D-11, D-16). D-29 extends the same
  principle to runtime: no silent carry-forward.
- Vendored data is committed and reviewed as a git diff (Phase 2 D-01, D-07).

### Integration Points
- **Data layer to kernel**: the only new seam this phase creates. Per D-30 the kernel takes typed
  arrays and scalars; the data layer owns manifest lookup, tier and dividend-mode series
  selection, percent-to-fraction conversion (D-09), `calendarDaysElapsed` precomputation (D-31),
  contribution date resolution (D-25), and the D-29 truncation.
- **Kernel to bench**: `bench/kernel.bench.test.ts` swaps the spike kernel for the real one to
  produce the PERF-02 figure against real bundled data rather than synthetic series.
- **Kernel to Phase 7 sweep**: not built here, but D-30's signature is what makes SIM-10's
  one-module claim survive contact with the worker pool.
- **Tracking-error module to Phase 5**: D-12's shared function is called by this phase's tests and
  by Phase 5's in-app view (VALID-04), so its signature should not assume a test context.

</code_context>

<specifics>
## Specific Ideas

- The user asked, on the 1933 and 9/11 closures, whether full financing accrual "is what actually
  happened" rather than accepting the recommendation. The answer drove D-04's flag and F-03/F-04.
  Downstream agents should treat "is this what actually happened" as the standing bar for this
  phase, not "is this a reasonable model."
- The user pushed back on the no-fitting protocol with a specific worry: that a too-tight tolerance
  would lead to "fixing a bug that isn't actually a bug." That objection is correct and produced
  D-15 and D-20's pattern-based diagnosis. **Do not re-tighten the protocol back to a frozen
  tolerance**; the escape hatch is deliberate and was added in response to a named risk.
- The user asked where the short rate comes from and what the financing rate actually is. Recorded
  in D-09 and the canonical refs: the bundled `@rate/rate` series, spliced NBER monthly (pre-1934,
  interpolated), TB3MS (1934-1954, interpolated), DTB3 (1954), DFF (1954-present), plus the
  user-editable spread. PITFALLS A3 is why it must be a wholesale rate.

</specifics>

<deferred>
## Deferred Ideas

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

</deferred>

---

*Phase: 03-simulation-kernel-and-the-upro-tqqq-gate*
*Context gathered: 2026-08-18*
