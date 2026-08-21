# Phase 6: Heatmap Design Pass - Context

**Gathered:** 2026-08-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 5 shipped a single defensible run whose assumptions a skeptic can inspect. Phase 6 does
not ship anything to users. It is a design pass: build four throwaway full-scale mockups of the
entry-date x leverage grid, judge them against each other on real swept data, choose one, and
write down why the other three lost. Phase 7 implements the winner.

**In scope:** four competing mockup forms rendering a real 10,000-cell field; the sweep fixture
they share; the value-to-colour mapping (scale type, non-linear transform, palette, categorical
cells) as an implementable contract; the legend; the VIZ-10 overlapping-windows copy proven at
real width; the criterion-4 repaint measurement per form; the CVD legibility check as an
automated assertion; and the two artifacts that bind Phase 7 (`06-HEATMAP-SPEC.md` and a
PROJECT.md Key Decision).

**Out of scope (each named so it is not accidentally absorbed):** the sweep engine, the worker
pool, progressive paint, cancellation, pan/zoom and the metric toggle (all Phase 7, VIZ-01 through
VIZ-04, VIZ-06, VIZ-09, METR-06, PERF-03 through PERF-06, PERF-09); PNG export, CSV export and
preset scenarios (Phase 8); any change to the shipped app's UI. Nothing in `src/app/` is modified
by this phase except the two modules D-16 graduates.

**Explicitly not a scope question:** Phase 1 already settled hand-rolled Canvas 2D over a charting
library, and Phase 4's D-21 already settled that the heatmap fills the existing result-column slot
rather than getting its own screen. Phase 6 chooses the treatment inside that slot.

</domain>

<decisions>
## Implementation Decisions

### What the Mockups Vary (criterion 1)

- **D-01:** **The mockups vary plot form, not palette.** Each is a structurally different way to
  render the same field, because criterion 1's premise is that no surveyed tool pairs these axes,
  and a form is what has no prior art. A palette is cheap to change after the fact; a form is not.
  Rejected: locking the dense grid up front and varying colour/cell-size/annotation across the
  mockups, which is faster but assumes the grid form rather than arguing it. Also rejected:
  two rounds (forms, then treatments on the winner), which is the most defensible sequence and
  roughly doubles the phase.

- **D-02:** **Four forms compete, not three:**
  1. **Dense cell grid** — one cell per (entry-date, leverage) pair. What VIZ-03 literally says
     and what the Phase 1 canvas benchmark measured.
  2. **Filled iso-contour bands** — the literal pork-chop plot PROJECT.md's Context section names
     as the owner's intuition. Reads the breakeven boundary as a shape rather than a colour step.
  3. **Small multiples** — N stacked leverage strips, each a 1D entry-date band.
  4. **Grid with contour overlay** — dense cells carrying magnitude, iso-lines drawn on top
     marking breakeven and the ruin boundary. Tests whether the contour is better as an
     annotation than as the primary mark.
  The fourth was added deliberately: forms 1 and 2 are the two pure positions and 4 is the
  hybrid, so rejecting 4 requires an actual reason rather than an untested assumption. The three
  losing forms must be built well enough to lose fairly.

- **D-03:** **All four render from a real precomputed sweep, not synthetic values.** The Phase 3
  kernel runs offline over the full 200x50 grid and the result is committed as a fixture. The
  1929-adjacent ruin corner, the breakeven boundary and the 2010s bright band are then real
  features. This is load-bearing for form 2 and form 4 specifically: a contour plot lives or dies
  on whether the boundary it draws is real, and a contour over noise proves nothing. Rejected:
  reusing `bench/canvas-grid.ts`'s seeded log-uniform values, which is free and deterministic but
  has no structure, so the contour and small-multiples forms would be arguing against noise. Also
  rejected: a hand-shaped analytic field, where any conclusion is a conclusion about the field
  that was invented.

- **D-04:** **The design is argued on multiple-of-contributed, with max drawdown as a stress
  case.** Multiple-of-contributed has a real breakeven at 1.0x and spans orders of magnitude, so
  it exercises both the diverging-centre and the log-mapping requirements at once. The winning
  candidates are then re-rendered on max drawdown — bounded 0-100%, no breakeven, sequential — to
  prove the form does not collapse when the metric's semantics change. Rejected: one metric only,
  which keeps the four forms strictly comparable but risks a form quietly overfitted to one
  distribution, discovered in Phase 7 on the metric toggle. Also rejected: a working metric
  switcher across all metrics in every mockup, which is four times the build for a throwaway.

- **D-05:** **A side-by-side comparison page holds all four forms** on the same data, same axes,
  same theme. The judgement is a comparison rather than a recollection of the last tab, which is
  what makes criterion 1's "reasons for rejecting the others" writable from evidence. Rejected:
  four independent standalone pages.

