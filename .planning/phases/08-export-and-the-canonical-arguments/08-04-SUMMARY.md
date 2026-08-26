---
phase: 08-export-and-the-canonical-arguments
plan: 04
subsystem: ui
tags: [solid-js, presets, permalink, share-06, scenarios-overlay]

requires:
  - phase: 08-export-and-the-canonical-arguments
    provides: "08-01: FeaturedPresetRow/ScenariosOverlay mount points and export-row precedent in App.tsx"
  - phase: 08-export-and-the-canonical-arguments
    provides: "08-03: PRESET_DEFINITIONS (src/app/presets.ts), PRESET_OUTCOMES (src/app/presets.generated.ts), computeDerivedMetrics exported from state.ts"
provides:
  - "applyPreset (src/app/state.ts): the one write path that turns a PresetDefinition into live app state through the same validated setters every parameter control uses"
  - "scenariosOverlayOpen/openScenariosOverlay/closeScenariosOverlay (src/app/state.ts): the Scenarios overlay's open/close signal trio, deliberately with no URL flag"
  - "PresetCard, outcomeById (src/app/components/ResultColumn/PresetCard.tsx): one preset card shared by the featured row and the overlay"
  - "FeaturedPresetRow (src/app/components/ResultColumn/FeaturedPresetRow.tsx): the four-card always-visible row plus the 'View all scenarios' trigger"
  - "ScenariosOverlay (src/app/components/ScenariosOverlay.tsx): the full ten-card library, mirroring MethodologyOverlay's shell"
  - "tests/app/scenarios-overlay.browser.test.ts: click-to-permalink, sweep-mode, overlay open/close, tag, and backstop layout coverage"
affects: [08-05]

actuals:
  tokens: 11359
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "A picker overlay (ScenariosOverlay) copies MethodologyOverlay's exact full-screen shell (Show gate, sticky header, close-icon SVG, Escape handler) but omits its defensive live-computed-value cache -- the pattern only needs the live cache when the overlay computes something at open time; a static-data overlay does not."
    - "Multiple validated setters called synchronously in one function (applyPreset) still schedule exactly one recompute: scheduleRun's module-level 'scheduled' guard collapses any number of same-frame calls, so a preset apply is one recompute regardless of how many setters it calls."

key-files:
  created:
    - src/app/components/ResultColumn/PresetCard.tsx
    - src/app/components/ResultColumn/FeaturedPresetRow.tsx
    - src/app/components/ScenariosOverlay.tsx
    - tests/app/scenarios-overlay.browser.test.ts
  modified:
    - src/app/state.ts
    - src/app/App.tsx
    - src/app/styles.css
    - tests/app/presets.test.ts

key-decisions:
  - "The extended-tier tag's UI-SPEC copy ('Extended tier — interpolated data') uses an em dash. ~/.claude/CLAUDE.md's absolute 'never use the em dash character in any output' rule overrides the plan/UI-SPEC instruction to match character-for-character on conflict (per this project's own CLAUDE.md enforcement precedence). Rendered as 'Extended tier - interpolated data' (hyphen) instead. The synthetic tag's copy had no em dash and needed no change."
  - "The Scenarios overlay deliberately carries no URL flag, unlike the methodology overlay (D-14 in the plan). Recorded as a doc comment on scenariosOverlayOpenSignal in state.ts so a later reader does not add the flag by symmetry with methodologyOverlayOpenSignal."
  - "applyPreset's write order is setActiveTier, setScaleMode, setDisplayedMetric, setResultMode, updateBacktestRequest -- tier first because it bounds the entry date the request write validates against. { skipSweep: true } passed to updateBacktestRequest when preset.mode === 'sweep' so setResultMode's own sweep dispatch is the only one that fires (T-08-20), mechanically checked in the browser test via sweepGeneration() advancing by exactly 1, not by reasoning alone."

requirements-completed: [SHARE-06]

