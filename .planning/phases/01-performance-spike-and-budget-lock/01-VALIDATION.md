---
phase: 1
slug: performance-spike-and-budget-lock
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-16
validated: 2026-08-18
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded by plan-phase from `01-RESEARCH.md` § Validation Architecture, then reconciled
> against the executed plans (01-01..01-06) by `/gsd-validate-phase` on 2026-08-18.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10. Three projects in `vitest.config.ts`: `unit` (Node, `tests/**/*.test.ts` + `tools/**/tests/**/*.test.ts`), `bench` (browser-mode, `@vitest/browser-playwright` 4.1.10 + `playwright` 1.62.1, `bench/**/*.bench.test.ts`), `bench-selftest` (Node, `bench/selftest/*.selftest.ts`) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test` (= `vitest run --project unit`) |
| **Full suite command** | `npm run bench` |
| **Gate-liveness command** | `npm run bench:selftest` (spawned by the D-09 self-test, not run directly in CI) |
| **Measured runtime** | 5.5 s quick (29 files / 417 tests); browser-mode bench run is slower and calibration-bound |

---

## Sampling Rate

- **After every task commit:** `npm test`
- **After every plan wave:** `npm run bench`
- **Before `/gsd-verify-work`:** full suite green
- **Max feedback latency:** 180 seconds (full); 6 seconds (quick, measured)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|--------|
| T1 | 01-01 | 0 | Wave 0 setup: `vitest.config.ts`, `perf-budgets.ts`, `bench/` scaffold | — | N/A | setup | `npm test` (config resolves; 29 files collected, zero-test is not a pass) | ✅ green |
| T1 | 01-01 | 1 | PERF-01 — budget file defines a threshold per PERF-02..09 metric | — | N/A | unit | `npm test -- tests/report.test.ts` (`checkBudget`, `assertRunInvariants`, missing-group throw) | ✅ green |
| T2 | 01-01 | 2 | PERF-01 — CI fails the build when a measured value exceeds its budget | T-01-02 (fork-PR privilege escalation) | CI uses `pull_request`, never `pull_request_target`; workflow-level read-only token; no secrets referenced | integration | `npm test -- tests/perf-budgets.selftest.test.ts` (spawns the real `bench:selftest` against an over-budget fixture, asserts non-zero exit) | ✅ green |
| T2 | 01-01 | 2 | PERF-01 / T-01 — the CI trigger and token grant stay as declared | T-01-02 | Same as above, now asserted structurally against `.github/workflows/ci.yml` instead of by human reading | integration | `npm test -- tests/ci-workflow.test.ts` | ✅ green |
| T1 | 01-01 | 1 | PERF-01a — every relaxed threshold carries a written reason | — | N/A | unit | `npm test -- tests/perf-budgets.selftest.test.ts` (`PERF-01a anchor invariant`, 6 tests over the real `PERF_BUDGETS`) | ✅ green |
| T1 | 01-01 | 1 | PERF-10 — one command reports every PERF-02..09 row, unmeasured rows marked | — | N/A | unit | `npm test -- tests/report.test.ts` (`renderTable` all-eight-group-headers, order independence, `formatMeasured` null → `unmeasured`) | ✅ green |
| T1 | 01-01 | 1 | PERF-11 — every run stamps an environment block, or the run fails | — | N/A | integration | `npm test -- tests/environment-block.test.ts` (`PERF-11 wiring`: drives the real `global-setup` teardown through the `BENCH_RESULTS_DIR` seam) | ✅ green |
| T1 | 01-01 | 1 | PERF-11 — the block's fields are real (positive core count, non-empty machine/OS, finite calibration score, ISO timestamp) | — | N/A | unit | `npm test -- tests/environment-block.test.ts` (`assertEnvironmentBlockComplete`, 19 tests) | ✅ green |
| T1, T2 | 01-02 | 1 | PERF-02 / PERF-03 spike arms measured, one recurrence implementation shared by every arm | — | N/A | unit + bench | `npm test -- tests/kernel.test.ts`; `npm run bench` | ✅ green |
| T1, T2 | 01-03 | 1 | PERF-05 canvas arms measured, rendered-equivalence proven before either figure is trusted | — | N/A | unit + bench | `npm test -- tests/canvas-grid.test.ts`; `npm run bench` | ✅ green |
| T1..T3 | 01-04 | 1 | Phase criterion 2 — JS-vs-WASM and Canvas-vs-library decisions recorded citing measured figures | — | N/A | manual | see Manual-Only below | ⬜ manual |
| T1, T2 | 01-05 | 1 | PERF-01 — a `fail` verdict is authoritative at run level, not per-file diagnostic only | — | N/A | unit + integration | `npm test -- tests/report.test.ts` (`assertWithinBudget`, run-level `verdict fail` throw); `npm test -- tests/perf-budgets.selftest.test.ts` | ✅ green |
| T1, T2 | 01-06 | 1 | Timer-floor enforcement and Worker failure/timeout paths cannot read as a silent pass | — | Hung or throwing Worker fails the sweep within a bounded timeout rather than hanging (WR-01) | unit | `npm test -- tests/calibration.test.ts`; `npm run bench` (fixture workers) | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `vitest.config.ts` — `unit`, `bench` (browser-mode), `bench-selftest` projects
- [x] `perf-budgets.ts` — 13 entries across exactly the 8 PERF-02..09 requirement ids (D-19), asserted by test
- [x] `bench/` scaffold — `calibration.ts`, `environment-block.ts`, `report.ts`, `synthetic-data.ts`
- [x] `tests/perf-budgets.selftest.test.ts` — D-09 permanent gate-liveness self-test
- [x] `package.json` `bench` / `bench:selftest` scripts
- [x] `.github/workflows/ci.yml` — D-01 triggers, read-only token, Playwright cache
- [x] Framework install (vitest, @vitest/browser-playwright, playwright, comlink)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Plain-JS-vs-WASM and hand-rolled-Canvas-vs-library decisions are recorded citing the measured figure | Phase criterion 2 | Judging whether a decision cites the figure that settled it is a review judgment, not a runtime assertion | Read PROJECT.md Key Decisions; each of the two entries names a measured number and the machine it was measured on |

**Already closed, not carried forward:** "a deliberately regressed commit turns the GitHub Actions
check red" (PERF-01, ROADMAP SC5). `01-VERIFICATION.md`'s frontmatter still says no GitHub remote is
configured, which was true when that block was written and is not true now: `origin` points at
github.com/andynumber2/leverage-simulator and both halves are proved by real Actions runs, recorded
in `01-UAT.md` and in `01-VERIFICATION.md`'s own resolution addendum. Green: runs 31965951474,
31980066804, 31980323928. Red: run 31963076671 attempt 1 concluded `failure` on a 2-logical-core
runner with `assertWithinBudget: budget "PERF-03" failed: measured 1032.430555555439ms exceeds
budget 1000ms`, naming the breached budget id. That red was a genuine PERF-03 breach on slow
hardware rather than a planted regression, which proves the gate is live and also establishes that
PERF-03 fails on 2-core runners (tracked as tech debt in the milestone audit, not here).

**Removed from manual-only this pass:** PERF-01a (the anchor/relaxation-reason invariant is now asserted over the real `PERF_BUDGETS` table); the ci.yml trigger and token review (now asserted structurally by `tests/ci-workflow.test.ts`). The Rust/wasm-pack toolchain row is dropped: the spike crate was deleted at phase end per D-13 and nothing re-runs it.

---

## Validation Sign-Off

- [x] All tasks have automated verify or a documented manual reason
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 180s (measured 5.5s quick)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-08-18

---

## Validation Audit 2026-08-18

| Metric | Count |
|--------|-------|
| Gaps found | 2 |
| Resolved | 2 |
| Escalated | 0 |

**Gap 1 — PERF-11, PARTIAL.** `bench/global-setup.ts` threw only when the environment block was
entirely absent. A block with `hardwareConcurrency: 0`, an empty `os`, an empty `userAgent`, or a
non-finite `calibrationScore` passed every check, so a figure could be reported with an effectively
unlabelled environment. Closed by `assertEnvironmentBlockComplete` in `bench/environment-block.ts`,
called from the teardown immediately after the null check, plus `tests/environment-block.test.ts`
(21 tests: 19 field cases, 2 driving the real teardown through the `BENCH_RESULTS_DIR` seam so the
call site itself is under test, not just the function).

**Gap 2 — PERF-01 / threat T-01, MISSING.** The D-01 mitigation (no `pull_request_target`,
workflow-level read-only token, no secrets) was verified only by a human reading the YAML.
Closed by `tests/ci-workflow.test.ts`, which strips whole-line comments (ci.yml's own prose names
`pull_request_target` when explaining why it is unused) and asserts the triggers, permissions block,
absence of any `write` grant, and absence of any `secrets.` reference. No YAML parser added.

**Mutation-checked.** Both test files were confirmed load-bearing by mutation rather than by
passing alone: gutting `assertEnvironmentBlockComplete` to a no-op (17 failures), weakening its
core-count bound to allow 0 (1), deleting its `deviceMemory` branch (3), deleting its call site in
`global-setup.ts` (1, caught only by the wiring test), and five ci.yml mutations
(`pull_request` → `pull_request_target`, `contents: read` → `write`, an injected `secrets.`
reference, a deleted `permissions:` block, a removed `npm run bench` step) each turned the suite
red. The comment-stripper is proven separately on fixtures, so a stripper returning `""` cannot
satisfy the negative assertions.

**Suite after audit:** 29 files / 417 tests green (was 27 / 385), `tsc --noEmit` clean.
