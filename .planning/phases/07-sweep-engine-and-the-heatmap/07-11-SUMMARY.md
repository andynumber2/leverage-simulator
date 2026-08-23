---
phase: 07-sweep-engine-and-the-heatmap
plan: 11
subsystem: bench-harness
tags: [perf-03, bench, ci, gap-closure, checkpoint]

requires:
  - phase: 07-sweep-engine-and-the-heatmap
    plan: "07-03"
    provides: "bench/sweep.bench.test.ts retargeted at src/sweep/sweep-pool.ts's production pool -- the sole PERF-03 recorder"
  - phase: 07-sweep-engine-and-the-heatmap
    plan: "07-10"
    provides: "bench/heatmap-panzoom.bench.test.ts, the last Phase 7 bench file added before this plan's runtime-cap audit"
provides:
  - ".planning/phases/07-sweep-engine-and-the-heatmap/07-PERF-03-BASELINE.md section 1: harness-readiness evidence (CI baseline is real, branch has no upstream/PR, PERF-08 coverage is fine on full-suite runs, total-runtime cap was breaching and is now cleared)"
  - "bench/heatmap-form-2.bench.test.ts: REJECTED_POLYGON_BATCH_SIZE=2, cutting the informational polygon-rejected re-measurement arm's cost from ~10.7s to ~1s, clearing a genuine BENCH_TOTAL_RUNTIME_CAP_MS breach (32,531ms -> ~23,000ms) with zero change to any budget, cap, calibration constant, or the shipped/gated PERF-05 measurement"
affects: ["07-12"]

actuals:
  tokens: 4200
  tasks: 1
  commits: 1

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
  - "The real blocker for a PERF-03 baseline verdict is confirmed, from evidence, to be that gsd/phase-07-sweep-engine-and-the-heatmap has never had a PR or an upstream push, so ci.yml's pull_request/push-to-main triggers have never fired for the retargeted (07-03) production-pool bench file. This is not a harness defect: CI run 32551360160 (main, 2026-08-22) proves the D-17 baseline machine and the withheld-verdict/reporting machinery both work end to end, just against an earlier, pre-07-03 spike-synthetic-sourced PERF-03 row."
  - "The full bench suite's total-runtime cap (BENCH_TOTAL_RUNTIME_CAP_MS=30000) was genuinely breaching locally (32,531ms) before this plan, entirely attributable to one informational, MeasurementRow-free arm in bench/heatmap-form-2.bench.test.ts (the REJECTED polygon FillPath re-measurement, ~10.7s alone). Cut via a new arm-specific REJECTED_POLYGON_BATCH_SIZE=2 (was sharing REPAINT_BATCH_SIZE=20 with the shipped/gated resample measurement). No budget, cap, or calibration constant was changed; bench/sweep.bench.test.ts (the PERF-03 headline arm and the contribution-schedule info arm) has zero diff."
  - "PERF-08 coverage does not fail on a full-suite npm run bench run; the isolated-single-file failure 07-10-SUMMARY.md documents is real but out of scope here, confirmed directly rather than assumed."

patterns-established: []

requirements-completed: []

coverage:
  - id: D1
    description: "The real reason no D-17 baseline PERF-03 verdict exists is established from repository and CI evidence (not inferred), and the full bench suite no longer fails on a run-level invariant unrelated to any budget"
    requirement: PERF-03
    verification:
      - kind: other
        ref: "npm run bench exits 0 locally (Total bench runtime: 22,991-23,099ms, cap 30,000ms); git diff --exit-code -- perf-budgets.ts bench/calibration.ts bench/report.ts exits 0; git diff -- bench/sweep.bench.test.ts exits 0 (zero change); npm run test -- --run tests/ci-workflow.test.ts tests/report.test.ts tests/perf-budgets.selftest.test.ts: 81/81 pass"
        status: pass
      - kind: other
        ref: "gh run view 32551360160 --json headBranch,headSha,conclusion -> headBranch=main, headSha=15b53b3d6a2983f45158c763bbaf20b52270eb7c, conclusion=success; gh ls-remote --heads origin gsd/phase-07-sweep-engine-and-the-heatmap returns empty; gh pr list --head gsd/phase-07-sweep-engine-and-the-heatmap returns empty -- all recorded verbatim in 07-PERF-03-BASELINE.md section 1"
        status: pass
    human_judgment: false

