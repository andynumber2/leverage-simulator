---
phase: 7
slug: sweep-engine-and-the-heatmap
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: false  # set true once wave 1 lands; every Wave 0 file is created by a named task
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
| 07-01-T1 | 07-01 | 1 | VIZ-03, VIZ-06 | T-07-* | Graduate the Phase 6 geometry and the pure mockup-runtime helpers into src/heatmap/ | unit | `npm run typecheck && npm run test` | ❌ W0 | ⬜ pending |
| 07-01-T2 | 07-01 | 1 | VIZ-03, VIZ-06 | T-07-* | End-to-end "a user sees a real swept field" tracer, one path only | browser | `npm run typecheck && npm run test && npm run test:app -- --run tests/app/sweep-tracer.browser.test.ts` | ❌ W0 | ⬜ pending |
| 07-01-T3 | 07-01 | 1 | VIZ-03, VIZ-06 | T-07-* | Prove the per-column series reuse is correct, not just fast | unit | `npm run test -- --run tests/sweep/column-series.test.ts` | ❌ W0 | ⬜ pending |
| 07-02-T1 | 07-02 | 2 | VIZ-03 | T-07-* | Parameterize the ramp interpolator without changing a single existing output | unit | `npm run typecheck && npm run test -- --run tests/value-to-color.test.ts tests/color-scale-cvd.test.ts` | ❌ W0 | ⬜ pending |
| 07-02-T2 | 07-02 | 2 | VIZ-03 | T-07-* | Add the sequential drawdown ramp and the three fixed per-metric domains | unit | `npm run typecheck && npm run test -- --run tests/value-to-color.test.ts tests/color-scale-cvd.test.ts` | ❌ W0 | ⬜ pending |
| 07-02-T3 | 07-02 | 2 | VIZ-03 | T-07-* | Route the field sampler by metric instead of by a two-value union | unit | `npm run typecheck && npm run test -- --run tests/field-sampler.test.ts tests/value-to-color.test.ts` | ❌ W0 | ⬜ pending |
| 07-03-T1 | 07-03 | 2 | METR-06, PERF-03 | T-07-* | Write all three metrics and the flag byte for every cell in one pass | unit | `npm run typecheck && npm run test -- --run tests/sweep tests/metrics` | ❌ W0 | ⬜ pending |
| 07-03-T2 | 07-03 | 2 | METR-06, PERF-03 | T-07-* | Point the official PERF-03 measurement at the production pool | bench | `npm run bench -- --run bench/sweep.bench.test.ts` | ❌ W0 | ⬜ pending |
| 07-03-T3 | 07-03 | 2 | METR-06, PERF-03 | T-07-* | Act on the measured annualized cost, and correct F-06's hypothesis in the record | bench | `npm run test -- --run tests/metrics/irr.test.ts && npm run bench -- --run bench/sweep.bench.test.ts` | ❌ W0 | ⬜ pending |
| 07-04-T1 | 07-04 | 2 | VIZ-03, PERF-05 | T-07-* | Stitch marching-squares segments into closed band rings | unit | `npm run typecheck && npm run test -- --run tests/heatmap/polygon-fill.test.ts` | ❌ W0 | ⬜ pending |
| 07-04-T2 | 07-04 | 2 | VIZ-03, PERF-05 | T-07-* | Run the D-07 gate: same picture, and inside the repaint budget | bench | `npm run bench -- --run bench/heatmap-form-2.bench.test.ts` | ❌ W0 | ⬜ pending |
| 07-04-T3 | 07-04 | 2 | VIZ-03, PERF-05 | T-07-* | D-06 escalation, only a real pause on a gate miss | checkpoint | `blocking checkpoint (no automated verify)` | ❌ W0 | ⬜ pending |
| 07-04-T4 | 07-04 | 2 | VIZ-03, PERF-05 | T-07-* | Ship the decided path and leave the oracle standing | bench | `npm run typecheck && npm run test && npm run test:app && npm run bench -- --run bench/heatmap-form-2.bench.test.ts` | ❌ W0 | ⬜ pending |
| 07-05-T1 | 07-05 | 2 | PERF-04, PERF-06 | T-07-* | Cancel a sweep by generation, never by tearing down the pool | unit | `npm run typecheck && npm run test -- --run tests/sweep/cancellation.test.ts tests/sweep-pool.test.ts` | ❌ W0 | ⬜ pending |
| 07-05-T2 | 07-05 | 2 | PERF-04, PERF-06 | T-07-* | Paint a complete coarse field first, then refine, with no flash and no spinner | browser | `npm run typecheck && npm run test && npm run test:app` | ❌ W0 | ⬜ pending |
| 07-05-T3 | 07-05 | 2 | PERF-04, PERF-06 | T-07-* | Measure PERF-04 and PERF-06 against the shipped path | bench | `npm run bench -- --run bench/sweep-progressive.bench.test.ts` | ❌ W0 | ⬜ pending |
| 07-06-T1 | 07-06 | 3 | VIZ-04, METR-06 | T-07-* | Extend the permalink allow-list by exactly two keys | unit | `npm run typecheck && npm run test -- --run tests/app/permalink.test.ts tests/app/permalink-methodology.test.ts` | ❌ W0 | ⬜ pending |
| 07-06-T2 | 07-06 | 3 | VIZ-04, METR-06 | T-07-* | The Single run and Sweep switch, filling the slot D-21 reserved | browser | `npm run typecheck && npm run test:app -- --run tests/app/sweep-controls.browser.test.ts tests/app/controls.browser.test.ts` | ❌ W0 | ⬜ pending |
| 07-06-T3 | 07-06 | 3 | VIZ-04, METR-06 | T-07-* | The metric toggle, and proving a metric change is a re-color | browser | `npm run typecheck && npm run test:app -- --run tests/app/sweep-controls.browser.test.ts` | ❌ W0 | ⬜ pending |
| 07-07-T1 | 07-07 | 3 | VIZ-01, VIZ-02, VIZ-04 | T-07-* | The two marginal slice charts, sharing the field's own axes | browser | `npm run typecheck && npm run test:app -- --run tests/app/slice-charts.browser.test.ts` | ❌ W0 | ⬜ pending |
| 07-07-T2 | 07-07 | 3 | VIZ-01, VIZ-02, VIZ-04 | T-07-* | One legend slot, two continuous variants, two detached categorical swatches | browser | `npm run typecheck && npm run test:app -- --run tests/app/slice-charts.browser.test.ts` | ❌ W0 | ⬜ pending |
| 07-07-T3 | 07-07 | 3 | VIZ-01, VIZ-02, VIZ-04 | T-07-* | The caption strip, so a cropped screenshot still says what it is | browser | `npm run typecheck && npm run test:app -- --run tests/app/sweep-caption.browser.test.ts tests/app/screenshot-region.browser.test.ts` | ❌ W0 | ⬜ pending |
| 07-08-T1 | 07-08 | 4 | VIZ-03 | T-07-* | Snap to the nearest cell, and never draw a crosshair off the grid | unit | `npm run typecheck && npm run test -- --run tests/heatmap` | ❌ W0 | ⬜ pending |
| 07-08-T2 | 07-08 | 4 | VIZ-03 | T-07-* | Two crosshairs that cannot be confused, and a readout that is the cell's receipt | browser | `npm run typecheck && npm run test:app -- --run tests/app/crosshair.browser.test.ts` | ❌ W0 | ⬜ pending |
| 07-08-T3 | 07-08 | 4 | VIZ-03 | T-07-* | Drill-down is the crosshair plus the mode switch, and nothing else | browser | `npm run typecheck && npm run test:app -- --run tests/app/crosshair.browser.test.ts tests/app/controls.browser.test.ts` | ❌ W0 | ⬜ pending |
| 07-09-T1 | 07-09 | 4 | VIZ-03, VIZ-06, VIZ-09 | T-07-* | The labelled short-horizon rule, colours left intact | browser | `npm run typecheck && npm run test -- --run tests/heatmap/short-horizon.test.ts && npm run test:app -- --run tests/app/ruin-and-horizon.browser.test.ts` | ❌ W0 | ⬜ pending |
| 07-09-T2 | 07-09 | 4 | VIZ-03, VIZ-06, VIZ-09 | T-07-* | Name the verification sweep and prove ruin is categorical on it | browser | `npm run test:app -- --run tests/app/ruin-and-horizon.browser.test.ts` | ❌ W0 | ⬜ pending |
| 07-09-T3 | 07-09 | 4 | VIZ-03, VIZ-06, VIZ-09 | T-07-* | Make the hatch and the rule read cleanly together where they overlap | browser | `npm run test:app -- --run tests/app/ruin-and-horizon.browser.test.ts` | ❌ W0 | ⬜ pending |
| 07-09-T4 | 07-09 | 4 | VIZ-03, VIZ-06, VIZ-09 | T-07-* | Label the breakeven curve inline, on the curve itself | browser | `npm run typecheck && npm run test:app -- --run tests/app/ruin-and-horizon.browser.test.ts` | ❌ W0 | ⬜ pending |
| 07-10-T1 | 07-10 | 5 | PERF-09 | T-07-* | The viewport transform, clamped and axis-aware | unit | `npm run typecheck && npm run test -- --run tests/heatmap/viewport.test.ts` | ❌ W0 | ⬜ pending |
| 07-10-T2 | 07-10 | 5 | PERF-09 | T-07-* | Wire pan and zoom into the panel without touching the sweep | browser | `npm run typecheck && npm run test:app -- --run tests/app/crosshair.browser.test.ts` | ❌ W0 | ⬜ pending |
| 07-10-T3 | 07-10 | 5 | PERF-09 | T-07-* | Measure PERF-09 at full cell count | bench | `npm run bench -- --run bench/heatmap-panzoom.bench.test.ts` | ❌ W0 | ⬜ pending |

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
- [x] Name the verification sweep (symbol, tier, mode, holding period) that genuinely yields `ruinedCount > 0`. RESOLVED at plan time (Finding F-02 closed). The named sweep, authored into `07-09-PLAN.md` Task 2: symbol `SPX`, `dividendReinvest` true, tier `extended` (entry axis begins 1927-12-30), sweep mode open-ended (hold to end of data), `initialInvestment` 10,000, `contributionAmount` 0, default cost parameters, leverage axis 1x to 5x over 50 rows, entry-date axis 200 columns. Ruin mechanism: SPX's only single-day decline steep enough to ruin a position below 5x is 1987-10-19 at roughly minus 20.5%, which crosses the kernel's `value <= 0` line for leverage above roughly 4.88; in open-ended mode every entry-date column before that date holds through it
- [ ] Repoint `bench/sweep.bench.test.ts` and `bench/heatmap-form-2.bench.test.ts` at the production pool/renderer (Finding F-05); until then they measure the Phase 1 spike and the Phase 6 mockup, not shipped code

