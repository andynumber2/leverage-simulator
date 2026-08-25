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
 *
 * 07-01-PLAN.md Task 1, D-11/Pitfall 7: `makeHatchPattern`, `integerLeverageTicks` and
 * `VIZ10_CAVEAT_SENTENCES` graduated out to `src/heatmap/hatch-pattern.ts` and
 * `src/heatmap/sweep-copy.ts` and are re-imported from there, so each has exactly one definition
 * shared with Phase 7's production renderer. `renderLegend`, `renderCaveat`, `mountMockup` and
 * `loadSweepFixture` stay here: they are DOM/fetch-facing mockup-page scaffolding, not pure
 * geometry or copy.
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
} from '../../../../../src/colorscale/value-to-color.ts'
import { decodeSweepFixture, type SweepFixture } from '../../../../../src/data/sweep-fixture-format.ts'
import { integerLeverageTicks, makeHatchPattern } from '../../../../../src/heatmap/hatch-pattern.ts'
import { VIZ10_CAVEAT_SENTENCES } from '../../../../../src/heatmap/sweep-copy.ts'

const DOMAIN_MIN_MULTIPLE = 10 ** DOMAIN_LOG_MIN
const DOMAIN_MAX_MULTIPLE = 10 ** DOMAIN_LOG_MAX

export { VIZ10_CAVEAT_SENTENCES, integerLeverageTicks, makeHatchPattern }

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
