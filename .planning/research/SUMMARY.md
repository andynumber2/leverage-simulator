# Project Research Summary

**Project:** Leverage Simulator
**Domain:** Browser-based, fully-static financial backtesting and visualization app (leveraged-ETF simulator)
**Researched:** 2026-08-16
**Confidence:** MEDIUM-HIGH overall (structural/architectural patterns and npm versions are HIGH confidence; several performance figures and cost-parameter specifics are explicitly flagged as napkin-math/estimates requiring real-hardware measurement, see Gaps)

## Executive Summary

This is a static, client-side financial backtesting tool with no backend: a build-time data compiler produces bundled binary time series, and a browser-side simulation kernel runs a well-defined leverage cost formula (`L*r - (L-1)*(short_rate+spread) - expense_ratio/252`) both as a single run and as a 10,000-cell sweep across entry date x leverage. The industry-standard formula is independently confirmed by testfol.io's own reverse-engineered engine, which means this project's differentiation must come from what it does with the formula, not the formula itself. Recommended stack: Solid.js + Vite + TypeScript, uPlot for line charts, a hand-rolled Canvas 2D renderer for the heatmap (no charting library handles 10k heatmap cells acceptably), a Web Worker pool over plain Float64Array JS (not WASM, at least for v1), and a custom binary ArrayBuffer format for bundled data, all deployed as static assets to Cloudflare Pages.

The recommended build order is strictly gated on correctness before UI, and UI before scale: data compiler, then kernel (buildable and testable against synthetic data before real data lands), then validation harness (hard gate, the credibility anchor), then metrics/attribution, then single-run UI, then URL state, then worker pool/sweep orchestrator, then heatmap, then export/presets. Critically, a demonstrable single backtest is reachable well before the worker pool and heatmap exist; the kernel runs directly on the main thread for one run, no worker needed until the sweep. The single hardest, least-precedented piece of the whole project is the entry-date x leverage heatmap: no surveyed tool does this exact axis pairing, and it warrants a dedicated design pass, not routine implementation.

Primary risks: (1) simulation-kernel correctness bugs (ruin handling, the 1x invariant, cumulative-vs-daily leverage, financing accrual convention) that would silently falsify every downstream number, so these must become unit tests before any UI work; (2) overfitting cost parameters to make the UPRO/TQQQ validation look right, which would launder curve-fitting as model correctness; (3) the extended-history tier (reaching 1929) necessarily depends on interpolated monthly rate/dividend data, a real accuracy limitation, not just a disclosure footnote; (4) the heatmap's dense, overlapping entry-date sweep can visually imply far more independent evidence than actually exists, which is a UI copy requirement, not just a methodology caveat.

## Key Findings

### Recommended Stack

TypeScript + Vite + Solid.js for the app shell (Solid chosen over React for its ~7KB runtime and no re-render cost layered on top of already-expensive canvas redraws; React remains a legitimate but heavier alternative). uPlot (canvas-based, ~45KB) for time-series line charts; it has no heatmap mark. The heatmap itself must be a hand-rolled Canvas 2D renderer: every general-purpose charting library tested (ECharts, Plotly, Observable Plot, even uPlot) either has no heatmap mark or degrades badly well under the 10,000-cell target; a direct fillRect/putImageData approach handles 10k cells in low-single-digit milliseconds. The compute engine is plain JS in a Web Worker pool over Float64Array, not WASM for v1: JIT-compiled typed-array JS is estimated (napkin math, not benchmarked) to land in the 150-600ms range for a full sweep once pooled across workers, and WASM's real advantage (SIMD) isn't worth a second toolchain until profiling on real hardware proves the JS path insufficient. Bundled data uses a raw ArrayBuffer with a custom header (zero-copy into typed arrays), not Arrow/Parquet/CSV. The bundle compiler CLI is Node/TypeScript, not Python, so the binary format's encoder and decoder share one language and one type definition. Vitest + fast-check for testing, including property-based invariants (1x identity, monotonicity, ruin never un-ruins, cost decomposition sums correctly). Deployment is Cloudflare Pages with vite-plugin-pwa/Workbox for offline support and content-hashed immutable caching for binary assets.

