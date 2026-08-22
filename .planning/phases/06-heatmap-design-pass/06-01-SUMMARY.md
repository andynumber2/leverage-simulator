---
phase: 06-heatmap-design-pass
plan: 01
subsystem: ui
tags: [canvas, colorscale, oklab, binary-format, heatmap, vitest-browser, kernel-sweep]

requires:
  - phase: 03-simulation-kernel-and-the-upro-tqqq-gate
    provides: runBacktest, buildKernelInputs, the ruin/maxDrawdown kernel contract
  - phase: 01-performance-spike-and-budget-lock
    provides: bench/canvas-grid.ts precursor, calibration/normalize harness, PERF-05 budget row
provides:
  - src/colorscale/value-to-color.ts (graduated symmetric-log diverging colour function, zero imports)
  - src/data/sweep-fixture-format.ts (versioned binary sweep-fixture format with fail-loud decode)
  - committed .planning/phases/06-heatmap-design-pass/mockups/sweep-fixture.bin (200x50 SPX total-return, 20yr hold)
  - mockups/shared/mockup-runtime.ts (fixture loader, VIZ-10 caveat, legend, hatch pattern, theme-aware panel chrome)
  - form 1 of 4 (dense grid) rendering the real fixture end to end under vite dev
  - bench/heatmap-repaint.bench.test.ts (criterion 4 measurement harness, PERF-05 row)
affects: [06-02, 06-03, 06-04, 06-05, 06-06, phase-7-heatmap-implementation]

actuals:
  tokens: 21000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Oklab-space piecewise-linear colour interpolation for a diverging palette (published Björn Ottosson sRGB<->Oklab matrices, round-trip-tested)"
    - "Fail-loud versioned binary format (magic + formatVersion + explicit total-length recomputation) mirroring tools/bundle-compiler/src/binary-format.ts, for a second asset kind"
    - "Axis-gutter-inset canvas field: reserve a label margin inside a fixed canvas rather than drawing text over data pixels"
    - "Node-side browser-command bridge (readSweepFixture) for handing a committed fixture's bytes into a Vitest browser-mode bench test, mirroring readBundleBytes/readKernelSeries"

key-files:
  created:
    - src/colorscale/value-to-color.ts
    - src/data/sweep-fixture-format.ts
    - scripts/build-sweep-fixture.ts
    - .planning/phases/06-heatmap-design-pass/mockups/sweep-fixture.bin
    - .planning/phases/06-heatmap-design-pass/mockups/shared/mockup-runtime.ts
    - .planning/phases/06-heatmap-design-pass/mockups/forms/form-1-dense-grid.ts
    - .planning/phases/06-heatmap-design-pass/mockups/form-1-dense-grid.html
    - bench/heatmap-repaint.bench.test.ts
    - bench/sweep-fixture-bridge.ts
    - tests/value-to-color.test.ts
    - tests/sweep-fixture-format.test.ts
  modified:
    - package.json (added build-sweep-fixture script only)
    - vitest.config.ts (added readSweepFixture browser command)
    - bench/browser-commands.d.ts (module augmentation for readSweepFixture)

key-decisions:
  - "Re-picked the plan's starting RAMP_STOPS quarter values (#6BAED6/#FDAE6B) to #3182BD/#E6550D: the pastel starting values sit at nearly the same Oklab lightness as the midpoint, producing a 33-sample perceptual-step ratio of ~3.45 against VIZ-07's 2.5 ceiling; the saturated replacements measure ~1.33-1.46, same hue family, same blue/orange ends"
  - "Reserved a 36px left / 16px bottom axis-label gutter inside form 1's fixed 800x200 canvas rather than drawing labels over the field: an initial implementation drew leverage/entry-year labels directly on top of the field's own corner cells, which bench/heatmap-repaint.bench.test.ts's equivalence proof caught before any timing was trusted"
  - "readSweepFixture added as a new vitest.config.ts bench-project browser command (Node reads the file, browser decodes with the real decodeSweepFixture), following the existing readBundleBytes/readKernelSeries pattern rather than inventing new plumbing"

