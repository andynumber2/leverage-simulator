# Phase 6: Heatmap Design Pass - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-21
**Phase:** 6-heatmap-design-pass
**Areas discussed:** What the mockups vary, Axis domains and resolution, Colour scale and the
non-linear map, Categorical cells, How the choice binds Phase 7, Overlapping-windows copy, Legend

**Areas offered but not selected:** Mockup mechanics and measurement (largely settled anyway by
the answers under "How the choice binds Phase 7").

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| What the mockups vary | Different colour treatments of one grid, or genuinely different plot forms | ✓ |
| Axis domains and resolution | Leverage range/step, entry-date span, whether all mockups share axes | ✓ |
| Colour scale and the non-linear map | Sequential vs diverging, log vs symlog vs quantile | ✓ |
| Categorical cells (ruin, short horizon) | Ruin vs the pre-committed destructive red; VIZ-09 strip | ✓ |
| Overlapping-windows copy | Placement, wording, per-mode variation | (added later) |
| Mockup mechanics and measurement | Where the HTML lives, salvage, how 16ms is measured | |
| How the choice binds Phase 7 | What artifact records the winner and the rejection reasons | ✓ |

---

## What the Mockups Vary

### Axis of variation

| Option | Description | Selected |
|--------|-------------|----------|
| Different plot forms | Structurally different renderings: dense grid, iso-contour, small multiples. A palette is cheap to change later, a form is not | ✓ |
| One form, different treatments | Lock the dense grid, vary colour/cell size/gridlines/annotation | |
| Both: forms first, then treatments | Two rounds. Most defensible, roughly doubles the phase | |

**User's choice:** Different plot forms.

### Which forms compete

| Option | Description | Selected |
|--------|-------------|----------|
| Grid / contour / slices | Dense cell grid, filled iso-contour bands, small-multiples leverage strips | ✓ (amended) |
| Grid / contour / grid-with-contour overlay | Drops small multiples for the hybrid | |
| Add a fourth: 3D surface or bivariate | Four mockups including a rotatable surface or two-channel colour map | |

**User's choice:** Free text — "I want you to do number one, but add the grid with contour overlay
as a fourth."
**Notes:** Produces four competing forms rather than three. Captured as D-02. The effect is that
the two pure positions (cells versus contours) and the hybrid are all on trial, so rejecting the
hybrid requires an actual reason.

### Data behind the mockups

| Option | Description | Selected |
|--------|-------------|----------|
| Real precomputed sweep | Run the Phase 3 kernel offline over a real 200x50 sweep, commit as a fixture. Real ruin corner, real breakeven boundary | ✓ |
| Seeded synthetic (bench fixture) | Reuse `bench/canvas-grid.ts` log-uniform values. Free, deterministic, no structure | |
| Synthetic but structured | Hand-shaped analytic field with a plausible ruin corner | |

**User's choice:** Real precomputed sweep.

### Metric the design is argued on

| Option | Description | Selected |
|--------|-------------|----------|
| One primary + one stress case | Multiple-of-contributed primary; re-render winner candidates on max drawdown | ✓ |
| One metric only | Multiple-of-contributed everywhere | |
| All display metrics in every mockup | Working metric switcher per mockup | |

**User's choice:** One primary + one stress case.

### How the comparison is judged

| Option | Description | Selected |
|--------|-------------|----------|
| Side-by-side comparison page | All four forms on one page, same data, axes, theme | ✓ |
| Four independent pages | Standalone files, judged one at a time | |
| Side-by-side plus a written scorecard | Fixed criteria scored per form before choosing | |

**User's choice:** Side-by-side comparison page.
**Notes:** The scorecard was set aside as extra process; recorded as a deferred idea in case the
four forms turn out to be close.

### Theme coverage

| Option | Description | Selected |
|--------|-------------|----------|
| Both themes, in the mockups | Light and dark from the Phase 4 CSS custom properties | ✓ |
| Light only, dark deferred to Phase 7 | Halves palette work per mockup | |
| Both themes plus a screenshot-crop check | Adds judging each mockup as a cropped PNG at forum width | |

**User's choice:** Both themes, in the mockups.
**Notes:** The screenshot-crop check was deferred to Phase 8, which owns PNG export.

### Interaction in the mockups

| Option | Description | Selected |
|--------|-------------|----------|
| Static, plus a legend | No hover/tooltip/click. Legend required for ruin and the non-linear scale | ✓ |
| Add a cell hover readout | One shared hover behaviour across all four forms | |
| Full interaction: hover, pan, zoom | Prefigures Phase 7's 60fps requirement | |

