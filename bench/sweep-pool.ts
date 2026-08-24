/**
 * bench/sweep-pool.ts: Task 2, real Worker pool partitioning bench/kernel.ts's 10,000-cell sweep
 * (CONTEXT.md D-10). Workers are constructed fresh inside every `runSpikeSweep` call, not reused
 * across `measureMinOfN` repeats, so worker construction cost, one of the costs research
 * hand-waved, is included in every repeat of the measured PERF-03 figure, not hidden after the
 * first. See 01-02-SUMMARY.md for the resolved worker count, chosen chunk count, and reasoning.
 */

import * as Comlink from 'comlink'

import { SWEEP_COLS, SWEEP_ROWS } from './kernel.ts'
import { PERF_03_BASELINE_HARDWARE_CONCURRENCY } from '../perf-budgets.ts'
import type { ChunkRequest, SweepWorkerApi } from './sweep.worker.ts'

const CELL_COUNT = SWEEP_COLS * SWEEP_ROWS

/** Each worker receives several chunks rather than exactly one (PITFALLS F4), so a single slow
 * worker cannot strand the tail of the sweep: a worker that finishes its chunks early simply
 * pulls the next chunk off the shared queue in `runSpikeSweep` below. */
const CHUNKS_PER_WORKER = 4

/** WR-01: the full 10,000-cell sweep measured roughly 186ms of raw wall clock across the whole
 * pool (01-SPIKE-RESULTS.md section 2), so a single chunk exceeding ten seconds is unambiguously
 * a hung worker rather than a slow one. Ten seconds is still far inside the 30000ms total bench
 * cap (BENCH_TOTAL_RUNTIME_CAP_MS in perf-budgets.ts), so the failure surfaces as a named error
 * rather than as a cap breach. */
const DEFAULT_CHUNK_TIMEOUT_MS = 10_000

/**
 * `cores`, floored at a minimum of 1 (T-01-05's zero-workers floor still applies; the
 * one-core-reserved-for-the-caller reasoning it also carried is superseded by the Phase 7.1
 * worker-count Key Decision in PROJECT.md, adopted from measured 4-core D-17 baseline
 * contention-arm evidence showing a real throughput gain at width 4 with no measurable
 * interactivity cost against PERF-07a/07b). The pure flooring rule, extracted so both
 * `resolveWorkerCount` (follows the host) and `BASELINE_WORKER_COUNT` (fixed to the declared
 * baseline) share one implementation rather than two copies that could drift.
 */
export function workerCountForCores(cores: number): number {
  return Math.max(1, cores)
}

/**
 * `workerCountForCores(navigator.hardwareConcurrency || 1)`: the production default, which
 * follows whatever width the host actually offers.
 */
export function resolveWorkerCount(): number {
  return workerCountForCores(navigator.hardwareConcurrency || 1)
}

/**
 * quick-260818-v2d: the pool width PERF-03 measures at on every host, regardless of
 * `resolveWorkerCount()`'s host-following result. The scalar calibration anchor in
 * bench/calibration.ts is single-threaded and cannot see available parallelism at all, so a
 * measured width that follows the host makes the metric's dominant variance term invisible to
 * the correction that is supposed to absorb it (measured in 260818-v2d-RESEARCH.md: the anchor
 * moves 0.4% across a 4.5x width change while normalized PERF-03 moves 6.1x). Pinning the
 * measured arm to the declared baseline, and withholding the verdict off it (bench/report.ts),
 * makes the figure denominated against the baseline PERF-03's own description already claims.
 * `runSpikeSweep`'s own default stays `resolveWorkerCount()`: the correctness and failure-path
 * tests exercise the production resolution, only the measured arm is pinned.
 */
export const BASELINE_WORKER_COUNT = workerCountForCores(PERF_03_BASELINE_HARDWARE_CONCURRENCY)