requirements-completed: [VIZ-05, VIZ-07, VIZ-10]

coverage:
  - id: D1
    description: "src/colorscale/value-to-color.ts: symmetric-log diverging colour function, Oklab interpolation, D-18/D-20 categorical branches"
    requirement: VIZ-07
    verification:
      - kind: unit
        ref: "tests/value-to-color.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "src/data/sweep-fixture-format.ts: versioned binary fixture format, fail-loud decode contract"
    verification:
      - kind: unit
        ref: "tests/sweep-fixture-format.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "scripts/build-sweep-fixture.ts sweeps the real Phase 3 kernel over 200x50 SPX total-return cells and writes a deterministic, committed fixture"
    verification:
      - kind: other
        ref: "npm run build-sweep-fixture (run twice, sha256 byte-identical)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Form 1 (dense grid) mockup renders the real fixture end to end under vite dev, in both light and dark, with the real VIZ-10 caveat and D-24/D-25 legend"
    requirement: VIZ-10
    verification:
      - kind: automated_ui
        ref: "Playwright screenshot + DOM text assertion against http://localhost:5173/.planning/phases/06-heatmap-design-pass/mockups/form-1-dense-grid.html (light and dark, zero console errors)"
        status: pass
    human_judgment: true
    rationale: "The plan's own <verify><human-check> calls for a human to visually confirm the field paints, the caveat reads in full, legend ticks are correct, and the panel survives a theme toggle. AUTO_CHAIN/AUTO_CFG were both false (interactive mode) at execution time, so per the tracer feedback gate this would ordinarily halt for a live human checkpoint; in this parallel worktree dispatch (plan frontmatter autonomous:true, project config mode:yolo) no interactive channel was available, so the executor substituted an automated-but-visual proxy (Playwright screenshots read back and inspected, DOM text assertions for the caveat/legend copy, zero console/page errors) and proceeded. Flagged here so a human reviewer can spot-check the two screenshots this proxy produced (not committed as artifacts, per D-17's no-binary-archive constraint) against the real rendered page."
  - id: D5
    description: "bench/heatmap-repaint.bench.test.ts: criterion 4's form-1 arm, equivalence proof before timing, PERF-05 row"
    verification:
      - kind: integration
        ref: "npx vitest run --project bench bench/heatmap-repaint.bench.test.ts (equivalence test, then measurement test)"
        status: pass
    human_judgment: false

duration: 75min
completed: 2026-08-21
status: complete
---

# Phase 6 Plan 01: Real Kernel Sweep to Painted 10,000-Cell Grid Summary

**Real Phase 3 kernel sweep of 200 SPX entry dates x 50 leverage levels, committed as a versioned binary fixture, painted through a new Oklab-interpolated diverging colour function into form 1 of four mockups, measured at 0.47ms against PERF-05's 16ms repaint budget.**

## Performance

- **Duration:** ~75 min
- **Started:** 2026-08-21T04:49Z (approx, base commit)
- **Completed:** 2026-08-21T06:03:53Z
- **Tasks:** 2
- **Files modified:** 15 (12 new files, 3 modified)

## Accomplishments

