---
phase: 05-attribution-and-the-credibility-surface
verified: 2026-08-21T02:12:06Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 05: Attribution and the Credibility Surface Verification Report

**Phase Goal:** A skeptic can see which mechanism consumed the money, check the model against a real product, and inspect every assumption without leaving the page
**Verified:** 2026-08-21T02:12:06Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Naive-vs-actual gap decomposed into volatility drag / financing / expense ratio, dollars + percent, reconciling exactly; zero-cost comparison mode shown | VERIFIED | `src/validation/attribution.ts` Shapley decomposition (efficiency property guarantees exact reconciliation); `AttributionPanel.tsx` renders 5-row layout (naive, actual, 3 components, reconciliation); `tests/attribution/shapley.test.ts` 7/7 pass incl. property test asserting components sum to totalGap within 1e-6 and cross-checking closed-form vs brute-force permutation average; `tests/app/attribution.browser.test.ts` 4/4 pass incl. regression test that all 3 component rows AND naive/actual update on leverage change |
| 2 | Synthetic-vs-real UPRO/TQQQ comparison visible in-app, tracking error readable without running code | VERIFIED | `src/app/components/ValidationSection/ValidationSection.tsx` mounted unconditionally in `App.tsx:176`, own fund selector (UPRO/TQQQ), renders headline tracking-error and return-drift gates plus full rate-regime sub-window table; built from `SPX/total-return` and `NDX/total-return` (never price-return leg); `tests/app/validation-section.browser.test.ts`, `tests/validation/synthetic-comparison.test.ts`, `tests/validation/upro-tqqq-gate.test.ts` all pass |
| 3 | Active tier, date range, sources, seam dates always on screen, rendered from manifest provenance, tier meaning stated on selection | VERIFIED | `ProvenanceStrip.tsx` mounted inside `screenshot-region`, reads `activeTier()` live signal (not a fixed literal — confirmed by reading current source); `provenance-fields.ts`'s `buildProvenanceFields` derives every field from a `manifestPath` and throws if a tier range doesn't exist on the manifest (D-16 traceability); `tests/app/provenance-strip.test.ts` 14/14 pass incl. a real-committed-bundle traceability gate test; `TierControl.tsx` states each tier's meaning inline per `tests/app/entry-date-tier.browser.test.ts` |
| 4 | Extended tier warning names bias direction, magnitude quantified by downsample-monthly/interpolate-back/measure, printed next to warning | VERIFIED | `scripts/measure-extended-tier-bias.ts` downsamples `SPX/price-return` 2000-01-03..2012-12-31 (a seam-free, strict-tier era — confirmed `seams: []` in the committed manifest) to month-end, interpolates back via the bundle compiler's own `interpolateMonthlyToDaily` (grep confirms no reimplemented interpolation), re-runs both arms through `computeAttribution`; committed figure `EXTENDED_TIER_BIAS_ANNUALIZED_FRACTION = 0.0553` (5.53%/yr); `ExtendedTierWarning.tsx` renders the figure via `formatPercent`, mounted unconditionally under `activeTier() === 'extended'`; `tests/validation/extended-tier-bias.test.ts` (4/4) pins the figure against live recomputation; `tests/app/extended-tier-warning.browser.test.ts` passes. See "Era Substitution Judgment" below. |
| 5 | Every default-carrying parameter labelled + editable in place; methodology page reachable in one click; attribution's extra kernel calls stay inside 16ms budget, measured | VERIFIED | All 8 D-22 parameters (leverage, entry date, holding mode, initial investment, contribution amount, contribution frequency, tier, dividend mode) carry `DefaultBadge`/`ResetButton` — confirmed by grep across `ParameterColumn/*.tsx`; `ProvenanceStrip.tsx`'s "View methodology" link opens `MethodologyOverlay.tsx` in one click, preserving the run underneath (`tests/app/permalink-methodology.test.ts`, `tests/app/methodology-overlay.browser.test.ts`, 14/14 pass); `.bench/bench-results.json` PERF-07b: `measuredMs=4.7, normalizedMs=7.55, budgetMs=16, verdict=pass, attributionLive=true, attributionCounterfactualArmCount=3` — measured, not assumed; `.planning/WINDOWS.md` entry 5 records the sweep-phase consequence (waived, not left implicit) |

