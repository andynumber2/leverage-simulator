---
phase: quick-260827-0yo
plan: 01
subsystem: testing
tags: [vitest, bench-harness, perf-budgets]

requires: []
provides:
  - "tryRecordMeasurement/tryRecordMeasurements: a shared degrade-and-continue helper in bench/report.ts"
  - "bench/perf-07.bench.test.ts and bench/perf-08-export.bench.test.ts rewired onto the shared helper, no per-file try/catch"
affects: [bench, PERF-07]

actuals:
  tokens: 4885
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Record-and-report pattern: attempt a side-effecting write, resolve { persisted, message } instead of throwing, let the caller decide what to do with a failed attempt (an info line here). Callers never see a rejection."

key-files:
  created: []
  modified:
    - bench/report.ts
    - bench/perf-07.bench.test.ts
    - bench/perf-08-export.bench.test.ts
    - tests/report.test.ts
    - tests/accumulator-store.test.ts

key-decisions:
  - "The plural tryRecordMeasurements is implemented as a for-of loop over the singular, awaiting each row in order, never Promise.all: the write-once guard's ordering must stay deterministic and a failure on one row must never abort the loop."
  - "Named the new export tryRecordMeasurement, not recordMeasurement, to avoid shadowing bench/report.ts's existing in-memory accumulator export of that name."

requirements-completed: [QUICK-260827-0yo, PERF-07]

coverage:
  - id: D1
    description: "A losing bench recorder (either file, either order) degrades to an info line instead of throwing"
    requirement: "PERF-07"
    verification:
      - kind: unit
        ref: "tests/accumulator-store.test.ts#tryRecordMeasurements against the real persistMeasurement guard > a lost race degrades rather than rejects, the uncontested row still reaches disk, and the winner keeps its own bytes"
        status: pass
      - kind: unit
        ref: "tests/report.test.ts#tryRecordMeasurement and tryRecordMeasurements describe blocks"
        status: pass
    human_judgment: false
  - id: D2
    description: "A rejected record attempt on one row never prevents a later row in the same file from being attempted (the PERF-07b regression)"
    requirement: "PERF-07"
    verification:
      - kind: unit
        ref: "tests/report.test.ts#tryRecordMeasurements > a rejection on an earlier row does not short-circuit"
        status: pass
      - kind: unit
        ref: "tests/accumulator-store.test.ts#tryRecordMeasurements against the real persistMeasurement guard"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-08-27
status: complete
---

# Quick Task 260827-0yo: Bench recorder collision degrade-and-continue Summary

**Shared `tryRecordMeasurement`/`tryRecordMeasurements` helper in `bench/report.ts` replaces the lone try/catch in `bench/perf-08-export.bench.test.ts` and the unguarded record loop in `bench/perf-07.bench.test.ts`, so whichever file loses the PERF-07a/production race degrades to an info line instead of crashing the run, and a rejected row no longer aborts a later row's own record attempt.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 3
- **Files modified:** 5
- **Commits:** 3

## Accomplishments

- Added `tryRecordMeasurement` (singular) and `tryRecordMeasurements` (plural, index-aligned, never short-circuiting) to `bench/report.ts`. The record function is injected as a parameter, so the helper imports no Node builtin and nothing from `vitest/browser`, keeping it both browser-safe and unit-testable from the Node `unit` project.
- Rewired `bench/perf-07.bench.test.ts` onto the helper: both rows go through one `tryRecordMeasurements` call; any row that fails to persist gets its own `${budgetId}-row-collision` info line (id derived from the row, no hardcoded budget list); both existing figure info lines (`PERF-07a-info`, `PERF-07b-info`) now also state whether their own row persisted. `assertWithinBudget` remains unconditional on both rows.
- Rewired `bench/perf-08-export.bench.test.ts` onto the same helper, deleting its local try/catch and `rowPersisted` flag. Kept its existing `PERF-07a-export-row-collision` info-line id and every per-path figure. Corrected the header comment's wrong assumption that `bench/perf-07.bench.test.ts` always wins the slot first (CI run 33026990805 recorded the opposite order).
- Proved the helper's degradation and per-row-isolation behavior at unit level in `tests/report.test.ts` against a fake recorder, then proved it again in `tests/accumulator-store.test.ts` against the real `persistMeasurement` EEXIST guard: a lost race degrades rather than rejects, the uncontested row still lands on disk via `loadAccumulatedRows`, and the already-claimed slot still holds the first writer's bytes (guard not relaxed).

## Task Commits

1. **Task 1: shared degrade-and-continue helper in bench/report.ts, wired through perf-07 end to end** - `279c587` (fix)
2. **Task 2: rewire perf-08-export onto the same helper, deleting its duplicated try/catch** - `8de058a` (fix)
3. **Task 3: prove the helper against the real EEXIST guard, then run the full gate** - `3b2ba1e` (test)

## Files Created/Modified

