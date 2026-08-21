---
phase: 06-heatmap-design-pass
plan: 06
subsystem: ui
tags: [heatmap, colorscale, canvas, design-decision, spec]

requires:
  - phase: 06-heatmap-design-pass
    plan: 05
    provides: "the owner's Task 2 decision (form-2-filled-contour wins), the three verbatim rejection reasons, and findings A/B/C, recorded in 06-05-SUMMARY.md"
  - phase: 06-heatmap-design-pass
    plan: 01
    provides: "src/colorscale/value-to-color.ts, src/data/sweep-fixture-format.ts, the committed sweep-fixture.bin"
provides:
  - "06-HEATMAP-SPEC.md: the full implementable heatmap treatment Phase 7 is planned and verified against (D-26) -- chosen form, value-to-colour mapping, categorical cell rendering, legend, VIZ-10 caveat, per-form geometry, measured repaint figures, fixture facts, and the three carried-forward findings"
  - "A PROJECT.md Key Decision naming the winning form, the three losing forms and why each lost, alongside the two Phase 1 architecture decisions"
affects: [phase-7-heatmap-implementation]

actuals:
  tokens: 5000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Spec-writing task re-runs the project's own bench suite live (npm run build && npm run bench) rather than trusting stale SUMMARY-recorded figures, so every numeric value in a binding spec matches a freshly generated .bench/bench-results.json rather than a snapshot from an earlier plan"

key-files:
  created:
    - .planning/phases/06-heatmap-design-pass/06-HEATMAP-SPEC.md
  modified:
    - .planning/PROJECT.md

key-decisions:
  - "Used the CURRENT 10-year sweep fixture's decoded counts (ruinedCount=0, incompleteCount=2600, minMultiple=0.00038, maxMultiple=84.24, clippedBelowCount=135, clippedAboveCount=0) rather than 06-01-SUMMARY.md's stale 20-year figures the plan's own acceptance criteria literally cite. The fixture's holding period changed 20yr to 10yr (commit 1f40846) after 06-01 was written and before this plan ran; the orchestrator's decision context explicitly directed describing the CURRENT code state, and the spec's own D-11-override section makes the discrepancy self-documenting rather than silent."
  - "Regenerated .bench/bench-results.json by running npm run build && npm run bench live in this worktree, rather than reusing per-plan figures scattered across 06-01/06-03/06-04/06-05-SUMMARY.md (which were measured at different times against different code states -- e.g. 06-03's form-2 figure of 11.55ms predates the FORM_2_GEOMETRY height change to 240px). This run's figures (0.65/14.12/0.69/0.98ms) are what the plan's own acceptance criteria check against, matching the currently committed code exactly."
  - "Bound five findings into HEATMAP-SPEC.md section 10, not three: F-04 and F-01 from 06-CONTEXT.md (named explicitly in the plan's own acceptance criteria: 'coarser default grid'+'unspent', and 'VIZ-09'+'D-19'), plus Findings A/B/C from 06-05-SUMMARY.md (named explicitly in the orchestrator's decision context). The plan's <action> text and the orchestrator's decision context each named a different set of 'three findings' for the same section; both sets are load-bearing against different acceptance checks, so both are included rather than picking one set over the other."

requirements-completed: [VIZ-05, VIZ-07, VIZ-10]

coverage:
  - id: D1
    description: "06-HEATMAP-SPEC.md: the implementable heatmap treatment -- chosen form, value-to-colour mapping table with every RAMP_STOPS hex, categorical cell rendering (ruin hatch geometry, incomplete-hold grey), legend structure, VIZ-10 caveat placement, per-form geometry for all four forms, measured repaint figures, fixture facts, and findings F-04/F-01/A/B/C plus the D-11 override and D-07 hover carve-out"
    requirement: VIZ-07
    verification:
      - kind: other
        ref: "grep -c 'value-to-color.ts' 06-HEATMAP-SPEC.md returns 5; every RAMP_STOPS hex (#08519C/#3182BD/#A9A29A/#E6550D/#A63603) confirmed present in both the spec and src/colorscale/value-to-color.ts; literal strings 'Ruined: position reached zero' and 'Holding period incomplete' present; the exact VIZ10_CAVEAT_SENTENCES text present as one unbroken string; ruinedCount/incompleteCount/clippedBelowCount/clippedAboveCount present with the current fixture's real decoded values; 'coarser default grid'+'unspent' co-located (F-04); 'VIZ-09'+'D-19' co-located (F-01); 'hover' and 'open' in the same sentence; zero em dash characters in the file"
        status: pass
    human_judgment: false
  - id: D2
    description: "PROJECT.md Key Decisions table gains one row recording the winning form, the three losing forms and why each lost, citing the four normalized repaint figures with machine/core count, and pointing to 06-HEATMAP-SPEC.md for implementable detail"
    requirement: VIZ-10
    verification:
      - kind: other
        ref: "git diff --stat .planning/PROJECT.md shows 1 insertion, 0 deletions; git diff .planning/PROJECT.md shows no removed lines; grep -c 'HEATMAP-SPEC' .planning/PROJECT.md returns 1; zero em dash characters within the new row"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-08-21
