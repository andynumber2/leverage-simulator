# Phase 1 Spike Results

**Status:** Permanent record (D-13). The throwaway Rust crate this document reports on
(`spike/wasm-microbench/`) is deleted at the end of this phase; this document is what survives
it.

**Produced by:** Plan 01-04, Task 1 (the Rust microbenchmark) and Task 2 (this document).

---

## 1. Method

### Synthetic input (D-16, shared unchanged by both arms)

A deterministic 25,000-bar seeded GBM series (`bench/synthetic-data.ts#makeSeededGbmSeries`,
ported bit-for-bit to Rust in `spike/wasm-microbench/src/lib.rs#make_seeded_gbm_series`):

- **PRNG:** mulberry32 (32-bit xorshift family), seeded with `DEFAULT_SEED = 0x5eed5eed`.
- **Normal transform:** trigonometric Box-Muller, cosine branch only, `u1` clamped away from 0
  at `1e-12`.
- **Daily return:** drift `0.0003`/day, volatility `0.012`/day.
- **Short rate:** oscillates around `0.02` base with `0.015` amplitude over 3 cycles across the
  series, plus small noise, floored at 0.
- **Calendar gaps:** every 5th bar carries a 3- or 4-day gap (95%/5%), standing in for
  weekends/holidays; all other bars carry a 1-day gap.

### The branchy recurrence (D-12)

`bench/kernel.ts#runSpikeBacktest`, ported bit-for-bit to
`spike/wasm-microbench/src/lib.rs#WasmSeries::run_spike_backtest` /
`bench_full_series`. Not a stripped arithmetic loop — carries every branch PITFALLS names:
leverage compounded on the daily return (never cumulative), financing on the borrowed portion
accrued on a **365-calendar-day** basis, expense ratio accrued on a flat **252-trading-day**
basis (a deliberately different accrual convention, not conflated), a ruin clamp with a true
absorbing state (no compounding, no contribution, ever resurrects a ruined position), and a
contribution schedule applied after the ruin check so a contribution on the ruin bar itself
cannot resurrect the position.

Params used for every timed and equivalence run in this document: `leverage=3, entryIndex=0,
initialInvestment=10000, contributionAmount=100, contributionIntervalBars=21,
financingSpread=0.005, expenseRatio=0.0095` — identical to `bench/kernel.bench.test.ts`'s
PERF-02 test, so the WASM arm's single-call figure is directly comparable to the already-recorded
PERF-02 figure.

### Equivalence, before any ratio is trusted

`spike/wasm-microbench/harness/run.mjs` computed the JS arm's `finalValue`/`ruined` for the
identical seed and params by importing `bench/kernel.ts` and `bench/synthetic-data.ts` directly
(not a reimplementation — `harness/js-reference.ts`, executed via
`node --experimental-strip-types`), then asserted the WASM arm's result matched within a
**1e-9 relative tolerance** on `finalValue` and exact equality on `ruined`. Measured relative
difference: `3.385e-16` (machine-epsilon-scale, consistent with the mulberry32 port producing a
bit-identical PRNG stream — see the doc comment on `mulberry32_next` in `lib.rs` for why u32
arithmetic throughout makes the JS `Math.imul`/`>>>` bit pattern reproducible exactly in Rust).
**A ratio was only computed after this check passed.**

### Timing methodology (D-06/D-07)

Both arms used the same calibration-normalized minimum-of-5 methodology as
`bench/calibration.ts`: a fixed-iteration, allocation-free `Float64Array` reference loop
(`REFERENCE_ITERATIONS = 40,000,000`, `NOMINAL_REFERENCE_MS = 40`) run 5 times, minimum taken,
scaled to a calibration score; every timed metric divided by that score before comparison.

