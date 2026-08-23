---
phase: 07-sweep-engine-and-the-heatmap
plan: 02
subsystem: viz
tags: [colorscale, oklab, colourblind, heatmap, field-sampler]

requires:
  - phase: 07-sweep-engine-and-the-heatmap
    plan: "07-01"
    provides: "src/heatmap/field-sampler.ts (graduated), src/sweep/sweep-grid.ts's SweepGrid.annualized field"
provides:
  - "src/colorscale/value-to-color.ts: buildRampInterpolator, SEQUENTIAL_RAMP_STOPS, interpolateSequentialRamp, SweepMetric, scaleTypeForMetric, DRAWDOWN_DOMAIN_MIN/MAX, ANNUALIZED_DOMAIN_MIN/MAX, rampPositionForMetric, bandLevelsForMetric, emphasizedBandLevelFor, legendTicksForMetric -- the per-metric colour-authority routing every later Phase 7 plan (metric toggle, legend) consumes"
  - "src/heatmap/field-sampler.ts: FieldSource (SweepFixture + optional annualized), Metric widened to SweepMetric, resampleField/sampleField routed by metric"
affects: [07-03, 07-04, 07-05, 07-06, 07-07, 07-08, 07-09, 07-10]

actuals:
  tokens: 12651
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "value-to-color.ts's one deliberate import exception: src/metrics/format.ts (itself zero-imports, not a framework) so every legend tick label routes through the project's single formatting contract, never a second inline formatter"
    - "A private constant duplicated across a module boundary (MULTIPLE_BAND_MULTIPLES in value-to-color.ts, mirroring field-sampler.ts's own BAND_MULTIPLES) is the deliberate alternative to a circular import when two modules both need the same round numbers and one already imports from the other"

key-files:
  modified:
    - src/colorscale/value-to-color.ts
    - src/heatmap/field-sampler.ts
    - tests/value-to-color.test.ts
    - tests/color-scale-cvd.test.ts
    - tests/field-sampler.test.ts

key-decisions:
  - "buildRampInterpolator promoted to primary per the plan's own assumption-delta decision: interpolateRamp is now one instantiation of it, not a parallel second interpolator bolted on alongside a still-primary interpolateRamp"
  - "The UI-SPEC's recommended SEQUENTIAL_RAMP_STOPS passed both measured bars (VIZ-07 perceptual-step ratio ~1.34 against a 2.5 ceiling; colourblind-safety floor ~3.86 min adjacent delta E against a 3.0 floor) on the first measurement -- no stop moved"
  - "bandIndexFor gained an optional levels parameter defaulting to BAND_LEVELS rather than a new function, so every existing single-argument call site (this module's own pre-refactor tests included) keeps its exact prior behaviour untouched"

patterns-established:
  - "Per-metric routing lives entirely in value-to-color.ts (the colour authority); field-sampler.ts and any future renderer never choose a ramp, a domain, or a band-boundary array themselves"

requirements-completed: [VIZ-03]

coverage:
  - id: D25
    description: "Max drawdown never renders through the diverging ramp; the sequential ramp clears the same measured perceptual-uniformity ceiling and colourblind-safety floor the diverging ramp does"
    requirement: VIZ-03
    verification:
      - kind: unit
        ref: "tests/value-to-color.test.ts -- interpolateSequentialRamp differs from interpolateRamp at t=0.25/0.5/0.75; 33-sample perceptual-step ratio <= 2.5"
        status: pass
      - kind: unit
        ref: "tests/color-scale-cvd.test.ts -- sequential-ramp adjacent-pair delta E >= 3.0 under all three simulated CVD deficiencies, categorical distance >= 10.0 from INCOMPLETE_RGBA and RUIN_BASE_RGBA"
        status: pass
    human_judgment: false
  - id: D26
    description: "All three metrics have fixed, stated, clipped domains and round-number contour boundaries, never fitted to a sweep's own data range"
    requirement: VIZ-03
    verification:
      - kind: unit
        ref: "tests/value-to-color.test.ts -- rampPositionForMetric(1.0,'multiple'), rampPositionForMetric(0,'annualized') exactly 0.5; rampPositionForMetric(0,'drawdown') exactly 0; out-of-domain values clamp"
        status: pass
      - kind: unit
        ref: "tests/value-to-color.test.ts, tests/field-sampler.test.ts -- bandLevelsForMetric strictly ascending, starts at 0 ends at 1, for all three metrics"
        status: pass
    human_judgment: false
  - id: D3
    description: "field-sampler.ts's resampleField/sampleField sample the correct array and colour through the correct ramp per metric, with no per-pixel ramp/domain selection"
    verification:
      - kind: unit
        ref: "tests/field-sampler.test.ts -- a drawdown field samples through the sequential ramp and a multiple field through the diverging one at the same numeric value; drawdown boundary tie rule matches the multiple metric's own rule"
        status: pass
      - kind: other
        ref: "npm run typecheck (whole repo, including the four unmodified Phase 6 mockup form files)"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-08-23
