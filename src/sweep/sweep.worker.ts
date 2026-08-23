/**
 * src/sweep/sweep.worker.ts
 *
 * 07-01-PLAN.md Task 2: the Comlink-exposed chunk runner. Loads the real compiled bundle once per
 * worker instance (`loadBundleFromFetch`, the same production byte source `src/app/state.ts`
 * uses on the main thread -- `fetch` is available inside a module Worker, so no bundle bytes are
 * ever sent over `postMessage`), then for every chunk it is asked to run: resolves the
 * `KernelSeries` ONCE per column via `resolveColumnSeries`, then calls `runBacktest` once per row
 * against that same series, varying only `params.leverage`. Columns on the outside, rows on the
 * inside -- this ordering is load-bearing for PERF-03, not polish (07-VALIDATION.md).
 *
 * `runBacktest` is the ONLY call into the simulation recurrence: this file never reimplements,
 * approximates, or tunes any part of it, the cost model, or the data bundle (the threat register's
 * `T-07-01`/prohibition).
 *
 * 07-03-PLAN.md Task 1 (METR-06): `computeChunkMetrics` is the one-pass computation -- it writes
 * `multiples`, `drawdowns`, `annualized` and `flags` for every cell from the SAME `runBacktest`
 * call, so a later metric-toggle change never re-runs a backtest. `annualized` follows D-24
 * exactly: resolved ONCE per sweep (never per cell) into a choice between `solveCagr`
 * (`contributionAmount === 0`) and `solveIrr` over `buildCashFlows` (`contributionAmount !== 0`),
 * matching `src/app/state.ts`'s `computeDerivedMetrics` (METR-01/METR-02) rather than re-deriving
 * either formula. `computeChunkMetrics` is a plain, synchronous, Comlink-free function -- exported
 * so `tests/sweep/metrics-one-pass.test.ts` can call it directly in the fast Node `unit` project,
 * against a `LoadedBundle` from `loadBundleFromDisk`, without a real Worker/postMessage boundary.
 *
 * Scope note: `computeChunkMetrics`'s `annualized` output does NOT yet cross the `runChunk`
 * transferable-buffer boundary (`chunkBufferByteLength`'s 3-segment `multiples`/`drawdowns`/
 * `flags` wire layout, shared with `src/sweep/sweep-pool.ts`'s hardcoded parse offsets, is left
 * byte-for-byte unchanged by this plan so a concurrently-executing sibling plan touching
 * `sweep-pool.ts` is not destabilized). Wiring `grid.annualized` from this one-pass computation
 * into the live `SweepGrid` is explicitly out of this plan's `files_modified` and remains, per
 * `sweep-grid.ts`'s own header note, plan 07-06's territory (the metric-toggle plan that first
 * needs `grid.annualized` populated for real).
 *
 * `Comlink.expose(sweepWorkerApi)` below is guarded to run only when `self` exists (a real Worker
 * or browser global context): the Node `unit` test project has no `self`, and `Comlink.expose`'s
 * default `ep = globalThis` would otherwise throw on `ep.addEventListener` at module import time,
 * making `computeChunkMetrics` unimportable from `tests/sweep/metrics-one-pass.test.ts`.
 */

import * as Comlink from 'comlink'

import { runBacktest } from '../kernel/backtest.ts'
import { LONG_GAP_FLAG_MIN_DAYS, type KernelOutputs, type KernelParams } from '../kernel/backtest.types.ts'
import type { LoadedBundle } from '../data/bundle-source.ts'
import { loadBundleFromFetch } from '../data/load-bundle-browser.ts'
import type { ContributionFrequency } from '../data/contribution-schedule.ts'
import { CELL_FLAG_INCOMPLETE, CELL_FLAG_RUINED } from '../data/sweep-fixture-format.ts'
import { solveCagr } from '../metrics/cagr.ts'
import { buildCashFlows, solveIrr, type CashFlow } from '../metrics/irr.ts'
import { toDaysSinceEpoch } from '../../tools/bundle-compiler/src/calendar.ts'
import { ANNUALIZED_UNDEFINED, chunkBufferByteLength, leverageForRow } from './sweep-grid.ts'
import { resolveColumnSeries, type ColumnSeriesRequest } from './resolve-column-series.ts'

