# PERF-03 Kernel Compute: Measured, Not Reducible Enough

## 1. The per-candidate table

Every figure below is a **sandbox figure**: `hardwareConcurrency=9`, `deviceMemory=2`,
`calibrationScore=0.5700`, `os=linux 7.1.4-200.fc44.aarch64`, `ci=false` (this executor's
container, not GitHub Actions `ubuntu-latest`). This is NOT the D-17 4-core baseline. Every arm
runs at the real 17-column chunk span (850 cells), through a harness proven bit-identical to the
real `computeChunkMetrics` before any clock started (section 6).

Sample count: 3 rounds, one call per arm per round, arm order rotated by round index, preceded by
one full discarded warm-up round. Three samples is a small sample. Phase 7.1's own four-run
"roughly 4%" spread on the gated PERF-03 metric became 26% on a fifth sample (recorded in
`.planning/STATE.md`), which is why min and max are reported alongside median rather than the
median alone, and why the spread column below is stated explicitly rather than implied.

Ratios are `variant / shipped`, so a value below 1 means faster, matching 260824-46s' convention.
The `shipped` arm is its own round's denominator, not a separate row.

| Arm | Candidate | Ratio (min / median / max) | Spread (pp) | Bit-preserving |
|---|---|---|---|---|
| 1 noGuards | 1: `?? 0` guards removed | 1.0275 / 1.0577 / 1.1602 | 13.27 | yes |
| 2 dayCountLut | 2: day-count LUT | 1.0025 / 1.0613 / 1.1233 | 12.08 | yes |
| 3 dayCountReciprocal | 2 variant: reciprocal multiply | 1.0560 / 1.1040 / 1.1057 | 4.97 | measured NOT bit-preserving for isolated day-count values; see section 2 |
| 4 drawdownSkip | 3: drawdown division skip | 1.0426 / 1.0950 / 1.1023 | 5.97 | yes |
| 5 peelBarZero | 4: bar-0 peeled from loop | 1.0117 / 1.0293 / 1.0898 | 7.81 | yes |
| 6 dedupDrawdown | 5: deduplicated drawdown site | 1.1501 / 1.1605 / 1.2424 | 9.23 | yes |
| 7 scalarOnly | 6: per-bar array writes removed | 0.9858 / 1.0284 / 1.0310 | 4.52 | yes |
| 8 combined | all six bit-preserving candidates at once | 0.9740 / 1.0036 / 1.1012 | 12.72 | yes |

Every "yes" row is proven bit-identical (`Object.is`, per field, over all eight `KernelResult`
fields) across the same four cases 260824-46s used (zero contribution, contribution schedule,
ruin, leverage below 1), on the real committed ~25,000-bar SPX series -- 28 proven cases (7 arms x
4 cases), gated by a runtime proven-case counter the timing test throws on before any clock
starts.

Arm 3 (dayCountReciprocal) deviation, per numeric field, max absolute and max relative across all
four cases:

| Field | Max absolute deviation | Max relative deviation |
|---|---|---|
| finalValue | 0 | 0 |
| maxDrawdown | 0 | 0 |
| droppedContributionsTotal | 0 | 0 |
| totalContributed | 0 | 0 |

`ruined`, `ruinBarIndex`, `longGapBarCount` and `barCount` were asserted exactly equal to the
shipped kernel across all four cases (they were). The measured deviation on every numeric field is
exactly zero -- not merely small. Section 6 explains why, and why this is a genuine measurement,
not a broken variant.

Every ratio measured at or above roughly 1.0 in the median except the combined arm, whose median
(1.0036) is the lowest median of any individual or combined arm, but is still not below 1. Six of
eight arms (`noGuards`, `dayCountLut`, `dayCountReciprocal`, `drawdownSkip`, `dedupDrawdown`,
`combined`) have a median strictly above 1.05, meaning the median round measured them as SLOWER
than the shipped kernel, not faster.

