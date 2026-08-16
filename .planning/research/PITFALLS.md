# Pitfalls Research

**Domain:** Leveraged-ETF simulation / financial backtesting (client-side, static web app)
**Researched:** 2026-08-16
**Confidence:** MEDIUM-HIGH (rate-series and dataset dates verified against FRED/official pages; cost-structure and methodology claims cross-checked against multiple independent sources; a few figures — e.g., exact swap financing spreads — are industry-estimated, not itemized in any single public disclosure, and are flagged LOW where that applies)

This file is organized around the eight areas requested for this project: (A) simulation
modelling correctness, (B) historical rate series, (C) historical price data, (D) backtesting
methodology, (E) visualization, (F) browser compute performance, (G) credibility/presentation,
(H) scope traps. Section A is written to double as a correctness checklist for the simulation
kernel — every line item should become a unit test.

---

## A. Simulation Modelling Errors (Correctness Checklist)

This is the highest-stakes section. Every pitfall here directly falsifies the "receipts" value
proposition if uncaught.

### A1: Applying leverage to the cumulative/total return instead of the daily return

**What goes wrong:** Computing `final = initial * (1 + L * total_period_return)` instead of
compounding `1 + L*r_day` day by day. This is the single most common error in the online
arguments this tool exists to settle — it's the naive `return * L` model named explicitly in
PROJECT.md.

**Why it happens:** It's algebraically tempting and matches how leverage "feels" like it should
work (3x means 3x the return). It is also correct for a single day, which makes it easy to
generalize incorrectly to a period.

**How to avoid:** The kernel must iterate day-by-day: `v[t] = v[t-1] * (1 + L*r[t] - (L-1)*(short_rate[t]+spread)/252 - expense_ratio/252)`. Cumulative return over any period is an *output*
of this process, never an input to a leverage multiplication. Never compute leveraged outcomes
from pre-aggregated period returns (monthly, yearly) — only from the finest-grain daily series
you have.

**Warning signs:** Any code path that takes a `startPrice`/`endPrice` pair and a leverage
scalar without touching the intermediate path is wrong by construction, even if it "looks"
close over calm periods.

**Phase:** Simulation engine (core kernel) — this is the first thing to get right, before any
UI exists.

---

### A2: Ignoring or mis-modelling financing cost on the borrowed portion

**What goes wrong:** Only the `L*r_day` term is modelled; the `(L-1)` portion of exposure that
is economically borrowed is treated as free leverage.

**Why it happens:** Financing cost is a second-order term relative to volatility drag in
casual discussion, so it gets dropped "for simplicity" — but over a decade-plus hold it is
often comparable in magnitude to volatility drag, and it is the term most sensitive to the
interest-rate regime (near-zero 2009-2021 vs. >5% 2022-2024), so omitting it makes the model
look artificially rate-regime-invariant.

**How to avoid:** Model exactly as PROJECT.md specifies: `-(L-1)*(short_rate + spread)/252`,
applied every day leverage is held, scaled by `(L-1)` not `L` (only the borrowed multiple
accrues financing cost; the 1x you already "own" doesn't).

**Warning signs:** A 1x run and a leveraged run showing identical sensitivity to the short-rate
input; a synthetic 3x run that doesn't visibly get worse in 2022-2024 vs 2009-2015 relative to
a 1x baseline.

**Phase:** Simulation engine.

---

### A3: Confusing broker margin rates with institutional swap/futures financing rates

**What goes wrong:** Using retail margin loan rates (Reg T call money / broker "margin rate,"
commonly 7-11% even when the Fed funds rate is near zero) as the financing cost input, instead
of the institutional overnight rate the actual funds pay through swaps and futures.

**Why it happens:** "Leverage costs money to borrow" intuitively maps to the number a retail
investor sees on their own margin statement, but UPRO/TQQQ/SSO/QLD do not borrow via Reg T
margin — they gain exposure via total-return swaps and index futures, whose embedded financing
is priced off short-term reference rates (historically effective Fed funds / T-bill / LIBOR;
now increasingly SOFR-referenced) plus a much smaller counterparty spread, not the broker prime
rate.

**How to avoid:** The reference rate for the cost model must be a wholesale short-term rate
(Fed funds effective, 3M T-bill, or SOFR — see Section B), plus a spread on the order of tens
to ~100bp, not a retail margin rate. Document this choice explicitly in the UI next to the
rate parameter so a hostile reader can't claim you used the wrong kind of rate.

**Warning signs:** Synthetic leverage tracking real UPRO/TQQQ far too pessimistically
(underperforming the real fund) is the tell — a margin-rate-based cost model overstates
financing drag by several hundred basis points a year.

**Phase:** Simulation engine + data bundling (rate source selection).

---

### A4: Ignoring expense ratio, or applying it with the wrong day-count convention

**What goes wrong:** Either omitting expense ratio entirely, or applying it as `ER/365` /
`ER/360` inconsistently with how the financing term is annualized, or applying it only on
rebalance days instead of every calendar/trading day.

**Why it happens:** Expense ratio is a small daily number (0.90%/252 ≈ 0.0036%/day) that's easy
to treat as a rounding-error afterthought, and day-count convention mismatches (252 trading
days vs. 360 money-market days vs. 365 calendar days) are a classic source of silent 1-2%/year
drift in any interest-adjacent calculation.

**How to avoid:** Pick one convention and apply it consistently across ER and financing terms;
252 trading days is standard for equities work and is what PROJECT.md already specifies
(`expense_ratio/252`). Document the choice. When validating against real funds, note that fund
prospectuses typically state ER as an annual figure accrued daily on a 365-day basis internally
— a small, known, and acceptable source of validation residual, not something to silently
tune away (see A9).

**Warning signs:** A visible, unexplained ~0.3-0.5%/year gap between synthetic and real fund
performance that doesn't correlate with rate regime (that pattern points at ER/day-count, not
financing).

**Phase:** Simulation engine.

---

### A5: Wrong reference rate for the historical era (see Section B for full treatment)

**What goes wrong:** Using a single rate series (e.g., always Fed funds) across the entire
history including eras before that series exists, or silently switching series at a seam
without disclosing it, or using SOFR-like short-duration collateralized rates for eras where
only unsecured Fed funds/T-bill data exists (they are not interchangeable — SOFR is generally
a few basis points *below* effective Fed funds, and LIBOR carried a credit spread *above* it
that grew wider during stress, e.g. 2008).

**How to avoid:** See Section B for the concrete series and seam dates. The critical rule: the
UI-visible provenance for a run must state which rate series was in effect over which subrange
of the selected date window.

**Warning signs:** A visible discontinuity (level jump) in the reported financing-cost
attribution exactly at a series-seam date, with no accompanying explanation.

**Phase:** Data bundling + simulation engine.

---

### A6: Omitting the broker/product spread over the reference rate

**What goes wrong:** Modelling financing cost as exactly the reference rate with no spread,
which understates real-world cost and will cause synthetic leverage to *outperform* the real
ETF it's meant to validate against.

