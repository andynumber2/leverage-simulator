/**
 * src/app/components/ResultColumn/SliceChart.tsx
 *
 * 07-07-PLAN.md Task 1 (D-16): the two marginal 1D cuts through the cached 2D sweep field.
 *
 * `HorizontalSliceChart` (VIZ-01, fixed leverage, sweeping entry date) is a uPlot line chart
 * directly UNDER the heatmap, following `EquityCurveChart.tsx`'s destroy-and-recreate pattern
 * exactly: rebuild on every data/metric/theme change, read stroke/axis colours from CSS custom
 * properties via `getComputedStyle` at render time (canvas gets no free
 * `prefers-color-scheme` styling), subscribe to `onThemeChange`, and measure its own y-axis
 * gutter from the labels uPlot is about to draw (`axisSizeForLabels`/`formatLogAxisValue`,
 * imported from `EquityCurveChart.tsx` rather than re-derived) so the gutter can be reported
 * outward via `onGutterMeasured` -- `HeatmapPanel.tsx` applies that exact pixel value as the
 * field canvas's own left padding, which is what makes "same left gutter width" true BY
 * CONSTRUCTION rather than by matching two independently-guessed numbers. Log scale
 * (`logDecadeSplits`, `distr: 3`) only for the `multiple` metric, which spans the same
 * order-of-magnitude range the equity curve does and can hit the same uPlot log-scale floor
 * that killed the renderer once already; `drawdown`/`annualized` (a signed fraction) are linear.
 *
 * `VerticalSliceChart` (VIZ-02, fixed entry date, sweeping leverage) is a hand-rolled Canvas 2D
 * polyline, a DELIBERATE departure from `07-UI-SPEC.md` section E4's stated uPlot pattern: uPlot's
 * independent variable is always its own x axis and it has no transpose, so a leverage-on-y chart
 * is not a uPlot configuration a CSS transform could fake without also rotating its tick labels.
 * Its row-to-pixel mapping reuses `paint-contour.ts`'s own `gridRowToDisplayY` at the SAME
 * `heightPx`/`rows` the field canvas paints at, so leverage rows line up between the two by
 * construction, and its leverage ticks come from `integerLeverageTicks`, the field's own
 * leverage-axis tick source (`hatch-pattern.ts`), guaranteed to agree with the field's rows.
 *
 * Both charts: a cell flagged `CELL_FLAG_RUINED`/`CELL_FLAG_INCOMPLETE`, or carrying
 * `ANNUALIZED_UNDEFINED`, BREAKS the line at that point rather than interpolating through it --
 * `null` in the uPlot series (a real gap), a lifted pen in the hand-rolled polyline (a new
 * subpath). Both read the CURRENT crosshair cell when one is committed (`crosshairCell()`,
 * 07-08's territory) and otherwise fall back to the current single-run parameters
 * (`backtestRequest().leverage`/`entryDate`, resolved to the nearest grid row/column via the
 * live grid's own `meta.leverages`/`meta.entryDates` -- never `sweep-grid.ts`'s
 * `rowForLeverage`, which assumes the full 50-row axis and would misindex a coarse-pass grid).
 *
 * No em dash characters. Minimized ternaries, never nested.
 */

import { createEffect, createSignal, onCleanup } from 'solid-js'
import uPlot from 'uplot'

import { toDaysSinceEpoch } from '../../../../tools/bundle-compiler/src/calendar.ts'
import { CELL_FLAG_INCOMPLETE, CELL_FLAG_RUINED } from '../../../data/sweep-fixture-format.ts'
import { formatMultiple, formatPercent, formatSignedPercent } from '../../../metrics/format.ts'
import type { SweepMetric } from '../../../colorscale/value-to-color.ts'
import { integerLeverageTicks } from '../../../heatmap/hatch-pattern.ts'
import { gridRowToDisplayY } from '../../../heatmap/paint-contour.ts'
import { ANNUALIZED_UNDEFINED, cellIndex, type SweepGrid } from '../../../sweep/sweep-grid.ts'
import { backtestRequest, crosshairCell } from '../../state.ts'
import { onThemeChange } from '../../theme.ts'
import { axisSizeForLabels, formatLogAxisValue } from './EquityCurveChart.tsx'
import { logDecadeSplits } from './log-axis-splits.ts'

