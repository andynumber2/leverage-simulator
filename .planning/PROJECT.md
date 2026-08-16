# Leverage Simulator

## What This Is

A static web app that simulates daily-rebalanced leveraged exposure to a bundled set of
market indices and ETFs, with rigorous cost modelling (financing, expense ratio, volatility
drag) rather than the naive `return * L` that most online arguments assume. It exists to
answer, with receipts, the recurring internet question of whether you should hold leveraged
ETFs long-term, and specifically how sensitive the answer is to your entry point and your
leverage level.

Audience: the project owner first, and then anyone in an argument who needs a link that
settles it.

## Core Value

Given a symbol, a leverage level, an entry point, and a contribution schedule, produce a
defensible outcome and show **which mechanism** consumed the money (volatility drag vs
financing vs fees), in a form that can be pasted into an argument.

If everything else fails, the simulation math must be right and must be demonstrably right
against real leveraged ETF price history.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Simulation engine**

- [ ] Simulate daily-rebalanced leverage at an arbitrary positive multiple (1x through 20x+,
      fractional allowed), where 1x reproduces the unlevered series exactly
- [ ] Model each trading day's portfolio return as leveraged price return minus financing on the
      borrowed portion minus expense ratio, not `L*r`. Financing and fees accrue on **calendar
      days elapsed since the prior trading day**, not per trading row: a three-day weekend costs
      three days of interest. Roughly
      `r_port = L*r - (L-1)*(short_rate + spread)*days/360 - ER*days/365`,
      with the exact day-count conventions to be decided and documented
- [ ] The 1x case must reproduce the unlevered series **exactly**, as a tested invariant
- [ ] Cost parameter defaults must be sourced independently and never tuned to make the
      UPRO/TQQQ validation pass. Residual tracking error is reported honestly, not fitted away
- [ ] Support an initial investment amount plus a recurring contribution amount at daily,
      monthly, quarterly, or yearly frequency
- [ ] Support a dividend-reinvest toggle backed by two bundled series per symbol
      (total-return and price-return), so the toggle switches data rather than approximating
- [ ] Detect and flag ruin (position value reaching or crossing zero), and handle it correctly
      rather than producing negative-value nonsense downstream
- [ ] Validate synthetic leverage against real leveraged ETF history: synthetic 3x S&P 500 must
      track UPRO since 2009, and synthetic 3x NDX must track TQQQ, within a documented tolerance

**Cost attribution**

- [ ] For any single run, decompose the gap between naive `L*r` and the actual result into
      volatility drag, financing cost, and expense ratio, reported in both dollars and percent
- [ ] Expense ratio and financing spread are user-editable, defaulting to values sourced from
      real products (roughly 0.90% ER and ~0.5% over the short rate)

**Outcome metrics**

- [ ] IRR (money-weighted return), used instead of CAGR whenever contributions are non-zero
- [ ] Maximum drawdown
- [ ] Final value as a multiple of total contributed
- [ ] Ruin flag (did it ever go to zero)

**Visualization**

- [ ] Fixed leverage, sweep entry date: how outcome varies by when you started
- [ ] Fixed entry date, sweep leverage: how outcome varies by how much leverage you took
- [ ] 2D heatmap over entry date x leverage, colored by the selected outcome metric
- [ ] Sweep mode toggle: fixed holding period (every entry holds N years, apples-to-apples) vs
      hold-to-today (every entry runs to the present)
- [ ] Sweeps stay responsive; a full heatmap is on the order of 10,000 backtests and must not
      block the UI

**Data**

- [ ] Bundled binary data assets, no runtime backend and no external API calls
- [ ] A CLI bundle compiler in the repo that ingests raw CSVs and emits versioned binary
      bundles plus a JSON manifest, so adding a symbol is "drop in a CSV, recompile, redeploy"
- [ ] Bundled universe: S&P 500 (daily to 1928), Nasdaq-100/QQQ, real leveraged ETFs
      (UPRO, TQQQ, SSO, QLD) for model validation, and VTI, EFA, EEM, TLT
