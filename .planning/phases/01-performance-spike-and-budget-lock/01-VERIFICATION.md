---
phase: 01-performance-spike-and-budget-lock
verified: 2026-08-16T00:00:00Z
status: gaps_found
score: 5/7 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "A permanent self-test feeds the budget checker a deliberately over-budget fixture and asserts it produces a fail verdict, so the gate cannot rot into a no-op when the harness is refactored (D-09)"
    status: partial
    reason: >
      The self-test (tests/perf-budgets.selftest.test.ts) calls checkBudget() directly and
      asserts its return value is 'fail'. checkBudget is a pure function whose return value
      is used only to populate the printed table and JSON verdict field. The actual value that
      fails the run is a separate, independently-written
      `expect(normalizedMs).toBeLessThanOrEqual(budget.thresholdMs)` assertion duplicated in
      each of the three *.bench.test.ts files. D-09's own wording requires "a test feeds the
      budget checker a deliberately over-budget fixture and asserts it exits non-zero with the
      correct message" -- the self-test never runs the harness, never checks a process exit
      code, and never touches the expect() assertions that are the real gate. If a future
      bench file's expect() line is removed or weakened, the printed table would show
      verdict=fail while the process exits 0, and nothing currently in the suite -- including
      this self-test -- would catch it.
    artifacts:
      - path: "tests/perf-budgets.selftest.test.ts"
        issue: "Tests checkBudget() in isolation, not the enforcement path (the inline expect() in each bench file)"
      - path: "bench/report.ts"
        issue: "assertRunInvariants (the one function with run-level visibility, called from global-setup teardown) never inspects row.verdict"
    missing:
      - "A run-level invariant (in assertRunInvariants or an equivalent function called from bench/global-setup.ts's teardown) that throws when any row.verdict === 'fail', independent of any single bench file's own expect() call"
      - "A self-test that exercises that run-level check end-to-end (or spawns the actual bench command) with a deliberately over-budget fixture and asserts a non-zero exit, per D-09's literal wording"
  - truth: "Calibration and metric measurements are sized so that a single repeat spans at least 10 milliseconds, keeping performance.now timer coarsening below one percent of the measured value"
    status: failed
    reason: >
      MIN_MEASUREMENT_MS = 10 is declared in bench/calibration.ts and documented as a hard
      requirement to avoid performance.now() coarsening, but no function anywhere in the
      codebase (bench/, tests/, perf-budgets.ts) ever compares a measured value against it --
      confirmed independently by grep, which finds MIN_MEASUREMENT_MS only in its own
      declaration and doc comment. This is not theoretical: the phase's own permanent record
      (01-SPIKE-RESULTS.md) documents the floor being violated in production. PERF-02's raw
      minimum-of-5 figure is 0.09999999962747097ms and PERF-05's winning putImageData arm is a
      literal 0ms -- both far below the 10ms floor the harness itself requires, and both were
      fed through checkBudget and recorded as pass with no structural flag anywhere in the
      table, JSON artifact, or test output.
    artifacts:
      - path: "bench/calibration.ts"
        issue: "measureMinOfN (lines 28-40) never checks its own result against MIN_MEASUREMENT_MS before returning it"
      - path: "bench/kernel.bench.test.ts"
        issue: "Records and asserts a PERF-02 figure (raw 0.0999...ms) that is below the documented floor, with no floor check"
      - path: "bench/canvas-repaint.bench.test.ts"
        issue: "Records a putImageData figure of literal 0ms as the PERF-05 winner, with no floor check"
    missing:
      - "A floor check in measureMinOfN (or immediately after each calibrationScore()/metric call) that throws or flags when the minimum observed repeat is below MIN_MEASUREMENT_MS"
      - "For call sites whose natural single-call cost is under the floor (PERF-02's kernel call, the putImageData arm), the same batched-loop amortization already implemented for the throwaway Rust/WASM spike (01-04), applied to the permanent JS bench files"
deferred: []
---

# Phase 1: Performance Spike and Budget Lock Verification Report

