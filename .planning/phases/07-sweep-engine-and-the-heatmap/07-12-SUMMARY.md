---
phase: 07-sweep-engine-and-the-heatmap
plan: 12
subsystem: perf-governance
tags: [perf-03, key-decision, gap-closure, pool-tuning]

requires:
  - phase: 07-sweep-engine-and-the-heatmap
    plan: "07-11"
    provides: "07-PERF-03-BASELINE.md sections 2 and 3: the real, non-withheld D-17 baseline PERF-03 verdict (FAIL) and the contribution-schedule (solveIrr) branch figure, both from CI run 32654061079"
provides:
  - ".planning/PROJECT.md: a new Key Decisions row resolving both the zero-contribution headline overrun (116.9% of budget, FAIL) and the contribution-schedule solveIrr overrun (roughly 8.96x over budget) with one decision -- spend pool tuning first, hold D-03's coarser default grid in reserve"
  - "07-PERF-03-BASELINE.md: a closing '## 4. The recorded decision' section pointing at the PROJECT.md row"
affects: []

actuals:
  tokens: 2458
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - .planning/PROJECT.md
    - .planning/phases/07-sweep-engine-and-the-heatmap/07-PERF-03-BASELINE.md

key-decisions:
  - "Task 1's checkpoint:decision was pre-resolved by the repository owner (relayed via the orchestrator) before this executor ran, correcting a false premise in the plan's own Task 1 context: the zero-contribution sweep is NOT inside budget on the D-17 baseline (it FAILED at 116.9% of budget, measuredMs=952.40/normalizedMs=1168.59, CI run 32654061079). The plan's framing that only the contribution-schedule branch overruns was wrong and was not reproduced in the written record."
  - "Both overruns -- the zero-contribution headline FAIL and the contribution-schedule solveIrr branch's roughly 8.96x overrun -- are resolved in ONE Key Decisions row, on the inference (explicitly hedged as not profiled) that they share a root cause in worker-pool throughput on the 4-core baseline (workerCountForCores(4)=3)."
  - "Lever chosen: pool-tuning, spent first. The coarser default grid (D-03's reserved lever) is explicitly held in reserve, not spent, because D-03 reserved it specifically to keep PERF-03's headline figure describing the fixed 200x50 default view; spending it now would forfeit that before the genuinely-unspent pool-tuning lever has been tried. WASM was already ruled out (01-04 measured it ~1.20x slower than JS)."
  - "PERF-03 is recorded as FAILED, not met. The phase's third roadmap success criterion does not close on this record. This plan is docs-only (files_modified: PROJECT.md and 07-PERF-03-BASELINE.md); naming pool tuning is a decision, not an implementation -- a follow-up phase must measure its effect on the D-17 baseline before PERF-03 can be claimed met."
  - "No thresholdMs, NOMINAL_REFERENCE_MS, or calibration/run-level cap constant changed. git diff --exit-code -- perf-budgets.ts bench/calibration.ts bench/sweep.bench.test.ts exits 0."
  - "07-11's carried-forward finding (the same D-17 baseline run's total bench-suite runtime, 43,259ms, also exceeded the 30,000ms BENCH_TOTAL_RUNTIME_CAP_MS, masked because the verdict-fail check fires first) is recorded again in the new PROJECT.md row and in 07-PERF-03-BASELINE.md's closing section, as a known unresolved fact for the follow-up performance work to encounter. Not acted on here."

patterns-established: []

requirements-completed: [PERF-03]

