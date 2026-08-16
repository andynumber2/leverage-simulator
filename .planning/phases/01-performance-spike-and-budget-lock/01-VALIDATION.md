---
phase: 1
slug: performance-spike-and-budget-lock
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-16
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 — Node-mode project for correctness tests, browser-mode project (`@vitest/browser-playwright` 4.1.10 + `playwright` 1.62.1) for Worker/Canvas-touching bench tests |
| **Config file** | none — Wave 0 creates `vitest.config.ts` (workspace: fast Node-mode project + slower browser-mode bench project) |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npm run bench` |
| **Estimated runtime** | ~5 s quick (Node-mode); ~60–180 s full (browser-mode, includes calibration) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npm run bench`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 180 seconds (full); 5 seconds (quick)

---

## Per-Task Verification Map

> Task IDs are filled in by the planner. Rows below are seeded from RESEARCH.md
> `## Validation Architecture` → `Phase Requirements → Test Map` and must be
> reconciled against the final PLAN.md task list during execution.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 0 | — | — | N/A | setup | `npx vitest run` (config resolves, zero tests is not a pass) | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | PERF-01 | — | Budget breach fails the run rather than warning | integration | `npx vitest run tests/perf-budgets.selftest.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | PERF-01a | — | N/A | manual | code review of `perf-budgets.ts` `anchorMs` / `relaxationReason` fields + PROJECT.md Key Decisions | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | PERF-10 | — | N/A | smoke | `npm run bench` prints every PERF-02..09 row, unmeasured rows marked `unmeasured` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | PERF-11 | — | N/A | integration | `npm run bench` asserts environment block fields (machine, core count) non-empty | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | PERF-01 | T-01 (fork-PR privilege escalation) | CI uses `pull_request`, not `pull_request_target` | integration | CI run on a deliberately-regressed commit exits non-zero | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — Node-mode project + browser-mode `@vitest/browser-playwright` project
- [ ] `perf-budgets.ts` — typed budget module, all eight PERF-02..09 rows present (D-19)
- [ ] `bench/` scaffold — `calibration.ts`, `environment-block.ts`, `report.ts`, `synthetic-data.ts`
- [ ] `tests/perf-budgets.selftest.test.ts` — D-09 permanent gate-liveness self-test
- [ ] `package.json` `"bench"` script wired to the browser-mode Vitest project
- [ ] `.github/workflows/ci.yml` — D-01 GitHub Actions, `pull_request` + push-to-main triggers, Playwright cache step
- [ ] Framework install: `npm install --save-dev vitest@4.1.10 @vitest/browser-playwright@4.1.10 playwright@1.62.1 comlink@4.4.2 && npx playwright install --with-deps chromium`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Every threshold carries a perception anchor, and any threshold looser than its anchor carries a written reason plus a Key Decision | PERF-01a | Process/documentation requirement — no runtime assertion can judge whether a written reason is adequate | Read `perf-budgets.ts`: every row has `anchorMs`; every row where the threshold exceeds `anchorMs` has a non-empty `relaxationReason` and a matching Key Decision row in PROJECT.md |
| Plain-JS-vs-WASM and hand-rolled-Canvas-vs-library decisions are recorded citing the measured figure | Phase criterion 2 | Judging whether a decision cites the figure that settled it is a review judgment | Read PROJECT.md Key Decisions; each of the two entries names a measured number and the machine it was measured on |
| Rust/wasm-pack toolchain availability for the D-11 WASM microbenchmark | — | Environment-dependent; research sandbox had no cargo/wasm-pack | Run `cargo --version && wasm-pack --version` before the WASM microbenchmark task; if absent, install via rustup (never npm) or gate the task |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
