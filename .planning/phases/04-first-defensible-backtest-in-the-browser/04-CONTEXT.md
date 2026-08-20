# Phase 4: First Defensible Backtest in the Browser - Context

**Gathered:** 2026-08-19
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase stands up the first browser application. Phases 1 through 3 produced a measured
performance harness, a compiled and versioned data bundle, and a simulation kernel proven against
real UPRO and TQQQ history. None of it has a UI. Phase 4 puts the kernel behind a static Vite
app: parameter controls, an equity curve, a metrics panel, on-screen handling of impossible
parameter combinations, a permalink that reproduces the exact run, and the first real measurement
of PERF-07 and PERF-08.

**In scope:** the Vite + Solid + uPlot scaffold, a browser-side bundle loader, single-run
execution, the METR-01 through METR-05 metric surface, APP-04 validation, SHARE-01/02/03
permalinks, DATA-08 offline, APP-03 static Cloudflare Pages build, and PERF-07/PERF-08
measurement wired into `npm run bench`.

**Out of scope (named here because each is a live requirement in a later phase):** cost
attribution and the zero-cost comparison (ATTR-*, Phase 5); the in-app synthetic-versus-real view
(VALID-04, Phase 5); the tier selector with its meaning on screen and the extended-tier bias
warning (APP-02, CRED-01 through CRED-05, Phase 5); the entry-date x leverage heatmap and its
sweep engine (Phase 6 design, Phase 7 implementation); PNG and CSV export and preset scenarios
(SHARE-04/05/06, Phase 8).

</domain>

<decisions>
## Implementation Decisions

### Compute Placement and the Browser Data Path

- **D-01:** **A single backtest runs on the main thread.** PERF-02 measured 0.21ms for a full
  ~25,000-bar run on the D-17 baseline against a 16ms frame budget, roughly 75x headroom, so
  there is no budget pressure for a worker to relieve. D-30 already fixes the kernel signature as
  typed arrays and scalars, so Phase 7's sweep worker calls the identical function with no
  rework. Rejected: routing the single run through Comlink from day one, which adds a
  postMessage round-trip per parameter change to buy headroom that is not needed. Also rejected:
  a split where load and decode go to a worker, since the decode is zero-copy views (D-19) and
  therefore not the expensive part it looks like.
- **D-02:** **One loader core, two byte sources.** `buildKernelInputs` (`src/data/kernel-inputs.ts:175`)
  is already pure over `LoadedBundle`; only `loadBundleFromDisk` (`src/data/kernel-inputs.ts:95`)
  is Node-bound, through `readFile` and `path.join`. Extract the byte source as a parameter so
  Node (`readFile`) and browser (`fetch`) share one decode path, one assembly loop, and one
  `LoadedBundle` type. Rejected: a parallel `loadBundleFromFetch` that duplicates the assembly
  loop, because a manifest change then has two places to fix and one of them is only exercised in
  the browser. Also rejected: making every caller fetch over a local server, which would make
  `scripts/run-backtest.ts` and the unit tests depend on a running server.
  -- **Reversibility:** costly -- every existing caller of `loadBundleFromDisk` moves to the new
  signature, including `bench/decode-time.bench.test.ts` and the Phase 3 gate tests.
- **D-03:** **Re-runs are coalesced to one per animation frame.** Input events write state; a
  single rAF-scheduled effect runs the kernel and repaints the chart. This caps work at exactly
  one run and one paint per frame, which is what PERF-07b's 16ms row measures. Rejected: a
  synchronous run per input event, since pointer input on high-Hz devices fires faster than
  frames and the extra runs cannot be displayed. Also rejected: running only on `change` (slider
  release), because a leverage slider you cannot scrub is the wrong interaction for a tool whose
  subject is sensitivity to leverage.
