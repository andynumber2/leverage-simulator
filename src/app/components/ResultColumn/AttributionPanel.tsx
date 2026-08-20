/**
 * src/app/components/ResultColumn/AttributionPanel.tsx
 *
 * D-08: "Where the money went" -- the attribution panel, directly under `MetricsPanel`, mounted
 * under the same `currentDerivedMetrics() !== null` guard so it inherits the metrics panel's
 * render/clear rules and has no independent empty or loading state (UI-SPEC F1).
 *
 * This task (05-01 Task 1) renders the fixed two-row naive/actual pair only, with the exact
 * Copywriting Contract labels. Task 3 extends this to the full five-row layout (three signed
 * components plus the reconciliation row).
 *
 * Every number routed through `src/metrics/format.ts` -- no inline numeric-string conversion
 * call exists in this file.
 */

import type { AttributionResult } from '../../../validation/attribution.ts'
import { formatCurrency } from '../../../metrics/format.ts'

export interface AttributionPanelProps {
  attribution: AttributionResult
}

export function AttributionPanel(props: AttributionPanelProps) {
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
    </div>
  )
}
