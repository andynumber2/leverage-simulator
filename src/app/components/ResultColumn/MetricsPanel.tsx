/**
 * src/app/components/ResultColumn/MetricsPanel.tsx
 *
 * The five fixed metric rows (D-05, D-06, METR-01 through METR-04). Row identity and order never
 * vary with the result: IRR headline, CAGR secondary, maximum drawdown, final value as a multiple
 * of total contributed, and the dropped-contributions line (rendered only when non-zero). Every
 * value is routed through `src/metrics/format.ts` -- no inline numeric-string conversion exists
 * in this file.
 */

import { Show } from 'solid-js'

import type { KernelResult } from '../../../kernel/backtest.types.ts'
import { formatCurrency, formatMultiple, formatPercent } from '../../../metrics/format.ts'
import type { DerivedMetrics } from '../../state.ts'

export interface MetricsPanelProps {
  result: KernelResult
  metrics: DerivedMetrics
  /** D-05/METR-02: zero triggers the "IRR equals CAGR" headline note; non-zero triggers the
   * CAGR qualifier and makes the dropped-contributions row eligible. */
  contributionAmount: number
}

/** D-08: the exact undefined-IRR copy, printed in the headline slot in place of a number. Never
 * `NaN`, `Infinity`, or a bare dash reaches the screen. */
const IRR_UNDEFINED_COPY = 'IRR undefined for this cash-flow pattern'

export function MetricsPanel(props: MetricsPanelProps) {
  return (
    <div class="metrics-panel" data-testid="metrics-panel">
      <div class="metric-row metric-row--headline" data-testid="metric-headline">
        <span class="metric-label" data-testid="metric-headline-label">
          Annualized return (IRR)
        </span>
        <span class="metric-value metric-value--headline" data-testid="metric-headline-value">
          {props.metrics.irr === null ? IRR_UNDEFINED_COPY : formatPercent(props.metrics.irr)}
        </span>
        <Show when={props.contributionAmount === 0}>
          <span class="metric-note" data-testid="irr-equals-cagr-note">
            IRR equals CAGR for a single cash flow
          </span>
        </Show>
      </div>

      <div class="metric-row metric-row--secondary" data-testid="metric-cagr">
        <span class="metric-label">CAGR</span>
        <span class="metric-value metric-value--secondary" data-testid="metric-cagr-value">
          {formatPercent(props.metrics.cagr)}
        </span>
        <Show when={props.contributionAmount !== 0}>
          <span class="metric-note" data-testid="cagr-qualifier">
            CAGR is misleading with contributions - see IRR above
          </span>
        </Show>
      </div>

      <div class="metric-row" data-testid="metric-max-drawdown">
        <span class="metric-label">Maximum drawdown</span>
        <span class="metric-value">{formatPercent(props.result.maxDrawdown)}</span>
      </div>

      <div class="metric-row" data-testid="metric-final-multiple">
        <span class="metric-label">Final value (multiple of contributed)</span>
        <span class="metric-value">{formatMultiple(props.metrics.finalValueMultiple)}</span>
      </div>

      <Show when={props.result.droppedContributionsTotal !== 0}>
        <div class="metric-row" data-testid="metric-dropped-contributions">
          <span class="metric-label">Dropped contributions</span>
          <span class="metric-value">
            {formatCurrency(props.result.droppedContributionsTotal)} dropped after ruin on {props.metrics.ruinDate}
          </span>
        </div>
      </Show>
    </div>
  )
}
