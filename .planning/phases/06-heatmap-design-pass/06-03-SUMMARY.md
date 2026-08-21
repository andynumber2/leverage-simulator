---
phase: 06-heatmap-design-pass
plan: 03
subsystem: ui
tags: [canvas, marching-squares, bilinear-interpolation, contour, vitest-browser, heatmap]

requires:
  - phase: 06-heatmap-design-pass
    plan: 01
    provides: "src/colorscale/value-to-color.ts (valueToColor, rampPositionFor), src/data/sweep-fixture-format.ts (SweepFixture, CELL_FLAG_RUINED/INCOMPLETE), the committed sweep-fixture.bin, mockups/shared/mockup-runtime.ts (mountMockup/renderLegend/renderCaveat/makeHatchPattern), mockups/forms/form-1-dense-grid.ts (paintDenseGrid, fieldRect, cellDisplayCenter), bench/heatmap-repaint.bench.test.ts (the run's one PERF-05 MeasurementRow)"
provides:
  - "mockups/shared/field-sampler.ts (resampleField, sampleField, bandIndexFor, BAND_LEVELS, CategoricalMask -- dependency-free bilinear resample + band quantisation, DOM-free)"
  - "mockups/shared/iso-lines.ts (marchingSquaresSegments, IsoSegment -- dependency-free unstitched marching-squares emitter with mean-of-corners saddle disambiguation)"
  - "form 2 of 4 (filled contour / pork-chop plot) rendering the real fixture end to end under vite dev"
  - "form 4 of 4 (grid + sparse contour overlay) reusing form 1's base layer verbatim"
  - "bench/heatmap-form-2.bench.test.ts and bench/heatmap-form-4.bench.test.ts (criterion 4 info-line arms, no second PERF-05 MeasurementRow)"
affects: [06-04, 06-05, 06-06, phase-7-heatmap-implementation]

actuals:
  tokens: 20300
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Per-pixel bilinear field resampling with a hard categorical (ruined/incomplete) override and a total nearest-cell tie rule, quantised into an even band count so a domain-centred threshold (breakeven) always lands on a band edge rather than inside one"
    - "Unstitched marching-squares segment emission via edge-crossing counting (0/2/4 crossings) rather than a literal 16-case lookup table, with the standard mean-of-corners saddle disambiguation for the two ambiguous (checkerboard) cases"
    - "Contour annotation passes run marching squares over the field's own RAMP-POSITION values (not raw metric values), the identical space the bilinear base pass quantises in, so a stroked boundary always registers exactly against the base pass's own visible band edge"

key-files:
  created:
    - .planning/phases/06-heatmap-design-pass/mockups/shared/field-sampler.ts
    - .planning/phases/06-heatmap-design-pass/mockups/shared/iso-lines.ts
    - .planning/phases/06-heatmap-design-pass/mockups/forms/form-2-filled-contour.ts
    - .planning/phases/06-heatmap-design-pass/mockups/form-2-filled-contour.html
    - .planning/phases/06-heatmap-design-pass/mockups/forms/form-4-grid-with-contour.ts
    - .planning/phases/06-heatmap-design-pass/mockups/form-4-grid-with-contour.html
    - bench/heatmap-form-2.bench.test.ts
    - bench/heatmap-form-4.bench.test.ts
    - tests/field-sampler.test.ts
    - tests/iso-lines.test.ts
  modified: []

