---
phase: 06-heatmap-design-pass
plan: 04
subsystem: ui
tags: [canvas, colorscale, heatmap, vitest-browser, small-multiples]

requires:
  - phase: 06-heatmap-design-pass
    provides: "sweep-fixture.bin, value-to-color.ts, sweep-fixture-format.ts, mockup-runtime.ts (mountMockup/loadSweepFixture/renderLegend/renderCaveat/makeHatchPattern), form-1-dense-grid.ts's axis-gutter-inset geometry convention, bench/heatmap-repaint.bench.test.ts's equivalence-then-timing bench pattern (06-01)"
provides:
  - "form 3 of 4 (small multiples): fifty stacked one-dimensional leverage strips, one per leverage row, rendering the same 10,000-cell fixture through the same valueToColor/mountMockup chrome"
  - "form-3-small-multiples.ts's exported geometry primitives (fieldRect, stripLayout, stripRect, cellDisplayCenter, gapCenterBetween) for the criterion-4 bench file and for plan 06-05's judging pass"
  - "bench/heatmap-form-3.bench.test.ts: criterion 4's form-3 arm, info line PERF-05-heatmap-form-3"
affects: [06-05, 06-06, phase-7-heatmap-implementation]

actuals:
  tokens: 6600
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "One-dimensional strip painting via a reused cols-by-1 ImageData row buffer + 1-row offscreen canvas, drawImage-stretched into each strip's own rectangle -- the non-integer-upscale sibling of form 1's whole-field putImageData path, used whenever a form's canvas is not a clean upscale of the fixture grid"
    - "Declared-nominal/derived-actual strip geometry: FORM_3_GEOMETRY's stripHeightPx/stripGapPx are nominal constants: stripLayout() derives the real per-strip period from the field rectangle at paint time, mirroring FORM_1_GEOMETRY.cellSizePx's own relationship to form-1-dense-grid.ts's real per-cell size"

key-files:
  created:
    - .planning/phases/06-heatmap-design-pass/mockups/forms/form-3-small-multiples.ts
    - .planning/phases/06-heatmap-design-pass/mockups/form-3-small-multiples.html
    - bench/heatmap-form-3.bench.test.ts
  modified: []

key-decisions:
  - "Both axis-label gutters (left for leverage labels, bottom for entry-year labels) are carved from the SAME fixed 800x400 canvas FORM_3_GEOMETRY declares, rather than adding extra height/width beyond it -- exactly mirroring form-1-dense-grid.ts's fieldRect convention (its own read_first precedent), even though the plan's literal '50 strips at 6px + 2px gap = 400px' arithmetic describes the strip budget alone with no room left for a bottom gutter. FORM_3_GEOMETRY's stripHeightPx/stripGapPx are therefore nominal constants; stripLayout() derives the real per-strip period from the field rectangle (384px high after the 16px bottom gutter, giving each strip roughly 5.68px of real rendered height against the nominal 6px), the same declared-nominal/derived-actual relationship FORM_1_GEOMETRY.cellSizePx already has to form-1-dense-grid.ts's real per-cell size. No acceptance criterion pins the exact heightPx/widthPx values (only rows:50/cols:200 are checked), and the rendered result (verified visually below) reads correctly with visible gaps and non-overlapping axis labels."
  - "FORM_3_GEOMETRY carries both the plan's literal cellWidthPx/stripHeightPx/stripGapPx fields AND a cellSizePx field (same value as cellWidthPx) so the object also satisfies MockupGeometry's shape for mountMockup -- the plan's given object literal omits cellSizePx, which MockupGeometry requires structurally."
  - "The bench file's third equivalence sample point (the incomplete-hold cell) is found by scanning fixture.flags at test time for the first CELL_FLAG_INCOMPLETE cell, rather than a hardcoded row/col -- the committed fixture's incomplete region is contiguous but not documented at pixel precision, and a dynamic scan can't silently stop testing anything if the fixture is ever regenerated with a different incomplete boundary."

requirements-completed: [VIZ-05, VIZ-10]

