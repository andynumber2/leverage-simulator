---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 08
current_phase_name: export-and-the-canonical-arguments
status: executing
stopped_at: Phase 8 wave 2 complete, paused before wave 3
last_updated: "2026-08-26T04:57:14.223Z"
last_activity: 2026-08-26
last_activity_desc: Phase 08 waves 1 and 2 complete (08-01, 08-02, 08-03 merged)
progress:
  total_phases: 9
  completed_phases: 8
  total_plans: 66
  completed_plans: 64
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-16)

**Core value:** Given a symbol, a leverage level, an entry point, and a contribution schedule, produce a defensible outcome and show which mechanism consumed the money, in a form that can be pasted into an argument.
**Current focus:** Phase 08 — export-and-the-canonical-arguments

## Current Position

Phase: 08 (export-and-the-canonical-arguments) — EXECUTING
Status: Executing Phase 08
  The 1000ms PERF-03 budget is measured unreachable on the D-17 4-core host. Five levers
  measured and refuted: WASM (1.20x slower, 01-04), worker width 4 (zero, 07.1-06), per-bar
  output arrays (1-2%, quick-260824-46s), pool and dispatch overhead (0.14ms across the whole
  grid, quick-260824-52h), and per-cell kernel compute itself (combined ratio median 1.0036,
  six of eight arms slower than shipped, quick-260824-r5d).
  Nothing was relaxed to get here. PERF-03.thresholdMs stays 1000, NOMINAL_REFERENCE_MS stays
  40, BENCH_TOTAL_RUNTIME_CAP_MS stays 30000, the grid stays 200x50, and
  src/kernel/backtest.ts is byte-identical across all three measurement tasks. PERF-03 remains
  FAILED and is not claimed met. Only the two-consecutive-pass MERGE BAR was released, so the
  milestone stops blocking behind a budget no available lever can reach.
Next: Phase 8 (export and the canonical arguments). Run /gsd-discuss-phase 8 to begin.
  Requirements reconciled 2026-08-25: the eleven Phase 7 requirements that had read Pending only
  because PERF-03 held the phase open (PERF-04/05/06/09, METR-06, VIZ-01/02/03/04/06/09) are now
  marked complete against real evidence. PERF-04, 05, 06 and 09 measured verdict=pass,
  source=production, hardwareConcurrency=4 on CI run 32686531154 against the merged code; the
  rest rest on named test files, all present, with 819/819 unit and 170/170 app green.
  v1.0 now owes exactly four requirements: SHARE-04, SHARE-05, SHARE-06 (all Phase 8), and
  PERF-03, which stays unmet by decision.
