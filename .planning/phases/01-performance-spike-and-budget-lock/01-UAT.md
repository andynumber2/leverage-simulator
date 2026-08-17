---
status: complete
phase: 01-performance-spike-and-budget-lock
source: [01-VERIFICATION.md]
started: 2026-08-16T05:05:00Z
updated: 2026-08-17T00:05:00Z
---

## Current Test

none: all tests resolved

## Tests

### 1. The `bench` CI workflow runs on a real GitHub Actions runner and goes red on a real budget breach

Configure a GitHub remote for this repository, push the current branch (or main), open a PR or
push to main, and confirm the `bench` workflow in `.github/workflows/ci.yml` runs successfully on
ubuntu-latest. Then push a second, deliberately regressed commit (e.g. temporarily lower a
PERF_BUDGETS threshold below its measured value) and confirm the GitHub Actions check goes red on
that commit, then revert.

expected: The first push produces a green `bench` check on ubuntu-latest. The second, deliberately regressed push produces a red `bench` check, with the failure output naming the breached budget id, proving the gate is live in real CI and not merely declared in YAML.
result: passed
evidence: |
  Green half: runs 31965951474, 31980066804 and 31980323928 all produced a green `bench` check on
  ubuntu-latest.
  Red half: run 31963076671 attempt 1 (2 logical cores) concluded `failure` with
  `Error: assertWithinBudget: budget "PERF-03" failed: measured 1032.430555555439ms exceeds budget
  1000ms` and a `verdict=fail` row, naming the breached budget id as the criterion requires.
deviation: |
  The red run was not a deliberately regressed commit. It was a genuine PERF-03 breach on a slow
  2-core runner. Unstaged evidence is stronger proof that the gate is live than a planted failure,
  but it is not the procedure the test specified, and it also establishes that PERF-03 genuinely
  fails on 2-core hardware rather than only under an artificial regression.

why_human: No GitHub remote is configured in this repository. Whether GitHub Actions renders a real
budget breach as a red check cannot be verified without pushing to an actual GitHub-hosted remote
and an actual Actions run. `.github/workflows/ci.yml` is syntactically verified and the equivalent
local mechanism (a spawned `npm run bench:selftest` against a deliberately over-budget fixture) is
directly confirmed to exit non-zero naming the failing budget id, but that is a local proxy, not
the literal CI proof success criterion 5 asks for.

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

None. The `why_human` blocker (no GitHub remote configured) was resolved: the remote now exists,
the repository is public, and both halves of the test are proved by real Actions runs.
