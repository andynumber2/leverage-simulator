---
phase: 01-performance-spike-and-budget-lock
verified: 2026-08-16T05:00:00Z
status: passed
score: 7/7 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/7
  gaps_closed:
    - "A permanent self-test proves the budget gate cannot rot into a no-op when the harness is refactored (D-09) — Gap 1"
    - "Measurements are sized to avoid performance.now() timer-resolution coarsening, per MIN_MEASUREMENT_MS — Gap 2"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Configure a GitHub remote for this repository, push the current branch (or main), open a PR or push to main, and confirm the `bench` workflow in `.github/workflows/ci.yml` runs successfully on ubuntu-latest. Then push a second, deliberately regressed commit (e.g. temporarily lower a PERF_BUDGETS threshold below its measured value) and confirm the GitHub Actions check goes red on that commit, then revert."
    expected: "The first push produces a green `bench` check on ubuntu-latest. The second, deliberately regressed push produces a red `bench` check, with the failure output naming the breached budget id, proving the gate is live in real CI and not merely declared in YAML."
    why_human: "No GitHub remote is configured in this repository (`git remote -v` returns nothing, confirmed independently in this verification pass). Whether GitHub Actions renders a real budget breach as a red check cannot be verified without pushing to an actual GitHub-hosted remote and an actual Actions run — no tool available to this verifier can create that remote or trigger that run. The `.github/workflows/ci.yml` file is syntactically verified (pull_request/push triggers, read-only permissions, ubuntu-latest, npm ci/typecheck/test/bench) and the equivalent local mechanism (a spawned `npm run bench:selftest` against a deliberately over-budget fixture) is directly confirmed to exit non-zero with a message naming the failing budget id in this pass, but that is a local proxy, not the literal CI proof success criterion 5 asks for."
---

# Phase 1: Performance Spike and Budget Lock Verification Report

**Phase Goal:** The architecture is decided by a measured number instead of an estimate, and performance becomes checkable with one command from this point forward
**Verified:** 2026-08-16
**Status:** passed
**Re-verification:** Yes — after gap closure (plans 01-05, 01-06)

## Goal Achievement

