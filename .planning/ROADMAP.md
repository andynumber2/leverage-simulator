# Roadmap: Leverage Simulator

## Overview

The project starts by measuring, not building: research left the sweep timing and the Canvas
heatmap figures as explicit napkin math, and the whole architecture (WASM or plain JS, hand-rolled
canvas or a library) hangs off those numbers. Phase 1 gets them on real hardware and locks the
performance budgets against human-perception anchors, so every later phase has a gate to measure
against rather than a vague aspiration. Phase 2 compiles the real data bundle, because nothing
about a dispute-settling tool can be honestly built on fake series. Phase 3 writes the simulation
kernel and immediately puts it on trial against real UPRO and TQQQ history: if synthetic 3x does
not track the real product, nothing downstream carries weight, so this gate closes before any UI
exists. Phases 4 and 5 turn that kernel into the actual product in two vertical slices, first a
defensible single backtest a user can paste as a link, then the attribution breakdown and the
credibility surface that name which mechanism ate the money and let a skeptic check every
assumption. Phase 6 is a dedicated design pass on the entry-date x leverage heatmap, which no
surveyed tool has ever built, so the treatment is argued from throwaway mockups before anything is
implemented against it. Phase 7 builds the worker pool, the sweep orchestrator and the heatmap
itself against that chosen treatment and against Phase 1's budgets. Phase 8 gets results out of
the app as pictures, raw numbers and curated permalinks for the canonical arguments.

There is no optimization phase. Performance is measured in every phase that touches the compute or
render path, starting with the first one.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Performance Spike and Budget Lock** - Measure the hot loop and the 10k-cell repaint on real hardware, then commit the architecture and the budgets (completed 2026-08-17)
- [x] **Phase 2: Compiled Data Bundle** - A CLI compiler turns raw CSVs into versioned binary assets with machine-readable provenance (completed 2026-08-17)
- [x] **Phase 3: Simulation Kernel and the UPRO/TQQQ Gate** - The cost model, proven against real leveraged-ETF history before any UI is built on it (completed 2026-08-18)
- [x] **Phase 4: First Defensible Backtest in the Browser** - A real single run, in the browser, that can be pasted as a link (completed 2026-08-20)
- [x] **Phase 5: Attribution and the Credibility Surface** - Name which mechanism consumed the money, and let a skeptic check every assumption (completed 2026-08-21)
- [ ] **Phase 6: Heatmap Design Pass** - Argue the entry-date x leverage treatment from throwaway mockups, since there is no prior art to copy
- [ ] **Phase 7: Sweep Engine and the Heatmap** - 10,000 backtests fanned across workers and painted progressively without stalling the UI
- [ ] **Phase 8: Export and the Canonical Arguments** - Get the result out of the app as a picture, a CSV, or a curated permalink

## Phase Details

### Phase 1: Performance Spike and Budget Lock

**Goal**: The architecture is decided by a measured number instead of an estimate, and performance becomes checkable with one command from this point forward
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: PERF-01, PERF-01a, PERF-10, PERF-11
**Success Criteria** (what must be TRUE):

  1. A throwaway benchmark reports wall-clock figures measured on real hardware for the two things research left as napkin math: 10,000 leveraged backtests over ~25,000 synthetic bars, and a Canvas 2D repaint of a 10,000-cell grid. Both are numbers with a machine and core count attached, not estimates.
  2. The plain-JS-versus-WASM decision and the hand-rolled-Canvas-versus-charting-library decision are each recorded in PROJECT.md as a Key Decision citing the measured figure that settled it.
  3. One command (`npm run bench`) prints every metric named in PERF-02 through PERF-09, marking not-yet-built paths as unmeasured rather than silently omitting them, so performance is checkable at any point during development.
  4. The budget file carries a numeric threshold for each of PERF-02 through PERF-09, each annotated with its perception anchor (16ms = one frame, 100ms = feels instant, 1s = holds attention). Any threshold set looser than its anchor carries a written reason and an accompanying Key Decision, and an unreachable target is escalated as an architecture change rather than relaxed automatically.
  5. A deliberately regressed commit fails CI on a budget breach, proving the gate is live rather than declared.

