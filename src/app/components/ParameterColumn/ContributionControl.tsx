/**
 * src/app/components/ParameterColumn/ContributionControl.tsx
 *
 * D-25 through D-28: an amount plus a frequency, wired through `updateBacktestRequest` like every
 * other control. `ContributionFrequency` is imported from `src/data/kernel-inputs.ts` (re-exported
 * from `src/data/contribution-schedule.ts`) and the option set is typed as
 * `Record<ContributionFrequency, string>` rather than a hand-written string array, so TypeScript
 * itself rejects a missing or extra member if the union ever changes -- the same exhaustiveness
 * discipline `src/validation/cost-parameters.ts` already uses for `COST_PARAMETERS`.
 *
 * An empty (zero) amount is a meaningful value, not a missing one (UI-SPEC E4 empty): it is the
 * Default Landing Run. While the amount is zero the frequency select is disabled and reads `none`.
 * The moment a non-zero amount is entered with no frequency already chosen, frequency defaults to
 * `monthly` -- an amount with no frequency selected is unreachable, not an error state (UI-SPEC E4
 * partial). A negative amount is rejected at the control with the bound named inline, in
 * `--color-destructive` via `.contribution-error`.
 *
 * CRED-05/D-22: frequency's badge/reset (`PARAMETER_DEFAULTS.contributionFrequency`) replaces the
 * plan-04-05 local signal that used to label the monthly auto-selection -- one registry
 * definition of "at default" now drives every control, this one included (05-08-PLAN.md Task 2).
 * The auto-selected `monthly` frequency simply reads off-default like any other edited value,
 * with Reset available to return it to `none` alongside the amount. The amount field carries its
 * own badge/reset too (`PARAMETER_DEFAULTS.contributionAmount`, Task 3): resetting the amount
 * writes both `contributionAmount` and `contributionFrequency` back to their shipped defaults
 * together, the same pair this control's own empty-input path already writes.
 *
 * T-05-22: both `ResetButton`s write their committed values directly through the registry,
 * bypassing this file's own `handleAmountInput`/`handleFrequencyChange`. The `createEffect` below
 * is what actually satisfies the must-have that Reset "clears" an invalid state (UI-SPEC F8 error
 * row): it watches `amount()` and clears `amountError` whenever it changes for any reason, this
 * control's own writes included.
 */

import { createEffect, createSignal, For, on, Show } from 'solid-js'

import type { ContributionFrequency } from '../../../data/kernel-inputs.ts'
import { PARAMETER_DEFAULTS } from '../../parameter-defaults.ts'
import { backtestRequest, updateBacktestRequest } from '../../state.ts'
import { DefaultBadge } from './DefaultBadge.tsx'
import { ResetButton } from './ResetButton.tsx'

export interface ContributionControlProps {
  disabled: boolean
}

/** `Record<ContributionFrequency, string>` rather than a literal array: TypeScript rejects a
 * missing or extra key at compile time if `ContributionFrequency`'s membership ever changes, so
 * this list cannot silently drift from the resolver it renders options for. */
const FREQUENCY_LABELS: Record<ContributionFrequency, string> = {
  none: 'None',
  daily: 'Daily',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
}

const FREQUENCY_OPTIONS = Object.keys(FREQUENCY_LABELS) as ContributionFrequency[]

export function ContributionControl(props: ContributionControlProps) {
  const [amountError, setAmountError] = createSignal<string | null>(null)

  const amount = () => backtestRequest().contributionAmount
  const frequency = () => backtestRequest().contributionFrequency
  const frequencyDisabled = () => props.disabled || amount() === 0

  // T-05-22: `defer: true` skips the initial mount run, so this only fires on an actual change,
  // including one written externally by Reset.
  createEffect(on(amount, () => setAmountError(null), { defer: true }))

  function handleAmountInput(text: string): void {
    // UI-SPEC E4 empty: an empty amount means zero, the Default Landing Run's own value -- not a
    // partial or missing state.
    if (text === '') {
      setAmountError(null)
      updateBacktestRequest({ contributionAmount: 0, contributionFrequency: 'none' })
      return
    }
    const value = Number(text)
    if (!Number.isFinite(value) || value < 0) {
      setAmountError('contribution amount must be zero or greater')
      return
    }
    setAmountError(null)
    if (value === 0) {
      updateBacktestRequest({ contributionAmount: 0, contributionFrequency: 'none' })
      return
    }
    if (frequency() === 'none') {
      // UI-SPEC E4 partial: the moment a non-zero amount lands with no frequency chosen yet,
      // frequency defaults to monthly -- an amount with no frequency is unreachable.
      updateBacktestRequest({ contributionAmount: value, contributionFrequency: 'monthly' })
      return
    }
    updateBacktestRequest({ contributionAmount: value })
  }

  function handleFrequencyChange(value: string): void {
    updateBacktestRequest({ contributionFrequency: value as ContributionFrequency })
  }

  return (
    <div class="parameter-group contribution-control" data-testid="contribution-control">
      <label class="control-label" for="contribution-amount-input">
        Recurring contribution
      </label>
      <input
        id="contribution-amount-input"
        data-testid="contribution-amount-input"
        type="text"
        inputmode="decimal"
        class="contribution-amount-input"
        disabled={props.disabled}
        value={amount() === 0 ? '' : String(amount())}
        onInput={(e) => handleAmountInput(e.currentTarget.value)}
      />
      <Show
        when={PARAMETER_DEFAULTS.contributionAmount.isDefault()}
        fallback={<ResetButton parameterId="contributionAmount" disabled={props.disabled} />}
      >
        <DefaultBadge parameterId="contributionAmount" disabled={props.disabled} />
      </Show>
      <select
        id="contribution-frequency-select"
        data-testid="contribution-frequency-select"
        disabled={frequencyDisabled()}
        value={frequency()}
        onChange={(e) => handleFrequencyChange(e.currentTarget.value)}
      >
        <For each={FREQUENCY_OPTIONS}>{(freq) => <option value={freq}>{FREQUENCY_LABELS[freq]}</option>}</For>
      </select>
      <Show
        when={PARAMETER_DEFAULTS.contributionFrequency.isDefault()}
        fallback={<ResetButton parameterId="contributionFrequency" disabled={frequencyDisabled()} />}
      >
        <DefaultBadge parameterId="contributionFrequency" disabled={frequencyDisabled()} />
      </Show>
      <Show when={amountError() !== null}>
        <span class="contribution-error" data-testid="contribution-amount-error">
          {amountError()}
        </span>
      </Show>
    </div>
  )
}
