---
phase: 03
slug: simulation-kernel-and-the-upro-tqqq-gate
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-18
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded by plan-phase from `03-RESEARCH.md` § Validation Architecture. Task IDs are
> filled in by the planner; `TBD` rows mean "the plan had not been written yet when this
> file was seeded", not "unverified".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 — already configured with three projects (`unit`, `bench`, `bench-selftest`) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test` (the `unit` project only, Node environment) |
| **Full suite command** | `npm run test && npm run bench` (unit correctness plus the PERF-02 budget gate) |
| **Estimated runtime** | ~10s quick, ~60s full (bench spawns headless Chromium) |

`npm run bench:selftest` is a gate-liveness proof, not part of the normal loop. Do not add it
to the per-task sampling command.

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npm run test && npm run bench`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds (quick), 60 seconds (full)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 1 | SIM-01 | — | N/A | unit (fast-check property) | `npm run test` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | SIM-02 | — | N/A | unit (fixed-case + fast-check) | `npm run test` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | SIM-03 | — | N/A | unit (calendar-day accrual, 3-day weekend) | `npm run test` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | SIM-04 | — | N/A | unit (1x exactness, 1e-9 relative) | `npm run test` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | SIM-05 | — | N/A | unit (ruin clamp / flag / absorbing) | `npm run test` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | SIM-07 | — | N/A | unit (dividend-reinvest series toggle) | `npm run test` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | SIM-08 | — | N/A | unit (entry date, fixed period vs hold-to-today) | `npm run test` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | SIM-10 | — | N/A | unit (kernel module boundary — import assertion) | `npm run test` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | SIM-12 | — | N/A | unit (PITFALLS §A checklist) | `npm run test` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | SIM-06 | — | N/A | unit (contribution date resolution) | `npm run test` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | SIM-09 | — | N/A | unit (constant-pinning against citation, D-19) | `npm run test` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | SIM-11 | — | N/A | unit (Node `--expose-gc` heap-delta) | `npm run test` (needs `--expose-gc` wiring) | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | VALID-01 | — | N/A | unit (real-data tracking error vs UPRO/TQQQ) | `npm run test` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | VALID-02 | — | N/A | unit (build-failing tolerance gate) | `npm run test` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | VALID-03 | — | N/A | manual checkpoint + unit (see Manual-Only below) | `npm run test` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | PERF-02 | — | N/A | bench (<16ms over ~25,000 bars) | `npm run bench` | ✓ exists | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Wave numbers above are the validation-strategy expectation, not a binding plan wave assignment.
The planner owns wave assignment; if it differs, this table follows the plan.

---

## Wave 0 Requirements

- [ ] `src/kernel/` — the real kernel module plus its test file, carrying the PITFALLS §A
      checklist. `tests/kernel.test.ts` exists today against the throwaway Phase 1 spike kernel
      and is the direct structural template; the ruin and 3-day-gap cases port over.
- [ ] `src/kernel/cost-parameters.ts` — the sourced, citation-pinned constants module. Must be
      committed atomically and BEFORE the tracking-error gate test, per D-19.
- [ ] `tests/validation/upro-tqqq-gate.test.ts` — the build-failing tracking-error gate. Entirely
      new; loads the Phase 2 bundle through `tools/bundle-compiler/src/binary-format.ts`.
- [ ] `--expose-gc` wiring for the SIM-11 GC-pressure test — a new npm script or a Vitest
      `poolOptions.execArgv` entry. Does not exist yet.
- [ ] `scripts/run-backtest.ts` — the one-shot end-to-end equity-curve script (ROADMAP criterion 4).
- [ ] `bench/kernel.bench.test.ts` — exists, but its `runSpikeBacktest` import must be swapped for
      the real kernel or PERF-02 measures the throwaway.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cost parameters were sourced independently and not tuned after seeing tracking error | VALID-03 / D-19 | D-19 explicitly rejected a CI commit-ordering check as brittle. The property is about author intent over git history, which a test cannot assert. | Confirm the `cost-parameters.ts` commit is an ancestor of the tracking-error gate test commit and that no later commit modifies a cost constant: `git log --follow --oneline -- src/kernel/cost-parameters.ts` and compare against the gate test's first commit. |
| Inception-era UPRO/TQQQ expense ratios verified against a primary SEC filing | SIM-09 / D-17 | The research session could not reach `sec.gov` (HTTP 403 on every fetch), so those figures are `[ASSUMED]`. A human must confirm against EDGAR or the Wayback Machine before they are committed as sourced constants. | Open the 2009 UPRO and 2010 TQQQ prospectuses on EDGAR, record the stated gross expense ratio and the filing accession number into the citation block. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
