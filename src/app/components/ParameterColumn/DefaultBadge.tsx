/**
 * src/app/components/ParameterColumn/DefaultBadge.tsx
 *
 * CRED-05/D-22: the "default" badge every defaulted parameter control renders inline after its
 * value or citation whenever `PARAMETER_DEFAULTS[parameterId].isDefault()` reports true
 * (Copywriting Contract's "Default-value badge" row) -- the same fixed short string for all ten
 * parameters, per D-22's "a screenshot of any parameter column reads consistently." The control
 * itself decides whether to render this or `ResetButton` (the `<Show when fallback>` swap
 * `CostControls` already used, generalized in 05-08-PLAN.md Task 2); this component never makes
 * that decision on its own.
 */

import type { ParameterId } from '../../parameter-defaults.ts'

export interface DefaultBadgeProps {
  parameterId: ParameterId
  disabled: boolean
}

export function DefaultBadge(props: DefaultBadgeProps) {
  return (
    <span class="default-badge" data-testid={`default-badge-${props.parameterId}`} aria-disabled={props.disabled}>
      default
    </span>
  )
}
