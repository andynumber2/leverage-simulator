# Phase 8: Export and the Canonical Arguments - Context

**Gathered:** 2026-08-25
**Status:** Ready for planning

<domain>
## Phase Boundary

A result leaves the app in whatever form the argument needs. Three deliverables, none of which
exist today:

1. **PNG export (SHARE-04).** Capture the `.screenshot-region` Phase 4's D-20 built and deliberately
   left uncaptured, in both result modes.

2. **CSV export (SHARE-05).** A single run's daily series with enough columns that a skeptic can
   rebuild the recurrence in a spreadsheet and land on the same `finalValue`.

3. **Named preset scenarios (SHARE-06).** A library of canonical arguments, each a shareable
   permalink, with a featured subset one click from the landing state.

All three are measured against PERF-07a's 50ms main-thread budget (roadmap criterion 4).

**Not in this phase:** any change to the simulation kernel, the cost model, or the data bundle. Any
new metric, chart or heatmap treatment. In-tool preset authoring. Retaining older data bundles so
an old permalink reproduces rather than reports a change (still deferred, carried from Phase 4).

</domain>

<decisions>
## Implementation Decisions

### PNG export (SHARE-04)

- **D-01:** **The PNG captures the whole `.screenshot-region` DOM subtree**, not a canvas. Phase 4's
  D-20 built that region for exactly this and its own comment says "Phase 8's SHARE-04 captures this
  exact element". A canvas-only export would drop the provenance strip, the metrics panel, the
  attribution panel, the extended-tier warning and the bundle version, which is every receipt
  Phases 4 and 5 deliberately placed inside the frame under "the screenshot is the deliverable".
  Rejected: `canvas.toBlob()` on the chart canvas alone (cheap and inside budget, but the pasted
  image proves nothing); a hand-composed export canvas that redraws the metrics as canvas text
  (a second rendering of every metric to keep in sync, which is the specific thing D-20 rejected
  when it declined to build a separate share card).

  **Correction to a project-level document:** `.claude/CLAUDE.md`'s stack table states that
  "uPlot and the custom heatmap both render to `<canvas>`, so `canvas.toBlob('image/png')` is
  sufficient with zero dependency". That was written before the screenshot region existed and is
  now wrong for the artifact being captured. D-04 supersedes it.

- **D-02:** **Export in the theme currently on screen, with a forced opaque background and a visible
  margin or frame.** Roadmap criterion 1's "legible in both light and dark" is read as "a dark
  export and a light export are each legible", not "always emit one canonical theme". The opaque
  background and frame kill the failure mode where a dark image pasted onto a white forum floats
  with no edge. Rejected: always exporting light (breaks WYSIWYG, and a tool whose premise is that
  the picture is what happened should not hand you a picture you were not looking at); emitting
  both themes (a second control, a second capture path inside the 50ms budget, and a theme swap
  mid-capture means repainting both canvases first since they read CSS custom properties at render
  time per Phase 4 D-19).

- **D-03:** **Every export renders at one fixed CSS width, roughly 1100 to 1200px, at 2x pixel
  density, independent of the viewport that took it.** Two people exporting the same run get the
  same picture, which is the same argument Phase 7 D-26 made for fixed colour domains and Phase 6
  D-16 made for a fixed colour scale. Requires laying the region out at the export width before
  rasterizing, or a narrow-viewport user's stacked layout leaks into the image. Rejected: capturing
  at the current layout width (a phone export is a narrow stacked column and a wide-monitor export
  is a long thin strip, so the same run produces visibly different evidence and one of the two is
  not legible in a forum); clamping to a legible band (still non-deterministic between users, so it
  pays the re-layout cost without buying comparability).
  -- **Reversibility:** costly -- the export width is what people paste and compare; changing it
  later makes new exports non-comparable with every export already shared.

