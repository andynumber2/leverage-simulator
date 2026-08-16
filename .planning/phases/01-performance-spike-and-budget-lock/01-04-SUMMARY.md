---
phase: 01-performance-spike-and-budget-lock
plan: 04
subsystem: perf-spike
tags: [rust, wasm-bindgen, wasm-pack, playwright, performance-budget, architecture-decision]

# Dependency graph
requires:
  - "perf-budgets.ts, bench/calibration.ts, bench/report.ts (plan 01-01): budget table + calibration-normalized timing methodology, reused by the WASM harness"
  - "bench/kernel.ts, bench/synthetic-data.ts (plan 01-02): runSpikeBacktest / makeSeededGbmSeries, ported bit-for-bit to Rust and imported directly for the equivalence check"
  - "bench/canvas-repaint.bench.test.ts, bench/canvas-grid.ts (plan 01-03): the measured PERF-05 fillRect/putImageData figures the canvas Key Decision cites"
provides:
  - "01-SPIKE-RESULTS.md: the permanent record of the JS-vs-WASM method, raw numbers, ratio, D-20 escalation evaluation, and reproduction steps — survives the deleted Rust crate"
  - "PROJECT.md Key Decisions: plain JS over WASM, and hand-rolled Canvas 2D over any charting library, each citing a measured figure and machine"
  - "STATE.md: all eight PERF-02..09 budgets recorded as locked (D-19), replacing the prior provisional framing"
affects: [02-data-pipeline, 03-simulation-kernel, 06-heatmap-design, 07-sweep-engine]

# Actuals (#2632)
actuals:
  tokens: 22427
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Throwaway Rust crate, deliberately never wired into package.json or CI, deleted at phase end (D-13) — its only permanent artifact is a markdown finding, not code"
    - "mulberry32's 32-bit state kept as u32 throughout the Rust port (never i32), so every shift is the logical (zero-filling) shift matching JS's `>>>`, and every wrapping_add/wrapping_mul produces the identical bit pattern to JS's `Math.imul`/`|0` truncation without needing separate signed/unsigned handling"
    - "Correctness proven (1e-9 relative tolerance, exact ruin-flag match) before any timing is trusted, by importing the real bench/kernel.ts and bench/synthetic-data.ts directly via Node's native TS type-stripping (--experimental-strip-types) rather than reimplementing the JS reference"
    - "A single-call measurement that lands at the timer's resolution floor is amortized via a 5,000-call batched loop inside one timed unit to recover a resolvable per-call figure, rather than reporting a floor-limited number as if it were precise"

key-files:
  created:
    - .planning/phases/01-performance-spike-and-budget-lock/01-SPIKE-RESULTS.md
  modified:
    - .planning/PROJECT.md
    - .planning/STATE.md
  deleted:
    - spike/wasm-microbench/Cargo.toml (throwaway, per D-13)
    - spike/wasm-microbench/Cargo.lock (throwaway, per D-13)
    - spike/wasm-microbench/src/lib.rs (throwaway, per D-13)
    - spike/wasm-microbench/README.md (throwaway, per D-13)
    - spike/wasm-microbench/harness/index.html (throwaway, per D-13)
    - spike/wasm-microbench/harness/run.mjs (throwaway, per D-13)
    - spike/wasm-microbench/harness/js-reference.ts (throwaway, per D-13)
    - spike/wasm-microbench/harness/js-batched-reference.ts (throwaway, per D-13)

key-decisions:
  - "Rust/wasm-pack/cargo toolchain was absent from this sandbox and was installed fresh (rustup minimal profile + wasm32-unknown-unknown target + a host gcc, since cargo compiles proc-macro/build-script crates for the host target even for a wasm32-unknown-unknown build + cargo install wasm-pack) — all via official installers, never via npm, per the Package Legitimacy Audit in 01-RESEARCH.md"
  - "The WASM arm's single-call raw timing landed bit-for-bit identical to the JS arm's own recorded PERF-02 raw figure (0.09999999962747097ms) — both hit performance.now()'s effective resolution floor in headless Chromium on this machine. Rather than report this as a ratio, a secondary 5,000-call batched measurement was added (WASM in the same Chromium harness; JS as a labelled-supplementary Node V8 figure) to recover a genuinely resolvable per-call cost, reproduced across three independent runs (1.19x-1.20x)"
  - "The measured WASM-vs-JS ratio (~1.20x, WASM SLOWER) contradicts the specific 'near parity' wording in 01-CONTEXT.md's Rationale for JS-first block. This is recorded plainly in both 01-SPIKE-RESULTS.md and the PROJECT.md Key Decision rather than reconciled away — the rationale's ultimate conclusion (plain JS, WASM not adopted) is strengthened, not weakened, by a result stronger than what was predicted"
  - "No measured figure (PERF-02 1.1%, PERF-03 32.7%, PERF-05 0%) crosses the D-20 70% escalation trigger, so no third Key Decision row was added and no budget was relaxed"