- `bench/report.ts` - Adds `RecordAttempt`, `tryRecordMeasurement`, `tryRecordMeasurements` in a new "Recording attempts (degrade-and-continue)" section between the existing Accumulator section and the Full row set section. `recordMeasurement` (the pre-existing in-memory accumulator sink) is untouched.
- `bench/perf-07.bench.test.ts` - Record loop replaced with one `tryRecordMeasurements` call; collision info lines derived from each row's own `budgetId`; persistence token added to both existing figure info lines.
- `bench/perf-08-export.bench.test.ts` - Local try/catch and `rowPersisted` flag replaced with `tryRecordMeasurement`; header comment corrected re: file execution order.
- `tests/report.test.ts` - New `tryRecordMeasurement` and `tryRecordMeasurements` describe blocks (8 tests) using a fake in-memory recorder.
- `tests/accumulator-store.test.ts` - New describe block proving the helper against the real `persistMeasurement`/`loadAccumulatedRows` guard.

## Decisions Made

- Implemented the plural helper as a plain `for...of` loop over the singular (not `Promise.all`), so the write-once guard sees a deterministic write order and one row's rejection can never prevent a later row's attempt.
- Named the helper `tryRecordMeasurement`, not `recordMeasurement`, because `bench/report.ts` already exports `recordMeasurement` as the legacy in-memory accumulator sink; reusing the name would have shadowed it.

## Deviations from Plan

None - plan executed exactly as written.

## Constraint-Gate Results

All hard constraints from the execution prompt were verified directly:

- `git diff --exit-code 3e81f6f -- perf-budgets.ts bench/calibration.ts bench/canonical-calibration.ts` -> exit 0 (byte-identical).
- `git diff --exit-code 3e81f6f -- bench/accumulator-store.ts` -> exit 0 (byte-identical; EEXIST guard untouched).
- `grep -lP '\x{2014}' bench/report.ts bench/perf-07.bench.test.ts bench/perf-08-export.bench.test.ts tests/report.test.ts tests/accumulator-store.test.ts` -> no matches (no em dash in any touched file).
- Neither bench file contains a `try`/`catch` around a record command, nor a directly-awaited `commands.recordMeasurement` call (verified via the plan's own grep gates on de-commented code).
- `assertWithinBudget` still called unconditionally in both bench files (verified via grep count >= 1 in each, and by reading the surrounding code).
- `npm run typecheck` -> exit 0.
- `npm run test` (unit project) -> 63 files passed, 853 tests passed, 0 failed. (One file, `tests/app/static-build.test.ts`, requires a prior `npm run build`; ran `npm run build` once — an unrelated, non-constrained step — to unblock that gate; it does not touch any file this task's constraints govern.)

## Full bench run (informational, not a gate)

Ran `npm run bench` (full, unfiltered suite, 16 files) once to observe real behavior. Confirmed the fix works end-to-end: `PERF-07a`/`production` collided across `bench/perf-07.bench.test.ts` and `bench/perf-08-export.bench.test.ts` exactly as expected, and the losing recorder degraded cleanly:

```
tryRecordMeasurement: budget "PERF-07a" (source "production") was not persisted: persistMeasurement:
budget "PERF-07a" was already recorded this run with source "production"; two recorders for the same
budget and source have no principled winner, so one must downgrade to an info line. Disclosed as an
info line instead; the pass/fail decision is unaffected.
```

No crash, no aborted loop; PERF-07b was recorded successfully in the same file as the collided PERF-07a. All 16 bench files completed (34 tests passed, 1 expected fail from the gate-liveness self-test). The run's teardown then failed on a total-runtime-cap breach (`total bench runtime 30834ms exceeds the declared cap of 30000ms`) — a pre-existing, sandbox-speed-dependent invariant unrelated to recorder collision handling (analogous in kind to the PERF-08 coverage-gate teardown issue already logged in `deferred-items.md`), not fixed here per the task's explicit scope boundary. This sandbox run did not reproduce the exact CI-baseline PERF-07a/PERF-03 breach figures named in the task's "expected remaining failures" note; those are CI-hardware-specific and out of scope regardless.

## Issues Encountered

None beyond the documented, out-of-scope sandbox teardown behavior above.

## Next Phase Readiness

The shared helper is a stable extension point: any future bench recorder contesting a slot calls `tryRecordMeasurement`/`tryRecordMeasurements` rather than writing its own try/catch. No blockers.

---
*Quick task: 260827-0yo*
*Completed: 2026-08-27*

## Self-Check: PASSED

All files created/modified verified present on disk (`bench/report.ts`, `bench/perf-07.bench.test.ts`,
`bench/perf-08-export.bench.test.ts`, `tests/report.test.ts`, `tests/accumulator-store.test.ts`, this
SUMMARY.md). All three task commits (`279c587`, `8de058a`, `3b2ba1e`) verified present in `git log`.
