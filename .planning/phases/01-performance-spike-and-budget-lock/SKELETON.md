# Walking Skeleton: Leverage Simulator

**Phase:** 1
**Generated:** 2026-08-16

> Scoped per the phase-planning note: Phase 1 has no database and no UI in scope, so the template's "one real DB read/write" and "one real UI interaction" rows have no referent here. The thinnest end-to-end working slice for this phase is the measurement chain, and that is what this document records.

## Capability Proven End-to-End

`npm run bench` launches headless Chromium, takes a real Canvas 2D repaint measurement of a 10,000-cell grid, normalizes it against a calibration score measured on the same machine in the same run, compares it against a real numeric threshold in `perf-budgets.ts`, prints it in a table alongside every other PERF-02 through PERF-09 row with its budget and perception anchor, writes a machine-readable JSON artifact, and fails the run non-zero on breach. A CI workflow runs that same command on every pull request, and a permanent self-test proves the gate goes red on a breach.

That chain, end to end with one genuine metric flowing through it, is the skeleton. Every other measured row (the single backtest, the Worker-pool sweep, the second canvas arm) is expansion on a proven chain.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Language | TypeScript 5.x, strict, `noUncheckedIndexedAccess` | One language across the app, the bench harness and the future bundle compiler. Typed-array-heavy numeric code benefits from strict typing catching unit and index errors |
| Build and dev server | Vite, via the Vitest 4.1.10 toolchain | Native Web Worker, WASM and binary-asset support with no config, and it is already the host Vitest browser mode runs on. No separate `vite.config.ts` exists yet because this phase ships no application |
| Test and bench runner | Vitest 4.1.10, two projects: a fast Node `unit` project and a browser `bench` project | D-03. Budget assertions are ordinary `expect` calls, so a breach fails CI through the normal test runner with no second reporting pipeline |
| Measurement environment | Headless Chromium driven by Playwright 1.62.1 via `@vitest/browser-playwright` 4.1.10, used identically locally and in CI | D-02. One environment means there is never a second number to reconcile against the one production will see. Real Web Workers, a real Canvas. Reversibility: costly |
| Timing statistic | Minimum of N=5 repeats, divided by a calibration score from a fixed reference loop run in the same browser instance | D-06 and D-07. Minimum is correct for latency because noise only adds time; calibration absorbs the 20 to 40 percent run-to-run variance of GitHub-hosted runners without loosening the budget by that same factor. Reversibility: costly |
| Performance budget source of truth | `perf-budgets.ts`, a typed TypeScript module with a compile-time exhaustiveness check over requirement ids | D-21. A malformed entry cannot compile, and the harness imports it directly with no parsing step. Reversibility: costly |
| Baseline machine | The GitHub Actions `ubuntu-latest` runner is the 4-core baseline PERF-03 names | D-17. Collapses the gate machine and the baseline machine into one, so there is no derating factor to argue about. Dev-machine figures are informational. Reversibility: costly |
| CI | GitHub Actions on the standard pull-request trigger plus push to main, workflow-level `permissions: contents: read`, no secrets | D-01, and threat `T-01-02`. The job runs untrusted contributor code and needs no privilege |
| Compute architecture | Plain JS in a real Worker pool over `navigator.hardwareConcurrency - 1`, with WASM kept as a documented escalation lever behind the 70 percent trigger | D-10, D-20. Settled by measurement in plan 01-04, not by estimate |
| Heatmap renderer | Hand-rolled Canvas 2D, no charting library | D-14. Every surveyed library was rejected on documented grounds; the internal `fillRect` versus `putImageData` fork is settled by measurement in plan 01-03 |
| Worker boundary | Comlink 4.4.2 with `Comlink.transfer` for result buffers | Avoids hand-rolled message-protocol bugs, and transferring rather than structured-cloning keeps a copy stall out of the measured sweep figure (PITFALLS F3) |
| Directory layout | `perf-budgets.ts` at the root; `bench/` for browser-mode measurement code; `tests/` for the fast Node project; `.bench/` for the gitignored JSON artifact | Keeps the single budget source of truth visible at the root and separates the slow browser suite from the fast feedback loop |
| UI framework | Deferred to Phase 4 | Stack research pre-selected Solid.js 1.9.14, but this phase ships no UI and adding the dependency now would be skeleton bloat. Ratified when the first UI lands |
| Data layer | Deferred to Phase 2 | The binary bundle format and its compiler are Phase 2's scope. This phase's input is seeded synthetic data (D-16) precisely so it does not front-run Phase 2's sourcing and provenance work |

