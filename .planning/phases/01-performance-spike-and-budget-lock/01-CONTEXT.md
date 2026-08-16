# Phase 1: Performance Spike and Budget Lock - Context

**Gathered:** 2026-08-16
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers measurement infrastructure and two architecture decisions, not product
features. Specifically:

1. A **throwaway spike** that produces real-hardware wall-clock figures for the two things
   research left as napkin math: 10,000 leveraged backtests over ~25,000 synthetic bars, and a
   Canvas 2D repaint of a 10,000-cell grid.
2. Two **Key Decisions** recorded in PROJECT.md, each citing the measured figure that settled it:
   plain JS versus WASM, and hand-rolled Canvas versus a charting library.
3. A **permanent `npm run bench` harness** reporting every metric in PERF-02 through PERF-09.
4. A **budget file** with a numeric threshold per metric, each annotated with its perception
   anchor.
5. A **live CI gate** on GitHub Actions, proven live rather than declared.

This is the first executable phase; the repository currently contains only `.planning/`,
`CLAUDE.md`, and `.claude/`. Standing up the Vite + TypeScript + Vitest project scaffold is
therefore in scope as the substrate the benchmark runs on. Building any product UI, the real
simulation kernel, or the data bundle is **not** in scope; those are Phases 3, 2 and 4.

</domain>

<decisions>
## Implementation Decisions

### Measurement Environment

- **D-01:** CI target is **GitHub Actions, triggered on pull request** (and on push to main).
  This is the authoritative gate.
- **D-02:** **One measurement environment: headless Chromium driven by Playwright**, used
  identically locally and in CI. No Node-side compute benchmark, so there is never a second
  number to reconcile against the one production will actually see. Real Web Workers and a real
  Canvas.
  — **Reversibility:** costly — every recorded figure, the calibration score, and the locked
  budgets are all denominated in this environment. Switching later invalidates the historical
  numbers that the Key Decisions cite.
- **D-03:** Bench harness is **Vitest browser mode** (Playwright-backed), which the stack already
  specifies for testing Worker-bound sweep code. Budget assertions are ordinary `expect` calls,
  so a breach fails CI through the normal test runner with no separate reporting pipeline.
- **D-04:** `npm run bench` emits a **human-readable table to stdout** (columns: metric, measured,
  budget, anchor, verdict) **plus a machine-readable JSON** written to a gitignored path and
  uploaded as a CI artifact. The JSON is **not** committed; results would be machine-dependent
  and would churn the working tree on every run.
- **D-05:** Metrics whose code path does not exist yet print as **UNMEASURED with their budget and
  anchor still shown, and exit 0**. Every PERF-02 through PERF-09 row appears in the table on
  every run. This satisfies criterion 3's "never silently omitted" directly.

### CI Enforcement

- **D-06:** Wall-clock budgets are **calibration-normalized**. Bench first runs a fixed reference
  loop to score the runner's throughput, then divides each measured time by that score before
  comparing against budget. GitHub-hosted runners vary roughly 20-40% run to run; without
  normalization the gate either flakes or has to be loosened by that same factor, which would
  let a real 40% regression through. Gating on the normalized figure keeps a slow runner from
  reddening an innocent PR while still catching genuine regressions.
  — **Reversibility:** costly — the calibration score is baked into every stored figure and every
  locked budget. Removing normalization later means re-deriving all budgets from raw times.
- **D-07:** **Minimum of N=5 repeats** for both the calibration score and each metric. Minimum is
  the right statistic for latency benchmarks because noise only ever adds time. Calibration
  handles a systematically slow runner; repeats handle per-run scheduling jitter.
- **D-08:** Bench **asserts its own total wall-clock against a declared cap and prints its
  runtime**, so repeat cost cannot creep silently as later phases add metrics. Estimated repeat
  cost today is roughly 5-15 seconds against a job overhead of roughly 90-150 seconds.
