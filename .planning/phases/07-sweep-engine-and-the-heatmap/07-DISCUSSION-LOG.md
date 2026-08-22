# Phase 7: Sweep Engine and the Heatmap - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-08-22
**Phase:** 07-sweep-engine-and-the-heatmap
**Areas discussed:** Shipped axes and grid size, Fill algorithm and perf fallback, Progressive
paint and cancel, The heatmap's place in the app, Hover and click-to-drill, Metric toggle set,
Sweep mode and holding period, Contour labels and pan/zoom

All eight offered gray areas were selected for discussion. None was skipped.

---

## Shipped axes and grid size

Framing offered before the questions: Phase 6's `ruinedCount` was 0 because D-09 started the entry
axis at 1988-01-05, one quarter after 1987-10-19 (SPX roughly -20.5%, which ruins anything above
about 4.88x). The bundle's SPX total return runs back to 1927-12-30, so extending the span buys
criterion 2's ruin evidence without raising the leverage cap.

### Leverage axis range

| Option | Description | Selected |
|--------|-------------|----------|
| 1x-5x fixed | Phase 6's design-pass range carried through; ~0.08x steps; reaches ruin against 1987. Cost: PROJECT.md names 1x-20x+ | ✓ |
| 1x-20x fixed | Matches the single-run slider and the requirement text literally. Cost: 0.38x steps, 1x-3x compresses into the bottom fifth | |
| Non-linear leverage axis | Log or piecewise spacing; gets both. Cost: a second non-linear mapping on a panel already using symlog colour | |
| User-controlled max | Default 5x with a control and permalink field. Cost: two sweeps of the same data produce different pictures | |

### Entry-date axis span

| Option | Description | Selected |
|--------|-------------|----------|
| Follows the tier control | Reuses `bounds.ts` and `ExtendedTierWarning`; extended SPX reaches 1927, making criterion 2 reachable | ✓ |
| Always full history | Strongest single picture, guarantees ruin on-chart. Cost: interpolated-rate caveat permanently competing with the VIZ-10 caveat | |
| Strict tier only | Cleanest provenance. Cost: criterion 2 unverifiable on SPX, 1929 unreachable | |

### Grid resolution (PERF-03's unspent coarser-grid lever)

| Option | Description | Selected |
|--------|-------------|----------|
| Keep 200x50 = 10,000 | Every budget and criterion is written against it; passed at 80.8%; lever stays in reserve | ✓ |
| Coarser default, full on demand | Buys back ~40% of sweep time. Cost: PERF-03's headline stops describing the default view | |
| Resolution follows panel width | Never finer than the screen. Cost: cell count varies by viewport, so the timing figure is not one number | |

### Sweep state in the permalink

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, full sweep state | A heatmap is as linkable as a single backtest; Phase 8 depends on it | ✓ |
| Only the metric and mode | One grid geometry in existence, links cannot disagree about the frame | |
| No, Phase 8 owns it | Keeps Phase 7 focused. Cost: Phase 8 reopens this file set | |

---

## Fill algorithm and perf fallback

**This area took three rounds.** The first round was answered with a request for explanation rather
than a choice, the second dissolved the distinction between two of its own options, and only the
third produced the decisions. The intermediate exchanges are recorded because they changed the
outcome.

### Round 1: what was asked, and the owner's response

The initial question offered timeboxed-polygon, committed-polygon, offscreen-cache-only and
cap-the-field-rectangle. The owner declined to answer it:

> "I don't understand the impact of bringing isolines.ts into scope. You'll need to explain that
> before we decide the answer to this question."

On the separate fallback question (panel size vs metric-switch instantaneity vs cell count) the
owner answered and asked to be corrected:

> "I think it's going to look stupid if we start shrinking the panel. If I'm understanding this
> correctly, which is why I'm leaning towards cell count giving because that would leave it the
> same size, but create the same type of effect where it's a coarser view, I think? Please correct
> me if I'm full of shit."