const AXIS_FONT = '12px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace'
const UPLOT_DEFAULT_TICK_SIZE_PX = 10
const UPLOT_DEFAULT_AXIS_GAP_PX = 5

export const HORIZONTAL_SLICE_HEIGHT_PX = 120
export const VERTICAL_SLICE_WIDTH_PX = 160
const VERTICAL_SLICE_VALUE_AXIS_HEIGHT_PX = 24
const VERTICAL_SLICE_LEVERAGE_GUTTER_PX = 40

function readCssColor(customProperty: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(customProperty).trim()
}

/** The metric's own raw value at cell `idx` -- `ANNUALIZED_UNDEFINED` (`NaN`) for `annualized`
 * when the array carries the sentinel, never coerced to `0`. */
function metricValueAt(grid: SweepGrid, metric: SweepMetric, idx: number): number {
  switch (metric) {
    case 'multiple':
      return grid.multiples[idx] ?? 0
    case 'drawdown':
      return grid.drawdowns[idx] ?? 0
    case 'annualized':
      return grid.annualized[idx] ?? ANNUALIZED_UNDEFINED
    default: {
      const exhaustive: never = metric
      throw new Error(`SliceChart: unknown metric "${String(exhaustive)}"`)
    }
  }
}

/** T-07-14: true for a ruined cell, an incomplete-hold cell, or (`annualized` only) a cell
 * carrying the non-finite `ANNUALIZED_UNDEFINED` sentinel -- every case where drawing a line
 * THROUGH the cell would assert a value that was never computed. */
function cellBreaksLine(grid: SweepGrid, metric: SweepMetric, idx: number): boolean {
  const flags = grid.flags[idx] ?? 0
  if ((flags & CELL_FLAG_RUINED) !== 0) return true
  if ((flags & CELL_FLAG_INCOMPLETE) !== 0) return true
  if (metric === 'annualized' && !Number.isFinite(grid.annualized[idx] ?? ANNUALIZED_UNDEFINED)) return true
  return false
}

function formatterForMetric(metric: SweepMetric): (value: number) => string {
  switch (metric) {
    case 'multiple':
      return formatMultiple
    case 'drawdown':
      return formatPercent
    case 'annualized':
      return formatSignedPercent
    default: {
      const exhaustive: never = metric
      throw new Error(`SliceChart: unknown metric "${String(exhaustive)}"`)
    }
  }
}

/** The row whose `grid.meta.leverages` entry is nearest `leverage` -- correct against ANY grid
 * geometry (the coarse pass's strided rows included), unlike `sweep-grid.ts`'s `rowForLeverage`,
 * which assumes the full `SWEEP_ROWS`-tall axis. */
