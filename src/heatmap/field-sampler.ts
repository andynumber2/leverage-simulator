/**
 * src/heatmap/field-sampler.ts
 *
 * 06-03-PLAN.md Task 1: the filled-contour form's base pass (D-02 form 2) needs a smoothly
 * bilinearly resampled field rather than one flat colour per fixture cell, but must never smooth
 * across a ruined or incomplete cell -- that would let a region carrying no value read as a real,
 * merely-poor outcome (PITFALLS E4/E5, T-06-08). This module is the whole geometry surface for
 * that: bilinear interpolation over the fixture's own 200x50 grid, a hard categorical override
 * with a total nearest-cell tie rule, and quantisation into per-metric bands (round multiples,
 * not an even split of ramp position -- see `bandLevelsForMetric`'s own doc comment) so the
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
 *
 * 07-02-PLAN.md Task 3: `Metric` widens to `value-to-color.ts`'s `SweepMetric` (kept as an
 * exported alias, so this module's own exported name never changes), and this module stops
 * choosing a ramp or a band-boundary array itself -- every per-metric decision (which array to
 * sample, which ramp to colour through, which band boundaries to quantise into) now routes
 * through `value-to-color.ts`'s `rampPositionForMetric`/`bandLevelsForMetric`, the "one colour
 * authority" this plan's `key_links` names. `BAND_LEVELS`/`BAND_MULTIPLES`/`bandIndexFor`'s tie
 * rule and the categorical override order are untouched: they remain the `multiple` metric's own
 * definitions, and `bandIndexFor` gains an optional second parameter (defaulting to `BAND_LEVELS`)
 * so every existing single-argument call site keeps its exact prior behaviour.
 */

import {
  CELL_FLAG_INCOMPLETE,
  CELL_FLAG_RUINED,
  type SweepFixture,
} from '../data/sweep-fixture-format.ts'
import {
  bandLevelsForMetric,
  INCOMPLETE_RGBA,
  interpolateRamp,
  interpolateSequentialRamp,
  rampPositionFor,
  rampPositionForMetric,
  RUIN_BASE_RGBA,
  scaleTypeForMetric,
  type Rgba,
  type SweepMetric,
} from '../colorscale/value-to-color.ts'

/** 07-02-PLAN.md Task 3: an alias, not a new type -- this module's own exported name is
 * unchanged, but it now spans all three swept metrics (`value-to-color.ts`'s `SweepMetric`),
 * `annualized` included. */
export type Metric = SweepMetric

/** A `SweepFixture`-shaped source with an OPTIONAL `annualized` array, so both a plain,
 * fixture-loaded fixture (the Phase 6 mockups, `bench/heatmap-form-2.bench.test.ts` -- neither
 * ever samples the `annualized` metric, and neither carries that array) and a live
 * `src/sweep/sweep-grid.ts` `SweepGrid` (which always carries one, D-25/D-26) satisfy this
 * module's functions with no adaptation. Sampling `annualized` against a source that lacks the
 * array throws (`valuesForMetric`), rather than silently reading `undefined` into the field. */
export interface FieldSource extends SweepFixture {
  annualized?: Float32Array
}

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
 * sequence; `tests/field-sampler.test.ts` asserts this explicitly rather than assuming it.
 *
 * 07-02-PLAN.md Task 3: kept exactly as-is -- these are the `multiple` metric's own boundaries,
 * unexported `BAND_MULTIPLES` and exported `BAND_LEVELS` both "stay exported unchanged for
 * existing callers" (paint-contour.ts, the Phase 6 mockups). `value-to-color.ts`'s
 * `bandLevelsForMetric('multiple')` duplicates this same round-number array independently (its
 * own doc comment explains why it cannot import this one) and produces byte-identical ramp
 * positions via the same `rampPositionFor`. */
const BAND_MULTIPLES: readonly number[] = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50]
export const BAND_LEVELS: readonly number[] = [0, ...BAND_MULTIPLES.map(rampPositionFor), 1]