- **D-04:** **Offline is `vite-plugin-pwa` `generateSW`, precaching everything.** `globPatterns`
  covers the app shell plus all 14 content-hashed `.bin` assets and the manifest;
  `maximumFileSizeToCacheInBytes` is raised past the 2MB default for the 1.66MB bundle. First
  load pays that 1.66MB regardless, since Phase 7's sweep needs the whole universe, and Workbox's
  precache manifest is itself hash-based so a redeploy invalidates only what changed. Rejected:
  precaching the shell and runtime-caching data on first fetch, which reduces DATA-08's "works
  fully offline after first load" to "offline for the symbols you already opened." Also rejected:
  a hand-rolled service worker, on service-worker-lifecycle debugging cost.

### Metrics and Ruin

- **D-05:** **IRR is always the headline, in a slot that never changes identity.** Labelled
  "Annualized return (IRR)". With zero contributions it carries an inline note that IRR equals
  CAGR for a single cash flow. CAGR occupies a secondary slot in every state, carrying the
  METR-02 qualifier when contributions are non-zero. Rejected: swapping the headline metric by
  schedule (CAGR when contributions are zero, IRR otherwise), because the headline number then
  changes identity when a user turns contributions on, and two screenshots of the same tool stop
  being comparable. Also rejected: rendering CAGR struck through, since a struck-through number
  is still a number people quote.
- **D-06:** **METR-04's denominator is money actually invested.** The multiple is
  `finalValue / totalContributed`, using the kernel's `totalContributed` (initial plus
  contributions actually applied, D-28). `droppedContributionsTotal` (D-21) is rendered as its own
  line naming the ruin date, never folded into the ratio. This makes the multiple answer "what
  happened to money that went in" and keeps the dropped amount visible. Rejected: using the full
  scheduled commitment as the denominator, which is a defensible different question but buries
  the dropped amount inside a ratio. Also rejected: showing both multiples, since two similar
  numbers on a ruined run invite misquotation.
- **D-07:** **Ruin is a state change of the whole result panel, with metrics retained.** A
  categorical banner names the ruin date, the metrics render subordinate to it, and the chart
  marks the ruin bar with a terminator (log scale cannot plot zero, PITFALLS E6). This is D-22's
  "absorbing state rather than an extreme value" rendered rather than merely computed. Rejected:
  a badge beside otherwise-normal metrics, which is exactly the "ruin inferred from a number near
  zero" reading D-22 exists to prevent. Also rejected: hiding the numeric metrics entirely, which
  removes figures a skeptic legitimately wants.
- **D-08:** **IRR is solved by bounded bisection with an explicit undefined result.** Bisect over
  a stated annualized bracket (roughly -99.99% to +1000%). D-21 dropping post-ruin contributions
  guarantees the cash-flow sequence has a single sign change, so the root is unique by Descartes'
  rule and bisection cannot converge to a wrong one. If the bracket does not straddle zero, the
  panel prints "IRR undefined for this cash-flow pattern" rather than a number. A ruined run
  resolves to -100% at the boundary. `NaN` and `Infinity` never reach the screen, which is
  PITFALLS D4's stated warning sign. Rejected: Newton with a bisection fallback, an extra code
  path for a solve that runs once per parameter change over a few hundred cash flows where speed
  is not the constraint.

### Validation, Tiers and Data Edges

- **D-09:** **Phase 4 pins the strict tier and carries the tier in the URL; no selector ships.**
  Entry-date bounds come from each series' `tiers.strict` range in the manifest (SPX total return
  strict starts 1988-01-05 against an extended 1927-12-30). The permalink carries a `tier` param
  from day one so Phase 5's selector does not invalidate Phase 4 links. Rationale: the extended
  tier's known bias, that interpolated monthly data smooths daily volatility and therefore
  understates volatility drag in exactly the pre-1954 era the tier exists to reach, has its
  warning copy and its quantified magnitude scheduled as Phase 5 criterion 4. Shipping the
  extended range before that disclosure exists would put the weakest data on screen undisclosed,
  which is the specific credibility failure the tiering was introduced to prevent. Rejected: a
  bare toggle with no explanatory copy. Also rejected: ignoring tiers entirely in Phase 4, which
  leaves the permalink without a `tier` param and breaks every Phase 4 link when Phase 5 adds one.
  -- **Reversibility:** reversible -- Phase 5 adds a control over a param the URL already carries.
