---
phase: 07-sweep-engine-and-the-heatmap
verified: 2026-08-23T18:00:00Z
status: gaps_found
score: 4/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "Evidence-quality gap: PERF-03's verdict was 'withheld' on every host measured, with no real 4-core-baseline figure for the retargeted production-pool bench. Closed by 07-11: CI run 32654061079 (GitHub Actions ubuntu-latest, hardwareConcurrency=4) produced a real, non-withheld verdict (source=production)."
    - "Missing PROJECT.md Key Decision for the contribution-schedule (solveIrr) overrun. Closed by 07-12: PROJECT.md Key Decisions table now carries the row 'PERF-03 D-17 baseline escalation (Phase 7)', resolving both overruns with a named lever (pool-tuning first, D-03's coarser grid held in reserve)."
  gaps_remaining:
    - "Roadmap success criterion 3 (PERF-03): the full 10,000-cell sweep does NOT complete under 1000ms on the declared 4-core baseline. It is now measured, not withheld, and the measurement is a FAIL: normalizedMs=1168.59 against a 1000ms budget (116.9% of budget), CI run 32654061079, hardwareConcurrency=4, source=production, verdict=fail. A separate, larger overrun exists on the contribution-schedule (solveIrr) branch: normalizedMs=8961.84 (~8.96x over budget), same run, same host. Remediation (pool tuning) is named and recorded but not implemented; a follow-up phase must implement it and re-measure on the same 4-core baseline before this criterion can be called met."
  regressions: []
