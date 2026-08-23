# Phase 07 PERF-03 Baseline

Gap-closure record for 07-VERIFICATION.md's one open roadmap truth: a real, non-withheld PERF-03
verdict for the shipped sweep, measured on the declared D-17 baseline, recorded somewhere that is
not gitignored. This document is that record.

## 1. Harness readiness

### (a) The CI bench job genuinely is the D-17 baseline

Most recent successful `CI` workflow run on `main` at the time this plan executed:

```
gh run list -R andynumber2/leverage-simulator --workflow CI --limit 15
```

Most recent successful run: **32551360160** (`docs(06): correct the spec's stale perf figures and
log the polygon-f...`, pushed to `main`, completed 2026-08-22T04:18:43Z).

```
gh run view 32551360160 -R andynumber2/leverage-simulator --json headBranch,headSha,conclusion,createdAt
```

```json
{"conclusion":"success","createdAt":"2026-08-22T04:18:43Z","headBranch":"main","headSha":"15b53b3d6a2983f45158c763bbaf20b52270eb7c"}
```

Artifact fetched with:

```
gh run download 32551360160 -R andynumber2/leverage-simulator --name bench-results
```

That artifact's `environment.hardwareConcurrency` is **4**, matching
`PERF_03_BASELINE_HARDWARE_CONCURRENCY`. The baseline machine is real: `ubuntu-latest` genuinely
reports 4 logical cores in production CI, not an assumption. No CI configuration needed changing.

### (b) That run's PERF-03 row and total runtime

Transcribed directly from run 32551360160's downloaded `bench-results.json`:

```json
{
  "budgetId": "PERF-03",
  "requirementId": "PERF-03",
  "measuredMs": 540.5999999999767,
  "normalizedMs": 748.235294117012,
  "budgetMs": 1000,
  "anchorMs": 1000,
  "anchorLabel": "holds attention",
  "source": "spike-synthetic",
  "verdict": "pass"
}
```

`totalRuntimeMs`: **20307ms** (cap 30000ms, 9693ms / 32.3% headroom on that run).

This row's `source` is `spike-synthetic`, not `production`: this run predates plan 07-03's
retarget of `bench/sweep.bench.test.ts` onto `src/sweep/sweep-pool.ts`'s real production pool, so
it measured the Phase 1 spike pool over a synthetic GBM series, the same figure family
PROJECT.md's existing Key Decision rows already cite (807.92ms / 700.38ms / 702.73ms from earlier
D-17 baseline runs). It is real evidence that the run-level harness itself is not what blocks a
verdict: a real CI run, on the real baseline machine, at an earlier commit, DID render a
non-withheld PERF-03 verdict. What has never happened is that same rendering for the
plan-07-03-retargeted, production-pool bench file this phase actually shipped -- because that file
has never run in CI at all (see (c) below). This run is cited for harness-liveness evidence only;
it is not a baseline figure for the shipped production-pool sweep and must not be read as one.

### (c) Why no verdict exists for the retargeted bench

```
git rev-parse --abbrev-ref --symbolic-full-name @{u}
```

```
fatal: no upstream configured for branch 'worktree-agent-af82d58894407a7e2'
```

(This plan executes inside a per-agent worktree branch; the phase branch itself is
`gsd/phase-07-sweep-engine-and-the-heatmap`.) Checked directly against that branch:

```
git ls-remote --heads origin gsd/phase-07-sweep-engine-and-the-heatmap
```

Empty output (exit 0, zero matching refs): **the branch has no upstream on `origin` at all.**

```
gh pr list -R andynumber2/leverage-simulator --state all --head gsd/phase-07-sweep-engine-and-the-heatmap
```

Empty output (exit 0, zero PRs): **no pull request, open or closed, exists for this branch.**

`.github/workflows/ci.yml` triggers only on `pull_request` and on `push` to `main` (confirmed by
reading its `on:` block). A branch with neither a remote upstream nor a PR has never triggered that
workflow. This is the real, confirmed reason no baseline verdict exists for the retargeted
`bench/sweep.bench.test.ts`: not a harness defect, not a withheld-verdict machinery bug, but simply
that the code that would produce the verdict has never run on the machine that is declared to
produce it.

### Local full-suite run: the run-level runtime cap

