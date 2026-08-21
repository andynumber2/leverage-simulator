---
phase: 6
slug: heatmap-design-pass
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-21
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 |
| **Config file** | `vitest.config.ts` (three projects: `unit`, `bench`, `app`) |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npm run test && npm run test:app && npm run bench` |
| **Estimated runtime** | ~60 seconds (unit ~5s; bench dominates) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npm run test && npm run bench`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Task IDs are filled in by the planner. Rows below are the requirement-level contract
> the planner must satisfy; every task must map to one of these or declare manual-only.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 0 | VIZ-07 | — | N/A | unit | `npx vitest run --project unit tests/color-scale-cvd.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | VIZ-07 | — | N/A | unit | `npx vitest run --project unit tests/value-to-color.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | — (D-29 fixture) | — | N/A | unit | `npx vitest run --project unit tests/sweep-fixture-format.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | Criterion 4 | — | N/A | bench | `npx vitest run --project bench bench/heatmap-repaint.bench.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | — | VIZ-05 | — | N/A | manual | See Manual-Only Verifications | N/A | ⬜ pending |
| TBD | TBD | — | VIZ-10 | — | N/A | manual | See Manual-Only Verifications | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/color-scale-cvd.test.ts` — D-17's automated CVD assertion (protanopia/deuteranopia/tritanopia via Viénot 1999 matrices), covers VIZ-07
- [ ] `tests/value-to-color.test.ts` — D-27's colour function: D-14 symlog transform + ruin/incomplete categorical branches, covers VIZ-07
- [ ] `tests/sweep-fixture-format.test.ts` — D-29's binary sweep-fixture encode/decode round-trip
- [ ] `bench/heatmap-repaint.bench.test.ts` — criterion 4 repaint budget per form; extends the existing `bench/canvas-repaint.bench.test.ts` pattern, results normalized into `.bench/bench-results.json`
- [ ] Framework install: none — Vitest, Playwright and the three-project config already exist

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| At least three (D-02: four) throwaway mockups of the entry-date × leverage grid exist, each rendering a full-scale 10,000-cell field from real swept data; one is chosen and the reasons for rejecting the others are written down | VIZ-05 | Existence plus written rejection reasoning is a human-judged design artifact, not an assertable predicate | Serve the mockups with `vite dev`, open the D-05 comparison page, confirm all four forms render a full 10,000-cell field, then confirm `06-HEATMAP-SPEC.md` names the winner and states why each loser was rejected |
| Overlapping-windows caveat copy is present and readable at real width in all four mockups and on the comparison page, stating that adjacent entry dates share nearly all their underlying history and that the grid is a sensitivity analysis over one shared past, not thousands of independent trials | VIZ-10 | `06-UI-SPEC.md`'s own E3 row marks this a backstop discharged by visual inspection; "where it will actually be read" is a placement judgement | At the D-05 comparison step, inspect each form at real viewport width; a form that relegates the caveat to a footnote is rejected on those grounds and the rejection is recorded in `06-HEATMAP-SPEC.md` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