key-decisions:
  - "BAND_LEVELS built as eleven evenly spaced ramp-position boundaries (step 0.1, ten bands): an EVEN band count is what places rampPositionFor(1.0) == 0.5 (breakeven) on a boundary for free, with no separate 'insert 0.5' step needed"
  - "sampleField's categorical nearest-cell search is restricted to the stencil's CATEGORICAL corners only (not all four corners): a single categorical corner always wins regardless of distance to any plain neighbour, matching the plan's 'never blended with a valued neighbour' requirement; the row-then-column tie rule applies only when choosing between two DIFFERENT categorical corners"
  - "Form 2's and form 4's annotation passes run marchingSquaresSegments over rampPositionFor(value) arrays, using BAND_LEVELS values directly as levels -- not the raw metric arrays with an inverse-transformed threshold -- so a stroked boundary always lands exactly on the base pass's own band edge rather than merely close to it (the two passes interpolate in the same space)"
  - "Form 4's RUIN_ADJACENT_LEVEL read as BAND_LEVELS[1] (0.1, the boundary bordering the lowest band), not BAND_LEVELS[0] (0.0, the domain's own clamp floor): the latter would only ever cross where a cell is clamped to the domain minimum, which the committed fixture's real data never reaches"
  - "resampleField's cached buffer typed as Uint8ClampedArray<ArrayBuffer> (not the bare Uint8ClampedArray TypeScript 5.7+ treats as generic over ArrayBufferLike), required for `new ImageData(buffer, ...)` to typecheck"

requirements-completed: [VIZ-05, VIZ-07, VIZ-10]

coverage:
  - id: D1
    description: "field-sampler.ts and iso-lines.ts: dependency-free, DOM-free bilinear resample + categorical override + band quantisation, and unstitched marching-squares segment emission with saddle disambiguation"
    verification:
      - kind: unit
        ref: "tests/field-sampler.test.ts, tests/iso-lines.test.ts (24 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Form 2 (filled contour / pork-chop plot): smooth curved bands from the real fixture, breakeven boundary emphasised, real caveat/legend, PERF-05 gated"
    requirement: VIZ-10
    verification:
      - kind: integration
        ref: "npx vitest run --project bench bench/heatmap-form-2.bench.test.ts (equivalence + PERF-05 measurement, 11.55ms normalized)"
        status: pass
      - kind: automated_ui
        ref: "Playwright screenshot + DOM text assertion against http://localhost:5183/.planning/phases/06-heatmap-design-pass/mockups/form-2-filled-contour.html (light and dark, zero console errors)"
        status: pass
    human_judgment: true
    rationale: "The plan's own <verify><human-check> calls for a human to confirm the bands read as smooth curved regions with a visible breakeven boundary, the caveat reads in full, and the panel survives a theme toggle. AUTO_CHAIN/AUTO_CFG both resolved false (interactive mode) at execution time, so per the tracer feedback gate this would ordinarily halt for a live human checkpoint; in this parallel worktree dispatch (plan frontmatter autonomous:true, project config mode:yolo) no interactive channel was available, matching 06-01-SUMMARY.md's own precedent. Substituted an automated-but-visual proxy (Playwright screenshots inspected directly, DOM text assertions for caveat/legend copy, zero console/page errors) and proceeded. Flagged here so a human reviewer can spot-check the rendered page."
  - id: D3
    description: "Form 4 (grid + sparse contour overlay): form 1's dense grid reused verbatim, exactly two iso-lines stroked on top (breakeven, ruin-adjacent boundary), PERF-05 gated"
    requirement: VIZ-10
    verification:
      - kind: integration
        ref: "npx vitest run --project bench bench/heatmap-form-4.bench.test.ts (equivalence + PERF-05 measurement, 0.70ms normalized)"
        status: pass
      - kind: automated_ui
        ref: "Playwright screenshot + DOM text assertion against http://localhost:5184/.planning/phases/06-heatmap-design-pass/mockups/form-4-grid-with-contour.html (light and dark, zero console errors)"
        status: pass
    human_judgment: true
    rationale: "Same tracer-feedback-gate / parallel-worktree conflict as D2 above. Substituted the identical automated-but-visual proxy and proceeded. Flagged here so a human reviewer can spot-check the two iso-lines read clearly over the dense field without obscuring cell magnitude."

duration: 20min
completed: 2026-08-21
status: complete
---

# Phase 6 Plan 03: Filled Contour and Grid+Contour Forms Summary