- **D-10:** **Constrain what a single control can know; explain everything else.** Bounds a single
  control can resolve up front (entry date minimum and maximum, derived from tier, symbol and
  dividend mode) are enforced by the control itself. Cross-field impossibilities, principally a
  fixed holding period running past the last fully-supported bar (D-29), are accepted as input and
  explained in the panel naming the actual limiting date. Neither path silently coerces, which is
  what APP-04 and D-32 require. Rejected: accepting everything and explaining after the fact,
  which requires writing error copy for states a bounded date picker makes unreachable. Also
  rejected: clamping every field, which is the silent coercion criterion 3 prohibits.
- **D-11:** **While parameters are invalid the result area is cleared.** Chart and metrics are
  removed; only the explanation remains. No number is ever on screen that does not correspond to
  the controls beside it. This matters specifically because the output is meant to be
  screenshotted and pasted into an argument. Rejected: retaining the last valid result under a
  stale marker, since a screenshot of that state shows numbers that contradict the visible
  parameters. Also rejected: silently not updating.
- **D-12:** **Date bounds recompute live from (symbol, dividend mode, tier), and an evicted date
  is explained, not moved.** The dividend toggle materially changes the valid range: NDX
  price-return starts 1985-10-01 while NDX total-return starts 1999-03-04, a 14-year swing. When
  the current entry date falls outside the recomputed range the result clears and the message
  names the cause, for example "NDX total return starts 1999-03-04". Rejected: snapping the date
  to the nearest valid value, which is silent coercion of a parameter the permalink encodes. Also
  rejected: disabling the dividend toggle when it would evict, which hides a legitimate option
  behind a rule the user must reverse-engineer.

### Permalink Contract

- **D-13:** **Every parameter is emitted in the URL, always, as flat readable query params.**
  Roughly 200 characters, nothing omitted, no default elided. A link is therefore fully
  self-describing, so changing a default in a later release cannot retroactively change what an
  existing link means. That silent reinterpretation is PITFALLS G4's failure mode, and this tool's
  core function fails precisely when two people compare links. Rejected: omitting defaults for
  shorter URLs. Also rejected: omitting defaults behind a schema version, which is reproducible
  but requires carrying a table of historical default sets indefinitely.
  -- **Reversibility:** one-way -- once links are shared, the param set and its names are a
  published contract; renaming or dropping a param breaks every link already in circulation.
- **D-14:** **Hold-to-today encodes both the mode and the end date resolved at creation.** The URL
  carries `holdMode=today` and the resolved end date. Replay is therefore frozen and faithful by
  default, satisfying criterion 4, while the app can offer a one-click "run to today" that honours
  the open-ended intent. Costs one extra param. Rejected: freezing the end date alone, which loses
  the fact that the creator meant "to today" and makes the link unrefreshable. Also rejected:
  encoding the mode alone, which re-runs to whatever today is and directly breaks criterion 4.
- **D-15:** **A bundle-version mismatch computes against the deployed bundle and banners the
  change.** The banner names both versions and states that the underlying data has changed since
  the link was created. This is SHARE-02's "states clearly that the data has changed" branch, and
  it is the only branch reachable today: `MANIFEST_PATH` in `src/data-bundle.generated.ts` points
  at exactly one content-hashed manifest, so no older bundle is addressable. Rejected for this
  phase, not on merit: retaining the last N bundles so old links reproduce faithfully, which is
  the stronger half of SHARE-02 and is real build-and-deploy work (see Deferred Ideas). Also
  rejected: blocking the render behind an opt-in click-through.
- **D-16:** **SHARE-03 is a fast-check round-trip property plus committed golden runs.** The
  property asserts `decode(encode(params))` returns identical params across the generated
  parameter space, which catches any field the encoder forgets. A small committed fixture of full
  URLs asserts their metric outputs to a stated tolerance, which catches computation drift a
  round-trip cannot see. fast-check 4.9.0 is already a devDependency. Rejected: either half alone.

### Visual Treatment

The `/gsd-ui-phase 4` design contract (UI-SPEC.md) is the authority on tokens, spacing, component
inventory and mockups. The decisions below are the direction it starts from, not a substitute
for it. ROADMAP marks this phase **UI hint: yes**.