**Phase Goal:** Measure the hot loop and the 10k-cell repaint on real hardware, then commit the architecture and the budgets
**Verified:** 2026-08-16
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A throwaway benchmark reports real wall-clock figures on real hardware for the 25,000-bar backtest and the 10,000-cell Canvas repaint, each with a machine and core count attached (SC1) | ✓ VERIFIED | `bench/kernel.bench.test.ts`, `bench/canvas-repaint.bench.test.ts` run in real headless Chromium via Playwright; `01-SPIKE-RESULTS.md` §2 table carries machine, cores, browser, OS, calibration score on every row. `npm run bench` confirmed 9/9 passing by orchestrator pre-check. |
| 2 | The plain-JS-vs-WASM and hand-rolled-Canvas-vs-charting-library decisions are recorded in PROJECT.md as Key Decisions citing the measured figure that settled them (SC2) | ✓ VERIFIED | `.planning/PROJECT.md` "Key Decisions" table has two new rows, each naming a specific millisecond figure, percentage of budget, and machine (9 logical cores, calibration score 0.57), each linking to `01-SPIKE-RESULTS.md`. Pre-existing rows untouched (confirmed by reading table). |
| 3 | One command (`npm run bench`) prints every metric named in PERF-02 through PERF-09, marking not-yet-built paths as unmeasured (SC3) | ✓ VERIFIED | `bench/report.ts#assertRunInvariants` throws if any of the eight requirement group headers is missing; `perf-budgets.ts` carries all 11 budget rows across all 8 requirement ids (confirmed: `tests/perf-budgets.selftest.test.ts` asserts `PERF_BUDGETS` has exactly 11 entries / 8 requirement ids, and this test is part of the 45/45 passing unit suite already confirmed). |
| 4 | The budget file carries a numeric threshold and perception anchor for each of PERF-02 through PERF-09; any threshold looser than its anchor carries a written reason and Key Decision; an unreachable target is escalated rather than relaxed (SC4) | ✓ VERIFIED | `perf-budgets.ts` (182 lines) defines all 11 entries with `anchorMs`/`anchorLabel`; every entry's `thresholdMs === anchorMs` (confirmed in plan 01-01's `<interfaces>` table and PROJECT.md/STATE.md's "no relaxation reason is owed" statement), so no relaxation applies this phase. `01-SPIKE-RESULTS.md` §4 evaluates every measured figure against the 70% escalation trigger and finds none crossed, consistent with PERF-01a's no-automatic-relaxation rule. |
| 5 | A deliberately regressed commit fails CI on a budget breach, proving the gate is live rather than declared (SC5) | ✗ FAILED | No GitHub remote is configured in this repository (`git remote -v` returns nothing, confirmed independently), so the live CI demonstration this criterion literally describes has never happened — `01-01-SUMMARY.md` and `01-04-SUMMARY.md` both flag this as an outstanding external dependency. The designated permanent substitute — the D-09 self-test — does not test the actual enforcement path; see Gap 1 below. Neither the live proof nor its documented replacement currently demonstrates this criterion. |
| 6 | A permanent self-test proves the budget gate cannot rot into a no-op when the harness is refactored (D-09, mandatory per plan 01-01 must_haves) | ✗ FAILED | See Gap 1 in frontmatter. Confirmed independently by reading `tests/perf-budgets.selftest.test.ts` (calls `checkBudget()` directly, never runs the harness or checks an exit code) and `bench/report.ts#assertRunInvariants` (never inspects `row.verdict`), plus `grep` confirming the real gate is three separately duplicated `expect(normalizedMs).toBeLessThanOrEqual(...)` lines in `bench/kernel.bench.test.ts:56`, `bench/canvas-repaint.bench.test.ts:202`, `bench/sweep.bench.test.ts:125`. |
| 7 | Measurements are sized to avoid `performance.now()` timer-resolution coarsening, per the harness's own `MIN_MEASUREMENT_MS` requirement | ✗ FAILED | See Gap 2 in frontmatter. Confirmed independently by `grep -rn MIN_MEASUREMENT_MS bench tests perf-budgets.ts` — the constant appears only in its own declaration and doc comment, nowhere else. `01-SPIKE-RESULTS.md` itself documents the floor being crossed in production (PERF-02 raw 0.0999ms, PERF-05 winner raw 0ms), both passing budgets with no diagnostic. |

**Score:** 5/7 truths verified (0 present-but-behavior-unverified)

