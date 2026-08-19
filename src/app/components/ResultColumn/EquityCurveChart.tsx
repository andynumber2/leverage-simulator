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
 */

import 'uplot/dist/uPlot.min.css'

import { createEffect, onCleanup } from 'solid-js'
import uPlot from 'uplot'

import type { KernelInputs } from '../../../data/kernel-inputs.ts'
import type { KernelResult } from '../../../kernel/backtest.types.ts'
import type { ScaleMode } from '../../state.ts'

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
    const accent = readCssColor('--color-accent')
    const textMuted = readCssColor('--color-text-muted')

    // uPlot allots the y axis a fixed 50 CSS px unless told otherwise, which clips any equity
    // value wider than that (a seven-figure final value at 12px mono needs well over 60px), so
    // the gutter is measured from the labels uPlot is about to draw rather than guessed.
    // `cycleNum > 1` is uPlot's convergence bail-out: resizing the axis changes the plot area,
    // which can change the splits, which re-invokes this -- returning the settled width breaks
    // the feedback loop.
    let settledYAxisSize = 0
    const sizeYAxis = (self: uPlot, values: string[], axisIdx: number, cycleNum: number): number => {
      if (cycleNum > 1) return settledYAxisSize
      const axis = self.axes[axisIdx]
      self.ctx.font = AXIS_FONT
      settledYAxisSize = axisSizeForLabels(
        // uPlot's canvas is scaled by devicePixelRatio, so measureText returns device pixels
        // while `size` is expected in CSS pixels.
        (label) => self.ctx.measureText(label).width / (devicePixelRatio || 1),
        values ?? [],
        axis?.ticks?.size ?? UPLOT_DEFAULT_TICK_SIZE_PX,
        axis?.gap ?? UPLOT_DEFAULT_AXIS_GAP_PX,
      )
      return settledYAxisSize
    }

    const options: uPlot.Options = {
      width: containerEl.clientWidth || 800,
      height: CHART_HEIGHT_PX,
      scales: {
        x: { time: true },
        y: { distr: props.scale === 'log' ? 3 : 1 },
      },
      series: [
        {},
        {
          label: 'Equity',
          stroke: accent,
          width: 2,
          points: { show: false },
        },
      ],
      axes: [
        { stroke: textMuted, font: AXIS_FONT },
        { stroke: textMuted, font: AXIS_FONT, size: sizeYAxis },
      ],
    }

    chart = new uPlot(options, [xs, ys], containerEl)
  }

  createEffect(() => {
    // Re-track every prop that changes what gets drawn, so a scale toggle or a new result
    // rebuilds the chart. uPlot requires updating the scale config (not just data) for a distr
    // change to take effect (Pattern 4), so this tracer rebuilds the instance outright rather
    // than patching setScale/setData on an existing one.
    void props.scale
    void props.result
    void props.inputs
    rebuildChart()
  })

  onCleanup(() => {
    chart?.destroy()
  })

  return <div ref={containerEl} class="equity-curve-chart" data-testid="equity-curve-chart" />
}