**Core technologies:**
- Solid.js — fine-grained reactivity, no VDOM cost layered on canvas redraws — MEDIUM confidence
- Vite + TypeScript — native Worker/WASM/binary-asset support, trivial static output — HIGH confidence (versions verified against npm registry)
- Web Worker pool over Float64Array (plain JS, not WASM for v1) — estimated adequate performance without a second toolchain — MEDIUM confidence, needs real-hardware measurement
- uPlot (line charts) + hand-rolled Canvas 2D (heatmap) — only combination that handles both dense line series and 10k heatmap cells acceptably — MEDIUM confidence
- Raw ArrayBuffer + custom header (bundled data format) — zero-copy, no schema overhead for a fixed internal format — MEDIUM-HIGH confidence

### Expected Features

testfol.io is the nearest direct competitor (synthetic leverage engine, same cost-formula family) and Portfolio Visualizer is the broadest incumbent but has no synthetic-leverage engine at all (real ETFs only, so it cannot show 3x S&P in 1929 or 2000, this project's biggest gap-fill relative to PV). PortfolioCharts' Heat Map is the closest visualization ancestor but uses start-year x holding-period axes, not entry-date x leverage; no tool does this project's exact axis pairing.

**Must have (table stakes):** equity curve with log-scale toggle, drawdown chart, 1x benchmark overlay, date-range selection, CSV export, methodology/provenance disclosure, metric summary panel (CAGR, IRR, max drawdown, volatility), permalink sharing.

**Should have (competitive differentiators, genuinely open, no surveyed competitor does these):**
- Cost attribution decomposition (vol drag / financing / expense ratio in $ and %) — testfol.io's engine contains all three terms internally but does not appear to expose the breakdown; this is the project's strongest, most defensible differentiator.
- In-app validation view (synthetic vs. real UPRO/TQQQ, tracking error shown to the user) — no competitor does this in-product; converts "trust us" into "check us."
- Explicit, always-visible data-provenance tiers (not a buried FAQ page) — differentiated and cheap relative to credibility payoff.
- Default-to-IRR when contributions are non-zero — both competitors compute IRR but neither leads with it.
- Named "canonical argument" presets tied to specific real internet claims (1929, TQQQ-since-2000 survivorship bias, the 2010s in isolation, high-rate-regime financing cost) — curation, not the permalink mechanism, is the differentiator.
- Entry-date x leverage heatmap itself — the central, hardest, least-precedented feature in the whole project.

**Defer (v2+):** second sweep mode (ship one first, validate legibility), iso-metric contour-line overlay on the heatmap, rolling-returns companion chart (cheap, add once sweep data exists), "optimal leverage" marker (annotation only, never a standalone solver — conflicts with the product's own thesis if presented as a recommendation).

**Confirmed anti-features:** Monte Carlo/bootstrapped forward simulation (reintroduces the exact model-dependent argument surface this tool exists to close; PV's own bootstrap is itself criticized in its community), multi-asset portfolio construction, standalone "best leverage" optimizer, tax modeling, live prices/accounts.

### Architecture Approach

A build-time Node/TypeScript data compiler (CSV ingest, calendar alignment, splice/interpolate, tier assembly, binary encode, manifest emit) produces /public/data/{manifest.json, calendar.bin, *.bin}, consumed at runtime by a purely client-side app with no backend. The single most important architectural rule: one kernel module, imported identically by the main-thread single-run path and by the worker pool for sweeps — forking the kernel per execution context is called out explicitly as the highest-cost anti-pattern available, since it could silently produce a synthetic-vs-real mismatch that's actually a code-duplication bug, not a math bug. The kernel is a pure, allocation-free, struct-of-arrays function (Float64Array in, Float64Array out) that computes every display metric per sweep cell in one pass; switching the heatmap's color metric must be a zero-recomputation display transform over a cached grid, never a new sweep. Worker data distribution uses one-time structured-clone copy (not SharedArrayBuffer — the COOP/COEP header tax isn't worth it at this data size), with generation-tagged cancellation for interactive slider-drag responsiveness, and transferable-object returns for zero-copy result handoff.

**Major components:**
1. Data compiler (Node-only, sibling to /src, never bundled to browser) — ingest, align, splice, tier, encode, manifest
2. Simulation kernel (kernel/simulate.ts, zero deps on DOM/workers/fetch) — the perf- and correctness-critical seam, callable identically from main thread or worker
3. Sweep orchestrator + worker pool — partition/cancel/memoize/stream, distinct from the kernel and the chart
4. Metrics + attribution layers (separate from the kernel, since IRR methodology and "which pieces to zero out" change independently of the hot loop)
5. Chart layer (uPlot for lines, hand-rolled canvas for the heatmap) + URL-state layer (the app's only "backend" — permalinks are the persistence layer)

**Explicitly avoid over-engineering:** a generic N-dimensional sweep abstraction (build for exactly two axes), a plugin system for cost models (there is one formula), Redux-style state management (a dozen scalars plus a cached grid), a generic binary container format for ~1MB of data.

### Critical Pitfalls

1. **Ruin clamp** — at high leverage, a bad enough single-day return drives the naive formula negative; without clamping the moment value crosses <=0, subsequent "gains" can flip the sign back positive and the position appears to un-ruin, which is nonsense since a real fund would be liquidated. Must clamp to exactly 0, flag ruin, and freeze the position; this needs an explicit unit test (forced -40% day at L=3, output exactly 0, ruin flag true, stays 0 regardless of subsequent input) before any sweep/visualization work begins, since the 1929-1932 and October 1987 sweeps will hit this path directly.
2. **1x invariant** — L=1 must reproduce the raw unlevered series exactly, bit-for-bit modulo floating point. A general-purpose formula that always subtracts expense ratio even at L=1 will fail this; the cost model must be structurally gated off at L=1, not just arithmetically reduced to a near-zero residual. This should be the very first automated test written.
3. **Calendar-day vs. trading-day financing accrual** — financing cost accrues on calendar days (weekends/holidays included), while price return only exists on trading days; naively applying rate/252 per trading-day row undercounts financing cost across weekends and holiday clusters. The financing term should scale by actual calendar days elapsed since the prior trading day, kept as a distinct convention from the expense-ratio term's day-count.
4. **Overfitting cost parameters to the validation target** — tuning spread/expense-ratio defaults purely to minimize UPRO/TQQQ tracking error, then presenting the tight fit as evidence the model is correct, is curve-fitting disguised as validation. Cost parameters must be sourced independently (published fund ER, a cited financing-spread estimate) before running validation, and any residual tracking error should be reported honestly, not tuned away.
5. **Cumulative-vs-daily leverage application** — computing final = initial * (1 + L*total_period_return) instead of compounding day-by-day is the exact naive model this project exists to correct; it is algebraically tempting and correct for a single day only. The kernel must never take a start/end price pair and a leverage scalar without touching the intermediate daily path.

## Implications for Roadmap

Architecture research maps directly onto candidate phases, with a hard dependency chain and identified parallelism.

### Phase 1: Data Compiler + Manifest
**Rationale:** Foundation — nothing downstream can be honestly built against fake data, and the binary/manifest shape must be frozen before the loader and kernel integrate against it.
**Delivers:** node compile-data producing per-symbol summary stats; manifest.json + .bin files committed.
**Addresses:** Bundled binary data assets, CLI compiler ("drop in a CSV, recompile") requirement.
**Avoids:** C1-C6 price-data traps (splits, dividend-adjustment retroactive rescaling, trading-calendar misalignment), B1-B4 rate-series seam pitfalls.

### Phase 2: Data Loader + Simulation Kernel
**Rationale:** The kernel has zero real dependency on real data — buildable and testable against a fixed-seed synthetic return series in parallel with the tail of Phase 1, then wired to the real loader once Phase 1 lands. A demonstrable single backtest is reachable here without any worker pool or heatmap.
**Delivers:** A script/minimal page that runs one real backtest end-to-end and logs the equity curve.
**Uses:** Solid.js/TypeScript/Vitest/fast-check from STACK.md.
**Implements:** The pure, allocation-free kernel/simulate.ts component from ARCHITECTURE.md.
**Avoids:** A1 (cumulative-vs-daily leverage), A7 (ruin boundary), A8 (calendar-day accrual), A10 (1x invariant), A11 (float precision) — all become unit tests written here, before UI work.

### Phase 3: Validation Harness (hard gate)
**Rationale:** This is the credibility anchor of the entire project — verify the kernel against real UPRO/TQQQ history before investing further UI effort on a model that might not track reality. Do not proceed to user-facing polish until this passes.
**Delivers:** Automated test asserting synthetic-3x tracks real UPRO within a documented tolerance; CI fails if it doesn't; a shared computeTrackingError() function used by the test, a CI data-change check, and later the in-app validation view.
**Depends on:** Phase 1 (real UPRO/TQQQ data) + Phase 2 (kernel).
**Avoids:** A9 (overfitting cost parameters to the validation target) — cost parameters must be sourced and documented before this phase runs, not adjusted afterward to tighten the fit.

### Phase 4: Metrics + Attribution Layer
**Rationale:** Independent of UI/workers; can run in parallel with Phase 3 once the kernel's output shape is stable.
**Delivers:** Unit tests against hand-computed small examples (known IRR, known drawdown, known cost decomposition).
**Addresses:** Cost attribution decomposition and outcome-metrics requirements from FEATURES.md.
**Avoids:** D3 (lump-sum vs. contribution conflation), D4 (IRR root-finder failure modes — needs a bounded/robust method and an explicit post-ruin contribution-behavior decision before implementation).

### Phase 5: Single-Run UI
**Rationale:** The first true user-facing product. A defensible single backtest with attribution is arguably the MVP even without the sweep; runs the kernel directly on the main thread (a single call is fast, no worker needed yet).
**Delivers:** Interactive page — pick symbol/leverage/dates, see equity curve + attribution breakdown.
**Addresses:** Table-stakes visualization requirements (log-scale equity curve, drawdown chart, 1x overlay, metric panel) and the cost-attribution differentiator.
**Avoids:** E6 (linear-scale equity curves mislead for compounding series — default to log y-axis), E4 (ruin must get distinct categorical treatment, not folded into a continuous scale).

### Phase 6: URL-State Layer
**Rationale:** Smaller state surface to get right before sweep-range params are added; permalinks work for the single-run view before sweep complexity lands.
**Delivers:** Reloading a shared URL reproduces the exact single-run view.
**Avoids:** G4 (permalink reproducibility failure — needs deterministic computation and bundle-version pinning in the URL from the start).

### Phase 7: Worker Pool + Sweep Orchestrator
**Rationale:** Don't build worker plumbing before there's a UI to drive it — no visible payoff and no way to validate cancellation/streaming UX until something exists to watch.
**Delivers:** A dev-only harness sweeping N cells and logging progressive results, no chart yet.
**Depends on:** Phase 2-4's kernel (stable/frozen), Phase 5 (somewhere to render into).
**Avoids:** F1-F4 (allocation inside hot loops, structured-clone stalls, blocking despite workers) — the real sweep-timing measurement that determines whether WASM is ever needed happens here, on real hardware, replacing the napkin-math estimates in STACK.md.

### Phase 8: Heatmap Chart + Sweep UI
**Rationale:** Depends on the orchestrator existing to stream into. This is the single most novel, least-precedented piece of design work in the entire project — no surveyed tool does this exact axis pairing — and warrants a dedicated design/sketch pass before implementation, not standard build-phase treatment.
**Delivers:** A 200x50 heatmap that paints progressively, a metric selector that re-colors without recompute, and a working sweep-mode toggle.
**Uses:** Hand-rolled Canvas 2D renderer (STACK.md Q2) — the actual hand-rolled Canvas heatmap performance at 10k cells should be measured directly during this phase, not assumed from the simpleheat-style estimate in STACK.md.
**Avoids:** E1-E3 (color-scale semantics, log color mapping, colorblind-safety), E5 (right-edge noise in hold-to-today mode), F5 (SVG-per-cell rendering), and critically D5 — the overlapping-window statistical caveat must be implemented as UI copy in this phase: never describe the sweep as "10,000 independent backtests"; any aggregate statistic across the sweep must be caveated adjacent to the number as describing overlapping, autocorrelated windows, not an independent sample.

### Phase 9: Export + Preset Scenarios
**Rationale:** Lowest risk, reads already-existing rendered/computed state.
**Delivers:** Downloadable PNG of the current chart, CSV of a run's daily series, a preset picker for canonical scenarios (1929, TQQQ-since-2000, the 2010s in isolation, high-rate-regime financing).
**Addresses:** Sharing requirements and the named-preset differentiator.
**Avoids:** D2 (cherry-picked windows — presets must ship as a set including the hard windows, not just the flattering ones).

### Phase Ordering Rationale

- Strictly sequential dependency chain: 1 -> 2 -> 3 (hard gate) -> 5 -> 6/7 -> 8 -> 9. Phase 3 is a hard gate: do not ship Phase 5 as "done," and do not proceed to sweep/heatmap work, on a kernel that hasn't been checked against real leveraged-ETF history.
- Parallelizable: Phase 1 (compiler) and early Phase 2 (kernel against synthetic data) can run as separate sessions, integrating once both land. Phase 3 (validation harness) and Phase 4 (metrics/attribution) both depend only on Phase 2's kernel, not on each other — genuinely independent. Phase 6 (URL state) and early Phase 7 scaffolding have bounded parallelism. Phase 9 (export) and the tail of Phase 8 don't block each other.
- A demonstrable single backtest is reachable at Phase 5, well before the worker pool (Phase 7) or heatmap (Phase 8) exist. This is a meaningful milestone worth treating as its own demo/checkpoint in the roadmap, not folded silently into a larger "build the app" phase.
- The heatmap is deliberately sequenced last among the core features (Phase 8) because it depends on both the orchestrator (Phase 7) existing to stream into and the single-run view (Phase 5) existing to drill into; it is a navigation surface over a single-run view, not a self-contained visualization.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Simulation Kernel):** The correctness checklist in PITFALLS.md Section A is extensive (12 named pitfalls) and should be treated as a literal pre-implementation test list, not a generic "write some tests" note — flag for --research-phase or at minimum a dedicated planning pass that walks A1-A12 explicitly.
- **Phase 7 (Worker Pool + Sweep Orchestrator):** STACK.md's Q1 performance figures (150-600ms sweep time) are explicitly stated as unbenchmarked napkin math, not a citation. This phase needs a performance.now() measurement pass on real hardware before any WASM decision is made — treat as open, not settled.
- **Phase 8 (Heatmap Chart + Sweep UI):** This is the project's central, least-precedented design problem — no existing tool does entry-date x leverage on two axes. Recommend a dedicated gsd-sketch or design-exploration pass before committing to layout, separate from and prior to standard phase planning. Also needs real-hardware measurement of the hand-rolled Canvas heatmap at 10k cells (STACK.md flags this as MEDIUM confidence, estimated from similar-sized implementations, not this exact workload).
- **Phase 1 (Data Compiler):** Data-source verification (exact first-available-row dates for Yahoo ^GSPC/^SP500TR, FRED observation_start fields) should be re-verified directly against live sources at implementation time — PITFALLS.md and STACK.md both flag these as secondary-sourced, not independently re-checked in this research pass.

Phases with standard patterns (skip research-phase):
- **Phase 4 (Metrics + Attribution):** IRR/CAGR conventions, drawdown, and cost-decomposition arithmetic are well-established financial-calculation patterns, cross-verified against direct competitor precedent (testfol.io, Portfolio Visualizer).
- **Phase 6 (URL-State Layer):** Query-string encode/decode is a mature, well-documented pattern (ARCHITECTURE.md provides a concrete param schema already).
- **Phase 9 (Export + Presets):** Canvas-to-blob PNG export and CSV serialization are standard browser APIs with no architectural novelty; preset curation is a content/labeling task, not an engineering one.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | npm versions HIGH (verified against registry directly); performance figures (Worker-pool sweep timing, Canvas heatmap at 10k cells) are explicitly stated napkin-math estimates, not benchmarks — must be re-measured on real hardware before finalizing the WASM decision |
| Features | MEDIUM-HIGH | Vendor methodology pages returned HTTP 403 on direct fetch for both testfol.io and Portfolio Visualizer; findings are cross-verified across multiple independent secondary sources (reverse-engineering writeups, forum threads, academic papers) rather than primary vendor docs, but corroboration across independent sources is consistent |
| Architecture | HIGH | Structural patterns (Web Workers, typed arrays, static-site data bundling, URL-as-state) are mature, widely-documented web-platform techniques; specific numeric tolerances for the validation harness are MEDIUM (starting points, not sourced constants) |
| Pitfalls | MEDIUM-HIGH | Rate-series and dataset dates verified against FRED/official pages directly; cost-structure and methodology claims cross-checked across multiple independent sources; a few figures (exact swap financing spreads) are industry-estimated, explicitly flagged LOW where that applies |

**Overall confidence:** MEDIUM-HIGH. The architectural and correctness-checklist findings (the load-bearing content for early phases) are HIGH confidence. The performance and design-novelty findings (relevant to later phases, Phase 7-8) are explicitly flagged as requiring real-world validation rather than being settled by this research pass — a deliberate, stated gap in the source research, not an oversight in synthesis.

### Gaps to Address

- **Sweep-engine real-hardware timing is unmeasured.** STACK.md's 150-600ms Worker-pool estimate and the 0.5-2 GFLOPS JIT throughput assumption underlying it are napkin math from throughput assumptions, not a benchmark against this exact workload. Address by writing a performance.now() profiling pass at the start of Phase 7, before any WASM tooling investment; keep the runSweep() interface seam so WASM can be dropped in later without touching UI/chart code if profiling proves the JS path insufficient.
- **Hand-rolled Canvas heatmap performance at 10,000 cells is inferred from similar-sized implementations (simpleheat), not measured for this project's exact grid/pan/zoom/theme-toggle interaction pattern.** Address during Phase 8 planning with a throwaway spike before committing to the full interaction design.
- **The extended-history tier's interpolation of monthly rate/dividend data to daily is a real accuracy limitation for volatility drag specifically, not just a disclosure requirement.** PITFALLS.md C4 states a flat-within-month interpolated series will understate volatility drag for 1929-1954-era extended-tier runs — this needs to be stated as a directional bias in the methodology copy, not just "this data is interpolated." Address in Phase 1 (data provenance/tier design) and revisit in the credibility-pass phase (G1-G4 in PITFALLS.md).
- **Exact FRED series start dates (DFF 1954-07-01, DTB3 1954-01-04, TB3MS 1934-01-01) and Shiller monthly coverage (from January 1871, CAPE from January 1881) are verified via web search against series pages, not a direct FRED API pull.** Address by confirming observation_start directly against the live FRED API during Phase 1 implementation, since FRED occasionally backfills series.
- **Overfitting risk in cost-parameter selection (A9) requires a product/process decision, not just a technical one** — the rule ("source parameters independently, before validation, and report residual honestly") needs to be written into the Phase 3 spec explicitly before implementation starts, not discovered after the first validation run looks suspiciously clean.
- **No template exists anywhere in the surveyed landscape for the entry-date x leverage heatmap.** This is a gap in prior art, not a gap in this research — Phase 8 should budget real design iteration time (a dedicated sketch/exploration pass) rather than treating the heatmap as ordinary chart-implementation work.

## Sources

### Primary (HIGH confidence)
- npm registry (registry.npmjs.org) — all package version numbers in STACK.md
- FRED series pages (fred.stlouisfed.org) — DFF, DTB3, TB3MS start dates
- Cloudflare Pages/Workers official docs — asset size limits, _headers mechanics, COOP/COEP requirements
- PortfolioCharts Heat Map and Retirement Spending charts — fetched directly, axis layout and color scale taken from vendor's own content
- Avellaneda & Zhang, "Path-Dependence of Leveraged ETF Returns" (SIAM J. Financial Math, 2009/2010) — peer-reviewed academic source
- Robert Shiller online dataset (ie_data.xls) — monthly coverage from January 1871, CAPE from January 1881
- MDN — typed arrays, structured clone/transfer semantics
- PROJECT.md (this repository) — authoritative source for the specific cost model, validation targets, and scope boundaries

### Secondary (MEDIUM confidence)
- testfol.io engine formula — reverse-engineered via third-party documentation (Testfol-MarginStresser GitHub docs), not testfol.io's own methodology page (403'd on direct fetch); corroborated across at least two independent sources
- Portfolio Visualizer feature set — sourced from secondary descriptions and Bogleheads forum discussion; vendor FAQ page 403'd on direct fetch
- SciChart.js benchmark write-up ("Performance Comparison of JavaScript Chart Libraries in 2026") — ECharts/Highcharts heatmap degradation figures, single-source benchmark
- Double-Digit Numerics (ddnum.com) — the decay-approximation formula
- "Compounding Effects in Leveraged ETFs: Beyond the Volatility Drag Paradigm," arXiv:2504.20116 (2025) — preprint, not yet peer-reviewed at time of research
- General floating-point compression literature (Lindstrom/Isenburg-class papers, ClickHouse writeup) — gzip-on-float64 weakness

### Tertiary (LOW confidence, needs validation)
- Plotly.js GitHub issue tracker and community forum threads on heatmap performance — community-reported, not vendor-benchmarked
- WebGPU browser-support tracking write-ups — aggregated from secondary sources rather than caniuse.com directly; re-verify at implementation time given fast-moving compatibility surface
- Swap financing spread magnitude — no single authoritative public itemization exists; treated as industry-estimated throughout PITFALLS.md
- Worker-pool sweep timing (150-600ms) and Canvas heatmap-at-10k-cells performance — stated estimates from throughput assumptions and similarly-scaled implementations, not benchmarks against this exact workload; must be measured on real hardware during Phase 7/8

---
*Research completed: 2026-08-16*
*Ready for roadmap: yes*