gaps:
  - truth: "Measured on a 4-core baseline machine and reported by the benchmark command: a full 10,000-cell sweep completes in under 1000ms wall clock from user action to final cell (PERF-03)."
    status: failed
    reason: >
      This criterion moved from unverifiable to verified-failing. Plan 07-11 landed the phase's
      first real, non-withheld D-17 baseline measurement for the retargeted, production-pool
      bench/sweep.bench.test.ts: CI run 32654061079 (GitHub Actions ubuntu-latest,
      hardwareConcurrency=4, calibrationScore=0.8150, headSha d81bc3501c1cd1e12c1b2f0e9eb86798f2ccc31b,
      pull_request event on PR #7). The zero-contribution headline row -- the app's default
      view -- recorded measuredMs=952.40, normalizedMs=1168.59 against the 1000ms budget,
      source=production, verdict=fail. That is 116.9% of budget, an outright miss, not a
      narrow one, and it corrects an earlier assumption (visible in 07-12-PLAN.md's own Task 1
      context, which 07-12-SUMMARY.md documents overriding) that the default view was inside
      budget.

      A second, larger overrun exists on the same run: the contribution-schedule (F-06, D-24
      solveIrr) branch measured measuredMs=7303.90, normalizedMs=8961.84 (sampleCount=1,
      informational, not a gated MeasurementRow) -- roughly 8.96x over the same 1000ms budget,
      and roughly 7.67x worse than this run's own headline figure. All figures on this run carry
      hardwareConcurrency=4 and workerCount=3 (workerCountForCores(4)); no figure from a
      different-core-count host is used as a baseline number anywhere in this report.

      Plan 07-12 recorded the required escalation: PROJECT.md's Key Decisions table now carries
      "PERF-03 D-17 baseline escalation (Phase 7)", resolving both overruns together with a named
      lever (spend pool tuning first; hold D-03's coarser default grid in reserve; WASM already
      ruled out per 01-04's ~1.20x-slower measurement). No thresholdMs, NOMINAL_REFERENCE_MS, or
      calibration/run-level cap constant was changed anywhere in either gap-closure plan --
      confirmed directly: `git diff --exit-code -- perf-budgets.ts bench/calibration.ts
      bench/report.ts bench/sweep.bench.test.ts` exits 0 on the current branch head.

      The escalation is now honestly recorded, but recording a decision to fix something later is
      not the same as the thing being fixed. The roadmap's own success-criterion wording --
      "a full 10,000-cell sweep completes in under 1000ms" -- describes a measured outcome, and
      the outcome measured on the declared baseline is a fail, by a wide margin on the default
      view and a very wide margin on the contribution-schedule view. Pool tuning is named as the
      lever to try, not implemented; nothing in the codebase currently makes this criterion true.

      Also carried forward, unresolved: this same baseline run's own totalRuntimeMs (43,259ms)
      exceeded BENCH_TOTAL_RUNTIME_CAP_MS (30,000ms), masked only because assertRunInvariants
      checks the verdict-fail gate before the total-runtime gate. Not a phase must-have on its
      own, but recorded here because it will resurface for whichever phase implements the pool
      tuning fix.
    artifacts:
      - path: "bench/sweep.bench.test.ts"
        issue: "Sole PERF-03 recorder. Now produces a real, non-withheld verdict on the declared baseline (CI run 32654061079) and that verdict is FAIL for both the zero-contribution headline row and the contribution-schedule info row. Zero diff to this file across both gap-closure plans -- the measurement is real, not adjusted."
      - path: ".planning/PROJECT.md"
        issue: "Now carries the required Key Decision row (escalation is recorded, not silent). The row explicitly states 'PERF-03 is FAILED, not met' and defers implementation of the chosen lever (pool tuning) to a follow-up phase."
    missing:
      - "Implementation of pool tuning (chunking, transfer discipline, or partition-shape changes to src/sweep/sweep-pool.ts / sweep.worker.ts) targeted at the 4-core baseline's per-cell throughput, for both the zero-contribution and contribution-schedule branches."
      - "A follow-up D-17 baseline CI measurement, after that implementation, showing normalizedMs at or under the 1000ms budget for the zero-contribution headline row, before PERF-03 can be marked met."
deferred: []
human_verification:
  - test: "Visually confirm the ruin hatch and short-horizon rule read clearly (not just pixel-distinct by assertion) against the diverging and sequential ramps in both light and dark theme, on a real high-leverage 1929-entry-window sweep."
    expected: "A ruined cell reads unambiguously as 'this outcome is categorically different,' not as 'this is just a very dark/extreme color,' at normal viewing size -- not only under the 33-sample/2px-neighbor pixel assertions tests/app/ruin-and-horizon.browser.test.ts already proves."
    why_human: "Pixel-level distinctness (proven) is necessary but not sufficient for perceptual legibility; whether the hatch texture reads clearly to a human eye at normal zoom is a visual-design judgment automated assertions cannot make."
  - test: "Drag the holding-period control continuously (the codebase's own documented hardest case for PERF-06/PERF-07) and watch the caption strip's failed-cell count against WR-01 from 07-REVIEW.md."
    expected: "The caption's 'N cells could not be computed' line should never contradict what is visibly painted (grey incomplete cells) on screen."
    why_human: "07-REVIEW.md's WR-01 finding describes a provable but narrow race (a superseded generation's coarse-pass failures never reach sweepFailedCellCount when its own full pass never resolves) that a human drag session is the fastest way to trigger and observe; it is a WARNING-tier advisory, not itself a phase must-have failure, but worth an eyes-on check before shipping."
---

# Phase 07: Sweep Engine and the Heatmap Verification Report

**Phase Goal:** A user sees how the answer changes across every entry date and every leverage level at once, without the interface ever stalling
**Verified:** 2026-08-23T18:00:00Z
**Status:** gaps_found
**Re-verification:** Yes — after gap-closure plans 07-11 and 07-12

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The 2D heatmap over entry date and leverage renders Phase 6's chosen treatment against real swept data, with fixed-leverage/fixed-entry-date slice charts and a sweep-mode toggle stating which mode produced it | VERIFIED (carried forward, unchanged) | Unaffected by 07-11/07-12: `git log fb9c36d..HEAD -- src/ bench/ tests/` shows only `bench/heatmap-form-2.bench.test.ts` (a runtime-cap fix, informational arm only) touched. `HeatmapPanel.tsx`, `SliceChart.tsx`, `SweepModeToggle.tsx`, `SweepCaption.tsx` remain mounted and wired as previously verified; `tests/app/slice-charts.browser.test.ts` and `tests/app/sweep-caption.browser.test.ts` still pass |
| 2 | Ruined cells read as categorically different from the continuous color scale, verified on a 1929-entry high-leverage sweep where ruin genuinely occurs; the hold-to-today short-horizon artifact is visually marked | VERIFIED (carried forward, unchanged) | Unaffected by 07-11/07-12 (see above). `tests/app/ruin-and-horizon.browser.test.ts` and `tests/heatmap/short-horizon.test.ts` unchanged and previously confirmed passing |
| 3 | A full 10,000-cell sweep completes in under 1000ms wall clock on a 4-core baseline (measured by the benchmark command), first partial results paint within 100ms with progressive fill | **FAILED** (re-verified: was unverifiable, now measured failing) | PERF-04 (100ms first-partial-paint) still passes cleanly: 22.48ms, unchanged. **PERF-03 (1000ms full-sweep) now has a real, non-withheld verdict on the declared 4-core baseline, and it is FAIL**: `measuredMs=952.40`, `normalizedMs=1168.59` (116.9% of budget), `verdict=fail`, `source=production`, `hardwareConcurrency=4`, CI run `32654061079`, headSha `d81bc3501c1cd1e12c1b2f0e9eb86798f2ccc31b`. See Gaps below |
| 4 | Changing the heatmap's displayed metric re-colors the cached grid in under 16ms and never triggers a re-sweep, because the sweep computes every display metric per cell in a single pass | VERIFIED (carried forward, unchanged) | PERF-06 (0.01ms), `tests/sweep/metrics-one-pass.test.ts`, `tests/app/sweep-controls.browser.test.ts` all unaffected by 07-11/07-12, previously confirmed passing |
| 5 | Changing a parameter mid-sweep cancels the in-flight sweep within one frame and discards superseded results; heatmap pan and zoom sustain 60fps at full cell count, both measured | VERIFIED (carried forward, unchanged) | `tests/sweep/cancellation.test.ts`, PERF-09 (1.65ms, `bench/heatmap-panzoom.bench.test.ts`) both unaffected by 07-11/07-12, previously confirmed passing |

**Score:** 4/5 truths verified, 1 failed, 0 present-but-behavior-unverified

**What changed since the previous verification pass:** Truth 3 has moved from "could not be verified" (verdict withheld on every host tested) to "verified as failing" (a real, non-withheld D-17 baseline measurement exists and it is over budget). This is real progress in evidence quality — the gap is no longer an open question, it is a known, quantified, and now-escalated fact — but it does not mean the criterion passes. It does not pass.

### Required Artifacts

All artifacts declared across the twelve plans' `must_haves.artifacts` exist and are substantive (no stub bodies, no debt markers). Only `bench/heatmap-form-2.bench.test.ts` and two documentation files (`07-PERF-03-BASELINE.md`, `PROJECT.md`) changed since the prior verification pass.

| Artifact | Status |
|----------|--------|
| `src/heatmap/{iso-lines,field-sampler,hatch-pattern,sweep-copy,paint-contour,polygon-fill,short-horizon,curve-label,crosshair,viewport}.ts` | VERIFIED — unchanged since prior pass |
| `src/sweep/{sweep-grid,resolve-column-series,sweep.worker,sweep-pool}.ts` | VERIFIED — unchanged since prior pass; zero diff confirmed for `sweep.worker.ts`/`sweep-pool.ts` across 07-11/07-12 |
| `src/colorscale/value-to-color.ts` | VERIFIED — unchanged |
| `src/app/components/ResultColumn/{HeatmapPanel,SweepModeToggle,MetricToggle,SliceChart,SweepLegend,SweepCaption,HoverReadout}.tsx` | VERIFIED — unchanged |
| All twelve plans' declared test files (`tests/sweep/*`, `tests/heatmap/*`, `tests/app/*.browser.test.ts`) | VERIFIED — unchanged, all still pass per orchestrator regression run (796/796 unit, 170/170 app) |
| `bench/sweep.bench.test.ts` | VERIFIED to exist and run; zero diff across 07-11/07-12 (`git diff -- bench/sweep.bench.test.ts` exits 0). **Its PERF-03 verdict now resolves to a real FAIL on the D-17 baseline (was withheld)** |
| `bench/heatmap-form-2.bench.test.ts` | MODIFIED by 07-11: `REJECTED_POLYGON_BATCH_SIZE=2` added to cut an informational-only re-measurement arm's cost, clearing a local `BENCH_TOTAL_RUNTIME_CAP_MS` breach. The shipped/gated PERF-05 measurement's own `REPAINT_BATCH_SIZE=20` and `MeasurementRow` are byte-for-byte unchanged |
| `.planning/phases/07-sweep-engine-and-the-heatmap/07-PERF-03-BASELINE.md` | VERIFIED — new gap-closure evidence document, four sections (harness readiness, D-17 baseline verdict, contribution-schedule figure, recorded decision), all figures carry host `hardwareConcurrency` and run id |
| `.planning/PROJECT.md` | VERIFIED — new Key Decisions row "PERF-03 D-17 baseline escalation (Phase 7)"; `grep -c "solveIrr" .planning/PROJECT.md` = 1, one row added, none removed |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `App.tsx` | `HeatmapPanel.tsx` | `<Show when={resultMode()==='sweep'}><HeatmapPanel grid={sweepGrid()} /></Show>` | WIRED (unchanged) |
| `sweep.worker.ts` | `src/kernel/backtest.ts` (`runBacktest`) | `computeChunkMetrics` calls `runBacktest` per cell | WIRED (unchanged) |
| `sweep-pool.ts` | `state.ts` | generation-gated merge feeds `sweepGrid`/`coarseSweepGrid` signals | WIRED (unchanged) |
| `HeatmapPanel.tsx` | `SliceChart.tsx`, `SweepLegend.tsx`, `SweepCaption.tsx`, `HoverReadout.tsx` | direct imports, shared signals | WIRED (unchanged) |
| `bench/sweep.bench.test.ts` | `src/sweep/sweep-pool.ts` | production-pool measurement (plan 07-03's retarget) | WIRED, and now produces a real non-withheld verdict (was: WIRED but verdict withheld on every host) — **the verdict itself is FAIL, not just non-withheld** |
| `07-PERF-03-BASELINE.md` | `.planning/PROJECT.md` | plan 07-12's closing "## 4. The recorded decision" section names the PROJECT.md row and vice versa | WIRED (new this pass) |

### Behavioral Spot-Checks / Test Execution

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| Full unit suite (orchestrator pre-check, cited per task instructions, not re-run here) | `npm run test` | 59 files, 796/796 passing | PASS |
| Full app/browser suite (orchestrator pre-check, cited per task instructions, not re-run here) | `npm run test:app` | 25 files, 170/170 passing | PASS |
| `npm run typecheck` (orchestrator pre-check, cited per task instructions, not re-run here) | `npm run typecheck` | exit 0 | PASS |
| Budget/calibration/bench-file diff check (re-run independently this pass) | `git diff --exit-code -- perf-budgets.ts bench/calibration.ts bench/report.ts bench/sweep.bench.test.ts` | exit 0, zero diff | PASS — confirms no threshold, cap, or calibration constant moved |

### Probe Execution (Benchmark Command)

| Bench | Command / Source | Result | Status |
|-------|-------------------|--------|--------|
| PERF-03 (`bench/sweep.bench.test.ts`), D-17 baseline | CI run `32654061079` (GitHub Actions `ubuntu-latest`, `pull_request` on PR #7, headSha `d81bc3501c1cd1e12c1b2f0e9eb86798f2ccc31b`), `hardwareConcurrency=4`, `calibrationScore=0.8150` | Zero-contribution headline: `measuredMs=952.40`, `normalizedMs=1168.59`, budget 1000ms, `verdict=fail`, `source=production`, `workerCount=3`. Contribution-schedule (`solveIrr`) info arm: `measuredMs=7303.90`, `normalizedMs=8961.84` (~8.96x over budget), `sampleCount=1` | **FAIL — real, non-withheld baseline verdict, confirmed over budget** |
| PERF-03, informational (non-baseline) | This session's dev sandbox, `hardwareConcurrency=9` (NOT the baseline; cited for contrast only, never as a baseline figure) | Headline: `469.60ms`/`831.15ms` normalized, `verdict=withheld` (correctly, host mismatch). `solveIrr` branch: `2010.20ms`/`3557.88ms` normalized | Informational only — not evidence for or against the roadmap criterion, which is defined against the 4-core baseline specifically |
| PERF-04/PERF-06 (`bench/sweep-progressive.bench.test.ts`) | Carried forward, unaffected by 07-11/07-12 | PERF-04: 22.48ms normalized (budget 100ms) — PASS. PERF-06: 0.01ms normalized (budget 16ms) — PASS | PASS |
| PERF-05 (`bench/heatmap-form-2.bench.test.ts`) | Carried forward; the gated measurement itself is untouched by 07-11's batch-size fix to the unrelated informational arm | 8.35ms normalized (budget 16ms) — PASS | PASS |
| PERF-09 (`bench/heatmap-panzoom.bench.test.ts`) | Carried forward, unaffected by 07-11/07-12 | 1.65ms normalized, `generationUnchanged=true` (budget 16ms) — PASS | PASS |

**Total bench-suite runtime, carried-forward observation:** the same D-17 baseline CI run's own `totalRuntimeMs` was `43,259ms`, exceeding `BENCH_TOTAL_RUNTIME_CAP_MS` (30,000ms). This did not become the *reported* failure reason only because `assertRunInvariants` checks the verdict-fail gate before the total-runtime gate. Not a phase must-have on its own; recorded here because whichever phase implements the pool-tuning fix will need to clear it too.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| VIZ-01 | 07-07 | Fixed-leverage, sweep-entry-date chart | SATISFIED | Unchanged since prior pass |
| VIZ-02 | 07-07 | Fixed-entry-date, sweep-leverage chart | SATISFIED | Unchanged |
| VIZ-03 | 07-01, 07-02, 07-04, 07-08, 07-09 | 2D heatmap over entry date and leverage, colored by selected metric | SATISFIED | Unchanged |
| VIZ-04 | 07-06, 07-07 | Sweep-mode toggle (fixed period / hold-to-today), chart states mode | SATISFIED | Unchanged |
| VIZ-06 | 07-01, 07-09 | Ruined cells categorically distinct, never darkest-end-of-ramp | SATISFIED | Unchanged |
| VIZ-09 | 07-09 | Hold-to-today short-horizon edge visually marked | SATISFIED | Unchanged |
| METR-06 | 07-03, 07-06 | Sweep computes all display metrics per cell in one pass | SATISFIED | Unchanged |
| PERF-03 | 07-03, 07-11, 07-12 | Full 10,000-cell sweep < 1000ms on 4-core baseline | **FAILED** | No longer BLOCKED (unverifiable) — now measured and confirmed failing: `normalizedMs=1168.59` vs 1000ms budget on the real D-17 baseline (CI run 32654061079, `hardwareConcurrency=4`). Escalation recorded as a PROJECT.md Key Decision (pool tuning named, not yet implemented) |
| PERF-04 | 07-05 | First partial results paint within 100ms | SATISFIED | Unchanged |
| PERF-05 | 07-04 | Metric re-color under 16ms | SATISFIED | Unchanged |
| PERF-06 | 07-05 | In-flight sweep cancelled within one frame | SATISFIED | Unchanged |
| PERF-09 | 07-10 | Pan/zoom sustain 60fps at full cell count | SATISFIED | Unchanged |

No orphaned requirements: the twelve IDs declared across the plans exactly match REQUIREMENTS.md's Phase 7 mapping. REQUIREMENTS.md itself still shows all Phase-7-mapped items as `[ ]` (pending) rather than `[x]` (complete) — consistent with this report's finding that PERF-03 remains unmet and the phase as a whole cannot be marked fully complete against its own requirements list.

### Anti-Patterns Found

No new `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers or stub patterns introduced by 07-11/07-12 (checked against the two modified source-adjacent files: `bench/heatmap-form-2.bench.test.ts` and `.planning/PROJECT.md`; both are legitimate, disclosed changes, not debt).

Carried forward from the prior review (`07-REVIEW.md`, unaffected by gap-closure plans), 4 real defects, all WARNING tier, 0 blockers — WR-01 through WR-04, see prior report for detail; none block any roadmap truth.

New, informational (not a phase must-have): the D-17 baseline CI run's total bench-suite runtime (43,259ms) exceeds `BENCH_TOTAL_RUNTIME_CAP_MS` (30,000ms), currently masked by check ordering in `assertRunInvariants`. Flagged for whichever phase does the pool-tuning work, per 07-11-SUMMARY.md and 07-12-SUMMARY.md's own carried-forward notes.

### Human Verification Required

Unchanged from the prior pass — see the `human_verification` list in the frontmatter. Two items, both advisory-tier and unrelated to PERF-03. Neither blocks phase completion on its own.

### Gaps Summary

Eleven of the phase's twelve requirement IDs are satisfied, and four of five roadmap success criteria are demonstrably true, each backed by a passing behavioral test or benchmark measurement. The fifth criterion — a full 10,000-cell sweep completing under 1000ms on a 4-core baseline — is now honestly and completely measured, and the measurement is a fail. Gap-closure plans 07-11 and 07-12 did exactly what they set out to do: they replaced an open, unverifiable question with a real, non-withheld D-17 baseline figure (CI run 32654061079, `hardwareConcurrency=4`, `source=production`) and a recorded PROJECT.md Key Decision. That figure is `normalizedMs=1168.59` against the 1000ms budget for the app's default (zero-contribution) view — 116.9% of budget — and `normalizedMs=8961.84` (roughly 8.96x over budget) for the contribution-schedule (`solveIrr`) branch. Neither threshold nor calibration constant was changed anywhere in either plan (confirmed directly via `git diff`).

This is real, quantified progress: the phase no longer has an open evidentiary question, it has a known, named, escalated performance gap with a chosen remediation lever (pool tuning, spend first; D-03's coarser default grid held in reserve). But the roadmap's own criterion describes a measured outcome ("completes in under 1000ms"), and the measured outcome is over budget on the real baseline. PERF-03 must not be marked met. A follow-up phase needs to implement the named pool-tuning lever and re-measure on the same D-17 baseline before this criterion, and the phase's remaining requirement-completion status, can close.

**Overall phase status, stated plainly:** all 12 plans (10 build plans + 2 gap-closure plans) executed. All regression gates green (`npm run typecheck` exit 0; `npm run test` 796/796; `npm run test:app` 170/170). Eleven of twelve requirement IDs satisfied. One roadmap success criterion (PERF-03) is measured failing on the declared baseline, with the overrun escalated and recorded as a deliberate PROJECT.md decision rather than left silent, and a named remediation deferred to a follow-up phase. The phase is not complete against its own roadmap contract until that remediation is implemented and re-measured.

---

_Verified: 2026-08-23T18:00:00Z_
_Verifier: Claude (gsd-verifier)_
