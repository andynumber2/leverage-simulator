/**
 * src/sweep/sweep-grid.ts
 *
 * 07-01-PLAN.md Task 2: declares the live sweep grid -- the geometry constants (D-01/D-03) and
 * the typed-array container `sweep.worker.ts` writes into and `paint-contour.ts` reads from.
 * `SWEEP_COLS`/`SWEEP_ROWS` are module constants and are NEVER derived from a URL, a viewport, or
 * a permalink value (T-07-03): no input can drive an unbounded typed-array allocation.
 *
 * `SweepGrid` structurally extends `src/data/sweep-fixture-format.ts`'s `SweepFixture` (same
 * `cols`, `rows`, `meta`, `multiples`, `drawdowns`, `flags` field names and the same row-major
 * indexing), so `src/heatmap/field-sampler.ts` and `iso-lines.ts` -- built against `SweepFixture`
 * -- accept a live `SweepGrid` with no adaptation. It adds `annualized` (a third metric) and
 * `generation` (plan 07-05's staleness check).
 *
 * 07-06-PLAN.md (orchestrator-authorized scope extension): `chunkBufferByteLength`'s wire layout
 * carries `annualized` as a fourth segment, so `grid.annualized` is populated for real by a live
 * sweep -- plan 07-03 computed `annualized` correctly in `computeChunkMetrics` but deliberately
 * left this buffer layout at 3 segments so it would not destabilize `sweep-pool.ts`'s
 * concurrently-edited merge loop (plan 07-05, same wave); wiring the 4th segment through was
 * always this plan's territory, per this file's own prior header note.
 */

import type { SweepFixture, SweepFixtureMeta } from '../data/sweep-fixture-format.ts'

/** D-01/D-03: the live grid's fixed geometry. Never read from a URL, a viewport, or a permalink
 * value (T-07-03) -- these are the only two numbers that determine every typed array's length. */
export const SWEEP_COLS = 200
export const SWEEP_ROWS = 50

/**
 * 07-03-PLAN.md Task 1: the non-finite sentinel `sweep.worker.ts` stores in `annualized[i]` when
 * `solveIrr`/`solveCagr` returns `null` (an undefined bracket or a non-positive initial
 * investment). Never `0`: a genuinely undefined annualized return must never render as a real
 * breakeven cell, which is precisely the failure the diverging scale's `0%/yr` midpoint would
 * otherwise invite. `NaN`, not `Infinity`, because it reads unambiguously as "not a number"
 * rather than as a very large (but real) rate.
 */
export const ANNUALIZED_UNDEFINED = Number.NaN

/** D-01: the leverage axis's fixed bounds, 1x to 5x inclusive. */
export const LEVERAGE_MIN = 1
export const LEVERAGE_MAX = 5

/** The leverage value at grid row `row` (0 to `SWEEP_ROWS - 1`), evenly spaced across
 * `[LEVERAGE_MIN, LEVERAGE_MAX]`. `rowForLeverage` is its exact inverse. */
export function leverageForRow(row: number): number {
  return LEVERAGE_MIN + (row * (LEVERAGE_MAX - LEVERAGE_MIN)) / (SWEEP_ROWS - 1)
}

/** The exact inverse of `leverageForRow`: the fractional row a given `leverage` value falls at
 * (not clamped or rounded -- a caller that needs an integer row index rounds or clamps itself). */
export function rowForLeverage(leverage: number): number {
  return ((leverage - LEVERAGE_MIN) * (SWEEP_ROWS - 1)) / (LEVERAGE_MAX - LEVERAGE_MIN)
}

/** Row-major cell index, the same indexing `SweepFixture`'s own arrays use
 * (`values[row * cols + col]`). */
export function cellIndex(col: number, row: number, cols: number = SWEEP_COLS): number {
  return row * cols + col
}

/**
 * The byte length of a `sweep.worker.ts`/`sweep-pool.ts` chunk result buffer for `cellCount`
 * cells: four contiguous segments, `multiples` (Float32, 4 bytes/cell), `drawdowns` (Float32, 4
 * bytes/cell), `annualized` (Float32, 4 bytes/cell), `flags` (Uint8, 1 byte/cell). Declared here,
 * in the shared geometry module both `sweep.worker.ts` (the Worker side) and `sweep-pool.ts` (the
 * main-thread side) already import safely -- neither imports the other's module as a VALUE (only
 * as a type), since a value import of `sweep.worker.ts` from the main thread would pull
 * `Comlink.expose(...)`'s module-load side effect into the wrong global scope. One shared
 * definition here is what keeps the two sides' buffer layouts from drifting apart.
 */
export function chunkBufferByteLength(cellCount: number): number {
  return (
    cellCount * 4 /* multiples */ + cellCount * 4 /* drawdowns */ + cellCount * 4 /* annualized */ + cellCount /* flags */
  )
}

/**
 * `SweepFixtureMeta` plus the live grid's own hold-mode discriminant. `holdMode: 'fixed'` mirrors
 * `SweepFixtureMeta.holdingYears` being a real, positive value; `holdMode: 'end-of-data'` means
 * every column resolves to whatever bar count that column's own entry date supports, and
 * `holdingYears` is contractually `0` in that mode -- CONSUMERS MUST READ `holdMode` FIRST, so a
 * `0` is never rendered as if it were a real holding period. `endOfDataDate` names the bound
 * (`resolveEntryDateBounds`'s own `lastDate`) an 'end-of-data' sweep resolved against, since
 * `holdingYears` cannot carry that information in this mode.
 */
export interface SweepGridMeta extends SweepFixtureMeta {
  holdMode: 'fixed' | 'end-of-data'
  endOfDataDate: string
}

/**
 * The live, mutable counterpart to `SweepFixture`: same field names and same row-major indexing
 * (`src/heatmap/field-sampler.ts`/`iso-lines.ts` read either interchangeably), plus `annualized`
 * (plan 07-06) and `generation` (plan 07-05's stale-sweep check, carried from day one so that
 * plan is a check against an existing field, not a signature change).
 */
export interface SweepGrid extends Omit<SweepFixture, 'meta'> {
  meta: SweepGridMeta
  annualized: Float32Array
  generation: number
}

/** Preallocates a `SweepGrid`'s four typed arrays (`multiples`, `drawdowns`, `annualized`,
 * `flags`) at `cols * rows` each, zero-filled (the typed array default), with `generation`
 * seeded to `0`. Never called with `cols`/`rows` other than `SWEEP_COLS`/`SWEEP_ROWS` in
 * production -- the parameters exist so `paint-contour.ts`'s grid-size-agnostic renderer (F-07)
 * can be exercised at a deliberately non-default geometry in tests without this module itself
 * ever deriving a size from anything but its own constants.
 */
export function createSweepGrid(cols: number, rows: number, meta: SweepGridMeta): SweepGrid {
  const cellCount = cols * rows
  return {
    cols,
    rows,
    meta,
    multiples: new Float32Array(cellCount),
    drawdowns: new Float32Array(cellCount),
    annualized: new Float32Array(cellCount),
    flags: new Uint8Array(cellCount),
    generation: 0,
  }
}