coverage:
  - id: D1
    description: "applyPreset turns a PresetDefinition into live app state through the same validated setters every parameter control uses, never a raw store write"
    requirement: SHARE-06
    verification:
      - kind: unit
        ref: "tests/app/presets.test.ts#08-04-PLAN.md Task 1: the parameter mapping applyPreset produces > for every preset, the PermalinkParams applyPreset would produce matches the definition field for field, with bundleVersion sourced from the manifest rather than the definition"
        status: pass
      - kind: e2e
        ref: "tests/app/scenarios-overlay.browser.test.ts > clicking a featured card changes the on-screen result and, once the permalink write settles, produces a URL that decodes to that preset's parameter set"
        status: pass
    human_judgment: false
  - id: D2
    description: "The featured row renders exactly the four D-15 presets, in D-13's unflattering-first declaration order, always visible from the landing state"
    requirement: SHARE-06
    verification:
      - kind: e2e
        ref: "tests/app/scenarios-overlay.browser.test.ts > the featured row renders exactly 4 cards, in D-13/D-15's literal declaration order"
        status: pass
    human_judgment: false
  - id: D3
    description: "The Scenarios overlay holds every preset in the library, opens/closes by trigger, close button and Escape, and renders no DOM while closed"
    requirement: SHARE-06
    verification:
      - kind: e2e
        ref: "tests/app/scenarios-overlay.browser.test.ts > the Scenarios trigger opens the overlay; the overlay renders every entry in the library; the close button and Escape key each close it; no overlay DOM exists while closed"
        status: pass
      - kind: e2e
        ref: "tests/app/scenarios-overlay.browser.test.ts > applying a preset from inside the overlay closes the overlay and lands on the result"
        status: pass
    human_judgment: false
  - id: D4
    description: "The one preset declaring sweep mode opens the sweep and resolves a full grid, carrying mode=sweep in the permalink, with exactly one sweep dispatched per click"
    requirement: SHARE-06
    verification:
      - kind: e2e
        ref: "tests/app/scenarios-overlay.browser.test.ts > clicking the sweep-mode preset switches the app into sweep mode, resolves a grid, carries the sweep mode key in the URL, and schedules exactly one sweep"
        status: pass
    human_judgment: false
  - id: D5
    description: "Synthetic and extended-tier tags render the required copy; the extended-tier preset still shows the full ExtendedTierWarning banner on the result screen"
    requirement: SHARE-06
    verification:
      - kind: e2e
        ref: "tests/app/scenarios-overlay.browser.test.ts > the extended-tier preset's card shows the extended-tier tag, and applying it still shows the full ExtendedTierWarning banner on the result screen"
        status: pass
      - kind: e2e
        ref: "tests/app/scenarios-overlay.browser.test.ts > the synthetic preset's card shows the synthetic tag"
        status: pass
    human_judgment: false
  - id: D6
    description: "Both UI-SPEC E2 backstop layout risks (featured row overflow, overlay long-text clipping) are closed by measurement"
    requirement: SHARE-06
    verification:
      - kind: e2e
        ref: "tests/app/scenarios-overlay.browser.test.ts > backstop: the four-card featured row wraps to a narrower grid rather than overflowing horizontally below the app's existing 900px stacking breakpoint"
        status: pass
      - kind: e2e
        ref: "tests/app/scenarios-overlay.browser.test.ts > backstop: at the narrowest supported viewport, the longest card in the set wraps within its cell rather than being clipped or forcing the cell wider, and the overlay's own scroll container is scrollable rather than clipping"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-08-26
status: complete
---

# Phase 8 Plan 4: Presets, One Click From the Landing State Summary

**applyPreset writes a canonical-argument definition through the app's own validated parameter setters, and a four-card featured row plus a ten-card Scenarios overlay make SHARE-06's "one click, a shareable permalink" real, proven end to end by a real click producing a real decoded URL.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-26T05:08:00Z (approx)
- **Completed:** 2026-08-26T05:20:40Z
- **Tasks:** 3
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments

- Added `applyPreset` to `src/app/state.ts`: writes tier, scale, displayed metric, result mode
  and the full request through `setActiveTier`/`setScaleMode`/`setDisplayedMetric`/
  `setResultMode`/`updateBacktestRequest` -- the same validated setters every parameter control
  uses, asserted mechanically (T-08-16) to call zero module-private signal writers.
- Added the `scenariosOverlayOpen`/`openScenariosOverlay`/`closeScenariosOverlay` trio, mirroring
  the methodology overlay's shape but deliberately carrying no URL flag (D-14): the overlay is a
  picker whose whole output is the applied preset's own permalink.
- Resolved T-08-20's double-sweep risk: `{ skipSweep: true }` passed to `updateBacktestRequest`
  when a preset declares sweep mode, mechanically verified by `sweepGeneration()` advancing by
  exactly 1 across a sweep-preset click.
- Built `PresetCard` (title, outcome line sourced from `PRESET_OUTCOMES` and formatted through
  `src/metrics/format.ts` only, tags), `FeaturedPresetRow` (the four D-15 cards plus "View all
  scenarios") and `ScenariosOverlay` (all ten presets, mirroring `MethodologyOverlay`'s shell
  without its live-computed-value cache).
- Mounted `FeaturedPresetRow` unconditionally below the export row and `ScenariosOverlay`
  unconditionally as the last child of the layout, both present from the landing state (UI-SPEC
  E2 loading/empty).
- No preset card, tag, or the "View all scenarios" trigger is accent-colored; no consumer sorts
  `PRESET_DEFINITIONS`, so declaration order is render order everywhere it is rendered.
- Wrote `tests/app/scenarios-overlay.browser.test.ts`: 9 tests, 44 assertions, covering the
  featured-row order, a real click producing a real decoded permalink, the sweep-mode preset's
  single-dispatch guarantee, overlay open/close/apply, both tags, and both UI-SPEC E2 backstop
  layout checks.

## Task Commits

