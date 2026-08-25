# Phase 7: Sweep Engine and the Heatmap - Context

**Gathered:** 2026-08-22
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase turns Phase 6's chosen heatmap treatment into a shipped, interactive surface backed by
a real sweep engine.

It delivers three things that do not exist yet:

1. **A production sweep engine in `src/`.** Today the only Worker pool is `bench/sweep-pool.ts`
   plus `bench/sweep.worker.ts`, which partition a synthetic GBM series through
   `bench/kernel.ts`'s spike recurrence. Neither touches the real bundle, the real
   `src/kernel/backtest.ts`, or real metrics. Phase 7 builds the shipped equivalent: a cancellable,
   progressively-reporting pool over `src/kernel/backtest.ts` and the compiled bundle, computing
   every display metric per cell in one pass (METR-06).

2. **The shipped heatmap panel**, rendering `form-2-filled-contour` against swept data per
   `06-HEATMAP-SPEC.md`, with the two 1D slice charts (VIZ-01, VIZ-02), the sweep-mode toggle
   (VIZ-04), the metric toggle, the ruin and short-horizon treatments (VIZ-06, VIZ-09), and the
   VIZ-10 caveat.

3. **The measured performance story for the interactive path**: PERF-03, PERF-04, PERF-05,
   PERF-06 and PERF-09, all currently unmeasured, all gated from their first commit.

**Not in this phase:** PNG export, curated permalinks and the canonical arguments (Phase 8). The
attribution decomposition as a colourable metric (deferred, below). Any change to the simulation
kernel, the cost model, or the data bundle.

</domain>

<decisions>
## Implementation Decisions

### Axis domains, grid resolution and permalink

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

### Fill algorithm and the Finding A performance obligation

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

### Progressive paint and cancellation

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

### Layout and how the heatmap joins the app

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

### Hover, crosshair and drill-down

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

### Metrics

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

### Sweep mode, holding period, and the two right-edge conditions

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

### Contour labels, zoom and pan

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The contract this phase is planned and verified against
- `.planning/phases/06-heatmap-design-pass/06-HEATMAP-SPEC.md` -- the implementable heatmap
  contract (D-26 of Phase 6). §3 the colour mapping, §4 categorical cells, §5 legend, §6 the VIZ-10
  caveat's exact sentences and placement, §7 form 2's geometry, §10 the five carry-forwards
  (Findings A, B, C, F-01, F-04), §11 what Phase 7 still decides.
- `.planning/phases/06-heatmap-design-pass/06-UI-SPEC.md` -- typography roles, colour tokens and the
  copywriting contract the heatmap panel renders inside.
- `.planning/phases/06-heatmap-design-pass/06-CONTEXT.md` -- Phase 6's D-08 through D-29, the source
  of the axis, palette, categorical and graduation decisions this phase extends.
- `.planning/phases/04-first-defensible-backtest-in-the-browser/04-UI-SPEC.md` -- the app's colour
  and layout system, including the destructive colour `06-HEATMAP-SPEC.md` §4 reuses for ruin, and
  D-20's screenshot region that D-30 places the caption strip inside.

### Modules that are the AUTHORITY, not to be reimplemented
- `src/colorscale/value-to-color.ts` -- `valueToColor`, `interpolateRamp`, `rampPositionFor`,
  `RAMP_STOPS`, `LEGEND_TICK_MULTIPLES`, `RUIN_BASE_RGBA`, `INCOMPLETE_RGBA`, `DOMAIN_LOG_MIN/MAX`.
  Graduated in Phase 6 precisely so Phase 7 imports rather than re-derives.
- `src/kernel/backtest.ts` and `src/kernel/backtest.types.ts` -- the simulation kernel and its
  typed-array-and-scalar boundary contract. The sweep calls this; it does not reimplement any part
  of the recurrence.
- `src/metrics/format.ts` -- `formatMultiple`. `06-HEATMAP-SPEC.md` §5 is explicit that legend and
  readout labels render through this and that no second formatter is added.