coverage:
  - id: D1
    description: "PROJECT.md's Key Decisions table carries a row naming PERF-03 and the contribution-schedule/solveIrr branch, resolving both the headline and contribution-schedule overruns as a deliberate decision (pool-tuning first, coarser grid in reserve) rather than silence"
    requirement: PERF-03
    verification:
      - kind: other
        ref: "grep -c \"solveIrr\" .planning/PROJECT.md == 1; git diff --numstat -- .planning/PROJECT.md shows 1 insertion, 0 deletions (no existing row modified or removed)"
        status: pass
      - kind: other
        ref: "git diff --exit-code -- perf-budgets.ts bench/calibration.ts bench/sweep.bench.test.ts exits 0"
        status: pass
      - kind: unit
        ref: "npm run test -- --run tests/perf-budgets.selftest.test.ts (9/9 passed); npm run typecheck exits 0"
        status: pass
    human_judgment: true
    rationale: "Confirming the row's figures are copied verbatim from 07-PERF-03-BASELINE.md (not fabricated or softened), that the corrected premise is stated rather than the plan's false framing, and that the decision reads as a genuine resolution rather than a deferral is a documentation-integrity judgment call, not something a script alone verifies."
  - id: D2
    description: "07-PERF-03-BASELINE.md gains a closing '## 4. The recorded decision' section naming the chosen option and pointing back at the PROJECT.md row, so the measurement and the decision are reachable from each other in both directions"
    requirement: PERF-03
    verification:
      - kind: other
        ref: "grep -q \"## 4. The recorded decision\" .planning/phases/07-sweep-engine-and-the-heatmap/07-PERF-03-BASELINE.md exits 0"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-08-23
status: complete
---

# Phase 07 Plan 12: PERF-03 Escalation Recorded as a Key Decision Summary

**Recorded one PROJECT.md Key Decision resolving both the zero-contribution headline PERF-03
FAIL (116.9% of budget) and the contribution-schedule solveIrr overrun (roughly 8.96x over
budget) together: spend pool tuning first, hold D-03's coarser default grid in reserve, PERF-03
recorded as FAILED not met.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-08-23
- **Tasks:** 2 of 2 completed (Task 1 was a checkpoint:decision, pre-resolved by the repository
  owner before this executor ran; Task 2 wrote the record)
- **Files modified:** 2

## Accomplishments

- Corrected a false premise carried in the plan's own Task 1 context: the zero-contribution
  sweep (the app's default view) is NOT inside budget on the D-17 baseline. It measured
  `measuredMs=952.40`, `normalizedMs=1168.59` against the 1000ms budget -- 116.9% of budget,
  `verdict=fail`, on CI run 32654061079. The written PROJECT.md record does not reproduce the
  plan's incorrect framing.
- Wrote one PROJECT.md Key Decisions row resolving both overruns together: the headline FAIL and
  the contribution-schedule (`solveIrr`) branch's roughly 8.96x overrun (`normalizedMs=8961.84`
  against 1000ms). The row states the decision -- spend `pool-tuning` first, hold the coarser
  default grid (D-03) in reserve -- with the rationale that D-03 reserved the grid specifically
  to keep the headline figure describing the fixed 200x50 default view, so it should not be
  spent before the genuinely-unspent pool-tuning lever is tried.
- Every millisecond figure in the row carries its host core count, `sampleCount`, and an
  informational/non-baseline label wherever it is not the D-17 baseline run, copied verbatim
  from `07-PERF-03-BASELINE.md` sections 2 and 3.
- Recorded, explicitly, that PERF-03 is FAILED and the phase's third roadmap success criterion
  does not close; that no `thresholdMs`, `NOMINAL_REFERENCE_MS`, or cap moved; and that
  implementing pool tuning is a follow-up phase's job, to be measured on the D-17 baseline before
  PERF-03 can be claimed met.
- Appended `## 4. The recorded decision` to `07-PERF-03-BASELINE.md`, naming the chosen option
  and pointing back at the PROJECT.md row.
- Carried forward 07-11's secondary finding (the same baseline run's total bench-suite runtime,
  43,259ms, exceeding the 30,000ms cap, masked by check ordering) into both documents as an
  unresolved fact for later work.

## Task Commits

1. **Task 1: Decide how the contribution-schedule sweep's overrun is resolved** - pre-resolved by
   the repository owner (relayed via the orchestrator) before this executor ran; no commit in this
   worktree. The resolution (scope: both overruns, one row; lever: `pool-tuning`, coarser grid
   held in reserve) is recorded verbatim in this SUMMARY's `key-decisions`.
2. **Task 2: Write the Key Decision row** - `e9f1de3` (docs)

## Files Created/Modified

- `.planning/PROJECT.md` - New Key Decisions row: "PERF-03 D-17 baseline escalation (Phase 7)",
  covering both the headline and contribution-schedule overruns, the levers considered and their
  disposition, and the explicit FAILED verdict
