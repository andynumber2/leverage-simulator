---
phase: quick-260824-r5d
plan: 01
subsystem: performance
tags: [bench, vitest, kernel, perf-03, ablation]

requires:
  - phase: quick-260824-52h
    provides: >
      spanRatio=0.51 (per-cell kernel cost at the real 17-column chunk span is roughly half the
      cost at the narrower 2-column span the original perCellKernelUs figure was measured at),
      and the finding that pool/dispatch overhead has no remaining headroom, naming per-cell
      kernel compute at the real chunk shape as the only untested PERF-03 lever
provides:
  - Nine measured ablation candidates (one baseline denominator, six bit-preserving optimizations,
    one non-bit-preserving reciprocal variant, one combined arm) at the real 17-column chunk span
  - A harness (computeChunkMetricsWithKernel) proven bit-identical to the real computeChunkMetrics
    before any timing figure was trusted
  - The measured combined bit-preserving cut (min 0.9740, median 1.0036, max 1.1012) and its
    verdict against both the 10.8% and 21.3% PERF-03 pass thresholds -- clears neither
affects: [phase-08, roadmap-perf03-decision]

actuals:
  tokens: 22000
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Bench-side clone of a byte-identical-protected production function (computeChunkMetricsWithKernel), proven faithful by measurement before use, so an injected-kernel ablation can run at the real chunk shape without editing the protected file"
    - "Proof-before-timing runtime gate via a proven-case counter, table-driven over an arm list whose length (not a hand literal) sets the expected count"

key-files:
  created:
    - bench/backtest-ablation-variants.ts
    - bench/chunk-metrics-kernel-ablation.ts
    - bench/kernel-ablation.bench.test.ts
    - .planning/quick/260824-r5d-measure-whether-per-cell-kernel-compute-/260824-r5d-FINDINGS.md
  modified: []

key-decisions:
  - "The combined bit-preserving arm (all six candidates stacked) clears neither the 10.8% nor the 21.3% PERF-03 pass threshold at any measured point (min 0.9740, median 1.0036, max 1.1012), closing out the last unmeasured lever named in quick-260824-52h: the 1000ms PERF-03 budget is now unreachable by every lever this project has tested"
  - "The day-count reciprocal candidate (not bit-preserving by construction) measured exactly zero deviation from the shipped kernel across all four canonical cases on the real committed series -- disclosed and explained numerically (ULP-level fraction differences are far below the rounding granularity of the value subtraction they feed) rather than treated as a contradiction of its known non-bit-preservation"
  - "VITE_PERF03_ABLATION=1 gate (import.meta.env, Vite's standard process.env passthrough for VITE_-prefixed vars) worked without needing the plan's rename-to-.ablation.ts contingency"

patterns-established: []

requirements-completed: [QUICK-260824-r5d, PERF-03]

coverage:
  - id: D1
    description: "Nine-arm kernel ablation measured at the real 17-column chunk span, gated behind VITE_PERF03_ABLATION=1, with a harness proven bit-identical to the real computeChunkMetrics before any timing figure was trusted"
    requirement: "PERF-03"
    verification:
      - kind: unit
        ref: "bench/kernel-ablation.bench.test.ts (34 tests: fidelity, 28 bit-identical equivalence cases across 7 arms, 4 reciprocal-deviation cases, 1 timing test) — BENCH_RESULTS_DIR=.bench/ablation VITE_PERF03_ABLATION=1 npx vitest run --project bench bench/kernel-ablation.bench.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "FINDINGS.md states the per-candidate table, the measured combined cut, and the verdict against both the 10.8% and 21.3% thresholds in plain words"
    requirement: "PERF-03"
    verification:
      - kind: other
        ref: ".planning/quick/260824-r5d-measure-whether-per-cell-kernel-compute-/260824-r5d-FINDINGS.md (grep checks for 21.3, 10.8, projection, no em dash — all pass)"
        status: pass
    human_judgment: false
  - id: D3
    description: "All six protected files (src/kernel/backtest.ts, src/sweep/sweep-pool.ts, src/sweep/sweep.worker.ts, bench/sweep.bench.test.ts, perf-budgets.ts, bench/calibration.ts) remain byte-identical; no kernel change shipped"
    requirement: "PERF-03"
    verification:
      - kind: other
        ref: "git diff --exit-code -- <six protected files> (exit 0, verified after every task)"
        status: pass
    human_judgment: false

duration: 21min
completed: 2026-08-24
status: complete
---

# Quick Task 260824-r5d Summary

**Nine-arm kernel-compute ablation at the real 17-column chunk span: the combined bit-preserving cut clears neither PERF-03 pass threshold, closing out the last unmeasured lever**

## Performance

- **Duration:** 21 min
- **Started:** 2026-08-24T19:43:08Z
- **Completed:** 2026-08-24T20:04:29Z
- **Tasks:** 3
- **Files modified:** 4 (3 created code files + 1 FINDINGS.md)

## Accomplishments

- Built a bench-side clone (`computeChunkMetricsWithKernel`) of the byte-identical-protected
  `computeChunkMetrics`, proven bit-identical to the real production function over a real
  17-column request before any timing figure was trusted.
- Implemented and proved bit-identical (all eight `KernelResult` fields, `Object.is`, over the
  real ~25,000-bar SPX series, across the same four cases 260824-46s used) six candidate kernel
  optimizations: removed `?? 0` guards, a day-count lookup table, a drawdown-division skip, a
  peeled bar-0 anchor, a deduplicated drawdown-update site, and all six stacked together
  (`runBacktestCombined`).