## Stack Touched in Phase 1

- [ ] Project scaffold: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, pinned dependency set
- [ ] Real browser execution: headless Chromium under Playwright, running real Web Workers and a real Canvas
- [ ] Real measurement: a calibration-normalized minimum-of-5 wall-clock figure for a 10,000-cell Canvas repaint, a 25,000-bar single backtest, and a 10,000-cell Worker-pool sweep
- [ ] Real gate: every measured figure compared against `perf-budgets.ts` by an ordinary `expect` call, breach exits non-zero
- [ ] Real CI: GitHub Actions runs the same command on every pull request and push to main, uploads the results JSON as an artifact
- [ ] Gate liveness proof: a permanent self-test feeds the budget checker an over-budget fixture and asserts a fail verdict, so the gate cannot rot into a no-op

## Recorded Decision: the `runSweep(params)` interface seam is deferred to Phase 3

`01-RESEARCH.md` open question 2 left this unresolved and CONTEXT.md lists it under Claude's Discretion. Phase 1 does not establish it.

The sweep entry point created in plan 01-02 is named `runSpikeSweep` and is bench-internal. Phase criterion 1 calls this benchmark throwaway, and a permanent public contract designed against a spike's needs is a contract designed against the wrong requirements. Phase 3 owns the real kernel and designs the seam against the real parameter surface. The deliberately different name makes it impossible for a later phase to import the spike function believing it is the production seam.

What does survive the phase: the bench arms in `bench/` remain as permanent, gated, `spike-synthetic`-sourced rows, because a figure that stops being measured when the phase ends cannot catch a regression, and PERF-11 requires measurement from the first executable phase onward. Phase 3 and Phase 7 re-register PERF-02 and PERF-03 with source `production` and the spike arms retire. The Rust crate is the only thing deleted at phase end, per D-13.

## Out of Scope (Deferred to Later Slices)

Explicit, so later phases do not re-litigate Phase 1's minimalism:

- Any product UI, any framework dependency, any routing, any styling (Phase 4)
- The real simulation kernel and its validation against UPRO and TQQQ history (Phase 3)
- The data bundle, its binary format, its compiler and its provenance manifest (Phase 2)
- Any database or backend of any kind (permanently out of scope per PROJECT.md)
- A full WASM kernel implementation (conditional escalation only, triggered by the 70 percent rule)
- A WebGPU compute path (deferred for v1 on browser-support grounds)
- A charting-library head-to-head benchmark (rejected; research already documents each library's disqualification)
- Trend history of benchmark results over time (the CI artifact is the raw material if this becomes valuable)
- The permanent `runSweep(params)` interface seam (Phase 3, see above)

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions, and each adds its own measured rows to the same `npm run bench` report.

- Phase 2: a CLI compiler turns raw CSVs into versioned binary assets with machine-readable provenance. Adds bundle byte size and decode-to-typed-array time to the bench report.
- Phase 3: the simulation kernel, proven against real UPRO and TQQQ history. Re-registers PERF-02 with source `production`.
- Phase 4: a real single backtest in the browser, pasteable as a link. Registers PERF-07 and PERF-08.
- Phase 5: attribution and the credibility surface.
- Phase 6: the heatmap design pass, gated against the PERF-05 budget locked here.
- Phase 7: the sweep engine and the heatmap. Re-registers PERF-03 with source `production` and registers PERF-04, PERF-05, PERF-06 and PERF-09.
- Phase 8: export and the canonical arguments.
