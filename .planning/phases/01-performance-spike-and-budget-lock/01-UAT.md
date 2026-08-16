---
status: testing
phase: 01-performance-spike-and-budget-lock
source: [01-VERIFICATION.md]
started: 2026-08-16T05:05:00Z
updated: 2026-08-16T05:05:00Z
---

## Current Test

number: 1
name: The `bench` CI workflow runs on a real GitHub Actions runner and goes red on a real budget breach
expected: |
  The first push produces a green `bench` check on ubuntu-latest. The second, deliberately
  regressed push produces a red `bench` check, with the failure output naming the breached
  budget id, proving the gate is live in real CI and not merely declared in YAML.
awaiting: user response

## Tests

### 1. The `bench` CI workflow runs on a real GitHub Actions runner and goes red on a real budget breach

Configure a GitHub remote for this repository, push the current branch (or main), open a PR or
push to main, and confirm the `bench` workflow in `.github/workflows/ci.yml` runs successfully on
ubuntu-latest. Then push a second, deliberately regressed commit (e.g. temporarily lower a
PERF_BUDGETS threshold below its measured value) and confirm the GitHub Actions check goes red on
that commit, then revert.

expected: The first push produces a green `bench` check on ubuntu-latest. The second, deliberately regressed push produces a red `bench` check, with the failure output naming the breached budget id, proving the gate is live in real CI and not merely declared in YAML.
result: [pending]

why_human: No GitHub remote is configured in this repository. Whether GitHub Actions renders a real
budget breach as a red check cannot be verified without pushing to an actual GitHub-hosted remote
and an actual Actions run. `.github/workflows/ci.yml` is syntactically verified and the equivalent
local mechanism (a spawned `npm run bench:selftest` against a deliberately over-budget fixture) is
directly confirmed to exit non-zero naming the failing budget id, but that is a local proxy, not
the literal CI proof success criterion 5 asks for.

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
