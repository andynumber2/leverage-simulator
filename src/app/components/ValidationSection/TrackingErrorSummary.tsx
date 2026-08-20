/**
 * src/app/components/ValidationSection/TrackingErrorSummary.tsx
 *
 * D-11's two headline figures for the currently selected fund, plus D-10's live cost-parameter
 * note. Both figures route through `src/metrics/format.ts` -- no inline numeric-string conversion
 * exists in this file, matching `MetricsPanel.tsx`'s discipline. Tracking error is always
 * non-negative (a standard deviation, `computeTrackingError`'s own contract), rendered unsigned;
 * return drift is bidirectional, rendered signed (D-04's convention for a figure that can read as
 * either a cost or a gain).
 */

import { formatPercent, formatSignedPercent } from '../../../metrics/format.ts'
import type { TrackingErrorResult } from '../../../validation/tracking-error.ts'

export interface TrackingErrorSummaryProps {
  headline: TrackingErrorResult
}

/** UI-SPEC Copywriting Contract's cost-parameter note, with a plain hyphen substituted for the
 * literal text's em dash -- this project's CLAUDE.md prohibits the em dash character in any
 * output, the same substitution 05-01-PLAN.md's D-04 gain-suffix copy already made. */
const COST_PARAMETER_NOTE =
  'Expense ratio and financing spread above use your current values from the parameter column - ' +
  'edit them there to see the effect on tracking error.'

export function TrackingErrorSummary(props: TrackingErrorSummaryProps) {
  return (
    <div class="tracking-error-summary" data-testid="tracking-error-summary">
      <div class="tracking-error-summary__row" data-testid="tracking-error-figure">
        <span class="metric-label">Tracking error</span>
        <span class="metric-value metric-value--secondary">
          {formatPercent(props.headline.annualizedTrackingError)}
        </span>
      </div>
      <div class="tracking-error-summary__row" data-testid="return-drift-figure">
        <span class="metric-label">Return drift</span>
        <span class="metric-value metric-value--secondary">
          {formatSignedPercent(props.headline.annualizedReturnDrift)}
        </span>
      </div>
      <p class="validation-cost-note" data-testid="validation-cost-note">
        {COST_PARAMETER_NOTE}
      </p>
    </div>
  )
}
