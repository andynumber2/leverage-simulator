# Phase 1: Performance Spike and Budget Lock - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-16
**Phase:** 1-Performance Spike and Budget Lock
**Areas discussed:** Measurement environment, CI enforcement strategy, Which architecture arms get built, Baseline hardware definition

---

## Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Measurement environment | Node vs headless browser vs both | ✓ |
| CI enforcement strategy | How a noisy shared runner produces a non-flaky gate | ✓ |
| Which architecture arms get built | Whether the WASM and library arms are actually implemented | ✓ |
| Baseline hardware definition | What "4-core baseline machine" concretely means | ✓ |

**User's choice:** all four.

---

## Measurement Environment

### Q1: Where should the sweep hot-loop benchmark run?

| Option | Description | Selected |
|--------|-------------|----------|
| Headless Chrome only | Playwright Chromium, real Workers and Canvas, one set of numbers | |
| Node for compute, browser for render | Faster iteration, but compute measured in a different V8 configuration | |
| Both, side by side | Node-vs-browser delta as data, doubled runtime | |

**User's choice:** none initially. Asked whether headless Chrome is workable on GitHub PR CI, and
whether that is even the CI target.

**Notes:** Answered with facts: `ubuntu-latest` ships Chrome, `npx playwright install --with-deps
chromium` is roughly 60-90s cold and caches; headless Chrome in GitHub Actions is routine. Flagged
that the real risk is different (runner throughput varies roughly 20-40% run to run) and that
`ubuntu-latest` being 4-vCPU happens to match PERF-03's baseline spec exactly. Re-asked with the
CI target made explicit.

### Q1a: What is the CI target?

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Actions on PR | Hosted runners, triggered on pull request and push to main | ✓ |
| GitHub Actions, local-first | Local pre-push is the authority, CI a backstop | |
| No CI yet, local only | Defers criterion 5 | |

### Q1b: Re-asked — where should benchmarks run?

| Option | Description | Selected |
|--------|-------------|----------|
| Headless Chrome only | Playwright Chromium locally and in CI, runner doubles as the PERF-03 baseline | ✓ |
| Node for compute, browser for render | | |
| Both, side by side | | |

### Q2: What form does the bench harness take?

| Option | Description | Selected |
|--------|-------------|----------|
| Vitest browser mode | One runner for tests and benches, budget assertions are ordinary expects | ✓ |
| Standalone Playwright script + bench page | Hand-openable bench page, more code | |
| Both | Vitest gates, bench page for eyeballing, some duplication | |

### Q3: What does `npm run bench` output?

| Option | Description | Selected |
|--------|-------------|----------|
| Table to stdout + JSON artifact | Gitignored JSON uploaded as a CI artifact, no repo churn | ✓ |
| Table to stdout only | No trend history, nothing to diff | |
| Table + JSON committed | Free trend history, but machine-dependent numbers churn the tree | |

### Q4: How are not-yet-implemented metrics handled?

| Option | Description | Selected |
|--------|-------------|----------|
| Print as UNMEASURED, exit 0 | Every row always appears with budget and anchor | ✓ |
| UNMEASURED and fail after a declared phase | Stronger ratchet, more machinery | |
| UNMEASURED with a warning banner | Exit 0 plus a loud summary line | |

**Area check:** "Next area".

---

## CI Enforcement Strategy

### Q5: How does a wall-clock budget become a non-flaky gate on a ±20-40% runner?

| Option | Description | Selected |
|--------|-------------|----------|
| Calibration-normalized | Reference loop scores the runner, measured times divided by it before comparison | ✓ |
| Best-of-N repeats | Cheap noise removal, still needs a headroom multiplier for a uniformly slow runner | |
| CI headroom multiplier | Simplest, weakens the gate by exactly the factor chosen | |
| Deterministic proxies | Zero flake, but PERF-02..09 specify milliseconds, not counters | |

### Q6: Layer repeats on top of calibration?

| Option | Description | Selected |
|--------|-------------|----------|
| N=5, min, with a runtime cap | Fastest of 5, bench asserts its own total wall-clock | ✓ |
| N=3, min | Half the cost, slightly noisier | |
| N configurable, 5 local / 3 CI | Adds a knob, local and CI numbers no longer produced identically | |

