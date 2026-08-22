---
phase: 06-heatmap-design-pass
plan: 05
subsystem: ui
tags: [solid-js, canvas, comparison-page, heatmap, decision-checkpoint]

requires:
  - phase: 06-heatmap-design-pass
    plan: 01
    provides: "sweep-fixture.bin, value-to-color.ts, mockup-runtime.ts (loadSweepFixture/renderCaveat/renderLegend/MockupGeometry), form-1-dense-grid.ts (FORM_1_GEOMETRY, paintDenseGrid)"
  - phase: 06-heatmap-design-pass
    plan: 03
    provides: "form-2-filled-contour.ts (FORM_2_GEOMETRY, paintFilledContour), form-4-grid-with-contour.ts (FORM_4_GEOMETRY, paintGridWithContour)"
  - phase: 06-heatmap-design-pass
    plan: 04
    provides: "form-3-small-multiples.ts (FORM_3_GEOMETRY, paintSmallMultiples)"
provides:
  - "mockups/comparison.tsx and comparison.html (Task 1, committed): the D-05 comparison page, all four forms on the same fixture, primary + max-drawdown stress sections"
  - "The Task 2 decision: form-2-filled-contour wins, with the three rejection reasons and the three carry-forward findings (A, B, C) plan 06-06 binds into 06-HEATMAP-SPEC.md"
affects: [06-06]

actuals:
  tokens: 8200
  tasks: 2
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Solid.js component (FormPanel) wrapping the plain-DOM shared runtime (renderCaveat/renderLegend) via refs and onMount, rather than porting those DOM-builder functions to JSX -- keeps D-28's single shared implementation intact while giving the one Solid page on this phase a component boundary"

key-files:
  created:
    - .planning/phases/06-heatmap-design-pass/mockups/comparison.tsx
    - .planning/phases/06-heatmap-design-pass/mockups/comparison.html
  modified: []

key-decisions:
  - "comparison.tsx/.html committed and Task 1 verified. Task 2's decision, made by the owner against the refreshed mockups (10yr fixture, value-space BAND_LEVELS, integer y-axis labels): form-2-filled-contour wins. Rejected: form-1-dense-grid (no boundary mark -- breakeven is inferred from a colour step, not read from a line), form-3-small-multiples (50 strip gaps break vertical continuity, so the breakeven boundary is not traceable as a shape across strips), form-4-grid-with-contour (keeps the hard per-cell mosaic under the contour line, so the field reads as discrete samples rather than a continuous surface). See 'Decision: Task 2' below for the full record."
  - "The owner accepted, with eyes open, that form 2 is the most expensive of the four at the mockup's own geometry (13.64ms of the 16ms PERF-05 budget vs 0.68-0.93ms for the other three), and that this cost is O(display area) not O(cells) -- see Finding A."
  - "The fixture holding period changed 20yr to 10yr at the owner's direction, overriding 06-CONTEXT.md's D-11. See 'Fixture Change: D-11 Override' below."

requirements-completed: []