status: complete
---

# Phase 07 Plan 02: Per-Metric Colour Scale Summary

**Max drawdown and annualized return each get their own colour domain and ramp -- a sequential violet family for drawdown (no midpoint, D-25), the same diverging blue-orange family symmetric about 0%/yr for annualized -- routed entirely through `value-to-color.ts`, which is now the sole authority `field-sampler.ts` defers to for every per-metric decision.**

## Performance

- **Duration:** ~20min
- **Completed:** 2026-08-23
- **Tasks:** 3
- **Files modified:** 5 (`src/colorscale/value-to-color.ts`, `src/heatmap/field-sampler.ts`, `tests/value-to-color.test.ts`, `tests/color-scale-cvd.test.ts`, `tests/field-sampler.test.ts`)

## Accomplishments

- Extracted `interpolateRamp`'s body into `buildRampInterpolator(stops)`, a factory that precomputes its Oklab stop table once at factory-call time; `interpolateRamp` is now `buildRampInterpolator(RAMP_STOPS)`, proven byte-identical to its pre-refactor output at seven fixed points and 33 evenly spaced samples. `buildRampInterpolator` throws, naming the offending value, on a malformed stops array.
- Added `SEQUENTIAL_RAMP_STOPS` (D-25), the 07-UI-SPEC.md recommended single-hue violet stops for max drawdown, and `interpolateSequentialRamp`, the second `buildRampInterpolator` instantiation. Measured (not assumed) against both bars before committing: 33-sample Oklab perceptual-step ratio ~1.34 (ceiling 2.5, VIZ-07) and minimum adjacent CIE76 delta E ~3.86 under the worst simulated colour-vision deficiency (floor 3.0) -- no stop moved from the UI-SPEC's recommended values.
- Added `SweepMetric`, `scaleTypeForMetric`, the three fixed per-metric domains (`DRAWDOWN_DOMAIN_MIN/MAX` at 0/0.8, `ANNUALIZED_DOMAIN_MIN/MAX` at -0.3/0.3), `rampPositionForMetric` (routes to the existing symlog transform for `multiple`, linear normalization for the other two, always clamped), `bandLevelsForMetric` (round-number contour boundaries per metric), `emphasizedBandLevelFor`, and `legendTicksForMetric` (every numeric label routed through `src/metrics/format.ts`).
- Routed `field-sampler.ts`'s `resampleField`/`sampleField` entirely by metric: `Metric` widened to `SweepMetric` (kept as an alias so the module's own exported name is unchanged), `FieldSource` adds an optional `annualized` array, and the per-cell ramp cache, band-boundary lookup, and band colour cache now all resolve through `value-to-color.ts` once per call rather than per pixel.

## Task Commits

Each task was committed atomically:

1. **Task 1: Parameterize the ramp interpolator without changing a single existing output** - `1eb57bd` (feat)
2. **Task 2: Add the sequential drawdown ramp and the three fixed per-metric domains** - `1115473` (feat)
3. **Task 3: Route the field sampler by metric instead of by a two-value union** - `338e4ac` (feat)

## Files Created/Modified

