---
phase: quick-260816-p8z
plan: 01
subsystem: testing
tags: [vitest, playwright, bench-harness, calibration]

requires:
  - phase: 01-01
    provides: browser-to-Node commands bridge (bench/accumulator-store.ts, browser.commands), calibrationScore()/normalize() in bench/calibration.ts
provides:
  - Write-once canonical calibration score shared across all bench files in one run
  - Run-level invariant that fails when measured rows and the environment block disagree on score
affects: [performance-spike-and-budget-lock, any future bench file added under bench/*.bench.test.ts]

actuals:
  tokens: 6632
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Write-once filesystem claim (temp file + link(), EEXIST on loser) for cross-module-instance first-caller-wins state, same pattern as the existing browser-to-Node commands bridge"
    - "read-then-claim (readCalibration then claimCalibration only if null) to avoid re-paying the reference-loop cost per bench file"

key-files:
  created:
    - bench/canonical-calibration.ts
    - tests/accumulator-store.test.ts
  modified:
    - bench/accumulator-store.ts
    - bench/browser-commands.d.ts
    - bench/report.ts
    - bench/global-setup.ts
    - vitest.config.ts
    - bench/kernel.bench.test.ts
    - bench/sweep.bench.test.ts
    - bench/canvas-repaint.bench.test.ts
    - tests/report.test.ts

key-decisions:
  - "claimCalibrationScore rejects non-finite/zero/negative samples before anything is written, mirroring normalize()'s guard style, without importing bench/calibration.ts (accumulator-store.ts stays Node-only and dependency-free of the measurement code)"
  - "Score-coherence check in assertRunInvariants compares measuredMs - normalizedMs * score (multiplied form), not measuredMs / normalizedMs, so a legitimately zero measurement cannot produce NaN"
  - "The environment stamp (captureEnvironment/recordEnvironment) stays in all three bench files even though the score is now canonical: last-write-wins across three identical payloads is harmless, and removing two of the three would leave a run with no environment block if the surviving file were ever filtered out"

requirements-completed: [QUICK-260816-p8z]

coverage:
  - id: D1
    description: "Write-once canonical calibration score in bench/accumulator-store.ts: first caller wins, concurrent callers converge, resetAccumulatorStore clears it"
    verification:
      - kind: unit
        ref: "tests/accumulator-store.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "All three bench files (kernel/sweep/canvas-repaint) route their score through resolveRunCalibration() instead of sampling calibrationScore() independently"
    verification:
      - kind: unit
        ref: "npm run typecheck (bench/*.bench.test.ts compiles against the new import shape)"
        status: pass
    human_judgment: false
  - id: D3
    description: "assertRunInvariants fails a run whose measured rows disagree with the recorded environment.calibrationScore"
    verification:
      - kind: unit
        ref: "tests/report.test.ts#assertRunInvariants (coherent/divergent/unmeasured-skip/two-arg-compat/zero-value cases)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Live end-to-end proof: npm run bench produces one environment block whose calibrationScore matches every measured row's implied score to 12+ significant digits"
    verification: []
    human_judgment: true
    rationale: "Could not run npm run bench in this sandbox: Playwright's chromium headless shell requires system shared libraries (libnspr4, libnss3, libatk1.0-0, libgbm1, etc.) that are absent, and installing them requires sudo apt-get install, which this task has no standing authorization to run. The coherence-check logic itself is exhaustively unit-tested (D3) against the exact failure shape from GitHub Actions run 31963076671 (2x divergence). A human with a working Playwright/Chromium environment must run npm run bench once to confirm the live proof; see Known Stubs below."

duration: 32min
completed: 2026-08-16
status: complete
---

# Quick Task 260816-p8z: Canonical bench calibration score Summary

**Write-once, filesystem-backed calibration score shared across all three bench files per run, plus a run-level coherence gate that fails any run whose recorded environment block disagrees with what actually normalized the measured rows.**

## Performance

- **Duration:** 32 min
- **Started:** 2026-08-16T18:15:00Z (approx, from STATE.md session context)
- **Completed:** 2026-08-16T18:22:46Z
- **Tasks:** 3
- **Files modified:** 9 (2 created, 7 modified)

## Accomplishments

- `bench/accumulator-store.ts` gained `claimCalibrationScore`/`loadCalibrationScore`: a write-once primitive (temp file + `link()`, `EEXIST` on the loser) so the first caller in a run to sample the reference loop wins, and every later caller — including a racing concurrent one — receives that same value. `resetAccumulatorStore` already clears it with the rest of `.raw/`, so a stale score can never survive into the next run.
- `bench/canonical-calibration.ts` (new): `resolveRunCalibration()` reads the stored score first and only samples-and-claims when nothing has been claimed yet, so the reference loop's cost (roughly `REPEAT_COUNT` times `NOMINAL_REFERENCE_MS`) is paid once per run, not once per bench file.
- `bench/kernel.bench.test.ts`, `bench/sweep.bench.test.ts`, `bench/canvas-repaint.bench.test.ts` all now call `resolveRunCalibration()` instead of `calibrationScore()` directly; every `normalize()` call, every environment stamp, every batch size and every existing assertion is unchanged.
- `bench/report.ts`'s `assertRunInvariants` gained an optional third `environment` parameter and a score-coherence invariant: for every measured row, `measuredMs` must equal `normalizedMs * environment.calibrationScore` within a documented `1e-9` relative tolerance (`SCORE_COHERENCE_RELATIVE_TOLERANCE`), using the multiplied form so a legitimately zero measurement never produces `NaN`. `bench/global-setup.ts`'s teardown now passes the loaded environment block, so this runs in the one code path that can set a non-zero exit code.
- `bench/calibration.ts` is byte-for-byte unchanged (`git diff --exit-code bench/calibration.ts` verified clean after every task): `NOMINAL_REFERENCE_MS`, `REFERENCE_ITERATIONS`, `runReferenceLoop`, `REPEAT_COUNT` and `normalize()`'s scaling were never touched.

## Task Commits

1. **Task 1: Write-once canonical score in the Node-side accumulator store** - `b7ada4d` (feat)
2. **Task 2: Route all three bench files through the canonical score over the commands bridge** - `9b627ca` (feat)
3. **Task 3: Fail any run whose rows and environment block disagree, and prove it end to end** - `e345a88` (feat)

**Plan metadata:** committed separately by the orchestrator.

## Files Created/Modified

- `bench/accumulator-store.ts` - `claimCalibrationScore`/`loadCalibrationScore` write-once pair
- `tests/accumulator-store.test.ts` - unit coverage: no-claim-yet, single claim, second-claim-loses, artifact path, 8-caller concurrent `Promise.all` (repeated 5x), reset-clears, broken-sample guards
- `bench/canonical-calibration.ts` - `resolveRunCalibration()`, browser-safe, imports only `commands` and `calibrationScore`
- `vitest.config.ts` - `readCalibration`/`claimCalibration` browser.commands entries
- `bench/browser-commands.d.ts` - type declarations for the two new commands
- `bench/kernel.bench.test.ts`, `bench/sweep.bench.test.ts`, `bench/canvas-repaint.bench.test.ts` - swapped local `calibrationScore()` sampling for `await resolveRunCalibration()`
- `bench/report.ts` - `assertRunInvariants(rows, totalRuntimeMs, environment?)` coherence check, `SCORE_COHERENCE_RELATIVE_TOLERANCE`
- `bench/global-setup.ts` - passes `environment` as the third argument to `assertRunInvariants`
- `tests/report.test.ts` - coherent/divergent/unmeasured-skip/two-arg-backward-compat/zero-value coherence test cases

## Decisions Made

- Write-once uses `link()` (atomic, fails `EEXIST`) rather than a check-then-act existence test, matching the plan's threat model (T-p8z-02): two concurrent callers can both pass a check-then-act test, but only one can win a `link()` race.
- `claimCalibrationScore` does not import `bench/calibration.ts`: the guard wording mirrors `normalize()`'s style by convention, not by shared code, keeping `accumulator-store.ts` Node-only and free of the measurement module.
- The score-coherence check compares `measuredMs - normalizedMs * score` against a tolerance scaled by `Math.max(1, |measuredMs|)`, not `measuredMs / normalizedMs`, specifically so a `measuredMs === 0, normalizedMs === 0` row (theoretically possible, not just defensive) never divides by zero.

## Deviations from Plan

### Auto-fixed Issues

None - Rules 1-3 were not triggered; the implementation followed the plan's `<action>` blocks directly.

---

**Total deviations:** 0 auto-fixed.

## Issues Encountered

**Task 3's live end-to-end proof (`npm run bench`) could not be run in this sandbox.** Playwright's `chromium_headless_shell` binary was downloaded successfully (`npx playwright install chromium`), but launching it fails with "Host system is missing dependencies to run browsers" — it needs `libglib2.0-0t64`, `libnspr4`, `libnss3`, `libatk1.0-0t64`, `libgbm1`, and several other system shared libraries that are absent, and Playwright's own remedy is `sudo npx playwright install-deps` or an equivalent `sudo apt-get install`. This task has no standing authorization to run `sudo apt-get install` (a system-level, outside-working-directory action), so the live proof step was skipped per this task's explicit instruction to report rather than force it.

This is recorded as an open item in `.planning/WINDOWS.md` (kind `unrun-verify`, id 1) so it stays visible until a human runs `npm run bench` once in an environment with a working Playwright/Chromium install and confirms:
1. The run prints a single environment block.
2. `.bench/bench-results.json`'s `environment.calibrationScore` equals every measured row's `measuredMs / normalizedMs` to at least twelve significant digits.

The coherence-check logic that this proof would exercise is otherwise fully covered: `tests/report.test.ts` proves it accepts a coherent score, rejects a 2x-divergent score (the exact shape recorded on GitHub Actions run 31963076671: environment block 0.7375 vs. PERF-03's own 1.4400), skips unmeasured rows, stays backward-compatible with the nine existing two-argument call sites, and does not throw or produce `NaN` on a zero-measurement row.

## Known Stubs

- **Live bench-run proof unverified in this environment** (`bench/report.ts`, D4 above). The code path is implemented and unit-tested; only the actual `npm run bench` execution against a real headless Chromium instance is unrun, because this sandbox lacks the system libraries Playwright's chromium needs and installing them requires `sudo`. Tracked in `.planning/WINDOWS.md` entry 1 (kind: `unrun-verify`).

## User Setup Required

None - no external service configuration required. To close out the deferred live-proof item: in an environment with working Playwright/Chromium (or after running `sudo npx playwright install-deps` / the listed `apt-get install` package list), run `npm run bench` and confirm `.bench/bench-results.json`'s environment score matches every measured row's implied score to 12+ significant digits, then mark WINDOWS.md entry 1 resolved.

## Next Phase Readiness

- The canonical-score mechanism is in place and unit-tested; no further bench-file changes are needed to adopt it (any future `*.bench.test.ts` file should call `resolveRunCalibration()`, not `calibrationScore()` directly).
- The coherence gate will catch a regression (a future bench file resampling independently) automatically once `npm run bench` can actually run in the target environment (e.g. CI's `ubuntu-latest`, which per D-17 already has the needed system libraries via `playwright install --with-deps` in most GitHub Actions setups).
- Open blocker for a human: run `npm run bench` in a working environment and close WINDOWS.md entry 1.

---
*Phase: quick-260816-p8z*
*Completed: 2026-08-16*

## Self-Check: PASSED

All created/modified files found on disk; all three task commit hashes (`b7ada4d`, `9b627ca`, `e345a88`) found in git log.
