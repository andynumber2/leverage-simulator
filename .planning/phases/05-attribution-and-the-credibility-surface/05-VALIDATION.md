---
phase: 05
slug: attribution-and-the-credibility-surface
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-20
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `05-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (`unit` Node project + `app` browser project) |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test && npm run test:app && npm run bench` |
| **Estimated runtime** | ~{fill at Wave 0 — measure `npm test` and record} seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test && npm run test:app`
- **Before `/gsd-verify-work`:** Full suite must be green, including `npm run bench` on PERF-07b
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Task IDs are filled in by the planner/executor once PLAN.md files exist. The
> requirement → test-type → command mapping below is fixed by RESEARCH.md and is
> the contract each task must attach itself to.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | ATTR-01, ATTR-02 | — | N/A | unit + property (fast-check) | `vitest run tests/attribution/*.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ATTR-01, ATTR-02 | — | N/A | unit | `vitest run tests/attribution/*.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ATTR-03 | — | N/A | unit | `vitest run tests/app/*.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | VALID-04 | — | N/A | unit (regression vs existing gate test) | `vitest run tests/validation/*.test.ts` | ✅ existing gate test is oracle | ⬜ pending |
| TBD | TBD | TBD | VALID-04 | — | N/A | app/browser | `npm run test:app` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CRED-01 | — | N/A | unit | `vitest run tests/app/*.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CRED-02 | — | N/A | app/browser | `npm run test:app` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CRED-03 | — | N/A | unit (pinning test) | `vitest run tests/validation/*.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CRED-04 | — | N/A | app/browser | `npm run test:app` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CRED-05 | — | N/A | app/browser | `npm run test:app` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | APP-02 | — | N/A | app/browser | `npm run test:app` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PERF-07b (re-measure) | — | N/A | bench (Playwright-backed) | `npm run bench` | ✅ `bench/perf-07.bench.test.ts` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**PERF-07b caveat (from RESEARCH.md):** `bench/perf-07.bench.test.ts` measures the
existing `scheduleRun` coalesced recompute via its `performance.mark` boundaries. If a
plan schedules attribution as a *separate* computation outside `scheduleRun`, those marks
will not capture it and PERF-07b is silently under-measured. Any plan that does so must
add its own bench coverage.

---

## Wave 0 Requirements

- [ ] `tests/attribution/shapley.test.ts` — ATTR-01/02: Shapley shares reconcile exactly to `naive - actual`; financing-zeroed counterfactual arm has zero financing cost regardless of the per-bar `shortRate` array
- [ ] `tests/app/naive-ghost-series.test.ts` — ATTR-03: naive ghost series emits `null` gaps exactly where the naive value `<= 0` (log-axis safety)
- [ ] `src/validation/synthetic-comparison.ts` + regression test — VALID-04: extract `readSeriesLevels` and siblings out of the private test-file copies, asserting identical output to the existing gate test before any app-facing view is built on them
- [ ] `tests/app/provenance-strip.test.ts` — CRED-01/D-16: every rendered provenance string traces to a manifest field (build-failing assertion)
- [ ] `tests/validation/extended-tier-bias.test.ts` — CRED-03/D-21: pinning test asserting the committed generated bias figure matches a freshly recomputed downsample → interpolate → remeasure pass
- [ ] `tests/app/permalink-methodology.test.ts` — D-17: `?methodology=1` must be stripped before `decodeParams`; a permalink carrying it alongside a full run must NOT evict
- [ ] `tests/app/entry-date-tier.test.ts` — APP-02 / Pitfall 3: extended-tier selection must widen `EntryDateControl`'s min bound (currently hardcoded `'strict'` at `EntryDateControl.tsx:34`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Methodology page is reachable in one click from any result and states cost model, day-count conventions, data sources, known limitations | CRED-04 | Editorial completeness of prose cannot be asserted automatically; the *reachability* half is covered by the browser test above | Run `npm run dev`, produce any result, confirm a single click reaches the methodology page, read it against the CONTEXT.md cost model |
| Extended-tier warning is *prominent* and names the bias direction | CRED-02 | "Prominent" is a visual judgement; presence of the string and the quantified figure is automated | Select the extended tier, confirm the warning is visible without scrolling and states that interpolation understates volatility drag |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