**Forms 2 and 4 of the four competing D-02 heatmap forms -- the pork-chop plot (smooth filled iso-contour bands) and the hybrid grid+sparse-contour-overlay -- both painting the real committed 200x50 sweep fixture through two new dependency-free, DOM-free rendering primitives (bilinear field resampling and unstitched marching squares), both measured well inside PERF-05's 16ms repaint budget.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-21T06:11Z (approx)
- **Completed:** 2026-08-21T06:31:51Z
- **Tasks:** 3
- **Files modified:** 10 (10 new files, 0 modified)

## Accomplishments

- `mockups/shared/field-sampler.ts`: bilinear resample of the fixture's own `multiples`/`drawdowns` array at DISPLAY resolution, with a hard categorical (ruined/incomplete) override -- any display pixel whose bilinear stencil touches a flagged cell takes that cell's categorical colour with no blending, resolved by a total nearest-categorical-corner tie rule (lower row, then lower column) -- and quantisation into `BAND_LEVELS`' ten bands (an even count, so breakeven's own ramp position, exactly 0.5, always lands on a band edge). Zero imports outside `src/`, no DOM.
- `mockups/shared/iso-lines.ts`: unstitched marching-squares segment emitter via edge-crossing counting (0/2/4 crossings per cell, never a literal 16-row table) with the standard mean-of-corners saddle disambiguation for the two ambiguous (checkerboard) cases -- verified directly against two hand-computed worked examples (one for each disambiguation direction) and confirmed load-bearing by temporarily disabling the branch and observing the expected test failure, then restoring it.
- `mockups/forms/form-2-filled-contour.ts` + `.html`: form 2 of 4 (filled contour, the pork-chop plot PROJECT.md records as the owner's own stated intuition). Base pass paints `resampleField`'s output directly via one `putImageData` (no upscale step needed -- `resampleField` already resamples at display resolution). Annotation pass strokes all eleven `BAND_LEVELS` boundaries via `marchingSquaresSegments` run over the field's ramp-position values (the same space the base pass quantises in, so strokes register exactly against the painted bands); breakeven emphasised at 2px `var(--color-text)`, other boundaries 1px `var(--color-border)`. Ruin hatch and axis labels match form 1's own convention.
- `mockups/forms/form-4-grid-with-contour.ts` + `.html`: form 4 of 4 (the hybrid position). Reuses form 1's `paintDenseGrid` verbatim for the base layer (cells, ruin hatch, axis labels), then strokes exactly two iso-lines on top: breakeven (2px `var(--color-text)`) and the ruin-adjacent region's boundary at `BAND_LEVELS[1]` (1.5px `var(--color-destructive)`) -- two lines, not ten, so the "contour as sparse annotation" position is genuinely tested rather than restating form 2. `FORM_4_GEOMETRY` is numerically identical to `FORM_1_GEOMETRY` by design, so the comparison measures the annotation's own value, not a geometry difference.
- `bench/heatmap-form-2.bench.test.ts` and `bench/heatmap-form-4.bench.test.ts`: each proves paint equivalence against a known-good reference (form 2 against `resampleField`'s own output at the field's extreme corner pixels; form 4 against `valueToColor`'s own output at the fixture's extreme cells, mirroring form 1's own convention) before trusting any timing, then measures a metric-toggle repaint and records an info line only (never a second `PERF-05` `MeasurementRow` -- form 1 already owns the run's one row). Measured **11.55ms normalized** (form 2, batch size 50) and **0.70ms normalized** (form 4, batch size 200) against the 16ms budget, on this dev sandbox (9 logical cores, Linux aarch64 container, calibration score ~0.61-0.62 -- not the D-17 CI baseline).

## Task Commits

Each task was committed atomically:

1. **Task 1: The two shared rendering primitives** - `97ea31d` (test)
2. **Task 2: Form 2, filled iso-contour bands** - `97fc381` (feat)
3. **Task 3: Form 4, dense grid with a contour overlay** - `e17f30c` (feat)

## Files Created/Modified

- `.planning/phases/06-heatmap-design-pass/mockups/shared/field-sampler.ts` - bilinear resample, categorical override, band quantisation
- `.planning/phases/06-heatmap-design-pass/mockups/shared/iso-lines.ts` - unstitched marching-squares segment emitter
- `.planning/phases/06-heatmap-design-pass/mockups/forms/form-2-filled-contour.ts` - form 2's own geometry and paint function
- `.planning/phases/06-heatmap-design-pass/mockups/form-2-filled-contour.html` - form 2's plain-HTML entry point
- `.planning/phases/06-heatmap-design-pass/mockups/forms/form-4-grid-with-contour.ts` - form 4's own geometry and paint function
- `.planning/phases/06-heatmap-design-pass/mockups/form-4-grid-with-contour.html` - form 4's plain-HTML entry point
- `bench/heatmap-form-2.bench.test.ts` - criterion 4's form-2 arm
- `bench/heatmap-form-4.bench.test.ts` - criterion 4's form-4 arm
- `tests/field-sampler.test.ts` - unit coverage for the bilinear resample primitive
- `tests/iso-lines.test.ts` - unit coverage for the marching-squares primitive

## Decisions Made

- **`BAND_LEVELS` built from an even band count (ten), not an explicit inserted boundary.** Eleven evenly spaced ramp-position values at step 0.1 naturally include 0.5 -- breakeven's own ramp position -- so no special-cased "insert breakeven" logic is needed; choosing an even band count is the whole mechanism.
- **Categorical nearest-cell search restricted to categorical corners only.** A single categorical corner in a stencil always wins regardless of its distance to a plain neighbour (matching "never blended with a valued neighbour"); the row-then-column tie rule applies only when choosing between two DIFFERENT categorical corners in the same stencil, not between a categorical and a plain one. Verified by two explicit tests, including one that swaps which flag sits at which position to prove the rule is positional, not flag-priority.
- **Both contour forms' annotation passes run marching squares over ramp-position values, using `BAND_LEVELS` directly as levels**, rather than over raw metric values with an inverse-transformed threshold. Since the base pass's own band quantisation interpolates ramp positions (not raw values), running the annotation pass in the same space is what makes a stroked boundary land exactly on the base pass's own visible band edge rather than merely near it.
- **Form 4's `RUIN_ADJACENT_LEVEL` read as `BAND_LEVELS[1]` (0.1), not `BAND_LEVELS[0]` (0.0).** The plan's "lowest band edge" is ambiguous between the lowest band's own two edges; `BAND_LEVELS[0]` is the domain's raw clamp floor, which the real committed fixture's data never touches (per 06-01-SUMMARY.md's own measured `minMultiple=0.01115`, above the 0.01x floor), so a contour there would draw nothing. `BAND_LEVELS[1]` is the boundary that actually separates the near-total-loss band from the rest of the outcome space and produces real, visible segments over the committed fixture.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `resampleField`'s buffer typed as `Uint8ClampedArray<ArrayBuffer>`**
- **Found during:** Task 2, `npm run typecheck`
- **Issue:** TypeScript 5.9's DOM lib types typed arrays as generic over `ArrayBufferLike`; a bare `Uint8ClampedArray` annotation on `field-sampler.ts`'s cached buffer resolved to `Uint8ClampedArray<ArrayBufferLike>`, which `new ImageData(buffer, ...)` (declared to accept only `ArrayBuffer`-backed data) rejected
- **Fix:** Annotated the cached buffer and `resampleField`'s own return type as `Uint8ClampedArray<ArrayBuffer>`, matching what `new Uint8ClampedArray(length)` actually constructs
- **Files modified:** `.planning/phases/06-heatmap-design-pass/mockups/shared/field-sampler.ts`
- **Verification:** `npm run typecheck` exits 0; `tests/field-sampler.test.ts` and both contour forms' bench equivalence tests still pass
- **Committed in:** `97fc381` (Task 2 commit, alongside form 2 since that is where the typecheck failure surfaced)