patterns-established:
  - "A throwaway architecture-decision spike's crate lives entirely outside the npm dependency graph and CI, with its harness (HTML page + Node driver script) also deleted alongside the Rust source — nothing survives but the markdown finding it produced"

requirements-completed: [PERF-01a, PERF-11]

coverage:
  - id: D1
    description: "A Rust WASM microbenchmark ports make_seeded_gbm_series and the branchy run_spike_backtest recurrence bit-for-bit, built with wasm-pack, and its output is proven element-wise equal to the JS arm's before any ratio is trusted"
    requirement: PERF-01a
    verification:
      - kind: integration
        ref: "node spike/wasm-microbench/harness/run.mjs (Task 1, before deletion): equivalenceOk=true, relativeDifference=3.385e-16, ruined match exact"
        status: pass
      - kind: unit
        ref: "cargo build --target wasm32-unknown-unknown --release && wasm-pack build --target web --release exits 0, produces pkg/*.wasm"
        status: pass
    human_judgment: false
  - id: D2
    description: "The Rust crate is deleted at phase end, leaving no npm dependency, no CI step, and no permanent toolchain cost"
    requirement: PERF-01a
    verification:
      - kind: other
        ref: "test ! -e spike exits 0; grep -c cargo .github/workflows/ci.yml (excluding comments) = 0; node -e banned-wasm-dependency check exits 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "01-SPIKE-RESULTS.md records method, raw labelled numbers (machine + core count on every row), the JS-vs-WASM ratio, the D-20 escalation evaluation, and reproduction steps"
    requirement: PERF-11
    verification:
      - kind: other
        ref: "grep -n '^## ' 01-SPIKE-RESULTS.md shows all 5 required sections; every row of the Raw numbers table names hardwareConcurrency=9 and the machine label"
        status: pass
    human_judgment: false
  - id: D4
    description: "Both architecture Key Decisions are recorded in PROJECT.md, each citing a measured millisecond figure and machine, linking to 01-SPIKE-RESULTS.md, with all pre-existing rows byte-identical to before"
    requirement: PERF-11
    verification:
      - kind: other
        ref: "grep -c 01-SPIKE-RESULTS .planning/PROJECT.md = 2; git diff .planning/PROJECT.md shows a pure-addition diff (two new lines, zero existing lines touched)"
        status: pass
    human_judgment: false
  - id: D5
    description: "npm run typecheck, npx vitest run --project unit, and npm run bench all exit 0 after the crate's deletion, proving nothing outside spike/ depended on it"
    requirement: PERF-11
    verification:
      - kind: integration
        ref: "npm run typecheck exits 0; npx vitest run --project unit: 4 files, 45 tests, all pass; npm run bench: 3 files, 9 tests pass, PERF-02/03/05 report pass verdicts unchanged"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-08-16
status: complete
---

# Phase 1 Plan 4: WASM Spike, Spike Results, and the Two Architecture Key Decisions Summary

**A throwaway Rust WASM microbenchmark of the identical branchy per-bar recurrence, proven equal to the JS arm within 1e-9 relative tolerance, measured WASM at ~1.20x SLOWER than JS on this machine — not the "near parity" 01-CONTEXT.md predicted, which strengthens rather than weakens the plain-JS decision now recorded in PROJECT.md alongside the hand-rolled-Canvas decision, with the Rust crate deleted and its finding preserved in `01-SPIKE-RESULTS.md`.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-08-16
- **Tasks:** 3
- **Files:** 1 created (permanent), 2 modified, 8 created-then-deleted (throwaway, per D-13)

## Accomplishments

