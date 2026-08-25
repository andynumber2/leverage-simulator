---
phase: 07-sweep-engine-and-the-heatmap
plan: 11
subsystem: bench-harness
tags: [perf-03, bench, ci, gap-closure, d-17-baseline]

requires:
  - phase: 07-sweep-engine-and-the-heatmap
    plan: "07-03"
    provides: "bench/sweep.bench.test.ts retargeted at src/sweep/sweep-pool.ts's production pool -- the sole PERF-03 recorder"
  - phase: 07-sweep-engine-and-the-heatmap
    plan: "07-10"
    provides: "bench/heatmap-panzoom.bench.test.ts, the last Phase 7 bench file added before this plan's runtime-cap audit"
provides:
  - ".planning/phases/07-sweep-engine-and-the-heatmap/07-PERF-03-BASELINE.md: a real, non-withheld D-17 baseline PERF-03 verdict, transcribed field-for-field from CI run 32654061079 (FAIL, 1168.59ms normalized against the 1000ms budget), plus harness-readiness evidence and the contribution-schedule figure, all in a non-gitignored document"
  - "bench/heatmap-form-2.bench.test.ts: REJECTED_POLYGON_BATCH_SIZE=2, cutting the informational polygon-rejected re-measurement arm's cost, clearing a genuine local BENCH_TOTAL_RUNTIME_CAP_MS breach (32,531ms -> ~23,000ms) with zero change to any budget, cap, calibration constant, or the shipped/gated PERF-05 measurement"
affects: ["07-12"]

actuals:
  tokens: 5900
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "An informational bench arm (recordInfoLine only, no MeasurementRow) gets its own arm-specific batch-size constant rather than sharing the gated measurement's constant, so its sampling cost can be cut without touching the gated arm's own disclosed batch size"

key-files:
  created:
    - .planning/phases/07-sweep-engine-and-the-heatmap/07-PERF-03-BASELINE.md
  modified:
    - bench/heatmap-form-2.bench.test.ts

key-decisions:
  - "The real blocker for a PERF-03 baseline verdict was confirmed, from evidence, to be that gsd/phase-07-sweep-engine-and-the-heatmap had never had a PR or an upstream push, so ci.yml's pull_request/push-to-main triggers had never fired for the retargeted (07-03) production-pool bench file. This was not a harness defect: CI run 32551360160 (main, 2026-08-22) proved the D-17 baseline machine and the withheld-verdict/reporting machinery both work end to end, just against an earlier, pre-07-03 spike-synthetic-sourced PERF-03 row."
  - "The full bench suite's total-runtime cap (BENCH_TOTAL_RUNTIME_CAP_MS=30000) was genuinely breaching locally (32,531ms) before this plan, entirely attributable to one informational, MeasurementRow-free arm in bench/heatmap-form-2.bench.test.ts (the REJECTED polygon FillPath re-measurement, ~10.7s alone). Cut via a new arm-specific REJECTED_POLYGON_BATCH_SIZE=2 (was sharing REPAINT_BATCH_SIZE=20 with the shipped/gated resample measurement). No budget, cap, or calibration constant was changed; bench/sweep.bench.test.ts (the PERF-03 headline arm and the contribution-schedule info arm) has zero diff across this whole plan."
  - "Task 2's checkpoint (push the branch, open a PR) was resolved by the orchestrator, explicitly authorized by the repository owner, not by this worktree executor: it merged this plan's Task 1 commits (47d52f3, a29acb5) onto gsd/phase-07-sweep-engine-and-the-heatmap as merge commit d81bc35, pushed, and opened PR #7. CI run 32654061079 then ran the retargeted bench/sweep.bench.test.ts on the real 4-core baseline for the first time in this phase's history."
  - "The D-17 baseline PERF-03 verdict is a real FAIL: 1168.59ms normalized against the 1000ms budget (116.9% of budget), source=production, verdict=fail, on CI run 32654061079 (hardwareConcurrency=4). This is transcribed verbatim in 07-PERF-03-BASELINE.md and is NOT reframed as a pass, hidden, or resolved here -- per this plan's own scope, resolving the escalation (accept-with-documented-headroom-plan or a named architecture lever) is explicitly plan 07-12's job."
  - "The same D-17 baseline run's own totalRuntimeMs (43,259ms) also exceeded BENCH_TOTAL_RUNTIME_CAP_MS (30,000ms), masked in the reported failure because assertRunInvariants checks the verdict-fail gate before the total-runtime gate. This dev-sandbox-verified runtime-cap fix was therefore necessary but not sufficient for the real CI environment. Recorded as a factual observation in 07-PERF-03-BASELINE.md section 2, not acted on (no cap/threshold/calibration constant changed), for whichever later work addresses the PERF-03 escalation to read."

