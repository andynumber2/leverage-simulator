/**
 * src/app/components/ParameterColumn/HoldingModeControl.tsx
 *
 * D-14/D-17: the fixed-period-versus-open-ended choice. In fixed mode `holdingPeriodBars` is a
 * non-negative integer bar count -- the input's own `min` is 0 because `buildKernelInputs` treats 0
 * as a one-bar run (SIM-08's defined boundary meaning, `src/data/kernel-inputs.ts`'s
 * `Math.max(1, ...)` comment) and rejects only negatives (D-32). In the open-ended mode
 * `holdingPeriodBars` is `null` and the bar-count input is not rendered at all.
 *
 * A fixed holding period that runs past the last supported bar is NOT rejected here: D-10 accepts
 * it as input and `src/app/state.ts`'s `scheduleRun` resolves it to the supported window, rendering
 * the caveat through `ValidationExplanation` (plan 04-05 Task 3). This control only rejects a
 * negative bar count, which is never a valid request regardless of the data window.
 *
 * The open-ended mode is named for the DATA, not for the wall clock: "Hold to end of data
 * (<date>)", not "Hold to today". The bundle is refreshed manually and infrequently, so "today"
 * is a promise it cannot keep -- opened two months after a refresh, a control reading "today"
 * silently means "two months ago". Naming the resolved end date states exactly what the run
 * delivers, which also removes the need for D-29's rate-coverage caveat in this mode: there is no
 * gap between what the control promises and what the run does, so there is nothing left to
 * caveat. (The fixed-period overrun caveat is unaffected and still fires -- there the user really
 * did ask for a window longer than the data supports.) This supersedes the UI-SPEC's "Run to
 * today" secondary action and D-14's wall-clock framing.
 *
 * The date shown is the live `activeTier()`'s `lastDate` for the selected series (05-05 lifts
 * D-09's Phase-4 strict-tier pin), resolved through the same `resolveEntryDateBounds` call
 * `EntryDateControl` uses. That bound already accounts for rate coverage, so it is the bar the
 * run actually ends on, not the last priced bar.
 *
 * CRED-05/D-22: the control carries the shared default badge/reset affordance
 * (`PARAMETER_DEFAULTS.holdingMode`) -- default is the open-ended mode (`holdingPeriodBars ===
 * null`, `DEFAULT_REQUEST`'s own seed), matching `selectOpenEnded`'s own write.
 */

import { createMemo, createSignal, Show } from 'solid-js'

import { resolveEntryDateBounds } from '../../bounds.ts'
import { PARAMETER_DEFAULTS } from '../../parameter-defaults.ts'
import { activeTier, backtestRequest, loadedBundle, updateBacktestRequest } from '../../state.ts'
import { DefaultBadge } from './DefaultBadge.tsx'
import { ResetButton } from './ResetButton.tsx'

export interface HoldingModeControlProps {
  disabled: boolean
}

/** Only used the first time a user switches from the open-ended mode into fixed mode, so `null`
 * (open-ended) never needs a placeholder bar count of its own. ~1 trading year. */
const FALLBACK_FIXED_BAR_COUNT = 252

export function HoldingModeControl(props: HoldingModeControlProps) {
  const [lastFixedBarCount, setLastFixedBarCount] = createSignal(FALLBACK_FIXED_BAR_COUNT)

  const holdingPeriodBars = () => backtestRequest().holdingPeriodBars
  const isFixed = () => holdingPeriodBars() !== null

  /** The bar an open-ended run actually ends on, or `null` before the bundle has loaded (the
   * label then omits the date rather than showing a placeholder date that could be wrong). */
  const endOfDataDate = createMemo<string | null>(() => {
    const bundle = loadedBundle()
    if (bundle === null) return null
    const request = backtestRequest()
    const bounds = resolveEntryDateBounds(bundle.manifest, request.symbol, request.dividendReinvest, activeTier())
    return bounds.ok ? bounds.lastDate : null
  })

  const openEndedLabel = () => {
    const date = endOfDataDate()
    if (date === null) return 'Hold to end of data'
    return `Hold to end of data (${date})`
  }

  function selectFixed(): void {
    updateBacktestRequest({ holdingPeriodBars: lastFixedBarCount() })
  }

  function selectOpenEnded(): void {
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
            data-testid="holding-mode-open-ended"
            disabled={props.disabled}
            checked={!isFixed()}
            onChange={() => selectOpenEnded()}
          />
          {openEndedLabel()}
        </label>
      </div>
      <Show
        when={PARAMETER_DEFAULTS.holdingMode.isDefault()}
        fallback={<ResetButton parameterId="holdingMode" disabled={props.disabled} />}
      >
        <DefaultBadge parameterId="holdingMode" disabled={props.disabled} />
      </Show>
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
