/**
 * src/app/components/ParameterColumn/HoldingModeControl.tsx
 *
 * D-14/D-17: the fixed-period-versus-hold-to-today choice. In fixed mode `holdingPeriodBars` is a
 * non-negative integer bar count -- the input's own `min` is 0 because `buildKernelInputs` treats 0
 * as a one-bar run (SIM-08's defined boundary meaning, `src/data/kernel-inputs.ts`'s
 * `Math.max(1, ...)` comment) and rejects only negatives (D-32). In hold-to-today mode
 * `holdingPeriodBars` is `null` and the bar-count input is not rendered at all.
 *
 * A fixed holding period that runs past the last supported bar is NOT rejected here: D-10 accepts
 * it as input and `src/app/state.ts`'s `scheduleRun` resolves it to the supported window, rendering
 * the caveat through `ValidationExplanation` (plan 04-05 Task 3). This control only rejects a
 * negative bar count, which is never a valid request regardless of the data window.
 *
 * The UI-SPEC's "Run to today" secondary action belongs to this control but depends on the
 * permalink's resolved end date, which does not exist until plan 04-07 -- not built here.
 */

import { createSignal, Show } from 'solid-js'

import { backtestRequest, updateBacktestRequest } from '../../state.ts'

export interface HoldingModeControlProps {
  disabled: boolean
}

/** Only used the first time a user switches from hold-to-today into fixed mode, so `null`
 * (hold-to-today) never needs a placeholder bar count of its own. ~1 trading year. */
const DEFAULT_FIXED_BAR_COUNT = 252

export function HoldingModeControl(props: HoldingModeControlProps) {
  const [lastFixedBarCount, setLastFixedBarCount] = createSignal(DEFAULT_FIXED_BAR_COUNT)

  const holdingPeriodBars = () => backtestRequest().holdingPeriodBars
  const isFixed = () => holdingPeriodBars() !== null

  function selectFixed(): void {
    updateBacktestRequest({ holdingPeriodBars: lastFixedBarCount() })
  }

  function selectHoldToToday(): void {
    const current = holdingPeriodBars()
    if (current !== null) setLastFixedBarCount(current)
    updateBacktestRequest({ holdingPeriodBars: null })
  }

  function handleBarCountInput(text: string): void {
    if (text === '') return // mid-typing; no partial value is a valid bar count to commit
    const value = Number(text)
    // D-32: buildKernelInputs itself rejects a negative holdingPeriodBars; reject it at the
    // control instead so an invalid value never reaches the kernel boundary. A non-integer is
    // rejected the same way -- a bar count is always a whole number of trading days.
    if (!Number.isInteger(value) || value < 0) return
    setLastFixedBarCount(value)
    updateBacktestRequest({ holdingPeriodBars: value })
  }

  return (
    <div class="parameter-group holding-mode-control" data-testid="holding-mode-control">
      <label class="control-label">Holding period</label>
      <div class="holding-mode-choice" role="radiogroup" aria-label="Holding period mode">
        <label class="holding-mode-option">
          <input
            type="radio"
            name="holding-mode"
            data-testid="holding-mode-fixed"
            disabled={props.disabled}
            checked={isFixed()}
            onChange={() => selectFixed()}
          />
          Fixed period
        </label>
        <label class="holding-mode-option">
          <input
            type="radio"
            name="holding-mode"
            data-testid="holding-mode-hold-to-today"
            disabled={props.disabled}
            checked={!isFixed()}
            onChange={() => selectHoldToToday()}
          />
          Hold to today
        </label>
      </div>
      <Show when={isFixed()}>
        <label class="control-label" for="holding-period-bars-input">
          Bars held
        </label>
        <input
          id="holding-period-bars-input"
          data-testid="holding-period-bars-input"
          type="number"
          min="0"
          step="1"
          class="holding-period-bars-input"
          disabled={props.disabled}
          value={holdingPeriodBars() ?? 0}
          onInput={(e) => handleBarCountInput(e.currentTarget.value)}
        />
      </Show>
    </div>
  )
}