Ran `npm run bench` on this dev sandbox (informational, non-baseline -- see below for host details)
before any change:

```
Total bench runtime: 32531.00ms (cap: 30000ms)
error during close Error: assertRunInvariants: total bench runtime 32531ms exceeds the declared cap
of 30000ms (D-08): repeat cost has crept; raising the cap requires a recorded decision, not a
silent edit
```

Exit code non-zero. Two conditions from 07-10-SUMMARY.md were re-checked directly against this run,
not assumed:

- **PERF-08 coverage does NOT fail on a full-suite run.** Every `PERF-08`-family row
  (`PERF-08a`/`PERF-08b`/`PERF-08c`/`DATA-BUNDLE-BYTES`/`DATA-BUNDLE-DECODE`) carried `verdict:
  pass` in the full run's own JSON output, confirmed with:
  `node -e "const j=require('./.bench/bench-results.json'); ..."` (see Task 1's acceptance
  criteria command, reproduced below). The isolated-single-file PERF-08 coverage failure
  07-10-SUMMARY.md documents is real but does not apply here; it was not "fixed" because it is not
  broken in this configuration.
- **The total-runtime cap DOES apply, and this is a real defect against this plan.** The same
  `assertRunInvariants` check that gates a local run also gates the CI job that has to publish the
  PERF-03 verdict -- an over-cap CI run would die at teardown after the measurement had already
  succeeded, discarding a genuine verdict before it could be published (T-07-28).

### Per-file cost table (informational, this dev sandbox: 9 logical cores, calibration score
~0.565-0.570, not the D-17 baseline)

Measured with `npm run bench -- --reporter=verbose`, reading each test's own printed duration
(cost attribution, not exit code -- a single-file run trips the unrelated PERF-08 coverage
invariant at teardown per 07-10-SUMMARY.md, so per-file cost is read from the full-suite run's
per-test timings instead). BEFORE any reduction:

| Bench file | Sum of its own tests' durations |
|---|---|
| `bench/heatmap-form-2.bench.test.ts` | **12,121ms** |
| `bench/sweep.bench.test.ts` | 5,561ms |
| `bench/perf-07.bench.test.ts` | 5,281ms |
| `bench/heatmap-panzoom.bench.test.ts` | 2,711ms |
| `bench/sweep-progressive.bench.test.ts` | 2,338ms |
| `bench/bundle-size.bench.test.ts` | 1,941ms |
| `bench/canvas-repaint.bench.test.ts` | 524ms |
| `bench/kernel.bench.test.ts` | 365ms |
| `bench/perf-08.bench.test.ts` | 305ms |
| `bench/decode-time.bench.test.ts` | 165ms |
| `bench/playwright-context-probe.bench.test.ts` | 22ms |
| **Sum of test durations** | **31,334ms** |
| **Total bench runtime (includes browser/transform/import overhead)** | **32,531ms** |

The single largest cost, by a wide margin, was one test inside `bench/heatmap-form-2.bench.test.ts`:
`informational: form 2 (filled contour, polygon FillPath, REJECTED) repaint on a metric change...`
at **10,740ms** on its own -- roughly a third of the entire suite's runtime. That test is exactly
the kind of arm the plan's own rule targets: it records no `MeasurementRow` (only `recordInfoLine`,
per `bench/heatmap-form-2.bench.test.ts`'s own header, "never `recordMeasurement`, which would
collide with test 4's official row"), and the figure it re-measures is a REJECTED path
(`07-04-PLAN.md` Task 3's `d09-fallback` decision) whose historical figure is already recorded in
that file's own header, in `07-04-SUMMARY.md`, and in `PROJECT.md`.

### What was reduced, and why

`bench/heatmap-form-2.bench.test.ts`: the informational `'polygon' FillPath` (REJECTED)
re-measurement arm's batch size was cut from the shared `REPAINT_BATCH_SIZE=20` (which the
shipped/gated `'resample'` PERF-05 measurement still uses, unchanged) to a new,
arm-specific `REJECTED_POLYGON_BATCH_SIZE=2`. At this arm's own measured ~92ms/call raw cost, a
batch of 2 calls is ~184ms, roughly 18x `MIN_MEASUREMENT_MS`'s 10ms floor -- comfortable margin,
not a marginal fit. The figure remains fully disclosed: `batchSize` is still printed alongside the
normalized/raw figures in the `recordInfoLine` call, now correctly reading `batchSize=2` instead of
the shared constant. Nothing about the shipped, gated PERF-05 measurement changed: its own
`REPAINT_BATCH_SIZE=20` constant, its own test, and its own `MeasurementRow` are byte-for-byte
unchanged.

