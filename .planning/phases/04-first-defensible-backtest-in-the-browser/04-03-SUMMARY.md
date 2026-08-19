---
phase: 04-first-defensible-backtest-in-the-browser
plan: 03
subsystem: testing
tags: [vitest, playwright, vite-preview, performance-budgets, ci]

requires:
  - phase: 04-first-defensible-backtest-in-the-browser
    provides: "plan 04-01's app-data-ready / app-interactive performance marks, the contract this plan's PERF-08 harness reads"
provides:
  - "bench/preview-server.ts: withPreviewServer, starts/stops a vite preview server over the real dist/ output for one measurement"
  - "vitest.config.ts: probeBrowserContext and measureAppLoadTiming bench commands"
  - "bench/perf-08.bench.test.ts: PERF-08a/08b/08c measured rows, source: 'production'"
  - "bench/playwright-context-probe.bench.test.ts: committed proof that the Vitest custom-command context exposes a real Playwright BrowserContext"
  - "bench/report.ts: assertRunInvariants' PERF-08 coverage check (PERF_08_COVERAGE_PHASE), and the info-line escape hatch for diagnostic-only bench files"
  - ".github/workflows/ci.yml: npm run build runs before npm run bench"
affects: ["04-06/04-07 (PERF-07 harness follows the same commands-bridge and preview-server pattern this plan establishes)"]

actuals:
  tokens: 11192
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Node-side commands bridge reaching into the real Playwright BrowserContext (context.context) to open a genuinely fresh, cache-empty context against a vite preview server -- the mechanism the whole PERF-08 harness depends on, settled by a committed probe (Task 1) before anything was built on top of it"
    - "withPreviewServer(fn): starts vite preview over dist/, asserts dist/index.html exists (throwing a named error otherwise), awaits fn(origin), closes in a finally"
    - "PERF-08 coverage as a budget-table-driven invariant: assertRunInvariants derives the 'must not be unmeasured' id set from PERF_BUDGETS (requirementId === 'PERF-08' && implementedInPhase <= PERF_08_COVERAGE_PHASE) rather than a hand-maintained list, and is placed after the verdict-fail gate so a deliberately-over-budget self-test fixture keeps failing on its own breach"

key-files:
  created:
    - bench/preview-server.ts
    - bench/perf-08.bench.test.ts
    - bench/playwright-context-probe.bench.test.ts
  modified:
    - vitest.config.ts
    - bench/browser-commands.d.ts
    - bench/report.ts
    - bench/global-setup.ts
    - .github/workflows/ci.yml
    - tests/ci-workflow.test.ts
    - tests/report.test.ts

key-decisions:
  - "Task 1's probe confirmed RESEARCH.md's MEDIUM-confidence Open Question 1 as true on this project's pinned Vitest/Playwright versions: context.context is a real Playwright BrowserContext with newPage(), browser() reaching a non-null Browser handle, and a page opened from a freshly created context can navigate and read document.readyState. No fallback (separate Playwright script) was needed."
  - "assertRunInvariants' 'zero rows measured' invariant was extended (Rule 3, blocking) to also accept a recorded info line as evidence of genuine harness activity: Task 1's probe records no MeasurementRow by design (it pins a mechanism fact, not a duration), and without this the probe's own isolated run (an explicit Task 1 acceptance criterion) could never both write .bench/bench-results.json and exit 0 under the existing invariant."
  - "The PERF-08 coverage check (Task 3) is deliberately placed after the verdict-fail gate, mirroring the existing PERF-03 host-width guard's placement, so bench/selftest/over-budget.selftest.ts's deliberate-breach fixture keeps failing on its own PERF-05 breach rather than being masked by an unrelated 'PERF-08 unmeasured' reason."
  - "The fresh browser context measureAppLoadTiming creates is pinned to locale: 'en-US', the same fix plan 04-01 already applied to the 'app' Vitest project: this sandbox's unset LANG/LC_* reports to Chromium as the invalid tag en-US@posix, which throws inside uPlot's module-level Intl.NumberFormat call on import and silently prevented app-data-ready from ever firing (discovered via a page.on('pageerror') listener during debugging, since the fresh context otherwise fails to load the app with no other visible signal)."

requirements-completed: [PERF-08, APP-03]