**Plans:** 6/6 plans complete

Plans:
**Wave 1**

- [x] 01-01-PLAN.md: Tracer. `npm run bench` measures a real 10,000-cell Canvas repaint in headless Chromium, gates it against the locked typed budget file, and CI proves the gate goes red

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md: JS compute arm. Seeded 25,000-bar series, branchy per-bar recurrence (PERF-02), and a real Worker-pool sweep of 10,000 cells (PERF-03)
- [x] 01-03-PLAN.md: Canvas arms. `fillRect`-per-cell versus a single `putImageData` pass on the same grid, with a paint-equivalence proof before either timing is trusted

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-04-PLAN.md: Throwaway Rust WASM microbenchmark, SPIKE-RESULTS record, and the two architecture Key Decisions citing their measured figures

**Wave 4** *(gap closure, blocked on Wave 3 completion)*

- [x] 01-05-PLAN.md: Gap 1. A run-level verdict backstop in `assertRunInvariants`, one shared budget comparison, and a self-test that spawns a real harness command against a deliberately over-budget fixture and asserts a non-zero exit (D-09)

**Wave 5** *(gap closure, blocked on Wave 4 completion)*

- [x] 01-06-PLAN.md: Gap 2. Enforce the declared `MIN_MEASUREMENT_MS` timer floor, amortize every sub-floor call site through a batched loop in the same slice, bound the worker failure path, and record the resolved figures

### Phase 2: Compiled Data Bundle

