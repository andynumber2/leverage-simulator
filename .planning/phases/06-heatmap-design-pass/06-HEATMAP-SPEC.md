# Phase 6 Heatmap Spec

The implementable contract Phase 7 is planned and verified against (D-26). Every numeric value
below is copied from the code or from `.bench/bench-results.json` and names its source inline.
Nothing here is re-derived from prose.

## 1. The chosen form

**Winner: `form-2-filled-contour`** ("Filled contour", the pork-chop plot).

The full implementable record is this document plus the graduated modules it names below
(`src/colorscale/value-to-color.ts`, the committed sweep fixture, and the winning form's own
module), not this document alone.

## 2. Why the other three lost

Copied verbatim from `06-05-SUMMARY.md`'s "Decision: Task 2" section, the owner's own recorded
reasoning. Not softened, expanded, or re-argued here.

- **`form-1-dense-grid`:** No boundary mark at all. The reader has to infer breakeven from where
  blue meets orange rather than being given a line to trace.
- **`form-3-small-multiples`:** The 50 strip gaps break vertical continuity, so the breakeven
  boundary is not traceable as a shape at all. The eye has to reconstruct it across 50 independent
  strips.
- **`form-4-grid-with-contour`:** Gives the line but keeps the hard per-cell mosaic, so the field
  reads as discrete samples rather than as a continuous surface with shape.

No rejection reason cites implementation difficulty, build cost, maintenance effort, or a repaint
figure as a ranking between forms.

## 3. The value-to-colour mapping

`src/colorscale/value-to-color.ts` is the AUTHORITY for this mapping. Phase 7 imports
`valueToColor` (and `interpolateRamp`/`rampPositionFor` where a caller needs the ramp position
directly, as the legend and the contour annotation pass both do) rather than reimplementing any
part of it.

| Property | Value | Decision |
|---|---|---|
| Scale type | Diverging, midpoint at exactly `t = 0.5`, where `log10(1.0)` normalises | D-13 |
| Transform | Symmetric log about 1.0x: `log10(multiple)` | D-14 |
| Domain (fixed) | `DOMAIN_LOG_MIN = -2`, `DOMAIN_LOG_MAX = 2`: multiples `0.01x` to `100x`, clipped beyond, never fitted per sweep | D-16 |
| Interpolation space | Oklab, piecewise-linear between `RAMP_STOPS`, converted back to sRGB with per-channel clamping and rounding (`interpolateRamp`) | D-27a |
| Palette | One background-neutral palette shared by both themes, no theme-swapped variant | D-15 |

`RAMP_STOPS` (`src/colorscale/value-to-color.ts`), every entry:

| `t` | hex |
|---|---|
| 0.0 | `#08519C` |
| 0.25 | `#3182BD` |
| 0.5 | `#A9A29A` |
| 0.75 | `#E6550D` |
| 1.0 | `#A63603` |

