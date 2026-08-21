# Phase 5: Attribution and the Credibility Surface - Pattern Map

**Mapped:** 2026-08-20
**Files analyzed:** 15 (new) + 4 (modified)
**Analogs found:** 15 / 15

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/validation/attribution.ts` (`computeAttribution`) | service (pure compute) | transform (Shapley/counterfactual) | `src/validation/tracking-error.ts` | role-match |
| `src/validation/synthetic-comparison.ts` (extracted F-01 helpers) | service (pure compute) | transform | `tests/validation/upro-tqqq-gate.test.ts` (private helpers, extraction source) | exact (extraction, not new pattern) |
| `src/app/components/ResultColumn/AttributionPanel.tsx` | component | request-response (props render) | `src/app/components/ResultColumn/MetricsPanel.tsx` | exact |
| `src/app/components/ResultColumn/ProvenanceStrip.tsx` | component | request-response | `src/app/components/ResultColumn/ResultSummaryHeader.tsx` | exact |
| `src/app/components/ResultColumn/ExtendedTierWarning.tsx` | component | request-response (conditional) | `src/app/components/ResultColumn/RuinBanner.tsx` | exact |
| `src/app/components/ParameterColumn/TierControl.tsx` | component | request-response (form control) | `src/app/components/ParameterColumn/HoldingModeControl.tsx` (radio-style select, not read but same family as SymbolControl/CostControls) | role-match |
| `src/app/components/ParameterColumn/DefaultBadge.tsx` + `ResetButton.tsx` | component | request-response | `src/app/components/ParameterColumn/SourceCitation.tsx` + `CostControls.tsx`'s `<Show>` default pattern | exact |
| `src/app/components/ResultColumn/EquityCurveChart.tsx` (modified: ghost series) | component | streaming/render (canvas) | itself (`buildTerminatorData`, existing null-gap idiom) | exact |
| `src/app/components/ResultColumn/ValidationSection.tsx` (+`FundSelector`, `TrackingErrorSummary`, `SubWindowTable`) | component | request-response | `src/app/components/ResultColumn/MetricsPanel.tsx` (fixed-row panel) + `ResultSummaryHeader.tsx` | role-match |
| `src/app/components/MethodologyOverlay.tsx` | component | request-response (full-screen overlay, generated content) | `src/app/components/ResultColumn/MetricsPanel.tsx` (renders from structured data, no other overlay precedent exists) | partial (no overlay precedent in repo) |
| `src/app/permalink.ts` (modified: strip `methodology` before decode) | utility | transform | itself, `decodeParams`/`applyPermalinkFromLocation` (`src/app/state.ts:503`) | exact |
| `src/app/components/ParameterColumn/EntryDateControl.tsx` (modified: tier-aware bounds + default/reset) | component | request-response (form control) | `src/app/components/ParameterColumn/CostControls.tsx` | exact |
| `src/metrics/format.ts` (modified: add signed-currency/percent formatter) | utility | transform | itself | exact |
| `src/validation/extended-tier-bias.generated.ts` (D-21 generated module) | config/generated | batch (build-time) | `src/data-bundle.generated.ts` + `tools/bundle-compiler/src/compile.ts`'s `writeGeneratedPointerModule` | exact |
| `scripts/measure-extended-tier-bias.ts` (D-21 measurement script) | utility (CLI script) | batch | `tools/bundle-compiler/src/cli.ts` (node `--experimental-strip-types` script convention) | exact |
| `tests/validation/*.test.ts` (attribution property tests, provenance-trace test D-16, pinning test for D-21) | test | transform/CRUD | `tests/validation/upro-tqqq-gate.test.ts`, `src/validation/cost-parameters.ts`'s header-described pinning-test pattern | exact |

## Pattern Assignments

### `src/validation/attribution.ts` — `computeAttribution`

**Analog:** `src/validation/tracking-error.ts` (pure function, no Solid/kernel/data-layer imports at module scope other than types) and `src/kernel/backtest.ts` (the function every counterfactual arm calls).

**Core pattern to copy — zeroing financing correctly for a counterfactual arm** (RESEARCH.md Code Example 1, verified against `src/kernel/backtest.ts:136` and `src/kernel/backtest.types.ts:20-23`):
```typescript
// WRONG: financingCost = value * (leverage-1) * (shortRate[i] + 0) * (gap/360) still nonzero.
const noFinancingParams: KernelParams = { ...realParams, financingSpread: 0 }

// CORRECT: zero the per-bar rate array too.
const zeroRateSeries: KernelSeries = {
  ...realSeries,
  shortRate: new Float64Array(realSeries.shortRate.length),
}
const noFinancingParams: KernelParams = { ...realParams, financingSpread: 0 }
const noFinancingOutputs = allocateKernelOutputs(barCount) // SIM-11: caller-preallocated, once per window
const noFinancingResult = runBacktest(noFinancingParams, zeroRateSeries, noFinancingOutputs)
```

**Day-count constants to reuse, not re-derive** (Pitfall 5): import `FINANCING_DAY_COUNT_BASIS`/`EXPENSE_DAY_COUNT_BASIS` from `src/kernel/backtest.types.ts` (declared there, re-declared locally in `backtest.ts:46/49` per the kernel's own zero-import discipline — the new attribution module is NOT part of that discipline, so it imports from `types.ts` directly).

**Reconciliation-by-construction:** the eighth arm (`v({compounding,financing,expense})`) must read the already-cached `currentKernelResult().finalValue` rather than re-running the kernel a ninth time — reuse `src/app/state.ts`'s `currentKernelResult` accessor.

**Where it plugs in:** called from inside `scheduleRun`'s existing rAF-coalesced pass (`src/app/state.ts`), not as separate scheduled work — no new scheduling pattern needed.

---

### `src/validation/synthetic-comparison.ts` (F-01 extraction)

**Analog:** `tests/validation/upro-tqqq-gate.test.ts` (source of the private helpers to extract) and `src/validation/tracking-error.ts` (the target module shape: no test-context, no kernel import, no data-layer import).

**Pattern:** extract, verbatim where possible, these currently-private functions out of the test file into the new module, then rewrite the gate test to import from it:
- `readSeriesLevels` (test file lines 113-134)
- `sliceLevelsToWindow` (lines 138-154)
- `deriveReturns` (lines 159-168)
- `localIndexAtOrBefore` / `localIndexAtOrAfter` (lines 172-216)
- constants: `MIN_OVERLAP_YEARS = 15`, `LEVERAGE = 3`, `NEAR_ZERO_RATE_ERA_END = '2015-12-31'`, `HIGH_RATE_ERA_START = '2022-01-01'`

**No-fitting constraint to preserve verbatim** (quoted from the gate test's own header, lines 11-14): "VALID-03/D-20's no-fitting protocol governs a failure here... `COST_PARAMETERS`... is never edited in response to a measurement taken by this file." This comment must survive the extraction and apply equally to the new in-app second caller.

---

### `src/app/components/ResultColumn/AttributionPanel.tsx`

**Analog:** `src/app/components/ResultColumn/MetricsPanel.tsx` (fixed-row-count panel, `data-testid` per row, routes every number through `format.ts`).

**Imports pattern** (verbatim structure to copy, `MetricsPanel.tsx:11-15`):
```typescript
import { Show } from 'solid-js'
import type { KernelResult } from '../../../kernel/backtest.types.ts'
import { formatCurrency, formatMultiple, formatPercent } from '../../../metrics/format.ts'
import type { DerivedMetrics } from '../../state.ts'
```

**Core fixed-row pattern** (`MetricsPanel.tsx:29-77`): one `<div class="metric-row" data-testid="...">` per row, `Show when={...}` guarding conditional rows (mirrors D-08's five fixed rows: naive, actual, 3 signed components, reconciliation — never a variable-length list). The "undefined" placeholder discipline (`IRR_UNDEFINED_COPY` constant, never `NaN`/`Infinity`/bare dash) is the direct template for the "n/a" row-suppression behavior UI-SPEC F1 specifies for a pathological counterfactual arm.

**New formatter needed:** extend `src/metrics/format.ts` with a signed-currency/signed-percent formatter (see format.ts pattern below) — do not add a second formatter module per CONTEXT.md's own discretion note.

---

### `src/app/components/ResultColumn/ProvenanceStrip.tsx`

**Analog:** `src/app/components/ResultColumn/ResultSummaryHeader.tsx` (exact same job — a dense row of facts read from already-in-memory state, no fetch).

**Full component to extend from** (`ResultSummaryHeader.tsx`, all 32 lines — read in full):
```typescript
import type { KernelInputs } from '../../../data/kernel-inputs.ts'

export interface ResultSummaryHeaderProps {
  inputs: KernelInputs
}

export function ResultSummaryHeader(props: ResultSummaryHeaderProps) {
  return (
    <div class="result-summary-header" data-testid="result-summary-header">
      <span class="result-summary-symbol" data-testid="result-summary-symbol">
        {props.inputs.meta.seriesId}
      </span>
      <span class="result-summary-date-range" data-testid="result-summary-date-range">
        {props.inputs.window.firstDate} to {props.inputs.window.lastDate}
      </span>
      <span class="result-summary-bundle-version" data-testid="result-summary-bundle-version">
        bundle {props.inputs.meta.bundleVersion}
      </span>
    </div>
  )
}
```
D-13 says this strip **extends/replaces** `ResultSummaryHeader`'s existing symbol/date/bundle-version fields with sources, seams-crossed, and the "View methodology" link (per UI-SPEC's component inventory) — treat this as growing the existing component, not adding a wholly separate one, unless the planner decides to keep both.

**Data source:** `loadedBundle().manifest.series.find(s => s.id === activeSeriesId)` — the `ManifestSeries`/`SeamRecord` shapes (`tools/bundle-compiler/src/manifest.ts:22-35`, `tools/bundle-compiler/src/seams.ts:11-27`) are the only fields this component may render (D-16's traceability test enforces this).

**D-14 filter (seams the window crosses), a pure interval-overlap test:**
```typescript
seams.filter(s => s.firstDate <= window.lastDate && s.lastDate >= window.firstDate)
```

---

### `src/app/components/ResultColumn/ExtendedTierWarning.tsx`

**Analog:** `src/app/components/ResultColumn/RuinBanner.tsx` (conditional categorical banner, single fixed message shape, `role="status"`, one CSS custom property, no per-instance color logic).

**Full component to copy structure from** (`RuinBanner.tsx`, all 22 lines):
```typescript
export interface RuinBannerProps {
  ruinDate: string
}

export function RuinBanner(props: RuinBannerProps) {
  return (
    <div class="ruin-banner" data-testid="ruin-banner" role="status">
      Position ruined on {props.ruinDate} - value reached zero and stays there.
    </div>
  )
}
```
`ExtendedTierWarning` follows the same shape but reads `--color-warning` instead of `--color-destructive` (new CSS custom property per UI-SPEC Color section), and interpolates the D-21 generated magnitude into its body text rather than a date. Rendered conditionally on `tier === 'extended'` in `App.tsx`, the same way `RuinBanner` is placed conditionally on `result.ruined`.

---

### `src/app/components/ParameterColumn/TierControl.tsx`

**Analog:** `src/app/components/ParameterColumn/CostControls.tsx` (default/citation/error `<Show>` wiring) plus `src/app/bounds.ts`'s existing `Tier` type and `resolveEntryDateBounds(manifest, symbol, dividendReinvest, tier)` signature (`bounds.ts:54,66-71`) — the plumbing already exists, only the UI control and the live signal are new.

**Load-bearing wiring gap this file must close** (`src/app/components/ParameterColumn/EntryDateControl.tsx:29-35`, verbatim, confirmed by reading the file):
```typescript
export function EntryDateControl(props: EntryDateControlProps) {
  const bounds = createMemo<EntryDateBoundsResult | null>(() => {
    const bundle = loadedBundle()
    if (bundle === null) return null
    const request = backtestRequest()
    return resolveEntryDateBounds(bundle.manifest, request.symbol, request.dividendReinvest, 'strict')
  })
```
The literal `'strict'` must become the live tier signal once `TierControl` exists. `bounds.ts`'s own comment (`bounds.ts:52-53`) confirms this was a deliberate Phase 4 placeholder for Phase 5 to remove: *"D-09: Phase 4 pins 'strict' throughout, but the type carries both members from day one so Phase 5 adds a tier-selector control over an existing parameter rather than migrating one in."* Grep `src/app/` for other hardcoded `'strict'` literals before finalizing the plan.

---

### `src/app/components/ParameterColumn/DefaultBadge.tsx` / `ResetButton.tsx` (D-22, generalized across 8 controls)

**Analog:** `src/app/components/ParameterColumn/SourceCitation.tsx` (full file, 32 lines — the existing default/citation annotation contract) and `CostControls.tsx`'s `isDefault`/`<Show>` wiring.

**Imports + two-part pattern to generalize** (`CostControls.tsx:75-76, 125-130`):
```typescript
const expenseRatioIsDefault = () => expenseRatioPercent() === DEFAULT_EXPENSE_RATIO_PERCENT

<Show
  when={expenseRatioIsDefault()}
  fallback={<SourceCitation text={userSuppliedExpenseRatioCitation()} />}
>
  <SourceCitation costParameterId="generic-3x-expense-ratio" />
</Show>
```

**`SourceCitation.tsx` full source** (the component this generalizes from — a `text`-or-`costParameterId` discriminated prop, reading `COST_PARAMETERS` directly so a citation can never drift):
```typescript
import { formatPercent } from '../../../metrics/format.ts'
import { COST_PARAMETERS, type CostParameterId } from '../../../validation/cost-parameters.ts'

export type SourceCitationProps = { text: string; costParameterId?: undefined } | { text?: undefined; costParameterId: CostParameterId }

function citationText(props: SourceCitationProps): string {
  if (props.costParameterId !== undefined) {
    const param = COST_PARAMETERS[props.costParameterId]
    return `${formatPercent(param.value)} - ${param.citation} (${param.confidence})`
  }
  return props.text
}

export function SourceCitation(props: SourceCitationProps) {
  return (
    <span class="source-citation" data-testid="source-citation">
      {citationText(props)}
    </span>
  )
}
```

**Gap to close (RESEARCH.md Pattern 4):** `CostControls.tsx`'s existing "reset" gesture is implicit (clearing the text input restores default, `CostControls.tsx:80-84`). This gesture does not exist for a `<select>` (tier, holding mode, contribution frequency, dividend mode) or a native `<input type="date">` (clearing means something else already, per `EntryDateControl.tsx:64-68`). `ResetButton` needs an explicit small button, rendered only when `!isDefault()`, reusing each control's existing validated setter as its write path (UI-SPEC F8: "Reset cannot itself fail... writes the shipped default constant through the control's existing validated setter, the same path an edit-to-default takes").

---

### `src/app/components/ResultColumn/EquityCurveChart.tsx` (modified — ghost naive series)

**Analog:** itself — the existing `buildTerminatorData` null-gap idiom is the exact mechanism to reuse for a different fill pattern.

**Pattern to copy verbatim in shape** (`EquityCurveChart.tsx:150-155`):
```typescript
function buildTerminatorData(ys: Float64Array, ruined: boolean): (number | null)[] | undefined {
  if (!ruined || ys.length === 0) return undefined
  const data: (number | null)[] = new Array(ys.length).fill(null)
  data[ys.length - 1] = ys[ys.length - 1] ?? null
  return data
}
```
For the ghost series, build a `(number | null)[]` of the same length, with `null` substituted at every bar where the computed naive value is `<= 0` (a different fill predicate: "everywhere except one index" becomes "everywhere the value is non-positive"). `uPlot.AlignedData` already tolerates `null` per-series (used at `EquityCurveChart.tsx:210`), so no new uPlot capability is needed.

**Series/data array wiring to extend** (`EquityCurveChart.tsx:213-214`):
```typescript
const series: uPlot.Series[] = terminatorData !== undefined ? [{}, equitySeries, ruinSeries] : [{}, equitySeries]
const data: uPlot.AlignedData = terminatorData !== undefined ? [xs, ys, terminatorData] : [xs, ys]
```
Add a fourth conditional/permanent ghost series here — permanent per D-07 (unlike the ruin terminator, the ghost series is unconditional, not `undefined`-able), styled `stroke: textMuted`, dashed (`[4,3]` dash array in uPlot's `series.dash` option), `width: 1.5`, positioned before `equitySeries` in the array so it draws behind it in z-order.

**Theme-repaint rule to inherit unchanged:** the existing `createEffect` (`EquityCurveChart.tsx`'s bottom section) already tracks `themeVersion()` and rebuilds on every theme change via `onThemeChange` — the ghost series needs no separate theme-handling code, it repaints for free inside the same rebuild.

---

### `src/app/components/ResultColumn/ValidationSection.tsx` (+ `FundSelector`, `TrackingErrorSummary`, `SubWindowTable`)

**Analog:** `src/app/components/ResultColumn/MetricsPanel.tsx` (fixed-row display of computed figures) for `TrackingErrorSummary`; `ResultSummaryHeader.tsx`'s all-facts-in-memory pattern for the section's "no independent network dependency" behavior described in UI-SPEC F6.

**Compute dependency:** call `computeTrackingError` from `src/validation/tracking-error.ts` directly (already free of test-context/kernel/data-layer imports per its own header) plus the extracted `synthetic-comparison.ts` helpers (F-01) to build the synthetic series before calling it — do not write a second tracking-error calculator.

---

### `src/app/components/MethodologyOverlay.tsx`

**Analog:** no direct overlay precedent exists in the codebase (UI-SPEC's "not applicable" registry note and RESEARCH.md's Pattern 2/3 confirm this); closest structural analog is `MetricsPanel.tsx`'s "render fixed sections from structured data" discipline, applied at a larger scale (four sections generated from `COST_PARAMETERS`, `TOLERANCE_MECHANISMS`, kernel day-count constants, and the manifest).

**URL-flag wiring — load-bearing, copy exactly** (RESEARCH.md Code Example 2, verified against `src/app/permalink.ts:236-239` and `src/app/state.ts:503`):
```typescript
function applyPermalinkFromLocation(): void {
  if (permalinkApplied) return
  permalinkApplied = true

  const rawParams = new URLSearchParams(window.location.search)
  const methodologyRequested = rawParams.get('methodology') !== null
  rawParams.delete('methodology') // stripped before decodeParams ever sees it

  const decoded = decodeParams(rawParams) // unchanged call, now never sees "methodology"
  // ... existing decode-result handling unchanged ...

  if (methodologyRequested) setMethodologyOverlayOpen(true)
}
```
**Why this is mandatory, not optional:** `decodeParams`'s allow-list sweep (`permalink.ts:236-239`, verbatim) rejects the *entire* permalink — including run parameters — if any key outside `PERMALINK_KEYS` is present:
```typescript
for (const key of presentKeys) {
  if (!isPermalinkKey(key)) {
    return decodeError(`permalink: unknown query parameter "${key}"`)
  }
}
```
Adding `methodology` to `PERMALINK_KEYS` is explicitly wrong too — the required-key sweep (`permalink.ts:274-279`) would then make it a required key on every existing permalink, breaking pre-Phase-5 links.

**Closing the overlay:** reuse the same `history.replaceState` discipline already used for run-parameter flushes (`state.ts:268`, `window.history.replaceState(null, '', newUrl)`), removing only `methodology` from the live URL — never a full navigation.

---

### `src/metrics/format.ts` (modified — signed formatter)

**Analog:** itself — extend in place per CONTEXT.md's explicit discretion note ("reusing `src/metrics/format.ts` rather than adding a second formatter").

**Existing formatter shape to match** (`format.ts:19-26`, the pattern every new formatter must follow — null-safe, `Number.isFinite` guarded, fixed decimal count, no `NaN`/`Infinity` ever reaching the returned string):
```typescript
export function formatPercent(fraction: number | null): string {
  if (fraction === null || !Number.isFinite(fraction)) return UNDEFINED_PLACEHOLDER
  const percent = fraction * 100
  if (!Number.isFinite(percent)) return UNDEFINED_PLACEHOLDER
  return `${percent.toFixed(2)}%`
}
```
New formatter(s) needed: a signed-currency variant (`+$1,234` / `-$1,234`) and a signed-percent-of-gap variant, following the same `UNDEFINED_PLACEHOLDER` ("n/a") null-handling contract as every existing formatter in this file.

---

### `src/validation/extended-tier-bias.generated.ts` + `scripts/measure-extended-tier-bias.ts` (D-21)

**Analog:** `tools/bundle-compiler/src/compile.ts`'s `writeGeneratedPointerModule` (lines 192-217) for the write-then-rename discipline, and `src/data-bundle.generated.ts` as the existing generated-module precedent the app already imports as a constant. `tools/bundle-compiler/src/cli.ts`'s `--experimental-strip-types` node-script convention (also used by `run-backtest.ts`/`fetch.ts`) is the template for the new standalone script.

**Verification pattern to pair with it:** `src/validation/cost-parameters.ts`'s own header describes the companion **pinning test** pattern (a test recomputes a value and asserts it matches a committed constant, never writing the constant itself) — mirror `tests/validation/cost-parameters.test.ts`'s pinning assertions for a new `tests/validation/extended-tier-bias.test.ts`, so CI catches the figure moving when the data does without the test suite performing file writes.

**`npm run` wiring:** add a new script entry alongside the existing `"compile-data": "node --experimental-strip-types tools/bundle-compiler/src/cli.ts"` pattern in `package.json`.

---

## Shared Patterns

### Numeric formatting
**Source:** `src/metrics/format.ts`
**Apply to:** `AttributionPanel`, `ProvenanceStrip`, `ExtendedTierWarning`, `ValidationSection`, `MethodologyOverlay` — every rendered number in this phase routes through this file (extended with a signed-value formatter), never an inline `toFixed`/`toLocaleString` call in a component.
```typescript
export function formatPercent(fraction: number | null): string {
  if (fraction === null || !Number.isFinite(fraction)) return UNDEFINED_PLACEHOLDER
  const percent = fraction * 100
  if (!Number.isFinite(percent)) return UNDEFINED_PLACEHOLDER
  return `${percent.toFixed(2)}%`
}
```

### Default-value citation / `<Show>` fallback
**Source:** `src/app/components/ParameterColumn/CostControls.tsx` + `SourceCitation.tsx`
**Apply to:** `TierControl`, `DefaultBadge`/`ResetButton`, and the modified `EntryDateControl` — every control gaining D-22's default label/reset treatment reuses this exact `isDefault()` signal + `<Show when fallback>` shape rather than inventing a second default-detection mechanism.

### Kernel counterfactual calls (no kernel change needed)
**Source:** `src/kernel/backtest.ts` (`runBacktest`), `src/kernel/backtest.types.ts` (`KernelParams`, `KernelSeries`, day-count constants)
**Apply to:** `computeAttribution`'s four compounding-on Shapley arms and `ValidationSection`'s synthetic run. Reuse `runBacktest` unmodified; vary only `KernelParams`/`KernelSeries` per arm (Code Example 1's zero-rate-array technique is the one non-obvious wrinkle).
```typescript
const financingCost = value * (leverage - 1) * (rate + financingSpread) * (calendarGap / FINANCING_DAY_COUNT_BASIS)
```

### uPlot null-gap series technique
**Source:** `src/app/components/ResultColumn/EquityCurveChart.tsx` (`buildTerminatorData`)
**Apply to:** the D-07 naive ghost series (different fill predicate, same `(number | null)[]` mechanism and the same `uPlot.AlignedData` tolerance for `null`).

### Permalink allow-list boundary
**Source:** `src/app/permalink.ts` (`PERMALINK_KEYS`, `decodeParams`), `src/app/state.ts` (`applyPermalinkFromLocation`)
**Apply to:** `MethodologyOverlay`'s `?methodology=1` flag — must be read/stripped from a `URLSearchParams` copy before `decodeParams` runs, never added to `PERMALINK_KEYS`.

### Manifest as the single source of provenance truth
**Source:** `tools/bundle-compiler/src/manifest.ts` (`ManifestSeries`, `SeamRecord`), `src/data/bundle-source.ts` (`LoadedBundle.manifest`)
**Apply to:** `ProvenanceStrip`, `MethodologyOverlay`'s "Data sources" section, `TierControl`'s extended-option disabled state. No second manifest read/decode path — always `loadedBundle().manifest`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/app/components/MethodologyOverlay.tsx` | component | request-response (full-screen overlay) | No overlay/modal precedent exists anywhere in the current component tree (confirmed: `Registry Safety` table in UI-SPEC states "not applicable... no component registry is in use" and no existing file renders full-screen chrome over the app). Build using RESEARCH.md's Code Example 2 for the URL-flag wiring and `MetricsPanel.tsx`'s structured-data-render discipline for content layout; there is no closer analog to defer to. |

## Metadata

**Analog search scope:** `src/app/`, `src/validation/`, `src/kernel/`, `src/metrics/`, `src/data/`, `tools/bundle-compiler/src/`, `tests/validation/`
**Files scanned:** ~35 (full `src/` TS/TSX tree plus targeted test/tooling files)
**Pattern extraction date:** 2026-08-20