**Goal**: Every number the app will ever show traces back to a real, dated, sourced series, and adding a symbol is a CSV drop plus a recompile
**Mode:** mvp
**Depends on**: Phase 1 (the spike's decode-cost and memory figures constrain the binary format)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-07, DATA-09
**Success Criteria** (what must be TRUE):

  1. `compile-data ./raw ./public/data` turns a directory of raw CSVs into versioned binary assets plus a JSON manifest, and adding a new symbol requires dropping in its CSV and recompiling, with no code change.
  2. The compiler refuses to emit when a symbol's trading calendar disagrees with the rate series, naming the offending dates, rather than forward-filling the gap silently.
  3. The manifest carries, per series, its source, its date range and the exact date of every splice or interpolation seam, and the strict and extended tier ranges are computed from those seam records rather than hand-declared, so a UI label cannot drift from the data it describes.
  4. The bundled universe covers S&P 500 daily to 1928, Nasdaq-100/QQQ, the real leveraged ETFs UPRO, TQQQ, SSO and QLD, and VTI, EFA, EEM and TLT, each with both a price-return and a total-return series, plus a daily short-rate series spanning the full range of every tier.
  5. The benchmark command reports the compiled bundle's total byte size and its decode-to-typed-array time, and the decode figure fits inside PERF-08's 1000ms data-load budget. A round-trip test asserts the decoded arrays match the compiler's in-memory series exactly, and content-hashed asset filenames make it impossible for a redeploy to serve a stale cached bundle alongside a new manifest.

**Plans:** 8/8 plans complete

*Plans 02-06 through 02-08 were added on 2026-08-17 after the source-stack reversal recorded in `02-CONTEXT.md`. They produce the `raw/` tree that 02-04 and 02-05 consume, so they run before both. 02-04 moved from wave 3 to wave 5 and 02-05 from wave 4 to wave 6.*

Plans:
**Wave 1**

- [x] 02-01-PLAN.md: Tracer. One symbol compiles end to end, from CSV plus sidecar through a content-hashed binary asset and a deterministic manifest, and decodes back to exactly the numbers it came from

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02-PLAN.md: Calendar agreement. A price-series gap aborts naming the dates, a rate-series gap is carried and seamed, an extra bar aborts, and `raw/calendar-exceptions.json` is the only override
- [x] 02-03-PLAN.md: Real inputs. A fetch script pulls the locked source stack into canonical CSVs with provenance sidecars, gated by a package-legitimacy checkpoint before any spreadsheet dependency. Superseded on the equity vendor by 02-06 and 02-07

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-06-PLAN.md: Tracer. Yahoo replaces the dropped equity vendor, total return is reconstructed from dividend events behind a hard drift gate, the fetch route reports live versus manual with a staleness gate, and the Shiller parser's two defects are fixed

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 02-07-PLAN.md: The Nasdaq-100 total-return index normalized from a fourth vendor format with its export defects counted, and the total-return versus price-return divergence cross-check committed as a standing test

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 02-08-PLAN.md: The two instruction documents rewritten around the vendors that exist, the two superseded decision rows marked with pointers rather than edited, and every vendor original committed
- [x] 02-04-PLAN.md: Derived series. One daily short rate spliced across four sources, the S&P's pre-1988 total return constructed from an interpolated dividend yield, and tier ranges computed by scanning seam records

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 02-05-PLAN.md: The real universe compiled and committed, plus two new gated bench rows for bundle transfer bytes and decode-to-typed-array time

### Phase 3: Simulation Kernel and the UPRO/TQQQ Gate

**Goal**: The simulation is demonstrably right against real leveraged-ETF history, before a single pixel of UI is built on top of it
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: SIM-01, SIM-02, SIM-03, SIM-04, SIM-05, SIM-06, SIM-07, SIM-08, SIM-09, SIM-10, SIM-11, SIM-12, VALID-01, VALID-02, VALID-03, PERF-02
**Success Criteria** (what must be TRUE):

  1. Synthetic 3x S&P 500 tracks real UPRO from 2009 and synthetic 3x Nasdaq-100 tracks real TQQQ, both inside a documented tolerance enforced as a build-failing test, with tracking error computed by a single shared function that the tests, the CI data-change check and the later in-app view all call.
  2. The cost parameters that produced that fit were written down with their independent sources before validation was first run, and the git history shows they were not adjusted afterward. Residual tracking error is reported as a number rather than narrowed by tuning; this no-fitting constraint is written into the phase spec, not left implicit.
  3. Every item on the correctness checklist passes as a unit test before any UI code is written: 1x reproduces the unlevered series exactly, leverage compounds day by day and is never applied to a cumulative return, financing and expense accrue on calendar days elapsed so a three-day weekend costs three days of interest, and a position driven to zero clamps at zero, flags ruin, stays there regardless of subsequent returns, and is treated downstream as an absorbing state rather than an extreme value.
  4. A script runs one real backtest end to end and prints the equity curve, exercising the full parameter surface: arbitrary positive leverage from 1x through 20x including fractional values, an initial investment plus recurring contributions at daily, monthly, quarterly or yearly frequency, a dividend-reinvest toggle that switches between the bundled total-return and price-return series rather than modelling dividends, an entry date with either a fixed holding period or hold-to-today, and user-supplied expense ratio and financing spread defaulting to the independently sourced values.
  5. A single backtest over the full ~25,000-bar history completes in under 16ms measured on real hardware, and 10,000 back-to-back invocations produce no measurable GC pressure because the hot loop allocates nothing and writes into preallocated buffers. The kernel is one module with no imports from the data, sweep or chart layers, so there is no second implementation that can drift.

**Plans:** 6/6 plans complete

Plans:
**Wave 1**

- [x] 03-01-PLAN.md — Tracer. One real SPX backtest end to end, from the committed Phase 2 bundle through the data-layer seam and the allocation-free kernel to a printed equity curve, plus the SIM-10 module-boundary assertion

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-02-PLAN.md — PITFALLS section A as the executable correctness checklist: the 1x exactness invariant at 1e-9, calendar-day accrual on two different bases, ruin as an absorbing state, and an asserted disposition for every remaining A-row
- [x] 03-03-PLAN.md — The sourced, citation-pinned cost parameters and the mechanism-derived tracking-error tolerances, committed atomically before any validation code exists

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 03-04-PLAN.md — The full parameter surface: calendar-anchored contributions with month-end clamp and business-day roll, the dividend-reinvest toggle, both holding modes, and sourced cost defaults
- [x] 03-05-PLAN.md — PERF-02 measured against the production kernel over the real ~25,000-bar history, and SIM-11's no-GC-pressure claim proven by a forced-collection heap delta

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 03-06-PLAN.md — The build-failing UPRO and TQQQ tracking-error gate, with rate-regime sub-windows reported and the residual printed as a number

### Phase 4: First Defensible Backtest in the Browser

**Goal**: A person can open the app, describe a real leveraged position, and get an outcome they can hand to someone else as a link
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: APP-01, APP-03, APP-04, DATA-08, METR-01, METR-02, METR-03, METR-04, METR-05, VIZ-08, VIZ-11, SHARE-01, SHARE-02, SHARE-03, PERF-07, PERF-08
**Success Criteria** (what must be TRUE):

  1. A user picks a symbol from the bundled universe, sets leverage, entry date, holding mode and a contribution schedule, and sees an equity curve with a visible log-scale toggle that stays legible in both light and dark.
  2. The result panel leads with IRR as the annualized figure whenever contributions are non-zero, alongside maximum drawdown and final value as a multiple of total contributed, and presents ruin as a categorical outcome visually distinct from a merely bad number. CAGR is available but suppressed or explicitly qualified when a contribution schedule makes it misleading.
  3. Invalid or impossible parameter combinations, such as an entry date outside the selected tier's range or a fixed holding period that runs past the available data, are prevented or explained on screen and never silently coerced.
  4. Copying the URL and opening it in a fresh browser reproduces the exact run, enforced by a determinism test. The link carries the data-bundle version, and a link created against an older bundle either reproduces faithfully or states clearly that the data has changed.
  5. Measured on real hardware and reported by the benchmark command: cold load reaches interactive in under 1500ms with data load and decode under 1000ms, warm load is under 300ms, dragging the leverage slider sustains 60fps with no main-thread task exceeding 50ms, and the app builds to static assets that deploy to Cloudflare Pages with no backend, no database and no runtime external API calls, loading and decoding bundled assets directly into typed arrays and working fully offline after first load.

**Plans:** 8/8 plans executed

Plans:
**Wave 1**

- [x] 04-01-PLAN.md: Tracer. Static Vite plus Solid build, the D-02 byte-source split, and one real SPX 3x equity curve painted in the browser from the committed bundle on a log axis

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04-02-PLAN.md: Metrics and ruin. In-loop max drawdown on `KernelResult`, IRR by bounded bisection, CAGR, the formatting contract, the five-row panel, the ruin state change and the visible scale choice
- [x] 04-03-PLAN.md: PERF-08. The Playwright-context probe that settles RESEARCH Open Question 1, a `vite preview` harness over the production build, and cold and warm load measured with their WINDOWS band

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 04-04-PLAN.md: Symbol, dividend mode, entry date bounded live by the strict tier with eviction explained rather than snapped, and a leverage slider that can be scrubbed

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 04-05-PLAN.md: Holding mode, contribution schedule, both cost parameters cited inline, and the three-variant explanation surface with its stacking order
- [x] 04-06-PLAN.md: PERF-07. Long task and coalesced-recompute duration measured across a real pointer drag of the leverage slider

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 04-07-PLAN.md: The permalink. A confirmed one-way param contract, the codec with its round-trip property and committed golden runs, copy link, and the bundle-mismatch banner

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 04-08-PLAN.md: Both themes with an explicitly repainted canvas, offline-after-first-load for the whole bundled universe, the static-build gate, and the D-20 screenshot region

**UI hint**: yes
**Prerequisite RESOLVED (2026-08-18, quick-260818-v2d):** WINDOWS.md entry #2 (calibration
under-corrects for CI runner speed variance) is closed. On the D-17 baseline the normalized
residual is 6.36% relative over 13 recorded runs, so a single CI run supports a headroom claim
only to roughly +/-13% and a two-run comparison only to roughly +/-20%; criterion 5's PERF-07/
PERF-08 decisions must be read against that band rather than against a single figure.

