/**
 * src/app/App.tsx
 *
 * Top-level layout: a fixed-width parameter column on the left and the result column on the
 * right at viewport widths >= 900px, stacking to a single column below that (04-UI-SPEC.md
 * "Screen structure", D-17). Plan 04-04 fills the parameter column's first controls (symbol,
 * entry date) and wires D-11/D-12's clear-and-explain path; plan 04-05 adds the remaining
 * controls. The result column is a single slot (D-21) so Phase 7's heatmap replaces its content
 * rather than rearranging the application.
 *
 * Plan 04-08: `initTheme()` runs alongside `initializeApp()` in `onMount`, unconditionally and
 * idempotently (same pattern `initializeApp` itself already uses) -- it resolves
 * `prefers-color-scheme` (or a still-active manual override) and writes `data-theme` before the
 * parameter and result columns below ever read the CSS custom properties it selects between.
 */

import { onMount, Show } from 'solid-js'

import { ParameterColumn } from './components/ParameterColumn/ParameterColumn.tsx'
import { bundleVersionMismatchVariant } from './components/ResultColumn/BundleVersionBanner.tsx'
import { EquityCurveChart } from './components/ResultColumn/EquityCurveChart.tsx'
import { LogScaleToggle } from './components/ResultColumn/LogScaleToggle.tsx'
import { MetricsPanel } from './components/ResultColumn/MetricsPanel.tsx'
import { RuinBanner } from './components/ResultColumn/RuinBanner.tsx'
import { ValidationExplanation, type ExplanationVariant } from './components/ResultColumn/ValidationExplanation.tsx'
import { ThemeToggle } from './components/ThemeToggle.tsx'
import { BUNDLE_VERSION } from '../data-bundle.generated.ts'
import {
  backtestRequest,
  currentCaveatMessage,
  currentDerivedMetrics,
  currentKernelInputs,
  currentKernelResult,
  currentLinkBundleVersion,
  currentValidationError,
  initializeApp,
  loadedBundle,
  loadError,
  loadStatus,
  scaleMode,
  setScaleMode,
} from './state.ts'
import { initTheme } from './theme.ts'

/** D-10/D-11/D-15/UI-SPEC E9: the current set of explanation variants, in whatever order they
 * were found -- `ValidationExplanation` owns the stacking order, not this function. Plan 04-07
 * fills the `bundle-mismatch` slot plan 04-05 reserved, via `bundleVersionMismatchVariant`, without
 * touching this array-building logic's shape (push-if-applicable, same as the other two). */
function explanationVariants(): ExplanationVariant[] {
  const variants: ExplanationVariant[] = []
  const mismatch = bundleVersionMismatchVariant(currentLinkBundleVersion(), BUNDLE_VERSION)
  if (mismatch !== null) variants.push(mismatch)
  const error = currentValidationError()
  if (error !== null) variants.push({ kind: 'single-field-eviction', message: error })
  const caveat = currentCaveatMessage()
  if (caveat !== null) variants.push({ kind: 'cross-field-caveat', message: caveat })
  return variants
}

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
    initTheme()
    void initializeApp()
  })

  return (
    <div class="app-layout">
      <ParameterColumn />
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
          {/* D-11: an invalid parameter combination clears chart and metrics and shows only the
              explanation. D-10: a cross-field caveat renders here too, but alongside the still-
              computed chart and metrics below -- ValidationExplanation itself decides the
              stacking order, this call site only supplies the current set (UI-SPEC E9 empty: an
              empty array renders no DOM nodes at all). */}
          <ValidationExplanation variants={explanationVariants()} />

          <Show when={currentValidationError() === null}>
            {/* scheduleRun's rAF callback has not resolved the first run yet: keep showing
                LoadingNotice rather than momentarily flashing an empty-run explanation. */}
            <Show
              when={currentKernelInputs() !== null && currentKernelResult() !== null}
              fallback={<p class="loading-notice">Loading market data...</p>}
            >
              <Show
                when={plottableBarCount() > 0}
                fallback={<p class="empty-run-notice">This run has no plottable bars.</p>}
              >
                <div class="chart-scale-row">
                  <LogScaleToggle scale={scaleMode()} onChange={setScaleMode} />
                  <ThemeToggle />
                </div>
                <EquityCurveChart
                  inputs={currentKernelInputs()!}
                  result={currentKernelResult()!}
                  calendar={loadedBundle()!.calendar}
                  scale={scaleMode()}
                />

                {/* D-07: metrics and the ruin banner appear only alongside a completed run
                    (E7 empty); the banner sits above the metrics it makes subordinate. */}
                <Show when={currentDerivedMetrics() !== null}>
                  <Show when={currentKernelResult()!.ruined && currentDerivedMetrics()!.ruinDate !== null}>
                    <RuinBanner ruinDate={currentDerivedMetrics()!.ruinDate!} />
                  </Show>
                  <MetricsPanel
                    result={currentKernelResult()!}
                    metrics={currentDerivedMetrics()!}
                    contributionAmount={backtestRequest().contributionAmount}
                  />
                </Show>
              </Show>
            </Show>
          </Show>
        </Show>
      </main>
    </div>
  )
}
