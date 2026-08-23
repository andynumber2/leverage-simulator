/**
 * src/app/components/ResultColumn/HeatmapPanel.tsx
 *
 * 07-01-PLAN.md Task 2: the tracer's sweep mount -- one canvas, painted by
 * `src/heatmap/paint-contour.ts`'s `paintSweepField` whenever `sweepGrid()` resolves to a new
 * grid or the theme flips, mirroring `EquityCurveChart.tsx`'s own `createEffect` +
 * `onThemeChange` shape (canvas gets no free `prefers-color-scheme` styling, D-19/VIZ-11).
 *
 * `HEATMAP_WIDTH_PX`/`HEATMAP_HEIGHT_PX` below are the same 800x240 values
 * `.planning/phases/06-heatmap-design-pass/mockups/forms/form-2-filled-contour.ts`'s
 * `FORM_2_GEOMETRY` declares (D-12) -- declared locally rather than imported from that mockup
 * file, because production `src/` code never imports a VALUE from `.planning/` (a planning-phase
 * directory that does not survive a milestone archive, the same reasoning `hatch-pattern.ts`'s
 * header deviation note applies to `fixtureRowForLeverage`).
 *
 * 07-07-PLAN.md (Rule 2 addition): the field now reads `displayedMetric()` instead of a hardcoded
 * `'multiple'` -- this file's own prior header note flagged that wiring as "plan 07-06's job",
 * but this plan's own key_links state the metric toggle "re-colors ALL THREE [field, slices,
 * legend] from one source," which requires the field itself to respond, and no concurrently
 * planned file in this wave (07-06's `files_modified` excludes `HeatmapPanel.tsx`) claims it.
 * `paint-contour.ts`'s shipped `'resample'` fill path already routes every metric correctly
 * (07-02-PLAN.md Task 3); its marching-squares CONTOUR-LINE stroke pass still has a pre-existing,
 * separately-scoped bug for `drawdown`/`annualized` (`paint-contour.ts`'s own local
 * `getRampValues`/fixed `BAND_LEVELS` never route through `value-to-color.ts`'s per-metric
 * `bandLevelsForMetric`) -- left untouched here because `07-09-PLAN.md` (wave 4, depends on
 * 07-06) already declares `src/heatmap/paint-contour.ts` in its own `files_modified` and is the
 * plan that owns fixing it.
 *
 * Task 1/2/3: mounts the two marginal slice charts (`SliceChart.tsx`, 8px from the field), the
 * two-variant legend (`SweepLegend.tsx`) and the caption strip (`SweepCaption.tsx`), all inside
 * this component's own `screenshot-region` -- the sweep panel's analogue of Phase 4's D-20
 * screenshot region (`App.tsx`'s own is single-run-only, mounted only inside its
 * `resultMode() === 'single'` branch, so the sweep panel needs its own self-contained one). The
 * field canvas's left padding is kept EXACTLY equal to the horizontal slice's own measured y-axis
 * gutter (`fieldLeftGutterPx`, reported via `onGutterMeasured`) so the two share one entry-date
 * axis pixel-for-pixel, by construction rather than by matching two independently-guessed numbers.
 */

import { createEffect, createSignal, onCleanup } from 'solid-js'

import { paintSweepField } from '../../../heatmap/paint-contour.ts'
import type { SweepGrid } from '../../../sweep/sweep-grid.ts'
import { displayedMetric } from '../../state.ts'
import { onThemeChange } from '../../theme.ts'
import { HorizontalSliceChart, VerticalSliceChart } from './SliceChart.tsx'
import { SweepCaption } from './SweepCaption.tsx'
import { SweepLegend } from './SweepLegend.tsx'

/** D-12: matches `FORM_2_GEOMETRY.widthPx`/`heightPx` (see this file's header note). */
const HEATMAP_WIDTH_PX = 800
const HEATMAP_HEIGHT_PX = 240

export interface HeatmapPanelProps {
  grid: SweepGrid | null
}

export function HeatmapPanel(props: HeatmapPanelProps) {
  let canvasEl: HTMLCanvasElement | undefined

  function repaint(): void {
    if (canvasEl === undefined) return
    const grid = props.grid
    if (grid === null) return
    const ctx = canvasEl.getContext('2d')
    if (ctx === null) return
    paintSweepField(ctx, grid, { metric: displayedMetric() })
  }

  const [themeVersion, setThemeVersion] = createSignal(0)
  const unsubscribeThemeChange = onThemeChange(() => setThemeVersion((v) => v + 1))

  // 07-07-PLAN.md: the field canvas's own left padding, kept in exact sync with the horizontal
  // slice's measured y-axis gutter (see this file's header) -- initial value is 0 so the field is
  // flush-left before the first slice chart has measured anything.
  const [fieldLeftGutterPx, setFieldLeftGutterPx] = createSignal(0)

  createEffect(() => {
    // Re-tracked so a new sweep result, a metric change, or a theme flip repaints; themeVersion is
    // tracked for the same reason EquityCurveChart.tsx tracks it -- the canvas has no free
    // prefers-color-scheme styling of its own.
    void props.grid
    void displayedMetric()
    void themeVersion()
    repaint()
  })

  onCleanup(() => {
    unsubscribeThemeChange()
  })

  return (
    <div class="screenshot-region" data-testid="screenshot-region">
      <div class="heatmap-field-row" style={{ display: 'flex', 'align-items': 'flex-start' }}>
        <div class="heatmap-field-column">
          <div
            class="heatmap-canvas-wrapper"
            data-testid="heatmap-canvas-wrapper"
            style={{ 'padding-left': `${fieldLeftGutterPx()}px` }}
          >
            <canvas
              ref={canvasEl}
              data-testid="heatmap-canvas"
              width={HEATMAP_WIDTH_PX}
              height={HEATMAP_HEIGHT_PX}
              class="heatmap-panel"
            />
          </div>
          {/* E4 loading / D-14: mounted unconditionally, same as the field canvas above -- no
              separate spinner or skeleton, and no DOM shape change once the first sweep pass
              resolves (see SliceChart.tsx's own header for how it stays shape-stable). */}
          <HorizontalSliceChart
            grid={props.grid}
            metric={displayedMetric()}
            widthPx={HEATMAP_WIDTH_PX}
            onGutterMeasured={setFieldLeftGutterPx}
          />
        </div>
        <VerticalSliceChart grid={props.grid} metric={displayedMetric()} heightPx={HEATMAP_HEIGHT_PX} />
      </div>

      <SweepCaption grid={props.grid} />

      <div style={{ 'margin-top': 'var(--space-md)' }}>
        <SweepLegend metric={displayedMetric()} />
      </div>
    </div>
  )
}
