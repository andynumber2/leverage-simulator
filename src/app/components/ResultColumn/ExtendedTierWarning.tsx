/**
 * src/app/components/ResultColumn/ExtendedTierWarning.tsx
 *
 * CRED-02/CRED-03/D-20: the standing, unconditional disclosure on every extended-tier result --
 * the interpolated monthly rate/dividend data understates volatility drag, and by how much.
 * Structured like `RuinBanner.tsx`: a single element with `role="status"`, one CSS class, no
 * per-instance colour logic (colour lives in `--color-warning`, `styles.css`).
 *
 * Per D-20 there is no gate on the extended tier -- every extended result carries this banner
 * instead of a one-time confirm-and-hide step. It imports the D-21 generated magnitude directly
 * and takes no magnitude prop, so the sentence cannot render without the figure: there is no code
 * path that mounts this component without also carrying the measured number. It offers no way to
 * turn the banner off or collapse it, and holds no memory of having been seen before -- `App.tsx`
 * mounts it unconditionally whenever `activeTier() === 'extended'` and a result exists, on every
 * such result, every time.
 */

import { EXTENDED_TIER_BIAS_ANNUALIZED_FRACTION } from '../../../validation/extended-tier-bias.generated.ts'
import { formatPercent } from '../../../metrics/format.ts'

/** Hand-authored inline SVG warning triangle, matching the theme/log-linear toggles' existing
 * `stroke="currentColor"` inline-SVG style (04-UI-SPEC.md Icon library) -- no icon package. */
function WarningTriangleIcon() {
  return (
    <svg
      class="extended-tier-warning-icon"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.3"
      aria-hidden="true"
    >
      <path d="M8 1.5 L15 14.5 L1 14.5 Z" stroke-linejoin="round" />
      <line x1="8" y1="6" x2="8" y2="10" stroke-linecap="round" />
      <circle cx="8" cy="12.25" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function ExtendedTierWarning() {
  return (
    <div class="extended-tier-warning" data-testid="extended-tier-warning" role="status">
      <WarningTriangleIcon />
      <div class="extended-tier-warning-text">
        <p class="extended-tier-warning-heading">Extended tier understates volatility drag</p>
        <p class="extended-tier-warning-body">
          Interpolating monthly data to daily smooths out day-to-day volatility, so leverage looks
          better in this era than it actually was. Measured effect:{' '}
          {formatPercent(EXTENDED_TIER_BIAS_ANNUALIZED_FRACTION)}/yr of understated drag, from
          downsampling a known-good daily era to monthly and re-measuring the gap.
        </p>
      </div>
    </div>
  )
}