### Assessment of the two open code-review findings against the recorded Key Decisions

This is the question the orchestrator asked me to answer independently, not defer to the reviewer.

**Does CR-01 (unenforced timer-resolution floor) undermine either PROJECT.md Key Decision?**

No, on the evidence available, but the reasoning differs by decision:

- **Plain JS over WASM.** This decision's headline figure is PERF-03's 327.40ms normalized sweep measurement (32.7% of a 1000ms budget) — a fully resolved figure roughly 33x above the 10ms floor, not a floor-limited number. The decision's secondary evidence, the JS-vs-WASM ratio, hit the exact floor problem CR-01 describes at the single-call scale (both arms measured a bit-for-bit identical 0.0999...ms), and the phase's own authors caught this and did not report it as a ratio. Instead they added a 5,000-call batched measurement to amortize the floor and recover a resolvable per-call figure (~1.20x, WASM slower), reproduced across three runs, with an explicit, disclosed caveat that the JS side of that batched figure runs under Node V8 rather than headless Chromium. This is the correct fix for the floor problem, applied narrowly to the one throwaway spike file where it mattered for this decision. **This decision survives independent scrutiny**: its primary evidence (PERF-03) was never floor-limited, and its secondary evidence (the WASM ratio) was floor-limited but was caught and correctly amortized before being cited.

- **Hand-rolled Canvas (putImageData) over a charting library.** This decision's headline figure — `putImageData` at 0ms normalized — is exactly the CR-01 failure mode: a value at or below timer resolution, passed through unflagged. However, the *decision itself* does not rest on that number in isolation. It rests on an ordering claim (`putImageData` beats `fillRect`) where `fillRect`'s figure (4.41ms) is fully resolved and comfortably above the floor. A value at-or-below the timer floor is, by construction, less than a resolved 4.41ms; the relative ordering between the two arms is sound even though `putImageData`'s absolute cost is not resolvable at this measurement precision. Both PROJECT.md and `01-SPIKE-RESULTS.md` state the floor caveat explicitly ("at/below performance.now()'s resolution (0ms normalized)") rather than presenting 0ms as if it were a clean number, which is the honest disclosure CR-01 asks for even though the *code* never enforces it. The charting-library rejection half of this decision cites prior Q2 research findings, not a new benchmark, so it is unaffected by CR-01 at all. **This decision also survives, on the strength of the ordering argument and the honest disclosure, not the absolute figure.**

**Does CR-01/CR-02 undermine the phase goal itself?**

Yes, in the specific, narrower sense that matters going forward. The phase goal is not just "these two decisions are correct" — it is "performance becomes checkable with one command from this point forward" and "a deliberately regressed commit fails CI on a budget breach, proving the gate is live rather than declared" (success criterion 5). The two decisions this phase needed to make survive on the evidence gathered. But the *permanent enforcement machinery* this phase was chartered to build — the thing every later phase (3, 4, 6, 7) inherits and is graded against — has two structural holes that are not about this phase's own numbers:

1. A future measurement that lands at the timer floor (plausible again in Phase 3/4/7, e.g. as compute gets genuinely fast, or on a faster CI runner) will pass its budget with no diagnostic, exactly as happened here, because nothing enforces `MIN_MEASUREMENT_MS`.
2. A future refactor that drops or weakens one of the three duplicated `expect()` lines that are the actual gate would not be caught by the self-test built specifically to prevent that (D-09), and CI would exit 0 on a real budget breach.

