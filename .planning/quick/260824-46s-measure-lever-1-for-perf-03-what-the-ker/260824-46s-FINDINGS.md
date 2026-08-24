# PERF-03 Lever 1: Measured, Not Reasoned

## 1. What was measured, and what was not

This measures PERF-03 lever 1, the kernel's write-only per-bar output arrays named in
07.1-PERF-03-BASELINE.md section 9 as an unspent lever, reasoned but not measured. It ships no
kernel change. `src/kernel/backtest.ts` is byte-identical: `git diff --exit-code` against it
exits 0. `src/sweep/` imports no variant; `grep -rl 'backtest-scalar-only' src/` returns nothing.

## 2. The equivalence proof

Four cases, all over the real bundled ~25,000-bar SPX series (`barCount=24772`,
`seriesId=SPX/price-return`):

- **Zero contribution**, the failing PERF-03 headline branch. Non-vacuity: `shipped.barCount`
  (24772) is greater than 20000, so the case spans the full committed history.
- **Contribution schedule**, `contributionAmount=100`, flags set every 21st bar. Non-vacuity:
  `shipped.totalContributed` is strictly greater than `initialInvestment`, proving contributions
  were actually applied.
- **Ruin**, leverage swept from 20 upward until the real series actually ruined (it ruined at
  leverage 20, no sweep needed). Non-vacuity: `shipped.ruined` is true, `shipped.ruinBarIndex` is
  at least 0, and `shipped.maxDrawdown` equals exactly 1.
- **Leverage below 1** (D-08's unclamped financing credit), leverage 0.5. Non-vacuity:
  `shipped.ruined` is false, proving the negative-financing non-ruin path was exercised.

Every one of the eight `KernelResult` fields (`finalValue`, `ruined`, `ruinBarIndex`,
`droppedContributionsTotal`, `totalContributed`, `longGapBarCount`, `barCount`, `maxDrawdown`)
matched bit-identically under `Object.is` (Vitest's `toBe`, not `toEqual`) between the shipped
kernel and the variant, across all four cases. The comparison is bit-identical, not
within-tolerance, because the variant reorders no arithmetic: any difference would be a bug in
the variant, never a tolerance question. The zero-contribution case additionally proved the
variant's own `outValue` buffer stayed entirely zero at three sampled indices, a direct proof the
variant wrote nothing, not an inference from reading its source.

The proof ran and passed before any clock started. The mechanism is a file-scoped
`equivalenceCasesProven` counter, checked by the timing test before it starts its own clock: the
timing test throws if the counter is not exactly 4. This is a gate, not merely file order, because
Vitest continues after a failed test.

## 3. The measured ratio

The headline. Five independent A/B samples, `batchSize=250`, over the zero-contribution branch,
arm order alternated between samples, both arms guarded against JIT dead-code elimination by a
shared accumulator sink:

| Sample | Shipped normalized ms | Variant normalized ms | Ratio (variant / shipped) |
|---|---|---|---|
| 0 | 0.2240 | 0.2197 | 0.9810 |
| 1 | 0.2240 | 0.2204 | 0.9841 |
| 2 | 0.2233 | 0.2197 | 0.9841 |
| 3 | 0.2226 | 0.2204 | 0.9904 |
| 4 | 0.2233 | 0.2197 | 0.9841 |

**min ratio 0.9810, median ratio 0.9841, max ratio 0.9904.** The spread is narrow, 0.94 percentage
points, unlike Phase 7.1's own four-run "roughly 4% spread" that became 26% on a fifth sample. The
median is a reasonable point estimate here because the spread stayed narrow across all five
samples, but the min and max are both reported rather than hidden.

## 4. The host, and why it is not the D-17 baseline

This sandbox's recorded environment block: `hardwareConcurrency=9`, `deviceMemory=2`,
`calibrationScore=0.5625`, `os=linux 7.1.4-200.fc44.aarch64`, `ci=false`. This is not GitHub
Actions `ubuntu-latest` at `hardwareConcurrency=4` under CI contention. The absolute milliseconds
measured here (0.22ms per call for a single full-history backtest) do not port to the D-17 host.
The ratio is the deliverable for exactly that reason: a dimensionless factor should port across
hosts even when absolute milliseconds do not.

## 5. Projection, labelled as a projection and not as a measurement

07.1-PERF-03-PROFILE.md section 2 measured the zero-contribution branch on the D-17
`hardwareConcurrency=4` baseline (CI run 32669644628) as 72.2% kernel compute
(`idealParallelFullGridMs=851.39ms`) and 27.8% overhead-and-residual (`328.31ms`) of that run's
measured raw `1179.70ms`, `calibrationScore=1.0525`. Applying `851.39 * r + 328.31` with this
measurement's own three ratio points:

| r | Projected raw ms | Projected normalized ms |
|---|---|---|
| 0.9810 (min) | 1163.52 | 1105.49 |
| 0.9841 (median) | 1166.16 | 1107.99 |
| 0.9904 (max) | 1171.53 | 1113.09 |

Against the five failing D-17 normalized figures (1120.86, 1208.38, 1115.92, 1191.34, 1411.05ms)
and the 1000ms budget: the projected range (1105.49 to 1113.09ms) sits near the best of those five
runs, not below any of them, and is roughly 105 to 113ms over budget on its own projection.
Context established during planning: closing even the best failing run (1120.86ms) to under
1000ms needs `r` below roughly 0.86. This measurement's `r` sits at 0.98 to 0.99, nowhere near
that. This section is a projection, not measured on the D-17 host, and every derived-not-measured
projection tested in Phase 7.1 was refuted by later measurement.

## 6. The verdict, stated plainly

**Lever 1 alone cannot close 1120.86 to 1411.05ms to under 1000ms.** The measured ratio (0.9810 to
0.9904) means the write-only per-bar output arrays cost approximately nothing: removing them buys
roughly 1 to 2% of the kernel's own compute time, not the meaningful fraction the reasoning in
07.1-PERF-03-BASELINE.md section 9 implied. That reasoning was wrong. This is a refuted lever, and
a refuted lever is a successful outcome of this measurement: the alternative was planning a phase
around an unmeasured assumption, which is exactly what Phase 7.1's three prior refutations warned
against repeating.

## 7. Standing cost added to the bench suite

This measurement's own recorded wall clock: `armWallClockMs=1851.50`. The bench suite already runs
at roughly 56141ms against an unchanged 30000ms `BENCH_TOTAL_RUNTIME_CAP_MS` (07.1-PERF-03-BASELINE.md
section 4). This arm's cost is disclosed here, not hidden; no change to the cap is proposed.

## 8. What did not move

`NOMINAL_REFERENCE_MS` stays 40. `BENCH_TOTAL_RUNTIME_CAP_MS` stays 30000. No budget or threshold
in `perf-budgets.ts` changed. No grid dimension changed. D-03's coarser default grid was not
spent. PR #7 and PR #8 were not touched.
