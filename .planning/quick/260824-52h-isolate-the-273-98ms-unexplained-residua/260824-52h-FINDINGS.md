# PERF-03 Residual: Isolated, Not Closed

## 1. The measured attribution table at 10,000 cells

Every figure below is a **sandbox figure**: `hardwareConcurrency=9`, `deviceMemory=2`,
`calibrationScore=0.5625`, `os=linux 7.1.4-200.fc44.aarch64`, `ci=false` (this executor's
container, not GitHub Actions `ubuntu-latest`). This is NOT the D-17 4-core baseline. No figure in
this document is a D-17 measurement unless explicitly marked as a projection onto D-17 in section
5.

One real 200x50 (10,000-cell) sweep, through the real production pool (`src/sweep/sweep-pool.ts`,
unedited) and the real production worker, profiling enabled, `workerCount=3`:

`onWallClockMs=473.00` `onNormalizedMs=840.89`

Per-chunk table, all 12 chunks, in dispatch order (`worker` is the pool index 0-2; offsets are
from the sweep's own start):

| worker | firstCol | colSpan | cells | dispatchMs | responseMs | roundTripMs | computeMs | wireMs | totalMs |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 0   | 17 | 850 | 0.00   | 119.40 | 119.40 | 119.00 | 0.10 | 119.10 |
| 1 | 17  | 17 | 850 | 0.10   | 119.80 | 119.70 | 119.50 | 0.00 | 119.50 |
| 2 | 34  | 17 | 850 | 0.10   | 119.30 | 119.20 | 119.00 | 0.00 | 119.00 |
| 2 | 51  | 17 | 850 | 119.30 | 240.00 | 120.70 | 118.90 | 0.00 | 118.90 |
| 0 | 68  | 17 | 850 | 119.50 | 240.00 | 120.50 | 118.30 | 0.00 | 118.30 |
| 1 | 85  | 17 | 850 | 119.80 | 240.00 | 120.20 | 118.30 | 0.00 | 118.30 |
| 0 | 119 | 17 | 850 | 240.00 | 360.10 | 120.10 | 118.30 | 0.00 | 118.30 |
| 1 | 102 | 17 | 850 | 240.00 | 360.30 | 120.30 | 118.60 | 0.00 | 118.60 |
| 2 | 136 | 16 | 800 | 240.00 | 352.90 | 112.90 | 111.30 | 0.00 | 111.30 |
| 2 | 152 | 16 | 800 | 353.00 | 465.50 | 112.50 | 111.90 | 0.00 | 111.90 |
| 0 | 168 | 16 | 800 | 360.20 | 473.00 | 112.80 | 111.40 | 0.00 | 111.40 |
| 1 | 184 | 16 | 800 | 360.30 | 472.50 | 112.20 | 111.00 | 0.00 | 111.00 |

Counts: `dispatchEvents=12` `responseEvents=12` `profileMessagesWhenEnabled=12`, every worker's
own dispatch/response/profile counts agree (asserted in the bench file, not just eyeballed).

Derived reconciliation attempts, both computed from the SAME table above:

| Component | Value | Kind |
|---|---|---|
| `idealParallelFullGridFromMeasuredSpan17Ms` (extrapolated from a single serial 17-column call) | 442.75ms | derived |
| `allocationTotalMsPerGrid` (12 x measured per-chunk buffer allocation) | 0.03ms | measured |
| `mergeTotalMsPerGrid` (12 x measured `mergeChunkResult` call) | 0.01ms | measured |
| `wireTotalMs` (sum of the 12 chunks' own in-worker wire-write time) | 0.10ms | measured |
| `tailMs` (first chunk response to last chunk response) | 353.70ms | measured |
| `mainThreadOccupiedMs` (union of every worker's response-to-next-dispatch window) | 0.30ms | measured |
| **Sum (`attributedMs`, the plan's own prescribed six-way sum)** | **796.88ms** | derived |
| **`unattributedMs` (`onWallClockMs - attributedMs`, sign preserved)** | **-323.88ms** | derived |

A second, non-overlapping reconciliation, computed in this document directly from the same
per-chunk table (`sum(computeMs)` across all 12 rows, divided by `workerCount`), not prescribed by
the plan's own six-way sum but far more informative:

| Component | Value |
|---|---|
| `sum(computeMs)` across all 12 chunks | 1395.50ms |
| `sum(computeMs) / workerCount` | 465.17ms |
| Gap against `onWallClockMs` (473.00ms) | 7.83ms (1.65% of wall clock) |
| `drainEndSpreadMs` (measured separately, same event stream) | 7.50ms |

The gap (7.83ms) and the independently measured worker-drain imbalance (7.50ms) agree to within
0.33ms. Section 2 explains why this second reconciliation, not the plan's prescribed six-way sum,
is the one that actually answers the question.

## 2. How much of the 273.98ms is now explained, and by what mechanism

**The plan's own prescribed six-way sum does not answer this question, and that is itself a
finding.** `unattributedMs=-323.88ms` is negative because `tailMs` (353.70ms) and
`idealParallelFullGridFromMeasuredSpan17Ms` (442.75ms) do not describe sequential, non-overlapping
phases of the sweep -- they both describe overlapping windows across the SAME wall clock (the
first chunk of the sweep necessarily completes near the start of a multi-wave dispatch, so
`tailMs`, defined as first-completion-to-last-completion, spans nearly the whole sweep, the same
span the compute-time figure already covers). Summing six figures that are not mutually exclusive
against the total wall clock was always going to overshoot; the negative sign is the honest result
of doing exactly what the plan specified, not a bug in the arithmetic.

The second reconciliation (section 1's bottom table) is the one built from genuinely
non-overlapping, directly measured quantities: the real per-chunk `computeMs` values the 12
workers actually reported during the real full-grid sweep, summed and divided by `workerCount`.
This is NOT an extrapolation from any narrower arm -- it is the literal sum of what happened. On
this sandbox it explains 465.17ms of the 473.00ms measured wall clock (98.3%), leaving 7.83ms
(1.65%) unexplained, and that remainder is matched almost exactly by the independently measured
`drainEndSpreadMs` (7.50ms, the spread between the earliest and latest worker to finish its own
queue).

**Against 07.1-PERF-03-PROFILE.md section 2's own arithmetic:** that document built
`idealParallelFullGridMs=851.39ms` (D-17, `hardwareConcurrency=4`) by taking a per-cell figure
measured on a 24-column profile arm (12 chunks of 2 columns each, `perCellKernelUs=255.42`) and
extrapolating it linearly to the full 10,000-cell grid. This task's `spanRatio` measurement
(section 4b) shows that per-cell figure is measured at the WRONG span: the real full grid runs
17-column chunks, not 2-column chunks, and per-cell cost at 17 columns is measured at roughly HALF
the per-cell cost at 2 columns (`spanRatio=0.51`, sandbox). If that ratio holds on D-17 too (not
measured; see section 5's explicit projection), PROFILE.md's own `idealParallelFullGridMs` is
roughly DOUBLE what the real chunk shape actually costs -- meaning PROFILE.md's own "72.2% kernel
compute" figure overstated how much of the wall clock kernel compute alone explains, and the true
"unexplained by naive extrapolation" share is larger than 273.98ms/23.2%, not smaller.

The candidates PROFILE.md left open (transfer, allocation, merge; concurrent-load contention;
worker imbalance) are, on this measurement, all small: allocation and merge combined cost
0.04ms across the whole 12-chunk grid; the wire-write time (already known zero-copy) totals
0.10ms; the concurrency factor (concurrent per-cell cost versus serial per-cell cost at the same
span) is 1.05, a real but small 5% tax, not a dominant term; and worker imbalance
(`drainEndSpreadMs`) is 7.50ms, 1.6% of the wall clock. None of these five candidates, alone or
combined, is large enough to be "the" 273.98ms residual.

**What this measurement actually resolves:** the 273.98ms residual was never a separate,
poolable-away overhead cost sitting on top of "true" kernel compute. It is, in significant part
(pending D-17 confirmation), an artifact of PROFILE.md's own narrow-arm extrapolation
methodology. The real wall clock, measured honestly at the real chunk shape with no
extrapolation, is explained almost entirely (98.3% on this host) by real per-cell kernel compute
divided by worker count, plus a small (1.65%) worker-imbalance tax.

## 3. How much remains unattributed

On this sandbox, using the plan's own prescribed six-way sum: `unattributedMs=-323.88ms`, and
section 2 explains why that number is not informative on its own (overlapping windows summed as
if sequential).

Using the direct, non-overlapping reconciliation (sum of real per-chunk `computeMs`, divided by
`workerCount`): **7.83ms, 1.65% of the measured wall clock, remains unattributed on this
sandbox**, and that remainder is closely matched by the independently measured worker-drain
imbalance (7.50ms). No candidate this task measured explains a large fraction of the wall clock
that isn't already explained by "real per-cell kernel compute, divided by worker count."

This is a sandbox figure. The D-17 residual, recomputed the same way, has not been measured (no
CI run of this instrumentation exists; see section 9).

## 4. Verdict on each candidate, against measurement

**(a) Transfer, allocation, merge: REFUTED.** `allocationTotalMsPerGrid=0.03ms`,
`mergeTotalMsPerGrid=0.01ms`, `wireTotalMs=0.10ms` -- 0.14ms combined, across the whole
10,000-cell grid, against a 473.00ms wall clock (0.03%). Extends 07.1-PERF-03-PROFILE.md's own
"already zero-copy" finding from an assumption to a direct measurement at the real chunk shape.

**(b) Span-dependent per-cell kernel cost: CONFIRMED.** `spanRatio=0.51`
(`span17PerCellUs=132.82` versus `span2PerCellUs=260.00`): per-cell cost at the real full-grid
chunk span (17 columns) is roughly half the per-cell cost at the span the original
`perCellKernelUs=255.42` figure was measured at (2 columns). This directly confirms
07.1-PERF-03-PROFILE.md section 2's own unverified candidate ("per-column kernel cost is not
perfectly linear as each chunk's column span widens"), in the direction that makes the original
extrapolation an OVERESTIMATE of the true ideal-parallel floor, not an underestimate.

**(c) Extrapolation artifact: CONFIRMED overall, with two of its three named sub-parts
individually REFUTED.**
  - Tail imbalance / the `workerCount` division's implicit zero-tail assumption: **REFUTED**.
    `drainEndSpreadMs=7.50ms` against a 473.00ms wall clock (1.6%) -- the three workers finish
    their own queues within 7.5ms of each other. (`tailMs=353.70ms`, the plan's own literal
    first-completion-to-last-completion definition, is large only because it spans the sweep's
    four dispatch waves, not because of a straggler worker; `drainEndSpreadMs` is the sub-part
    that actually tests the `workerCount` division's assumption, and it holds.)
  - First-columns entry-date-position bias in the source `perCellKernelUs` figure: **REFUTED**.
    `firstVsLastChunkRatio=1.01` -- under real concurrent load, the first (longest-window) and
    last (shortest-window) chunks of the real axis cost within 1% of each other per cell. Extends
    07.1-PERF-03-PROFILE.md's own Open Question 3 finding (`cashFlowCountRatio=1.00`) from the
    `solveIrr` branch's cash-flow count to this branch's raw kernel compute cost.
  - Chunk-span bias in the source `perCellKernelUs` figure (narrow 2-column profiling arm versus
    the real 17-column full-grid chunk shape): **CONFIRMED** -- this is candidate (b) above,
    restated; PROFILE.md itself named it as a candidate it did not isolate, and this measurement
    isolates it.

No fourth mechanism is warranted: `concurrencyFactor=1.05` is a small, real, non-dominant
5% tax, not the driver.

## 5. Revised projection

Every number in this section is a **projection**, not a measurement. The arithmetic is shown so
the projection can be checked, and re-run for real on D-17.

Applying this sandbox's measured `spanRatio` (0.51) to 07.1-PERF-03-PROFILE.md's own D-17
`idealParallelFullGridMs` (851.39ms, itself built from the same span-2 extrapolation this task's
`spanRatio` measurement targets):

```
projected corrected idealParallelFullGridMs (D-17) = 851.39 * 0.51 = 434.21ms
projected corrected naive-predicted total (D-17)   = 434.21 + 54.33 (PROFILE.md's own poolOverheadMs) = 488.54ms
projected corrected residual (D-17)                = 1179.70 - 488.54 = 691.16ms (58.6% of measured, versus PROFILE.md's original 273.98ms/23.2%)
```

This projection points the OPPOSITE direction from the objective's hopeful branch ("if real and
removable, the headline projects to roughly 860ms normalized, under budget"). Correcting the known
extrapolation error does not shrink the residual; it grows it, because the original
`idealParallelFullGridMs` figure overstated how much of the wall clock kernel compute alone
explains.

Separately, this sandbox's direct (non-extrapolated) reconciliation -- real per-chunk `computeMs`
summed and divided by `workerCount` -- explains 98.3% of the measured wall clock, leaving only
1.65% (matched by measured worker imbalance) unattributed. If that same relationship holds on
D-17 (an open question; see section 9), it means D-17's wall clock is ALSO explainable almost
entirely by real kernel compute divided by worker count, and the 273.98ms/23.2% PROFILE.md
reported was predominantly an artifact of its own narrow-arm extrapolation, not a genuine,
separately closeable overhead cost.

**What is removable by tuning, and what is not, based on everything measured across this task and
07.1 as a whole:**

- **Not removable by pool/dispatch tuning.** Buffer allocation, `mergeChunkResult`, wire-write
  time, and worker-drain imbalance are all measured negligible or small (combined well under 2%
  of wall clock). There is no meaningful pool-overhead lever left to spend; this task looked
  directly and found none.
- **Not removable by the narrow lever already tested.** 260824-46s measured PERF-03 lever 1
  (write-only per-bar output arrays) and found it buys roughly 1-2% of kernel compute time --
  refuted as a path to closing the gap.
- **Not confirmed removable by worker count.** 07.1-06 measured `workerCount=4` on the D-17
  baseline and found no headline improvement (1191.34ms normalized, inside the width-3 spread),
  attributed to CI contention on a 4-core runner.
- **The remaining lever this task's measurement points at, if any exists, is real per-cell
  kernel compute cost itself** (the `computeChunkMetrics`/`runBacktest` hot path), at the chunk
  shape the grid actually runs (17 columns), not at pool mechanics. This task did not measure
  whether that cost is itself reducible; it only confirms that reducing it is where any remaining
  headroom would have to come from, since every other candidate this task tested is ruled out.

Combining this task's findings with 07.1's own prior three refuted projections (`solveIrr` 3.14x
became 1.83x; worker width 4's 25% became zero; a four-run "roughly 4%" spread became 26% on a
fifth sample), the honest reading, **in plain words: the 1000ms budget looks structurally
unreachable by any lever this project has identified or tested so far, on the D-17 4-core CI
host.** Pool-overhead tuning has no headroom to give (measured, this task). The one already-tested
kernel-level lever bought 1-2% (measured, 260824-46s). Worker count bought nothing on the real CI
host under contention (measured, 07.1-06). No new lever is unlocked by isolating this residual;
what changes is the explanation for where the wall clock goes, not the available levers.

## 6. The cost this arm adds

`armWallClockMs=1557.60` (this file's own wall clock, `beforeAll` start to the end of the second
test, single-sample, `repeatCount=1` per profiling state: one full-grid sweep with profiling off,
one with profiling on).

Whole-suite `totalRuntimeMs`, measured back to back on this sandbox with the file temporarily
removed and then restored (same host session, same production build):

- Before (`bench/sweep-residual.bench.test.ts` absent): `totalRuntimeMs=26220ms`
- After (`bench/sweep-residual.bench.test.ts` present): `totalRuntimeMs=27897ms`
- Delta: 1677ms

Both figures sit comfortably inside the unchanged `BENCH_TOTAL_RUNTIME_CAP_MS=30000ms` cap
(after-figure margin: 2103ms). `BENCH_TOTAL_RUNTIME_CAP_MS` was not raised.

## 7. The inertness proof, as measurement

`profileMessagesWhenDisabled=0`: a full 200x50 sweep through the real production pool, with
`chunkProfilingEnabled` never set to `true` on any worker, emitted exactly zero profile messages.
This is a runtime observation on the real full-grid path, not a claim about the source.

Profiling-off versus profiling-on wall clock, same grid, same pool, back to back:
`offWallClockMs=482.20` versus `onWallClockMs=473.00` (`profilingPerturbationMs=-9.20` -- the
profiling-on pass measured slightly FASTER, within this host's own run-to-run noise band, not a
real cost). The gated PERF-03 row this run (`.bench/bench-results.json`) carries
`source=production`, `verdict=unmeasured` (withheld, not `fail`) -- the informational
`PERF-03 sweep` line discloses its real figure regardless: `measuredMs=489.60`,
`normalizedMs=870.40`, in the same range as this arm's own `offWallClockMs`/`onWallClockMs`
pair, confirming the profiling seam did not disturb the gated file's own measurement.

## 8. What did not move

`NOMINAL_REFERENCE_MS` stays 40. `BENCH_TOTAL_RUNTIME_CAP_MS` stays 30000. No budget or threshold
in `perf-budgets.ts` changed. No grid dimension changed. D-03's coarser default grid was not
spent. `src/kernel/backtest.ts` and `src/sweep/sweep-pool.ts` are unmodified (`git diff
--exit-code` against both, `bench/sweep.bench.test.ts` and `bench/calibration.ts` too, all clean
at every task's verify step). PR #7 and PR #8 were not merged, marked ready, commented on, or
pushed to.

## 9. The host caveat and the open next action

This sandbox reports `hardwareConcurrency=9` and is not the D-17 baseline. Every figure in this
document is a sandbox figure unless marked a projection in section 5. The authoritative
D-17-host attribution (whether `spanRatio` and the direct reconciliation's 98.3% explanation hold
at `hardwareConcurrency=4` under CI contention) requires a CI run on GitHub Actions
`ubuntu-latest`, which `.github/workflows/ci.yml` triggers on `pull_request` only -- meaning a
push to the existing PR #8 branch. This task did not push. That push, and the decision to make
it, is the user's.
