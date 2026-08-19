/**
 * src/app/components/ParameterColumn/EntryDateControl.tsx
 *
 * A date input whose `min`/`max` come from `resolveEntryDateBounds` for the current symbol,
 * dividend mode and the pinned strict tier (D-09), recomputed live whenever any of those three
 * change (D-12). The displayed value is always ISO `YYYY-MM-DD` in the monospace stack at a fixed
 * ten-character width, locale independent (UI-SPEC E3 long-text).
 *
 * A partially typed date neither recomputes nor evicts: a native `<input type="date">` only ever
 * fires `change` with a complete ISO value or an empty string (a cleared input), never a partial
 * one, so validation runs on a complete parseable date by construction (UI-SPEC E3 partial).
 * D-12's eviction path is not re-derived here: `min`/`max` update live so the browser's own picker
 * reflects the new bound, but the stored `entryDate` is never moved. When the stored value now
 * falls outside the recomputed bound, `buildKernelInputs` itself rejects it (D-32) and
 * `src/app/state.ts`'s `scheduleRun` catches that thrown error, clears the result and stores the
 * message (D-11) -- this control does not duplicate that check.
 */

import { createMemo, Show } from 'solid-js'

import { resolveEntryDateBounds, type EntryDateBoundsResult } from '../../bounds.ts'
import { backtestRequest, loadedBundle, updateBacktestRequest } from '../../state.ts'
import { SourceCitation } from './SourceCitation.tsx'

export interface EntryDateControlProps {
  disabled: boolean
}

export function EntryDateControl(props: EntryDateControlProps) {
  const bounds = createMemo<EntryDateBoundsResult | null>(() => {
    const bundle = loadedBundle()
    if (bundle === null) return null
    const request = backtestRequest()
    return resolveEntryDateBounds(bundle.manifest, request.symbol, request.dividendReinvest, 'strict')
  })

  const minDate = () => {
    const b = bounds()
    return b?.ok === true ? b.firstDate : undefined
  }
  const maxDate = () => {
    const b = bounds()
    return b?.ok === true ? b.lastDate : undefined
  }

  return (
    <div class="parameter-group entry-date-control" data-testid="entry-date-control">
      <label class="control-label" for="entry-date-input">
        Entry date
      </label>
      <input
        id="entry-date-input"
        data-testid="entry-date-input"
        type="date"
        class="entry-date-input"
        disabled={props.disabled}
        min={minDate()}
        max={maxDate()}
        value={backtestRequest().entryDate}
        onChange={(e) => {
          const value = e.currentTarget.value
          // UI-SPEC E3 empty: a cleared native date input fires `change` with an empty string;
          // revert to the earliest bound rather than writing an empty entryDate.
          if (value === '') {
            const b = bounds()
            if (b?.ok === true) updateBacktestRequest({ entryDate: b.firstDate })
            return
          }
          updateBacktestRequest({ entryDate: value })
        }}
      />
      <Show when={bounds()?.ok === true}>
        <SourceCitation text={`earliest available, ${backtestRequest().symbol} strict tier`} />
      </Show>
    </div>
  )
}
