/**
 * src/app/components/ResultColumn/MetricToggle.tsx
 *
 * 07-06-PLAN.md Task 3 (D-23/D-24): a three-segment radiogroup mirroring
 * `SweepModeToggle.tsx`'s shape. Segment labels are exactly `Multiple of contributed` (the
 * default), `Max drawdown`, and a third segment whose label is `IRR` when
 * `backtestRequest().contributionAmount` is non-zero and `CAGR` when it is zero -- mirroring
 * `HoldingModeControl.tsx`'s pattern of one control whose own label text states which mode is
 * active, and D-24's rule exactly: the sweep's annualized metric is IRR with contributions and
 * CAGR without, never both unqualified at once.
 *
 * The segment COUNT is invariant at three (07-UI-SPEC.md E2 zero-one-many): the third segment's
 * label changes, a segment is never added or removed, so there is no zero/one/many variance and
 * no empty variant. The segments come from a static definition, never from swept data.
 *
 * Selecting a segment writes `setDisplayedMetric` and NOTHING else -- it never calls
 * `scheduleSweep`, never touches `sweepGeneration`, and never invalidates the cached grid:
 * METR-06 computes every display metric per cell in one pass precisely so this is a re-color, not
 * a re-sweep. The toggle stays fully interactive mid-sweep, because a metric can never be
 * partially available.
 *
 * The active segment is accent-colored -- the second of this phase's three new accent uses.
 * Unlike `SweepModeToggle`, this control carries no `PARAMETER_DEFAULTS` default-badge/reset
 * affordance -- 07-06-PLAN.md Task 3's own read_first/acceptance_criteria list neither, unlike
 * Task 2's explicit requirement for `SweepModeToggle`.
 */

import { backtestRequest, displayedMetric, setDisplayedMetric } from '../../state.ts'

export interface MetricToggleProps {
  disabled: boolean
}

/** D-24: the third segment's label alternates -- never both, never neither. */
function annualizedLabel(): 'IRR' | 'CAGR' {
  return backtestRequest().contributionAmount !== 0 ? 'IRR' : 'CAGR'
}

export function MetricToggle(props: MetricToggleProps) {
  const isActive = (metric: ReturnType<typeof displayedMetric>) => displayedMetric() === metric

  return (
    <div class="parameter-group metric-toggle" data-testid="metric-toggle">
      <div class="metric-toggle-choice" role="radiogroup" aria-label="Displayed metric">
        <label class="metric-toggle-option" classList={{ 'metric-toggle-option--active': isActive('multiple') }}>
          <input
            type="radio"
            name="metric-toggle"
            data-testid="metric-toggle-multiple"
            disabled={props.disabled}
            checked={isActive('multiple')}
            onChange={() => setDisplayedMetric('multiple')}
          />
          Multiple of contributed
        </label>
        <label class="metric-toggle-option" classList={{ 'metric-toggle-option--active': isActive('drawdown') }}>
          <input
            type="radio"
            name="metric-toggle"
            data-testid="metric-toggle-drawdown"
            disabled={props.disabled}
            checked={isActive('drawdown')}
            onChange={() => setDisplayedMetric('drawdown')}
          />
          Max drawdown
        </label>
        <label class="metric-toggle-option" classList={{ 'metric-toggle-option--active': isActive('annualized') }}>
          <input
            type="radio"
            name="metric-toggle"
            data-testid="metric-toggle-annualized"
            disabled={props.disabled}
            checked={isActive('annualized')}
            onChange={() => setDisplayedMetric('annualized')}
          />
          {annualizedLabel()}
        </label>
      </div>
    </div>
  )
}
