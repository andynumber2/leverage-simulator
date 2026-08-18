---
phase: 03-simulation-kernel-and-the-upro-tqqq-gate
verified: 2026-08-18T04:55:10Z
status: human_needed
score: 16/16 must-haves verified (requirement IDs); 1 backstop truth unverifiable by evidence
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Confirm src/data/kernel-inputs.ts's series selector performs no I/O and holds no mutable state after loadBundleFromDisk() returns, so two concurrent callers sharing one LoadedBundle observe the same immutable views without interference (SIM-07 concurrency edge, 03-04-PLAN.md must_haves, verification: backstop)."
    expected: "No shared mutable field is written by buildKernelInputs after load time; two parallel callers over the same LoadedBundle produce independent, non-interfering results."
    why_human: "No test in tests/data/kernel-inputs.test.ts exercises concurrent/parallel calls over a shared LoadedBundle. The plan itself marks this truth `verification: backstop`, meaning it is carried as an explicit unresolved assumption rather than silently passed. Grep for 'concurren' or 'parallel' across tests/data/kernel-inputs.test.ts and src/data/kernel-inputs.ts returns nothing."
  - test: "Mark WINDOWS.md entry 3 (kind unmet-truth, phase 03, 'VALID-01/02 gate is RED...') as fixed, since the underlying gate is now GREEN as of commit 330724a."
    expected: "Entry 3's status changes from open to fixed, with resolved_at set, so open_count in the ledger header reflects reality and does not incorrectly block a future `/gsd-ship` run."
    why_human: "This is a bookkeeping/process gap, not a code defect: the ledger still asserts the RED-gate finding recorded during plan 03-06's halt, and the docs(phase-03) tracking-update commit that followed the D-20 resolution (fafb80c) only touched ROADMAP.md, not WINDOWS.md."
---

# Phase 3: Simulation Kernel and the UPRO/TQQQ Gate Verification Report

**Phase Goal:** The simulation is demonstrably right against real leveraged-ETF history, before a
single pixel of UI is built on top of it
**Verified:** 2026-08-18T04:55:10Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Summary

All five ROADMAP success criteria are independently reproduced against the actual codebase, not
inferred from SUMMARY.md prose. `npm run typecheck` exits 0, `npm run test` passes 381/381,
`npm run bench` reports PERF-02 at 0.22ms (source=production) against the 16ms budget, and the
UPRO/TQQQ gate is GREEN for both funds when re-run fresh in this session (UPRO TE 3.2149% / drift
+0.2538%, TQQQ TE 3.5331% / drift +0.3986%, both inside their tolerances). The integrity
constraints (VALID-03's no-fitting rule, D-19's commit ordering, D-15's tolerance-revision
protocol) all hold under direct git-history and diff inspection. One narrow `verification:
backstop` truth from plan 03-04 has no test evidence and is routed to human verification rather
than silently passed. A process-bookkeeping gap (a stale WINDOWS.md ledger entry) is also flagged.
Neither finding indicates the phase goal was not achieved in code.

## Goal Achievement