---

### Backstop-verified truths (abstain to `human_needed` if unconfirmed)

Seven `must_haves.truths` across the plan set carry `verification: backstop` and cannot be confirmed
by an explicit assertion alone. Each is a narrow-viewport, overflow, or in-flight-timing check:
07-01 (E3 overflow), 07-06 (E2 overflow, E2 long-text), 07-07 (VIZ-04 concurrency, E4 overflow,
E7 overflow), 07-08 (E5 overflow), 07-09 (E8 overflow), 07-10 (PERF-09 precision). A verifier that
cannot confirm one abstains rather than passing it silently.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| _none_ | | Every behavior in this phase has an automated verify. Success criteria 3 and 5 explicitly require measured figures, so no performance behavior may be signed off manually, and every visual claim (ruin categorical distinctness, colours-intact short-horizon marking, hatch-and-rule legibility, crosshair distinction, legend tick collision) is asserted by canvas pixel sampling or bounding-box comparison rather than by observation | |

Success criteria 3 and 5 explicitly require *measured* figures, not observation — no
performance behavior in this phase may be signed off manually.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (31 of 32 tasks carry `<automated>`; the one exception is `07-04-T3`, a `checkpoint:decision` required by D-06, which is a human gate by construction)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (longest gap is 1)
- [x] Wave 0 covers all MISSING references (each Wave 0 test file is created by the task that first needs it: `column-series.test.ts` in 07-01-T3, `cancellation.test.ts` in 07-05-T1, `polygon-fill.test.ts` in 07-04-T1, the sequential-ramp extension in 07-02-T2, the named ruin sweep in 07-09-T2, and both bench repointings in 07-03-T2 and 07-04-T2)
- [x] No watch-mode flags (every command uses `vitest run` via the existing npm scripts)
- [x] Feedback latency < 60s for the quick run (`npm run test` is the Node `unit` project only)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** plan-time sign-off complete. 32 tasks mapped across 10 plans and 5 waves.