Both are demonstrated, not hypothetical — the phase's own artifacts (`01-SPIKE-RESULTS.md`, the bench test files) already exhibit the first, and the second was confirmed directly against the code in this verification pass. Success criterion 5 is therefore not met: the live GitHub Actions proof never ran (no remote configured), and its documented replacement (the self-test) does not test the mechanism that actually enforces a breach.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `perf-budgets.ts` | Typed budget module, 11 entries / 8 requirement ids | ✓ VERIFIED | 182 lines, exhaustiveness check present, confirmed by passing self-test |
| `bench/report.ts` | Row shape, table renderer, budget checker, invariants | ✓ VERIFIED | 249 lines; `assertRunInvariants` confirmed present but does not check `verdict === 'fail'` (see Gap 1) |
| `bench/calibration.ts` | Reference loop, min-of-N, normalization | ⚠️ PARTIAL | 114 lines; `MIN_MEASUREMENT_MS` exported but unenforced (see Gap 2) |
| `bench/environment-block.ts` | Machine/core/browser/OS/CI stamping | ✓ VERIFIED | 38 lines; confirmed present in `01-SPIKE-RESULTS.md` output |
| `bench/canvas-grid.ts` | Shared grid fixture, both paint arms | ✓ VERIFIED | 152 lines; both `paintFillRect`/`paintPutImageData` present |
| `bench/canvas-repaint.bench.test.ts` | Both arms measured + equivalence proof | ✓ VERIFIED | 203 lines |
| `bench/synthetic-data.ts` | Seeded GBM series | ✓ VERIFIED | 103 lines; determinism ported bit-for-bit to Rust and proven equal |
| `bench/kernel.ts` | Allocation-free branchy recurrence | ✓ VERIFIED | 168 lines; ruin-clamp/absorbing-state tests present in `tests/kernel.test.ts` |
| `bench/sweep.worker.ts` / `bench/sweep-pool.ts` | Real Worker pool, transferred buffers | ✓ VERIFIED | `Comlink.transfer` confirmed present in `sweep-pool.ts:89`; `hardwareConcurrency`-based sizing confirmed |
| `.github/workflows/ci.yml` | PR + push-to-main gate, read-only token | ✓ VERIFIED (syntactically) / ⚠️ NEVER EXECUTED | 59 lines; `pull_request` (not `_target`), `permissions: contents: read`, `ubuntu-latest`, `npm run bench`, `upload-artifact` all confirmed present. Never run on real GitHub Actions infrastructure — no remote configured. |
| `tests/perf-budgets.selftest.test.ts` | D-09 gate-liveness self-test | ⚠️ ORPHANED PURPOSE | 107 lines, runs and passes, but tests the wrong layer (see Gap 1) |
| `.planning/phases/01-performance-spike-and-budget-lock/01-SPIKE-RESULTS.md` | Method, numbers, ratio, escalation eval, repro steps | ✓ VERIFIED | 232 lines, all 5 sections present, every row labelled with machine/cores; honestly flags the floor-value caveat |
| `.planning/PROJECT.md` Key Decisions | Two new rows citing measured figures | ✓ VERIFIED | Confirmed via direct read; pure-addition diff, both rows cite concrete numbers and machine |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `bench/canvas-repaint.bench.test.ts` | `perf-budgets.ts` | `PERF_BUDGETS['PERF-05']` | ✓ WIRED | Confirmed via grep |
| `bench/canvas-repaint.bench.test.ts` | `bench/calibration.ts` | `normalize(...)` | ✓ WIRED | Confirmed |
| `.github/workflows/ci.yml` | `package.json` | `npm run bench` | ✓ WIRED (syntactically) | Never executed on real infra (no remote) |
| `tests/perf-budgets.selftest.test.ts` | `bench/report.ts` | `checkBudget(...)` | ⚠️ WIRED TO WRONG LAYER | Tests the pure helper, not the actual enforcement path (three separate `expect()` lines in bench files) |
| `bench/sweep-pool.ts` | `bench/sweep.worker.ts` | `Comlink.wrap` | ✓ WIRED | Confirmed |
| `bench/sweep-pool.ts` | `bench/kernel.ts` | `runSpikeBacktest` (single implementation) | ✓ WIRED | Confirmed via worker import chain |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| PERF-01 | 01-01 | Budget file + CI-failing gate | ⚠️ PARTIAL | Budget file and per-file gates exist and currently work; the run-level backstop and CI-live-proof gaps above mean "CI fails the build when a measured value exceeds its budget" is not durably guaranteed against future refactors |
| PERF-01a | 01-01, 01-04 | Provisional thresholds locked via measurement, escalation not relaxation | ✓ SATISFIED | All 11 thresholds equal their anchors; `01-SPIKE-RESULTS.md` §4 evaluates the 70% trigger and finds nothing crossed; PROJECT.md/STATE.md updated from provisional to locked |
| PERF-10 | 01-01, 01-02, 01-03 | One-command benchmark suite reporting all metrics | ✓ SATISFIED | `npm run bench` confirmed 9/9 passing pre-check; all 8 requirement groups printed per `assertRunInvariants` |
| PERF-11 | 01-01 through 01-04 | Measurement from the first executable phase, build order before architecture commitment | ✓ SATISFIED | This is the first phase in ROADMAP.md; every measurement carries machine/core-count/CI-flag labelling |