- `src/metrics/irr.ts`, `src/metrics/cagr.ts` -- see D-24's performance lead.
- `.planning/phases/06-heatmap-design-pass/mockups/shared/iso-lines.ts` -- marching-squares
  segments; read its header before D-05, it states exactly what it does not do.
- `.planning/phases/06-heatmap-design-pass/mockups/shared/field-sampler.ts` -- `resampleField`,
  `BAND_MULTIPLES`, `BAND_LEVELS`, the categorical override and tie rule. The per-pixel path D-08
  keeps as the oracle.
- `.planning/phases/06-heatmap-design-pass/mockups/forms/form-2-filled-contour.ts` -- the winning
  form's own two-pass render, including `FORM_2_GEOMETRY`.
- `src/data/sweep-fixture-format.ts` -- `CELL_FLAG_RUINED`, `CELL_FLAG_INCOMPLETE`, `SweepFixture`.

### The performance budgets and how they are measured
- `perf-budgets.ts` -- all eight locked budgets and `PERF_03_BASELINE_HARDWARE_CONCURRENCY`. Every
  budget is at its perception anchor under D-19; relaxing any needs a Key Decision under PERF-01a.
- `bench/sweep-pool.ts`, `bench/sweep.worker.ts` -- the Phase 1 pool prototype. Precedent for worker
  count, chunking and transfer discipline; it partitions a SYNTHETIC series and has no cancellation.
- `bench/heatmap-form-2.bench.test.ts` -- the current official PERF-05 recorder.
- `bench/canvas-repaint.bench.test.ts`, `bench/canvas-grid.ts` -- the Phase 1 putImageData-versus-
  fillRect comparison and its `mapValueToRgba` precursor.
- `bench/calibration.ts`, `bench/report.ts` -- the normalization anchor and the verdict-withholding
  rule quick-260818-v2d added for off-baseline hardware widths.
- `.planning/WINDOWS.md` -- the measured-variance ledger.

### Requirements and pitfalls
- `.planning/REQUIREMENTS.md` -- VIZ-01, VIZ-02, VIZ-03, VIZ-04, VIZ-06, VIZ-09 (and VIZ-07, VIZ-10
  already satisfied), METR-01, METR-02, METR-06, PERF-03, PERF-04, PERF-05, PERF-06, PERF-09.
- `.planning/research/PITFALLS.md` §E1 (scale type matched to metric semantics, which D-25
  answers), §E3 (colourblind-safe families), §E4/§E5 (categorical cells and why a faded real colour
  is the wrong treatment, which D-29 turns on).
- `.planning/PROJECT.md` -- Key Decisions table, including the PERF-03 D-20 escalation whose
  "coarser default grid" lever D-03 leaves unspent.

### App integration surfaces
- `src/app/App.tsx` -- the single result-column slot D-21 reserved for this phase, which D-15 fills.
- `src/app/state.ts` -- `BacktestRequest`, `scheduleRun`, `currentKernelResult`,
  `currentDerivedMetrics`, the permalink flush path D-04 extends.
- `src/app/permalink.ts` -- the encoding D-04 extends.
- `src/app/bounds.ts` -- `Tier`, `resolveEntryDateBounds`, which D-02 reuses.
- `src/app/components/ParameterColumn/HoldingModeControl.tsx` -- the control D-27 reuses, and the
  source of the "end of data, not today" naming decision.
- `src/app/components/ParameterColumn/LeverageControl.tsx`,
  `src/app/components/ParameterColumn/EntryDateControl.tsx` -- the two controls D-17 repurposes as
  the crosshair.
- `src/app/components/ResultColumn/EquityCurveChart.tsx` -- the uPlot integration pattern the
  marginal slice charts of D-16 should follow, including `log-axis-splits.ts`'s hard-won fix.
- `src/app/theme.ts` -- theme resolution; note D-15 of Phase 6 means the heatmap palette does NOT
  swap by theme, but the surrounding chrome does.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`src/colorscale/value-to-color.ts`** -- graduated in Phase 6 for exactly this purpose. The
  diverging ramp, both categorical branches and their checked order, the symlog transform and the
  fixed domain all exist and are unit-tested. D-25's sequential ramp is an addition to this module,
  not a parallel one.
