---
phase: 04-first-defensible-backtest-in-the-browser
plan: 06
subsystem: testing
tags: [playwright, vitest, performance-budgets, long-task, ci]

requires:
  - phase: 04-first-defensible-backtest-in-the-browser
    provides: "plan 04-03's bench/preview-server.ts withPreviewServer and the fresh-context/buffered-longtask-observer commands-bridge pattern; plan 04-04's leverage-slider data-testid selectors and state.ts's app-recompute performance measure"
provides:
  - "vitest.config.ts: measureInteractionTiming bench command -- a real Playwright pointer drag of the production leverage slider, wrapped in withPreviewServer"
  - "bench/browser-commands.d.ts: InteractionTimingReport type and its BrowserCommands declaration"
  - "bench/perf-07.bench.test.ts: PERF-07a/07b measured rows, source: 'production'"
affects: ["04-07 (if any later plan extends the interaction-timing harness, this command and its report shape are the reusable base)"]

actuals:
  tokens: 4632
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Real pointer drag over Playwright's page.mouse (move/down/move.../up) against a native range input's own drag-tracking behavior, never a synthetic-event-dispatch loop -- the measured path must include event dispatch, reactive propagation, the kernel run and the canvas repaint, which a page-script dispatch loop would skip the first of and can silently skip the frame boundary too"
    - "A drag's reactive-path proof lives in the harness, not the command: measureInteractionTiming returns recomputeCount and stepCount; bench/perf-07.bench.test.ts throws if recomputeCount is 0 or exceeds stepCount (T-04-27), so a drag that misses the slider fails loudly instead of reporting a trivially passing 0ms PERF-07b"

key-files:
  created:
    - bench/perf-07.bench.test.ts
  modified:
    - vitest.config.ts
    - bench/browser-commands.d.ts

key-decisions:
  - "PERF-07a's measuredMs selection (max, never sum) is proven by a standalone pure function (selectMaxLongTaskDuration) tested directly against a known list inside bench/perf-07.bench.test.ts, rather than by asserting on the browser-side aggregate the command already returns -- the command returns only the aggregate max (matching AppLoadTimingReport's existing shape), so this local, directly-testable function documents and guards the max-not-sum semantics as a regression proof independent of that aggregate."
  - "INTERACTION_DRAG_STEP_COUNT (300) is a named constant in vitest.config.ts, disclosed in every PERF-07 info line alongside the observed recomputeCount, per T-04-26's tampering mitigation: weakening the drag is visible in the artifact, not hidden in a diff."
  - "The literal word 'dispatchEvent' was avoided even in comments inside vitest.config.ts (rephrased to 'synthetic event dispatch' / 'synthetic-event-dispatch loop'), since Task 1's acceptance criterion is a plain whole-file grep count of 0, not scoped to executable code."

requirements-completed: [PERF-07]

coverage:
  - id: D1
    description: "measureInteractionTiming performs a real Playwright pointer drag (mouse down/move x300/up) of the production leverage slider against a vite preview build, never a synthetic input-event dispatch loop, and returns the max long-task duration, max app-recompute duration, both counts, the step count and hardwareConcurrency"
    requirement: PERF-07
    verification:
      - kind: unit
        ref: "npm run typecheck && npm run build (Task 1's declared verify); grep -c 'withPreviewServer' vitest.config.ts = 4, grep -c 'dispatchEvent' vitest.config.ts = 0"
        status: pass
      - kind: e2e
        ref: "npm run bench (live run): recomputeCount=285, stepCount=300, longTaskCount=0 -- the drag reached the reactive path and coalescing reduced 300 pointer-move events to 285 recomputes"
        status: pass
    human_judgment: false
  - id: D2
    description: "PERF-07a (max long task) and PERF-07b (max app-recompute) are recorded through the same five-step measure/normalize/record/assert pipeline every other bench figure uses, each carrying source: 'production' and the WINDOWS.md entry 2 measurement band as a recorded info line"
    requirement: PERF-07
    verification:
      - kind: e2e
        ref: "npm run build && npm run bench -- live run measured PERF-07a=0.00ms (pass, zero long tasks) and PERF-07b=4.43ms normalized against a 16ms budget (pass); .bench/bench-results.json infoLines contain PERF-07-band naming +/-13%/+/-20%, PERF-07a-info, PERF-07b-info"
        status: pass
      - kind: unit
        ref: "bench/perf-07.bench.test.ts > PERF-07a measuredMs selector picks the maximum of a known list, never the sum"
        status: pass
    human_judgment: false
  - id: D3
    description: "No budget, calibration reference or drag was weakened to obtain a passing figure; perf-budgets.ts and bench/calibration.ts remain untouched by this plan"
    requirement: PERF-07
    verification:
      - kind: other
        ref: "git diff --exit-code -- perf-budgets.ts bench/calibration.ts (Task 2's declared verify) exits 0"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-08-19