- `src/colorscale/value-to-color.ts` - `buildRampInterpolator`, `SEQUENTIAL_RAMP_STOPS`, `interpolateSequentialRamp`, `SweepMetric`, `scaleTypeForMetric`, `DRAWDOWN_DOMAIN_MIN/MAX`, `ANNUALIZED_DOMAIN_MIN/MAX`, `rampPositionForMetric`, `bandLevelsForMetric`, `emphasizedBandLevelFor`, `legendTicksForMetric`
- `src/heatmap/field-sampler.ts` - `FieldSource`, `Metric` widened to an alias of `SweepMetric`, `valuesForMetric`, `getBandColors`, `bandIndexFor` gains an optional `levels` parameter
- `tests/value-to-color.test.ts` - equivalence/throw assertions for `buildRampInterpolator`, sequential-ramp endpoint/separation/perceptual-uniformity tests, `rampPositionForMetric`/`bandLevelsForMetric`/`scaleTypeForMetric` assertions
- `tests/color-scale-cvd.test.ts` - sequential-ramp adjacent-pair and categorical-distinctness CVD assertions
- `tests/field-sampler.test.ts` - cross-metric colour-routing assertion, `bandLevelsForMetric('drawdown')` ascending/tie-rule assertions

## Decisions Made

- **`buildRampInterpolator` promoted to primary**, per the plan's own assumption-delta decision: `interpolateRamp` is one instantiation of it, not a second parallel interpolator bolted alongside a still-primary `interpolateRamp`. This keeps the next metric that needs a third ramp family from facing the same refactor again.
- **The UI-SPEC's recommended `SEQUENTIAL_RAMP_STOPS` passed both measured bars on the first measurement** -- no interior stop needed to move. Measured, not assumed: see the module header comment and the two dedicated test files for the exact figures.
- **`bandIndexFor` gained an optional `levels` parameter defaulting to `BAND_LEVELS`**, rather than a new function name, so every existing single-argument call site (this module's own pre-refactor tests included) keeps its exact prior behaviour with zero edits to those assertions.
- **`MULTIPLE_BAND_MULTIPLES` is duplicated (not imported) in `value-to-color.ts`**, mirroring `field-sampler.ts`'s own private `BAND_MULTIPLES` -- `value-to-color.ts` has a near-zero-imports design (one deliberate exception below) and `field-sampler.ts` already imports FROM `value-to-color.ts`, so importing back would create a cycle. Both arrays produce byte-identical ramp positions via the same `rampPositionFor`.
- **`value-to-color.ts` gains one deliberate import**: `src/metrics/format.ts` (itself zero-imports, not a UI framework), so `legendTicksForMetric`'s labels route through the project's single formatting contract rather than a second inline formatter, per the plan's explicit instruction.

## Deviations from Plan

None - plan executed exactly as written. The plan's own `<planner_assumptions>` (the `ANNUALIZED_DOMAIN_MIN/MAX` magnitude and the per-metric band boundary values) were implemented exactly as specified and flagged there for review, not altered here.

## Issues Encountered

None. The recommended sequential-ramp stops passed both measured thresholds on the first attempt, so no stop-adjustment iteration was needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `src/colorscale/value-to-color.ts` is now the complete per-metric colour authority (`scaleTypeForMetric`, `rampPositionForMetric`, `bandLevelsForMetric`, `emphasizedBandLevelFor`, `legendTicksForMetric`) that plan 07-06 (metric toggle wiring) and plan 07-08 (legend) consume directly rather than re-deriving.
- `src/heatmap/field-sampler.ts`'s `resampleField`/`sampleField` already accept `'annualized'` as a valid metric against a `SweepGrid` (which always carries the array); no signature change is needed when 07-06 wires the toggle.
- `paint-contour.ts` was not modified by this plan (out of its `files_modified` scope) and still imports `BAND_LEVELS`/`Metric` from `field-sampler.ts` unchanged -- it continues to compile and paint the `multiple`/`drawdown` metrics exactly as before; wiring `annualized` end-to-end through the canvas renderer (breakeven emphasis, band strokes) is 07-06's territory, not this plan's.
- No blockers.

## Self-Check: PASSED

All 5 files this plan modified are tracked (`git status --short` shows a clean tree with no untracked files). All 3 commit hashes this SUMMARY cites (`1eb57bd`, `1115473`, `338e4ac`) are present in `git log`.

---
*Phase: 07-sweep-engine-and-the-heatmap*
*Completed: 2026-08-23*
