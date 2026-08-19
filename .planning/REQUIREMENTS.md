# Requirements: Leverage Simulator

**Defined:** 2026-08-16
**Core Value:** Given a symbol, a leverage level, an entry point, and a contribution schedule, produce a defensible outcome and show which mechanism consumed the money, in a form that can be pasted into an argument.

## v1 Requirements

### Performance

Performance is a hard product requirement, not a polish item. The tool competes with a
spreadsheet on rigor and with nothing at all on convenience; a sluggish version of it does not
get used and therefore does not settle anything. Every budget below is a build-failing gate,
measured in CI, not an aspiration.

- [x] **PERF-01**: A performance budget file defines numeric thresholds for every metric in
      PERF-02 through PERF-09, and CI fails the build when a measured value exceeds its budget

- [x] **PERF-01a**: The thresholds below are **provisional**. The performance spike measures what
      is actually achievable and the budgets are then locked. Locking rule, so that "measure first"
      cannot decay into "the budget is whatever we happened to hit": each budget is anchored to a
      human-perception threshold (16ms = one frame, 100ms = feels instant, 1s = holds attention),
      and if the spike shows a target is unreachable with the recommended architecture, that is an
      **architecture escalation** (Worker pool tuning, WASM, WebGPU, coarser default grid) to be
      decided deliberately, not an automatic budget relaxation. Any budget ultimately set looser
      than its perception anchor is recorded as a Key Decision with the reason

- [x] **PERF-02**: A single backtest over the full daily history (~25,000 bars) completes in
      under 16ms, so single-run parameter changes update within one frame

- [ ] **PERF-03**: A full sweep (10,000 cells) completes in under 1000ms on a 4-core baseline
      machine, measured wall-clock from user action to final cell

- [ ] **PERF-04**: A sweep paints its first partial results within 100ms and repaints
      progressively as cells complete, so the user never faces a blank pane with a spinner

- [ ] **PERF-05**: Changing the heatmap's displayed metric re-colors the cached grid in under
      16ms and never triggers a re-sweep

- [ ] **PERF-06**: An in-flight sweep is cancelled within one frame when the user changes a
      parameter, and superseded results are discarded rather than painted

- [ ] **PERF-07**: No main-thread task exceeds 50ms during any interaction, verified by long-task
      measurement. Dragging a slider sustains 60fps

- [ ] **PERF-08**: Cold load reaches interactive in under 1500ms and completes data load and
      decode in under 1000ms on a typical broadband connection; warm load is under 300ms

- [ ] **PERF-09**: Heatmap pan and zoom sustain 60fps at full cell count
- [x] **PERF-10**: A benchmark suite runnable locally with one command reports all of the above,
      so performance is checkable at any point during development rather than only in CI

- [x] **PERF-11**: Performance is measured on real hardware from the first executable phase
      onward, not deferred to an optimization pass. The build order places measurement before
      architecture commitment

### Data Pipeline

- [x] **DATA-01**: A CLI bundle compiler in the repo ingests raw CSVs and emits versioned binary
      data assets plus a JSON manifest, so adding a symbol is "drop in a CSV, recompile, redeploy"

- [x] **DATA-02**: The compiler aligns trading calendars across symbols and the rate series, and
      fails loudly on misalignment rather than silently forward-filling

- [x] **DATA-03**: The compiler emits, per symbol, both a price-return and a total-return series
- [x] **DATA-04**: The compiler emits a daily short-rate series covering the full date range of
      each history tier

- [x] **DATA-05**: The compiler emits two history tiers per symbol where data allows: **strict**
      (every input genuinely daily) and **extended** (deep history, with monthly rate and
      dividend data interpolated to daily)

- [x] **DATA-06**: The compiler emits machine-readable provenance for every series: source, date
      range, and the exact date of every splice or interpolation seam. The UI generates its tier
      labels from this data, so labels cannot drift from the data they describe

- [x] **DATA-07**: The bundled universe includes S&P 500 (daily to 1928), Nasdaq-100/QQQ, the
      real leveraged ETFs UPRO, TQQQ, SSO and QLD, and VTI, EFA, EEM and TLT

- [x] **DATA-08**: The app loads and decodes bundled assets directly into typed arrays with no
      per-row parsing, and works fully offline after first load

- [x] **DATA-09**: Data assets are content-versioned so a redeploy cannot serve a stale cached
      bundle alongside a new manifest

### Simulation Kernel

- [x] **SIM-01**: User can simulate daily-rebalanced leverage at an arbitrary positive multiple,
      including fractional values, across at least 1x to 20x