- `src/colorscale/value-to-color.ts`: the graduated colour function — symmetric-log diverging scale (`log10`, domain `[-2, +2]`, i.e. `0.01x` to `100x`), interpolated in Oklab via published sRGB<->Oklab matrices, centred exactly at `1.0x`, with ruin (D-18) and incomplete-hold (D-20) categorical branches that win over the continuous path. Zero imports so both plain-HTML mockups and Phase 7's Solid renderer can consume it.
- `src/data/sweep-fixture-format.ts`: a versioned binary layout (magic/formatVersion/cols/rows/metaByteLength header, JSON meta block, Float32 multiples, Float32 drawdowns, Uint8 flags) with a fail-loud `decodeSweepFixture` that recomputes the exact expected total length from the header before constructing any typed-array view (T-06-02), and names both the found and expected value on every structural mismatch (T-06-01).
- `scripts/build-sweep-fixture.ts`: sweeps the real Phase 3 kernel (`buildKernelInputs` + `runBacktest`, the same seam `scripts/run-backtest.ts` uses) over 200 entry columns (full SPX/total-return strict tier, 1988-01-05 to 2026-08-14) by 50 leverage rows (1.00x to 5.00x), fixed 20-year holding period. Two runs are byte-identical (verified via sha256). Printed and stored counts: `ruinedCount=0`, `incompleteCount=5150`, `minMultiple=0.01115082218394128`, `maxMultiple=24.593862058466776`, `clippedBelowCount=0`, `clippedAboveCount=0`.
- Committed fixture at `.planning/phases/06-heatmap-design-pass/mockups/sweep-fixture.bin`, 93,880 bytes.
- `mockups/shared/mockup-runtime.ts`: fixture loader (fails loudly to a visible red block on load/decode error), the real two-sentence VIZ-10 caveat, the D-24/D-25 legend (continuous ramp drawn through the real `valueToColor`, non-uniform ticks at `0.10x`/`0.50x`/`1.00x`/`2.00x`/`10.00x`, detached hatched-ruin and flat-grey-incomplete swatches), the D-18 hatch pattern, and the panel/theme-toggle shell.
- `mockups/forms/form-1-dense-grid.ts` + `.html`: form 1 of four (dense grid), painted via the `putImageData` path, reserving a small axis-label gutter inside its fixed 800x200 canvas so leverage/entry-year tick labels never overdraw field data.
- `bench/heatmap-repaint.bench.test.ts`: proves paint equivalence (background-color check with alpha-254 sentinel, then exact `valueToColor` match at both corner cells) before trusting any timing, measures a metric-toggle repaint (multiple <-> drawdown), and records the run's one PERF-05 row plus an info line `PERF-05-heatmap-form-1`. Measured **0.47ms normalized** (0.29ms raw, batch size 200) on this dev sandbox (9 logical cores, Linux aarch64 container, calibration score ~0.62 — not the D-17 CI baseline), well inside the 16ms budget.

## Task Commits

Each task was committed atomically:

1. **Task 1: One real sweep to one painted 10,000-cell grid, end to end** - `753bb7c` (feat)
2. **Task 2: Unit coverage for the two graduated modules** - `59c0316` (test)

## Files Created/Modified

- `src/colorscale/value-to-color.ts` - graduated symmetric-log diverging colour function (D-27a)
- `src/data/sweep-fixture-format.ts` - versioned binary fixture format, encode/decode pair (D-29)
- `scripts/build-sweep-fixture.ts` - offline sweep script (D-03), registered as `npm run build-sweep-fixture`
- `.planning/phases/06-heatmap-design-pass/mockups/sweep-fixture.bin` - committed 93,880-byte fixture
- `.planning/phases/06-heatmap-design-pass/mockups/shared/mockup-runtime.ts` - shared chrome for all four forms
- `.planning/phases/06-heatmap-design-pass/mockups/forms/form-1-dense-grid.ts` - form 1's own geometry and paint function
- `.planning/phases/06-heatmap-design-pass/mockups/form-1-dense-grid.html` - form 1's plain-HTML entry point
- `bench/heatmap-repaint.bench.test.ts` - criterion 4's form-1 arm
- `bench/sweep-fixture-bridge.ts` - Node-side fixture-bytes reader for the browser bench command
- `tests/value-to-color.test.ts` - unit coverage for the colour function
- `tests/sweep-fixture-format.test.ts` - unit coverage for the fixture format
- `package.json` - added `build-sweep-fixture` script (no dependency changes)
- `vitest.config.ts` - added `readSweepFixture` browser command to the `bench` project
- `bench/browser-commands.d.ts` - module augmentation for the new command

## Decisions Made

