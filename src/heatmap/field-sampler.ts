/**
 * src/heatmap/field-sampler.ts
 *
 * 06-03-PLAN.md Task 1: the filled-contour form's base pass (D-02 form 2) needs a smoothly
 * bilinearly resampled field rather than one flat colour per fixture cell, but must never smooth
 * across a ruined or incomplete cell -- that would let a region carrying no value read as a real,
 * merely-poor outcome (PITFALLS E4/E5, T-06-08). This module is the whole geometry surface for
 * that: bilinear interpolation over the fixture's own 200x50 grid, a hard categorical override
 * with a total nearest-cell tie rule, and quantisation into `BAND_LEVELS`' bands (round
 * multiples, not an even split of ramp position -- see that constant's own doc comment) so the
 * filled-contour form reads as discrete SHAPES rather than a smooth gradient (that shape-reading
 * is the entire premise of D-02 form 2 and of PITFALLS E1's hidden-threshold complaint).
 *
 * Plain TypeScript, zero imports outside `src/`, no DOM: `resampleField` and `sampleField` are
 * pure typed-array math, so both run unmodified in the fast Node `unit` project
 * (`tests/field-sampler.test.ts`) and in a browser mockup alike.
 *
 * 07-01-PLAN.md Task 1, D-11: graduated verbatim from
 * `.planning/phases/06-heatmap-design-pass/mockups/shared/field-sampler.ts` into `src/heatmap/`
 * so both the Phase 6 mockups and Phase 7's production renderer consume one copy. No algorithm,
 * constant, tie rule, or exported name changed; only the two five-level relative imports
 * shortened to their new two-level depth from `src/heatmap/`.
 */

import {
  CELL_FLAG_INCOMPLETE,
  CELL_FLAG_RUINED,
  type SweepFixture,
} from '../data/sweep-fixture-format.ts'
import {
  INCOMPLETE_RGBA,
  interpolateRamp,
  rampPositionFor,
  RUIN_BASE_RGBA,
  type Rgba,
} from '../colorscale/value-to-color.ts'

export type Metric = 'multiple' | 'drawdown'

/** D-18/D-20: which categorical branch a display pixel's bilinear stencil resolves to, or
 * `null` when every stencil corner is a plain, valued cell and the continuous band path
 * applies. */
export type CategoricalMask = 'ruined' | 'incomplete' | null

/** Band boundaries in ramp-position space (`rampPositionFor`'s own `[0, 1]` range), defined in
 * MULTIPLE space and converted -- never spaced evenly in `t` directly. `t` is an internal
 * colour-lookup coordinate; spacing boundaries evenly in `t` puts them at unlabellable multiples
 * (evenly spacing eleven points across this module's symlog domain lands boundaries at ~2.51x,
 * ~6.31x, ~15.8x). `BAND_MULTIPLES` is round numbers a reader can name on sight, and
 * `rampPositionFor` converts each to its true (non-uniform) ramp position, the same conversion
 * the legend ticks (`LEGEND_TICK_MULTIPLES` in `value-to-color.ts`) already use.
 *
 * Breakeven (`rampPositionFor(1.0)`, exactly `0.5`) is a member BY CONSTRUCTION -- `1` is one of
 * `BAND_MULTIPLES`' own entries -- rather than by an even-band-count accident, which is the whole
 * premise of the filled-contour form (D-02 form 2) and the fix for PITFALLS E1's hidden-threshold
 * complaint. The leading `0` and trailing `1` preserve the domain's own floor and ceiling, exactly
 * as before, so `bandIndexFor`'s clamping and the ramp's own endpoints are unaffected. `rampPositionFor`
 * is monotonic in its input, so mapping an ascending `BAND_MULTIPLES` produces an ascending
 * sequence; `tests/field-sampler.test.ts` asserts this explicitly rather than assuming it. */
const BAND_MULTIPLES: readonly number[] = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50]
export const BAND_LEVELS: readonly number[] = [0, ...BAND_MULTIPLES.map(rampPositionFor), 1]

const NUM_BANDS = BAND_LEVELS.length - 1

/**
 * Maps a ramp position `t` (0 to 1, clamped otherwise) to its band index (0 to
 * `NUM_BANDS - 1`). A value exactly equal to an interior boundary resolves to the UPPER band
 * (edge assumption A-E3 adjacency requires this tie rule be explicit, not implicit): the loop
 * below tests each band's own upper edge with a strict `<`, so a value equal to that edge falls
 * through into the next band, and only the very last band's upper edge (`t = 1`) is inclusive,
 * via the fallthrough return.
 */