/**
 * Maps a ramp position `t` (0 to 1, clamped otherwise) to its band index (0 to
 * `levels.length - 2`). A value exactly equal to an interior boundary resolves to the UPPER band
 * (edge assumption A-E3 adjacency requires this tie rule be explicit, not implicit): the loop
 * below tests each band's own upper edge with a strict `<`, so a value equal to that edge falls
 * through into the next band, and only the very last band's upper edge (`t = 1`) is inclusive,
 * via the fallthrough return.
 *
 * 07-02-PLAN.md Task 3: `levels` defaults to `BAND_LEVELS` (the `multiple` metric's own
 * boundaries), so every existing single-argument call site (this module's own tests included)
 * keeps its exact prior behaviour untouched. `resampleField` now always passes an explicit
 * `bandLevelsForMetric(metric)` array, resolved once per call, never per pixel.
 */
export function bandIndexFor(t: number, levels: readonly number[] = BAND_LEVELS): number {
  const numBands = levels.length - 1
  const clamped = Math.min(1, Math.max(0, t))
  for (let i = 0; i < numBands; i++) {
    const upper = levels[i + 1]!
    if (clamped < upper) return i
  }
  return numBands - 1
}

/** One band's representative colour per metric, cached at its CENTRE ramp position (never its
 * edge) so a band's colour is representative of the whole band rather than of a boundary a
 * neighbouring band shares. Built once per distinct metric (`getBandColors`), not per pixel --
 * `resampleField`'s pixel loop only ever indexes into this cache, which is what makes T-06-10's
 * "well inside 16ms" disposition hold. Uses `interpolateRamp`/`interpolateSequentialRamp`
 * directly (the ramp-position-space core `valueToColor`'s own continuous path calls) rather than
 * reconstructing a fake raw metric value and round-tripping it back through
 * `rampPositionForMetric`: `bandLevelsForMetric`'s output is already expressed in ramp-position
 * space, so this is the more direct of the two equivalent routes to the same colour. */
const bandColorsCache = new Map<SweepMetric, readonly Rgba[]>()

function getBandColors(metric: SweepMetric, levels: readonly number[]): readonly Rgba[] {
  const cached = bandColorsCache.get(metric)
  if (cached !== undefined) return cached

  const ramp = scaleTypeForMetric(metric) === 'sequential' ? interpolateSequentialRamp : interpolateRamp
  const numBands = levels.length - 1
  const colors: Rgba[] = Array.from({ length: numBands }, (_, i) => {
    const centerT = (levels[i]! + levels[i + 1]!) / 2
    return ramp(centerT)
  })
  bandColorsCache.set(metric, colors)
  return colors
}

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

/** 07-02-PLAN.md Task 3: the metric-to-array selection, gaining the `annualized` case reading
 * `fixture.annualized`. Throws, naming the metric, when `annualized` is requested against a
 * source that carries no such array (a plain Phase-6-mockup `SweepFixture`) -- fail-loud rather
 * than silently sampling `undefined` into the field. */
function valuesForMetric(
  fixture: FieldSource,
  metric: SweepMetric,
): Float32Array | Float64Array | readonly number[] {
  switch (metric) {
    case 'multiple':
      return fixture.multiples
    case 'drawdown':
      return fixture.drawdowns
    case 'annualized':
      if (fixture.annualized === undefined) {
        throw new Error(
          `field-sampler: metric 'annualized' requires fixture.annualized, but this fixture/grid has none`,
        )
      }
      return fixture.annualized
    default: {
      const exhaustive: never = metric
      throw new Error(`field-sampler: unknown metric "${String(exhaustive)}"`)
    }
  }
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
 * (`rampPositionForMetric` of each corner's `metric` value) and returns the interpolated ramp
 * position, unquantised.
 */
function sampleFieldInto(
  fixture: SweepFixture,
  values: Float32Array | Float64Array | readonly number[],
  rampCache: Float64Array | null,
  metric: SweepMetric,
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
      interpolatedT += stencilWeight[i]! * rampPositionForMetric(values[index] ?? 0, metric)
    } else {
      interpolatedT += stencilWeight[i]! * rampCache[index]!
    }
  }
  outCategorical = null
  outRampPosition = interpolatedT
}

