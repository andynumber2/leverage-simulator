---
phase: 01-performance-spike-and-budget-lock
plan: 01
subsystem: infra
tags: [vitest, playwright, browser-mode, canvas, ci, performance-budget, typescript]

# Dependency graph
requires: []
provides:
  - "perf-budgets.ts: typed, single-source-of-truth performance budget table (11 entries, 8 requirement ids)"
  - "npm run bench: browser-mode measurement chain (headless Chromium via Playwright), calibration-normalized"
  - "npm run typecheck / npm test: fast Node-side correctness project"
  - "bench/report.ts: checkBudget / escalationTriggered / formatMeasured / renderTable / assertRunInvariants"
  - "bench/calibration.ts: min-of-5 timing + Float64Array reference-loop calibration score + normalize()"
  - "GitHub Actions CI gate on pull_request + push-to-main, read-only token, uploads bench-results.json"
  - "Permanent gate-liveness self-test (D-09) and PERF-01a anchor-invariant self-test"
affects: [02-data-pipeline, 03-simulation-kernel, 04-application-shell, 06-heatmap-design, 07-sweep-engine]

# Actuals (#2632)
actuals:
  tokens: 25954
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: [vitest@4.1.10, "@vitest/browser-playwright@4.1.10", playwright@1.62.1, comlink@4.4.2, typescript@5.9.3, "@types/node@22.19.5"]
  patterns:
    - "Typed perf-budgets.ts as the single source of truth, compile-time exhaustiveness check over requirementId"
    - "Calibration-normalized minimum-of-5 timing applied uniformly to every metric and to the calibration loop itself"
    - "UNMEASURED rows derived from an explicit lookup against PERF_BUDGETS, never from a try/catch around a missing function"
    - "Filesystem-backed accumulator (.bench/.raw/) for the browser-command-to-globalSetup bridge, because those run as separate vite-node module instances even within one OS process"
    - "Environment capture split across browser context (hardwareConcurrency/userAgent/deviceMemory/calibrationScore) and Node context (os/ci), merged in the Node-side command handler"

key-files:
  created:
    - perf-budgets.ts
    - bench/calibration.ts
    - bench/report.ts
    - bench/environment-block.ts
    - bench/accumulator-store.ts
    - bench/global-setup.ts
    - bench/canvas-repaint.bench.test.ts
    - bench/browser-commands.d.ts
    - vitest.config.ts
    - tests/perf-budgets.selftest.test.ts
    - tests/report.test.ts
    - .github/workflows/ci.yml
  modified: []

key-decisions:
  - "Browser-to-Node bridge uses Vitest's browser custom-commands API (RESEARCH.md's preferred mechanism), persisting to .bench/.raw/ on disk rather than an in-memory module accumulator — empirically, the command implementation and bench/global-setup.ts's teardown execute as separate vite-node module instances within the same process, so a plain in-memory array did not survive the boundary (first attempt failed with a null environment at teardown; fixed by switching to filesystem persistence)"
  - "Environment capture split across contexts: bench/environment-block.ts's captureEnvironment() runs in-browser and returns only what navigator exposes (hardwareConcurrency, userAgent, deviceMemory, calibrationScore, timestamp); bench/accumulator-store.ts's persistEnvironment() fills in os (node:os) and ci (process.env.CI) Node-side, since process.env and node:os are unavailable in the browser bundle and a first attempt to inject them via Vite's define also failed to propagate into the browser-mode project's resolved config"
  - "NOMINAL_REFERENCE_MS calibration anchor set to 40 (bench/calibration.ts) based on empirical tuning in this sandbox — the reference loop measures roughly 22-29ms here. Per D-06's costly reversibility rating this constant is denominated in the environment it was tuned against; it should be re-verified (not silently adjusted) once the harness actually runs on the ubuntu-latest CI baseline named by D-17"
  - "@types/node@22.19.5 and typescript@5.9.3 added as devDependencies beyond the plan's literal 'install exactly these four packages' list — both are unavoidable to run tsc against Node-builtin imports (node:fs, node:os, node:path, process) used by bench/global-setup.ts, bench/accumulator-store.ts and vitest.config.ts; no charting library or WASM tooling was added"

