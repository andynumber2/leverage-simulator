---
phase: 07-sweep-engine-and-the-heatmap
plan: 06
subsystem: ui
tags: [permalink, solid, radiogroup, sweep, metric-toggle, wire-format]

requires:
  - phase: 07-sweep-engine-and-the-heatmap
    plan: "07-02"
    provides: "src/colorscale/value-to-color.ts's per-metric colour authority (scaleTypeForMetric, rampPositionForMetric, bandLevelsForMetric) that field-sampler.ts already routes 'annualized' through"
  - phase: 07-sweep-engine-and-the-heatmap
    plan: "07-03"
    provides: "src/sweep/sweep.worker.ts's computeChunkMetrics -- the one-pass annualized computation this plan wires across the runChunk wire"
  - phase: 07-sweep-engine-and-the-heatmap
    plan: "07-05"
    provides: "src/app/state.ts's displayedMetric/setDisplayedMetric/sweepGeneration/resultMode signals, src/sweep/sweep-pool.ts's mergeChunkResult/ChunkMergeInput this plan extends"
provides:
  - "src/app/permalink.ts: PERMALINK_KEYS gains mode/metric (17 keys total), both unconditionally optional on decode (D-18 backward compatibility)"
  - "src/app/components/ResultColumn/SweepModeToggle.tsx and MetricToggle.tsx -- the two segmented controls filling the D-21 result slot"
  - "grid.annualized populated for real by a live sweep (chunkBufferByteLength/runChunk/sweep-pool.ts's merge loop extended to a 4th wire segment)"
affects: [07-07, 07-08, 07-09, 07-10]

actuals:
  tokens: 19196
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "A permalink key that must stay backward-compatible with every link generated before it existed is UNCONDITIONALLY optional on decode (not merely conditionally required like holdingPeriodBars), defaulting rather than rejecting the whole query string when absent"
    - "A radiogroup control that carries the shared PARAMETER_DEFAULTS default-badge/reset affordance even though its own value lives outside BacktestRequest (resultMode is UI chrome, mirroring how tier already does this)"
    - "A result-column control that must render present-but-disabled during load (not conditionally absent) is mounted OUTSIDE the loadStatus()==='ready' gate, with its own disabled prop computed the same way ParameterColumn.tsx's controls already are"

key-files:
  created:
    - src/app/components/ResultColumn/SweepModeToggle.tsx
    - src/app/components/ResultColumn/MetricToggle.tsx
    - tests/app/sweep-controls.browser.test.ts
  modified:
    - src/app/permalink.ts
    - src/app/state.ts
    - src/app/App.tsx
    - src/app/parameter-defaults.ts
    - src/app/styles.css
    - src/sweep/sweep-grid.ts
    - src/sweep/sweep-pool.ts
    - src/sweep/sweep.worker.ts
    - tests/app/permalink.test.ts
    - tests/app/permalink-methodology.test.ts
    - tests/app/permalink.browser.test.ts
    - tests/app/narrow-viewport.browser.test.ts
    - tests/app/parameter-defaults.test.ts
    - tests/app/sweep-tracer.browser.test.ts
    - tests/app/sweep-progressive.browser.test.ts
    - tests/sweep/cancellation.test.ts

key-decisions:
  - "mode and metric are BOTH unconditionally optional on decode, not just mode. decodeParams rejects the WHOLE query string on any single missing required key, and every permalink shared before this plan shipped carries neither key -- if metric were required, every pre-existing single-run link would fail to decode entirely (D-18's own must-have)."
  - "resultMode became an eleventh PARAMETER_DEFAULTS entry (Rule 2/3 auto-fix, src/app/parameter-defaults.ts and its test file are not in this plan's declared files_modified) because SweepModeToggle's own acceptance criteria requires the shared default-badge/reset affordance every parameter control in this app carries."
  - "SweepModeToggle and MetricToggle are mounted OUTSIDE the loadStatus()==='ready' gate (present-but-disabled while loading), not conditionally absent -- required for D-18's 'a permalink carrying sweep mode lands on the sweep' to hold the instant the manifest decodes, and matching ParameterColumn.tsx's own established loading pattern."
  - "MetricToggle carries no PARAMETER_DEFAULTS entry -- unlike SweepModeToggle, Task 3's own acceptance criteria never requires it, and the segment count is invariant at three regardless of contribution amount, so there is no meaningful 'off default' state to badge."
  - "The metric-change re-color proof (sweepGeneration() unchanged + canvas pixels differ) paints into a LOCALLY-OWNED canvas via the real paintSweepField against the real live sweepGrid(), rather than reading HeatmapPanel.tsx's own mounted canvas -- HeatmapPanel.tsx is plan 07-07's declared scope (running concurrently in a sibling worktree, not yet wired to read displayedMetric()) and was explicitly out of bounds for this plan."
  - "Orchestrator-authorized scope extension: chunkBufferByteLength/runChunk/sweep-pool.ts's merge loop extended from a 3-segment to a 4-segment wire layout so grid.annualized is populated by a live sweep, not zero-filled forever. Plan 07-03 deliberately left this uncrossed to avoid destabilizing plan 07-05's concurrent edits to the same merge loop in the same wave; wiring it was always this plan's territory per sweep-grid.ts's own prior header note."