/** The subset of `BacktestRequest` that stays constant across an entire sweep -- every cell in
 * the grid shares these; only `leverage` varies per row, computed here from the row index via
 * `leverageForRow` rather than sent on the wire. */
export interface SweepBaseParams {
  symbol: string
  dividendReinvest: boolean
  initialInvestment: number
  contributionAmount: number
  contributionFrequency: ContributionFrequency
  /** Annualized, as a PERCENTAGE, matching `BacktestRequest`'s own units (D-09) -- converted to
   * a fraction here, once per cell, the same point `buildKernelInputs` converts it at. */
  expenseRatioPercent: number
  financingSpreadPercent: number
  /** `null` means hold to the last fully-supported bar (D-29), same meaning as
   * `BacktestRequest.holdingPeriodBars`. */
  holdingPeriodBars: number | null
}

/**
 * One chunk of the sweep grid: an explicit list of entry-date COLUMN indices (paired 1:1 with
 * their resolved `entryDates`, precomputed once on the main thread from
 * `resolveEntryDateBounds`) crossed with an explicit list of leverage ROW indices (the worker
 * derives each row's leverage via `leverageForRow`, never sent on the wire). Explicit index lists
 * rather than a `[start, end)` range so plan 07-05's coarse strided pass needs no shape change,
 * only a different (non-contiguous) index list. `generation` is carried through unused by this
 * task -- plan 07-05's stale-sweep check reads it; this task only threads it so that plan is a
 * check, not a signature change.
 */
export interface SweepChunkRequest {
  generation: number
  params: SweepBaseParams
  /** Absolute column indices into the full `SWEEP_COLS`-wide grid, parallel to `entryDates`. */
  columnIndices: number[]
  /** Entry-date ISO strings for each of `columnIndices`, in the same order. */
  entryDates: string[]
  /** Absolute row indices into the full `SWEEP_ROWS`-tall grid. */
  rowIndices: number[]
}

// The transferred result buffer's layout: three contiguous segments, ordered
// (`columnIndices.length * rowIndices.length` cells each, column-major WITHIN the chunk --
// `cellsInChunk = colPos * rowIndices.length + rowPos`, mirroring the columns-outside/rows-inside
// compute order above so the merge back into the grid needs no re-sort): `multiples` (Float32),
// `drawdowns` (Float32), `flags` (Uint8). `chunkBufferByteLength` (imported from `sweep-grid.ts`,
// shared with `sweep-pool.ts`) computes this layout's total byte length.

let cachedBundle: Promise<LoadedBundle> | null = null

/** Loaded once per worker instance and kept for the worker's whole lifetime (the pool is
 * persistent, `sweep-pool.ts`'s own header note) -- a worker that has already loaded the bundle
 * never re-fetches it for a later chunk or a later sweep. */
function getBundle(): Promise<LoadedBundle> {
  if (cachedBundle === null) {
    cachedBundle = loadBundleFromFetch()
  }
  return cachedBundle
}

// Scratch KernelOutputs, reused across every cell within this worker: allocated lazily, once the
// bundle's own calendar length is known (an upper bound on any column's barCount), and grown only
// if a later call ever needs more -- mirrors bench/sweep.worker.ts's scratchValue/scratchRuined
// discipline. Only runBacktest's returned KernelResult scalars (finalValue, maxDrawdown, ruined)
// feed the sweep's per-cell metrics; the full per-bar arrays are write-only scratch this worker
// never reads back.
let scratchOutValue: Float64Array = new Float64Array(0)
let scratchOutRuined: Uint8Array = new Uint8Array(0)
let scratchOutLongGap: Uint8Array = new Uint8Array(0)

function getScratchOutputs(minLength: number): KernelOutputs {
  if (scratchOutValue.length < minLength) {
    scratchOutValue = new Float64Array(minLength)
    scratchOutRuined = new Uint8Array(minLength)
    scratchOutLongGap = new Uint8Array(minLength)
  }
  return { outValue: scratchOutValue, outRuined: scratchOutRuined, outLongGap: scratchOutLongGap }
}