- **D-04:** **Add `html-to-image` as a runtime dependency.** The region is HTML plus canvas, so
  rasterizing it needs an SVG `foreignObject` pass: inline the computed styles and fonts,
  substitute each `<canvas>` with its own `toDataURL`, draw the SVG to an export canvas. That
  package does exactly this and has already survived the Safari `foreignObject` quirks;
  `.claude/CLAUDE.md`'s supporting-libraries table lists it as an option. Consequences stated so
  they are not discovered mid-plan: it is a fourth runtime dependency on a build that currently has
  three (comlink, solid-js, uplot); `tests/app/static-build.test.ts` bans it by name and must be
  deliberately inverted (see F-01); and it must clear the Phase 4 package-legitimacy gate. Rejected:
  hand-rolling the pass in-repo (consistent with this project's hand-rolled canvas heatmap and
  binary format, and with `.claude/CLAUDE.md`'s "native browser API preferred", but style and font
  inlining plus the `foreignObject` quirks are the whole job and buy nothing this phase needs);
  deferring the choice to research.
  -- **Reversibility:** reversible -- one dependency behind one export module; swapping it for a
  hand-rolled pass later touches no call site outside that module.

- **D-05:** **The PNG path is measured against PERF-07a and escalated under PERF-01a if it
  breaches, never relaxed.** `html-to-image` needs live DOM and computed styles, so unlike the CSV
  it cannot leave the main thread. This project has escalated-and-recorded rather than relaxed at
  every prior opportunity (PERF-03 most recently), and this budget gets the same treatment.
  Consequence stated: the plan cannot promise roadmap criterion 4 for the PNG path up front, only
  that the figure will be measured and recorded honestly.

### CSV export (SHARE-05)

- **D-06:** **The CSV carries every input the recurrence consumes plus its output: date, index
  return, short rate, calendar days elapsed, contribution flag and amount, long-gap flag, and
  portfolio value.** A skeptic writes the same three-term recurrence in a spreadsheet from these
  columns and reaches `finalValue`, which is roadmap criterion 2 exactly. Every one of these
  already exists caller-side in `KernelSeries` and `KernelOutputs`, so **the kernel is not
  touched** and the byte-identical hold on `src/kernel/backtest.ts` from the PERF-03 measurement
  work stands. Rejected: also emitting each bar's financing charge, expense charge and leveraged
  return (it would turn the recompute into an arithmetic check, but those numbers exist nowhere
  today, and producing them means either a CSV-only parallel implementation that can drift from
  the kernel or the per-bar output arrays quick-260824-46s measured at 1-2% and deliberately
  declined to spend); date and value only (smallest file, proves nothing, defeats SHARE-05).

- **D-07:** **A `#`-commented preamble sits above the header row**, carrying every permalink
  parameter, the bundle version, the active tier, the effective date range, the source names, and
  the permalink URL itself. Same reasoning as the screenshot region: the receipts travel with the
  artifact, because a CSV detached from the app carries nothing otherwise. Known cost, accepted:
  `#` lines are not standard CSV and Excel and Sheets import them as rows in column A rather than
  skipping them. Rejected: repeating constant columns on all 25,000 rows (survives every importer
  but is visually awful and inflates the file for data identical on every row); a clean CSV with
  the run in the filename (imports perfectly but filenames get renamed and truncated, and cannot
  carry source citations or the permalink).

- **D-08:** **CSV export is single-run only.** SHARE-05 says "a run's underlying daily series" and
  sweep mode has 10,000 runs and no single daily series. A sweep user clicks the cell they want and
  flips to Single run, which is Phase 7 D-22's existing drill-down, then exports there. No second
  export path, no new gesture. Rejected: also emitting the grid as one row per cell (nearly free
  since the grid is in memory, but no requirement asks for it and it is a second format to specify,
  test and budget -- captured as a deferred idea); exporting the crosshair cell's daily series
  (one path, but it silently exports a run whose receipts are not on screen, and needs defined
  behaviour before any cell is clicked).

- **D-09:** **The CSV is built in a Worker.** The app already runs a comlink worker pool, so
  PERF-07a holds structurally for this path rather than by tuning a chunk size across rAF or idle
  callbacks. The main thread receives a Blob and triggers the download. Rejected: chunked
  main-thread building (introduces a constant to tune, and this project's record is that every
  tuned constant it introduced later needed defending).

### The preset set (SHARE-06)

- **D-10:** **Roadmap criterion 3's "TQQQ from 2000" ships as a synthetic 3x Nasdaq-100 from the
  March 2000 peak, labelled as synthetic.** `TQQQ/total-return` starts 2010-02-11, so there is no
  TQQQ data for a 2000 entry; `NDX/total-return` starts 1999-03-04, so the dot-com peak is
  reachable. The label states it is a synthetic 3x NDX rather than the real fund, which is honest
  and is also the more damning framing, since the fund did not exist to take that loss. The roadmap
  wording is superseded by the data, recorded here rather than quietly substituted. Rejected: real
  TQQQ from its 2010 inception (uses real history, but it is the wrong argument -- it misses the
  dot-com drawdown entirely, which is precisely why criterion 3 lists it among the windows where
  leverage looks bad).

