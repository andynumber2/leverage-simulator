---
phase: 06-heatmap-design-pass
verified: 2026-08-21T19:25:19Z
status: passed
score: 4/4 roadmap success criteria verified
behavior_unverified: 0
overrides_applied: 0
deferred:
  - truth: "Ruin renders as a categorically distinct hatch, verified visually in a field where ruin actually occurs"
    addressed_in: "Phase 7"
    evidence: "Phase 7 roadmap success criterion 2: 'Ruined cells read as a categorically different thing from the continuous color scale... verified on a 1929-entry high-leverage sweep where ruin genuinely occurs.' Phase 6's own D-09 restricted the fixture to the strict-tier span (1988-2026), in which ruinedCount is 0 by construction (no single day in that window drives a 5x position to zero) -- a fact about the window, not a defect. 06-HEATMAP-SPEC.md Finding C and 06-05-SUMMARY.md both record this honestly as unexercised rather than hiding it."
---

# Phase 6: Heatmap Design Pass Verification

**Phase Goal:** The entry-date x leverage grid has a chosen visual treatment, argued from throwaway
mockups, before anything is implemented against it.
**Verified:** 2026-08-21T19:25:19Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths (ROADMAP.md's four success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | At least three throwaway HTML mockups of the entry-date x leverage grid exist, each rendering a full-scale 10,000-cell grid with plausible data, and one is chosen with the reasons for rejecting the others written down | VERIFIED | Four real forms exist and render a real 200x50 (10,000-cell) field from a committed, decoded fixture: `mockups/forms/form-1-dense-grid.ts`, `form-2-filled-contour.ts`, `form-3-small-multiples.ts`, `form-4-grid-with-contour.ts` (verified by reading each; all import `valueToColor`/`rampPositionFor` from the single shared `src/colorscale/value-to-color.ts`, no duplicated copy -- `grep -n "value-to-color" mockups/forms/*.ts mockups/shared/*.ts`). `mockups/comparison.tsx` (D-05) is a real Solid.js page importing all four paint functions and rendering all eight panels (4 forms x 2 metrics) side by side -- confirmed by reading the file (`FORMS` array, `FormPanel` component). The owner's decision (`form-2-filled-contour` wins) and the three verbatim per-form rejection reasons are recorded in `06-05-SUMMARY.md`'s "Decision: Task 2" section and copied into `06-HEATMAP-SPEC.md` §2. No rejection reason cites implementation cost or a repaint figure (confirmed by reading both documents). |
| 2 | The chosen color treatment is perceptually uniform and colorblind-safe, checked against a simulation of the common color-vision deficiencies, and outcomes spanning orders of magnitude map through a log or otherwise non-linear scale rather than a linear one | VERIFIED | `src/colorscale/value-to-color.ts` implements a symmetric-log (`Math.log10`) diverging scale centred at 1.0x (D-13/D-14), Oklab-interpolated (D-27a) -- read in full, matches spec §3 exactly. `tests/color-scale-cvd.test.ts` is the D-17 live colourblind-legibility check: independently re-run this session, **15/15 tests pass** (`npx vitest run --project unit tests/color-scale-cvd.test.ts`). Thresholds (`MIN_ADJACENT_DELTA_E=3.0`, `MIN_CATEGORICAL_DELTA_E=10.0`, `CVD_BAND_COUNT=16`) are fixed in `06-02-PLAN.md`'s own text before the palette was tested (confirmed by reading the plan), cite a published CIE76 JND figure (Mahy et al. 1994) plus margin, and CVD simulation matrices are sourced from `libDaltonLens`'s real Vienot-1999 transcription (cited inline, not a fabricated stand-in). `npm test` (which includes this file) runs in CI (`.github/workflows/*.yml`: `run: npm test`), so a future palette edit that breaks legibility fails the build. The check is proven non-vacuous: `06-02-SUMMARY.md` documents deliberately breaking one ramp stop and confirming 5/15 tests then failed, before restoring. **Caveat, honestly recorded, not a phase-6 gap:** the ruin hatch's categorical distinctness has only been unit-tested (branch order, hatch geometry), never visually judged in a real field, because `ruinedCount` is 0 in the committed fixture (independently re-decoded this session: `ruined=0, incomplete=2600, minMultiple=0.000381, maxMultiple=84.243, clippedBelow=135, clippedAbove=0` -- matches `06-HEATMAP-SPEC.md` §9 exactly). This is a fact about the 1988-2026 SPX window, not a defect, and is recorded as Finding C in both `06-05-SUMMARY.md` and `06-HEATMAP-SPEC.md` §10 -- see Deferred Items below; Phase 7's own success criterion 2 explicitly picks this up. |
| 3 | The mockups place the overlapping-windows caveat where it will actually be read: visible copy stating the sensitivity-analysis framing, never relegated to a footnote | VERIFIED | `VIZ10_CAVEAT_SENTENCES` (`mockups/shared/mockup-runtime.ts:44-48`) is the exact reframe-then-mechanism two-sentence text D-22 specifies, and never contains the phrase "independent backtests" (confirmed by reading the constant). `renderCaveat` (same file, lines 95-107) renders it as body-size copy (`var(--font-size-body)`, 1.5 line-height, `var(--color-text)`), never smaller or lower-contrast than legend text. Render order confirmed at `mockup-runtime.ts:433-440`: canvas, then caveat container (`renderCaveat`), then legend container (`renderLegend`) -- directly under the grid, above the legend, matching D-21's placement exactly. Every mockup and the comparison page renders the real copy at its own real width (D-23), confirmed by `06-05-SUMMARY.md`'s Playwright verification finding "one byte-identical caveat string across all 8 panels." |
| 4 | Each mockup repaints its 10,000-cell grid on a metric change in under 16ms on real hardware | VERIFIED | Independently re-ran the bench suite this session (`npx vitest run --project bench bench/heatmap-repaint.bench.test.ts bench/heatmap-form-2.bench.test.ts bench/heatmap-form-3.bench.test.ts bench/heatmap-form-4.bench.test.ts`): all four forms pass the 16ms PERF-05 budget individually -- form 1: 0.65ms, form 2: 14.01ms, form 3: 0.70ms, form 4: 0.95ms (this session's own run; `06-HEATMAP-SPEC.md`'s committed figures are 0.65/14.12/0.69/0.98ms from a separate run, consistent within normal run-to-run noise). Each measures a real metric-change repaint (multiple-of-contributed to max drawdown and back), not a cold first paint, per the bench file's own header comment. Per D-12/F-02, the four forms use different geometries and the figures are individually gated, not ranked against each other -- confirmed this is stated explicitly in both the bench output and `06-HEATMAP-SPEC.md` §8. |

**Score:** 4/4 roadmap success criteria verified (0 present-but-behavior-unverified as a per-truth
status; the ruin-hatch field-exercise gap under truth 2 is recorded as a deferred item, addressed
by Phase 7's own success criterion 2, per Step 9b -- not counted as a phase-6 failure).

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Ruin hatch's categorical distinctness verified visually in a field where ruin genuinely occurs | Phase 7 | Phase 7 roadmap success criterion 2 explicitly requires verification "on a 1929-entry high-leverage sweep where ruin genuinely occurs." Phase 6's fixture (strict-tier SPX, 1988-2026) has `ruinedCount = 0` by construction; Finding C in `06-HEATMAP-SPEC.md` §10 and `06-05-SUMMARY.md` both record this honestly. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/colorscale/value-to-color.ts` | The graduated D-27a colour function, the single authority Phase 7 imports | VERIFIED | 236 lines, real Oklab math (round-trip tested), symlog transform, categorical branches (ruin, incomplete) with the documented branch order. `RAMP_STOPS`, `DOMAIN_LOG_MIN/MAX`, `RUIN_BASE_RGBA`, `INCOMPLETE_RGBA`, `LEGEND_TICK_MULTIPLES` all match `06-HEATMAP-SPEC.md` §3-5 exactly (byte-for-byte hex comparison). Wired: imported by all four mockup forms and `mockup-runtime.ts`, zero duplicated copies. |
| `.planning/phases/06-heatmap-design-pass/mockups/sweep-fixture.bin` | The committed, real D-29 sweep fixture (~90KB) | VERIFIED | 93,880 bytes on disk. Independently decoded via `decodeSweepFixture` this session: `cols=200, rows=50, holdingYears=10, ruined=0, incomplete=2600, minMultiple=0.000381, maxMultiple=84.243, clippedBelow=135, clippedAbove=0` -- exact match to `06-HEATMAP-SPEC.md` §9's stated values. |
| `mockups/forms/form-1..4-*.ts` (4 files) | Four structurally different plot forms, each rendering the real fixture | VERIFIED | All four exist, each imports `valueToColor`/`rampPositionFor` from the shared colour function (not a copy), each exports its own `FORM_N_GEOMETRY` and paint function matching `06-HEATMAP-SPEC.md` §7's per-form geometry table. |
| `mockups/comparison.tsx` / `.html` | The D-05 side-by-side comparison page | VERIFIED | Real Solid.js component (`FORMS` array, `FormPanel`), imports every paint function, mounts via `comparison.html`. `06-05-SUMMARY.md` documents a Playwright load confirming 8/8 panels and canvases render with zero console errors. |
| `06-HEATMAP-SPEC.md` | The implementable Phase 7 contract (D-26) | VERIFIED | 304 lines, 11 sections. Every concrete constant spot-checked against source this session (RAMP_STOPS hexes, DOMAIN_LOG_MIN/MAX, RUIN_BASE_RGBA, INCOMPLETE_RGBA, LEGEND_TICK_MULTIPLES, hatch period/stroke-width, BAND_MULTIPLES, FORM_2_GEOMETRY, fixture meta counts) -- zero drift found. Zero em-dash characters (`python3` count returns 0). No debt markers. |
| PROJECT.md Key Decision (D-26) | A row naming the winner, the three losers and why, alongside the two Phase 1 architecture decisions | VERIFIED | Row present in the Key Decisions table (`.planning/PROJECT.md` line 190), names the winner, all three rejection reasons, the four measured figures with machine/core-count attribution, and points to `06-HEATMAP-SPEC.md` for detail. |
| `tests/color-scale-cvd.test.ts` | D-17's live colourblind assertion, no committed images | VERIFIED | 15/15 tests pass (re-run this session), runs inside the `unit` Vitest project, which CI's `npm test` step executes on every push. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| Each mockup form | `src/colorscale/value-to-color.ts` | `import { valueToColor, rampPositionFor, ... }` | WIRED | Confirmed by grep across all four form files and `mockup-runtime.ts`/`field-sampler.ts` -- every file imports from `../../../../../src/colorscale/value-to-color.ts`, none inlines a copy (D-28). |
| `mockups/comparison.tsx` | All four form paint functions | Direct import and `FORMS` array | WIRED | Read in full; `paintDenseGrid`, `paintFilledContour`, `paintSmallMultiples`, `paintGridWithContour` all imported and invoked per-panel. |
| `bench/heatmap-*.bench.test.ts` | The real mockup paint functions | Direct import (not a re-implementation) | WIRED | `bench/heatmap-repaint.bench.test.ts` imports `paintDenseGrid`/`FORM_1_GEOMETRY` directly from the mockup file, per its own header comment ("the actual paint function `form-1-dense-grid.html` uses, not a copy"). |
| `06-HEATMAP-SPEC.md` | `src/colorscale/value-to-color.ts` and the committed fixture | Numeric constants copied and cited inline | WIRED | Every RAMP_STOPS hex, domain bound, ruin/incomplete RGBA, and fixture count independently re-verified against source/decoded fixture this session; zero discrepancies. |
| `npm test` (CI) | `tests/color-scale-cvd.test.ts` | `vitest run --project unit` | WIRED | `.github/workflows/*.yml` runs `npm test`; `package.json`'s `test` script is `vitest run --project unit`, the project this test file lives in. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| CVD colourblind check passes | `npx vitest run --project unit tests/color-scale-cvd.test.ts` | 15/15 tests pass | PASS |
| Full unit suite passes | `npm test` (after `npm run build`) | 697/697 tests pass, 51 files | PASS |
| Typecheck passes | `npm run typecheck` | Exit 0, no errors | PASS |
| All four forms repaint under 16ms on real hardware | `npx vitest run --project bench bench/heatmap-repaint.bench.test.ts bench/heatmap-form-2.bench.test.ts bench/heatmap-form-3.bench.test.ts bench/heatmap-form-4.bench.test.ts` | form 1: 0.65ms, form 2: 14.01ms, form 3: 0.70ms, form 4: 0.95ms, all under the 16ms PERF-05 budget | PASS |
| Committed fixture decodes to the counts the spec claims | Custom decode script via `decodeSweepFixture` (this session) | `ruined=0, incomplete=2600, minM=0.000381, maxM=84.243, clippedBelow=135, clippedAbove=0, holdingYears=10` -- exact match to `06-HEATMAP-SPEC.md` §9 | PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` convention exists in this project and none is referenced by this
phase's plans or SUMMARYs. Skipped: no runnable probes declared.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| VIZ-05 | 06-01 through 06-06 | Heatmap design validated against throwaway mockups before implementation | SATISFIED | Four real forms, comparison page, real fixture, owner decision with written rejection reasons -- all confirmed above. |
| VIZ-07 | 06-01, 06-02, 06-06 | Colour scales perceptually uniform and colourblind-safe; orders-of-magnitude outcomes use a non-linear map | SATISFIED | Symlog D-13/D-14 transform, live CVD test re-run and passing 15/15, thresholds fixed before testing with published provenance. |
| VIZ-10 | 06-01, 06-03, 06-04, 06-05 | Overlapping-windows caveat placed where it will be read | SATISFIED | Exact D-22 two-sentence copy, correct placement and typography, confirmed rendered identically across all 8 panels. |

**REQUIREMENTS.md checkbox state:** `VIZ-05`, `VIZ-07`, `VIZ-10` are still shown as `[ ]` /
"Pending" in `.planning/REQUIREMENTS.md` at the time of this verification, despite
`06-06-SUMMARY.md`'s frontmatter declaring `requirements-completed: [VIZ-05, VIZ-07, VIZ-10]`.
This was checked against git history rather than assumed to be a gap: every prior completed phase
(4 and 5) shows the identical pattern -- the individual plans leave their requirement's checkbox
unchecked and only declare `requirements-completed:` in the closing plan's SUMMARY frontmatter,
then a single `docs(phase-N): complete phase execution` commit (e.g. `df48e04` for Phase 5) flips
the REQUIREMENTS.md checkboxes and updates ROADMAP.md/STATE.md, bundled with that phase's own
VERIFICATION.md. That commit has not yet been made for Phase 6 because this VERIFICATION.md is
that commit's own precondition. This is the expected pre-verification state, not a phase-6-specific
omission -- but it is a real open loop until the completion commit happens, so it is called out
here rather than silently assumed closed. Per this agent's scope, REQUIREMENTS.md is not modified
by this verification; the checkbox flip belongs to the phase-completion step that follows a
`passed` verification.

### Anti-Patterns Found

None. Scanned every file touched by this phase (`06-HEATMAP-SPEC.md`, `mockups/comparison.tsx`,
all four form files, `field-sampler.ts`, `iso-lines.ts`, `mockup-runtime.ts`,
`scripts/build-sweep-fixture.ts`, `src/colorscale/value-to-color.ts`,
`src/data/sweep-fixture-format.ts`) for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` and for
placeholder-language patterns (`placeholder`, `coming soon`, `not yet implemented`, etc.). Zero
matches. Zero em-dash characters in `06-HEATMAP-SPEC.md`.

### Human Verification Required

None. The one place this phase substituted an automated proxy for a live human channel -- Task 1
of plans 06-01, 06-03, and 06-04, each `<verify><human-check>` replaced with Playwright
screenshots the executor inspected directly, because parallel worktree dispatch had no live
channel -- is honestly flagged `human_judgment: true` with a documented rationale in each SUMMARY,
and covers only objective render-correctness checks (does the field paint, does the caveat render
in full, does the panel survive a theme toggle, zero console errors). The one judgement that
actually required subjective human taste -- **which of the four forms wins** -- was not proxied:
plan 06-05's Task 2 is `type="checkpoint:decision" gate="blocking"`, the plan halted at it, and the
owner personally viewed the real `comparison.tsx` page (10yr fixture, corrected `BAND_LEVELS`,
integer leverage labels) before choosing `form-2-filled-contour` and dictating the three rejection
reasons verbatim, recorded in `06-05-SUMMARY.md`. No further human verification is needed for this
phase's own success criteria.

### Gaps Summary

No gaps found. All four ROADMAP.md success criteria are independently verified against the
codebase (re-run tests, re-run bench, re-decoded the fixture, cross-checked every numeric constant
in `06-HEATMAP-SPEC.md` against its stated source), not merely re-stated from SUMMARY.md claims.

Two things are called out above without being treated as gaps, because both are honestly
disclosed, correctly attributed to the right phase, and consistent with this project's own
established workflow pattern:

1. **The ruin hatch is unit-tested but not field-exercised** (fixture `ruinedCount = 0`). This is
   a fact about the chosen strict-tier SPX window, not a defect in this phase's work, and Phase
   7's own roadmap success criterion 2 already names the sweep that will exercise it (a
   1929-entry, high-leverage sweep). Filed as a deferred item, not a Phase 6 gap.
2. **REQUIREMENTS.md's VIZ-05/VIZ-07/VIZ-10 checkboxes are still unchecked.** Matches the exact
   pre-verification state every prior phase showed before its own `complete phase execution`
   commit. Not a phase-6 defect; flagged so the completion step that follows this verification
   does not skip it.

---

*Verified: 2026-08-21T19:25:19Z*
*Verifier: Claude (gsd-verifier)*