This is a re-verification following gap-closure plans 01-05 (run-level budget backstop + spawned gate-liveness proof) and 01-06 (timer-floor enforcement, batched amortization, bounded worker failure). Both gaps recorded in the prior `01-VERIFICATION.md` were independently re-checked against the current codebase, not against SUMMARY.md claims: I read every changed file directly and additionally ran `npm run typecheck`, `npm test`, and `npm run bench` myself in this pass rather than trusting the prior pre-checks.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A throwaway benchmark reports real wall-clock figures on real hardware for the 25,000-bar backtest and the 10,000-cell Canvas repaint, each with a machine and core count attached (SC1) | ✓ VERIFIED | `01-SPIKE-RESULTS.md` §2 and the new §6 addendum both carry machine/core/browser/OS/calibration-score columns. Confirmed directly by running `npm run bench` myself: environment block prints `hardwareConcurrency: 9`, `os: linux 7.1.4-200.fc44.aarch64`, `HeadlessChrome/151.0.7922.34`. |
| 2 | The plain-JS-vs-WASM and hand-rolled-Canvas-vs-charting-library decisions are recorded in PROJECT.md as Key Decisions citing the measured figure that settled them (SC2) | ✓ VERIFIED | `.planning/PROJECT.md` "Key Decisions" table unchanged from prior verification (confirmed no diff to this file by `git status`/`git diff --stat`, consistent with plan 01-06's deliberate scope exclusion). Both rows still cite concrete figures and disclose the floor-value caveat honestly. `01-SPIKE-RESULTS.md` §6 adds an explicit pointer note stating which figure each row cites and that the Canvas row's cited `0ms` is now superseded by the resolved `0.1131ms`, so a later reader does not find a silent discrepancy. |
| 3 | One command (`npm run bench`) prints every metric named in PERF-02 through PERF-09, marking not-yet-built paths as unmeasured (SC3) | ✓ VERIFIED | Ran `npm run bench` directly: prints all 8 requirement group headers (PERF-02 through PERF-09), 11 of 11 tests passing, unmeasured paths (PERF-04, 06, 07a/b, 08a/b/c, 09) correctly marked `verdict=unmeasured`. |
| 4 | The budget file carries a numeric threshold and perception anchor for each of PERF-02 through PERF-09; any threshold looser than its anchor carries a written reason and Key Decision; an unreachable target is escalated rather than relaxed (SC4) | ✓ VERIFIED | `perf-budgets.ts` unchanged (182 lines, 11 entries, all `thresholdMs === anchorMs`). `tests/perf-budgets.selftest.test.ts`'s "PERF-01a anchor invariant" describe block still present and passing (confirmed via `npm test`). `01-SPIKE-RESULTS.md` §6 re-runs the 70% escalation evaluation against the newly resolved figures and finds none crossed. |
| 5 | A deliberately regressed commit fails CI on a budget breach, proving the gate is live rather than declared (SC5) | VERIFIED (resolved 2026-08-17, see below) | No GitHub remote is configured (`git remote -v` returns nothing, confirmed independently). `.github/workflows/ci.yml` remains syntactically correct and unexecuted on real infrastructure. The local proxy for this criterion (a spawned harness command against a deliberately over-budget fixture) is now correctly wired (see Truth 6) and was directly confirmed by me to exit non-zero with the right message, but that is not the literal "fails CI" proof this criterion names, and nothing available to this verifier can create the remote or trigger a real Actions run. Routed to human verification below. |
| 6 | A permanent self-test proves the budget gate cannot rot into a no-op when the harness is refactored (D-09, Gap 1 of the prior verification) | ✓ VERIFIED (Gap 1 closed) | Read `bench/report.ts`: `assertRunInvariants` now collects every row with `verdict === 'fail'` and throws naming all failing budget ids in ascending order (lines 276-282); `bench/global-setup.ts`'s teardown wraps that call, sets `process.exitCode = 1`, and rethrows (lines 80-85). Read `tests/perf-budgets.selftest.test.ts`: the D-09 proof test now spawns `npm run bench:selftest` via `spawnSync` with an isolated `BENCH_RESULTS_DIR=.bench/selftest`, asserts `status` is a non-zero number, and asserts the combined stdout/stderr names `PERF-05` and matches `/failed budget/i`. I ran this myself (`npm test` with `--reporter=verbose`) and confirmed the test `spawning the real bench:selftest command against the over-budget fixture exits non-zero (D-09 proof)` passed in 482ms as part of the 75/75 passing unit suite. I also confirmed `.bench/bench-results.json` still holds the real run's 11 rows with no `fail` verdict after that spawn, proving `resolveBenchResultsDir`'s isolation genuinely works, not just as claimed. |
| 7 | Measurements are sized to avoid `performance.now()` timer-resolution coarsening, per `MIN_MEASUREMENT_MS` (Gap 2 of the prior verification) | ✓ VERIFIED (Gap 2 closed) | Read `bench/calibration.ts`: `measureMinOfN` now throws when `min < MIN_MEASUREMENT_MS` (lines 44-50); `measureBatchedMinOfN` amortizes a batch and enforces the floor against the batch total before dividing (lines 66-82); `calibrationScore` and `normalize` both throw on non-finite/non-positive inputs (lines 143-159, 171-181). I ran `npm run bench` myself and read `.bench/bench-results.json`: PERF-02 measured `0.1036...ms`, PERF-05 measured `0.063ms` — neither reads `0` or `0.00ms`, both are the amortized per-call figures the batching produces (`PERF_02_BATCH_SIZE=500`, `PUT_IMAGE_DATA_BATCH_SIZE=500`, `FILL_RECT_BATCH_SIZE=8`, confirmed present in `bench/kernel.bench.test.ts` and `bench/canvas-repaint.bench.test.ts`, and printed in the run's info lines). |

**Score:** 7/7 truths verified (0 present-but-behavior-unverified, 0 uncertain). Truth 5 was resolved by real GitHub Actions runs after this pass; see "Human verification resolved" below.

### Independent re-check of the two structural gaps from the prior round

**Gap 1 (D-09 self-test validates the wrong layer).** Prior finding: the self-test called `checkBudget()` in isolation and never touched the actual enforcement path (three duplicated inline `expect()` assertions), so a future refactor dropping one of those lines could silently exit 0. Current state, independently confirmed: `assertRunInvariants` is now the authoritative, run-level check with visibility into every row's `verdict` regardless of which bench file wrote it; the three bench files were rewritten to call `assertWithinBudget(row)` (confirmed present in all three via `grep -l assertWithinBudget bench/kernel.bench.test.ts bench/canvas-repaint.bench.test.ts bench/sweep.bench.test.ts`, all three listed); and the D-09 self-test now spawns the real `bench:selftest` npm script as a child process and asserts its exit code and output, which I reproduced myself. This closes the gap as described: a dropped or weakened per-file `expect()` can no longer let a breach pass, because the run-level check does not depend on it.

**Gap 2 (timer-resolution floor declared but unenforced).** Prior finding: `MIN_MEASUREMENT_MS` was declared but never checked anywhere, and the phase's own permanent record showed PERF-02 and PERF-05 being recorded at or near the floor with no diagnostic. Current state, independently confirmed: the floor check exists in `measureMinOfN` (throws below the floor) and is exercised via `measureBatchedMinOfN`, which enforces it against the batch total, not the per-call quotient — matching the plan's stated design. All three previously sub-floor call sites (PERF-02's kernel call, both canvas arms) now route through the batched helper with disclosed batch sizes. I confirmed via a live `npm run bench` run that no recorded figure reads `0` or `0.00ms`, and via `01-SPIKE-RESULTS.md` §6 that the resolved figures and their batch sizes are recorded permanently alongside the original floor-limited record (sections 1-5 unmodified, confirmed by `git diff --stat` in an earlier commit and by direct reading — section 6 is a pure addition).

Both gaps are genuinely closed in the code, not merely claimed closed in a SUMMARY.

### New findings surfaced by this round's own code review (`01-REVIEW.md`), assessed independently

The phase's current `01-REVIEW.md` (re-review after both gap-closure plans) reports 0 critical, 2 warning, 1 info findings — a clean bill relative to the prior round's two blockers, which I independently re-confirmed rather than trusting the review's own verdict.

- **WR-04** (`bench/calibration.ts:44`): `measureMinOfN`'s floor check (`min < MIN_MEASUREMENT_MS`) lacks the `!Number.isFinite(min)` guard its sibling `calibrationScore` was given. Confirmed by direct read: line 44 only checks the numeric comparison. Real-world impact is narrow — a `NaN` elapsed time would have to come from a broken/mocked timer, not from a throwing `fn` (which would already reject), and even then `normalize()`'s own non-finite guard catches it one call site downstream with a slightly less specific message. This is an incomplete application of an existing fix, not a new failure mode, and does not affect any currently exercised measurement. Non-blocking.
- **WR-05** (`bench/accumulator-store.ts` + all three bench files): the printed/persisted `calibrationScore` reflects whichever bench file ran last, since `persistEnvironment` unconditionally overwrites a single file. Confirmed by direct read and by observing my own `npm run bench` run print a single `calibrationScore: 0.5650000000372529` line. This affects only the diagnostic/reproducibility surface — each row's own local score correctly normalizes that row (`checkBudget`/`verdict` are unaffected), confirmed by the fact that PERF-02/PERF-05's recorded figures in `.bench/bench-results.json` are internally consistent. Non-blocking for the gate itself, but degrades manual reproducibility as the review notes.

Neither finding is a blocker to this phase's success criteria: neither produces a false pass on a real regression, and both are classified as warnings by the review's own severity scale, which I independently agree with on the evidence.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `bench/report.ts` | `assertWithinBudget`, run-level verdict-fail backstop in `assertRunInvariants` | ✓ VERIFIED | Read in full; both present exactly as the plan specifies (lines 65-75, 276-282) |
| `bench/accumulator-store.ts` | `resolveBenchResultsDir` with absolute-path/parent-segment guard | ✓ VERIFIED | Read; present at lines 28-40-ish, guards `isAbsolute` and `..` segments |
| `bench/global-setup.ts` | Teardown sets `process.exitCode = 1` before rethrowing from `assertRunInvariants` | ✓ VERIFIED | Read in full; try/catch wrapper confirmed at lines 80-85 |
| `bench/selftest/over-budget.selftest.ts` | Deliberately over-budget fixture built via real `checkBudget`, persisted via real accumulator store | ✓ VERIFIED | File exists; referenced correctly by the `bench-selftest` Vitest project |
| `package.json` | `bench:selftest` script | ✓ VERIFIED | `"bench:selftest": "vitest run --project bench-selftest"` confirmed present |
| `tests/perf-budgets.selftest.test.ts` | D-09 proof rewritten to spawn the real harness command | ✓ VERIFIED | Read in full; spawn test confirmed present and passing |
| `bench/calibration.ts` | `MIN_MEASUREMENT_MS` enforcement in `measureMinOfN`, `measureBatchedMinOfN`, guards in `calibrationScore`/`normalize` | ✓ VERIFIED | Read in full; all four present |
| `bench/kernel.bench.test.ts`, `bench/canvas-repaint.bench.test.ts` | Sub-floor call sites amortized through `measureBatchedMinOfN` | ✓ VERIFIED | Confirmed via live bench run: no figure reads 0/0.00ms; batch-size info lines present in run output |
| `bench/sweep-pool.ts` | `workerFactory`/`chunkTimeoutMs` seam, per-worker failure promise, bounded timeout | ✓ VERIFIED | Read in full; matches plan's design exactly (lines 37-47, 61-76, 137-174) |
| `bench/hang-fixture.worker.ts`, `bench/throw-fixture.worker.ts` | Fixture workers for the two failure paths | ✓ VERIFIED | Both files exist; exercised by 2 of the 11 passing bench tests, confirmed via live run |
| `.planning/phases/01-performance-spike-and-budget-lock/01-SPIKE-RESULTS.md` | Section 6 addendum with resolved figures | ✓ VERIFIED | Section 6 present; sections 1-5 confirmed unmodified |
| `.github/workflows/ci.yml` | PR + push-to-main gate, read-only token | ✓ VERIFIED (syntactically) / ⚠️ NEVER EXECUTED | Unchanged from prior round; no remote configured, confirmed independently this pass |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `bench/selftest/over-budget.selftest.ts` | `bench/global-setup.ts` | persists an over-budget row the real teardown reads back | ✓ WIRED | Confirmed by running `npm run bench:selftest` indirectly via the spawn test, which produced the expected non-zero exit |
| `bench/global-setup.ts` | `bench/report.ts` | teardown calls `assertRunInvariants`, whose verdict-fail check turns a breach into a non-zero exit | ✓ WIRED | Confirmed via direct code read and empirical spawn-test pass |
| `tests/perf-budgets.selftest.test.ts` | `package.json` | `spawnSync` of `bench:selftest` | ✓ WIRED | Confirmed via my own `npm test --reporter=verbose` run |
| `bench/kernel.bench.test.ts`, `bench/canvas-repaint.bench.test.ts`, `bench/sweep.bench.test.ts` | `bench/report.ts` | `assertWithinBudget` replaces the inline numeric comparison | ✓ WIRED | Confirmed via grep across all three files |
| `bench/kernel.bench.test.ts`, `bench/canvas-repaint.bench.test.ts` | `bench/calibration.ts` | `measureBatchedMinOfN` amortizes sub-floor single-call costs | ✓ WIRED | Confirmed via live bench run's batch-size info lines and non-zero recorded figures |
| `bench/sweep.bench.test.ts` | `bench/sweep-pool.ts` | `workerFactory`/`chunkTimeoutMs` options exercise the two failure paths | ✓ WIRED | Confirmed via live bench run: 11/11 passing includes both fixture-worker tests |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Typecheck is clean | `npm run typecheck` | exit 0, no errors | ✓ PASS |
| Full unit suite passes, including the D-09 spawn proof | `npm test -- --reporter=verbose` | 75/75 passing; D-09 spawn test passed in 482ms | ✓ PASS |
| Full bench harness passes | `npm run bench` | 11/11 passing, all measured rows non-zero, environment block prints machine/core/browser/OS | ✓ PASS |
| Self-test's isolation holds | `node -e "..."` reading `.bench/bench-results.json` after `npm run bench` + `npm test` | 11 rows, no `fail` verdict, PERF-02/05 non-zero | ✓ PASS |
| Em dash removal | `grep -rlP '\x{2014}' --include='*.ts' --include='*.yml' --include='*.json' . --exclude-dir=node_modules --exclude-dir=.planning --exclude-dir=.bench` | prints nothing, exit 1 | ✓ PASS |
| `bench:selftest` script exists and is wired to the `bench-selftest` Vitest project | `grep -n '"bench' package.json` | both `bench` and `bench:selftest` scripts present | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` convention exists in this project, and neither PLAN nor SUMMARY declares a probe-based verification path. SKIPPED (no runnable probe entry points).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| PERF-01 | 01-01, 01-05 | Budget file + CI-failing gate | VERIFIED (resolved 2026-08-17, see below) | Budget file, per-file gate, and the run-level backstop all exist and are proven live locally (spawned self-test exits non-zero on a real breach). The literal "CI fails the build" clause remains unproven on real GitHub Actions infrastructure because no remote is configured; see Truth 5 / human verification |
| PERF-01a | 01-01, 01-04, 01-06 | Provisional thresholds locked via measurement, escalation not relaxation | ✓ SATISFIED | All 11 thresholds equal their anchors; `01-SPIKE-RESULTS.md` §4 and the new §6 both evaluate the 70% trigger and find nothing crossed, including against the newly resolved (post-amortization) figures |
| PERF-10 | 01-01, 01-02, 01-03, 01-05 | One-command benchmark suite reporting all metrics | ✓ SATISFIED | `npm run bench` confirmed 11/11 passing by me directly; all 8 requirement groups printed |
| PERF-11 | 01-01 through 01-06 | Measurement from the first executable phase, build order before architecture commitment | ✓ SATISFIED | This is phase 1; every measurement carries machine/core-count/CI-flag labelling, confirmed via a live run's environment block |

No orphaned requirements — `REQUIREMENTS.md` maps exactly PERF-01, PERF-01a, PERF-10, PERF-11 to Phase 1, and all four appear in plan frontmatter `requirements` fields across 01-01 through 01-06.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `bench/calibration.ts` | 44 | `measureMinOfN`'s floor check lacks a `!Number.isFinite(min)` guard present on its sibling `calibrationScore` check (WR-04, current `01-REVIEW.md`) | ⚠️ Warning | Narrow: only reachable via a broken/mocked timer; caught one call site downstream by `normalize`'s own guard with a less specific message. Not a false pass on any real measurement |
| `bench/accumulator-store.ts` | ~73-81 | `persistEnvironment` last-write-wins across three bench files sharing one `.raw/environment.json` (WR-05, current `01-REVIEW.md`) | ⚠️ Warning | Diagnostic/reproducibility only; each row's own local calibration score correctly gates that row, confirmed by internally-consistent recorded figures |
| — | — | No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found in any file touched by plans 01-05/01-06 | — | Confirmed via direct grep across all 15 files in scope |
| — | — | Em dash character (Unicode 2014) | — | Confirmed removed from all tracked `*.ts`/`*.yml`/`*.json` source outside `node_modules`/`.planning`/`.bench` |

### Gaps Summary

Both structural gaps from the prior verification round (`01-VERIFICATION.md` Gap 1: D-09 self-test validated the wrong layer; Gap 2: `MIN_MEASUREMENT_MS` declared but never enforced) are genuinely closed, confirmed by direct code reading and by running `npm run typecheck`, `npm test`, and `npm run bench` myself rather than trusting either gap-closure plan's SUMMARY.md.

One item remains open and is not something further code changes can resolve: success criterion 5 ("a deliberately regressed commit fails CI on a budget breach") literally requires a real GitHub Actions run, and no GitHub remote is configured in this repository. The phase has built everything code-side that this criterion's intent requires — a syntactically correct CI workflow, a run-level enforcement mechanism, and a permanent self-test that spawns the real harness command and empirically proves a breach exits non-zero with the correct message — but the literal CI proof itself needs a human to configure a remote, push, and observe a real Actions run go red on a deliberately regressed commit. This is routed to human verification rather than marked as a code gap, because no plan authored by this agent can push to GitHub or create a remote on the operator's behalf.

Two new warning-level findings (WR-04, WR-05) surfaced by this round's own code review are non-blocking: both are narrow, diagnostic-only issues that do not produce a false pass on any real regression, confirmed independently against the code rather than accepted on the review's word alone.

---

_Verified: 2026-08-16_
_Verifier: Claude (gsd-verifier)_

## Human verification resolved (2026-08-17)

Truth 5 and PERF-01's literal "CI fails the build" clause were routed to human verification in this
pass because no GitHub remote existed at the time. A remote was configured afterward and both halves
are now proved by real GitHub Actions runs on `ubuntu-latest`:

- **Green:** runs 31965951474, 31980066804 and 31980323928 each produced a green `bench` check.
- **Red:** run 31963076671 attempt 1 concluded `failure` on a 2 logical core runner with
  `Error: assertWithinBudget: budget "PERF-03" failed: measured 1032.430555555439ms exceeds budget 1000ms`
  and a `verdict=fail` row, naming the breached budget id exactly as the criterion requires.

**Deviation from the written test.** The red run was not a deliberately regressed commit. It was a
genuine PERF-03 breach caused by a slow 2 core runner. Unstaged evidence is stronger proof that the
gate is live than a planted failure would be, but it is not the procedure the test specified, and it
separately establishes that PERF-03 fails outright on 2 core hardware rather than only under an
artificial regression. That risk is recorded in PROJECT.md's D-20 escalation row.

Recorded in `01-UAT.md` (test 1, result: passed).

