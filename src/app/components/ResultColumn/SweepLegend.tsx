/**
 * src/app/components/ResultColumn/SweepLegend.tsx
 *
 * 07-07-PLAN.md Task 2: reimplements
 * `.planning/phases/06-heatmap-design-pass/mockups/shared/mockup-runtime.ts`'s `renderLegend`
 * layout as a Solid component -- the mockup builds DOM strings and mounts them once, the
 * production app is Solid-reactive throughout, so this is a reimplementation of the LAYOUT, not a
 * graduation of the function itself. Reads the SAME underlying constants the mockup reads
 * (`value-to-color.ts`) so nothing here is re-typed or re-tuned.
 *
 * One legend SLOT, two continuous variants, swapped by `props.metric`:
 *
 * - Diverging (`multiple`/`annualized`, `06-HEATMAP-SPEC.md` section 5, unchanged): the
 *   continuous ramp plus `legendTicksForMetric`'s five ticks at their TRUE (non-uniform) ramp
 *   positions, the metric's own breakeven tick emphasised (`emphasizedBandLevelFor`). `multiple`
 *   ALSO gets a separate domain-end row (`"0.01x and below"`/`"100.00x and above"`, mirroring the
 *   mockup's own `legend-domain-ends` row exactly) because `legendTicksForMetric('multiple')`
 *   itself only carries the five interior `LEGEND_TICK_MULTIPLES` labels, unlike `annualized`,
 *   whose five ticks already carry the clipped-domain wording in their own first/last labels (see
 *   that function's own doc comment) -- rendering a second domain-end row for `annualized` would
 *   duplicate what its ticks row already states.
 * - Sequential (`drawdown`, D-25, new this phase): the violet ramp plus `legendTicksForMetric`'s
 *   five ticks (`0%` through `"80% and above"`), NONE emphasised -- a sequential scale has no
 *   breakeven-equivalent threshold to call out; the absence of emphasis is the adaptation, not an
 *   omission (`07-CONTEXT.md`'s own Claude's-Discretion note).
 *
 * Both variants are followed by the SAME two DETACHED categorical swatches, separated from the
 * ramp by `var(--space-sm)`, so the gap itself stays the detached signal (D-25) under every
 * metric. The hatched swatch uses `makeHatchPattern` with `RUIN_BASE_RGBA` so its texture matches
 * the field's exactly.
 *
 * Both derive entirely from the metric's fixed domain, never from swept data, so the legend
 * renders complete at first paint and never lags the field it explains -- no `sweepGrid()`/
 * `onThemeChange` dependency: the ramp's own RGBA values and the categorical swatch colours are
 * fixed constants unchanged by theme (D-15), so there is nothing here a theme flip would need to
 * repaint; every colour a theme DOES affect (tick/label text) is a `var(--color-*)` reference the
 * browser already resolves live with no JS repaint needed.
 *
 * No em dash characters. Minimized ternaries, never nested.
 */

import { createEffect, For, onMount, Show } from 'solid-js'

import { formatMultiple } from '../../../metrics/format.ts'
import {
  DOMAIN_LOG_MAX,
  DOMAIN_LOG_MIN,
  emphasizedBandLevelFor,
  INCOMPLETE_RGBA,
  interpolateRamp,
  interpolateSequentialRamp,
  legendTicksForMetric,
  RUIN_BASE_RGBA,
  scaleTypeForMetric,
  type SweepMetric,
} from '../../../colorscale/value-to-color.ts'
import { makeHatchPattern } from '../../../heatmap/hatch-pattern.ts'

export const LEGEND_WIDTH_PX = 800
const LEGEND_RAMP_HEIGHT_PX = 16
const SWATCH_SIZE_PX = 16

const DOMAIN_MIN_MULTIPLE = 10 ** DOMAIN_LOG_MIN
const DOMAIN_MAX_MULTIPLE = 10 ** DOMAIN_LOG_MAX

/** A ramp position "equal" to the metric's own emphasised level, within floating-point rounding
 * -- both sides are produced by the same underlying `rampPositionForMetric` call (once via
 * `legendTicksForMetric`, once via `emphasizedBandLevelFor`) at an identical input value, so this
 * tolerance only guards against float noise, never a genuine near-miss. */
function isEmphasized(rampPosition: number, emphasizedLevel: number | null): boolean {
  if (emphasizedLevel === null) return false
  return Math.abs(rampPosition - emphasizedLevel) < 1e-9
}

interface LegendSwatchProps {
  draw: (ctx: CanvasRenderingContext2D) => void
  label: string
}

/** A DETACHED categorical swatch: fixed RGBA, painted once on mount (never theme-reactive, see
 * this file's header). */