coverage:
  - id: D1
    description: "form-3-small-multiples.ts/.html: fifty stacked leverage strips rendering the full 10,000-cell fixture through the shared valueToColor/mountMockup chrome, with the real VIZ-10 caveat and D-24/D-25 legend, in both light and dark"
    requirement: VIZ-10
    verification:
      - kind: automated_ui
        ref: "Playwright load + screenshot of http://localhost:5174/.planning/phases/06-heatmap-design-pass/mockups/form-3-small-multiples.html (light and dark via theme-toggle click), DOM text assertions on the caveat/legend/heading, zero console errors"
        status: pass
      - kind: unit
        ref: "bench/heatmap-form-3.bench.test.ts equivalence test (first strip, last strip, a real incomplete-hold cell, and a strip gap all sampled after paintSmallMultiples)"
        status: pass
    human_judgment: true
    rationale: "The plan's own <verify><human-check> calls for a human to visually confirm all fifty strips render with visible gaps, leverage labels line up with their strips, the caveat reads in full, and the panel survives a theme toggle. This is a parallel worktree dispatch (plan frontmatter autonomous:true) with no live human channel available, so the executor substituted an automated-but-visual proxy (Playwright screenshots read back and inspected, DOM assertions, zero console errors), matching 06-01-SUMMARY.md's own precedent for this exact situation. Screenshots were inspected directly (not committed, per D-17's no-binary-archive constraint) and confirm the field paints as fifty separated strips with visible gaps, leverage labels aligned to strip centres, the caveat rendering in full, and the panel surviving the toggle -- flagged here so a human reviewer can still spot-check the live page."
  - id: D2
    description: "bench/heatmap-form-3.bench.test.ts: criterion 4's form-3 arm, equivalence proof before timing (including a strip-gap-equals-surface-colour check, T-06-12), PERF-05-heatmap-form-3 info line"
    verification:
      - kind: integration
        ref: "npx vitest run --project bench bench/heatmap-form-3.bench.test.ts (2 tests passed: equivalence, then measurement)"
        status: pass
    human_judgment: false

duration: 16min
completed: 2026-08-21
status: complete
---

# Phase 6 Plan 04: Form 3, Small Multiples Summary

**Fifty stacked one-dimensional leverage strips painted via a reused cols-by-1 row buffer, rendering the same real 10,000-cell fixture through the shared colour function and mockup chrome, measured at 0.5ms against PERF-05's 16ms repaint budget.**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-08-21T06:07:43Z (approx, base commit)
- **Completed:** 2026-08-21T06:19:28Z
- **Tasks:** 2
- **Files modified:** 3 (all new)

## Accomplishments

- `mockups/forms/form-3-small-multiples.ts`: `FORM_3_GEOMETRY` (200x50 field at an 800x400 canvas) and `paintSmallMultiples`, painting fifty leverage strips -- one per fixture row -- via a reused 200x1 `ImageData` row buffer and 1-row offscreen buffer canvas, `drawImage`-stretched into each strip's own rectangle. Fifty `drawImage` calls per repaint, not 10,000 `fillRect` calls. Strip 0 (1.00x) sits at the bottom, column 0 (earliest entry date) at the left, matching every other form (A-E5). Gaps between strips are filled with `var(--color-surface)` read at paint time. Ruin cells get the D-18 hatch under a clip path (the committed fixture's `ruinedCount=0`, so this path is unit-covered but has no in-field pixels to render against this particular fixture); incomplete cells stay flat, untextured (D-20). Leverage labels render every 5th strip in the left gutter; entry-year ticks every 20th column in the bottom gutter, both carved from the fixed canvas rather than overdrawing field pixels.
- `mockups/form-3-small-multiples.html`: plain-HTML entry point importing `mountMockup`/`loadSweepFixture` and the form's own paint function, titled "Small multiples", no inline colour or `log10` copy (D-28).
- `bench/heatmap-form-3.bench.test.ts`: proves paint equivalence (first strip, last strip, a real incomplete-hold cell found dynamically, and a strip gap matched against the computed panel surface colour) before trusting any timing, then measures a metric-toggle repaint (multiple <-> drawdown) via `measureBatchedMinOfN`, normalizes against the run's calibration score, and records info line `PERF-05-heatmap-form-3`. Measured **0.5ms normalized** (0.32ms raw, batch size 200) on this dev sandbox (9 logical cores, calibration score ~0.61-0.625, not the D-17 CI baseline), well inside the 16ms budget. Does not call `commands.recordMeasurement`: form 1's bench file owns the run's one PERF-05 row.

## Task Commits

Each task was committed atomically:

1. **Task 1: Form 3, fifty stacked leverage strips** - `403322d` (feat)
2. **Task 2: Criterion 4 for form 3** - `ef0f9f5` (test)

## Files Created/Modified