**Correction given:** cell count is not a lever on repaint cost. Under the per-pixel path, halving
the grid still visits every display pixel and merely reads a smaller source array, so 36ms stays
36ms. Coarser cells buy sweep time (PERF-03), not repaint time (PERF-05). Under the polygon path
cell count IS the cost driver, but then there is no 16ms problem to solve.

**The lever the owner was reaching for did exist and had not been offered:** keep the panel at full
size and resample the fill BELOW display resolution, upscaling. Repaint cost tracks internal
resolution, not panel size. It is unusually cheap on this form because the band boundaries are
stroked separately at full resolution, so crisp edges survive a soft fill. That option was added to
the re-ask and selected.

**Explanation given on iso-lines.ts:** form 2 runs two passes. The base fill visits each of 171,136
display pixels, bilinearly interpolates the 200x50 grid, decides which of ~11 bands it lands in and
writes that colour (O(display pixels)). The stroke pass runs marching squares over the same grid to
find where the field crosses each band level, emitting segments (O(cells)). Pass 2 already computes
exactly where every boundary is; pass 1 then throws that away and re-derives it one pixel at a
time. The polygon idea is to join pass 2's curves into closed loops and fill them as paths, which
the canvas rasterizes natively. What it costs: `iso-lines.ts` emits UNSTITCHED segments and its own
header calls stitching "the genuinely hard part of marching squares", skipping it deliberately
because stroking never needed it. Filling needs closed rings, closure along the field edge, and
nested-band holes. That skipped work is the whole risk.

### Round 2: the timeboxed-vs-committed distinction

Re-asked with the explanation. The owner pushed back on the option set itself:

> "I am struggling to see the difference between option one and option two other than option one
> would carry on with plan B if plan A fails and option two would what? Just try forever to get it
> to work? Or would it just fail in the same way and then ask me what to do?"

**Conceded.** The only real difference is whether the fallback is pre-authorized in CONTEXT.md
(executor takes it and continues) or not (executor checkpoints and asks). Neither tries forever.
The options were collapsed and re-asked as that single question.

### Round 3: the decisions

**Who decides the fallback**

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-authorize the fallback | Phase completes unattended | |
| Escalate to me | Executor checkpoints and asks before spending anything on plan B | ✓ |

**Go/no-go criterion**

| Option | Description | Selected |
|--------|-------------|----------|
| Visual equivalence, not just speed | Must match the per-pixel oracle within tolerance AND hit the budget; a fast renderer with mis-stitched rings is a wrong picture drawn quickly | ✓ |
| Repaint budget only | Simpler gate. Cost: correctness rests on geometry unit tests alone | |
| A bounded attempt | A criterion about effort rather than result, which a verifier cannot check | |

**Fate of the per-pixel sampler**

| Option | Description | Selected |
|--------|-------------|----------|
| Keep as test oracle | Stays in the test tree; a test asserts both paths paint the same picture | ✓ |
| Delete it | No dead code. Cost: no known-good picture to test against | |
| Ship both, runtime switch | Two production paths to maintain | |

**If neither path holds 16ms**

| Option | Description | Selected |
|--------|-------------|----------|
| Internal resolution gives | Panel keeps full size; fill resampled below display resolution, strokes at full resolution | ✓ |
| Metric-switch instantaneity gives | Needs a PERF-01a Key Decision to relax a locked budget | |
| Panel size gives | The outcome the owner called stupid | |

**Where the render modules live**

| Option | Description | Selected |
|--------|-------------|----------|
| Graduate both into src/ | Mockups import from src/ as they already do for value-to-color.ts, preserving D-28 | ✓ |
| Rewrite fresh in src/ | Cleanest reading of throwaway. Cost: losing forms drift from current reality | |
| Graduate iso-lines only | Mockups keep their per-pixel fill | |

---

## Progressive paint and cancel

Constraint surfaced before the questions: marching squares needs a complete field, so a partially
filled grid produces garbage boundary curves. "Cells appear as workers finish" is not directly
renderable under form 2, which forces progressive paint to mean complete-but-coarse.