**User's choice:** deferred on first ask, wanting to know how much repeats cost in CI wall-clock.

**Notes:** Answered with a cost table (calibration ~50-100ms, sweep ~0.15-3s, repaint ~1-5ms, one
pass ~1-3s, N=5 ≈ 5-15s) against fixed job overhead of roughly 90-150s, explicitly flagging that
the per-pass sweep figure is the unknown this phase exists to measure. Re-asked; user selected
N=5 with a cap.

### Q7: How is gate liveness proven?

| Option | Description | Selected |
|--------|-------------|----------|
| Permanent self-test in CI | Over-budget fixture asserted to exit non-zero; runs forever, cannot rot | ✓ |
| One-time regressed branch, recorded | Proves the full pipeline once, nothing thereafter | |
| Both | Full pipeline proof plus ongoing checker proof | |

**Area check:** proceeded to architecture arms.

---

## Which Architecture Arms Get Built

### Q8: How much of the WASM arm gets built?

| Option | Description | Selected |
|--------|-------------|----------|
| JS only, WASM as conditional escalation | Cheapest; the measured figure settles it either way | |
| Build both arms unconditionally | True head-to-head, second toolchain and second implementation | |
| JS only, plus a WASM microbenchmark | Firsthand ratio at a fraction of the cost | ✓ |

**User's choice:** initially challenged the framing, asking why a performance-first project would
not simply start with WASM if it is clearly the most performant option.

**Notes:** Answered that the premise does not hold for this workload: a single backtest is a serial
recurrence that does not vectorize within a run; WASM SIMD is 128-bit (f64x2, 2 lanes) so the
headline 2-4x does not apply; the branchy parts are SIMD-hostile; scalar WASM versus monomorphic
`Float64Array` JS is near parity; and the worker pool is the larger lever and applies to both. Also
named the non-performance costs (a permanent second toolchain, and materially harder debugging in
Phase 3 where the model is tried against real UPRO/TQQQ history), and reframed "performance first"
as measured against a perception anchor rather than maximized. Acknowledged the honest risk of
JS-first: if it misses, the phase spent its time and WASM gets built anyway. User then selected the
microbenchmark option, which buys a firsthand ratio without a second full implementation.

### Q9: Canvas-vs-library decision.

| Option | Description | Selected |
|--------|-------------|----------|
| Hand-rolled canvas only, threshold check | Cites the measured figure plus research's documented library rejections | ✓ |
| Canvas plus one library head-to-head | Firsthand number, at the cost of a heavy dependency pulled in to discard | |
| Canvas measured two ways | Settles the internal fillRect/putImageData fork instead | |

### Q10: Settle the fillRect vs putImageData fork now?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, measure both | Near-zero marginal cost, settles it for Phases 6 and 7 | ✓ |
| No, one implementation vs the 16ms budget | Leaves the fork for Phase 6 | |

### Q11: WASM microbenchmark lifespan.

| Option | Description | Selected |
|--------|-------------|----------|
| Throwaway, deleted at phase end | No dependency, no CI cost, nothing to rot | |
| Kept behind a separate script | Re-runnable later, will bitrot unless exercised | |
| Throwaway, numbers land in a spike report | Code deleted, method and raw numbers preserved and reproducible | ✓ |

**User's choice:** asked for clarification first, having assumed the microbenchmark was purely a
one-time comparison and being unclear whether it would become permanent.

**Notes:** Confirmed the lifespan was a decision not yet made and laid out both readings, noting
that a JS-vs-WASM ratio is not one of PERF-02..09 so it has no standing claim on the permanent
harness, and that criterion 1 itself calls the spike throwaway. Also noted that if it is throwaway,
the language choice loses most of its weight, which argues for Rust over AssemblyScript.

### Q12: Language for the microbenchmark.

| Option | Description | Selected |
|--------|-------------|----------|
| Rust via wasm-pack | The real escalation target, so the ratio predicts what escalation would buy | ✓ |
| AssemblyScript | Cheaper to write, but its number is a floor rather than a prediction | |
| Both | Brackets the answer, roughly doubles the cost of code being deleted | |

### Q13: What does the microbenchmark measure?