**How to avoid:** PROJECT.md already specifies `short_rate + spread` with spread defaulting to
"roughly 0.5% over the short rate" and user-editable. Keep it a distinct, separately-disclosed
parameter from the reference rate itself (don't fold it into a single opaque "financing rate"
default) so a user can see both what benchmark was used and what markup was assumed.

**Warning signs:** Synthetic 3x tracking real UPRO/TQQQ too well pre-2022 and diverging in the
high-rate 2022-2024 period specifically in the direction of synthetic outperforming — spread
mis-calibration shows up disproportionately when rates are high because the dollar cost of a
fixed-bp spread scales with the whole rate level's compounding base... actually the opposite is
also diagnostic: a *rate-independent* dollar-per-day drag error indicates the spread parameter
itself (not the reference series) is off.

**Phase:** Simulation engine (cost attribution), validated in the validation phase.

---

### A7: Mishandling the ruin boundary

**What goes wrong:** At `L=3`, a single-day index return of exactly `-1/L = -33.33%` reduces
the position to zero; anything worse and a naive `v[t] = v[t-1]*(1+L*r_day-costs)` formula goes
*negative*, and if the simulation continues compounding from a negative value, subsequent
"gains" flip the sign back positive and the position appears to recover from ruin — nonsense,
since a real leveraged ETF's NAV cannot go negative and the fund would be liquidated/reset by
the sponsor, not mathematically continue.

**Why it happens:** It's the one true discontinuity in an otherwise smooth model, and
smooth-model code paths don't naturally have a branch for it unless someone thinks about it
deliberately.

