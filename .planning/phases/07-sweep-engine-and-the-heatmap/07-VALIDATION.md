---
phase: 7
slug: sweep-engine-and-the-heatmap
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-22
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded by `/gsd-plan-phase 07` from `07-RESEARCH.md` § Validation Architecture.
> The Per-Task Verification Map is filled once PLAN.md task IDs exist.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10, four configured projects (`unit`, `bench`, `app`, `bench-selftest`) |
| **Config file** | `vitest.config.ts` (project root) |
| **Quick run command** | `npm run test` (fast Node `unit` project only) |
| **Full suite command** | `npm run test` + `npm run bench` (Playwright-backed browser project, required for Canvas / uPlot / Worker behavior and all PERF measurements) |
| **Estimated runtime** | `npm run test` ~seconds; `npm run bench` minutes (browser-backed) |

Pure typed-array/math modules (`iso-lines.ts`, `field-sampler.ts`, `value-to-color.ts`,
`sweep-fixture-format.ts`) run in the fast Node `unit` project — existing precedent in
`tests/*.test.ts`. Anything needing a real Canvas context, a real Worker, or real Playwright
timing runs in `bench`.

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npm run test` && `npm run bench`
- **Before `/gsd-verify-work`:** Full suite must be green (baseline at Phase 6 close: 697/697 unit tests pass)
- **Max feedback latency:** 60 seconds for the quick run

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _pending — populated once PLAN.md tasks exist_ | | | | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Requirement → test coverage (from 07-RESEARCH.md)

| Req ID | Behavior | Test Type | Automated Command | File Exists |
|--------|----------|-----------|-------------------|-------------|
| VIZ-01 | Fixed-leverage slice chart renders one row of the cached grid | unit + app | `npm run test` / `npm run test:app` | ❌ W0 |
| VIZ-02 | Fixed-entry-date slice chart renders one column | unit + app | `npm run test` / `npm run test:app` | ❌ W0 |
| VIZ-03 | Heatmap renders `form-2-filled-contour` against live swept data | app/browser equivalence | `npm run bench` | ⚠️ pattern exists (`bench/heatmap-form-2.bench.test.ts`); live-grid version is W0 |
| VIZ-04 | Sweep-mode toggle; chart states which mode produced it | app/browser | `npm run test:app` | ❌ W0 |
| VIZ-06 | Ruin hatch renders categorically distinct, on a sweep where ruin genuinely occurs | app/browser pixel-sample + named ruin-producing sweep | `npm run test:app` / `npm run bench` | ❌ W0 — exact sweep parameters still unnamed (Finding F-02) |
| VIZ-09 | Short-horizon boundary rule renders in hold-to-today mode | app/browser | `npm run test:app` | ❌ W0 |
| METR-06 | All display metrics computed per cell in one pass | unit | `npm run test` | ❌ W0 |
| PERF-03 | Full 10,000-cell sweep < 1000ms on 4-core baseline | bench | `npm run bench` | ⚠️ harness exists (`bench/sweep.bench.test.ts` measures the Phase 1 spike pool); production-pool measurement is W0 |
| PERF-04 | First partial results paint within 100ms | bench | `npm run bench` | ❌ W0 |
| PERF-05 | Metric re-color < 16ms, never re-sweeps | bench | `npm run bench` | ⚠️ recorder exists but must be repointed at the shipped renderer (Finding F-05) |
| PERF-06 | Cancellation within one frame; superseded results discarded | bench (timing) + unit (correctness) | `npm run bench` / `npm run test` | ❌ W0 |
| PERF-09 | Pan/zoom sustain 60fps at full cell count | bench | `npm run bench` | ❌ W0 — precedent: `bench/perf-07.bench.test.ts` `measureInteractionTiming` |

---

## Wave 0 Requirements

- [ ] `tests/sweep/column-series.test.ts` — one `KernelSeries` resolution shared correctly across all 50 leverage rows of an entry-date column (correctness of the per-column reuse, separate from its performance claim)
- [ ] `tests/sweep/cancellation.test.ts` — a stale-generation chunk result is discarded and never merged into the live grid (PERF-06 correctness, separable from its timing)
- [ ] `tests/heatmap/polygon-fill.test.ts` — the D-08 oracle-equivalence test (polygon fill vs `resampleField`), covering field-edge band, enclosed-band hole, and categorical-adjacent boundary
- [ ] `tests/value-to-color.test.ts` extension — sequential-ramp perceptual-uniformity test mirroring the existing diverging-ramp test (D-25 needs a second interpolator; `interpolateRamp` is hardcoded to `RAMP_STOPS`)
- [ ] Name the verification sweep (symbol, tier, mode, holding period) that genuinely yields `ruinedCount > 0` — resolves Finding F-02; a plan-authoring task, but VIZ-06 cannot be checked without it
- [ ] Repoint `bench/sweep.bench.test.ts` and `bench/heatmap-form-2.bench.test.ts` at the production pool/renderer (Finding F-05); until then they measure the Phase 1 spike and the Phase 6 mockup, not shipped code

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| _to be determined during planning_ | | | |

Success criteria 3 and 5 explicitly require *measured* figures, not observation — no
performance behavior in this phase may be signed off manually.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s for the quick run
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