- **D-11:** **The high-rate financing preset is a 1979 to 1982 entry, in the extended tier, with the
  `ExtendedTierWarning` shown rather than avoided.** The short rate peaked near 20% in 1981; at 3x
  that is roughly 40%/yr of financing before the index does anything, which is the most vivid
  available demonstration of the mechanism this tool exists to name. `SPX/total-return`'s strict
  tier starts 1988-01-05, so this window is necessarily extended tier and carries the interpolated
  monthly-dividend caveat plus the CRED-02/CRED-03 bias figure. That cost is accepted under the
  same pattern as Phase 5's D-19: hand the skeptic the criticism rather than pick a window that
  avoids it. Rejected: a 2022-onward window (strict tier, no caveat, but the effect is far milder
  and a short window makes financing easy to dismiss as noise next to the 2022 drawdown itself).

- **D-12:** **Each preset declares its own result mode, carried in the existing `mode` permalink
  key.** Phase 7 D-04 already added `mode` to `src/app/permalink.ts`, so this costs nothing: a
  preset that argues better as one defensible answer opens Single run, and a preset whose point is
  "this is not cherry-picked" opens the sweep. Rejected: forcing all presets to one mode in either
  direction (uniformity buys predictability but either loses the receipts or pays roughly 800ms of
  sweep on every preset click against PERF-08's cold-load budget).

- **D-13:** **Each preset is labelled with its window and the outcome it demonstrates, with the
  unflattering cases ordered first.** The ordering is the argument: a reader sees the tool leading
  with its own worst results before being asked to. Rejected: explicit "where leverage fails" /
  "where leverage wins" headings (countable balance, but it states each preset's conclusion before
  the user has run it, which is the editorial voice Phase 4 D-18 rejected in favour of a measuring
  instrument); neutral chronological labels (maximally instrument-like, but the balance criterion 3
  demands would be present in the data and invisible in the list).

- **D-14:** **Eight or more presets ship as a library, presented as a featured row of four inline
  plus a "Scenarios" overlay holding the full set.** The overlay follows
  `src/app/components/MethodologyOverlay.tsx`'s existing pattern and scales to any number of
  presets at almost no layout cost; the featured row is what makes criterion 3's "one click from
  the landing state" literally true for the headline arguments. Rejected: an always-visible
  scenarios rail in the parameter column (one click from every state, but real vertical space in a
  column Phase 4 D-17 already packed); a landing-state-only panel (room to present the set
  properly, but it disappears after first interaction).

- **D-15:** **The featured four are: real TQQQ through COVID, real UPRO through COVID, real UPRO
  since inception, and 3x S&P 500 from the March 2000 peak.** The audience for this tool argues
  about whether UPRO and TQQQ are good investments and how safe they are, so two real-fund crash
  presets and one real-fund since-inception preset earn the one-click slots over historical
  windows. Balance in the featured row is three unflattering to one flattering. All four are strict
  tier (`TQQQ/total-return` from 2010-02-11, `UPRO/total-return` from 2009-06-25,
  `SPX/total-return` strict from 1988-01-05), so none carries an extended-tier warning.

  **Consequence, recorded deliberately rather than left for the verifier:** all four windows
  criterion 3 names by name (1929, TQQQ-from-2000, the high-rate regime, the 2010s) are now in the
  overlay, two clicks away. Criterion 3 still passes at the set level, since it requires the set to
  cover those windows, but nothing it names is one click any more. This is a decision about who
  actually uses the tool, not an oversight.

- **D-16:** **Any preset built on a real leveraged ETF must set leverage to exactly 1.0 AND expense
  ratio to exactly 0.** `src/kernel/backtest.ts:136` scales financing by `(leverage - 1)`, so
  financing zeroes itself at 1.0. But `backtest.ts:140`'s `expenseCost` is **not** leverage-scaled,
  so leaving the default expense ratio would charge TQQQ's or UPRO's own fee a second time on top
  of the fees already inside the fund's price. Silent, and it would make every real-fund preset
  understate the fund it claims to show. This constraint is load-bearing for D-15's three real-fund
  presets and must be asserted by a test, not left to the preset definitions being written
  correctly once.

- **D-17:** **One dollar-cost-averaging preset ships in the library.** DCA into leverage is the most
  common real-world version of this argument and the case where the answer genuinely differs, since
  contributions buy the crash. It also exercises IRR rather than CAGR (METR-01/METR-02) and the
  `solveIrr` path, which no lump-sum preset touches. Known cost, accepted: that path is roughly
  3.9x over its budget per STATE.md, so this preset makes the slow branch reachable from the
  overlay (see F-04). Rejected: lump-sum only (the tool never demonstrates its own contribution
  feature in the canonical arguments); pairing every flagship window with a DCA counterpart (the
  most useful comparison the tool could show, but it doubles the flagship set and every entry runs
  the over-budget branch).

- **D-18:** **Each preset's headline outcome figure is computed at BUILD time, not on page load.**
  `scripts/compute-presets.ts` runs every preset's backtest against the compiled bundle and emits
  `src/app/presets.generated.ts`; a pinning test recomputes and fails CI when the committed figures
  stop matching. This is the user's own proposal and it is strictly better than either live
  computation or hardcoded strings: zero cost on page load, and a figure cannot drift from the
  bundle or the cost model without CI going red. It copies an existing, working precedent in this
  repo exactly: `scripts/measure-extended-tier-bias.ts` emits
  `src/validation/extended-tier-bias.generated.ts`, pinned by
  `tests/validation/extended-tier-bias.test.ts`. Rejected: generating without the pinning test
  (the test is the entire reason the precedent works; without it a stale figure ships silently,
  which is the exact failure that test was written to prevent).

### Preset plumbing and export affordances

- **D-19:** **A preset stores its parameter set, never a URL string.** Symbol, leverage, entry date,
  hold mode and period, costs, tier, dividend mode and result mode live in the definition;
  `bundleVersion` is filled in from the live manifest when the preset is applied. A preset therefore
  cannot be stale by construction, and Copy link then produces a normal correct permalink for it.
  Rejected: emitting full permalink strings at build time (a preset becomes literally a link, but
  it creates two representations of every preset and turns every data refresh into a regenerate);
  hand-written URLs with a decode test (the test reports the break, it does not fix it, and every
  bundle refresh becomes a hand-edit of nine URLs).

- **D-20:** **Featured status is one `featured` boolean on the preset definition**, read by both the
  inline row and the overlay. Promoting or demoting a preset is a one-line edit plus a regenerate,
  which is what the owner asked for explicitly. No separate featured list to keep in sync.

- **D-21:** **The PNG and CSV buttons live in an export row in the result column, OUTSIDE
  `.screenshot-region`.** Anything inside the region appears in the exported image, so keeping the
  controls out is structural rather than something the rasterizer has to filter for. Rejected:
  buttons inside the region stripped at capture via a `data-export-hide` attribute (most
  discoverable placement, but its failure mode is a control appearing in a shared image and that
  failure is invisible until someone pastes it somewhere); putting them in the parameter column
  (no result-column layout change, but the actions sit far from the result they export, and in
  sweep mode the parameter column drives the crosshair rather than the picture).

- **D-22:** **Phase 4's "Copy link" button moves from the parameter column into the new export
  row.** One row holding Copy link, Export PNG and Export CSV: three ways to get the same result
  out of the app, in one place, next to the result. Consequence: this relocates a shipped, verified
  Phase 4 control, so `src/app/components/ParameterColumn/CopyLinkButton.tsx`, its tests, and the
  Phase 4 UI-SPEC E10 placement notes all need updating, and the move must preserve the existing
  `flushPermalinkUrl()`-before-read discipline that file's header documents. Rejected: leaving it
  where it is (no churn on verified UI, but three share actions in two places with no visible
  reason); mirroring it in both places (two instances of the same action with the same label).

- **D-23:** **PNG writes to the clipboard with a download fallback; CSV downloads.** A PNG's
  destination is almost always a forum reply or a chat, so the clipboard removes the
  save-then-find-then-attach round trip; the download is the fallback when the Clipboard API is
  unavailable or the context is insecure. `CopyLinkButton.tsx` already implements exactly that
  failure-fallback pattern and is the template. A CSV goes into a spreadsheet, so it downloads.
  Rejected: both as downloads (one code path, but friction on the single most common thing this
  tool is for); offering both destinations for both exports (four controls in the export row, and
  a CSV on the clipboard mostly pastes as one column anyway).

### Claude's Discretion

- The exact export width within the 1100 to 1200px band, and the frame or margin treatment under
  D-02.
- Filename conventions for both exports.
- The precise CSV column order, header naming, number formatting and date format, subject to the
  project's standing rule that no value is rounded before render time.
- The full library list beyond D-15's featured four and D-10, D-11 and D-17's named entries,
  including exact entry dates and holding periods per preset. Roadmap criterion 3's four named
  windows must all appear in the library.
- Whether the crosshair overlay and hover readout appear in a sweep-mode PNG capture (see F-02).
- Export button labelling and disabled-state behaviour during load, mid-sweep, or on an invalid
  parameter combination.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The capture target and its history
- `.planning/phases/04-first-defensible-backtest-in-the-browser/04-CONTEXT.md` -- D-17 (controls
  left, result right), D-18 (instrument-panel voice, rejects editorial framing), D-19 (theme reads
  CSS custom properties at render time; canvas repaints on theme change), **D-20 (the screenshot
  region, built for this phase and explicitly deferring capture code to it)**, D-21 (the result
  column as a slot).
- `.planning/phases/05-attribution-and-the-credibility-surface/05-CONTEXT.md` -- "the screenshot is
  the deliverable" (D-07, D-08, D-13, D-20 all resolved on that basis), and the deferred
  "reset everything to defaults" idea explicitly pointed at this phase's preset picker.
- `.planning/phases/07-sweep-engine-and-the-heatmap/07-CONTEXT.md` -- D-04 (full sweep state in the
  permalink, including `mode` and `metric`), D-15 (the mode switch), D-19 to D-22 (hover, crosshair,
  drill-down: D-22 is the path D-08 depends on), D-26 (fixed colour domains, the comparability
  argument D-03 reuses), D-30 (the caption strip inside the screenshot region), D-35 (viewport
  deliberately excluded from the link).
- `src/app/App.tsx:153` and `src/app/components/ResultColumn/HeatmapPanel.tsx:552` -- the two
  `.screenshot-region` elements this phase captures.

### The permalink contract
- `src/app/permalink.ts` -- the one canonical serialization, its 17 keys, the always-optional
  `mode`/`metric` decode rule, and why `holdMode`'s wire value is `end-of-data` and never `today`.
- `src/app/components/ParameterColumn/CopyLinkButton.tsx` -- the `flushPermalinkUrl()`-before-read
  discipline and the clipboard-failure fallback pattern D-22 and D-23 both build on.

### The generated-file precedent D-18 copies
- `scripts/measure-extended-tier-bias.ts` -- the generator.
- `src/validation/extended-tier-bias.generated.ts` -- the emitted module and its header contract.
- `tests/validation/extended-tier-bias.test.ts` -- the pinning test that makes the pattern work.

### The kernel and the cost model D-16 depends on
- `src/kernel/backtest.ts` lines 133 to 141 -- financing scaled by `(leverage - 1)`, expense NOT
  leverage-scaled. This is the whole basis of D-16.
- `src/kernel/backtest.types.ts` -- `KernelSeries` and `KernelOutputs`, which between them hold
  every column D-06 needs.
- `.planning/PROJECT.md` -- Key Decisions table, including Phase 3's D-10 amendment (financing is
  paired with the TOTAL-return leg, which is why any pre-1988 SPX preset is necessarily extended
  tier).

