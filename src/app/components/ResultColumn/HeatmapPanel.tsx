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
 *
 * 07-08-PLAN.md Task 2 (D-19 through D-21): a second, transparent overlay canvas (`crosshairEl`)
 * sits on top of the field canvas at the identical geometry, owning every pointer event -- the
 * field canvas itself (owned by `paint-contour.ts`, 07-09's territory) is never touched by this.
 * Hover paints a GHOST crosshair (1px dashed, muted -- deliberately NOT accent, so it reads as
 * provisional, `07-UI-SPEC.md` Color) and mounts `HoverReadout.tsx`; hover moves nothing else
 * (not the slices, not the permalink, not `crosshairCell()`). A click resolves the clicked cell
 * via `crosshairCellFor` and commits it via `setCrosshairCell` (which `SliceChart.tsx`'s
 * `resolveFixedRow`/`resolveFixedCol` already read, 07-07) -- Task 3 (07-08-PLAN.md) extends this
 * same click to also write the parameter column's own `entryDate`/`leverage` fields (D-17/D-22).
 */

import { createEffect, createSignal, onCleanup, Show } from 'solid-js'

import { clampLeverageToGrid, crosshairCellFor, type CrosshairCellHit, type FieldRect } from '../../../heatmap/crosshair.ts'
import { gridColToDisplayX, gridRowToDisplayY, paintSweepField } from '../../../heatmap/paint-contour.ts'
import type { SweepGrid } from '../../../sweep/sweep-grid.ts'
import { backtestRequest, crosshairCell, displayedMetric, setCrosshairCell } from '../../state.ts'
import { onThemeChange } from '../../theme.ts'
import { HoverReadout } from './HoverReadout.tsx'
import { HorizontalSliceChart, VerticalSliceChart } from './SliceChart.tsx'
import { SweepCaption } from './SweepCaption.tsx'
import { SweepLegend } from './SweepLegend.tsx'

/** D-12: matches `FORM_2_GEOMETRY.widthPx`/`heightPx` (see this file's header note). */
const HEATMAP_WIDTH_PX = 800
const HEATMAP_HEIGHT_PX = 240

/** The field canvas's own paint rectangle: its full canvas area, since (unlike the Phase 6
 * mockup) this production canvas reserves no internal axis gutter of its own -- the gutter lives
 * OUTSIDE the canvas, as `.heatmap-canvas-wrapper`'s own left padding (see this file's header). */
const FIELD_RECT: FieldRect = { x: 0, y: 0, width: HEATMAP_WIDTH_PX, height: HEATMAP_HEIGHT_PX }

/** The dash pattern shared by both the ghost crosshair and a clamped committed leverage guide. */
const DASH_PATTERN: readonly number[] = [4, 3]

function getCssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value === '' ? fallback : value
}

interface GuideLineStyle {
  color: string
  lineWidth: number
  dashed: boolean
}

function drawGuideLines(
  ctx: CanvasRenderingContext2D,
  xPx: number,
  yPx: number,
  widthPx: number,
  heightPx: number,
  colStyle: GuideLineStyle,
  rowStyle: GuideLineStyle,
): void {
  ctx.save()
  ctx.strokeStyle = colStyle.color
  ctx.lineWidth = colStyle.lineWidth
  ctx.setLineDash(colStyle.dashed ? DASH_PATTERN : [])
  ctx.beginPath()
  ctx.moveTo(xPx, 0)
  ctx.lineTo(xPx, heightPx)
  ctx.stroke()

  ctx.strokeStyle = rowStyle.color
  ctx.lineWidth = rowStyle.lineWidth
  ctx.setLineDash(rowStyle.dashed ? DASH_PATTERN : [])
  ctx.beginPath()
  ctx.moveTo(0, yPx)
  ctx.lineTo(widthPx, yPx)
  ctx.stroke()
  ctx.restore()
}

export interface HeatmapPanelProps {
  grid: SweepGrid | null
}