- [x] **SIM-02**: Leverage is applied to daily returns and compounded, never to cumulative returns
- [x] **SIM-03**: Financing cost on the borrowed `(L-1)` portion and the expense ratio both accrue
      on **calendar days elapsed since the prior trading day**, so weekends and holidays are
      charged. Day-count conventions are documented in the code and surfaced in the methodology

- [x] **SIM-04**: 1x reproduces the unlevered series exactly, enforced as a test invariant
- [x] **SIM-05**: A position that reaches zero is clamped at zero and flagged as ruined. It never
      goes negative and never recovers, and downstream metrics treat ruin as an absorbing state
      rather than an extreme value

- [x] **SIM-06**: User can set an initial investment amount and a recurring contribution amount at
      daily, monthly, quarterly, or yearly frequency

- [x] **SIM-07**: User can toggle dividend reinvestment, which switches between the bundled
      total-return and price-return series rather than modelling dividends

- [x] **SIM-08**: User can set the entry date and either a fixed holding period or hold-to-today
- [x] **SIM-09**: Expense ratio and financing spread are user-editable, defaulting to values
      sourced independently from real products and documented as estimates

- [x] **SIM-10**: The kernel is one module, imported unchanged by both the single-run path and the
      sweep worker path. There is no second implementation to drift

- [x] **SIM-11**: The kernel's hot loop performs no allocation and writes into preallocated
      buffers, so 10,000 invocations produce no GC pressure

- [x] **SIM-12**: The correctness checklist from research (ruin clamp, 1x invariant, daily-vs-
      cumulative leverage, calendar-day accrual, and the remainder of PITFALLS.md section A) exists
      as unit tests before any UI work begins

### Validation

- [x] **VALID-01**: Synthetic 3x S&P 500 is compared against real UPRO price history from 2009,
      and synthetic 3x Nasdaq-100 against real TQQQ, with tracking error computed by a single
      shared function

- [x] **VALID-02**: A documented tracking-error tolerance is defined and enforced as a test that
      fails the build when exceeded

- [x] **VALID-03**: Cost parameters are sourced independently and are never tuned to reduce
      validation tracking error. Residual error is reported, not fitted away. This constraint is
      written into the validation phase spec

- [ ] **VALID-04**: The validation comparison is visible in the app, not only in tests, so a
      skeptical reader can check the model against reality without running code

### Metrics

- [x] **METR-01**: IRR (money-weighted return) is computed and is the default annualized metric
      whenever contributions are non-zero

- [x] **METR-02**: CAGR is available but is suppressed or explicitly qualified when a contribution
      schedule makes it misleading

- [x] **METR-03**: Maximum drawdown is computed and reported
- [x] **METR-04**: Final value as a multiple of total contributed is computed and reported
- [x] **METR-05**: A ruin flag is computed and reported, and is presented as a categorical outcome
      distinct from a merely bad numeric result

- [ ] **METR-06**: A sweep computes all display metrics per cell in a single pass, so switching the
      displayed metric is a re-color rather than a re-run

### Attribution

- [ ] **ATTR-01**: For any single run, the gap between the naive `L*r` result and the actual result
      is decomposed into volatility drag, financing cost, and expense ratio

- [ ] **ATTR-02**: The decomposition is reported in both dollar and percentage terms, and the
      components reconcile to the total gap without an unexplained residual

- [ ] **ATTR-03**: A zero-cost comparison mode shows the naive result alongside the real one, so a
      user's own assumption can be displayed next to what actually happens

### Visualization

- [ ] **VIZ-01**: Fixed leverage, sweep entry date: a chart showing how outcome varies by when you
      started

- [ ] **VIZ-02**: Fixed entry date, sweep leverage: a chart showing how outcome varies by how much
      leverage you took

- [ ] **VIZ-03**: A 2D heatmap over entry date and leverage, colored by the selected outcome metric
- [ ] **VIZ-04**: A sweep-mode toggle between fixed holding period and hold-to-today, with the
      chart stating which mode produced it

- [ ] **VIZ-05**: The heatmap design is validated against throwaway mockups before implementation,
      since no existing tool pairs these axes and there is no pattern to copy

- [ ] **VIZ-06**: Ruined cells are rendered categorically distinct from the continuous color
      scale, never as merely the darkest end of it

- [ ] **VIZ-07**: Color scales are perceptually uniform and colorblind-safe, and outcomes spanning
      orders of magnitude use a log or otherwise non-linear mapping rather than linear color