### Budgets and their enforcement
- `perf-budgets.ts` -- PERF-07a, threshold 50ms, anchor "long task threshold", the budget roadmap
  criterion 4 measures against.
- `.planning/REQUIREMENTS.md` -- PERF-01a (no budget is relaxed without a Key Decision), SHARE-04,
  SHARE-05, SHARE-06.
- `.planning/STATE.md` -- the PERF-03 escalation record, the `solveIrr` figure F-04 rests on, and
  the carried-forward warning that every derived-not-measured number in this project that got
  tested turned out wrong.

### Data reality the presets are built against
- `public/data/manifest.f0a9dfbdfa.json` -- per-series first/last dates and strict/extended tier
  ranges. The specific facts D-10, D-11 and D-15 rest on: `TQQQ/total-return` 2010-02-11,
  `UPRO/total-return` 2009-06-25, `NDX/total-return` 1999-03-04, `SPX/total-return` strict
  1988-01-05 and extended 1927-12-30, `@rate/rate` 1927-12-30.

### Project constraints
- `.claude/CLAUDE.md` -- the stack table (note D-01's correction to its `canvas.toBlob()` claim) and
  the static-deploy, offline and no-runtime-API constraints.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/components/MethodologyOverlay.tsx` -- the full-screen overlay pattern D-14's Scenarios
  overlay copies. Mounted unconditionally as the last child of the layout, renders no DOM until its
  flag opens it.
- `src/app/components/ParameterColumn/CopyLinkButton.tsx` -- the clipboard-write-with-visible-
  failure-fallback pattern D-23 reuses for the PNG, and the control D-22 relocates.
- `src/app/parameter-defaults.ts` -- the `PARAMETER_DEFAULTS` registry with `isDefault()`/`reset()`
  per parameter, all writing through validated store setters. Applying a preset should go through
  the same setters, never raw store writes.
- `src/app/permalink.ts`'s `encodeParams`/`decodeParams` -- D-19's runtime URL construction has one
  correct call site and it is this one.
- `src/sweep/sweep-pool.ts` and comlink -- the existing worker plumbing D-09 builds the CSV on.
- `src/data/kernel-inputs.ts`, `src/kernel/backtest.types.ts` -- every CSV column D-06 needs already
  exists caller-side.
- `src/metrics/format.ts` -- the single render-time rounding site; CSV formatting must not introduce
  a second one.

### Established Patterns
- **Generated module plus pinning test** (`extended-tier-bias.generated.ts`). D-18 is a direct copy.
- **No value is rounded before render time.** Stated in `attribution.ts`'s header and
  `backtest.types.ts`'s `maxDrawdown` doc. Binds the CSV.
- **One canonical serialization, one call site** (Pitfall 5, `permalink.ts` header). Binds D-19.
- **Escalate and record, never relax a budget** (PERF-01a, D-20). Binds D-05.
- **Every default carries its source inline** (Phase 4 D-18, CRED-05). Preset definitions should
  carry why each window was chosen, not just its parameters.

### Integration Points
- `src/app/App.tsx` -- the export row (D-21) mounts in the result column outside
  `.screenshot-region`; the Scenarios overlay (D-14) mounts alongside `MethodologyOverlay`.
- `src/app/components/ParameterColumn/ParameterColumn.tsx` -- loses `CopyLinkButton` under D-22.
- `package.json` -- gains `html-to-image` (D-04) and a `compute-presets` script (D-18).
- `tests/app/static-build.test.ts` -- must be inverted deliberately (F-01).
- `scripts/` -- gains `compute-presets.ts` alongside `measure-extended-tier-bias.ts`.

</code_context>

<specifics>
## Specific Ideas

- **The audience is the UPRO/TQQQ safety argument.** The owner's stated read: "the people using this
  are mostly going to talk about whether UPRO or TQQQ are good investments and how safe they are."
  That is why D-15 promotes two real-fund COVID presets over 1929, and it should guide any later
  judgement call about which preset earns a featured slot.
- **1929 is interesting but not worth featuring.** Stated directly by the owner. It stays in the
  library, it does not get a one-click slot.
- **Preset promotion must stay trivial.** The owner asked explicitly that swapping the featured set
  be easy. D-20's single boolean is the answer; anything that requires touching more than the
  preset definition to promote or demote has missed the requirement.
- **The build-time generation idea is the owner's**, not Claude's: "does it make sense to compute
  this as part of CI or build, since the only time this would change is if the bundle changes... that
  way we're computing this once per build, not once every time someone loads the webpage." It is a
  better answer than either option originally offered and it happened to match an existing repo
  precedent exactly.

</specifics>

<findings>
## Findings (not decisions -- recorded for the researcher and planner)

- **F-01: An existing test actively forbids this phase's core mechanism.**
  `tests/app/static-build.test.ts:120` asserts no `toDataURL(` or `canvas.toBlob(` call site ships
  anywhere in `src/`, and line 138 bans `html-to-image`, `dom-to-image`, `dom-to-image-more` and
  `html2canvas` by name. Both were written under Phase 4's D-20 as a guard that capture code would
  not creep in early. Phase 8 must invert them deliberately rather than delete them: the correct end
  state is a test asserting capture happens only inside the export module, not that it happens
  nowhere.

- **F-02: Sweep-mode capture is materially harder than single-run capture and was not discussed.**
  `HeatmapPanel.tsx:552`'s region contains two stacked canvases at identical geometry (field plus a
  transparent crosshair overlay), absolutely-positioned HTML axis ticks, a `HoverReadout` that may
  be visible, two uPlot slice charts, the legend and the caption strip. Whether the committed
  crosshair belongs in an exported image (it names the cell being argued) and whether a transient
  hover readout must be suppressed are both undecided, and D-03's fixed-width re-layout interacts
  with a canvas whose paint rectangle is measured from its own element.

- **F-03: The kernel emits no per-bar cost decomposition, and D-06 is built to avoid needing one.**
  If a later requirement wants per-bar financing and expense columns, quick-260824-46s already
  measured the cost of adding write-only per-bar output arrays at roughly 1-2% of kernel time, and
  that measurement stands.

- **F-04: D-17's DCA preset makes a known-slow path user-reachable.** STATE.md records `solveIrr`
  at roughly 3.9x over budget on the contribution branch after the convergence fix, and names
  Newton-with-bisection-fallback (lever 4) as the unspent remedy, noting it reopens D-08 and needs
  its own Key Decision. A DCA preset one click inside the Scenarios overlay puts that latency in
  front of users for the first time. Worth measuring before the preset ships, not after.

- **F-05: PERF-07a compliance for the PNG path is genuinely unknown.** `html-to-image` serializes
  the DOM, inlines computed styles and fonts, and draws an SVG, all on the main thread by
  construction. No figure exists. STATE.md's carried-forward warning applies directly: measure it
  early rather than planning around an estimate.

- **F-06: Both pre-1988 SPX presets are extended tier and cannot be made strict by switching
  dividend mode.** `SPX/price-return` strict reaches back to 1954-01-04 while `SPX/total-return`
  strict starts only 1988-01-05, so price-return looks like an escape from D-11's caveat. It is not:
  Phase 3's D-10 amendment establishes that the financing charge must be paired with the
  total-return leg, and pairing it with a dividend-stripped return is the exact asymmetry that
  produced the roughly 7%/yr phantom gap the amendment was written to fix.

- **F-07: The preset outcome figures are a second surface that can contradict the app.** D-18's
  pinning test protects against bundle and cost-model drift, but the figure shown in the overlay and
  the figure the app computes on click must also agree on *formatting* and on which metric is being
  shown (multiple-of-contributed versus IRR versus CAGR, which differ per preset under METR-01/02).
  One shared formatter, not two.

</findings>

<deferred>
## Deferred Ideas

- **A sweep-mode grid CSV** (one row per cell, every metric METR-06 computes). Nearly free since the
  grid is already in memory, and it is the natural raw-numbers export behind the heatmap. Declined
  under D-08 because no requirement asks for it and it is a second format to specify, test and
  budget.

- **In-tool preset authoring, promotion and demotion by the user.** Raised by the owner as a
  possible nice-to-have. Declined: it is a new capability rather than a clarification of this
  phase, and it conflicts directly with D-18, since a user-defined preset has no build-time
  generated outcome and no pinning test, so it would need a second unpinned code path. D-20 gives
  the owner cheap promotion at the source level, which is what the underlying need was.

- **Per-bar cost decomposition columns in the CSV** (financing charge, expense charge, leveraged
  return). Declined under D-06 because they exist nowhere today. Revisit only alongside a decision
  to spend quick-260824-46s's measured 1-2% kernel cost.

- **A DCA counterpart for every flagship window**, so the same window can be compared lump-sum
  versus dollar-cost-averaged. Arguably the most useful comparison the tool could show. Declined
  under D-17 on set size and on the `solveIrr` cost.

- **Keeping the last N data bundles deployed and addressable** so an old permalink reproduces
  faithfully rather than only reporting that the data changed. Carried unchanged from Phase 4 and
  Phase 5's deferred lists. D-19 makes presets immune to this, but user-shared links are not.

- **A global "reset everything to defaults" control.** Deferred from Phase 5's D-22 explicitly
  "alongside Phase 8's preset scenarios, where a named-scenario picker is the natural home for
  'jump to a known state'". The Scenarios overlay is now that home, but no reset control is in
  scope here.

</deferred>

---

*Phase: 8-Export and the Canonical Arguments*
*Context gathered: 2026-08-25*