export function bandIndexFor(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  for (let i = 0; i < NUM_BANDS; i++) {
    const upper = BAND_LEVELS[i + 1]!
    if (clamped < upper) return i
  }
  return NUM_BANDS - 1
}

/** One band's representative colour, cached at its CENTRE ramp position (never its edge) so a
 * band's colour is representative of the whole band rather than of a boundary a neighbouring
 * band shares. Built once, at module load, not per pixel -- `resampleField`'s pixel loop only
 * ever indexes into this array, which is what makes T-06-10's "well inside 16ms" disposition
 * hold. Uses `interpolateRamp` directly (the ramp-position-space core `valueToColor`'s own
 * continuous path calls) rather than reconstructing a fake raw metric value and round-tripping
 * it back through `rampPositionFor`: `BAND_LEVELS` is already expressed in ramp-position space,
 * so this is the more direct of the two equivalent routes to the same colour. */
const BAND_COLORS: readonly Rgba[] = Array.from({ length: NUM_BANDS }, (_, i) => {
  const centerT = (BAND_LEVELS[i]! + BAND_LEVELS[i + 1]!) / 2
  return interpolateRamp(centerT)
})

/** A single display pixel's resolved sample, before colour lookup: either a categorical branch
 * (`ruined`/`incomplete`) or a continuous, UNQUANTISED ramp position ready for `bandIndexFor`.
 * Exported (alongside `sampleField`) so the interpolation math is independently testable to the
 * precision `tests/field-sampler.test.ts`'s linearity assertions need, without going through
 * `resampleField`'s band-quantised, byte-rounded RGBA output -- that output's entire point is to
 * be a step function, so it cannot itself carry a 1e-9-precision linearity proof.
 * `resampleField`'s own pixel loop calls this exact function for every pixel: there is no
 * second, independently-drifting copy of this arithmetic. */
export interface FieldSample {
  categorical: CategoricalMask
  /** Ramp position in `[0, 1]`, meaningful only when `categorical` is `null`. */
  rampPosition: number
}

function clampIndex(value: number, max: number): number {
  return Math.min(max, Math.max(0, value))
}

/** The flag byte's categorical branch (D-18 wins over D-20 when a single cell carries both
 * bits, matching `valueToColor`'s own branch order), or `null` for a plain, valued cell. */
function categoricalFor(flags: number): CategoricalMask {
  if ((flags & CELL_FLAG_RUINED) !== 0) return 'ruined'
  if ((flags & CELL_FLAG_INCOMPLETE) !== 0) return 'incomplete'
  return null
}

interface StencilCorner {
  col: number
  row: number
  weight: number
}

/** The bilinear stencil's four corner cells for a fractional grid position (`colF`, `rowF`):
 * `col0`/`row0` are the floored coordinates, `col1`/`row1` one cell over. Every coordinate is
 * clamped into `[0, cols - 1]`/`[0, rows - 1]` (clamp-to-edge), so an edge or out-of-range
 * `colF`/`rowF` still yields four valid, in-bounds corners rather than an out-of-range index --
 * at a grid edge, `col0 === col1` (or `row0 === row1`) and the duplicated corner's weight simply
 * adds together, which degrades gracefully to nearest-value sampling rather than needing a
 * special case. */
/**
 * Allocation-free scratch for the resample hot loop. `resampleField` paints up to a few hundred
 * thousand display pixels per repaint, so the object-per-pixel shape this module used to build
 * (a position object, a four-element corner array, four corner objects and a `FieldSample`) cost
 * roughly a million allocations per frame, and the resulting GC pressure is what pushed form 2's
 * CI measurement to 23.92ms against a 16ms budget while the same code measured 13.64ms on a
 * developer machine. These module-level slots let the hot path compute the identical result
 * writing nothing to the heap.
 *
 * Safe as module state because the sampler is synchronous and single-threaded by construction:
 * nothing yields between `fillStencil` writing these and `sampleFieldInto` reading them.
 */
const stencilCol = new Int32Array(4)
const stencilRow = new Int32Array(4)
const stencilWeight = new Float64Array(4)
let outCategorical: CategoricalMask = null
let outRampPosition = 0