**User's choice:** Free text — "this isn't a decision about whether we're going to have the cell
hover. It's just about what is going to be in the mock-up. If that's the case, we can skip it and
go with option one."
**Notes:** Correct reading, and an important scoping distinction. D-07 records that it constrains
the mockups only, and the deferred list explicitly marks the shipped hover readout as still open
for Phase 7 rather than declined.

---

## Axis Domains and Resolution

### Leverage range

| Option | Description | Selected |
|--------|-------------|----------|
| 1x to 5x | Range real products occupy plus headroom; ~0.08x steps over 50 rows | ✓ |
| 1x to 10x | Covers products and the ruinous zone; ~0.18x steps | |
| 1x to 20x | Full range PROJECT.md names; ~0.39x steps, compresses 1x-3x into the bottom fifth | |

**User's choice:** 1x to 5x.

### Entry-date span and column granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Full strict-tier span, 200 columns | Matches the Phase 1 bench geometry; every column a real entry date | ✓ |
| Full extended-tier span (reaches 1929) | Real ruin corner; interpolation caveat competes with the overlap caveat | |
| Both spans, as a mockup-level toggle | Tests whether the form survives a ~4x longer axis | |

**User's choice:** Full strict-tier span, 200 columns.

### Sweep mode

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed holding period | All cells apples-to-apples; no right-edge artifact to design around | ✓ |
| Hold-to-today | The mode with the E5 right-edge artifact; harder test | |
| Both modes, side by side | Strongest test, double the fixture and render path | |

**User's choice:** Fixed holding period.
**Notes:** Consequence recorded as F-01: VIZ-09's short-horizon strip gets no mockup, so Phase 7
designs it from D-19's incomplete-hold precedent rather than from scratch.

### Fixture symbol and holding period

| Option | Description | Selected |
|--------|-------------|----------|
| S&P 500 total return, 20 years | Longest strict history; long enough that drag dominates over any single crash | ✓ |
| S&P 500 total return, 10 years | More entry dates, but single crashes dominate columns | |
| Nasdaq-100, 20 years | More dramatic ruin corner; the symbol a hostile reader calls the cherry-pick | |

**User's choice:** S&P 500 total return, 20 years.

---

## Colour Scale and the Non-Linear Map

### Scale type

| Option | Description | Selected |
|--------|-------------|----------|
| Diverging, centred at 1.0x | PITFALLS E1: sequential on a threshold metric hides the breakeven boundary | ✓ |
| Sequential (viridis/cividis) | Never invents a midpoint, but breakeven needs a contour to be visible | |
| Scale type follows the metric | Diverging for threshold metrics, sequential for pure magnitude | |

**User's choice:** Diverging, centred at 1.0x.
**Notes:** "Scale type follows the metric" is deferred, not declined — it is the natural extension
once the max-drawdown stress case runs and Phase 7's metric toggle exists.

### Non-linear mapping

| Option | Description | Selected |
|--------|-------------|----------|
| Symmetric log about 1.0x | 10x gain and 0.1x loss equidistant from neutral; honest symmetry for compounding | ✓ |
| Quantile / rank-based | Maximum discriminability, but equal colour steps stop meaning equal value steps | |
| Piecewise: log above breakeven, linear below | More resolution on the loss side; an asymmetry that must be defended | |

**User's choice:** Symmetric log about 1.0x.

### Colourblind check

| Option | Description | Selected |
|--------|-------------|----------|
| Committed CVD-simulated renders | Run the canvas through deficiency matrices, commit the images as evidence | (initially selected, later reversed) |
| Automated contrast assertion in a test | Sample the palette, assert perceptual separability under each deficiency | ✓ (final) |
| Both: images plus the assertion | Live gate plus human-readable record | |

**User's choice:** Automated test, no images.
**Notes:** This reversed an earlier selection after clarification. The first framing said
"committed CVD-simulated renders" without stating that it meant PNG files in the repo, which the
user read as a decision about how the app displays the heatmap. Once clarified, the user rejected
image artifacts outright — for the CVD check and for design-history purposes both — on repo-bloat
grounds: *"Do not bloat my repo because of it... I thought this was about storing PNGs of the
entire mock-up for reasons of historical design reasons, which we don't need to do that shit
either."* Recorded as D-17 and as a standing constraint in `<specifics>`. Estimated sizes that
informed the reversal: 8 PNGs ~300-600KB for the winner alone, 32 PNGs ~1.3-2.5MB for all four
forms, and PNGs do not delta-compress, so each palette re-tune adds full copies to history.

### Palette across themes

| Option | Description | Selected |
|--------|-------------|----------|
| One palette, background-neutral | Mid-luminance midpoint reads on both surfaces; same cell, same colour in every screenshot | ✓ |
| Two palettes, swapped by theme | Better per-theme contrast; same cell differs between screenshots | |
| One palette, plus testing a white-centred ramp | Answers the midpoint question with evidence | |

