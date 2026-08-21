/**
 * src/app/components/ParameterColumn/LeverageControl.tsx
 *
 * A scrubbable leverage slider paired with a fixed-width monospace numeric readout. The accepted
 * band, greater than 0 and at most 20, matches `scripts/run-backtest.ts`'s already-committed
 * `MIN_LEVERAGE` (0, exclusive) and `MAX_LEVERAGE` (20, inclusive) and their stated reasoning:
 * sub-1x leverage is a deliberate credit case (D-08), not an error, so the band is `(0, 20]`, not
 * `[1, 20]`. Fractional values are accepted.
 *
 * The slider writes the leverage signal on every `input` event, not `change`, so it can be
 * scrubbed -- `src/app/state.ts`'s existing rAF guard (D-03) coalesces any number of writes
 * within one animation frame into a single recompute and repaint. Out-of-range input never
 * reaches the store: the slider's own `min`/`max` cap the drag, and a keystroke in the numeric
 * readout that would take the value outside the band is rejected outright (the displayed text
 * does not change), with the bound named inline in `--color-destructive`. Clearing the readout
 * and leaving it holds no committed change; leaving the field (blur) while it is empty or
 * unparseable reverts the display to the last valid value, so `buildKernelInputs` is never called
 * with `NaN`. A mid-typing partial value (a lone '.' or '-', or the empty string) is held on
 * screen without writing to the store or scheduling a run.
 *
 * CRED-05/D-22: the control carries the shared default badge/reset affordance
 * (`PARAMETER_DEFAULTS.leverage`). T-05-22: `ResetButton` writes `committedValue()` directly
 * through the registry, bypassing this control's own `commit`/`handleReadoutInput` -- the
 * `createEffect` below is what actually satisfies the must-have that Reset "clears" an invalid
 * state (UI-SPEC F8 error row): it watches `committedValue()` and clears both `rangeError` and
 * `draftText` whenever it changes for ANY reason, this control's own commit included, so an
 * external write (Reset, or a future permalink decode) cannot leave a stale error/draft behind.
 */

import { createEffect, createSignal, on, Show } from 'solid-js'

import { PARAMETER_DEFAULTS } from '../../parameter-defaults.ts'
import { backtestRequest, updateBacktestRequest } from '../../state.ts'
import { DefaultBadge } from './DefaultBadge.tsx'
import { ResetButton } from './ResetButton.tsx'

export interface LeverageControlProps {
  disabled: boolean
}

/** `scripts/run-backtest.ts`'s `MIN_LEVERAGE` (exclusive) and `MAX_LEVERAGE` (inclusive),
 * duplicated here rather than imported -- that script declares them as unexported script-local
 * constants. The two numbers are the single source of truth for the accepted band; this constant
 * pair must move in lockstep with that script's if the band is ever revised. */
const LEVERAGE_MIN_EXCLUSIVE = 0
const LEVERAGE_MAX_INCLUSIVE = 20
/** The slider's own reachable minimum: the smallest value that still satisfies "strictly greater
 * than 0". */
const SLIDER_MIN = 0.01

function isInRange(value: number): boolean {
  return Number.isFinite(value) && value > LEVERAGE_MIN_EXCLUSIVE && value <= LEVERAGE_MAX_INCLUSIVE
}

/** A string the user might still be typing towards a valid number: the empty string (a cleared
 * field), a lone '-' or '.', or a value ending in '.' (e.g. "3."). None of these parse to a
 * finite number, so they never reach `commit`; this only exists so the readout can hold them on
 * screen without immediately flashing an error while a valid number is still being typed. */
function isPartialInput(text: string): boolean {
  return text === '' || text === '-' || text === '.' || /\.$/.test(text)
}

export function LeverageControl(props: LeverageControlProps) {
  const [draftText, setDraftText] = createSignal<string | null>(null)
  const [rangeError, setRangeError] = createSignal<string | null>(null)

  const committedValue = () => backtestRequest().leverage
  const displayText = () => draftText() ?? committedValue().toFixed(2)

  // T-05-22: clears any lingering draft/error whenever the committed value changes, regardless of
  // origin -- `defer: true` skips the initial mount run, so this only fires on an actual change.
  createEffect(
    on(
      committedValue,
      () => {
        setDraftText(null)
        setRangeError(null)
      },
      { defer: true },
    ),
  )

  function commit(value: number): void {
    setRangeError(null)
    setDraftText(null)
    updateBacktestRequest({ leverage: value })
  }

  function handleSliderInput(rawValue: string): void {
    const value = Number(rawValue)
    if (!isInRange(value)) return // the slider's own min/max already prevent this
    commit(value)
  }

  function handleReadoutInput(text: string): void {
    if (isPartialInput(text)) {
      setDraftText(text)
      setRangeError(null)
      return
    }
    const value = Number(text)
    if (!isInRange(value)) {
      // Reject the keystroke: draftText is left unchanged, so the controlled input's displayed
      // value snaps back to the last accepted draft/committed text rather than showing the
      // rejected number.
      setRangeError(
        !Number.isFinite(value) || value <= LEVERAGE_MIN_EXCLUSIVE
          ? `leverage must be greater than ${LEVERAGE_MIN_EXCLUSIVE}x`
          : `leverage must be at most ${LEVERAGE_MAX_INCLUSIVE}x`,
      )
      return
    }
    commit(value)
  }

  function handleReadoutBlur(): void {
    // UI-SPEC E2 empty: leaving the field with no committed value on screen reverts to the last
    // valid value rather than leaving it empty or invalid, so the kernel is never called with NaN.
    if (draftText() === null) return
    setDraftText(null)
    setRangeError(null)
  }

  return (
    <div class="parameter-group leverage-control" data-testid="leverage-control">
      <label class="control-label" for="leverage-slider">
        Leverage
      </label>
      <input
        id="leverage-slider"
        data-testid="leverage-slider"
        type="range"
        min={SLIDER_MIN}
        max={LEVERAGE_MAX_INCLUSIVE}
        step="0.01"
        disabled={props.disabled}
        value={committedValue()}
        onInput={(e) => handleSliderInput(e.currentTarget.value)}
      />
      <span class="leverage-readout-slot">
        <input
          id="leverage-readout"
          data-testid="leverage-readout"
          type="text"
          inputmode="decimal"
          class="leverage-readout"
          disabled={props.disabled}
          value={displayText()}
          onInput={(e) => handleReadoutInput(e.currentTarget.value)}
          onBlur={handleReadoutBlur}
        />
        <span class="leverage-readout-suffix">x</span>
      </span>
      <Show
        when={PARAMETER_DEFAULTS.leverage.isDefault()}
        fallback={<ResetButton parameterId="leverage" disabled={props.disabled} />}
      >
        <DefaultBadge parameterId="leverage" disabled={props.disabled} />
      </Show>
      <Show when={rangeError() !== null}>
        <span class="leverage-range-error" data-testid="leverage-range-error">
          {rangeError()}
        </span>
      </Show>
    </div>
  )
}