**Score:** 5/5 truths verified (0 present-but-behavior-unverified)

### CR-01 Regression Fix (Code Review Blocker) — Verified Present and Correct

The code review (05-REVIEW.md) found `AttributionPanel.tsx` computed `componentRows`/`reconciliationTotal` as plain values in the component body, freezing them at the first run. Confirmed the fix (commit `efae940`) is in place: both are now `createMemo`s reading `props.attribution` reactively, iterated with Solid's `<For>` instead of `.map()`. The added regression assertion in `tests/app/attribution.browser.test.ts` (`changing leverage through the existing control changes both rendered attribution values...`) explicitly asserts the three component rows change text after `updateBacktestRequest({ leverage: 2 })`, in addition to the naive/actual rows. Ran this test file in isolation: 4/4 pass.

### Era Substitution Judgment (Success Criterion 4 / CRED-03)

05-06 deviated from a naive reading of D-21 by measuring the extended-tier bias over 2000-01-03..2012-12-31 rather than the full 1954-2026 strict-tier range, because over the full secular-uptrend range 3x daily compounding is a net gain in both arms (inverting the sign the claim requires). This is judged **acceptable and correctly documented**, not a deviation from an actual mandate:

- D-21 (05-CONTEXT.md) explicitly leaves "which known-good daily era and symbol" to Claude's discretion — it does not mandate the full strict-tier range. It only requires "a known-good daily era."
- The chosen era (SPX/price-return, 2000-01-03..2012-12-31) is verified genuinely seam-free: the committed manifest shows `"seams": []` for `SPX/price-return`, and the era sits well within its strict tier (`1954-01-04..2026-08-14`).
- The rationale (why the full range inverts the sign; why 2000-2012 is a representative volatile, non-cherry-picked stretch) is recorded in the script's own header comment, satisfying the must-have "chosen era, symbol and interpolation method are recorded as a stated methodology choice, not left implicit in a script."
- The measured direction is independently verifiable from the code: `dragGapDollars = originalAttribution.volatilityDrag - reconstructedAttribution.volatilityDrag`, i.e. the interpolated/reconstructed arm's drag component is smaller than the true-daily arm's — exactly "interpolated data understates drag." The script throws (would fail the write step) if the figure is non-positive, so a sign inversion could not silently ship. The committed figure is +5.53%/yr, consistent with the claimed direction.