patterns-established: []

requirements-completed: [PERF-03]

coverage:
  - id: D1
    description: "The real reason no D-17 baseline PERF-03 verdict existed is established from repository and CI evidence (not inferred), and the full bench suite no longer fails locally on a run-level invariant unrelated to any budget"
    requirement: PERF-03
    verification:
      - kind: other
        ref: "npm run bench exits 0 locally (Total bench runtime: 22,991-23,099ms, cap 30,000ms); git diff --exit-code -- perf-budgets.ts bench/calibration.ts bench/report.ts exits 0; git diff -- bench/sweep.bench.test.ts exits 0 (zero change across the whole plan); npm run test -- --run tests/ci-workflow.test.ts tests/report.test.ts tests/perf-budgets.selftest.test.ts: 81/81 pass; npm run typecheck exits 0"
        status: pass
      - kind: other
        ref: "gh run view 32551360160 --json headBranch,headSha,conclusion -> headBranch=main, conclusion=success (proves harness liveness); gh ls-remote --heads origin gsd/phase-07-sweep-engine-and-the-heatmap returned empty; gh pr list --head gsd/phase-07-sweep-engine-and-the-heatmap returned empty (both before Task 2) -- all recorded verbatim in 07-PERF-03-BASELINE.md section 1"
        status: pass
    human_judgment: false
  - id: D2
    description: "A non-gitignored document carries the real D-17 baseline PERF-03 verdict, transcribed field-for-field from the CI artifact, with no fabricated or unlabelled figure"
    requirement: PERF-03
    verification:
      - kind: other
        ref: "gh run download 32654061079 --name bench-results; node -e check confirming rows.find(PERF-03).verdict !== 'unmeasured' && .source === 'production' exits 0; 07-PERF-03-BASELINE.md sections 2 and 3 quote the row and environment block verbatim, state hardwareConcurrency 13 times across the whole document, and record the FAIL verdict plainly (1168.59ms vs 1000ms budget, 116.9%)"
        status: pass
    human_judgment: true
    rationale: "Confirming the transcribed figures are honest (not softened, not reframed as passing) and that the escalation is correctly deferred to plan 07-12 rather than silently resolved here is a judgment call about documentation integrity, not something a script alone verifies."

duration: ~1h10min (across Task 1, the checkpoint pause, and Task 3)
completed: 2026-08-23
status: complete
---

# Phase 07 Plan 11: PERF-03 Baseline (Gap Closure) Summary

