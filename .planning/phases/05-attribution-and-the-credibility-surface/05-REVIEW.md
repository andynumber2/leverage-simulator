---
phase: 05-attribution-and-the-credibility-surface
reviewed: 2026-08-21T00:00:00Z
depth: standard
files_reviewed: 50
files_reviewed_list:
  - bench/perf-07.bench.test.ts
  - package.json
  - scripts/measure-extended-tier-bias.ts
  - src/app/App.tsx
  - src/app/components/MethodologyOverlay.tsx
  - src/app/components/ParameterColumn/ContributionControl.tsx
  - src/app/components/ParameterColumn/CostControls.tsx
  - src/app/components/ParameterColumn/DefaultBadge.tsx
  - src/app/components/ParameterColumn/EntryDateControl.tsx
  - src/app/components/ParameterColumn/HoldingModeControl.tsx
  - src/app/components/ParameterColumn/InitialInvestmentControl.tsx
  - src/app/components/ParameterColumn/LeverageControl.tsx
  - src/app/components/ParameterColumn/ParameterColumn.tsx
  - src/app/components/ParameterColumn/ResetButton.tsx
  - src/app/components/ParameterColumn/SymbolControl.tsx
  - src/app/components/ParameterColumn/TierControl.tsx
  - src/app/components/ResultColumn/AttributionPanel.tsx
  - src/app/components/ResultColumn/EquityCurveChart.tsx
  - src/app/components/ResultColumn/ExtendedTierWarning.tsx
  - src/app/components/ResultColumn/ProvenanceStrip.tsx
  - src/app/components/ResultColumn/ResultSummaryHeader.tsx
  - src/app/components/ResultColumn/naive-series.ts
  - src/app/components/ResultColumn/provenance-fields.ts
  - src/app/components/ValidationSection/FundSelector.tsx
  - src/app/components/ValidationSection/SubWindowTable.tsx
  - src/app/components/ValidationSection/TrackingErrorSummary.tsx
  - src/app/components/ValidationSection/ValidationSection.tsx
  - src/app/parameter-defaults.ts
  - src/app/state.ts
  - src/app/styles.css
  - src/metrics/format.ts
  - src/validation/attribution.ts
  - src/validation/extended-tier-bias.generated.ts
  - src/validation/synthetic-comparison.ts
  - tests/app/attribution.browser.test.ts
  - tests/app/entry-date-tier.browser.test.ts
  - tests/app/extended-tier-warning.browser.test.ts
  - tests/app/methodology-overlay.browser.test.ts
  - tests/app/naive-ghost-series.browser.test.ts
  - tests/app/naive-ghost-series.test.ts
  - tests/app/narrow-viewport.browser.test.ts
  - tests/app/parameter-defaults.browser.test.ts
  - tests/app/parameter-defaults.test.ts
  - tests/app/permalink-methodology.test.ts
  - tests/app/permalink.test.ts
  - tests/app/provenance-strip.browser.test.ts
  - tests/app/provenance-strip.test.ts
  - tests/app/screenshot-region.browser.test.ts
  - tests/app/validation-section.browser.test.ts
  - tests/attribution/shapley.test.ts
  - tests/metrics/format.test.ts
  - tests/validation/extended-tier-bias.test.ts
  - tests/validation/synthetic-comparison.test.ts
  - tests/validation/upro-tqqq-gate.test.ts
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-08-21
**Depth:** standard
**Files Reviewed:** 50 (1 listed file, `src/app/components/ResultColumn/ResultSummaryHeader.tsx`, does not exist on disk and appears to have been superseded by `ProvenanceStrip.tsx`; not reviewed)
**Status:** issues_found

## Summary

