# Phase 1: Performance Spike and Budget Lock - Research

**Researched:** 2026-08-16
**Domain:** Browser performance benchmarking infrastructure (Vitest browser mode + Playwright), CI budget gating, throwaway Rust→WASM microbenchmarking, Web Worker pooling, Canvas 2D repaint measurement
**Confidence:** MEDIUM (stack versions and registry facts VERIFIED; GitHub-hosted runner spec CITED against official docs; harness-design patterns are WebSearch-sourced, single-source in places, and flagged LOW where not cross-checked — Context7 MCP tools were unavailable in this session, see Sources)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Measurement Environment**
- **D-01:** CI target is GitHub Actions, triggered on pull request (and on push to main). This is the authoritative gate.
- **D-02:** One measurement environment: headless Chromium driven by Playwright, used identically locally and in CI. No Node-side compute benchmark. Real Web Workers and a real Canvas. Reversibility: costly.
- **D-03:** Bench harness is Vitest browser mode (Playwright-backed). Budget assertions are ordinary `expect` calls, so a breach fails CI through the normal test runner with no separate reporting pipeline.
- **D-04:** `npm run bench` emits a human-readable table to stdout (columns: metric, measured, budget, anchor, verdict) plus a machine-readable JSON written to a gitignored path and uploaded as a CI artifact. The JSON is not committed.
- **D-05:** Metrics whose code path does not exist yet print as UNMEASURED with their budget and anchor still shown, and exit 0. Every PERF-02 through PERF-09 row appears on every run.

**CI Enforcement**
- **D-06:** Wall-clock budgets are calibration-normalized. Bench first runs a fixed reference loop to score the runner's throughput, then divides each measured time by that score before comparing against budget. Reversibility: costly.
- **D-07:** Minimum of N=5 repeats for both the calibration score and each metric; use the minimum.
- **D-08:** Bench asserts its own total wall-clock against a declared cap and prints its runtime. Estimated repeat cost today is roughly 5-15 seconds against a job overhead of roughly 90-150 seconds.
- **D-09:** Criterion 5's "prove the gate is live" is met by a permanent CI self-test: a test feeds the budget checker a deliberately over-budget fixture and asserts it exits non-zero with the correct message. Runs on every PR forever.

**Architecture Arms**
- **D-10:** The measured path is plain JS with a real Worker pool over `navigator.hardwareConcurrency - 1`. The spike genuinely partitions the 10,000 cells across workers and times wall-clock from user action to final cell.
- **D-11:** The WASM arm is a throwaway Rust microbenchmark via wasm-pack, not a full second implementation. Rust rather than AssemblyScript because Rust is the actual escalation target named in the research. No permanent CI toolchain cost.
- **D-12:** The microbenchmark ports the real per-bar recurrence including the branchy parts (contribution schedule, ruin clamp with absorbing state, calendar-day financing and expense accrual), not a stripped arithmetic loop.
- **D-13:** The Rust code is deleted at phase end; a SPIKE-RESULTS document in the phase directory records the method, the raw numbers, the machine and core count, and reproduction steps.
- **D-14:** The canvas arm is hand-rolled only. No charting library is benchmarked.
- **D-15:** The canvas measurement covers both `fillRect`-per-cell and a single `putImageData` pass on the same 10,000-cell grid.
- **D-16:** Synthetic input is seeded geometric Brownian motion with plausible equity drift and volatility, plus a synthetic short-rate series, generating ~25,000 bars. Deterministic across machines and runs, shared unchanged by the JS and Rust arms.

**Rationale for JS-first (actively challenged during discussion, recorded verbatim):** the premise that WASM is clearly faster does not hold for this workload. A single backtest is a serial recurrence (`equity[i]` depends on `equity[i-1]`) so it does not vectorize within a run; SIMD only helps across cells, and WASM SIMD is 128-bit, meaning f64x2 and therefore 2 lanes rather than 4 or 8, so the headline "2-4x from SIMD" figure does not apply. The branchy parts are SIMD-hostile regardless. Scalar WASM versus monomorphic `Float64Array` JS is near parity on allocation-free arithmetic loops. The larger lever by far is the Worker pool (4-8x), and it applies identically to both. The target is not "as fast as possible" but "under 1000ms on 4 cores," so if JS clears it with margin, WASM buys nothing perceptible.

**Baseline Hardware and Budget Locking**
- **D-17:** The GitHub Actions `ubuntu-latest` runner IS the 4-core baseline machine that PERF-03 names. Dev-machine figures are reported as a second, informational row. Reversibility: costly.
- **D-18:** Every run stamps a full environment block into both the table and the JSON: CPU model where available, `hardwareConcurrency`, memory, browser version, OS, calibration score, and whether it ran in CI.
- **D-19:** All eight budgets (PERF-02 through PERF-09) are locked now at their perception anchors, not just the three this phase can measure.
- **D-20:** Escalation trigger: measured exceeds 70% of budget. 30% headroom for known future additions. On trigger, the phase escalates deliberately and records the choice as a Key Decision, rather than relaxing the budget.
- **D-21:** The budget file is a typed TypeScript module (`perf-budgets.ts`) exporting a typed record per metric: id, threshold, unit, perception anchor, anchor value, the phase that implements it, and an optional relaxation reason.

### Claude's Discretion

- Sweep partitioning granularity and how results cross the Worker boundary (Comlink versus raw `postMessage`, transferable buffers).
- Exactly what the calibration reference loop computes, and how its score is scaled.
- What the throwaway spike leaves behind versus what Phase 3 rebuilds (the `runSweep(params)` interface seam — whether Phase 1 or Phase 3 establishes it is unresolved).
- The declared cap value for D-08's total bench runtime.
- Where the two Key Decisions are physically written, given PROJECT.md's Key Decisions table is GSD-managed.
- Repository scaffold specifics (Vite config, tsconfig strictness, lint setup, package layout).

### Deferred Ideas (OUT OF SCOPE)

