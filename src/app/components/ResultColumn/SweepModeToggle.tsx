/**
 * src/app/components/ResultColumn/SweepModeToggle.tsx
 *
 * 07-06-PLAN.md Task 2 (D-15): the result column's two-segment mount switch -- D-15's mode switch
 * is what fills the single result slot `App.tsx`'s `data-testid="result-slot"` (D-21) reserved.
 * Mirrors `HoldingModeControl.tsx`'s radiogroup markup and store-wiring shape exactly: a
 * `role="radiogroup"` with an `aria-label`, one labelled radio input per segment, a `data-testid`,
 * and the shared `PARAMETER_DEFAULTS` default-badge/reset affordance every parameter control in
 * this app carries (CRED-05). `setResultMode` is the ONE validated setter this control ever calls
 * -- never a raw signal write.
 *
 * D-17 is binding: this control only ever writes `resultMode`. It never touches `entryDate`,
 * `leverage`, or any other `BacktestRequest` field, so switching modes back and forth is a pure
 * display-mount change and the parameter column beside it keeps driving the exact same position in
 * both modes.
 *
 * The active segment is accent-colored -- one of this phase's three new accent uses
 * (07-UI-SPEC.md Color table), following `LogScaleToggle.tsx`'s own active-class-swap convention
 * rather than inventing a second one.
 */

import { Show } from 'solid-js'

import { PARAMETER_DEFAULTS } from '../../parameter-defaults.ts'
import { resultMode, setResultMode } from '../../state.ts'
import { DefaultBadge } from '../ParameterColumn/DefaultBadge.tsx'
import { ResetButton } from '../ParameterColumn/ResetButton.tsx'

export interface SweepModeToggleProps {
  disabled: boolean
}

export function SweepModeToggle(props: SweepModeToggleProps) {
  const isSweep = () => resultMode() === 'sweep'

  return (
    <div class="parameter-group sweep-mode-toggle" data-testid="sweep-mode-toggle">
      <div class="sweep-mode-choice" role="radiogroup" aria-label="Result mode">
        <label class="sweep-mode-option" classList={{ 'sweep-mode-option--active': !isSweep() }}>
          <input
            type="radio"
            name="sweep-mode"
            data-testid="sweep-mode-single"
            disabled={props.disabled}
            checked={!isSweep()}
            onChange={() => setResultMode('single')}
          />
          Single run
        </label>
        <label class="sweep-mode-option" classList={{ 'sweep-mode-option--active': isSweep() }}>
          <input
            type="radio"
            name="sweep-mode"
            data-testid="sweep-mode-sweep"
            disabled={props.disabled}
            checked={isSweep()}
            onChange={() => setResultMode('sweep')}
          />
          Sweep
        </label>
      </div>
      <Show
        when={PARAMETER_DEFAULTS.resultMode.isDefault()}
        fallback={<ResetButton parameterId="resultMode" disabled={props.disabled} />}
      >
        <DefaultBadge parameterId="resultMode" disabled={props.disabled} />
      </Show>
    </div>
  )
}
