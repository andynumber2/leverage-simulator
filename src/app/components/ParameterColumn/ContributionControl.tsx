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
 * `monthly` and that default is labelled through `SourceCitation` -- an amount with no frequency
 * selected is unreachable, not an error state (UI-SPEC E4 partial). A negative amount is rejected
 * at the control with the bound named inline, in `--color-destructive` via `.contribution-error`.
 */

import { createSignal, For, Show } from 'solid-js'

import type { ContributionFrequency } from '../../../data/kernel-inputs.ts'
import { backtestRequest, updateBacktestRequest } from '../../state.ts'
import { SourceCitation } from './SourceCitation.tsx'

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
  const [frequencyIsDefault, setFrequencyIsDefault] = createSignal(false)

  const amount = () => backtestRequest().contributionAmount
  const frequency = () => backtestRequest().contributionFrequency
  const frequencyDisabled = () => props.disabled || amount() === 0

  function handleAmountInput(text: string): void {
    // UI-SPEC E4 empty: an empty amount means zero, the Default Landing Run's own value -- not a
    // partial or missing state.
    if (text === '') {
      setAmountError(null)
      setFrequencyIsDefault(false)
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
      setFrequencyIsDefault(false)
      updateBacktestRequest({ contributionAmount: 0, contributionFrequency: 'none' })
      return
    }
    if (frequency() === 'none') {
      // UI-SPEC E4 partial: the moment a non-zero amount lands with no frequency chosen yet,
      // frequency defaults to monthly -- an amount with no frequency is unreachable.
      setFrequencyIsDefault(true)
      updateBacktestRequest({ contributionAmount: value, contributionFrequency: 'monthly' })
      return
    }
    updateBacktestRequest({ contributionAmount: value })
  }

  function handleFrequencyChange(value: string): void {
    setFrequencyIsDefault(false)
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
      <select
        id="contribution-frequency-select"
        data-testid="contribution-frequency-select"
        disabled={frequencyDisabled()}
        value={frequency()}
        onChange={(e) => handleFrequencyChange(e.currentTarget.value)}
      >
        <For each={FREQUENCY_OPTIONS}>{(freq) => <option value={freq}>{FREQUENCY_LABELS[freq]}</option>}</For>
      </select>
      <Show when={frequencyIsDefault()}>
        <SourceCitation text="monthly - default frequency, applied because a contribution amount was entered with none selected" />
      </Show>
      <Show when={amountError() !== null}>
        <span class="contribution-error" data-testid="contribution-amount-error">
          {amountError()}
        </span>
      </Show>
    </div>
  )
}