| Option | Description | Selected |
|--------|-------------|----------|
| The real per-bar recurrence | Includes the branchy parts, so the ratio reflects this workload | ✓ |
| A stripped arithmetic loop | Trivial, and the case where WASM looks best | |
| Both, to bracket the branch penalty | Isolates branching from arithmetic, four measurements | |

### Q14: Real Worker pool or extrapolate?

| Option | Description | Selected |
|--------|-------------|----------|
| Real pool over hardwareConcurrency-1 | The figure PERF-03 actually specifies; surfaces coordination overhead | ✓ |
| Single-threaded, extrapolate by core count | Assumes perfect scaling, which is the estimate being replaced | |
| Both, side by side | Publishes observed scaling efficiency | |

### Q15: What generates the ~25,000 synthetic bars?

| Option | Description | Selected |
|--------|-------------|----------|
| Seeded GBM with realistic vol | Deterministic and comparable, shared by both arms | ✓ |
| Seeded random walk, no calibration | Unrealistic magnitudes trip the ruin clamp, changing which branches run | |
| A small hand-checked real slice | Front-runs Phase 2's sourcing with an unversioned file | |

**Area check:** "Next area".

---

## Baseline Hardware Definition

### Q16: What is the "4-core baseline machine"?

| Option | Description | Selected |
|--------|-------------|----------|
| The GitHub Actions runner | 4-vCPU Linux, literally PERF-03's spec; gate machine and baseline collapse into one | ✓ |
| Dev machine throttled to 4 workers | 4 workers on fast cores is not 4 slow vCPUs | |
| Dev machine with a derating factor | The factor is itself an estimate | |

### Q17: How does bench record what it ran on?

| Option | Description | Selected |
|--------|-------------|----------|
| Full environment block in table and JSON | CPU, cores, memory, browser, OS, calibration score, CI flag | ✓ |
| Core count and calibration score only | The bare minimum criterion 1 asks for | |

### Q18: What are the six unmeasurable budgets set to?

| Option | Description | Selected |
|--------|-------------|----------|
| Locked at their perception anchors now | All eight live from day one; relaxation needs a Key Decision | ✓ |
| Lock measured, mark the rest provisional | Honest, but leaves six quietly renegotiable | |
| Measurement plus headroom | Risks ratcheting the budget to whatever was hit | |

### Q19: What triggers PERF-01a escalation?

| Option | Description | Selected |
|--------|-------------|----------|
| Miss the anchor at all | Clean, unambiguous | |
| Miss with less than a stated margin | Conservative; the margin fraction is itself arbitrary | ✓ |
| Miss, plus a tightening plan if it barely passes | Clean trigger without losing the warning | |

### Q19a: What margin?

| Option | Description | Selected |
|--------|-------------|----------|
| 70% of budget | 30% headroom for the real kernel, attribution passes, progressive paint | ✓ |
| 50% of budget | Aggressive; likely to force premature WASM work | |
| 85% of budget | Least protective against accumulation | |

### Q20: Budget file form.

| Option | Description | Selected |
|--------|-------------|----------|
| Typed TS module | Compiler catches malformed entries, harness imports directly | ✓ |
| JSON with a schema | Language-neutral, needs a separate validation step | |

---

## Final Check

| Option | Description | Selected |
|--------|-------------|----------|
| I'm ready for context | Write CONTEXT.md, remaining details are Claude's call | ✓ |
| Explore more gray areas | Offered: the runSweep interface seam, sweep partitioning and the worker boundary, where Key Decisions get written | |

---

## Claude's Discretion

- Sweep partitioning granularity and how results cross the Worker boundary.
- What the calibration reference loop computes and how its score is scaled.
- Whether Phase 1 or Phase 3 establishes the `runSweep()` interface seam.
- The declared cap value for total bench runtime.
- Where the two Key Decisions are physically written, given the GSD-managed Key Decisions table.
- Repository scaffold specifics.

## Deferred Ideas

- A full WASM kernel implementation, conditional on the 70%-of-budget escalation trigger.
- A WebGPU compute path, deferred for v1 on browser-support grounds.
- A charting-library head-to-head benchmark, revisited only if hand-rolled canvas misses budget.
- Trend history of benchmark results over time; the CI artifact is the raw material if wanted.