The numeric core of this phase (`src/validation/attribution.ts`'s Shapley decomposition, `src/validation/synthetic-comparison.ts`'s overlap-window resolution, `scripts/measure-extended-tier-bias.ts`, `src/metrics/format.ts`) is careful, well-commented, and backed by strong property-based tests (`tests/attribution/shapley.test.ts` cross-checks the closed-form Shapley formula against a brute-force permutation average; `tests/app/naive-ghost-series.test.ts` cross-checks the ghost-curve prefix-product recurrence against the attribution module's own suffix-product final value). I traced the day-count arithmetic, the Shapley weighting formula, the bar-0 cost-free-anchor convention, and the naive-value cash-flow recurrence by hand and found no unit, sign, or off-by-one errors.

The one serious defect found is in the UI layer, not the math: `AttributionPanel.tsx` computes its per-component rows and reconciliation total as plain values in the component body rather than inside a reactive/JSX-tracked expression, which is a classic SolidJS reactivity pitfall. As a result, the volatility-drag/financing-cost/expense-ratio dollar amounts and the reconciliation percentage freeze at whatever the first completed run computed and never update on subsequent parameter changes, even though the naive/actual rows directly above them (and the rest of the app) update correctly. Given this app's stated purpose — showing which cost mechanism consumed the money for the parameters currently on screen — this is a correctness-breaking bug that the existing test suite does not catch, because the only "leverage changes the numbers" test asserts on the naive/actual rows, not the three component rows.

## Critical Issues

### CR-01: AttributionPanel's cost-component rows and reconciliation total never update after the first render (SolidJS reactivity broken by pre-computing props outside a tracked scope)

**File:** `src/app/components/ResultColumn/AttributionPanel.tsx:57-116`

**Issue:** `AttributionPanel` builds `componentRows` (the volatility-drag/financing-cost/expense-ratio value+share pairs) and `reconciliationTotal` as plain local variables in the component function body, reading `props.attribution.*` directly:

```tsx
export function AttributionPanel(props: AttributionPanelProps) {
  const componentRows: ComponentRowDef[] = [
    { testId: 'attribution-volatility-drag', label: 'Volatility drag', value: props.attribution.volatilityDrag, share: props.attribution.volatilityDragShare },
    // ...
  ]
  const reconciliationTotal =
    props.attribution.volatilityDragShare + props.attribution.financingCostShare + props.attribution.expenseRatioShare
  return (
    <div ...>
      {componentRows.map((row) => ( ... ))}
      ...
```

SolidJS components run their function body exactly once, at mount. Reading a reactive prop (`props.attribution.x`) outside of JSX or a tracked scope (`createMemo`/`createEffect`/the JSX compiler's own implicit render effects) performs a one-time "peek" — it does not subscribe to future changes. `componentRows` and `reconciliationTotal` are therefore frozen snapshots of whatever `props.attribution` held the instant `AttributionPanel` was first invoked.

`AttributionPanel` is mounted once, under `<Show when={currentAttribution() !== null}>` in `App.tsx` (`src/app/App.tsx:162-164`). Because `currentAttribution()` stays non-null for the entire session after the first successful run (it only goes `null` on an eviction), `Show` never unmounts/remounts the panel, so the component function body — and therefore `componentRows`/`reconciliationTotal` — never runs again. Every subsequent parameter change (leverage, entry date, cost sliders, contribution schedule, etc.) updates `currentAttribution()` with fresh numbers, but the volatility-drag, financing-cost, expense-ratio, and reconciliation rows keep displaying the values from the very first run of the session.

By contrast, the naive/actual rows (`{formatCurrency(props.attribution.naiveFinalValue)}` etc., lines 92 and 97) read `props.attribution` directly inside the JSX return, which the Solid compiler does wrap in a tracked render effect — those two rows update correctly. This asymmetry is why `tests/app/attribution.browser.test.ts`'s "changing leverage... changes both rendered attribution values" test (which only checks the naive/actual rows) passes despite the bug: it never asserts that the three component rows or the reconciliation row change after a parameter edit.

This is a real, user-visible defect in a financial tool whose entire premise is showing "where the money went" for the parameters currently on screen — after the first run, the three cost-attribution numbers silently stop tracking reality while everything else in the UI (chart, metrics, naive/actual) keeps updating.

**Fix:** Read `props.attribution` reactively wherever the values are consumed — either turn `componentRows`/`reconciliationTotal` into functions/`createMemo`s that re-derive from `props.attribution` on each call, and iterate with Solid's `<For>` instead of a plain `.map()`:

```tsx
export function AttributionPanel(props: AttributionPanelProps) {
  const componentRows = (): ComponentRowDef[] => [
    { testId: 'attribution-volatility-drag', label: 'Volatility drag', value: props.attribution.volatilityDrag, share: props.attribution.volatilityDragShare },
    { testId: 'attribution-financing-cost', label: 'Financing cost', value: props.attribution.financingCost, share: props.attribution.financingCostShare },
    { testId: 'attribution-expense-ratio', label: 'Expense ratio', value: props.attribution.expenseRatio, share: props.attribution.expenseRatioShare },
  ]
  const reconciliationTotal = () =>
    props.attribution.volatilityDragShare + props.attribution.financingCostShare + props.attribution.expenseRatioShare

  return (
    <div class="attribution-panel" data-testid="attribution-panel">
      ...
      <For each={componentRows()}>
        {(row) => (
          <div class="attribution-row" data-testid={row.testId}>
            ...
          </div>
        )}
      </For>
      <Show when={reconciliationIsWellDefined(props.attribution)}>
        <div class="attribution-row" data-testid="attribution-reconciliation">
          <span class="attribution-label">Total:</span>
          <span class="attribution-value">{formatPercent(reconciliationTotal())}</span>
        </div>
      </Show>
    </div>
  )
}
```

Add a regression test alongside the existing leverage-change test in `tests/app/attribution.browser.test.ts` that asserts the volatility-drag/financing-cost/expense-ratio row text (not just naive/actual) changes after `updateBacktestRequest({ leverage: 2 })`, so this class of bug cannot silently reappear.

## Warnings

### WR-01: `MethodologyOverlay`'s per-render helper `findMeasuredNoiseMechanism()` throws synchronously on every mount if the registry entry is renamed, outside any `Show`/error boundary

**File:** `src/app/components/MethodologyOverlay.tsx:172,197`

**Issue:** `MethodologyOverlay()`'s body calls `findMeasuredNoiseMechanism()` unconditionally at line 197, before the `Show when={methodologyOverlayOpen()}` gate that wraps the actual rendered output. `MethodologyOverlay` is mounted unconditionally in `App.tsx` (`src/app/App.tsx:180`), so this call — and its throw path if `TOLERANCE_MECHANISMS` ever drops or renames the `'fund-nav-vs-market-close-pricing-basis'` row — runs on every app load, regardless of whether the overlay is ever opened, and is not caught by the `try`/`catch` the component's own comment describes for `gateSnapshots` (that `try`/`catch` only wraps the `createMemo` body, not this call). A synchronous throw here would take down the whole app at boot, not just degrade the methodology overlay.

**Fix:** Move `findMeasuredNoiseMechanism()`'s call (and the `noiseFraction`/`noiseShareOfTolerance` derivation that depends on it) inside a `createMemo` guarded the same way `gateSnapshots` is, or at minimum gate it behind `methodologyOverlayOpen()` so a registry drift only breaks the overlay when actually opened, not the whole app on every load.

### WR-02: `EntryDateControl`'s `onChange` handler reverts an empty date to `bounds()`'s currently-active-tier bound, not the strict-tier default `PARAMETER_DEFAULTS.entryDate` documents

**File:** `src/app/components/ParameterColumn/EntryDateControl.tsx:69-79`

**Issue:** The module comment (lines 18-23) explicitly distinguishes "clearing the field" (reverts to whichever tier's bound is active) from "Reset" (always reverts to the strict-tier default) as a deliberate design choice, so this is arguably working as intended per that comment. However, this means a user on the extended tier who clears the date field lands on a *different* value (the extended tier's earliest date) than what the "default" badge (`PARAMETER_DEFAULTS.entryDate.isDefault()`, always resolved against the strict tier) would report as default — the field can show a non-badge-worthy date immediately after being cleared, which reads as a minor UX inconsistency between "the value I get from clearing" and "the value badged as default." This is intentional per the comment, but the surface behavior (clear a field, badge does not appear) is easy to mistake for a bug; recommend a short inline test asserting this distinction explicitly (searched the test list and found none that clears the entry-date field directly while on the extended tier) so the intended-vs-accidental behavior stays pinned.

**Fix:** Add a regression test in `tests/app/entry-date-tier.browser.test.ts` that clears the entry-date field while the extended tier is selected and asserts the resulting date equals the extended tier's bound (not the strict-tier default), documenting the deliberate divergence from the Reset button's behavior.

### WR-03: `MethodologyOverlay`'s `gateSnapshots` recomputes two full backtest runs (UPRO and TQQQ gate arms) synchronously inside a `createMemo` every time the overlay opens, with no loading state

**File:** `src/app/components/MethodologyOverlay.tsx:183-195`

**Issue:** `computeFundGateSnapshot` calls `buildKernelInputs`/`runBacktest` twice per fund (implicitly, since `resolveOverlapWindow` + `runBacktest` run once per fund, times two funds) inside a synchronous `createMemo`, blocking the main thread for however long two multi-decade backtests take, every single time `methodologyOverlayOpen()` flips true (not cached across opens/closes — `createMemo` re-derives whenever its dependencies, including `methodologyOverlayOpen()`, change, and there is no additional memoization keyed on "already computed once this session"). This is out of scope for a correctness/security finding (performance is explicitly out of scope per the review brief), but it is worth flagging as a quality concern: opening the overlay a second time after closing it recomputes both gate snapshots from scratch rather than caching the first result, even though neither the bundle nor the gate's own canonical parameters ever change between opens.

**Fix:** Cache `gateSnapshots`' result across opens (e.g., compute once lazily on first open and keep it, rather than re-deriving via `methodologyOverlayOpen()` as a memo dependency), or accept the current behavior if the recompute cost is negligible in practice — worth a one-line comment either way so a future reader knows this was a deliberate tradeoff rather than an oversight.

## Info

### IN-01: `ResultSummaryHeader.tsx` listed in review scope does not exist on disk

**File:** `src/app/components/ResultColumn/ResultSummaryHeader.tsx`

**Issue:** This file was listed in the phase's file scope but does not exist in the working tree; no references to `ResultSummaryHeader` remain anywhere in `src/` or `tests/` (grepped). It appears to have been fully replaced by `ProvenanceStrip.tsx` in this phase's plan 05-07/T-05-08 work, and the stale reference is a scoping artifact rather than a code defect.

**Fix:** No code change needed; the phase's plan/tracking documents referencing this filename should be updated so future reviews don't request a nonexistent file.

### IN-02: `formatMultiple`'s scientific-notation threshold uses `>` rather than `>=`, so exactly `1e6` still renders as a 12-character fixed string

**File:** `src/metrics/format.ts:31-37`

**Issue:** The doc comment says the format "switch[es] to scientific notation so the rendered string stays bounded regardless of magnitude," but `Math.abs(ratio) > SCIENTIFIC_NOTATION_THRESHOLD` means a ratio of exactly `1,000,000` renders as `"1000000.00x"` (11 characters) rather than switching to exponential form. This is a boundary-value nit, not a functional bug (the string is still finite and bounded, just one tick wider than the stated intent at exactly the threshold), and no test currently exercises the exact boundary value.

**Fix:** Change the comparison to `>=` if the intent is a strict upper bound on rendered width at and above `1e6`, or leave as-is and adjust the doc comment to say "above" precisely (which it already does) — flagging only because the boundary condition is untested either way.

---

_Reviewed: 2026-08-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