### ROADMAP Success Criteria (the real bar)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Synthetic 3x SPX tracks UPRO, synthetic 3x NDX tracks TQQQ, inside a documented tolerance enforced as a build-failing test, tracking error via one shared function | ✓ VERIFIED | `src/validation/tracking-error.ts` exports `computeTrackingError`/`annualizedTrackingError`/`annualizedReturnDrift`; `tests/validation/upro-tqqq-gate.test.ts` is the only caller of the kernel-vs-fund comparison and calls this function exclusively (`grep computeTrackingError` in the gate test); re-run independently: 2/2 tests pass, UPRO TE 3.2149% ≤ tolerance 3.9550%, drift +0.2538% ≤ 0.5250%; TQQQ TE 3.5331% ≤ 3.9550%, drift +0.3986% ≤ 0.5250%. CI (`npm test` in `.github/workflows/ci.yml`) runs this gate after `npm run compile-data` re-derives the bundle, so it doubles as the "CI data-change check." The in-app view (VALID-04) is correctly out of scope (Phase 5); the function's signature takes only `Float64Array`+scalars and assumes no test context, so it is ready to be reused unchanged. |
| 2 | Cost parameters sourced independently, written down before validation first ran, git history shows no post-hoc adjustment; residual reported not narrowed | ✓ VERIFIED | `git log --oneline -- src/validation/cost-parameters.ts` shows `da257a5`/`bcecbcb` (wave 2) strictly before `tracking-error.ts`'s `2974140` (wave 4) and before the gate resolution `330724a`. `git log -p` on the file shows every `value: 0.0095 / 0.009 / 0.002 / 0.008` line appears exactly once across the file's entire history — introduced once in `da257a5`, never touched again, including in the post-halt fix commit `330724a`. That commit's diff to `cost-parameters.ts` touches only one `TOLERANCE_MECHANISMS` row's `basisPointsPerYear`/`basis`/`confidence` and adds a `measured` field plus the `sumMechanismsForScope` computation — no expense ratio or financing-spread constant appears in the diff. The residual is printed unconditionally on every run (`console.log` blocks for full window + 2 sub-windows, both funds, verified by direct re-run). |
| 3 | Every correctness-checklist item passes as a unit test: 1x invariant, daily-not-cumulative leverage, calendar-day accrual (3-day weekend = 3 days interest), ruin clamp/flag/absorbing state | ✓ VERIFIED | `tests/kernel/pitfalls-a.test.ts` (A1, A2, A4, A8, A10, A11 + D-03/05/07/08) and `tests/kernel/ruin.test.ts` (A7 + D-04 + the 12-entry A1–A12 disposition table) both re-run green. Source inspection of `src/kernel/backtest.ts` confirms: bar 0 is cost-free (`outValue[0] = initialInvestment`, no return/cost); `value = value * (1 + leverage * dailyReturn)` (daily, never cumulative); financing `* (calendarGap / 360)` and expense `* (calendarGap / 365)` are separate calendar-day-scaled terms; ruin is `value <= 0` evaluated after both cost terms, clamps to exactly 0, sets `ruined=true` permanently, drops but counts post-ruin contributions. All 20+ assertions independently re-run pass. |
| 4 | A script runs one real backtest end to end, exercising the full parameter surface (1x–20x fractional, initial+recurring contributions at 4 frequencies, dividend toggle, fixed/hold-to-today, sourced ER/spread defaults) | ✓ VERIFIED | `npm run run-backtest -- --symbol SPX --leverage 3 --entry 1990-01-02 --holding-bars 2520 --initial 10000` re-run directly: exits 0, prints a full header + dated equity curve + summary. `npm run run-backtest -- --symbol SPX --leverage 2.5 --entry 2015-01-30 --holding-bars 2520 --initial 10000 --contribution 500 --frequency monthly --dividends reinvest --json` re-run directly: `contributionCount=120`, `totalContributed=70000` (= 10000 + 500×120), header names `GENERIC_3X_EXPENSE_RATIO`/`FINANCING_SPREAD_DEFAULT` with confidence tags and the spread's full range. Leverage boundary, dividend-toggle series selection and holding-mode equivalence are each held by a named unit test in `tests/data/kernel-inputs.test.ts`. |
| 5 | A single backtest over ~25,000 bars completes under 16ms; 10,000 invocations show no measurable GC pressure; the kernel is one module with no imports from data/sweep/chart | ✓ VERIFIED | `npm run bench` re-run directly: `PERF-02 | source=production | measured=0.22ms | budget=16ms | verdict=pass`, `barCount=24772`, `seriesId=SPX/price-return`. `npm run test -- tests/kernel/allocation.test.ts` re-run directly: 2/2 pass — a forced-collection heap-delta measurement over 10,000 real `runBacktest` calls plus an independent batch-flatness cross-check (500 vs 5000), both non-vacuous (guard fails loud, not skip, if `--expose-gc` is absent — the `execArgv` entry is present in `vitest.config.ts`). `npm run test -- tests/kernel/module-boundary.test.ts` re-run directly: 8/8 pass, asserting `src/kernel/backtest.ts` imports only `./backtest.types.ts` (confirmed by direct `grep -n "^import"` — a single `import type` line) and that `backtest.types.ts` has zero imports. |