- **D-09:** Criterion 5's "prove the gate is live" is met by a **permanent CI self-test**: a test
  feeds the budget checker a deliberately over-budget fixture and asserts it exits non-zero with
  the correct message. It runs on every PR forever, so the gate cannot silently rot into a no-op
  once someone refactors the harness.

### Architecture Arms

- **D-10:** The measured path is **plain JS with a real Worker pool over
  `navigator.hardwareConcurrency - 1`**. The spike genuinely partitions the 10,000 cells across
  workers and times wall-clock from user action to final cell, which is the figure PERF-03
  actually specifies. Single-threaded-and-extrapolate was rejected: it assumes perfect scaling
  and zero coordination overhead, which is exactly the estimate this phase exists to replace.
  Measuring for real also surfaces the costs research hand-waved (transfer overhead, partition
  granularity, worker startup).
- **D-11:** The WASM arm is a **throwaway Rust microbenchmark via wasm-pack**, not a full second
  implementation. Rust rather than AssemblyScript because Rust is the actual escalation target
  named in the research, so the measured ratio predicts what escalation would actually buy;
  AssemblyScript's number would be a conservative floor rather than a prediction. There is no
  permanent CI toolchain cost because the toolchain leaves with the code.
- **D-12:** The microbenchmark ports the **real per-bar recurrence including the branchy parts**
  (contribution schedule, ruin clamp with absorbing state, calendar-day financing and expense
  accrual), not a stripped arithmetic loop. A stripped loop is the case where WASM looks best and
  would flatter it relative to the real kernel.
- **D-13:** The Rust code is **deleted at phase end**; a **SPIKE-RESULTS document in the phase
  directory** records the method, the raw numbers, the machine and core count, and reproduction
  steps. The JS-vs-WASM ratio is not one of PERF-02 through PERF-09, so it has no standing reason
  to live in the permanent harness, and a parked arm would bitrot unless CI exercised it.
- **D-14:** The **canvas arm is hand-rolled only. No charting library is benchmarked.** Research
  already rejected each on documented grounds (uPlot has no heatmap mark at all; ECharts and
  Plotly degrade well under 10k cells; Observable Plot defaults to SVG, the specific 10k-cell
  failure mode). The Key Decision cites the measured hand-rolled figure plus those prior findings.
- **D-15:** The canvas measurement covers **both `fillRect`-per-cell and a single `putImageData`
  pass** on the same 10,000-cell grid, settling the internal implementation fork that Phase 6's
  mockups and Phase 7's implementation will otherwise have to guess at. Both are a few lines, so
  the marginal cost is near zero.
- **D-16:** Synthetic input is **seeded geometric Brownian motion** with plausible equity drift
  and volatility, plus a synthetic short-rate series, generating ~25,000 bars. Deterministic
  across machines and runs so figures are comparable, and shared unchanged by the JS and Rust
  arms so the ratio is apples to apples. An uncalibrated random walk was rejected because
  unrealistic magnitudes drive equity to zero and trip the ruin clamp constantly, changing which
  branches execute. Committing a real CSV slice was rejected because it front-runs Phase 2's
  sourcing and provenance work with an unversioned file.

**Rationale for JS-first (recorded because it was actively challenged during discussion):** the
premise that WASM is clearly faster does not hold for this workload. A single backtest is a serial
recurrence (`equity[i]` depends on `equity[i-1]`) so it does not vectorize within a run; SIMD only
helps across cells, and WASM SIMD is 128-bit, meaning f64x2 and therefore 2 lanes rather than 4 or
8, so the headline "2-4x from SIMD" figure does not apply. The branchy parts are SIMD-hostile
regardless. Scalar WASM versus monomorphic `Float64Array` JS is near parity on allocation-free
arithmetic loops. The larger lever by far is the Worker pool (4-8x), and it applies identically to
both. The target is not "as fast as possible" but "under 1000ms on 4 cores", so if JS clears it
with margin, WASM buys nothing perceptible. PERF-01a already lists WASM as an escalation lever
rather than a default, and starting with WASM would decide by estimate, which is the exact thing
this phase exists to stop.

