---
phase: 05-attribution-and-the-credibility-surface
plan: 09
subsystem: perf
tags: [bench, attribution, perf-budget, windows-ledger, credibility]

requires:
  - phase: 05-attribution-and-the-credibility-surface
    provides: "05-01's computeAttribution wired inside scheduleRun's existing recompute-start/
      recompute-end mark pair -- this plan measures that wiring, not new wiring"
provides:
  - "A measured, not assumed, PERF-07b figure with attribution live: 49.4% of the 16ms
    coalesced-recompute budget on this run, well clear of the 70% D-20 escalation trigger"
  - "ATTRIBUTION_COUNTERFACTUAL_ARM_COUNT (bench/perf-07.bench.test.ts): the number (3) of extra
    runBacktest calls computeAttribution performs per recompute, named once so Phase 6/7 do not
    have to re-derive it from src/validation/attribution.ts"
  - "WINDOWS.md entry 5: the attribution-cost-multiplied-onto-the-sweep-budget consequence,
    handed to Phase 6/7 as an open question rather than left for them to rediscover"
affects: []

actuals:
  tokens: 2846
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "No new bench file for a computation that already runs inside an existing measurement
      window: confirmed attribution's call site (storeSuccessfulRun, inside scheduleRun's
      recompute-start/recompute-end marks) before assuming a second bench file was needed"
    - "A WINDOWS.md entry immediately waived, not left open: used for a forward-looking finding a
      future phase must read and decide against, as distinct from a current defect blocking ship"

key-files:
  created: []
  modified:
    - bench/perf-07.bench.test.ts
    - .planning/WINDOWS.md

key-decisions:
  - "Confirmed rather than assumed that computeAttribution sits inside scheduleRun's existing
    recompute-start/recompute-end mark pair (src/app/state.ts's storeSuccessfulRun, called from
    inside the try block scheduleRun wraps with performance.mark calls) before touching the bench
    file -- had it been outside those marks, the fix would have belonged to plan 05-01's wiring,
    not to a second bench file here. It was inside, as the plan predicted, so no defect and no
    new file."
  - "The counterfactual arm count (3) is read off src/validation/attribution.ts's own
    buildSubsetValues, not re-derived by inspection alone: of the eight Shapley subsets, four
    contain the compounding factor and require a real kernel call, and one of those four (both
    financing and expense on) reuses actualResult.finalValue rather than re-running the kernel,
    leaving three real runCounterfactualArm calls per recompute."
  - "PERF-07b's Task 1 measurement (49.4% of budget) did not cross the 70% D-20 escalation
    trigger, so no PROJECT.md Key Decisions row was added -- the plan's escalation path is
    conditional and did not fire this run."
  - "WINDOWS.md entry 5 was appended via gsd-tools windows append then immediately waived, not
    left open. The ledger's kind vocabulary and open/fixed status model a defect register; this
    entry is not a defect to fix in this phase, it is a finding Phase 6/7 must read before
    assuming per-cell attribution is free. Waiving with a reason preserves the entry's visibility
    in the ledger without falsely blocking /gsd-ship on a phase that has no heatmap to fix it in."

requirements-completed: [ATTR-01, ATTR-02]

coverage:
  - id: D1
    description: "A single-run parameter change stays inside the 16ms coalesced-recompute budget
      with attribution's extra evaluations live, measured on the declared baseline rather than
      assumed"
    requirement: ATTR-01
    verification:
      - kind: automated
        ref: "npm run bench -- PERF-07b row: measuredMs=4.60ms rawMs, normalizedMs=7.90ms,
          49.4% of the 16ms budget, verdict=pass, source=production"
        status: pass
    human_judgment: false
  - id: D2
    description: "The measurement runs through the existing PERF-07b bench path and its
      normalize-and-verdict pipeline, landing in the bench results artifact with a verdict like
      every other performance figure"
    requirement: ATTR-01
    verification:
      - kind: automated
        ref: ".bench/bench-results.json rows[] PERF-07b entry carries normalizedMs, budgetMs and
          verdict fields identical in shape to every other row"
        status: pass
    human_judgment: false
  - id: D3
    description: "The measured figure is recorded against the same measurement band the project
      already documents, so a single run is not read as a tighter headroom claim than it supports"
    requirement: ATTR-01
    verification:
      - kind: other
        ref: "bench/perf-07.bench.test.ts's pre-existing PERF-07-band info line (WINDOWS.md entry
          2's +/-13% single-run band) is unchanged and still recorded on every run, including
          this one"
        status: pass
    human_judgment: false
  - id: D4
    description: "If the measured figure crosses the escalation trigger, the escalation is
      recorded as a decision rather than the budget being relaxed"
    requirement: ATTR-01
    verification:
      - kind: other
        ref: "Not applicable this run: 49.4% is well under the 70% ESCALATION_TRIGGER_RATIO, so
          no escalation fired and no PROJECT.md row was added. perf-budgets.ts is untouched
          (git diff --stat perf-budgets.ts is empty)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The consequence for the sweep phases is written down in this phase's output:
      attribution figures computed per heatmap cell would multiply onto the performance budget
      with the least headroom in the project"
    requirement: ATTR-02
    verification:
      - kind: other
        ref: ".planning/WINDOWS.md entry 5 (waived) names the 3-extra-arm multiplier and PERF-03
          as the budget it would land on; grep -c attribution .planning/WINDOWS.md returns 3"
        status: pass
    human_judgment: false

metrics:
  duration: ~12min
  completed: 2026-08-21
status: complete
---