export function HeatmapPanel(props: HeatmapPanelProps) {
  let canvasEl: HTMLCanvasElement | undefined
  let crosshairEl: HTMLCanvasElement | undefined

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

  // 07-08-PLAN.md Task 2: the transient, hover-only cell -- `null` before any pointer interaction
  // and whenever the pointer leaves the field, matching E5 empty (see this file's header).
  const [hoverCell, setHoverCell] = createSignal<CrosshairCellHit | null>(null)

  createEffect(() => {
    // Re-tracked so a new sweep result, a metric change, or a theme flip repaints; themeVersion is
    // tracked for the same reason EquityCurveChart.tsx tracks it -- the canvas has no free
    // prefers-color-scheme styling of its own.
    void props.grid
    void displayedMetric()
    void themeVersion()
    repaint()
  })

  function repaintCrosshair(): void {
    if (crosshairEl === undefined) return
    const ctx = crosshairEl.getContext('2d')
    if (ctx === null) return
    ctx.clearRect(0, 0, HEATMAP_WIDTH_PX, HEATMAP_HEIGHT_PX)

    const grid = props.grid
    if (grid === null) return

    const textMuted = getCssVar('--color-text-muted', '#5b6169')
    const accent = getCssVar('--color-accent', '#2e6bd6')

    const committed = crosshairCell()
    if (committed !== null) {
      const xPx = gridColToDisplayX(committed.col, HEATMAP_WIDTH_PX, grid.cols)
      const yPx = gridRowToDisplayY(committed.row, HEATMAP_HEIGHT_PX, grid.rows)
      // D-19/T-07-17: the leverage guide (the row line) is drawn dashed, never solid, when the
      // CURRENT stored leverage falls outside the grid's own [LEVERAGE_MIN, LEVERAGE_MAX] range --
      // a clamped position is never presented as an exact one. The entry-date guide (the column
      // line) has no analogous off-grid case: every grid column is a real entry date.
      const leverageClamped = clampLeverageToGrid(backtestRequest().leverage).clamped
      drawGuideLines(
        ctx,
        xPx,
        yPx,
        HEATMAP_WIDTH_PX,
        HEATMAP_HEIGHT_PX,
        { color: accent, lineWidth: 2, dashed: false },
        { color: accent, lineWidth: 2, dashed: leverageClamped },
      )
    }

    const hover = hoverCell()
    if (hover !== null) {
      const xPx = gridColToDisplayX(hover.col, HEATMAP_WIDTH_PX, grid.cols)
      const yPx = gridRowToDisplayY(hover.row, HEATMAP_HEIGHT_PX, grid.rows)
      // D-19: deliberately NOT accent -- muted, dashed, 1px, so it reads as provisional and is
      // never confused with the committed crosshair drawn above.
      drawGuideLines(
        ctx,
        xPx,
        yPx,
        HEATMAP_WIDTH_PX,
        HEATMAP_HEIGHT_PX,
        { color: textMuted, lineWidth: 1, dashed: true },
        { color: textMuted, lineWidth: 1, dashed: true },
      )
    }
  }

  createEffect(() => {
    void props.grid
    void hoverCell()
    void crosshairCell()
    void themeVersion()
    void backtestRequest().leverage
    repaintCrosshair()
  })

  onCleanup(() => {
    unsubscribeThemeChange()
  })

  function pointerToField(e: { clientX: number; clientY: number }): { x: number; y: number } | null {
    if (crosshairEl === undefined) return null
    const rect = crosshairEl.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handlePointerMove(e: PointerEvent): void {
    const grid = props.grid
    if (grid === null) {
      setHoverCell(null)
      return
    }
    const pos = pointerToField(e)
    if (pos === null) {
      setHoverCell(null)
      return
    }
    setHoverCell(crosshairCellFor(pos.x, pos.y, FIELD_RECT, grid.cols, grid.rows))
  }

  function handlePointerLeave(): void {
    setHoverCell(null)
  }

  // 07-08-PLAN.md Task 2 (D-19): clicking a cell commits it -- `setCrosshairCell` is the SAME
  // signal `SliceChart.tsx`'s `resolveFixedRow`/`resolveFixedCol` already read (07-07), so the
  // slice charts pick up the new fixed row/column the instant this fires. At most one committed
  // cell exists at a time: a second click overwrites the signal rather than accumulating a set.
  // Task 3 (07-08-PLAN.md) extends this same handler to also write the parameter column's own
  // `entryDate`/`leverage` fields (D-17/D-22).
  function handleClick(e: MouseEvent): void {
    const grid = props.grid
    if (grid === null) return
    const pos = pointerToField(e)
    if (pos === null) return
    const cell = crosshairCellFor(pos.x, pos.y, FIELD_RECT, grid.cols, grid.rows)
    if (cell === null) return
    setCrosshairCell(cell)
  }

  const readoutAnchor = () => {
    const grid = props.grid
    const cell = hoverCell()
    if (grid === null || cell === null) return null
    return {
      cell,
      xPx: gridColToDisplayX(cell.col, HEATMAP_WIDTH_PX, grid.cols),
      yPx: gridRowToDisplayY(cell.row, HEATMAP_HEIGHT_PX, grid.rows),
    }
  }

  return (
    <div class="screenshot-region" data-testid="screenshot-region">
      <div class="heatmap-field-row" style={{ display: 'flex', 'align-items': 'flex-start' }}>
        <div class="heatmap-field-column">
          <div
            class="heatmap-canvas-wrapper"
            data-testid="heatmap-canvas-wrapper"
            style={{ 'padding-left': `${fieldLeftGutterPx()}px` }}
          >
            <div
              class="heatmap-field-stack"
              data-testid="heatmap-field-stack"
              style={{
                position: 'relative',
                width: `${HEATMAP_WIDTH_PX}px`,
                height: `${HEATMAP_HEIGHT_PX}px`,
              }}
            >
              <canvas
                ref={canvasEl}
                data-testid="heatmap-canvas"
                width={HEATMAP_WIDTH_PX}
                height={HEATMAP_HEIGHT_PX}
                class="heatmap-panel"
                style={{ position: 'absolute', top: '0', left: '0' }}
              />
              {/* 07-08-PLAN.md Task 2/3: pointer-only (F-03, this file's own header) -- owns every
                  hover/click event over the field without touching the field canvas underneath. */}
              <canvas
                ref={crosshairEl}
                data-testid="heatmap-crosshair-overlay"
                width={HEATMAP_WIDTH_PX}
                height={HEATMAP_HEIGHT_PX}
                style={{ position: 'absolute', top: '0', left: '0' }}
                onPointerMove={handlePointerMove}
                onPointerLeave={handlePointerLeave}
                onClick={handleClick}
              />
              <Show when={readoutAnchor()}>
                {(anchor) => (
                  <HoverReadout
                    grid={props.grid!}
                    cell={anchor().cell}
                    anchorXPx={anchor().xPx}
                    anchorYPx={anchor().yPx}
                    panelWidthPx={HEATMAP_WIDTH_PX}
                    panelHeightPx={HEATMAP_HEIGHT_PX}
                  />
                )}
              </Show>
            </div>
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