- **`bench/sweep-pool.ts` + `bench/sweep.worker.ts`** -- a working Comlink Worker pool with
  transfer-not-clone discipline (PITFALLS F3), chunk queueing so a slow worker cannot strand the
  tail (PITFALLS F4), `workerCountForCores` reserving a core for the UI thread, and a chunk
  timeout. **It computes a synthetic GBM series through `bench/kernel.ts`'s spike recurrence, not
  the real kernel or the real bundle, and it has no cancellation path.** Read it as the precedent
  for structure; the production pool is new code.
- **`mockups/shared/field-sampler.ts` and `iso-lines.ts`** -- both are pure typed-array math with no
  DOM and no imports outside `src/`, so they already run unmodified in the fast Node `unit` test
  project. That is what makes D-08's oracle test cheap.
- **`src/app/components/ResultColumn/EquityCurveChart.tsx`** -- the uPlot pattern, including the
  measured-gutter `axis.size` hook and the `log-axis-splits.ts` workaround for uPlot's ~1e-22
  log-scale floor. The marginal slice charts of D-16 span the same kind of order-of-magnitude range
  and will hit the same floor.
- **`src/app/parameter-defaults.ts`** -- the shared default-badge and reset affordance every
  parameter control carries (CRED-05/D-22). New sweep controls should carry it too.
- **`src/data/kernel-inputs.ts`** -- `buildKernelInputs` already resolves a `BacktestRequest` into
  the kernel's sliced typed arrays, including the holding-period overrun path. The sweep needs the
  same resolution per column, and this is where that logic lives.

### Established Patterns

- **Every module header states its plan, its decision IDs and its reasoning.** This is uniform
  across `src/`, `bench/` and the mockups, and it is how the decision record stays attached to the
  code. New modules follow it.
- **Budgets are gated from the first commit, before the thing they measure exists.** PERF-04, 06 and
  09 are already declared in `perf-budgets.ts` and unmeasured. Phase 7 makes them measure something.
- **Measurement decides, and both candidates are proven to produce the same output before either
  figure is trusted** (Phase 1's `putImageData` versus `fillRect`, and the Rust-versus-JS
  microbenchmark). D-07 applies the same rule to the polygon-versus-per-pixel fork.
- **No em dash characters anywhere in tracked source, docs or commit messages.** Enforced since
  01-06.
- **The kernel imports nothing at runtime** (SIM-10/D-30) and allocates nothing internally
  (SIM-11). The sweep must preallocate per worker.
- **Caveats are rendered, not hidden.** Every simplification that could change a conclusion has a
  visible surface (`ValidationExplanation`, `ExtendedTierWarning`, `ProvenanceStrip`,
  `MethodologyOverlay`). D-29 and D-30 are the sweep's version of this.

### Integration Points

- `App.tsx`'s result column -- D-15's mode switch, filling the slot D-21 reserved.
- `state.ts` -- a sweep store alongside the existing single-run store, sharing `BacktestRequest`'s
  fields so D-17's crosshair and D-22's drill-down are reads and writes of one source of truth.
- `permalink.ts` -- D-04's new fields.
- `perf-budgets.ts` + `bench/` -- PERF-03, 04, 05, 06 and 09 all become measured here. PERF-05's
  recorder currently benches the mockup form; it moves to the shipped renderer.
- `vite.config` worker handling -- the production worker joins the build rather than living in
  `bench/`.

</code_context>

<specifics>
## Specific Ideas

- **The chunky-output observation, from the owner during the Phase 6 review**, is what motivates
  D-05: form 2's output is ten quantised bands, so paying per display pixel to produce large flat
  regions of uniform colour is on its face suspicious. Sub-cell precision is only needed near band
  boundaries, which is exactly what the iso-line geometry already locates.