**Score:** 5/5 ROADMAP success criteria verified.

### Integrity Constraints (the phase's real value)

| Constraint | Verdict | Evidence |
|---|---|---|
| **VALID-03** — no cost parameter ever adjusted in response to a measured tracking error | ✓ VERIFIED | Every `value:` literal in `COST_PARAMETERS` appears exactly once in `git log -p -- src/validation/cost-parameters.ts` across all three commits touching the file (`da257a5`, `bcecbcb`, `330724a`). The post-halt resolution commit's diff to this file contains zero lines referencing `UPRO_INCEPTION_ERA_EXPENSE_RATIO`, `TQQQ_INCEPTION_ERA_EXPENSE_RATIO`, `FINANCING_SPREAD_RANGE`, or `FINANCING_SPREAD_DEFAULT` (confirmed by `grep` over the diff, zero matches). The only numeric edit is one `TOLERANCE_MECHANISMS` row's `basisPointsPerYear`. |
| **VALID-02** — the tracking-error tolerance widening (0.66% → 3.955%) was done only by repricing a named mechanism with its basis stated in the same diff, per D-15 | ✓ VERIFIED, with a judgment note | `TRACKING_ERROR_TOLERANCE`/`RETURN_DRIFT_TOLERANCE` are `sumMechanismsForScope(...)` calls, never literals (confirmed by reading the source directly — no numeric literal assigned to either export). The widening commit (`330724a`) reprices exactly one row (`fund-nav-vs-market-close-pricing-basis`, 15bp→352bp), corrects its factual basis (the reference series are Yahoo market closes, not NAV, per the manifest), tags it `measured: true`, and adds two new pinning tests (`tests/validation/cost-parameters.test.ts`) that recompute both tolerances independently and assert a measured row is excluded from `TOLERANCE_SAFETY_FACTOR`. The measurement is reproducible: it's each fund's own realized daily return minus 3× its own benchmark's daily return, no cost model applied, sample stdev × sqrt(252). This is corroborated independently by the gate's own re-measured *with-cost* tracking error (UPRO 3.2149%, TQQQ 3.5331%) landing almost exactly at the claimed *no-cost* floor (3.198%/3.519%) — strong evidence the mechanism genuinely explains the residual rather than being an arbitrary number. **Judgment note (not a blocker):** 89% of the widened tracking-error tolerance (352 of 395.5bp) comes from this single measured row, which was itself derived from the same two funds the gate tests, and TQQQ's margin against the tolerance is comparatively thin (3.5331% measured vs 3.9550% tolerance, ~11% headroom) largely because the widening's dominant term is pinned to TQQQ's own observed no-cost floor. This is a legitimate application of D-15 (a data-quality mechanism external to the cost model, not a cost-parameter tune), but a human should be aware the margin is real rather than generous. |
| **VALID-02** — no sub-window gates the build | ✓ VERIFIED | `tests/validation/upro-tqqq-gate.test.ts` asserts only on the full-window `TrackingErrorResult`; the near-zero-rate-era and high-rate-era sub-window results are `console.log`'d only, confirmed by reading the assertion block (only the full-window object is passed to `expect(...).toBeLessThanOrEqual(...)`). |
| **D-19** — `src/validation/cost-parameters.ts` committed strictly before any other file under `src/validation/` | ✓ VERIFIED | `git log --oneline -- src/validation/` (oldest first): `da257a5` and `bcecbcb` (both touching only `cost-parameters.ts`) precede `2974140` (`tracking-error.ts`'s first commit) and `330724a`. |
| **SIM-10** — the kernel has no runtime imports | ✓ VERIFIED | `grep -n "^import" src/kernel/backtest.ts` returns exactly one line: `import type { ... } from './backtest.types.ts'`. `src/kernel/backtest.types.ts` has zero import lines. `tests/kernel/module-boundary.test.ts` (8/8 passing) reads this at test time from source text, so a future regression is mechanically caught, not merely commented. |

### Deviations From D-10 as Originally Written

D-10 was amended mid-phase (`03-CONTEXT.md`, dated 2026-08-18, after plan 03-06 first ran the
gate) to compare synthetic total-return-based 3x against the funds' total-return series, rather
than price-return-based synthetic against total-return funds as D-10 originally specified. This is
disclosed transparently in `03-CONTEXT.md`'s amendment block and in the gate test's own inline
comment, with the reasoning (dividend-convention asymmetry, not a cost defect) and the exact
before/after numbers. This is a legitimate D-20 outcome-1 structural fix, not a fitting violation,
and it is flagged forward correctly for Phase 5's VALID-04 view.

### Required Artifacts (all six plans)

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/kernel/backtest.types.ts` | Typed-array/scalar boundary contract | ✓ VERIFIED | 93 lines, zero imports, exports match interface exactly |
| `src/kernel/backtest.ts` | Allocation-free kernel | ✓ VERIFIED | 161 lines (min 90), type-only import, matches D-01–D-24 behavior on direct read |
| `src/data/kernel-inputs.ts` | Data-layer seam | ✓ VERIFIED | 304 lines, `loadBundleFromDisk`/`buildKernelInputs` present and wired |
| `src/data/contribution-schedule.ts` | D-25–D-28 schedule resolution | ✓ VERIFIED | 209 lines (min 90), calendar-anchored, collision-throwing |
| `src/validation/cost-parameters.ts` | Sourced, pinned constants + tolerances | ✓ VERIFIED | 517 lines (min 120), citations present, tolerances computed not literal |
| `src/validation/tracking-error.ts` | D-12's shared function | ✓ VERIFIED | 205 lines (min 80), zero kernel/data-layer imports |
| `scripts/run-backtest.ts` | End-to-end CLI | ✓ VERIFIED | 293 lines, `--json` machine-readable output confirmed |
| `bench/kernel-series-bridge.ts` | Node→browser bench bridge | ✓ VERIFIED | present, wired into `vitest.config.ts`'s `readKernelSeries` command |
| `tests/kernel/module-boundary.test.ts` | SIM-10 + D-32 mechanical proof | ✓ VERIFIED | 158 lines, 8/8 passing |
| `tests/kernel/pitfalls-a.test.ts` | SIM-12 checklist part 1 | ✓ VERIFIED | 324 lines (min 150) |
| `tests/kernel/ruin.test.ts` | SIM-12 checklist part 2 + A1–A12 table | ✓ VERIFIED | 252 lines (min 90) |
| `tests/kernel/allocation.test.ts` | SIM-11 heap-delta proof | ✓ VERIFIED | 146 lines (min 60), non-vacuous guard confirmed |
| `tests/data/kernel-inputs.test.ts` | Data-layer + SIM-06/07/08 coverage | ✓ VERIFIED | 388 lines |
| `tests/data/contribution-schedule.test.ts` | D-25–D-28 coverage | ✓ VERIFIED | 241 lines (min 90) |
| `tests/validation/cost-parameters.test.ts` | D-19 pinning + D-14 derivation + measured-row rule | ✓ VERIFIED | 205 lines (min 60) |
| `tests/validation/tracking-error.test.ts` | Hand-computed reference coverage | ✓ VERIFIED | 217 lines (min 70) |
| `tests/validation/upro-tqqq-gate.test.ts` | The build-failing gate | ✓ VERIFIED | 419 lines (min 100), 2/2 passing on direct re-run |

### Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| `src/data/kernel-inputs.ts` | `tools/bundle-compiler/src/binary-format.ts` | `decodeHeader`/`seriesView`/`calendarView` | ✓ WIRED |
| `scripts/run-backtest.ts` | `src/kernel/backtest.ts` | `runBacktest` call | ✓ WIRED |
| `tests/kernel/pitfalls-a.test.ts` / `ruin.test.ts` | `src/kernel/backtest.ts` | direct `runBacktest` import | ✓ WIRED |
| `src/data/kernel-inputs.ts` | `src/data/contribution-schedule.ts` | `resolveContributionBars`/`buildContributionFlags` | ✓ WIRED |
| `tests/validation/upro-tqqq-gate.test.ts` | `src/validation/tracking-error.ts` | `computeTrackingError` (sole path to either statistic) | ✓ WIRED |
| `tests/validation/upro-tqqq-gate.test.ts` | `src/validation/cost-parameters.ts` | per-fund ER, spread default, both tolerances read not restated | ✓ WIRED |
| `bench/kernel.bench.test.ts` | `src/kernel/backtest.ts` | `runBacktest` replacing `runSpikeBacktest` | ✓ WIRED (confirmed `grep -c runSpikeBacktest` = 0, `grep -c runBacktest` ≥ 1) |
| `src/kernel/backtest.ts` | `src/validation/tracking-error.ts` | **must NOT exist** (D-12/SIM-10) | ✓ CONFIRMED ABSENT |

### Behavioral Spot-Checks (independently re-run, not inherited from SUMMARY claims)

| Behavior | Command | Result | Status |
|---|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 | ✓ PASS |
| Full unit suite | `npm run test -- --run` | 381/381 passed, 26 files | ✓ PASS |
| UPRO/TQQQ gate | `npm run test -- tests/validation/upro-tqqq-gate.test.ts` | 2/2 passed, GREEN with printed figures matching SUMMARY | ✓ PASS |
| Module boundary | `npm run test -- tests/kernel/module-boundary.test.ts` | 8/8 passed | ✓ PASS |
| Allocation/GC proof | `npm run test -- tests/kernel/allocation.test.ts` | 2/2 passed | ✓ PASS |
| Bench suite (PERF-02) | `npm run bench` | PERF-02 source=production, 0.22ms, pass | ✓ PASS |
| End-to-end CLI (lump sum) | `npm run run-backtest -- --symbol SPX --leverage 3 --entry 1990-01-02 --holding-bars 2520 --initial 10000` | exit 0, dated curve, correct header | ✓ PASS |
| End-to-end CLI (full surface) | `npm run run-backtest -- ... --contribution 500 --frequency monthly --dividends reinvest --json` | exit 0, `contributionCount=120`, `totalContributed=70000` | ✓ PASS |
| Kernel import discipline | `grep -n "^import" src/kernel/backtest.ts` | one `import type` line only | ✓ PASS |
| Cost-parameter immutability | `git log -p -- src/validation/cost-parameters.ts` \| grep value literals | each literal appears exactly once across all history | ✓ PASS |
| D-19 ordering | `git log --oneline -- src/validation/` | constants commits precede tracking-error.ts commit | ✓ PASS |

### Requirements Coverage

All 16 requirement IDs assigned to Phase 3 in REQUIREMENTS.md appear in exactly one plan's
frontmatter `requirements:` field, and the union across all six plans equals the phase's full set
with no gaps and no duplicates left uncovered:

| Requirement | Plan | Status | Evidence |
|---|---|---|---|
| SIM-01 | 03-01, 03-02 | ✓ SATISFIED | Fractional leverage 1x–20x, CLI-boundary validated, credit case at 0.5x tested |
| SIM-02 | 03-01, 03-02 | ✓ SATISFIED | Daily-return compounding confirmed in source; A1 divergence test passes |
| SIM-03 | 03-01, 03-02 | ✓ SATISFIED | Two separate day-count bases (360/365) confirmed in source and tests |
| SIM-04 | 03-02 | ✓ SATISFIED | 1e-9 relative bound against real bundle, A10/A11 tests pass |
| SIM-05 | 03-01, 03-02 | ✓ SATISFIED | Ruin clamp/flag/absorbing-state tests pass, non-negative under leverage 20 |
| SIM-06 | 03-04 | ✓ SATISFIED | Calendar-anchored contributions, month-end clamp, leap year, 120-contribution CLI proof |
| SIM-07 | 03-04 | ⚠ PARTIAL (see human_verification) | Series selection, precision and idempotency all tested; the concurrency backstop truth is unverified by evidence |
| SIM-08 | 03-01, 03-04 | ✓ SATISFIED | Boundary/adjacency/ordering cases all tested, hold-to-today ≡ fixed-period proven |
| SIM-09 | 03-03, 03-04 | ✓ SATISFIED | Sourced defaults with confidence tags printed by CLI, pinning test enforces citation-vs-value |
| SIM-10 | 03-01, 03-05 | ✓ SATISFIED | Zero runtime imports, mechanically tested |
| SIM-11 | 03-01, 03-05 | ✓ SATISFIED | Heap-delta + batch-flatness proof, non-vacuous guard |
| SIM-12 | 03-02 | ✓ SATISFIED | 12-entry A1–A12 disposition table, asserted complete |
| VALID-01 | 03-06 | ✓ SATISFIED | Shared function, both funds, gate re-run GREEN |
| VALID-02 | 03-03, 03-06 | ✓ SATISFIED | D-15-compliant widening, sub-windows reported not gated |
| VALID-03 | 03-03, 03-06 | ✓ SATISFIED | Cost parameters provably untouched across full git history |
| PERF-02 | 03-05 | ✓ SATISFIED | 0.22ms measured against production kernel, real bundle |

No orphaned requirements: cross-checking REQUIREMENTS.md's own "Traceability" table against the
above shows all 16 Phase-3-mapped IDs are claimed by at least one plan.

### Anti-Patterns Found

None. Scanned all 17 phase-created/modified source and test files for `TBD`/`FIXME`/`XXX`/`TODO`/
`HACK`/`PLACEHOLDER`/"not yet implemented"/empty-return stubs: zero matches.

### Process / Bookkeeping Findings (not phase-goal blockers)

1. **`.planning/WINDOWS.md` entry 3 is stale.** It records the gate as `open`/RED with the
   pre-resolution figures (UPRO 3.164%/0.66%, TQQQ 3.565%/0.66%), but the gate has been GREEN
   since commit `330724a`. The `docs(phase-03)` tracking commit that followed (`fafb80c`) updated
   only `ROADMAP.md`, not `WINDOWS.md`. Since `workflow.windows_enforce` blocks `/gsd-ship` while
   `open_count > 0`, this should be corrected (`gsd-tools windows fixed 3`) before shipping,
   though it does not indicate any code defect — it is a ledger accuracy issue.
2. **`.planning/STATE.md` is stale** (shown as modified/uncommitted in the working tree at the
   start of this session): it still reads `status: executing`, `stopped_at: Phase 3 context
   gathered`, `completed_plans: 15` even though all 6 of Phase 3's plans are complete. This is
   normal mid-workflow bookkeeping expected to be resolved by the orchestrator after this
   verification completes, not a phase-goal concern.

### Human Verification Required

1. **SIM-07 concurrency edge (03-04-PLAN.md must_haves, `verification: backstop`)**
   - **Test:** Confirm `src/data/kernel-inputs.ts`'s series selector performs no I/O and holds no
     mutable state after `loadBundleFromDisk()` returns, so two concurrent callers sharing one
     `LoadedBundle` observe the same immutable views without interference.
   - **Expected:** No shared mutable field written after load time; parallel callers don't
     interfere.
   - **Why human:** No test exercises this. The plan itself flagged it as a structured backstop
     truth precisely because it cannot be confirmed by grep/static analysis alone, and per the
     honest-verifier rule a backstop truth abstains rather than passes silently absent explicit
     evidence.

2. **WINDOWS.md ledger correction**
   - **Test:** Mark entry 3 `fixed` now that the gate is GREEN.
   - **Expected:** `open_count` in the ledger header drops to reflect the resolved gate.
   - **Why human:** A ledger-state write, not a code verification question.

## Gaps Summary

No must-have truth, artifact, or key link FAILED. All five ROADMAP success criteria and all three
named integrity constraints (VALID-03's no-fitting rule, D-19's commit ordering, D-15's
tolerance-revision protocol) were independently re-derived from the actual git history and source
code in this session, not accepted from SUMMARY.md narrative. One narrow backstop-tier truth
(SIM-07 concurrency) lacks test evidence and is routed to human verification per the stated
honest-verification protocol rather than being marked passed or failed without evidence. A stale
WINDOWS.md ledger entry is flagged for correction before shipping. Status is `human_needed` rather
than `passed` solely because Step 8 produced a non-empty human-verification list; this is not a
finding that the phase goal was missed.

---

*Verified: 2026-08-18T04:55:10Z*
*Verifier: Claude (gsd-verifier)*