**Produced the phase's first real, non-withheld D-17 baseline PERF-03 verdict: a FAIL
(1168.59ms normalized against the 1000ms budget, source=production, CI run 32654061079), recorded
verbatim in a non-gitignored document alongside the harness-readiness evidence that shows the
verdict had simply never been measured before -- not hidden, not softened, and not resolved here
(that is explicitly plan 07-12's job).**

## Performance

- **Duration:** ~1h10min total (Task 1 ~40min, checkpoint pause for the owner-authorized push/PR,
  Task 3 ~30min)
- **Completed:** 2026-08-23
- **Tasks:** 3 of 3 completed
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- Confirmed the D-17 baseline machine is real and the reporting/withheld-verdict machinery works:
  CI run 32551360160 (`main`, 2026-08-22) recorded `hardwareConcurrency=4` and a non-withheld
  PERF-03 verdict, though `source=spike-synthetic` (pre-dating plan 07-03's production-pool
  retarget) -- proof the harness itself was never the blocker.
- Confirmed the actual reason no baseline verdict had ever existed for the retargeted,
  production-pool `bench/sweep.bench.test.ts`: before this plan, `gsd/phase-07-sweep-engine-and-
  the-heatmap` had no upstream on `origin` and no pull request, so `ci.yml`'s
  `pull_request`/`push`-to-`main` triggers had never fired against this phase's own code.
- Found and fixed a genuine local `BENCH_TOTAL_RUNTIME_CAP_MS` breach (32,531ms against the
  30,000ms cap), traced to a single informational, `MeasurementRow`-free arm in
  `bench/heatmap-form-2.bench.test.ts` (the REJECTED polygon FillPath re-measurement, ~10.7s of
  the suite's own runtime). Cut via a new arm-specific `REJECTED_POLYGON_BATCH_SIZE=2` (the
  shipped/gated PERF-05 measurement's own `REPAINT_BATCH_SIZE=20` is untouched). No threshold,
  cap, or calibration constant moved; `bench/sweep.bench.test.ts` -- the PERF-03 headline arm and
  the contribution-schedule info arm -- has zero diff across this entire plan.
- The plan's Task 2 blocking checkpoint (push the branch, open a PR) was resolved by the
  orchestrator, explicitly authorized by the repository owner: it merged this plan's Task 1
  commits onto `gsd/phase-07-sweep-engine-and-the-heatmap` (merge commit `d81bc35`), pushed, and
  opened PR #7. CI run **32654061079** then ran the retargeted bench on the real 4-core baseline
  for the first time in this phase's history.
- That run's `npm run bench` step failed: PERF-03 measured **1168.59ms normalized against the
  1000ms budget** (`measuredMs=952.40`, `source=production`, `verdict=fail`) -- 116.9% of budget,
  a real over-budget verdict, not a narrow miss, and well past the 70% D-20 escalation trigger. The
  `actions/upload-artifact@v4` step still succeeded (`if: always()`), exactly as this plan's own
  key link predicted, so the measurement was recoverable.
- Transcribed the run's environment block, the PERF-03 row, and the contribution-schedule
  (`solveIrr` branch) info-line figure (8961.84ms normalized, also on the real 4-core baseline)
  verbatim into `07-PERF-03-BASELINE.md` sections 2 and 3 -- every figure labelled with its host
  core count and baseline/non-baseline status, with no fabricated or softened number anywhere.
- Recorded, as a factual observation (not acted on), that this same baseline run's own
  `totalRuntimeMs` (43,259ms) also exceeded the 30,000ms cap -- masked in the reported failure
  only because `assertRunInvariants` checks the verdict-fail gate first. This plan's local
  runtime-cap fix was necessary but evidently not sufficient for the real CI environment; that
  observation is left on the record for whichever later work addresses the PERF-03 escalation.

## Task Commits

1. **Task 1: Prove end to end that a bench run can land a PERF-03 verdict, and clear whatever
   actually stops it** - `47d52f3` (feat)
2. **(interim SUMMARY, recorded at the Task 2 checkpoint pause)** - `a29acb5` (docs)
3. **Task 2: The owner runs the D-17 baseline job** - resolved by the orchestrator (authorized by
   the repository owner), not a commit in this worktree; merge commit `d81bc35` on
   `gsd/phase-07-sweep-engine-and-the-heatmap`
4. **Task 3: Transcribe the baseline verdict from the artifact, verbatim** - `f5a86d9` (feat)

## Files Created/Modified

- `.planning/phases/07-sweep-engine-and-the-heatmap/07-PERF-03-BASELINE.md` - New: section 1
  (harness readiness), section 2 (the real D-17 baseline PERF-03 verdict, FAIL, transcribed from
  CI run 32654061079), section 3 (the contribution-schedule figure across all measured hosts)
- `bench/heatmap-form-2.bench.test.ts` - New `REJECTED_POLYGON_BATCH_SIZE=2` constant, used only by
  the informational polygon-rejected re-measurement arm; `REPAINT_BATCH_SIZE=20` (the shipped/gated
  arm's constant) is unchanged

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

None from Task 1 or Task 3's own instructions -- both executed exactly as written. Task 2 itself
was resolved by the orchestrator rather than by a human replying directly to this worktree's
checkpoint (the coordinator relayed the resolution, with the owner's explicit authorization, per
this repository's standing "the agent commits freely but never pushes without an explicit
request" rule -- the push was made under that explicit request, just not by this executor). This
is documented here as the actual sequence of events, not silently smoothed over.

## Issues Encountered

- This worktree had neither `node_modules` nor `dist/` (a fresh worktree does not get its own
  `npm install`, and `dist/` is gitignored/build-generated). Symlinked both from the main repo's
  checkout after confirming `package.json`/`package-lock.json` are byte-identical, mirroring
  07-03-SUMMARY.md's own documented approach. Both symlinks are gitignored (`node_modules/`,
  `dist/` in `.gitignore`) and were never staged.
- CI run 32654061079's own `totalRuntimeMs` (43,259ms) exceeded `BENCH_TOTAL_RUNTIME_CAP_MS`
  (30,000ms) even after this plan's Task 1 fix, though this was never the *reported* failure
  reason (the verdict-fail check for the over-budget PERF-03 row fires first in
  `assertRunInvariants`'s check order). Recorded as a factual, unfixed observation in
  `07-PERF-03-BASELINE.md` section 2, per this plan's own prohibition against touching
  `BENCH_TOTAL_RUNTIME_CAP_MS` in response to a measurement. Not fixed here; left for later work
  (likely alongside whatever resolves the PERF-03 escalation itself) to address, since the two
  are related (both stem from the sweep suite's real per-operation cost on the narrower 4-core
  baseline machine).

## User Setup Required

None further. Task 2's human action (push the branch, open the PR) was already completed by the
orchestrator under the owner's explicit authorization before this plan's Task 3 ran.

## Next Phase Readiness

- `07-PERF-03-BASELINE.md` now carries a real, non-withheld, non-gitignored D-17 baseline PERF-03
  verdict (FAIL) and the contribution-schedule figure across every host this phase has measured.
  This is the exact input plan 07-12 needs to record the PROJECT.md Key Decision that resolves the
  escalation -- 07-VERIFICATION.md's one open roadmap-truth gap (criterion 3) now has real evidence
  behind it instead of a withheld verdict.
- **Carried forward for 07-12 (or later) to read:** the baseline CI run's own total bench-suite
  runtime (43,259ms) also exceeds the 30,000ms cap, on top of the PERF-03 budget itself failing.
  Both point at the same underlying fact -- the real 4-core baseline machine's per-operation cost
  for this Worker-pool-parallelized suite is higher than dev-sandbox testing (up to 9 cores in this
  session) predicted. Whichever plan resolves the PERF-03 escalation should read both findings
  together, not just the headline budget miss.
- No blockers.

## Self-Check: PASSED

Both files this plan created/modified are tracked
(`.planning/phases/07-sweep-engine-and-the-heatmap/07-PERF-03-BASELINE.md`,
`bench/heatmap-form-2.bench.test.ts`), confirmed via `git status --short` showing a clean tree
(aside from the gitignored `node_modules`/`dist` symlinks) immediately after each commit. All
three commit hashes this SUMMARY cites from this worktree (`47d52f3`, `a29acb5`, `f5a86d9`) are
present in `git log --oneline -5`; the merge commit `d81bc35` and CI run `32654061079` were
reported by the coordinator and independently confirmed here via `gh run view` and the downloaded
`bench-results.json`. `git diff --exit-code -- perf-budgets.ts bench/calibration.ts bench/report.ts`
and `git diff -- bench/sweep.bench.test.ts` both confirmed empty, and `npm run typecheck` confirmed
clean, immediately before this SUMMARY was written.

---
*Phase: 07-sweep-engine-and-the-heatmap*
*Completed: 2026-08-23*
