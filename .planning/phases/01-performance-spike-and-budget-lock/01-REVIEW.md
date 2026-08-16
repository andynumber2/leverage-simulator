---
phase: 01-performance-spike-and-budget-lock
reviewed: 2026-08-16T04:50:00Z
depth: standard
files_reviewed: 25
files_reviewed_list:
  - .github/workflows/ci.yml
  - bench/accumulator-store.ts
  - bench/browser-commands.d.ts
  - bench/calibration.ts
  - bench/canvas-grid.ts
  - bench/canvas-repaint.bench.test.ts
  - bench/environment-block.ts
  - bench/global-setup.ts
  - bench/hang-fixture.worker.ts
  - bench/kernel.bench.test.ts
  - bench/kernel.ts
  - bench/report.ts
  - bench/selftest/over-budget.selftest.ts
  - bench/sweep-pool.ts
  - bench/sweep.bench.test.ts
  - bench/sweep.worker.ts
  - bench/synthetic-data.ts
  - bench/throw-fixture.worker.ts
  - package.json
  - perf-budgets.ts
  - tests/calibration.test.ts
  - tests/canvas-grid.test.ts
  - tests/kernel.test.ts
  - tests/perf-budgets.selftest.test.ts
  - tests/report.test.ts
  - vitest.config.ts
findings:
  critical: 0
  warning: 2
  info: 1
  total: 3
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-08-16T04:50:00Z
**Depth:** standard
**Files Reviewed:** 25
**Status:** issues_found

## Summary

This is a re-review of a harness that already went through one round of code review. All five
findings from the prior round (`CR-01` sub-floor measurements passing silently, `CR-02` the
gate-liveness self-test validating the wrong layer, `WR-01` unbounded worker hangs, `WR-02`
missing calibration-score guards, `WR-03` duplicated budget comparison logic) are verified fixed
by direct code reading: `measureMinOfN`/`measureBatchedMinOfN` now enforce `MIN_MEASUREMENT_MS`
at the point of measurement, `assertRunInvariants` now inspects `verdict === 'fail'` as the single
authoritative gate and `tests/perf-budgets.selftest.test.ts` now spawns the real
`bench:selftest` command and asserts its exit code, `sweep-pool.ts` now attaches
`error`/`messageerror` listeners plus a per-chunk timeout with two dedicated fixture workers
proving both failure paths, `normalize`/`calibrationScore` now throw on non-finite or
non-positive scores, and the three `*.bench.test.ts` files now route through a single
`assertWithinBudget` helper. The prior `IN-01` em-dash finding is also clean (`grep` for `—`
across every reviewed file returns zero matches).

To verify the fixes are real rather than cosmetic, this review ran `npm run typecheck` (clean),
`npm test` (75/75 passing, including the D-09 self-test that spawns a real child process and
checks its exit code), and `npm run bench` (full browser suite, all three real measurement arms
recorded a `pass` verdict end-to-end against a real Playwright/Chromium instance). The measurement
chain — calibration, floor enforcement, worker-pool partitioning, budget comparison, and the
run-level invariant gate — held up under this adversarial pass; no new blocker was found.

Two new findings surfaced from tracing the calibration/measurement chain across files rather than
reading each file in isolation, both classified as warnings because they degrade the harness's
trustworthiness as a diagnostic/reproducibility tool without producing a false pass on a real
regression today.

## Warnings

### WR-04: `measureMinOfN` lacks the non-finite guard its own sibling loop (`calibrationScore`) was given

**File:** `bench/calibration.ts:33-52` (compare to `bench/calibration.ts:130-160`)

**Issue:** `calibrationScore()`'s inline min-tracking loop explicitly guards against a non-finite
minimum before it can silently propagate (`if (!Number.isFinite(min) || min < MIN_MEASUREMENT_MS)`,
line 152), with a comment directly naming this file's own prior WR-02 finding as the reason. The
near-identical loop in `measureMinOfN` (the function every `*.bench.test.ts` file actually calls
to record PERF-02/03/05) only checks `min < MIN_MEASUREMENT_MS`:

```ts
// bench/calibration.ts:44
if (min < MIN_MEASUREMENT_MS) {
  throw new Error(...)
}
```

If every repeat's `elapsed = performance.now() - start` were ever `NaN` (a broken/mocked timer,
not a broken `fn`, since a throwing `fn` would already reject the surrounding `await`), the
comparison `elapsed < min` is false for every iteration, so `min` never leaves
`Number.POSITIVE_INFINITY`. The floor check `Infinity < 10` is also false, so `measureMinOfN`
returns `Infinity` instead of throwing the documented, specific floor error. The failure is not
silent end-to-end — every call site immediately feeds this value into `normalize(rawMs, score)`,
which does throw on a non-finite `rawMs` — but it surfaces from a different function with a
generic `"rawMs (Infinity) is non-finite"` message rather than the specific, actionable
`measureMinOfN` diagnostic this file's own header comment promises ("Throws when the minimum
observed repeat is strictly below `MIN_MEASUREMENT_MS`"). This is an incomplete application of the
fix already made one call site over, not a new failure mode.