This single change cut that one test's cost from 10,740ms to 994ms (post-fix, measured again),
and the whole suite's total runtime from 32,531ms to **22,991-23,099ms** across three repeated
local runs (small run-to-run variance, all comfortably under the 30,000ms cap). No further
reduction was needed -- per the plan's own instruction, cutting stopped as soon as the suite exited
0.

### Post-fix per-file cost table (informational, same dev sandbox)

| Bench file | Sum of its own tests' durations |
|---|---|
| `bench/sweep.bench.test.ts` | 5,630ms |
| `bench/perf-07.bench.test.ts` | 5,274ms |
| `bench/heatmap-panzoom.bench.test.ts` | 2,704ms |
| `bench/sweep-progressive.bench.test.ts` | 2,365ms |
| `bench/heatmap-form-2.bench.test.ts` | **2,409ms** (was 12,121ms) |
| `bench/bundle-size.bench.test.ts` | 1,949ms |
| `bench/canvas-repaint.bench.test.ts` | 533ms |
| `bench/kernel.bench.test.ts` | 363ms |
| `bench/perf-08.bench.test.ts` | 292ms |
| `bench/decode-time.bench.test.ts` | 167ms |
| `bench/playwright-context-probe.bench.test.ts` | 22ms |
| **Sum of test durations** | **~21,708ms** |
| **Total bench runtime** | **~22,991-23,099ms** (cap 30,000ms) |

### No threshold, cap, or calibration constant moved

```
git diff --exit-code -- perf-budgets.ts bench/calibration.ts bench/report.ts
```

Exits 0: zero diff. Confirmed directly, not assumed.

### PERF-03 headline arm and contribution-schedule info arm, unmodified

```
git diff -- bench/sweep.bench.test.ts
```

Exits 0: zero diff. `bench/sweep.bench.test.ts` was read in full (per this task's `<read_first>`)
and required no change -- the real blocker was never inside that file. The PERF-03 headline
arm's `REPEAT_COUNT`, its 10,000-cell (`SWEEP_COLS x SWEEP_ROWS`) grid, its extended-tier
entry-date axis, and its four correctness gates are exactly as plan 07-03 left them. The
contribution-schedule info arm's `sampleCount=1` is exactly as plan 07-03 left it.

### This dev sandbox's own PERF-03 figures (informational, non-baseline, 9-core host)

From the post-fix `npm run bench` run's own printed info line:

```
PERF-03 sweep: workerCount=3 hardwareConcurrency=9 declaredBaselineHardwareConcurrency=4 measuredMs=469.60 normalizedMs=831.15 verdict=withheld measurementExcludesWorkerConstruction=true source=production
PERF-03 with a monthly contribution schedule (F-06, D-24 solveIrr branch), sampleCount=1: measuredMs=2010.20 normalizedMs=3557.88 hardwareConcurrency=9 workerCount=3
```

Both figures carry `hardwareConcurrency=9` explicitly and are labelled **informational,
non-baseline** here: this is a 9-logical-core dev sandbox, not the declared 4-core
(`PERF_03_BASELINE_HARDWARE_CONCURRENCY`) baseline. The zero-contribution (CAGR) branch's verdict
is correctly `withheld` by the shipped withheld-verdict machinery (`hostMatchesPerf03Baseline`
returning false). No figure here is presented as a baseline measurement.

### Test verification

```
npm run test -- --run tests/ci-workflow.test.ts tests/report.test.ts tests/perf-budgets.selftest.test.ts
```

3 files / 81 tests passed.

## 2. The D-17 baseline run

Filled in by Task 3, from the CI run id Task 2 returns (or an explicit record that none was
obtained).

## 3. The contribution-schedule figure

Filled in by Task 3, alongside this file's own section 1 dev-sandbox contribution-schedule figure
above.
