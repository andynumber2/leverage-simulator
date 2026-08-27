# Deferred Items - Phase 8

Out-of-scope discoveries logged during plan execution, per the executor's SCOPE BOUNDARY rule
(pre-existing issues unrelated to the current task's changes are logged, not fixed).

## 08-05: single-file/partial `npm run bench` invocations always fail the PERF-08 coverage gate

**Found during:** Task 2, running `npm run bench -- bench/perf-08-export.bench.test.ts` per the
plan's own verify command.

**Issue:** `bench/report.ts`'s `assertRunInvariants` requires every `PERF-08`-family budget id
whose `implementedInPhase <= PERF_08_COVERAGE_PHASE` (4) to carry a real measurement (not
`unmeasured`) by the time ANY bench run's teardown checks invariants (`bench/global-setup.ts`).
Those rows are recorded only by `bench/perf-08.bench.test.ts` (the cold/warm load timing file).
Any `npm run bench -- <other-file>` invocation that does not also run that specific file will
therefore always fail this check at teardown, independent of whether the invoked file's own
measurements are correct.

**Verified pre-existing and unrelated to this plan's changes:** `npm run bench --
bench/perf-07.bench.test.ts` (an already-shipped, untouched-by-this-plan file) fails identically:

```
error during close Error: assertRunInvariants: PERF-08 budget id(s) due for measurement by
phase 4 are still unmeasured: DATA-BUNDLE-BYTES, DATA-BUNDLE-DECODE, PERF-08a, PERF-08b, PERF-08c
```

`npm run bench:selftest` (the gate-liveness self-test) shows the same message alongside its own
deliberate PERF-05 breach.

**Not fixed here:** out of this plan's declared file list (`bench/report.ts` is shared
infrastructure used by every bench file in the repo, not something 08-05's own scope touches),
and the fix (either scoping the coverage check per invoked file, or documenting that this
project's bench CLI is only ever meant to run unfiltered) is a decision affecting every future
bench file, not just this one.

**Practical effect on this plan:** `bench/perf-08-export.bench.test.ts`'s own two `test()`
assertions pass cleanly (verified both standalone and combined with `bench/perf-07.bench.test.ts`
in one invocation); the non-zero exit code this teardown error produces is not a defect in the
measurement work this plan delivers. See `08-05-SUMMARY.md` for the full verification transcript.

**Suggested follow-up:** either scope `assertRunInvariants`'s PERF-08-coverage check to only fire
when `npm run bench` is invoked with no file filter (hard to detect reliably from inside
`globalSetup`), or document explicitly that `npm run bench -- <file>` is a development-only
convenience that is expected to fail this specific invariant, and that CI/the authoritative gate
always runs the full, unfiltered suite.