- `.planning/phases/07-sweep-engine-and-the-heatmap/07-PERF-03-BASELINE.md` - New
  `## 4. The recorded decision` closing section

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

**1. [Corrected premise, per explicit instruction] The plan's Task 1 `<context>` block asserted
the zero-contribution sweep is inside budget; this is false and was not written into the record.**
- **Found during:** Task 1 read (pre-resolved checkpoint context)
- **Issue:** The plan text claimed "the zero-contribution sweep, which is the app's default view
  and the configuration PERF-03's headline figure describes, is inside budget," and that the
  overrun is specific to the contribution-schedule branch. `bench/sweep.bench.test.ts`'s
  `baseParams()` sets `contributionAmount: 0`, and the gated `budgetId: 'PERF-03'` test uses
  `defaultParams = baseParams()` -- so the zero-contribution default view IS the failing headline
  row (`verdict=fail`, 116.9% of budget), not a passing one.
- **Fix:** The PROJECT.md row and the 07-PERF-03-BASELINE.md closing section both state the
  headline figure's FAIL verdict directly and resolve it together with the contribution-schedule
  overrun in one decision, rather than implying only the non-default configuration is over
  budget.
- **Files modified:** `.planning/PROJECT.md`, `.planning/phases/07-sweep-engine-and-the-heatmap/07-PERF-03-BASELINE.md`
- **Verification:** Both figures (`measuredMs=952.40`/`normalizedMs=1168.59` headline;
  `measuredMs=7303.90`/`normalizedMs=8961.84` solveIrr) are transcribed verbatim from
  `07-PERF-03-BASELINE.md` sections 2 and 3, which themselves transcribe CI run 32654061079's
  artifact.
- **Committed in:** `e9f1de3`

---

**Total deviations:** 1 (a corrected factual premise, resolved per explicit owner instruction,
not an autonomous deviation-rule fix).
**Impact on plan:** The correction changes what the row says (both overruns resolved together)
but not the scope of files touched or the decision-making process; still docs-only, as the plan
specified.

## Issues Encountered

- This worktree had neither `node_modules` nor `dist/` (fresh worktree, no `npm install`, `dist/`
  is gitignored/build-generated). Symlinked both from the main repo's checkout after confirming
  `package.json`/`package-lock.json` are byte-identical, matching 07-11-SUMMARY.md's documented
  approach. Both symlinks are gitignored and were never staged.

## User Setup Required

None.

## Next Phase Readiness

- The escalation half of 07-03's original prohibition is now complete: the overrun (both arms)
  is a recorded, deliberate PROJECT.md Key Decision under PERF-01a, not silence.
- PERF-03 is recorded as FAILED. Whichever phase implements pool tuning must measure its effect
  on the D-17 baseline (`hardwareConcurrency=4`) before claiming PERF-03 met, and should also
  address the carried-forward `BENCH_TOTAL_RUNTIME_CAP_MS` overrun (43,259ms vs 30,000ms) on the
  same baseline run, since both point at the same real 4-core-host cost profile.
- No blockers.

## Self-Check: PASSED

`.planning/PROJECT.md` and `.planning/phases/07-sweep-engine-and-the-heatmap/07-PERF-03-BASELINE.md`
confirmed modified via `git status --short` (clean except the gitignored `node_modules`/`dist`
symlinks) immediately after the Task 2 commit. Commit `e9f1de3` confirmed present via
`git rev-parse --short HEAD`. `grep -c "solveIrr" .planning/PROJECT.md` returns 1;
`grep -q "## 4. The recorded decision" 07-PERF-03-BASELINE.md` exits 0;
`git diff --exit-code -- perf-budgets.ts bench/calibration.ts bench/sweep.bench.test.ts` exits 0;
`git diff --numstat -- .planning/PROJECT.md` shows 1 insertion / 0 deletions;
`npm run test -- --run tests/perf-budgets.selftest.test.ts` passed 9/9;
`npm run typecheck` exited clean. All confirmed directly, immediately before this SUMMARY was
written.

---
*Phase: 07-sweep-engine-and-the-heatmap*
*Completed: 2026-08-23*
