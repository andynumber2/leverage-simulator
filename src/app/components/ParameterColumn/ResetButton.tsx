/**
 * src/app/components/ParameterColumn/ResetButton.tsx
 *
 * CRED-05/D-22/T-05-22: the "Reset" affordance every defaulted parameter control renders beside
 * its citation whenever it is NOT currently at its shipped default (Copywriting Contract's
 * "Secondary action -- reset a parameter to default" row). Invokes
 * `PARAMETER_DEFAULTS[parameterId].reset()` on click -- the registry's own validated write, never
 * a raw store write of its own, so clicking Reset can never itself produce an invalid value
 * (T-05-22). A 44x44px minimum hit area, per D-18's touch-target floor, at the same recessive
 * (`--color-text-muted`) weight as `.source-citation`.
 */

import { PARAMETER_DEFAULTS, type ParameterId } from '../../parameter-defaults.ts'

export interface ResetButtonProps {
  parameterId: ParameterId
  disabled: boolean
}

export function ResetButton(props: ResetButtonProps) {
  return (
    <button
      type="button"
      class="reset-button"
      data-testid={`reset-button-${props.parameterId}`}
      disabled={props.disabled}
      onClick={() => PARAMETER_DEFAULTS[props.parameterId].reset()}
    >
      Reset
    </button>
  )
}
