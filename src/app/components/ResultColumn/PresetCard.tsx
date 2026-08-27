/**
 * src/app/components/ResultColumn/PresetCard.tsx
 *
 * 08-04-PLAN.md Task 2, SHARE-06/T-08-17: one preset card -- title, outcome line, tags, and a
 * click handler that applies the preset through `applyPreset` (`../../state.ts`), the same
 * validated write path every parameter control uses. Every rendered figure is read from
 * `PRESET_OUTCOMES` (build-time computed, D-18) and formatted through `src/metrics/format.ts`
 * only: this component computes nothing and rounds nothing of its own (F-07). Shared by both
 * `FeaturedPresetRow` (the four-card inline row) and `ScenariosOverlay` (the full ten-card
 * library) -- one card shape, two mounting contexts.
 *
 * D-13: the surrounding words name what was measured and the window, never a verdict --
 * "Final value: 6.02x of contributed" states the figure the model computed; it does not say
 * whether that outcome is good or bad. The ordering carries the argument (D-13/D-15); this
 * component's copy deliberately does not.
 *
 * The tag strings below are 08-UI-SPEC.md's Copywriting Contract's exact wording with one
 * deliberate substitution: the extended-tier tag's source copy uses a dash the project's own
 * CLAUDE.md forbids (an em dash), rendered here with a hyphen instead ("Extended tier -
 * interpolated data"), per `~/.claude/CLAUDE.md`'s absolute "never use the em dash character in
 * any output" rule, which overrides a plan/UI-SPEC instruction on conflict. Recorded as a
 * deviation in this plan's SUMMARY.md, not silently applied.
 */

import { For } from 'solid-js'

import { formatMultiple, formatPercent } from '../../../metrics/format.ts'
import { PRESET_OUTCOMES, type PresetOutcome } from '../../presets.generated.ts'
import type { PresetDefinition, PresetOutcomeMetric, PresetTag } from '../../presets.ts'
import { applyPreset } from '../../state.ts'

export interface PresetCardProps {
  preset: PresetDefinition
}

/** F-07: the one `PRESET_OUTCOMES` lookup by id, shared so this card's own render and any future
 * consumer (`FeaturedPresetRow`, `ScenariosOverlay`) never each re-implement a second linear
 * scan over the same generated array. */
export function outcomeById(id: string): PresetOutcome | undefined {
  return PRESET_OUTCOMES.find((outcome) => outcome.id === id)
}

/** 08-UI-SPEC.md Copywriting Contract, verbatim except the em-dash substitution documented in
 * this module's header. Exactly one of these ever renders for a given tag value -- no second
 * copy of either string exists anywhere else in the app. */
const TAG_COPY: Record<PresetTag, string> = {
  synthetic: 'Synthetic 3x, not the real fund',
  'extended-tier': 'Extended tier - interpolated data',
}

/** Which of a completed run's four headline figures this preset names, formatted through the
 * app's one shared formatter (`src/metrics/format.ts`) -- a `switch`, not a lookup of nested
 * conditional expressions, per this project's own style. Named what was measured, never a
 * verdict (D-13): the surrounding words state the metric and its value, not whether the value is
 * good or bad. */
function formatOutcomeLine(outcome: PresetOutcome, metric: PresetOutcomeMetric): string {
  switch (metric) {
    case 'finalValueMultiple':
      return `Final value: ${formatMultiple(outcome.finalValueMultiple)} of contributed.`
    case 'irr':
      return `IRR: ${formatPercent(outcome.irr)}.`
    case 'cagr':
      return `CAGR: ${formatPercent(outcome.cagr)}.`
    case 'maxDrawdown':
      return `Max drawdown: ${formatPercent(outcome.maxDrawdown)}.`
  }
}

export function PresetCard(props: PresetCardProps) {
  // `props.preset` never changes across this card's own lifetime (`FeaturedPresetRow`/
  // `ScenariosOverlay` each mount one `PresetCard` per array entry via `For`, not a shared
  // instance whose `preset` prop is later swapped), so this lookup is plain, non-reactive work
  // done once per card, not a `createMemo`.
  const outcome = outcomeById(props.preset.id)
  const outcomeLine = outcome === undefined ? '' : formatOutcomeLine(outcome, props.preset.outcomeMetric)

  return (
    <button
      type="button"
      class="preset-card"
      data-testid="preset-card"
      data-preset-id={props.preset.id}
      onClick={() => applyPreset(props.preset)}
    >
      <span class="preset-card-title">{props.preset.title}</span>
      <span class="preset-card-outcome">{outcomeLine}</span>
      <For each={props.preset.tags}>{(tag) => <span class="preset-card-tag">{TAG_COPY[tag]}</span>}</For>
    </button>
  )
}