### Phase 5: Attribution and the Credibility Surface

**Goal**: A skeptic can see which mechanism consumed the money, check the model against a real product, and inspect every assumption without leaving the page
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: ATTR-01, ATTR-02, ATTR-03, CRED-01, CRED-02, CRED-03, CRED-04, CRED-05, VALID-04, APP-02
**Success Criteria** (what must be TRUE):

  1. For any single run, the gap between the naive `L*r` result and the actual result is decomposed into volatility drag, financing cost and expense ratio, reported in both dollars and percent, with the three components reconciling to the total gap without an unexplained residual. A zero-cost comparison mode displays the naive result beside the real one, so a user's own assumption sits next to what actually happened.
  2. The synthetic-versus-real comparison is visible in the app, not only in tests: a reader selects UPRO or TQQQ, sees synthetic 3x plotted against the real product, and reads the tracking-error figure without running any code.
  3. The active history tier, its date range, its sources and its seam dates are on screen at all times, rendered from manifest provenance rather than hand-authored strings, and selecting a tier states on screen what that tier means.
  4. The extended tier carries a prominent warning naming the direction of its bias: interpolated monthly data smooths daily volatility and therefore understates volatility drag, making leverage look better than it was in exactly the pre-1954 era the tier exists to reach. The magnitude is quantified by downsampling a known-good daily era to monthly, interpolating it back and measuring the resulting gap, and that figure is printed next to the warning.
  5. Every default parameter is labelled as a default and is editable in place, and a methodology page stating the full cost model, day-count conventions, data sources and known limitations is reachable in one click from any result. Attribution's extra kernel calls keep a single-run parameter change inside the 16ms budget, measured, not assumed.