1. **Task 1: applyPreset -- one click lands on the preset's run and its permalink** - `3099458` (feat)
2. **Task 2: The card, the featured row, and the Scenarios overlay** - `98755ea` (feat)
3. **Task 3: Prove the click, the permalink, and the two backstop layout checks** - `6f803c2` (test)

## Files Created/Modified

- `src/app/state.ts` -- `applyPreset`, `scenariosOverlayOpen`/`openScenariosOverlay`/
  `closeScenariosOverlay`, `scenariosOverlayOpenSignal` reset in `resetAppState`
- `src/app/components/ResultColumn/PresetCard.tsx` -- `PresetCard`, `outcomeById`
- `src/app/components/ResultColumn/FeaturedPresetRow.tsx` -- `FeaturedPresetRow`
- `src/app/components/ScenariosOverlay.tsx` -- `ScenariosOverlay`
- `src/app/App.tsx` -- mounts `<FeaturedPresetRow />` and `<ScenariosOverlay />`
- `src/app/styles.css` -- `.featured-preset-heading`, `.featured-preset-row`,
  `.scenarios-trigger`, `.preset-card` and its children, `.scenarios-overlay` and its children
- `tests/app/presets.test.ts` -- Task 1's Node-side per-preset parameter-mapping assertion
- `tests/app/scenarios-overlay.browser.test.ts` -- Task 3's full browser case list

## Decisions Made

- **The extended-tier tag copy substitutes a hyphen for the source em dash.** 08-UI-SPEC.md's
  Copywriting Contract writes "Extended tier — interpolated data" with an em dash;
  `~/.claude/CLAUDE.md`'s "never use the em dash character in any output" rule is an absolute,
  project-wide override per this project's own CLAUDE.md enforcement precedence, so the rendered
  string is "Extended tier - interpolated data" instead. Documented in `PresetCard.tsx`'s own
  header comment so a later reader does not "fix" it back to match the source document.
- **No URL flag on the Scenarios overlay**, unlike the methodology overlay -- recorded as the
  plan required, on `scenariosOverlayOpenSignal`'s own doc comment in `state.ts`.
- **`applyPreset`'s write order is tier, scale, metric, mode, then the full request** -- tier
  first because it bounds the entry date the request write validates against, matching the
  plan's explicit ordering.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Doc-comment prose tripped this plan's own mechanical acceptance-criteria
greps**
- **Found during:** Task 2, running the plan's own acceptance-criteria checks
- **Issue:** `FeaturedPresetRow.tsx` and `ScenariosOverlay.tsx` documented, in prose, that
  neither file calls `sort()` or copies `MethodologyOverlay`'s `createMemo` -- but writing those
  literal substrings inside a doc comment made `grep -c 'sort(' ...` and
  `sed -n '/createMemo/p' ... | wc -l` both return 1 instead of the required 0, since the grep
  cannot distinguish "this code calls X" from "this comment says the code deliberately does not
  call X."
- **Fix:** Reworded both comments to describe the same fact without the literal trigger
  substrings ("never reorders its elements" / "does not reorder" instead of "no `sort()` call";
  "defensive live-computed-value cache" instead of "`createMemo`").
- **Files modified:** `src/app/components/ResultColumn/FeaturedPresetRow.tsx`,
  `src/app/components/ScenariosOverlay.tsx`
- **Verification:** `grep -c 'sort(' ...` and the `createMemo` `wc -l` check both return 0;
  `npm run typecheck` and `npm run build` still pass.
- **Committed in:** `98755ea` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug), plus the CLAUDE.md-driven em-dash substitution
documented above under Decisions Made (a CLAUDE.md precedence application, not a bug fix).
**Impact on plan:** No scope creep. Both changes are cosmetic to comments/copy; no behavior,
test, or acceptance-criteria outcome changed as a result.

## Issues Encountered

- The three tests exercising non-featured presets (`spx-3x-entry-sensitivity`,
  `spx-3x-high-rate-1979`, `ndx-3x-2000-peak`) initially queried for a `[data-testid="preset-card"]`
  without first opening the Scenarios overlay -- those three presets are not among D-15's four
  featured ids, so they render only inside the overlay's own `<For>`. Fixed by adding an
  `openOverlay(el)` helper and calling it before locating any non-featured preset's card.

## User Setup Required

None -- no external service configuration required. No new runtime dependency was added.

## Next Phase Readiness

- SHARE-06's capability is complete end to end: the featured row and the Scenarios overlay are
  mounted, `applyPreset` is proven to route through validated setters and to produce a correct,
  decodable permalink for both single-run and sweep-mode presets.
- Plan 08-05 (wave 4, `autonomous: false`, carries a human checkpoint) is the phase's closure
  plan and claims all three SHARE requirements (SHARE-04, SHARE-05, SHARE-06) -- this plan's own
  `08-03-SUMMARY.md` already marked SHARE-06 Complete at the data layer; this plan closes it at
  the surface layer. No blocker for 08-05.

---
*Phase: 08-export-and-the-canonical-arguments*
*Completed: 2026-08-26*