### First 100ms (PERF-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Coarse-to-fine, same form | Strided subsample (~1/16 of cells) paints a complete low-res contour field, then refines | ✓ |
| Flat fill first, contours at the end | Cheapest. Cost: visible holes, and the traceable boundary absent until the end | |
| Two-stage form swap | Form 1 immediately, form 2 on completion. Cost: reads as a glitch | |

### On cancel (PERF-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Hold the old grid until the new coarse pass lands | No flash of empty; one internally consistent picture at all times | ✓ |
| Clear immediately | Always matches the controls. Cost: strobing empty during a slider drag | |
| Dim the stale grid | Cost: competes with the incomplete-hold grey, which already means "no value here" | |

### Progress affordance

| Option | Description | Selected |
|--------|-------------|----------|
| The field is the progress indicator | No spinner, bar or percentage; refinement is the feedback | ✓ |
| Thin determinate bar | Cost: another moving element on a crowded panel | |
| Cell count readout | Cost: noise during the sweep | |

**Note on a tension between two of these:** holding the stale grid creates a window where the
visible field does not match the controls, and the option text flagged that it would need a
staleness affordance. Declining the affordance is consistent only because that window is bounded by
the 100ms coarse pass. Recorded in CONTEXT.md D-13/D-14 so the reasoning survives.

---

## The heatmap's place in the app

### Coexistence with the single-run column

| Option | Description | Selected |
|--------|-------------|----------|
| Mode switch in the result column | Fills the slot App.tsx's D-21 explicitly reserved; each screenshot is one argument | ✓ |
| Heatmap appended below | Both arguments on one page. Cost: long page, sweep on every load, cropped screenshots | |
| Heatmap replaces the equity curve only | Tightest coupling. Cost: Phase 5's panels would need real rework | |

### Slice charts (VIZ-01, VIZ-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Marginal charts on both axes | Each is one row/column of the cached grid; field and both cuts read as one picture | ✓ |
| Behind a toggle | More room per chart. Cost: the relationship must be held across a click | |
| On demand from hover | Cost: invisible in a screenshot, this project's delivery medium | |

### Entry-date and leverage controls in sweep mode

| Option | Description | Selected |
|--------|-------------|----------|
| They drive the crosshair | Same controls, same meaning; mode switches preserve position | ✓ |
| Disabled in sweep mode | Cost: two dead controls, no way to name a cell | |
| Removed in sweep mode | Cost: column reflows on every mode switch | |

### Default mode on a fresh visit

| Option | Description | Selected |
|--------|-------------|----------|
| Single run | Keeps PERF-08's 1500ms interactive budget clear of an ~800ms sweep | ✓ |
| Sweep | The most persuasive view. Cost: every cold load pays the sweep | |
| Permalink-driven, single run otherwise | Same in practice, stated explicitly | |

---

## Hover and click-to-drill

Reframed before asking: the crosshair already exists from the previous area, so this was about
whether the pointer is a second way to move it.

### What hover does

| Option | Description | Selected |
|--------|-------------|----------|
| Transient readout, click commits | Browse without destroying position; slices stay readable | ✓ |
| Hover drives everything live | Most direct feel for the surface. Cost: unreadable slices while moving, permalink writes on mouse move | |
| No hover, controls only | Cost: the deferred D-07 note argues the opposite | |

### Readout content

| Option | Description | Selected |
|--------|-------------|----------|
| All metrics, not just the displayed one | METR-06 computes them anyway; the readout becomes the cell's receipt | ✓ |
| Entry date, leverage, displayed metric | Small and fast | |
| Displayed metric plus state | Cost: cannot name the cell | |

### Pointing precision at ~4px cells

| Option | Description | Selected |
|--------|-------------|----------|
| Snap to cell, axis guides | Makes imprecision legible; works with the marginal charts sharing those axes | ✓ |
| Snap plus keyboard nudge | Adds a keyboard path to the field. Not selected | |
| Magnifier loupe | Cost: a second live render path under the pointer | |

