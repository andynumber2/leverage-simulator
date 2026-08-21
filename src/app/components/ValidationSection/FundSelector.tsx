/**
 * src/app/components/ValidationSection/FundSelector.tsx
 *
 * F6/UI-SPEC Copywriting Contract: the fixed two-option fund choice (D-09's pinned canonical
 * config selects which real fund the synthetic 3x construction is compared against). Both option
 * labels are fixed strings authored in the Copywriting Contract, never data-derived, matching
 * the radio-group pattern `HoldingModeControl.tsx` already established.
 */

import { For } from 'solid-js'

export type Fund = 'UPRO' | 'TQQQ'

export interface FundSelectorProps {
  fund: Fund
  onChange: (fund: Fund) => void
}

const FUND_OPTIONS: ReadonlyArray<{ value: Fund; label: string; testId: string }> = [
  { value: 'UPRO', label: 'UPRO (3x S&P 500)', testId: 'fund-selector-upro' },
  { value: 'TQQQ', label: 'TQQQ (3x Nasdaq-100)', testId: 'fund-selector-tqqq' },
]

export function FundSelector(props: FundSelectorProps) {
  return (
    <div class="fund-selector" data-testid="fund-selector">
      <label class="control-label">Compare against</label>
      <div class="fund-selector__choice" role="radiogroup" aria-label="Compare against">
        <For each={FUND_OPTIONS}>
          {(option) => (
            <label class="fund-selector__option">
              <input
                type="radio"
                name="validation-fund"
                data-testid={option.testId}
                checked={props.fund === option.value}
                onChange={() => props.onChange(option.value)}
              />
              {option.label}
            </label>
          )}
        </For>
      </div>
    </div>
  )
}
