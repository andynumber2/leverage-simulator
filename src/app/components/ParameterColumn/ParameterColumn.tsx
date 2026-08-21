/**
 * src/app/components/ParameterColumn/ParameterColumn.tsx
 *
 * D-17/D-21: the persistent, independently scrollable container the UI-SPEC's Screen structure
 * names. Every control it renders is disabled while the manifest has not decoded (load status
 * `loading` or `failed`) (UI-SPEC E1/E2/E3 loading). D-18: the instrument-panel voice keeps
 * `--space-xs`/`--space-sm` between related elements and reserves `--space-md`/`--space-lg` for
 * separating distinct control groups; nothing here uses `--space-xl` or larger.
 */

import { Show } from 'solid-js'

import { loadStatus } from '../../state.ts'
import { ContributionControl } from './ContributionControl.tsx'
import { CopyLinkButton } from './CopyLinkButton.tsx'
import { CostControls } from './CostControls.tsx'
import { EntryDateControl } from './EntryDateControl.tsx'
import { HoldingModeControl } from './HoldingModeControl.tsx'
import { LeverageControl } from './LeverageControl.tsx'
import { SymbolControl } from './SymbolControl.tsx'
import { TierControl } from './TierControl.tsx'

export function ParameterColumn() {
  const disabled = () => loadStatus() !== 'ready'

  return (
    <aside class="parameter-column" aria-disabled={disabled()} data-testid="parameter-column">
      <Show when={disabled()}>
        <p class="loading-notice" data-testid="parameter-column-loading-notice">
          Loading market data...
        </p>
      </Show>
      <SymbolControl disabled={disabled()} />
      <TierControl disabled={disabled()} />
      <LeverageControl disabled={disabled()} />
      <EntryDateControl disabled={disabled()} />
      <HoldingModeControl disabled={disabled()} />
      <ContributionControl disabled={disabled()} />
      <CostControls disabled={disabled()} />
      <CopyLinkButton />
    </aside>
  )
}
