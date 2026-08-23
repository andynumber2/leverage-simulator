---
phase: 07-sweep-engine-and-the-heatmap
plan: 09
subsystem: viz
tags: [canvas2d, contour, marching-squares, ruin-hatch, short-horizon-rule, curve-label, heatmap]

requires:
  - phase: 07-sweep-engine-and-the-heatmap
    plan: "07-04"
    provides: "src/heatmap/paint-contour.ts's shipped resample fill path and its annotation pass (band-boundary strokes, ruin-hatch clip-and-fill)"
  - phase: 07-sweep-engine-and-the-heatmap
    plan: "07-06"
    provides: "src/app/state.ts's displayedMetric signal, active tier selection, and sweep-grid staleness generation"
provides:
  - "src/heatmap/short-horizon.ts: SHORT_HORIZON_BARS/SHORT_HORIZON_LABEL/shortHorizonColumn (date-only, invariant to cell values) and paintShortHorizonRule (dashed muted vertical rule with a var(--color-surface)-backed label, cell colours left completely intact)"
  - "src/heatmap/curve-label.ts: labelAnchorFor/labelAnchorAvoiding (anchor selection scored by slope + centrality, with an F-04 collision-avoidance fallback against the short-horizon rule's column) and paintCurveLabel"
  - "paint-contour.ts: the ruin-hatch categorical fallback (T-07-19), the short-horizon rule wired into the annotation pass after the hatch, and the inline curve label wired in with a skip-stroke pass under the label's own bounding box"
  - "tests/app/ruin-and-horizon.browser.test.ts: the named verification sweep (SPX, dividend-reinvested, extended tier, open-ended, D-01/D-03 grid shape) proving ruin is categorical where it genuinely occurs"
affects: [07-10]

actuals:
  tokens: 24437
  tasks: 4
  commits: 5

tech-stack:
  added: []
  patterns:
    - "A categorical cell flag never falls through to the continuous ramp even when its own rendering primitive fails to construct: the ruin hatch's CanvasPattern factory is injectable (hatchPatternFactory), and a caught construction failure falls back to a flat RUIN_BASE_RGBA fill rather than leaving the clip unfilled over whatever the ramp painted underneath."
    - "A boundary rule computed from dates alone (never a cell value or flag) is invariant under a partially failed sweep by construction, not by a defensive check -- shortHorizonColumn reads only grid.meta.entryDates/endOfDataDate."
    - "Two independently-legible annotation layers sharing a canvas region (a dashed rule and a diagonal hatch, a solid emphasis stroke and an inline label) resolve their collision by geometry, not by one yielding: distinguishable dash/hatch periods, an opaque label backing sized to a design token, and a skip-stroke pass under a label's own bounding box so text breaks the line rather than sitting on top of it."
    - "An anchor-selection heuristic (slope + centrality scoring) is exposed as a pure, DOM-free function (labelAnchorFor) so a browser test can independently recompute the same anchor the production paint call used, rather than asserting on rendered pixels alone."

key-files:
  created:
    - src/heatmap/short-horizon.ts
    - src/heatmap/curve-label.ts
    - tests/heatmap/short-horizon.test.ts
    - tests/heatmap/paint-contour.test.ts
  modified:
    - src/heatmap/paint-contour.ts
    - tests/app/ruin-and-horizon.browser.test.ts

key-decisions:
  - "Orchestrator-routed fix (0d658fb, precedes Task 1): getRampValues's two-way branch (metric === 'multiple' ? grid.multiples : grid.drawdowns) silently stroked contour lines from the wrong array for the annualized metric, and called the multiple-only rampPositionFor unconditionally, mapping drawdown/annualized values through the wrong domain. Made the array selection an exhaustive switch (valuesForContourMetric) and routed every metric through rampPositionForMetric; paintSweepField now strokes bandLevelsForMetric(metric) with emphasizedBandLevelFor(metric) deciding the 2px emphasis, instead of a hardcoded multiple-only pair. This closed the per-metric bug 07-07's summary deferred to this plan, and is the reason Task 4's curve label can trust emphasizedBandLevelFor for both multiple and annualized."
  - "Task 3's dash period is [4, 3] (7 display pixels), chosen specifically because 7 and the ruin hatch's own 6px diagonal period share no common factor beyond 1 -- the two rhythms drift in and out of phase across the rule's height rather than locking into a fixed, blended-looking offset. Documented in short-horizon.ts's own module header, not left as a bare magic-number choice."
  - "Task 4's collision-avoidance rule ('at least the label's own width away from the rule's column, falling back to the next-shallowest segment') is implemented as labelAnchorAvoiding: a shrinking-candidate-pool loop over labelAnchorFor, rather than a one-shot nudge, so it degrades gracefully to null (no label) if every candidate collides, instead of ever silently rendering an overlapping label."
  - "The curve label's text is derived exactly like emphasizedBandLevelFor's own raw values (1.0 for multiple, 0 for annualized), duplicated rather than plumbed through a shared constant -- consistent with this codebase's existing pattern of small, deliberate duplication across zero-import-discipline modules (e.g. field-sampler.ts's BAND_MULTIPLES vs value-to-color.ts's MULTIPLE_BAND_MULTIPLES) rather than adding a new coupling."

