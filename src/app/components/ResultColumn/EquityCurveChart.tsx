/**
 * src/app/components/ResultColumn/EquityCurveChart.tsx
 *
 * Renders one uPlot instance for the resolved run's equity curve. The y scale uses uPlot's
 * native distribution setting -- `distr: 3` (logarithmic) when `props.scale` is 'log' and
 * `distr: 1` (linear) when 'linear' -- never a hand-transformed base-10-logarithm value and never
 * a custom tick formatter, because uPlot ships both (04-RESEARCH.md Pattern 4). Stroke/axis colors
 * are read from `--color-accent` / `--color-text-muted` via `getComputedStyle` at render time,
 * since canvas gets no free `prefers-color-scheme` styling.
 *
 * Pitfall 3 (04-RESEARCH.md): a ruined run's `outValue` is clamped to exactly 0 at and after the
 * ruin bar (D-22/D-23); feeding that 0 into a log-scaled series either throws inside uPlot's
 * range computation or renders a nonsensical spike, so the plotted series stops at the last bar
 * before ruin rather than including the clamped zero bars.
 *
 * Phase 4 plan 02 (E6 error, D-07): a ruined run adds a second uPlot series, points-only, drawn
 * at the last plotted bar's own date and value in `--color-destructive` -- the terminator marker.
 * It never carries the ruin bar's own zero value (log scale still cannot plot zero); the
 * `RuinBanner` above the chart is what names the exact ruin date. The scale toggle stays
 * available in the ruined state.
 *
 * Plan 04-08 (D-19/VIZ-11): subscribes to `onThemeChange` and bumps a local `themeVersion` signal
 * on every theme change, tracked by the same `createEffect` below that already rebuilds on a
 * scale/result/inputs change. `rebuildChart` already destroys and recreates the uPlot instance on
 * every call (rather than patching `setScale`/`setData` on an existing one), which is exactly the
 * "recreate the instance" path 04-RESEARCH.md's assumption A4 says is acceptable when a partial
 * update cannot be confirmed -- no separate theme-specific code path is needed, the existing
 * rebuild already re-reads `--color-accent`/`--color-text-muted` fresh via `getComputedStyle`.
 */

import 'uplot/dist/uPlot.min.css'

import { createEffect, createSignal, onCleanup } from 'solid-js'
import uPlot from 'uplot'

import type { KernelInputs } from '../../../data/kernel-inputs.ts'
import type { KernelResult } from '../../../kernel/backtest.types.ts'
import { onThemeChange } from '../../theme.ts'
import type { ScaleMode } from '../../state.ts'
import { logDecadeSplits } from './log-axis-splits.ts'

/** A log-axis tick value's base-10 exponent at or below this is formatted with
 * `toExponential(0)` rather than `toLocaleString()` -- uPlot's default `numAxisVals` formatter
 * goes through `Intl.NumberFormat` with 3 maximum fraction digits, which renders every value
 * below 1e-4 as the identical string "0" (a real failure mode on the NDX 10x repro, whose
 * plotted equity bottoms out below 1e-22). This threshold, and the +13 threshold below, are
 * chosen so the landing run's ordinary equity magnitudes keep their existing grouped-decimal
 * labels, which is what keeps the gutter tracer.browser.test.ts measures wider than uPlot's
 * 50px default. */
const LOG_AXIS_EXPONENTIAL_LOWER_EXPONENT = -4
const LOG_AXIS_EXPONENTIAL_UPPER_EXPONENT = 13

/** Formats one log-axis split value: DELIBERATE ADDITION beyond the locked custom-splits fix,
 * needed because uPlot's default formatter collapses every sub-1e-4 decade to the string "0"
 * (see the constants above). Ordinary equity magnitudes keep their existing grouped-decimal
 * form; only the extreme decades this bug fix newly reaches switch to exponential notation. */
export function formatLogAxisValue(value: number): string {
  const exponent = Math.log10(Math.abs(value))
  if (exponent <= LOG_AXIS_EXPONENTIAL_LOWER_EXPONENT || exponent >= LOG_AXIS_EXPONENTIAL_UPPER_EXPONENT) {
    return value.toExponential(0)
  }
  return value.toLocaleString()
}

const AXIS_FONT = '12px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace'
const CHART_HEIGHT_PX = 360

/** uPlot's fallbacks for `axis.ticks.size` and `axis.gap`, used when an axis has not overridden
 * them and uPlot's own defaults are not yet reflected on the axis object. */