- **"It's going to look stupid if we start shrinking the panel."** This is why D-10 makes internal
  resolution the lever and rules panel size out. The panel keeps its size in every fallback branch.

- **The IRR consistency concern is the owner's**, and it changed the answer. The perf question was
  on the table; the owner raised that omitting IRR could itself be misleading, which surfaced the
  METR-01/METR-02 contradiction D-24 now resolves. Recorded because the reasoning matters more than
  the outcome: the sweep's metric rule is derived from the single run's, not chosen independently.

</specifics>

<deferred>
## Deferred Ideas

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

</deferred>

<findings>
## Findings (not decisions -- recorded for the researcher and planner)

- **F-01: The production sweep engine is new code, not a promotion.** `bench/sweep-pool.ts` and
  `bench/sweep.worker.ts` look like a head start and are not one: they run a synthetic GBM series
  through `bench/kernel.ts`'s spike recurrence, never touch the bundle or `src/kernel/backtest.ts`,
  and have no cancellation path at all. PERF-06 and PERF-04 are both unimplementable on that base.
  Read the prototype for structure (chunk queueing, transfer discipline, worker count, timeout),
  then write the production pool.

- **F-02: Criterion 2's verification path exists but needs to be specified.** Roadmap criterion 2
  demands verification "on a 1929-entry high-leverage sweep where ruin genuinely occurs", and
  `06-HEATMAP-SPEC.md` Finding C records that Phase 6 could not supply that evidence
  (`ruinedCount` 0). The cause is now identifiable: D-09 started the fixture's entry axis at
  1988-01-05, one quarter AFTER 1987-10-19, when SPX fell roughly 20.5%, which ruins any position
  above about 4.88x. With D-02's tier-following axis, extended-tier SPX reaches 1927-12-30 and
  D-01's 5x ceiling clears that threshold, so ruin becomes reachable at the top row without raising
  the leverage cap. The planner should name the exact verification sweep (symbol, tier, mode,
  holding period) rather than leaving it to the verifier to construct.

- **F-03: Declining keyboard nudge leaves the canvas field pointer-only.** D-21 gives snap plus
  axis guides but no keyboard path to the crosshair. The entry-date and leverage parameter controls
  remain keyboard-operable and drive the same crosshair under D-17, so the state is reachable; the
  field itself is not. Whether that satisfies the project's accessibility posture is worth checking
  against Phase 4 and 5's practice rather than assumed either way.

- **F-04: D-31 and D-29 collide at the right edge.** Ruin hatching and the short-horizon boundary
  can occupy the same region in end-of-data mode. Both are deliberate and neither yields, so the
  planner should treat "hatch and boundary read cleanly together" as a real design task, not an
  incidental one. Note also that the hatch has still never been visually judged in a field
  (Finding C), so this collision will be seen for the first time during this phase.

- **F-05: PERF-05's recorder has to move.** `bench/heatmap-form-2.bench.test.ts` currently records
  the official PERF-05 figure against the mockup form. Once the shipped renderer exists, the
  headline figure must come from it, or the budget is being measured against code that does not
  ship.

- **F-06: The D-24 IRR lead is a hypothesis, not a measurement.** The pow-free NPV reduction is
  arithmetically sound but the claimed magnitude (roughly 40M multiplies, "noise") is an estimate
  in the same class as the napkin math Phase 1 exists to have replaced. Measure it before relying
  on it, and if it does not hold, D-24's consistency argument still stands and the cost becomes a
  real PERF-03 problem needing its own decision.

- **F-07: D-12's coarse pass needs a renderer that accepts a variable grid size.** Both the
  polygon and per-pixel paths must run over an arbitrary N x M field, not a hardcoded 200 x 50.
  `resampleField` and `marchingSquaresSegments` already take grid dimensions as parameters, so this
  is a constraint on new code rather than a change to existing code, but it rules out any
  optimization that bakes in the full grid dimensions.

</findings>

---

*Phase: 07-sweep-engine-and-the-heatmap*
*Context gathered: 2026-08-22*