- Building a full WASM kernel implementation. Deferred to a conditional escalation, triggered by D-20's 70%-of-budget rule.
- WebGPU compute path. Deferred for v1 on browser-support grounds.
- Charting-library head-to-head benchmark. Rejected on the grounds that research already documents each library's disqualification.
- Trend history of benchmark results over time. D-04 deliberately keeps the JSON uncommitted to avoid machine-dependent churn.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| PERF-01 | A performance budget file defines numeric thresholds for every metric in PERF-02 through PERF-09, and CI fails the build when a measured value exceeds its budget | `perf-budgets.ts` typed-module pattern (Architecture Patterns, Pattern 3); Vitest `expect` as the gate mechanism (D-03, Pattern 1); D-09 self-test pattern (Common Pitfalls, "gate rot") |
| PERF-01a | Thresholds are provisional until the spike measures what is achievable; locked to perception anchors; unreachable targets escalate rather than relax | `perf-budgets.ts` schema carries `anchorMs`/`relaxationReason` fields (Pattern 3); Key Decision recording pattern (Architecture Patterns) |
| PERF-10 | A benchmark suite runnable locally with one command (`npm run bench`) reports all PERF metrics | `npm run bench` = `vitest bench run` invocation wrapping browser-mode Vitest project (Pattern 1); UNMEASURED-row pattern (Pattern 4) |
| PERF-11 | Performance is measured on real hardware from the first executable phase onward; build order places measurement before architecture commitment | GitHub Actions `ubuntu-latest` = 4-core baseline (VERIFIED, Environment Availability); calibration-normalization pattern (Pattern 2); environment-block stamping (Pattern 5) |
</phase_requirements>

## Summary

This phase builds no product code — it builds the measurement substrate every later phase is graded against. Four things need to come together: (1) a Vitest **browser-mode** project (Playwright-driven, real Chromium, real Workers, real Canvas) that doubles as both a test runner and a benchmark runner via ordinary `expect` calls; (2) a **calibration-normalized, N=5-minimum** timing methodology that survives GitHub-hosted-runner noise without either flaking or being loosened past a genuine regression's signal; (3) a throwaway **Rust→WASM microbenchmark** built with `wasm-pack`/`wasm-bindgen`, deliberately never wired into the app or CI, whose only output is a ratio recorded in a spike-results document; and (4) a **typed TypeScript budget file** (`perf-budgets.ts`) that is both the source of truth CI imports and the thing the plain-language perception-anchor rule (PERF-01a) is checked against.

Every package this phase needs (`vitest@4.1.10`, `@vitest/browser-playwright@4.1.10`, `playwright@1.62.1`, `comlink@4.4.2`) is current on the npm registry as of this research pass and matches (or exceeds) the versions already pinned in `.claude/CLAUDE.md`. The one genuine environment gap found during this research: **no Rust/cargo/wasm-pack toolchain exists in the researched sandbox** — the plan must either install it as a setup step or explicitly gate the D-11 WASM-microbenchmark task behind a `checkpoint:human-verify` for local toolchain availability, since `wasm-pack`'s own npm wrapper fetches a platform binary from GitHub releases at install time and should NOT be added as a project `devDependency` given D-13 (the Rust code, and therefore its toolchain, is deleted at phase end).

**Primary recommendation:** Scaffold a single Vitest browser-mode project (`@vitest/browser-playwright`, Chromium instance) that hosts both correctness tests and `bench.*.test.ts` benchmark files; gate CI on that same `vitest run` invocation so a budget breach is an ordinary failing assertion, not a second pipeline; keep the Rust/WASM arm entirely outside `package.json` (install `wasm-pack` via `rustup`/`cargo install`, not `npm install`) so nothing lingers after D-13's deletion.

## Architectural Responsibility Map

This project has no backend, no SSR, and no database (per `PROJECT.md` §Constraints) — the tier table below is deliberately sparse; most rows are N/A by design, not by oversight.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Sweep hot-loop compute (JS Worker pool + throwaway WASM arm) | Browser / Client | — | Runs inside real Web Workers in headless Chromium; no server-side compute exists or is permitted (Worker CPU limits make server-side sweep impossible per `PROJECT.md`) |
| Canvas 2D heatmap repaint (`fillRect` / `putImageData`) | Browser / Client | — | Rendering happens in-browser via the Canvas 2D API; no server-rendered image path exists |
| Benchmark harness (`npm run bench`, Vitest browser mode) | Build / Tooling (dev-time, not a runtime tier) | Browser / Client | Executes at CI/dev time via Playwright, but the thing it measures — Worker pool + Canvas — is genuinely the Browser/Client tier; this is the harness driving that tier, not a tier itself |
| Budget file (`perf-budgets.ts`) | Build / Tooling | — | Compile-time TS module; imported by the harness at dev/CI time, not shipped to the browser bundle unless a later phase chooses to surface budgets in-app |
| CI budget gate (GitHub Actions) | Build / Tooling | — | Runs on GitHub-hosted `ubuntu-latest`; not part of the deployed app in any tier |
| Static deployment output | CDN / Static | — | Cloudflare Pages serves the built static assets; this phase produces no deployable app artifact yet (Phase 4 is the first shippable slice), but the eventual target tier is confirmed here for the planner's benefit |

**Explicitly N/A for this project:** Frontend Server (SSR) — none; API/Backend — none (`PROJECT.md` §Out of Scope: "D1 or any backend database"); Database/Storage — none. A plan that introduces any of these tiers for this phase is out of scope and should be flagged by the plan-checker.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| vitest | 4.1.10 [VERIFIED: npm registry, `npm view vitest version` → `4.1.10`, published 2026-07-06] | Test runner + benchmark runner | Already the project's pinned test runner (`.claude/CLAUDE.md` §Version Compatibility); D-03 requires the bench harness to be Vitest browser mode specifically so budget assertions are ordinary `expect` calls |
| @vitest/browser-playwright | 4.1.10 [VERIFIED: npm registry, `npm view @vitest/browser-playwright version` → `4.1.10`] | Playwright provider for Vitest browser mode | Vitest 4.x split the Playwright provider into its own package; this is the exact package the browser-mode config imports (`import { playwright } from '@vitest/browser-playwright'`) [CITED: vitest.dev/guide/browser/ — WebFetch retrieved 2026-08-16] |
| playwright | 1.62.1 [VERIFIED: npm registry, `npm view playwright version` → `1.62.1`, package created 2015-01-23] | Drives headless Chromium locally and in CI | D-02 locks headless Chromium via Playwright as the single measurement environment; `ubuntu-latest` ships the OS libraries `--with-deps` needs [CITED: multiple CI-caching writeups, WebSearch 2026-08-16] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| comlink | 4.4.2 [VERIFIED: npm registry] | Worker RPC wrapper | Already pinned in `.claude/CLAUDE.md`; `Comlink.transfer(buffer, [buffer])` marks an `ArrayBuffer` as transferable so `postMessage` moves ownership rather than structured-cloning it — relevant to D-10's Worker pool and to F3 in `.planning/research/PITFALLS.md` (structured-clone cost) [CITED: WebSearch of Comlink README/GitHub, 2026-08-16, LOW-confidence single-pass, not cross-checked against the primary GitHub README text directly] |
| wasm-bindgen | latest via `cargo add wasm-bindgen` in the throwaway crate, not an npm package | Rust↔JS glue for the D-11 microbenchmark | Only needed inside the throwaway Rust crate; do not add to the JS `package.json` at all |
| @vitest/web-worker | 4.1.10 [VERIFIED: npm registry] | Vitest's Node-mode Worker test helper | **Not needed** given D-02 — this phase measures Workers inside real Playwright-driven Chromium, not via Vitest's Node-side Worker polyfill. Listed here only to flag that `.claude/CLAUDE.md`'s mention of it does not apply to this phase's harness; keep it in mind for later phases that may still want fast Node-side Worker unit tests separate from the slower browser-mode bench runs |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vitest's built-in `bench()` (Tinybench-powered) | Hand-rolled `performance.now()` timing loop with manual min-of-N | D-06/D-07 require **calibration-normalized, minimum-of-N=5** timing, a project-specific statistic Tinybench's default `bench()` does not compute out of the box (Tinybench reports mean/p75/p99, not a calibration-adjusted minimum) [CITED: WebSearch, 2026-08-16, MEDIUM — cross-checked description of Tinybench's role as Vitest's benchmark engine against `main.vitest.dev/guide/benchmarking.html` search result]. Recommendation: use ordinary `test()`/`expect()` blocks with a hand-rolled min-of-N-repeats helper, not `bench()`, so the calibration-normalized value is what gets asserted against the budget — this keeps D-03's "budget assertions are ordinary `expect` calls" literally true, which `bench()`'s separate reporting format would not |
| Cachegrind-style instruction counting for CI noise reduction | Wall-clock + calibration normalization (D-06) | A well-documented technique (pythonspeed.com) for eliminating CI timing noise almost entirely, but it counts CPU instructions, not wall-clock browser-Worker-and-Canvas behavior — it cannot observe what D-02 requires be measured (real Worker scheduling, real Canvas repaint), so it is not applicable here despite being the more rigorous general CI-benchmarking technique [CITED: pythonspeed.com/articles/consistent-benchmarking-in-ci/, WebFetch 2026-08-16] |
| AssemblyScript for the WASM arm | Rust via wasm-pack (D-11, already locked) | Already decided against during discussion (Q12) — noted here only for completeness |

