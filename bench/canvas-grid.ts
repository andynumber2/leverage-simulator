/**
 * bench/canvas-grid.ts — the shared 10,000-cell grid fixture (D-15) both hand-rolled canvas
 * repaint arms measure against.
 *
 * D-15 settles an internal implementation fork with measurement, not assumption: one `fillRect`
 * per cell versus a single `putImageData` pass, on the identical grid. That comparison only
 * means something if the two arms genuinely paint the same picture, so both consume
 * `makeGridValues`'s output through the same `mapValueToRgba` mapping — neither arm can differ
 * in what color a cell should be.
 *
 * Both arms are hand-rolled Canvas 2D, per D-14: research already rejected uPlot (no heatmap
 * mark at all), ECharts and Plotly (documented degradation well under 10,000 cells) and
 * Observable Plot (defaults to SVG, the exact failure mode this cell count triggers) for the
 * heatmap. See `.claude/CLAUDE.md` section "Q2 — Charting". This file adds no charting library
 * dependency.
 */

/** The 10,000-cell grid every phase criterion names: 200 columns by 50 rows. */
export const GRID_COLS = 200
export const GRID_ROWS = 50
export const CELL_COUNT = GRID_COLS * GRID_ROWS

/** Each cell renders as a CELL_SIZE_PX square on the display canvas. Both paint arms and every
 * pixel-sampling assertion share this constant, so the two arms cannot disagree about display
 * geometry. */
export const CELL_SIZE_PX = 4

/** Four integer RGBA channel values, each in the inclusive range 0 to 255. */
export type RgbaColor = readonly [r: number, g: number, b: number, a: number]

/** Deterministic PRNG (mulberry32) so the grid's values are identical across machines and runs,
 * per D-16's determinism requirement for this phase's synthetic input. Moved here from
 * bench/canvas-repaint.bench.test.ts (plan 01-01) so both paint arms and the pure unit tests
 * share one seeded sequence rather than each re-implementing it. */
function mulberry32(seed: number): () => number {
  let state = seed
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** log10 of the smallest and largest values `makeGridValues` produces. The real heatmap's
 * outcome metrics (final value as a multiple of contributed, IRR) span several orders of
 * magnitude, not a uniform [0, 1) range — a uniform grid would exercise neither the same
 * color-mapping nor the same fillStyle-churn profile a production metric will. */
const VALUE_LOG_MIN = -3
const VALUE_LOG_MAX = 3

/**
 * Produces a deterministic Float64Array of CELL_COUNT values, log-uniformly spread across
 * roughly 1e-3 to 1e3. Two calls with the same seed are element-wise identical.
 */
export function makeGridValues(seed: number): Float64Array {
  const rng = mulberry32(seed)
  const values = new Float64Array(CELL_COUNT)
  for (let i = 0; i < CELL_COUNT; i++) {
    const u = rng()
    values[i] = Math.pow(10, VALUE_LOG_MIN + u * (VALUE_LOG_MAX - VALUE_LOG_MIN))
  }
  return values
}

/**
 * The one value-to-color mapping both paint arms use. Pure and deterministic: log10 of `value`
 * (clamped to the range `makeGridValues` produces) is normalized to [0, 1] and linearly
 * interpolated between two hues. The green channel is held fixed at 64 so no `mapValueToRgba`
 * output can ever equal a background color chosen with a different green channel — this is what
 * lets the equivalence assertions in bench/canvas-repaint.bench.test.ts tell a painted cell apart
 * from an unpainted (background) one.
 */
export function mapValueToRgba(value: number): RgbaColor {
  const safeValue = value > 0 ? value : Number.MIN_VALUE
  const logValue = Math.log10(safeValue)
  const clampedLog = Math.min(VALUE_LOG_MAX, Math.max(VALUE_LOG_MIN, logValue))
  const t = (clampedLog - VALUE_LOG_MIN) / (VALUE_LOG_MAX - VALUE_LOG_MIN)
  const r = Math.round(255 * t)
  const g = 64
  const b = Math.round(255 * (1 - t))
  const a = 255
  return [r, g, b, a]
}

/**
 * One `fillRect` call per cell. `values` must have length CELL_COUNT. Allocates nothing beyond
 * the per-cell fillStyle string, which fillRect itself requires — no ImageData or typed array is
 * allocated here.
 */
export function paintFillRect(ctx: CanvasRenderingContext2D, values: Float64Array): void {
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const value = values[row * GRID_COLS + col] ?? 0
      const [r, g, b] = mapValueToRgba(value)
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
      ctx.fillRect(col * CELL_SIZE_PX, row * CELL_SIZE_PX, CELL_SIZE_PX, CELL_SIZE_PX)
    }
  }
}

// --- putImageData arm's reused buffers ------------------------------------------------------
// Created once, on first use, and reused on every subsequent call — the measured figure must
// reflect painting, not allocation. Not created at module load: this module is also imported
// from the fast Node `unit` project (tests/canvas-grid.test.ts), where `document` does not
// exist, and only the pure functions above are exercised there.

let bufferCanvas: HTMLCanvasElement | undefined
let bufferCtx: CanvasRenderingContext2D | undefined
let bufferImageData: ImageData | undefined

function getPutImageDataBuffer(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; imageData: ImageData } {
  if (!bufferCanvas || !bufferCtx || !bufferImageData) {
    const canvas = document.createElement('canvas')
    canvas.width = GRID_COLS
    canvas.height = GRID_ROWS
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('canvas-grid: 2D context unavailable for the putImageData buffer canvas')
    }
    bufferCanvas = canvas
    bufferCtx = ctx
    bufferImageData = ctx.createImageData(GRID_COLS, GRID_ROWS)
  }
  return { canvas: bufferCanvas, ctx: bufferCtx, imageData: bufferImageData }
}

/**
 * Writes one pixel per cell into a GRID_COLS by GRID_ROWS `ImageData`, applies it in a single
 * `putImageData` call to an offscreen buffer canvas of that exact size, then draws that buffer
 * scaled up onto `ctx`'s (display-size) canvas with `imageSmoothingEnabled` set to false so cell
 * edges stay crisp — per `.claude/CLAUDE.md` "Q2 — Charting"'s upscaling note. `values` must have
 * length CELL_COUNT.
 */
export function paintPutImageData(ctx: CanvasRenderingContext2D, values: Float64Array): void {
  const { canvas: buffer, ctx: offscreenCtx, imageData } = getPutImageDataBuffer()
  const data = imageData.data
  for (let i = 0; i < CELL_COUNT; i++) {
    const value = values[i] ?? 0
    const [r, g, b, a] = mapValueToRgba(value)
    const offset = i * 4
    data[offset] = r
    data[offset + 1] = g
    data[offset + 2] = b
    data[offset + 3] = a
  }
  offscreenCtx.putImageData(imageData, 0, 0)

  ctx.imageSmoothingEnabled = false
  ctx.drawImage(buffer, 0, 0, GRID_COLS, GRID_ROWS, 0, 0, ctx.canvas.width, ctx.canvas.height)
}
