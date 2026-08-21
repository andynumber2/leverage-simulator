/**
 * .planning/phases/06-heatmap-design-pass/mockups/shared/mockup-runtime.ts
 *
 * The chrome every one of the four D-02 mockup forms shares -- fixture loading, the D-21/D-22
 * VIZ-10 caveat, the D-24/D-25 legend (continuous ramp plus detached categorical swatches), the
 * D-18 hatch pattern, and the D-06 panel/theme-toggle shell -- so forms 2, 3 and 4 (plans 06-02
 * through 06-05) add only their own paint function.
 *
 * Imports `src/app/styles.css` and `src/colorscale/value-to-color.ts` from `src/` rather than
 * inlining copies (D-28), so a later palette change re-renders every mockup that imports this
 * file. Plain TypeScript served by `vite dev`, no bundler directive, no framework of its own --
 * `src/app/theme.ts` pulls in `solid-js`, which `vite dev` already resolves as an existing
 * dependency and which never reaches `vite build`'s output (this whole directory is outside the
 * root `index.html` entry graph, per this plan's "Resolved before execution" note 1).
 */

import '../../../../../src/app/styles.css'
import {
  currentThemeOverride,
  initTheme,
  nextThemeOverride,
  onThemeChange,
  setThemeOverride,
} from '../../../../../src/app/theme.ts'
import { formatMultiple } from '../../../../../src/metrics/format.ts'
import {
  DOMAIN_LOG_MAX,
  DOMAIN_LOG_MIN,
  INCOMPLETE_RGBA,
  LEGEND_TICK_MULTIPLES,
  RUIN_BASE_RGBA,
  rampPositionFor,
  valueToColor,
  type Rgba,
} from '../../../../../src/colorscale/value-to-color.ts'
import { decodeSweepFixture, type SweepFixture } from '../../../../../src/data/sweep-fixture-format.ts'

const DOMAIN_MIN_MULTIPLE = 10 ** DOMAIN_LOG_MIN
const DOMAIN_MAX_MULTIPLE = 10 ** DOMAIN_LOG_MAX

/** D-22: reframe first, then name the overlap mechanism, within the two-sentence structure
 * D-22 locks. The exact wording is Claude's discretion; the string "independent backtests" must
 * never appear anywhere in it (PITFALLS D5). */
export const VIZ10_CAVEAT_SENTENCES: readonly [string, string] = [
  'The same market history, viewed from every possible starting point.',
  'Adjacent columns share nearly all their data, so this is a sensitivity analysis over one ' +
    'past, not 10,000 independent trials.',
]

/**
 * UI-SPEC E1 error: replaces the entire page body with a visible, non-blank failure block naming
 * `url` and `message`, rather than leaving the page silently blank on a fixture load failure.
 */
function showFixtureLoadFailure(url: string, message: string): void {
  document.body.innerHTML = ''
  const block = document.createElement('div')
  block.setAttribute('data-testid', 'fixture-load-failure')
  block.style.color = '#c4341f'
  block.style.fontFamily = 'system-ui, -apple-system, "Segoe UI", sans-serif'
  block.style.fontSize = '14px'
  block.style.padding = '24px'
  block.style.whiteSpace = 'pre-wrap'
  block.textContent = `Failed to load sweep fixture from "${url}": ${message}`
  document.body.appendChild(block)
}

/**
 * Fetches `url`, decodes it via `decodeSweepFixture`, and returns the result. On a non-OK
 * response or a thrown decode error, replaces the page body with a visible failure block (via
 * `showFixtureLoadFailure`) naming the URL and the error, then rethrows so the caller does not
 * proceed to mount a mockup against a fixture that never loaded.
 */
export async function loadSweepFixture(url: string): Promise<SweepFixture> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }
    const buffer = await response.arrayBuffer()
    return decodeSweepFixture(buffer)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    showFixtureLoadFailure(url, message)
    throw err
  }
}

/**
 * D-21: appends the two `VIZ10_CAVEAT_SENTENCES` as one body-size paragraph, at the exact
 * typography this phase's `06-UI-SPEC.md` locks (`--font-size-body`, `--font-ui`, `1.5`
 * line-height, `--color-text`), with `--space-md` above and below. Wraps (no `white-space:
 * nowrap`, no `text-overflow`, no `max-height`) rather than ever truncating -- the caller budgets
 * layout room for whatever height it needs.
 */
export function renderCaveat(container: HTMLElement): void {
  const p = document.createElement('p')
  p.setAttribute('data-testid', 'viz10-caveat')
  p.style.margin = '0'
  p.style.marginTop = 'var(--space-md)'
  p.style.marginBottom = 'var(--space-md)'
  p.style.fontSize = 'var(--font-size-body)'
  p.style.fontFamily = 'var(--font-ui)'
  p.style.lineHeight = '1.5'
  p.style.color = 'var(--color-text)'
  p.textContent = VIZ10_CAVEAT_SENTENCES.join(' ')
  container.appendChild(p)
}