- **D-17:** **Controls left, result right.** A persistent control column (symbol, leverage, entry
  date, holding mode, contribution schedule, expense ratio, financing spread) sits beside the
  chart and metrics. Every parameter stays visible next to the number it produced, which is what
  makes a screenshot self-contained. Collapses to stacked on narrow viewports. Rejected: a
  horizontal parameter bar on top, which gives the chart maximum width but pushes the cost and
  contribution fields into a second row or a disclosure. Also rejected: a single scrolling column,
  where the parameters scroll out of view above the chart.
- **D-18:** **The voice is a technical instrument panel.** Dense layout, monospace numerics, tight
  spacing, a muted surface with the chart as the only saturated element. Every default parameter
  carries its source inline beside the control ("0.90% -- ProShares UPRO prospectus", "0.50% --
  midpoint of sourced range"), which is PITFALLS G3's prevention verbatim and is required by
  Phase 5's CRED-05 anyway. Reads as a measuring instrument rather than a pitch. Rejected: an
  editorial explainer treatment, which is friendlier to a cold arrival from a link but risks
  reading as marketing for a conclusion. Also rejected: a full terminal or receipts aesthetic,
  which leaves no room for the chart.
- **D-19:** **Log y-axis by default with a visible toggle, and the theme follows the system.**
  PITFALLS E6: on a linear axis an early -90% crash renders visually smaller than a later -20%
  dip, which actively misleads for a tool whose subject is compounding and ruin, and the default
  view is the one that gets screenshotted. Ruin gets a terminator marker because log cannot plot
  zero. Theme follows `prefers-color-scheme` with a manual override; uPlot reads CSS custom
  properties at render time and repaints on theme change, since canvas gets no free
  `prefers-color-scheme` styling. Rejected: dark-only, which narrows VIZ-11's stated requirement.
  Also rejected: linear by default.
- **D-20:** **Phase 4 designs the screenshot region but ships no export.** The layout guarantees
  that one rectangle contains the parameters, the metrics, the symbol, the effective date range
  and the bundle version, so a manual screenshot is self-contained. No capture code: PNG export is
  SHARE-04, a Phase 8 requirement. Phase 8 then gets a region to capture rather than a redesign.
  Rejected: building a separate composed share card now, which is a second rendering of every
  metric to keep in sync plus scope Phase 8 already owns.
- **D-21:** **The result column is built as a slot that can hold either the equity curve or the
  heatmap.** Phase 4 fills it with the curve only. The parameter column is structured so leverage
  and entry date can become swept axes rather than fixed values, so Phase 7 fills the slot instead
  of rearranging the application. Rejected: two independent screens with their own layouts, which
  builds the parameter controls twice or requires lifting them into shared state later. Also
  rejected: deferring all layout thinking to Phase 6's design pass, which maximises the chance
  Phase 4's layout is reworked.
  -- **Reversibility:** reversible -- the slot is a layout affordance; Phase 6's design pass can
  still redefine what goes in it.

### Claude's Discretion

- Component decomposition inside the Solid app, state container shape, and CSS approach.
- Exact query-param names and value formats, subject to D-13's "every param, always, readable".
- The IRR bisection tolerance and iteration cap, subject to D-08's bracket and undefined result.
- Where max drawdown is computed (see Findings F-01), subject to it being one implementation.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Kernel and data seam (what Phase 4 calls)
- `src/kernel/backtest.types.ts` -- the `KernelSeries` / `KernelParams` / `KernelOutputs` /
  `KernelResult` contract, the D-30 typed-array-and-scalars boundary, and the three day-count
  constants. Note `KernelResult` has no drawdown field (F-01).
- `src/data/kernel-inputs.ts` -- `BacktestRequest` (line 34) is already the exact parameter
  surface the UI needs; `loadBundleFromDisk` (line 95) is the Node-bound function D-02 splits;
  `buildKernelInputs` (line 175) is pure over `LoadedBundle` and unchanged by D-02.
- `src/data/contribution-schedule.ts` -- `ContributionFrequency` and the D-25/D-26/D-27 calendar
  anchoring, month-end clamp and business-day roll.
- `src/data-bundle.generated.ts` -- `MANIFEST_PATH` and `BUNDLE_VERSION`, the pointer D-15's
  mismatch banner compares against.
- `tools/bundle-compiler/src/binary-format.ts` -- `decodeHeader`, `seriesView`, `calendarView`,
  the zero-copy decode D-02's browser path reuses.
- `tools/bundle-compiler/src/manifest.ts` -- the `Manifest` type, including per-series `tiers`
  (D-09) and `seams`.

### Prior phase decisions that bind this phase
- `.planning/phases/03-simulation-kernel-and-the-upro-tqqq-gate/03-CONTEXT.md` -- D-21 and D-22
  (ruin semantics and dropped contributions, feeding D-06/D-07), D-29 (rate-coverage truncation,
  feeding D-10), D-30 and D-31 (kernel boundary, feeding D-01), D-32 (caller-side range rejection,
  feeding D-10). Also carries the amended D-10 banner on dividend conventions.
- `.planning/phases/03-simulation-kernel-and-the-upro-tqqq-gate/03-GATE-DIAGNOSIS.md` -- why the
  synthetic is built from the total-return index; Phase 5's in-app view depends on it, and Phase 4
  must not build a dividend-mode UI that contradicts it.
- `.planning/phases/02-compiled-data-bundle/02-CONTEXT.md` -- the binary format, manifest
  provenance and content-hashed asset naming D-04 and D-15 rely on.
- `.planning/phases/01-performance-spike-and-budget-lock/01-CONTEXT.md` -- D-03, Vitest browser
  mode (Playwright-backed) as the runner for anything the browser actually executes.

### Performance
- `perf-budgets.ts` -- PERF-07a (50ms long task), PERF-07b (16ms frame), PERF-08a (1500ms cold
  interactive), PERF-08b (1000ms data load and first render), PERF-08c (300ms warm) are all
  `implementedInPhase: 4` and currently unmeasured. `DATA-BUNDLE-DECODE` and `DATA-BUNDLE-BYTES`
  are already measured.
- `bench/decode-time.bench.test.ts` -- proves a browser can already fetch the bundle by URL from
  the Vite-served `public/` mount, which is the path D-02's browser byte source takes.
- `bench/calibration.ts` and `bench/report.ts` -- `normalize()` and the calibration score every
  new PERF-07/08 row passes through.
- `.planning/WINDOWS.md` entry 2 (status: fixed, 2026-08-18) -- the normalized residual is 6.36%
  relative over 13 recorded runs, so a single CI run supports a headroom claim only to roughly
  +/-13% and a two-run comparison only to roughly +/-20%. Criterion 5's PERF-07/PERF-08 verdicts
  must be read against that band, not against a single figure.
- `.planning/PROJECT.md` §Key Decisions -- the PERF-03 D-20 escalation row: PERF-03 sits at 80.8%
  of its budget on the D-17 baseline, so any work Phase 4 adds on a path Phase 7 will share must be
  measured before it lands.

### Pitfalls this phase must answer to
- `.planning/research/PITFALLS.md` §D4 -- IRR root-finding failure modes, feeding D-08.
- `.planning/research/PITFALLS.md` §E6 -- linear equity curves mislead for compounding series,
  feeding D-19; also the log-cannot-plot-zero caveat feeding D-07.
- `.planning/research/PITFALLS.md` §G3 -- defaults that look cherry-picked, feeding D-18.
- `.planning/research/PITFALLS.md` §G4 -- inability to reproduce a claimed result, feeding D-13,
  D-14, D-15 and D-16.
- `.planning/research/PITFALLS.md` §F4 -- blocking the main thread despite having workers,
  relevant to D-01 and D-03.

### Stack and deployment
- `.claude/CLAUDE.md` §"Recommended Stack" -- pinned versions: vite 8.2.1, solid-js 1.9.14,
  vite-plugin-solid 2.11.14, uplot 1.6.32, vite-plugin-pwa 1.3.0, d3-scale/d3-interpolate 7.9.0
  (submodule imports only, not the `d3` umbrella).
- `.claude/CLAUDE.md` §"Q6 -- Cloudflare Pages specifics" -- the `_headers` file, immutable
  caching for content-hashed assets, short cache for `index.html`, and why HTTP cache alone does
  not satisfy DATA-08.
- `.claude/CLAUDE.md` §"Q3 -- App framework and build" -- why Solid, and what the alternatives
  cost.

### Requirements
- `.planning/REQUIREMENTS.md` -- APP-01, APP-03, APP-04, DATA-08, METR-01 through METR-05,
  VIZ-08, VIZ-11, SHARE-01, SHARE-02, SHARE-03, PERF-07, PERF-08.
- `.planning/ROADMAP.md` §"Phase 4" -- the five success criteria and the resolved WINDOWS #2
  prerequisite note.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `BacktestRequest` (`src/data/kernel-inputs.ts:34`) is already the UI's parameter surface:
  symbol, dividendReinvest, leverage, entryDate, holdingPeriodBars, initialInvestment,
  contributionAmount, contributionFrequency, expenseRatioPercent, financingSpreadPercent. The
  permalink schema (D-13) should be a near-direct projection of it, plus `tier` (D-09), the
  resolved end date (D-14) and `bundleVersion` (D-15).
- `KernelInputs.meta` already carries `bundleVersion`, `truncatedForRateCoverage`,
  `contributionCount` and `contributionNominalDates`, and `KernelInputs.window` carries
  `firstDate` / `lastDate`. The UI can render the effective run window and D-29's truncation
  notice without recomputing anything.
- `KernelResult` supplies `finalValue`, `ruined`, `ruinBarIndex`, `droppedContributionsTotal`,
  `totalContributed`, `longGapBarCount` and `barCount` -- enough for METR-04 and METR-05 directly.
- `bench/sweep-pool.ts` and the `comlink` dependency exist from Phase 1 as a worker-pool
  prototype. Not used in Phase 4 under D-01, but they are the seam Phase 7 inherits.
- fast-check 4.9.0 and Playwright 1.62.1 are already devDependencies; Vitest projects `unit`,
  `bench` and `bench-selftest` are already configured in `vitest.config.ts`.

### Established Patterns
- The kernel imports nothing from data, sweep or chart layers (SIM-10), asserted by a test. Any
  UI code must not create a second path into it.
- The kernel allocates nothing in its hot loop and writes into caller-preallocated buffers
  (SIM-11). The UI must preallocate its output arrays once per run window, not per frame, which
  interacts directly with D-03's per-frame re-run.
- Rate values in the bundle are `percent-annualized` and are divided by 100 exactly once, in the
  data layer (D-09, F-02). The UI takes percentages in its inputs and must not convert twice.
- Every performance figure goes through `normalize()` and lands in `.bench/bench-results.json`
  with a verdict; a not-yet-built path is reported as `unmeasured`, never omitted.
- Vitest browser mode (Playwright-backed) is the runner for anything the browser actually runs
  (Phase 1 D-03). PERF-07 and PERF-08 measurement belongs there, not in a Node harness.

### Integration Points
- `loadBundleFromDisk` is the single Node-bound function; D-02 splits its byte source. Its current
  callers include `scripts/run-backtest.ts` and the Phase 3 validation tests.
- `src/data-bundle.generated.ts` is compiler-emitted and is how both the app and the decode bench
  find the content-hashed manifest. The Vite build must serve `public/data/` at the paths that
  constant already encodes.
- `perf-budgets.ts` already declares PERF-07a/07b/08a/08b/08c with `implementedInPhase: 4`. Phase 4
  supplies measurements for rows that already exist; it should not need to add budget rows.

</code_context>

<specifics>
## Specific Ideas

- **The heatmap is a porkchop plot.** The user's original framing for the entry-date x leverage
  visualization is the astrodynamics porkchop plot: launch date on one axis, arrival date on the
  other, delta-v as contours, with the feasible region taking a pork-chop form. Here the axes are
  entry date and leverage, with the outcome metric as the third variable. This is Phase 6 (design
  pass) and Phase 7 (implementation), not Phase 4, and it is recorded here because it changes an
  assumption everything so far has carried: Phase 1 measured, and PROJECT.md's Key Decisions
  record, a **discrete 200x50 cell grid painted with `putImageData`** (0.37ms against a 16ms
  budget). A porkchop plot is **contours over a continuous field**, a different renderer and a
  different reading. Phase 6 must argue contours versus cells explicitly rather than inheriting
  the cell grid by default; the measured `putImageData` figure does not transfer to a contour
  renderer unchanged.
- The instrument-panel treatment (D-18) was chosen with the inline parameter-source annotations
  visible in the layout, not as an afterthought: "expense ratio 0.90% <- ProShares UPRO
  prospectus" sits beside the control itself.

</specifics>

<deferred>
## Deferred Ideas

- **Keeping the last N data bundles deployed and addressable**, so a permalink created against an
  older bundle reproduces faithfully rather than only reporting that the data changed. This is the
  stronger half of SHARE-02. It is deploy and build infrastructure (`MANIFEST_PATH` currently
  points at exactly one manifest) and is not required to satisfy SHARE-02 as written. Candidate
  for Phase 8, alongside the other sharing work.
- **The tier selector with each tier's meaning on screen (APP-02) and the extended-tier bias
  warning with its quantified magnitude (CRED-02)** are Phase 5 by roadmap. D-09 pins strict in
  Phase 4 and carries the param so Phase 5 adds a control, not a migration.
- **Restarting a fresh position after ruin** remains out of scope, as recorded in Phase 3's D-21.
- **PNG export, CSV export and preset scenarios** (SHARE-04/05/06) are Phase 8. D-20 designs the
  region for them without building them.

</deferred>

<findings>
## Findings (not decisions -- recorded for the researcher and planner)

- **F-01: Maximum drawdown has no implementation anywhere.** METR-03 is a Phase 4 requirement and
  ROADMAP criterion 2 names it, but `KernelResult` (`src/kernel/backtest.types.ts`) returns no
  drawdown field and no module computes one. Phase 4 must give it a home. The choice interacts
  with two existing constraints: SIM-11 says the kernel allocates nothing and writes into
  preallocated buffers, so a running peak tracked inside the loop is nearly free, whereas a
  post-hoc pass over `outValue` costs a second traversal per run; and METR-06 (Phase 7) requires a
  sweep to compute every display metric in a single pass per cell, which argues for the in-loop
  option so Phase 7 does not need a second implementation. This is a real design decision, not an
  oversight to paper over, and it was not discussed.
- **F-02: PERF-07 and PERF-08 have no measurement method yet.** Five budget rows (07a, 07b, 08a,
  08b, 08c) are declared with `implementedInPhase: 4` and currently read `unmeasured`. How cold
  load, warm load and long tasks get measured in the Vitest browser harness against a real
  production build, and how a verdict is issued given the +/-13% single-run and +/-20% two-run
  noise band from the resolved WINDOWS #2 entry, is unresolved. Criterion 5 depends on it.
- **F-03: The Vite scaffold does not exist and is substantial.** No `vite.config.ts`, no
  `index.html`, no `src/app/`, no Solid, no uPlot, no PWA plugin. `package.json` currently has one
  runtime dependency (comlink). The scaffold, the `_headers` file, the Cloudflare Pages build and
  the service worker are all new, and plan sizing should reflect that rather than treating the UI
  as the only new work.
- **F-04: The landing state was not discussed.** What the app shows before a user touches anything
  (a default run, an empty state, or a prompt) is undecided. It is also the state most likely to be
  screenshotted and the one PITFALLS G3 and D2 both bear on, since a default entry date and default
  leverage are themselves a claim. Worth resolving during UI-SPEC or planning.
- **F-05: The porkchop framing may change Phase 6's renderer.** See the Specific Ideas section.
  Recorded here as well because it is an input to a later phase, not a Phase 4 decision.

</findings>

---

*Phase: 4-First Defensible Backtest in the Browser*
*Context gathered: 2026-08-19*
