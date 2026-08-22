/**
 * src/sweep/sweep-pool.ts
 *
 * 07-01-PLAN.md Task 2: the persistent Worker pool that runs a sweep against `sweep.worker.ts`.
 * `createSweepPool()` constructs its workers ONCE and keeps them alive for the pool's whole
 * lifetime -- unlike `bench/sweep-pool.ts`'s benchmark precedent (which constructs and tears down
 * workers on every measured call so worker-construction cost is included in the timing), this
 * production pool outlives any single sweep, so `runSweep` never calls `worker.terminate()`.
 *
 * Reuses `bench/sweep-pool.ts`'s three proven shapes: `workerCountForCores` (the
 * `hardwareConcurrency - 1` floor-at-1 rule), the `CHUNKS_PER_WORKER` queue-draining partition (a
 * worker that finishes its chunks early pulls the next one off the shared queue, so a single slow
 * worker cannot strand the tail), and `watchWorkerFailure` attached before any chunk is
 * dispatched. Every chunk buffer transfers in both directions via `Comlink.transfer`, never
 * structured-cloned (key_links).
 *
 * This task's pool runs one sweep at a time and merges every chunk's result into the caller's
 * `SweepGrid` before resolving; the generation-staleness check (skipping a merge from a
 * superseded sweep) is plan 07-05's work -- `SweepChunkRequest.generation` is threaded through
 * from here so that plan is a check on an existing field, not a signature change.
 */

import * as Comlink from 'comlink'

import { chunkBufferByteLength, SWEEP_COLS, SWEEP_ROWS, type SweepGrid } from './sweep-grid.ts'
import type { SweepBaseParams, SweepChunkRequest, SweepWorkerApi } from './sweep.worker.ts'

export type { SweepBaseParams }

/** Mirrors `bench/sweep-pool.ts`'s own constant and reasoning: several chunks per worker rather
 * than exactly one, so a single slow worker cannot strand the tail of the sweep. */
const CHUNKS_PER_WORKER = 4

/** Mirrors `bench/sweep-pool.ts`'s own `DEFAULT_CHUNK_TIMEOUT_MS` reasoning: comfortably above
 * any real chunk's expected wall-clock, so a hang surfaces as a named timeout rather than
 * stalling the sweep forever. */
const DEFAULT_CHUNK_TIMEOUT_MS = 10_000

/** `cores - 1`, floored at a minimum of 1 -- identical rule to `bench/sweep-pool.ts`'s
 * `workerCountForCores`, re-declared here (not imported from `bench/`) since production code
 * never imports from the `bench/` tree. */
export function workerCountForCores(cores: number): number {
  return Math.max(1, cores - 1)
}

function resolveWorkerCount(): number {
  return workerCountForCores(navigator.hardwareConcurrency || 1)
}

function defaultWorkerFactory(): Worker {
  return new Worker(new URL('./sweep.worker.ts', import.meta.url), { type: 'module' })
}

/** Builds a promise tied to one worker's `error`/`messageerror` events, mirroring
 * `bench/sweep-pool.ts`'s own `watchWorkerFailure` exactly -- attached at construction time,
 * before any chunk is dispatched, so a module-evaluation failure is not missed. The no-op
 * `.catch` prevents an unhandled-rejection warning on the success path, where this promise is
 * constructed but never raced against. */
function watchWorkerFailure(worker: Worker, index: number): Promise<never> {
  const failure = new Promise<never>((_resolve, reject) => {
    worker.addEventListener('error', (event) => {
      reject(new Error(`sweep worker ${index} failed: ${event.message || 'error event'}`))
    })
    worker.addEventListener('messageerror', () => {
      reject(new Error(`sweep worker ${index} failed: messageerror event`))
    })
  })
  failure.catch(() => {
    // Intentionally discarded; the real rejection is observed via Promise.race in drainQueue.
  })
  return failure
}

export interface SweepPoolOptions {
  workerCount?: number
  /** Constructs one Worker for the given pool index. Defaults to the production construction
   * path. The seam tests use to exercise failure/timeout paths without touching production. */
  workerFactory?: (index: number) => Worker
  chunkTimeoutMs?: number
}

/** One full sweep request: `generation` plus the params shared by every cell, and the resolved
 * entry-date axis -- `entryDates[col]` is column `col`'s ISO entry date, length `SWEEP_COLS`,
 * precomputed once by the caller (`src/app/state.ts`'s `scheduleSweep`) from
 * `resolveEntryDateBounds`. Row indices are not supplied here: `runSweep` always covers every
 * row `0..SWEEP_ROWS - 1` for every column this task ever requests (plan 07-05's coarse pass is
 * the first caller to ever narrow either axis). */
export interface SweepRunRequest {
  generation: number
  params: SweepBaseParams
  entryDates: readonly string[]
}

interface ColumnChunk {
  columnIndices: number[]
  entryDates: string[]
}

/** Partitions `SWEEP_COLS` columns into up to `workerCount * CHUNKS_PER_WORKER` contiguous
 * column ranges (never more than `SWEEP_COLS` chunks, and never fewer than 1) -- mirrors
 * `bench/sweep-pool.ts`'s own cell-partitioning arithmetic, applied to columns instead of cells
 * so each chunk stays a column-aligned unit `sweep.worker.ts` can resolve one `KernelSeries` per
 * column against. */