patterns-established:
  - "Pattern: a chunk-failure fallback (buildIncompleteChunkResult) fills every metric array with the typed-array zero default, matching computeChunkMetrics's own D-20/D-28 incomplete-cell convention exactly -- never the ANNUALIZED_UNDEFINED sentinel, which is reserved for a genuinely undefined solver result on an otherwise-complete cell."

requirements-completed: [VIZ-04, METR-06]

coverage:
  - id: D1
    description: "PERMALINK_KEYS gains exactly two keys (mode, metric); every value round-trips for all six mode-by-metric combinations; an unrecognized value is rejected by name; a duplicated mode/metric is rejected by name"
    requirement: METR-06
    verification:
      - kind: unit
        ref: "tests/app/permalink.test.ts -- 'permalink: mode/metric (07-06-PLAN.md Task 1, D-04)' describe block, all 8 tests"
        status: pass
      - kind: unit
        ref: "tests/app/permalink.test.ts -- 'PERMALINK_KEYS carries exactly the seventeen keys...' test"
        status: pass
    human_judgment: false
  - id: D2
    description: "A URL with no mode key decodes to Single run; a pre-07-06 URL carrying neither mode nor metric still decodes to 'ok' -- every link shared before this plan shipped keeps working (D-18)"
    requirement: METR-06
    verification:
      - kind: unit
        ref: "tests/app/permalink.test.ts -- 'a URL with no \"mode\" key decodes to Single run', 'a URL carrying neither \"mode\" nor \"metric\"...' tests"
        status: pass
      - kind: e2e
        ref: "tests/app/permalink.test.ts -- golden runs (all 4 fixtures, none carrying mode/metric, all still decode to 'ok' and reproduce their recorded metrics)"
        status: pass
    human_judgment: false
  - id: D3
    description: "SweepModeToggle fills the D-21 result slot: 'Single run'/'Sweep' segments, D-17 preserves entryDate/leverage across a round trip, entry-date/leverage controls stay present and enabled in sweep mode, disabled while loading, HoldingModeControl.tsx unmodified"
    requirement: VIZ-04
    verification:
      - kind: automated_ui
        ref: "tests/app/sweep-controls.browser.test.ts -- SweepModeToggle section, all 4 tests"
        status: pass
      - kind: other
        ref: "git diff HoldingModeControl.tsx -- empty"
        status: pass
    human_judgment: false
  - id: D4
    description: "MetricToggle always renders exactly three segments; the third segment reads CAGR at contributionAmount 0 and IRR otherwise, never both; the first segment defaults to 'Multiple of contributed'"
    requirement: METR-06
    verification:
      - kind: automated_ui
        ref: "tests/app/sweep-controls.browser.test.ts -- MetricToggle segment-count/D-24/default-selection tests"
        status: pass
    human_judgment: false
  - id: D5
    description: "A metric change is a re-color, not a re-sweep: sweepGeneration() is unchanged across a metric change, and the same live grid paints differently at two metrics through the shipped paintSweepField"
    requirement: METR-06
    verification:
      - kind: automated_ui
        ref: "tests/app/sweep-controls.browser.test.ts -- 'a metric change leaves sweepGeneration() unchanged and re-colors the field...' test"
        status: pass
    human_judgment: false
  - id: D6
    description: "E2 overflow/long-text backstop: at the narrowest supported viewport the three-segment MetricToggle stays contained within its column and neither clips nor overflows"
    verification:
      - kind: automated_ui
        ref: "tests/app/sweep-controls.browser.test.ts -- 'E2 overflow/long-text backstop...' test"
        status: pass
    human_judgment: false
  - id: D7
    description: "grid.annualized is populated with real, varied values by a live sweep (not merely present on the SweepGrid type), respecting the ANNUALIZED_UNDEFINED-never-0 / D-28-incomplete-is-0 sentinel contract"
    requirement: METR-06
    verification:
      - kind: e2e
        ref: "tests/app/sweep-tracer.browser.test.ts -- 'a real sweep populates grid.annualized with real, varied values...' test"
        status: pass
      - kind: unit
        ref: "tests/sweep/cancellation.test.ts -- mergeChunkResult's two tests, extended to prove the 4th segment lands at the correct cell"
        status: pass
    human_judgment: false
  - id: D8
    description: "No permalink key carries the zoom or pan viewport (D-35)"
    requirement: METR-06
    verification:
      - kind: unit
        ref: "tests/app/permalink.test.ts -- 'no key is added for the zoom or pan viewport (D-35)' test"
        status: pass
    human_judgment: false