- [ ] Bundled short-rate series (Fed funds / 3M T-bill) covering the full date range
- [ ] Two user-selectable history tiers: **strict** (every input genuinely daily) and
      **extended** (deep history, with monthly rate and dividend data interpolated to daily)
- [ ] The GUI states explicitly and prominently what each tier means, including the actual
      seam dates and data sources. Provenance is visible, never a footnote

**Sharing**

- [ ] URL permalink encoding every parameter, so a pasted link reproduces the exact run
- [ ] PNG export of the current chart
- [ ] CSV export of a run's underlying daily series, so the math can be checked independently
- [ ] Named preset scenarios for the canonical arguments (e.g. 3x S&P from 1929, TQQQ from 2000,
      the 2010s in isolation)

### Out of Scope

- **Arbitrary live ticker lookup** — bundled-only was chosen deliberately. Reproducibility
  matters more than coverage for a tool whose purpose is settling disputes; vendor data
  revisions would silently change past conclusions. The bundle compiler is the escape hatch.
- **D1 / any backend database** — the full dataset is on the order of 1MB as binary assets, so
  a query round-trip buys nothing. More importantly the sweep cannot run server-side at all:
  Cloudflare Workers have hard CPU-time limits and a heatmap is ~250M operations, so compute
  must be client-side regardless, which reduces D1 to a slower asset fetch.
- **Intraday or minute-level data** — daily rebalancing is what real leveraged ETFs do; finer
  granularity adds volume without changing any conclusion.
- **Portfolio construction, rebalancing across multiple assets, tax modelling** — single-symbol
  leverage is the argument being settled. Broadening dilutes it.
- **Trading, brokerage integration, live prices** — this is an analysis tool, not an app that
  touches money.
- **User accounts, persistence, server-side state** — permalinks carry all state.

## Context

- **Motivation**: recurring, unresolvable internet arguments about whether leveraged ETFs are
  viable long-term holds. Both sides typically argue from either a naive `return * L` model
  (overstates leverage badly) or from a cherry-picked window (usually 2010-2021).
- **Why entry point is the hard visualization**: the owner's intuition is that entry sensitivity
  is the crux and that it wants something like a pork chop plot. The 2D entry-date x leverage
  heatmap is the chosen representation, with a holding-period mode switch because "sweep the
  entry date" is ambiguous between fixed-horizon and hold-to-today, and the two produce very
  different pictures.
- **Why CAGR is avoided**: with a recurring contribution schedule, money has heterogeneous
  holding periods and there is no single meaningful annualized return. Comparing a DCA outcome
  against a lump-sum CAGR is a common source of wrong conclusions in exactly these arguments.
  IRR is used instead.
- **Data seams that constrain deep history**: daily S&P 500 price data reaches back to 1928, but
  daily total-return data effectively begins in 1988 and daily short-rate data does not exist
  before 1954 at all (FRED `DFF` starts 1954-07-01, `DTB3` starts 1954-01-04; the monthly
  `TB3MS` reaches back only to 1934-01-01). Reaching 1929 therefore *requires* interpolating
  monthly or annual rate data to daily. There is no way around it. The 1929-1932 drawdown is the
  single most persuasive data point against high leverage, so the extended tier exists to reach
  it; the strict tier exists so nobody can dismiss a result as an interpolation artifact.
- **Overlapping windows are not independent observations**: adjacent entry dates in a sweep share
  nearly all their underlying data. A 10,000-cell heatmap is a sensitivity analysis over one
  history, not 10,000 backtests. The UI must say so in visible copy, not in a methodology
  footnote, or the tool overstates its own evidence and hands the argument back.
- **Credibility anchor**: real UPRO and TQQQ price history is bundled not to simulate but to
  validate. If the model does not reproduce them, its conclusions carry no weight.
- **Deployment target**: Cloudflare Pages, static hosting only.

## Constraints

- **Tech stack**: Must deploy as static assets to Cloudflare Pages. No backend, no database,
  no runtime external API calls.
