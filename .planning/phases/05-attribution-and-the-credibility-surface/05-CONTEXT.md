# Phase 5: Attribution and the Credibility Surface - Context

**Gathered:** 2026-08-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 shipped a browser app that produces one defensible number and a link that reproduces it.
Phase 5 makes that number *checkable*. It adds the two surfaces PROJECT.md names as the reason
the tool exists: a decomposition that says which mechanism consumed the money, and a credibility
surface where a skeptic can inspect every assumption without leaving the page or running code.

**In scope:** the ATTR-01/02/03 cost decomposition and its zero-cost comparison; the VALID-04
in-app synthetic-versus-real view; the CRED-01 always-on provenance surface; the APP-02 tier
selector with the CRED-02 extended-tier bias warning and its CRED-03 quantified magnitude; the
CRED-04 methodology page; CRED-05 defaults-as-defaults across the whole parameter surface; and
a PERF-07b re-measurement proving attribution's extra evaluations stay inside 16ms.

**Out of scope (each is a live requirement elsewhere, named so it is not accidentally absorbed):**
the entry-date x leverage heatmap and its sweep engine (Phase 6 design, Phase 7 implementation),
including METR-06 and the VIZ-10 overlapping-windows copy; PNG export, CSV export and named
preset scenarios (SHARE-04/05/06, Phase 8); retaining older data bundles so an old permalink
reproduces faithfully (deferred from Phase 4).

**Explicitly not a scope question:** Phase 4's D-09 already put `tier` in the permalink and D-12
already settled that a parameter change which invalidates the entry date is *explained*, never
snapped. Phase 5 adds a control over an existing param. It is not a migration.

</domain>

<decisions>
## Implementation Decisions

### Cost Decomposition (ATTR-01, ATTR-02)

- **D-01:** **Components are measured by counterfactual runs, not by summing in-loop accruals.**
  Each component's size is the difference between two final values with a factor switched on or
  off. This reconciles to the total gap by construction, which is what ATTR-02's "without an
  unexplained residual" demands. Rejected: summing the `financingCost` and `expenseCost` terms
  the kernel already computes per bar and discards. Those are *contemporaneous* dollars, not
  terminal impact -- a dollar of financing paid in 1990 cost far more than a dollar by 2026
  because it never compounded -- so they cannot reconcile to the gap, and volatility drag has no
  per-bar accrual to sum at all. Also rejected: shipping both and cross-checking, which doubles
  the surface to explain for a secondary figure nobody asked for.
- **D-02:** **The naive baseline is `initial * (1 + L * cumulativeReturn)`,** PITFALLS A1's exact
  error and the literal form of the internet argument this tool exists to settle. This is forced
  rather than chosen: ATTR-01 names volatility drag as a component, and drag only exists as a
  measurable quantity if the baseline applies leverage to the cumulative return. A
  daily-compounded zero-cost baseline has no drag term in it at all.
- **D-03:** **Interaction terms are allocated by Shapley value over all orderings, not by a fixed
  ladder.** The three factors interact multiplicatively, so a sequential ladder's order silently
  decides which component absorbs the interaction. Shapley averages each factor's marginal
  contribution across all 6 orderings (8 subset evaluations), is order-independent, and still
  reconciles exactly. The reason is adversarial, not aesthetic: "you picked the order that
  flatters your point" is a real objection a fixed ladder cannot answer. Rejected: the natural
  narrative ladder (drag, then financing, then ER), which is cheaper and easier to state but
  measures both cost rungs against an already-drag-reduced path. Also rejected: the reverse
  ladder, which parks the whole interaction inside drag.
  -- **Reversibility:** costly -- the reported component values are what users screenshot and
  quote. Changing the allocation later changes every previously published figure, and the
  methodology page will have stated the method.