**The WASM arm ran in the same headless Chromium the production `npm run bench` suite uses**
(driven via the project's existing Playwright install, D-02), so its single-call figure is
directly comparable to the already-recorded PERF-02 figure without a second measurement
environment to reconcile.

**A single call lands at/below `performance.now()`'s effective resolution in headless Chromium
on this machine** — the WASM arm's raw single-call time (`0.09999999962747097`ms) is bit-for-bit
identical to the JS arm's own recorded PERF-02 raw figure (see §2), which is exactly what a
shared timer floor looks like, not evidence the two implementations run at the same true speed.
To get a resolvable per-call figure, a secondary **5,000-call batched measurement** was added:
call the timed function 5,000 times inside one `measureMinOfN` unit, take the minimum-of-5 batch
time, divide by 5,000. This was run for the WASM arm inside the same Chromium harness, and for
the JS arm as a **supplementary** measurement under Node's V8
(`harness/js-batched-reference.ts`) — not headless Chromium, because the production JS/canvas
arms have no existing batched-loop bench row to reuse, and adding one to the permanent
`bench/kernel.bench.test.ts` would be a Rule 4 (architectural) change to the locked D-02
measurement methodology, out of scope for a throwaway ratio. Node and Chromium share the V8
engine family, so this per-call arithmetic figure is treated as directionally reliable but
explicitly labelled as a secondary, not the primary same-environment figure.

---

## 2. Raw numbers

Every figure below is transcribed from `.bench/bench-results.json` (the JS/canvas arms) or from
`spike/wasm-microbench/harness/run.mjs`'s printed JSON (the WASM arm), not retyped from memory.

| Figure | Raw | Normalized | Budget | % of budget | Machine | Cores | Browser | OS | Calib. score | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| PERF-02 (JS, single 25k-bar backtest) | 0.09999999962747097ms | 0.17543859583193538ms | 16ms | 1.1% | this dev sandbox (informational, not D-17 baseline) | 9 (`hardwareConcurrency`) | HeadlessChrome/151.0.7922.34 | linux 7.1.4-200.fc44.aarch64 | 0.5700000000186265 | spike-synthetic |
| PERF-03 (JS, 10,000-cell Worker-pool sweep, 8 workers/32 chunks) | 185.7999999988824ms | 327.4008810660453ms | 1000ms | 32.7% | this dev sandbox (informational, not D-17 baseline) | 9 | HeadlessChrome/151.0.7922.34 | linux 7.1.4-200.fc44.aarch64 | 0.5700000000186265 | spike-synthetic |
| PERF-05 (JS, canvas `fillRect` arm) | 4.41ms (`recordInfoLine`, not a budget row) | — | 16ms | 27.6% (informational; the loser arm) | this dev sandbox (informational, not D-17 baseline) | 9 | HeadlessChrome/151.0.7922.34 | linux 7.1.4-200.fc44.aarch64 | 0.5700000000186265 | spike-synthetic |
| PERF-05 (JS, canvas `putImageData` arm — the winner, asserted against budget) | 0ms | 0ms | 16ms | 0% | this dev sandbox (informational, not D-17 baseline) | 9 | HeadlessChrome/151.0.7922.34 | linux 7.1.4-200.fc44.aarch64 | 0.5700000000186265 | spike-synthetic |
| WASM single call (this plan) | 0.09999999962747097ms | 0.1762114530793792ms | (not a PERF budget — see §3) | n/a | this dev sandbox (informational, not D-17 baseline) | 9 | HeadlessChrome/151.0.7922.34 | linux 7.1.4-200.fc44.aarch64 | 0.5675000000279397 | spike-synthetic |
| WASM batched (5,000 calls, per-call) | 0.1347800000000745ms/call raw, 0.23749779734526677ms/call normalized | — | n/a | n/a | this dev sandbox (informational, not D-17 baseline) | 9 | HeadlessChrome/151.0.7922.34 | linux 7.1.4-200.fc44.aarch64 | 0.5675000000279397 | spike-synthetic |
| JS batched, Node V8 (5,000 calls, per-call, supplementary) | 0.11231767760000003ms/call raw | — (no calibration score computed under Node) | n/a | n/a | this dev sandbox (informational, not D-17 baseline) | 9 | Node 22.23.2 (V8, not headless Chromium) | linux 7.1.4-200.fc44.aarch64 | n/a | spike-synthetic |

**PERF-04, PERF-06, PERF-07a, PERF-07b, PERF-08a, PERF-08b, PERF-08c, PERF-09** remain
unmeasured this phase (their `implementedInPhase` is 4 or 7, not 1); `npm run bench` reports them
as `unmeasured` with their locked threshold and anchor still shown, per D-05/D-19. Not evaluated
against the 70% trigger below, since there is no measured value to compare.

**Baseline caveat (D-17/D-18):** every figure above is an **informational dev-machine run**, not
the authoritative `ubuntu-latest` CI baseline. `ci: false` in the captured environment block
confirms this — no GitHub remote is configured in this repository yet (per 01-01-SUMMARY.md's
"User Setup Required"), so no run has executed on the D-17 baseline machine. The percentages and
verdicts above are provisional until a real CI run against `ubuntu-latest` reproduces them.

---

## 3. JS versus WASM ratio

**Primary, same-environment figure (headless Chromium, single call):** both arms measure the
*identical* raw floor value (`0.09999999962747097ms`) — `performance.now()`'s effective
resolution in this browser build, not a measurement of either implementation's true cost. This is
the same caveat 01-03-SUMMARY.md already recorded for `putImageData`'s near-zero figure: **do not
cite this as a precise ratio.** The honest reading is: at the single-backtest scale, both arms
are already so far under budget (PERF-02's 16ms budget, ~91x headroom even before normalization)
that no measurement at this resolution can distinguish them.

**Secondary, resolved figure (5,000-call batch, per-call):**

- WASM (headless Chromium): `0.1347800000000745`ms raw per call
- JS (Node V8, supplementary): `0.11231767760000003`ms raw per call
- **Ratio: WASM is ~1.20x SLOWER than JS** for this workload on this machine (`0.13478 /
  0.11232 = 1.1999891992075384`), reproduced across three independent runs during this session
  (1.1929, 1.1977, 1.2000) — a stable finding, not noise.

**This measurement contradicts the specific numeric shape of the "Rationale for JS-first"
block's prediction, and that is stated plainly rather than reconciled away, per this task's own
instruction.** CONTEXT.md's rationale predicted "near parity" between scalar WASM and monomorphic
`Float64Array` JS on this allocation-free, branchy, non-vectorizable recurrence. The measured
result is not parity — WASM is measurably, repeatably slower, not equal. However, **the
rationale's ultimate conclusion (plain JS first, WASM buys nothing perceptible) is not weakened
by this — it is strengthened.** The rationale's weakest claim ("if JS clears the budget with
margin, WASM buys nothing perceptible") was an argument that WASM would not be *worth the cost*
of adopting even if it won by some margin. This measurement removes even that hypothetical: WASM
does not win here at all. There is no scenario visible in this data where escalating to Rust
would make the single-backtest or sweep-scale kernel faster; it appears to make it slightly
slower, on top of the toolchain and cross-boundary-marshalling cost D-11/D-13 already priced in
as a reason not to adopt it by default.

**Caveat on the secondary figure's environment parity:** the JS batched figure is Node V8, the
WASM batched figure is headless Chromium V8. Both are V8, and this per-call arithmetic figure is
expected to be engine-behavior-dominated (JIT tier-up on a monomorphic loop) rather than
environment-dominated, but this is not the same rigor as the single-call figure's exact
same-environment comparison. Treat the 1.20x figure as directionally reliable, not to the same
precision standard as PERF-02/03/05's Chromium-only figures.

---

## 4. Escalation evaluation (D-20)

Escalation trigger: measured normalized value at or above **70%** of budget
(`ESCALATION_TRIGGER_RATIO` in `perf-budgets.ts`).

| Budget | Normalized | Budget | % of budget | Crossed 70%? |
|---|---|---|---|---|
| PERF-02 | 0.1754ms | 16ms | 1.1% | **No** |
| PERF-03 | 327.40ms | 1000ms | 32.7% | **No** |
| PERF-05 | 0ms (winner: `putImageData`) | 16ms | 0% | **No** |

**No measured figure crosses the 70% trigger this phase.** No deliberate escalation (Worker pool
retuning, adopting the WASM ratio, a coarser default grid) is owed, and per D-20/PERF-01a, no
budget is relaxed. Task 3 records no third Key Decision row, per this document's own finding.

PERF-04, 06, 07a, 07b, 08a, 08b, 08c, 09 are unmeasured this phase (implemented in Phase 4 or 7)
and are not evaluated against the trigger — there is no measured value yet to compare, and their
thresholds remain locked at their perception anchors per D-19 regardless.

---

## 5. Reproduction steps

Verbatim from `spike/wasm-microbench/README.md`, before the crate's deletion.

### Toolchain install

Neither `cargo`, `rustc`, nor `wasm-pack` were present on this machine at plan start. Installed
via the official installers, **never via npm** (Package Legitimacy Audit, 01-RESEARCH.md — the
npm `wasm-pack` wrapper's postinstall fetches a platform binary from GitHub releases at install
time; installing outside `package.json` avoids that entirely):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o /tmp/rustup-init.sh
chmod +x /tmp/rustup-init.sh
/tmp/rustup-init.sh -y --default-toolchain stable --profile minimal
source "$HOME/.cargo/env"

rustup target add wasm32-unknown-unknown

# A host C toolchain is required even for a wasm32-unknown-unknown build (cargo compiles
# proc-macro crates and build scripts for the HOST target first). This sandbox had none:
sudo apt-get update
sudo apt-get install -y gcc

cargo install wasm-pack
```

Versions used: `rustc 1.97.1 (8bab26f4f 2026-07-14)`, `cargo 1.97.1 (c980f4866 2026-06-30)`,
`wasm-pack 0.15.0`.

### Build

```bash
cd spike/wasm-microbench
cargo build --target wasm32-unknown-unknown --release
wasm-pack build --target web --release
```

### Run the measurement

```bash
node spike/wasm-microbench/harness/run.mjs
```

Prints one JSON object: the equivalence check result, both arms' `finalValue`/`ruined`, the
single-call timing (both arms), and the 5,000-call batched timing (both arms). A non-zero exit
means either equivalence failed or the harness itself errored — no ratio is trustworthy from a
non-zero exit.

### Reproduce the JS/canvas arm figures (PERF-02, PERF-03, PERF-05)

```bash
npm run bench
```

Reads `.bench/bench-results.json` after the run for the machine-readable figures this document's
§2 table transcribes.
