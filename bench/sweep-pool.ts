/**
 * bench/sweep-pool.ts — Task 2: real Worker pool partitioning bench/kernel.ts's 10,000-cell sweep
 * (CONTEXT.md D-10). Workers are constructed fresh inside every `runSpikeSweep` call — not reused
 * across `measureMinOfN` repeats — so worker construction cost, one of the costs research
 * hand-waved, is included in every repeat of the measured PERF-03 figure, not hidden after the
 * first. See 01-02-SUMMARY.md for the resolved worker count, chosen chunk count, and reasoning.
 */

import * as Comlink from 'comlink'

import { SWEEP_COLS, SWEEP_ROWS } from './kernel.ts'
import type { ChunkRequest, SweepWorkerApi } from './sweep.worker.ts'

const CELL_COUNT = SWEEP_COLS * SWEEP_ROWS

/** Each worker receives several chunks rather than exactly one (PITFALLS F4), so a single slow
 * worker cannot strand the tail of the sweep — a worker that finishes its chunks early simply
 * pulls the next chunk off the shared queue in `runSpikeSweep` below. */
const CHUNKS_PER_WORKER = 4

/**
 * `navigator.hardwareConcurrency - 1`, floored at a minimum of 1 (T-01-05: never spawn zero
 * workers, and reserve one core for the calling thread so the pool cannot saturate every core).
 */
export function resolveWorkerCount(): number {
  const cores = navigator.hardwareConcurrency || 1
  return Math.max(1, cores - 1)
}

export interface SweepOptions {
  workerCount?: number
}

export interface SweepResult {
  /** The resolved 10,000-cell grid, `grid[row * SWEEP_COLS + col]`. */
  grid: Float64Array
  workerCount: number
  chunkCount: number
}

/**
 * Partitions all `SWEEP_COLS * SWEEP_ROWS` cells across a real Worker pool sized to
 * `resolveWorkerCount()` (or `options.workerCount` if supplied), dispatches chunks via a shared
 * work queue so no worker is idle while chunks remain, and resolves only once the final cell's
 * result has arrived on the calling thread — exactly what PERF-03 specifies as "wall-clock from
 * user action to final cell."
 */
export async function runSpikeSweep(seed: number, options: SweepOptions = {}): Promise<SweepResult> {
  const workerCount = options.workerCount ?? resolveWorkerCount()
  const rawChunkCount = workerCount * CHUNKS_PER_WORKER
  const chunkCount = Math.max(1, Math.min(rawChunkCount, CELL_COUNT))

  const baseChunkSize = Math.floor(CELL_COUNT / chunkCount)
  const remainder = CELL_COUNT % chunkCount

  const chunks: ChunkRequest[] = []
  let cursor = 0
  for (let i = 0; i < chunkCount; i++) {
    const size = baseChunkSize + (i < remainder ? 1 : 0)
    chunks.push({ seed, startCell: cursor, endCellExclusive: cursor + size })
    cursor += size
  }

  const workers: Worker[] = []
  const remotes: Comlink.Remote<SweepWorkerApi>[] = []
  for (let i = 0; i < workerCount; i++) {
    const worker = new Worker(new URL('./sweep.worker.ts', import.meta.url), { type: 'module' })
    workers.push(worker)
    remotes.push(Comlink.wrap<SweepWorkerApi>(worker))
  }

  const grid = new Float64Array(CELL_COUNT)

  try {
    let nextChunkIndex = 0

    async function drainQueue(remote: Comlink.Remote<SweepWorkerApi>): Promise<void> {
      while (nextChunkIndex < chunks.length) {
        const chunkIndex = nextChunkIndex
        nextChunkIndex += 1
        const chunk = chunks[chunkIndex]
        if (!chunk) {
          continue
        }
        const cellsInChunk = chunk.endCellExclusive - chunk.startCell
        const buffer = new ArrayBuffer(cellsInChunk * Float64Array.BYTES_PER_ELEMENT)
        // Transferred, not structured-cloned (PITFALLS F3) — ownership of `buffer` moves to the
        // worker; this thread must not touch `buffer` again after this call.
        const resultBuffer = await remote.runChunk(chunk, Comlink.transfer(buffer, [buffer]))
        const resultView = new Float64Array(resultBuffer)
        grid.set(resultView, chunk.startCell)
      }
    }

    await Promise.all(remotes.map((remote) => drainQueue(remote)))
  } finally {
    for (const worker of workers) {
      worker.terminate()
    }
  }

  return { grid, workerCount, chunkCount }
}