status: complete
---

# Phase 6 Plan 06: 06-HEATMAP-SPEC.md and the PROJECT.md Key Decision Summary

**Wrote 06-HEATMAP-SPEC.md, the implementable contract binding Phase 7 to `form-2-filled-contour`'s value-to-colour mapping, categorical cell rendering, legend, caveat, and per-form geometry -- with every numeric value copied from source or from a freshly regenerated `.bench/bench-results.json` -- plus a matching PROJECT.md Key Decision.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-21 (approx, base commit `8e2d350`)
- **Completed:** 2026-08-21T19:18:43Z
- **Tasks:** 2 of 2 completed
- **Files modified:** 2 (1 new, 1 modified)

## Accomplishments

- `.planning/phases/06-heatmap-design-pass/06-HEATMAP-SPEC.md`: the eleven-section implementable treatment. Names `form-2-filled-contour` as the winner and copies the three rejection reasons verbatim from `06-05-SUMMARY.md`. States `src/colorscale/value-to-color.ts` as the authority for the value-to-colour mapping and reproduces every `RAMP_STOPS` hex, `DOMAIN_LOG_MIN`/`DOMAIN_LOG_MAX`, `LEGEND_TICK_MULTIPLES`, `RUIN_BASE_RGBA`, and `INCOMPLETE_RGBA`. Documents the D-18 hatch geometry (6px period, 2px stroke, clipped-region fill, not per-cell), the D-24/D-25 legend structure, and the exact two VIZ10_CAVEAT_SENTENCES with their placement. Records all four forms' geometry constants and a freshly measured set of four normalized repaint figures. Decodes the CURRENT committed sweep fixture for its real `ruinedCount`/`incompleteCount`/`minMultiple`/`maxMultiple`/`clippedBelowCount`/`clippedAboveCount`, explaining what each means. Binds five findings into section 10 (F-04, F-01, A, B, C), states Finding A's O(display area) cost as a named Phase 7 implementation obligation (offscreen-canvas caching for pan/zoom), records the D-11 fixture-period override with the owner's stated rationale, and states the D-07 hover-readout carve-out as an explicitly open Phase 7 decision.
- `.planning/PROJECT.md`: one new Key Decisions row, in the same table as the two Phase 1 architecture decisions, naming the winner, all three losers and why each lost, citing the four normalized repaint figures with machine and core count, and pointing to `06-HEATMAP-SPEC.md` for implementable detail rather than duplicating palette stops or hatch geometry inline.

## Task Commits

Each task was committed atomically:

1. **Task 1: 06-HEATMAP-SPEC.md, the implementable treatment** - `92cc315` (docs)
2. **Task 2: The PROJECT.md Key Decision** - `163ac1a` (docs)

## Files Created/Modified

- `.planning/phases/06-heatmap-design-pass/06-HEATMAP-SPEC.md` - the implementable heatmap contract (D-26)
- `.planning/PROJECT.md` - one new Key Decisions row

## Decisions Made