**Installation:**
```bash
npm install --save-dev vitest@4.1.10 @vitest/browser-playwright@4.1.10 playwright@1.62.1
npm install comlink@4.4.2
npx playwright install --with-deps chromium
```

The Rust/WASM toolchain for D-11 is installed **outside npm**, via `rustup` (`rustup target add wasm32-unknown-unknown`) and `cargo install wasm-pack` or the official `wasm-pack` shell installer — never `npm install -g wasm-pack` / never as a `package.json` `devDependency` — so nothing in the JS dependency tree needs to be reverted when the Rust code is deleted per D-13.

**Version verification:** all four npm packages above confirmed via `npm view <pkg> version` against the live registry on 2026-08-16; `playwright`'s package-creation date (`npm view playwright time --json` → `created: 2015-01-23T20:49:28.632Z`) was checked specifically because the package-legitimacy seam flagged it `SUS` (see Package Legitimacy Audit) — this is a false positive from the seam checking latest-version publish recency, not package age.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|--------------|---------|--------------|
| vitest | npm | published 2026-07-06 (latest); long-running project | 89.7M/wk | github.com/vitest-dev/vitest | OK | Approved |
| @vitest/browser-playwright | npm | published 2026-07-06 (latest, same monorepo release train as vitest) | 6.3M/wk | github.com/vitest-dev/vitest | OK | Approved |
| playwright | npm | **package created 2015-01-23** (11 yrs); latest version published 2026-07-30 | 80.1M/wk | github.com/microsoft/playwright | **SUS** (seam reason: `too-new`) — **false positive** [VERIFIED: `npm view playwright time --json` → `created: 2015-01-23...`, `modified: 2026-08-15...`, run this session] | **Approved — false positive documented.** The seam's `too-new` heuristic reads the most recent version's publish timestamp, not the package's first-publish date; Playwright is an 11-year-old, 80M-weekly-download, Microsoft-owned official package. No `checkpoint:human-verify` needed. |
| comlink | npm | published 2024-11-07 (latest) | 2.5M/wk | github.com/GoogleChromeLabs/comlink | OK | Approved |
| wasm-pack (npm wrapper) | npm | published 2026-05-15 (latest) | 74K/wk | github.com/wasm-bindgen/wasm-pack | OK (seam) — **manually flagged** per postinstall protocol | **Do not add as an npm dependency at all.** [VERIFIED: unpacked `wasm-pack@0.15.0` tarball this session] its `postinstall` (`node ./install.js` → `binary.js`) downloads a platform binary from `github.com/wasm-bindgen/wasm-pack/releases` at install time — expected behavior for this class of npm-wrapped-CLI package (same pattern as `esbuild`), not malicious, but unnecessary risk/churn for a tool D-13 deletes at phase end. Install via `rustup`/`cargo install wasm-pack` or the official shell installer instead, entirely outside `package.json`. |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `playwright` (false positive, documented above — no action needed) and `wasm-pack` (manually flagged for its postinstall network fetch — mitigated by not installing it via npm at all, so this is a documented design decision, not an open checkpoint).

## Architecture Patterns

### System Architecture Diagram

