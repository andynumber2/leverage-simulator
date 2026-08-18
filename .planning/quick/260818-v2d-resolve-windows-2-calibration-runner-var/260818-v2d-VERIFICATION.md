---
phase: quick-260818-v2d
verified: 2026-08-18T23:35:00Z
status: passed
score: 10/10 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Quick Task 260818-v2d: Resolve WINDOWS #2 (Calibration Runner-Variance) Verification Report

**Task Goal:** Resolve WINDOWS #2 calibration runner-variance in bench/calibration.ts
**Verified:** 2026-08-18T23:35:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | PERF-03 runs at the declared 4-core baseline pool width (workerCount 3) on every host | VERIFIED | `bench/sweep-pool.ts` exports `BASELINE_WORKER_COUNT = workerCountForCores(PERF_03_BASELINE_HARDWARE_CONCURRENCY)`; `bench/sweep.bench.test.ts:136` calls `runSpikeSweep(DEFAULT_SEED, { workerCount: BASELINE_WORKER_COUNT })`. Reproduced live: `taskset -c 0-3 npm run bench` prints `PERF-03 sweep: workerCount=3 chunkCount=12 hardwareConcurrency=4 ... verdict=rendered`, measuredMs=406.70ms (SUMMARY claimed 406.9→406.1ms; independently reproduced 406.70ms, well within 15% no-op tolerance) |
| 2 | Off-baseline host withholds PERF-03 verdict, table carries a withheld banner naming both widths, figure survives in info line | VERIFIED | Reproduced live on this 9-core host: `npm run bench` output contains `>>> PERF-03 VERDICT WITHHELD: ... hardwareConcurrency 9, not the declared PERF-03 baseline of 4 ...`, row prints `verdict=unmeasured`, and info line reads `PERF-03 sweep: workerCount=3 chunkCount=12 hardwareConcurrency=9 declaredBaselineHardwareConcurrency=4 measuredMs=401.00 normalizedMs=697.39 verdict=withheld` |
| 3 | Withholding is not bypassable from a single bench file: `assertRunInvariants` throws on off-baseline CI, and throws if a bench file restores a non-unmeasured verdict off-baseline locally | VERIFIED | `bench/report.ts:344-364` implements both throw paths, positioned after the existing verdict-fail gate (commented rationale matches plan). `tests/report.test.ts` (54 tests, run directly) exercises all 5 documented cases and passes. Live proof of ordering preservation: `npm run bench:selftest` (hardwareConcurrency 1, off-baseline) still exits 1 on `assertRunInvariants: 1 row(s) failed budget: PERF-05`, not on the host guard |
| 4 | The change is a demonstrated no-op at baseline width: committed unit test proves pinned width equals auto-resolution, and a 4-core-constrained run measures PERF-03 within noise of pre-change | VERIFIED | `tests/sweep-pool.test.ts` asserts `workerCountForCores(4) === BASELINE_WORKER_COUNT` (passes). Live `taskset -c 0-3 npm run bench` reproduction: verdict=rendered, measuredMs=406.70ms |
| 5 | `NOMINAL_REFERENCE_MS` still 40; no `thresholdMs`/`anchorMs`/`relaxationReason` changed in perf-budgets.ts; no substitute budget-denominating constant | VERIFIED | `grep -n "NOMINAL_REFERENCE_MS" bench/calibration.ts` shows `const NOMINAL_REFERENCE_MS = 40` unchanged. `git diff c09ee38..HEAD -- perf-budgets.ts` diff contains no `thresholdMs`/`anchorMs`/`relaxationReason` lines (grep returned empty); only addition is `PERF_03_BASELINE_HARDWARE_CONCURRENCY`, which is consumed only as a width selector/gate, never as a divisor (confirmed by reading its every call site) |
| 6 | `bench/calibration.ts`'s `normalize()` doc comment states the measured 4-core-conditioned band and the superseded 3-run "~10 percentage points"/856.4/"KNOWN LIMITATION" text is gone | VERIFIED | Full doc comment read at `bench/calibration.ts:171-198` states n=13, 11.03%→6.36% (PERF-03) and 11.10%→7.12% (PERF-02), the 4-core condition, ±13%/±20% read-guidance. `grep -rn "roughly 10 percentage points\|856.4\|KNOWN LIMITATION" bench/ tests/ *.ts` across the whole repo returns nothing |
| 7 | `bench/canonical-calibration.ts` untouched | VERIFIED | `git diff c09ee38..HEAD -- bench/canonical-calibration.ts \| wc -l` = 0 |
| 8 | `npm run bench` exits 0 within the runtime cap on both a 4-core-constrained and an unconstrained run | VERIFIED | Both live reproductions above exited 0; total bench runtime 8065ms and 12581ms/12609ms, both under the 30000ms cap |
| 9 | WINDOWS.md entry 2 reads `fixed` consistently across frontmatter, table row, and JSON block | VERIFIED | Frontmatter: `fixed_count: 3`, `waived_count: 0`, `open_count: 0`, `total_count: 3`. Table row 2: `status` column = `fixed`. JSON block: entry id 2 `"status": "fixed"`. `gsd-tools windows status` (run directly against the actual ledger) parses cleanly and echoes the same fixed status for entry 2 |
| 10 | STATE.md/ROADMAP.md discharge the BEFORE-PHASE-4 prerequisite and carry the measured band forward | VERIFIED | `.planning/STATE.md` "Pending Todos" section reads "- None"; a `[quick-260818-v2d]` decision bullet documents the 6.36% band. `.planning/ROADMAP.md` Phase 4 section carries `**Prerequisite RESOLVED (2026-08-18, quick-260818-v2d):**` naming the 6.36% residual and the ±13%/±20% read-guidance |

