# Phase 7: Sweep Engine and the Heatmap - Research

**Researched:** 2026-08-22
**Domain:** Off-main-thread numerical sweep compute (Worker pool over the existing kernel), Canvas 2D contour/heatmap rendering, Solid.js reactive state extension, progressive/cancellable async UI
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

> This entire section is copied verbatim from `07-CONTEXT.md`, gathered 2026-08-22. It is
> reproduced in full because it is the binding contract for this phase's plan; every decision
> below is LOCKED, not a suggestion, and the "Claude's Discretion" and "Deferred Ideas"
> subsections define the remaining freedom and the explicit out-of-scope boundary respectively.

### Decisions

#### Axis domains, grid resolution and permalink

- **D-01:** **The leverage axis is fixed at 1x to 5x over 50 rows** (~0.08x steps), carrying Phase
  6's D-08 through to the shipped tool. This is the range real products occupy (SSO/QLD 2x,
  UPRO/TQQQ 3x) plus headroom, and it is fine enough that the breakeven boundary reads as a smooth
  curve rather than a staircase. Knowingly accepted: `PROJECT.md`'s own requirement text names 1x
  through 20x+, and `LeverageControl.tsx`'s single-run slider reaches 20x, so the sweep covers a
  narrower band than the single run. Rejected: 1x-20x (0.38x steps, and the 1x-3x band that
  actually gets argued about compresses into the bottom fifth); a non-linear leverage axis (a
  second non-uniform mapping on a panel whose colour scale is already symlog); a user-controlled
  max (two sweeps of the same data would produce different-looking pictures, weakening the
  paste-this-link premise).

- **D-02:** **The entry-date axis span follows the app's existing strict/extended tier control.**
  The heatmap sweeps whatever `activeTier()` resolves to for the selected symbol, reusing
  `src/app/bounds.ts` and the `ExtendedTierWarning` Phase 4 already built. **Consequence, stated
  rather than discovered later:** extended-tier SPX reaches 1927-12-30, so roadmap criterion 2's
  "1929-entry high-leverage sweep where ruin genuinely occurs" is reachable by flipping a control
  the app already has, with no new mechanism. Rejected: always sweeping full history (puts the
  interpolated-rate caveat permanently in competition with the VIZ-10 caveat for the same strip of
  copy); strict tier only (makes criterion 2 unverifiable on SPX and puts 1929, the tool's most
  persuasive data point, out of reach).