coverage:
  - id: D1
    description: "comparison.tsx/.html: D-05 comparison page, all four forms rendered on the same committed fixture at their own D-12 geometry, primary section (multiple-of-contributed) plus stress section (max drawdown), theme-toggle repaint, load-failure backstop, narrow-viewport reflow"
    requirement: VIZ-05
    verification:
      - kind: automated_ui
        ref: "Playwright load of http://localhost:5199/.planning/phases/06-heatmap-design-pass/mockups/comparison.html: 8/8 panels and canvases render, 4 exact titles present twice each, one byte-identical caveat string across all 8 panels, 8/8 legends present, zero console/page errors"
        status: pass
      - kind: automated_ui
        ref: "Theme toggle clicked twice reaches data-theme=dark; every canvas repaints (contour stroke colours flip); screenshots inspected directly in both themes"
        status: pass
      - kind: automated_ui
        ref: "Viewport narrowed to 900px: document.documentElement.scrollWidth === clientWidth (900 === 900), grid reflows to one column, no panel clipped"
        status: pass
      - kind: automated_ui
        ref: "FIXTURE_URL temporarily pointed at a non-existent file: [data-testid=fixture-load-failure] renders naming the URL and the decode error, document.body.textContent equals the block's own text (no other content leaked); URL restored afterward, page re-verified loading normally"
        status: pass
      - kind: unit
        ref: "npm run typecheck (exits 0, though .planning/ is outside tsconfig's include array so this is not load-bearing for this file -- see Issues Encountered); standalone `tsc --noEmit` invoked with the project's own compiler flags directly against comparison.tsx: zero errors"
        status: pass
      - kind: other
        ref: "npm run build succeeds; `find dist -iname '*comparison*'` returns nothing; dist/ is gitignored and removed after the check"
        status: pass
    human_judgment: false
  - id: D2
    description: "Task 2: the winning-form decision and the three rejection reasons"
    verification:
      - kind: other
        ref: "Owner judged all eight panels (four forms x two sections) against the four fixed judging criteria, in both themes, at real viewport width, on the refreshed mockups (10yr fixture, value-space BAND_LEVELS, integer leverage labels). Winner: form-2-filled-contour. See 'Decision: Task 2' below for the winner and all three rejection reasons verbatim."
        status: pass
    human_judgment: true
    rationale: "This plan's own frontmatter sets autonomous: false and Task 2 is type=\"checkpoint:decision\" gate=\"blocking\" -- a real judgement about which of four plot forms wins, never something an executor is authorized to decide. The prior run of this plan halted at this checkpoint and returned full evidence to the orchestrator; the owner has now made the decision, and this continuation records it verbatim per the plan's own <output> instruction. No rejection reason cites implementation difficulty or a repaint-figure ranking, satisfying the task's acceptance criteria."

duration: 41min
completed: 2026-08-21
status: complete
---

# Phase 6 Plan 05: D-05 Comparison Page Summary

**Both tasks complete. Task 1: a hand-rolled Solid.js comparison page renders all four D-02 heatmap forms against the same committed fixture, in both themes, at each form's own geometry, on both multiple-of-contributed and the max-drawdown stress metric -- fully verified. Task 2: the owner judged the refreshed mockups (10yr fixture, value-space BAND_LEVELS, integer leverage labels) against the four fixed criteria and chose form-2-filled-contour ("Filled contour", the pork-chop plot). The three rejection reasons, three carry-forward findings for plan 06-06 and Phase 7, and the D-11 fixture-period override are all recorded below.**

## Performance