duration: ~2h
completed: 2026-08-23
status: complete
---

# Phase 07 Plan 06: Sweep Controls, the Permalink Extension, and the Annualized Wire Fix Summary

**Two segmented radiogroups (SweepModeToggle, MetricToggle) fill the D-21 result slot, PERMALINK_KEYS gains a backward-compatible mode/metric extension, and grid.annualized is wired across the runChunk transferable-buffer boundary so a live sweep populates it with real values instead of zeros.**

## Performance

- **Duration:** ~2h
- **Completed:** 2026-08-23
- **Tasks:** 3
- **Files modified:** 19 (3 created, 16 modified)

## Accomplishments

- `src/app/permalink.ts`'s `PERMALINK_KEYS` grows from 15 to 17 keys (`mode`, `metric`), both unconditionally optional on decode -- every permalink generated before this plan shipped (all four golden fixtures included) still decodes to `'ok'`, landing on Single run / the multiple-of-contributed metric.
- `SweepModeToggle.tsx` and `MetricToggle.tsx` are new, mirroring `HoldingModeControl.tsx`'s radiogroup markup exactly, mounted present-but-disabled during load (not conditionally absent) so a permalink already resolved to sweep mode shows the sweep branch the instant the manifest decodes.
- A metric change is proven to be a re-color, not a re-sweep: `sweepGeneration()` is asserted unchanged across a `MetricToggle` selection, and the same live grid is painted at two metrics through the real production `paintSweepField` to prove the pixels genuinely differ.
- Orchestrator-authorized scope extension: `chunkBufferByteLength`/`sweep.worker.ts`'s `runChunk`/`sweep-pool.ts`'s merge loop extended from a 3-segment to a 4-segment wire layout, so `grid.annualized` is populated with real values by a live sweep for the first time -- plan 07-03 computed it correctly but deliberately left it uncrossed to avoid destabilizing plan 07-05's concurrent edits to the same merge loop.

## Task Commits

Each task was committed atomically, plus one additional commit for the orchestrator-authorized scope extension:

1. **Task 1: Extend the permalink allow-list by exactly two keys** - `e88ece8` (feat)
2. **Task 2 + Task 3: SweepModeToggle and MetricToggle fill the D-21 result slot** - `9dc372c` (feat)
3. **Scope extension: wire grid.annualized across the runChunk buffer boundary** - `042fef5` (feat)

Tasks 2 and 3 share one commit: both touch `App.tsx` and `styles.css` in the same edit pass and their acceptance criteria are tested together in one file (`tests/app/sweep-controls.browser.test.ts`), so splitting them would have required artificial partial edits with no independent verification benefit.

## Files Created/Modified