const UPLOT_DEFAULT_TICK_SIZE_PX = 10
const UPLOT_DEFAULT_AXIS_GAP_PX = 5

/**
 * Width the y-axis gutter needs to draw `values` without clipping: the widest label plus the
 * tick length and the label/baseline gap.
 *
 * Split out from the uPlot hook below so it can be tested against a stub measurer -- the
 * clipping bug it fixes is a width computation, not a canvas behaviour.
 */
export function axisSizeForLabels(
  measureWidth: (label: string) => number,
  values: readonly string[],
  tickSizePx: number,
  gapPx: number,
): number {
  let widest = 0
  for (const value of values) {
    const width = measureWidth(value)
    if (width > widest) widest = width
  }
  return Math.ceil(tickSizePx + gapPx + widest)
}

/**
 * Measures label widths in CSS pixels, which is the unit uPlot's `axis.size` is expressed in.
 *
 * Deliberately a private context rather than uPlot's own, for two reasons:
 *
 * 1. uPlot caches the last font it assigned (`setFontStyle` skips the assignment when the font
 *    string is unchanged), so writing to `chart.ctx.font` behind its back desyncs that cache and
 *    can leave a later label drawn in the wrong size.
 * 2. uPlot scales its canvas and its axis font by `pxRatio`, so measuring there returns device
 *    pixels that then have to be divided back down. Measuring here with the CSS-sized font keeps
 *    the result in CSS pixels with no device-pixel-ratio arithmetic to get wrong -- which matters
 *    because uPlot recomputes axis sizes on `dppxchange`, so a ratio error only shows up after
 *    the window moves to a display with a different ratio.
 */
function cssPixelTextMeasurer(font: string): (label: string) => number {
  const ctx = document.createElement('canvas').getContext('2d')
  if (ctx === null) return (label) => label.length * 8 // no 2d context: over-estimate, never clip
  ctx.font = font
  return (label) => ctx.measureText(label).width
}

export interface EquityCurveChartProps {
  inputs: KernelInputs
  result: KernelResult
  calendar: Int32Array
  scale: ScaleMode
}

function readCssColor(customProperty: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(customProperty).trim()
}

/** Builds the plottable [x, y] series, in seconds-since-epoch (uPlot's time-axis unit) and raw
 * equity values, truncated before any ruin-clamped zero bar (Pitfall 3). */
function buildSeriesData(props: EquityCurveChartProps): [Float64Array, Float64Array] {
  const { inputs, result, calendar } = props
  const { outValue } = inputs.outputs
  const entryAbsIndex = inputs.window.entryIndex
  const barCount = inputs.window.barCount

  const plottableBars = result.ruined && result.ruinBarIndex >= 0 ? result.ruinBarIndex : barCount

  const xs = new Float64Array(plottableBars)
  const ys = new Float64Array(plottableBars)
  for (let k = 0; k < plottableBars; k++) {
    const days = calendar[entryAbsIndex + k] ?? 0
    xs[k] = days * 86_400 // uPlot's time scale wants seconds since epoch, not days.
    ys[k] = outValue[k] ?? 0
  }
  return [xs, ys]
}

/** Builds the ruin terminator series (E6 error): `null` everywhere except the last plotted
 * index, where it carries that same bar's own value -- never the ruin bar's clamped 0 (log scale
 * still cannot plot zero). Returns `undefined` for a run that never ruined, so no third series is
 * added to the chart at all. */
function buildTerminatorData(ys: Float64Array, ruined: boolean): (number | null)[] | undefined {
  if (!ruined || ys.length === 0) return undefined
  const data: (number | null)[] = new Array(ys.length).fill(null)
  data[ys.length - 1] = ys[ys.length - 1] ?? null
  return data
}

