---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 06
current_phase_name: heatmap-design-pass
status: completed
stopped_at: Phase 07 UI-SPEC approved
last_updated: "2026-08-22T21:31:10.252Z"
last_activity: 2026-08-21
last_activity_desc: Phase 06 execution complete, form-2-filled-contour chosen
progress:
  total_phases: 7
  completed_phases: 6
  total_plans: 43
  completed_plans: 43
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-16)

**Core value:** Given a symbol, a leverage level, an entry point, and a contribution schedule, produce a defensible outcome and show which mechanism consumed the money, in a form that can be pasted into an argument.
**Current focus:** Phase 07 - sweep-engine-and-the-heatmap (not started)

## Current Position

Phase: 06 (heatmap-design-pass) - COMPLETE
Plan: 6 of 6
Status: Phase 6 complete
  Verification passed 4/4 roadmap success criteria. 697/697 unit tests pass.
  Decision: form-2-filled-contour wins. Spec written to 06-HEATMAP-SPEC.md.
  Carry-forwards: form 2 costs O(display area) and needs an offscreen cache in Phase 7;
  contour levels not yet labelled; ruin hatch never visually exercised (fixture ruinedCount=0).
Next: Phase 07 (sweep-engine-and-the-heatmap). Run /gsd-discuss-phase 07 to begin.
Last activity: 2026-08-21 - Phase 06 execution complete

Progress: [████████░░] 75%  (6 of 8 roadmap phases complete)

> `total_phases` read 4 here until 2026-08-20 and the bar read 75%. The field had been
> overwritten with the current phase number on every phase transition since `c5eefa2`
> (`docs(01): create phase plan`, 2026-08-16), which set it to 1 the commit after the roadmap
> correctly wrote 8. It tracked phases-started, not phases-in-milestone, so the bar overstated
> completion for the whole project. ROADMAP.md has listed 8 phases throughout and nothing else
> consumed the field, so the damage was confined to this percentage. Expect the next phase
> transition to overwrite it again unless the GSD STATE writer is fixed to read the count from
> ROADMAP.md.

## Performance Metrics

**Velocity:**

