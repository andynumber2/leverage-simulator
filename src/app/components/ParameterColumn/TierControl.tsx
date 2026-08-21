/**
 * src/app/components/ParameterColumn/TierControl.tsx
 *
 * APP-02: the history-tier selector Phase 4's D-09 deliberately left pinned. Renders exactly two
 * radio-style options in a fixed order (strict, then extended), each with its meaning stated
 * inline as visible text -- never a `<select>`, never a `title` attribute, never a tooltip.
 *
 * Each option's availability is resolved through `resolveEntryDateBounds` for the current symbol,
 * dividend mode and that option's own tier, mirroring `SymbolControl`'s disabled-with-stated-
 * reason pattern for an option the manifest cannot support: an unavailable tier renders disabled
 * with the resolver's own reason stated beneath it, never omitted and never left selectable.
 *
 * Selecting an option calls `setActiveTier`, which applies immediately (no intermediate
 * unparseable state) and flows through the same coalesced recompute every other control uses.
 */

import { createMemo, For, Show } from 'solid-js'

import { resolveEntryDateBounds, type EntryDateBoundsResult, type Tier } from '../../bounds.ts'
import { activeTier, backtestRequest, loadedBundle, setActiveTier } from '../../state.ts'

export interface TierControlProps {
  disabled: boolean
}

interface TierOption {
  tier: Tier
  /** Copywriting Contract's fixed option string, rendered verbatim as visible text (never a
   * tooltip). The contract's em dash is rendered as a colon here, per this repo's standing
   * "no em dash in any output" rule -- the wording and meaning are otherwise unchanged. */
  meaning: string
}

/** Copywriting Contract order: strict first, extended second, fixed regardless of data. */
const TIER_OPTIONS: readonly TierOption[] = [
  { tier: 'strict', meaning: 'Strict: every input genuinely daily' },
  {
    tier: 'extended',
    meaning: 'Extended: deep history, monthly rate/dividend data interpolated to daily',
  },
]

export function TierControl(props: TierControlProps) {
  /** One `resolveEntryDateBounds` call per option, keyed by tier -- the control never constructs
   * a bound itself, it only reads what the manifest resolver already decided. */
  const availability = createMemo<Record<Tier, EntryDateBoundsResult | null>>(() => {
    const bundle = loadedBundle()
    const request = backtestRequest()
    const empty: Record<Tier, EntryDateBoundsResult | null> = { strict: null, extended: null }
    if (bundle === null) return empty
    return {
      strict: resolveEntryDateBounds(bundle.manifest, request.symbol, request.dividendReinvest, 'strict'),
      extended: resolveEntryDateBounds(bundle.manifest, request.symbol, request.dividendReinvest, 'extended'),
    }
  })

  return (
    <div class="parameter-group tier-control" data-testid="tier-control">
      <label class="control-label">History tier</label>
      <div class="tier-choice" role="radiogroup" aria-label="History tier">
        <For each={TIER_OPTIONS}>
          {(option) => {
            const bounds = () => availability()[option.tier]
            const unavailable = () => bounds()?.ok === false
            const optionDisabled = () => props.disabled || unavailable()

            return (
              <label class="tier-option" data-testid={`tier-option-${option.tier}`}>
                <input
                  type="radio"
                  name="history-tier"
                  data-testid={`tier-radio-${option.tier}`}
                  disabled={optionDisabled()}
                  checked={activeTier() === option.tier}
                  onChange={() => setActiveTier(option.tier)}
                />
                <span class="tier-option-meaning">{option.meaning}</span>
                <Show when={unavailable()}>
                  <span class="tier-option-disabled-reason" data-testid={`tier-option-disabled-reason-${option.tier}`}>
                    {(bounds() as { ok: false; reason: string }).reason}
                  </span>
                </Show>
              </label>
            )
          }}
        </For>
      </div>
    </div>
  )
}