**Plans:** 9/9 plans complete

Plans:
**Wave 1**

- [x] 05-01-PLAN.md — Attribution tracer, Shapley engine and the always-visible panel (ATTR-01, ATTR-02)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 05-02-PLAN.md — Naive ghost curve on the equity chart (ATTR-03)
- [x] 05-03-PLAN.md — Synthetic-versus-real validation view and the helper extraction (VALID-04)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 05-04-PLAN.md — Manifest-generated provenance strip with the traceability gate (CRED-01)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 05-05-PLAN.md — History tier selector wired through bounds and permalink (APP-02)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 05-06-PLAN.md — Measured extended-tier bias figure and its warning banner (CRED-02, CRED-03)

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 05-07-PLAN.md — Methodology overlay generated from the code's own registries (CRED-04)

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 05-08-PLAN.md — Defaults labelled and resettable across every parameter (CRED-05)

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 05-09-PLAN.md — PERF-07b re-measured with attribution live, and the sweep-cost finding

**UI hint**: yes

### Phase 6: Heatmap Design Pass

**Goal**: The entry-date x leverage grid has a chosen visual treatment, argued from throwaway mockups, before anything is implemented against it
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: VIZ-05, VIZ-07, VIZ-10
**Success Criteria** (what must be TRUE):

  1. At least three throwaway HTML mockups of the entry-date x leverage grid exist, each rendering a full-scale 10,000-cell grid with plausible data, and one is chosen with the reasons for rejecting the others written down. No surveyed tool pairs these axes, so the choice is argued rather than assumed.
  2. The chosen color treatment is perceptually uniform and colorblind-safe, checked against a simulation of the common color-vision deficiencies, and outcomes spanning orders of magnitude map through a log or otherwise non-linear scale rather than a linear one.
  3. The mockups place the overlapping-windows caveat where it will actually be read: visible copy stating that adjacent entry dates share nearly all their underlying history and that the grid is a sensitivity analysis over one shared past, not thousands of independent trials. A treatment that relegates this to a footnote is rejected on those grounds.
  4. Each mockup repaints its 10,000-cell grid on a metric change in under 16ms on real hardware, so no treatment survives the pass that cannot be built inside the budget locked in Phase 1.

**Plans:** 6/6 plans executed

Plans:
**Wave 1**