- **D-03:** **The grid stays 200 columns x 50 rows = 10,000 cells. Finding F-04's "coarser default
  grid" lever stays UNSPENT.** Every budget, bench and success criterion in this project is written
  against 10,000 cells, and PERF-03 passed at 80.8% of its 1000ms budget on the D-17 baseline.
  Keeping the count means the shipped figure stays directly comparable to Phase 1's locked
  measurement, and the lever remains in reserve for a real regression. Rejected: a coarser default
  with the full grid on demand (PERF-03's headline figure would stop describing the default view);
  resolution following panel width (cell count varies by viewport, so the sweep timing figure stops
  being one number).

- **D-04:** **Full sweep state joins the permalink.** Sweep mode, holding period, displayed metric,
  tier, symbol and cost parameters all encode into `src/app/permalink.ts` alongside the existing
  single-run fields, so a heatmap is exactly as linkable as a single backtest. This is the
  project's stated core value and Phase 8's curated permalinks depend on it.
  -- **Reversibility:** costly -- permalink fields are a published contract; links shared before a
  field is renamed or removed break silently.

#### Fill algorithm and the Finding A performance obligation

- **D-05:** **The polygon rebuild is the first attempt, per `06-HEATMAP-SPEC.md` Finding A's own
  ranking.** Rebuild form 2's base fill as band POLYGONS derived from the marching-squares geometry
  the renderer already computes and currently discards, instead of brute-forcing the fill per
  display pixel. If it lands, repaint cost drops from O(display area) to O(cells) and Finding A's
  whole dependent chain (the offscreen cache, the metric-switch breach, the panel-size ceiling, and
  zoom softness) evaporates.

  **The specific work this requires, stated so it is not discovered mid-plan:**
  `mockups/shared/iso-lines.ts` emits UNSTITCHED segments and says so in its own header, calling
  stitching "the genuinely hard part of marching squares" and skipping it deliberately because
  stroking never needed it. A fill does need it: per band, walk segments into closed rings, close
  rings along the field rectangle's own edge where a band runs off the side, and handle bands that
  enclose other bands as holes. Categorical regions (ruin, incomplete-hold) punch further holes in
  the field that the ring walker must handle. That stitching layer is the entire risk of D-05.

- **D-06:** **If the polygon path misses its gate, the executor ESCALATES to the owner. The
  fallback is NOT pre-authorized.** The plan names the polygon path; on a miss it checkpoints and
  asks before spending anything on plan B. The owner is deliberately in the loop at that decision.
  -- **Reversibility:** reversible -- this governs one checkpoint, not any shipped artifact.

- **D-07:** **The go/no-go gate is visual equivalence AND the repaint budget, not speed alone.** The
  polygon renderer must paint the same picture as the per-pixel sampler within tolerance and hit
  its repaint budget. Speed alone is insufficient: mis-stitched rings at a categorical boundary or
  at the field edge would be a wrong picture drawn quickly, and this project's premise is that the
  picture is defensible. This is the same "prove both paint the same picture before trusting either
  figure" discipline Phase 1 applied to `putImageData` versus `fillRect`. Rejected: repaint budget
  only; a bounded-effort criterion (a claim about effort rather than about the result, which a
  verifier cannot check).

- **D-08:** **The per-pixel sampler survives as the test oracle.** If the polygon renderer ships,
  `resampleField`'s per-pixel path stays in the test tree and a test asserts the two paths agree
  within tolerance. That test is what makes D-07's gate checkable.

- **D-09:** **The documented fallback, should D-06's escalation resolve in its favour: per-pixel
  resample, cached offscreen for pan and zoom, held inside 16ms by resampling BELOW display
  resolution and upscaling, with the boundary strokes drawn at full resolution on top.** The strokes
  are what keep band edges crisp under a soft fill, which is why this costs less visually here than
  it would on a form without stroked boundaries.

- **D-10:** **If no path holds 16ms at the shipped panel size, INTERNAL RESOLUTION gives. The panel
  keeps its full size and the 16ms budget stays locked.** Rejected: shrinking the panel (the
  heatmap is the phase's headline surface); relaxing PERF-05 (locked at its perception anchor under
  D-19/PERF-01a, and this project has escalated-and-recorded rather than relaxed at every prior
  opportunity). **Explicitly NOT a lever: cell count.** Under the per-pixel path, halving the grid
  still visits every display pixel and merely reads a smaller source array; repaint cost barely
  moves. Coarser cells buy sweep time (PERF-03), not repaint time (PERF-05). Under the polygon path
  cell count IS the cost driver, but there is no 16ms problem to solve there. This is recorded
  because the opposite intuition is natural and was corrected during discussion.

- **D-11:** **`mockups/shared/iso-lines.ts` and the winning fill module graduate into `src/`** (e.g.
  `src/heatmap/`), and the four committed mockups import them from there exactly as they already
  import `src/colorscale/value-to-color.ts`. This preserves D-28's stated reason for keeping the
  losing forms: a palette or band-level change re-renders all four so they stay judgeable against
  current reality.

#### Progressive paint and cancellation

- **D-12:** **First paint is coarse-to-fine in the same form.** Sweep a strided subsample first
  (roughly 1/16 of cells, ~600 backtests, comfortably inside PERF-04's 100ms), paint a COMPLETE
  low-resolution contour field, then refine to the full grid. **This is forced, not preferred:**
  marching squares needs a complete field, so a partially-filled grid produces garbage boundary
  curves. "Cells appear as workers finish" is not directly renderable under form 2. Requires a
  renderer that accepts a variable grid size. Rejected: flat fill during the sweep with contours
  added at completion (the first ~900ms would show a different chart than the last frame, and the
  traceable boundary the form exists for would be absent throughout); a two-stage form swap from
  form 1 to form 2 (a visible change of chart type mid-interaction reads as a glitch).

- **D-13:** **On cancellation (PERF-06), the previous complete field stays on screen.** Superseded
  results are discarded and never painted; the new sweep's coarse pass replaces the old field
  whole. No flash of empty. The staleness window this creates is bounded by D-12's 100ms coarse
  pass, which is why D-14 judges it too short to warrant an affordance.

- **D-14:** **No progress affordance. The field's own coarse-to-sharp refinement is the feedback.**
  No spinner, no bar, no percentage, no live cell count. This is what PERF-04's "never a blank pane
  with a spinner" asks for, and it keeps one fewer element competing with the legend, the axis
  labels and the caption strip.

#### Layout and how the heatmap joins the app

- **D-15:** **A Single run / Sweep mode switch at the top of the result column.** Sweep mode shows
  the heatmap, the slice charts, the legend and the caption strip; single-run mode shows Phase 4
  and 5's equity curve, metrics, attribution and validation unchanged. This is exactly what
  `App.tsx`'s D-21 reserved the single result slot for. Rejected: appending the heatmap below the
  existing stack (the page gets long, the sweep runs on every load, and a screenshot must be
  cropped to whichever half is being argued); replacing only the equity curve slot (Phase 5's
  panels were designed against one run and would need real rework to re-derive from a swept cell).

- **D-16:** **The VIZ-01 and VIZ-02 slice charts are marginal charts on both axes.** The
  fixed-leverage slice is a horizontal chart directly under the heatmap sharing its entry-date
  axis; the fixed-entry-date slice is a vertical chart beside it sharing its leverage axis. Each is
  literally one row and one column of the cached grid, so both are near-free to draw and update
  instantly with the crosshair, and the reader sees the 2D field and both 1D cuts as one picture.
  Rejected: a toggle between the three views (the relationship has to be held in the reader's head
  across a click); slices on hover only (invisible in a screenshot, and the screenshot is this
  project's delivery medium).

- **D-17:** **In sweep mode the existing entry-date and leverage controls drive the crosshair.**
  Same controls, same store fields, same meaning; nothing is disabled, removed, or duplicated, and
  switching modes preserves position. Rejected: disabling them (two dead controls and no way to
  name a cell); removing them (the column reflows on every mode switch and there is still no
  crosshair).

- **D-18:** **A fresh visit lands on Single run.** Cold load stays clear of PERF-08's 1500ms
  interactive budget rather than absorbing an ~800ms sweep, and the first thing a visitor sees is
  one defensible answer with its receipts, which is the stated core value; the heatmap is the
  follow-up to "how sensitive is that". A permalink carrying sweep mode lands on the sweep.

#### Hover, crosshair and drill-down

- **D-19:** **Hover shows a transient readout and a ghost crosshair; the committed crosshair, the
  slice charts and the permalink move only on click.** The reader can browse the field without
  destroying where they were, and the slice charts stay readable instead of thrashing under the
  pointer. Requires a clear visual distinction between the ghost and committed crosshairs.
  Rejected: hover driving everything live (slices unreadable while moving, no way to hold a
  position, and permalink writes on every mouse move); no hover at all (the deferred D-07 note
  argues the opposite, and pointing at the field is the first thing a reader will try).

- **D-20:** **The readout carries entry date, leverage, and EVERY metric the sweep computed for
  that cell**, not just the displayed one. METR-06 computes them all in one pass anyway, so this
  costs nothing and turns the readout into that cell's receipt rather than an echo of its colour.
  Needs a small layout, not a one-liner.

- **D-21:** **The pointer snaps to the nearest cell centre, with thin guide lines running out to
  both axes**, which the marginal slice charts already share. This makes ~4px cells pointable and
  makes the imprecision legible rather than hidden. Knowingly declined: keyboard nudge (see
  Findings).

- **D-22:** **Drill-down is the crosshair plus the mode switch.** Clicking a cell writes its entry
  date and leverage to the existing store; flipping to Single run then shows Phase 4/5's full
  receipts for exactly that cell. No new gesture, no new plumbing, and the two modes become one
  continuous investigation. Rejected: an action button inside a transient hover tooltip (awkward
  with D-19); double-click (undiscoverable, no touch equivalent).

#### Metrics

- **D-23:** **The metric toggle offers multiple-of-contributed (default), max drawdown, and one
  annualized metric.** Multiple-of-contributed is the metric `06-HEATMAP-SPEC.md` argues and whose
  symlog domain is already built. Max drawdown is D-04's named stress case for the colour design
  and is already tracked in-loop by the kernel at zero extra cost.

- **D-24:** **The sweep's annualized metric mirrors METR-01 and METR-02 exactly: IRR when
  contributions are non-zero, CAGR when they are zero, never both unqualified.** The reasoning is
  consistency, not performance: offering CAGR without IRR would paint an unqualified CAGR field
  precisely when the single-run view beside it is suppressing CAGR and showing IRR, so the same app
  would contradict itself on the same data. When contributions are zero, IRR degenerates to CAGR
  and nothing is lost. Rejected: both always (offers a metric the app elsewhere calls misleading);
  IRR only (pays IRR's cost in the zero-contribution default case where CAGR is free and
  identical).

  **The performance lead the researcher must chase before anyone accepts a slower sweep:**
  `src/metrics/irr.ts` is bounded bisection whose own header says it is sized for "a solve that
  runs once". Bisection to its 1e-9 tolerance over the `[-0.9999, 10.0]` bracket converges in
  roughly 33 iterations, not the 100 cap. More importantly, `npv` discounts each cash flow with
  `Math.pow`; on a regular monthly schedule the discount factors are a geometric progression, so
  `npv` can be a Horner-style loop with one multiply per flow and no `pow` at all. That reduces the
  grid-wide cost to roughly 40M multiplies, which is noise against PERF-03. Do not assume the
  current solver's cost is the cost.

- **D-25:** **Scale type follows the metric** (PITFALLS E1, explicitly deferred from Phase 6 as
  "Phase 7's metric toggle will force the question"). Diverging for metrics with a real threshold
  (multiple-of-contributed pivots at 1.0x, CAGR and IRR at 0%); sequential for pure magnitude (max
  drawdown has no meaningful midpoint, so a diverging scale would invent one). **The new sequential
  ramp must clear the same VIZ-07 perceptual-uniformity and colourblind-safety bar the diverging
  ramp passed**, including the measured perceptual-step-ratio assertion in
  `tests/value-to-color.test.ts`. Rejected: always diverging (max drawdown gets a meaningless
  midpoint, the exact hidden-threshold failure PITFALLS E1 names); dropping drawdown to keep one
  ramp.

- **D-26:** **Each metric carries its own FIXED, hardcoded colour domain**, extending D-16's
  reasoning, with clipping stated at the legend ends the way multiple-of-contributed's
  `"0.01x and below"` / `"100.00x and above"` labels already do. Rejected: fitting the domain to
  each sweep (two links showing the same colours would mean different numbers, which is fatal for a
  tool whose output is pasted into an argument); a fit-to-data toggle (Phase 6 deferred exactly
  this and named its cost: one more control and one more permalink field, plus screenshots that
  must state which mode produced them).

#### Sweep mode, holding period, and the two right-edge conditions

- **D-27:** **The sweep-mode toggle reuses `HoldingModeControl.tsx` and its existing naming.** That
  control already implements fixed-period versus open-ended, and it deliberately names the
  open-ended mode **"Hold to end of data (\<date\>)"**, rejecting "today" on the documented grounds
  that the bundle is refreshed manually and infrequently, so "today" is a promise the control
  cannot keep. **VIZ-04's literal "hold-to-today" wording is superseded by that decision.** Recorded
  here so the verifier reads the wording mismatch as a carried-forward decision, not a gap.

- **D-28:** **The two modes fail differently at the right edge, and get different treatments.** In
  fixed-period mode a hold that runs past the data end carries NO value and gets D-19's flat,
  out-of-scale grey (`INCOMPLETE_RGBA`), unchanged from `06-HEATMAP-SPEC.md` §4. In end-of-data
  mode every cell carries a real, correct value; the recent ones are simply short-horizon and not
  comparable to the left of the chart. Greying those would say "no value here" about cells that
  have one, so D-19's grey is the WRONG treatment for VIZ-09. Finding F-01 named the grey as the
  precedent to start from; this is where that precedent stops.

- **D-29:** **VIZ-09's short-horizon region is marked by a labelled vertical boundary with the
  cell colours left intact.** A rule at the entry date where the remaining horizon drops below a
  stated threshold, labelled with what it means (e.g. "right of here: under 3 years held"). Marks
  non-comparability without denying the data, and survives a cropped screenshot. The threshold is
  Claude's discretion but must be stated in the label, not implied. Rejected: progressive
  desaturation (a faded real colour is still a colour and invites reading a washed-out cell as a
  merely-poor outcome, the exact PITFALLS E5 failure the spec cites for rejecting faded colour on
  incomplete cells); reusing the grey (see D-28).

- **D-30:** **VIZ-04's mode statement lives in the caption strip with the VIZ-10 caveat**, directly
  under the grid, inside Phase 4's D-20 screenshot region, so both travel with any crop.
  `06-HEATMAP-SPEC.md` §6 already fixes the caveat's placement there and the mode statement is the
  same kind of claim about what the picture is. Rejected: a chart title (competes with the mode
  switch control and says the same thing twice); folding it into the axis label (easy to miss, long
  in fixed-period mode).

- **D-31:** **Ruin renders identically in both modes.** The D-18 hatch applies unchanged: a
  position that reached zero after eight months is a real, complete, categorical outcome, not a
  partial result. This resolves the open question `06-HEATMAP-SPEC.md` §11 lists as "ruin rendering
  under hold-to-today mode". **Consequence:** the hatch and D-29's short-horizon boundary can
  occupy the same region at the right edge and must read cleanly together. Rejected: suppressing
  the hatch right of the VIZ-09 boundary (hides the most important categorical outcome in the
  region readers argue about most).

- **D-32:** **Dragging the holding-period control live re-sweeps, with cancellation.** Each drag
  position starts a sweep, the prior one is cancelled and discarded per PERF-06, and D-12's coarse
  pass keeps a complete field on screen throughout. The user watches the breakeven boundary move as
  they drag. This is deliberately the hardest test of PERF-06 and PERF-07, which is a reason to
  build it rather than to avoid it. Rejected: commit-on-release (leaves the cancellation path
  unexercised in the one interaction that would exercise it); debouncing (a constant to tune, and
  the picture lags the control in a way that reads as lag).

#### Contour labels, zoom and pan

- **D-33:** **Only the breakeven curve is labelled, inline on the curve itself**, matching the
  emphasis it already carries (2px, `var(--color-text)`). That line is the entire premise of
  choosing this form. This partially closes Finding B. Rejected: labelling all ten `BAND_MULTIPLES`
  boundaries in contour-map convention (label placement along curves plus collision avoidance is
  real work on a phase already carrying Finding A, though it is the fullest realisation of why
  `BAND_MULTIPLES` was chosen and remains available later); no labels at all (a cropped screenshot
  loses the mapping entirely).

- **D-34:** **Zoom magnifies the already-rendered field; pan becomes meaningful only once zoomed
  past fit.** No re-sweep, no axis-range change; the axes rescale so they keep stating real dates
  and leverages. **This is a third argument for D-05 that Finding A does not make:** under the
  polygon path zoom is resolution-independent for free (re-fill the same paths under a new
  transform, still O(cells)), while under the per-pixel path a magnified cached bitmap goes soft
  past 1:1 and re-resampling at zoom costs a full repaint. Rejected: zoom re-sweeping a narrowed
  range at full resolution (genuinely more useful, but every step is an ~800ms sweep, directly
  contradicting PERF-09's 60fps, so it could only be a separate deliberate action); no zoom (PERF-09
  names pan and zoom explicitly, so dropping it needs a requirement change, not a design choice).

- **D-35:** **The zoom and pan viewport does NOT go in the permalink.** The link carries what the
  sweep computed; where the reader happened to be looking is not part of the argument. Keeps links
  short and stable, and a recipient always lands on the whole picture rather than someone else's
  crop.

### Claude's Discretion

- The exact stride and cell count of D-12's coarse pass, provided it lands inside PERF-04's 100ms
  and paints a complete field.
- Chunk size, chunk-per-worker ratio and the cancellation mechanism in the production pool.
  `bench/sweep-pool.ts` (`CHUNKS_PER_WORKER = 4`, `workerCountForCores`, `DEFAULT_CHUNK_TIMEOUT_MS`)
  is the precedent to read, not necessarily to copy: it partitions a synthetic series and does not
  handle cancellation at all.
- The production module layout under `src/` for the pool, the worker, the renderer and the
  geometry, subject to D-11.
- The per-cell metrics record layout and its transfer encoding (D-11's typed-array-and-scalar
  discipline in `backtest.types.ts` is the precedent).
- D-29's horizon threshold value, provided the label states it rather than implying it.
- The sequential ramp's stops for D-25, subject to VIZ-07 and to the same measured
  perceptual-step assertion the diverging ramp passes.
- The visual distinction between D-19's ghost and committed crosshairs.
- Legend adaptation for the sequential-scale metrics (the diverging legend's breakeven emphasis has
  no analogue when there is no threshold).
- Whether the sweep pool is shared with or separate from the single-run execution path.

### Deferred Ideas (OUT OF SCOPE)

- **Colouring the heatmap by attribution rather than outcome** -- financing cost, volatility drag or
  fee share of contributed. Arguably the project's most distinctive possible picture: not "did
  leverage pay" but "where does financing eat you". Deferred because VIZ-03 scopes the heatmap to
  outcome metrics, attribution is an input decomposition rather than an outcome, and it needs a new
  scale semantic (share of a total, not a multiple) plus Phase 5's attribution running per cell.
  Revisit once the sweep engine exists and the per-cell metrics record is proven.

- **Labelling all ten `BAND_MULTIPLES` boundaries in contour-map convention** (break the curve,
  inset the multiple, avoid collisions). D-33 takes only breakeven. This is the fullest realisation
  of why `BAND_MULTIPLES` was chosen over evenly-spaced ramp positions, and Finding B stays only
  partially closed until it is done.

- **Keyboard nudge of the crosshair** -- arrow keys stepping one cell with the field focused. Not
  selected under D-21, which leaves the canvas field pointer-only. See Findings.

- **Zoom that re-sweeps a narrowed range at full resolution**, giving genuinely more detail rather
  than bigger pixels. Rejected under D-34 because every step would be an ~800ms sweep against
  PERF-09's 60fps, but it would work as a separate deliberate action rather than a continuous
  gesture.

- **A fit-to-data colour domain as a user control.** Deferred from Phase 6, rejected again under
  D-26 for the same reason: it makes two links showing the same colours mean different numbers.

- **The full 1x-20x leverage range in the sweep.** D-01 keeps 1x-5x. `PROJECT.md`'s requirement text
  still names 1x through 20x+, and the single-run slider already reaches it, so the sweep is
  deliberately narrower than the tool.

- **Both sweep modes rendered side by side.** Carried forward from Phase 6's deferred list. If the
  chosen form struggles in end-of-data mode during this phase, this is what was skipped.

### Findings (recorded in CONTEXT.md, not decisions -- carried into this document's own findings below)

CONTEXT.md's own findings F-01 through F-07 are folded into this document's `## Common Pitfalls`
and `## Open Questions` sections below rather than repeated verbatim twice; the substance is
unchanged.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VIZ-01 | Fixed leverage, sweep entry date: a chart showing how outcome varies by when you started | D-16 (marginal slice chart sharing the heatmap's cached grid, one row read); see Architecture Patterns "Marginal slice charts" |
| VIZ-02 | Fixed entry date, sweep leverage: a chart showing how outcome varies by how much leverage you took | D-16 (marginal slice chart, one column read); same pattern as VIZ-01 |
| VIZ-03 | A 2D heatmap over entry date and leverage, colored by the selected outcome metric | D-05/D-11 polygon-fill graduation of `iso-lines.ts` + the winning fill module into `src/heatmap/`; §"Fill algorithm" below |
| VIZ-04 | A sweep-mode toggle between fixed holding period and hold-to-today, with the chart stating which mode produced it | D-27 reuses `HoldingModeControl.tsx`; D-30 places the mode statement in the caption strip |
| VIZ-06 | Ruined cells are rendered categorically distinct from the continuous color scale, never merely the darkest end | `RUIN_BASE_RGBA` + `makeHatchPattern` (mockup-runtime.ts, NOT yet graduated -- see Open Questions); D-31 |
| VIZ-09 | In hold-to-today mode, the short-horizon artifact at the recent edge is visually marked | D-28/D-29: labelled vertical boundary rule, colours left intact, distinct from D-19's incomplete-hold grey |
| METR-06 | A sweep computes all display metrics per cell in a single pass | D-23/D-24: multiple-of-contributed + max drawdown (both already in-loop via `KernelResult`) + one annualized metric (IRR/CAGR per D-24's global switch); per-cell record layout is Claude's Discretion, see Architecture Patterns |
| PERF-03 | A full sweep (10,000 cells) completes in under 1000ms on a 4-core baseline | Baseline already at 80.8% of budget with ZERO sweep code (Phase 1 spike measurement); the per-column series-reuse optimization in Architecture Patterns is load-bearing for staying under budget, not optional polish |
| PERF-04 | A sweep paints its first partial results within 100ms | D-12: coarse strided subsample (~1/16 cells) painted as a complete low-res field first |
| PERF-05 | Changing the displayed metric re-colors the cached grid in under 16ms, never re-sweeps | D-05 polygon fill (if it lands) is O(cells); D-09 is the documented fallback if it does not; F-06/D-24's METR-06 "compute all metrics per pass" is what makes a metric switch a pure re-color |
| PERF-06 | An in-flight sweep is cancelled within one frame, superseded results discarded | Generation/epoch-token cancellation pattern (Architecture Patterns) -- NOT `bench/sweep-pool.ts`'s per-call pool teardown, which is documented below as unsuitable for D-32's continuous-drag case |
| PERF-09 | Heatmap pan and zoom sustain 60fps at full cell count | D-34: magnify the already-rendered field via canvas transform, no re-sweep, no re-resample under the polygon path |

</phase_requirements>

## Summary

Almost every design and scope question for this phase was already resolved during
`/gsd-discuss-phase` -- `07-CONTEXT.md`'s 35 decisions cover axis domains, the fill algorithm's
go/no-go gate, progressive paint, layout, hover/crosshair, metrics, sweep-mode right-edge
treatment, and zoom/pan. This research's job is narrower than usual: verify the actual code
surfaces those decisions name, and surface what reading the real modules reveals that the
decisions record does not already say.

Three load-bearing findings came out of that reading, none of which appear in `07-CONTEXT.md`:

1. **`buildKernelInputs` (`src/data/kernel-inputs.ts`) resolves an entire `KernelSeries` --
   three fresh `Float64Array`/`Int32Array` allocations and an O(barCount) loop -- per call, and
   that resolution depends on `entryDate` + `holdingPeriodBars` + `dividendReinvest` + `symbol`,
   **never on `leverage`**. Calling it once per sweep cell (10,000 times) redundantly repeats
   that O(barCount) resolution 50x (once per leverage row) for data that is identical across
   the whole column. The production sweep must resolve one `KernelSeries` per ENTRY-DATE COLUMN
   (200 times) and loop `runBacktest` over the 50 leverage rows against that one shared series --
   this is not an optimization to consider later, it is what keeps PERF-03 (already at 80.8% of
   budget with zero sweep code, per the recorded D-20 escalation) from regressing the moment
   Phase 7's own code runs.

2. **Comlink has no built-in cancellation primitive** (confirmed against the library's own
   issue tracker). `bench/sweep-pool.ts`'s only cancellation-adjacent mechanism is
   `worker.terminate()` in a `finally` block after a whole sweep completes or the pool call
   returns -- it does not support cancelling one in-flight sweep to start another, and D-32
   requires exactly that on every holding-period drag frame. Tearing down and reconstructing
   the whole Worker pool per cancellation is expensive (`01-02-SUMMARY.md`'s own measurement
   discipline explicitly includes worker construction cost in every PERF-03 repeat) and is very
   unlikely to clear PERF-06's one-frame (16ms) cancellation budget. The production pool needs a
   persistent pool plus an application-level generation/epoch token so late-arriving results
   from a superseded sweep are discarded by the caller, never by tearing the pool down.

3. **`src/colorscale/value-to-color.ts`'s exported `interpolateRamp(t)` is hardcoded to the
   diverging `RAMP_STOPS` array** -- it takes no stops parameter. D-25's new sequential ramp
   (for max drawdown) cannot reuse this function as-is; the module needs either a second
   exported interpolator closing over a new `SEQUENTIAL_RAMP_STOPS` array, or `interpolateRamp`
   refactored to accept a stops array (with the existing call sites updated). This is a concrete,
   verified code change, not a design question -- D-25 already settled the design (sequential
   for drawdown, VIZ-07 bar applies).

A fourth, non-blocking gap: D-11 names `iso-lines.ts` and "the winning fill module" for
graduation into `src/heatmap/`, but the ruin hatch pattern (`makeHatchPattern`), the legend
renderer, `VIZ10_CAVEAT_SENTENCES`, and the integer-leverage axis-tick helper all currently live
in `mockups/shared/mockup-runtime.ts`, which D-11 does not name. Production needs all four
(VIZ-06's hatch, D-30's caveat text, some legend, some axis labelling). The plan must decide
whether these graduate too or get reimplemented as Solid components -- left open in this
document's Open Questions rather than assumed either way.

**Primary recommendation:** Build the sweep engine as (a) a persistent Comlink-wrapped Worker
pool that resolves one `KernelSeries` per entry-date column and loops `runBacktest` per leverage
row against it, reporting progress via a `Comlink.proxy`-wrapped callback and respecting a
generation token for cancellation; (b) attempt the D-05 polygon-fill renderer first, with the
existing per-pixel `resampleField` kept as the D-08 test oracle and D-06's escalation checkpoint
honored on a miss; and (c) model the live per-cell result grid as an extension of the existing
`SweepFixture` interface shape (`cols`, `rows`, `meta`, plus one typed array per metric, plus a
`flags` byte array) so the graduated renderer code (`resampleField`, `marchingSquaresSegments`,
the fill module) needs zero changes to consume live sweep results instead of the committed
Phase 6 fixture.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Sweep orchestration (partition, dispatch, cancel, progress) | Browser / Client (main thread) | -- | No backend exists (APP-03); orchestration must live in the page that owns the UI state it cancels against |
| Per-cell backtest compute | Browser / Client (Worker pool) | -- | SIM-10/SIM-11's allocation-free kernel already runs here for the single-run path; the sweep is the same kernel, parallelized |
| Column-level series resolution (`buildKernelInputs`-equivalent) | Browser / Client (Worker, per column) | Browser / Client (main thread, for the single-run path) | Depends only on entryDate/holdingPeriod/dividendReinvest/symbol -- identical inputs whichever thread resolves it; doing it in the worker avoids a second main-thread-to-worker transfer per column |
| Field resampling / polygon fill / marching squares | Browser / Client (main thread, canvas) | -- | Canvas 2D APIs are main-thread-only in this app's architecture (no OffscreenCanvas transfer is in use anywhere in the codebase today); painting stays where `paintFilledContour` already runs it |
| Colour scale (`valueToColor`, ramps) | Browser / Client (shared, zero-import module) | -- | Already zero-import by design (`value-to-color.ts` header), consumed identically by mockups, worker (if needed for pre-quantisation) and the renderer |
| Permalink encode/decode | Browser / Client (main thread) | -- | `src/app/permalink.ts` already owns this; D-04 extends the existing allow-list codec, not a new mechanism |
| Data bundle (prices, rates, calendar) | CDN / Static (build-time bundle) | Browser / Client (decode) | Unchanged from Phase 2/4: bundled binary assets, decoded into typed arrays client-side, no runtime fetch beyond the static asset |
| Persistence of sweep state | Browser / Client (permalink URL only) | -- | No backend/database exists (APP-03, SHARE-01); D-04 is the only persistence mechanism |

## Standard Stack

### Core

No new runtime dependencies are required. Phase 7 extends three packages already installed and
already used for exactly this kind of work:

| Library | Version (installed) | Purpose | Why Standard Here |
|---------|---------|---------|--------------|
| comlink | 4.4.2 `[VERIFIED: package.json]` | Worker RPC for the sweep pool | Already the project's chosen Worker-RPC layer (`bench/sweep-pool.ts`/`bench/sweep.worker.ts`); `06-CONTEXT.md`'s CLAUDE.md-inherited stack decision names it explicitly and no alternative was evaluated for this phase |
| solid-js | 1.9.15 `[VERIFIED: package.json]` | Sweep-mode UI state, mode switch, controls | Already the app's reactive framework; D-15/D-17 extend the existing `state.ts` store, not a new framework surface |
| uplot | 1.6.32 `[VERIFIED: package.json]` | VIZ-01/VIZ-02 marginal slice charts | Already the line-chart library (`EquityCurveChart.tsx`); D-16's marginal charts are ordinary uPlot line charts over one row/column of the cached grid, the same integration pattern already proven |

### Supporting

No additional supporting libraries. The colour scale (`d3-scale`/`d3-interpolate`, named as a
candidate dependency in the project's inherited `.claude/CLAUDE.md` stack research) was NOT
installed when `src/colorscale/value-to-color.ts` was built in Phase 6 -- the Oklab
interpolation, symlog transform and ramp lookup are hand-rolled with zero imports
`[VERIFIED: src/colorscale/value-to-color.ts:1-15]` ("Zero imports, so both a plain HTML mockup
... and Phase 7's Solid renderer can consume it without dragging in a framework"). Phase 7
extends this module in place; it does not introduce `d3-scale`.

### Alternatives Considered

None evaluated this phase -- CONTEXT.md's decisions already settle every architectural fork this
phase would otherwise need to research (fill algorithm: D-05/D-09; cancellation: not decided by
CONTEXT.md, this document's own finding fills that gap, see Architecture Patterns below; colour
scale: D-25/D-26 extend the existing module). No case exists in this phase's scope where a new
third-party library is the right first move over extending code that already exists and is
already tested.

**Installation:** none required.

**Version verification:** `comlink@4.4.2`, `solid-js@1.9.15`, `uplot@1.6.32` are pinned in
`package.json` and installed `[VERIFIED: package.json]`, read directly this session. No version
bump is needed for this phase's scope.

## Package Legitimacy Audit

**Not applicable this phase.** No new external packages are introduced -- every capability this
phase needs (Worker RPC, reactive UI, line charts, colour interpolation, marching squares) is
either already installed (comlink, solid-js, uplot) or already hand-rolled in-repo
(`value-to-color.ts`, `iso-lines.ts`, `field-sampler.ts`). If a planning pass later decides a new
dependency is warranted (e.g., a polygon-fill/clipping library if D-05's hand-rolled ring-stitcher
proves too risky and the D-06 escalation resolves toward a library instead of the D-09 fallback),
that decision must re-run the Package Legitimacy Gate against the specific package chosen -- it
cannot be pre-cleared here since no such package is named.

**Packages removed due to SLOP verdict:** none (none proposed).
**Packages flagged as suspicious [SUS]:** none (none proposed).

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                    Main thread (Solid)                   │
                    │                                                          │
  User input ──────►│  ParameterColumn controls (existing, D-17 reused)        │
  (leverage,        │        │                                                 │
   entry date,      │        ▼                                                 │
   holding period,  │  updateBacktestRequest() ──► sweep store (new, D-15)     │
   metric toggle)   │        │                            │                    │
                    │        │ (sweep-mode only)          │ bumps generation   │
                    │        ▼                            ▼ token (new)       │
                    │  scheduleSweep()  ───────────►  dispatchToPool()         │
                    │        │  (rAF-coalesced,             │                  │
                    │        │   mirrors existing            │                 │
                    │        │   scheduleRun D-03)           │                 │
                    │        │                                │                │
                    │        │                    ┌───────────┴────────────┐  │
                    │        │                    │   Persistent Comlink    │  │
                    │        │                    │   Worker pool (new)     │  │
                    │        │                    │   sized workerCountFor  │  │
                    │        │                    │   Cores(hardwareConcur- │  │
                    │        │                    │   rency) (existing fn,  │  │
                    │        │                    │   bench/sweep-pool.ts)  │  │
                    │        │                    └───────────┬────────────┘  │
                    │        │                                │ per-column    │
                    │        │                                │ chunk:        │
                    │        │                    ┌───────────▼────────────┐  │
                    │        │                    │ 1 worker resolves      │  │
                    │        │                    │ KernelSeries ONCE per  │  │
                    │        │                    │ entry-date column      │  │
                    │        │                    │ (finding: NOT per      │  │
                    │        │                    │ cell), then loops      │  │
                    │        │                    │ runBacktest() over 50  │  │
                    │        │                    │ leverage rows against  │  │
                    │        │                    │ that shared series     │  │
                    │        │                    │ (src/kernel/backtest.  │  │
                    │        │                    │ ts, unchanged, SIM-10) │  │
                    │        │                    └───────────┬────────────┘  │
                    │        │                                │ transferred   │
                    │        │                                │ typed-array   │
                    │        │                                │ chunk result  │
                    │        │                    (tagged with generation     │
                    │        │                     token; stale-generation    │
                    │        │                     results discarded by the   │
                    │        │                     caller, PERF-06)           │
                    │        ▼                                │               │
                    │  coarse pass (D-12, ~1/16 cells) paints  │               │
                    │  a COMPLETE low-res field first          │               │
                    │  (within PERF-04's 100ms) ◄──────────────┘               │
                    │        │                                                 │
                    │        ▼ progressive refine to full 10,000-cell grid    │
                    │  live sweep result grid (new: SweepFixture-shaped,      │
                    │  cols/rows/meta/multiples/drawdowns/annualized/flags)   │
                    │        │                                                 │
                    │        ▼                                                 │
                    │  ┌──────────────────────────────────────────────────┐  │
                    │  │ Fill algorithm fork (D-05/D-06/D-07/D-09):        │  │
                    │  │  Attempt 1 (D-05): band POLYGONS from             │  │
                    │  │    marchingSquaresSegments (graduated iso-lines.  │  │
                    │  │    ts) → ring-stitch → canvas fill (O(cells))     │  │
                    │  │  Gate: visual equivalence vs. resampleField AND   │  │
                    │  │    16ms budget (D-07); miss → ESCALATE (D-06)     │  │
                    │  │  Fallback (D-09, not pre-authorized): per-pixel   │  │
                    │  │    resampleField below display res + upscale +   │  │
                    │  │    offscreen cache + full-res stroke overlay      │  │
                    │  └──────────────────────────┬───────────────────────┘  │
                    │                              ▼                          │
                    │  Canvas 2D heatmap panel (form-2-filled-contour,        │
                    │  graduated) + marginal slice charts (uPlot, D-16) +     │
                    │  legend + caption strip (VIZ-04/VIZ-10)                 │
                    │                              │                          │
                    │  Hover (D-19) ──► ghost crosshair, transient readout    │
                    │  Click (D-22) ──► committed crosshair, permalink write, │
                    │                   drill-down (mode switch to Single)    │
                    └─────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

Module layout is explicitly Claude's Discretion under CONTEXT.md, subject to D-11's graduation
requirement. Recommended (not mandated):

```
src/
├── heatmap/                  # D-11's graduation target
│   ├── iso-lines.ts          # graduated from mockups/shared/ verbatim (or near-verbatim)
│   ├── field-sampler.ts      # graduated from mockups/shared/ (resampleField, BAND_LEVELS,
│   │                         #   bandIndexFor) — the D-08 test oracle
│   ├── polygon-fill.ts       # NEW: D-05's ring-stitcher + band-polygon builder over
│   │                         #   marchingSquaresSegments output
│   ├── paint-contour.ts      # graduated/adapted from form-2-filled-contour.ts, parameterized
│   │                         #   over the live sweep grid instead of a static SweepFixture
│   └── hatch-pattern.ts      # candidate graduation target for mockup-runtime.ts's
│                             #   makeHatchPattern (see Open Questions — not named by D-11)
├── sweep/                    # NEW
│   ├── sweep-pool.ts         # persistent Comlink pool, generation-token cancellation
│   ├── sweep.worker.ts       # column-series resolution + per-row runBacktest loop
│   └── sweep-grid.ts         # the live per-cell result grid type (SweepFixture-shaped)
├── colorscale/
│   └── value-to-color.ts     # EXTENDED in place: new SEQUENTIAL_RAMP_STOPS + interpolator
│                             #   for D-25 (max drawdown), existing diverging path untouched
└── app/
    ├── state.ts               # EXTENDED: sweep store alongside the existing single-run store
    ├── permalink.ts           # EXTENDED: D-04's new fields
    └── components/ResultColumn/
        ├── HeatmapPanel.tsx    # NEW: mode-switch target (D-15)
        ├── SliceChart.tsx      # NEW: D-16's marginal charts (uPlot, one row/col reader)
        └── SweepModeToggle.tsx # NEW: D-15's switch
```

### Pattern 1: Per-column series resolution (load-bearing finding, not in CONTEXT.md)

**What:** `buildKernelInputs` (`src/data/kernel-inputs.ts`) resolves `KernelSeries` (`returns`,
`shortRate`, `calendarDaysElapsed`, `contributionFlags`, each a fresh typed array sized to
`barCount`) from `symbol` + `dividendReinvest` + `entryDate` + `holdingPeriodBars` +
`contributionFrequency` `[VERIFIED: src/data/kernel-inputs.ts:33-46]`. `leverage` is read only
in the separate `params` object it also returns
`[VERIFIED: src/data/kernel-inputs.ts:230-238]` (`const params: KernelParams = { leverage:
request.leverage, ... }`), never inside the series-construction loop
`[VERIFIED: src/data/kernel-inputs.ts:199-222]` (the per-bar loop that builds `returns`,
`shortRate`, `calendarDaysElapsed` reads only `priceLevels`, `ratePercent`, `bundle.calendar` --
no `leverage` reference anywhere in that loop).

**When to use:** Every sweep column (fixed entry date, all 50 leverage rows). Resolve the series
once per column, then call `runBacktest(params, series, outputs)` 50 times, varying only
`params.leverage` (and the shared `outputs` scratch buffers, mirroring `sweep.worker.ts`'s
existing scratch-buffer reuse pattern `[VERIFIED: bench/sweep.worker.ts:29-31]`).

**Why this matters:** PERF-03 already sits at 80.8% of its 1000ms budget with **zero sweep
code** running (the Phase 1 spike's synthetic-series measurement, recorded as a Key Decision
escalation in `PROJECT.md`). Calling `buildKernelInputs`-equivalent resolution once per cell
(10,000 times) instead of once per column (200 times) means paying the O(barCount) series-build
cost up to 50x more than necessary -- for a strict-tier ~38-year window that is up to roughly
9,500 bars per column, so worst case unnecessary work is on the order of tens of millions of
extra array writes across the full sweep, competing directly against a budget that already has
only ~19% headroom.

**Example (sketch, not a verified code excerpt -- illustrates the shape only):**
```typescript
// One resolution per column (200 calls), not per cell (10,000 calls).
for (const column of columnsInThisChunk) {
  const columnSeries = resolveColumnSeries(bundle, {
    symbol, dividendReinvest, entryDate: column.entryDate,
    holdingPeriodBars: sweepMode === 'fixed' ? fixedBars : null,
    contributionAmount, contributionFrequency,
  }) // KernelSeries — identical shape to buildKernelInputs's own return, built once

  for (const row of leverageRows) { // 50 calls against the SAME columnSeries
    const params: KernelParams = { ...baseParams, leverage: row.leverage }
    const result = runBacktest(params, columnSeries, sharedOutputs) // src/kernel/backtest.ts, unchanged
    writeCellMetrics(grid, column.index, row.index, result, sharedOutputs)
  }
}
```

### Pattern 2: Generation-token cancellation, not pool teardown

**What:** `bench/sweep-pool.ts`'s only cancellation-adjacent behavior is `worker.terminate()` in
a `finally` block after `runSpikeSweep` completes or throws `[VERIFIED:
bench/sweep-pool.ts:174-178]` -- a fresh pool is constructed on every call
`[VERIFIED: bench/sweep-pool.ts:139-149]` ("Workers are constructed fresh inside every
`runSpikeSweep` call, not reused across `measureMinOfN` repeats"), and the module's own header
states this is deliberate for the PERF-03 benchmark's own measurement discipline, not a
cancellation feature. A WebSearch of Comlink's own issue tracker
(`[CITED: github.com/GoogleChromeLabs/comlink/issues/372]`, "Built-in termination/cancellation?")
confirms Comlink ships no cancellation primitive at all.

**When to use:** D-32 requires cancelling and restarting a sweep on every holding-period drag
frame. Tearing down and reconstructing a multi-worker pool on every frame reintroduces worker
construction cost (explicitly called out as non-trivial and deliberately included in every
PERF-03 measurement repeat, per `01-02-SUMMARY.md`) into the one-frame PERF-06 cancellation
budget -- a real risk of blowing 16ms on pool teardown alone.

**Recommended pattern:** Keep the pool alive for the lifetime of sweep mode. Tag every dispatched
chunk request with a monotonically increasing generation number. When a new sweep starts, bump
the generation and stop the main thread from painting/accepting any chunk result tagged with a
stale generation (D-13's "discarded and never painted"). In-flight worker calls for the stale
generation are allowed to finish (or are raced against a short-lived `AbortController`-style
per-chunk timeout mirroring `sweep-pool.ts`'s existing `chunkTimeoutMs` pattern
`[VERIFIED: bench/sweep-pool.ts:63-73]`) -- their results are simply ignored on arrival. This
makes cancellation an O(1) main-thread check (compare a result's carried generation against the
current one) rather than an O(worker teardown + reconstruction) operation.

**Confidence:** MEDIUM. The generation-token pattern itself is a standard, well-understood
technique for cancelling async work whose result can arrive after it's no longer wanted; it is
not Comlink-specific and was not found written up for Comlink specifically in this session's
WebSearch (`[CITED: github.com/GoogleChromeLabs/comlink/issues/372]` confirms the gap Comlink
leaves, not a documented recommended fill for it). Flagged `[ASSUMED]` as the *specific*
recommended shape for this codebase; the underlying "ignore stale results" principle is
`[CITED]`.

### Pattern 3: Live sweep grid modeled as a `SweepFixture` extension

**What:** `mockups/shared/field-sampler.ts`'s `resampleField`, and
`mockups/forms/form-2-filled-contour.ts`'s `paintFilledContour`, both take a `SweepFixture`
(`{ cols, rows, meta, multiples, drawdowns, flags }`) as their input
`[VERIFIED: src/data/sweep-fixture-format.ts:79-93]`. `SweepFixture` currently carries only two
metric arrays (`multiples`, `drawdowns`); D-23 needs a third (the annualized metric).

**When to use:** When designing the production per-cell result grid (Claude's Discretion per
CONTEXT.md). If the live grid's TypeScript shape structurally satisfies (or trivially extends)
`SweepFixture` -- same `cols`/`rows`/`flags` convention, one `Float32Array` per displayed metric
-- then the graduated `resampleField`/`marchingSquaresSegments`/fill-paint code needs **zero
changes** to render live results instead of the committed Phase 6 fixture. This is a strong
argument for extending the interface (add an `annualized: Float32Array` field) rather than
inventing a parallel, differently-shaped live-grid type.

**Caveat:** `SweepFixture`'s binary encode/decode machinery (`encodeSweepFixture`,
`decodeSweepFixture`, the magic/version header) exists specifically for the committed,
git-tracked design-pass fixture (`sweep-fixture.bin`) -- a static test/reference asset
`[VERIFIED: src/data/sweep-fixture-format.ts:1-24]`. The live sweep result does not need that
binary format at all (it never round-trips through disk); only the **decoded, in-memory shape**
(the `SweepFixture` interface) needs to match, not the byte layout or the encode/decode
functions.

### Pattern 4: Marginal slice charts read one row/column of the cached grid

**What:** D-16's fixed-leverage and fixed-entry-date slice charts are "literally one row and one
column of the cached grid" (CONTEXT.md's own words) -- once the sweep grid exists in memory,
producing the data for either slice chart is an O(200) or O(50) array read, not a new
computation. `EquityCurveChart.tsx`'s existing uPlot integration pattern
`[VERIFIED: src/app/components/ResultColumn/EquityCurveChart.tsx:1-33]` (destroy-and-recreate
the uPlot instance on data/scale/theme change, read CSS custom properties via
`getComputedStyle` for stroke/axis colors since canvas gets no free `prefers-color-scheme`
styling) is the precedent to follow for both new slice charts.

**When to use:** VIZ-01/VIZ-02. Reuse `EquityCurveChart.tsx`'s theme-subscription and rebuild
pattern; do not build a second uPlot integration approach.

### Pattern 5: Comlink progress callback via `Comlink.proxy`

**What:** Functions are not structured-cloneable, so passing a progress callback into a worker
requires wrapping it with `Comlink.proxy(callback)` on the calling side; the worker then invokes
the proxy and Comlink marshals the call back to the main thread
`[CITED: WebSearch aggregation of github.com/GoogleChromeLabs/comlink docs/blog posts, not a
single authoritative page read in full this session -- see Sources]`.

**When to use:** D-12's coarse-then-refine progressive paint and PERF-04's "repaints
progressively as cells complete" both need the main thread to learn about chunk completions as
they happen, not only when the whole sweep resolves. Two viable shapes: (a) each worker chunk
call resolves with its own result (current `runChunk` shape,
`[VERIFIED: bench/sweep.worker.ts:44-56]`) and the main thread's `Promise.race`/queue-draining
loop (already the shape of `drainQueue` in `bench/sweep-pool.ts:157-197]`) paints incrementally
as each chunk promise settles -- no `Comlink.proxy` needed at all, since the existing per-chunk
resolution IS the progress signal; or (b) an explicit proxied progress callback if finer-grained
in-chunk progress is wanted. **Recommendation: prefer (a).** The existing per-chunk resolution
shape already gives natural progress granularity (one paint opportunity per completed chunk),
and avoids adding `Comlink.proxy`'s marshaling overhead and the Firefox-specific proxy-timing
quirk noted in Comlink's own issue tracker
(`[CITED: github.com/GoogleChromeLabs/comlink/issues/538]`, "Callback proxies called at
different times in Firefox depending on whether they're passed directly or set as a property").

### Pattern 6: `interpolateRamp` must be parameterized for D-25's sequential ramp

**What:** `interpolateRamp(t)` closes over module-level `RAMP_STOPS_OKLAB`, itself derived from
the module-level `RAMP_STOPS` diverging-ramp constant
`[VERIFIED: src/colorscale/value-to-color.ts:63-64, 173]` (`const RAMP_STOPS_OKLAB: ... =
RAMP_STOPS.map(...)`; `export function interpolateRamp(t: number): Rgba { ... }` reads only
`RAMP_STOPS_OKLAB`, takes no stops argument).

**When to use:** D-25 requires a second, sequential colour ramp for max drawdown, subject to the
same VIZ-07 perceptual-step-ratio test (`tests/value-to-color.test.ts`'s "the ratio of the
largest to the smallest Oklab distance between 33 adjacent ramp samples is at most 2.5"
`[VERIFIED: tests/value-to-color.test.ts:122-133]`). The test itself is generic over
`interpolateRamp` -- it calls `sampleRampAtEvenlySpacedT(33)` which calls `interpolateRamp(i /
(count - 1))` `[VERIFIED: tests/value-to-color.test.ts:107-112]` -- so a parallel test for the
sequential ramp needs a parallel interpolator to call.

**Recommended shape:** Extract a generic `buildRampInterpolator(stops: readonly RampStop[]):
(t: number) => Rgba` factory, call it once for the existing diverging stops (preserving
`interpolateRamp`'s exported name and behavior for backward compatibility with the four
mockups that already import it) and once for a new `SEQUENTIAL_RAMP_STOPS` array, exporting the
second as e.g. `interpolateSequentialRamp`. This is a mechanical refactor with a clear existing
test to mirror, not a design decision -- D-25 already settled the design.

### Anti-Patterns to Avoid

- **Calling `buildKernelInputs` (or an unrefactored equivalent) once per sweep cell:** see
  Pattern 1. This is the single most likely way this phase silently regresses PERF-03.
- **Tearing down and reconstructing the Worker pool as the cancellation mechanism:** see
  Pattern 2. Correct for a one-shot benchmark; wrong for a UI that cancels on every drag frame.
- **Copying `bench/sweep-pool.ts`'s per-call worker construction into production verbatim:**
  CONTEXT.md's own Claude's Discretion note already warns "read, not necessarily to copy: it
  partitions a synthetic series and does not handle cancellation at all" -- confirmed correct by
  this research; the production pool is genuinely new code, not a promotion (CONTEXT.md's own
  Finding F-01).
- **Building a second colour-ramp module instead of extending `value-to-color.ts`:** the module
  is deliberately the single authority (D-27a in its own header); D-25's sequential ramp is "an
  addition to this module, not a parallel one" per `06-HEATMAP-SPEC.md` §3.
- **Assuming `SweepFixture`'s binary encode/decode functions are needed for the live grid:**
  see Pattern 3's caveat. The binary format exists for a committed test fixture, not for runtime
  state.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Worker RPC / message protocol | A hand-rolled `postMessage` protocol | Comlink (`Comlink.wrap`, `Comlink.expose`, `Comlink.transfer`) | Already the project's chosen abstraction (`bench/sweep-pool.ts`); avoids re-deriving transfer-vs-clone bugs (PITFALLS F3) |
| Colour interpolation, symlog transform, ruin/incomplete categorical branching | A second colour-mapping function | `src/colorscale/value-to-color.ts` (extended per Pattern 6) | Explicitly the single authority (D-27a); already unit-tested for perceptual uniformity, colourblind-safety and round-trip correctness |
| Marching-squares edge classification | A hand-rolled contour tracer | `mockups/shared/iso-lines.ts`'s `marchingSquaresSegments` (graduated) | Already implements the 16-case classification plus saddle disambiguation, categorical-cell skipping, and is unit-tested (`tests/iso-lines.test.ts`) |
| Number formatting for metric readouts (legend, hover, slice charts) | A second formatter | `src/metrics/format.ts` (`formatMultiple`, `formatPercent`, `formatSignedPercent`) | `06-HEATMAP-SPEC.md` §5 is explicit: legend and readout labels render through this, no second formatter |
| IRR/CAGR solving | A re-derived or simplified annualized-return formula | `src/metrics/irr.ts` (`solveIrr`, `buildCashFlows`) / `src/metrics/cagr.ts` (`solveCagr`) | Already handles the ruin degenerate case, the undefined-bracket case, and matches METR-01/METR-02's exact semantics; D-24 requires the sweep to mirror this exactly, not approximate it |
| Trading-calendar / entry-date-bounds resolution | A second date-bounds calculator | `src/app/bounds.ts` (`resolveEntryDateBounds`, `Tier`) | D-02 explicitly reuses this; it already handles the strict/extended tier split and the "no in-range data" edge case |

**Key insight:** This phase's entire non-hand-rolled surface already exists in the repo, built
and unit-tested in Phases 1-6 specifically so Phase 7 would not need to rebuild it. The actual
new code this phase writes is: the Worker pool orchestration layer (chunking by column,
cancellation, progress), the polygon-fill ring-stitcher (D-05, genuinely new), the Solid UI
components for sweep mode, and the permalink/state extensions. Everything else is composition of
existing, graduated modules.

## Common Pitfalls

### Pitfall 1: Resolving `KernelSeries` per cell instead of per column

**What goes wrong:** PERF-03 regresses because the sweep pays an O(barCount) series-resolution
cost up to 50x more often than necessary.
**Why it happens:** `buildKernelInputs`'s existing signature bundles series resolution and
params resolution into one call, and it is the only existing precedent a planner/executor would
naturally reach for per cell.
**How to avoid:** See Architecture Pattern 1. Split series resolution (per column) from params
resolution (per row, cheap -- only `leverage` varies).
**Warning signs:** PERF-03 benchmark regresses noticeably above its already-recorded 80.8%
baseline the moment sweep code is measured for the first time.

### Pitfall 2: Cancellation implemented as pool teardown

**What goes wrong:** PERF-06's one-frame cancellation budget is blown by worker reconstruction
cost, especially under D-32's continuous-drag scenario where cancellation happens on nearly
every frame.
**Why it happens:** `bench/sweep-pool.ts` is the only in-repo precedent for a Worker pool, and
its `finally { worker.terminate() }` pattern looks like a natural cancellation mechanism when it
is actually a per-call benchmark-isolation mechanism.
**How to avoid:** See Architecture Pattern 2. Persistent pool, generation-token discard.
**Warning signs:** PERF-06 measured well above 16ms specifically during a holding-period drag
interaction (as opposed to a single discrete parameter change).

### Pitfall 3: Marching-squares ring stitching gets the categorical-boundary or field-edge case wrong

**What goes wrong:** A mis-stitched ring at a ruin/incomplete-hold categorical boundary, or at
the field rectangle's own edge (where a band runs off the side), produces a wrong picture drawn
quickly -- exactly what D-07's gate exists to catch, and exactly what D-05 itself names as "the
entire risk."
**Why it happens:** `iso-lines.ts`'s existing `marchingSquaresSegments` deliberately skips
stitching (its own header calls stitching "the genuinely hard part") because stroking never
needed closed rings; a fill does. General isoband literature confirms this is a known-hard
sub-problem: dual-threshold-per-band classification with up to 81 per-cell configurations, plus
explicit hole-handling for enclosed regions
`[CITED: general marching-squares/isoband literature aggregated via WebSearch -- Wikipedia,
academic isoband writeups; no single authoritative implementation guide read in full this
session]`.
**How to avoid:** Treat D-08's kept oracle test (per-pixel `resampleField` vs. the polygon
renderer, agreement within tolerance) as the actual correctness gate, not just a performance
comparison. Build and test the ring-stitcher against synthetic fields that deliberately exercise:
a band that touches the field edge, a band that fully encloses another band (hole case), and a
categorical (ruin/incomplete) region adjacent to a band boundary -- before trusting it against
the real 10,000-cell grid.
**Warning signs:** Visual diff against the per-pixel oracle passes on the interior of the field
but fails near the field edges or near categorical (grey/hatched) regions specifically.

### Pitfall 4: Attribution decomposition leaking into per-cell sweep compute

**What goes wrong:** `src/validation/attribution.ts`'s `computeAttribution` runs a 4x cost
multiplier (base run plus 3 counterfactual Shapley subset runs) per invocation
`[VERIFIED: src/validation/attribution.ts:224-285]` (`buildSubsetValues` runs additional
`runBacktest` calls beyond the actual result). This was already flagged as a live risk for
Phase 6/7 in `.planning/WINDOWS.md` entry #5 `[VERIFIED: .planning/WINDOWS.md]`: "If
attribution's per-recompute cost were computed for every heatmap cell rather than once per
single-run parameter change, it would multiply the sweep's per-cell kernel work by attribution's
own ... 4x total ... factor, landing on the budget with the least headroom in the project."
**Why it happens:** METR-06 says "computes all display metrics per cell in a single pass" and a
careless reading could include attribution's decomposition as a "metric."
**How to avoid:** D-23 already scopes the metric toggle to exactly three metrics (multiple,
drawdown, one annualized metric) -- none of which require `computeAttribution`. The Deferred
Ideas section explicitly defers "colouring by attribution" out of this phase. The sweep worker
must call `runBacktest` once per cell (not `computeAttribution`), consistent with D-23's actual
scope.
**Warning signs:** Any sweep-worker code path that imports from `src/validation/attribution.ts`.

### Pitfall 5: `interpolateRamp`'s hardcoded stops silently produce the wrong ramp for drawdown

**What goes wrong:** A naive extension of D-25 (e.g., a new `if (metric === 'drawdown')` branch
inside `valueToColor` that still calls the existing `interpolateRamp`) would render max drawdown
through the diverging blue-orange ramp instead of a new sequential one, defeating the entire
point of D-25.
**Why it happens:** `interpolateRamp` "looks" generic (takes a bare `t: number`) but is not --
see Architecture Pattern 6.
**How to avoid:** Verify (via the VIZ-07 test mirrored for the new ramp) that the sequential
path actually interpolates a *different* stops array, not the diverging one.
**Warning signs:** The new sequential-ramp perceptual-uniformity test passes suspiciously
easily because it is silently asserting against the diverging ramp's own already-passing
values.

### Pitfall 6: Leverage crosshair (0, 20] vs. sweep grid [1, 5]

**What goes wrong:** D-17 reuses the existing `LeverageControl.tsx` (accepted range `(0, 20]`,
fractional `[VERIFIED: src/app/components/ParameterColumn/LeverageControl.tsx:1-9, 38-40]`) to
drive the sweep crosshair, but D-01 fixes the sweep grid to exactly `[1, 5]` over 50 rows. A
crosshair leverage outside `[1, 5]` (e.g., the control's own default of 3 is fine, but a user
who set 10x in single-run mode before switching to sweep mode is not) has no corresponding grid
row.
**Why it happens:** The two ranges were decided independently and correctly (D-01 for the grid,
matching the existing control's own accepted band for the crosshair per D-17) but were not
reconciled against each other in CONTEXT.md.
**How to avoid:** The plan must decide the crosshair's behavior when `backtestRequest().leverage`
falls outside `[1, 5]` -- clamp the drawn crosshair position to the nearest grid edge while
leaving the stored value untouched (consistent with D-21's "pointer snaps to nearest cell
centre" precedent), or some other explicit rule. Not deciding this leaves an undefined visual
state.
**Warning signs:** A permalink or a mode-switch from single-run at leverage 10x into sweep mode
renders a crosshair off the visible grid, or throws.

### Pitfall 7: Un-graduated mockup-runtime helpers block VIZ-06/VIZ-04/VIZ-10 rendering

**What goes wrong:** D-11 names only `iso-lines.ts` and "the winning fill module" for graduation.
`makeHatchPattern` (VIZ-06's ruin hatch), `renderLegend`, `VIZ10_CAVEAT_SENTENCES` (D-30's exact
caveat text), and `integerLeverageTicks` all currently live in
`mockups/shared/mockup-runtime.ts` `[VERIFIED: .../mockups/shared/mockup-runtime.ts:17-378]`,
which D-11 does not mention. A plan that only graduates the two named modules will discover
mid-implementation that it has no ruin hatch, no caveat text source, and no legend to build the
production panel against.
**Why it happens:** `06-HEATMAP-SPEC.md`/`07-CONTEXT.md` treat `mockup-runtime.ts` as
mockup-only scaffolding (it also imports `src/app/styles.css` directly and DOM-mounts a whole
page `[VERIFIED: .../mockups/shared/mockup-runtime.ts:17, 378]`), so its non-DOM-mounting
exports were not flagged for graduation the way the pure-math modules were.
**How to avoid:** The plan should explicitly decide, per exported symbol in
`mockup-runtime.ts`: graduate as-is (for pure functions like `makeHatchPattern`,
`integerLeverageTicks`, `VIZ10_CAVEAT_SENTENCES`), or reimplement as a Solid component (for
`renderLegend`, which is DOM-string-based and the production app is Solid-reactive). See Open
Questions.
**Warning signs:** VIZ-06 (ruin hatch), VIZ-10 (caveat text) or the legend are implemented from
scratch rather than by reusing the Phase 6 spec's exact, already-tuned values (hatch period,
stroke width, caveat sentences verbatim).

### Pitfall 8 (from `.planning/research/PITFALLS.md` E1): Colour scale mismatched to metric semantics

Already resolved by D-25/D-26, restated here because it is the single most-cited visualization
failure mode in this project's own research and D-25's sequential-ramp work is new code that
could regress it. **Guard:** the sequential ramp for max drawdown must never gain a diverging
midpoint; the diverging ramp must never be reused for a pure-magnitude metric.

### Pitfall 9 (from `.planning/research/PITFALLS.md` F1/F2): Allocation or polymorphism inside the per-cell loop

`runBacktest` is already allocation-free per SIM-11 and the kernel itself is unchanged this
phase. The risk is in the NEW code this phase writes around it: the per-cell metrics-writing
loop (writing `multiples[i]`, `drawdowns[i]`, `annualized[i]`, `flags[i]` for each of 10,000
cells) must write into preallocated typed arrays, matching `sweep.worker.ts`'s existing
scratch-buffer discipline `[VERIFIED: bench/sweep.worker.ts:29-31]`, not build intermediate
per-cell objects.

### Pitfall 10 (from `.planning/research/PITFALLS.md` F3): Structured-clone cost on chunk results

`bench/sweep-pool.ts` already transfers (not clones) chunk buffers both directions
`[VERIFIED: bench/sweep-pool.ts:169-181, bench/sweep.worker.ts:44-56]`. The production pool must
preserve this discipline for every new array added to the per-cell record (drawdown,
annualized, flags) -- a single field that falls back to structured-clone (e.g. by omitting it
from the `Comlink.transfer` transfer list) silently reintroduces a full-buffer copy cost per
chunk.

## Code Examples

### `runBacktest`'s exact signature (unchanged by this phase)

```typescript
// Source: src/kernel/backtest.ts (VERIFIED, read this session)
export function runBacktest(params: KernelParams, series: KernelSeries, outputs: KernelOutputs): KernelResult
```

### `SweepFixture`'s current shape (the interface the live grid should extend)

```typescript
// Source: src/data/sweep-fixture-format.ts (VERIFIED, read this session)
export interface SweepFixture {
  cols: number
  rows: number
  meta: SweepFixtureMeta
  multiples: Float32Array   // 0 for an incomplete-hold cell, never a partial value (D-20)
  drawdowns: Float32Array   // 0 for an incomplete-hold cell, same reasoning
  flags: Uint8Array         // CELL_FLAG_RUINED | CELL_FLAG_INCOMPLETE, or 0
}
// D-23 needs a third metric array (annualized) added to this shape for the live grid.
```

### `valueToColor`'s branch order (D-18 ruin wins over D-20 incomplete)

```typescript
// Source: src/colorscale/value-to-color.ts (VERIFIED, read this session)
export function valueToColor(input: ColorScaleInput): Rgba {
  if (input.ruined) return RUIN_BASE_RGBA
  if (input.incomplete) return INCOMPLETE_RGBA
  return interpolateRamp(rampPositionFor(input.value))
}
```

### `marchingSquaresSegments`'s exact signature (the geometry D-05's fill builds on)

```typescript
// Source: .planning/phases/06-heatmap-design-pass/mockups/shared/iso-lines.ts (VERIFIED)
export function marchingSquaresSegments(
  values: ArrayLike<number>,
  cols: number,
  rows: number,
  level: number,
  flags?: ArrayLike<number>,   // categorical cells are skipped entirely, D-18/D-20
): IsoSegment[]
```

### `workerCountForCores` (existing pool-sizing precedent, reusable as-is)

```typescript
// Source: bench/sweep-pool.ts (VERIFIED)
export function workerCountForCores(cores: number): number {
  return Math.max(1, cores - 1)
}
```

### Comlink progress-signal pattern recommended for D-12/PERF-04 (sketch, per Architecture Pattern 5)

```typescript
// Illustrative only — not a verified excerpt. Mirrors bench/sweep-pool.ts's existing
// drainQueue shape (VERIFIED: bench/sweep-pool.ts:157-197), extended with a generation guard.
let currentGeneration = 0

export function scheduleSweep(request: SweepRequest): void {
  const myGeneration = ++currentGeneration
  for (const chunk of chunksFor(request)) {
    dispatchChunk(chunk).then((result) => {
      if (myGeneration !== currentGeneration) return // PERF-06: stale result, discard
      mergeIntoGrid(result)
      requestPaint() // coarse pass paints as soon as its chunks resolve (D-12)
    })
  }
}
```

## State of the Art

Not a fast-moving external ecosystem question this phase -- every relevant API (Web Workers,
Comlink, Canvas 2D, `putImageData`) is stable and already in production use elsewhere in this
codebase. One note for completeness:

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `OffscreenCanvas` + worker-side rendering (considered as a general pattern for off-main-thread canvas work) | Main-thread canvas painting (this codebase's existing, unchanged approach) | N/A -- not adopted anywhere in this repo | Not relevant to this phase: the project's own `paintFilledContour` already paints on the main thread from a `CanvasRenderingContext2D`, and D-05/D-09 both assume main-thread painting. `OffscreenCanvas` is a real option for a future phase if repaint cost ever needs to move off-main-thread, but nothing in this phase's decisions calls for it, and introducing it now would be new architecture CONTEXT.md never asked for |

**Deprecated/outdated:** nothing identified as deprecated in this phase's actual dependency set.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The recommended generation-token cancellation pattern (Architecture Pattern 2) is the right specific shape for this codebase | Architecture Patterns, Pattern 2 | If wrong, PERF-06 could still be met by a different mechanism (e.g. a per-chunk `AbortController` with real worker-side abort support added manually); the underlying principle (avoid pool teardown as the cancellation path) is CITED and low-risk, but the exact implementation shape is a design choice the plan should make explicitly, not treat as settled |
| A2 | Comlink's progress-signalling recommendation (prefer per-chunk promise resolution over an explicit `Comlink.proxy` callback) | Architecture Patterns, Pattern 5 | Low risk: both approaches are viable; if the plan instead uses a proxied callback, it should be aware of the Firefox proxy-timing issue cited in Comlink's own tracker |
| A3 | Marching-squares isoband/ring-stitching difficulty characterization (81-configuration dual-threshold classification, hole handling) | Common Pitfalls, Pitfall 3 | This is general algorithmic literature, not read from a single authoritative source or verified against this codebase's specific implementation; the actual difficulty of D-05's ring-stitcher can only be confirmed by attempting it, which is exactly what D-06's escalation checkpoint exists for |
| A4 | The recommended module layout under `src/heatmap/` and `src/sweep/` | Architecture Patterns, Recommended Project Structure | Explicitly Claude's Discretion per CONTEXT.md; no risk to correctness, only to how closely the plan's actual file layout matches this suggestion |
| A5 | Whether `mockup-runtime.ts`'s non-graduated helpers (hatch pattern, legend, caveat sentences, axis ticks) should graduate as-is or be reimplemented as Solid components | Common Pitfalls, Pitfall 7; Open Questions | If the plan assumes these are already covered by D-11 without addressing them explicitly, VIZ-06/VIZ-10/legend rendering could be discovered as missing mid-implementation |

**Note on tags used above:** every `[VERIFIED: ...]` tag in this document cites a specific file
(and, where feasible, line range) that was opened with `Read` during this research session, with
the quoted or paraphrased value taken directly from that read. `[CITED: ...]` tags name a
specific external source consulted this session (Comlink's own GitHub issue tracker, npm
registry via `package.json`). `[ASSUMED]` tags (used inline above and in the Assumptions table)
mark claims resting on training knowledge or general web aggregation rather than a single
authoritative source read this session.

## Open Questions

1. **Do `mockup-runtime.ts`'s hatch pattern, legend, caveat sentences and axis-tick helpers
   graduate into `src/` alongside `iso-lines.ts` and the fill module, or get reimplemented as
   Solid components?**
   - What we know: D-11 names only two graduation targets; the phase clearly needs all four
     capabilities (VIZ-06, D-30, legend, axis labels) in production.
   - What's unclear: whether reusing the DOM-string-building `renderLegend` as-is fits a
     Solid-reactive app, or whether it should become a `<Legend />` component that reads the
     same underlying constants (`RAMP_STOPS`, `LEGEND_TICK_MULTIPLES`, the new sequential-ramp
     stops).
   - Recommendation: graduate the pure, non-DOM-building pieces (`makeHatchPattern`,
     `VIZ10_CAVEAT_SENTENCES`, `integerLeverageTicks`) as-is into `src/heatmap/`; reimplement
     `renderLegend`'s logic as a Solid component that reads the same constants, since the
     production app is Solid-reactive throughout and a raw DOM-mutation function does not fit
     that pattern the way it fits a standalone mockup HTML page.

2. **How does the crosshair render when `backtestRequest().leverage` falls outside the sweep
   grid's `[1, 5]` range (Pitfall 6)?**
   - What we know: D-17 reuses the existing `(0, 20]` leverage control unchanged; D-01 fixes the
     grid to `[1, 5]`.
   - What's unclear: the exact clamp/off-grid visual treatment.
   - Recommendation: the plan should state this explicitly (e.g., clamp the drawn crosshair to
     the nearest grid edge, matching D-21's snap-to-nearest-cell precedent) rather than leaving
     it implicit.

3. **Does the production sweep pool live in `src/sweep/` shared with nothing else, or does the
   single-run path (`src/app/state.ts`'s existing synchronous `scheduleRun`) migrate onto the
   same pool?**
   - What we know: single-run compute is fast enough (PERF-02 measured 0.21ms) that it runs
     synchronously on the main thread today, with no worker at all
     `[VERIFIED: src/app/state.ts:9-11]` ("D-01: the single backtest runs synchronously on the
     main thread. No worker, no Comlink"). This is explicitly Claude's Discretion in CONTEXT.md
     ("Whether the sweep pool is shared with or separate from the single-run execution path").
   - What's unclear: nothing blocks either choice; this is a genuine open design decision.
   - Recommendation: keep them separate. The single-run path has no performance need for a
     worker and moving it would be a gratuitous architecture change with no requirement backing
     it.

4. **F-06 from CONTEXT.md (the IRR/NPV Horner-loop optimization) is an unmeasured hypothesis.**
   Already flagged in the User Constraints section (D-24's own text: "F-06: ... a hypothesis,
   not a measurement"). Restated here as an open item because the plan must include a benchmark
   task that measures this BEFORE committing to the optimized `npv` implementation, not after --
   if the estimate does not hold, D-24's consistency argument still stands and the cost becomes
   a real PERF-03 problem needing its own decision, per CONTEXT.md's own text.

## Environment Availability

Not applicable in the usual external-dependency sense -- every capability this phase needs
(Web Workers, `postMessage`/transferable objects, Canvas 2D, `structuredClone`/typed arrays) is
a baseline browser API already exercised by this codebase's existing Phase 1/4/6 code
(`bench/sweep-pool.ts`, `EquityCurveChart.tsx`, `form-2-filled-contour.ts`). No new browser
capability is introduced. `OffscreenCanvas` is available in all evergreen browsers but is not
needed (see State of the Art) and is not used elsewhere in this codebase.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Web Workers + Comlink | Sweep pool | Yes (already in use, `bench/sweep-pool.ts`) | comlink 4.4.2 | N/A |
| Canvas 2D (`putImageData`, `CanvasPattern`, path fill) | Heatmap render, ruin hatch | Yes (already in use) | Baseline browser API | N/A |
| uPlot | VIZ-01/VIZ-02 marginal charts | Yes (already in use) | 1.6.32 | N/A |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 `[VERIFIED: package.json]`, with four configured projects |
| Config file | `vitest.config.ts` (project root) -- projects named `unit`, `bench`, `app`, `bench-selftest` `[VERIFIED: vitest.config.ts:49,77,406,628]` |
| Quick run command | `npm run test` (runs the fast Node `unit` project only, `vitest run --project unit`) `[VERIFIED: package.json]` |
| Full suite command | `npm run test` for pure-logic modules + `npm run bench` (Playwright-backed browser project, `vitest run --project bench`) for anything touching Canvas/uPlot/Worker-in-browser behavior `[VERIFIED: package.json]` |

The existing test-project split already used by this codebase: pure typed-array/math modules
(`iso-lines.ts`, `field-sampler.ts`, `value-to-color.ts`, `sweep-fixture-format.ts`) run
unmodified in the fast Node `unit` project (confirmed precedent: `tests/iso-lines.test.ts`,
`tests/field-sampler.test.ts`, `tests/value-to-color.test.ts`,
`tests/sweep-fixture-format.test.ts` already exist and pass this way
`[VERIFIED: directory listing, tests/*.test.ts]`); anything requiring a real browser Canvas
context, a real Worker, or real Playwright timing runs in the `bench` project
(`bench/heatmap-form-2.bench.test.ts`, `bench/sweep.bench.test.ts` already exist this way).

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VIZ-01 | Fixed-leverage slice chart renders one row of the cached grid | unit (data extraction) + app/browser (render) | `npm run test` / `npm run test:app` | ❌ Wave 0 |
| VIZ-02 | Fixed-entry-date slice chart renders one column | unit + app/browser | `npm run test` / `npm run test:app` | ❌ Wave 0 |
| VIZ-03 | Heatmap renders `form-2-filled-contour` against live swept data | app/browser (visual, existing precedent: `bench/heatmap-form-2.bench.test.ts`'s equivalence test) | `npm run bench` (equivalence proof) | ⚠️ Existing equivalence-proof PATTERN exists (`bench/heatmap-form-2.bench.test.ts`'s "equivalence" test); a new one against the LIVE grid is Wave 0 |
| VIZ-06 | Ruin hatch renders distinctly, verified on a 1929-entry high-leverage sweep with genuine ruin | app/browser (visual/pixel-sample, matching `bench/heatmap-form-2.bench.test.ts`'s `samplePixelAtDisplayPoint` pattern) + a specific fixture/sweep parameterization that reaches ruin (per CONTEXT.md's own F-02, symbol/tier/mode/holding-period must be named explicitly by the plan) | `npm run test:app` or `npm run bench` | ❌ Wave 0 -- and the exact verification sweep parameters are not yet named (F-02) |
| VIZ-09 | Short-horizon boundary rule renders in end-of-data mode | app/browser | `npm run test:app` | ❌ Wave 0 |
| METR-06 | All display metrics computed per cell in one pass | unit (assert the per-cell record carries all three metrics after one sweep) | `npm run test` | ❌ Wave 0 |
| PERF-03 | Full sweep completes under 1000ms on 4-core baseline | bench (existing pattern: `bench/sweep.bench.test.ts`, `bench/calibration.ts`'s `measureMinOfN`/normalize) | `npm run bench` | ⚠️ Framework exists (`bench/sweep.bench.test.ts` measures the SPIKE pool); the production-pool measurement is Wave 0 |
| PERF-04 | First partial results paint within 100ms | bench | `npm run bench` | ❌ Wave 0 |
| PERF-05 | Metric re-color under 16ms, no re-sweep | bench (existing recorder to be repointed: `bench/heatmap-form-2.bench.test.ts` currently benches the MOCKUP form per its own header -- "F-05: PERF-05's recorder has to move") | `npm run bench` | ⚠️ Recorder exists but must be repointed at the shipped renderer, per CONTEXT.md's own Finding F-05 |
| PERF-06 | Cancellation within one frame, superseded results discarded | bench | `npm run bench` | ❌ Wave 0 |
| PERF-09 | Pan/zoom sustain 60fps at full cell count | bench (precedent: `bench/perf-07.bench.test.ts`'s interaction-timing harness, `measureInteractionTiming`) | `npm run bench` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run test` (fast Node `unit` project -- seconds, not minutes)
- **Per wave merge:** `npm run test` + `npm run bench` (full suite, including the Playwright
  browser project and all PERF-03/04/05/06/09 measurements)
- **Phase gate:** Full suite green (`npm run test` + `npm run bench`, both currently green per
  STATE.md's "697/697 unit tests pass" at Phase 6 close) before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/sweep/column-series.test.ts` (or similar) -- unit test proving one `KernelSeries`
  resolution is shared correctly across all 50 leverage rows of a column (Pattern 1's
  correctness, not just its performance claim)
- [ ] `tests/sweep/cancellation.test.ts` -- unit or bench test proving a stale-generation chunk
  result is discarded and never merged into the live grid (PERF-06's correctness, separable from
  its timing)
- [ ] `tests/heatmap/polygon-fill.test.ts` -- the D-08 oracle-equivalence test (polygon fill vs.
  `resampleField`), including the specific edge cases named in Pitfall 3 (field-edge band,
  enclosed-band hole, categorical-adjacent boundary)
- [ ] `tests/value-to-color.test.ts` extension -- the sequential-ramp perceptual-uniformity test
  mirroring the existing diverging-ramp test (Pattern 6/Pitfall 5)
- [ ] A named verification sweep (symbol, tier, mode, holding period) that genuinely produces
  `ruinedCount > 0`, resolving CONTEXT.md's own Finding F-02 -- this is a plan-authoring task
  (name the parameters), not a code-writing task, but it belongs in Wave 0 because criterion 2's
  verification depends on it existing before VIZ-06 can be checked against real ruin
- [ ] `bench/sweep.bench.test.ts` and `bench/heatmap-form-2.bench.test.ts` both need to be
  repointed at the production pool/renderer once built (Finding F-05); until then they measure
  the Phase 1 spike / Phase 6 mockup respectively, not the shipped code

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth in this app (APP-03: no backend, no accounts) |
| V3 Session Management | No | No sessions; all state is URL-encoded (SHARE-01) |
| V4 Access Control | No | No access boundaries; fully client-side, single-user tool |
| V5 Input Validation | Yes | `src/app/permalink.ts`'s existing allow-list decode pattern (`PERMALINK_KEYS`, `getAll`-vs-`get` duplicate-key rejection, strict ISO-date round-trip validation) `[VERIFIED: src/app/permalink.ts:22-27, 168-181]` -- D-04's new sweep fields must extend this SAME allow-list codec, never a second, looser decode path |
| V6 Cryptography | No | No cryptographic operations in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed/hand-edited permalink driving the sweep engine into a pathological state (e.g. an out-of-range leverage or entry date reaching the Worker pool unvalidated) | Tampering | `buildKernelInputs`'s existing D-32 out-of-range validation (throws, names the offending value and supported range) must run BEFORE any value reaches the sweep worker, exactly as it already gates the single-run path; the sweep's per-column series resolution (Pattern 1) should reuse the same validation, not bypass it for performance |
| A crafted `cols`/`rows`/`metaByteLength` triple in a `SweepFixture`-shaped payload driving a runaway typed-array allocation | Denial of Service | Not applicable to the LIVE sweep grid (it is constructed in-memory from known-good `cols=200`/`rows=50` constants, never decoded from an untrusted byte buffer); the existing `decodeSweepFixture`'s pre-allocation length check (`T-06-02`, `[VERIFIED: src/data/sweep-fixture-format.ts]`) already protects the ONE place this app decodes an untrusted-shaped buffer (the committed design-pass fixture, not user input) |
| Worker pool resource exhaustion (an attacker-controlled parameter driving an unbounded chunk count or timeout) | Denial of Service | `workerCountForCores` already bounds pool width to `hardwareConcurrency - 1` (floored at 1); the existing `DEFAULT_CHUNK_TIMEOUT_MS`/per-chunk timeout pattern (`bench/sweep-pool.ts`) should carry into production so a pathological input cannot hang a worker indefinitely |

No new attack surface is introduced by this phase beyond what the existing permalink/validation
boundary already covers -- this is a client-side, backend-less, single-user analysis tool
(APP-03), and the sweep engine's only externally-influenceable input is the same
`BacktestRequest`-shaped, already-validated parameter set the single-run path already gates.

## Sources

### Primary (HIGH confidence -- read directly this session)
- `src/kernel/backtest.ts`, `src/kernel/backtest.types.ts` -- kernel contract, unchanged this phase
- `src/data/kernel-inputs.ts` -- `buildKernelInputs`, the per-column-not-per-cell finding
- `src/colorscale/value-to-color.ts` -- ramp/colour authority, `interpolateRamp`'s hardcoded stops
- `src/data/sweep-fixture-format.ts` -- `SweepFixture` shape, binary format scope
- `src/metrics/irr.ts`, `src/metrics/cagr.ts`, `src/metrics/format.ts` -- annualized-metric authority
- `src/app/App.tsx`, `src/app/state.ts`, `src/app/permalink.ts`, `src/app/bounds.ts` -- integration surfaces
- `src/app/components/ParameterColumn/HoldingModeControl.tsx`, `LeverageControl.tsx` -- reused controls
- `src/app/components/ResultColumn/EquityCurveChart.tsx` -- uPlot integration precedent
- `src/validation/attribution.ts` -- confirms attribution's cost and scope exclusion
- `bench/sweep-pool.ts`, `bench/sweep.worker.ts` -- Phase 1 spike pool, cancellation gap
- `bench/heatmap-form-2.bench.test.ts` -- current PERF-05 recorder, F-05's "must move"
- `.planning/phases/06-heatmap-design-pass/mockups/shared/iso-lines.ts`, `field-sampler.ts`,
  `mockup-runtime.ts` -- geometry/fill/hatch authority and the un-graduated-helpers gap
- `.planning/phases/06-heatmap-design-pass/mockups/forms/form-2-filled-contour.ts` -- winning form
- `perf-budgets.ts` -- all eight locked budgets, `PERF_03_BASELINE_HARDWARE_CONCURRENCY`
- `tests/value-to-color.test.ts` -- exact VIZ-07 perceptual-step-ratio assertion mechanics
- `vitest.config.ts`, `package.json` -- test project names, installed dependency versions
- `.planning/PROJECT.md` Key Decisions table, `.planning/WINDOWS.md` entries 2 and 5,
  `.planning/research/PITFALLS.md` sections E and F
- `.planning/phases/06-heatmap-design-pass/06-HEATMAP-SPEC.md` -- the implementable contract

### Secondary (MEDIUM confidence)
- `github.com/GoogleChromeLabs/comlink/issues/372` ("Built-in termination/cancellation?") --
  confirmed via WebSearch, official project's own issue tracker
- `github.com/GoogleChromeLabs/comlink/issues/538` (callback-proxy Firefox timing quirk) --
  same source class

### Tertiary (LOW confidence, marked for validation)
- General marching-squares/isoband algorithm characterization (dual-threshold classification,
  hole handling) -- aggregated via WebSearch across Wikipedia and academic isoband writeups, no
  single authoritative source read in full; the actual difficulty for THIS codebase's specific
  fill can only be confirmed by attempting D-05
- Comlink's `Comlink.proxy` callback-marshaling mechanics -- aggregated via WebSearch across
  third-party blog posts (LogRocket, surma.dev, David East's blog) rather than the official
  Comlink README/docs read directly; the underlying capability (proxy wraps a function so it can
  be called across the worker boundary) is consistent across all sources found, but exact API
  surface should be confirmed against `node_modules/comlink`'s own `.d.ts` at implementation
  time, mirroring the discipline `bench/sweep.worker.ts`'s own header comment already applies
  ("verified against node_modules/comlink's own .d.ts, since RESEARCH.md tags its Comlink
  description LOW confidence")

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all versions read directly from `package.json`
- Architecture: HIGH for the per-column series-reuse finding and the `SweepFixture`-extension
  pattern (both directly read from source); MEDIUM for the specific generation-token
  cancellation shape and the Comlink progress-signalling recommendation (principle is CITED,
  exact implementation shape is a design choice)
- Pitfalls: HIGH for the five findings grounded in direct code reads (Pitfalls 1, 2, 4, 5, 6, 7,
  9, 10); LOW for the general marching-squares ring-stitching difficulty characterization
  (Pitfall 3), which is inherently unverifiable until D-05 is actually attempted

**Research date:** 2026-08-22
**Valid until:** No external ecosystem dependency in this research decays quickly (internal
codebase reads do not go stale on a calendar basis, only when the code itself changes). Treat as
valid through this phase's execution; re-verify any `[VERIFIED: file:lines]` claim if the cited
file changes before the plan is executed.