### Baseline Hardware and Budget Locking

- **D-17:** **The GitHub Actions `ubuntu-latest` runner IS the 4-core baseline machine** that
  PERF-03 names. This collapses the gate machine and the baseline machine into one, so there is no
  derating factor to argue about and no approximation to defend. Dev-machine figures are reported
  as a second, informational row.
  — **Reversibility:** costly — PERF-03's headline figure and the escalation decision are both
  denominated against this machine. Changing the baseline means re-measuring and revisiting the
  Key Decisions that cite it.
- **D-18:** Every run stamps a **full environment block** into both the table and the JSON: CPU
  model where available, `hardwareConcurrency`, memory, browser version, OS, calibration score,
  and whether it ran in CI. Criterion 1 requires a machine and core count attached to the numbers;
  this makes an unlabelled figure structurally impossible.
- **D-19:** **All eight budgets (PERF-02 through PERF-09) are locked now at their perception
  anchors**, not just the three this phase can measure. The six that cannot yet be measured are
  live budgets from day one, so the first commit that implements each is already gated. Relaxing
  any of them later requires a Key Decision, which is precisely PERF-01a's rule. Leaving them
  provisional would let six budgets be quietly renegotiated without that friction.
- **D-20:** **Escalation trigger: measured exceeds 70% of budget.** Not an outright miss. Later
  phases add known work on top of the spike (the real kernel's full parameter surface,
  attribution's extra passes, progressive paint), so a barely-passing spike would not survive to
  Phase 7. 70% leaves 30% headroom for those known additions. On trigger, the phase escalates
  deliberately (pool tuning, the WASM ratio from D-11, a coarser default grid) and records the
  choice as a Key Decision, rather than relaxing the budget.
- **D-21:** The budget file is a **typed TypeScript module** (`perf-budgets.ts`) exporting a typed
  record per metric: id, threshold, unit, perception anchor, anchor value, the phase that
  implements it, and an optional relaxation reason. The compiler catches a malformed entry and the
  bench harness imports it directly with no parsing step.

### Claude's Discretion

Not raised during discussion; planner and researcher decide:

- Sweep partitioning granularity and how results cross the Worker boundary (Comlink versus raw
  `postMessage`, transferable buffers).
- Exactly what the calibration reference loop computes, and how its score is scaled.
- What the throwaway spike leaves behind versus what Phase 3 rebuilds. The research recommends a
  stable `runSweep(params)` interface seam; whether Phase 1 establishes that seam or Phase 3 does
  is unresolved.
- The declared cap value for D-08's total bench runtime.
- Where the two Key Decisions are physically written, given PROJECT.md's Key Decisions table is
  GSD-managed.
- Repository scaffold specifics (Vite config, tsconfig strictness, lint setup, package layout).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and scope
- `.planning/REQUIREMENTS.md` §Performance — PERF-01, PERF-01a, PERF-02 through PERF-11 in full.
  PERF-01a carries the locking rule that governs this entire phase.
- `.planning/ROADMAP.md` §"Phase 1: Performance Spike and Budget Lock" — the five success
  criteria this phase is verified against.
- `.planning/ROADMAP.md` §Sequencing Notes — why Phase 1 precedes architecture commitment, and
  why there is no optimization phase.

### Project constraints and prior decisions
- `.planning/PROJECT.md` §Constraints — static-only Cloudflare Pages deploy, off-main-thread
  compute, offline after first load.
- `.planning/PROJECT.md` §Key Decisions — the table the two architecture decisions from criterion
  2 must be appended to.
- `.planning/STATE.md` §Blockers/Concerns — the Phase 1 entry restating the PERF-01a locking rule.

### Technology research (the estimates this phase exists to replace)
- `.claude/CLAUDE.md` §"Q1 — Numerical compute in the browser" — the 150-600ms pooled and 1-3s
  single-threaded estimates, explicitly labelled napkin math, plus the `runSweep()` interface-seam
  recommendation.
- `.claude/CLAUDE.md` §"Q2 — Charting" — the documented grounds on which every charting library
  was rejected for the heatmap. D-14 relies on this rather than re-benchmarking them.
- `.claude/CLAUDE.md` §"Q7 — Testing numerical code" — Vitest browser mode versus mocking
  `postMessage`, which D-03 follows.
- `.claude/CLAUDE.md` §"Version Compatibility" — pinned versions for vite@8.2.1, vitest@4.1.10,
  solid-js@1.9.14.

### Project rules
- `CLAUDE.md` (repo root) — the worktree exception for `.planning/config.json`.
- `.claude/CLAUDE.md` §"GSD Workflow Enforcement" — no direct repo edits outside a GSD workflow.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

None. The repository contains no source code: only `.planning/`, `.claude/`, `CLAUDE.md` and
`.clause/profile`. This phase creates the project scaffold from scratch.

### Established Patterns

No code patterns exist yet. The patterns this phase establishes will constrain every later phase,
so they are worth getting right the first time:

- The `npm run bench` contract (table plus JSON, UNMEASURED rows, environment block) is consumed
  by the success criteria of Phases 2, 3, 4, 6, 7 and 8.
- `perf-budgets.ts` becomes the single place any performance threshold is declared.
- Vitest browser mode as the runner for anything Worker-bound.

### Integration Points

- **Phase 2** reads the decode-cost and memory figures from this phase to constrain the binary
  format, and adds bundle byte size and decode-to-typed-array time to the bench report.
- **Phase 3** adds PERF-02 (single backtest under 16ms) as a measured row, and inherits whichever
  compute architecture this phase's measurement settles on.
- **Phase 6** requires each throwaway heatmap mockup to repaint in under 16ms, gated against the
  budget locked here.
- **Phase 7** fills in PERF-03 through PERF-06 and PERF-09 against the 4-core baseline defined in
  D-17.

</code_context>

<specifics>
## Specific Ideas

- The user pushed back directly on JS-first, asking why a performance-first project would not
  start with the most performant option. The rationale block under Architecture Arms is the
  answer that settled it and should not be silently dropped if a later phase revisits the choice.
- The user raised, unprompted, whether headless Chrome is viable on GitHub PR CI. It is routine
  (`ubuntu-latest` ships Chrome; `npx playwright install --with-deps chromium` is roughly 60-90s
  cold and caches). The genuine risk is runner variance, which D-06 and D-07 address.
- The user asked how much N=5 repeats costs in CI wall-clock. The answer that satisfied it:
  roughly 5-15 seconds of repeat cost against roughly 90-150 seconds of fixed job overhead. D-08
  exists specifically to keep that ratio from drifting as metrics accumulate.
- The user was concerned the throwaway WASM microbenchmark would become permanent maintenance.
  D-13 resolves this: code deleted, numbers preserved in a spike report.

</specifics>

<deferred>
## Deferred Ideas

- **Building a full WASM kernel implementation.** Deferred to a conditional escalation, triggered
  by D-20's 70%-of-budget rule, and only after the Rust microbenchmark ratio is in hand. Owning
  phase depends on where the trigger fires (Phase 1 if the spike misses, otherwise Phase 7).
- **WebGPU compute path.** Research defers this for v1 on browser-support grounds (Firefox ships
  it disabled by default). Revisit only if sweep size grows an order of magnitude.
- **Charting-library head-to-head benchmark.** Rejected here on the grounds that research already
  documents each library's disqualification; revisit only if the hand-rolled canvas misses budget.
- **Trend history of benchmark results over time.** D-04 deliberately keeps the JSON uncommitted to
  avoid machine-dependent churn. If trend tracking becomes valuable, the CI artifact is the raw
  material for it.

</deferred>

---

*Phase: 1-Performance Spike and Budget Lock*
*Context gathered: 2026-08-16*