- [x] 06-01-PLAN.md: Tracer. The real kernel sweeps 200 entry dates by 50 leverage levels of SPX total return into a committed binary fixture, and a plain HTML page served by `vite dev` paints that 10,000-cell field through the graduated colour function inside PERF-05's 16ms budget

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 06-02-PLAN.md: D-17's colourblind legibility check as a live CI assertion, at thresholds fixed before the palette was tested, and any palette change it forces
- [x] 06-03-PLAN.md: Forms 2 and 4. Hand-rolled iso-bands by per-pixel resample and hand-rolled iso-lines by unstitched marching squares, with no new dependency
- [x] 06-04-PLAN.md: Form 3. Fifty stacked one-dimensional leverage strips, with a criterion-4 figure proven non-vacuous against the whole field

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 06-05-PLAN.md: The four-way comparison page, the max-drawdown stress section, and the blocking decision that picks the winner and records why the other three lost

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 06-06-PLAN.md: The two binding artifacts. `06-HEATMAP-SPEC.md` at implementable precision plus the PROJECT.md Key Decision, carrying forward the unspent PERF-03 lever, VIZ-09's missing mockup and the open hover question

**UI hint**: yes

### Phase 7: Sweep Engine and the Heatmap

**Goal**: A user sees how the answer changes across every entry date and every leverage level at once, without the interface ever stalling
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: VIZ-01, VIZ-02, VIZ-03, VIZ-04, VIZ-06, VIZ-09, METR-06, PERF-03, PERF-04, PERF-05, PERF-06, PERF-09
**Success Criteria** (what must be TRUE):

  1. The 2D heatmap over entry date and leverage renders Phase 6's chosen treatment against real swept data, with a fixed-leverage sweep-entry-date chart and a fixed-entry-date sweep-leverage chart available as slices, and a sweep-mode toggle between fixed holding period and hold-to-today where the chart states which mode produced it.
  2. Ruined cells read as a categorically different thing from the continuous color scale, never as merely its darkest end, verified on a 1929-entry high-leverage sweep where ruin genuinely occurs. In hold-to-today mode the short-horizon artifact at the recent edge is visually marked, so the right side of the chart is not read as comparable to the left.
  3. Measured on a 4-core baseline machine and reported by the benchmark command: a full 10,000-cell sweep completes in under 1000ms wall clock from user action to final cell, and first partial results paint within 100ms with the grid filling progressively, so the user never faces a blank pane with a spinner.
  4. Changing the heatmap's displayed metric re-colors the cached grid in under 16ms and never triggers a re-sweep, because the sweep computes every display metric per cell in a single pass.
  5. Changing a parameter mid-sweep cancels the in-flight sweep within one frame and discards its superseded results rather than painting them, and heatmap pan and zoom sustain 60fps at full cell count. Both figures come from measurement, not from watching the screen.

**Plans:** 10 plans

Plans:
**Wave 1**

- [ ] 07-01-PLAN.md: Tracer. Graduate the Phase 6 geometry into `src/heatmap/`, then wire one real sweep over the real bundle through the real kernel onto a painted filled-contour field

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 07-02-PLAN.md: D-25's sequential drawdown ramp, a stops-parameterized interpolator, and three fixed per-metric colour domains under the VIZ-07 perceptual and colourblind bars
- [ ] 07-03-PLAN.md: METR-06's one-pass per-cell record (multiple, drawdown, annualized, flags), and PERF-03 repointed at the production pool over the real bundle
- [ ] 07-04-PLAN.md: D-05's polygon fill and ring stitcher, the D-07 equivalence-and-repaint gate, the D-06 escalation checkpoint, and PERF-05 repointed at the shipped renderer
- [ ] 07-05-PLAN.md: D-12's coarse-to-fine progressive paint and generation-token cancellation, with PERF-04 and PERF-06 measured

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 07-06-PLAN.md: D-15's Single run and Sweep switch, D-23's metric toggle, and D-04's two new permalink keys
- [ ] 07-07-PLAN.md: D-16's two marginal slice charts, the two-variant legend, and D-30's caption strip carrying the VIZ-04 mode statement and the VIZ-10 caveat

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 07-08-PLAN.md: D-19's ghost and committed crosshairs, D-20's per-cell hover readout, and D-22's drill-down
- [ ] 07-09-PLAN.md: The named ruin verification sweep closing Finding F-02, D-29's short-horizon boundary rule, and D-33's inline breakeven label

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 07-10-PLAN.md: D-34's pan and zoom over the already-rendered field, with PERF-09 measured at full cell count

**UI hint**: yes