- Installed a full Rust toolchain from scratch in this sandbox (rustup, `wasm32-unknown-unknown` target, a host `gcc` — required even for a wasm-target build because cargo compiles proc-macro/build-script crates for the host first, `cargo install wasm-pack`), entirely outside `package.json`, per the Package Legitimacy Audit
- `spike/wasm-microbench/src/lib.rs`: ported `makeSeededGbmSeries` (mulberry32 + trigonometric Box-Muller) and `runSpikeBacktest` (contribution schedule, ruin clamp with absorbing state, calendar-day financing, trading-day expense accrual) bit-for-bit to Rust, using `u32` throughout so the PRNG's bit pattern matches JS's `Math.imul`/`>>>` exactly without signed/unsigned juggling
- A Playwright-driven harness (`harness/run.mjs` + `harness/index.html`) ran the compiled WASM module in the same headless Chromium `npm run bench` uses, proved the WASM output equal to a real (not reimplemented) JS reference computed via Node's native TS type-stripping, then measured both a single-call and a 5,000-call batched figure using the same calibration-normalized minimum-of-5 methodology as `bench/calibration.ts`
- Discovered and honestly characterized a timer-resolution floor: the single-call raw time was bit-for-bit identical between the two arms (both at `performance.now()`'s effective resolution), so a batched measurement was added to recover a genuine, reproducible ratio (~1.20x, WASM slower) instead of reporting a floor-limited number as precise
- `01-SPIKE-RESULTS.md`: the permanent record — method, a raw-numbers table with machine/cores/browser/OS/calibration-score on every row, the ratio (stated plainly against the CONTEXT.md prediction it contradicts), the D-20 escalation evaluation (nothing crosses 70%), and verbatim reproduction steps
- Two new `PROJECT.md` Key Decisions rows (plain JS over WASM; hand-rolled Canvas over any charting library), each citing a measured figure, machine, and linking to the spike results document; `STATE.md`'s Phase 1 Blockers/Concerns entry rewritten from "provisional" to "locked"
- `spike/` deleted entirely: `test ! -e spike` passes, no npm dependency, no CI `cargo` invocation, `npm run typecheck`/`vitest run --project unit`/`npm run bench` all still pass

## Task Commits

1. **Task 1: Throwaway Rust microbenchmark of the same branchy recurrence, yielding the JS-versus-WASM ratio** - `efa54fa` (feat)
2. **Task 2: Record the spike results permanently and delete the Rust crate** - `efce5f4` (docs)
3. **Task 3: Record the two architecture Key Decisions in PROJECT.md, each citing its measured figure** - `c976a58` (docs)

## Files Created/Modified

- `.planning/phases/01-performance-spike-and-budget-lock/01-SPIKE-RESULTS.md` (new, permanent) - Method, Raw numbers, JS versus WASM ratio, Escalation evaluation, Reproduction steps
- `.planning/PROJECT.md` (modified) - two new Key Decisions rows, pure addition, all prior rows untouched
- `.planning/STATE.md` (modified) - Accumulated Context Decisions gained three entries; Phase 1 Blockers/Concerns rewritten from provisional to locked
- `spike/wasm-microbench/{Cargo.toml,Cargo.lock,src/lib.rs,README.md,harness/{index.html,run.mjs,js-reference.ts,js-batched-reference.ts}}` (created in Task 1, deleted in Task 2, per D-13 — no trace remains on disk; full content recoverable from commit `efa54fa` if ever needed)

## Decisions Made

- **The Rust toolchain was installed fresh, not merely verified present.** The dispatch context reported `cargo`/`rustc`/`wasm-pack` all absent. Installed via `rustup` (official shell installer, minimal profile, stable channel) plus a host `gcc` (also absent — needed because cargo compiles proc-macro/build-script crates for the host architecture even when the final target is `wasm32-unknown-unknown`) plus `cargo install wasm-pack`. Nothing was added to `package.json`; the toolchain lives entirely in `~/.cargo`/`~/.rustup` and system `gcc`, matching D-13's "the toolchain leaves with the code" premise (the toolchain itself is not deleted from the sandbox, but nothing in the repository references it after Task 2).
- **A batched (5,000-call) secondary measurement was added beyond the plan's literal single-call instruction**, because the single-call figure turned out to be bit-for-bit identical between the two arms — a shared timer floor, not a meaningful measurement. Reporting that as "WASM ≈ JS, ratio 1.0x" would have been the exact kind of fabricated precision the dispatch context explicitly warned against. The batch gives a genuinely resolvable, three-times-reproduced figure (1.19x-1.20x) instead.
- **The batched JS reference runs under Node's V8, not headless Chromium's V8**, and this is stated as an explicit caveat rather than silently treated as equivalent to the Chromium-measured WASM figure. Building an equivalent in-browser batched JS measurement would have required either adding a new row to the locked, permanent `bench/kernel.bench.test.ts` (a Rule 4/architectural change to the D-02 measurement methodology, out of scope for a throwaway ratio) or bundling TypeScript into the browser harness (added complexity for a number whose engine-behavior-dominated nature makes Node V8 a reasonable secondary proxy). The primary same-environment figure (single-call, Chromium-only) remains the one actually compared against the already-recorded PERF-02 figure in the PROJECT.md Key Decision's headline claim; the batched ratio is reported as corroborating, labelled evidence.
- **The measured ratio contradicts CONTEXT.md's "near parity" prediction and this is stated plainly, not smoothed over.** WASM measured ~20% slower, not on par. The overall JS-first conclusion is not weakened by this — if anything it is strengthened, since the rationale's weakest fallback argument ("even if WASM won by some margin, it wouldn't be worth adopting") is now moot: WASM does not win here at all.
- **No third Key Decision row was added.** All three measured figures (PERF-02 1.1%, PERF-03 32.7%, PERF-05 0%) are well under the D-20 70% escalation trigger, so per the plan's own conditional instruction, no escalation row was owed and none was written.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed a host C toolchain (`gcc`) beyond the plan's named Rust/wasm-pack toolchain**
- **Found during:** Task 1, first `cargo build --target wasm32-unknown-unknown --release` attempt
- **Issue:** `rustup` installed cleanly but warned "no default linker (`cc`) was found in your PATH." A `wasm32-unknown-unknown` build still requires compiling proc-macro and build-script crates (used transitively by `wasm-bindgen`) for the *host* target first, which needs a host linker. This sandbox had `libgcc-s1` but no `cc`/`gcc` binary, and `cargo install wasm-pack` (a pure-Rust host binary) would have failed identically.
- **Fix:** `sudo apt-get update && sudo apt-get install -y gcc` (passwordless sudo was available; verified before use).
- **Files modified:** none (system package install, not a repository file).
- **Verification:** `cargo build --target wasm32-unknown-unknown --release` and `wasm-pack build --target web --release` both exit 0 afterward.
- **Committed in:** not applicable (system-level toolchain install, not a repository change); documented here and in `01-SPIKE-RESULTS.md`'s reproduction steps.

**2. [Rule 3 - Blocking] Installed Playwright's Chromium browser and its Linux system dependencies**
- **Found during:** Task 1, first `node spike/wasm-microbench/harness/run.mjs` run
- **Issue:** `browserType.launch` failed with "Executable doesn't exist" — no cached Playwright browser was present in this sandbox, despite `playwright` already being a project devDependency from plan 01-01.
- **Fix:** `npx playwright install chromium`, then `sudo npx playwright install-deps chromium` (the download succeeded but flagged missing Linux shared libraries — `libnss3`, `libatk-bridge2.0-0t64`, etc. — required to actually launch the browser headlessly).
- **Files modified:** none (browser cache + system packages, not a repository file).
- **Verification:** `node spike/wasm-microbench/harness/run.mjs` and `npm run bench` both launch headless Chromium successfully afterward.
- **Committed in:** not applicable (system/cache-level install, not a repository change).

**3. [Rule 2 - Missing functionality] Added a batched (5,000-call) secondary timing measurement, beyond the plan's literal single-call + optional-sweep instruction**
- **Found during:** Task 1, after observing the WASM arm's single-call raw time was bit-for-bit identical to the JS arm's own recorded PERF-02 raw figure
- **Issue:** The plan's action text asks for "a single-backtest timing in milliseconds using minimum of 5 repeats." Doing exactly that produced a number that could not honestly be called a ratio — both arms hit the identical timer floor. Reporting it as a precise multiplier (or omitting the caveat) would have violated the explicit "an honest 'could not measure' is a correct outcome; an invented number is not" instruction.
- **Fix:** Added a 5,000-call batched measurement inside one timed unit (both arms), amortizing the timer's coarsening to recover a genuinely resolvable per-call figure, reproduced across three independent runs (1.19x-1.20x).
- **Files modified:** `spike/wasm-microbench/harness/index.html` (batched WASM measurement), `spike/wasm-microbench/harness/js-batched-reference.ts` (new file, batched JS reference), `spike/wasm-microbench/harness/run.mjs` (orchestration) — all within `spike/`, all deleted in Task 2.
- **Verification:** `node spike/wasm-microbench/harness/run.mjs`'s printed `timing.batched` block, reproduced across three separate invocations with consistent results.
- **Committed in:** `efa54fa` (Task 1 commit; the harness files were deleted in `efce5f4`, Task 2's commit, per D-13).

---

**Total deviations:** 3 auto-fixed (2 blocking toolchain/environment installs, 1 missing-functionality addition). None reduced any plan acceptance criterion; the batched measurement addition exists specifically because the literal single-call instruction alone would have produced an unusable (floor-limited) number, and the plan's own dispatch context explicitly forbade reporting an unmeasurable ratio as if it were precise.
**Impact on plan:** No acceptance criterion was skipped or weakened. The two toolchain/environment installs were prerequisites the plan's own precondition check (`cargo --version`, `rustc --version`, `wasm-pack --version`, Playwright's Chromium) required to be satisfied before Task 1 could proceed at all.

## Issues Encountered

- **Rust and Playwright's Chromium browser were both absent from this sandbox at plan start**, despite the dispatch context noting `cargo`/`rustc`/`wasm-pack` absence explicitly (network availability was pre-verified and confirmed sufficient). Both were installed successfully within the session; see Deviations above.
- **The single-call timing methodology, applied exactly as the plan's action text describes, produced an unusable floor-limited figure.** This was not a bug to fix but a genuine measurement limit; resolved by adding the batched secondary figure (see Deviations, item 3) rather than either fabricating precision or abandoning the timing entirely.

## User Setup Required

None. This plan added no permanent dependency, no environment variable, and no external service. The Rust toolchain and Playwright's Chromium browser now live in this sandbox's `~/.cargo`/`~/.rustup`/`~/.cache/ms-playwright` and system `gcc` package, but nothing in the repository references them after Task 2's deletion — a fresh clone or CI runner needs neither unless `spike/wasm-microbench` is ever recreated from `01-SPIKE-RESULTS.md`'s reproduction steps.

## Next Phase Readiness

- **Phase 1 is complete.** All four plans (01-01 through 01-04) are done: the measurement harness, the kernel/sweep spike, the canvas repaint arms, and now the two architecture Key Decisions plus the locked budget table.
- **Phase 3 (simulation kernel)** inherits the plain-JS-with-Worker-pool architecture decision directly — no WASM escalation is warranted by this phase's findings, and the real kernel can proceed on the same `Float64Array`-based, allocation-free discipline `bench/kernel.ts` already demonstrates.
- **Phase 7 (sweep engine)** inherits the hand-rolled `putImageData`-based Canvas 2D renderer as the settled heatmap implementation, and the Worker-pool partitioning pattern (`bench/sweep-pool.ts`/`bench/sweep.worker.ts`) as the reference architecture for the real sweep.
- **The D-17 `ubuntu-latest` CI baseline has still not produced a real run** (no GitHub remote configured yet, carried over from 01-01-SUMMARY.md) — every figure in this phase, including the two Key Decisions' cited numbers, is an informational dev-machine measurement. `.planning/STATE.md` and `01-SPIKE-RESULTS.md` both flag this explicitly; re-verifying against the real baseline once a remote exists is recommended but does not block downstream phases, since the margins involved (PERF-03 at 32.7% of budget, WASM measurably slower not faster) are large enough that ordinary runner variance is unlikely to flip the conclusion.
- **`NOMINAL_REFERENCE_MS` (calibration anchor) still needs re-verification against the real CI baseline**, carried over unresolved from 01-01/01-02/01-03.

## Self-Check: PASSED

All 3 claimed files verified present on disk (`01-SPIKE-RESULTS.md`, `.planning/PROJECT.md`, `.planning/STATE.md`); `test ! -e spike` confirmed the throwaway crate is gone. All 3 claimed commit hashes (`efa54fa`, `efce5f4`, `c976a58`) verified present in `git log --oneline --all`.

---
*Phase: 01-performance-spike-and-budget-lock*
*Completed: 2026-08-16*