function fillStencil(colF: number, rowF: number, cols: number, rows: number): void {
  const clampedColF = clampIndex(colF, cols - 1)
  const clampedRowF = clampIndex(rowF, rows - 1)
  const col0 = clampIndex(Math.floor(clampedColF), cols - 1)
  const row0 = clampIndex(Math.floor(clampedRowF), rows - 1)
  const col1 = clampIndex(col0 + 1, cols - 1)
  const row1 = clampIndex(row0 + 1, rows - 1)
  const fx = clampedColF - col0
  const fy = clampedRowF - row0
  stencilCol[0] = col0
  stencilRow[0] = row0
  stencilWeight[0] = (1 - fx) * (1 - fy)
  stencilCol[1] = col1
  stencilRow[1] = row0
  stencilWeight[1] = fx * (1 - fy)
  stencilCol[2] = col0
  stencilRow[2] = row1
  stencilWeight[2] = (1 - fx) * fy
  stencilCol[3] = col1
  stencilRow[3] = row1
  stencilWeight[3] = fx * fy
}

/**
 * The single-pixel primitive `resampleField`'s loop calls once per display pixel. Computes the
 * four-corner bilinear stencil at fractional GRID position (`colF`, `rowF`), in the fixture's
 * own (unflipped) row/column indexing.
 *
 * If ANY stencil corner carries a categorical flag (D-18/D-20), returns the categorical branch
 * of the NEAREST such corner, by Euclidean distance from (`colF`, `rowF`) to that corner's own
 * integer grid position -- ties broken toward the lower row, then the lower column, so the rule
 * is total (edge assumption A-E3). No plain, valued corner is ever consulted once any corner in
 * the stencil is categorical: the categorical region has a hard edge, never a smoothed one
 * blended with a valued neighbour.
 *
 * Otherwise, bilinearly interpolates the four corners' own ramp positions
 * (`rampPositionFor` of each corner's `metric` value) and returns the interpolated ramp
 * position, unquantised.
 */
function sampleFieldInto(
  fixture: SweepFixture,
  values: Float32Array | Float64Array | readonly number[],
  rampCache: Float64Array | null,
  colF: number,
  rowF: number,
): void {
  const { cols } = fixture
  fillStencil(colF, rowF, cols, fixture.rows)

  let nearestCol = -1
  let nearestRow = -1
  let nearestMask: CategoricalMask = null
  let nearestDistSq = Number.POSITIVE_INFINITY

  for (let i = 0; i < 4; i++) {
    const cornerCol = stencilCol[i]!
    const cornerRow = stencilRow[i]!
    const index = cornerRow * cols + cornerCol
    const mask = categoricalFor(fixture.flags[index] ?? 0)
    if (mask === null) continue

    const dRow = cornerRow - rowF
    const dCol = cornerCol - colF
    const distSq = dRow * dRow + dCol * dCol

    const closer =
      nearestMask === null ||
      distSq < nearestDistSq ||
      (distSq === nearestDistSq && (cornerRow < nearestRow || (cornerRow === nearestRow && cornerCol < nearestCol)))

    if (closer) {
      nearestCol = cornerCol
      nearestRow = cornerRow
      nearestMask = mask
      nearestDistSq = distSq
    }
  }

  if (nearestMask !== null) {
    outCategorical = nearestMask
    outRampPosition = 0
    return
  }

  let interpolatedT = 0
  for (let i = 0; i < 4; i++) {
    const index = stencilRow[i]! * cols + stencilCol[i]!
    if (rampCache === null) {
      interpolatedT += stencilWeight[i]! * rampPositionFor(values[index] ?? 0)
    } else {
      interpolatedT += stencilWeight[i]! * rampCache[index]!
    }
  }
  outCategorical = null
  outRampPosition = interpolatedT
}

export function sampleField(fixture: SweepFixture, metric: Metric, colF: number, rowF: number): FieldSample {
  const values = metric === 'multiple' ? fixture.multiples : fixture.drawdowns
  sampleFieldInto(fixture, values, null, colF, rowF)
  return { categorical: outCategorical, rampPosition: outRampPosition }
}


/** The display resolution `resampleField` paints at. Only the display pixel size: the source
 * grid's own `cols`/`rows` come from `fixture`, never duplicated here. */
export interface ResampleGeometry {
  widthPx: number
  heightPx: number
}