// Scratch cash-flow array, reused across every cell that takes the `solveIrr` branch within one
// `computeChunkMetrics` call -- SIM-11: `buildCashFlows`'s `reuse` parameter (07-03-PLAN.md Task
// 1) lets this file allocate the array ONCE per chunk rather than once per cell.
let scratchCashFlows: CashFlow[] = []

/** The four typed arrays `computeChunkMetrics` writes, one element per (column, row) pair in the
 * SAME column-outside/row-inside order `request.columnIndices`/`request.rowIndices` name --
 * `cell = colPos * rowIndices.length + rowPos`, mirroring `runChunk`'s wire-buffer layout. */
export interface SweepChunkMetrics {
  multiples: Float32Array
  drawdowns: Float32Array
  /** METR-06: `solveCagr`'s result when `params.contributionAmount === 0`, `solveIrr`'s result
   * over `buildCashFlows` otherwise (D-24) -- resolved once per call, not once per cell. Never
   * `0` for an undefined result: `ANNUALIZED_UNDEFINED` (`sweep-grid.ts`) is stored instead. `0`
   * for an incomplete cell (D-20), matching `multiples`/`drawdowns`. */
  annualized: Float32Array
  flags: Uint8Array
}

/**
 * Runs every (column, row) pair `request` names and computes all three display metrics plus the
 * flag byte for every cell FROM THE SAME `runBacktest` call (METR-06) -- a later metric-toggle
 * change re-colors this same computation rather than re-running it. For each column: resolves its
 * `KernelSeries` ONCE via `resolveColumnSeries`. An `incomplete` resolution (D-28: a fixed hold
 * running past the last supported bar) flags every row in that column `CELL_FLAG_INCOMPLETE` with
 * `0` in every metric array -- `runBacktest` is never called against a truncated series to produce
 * a partial value (D-20). An `ok` resolution runs `runBacktest` once per row, varying only
 * `params.leverage` (via `leverageForRow`), and writes `multiple-of-contributed`
 * (`finalValue / totalContributed`, the same formula `src/app/state.ts`'s `computeDerivedMetrics`
 * uses), `maxDrawdown`, the D-24 annualized metric, and `CELL_FLAG_RUINED` when the run ruined.
 *
 * Pure and synchronous: takes an already-loaded `bundle` rather than calling `getBundle()` itself,
 * so it never touches `fetch` and is directly callable from the Node `unit` test project against
 * `loadBundleFromDisk`'s bundle.
 */
