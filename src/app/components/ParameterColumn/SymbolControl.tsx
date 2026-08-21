/**
 * src/app/components/ParameterColumn/SymbolControl.tsx
 *
 * APP-01: a single native `select`, no search, no grouping, no virtualization (UI-SPEC E1
 * populated), populated from `listSymbols`'s manifest-derived ascending order (DATA-08). Paired
 * with the dividend-reinvest toggle: when `dividendModesFor` reports the selected symbol lacks
 * one of its two modes, the toggle is disabled and the reason is stated inline through
 * `SourceCitation` -- the option is never silently dropped (UI-SPEC E1 partial).
 *
 * CRED-05/D-22: the dividend-mode toggle carries the shared default badge/reset affordance
 * (`PARAMETER_DEFAULTS.dividendMode`), driven by the one registry rather than a local predicate.
 */

import { For, Show } from 'solid-js'

import { dividendModesFor, listSymbols } from '../../bounds.ts'
import { PARAMETER_DEFAULTS } from '../../parameter-defaults.ts'
import { backtestRequest, loadedBundle, updateBacktestRequest } from '../../state.ts'
import { DefaultBadge } from './DefaultBadge.tsx'
import { ResetButton } from './ResetButton.tsx'
import { SourceCitation } from './SourceCitation.tsx'

export interface SymbolControlProps {
  disabled: boolean
}

function dividendUnavailableReason(modes: { totalReturn: boolean; priceReturn: boolean }): string {
  if (!modes.totalReturn) return 'total return not available for this symbol'
  if (!modes.priceReturn) return 'price return not available for this symbol'
  return ''
}

export function SymbolControl(props: SymbolControlProps) {
  const symbols = () => {
    const bundle = loadedBundle()
    return bundle === null ? [] : listSymbols(bundle.manifest)
  }

  const modes = () => {
    const bundle = loadedBundle()
    if (bundle === null) return { totalReturn: true, priceReturn: true }
    return dividendModesFor(bundle.manifest, backtestRequest().symbol)
  }

  const dividendToggleDisabled = () => props.disabled || !(modes().totalReturn && modes().priceReturn)

  return (
    <div class="parameter-group symbol-control" data-testid="symbol-control">
      <label class="control-label" for="symbol-select">
        Symbol
      </label>
      <select
        id="symbol-select"
        data-testid="symbol-select"
        disabled={props.disabled}
        value={backtestRequest().symbol}
        onChange={(e) => updateBacktestRequest({ symbol: e.currentTarget.value })}
      >
        <For each={symbols()}>{(symbol) => <option value={symbol}>{symbol}</option>}</For>
      </select>

      <div class="dividend-toggle-row">
        <label class="control-label" for="dividend-toggle">
          <input
            id="dividend-toggle"
            data-testid="dividend-toggle"
            type="checkbox"
            checked={backtestRequest().dividendReinvest}
            disabled={dividendToggleDisabled()}
            onChange={(e) => updateBacktestRequest({ dividendReinvest: e.currentTarget.checked })}
          />
          Reinvest dividends (total return)
        </label>
        <Show when={dividendToggleDisabled() && !props.disabled}>
          <SourceCitation text={dividendUnavailableReason(modes())} />
        </Show>
        <Show
          when={PARAMETER_DEFAULTS.dividendMode.isDefault()}
          fallback={<ResetButton parameterId="dividendMode" disabled={props.disabled} />}
        >
          <DefaultBadge parameterId="dividendMode" disabled={props.disabled} />
        </Show>
      </div>
    </div>
  )
}