patterns-established:
  - "Independently-testable anchor selection: labelAnchorFor/labelAnchorAvoiding are pure, DOM-free, and exported specifically so a browser test can call the exact same function paint-contour.ts calls internally, deriving expected pixel positions from the production code path itself rather than a duplicated, drift-prone copy of the scoring arithmetic."
  - "Skip-stroke-under-label as an AABB intersection test computed BEFORE the stroke pass runs, not as a post-hoc erase -- the segment(s) a label's bounding box covers are simply omitted from the ctx.beginPath()/moveTo/lineTo loop, so there is never a frame where the line is drawn and then painted over."

requirements-completed: [VIZ-03, VIZ-06, VIZ-09]

coverage:
  - id: D1
    description: "The short-horizon boundary in open-ended mode is a labelled, dashed, muted vertical rule that leaves every cell's own colour completely untouched, states its own 3-year threshold in the label text, and is absent by construction in fixed-period mode or when no column crosses the threshold"
    requirement: VIZ-09
    verification:
      - kind: unit
        ref: "tests/heatmap/short-horizon.test.ts -- shortHorizonColumn null in fixed-period mode regardless of dates, invariant under a wholesale replacement of every cell value/flag, null on a grid too short to cross the threshold; SHORT_HORIZON_LABEL's own literal checked against SHORT_HORIZON_BARS at module load"
        status: pass
      - kind: automated_ui
        ref: "tests/app/ruin-and-horizon.browser.test.ts -- 'Task 1: short-horizon rule (D-29)' describe block: dashed stroke close to var(--color-text-muted) and distinct from the 2px accent/breakeven treatment, identical RGBA either side of the rule, label flips left near the panel's right edge"
        status: pass
    human_judgment: false
  - id: D2
    description: "Ruin is proven categorical (never merely the darkest ramp sample, texture rather than a flat fill, invariant under a hatch-construction failure) on a named sweep where ruin genuinely occurs, confined to high-leverage rows, and identical between sweep modes for any cell ruined within the shorter window's own bars"
    requirement: VIZ-06
    verification:
      - kind: automated_ui
        ref: "tests/app/ruin-and-horizon.browser.test.ts -- 'Task 2: ruin proven categorical on the named verification sweep' describe block: SPX/extended/open-ended/1x-5x-over-50-rows/200-columns sweep drives ruinedCount > 0, every ruined cell's leverage >= 4.5, a ruined pixel matches none of 33 samples on either ramp, two pixels within one ruined cell differ, the fixed-period re-run agrees for every cell ruined within its own window, and the hatch-construction-failure fallback still renders categorically"
        status: pass
    human_judgment: false
  - id: D3
    description: "Where the ruin hatch and the short-horizon rule occupy the same region, both stay independently legible: the rule renders over the hatch without suppressing it, and the rule's own label carries an opaque backing so it reads over the diagonal texture"
    requirement: VIZ-09
    verification:
      - kind: automated_ui
        ref: "tests/app/ruin-and-horizon.browser.test.ts -- 'Task 3: the hatch and the short-horizon rule read cleanly together (F-04)' describe block: a synthetic open-ended grid with CELL_FLAG_RUINED cells straddling the rule's column finds the rule's muted stroke at its own column at three separate row positions, hatch texture (two differing pixels within a cell) survives one cell either side, and the label's own bounding box samples the panel surface colour behind the text"
        status: pass
    human_judgment: false
  - id: D4
    description: "The breakeven boundary (and, generally, whichever boundary a metric emphasizes) carries an inline label on the curve itself, formatted through the shared metrics formatter, breaking the stroked line under its own bounding box, absent entirely for a metric with no emphasized boundary, and steered clear of the short-horizon rule's own label when the two would otherwise collide"
    requirement: VIZ-06
    verification:
      - kind: automated_ui
        ref: "tests/app/ruin-and-horizon.browser.test.ts -- 'Task 4: inline breakeven curve label (D-33)' describe block: '1.00x' (via formatMultiple, asserted against the regex for two fixed decimals and a trailing x) renders within two pixels of an independently-recomputed anchor; no label renders for drawdown; the stroked line is interrupted under the label's own bounding box; a wide synthetic grid with the crossing forced near the short-horizon rule's column proves the two labels' bounding boxes do not intersect, cross-validated against the real render"
        status: pass
    human_judgment: false

