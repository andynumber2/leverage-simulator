---
phase: 01-performance-spike-and-budget-lock
reviewed: 2026-08-16T03:19:16Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - perf-budgets.ts
  - vitest.config.ts
  - .github/workflows/ci.yml
  - bench/accumulator-store.ts
  - bench/browser-commands.d.ts
  - bench/calibration.ts
  - bench/canvas-grid.ts
  - bench/canvas-repaint.bench.test.ts
  - bench/environment-block.ts
  - bench/global-setup.ts
  - bench/kernel.ts
  - bench/kernel.bench.test.ts
  - bench/report.ts
  - bench/sweep-pool.ts
  - bench/sweep.worker.ts
  - bench/sweep.bench.test.ts
  - bench/synthetic-data.ts
  - tests/canvas-grid.test.ts
  - tests/kernel.test.ts
  - tests/perf-budgets.selftest.test.ts
  - tests/report.test.ts
findings:
  critical: 2
  warning: 3
  info: 1
  total: 6
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-08-16T03:19:16Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

This phase builds a benchmark/budget-lock harness whose entire value depends on two properties:
the numbers it produces are real, and a regression genuinely fails CI. Both properties have a
concrete, provable gap.

First, the harness documents a minimum-measurement floor (`MIN_MEASUREMENT_MS = 10`, in
`bench/calibration.ts`) specifically to avoid `performance.now()` timer-resolution/coarsening
artifacts, but nothing in the codebase ever checks a measured repeat against that floor. The
phase's own recorded results (`01-SPIKE-RESULTS.md`) confirm the floor is being silently
violated in production: PERF-02's raw figure is `0.0999...ms` and PERF-05's winning arm
(`putImageData`) is recorded as a literal `0ms`. A `0ms` measurement was fed straight through
`checkBudget` as a "pass" with no diagnostic — this is precisely the failure mode the file's own
header comments (citing Pitfall 1) warn against, and the sibling Rust/WASM spike (01-04) visibly
worked around the same problem with call-batching, while the JS measurements that actually gate
CI did not.

Second, `tests/perf-budgets.selftest.test.ts` (the "gate cannot rot into a no-op" self-test
required by decision D-09) only unit-tests the pure `checkBudget()` helper. The value that
actually fails CI is a separate, independently-written `expect(normalizedMs).toBeLessThanOrEqual(...)`
assertion duplicated in each `*.bench.test.ts` file — `checkBudget`'s return value is used only
to populate the printed/JSON `verdict` field, and `bench/report.ts`'s `assertRunInvariants` never
inspects `verdict` either. If a bench file's `expect()` line were ever removed or weakened,
nothing in this codebase — including the self-test built specifically to catch that — would
notice; CI would exit 0 while the table/JSON artifact quietly showed `verdict=fail`.

Everything else — the kernel's ruin/financing/day-count logic, the canvas-grid equivalence
proofs, the sweep pool's chunk partitioning and worker teardown, the accumulator-store
filesystem bridge, and the CI workflow's token scope — held up under adversarial reading. The two
findings above are structural, not edge cases, and go directly against this phase's stated
purpose (producing trustworthy, gate-enforcing numbers), so they are classified as blockers.

## Critical Issues

### CR-01: Sub-timer-resolution measurements are recorded and pass the budget with no floor check

**File:** `bench/calibration.ts:16-21`, `bench/kernel.bench.test.ts:34-37`, `bench/canvas-repaint.bench.test.ts:154-163`