Last activity: 2026-08-26 — Phase 08 execution resumed (wave continue)

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
| Phase quick-260824-46s P01 | 3min | 3 tasks | 3 files |

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
- [quick-260824-46s]: PERF-03 lever 1 (kernel write-only per-bar output arrays) measured, not spent: bit-identical equivalence proof plus five-sample A/B ratio (min=0.9810 median=0.9841 max=0.9904) refutes 07.1-PERF-03-BASELINE.md section 9's reasoning -- the arrays cost roughly 1-2% of kernel compute time, too small to close 1120.86-1411.05ms normalized to under the 1000ms budget alone. src/kernel/backtest.ts stays byte-identical; the variant lives only in bench/.
- [quick-260824-52h]: The 273.98ms PERF-03 residual is not a separate poolable overhead. Instrumenting one real 10,000-cell sweep at the production pool boundary measured buffer allocation at 0.03ms, mergeChunkResult at 0.01ms and wire-write at 0.10ms across the WHOLE grid, worker-drain imbalance at 7.50ms (1.6%), and concurrencyFactor at 1.05. Real per-chunk computeMs summed and divided by workerCount explains 98.3% of wall clock with no extrapolation. spanRatio=0.51 confirms 07.1-PERF-03-PROFILE.md's own unverified candidate (b): its perCellKernelUs=255.42 was measured at a 2-column chunk span while the grid actually runs 17-column chunks, so idealParallelFullGridMs=851.39 is roughly double the real cost. Correcting it GROWS the residual to a projected 691.16ms (58.6%), it does not shrink it. src/sweep/sweep-pool.ts needed no edit: SweepPoolOptions.workerFactory is an existing production seam. Only src/sweep/sweep.worker.ts gained an inert profiling flag, proven inert at runtime (zero profile messages on a full sweep with it off).
- [quick-260824-r5d]: Per-cell kernel compute is NOT reducible enough to close PERF-03. Nine ablation arms measured at the real 17-column chunk span (not a narrow span, per 52h's spanRatio lesson), each proven bit-identical on all eight KernelResult fields across four canonical cases before any clock started (28 proven cases, runtime-gated). Combined bit-preserving arm: min=0.9740 median=1.0036 max=1.1012, missing both the 0.7833 and 0.8907 decision thresholds at every point. Six of eight arms measured SLOWER than the shipped kernel at the median (dedupDrawdown worst at 1.1605), so the hand micro-optimizations regress what V8 already does well. The non-bit-preserving reciprocal-multiply arm measured EXACTLY zero deviation on the real series across all four cases despite being provably non-bit-identical for isolated day-count values (the perturbation sits orders of magnitude below the rounding granularity of the `value -=` subtraction it feeds), and it was also slower (median 1.1040), so there is no case for it on either correctness or speed. src/kernel/backtest.ts stays byte-identical; all variants live in bench/.

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
| 260824-46s | Measure PERF-03 lever 1 (kernel write-only per-bar output arrays); refuted | 2026-08-24 | a9c1feb | Verified | [260824-46s-measure-lever-1-for-perf-03-what-the-ker](./quick/260824-46s-measure-lever-1-for-perf-03-what-the-ker/) |
| 260824-52h | Isolate the 273.98ms PERF-03 residual; found it substantially an extrapolation artifact, no pool lever left | 2026-08-24 | 718d7e0 | Verified | [260824-52h-isolate-the-273-98ms-unexplained-residua](./quick/260824-52h-isolate-the-273-98ms-unexplained-residua/) |
| 260824-r5d | Measure whether per-cell kernel compute is reducible at the 17-column chunk shape; refuted, lever list exhausted | 2026-08-24 | de11744 | Verified | [260824-r5d-measure-whether-per-cell-kernel-compute-](./quick/260824-r5d-measure-whether-per-cell-kernel-compute-/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-08-26T04:57:14.223Z
Stopped at: Session resumed 2026-08-26, proceeding to Phase 08 wave 3 (08-04)
Resume file: .planning/phases/08-export-and-the-canonical-arguments/.continue-here.md

### Phase 8, waves 1 and 2, 2026-08-26

Three of five plans are done and merged on `gsd/phase-08-export-and-the-canonical-arguments`:

- 08-01 (wave 1, merged `8172379`): PNG export path and the shared export row. Resumed in place
  from the rescue commit `d48b4f7` below rather than reverting it. The E1 violation that commit
  recorded is FIXED: `<ExportRow />` is now an unconditional sibling of the result-mode `Show`.
  Copy link relocated out of ParameterColumn (D-22), hover readout excluded from capture (F-02),
  D-02 theme parity and D-03 viewport independence closed empirically.
- 08-03 (wave 2, merged `050dddd`): preset library plus `scripts/compute-presets.ts`, which runs
  the real kernel at build time and emits `presets.generated.ts` byte-identically across runs, so
  the headline figures are derived rather than hand-entered. No deviations.
- 08-02 (wave 2, merged `b266ee1`): CSV export path with a dedicated `csv.worker.ts`,
  provenance preamble, and the recompute-to-finalValue proof.

Post-merge gate on the merged tree, all green: typecheck clean, build clean, 844/844 unit,
180/180 app across all 27 browser files in one continuous run.

Remaining: 08-04 (wave 3) then 08-05 (wave 4, `autonomous: false`, carries a human checkpoint).
None of the phase tail gates have run. SHARE-04 and SHARE-05 stay Pending because 08-05 claims
all three SHARE requirements and is the closure plan; 08-03 marked SHARE-06 Complete.

Two process notes worth carrying. First, 08-02's executor self-reported its own HEAD as the
worktree `expected_base` instead of its fork point; recording that verbatim would have tripped
`cleanup-wave`'s fail-closed base check, so verify with `git merge-base` before recording.
Second, `npm run test` is the `unit` project and excludes browser tests, so a unit-only run
proves nothing about the export paths.

### Recovery, 2026-08-26 (RESOLVED by 08-01 above)

The container died mid-execution of plan 08-01. Executor worktree
`worktree-agent-a5dcf64d606fd1af7` held Task 1 uncommitted; it was rescued onto this branch at
`d48b4f7` (typecheck clean, 4 of 5 browser tests green). The one failing test is a real
contract violation, deliberately committed unfixed so the rescue is a faithful record:
`src/app/App.tsx` renders `<ExportRow />` inside the
`loadStatus() === 'ready' && resultMode() === 'single'` guard, so the row disappears during load
and again in sweep mode, and 08-UI-SPEC.md E1 forbids both (empty: the row is never hidden or
collapsed; zero-one-many: CSV is disabled-in-place in sweep mode, never removed from the DOM).
Hoist `ExportRow` to a sibling of that `Show`, unconditional, the way `SweepModeToggle` already
is under D-18.

Not started: 08-01 Task 2 (move Copy link into the export row) and Task 3 (D-02 theme parity,
D-03 viewport independence). Plans 08-02 through 08-05 untouched.

Note for whoever runs the browser suite: `npm run test` is the `unit` project and EXCLUDES
`tests/app/**/*.browser.test.ts`. Browser tests run under `npm run test:app`.

### Where things stand

Both PRs are resolved as of 2026-08-25. PR #8 merged to `main` at `e23d5d0`
(merge commit, matching the repo's existing merge style). PR #7 was NOT closed manually: GitHub
marked it MERGED automatically, because its branch was fully contained in #8's (zero commits in
#7 that #8 lacked, 76 versus 132 against main), so merging #8 put every one of its commits on
`main`.

`main` now carries Phases 1 through 7.1 and the three PERF-03 measurement tasks. CI runs on
`pull_request` only, so `main` itself does not run the bench suite; the PERF-03 assertion is
still red on any PR that runs it, and that is the accurate state, not a regression to chase.

### The state of the number

PERF-03 across five D-17 runs, all `verdict=fail`: 1120.86, 1208.38, 1115.92, 1191.34 (width 4),
1411.05ms normalized against a 1000ms budget. Phase 7.1 closed with roadmap criteria 1, 3 and 6
met and criteria 2, 4 and 5 escalated with named levers. All four escalations are in PROJECT.md's
Key Decisions table.

### What is spent and what is left

Spent and measured worthless on the headline: worker width 4 (1191.34ms, inside the width-3
spread, reverted; PERF-07b also crossed D-20's 70% trigger on that run). Spent earlier and
counterproductive: WASM (roughly 1.20x slower, 01-04).

Spent and genuinely useful, but not on the headline: the `solveIrr` convergence fix. It tested
`|npv|` in dollars against `1e-9`, unreachable on thousand-dollar cash flows, so the loop burned
105 iterations for a 36-iteration answer. That branch went 8961.84 to roughly 3900ms with every
displayed figure provably unchanged to 3.20e-10. It remains roughly 3.9x over budget.

Unspent levers for PERF-03, after two measurement tasks on 2026-08-24:

1. The kernel's write-only per-bar output arrays. MEASURED and REFUTED (quick-260824-46s):
   five-sample A/B ratio min=0.9810 median=0.9841 max=0.9904, roughly 1-2% of kernel compute.
   Not spent; `backtest.ts` stays byte-identical.

2. Pool and dispatch overhead. MEASURED and EXHAUSTED (quick-260824-52h): allocation, merge and
   wire total 0.14ms across the whole 10,000-cell grid, drain imbalance 7.50ms,
   concurrencyFactor 1.05. There is no meaningful pool-overhead lever left to spend.

3. D-03's coarser default grid. Still unspent and still held in reserve. It does not close the
   number, it redefines what the number measures, and `.claude/CLAUDE.md` states the sweep as
   "~10,000 backtests" in the project's own constraints.

4. Newton-with-bisection-fallback for `solveIrr`, scoped to the sweep call site. Reopens D-08,
   so it needs its own Key Decision. Cannot affect the gated headline: the zero-contribution
   branch has no cash flows and never calls `solveIrr`. Worth doing on its own merits, since
   `npvEvaluationsPerSolve` measured 105.01 against a Newton expectation near 10, and that
   branch makes contribution-schedule users wait roughly 4 seconds.

5. Real per-cell kernel compute at the 17-column chunk shape. MEASURED and REFUTED
   (quick-260824-r5d): nine arms, combined bit-preserving ratio min=0.9740 median=1.0036
   max=1.1012, clearing neither the 21.3% nor the 10.8% threshold at any measured point. Six of
   eight arms measured slower than the shipped kernel. This was the last unmeasured lever.

**The lever list is exhausted.** Levers 1, 2 and 5 are measured and refuted. Lever 3 redefines
the measurement rather than closing it. Lever 4 cannot reach the gated branch. Nothing untested
remains that could plausibly close a 10.8% to 21.3% gap.

### The calibration-score variance finding, 2026-08-24

CI run 32686531154 (`hardwareConcurrency=4`, `source=production`, `verdict=fail`) recorded
`measuredMs=1156.60`, `normalizedMs=1270.99`, `calibrationScore=0.9100`. Against run
32669644628 (`measuredMs=1179.70`, `normalizedMs=1120.86`, `calibrationScore=1.0525`), the RAW
figure FELL 23.10ms while the NORMALIZED figure ROSE 150.13ms. The entire move came from the
normalizer, on a run whose measured work was slightly faster. Raw figures across these two runs
span 1156.60 to 1179.70; normalized figures across all six span 1115.92 to 1411.05. Most of the
visible instability in the gated metric is in the calibration score, not in the sweep.

This is recorded, NOT acted on. Retuning or reweighting the calibration anchor in response to a
measurement is exactly what PERF-01a prohibits and what the 01-04 escalation already litigated
once; the only effect would be to un-trip a gate rather than make anything faster. It does mean
the two-consecutive-pass merge bar is being asked to clear a normalizer with a 13.5% swing.

### The warning worth carrying forward

Three projections in Phase 7.1 were tested against measurement and all three were wrong:
`solveIrr` 3.14x became 1.83x, worker width 4's 25% became zero, and a four-run "roughly 4%
spread" on the gated metric became 26% on the fifth sample. Every derived-not-measured number
that got tested failed; every directly measured number held. Lever 1 above is reasoned, not
measured. **Measure before planning against it.** The corrected variance finding is written up
in `07.1-PERF-03-BASELINE.md` section 2 under an explicit CORRECTION block.