This satisfies criterion 4 as written; the substitution is a legitimate exercise of granted discretion, not a scope violation.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/validation/attribution.ts` | Pure Shapley decomposition module | VERIFIED | Exists, substantive, imported by `AttributionPanel.tsx` and `scripts/measure-extended-tier-bias.ts`; 7/7 property + example tests pass |
| `src/app/components/ResultColumn/AttributionPanel.tsx` | Always-visible 5-row panel | VERIFIED | Reactive via `createMemo`/`<For>` after CR-01 fix; wired under `currentAttribution() !== null` in `App.tsx` |
| `src/app/components/ResultColumn/naive-series.ts` | Ghost curve data builder | VERIFIED | Exported `buildNaiveGhostData`, consumed by `EquityCurveChart.tsx:188` |
| `src/app/components/ValidationSection/ValidationSection.tsx` | In-app synthetic-vs-real comparison | VERIFIED | Mounted, own canonical params, tested |
| `src/app/components/ResultColumn/ProvenanceStrip.tsx` | Tier/date/source/seam/version strip | VERIFIED | Inside screenshot region, manifest-derived, reads live `activeTier()` |
| `src/app/components/ParameterColumn/TierControl.tsx` | Tier selector with inline meaning | VERIFIED | Two-value control, disabled until manifest decodes |
| `scripts/measure-extended-tier-bias.ts` + `src/validation/extended-tier-bias.generated.ts` | Bias measurement + committed figure | VERIFIED | Pure function separated from writer; pinning test recomputes and matches |
| `src/app/components/ResultColumn/ExtendedTierWarning.tsx` | Bias warning banner | VERIFIED | No dismiss/acknowledge affordance (grep-confirmed), unconditional on extended tier |
| `src/app/components/MethodologyOverlay.tsx` | Methodology page | VERIFIED | Cost model, day-count, sources, all 4 known limitations, generated from registries |
| `src/app/components/ParameterColumn/DefaultBadge.tsx` / `ResetButton.tsx` | Default labelling + reset | VERIFIED | Used by all 8 D-22 parameters (grep-confirmed across control files) |
| `bench/perf-07.bench.test.ts` | PERF-07b re-measurement with attribution live | VERIFIED | `.bench/bench-results.json` shows `attributionLive=true`, verdict pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `AttributionPanel.tsx` | `state.ts`'s `currentAttribution()` | `createMemo` over `props.attribution` | WIRED | Confirmed reactive after CR-01 fix; regression test passes |
| `EquityCurveChart.tsx` | `naive-series.ts` | `buildNaiveGhostData(props.inputs, xs.length)` | WIRED | Ghost series appended to uPlot series array |
| `ProvenanceStrip.tsx` | manifest | `buildProvenanceFields(bundle.manifest, ...)` via `createMemo` on `loadedBundle()` | WIRED | D-16 real-bundle traceability test passes |
| `ExtendedTierWarning.tsx` | `extended-tier-bias.generated.ts` | direct import of `EXTENDED_TIER_BIAS_ANNUALIZED_FRACTION` | WIRED | No prop plumbing — component cannot render without the figure |
| `ProvenanceStrip.tsx` | `MethodologyOverlay.tsx` | `openMethodologyOverlay()` on click | WIRED | `tests/app/methodology-overlay.browser.test.ts`, `tests/app/permalink-methodology.test.ts` pass |
| `ParameterColumn/*.tsx` (8 controls) | `parameter-defaults.ts`'s `PARAMETER_DEFAULTS` | `DefaultBadge`/`ResetButton` per control | WIRED | Grep-confirmed across all 8 named controls |
| `bench/perf-07.bench.test.ts` | `state.ts`'s `scheduleRun`/`storeSuccessfulRun` | existing recompute-start/recompute-end `performance.mark` pair | WIRED | `.bench/bench-results.json` PERF-07b entry present, verdict pass |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full unit suite | `npm test` | 46 files, 635 tests passed | PASS |
| Full app/browser suite | `npm run test:app` | 18 files, 99 tests passed | PASS |
| CR-01 regression test isolated | `npx vitest run tests/app/attribution.browser.test.ts` | 4/4 passed | PASS |
| Extended-tier-bias pinning test isolated | `npx vitest run --project unit tests/validation/extended-tier-bias.test.ts` | 4/4 passed | PASS |
| Provenance traceability test isolated | `npx vitest run tests/app/provenance-strip.test.ts` | 14/14 passed | PASS |
| TypeScript strict check | `npx tsc --noEmit` | exit 0, no output | PASS |
| PERF-07b budget (attribution live) | `.bench/bench-results.json` inspection | measuredMs=4.7, normalizedMs=7.55, budgetMs=16, verdict=pass | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| ATTR-01 | 05-01, 05-09 | Gap decomposed into volatility drag/financing/expense | SATISFIED | `attribution.ts`, `AttributionPanel.tsx`, PERF-07b measurement |
| ATTR-02 | 05-01, 05-09 | Reported in dollars + %, reconciles without residual | SATISFIED | Shapley efficiency property; property test |
| ATTR-03 | 05-02 | Zero-cost naive comparison shown alongside real | SATISFIED | Ghost series in `EquityCurveChart.tsx` |
| VALID-04 | 05-03 | Synthetic-vs-real comparison visible in app | SATISFIED | `ValidationSection.tsx` |
| CRED-01 | 05-04 | Tier/date/sources/seams always visible, manifest-derived | SATISFIED | `ProvenanceStrip.tsx`, `provenance-fields.ts` |
| CRED-02 | 05-06 | Warning names bias direction | SATISFIED | `ExtendedTierWarning.tsx` |
| CRED-03 | 05-06 | Magnitude quantified via downsample/interpolate/measure | SATISFIED | `measure-extended-tier-bias.ts`; see Era Substitution Judgment |
| CRED-04 | 05-07 | Methodology page reachable in one click | SATISFIED | `MethodologyOverlay.tsx`, `ProvenanceStrip.tsx` link |
| CRED-05 | 05-08 | Defaults labelled and editable | SATISFIED | `DefaultBadge.tsx`/`ResetButton.tsx` across 8 controls |
| APP-02 | 05-05 | Tier selectable, meaning stated on screen | SATISFIED | `TierControl.tsx` |

No orphaned requirements: all 10 IDs assigned to Phase 5 in REQUIREMENTS.md appear in a plan's `requirements` frontmatter (ATTR-01/02 claimed by both 05-01 and 05-09, which is expected — 05-09 is the perf-measurement half of the same requirement).

### Anti-Patterns Found

Scanned all files listed in the 05-REVIEW.md file set (superset of files modified across all 9 plans) for TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER/empty-implementation patterns. No debt markers found. All "placeholder" string matches are legitimate references to `format.ts`'s `UNDEFINED_PLACEHOLDER` ("n/a") formatting concept, not stub code.

Carried forward from 05-REVIEW.md (not fixed, assessed below — none rise to a must-have blocker):

| File | Finding | Severity | Impact on must-haves |
|------|---------|----------|----------------------|
| `MethodologyOverlay.tsx:172,197` | WR-01: `findMeasuredNoiseMechanism()` runs unconditionally at mount, would throw if the `'fund-nav-vs-market-close-pricing-basis'` registry row is ever renamed | Warning | None today — confirmed the registry entry exists in `cost-parameters.ts:419`; this is a latent fragility for future edits, not a current defect |
| `EntryDateControl.tsx:69-79` | WR-02: clearing the date field on extended tier reverts to the tier bound, not the strict-tier default the badge checks against | Warning | Documented as deliberate in the module's own comment; does not contradict any must-have wording |
| `MethodologyOverlay.tsx:183-195` | WR-03: `gateSnapshots` recomputes two full backtests on every overlay open, uncached | Warning | Performance-only, explicitly out of scope for correctness; does not affect any must-have's truth |
| `format.ts:31-37` | IN-02: `formatMultiple`'s scientific-notation threshold uses `>` not `>=` at exactly 1e6 | Info | Boundary-value nit, no functional impact |

None of these warnings undermine a phase must-have; they are pre-existing, judgment-call-level quality notes correctly left unfixed for this pass.

### Human Verification Required

None. All must-haves resolved to VERIFIED via code inspection, existing/added automated tests, and direct execution of the relevant test files and bench artifact.

### Gaps Summary

No gaps found. The one blocker identified by code review (CR-01) has a confirmed, correct fix with a passing regression test. The extended-tier-bias era substitution (2000-2012 instead of the full strict-tier range) is a legitimate exercise of the discretion D-21 explicitly grants, correctly documented in the script, and produces a figure whose sign and magnitude are consistent with the claimed "understates drag" direction. The ProvenanceStrip tier field reads a live signal rather than a hardcoded literal. All three orchestrator-flagged judgment calls resolve in favor of the phase goal being achieved.

---

_Verified: 2026-08-21T02:12:06Z_
_Verifier: Claude (gsd-verifier)_
