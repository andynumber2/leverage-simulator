# Feature Research

**Domain:** Leveraged-ETF / daily-rebalanced backtesting and simulation tools
**Researched:** 2026-08-16
**Confidence:** MEDIUM-HIGH (vendor pages mostly blocked live fetches; findings cross-verified across multiple independent secondary sources, forum threads, and academic papers instead of single-source vendor docs)

## Landscape Survey

Three products define this space:

- **testfol.io** — the nearest direct competitor. Backtests arbitrary portfolios including
  *synthetic* leveraged tickers (`QQQSIM?L=3&E=0.82` syntax: base symbol, leverage multiplier,
  expense ratio override), reports cumulative return, CAGR, **money-weighted return (IRR)**,
  max drawdown, volatility, Sharpe, Sortino, beta. Supports contribution/withdrawal cashflow
  schedules, CSV export of chart data, cloud-saved portfolios behind a free account.
  Its synthetic-leverage engine formula, per a third-party reverse-engineering writeup
  (Testfol-MarginStresser docs), is:
  `Levered Return_t = L × R_t − (L−1) × (FedFunds_t + Spread) − ExpenseRatio/252`
  funded from FRED FEDFUNDS forward-filled daily plus a default 0.50% spread, with a flat 4%
  fallback if FRED data is unavailable. **This is functionally identical to the cost model this
  project has already specified** (`L*r - (L-1)*(short_rate+spread) - expense_ratio/252`). That
  is strong external validation that the model is the industry-standard approach, not
  strong differentiation — the differentiation has to be in *decomposing* that formula's
  output, not in the formula itself. Confidence: MEDIUM (secondary source, not testfol.io's
  own published methodology page, which returned 403 on direct fetch).
- **Portfolio Visualizer (PV)** — the incumbent, broadest tool. Backtests portfolios of real
  tickers (including real leveraged ETFs like UPRO/TQQQ — it uses their *actual* historical
  NAV series, not a synthetic model), reports end balance, CAGR, and IRR side by side, supports
  contribution/withdrawal cashflows and multiple rebalancing frequencies, compares up to three
  portfolios against a benchmark, and has a separate Monte Carlo tool using historical
  block-bootstrap resampling (single-month or single-year blocks) rather than a parametric
  distribution. PV does **not** have a synthetic/simulated leveraged-ETF engine — it can only
  show you leverage for tickers that actually existed (UPRO since 2009, TQQQ since 2010), so it
  cannot show 3x S&P 500 in 1929, 2000, or the 1970s. This is the single biggest gap this project
  fills relative to PV. Confidence: MEDIUM (vendor FAQ page 403'd on direct fetch; corroborated
  across three independent secondary descriptions).
- **PortfolioCharts** — not a leveraged-ETF tool at all, but the most relevant *visualization*
  prior art. Its Heat Map chart is the direct ancestor of the entry-date × leverage heatmap this
  project needs to design (full treatment in Section 3 below). Its Retirement Spending chart is
  the ancestor of "show every possible starting cohort's path on one chart" rather than a
  single line.
- **Curvo / ETFreplay** — general-purpose ETF backtesters (Curvo: Euro-denominated, European
  fund universe; ETFreplay: momentum/rotation strategy backtesting). Neither has meaningful
  leveraged-ETF-specific tooling. Low relevance beyond "table stakes backtester UX" baseline.
- **Academic anchor** — Avellaneda & Zhang (2009/2010), "Path-Dependence of Leveraged ETF
  Returns" (SIAM J. Financial Math), is the seminal formal treatment: LETF returns are an exact
  function of the underlying's multiple return *and* its realized variance, and the paper
  states plainly that LETFs "as currently designed may be unsuitable for buy-and-hold
  investors" without qualification — i.e., the academic literature does not side with either
  internet camp uncritically. Confidence: HIGH (published, peer-reviewed, widely cited).

---

## Answers to the Six Questions

### 1. Table stakes: what will users notice immediately if missing

See the Table Stakes table below for the full list with complexity. The short version: users
who have used PV or testfol.io will bounce off this tool in under 30 seconds if it lacks a
drawdown chart, a benchmark/1x comparison overlay, a log-scale toggle on the equity curve, and
visible date-range bounds on the chart. Log scale specifically matters more here than in a
normal backtester: a 3x-leveraged equity curve on a linear axis is visually dominated by its
last few years and makes early-history drawdowns (which are the whole point of this tool)
look like noise near the x-axis.

### 2. Metric conventions — IRR vs. CAGR

**The project's design position is confirmed correct by direct competitor precedent, not just
first-principles reasoning.** Both PV and testfol.io report IRR/money-weighted return *alongside*
CAGR specifically because CAGR is defined only for a single lump sum with no intervening cash
flows — the standard treatment (echoed across GIPS-style performance-measurement literature:
TWR vs. MWR) is that CAGR/TWR answers "how did the strategy perform independent of my cash flow
decisions" while IRR/MWR answers "how did *my money* perform given when I put it in." With a
recurring contribution schedule those are different questions with different correct answers,
and conflating them is a documented, named error pattern in performance-measurement literature,
not a novel insight.