**Fix:** Mirror `calibrationScore`'s guard:

```ts
if (!Number.isFinite(min) || min < MIN_MEASUREMENT_MS) {
  throw new Error(
    `measureMinOfN: minimum observed repeat (${min}ms) is non-finite or below the ` +
      `${MIN_MEASUREMENT_MS}ms timer-resolution floor: batch more calls per timed unit ` +
      '(measureBatchedMinOfN) rather than trusting this figure',
  )
}
```

### WR-05: The printed/persisted `calibrationScore` reflects whichever bench file recorded it last, not the score actually used for every row

**File:** `bench/accumulator-store.ts:73-81`, `bench/canvas-repaint.bench.test.ts:174`,
`bench/kernel.bench.test.ts:45`, `bench/sweep.bench.test.ts:136`

**Issue:** Each of the three real `*.bench.test.ts` files independently calls `calibrationScore()`
and then `commands.recordEnvironment(captureEnvironment(score))`. `persistEnvironment`
(`bench/accumulator-store.ts:73-81`) unconditionally overwrites the single
`.raw/environment.json` file on every call, so only the last bench file to run in a given
`npm run bench` invocation determines the `calibrationScore` (and full environment block) that
ends up in the printed "=== Environment ===" section and in `bench-results.json`. Verified
empirically: running `npm run bench` in this environment produced a single `calibrationScore:
0.5625` line, even though `runReferenceLoop`'s measured minimum is timing-sensitive and each of
the three bench files computed its own independent score to normalize its own row
(`normalize(rawMs, score)` uses the correct local `score` for the row's own gating comparison, so
`checkBudget`/`verdict` are not affected by this).

The effect is confined to the diagnostic/reproducibility surface, not the gate: a reader trying to
manually reproduce a PERF-02 figure via `rawMs / calibrationScore` using the environment block's
printed score will get a value that does not match what actually produced that row's
`normalizedMs`, because the printed score belongs to whichever of the other two bench files ran
last. Given this phase's own repeated emphasis on reproducibility (the `recordInfoLine` bridge
exists specifically so figures can be manually reproduced from stdout/JSON), a mismatched
calibration score undermines that stated goal.

**Fix:** Either (a) persist a per-row `calibrationScore` alongside `normalizedMs` in
`MeasurementRow` so each row is self-describing rather than depending on a shared, last-write-wins
environment block, or (b) compute `calibrationScore()` once in `global-setup.ts` (Node-side is not
possible today since it must run in the browser context — so alternatively expose it once via a
`beforeAll`/shared fixture and pass it into each test) so exactly one calibration run backs every
row in a given `npm run bench` invocation, or (c) at minimum, note in `renderTable`'s output that
the printed `calibrationScore` is "last recorded, not necessarily the score used for every row
above" so a future reader does not treat it as authoritative for manual reproduction.

## Info

### IN-02: `assertRunInvariants`'s "missing requirement group" check is unreachable via the only production call path

**File:** `bench/report.ts:247-254`, `bench/global-setup.ts:50`

**Issue:** `assertRunInvariants` is documented as checking "every one of the eight requirement
group headers ... must be present," but in production it is only ever called with
`buildFullRowSet(measured)` as input (`bench/global-setup.ts:50`), and `buildFullRowSet` already
synthesizes an `unmeasured` row for every `BudgetId` in `PERF_BUDGETS` (`bench/report.ts:145-166`)
— whose requirement-id coverage is itself guaranteed complete by `perf-budgets.ts`'s own
compile-time exhaustiveness check. So this branch of `assertRunInvariants` can never actually fire
on a real `npm run bench` run; it is only reachable from the hand-crafted, incomplete row arrays
that `tests/report.test.ts` constructs directly. This is defense-in-depth against a future
refactor that stops routing through `buildFullRowSet`, which is reasonable, but the current doc
comment (and the run-level-invariant framing) reads as if this guards the live pipeline today.

**Fix:** No code change required. Consider a one-line comment noting this branch is currently only
reachable from `buildFullRowSet`'s own invariant being violated (i.e., it is a belt-and-suspenders
check on `buildFullRowSet`'s contract, not an independently-exercised path in the real run), so a
future reader does not mistake it for load-bearing production coverage.

---

_Reviewed: 2026-08-16T04:50:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