coverage:
  - id: D1
    description: "The Vitest custom-command context parameter's context.context property is a real, unrestricted Playwright BrowserContext, proven by a committed regression rather than assumed from research"
    requirement: PERF-08
    verification:
      - kind: unit
        ref: "npx vitest run --project bench bench/playwright-context-probe.bench.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "PERF-08a (cold interactive), PERF-08b (cold data-load-and-first-render) and PERF-08c (warm interactive) are measured against a real vite preview build of dist/, never the dev server, and recorded through the same five-step measure/normalize/record/assert pipeline every other bench figure uses"
    requirement: PERF-08
    verification:
      - kind: unit
        ref: "npm run build && npm run bench -- bench/perf-08.bench.test.ts (all three rows verdict pass, source production)"
        status: pass
    human_judgment: false
  - id: D3
    description: "CI builds the production bundle before benching it, and a PERF-08 sub-budget that regresses to unmeasured fails the run rather than silently disappearing from the table"
    requirement: APP-03
    verification:
      - kind: unit
        ref: "npx vitest run --project unit tests/ci-workflow.test.ts (build-before-bench ordering assertions)"
        status: pass
      - kind: unit
        ref: "tests/report.test.ts > assertRunInvariants: PERF-08 coverage (04-03)"
        status: pass
    human_judgment: false

duration: ~40min
completed: 2026-08-19
status: complete
---

# Phase 4 Plan 3: PERF-08 Measurement Harness Summary

**PERF-08a/08b/08c go from `unmeasured` to real, passing figures (180-202ms cold, 129-160ms warm, all against real production `dist/` output), unlocked by a committed proof that Vitest's custom-command bridge exposes a genuine Playwright `BrowserContext`, with CI now building before it benches and a run-level gate that fails loudly if any PERF-08 sub-budget ever regresses back to unmeasured.**

## Performance

- **Tasks:** 3 (all `type="auto"`)
- **Files modified:** 10 (3 created, 7 modified)
- **Commits:** 3

## Accomplishments

- Settled RESEARCH.md's highest-uncertainty open question with a committed, asserted regression (`bench/playwright-context-probe.bench.test.ts`) rather than carrying an unproven assumption into the harness design.
- Built `bench/preview-server.ts`'s `withPreviewServer`, which starts a real `vite preview` server over `dist/`, throws a named error naming the missing path when no production build exists, and always closes in a `finally`.
- Added `measureAppLoadTiming`, a Node-side command that opens a genuinely fresh, cache-empty `BrowserContext`, installs a buffered `longtask` `PerformanceObserver`, navigates once for the cold `app-data-ready`/`app-interactive` figures and again in the same (now warm) context for the warm figure.
- `bench/perf-08.bench.test.ts` records all three rows with `source: 'production'`, plus the WINDOWS.md entry 2 measurement band as a shared info line and per-row reproducibility disclosure (raw/normalized figures, calibration score, long-task max/count, `hardwareConcurrency`).
- CI now runs `npm run build` between `npm run test:app` and `npm run bench`, pinned by a positional-index test assertion in the same style as the existing DATA-09 gate.
- `assertRunInvariants` gained a budget-table-driven PERF-08 coverage check: any `requirementId === 'PERF-08'` row due by `PERF_08_COVERAGE_PHASE` (4) that regresses to `unmeasured` now fails the run.

## Task Commits

1. **Task 1: Settle Open Question 1 with a committed Playwright-context probe** - `3e82350` (feat)
2. **Task 2: Measure PERF-08a, PERF-08b and PERF-08c against a production preview build** - `1a3b918` (feat)
3. **Task 3: Make CI build before it benches, and prove the gate is live for PERF-08** - `c6813a8` (feat)

## Files Created/Modified

- `bench/preview-server.ts` - `withPreviewServer(fn)`: starts/stops a `vite preview` server over `dist/`, throws naming the missing path when absent
- `bench/perf-08.bench.test.ts` - PERF-08a/08b/08c measurement, following `bench/kernel.bench.test.ts`'s five-step shape
- `bench/playwright-context-probe.bench.test.ts` - committed proof of RESEARCH.md Open Question 1
- `vitest.config.ts` - `probeBrowserContext` and `measureAppLoadTiming` bench commands
- `bench/browser-commands.d.ts` - `BrowserContextProbeReport`, `AppLoadTimingReport` types and their command declarations
- `bench/report.ts` - the info-line "measured nothing" escape hatch, and the PERF-08 coverage invariant (`PERF_08_COVERAGE_PHASE`)
- `bench/global-setup.ts` - passes `infoLines` into `assertRunInvariants`
- `.github/workflows/ci.yml` - `npm run build` step before `npm run bench`
- `tests/ci-workflow.test.ts` - build-before-bench ordering assertions
- `tests/report.test.ts` - `fullRowSet` fixture updated to carry real PERF-08a/08b/08c measurements; new PERF-08 coverage describe block

## Decisions Made