- **Performance**: Heatmap sweeps are ~10,000 backtests over ~25,000 daily bars each. Compute
  runs off the main thread (Web Worker, and possibly WASM) so the UI stays responsive.
- **Data**: Bundled and versioned at build time. Every series must carry its source and date
  range, surfaced in the UI.
- **Correctness**: The cost model is the product. Any simplification that changes a conclusion
  must be surfaced to the user, not hidden.
- **Offline**: Once loaded, the app should work without a network connection.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| App, not a spreadsheet | 10k backtests per heatmap render is far beyond spreadsheet ergonomics, and the target visualization is not expressible in one | — Pending |
| Static binary assets, not D1 | Dataset is ~1MB; sweep must run client-side due to Worker CPU limits, so a backend adds latency and moving parts for no gain | — Pending |
| Full cost model, not `return * L` | The naive model is the root cause of the arguments this tool exists to end | — Pending |
| IRR instead of CAGR | CAGR is undefined in any meaningful sense once recurring contributions are on | — Pending |
| Bundled data only, plus a compiler | Reproducibility beats coverage for a dispute-settling tool; the compiler keeps the universe extensible | — Pending |
| Both price-return and total-return series bundled | Makes the dividend toggle exact rather than a modelled approximation | — Pending |
| Two explicit history tiers | Reaching 1929 requires interpolation; a strict tier means the extended tier's methodology cannot be used to dismiss the whole tool | — Pending |
| Validate against real UPRO/TQQQ | Without it, every conclusion is an unfalsifiable claim | — Pending |
| Both sweep modes (fixed-horizon and hold-to-today) | They answer different questions and each alone is misleading | — Pending |
| Attribution breakdown as headline feature | Naming which mechanism cost the money is what actually ends an argument; a number alone does not | — Pending |
| Financing accrues on calendar days, not trading rows | Interest runs over weekends and holidays; per-trading-row `/252` systematically understates leverage cost | — Pending |
| Heatmap UI must state that windows overlap | 10,000 cells over one shared history is a sensitivity analysis, not 10,000 independent trials; claiming otherwise is the kind of overstatement that loses the argument | — Pending |
| Plain JS with a Worker pool, not WASM, for the sweep/kernel compute path | Measured 10,000-cell sweep: 327.40ms normalized (185.80ms raw, 8 workers/32 chunks), 32.7% of the 1000ms PERF-03 budget, on this dev sandbox (9 logical cores, calibration score 0.57 — informational, not the D-17 `ubuntu-latest` baseline). A throwaway Rust→WASM microbenchmark of the identical branchy per-bar recurrence (proven equal to the JS output within 1e-9 relative tolerance) measured **~1.20x SLOWER than JS**, not faster, on a batched 5,000-call per-call figure (0.1348ms/call WASM vs 0.1123ms/call JS) — contradicting the "near parity" prediction in 01-CONTEXT.md's Rationale for JS-first, though in the direction that strengthens rather than weakens the JS-first conclusion: WASM does not win here at all | See `.planning/phases/01-performance-spike-and-budget-lock/01-SPIKE-RESULTS.md` §3 for the full method, both arms' figures, and the honest floor-value caveat on the single-call comparison |
| Hand-rolled Canvas 2D (`putImageData`), not a charting library, for the heatmap | Measured 10,000-cell repaint: `putImageData` at/below `performance.now()`'s resolution (0ms normalized) vs `fillRect`-per-cell's 4.41ms, both proven to paint the same picture before either figure was trusted, 0% of the 16ms PERF-05 budget, on this dev sandbox (9 logical cores — informational, not the D-17 baseline). No charting library was separately benchmarked, per D-14: `.claude/CLAUDE.md` §"Q2 — Charting" already documents each rejected on record (uPlot has no heatmap mark; ECharts/Plotly degrade well under 10k cells; Observable Plot defaults to SVG, the specific 10k-cell failure mode this project needs to avoid) | See `.planning/phases/01-performance-spike-and-budget-lock/01-SPIKE-RESULTS.md` §2 for both arms' raw figures and the equivalence proof that preceded trusting either |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-15 after initialization*
