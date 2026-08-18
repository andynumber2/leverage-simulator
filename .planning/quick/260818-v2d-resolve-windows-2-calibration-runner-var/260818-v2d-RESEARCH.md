# WINDOWS 2: calibration runner-variance - Research

**Researched:** 2026-08-18
**Domain:** bench harness calibration (`bench/calibration.ts`), CI runner variance
**Confidence:** HIGH (every load-bearing claim is MEASURED this session, on this repo's own code)

**Evidence tags used throughout:** `MEASURED` (a command I ran this session, output in hand),
`RECORDED` (read from a repo or CI artifact), `INFERRED` (reasoned, not observed).

---

## Summary

Three things are now established that were not before.

1. **The environment blocker is gone, and n is 13, not 3.** Playwright chromium runs in this
   sandbox and `npm run bench` completes with exit 0. `gh` reaches the repo, and 13 of 14 CI runs
   still have a downloadable `bench-results` artifact. The whole investigation is answerable with
   real measurements rather than reasoning.

2. **The stated hypothesis is TRUE, and the effect is far larger than the ledger claims.** Holding
   everything else fixed and varying only available parallelism via `taskset`, the anchor moves
   0.4% while normalized PERF-03 moves 6.1x. A single-threaded anchor is structurally blind to the
   pool metric's dominant variance term.

3. **But that mechanism did not produce the 10pp figure the ledger cites.** All 13 recorded CI runs
   drew a 4-core runner and resolved `workerCount=3`, so the parallel term was constant across the
   entire cited dataset. The 3 runs the ledger sampled include the single most anomalous run of the
   13, and that run inflated PERF-02 (single-threaded, 25k-bar backtest) by the same ~15% it
   inflated PERF-03 by, which a pool-specific mechanism cannot explain. Over the full n=13,
   `normalize()` cuts PERF-03's CV from 11.03% to 6.36%, and within the largest same-HEAD cohort
   with that one anomalous run excluded, from 7.31% to 3.07%. The ledger's "normalization removed
   almost none of the runner variance" is not supported by the full dataset.

The correct reading: `normalize()` works well for single-threaded metrics and is a latent,
catastrophic mis-corrector for the pool metric. The danger is not the observed 10pp; it is the
unobserved case, which has already fired once (CI run 31963076671 attempt 1 drew a 2-core runner
and failed PERF-03 outright at 1032ms).

**Primary recommendation:** Pin PERF-03's pool width to the declared 4-core baseline
(`workerCount: 3`) and gate on the recorded host width, rather than trying to build an anchor that
tracks parallelism. Measured locally: pinning collapses the 9-core-vs-4-core spread from 116% to
1.2%. This touches neither `NOMINAL_REFERENCE_MS` nor `normalize()`.

---

## 1. What is obtainable in this environment (Focus Q1)

| Check | Result | Tag |
|---|---|---|
| `npx playwright --version` | 1.62.1, browsers cached at `~/.cache/ms-playwright` (chromium-1234) | MEASURED |
| `libnspr4.so` / `libnss3.so` / `libasound.so.2` | all present in `/lib/aarch64-linux-gnu/` | MEASURED |
| `npm run bench` | exit 0, total runtime 6332ms, full `.bench/bench-results.json` written | MEASURED |
| `gh run list` + `gh run download -n bench-results` | 13 of 14 runs' artifacts retrieved | MEASURED |

**WINDOWS entry 1's sandbox limitation no longer holds.** Its status is already `fixed`
(RECORDED, `.planning/WINDOWS.md`), and this session independently confirms the browser bench runs
end to end. Nothing in this investigation had to fall back to a Node proxy for the primary result:
every headline number below came from the real `npm run bench` in the real headless Chromium.

Local machine is 9 logical cores, aarch64, load average 0.19 at start (MEASURED). It is not the
D-17 `ubuntu-latest` baseline, so local **absolute** figures are not comparable to CI. Every local
result below is used only as a **within-machine ratio** (same machine, same HEAD, one variable
changed), which is exactly the comparison that is valid across hardware.

---

## 2. The n=13 CI dataset (Focus Q3)

Every run below is `ubuntu-latest`, `hardwareConcurrency: 4`, `workerCount=3 chunkCount=12`
(RECORDED, from each run's own `bench-results.json` and `infoLines`).

| run | timestamp | score | PERF-03 raw | PERF-03 norm | PERF-02 norm |
|---|---|---|---|---|---|
| 31963076671 | 08-16T18:02 | 0.9325 | 653.1 | 700.4 | 0.1780 |
| 31965951474 | 08-16T18:54 | 1.0600 | 856.4 | **807.9** | **0.2053** |
| 31980066804 | 08-16T23:47 | 0.9325 | 655.3 | 702.7 | 0.1780 |
| 31980323928 | 08-16T23:52 | 0.9400 | 643.8 | 684.9 | 0.1766 |
| 31980692480 | 08-17T00:00 | 0.9350 | 680.4 | 727.7 | 0.1780 |
| 31981014276 | 08-17T00:07 | 0.9350 | 653.6 | 699.0 | 0.1775 |
| 31981280775 | 08-17T00:12 | 0.8175 | 548.2 | 670.6 | 0.1783 |
| 31981576532 | 08-17T00:18 | 1.0550 | 711.7 | 674.6 | 0.1782 |
| 31988563500 | 08-17T02:38 | 0.9350 | 679.7 | 727.0 | 0.1778 |
| 32087148265 | 08-18T01:10 | 1.1525 | 787.9 | 683.6 | 0.1777 |
| 32087505739 | 08-18T01:15 | 0.9075 | 736.2 | **811.2** | **0.2065** |
| 32190879735 | 08-18T22:04 | 0.9375 | 655.7 | 699.4 | 0.2031 |
| 32191115971 | 08-18T22:07 | 0.9325 | 651.8 | 699.0 | 0.2065 |

(PERF-02's step from ~0.178 to ~0.205 in the last three rows is a real HEAD change: phase 3
replaced `kernel.bench.test.ts`'s subject with the production `runBacktest`. Runs 31965951474 and
32087505739 are the anomalies, being high **against their own HEAD cohort**.)

**Variance decomposition (MEASURED, computed from the 13 artifacts):**

| metric | raw CV | normalized CV | CV reduction from `normalize()` |
|---|---|---|---|
| PERF-03 (pool) | 11.03% | 6.36% | 42% |
| PERF-02 (single-thread) | 11.10% | 7.12% | 36% |
| PERF-05 (canvas) | 14.48% | 12.59% | 13% |
| anchor score itself | 8.73% | n/a | n/a |

**Within the 9-run pre-phase-2 cohort, excluding the single anomalous run 31965951474:**
PERF-02 normalized CV = **0.31%**, PERF-03 normalized CV = **3.07%** (raw 7.31%). (MEASURED.)

### What n=3 could and could not support

The ledger's three runs are 31963076671 (700.4), 31965951474 (807.9), 31980066804 (702.7). Two of
those are the cohort mode; the third is the single largest outlier in the population. Three samples
containing one extreme cannot distinguish "normalization under-corrects" from "one run was
anomalous," and with n=13 the second reading is the correct one. **The ledger's specific numeric
claim does not survive the larger sample.** (MEASURED.)

**Power, at the observed 6.36% normalized residual CV** (two-sample, alpha .05, 80% power,
MEASURED via the standard formula):

| true change to detect | runs needed per arm |
|---|---|
| 5% | ~26 |
| 10% | ~7 |
| 15% | ~3 |
| 20% | ~2 |

A single CI run cannot support any headroom claim finer than roughly 20%. This is the number that
matters for the Phase 4 concern in the waiver text: PERF-07/PERF-08 decisions made from one run
each are only reliable to about +/-20%.

---

## 3. Root cause: which mechanism (Focus Q2)

Five mechanisms were enumerated. Each has a distinguishing observable, and each was tested.

### (i) Scalar anchor vs pool metric - **CONFIRMED, and it is the dominant latent term**

Distinguishing observable: hold the machine, HEAD, and load fixed; change only available
parallelism. If the mechanism is real, the anchor stays flat while the pool metric moves.

`taskset -c <set> npm run bench`, same HEAD, same machine, same idle load (MEASURED):

| affinity | `hardwareConcurrency` | `workerCount` | anchor score | PERF-02 norm | PERF-03 norm |
|---|---|---|---|---|---|
| all 9 cores | 9 | 8 | 0.6100 | 0.2230 | 314.4 |
| `0-3` | 4 | 3 | 0.6125 | 0.2201 | 678.9 |
| `0-1` | 2 | 1 | 0.6075 | 0.2229 | **1917.2** (exit 1, budget gate fired) |

The anchor varies **0.4%** across a 4.5x change in parallel width. Normalized PERF-02 varies
**1.3%**, so `normalize()` is close to perfect for a single-threaded metric. Normalized PERF-03
varies **6.1x**. This is the mechanism, in isolation, with everything else held constant.

The 2-core row also reproduces the recorded CI failure: run 31963076671 attempt 1 drew a 2-core
runner and failed at 1032ms (RECORDED, 01-SPIKE-RESULTS.md section 6).

**But this mechanism was dormant in the cited data.** All 13 recorded runs drew 4 cores and
`workerCount=3` (RECORDED). Parallel width was constant, so it contributed zero to the observed
10pp. The hypothesis is right about the risk and wrong about the cited symptom.

### (ii) Worker construction as a runner-invariant additive term - **NOT SUPPORTED (weakly bounded)**

Distinguishing observable: a non-zero intercept in `PERF-03 raw = a + b * score`. Multiplicative
normalization cannot absorb a score-invariant additive component.

OLS over the 13 CI runs (MEASURED): `a = -14.2 (se 154.3), b = 729.5 (se 160.3), r2 = 0.653`,
intercept `t = -0.09`. No detectable fixed component. Note honestly that the standard error is
large: the data bounds the fixed share only to roughly +/-45% of total at mean score, so this
rules the mechanism out as a *demonstrated* cause, not as a possibility.

### (iii) min-of-5 too few repeats for a long-tailed pool distribution - **NOT the residual's source**

Distinguishing observable: if the residual were sampling noise in the metric's own minimum, it
would be independent across metrics within a run.

It is not independent. Within the 9-run same-HEAD cohort, the correlation between PERF-02's and
PERF-03's normalized residuals is **0.874** (MEASURED). The two metrics move together, so the
leftover is a shared run-level factor, not each metric's own tail. (PERF-05's residual is nearly
uncorrelated with PERF-02's at -0.025, which is its own separate finding, see (v).)

### (iv) Anchor sampled at a different moment than the metric it denominates - **SUPPORTED as the residual's actual source**

Distinguishing observable: residual correlated across metrics (shared run-level factor) but
uncorrelated with the anchor's own level.

Both hold (MEASURED): cross-metric residual correlation 0.874 within cohort, while
`corr(score, PERF-03 residual) = 0.057` and `corr(score, PERF-02 residual) = -0.007`. The residual
is a per-run shift that the anchor's single sample did not capture, affecting scalar and pool
metrics alike. `resolveRunCalibration()` samples once, in whichever bench file wins the claim race,
and that one sample denominates every later measurement (RECORDED,
`bench/canonical-calibration.ts:40-47`).

Supporting mechanism evidence (MEASURED, Node probe under controlled contention, ratios only):

| workload | idle | +ALU contention | +memory contention |
|---|---|---|---|
| reference loop (1024-element `Float64Array`, 40M iters) | 24.42ms | 27.02ms (+10.6%) | 31.87ms (+30.5%) |
| `runBacktest` x400 over 25,000 bars | 53.98ms | 55.33ms (+2.5%) | 63.90ms (+18.4%) |
| 32 MB streaming loop | 151.33ms | 174.29ms (+15.2%) | 215.98ms (+42.7%) |

The anchor's elasticity to interference is not 1, and it is not even a stable non-1 constant: under
ALU contention it **over**-reports the kernel's slowdown (ratio 0.23), under memory contention it
**under**-reports relative to a streaming workload (ratio 1.40). The correction coefficient depends
on the interference type, which the runner does not disclose.

### (v) Purely multiplicative correction against a workload-specific sensitivity - **SUPPORTED, and it is why PERF-05 barely normalizes**

`npm run bench` under 4 memory-streaming spinners, same machine, same HEAD (MEASURED, 2 runs each):

| quantity | idle | contended | change | sensitivity vs anchor |
|---|---|---|---|---|
| anchor score | 0.6100 | 0.6575 | +7.8% | 1.00x |
| PERF-02 raw | 0.1362 | 0.1527 | +12.1% | 1.55x |
| PERF-05 raw | 0.0693 | 0.0863 | +24.5% | 3.15x |
| PERF-03 raw | 192.5 | 308.3 | +60.2% | **7.73x** |

Residual after `normalize()`: PERF-02 +4.0%, PERF-05 +15.5%, PERF-03 **+48.6%**.

Each workload has its own elasticity to host interference. One scalar cannot correct three
different elasticities. PERF-05's poor normalization in CI (13% CV reduction, RECORDED) is the same
effect: the canvas path's sensitivity is roughly 3x the anchor's.

### Verdict

There are two distinct problems, and the ledger conflated them.

- **Problem A (latent, catastrophic, confirmed):** the anchor cannot see parallel width. Fires only
  when the runner's core count changes. Has fired once (2-core runner, budget failure). Magnitude
  up to 6.1x. Not present in any of the 13 recorded artifacts.
- **Problem B (chronic, moderate, confirmed):** every workload has its own elasticity to host state,
  and a single scalar anchor sampled once per run corrects only its own elasticity. Magnitude
  ~6.4% CV on PERF-03 across 13 runs, up to +48.6% under real contention.

Neither is fixed by retuning `NOMINAL_REFERENCE_MS`, consistent with the ledger's prohibition.

---

## 4. Candidate fixes (Focus Q4)

`BENCH_TOTAL_RUNTIME_CAP_MS = 30_000` (RECORDED, `perf-budgets.ts:85`). Current consumption:
12,080ms on CI run 31965951474 (RECORDED), 6,332ms locally (MEASURED). Roughly 18s of headroom.

| # | Candidate | Fixes | Needs CI data to validate? | Touches `NOMINAL_REFERENCE_MS`? | Runtime cost | Failure mode |
|---|---|---|---|---|---|---|
| **e** | **Pin pool width to the declared 4-core baseline (`workerCount: 3`) and record/gate on host width** | **A** | No (proven locally) | **No** | ~0 (measured 408.5ms vs 191.8ms raw at 9 cores, still far inside the cap) | Silently reports a 4-core figure on a 2-core host unless the host-width guard is added alongside |
| a | Pool-shaped reference workload at the same width | A and part of B | Yes, to re-denominate | No, but needs a NEW budget-denominating constant | 5 repeats x (worker construction + ~40ms); bounded well under 1s | Introduces a second budget-denominating constant whose first value would change PERF-03's normalized figure and could un-trip the D-20 escalation as a side effect. That is the exact hazard the ledger's prohibition guards. Also a pool anchor on a 2-core host scores "slow" and would divide the 2-core PERF-03 figure back down toward passing, hiding a real inability to meet the budget on that host |
| b | Two-term calibration (scalar score + parallel score) | A and part of B | Yes | No | as (a) | Blocked by an existing invariant, see section 5. Same escalation-untripping hazard as (a) |
| c | Regress metric on anchor, calibrate the coefficient | Nothing | Yes, and n is too small | No | 0 | **Measured dead.** Log-log OLS slope of PERF-03 on the anchor is 1.051 (95% CI 0.626 to 1.476, r2 0.681); slope=1 cannot be rejected, and residual CV at the fitted slope is 6.34% vs 6.36% for plain division. Buys 0.02pp. Worse, section 3(iv) shows the true coefficient is not a constant at all: it flips with interference type |
| d | Keep the scalar anchor, declare an explicit measured noise band | Neither (documents B) | Already have it | No | 0 | A band derived from 13 same-width runs is only valid conditional on a 4-core runner. On the 2-core case it is wrong by +180%. A band stated without that condition is more dangerous than no band |

### The measured case for (e)

Same machine, same HEAD, `runSpikeSweep(DEFAULT_SEED, { workerCount: 3 })`, temporary patch applied
then reverted (`git status` clean, verified) (MEASURED):

| affinity | cores | PERF-03 norm, width auto | PERF-03 norm, width pinned to 3 |
|---|---|---|---|
| all | 9 | 314.4 | 675.2 |
| `0-3` | 4 | 678.9 | 683.4 |
| `0-1` | 2 | 1917.2 | 1015.7 |

Pinning collapses the 9-core-vs-4-core spread from **116% to 1.2%**, and cuts the 2-core case from
+182% to +49% above the 4-core figure. The remaining 49% is the honest, irreducible fact that three
workers timesharing two cores is slower; no anchor can or should erase it. That residual is what
the host-width guard exists to catch: `environment.hardwareConcurrency` is already recorded on
every run, and PERF-03's `workerCount` is already recorded via `recordInfoLine` (RECORDED), so the
guard needs no new instrumentation.

Pinning also makes the figure mean what `perf-budgets.ts` already says it means: PERF-03's
description is literally "A full sweep (10,000 cells) **on a 4-core baseline**" (RECORDED,
`perf-budgets.ts:101`). Today the harness measures the sweep on whatever width the runner happened
to give, which is not that.

**Note for the planner:** pinning changes PERF-03's reported figure on any non-4-core host,
including this dev sandbox. It does **not** change it on the D-17 baseline, because every recorded
CI run already resolved `workerCount=3`. So on the machine the D-20 escalation was measured on,
pinning is a no-op and cannot un-trip the escalation. That is the property that makes (e) safe and
(a)/(b) hazardous.

### Recommended combination

1. **(e)** pin the width, plus a run-level guard that refuses to render a PERF-03 verdict when
   `hardwareConcurrency` differs from the declared baseline. Fixes Problem A. No CI data needed.
2. **(d)** declare the measured band for Problem B, **explicitly conditioned on a 4-core runner**:
   normalized PERF-03 residual sd is 6.36% relative over n=13, so a single run supports a headroom
   claim only to roughly +/-13% (2 sd), and roughly +/-20% for a two-run comparison.
3. Reject **(a)**, **(b)**, **(c)** for now. (c) is measured dead. (a) and (b) both introduce a new
   budget-denominating constant whose adoption would move the escalated PERF-03 figure, which is
   precisely what the ledger forbids arriving at by a different route.

Re-waiving is not necessary. The evidence was obtainable and was obtained.

---

## 5. Integration points (Focus Q5)

**`calibrationScore()` consumers** (one, by design):
- `bench/canonical-calibration.ts:32,45` - the only caller. Sampled once per run, claimed via
  `commands.claimCalibration`.

**`normalize()` call sites** (4 bench files, all browser-context):
- `bench/sweep.bench.test.ts:136` (PERF-03)
- `bench/kernel.bench.test.ts:71` (PERF-02)
- `bench/canvas-repaint.bench.test.ts:168,174` (PERF-05, both arms)
- `bench/decode-time.bench.test.ts:128` (DATA-BUNDLE-DECODE)
- `bench/bundle-size.bench.test.ts:27` resolves a score but does not normalize (byte-denominated,
  D-23)

**Files each candidate would have to change:**

| Candidate | Files |
|---|---|
| (e) pin width | `bench/sweep.bench.test.ts:132` (pass `{ workerCount }`), `bench/sweep-pool.ts` (export the declared baseline width beside `resolveWorkerCount`), `bench/report.ts` (`assertRunInvariants`, host-width guard), `perf-budgets.ts` (declare the baseline width next to PERF-03), `tests/report.test.ts` |
| (a)/(b) new anchor | `bench/calibration.ts`, `bench/canonical-calibration.ts`, `bench/environment-block.ts` (new field + `assertEnvironmentBlockComplete`), `bench/accumulator-store.ts` (`claimCalibrationScore`/`loadCalibrationScore` are single-scalar), `bench/browser-commands.d.ts:25,29`, `vitest.config.ts:86-87`, `bench/report.ts:322`, plus `tests/calibration.test.ts`, `tests/accumulator-store.test.ts`, `tests/environment-block.test.ts`, `tests/report.test.ts` |
| (d) declared band | `bench/calibration.ts` doc comment, `.planning/` docs |

### Hard blocker on (b) and (c), previously unrecorded

`bench/report.ts:315-341`, `assertRunInvariants`, enforces **score coherence**: for every row whose
`unit` is `'ms'`, `|measuredMs - normalizedMs * environment.calibrationScore|` must be within
tolerance (RECORDED). A second anchor, or any per-row coefficient other than the single recorded
`environment.calibrationScore`, fails this invariant on every affected row and turns the run red.

The existing escape hatch is the D-23 precedent immediately above it: byte-denominated rows are
exempted by `unit`, not by special-casing a budget id. Any two-term scheme must extend that pattern
(a per-row declaration of which anchor denominates it) rather than weakening the check. Consumers
of the invariant that would need updating: `tests/report.test.ts:188-230,327-342`.

### Browser-context constraint

`bench/canonical-calibration.ts` must never transitively import `node:fs`/`node:os`; it imports
only `commands` from `vitest/browser` and `calibrationScore` from `./calibration.ts` (RECORDED, its
own header, and `bench/accumulator-store.ts:59,147` confirm that module does pull in `node:fs`).
Candidate (a) would put a `new Worker(new URL(...))` construction inside this module. That is
browser-legal (`bench/sweep-pool.ts:50` already does it) but makes `calibrationScore()` async,
which changes the signature `tests/calibration.test.ts:78-92` asserts against synchronously.
Candidate (e) does not touch this file at all.

---

## 6. Assumptions log

| # | Claim | Risk if wrong |
|---|---|---|
| A1 | `ubuntu-latest` core-count allocation is what changed between run 31963076671 attempt 1 (2 cores) and every later run (4 cores); GitHub does not guarantee width. Observed frequency of an off-baseline runner is 1 in 14 (~7%). | If 2-core allocation is more common than observed, Problem A is more urgent than section 3 implies. Cheap to reduce: the host-width guard in (e) makes every future occurrence explicit rather than silent. |
| A2 | The anomaly in runs 31965951474 and 32087505739 is host heterogeneity (a different CPU model in the `ubuntu-latest` pool) rather than transient contention. Inferred from both metrics inflating by an equal ~15% while contention was measured to inflate PERF-03 ~5x more than PERF-02. | If it is contention, the correct band in (d) is wider than 6.36% CV. The environment block records no CPU model, so this is not decidable from the current artifacts. Adding `/proc/cpuinfo` model name to the CI environment stamp would settle it on the next few runs at near-zero cost. |
| A3 | Local aarch64 contention and affinity ratios transfer directionally to x86-64 `ubuntu-latest`. Only ratios, never absolute values, are used. | The direction of the width effect is architectural (Amdahl), not microarchitectural, so a sign flip is not plausible; the magnitude could differ. |

## 7. Open questions

1. **Does the pinned-width figure on a real 4-core CI runner match the 683.4ms measured locally?**
   Cannot be answered without a CI run. Expected to be a no-op on the baseline, since every
   recorded run already resolved `workerCount=3`. One CI run after the change confirms it.
2. **Should PERF-03's verdict be suppressed or hard-failed on an off-baseline host?** A design
   question for the planner, not a research one. Suppressing risks a silently ungated PERF-03;
   hard-failing risks red CI for a reason the PR author cannot control. Recording the host width
   next to the verdict is the minimum either way.

## 8. Sources

- CI artifacts, 13 runs, `gh run download -n bench-results` (MEASURED this session)
- `bench/calibration.ts`, `bench/canonical-calibration.ts`, `bench/sweep-pool.ts`,
  `bench/sweep.bench.test.ts`, `bench/report.ts`, `bench/environment-block.ts`,
  `bench/accumulator-store.ts`, `perf-budgets.ts`, `vitest.config.ts`, `.github/workflows/ci.yml`
  (RECORDED)
- `.planning/WINDOWS.md` entry 2 and its waiver text; `01-SPIKE-RESULTS.md` sections 2, 4, 6;
  `.planning/quick/260816-qae-.../260816-qae-PLAN.md` (RECORDED)
- Local experiments this session: 2 idle bench runs, 2 memory-contended bench runs, 3 affinity
  bench runs, 3 pinned-width bench runs, 9 Node contention probes (MEASURED)

**Repo state:** unchanged. The one temporary edit to `bench/sweep.bench.test.ts` was reverted with
`git checkout --` and `git status --porcelain` verified empty.
