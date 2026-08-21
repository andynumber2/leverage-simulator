---
phase: 06-heatmap-design-pass
plan: 02
subsystem: ui
tags: [colorscale, colorblind, cvd, cie-lab, oklab, vitest-unit]

requires:
  - phase: 06-heatmap-design-pass
    provides: "06-01: src/colorscale/value-to-color.ts (RAMP_STOPS, INCOMPLETE_RGBA, valueToColor, DOMAIN_LOG_MIN/MAX)"
provides:
  - "tests/color-scale-cvd.test.ts: a live D-17 colourblind legibility check running in the unit project on every npm run test"
  - "srgbToLab/deltaE76 (CIE76) reference implementation, verified against known Lab reference points"
  - "Vienot 1999 protanopia/deuteranopia/tritanopia simulation matrices, transcribed and verified directly from github.com/DaltonLens/libDaltonLens's actual source this session"
affects: [06-03, 06-04, 06-05, 06-06, phase-7-heatmap-implementation]

actuals:
  tokens: 3331
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Live CVD-simulation assertion as the entire evidence for a colourblind-safety success criterion, instead of a committed screenshot (D-17)"
    - "Band-centre sampling of a continuous colour ramp by inverting its own symlog transform, so a legibility check exercises the bands a reader actually sees"

key-files:
  created:
    - tests/color-scale-cvd.test.ts
  modified: []

key-decisions:
  - "Task 1's check passed against the existing RAMP_STOPS/INCOMPLETE_RGBA on the first run. Per the plan's own Task 2 instruction ('If Task 1's check passes on the first run, change nothing and record that fact'), no palette change was made. Verified the check is a real gate, not vacuously passing, by temporarily collapsing one RAMP_STOPS quarter stop into its neighbour's hex value and confirming 5 of 15 tests failed, then restoring the original value (git diff clean afterward)."
  - "The behaviour spec's 'saturated red and saturated green confuse under deuteranopia within deltaE76 15' assertion uses (200,50,50)/(50,160,50), not the two most extreme sRGB primaries (255,0,0)/(0,255,0). Computed by hand and verified numerically: pure primaries differ so much in CIE Y luminance (0.213 vs 0.715) that even fully confused under the real Vienot 1999 matrix they remain ~deltaE76 30 apart, not <15 — a luminance-driven separation the matrix genuinely preserves, not a simulation defect. Two comparably-saturated, closer-luminance swatches (still far apart pre-simulation, deltaE76 ~112) collapse to ~7 under deuteranopia, which is the actual confusion pattern the design-guidance literature describes and what the assertion is meant to demonstrate. This number is not one of the plan's three locked constants (CVD_BAND_COUNT, MIN_ADJACENT_DELTA_E, MIN_CATEGORICAL_DELTA_E), so choosing a demonstrative pair and a threshold that is actually true was in scope."
  - "CVD_MATRICES coefficients fetched live from github.com/DaltonLens/libDaltonLens's actual libDaltonLens.c this session (network access confirmed available), not transcribed from memory or a secondary source — sourced from the dl_vienot_{protan,deutan,tritan}_rgbCvd_from_rgb arrays in dl_simulate_cvd_vienot1999, which libDaltonLens's own comments confirm collapse the full sRGB->LMS->project->LMS->sRGB Vienot 1999 pipeline into one 3x3 linearRGB-space matrix multiply."

requirements-completed: [VIZ-05, VIZ-07, VIZ-10]

coverage:
  - id: D1
    description: "tests/color-scale-cvd.test.ts: live D-17 colourblind legibility check — 16-band adjacent separability and incomplete-hold categorical distinctness under protanopia/deuteranopia/tritanopia simulation and under no simulation, at fixed pre-tested thresholds"
    requirement: VIZ-07
    verification:
      - kind: unit
        ref: "npx vitest run --project unit tests/color-scale-cvd.test.ts (15/15 pass)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Palette resolution: existing RAMP_STOPS/INCOMPLETE_RGBA from 06-01 pass the CVD check unchanged; no palette edit needed or made"
    requirement: VIZ-07
    verification:
      - kind: unit
        ref: "npm run test (671/671 pass, includes color-scale-cvd.test.ts, value-to-color.test.ts, sweep-fixture-format.test.ts)"
        status: pass
      - kind: other
        ref: "npm run typecheck (exit 0)"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-08-21
status: complete
---

# Phase 6 Plan 02: The Colourblind Legibility Assertion Summary

**A live CIE76/Vienot-1999 colourblind-simulation test in `tests/color-scale-cvd.test.ts`, sourced directly from libDaltonLens's real source, is the entire evidence for success criterion 2's colourblind requirement — and the existing Phase 6-01 palette passes it unchanged.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-21T06:04:00Z (approx)
- **Completed:** 2026-08-21T06:16:00Z
- **Tasks:** 2
- **Files modified:** 1 (new file)

## Accomplishments

