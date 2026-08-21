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

# Phase 6: Validation Strategy

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
| 06-01 T1 | 06-01 | 1 | VIZ-05, VIZ-07, VIZ-10 | T-06-01, T-06-02, T-06-03 | Fixture header fails loud on magic, version or length mismatch; kernel reached only via `buildKernelInputs` | bench | `npx vitest run --project bench bench/heatmap-repaint.bench.test.ts` | W1 | pending |
| 06-01 T2 | 06-01 | 1 | VIZ-07 | T-06-04 | Oklab matrix round-trip asserted against a known reference | unit | `npx vitest run --project unit tests/value-to-color.test.ts tests/sweep-fixture-format.test.ts` | W1 | pending |
| 06-02 T1 | 06-02 | 2 | VIZ-07 | T-06-06, T-06-07 | CVD matrices sourced from libDaltonLens and proven non-identity; thresholds fixed before testing | unit | `npx vitest run --project unit tests/color-scale-cvd.test.ts` | W2 | pending |
| 06-02 T2 | 06-02 | 2 | VIZ-07 | T-06-07 | Palette changes, threshold does not | unit | `npm run test` | W1, W2 | pending |
| 06-03 T1 | 06-03 | 2 | VIZ-07, VIZ-10 | T-06-08, T-06-09 | Categorical cells never blended across the interpolation stencil | unit | `npx vitest run --project unit tests/field-sampler.test.ts tests/iso-lines.test.ts` | W2 | pending |
| 06-03 T2 | 06-03 | 2 | VIZ-05, VIZ-10 | T-06-10 | Equivalence proven before timing | bench | `npx vitest run --project bench bench/heatmap-form-2.bench.test.ts` | W2 | pending |
| 06-03 T3 | 06-03 | 2 | VIZ-05, VIZ-10 | T-06-10 | Equivalence proven before timing | bench | `npx vitest run --project bench bench/heatmap-form-4.bench.test.ts` | W2 | pending |
| 06-04 T1 | 06-04 | 2 | VIZ-05, VIZ-10 | T-06-12 | Strip gaps painted with the surface colour, never a scale colour | manual | See Manual-Only Verifications, plus `npm run typecheck` | N/A | pending |
| 06-04 T2 | 06-04 | 2 | VIZ-05 | T-06-11 | Equivalence samples first strip, last strip, incomplete region and a gap | bench | `npx vitest run --project bench bench/heatmap-form-3.bench.test.ts` | W2 | pending |
| 06-05 T1 | 06-05 | 3 | VIZ-05, VIZ-07, VIZ-10 | T-06-14, T-06-15 | Fixture load failure renders a visible broken state; one shared panel component prevents front-runner styling | manual | See Manual-Only Verifications, plus `npm run typecheck` | N/A | pending |
| 06-05 T2 | 06-05 | 3 | VIZ-05 | T-06-13 | Each rejection reason cites a rendered observation | manual | See Manual-Only Verifications (blocking decision checkpoint) | N/A | pending |
| 06-06 T1 | 06-06 | 4 | VIZ-05, VIZ-07, VIZ-10 | T-06-16, T-06-17 | Every numeric value asserted to match its source file or bench row | manual | See Manual-Only Verifications, plus the grep assertions in the plan | N/A | pending |
| 06-06 T2 | 06-06 | 4 | VIZ-05 | T-06-18 | Scoped Edit only; no prior Key Decision row removed | manual | `grep -c 'HEATMAP-SPEC' .planning/PROJECT.md` | N/A | pending |

*Status: pending, green, red, flaky*

---

## Wave 0 Requirements

The four files below are the Nyquist scaffolds this phase was missing. Three are created in wave 1
by the tracer plan (06-01), which is where the modules they cover are written; the colourblind
check is created in wave 2 by 06-02 as its whole subject. All four exist before the wave-3
judgement and the wave-4 spec, so no palette or fixture reaches a judgement ungated.