duration: ~2h (across two sessions; this session covered Tasks 3-4 only, resuming after Tasks 1-2 and their prerequisite fix landed)
completed: 2026-08-23
status: complete
---

# Phase 07 Plan 09: Ruin and the Short-Horizon Boundary Summary

**Ruin proven categorical by pixel sampling on a named SPX sweep where it genuinely happens, a labelled short-horizon rule that never alters a cell's colour, the hatch and rule proven legible together, and an inline breakeven/annualized-boundary label that breaks its own line rather than sitting on top of it.**

## Performance

- **Tasks:** 4 (plus one orchestrator-routed prerequisite fix that precedes Task 1)
- **Files modified:** 6 (2 created source modules, 2 created test files, 2 modified source/test files)
- **Commits:** 5

## Accomplishments

- **Prerequisite fix (0d658fb):** `getRampValues`'s array/domain selection was multiple-vs-drawdown only, silently stroking wrong-array contour lines and mapping values through the wrong domain for the `annualized` metric. Made exhaustive (`valuesForContourMetric`) and routed every metric through `rampPositionForMetric`/`bandLevelsForMetric`/`emphasizedBandLevelFor`, closing the bug 07-07's summary deferred here and giving Task 4's curve label a trustworthy `emphasizedBandLevelFor` to read for both `multiple` and `annualized`.
- **Task 1:** `src/heatmap/short-horizon.ts` marks open-ended mode's recent-entry-date edge with a 1px dashed `var(--color-text-muted)` rule and a label stating its own 3-year threshold, computed from `grid.meta.entryDates`/`endOfDataDate` alone (never a cell value or flag, so it survives a partial chunk failure) and gated to `null` in fixed-period mode. Every cell's own colour is left completely untouched -- the marking is the rule and its label, nothing else, which is exactly where the incomplete-hold-grey precedent (`06-HEATMAP-SPEC.md` Finding F-01) stops applying.
- **Task 2:** The named verification sweep -- SPX, dividend-reinvested, extended tier (entry-date axis from 1927-12-30), open-ended, the D-01/D-03 grid shape -- is declared explicitly in `tests/app/ruin-and-horizon.browser.test.ts` as named constants, resolving Finding F-02. It genuinely ruins (1987-10-19's roughly -20.5% single-day decline crosses the ruin line above leverage ~4.88), and the test proves ruin is categorical: `ruinedCount > 0`, every ruined cell's leverage is at least 4.5, a ruined pixel matches none of 33 evenly-spaced samples on either the diverging or sequential ramp, two pixels within one ruined cell differ (texture, not a flat fill), the fixed-period re-run agrees for every cell ruined within its own shorter window (D-31), and the hatch-construction-failure fallback (added to `paint-contour.ts` in this same commit) still renders categorically rather than falling through to the continuous ramp.
- **Task 3:** F-04's own collision -- the ruin hatch and the short-horizon rule can occupy the same region at the right edge of an open-ended sweep, and neither yields -- is resolved by geometry: the rule's dash period (`[4, 3]`, 7 display pixels) is deliberately coprime with the hatch's 6px diagonal period so the two rhythms never lock into a blended-looking offset, the rule paints strictly after the hatch, and the rule's own label now carries a small opaque `var(--color-surface)` backing sized to the text plus the `--space-xs` padding token, so 12px muted text stays legible over a 2px-stroke diagonal texture. A synthetic grid with `CELL_FLAG_RUINED` cells straddling the rule's column proves both survive: the rule's stroke is findable at three row positions inside the hatched block, and the hatch's own texture (two differing pixels within a cell) survives one cell either side of the rule.
- **Task 4:** `src/heatmap/curve-label.ts` labels the field's own emphasized boundary (breakeven `1.00x` for `multiple`, `0%/yr`-shaped for `annualized`, nothing for `drawdown`, which has no threshold) inline, on the curve itself, matching the existing 2px `var(--color-text)` emphasis. `labelAnchorFor` scores each segment of the emphasized level by local slope and distance from the field's own centre; `labelAnchorAvoiding` wraps it with a shrinking-candidate-pool fallback that steers at least the label's own width away from the short-horizon rule's column (F-04's own resolution for this second collision), degrading to no label rather than ever rendering an overlap. `paint-contour.ts`'s stroke pass now skips every segment whose own bounding box the label's bounding box covers, so the text sits IN the line rather than on top of it -- proven by sampling for an interruption gap along the stroked path. `06-HEATMAP-SPEC.md` Finding B stays only partially closed: the other nine `BAND_MULTIPLES` boundaries remain unlabelled on the field itself, recorded in `curve-label.ts`'s own header as deferred rather than left for a future reader to rediscover.

## Task Commits

Each task was committed atomically:

1. **Prerequisite fix** - `0d658fb` (fix) - route contour band levels/ramp positions through per-metric authority
2. **Task 1: The labelled short-horizon rule, colours left intact** - `a412ce7` (feat)
3. **Task 2: Name the verification sweep and prove ruin is categorical on it** - `af894a0` (feat)
4. **Task 3: Make the hatch and the rule read cleanly together where they overlap** - `bf75d8e` (feat)
5. **Task 4: Label the breakeven curve inline, on the curve itself** - `85958b6` (feat)

_This summary covers all four tasks. Tasks 1-2 and the prerequisite fix were executed and committed in a prior session; Tasks 3-4 were executed in this session, resuming from that point._

## Files Created/Modified

- `src/heatmap/short-horizon.ts` - `SHORT_HORIZON_BARS`/`SHORT_HORIZON_LABEL`/`shortHorizonColumn`/`paintShortHorizonRule`, including Task 3's opaque label backing and documented dash-period choice
- `src/heatmap/curve-label.ts` - `labelAnchorFor`/`labelAnchorAvoiding`/`paintCurveLabel` (new, Task 4)
- `src/heatmap/paint-contour.ts` - exhaustive per-metric ramp routing (prerequisite fix), the ruin-hatch categorical fallback and `hatchPatternFactory` override (Task 2), the short-horizon rule wired into the annotation pass (Task 1), the inline curve label wired in with its skip-stroke pass (Task 4)
- `tests/heatmap/short-horizon.test.ts` - unit coverage for `shortHorizonColumn`'s date-only, flag-invariant behaviour (Task 1)
- `tests/heatmap/paint-contour.test.ts` - unit coverage for the exhaustive per-metric ramp routing (prerequisite fix)
- `tests/app/ruin-and-horizon.browser.test.ts` - all four tasks' browser coverage, in four named `describe` blocks

## Decisions Made

See `key-decisions` in the frontmatter above: the prerequisite exhaustive-switch fix, the coprime dash-period choice, the shrinking-candidate-pool collision-avoidance loop, and the deliberate duplication of the emphasized boundary's raw values rather than a new shared constant.

## Deviations from Plan

None beyond the prerequisite fix, which the resume context for this session already documented as inherited, orchestrator-routed work preceding Task 1 (not a deviation introduced in this session's own scope of Tasks 3-4).

## Issues Encountered

- The Task 3 "label backing" test initially sampled a pixel that fell outside the 200px-wide canvas: `SHORT_HORIZON_LABEL` (a full sentence) is wider than that canvas regardless of which side it renders on, so the backing rectangle's own leading edge landed at a negative x and the sampled pixel read garbage. Fixed by widening that one test's canvas to 700px (mirroring Task 1's own "renders to the right by default" test, which uses a 600px canvas for the identical reason) so the label comfortably fits on one side and the sampled pixel stays on-canvas.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `06-HEATMAP-SPEC.md` Finding C (ruin hatch never visually exercised) and Finding F-01/F-02 (fixture never ruined) are closed.
- `07-CONTEXT.md` D-29 (short-horizon rule), D-31 (ruin renders identically in both modes), D-33 (inline breakeven label) are implemented and verified.
- Finding B stays only partially closed by design (D-33's own scope): labelling the other nine `BAND_MULTIPLES` boundaries in full contour-map convention is deferred to a future plan, recorded in `curve-label.ts`'s own header.
- No blockers for 07-10.

---
*Phase: 07-sweep-engine-and-the-heatmap*
*Completed: 2026-08-23*