# Phase 05 Plan 09: Measuring Attribution's Cost, and Handing the Sweep Phases the Consequence Summary

**Confirmed attribution already runs inside PERF-07b's existing measurement window, measured it
at 49.4% of the 16ms coalesced-recompute budget (comfortable headroom, no escalation), and wrote
the per-cell-heatmap consequence into WINDOWS.md for Phase 6/7 to read before assuming per-cell
attribution is free.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments

- Verified `src/app/state.ts`'s `storeSuccessfulRun` calls `computeAttribution` from inside
  `scheduleRun`'s `recompute-start`/`recompute-end` mark pair, so `bench/perf-07.bench.test.ts`'s
  existing `app-recompute` measurement already covered attribution's extra kernel calls -- no
  05-01 wiring defect, no new bench file.
- Ran `npm run bench` against a real production build: PERF-07b measured 4.60ms raw / 7.90ms
  normalized, 49.4% of its 16ms budget, verdict `pass`, well under the 70% D-20 escalation
  trigger. `perf-budgets.ts` untouched (`git diff --stat perf-budgets.ts` empty).
- Named the counterfactual arm count precisely by reading `src/validation/attribution.ts`'s
  `buildSubsetValues`: of the eight Shapley subsets, four contain the `compounding` factor and
  need a real kernel call, one of those four reuses the cached actual-run value, leaving **3**
  real `runCounterfactualArm` calls per recompute. Added
  `ATTRIBUTION_COUNTERFACTUAL_ARM_COUNT = 3` to the bench file and extended the PERF-07b info line
  to state `attributionLive=true attributionCounterfactualArmCount=3` alongside the existing
  measurement fields.
- Added `.planning/WINDOWS.md` entry 5: names the measured per-recompute cost, the 3-extra-arm
  (4x total) multiplier, and PERF-03 (the 10,000-cell sweep, already the project's
  highest-percentage budget at 80.8% with a recorded D-20 escalation) as the budget it would land
  on if computed per heatmap cell. States the open question for Phase 6/7 -- whether the heatmap
  needs per-cell attribution at all, and if so whether it belongs in the sweep worker pool --
  without deciding it. Appended via `gsd-tools windows append` then immediately waived (this is a
  forward-looking finding, not a current defect), so it stays visible without blocking
  `/gsd-ship`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Re-measure PERF-07b with attribution live** - `67ba3eb` (feat)
2. **Task 2: Hand the sweep phases the attribution cost consequence** - `ddc8e01` (docs)

_Note: no separate plan-metadata commit in this worktree -- the orchestrator makes the final
metadata commit centrally after merge (isolation="worktree")._

## Files Created/Modified

- `bench/perf-07.bench.test.ts` - `ATTRIBUTION_COUNTERFACTUAL_ARM_COUNT` constant; PERF-07b info
  line now states `attributionLive=true` and the arm count; header comment documents the
  confirmed call-site relationship to `src/app/state.ts`
- `.planning/WINDOWS.md` - entry 5 (waived): the attribution-cost-onto-sweep-budget consequence
  for Phase 6/7

## Decisions Made

See `key-decisions` in the frontmatter above for full rationale; briefly:

- Confirmed the call site before touching the bench file, rather than assuming attribution ran
  inside the existing marks.
- Read the counterfactual arm count off `attribution.ts`'s own subset-evaluation logic (3, not
  4 or 8) rather than guessing from the "eight subsets" prose alone.
- No escalation this run (49.4% of budget), so no `PROJECT.md` Key Decisions row.
- WINDOWS.md entry appended then immediately waived, since it names a future-phase decision, not
  a present defect.

## Deviations from Plan

None - plan executed exactly as written. The measurement confirmed the plan's own prediction
(attribution already inside the existing mark pair) rather than surfacing a defect to fix.

## Issues Encountered

`npm run bench` initially failed both PERF-07 and PERF-08 test files with "dist/index.html does
not exist" -- these two bench files run against a real production preview build, and no `dist/`
existed yet in this fresh worktree checkout. Ran `npm run build` first (not part of this plan's
own file-modification scope; build output is gitignored), then `npm run bench` passed cleanly.
This is expected bench-harness behavior (`bench/preview-server.ts`'s own error message says so
explicitly), not a defect in this plan's changes.

This run's PERF-07b figure (49.4% of budget) is a dev-sandbox measurement (hardwareConcurrency 9),
not the D-17 CI baseline. The plan's acceptance criteria for Task 1 do not require a
baseline-width match for PERF-07b (unlike PERF-03, which explicitly withholds its verdict off the
declared 4-core baseline) -- PERF-07b's own bench test recorded `verdict=pass`, `source=production`
with no baseline-width gating, so this figure stands as recorded.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ATTR-01's measurement half of ROADMAP criterion 5 is closed: attribution's extra kernel calls
  keep a single-run parameter change inside the 16ms budget, measured on a real production build,
  not assumed.
- ATTR-02 is closed: Phase 6 and 7 inherit F-04's per-cell-heatmap consequence explicitly via
  `.planning/WINDOWS.md` entry 5, rather than having to rediscover it mid-implementation.
- `npm test` (635/635) and `npx tsc --noEmit` are both green.

## Self-Check: PASSED

- FOUND: bench/perf-07.bench.test.ts
- FOUND: .planning/WINDOWS.md
- FOUND: 67ba3eb (Task 1 commit)
- FOUND: ddc8e01 (Task 2 commit)

---
*Phase: 05-attribution-and-the-credibility-surface*
*Completed: 2026-08-21*
