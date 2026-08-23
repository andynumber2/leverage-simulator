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
- [x] Validate synthetic leverage against real leveraged ETF history: synthetic 3x S&P 500 must
      track UPRO since 2009, and synthetic 3x NDX must track TQQQ, within a documented tolerance
      (Phase 3: the tracking gate; Phase 5: the comparison surfaced in-app, not only in tests)

**Cost attribution**

- [x] For any single run, decompose the gap between naive `L*r` and the actual result into
      volatility drag, financing cost, and expense ratio, reported in both dollars and percent
      (Phase 5: Shapley decomposition, reconciling to the total gap with no residual)
- [x] Expense ratio and financing spread are user-editable, defaulting to values sourced from
      real products (roughly 0.90% ER and ~0.5% over the short rate)
      (Phase 5: every default labelled as a default and editable in place)

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

- [x] Bundled binary data assets, no runtime backend and no external API calls
      (Phase 2: compiled data bundle)
- [x] A CLI bundle compiler in the repo that ingests raw CSVs and emits versioned binary
      bundles plus a JSON manifest, so adding a symbol is "drop in a CSV, recompile, redeploy"
      (Phase 2: compiled data bundle)
- [x] Bundled universe: S&P 500 (daily to 1928), Nasdaq-100/QQQ, real leveraged ETFs
      (UPRO, TQQQ, SSO, QLD) for model validation, and VTI, EFA, EEM, TLT
      (Phase 2: compiled data bundle)
- [x] Bundled short-rate series (Fed funds / 3M T-bill) covering the full date range
      (Phase 2: compiled data bundle)
- [x] Two user-selectable history tiers: **strict** (every input genuinely daily) and
      **extended** (deep history, with monthly rate and dividend data interpolated to daily)
      (Phase 2: tier ranges computed from seam records)