/**
 * One ramp position per FIXTURE cell, recomputed at the head of every `resampleField` call.
 *
 * Without it the bilinear blend calls `rampPositionFor` (and therefore `Math.log10`) once per
 * stencil corner per display pixel: at form 2's 764x224 field that is roughly 684,000 logarithms
 * per repaint for a field that only holds 10,000 distinct values. Caching per cell makes it
 * 10,000. The arithmetic is unchanged: the blend still sums `weight * rampPositionFor(value)`
 * over the same four corners, it just reads each corner's ramp position instead of recomputing it.
 */
let cachedRampPositions: Float64Array | undefined
let cachedRampCells = -1

function getRampPositions(
  values: Float32Array | Float64Array | readonly number[],
  cellCount: number,
): Float64Array {
  if (cachedRampPositions === undefined || cachedRampCells !== cellCount) {
    cachedRampPositions = new Float64Array(cellCount)
    cachedRampCells = cellCount
  }
  for (let i = 0; i < cellCount; i++) {
    cachedRampPositions[i] = rampPositionFor(values[i] ?? 0)
  }
  return cachedRampPositions
}

let cachedBuffer: Uint8ClampedArray<ArrayBuffer> | undefined
let cachedCols = -1
let cachedRows = -1
let cachedWidthPx = -1
let cachedHeightPx = -1

/** Created once per distinct (`cols`, `rows`, `widthPx`, `heightPx`) combination and reused on
 * every subsequent `resampleField` call at that same geometry -- the measured repaint figure
 * (`bench/heatmap-form-2.bench.test.ts`) must reflect resampling, not allocation, mirroring
 * `bench/canvas-grid.ts`'s `getPutImageDataBuffer` discipline. */
function getBuffer(cols: number, rows: number, widthPx: number, heightPx: number): Uint8ClampedArray<ArrayBuffer> {
  if (
    cachedBuffer === undefined ||
    cachedCols !== cols ||
    cachedRows !== rows ||
    cachedWidthPx !== widthPx ||
    cachedHeightPx !== heightPx
  ) {
    cachedBuffer = new Uint8ClampedArray(widthPx * heightPx * 4)
    cachedCols = cols
    cachedRows = rows
    cachedWidthPx = widthPx
    cachedHeightPx = heightPx
  }
  return cachedBuffer
}

/**
 * Resamples `fixture`'s `metric` array onto a `geometry.widthPx` by `geometry.heightPx` RGBA
 * buffer in one pass: bilinear interpolation (`sampleField`), the categorical override, band
 * quantisation (`bandIndexFor`) and colour lookup (`BAND_COLORS`), and nothing else -- no DOM,
 * no canvas. Returns a reused `Uint8ClampedArray`, so the caller must finish using one call's
 * result (e.g. via `ImageData` + `putImageData`) before calling `resampleField` again at the
 * same geometry.
 */
export function resampleField(
  fixture: SweepFixture,
  metric: Metric,
  geometry: ResampleGeometry,
): Uint8ClampedArray<ArrayBuffer> {
  const { cols, rows } = fixture
  const { widthPx, heightPx } = geometry
  const buffer = getBuffer(cols, rows, widthPx, heightPx)

  // Hoisted out of the pixel loop: `pixelToGridPosition` recomputed both divisions for every
  // pixel, and `sampleField` re-selected the metric array for every pixel. Neither varies.
  const values = metric === 'multiple' ? fixture.multiples : fixture.drawdowns
  const rampCache = getRampPositions(values, cols * rows)
  const cellWidthPx = widthPx / cols
  const cellHeightPx = heightPx / rows
  let pixelIndex = 0

  for (let py = 0; py < heightPx; py++) {
    // The A-E5 vertical flip, unchanged: fixture row 0 (1.00x) paints at the BOTTOM.
    const rowF = rows - 1 - ((py + 0.5) / cellHeightPx - 0.5)
    for (let px = 0; px < widthPx; px++) {
      const colF = (px + 0.5) / cellWidthPx - 0.5
      sampleFieldInto(fixture, values, rampCache, colF, rowF)

      let color: Rgba
      if (outCategorical === 'ruined') {
        color = RUIN_BASE_RGBA
      } else if (outCategorical === 'incomplete') {
        color = INCOMPLETE_RGBA
      } else {
        color = BAND_COLORS[bandIndexFor(outRampPosition)]!
      }

      buffer[pixelIndex] = color[0]
      buffer[pixelIndex + 1] = color[1]
      buffer[pixelIndex + 2] = color[2]
      buffer[pixelIndex + 3] = color[3]
      pixelIndex += 4
    }
  }

  return buffer
}