/**
 * D-18: builds a `CanvasPattern` from a small offscreen tile filled with `rgba` and overdrawn
 * with 45-degree strokes at a 6-display-pixel period and a 2px stroke width (F-03's geometry,
 * Claude's discretion). Three half-overlapping diagonal segments per tile (the main corner-to-
 * corner line plus one partial segment at each of the other two corners) are what keep the
 * diagonal visually continuous once the tile repeats -- a single corner-to-corner stroke alone
 * would break at every tile boundary. Defined in DISPLAY pixels and applied as a fill (typically
 * under a clip path over the union of flagged cells), so it stays legible at any form's own cell
 * size (D-12).
 */
export function makeHatchPattern(ctx: CanvasRenderingContext2D, rgba: Rgba): CanvasPattern {
  const period = 6
  const tile = document.createElement('canvas')
  tile.width = period
  tile.height = period
  const tileCtx = tile.getContext('2d')
  if (!tileCtx) {
    throw new Error('mockup-runtime: 2D context unavailable for the hatch tile')
  }

  const [r, g, b, a] = rgba
  tileCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`
  tileCtx.fillRect(0, 0, period, period)

  tileCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
  tileCtx.lineWidth = 2
  tileCtx.beginPath()
  tileCtx.moveTo(0, period)
  tileCtx.lineTo(period, 0)
  tileCtx.moveTo(-period / 2, period / 2)
  tileCtx.lineTo(period / 2, -period / 2)
  tileCtx.moveTo(period / 2, period * 1.5)
  tileCtx.lineTo(period * 1.5, period / 2)
  tileCtx.stroke()

  const pattern = ctx.createPattern(tile, 'repeat')
  if (!pattern) {
    throw new Error('mockup-runtime: createPattern returned null for the hatch tile')
  }
  return pattern
}

const SWATCH_SIZE_PX = 16
const LEGEND_RAMP_HEIGHT_PX = 16

function makeSwatch(fill: (ctx: CanvasRenderingContext2D) => void, label: string): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.style.display = 'inline-flex'
  wrapper.style.alignItems = 'center'
  wrapper.style.gap = 'var(--space-xs)'

  const canvas = document.createElement('canvas')
  canvas.width = SWATCH_SIZE_PX
  canvas.height = SWATCH_SIZE_PX
  canvas.style.width = `${SWATCH_SIZE_PX}px`
  canvas.style.height = `${SWATCH_SIZE_PX}px`
  canvas.style.display = 'block'
  canvas.style.flexShrink = '0'
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('mockup-runtime: 2D context unavailable for a legend swatch')
  }
  fill(ctx)

  const text = document.createElement('span')
  text.style.fontSize = 'var(--font-size-label)'
  text.style.fontFamily = 'var(--font-ui)'
  text.style.color = 'var(--color-text-muted)'
  text.textContent = label

  wrapper.appendChild(canvas)
  wrapper.appendChild(text)
  return wrapper
}

/**
 * D-24/D-25: the continuous diverging ramp (drawn by evaluating `valueToColor` at each pixel
 * column's own multiple -- the same function the field paints with, at real ramp resolution --
 * not a shortcut through `interpolateRamp` alone), non-uniformly spaced ticks at
 * `LEGEND_TICK_MULTIPLES`'s true symlog positions (via `rampPositionFor`), the fixed-domain end
 * labels (D-16), and the two detached categorical swatches (D-25) separated from the ramp by
 * `--space-sm` of clear gap.
 */
export function renderLegend(container: HTMLElement, width: number): void {
  const legend = document.createElement('div')
  legend.setAttribute('data-testid', 'legend')
  legend.style.display = 'flex'
  legend.style.flexDirection = 'column'
  legend.style.width = `${width}px`

  const rampCanvas = document.createElement('canvas')
  rampCanvas.width = width
  rampCanvas.height = LEGEND_RAMP_HEIGHT_PX
  rampCanvas.style.width = `${width}px`
  rampCanvas.style.height = `${LEGEND_RAMP_HEIGHT_PX}px`
  rampCanvas.style.display = 'block'
  const rampCtx = rampCanvas.getContext('2d')
  if (!rampCtx) {
    throw new Error('mockup-runtime: 2D context unavailable for the legend ramp canvas')
  }
  for (let x = 0; x < width; x++) {
    const t = width > 1 ? x / (width - 1) : 0
    const multiple = 10 ** (DOMAIN_LOG_MIN + t * (DOMAIN_LOG_MAX - DOMAIN_LOG_MIN))
    const [r, g, b, a] = valueToColor({ value: multiple, ruined: false, incomplete: false })
    rampCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`
    rampCtx.fillRect(x, 0, 1, LEGEND_RAMP_HEIGHT_PX)
  }
  legend.appendChild(rampCanvas)

  const ticksRow = document.createElement('div')
  ticksRow.setAttribute('data-testid', 'legend-ticks')
  ticksRow.style.position = 'relative'
  ticksRow.style.height = '32px'
  ticksRow.style.width = `${width}px`
  ticksRow.style.marginTop = 'var(--space-xs)'
  ticksRow.style.fontFamily = 'var(--font-mono)'

  for (const multiple of LEGEND_TICK_MULTIPLES) {
    const t = rampPositionFor(multiple)
    const x = t * width
    const emphasised = multiple === 1

    const tick = document.createElement('div')
    tick.style.position = 'absolute'
    tick.style.left = `${x}px`
    tick.style.top = '0'
    tick.style.transform = 'translateX(-50%)'
    tick.style.display = 'flex'
    tick.style.flexDirection = 'column'
    tick.style.alignItems = 'center'
    tick.style.gap = 'var(--space-xs)'

    const mark = document.createElement('div')
    mark.style.width = '1px'
    mark.style.height = '4px'
    mark.style.background = emphasised ? 'var(--color-text)' : 'var(--color-text-muted)'

    const label = document.createElement('span')
    label.style.fontSize = 'var(--font-size-label)'
    label.style.whiteSpace = 'nowrap'
    label.style.fontWeight = emphasised ? '600' : '400'
    label.style.color = emphasised ? 'var(--color-text)' : 'var(--color-text-muted)'
    label.textContent = formatMultiple(multiple)

    tick.appendChild(mark)
    tick.appendChild(label)
    ticksRow.appendChild(tick)
  }
  legend.appendChild(ticksRow)

  const domainRow = document.createElement('div')
  domainRow.setAttribute('data-testid', 'legend-domain-ends')
  domainRow.style.display = 'flex'
  domainRow.style.justifyContent = 'space-between'
  domainRow.style.width = `${width}px`
  domainRow.style.fontSize = 'var(--font-size-label)'
  domainRow.style.fontFamily = 'var(--font-mono)'
  domainRow.style.color = 'var(--color-text-muted)'

  const domainMinLabel = document.createElement('span')
  domainMinLabel.textContent = `${formatMultiple(DOMAIN_MIN_MULTIPLE)} and below`
  const domainMaxLabel = document.createElement('span')
  domainMaxLabel.textContent = `${formatMultiple(DOMAIN_MAX_MULTIPLE)} and above`
  domainRow.appendChild(domainMinLabel)
  domainRow.appendChild(domainMaxLabel)
  legend.appendChild(domainRow)

  const swatchesRow = document.createElement('div')
  swatchesRow.setAttribute('data-testid', 'legend-swatches')
  swatchesRow.style.display = 'flex'
  swatchesRow.style.gap = 'var(--space-md)'
  swatchesRow.style.marginTop = 'var(--space-sm)'

  const ruinSwatch = makeSwatch((ctx) => {
    const pattern = makeHatchPattern(ctx, RUIN_BASE_RGBA)
    ctx.fillStyle = pattern
    ctx.fillRect(0, 0, SWATCH_SIZE_PX, SWATCH_SIZE_PX)
  }, 'Ruined: position reached zero')

  const incompleteSwatch = makeSwatch((ctx) => {
    const [r, g, b, a] = INCOMPLETE_RGBA
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`
    ctx.fillRect(0, 0, SWATCH_SIZE_PX, SWATCH_SIZE_PX)
  }, 'Holding period incomplete')

  swatchesRow.appendChild(ruinSwatch)
  swatchesRow.appendChild(incompleteSwatch)
  legend.appendChild(swatchesRow)

  container.appendChild(legend)
}

/**
 * The fractional fixture row (0 at `leverages[0]`, `leverages.length - 1` at the last entry)
 * whose value equals `target`, via linear interpolation between the two entries bracketing it.
 * Assumes `leverages` is monotonically ascending (D-08's fixture construction), but does NOT
 * assume EVEN spacing between rows -- this still works if a future fixture's leverage axis is
 * not evenly stepped. Out-of-range `target` clamps to the nearest end index rather than
 * extrapolating.
 */
export function fixtureRowForLeverage(leverages: readonly number[], target: number): number {
  const n = leverages.length
  if (n === 0) return 0
  const first = leverages[0]!
  const last = leverages[n - 1]!
  if (target <= first) return 0
  if (target >= last) return n - 1
  for (let i = 0; i < n - 1; i++) {
    const a = leverages[i]!
    const b = leverages[i + 1]!
    if (target >= a && target <= b) {
      const span = b - a
      const t = span === 0 ? 0 : (target - a) / span
      return i + t
    }
  }
  return n - 1
}

/**
 * Integer leverage values spanning `leverages`' own actual range (`Math.ceil` of the minimum to
 * `Math.floor` of the maximum, inclusive), each paired with its fractional fixture row position
 * via `fixtureRowForLeverage`. D-08 fixes 50 rows over 1x-5x, but this derives the label set and
 * placement from the fixture's own meta rather than hardcoding either the row count or the 1/5
 * bounds, so it stays correct if D-08's own range is ever revisited. Integer leverages do NOT, in
 * general, land on exact row indices (1x-5x over 50 rows steps by 4/49), so callers place each
 * label by interpolating its VALUE to a pixel position, never by picking a nearest row.
 */
export function integerLeverageTicks(
  leverages: readonly number[],
): ReadonlyArray<{ leverage: number; rowF: number }> {
  if (leverages.length === 0) return []
  const first = leverages[0]!
  const last = leverages[leverages.length - 1]!
  const start = Math.ceil(first)
  const end = Math.floor(last)
  const ticks: Array<{ leverage: number; rowF: number }> = []
  for (let leverage = start; leverage <= end; leverage++) {
    ticks.push({ leverage, rowF: fixtureRowForLeverage(leverages, leverage) })
  }
  return ticks
}

/** A form's own display geometry (D-12): pixel size of its canvas and the logical cell grid it
 * represents. `widthPx`/`heightPx` are the canvas's CSS (display) pixel dimensions, not
 * necessarily `cols * cellSizePx` for every form -- forms whose geometry is not a uniform grid
 * (e.g. a contour form) still declare the display pixel size their canvas actually renders at. */
export interface MockupGeometry {
  cols: number
  rows: number
  cellSizePx: number
  widthPx: number
  heightPx: number
}

export interface MountMockupOptions {
  title: string
  geometry: MockupGeometry
  /** Called once on initial mount and again on every theme flip (D-06): canvas gets no free
   * `prefers-color-scheme` styling, so this is the one repaint hook every mockup needs. */
  paint: (ctx: CanvasRenderingContext2D) => void
}

/**
 * Builds the panel (title, canvas at the form's own geometry, caveat, legend), calls `initTheme()`
 * and subscribes via `onThemeChange` so the canvas repaints on a theme flip, and renders a theme
 * toggle button wired to `setThemeOverride(nextThemeOverride(currentThemeOverride()))`. Panel
 * padding is `var(--space-lg)`.
 */
export function mountMockup(options: MountMockupOptions): void {
  const { title, geometry, paint } = options

  const panel = document.createElement('div')
  panel.setAttribute('data-testid', 'mockup-panel')
  panel.style.padding = 'var(--space-lg)'
  panel.style.display = 'inline-flex'
  panel.style.flexDirection = 'column'
  panel.style.gap = 'var(--space-md)'
  panel.style.background = 'var(--color-surface)'
  panel.style.border = '1px solid var(--color-border)'
  panel.style.borderRadius = '4px'

  const headerRow = document.createElement('div')
  headerRow.style.display = 'flex'
  headerRow.style.alignItems = 'center'
  headerRow.style.justifyContent = 'space-between'
  headerRow.style.gap = 'var(--space-md)'

  const heading = document.createElement('h2')
  heading.style.margin = '0'
  heading.style.fontSize = 'var(--font-size-body)'
  heading.style.fontWeight = '600'
  heading.style.color = 'var(--color-text)'
  heading.textContent = title

  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'theme-toggle'
  toggle.setAttribute('data-testid', 'theme-toggle')
  const setToggleLabel = () => {
    toggle.textContent = `theme: ${currentThemeOverride()}`
  }
  setToggleLabel()
  toggle.addEventListener('click', () => {
    setThemeOverride(nextThemeOverride(currentThemeOverride()))
    setToggleLabel()
  })

  headerRow.appendChild(heading)
  headerRow.appendChild(toggle)
  panel.appendChild(headerRow)

  const canvas = document.createElement('canvas')
  canvas.setAttribute('data-testid', 'mockup-canvas')
  canvas.width = geometry.widthPx
  canvas.height = geometry.heightPx
  canvas.style.width = `${geometry.widthPx}px`
  canvas.style.height = `${geometry.heightPx}px`
  canvas.style.display = 'block'
  panel.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('mockup-runtime: 2D context unavailable for the mockup canvas')
  }

  const caveatContainer = document.createElement('div')
  panel.appendChild(caveatContainer)
  renderCaveat(caveatContainer)

  const legendContainer = document.createElement('div')
  panel.appendChild(legendContainer)
  renderLegend(legendContainer, geometry.widthPx)

  document.body.appendChild(panel)

  initTheme()
  onThemeChange(() => paint(ctx))
  paint(ctx)
}