patterns-established:
  - "Every *.bench.test.ts file: measure raw -> normalize(rawMs, calibrationScore()) -> commands.recordMeasurement(row) -> expect(normalizedMs).toBeLessThanOrEqual(budget.thresholdMs) — the ordinary Vitest assertion is the actual gate (D-03), checkBudget/renderTable exist only to compute what gets printed"
  - "bench/report.ts holds zero Node-builtin imports so it stays safe to import from browser-context test files; anything genuinely Node-only (fs, os, process) lives in bench/accumulator-store.ts instead"

requirements-completed: [PERF-01, PERF-01a, PERF-10, PERF-11]

coverage:
  - id: D1
    description: "npm run bench runs headless Chromium via Playwright, prints all eight PERF-02..PERF-09 requirement groups every run, with threshold+anchor shown even for unmeasured rows"
    requirement: PERF-10
    verification:
      - kind: integration
        ref: "npm run bench (stdout: '=== PERF-02 ===' through '=== PERF-09 ===', each with budget/anchor)"
        status: pass
    human_judgment: false
  - id: D2
    description: "perf-budgets.ts defines numeric thresholds for all 11 budget rows across the 8 requirements, with a compile-time exhaustiveness check"
    requirement: PERF-01
    verification:
      - kind: unit
        ref: "npm run typecheck (exhaustiveness check compiles)"
        status: pass
      - kind: unit
        ref: "tests/perf-budgets.selftest.test.ts#PERF_BUDGETS has exactly 11 entries across exactly the 8 requirement ids PERF-02..PERF-09"
        status: pass
    human_judgment: false
  - id: D3
    description: "A budget breach fails npm run bench with a non-zero exit through the ordinary Vitest expect() call, never downgraded to a warning"
    requirement: PERF-01
    verification:
      - kind: unit
        ref: "tests/report.test.ts#checkBudget strictly above threshold fails / tests/perf-budgets.selftest.test.ts#a deliberately over-budget fixture yields a fail verdict"
        status: pass
      - kind: other
        ref: "manual: hardcoded checkBudget to always return 'pass', ran npx vitest run --project unit -> exit 1 (5 test failures), reverted"
        status: pass
    human_judgment: false
  - id: D4
    description: "Permanent self-test (D-09) proves the gate cannot rot into a no-op, and the PERF-01a anchor invariant (thresholdMs > anchorMs requires a non-empty relaxationReason) is asserted mechanically, not left to code review"
    requirement: PERF-01a
    verification:
      - kind: unit
        ref: "tests/perf-budgets.selftest.test.ts (11 tests, all passing)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every bench run stamps a full environment block (hardwareConcurrency, userAgent, os, calibrationScore, ci, timestamp), making an unlabelled figure structurally impossible"
    requirement: PERF-11
    verification:
      - kind: integration
        ref: "npm run bench (stdout '=== Environment ===' block, all fields non-empty) and .bench/bench-results.json (environment key present)"
        status: pass
      - kind: other
        ref: "bench/global-setup.ts throws if no environment was captured this run (verified during implementation iteration)"
        status: pass
    human_judgment: false
  - id: D6
    description: "GitHub Actions CI workflow runs npm run bench on pull_request and push-to-main under a read-only token (never pull_request_target), uploading the results JSON as an artifact"
    requirement: PERF-11
    verification:
      - kind: other
        ref: "grep checks against .github/workflows/ci.yml: pull_request_target count=0, npm run bench count=1, ubuntu-latest count=1, contents: read count=1, upload-artifact count=1"
        status: pass
    human_judgment: true
    rationale: "No GitHub remote is configured in this repository yet (git remote -v returns nothing), so the workflow has never actually executed on GitHub Actions. Syntax, trigger configuration, and the local equivalent of every step (npm ci is untested here, but typecheck/test/bench all run and pass locally) are verified; a human must push to a GitHub remote with Actions enabled and confirm a real PR run goes green, per this plan's user_setup note."

duration: 19min
completed: 2026-08-16
status: complete
---

# Phase 1 Plan 1: Bench Measurement Chain and Budget Lock Summary