No orphaned requirements — `REQUIREMENTS.md` maps exactly PERF-01, PERF-01a, PERF-10, PERF-11 to Phase 1, and all four appear in plan frontmatter `requirements` fields.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `bench/calibration.ts` | 21 | `MIN_MEASUREMENT_MS` declared, never enforced | 🛑 Blocker | Sub-floor measurements pass budgets unflagged (Gap 2) |
| `tests/perf-budgets.selftest.test.ts` | 32-52 | Self-test validates the wrong layer relative to D-09's own wording | 🛑 Blocker | A dropped/weakened real gate assertion would not be caught (Gap 1) |
| `bench/sweep-pool.ts` | 64-100 | No `error`/`messageerror` handler on constructed Workers, no timeout on `runChunk` | ⚠️ Warning | A worker construction failure could hang the bench suite with no diagnostic until CI's own timeout (WR-01 in 01-REVIEW.md, not independently re-verified beyond code inspection) |
| `bench/calibration.ts` | 88-114 | `normalize()`/`calibrationScore()` no guard against a zero/non-finite score | ⚠️ Warning | Same root cause as Gap 2 from a different call site (WR-02 in 01-REVIEW.md) |
| `bench/report.ts`, `bench/*.bench.test.ts` | multiple | Budget comparison duplicated across `checkBudget()` and three inline `expect()`s | ⚠️ Warning | Enables Gap 1; no shared source of truth (WR-03 in 01-REVIEW.md) |
| multiple | many | Em dash usage in code comments (91 occurrences) | ℹ️ Info | Violates user's global CLAUDE.md style rule; not behavior-affecting |

No `TBD`/`FIXME`/`XXX` unreferenced debt markers found in the reviewed files.

## Gaps Summary

Two structural gaps, both already surfaced by the phase's own code review (`01-REVIEW.md` CR-01/CR-02) and independently reconfirmed here by direct code inspection rather than trusting the review's claims:

1. **The `MIN_MEASUREMENT_MS` timer-resolution floor is documented as a requirement but never enforced anywhere in the codebase.** The phase's own permanent record (`01-SPIKE-RESULTS.md`) already shows this being violated in production — a PERF-02 figure at 0.0999ms and a PERF-05 winning figure at literal 0ms, both far under the 10ms floor, both passing their budgets with no diagnostic.

2. **The permanent D-09 self-test validates `checkBudget()` in isolation, not the actual enforcement path.** The real gate is three separately duplicated `expect(normalizedMs).toBeLessThanOrEqual(...)` assertions in the bench test files, and `assertRunInvariants` (the one function with run-level visibility) never inspects `verdict`. A future refactor that drops or weakens one of those three lines would pass CI silently. This directly contradicts D-09's own wording ("asserts it exits non-zero with the correct message") and leaves success criterion 5 ("a deliberately regressed commit fails CI... proving the gate is live rather than declared") unproven — compounded by the fact that the live GitHub Actions demonstration this criterion literally describes has never run at all, because no GitHub remote is configured in this repository.

**The two architecture decisions this phase exists to produce — plain JS over WASM, and hand-rolled Canvas over a charting library — are not undermined by either gap** and are independently assessed as well-supported: the WASM decision rests primarily on a fully-resolved sweep figure (327ms, far above the timer floor) plus a properly floor-amortized secondary ratio measurement; the Canvas decision rests on a sound ordering argument (a resolved 4.41ms loser versus a floor-limited winner, which is still provably faster) with the floor caveat honestly disclosed in both PROJECT.md and the spike-results document. What is undermined is the phase's other, equally-named deliverable: a permanent, durable enforcement mechanism that "cannot rot into a no-op." That mechanism currently has two demonstrated holes.

---

_Verified: 2026-08-16_
_Verifier: Claude (gsd-verifier)_
