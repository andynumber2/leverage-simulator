/**
 * src/app/components/ParameterColumn/InitialInvestmentControl.tsx
 *
 * CRED-05/D-22: the initial-investment control -- previously reachable only through a pasted
 * permalink (`initialInvestment` already round-trips through `src/app/permalink.ts` and is already
 * validated by `buildKernelInputs`'s finite-number assertion, T-05-21's backstop); this task gives
 * it a control in the parameter column. Modelled directly on `ContributionControl`'s amount input:
 * a labelled numeric input writing through `updateBacktestRequest`, rejecting a negative or
 * non-finite value at the control with the bound named inline in `--color-destructive`
 * (`.initial-investment-error`), and leaving the request untouched while the input is unparseable
 * (empty, a lone `-`/`.`, or any other value `Number()` cannot resolve) so recompute is never
 * driven by a half-typed value. Carries the shared default badge/reset affordance
 * (`PARAMETER_DEFAULTS.initialInvestment`).
 *
 * T-05-22: `ResetButton` writes `amount()` directly through the registry, bypassing this
 * control's own `handleInput`. The `createEffect` below is what actually satisfies the must-have
 * that Reset "clears" an invalid state (UI-SPEC F8 error row): it watches `amount()` and clears
 * `error` whenever it changes for any reason, this control's own writes included.
 */

import { createEffect, createSignal, on, Show } from 'solid-js'

import { PARAMETER_DEFAULTS } from '../../parameter-defaults.ts'
import { backtestRequest, updateBacktestRequest } from '../../state.ts'
import { DefaultBadge } from './DefaultBadge.tsx'
import { ResetButton } from './ResetButton.tsx'

export interface InitialInvestmentControlProps {
  disabled: boolean
}

export function InitialInvestmentControl(props: InitialInvestmentControlProps) {
  const [error, setError] = createSignal<string | null>(null)

  const amount = () => backtestRequest().initialInvestment

  // T-05-22: `defer: true` skips the initial mount run, so this only fires on an actual change,
  // including one written externally by Reset.
  createEffect(on(amount, () => setError(null), { defer: true }))

  function handleInput(text: string): void {
    // An unparseable draft (including the empty string left mid-edit) is never committed -- the
    // store, and therefore this control's own default badge/reset, stays exactly where it was.
    if (text === '') {
      setError(null)
      return
    }
    const value = Number(text)
    if (!Number.isFinite(value) || value < 0) {
      setError('initial investment must be zero or greater')
      return
    }
    setError(null)
    updateBacktestRequest({ initialInvestment: value })
  }

  return (
    <div class="parameter-group initial-investment-control" data-testid="initial-investment-control">
      <label class="control-label" for="initial-investment-input">
        Initial investment
      </label>
      <input
        id="initial-investment-input"
        data-testid="initial-investment-input"
        type="text"
        inputmode="decimal"
        class="initial-investment-input"
        disabled={props.disabled}
        value={String(amount())}
        onInput={(e) => handleInput(e.currentTarget.value)}
      />
      <Show
        when={PARAMETER_DEFAULTS.initialInvestment.isDefault()}
        fallback={<ResetButton parameterId="initialInvestment" disabled={props.disabled} />}
      >
        <DefaultBadge parameterId="initialInvestment" disabled={props.disabled} />
      </Show>
      <Show when={error() !== null}>
        <span class="initial-investment-error" data-testid="initial-investment-error">
          {error()}
        </span>
      </Show>
    </div>
  )
}
