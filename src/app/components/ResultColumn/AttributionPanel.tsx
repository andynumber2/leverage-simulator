/**
 * src/app/components/ResultColumn/AttributionPanel.tsx
 *
 * D-08: "Where the money went" -- the attribution panel, directly under `MetricsPanel`, mounted
 * under the same `currentDerivedMetrics() !== null` guard so it inherits the metrics panel's
 * render/clear rules and has no independent empty or loading state (UI-SPEC F1).
 *
 * The full D-08 fixed five-row layout: naive, actual, three signed cost components (volatility
 * drag, financing cost, expense ratio) and a reconciliation row. The three component rows are
 * rendered from one array-driven loop (`componentRows` below) so no row is special-cased by name
 * -- identical markup, identical formatting call, identical D-04 gain-suffix rule for all three.
 *
 * F1's error rule: when any of the six component/share values is non-finite, the reconciliation
 * row is suppressed for that run rather than shown falsely balancing (the affected component row
 * itself still renders -- `formatSignedCurrency`/`formatSignedPercent` already print the
 * `format.ts` undefined placeholder for a non-finite input).
 *
 * Every number routed through `src/metrics/format.ts` -- no inline numeric-string conversion
 * call exists in this file.
 */

import { Show } from 'solid-js'

import type { AttributionResult } from '../../../validation/attribution.ts'
import { formatCurrency, formatPercent, formatSignedCurrency, formatSignedPercent } from '../../../metrics/format.ts'

export interface AttributionPanelProps {
  attribution: AttributionResult
}

/** D-04: the literal Copywriting Contract gain-case suffix, reused identically across all three
 * component rows whenever a row's sign represents a gain (D-04: same rule, same wording -- no row
 * gets a differently-named suffix). Rendered with a plain hyphen rather than an em dash, per this
 * project's style rule against the em-dash character in any rendered output. */
const GAIN_SUFFIX = ' - compounding helped'

interface ComponentRowDef {
  testId: string
  label: string
  value: number
  share: number
}

/** D-06/F1: the reconciliation row is suppressed for the run when any of the three components or
 * their shares is non-finite, rather than rendered falsely balancing. */
function reconciliationIsWellDefined(attribution: AttributionResult): boolean {
  return (
    Number.isFinite(attribution.volatilityDrag) &&
    Number.isFinite(attribution.financingCost) &&
    Number.isFinite(attribution.expenseRatio) &&
    Number.isFinite(attribution.volatilityDragShare) &&
    Number.isFinite(attribution.financingCostShare) &&
    Number.isFinite(attribution.expenseRatioShare)
  )
}

export function AttributionPanel(props: AttributionPanelProps) {
  const componentRows: ComponentRowDef[] = [
    {
      testId: 'attribution-volatility-drag',
      label: 'Volatility drag',
      value: props.attribution.volatilityDrag,
      share: props.attribution.volatilityDragShare,
    },
    {
      testId: 'attribution-financing-cost',
      label: 'Financing cost',
      value: props.attribution.financingCost,
      share: props.attribution.financingCostShare,
    },
    {
      testId: 'attribution-expense-ratio',
      label: 'Expense ratio',
      value: props.attribution.expenseRatio,
      share: props.attribution.expenseRatioShare,
    },
  ]

  // D-06: the shares already sum to 100% by construction (the Shapley efficiency property) --
  // this is a plain sum, never a residual-absorbing adjustment.
  const reconciliationTotal =
    props.attribution.volatilityDragShare + props.attribution.financingCostShare + props.attribution.expenseRatioShare

  return (
    <div class="attribution-panel" data-testid="attribution-panel">
      <div class="attribution-heading" data-testid="attribution-heading">
        Where the money went
      </div>

      <div class="attribution-row" data-testid="attribution-naive">
        <span class="attribution-label">Naive result (leverage x return, no costs)</span>
        <span class="attribution-value">{formatCurrency(props.attribution.naiveFinalValue)}</span>
      </div>

      <div class="attribution-row" data-testid="attribution-actual">
        <span class="attribution-label">Actual result</span>
        <span class="attribution-value">{formatCurrency(props.attribution.actualFinalValue)}</span>
      </div>

      {componentRows.map((row) => (
        <div class="attribution-row" data-testid={row.testId}>
          <span class="attribution-label">{row.label}:</span>
          <span class="attribution-value">
            {formatSignedCurrency(row.value)} ({formatSignedPercent(row.share)} of gap)
            {row.value < 0 ? GAIN_SUFFIX : ''}
          </span>
        </div>
      ))}

      <Show when={reconciliationIsWellDefined(props.attribution)}>
        <div class="attribution-row" data-testid="attribution-reconciliation">
          <span class="attribution-label">Total:</span>
          <span class="attribution-value">{formatPercent(reconciliationTotal)}</span>
        </div>
      </Show>
    </div>
  )
}