**`npm run bench` runs headless Chromium via Playwright, measures a real calibration-normalized 10,000-cell Canvas `fillRect` repaint against the locked PERF-05 budget, prints all eight PERF-02..PERF-09 requirement groups every run, stamps a full environment block, writes a gitignored JSON artifact, and is gated in CI by a permanent self-test that proves the budget check cannot rot into a no-op.**

## Performance

- **Duration:** ~19 min
- **Started:** 2026-08-16T02:02:28Z
- **Completed:** 2026-08-16T02:20:52Z
- **Tasks:** 2
- **Files modified:** 16 (all new)

## Accomplishments

- Stood up the full TypeScript + Vitest 4.1.10 project scaffold (two projects: fast Node `unit`, browser-mode `bench` via `@vitest/browser-playwright` + real headless Chromium)
- `perf-budgets.ts`: typed, single-source-of-truth budget table — 11 entries across the 8 PERF-02..PERF-09 requirements, every threshold equal to its perception anchor (no `relaxationReason` owed yet), compile-time exhaustiveness check over `requirementId`
- One genuine end-to-end measurement: a deterministic 200x50 (10,000-cell) Canvas 2D `fillRect` repaint, calibration-normalized against a Float64Array reference loop, compared to the real PERF-05 threshold (16ms) via an ordinary Vitest `expect` — measured ~4ms locally, well inside budget
- Full report/gate machinery (`bench/report.ts`): `checkBudget`, `escalationTriggered` (D-20's 70% marker), `formatMeasured` (half-up rounding, verified against the classic 16.005 float case), `renderTable` (order-independent, grouped by requirement id), `assertRunInvariants` (throws on a missing requirement group, all-unmeasured rows, an unknown budget id, or runtime over the declared cap)
- Permanent gate-liveness self-test (D-09) and a mechanical PERF-01a anchor-invariant check, both in `tests/perf-budgets.selftest.test.ts`
- `.github/workflows/ci.yml`: standard `pull_request` trigger (never `pull_request_target`) plus push-to-main, `permissions: contents: read`, `ubuntu-latest` (the D-17 baseline), Playwright browser cache, uploads `.bench/bench-results.json` as a build artifact

## Task Commits

1. **Task 1: `npm run bench` measures a real 10,000-cell Canvas repaint in headless Chromium and gates it against the locked budget file** - `0f7125d` (feat)
2. **Task 2: Close the CI leg and prove the budget gate is live** - `cc8fa9b` (test)

_Note: Task 1 is a `type="tracer" tdd="true"` task; see "TDD Gate Compliance" below for how the RED/GREEN discipline was actually satisfied._

## Files Created/Modified

- `package.json`, `package-lock.json` - project scaffold, npm scripts (`typecheck`, `test`, `bench`), pinned dependencies
- `tsconfig.json` - strict, `noUncheckedIndexedAccess`, bundler resolution, `allowImportingTsExtensions` (needed for Vite's native config loader, which wants explicit `.ts` extensions on relative imports)
- `vitest.config.ts` - two projects (`unit` Node, `bench` browser/Playwright/Chromium), `fileParallelism: false` on `bench`, `browser.commands` bridge
- `.gitignore` - `node_modules/`, `.bench/`, Playwright caches, Vitest browser-mode failure-screenshot directories
- `perf-budgets.ts` - the 11-entry budget table and its exhaustiveness check
- `bench/calibration.ts` - `measureMinOfN`, `calibrationScore`, `normalize`, the Float64Array reference loop
- `bench/environment-block.ts` - browser-side `captureEnvironment`
- `bench/accumulator-store.ts` - Node-only, filesystem-backed accumulator (not in the plan's literal file list; see Deviations)
- `bench/report.ts` - row shape, `checkBudget`/`escalationTriggered`/`formatMeasured`/`renderTable`/`assertRunInvariants`
- `bench/global-setup.ts` - run lifecycle: total wall-clock, table print, atomic JSON write, invariant enforcement
- `bench/canvas-repaint.bench.test.ts` - the one real measurement
- `bench/browser-commands.d.ts` - module augmentation for the custom `commands` API (not in the plan's literal file list; see Deviations)
- `tests/perf-budgets.selftest.test.ts` - D-09 gate-liveness self-test + PERF-01a anchor invariant
- `tests/report.test.ts` - `bench/report.ts` behavior coverage
- `.github/workflows/ci.yml` - the CI gate

## Decisions Made

- **Browser-to-Node bridge is filesystem-backed, not in-memory.** First attempt used Vitest's browser custom-commands API writing into a plain module-level array/variable, matching a literal reading of "global-setup provides the accumulator sink that recordMeasurement writes into." This failed empirically: `bench/global-setup.ts`'s teardown always saw a null environment, because the command implementation (declared in `vitest.config.ts`) and the `globalSetup` module run as separate vite-node module instances even within the same OS process. Switched to persisting each recorded row and the environment block to `.bench/.raw/*.json`, which is genuinely shared regardless of module-instance identity.
- **CI flag and OS label are captured Node-side, not injected via Vite `define`.** First attempt declared `__GSD_BENCH_CI__`/`__GSD_BENCH_OS__` as `define`d constants so the browser bundle could read them without `process.env`. This also failed empirically (`ReferenceError: __GSD_BENCH_OS__ is not defined` even after adding `define` to both the root config and the `bench` project's inline config). Resolved by having `captureEnvironment()` return only what the browser can genuinely observe, and having the Node-side command handler (`bench/accumulator-store.ts`) fill in `os`/`ci` from `node:os`/`process.env` before persisting.
- **`NOMINAL_REFERENCE_MS = 40`** (the calibration score's anchor constant) was tuned empirically against this sandbox, where the reference loop measures roughly 22-29ms. Per D-06's costly reversibility rating, this is denominated in the environment it was tuned against and should be re-verified once the harness runs for real against the D-17 `ubuntu-latest` baseline, not silently re-tuned later.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `bench/accumulator-store.ts`, not in the plan's Task 1 `<files>` list**
- **Found during:** Task 1, first `npm run bench` run
- **Issue:** The plan's design (`bench/global-setup.ts` "provides the accumulator sink that `recordMeasurement` writes into") assumed a shared in-memory module state between the browser-command handler and the global-setup teardown. This does not hold in Vitest 4.1.10's browser mode — verified empirically by a failing run where the captured environment was null at teardown despite the command call itself succeeding.
- **Fix:** Added a Node-only, filesystem-backed accumulator (`.bench/.raw/`), which both sides read/write reliably regardless of module-instance identity.
- **Files modified:** `bench/accumulator-store.ts` (new), `vitest.config.ts`, `bench/global-setup.ts`
- **Verification:** `npm run bench` prints the real PERF-05 figure and the environment block, exits 0; the JSON artifact contains both.
- **Committed in:** `0f7125d` (Task 1 commit)

**2. [Rule 3 - Blocking] Added `bench/browser-commands.d.ts`, not in the plan's Task 1 `<files>` list**
- **Found during:** Task 1, initial typecheck of `bench/canvas-repaint.bench.test.ts`
- **Issue:** Vitest's `BrowserCommands` interface ships with only the built-in `readFile`/`writeFile`/`removeFile` entries; `commands.recordMeasurement`/`commands.recordEnvironment` would not typecheck without declaring them.
- **Fix:** Added a `declare module 'vitest/internal/browser'` augmentation extending `BrowserCommands` with the two custom command signatures.
- **Files modified:** `bench/browser-commands.d.ts` (new)
- **Verification:** `npm run typecheck` exits 0.
- **Committed in:** `0f7125d` (Task 1 commit)

**3. [Rule 3 - Blocking] Added `typescript` and `@types/node` as devDependencies**
- **Found during:** Task 1, first `npm run typecheck` run
- **Issue:** The plan's `<action>` text says "Install exactly vitest@4.1.10, @vitest/browser-playwright@4.1.10, playwright@1.62.1 ... and comlink@4.4.2." Neither `typescript` (needed to run `tsc` for the `typecheck` script) nor `@types/node` (needed for `node:fs`, `node:os`, `node:path`, `process` used by `bench/global-setup.ts`, `bench/accumulator-store.ts`, and `vitest.config.ts`) was in that list, but both are unavoidable to satisfy the plan's own `npm run typecheck` verify step.
- **Fix:** `npm install --save-exact --save-dev typescript@5.9.3 @types/node@22.19.5`. No charting library and no WASM tooling were added — the banned-dependency acceptance-criteria check (uPlot/ECharts/Plotly/Observable Plot/wasm-pack) still passes.
- **Files modified:** `package.json`, `package-lock.json`
- **Verification:** `npm run typecheck` exits 0; banned-dependency `node -e` check exits 0.
- **Committed in:** `0f7125d` (Task 1 commit)

**4. [Rule 1 - Bug] Removed stale Vitest browser-mode failure-screenshot directories before committing**
- **Found during:** Task 1, after an earlier failing iteration of `npm run bench`
- **Issue:** Vitest's browser mode writes a screenshot on a failing assertion (`.vitest-attachments/`, `bench/__screenshots__/`). Two such directories from earlier failing debug runs were present as untracked files and would have been silently left out of `.gitignore`.
- **Fix:** Deleted the stale directories and added both patterns to `.gitignore`.
- **Files modified:** `.gitignore`
- **Verification:** `git status --short` after a clean `npm run bench` run shows no untracked files under either path.
- **Committed in:** `0f7125d` (Task 1 commit)

---

**Total deviations:** 4 auto-fixed (3 blocking, 1 bug). All necessary for the bench chain to actually work end to end or for the workspace to stay clean; no scope creep beyond what Task 1's own verify step required.
**Impact on plan:** None of the plan's `<files>` lists, exports, or acceptance criteria were reduced — two additional files were added because the plan's described accumulator mechanism did not survive contact with Vitest 4.1.10's actual module-instance boundaries.

## TDD Gate Compliance

Task 1 (`type="tracer" tdd="true"`) was not executed as a strict two-commit RED-then-GREEN sequence — there is a single `feat(01-01)` commit for the whole task. The RED phase happened organically through iteration rather than as a committed, deliberately-failing state:

1. First `npm run bench` run failed with `ReferenceError: __GSD_BENCH_OS__ is not defined` (the `define`-based environment injection did not reach the browser bundle).
2. Second run failed with `Module "node:os" has been externalized for browser compatibility` (a Node-only import had leaked into a module the browser test transitively imported).
3. Third run's single test passed, but `bench/global-setup.ts`'s teardown then threw `no environment block was captured this run` (the in-memory accumulator did not survive the browser-command/global-setup module boundary).

Each was a genuine failure discovered by running the actual `<verify>` command, fixed via Rule 1 (bug) before proceeding, and the task was not committed until `npm run typecheck && npm run bench` passed cleanly and the "artificially lower the threshold makes the run exit 1" sanity check (documented in the Task 1 commit message) confirmed the gate itself was load-bearing. Task 2's two test files (which do carry the explicit RED-equivalent assertions this task's `<behavior>` block specifies) are genuine `test(...)`-then-verified unit tests, all 28 of which pass.

## Issues Encountered

See "Deviations from Plan" above — all three architecture-level issues (environment injection, browser-bundle Node-builtin leakage, cross-module-instance state) were discovered and resolved during Task 1's own iteration, not deferred.

## User Setup Required

**External service requires manual configuration.** Per this plan's `user_setup` note: `.github/workflows/ci.yml` is inert until this repository has a GitHub remote with Actions enabled.

- `git remote -v` currently returns nothing in this repository — no GitHub remote is configured yet.
- Once a remote exists: push this branch, open a pull request, confirm the "CI" check (job `bench`) runs and goes green, and confirm the `bench-results` artifact is attached to the run.
- No environment variables or secrets are required — the workflow references none.

## Next Phase Readiness

- The measurement chain works end to end on one real metric (PERF-05) and is ready for later phases to register their own rows against the same `perf-budgets.ts` table and `bench/report.ts` machinery, per SKELETON.md's "Subsequent Slice Plan."
- `NOMINAL_REFERENCE_MS` should be re-verified (not silently retuned) once the harness runs for real on the `ubuntu-latest` CI baseline (D-17) — see "Decisions Made" above.
- No blockers for Phase 1's remaining plans (01-02, 01-03, 01-04), which build on this plan's scaffold, budget table, and report machinery.
- The GitHub remote / Actions setup above is the only outstanding external dependency; it does not block further local execution of this phase's plans.

---
*Phase: 01-performance-spike-and-budget-lock*
*Completed: 2026-08-16*