### Drill-down

| Option | Description | Selected |
|--------|-------------|----------|
| Crosshair sets it, mode switch shows it | No new gesture, no new plumbing; the two modes become one investigation | ✓ |
| Explicit button on the readout | More discoverable. Cost: an interactive element inside a transient tooltip | |
| Double-click drills | Cost: undiscoverable, no touch equivalent | |

---

## Metric toggle set

Two facts surfaced before the questions: IRR is bounded bisection whose own header says it is sized
for a solve that runs once, so its sweep cost is real but conditional on the contribution schedule;
and storing every metric per cell is only ~320KB.

### Metrics beyond multiple-of-contributed (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Max drawdown | The spec's D-04 stress case; already tracked in-loop at zero cost | ✓ |
| CAGR | Comparable across the entry axis where a raw multiple is not | ✓ |
| IRR | METR-01 makes it the default with contributions, which is when it is expensive | see below |

**User's response on IRR:**

> "i'm concerned about not concluding IRR as it could be misleading. If we want to add it later and
> we decide it's necessary and we don't do it now, what's the impact?"

**Answer given:** the concern is sharper than the perf one. METR-01 makes IRR the default annualized
metric whenever contributions are non-zero and METR-02 says CAGR must be suppressed or qualified in
exactly that case, so a sweep offering CAGR but not IRR would paint an unqualified CAGR field
precisely when the single-run view beside it suppresses CAGR and shows IRR. The same app would
contradict itself on the same data.

Cost of adding it later: structurally near zero, since the per-cell metrics record is additive and
fixed-domain-per-metric had just been chosen. The perf cost is identical whenever it is paid, so
deferring buys nothing except leaving the inconsistency in place.

Also corrected downward: bisection to 1e-9 over the `[-0.9999, 10.0]` bracket converges in roughly
33 iterations, not the 100 cap, and `npv`'s `Math.pow` per flow can become one multiply per flow on
a regular monthly schedule because the discount factors are a geometric progression. Roughly 40M
multiplies grid-wide, which is noise. Flagged as a lead to measure, not a claim.

**Re-asked and answered:**

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror METR-01/02 exactly | IRR with contributions, CAGR without, never both unqualified | ✓ |
| Include both, always | Maximum information. Cost: offers a metric the app elsewhere calls misleading | |
| Include IRR, drop CAGR | One annualized metric always. Cost: pays IRR's cost in the free default case | |

### Attribution as a colourable metric

| Option | Description | Selected |
|--------|-------------|----------|
| Defer to a later phase | VIZ-03 scopes the heatmap to outcome metrics | ✓ |
| Include it | The project's most novel possible picture. Cost: new scale semantic, attribution per cell | |

### Scale type follows the metric (PITFALLS E1)

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, per metric | Diverging for threshold metrics, sequential for pure magnitude | ✓ |
| Always diverging | One ramp. Cost: drawdown gets a meaningless midpoint, the exact E1 failure | |
| Always diverging, drawdown excluded | Cost: drops the spec's named stress case | |

### Colour domain per metric

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed per metric | Extends D-16; clipping stated at the legend ends | ✓ |
| Fitted to the sweep | Cost: two links showing the same colours would mean different numbers | |
| Fixed with a fit-to-data toggle | Deferred in Phase 6 for the cost it names | |

---

## Sweep mode and holding period

Carried forward without asking: `HoldingModeControl.tsx` already implements this toggle and
deliberately names the open-ended mode "Hold to end of data (\<date\>)", rejecting "today" because
the bundle is refreshed manually. VIZ-04's literal "hold-to-today" wording is superseded by that
documented decision.