```
 Developer / CI trigger (PR or push to main)
        │
        ▼
 ┌────────────────────────────────────────────────────────────┐
 │  npm run bench   (== vitest run --project bench, browser)   │
 │                                                              │
 │  1. Calibration pass: run fixed reference loop N=5×,        │
 │     take min → calibrationScore                             │
 │              │                                               │
 │              ▼                                               │
 │  2. For each measurable metric (PERF-02..09 that exist):    │
 │       run N=5×, take min raw time                            │
 │       normalizedTime = rawTime / calibrationScore            │
 │              │                                               │
 │              ▼                                               │
 │  3. expect(normalizedTime).toBeLessThan(budget)  ◄── ordinary│
 │       (budget read from perf-budgets.ts)              Vitest │
 │              │                                          assert│
 │              ▼                                               │
 │  4. Metrics with no implementation yet → print UNMEASURED,  │
 │     budget + anchor still shown, no assertion run, exit 0    │
 │              │                                               │
 │              ▼                                               │
 │  5. Emit: stdout table (metric | measured | budget | anchor  │
 │     | verdict) + environment block (CPU, cores, mem, browser,│
 │     OS, calibration score, CI flag)                          │
 │              │                                               │
 │              ▼                                               │
 │  6. Write JSON to gitignored path → uploaded as CI artifact  │
 └────────────────────────────────────────────────────────────┘
        │
        ▼
 Any failing expect() → vitest exits non-zero → GitHub Actions
 job fails → PR shows red check (D-01, D-03)

 Separate, permanent path (D-09 self-test):
 ┌────────────────────────────────────────────────────────────┐
 │ perf-budgets.selftest.test.ts                                │
 │  feed budget-checker fn a synthetic over-budget fixture       │
 │  expect(checkBudget(fixture)).toHaveFailed()                  │
 │  proves the gate mechanism itself is live, every PR, forever  │
 └────────────────────────────────────────────────────────────┘

 Throwaway, out-of-band (D-11..D-13, never touches CI):
 ┌────────────────────────────────────────────────────────────┐
 │ spike/wasm-microbench/  (Rust crate, cargo + wasm-pack)       │
 │  same GBM-seeded 25k-bar input as the JS arm (D-16)           │
 │  same branchy per-bar recurrence as the real kernel (D-12)    │
 │  run locally → record ratio → delete crate → write            │
 │  01-SPIKE-RESULTS.md with method, raw numbers, machine, repro │
 └────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
/
├── package.json
├── vite.config.ts                    # app build config (Solid.js, per .claude/CLAUDE.md)
├── vitest.config.ts                  # or a workspace: unit-tests project + bench (browser) project
├── perf-budgets.ts                   # D-21: typed budget module, single source of truth
├── src/
│   └── (empty this phase — no product code yet)
├── bench/
│   ├── sweep.worker-pool.bench.test.ts   # D-10: real Worker pool sweep, browser-mode test
│   ├── canvas.repaint.bench.test.ts      # D-14/D-15: fillRect + putImageData arms
│   ├── calibration.ts                    # Claude's-discretion: reference loop + scoring
│   ├── environment-block.ts              # D-18: CPU/cores/mem/browser/OS/CI stamping
│   ├── report.ts                         # D-04: stdout table + JSON writer
│   └── synthetic-data.ts                 # D-16: seeded GBM generator, shared by JS + Rust arms
├── tests/
│   └── perf-budgets.selftest.test.ts     # D-09: permanent CI-liveness self-test
├── spike/
│   └── wasm-microbench/                  # D-11..D-13: throwaway Rust crate, deleted at phase end
│       ├── Cargo.toml
│       └── src/lib.rs
├── .github/workflows/
│   └── ci.yml                            # D-01: GitHub Actions, PR + push-to-main triggers
└── .planning/phases/01-performance-spike-and-budget-lock/
    └── 01-SPIKE-RESULTS.md               # D-13: method, raw numbers, machine, repro steps
```

### Pattern 1: Budget assertions as ordinary Vitest `expect` calls (D-03)

**What:** Rather than a bespoke pass/fail reporter, every budget check is a normal Vitest test that calls `expect(normalizedMeasurement).toBeLessThan(budget.thresholdMs)`. A failing budget is therefore a failing test, and CI already knows how to turn a failing test into a red check with zero extra plumbing.

**When to use:** Every PERF-02 through PERF-09 row that has a measurable implementation.