export function sampleField(fixture: FieldSource, metric: Metric, colF: number, rowF: number): FieldSample {
  const values = valuesForMetric(fixture, metric)
  sampleFieldInto(fixture, values, null, metric, colF, rowF)
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
 * Without it the bilinear blend calls `rampPositionForMetric` (and therefore, for `multiple`,
 * `Math.log10`) once per stencil corner per display pixel: at form 2's 764x224 field that is
 * roughly 684,000 logarithms per repaint for a field that only holds 10,000 distinct values.
 * Caching per cell makes it 10,000. The arithmetic is unchanged: the blend still sums
 * `weight * rampPositionForMetric(value, metric)` over the same four corners, it just reads each
 * corner's ramp position instead of recomputing it.
 */
let cachedRampPositions: Float64Array | undefined
let cachedRampCells = -1

function getRampPositions(
  values: Float32Array | Float64Array | readonly number[],
  cellCount: number,
  metric: SweepMetric,
): Float64Array {
  if (cachedRampPositions === undefined || cachedRampCells !== cellCount) {
    cachedRampPositions = new Float64Array(cellCount)
    cachedRampCells = cellCount
  }
  for (let i = 0; i < cellCount; i++) {
    cachedRampPositions[i] = rampPositionForMetric(values[i] ?? 0, metric)
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
 * quantisation (`bandIndexFor`) and colour lookup (`getBandColors`), and nothing else -- no DOM,
 * no canvas. Returns a reused `Uint8ClampedArray`, so the caller must finish using one call's
 * result (e.g. via `ImageData` + `putImageData`) before calling `resampleField` again at the
 * same geometry.
 *
 * 07-02-PLAN.md Task 3: `metric`'s array, ramp and band boundaries are all resolved via
 * `value-to-color.ts` (`valuesForMetric`, `getBandColors`/`scaleTypeForMetric`,
 * `bandLevelsForMetric`) once per call, before the pixel loop -- this function never picks a
 * ramp or a domain itself.
 */
export function resampleField(
  fixture: FieldSource,
  metric: Metric,
  geometry: ResampleGeometry,
): Uint8ClampedArray<ArrayBuffer> {
  const { cols, rows } = fixture
  const { widthPx, heightPx } = geometry
  const buffer = getBuffer(cols, rows, widthPx, heightPx)

  // Hoisted out of the pixel loop: `pixelToGridPosition` recomputed both divisions for every
  // pixel, and the metric's array/ramp/band-levels selection re-ran for every pixel.
  const values = valuesForMetric(fixture, metric)
  const rampCache = getRampPositions(values, cols * rows, metric)
  const levels = bandLevelsForMetric(metric)
  const bandColors = getBandColors(metric, levels)
  const cellWidthPx = widthPx / cols
  const cellHeightPx = heightPx / rows
  let pixelIndex = 0

  for (let py = 0; py < heightPx; py++) {
    // The A-E5 vertical flip, unchanged: fixture row 0 (1.00x) paints at the BOTTOM.
    const rowF = rows - 1 - ((py + 0.5) / cellHeightPx - 0.5)
    for (let px = 0; px < widthPx; px++) {
      const colF = (px + 0.5) / cellWidthPx - 0.5
      sampleFieldInto(fixture, values, rampCache, metric, colF, rowF)

      let color: Rgba
      if (outCategorical === 'ruined') {
        color = RUIN_BASE_RGBA
      } else if (outCategorical === 'incomplete') {
        color = INCOMPLETE_RGBA
      } else {
        color = bandColors[bandIndexFor(outRampPosition, levels)]!
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