- `src/app/components/ResultColumn/SweepModeToggle.tsx` - New: two-segment radiogroup, D-15's mode switch
- `src/app/components/ResultColumn/MetricToggle.tsx` - New: three-segment radiogroup, D-23/D-24's displayed metric
- `tests/app/sweep-controls.browser.test.ts` - New: Task 2/3's full case list
- `src/app/permalink.ts` - `PERMALINK_KEYS` gains `mode`/`metric`, both unconditionally optional on decode
- `src/app/state.ts` - `writePermalinkUrl`/`applyPermalinkFromLocation` wire both keys through the existing trailing-edge sync; `applyLoadedBundle` schedules a sweep for a decoded sweep-mode link once the bundle is ready
- `src/app/App.tsx` - Mounts `SweepModeToggle`/`MetricToggle`, restructures the result column so both render present-but-disabled during load
- `src/app/parameter-defaults.ts` - Deviation: `resultMode` added as an eleventh registry entry
- `src/app/styles.css` - Deviation: segmented-toggle styles for both new controls
- `src/sweep/sweep-grid.ts` - Scope extension: `chunkBufferByteLength` carries a 4th `annualized` segment
- `src/sweep/sweep-pool.ts` - Scope extension: `ChunkMergeInput`/`mergeChunkResult`/`buildIncompleteChunkResult`/parse offsets extended to the 4-segment layout
- `src/sweep/sweep.worker.ts` - Scope extension: `runChunk` writes the `annualized` view onto the wire
- `tests/app/permalink.test.ts` - Extended: mode/metric round-trip matrix, rejection tests, backward-compat tests
- `tests/app/permalink-methodology.test.ts`, `tests/app/permalink.browser.test.ts`, `tests/app/narrow-viewport.browser.test.ts` - Rule 3 auto-fix: added the two new required `PermalinkParams` fields
- `tests/app/parameter-defaults.test.ts` - Rule 3 auto-fix: entry count 10 -> 11, added `resultMode` case
- `tests/app/sweep-tracer.browser.test.ts` - Rule 1 fix (old `sweep-mode-toggle` button selector) + new end-to-end `grid.annualized` proof test
- `tests/app/sweep-progressive.browser.test.ts` - Rule 1 fix: same selector update
- `tests/sweep/cancellation.test.ts` - Scope extension: `mergeChunkResult` tests extended to prove the 4th segment lands at the correct cell

## Decisions Made

- **`mode` and `metric` are both unconditionally optional on decode**, not just `mode`. `decodeParams` rejects the whole query string on any single missing required key; every permalink generated before this plan shipped carries neither key. Making `metric` required would have silently broken every pre-existing single-run link's decode, directly violating D-18.
- **`resultMode` became an eleventh `PARAMETER_DEFAULTS` entry** (Rule 2/3 auto-fix). `SweepModeToggle`'s own acceptance criteria requires "the shared `PARAMETER_DEFAULTS` default-badge and reset affordance every parameter control in this app carries" -- satisfying that literally requires a registry entry, even though `resultMode` is UI chrome rather than a `BacktestRequest` field (mirroring how `tier` already lives in the same registry for the same reason).
- **Both new controls mount outside the `loadStatus() === 'ready'` gate**, present-but-disabled during load rather than conditionally absent -- required for D-18's "a permalink carrying sweep mode lands on the sweep" to hold the instant the manifest decodes (not one tick later), and matching `ParameterColumn.tsx`'s own established loading pattern for every other control.
- **`MetricToggle` carries no `PARAMETER_DEFAULTS` entry.** Unlike `SweepModeToggle`, Task 3's own acceptance criteria never requires it, and the segment count is invariant at three regardless of contribution amount -- there is no meaningful "off default" state distinct from the label alternation itself.
- **The metric-change re-color proof paints into a locally-owned canvas**, not `HeatmapPanel.tsx`'s own mounted one. `HeatmapPanel.tsx` is plan 07-07's declared scope (running concurrently in a sibling worktree, not yet wired to read `displayedMetric()`) and was explicitly off-limits. Painting the same live `sweepGrid()` at two metrics through the real, shipped `paintSweepField` and finding the pixels differ proves the exact D-24 claim (metric selection re-colors identical data) independent of which canvas element ends up on screen.
- **Orchestrator-authorized scope extension:** `chunkBufferByteLength`/`runChunk`/`sweep-pool.ts`'s merge loop extended from 3 to 4 wire segments. Plan 07-03's `computeChunkMetrics` computed `annualized` correctly but deliberately left the wire layout untouched to avoid destabilizing plan 07-05's concurrent edits to the same merge loop in the same wave; `sweep-grid.ts`'s own prior header note named this plan as the owner of the remaining wiring. The synthetic incomplete-chunk fallback (`buildIncompleteChunkResult`) fills `annualized` with the typed-array zero default, matching `computeChunkMetrics`'s own D-20/D-28 incomplete-cell convention -- never the `ANNUALIZED_UNDEFINED` sentinel, which is reserved for a genuinely undefined solver result on an otherwise-complete cell.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Three pre-existing test files needed the two new required `PermalinkParams` fields**
- **Found during:** Task 1
- **Issue:** Adding `mode`/`metric` as required `PermalinkParams` interface fields broke `tsc --noEmit` for three files outside this plan's declared scope that construct `PermalinkParams` object literals: `tests/app/narrow-viewport.browser.test.ts`, `tests/app/permalink-methodology.test.ts`, `tests/app/permalink.browser.test.ts`.
- **Fix:** Added `mode: 'single', metric: 'multiple'` to each literal, matching each scenario's existing single-run test intent.
- **Files modified:** `tests/app/narrow-viewport.browser.test.ts`, `tests/app/permalink-methodology.test.ts`, `tests/app/permalink.browser.test.ts`
- **Verification:** `npm run typecheck` exits 0; all three files' own test suites pass.
- **Committed in:** `e88ece8` (Task 1 commit)