export function nearestRowForLeverage(grid: SweepGrid, leverage: number): number {
  const leverages = grid.meta.leverages
  let best = 0
  let bestDist = Number.POSITIVE_INFINITY
  for (let i = 0; i < leverages.length; i++) {
    const dist = Math.abs((leverages[i] ?? 0) - leverage)
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  return best
}

/** The column whose `grid.meta.entryDates` entry is nearest `entryDate`, by absolute day
 * distance -- same "correct against any grid geometry" reasoning as `nearestRowForLeverage`. */
export function nearestColForEntryDate(grid: SweepGrid, entryDate: string): number {
  const dates = grid.meta.entryDates
  const targetDays = toDaysSinceEpoch(entryDate)
  let best = 0
  let bestDist = Number.POSITIVE_INFINITY
  for (let i = 0; i < dates.length; i++) {
    const candidate = dates[i]
    if (candidate === undefined) continue
    const dist = Math.abs(toDaysSinceEpoch(candidate) - targetDays)
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  return best
}

function clampIndex(value: number, max: number): number {
  return Math.min(max, Math.max(0, value))
}

/** The fixed row the horizontal slice reads: the committed crosshair's row when one exists
 * (clamped into this grid's own bounds, since a coarse-pass grid can be shorter than a
 * previously-committed crosshair's grid), otherwise the nearest row to the current single-run
 * leverage. */
function resolveFixedRow(grid: SweepGrid): number {
  const cell = crosshairCell()
  if (cell !== null) return clampIndex(cell.row, grid.rows - 1)
  return nearestRowForLeverage(grid, backtestRequest().leverage)
}

/** The fixed column the vertical slice reads, mirroring `resolveFixedRow`. */
function resolveFixedCol(grid: SweepGrid): number {
  const cell = crosshairCell()
  if (cell !== null) return clampIndex(cell.col, grid.cols - 1)
  return nearestColForEntryDate(grid, backtestRequest().entryDate)
}

/** One row of `grid`'s own cells, resolved to a uPlot-ready `[xs, ys]` pair: `xs` in uPlot's
 * time-scale unit (seconds since epoch), `ys` carrying `null` at every break (T-07-14). Exported
 * as a pure function, independent of uPlot/the DOM, so the "200 points, read from the grid"
 * VIZ-01 contract is directly testable without mounting a chart. */
export function buildHorizontalSliceSeries(
  grid: SweepGrid,
  metric: SweepMetric,
  row: number,
): { xs: Float64Array; ys: (number | null)[] } {
  const cols = grid.cols
  const xs = new Float64Array(cols)
  const ys: (number | null)[] = new Array(cols)
  for (let col = 0; col < cols; col++) {
    const idx = cellIndex(col, row, cols)
    const dateStr = grid.meta.entryDates[col] ?? ''
    xs[col] = toDaysSinceEpoch(dateStr) * 86_400
    ys[col] = cellBreaksLine(grid, metric, idx) ? null : metricValueAt(grid, metric, idx)
  }
  return { xs, ys }
}

/** One column of `grid`'s own cells, resolved to a plain value array carrying `null` at every
 * break -- the vertical slice's own pure data-preparation step, exported for the same
 * independent-of-canvas testability `buildHorizontalSliceSeries` provides. */
export function buildVerticalSliceValues(grid: SweepGrid, metric: SweepMetric, col: number): (number | null)[] {
  const values: (number | null)[] = new Array(grid.rows)
  for (let row = 0; row < grid.rows; row++) {
    const idx = cellIndex(col, row, grid.cols)
    values[row] = cellBreaksLine(grid, metric, idx) ? null : metricValueAt(grid, metric, idx)
  }
  return values
}

function cssPixelTextMeasurer(font: string): (label: string) => number {
  const ctx = document.createElement('canvas').getContext('2d')
  if (ctx === null) return (label) => label.length * 8
  ctx.font = font
  return (label) => ctx.measureText(label).width
}

export interface HorizontalSliceChartProps {
  /** `null` before any sweep pass has ever resolved (E4 loading) -- renders the same chart shape
   * with zero data points rather than a differently-shaped placeholder. */
  grid: SweepGrid | null
  metric: SweepMetric
  widthPx: number
  /** Reports the settled y-axis gutter width, in CSS px, every time this chart rebuilds --
   * `HeatmapPanel.tsx` applies the same number as the field canvas's own left padding. */
  onGutterMeasured?: (px: number) => void
}

/** VIZ-01: the entry-date slice, one ROW of `props.grid` (`resolveFixedRow`), 200 points at the
 * full pass's geometry. */
export function HorizontalSliceChart(props: HorizontalSliceChartProps) {
  let containerEl: HTMLDivElement | undefined
  let chart: uPlot | undefined

  function rebuildChart(): void {
    if (containerEl === undefined) return
    if (chart !== undefined) {
      chart.destroy()
      chart = undefined
    }

    const grid = props.grid
    const metric = props.metric

    // E4 loading / D-14: no separate spinner or skeleton -- before the first sweep pass has ever
    // resolved, this builds the SAME chart shape (same axes/series config) with zero data points,
    // rather than mounting a differently-shaped placeholder, so the DOM's own element shape never
    // changes across the null-to-coarse transition (proven by
    // tests/app/sweep-progressive.browser.test.ts's DOM-fingerprint assertion).
    let xs: Float64Array
    let ys: (number | null)[]
    if (grid === null) {
      xs = new Float64Array(0)
      ys = []
    } else {
      const row = resolveFixedRow(grid)
      ;({ xs, ys } = buildHorizontalSliceSeries(grid, metric, row))
    }

    const accent = readCssColor('--color-accent')
    const textMuted = readCssColor('--color-text-muted')

    const measureLabel = cssPixelTextMeasurer(AXIS_FONT)
    let settledYAxisSize = 0
    const sizeYAxis = (self: uPlot, values: string[], axisIdx: number, cycleNum: number): number => {
      if (cycleNum > 1) {
        props.onGutterMeasured?.(settledYAxisSize)
        return settledYAxisSize
      }
      const axis = self.axes[axisIdx]
      settledYAxisSize = axisSizeForLabels(
        measureLabel,
        values ?? [],
        axis?.ticks?.size ?? UPLOT_DEFAULT_TICK_SIZE_PX,
        axis?.gap ?? UPLOT_DEFAULT_AXIS_GAP_PX,
      )
      props.onGutterMeasured?.(settledYAxisSize)
      return settledYAxisSize
    }

    const isLog = metric === 'multiple'
    const yAxis: uPlot.Axis = { stroke: textMuted, font: AXIS_FONT, size: sizeYAxis }
    if (isLog) {
      yAxis.splits = (_self, _axisIdx, scaleMin, scaleMax) => logDecadeSplits(scaleMin, scaleMax)
      yAxis.filter = (_self, splits) => splits
      yAxis.values = (_self, splits) => splits.map(formatLogAxisValue)
    } else {
      const format = formatterForMetric(metric)
      yAxis.values = (_self, splits) => splits.map(format)
    }

    const options: uPlot.Options = {
      width: props.widthPx,
      height: HORIZONTAL_SLICE_HEIGHT_PX,
      legend: { show: false },
      scales: {
        x: { time: true },
        y: { distr: isLog ? 3 : 1 },
      },
      series: [{}, { label: metric, stroke: accent, width: 2, points: { show: false } }],
      axes: [{ stroke: textMuted, font: AXIS_FONT }, yAxis],
    }

    chart = new uPlot(options, [xs, ys], containerEl)
  }

  const [themeVersion, setThemeVersion] = createSignal(0)
  const unsubscribeThemeChange = onThemeChange(() => setThemeVersion((v) => v + 1))

  createEffect(() => {
    void props.grid
    void props.metric
    void props.widthPx
    void themeVersion()
    rebuildChart()
  })

  onCleanup(() => {
    chart?.destroy()
    unsubscribeThemeChange()
  })

  return (
    <div
      ref={containerEl}
      class="horizontal-slice-chart"
      data-testid="horizontal-slice-chart"
      style={{ 'margin-top': 'var(--space-sm)', width: `${props.widthPx}px` }}
    />
  )
}

export interface VerticalSliceChartProps {
  /** `null` before any sweep pass has ever resolved (E4 loading) -- the canvas still mounts at
   * its full size, simply blank, so the DOM shape never changes across the null-to-coarse
   * transition. */
  grid: SweepGrid | null
  metric: SweepMetric
  /** The field canvas's own `heightPx` -- the row area paints at exactly this height so
   * `gridRowToDisplayY` maps a row to the identical y coordinate the field itself uses. */
  heightPx: number
}

/** VIZ-02: the leverage slice, one COLUMN of `props.grid` (`resolveFixedCol`), 50 points, a
 * hand-rolled Canvas 2D polyline (this file's own header explains the uPlot departure). */
export function VerticalSliceChart(props: VerticalSliceChartProps) {
  let canvasEl: HTMLCanvasElement | undefined

  function repaint(): void {
    if (canvasEl === undefined) return
    const ctx = canvasEl.getContext('2d')
    if (ctx === null) return

    const grid = props.grid
    const metric = props.metric
    const rowAreaHeightPx = props.heightPx
    const widthPx = VERTICAL_SLICE_WIDTH_PX
    const totalHeightPx = rowAreaHeightPx + VERTICAL_SLICE_VALUE_AXIS_HEIGHT_PX

    canvasEl.width = widthPx
    canvasEl.height = totalHeightPx
    ctx.clearRect(0, 0, widthPx, totalHeightPx)

    // E4 loading / D-14: same-shaped blank canvas, no separate skeleton -- there is nothing to
    // draw before the first sweep pass has resolved.
    if (grid === null) return

    const col = resolveFixedCol(grid)
    const textColor = readCssColor('--color-text')
    const textMuted = readCssColor('--color-text-muted')
    const accent = readCssColor('--color-accent')

    const plotLeft = VERTICAL_SLICE_LEVERAGE_GUTTER_PX
    const plotRight = widthPx - 8

    const values = buildVerticalSliceValues(grid, metric, col)
    let minVal = Number.POSITIVE_INFINITY
    let maxVal = Number.NEGATIVE_INFINITY
    for (const value of values) {
      if (value === null) continue
      if (value < minVal) minVal = value
      if (value > maxVal) maxVal = value
    }
    if (!Number.isFinite(minVal) || !Number.isFinite(maxVal)) {
      minVal = 0
      maxVal = 1
    } else if (minVal === maxVal) {
      minVal -= 1
      maxVal += 1
    }
    const plotWidth = Math.max(1, plotRight - plotLeft)
    const xForValue = (value: number): number => {
      const t = (value - minVal) / (maxVal - minVal)
      return plotLeft + t * plotWidth
    }

    // The polyline: lifts the pen at every break rather than interpolating through it (T-07-14).
    ctx.strokeStyle = accent
    ctx.lineWidth = 2
    ctx.beginPath()
    let penDown = false
    for (let row = 0; row < grid.rows; row++) {
      const value = values[row]
      if (value === null || value === undefined) {
        penDown = false
        continue
      }
      const y = gridRowToDisplayY(row, rowAreaHeightPx, grid.rows)
      const x = xForValue(value)
      if (!penDown) {
        ctx.moveTo(x, y)
        penDown = true
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.stroke()

    // The shared leverage axis (VIZ-02): ticks from `integerLeverageTicks`, the field's own
    // leverage-axis tick source, so this agrees with the field's rows by construction.
    ctx.font = AXIS_FONT
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'right'
    const leverageTicks = integerLeverageTicks(grid.meta.leverages)
    for (const tick of leverageTicks) {
      const y = gridRowToDisplayY(tick.rowF, rowAreaHeightPx, grid.rows)
      ctx.strokeStyle = textMuted
      ctx.beginPath()
      ctx.moveTo(plotLeft - 4, y)
      ctx.lineTo(plotLeft, y)
      ctx.stroke()
      ctx.fillStyle = textMuted
      ctx.fillText(`${tick.leverage}x`, plotLeft - 6, y)
    }

    // This chart's own value axis: three ticks (min, mid, max) below the row area.
    const format = formatterForMetric(metric)
    const valueAxisY = rowAreaHeightPx + 4
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.strokeStyle = textColor
    ctx.beginPath()
    ctx.moveTo(plotLeft, rowAreaHeightPx)
    ctx.lineTo(plotRight, rowAreaHeightPx)
    ctx.stroke()
    for (const value of [minVal, (minVal + maxVal) / 2, maxVal]) {
      const x = xForValue(value)
      ctx.strokeStyle = textMuted
      ctx.beginPath()
      ctx.moveTo(x, rowAreaHeightPx)
      ctx.lineTo(x, rowAreaHeightPx + 4)
      ctx.stroke()
      ctx.fillStyle = textMuted
      ctx.fillText(format(value), x, valueAxisY)
    }
  }

  const [themeVersion, setThemeVersion] = createSignal(0)
  const unsubscribeThemeChange = onThemeChange(() => setThemeVersion((v) => v + 1))

  createEffect(() => {
    void props.grid
    void props.metric
    void props.heightPx
    void themeVersion()
    repaint()
  })

  onCleanup(() => {
    unsubscribeThemeChange()
  })

  return (
    <canvas
      ref={canvasEl}
      class="vertical-slice-chart"
      data-testid="vertical-slice-chart"
      style={{ 'margin-left': 'var(--space-sm)' }}
    />
  )
}