- **Used the current 10-year fixture's real decoded counts, not the plan's literally-cited (and now stale) 06-01-SUMMARY.md figures.** The fixture's holding period changed 20yr to 10yr (commit `1f40846`, made by the owner between plan 06-05's Task 2 halt and its continuation) after 06-01-SUMMARY.md was written. The orchestrator's decision context for this plan explicitly directed describing the CURRENT code state, so `06-HEATMAP-SPEC.md` decodes `sweep-fixture.bin` directly rather than trusting the plan's own `<read_first>`/acceptance-criteria references to the pre-refresh document. The discrepancy (5150 vs 2600 incomplete cells, 0 vs 135 clipped-below cells) is made self-documenting via the spec's own "D-11 override" section rather than silently swapped in.
- **Regenerated `.bench/bench-results.json` live** (`npm run build && npm run bench`) rather than stitching together the four forms' repaint figures from four different SUMMARY.md files written at four different times against four different code states (06-03's form-2 figure of 11.55ms, for instance, predates the `FORM_2_GEOMETRY` height change from 200 to 240px that 06-05's owner-directed fixes made). This run's figures (form 1: 0.65ms, form 2: 14.12ms, form 3: 0.69ms, form 4: 0.98ms, all normalized) are what the plan's own acceptance criteria check the spec against, and they reflect the code exactly as committed.
- **Bound five findings into section 10, not three.** The plan's own `<action>` text names Findings F-04 (PERF-03's unspent lever) and F-01 (VIZ-09's missing mockup) from `06-CONTEXT.md`, and its acceptance criteria grep for both. The orchestrator's decision context separately directs binding Findings A, B and C from `06-05-SUMMARY.md` (the O(display area) cost obligation, the unlabelled contour levels, and the unexercised ruin hatch). Both sets are load-bearing against different verification paths, so both are included.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Em dash characters removed throughout the drafted spec**
- **Found during:** Task 1, self-verification against the plan's own acceptance criterion ("The spec contains no em dash character")
- **Issue:** The first draft used 42 em dashes as a parenthetical/aside marker, following the surrounding codebase's own prose style, which directly violates both the plan's explicit acceptance criterion and this project's global style rule against the character
- **Fix:** Rewrote every instance using a comma, colon, semicolon, parentheses, or a sentence break, verified by a python character-count scan returning zero
- **Files modified:** `.planning/phases/06-heatmap-design-pass/06-HEATMAP-SPEC.md`
- **Verification:** `python3 -c "print(open(...).read().count('—'))"` returns 0
- **Committed in:** `92cc315` (Task 1 commit; caught before commit, not a follow-up fix)

**2. [Rule 1 - Bug] VIZ10_CAVEAT_SENTENCES quoted as a markdown blockquote that hard-wrapped mid-sentence**
- **Found during:** Task 1, self-verification against the acceptance criterion requiring the exact caveat text as a single string
- **Issue:** A multi-line `>` blockquote split "not 10,000 independent trials." across a line break, so a substring grep for the full sentence (matching how the two sentences are actually joined at render time via `.join(' ')`) failed
- **Fix:** Collapsed the blockquote to one unwrapped line so the full two-sentence string appears as one unbroken substring
- **Files modified:** `.planning/phases/06-heatmap-design-pass/06-HEATMAP-SPEC.md`
- **Verification:** `grep -c "<full two-sentence string>" 06-HEATMAP-SPEC.md` returns 1
- **Committed in:** `92cc315` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1, both caught and corrected before the task commit via self-verification against the plan's own acceptance criteria, not discovered afterward)
**Impact on plan:** Both fixes are formatting/verification corrections with no change to the spec's substantive content. No scope creep.

## Issues Encountered

- **`.bench/bench-results.json` did not exist in this worktree at plan start** (it is gitignored, so no prior plan's run left it behind). The plan's own `<read_first>` names this file as the source for the four normalized repaint figures. Ran `npm run build && npm run bench` live to generate it fresh against the current committed code, then used its `infoLines` entries (`PERF-05-heatmap-form-1` through `-form-4`) as the authoritative figures, rather than reconstructing them from four different prior SUMMARY.md files measured at four different times.
- **The plan's own acceptance criteria reference `06-01-SUMMARY.md`'s fixture counts, which are stale.** 06-01-SUMMARY.md documents the original 20-year-holding-period fixture; the fixture was regenerated at a 10-year holding period during plan 06-05 (owner-directed, overriding D-11) before this plan ran. Decoded the currently committed `sweep-fixture.bin` directly to get real, current counts rather than either the plan's stale literal reference or a hand-derived estimate, and recorded the override explicitly in the spec's own text so the discrepancy is documented rather than silently resolved.
- **`dist/` was rebuilt during the bench run** (required by pre-existing, unrelated PERF-07/PERF-08 gates in the bench suite) and removed again before either task commit, consistent with every prior plan in this phase.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both of Phase 6's binding artifacts are complete and committed: `06-HEATMAP-SPEC.md` (the implementable treatment) and the PROJECT.md Key Decision (the project-record account of the choice).
- Phase 7 can be planned and verified against `06-HEATMAP-SPEC.md` alone, without reopening the four mockups: every numeric value in it is copied from `src/colorscale/value-to-color.ts`, the committed sweep fixture, or this run's own `.bench/bench-results.json`, and each names its source inline.
- Phase 7's single most important inherited obligation is Finding A: form 2's O(display area) repaint cost (measured 14.12ms of the 16ms budget at this phase's own 800x240 mockup geometry) requires an offscreen-canvas resample-once-per-data-change cache before pan/zoom can be built, or a larger shipped panel will breach both the repaint budget and the 60fps pan/zoom criterion.
- No blockers. Phase 6 is complete.

---
*Phase: 06-heatmap-design-pass*
*Completed: 2026-08-21*

## Self-Check: PASSED

`06-HEATMAP-SPEC.md` confirmed present on disk via prior `test -f` check (exit 0, `grep -c` returned 5). Commits `92cc315` and `163ac1a` confirmed present via `git log --oneline -5`. `git diff --stat .planning/PROJECT.md` confirmed exactly 1 insertion, 0 deletions. Working tree confirmed clean (`git status --short`) after both commits, with `dist/` removed (gitignored, never staged).