**User's choice:** One palette, background-neutral.

### Colour domain

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed domain, stated on the legend | Screenshots stay comparable across parameter changes | ✓ |
| Fitted to each sweep | Full ramp always used; the same colour means different numbers in two screenshots | |
| Fixed by default, fitted as a visible option | Honest, adds a control and a permalink param (Phase 7 scope) | |

**User's choice:** Fixed domain, stated on the legend.

---

## Categorical Cells

### Ruin treatment

| Option | Description | Selected |
|--------|-------------|----------|
| Hatched fill in destructive red | Keeps 04-UI-SPEC colour continuity; texture answers PITFALLS E4 | ✓ |
| Flat black (or flat destructive red) | Simplest; black reads as a hole on dark, flat red risks reading as the extreme end | |
| Let the mockups decide it | Render ruin three ways and judge alongside the form choice | |

**User's choice:** Hatched fill in destructive red.
**Notes:** This resolved a genuine conflict surfaced during prep — `04-UI-SPEC.md` §Color
pre-committed heatmap ruin cells to the destructive red, while PITFALLS E4 recommends black or
hatched. The hatch satisfies both.

### Display geometry

| Option | Description | Selected |
|--------|-------------|----------|
| Larger cells, ~8px | 1600x400, gives the hatch 4px of diagonal, one putImageData pass | |
| Keep 4px, use a dither instead of a hatch | Matches the Phase 1 bench geometry exactly | |
| Let each form pick its own geometry | Small multiples wants strips, contour wants a smooth field | ✓ |

**User's choice:** Let each form pick its own geometry.
**Notes:** Consequences recorded as F-02 (the four repaint figures are no longer comparable to each
other, only individually against 16ms) and F-03 (each form independently has to solve hatch
legibility at its own cell size).

### Truncated right edge

| Option | Description | Selected |
|--------|-------------|----------|
| Axis just ends, with a stated end date | Simple and honest; truncation becomes a stated methodology fact | |
| Show the incomplete region, de-emphasised | Prefigures VIZ-09's treatment; Phase 7 inherits a solved pattern | ✓ |
| Not a mockup concern | Leave labelling to Phase 7 | |

**User's choice:** Show the incomplete region, de-emphasised.

### Distinguishing the two categorical states

| Option | Description | Selected |
|--------|-------------|----------|
| Ruin = hatched red; incomplete = flat muted grey, no value | Texture reserved for ruin alone; incomplete is unfinished, not bad | ✓ |
| Ruin = hatched red; incomplete = partial value at reduced opacity | Shows the trend continuing; a faded real colour is still a colour | |
| Both hatched, different angles or densities | One texture vocabulary; hard to tell apart at cell scale | |

**User's choice:** Ruin = hatched red; incomplete = flat muted grey, no value.

---

## How the Choice Binds Phase 7

### Recording artifact

| Option | Description | Selected |
|--------|-------------|----------|
| 06-HEATMAP-SPEC.md plus a PROJECT.md Key Decision | Spec carries the implementable contract; Key Decision carries the rejection reasoning | ✓ |
| A 06-UI-SPEC.md only | Gets the six-dimension checker for free; template has no home for rejection reasoning | |
| A PROJECT.md Key Decision only | Cheapest; Phase 7 would re-derive palette stops from a paragraph | |

**User's choice:** 06-HEATMAP-SPEC.md plus a PROJECT.md Key Decision.

### What crosses into Phase 7

| Option | Description | Selected |
|--------|-------------|----------|
| The colour-mapping module and the sweep fixture | Two modules graduate to src/; everything else deleted | ✓ (amended) |
| Nothing — strictly throwaway | Phase 7 builds from the spec alone, with drift risk | |
| The winning mockup's full render path | Fastest, zero drift, but the mockups were never actually throwaway | |

**User's choice:** Free text — option one, but objecting to deleting the three losing forms:
*"I dislike the idea of throwing away the three losing forms. That seems like a ton of ways to
work. I mean, it'll be in Git history, I guess. Is that acceptable means of recovery if some point
down the road I would want to change my mind or re-evaluate."*
**Notes:** Answered that git history is a weak recovery path here, because the losing mockups would
depend on a fixture and a colour function that have since moved into `src/`, so recovery means
repairing imports rather than opening a file. Led to the follow-up below.

### Terminology clarification

**User's question:** *"I don't understand what you mean by mapping module. I've never heard you use
that terminology before."*
**Notes:** Fair challenge — the term was introduced one question earlier and not defined. Clarified
as the function that turns one cell's number plus its ruin/incomplete flags into four RGBA bytes,
i.e. the four colour and categorical decisions expressed as code, with
`bench/canvas-grid.ts:mapValueToRgba` as the existing Phase 1 precursor.