**2. [Rule 2/3 - Missing critical / blocking issue] `resultMode` added to `PARAMETER_DEFAULTS`, requiring test-file updates outside declared scope**
- **Found during:** Task 2
- **Issue:** `SweepModeToggle`'s own acceptance criteria requires importing and using `PARAMETER_DEFAULTS` for the shared default-badge/reset affordance, which did not exist for `resultMode`. Adding it changed `PARAMETER_DEFAULTS`'s entry count from 10 to 11, breaking `tests/app/parameter-defaults.test.ts`'s exact-count assertion and `tests/app/narrow-viewport.browser.test.ts`'s badge-count `waitFor` (which never reached its target and timed out).
- **Fix:** Added `resultMode` to `src/app/parameter-defaults.ts`'s registry (`isDefault`/`reset` against `resultMode()`/`setResultMode`); updated both test files' expected counts (10 -> 11) and added a `resultMode` case to `parameter-defaults.test.ts`'s store-backed test table.
- **Files modified:** `src/app/parameter-defaults.ts`, `tests/app/parameter-defaults.test.ts`, `tests/app/narrow-viewport.browser.test.ts`
- **Verification:** Both files' full test suites pass (20/20 and 7/7 respectively).
- **Committed in:** `9dc372c` (Tasks 2+3 commit)

**3. [Rule 1 - Bug] Plan 07-01's minimal reachability button's `data-testid` moved from a button to a radio input**
- **Found during:** Task 2
- **Issue:** `tests/app/sweep-tracer.browser.test.ts` and `tests/app/sweep-progressive.browser.test.ts` both queried `[data-testid="sweep-mode-toggle"]` as an `HTMLButtonElement` and called `.click()` directly. Replacing the plan-07-01 button with a radiogroup moved that test-id to the wrapping `<div>`; clicking a div does not check a radio input in a real browser, and since the control now also renders present-but-disabled during load, mere presence in the DOM no longer implies it is clickable.
- **Fix:** Both files' toggle-click helpers now wait for `[data-testid="sweep-mode-sweep"]` specifically to become enabled (not merely present), then click that radio input directly.
- **Files modified:** `tests/app/sweep-tracer.browser.test.ts`, `tests/app/sweep-progressive.browser.test.ts`
- **Verification:** Both files' full suites pass (4/4 and 2/2 respectively).
- **Committed in:** `9dc372c` (Tasks 2+3 commit)

**4. [Rule 3 - Blocking issue] `tests/sweep/cancellation.test.ts`'s `ChunkMergeInput` literals needed the new `annualized` field**
- **Found during:** the orchestrator-authorized scope extension
- **Issue:** Extending `ChunkMergeInput` with a required `annualized: Float32Array` field broke `tsc --noEmit` for this file's two `mergeChunkResult` unit tests, which construct `ChunkMergeInput` literals directly.
- **Fix:** Added `annualized` arrays to both literals with distinguishable values, and extended both tests' assertions to prove the 4th segment merges to the correct cell (the "stale chunk leaves the grid unchanged" test now also seeds and checks `grid.annualized`; the "current-generation chunk merges normally" test now also asserts `grid.annualized`'s post-merge values against the same colPos/rowPos -> gridCell transform the other two arrays use).
- **Files modified:** `tests/sweep/cancellation.test.ts`
- **Verification:** `npm run test -- --run tests/sweep tests/metrics` -- 65/65 pass.
- **Committed in:** `042fef5` (scope-extension commit)