function LegendSwatch(props: LegendSwatchProps) {
  let canvasEl: HTMLCanvasElement | undefined

  onMount(() => {
    if (canvasEl === undefined) return
    const ctx = canvasEl.getContext('2d')
    if (ctx === null) return
    props.draw(ctx)
  })

  return (
    <div class="legend-swatch" style={{ display: 'inline-flex', 'align-items': 'center', gap: 'var(--space-xs)' }}>
      <canvas
        ref={canvasEl}
        width={SWATCH_SIZE_PX}
        height={SWATCH_SIZE_PX}
        style={{ width: `${SWATCH_SIZE_PX}px`, height: `${SWATCH_SIZE_PX}px`, display: 'block', 'flex-shrink': '0' }}
      />
      <span
        data-testid="legend-swatch-label"
        style={{ 'font-size': 'var(--font-size-label)', 'font-family': 'var(--font-ui)', color: 'var(--color-text-muted)' }}
      >
        {props.label}
      </span>
    </div>
  )
}

export interface SweepLegendProps {
  metric: SweepMetric
}

export function SweepLegend(props: SweepLegendProps) {
  let rampCanvasEl: HTMLCanvasElement | undefined

  function paintRamp(): void {
    if (rampCanvasEl === undefined) return
    const ctx = rampCanvasEl.getContext('2d')
    if (ctx === null) return
    const ramp = scaleTypeForMetric(props.metric) === 'sequential' ? interpolateSequentialRamp : interpolateRamp
    for (let x = 0; x < LEGEND_WIDTH_PX; x++) {
      const t = LEGEND_WIDTH_PX > 1 ? x / (LEGEND_WIDTH_PX - 1) : 0
      const [r, g, b, a] = ramp(t)
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`
      ctx.fillRect(x, 0, 1, LEGEND_RAMP_HEIGHT_PX)
    }
  }

  onMount(() => paintRamp())
  // Repaints the ramp whenever the active metric changes -- the ramp's one genuinely reactive
  // input (see this file's header for why theme is not tracked here).
  createEffect(() => {
    void props.metric
    paintRamp()
  })

  const ticks = () => legendTicksForMetric(props.metric)
  const emphasizedLevel = () => emphasizedBandLevelFor(props.metric)
  const showDomainEnds = () => props.metric === 'multiple'

  return (
    <div class="sweep-legend" data-testid="sweep-legend" style={{ width: `${LEGEND_WIDTH_PX}px` }}>
      <canvas
        ref={rampCanvasEl}
        data-testid="legend-ramp"
        width={LEGEND_WIDTH_PX}
        height={LEGEND_RAMP_HEIGHT_PX}
        style={{ width: `${LEGEND_WIDTH_PX}px`, height: `${LEGEND_RAMP_HEIGHT_PX}px`, display: 'block' }}
      />

      <div
        class="legend-ticks"
        data-testid="legend-ticks"
        style={{ position: 'relative', height: '32px', 'margin-top': 'var(--space-xs)', 'font-family': 'var(--font-mono)' }}
      >
        <For each={ticks()}>
          {(tick) => {
            const emphasized = isEmphasized(tick.rampPosition, emphasizedLevel())
            const x = tick.rampPosition * LEGEND_WIDTH_PX
            const tickColor = emphasized ? 'var(--color-text)' : 'var(--color-text-muted)'
            return (
              <div
                class="legend-tick"
                data-testid="legend-tick"
                style={{
                  position: 'absolute',
                  left: `${x}px`,
                  top: '0',
                  transform: 'translateX(-50%)',
                  display: 'flex',
                  'flex-direction': 'column',
                  'align-items': 'center',
                  gap: 'var(--space-xs)',
                }}
              >
                <div style={{ width: '1px', height: '4px', background: tickColor }} />
                <span
                  style={{
                    'font-size': 'var(--font-size-label)',
                    'white-space': 'nowrap',
                    'font-weight': emphasized ? '600' : '400',
                    color: tickColor,
                  }}
                >
                  {tick.label}
                </span>
              </div>
            )
          }}
        </For>
      </div>

      <Show when={showDomainEnds()}>
        <div
          class="legend-domain-ends"
          data-testid="legend-domain-ends"
          style={{
            display: 'flex',
            'justify-content': 'space-between',
            width: `${LEGEND_WIDTH_PX}px`,
            'font-size': 'var(--font-size-label)',
            'font-family': 'var(--font-mono)',
            color: 'var(--color-text-muted)',
          }}
        >
          <span>{`${formatMultiple(DOMAIN_MIN_MULTIPLE)} and below`}</span>
          <span>{`${formatMultiple(DOMAIN_MAX_MULTIPLE)} and above`}</span>
        </div>
      </Show>

      <div
        class="legend-swatches"
        data-testid="legend-swatches"
        style={{ display: 'flex', gap: 'var(--space-md)', 'margin-top': 'var(--space-sm)' }}
      >
        <LegendSwatch
          draw={(ctx) => {
            const pattern = makeHatchPattern(ctx, RUIN_BASE_RGBA)
            ctx.fillStyle = pattern
            ctx.fillRect(0, 0, SWATCH_SIZE_PX, SWATCH_SIZE_PX)
          }}
          label="Ruined: position reached zero"
        />
        <LegendSwatch
          draw={(ctx) => {
            const [r, g, b, a] = INCOMPLETE_RGBA
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`
            ctx.fillRect(0, 0, SWATCH_SIZE_PX, SWATCH_SIZE_PX)
          }}
          label="Holding period incomplete"
        />
      </div>
    </div>
  )
}