**Example (illustrative, not sourced from a fetched code sample — synthesizes D-03 + D-21 + Pattern 3's schema):**
```typescript
// bench/canvas.repaint.bench.test.ts
import { test, expect } from 'vitest'
import { budgets } from '../perf-budgets'
import { measureMinOfN } from './calibration'
import { repaintFillRect, repaintPutImageData } from '../src/heatmap/canvas'

test('PERF-09 canvas repaint (fillRect arm) stays under budget', async () => {
  const rawMs = await measureMinOfN(5, () => repaintFillRect(200, 50))
  const normalizedMs = rawMs / (await calibrationScore())
  expect(normalizedMs).toBeLessThan(budgets['PERF-09'].thresholdMs)
})
```

### Pattern 2: Calibration-normalized timing (D-06)

**What:** Before comparing any measured time to a budget, divide it by a score derived from a fixed reference workload run in the same process/browser instance. This absorbs the ~20-40% run-to-run throughput variance GitHub-hosted runners exhibit [CITED: user-supplied figure from CONTEXT.md D-06, corroborated generically by pythonspeed.com's characterization of CI noise, WebFetch 2026-08-16] without loosening the budget by that same factor for everyone.

**When to use:** Every timed metric, always, including the calibration loop's own repeats (D-07).

**Recommended shape (Claude's discretion per CONTEXT.md — this is a proposal, not a locked decision):** the reference loop should be a fixed-iteration-count, allocation-free `Float64Array` arithmetic loop structurally similar to the real kernel's hot path (per F1/F2 in `.planning/research/PITFALLS.md` — monomorphic, no boxed values), so its score tracks the same kind of throughput the sweep benchmark itself depends on, rather than an unrelated micro-benchmark (e.g., string concatenation) whose score could diverge from the sweep's actual bottleneck.

### Pattern 3: Typed budget module (D-21)

**What:** `perf-budgets.ts` exports a `Record<string, PerfBudget>` where `PerfBudget` has (at minimum): `id`, `thresholdMs`, `unit`, `anchorMs` (16/100/1000), `anchorLabel` (one frame / feels instant / holds attention), `implementedInPhase`, and an optional `relaxationReason`. TypeScript's structural typing catches a malformed entry (missing field, wrong type) at compile time, and both the harness and any future in-app "why this budget" surface import the same module with no parsing step.

**Example schema (illustrative — synthesizes D-21's field list; not copied from a fetched source):**
```typescript
// perf-budgets.ts
export interface PerfBudget {
  id: string                 // 'PERF-02' .. 'PERF-09'
  description: string
  thresholdMs: number
  anchorMs: 16 | 100 | 1000
  anchorLabel: 'one frame' | 'feels instant' | 'holds attention'
  implementedInPhase: number
  relaxationReason?: string  // required (by convention, not the type system) whenever thresholdMs > anchorMs
}

export const budgets: Record<string, PerfBudget> = {
  'PERF-02': { id: 'PERF-02', description: 'single backtest over ~25k bars', thresholdMs: 16, anchorMs: 16, anchorLabel: 'one frame', implementedInPhase: 3 },
  'PERF-03': { id: 'PERF-03', description: '10,000-cell sweep, 4-core baseline', thresholdMs: 1000, anchorMs: 1000, anchorLabel: 'holds attention', implementedInPhase: 1 },
  // ... PERF-04 through PERF-09, all eight present per D-19
}
```

### Pattern 4: UNMEASURED rows for not-yet-built paths (D-05)

**What:** The report generator iterates the full `budgets` record (all eight entries, always), and for each one either (a) runs the measurement and asserts it, or (b) if the corresponding code path doesn't exist yet, prints `UNMEASURED` with the budget and anchor still visible and takes no assertion action (implicit pass, exit 0 for that row). This is a lookup against a manifest of "which PERF ids does this phase's code implement," not a try/catch around a missing function.

**Anti-pattern to avoid:** Wrapping the measurement call in try/catch and printing UNMEASURED on any thrown error. That silently converts a real bug (the code exists but crashes) into a false UNMEASURED, defeating D-05's "never silently omitted" intent. The manifest of which rows are measurable this phase should be an explicit, hand-maintained list (or derived from `implementedInPhase <= currentPhase`), not inferred from whether a call happened to throw.

### Pattern 5: Full environment block stamping (D-18)

**What:** Every bench run captures and prints: `navigator.hardwareConcurrency`, `navigator.userAgent` (browser version), available memory where the browser exposes it, OS (from Playwright's `browser.version()`/CI env), the calibration score itself, and a `process.env.CI` boolean. This block is written once per run and included in both the stdout table's header and the JSON artifact's top-level object — never per-metric, since it's constant for the whole run.

**Example (illustrative, browser-mode `expect`-adjacent context has `navigator` available directly):**
```typescript
// bench/environment-block.ts
export function captureEnvironment() {
  return {
    hardwareConcurrency: navigator.hardwareConcurrency,
    userAgent: navigator.userAgent,
    ci: typeof process !== 'undefined' && process.env.CI === 'true',
    timestamp: new Date().toISOString(),
  }
}
```

### Anti-Patterns to Avoid

- **Using `vitest bench()`/Tinybench for the budget-gating metrics:** `bench()` produces its own report format (mean, p75, p99) separate from the ordinary test pass/fail stream; D-03 specifically wants budget breaches to be ordinary `expect` failures so there's one failure surface, not two. Reserve `bench()`, if used at all, for exploratory local profiling, not for the CI gate.
- **A single monolithic `postMessage` transfer of the full sweep result grid:** per F3 in `.planning/research/PITFALLS.md`, structured-cloning (rather than transferring) a large result buffer from Worker to main thread causes a visible stall exactly at sweep-completion — use `Comlink.transfer()` / the `transfer` list on `postMessage`, not a bare object payload.
- **Adding `wasm-pack` (or Rust/cargo) to `package.json`/CI:** defeats D-11/D-13's entire "no permanent toolchain cost" premise. Keep it a local, manually-invoked, deleted-at-phase-end crate.
- **Deriving the manifest of "which PERF ids are measurable this phase" from a try/catch around the measurement call:** see Pattern 4's anti-pattern note above — this converts real crashes into false UNMEASUREDs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Driving headless Chromium from tests, restarting/reusing browser instances, handling `navigator`/DOM/Worker availability inside the test context | A custom Playwright-launch wrapper around raw Vitest (Node mode) | Vitest **browser mode** (`@vitest/browser-playwright`) | This is precisely what D-03 already specifies and what the package is purpose-built for; browser mode gives Web Workers, Canvas, and `navigator` "out of the box" [CITED: WebSearch summary of vitest.dev/guide/browser/, 2026-08-16] with no polyfilling |
| Cross-worker RPC, marking buffers transferable, promise-ifying `postMessage` | Hand-rolled `postMessage`/`onmessage` protocol with manual message IDs | Comlink (`expose`/`wrap`/`transfer`) | `.claude/CLAUDE.md` §Q1/Supporting Libraries already names this rationale: avoids boilerplate bugs at the worker boundary; `Comlink.transfer()` covers the exact `ArrayBuffer`-ownership-transfer need from F3 in PITFALLS.md |
| Statistical noise reduction for CI timing | A bespoke outlier-rejection/percentile scheme | Minimum-of-N (D-07) + calibration normalization (D-06), both already locked as this project's chosen statistic | Minimum is the theoretically correct statistic for latency benchmarks (noise only ever adds time, never subtracts) — already the reasoning recorded in CONTEXT.md D-07; no need to invent something more elaborate (e.g., trimmed mean, percentile bands) for a project-internal gate |
| Rust↔JS type marshalling, memory management across the WASM boundary | Manual `WebAssembly.instantiate` + raw linear-memory pointer arithmetic | `wasm-bindgen` (via `wasm-pack build`) | This is exactly the tool's purpose — generates the JS wrapper, type conversions, and `.d.ts` automatically [CITED: WebSearch summary of rustwasm.github.io/docs/wasm-bindgen/, 2026-08-16] |

**Key insight:** every "don't hand-roll" item above already has a project-level decision behind it (either in CONTEXT.md's locked decisions or in `.claude/CLAUDE.md`'s prior stack research) — this phase's job is wiring, not re-litigating tool choice.

## Common Pitfalls

### Pitfall 1: Calibration loop drifts from what it's supposed to normalize

**What goes wrong:** If the reference loop measures something structurally unlike the sweep hot-loop (e.g., string operations, DOM manipulation, or a trivial no-op loop the JIT optimizes away entirely), its score can diverge from the runner's actual throughput on the workload that matters, silently reintroducing the noise D-06 exists to remove.

**Why it happens:** A "generic" calibration benchmark is easier to write than one that mirrors the real workload's characteristics (monomorphic `Float64Array` arithmetic, per F1/F2 in PITFALLS.md).

**How to avoid:** Make the calibration loop a fixed-iteration, allocation-free `Float64Array` arithmetic loop — not necessarily the kernel itself, but structurally similar (see Pattern 2). Confirm the JIT isn't dead-code-eliminating the loop by summing into a value that's actually read/returned.

**Warning signs:** Calibration score is suspiciously identical across runs that should have different runner throughput (e.g., a run known to be on a busier/shared host reports the same score as an idle one) — likely means V8 optimized the loop away or it's too fast to be measured accurately (measure something with enough total iterations that N=5 repeats each take multiple milliseconds).

### Pitfall 2: `try/catch`-derived UNMEASURED masks real bugs

Already covered as the Pattern 4 anti-pattern above — repeated here because it directly threatens PERF-01a's "never silently omitted" success criterion if built the easy way.

### Pitfall 3: Bench harness self-timing creep (D-08)

**What goes wrong:** As later phases (2, 3, 4, 6, 7) add rows to the bench report per the Integration Points in CONTEXT.md's `<code_context>`, the total N=5-repeat cost accumulates unnoticed until CI jobs are meaningfully slower.

**Why it happens:** Each individual addition looks cheap (D-08's own estimate: 5-15s total for this phase's three arms), so no single PR "feels" like it crossed a threshold.

**How to avoid:** D-08 already specifies the harness assert its own total wall-clock against a declared cap and print its runtime every run — implement this as a final assertion in the bench suite itself (`expect(totalBenchMs).toBeLessThan(declaredCapMs)`), not as a separate script, so it's exercised identically to every other budget.

**Warning signs:** The declared cap value creeping upward in successive PRs without an accompanying Key Decision explaining why (mirrors D-19/D-20's discipline for the perf budgets themselves).

### Pitfall 4: Structured-clone stall at sweep completion (carried from F3, PITFALLS.md)

Already documented in `.planning/research/PITFALLS.md` §F3 — restated here because this phase's D-10 Worker-pool spike is the first place it can actually be measured (or missed). If the spike's own result-collection code passes the final grid back via a bare object rather than a transferred buffer, the measured PERF-03 figure will include a stall the production implementation (Phase 7) may or may not reproduce depending on whether Phase 7 copies this phase's pattern — get it right here so the number this phase locks in is representative.

### Pitfall 5: `playwright` npm package flagged by naive supply-chain heuristics

**What goes wrong:** Automated legitimacy checks (including this project's own `package-legitimacy` seam, see Package Legitimacy Audit above) can flag `playwright` as `too-new`/suspicious because its *latest version* was published very recently — this is true of nearly every actively maintained package and is not itself a signal of anything.

**How to avoid:** Check package *creation* date (`npm view <pkg> time --json` → `.created`), not latest-version publish date, before treating a "too-new" verdict as real. Document the check (as done in this file) so it isn't re-litigated by a future audit pass.

## Code Examples

### Vitest browser-mode config with the Playwright provider

```typescript
// Source: WebFetch of vitest.dev/guide/browser/, 2026-08-16 [CITED]
import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  test: {
    browser: {
      provider: playwright(),
      enabled: true,
      instances: [
        { browser: 'chromium' },
      ],
      headless: true,
    },
  },
})
```

### Comlink expose/wrap/transfer for the Worker pool

```typescript
// Source: WebSearch summary of Comlink README/GitHub, 2026-08-16 [CITED, LOW — single-pass, not independently re-fetched from the primary README this session]

// sweep.worker.ts
import * as Comlink from 'comlink'

const api = {
  runChunk(buffer: ArrayBuffer, startIdx: number, endIdx: number): ArrayBuffer {
    // ... compute into a Float64Array view of buffer ...
    return buffer
  },
}
Comlink.expose(api)

// main thread
import * as Comlink from 'comlink'
const worker = new Worker(new URL('./sweep.worker.ts', import.meta.url), { type: 'module' })
const remote = Comlink.wrap<typeof api>(worker)

const resultBuffer = new Float64Array(10_000).buffer
const returned = await remote.runChunk(
  Comlink.transfer(resultBuffer, [resultBuffer]),
  0,
  10_000,
)
```

### GitHub Actions Playwright install with caching

```yaml
# Source: WebSearch synthesis of multiple community writeups (jbranchaud/til, playwrightsolutions.com,
# qaskills.sh), 2026-08-16 [CITED, LOW — no single official Playwright doc page fetched directly for
# this exact snippet; cross-checked across 3 independent community sources describing the same pattern]
- uses: actions/cache@v4
  id: playwright-cache
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
- if: steps.playwright-cache.outputs.cache-hit != 'true'
  run: npx playwright install --with-deps chromium
- if: steps.playwright-cache.outputs.cache-hit == 'true'
  run: npx playwright install-deps chromium
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| Vitest browser mode configured via a bare `provider: 'playwright'` string plus `browser: { name: 'chromium' }` | `provider: playwright()` imported from a dedicated `@vitest/browser-playwright` package, with `instances: [{ browser: 'chromium' }]` | Vitest 4.0 (2026) [CITED: WebSearch summary describing "Browser Mode went fully stable in Vitest 4.0," 2026-08-16, MEDIUM — the version-split detail (separate `@vitest/browser-playwright` package) is corroborated by this package existing and matching vitest's version on the registry, checked this session] | This project's `.claude/CLAUDE.md` §Development Tools mentions `@vitest/web-worker or Vitest browser mode` without the exact 4.x package name — the plan should use `@vitest/browser-playwright`, not an older `webdriverio`-style provider string |
| USD LIBOR-referenced swap financing benchmarks | SOFR-referenced (fully transitioned) | LIBOR panel cessation 2023-06-30, synthetic LIBOR wind-down 2024-09-30 | Not directly relevant to this phase's harness, but relevant context carried from `.planning/research/PITFALLS.md` §B3 in case the synthetic short-rate series (D-16) is later cross-checked against real-world rate commentary |

**Deprecated/outdated:** Any Vitest browser-mode config snippet found in training data or older blog posts that configures the provider as a plain string (`provider: 'playwright'`) rather than importing `playwright()` from `@vitest/browser-playwright` should be treated as stale — the package-split happened in the 4.x line this project is pinned to.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|-----------------|
| A1 | `@vitest/browser-playwright`'s exact config shape (`provider: playwright()`, `instances: [{ browser: 'chromium' }]`) is accurate for `4.1.10` specifically, not just "4.x generally" | Architecture Patterns, Pattern 1; Standard Stack | Wrong config keys would surface immediately as a Vitest startup error during Wave 0 scaffolding — low actual risk (fails fast, self-correcting), but the plan should budget a "scaffold and verify `npx vitest run` boots" step before writing bench logic on top of it |
| A2 | Comlink's `expose`/`wrap`/`transfer` API surface described here matches the current `comlink@4.4.2` release (this was WebSearch-summarized, not fetched directly from the pinned-version README) | Code Examples; Don't Hand-Roll | If the API drifted, the worker-boundary code in the spike would fail typechecking/at runtime immediately — low risk, but verify against the installed package's own `.d.ts` during implementation rather than trusting this snippet verbatim |
| A3 | `fillRect`-per-cell is meaningfully slower than a single `putImageData` pass at exactly 10,000 cells (200×50) | Don't Hand-Roll is silent here; Standard Stack "Alternatives Considered" and PITFALLS.md ARCHITECTURE.md Q2 both assert this directionally, but no authoritative first-party benchmark at this exact cell count was found this session | None to the plan itself — D-15 already mandates measuring *both* arms directly rather than assuming a winner, so this assumption has zero decision-weight; flagged only so the researcher's prose above doesn't read as a settled fact |
| A4 | The calibration reference loop should be *structurally similar to* the kernel's hot path (Float64Array, allocation-free, monomorphic) rather than a generic/unrelated micro-benchmark | Architecture Patterns, Pattern 2 | This is Claude's-discretion territory per CONTEXT.md, framed here as a recommendation with reasoning, not a locked fact — if the planner or a later reviewer disagrees, no research claim breaks, only a design suggestion |
| A5 | GitHub Actions caches `npx playwright install --with-deps chromium` results reliably via `actions/cache@v4` keyed on `runner.os` + lockfile hash, and this materially reduces the ~45-90s cold-install cost on cache hits | Code Examples; Common Pitfalls context | If the cache pattern doesn't work as described (e.g., Playwright version bump invalidates without lockfile change), CI job time grows by ~45-90s per run — annoying but not blocking; D-08's own runtime-cap self-assertion would catch this drift if it also budgeted for setup time, though D-08 as decided only covers the bench script's own wall-clock, not the surrounding CI job steps |

**If this table is empty:** N/A — see rows above.

## Open Questions

1. **Exact `perf-budgets.ts` numeric values for PERF-04 through PERF-08** (the metrics with no code path yet this phase)
   - What we know: D-19 locks all eight budgets now, at their perception anchors (16/100/1000ms), per PERF-01a's rule.
   - What's unclear: The requirements text (`REQUIREMENTS.md`) gives qualitative descriptions (e.g., PERF-07 "no main-thread task exceeds 50ms," PERF-08 "cold load under 1500ms, decode under 1000ms, warm load under 300ms") that already contain their own numeric anchors distinct from the generic 16/100/1000ms triad — the planner should read these as the anchors for those specific rows rather than defaulting every row to exactly 16/100/1000.
   - Recommendation: Derive each budget's `anchorMs` from its own requirement text (already numeric in every case per `REQUIREMENTS.md` §Performance), not from a blanket assumption that every row uses the same three anchor values.

2. **Whether the `runSweep(params)` interface seam (recommended in `.claude/CLAUDE.md` §Q1) is established in this phase or deferred to Phase 3**
   - What we know: CONTEXT.md explicitly leaves this as Claude's discretion, unresolved.
   - What's unclear: Building the seam now would make the throwaway D-10 Worker-pool spike more directly reusable by Phase 3, but risks over-building "permanent" surface area in a phase whose own success criteria call the benchmark "throwaway."
   - Recommendation: Given criterion 1 explicitly says "throwaway benchmark," lean toward NOT establishing the permanent interface seam in Phase 1 — let Phase 3 (which owns the real kernel) design `runSweep()` against real requirements rather than against a spike's shape. The planner should make this an explicit, recorded choice either way.

3. **Node/npm/browser hardware available to the actual plan executor**
   - What we know: This research session's sandbox has Node 22.23.2, npm 10.9.8, git — but no `cargo`/`rustc`/`wasm-pack`, and no cached Playwright browsers.
   - What's unclear: Whether the environment the plan will actually execute in has the Rust toolchain pre-installed.
   - Recommendation: See Environment Availability below — the plan should include an explicit toolchain-install step (or a `checkpoint:human-verify` gate) before the D-11 WASM-microbenchmark task.

## Environment Availability

| Dependency | Required By | Available (this research session) | Version | Fallback |
|------------|--------------|--------------------------------------|---------|-----------|
| Node.js | Entire scaffold, Vitest, Vite | ✓ | v22.23.2 | — |
| npm | Package installation | ✓ | 10.9.8 | — |
| git | Repo, CI checkout | ✓ | 2.43.0 | — |
| Playwright Chromium browser cache | D-02 headless Chromium | ✗ (`~/.cache/ms-playwright` empty) | — | `npx playwright install --with-deps chromium` on first run (~45-90s cold); this is expected in a fresh environment, not a blocker |
| cargo / rustc (Rust toolchain) | D-11 throwaway WASM microbenchmark | ✗ (`command -v cargo` / `rustc` both not found) | — | **No fallback that satisfies D-11 as written.** Either (a) install via `rustup` as an explicit plan step before the WASM-arm task, or (b) gate that task behind `checkpoint:human-verify` confirming the executor's actual environment has Rust available, since installing a full Rust toolchain is a heavier, longer-running step than this research session should silently assume into a plan |
| wasm-pack | D-11 (invokes `wasm-pack build`) | ✗ (not installed; would be installed via `cargo install wasm-pack` or the official shell installer, **not** `npm install`, per Package Legitimacy Audit) | — | Same as cargo/rustc above — install as part of the same toolchain-setup step, outside `package.json` |
| GitHub CLI (`gh`) | Not strictly required — GitHub Actions itself doesn't need `gh` locally | ✗ (not found) | — | Not blocking; `gh` is only useful for a human inspecting CI runs from the terminal, not for the harness or CI job itself |

**Missing dependencies with no fallback:**
- `cargo`/`rustc`/`wasm-pack` (Rust→WASM toolchain) — the plan must include an explicit install step or a `checkpoint:human-verify` gate before the D-11 microbenchmark task. This is the one concrete environment gap this research surfaced that the planner cannot route around silently.

**Missing dependencies with fallback:**
- Playwright's Chromium browser binary — installs automatically on first `npx playwright install --with-deps chromium` invocation; not a planning concern beyond including that command in the setup/CI steps (already required regardless, per D-02).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10, browser mode via `@vitest/browser-playwright` (for Worker/Canvas-touching bench tests); plain Node-mode Vitest is also viable for non-browser unit tests this phase may need (e.g., `perf-budgets.ts` schema validation, D-09's self-test if it doesn't need a real browser) |
| Config file | none yet — created in Wave 0 (`vitest.config.ts`, likely a workspace splitting a fast Node-mode project from the slower browser-mode bench project) |
| Quick run command | `npx vitest run` (correctness tests, Node-mode, fast) |
| Full suite command | `npm run bench` (browser-mode, includes calibration + all measurable PERF rows + D-09 self-test) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|---------------|
| PERF-01 | Budget file defines thresholds for all PERF-02..09; CI fails on breach | integration | `npx vitest run tests/perf-budgets.selftest.test.ts` (D-09 self-test proves the gate mechanism) | ❌ Wave 0 |
| PERF-01a | Thresholds anchored to perception anchors; unreachable target escalates rather than relaxes | manual-only (documentation/process requirement — checked via PROJECT.md Key Decisions table review, not a runtime assertion) | N/A — verify via `perf-budgets.ts` field presence (`anchorMs`, optional `relaxationReason`) at code-review time | N/A |
| PERF-10 | `npm run bench` reports every PERF-02..09 metric in one command | smoke | `npm run bench` | ❌ Wave 0 (script + `bench/` directory don't exist yet) |
| PERF-11 | Measured on real hardware from Phase 1 onward; environment block present | integration | `npm run bench` (assert environment block fields are non-empty as part of the same run) | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run` (fast, Node-mode correctness tests only)
- **Per wave merge:** `npm run bench` (full browser-mode suite, including the D-08 self-timed runtime-cap assertion)
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus the deliberately-regressed-commit CI proof (criterion 5) run once as a one-time demonstration per Q7's "both" option context in the discussion log — though CONTEXT.md ultimately selected the permanent self-test (D-09) as the primary mechanism, not a kept regressed branch.

### Wave 0 Gaps

- [ ] `vitest.config.ts` (or a workspace config) — Node-mode project + browser-mode `@vitest/browser-playwright` project
- [ ] `perf-budgets.ts` — typed budget module, all eight PERF-02..09 rows present per D-19
- [ ] `bench/` directory scaffold — `calibration.ts`, `environment-block.ts`, `report.ts`, `synthetic-data.ts`
- [ ] `tests/perf-budgets.selftest.test.ts` — D-09 permanent gate-liveness self-test
- [ ] `package.json` `"bench"` script wired to the browser-mode Vitest project
- [ ] `.github/workflows/ci.yml` — D-01 GitHub Actions, PR + push-to-main triggers, Playwright cache step
- [ ] Framework install: `npm install --save-dev vitest@4.1.10 @vitest/browser-playwright@4.1.10 playwright@1.62.1 comlink@4.4.2 && npx playwright install --with-deps chromium`

## Security Domain

### Applicable ASVS Categories

This phase is dev/CI tooling with no user input, no auth, no session, no persisted user data, and no network-facing runtime service — most ASVS categories are structurally N/A. The two categories with any real surface area are supply-chain (V10-adjacent, covered by the Package Legitimacy Audit above rather than a separate ASVS row since ASVS doesn't have a dedicated supply-chain category at Level 1) and input validation of the budget file itself.

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | no | N/A — no auth surface in this phase |
| V3 Session Management | no | N/A |
| V4 Access Control | no | N/A — GitHub Actions' own PR-trigger permissions model governs who can trigger CI, not app code this phase writes |
| V5 Input Validation | yes, narrowly | `perf-budgets.ts` is a **compile-time-checked TypeScript module**, not runtime-parsed input (D-21's explicit rationale: "the compiler catches a malformed entry... with no parsing step") — this is the strongest possible V5 control for this specific artifact, stronger than a runtime schema validator would be, since a malformed budget entry cannot even compile |
| V6 Cryptography | no | N/A — no secrets, no crypto operations in this phase's scope |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Supply-chain compromise via a malicious/typosquatted dev dependency (e.g., a fake `wasm-pack` or `comlink` package) | Tampering | Package Legitimacy Audit (this document) run against the actual package names before `npm install`; verify registry creation date + downloads + source repo, not just "does it exist" |
| A CI workflow triggered by a fork PR running arbitrary code with repo secrets/write access (`pull_request_target` misuse) | Elevation of Privilege | D-01 specifies triggers on "pull request... and push to main" — the plan should use the standard `pull_request` trigger (not `pull_request_target`) for this bench-and-gate workflow, since it needs no write access or secrets to run `npm run bench` against untrusted PR code |
| `postinstall` script in an npm dependency reaching the network at install time (the `wasm-pack` npm wrapper, if it were installed via npm) | Tampering / Info Disclosure | Mitigated by design decision, not a runtime control: don't install `wasm-pack` via npm at all (see Package Legitimacy Audit) |

## Sources

### Primary (VERIFIED — this session, via Bash/npm registry)
- `npm view vitest version` / `npm view @vitest/browser-playwright version` / `npm view playwright version` / `npm view comlink version` / `npm view wasm-pack version` — registry version confirmation, 2026-08-16
- `npm view playwright time --json` — package creation-date verification (resolves the seam's false-positive `SUS` verdict), 2026-08-16
- `npm pack wasm-pack@0.15.0` (unpacked and read `install.js`/`binary.js` directly) — postinstall network-fetch behavior confirmed by reading the actual shipped source, 2026-08-16
- `gsd_run query package-legitimacy check --ecosystem npm vitest @vitest/browser-playwright playwright comlink wasm-pack` — automated legitimacy seam output, 2026-08-16

### Secondary (CITED — official docs, cross-checked)
- docs.github.com/en/actions/reference/runners/github-hosted-runners (WebFetch, 2026-08-16) — `ubuntu-latest`: 4 CPU cores, 16GB RAM, 14GB SSD, x64 — directly supports D-17
- vitest.dev/guide/browser/ (WebFetch, 2026-08-16) — exact 4.x browser-mode config shape (`provider: playwright()`, `instances`)
- pythonspeed.com/articles/consistent-benchmarking-in-ci/ (WebFetch, 2026-08-16) — CI noise-reduction technique landscape (Cachegrind instruction counting), used here as a contrast/alternatives-considered reference, not as this phase's chosen method

### Tertiary (LOW confidence — WebSearch only, single-pass, not independently re-fetched from a primary source this session)
- Comlink `expose`/`wrap`/`transfer` API description — WebSearch summary of GitHub README/blog posts, 2026-08-16
- wasm-pack/wasm-bindgen quickstart flow — WebSearch summary of github.com/wasm-bindgen/wasm-pack and rustwasm.github.io/docs, 2026-08-16
- Playwright GitHub Actions caching pattern (`actions/cache@v4`, `~/.cache/ms-playwright`) — WebSearch summary across 3+ independent community writeups, 2026-08-16
- Canvas 2D `fillRect` vs `putImageData` performance characterization — WebSearch summary, no authoritative first-party benchmark found at the specific 10,000-cell scale; this is exactly why D-15 mandates measuring both directly rather than trusting any secondary source
- Vitest `bench()`/Tinybench API description — WebSearch summary, 2026-08-16

**Note on Context7 MCP:** Context7 MCP tools (`mcp__context7__*`) were not present in this session's tool list, and the `ctx7` CLI fallback was not installed in the environment (`command -v ctx7` → not found). Per `research-documentation-lookup.md`, WebSearch/WebFetch was used as the fallback for all "docs" kind questions the research-plan seam routed to `context7`. This is why several findings above (Comlink API surface, wasm-bindgen quickstart) are tagged LOW/tertiary rather than the MEDIUM/HIGH they would carry if Context7 had been reachable — the planner should treat these specific claims as needing a spot-check against the installed package's own `.d.ts`/README during implementation, not as settled fact.

## Metadata

**Confidence breakdown:**
- Standard stack (package names/versions): HIGH — all verified directly against the live npm registry this session, cross-checked against `.claude/CLAUDE.md`'s prior pinned versions
- GitHub Actions runner baseline (D-17's premise): MEDIUM-HIGH — official docs.github.com page fetched directly this session, cross-checked against an independent GitHub changelog WebSearch result describing the same Dec-2023 4-vCPU upgrade
- Architecture patterns (Vitest browser-mode config shape): MEDIUM — official vitest.dev page fetched directly, single fetch not independently re-verified against a second source
- Comlink/wasm-bindgen API details, CI-caching pattern specifics: LOW — WebSearch-only, Context7 unavailable this session; flagged for spot-check at implementation time
- Package legitimacy / supply-chain: HIGH — automated seam run plus direct manual verification (unpacked tarball, checked creation dates) for every flagged package

**Research date:** 2026-08-16
**Valid until:** ~14 days for the fast-moving parts (npm package versions, Vitest 4.x config shape — this ecosystem moves quickly and this project pins versions tightly); ~90 days for the stable parts (GitHub Actions runner specs, Comlink/wasm-bindgen core API shape, ASVS category applicability)