Also surfaced: the two modes fail differently at the right edge. Fixed-period cells that overrun
carry no value (D-19's grey). End-of-data cells carry real values that are simply short-horizon, so
greying them would deny real data. That is why D-19's grey is the wrong precedent for VIZ-09,
despite Finding F-01 naming it as the starting point.

### VIZ-09 short-horizon marking

| Option | Description | Selected |
|--------|-------------|----------|
| Boundary line plus label, colours intact | Marks non-comparability without denying the data; survives a crop | ✓ |
| Progressive desaturation | Continuous, matching reality. Cost: a faded real colour is the PITFALLS E5 failure | |
| Reuse D-19's grey | One rule for both. Cost: says "no value" about cells that have one | |

### VIZ-04 mode statement placement

| Option | Description | Selected |
|--------|-------------|----------|
| In the caption strip with the VIZ-10 caveat | Inside the D-20 screenshot region, so both travel with a crop | ✓ |
| As a chart title | Most prominent. Cost: duplicates the mode switch control | |
| In the axis label | Compact. Cost: easy to miss, long in fixed-period mode | |

### Ruin under end-of-data mode

| Option | Description | Selected |
|--------|-------------|----------|
| Unchanged | Ruin is complete whenever it happens; the hatch applies in both modes | ✓ |
| Suppressed in the short-horizon region | Cost: hides the most important categorical outcome where readers argue most | |

### Holding-period drag behaviour

| Option | Description | Selected |
|--------|-------------|----------|
| Live re-sweep with cancellation | The boundary curve moves as you drag; the hardest test of PERF-06 and PERF-07 | ✓ |
| Commit on release | No thrash. Cost: leaves the cancellation path unexercised | |
| Debounced | Cost: a constant to tune, and lag that reads as lag | |

---

## Contour labels and pan/zoom

Surfaced before asking: if the polygon path lands, zoom is resolution-independent for free
(re-fill the same paths under a new transform, still O(cells)). Under the per-pixel path a
magnified bitmap goes soft and re-resampling costs a full repaint. A third argument for the polygon
rebuild that Finding A does not make.

### Contour level labelling (Finding B)

| Option | Description | Selected |
|--------|-------------|----------|
| Breakeven only, inline | The line the form exists to make traceable; cheapest thing capturing most value | ✓ |
| All levels, contour-map convention | Fullest realisation of BAND_MULTIPLES. Cost: label placement and collision avoidance | |
| None, legend carries it | Cost: a cropped screenshot loses the mapping | |

### What zoom does (PERF-09)

| Option | Description | Selected |
|--------|-------------|----------|
| Magnify the rendered field, pan when zoomed | No re-sweep; axes rescale to keep stating real values | ✓ |
| Zoom re-sweeps at higher resolution | Genuinely more detail. Cost: ~800ms per step against a 60fps requirement | |
| No zoom, axis controls only | Cost: PERF-09 names pan and zoom, so this needs a requirement change | |

### Viewport in the permalink

| Option | Description | Selected |
|--------|-------------|----------|
| No, viewport is not sweep state | Links stay short and stable; recipients land on the whole picture | ✓ |
| Yes, include it | Reproduces the sender's crop. Cost: a recipient may not realise there is more field | |

---

## Claude's Discretion

Recorded in CONTEXT.md under "Claude's Discretion". Summarised:

- Coarse-pass stride and cell count, subject to PERF-04's 100ms and painting a complete field
- Chunk size, chunks-per-worker and the cancellation mechanism in the production pool
- Production module layout under `src/`, subject to the graduation decision
- Per-cell metrics record layout and its transfer encoding
- The horizon threshold value behind VIZ-09's boundary, provided the label states it
- The sequential ramp's stops, subject to VIZ-07 and the measured perceptual-step assertion
- The visual distinction between ghost and committed crosshairs
- Legend adaptation for sequential-scale metrics
- Whether the sweep pool is shared with or separate from the single-run execution path

## Deferred Ideas

- Colouring the heatmap by attribution rather than outcome
- Labelling all ten BAND_MULTIPLES boundaries in contour-map convention
- Keyboard nudge of the crosshair
- Zoom that re-sweeps a narrowed range at full resolution
- A fit-to-data colour domain as a user control
- The full 1x-20x leverage range in the sweep
- Both sweep modes rendered side by side