export function EquityCurveChart(props: EquityCurveChartProps) {
  let containerEl: HTMLDivElement | undefined
  let chart: uPlot | undefined

  function rebuildChart(): void {
    if (containerEl === undefined) return
    if (chart !== undefined) {
      chart.destroy()
      chart = undefined
    }

    const [xs, ys] = buildSeriesData(props)
    const ruined = props.result.ruined && props.result.ruinBarIndex >= 0
    const terminatorData = buildTerminatorData(ys, ruined)
    const accent = readCssColor('--color-accent')
    const textMuted = readCssColor('--color-text-muted')
    const destructive = readCssColor('--color-destructive')

    // uPlot allots the y axis a fixed 50 CSS px unless told otherwise, which clips any equity
    // value wider than that (a seven-figure final value at 12px mono needs well over 60px), so
    // the gutter is measured from the labels uPlot is about to draw rather than guessed.
    // `cycleNum > 1` is uPlot's convergence bail-out: resizing the axis changes the plot area,
    // which can change the splits, which re-invokes this -- returning the settled width breaks
    // the feedback loop.
    const measureLabel = cssPixelTextMeasurer(AXIS_FONT)
    let settledYAxisSize = 0
    const sizeYAxis = (self: uPlot, values: string[], axisIdx: number, cycleNum: number): number => {
      if (cycleNum > 1) return settledYAxisSize
      const axis = self.axes[axisIdx]
      settledYAxisSize = axisSizeForLabels(
        measureLabel,
        values ?? [],
        axis?.ticks?.size ?? UPLOT_DEFAULT_TICK_SIZE_PX,
        axis?.gap ?? UPLOT_DEFAULT_AXIS_GAP_PX,
      )
      return settledYAxisSize
    }

    const equitySeries: uPlot.Series = {
      label: 'Equity',
      stroke: accent,
      width: 2,
      points: { show: false },
    }
    // E6 error / D-07: the terminator series carries a value only at the last plotted index, so
    // there is nowhere for a connecting line to draw -- only the single destructive-colored point
    // renders. The ruin bar's own clamped 0 never enters either series.
    const ruinSeries: uPlot.Series = {
      label: 'Ruin',
      points: { show: true, size: 8, stroke: destructive, fill: destructive },
    }

    const series: uPlot.Series[] = terminatorData !== undefined ? [{}, equitySeries, ruinSeries] : [{}, equitySeries]
    const data: uPlot.AlignedData = terminatorData !== undefined ? [xs, ys, terminatorData] : [xs, ys]

    const isLog = props.scale === 'log'

    // The log branch gets its own loop-safe decade splits plus an identity filter -- uPlot
    // installs `log10AxisValsFilt` by default for a distr-3/log-10 scale (uPlot.esm.js:3777),
    // which blanks any split that is not a 1eN value at the granularity it expects, so an
    // identity filter is required, not optional, for the generated splits to survive to the
    // canvas. The linear branch stays exactly as it was, with none of these three keys, so it
    // keeps uPlot's own splits/filter/values defaults untouched.
    const yAxis: uPlot.Axis = { stroke: textMuted, font: AXIS_FONT, size: sizeYAxis }
    if (isLog) {
      yAxis.splits = (_self, _axisIdx, scaleMin, scaleMax) => logDecadeSplits(scaleMin, scaleMax)
      yAxis.filter = (_self, splits) => splits
      yAxis.values = (_self, splits) => splits.map(formatLogAxisValue)
    }

    const options: uPlot.Options = {
      width: containerEl.clientWidth || 800,
      height: CHART_HEIGHT_PX,
      scales: {
        x: { time: true },
        y: { distr: isLog ? 3 : 1 },
      },
      series,
      axes: [{ stroke: textMuted, font: AXIS_FONT }, yAxis],
    }

    chart = new uPlot(options, data, containerEl)
  }

  // D-19/VIZ-11: bumped by onThemeChange below, tracked by the createEffect underneath so a
  // theme change rebuilds the chart the same way a scale toggle or a new result does.
  const [themeVersion, setThemeVersion] = createSignal(0)
  const unsubscribeThemeChange = onThemeChange(() => setThemeVersion((v) => v + 1))

  createEffect(() => {
    // Re-track every prop that changes what gets drawn, so a scale toggle or a new result
    // rebuilds the chart. uPlot requires updating the scale config (not just data) for a distr
    // change to take effect (Pattern 4), so this tracer rebuilds the instance outright rather
    // than patching setScale/setData on an existing one. themeVersion is tracked for the same
    // reason: canvas gets no free prefers-color-scheme styling, so a theme change must rebuild
    // too, which re-reads --color-accent/--color-text-muted fresh via getComputedStyle.
    void props.scale
    void props.result
    void props.inputs
    void themeVersion()
    rebuildChart()
  })

  onCleanup(() => {
    chart?.destroy()
    unsubscribeThemeChange()
  })

  return <div ref={containerEl} class="equity-curve-chart" data-testid="equity-curve-chart" />
}