### Where the mockups live

| Option | Description | Selected |
|--------|-------------|----------|
| All four kept, sharing the live colour function | ~60-120KB of text, outside src/ and the Vite build; losers stay judgeable | ✓ |
| Keep the winner, delete the three losers | Smallest live tree; rejection reasons are the only surviving record | |
| Delete all four | Strict throwaway; recovery means checking out the phase-6 commit | |

**User's choice:** All four kept.

### Sweep fixture storage

| Option | Description | Selected |
|--------|-------------|----------|
| Commit as binary | ~90KB Float32 + flags; no build step; written once, not re-generated | ✓ |
| Generate from a committed script | Nothing binary in the repo; the judged field becomes reproducible rather than pinned | |
| Commit as JSON | ~250KB, diffs as text, not meaningfully reviewable for a 10,000-float array | |

**User's choice:** Commit as binary.
**Notes:** The one binary exception to the no-binary-artifacts constraint, argued on the separate
grounds that it pins the field the design was judged against.

---

## Overlapping-Windows Copy

### Placement

| Option | Description | Selected |
|--------|-------------|----------|
| A line directly under the grid, inside the screenshot region | Travels with a pasted screenshot; matches how Phase 5 handled the tier warning | ✓ |
| Drawn into the canvas itself | Cannot be cropped away; does not reflow, invisible to screen readers | |
| As the x-axis title | Makes the caveat structural; no room for the full statement | |

**User's choice:** A line directly under the grid, inside the screenshot region.

### Wording

| Option | Description | Selected |
|--------|-------------|----------|
| Reframe first, then the mechanism | Two sentences: what you are looking at, then the overlap pre-emption. PITFALLS D5's own framing | ✓ |
| The mechanism only | Shorter, one line, reads as a bolted-on disclaimer | |
| Reframe only | Most accurate description, but never names overlap, so it does not pre-empt the objection | |

**User's choice:** Reframe first, then the mechanism.

### Proving the copy fits

| Option | Description | Selected |
|--------|-------------|----------|
| Every mockup renders the real copy at real width | A form that pushes the caveat off-screen loses on criterion 3's own terms | ✓ |
| Render it on the winner only | Less work; the caveat gets squeezed into whatever the winning layout left | |

**User's choice:** Every mockup renders the real copy at real width.

---

## Legend

### Scale representation

| Option | Description | Selected |
|--------|-------------|----------|
| Continuous ramp, non-uniform tick spacing | Visual gaps between ticks show the non-linearity without explanation | ✓ |
| Discrete banded legend | Reads most precisely; hides the non-linearity or quantises the grid | |
| Ramp plus a written scale note | Most explicit; competes with the caveat copy for the same space | |

**User's choice:** Continuous ramp, non-uniform tick spacing.

### Categorical entries

| Option | Description | Selected |
|--------|-------------|----------|
| Detached swatches, visually off the ramp | Separation is the point: adjacency to the ramp implies ordinality | ✓ |
| Appended to the ends of the ramp | Compact; the exact arrangement PITFALLS E4 warns about | |
| Ruin detached, incomplete only in the caveat copy | Less furniture; a reader who skips the copy sees an unexplained grey block | |

**User's choice:** Detached swatches, visually off the ramp.

---

## Claude's Discretion

Captured in CONTEXT.md `<decisions>` under "Claude's Discretion":

- The exact diverging palette family and stops, within the constraints of D-13, D-15 and D-17.
- The fixed colour domain endpoints and the clipping treatment beyond them.
- Exact wording of the two caveat sentences, within the reframe-then-mechanism structure.
- Hatch geometry (angle, spacing, stroke width) per form, and per-cell versus clipped-region drawing.
- The perceptual-distance metric and threshold for the CVD assertion.
- Which canvas path each form uses, and how the per-form 16ms measurement is wired.
- File layout under `mockups/`, and how the four forms plus the comparison page share the fixture
  loader and theme switch.
- Whether the offline sweep script lives in `tools/` or `scripts/`.

## Deferred Ideas

- A written scorecard against fixed criteria before choosing the winning form.
- Judging each mockup as a cropped PNG at forum/chat width (Phase 8 owns PNG export).
- A cell hover readout in the shipped heatmap — explicitly still open for Phase 7, not declined.
- Scale type following the metric (diverging for threshold, sequential for magnitude), per E1.
- Fit-to-data colour domain as a user control.
- The full 1x-20x leverage range and the extended-tier span reaching 1929, both narrowed for the
  design pass only.
- Both sweep modes rendered side by side.