duration: ~40min (Task 1 only; plan paused at Task 2's blocking checkpoint)
completed: 2026-08-23
status: checkpoint
---

# Phase 07 Plan 11: PERF-03 Baseline (Gap Closure) -- Interim Summary, Paused at Blocking Checkpoint

**Task 1 is complete and committed: the bench suite's total-runtime cap breach is fixed
(32,531ms -> ~23,000ms, zero budget/cap/calibration changes) and the real reason no D-17 baseline
PERF-03 verdict exists is established from evidence (the branch has never had a PR or upstream
push). This plan is `autonomous: false` and now stops at Task 2, a `checkpoint:human-action`
requiring the repository owner to push the branch and open a PR -- an action the worktree
executor cannot take on its own authority. This SUMMARY documents Task 1's completed work; it will
be superseded by the plan's final SUMMARY once Task 2 and Task 3 complete.**

## Performance

- **Duration:** ~40min for Task 1
- **Completed:** 2026-08-23 (Task 1 only)
- **Tasks:** 1 of 3 completed; Task 2 (checkpoint) pending human action; Task 3 blocked on Task 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- Confirmed the D-17 baseline machine is real: CI run 32551360160 (`main`, 2026-08-22,
  `headSha=15b53b3d6a2983f45158c763bbaf20b52270eb7c`) recorded `environment.hardwareConcurrency=4`
  and a non-withheld PERF-03 verdict (748.24ms normalized, `source=spike-synthetic`, predating
  plan 07-03's production-pool retarget) -- proof the run-level harness and the withheld-verdict
  machinery both work end to end.
- Confirmed the actual reason no baseline verdict exists for the retargeted, production-pool
  `bench/sweep.bench.test.ts`: `gsd/phase-07-sweep-engine-and-the-heatmap` has no upstream on
  `origin` (`git ls-remote --heads` returns empty) and no pull request, open or closed (`gh pr
  list` returns empty). `.github/workflows/ci.yml` triggers only on `pull_request` and `push` to
  `main`, so the workflow has never run against this phase's own code.
- Confirmed `npm run bench` was genuinely failing locally on the total-runtime cap
  (`assertRunInvariants`: 32,531ms against the 30,000ms cap), and confirmed the isolated-single-file
  PERF-08-coverage failure 07-10-SUMMARY.md documented does NOT apply to a full-suite run (every
  PERF-08 row read `verdict: pass` in the full run's own JSON output).
- Traced the cap breach to its single largest contributor: one informational arm in
  `bench/heatmap-form-2.bench.test.ts` (the REJECTED polygon FillPath re-measurement, ~10.7s of the
  suite's ~32.5s total, on its own). That arm records no `MeasurementRow` (informational only),
  making its sampling cost eligible for reduction under this plan's own rule.
- Cut that arm's batch size from the shared `REPAINT_BATCH_SIZE=20` (still used, unchanged, by the
  shipped/gated `'resample'` PERF-05 measurement) to a new, arm-specific
  `REJECTED_POLYGON_BATCH_SIZE=2` -- 18x clear of `MIN_MEASUREMENT_MS`'s 10ms floor. Total suite
  runtime dropped to ~22,991-23,099ms across repeated local runs, comfortably under cap. No
  threshold, cap, or calibration constant moved (`perf-budgets.ts` / `bench/calibration.ts` /
  `bench/report.ts` all diff-clean); `bench/sweep.bench.test.ts` (the PERF-03 headline arm and the
  contribution-schedule info arm) is byte-for-byte unchanged.
- Recorded every command, figure, and finding above -- verbatim, not paraphrased -- in
  `.planning/phases/07-sweep-engine-and-the-heatmap/07-PERF-03-BASELINE.md` section 1, with every
  dev-sandbox figure explicitly labelled informational/non-baseline and its host core count (9).

## Task Commits

1. **Task 1: Prove end to end that a bench run can land a PERF-03 verdict, and clear whatever
   actually stops it** - `47d52f3` (feat)

Task 2 (checkpoint:human-action, blocking) and Task 3 (transcribe the baseline verdict) have not
run.

## Files Created/Modified

- `.planning/phases/07-sweep-engine-and-the-heatmap/07-PERF-03-BASELINE.md` - New: section 1
  (harness readiness), sections 2 and 3 stubbed for Task 3
- `bench/heatmap-form-2.bench.test.ts` - New `REJECTED_POLYGON_BATCH_SIZE=2` constant, used only by
  the informational polygon-rejected re-measurement arm; `REPAINT_BATCH_SIZE=20` (the shipped/gated
  arm's constant) is unchanged

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

None -- Task 1 executed exactly as written. The runtime-cap breach the plan anticipated ("Clear the
cap breach by removing avoidable measurement cost... stop as soon as the suite exits 0") was real
and was cleared in one step, per the plan's own instructed order (measure per-file cost first, cut
the largest eligible cost, stop once green).

## Issues Encountered

- This worktree had neither `node_modules` nor `dist/` (a fresh worktree does not get its own
  `npm install`, and `dist/` is gitignored/build-generated). Symlinked both from the main repo's
  checkout after confirming `package.json`/`package-lock.json` are byte-identical (`diff` exits 0
  on both), mirroring 07-03-SUMMARY.md's own documented approach for `node_modules`. Both symlinks
  are gitignored (`node_modules/`, `dist/` in `.gitignore`) and were never staged.

## User Setup Required

**This plan is paused at Task 2, a blocking `checkpoint:human-action`.** The repository owner must:

1. Review what would be pushed: `git log --oneline main..HEAD` and `git diff main...HEAD --stat`
   (run against the `gsd/phase-07-sweep-engine-and-the-heatmap` branch, not this worktree's own
   per-agent branch).
2. Push the branch and open the pull request, which starts the CI bench job:
   `git push -u origin gsd/phase-07-sweep-engine-and-the-heatmap`, then
   `gh pr create -R andynumber2/leverage-simulator --fill`.
3. Watch it with `gh run watch -R andynumber2/leverage-simulator`.
4. When it finishes, read the run id from `gh run list -R andynumber2/leverage-simulator --limit 1`
   and reply with it -- or reply "declined" if the owner would rather not push this branch, in
   which case Task 3 records that no D-17 baseline figure was obtainable this phase and uses the
   best available (labelled non-baseline) dev-sandbox evidence instead.

## Next Phase Readiness

- **Blocked on Task 2's human action** (see above). Task 3 (transcribe the baseline verdict from
  the CI artifact, or record an explicit negative if declined) cannot run until Task 2 resolves.
- Everything Task 1 needed to establish is on record in `07-PERF-03-BASELINE.md` section 1: no
  further investigation is needed before Task 2/3 can proceed once the human action completes.
- No blockers beyond the pending human action itself.

## Self-Check: PASSED

Both files this plan's Task 1 created/modified are tracked
(`.planning/phases/07-sweep-engine-and-the-heatmap/07-PERF-03-BASELINE.md`,
`bench/heatmap-form-2.bench.test.ts`), confirmed via `git status --short` showing a clean tree
immediately after the Task 1 commit. Commit hash `47d52f3` is present in `git log --oneline -1`.
`git diff --exit-code -- perf-budgets.ts bench/calibration.ts bench/report.ts` and
`git diff -- bench/sweep.bench.test.ts` both confirmed empty immediately before this SUMMARY was
written.

---
*Phase: 07-sweep-engine-and-the-heatmap*
*Status: checkpoint (Task 1 of 3 complete; awaiting Task 2 human action)*