- [x] The GUI states explicitly and prominently what each tier means, including the actual
      seam dates and data sources. Provenance is visible, never a footnote
      (Phase 5: provenance strip rendered from the manifest, plus the extended-tier bias warning
      carrying its measured magnitude)

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
| Plain JS with a Worker pool, not WASM, for the sweep/kernel compute path | Measured on the D-17 baseline (GitHub Actions `ubuntu-latest`, 4 logical cores, run 31965951474): PERF-03 at 807.92ms normalized (856.40ms raw, workerCount=3, chunkCount=12), 80.8% of the 1000ms budget, calibration score 1.0600. This dev sandbox separately measured 327.40ms normalized (185.80ms raw, 8 workers/32 chunks), 32.7% of the same budget, on 9 logical cores, calibration score 0.57 (informational only, not the D-17 baseline). The JS-over-WASM conclusion survives the worse baseline number: a throwaway Rust to WASM microbenchmark of the identical branchy per-bar recurrence (proven equal to the JS output within 1e-9 relative tolerance) measured **~1.20x SLOWER than JS**, not near parity as CONTEXT.md's rationale predicted, so escalating to WASM would spend the headroom rather than recover it | See `.planning/phases/01-performance-spike-and-budget-lock/01-SPIKE-RESULTS.md` §3 for the full method, both arms' figures, and the honest floor-value caveat on the single-call comparison |
| Hand-rolled Canvas 2D (`putImageData`), not a charting library, for the heatmap | Measured on the D-17 baseline (GitHub Actions `ubuntu-latest`, run 31965951474): PERF-05 at 0.37ms of the 16ms budget. This dev sandbox separately measured `putImageData` at 0.11ms versus `fillRect`-per-cell's 5.92ms, informational only, not the D-17 baseline. No charting library was separately benchmarked, per D-14: `.claude/CLAUDE.md` §"Q2, Charting" already documents each rejected on record (uPlot has no heatmap mark; ECharts/Plotly degrade well under 10k cells; Observable Plot defaults to SVG, the specific 10k-cell failure mode this project needs to avoid) | See `.planning/phases/01-performance-spike-and-budget-lock/01-SPIKE-RESULTS.md` §2 for both arms' raw figures and the equivalence proof that preceded trusting either |
| PERF-03 D-20 escalation: accept the measurement, keep the budget locked, carry headroom forward as a Phase 6/7 constraint | PERF-03 measured 807.92ms normalized (856.40ms raw, workerCount=3, chunkCount=12), 80.8% of the 1000ms budget, on the D-17 baseline (GitHub Actions `ubuntu-latest`, 4 logical cores, calibration score 1.0600, run 31965951474). The prior baseline run 31963076671 attempt 2 measured 700.38ms (70.0%) on the same baseline, so the D-20 70% trigger is crossed on two consecutive runs, not a single-sample artifact; attempt 1 of that run drew a 2-core runner and failed PERF-03 outright, a live risk to the gate itself. This is a deliberate escalation under D-20, not a budget relaxation: PERF-03's threshold stays 1000ms, no `thresholdMs` moves, D-19's lock holds on all eight budgets, and `NOMINAL_REFERENCE_MS` stays 40, on 01-01-PLAN.md's PERF-01a prohibition against altering the calibration reference loop in response to a measurement whose only effect would be to un-trip an escalation (retuning to the measured 37.30ms would read PERF-03 at 65.3% instead of 70.3%). A third baseline run, 31980066804, measured 702.73ms normalized (655.30ms raw), 70.3%, `escalate=yes`, so the trigger is crossed on all three baseline runs to date. That third sample also weakens the noise argument originally recorded alongside the prohibition: the reference loop measured 37.30ms, 42.40ms, and 37.30ms, making 37.30ms the modal value and 42.40ms the outlier rather than a spread centered near 40. The prohibition, not the spread, is what keeps the anchor at 40. Of D-20's three levers, the WASM ratio from D-11 is already spent: 01-04 measured Rust at about 1.20x SLOWER than JS, so adopting it would make PERF-03 worse. Pool tuning and a coarser default grid both belong to code that does not exist until Phase 7 and Phase 6 respectively. The choice recorded here is to accept the measurement, keep the budget locked, and carry the headroom question forward as a live constraint: any work added on the sweep path in Phase 6 or Phase 7 must be measured against PERF-03 before it lands. At 80.8% with the real kernel, attribution passes, and progressive paint still to be layered on top, roughly 19% headroom remains against the 30% that D-20's 70% rule was written to reserve. This is weaker than literally naming a lever; the lever choice is deferred to the phase that has real code to measure against, not settled here | See `.planning/phases/01-performance-spike-and-budget-lock/01-SPIKE-RESULTS.md` §4 addendum for the dated addendum recording this escalation against the D-17 baseline |
| SUPERSEDED (D-28): Stooq's redistribution licence terms are unclear and are a knowingly accepted risk (D-06) | FRED and Shiller are explicitly redistributable, recorded and authored once in each source's sidecar (`license`/`termsUrl`/`retrievedAt`), copied by the compiler into the manifest, and rendered by Phase 5's methodology page from the manifest, never hand-typed per file. Stooq's terms are permissive for personal use but unclear for redistribution of the bundled data itself; recording the terms per source and proceeding is D-05's resolution, and promoting the reasoning here (rather than leaving it as an implementation detail) is what D-06 requires | Accepted; `tools/fetch-data/src/sources.ts` carries the licence/terms text once per source. Superseded by the "Yahoo and Nasdaq licence positions" row below (D-05, D-06), implemented in plan 02-06/02-07. See `02-CONTEXT.md`'s Source Stack Reversal banner |
| SUPERSEDED (D-28): Stooq is refreshed by a human through a real browser, not by `npm run fetch-data` (Route C) | Stooq serves a JavaScript proof-of-work bot challenge to every plain-https request, confirmed this session; no response body from a scripted request is real data. No anti-bot bypass was written, no alternative vendor was substituted, and no symbol was dropped from the universe. `fetch.ts` reads a manually-placed vendor file from `raw/manual/<stem>.csv` and normalizes it through the identical `normalizeStooq` contract a live fetch would have used, so there is one code path and one coverage check regardless of how the bytes arrived. Shiller's `ie_data.xls` follows the same manual pattern (Route B) for a different reason: this environment has no network path to `econ.yale.edu` | Documented in `tools/fetch-data/README.md` and `tools/fetch-data/MANUAL-DOWNLOAD.md`; equity/ETF and Shiller raw inputs await a human download before `raw/` is complete. Superseded by the "Yahoo and FRED are fetched automatically" row below (D-27), implemented in plan 02-06/02-07. See `02-CONTEXT.md`'s Source Stack Reversal banner |
| Yahoo and Nasdaq licence positions are knowingly accepted risks (D-05, D-06) | Yahoo's terms are personal-use with an undocumented chart endpoint and no published redistribution grant; Nasdaq's index site carries its own terms of use with no explicit redistribution grant. FRED and Shiller remain explicitly redistributable. The terms text is authored once per source in `tools/fetch-data/src/sources.ts`, copied by the compiler into the manifest, and rendered by the Phase 5 methodology page, never hand-typed per file | Accepted |
| Yahoo and FRED are fetched automatically, Nasdaq and Shiller stay manual, and Yahoo falls back to committed vendor bytes (D-27) | Yahoo's chart API returns HTTP 429 to this development sandbox's shared egress address on the first request, from both `query1` and `query2`, regardless of headers, while the vendor's own web host and a real browser both succeed; that is an address-level block, not a malformed request, so the same command must work on a developer machine and on a shared-address runner. Three guards keep the fallback from becoming a trap: per-series route reporting in the coverage table, a staleness gate measured from the newest observation in the data (never file mtime) that fails the run outright, and no bypass flag | Implemented; declared thresholds are 10 days for every daily Yahoo/Nasdaq manual file and 75 days for Shiller's monthly input (`tools/fetch-data/src/sources.ts`) |
| Heatmap treatment: `form-2-filled-contour` ("filled contour", the pork-chop plot), not the dense grid, small multiples, or grid-with-contour-overlay (D-26) | Phase 6 built all four candidate forms to real scale against the same committed 200x50 sweep fixture and judged them on breakeven readability, categorical-state separation, dark-mode and screenshot-crop survival, and caveat placement. `form-1-dense-grid` lost for having no boundary mark at all, so breakeven has to be inferred from a colour step rather than read from a line. `form-3-small-multiples` lost because its 50 strip gaps break vertical continuity, so the breakeven boundary is not traceable as a shape across strips. `form-4-grid-with-contour` lost because it keeps the hard per-cell mosaic under its contour line, so the field reads as discrete samples rather than a continuous surface. No rejection reason cites implementation cost or a repaint figure. The owner accepted, with eyes open, that the winner is the most expensive of the four: measured on this dev sandbox (Linux aarch64 container, 9 logical cores, calibration score 0.58) at each form's own display geometry, form 2 measured 12.80ms normalized against the 16ms PERF-05 budget on the authoritative ubuntu-latest CI baseline, after an allocation fix cut it from an initially failing 23.92ms, versus 0.65ms (form 1), 0.69ms (form 3), and 0.98ms (form 4) for the other three. All four pass individually; this is not a ranking (D-12, F-02) | See `.planning/phases/06-heatmap-design-pass/06-HEATMAP-SPEC.md` for the full implementable treatment: palette stops, symlog domain, categorical cell rendering, legend structure, caveat copy, per-form geometry, and the O(display area) cost obligation the winning form creates for Phase 7's pan/zoom |
| PERF-03 D-17 baseline escalation (Phase 7): the zero-contribution default view fails the budget outright, and the `solveIrr` contribution-schedule branch fails it far worse; both are resolved by spending pool tuning first, with the coarser default grid held in reserve | The real D-17 baseline (GitHub Actions `ubuntu-latest`, 4 logical cores, calibration score 0.8150, CI run 32654061079, headSha `d81bc3501c1cd1e12c1b2f0e9eb86798f2ccc31b`, `source=production`) had never rendered a verdict for the production-pool sweep before this run, because the phase branch had no upstream and no PR (07-PERF-03-BASELINE.md section 1). Once it ran: the headline, zero-contribution figure -- the app's default view -- measured `measuredMs=952.40`, `normalizedMs=1168.59` against the 1000ms budget, **116.9% of budget, verdict=fail**, workerCount=3. This corrects an earlier framing in this phase's own planning that treated the default view as inside budget; it is not, on the real baseline. The same run's contribution-schedule (`solveIrr`) branch, sampled at `sampleCount=1` (informational, not a `MeasurementRow`), measured `measuredMs=7303.90`, `normalizedMs=8961.84`, roughly **8.96x over the same 1000ms budget** and roughly 7.67x worse than this run's own headline figure. Both figures carry `hardwareConcurrency=4` and are the D-17 baseline; this dev sandbox's own figures (`hardwareConcurrency=9`, informational, non-baseline) were 469.60ms/831.15ms (headline) and 2010.20ms/3557.88ms (`solveIrr`) on the same code, and 07-03-SUMMARY.md and 07-VERIFICATION.md separately recorded ~3453ms and 3351.07ms normalized on other 9-core sandboxes for the `solveIrr` branch -- all non-baseline figures agree the branch is several times over budget, and the D-17 figure is the largest of the group because it also carries this run's own headline slowdown. Confidence band: the contribution-schedule arm is `sampleCount=1`, and 07-PERF-03-BASELINE.md's own measurement-band info line (`normalize()` residual 6.36% relative over 13 recorded D-17 runs) puts roughly +/-13% (2 standard deviations) on any single normalized figure; even at the low end of that band both figures remain over budget. What was already tried: 07-03's log/exp hoist in `npv` (already shipped, unchanged by this row), and D-24's proposed Horner-loop reduction over `buildCashFlows`, checked and rejected because calendar gaps are irregular, so a Horner loop would compute a wrong answer rather than a slower one. Of D-20's three levers: WASM is spent and counterproductive (01-04 measured Rust at roughly 1.20x slower than JS on this recurrence, so it would make PERF-03 worse, not better); pool tuning is genuinely unspent, and this baseline measures at `workerCountForCores(4)=3` (`src/sweep/sweep-pool.ts`), so chunking, transfer discipline and partition shape have never been tuned against either branch's real per-cell cost profile; the coarser default grid is D-03's reserved lever, explicitly kept unspent there so PERF-03's headline figure keeps describing the fixed 200x50 default view rather than a configuration-dependent one. **Decision: spend pool tuning first, on both overruns together, and hold the coarser grid in reserve.** Pool tuning is spent first, not the coarser grid, because D-03 reserved the grid specifically to preserve headline-figure comparability across phases, and spending it now would forfeit that before pool tuning -- the actually-unspent lever -- has been tried. The two overruns plausibly share a root cause in worker-pool throughput on this 4-core baseline (`workerCount=3`, `hardwareConcurrency=4`); this is stated as an inference from the pool configuration, not a profiled finding, and is not to be read as measured. This resolves the escalation half of PERF-01a's rule: `thresholdMs` for PERF-03 is unchanged, `NOMINAL_REFERENCE_MS` is unchanged, D-19's lock holds on all eight budgets, and no calibration constant or run-level cap moved in response to this measurement. **PERF-03 is FAILED, not met**: the phase's third roadmap success criterion does not close on this record. Implementation is a follow-up phase's job: naming pool tuning here is a decision, not code, and its effect must be measured on the D-17 baseline before PERF-03 can be claimed met. Carried forward, unresolved: this same baseline run's own total bench-suite runtime (43,259ms) also exceeded `BENCH_TOTAL_RUNTIME_CAP_MS` (30,000ms), masked because the verdict-fail check in `assertRunInvariants` fires first; the follow-up performance work will encounter this and should not be surprised by it | See `.planning/phases/07-sweep-engine-and-the-heatmap/07-PERF-03-BASELINE.md` sections 2 and 3 for the full CI artifact transcriptions, environment blocks, and per-host figure table this row's numbers are copied from |

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
*Last updated: 2026-08-21 after Phase 5 (Attribution and the Credibility Surface) completed*