### Phase 8: Export and the Canonical Arguments

**Goal**: A result leaves the app in whatever form the argument needs: a picture, the raw numbers, or a curated link
**Mode:** mvp
**Depends on**: Phase 7
**Requirements**: SHARE-04, SHARE-05, SHARE-06
**Success Criteria** (what must be TRUE):

  1. A user exports the currently displayed chart as a PNG that stays legible when pasted into a forum post or a chat, in both light and dark.
  2. A user exports a run's underlying daily series as CSV with enough columns that a skeptic can recompute the result in a spreadsheet and arrive at the same final value.
  3. Named preset scenarios cover the canonical arguments, each one click from the landing state and each a shareable permalink. The set includes the windows where leverage looks bad (3x S&P from 1929, TQQQ from 2000, a high-rate financing regime) alongside the flattering one (the 2010s in isolation), so the preset list cannot itself be read as a cherry-pick.
  4. Exporting a PNG or a 25,000-row CSV does not drop a frame: the export path stays inside the 50ms main-thread task budget, measured.

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Performance Spike and Budget Lock | 6/6 | Complete    | 2026-08-17 |
| 2. Compiled Data Bundle | 8/8 | Complete    | 2026-08-17 |
| 3. Simulation Kernel and the UPRO/TQQQ Gate | 6/6 | In Progress|  |
| 4. First Defensible Backtest in the Browser | 8/8 | In Progress|  |
| 5. Attribution and the Credibility Surface | 9/9 | Complete    | 2026-08-21 |
| 6. Heatmap Design Pass | 6/6 | Complete    | 2026-08-21 |
| 7. Sweep Engine and the Heatmap | 0/TBD | Not started | - |
| 8. Export and the Canonical Arguments | 0/TBD | Not started | - |

## Coverage

All 72 v1 requirements map to exactly one phase. No orphans, no duplicates.

| Category | Total | Phase mapping |
|----------|-------|---------------|
| Performance (12) | 12 | P1: 01, 01a, 10, 11 · P3: 02 · P4: 07, 08 · P7: 03, 04, 05, 06, 09 |
| Data Pipeline (9) | 9 | P2: 01-07, 09 · P4: 08 |
| Simulation Kernel (12) | 12 | P3: 01-12 |
| Validation (4) | 4 | P3: 01, 02, 03 · P5: 04 |
| Metrics (6) | 6 | P4: 01-05 · P7: 06 |
| Attribution (3) | 3 | P5: 01-03 |
| Visualization (11) | 11 | P4: 08, 11 · P6: 05, 07, 10 · P7: 01, 02, 03, 04, 06, 09 |
| Credibility (5) | 5 | P5: 01-05 |
| Sharing and Export (6) | 6 | P4: 01, 02, 03 · P8: 04, 05, 06 |
| Application Shell (4) | 4 | P4: 01, 03, 04 · P5: 02 |

## Sequencing Notes

- **Phase 1 precedes architecture commitment deliberately.** Research flagged both the sweep timing
  (150-600ms) and the Canvas-at-10k-cells figure as unbenchmarked napkin math. Committing to a
  worker-pool-over-plain-JS design and a hand-rolled canvas renderer before measuring either would
  risk discovering the performance problem after the whole app is built on top of it.

- **Phase 3 is a hard gate.** Do not begin Phase 4 on a kernel that has not passed the UPRO and
  TQQQ comparison. The cost of a kernel bug found after the UI exists is every downstream number
  being quietly wrong.

- **Phase 6 is design work, not implementation.** It exists as its own phase because the
  entry-date x leverage pairing has no precedent in any surveyed tool, so there is no pattern to
  copy and the treatment has to be argued rather than assumed. Its output is a chosen treatment and
  a design contract that Phase 7 builds against.

- **Bounded parallelism exists** but the dependency chain is real: Phase 2's compiler and an early
  synthetic-data version of Phase 3's kernel can proceed independently and integrate once both land.
  Phase 8's export path and the tail of Phase 7 do not block each other.

- **There is no optimization phase.** Every phase touching the compute or render path carries a
  measured performance number in its success criteria, gated by the budgets locked in Phase 1.