function partitionColumns(entryDates: readonly string[], workerCount: number): ColumnChunk[] {
  const totalCols = entryDates.length
  const rawChunkCount = workerCount * CHUNKS_PER_WORKER
  const chunkCount = Math.max(1, Math.min(rawChunkCount, totalCols))
  const baseChunkSize = Math.floor(totalCols / chunkCount)
  const remainder = totalCols % chunkCount

  const chunks: ColumnChunk[] = []
  let cursor = 0
  for (let i = 0; i < chunkCount; i++) {
    const size = baseChunkSize + (i < remainder ? 1 : 0)
    if (size === 0) continue
    const columnIndices: number[] = []
    const dates: string[] = []
    for (let c = cursor; c < cursor + size; c++) {
      columnIndices.push(c)
      dates.push(entryDates[c] ?? '')
    }
    chunks.push({ columnIndices, entryDates: dates })
    cursor += size
  }
  return chunks
}

const ALL_ROW_INDICES: readonly number[] = Array.from({ length: SWEEP_ROWS }, (_, i) => i)

export interface SweepPool {
  /**
   * Runs one full sweep against `request`, writing every resolved cell's `multiples`,
   * `drawdowns` and `flags` into `grid` (mutated in place; `grid.cols`/`grid.rows` must already
   * equal `SWEEP_COLS`/`SWEEP_ROWS`). Resolves once every chunk's result has been merged.
   */
  runSweep(grid: SweepGrid, request: SweepRunRequest): Promise<void>
  /** The number of live workers this pool constructed -- the same across every `runSweep` call
   * against this pool instance, which is what makes the persistent-pool contract checkable: two
   * consecutive sweeps report the same worker count. */
  readonly workerCount: number
}

interface PoolEntry {
  worker: Worker
  remote: Comlink.Remote<SweepWorkerApi>
  workerIndex: number
  failure: Promise<never>
}

/**
 * Constructs `options.workerCount ?? resolveWorkerCount()` workers ONCE, immediately, and keeps
 * them alive for the returned `SweepPool`'s whole lifetime -- no `runSweep` call ever tears one
 * down. Every `runSweep` call partitions the request's columns into chunks, dispatches them
 * across the persistent pool via a shared work queue (`CHUNKS_PER_WORKER` per worker), and merges
 * each chunk's transferred result buffer into `grid` as it arrives.
 */
export function createSweepPool(options: SweepPoolOptions = {}): SweepPool {
  const workerCount = options.workerCount ?? resolveWorkerCount()
  const chunkTimeoutMs = options.chunkTimeoutMs ?? DEFAULT_CHUNK_TIMEOUT_MS
  const workerFactory = options.workerFactory ?? defaultWorkerFactory

  const pool: PoolEntry[] = []
  for (let i = 0; i < workerCount; i++) {
    const worker = workerFactory(i)
    pool.push({
      worker,
      remote: Comlink.wrap<SweepWorkerApi>(worker),
      workerIndex: i,
      // Attached before any chunk is ever dispatched (across every future runSweep call), so a
      // module-evaluation failure is not missed.
      failure: watchWorkerFailure(worker, i),
    })
  }

  async function runSweep(grid: SweepGrid, request: SweepRunRequest): Promise<void> {
    const chunks = partitionColumns(request.entryDates, workerCount)
    let nextChunkIndex = 0

    async function drainQueue(entry: PoolEntry): Promise<void> {
      const { remote, workerIndex, failure } = entry
      while (nextChunkIndex < chunks.length) {
        const chunkIndex = nextChunkIndex
        nextChunkIndex += 1
        const chunk = chunks[chunkIndex]
        if (!chunk) continue

        const cellCount = chunk.columnIndices.length * SWEEP_ROWS
        const buffer = new ArrayBuffer(chunkBufferByteLength(cellCount))

        const chunkRequest: SweepChunkRequest = {
          generation: request.generation,
          params: request.params,
          columnIndices: chunk.columnIndices,
          entryDates: chunk.entryDates,
          rowIndices: ALL_ROW_INDICES as number[],
        }

        let timeoutHandle: ReturnType<typeof setTimeout> | undefined
        const timeout = new Promise<never>((_resolve, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(
              new Error(
                `sweep worker ${workerIndex} timed out after ${chunkTimeoutMs}ms on columns ` +
                  `[${chunk.columnIndices[0]}, ${chunk.columnIndices[chunk.columnIndices.length - 1]}]`,
              ),
            )
          }, chunkTimeoutMs)
        })

        try {
          // key_links: transferred both ways, never structured-cloned.
          const resultBuffer = await Promise.race([
            remote.runChunk(chunkRequest, Comlink.transfer(buffer, [buffer])),
            failure,
            timeout,
          ])

          const rowCount = SWEEP_ROWS
          const chunkCellCount = chunk.columnIndices.length * rowCount
          const multiples = new Float32Array(resultBuffer, 0, chunkCellCount)
          const drawdowns = new Float32Array(resultBuffer, chunkCellCount * 4, chunkCellCount)
          const flags = new Uint8Array(resultBuffer, chunkCellCount * 4 + chunkCellCount * 4, chunkCellCount)

          for (let colPos = 0; colPos < chunk.columnIndices.length; colPos++) {
            const col = chunk.columnIndices[colPos]
            if (col === undefined) continue
            for (let rowPos = 0; rowPos < rowCount; rowPos++) {
              const srcCell = colPos * rowCount + rowPos
              const gridCell = rowPos * SWEEP_COLS + col
              grid.multiples[gridCell] = multiples[srcCell] ?? 0
              grid.drawdowns[gridCell] = drawdowns[srcCell] ?? 0
              grid.flags[gridCell] = flags[srcCell] ?? 0
            }
          }
        } finally {
          clearTimeout(timeoutHandle)
        }
      }
    }

    await Promise.all(pool.map((entry) => drainQueue(entry)))
    grid.generation = request.generation
  }

  return { runSweep, workerCount }
}
