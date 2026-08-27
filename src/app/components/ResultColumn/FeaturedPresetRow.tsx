/**
 * src/app/components/ResultColumn/FeaturedPresetRow.tsx
 *
 * 08-04-PLAN.md Task 2, SHARE-06/D-14/D-15: the four featured preset cards, plus the "Scenarios"
 * heading and the "View all scenarios" trigger that opens the full ten-card `ScenariosOverlay`.
 * Mounted unconditionally in the result column (below the export row), so it is present from the
 * landing state and every result state alike -- criterion 3's "one click from the landing state"
 * is this row existing at all times, not a state a user has to navigate into.
 *
 * `PRESET_DEFINITIONS.filter((preset) => preset.featured)` never reorders its elements: the
 * filter preserves the array's own declaration order, which is D-13's unflattering-first
 * ordering made mechanical -- `presets.ts` is the one place that ordering is decided, this
 * component only renders it.
 */

import { For } from 'solid-js'

import { PRESET_DEFINITIONS } from '../../presets.ts'
import { openScenariosOverlay } from '../../state.ts'
import { PresetCard } from './PresetCard.tsx'

const FEATURED_PRESETS = PRESET_DEFINITIONS.filter((preset) => preset.featured)

export function FeaturedPresetRow() {
  return (
    <>
      <h2 class="featured-preset-heading">Scenarios</h2>
      <div class="featured-preset-row" data-testid="featured-preset-row">
        <For each={FEATURED_PRESETS}>{(preset) => <PresetCard preset={preset} />}</For>
      </div>
      <button
        type="button"
        class="scenarios-trigger"
        data-testid="scenarios-trigger"
        onClick={() => openScenariosOverlay()}
      >
        View all scenarios
      </button>
    </>
  )
}
