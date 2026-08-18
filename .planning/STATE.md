---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 03
current_phase_name: simulation-kernel-and-the-upro-tqqq-gate
status: executing
stopped_at: Phase 3 context gathered
last_updated: "2026-08-18T03:37:40.513Z"
last_activity: 2026-08-18
last_activity_desc: Phase 03 execution started
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 20
  completed_plans: 15
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-16)

**Core value:** Given a symbol, a leverage level, an entry point, and a contribution schedule, produce a defensible outcome and show which mechanism consumed the money, in a form that can be pasted into an argument.
**Current focus:** Phase 03 — simulation-kernel-and-the-upro-tqqq-gate

## Current Position

Phase: 03 (simulation-kernel-and-the-upro-tqqq-gate) — EXECUTING
Plan: 1 of 6
Status: Executing Phase 03
Last activity: 2026-08-18 — Phase 03 execution resumed (wave continue)

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 14
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 6 | - | - |
| 02 | 8 | - | - |

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

### Pending Todos

None yet.

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

- [Phase 3]: Cost parameters must be sourced and documented before validation is first run.
  Adjusting them afterward to tighten the fit invalidates the gate

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260816-p8z | Make the bench calibration score canonical per run | 2026-08-16 | e345a88 | [260816-p8z-make-the-bench-calibration-score-canonic](./quick/260816-p8z-make-the-bench-calibration-score-canonic/) |
| 260816-qae | Record the D-20 escalation for PERF-03 against the real CI baseline and correct docs citing sandbox figures | 2026-08-16 | 8c5a250 | [260816-qae-record-the-d-20-escalation-for-perf-03-a](./quick/260816-qae-record-the-d-20-escalation-for-perf-03-a/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-08-18T02:06:27.735Z
Stopped at: Phase 3 context gathered
Resume file: .planning/phases/03-simulation-kernel-and-the-upro-tqqq-gate/03-CONTEXT.md