status: complete
---

# Phase 4 Plan 6: PERF-07 Interaction-Timing Harness Summary

**PERF-07a and PERF-07b go from `unmeasured` to real, passing figures (0.00ms long-task maximum, 4.43ms normalized coalesced-recompute maximum against a 16ms budget) from a genuine Playwright pointer drag of the production leverage slider -- 285 coalesced recomputes out of 300 drag steps, proving D-03's coalescing claim rather than assuming it.**

## Performance

- **Duration:** ~35min
- **Tasks:** 2 (both `type="auto"`)
- **Files modified:** 3 (1 created, 2 modified)
- **Commits:** 2

## Accomplishments

- `measureInteractionTiming`, a new bench command reusing plan 04-03's `withPreviewServer` and fresh-context/buffered-longtask-observer mechanism, performs a real `page.mouse` drag (down, 300 discrete moves, up) across the leverage slider's full width against a production `vite preview` build -- no synthetic `input`-event dispatch anywhere in the path.
- `bench/perf-07.bench.test.ts` records PERF-07a (max long-task duration, 0.00ms: zero long tasks fired, the passing outcome the budget asks for) and PERF-07b (max `app-recompute` duration, 4.43ms normalized) through the same five-step measure/normalize/record/assert shape every other bench file follows.
- A harness-level reactive-path check (T-04-27): the test throws if `recomputeCount` is 0 or exceeds the drag's `stepCount`, so a drag that misses the slider or never reaches the reactive path fails loudly instead of reporting a trivially passing 0ms figure. The live run observed `recomputeCount=285` from `stepCount=300`, direct evidence that D-03's rAF coalescing is genuinely exercised.
- Every PERF-07 row carries the WINDOWS.md entry 2 measurement band (+/-13% single-run, +/-20% two-run) plus reproducibility disclosure (raw/normalized figures, calibration score, step count, recompute count, long-task count, `hardwareConcurrency`) as recorded info lines.
- With this plan, all five `implementedInPhase: 4` budget rows (PERF-07a, PERF-07b, PERF-08a, PERF-08b, PERF-08c) are measured -- Phase 4's last two unmeasured rows are closed out.

## Task Commits

1. **Task 1: A real synthetic drag of the leverage slider, instrumented for long tasks and recompute duration** - `9659e95` (feat)
2. **Task 2: Record PERF-07a and PERF-07b with their measurement band** - `8aec39b` (feat)

## Files Created/Modified

- `vitest.config.ts` - `measureInteractionTiming` bench command; `INTERACTION_DRAG_STEP_COUNT` (300) named constant
- `bench/browser-commands.d.ts` - `InteractionTimingReport` type and its `BrowserCommands` declaration
- `bench/perf-07.bench.test.ts` - PERF-07a/07b measurement, `selectMaxLongTaskDuration`'s max-not-sum regression test

## Decisions Made

See `key-decisions` in frontmatter: the `selectMaxLongTaskDuration` pure-function proof pattern, `INTERACTION_DRAG_STEP_COUNT`'s disclosure requirement, and the `dispatchEvent`-in-comments avoidance.

## Deviations from Plan

None -- plan executed exactly as written. `perf-budgets.ts` and `bench/calibration.ts` are unmodified (`git diff --exit-code` confirms). No `src/app/**` file was touched, honoring the concurrency boundary with plan 04-05's parallel worktree.

## Issues Encountered

An early `grep -c 'dispatchEvent' vitest.config.ts` check failed at 2 because two doc comments used the literal word "dispatchEvent" to describe what the drag does *not* do. Reworded to "synthetic event dispatch" / "synthetic-event-dispatch loop" -- no code change, comment-only, resolved before commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `measureInteractionTiming` and its `InteractionTimingReport` shape are ready to extend if a later plan needs to measure a different continuous-input control the same way.
- The T-04-27 reactive-path check (`recomputeCount` strictly between 0 and `stepCount` exclusive-inclusive) is a reusable pattern for any future interaction harness that drives a real UI control and needs to prove it actually reached the app's reactive path.
- No blockers carried forward from this plan.

## Self-Check: PASSED

All 3 claimed files verified present on disk; both claimed commit hashes (`9659e95`, `8aec39b`) verified present in `git log`.

---
*Phase: 04-first-defensible-backtest-in-the-browser*
*Completed: 2026-08-19*