- [ ] `tests/color-scale-cvd.test.ts` (06-02 T1, wave 2). D-17's automated CVD assertion: protanopia, deuteranopia and tritanopia via Vienot 1999 matrices sourced from libDaltonLens. Covers VIZ-07.
- [ ] `tests/value-to-color.test.ts` (06-01 T2, wave 1). D-27's colour function: the D-14 symlog transform, the exact midpoint, the two categorical branches, domain clipping, and the VIZ-07 perceptual-uniformity ratio.
- [ ] `tests/sweep-fixture-format.test.ts` (06-01 T2, wave 1). D-29's binary encode and decode round-trip plus the five fail-loud cases, and the committed fixture's own shape asserted against the manifest.
- [ ] `bench/heatmap-repaint.bench.test.ts` (06-01 T1, wave 1). Criterion 4 for form 1, extending `bench/canvas-repaint.bench.test.ts`'s equivalence-then-measure pattern, normalized into `.bench/bench-results.json` as the run's single PERF-05 row.
- [ ] Framework install: none. Vitest, Playwright and the three-project config already exist.

### Additional test files this phase adds beyond the original Wave 0 list

- [ ] `tests/field-sampler.test.ts`, `tests/iso-lines.test.ts` (06-03 T1, wave 2). The two hand-rolled rendering primitives forms 2 and 4 need, including the categorical-adjacency and band-boundary tie rules.
- [ ] `bench/heatmap-form-2.bench.test.ts`, `bench/heatmap-form-3.bench.test.ts`, `bench/heatmap-form-4.bench.test.ts` (06-03 and 06-04, wave 2). Criterion 4 for the other three forms. Each records an info line and asserts locally against `PERF_BUDGETS['PERF-05']`; only form 1's file records a `MeasurementRow`, so the run's row set carries no duplicate budget id.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| At least three (D-02: four) throwaway mockups of the entry-date × leverage grid exist, each rendering a full-scale 10,000-cell field from real swept data; one is chosen and the reasons for rejecting the others are written down | VIZ-05 | Existence plus written rejection reasoning is a human-judged design artifact, not an assertable predicate | Serve the mockups with `vite dev`, open the D-05 comparison page, confirm all four forms render a full 10,000-cell field, then confirm `06-HEATMAP-SPEC.md` names the winner and states why each loser was rejected |
| Overlapping-windows caveat copy is present and readable at real width in all four mockups and on the comparison page, stating that adjacent entry dates share nearly all their underlying history and that the grid is a sensitivity analysis over one shared past, not thousands of independent trials | VIZ-10 | `06-UI-SPEC.md`'s own E3 row marks this a backstop discharged by visual inspection; "where it will actually be read" is a placement judgement | At the D-05 comparison step, inspect each form at real viewport width; a form that relegates the caveat to a footnote is rejected on those grounds and the rejection is recorded in `06-HEATMAP-SPEC.md` |
| Each form's canvas fits its panel at that form's own D-12 geometry, the legend's five ticks and two detached swatches do not collide, and no panel pushes another off-screen or forces horizontal scroll | VIZ-05, VIZ-07 | `06-UI-SPEC.md`'s E1, E2 and E4 overflow rows are backstops: only a rendered pixel answers panel collision and canvas fit at a form's native geometry | Run `npm run dev`, open each of the four mockup URLs and then `comparison.html`, in both themes, at a wide viewport and at a narrow one; a form that fits only by shrinking cells below legibility is a judging input recorded in `06-HEATMAP-SPEC.md`, not a bug to patch |
| The comparison page fails loudly rather than blankly when the sweep fixture cannot load | VIZ-05 | `06-UI-SPEC.md`'s E1 error row is a backstop with no specified message to assert against | Temporarily point `loadSweepFixture` at a non-existent URL and confirm a visible failure block naming the URL and the error renders in place of the panels; restore the URL afterwards |
| `06-HEATMAP-SPEC.md` is implementable by a Phase 7 planner without opening the mockups, and its three rejection reasons match what the comparison page actually shows | VIZ-05, VIZ-07, VIZ-10 | Sufficiency of a design contract is a reading judgement; the numeric values inside it are separately gated by the grep assertions in plan 06-06 | Read the spec beside the four rendered mockups and confirm every section named in plan 06-06 Task 1 is present and self-sufficient |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