- [x] **VIZ-08**: Equity curves offer a log scale, and the choice of scale is visible
- [ ] **VIZ-09**: In hold-to-today mode, the short-horizon artifact at the recent edge is visually
      marked, so the right side of the chart is not read as comparable to the left

- [ ] **VIZ-10**: The heatmap carries visible copy stating that entry windows overlap and that the
      grid is a sensitivity analysis over one shared history, not thousands of independent trials

- [ ] **VIZ-11**: Charts are legible in both light and dark

### Credibility

- [ ] **CRED-01**: The active history tier, its date range, its sources, and its seam dates are
      visible in the UI at all times, generated from manifest provenance

- [ ] **CRED-02**: The extended tier carries a prominent warning naming the **direction** of its
      bias: interpolated monthly data smooths daily volatility and therefore understates
      volatility drag, making leverage look better than it was in that era

- [ ] **CRED-03**: The magnitude of that understatement is quantified, by downsampling a known-good
      daily era to monthly, interpolating it back, and measuring the resulting gap. The figure is
      reported alongside the warning

- [ ] **CRED-04**: A methodology page states the full cost model, day-count conventions, data
      sources, and known limitations, and is reachable from any result

- [ ] **CRED-05**: Default parameter values are shown as defaults and are editable, so no result
      can be dismissed as depending on hidden assumptions

### Sharing and Export

- [ ] **SHARE-01**: Every parameter is encoded in the URL as readable query params, so a pasted
      link reproduces the exact run

- [ ] **SHARE-02**: The URL carries a data-bundle version, and a permalink created against an older
      bundle either reproduces faithfully or states clearly that the data has changed

- [ ] **SHARE-03**: Permalink reproducibility is enforced by a determinism test
- [ ] **SHARE-04**: User can export the current chart as a PNG
- [ ] **SHARE-05**: User can export a run's underlying daily series as CSV, so the math can be
      checked independently

- [ ] **SHARE-06**: Named preset scenarios cover the canonical arguments, each one click from the
      landing state and each a shareable permalink

### Application Shell

- [ ] **APP-01**: User can select a symbol from the bundled universe
- [ ] **APP-02**: User can select the history tier, with each tier's meaning stated on screen
- [x] **APP-03**: The app is a fully static build deployable to Cloudflare Pages with no backend,
      no database, and no runtime external API calls

- [ ] **APP-04**: Invalid or impossible parameter combinations are prevented or explained, not
      silently coerced

## v2 Requirements

### Data

- **DATA-V2-01**: In-browser CSV upload to simulate an unbundled symbol without a rebuild
- **DATA-V2-02**: Expanded symbol universe (sectors, factors, individual equities)
- **DATA-V2-03**: Non-US rate series for simulating leverage in other currencies

### Simulation

- **SIM-V2-01**: Rebalancing frequencies other than daily, for comparison against the daily case
- **SIM-V2-02**: Margin-call and forced-liquidation modelling, distinct from the simple ruin clamp
- **SIM-V2-03**: Path-dependency decomposition beyond the three-way attribution

### Visualization

- **VIZ-V2-01**: Iso-metric contour overlay on the heatmap, in the manner of a pork chop plot
- **VIZ-V2-02**: Side-by-side comparison of two parameter sets in one view
- **VIZ-V2-03**: Animated walk-forward playback of an equity curve

## Out of Scope