## 2. The measured combined bit-preserving cut

The combined arm (candidate 8: no-guards + day-count LUT + drawdown skip + peeled bar zero +
deduplicated drawdown + scalar-only array writes, every bit-preserving candidate at once, NOT the
reciprocal variant) was measured as its own variant, at the same 17-column span, in the same three
rotated rounds as every other arm. It was never summed or multiplied from the individual ratios,
because the candidates interact (structurally: the combined variant shares control flow across
optimizations that the individually-tested variants each restructure independently).

**Measured combined ratio: min=0.9740, median=1.0036, max=1.1012.**

The combined ratio is better (lower) than every individual bit-preserving candidate's own median,
confirming the candidates do not cancel each other out when stacked. But even its best-observed
round (0.9740) is only a 2.6% cut, and its median (1.0036) shows essentially no cut at all --
within measurement noise of parity with the shipped kernel. The combined arm's own spread (12.72
percentage points across three rounds) is wide enough that "0.9740" and "1.1012" describe the same
underlying arm, which is itself evidence that any of these individual ratios could easily flip sign
on a different sample, and none of them approach the roughly 20-27 percentage point cut the
verdict rule below requires.

## 3. The verdict against BOTH thresholds

Two thresholds, both real D-17 CI runs, both already recorded in `.planning/STATE.md`:

- **10.8% threshold**, from run 32669644628 (`raw=1179.70`, `calibrationScore=1.0525`): a pass
  needs `raw <= 1052.5`, a cut of 127.20ms.
- **21.3% threshold**, from run 32686531154 (`raw=1156.60`, `calibrationScore=0.9100`): a pass
  needs `raw <= 910.0`, a cut of 246.60ms.

21.3% is the robust target: the user's merge bar (`.planning/STATE.md`, "Merge bar, user decision
2026-08-23") requires the PERF-03 headline to pass on TWO CONSECUTIVE runs, and the observed
calibration range across recorded CI runs spans 0.9100 to 1.0525. A cut that only clears 10.8%
would still fail whichever run lands nearer the 0.9100 end of that range.

The decision rule, precomputed in `260824-r5d-PLAN.md`'s `<reference_arithmetic>`:

- `rCombined <= 0.7833` clears 21.3% (and therefore both).
- `rCombined <= 0.8907` clears 10.8% only.
- `rCombined > 0.8907` clears neither.

Applying this to every measured point of the combined ratio:

| Combined ratio point | Value | Clears 21.3%? | Clears 10.8%? |
|---|---|---|---|
| min (best observed round) | 0.9740 | no | no |
| median | 1.0036 | no | no |
| max (worst observed round) | 1.1012 | no | no |

**The combined bit-preserving cut clears NEITHER threshold, at every measured point, including
the single best round observed across three samples.** This is not a close call decided by which
summary statistic is chosen: even the most favorable observed round (0.9740) falls short of the
weaker 10.8% threshold's required 0.8907 by more than 9 percentage points.

## 4. The projection onto the D-17 headline, marked as a projection

