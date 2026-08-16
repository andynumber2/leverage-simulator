/**
 * bench/sweep.worker.ts: Task 2, the Comlink-exposed chunk runner that executes bench/kernel.ts's
 * `runSpikeBacktest` inside a real Web Worker. Imports `runSpikeBacktest` and
 * `makeSeededGbmSeries` directly (rather than re-implementing anything) so there is exactly one
 * recurrence implementation in this phase: bench/sweep-pool.ts never computes a backtest itself.
 *
 * Comlink API surface used here (verified against node_modules/comlink's own .d.ts, since
 * RESEARCH.md tags its Comlink description LOW confidence): `Comlink.expose(obj)` on the worker
 * side, `Comlink.transfer<T>(obj, transfers)` to mark a value for transfer rather than structured
 * clone. Both directions of this worker's buffer traffic are transferred, not cloned (PITFALLS
 * F3): the caller transfers the pre-sized result buffer in, and this file transfers the same
 * buffer back out once it has been written into.
 */

import * as Comlink from 'comlink'

import { paramsForCell, runSpikeBacktest, SWEEP_COLS } from './kernel.ts'
import { BAR_COUNT, makeSeededGbmSeries, type SyntheticSeries } from './synthetic-data.ts'

export interface ChunkRequest {
  seed: number
  startCell: number
  endCellExclusive: number
}

// Cached per worker instance, keyed by seed, so repeated chunk requests against the same seed
// (the common case: one runSpikeSweep call dispatches many chunks, all against the same seed)
// don't regenerate the 25,000-bar series per chunk. A worker is not reused across separate
// runSpikeSweep calls/repeats (see bench/sweep-pool.ts and 01-02-SUMMARY.md), so this cache's
// lifetime is exactly one sweep call.
let cachedSeed: number | null = null
let cachedSeries: SyntheticSeries | null = null

function getSeriesForSeed(seed: number): SyntheticSeries {
  if (cachedSeed !== seed || !cachedSeries) {
    cachedSeries = makeSeededGbmSeries(seed)
    cachedSeed = seed
  }
  return cachedSeries
}

// Scratch output buffers reused across cells within this worker: the kernel itself is
// allocation-free per bar (PITFALLS F1); reusing the scratch buffers across cells keeps this
// worker's own dispatch loop allocation-free too.
const scratchValue = new Float64Array(BAR_COUNT)
const scratchRuined = new Uint8Array(BAR_COUNT)

const sweepWorkerApi = {
  /**
   * Computes each cell in `[startCell, endCellExclusive)` and writes its `finalValue` into a
   * `Float64Array` view of `buffer`, indexed by `cell - startCell`. Returns the same buffer,
   * transferred rather than cloned, so the caller can reclaim it with zero copy cost.
   */
  runChunk(request: ChunkRequest, buffer: ArrayBuffer): ArrayBuffer {
    const series = getSeriesForSeed(request.seed)
    const out = new Float64Array(buffer)
    for (let cell = request.startCell; cell < request.endCellExclusive; cell++) {
      const row = Math.floor(cell / SWEEP_COLS)
      const col = cell % SWEEP_COLS
      const params = paramsForCell(row, col)
      const result = runSpikeBacktest(params, series, scratchValue, scratchRuined)
      out[cell - request.startCell] = result.finalValue
    }
    return Comlink.transfer(buffer, [buffer])
  },
}

export type SweepWorkerApi = typeof sweepWorkerApi

Comlink.expose(sweepWorkerApi)