| Feature | Reason |
|---------|--------|
| Arbitrary live ticker lookup | Bundled-only is deliberate. Vendor data revisions would silently change past conclusions, which is fatal for a dispute-settling tool. The bundle compiler is the escape hatch |
| D1 or any backend database | Dataset is ~1MB as binary assets, and the sweep cannot run server-side at all given Worker CPU limits. A backend adds latency and moving parts for no gain |
| Monte Carlo / bootstrapped returns | The argument is about what actually happened. Synthetic paths invite "your simulation is wrong" and settle nothing |
| Optimal-leverage solver | Producing a single number is exactly the oversimplification the heatmap exists to prevent |
| Multi-asset portfolios, rebalancing across assets | Single-symbol leverage is the argument being settled. Broadening dilutes it |
| Tax modelling | Jurisdiction-dependent, unfalsifiable, and orthogonal to whether leverage compounds |
| Intraday or minute-level data | Real leveraged ETFs rebalance daily. Finer granularity adds volume without changing a conclusion |
| Trading, brokerage integration, live prices | This is an analysis tool, not something that touches money |
| User accounts, server-side persistence | Permalinks carry all state |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PERF-01 | Phase 1 | Complete |
| PERF-01a | Phase 1 | Complete |
| PERF-02 | Phase 3 | Complete |
| PERF-03 | Phase 7 | Pending |
| PERF-04 | Phase 7 | Pending |
| PERF-05 | Phase 7 | Pending |
| PERF-06 | Phase 7 | Pending |
| PERF-07 | Phase 4 | Pending |
| PERF-08 | Phase 4 | Pending |
| PERF-09 | Phase 7 | Pending |
| PERF-10 | Phase 1 | Complete |
| PERF-11 | Phase 1 | Complete |
| DATA-01 | Phase 2 | Complete |
| DATA-02 | Phase 2 | Complete |
| DATA-03 | Phase 2 | Complete |
| DATA-04 | Phase 2 | Complete |
| DATA-05 | Phase 2 | Complete |
| DATA-06 | Phase 2 | Complete |
| DATA-07 | Phase 2 | Complete |
| DATA-08 | Phase 4 | Complete |
| DATA-09 | Phase 2 | Complete |
| SIM-01 | Phase 3 | Complete |
| SIM-02 | Phase 3 | Complete |
| SIM-03 | Phase 3 | Complete |
| SIM-04 | Phase 3 | Complete |
| SIM-05 | Phase 3 | Complete |
| SIM-06 | Phase 3 | Complete |
| SIM-07 | Phase 3 | Complete |
| SIM-08 | Phase 3 | Complete |
| SIM-09 | Phase 3 | Complete |
| SIM-10 | Phase 3 | Complete |
| SIM-11 | Phase 3 | Complete |
| SIM-12 | Phase 3 | Complete |
| VALID-01 | Phase 3 | Complete |
| VALID-02 | Phase 3 | Complete |
| VALID-03 | Phase 3 | Complete |
| VALID-04 | Phase 5 | Pending |
| METR-01 | Phase 4 | Complete |
| METR-02 | Phase 4 | Complete |
| METR-03 | Phase 4 | Complete |
| METR-04 | Phase 4 | Complete |
| METR-05 | Phase 4 | Complete |
| METR-06 | Phase 7 | Pending |
| ATTR-01 | Phase 5 | Pending |
| ATTR-02 | Phase 5 | Pending |
| ATTR-03 | Phase 5 | Pending |
| VIZ-01 | Phase 7 | Pending |
| VIZ-02 | Phase 7 | Pending |
| VIZ-03 | Phase 7 | Pending |
| VIZ-04 | Phase 7 | Pending |
| VIZ-05 | Phase 6 | Pending |
| VIZ-06 | Phase 7 | Pending |
| VIZ-07 | Phase 6 | Pending |
| VIZ-08 | Phase 4 | Complete |
| VIZ-09 | Phase 7 | Pending |
| VIZ-10 | Phase 6 | Pending |
| VIZ-11 | Phase 4 | Pending |
| CRED-01 | Phase 5 | Pending |
| CRED-02 | Phase 5 | Pending |
| CRED-03 | Phase 5 | Pending |
| CRED-04 | Phase 5 | Pending |
| CRED-05 | Phase 5 | Pending |
| SHARE-01 | Phase 4 | Pending |
| SHARE-02 | Phase 4 | Pending |
| SHARE-03 | Phase 4 | Pending |
| SHARE-04 | Phase 8 | Pending |
| SHARE-05 | Phase 8 | Pending |
| SHARE-06 | Phase 8 | Pending |
| APP-01 | Phase 4 | Pending |
| APP-02 | Phase 5 | Pending |
| APP-03 | Phase 4 | Complete |
| APP-04 | Phase 4 | Pending |

**Coverage:**

- v1 requirements: 72 total
- Mapped to phases: 72
- Unmapped: 0

**Per-phase counts:**

| Phase | Name | Requirements |
|-------|------|--------------|
| 1 | Performance Spike and Budget Lock | 4 |
| 2 | Compiled Data Bundle | 8 |
| 3 | Simulation Kernel and the UPRO/TQQQ Gate | 16 |
| 4 | First Defensible Backtest in the Browser | 16 |
| 5 | Attribution and the Credibility Surface | 10 |
| 6 | Heatmap Design Pass | 3 |
| 7 | Sweep Engine and the Heatmap | 12 |
| 8 | Export and the Canonical Arguments | 3 |

---
*Requirements defined: 2026-08-16*
*Last updated: 2026-08-16 after roadmap creation*
