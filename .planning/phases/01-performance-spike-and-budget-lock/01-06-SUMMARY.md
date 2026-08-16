---
phase: 01-performance-spike-and-budget-lock
plan: 06
subsystem: testing
tags: [vitest, performance-budget, timer-resolution, web-worker, comlink]

# Dependency graph
requires:
  - phase: 01-performance-spike-and-budget-lock (plan 05)
    provides: assertWithinBudget, the run-level verdict backstop in assertRunInvariants, and the
      bench-selftest gate-liveness proof this plan's floor enforcement had to stay compatible with
provides:
  - measureBatchedMinOfN, a batched-loop amortization helper in bench/calibration.ts that recovers
    a resolvable per-call figure from a sub-floor single-call workload
  - A floor check inside measureMinOfN (throws below MIN_MEASUREMENT_MS) and matching guards in
    calibrationScore and normalize, so a broken or sub-floor measurement can no longer read as a
    silent pass or propagate as Infinity/NaN
  - PERF-02's kernel call and both PERF-05 canvas arms amortized through measureBatchedMinOfN,
    with batch size and batch minimum disclosed via recordInfoLine
  - bench/sweep-pool.ts's workerFactory/chunkTimeoutMs seam, per-worker error/messageerror failure
    promises, and a bounded per-chunk timeout, closing WR-01's hung-worker gap
  - bench/hang-fixture.worker.ts and bench/throw-fixture.worker.ts, the two fixture workers that
    exercise the timeout and error-event failure paths
  - 01-SPIKE-RESULTS.md section 6, the post-gap-closure re-measurement addendum
  - A repository free of the em dash character in tracked *.ts/*.yml/*.json source
affects: [phase-02, phase-03, phase-04, phase-06, phase-07]

# Actuals (#2632)
actuals:
  tokens: 20054
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Batched-loop amortization: a sub-floor single-call workload is timed as a fixed-size batch
      inside one measureMinOfN unit, then divided by the exact integer batch size to recover a
      per-call figure; the floor is enforced against the batch total, never the quotient"
    - "Failure-promise race for Worker RPC: a per-worker promise tied to its error/messageerror
      events, raced via Promise.race against the RPC call and a per-chunk timeout, so a dead or
      hung worker rejects instead of leaving Promise.all permanently pending"
    - "workerFactory/chunkTimeoutMs options seam: production construction stays the untouched
      default path while fixture-worker tests inject failure behavior without touching it"

key-files:
  created:
    - bench/hang-fixture.worker.ts
    - bench/throw-fixture.worker.ts
    - tests/calibration.test.ts
  modified:
    - bench/calibration.ts
    - bench/kernel.bench.test.ts
    - bench/canvas-repaint.bench.test.ts
    - bench/sweep-pool.ts
    - bench/sweep.bench.test.ts
    - bench/report.ts
    - bench/canvas-grid.ts
    - bench/global-setup.ts
    - bench/accumulator-store.ts
    - bench/environment-block.ts
    - bench/synthetic-data.ts
    - bench/sweep.worker.ts
    - bench/kernel.ts
    - bench/selftest/over-budget.selftest.ts
    - tests/report.test.ts
    - tests/canvas-grid.test.ts
    - tests/kernel.test.ts
    - tests/perf-budgets.selftest.test.ts
    - perf-budgets.ts
    - vitest.config.ts
    - .github/workflows/ci.yml
    - .planning/phases/01-performance-spike-and-budget-lock/01-SPIKE-RESULTS.md

key-decisions:
  - "measureBatchedMinOfN is layered over measureMinOfN as an add-alongside peer, not a promotion
    of the primary timing entry point, per the plan's assumption_delta_decision: PERF-03's async
    sweep measurement keeps calling measureMinOfN directly since its raw cost (~186ms) already
    clears the floor by roughly 18x"
  - "calibrationScore's floor/non-finite guard is a second, independently-authored check rather
    than a forced reuse of measureMinOfN's check, because calibrationScore times itself inline and
    is synchronous, and the two sites need different remedy text (raise REFERENCE_ITERATIONS vs
    batch more calls)"
  - "Batch sizes (PERF_02_BATCH_SIZE=500, PUT_IMAGE_DATA_BATCH_SIZE=500, FILL_RECT_BATCH_SIZE=8)
    all cleared the floor on the first empirical run with comfortable margin (28-52ms batch
    minimums against a 10ms floor); no doubling was needed"
  - "DEFAULT_CHUNK_TIMEOUT_MS set to 10 seconds: the full sweep measures roughly 186ms raw across
    the whole pool, so a single chunk exceeding 10s is unambiguously hung, and 10s stays far inside
    the 30s total bench runtime cap"
  - "Em dash removal worked file-by-file with a comma/colon/parentheses/period chosen per
    occurrence for grammatical fit, never a blind regex substitution, per the plan's instruction"

patterns-established:
  - "Every sub-floor single-call measurement site amortizes through measureBatchedMinOfN and
    discloses its batch size and batch minimum via recordInfoLine; a naturally-above-floor site
    keeps calling measureMinOfN directly"
  - "A Worker pool's per-chunk RPC always races against that worker's own failure promise and a
    bounded timeout, never an unguarded await"

requirements-completed: [PERF-01, PERF-01a, PERF-10, PERF-11]

coverage:
  - id: D1
    description: "measureMinOfN throws when its minimum observed repeat is below
      MIN_MEASUREMENT_MS, naming the observed value and the floor, and accepts a repeat exactly at
      the floor"
    requirement: PERF-01a
    verification:
      - kind: unit
        ref: "tests/calibration.test.ts#measureMinOfN: floor enforcement"
        status: pass
      - kind: integration
        ref: "npm run bench (manual confirmation: 11 of 11 passing, no recorded figure reads
          0.00ms)"
        status: pass
    human_judgment: false
  - id: D2
    description: "measureBatchedMinOfN amortizes a sub-floor single-call workload, enforcing the
      floor against the batch total and dividing by the exact integer batch size to recover a
      per-call figure; rejects a zero/negative/non-integer/non-finite batchSize"
    requirement: PERF-01a
    verification:
      - kind: unit
        ref: "tests/calibration.test.ts#measureBatchedMinOfN: batch division and floor contract"
        status: pass
    human_judgment: false
  - id: D3
    description: "PERF-02's kernel call and both PERF-05 canvas arms (fillRect, putImageData)
      route through measureBatchedMinOfN and print their batch size and batch minimum; no
      recorded figure in .bench/bench-results.json reads 0 or 0.00ms"
    requirement: PERF-01a
    verification:
      - kind: integration
        ref: "npm run bench (manual confirmation: PERF-02=0.18ms, PERF-05=0.11ms, both non-zero;
          info lines name both canvas batch sizes and PERF_02_BATCH_SIZE)"
        status: pass
    human_judgment: false
  - id: D4
    description: "calibrationScore and normalize throw on non-finite/zero/negative inputs instead
      of silently producing Infinity or NaN"
    requirement: PERF-01a
    verification:
      - kind: unit
        ref: "tests/calibration.test.ts#calibrationScore: floor and non-finite guards, #normalize:
          broken-input guards"
        status: pass
    human_judgment: false
  - id: D5
    description: "A worker whose runChunk never resolves rejects the sweep within the configured
      timeout, naming the worker index and the chunk range, and terminates all workers"
    requirement: PERF-01
    verification:
      - kind: integration
        ref: "bench/sweep.bench.test.ts#sweep pool: a worker whose runChunk never resolves rejects
          the sweep within the configured timeout... (observed 212ms against a 200ms configured
          timeout)"
        status: pass
    human_judgment: false
  - id: D6
    description: "A worker that throws during module evaluation rejects the sweep with a
      diagnostic naming the worker index, instead of hanging"
    requirement: PERF-01
    verification:
      - kind: integration
        ref: "bench/sweep.bench.test.ts#sweep pool: a worker that throws during module evaluation
          rejects the sweep... (observed 12ms, fired via the error-event path, not the timeout)"
        status: pass
    human_judgment: false
  - id: D7
    description: "01-SPIKE-RESULTS.md gains a section 6 with resolved PERF-02/PERF-05 figures,
      batch sizes, a re-run escalation evaluation, and an explicit note on the unmodified
      PROJECT.md rows; sections 1-5 are untouched"
    requirement: PERF-11
    verification:
      - kind: manual_procedural
        ref: "git diff --stat 01-SPIKE-RESULTS.md shows insertions only (82 insertions, 0
          deletions); grep -c '^## 6\\.' and '^## 5\\. Reproduction steps' both print 1"
        status: pass
    human_judgment: false
  - id: D8
    description: "No tracked *.ts/*.yml/*.json source file outside node_modules and .planning
      contains the em dash character"
    requirement: PERF-11
    verification:
      - kind: automated
        ref: "grep -rlP '\\x{2014}' --include='*.ts' --include='*.yml' --include='*.json' .
          --exclude-dir=node_modules --exclude-dir=.planning --exclude-dir=.bench (prints nothing,
          exits 1)"
        status: pass
    human_judgment: false

duration: 16min
completed: 2026-08-16
status: complete
---

# Phase 1 Plan 06: Timer-Floor Enforcement, Batched Amortization, and Bounded Worker Failure Summary

**`measureMinOfN` now throws below the 10ms timer-resolution floor, `measureBatchedMinOfN` amortizes PERF-02's kernel call and both PERF-05 canvas arms into resolvable per-call figures, and `bench/sweep-pool.ts` bounds a dead or hung worker to a diagnostic rejection instead of a permanently pending `Promise.all`.**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-08-16T04:20:00Z (approx, first file read)
- **Completed:** 2026-08-16T04:35:49Z
- **Tasks:** 3
- **Files modified:** 22 (3 created, 19 modified, plus this SUMMARY)

## Accomplishments

- Closed `01-VERIFICATION.md` Gap 2 in full: the declared `MIN_MEASUREMENT_MS` floor is now
  enforced inside `measureMinOfN`, and the two sub-floor call sites (PERF-02's kernel call, the
  `putImageData` arm) plus a third discovered during the read-first pass (the `fillRect` arm,
  whose raw cost was also under the floor) amortize through the new `measureBatchedMinOfN`.
- Closed WR-01: `bench/sweep-pool.ts` races every chunk against a per-worker failure promise and a
  bounded timeout, so a hung or throw-on-load worker fails the sweep in milliseconds instead of
  hanging until the CI job timeout.
- Applied WR-02's companion guards to `calibrationScore` and `normalize`, so a broken calibration
  score can no longer silently produce `Infinity` or `NaN` for every downstream figure.
- Recorded the resolved figures permanently in `01-SPIKE-RESULTS.md` section 6, with sections 1-5
  left byte-for-byte as the historical floor-limited record.
- Removed all 94 em dash occurrences from tracked `*.ts`/`*.yml`/`*.json` source (91 pre-existing
  plus 3 introduced by this plan's own new prose before being caught), per IN-01.

## Task Commits

Each task was committed atomically:

1. **Task 1: Enforce the timer floor and amortize every sub-floor call site in one slice** - `0e1762c` (feat, tracer/tdd)
2. **Task 2: Make a failed Worker fail the sweep fast and loudly instead of hanging** - `5b986b2` (feat, tdd)
3. **Task 3: Record the resolved figures permanently and remove the em dash character from all source** - `95ca959` (docs)

## Files Created/Modified

- `bench/calibration.ts` - Added the floor check inside `measureMinOfN`, the new
  `measureBatchedMinOfN` helper, and floor/non-finite guards in `calibrationScore` and `normalize`.
- `bench/kernel.bench.test.ts` - PERF-02's kernel call now routes through `measureBatchedMinOfN`
  with `PERF_02_BATCH_SIZE = 500`; prints batch size and batch minimum via `recordInfoLine`.
- `bench/canvas-repaint.bench.test.ts` - Both canvas arms route through `measureBatchedMinOfN`
  with their own batch sizes (`FILL_RECT_BATCH_SIZE = 8`, `PUT_IMAGE_DATA_BATCH_SIZE = 500`).
- `tests/calibration.test.ts` - New. Fast Node unit coverage of all nine Task 1 behavior bullets.
- `bench/sweep-pool.ts` - Added `workerFactory`/`chunkTimeoutMs` to `SweepOptions`,
  `watchWorkerFailure` (per-worker error/messageerror promise), and a per-chunk
  `Promise.race([runChunk, failure, timeout])`.
- `bench/hang-fixture.worker.ts`, `bench/throw-fixture.worker.ts` - New. Exercise the timeout and
  error-event failure paths respectively.
- `bench/sweep.bench.test.ts` - Two new failure-path tests placed before the PERF-03 measurement.
- `.planning/phases/01-performance-spike-and-budget-lock/01-SPIKE-RESULTS.md` - Appended section 6
  with the resolved figures, batch sizes, escalation re-evaluation, and the PROJECT.md pointer note.
- 15 further files (`bench/report.ts`, `bench/canvas-grid.ts`, `bench/global-setup.ts`,
  `bench/accumulator-store.ts`, `bench/environment-block.ts`, `bench/synthetic-data.ts`,
  `bench/sweep.worker.ts`, `bench/kernel.ts`, `bench/selftest/over-budget.selftest.ts`,
  `tests/report.test.ts`, `tests/canvas-grid.test.ts`, `tests/kernel.test.ts`,
  `tests/perf-budgets.selftest.test.ts`, `perf-budgets.ts`, `vitest.config.ts`,
  `.github/workflows/ci.yml`) - Em dash character removed from doc comments and one runtime
  message string, no behavior change.

## Decisions Made

- `measureBatchedMinOfN` added alongside `measureMinOfN` rather than promoted to the primary entry
  point, per the plan's locked `assumption_delta_decision`. PERF-03's async sweep measurement
  keeps calling `measureMinOfN` directly since its raw cost already clears the floor by ~18x.
- `calibrationScore`'s floor guard is authored independently rather than routed through
  `measureMinOfN`, because it times itself inline, is synchronous, and needs different remedy text
  (raise `REFERENCE_ITERATIONS`, never retune `NOMINAL_REFERENCE_MS`).
- Final batch-size constants: `PERF_02_BATCH_SIZE = 500`, `PUT_IMAGE_DATA_BATCH_SIZE = 500`,
  `FILL_RECT_BATCH_SIZE = 8`. All three cleared the floor on the first empirical run (batch
  minimums of 51.9ms, 33.0ms, and 27.9ms respectively against a 10ms floor): no doubling needed.
- `DEFAULT_CHUNK_TIMEOUT_MS = 10_000`: the full sweep's raw wall clock is roughly 186ms across the
  whole pool, so a single chunk exceeding 10s is unambiguously hung, and 10s stays far inside the
  30s `BENCH_TOTAL_RUNTIME_CAP_MS`.
- The throw-fixture worker's failure fired via the `error` event path (observed 12ms), not the
  timeout path, confirming headless Chromium does surface a module-evaluation throw as an `error`
  event on the constructing thread's Worker object.
- Em dash removal worked file-by-file with a comma/colon/parentheses/period chosen per occurrence
  for grammatical fit, per the plan's explicit instruction against a blind regex substitution.

## Deviations from Plan

None: plan executed exactly as written. Both `must_haves.prohibitions` held: the
`MIN_MEASUREMENT_MS` floor was never lowered, disabled or bypassed (verified via
`grep -c 'MIN_MEASUREMENT_MS' bench/calibration.ts` reporting 5 occurrences, up from 1, and via the
unit tests asserting the floor value in every throw message), and every amortized figure discloses
its batch size and batch minimum alongside the derived per-call number, both in `recordInfoLine`
output and in `01-SPIKE-RESULTS.md` section 6.

One self-correction during Task 3: my own newly-authored doc comments in Task 1 and Task 2 (two
lines in `bench/calibration.ts`, one in `bench/kernel.bench.test.ts`, two new fixture-worker file
headers, one in `tests/calibration.test.ts`) initially used the em dash character, in violation of
the operator's global style rule. Caught and fixed before the Task 3 commit, ahead of the
mechanical repo-wide pass, rather than left for Task 3 to discover.

## Issues Encountered

- `bench/report.ts` had 14 em dash occurrences, more than any other single file; one edit attempt
  (line 115's `// Node-only for exactly this reason` comment) failed to match on the first try due
  to a subtle whitespace/context mismatch and succeeded on retry with an identical replacement,
  no functional impact, just a tool-call retry.
- Running `npm run bench:selftest` directly (without the D-09 self-test's isolating
  `BENCH_RESULTS_DIR`) wrote a deliberate `fail` verdict into the real `.bench/bench-results.json`,
  as expected from 01-05-SUMMARY.md's documented behavior. Restored via a clean `npm run bench`
  immediately after, and confirmed `npm test` still passes with no `fail` verdict in the artifact.

## User Setup Required

None: no external service configuration required.

## Next Phase Readiness

- Both gaps `01-VERIFICATION.md` flagged for this phase (the unenforced floor, the unbounded
  worker failure path) are closed. `npm run bench` reports 11 of 11 passing; `npm run
  bench:selftest` still exits non-zero against the deliberate fixture.
- Known limitation carried forward unresolved by design, same as prior plans: no GitHub remote
  exists in this repository, so whether these dev-machine figures hold on the D-17 `ubuntu-latest`
  baseline remains unverified until a real CI run exists.
- No measured figure (PERF-02 at 1.14%, PERF-05's asserted `putImageData` arm at 0.71%, PERF-05's
  informational `fillRect` loser at 40.7%) crosses the 70% `ESCALATION_TRIGGER_RATIO`. No
  deliberate escalation and no third PROJECT.md Key Decision row are owed this phase.
- This closes the last open plan in phase 01. The phase's `01-VERIFICATION.md` gaps are both
  resolved; phase 01 is ready for transition.

---
*Phase: 01-performance-spike-and-budget-lock*
*Completed: 2026-08-16*

## Self-Check: PASSED

All key-files paths (created and modified) confirmed present on disk; all three task commit hashes
(`0e1762c`, `5b986b2`, `95ca959`) confirmed present in `git log --oneline --all`.