- `.planning/phases/06-heatmap-design-pass/mockups/forms/form-3-small-multiples.ts` - form 3's own geometry, geometry-derivation helpers, and paint function
- `.planning/phases/06-heatmap-design-pass/mockups/form-3-small-multiples.html` - form 3's plain-HTML entry point
- `bench/heatmap-form-3.bench.test.ts` - criterion 4's form-3 arm

## Decisions Made

- **Both axis-label gutters carved from the fixed 800x400 canvas**, not added on top of it, mirroring `form-1-dense-grid.ts`'s established `fieldRect` convention. `FORM_3_GEOMETRY.stripHeightPx`/`stripGapPx` are nominal; `stripLayout()` derives the real per-strip period from the field rectangle at paint time. See frontmatter `key-decisions` for the full reasoning.
- **`FORM_3_GEOMETRY` carries an extra `cellSizePx` field** (alongside the plan's literal `cellWidthPx`) so the object structurally satisfies `MockupGeometry` for `mountMockup`.
- **The bench file's incomplete-hold sample cell is found dynamically** (scans `fixture.flags` for the first `CELL_FLAG_INCOMPLETE` cell) rather than hardcoded, so the equivalence proof stays meaningful if the committed fixture is ever regenerated.

## Deviations from Plan

### Auto-fixed Issues

None - plan executed as written, with the geometry-gutter interpretation documented above as a design decision (not a bug fix) where the plan's prose and its own cited precedent (form 1's gutter convention) pointed in slightly different directions.

**Total deviations:** 0 auto-fixed
**Impact on plan:** None. The gutter-carving choice is a faithful application of the plan's own required precedent (form-1-dense-grid.ts, named explicitly in `<read_first>`), not a departure from it.

## Issues Encountered

- **`npx vitest run --project bench bench/heatmap-form-3.bench.test.ts` in isolation exits 1**, not 0 as the plan's `<verify><automated>` line literally states -- the identical pre-existing, project-wide `assertRunInvariants` PERF-08-coverage characteristic 06-01-SUMMARY.md already documented for form 1's own bench file, not a regression. The two facts the acceptance criteria care about both hold: the equivalence test runs and passes before the measurement test, and the recorded `PERF-05-heatmap-form-3` info line (0.5-0.54ms across runs) is well under 16ms.
- **`npm run bench` (full suite, after `npm run build`) exits 1 on `PERF-07a`/`PERF-07b`** (measured 110.4ms/73.0ms against 50ms/16ms budgets) -- confirmed unrelated to this plan: `bench/perf-07.bench.test.ts` measures main-thread long-task duration during a leverage-slider drag interaction (Phase 4 concern, no dependency on any file this plan touches), and re-running that single file in isolation times out outright on this shared dev sandbox, matching STATE.md's own documented pattern of PERF-07/PERF-08 sandbox variance (this sandbox is not the D-17 CI baseline). `npm run build` was run once to exercise this suite, then `dist/` was removed again (gitignored, confirmed via `git check-ignore`) before any commit.
- **Verified the equivalence test is non-vacuous**, per the plan's own acceptance criterion: temporarily changed the strip-painting loop bound from `rows` to `25`, re-ran the equivalence test, confirmed it failed (the last-strip sample stayed at the background colour instead of the expected `valueToColor` output), then restored the loop and re-ran to confirm both tests pass again (`git diff --stat` empty afterward, confirming a clean revert).
- **Tracer feedback gate vs. parallel worktree dispatch**, same situation 06-01-SUMMARY.md documented: no live human channel available in this worktree dispatch, so Task 1's `<verify><human-check>` was substituted with an automated Playwright visual proxy (screenshots inspected directly, DOM assertions, zero console errors) rather than a live checkpoint. Flagged as `human_judgment: true` in this SUMMARY's `coverage:` block (D1) for a human reviewer to spot-check.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Form 3 is ready for plan 06-05's judging pass alongside forms 1, 2 and 4, reading the same committed fixture and carrying the same legend/caveat.
- `form-3-small-multiples.ts`'s exported geometry helpers (`fieldRect`, `stripLayout`, `stripRect`, `cellDisplayCenter`, `gapCenterBetween`) are available for plan 06-05 or Phase 7 to reuse if the small-multiples form is carried forward.
- No blockers. The committed fixture's `ruinedCount=0` (documented already in 06-01-SUMMARY.md) means this form's D-18 hatch overlay is unit-exercised via the code path but has no in-field pixels to visually judge in plan 06-05, the same open methodological note 06-01 already recorded for form 1.

---
*Phase: 06-heatmap-design-pass*
*Completed: 2026-08-21*