**How to avoid:** Clamp position value at zero the instant it would cross zero (not just when it
lands *exactly* on zero — intraday-style crossing must be caught even though the model works in
discrete daily steps, i.e. treat any day whose computed value is `<= 0` as ruin on that day,
report the position as ruined, and freeze it — no further compounding, no further contributions
generating "returns" on a dead position (though continued *contributions* to a fresh position
post-ruin, if the product spec allows restarting, must be an explicit, separately-labeled
event, not silently blended into the same equity curve). Flag ruin explicitly as a first-class
output value distinct from "a very bad number" (see also E4 on visualization).

**Warning signs:** Any negative number anywhere in a value series; any run that outputs a ruin
flag `false` while its value series contains a value `<1e-6` that later increases.

**Detection test:** Feed the kernel a synthetic single-day `-40%` return at `L=3` and assert
output is exactly `0` and ruin flag is `true`, then assert all subsequent days remain `0`
regardless of subsequent input returns.

**Phase:** Simulation engine — this needs an explicit unit test before any sweep/visualization
work begins, since sweeps at high leverage over 1929-1932 or October 1987 will hit this path.

---

### A8: Weekend/holiday financing accrual mismatch (calendar days vs. trading days)

**What goes wrong:** Financing cost (interest on the borrowed portion) accrues on *calendar*
days — a position held over a weekend or a market holiday still accrues 2-4 days of interest —
while price return only exists on *trading* days. A kernel that naively applies
`rate/252` per trading-day row undercounts financing cost by ignoring the extra calendar days
between Friday's close and Monday's close (and more for three-day weekends / holiday clusters).

**Why it happens:** It's invisible in a row-by-row trading-day iteration unless you
deliberately compute the actual number of calendar days elapsed since the previous trading
day and scale the financing term by that, rather than always multiplying by a flat `1/252`.

**How to avoid:** For the financing term specifically, use
`-(L-1)*(short_rate+spread)*(calendar_days_elapsed/365)` (or `/360`, pick one convention and
document it) rather than a flat daily fraction, where `calendar_days_elapsed` is the actual gap
since the prior trading day (1 normally, 3 over a weekend, more around holidays). Keep the
expense-ratio term on the flat trading-day convention if that's the intended convention — the
two terms have genuinely different real-world accrual bases and conflating them is itself a
subtler version of this same pitfall.

**Warning signs:** Validation residual against real UPRO/TQQQ that's small on average but has a
small systematic bias correlating with the number of 3-day weekends / holidays in a given year
rather than with volatility or rate level.

**Phase:** Simulation engine — easy to miss because it's not on the axis anyone thinks to sweep
in a first correctness pass.

---

### A9: Overfitting the cost model to the validation target

**What goes wrong:** Tuning `spread` and `expense_ratio` defaults purely to minimize tracking
error against UPRO/TQQQ over the full available window, then presenting the resulting tight fit
as evidence the *model* is correct, when it may just mean the parameters were fit to the
answer.

**Why it happens:** It's the path of least resistance once a validation harness exists —
"just adjust spread until the lines overlap" feels like debugging but is actually curve-fitting.

**How to avoid:** Set cost parameters from independently sourced figures (published ER from the
fund prospectus; a documented, cited estimate of typical swap financing spread) *before*
running the validation, then report the resulting tracking error honestly, including any
residual. A small, stable, unexplained residual is a *feature* of an honest model (it shows
real products have costs not fully captured by a two-parameter model, e.g., swap dealer
spreads aren't publicly itemized in a single number — confidence: MEDIUM, this is a reasonable
inference from public fund structure disclosures, not a single authoritative source). Document
the residual rather than eliminating it by fitting.

**Warning signs:** Zero or near-zero tracking error against the validation targets combined
with cost parameters that don't match any cited external source.

**Phase:** Validation phase (explicitly listed as a requirement in PROJECT.md) — write the
validation tolerance and the parameter-sourcing rule into the phase spec before implementation
starts, not after seeing the first result.

---

### A10: `1x` does not reproduce the unlevered series exactly

**What goes wrong:** A general-purpose formula that always subtracts expense ratio and/or
applies `(L-1)` financing even at `L=1` will fail PROJECT.md's own stated invariant
("1x reproduces the unlevered series exactly"), because at `L=1`, `(L-1)=0` correctly zeroes
the financing term, but a naively-always-applied expense ratio term does not zero out, silently
making the "1x baseline" a *slightly leveraged-fund-flavored* series rather than the true
underlying index/price series.

**How to avoid:** Decide explicitly whether "1x" in this tool means (a) the raw underlying
index/price series with zero cost model applied (the literal reading of the stated invariant),
or (b) a hypothetical unleveraged fund that still pays an expense ratio. PROJECT.md's wording
implies (a). If so, the cost model must be structurally gated off at `L=1`, not just
arithmetically reduced to a small nonzero residual.

**Warning signs:** A `L=1` run that doesn't bit-for-bit (or exactly, modulo floating point)
match the bundled raw price series.

**Phase:** Simulation engine — should be the very first automated test written.

---

### A11: Floating-point compounding drift over long daily series

**What goes wrong:** Summing/compounding ~25,000 daily steps (1928-present) in `float32` or
with naive repeated multiplication can accumulate visible drift, and doing costly operations
(e.g., `Math.pow`, `Math.exp/log` round-trips for "convenience") per day across a 250M-operation
sweep both hurts precision and hurts performance (see Section F).

**How to avoid:** Use `float64` (JS default `number`) throughout; prefer direct multiplicative
compounding (`v *= (1+r)`) over log-space accumulation unless log-space is specifically needed
for numerical stability at extreme leverage, and if log-space is used, exponentiate back
carefully near the ruin boundary (A7) since `log(0)` is undefined and must be special-cased,
not computed.

**Warning signs:** Two independently-computed equivalent formulations (e.g., iterative vs.
closed-form on a leverage-and-cost-free stretch) diverging by more than float64 epsilon-scale
noise.

**Phase:** Simulation engine.

---

### A12: Confusing a simple margin-loan cost model with real funds' swap/futures cost structure more broadly

**What goes wrong:** Beyond the rate mismatch (A3), the *mechanism* itself differs: futures-based
exposure (used by some leveraged products, especially commodity- and index-future-heavy funds)
embeds financing cost in the futures basis (contango/backwardation), which moves with supply and
demand for the specific contract, not purely with short rates — meaning a pure "reference rate +
spread" model is a simplification of futures-implied financing, closer to correct for
swap-heavy funds (UPRO/TQQQ are primarily swap- and futures-based on broad equity indices, where
the approximation is reasonably good) than it would be for, e.g., a leveraged commodity ETF.

**How to avoid:** Since the bundled universe (S&P 500, Nasdaq-100 leveraged products) is
swap/futures-on-broad-index, the reference-rate-plus-spread approximation is defensible — but
this must be stated as a modelling *choice* with a named limitation in the methodology
disclosure (Section G), not presented as a first-principles replication of fund mechanics.

**Warning signs:** None detectable purely from the S&P/NDX validation set — this is a
disclosure requirement, not a bug to catch by testing.

**Phase:** Data/methodology documentation (Section G) alongside the validation phase.

---

## B. Historical Rate Series Pitfalls

### B1: Series availability and seam dates (verified)

| Series | FRED ID | Frequency | Start date | Notes |
|---|---|---|---|---|
| Effective Federal Funds Rate | `DFF` | Daily | **1954-07-01** | Coincides with establishment of the fed funds market |
| 3-Month Treasury Bill, secondary market, discount basis | `DTB3` | Daily | **1954-01-04** | First business day of 1954 |
| 3-Month Treasury Bill, secondary market, discount basis | `TB3MS` | Monthly | **1934-01-01** | Only monthly-granularity source before 1954 |

Confidence: MEDIUM-HIGH — dates verified via web search against FRED's own series pages;
not independently cross-checked against a raw FRED API pull in this research pass. Confirm
against the live series metadata (`observation_start` field via the FRED API) during
implementation, since FRED occasionally backfills series.

**What goes wrong if unhandled:** A rate series naively assumed to start at "1954" for both
daily granularity sources is wrong for the purposes of the *extended* history tier reaching
back to 1928-1929 — there is no daily short-rate series covering the 1929-1932 crash at all.
Between 1934 and 1954 only *monthly* T-bill data exists (`TB3MS`); before 1934, no standard
FRED short-rate series exists at all and a different historical source (e.g., NBER macrohistory
series, or the Shiller dataset's own interest rate column, see C1) would be needed.

**How to avoid:** This is exactly the seam PROJECT.md's two-tier design (strict vs. extended)
already anticipates. Concretely:
- **Strict tier**: only date ranges where daily price *and* daily rate data both exist should be
  offered (effectively 1954-onward for rate-dependent leveraged simulation, though price data
  reaches back to 1928 — the rate series is now the binding constraint for "strict," not price).
- **Extended tier**: for 1928/1929-1954, must interpolate monthly rate data (Shiller's own rate
  column, or `TB3MS` for 1934+) to daily. This must be disclosed as interpolated in the UI, with
  the exact seam date shown, per PROJECT.md's "seam dates and data sources" requirement.

**Warning signs:** Any run spanning 1929-1932 that doesn't visibly indicate its rate data is
interpolated/monthly-sourced is a credibility risk given that this exact drawdown is the
project's stated "most persuasive data point."

**Phase:** Data bundling (rate series selection and seam documentation).

---

### B2: Monthly-to-daily interpolation of rates biases results and can introduce look-ahead bias

**What goes wrong:** Two common interpolation choices have different failure modes:
- **Linear interpolation** between two monthly observations smooths the rate but technically
  uses information from the *future* month-end value to set values on days *before* that
  month-end — a mild but real form of look-ahead bias in a series that's supposed to represent
  what was actually knowable day-to-day.
- **Flat/step interpolation** (hold the most recently known monthly value until the next
  monthly observation) has no look-ahead bias but produces a stair-step rate series with abrupt
  jumps at month boundaries, which will show up as small kinks in the cost-attribution chart.

**How to avoid:** Prefer step/forward-fill interpolation (last known value held constant) for
correctness — it's causal (only uses information available at the time) even though it's
visually less smooth. If linear interpolation is used instead for visual smoothness, this must
be disclosed explicitly as a non-causal smoothing choice in the extended-tier methodology
notes, not silently applied.

**Warning signs:** A synthetic run's financing cost curve that's suspiciously smooth across a
month with genuinely volatile short-term rates (e.g., autumn 2008) is a sign linear
interpolation is masking a real spike/drop.

**Phase:** Data bundling.

---

### B3: LIBOR-to-SOFR transition — mostly irrelevant to this project, but must be understood to avoid a wrong reflex

**What goes wrong (verified facts):** USD LIBOR panels (1mo/3mo/6mo/12mo settings) ceased
representative publication on **2023-06-30**; synthetic (non-representative) USD LIBOR
continued for legacy "tough legacy" contracts only through **2024-09-30**. SOFR is a
secured/collateralized overnight rate and has historically traded modestly *below* Fed funds
effective and LIBOR (LIBOR embedded an unsecured interbank credit spread that widened sharply in
stress periods, notably 2008).

**Why this mostly doesn't matter here:** PROJECT.md's cost model uses a short reference rate
(Fed funds / T-bill) plus a spread, not LIBOR directly, and Fed funds effective (`DFF`) has
continuous daily coverage straight through the LIBOR-SOFR transition with no seam at all.
There's no need to splice a LIBOR series into this project's rate input.

**Where it *could* matter:** If a future contributor tries to source real leveraged-fund
financing-cost commentary or prospectus language from before ~2022, that commentary will
reference LIBOR-based swap benchmarks even though this tool's own model uses Fed funds/T-bill.
That's a documentation-consistency trap, not a data-availability one: don't let LIBOR
terminology from older secondary sources leak into the tool's own rate-series labeling.

**Warning signs:** UI copy or tooltips that say "LIBOR-based" when the actual bundled series is
Fed funds/T-bill.

**Phase:** Data bundling / documentation — low priority, but worth a one-line disclosure note
("this model uses Fed funds effective rate as a reference rate; real fund swap agreements have
historically referenced LIBOR pre-2023 and increasingly reference SOFR since, and the spread
parameter is intended to absorb that difference") in the methodology page.

---

### B4: Reference-rate choice materially changes the "receipts" if not disclosed per-run

**What goes wrong:** Because Fed funds effective, 3M T-bill, and SOFR-plus-spread are not
numerically identical day-to-day (T-bill in particular can decouple from Fed funds during
liquidity events, e.g., March 2020's brief T-bill rate anomalies), a user re-deriving "the same"
scenario with a different implicit rate assumption than the one baked into a shared permalink
could get a different number and accuse the tool of being wrong or inconsistent.

**How to avoid:** The specific rate series used (and its value on each date, or at least
summary statistics) must be part of the exposed provenance for a run, and ideally exportable
via the CSV export requirement already in PROJECT.md.

**Phase:** Data bundling + sharing/export features.

---

## C. Historical Price Data Traps

### C1: Named free sources, verified coverage, and their real limitations

| Source | What it provides | Verified start / coverage | Known limitations |
|---|---|---|---|
| Yahoo Finance `^GSPC` | S&P 500 **price** index (no dividends) | Daily back to Jan 1928 (widely available via Yahoo's history endpoint) | Price-return only, not total-return; Yahoo's historical endpoints have had documented reliability regressions (site redesign in 2025 broke common scraping libraries; "missing dates, inconsistent adjusted prices, sudden access limits, datasets that quietly change without explanation" reported by multiple sources) — treat as a *bundle-time* ingestion source, never a runtime dependency (already the project's design) |
| Yahoo Finance `^SP500TR` | S&P 500 **total-return** index (dividends reinvested) | Consistent with PROJECT.md's own statement that daily total-return data "effectively begins in 1988" | Same Yahoo reliability caveats as above; verify actual first-available-row date at ingestion time rather than trusting any cited date, since Yahoo's own UI does not surface a documented inception date |
| Yahoo Finance ETF pages (SPY, QQQ, UPRO, TQQQ, SSO, QLD, etc.) | Adjusted close (dividend- and split-adjusted) | SPY inception **1993-01-22** (first US-listed ETF); other tickers per their own listing dates | Yahoo's adjustment methodology retroactively rescales historical prices when a new dividend/split occurs, meaning a bundle compiled today can differ from the same query run later even for "historical" dates already elapsed — a real threat to the "same permalink reproduces the same numbers forever" guarantee unless the compiler pins/hashes its input CSVs at compile time (see C5) |
| Robert Shiller's dataset (Yale, `ie_data.xls`) | Monthly S&P price, dividends, earnings, CPI, and an interest-rate column | Monthly data from **January 1871**; CAPE itself only computable from **January 1881** onward (needs a trailing 10-year real-earnings average) | **Monthly only** — no daily granularity, ever; using it for anything but the extended/interpolated tier misrepresents its resolution. It is explicitly a *total-return-oriented, dividend-inclusive* dataset (has its own `_TR` columns), so mixing it naively with a price-only series without accounting for that distinction will misstate whether dividends are included |
| FRED (rate series) | Short-term rate series, see Section B | See Section B table | Not a price/equity source; relevant here only for financing-cost inputs |
| Stooq | Free historical OHLCV for indices/ETFs, decades of daily history, downloadable CSV | No official inception-date guarantee published; commonly used as a Yahoo alternative/backup | No API, scraped/mirrored data with no vendor accountability for corporate-action correctness; "no official corporate actions" handling comparable to a licensed vendor — treat any Stooq-sourced series as needing independent spot-checking against a second source before bundling, especially around known split/special-dividend dates |

Confidence: MEDIUM — inception/start dates for SPY and Shiller are well-corroborated; exact
first-row dates for `^GSPC`/`^SP500TR` on Yahoo specifically should be verified directly against
the actual downloaded CSV at bundle-compile time rather than trusted from secondary
commentary, since Yahoo does not publish an authoritative "data starts on X" statement.

---

### C2: Index-vs-tradeable-fund divergence

**What goes wrong:** Treating the S&P 500 *index* (`^GSPC`/`^SP500TR`) as directly investable,
or worse, using index-level returns as a stand-in for SPY-level returns without accounting for
SPY's own expense ratio (~0.0945%) and tiny structural tracking difference. The index is a
mathematical construct with zero cost; the fund is real and has cost. For this project's
purposes the index *should* be the "before fees" reference and SPY/QQQ the "after fees"
comparison, but only if the two are clearly labeled as such rather than used interchangeably.

**How to avoid:** Bundle and label both; use the index series as the underlying return input to
the leverage cost model (since the model applies its *own* expense ratio parameter), and use
the real fund (SPY/QQQ) series only for showing "what an actual unleveraged investor
experienced" for comparison, not as the leverage-model input (double-counting expense ratio
otherwise).

**Warning signs:** A "1x" comparison line that doesn't match either the raw index or SPY
exactly, because it's silently a blend.

**Phase:** Data bundling + simulation engine input wiring.

---

### C3: Total-return vs. price-return confusion

**What goes wrong:** Using a price-only series (`^GSPC`, or Shiller's raw price column without
its dividend column) as the input for a "dividend-reinvest ON" scenario, or vice versa —
silently understating long-run compounded returns by the historical ~2-4%/year dividend yield,
compounded over decades this is enormous (a difference of "did leverage work" vs. "did leverage
fail" over a 30+ year window can hinge entirely on this).

**How to avoid:** PROJECT.md already specifies bundling *both* series per symbol precisely to
make this a data-selection switch rather than an approximation — the pitfall is purely an
implementation-discipline one: never derive a synthetic total-return series by adding back an
assumed flat dividend yield; only use the toggle to select between two independently sourced,
independently validated series.

**Warning signs:** A "no dividends" run outperforming a "with dividends" run over the same
window and leverage — a definitional impossibility (dividends can only help un-leveraged
value, though leveraged financing-cost interaction with a higher/lower base value could in
principle create small higher-order effects; a *large* inversion is a bug, not an effect).

**Phase:** Data bundling + simulation engine.

---

### C4: Shiller dataset granularity mismatch when used for the extended tier

**What goes wrong:** Using Shiller's monthly closing values as if they were daily observations
(e.g., holding the monthly close flat for the whole month and computing "daily" volatility drag
from a series that has zero actual daily variance within each month) will *understate*
volatility drag for that period, since volatility drag is driven by daily variance and a
flat-within-month series has none.

**How to avoid:** If interpolating Shiller's monthly series to a daily granularity, this must be
disclosed as fundamentally lacking real daily volatility information — the extended tier is
necessarily *less accurate specifically about volatility drag*, which is one of the two costs
this tool exists to quantify, for the pre-daily-data era. This is an important, specific
limitation to state prominently for any 1929-1932 extended-tier scenario, since volatility drag
was severe in that period and a monthly-interpolated series will underrepresent it.

**Warning signs:** An extended-tier run over 1929-1932 showing implausibly *low* volatility drag
relative to what's visible in genuinely daily eras with comparable index-level volatility.

**Phase:** Data bundling documentation + validation phase (state the known bias direction, don't
just disclose that interpolation happened).

---

### C5: Splits, dividend-adjustment errors, and bundle-compiler pinning

**What goes wrong:** (a) A raw split or special dividend mis-applied at ingestion creates a
step discontinuity in the price series that will masquerade as a real market move in any
downstream chart or drawdown calculation. (b) Because adjusted-close data is retroactively
rescaled by vendors when new corporate actions occur, re-running the bundle compiler against a
freshly re-downloaded source CSV weeks or years later can silently produce a *different* bundle
for dates that already happened — breaking the "same permalink, same numbers forever" guarantee
central to this tool's credibility.

**How to avoid:** (a) Sanity-check every bundled series for anomalous single-day jumps
inconsistent with known market history and cross-check against a second source at known
split dates. (b) The bundle compiler must version and hash its input CSVs and its output
bundle; a permalink should encode (or the app should otherwise pin) the bundle version it was
generated against, so historical links remain reproducible even after the data bundle is
later regenerated with corrected or extended data.

**Warning signs:** A previously-shared permalink producing different numbers on a later visit
with no visible version/changelog explanation.

**Phase:** Data bundling (compiler tooling) — this is infrastructure, build it into the
compiler from the first version, not retrofitted later.

---

### C6: Trading-calendar misalignment when splicing series from different sources

**What goes wrong:** NYSE equity holidays and bond-market (SIFMA) holidays are not identical
(e.g., some days the bond market closes early or is fully closed while equities trade a normal
session, and vice versa for a few observances). Joining a price series (NYSE calendar) to a
rate series (published on the Fed's own calendar, which is closer to but not identical to
either) by naive date-matching can silently drop or duplicate rows at calendar edges,
especially at year boundaries and around Good Friday, Columbus Day, and Veterans Day where the
two calendars most often disagree.

**How to avoid:** Build the daily timeline from the *price* series' actual trading days (since
that's what determines when compounding events happen) and forward-fill/carry the most recent
available rate observation into any day the rate series itself is missing, explicitly — don't
inner-join and silently drop trading days that lack a same-day rate observation.

**Warning signs:** Off-by-one-day discrepancies in reported total number of trading days for a
given date range vs. an independently known trading-day count (e.g., NYSE publishes ~252
trading days/year; a bundled series reporting materially fewer for a "normal" year indicates
dropped rows).

**Phase:** Data bundling.

---

## D. Backtesting Methodology Errors

### D1: Look-ahead bias via non-causal rate interpolation

Already covered in B2 — restated here because it's a backtesting-methodology error as much as
a data-sourcing one. **Phase:** Data bundling.

---

### D2: Cherry-picked windows (both by the tool's defaults and by its users)

**What goes wrong:** PROJECT.md names this directly — most existing arguments implicitly
cherry-pick the 2010-2021 bull run. A tool meant to end that argument must not itself ship with
defaults, presets, or a UI that nudges toward any particular window without equally surfacing
the alternative, harder windows (1929-1932, 2000-2002, 2007-2009, 2022).

**How to avoid:** PROJECT.md's named preset scenarios ("3x S&P from 1929, TQQQ from 2000, the
2010s in isolation") should ship together as a set, not as a single default that happens to be
the flattering one. The full entry-date sweep (Feature: fixed leverage, sweep entry date) is
itself the direct antidote to cherry-picking — its existence as a first-class feature, not an
afterthought, is the actual prevention mechanism here.

**Warning signs:** A default landing view of the app that happens to start in a bull period.

**Phase:** Product/visualization defaults — decide this explicitly at UI-spec time.

---

### D3: Lump-sum vs. contribution-schedule conflation

**What goes wrong:** Comparing a lump-sum backtest's outcome directly against a
recurring-contribution backtest's outcome (or against each other across different leverage
levels) without accounting for the fact that they have fundamentally different money-weighted
exposure profiles — a DCA investor's later contributions have much shorter effective holding
periods than the initial lump sum, so a metric like "final value" alone conflates "leverage
worked" with "you happened to keep adding money through a recovery."

**How to avoid:** This is exactly why PROJECT.md specifies IRR (money-weighted) instead of CAGR
for any run with nonzero contributions — keep that discipline strict: never display a CAGR-like
annualized figure for a contribution-schedule run, and label IRR outputs clearly as
money-weighted so they're not read as directly comparable to a plain total-return percentage
from a lump-sum run without qualification.

**Phase:** Outcome metrics.

---

### D4: IRR vs. CAGR — and IRR's own failure modes

**What goes wrong:** Beyond the D3 conflation, IRR computation itself has edge cases: cash-flow
sign patterns with multiple sign changes (e.g., contributions continuing after a position hits
ruin and is reset, if that's ever allowed) can produce multiple mathematically valid IRR roots
or no real solution at all; a naive root-finder (e.g., unconstrained Newton's method) can
silently converge to a nonsensical or wrong root, or fail to converge and throw/produce `NaN`
without a clear user-facing explanation.

**How to avoid:** Use a bounded, robust root-finding method (e.g., bisection over a
economically sane rate range, falling back to reporting "IRR undefined for this cash-flow
pattern" rather than silently emitting a `NaN` or a wildly implausible number) and explicitly
define what happens to the contribution schedule after a ruin event (does the position stop
accepting contributions, or restart at zero as an effectively new position with its own IRR
segment?) before this is implemented — it changes what the sign pattern looks like.

**Warning signs:** IRR outputs that are extreme (e.g., >1000% or deeply negative in ways that
don't match the visible equity curve), or `NaN`/`Infinity` surfacing in the UI.

**Phase:** Outcome metrics — needs an explicit product decision on post-ruin contribution
behavior before implementation, not just a math library choice.

---

### D5: Overlapping rolling windows presented as independent evidence

**What goes wrong:** This directly matters for the entry-date sweep. Adjacent entry dates one
trading day apart share nearly all of their underlying daily-return data (e.g., a 20-year fixed
holding period starting Monday and a 20-year window starting Tuesday overlap in ~99.98% of
their days). Presented as 10,000 independent backtests in a heatmap, this creates a strong
visual impression of a large, robust sample of "evidence," when the effective number of
*independent* observations is far smaller — a well-documented statistical pitfall in
quantitative finance research generally (overlapping-window autocorrelation mechanically
inflates apparent signal strength/robustness and distorts standard significance-style
reasoning, which assumes independence).

**Why it matters specifically here:** The 2D entry-date × leverage heatmap is described in
PROJECT.md as the "hard visualization" and the crux of the whole tool. If it visually implies
10,000 independent trials of "does leverage work," a technically sophisticated hostile reader
can dismiss the entire tool on this single, valid statistical objection — which would be
disastrous given the project's own stated purpose.

**How to avoid, concretely, for the visualization (not just methodology text):**
- Do **not** describe or imply "10,000 independent backtests" anywhere in copy; describe it
  accurately as "the same market history viewed from every possible starting point."
  This framing is honest and actually reframes the exercise correctly: the sweep answers "how
  much did the outcome depend on when you started," which does *not* require independence to be
  meaningful — it's a sensitivity analysis, not a statistical sample. Say that explicitly.
- Where any *aggregate* statistic across the sweep is shown (e.g., "% of entry dates that were
  profitable," a mean/median across the heatmap), caveat it directly adjacent to the number as
  describing overlapping, highly autocorrelated windows, not an independent sample — do not let
  an aggregate percentage stand alone without that caveat, since a bare percentage is exactly
  the kind of "receipts" number a user will screenshot and repost without context.
  Consider also surfacing a secondary view using non-overlapping entry dates only (e.g., one
  entry per year rather than one per trading day) specifically for any aggregate/summary
  statistic, reserving the full dense overlapping sweep for the visual heatmap itself where the
  density is doing legitimate visualization work (showing the full shape of sensitivity) rather
  than being used as an implied sample size.

**Warning signs:** Any UI copy or default aggregate stat phrased like "N out of 10,000 starting
points were profitable" without a caveat about overlap.

**Phase:** Visualization (heatmap/sweep) — this needs to be in the UI-spec, not left to be
noticed during a later credibility review.

---

## E. Visualization Pitfalls

### E1: Heatmap color scale mismatched to data semantics (sequential vs. diverging)

**What goes wrong:** Using a sequential color scale (single hue, light-to-dark) for a metric
that has a meaningful zero/breakeven point (e.g., IRR, or "multiple of contributed" where 1.0
= breakeven) hides where the breakeven boundary actually is; conversely using a diverging scale
for a metric with no natural midpoint (e.g., raw final dollar value) invents a false "neutral"
point that doesn't correspond to anything meaningful.

**How to avoid:** Match scale type to metric: diverging (e.g., RdBu- or PRGn-family, centered
exactly at the metric's real breakeven value — 0% for IRR, 1.0x for "multiple of contributed")
for signed/threshold metrics; sequential (viridis/cividis-family) for pure-magnitude metrics
like raw final value or max drawdown where there's no meaningful zero-crossing within the
displayed range.

**Warning signs:** A diverging red-to-blue scale where the visual midpoint (white/neutral) does
not align with the number the tool itself defines as "breakeven."

**Phase:** Visualization.

---

### E2: Linear color mapping on an exponentially-distributed outcome metric

**What goes wrong:** Final portfolio values across a 20x leverage × century-long entry-date
sweep can span multiple orders of magnitude (from near-zero/ruin to enormous multiples). A
linear color scale applied directly to raw dollar values will make almost the entire heatmap
look like a single color, with only the most extreme cells visibly different — destroying the
tool's ability to show the graded sensitivity that is its entire point.

**How to avoid:** Color-map a log-transformed version of magnitude-type metrics (e.g., color by
`log10(final_value / contributed)` rather than raw `final_value`), or use a scale type
explicitly designed for this (e.g., a symlog-style transform if values can be zero/near-zero at
the ruin boundary — see E4 for why ruin itself should be handled categorically rather than
purely as "the bottom of the log scale").

**Warning signs:** A heatmap where the vast majority of cells look nearly identical and only a
small number of high-leverage/bad-entry-date cells are visually distinct.

**Phase:** Visualization.

---

### E3: Non-perceptually-uniform or non-colorblind-safe colormaps

**What goes wrong:** Classic scales like jet/rainbow introduce false perceptual banding (equal
data steps do not look like equal color steps, creating visual artifacts that look like data
features but aren't) and red-green-based diverging scales are unreadable to the ~1-in-12 men
with red-green color vision deficiency — a nontrivial share of any general audience this tool
is meant to convince.

**How to avoid:** Default to perceptually uniform, colorblind-safe families: viridis or cividis
for sequential metrics, RdBu or PRGn (blue/purple-green family diverging scales, not
red-green) for diverging metrics, consistent with current data-visualization best practice.

**Phase:** Visualization.

---

### E4: Hiding the ruin case inside a continuous color scale

**What goes wrong:** Ruin (position value at or crossed through zero, per A7) is a categorical,
absorbing-state event — qualitatively different from "a bad but nonzero outcome." Coloring it
as simply the darkest/most-extreme point on a continuous scale (e.g., "the worst blue" or "the
bottom of the log scale") visually implies it's just a more-extreme version of a bad-but-alive
outcome, understating what actually happened (total, irreversible loss) and — worse — a
log-scale color mapping literally cannot represent zero at all (`log(0)` is undefined), which
means a naive log-color implementation will either error or silently clip ruin cells to some
arbitrary small nonzero color, which is actively misleading.

**How to avoid:** Give ruin its own distinct, non-scale-derived visual treatment (e.g., a
fixed color — commonly black or a hatched/textured fill — with its own legend entry reading
something like "RUINED (position went to zero)"), entirely separate from and excluded from the
continuous color scale's domain. Ruin cells should not be interpolated into the gradient at
all.

**Warning signs:** Any code path that maps a ruin-flagged cell's color via the same
continuous function used for non-ruined cells.

**Phase:** Visualization — directly follows from A7's kernel-level ruin flag; the two must be
designed together.

---

### E5: Right-edge artifact in hold-to-today mode

**What goes wrong:** In "hold-to-today" sweep mode (every entry date runs to the present),
entry dates near the right edge of the sweep (i.e., recent dates) necessarily have very short
realized holding periods — a few weeks or months — so their outcome metric is dominated by
short-term noise rather than by the leverage/cost dynamics the tool exists to illustrate. In a
heatmap, this produces a visually noisy, high-variance strip along the recent-date edge that a
casual viewer may misread as "leverage outcomes are unpredictable" generally, rather than "this
narrow strip has too short a horizon to mean anything."

**How to avoid:** Either (a) visually de-emphasize (gray out, fade, or hatch) any cell whose
realized holding period falls below a stated minimum threshold, with the threshold itself
disclosed, or (b) provide a minimum-holding-period filter so the noisy strip can be excluded
from view entirely, or (c) at minimum, add an explicit annotation/boundary line marking where
"insufficient holding period" begins. Do not let the raw color scale alone represent this
region without qualification.

**Warning signs:** A visibly chaotic strip along one edge of the heatmap with no explanatory
annotation.

**Phase:** Visualization (hold-to-today mode specifically).

---

### E6: Linear-scale equity curves systematically mislead for leveraged/compounding series

**What goes wrong:** A linear dollar-value y-axis compresses early, small-dollar percentage
moves and visually exaggerates later, large-dollar moves that may represent a *smaller*
percentage change — for a strategy whose entire subject matter is percentage-based compounding
and drawdown, this actively misleads: on a linear axis, a -90% crash early in a series (when
the portfolio is small) looks visually tiny compared to a -20% dip later (when the portfolio is
large in dollar terms), even though the early crash was far more catastrophic in the terms that
actually matter (percentage of capital, and specifically proximity to the ruin boundary at high
leverage).

**How to avoid:** Default equity-curve charts to a log y-axis, where equal vertical distances
represent equal percentage changes regardless of portfolio size — this is standard practice for
any long-horizon compounding/growth chart and is particularly non-optional here given the
project's explicit focus on volatility drag and ruin. Provide a linear-axis toggle for users who
want it, but log should be the default given the stakes of the default view being the one most
often screenshotted.

**Caveat carried over from A7/E4:** log scale cannot represent an exact zero (ruin); the chart
must special-case the ruin point (e.g., a marker/annotation at the ruin date rather than trying
to plot a continuation of the line into `-Infinity`).

**Phase:** Visualization.

---

## F. Browser Compute Performance Traps

Scale context from PROJECT.md: a full heatmap sweep is on the order of 10,000 backtests over
~25,000 daily bars each (~250M elementary operations), and must not block the UI.

### F1: Allocation inside the per-day hot loop

**What goes wrong:** Creating new objects, arrays, or boxed values (e.g., a `{value, ruin,
attribution}` object per day per backtest) inside the innermost loop generates massive garbage
collection pressure at this scale, causing GC pauses that read as UI jank even when the actual
computation is off the main thread (a worker GC pause still delays the result and can still
cause dropped frames if the worker and main thread share resources).

**How to avoid:** Preallocate flat typed arrays (`Float64Array`) for all per-day accumulators
before the loop starts; write into fixed indices; avoid intermediate object/array creation
entirely inside the per-day, per-backtest inner loop.

**Warning signs:** Profiler flame graphs dominated by GC time rather than actual arithmetic;
memory usage sawtoothing during a sweep.

**Phase:** Simulation engine performance pass (after correctness is established — don't
optimize before A1-A12 are verified correct).

---

### F2: Deoptimization from polymorphic/mixed-shape data

**What goes wrong:** Mixing numeric types (e.g., sometimes `NaN`, sometimes `null`, sometimes a
real number in the same logical field across iterations) or using arrays of objects with
optional/varying properties in the hot path causes the JS engine to fall back from optimized
packed/typed internal representations to slower dictionary-mode representations, silently
degrading throughput by a large factor with no visible code-level change.

**How to avoid:** Keep all hot-path data in `Float64Array`/`Int32Array` typed arrays with a
single consistent numeric representation throughout (e.g., use a dedicated sentinel float value
or a separate boolean/bitfield typed array for the ruin flag, rather than `null`/`NaN` mixed
into the value array); avoid classes with optional fields inside the innermost loop.

**Warning signs:** Throughput regressing after a seemingly unrelated change (e.g., adding an
optional field to a per-day record type); large discrepancy between expected and measured
iterations/sec.

**Phase:** Simulation engine performance pass.

---

### F3: Structured-clone cost when passing buffers to/from Web Workers

**What goes wrong:** `postMessage` performs a structured clone (full copy) of any data passed by
default. Passing a large result buffer (10,000 backtests × up-to-25,000 daily values, or even
just the final summary grid) from a worker back to the main thread this way copies potentially
tens of millions of numbers synchronously, which can itself cause a visible stall exactly at the
moment the result is ready — the opposite of the intended "stay responsive" behavior.

**How to avoid:** Use Transferable Objects — pass the underlying `ArrayBuffer` with the
`transfer` list in `postMessage`, which moves ownership instead of copying — or use
`SharedArrayBuffer` if concurrent read/write access across worker and main thread is needed
(note COOP/COEP header requirements for `SharedArrayBuffer` in modern browsers, which needs to
be checked against Cloudflare Pages' static-hosting header configuration).

**Warning signs:** A visible stall specifically at sweep-completion time, distinct from steady
compute-time jank.

**Phase:** Simulation engine performance pass / worker architecture design (should be decided
at architecture time, not retrofitted).

---

### F4: Blocking the main thread despite having workers

**What goes wrong:** (a) Dispatching all 10,000 backtests as a single monolithic unit of work
to one worker gives no opportunity for progress reporting and can still feel frozen even though
technically off-main-thread, since there's no incremental feedback. (b) Any post-processing
(color-mapping 10,000 cells, building a heatmap data structure) done synchronously on the main
thread after results return can itself cause jank if not chunked.

**How to avoid:** Use a worker pool sized to `navigator.hardwareConcurrency`, chunk the sweep
into batches, and have workers post incremental progress messages so the UI can render a
progress indicator and stay interactive throughout, not just at the start and end.

**Warning signs:** UI appears frozen (no progress indicator, no ability to cancel) during a
multi-second sweep even though the compute is nominally off-main-thread.

**Phase:** Simulation engine performance pass.

---

### F5: Rendering 10,000 SVG nodes for the heatmap

**What goes wrong:** SVG has significant per-node overhead in the DOM (layout, paint, and
especially any attached event listeners for tooltips/hover) — rendering one `<rect>` (or path)
per heatmap cell at the stated sweep scale (up to ~10,000 cells) can cause severe interaction
jank, particularly on hover-driven tooltip interactions that are likely to be a core part of
this tool's UX (inspecting a specific entry-date/leverage combination).

**How to avoid:** Render the heatmap as a single `<canvas>` bitmap (or a single `<img>`/`<image>`
built from an `ImageData`/`OffscreenCanvas` bitmap) rather than one DOM node per cell, with a
thin, separate interaction layer (e.g., a single mousemove handler that computes which logical
cell the cursor is over from coordinates, rather than per-cell listeners) for tooltips/hover.
If crisp vector export (PNG export is already a requirement) is needed, render to canvas for
interaction and generate the export image from the same underlying data rather than from live
DOM nodes.

**Warning signs:** Noticeable input lag on hover over the heatmap; profiler time dominated by
style/layout recalculation rather than script.

**Phase:** Visualization implementation.

---

## G. Credibility and Presentation Pitfalls

### G1: Undisclosed methodology

**What goes wrong:** Any user-invisible choice covered in Sections A-D (day-count convention,
which rate series, interpolation method, ruin handling, IRR post-ruin behavior, overlapping-
window framing) that isn't surfaced anywhere lets a sufficiently motivated skeptic dismiss a
result as "who knows what it's actually doing," which defeats the tool's purpose regardless of
whether the underlying math is actually correct.

**Prevention:** A single, always-reachable methodology page/panel documenting every modelling
choice in this file's Section A-D at a level a technically literate skeptic could audit,
written before launch, not added reactively after a specific challenge.

**Phase:** Cuts across all phases; should be maintained incrementally, with a dedicated pass
before any public sharing.

---

### G2: Unlabeled data provenance

**What goes wrong:** PROJECT.md already commits to this ("Provenance is visible, never a
footnote") — the risk is a partial implementation where provenance is shown for the price data
but not for the rate series, or shown at a summary level but not exportable, leaving exactly the
gap a skeptic will probe.

**Prevention:** Every bundled series (price, total-return, rate) needs source, coverage dates,
and tier (strict/extended) surfaced identically and consistently, and included in the CSV
export (already required) so it travels with any exported/re-derived data.

**Phase:** Data bundling UI + export features.

---

### G3: Defaults that look chosen to favor a conclusion

**What goes wrong:** Even honestly-derived defaults (e.g., expense ratio, spread, default entry
date, default leverage) can *look* cherry-picked if their sourcing isn't visible next to the
control itself, inviting exactly the bad-faith dismissal ("of course they picked numbers that
make leverage look bad/good").

**Prevention:** Every editable default parameter should show its source inline (e.g., "0.91% —
ProShares UPRO prospectus ER" as a tooltip/label next to the field), not just in a separate
methodology page a skeptical reader may not find. This follows directly from PROJECT.md's own
requirement that ER/spread default "from real products."

**Phase:** UI implementation of parameter controls.

---

### G4: Inability to reproduce someone else's claimed result

**What goes wrong:** If a user cannot paste a permalink and get bit-identical (or documented-
tolerance-identical) results to what the link's creator saw — because of nondeterministic
summation order across worker chunks, an undisclosed bundle-version mismatch (see C5), or
floating-point precision differences across browsers/hardware — the tool's core "receipts"
function fails at the exact moment it's tested.

**Prevention:** (a) Ensure deterministic result computation regardless of chunking/worker
scheduling (fixed summation order, or explicitly document acceptable floating-point-scale
tolerance if perfect bit-identity isn't practical across all JS engines). (b) Encode the
data-bundle version in the permalink state, and either keep old bundle versions addressable or
surface a clear "data has been updated since this link was created" notice rather than silently
serving different numbers.

**Phase:** Sharing/permalink feature — this needs a determinism/versioning test written before
the feature ships, not discovered when the first two people compare links and get different
numbers.

---

## H. Scope Traps

| Trap | Why it's tempting | Why it's dangerous here | Recommended stance |
|---|---|---|---|
| Adding symbols endlessly | The bundle compiler makes it mechanically easy ("drop in a CSV, recompile") | Every new base symbol without a corresponding real leveraged product to validate against produces an unfalsifiable synthetic claim — directly undermining the project's own "credibility anchor" principle | Require a real validation target (an actual leveraged ETF) before adding any new base symbol; label any symbol lacking one as explicitly unvalidated in the UI |
| Monte Carlo / probabilistic projection | Natural-feeling extension once a backtest engine exists ("what about the future?") | Fundamentally changes the tool's rhetorical position from "here is what actually happened" (fact-check) to "here is a model of what could happen" (assumption-dependent projection) — reopens exactly the kind of unfalsifiable-assumption argument this tool exists to end | Out of scope; if ever added, must be a clearly separate mode with different, more prominent caveats — not a checkbox next to the historical backtest |
| Optimizers ("find the best leverage/entry") | Sweep infrastructure already computes the whole grid; "just highlight the max" looks trivial | Turns a descriptive/dispute-settling tool into a prescriptive one, invites "of course that was optimal in hindsight" critique, and edges directly into the already-out-of-scope "portfolio construction" | Out of scope; the sweep visualization itself, not a recommended-answer engine, is the deliverable |
| Portfolio construction / multi-asset rebalancing | The N-asset generalization of the existing single-symbol sweep architecture is a natural-feeling next axis to sweep | Already explicitly out of scope in PROJECT.md; combinatorially explodes the state space well beyond the 2D entry-date × leverage case the whole visualization design is built around | Explicitly reject; if requested, point back to the existing out-of-scope rationale rather than re-litigating it |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---|---|---|
| A1 Cumulative-vs-daily leverage | Simulation engine (kernel) | Unit test: leveraged output must differ from `L*total_return` on any volatile window |
| A2 Financing cost omitted | Simulation engine | Unit test: cost attribution nonzero and rate-sensitive |
| A3 Wrong financing rate class (margin vs. institutional) | Simulation engine | Validation-phase tracking error vs. real fund, checked for systematic bias direction |
| A4 Expense ratio day-count | Simulation engine | Unit test with known ER over a fixed period |
| A5 Wrong rate for era | Data bundling + kernel | Provenance display shows correct series per date range |
| A6 Spread omitted | Simulation engine | Validation-phase tracking error, especially in high-rate periods |
| A7 Ruin boundary | Simulation engine | Unit test: forced -40% day at L=3 clamps to 0, flags ruin, stays at 0 |
| A8 Weekend/holiday accrual | Simulation engine | Unit test comparing financing cost across a normal week vs. a 3-day-weekend week |
| A9 Overfit cost params | Validation phase | Parameters sourced and documented before validation run, residual reported not eliminated |
| A10 1x invariant | Simulation engine | Unit test: L=1 output equals raw input series exactly |
| A11 Float precision drift | Simulation engine | Cross-check iterative vs. closed-form on a cost-free stretch |
| A12 Swap/futures mechanism simplification | Documentation | Methodology page states the approximation explicitly |
| B1-B4 Rate series seams | Data bundling | UI/provenance shows series + seam dates per run |
| C1-C6 Price data traps | Data bundling (compiler) | Bundle compiler pins/hashes sources; anomaly checks at ingestion |
| D1 Look-ahead interpolation | Data bundling | Step interpolation used, or non-causal choice disclosed |
| D2 Cherry-picked windows | Visualization defaults / product spec | Preset set ships with hard windows included by default |
| D3 Lump-sum vs. contribution conflation | Outcome metrics | IRR always used when contributions nonzero, never CAGR |
| D4 IRR failure modes | Outcome metrics | Bounded root-finder; post-ruin contribution behavior defined before implementation |
| D5 Overlapping windows framing | Visualization (sweep) | Copy review: no "N independent backtests" language; aggregate stats caveated |
| E1-E6 Visualization pitfalls | Visualization | Design review against this checklist before first heatmap ships |
| F1-F5 Browser compute traps | Simulation engine perf pass | Profiling pass after correctness is locked, before ship |
| G1-G4 Credibility/presentation | Cuts across phases; dedicated pass before sharing features ship | Methodology page + provenance + determinism test |
| H (scope traps) | Roadmap/backlog triage | Explicit "out of scope" entries maintained, revisited only via deliberate scope-change decision |

---

## Sources

- FRED series pages: DFF (Federal Funds Effective Rate), DTB3 (3-Month Treasury Bill, discount
  basis, daily), TB3MS (3-Month Treasury Bill, discount basis, monthly) — start dates verified
  via web search against fred.stlouisfed.org series pages (2026-08-16). Confidence: MEDIUM-HIGH;
  recommend confirming `observation_start` directly against the FRED API at implementation time.
- LIBOR cessation timeline: FCA/ARRC/Federal Register coverage of the June 30, 2023 USD LIBOR
  panel cessation and September 30, 2024 synthetic-LIBOR wind-down for legacy contracts.
- Robert Shiller online dataset (`ie_data.xls`, econ.yale.edu/~shiller/data.htm): monthly
  coverage from January 1871; CAPE computable from January 1881.
- SPY inception date (1993-01-22) — State Street/SSGA and general market-history sources.
- General leveraged-ETF mechanism sourcing (total-return swaps, futures, embedded financing
  cost tied to short-term reference rates) — cross-checked across multiple independent
  secondary sources; no single authoritative itemized public breakdown of swap financing
  spreads exists, which is itself documented in this file as pitfall A9's confidence caveat.
- Overlapping-window autocorrelation in backtesting/momentum research — cross-checked across
  multiple independent academic/practitioner sources describing the general statistical
  mechanism (mechanically inflated apparent robustness from overlapping return windows).
- Colormap guidance (viridis/cividis perceptual uniformity and colorblind-safety; diverging
  scale centering) — cross-checked across standard data-visualization references (matplotlib,
  viridis package documentation, PLOS ONE colormap research).
- Yahoo Finance / Stooq reliability characteristics — cross-checked across independent
  practitioner sources describing 2025 Yahoo Finance access/reliability regressions and
  general Stooq usage caveats.
- PROJECT.md (this repository) — authoritative source for the specific cost model, validation
  targets, and scope boundaries this file's pitfalls are checked against.

---
*Pitfalls research for: Leveraged-ETF simulation / financial backtesting*
*Researched: 2026-08-16*
