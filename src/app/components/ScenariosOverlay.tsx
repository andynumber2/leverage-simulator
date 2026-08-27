/**
 * src/app/components/ScenariosOverlay.tsx
 *
 * 08-04-PLAN.md Task 2, SHARE-06/D-14: the full-screen Scenarios overlay holding every preset in
 * the library. Copies `MethodologyOverlay.tsx`'s shell verbatim -- the outermost `Show` gate on
 * the open signal (nothing renders until the flag opens it), the header layout, and the close-icon
 * SVG -- and its `onMount`/`onCleanup` Escape-key handler pair. Lives alongside
 * `MethodologyOverlay.tsx` in `src/app/components/`, not under `ResultColumn/`: like the
 * methodology overlay, this replaces the whole screen rather than occupying a slot in the result
 * column.
 *
 * Deliberately does NOT copy `MethodologyOverlay`'s defensive live-computed-value cache over
 * `loadedBundle()`: that cache exists because the methodology overlay computes live figures (the
 * UPRO/TQQQ gate snapshots) on open. Every figure a preset card renders here is static,
 * build-time-computed data (`PRESET_OUTCOMES`, D-18) -- there is nothing to compute live and
 * nothing that can throw.
 *
 * `PRESET_DEFINITIONS` is rendered with no reordering step: declaration order is render order
 * (D-13), the same discipline `FeaturedPresetRow` follows for its own featured subset.
 */

import { For, onCleanup, onMount, Show } from 'solid-js'

import { PRESET_DEFINITIONS } from '../presets.ts'
import { closeScenariosOverlay, scenariosOverlayOpen } from '../state.ts'
import { PresetCard } from './ResultColumn/PresetCard.tsx'

export function ScenariosOverlay() {
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && scenariosOverlayOpen()) {
      closeScenariosOverlay()
    }
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeydown)
  })
  onCleanup(() => {
    document.removeEventListener('keydown', handleKeydown)
  })

  return (
    <Show when={scenariosOverlayOpen()}>
      <div class="scenarios-overlay" data-testid="scenarios-overlay" role="dialog" aria-modal="true">
        <div class="scenarios-overlay-header">
          <h1 class="scenarios-overlay-title">Scenarios</h1>
          <button
            type="button"
            class="scenarios-overlay-close"
            data-testid="scenarios-overlay-close"
            aria-label="Close"
            onClick={() => closeScenariosOverlay()}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <line x1="2" y1="2" x2="14" y2="14" stroke-linecap="round" />
              <line x1="14" y1="2" x2="2" y2="14" stroke-linecap="round" />
            </svg>
          </button>
        </div>

        <div class="scenarios-overlay-content">
          <For each={PRESET_DEFINITIONS}>{(preset) => <PresetCard preset={preset} />}</For>
        </div>
      </div>
    </Show>
  )
}