export function computeChunkMetrics(bundle: LoadedBundle, request: SweepChunkRequest): SweepChunkMetrics {
  const colCount = request.columnIndices.length
  const rowCount = request.rowIndices.length
  const cellCount = colCount * rowCount

  const multiples = new Float32Array(cellCount)
  const drawdowns = new Float32Array(cellCount)
  const annualized = new Float32Array(cellCount)
  const flags = new Uint8Array(cellCount)

  const { params } = request
  const expenseRatio = params.expenseRatioPercent / 100
  const financingSpread = params.financingSpreadPercent / 100
  // D-24: decided ONCE per sweep from the request, never per cell -- mirrors METR-01/METR-02's
  // single-run rule (`src/app/state.ts`'s `computeDerivedMetrics`) rather than re-deriving it.
  const useIrr = params.contributionAmount !== 0

  for (let colPos = 0; colPos < colCount; colPos++) {
    const entryDate = request.entryDates[colPos]
    if (entryDate === undefined) {
      throw new Error(`sweep.worker: entryDates[${colPos}] is missing (columnIndices/entryDates length mismatch)`)
    }

    const columnRequest: ColumnSeriesRequest = {
      symbol: params.symbol,
      dividendReinvest: params.dividendReinvest,
      entryDate,
      holdingPeriodBars: params.holdingPeriodBars,
      contributionAmount: params.contributionAmount,
      contributionFrequency: params.contributionFrequency,
    }
    const resolution = resolveColumnSeries(bundle, columnRequest)

    if (resolution.incomplete) {
      // D-28/D-20: every cell in this column is incomplete -- never a partial value in any of
      // the three metric arrays.
      for (let rowPos = 0; rowPos < rowCount; rowPos++) {
        const cell = colPos * rowCount + rowPos
        multiples[cell] = 0
        drawdowns[cell] = 0
        annualized[cell] = 0
        flags[cell] = CELL_FLAG_INCOMPLETE
      }
      continue
    }

    const outputs = getScratchOutputs(resolution.barCount)
    // D-24's CAGR branch shares the same calendar span every row in this column uses -- computed
    // once per column, exactly where `src/app/state.ts`'s single-run path computes it.
    const calendarDays = toDaysSinceEpoch(resolution.lastDate) - toDaysSinceEpoch(resolution.firstDate)

    for (let rowPos = 0; rowPos < rowCount; rowPos++) {
      const row = request.rowIndices[rowPos]
      if (row === undefined) {
        throw new Error(`sweep.worker: rowIndices[${rowPos}] is missing`)
      }
      const leverage = leverageForRow(row)
      const kernelParams: KernelParams = {
        leverage,
        initialInvestment: params.initialInvestment,
        contributionAmount: params.contributionAmount,
        financingSpread,
        expenseRatio,
        longGapMinDays: LONG_GAP_FLAG_MIN_DAYS,
      }

      const result = runBacktest(kernelParams, resolution, outputs)

      const cell = colPos * rowCount + rowPos
      multiples[cell] = result.totalContributed > 0 ? result.finalValue / result.totalContributed : 0
      drawdowns[cell] = result.maxDrawdown
      flags[cell] = result.ruined ? CELL_FLAG_RUINED : 0

      // METR-06/D-24: the SAME `result` this cell's multiple/drawdown/flag came from -- never a
      // second `runBacktest` call, never a re-derived formula.
      const annualizedValue = useIrr
        ? solveIrr(buildCashFlows(kernelParams, resolution, outputs, result, scratchCashFlows))
        : solveCagr(kernelParams.initialInvestment, result.finalValue, calendarDays)
      annualized[cell] = annualizedValue === null ? ANNUALIZED_UNDEFINED : annualizedValue
    }
  }

  return { multiples, drawdowns, annualized, flags }
}

const sweepWorkerApi = {
  /**
   * Writes `computeChunkMetrics`'s `multiples`/`drawdowns`/`flags` into a `ArrayBuffer` view per
   * this file's own `chunkBufferByteLength` layout, and returns the same buffer, transferred
   * rather than cloned. See this file's header for why `annualized` does not yet cross this wire.
   */
  async runChunk(request: SweepChunkRequest, buffer: ArrayBuffer): Promise<ArrayBuffer> {
    const bundle = await getBundle()

    const colCount = request.columnIndices.length
    const rowCount = request.rowIndices.length
    const cellCount = colCount * rowCount
    if (buffer.byteLength !== chunkBufferByteLength(cellCount)) {
      throw new Error(
        `sweep.worker: buffer byteLength (${buffer.byteLength}) does not match the expected layout size ` +
          `(${chunkBufferByteLength(cellCount)}) for ${colCount} columns x ${rowCount} rows`,
      )
    }

    const metrics = computeChunkMetrics(bundle, request)

    const multiplesView = new Float32Array(buffer, 0, cellCount)
    const drawdownsView = new Float32Array(buffer, cellCount * 4, cellCount)
    const flagsView = new Uint8Array(buffer, cellCount * 4 + cellCount * 4, cellCount)
    multiplesView.set(metrics.multiples)
    drawdownsView.set(metrics.drawdowns)
    flagsView.set(metrics.flags)

    return Comlink.transfer(buffer, [buffer])
  },
}

export type SweepWorkerApi = typeof sweepWorkerApi

// Guard: `self` does not exist in the Node `unit` test project, and `Comlink.expose`'s default
// `ep = globalThis` would otherwise throw on `ep.addEventListener` at module import time -- see
// this file's header comment.
if (typeof self !== 'undefined') {
  Comlink.expose(sweepWorkerApi)
}
