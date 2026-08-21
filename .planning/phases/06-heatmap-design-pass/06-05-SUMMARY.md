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
affects: [06-06]

actuals:
  tokens: 6900
  tasks: 1
  commits: 1

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
  - "comparison.tsx/.html committed and Task 1 verified; Task 2 (the winning-form decision) is a blocking:human checkpoint per this plan's own frontmatter (autonomous: false) and the executor's explicit dispatch instructions -- not decided by this run. See 'Checkpoint: Task 2 halted' below."

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
    verification: []
    human_judgment: true
    rationale: "This plan's own frontmatter sets autonomous: false and Task 2 is type=\"checkpoint:decision\" gate=\"blocking\" -- a real judgement about which of four plot forms wins, explicitly not something this executor is authorized to decide (the dispatch instructions state this in full). AUTO_CHAIN and AUTO_CFG both resolved false (workflow.auto_advance is false, workflow._auto_chain_active is false in .planning/config.json), and even if they had resolved true, gate=\"blocking\" checkpoint:decision tasks are excluded from auto-selection per the executor's own auto-mode rules. Task 2 is HALTED, not completed -- see 'Checkpoint: Task 2 halted' below for the full evidence returned to the orchestrator for a human to decide."

duration: 35min
completed: 2026-08-21
status: halted
---

# Phase 6 Plan 05: D-05 Comparison Page Summary

**Task 1 complete and committed: a hand-rolled Solid.js comparison page renders all four D-02 heatmap forms against the same committed fixture, in both themes, at each form's own geometry, on both multiple-of-contributed and the max-drawdown stress metric -- fully verified. Task 2, the winning-form decision itself, is HALTED at its blocking checkpoint and returned to the orchestrator for a human to decide; this plan is not complete.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-21 (approx, base commit `55d045a`)
- **Completed (Task 1 only):** 2026-08-21
- **Tasks:** 1 of 2 completed; Task 2 halted at its checkpoint
- **Files modified:** 2 (both new)

## Accomplishments

- `mockups/comparison.tsx`: the D-05 comparison page (the one hand-rolled Solid.js file this phase's `06-UI-SPEC.md` Design System row specifies). A `FORMS` array of the four `{id, title, geometry, paint}` entries imports all four paint functions from `./forms/` and the exact four panel titles `06-UI-SPEC.md`'s Copywriting Contract fixes. A single `FormPanel` component renders every one of the eight panels identically (title, canvas, caveat, legend via the shared runtime's `renderCaveat`/`renderLegend`), with no front-runner styling. `ComparisonPage` calls `initTheme()` once, fetches the fixture exactly once via `loadSweepFixture`, and renders nothing but a bare shell until it resolves -- no per-panel spinner, no partial reveal. On a load failure, the shared runtime's own `showFixtureLoadFailure` (already wired inside `loadSweepFixture`) replaces the page with a visible block naming the URL and the error; `ComparisonPage` just stops waiting rather than building a second failure UI. Two static sections: PRIMARY on multiple-of-contributed (D-04's argued metric), STRESS on max drawdown under a `var(--space-2xl)` gap and a short static note, with no instance of "independent trials"/"independent backtests" written directly into this file (the one occurrence in each caveat is imported verbatim from `mockup-runtime.ts`, never restated). Every canvas repaints on `onThemeChange`, unsubscribed in `onCleanup`. The grid uses `repeat(auto-fit, minmax(820px, 1fr))` so it reflows to a single column rather than clipping a panel or forcing horizontal scroll at typical comparison-viewing widths.
- `mockups/comparison.html`: the mount document, a `#comparison-root` div plus `<script type="module" src="./comparison.tsx">`, importing `src/app/styles.css` (via `comparison.tsx`'s own top-of-file import) so both palettes are available before first paint.

## Task Commits

1. **Task 1: The four-way comparison page and the max-drawdown stress section** - `92f6051` (feat)

Task 2 was not committed: it is a `checkpoint:decision gate="blocking"` task and this executor is explicitly instructed not to decide it. No commit exists for Task 2 because no code or decision was produced for it.

## Files Created/Modified

- `.planning/phases/06-heatmap-design-pass/mockups/comparison.tsx` - the D-05 comparison page, Solid entry
- `.planning/phases/06-heatmap-design-pass/mockups/comparison.html` - the document that mounts it

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
- Task 2 -- the winning-form decision -- is NOT complete. This plan cannot be marked done and plan 06-06 (which consumes the winning form and the three rejection reasons to write `06-HEATMAP-SPEC.md`) cannot start until a human makes the Task 2 decision and this plan is resumed to record it.
- The per-form evidence gathered for that decision (repaint figures already measured in 06-01/06-03/06-04, plus direct visual observations from this plan's own rendered comparison page) is compiled in the "Checkpoint: Task 2 halted" section of this executor's final response to the orchestrator, not duplicated here -- once the decision is made, whoever resumes this plan should record the winning option id and the three rejection reasons verbatim in a follow-up edit to this SUMMARY (the plan's own `<output>` instruction), before plan 06-06 begins.

---
*Phase: 06-heatmap-design-pass*
*Halted at Task 2 checkpoint: 2026-08-21*

## Self-Check: PASSED

`comparison.tsx` and `comparison.html` confirmed present on disk via prior `Write` tool success (file state was current in context, no re-read needed). Commit `92f6051` confirmed present via `git log --oneline -5` (see Task Commits section, first line of that output). Working tree confirmed clean (`git status --short` empty) after the commit, and `git diff --diff-filter=D --name-only HEAD~1 HEAD` confirmed empty (no accidental deletions).