- Implemented and measured a seventh, deliberately NOT bit-preserving candidate (reciprocal
  multiply instead of division) — proven genuinely non-bit-identical for isolated day-count
  values by direct verification, yet measured exactly zero deviation on the real committed series
  across all four canonical cases, a finding explained rather than hidden.
- Measured all nine arms (shipped baseline + eight variants) across three rotated rounds at the
  real 17-column chunk span. The combined arm's ratio (min 0.9740, median 1.0036, max 1.1012)
  clears neither the 10.8% nor the 21.3% PERF-03 pass threshold at any measured point.
- Wrote FINDINGS.md stating the per-candidate table, the measured combined cut, the verdict
  against both thresholds in plain words, the D-17 projection (labelled a projection), the
  measurement caveats, the disclosed default-suite cost (within noise, no measurable addition),
  and the closing statement: the 1000ms PERF-03 budget is unreachable by every lever this project
  has now tested.

## Task Commits

Each task was committed atomically:

1. **Task 1: One arm end to end at the 17-column span, gated off by default** - `6c44290` (feat)
2. **Task 2: All nine arms, three rounds, and the measured cost of the arm** - `36d35e7` (feat)
3. **Task 3: FINDINGS with the verdict against both thresholds** - `de11744` (docs)

_No plan-metadata commit — the orchestrator handles STATE.md/ROADMAP.md/SUMMARY.md commits._

## Files Created/Modified

- `bench/backtest-ablation-variants.ts` - Eight kernel variants (seven candidates + shared LUT/reciprocal constants), each a faithful copy of `runBacktest` differing in exactly the documented way
- `bench/chunk-metrics-kernel-ablation.ts` - `computeChunkMetricsWithKernel`, a faithful clone of `computeChunkMetrics` accepting an injected kernel function
- `bench/kernel-ablation.bench.test.ts` - Gated (`VITE_PERF03_ABLATION=1`) harness-fidelity, equivalence, deviation and timing tests; 34 tests total
- `.planning/quick/260824-r5d-measure-whether-per-cell-kernel-compute-/260824-r5d-FINDINGS.md` - The measured verdict document

## Decisions Made

- Used `import.meta.env.VITE_PERF03_ABLATION === '1'` (cast locally via a small interface rather
  than adding a `vite/client` types reference project-wide) for the default-run gate; the
  invocation from the plan worked as specified, so the rename-to-`.ablation.ts` contingency was
  not needed.
- The combined arm's measured ratio (median 1.0036) is treated as the authoritative combined
  figure per the plan's own instruction: measured as its own variant, never summed or multiplied
  from the individual candidate ratios.
- The reciprocal candidate's zero measured deviation is reported honestly as a genuine numerical
  fact (explained via ULP-magnitude analysis in FINDINGS section 6), not forced to show a
  nonzero difference to match its a priori "NOT bit-preserving" classification — CLAUDE.md's
  "do not invent problems" / "the measurement wins" directive applies symmetrically to expected
  differences that fail to materialize, not only to expected sameness that fails to hold.

## Deviations from Plan

None - plan executed exactly as written. All `must_haves.truths` were satisfied: the 17-column
harness was proven bit-identical before any clock started; every bit-preserving candidate was
proven bit-identical, not asserted; the reciprocal candidate's deviation was measured and
recorded (even though it measured zero); the combined arm was measured as its own variant; the
arm is gated off by default and its added cost measured back to back; all six protected files
stayed byte-identical throughout; no kernel change shipped; no budget, threshold, calibration
constant, or grid dimension was touched.

## Issues Encountered

None. The default (unflagged) `npm run bench` run on this sandbox exits non-zero at teardown due
to `PERF-08a`/`PERF-08b`/`PERF-08c` being unmeasured — this is a pre-existing condition on this
sandbox (confirmed present before any of this task's changes were made) and unrelated to this
task; it did not block any of this task's own verify steps, all of which check the recorded
`.bench/*/bench-results.json` artifact directly rather than the process exit code, per the plan's
own explicit acknowledgment that both the flagged single-file invocation and this sandbox's
default run exit non-zero by construction.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

PERF-03's decision space is now fully measured. Every lever named across Phase 7.1 and this
task's two predecessor quick tasks has been tested: pool/dispatch overhead (negligible, quick-
260824-52h), worker count (no improvement on the real CI host, 07.1-06), the per-bar output
arrays (1-2%, quick-260824-46s), and now per-cell kernel compute itself at the real chunk shape
(essentially parity at best, this task). The user decision recorded as BLOCKED in `.planning/
STATE.md` (spend a named lever, or accept the escalation and move to Phase 8) can now be made
with full information: no further measurement is pending. D-03's coarser default grid remains the
one unspent, deliberately-held-in-reserve lever, and it redefines what PERF-03 measures rather
than closing the gap on the current grid definition.

---
*Phase: quick-260824-r5d*
*Completed: 2026-08-24*

## Self-Check: PASSED

All created files found on disk (bench/backtest-ablation-variants.ts,
bench/chunk-metrics-kernel-ablation.ts, bench/kernel-ablation.bench.test.ts,
260824-r5d-FINDINGS.md, 260824-r5d-SUMMARY.md). All three task commits
(6c44290, 36d35e7, de11744) found in git log.
