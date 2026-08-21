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
| T2 | 05-01 | 1 | ATTR-01, ATTR-02 | T-05-02 | Non-finite arm renders the undefined placeholder | unit + property (fast-check) | `npx vitest run --project unit tests/attribution/shapley.test.ts` | ❌ created by T2 | ⬜ pending |
| T1, T3 | 05-01 | 1 | ATTR-01, ATTR-02 | T-05-01 | Attribution inside the existing coalesced pass | app/browser | `npx vitest run --project app tests/app/attribution.browser.test.ts` | ❌ created by T1 | ⬜ pending |
| T3 | 05-01 | 1 | ATTR-02 | — | N/A | unit | `npx vitest run --project unit tests/metrics/format.test.ts` | ✅ existing | ⬜ pending |
| T1 | 05-02 | 2 | ATTR-03 | T-05-03 | Null-gap before the log renderer | unit | `npx vitest run --project unit tests/app/naive-ghost-series.test.ts` | ❌ created by T1 | ⬜ pending |
| T2 | 05-02 | 2 | ATTR-03 | T-05-03 | Deep-drawdown log-scale regression guard | app/browser | `npx vitest run --project app tests/app/naive-ghost-series.browser.test.ts` | ❌ created by T2 | ⬜ pending |
| T1 | 05-03 | 2 | VALID-04 | T-05-06 | No-fitting protocol survives the extraction | unit (regression vs existing gate test) | `npx vitest run --project unit tests/validation/upro-tqqq-gate.test.ts tests/validation/synthetic-comparison.test.ts` | ✅ gate test is oracle | ⬜ pending |
| T2, T3 | 05-03 | 2 | VALID-04 | T-05-05, T-05-07 | Total-return leg pinned; identical row markup | app/browser | `npx vitest run --project app tests/app/validation-section.browser.test.ts` | ❌ created by T3 | ⬜ pending |
| T1, T3 | 05-04 | 3 | CRED-01 | T-05-09, T-05-10 | Manifest traceability fails the build | unit | `npx vitest run --project unit tests/app/provenance-strip.test.ts` | ❌ created by T1 | ⬜ pending |
| T2, T3 | 05-04 | 3 | CRED-01 | T-05-08 | Source anchors scheme-checked | app/browser | `npx vitest run --project app tests/app/provenance-strip.browser.test.ts` | ❌ created by T3 | ⬜ pending |
| T1 | 05-05 | 4 | APP-02 | T-05-11 | Tier decode unchanged; permalink.ts untouched | unit | `npx vitest run --project unit tests/app/permalink.test.ts` | ✅ existing | ⬜ pending |
| T2, T3 | 05-05 | 4 | APP-02 | T-05-12, T-05-13 | Bounds and citation follow one tier signal | app/browser | `npx vitest run --project app tests/app/entry-date-tier.browser.test.ts` | ❌ created by T3 | ⬜ pending |
| T1, T2 | 05-06 | 5 | CRED-03 | T-05-14, T-05-15 | Pinning test; compiler's own interpolation | unit (pinning test) | `npx vitest run --project unit tests/validation/extended-tier-bias.test.ts` | ❌ created by T2 | ⬜ pending |
| T3 | 05-06 | 5 | CRED-02 | T-05-16 | No dismiss or acknowledgment path | app/browser | `npx vitest run --project app tests/app/extended-tier-warning.browser.test.ts` | ❌ created by T3 | ⬜ pending |
| T1 | 05-07 | 6 | CRED-04 | T-05-17, T-05-18, T-05-20 | Flag stripped before decode; decode still governs | unit | `npx vitest run --project unit tests/app/permalink-methodology.test.ts` | ❌ created by T1 | ⬜ pending |
| T2, T3 | 05-07 | 6 | CRED-04 | T-05-19 | Page values read from registries, not literals | app/browser | `npx vitest run --project app tests/app/methodology-overlay.browser.test.ts` | ❌ created by T3 | ⬜ pending |
| T1 | 05-08 | 7 | CRED-05 | T-05-23 | One registry for badge and reset | unit | `npx vitest run --project unit tests/app/parameter-defaults.test.ts` | ❌ created by T1 | ⬜ pending |
| T2, T3 | 05-08 | 7 | CRED-05 | T-05-21, T-05-22 | Reset writes through validated setters | app/browser | `npx vitest run --project app tests/app/parameter-defaults.browser.test.ts` | ❌ created by T3 | ⬜ pending |
| T1 | 05-09 | 8 | PERF-07b (re-measure), ATTR-01 | T-05-24, T-05-25 | Budgets unchanged; escalation recorded | bench (Playwright-backed) | `npm run bench` | ✅ `bench/perf-07.bench.test.ts` | ⬜ pending |

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
