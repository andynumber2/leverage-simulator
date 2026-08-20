/**
 * src/app/components/ResultColumn/ResultSummaryHeader.tsx
 *
 * D-20: the three facts (beyond the chart and metrics) that keep the D-20 screenshot region
 * self-contained -- the symbol, the effective date range and the bundle version. "Effective"
 * matters: `props.inputs.window.firstDate`/`lastDate` are the run's ACTUAL computed window, read
 * from `KernelInputs`, not the raw `entryDate`/`holdingPeriodBars` request -- a run D-10 caveated
 * to a truncated window (a fixed holding period that ran past the last supported bar) still shows
 * the window it actually computed over, not the one originally asked for.
 */

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
