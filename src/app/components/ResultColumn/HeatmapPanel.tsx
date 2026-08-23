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
 * `resolveFixedRow`/`resolveFixedCol` already read, 07-07).
 *
 * 07-08-PLAN.md Task 3 (D-17/D-22): that same click ALSO writes the parameter column's own
 * `entryDate`/`leverage` fields via `updateBacktestRequest`, passing `skipSweep: true` so
 * drilling into an already-computed field never itself re-sweeps (T-07-MUST "committing a cell
 * must not start a sweep" -- see `src/app/state.ts`'s own `UpdateBacktestRequestOptions` doc
 * comment for why that option exists; `state.ts` is not in this plan's own declared
 * `files_modified`, so this is a Rule 3 deviation, documented in this plan's own SUMMARY.md, not
 * a silent scope change). Switching to Single run then shows the full receipts for exactly that
 * cell with no new gesture and no new plumbing.
 *
 * The committed crosshair also stays in sync in the OTHER direction (D-17): a `createEffect`
 * below re-resolves `crosshairCell()` from the live `backtestRequest().entryDate`/`leverage`
 * whenever either changes AND a crosshair is already committed (never summoning one from a bare
 * keyboard edit, matching E5's "before any pointer interaction, neither renders" -- only an
 * ALREADY-committed crosshair tracks a keyboard-driven parameter edit). This is also the answer
 * to Finding F-03: the field canvas stays POINTER-ONLY (D-21 leaves it with no keyboard nudge of
 * its own -- this is a recorded decision, not an oversight), but the crosshair STATE stays
 * reachable by keyboard through the existing entry-date and leverage controls, which drive the
 * identical store fields this effect watches.
 *
 * 07-10-PLAN.md (D-34/D-35, PERF-09): a `viewport` signal (`src/heatmap/viewport.ts`'s
 * `SweepViewport`) lives HERE as local component state -- never in the app store, never in the
 * permalink (D-35: the link carries what the sweep computed, not where the reader was looking).
 * `repaint`/`repaintCrosshair` apply the SAME viewport to their own canvas's 2D context via
 * `ctx.translate(offsetX, offsetY); ctx.scale(scale, scale)` before issuing every draw call, so
 * the field, the crosshair guide lines, and (inside `paintSweepField`) the short-horizon rule and
 * curve label all move together under one transform -- no change to `paint-contour.ts` at all: at
 * unchanged `generation`/`metric`/`cols`/`rows` its D-09 offscreen-fill cache stays warm, so the
 * transform alone stretches the cached bitmap (D-34's "goes soft past 1:1" tradeoff), while every
 * stroke pass is genuinely redrawn under the transform and stays crisp. A wheel/pinch gesture
 * zooms toward the pointer (`zoomViewportAt`); a pointer drag beyond a small movement threshold
 * pans (`clampViewport` pins the pan offset to zero until the drag actually exceeds fit scale, so
 * panning at fit scale is a no-op by construction, not a special case here). Every hit test
 * (`crosshairCellFor`) first inverts the raw pointer position through the CURRENT viewport
 * (`invertViewportTransform`) back to the logical, un-zoomed field-rect space `crosshairCellFor`
 * itself expects, so panning/zooming never changes which cell a given on-screen pixel names. The
 * gesture never calls `updateBacktestRequest`/`scheduleSweep` and never touches `sweepGeneration`
 * -- zoom only ever magnifies the already-rendered field (D-34).
 *
 * The two marginal slice charts (`HorizontalSliceChart`/`VerticalSliceChart`) are DELIBERATELY NOT
 * transformed by the viewport: they read whole rows/columns of the grid and their own axes stay
 * the un-zoomed domain (07-10-PLAN.md's own planner assumption -- a slice is a cut of the WHOLE
 * grid, not a view of the currently visible region, and neither is fed `viewport()`).
 *
 * New axis ticks (`entryDateTicks`/`leverageTicks` below, D-34's "the axes rescale under zoom so
 * every tick keeps stating a real entry date and a real leverage") are plain DOM `<span>` elements
 * rather than canvas text -- their content is always a real value pulled straight from
 * `grid.meta.entryDates`/`integerLeverageTicks`, positioned via the SAME `applyViewportTransform`
 * the crosshair guide lines use, so a reader (or a test) can read the actual tick text rather than
 * needing to OCR a rendered bitmap.
 */

import { createEffect, createSignal, For, onCleanup, Show, untrack } from 'solid-js'

import { clampLeverageToGrid, crosshairCellFor, type CrosshairCellHit, type FieldRect } from '../../../heatmap/crosshair.ts'
import { integerLeverageTicks } from '../../../heatmap/hatch-pattern.ts'
import { gridColToDisplayX, gridRowToDisplayY, paintSweepField } from '../../../heatmap/paint-contour.ts'
import {
  applyViewportTransform,
  clampViewport,
  FIT_VIEWPORT,
  invertViewportTransform,
  visibleDomainFor,
  zoomViewportAt,
  type FieldSize,
  type SweepViewport,
} from '../../../heatmap/viewport.ts'
import { LEVERAGE_MAX, LEVERAGE_MIN, type SweepGrid } from '../../../sweep/sweep-grid.ts'
import { backtestRequest, crosshairCell, displayedMetric, setCrosshairCell, updateBacktestRequest } from '../../state.ts'
import { onThemeChange } from '../../theme.ts'
import { HoverReadout } from './HoverReadout.tsx'
import { nearestColForEntryDate, nearestRowForLeverage, HorizontalSliceChart, VerticalSliceChart } from './SliceChart.tsx'
import { SweepCaption } from './SweepCaption.tsx'
import { SweepLegend } from './SweepLegend.tsx'

/** D-12: matches `FORM_2_GEOMETRY.widthPx`/`heightPx` (see this file's header note). */
const HEATMAP_WIDTH_PX = 800
const HEATMAP_HEIGHT_PX = 240

/** The field canvas's own paint rectangle: its full canvas area, since (unlike the Phase 6
 * mockup) this production canvas reserves no internal axis gutter of its own -- the gutter lives
 * OUTSIDE the canvas, as `.heatmap-canvas-wrapper`'s own left padding (see this file's header). */
const FIELD_RECT: FieldRect = { x: 0, y: 0, width: HEATMAP_WIDTH_PX, height: HEATMAP_HEIGHT_PX }

/** The same geometry as `FIELD_RECT`, in `viewport.ts`'s own `FieldSize` shape (span only, no
 * origin) -- `clampViewport`/`zoomViewportAt`/`visibleDomainFor` all need only the span. */
const FIELD_SIZE: FieldSize = { widthPx: HEATMAP_WIDTH_PX, heightPx: HEATMAP_HEIGHT_PX }

/** The dash pattern shared by both the ghost crosshair and a clamped committed leverage guide. */
const DASH_PATTERN: readonly number[] = [4, 3]

/** A single wheel notch multiplies (or divides) the current scale by this factor (Claude's
 * discretion, D-34's own action text names no specific step size) -- large enough that a single
 * scroll notch is a perceptible zoom step, small enough that a trackpad's continuous wheel stream
 * feels smooth rather than jumpy. */
const ZOOM_WHEEL_FACTOR = 1.2

/** A pointer movement below this many pixels (from the pointerdown origin) is still a CLICK, not
 * a PAN -- the same "small movement tolerance" every drag-vs-click gesture needs so an
 * imprecise, near-stationary press still commits a crosshair cell rather than being swallowed as
 * a zero-distance pan. */
const PAN_DRAG_THRESHOLD_PX = 3

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

  // 07-10-PLAN.md Task 2 (D-34/D-35): local-only pan/zoom state -- never in the app store, never
  // in the permalink (see this file's header). `FIT_VIEWPORT` (scale 1.0, zero offset) is the
  // identity transform, so the field renders pixel-identical to its pre-07-10 output until a
  // gesture actually moves it.
  const [viewport, setViewport] = createSignal<SweepViewport>(FIT_VIEWPORT)

  function repaint(): void {
    if (canvasEl === undefined) return
    const grid = props.grid
    if (grid === null) return
    const ctx = canvasEl.getContext('2d')
    if (ctx === null) return
    const vp = viewport()
    ctx.save()
    ctx.translate(vp.offsetX, vp.offsetY)
    ctx.scale(vp.scale, vp.scale)
    paintSweepField(ctx, grid, { metric: displayedMetric() })
    ctx.restore()
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
    // Re-tracked so a new sweep result, a metric change, a theme flip, or a pan/zoom gesture
    // repaints; themeVersion is tracked for the same reason EquityCurveChart.tsx tracks it -- the
    // canvas has no free prefers-color-scheme styling of its own.
    void props.grid
    void displayedMetric()
    void themeVersion()
    void viewport()
    repaint()
  })

  function repaintCrosshair(): void {
    if (crosshairEl === undefined) return
    const ctx = crosshairEl.getContext('2d')
    if (ctx === null) return
    // Untransformed: the viewport's own clamp guarantees the visible area always covers the full
    // canvas (see viewport.ts's clampViewport header), so a plain full-canvas clear is always
    // sufficient regardless of the transform applied below.
    ctx.clearRect(0, 0, HEATMAP_WIDTH_PX, HEATMAP_HEIGHT_PX)

    const grid = props.grid
    if (grid === null) return

    const textMuted = getCssVar('--color-text-muted', '#5b6169')
    const accent = getCssVar('--color-accent', '#2e6bd6')

    // 07-10-PLAN.md Task 2: the SAME viewport transform `repaint()` applies to the field canvas,
    // so the guide lines keep pointing at the cells they name under any pan/zoom.
    const vp = viewport()
    ctx.save()
    ctx.translate(vp.offsetX, vp.offsetY)
    ctx.scale(vp.scale, vp.scale)

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

    ctx.restore()
  }

  createEffect(() => {
    void props.grid
    void hoverCell()
    void crosshairCell()
    void themeVersion()
    void backtestRequest().leverage
    void viewport()
    repaintCrosshair()
  })

  // 07-08-PLAN.md Task 3, D-17 (both directions): once a crosshair is committed, moving the
  // entry-date or leverage control re-resolves `crosshairCell()` against the CURRENT
  // `backtestRequest()` fields and the current grid, so the field crosshair and the slice
  // charts' own fixed row/col (`SliceChart.tsx`'s `resolveFixedRow`/`resolveFixedCol`, which
  // already read `crosshairCell()`) stay one continuous view of one source of truth.
  // `crosshairCell()` itself is read untracked so this effect's own writes below do not
  // re-trigger it -- it re-runs only when `backtestRequest()`'s fields or the grid change, never
  // on its own output.
  createEffect(() => {
    const grid = props.grid
    const entryDate = backtestRequest().entryDate
    const leverage = backtestRequest().leverage
    if (grid === null) return
    const current = untrack(crosshairCell)
    if (current === null) return
    const col = nearestColForEntryDate(grid, entryDate)
    const row = nearestRowForLeverage(grid, leverage)
    if (current.col !== col || current.row !== row) {
      setCrosshairCell({ col, row })
    }
  })

  onCleanup(() => {
    unsubscribeThemeChange()
  })

  /** Raw pointer/wheel position relative to the crosshair overlay canvas's own (fixed, never
   * transformed by CSS or by the internal ctx transform) DOM box -- SCREEN space, the same space
   * `applyViewportTransform`'s own output lives in and `invertViewportTransform` accepts. */
  function pointerToField(e: { clientX: number; clientY: number }): { x: number; y: number } | null {
    if (crosshairEl === undefined) return null
    const rect = crosshairEl.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  // 07-10-PLAN.md Task 2: pan-drag tracking. Plain mutable locals (not signals) -- gesture-in-
  // progress bookkeeping that nothing else reads reactively, matching this file's own
  // `canvasEl`/`crosshairEl` precedent for non-reactive component-local state.
  let panOrigin: { screenX: number; screenY: number; viewport: SweepViewport } | null = null
  let panActive = false
  let lastGestureWasDrag = false

  function handlePointerDown(e: PointerEvent): void {
    const pos = pointerToField(e)
    if (pos === null) return
    panOrigin = { screenX: pos.x, screenY: pos.y, viewport: viewport() }
    panActive = false
    crosshairEl?.setPointerCapture(e.pointerId)
  }

  function hoverAt(pos: { x: number; y: number }): void {
    const grid = props.grid
    if (grid === null) {
      setHoverCell(null)
      return
    }
    const logical = invertViewportTransform(viewport(), pos)
    setHoverCell(crosshairCellFor(logical.x, logical.y, FIELD_RECT, grid.cols, grid.rows))
  }

  function handlePointerMove(e: PointerEvent): void {
    const pos = pointerToField(e)
    if (pos === null) {
      setHoverCell(null)
      return
    }

    // A pointerdown already armed a possible pan: while the primary button stays pressed, this
    // move either accumulates toward the drag threshold (PAN_DRAG_THRESHOLD_PX, still a
    // provisional click) or, once past it, becomes a genuine pan -- clamped through
    // clampViewport, which pins the offset to zero at fit scale (D-34), so a fit-scale drag is a
    // real no-op rather than a special case here.
    if (panOrigin !== null && (e.buttons & 1) !== 0) {
      const dx = pos.x - panOrigin.screenX
      const dy = pos.y - panOrigin.screenY
      if (panActive || Math.hypot(dx, dy) >= PAN_DRAG_THRESHOLD_PX) {
        panActive = true
        const candidate: SweepViewport = {
          scale: panOrigin.viewport.scale,
          offsetX: panOrigin.viewport.offsetX + dx,
          offsetY: panOrigin.viewport.offsetY + dy,
        }
        setViewport(clampViewport(candidate, FIELD_SIZE))
        // No ghost crosshair while actively panning -- the pointer is dragging the field, not
        // pointing at a cell.
        setHoverCell(null)
        return
      }
    }

    hoverAt(pos)
  }

  function handlePointerUp(): void {
    lastGestureWasDrag = panActive
    panOrigin = null
    panActive = false
  }

  function handlePointerLeave(): void {
    setHoverCell(null)
    panOrigin = null
    panActive = false
  }

  // 07-10-PLAN.md Task 2 (D-34): a wheel (or trackpad pinch, delivered as a wheel event with
  // ctrlKey set) zooms toward the pointer -- never re-sweeps, never changes sweepGeneration.
  function handleWheel(e: WheelEvent): void {
    const pos = pointerToField(e)
    if (pos === null) return
    e.preventDefault()
    const factor = e.deltaY < 0 ? ZOOM_WHEEL_FACTOR : 1 / ZOOM_WHEEL_FACTOR
    setViewport((current) => zoomViewportAt(current, FIELD_SIZE, pos, factor))
  }

  // 07-08-PLAN.md Task 2/3 (D-19/D-17/D-22): clicking a cell commits it -- `setCrosshairCell` is
  // the SAME signal `SliceChart.tsx`'s `resolveFixedRow`/`resolveFixedCol` already read (07-07),
  // so the slice charts pick up the new fixed row/column the instant this fires. At most one
  // committed cell exists at a time: a second click overwrites the signal rather than
  // accumulating a set. `updateBacktestRequest` writes the SAME `entryDate`/`leverage` fields the
  // parameter column owns, so switching to Single run shows the full receipts for exactly this
  // cell. `skipSweep: true` is load-bearing: the crosshair's position is the cell pointed at
  // WITHIN an already-computed field, not a new sweep input, so this must not itself schedule a
  // re-sweep (proven by a `sweepGeneration()`-unchanged browser assertion). No double-click: a
  // single click is the entire drill-down gesture (D-22) -- no tooltip button, no dblclick.
  //
  // 07-10-PLAN.md Task 2: a click that ended a genuine pan drag (`lastGestureWasDrag`, set by
  // `handlePointerUp` just before the browser's own native `click` fires) is swallowed here --
  // releasing a drag must not ALSO commit whatever cell happens to sit under the release point.
  function handleClick(e: MouseEvent): void {
    if (lastGestureWasDrag) {
      lastGestureWasDrag = false
      return
    }
    const grid = props.grid
    if (grid === null) return
    const pos = pointerToField(e)
    if (pos === null) return
    const logical = invertViewportTransform(viewport(), pos)
    const cell = crosshairCellFor(logical.x, logical.y, FIELD_RECT, grid.cols, grid.rows)
    if (cell === null) return
    const entryDate = grid.meta.entryDates[cell.col] ?? ''
    const leverage = grid.meta.leverages[cell.row] ?? backtestRequest().leverage
    setCrosshairCell(cell)
    updateBacktestRequest({ entryDate, leverage }, { skipSweep: true })
  }

  const readoutAnchor = () => {
    const grid = props.grid
    const cell = hoverCell()
    if (grid === null || cell === null) return null
    const logicalXPx = gridColToDisplayX(cell.col, HEATMAP_WIDTH_PX, grid.cols)
    const logicalYPx = gridRowToDisplayY(cell.row, HEATMAP_HEIGHT_PX, grid.rows)
    // HoverReadout is a plain positioned DOM element (not a canvas draw call), so it needs the
    // actual SCREEN position under the current pan/zoom, not the un-transformed logical position.
    const screen = applyViewportTransform(viewport(), { x: logicalXPx, y: logicalYPx })
    return { cell, xPx: screen.x, yPx: screen.y }
  }

  /** D-34's own must_have: axis ticks always name a REAL entry date, derived from
   * `visibleDomainFor`'s transformed index range rather than any rounded display pixel. Plain DOM
   * `<span>`s (this file's own header) so their text is directly readable, positioned at the
   * SCREEN x `applyViewportTransform` maps each tick's logical column centre to. Evenly spaced
   * across the visible column range; at fit scale that range is the whole grid, so this renders
   * the same sparse set of ticks with or without any zoom having happened.
   *
   * D-14 (E4 loading, this file's own precedent -- `HorizontalSliceChart`/`VerticalSliceChart`
   * mount the SAME shape with zero data points before the first sweep pass resolves): the tick
   * strip's own element COUNT must never depend on whether `props.grid` is `null` yet, or a
   * later pass at a narrow zoom happens to de-duplicate down to fewer distinct columns --
   * `tests/app/sweep-progressive.browser.test.ts` asserts the DOM's own element shape is
   * identical before and after the coarse pass lands, which a variable-length `<For>` would
   * break. Both accessors below therefore always return exactly a fixed slot count, padded with
   * empty-text, zero-footprint placeholders when there is no real tick to show. */
  const ENTRY_DATE_TICK_COUNT = 5

  interface EntryDateTick {
    dateStr: string
    xPx: number
  }

  const entryDateTicks = (): EntryDateTick[] => {
    const ticks: EntryDateTick[] = []
    const grid = props.grid
    if (grid !== null) {
      const domain = visibleDomainFor(viewport(), FIELD_SIZE, { cols: grid.cols, rows: grid.rows })
      const span = domain.lastCol - domain.firstCol
      const seenCols = new Set<number>()
      const denominator = ENTRY_DATE_TICK_COUNT - 1
      for (let i = 0; i < ENTRY_DATE_TICK_COUNT; i++) {
        const col = domain.firstCol + Math.round((span * i) / (denominator <= 0 ? 1 : denominator))
        if (seenCols.has(col)) continue
        seenCols.add(col)
        const dateStr = grid.meta.entryDates[col]
        if (dateStr === undefined || dateStr === '') continue
        const logicalXPx = gridColToDisplayX(col, HEATMAP_WIDTH_PX, grid.cols)
        const screen = applyViewportTransform(viewport(), { x: logicalXPx, y: 0 })
        ticks.push({ dateStr, xPx: screen.x })
      }
    }
    while (ticks.length < ENTRY_DATE_TICK_COUNT) {
      ticks.push({ dateStr: '', xPx: 0 })
    }
    return ticks
  }

  /** Mirrors `entryDateTicks`'s own fixed-slot-count discipline (see its own comment above), but
   * for the leverage axis: reuses `integerLeverageTicks` (`hatch-pattern.ts`), the SAME
   * leverage-tick source `VerticalSliceChart` reads (so the two axes name identical leverage
   * values), restricted to the currently visible row range. The slot count is
   * `LEVERAGE_MIN`/`LEVERAGE_MAX` (D-01's own fixed [1, 5] leverage-axis bounds), never a magic
   * literal and never derived from a specific grid instance -- the coarse and full passes both
   * carry the SAME endpoints (`meta.leverages[0]`/`[last]`, asserted by
   * `sweep-progressive.browser.test.ts` itself), so the integer tick count between them is
   * architecturally identical regardless of how many interior rows either pass sampled. */
  const LEVERAGE_TICK_SLOT_COUNT = Math.floor(LEVERAGE_MAX) - Math.ceil(LEVERAGE_MIN) + 1

  interface LeverageTick {
    label: string
    yPx: number
  }

  const leverageTicks = (): LeverageTick[] => {
    const ticks: LeverageTick[] = []
    const grid = props.grid
    if (grid !== null) {
      const domain = visibleDomainFor(viewport(), FIELD_SIZE, { cols: grid.cols, rows: grid.rows })
      for (const tick of integerLeverageTicks(grid.meta.leverages)) {
        if (tick.rowF < domain.firstRow - 1 || tick.rowF > domain.lastRow + 1) continue
        const logicalYPx = gridRowToDisplayY(tick.rowF, HEATMAP_HEIGHT_PX, grid.rows)
        const screen = applyViewportTransform(viewport(), { x: 0, y: logicalYPx })
        ticks.push({ label: `${tick.leverage}x`, yPx: screen.y })
      }
    }
    while (ticks.length < LEVERAGE_TICK_SLOT_COUNT) {
      ticks.push({ label: '', yPx: 0 })
    }
    return ticks
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
                  hover/click/drag/wheel event over the field without touching the field canvas
                  underneath. 07-10-PLAN.md Task 2 adds pointerdown/up (pan-drag tracking) and
                  wheel (zoom toward pointer). */}
              <canvas
                ref={crosshairEl}
                data-testid="heatmap-crosshair-overlay"
                width={HEATMAP_WIDTH_PX}
                height={HEATMAP_HEIGHT_PX}
                style={{ position: 'absolute', top: '0', left: '0', 'touch-action': 'none' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerLeave}
                onClick={handleClick}
                onWheel={handleWheel}
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
              {/* 07-10-PLAN.md Task 2 (D-34): the field's own zoom-aware axis ticks -- plain DOM
                  text, positioned at the SCREEN coordinate the current viewport maps each tick's
                  logical position to, always naming a real grid.meta.entryDates/leverage value
                  (never an interpolated display coordinate). */}
              <div style={{ position: 'absolute', inset: '0', 'pointer-events': 'none' }}>
                <For each={entryDateTicks()}>
                  {(tick) => (
                    <span
                      data-testid="heatmap-axis-tick-entry-date"
                      style={{
                        position: 'absolute',
                        left: `${tick.xPx}px`,
                        bottom: '2px',
                        transform: 'translateX(-50%)',
                        'font-size': '10px',
                        'font-family': 'var(--font-mono)',
                        color: 'var(--color-text-muted)',
                        background: 'var(--color-surface)',
                        padding: '0 2px',
                        'white-space': 'nowrap',
                      }}
                    >
                      {tick.dateStr}
                    </span>
                  )}
                </For>
                <For each={leverageTicks()}>
                  {(tick) => (
                    <span
                      data-testid="heatmap-axis-tick-leverage"
                      style={{
                        position: 'absolute',
                        left: '2px',
                        top: `${tick.yPx}px`,
                        transform: 'translateY(-50%)',
                        'font-size': '10px',
                        'font-family': 'var(--font-mono)',
                        color: 'var(--color-text-muted)',
                        background: 'var(--color-surface)',
                        padding: '0 2px',
                        'white-space': 'nowrap',
                      }}
                    >
                      {tick.label}
                    </span>
                  )}
                </For>
              </div>
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