- `tests/color-scale-cvd.test.ts`: 15 tests covering `srgbToLab`/`deltaE76` reference correctness (pure white L*100, mid grey #808080 L*~53.6), `simulateCvd` achromatic identity, a genuine deuteranopia red/green confusion demonstration, 16-band adjacent-pair separability (>=3.0 deltaE76) under no simulation and all three dichromacies, `INCOMPLETE_RGBA`'s categorical distinctness (>=10.0 deltaE76) from every band under all three dichromacies, and the ramp's lightness range (>=20 L*).
- CVD simulation matrices fetched live from `github.com/DaltonLens/libDaltonLens`'s actual `libDaltonLens.c` this session, not transcribed from memory — the exact `dl_vienot_{protan,deutan,tritan}_rgbCvd_from_rgb` precomputed 3x3 matrices.
- Confirmed the check is a real gate: temporarily collapsing `RAMP_STOPS`'s `t=0.25` stop into its neighbour's hex value made 5 of 15 tests fail (adjacent-pair separability under tritanopia, and incomplete-grey separability under tritanopia); restored afterward with a clean `git diff`.
- The existing palette from 06-01 (`RAMP_STOPS`, `INCOMPLETE_RGBA`) passed on the first real run — no palette change was required or made. Worst observed adjacent-pair distance: **deltaE76 4.12** (band pair 3-4, under tritanopia) against the 3.0 floor. Worst observed incomplete-vs-band distance: **deltaE76 15.13** (band 6, under tritanopia) against the 10.0 floor. Ramp L* range: **28.6** against the 20 floor.

## Task Commits

Each task was committed atomically:

1. **Task 1: The colourblind legibility assertion** - `29dcd0d` (test)
2. **Task 2: Resolve any palette failure by changing the palette** - no commit (no code change required; Task 1's check passed on the first run against the existing 06-01 palette, so per the task's own instruction nothing was adjusted)

## Files Created/Modified

- `tests/color-scale-cvd.test.ts` - live D-17 colourblind legibility check (new file, 281 lines)

## Decisions Made

- **No palette change required.** `RAMP_STOPS` and `INCOMPLETE_RGBA` are unchanged from 06-01. Recorded per Task 2's explicit instruction not to adjust the stops to gain margin when the check already passes.
- **Demonstrative red/green pair for the "not a no-op" sanity check** chosen as `(200,50,50)`/`(50,160,50)` rather than the sRGB primaries — see `key-decisions` above for the numeric reasoning (pure primaries remain ~deltaE76 30 apart even fully confused, due to their large real luminance difference, which the matrix correctly preserves).
- **CVD matrix coefficients verified against the live upstream source** (network access was available this session) rather than trusted from the research report's prose description, per 06-RESEARCH.md's own Assumption A1 mitigation instruction.

## Deviations from Plan

None - plan executed exactly as written. Task 1's behaviour spec left the exact red/green sample colours and the associated deltaE76 comparison value at the executor's discretion (not one of the plan's three locked constants); the chosen pair and threshold are both empirically true of the real implementation, verified numerically before being asserted.

## Issues Encountered

- `npm run test` and `npm run typecheck` both require a fresh `npm run build` for a pre-existing, unrelated gate (`tests/app/static-build.test.ts`, which fails loudly on a missing `dist/`) — same pre-existing characteristic 06-01-SUMMARY.md already documented. Built once, `npm run test` went fully green (671/671), then `dist/` was removed again before committing so no build artifact entered git history.
- `npx vitest run --project bench bench/heatmap-repaint.bench.test.ts` in isolation exits 1, and the full `npm run bench` suite also exits 1 in this sandbox — both for reasons unrelated to this plan's own file. The isolated-file run reproduces the same pre-existing `assertRunInvariants` PERF-08 sub-budget teardown check 06-01-SUMMARY.md documented (2/2 real assertions in the file itself pass; PERF-05-heatmap-form-1 measured 0.47-0.48ms, well under the 16ms budget, unchanged from 06-01 since no palette edit touched the paint path). The full-suite `npm run bench` run additionally surfaced `PERF-07b` at 18.47ms against its 16ms budget (escalate=yes) — this is an interaction-timing/recompute-attribution budget in code this plan's `<files>` never touches (`src/colorscale/value-to-color.ts`, `tests/color-scale-cvd.test.ts`), consistent with this sandbox's own documented host-noise/hardwareConcurrency variance (WINDOWS.md entry 2, `PERF-07` measurement-band note printed in the same run: +/-13% single-run confidence). Out of scope per the executor's scope-boundary rule (pre-existing failures in files this plan did not touch); not fixed here.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `tests/color-scale-cvd.test.ts` now runs on every `npm run test`, gating any future `RAMP_STOPS`/`INCOMPLETE_RGBA` edit (from 06-03 through 06-06, or Phase 7) against the same fixed thresholds. A palette change that breaks colourblind legibility will fail the build rather than silently shipping.
- The resolved palette values for 06-06's `06-HEATMAP-SPEC.md` are exactly the 06-01 values, unchanged: `RAMP_STOPS = [{t:0.0,'#08519C'},{t:0.25,'#3182BD'},{t:0.5,'#A9A29A'},{t:0.75,'#E6550D'},{t:1.0,'#A63603'}]`, `INCOMPLETE_RGBA = [0x6e,0x73,0x78,255]`.
- No blockers.

---
*Phase: 06-heatmap-design-pass*
*Completed: 2026-08-21*