Using `260824-r5d-PLAN.md`'s own projection rule, `projected raw = raw * (0.983 * rCombined +
0.017)`, where 0.983 is 260824-52h's sandbox-measured kernel share of wall clock, NOT a D-17
measurement:

| Baseline run | Baseline raw | rCombined=0.9740 (min) | rCombined=1.0036 (median) | rCombined=1.1012 (max) |
|---|---|---|---|---|
| 32669644628 | 1179.70ms | 1149.55ms | 1183.87ms | 1297.06ms |
| 32686531154 | 1156.60ms | 1127.04ms | 1160.69ms | 1271.66ms |

Every projected figure sits well above both pass thresholds (1052.5ms and 910.0ms). At the best
observed ratio (0.9740), the projection barely moves the raw figure at all (1179.70 to 1149.55,
1156.60 to 1127.04) -- nowhere near either threshold. Every derived-not-measured projection tested
in Phase 7.1 (the `solveIrr` 3.14x that became 1.83x, worker width 4's 25% that became zero, the
four-run "roughly 4%" spread that became 26%) was refuted by later measurement; this projection is
not being asked to carry more weight than that history warrants, and it is consistent with the
already-measured combined ratio being nowhere close to the cut this budget needs.

## 5. The closing statement

**The combined cut clears neither threshold. The 1000ms PERF-03 budget is unreachable by every
lever this project has now tested:**

1. Pool and dispatch overhead (quick-260824-52h): measured negligible. Buffer allocation, merge
   and wire time total 0.14ms across the whole 10,000-cell grid; worker-drain imbalance is 7.50ms
   (1.6%); concurrencyFactor is 1.05. No pool-overhead lever remains.
2. Worker count (07.1-06): measured no improvement on the real D-17 CI host under contention
   (`workerCount=4` produced 1191.34ms normalized, inside the width-3 spread).
3. The kernel's write-only per-bar output arrays (quick-260824-46s): measured a 1-2% cut in
   isolation (ratio 0.9810-0.9904), confirmed again here as arm `scalarOnly` (0.9858-1.0310).
4. Per-cell kernel compute at the real 17-column chunk shape (this task): measured across nine
   arms, including every combination of every bit-preserving optimization identified. The best
   individual candidate's median is still above 1.0 (`scalarOnly`, 1.0284); the combined arm's
   median (1.0036) is the best of any arm tested and still describes essentially no cut.

Adopting any bit-preserving candidate here (arms 1, 2, 4, 5, 6, 7, 8) is a separate, later decision
from this measurement, and would not close the gap regardless: the measured ratios do not clear
either threshold even in aggregate. Adopting the NOT-bit-preserving reciprocal candidate (arm 3)
would additionally require its own Key Decision, because it is provably not bit-identical to
division for isolated day-count values even though it measured zero deviation on the real
committed series across all four canonical cases (section 6) -- and its measured ratio (median
1.1040) is worse than several bit-preserving candidates, so there is no performance case for
adopting it even setting correctness aside.

## 6. Measurement caveats

**Host.** `hardwareConcurrency=9`, `deviceMemory=2`, `calibrationScore=0.5700`, `os=linux
7.1.4-200.fc44.aarch64`, `ci=false`. This is a sandbox figure, not the D-17 4-core CI baseline,
which is why the deliverable throughout this document is a dimensionless ratio rather than an
absolute millisecond figure.

**Harness fidelity.** `computeChunkMetricsWithKernel` (the bench-side clone that makes an injected
kernel measurable without editing the byte-identical-protected `sweep.worker.ts`) was proven
bit-identical to the real `computeChunkMetrics` over a real 17-column request before any timing
figure was trusted: every one of the 850 cells' `multiples`, `drawdowns`, `annualized` and `flags`
values matched under `Object.is`. Both calls' own wall clock was recorded: `fidelityRealMs=126.00`
versus `fidelityCloneMs=118.00` (Task 2's run; Task 1's own run measured 124.00 versus 116.20, the
same direction). In both single-call measurements the clone was NOT slower than the real
`computeChunkMetrics` -- if anything faster, though a single uncontrolled call is noisy and this
should not be read as a large or reliable effect. This measurement does not show evidence that the
injected-callee polymorphism tax biases the ablation ratios toward flattering the arms; if the tax
exists at all here, it points the opposite direction from what would call the arms' measured
ratios into question.

**The reciprocal candidate's zero deviation, explained.** Arm 3 measured zero deviation on every
field despite `1/360` and `1/365` genuinely not being exactly representable in binary64. Direct
verification (`g / 360` vs. `g * (1/360)` for `g` from 0 to 20) confirms real bit-level divergence
for several day-count-gap values (5, 10, 11, 13, 15, 20 for the financing basis; 3, 6, 12 for the
expense basis) -- so the candidate is genuinely not bit-preserving in general, and g=3 (a Friday-
to-Monday gap) occurs thousands of times across the real ~25,000-bar series. The reason the
compounded simulation output still measured bit-identical: the ULP-level difference in the daily
cost fraction (on the order of 1e-18 in the fraction itself) is multiplied into a cost term (`value
* expenseRatio * fraction`, roughly a few percent of `value` per year) that is then subtracted from
`value`, a number many orders of magnitude larger. The resulting perturbation to `value -=
expenseCost` (on the order of 1e-16 in absolute terms) sits far below the rounding granularity of
that subtraction at `value`'s own magnitude (ULP of ~10000 is roughly 2e-12), so the perturbation
never flips a bit of the subtraction's result, on any of the thousands of bars where the underlying
fraction genuinely differs. This is a real, measured numerical fact about this domain's magnitudes,
not a flaw in the equivalence test.

## 7. The cost this arm adds

Default `npm run bench` `totalRuntimeMs`, measured back to back on this sandbox, same host
session, same production build, gate unset (every test in `bench/kernel-ablation.bench.test.ts` is
skipped in this configuration):

- Present: 23089.00ms
- Absent (file temporarily moved out of the bench include glob): 23484.00ms
- Present again: 23219.00ms

The three figures span 23089-23484ms, a smaller range than run-to-run noise on this sandbox (the
"present" measurement is not even the slowest of the three; it is bracketed by the "absent"
measurement on one side). There is no measurable added cost from this file's presence in the
default suite: `describe.skipIf`/`test.skipIf` collection overhead is not distinguishable from
noise here. All three figures sit comfortably inside the unchanged `BENCH_TOTAL_RUNTIME_CAP_MS=
30000ms` cap, with over 6500ms of margin at the largest observed figure.
`BENCH_TOTAL_RUNTIME_CAP_MS` was not raised.

The flagged invocation's own recorded figures: `armWallClockMs=4617.80` (this file's own wall
clock, `beforeAll` start to the end of its last test), against a flagged single-file total bench
runtime of 5657.00ms. That invocation exits non-zero, by construction: `assertRunInvariants`' PERF-
08 coverage gate (`bench/report.ts`) finds the due PERF-08 sub-budgets (`DATA-BUNDLE-BYTES`,
`DATA-BUNDLE-DECODE`, `PERF-08a`, `PERF-08b`, `PERF-08c`) unmeasured in a single-file run, because
this file measures none of them -- the same structural gate that fired for every other single-file
flagged run in this project's history (260824-46s, 260824-52h). The results artifact
(`.bench/ablation/bench-results.json`) is written before that gate throws, so the
`PERF-03-kernel-ablation` info line is always recoverable regardless of the process exit code. This
non-zero exit is a coverage-gate fact, never a budget verdict, and is not worked around here. (A
default, unflagged `npm run bench` run also currently exits non-zero on this sandbox for the same
PERF-08 reason -- `PERF-08a`, `PERF-08b`, `PERF-08c` remain unmeasured even outside this file's
flagged invocation, a pre-existing condition unrelated to this task's changes.)

## 8. What did not move

`NOMINAL_REFERENCE_MS` stays 40. `BENCH_TOTAL_RUNTIME_CAP_MS` stays 30000. No budget or threshold
in `perf-budgets.ts` changed. No grid dimension changed. D-03's coarser default grid was not spent.
`src/kernel/backtest.ts`, `src/sweep/sweep-pool.ts`, `src/sweep/sweep.worker.ts`,
`bench/sweep.bench.test.ts`, `perf-budgets.ts` and `bench/calibration.ts` are unmodified: `git diff
--exit-code` against all six exits 0, verified at every task's `<verify>` step in
`260824-r5d-PLAN.md`. No kernel change shipped. PR #7 and PR #8 were not merged, marked ready,
commented on, or pushed to.
