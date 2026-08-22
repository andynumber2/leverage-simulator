/**
 * src/app/components/ResultColumn/HeatmapPanel.tsx
 *
 * 07-01-PLAN.md Task 2: the tracer's sweep mount -- one canvas, painted by
 * `src/heatmap/paint-contour.ts`'s `paintSweepField` whenever `sweepGrid()` resolves to a new
 * grid or the theme flips, mirroring `EquityCurveChart.tsx`'s own `createEffect` +
 * `onThemeChange` shape (canvas gets no free `prefers-color-scheme` styling, D-19/VIZ-11).
 * Renders the multiple-of-contributed metric only; the metric toggle (`displayedMetric`) is plan
 * 07-06's job.
 *
 * `HEATMAP_WIDTH_PX`/`HEATMAP_HEIGHT_PX` below are the same 800x240 values
 * `.planning/phases/06-heatmap-design-pass/mockups/forms/form-2-filled-contour.ts`'s
 * `FORM_2_GEOMETRY` declares (D-12) -- declared locally rather than imported from that mockup
 * file, because production `src/` code never imports a VALUE from `.planning/` (a planning-phase
 * directory that does not survive a milestone archive, the same reasoning `hatch-pattern.ts`'s
 * header deviation note applies to `fixtureRowForLeverage`).
 */

import { createEffect, createSignal, onCleanup } from 'solid-js'

import { paintSweepField } from '../../../heatmap/paint-contour.ts'
import type { SweepGrid } from '../../../sweep/sweep-grid.ts'
import { onThemeChange } from '../../theme.ts'

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
    paintSweepField(ctx, grid, { metric: 'multiple' })
  }

  const [themeVersion, setThemeVersion] = createSignal(0)
  const unsubscribeThemeChange = onThemeChange(() => setThemeVersion((v) => v + 1))

  createEffect(() => {
    // Re-tracked so a new sweep result or a theme flip repaints; themeVersion is tracked for the
    // same reason EquityCurveChart.tsx tracks it -- the canvas has no free prefers-color-scheme
    // styling of its own.
    void props.grid
    void themeVersion()
    repaint()
  })

  onCleanup(() => {
    unsubscribeThemeChange()
  })

  return (
    <canvas
      ref={canvasEl}
      data-testid="heatmap-canvas"
      width={HEATMAP_WIDTH_PX}
      height={HEATMAP_HEIGHT_PX}
      class="heatmap-panel"
    />
  )
}