**Issue:** `MIN_MEASUREMENT_MS = 10` is documented as a hard requirement ("Every repeat ... is
sized to span at least this many milliseconds") to avoid `performance.now()` coarsening and
dead-code-elimination risk, per Pitfall 1. No function in the codebase ever compares a measured
raw value (or a calibration repeat) against this constant — `grep -rn MIN_MEASUREMENT_MS bench
tests perf-budgets.ts` shows it is referenced only in its own declaration and doc comment.

This is not theoretical: `01-SPIKE-RESULTS.md` records PERF-02's raw minimum-of-5 figure as
`0.09999999962747097ms` and PERF-05's winning `putImageData` arm as a literal `0ms`
(`.planning/phases/01-performance-spike-and-budget-lock/01-SPIKE-RESULTS.md:93,96`). A `0ms`
measurement is definitionally at-or-below the timer's resolution — it tells you nothing about
the operation's true cost, only that it completed faster than the clock could resolve. Both
figures were fed through `checkBudget` and recorded as `pass` (0ms and 0.17ms respectively,
against 16ms budgets) with no flag anywhere in the table, JSON artifact, or test output
indicating the figure is not trustworthy.

Two contributing factors compound this: (1) `measureMinOfN` (`bench/calibration.ts:28-40`) always
`await`s `fn()` even when `fn` is synchronous, adding microtask-scheduling overhead on top of
(and comparable in magnitude to) a sub-millisecond kernel call; (2) the sibling Rust/WASM spike in
plan 01-04 explicitly worked around this exact problem — "A single-call measurement that lands at
the timer's resolution floor is amortized via a 5,000-call batched loop inside one timed unit to
recover a resolvable per-call figure, rather than reporting a floor-limited number as if it were
precise" (`01-04-SUMMARY.md`) — proving the team recognized the failure mode, but did not apply
the fix to the JS measurements that are the ones actually feeding the permanent budget gate.

**Why it matters:** The stated purpose of this phase is to produce numbers trustworthy enough to
lock a budget against. A `0ms` figure passing a 16ms budget is not evidence the operation is fast
— it's evidence the instrument couldn't measure it, and the harness cannot currently distinguish
those two cases. As real production code narrows the margin in later phases, a workload that is
genuinely borderline could be measured at 0ms by the same coarsening artifact and pass a budget it
should fail.

**Fix:** Enforce the documented floor at the point of measurement rather than only documenting it.
For example, in `measureMinOfN` or immediately after each `calibrationScore()`/metric call, throw
(or fail the assertion) when the minimum observed repeat is below `MIN_MEASUREMENT_MS`, and for
call sites whose natural single-call cost is under that floor (PERF-02's kernel call, the
`putImageData` arm), adopt the same batched-loop amortization already implemented for the
Rust/WASM spike: run N calls inside one timed span and divide by N to recover a resolvable
per-call figure, e.g.:

```ts
// bench/calibration.ts
export async function measureMinOfN(n: number, fn: () => void | Promise<void>): Promise<number> {
  let min = Number.POSITIVE_INFINITY
  for (let i = 0; i < n; i++) {
    const start = performance.now()
    await fn()
    const elapsed = performance.now() - start
    if (elapsed < min) min = elapsed
  }
  if (min < MIN_MEASUREMENT_MS) {
    throw new Error(
      `measureMinOfN: minimum observed repeat (${min}ms) is below the ${MIN_MEASUREMENT_MS}ms ` +
        'timer-resolution floor — batch more calls per timed unit rather than trusting this figure',
    )
  }
  return min
}
```

### CR-02: The gate-liveness self-test and the run-level invariant check both validate the wrong layer — a removed budget assertion would not be caught

**File:** `tests/perf-budgets.selftest.test.ts:32-52`, `bench/report.ts:219-249`

**Issue:** The actual value that fails CI on a budget breach is the inline
`expect(normalizedMs).toBeLessThanOrEqual(budget.thresholdMs)` written separately in each
`*.bench.test.ts` file (`bench/kernel.bench.test.ts:56`, `bench/canvas-repaint.bench.test.ts:202`,
`bench/sweep.bench.test.ts:125`) — per the header comment in `bench/report.ts:1-8` itself:
"`checkBudget` and `escalationTriggered` exist to compute what the printed table and JSON
artifact show, not to replace the Vitest assertion that fails the run."

Decision D-09 (`01-CONTEXT.md:70-73`) requires: "a test feeds the budget checker a deliberately
over-budget fixture and asserts it exits non-zero with the correct message." The implementation
in `tests/perf-budgets.selftest.test.ts` does not do this — it calls `checkBudget()` directly (a
pure function with no process, no exit code) and asserts its return value is the string `'fail'`.
It never runs the harness, never checks a process exit code, and never touches the `expect()`
assertions that are the real gate.

Compounding this, `assertRunInvariants` (`bench/report.ts:219-249`) — the one place with
run-level visibility into every row, called from `bench/global-setup.ts`'s teardown, which is the
only code that can turn a problem into a non-zero exit independent of any single test file — never
inspects `row.verdict`. It checks that all eight requirement groups are present, that at least one
row is measured, that every `budgetId` is known, and that total runtime is under cap. It does not
check `rows.some(r => r.verdict === 'fail')`.

The consequence: if a future contributor adds a ninth budget row via `recordMeasurement()` but
forgets (or a refactor accidentally drops) the accompanying `expect()` line, or weakens it to a
non-fatal `console.warn`, the printed table and `bench-results.json` would show `verdict=fail`
for that row, and the process would still exit 0. Nothing currently in this test suite — including
the test whose entire purpose is to prevent exactly this — would catch it.

**Why it matters:** This is review focus #2 named in this phase's own charter ("verify the gate
genuinely fails on breach rather than passing vacuously"), and the self-test that exists to prove
it is itself vacuous with respect to the real gate. The harness currently relies entirely on every
future contributor manually remembering to duplicate a correctly-worded `expect()` line in every
new bench file, with zero structural backstop.

**Fix:** Give `assertRunInvariants` (or a new function called from the same teardown) a hard check
against `verdict === 'fail'`, so there is a run-level backstop independent of any single test
file's `expect()`:

```ts
// bench/report.ts, inside assertRunInvariants
const failing = rows.filter((r) => r.verdict === 'fail')
if (failing.length > 0) {
  throw new Error(
    `assertRunInvariants: ${failing.length} row(s) failed budget: ` +
      failing.map((r) => r.budgetId).join(', '),
  )
}
```

Then rewrite `tests/perf-budgets.selftest.test.ts` to prove *that* function — or, per D-09's
literal wording, spawn the actual bench command (or at minimum call `assertRunInvariants`/
`buildFullRowSet` end-to-end) with a deliberately over-budget fixture and assert it throws/exits
non-zero, rather than asserting on `checkBudget` in isolation.

## Warnings

### WR-01: Worker construction failures can hang the sweep pool indefinitely with no diagnostic

**File:** `bench/sweep-pool.ts:64-100`

**Issue:** `runSpikeSweep` constructs `Worker` instances and wraps them with `Comlink.wrap` but
never attaches an `error`/`messageerror` listener to any `Worker`, and never applies a timeout to
`remote.runChunk(...)`. If a worker fails to initialize (e.g., a module-load error inside
`sweep.worker.ts`, or an uncaught exception before `Comlink.expose()` runs), Comlink has no
response to correlate to the in-flight RPC call, and the corresponding `await
remote.runChunk(...)` in `drainQueue` never resolves or rejects. `Promise.all(...)` then never
settles, `measureMinOfN`'s `await fn()` never returns, and the whole `bench` project hangs until
CI's own job-level timeout kills it — with no message pointing at the actual worker failure.

**Why it matters:** This is exactly the "unresolved promises" failure mode this phase's review
brief calls out for the worker pool. A silent multi-hour CI hang with no diagnostic is worse than
a fast, clear failure, and this path is untested (the correctness tests in
`bench/sweep.bench.test.ts` only exercise the happy path).

**Fix:** Attach an `onerror`/`onmessageerror` handler per worker that rejects any of that worker's
in-flight `drainQueue` iteration, or wrap each `remote.runChunk()` call with `Promise.race` against
a bounded timeout that rejects with a diagnostic error naming the worker and chunk:

```ts
worker.addEventListener('error', (event) => {
  // reject the current in-flight chunk promise for this worker with event.message
})
```

### WR-02: `normalize()` has no guard against a zero or non-finite calibration score

**File:** `bench/calibration.ts:88-114`

**Issue:** `calibrationScore()` guards only against `sink` (the accumulator) being non-finite; it
never checks that `min` (the actual timed value returned as the score numerator) is greater than
zero before dividing by `NOMINAL_REFERENCE_MS`. `normalize(rawMs, score)` (`calibration.ts:112-114`)
then divides by that score with no guard either. If `calibrationScore()` ever returns `0` (the
same timer-coarsening risk described in CR-01, applied to the calibration loop itself rather than
the metric), every `normalize()` call downstream silently produces `Infinity` rather than a clear
error naming the actual problem (a broken calibration measurement).

**Why it matters:** Given CR-01 already demonstrates the harness produces literal `0ms` figures in
practice, this is not a purely theoretical gap — it's the same root cause reachable from a
different call site, currently manifesting as a confusing downstream symptom (`Infinity` failing
every budget) instead of a diagnostic pointing at calibration itself.

**Fix:**

```ts
export function calibrationScore(): number {
  // ...existing loop...
  if (min <= 0) {
    throw new Error('calibrationScore: reference loop measured 0ms — timer resolution or coarsening invalidated calibration')
  }
  return min / NOMINAL_REFERENCE_MS
}
```

### WR-03: Budget pass/fail logic is duplicated between `checkBudget` and each bench file's inline assertion

**File:** `bench/report.ts:45-50`, `bench/kernel.bench.test.ts:56`, `bench/canvas-repaint.bench.test.ts:202`, `bench/sweep.bench.test.ts:125`

**Issue:** The comparison `normalizedMs > budgetMs` (fail) / `normalizedMs <= budgetMs` (pass) is
implemented once in `checkBudget()` and re-implemented, separately, as
`expect(normalizedMs).toBeLessThanOrEqual(budgetMs)` in three different bench files. They
currently agree, but there is no shared source of truth enforcing that they always will — a future
edit to one (e.g., changing `checkBudget` to use `>=` for some new requirement's semantics) would
silently desynchronize the printed/JSON verdict from the actual pass/fail outcome, with nothing to
catch the drift.

**Why it matters:** This duplication is also what makes CR-02 possible — because the real gate is
copy-pasted in three places rather than centralized, there is no single function whose liveness a
self-test could verify to cover all three bench files at once.

**Fix:** Extract a single `assertWithinBudget(row: MeasurementRow): void` in `bench/report.ts`
that both computes the row's verdict and performs the `expect()` (or throws, in a
non-Vitest-coupled form the bench files can wrap in `expect(() => ...).not.toThrow()`), and call
it from all three bench files instead of duplicating the comparison inline. This also gives CR-02's
fix a single function to self-test.

## Info

### IN-01: Em dash usage in code comments across nearly all reviewed files

**File:** `perf-budgets.ts`, `bench/*.ts`, `bench/*.bench.test.ts`, `tests/*.ts` (91 occurrences total)

**Issue:** The user's global `CLAUDE.md` states: "Never use the em dash character (—) in any
output: prose, commit messages, code comments, or documentation." A large majority of the doc
comments across every reviewed file use em dashes freely (e.g. `perf-budgets.ts:2`,
`bench/report.ts:1-8`, `bench/kernel.ts:1-22`).

**Fix:** Replace em dashes in comments with a comma, colon, parentheses, or two sentences, per the
stated convention. Not behavior-affecting; low priority relative to CR-01/CR-02, but flagged since
the rule is explicit and the count is high enough that a bulk pass (rather than per-line edits)
is the practical fix.

---

_Reviewed: 2026-08-16T03:19:16Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
