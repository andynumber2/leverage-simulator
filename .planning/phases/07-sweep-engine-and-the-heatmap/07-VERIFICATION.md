---
phase: 07-sweep-engine-and-the-heatmap
verified: 2026-08-23T03:30:00Z
status: gaps_found
score: 4/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "Measured on a 4-core baseline machine and reported by the benchmark command: a full 10,000-cell sweep completes in under 1000ms wall clock from user action to final cell (PERF-03)."
    status: failed
    reason: >
      The retargeted, real-production-pool PERF-03 measurement (bench/sweep.bench.test.ts,
      rewritten in plan 07-03 to measure src/sweep/sweep-pool.ts over the real compiled bundle)
      has never actually produced a verdict on the declared 4-core baseline. Every host this
      benchmark has been run against since the retarget -- including this verification run --
      reports `verdict=withheld` because `hardwareConcurrency !== PERF_03_BASELINE_HARDWARE_CONCURRENCY`
      (4). No CI run of the post-07-03 bench has landed a 4-core-baseline figure; the only
      4-core-baseline PERF-03 number on record in PROJECT.md (807.92ms, 80.8% of budget) is from
      the Phase 1 spike pool over a synthetic GBM series, not this phase's real kernel-backed sweep.

      Worse, the one real informational data point that exists for a supported, common
      configuration is a genuine budget overrun, not just a withheld-verdict technicality: with a
      non-zero contribution schedule (which routes the sweep's annualized metric through
      `solveIrr`, exactly as METR-01/the plan's own must-have requires), the sweep measures
      2027.40ms raw / 3351.07ms normalized against the 1000ms budget -- a 3.35x overrun -- using
      the SAME baseline-pinned worker count (3 workers, `workerCountForCores(PERF_03_BASELINE_HARDWARE_CONCURRENCY)`)
      the withheld-verdict machinery uses for the zero-contribution case, on a host with MORE
      cores than the 4-core baseline, not fewer. This is not host noise across a marginal budget
      line (as the Phase 1 807.92ms/700ms/702ms 70-80%-of-budget escalations were) -- it is more
      than 3x over budget on a stronger-than-baseline machine, for a parameter combination the
      product explicitly supports (SIM-06 contribution schedules, mirrored into the sweep by this
      phase's own 07-03 must-have).

      07-03-SUMMARY.md itself documents this as an open, unresolved escalation and explicitly
      states it "needs a human-recorded PROJECT.md Key Decision entry... once a D-17 baseline
      (4-core CI) run produces an authoritative figure." No such PROJECT.md entry exists (verified
      by grep across PROJECT.md's Key Decisions table); no later Phase 7 plan (07-04 through
      07-10) mentions or addresses the contribution-schedule sweep cost. The 07-03-PLAN.md
      prohibition ("No PERF budget threshold... may be changed in response to a measurement
      produced by this phase... an over-budget... figure is escalated and recorded as a Key
      Decision, never relaxed") was correctly not violated in the sense that no threshold was
      quietly loosened, but the escalation half of that same prohibition -- recording the Key
      Decision -- was never completed either. The phase goal ("a full 10,000-cell sweep completes
      in under 1000ms... measured wall clock from user action to final cell") is therefore neither
      demonstrated true on the declared baseline nor honestly false-and-recorded; it is left open.
    artifacts:
      - path: "bench/sweep.bench.test.ts"
        issue: "Sole PERF-03 recorder; every run (this verification included) reports verdict=withheld on this host, and its own contribution-schedule info line shows a 3.35x budget overrun with no accompanying Key Decision."
      - path: ".planning/PROJECT.md"
        issue: "Key Decisions table has no entry for the Phase 7 production-pool PERF-03 figure (4-core CI baseline still not run) and no entry for the contribution-schedule (solveIrr) sweep's ~3.35x overrun that 07-03-SUMMARY.md flags as needing one."
    missing:
      - "A GitHub Actions (D-17, 4-core) CI run of the retargeted bench/sweep.bench.test.ts, producing a real (non-withheld) PERF-03 verdict for the zero-contribution case."
      - "A PROJECT.md Key Decision entry resolving the contribution-schedule (solveIrr) sweep's measured ~3.35x budget overrun -- accept-with-headroom-plan, or a named architecture lever (pool tuning, coarser default grid, IRR-branch-specific optimization), decided deliberately per PERF-01a rather than left unrecorded."
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
**Verified:** 2026-08-23T03:30:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The 2D heatmap over entry date and leverage renders Phase 6's chosen treatment against real swept data, with fixed-leverage/fixed-entry-date slice charts and a sweep-mode toggle stating which mode produced it | VERIFIED | `src/app/components/ResultColumn/HeatmapPanel.tsx` mounted in `App.tsx` behind `resultMode()==='sweep'`, painting via `paintSweepField`/`paint-contour.ts` over a live `SweepGrid` from `src/sweep/sweep-pool.ts` (real `runBacktest` calls, no fixture/synthetic data in the production path — verified by grep for `fixture`/`synthetic`/`mock` in `HeatmapPanel.tsx`, `sweep-pool.ts`, `state.ts`: only shared wire-format constant imports from `data/sweep-fixture-format.ts`, no fixture *data*). `SliceChart.tsx`'s `HorizontalSliceChart`/`VerticalSliceChart` and `SweepModeToggle.tsx`/`SweepCaption.tsx` exist, are wired, and are exercised by `tests/app/slice-charts.browser.test.ts` and `tests/app/sweep-caption.browser.test.ts` (both pass) |
| 2 | Ruined cells read as categorically different from the continuous color scale, verified on a 1929-entry high-leverage sweep where ruin genuinely occurs; the hold-to-today short-horizon artifact is visually marked | VERIFIED | `tests/app/ruin-and-horizon.browser.test.ts` runs a named real sweep, asserts `ruinedCount` > 0 (line 347, "on a sweep where ruin genuinely occurs"), asserts a ruined pixel matches none of 33 evenly-spaced ramp samples on either ramp, and asserts internal texture variation (not a flat extreme). `src/heatmap/short-horizon.ts`'s `paintShortHorizonRule` (labelled vertical rule, cell colors left intact) is wired into `paint-contour.ts`'s annotation pass and covered by `tests/heatmap/short-horizon.test.ts` + the same browser test. All pass |
| 3 | A full 10,000-cell sweep completes in under 1000ms wall clock on a 4-core baseline (measured by the benchmark command), first partial results paint within 100ms with progressive fill | **FAILED** | PERF-04 (100ms first-partial-paint) passes cleanly: 22.48ms measured via `bench/sweep-progressive.bench.test.ts`. **PERF-03 (1000ms full-sweep) does not have a real passing verdict anywhere on record for this phase's production code.** See Gaps below |
| 4 | Changing the heatmap's displayed metric re-colors the cached grid in under 16ms and never triggers a re-sweep, because the sweep computes every display metric per cell in a single pass | VERIFIED | PERF-06 measured 0.01ms (`bench/sweep-progressive.bench.test.ts`, well under the 16ms budget). `tests/sweep/metrics-one-pass.test.ts` proves `computeChunkMetrics` writes multiple/drawdown/annualized/flag from one `runBacktest` call per cell, including an IRR-branch cross-check against `solveIrr(buildCashFlows(...))`. `tests/app/sweep-controls.browser.test.ts` asserts the grid generation is unchanged across a metric-toggle change |
| 5 | Changing a parameter mid-sweep cancels the in-flight sweep within one frame and discards superseded results; heatmap pan and zoom sustain 60fps at full cell count, both measured | VERIFIED | Cancellation: `tests/sweep/cancellation.test.ts` unit-tests `isStaleGeneration`/`mergeChunkResult` directly (stale chunk discarded on arrival, no pool teardown); PERF-06's 0.01ms bench figure covers the generation-bump cost. Pan/zoom: PERF-09 measured 1.65ms (worse-of-pan/zoom arms) at the full 10,000-cell grid via `bench/heatmap-panzoom.bench.test.ts`, `generationUnchanged=true` recorded in the same run, well under the 16ms (60fps) budget |

**Score:** 4/5 truths verified, 1 failed, 0 present-but-behavior-unverified

### Required Artifacts

All artifacts declared across the ten plans' `must_haves.artifacts` exist and are substantive (no stub bodies, no debt markers). Spot-checked line counts:

| Artifact | Status |
|----------|--------|
| `src/heatmap/{iso-lines,field-sampler,hatch-pattern,sweep-copy,paint-contour,polygon-fill,short-horizon,curve-label,crosshair,viewport}.ts` | VERIFIED — all exist, substantive (17–598 lines), imported and used by production components |
| `src/sweep/{sweep-grid,resolve-column-series,sweep.worker,sweep-pool}.ts` | VERIFIED — exist, substantive, wired into `src/app/state.ts` |
| `src/colorscale/value-to-color.ts` | VERIFIED — 513 lines, per-metric ramp/domain/band routing consumed by `field-sampler.ts` |
| `src/app/components/ResultColumn/{HeatmapPanel,SweepModeToggle,MetricToggle,SliceChart,SweepLegend,SweepCaption,HoverReadout}.tsx` | VERIFIED — exist, imported and mounted in `App.tsx` behind `resultMode()` |
| All ten plans' declared test files (`tests/sweep/*`, `tests/heatmap/*`, `tests/app/*.browser.test.ts`) | VERIFIED — exist, all pass (see Behavioral Spot-Checks) |
| `bench/sweep.bench.test.ts`, `bench/sweep-progressive.bench.test.ts`, `bench/heatmap-form-2.bench.test.ts`, `bench/heatmap-panzoom.bench.test.ts` | VERIFIED to exist and run; **PERF-03's headline figure inside `bench/sweep.bench.test.ts` never resolves to a non-withheld verdict** |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `App.tsx` | `HeatmapPanel.tsx` | `<Show when={resultMode()==='sweep'}><HeatmapPanel grid={sweepGrid()} /></Show>` | WIRED |
| `sweep.worker.ts` | `src/kernel/backtest.ts` (`runBacktest`) | `computeChunkMetrics` calls `runBacktest` per cell; no reimplemented recurrence found by grep | WIRED |
| `sweep-pool.ts` | `state.ts` | `mergeChunkResult`/generation-gated merge feeds `sweepGrid`/`coarseSweepGrid` signals `HeatmapPanel` reads | WIRED |
| `HeatmapPanel.tsx` | `SliceChart.tsx`, `SweepLegend.tsx`, `SweepCaption.tsx`, `HoverReadout.tsx` | direct imports, all mounted in the same panel, all read the same `SweepGrid`/`displayedMetric` signals | WIRED |
| `field-sampler.ts` | `value-to-color.ts` | metric/ramp routing (`scaleTypeForMetric`, `rampPositionForMetric`, `bandLevelsForMetric`) | WIRED |
| `permalink.ts` | `state.ts` | `mode`/`metric` keys added to `PERMALINK_KEYS`, decoded into `resultMode`/`displayedMetric` | WIRED |
| `bench/sweep.bench.test.ts` | `src/sweep/sweep-pool.ts` | retargeted in plan 07-03 off the Phase 1 spike pool onto the real production pool | WIRED, but its headline PERF-03 verdict is `withheld` on every host measured to date |

### Behavioral Spot-Checks / Test Execution

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| Unit suite (sweep/heatmap-relevant) | `vitest run --project unit tests/sweep/metrics-one-pass.test.ts tests/heatmap/short-horizon.test.ts tests/heatmap/crosshair.test.ts tests/heatmap/viewport.test.ts tests/sweep/cancellation.test.ts` | 5 files / 42 tests passed | PASS |
| Browser suite (sweep/heatmap-relevant) | `vitest run --project app tests/app/ruin-and-horizon.browser.test.ts tests/app/slice-charts.browser.test.ts tests/app/sweep-caption.browser.test.ts tests/app/sweep-controls.browser.test.ts tests/app/crosshair.browser.test.ts tests/app/sweep-progressive.browser.test.ts` | 6 files / 67 tests passed | PASS |
| Full unit + app suites (orchestrator pre-check, not re-run) | `npm test` / `npm run test:app` | 796/796, 170/170 | PASS (per pre-verified tree state) |
| `npm run typecheck` / `npm run build` | — | clean / succeeds | PASS (per pre-verified tree state) |

### Probe Execution (Benchmark Command)

Ran each of the four Phase 7 bench files individually (per orchestrator note: the full 11-file suite trips an unrelated, pre-existing `PERF-08`-coverage teardown invariant and a total-runtime cap when run together; judged per-file). Each file's own teardown also trips the same pre-existing, out-of-phase `PERF-08` invariant (documented in 07-10-SUMMARY.md as out of scope) — the per-bench measurement rows below are read from stdout before that unrelated teardown error, not from exit code.

| Bench | Command | Result | Status |
|-------|---------|--------|--------|
| PERF-03 (`bench/sweep.bench.test.ts`) | `vitest run --project bench bench/sweep.bench.test.ts` | `verdict=withheld` (host hardwareConcurrency=9 ≠ declared baseline 4); zero-contribution (CAGR) branch 471.80ms raw/779.83ms normalized (would clear 1000ms budget); **contribution-schedule (IRR/`solveIrr`) branch 2027.40ms raw/3351.07ms normalized — 3.35x over the 1000ms budget**, informational only, unresolved | **NO PASSING VERDICT ON RECORD** |
| PERF-04/PERF-06 (`bench/sweep-progressive.bench.test.ts`) | `vitest run --project bench bench/sweep-progressive.bench.test.ts` | PERF-04: 22.48ms normalized (budget 100ms) — PASS. PERF-06: 0.01ms normalized (budget 16ms) — PASS | PASS |
| PERF-05 (`bench/heatmap-form-2.bench.test.ts`) | `vitest run --project bench bench/heatmap-form-2.bench.test.ts` | 8.35ms normalized (budget 16ms) — PASS | PASS |
| PERF-09 (`bench/heatmap-panzoom.bench.test.ts`) | `vitest run --project bench bench/heatmap-panzoom.bench.test.ts` | 1.65ms normalized, worse-of-pan/zoom arms (budget 16ms), `generationUnchanged=true` | PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| VIZ-01 | 07-07 | Fixed-leverage, sweep-entry-date chart | SATISFIED | `HorizontalSliceChart` (uPlot), tested |
| VIZ-02 | 07-07 | Fixed-entry-date, sweep-leverage chart | SATISFIED | `VerticalSliceChart` (Canvas 2D), tested |
| VIZ-03 | 07-01, 07-02, 07-04, 07-08, 07-09 | 2D heatmap over entry date and leverage, colored by selected metric | SATISFIED | `HeatmapPanel.tsx`/`paint-contour.ts` over real `SweepGrid`, no fixture in production path |
| VIZ-04 | 07-06, 07-07 | Sweep-mode toggle (fixed period / hold-to-today), chart states mode | SATISFIED | `SweepModeToggle.tsx`, `SweepCaption.tsx` (mode statement), tested |
| VIZ-06 | 07-01, 07-09 | Ruined cells categorically distinct, never darkest-end-of-ramp | SATISFIED | Hatch pattern, tested with real ruin (`ruinedCount > 0`) |
| VIZ-09 | 07-09 | Hold-to-today short-horizon edge visually marked | SATISFIED | `short-horizon.ts`'s `paintShortHorizonRule`, tested |
| METR-06 | 07-03, 07-06 | Sweep computes all display metrics per cell in one pass | SATISFIED | `computeChunkMetrics`, `tests/sweep/metrics-one-pass.test.ts`, PERF-06 0.01ms |
| PERF-03 | 07-03 | Full 10,000-cell sweep < 1000ms on 4-core baseline | **BLOCKED** | Verdict withheld on every host tested; real-code contribution-schedule figure 3.35x over budget, unresolved, no Key Decision recorded |
| PERF-04 | 07-05 | First partial results paint within 100ms | SATISFIED | 22.48ms measured |
| PERF-05 | 07-04 | Metric re-color under 16ms | SATISFIED | 8.35ms measured |
| PERF-06 | 07-05 | In-flight sweep cancelled within one frame | SATISFIED | 0.01ms measured, cancellation unit-tested |
| PERF-09 | 07-10 | Pan/zoom sustain 60fps at full cell count | SATISFIED | 1.65ms measured |

No orphaned requirements: the twelve IDs declared across the ten plans exactly match REQUIREMENTS.md's Phase 7 mapping (VIZ-01/02/03/04/06/09, METR-06, PERF-03/04/05/06/09).

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers, and no stub return patterns (`return null`/`{}`/`[]` unexplained, empty handlers, hardcoded-empty props flowing to render) found across the 57 files this phase's ten SUMMARY.md files list as created/modified. The two `"not available"` string matches are legitimate assertions inside `tests/app/narrow-viewport.browser.test.ts`, not stub markers.

`07-REVIEW.md` (code review, run separately, 51 files, standard depth) found 4 real defects, all WARNING tier, 0 blockers:
- **WR-01**: `sweepFailedCellCount()` can go stale relative to the visibly-painted grid under a specific rapid-superseded-generation race (caption count mismatch, not a data-correctness bug). Advisory — listed as a human-verification item above, does not fail a phase must-have.
- **WR-02**: A permanently-failed Worker (runtime error) degrades ~1/workerCount of all future sweeps with no self-healing. Advisory, not exercised by any phase must-have.
- **WR-03**: `SweepPool.dispose()` has no production call site (documented-but-unreachable). Advisory, cosmetic/dead-code concern.
- **WR-04**: Permalink `leverage`/money fields lack the upper bound the UI control enforces. Advisory, not a Phase 7 requirement (permalink bounds are outside VIZ/METR/PERF-03..09 scope); flagged here for visibility only.

None of the four warnings block any of the five roadmap truths or twelve requirement IDs verified above.

### Human Verification Required

See the `human_verification` list in the frontmatter — two items, both advisory-tier (visual-legibility confirmation of the pixel-proven ruin/short-horizon distinctness, and an eyes-on check of WR-01's caption-staleness race). Neither blocks phase completion on its own; they are recorded for completeness alongside the PERF-03 gap.

### Gaps Summary

Four of five roadmap success criteria are demonstrably true in the codebase, each backed by a passing behavioral test or a passing benchmark measurement (not merely file presence). The fifth — the 1000ms full-sweep budget on a 4-core baseline — is not demonstrated. The benchmark command that is supposed to report it (`bench/sweep.bench.test.ts`, retargeted onto the real production pool in plan 07-03) has never produced a non-withheld verdict against the declared 4-core baseline for this phase's actual code; the only 4-core-baseline PERF-03 figure on record in PROJECT.md predates this phase and measured the Phase 1 spike's synthetic-series pool, not the real kernel-backed sweep. More concretely: the one informational measurement that does exist for a real, product-supported configuration (a non-zero contribution schedule, which the sweep is required to route through `solveIrr` exactly as METR-01 does) is 3.35x over the 1000ms budget, using the same baseline-pinned worker count the withheld-verdict machinery relies on, on a stronger-than-baseline host. 07-03-SUMMARY.md itself flags this as needing a human-recorded PROJECT.md Key Decision, and that entry does not exist. This is a real, provable gap against the phase's own third success criterion, not a CI-environment technicality alone — it needs either a genuine 4-core CI measurement plus a Key Decision resolving the contribution-schedule overrun, or a deliberate, recorded architectural response (per PERF-01a) before this phase can be called complete against its own roadmap contract.

---

_Verified: 2026-08-23T03:30:00Z_
_Verifier: Claude (gsd-verifier)_