---

**Total deviations:** 4 auto-fixed (2 Rule 3, 1 Rule 1, 1 Rule 2/3 combined), plus the orchestrator-authorized scope extension itself (documented separately per the orchestrator's own instructions, not counted as a deviation).
**Impact on plan:** All four auto-fixes were compile/test breakage directly caused by this plan's own type-signature changes (`PermalinkParams`, `PARAMETER_DEFAULTS`, `ChunkMergeInput`) or DOM-structure changes (the radiogroup replacing a button), in files this plan's changes made stale. No scope creep beyond what was necessary to keep the existing test suite green and each fix's own test intent preserved.

## Issues Encountered

- `tests/app/sweep-controls.browser.test.ts`'s "D-24" test initially failed because `resetAppState()` does not reset the `BacktestRequest` store's `contributionAmount` (it is deliberately reload-scoped, not parameter-scoped, per its own doc comment) -- a prior test in the same file left `contributionAmount` at 200, bleeding into the next test via the module-singleton store. Fixed by explicitly resetting `contributionAmount`/`contributionFrequency` to their defaults in `beforeEach`, alongside the existing `resetAppState()` call.
- The initial narrow-viewport backstop test asserted `document.documentElement.scrollWidth <= viewport width`, which failed at 320px due to `HeatmapPanel.tsx`'s unrelated, unmodified fixed-800px canvas (a pre-existing condition, and explicitly `07-UI-SPEC.md` E3's own separate overflow backstop, owned by a different plan). Narrowed the assertion to `MetricToggle`'s own containment/clip check, which is what Task 3's actual acceptance criterion asks for.
- Both bench suites (`bench/sweep.bench.test.ts`, `bench/sweep-progressive.bench.test.ts`) and the full `npm run test`/`npm run test:app` runs report a pre-existing `dist/` directory missing failure (`tests/app/static-build.test.ts`, `tests/app/offline.browser.test.ts`, `bench/perf-07/08.bench.test.ts`) -- documented as a pre-existing environment gap in 07-03-SUMMARY.md and 07-05-SUMMARY.md, unrelated to any change in this plan. This plan's own scoped `<verify>` commands (per-file/per-directory `npm run test`/`npm run test:app`/`npm run bench` invocations) all pass cleanly.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None. `resultMode`/`displayedMetric` are wired end to end (permalink round-trip, live UI, and now the sweep worker's own wire format for `annualized`).

## Threat Flags

None. `mode`/`metric` extend the SAME allow-list codec T-07-01's existing mitigations already cover (`PERMALINK_KEYS` membership, `getAll`-based duplicate rejection, a named `decodeError` per invalid value, assignment by literal field name only) -- no new trust boundary, no new surface outside the plan's own `<threat_model>`.

## Next Phase Readiness

- `grid.annualized` is now populated for real by every live sweep -- plan 07-07 (SliceChart/SweepLegend/SweepCaption/HeatmapPanel) can wire `displayedMetric()` into `HeatmapPanel.tsx`'s `paintSweepField` call without any further sweep-engine changes.
- `SweepModeToggle`/`MetricToggle` are both stable, tested surfaces plan 07-07/07-08 can build beside (crosshair, hover readout, legend) without touching either control's own files.
- The permalink now carries the full sweep-vs-single and displayed-metric state (D-04's complete delta); Phase 8's curated permalinks can safely author against all 17 keys.
- No blockers.

## Self-Check: PASSED

All 3 newly created files are tracked (`git status --short` shows a clean tree after the final commit): `src/app/components/ResultColumn/SweepModeToggle.tsx`, `src/app/components/ResultColumn/MetricToggle.tsx`, `tests/app/sweep-controls.browser.test.ts`. All three commit hashes this SUMMARY cites (`e88ece8`, `9dc372c`, `042fef5`) are present in `git log`. `HoldingModeControl.tsx` has zero diff against the wave-start base commit, confirmed via `git diff`.

---
*Phase: 07-sweep-engine-and-the-heatmap*
*Completed: 2026-08-23*