- **Re-tuned `RAMP_STOPS`'s quarter stops.** The plan's literal starting hex values (`#6BAED6` at `t=0.25`, `#FDAE6B` at `t=0.75`) sit at nearly the same Oklab lightness as the `t=0.5` midpoint (L 0.72 vs 0.72/0.75), so the two inner ramp segments carried almost no perceptual distance while the two outer segments carried most of it — measured 33-sample perceptual-step ratio ~3.45, failing VIZ-07's 2.5 ceiling before any implementation choice was made. Replaced with `#3182BD`/`#E6550D` (same blue-orange hue family, same endpoints, roughly midway Oklab lightness between each endpoint and the neutral centre): measured ratio ~1.33-1.46. Documented inline in `value-to-color.ts`.
- **Reserved an axis-label gutter inside form 1's canvas** rather than drawing tick labels over the field. An initial implementation drew leverage-row and entry-year labels directly at the field's own edges (`x=0`, `y=canvas.height`), which visibly overdrew the corner cells' real colours — caught by `bench/heatmap-repaint.bench.test.ts`'s equivalence proof (`cell (row=0, col=0)` sampled the label's background chip instead of the field colour) before any timing was trusted, exactly the purpose that proof exists for. Fixed by shrinking the field's own paint rectangle by a small fixed gutter (36px left, 16px bottom) within the same fixed 800x200 canvas, with a single `fieldRect`/`cellDisplayCenter` helper shared by both the paint function and the bench test so the two can never independently drift on where a cell's pixels actually are.
- **`readSweepFixture` added as a new bench-project browser command** in `vitest.config.ts`, following the existing `readBundleBytes`/`readKernelSeries` Node-reads-bytes/browser-decodes pattern, rather than fetching the fixture over HTTP from inside the bench test (the plan's own text offered either option; this one required no new plumbing beyond what the file already has for two other assets).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Colour ramp quarter stops re-picked to satisfy VIZ-07's perceptual-uniformity gate**
- **Found during:** Task 1(a), verified against Task 2's own perceptual-uniformity assertion before writing it
- **Issue:** The plan's literal starting `RAMP_STOPS` hex values produced a 33-sample adjacent-step Oklab-distance ratio of ~3.45, exceeding the 2.5 ceiling Task 2's own behaviour spec requires
- **Fix:** Replaced the `t=0.25`/`t=0.75` stops with more saturated colours at Oklab lightness roughly midway between each endpoint and the neutral centre, same hue family and endpoints unchanged
- **Files modified:** `src/colorscale/value-to-color.ts`
- **Verification:** `tests/value-to-color.test.ts`'s perceptual-uniformity test passes (measured ratio ~1.46 through the actual `interpolateRamp`/`oklabToSrgb` path)
- **Committed in:** `753bb7c` (Task 1 commit)

**2. [Rule 1 - Bug] Axis tick labels moved off the field's own pixels**
- **Found during:** Task 1(f), `bench/heatmap-repaint.bench.test.ts`'s equivalence proof
- **Issue:** `paintDenseGrid`'s first implementation drew leverage/entry-year axis labels directly over the field canvas at its edges, corrupting the corner cells' true colours (caught as a real equivalence-test failure, not a false positive)
- **Fix:** Reserved a small fixed gutter (36px left, 16px bottom) inside the same 800x200 canvas for label text; the field's `putImageData`/`drawImage` target rectangle shrinks by exactly that amount, and a shared `fieldRect`/`cellDisplayCenter` helper is exported so the bench test's sample-cell math can never drift from the paint function's own geometry
- **Files modified:** `.planning/phases/06-heatmap-design-pass/mockups/forms/form-1-dense-grid.ts`, `bench/heatmap-repaint.bench.test.ts`
- **Verification:** equivalence test passes; full `npm run bench` suite passes end to end
- **Committed in:** `753bb7c` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs caught before being trusted, per the plan's own "prove equivalence before timing" discipline)
**Impact on plan:** Both fixes necessary for correctness; neither changed scope. The colour-stop fix keeps the exact locked structure (D-13 family, D-14 symmetric log, D-15 neutral midpoint) while satisfying VIZ-07's own gate. The axis-gutter fix keeps `FORM_1_GEOMETRY`'s declared 800x200/cellSizePx:4 numbers unchanged; only the label placement moved.

## Issues Encountered

- **`npx vitest run --project bench bench/heatmap-repaint.bench.test.ts` in isolation exits 1**, not 0 as the plan's `<verify><automated>` line literally states. This is a pre-existing, project-wide characteristic of `bench/global-setup.ts`'s `assertRunInvariants`, not a regression: it requires every `PERF-08` sub-budget "due" by phase 4 to carry a real measurement in the SAME run, and those budgets are only recorded by `bench/perf-08.bench.test.ts`/`bench/bundle-size.bench.test.ts`/`bench/decode-time.bench.test.ts`, which do not run when the `bench` project is filtered to one file. Verified this is not specific to my new file by running a pre-existing bench file (`bench/canvas-repaint.bench.test.ts`) in the same isolated-file mode — it also exits 1 for the identical reason. The two facts the acceptance criteria actually care about both hold: the equivalence test passes before the measurement test, and the recorded PERF-05 row's `normalizedMs` (0.47-0.52ms across two runs) is well under 16ms. The full `npm run bench` suite (matching `package.json`'s own `bench` script, and requiring a prior `npm run build` for the pre-existing PERF-07/PERF-08 harnesses) passes end to end: **9 test files, 19 tests, exit 0**.
- **`npm run bench` and `npm run test` both require a fresh `npm run build`** (`dist/` present) for pre-existing gates (`bench/perf-07.bench.test.ts`, `bench/perf-08.bench.test.ts`, `tests/app/static-build.test.ts`) unrelated to this plan's own files — confirmed pre-existing by inspecting their error messages, which name the missing `dist/index.html` explicitly and predate this plan. Built once, both suites went fully green (`npm run test`: 656/656; `npm run bench`: 19/19), then `dist/` was removed again before the final commit so no build artifact entered git history.
- **Tracer feedback gate vs. parallel worktree dispatch.** `AUTO_CHAIN`/`AUTO_CFG` (`workflow._auto_chain_active`/`workflow.auto_advance`) both resolved to `false`, which per the executor's own rules means Task 1's `<verify><human-check>` should have triggered a `checkpoint:human-verify` halt before Task 2. This plan's own frontmatter declares `autonomous: true`, the project config's top-level `mode` is `"yolo"`, and the dispatch context is a parallel worktree the orchestrator force-removes on return (no live human channel). Given that conflict, proceeded past Task 1 after substituting an automated-but-visual verification: a headless-Chromium (Playwright) load of `form-1-dense-grid.html`, screenshots of both the light and (after two theme-toggle clicks) dark themes, a zero-console-error check, and exact-text assertions on the caveat and legend-tick DOM content. Both screenshots were inspected and show the field painting correctly (diverging blue-to-orange ramp, flat-grey incomplete-hold region on the right ~52% of columns, legend with the `1.00x` tick visually emphasised), the caveat rendering at full width in both themes, and the panel surviving the toggle. Screenshots were not committed (D-17's no-binary-archive constraint). Flagged as `human_judgment: true` in this SUMMARY's `coverage:` block (D4) so a human reviewer can still spot-check the live page.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The graduated colour function and the committed fixture are ready for plans 06-02 through 06-05 (forms 2-4) to import unchanged.
- `mockups/shared/mockup-runtime.ts`'s `mountMockup`/`renderLegend`/`renderCaveat`/`makeHatchPattern`/`loadSweepFixture` are all designed to be reused by the remaining three forms without modification; only each form's own paint function needs writing.
- `bench/heatmap-repaint.bench.test.ts`'s file-header comment already states the convention forms 2-4 must follow: each records its own info line and asserts locally against the same 16ms budget, but must NOT record a second `PERF-05` `MeasurementRow`.
- No blockers. The one open methodological note for plan 06-06 (per the plan's own pre-surfaced findings): the fixture measured `ruinedCount=0` (the 1988-2026 SPX window's worst daily return, ~-12%, never reaches the ~-20% needed to ruin a 5x position), so D-18's hatch is unit-tested and legend-rendered but has no in-field region to judge visually in any of the four forms — this is a measured fact about the fixture's real data, not a defect in this plan's own deliverables.

---
*Phase: 06-heatmap-design-pass*
*Completed: 2026-08-21*