- **D-04:** **A component may be reported as a gain, signed, with no reframing.** In a sustained
  uptrend daily compounding beats naive `L*R`, so volatility drag comes out *negative* -- a gain
  -- over a run like the 2010s, and the three shares stop reading as 0-100%. The panel says so:
  "volatility drag: +$X (compounding helped)", shares are allowed to exceed 100% or go negative,
  and copy explains it. This is the single strongest available proof that the tool is not built
  to make leverage look bad. Rejected: renaming the row by sign ("compounding benefit"), which
  gives one mechanism two names and makes two screenshots of the same tool incomparable. Also
  rejected: suppressing the percentage half of ATTR-02 whenever a component flips sign, which
  removes the reconciliation from exactly the runs people most want to quote.
- **D-05:** **With contributions on, the naive rung is per-cash-flow.** Each contribution grows by
  `1 + L * (index cumulative return from its own bar to the end)` and the naive final value is
  their sum. Well-defined for any schedule, and the honest generalization of the naive claim.
  Rejected: restricting attribution to lump-sum runs, when ATTR-01 says "for any single run" and
  a contribution schedule is one of the tool's headline features. Also rejected: computing
  attribution against a same-total lump sum at the entry date, which describes a run that is not
  the run on screen.
- **D-06:** **ATTR-02's percentages are each component's share of the total gap, not %/yr.** Each
  row shows dollars plus its share of `naive - actual`, and the shares visibly sum to 100%
  (subject to D-04's signed case). The reconciliation ATTR-02 demands becomes self-evident on
  screen rather than asserted. Rejected: annualized %/yr, which is comparable across run lengths
  but does not visibly sum to anything. Also rejected: all three figures per row, which turns a
  three-row answer into a spreadsheet dump.

### Attribution Presentation (ATTR-03)

- **D-07:** **The naive curve is a permanent ghost series on the equity chart.** A second muted
  uPlot series, on by default, never behind a toggle. ATTR-03's purpose is that a user's own
  assumption sits beside what actually happened, and a comparison you have to flip between is
  absent from every screenshot. Rejected: a zero-cost mode that swaps the whole result, which is
  cleaner but loses the visible divergence of two curves over time. Also rejected: a naive-value
  row in the panel with no second curve.
- **D-08:** **The attribution breakdown is always visible, directly under the metrics panel.**
  Three signed component rows plus the naive/actual pair, permanently in the result column,
  inside Phase 4's D-20 screenshot region. PROJECT.md names attribution the headline feature; a
  collapsed disclosure is absent from the deliverable, which is the screenshot. Rejected: an
  expandable disclosure collapsed by default. Also rejected: tabbing the result column into
  Curve / Attribution / Validation, which would pre-build Phase 7's slot structure at the cost of
  never showing two things at once.

### Synthetic-versus-Real Validation (VALID-04)

- **D-09:** **The comparison is its own always-reachable section with its own canonical
  parameters,** independent of whatever run the user currently has on screen. It says the same
  thing to every skeptic regardless of the app's current state, and it is one permalinkable place
  to send someone mid-argument. Rejected: an overlay that appears on the main chart whenever the
  current run has a real counterpart -- it needs no navigation, but it exists for a narrow slice
  of the parameter space and collides with D-07's ghost curve already on that chart. Also
  rejected: folding it into the methodology page, when VALID-04 exists precisely because
  "visible in the app, not only in tests" was judged too weak a bar.
- **D-10:** **The synthetic is built from a fixed canonical config, but the user's cost parameters
  flow through live.** Leverage pinned at 3x, the **total-return leg forced** (Phase 3's amended
  D-10: pairing a financing charge with a dividend-stripped return leg was the entire ~7%/yr Gate
  2 residual), and the window pinned per fund to the resolved inception overlap. What is *not*
  pinned is the expense ratio and financing spread: an edit in the control column moves the
  tracking error on screen, so a skeptic can watch the model fail when a cost is mis-set. That
  turns CRED-05's editability into a live demonstration rather than a claim. Rejected: mirroring
  the user's current run, which is meaningless at 5x and actively wrong in price-return mode.
  Also rejected: rendering static committed figures, which reads as a claim about the model
  rather than a demonstration of it.
- **D-11:** **The tracking-error figure is computed live in the browser through
  `computeTrackingError`.** Phase 3's D-12 header already names the in-app view as its third
  intended caller, alongside the tests and the CI data-change check, and D-12 exists so there is
  exactly one implementation for all three. Rejected: emitting the gate's figure into a generated
  module at build time, which is faster and provably identical to what CI enforces but freezes on
  the committed cost defaults, making D-10's live demonstration impossible.
- **D-12:** **Both D-11 gates plus the full rate-regime sub-window table are shown, including the
  rows that look worst.** Tracking error, return drift, and the per-regime breakdown -- which
  includes the post-2022 high-rate drift of +0.94% (UPRO) and +1.12% (TQQQ) that Phase 3 recorded
  as an unacted-on observation hinting the financing spread may be slightly under-priced.
  Publishing the unflattering sub-window is the most credible thing on the page, and the figures
  are already computed. Rejected: headline gates only, which satisfies VALID-04 and leaves the
  known weak spot disclosed only in the repo.

### Provenance Surface (CRED-01)

- **D-13:** **A dense provenance strip sits between the parameter column and the result,** inside
  Phase 4's D-20 screenshot region: active tier, effective date range, source names, the seams
  the run crossed, and the bundle version. A pasted screenshot therefore carries its own
  provenance, which is what CRED-01's "at all times" is for. Rejected: a block at the foot of the
  parameter column, which sits with the inputs it describes but falls outside the screenshot
  rectangle. Also rejected: a page footer -- the position PROJECT.md rules out by name
  ("Provenance is visible, never a footnote").
- **D-14:** **Only the seams the active run window actually crosses are shown at all times,** in
  full with their dates and methods; the remaining seams for that series are one click away. The
  disclosure is then specific to the number on screen rather than a generic dataset blurb.
  Rejected: a seam count with the detail behind a click, which is constant-size and never
  misleads but is exactly the kind of thing a reader skips. Also rejected: every seam for the
  active series inline, which overflows the strip on the deep-history series where seams matter
  most.
- **D-15:** **The app names its sources and does not surface licence terms.** Source names and
  links in the strip; no licence or redistribution status rendered anywhere in the UI. Redistribution
  terms are a fact about the project, not a caveat about the number, and putting them in the
  result region invites reading them as a data-quality warning. Consequence accepted knowingly:
  `sources.ts` and the manifest carry `license` and `termsUrl` text that the app never renders,
  so those fields have no UI consumer keeping them honest. Rejected: licence status inline per
  source. Also rejected: stating the Yahoo and Nasdaq accepted-risk positions on the methodology
  page (this was raised and declined; the record stays in PROJECT.md Key Decisions).
- **D-16:** **A test fails the build when the strip renders a provenance string that does not
  trace to a manifest field.** CRED-01's "generated from manifest provenance" becomes enforced
  rather than declared, in the spirit of the existing SIM-10 module-boundary assertion. Without
  it, a later well-meant edit appending explanatory prose goes stale silently and a UI label
  drifts from the data it describes. Rejected: relying on types alone -- free and immediate, but
  it constrains the input, not the output.

### Methodology Page (CRED-04)

- **D-17:** **A full-screen overlay opened by a URL param, not a route.** `?methodology=1`
  appended to the existing permalink opens it over the app; closing it strips the param and the
  run behind it is untouched. No router dependency, the run's exact parameters survive the trip,
  and the D-04 service worker already precaches it. Rejected: a hand-rolled hash route, which
  gets a working back button but introduces a second, differently-shaped routing mechanism
  alongside a state contract that is entirely query params. Also rejected: a separate static page
  in the Vite build, which is independently linkable but leaves and re-enters the app, so the
  current run has to be round-tripped or lost.
  -- **Reversibility:** costly -- `methodology` becomes part of D-13's published, one-way
  permalink param contract the moment a link carrying it is shared.
- **D-18:** **The page is generated from the code's own registries wherever a structured source
  exists.** Cost parameter values, their VERIFIED/CITED/ASSUMED confidence levels and their
  citations from `src/validation/cost-parameters.ts`; the two day-count bases from the kernel
  constants; sources and seams from the manifest; the tolerance breakdown from
  `TOLERANCE_MECHANISMS`. Prose is written only for the narrative connecting them. A parameter
  change cannot leave the page stale, which is PITFALLS G1's failure mode. Rejected:
  hand-authored prose with a test asserting the quoted numbers match the registries -- better
  reading, but the test has to parse prose to find numbers. Also rejected: hand-authored and
  unchecked.
- **D-19:** **All four known limitations are stated, including the ones that hand a skeptic
  ammunition.** (a) The extended tier's bias and its direction: interpolated monthly data smooths
  daily volatility, understating drag and making leverage look better than it was in exactly the
  pre-1954 era the tier exists to reach. (b) The financing spread is ASSUMED, not cited, after
  five retrieval attempts including two full N-CSR reads found no fund itemizing swap financing
  spread -- the most load-bearing cost parameter is the one with the weakest sourcing. (c) The
  gate tolerance is weaker than its number: roughly 3.2-3.5% of the 3.955% tolerance is
  premium/discount noise from using Yahoo market closes rather than fund NAV, and TQQQ's margin
  against it is a thin ~11%. (d) The post-2022 high-rate sub-window drift hints the spread may be
  under-priced, together with why Phase 3 deliberately left it alone (VALID-03 forbids adjusting
  a cost parameter to close a measured gap).

### Tiers and Defaults (APP-02, CRED-02, CRED-03, CRED-05)

- **D-20:** **No gate on the extended tier; every extended result carries the warning instead.**
  The tier is one click, and the CRED-02 warning plus its CRED-03 magnitude render on every
  extended-tier result, inside the screenshot region. Rejected: a one-time acknowledgment before
  first use -- it guarantees the driver saw the bias once, but acknowledgment state is not in the
  URL, so a link recipient never sees it, and the person this tool exists to convince arrives by
  link. Also rejected: relegating the warning to the D-13 provenance strip, when CRED-02 says
  "prominent" and a line in a dense strip is its opposite.
- **D-21:** **The CRED-03 magnitude is a build-time figure, committed and tested.** A test
  downsamples a known-good daily era to monthly, interpolates it back, re-runs, and emits the
  measured gap into a generated module the warning renders. Stable, citable, free at runtime, and
  CI catches it moving when the data does. The chosen era and symbol become a stated methodology
  choice on the CRED-04 page. Rejected: computing it live for the current symbol and window --
  a stronger disclosure, but it adds a second full simulation path (downsample, interpolate,
  re-run) to every parameter change, against a 16ms budget D-03's eight evaluations already draw
  on. Also rejected: a per-symbol committed table, deferred as a refinement rather than declined
  on merit.
- **D-22:** **Every parameter carrying a shipped default is labelled as being at its default, and
  offers a reset.** Not just expense ratio and financing spread (Phase 4's D-18 inline citations)
  but leverage, entry date, holding mode, initial investment, contribution amount and frequency,
  tier and dividend mode. PITFALLS G3 is about defaults being a claim, and a default entry date
  is a far bigger claim than a default expense ratio. Rejected: labelling only the two parameters
  with a sourced value, which is sharp and already half built but leaves the most cherry-pickable
  parameter in the tool unlabelled. Also rejected for now: a global reset-everything control (see
  Deferred Ideas).
- **D-23:** **A cold arrival with no URL params lands on a neutral default run, visibly at its
  defaults.** The app shows something real on first contact, which is what makes it persuasive,
  and every control reads as at-default so the run is a starting point rather than an argument.
  The entry date needs a *rule* that is defensible in one sentence -- the longest window the
  strict tier allows for the default symbol -- never a hand-picked date. This closes Phase 4's
  F-04. Rejected: an empty pane until the user sets an entry date, which cannot be accused of
  choosing a window but meets every link arrival with a form. Also rejected: landing on a
  deliberately unflattering window, which is a strong credibility signal and also a cherry-pick
  in the other direction; naming canonical scenarios is Phase 8's SHARE-06.

### Claude's Discretion

- Component decomposition inside the Solid app, and how the attribution/validation/methodology
  surfaces are factored relative to the existing `ResultColumn` components.
- The exact query-param name and value format for D-17's methodology overlay, subject to D-13's
  "every param, always, readable" contract.
- Which known-good daily era and symbol D-21's downsample test uses, and the interpolation method
  it inverts (it must match what the bundle compiler actually does, not a plausible substitute).
- The visual treatment of the D-07 ghost curve (dash pattern, opacity, legend copy), subject to
  it being unmistakably subordinate to the real series.
- Whether the D-09 validation section is separately permalinkable. Not discussed; recommended,
  since "here is the link where the model is checked against the real product" is a strong move
  in an argument.
- Numeric formatting of signed attribution components, reusing `src/metrics/format.ts` rather
  than adding a second formatter.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The attribution math must not contradict these
- `src/kernel/backtest.ts` -- the exact recurrence the counterfactual runs vary. Note the two
  distinct day-count bases (financing actual/360, expense actual/365) and that financing is
  scaled by `(leverage - 1)`, so it is structurally zero at 1x without a branch.
- `src/kernel/backtest.types.ts` -- `KernelParams` (`financingSpread`, `expenseRatio` are
  annualized FRACTIONS, never percentages), `KernelResult`, and the three day-count constants
  D-18 generates the methodology page's conventions section from.
- `.planning/research/PITFALLS.md` §A1 -- the naive `L * cumulativeReturn` error that D-02 makes
  the baseline. §A2, §A4, §A6 -- financing, expense day-count and product spread, the three
  mechanisms the decomposition names. §A9 -- overfitting the cost model to the validation target,
  which D-10's live cost-parameter pass-through must not become a tuning affordance.

### Validation view (VALID-04)
- `src/validation/tracking-error.ts` -- `computeTrackingError`, `TrackingErrorWindow`,
  `TrackingErrorResult`. Its header names the in-app view as its third intended caller (D-11).
- `tests/validation/upro-tqqq-gate.test.ts` -- **read this before planning D-09/D-12.** The
  synthetic construction, overlap-window resolution, series slicing, return derivation and the
  two rate-regime era boundaries (`NEAR_ZERO_RATE_ERA_END = '2015-12-31'`,
  `HIGH_RATE_ERA_START = '2022-01-01'`) all live inside this test file as private helpers. See
  Finding F-01.
- `.planning/phases/03-simulation-kernel-and-the-upro-tqqq-gate/03-GATE-DIAGNOSIS.md` -- why the
  synthetic is built from the total-return index. D-10 depends on this directly.
- `.planning/phases/03-simulation-kernel-and-the-upro-tqqq-gate/03-CONTEXT.md` -- D-11 (the two
  gates), D-12 (one shared tracking-error implementation), D-13 (sub-windows report but do not
  gate), and the amended D-10 banner.
- `src/validation/cost-parameters.ts` -- `COST_PARAMETERS` with per-parameter confidence and
  citations, `TOLERANCE_MECHANISMS`, `TOLERANCE_SAFETY_FACTOR`, `RETURN_DRIFT_TOLERANCE`,
  `TRACKING_ERROR_TOLERANCE`. D-18 generates from this; D-19(b) and D-19(c) quote it.

### Provenance and tiers
- `tools/bundle-compiler/src/manifest.ts` -- `Manifest`, `ManifestSeries` (`sources[]` with
  `license`/`termsUrl`, `seams[]`, `tiers.strict`/`tiers.extended`). D-13/D-14/D-16 render from
  this and nothing else.
- `tools/bundle-compiler/src/seams.ts` -- `SeamRecord`, and specifically `degradesToNonDaily`,
  the boolean `computeTierRanges` scans. Tier boundaries never depend on the free-text `method`
  string, and neither should any UI copy about them.
- `src/data/bundle-source.ts` -- `LoadedBundle` carries the parsed `manifest`, so every field
  D-13 needs is already in browser memory.
- `.planning/phases/02-compiled-data-bundle/02-CONTEXT.md` -- the binary format, seam records and
  tier computation the provenance strip surfaces.

### Prior-phase decisions that bind this phase
- `.planning/phases/04-first-defensible-backtest-in-the-browser/04-CONTEXT.md` -- D-09 (tier
  already in the permalink), D-12 (an evicted date is explained, never snapped), D-13 (every
  param always, one-way contract, feeding D-17), D-18 (inline source citations, feeding D-22),
  D-20 (the screenshot region, feeding D-08/D-13/D-20), D-21 (the result column is a slot Phase 7
  claims), and **F-04** (the landing state, closed here by D-23).
- `.planning/phases/04-first-defensible-backtest-in-the-browser/04-UI-SPEC.md` -- the tokens,
  spacing and component inventory Phase 5's new surfaces must extend rather than restate.

### Presentation pitfalls this phase answers to
- `.planning/research/PITFALLS.md` §G1 -- undisclosed methodology, feeding D-17/D-18.
- `.planning/research/PITFALLS.md` §G2 -- unlabeled data provenance, feeding D-13/D-14/D-16.
- `.planning/research/PITFALLS.md` §G3 -- defaults that look chosen to favor a conclusion,
  feeding D-22/D-23.
- `.planning/research/PITFALLS.md` §D2 -- cherry-picked windows, by the tool's own defaults as
  well as by its users, feeding D-23.
- `.planning/research/PITFALLS.md` §B2 -- monthly-to-daily rate interpolation bias, the mechanism
  CRED-02 warns about and D-21 quantifies.
- `.planning/research/PITFALLS.md` §C4 -- Shiller granularity mismatch in the extended tier.
- `.planning/research/PITFALLS.md` §E6 -- log-scale equity curves, and specifically that log
  cannot plot zero or negatives. D-07's ghost naive curve inherits this (see Finding F-02).

### Performance
- `perf-budgets.ts` -- PERF-07b (16ms coalesced recompute) is the row ROADMAP criterion 5 names.
  It is already measured from Phase 4; Phase 5 re-measures it with attribution live.
- `.planning/PROJECT.md` §Key Decisions -- the PERF-03 D-20 escalation. PERF-03 sits at 80.8% of
  budget on the D-17 baseline, so anything Phase 5 adds on a code path Phase 7's sweep will share
  must be measured before it lands.
- `.planning/WINDOWS.md` entry 2 -- normalized residual is 6.36% over 13 runs, so a single CI run
  supports a headroom claim only to roughly +/-13%.

### Requirements
- `.planning/REQUIREMENTS.md` -- ATTR-01, ATTR-02, ATTR-03, CRED-01 through CRED-05, VALID-04,
  APP-02.
- `.planning/ROADMAP.md` §"Phase 5" -- the five success criteria.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `runBacktest` (`src/kernel/backtest.ts`) takes leverage, financing spread and expense ratio as
  plain `KernelParams` scalars, so three of D-03's four kernel-arm evaluations are the same call
  with a parameter zeroed. No kernel change is needed for the counterfactual runs themselves.
- `computeTrackingError` and its two component functions are already free of test context, kernel
  imports and data-layer imports, and take `Float64Array` plus numbers -- directly callable from
  browser code (D-11).
- `COST_PARAMETERS` is a structured registry with `value`, confidence tier and citation per entry,
  and `TOLERANCE_MECHANISMS` carries per-mechanism scope, direction and `measured` flags. D-18's
  generated methodology page has real structure to render, not just constants.
- `LoadedBundle.manifest` is already in browser memory after `initializeApp`, carrying every
  `sources`, `seams` and `tiers` field the D-13 strip needs.
- `src/metrics/format.ts` is the existing formatting contract; signed attribution components and
  the D-06 gap shares should extend it rather than introduce a second formatter.
- `src/app/components/ParameterColumn/SourceCitation.tsx` is the D-18 inline-citation component
  D-22 generalizes across the rest of the parameter surface.
- `src/app/permalink.ts` already declares `tier` as a param with a validated decode, so D-17's
  methodology param joins an established pattern (`PARAM_KEYS` plus an encode/decode arm).

### Established Patterns
- The kernel imports nothing from the data, sweep or chart layers (SIM-10), asserted by a test.
  Attribution must not create a second path into it.
- The kernel allocates nothing in its hot loop and writes into caller-preallocated buffers
  (SIM-11). D-01's counterfactual runs need their own preallocated output buffers, allocated once
  per run window and not per frame, since Phase 4's D-03 re-runs on every animation frame.
- Rate values in the bundle are `percent-annualized` and are divided by 100 exactly once, in the
  data layer. Attribution code takes fractions, like the kernel.
- Re-runs are coalesced to one per animation frame (Phase 4 D-03). Attribution's extra evaluations
  ride inside that same coalesced pass, not as separate scheduled work.
- Every performance figure goes through `normalize()` and lands in `.bench/bench-results.json`
  with a verdict. Criterion 5's measurement is a re-measurement of PERF-07b, not a new budget row.
- Vitest browser mode (Playwright-backed) runs anything the browser actually executes.

### Integration Points
- `src/app/state.ts` -- `currentKernelResult`, `currentDerivedMetrics` and `scheduleRun` are where
  attribution's counterfactual results and the D-13 provenance projection attach.
- `src/app/components/ResultColumn/` -- D-08's panel is a sibling of `MetricsPanel.tsx`; D-07's
  ghost series is a second series in `EquityCurveChart.tsx`, which already handles a log axis and
  a repaint-on-theme-change.
- `src/app/components/ParameterColumn/` -- D-22 touches every control component, since each needs
  to know its own default and render an at-default state.
- `src/data-bundle.generated.ts` is the existing compiler-emitted module; D-21's committed CRED-03
  figure should follow the same generated-module pattern rather than invent a new one.

</code_context>

<specifics>
## Specific Ideas

- **The credibility surface is adversarial by design.** Three separate decisions in this phase
  (D-04 rendering a negative drag as a gain, D-12 publishing the unflattering high-rate
  sub-window, D-19 stating that the gate tolerance is weaker than its number) were chosen
  specifically because they hand a skeptic the criticism before the skeptic finds it. The pattern
  is deliberate and downstream agents should preserve it rather than soften any of the three into
  a milder statement.
- **The screenshot is the deliverable.** D-07, D-08, D-13 and D-20 all resolved the same way for
  the same reason: anything behind a toggle, a disclosure or an acknowledgment is absent from a
  pasted image, and a pasted image is how this tool is used in an argument.
- **The methodology page should read as receipts, not as a defense.** D-18's generated-from-code
  approach exists so the page is a rendering of what the model actually is, which is a materially
  different artifact from prose describing what the authors believe it to be.

</specifics>

<deferred>
## Deferred Ideas

- **A global "reset everything to defaults" control.** Raised while deciding D-22 and set aside:
  it makes "show me your baseline" one click for a skeptic, but it can destroy a run someone was
  mid-way through building. Revisit alongside Phase 8's preset scenarios (SHARE-06), where a
  named-scenario picker is the natural home for "jump to a known state".
- **A per-symbol table of CRED-03 bias magnitudes** rather than D-21's single representative
  figure. More specific and still free at runtime; deferred as a refinement, not declined.
- **Surfacing the Yahoo and Nasdaq accepted-licence-risk positions in the app.** Raised under
  D-15 and declined. The record stays in PROJECT.md Key Decisions and `tools/fetch-data/src/sources.ts`.
- **Keeping the last N data bundles deployed and addressable** so an old permalink reproduces
  faithfully rather than only reporting the data changed. Carried over unchanged from Phase 4;
  Phase 8 candidate.
- **The overlapping-windows caveat (VIZ-10)** is Phase 6/7, not here. It is a statement about the
  heatmap's sample, and this phase's credibility surface is about a single run's assumptions.

</deferred>

<findings>
## Findings (not decisions -- recorded for the researcher and planner)

- **F-01: every helper VALID-04 needs is currently private to a test file.** The synthetic
  construction, the overlap-window resolution, `readSeriesLevels`, `sliceLevelsToWindow`,
  `deriveReturns`, `localIndexAtOrBefore`/`localIndexAtOrAfter`, `MIN_OVERLAP_YEARS`, the
  `LEVERAGE = 3` pin and both rate-regime era boundaries all live inside
  `tests/validation/upro-tqqq-gate.test.ts`. `computeTrackingError` is shared; nothing that
  *builds its inputs* is. The in-app view either extracts them into `src/validation/` and has the
  gate test consume the extraction, or duplicates them -- and duplication is exactly what Phase 3's
  D-12 was written to prevent. The extraction is the larger part of D-09/D-11/D-12's real cost and
  plan sizing should say so.
- **F-02: D-07's ghost naive curve has a log-axis problem the real curve does not.** Naive
  `L * cumulativeReturn` goes *negative* once the index falls more than `1/L` -- a 33.4% index
  drawdown at 3x, which the 1929-1932, 2000-2002 and 2008-2009 windows all clear comfortably.
  A log axis cannot plot it, and unlike ruin it is not an absorbing state: the naive curve can
  come back. Phase 4's D-07 ruin terminator is the nearest existing pattern but is not the same
  case. The quick-260820-4qx fix (`log-axis-splits.ts`) is directly relevant, since it exists
  because a series approaching zero already killed the renderer once. Unresolved and load-bearing.
- **F-03: Shapley's non-compounding arms need a cost model that does not exist.** Four of D-03's
  eight subset evaluations have daily compounding switched OFF but financing and/or expense
  switched ON. There is no defined meaning yet for "naive `L*R` with financing but without
  expense ratio". The consistent resolution is to apply costs as simple, non-compounded
  annualized deductions over elapsed calendar time on the naive path, using the same two
  day-count bases -- but that is a modelling choice the researcher must state and justify on the
  CRED-04 page, not one to make silently in an implementation. The reconciliation identity holds
  for any consistent definition; the *interpretation* of each component does not.
- **F-04: PERF-07b's re-measurement is not free of Phase 7 consequences.** Criterion 5's 16ms
  check covers a single-run parameter change, and four kernel arms at ~0.21ms plus four
  closed-form arms is comfortable. But PERF-03 (the 10,000-cell sweep) already sits at 80.8% of
  its 1000ms budget on the D-17 baseline. If attribution figures are ever wanted per heatmap cell,
  the multiplier lands on the number with the least headroom in the project. Worth stating in
  Phase 5's output so Phase 6/7 inherit it explicitly rather than rediscover it.
- **F-05: D-15 leaves `license` and `termsUrl` without a UI consumer.** Both fields are authored
  in `tools/fetch-data/src/sources.ts`, copied by the compiler into the manifest, and -- under
  D-15 -- rendered nowhere. Phase 2's D-06 rationale for recording them per source assumed the
  Phase 5 methodology page would render them. That assumption is now false. The fields should stay
  (they are the provenance record), but nothing tests that they are correct or current.

</findings>

---

*Phase: 5-Attribution and the Credibility Surface*
*Context gathered: 2026-08-20*