See `key-decisions` in frontmatter: the probe's confirmed answer, the info-line invariant extension, the PERF-08 coverage check's placement after the verdict-fail gate, and the `locale: 'en-US'` fix are recorded there in full.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `assertRunInvariants` rejected Task 1's own acceptance criteria**
- **Found during:** Task 1, verifying `npx vitest run --project bench bench/playwright-context-probe.bench.test.ts` in isolation
- **Issue:** The probe test records no `MeasurementRow` (it pins a mechanism fact via `recordInfoLine`, not a duration measurement). Run in isolation, this tripped `assertRunInvariants`'s "zero rows measured" check, and separately the earlier "no environment block captured" throw meant `.bench/bench-results.json` was never written at all -- either way, one of Task 1's two explicit acceptance criteria (exit 0, and the infoLine landing in the JSON artifact) failed.
- **Fix:** The probe test now also calls `commands.recordEnvironment` (matching D-18's "every run stamps an environment block"). `assertRunInvariants` was extended to accept a recorded info line as evidence of genuine harness activity, not only a `MeasurementRow`, since the check's real purpose ("a harness that measures nothing is broken") is equally satisfied by a diagnostic-only file that genuinely ran and reported something real.
- **Files modified:** `bench/playwright-context-probe.bench.test.ts`, `bench/report.ts`, `bench/global-setup.ts`
- **Verification:** `npx vitest run --project bench bench/playwright-context-probe.bench.test.ts` exits 0 and `.bench/bench-results.json`'s `infoLines` contains the `playwright-context-probe` entry; `tests/report.test.ts`'s existing "zero rows measured" test still throws for a genuinely empty run.
- **Committed in:** `3e82350` (Task 1 commit)

**2. [Rule 1 - Bug] `measureAppLoadTiming`'s fresh context never loaded the app**
- **Found during:** Task 2, first isolated run of `bench/perf-08.bench.test.ts`
- **Issue:** `page.waitForFunction` for `app-data-ready` timed out. A `page.on('pageerror')` listener (added temporarily for debugging) revealed `Invalid language tag: en-US@posix` -- the same POSIX-locale issue plan 04-01 already fixed for the `app` Vitest project's `contextOptions`, but not yet applied to a context created ad hoc via `browser.newContext()`.
- **Fix:** Both `newContext()` calls in `vitest.config.ts` (the probe's and `measureAppLoadTiming`'s) now pass `{ locale: 'en-US' }`.
- **Files modified:** `vitest.config.ts`
- **Verification:** `npm run build && npm run bench` measures all three PERF-08 rows with real, non-zero figures and verdict `pass`.
- **Committed in:** `1a3b918` (Task 2 commit)

**3. [Rule 3 - Blocking] Extending `assertRunInvariants` broke every existing fixture that assumed PERF-08 stays unmeasured**
- **Found during:** Task 3, after adding the PERF-08 coverage check
- **Issue:** `tests/report.test.ts`'s `fullRowSet` fixture (and two D-23 byte-row tests built on `buildFullRowSet`) predated this plan and carried PERF-08a/08b/08c as `unmeasured`, which is now a run failure. Separately, `bench/selftest/over-budget.selftest.ts`'s deliberate-breach fixture (D-09's gate-liveness proof) also carries only a PERF-05 row, and the new check -- placed before the verdict-fail gate in the first draft -- masked that proof with an unrelated "PERF-08 unmeasured" error.
- **Fix:** `fullRowSet` now carries real (passing) PERF-08a/08b/08c measurements, matching the post-04-03 state it represents. The two D-23 tests gained a score-parametrized `perf08FamilyRows(score)` helper so they stay coherent under whatever `calibrationScore` each test uses. The coverage check itself was moved to run after the verdict-fail gate, mirroring the existing PERF-03 host-width guard's placement and rationale.
- **Files modified:** `tests/report.test.ts`, `bench/report.ts`
- **Verification:** `npm test` (465 tests) passes; `npm run bench:selftest` still exits non-zero with "1 row(s) failed budget: PERF-05" (not a PERF-08 coverage message).
- **Committed in:** `c6813a8` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 Rule 1 bug, 2 Rule 3 blocking-issue fixes)
**Impact on plan:** All three were necessary for the plan's own stated acceptance criteria and existing test suite to hold simultaneously. No scope creep: every fix stayed inside the bench harness's reporting/invariant layer or its own test fixtures. `bench/global-setup.ts` and `tests/report.test.ts` were touched outside the plan's declared `files_modified` list, both as direct, unavoidable consequences of the `bench/report.ts` changes the plan does declare.

## Issues Encountered

None beyond the three deviations above, all resolved within the plan's own scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The Node-side commands-bridge-to-a-fresh-`BrowserContext` pattern (probe first, then a measurement command wrapped in `withPreviewServer`) is proven and ready for plan 04-06/04-07's PERF-07 harness (long-task/60fps interaction measurement) to reuse.
- `PERF_08_COVERAGE_PHASE` in `bench/report.ts` is the precedent for a future `PERF_07_COVERAGE_PHASE`-style constant once PERF-07's harness lands.
- No blockers carried forward from this plan. `perf-budgets.ts` and `bench/calibration.ts` remain untouched, per PERF-01a.

---
*Phase: 04-first-defensible-backtest-in-the-browser*
*Completed: 2026-08-19*