The `t = 0.5` midpoint (`#A9A29A`) is a low-chroma warm neutral at roughly Oklab L 0.72, chosen to
read on both the light (`#F5F6F7`) and dark (`#14161A`) surfaces without a theme-swapped variant
(D-15). The `t = 0.25`/`t = 0.75` stops sit at Oklab L roughly 0.585/0.636, evening the perceptual
step across all four ramp segments (measured ratio ~1.33-1.46, against VIZ-07's 2.5 ceiling); see
`value-to-color.ts`'s own header comment for the full re-picking rationale. Family is blue-orange,
never red-green (D-13, PITFALLS E3).

## 4. Categorical cells

**Ruin (D-18).** `RUIN_BASE_RGBA = [0xc4, 0x34, 0x1f, 255]` (`#C4341F`, the same destructive colour
`04-UI-SPEC.md` §Color reserves for ruin across the whole app). Rendered as a hatched fill, never a
flat colour: 45-degree diagonal strokes at a 6-display-pixel period and a 2px stroke width
(`makeHatchPattern`, `mockups/shared/mockup-runtime.ts`), three half-overlapping segments per tile
so the diagonal stays visually continuous across tile boundaries. Drawn as a display-space
`CanvasPattern` clipped to the union of ruined cells' own rectangle (one `ctx.clip()` over every
ruined cell's `rect`, one `fillRect` over the whole field), not stroked per cell: this is what
keeps the hatch legible independent of cell size (F-03) and independent of the number of ruined
cells, since the cost is one clip-and-fill regardless of how many cells are flagged.

**Incomplete-hold (D-20).** `INCOMPLETE_RGBA = [0x6e, 0x73, 0x78, 255]` (`#6E7378`), a flat,
textureless, out-of-scale neutral carrying no value and no metric. Texture means exactly one thing
in this design and is reserved for ruin alone; incomplete-hold never gets a texture and never gets
a faded real colour, because a faded real colour is still a colour and invites reading a partial
hold as a real result (PITFALLS E5).

Branch order: `ruined` wins over `incomplete` when a single cell carries both flags
(`valueToColor`'s own checked order: ruin first, then incomplete, then the continuous path).

## 5. Legend

Continuous ramp with the five `LEGEND_TICK_MULTIPLES` (`src/colorscale/value-to-color.ts`,
`[0.1, 0.5, 1, 2, 10]`), placed at their TRUE symlog positions via `rampPositionFor`, never spaced
evenly. The `1.00x` tick (breakeven) is emphasised: heavier tick mark, `var(--color-text)` instead
of `var(--color-text-muted)`, `font-weight: 600` on the label. The two domain-end labels state the
fixed domain and its clipping directly: `"0.01x and below"` and `"100.00x and above"` (`10 **
DOMAIN_LOG_MIN`/`10 ** DOMAIN_LOG_MAX` through `formatMultiple`).

Two DETACHED categorical swatches, separated from the continuous ramp by a `var(--space-sm)` gap;
the gap itself is the detached signal (D-25), so ruin never reads as merely the extreme end of the
continuous scale:

- Hatched red swatch: `"Ruined: position reached zero"`
- Flat grey swatch: `"Holding period incomplete"`

Tick labels come from `src/metrics/format.ts`'s `formatMultiple` (two fixed decimals, trailing
lowercase `x`), so they render `0.10x`, `0.50x`, `1.00x`, `2.00x`, `10.00x`, not the bare integers
(`0.1x`, `1x`, `10x`) `06-UI-SPEC.md`'s Copywriting Contract table shows. Those bare-integer
examples were illustrative of which VALUES get ticks, not a second formatting spec; Phase 7 renders
through `formatMultiple` and does not add a second formatter to chase the bare-integer form.

## 6. The overlapping-windows caveat (VIZ-10)

The exact two sentences, from `VIZ10_CAVEAT_SENTENCES` (`mockups/shared/mockup-runtime.ts`):

> "The same market history, viewed from every possible starting point. Adjacent columns share nearly all their data, so this is a sensitivity analysis over one past, not 10,000 independent trials."

Placement: directly under the grid, above the legend, inside Phase 4's D-20 screenshot region
(D-21). Typography: the Body role, 14px, 1.5 line-height, `var(--color-text)` (`06-UI-SPEC.md`
Typography table). Never smaller or lower-contrast than the legend labels. Wraps to whatever height
it needs; never truncated.

## 7. Geometry

Per D-12, each form declared its own display geometry rather than sharing one; the four repaint
figures in §8 are each individually gated at 16ms, not ranked against each other (F-02): the four
canvases are not the same picture at different sizes.

**Form 2 (winner), `FORM_2_GEOMETRY` (`mockups/forms/form-2-filled-contour.ts`):**

| Field | Value |
|---|---|
| `cols` / `rows` | 200 / 50 (the fixture's own grid) |
| `cellSizePx` | 4 (declared per `MockupGeometry`'s own contract; the field itself is continuously resampled, not diced into per-cell rectangles) |
| `widthPx` / `heightPx` | 800 / 240 |
| Axis gutters | 36px left (leverage row labels), 16px bottom (entry-year column labels), reserved from the same 800x240 canvas, never added on top of it |
| Field paint rectangle | 764 x 224 px (`fieldRect`), the resolution `resampleField` actually resamples at: 171,136 display pixels, 17x the 200x50 = 10,000-cell fixture resolution |

The base pass calls `resampleField` (`mockups/shared/field-sampler.ts`) at the field rectangle's
own DISPLAY resolution and writes the result with one `putImageData`, no upscale/`drawImage` step
needed, because smooth curved bands cannot be produced by upscaling a 200x50 buffer. The annotation
pass strokes every `BAND_LEVELS` boundary via `marchingSquaresSegments`
(`mockups/shared/iso-lines.ts`), run over the field's ramp-position values (the same space the base
pass quantises in), breakeven emphasised at 2px `var(--color-text)`, other boundaries 1px
`var(--color-border)`.

**The other three forms, for the record:**

| Form | `cols`/`rows` | `widthPx`/`heightPx` | Notes |
|---|---|---|---|
| 1: dense grid | 200 / 50 | 800 / 200 | `cellSizePx` 4, one `fillRect`-equivalent `putImageData` at fixture resolution, upscaled via `drawImage`. Same 36px/16px axis gutters. |
| 3: small multiples | 200 / 50 | 800 / 400 | `cellWidthPx` 4 (nominal), `stripHeightPx` 6 (nominal), `stripGapPx` 2 (nominal): fifty strips, each painted via a reused 200x1 row buffer `drawImage`-stretched into its own rectangle; the real per-strip period is derived from the field rectangle at paint time, not the nominal constants. |
| 4: grid + contour overlay | 200 / 50 | 800 / 200 | Numerically identical to form 1 (deliberate, D-12): form 1's base layer reused verbatim, plus exactly two stroked iso-lines (breakeven and a ruin-adjacent boundary at `rampPositionFor(0.05)`), so the comparison against form 1 measures the annotation's own value, not a geometry difference. |

## 8. Measured figures

All four normalized repaint figures, from `.bench/bench-results.json`'s `infoLines` (this run's
own recorded environment block): `hardwareConcurrency=9`, `os=linux 7.1.4-200.fc44.aarch64`,
`deviceMemory=2`, `calibrationScore=0.5799999997019768`, `ci=false`. This is a dev sandbox run, not
the D-17 CI baseline.

| Form | `normalizedMs` | `rawMs` | batch size | Budget |
|---|---|---|---|---|
| 1: dense grid | 0.65 | 0.3765 | 200 | 16ms (PERF-05) |
| 2: filled contour (winner) | 14.12 | 8.19 | 50 | 16ms (PERF-05) |
| 3: small multiples | 0.69 | 0.4030 | 200 | 16ms (PERF-05) |
| 4: grid + contour overlay | 0.98 | 0.5700 | 200 | 16ms (PERF-05) |

All four passed individually when measured. The table records the figures AS JUDGED, so it is
left as the record the decision was made against. Form 2's row is since superseded twice: on the
authoritative ubuntu-latest CI baseline it first measured 23.92ms and FAILED the 16ms budget, and
an allocation fix then brought it to 12.80ms, which is the current figure. See Finding A.

Also superseded after this section was first written: the
comparison concluded, so the benches for the three losing forms were deleted and
`bench/heatmap-form-2.bench.test.ts` now records the run's one official PERF-05 `MeasurementRow`.
The headline PERF-05 figure in CI is therefore the winning form's cost, not a rejected form's.
Forms 1, 3 and 4's figures survive only in this table.

Form 2 costs roughly 20x form 1 at these geometries. See Finding A below for why this is not a
form-2-is-worse conclusion but an O(display area) cost the winner's own geometry creates, and the
obligation it puts on Phase 7.

## 9. What the fixture could and could not show

Six measured counts, read directly from the committed fixture's own meta block
(`.planning/phases/06-heatmap-design-pass/mockups/sweep-fixture.bin`, decoded via
`decodeSweepFixture`):

| Field | Value |
|---|---|
| `ruinedCount` | 0 |
| `incompleteCount` | 2600 |
| `minMultiple` | 0.0003807832285898313 |
| `maxMultiple` | 84.24315924361446 |
| `clippedBelowCount` | 135 |
| `clippedAboveCount` | 0 |

D-09 fixes the entry axis to SPX total return's strict tier, which the manifest records as
`1988-01-05` to `2026-08-14` (200 columns). D-08 caps leverage at 5x (50 rows, 1.00x to 5.00x).
The holding period is 10 years (`holdingYears: 10` in the fixture meta); see the D-11 override
note below for why this is 10 years and not the 20 years `06-CONTEXT.md` originally chose.

**`ruinedCount` is 0.** No daily return in the 1988-2026 SPX total-return window is severe enough
to drive a 5x position to zero (the worst single day in that window is well short of the roughly
-20% a 5x position needs). This is a fact about the window, not a defect in the fixture or the
kernel. Consequence: D-18's hatch was judged from the legend swatch alone, never from an in-field
region. See Finding C.

**`incompleteCount` is 2600**, exactly 26.0% of the 10,000 cells. Because the incomplete-hold state
depends only on the entry date (whether a full 10-year hold fits before the data's own end date),
not on leverage, this is also 52 of the 200 entry-date columns (26.0% of the axis): a fixed
10-year hold against a 38-year strict span makes the incomplete-hold region roughly a quarter of
the axis by construction, not an edge case a viewer might mistake for a rare state.

**`clippedBelowCount` is 135**, `clippedAboveCount` is 0. The 10-year fixture's `minMultiple`
(0.00038x) falls below `DOMAIN_LOG_MIN`'s 0.01x floor, so 135 cells clip to the domain's minimum
colour rather than each rendering a distinct shade; none did at the prior 20-year holding period.
`maxMultiple` (84.24x) stays inside the domain's 100x ceiling, so no cell clips above.

These are recorded as facts about what this design pass could judge, not as defects.

## 10. What Phase 7 inherits

Two carry-forwards recorded in `06-CONTEXT.md` during phase planning, plus three carry-forwards
recorded in `06-05-SUMMARY.md` after the winning form was judged, so none of them arrives as a
Phase 7 surprise.

### Finding F-04: PERF-03's "coarser default grid" lever is still unspent

`PROJECT.md`'s Key Decisions table records the PERF-03 D-20 escalation, which named "a coarser
default grid" as one of three remaining levers against PERF-03's 80.8%-of-budget position and
explicitly assigned that lever to Phase 6. D-08 and D-09 kept this phase's grid at 200x50 (the
fixture's own dimensions, §9), so the lever is UNSPENT and still fully available to Phase 7. Stated
outright here so Phase 7 does not inherit an escalation whose designated lever appears to have
already been used.

### Finding F-01: D-10's fixed holding period leaves VIZ-09 without a mockup

D-10 chose a fixed holding period for every mockup in this phase, so VIZ-09's hold-to-today
short-horizon strip has no mockup behind it. D-19's incomplete-hold treatment (an out-of-scale,
de-emphasised region at the recent edge, excluded from the colour scale, §4 above) is the solved
precedent Phase 7 should start from for VIZ-09, rather than starting from PITFALLS E5 alone.

### Finding A: form 2's cost is O(display area), not O(cells). This is a Phase 7 obligation.

Forms 1, 3 and 4 build their pixel buffer at FIXTURE resolution (200x50 = 10,000 px) and let the
GPU upscale via `drawImage`, so their cost is constant in panel size. Form 2 calls `resampleField`
at DISPLAY resolution (171,136 px at this document's own §7 geometry, 764x224, 17x the fixture's
10,000 cells) because smooth curved bands cannot be produced by upscaling a 200x50 buffer.
Measured **12.80ms** of the 16ms PERF-05 budget at that geometry on the authoritative
ubuntu-latest baseline. That figure is already the product of one round of optimisation and
replaces the 14.12ms this section originally carried: the first CI run measured 23.92ms and FAILED
the budget, because the sampler allocated roughly seven objects per display pixel (about 1.2M
allocations per repaint) and blended via a `Math.log10` per stencil corner per pixel (about
684,000 logarithms per repaint). Making the hot loop allocation-free and caching one ramp position
per fixture cell cut it to 12.80ms. Phase 7 should not read 12.80ms as a floor.

Because this cost scales linearly with panel area, a display field roughly 1200x400 (a plausible
shipped panel size) lands near 36ms, breaching both the 16ms PERF-05 budget and the 60fps pan/zoom
criterion.

**Mitigation, and its limit.** Resample once to an offscreen canvas per data/metric change rather
than per frame, then serve pan and zoom as `drawImage` transforms of that cached bitmap. This
matches the roadmap's own "re-colors the cached grid" language. But be clear about what it does
NOT solve: a metric change invalidates the cache by definition, so switching the displayed metric
at full panel size still forces a full resample and still breaches 16ms. The cache fixes pan and
zoom. It does not fix metric switching.

**The lead Phase 7 should chase first, before accepting any of the above.** The per-pixel resample
may be the wrong algorithm rather than an expensive one. A filled-contour renderer conventionally
builds band POLYGONS from its iso-line geometry and fills them, which is GPU work proportional to
cells, not JS work proportional to display pixels. Form 2 already computes marching-squares
segments at every band edge for its strokes (`mockups/shared/iso-lines.ts`) and then discards that
geometry, brute-forcing the fill per pixel instead. If the fill is rebuilt on those polygons, form
2's cost plausibly collapses to the same O(cells) class as the other three forms, and this entire
finding, the offscreen cache and the metric-switch constraint alike, may simply evaporate.

The supporting observation, from the owner during the Phase 6 review: form 2's output is visibly
CHUNKY (ten quantised bands), so per-pixel expense to produce large flat regions of uniform colour
is on its face suspicious. Sub-cell precision is only needed near band boundaries, which is
precisely what the iso-line geometry already locates.

Rank this above the mitigation. The mitigation is the fallback if the polygon rebuild does not pan
out; it is not the first thing to try.

### Finding B: the contour levels are not yet labelled

`BAND_LEVELS` (`mockups/shared/field-sampler.ts`) is defined in MULTIPLE space via
`BAND_MULTIPLES = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50]` (converted to ramp position through
`rampPositionFor`) precisely so the drawn boundaries ARE labellable round numbers a reader can
name on sight, but no form draws those labels. Whether and how to label them is an open Phase 7
decision the owner deferred. Ramp position `t` is an internal colour-lookup coordinate and must
never decide where a user-facing line goes, which is exactly why the earlier even-in-`t` levels
(approximately 2.51x, 6.31x, 15.8x) were replaced with `BAND_MULTIPLES`' round values.

### Finding C: the ruin hatch is still unexercised

`ruinedCount` is 0 in both the prior 20-year fixture and the current 10-year fixture (§9), a fact
about the SPX 1988-2026 window, not a defect. Success criterion 2 therefore rests entirely on the
incomplete-hold grey. The hatch is unit-tested (`tests/field-sampler.test.ts`, D-18's branch order
in `tests/value-to-color.test.ts`) but has never been visually judged in a field. Phase 7's own
roadmap criterion 2 calls for verification "on a 1929-entry high-leverage sweep where ruin genuinely
occurs." This phase could not supply that evidence.

### The fixture's holding period: a D-11 override

The fixture's holding period was changed from 20 years to 10 years at the owner's direction
(`1f40846`), between plan 06-05's Task 2 halt and its continuation. This OVERRIDES `06-CONTEXT.md`'s
D-11, which had explicitly chosen 20 years and named 10 years as the rejected alternative on the
grounds that single crashes dominate columns at 10 years.

**Owner's stated rationale:** the holding period will be a user-facing slider in the shipped app
(Phase 7, VIZ-04), so the fixture's period is a viewing choice for judging plot form during this
design pass, not a locked analytical commitment. This is not an unexplained reversal; it reflects
that the analytical question D-11 was answering (which period best argues the tool's thesis) is a
different question from the one the current fixture answers (which period best exercises plot form
during judging).

### The open hover question

A cell hover readout (entry date, leverage, metric value) was excluded from the MOCKUPS by D-07
only, and remains an open Phase 7 decision; it must not be read as declined. The argument in its
favour: the dense grid's individual cells are below comfortable pointing precision, which is a real
usability concern Phase 7 should weigh on its own terms, not one this phase resolved either way.

## 11. Out of scope for this document

Phase 7 still decides:

- The shipped leverage range and entry span (D-08 and D-09 narrowed both to 1x-5x, the strict-tier
  span, for this design pass only); PROJECT.md's own requirement still names 1x through 20x+, and
  the 1929 extended-tier window is the tool's most persuasive data point.
- The sweep mode toggle (fixed-horizon vs hold-to-today).
- The metric toggle (this document argues multiple-of-contributed, with max drawdown as a stress
  case per D-04; a working switcher across all metrics is Phase 7 scope).
- Ruin rendering under hold-to-today mode.
- Pan and zoom (Finding A above is the performance obligation Phase 7 must satisfy to build this).
- Progressive paint.
- Finding B's contour-level labelling.
- The open hover question above.
