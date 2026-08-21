---
phase: 05-attribution-and-the-credibility-surface
plan: 01
subsystem: attribution
tags: [shapley, cost-decomposition, solid-component, formatters]
status: complete
dependency-graph:
  requires:
    - src/kernel/backtest.ts (runBacktest, day-count constants)
    - src/data/kernel-inputs.ts (KernelInputs)
    - src/app/state.ts (scheduleRun's existing rAF-coalesced pass)
    - src/app/components/ResultColumn/MetricsPanel.tsx (fixed-row panel pattern this plan follows)
  provides:
    - src/validation/attribution.ts (computeAttribution, AttributionResult)
    - src/app/components/ResultColumn/AttributionPanel.tsx (AttributionPanel)
    - src/app/state.ts (currentAttribution())
    - src/metrics/format.ts (formatSignedCurrency, formatSignedPercent)
  affects:
    - src/app/App.tsx (mounts AttributionPanel under MetricsPanel)
    - src/app/styles.css (.attribution-panel, .attribution-row, .attribution-label, .attribution-value)
tech-stack:
  added: []
  patterns:
    - "Shapley value over 8 counterfactual subsets, closed-form weighted-marginal formula (not a fixed ladder)"
    - "Array-driven row rendering (componentRows.map) so no cost row is special-cased by name"
key-files:
  created:
    - src/validation/attribution.ts
    - src/app/components/ResultColumn/AttributionPanel.tsx
    - tests/attribution/shapley.test.ts
    - tests/app/attribution.browser.test.ts
  modified:
    - src/app/state.ts
    - src/app/App.tsx
    - src/app/styles.css
    - src/metrics/format.ts
    - tests/metrics/format.test.ts
decisions:
  - "Naive row copy uses ASCII 'x' rather than '×', matching the plan's own literal task text"
  - "D-04 gain suffix rendered as ' - compounding helped' (plain hyphen, not em dash) per this project's absolute em-dash prohibition; UI-SPEC's literal text uses an em dash"
  - "Reconciliation row uses unsigned formatPercent (not formatSignedPercent) since a '+100.00%' reading would be confusing for a total that is always near 100% by construction"
metrics:
  duration: ~55min
  completed: 2026-08-20
actuals:
  tokens: 12126
  tasks: 3
  commits: 4
---

# Phase 05 Plan 01: Attribution Panel Summary

Shapley-decomposed cost attribution (volatility drag, financing cost, expense ratio) computed
inside the existing coalesced recompute pass and rendered as a fixed five-row panel under the
metrics panel, with signed formatters added to the single shared formatting module.

## What Was Built

**Task 1 (tracer):** `computeAttribution(inputs, actualResult)` in `src/validation/attribution.ts`,
initially carrying only `naiveFinalValue`/`actualFinalValue`/`totalGap`. `naiveFinalValue`
implements D-02's `initial * (1 + leverage * cumulativeIndexReturn)`, generalized per D-05 to a
sum over cash flows when a contribution schedule is active. Wired into `state.ts`'s
`storeSuccessfulRun`/`clearForEviction` so `currentAttribution()` updates inside the same
`requestAnimationFrame` callback `scheduleRun` already runs `runBacktest` in (verified: exactly
one `requestAnimationFrame(` call and one `performance.mark('recompute-start')` call in
`state.ts`, unchanged from before this plan). `AttributionPanel.tsx` mounted directly under
`MetricsPanel` inside the D-20 screenshot region, gated on the same `currentDerivedMetrics() !==
null` check, rendering the naive and actual rows.

The tracer feedback gate (interactive run, `auto_advance`/`_auto_chain_active` both false) paused
here for human verification; approved, with commit f03cc8e accepted as-is.

**Task 2 (`tdd="true"`, `reversibility="costly"`):** extends `computeAttribution` to the full
D-01/D-03 Shapley decomposition over three binary factors (`compounding`, `financing`,
`expense`), evaluating all eight counterfactual subsets and reducing to three Shapley values via
the closed-form weighted-marginal-contribution formula (mathematically equivalent to averaging
over all `3! = 6` orderings, never a fixed narrative ladder). The four subsets containing
`compounding` are real `runBacktest` calls; financing-off zeroes BOTH `financingSpread` and the
per-bar `shortRate` array (zeroing only the spread would leave the kernel's base rate-driven cost
live). The all-factors-on subset reads the cached `actualResult.finalValue` rather than a ninth
kernel call. The four subsets without `compounding` apply F-03's own reasoned resolution: simple,
non-compounded annualized deductions over the same `calendarDaysElapsed` array and the same two
day-count bases (`FINANCING_DAY_COUNT_BASIS`, `EXPENSE_DAY_COUNT_BASIS`, imported from
`backtest.types.ts`, never re-declared or approximated with 365.25/252) the kernel itself uses,
accrued against each bar's outstanding principal. Tagged `ASSUMED` in the module head comment,
per the plan's instruction that this is the project's own modelling choice, to be stated on the
CRED-04 methodology page (plan 05-07).

Followed the RED/GREEN TDD gate: `tests/attribution/shapley.test.ts` committed first
(commit `0b6cc7d`) against the Task-1-only `AttributionResult`, confirmed RED (5/7 cases failed --
the two that "passed" did so vacuously, one via a `.not.toBe()` assertion and one that calls
`runBacktest` directly without touching `computeAttribution`'s new fields at all). The
implementation then landed GREEN (commit `6d95a7c`, 7/7 passing), including two `fast-check`
property tests: reconciliation (the three components sum to `totalGap` within 1e-6 relative
tolerance, over arbitrary finite parameter/series combinations) and order-independence (the
closed-form Shapley result matches an independently-written brute-force average over all six
factor orderings).

**Task 3:** `formatSignedCurrency`/`formatSignedPercent` added to `src/metrics/format.ts`,
wrapping `formatCurrency`/`formatPercent`'s own grouping and rounding rather than reimplementing
either (a naive `sign + formatCurrency(amount)` would have produced `"$-500"` for a negative
input, since `formatCurrency`'s own `toLocaleString` already embeds the minus sign; both new
formatters compute the sign first and format the absolute magnitude). `AttributionPanel.tsx`
extended to the full D-08 fixed five-row layout: naive, actual, then three signed cost rows
rendered from one `componentRows.map()` loop (identical markup and formatting call for all three,
so no row is special-cased by name), then the reconciliation row. D-04's gain suffix
(`" - compounding helped"`, a plain hyphen substituted for the Copywriting Contract's literal em
dash per this project's absolute em-dash-in-any-output rule) appears on any of the three rows
whose sign is a gain, never reworded, never a differently-named row. F1's error rule: the
reconciliation row is suppressed (via `<Show>`) whenever any of the six component/share values is
non-finite; the individual component rows still render, since `formatSignedCurrency`/
`formatSignedPercent` already print the `format.ts` undefined placeholder for a non-finite input.

## Verification

- `npx vitest run --project app tests/app/attribution.browser.test.ts`: 4/4 passing
- `npx vitest run --project unit tests/attribution/shapley.test.ts`: 7/7 passing (RED confirmed
  before GREEN, per the plan's TDD contract)
- `npx vitest run --project unit tests/metrics/format.test.ts`: 23/23 passing
- `npm test` (full unit project): 567/567 passing
- `npm run test:app` (full browser project): 57/57 passing
- `npx tsc --noEmit`: clean
- `grep -c "requestAnimationFrame(" src/app/state.ts` == 1; `grep -c
  "performance.mark('recompute-start')" src/app/state.ts` == 1 (unchanged from before this plan)
- `grep -cE "toFixed|toLocaleString" src/app/components/ResultColumn/AttributionPanel.tsx` == 0
- `grep -cE "365\.25|252" src/validation/attribution.ts` == 0
- Module head comment of `src/validation/attribution.ts` contains the token `ASSUMED`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test bug] `-0` vs `+0` in two Task 2 fixture assertions**
- **Found during:** Task 2 GREEN verification
- **Issue:** Two `expect(attribution.financingCost).toBe(0)` assertions failed with `Object.is`
  reporting `-0 !== 0`. The Shapley negation of an exact-zero factor contribution legitimately
  produces `-0` in JavaScript, which is mathematically zero but fails strict `Object.is` equality.
- **Fix:** Switched both assertions to `expect(Math.abs(attribution.financingCost)).toBe(0)`,
  which treats `-0` and `+0` as the same "exactly zero" fact the test is asserting.
- **Files modified:** `tests/attribution/shapley.test.ts`
- **Commit:** 6d95a7c

**2. [Rule 3 - Blocking environment issue] Broken `rolldown` native binding blocked all `--project
unit` tests**
- **Found during:** Task 2 RED verification
- **Issue:** `node_modules/@rolldown/` had only the `darwin-arm64` binding installed, but this
  sandbox is Linux arm64 -- every `vitest run --project unit` invocation failed at startup with
  "Cannot find native binding" before any test file ran. Unrelated to any code in this plan;
  confirmed by running an unrelated pre-existing test (`tests/metrics/format.test.ts`, prior
  version) and observing the identical startup failure.
- **Fix:** Ran `npm install` (no package name, no lockfile/version change) to let npm resolve the
  correct platform-specific optional dependency already declared in the existing lockfile. This
  installed `@rolldown/binding-linux-arm64-gnu`/`-musl` alongside the existing `darwin-arm64`
  binding. Not a package-manager install of a new/unverified package (the Rule 3 exclusion this
  deviation type is otherwise subject to) -- `rolldown` was already a transitive dependency of the
  already-approved `vite`/`vitest` toolchain; this repaired a missing platform binary for an
  existing, already-vetted dependency.
- **Files modified:** none (node_modules only, gitignored)
- **Commit:** n/a (no tracked files changed)

**3. [Rule 1 - Test bug] Off-by-one in the "all six rows render" test's `querySelectorAll` scope**
- **Found during:** Task 3 browser verification
- **Issue:** `panel!.querySelectorAll('[data-testid]')` returns descendants only, not the `panel`
  element itself, so the expected test-id array incorrectly included `'attribution-panel'` as the
  first entry.
- **Fix:** Removed `'attribution-panel'` from the expected array; added a comment noting why.
- **Files modified:** `tests/app/attribution.browser.test.ts`
- **Commit:** 0ec9847

None of the above required an architectural decision (Rule 4) or a checkpoint.

## Authentication Gates

None encountered.

## Known Stubs

None. Every value rendered by `AttributionPanel` is a real computation from `computeAttribution`;
no hardcoded, mocked, or placeholder data exists anywhere in this plan's changes.

## Threat Flags

None. Both threats this plan's `<threat_model>` names (T-05-01 DoS via per-frame allocation,
T-05-02 tampering via an inline-formatted numeric string) are the mitigations this plan
implements, not new surface: `computeAttribution`'s counterfactual arms allocate their output
buffers once per call (never inside a per-bar loop), and every rendered number routes through
`src/metrics/format.ts`. No new network endpoint, auth path, file access pattern, or schema
change was introduced.

## Backstop Items Not Independently Verified

The plan's `must_haves.truths` mark two rows as `verification: backstop` (a rendered-pixel
question, not provable in prose): the longest signed-component row wrapping under its label, and
the D-04 gain suffix wrapping onto its own line rather than forcing horizontal scroll, both at the
narrowest supported viewport. `.attribution-row` inherits the exact `display: flex; flex-wrap:
wrap` mechanism `.metric-row` already uses (proven in Phase 4), and no `white-space: nowrap` rule
applies to `.attribution-value`, so the structural mechanism for both backstop claims is in place.
No dedicated narrow-viewport screenshot test was added in this plan (Task 3's own
`<acceptance_criteria>` does not require one); per the UI-SPEC's own routing rule for backstop
rows with no wired evidence, this is flagged here for phase-level UI review rather than asserted
as independently verified.

## Self-Check: PASSED

- FOUND: src/validation/attribution.ts
- FOUND: src/app/components/ResultColumn/AttributionPanel.tsx
- FOUND: tests/attribution/shapley.test.ts
- FOUND: tests/app/attribution.browser.test.ts
- FOUND: f03cc8e (Task 1 commit)
- FOUND: 0b6cc7d (Task 2 RED commit)
- FOUND: 6d95a7c (Task 2 GREEN commit)
- FOUND: 0ec9847 (Task 3 commit)