**Score:** 10/10 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `perf-budgets.ts` | Exports `PERF_03_BASELINE_HARDWARE_CONCURRENCY = 4` | VERIFIED | Line 100, doc comment states it is a workload parameter/reporting gate, never a divisor |
| `bench/sweep-pool.ts` | `workerCountForCores`, `resolveWorkerCount`, `BASELINE_WORKER_COUNT` | VERIFIED | All present, `resolveWorkerCount` reimplemented on top of the extracted pure rule |
| `bench/sweep.bench.test.ts` | PERF-03 test pinned to baseline width, if/else branch (not ternary) for verdict withholding | VERIFIED | Lines 126-197, if/else structure confirmed |
| `bench/report.ts` | `hostMatchesPerf03Baseline`, host guard in `assertRunInvariants`, withheld banner in `renderTable` | VERIFIED | Lines 103, 238-244, 339-365 |
| `bench/calibration.ts` | `normalize()` doc comment carries measured band | VERIFIED | Lines 171-198, comment-only diff confirmed by unchanged executable lines |
| `tests/sweep-pool.test.ts` | New file, no-op proof | VERIFIED | Present, 3 tests, all pass when run directly |
| `tests/report.test.ts` | Host-guard + withheld-banner coverage | VERIFIED | Additions present, 5 documented cases covered |
| `.planning/WINDOWS.md` | Entry 2 fixed, byte-coherent | VERIFIED | See truth 9 |
| `.planning/STATE.md` | Prerequisite discharged | VERIFIED | See truth 10 |
| `.planning/ROADMAP.md` | Prerequisite discharged, band carried forward | VERIFIED | See truth 10 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `perf-budgets.ts PERF_03_BASELINE_HARDWARE_CONCURRENCY` | `bench/sweep-pool.ts BASELINE_WORKER_COUNT` | `workerCountForCores` import | WIRED | `bench/sweep-pool.ts:12` imports the constant; `BASELINE_WORKER_COUNT` computed from it |
| `bench/sweep-pool.ts BASELINE_WORKER_COUNT` | `bench/sweep.bench.test.ts runSpikeSweep` options | direct call | WIRED | Line 136, single literal width, no second copy |
| `environment-block.ts hardwareConcurrency` | `bench/report.ts assertRunInvariants` host guard | `hostMatchesPerf03Baseline` | WIRED | Confirmed via live off-baseline run producing the withheld banner and unmeasured verdict |
| `assertRunInvariants` verdict-fail gate | host-width guard | ordering | WIRED | Confirmed live: `bench:selftest` (hardwareConcurrency 1, off-baseline) still fails on PERF-05, not the host guard |
| `bench/calibration.ts normalize() band` | `STATE.md` / `ROADMAP.md` | doc references | WIRED | Both documents cite the 6.36% figure and ±13%/±20% guidance |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| No-op proof at baseline width | `taskset -c 0-3 npm run bench` | exit 0, verdict=rendered, measuredMs=406.70ms, workerCount=3 | PASS |
| Withholding off-baseline | `npm run bench` (9-core host) | exit 0, verdict=unmeasured, withheld banner present, figure disclosed in info line | PASS |
| Guard ordering preserved | `npm run bench:selftest` | exit 1, fails on `PERF-05`, not host guard | PASS |
| Unit test suite (new tests) | `npx vitest run --project unit tests/sweep-pool.test.ts tests/report.test.ts` | 54/54 pass | PASS |
| calibration.ts unaffected functionally | `npx vitest run --project unit tests/calibration.test.ts` | 18/18 pass | PASS |
| Full unit suite | `npm test` | 459/459 pass | PASS |
| Typecheck | `npm run typecheck` | 0 errors | PASS |
| `gsd-tools windows status` parses ledger | direct invocation | valid JSON, entry 2 `status: fixed` | PASS |

### Probe Execution

Not applicable — no `scripts/*/tests/probe-*.sh` files declared or referenced by this task's plan/summary.

### Anti-Patterns Found

None. All 7 modified/created source and test files scanned for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` — zero matches. Em-dash scan on the added lines of the diff (`git diff c09ee38..HEAD`) — zero matches. Ternary scan on the same diff for nested-ternary patterns — zero matches; the one ternary present (`verdictDisclosure` in `bench/sweep.bench.test.ts:183`) is a single, non-nested conditional, consistent with the project's style rule.

### Requirements Coverage

QUICK-260818-v2d is not tracked in a separate `.planning/REQUIREMENTS.md` entry for this quick task (no such file/ID present under `.planning/`); coverage is evaluated directly against the plan's `must_haves`, all of which verified above.

### Human Verification Required

None. All must-haves were independently reproduced via direct command execution against the actual codebase (not taken from SUMMARY.md claims).

### Gaps Summary

None. All 10 must-have truths verified, all key links wired, all hard prohibitions held, the sole documented deviation (hand-path around `gsd-tools windows fixed` due to a CLI open-only precondition) was independently confirmed to produce a byte-coherent WINDOWS.md, and `gsd-tools windows status` parses the resulting ledger without error.

---

_Verified: 2026-08-18T23:35:00Z_
_Verifier: Claude (gsd-verifier)_