- **D-06:** **Every mockup renders in both light and dark** from the CSS custom properties Phase 4's
  D-19 established. VIZ-11 requires it, canvas gets no free `prefers-color-scheme` styling, and a
  scale that only works on one background is a form-level failure that is cheap to find now and
  expensive to find in Phase 7. Rejected: light-only with dark deferred, which is exactly the
  rework this design pass exists to prevent.

- **D-07:** **The mockups are static plus a legend.** No hover, no tooltip, no click, no pan/zoom.
  They argue the static reading, which is what a screenshot is, and each carries a real legend
  because ruin's categorical entry and the non-linear scale cannot be judged without one.
  **This decides only what the mockups contain. It does not decide whether the shipped heatmap has
  a hover readout — that stays open for Phase 7** and must not be read out of this decision.

### Axis Domains and Resolution

- **D-08:** **Leverage runs 1x to 5x over 50 rows** (~0.08x steps, fine enough that the breakeven
  boundary is a smooth curve rather than a staircase). This is the range real products occupy
  (SSO 2x, QLD 2x, UPRO 3x, TQQQ 3x) plus headroom. Knowingly accepted: it excludes the absurd end
  where the argument is easiest to win. Rejected: 1x-10x, where most of the grid shows outcomes
  nobody would hold; and 1x-20x (the full range PROJECT.md's requirement names), where the 1x-3x
  band that actually matters compresses into the bottom fifth.

- **D-09:** **The entry axis spans the full strict-tier range for the fixture symbol, over 200
  columns.** Matches the Phase 1 bench geometry (200x50 = 10,000) so criterion 4's measurement
  stays comparable to the locked budget, and each column is a real entry date rather than an
  aggregate. Rejected: the extended-tier span reaching 1929, which makes the ruin corner real
  rather than theoretical but puts the interpolated-data caveat in direct competition with the
  VIZ-10 caveat for the same strip of copy. Also rejected: both spans as a toggle.

- **D-10:** **Fixed holding period, not hold-to-today.** All 10,000 cells are apples-to-apples and
  the form is judged on the field itself, with no right-edge artifact to design around.
  **Consequence, stated rather than discovered later:** VIZ-09's short-horizon strip gets no
  mockup, so Phase 7 designs that treatment without one — though D-13 gives it a closely related
  precedent. Rejected: hold-to-today, the harder mode; and both modes side by side, the strongest
  test at double the fixture and render cost.

- **D-11:** **The fixture is S&P 500 total return, 20-year holding period.** The longest strict-tier
  history in the bundle and the symbol the argument is actually about. 20 years is long enough
  that at 3x the outcome is dominated by drag and financing rather than by one crash, and short
  enough that the strict span still yields 200 distinct entry dates. Chosen to be neutral rather
  than to flatter either side. Rejected: 10 years (more entry dates, but single crashes dominate
  columns); Nasdaq-100 (more dramatic ruin corner, and the symbol a hostile reader would call the
  cherry-pick).

- **D-12:** **Each form picks its own display geometry.** Small multiples wants tall thin strips,
  the contour form wants a smooth field, the dense grid wants near-square cells; forcing one
  geometry handicaps some forms. **Consequence:** the four mockups stop being the same picture
  rendered differently, so comparability rests on the reading rather than on the pixels, and
  criterion 4's repaint measurement must be taken per form at that form's own geometry — each
  still rendering a real 10,000-cell field. Rejected: a shared ~8px cell geometry (1600x400,
  giving the D-14 hatch 4px of diagonal); and keeping the Phase 1 bench's 4px cells with a
  pixel-level dither standing in for the hatch.

### Colour Scale and the Non-Linear Map (VIZ-07, criterion 2)

- **D-13:** **Diverging, centred exactly at 1.0x.** Multiple-of-contributed has a real breakeven,
  and PITFALLS E1 is explicit that a sequential scale on a threshold metric hides where that
  boundary is. A diverging scale makes "did you get your money back" the first thing the eye
  finds, which is the question the tool exists to answer. Family must be blue-orange or
  purple-green — never red-green (PITFALLS E3), which also keeps the ruin red unambiguous.
  Rejected: sequential viridis/cividis, which never invents a midpoint but leaves the breakeven
  line invisible unless drawn as a contour — quietly biasing the comparison toward form 4. Also
  rejected: scale type following the metric, which is correct per E1 and is the natural extension
  once D-04's max-drawdown stress case runs.

- **D-14:** **Symmetric log about 1.0x.** Map `log10(multiple)` and centre the diverging scale at
  `log10(1.0) = 0`, so a 10x gain and a 0.1x loss sit equidistant from the neutral colour. That is
  the honest symmetry for a compounding metric: halving and doubling are the same magnitude of
  event. Handles the orders-of-magnitude span VIZ-07 names and degrades gracefully toward zero.
  Rejected: quantile/rank colouring, which maximises discriminability but breaks "equal colour step
  = equal value step", makes the legend unreadable as a value scale, and is attackable as a
  distortion. Also rejected: piecewise log-above/linear-below, which gives the loss side more
  resolution at the cost of an asymmetry that has to be defended.
  — **Reversibility:** costly — the colour a given multiple maps to is what users screenshot and
  paste. Changing the transform later changes every previously published image, and
  `06-HEATMAP-SPEC.md` will have stated the mapping.

- **D-15:** **One background-neutral palette for both themes.** The diverging ramp's midpoint is a
  mid-luminance neutral rather than white, so it reads on both the `#F5F6F7` light and `#14161A`
  dark surfaces without swapping. One legend, one CVD check, and the same cell is the same colour
  in two people's screenshots — which matters when the deliverable is a pasted image. Rejected:
  two theme-tuned palettes (better per-theme contrast, but the same cell differs between
  screenshots); and testing a white-centred variant on the winner.

- **D-16:** **Fixed colour domain, stated on the legend.** A committed range (clipped beyond) that
  does not move when parameters change, so two screenshots taken with different parameters are
  directly comparable. Knowingly accepted: a sweep whose values sit in a narrow band uses only
  part of the ramp and looks washed out. Rejected: fitting the domain per sweep, where the same
  colour means different numbers in two screenshots — an accidental way to mislead — and where
  Phase 7's 16ms metric re-colour would have to rescale as well as recolour. Also rejected: fixed
  by default with a visible fit-to-data control, which is honest but adds a control and a
  permalink param, both Phase 7 scope.

- **D-17:** **The colourblind check is an automated test. No images enter the repo.** The test
  samples the palette across its range, pushes each colour through the protanopia, deuteranopia
  and tritanopia transforms, and asserts adjacent bands stay perceptually separable. ~50 lines, no
  dependency. It runs in CI forever, so a Phase 7 palette edit that breaks deuteranopia legibility
  fails the build — which a saved image cannot do. **Explicitly rejected on the user's direction:
  committing PNG renders of the simulations (~300-600KB, go stale the moment the palette changes,
  nothing enforces re-rendering) and committing both.** No PNG archive of the mockups is kept for
  design-history reasons either. Criterion 2's "checked against a simulation" is satisfied by the
  live check plus the written finding, not by a binary artifact.

### Categorical Cells (PITFALLS E4)

- **D-18:** **Ruined cells render as a hatched fill in the destructive colour**
  (`#C4341F` light / `#E2604B` dark), with their own legend entry. This resolves a real conflict:
  `04-UI-SPEC.md` pre-committed heatmap ruin cells to the destructive red, while PITFALLS E4
  recommends black or hatched. The hatch takes both — colour continuity is preserved (ruin is the
  same red as the ruin banner and the equity-curve terminator, so one concept has one colour
  across the app) while the texture makes it categorically not a colour step, which is E4's actual
  concern. Texture is not a colour channel, so it survives D-17's CVD check independently of the
  palette. Rejected: flat black (reads as a hole on a dark background) or flat destructive red
  (risks reading as "the extreme end" to anyone who skips the legend — E4's exact failure). Also
  rejected: rendering ruin three ways across the four forms and letting the form comparison decide
  it, which risks the ruin treatment being chosen by whichever form happened to win.

- **D-19:** **The truncated right edge is shown, de-emphasised, not cropped.** A fixed 20-year hold
  means the newest usable entry date is roughly 2006, so the grid ends two decades before the data
  does. The axis extends to the present with the incomplete-hold columns rendered as a distinct
  state and excluded from the colour scale. Chosen over simply ending the axis because it gives
  this design pass a second categorical case to solve, and Phase 7 then inherits a solved pattern
  for VIZ-09's hold-to-today short-horizon strip rather than inventing one — which partly offsets
  D-10's consequence. Rejected: ending the axis at the last valid entry date with a stated end
  date and a line of copy (simpler, and the truncation becomes a stated methodology fact); and
  leaving the labelling entirely to Phase 7.

- **D-20:** **Ruin is hatched red; incomplete-hold is flat muted grey carrying no value.** Texture
  is reserved for ruin alone, so the hatch means exactly one thing. Incomplete cells get an
  out-of-scale neutral with no colour and no metric, because they are not a bad outcome, they are
  an unfinished one, and giving them a colour invites reading a partial hold as a real result.
  Two detached legend entries, unambiguous. Rejected: incomplete rendered as its partial value at
  reduced opacity — closer to VIZ-09's "de-emphasise" wording, but a faded real colour is still a
  colour, and PITFALLS E5 is precisely about a viewer misreading a short-horizon region as
  comparable data. Also rejected: both states hatched at different angles or densities, which
  makes ruin — the most consequential state in the tool — share a visual language with a mere
  data-coverage limit.

### The Overlapping-Windows Caveat (VIZ-10, criterion 3)

- **D-21:** **A permanent line of body-size copy directly under the grid, above the legend, inside
  Phase 4's D-20 screenshot region.** A pasted screenshot then carries the caveat with it, which is
  the whole point given the tool is used by pasting images into arguments. Consistent with how
  Phase 5's D-20 handled the extended-tier warning. Rejected: drawing it into the canvas bitmap,
  which cannot be cropped away but does not reflow, does not honour the browser's font settings,
  and is invisible to screen readers. Also rejected: folding it into the x-axis title, which is
  elegant — it would make the caveat structural rather than appended — but an axis title has no
  room for the full statement PITFALLS D5 asks for.

- **D-22:** **The copy reframes first, then names the mechanism.** Two sentences, approximately:
  *"The same market history, viewed from every possible starting point. Adjacent columns share
  nearly all their data, so this is a sensitivity analysis over one past, not 10,000 independent
  trials."* Sentence one tells the reader what they are looking at; sentence two pre-empts the
  statistical objection before a hostile reader raises it. This is PITFALLS D5's own recommended
  framing. Rejected: the mechanism alone (shorter, fits one line, but reads as a disclaimer bolted
  onto a chart); and the reframe alone (most accurate description of the visual, but it never names
  overlap, so it does not actually pre-empt the objection VIZ-10 exists for). Exact wording is
  Claude's discretion within this structure.

- **D-23:** **Every mockup renders the real copy at its own real width.** No lorem, no placeholder.
  A form that only works by pushing the caveat off-screen or shrinking it loses on criterion 3's
  own terms, which makes criterion 3 judgeable rather than asserted. Rejected: rendering the copy
  on the winner only, where the form is chosen partly on how much room its layout leaves the grid
  and the caveat is then squeezed into what remains.

### Legend

- **D-24:** **A continuous ramp with non-uniform tick spacing.** Ticks at 0.1x, 0.5x, 1x, 2x, 10x,
  spaced where the D-14 symlog mapping actually puts them, so the visual gaps between ticks show
  the reader the scale is non-linear without a word of explanation. Breakeven at 1.0x gets an
  emphasised tick, since it is the boundary the diverging centre encodes. Rejected: a discrete
  banded legend, which reads most precisely and maps one-to-one onto a banded contour rendering,
  but either quantises the grid too or stops describing what is drawn — and hides the
  non-linearity rather than showing it. Also rejected: the ramp plus a written scale note, which
  is most explicit but puts a second line of copy in competition with D-21 for the same space.

- **D-25:** **The two categorical entries are detached swatches, visually off the ramp** — hatched
  red "Ruined: position reached zero" and flat grey "Holding period incomplete", set apart from
  the colour bar by a clear gap. The separation is the point: E4's failure mode is ruin reading as
  the extreme end of the scale, and a swatch touching the ramp's end *is* that. Rejected:
  appending them to the ends of the bar, compact and continuous but implying ordinality where
  there is none. Also rejected: a swatch for ruin only, with the grey region explained by copy —
  less legend furniture, but a reader who skips the copy has an unexplained grey block.

### How the Choice Binds Phase 7

- **D-26:** **Two artifacts: `06-HEATMAP-SPEC.md` plus a PROJECT.md Key Decision.** The spec
  carries the full implementable treatment (chosen form, palette stops, symlog domain, categorical
  cell rendering, legend structure, caveat copy and placement, per-form geometry) as the contract
  Phase 7 is planned and verified against. The Key Decision carries the one-paragraph "this form
  won, these three lost, here is why", so the reasoning survives in the project record alongside
  the two Phase 1 architecture decisions. Each artifact does the job it is good at. Rejected: a
  `06-UI-SPEC.md` alone, which would get the six-dimension checker sign-off for free (`ui_phase` is
  on) but whose template is built for design-system tokens and component inventories, with no
  natural home for the rejection reasoning. Also rejected: a Key Decision alone, where Phase 7
  would have to re-derive palette stops and hatch geometry from a paragraph.
  — **Reversibility:** costly — `06-HEATMAP-SPEC.md` is what Phase 7's plan-checker and verifier
  test against, so changing the treatment after Phase 7 starts invalidates its verification.

- **D-27:** **Two modules graduate from throwaway into `src/`; everything else stays throwaway.**
  (a) The pure value-to-colour function — symlog transform, diverging stops, and the two
  categorical branches (D-18, D-20) — taking a metric value plus ruin/incomplete flags and
  returning RGBA. (b) The committed sweep fixture. Both are things Phase 7 would otherwise
  re-derive from prose, and a re-derived colour mapping is exactly how a spec silently drifts from
  what shipped. `bench/canvas-grid.ts:mapValueToRgba` is the Phase 1 precursor of (a) and should be
  read before writing it, not extended in place — the bench copy stays where it is. Rejected:
  strictly nothing graduating, which is the cleanest reading of "throwaway" and forces the spec to
  be implementable, at the cost of drift risk. Also rejected: the winning mockup's full render path
  becoming Phase 7's starting point, which would mean building all four mockups to production
  standards and undermining the point of a cheap design pass.

- **D-28:** **All four mockup HTML files are kept, committed, sharing the live colour function.**
  Under `.planning/phases/06-heatmap-design-pass/mockups/`. Plain text (~60-120KB total), diffs
  like source, outside `src/` and outside the Vite build, so no build or deploy cost. Because they
  import the D-27 colour function from `src/` rather than inlining a copy, a later palette change
  re-renders all four and the losing forms stay judgeable against current reality. Rejected:
  deleting the losers and recovering from git history, which was raised and rejected on the
  grounds that recovery would mean checking out the phase-6 commit and repairing imports against a
  module that has since moved — archaeology rather than opening a file. Also rejected: keeping them
  pinned to frozen copies of the colour function, faithful to decision day but stale afterwards.

- **D-29:** **The sweep fixture is committed as binary** (~90KB, Float32 plus flag bytes). One
  file, and every mockup opens straight from disk with no build step. It is binary and does not
  diff, but it is written once and regenerated only if the kernel or the fixture parameters change,
  so it will not accumulate superseded copies. Rejected: generating it from a committed script into
  a gitignored path — nothing binary in the repo at all, but opening a mockup would require running
  the script first, and the field everyone judged against would be reproducible rather than pinned,
  so a kernel change would silently move the ground under the design record. Also rejected: JSON
  (~250KB for readability a 10,000-element float array does not actually deliver in a diff).

### Claude's Discretion

- The exact diverging palette family and its stops, subject to D-13 (blue-orange or purple-green,
  never red-green), D-15 (background-neutral midpoint) and D-17's assertion passing.
- The exact fixed colour domain endpoints for D-16, and the clipping treatment beyond them.
- The exact wording of D-22's two sentences, within the reframe-then-mechanism structure.
- The hatch geometry for D-18 (angle, spacing, stroke width) at each form's chosen cell size, and
  whether it is drawn per-cell or as a clipped full-region pattern.
- The perceptual-distance metric and threshold D-17's assertion uses.
- Which of the two Phase 1 canvas paths (`putImageData` versus `fillRect`) each form uses, and how
  criterion 4's per-form measurement is wired — reusing the `bench/` harness or measured in-page —
  provided each figure is real-hardware and reported with a machine and core count.
- File layout inside `.planning/phases/06-heatmap-design-pass/mockups/`, and how the four forms
  and the D-05 comparison page share the fixture loader and the theme switch.
- Whether the offline sweep script that produces the D-29 fixture lives in `tools/` or `scripts/`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The visualization pitfalls this phase exists to answer
- `.planning/research/PITFALLS.md` §E1 — sequential versus diverging scale matched to metric
  semantics. Feeds D-13.
- `.planning/research/PITFALLS.md` §E2 — linear colour on an exponentially-distributed metric.
  Feeds D-14.
- `.planning/research/PITFALLS.md` §E3 — perceptually uniform and colourblind-safe families, and
  the explicit rejection of red-green diverging scales. Feeds D-13, D-15, D-17.
- `.planning/research/PITFALLS.md` §E4 — ruin as a categorical, absorbing state, never the darkest
  end of a continuous scale, and the fact that a log colour mapping cannot represent zero at all.
  Feeds D-18, D-20, D-25. **This is the section D-18 resolves against `04-UI-SPEC.md`.**
- `.planning/research/PITFALLS.md` §E5 — the short-horizon edge artifact. Feeds D-19, D-20; the
  VIZ-09 requirement it belongs to is Phase 7.
- `.planning/research/PITFALLS.md` §D5 — overlapping rolling windows presented as independent
  evidence, including the recommended reframing wording. Feeds D-21, D-22, D-23.
- `.planning/research/PITFALLS.md` §F5 — why 10,000 SVG nodes is not an option. Constrains every
  form to canvas.
- `.planning/research/PITFALLS.md` §A7 — the kernel-level ruin boundary the D-18 flag comes from.

### Design decisions this phase must extend, not restate
- `.planning/phases/04-first-defensible-backtest-in-the-browser/04-UI-SPEC.md` — the full design
  contract: spacing scale, typography roles, both colour palettes, theme mechanics, component
  inventory. Note §Color's line that the destructive colour "is what Phase 7 must reuse for
  heatmap ruin cells" — D-18 keeps the colour and adds the hatch.
- `.planning/phases/04-first-defensible-backtest-in-the-browser/04-CONTEXT.md` — D-17 (controls
  left, result right), D-18 (instrument-panel voice, chart is the only saturated element), D-19
  (theme mechanics and canvas repaint), D-20 (the screenshot region, feeding D-21), D-21 (the
  result column is a slot the heatmap fills).
- `.planning/phases/05-attribution-and-the-credibility-surface/05-CONTEXT.md` — the `<specifics>`
  section's two standing principles: the credibility surface is adversarial by design, and the
  screenshot is the deliverable. Both bind D-21 and D-22.

### Measurement and budgets
- `perf-budgets.ts` — PERF-05 is the 16ms row criterion 4 names. It was measured at 0.37ms on the
  D-17 baseline, so 16ms is a floor rather than a squeeze for a canvas form; a form that misses it
  has an architectural problem, not a tuning problem.
- `bench/canvas-grid.ts` — the Phase 1 grid fixture. `GRID_COLS`/`GRID_ROWS`/`CELL_SIZE_PX`,
  `makeGridValues` and `mapValueToRgba`. **D-27's graduated colour function is the real version of
  `mapValueToRgba`; read it, do not extend it in place.**
- `bench/canvas-repaint.bench.test.ts` — how a canvas repaint is measured and gated, and the
  paint-equivalence proof pattern that preceded trusting either arm's timing.
- `.planning/phases/01-performance-spike-and-budget-lock/01-SPIKE-RESULTS.md` §2 — both canvas
  arms' figures and the equivalence proof.
- `.planning/PROJECT.md` §Key Decisions — the PERF-03 D-20 escalation. PERF-03 sits at 80.8% of its
  1000ms budget on the D-17 baseline, and D-20 explicitly named "a coarser default grid" as one of
  three remaining levers, belonging to Phase 6. D-08/D-09 keep the grid at 200x50, which spends
  none of that lever; the planner should record that the lever is still unspent rather than let it
  be silently assumed used.
- `.planning/WINDOWS.md` entry 2 — normalized residual is 6.36% over 13 runs, so a single CI run
  supports a headroom claim only to roughly +/-13%.

### The fixture's inputs
- `src/kernel/backtest.ts` and `src/kernel/backtest.types.ts` — the recurrence the D-29 fixture is
  generated from. `financingSpread` and `expenseRatio` are annualized FRACTIONS, never percentages.
- `src/data/bundle-source.ts` — `LoadedBundle`, how series bytes and the manifest reach compute.
- `src/data/kernel-inputs.ts` — `buildKernelInputs`, the one loader core. The offline sweep script
  should build its inputs through this rather than reimplementing the byte path.
- `tools/bundle-compiler/src/seams.ts` — `degradesToNonDaily` and `computeTierRanges`. D-09's
  "full strict-tier span" is defined by this, not by a hand-picked date.

### Requirements
- `.planning/REQUIREMENTS.md` — VIZ-05, VIZ-07, VIZ-10 (this phase). VIZ-03, VIZ-06, VIZ-09 are
  Phase 7 but are what this phase's chosen treatment must be implementable against.
- `.planning/ROADMAP.md` §"Phase 6" — the four success criteria.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `bench/canvas-grid.ts` already contains the exact grid the criteria describe: `GRID_COLS = 200`,
  `GRID_ROWS = 50`, `CELL_COUNT = 10000`, a seeded PRNG, and a `mapValueToRgba` that already does
  log10-of-value normalization into a two-hue lerp. It is the Phase 1 precursor of D-27's
  graduated function and the closest existing analog to write from.
- `bench/canvas-repaint.bench.test.ts` is the measurement pattern for criterion 4, including the
  paint-equivalence assertion that ran before either timing was trusted — directly applicable to
  D-12's per-form geometries, where the four forms must be shown to be painting the same field
  before their timings are comparable.
- `src/app/components/ResultColumn/EquityCurveChart.tsx` is the existing example of a canvas
  surface reading CSS custom properties at render time and repainting on theme change (D-19),
  which every mockup needs for D-06.
- `src/app/components/ResultColumn/log-axis-splits.ts` exists because a series approaching zero
  already broke a renderer once. Relevant to D-14's behaviour near the ruin boundary.
- `src/app/theme.ts` holds the `prefers-color-scheme` plus manual-override mechanism the mockups'
  theme switch should reuse rather than reinvent.
- `src/metrics/format.ts` is the existing numeric formatting contract; D-24's legend tick labels
  should use it rather than adding a second formatter.

### Established Patterns
- The kernel imports nothing from the data, sweep or chart layers (SIM-10), asserted by a test.
  The D-29 offline sweep script must not create a second path into it.
- The kernel allocates nothing in its hot loop and writes into caller-preallocated buffers
  (SIM-11). The offline sweep should preallocate once and reuse across all 10,000 cells.
- Rate values in the bundle are `percent-annualized` and are divided by 100 exactly once, in the
  data layer.
- Every performance figure goes through `normalize()` and lands in `.bench/bench-results.json`
  with a verdict and a machine/core-count attribution. Criterion 4's per-form figures must follow
  this, not be hand-recorded.
- Hand-rolled Solid.js and CSS custom properties, no component registry, no web fonts, system font
  stacks only (`04-UI-SPEC.md` §Registry Safety). The mockups are plain HTML and should not
  introduce a dependency the app does not have.
- Vitest browser mode (Playwright-backed) runs anything the browser actually executes — the
  mechanism for both D-17's assertion and criterion 4's measurements.

### Integration Points
- `src/app/components/ResultColumn/` is where Phase 7's heatmap lands, in the D-21 slot beside
  `EquityCurveChart.tsx`. Phase 6 writes nothing here.
- D-27's graduated colour function needs a home in `src/` that neither the kernel nor the data
  layer imports — a sibling of `src/metrics/` rather than anything under `src/app/`, so both the
  mockups and Phase 7's renderer can import it without dragging in Solid.
- `src/data-bundle.generated.ts` is the existing compiler-emitted-module pattern; if the D-29
  fixture needs a typed accessor, it should follow that pattern rather than invent one.

</code_context>

<specifics>
## Specific Ideas

- **The pork chop plot is the owner's stated intuition, and it is on trial, not assumed.**
  PROJECT.md's Context section records that the owner's instinct wants "something like a pork chop
  plot". D-02 puts it in as form 2 and gives it the fair fight the roadmap's criterion 1 demands,
  rather than either adopting it unexamined or quietly dropping it in favour of the dense grid
  that VIZ-03 literally names. Form 4 exists so that "contour as annotation" is a distinct,
  testable position rather than a compromise nobody argued for.

- **No binary artifacts, stated as a standing constraint.** The user rejected committing CVD
  simulation PNGs and rejected keeping PNG renders of the mockups for design-history purposes, on
  explicit repo-bloat grounds. D-17 and D-28 encode this. The one binary exception is D-29's ~90KB
  fixture, argued on the separate grounds that it pins the field the design was judged against.
  Downstream agents should not reintroduce image artifacts to satisfy a criterion — the criteria
  are met by live checks plus written findings.

- **This phase inherits Phase 5's adversarial posture.** D-19 (showing the truncated region rather
  than cropping to where the data looks complete), D-20 (refusing to give incomplete cells a
  colour), D-22 (naming the overlap objection before a critic does) and D-16 (a fixed domain that
  sometimes makes the grid look washed out) all resolved the same way for the same reason: the
  version that hands the skeptic the criticism first is the one that survives contact with an
  argument. Preserve this rather than softening any of them.

- **A design pass whose output is a spec still has to be judged by eye.** D-05's comparison page is
  the deliverable that makes criterion 1's "reasons for rejecting the others" honest. Planning
  should treat the judging step as real work with a real artifact, not as a formality between
  building the mockups and writing the spec.

</specifics>

<deferred>
## Deferred Ideas

- **A written scorecard scoring each form against fixed criteria before choosing** (does the
  breakeven boundary read, does the ruin corner read, does it survive dark mode, does it survive a
  screenshot crop, does it repaint inside 16ms). Raised while deciding D-05 and set aside as extra
  process; the comparison page plus written rejection reasons was judged sufficient. If the four
  forms turn out to be close, this is the cheap way to make the choice defensible rather than
  aesthetic.

- **Judging each mockup as a cropped PNG at forum/chat width**, the actual delivery medium per
  Phase 5's "the screenshot is the deliverable". Raised under D-06 and not taken. Phase 8 owns PNG
  export (SHARE-04) and is the natural place for it.

- **A cell hover readout in the shipped heatmap** (entry date, leverage, metric value). D-07
  excluded it from the mockups only. **This is explicitly still an open Phase 7 decision and must
  not be read as declined** — the dense grid's small cells are below comfortable pointing
  precision, which is an argument for it.

- **Scale type following the metric** (diverging for threshold metrics, sequential for pure
  magnitude), per PITFALLS E1. Rejected as this phase's primary scale decision under D-13 because
  the design is argued on one metric, but it is the natural extension the moment D-04's
  max-drawdown stress case runs, and Phase 7's metric toggle will force the question.

- **Fit-to-data colour domain as a user control.** Raised under D-16 and set aside because it adds
  a control and a permalink parameter, both Phase 7 scope.

- **The full 1x-20x leverage range and the extended-tier entry span reaching 1929.** D-08 and D-09
  narrowed both for the design pass. Neither is declined for the shipped tool; PROJECT.md's
  requirement still names 1x through 20x+, and the 1929 window is the tool's most persuasive data
  point. Phase 7 decides the shipped ranges.

- **Both sweep modes rendered side by side.** Rejected under D-10 on cost. The two modes produce
  very different pictures per PROJECT.md, so if the chosen form struggles in hold-to-today during
  Phase 7, this is what was skipped.

</deferred>

<findings>
## Findings (not decisions — recorded for the researcher and planner)

- **F-01: D-10 leaves VIZ-09 without a mockup.** Fixed-holding mode has no right-edge short-horizon
  artifact, so Phase 7 designs VIZ-09's treatment without a mockup behind it. D-19's incomplete-hold
  state is a close precedent (an out-of-scale de-emphasised region at the recent edge, excluded
  from the colour scale) and Phase 7 should be pointed at it explicitly rather than starting from
  PITFALLS E5 alone.

- **F-02: D-12 weakens criterion 4's comparability, deliberately.** Per-form geometry means the
  four repaint figures are measured on four different canvases. Each must still render a real
  10,000-cell field, and the planner should require a paint-equivalence check (the
  `bench/canvas-repaint.bench.test.ts` pattern) proving the forms draw the same field before any
  timing comparison between them is trusted. Comparing the numbers to each other is not the
  criterion — clearing 16ms individually is — but the distinction should be stated so a plan does
  not accidentally rank forms by a figure that is not comparable.

- **F-03: the hatch is the least-specified part of D-18 and interacts with D-12.** A hatch needs
  physical room. At the Phase 1 bench geometry (4px cells) it is roughly 2px of diagonal, which is
  a dither, not a hatch. Because each form now picks its own geometry, each form independently has
  to solve hatch legibility at its own cell size, and a form whose natural geometry cannot carry
  the hatch has a real problem that should count against it in the judging. This was raised during
  discussion and the geometry question was resolved in favour of per-form freedom; the consequence
  for the hatch was not separately resolved.

- **F-04: PERF-03's "coarser default grid" lever is still unspent.** PROJECT.md's D-20 escalation
  named three levers for the 10,000-cell sweep's 80.8%-of-budget position, and explicitly assigned
  "a coarser default grid" to Phase 6. D-08 and D-09 keep the grid at 200x50, so the lever is
  untouched. This is not an oversight — a coarser grid is a Phase 7 sweep-cost decision, not a
  design-treatment decision — but the phase output should say so, or Phase 7 will inherit an
  escalation whose designated lever appears to have been used.

- **F-05: D-27's graduated colour function has no natural home yet.** It cannot live under
  `src/app/` (the mockups are plain HTML and must not import Solid), it is not kernel code, and it
  is not data-layer code. `src/metrics/` is the closest existing sibling but the function is not a
  metric. The planner should site it deliberately, since SIM-10's module-boundary test asserts what
  the kernel may import and a careless placement could trip it.

- **F-06: the offline sweep script is real work that reads as a detail.** D-03 and D-29 require
  running the Phase 3 kernel over 10,000 (entry-date, leverage) pairs against real bundle data,
  detecting ruin per cell, computing two metrics per cell, and serializing to a versioned binary.
  That is a small compiler, not a fixture generator, and it needs the same day-count and
  fraction-versus-percentage discipline the kernel tests enforce. Plan sizing should reflect it.

- **F-07: D-17's assertion needs a threshold nobody has picked.** "Adjacent bands stay perceptually
  separable" requires a perceptual distance metric (CIEDE2000 or a CAM02-UCS variant) and a
  numeric floor. Set it too low and the test passes on a palette a deuteranope cannot read; too
  high and no diverging palette passes. The researcher should find a defensible published figure
  rather than the planner inventing one, since this assertion is the entire evidence for criterion
  2 now that images are excluded.

</findings>

---

*Phase: 6-Heatmap Design Pass*
*Context gathered: 2026-08-21*