- **Duration:** ~41 min total (35 min Task 1, ~6 min recording Task 2's decision in this continuation)
- **Started:** 2026-08-21 (approx, base commit `55d045a`)
- **Completed:** 2026-08-21
- **Tasks:** 2 of 2 completed
- **Files modified:** 2 new (Task 1) + 6 modified across three owner-directed fix commits made between the halt and this continuation (see 'Fixture Change: D-11 Override' and Finding B)

## Accomplishments

- `mockups/comparison.tsx`: the D-05 comparison page (the one hand-rolled Solid.js file this phase's `06-UI-SPEC.md` Design System row specifies). A `FORMS` array of the four `{id, title, geometry, paint}` entries imports all four paint functions from `./forms/` and the exact four panel titles `06-UI-SPEC.md`'s Copywriting Contract fixes. A single `FormPanel` component renders every one of the eight panels identically (title, canvas, caveat, legend via the shared runtime's `renderCaveat`/`renderLegend`), with no front-runner styling. `ComparisonPage` calls `initTheme()` once, fetches the fixture exactly once via `loadSweepFixture`, and renders nothing but a bare shell until it resolves -- no per-panel spinner, no partial reveal. On a load failure, the shared runtime's own `showFixtureLoadFailure` (already wired inside `loadSweepFixture`) replaces the page with a visible block naming the URL and the error; `ComparisonPage` just stops waiting rather than building a second failure UI. Two static sections: PRIMARY on multiple-of-contributed (D-04's argued metric), STRESS on max drawdown under a `var(--space-2xl)` gap and a short static note, with no instance of "independent trials"/"independent backtests" written directly into this file (the one occurrence in each caveat is imported verbatim from `mockup-runtime.ts`, never restated). Every canvas repaints on `onThemeChange`, unsubscribed in `onCleanup`. The grid uses `repeat(auto-fit, minmax(820px, 1fr))` so it reflows to a single column rather than clipping a panel or forcing horizontal scroll at typical comparison-viewing widths.
- `mockups/comparison.html`: the mount document, a `#comparison-root` div plus `<script type="module" src="./comparison.tsx">`, importing `src/app/styles.css` (via `comparison.tsx`'s own top-of-file import) so both palettes are available before first paint.

## Task Commits

1. **Task 1: The four-way comparison page and the max-drawdown stress section** - `92f6051` (feat)
2. **Halt record** - `d3de538` (docs) - Task 1 complete, Task 2 halted at its checkpoint
3. **Owner-directed fixture change** - `1f40846` (fix) - holding period 20yr to 10yr, overriding D-11
4. **Owner-directed contour-level fix** - `ba6c55e` (fix) - BAND_LEVELS defined in multiple space, not evenly in ramp position
5. **Owner-directed axis fix** - `aeb46e8` (fix) - integer leverage y-axis labels, placed by value interpolation
6. **Task 2: Decision recorded** - this commit (docs) - form-2-filled-contour wins; rejection reasons, carry-forward findings and the D-11 override recorded in this SUMMARY

Commits 3-5 were made by the owner between the Task 2 halt and this continuation, against the same halted plan, and are documented here rather than re-executed.

## Files Created/Modified

- `.planning/phases/06-heatmap-design-pass/mockups/comparison.tsx` - the D-05 comparison page, Solid entry
- `.planning/phases/06-heatmap-design-pass/mockups/comparison.html` - the document that mounts it
- `.planning/phases/06-heatmap-design-pass/mockups/sweep-fixture.bin` - regenerated at 10yr holding period (`1f40846`)
- `scripts/build-sweep-fixture.ts` - holding period parameter (`1f40846`)
- `.planning/phases/06-heatmap-design-pass/mockups/shared/field-sampler.ts` - `BAND_LEVELS` redefined via `BAND_MULTIPLES` in value space (`ba6c55e`)
- `.planning/phases/06-heatmap-design-pass/mockups/forms/form-2-filled-contour.ts` - consumes the new `BAND_LEVELS`; integer y-axis labels (`ba6c55e`, `aeb46e8`)
- `.planning/phases/06-heatmap-design-pass/mockups/forms/form-4-grid-with-contour.ts` - `RUIN_ADJACENT_LEVEL` computed directly rather than indexed from `BAND_LEVELS[1]` (`ba6c55e`)
- `.planning/phases/06-heatmap-design-pass/mockups/forms/form-1-dense-grid.ts` - integer y-axis labels (`aeb46e8`)
- `.planning/phases/06-heatmap-design-pass/mockups/forms/form-3-small-multiples.ts` - integer y-axis labels via value-interpolated strip position (`aeb46e8`)
- `.planning/phases/06-heatmap-design-pass/mockups/shared/mockup-runtime.ts` - `fixtureRowForLeverage`/`integerLeverageTicks` added (`aeb46e8`)
- `tests/field-sampler.test.ts` - rewritten to assert `BAND_LEVELS` properties rather than specific values (`ba6c55e`)

## Decision: Task 2 -- Winning Form

**Winner: `form-2-filled-contour`** ("Filled contour", the pork-chop plot).

Judged by the owner against the four fixed criteria (breakeven readability, categorical-state
separation, dark-mode/screenshot-crop survival, caveat placement) on the refreshed mockups: 10yr
holding period, `BAND_LEVELS` defined in multiple space via `BAND_MULTIPLES`, and integer leverage
y-axis labels placed by value interpolation.

### Rejection reasons (one per losing form, owner-confirmed)

- **`form-1-dense-grid`:** No boundary mark at all. The reader has to infer breakeven from where
  blue meets orange rather than being given a line to trace.
- **`form-3-small-multiples`:** The 50 strip gaps break vertical continuity, so the breakeven
  boundary is not traceable as a shape at all. The eye has to reconstruct it across 50 independent
  strips.
- **`form-4-grid-with-contour`:** Gives the line but keeps the hard per-cell mosaic, so the field
  reads as discrete samples rather than as a continuous surface with shape.

No rejection reason cites implementation difficulty, build cost, maintenance effort, or a repaint
figure as a ranking between forms, per the task's own acceptance criteria.

### Cost accepted with eyes open

Form 2 is the most expensive of the four at the mockup's own 800x240 geometry: 13.64ms of the
16ms PERF-05 budget, versus 0.68-0.93ms for the other three. The owner accepted this cost
knowingly. See Finding A below for why this figure does not directly bound Phase 7's cost.

## Carry-Forward Findings for 06-06 and Phase 7

Recorded as findings, not decisions, per this plan's `<output>` instruction, so plan 06-06 binds
them into `06-HEATMAP-SPEC.md` rather than Phase 7 discovering them as surprises.

**Finding A -- form 2's cost is O(display area), not O(cells).** Forms 1/3/4 build an `ImageData`
at fixture resolution (200x50 = 10,000 px) and let the GPU upscale via `drawImage`, so their cost
is constant in panel size. Form 2 calls `resampleField` at DISPLAY resolution (764x224 = 171,136
px in the mockup, 17x more) because smooth bands cannot be produced by upscaling a 200x50 buffer.
Consequence: form 2's 13.64ms scales linearly with panel area, so a 1200x400 field lands near 38ms
and breaches both the 16ms budget and the 60fps pan/zoom criterion. Mitigation for Phase 7:
resample once to an offscreen canvas per data/metric change, then serve pan and zoom as `drawImage`
transforms of that cached bitmap, which matches the roadmap's own "re-colors the cached grid"
language. This is a Phase 7 implementation obligation created by choosing form 2, and the spec
must say so.

**Finding B -- the contour levels are not yet labelled.** `BAND_LEVELS` is now defined in multiple
space (`BAND_MULTIPLES = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50]`) precisely so the lines ARE
labellable, but no form draws those labels. Whether and how to label them is an open Phase 7
decision the owner deferred. Ramp position `t` is an internal colour-lookup coordinate and must
never decide where a user-facing line goes, which is why the old even-in-`t` levels (2.51x, 6.31x,
15.8x) were replaced.

**Finding C -- the ruin hatch is still unexercised.** `ruinedCount` is 0 in both the 20-year and
the 10-year fixture, a fact about the SPX 1988-2026 window rather than a defect. Success criterion
2 therefore rests entirely on the incomplete-hold grey. The hatch is unit-tested but has never been
visually judged in a field. Phase 7's own roadmap criterion 2 calls for verification "on a
1929-entry high-leverage sweep where ruin genuinely occurs" -- note that this phase could not
supply that evidence.

## Fixture Change: D-11 Override

The fixture holding period was changed 20yr to 10yr at the owner's direction (`1f40846`), between
the Task 2 halt and this continuation. This OVERRIDES decision D-11 in `06-CONTEXT.md`, which had
explicitly chosen 20 years and named 10 years as the rejected alternative on the grounds that
single crashes dominate columns.

**Owner's stated rationale:** the holding period will be a user-facing slider in the shipped app
(Phase 7, VIZ-04), so the fixture's period is a viewing choice for judging plot form rather than a
locked analytical commitment.

**Observable effect, for the record:**

- Incomplete cells: 51.5% -> 26.0% (5150/10000 -> 2600/10000)
- Multiple range: [0.011x, 24.6x] -> [0.00038x, 84.2x]
- 135 cells now clip at the colour domain floor, where none did before
- Ruined-cell count stayed 0 in both fixtures (no new ruin corner exercised)

## Decisions Made

- **`FormPanel` wraps the existing plain-DOM `renderCaveat`/`renderLegend` functions via refs, rather than porting them to JSX.** Those two functions are shared by all eight prior mockup HTML files (D-28: byte-identical copy across every panel); reimplementing them as Solid markup would create a second, driftable copy of legend/caveat rendering for exactly the one page that most needs them to match the other four files pixel-for-pixel. `FormPanel` calls them imperatively inside `onMount` against ref'd container divs instead.
- **The caveat and legend are painted once on mount, not resubscribed to `onThemeChange`.** D-15's one background-neutral palette means the field's own colours never change with theme, and both the caveat and legend read their text/border colours from CSS custom properties the browser already repaints for free on `data-theme` change (no canvas pixel in the legend depends on the current theme). Only the field canvas itself imperatively reads CSS custom properties at paint time (axis-label colour, contour-stroke colour) and needs an explicit repaint hook -- confirmed by inspecting both theme screenshots: legend and caveat text flip colour correctly with zero repaint call, field/contour colours also flip correctly because they DO get repainted via `onThemeChange`.
- **Fixed a candidate page-level heading and single page-level theme toggle**, rather than one toggle per panel (the four individual mockup HTML files each carry their own toggle, appropriate there since each is a standalone page; the comparison page is one page, so D-07's "the only interactive element is the theme toggle" reads as singular here).

## Deviations from Plan

None - Task 1 executed as written. No Rule 1/2/3 auto-fixes were needed; the file compiled and passed every acceptance criterion on the first implementation.

## Issues Encountered

- **`npm run typecheck` does not actually typecheck `comparison.tsx` (or any file under `.planning/`).** `tsconfig.json`'s `include` array is `["*.ts", "bench/**/*.ts", "tests/**/*.ts", "tools/**/*.ts", "src/**/*.ts", "src/**/*.tsx", "tests/**/*.tsx"]` -- `.planning/**` is not listed, and nothing under `src/` imports anything under `.planning/`, so `tsc --noEmit`'s program never reaches this file. This is a pre-existing condition of the whole mockups directory (forms 1-4 from plans 06-01/06-03/06-04 are equally unreached by this command), not something introduced here, so the plan's own acceptance criterion ("`npm run typecheck` exits 0") is trivially true rather than load-bearing. To get a real signal, I additionally ran a standalone `npx tsc --noEmit` invocation reproducing `tsconfig.json`'s exact compiler options (`--strict --noUncheckedIndexedAccess --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM,DOM.Iterable,WebWorker --jsx preserve --jsxImportSource solid-js` etc.) pointed directly at `comparison.tsx`: zero errors. Flagging this so a human reviewer knows the acceptance criterion as literally written does not catch a real type error in this file, and so plan 06-06 (or Phase 7 planning) can decide whether `.planning/**/*.tsx` should be added to `tsconfig.json`'s `include` array before Phase 7 starts, if any further `.tsx` mockup work is expected.
- **`AUTO_CHAIN`/`AUTO_CFG` resolved false** (`.planning/config.json`: `workflow.auto_advance: false`, `workflow._auto_chain_active: false`), consistent with plans 06-01/06-03/06-04's own documented finding for this parallel worktree dispatch, but this plan carries its own `autonomous: false` at the top level and Task 2 is explicitly `gate="blocking"` -- a different situation from those three plans' `autonomous: true` frontmatter. The dispatch instructions for this run are explicit and unambiguous that Task 2 must halt regardless of auto-mode state, so unlike 06-01/06-03/06-04 (which substituted an automated-but-visual proxy for a `human-verify` gate and continued), this run performs the same automated-but-visual verification for Task 1's own `<verify><human-check>` (justified identically: no live human channel in this worktree) but then genuinely stops at Task 2 rather than substituting a proxy decision for it, per the explicit checkpoint protocol given to this executor.

## User Setup Required

None - no external service configuration required for the artifact this plan produced.

## Next Phase Readiness

- Task 1's artifact (`comparison.tsx`/`.html`) is complete, committed, and fully verified: all four forms render correctly in both themes, at their own geometry, on both metrics, with the load-failure backstop and narrow-viewport reflow both confirmed.
- Task 2 -- the winning-form decision -- is complete. `form-2-filled-contour` wins; the three rejection reasons are recorded verbatim above, along with three carry-forward findings (A, B, C) and the D-11 fixture-period override.
- Plan 06-05 is COMPLETE. Plan 06-06 can now write `06-HEATMAP-SPEC.md` and the PROJECT.md Key Decision (D-26) from the "Decision: Task 2" section above, and must fold Findings A, B and C into the spec so Phase 7 does not inherit them as surprises.

---
*Phase: 06-heatmap-design-pass*
*Completed: 2026-08-21*

## Self-Check: PASSED

Task 1 (prior run): `comparison.tsx` and `comparison.html` confirmed present on disk. Commit `92f6051` confirmed present. Working tree confirmed clean after the commit, and `git diff --diff-filter=D --name-only HEAD~1 HEAD` confirmed empty (no accidental deletions).

Task 2 (this continuation): commits `92f6051` and `d3de538` confirmed present via `git log --oneline --all`, alongside the three owner-directed fix commits `1f40846`, `ba6c55e` and `aeb46e8`, all five already on this branch before this continuation began. `mockups/comparison.tsx` and `mockups/comparison.html` confirmed present via `find`. No code was written in this continuation; only this SUMMARY.md was edited to record the Task 2 decision, in accordance with the plan's own `<output>` instruction.