Where the standard tools get it wrong, or at least get it incomplete:
- **Neither PV nor testfol.io defaults to IRR** — both show CAGR first/prominently and IRR as a
  secondary stat, which is exactly backwards for a DCA scenario and is precisely the kind of
  "cherry-picked/misleading annualized number" that fuels the Hedgefundie-thread-style arguments
  this project exists to settle. **Defaulting to IRR whenever contributions are non-zero, and
  visually de-emphasizing or hiding CAGR in that case, is a legitimate differentiator** — it's
  not that competitors lack the number, it's that they don't make it the number.
  Confidence: HIGH (corroborated across independent finance-education sources plus direct
  observation of both tools' output stat panels in secondary write-ups).
- Neither tool, as far as could be verified, computes IRR *per contribution cohort* or shows how
  sensitive IRR is to the exact assumption of end-of-period valuation vs. mid-period cash flows
  — a minor precision gap, not a differentiator worth chasing.
- Metric set convention across all three tools is stable: CAGR, max drawdown, volatility
  (annualized stdev), Sharpe, Sortino, beta vs. benchmark. This project's spec (final value as
  multiple of contributed, ruin flag) is *not* standard in PV/testfol.io — "multiple of
  contributed capital" is closer to VC/PE fund reporting (MOIC) than public-markets backtesting
  convention, and a "ruin flag" has no standard-tool precedent at all because ordinary backtests
  of diversified portfolios essentially never hit zero. Both are legitimate additions given this
  tool's leverage-specific purpose, and both are correctly scoped as small (a formula and a
  boolean), not as new subsystems.

### 3. Visualization prior art for entry-point sensitivity

This is genuinely underserved territory — there is no existing tool that plots entry date on
one axis and leverage multiple on the other for a leveraged product. What exists are three
partial ancestors, each worth understanding for what to borrow and what to avoid:

**PortfolioCharts Heat Map (closest visual ancestor).**
Layout: rows are start year (chronological, earliest at top), columns are holding period in
years (1 year at left, up to the full available history at right, so it's a lower-triangular
grid — a 1995 start row has no 30-year cell if data ends in 2020). Each cell's fill color is
the annualized real (inflation-adjusted) CAGR for *that specific* start-year/holding-period
combination, with a diverging color scale (red = poor/negative, green = strong, centered
somewhere near a "reasonable" real return like 0%). Reading pattern: pick a row (a start year
you're curious about, e.g. 1929 or 2000) and scan rightward — the color trajectory shows how
much pain a given cohort had to sit through before recovering to green. Alternatively scan a
column (a fixed holding period, e.g. "15 years") vertically to see which start years were
lucky vs. unlucky for that horizon. What makes it legible: triangular truncation instead of
padding with blanks/NaNs signals "this combination is impossible" without a distracting null
color; the diverging (not sequential) palette matches the natural pass/fail semantics of "did
this beat inflation"; and years-held as columns (not calendar end-year) means every column is
directly comparable — column 10 is always "any 10-year hold" regardless of when it happened.
What's illegible or fragile in that design if borrowed naively: a lower-triangular grid wastes
roughly half the plot area, and for this project specifically the natural second axis is
*leverage*, not *holding period* — so the borrowed axis has to be entry date × leverage, with
holding period as a *mode switch* (fixed-horizon vs. hold-to-today) rather than a third
dimension, exactly as PROJECT.md already specifies. That resolves the triangularity problem
differently: in fixed-horizon mode the grid is fully rectangular (every entry date has a valid
N-year forward window as long as N years of data exist past it, so only the right edge is
truncated, not a full triangle); in hold-to-today mode every column is fully populated by
construction (everyone's holding period differs, but every cell is computable), so the
"missing data" problem the PortfolioCharts triangle exists to signal doesn't arise here — plan
to use blank/hatched cells to represent >20% single-day ruin/wipeout events instead, which
is a different and more urgent kind of missing data than "haven't happened yet."

**Rolling-returns charts (a second, thinner, ancestor).** These are line charts, not heatmaps:
x-axis is time, y-axis is trailing N-year annualized return, one line per fixed N (e.g. rolling
10-year and rolling 20-year overlaid). Portfolio Toolbox and similar sites use this. They read
naturally as "here is the band of outcomes over time" but they compress the leverage dimension
away entirely (one line per portfolio, not per leverage level) and they don't show holding-period
sensitivity at a glance the way a heatmap does — you have to overlay several lines and infer.
Weak prior art for this project's actual hardest problem (leverage sensitivity) but reasonable
as a *secondary* chart: "rolling N-year IRR of the selected leverage vs. 1x, over time" is a
good companion chart to the heatmap, cheap to build since it's a byproduct of the same sweep
data, and it answers "has this leverage level been getting better or worse to hold, over
history" — a question the heatmap doesn't answer directly.

**Pork chop plot (the explicit design reference from PROJECT.md — worth describing precisely
since it's the owner's stated mental model and this is the hardest design problem).** In orbital
mechanics a pork chop plot has launch date on one axis and arrival date on the other, with
filled contour bands (not discrete cells) showing constant characteristic energy (C3, i.e. fuel
cost) as nested closed curves — the "porkchop" shape comes from a bullseye-like low-energy
region ringed by expanding contour bands, usually rendered as a smooth heatmap with contour
lines overlaid, plus extra overlay lines for constant transit time and constant departure
angle. The two structural features worth borrowing: (a) **overlaid iso-lines on top of the
color fill**, not color alone — a pork chop plot lets you trace "all combinations that cost
exactly this much" as a curve, which for this project would be "all entry-date/leverage
combinations that produced exactly 8% IRR" as a contour line over the heatmap, letting a viewer
answer "what leverage would I have needed at this start date to match what I got elsewhere"
without hunting cell by cell; and (b) **a found optimum rendered as a marked point**, which
maps to marking the leverage level that historically maximized the chosen metric for a given
entry date, IF an optimizer feature is included (see anti-features — this is presentation-only
if the underlying sweep already exists, not a reason to build a solver). What does *not* map
well: pork chop plots have two independent, unbounded, roughly-continuous axes (both are
calendar dates), whereas this project's leverage axis is bounded, low-cardinality by construction
(a handful of discrete leverage levels users actually compare: 1x, 1.5x, 2x, 3x, maybe up to
5x), and the interesting resolution is much coarser than the ~250-value grids typical of a real
pork chop plot. That means the "smooth contour field" aesthetic of a true pork chop plot is
probably wrong for this project — with only 5-8 discrete leverage rows, a **discrete cell-based
heatmap with an optional line-plot overlay of iso-metric contours interpolated between rows**
is more honest to the actual data resolution than a fully smoothed 2D contour render, which
would imply false precision between leverage levels nobody actually holds.

**Practical recommendation for the heatmap's legibility, synthesized from the above:** entry
date on the x-axis (matches how people already think about "when did you start" chronologically,
left to right), leverage on the y-axis (small number of discrete rows, so no axis compression
needed), diverging color scale centered on "matched 1x" or on 0% rather than on an arbitrary
zero-outcome point (so the story is "did leverage help or hurt relative to the unlevered
baseline at this entry point," which is the actual argument being settled, not "was the
absolute return positive"), hatching or a distinct color (not just "very red") for ruin cells so
wipeouts are categorically distinguishable from merely-bad outcomes, and a synchronized
hover/tooltip that shows the specific run's headline numbers (IRR, drawdown, attribution
breakdown) so the heatmap functions as a navigation surface into the single-run view rather than
a dead-end visualization. This is the single most novel piece of design work in the project;
nothing in the survey does exactly this, which is good (real differentiation) and risky
(no template to copy — budget real iteration time, likely a dedicated `gsd-sketch` pass before
committing to layout).

### 4. Differentiators — what's actually open, and what's already taken

| Proposed differentiator | Verdict |
|---|---|
| (a) Explicit cost attribution (naive Lx gap → vol drag / financing / expense ratio, in $ and %) | **Open.** No surveyed tool decomposes the gap this way and surfaces it as a headline number. PV shows realized "volatility decay" only implicitly, as the difference between actual leveraged-ETF NAV and a naive multiple, and only for real tickers where both series exist — it never separates financing cost from volatility drag from fees, because it never models synthetic leverage at all. testfol.io computes with a formula that *contains* all three terms internally but, per the third-party methodology writeup, does not appear to expose a decomposition of them back to the user — it shows you the resulting return series, not the attribution. This is the project's strongest, most defensible differentiator and matches the PROJECT.md framing ("naming which mechanism cost the money is what actually ends an argument") exactly. |
| (b) In-app validation of synthetic model against real UPRO/TQQQ history | **Open, and unusually strong as a credibility move.** No surveyed tool shows "here is our synthetic series overlaid on the real ETF, here is the tracking error" as a user-facing feature — PV avoids the problem by only ever using real series (so it has nothing to validate), and testfol.io's synthetic-leverage feature does not appear to publish a validation comparison anywhere user-facing. Doing this in-app, not just in a README, converts "trust us" into "check us," which is exactly the credibility posture a dispute-settling tool needs. |
| (c) Explicit data-provenance tiers (strict vs. extended, with visible seam dates) | **Open.** None of the surveyed tools disclose data lineage this explicitly in the UI — PV's FAQ documents methodology in prose on a separate page, not attached to the chart; testfol.io's provenance is reverse-engineered by third parties rather than stated in-product. Making provenance a first-class, always-visible UI element (not a footnote or a separate docs page) is differentiated and cheap relative to its credibility payoff. |
| (d) Shareable permalinks encoding full parameter state, plus named "canonical argument" presets | **Half-open.** Permalinks that reproduce a full run are close to standard for this class of tool (Portfolio Toolbox and similar sites do URL-state encoding), so permalinks alone are closer to table stakes than a differentiator — treat as table stakes, not as the headline. **Named presets tied to specific, real internet arguments** ("3x S&P from 1929," "TQQQ from March 2000," "the 2010s in isolation") do not appear to exist anywhere surveyed — competitors let you construct any scenario but don't pre-package the scenarios people actually fight about. That curation, not the permalink mechanism itself, is the differentiator; see Section 6 for the specific preset list this implies. |

### 5. Anti-features — deliberate exclusions and why

Evaluated against the domain landscape, not just against PROJECT.md's existing Out of Scope list
(which already excludes multi-asset portfolios, tax modeling, live prices/trading, and accounts
for reasons independent of competitive landscape — those calls are confirmed correct by this
research and not revisited here).

- **Monte Carlo / bootstrapped forward-looking simulation.** PV's own implementation draws
  documented community criticism for producing "fatter tails than have ever occurred in real
  life," i.e., the standard implementation of this exact feature is itself controversial in this
  domain. More fundamentally it answers a different question than this tool asks: PROJECT.md's
  core value is "here is what *actually happened* to leverage at specific real entry points,"
  which is a backward-looking, falsifiable, receipts-based claim. Monte Carlo output is a
  forward-looking, model-dependent claim that is exactly as easy to argue about as the naive
  `L*r` claim this project exists to correct — it would reintroduce the "your model, my model"
  argument surface this tool is designed to close. Correctly excluded; do not add even as a v2
  feature.
- **Multi-asset portfolio construction / optimizer.** Confirmed correctly excluded — this is
  PV's and Curvo's core competency and a different, well-served problem (portfolio construction)
  from this tool's problem (single-symbol leverage mechanics). Adding it dilutes the product
  into a worse PV clone.
- **"Best leverage" / Kelly-criterion optimizer solver.** Standalone Kelly/optimal-leverage
  calculators already exist as a distinct tool category (multiple TradingView scripts, dedicated
  calculators). More importantly, a single "optimal leverage" number is in tension with this
  project's actual thesis: the entire point of the entry-date × leverage heatmap is that there
  is no single correct leverage independent of when you started and how long you held, and an
  optimizer that outputs one number per symbol would let a user skip the sweep and walk away
  with exactly the kind of oversimplified, cherry-pickable claim this tool exists to prevent. If
  built at all, it should be presentation-only — marking the empirically-best cell on the
  existing heatmap for the metric already displayed — never a separate solver with its own
  headline number.
- **Tax modeling.** Confirmed correctly excluded; already reasoned in PROJECT.md, and no
  surveyed competitor in this specific leveraged-ETF-analysis niche does it credibly either
  (general portfolio tools that attempt it, like some PV premium features, add substantial
  complexity for jurisdiction-specific rules that would immediately go stale).
- **Live prices / real-time data / accounts.** Confirmed correctly excluded per PROJECT.md; nothing
  in the competitive landscape suggests otherwise for a dispute-settling analysis tool.
- **One thing worth flagging as a possible gap, not a mistake to avoid:** a **rolling-returns
  companion line chart** (rolling N-year IRR of selected leverage vs. 1x, over calendar time) is
  cheap (same sweep data, different projection) and is standard-enough elsewhere (Portfolio
  Toolbox, PortfolioCharts) that its absence could read as a gap rather than a deliberate
  omission. Recommend including it as a lightweight v1.x addition, not proposing it as an
  anti-feature.

### 6. What people actually argue about, and what the tool must compute to settle each one

| Recurring claim | What it actually asserts | What the tool must compute to settle it |
|---|---|---|
| "Volatility decay means you always lose with leveraged ETFs" | Daily rebalancing mathematically guarantees underperformance over any long horizon | The vol-drag term in the attribution decomposition (Section 4a), shown as a specific dollar/percent figure that is *usually* negative but *not always dominant* — the ddnum.com formula `R ≈ kμ − ½k²σ²/(1+kμ)` shows drag scales with leverage² while raw return scales with leverage¹, so the claim is true directionally (drag exists and grows faster than return past some k) but false as an absolute ("always lose") — the tool settles this by showing the actual attribution breakdown at multiple leverage levels for the same symbol/period, letting the crossover point (where drag overwhelms the multiple) become visible rather than asserted. |
| "3x is fine if you just hold long enough" | Time horizon alone cures volatility-drag risk | The fixed-holding-period sweep mode at multiple N values (5/10/15/20/30yr), specifically including entry points inside 1929-1932, 1972-1974, and 2000-2002 — this claim is settled or refuted per-entry-point, not in the abstract, which is exactly why the heatmap (not a single aggregate stat) is the feature that resolves it. |
| "TQQQ since inception proves it works" | TQQQ's realized track record (2010-present) generalizes to leveraged holding in general | Requires the synthetic model, not the real ticker, because TQQQ's real inception (Feb 2010) postdates the two worst Nasdaq drawdowns in the modern era (2000-2002, and partially overlaps nothing worse than 2008 and 2022) — the tool must run synthetic 3x NDX/QQQ from 2000 to demonstrate the survivorship-bias point directly: real TQQQ's live history is a favorable-conditions sample, and the "since inception" framing is a selection artifact of the fund's launch date, not a property of the strategy. |
| "You would have been wiped out in 1929 / 2000" | High leverage entered at specific historical peaks resulted in total or near-total loss | The ruin flag plus max drawdown at those specific entry points and leverage levels, computed exactly (not estimated) from the strict-tier daily 1929-forward S&P data this project already plans to bundle — this is the single most load-bearing data requirement in the whole project (per PROJECT.md's own Context section calling 1929-1932 "the single most persuasive data point"), and the tool must get it exactly right or the whole credibility case collapses. |
| "The naive 3x return model is basically right, the difference is just fees" | Financing cost and vol drag are rounding errors next to the expense ratio | Directly refuted or confirmed by the attribution breakdown itself — per the testfol.io-derived formula, financing cost scales with `(L−1)`, so at L=3 it's already 2x the underlying short rate plus spread (often 1-3%+ annualized in normal-rate regimes, more in high-rate regimes like 2022-2023), frequently larger than the ~0.90-0.95% expense ratio; the tool settles this per-period since the short rate varies enormously across the bundled history (near-zero in 2009-2015, >5% in 2023), so the answer to "which cost dominates" is itself period-dependent and worth surfacing as such rather than asserting a fixed ranking. |
| "Leverage decay only matters in choppy/sideways markets, trending markets are fine" | Autocorrelation/trend regime determines whether leverage helps or hurts, independent of raw volatility | This is the one claim current academic literature (the 2025 arXiv "Compounding Effects... Beyond the Volatility Drag Paradigm" paper, and Avellaneda-Zhang before it) actually supports with nuance — positive serial correlation genuinely helps leveraged compounding, mean-reversion genuinely hurts it, independent of variance alone. The tool doesn't need a dedicated autocorrelation feature to address this: the entry-date sweep across many different historical regimes (trending 2010s vs. choppy 2015-2016 vs. crashing 2000-2002) already exposes this pattern implicitly, and a preset scenario contrasting "leverage return in a chop-heavy window" vs. "leverage return in a trend-heavy window" of similar realized volatility would make the point directly without adding a new metric. |

**Implication for the presets feature (differentiator d):** the claims above map almost one-to-one
onto a preset list — "3x S&P from Sept 1929," "3x/synthetic Nasdaq from March 2000," "TQQQ-real
vs. TQQQ-synthetic since 2010" (validation claim, doubles as differentiator (b)), "the 2010s in
isolation" (the cherry-picked-window claim, shown explicitly as cherry-picked by being labeled as
such), and "financing cost in a high-rate regime" (2022-2023 entry). Each preset should exist
because it settles a *specific, named, real* argument, not as a generic "interesting scenario" —
that specificity is what makes the presets a genuine differentiator rather than a demo-scenarios
feature.

---

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| Equity curve chart with log-scale toggle | Every surveyed tool (PV, testfol.io) has this; log scale is more important here than usual because 3x+ curves dwarf early history on a linear axis | LOW | Standard charting library feature |
| Drawdown chart (underwater plot) | Standard in PV and testfol.io; leverage's defining risk is drawdown depth, so its absence would be immediately conspicuous here specifically | LOW-MEDIUM | Derivable directly from the same daily series already computed for the equity curve |
| Benchmark/1x overlay comparison | Universal in PV and testfol.io; the entire argument this tool exists to settle is leverage-vs-unlevered, so this is closer to core-value than decoration | LOW | Just another series on the existing chart |
| Date-range selection for a single run | Universal; users need to pick an entry date before any sweep makes sense | LOW-MEDIUM | Must respect bundled data's actual coverage per symbol/tier |
| CSV export of underlying daily series | testfol.io has this; already an explicit PROJECT.md requirement, confirmed as standard practice, not a novel ask | LOW | Straightforward serialization of already-computed data |
| Methodology / data-source disclosure | PV publishes a FAQ page; testfol.io's methodology is reverse-engineerable by third parties, implying it's under-disclosed relative to best practice — this project's PROJECT.md already commits to doing this *better* (prominent, not a footnote), which is correct given the domain's trust problem | LOW-MEDIUM | Content/UI work, not computational work |
| Metric summary panel (CAGR, IRR, max drawdown, volatility) | Every surveyed tool leads with a stats panel; users scan this before looking at any chart | LOW | Formulas already specified in PROJECT.md; this is UI presentation of existing computation |
| Permalink / URL-state sharing | Not universal but common enough (Portfolio Toolbox and others do URL-state) that its absence would read as a regression, not a novel gap; also explicitly required by PROJECT.md already | MEDIUM | Requires careful serialization of full parameter state, including sweep mode and any custom cost overrides |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| Cost attribution decomposition (vol drag / financing / expense ratio, $ and %) | No surveyed competitor exposes this breakdown to the user, despite testfol.io's engine internally containing all three terms; this is the feature that "names the mechanism," which PROJECT.md identifies as what actually ends an argument | MEDIUM | Requires no new simulation, only decomposing the existing return-formula computation per period rather than only netting it — see Section 4a |
| In-app validation view (synthetic model vs. real UPRO/TQQQ) | Converts an unfalsifiable "trust the model" claim into a checkable one; no competitor does this in-product | MEDIUM | Needs both bundled real-ETF series (already an active requirement) and a side-by-side/overlay chart plus a tracking-error stat; mostly UI + one new comparison view over data already required to exist |
| Explicit data-provenance tiers surfaced in the primary UI (not a docs page) | Directly addresses the credibility gap in how PV/testfol.io disclose methodology (buried in FAQ/reverse-engineered); matches this domain's actual trust problem | LOW-MEDIUM | Mostly a UI/content requirement layered on top of the already-required strict/extended tier system |
| Entry-date × leverage heatmap, with fixed-horizon and hold-to-today modes, informed by pork-chop-plot iso-line overlays | No surveyed tool plots this; closest ancestors (PortfolioCharts Heat Map, generic backtest-parameter heatmaps) use different axis pairings. This is the project's central, hardest, and least-precedented feature | HIGH | Depends on a performant sweep engine (~10k backtests per render per PROJECT.md); depends on the single-run computation and cost model being correct first; design needs dedicated iteration (see Section 3) |
| Named "canonical argument" presets tied to specific real internet claims | Competitors offer free-form construction but no curated, argument-specific scenario library; directly operationalizes Section 6's claim table | LOW-MEDIUM once the sweep/single-run engine exists | Pure configuration/content over existing computation; no new engine work, but requires care in scenario selection and labeling (e.g., explicitly flagging the "2010s in isolation" preset as an intentionally cherry-picked window, to make the point rather than commit the sin) |
| Ruin flag + "multiple of contributed capital" (MOIC-style) metric | Neither metric is standard-tool convention (PV/testfol.io don't surface either); both are natural and low-cost additions given this tool's specific purpose | LOW | Ruin flag is a boolean derived from the existing daily series; MOIC-style multiple is a simple ratio over already-computed final value and total contributed |
| Default-to-IRR display when contributions are non-zero, de-emphasizing CAGR | Both competitors compute IRR but neither leads with it; leading with it directly counters the "cherry-picked annualized number" failure mode this project targets | LOW | Presentation-logic change only; both metrics are already required to be computed |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| Monte Carlo / bootstrapped forward simulation | Standard feature in PV; "what might happen" feels like a natural complement to "what did happen" | Reintroduces exactly the model-dependent, arguable-forever claim surface this tool exists to eliminate; PV's own bootstrap implementation is itself criticized in its community for unrealistic tail fatness, i.e., the standard version of this feature is contested even where it already exists | Keep the tool strictly backward-looking/historical; if forward-looking questions come up, that's a different tool by design |
| Multi-asset portfolio construction / rebalancing across assets | Natural extension once single-symbol leverage works; PV/Curvo's core competency | Dilutes single-symbol leverage focus into a worse clone of an already-dominant incumbent (PV); PROJECT.md already excludes this for the same reason | Point users to PV/Curvo for portfolio construction; this tool stays single-symbol |
| "Optimal leverage" solver / Kelly-criterion recommender | Feels like the natural payoff of the whole analysis — "so what leverage should I actually use" | Produces exactly the single oversimplified number this tool's entire heatmap-based design exists to avoid; optimal leverage is entry-point- and horizon-dependent by this project's own thesis, so a single-answer solver contradicts the product's core argument | At most, mark the empirically-best cell on the existing heatmap as a presentation layer over data already computed — never a standalone solver with its own headline claim |
| Tax modeling | Users in the FIRE/leverage community care about after-tax outcomes | Jurisdiction-specific, goes stale fast, adds substantial complexity for a claim ("is leverage viable") that's largely orthogonal to tax treatment | Explicitly out of scope per PROJECT.md; unaffected by this research |
| Live prices / accounts / brokerage integration | Users may want to "check their actual position" | This is an analysis tool for settling historical arguments, not a portfolio tracker; live data also breaks the bundled-data reproducibility guarantee that's core to the project's credibility model | Explicitly out of scope per PROJECT.md; unaffected by this research |

## Feature Dependencies

```
Simulation engine (daily leverage formula, per-symbol)
    └──requires──> Bundled data (price/total-return series, short-rate series)

Cost attribution decomposition
    └──requires──> Simulation engine (needs the per-period formula terms, not just net output)

Validation view (synthetic vs. real UPRO/TQQQ)
    └──requires──> Simulation engine
    └──requires──> Bundled real-ETF series (UPRO, TQQQ)

IRR / metric summary panel
    └──requires──> Simulation engine
    └──requires──> Contribution schedule support

Entry-date × leverage heatmap
    └──requires──> Simulation engine
    └──requires──> Sweep/batch execution (performant, off-main-thread)
    └──requires──> Single-run visualization (heatmap cells drill into single-run view)

Rolling-returns companion chart
    └──requires──> Sweep/batch execution (reuses heatmap's sweep data, different projection)

Named "canonical argument" presets
    └──requires──> Entry-date × leverage heatmap (or single-run view, for simpler presets)
    └──requires──> Data-provenance tiers (presets like "1929" depend on extended-tier data existing)

Permalink sharing
    └──requires──> All parameter state being serializable (symbol, leverage, dates, contributions, cost overrides, sweep mode)

Ruin flag / ruin-cell hatching on heatmap
    └──requires──> Simulation engine (ruin detection)
    └──enhances──> Entry-date × leverage heatmap (distinguishes wipeout from merely-bad)

"Optimal leverage" marker (if built at all)
    └──requires──> Entry-date × leverage heatmap
    └──conflicts with──> Product thesis if presented as a standalone recommendation rather than an annotation
```

### Dependency Notes

- **Cost attribution requires the simulation engine to expose per-period formula terms, not just
  net returns.** If the engine is implemented to only return the final blended daily return, the
  attribution feature becomes a rebuild rather than a decomposition. This should be an
  implementation constraint on the simulation engine phase, decided before that phase closes.
- **The heatmap requires the single-run view to exist first**, both because the sweep is
  logically "many single runs" and because the design plan above treats the heatmap as a
  navigation surface (hover/click into a single-run detail), not a self-contained visualization.
- **Presets depend on data-provenance tiers being in place**, specifically because several of the
  highest-value presets (1929, and to a lesser extent 1972-1974) only exist in the extended
  tier — a preset that silently uses interpolated data without the tier disclosure being visible
  would undercut the credibility goal the presets exist to serve.
- **The "optimal leverage" marker conflicts with the product thesis if it becomes a standalone
  feature** rather than an annotation layer on data the user already asked to see — this is
  flagged as a conflict, not a sequencing dependency, and should stay resolved in favor of
  "annotation only, never a solver" per Section 5.

## MVP Definition

### Launch With (v1)

- [ ] Simulation engine with documented per-period cost formula terms — the entire product is
      unfalsifiable without this being correct first
- [ ] Single-run view: equity curve (log-scale toggle), drawdown chart, 1x benchmark overlay,
      metric summary panel (CAGR, IRR, max drawdown, MOIC-style multiple, ruin flag) — this is
      the table-stakes floor below which the product isn't a credible backtester at all
- [ ] Cost attribution decomposition on the single-run view — the headline differentiator;
      shipping v1 without it means shipping a product indistinguishable from testfol.io's
      existing synthetic-leverage feature
- [ ] Validation view comparing synthetic vs. real UPRO/TQQQ — without this the model's central
      credibility claim is untested in the eyes of any skeptical user, which is the exact
      audience this tool targets
- [ ] Entry-date × leverage heatmap, at least one sweep mode — this is the feature PROJECT.md
      identifies as the hard, load-bearing design problem; deferring it to v1.x would mean
      shipping a product that answers "what happened" but not "does it depend on when I
      started," which is the actual question in dispute
- [ ] Data-provenance tier disclosure, visible on the primary screen — required for the strict/
      extended tier system to do its credibility job at all

### Add After Validation (v1.x)

- [ ] Second sweep mode (whichever of fixed-horizon/hold-to-today ships second) — trigger: v1
      validates that the heatmap itself is legible and useful before doubling its complexity
- [ ] Named canonical-argument presets — trigger: once the underlying scenarios (single-run and
      heatmap) are stable enough that presets won't need rework every time the engine changes
- [ ] Rolling-returns companion chart — trigger: low cost, add once sweep data is already being
      computed for the heatmap so it's nearly free
- [ ] Iso-metric contour-line overlay on the heatmap — trigger: only after the base heatmap's
      legibility is validated with real users/self-testing; this is a refinement, not core

### Future Consideration (v2+)

- [ ] "Optimal leverage" marker annotation on the heatmap — defer until there's confidence the
      framing (annotation, not recommendation) won't get flattened into "just tell me the best
      leverage" in practice
- [ ] Additional bundled symbols beyond the initial universe — defer until the compiler pipeline
      and existing symbol set have proven the format; adding symbols is explicitly designed to be
      cheap later ("drop in a CSV, recompile"), so there's no reason to front-load this

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---|---|---|---|
| Simulation engine with cost model | HIGH | MEDIUM | P1 |
| Single-run view + metrics | HIGH | LOW-MEDIUM | P1 |
| Cost attribution decomposition | HIGH | MEDIUM | P1 |
| Validation view (synthetic vs. real) | HIGH | MEDIUM | P1 |
| Entry-date × leverage heatmap | HIGH | HIGH | P1 |
| Data-provenance tier disclosure | MEDIUM-HIGH | LOW | P1 |
| Permalink sharing | MEDIUM | MEDIUM | P1 |
| CSV/PNG export | MEDIUM | LOW | P1 |
| Second sweep mode | MEDIUM-HIGH | MEDIUM | P2 |
| Named presets | HIGH (for the "settle an argument" use case specifically) | LOW (once P1 done) | P2 |
| Rolling-returns companion chart | LOW-MEDIUM | LOW | P2 |
| Iso-metric contour overlay | MEDIUM | MEDIUM | P3 |
| Optimal-leverage annotation | LOW-MEDIUM (and risky to framing) | LOW | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Portfolio Visualizer | testfol.io | This project |
|---|---|---|---|
| Leveraged exposure modeling | Real leveraged ETFs only (actual NAV history); no synthetic engine | Synthetic engine (`L`, `E`, spread params) using real-time-adjacent formula close to industry standard | Synthetic engine, same formula family, but with exposed per-term attribution and in-app validation against real ETF history |
| Cost attribution | Not exposed as a decomposition; implicit only via actual-vs-naive-multiple comparison, and only for tickers that exist | Formula computes all terms internally; no evidence of user-facing decomposition | Headline feature: dollar/percent breakdown of vol drag / financing / expense ratio |
| Annualized metric under contributions | CAGR shown prominently, IRR shown but secondary | Same pattern: CAGR-first, money-weighted return available but not the default framing | IRR is the default and emphasized metric whenever contributions are non-zero; CAGR de-emphasized in that case |
| Entry-date sensitivity visualization | None specific to leverage; general backtest date-range selection only | None found | Entry-date × leverage heatmap with dual sweep modes — the core differentiator |
| Data provenance disclosure | Separate FAQ page, not attached to results | Not user-facing; reverse-engineered by third parties | Always-visible tier disclosure attached to every result, per PROJECT.md's explicit design commitment |
| Scenario presets | None | None | Named presets tied to specific, real recurring arguments |
| Monte Carlo | Yes (historical block-bootstrap) | Not identified in this research | Deliberately excluded — see anti-features |
| Multi-asset portfolios | Yes, core competency | Yes | Deliberately excluded — single-symbol focus |

## Sources

- testfol.io (https://testfol.io/) — product itself; direct fetch of methodology returned
  HTTP 403, so claims about its engine are sourced from third-party reverse-engineering
  documentation (Testfol-MarginStresser GitHub docs) and secondary review sites
  (findmymoat.com, theitalianleathersofa.com), corroborated across at least two independent
  sources for the core formula claim. Confidence: MEDIUM.
- Portfolio Visualizer (https://www.portfoliovisualizer.com/) — product itself; direct fetch of
  FAQ/methodology pages returned HTTP 403, so claims are sourced from secondary
  descriptions (datasavvyfinance.com, riskparitychronicles.substack.com) plus Bogleheads forum
  discussion of PV's leveraged-ETF handling. Confidence: MEDIUM.
- PortfolioCharts Heat Map (https://portfoliocharts.com/charts/heat-map/) and Retirement
  Spending chart (https://portfoliocharts.com/charts/retirement-spending/) — fetched
  successfully; description of axis layout, color scale, and reading pattern taken directly
  from the vendor's own page content. Confidence: HIGH.
- Avellaneda, M. & Zhang, S.J., "Path-Dependence of Leveraged ETF Returns," SIAM Journal on
  Financial Mathematics (2009/2010) — peer-reviewed academic source, cited via SSRN/NYU
  abstract and citing secondary summaries. Confidence: HIGH.
- "Compounding Effects in Leveraged ETFs: Beyond the Volatility Drag Paradigm," arXiv:2504.20116
  (2025) — preprint, corroborating and extending Avellaneda-Zhang on autocorrelation/regime
  dependence. Confidence: MEDIUM-HIGH (preprint, not yet peer-reviewed at time of research).
  Confidence tier obtained via source-hierarchy convention: preprints are treated as MEDIUM
  pending peer review, upgraded toward HIGH given consistency with the peer-reviewed prior
  literature.
- Double-Digit Numerics, "The Big Myth about Leveraged ETFs" (ddnum.com) — fetched successfully;
  source of the `R ≈ kμ − ½k²σ²/(1+kμ)` decay-approximation formula used in Section 6.
  Confidence: MEDIUM (independent technical blog, not peer-reviewed, but formula is a standard
  second-order approximation consistent with the academic literature).
- Bogleheads "HEDGEFUNDIE's excellent adventure" thread (bogleheads.org/forum/viewtopic.php?t=272007
  and t=293438) — primary source for the specific recurring claims catalogued in Section 6;
  treated as community-discourse evidence of *what people argue*, not as a technical authority
  on whether the claims are correct. Confidence: LOW-MEDIUM as a technical source, HIGH as
  evidence of which arguments are actually live in this community.
- optimizedportfolio.com (TQQQ analysis) and seekingalpha.com (TQQQ/UPRO data-driven analyses) —
  secondary practitioner sources for the "since inception" survivorship-bias discussion in
  Section 6. Confidence: MEDIUM.
- Wikipedia, "Porkchop plot," and Number Analytics, "Mastering Porkchop Plots in Astrodynamics" —
  reference sources for the pork-chop-plot mechanics described in Section 3. Confidence: MEDIUM-HIGH
  (Wikipedia cross-checked against a specialist secondary explainer, consistent).
- backtesting.py documentation (kernc.github.io) — generic parameter-heatmap prior art cited in
  Section 3 as the nearest generic-backtesting analog to an entry-date × leverage heatmap, used
  to establish that no domain-specific precedent exists. Confidence: HIGH (official docs).

---
*Feature research for: leveraged-ETF backtesting and visualization tool*
*Researched: 2026-08-16*