- Total plans completed: 23
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 6 | - | - |
| 02 | 8 | - | - |
| 05 | 9 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 19min | 2 tasks | 16 files |
| Phase 01 P02 | 12min | 2 tasks | 11 files |
| Phase 01 P03 | 7min | 2 tasks | 4 files |
| Phase 01 P04 | 35min | 3 tasks | 3 files |
| Phase 01 P05 | 15min | 2 tasks | 10 files |
| Phase 01 P06 | 16min | 3 tasks | 23 files |
| Phase 04 P01 | ~5h (paused for container restart) | 3 tasks | 27 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Performance spike placed first, before architecture commitment — research left sweep timing and Canvas-at-10k-cells as unbenchmarked estimates, and both decide the architecture
- [Roadmap]: Kernel validation against real UPRO/TQQQ folded into the kernel phase as its definition of done, not a separate downstream gate, so the no-tuning constraint lives in the same spec as the code that would be tuned
- [Roadmap]: Heatmap design pass is its own phase — the entry-date x leverage pairing has no precedent in any surveyed tool
- [Roadmap]: No optimization phase. Every compute- or render-touching phase carries a measured performance number in its success criteria
- [Phase ?]: 01-01: Browser-to-Node bridge for the bench harness persists to .bench/.raw/ on disk (not an in-memory module accumulator) — the browser.commands implementation and global-setup teardown run as separate vite-node module instances
- [Phase ?]: 01-01: NOMINAL_REFERENCE_MS calibration anchor set to 40ms, tuned empirically in this sandbox; must be re-verified (not silently retuned) once measured on the D-17 ubuntu-latest CI baseline
- [Phase ?]: 01-02: Sweep cell mapping keeps every cell's backtest at 99.2%+ of the full 25,000-bar series (leverage swept 1-20 across rows, entry index swept only across the first 200 of 25,000 bars across columns) so PERF-03 is not flattered by short cells
- [Phase ?]: 01-02: Serial reference for the pool-vs-serial equality check is a 50-cell deterministic stride sample, not the full 10,000-cell grid, to avoid pushing bench runtime toward BENCH_TOTAL_RUNTIME_CAP_MS
- [Phase ?]: 01-02: Workers are not reused across measureMinOfN's 5 repeats — worker construction cost is included in every repeat of the measured PERF-03 figure
- [Phase ?]: 01-03: makeGridValues spreads values log-uniformly across ~6 orders of magnitude (1e-3 to 1e3), not a uniform [0,1) band, matching the real heatmap outcome metric range
- [Phase ?]: 01-03: putImageData measured decisively faster than fillRect-per-cell (near 0.00ms vs 4-7ms normalized) on the identical 10,000-cell grid, both proven to paint the same picture before trusting either figure — settles D-15's implementation fork for Phase 6/7
- [Phase ?]: 01-03: bench/global-setup.ts's JSON artifact now persists recordInfoLine payloads (infoLines field), so a free-text reproducibility figure survives in .bench/bench-results.json, not only stdout
- [PROJECT.md Key Decisions]: 01-04: Plain JS with a Worker pool settles the sweep/kernel compute architecture over WASM — measured PERF-03 at 32.7% of budget, and a throwaway Rust microbenchmark of the identical recurrence measured ~1.20x SLOWER than JS (not near parity as CONTEXT.md's rationale predicted), so WASM is dropped as a default rather than adopted
- [PROJECT.md Key Decisions]: 01-04: Hand-rolled Canvas 2D (putImageData) settles the heatmap renderer over any charting library — measured PERF-05 at 0% of budget; no charting library was separately benchmarked per D-14, citing .claude/CLAUDE.md's Q2 findings
- [Phase ?]: 01-04 corrected (quick-260816-qae): the D-20 70% escalation trigger IS crossed by PERF-03 on the D-17 baseline (807.92ms normalized, 80.8% of the 1000ms budget, run 31965951474); the escalation is recorded deliberately as a third Key Decision row in PROJECT.md, with no budget relaxed. PERF-02 (0.21ms of the 16ms budget) and PERF-05 (0.37ms of the 16ms budget) stay well clear of the trigger on the same baseline
- [Phase ?]: quick-260816-qae: NOMINAL_REFERENCE_MS stays at 40, closing the 01-01 re-verify open item recorded above. The load-bearing reason is 01-01-PLAN.md's PERF-01a prohibition (line 71): it forbids altering the calibration reference loop or its scaling in response to a measurement, and the only measurement motivating a change here would have the sole effect of un-tripping an escalation. The supporting noise argument is weaker than first recorded and is stated here at its true strength: across three D-17 baseline runs the reference loop measured 37.30ms, 42.40ms, and 37.30ms, so 37.30ms is the modal value and 42.40ms the outlier, rather than a spread with 40 near its center. Retuning to 37.30ms would drop PERF-03 from 70.3% to 65.3% and un-trip the D-20 trigger, which is precisely what the prohibition exists to prevent
- [Phase ?]: 01-05: assertRunInvariants's verdict check promoted to the authoritative budget gate; per-file expect() demoted to a diagnostic delegate over assertWithinBudget
- [Phase ?]: 01-06: measureBatchedMinOfN added alongside measureMinOfN (not promoted) so the floor is enforced against the batch total exactly once; PERF-03's sweep keeps calling measureMinOfN directly since its raw cost already clears the floor
- [Phase ?]: 01-06: batch sizes (PERF_02=500, putImageData=500, fillRect=8) all cleared the 10ms floor on the first empirical run; DEFAULT_CHUNK_TIMEOUT_MS set to 10s for sweep-pool worker failure detection
- [Phase ?]: 01-06: closed both 01-VERIFICATION.md Gap 2 items (unenforced floor, unbounded worker hang) in one phase-closing plan; removed all em dash occurrences from tracked *.ts/*.yml/*.json source
- [Phase 3]: 03-01: LONG_GAP_FLAG_MIN_DAYS set to 6 inclusive under D-04, so only the 1933 bank holiday (12 days) and the 2001 closure (7 days) trip the outsized-closure flag while ordinary 3- and 4-day holiday weekends do not
- [Phase 3]: 03-03: SEC EDGAR was reachable this run, contradicting 03-RESEARCH.md's record of blanket HTTP 403s, so UPRO's and TQQQ's inception-era expense ratios were upgraded ASSUMED to CITED against real 485BPOS filings rather than committed as estimates. The financing-spread range stayed ASSUMED after five genuine attempts including two full N-CSR reads, which is itself primary-source corroboration of PITFALLS A9 that no fund itemizes swap financing spread
- [Phase 3]: 03-06 halted rather than force the red gate into one of D-20's five signature rows. That was correct: the residual was two residuals. Recording the halt as a legitimate outcome, not a failure, is what made the correct diagnosis reachable
- [PROJECT.md Key Decisions]: 03-06: D-10 AMENDED. The gate's synthetic is built from the TOTAL-return index, not the price-return index. Pairing a financing charge with a dividend-stripped return leg charged for exposure the model never credited, and that asymmetry was the entire Gate 2 residual (UPRO -6.968% to +0.254%, TQQQ -3.860% to +0.399%). A leveraged ETF's swap counterparty delivers the index total return against financing, so the total-return leg is what the financing term already prices. Phase 5's VALID-04 in-app view must render this same amended pairing or it will show users a ~7%/yr phantom gap as if it were real cost
- [PROJECT.md Key Decisions]: 03-06: TOLERANCE_SAFETY_FACTOR now applies to reasoned mechanism rows only; rows flagged measured:true are added at face value. The factor exists to cover a reasoned estimate being off by half, so scaling a measurement by 1.5x would have set the tolerance at 5.715% instead of 3.955% and let a real regression hide inside the margin
- [quick-260818-v2d]: WINDOWS.md entry #2 named one problem and there were two. The anchor cannot see parallel width, which is latent and worth up to 6.1x, and was dormant in all 13 recorded CI runs because every one of them drew a 4-core runner. Separately, each workload has its own elasticity to host interference, which is chronic and worth 6.36% residual CV. The first is fixed by measuring PERF-03 at the declared 4-core baseline width on every host and withholding its verdict when the recorded `hardwareConcurrency` differs, provably a no-op on the D-17 baseline, where every recorded run already resolved workerCount 3. The second is documented as a measured band rather than fixed, because more runs is its only remedy: a single run supports a headroom claim only to roughly +/-13%. The ledger's own numeric claim did not survive the larger sample: the three runs it cited included the single most anomalous run of the 13, and that run inflated the single-threaded PERF-02 by the same amount it inflated PERF-03, which a pool-specific mechanism cannot explain. `NOMINAL_REFERENCE_MS` stayed 40 and no budget value moved
- [Phase ?]: 04-01: Y-axis gutter is measured from the labels uPlot is about to draw (axis.size hook), not left at uPlot's fixed 50px default, and measured on a private CSS-sized canvas context with no devicePixelRatio arithmetic -- closes the plan's backstop must_have with regressions
- [Phase ?]: 04-01: Package legitimacy gate approved solid-js, vite-plugin-solid, vite despite SUS 'too-new' verdicts (publish-date heuristic); all three resolved to canonical github.com/solidjs and github.com/vitejs repos at millions of weekly downloads
- [quick-260820-4qx]: uPlot's built-in `logAxisSplits` cannot advance below a roughly 1e-22 log y-scale minimum (the NDX/leverage-10/entry-1999-03-04 permalink hit this and killed the renderer), so the log y axis now supplies its own decade splits (`log-axis-splits.ts`) plus an identity `filter`, chosen over clamping the scale range or truncating the series so the full curve stays visible

### Pending Todos

- None

### Blockers/Concerns

- [Phase 1]: All eight PERF-02 through PERF-09 budgets are now **locked** at their perception
  anchors (D-19): every threshold equals its anchor, so no `relaxationReason` is owed on any
  entry in `perf-budgets.ts`. On the D-17 baseline (GitHub Actions `ubuntu-latest`, run
  31965951474), PERF-02 (0.21ms of the 16ms budget) and PERF-05 (0.37ms of the 16ms budget) stay
  well clear of the D-20 70% escalation trigger. PERF-03 crosses it (807.92ms normalized, 80.8%
  of the 1000ms budget) and has been escalated deliberately under D-20, recorded as a third Key
  Decision row in PROJECT.md, not relaxed. PERF-04, 06, 07a/b, 08a/b/c, and 09 remain unmeasured
  (implemented in Phase 4 or 7) but are already gated from their first commit. Any future
  relaxation of any of these eight requires a Key Decision under PERF-01a, never a silent edit

- [Phase 2]: Exact FRED series start dates (DFF, DTB3, TB3MS) and Yahoo ^GSPC/^SP500TR
  first-available rows were verified via web search, not a direct API pull. Re-confirm against
  live sources at implementation time

- [Phase 3]: RESOLVED. Cost parameters were sourced and committed before any validation code
  existed (D-19 ordering verified from git history), and no cost parameter was adjusted at any
  point, including when the gate first ran RED. UPRO and TQQQ inception-era expense ratios are
  CITED to SEC 485BPOS accessions 0001193125-09-135520 and 0001193125-10-023274, both confirmed
  against EDGAR. The financing-spread range stays ASSUMED after five retrieval attempts including
  two full N-CSR reads, which corroborates PITFALLS A9

- [Phase 3]: CARRIED FORWARD. The tracking-error gate is a weaker instrument than its original
  0.66% tolerance implied. 89% of the widened 3.955% tolerance comes from one measured mechanism
  row, and TQQQ's margin against it is a thin ~11%. The cause is the reference data, not the
  model: UPRO/TQQQ are Yahoo market closes, so premium/discount noise puts a ~3.2-3.5% floor under
  Gate 1 before any model is applied. Sourcing true daily NAV history for both funds would remove
  that component and let the tolerance come back down. Gate 2 (return drift) is unaffected and
  tight at +0.25%/+0.40% against 0.525%

- [Phase 3]: OBSERVATION, deliberately not acted on. The high-rate sub-window return drift is
  +0.94% (UPRO) and +1.12% (TQQQ), larger and more positive than the full-window figure, hinting
  the financing spread may be slightly under-priced from 2022 on. D-13 says sub-windows do not
  gate and VALID-03 prohibits adjusting the spread to close a measured gap, so this is recorded
  for Phase 5 rather than fixed

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 260816-p8z | Make the bench calibration score canonical per run | 2026-08-16 | e345a88 |  | [260816-p8z-make-the-bench-calibration-score-canonic](./quick/260816-p8z-make-the-bench-calibration-score-canonic/) |
| 260816-qae | Record the D-20 escalation for PERF-03 against the real CI baseline and correct docs citing sandbox figures | 2026-08-16 | 8c5a250 |  | [260816-qae-record-the-d-20-escalation-for-perf-03-a](./quick/260816-qae-record-the-d-20-escalation-for-perf-03-a/) |
| 260818-v2d | resolve WINDOWS #2 calibration runner-variance in bench/calibration.ts | 2026-08-18 | cc3d715 | Verified | [260818-v2d-resolve-windows-2-calibration-runner-var](./quick/260818-v2d-resolve-windows-2-calibration-runner-var/) |
| 260820-4qx | Fix uPlot log-scale renderer hang in the equity curve chart; close phase 04's narrow-viewport UAT | 2026-08-20 | a55b611 |  | [260820-4qx-fix-uplot-log-scale-renderer-hang-in-equ](./quick/260820-4qx-fix-uplot-log-scale-renderer-hang-in-equ/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-08-22T21:31:10.226Z
Stopped at: Phase 07 UI-SPEC approved
Resume file: .planning/phases/07-sweep-engine-and-the-heatmap/07-UI-SPEC.md
