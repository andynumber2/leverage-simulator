/**
 * src/app/App.tsx
 *
 * Top-level layout: a fixed-width parameter column on the left and the result column on the
 * right at viewport widths >= 900px, stacking to a single column below that (04-UI-SPEC.md
 * "Screen structure", D-17). The parameter column is empty in this plan -- plans 04-04/04-05
 * fill it -- and the result column is a single slot (D-21) so Phase 7's heatmap replaces its
 * content rather than rearranging the application.
 */

import { onMount, Show } from 'solid-js'

import { EquityCurveChart } from './components/ResultColumn/EquityCurveChart.tsx'
import {
  currentKernelInputs,
  currentKernelResult,
  initializeApp,
  loadedBundle,
  loadError,
  loadStatus,
  scaleMode,
} from './state.ts'

/** A run with zero plottable bars (D-11's clear-and-explain path) never reaches the chart --
 * the chart element is absent rather than rendering an empty axis frame (E6 empty). */
function plottableBarCount(): number {
  const inputs = currentKernelInputs()
  const result = currentKernelResult()
  if (inputs === null || result === null) return 0
  return result.ruined && result.ruinBarIndex >= 0 ? result.ruinBarIndex : inputs.window.barCount
}

export function App() {
  onMount(() => {
    void initializeApp()
  })

  return (
    <div class="app-layout">
      <aside class="parameter-column" aria-disabled={loadStatus() !== 'ready'} />
      <main class="result-column" data-testid="result-slot">
        <Show when={loadStatus() === 'loading'}>
          <p class="loading-notice">Loading market data...</p>
        </Show>

        <Show when={loadStatus() === 'failed'}>
          <div class="load-failure" data-testid="load-failure">
            <p>{loadError()}</p>
            <button type="button" onClick={() => void initializeApp()}>
              Retry
            </button>
          </div>
        </Show>

        <Show when={loadStatus() === 'ready'}>
          {/* scheduleRun's rAF callback has not resolved the first run yet: keep showing
              LoadingNotice rather than momentarily flashing an empty-run explanation. */}
          <Show
            when={currentKernelInputs() !== null && currentKernelResult() !== null}
            fallback={<p class="loading-notice">Loading market data...</p>}
          >
            <Show
              when={plottableBarCount() > 0}
              fallback={<p class="validation-explanation">This run has no plottable bars.</p>}
            >
              <EquityCurveChart
                inputs={currentKernelInputs()!}
                result={currentKernelResult()!}
                calendar={loadedBundle()!.calendar}
                scale={scaleMode()}
              />
            </Show>
          </Show>
        </Show>
      </main>
    </div>
  )
}