---

**Total deviations:** 1 auto-fixed (Rule 3 -- blocking type error, no behaviour change)
**Impact on plan:** Type-annotation fix only; no runtime behaviour changed. No scope creep.

## Issues Encountered

- **My first "linear in the fractional column, to within 1e-9" unit test failed** because it compared `sampleField`'s bilinearly-interpolated ramp position against an idealized closed-form value, but `SweepFixture.multiples` is a `Float32Array` (the real committed format's own field type) -- storing the test's exponentially-spaced construction values in float32 introduces ~1e-7-relative rounding the idealized formula doesn't carry. Fixed by computing the test's expected value from the ACTUAL stored (float32-rounded) corner values via manual bilinear interpolation, which correctly isolates `sampleField`'s own arithmetic (provably linear to double precision) from the unrelated, unavoidable float32-storage rounding of the input data.
- **My first "removing the saddle-disambiguation branch breaks the endpoint-pairing test" attempt was wrong.** I initially tried to prove this via a radially symmetric field's closed-contour endpoint-degree-count invariant, but empirically confirmed (via a throwaway probe script) that a convex field like squared-distance never produces a single checkerboard/saddle cell at any tested radius -- and even where a saddle cell WOULD occur, a wrong pairing choice still leaves every crossing point's global usage count at exactly 2 (both valid pairings are perfect matchings of the same four points), so a pure degree-count check can never distinguish correct from naive disambiguation. Replaced with two precise, hand-computed single-cell worked examples (one per disambiguation direction) asserting the exact emitted segment endpoints; manually verified per the plan's own acceptance criterion by temporarily hardcoding the branch to always choose one pairing, confirming one of the two worked-example tests failed as expected, then restoring the real logic.
- **`npm run test` and `npm run bench` (run as isolated single files) both require a fresh `npm run build`** for pre-existing gates (`tests/app/static-build.test.ts`, `bench/perf-07/08.bench.test.ts`) unrelated to this plan's own files -- confirmed pre-existing per 06-01-SUMMARY.md's own identical note. Built once, `npm run test` went fully green (680/680), then `dist/` was removed again (it is gitignored) before the final commit so no build artifact entered git history.
- **Tracer feedback gate vs. parallel worktree dispatch**, identical situation to 06-01-SUMMARY.md: `AUTO_CHAIN`/`AUTO_CFG` both resolved `false`, but this plan's own frontmatter declares `autonomous: true` and the project config's `mode` is `"yolo"`, with no live human channel available in this parallel worktree dispatch. Substituted an automated-but-visual proxy (headless-Chromium Playwright screenshots inspected directly, DOM text assertions, zero-console-error checks) for both forms' `<human-check>` verification points and proceeded. Flagged in the `coverage:` block above (D2, D3) so a human reviewer can spot-check the rendered pages.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Two of the four competing D-02 forms now exist as full-scale, real-data, judgeable mockups (forms 2 and 4), alongside form 1 from plan 06-01. Form 3 (small multiples) remains for a later plan in this wave.
- Both new shared primitives (`field-sampler.ts`, `iso-lines.ts`) are designed for reuse: any future form needing bilinear resampling, band quantisation, or iso-line annotation can import them unchanged.
- `bench/heatmap-form-2.bench.test.ts` and `bench/heatmap-form-4.bench.test.ts`'s file-header comments already state the convention any further contour-based form must follow: its own info line, asserted locally against the same 16ms budget, never a second `PERF-05` `MeasurementRow`.
- No blockers. One open methodological note carried forward from 06-01 (still true here): the committed fixture's `ruinedCount=0`, so the D-18 hatch is unit-tested and legend-rendered in both new forms but has no in-field region to judge visually in either -- a measured fact about the fixture's real data, not a defect in this plan's own deliverables.

---
*Phase: 06-heatmap-design-pass*
*Completed: 2026-08-21*

## Self-Check: PASSED

All 11 files listed above (10 deliverables + this SUMMARY) confirmed present on disk via `ls`. All 3 task commit hashes (`97ea31d`, `97fc381`, `e17f30c`) confirmed present via `git log --oneline --all`.