export interface SweepOptions {
  workerCount?: number
  /** Constructs one Worker for the given pool index. Defaults to the production construction
   * path (`new Worker(new URL('./sweep.worker.ts', import.meta.url), { type: 'module' })`).
   * Overriding this is the seam WR-01's fixture-worker tests use to exercise the hang and
   * throw-on-load failure paths without touching the production path. */
  workerFactory?: (index: number) => Worker
  /** Milliseconds a single chunk may run before `runSpikeSweep` rejects it as hung. Defaults to
   * `DEFAULT_CHUNK_TIMEOUT_MS`. */
  chunkTimeoutMs?: number
}

function defaultWorkerFactory(): Worker {
  return new Worker(new URL('./sweep.worker.ts', import.meta.url), { type: 'module' })
}

/**
 * Builds a promise tied to one worker's `error` and `messageerror` events. The promise never
 * resolves on its own; it only ever rejects, naming the worker's index and the event's message
 * where the event exposes one. Attached at construction time, before any chunk is dispatched, so
 * a module-evaluation failure (which fires before any RPC call is made) is not missed. A no-op
 * `catch` handler is attached immediately so a successful sweep, which discards this promise
 * without ever awaiting it, does not emit an unhandled-rejection warning.
 */
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
    // Intentionally discarded here; the real rejection is observed via Promise.race in
    // drainQueue below. This handler exists only to prevent an unhandled-rejection warning on
    // the success path, where this promise is constructed but never raced against.
  })
  return failure
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
 * result has arrived on the calling thread, exactly what PERF-03 specifies as "wall-clock from
 * user action to final cell."
 */
export async function runSpikeSweep(seed: number, options: SweepOptions = {}): Promise<SweepResult> {
  const workerCount = options.workerCount ?? resolveWorkerCount()
  const chunkTimeoutMs = options.chunkTimeoutMs ?? DEFAULT_CHUNK_TIMEOUT_MS
  const workerFactory = options.workerFactory ?? defaultWorkerFactory
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

  interface PoolEntry {
    worker: Worker
    remote: Comlink.Remote<SweepWorkerApi>
    workerIndex: number
    failure: Promise<never>
  }

  const workers: Worker[] = []
  const pool: PoolEntry[] = []
  for (let i = 0; i < workerCount; i++) {
    const worker = workerFactory(i)
    workers.push(worker)
    pool.push({
      worker,
      remote: Comlink.wrap<SweepWorkerApi>(worker),
      workerIndex: i,
      // Attached before any chunk is dispatched (Step 2), so a throw during module evaluation is
      // not missed.
      failure: watchWorkerFailure(worker, i),
    })
  }

  const grid = new Float64Array(CELL_COUNT)

  try {
    let nextChunkIndex = 0

    async function drainQueue(entry: PoolEntry): Promise<void> {
      const { remote, workerIndex, failure } = entry
      while (nextChunkIndex < chunks.length) {
        const chunkIndex = nextChunkIndex
        nextChunkIndex += 1
        const chunk = chunks[chunkIndex]
        if (!chunk) {
          continue
        }
        const cellsInChunk = chunk.endCellExclusive - chunk.startCell
        const buffer = new ArrayBuffer(cellsInChunk * Float64Array.BYTES_PER_ELEMENT)
        // Transferred, not structured-cloned (PITFALLS F3): ownership of `buffer` moves to the
        // worker; this thread must not touch `buffer` again after this call. The timeout path
        // below never touches `buffer` either, it only rejects with a diagnostic.
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined
        const timeout = new Promise<never>((_resolve, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(
              new Error(
                `sweep worker ${workerIndex} timed out after ${chunkTimeoutMs}ms on chunk ` +
                  `[${chunk.startCell}, ${chunk.endCellExclusive})`,
              ),
            )
          }, chunkTimeoutMs)
        })
        try {
          const resultBuffer = await Promise.race([
            remote.runChunk(chunk, Comlink.transfer(buffer, [buffer])),
            failure,
            timeout,
          ])
          const resultView = new Float64Array(resultBuffer)
          grid.set(resultView, chunk.startCell)
        } finally {
          clearTimeout(timeoutHandle)
        }
      }
    }

    await Promise.all(pool.map((entry) => drainQueue(entry)))
  } finally {
    for (const worker of workers) {
      worker.terminate()
    }
  }

  return { grid, workerCount, chunkCount }
}
