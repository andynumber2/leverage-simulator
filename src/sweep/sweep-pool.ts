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
 * 07-05-PLAN.md Task 1 (D-13, T-07-06, T-07-02, T-07-12): cancellation is a generation
 * comparison, never a pool teardown. `createSweepPool()`'s returned `SweepPool` tracks its own
 * monotonic `currentGeneration`; starting a new sweep (`runSweep`) bumps it SYNCHRONOUSLY, before
 * any await, so a caller starting a new sweep never waits on a prior in-flight generation
 * (PERF-06's one-frame budget). `isStaleGeneration`/`mergeChunkResult` are the pure functions that
 * decide, per arriving chunk, whether it reaches the live grid -- exported so
 * `tests/sweep/cancellation.test.ts` can prove the discard directly, with no pool, no Worker and
 * no browser. A chunk whose worker call times out or fails degrades to `CELL_FLAG_INCOMPLETE`
 * cells and a counter (T-07-12) rather than rejecting the whole sweep. `dispose()` is the ONLY
 * place any worker in this pool is ever torn down; ordinary cancel-and-restart never terminates or
 * reconstructs one (T-07-02).
 */

import * as Comlink from 'comlink'

import { CELL_FLAG_INCOMPLETE } from '../data/sweep-fixture-format.ts'
import { ANNUALIZED_UNDEFINED, chunkBufferByteLength, SWEEP_COLS, SWEEP_ROWS, type SweepGrid } from './sweep-grid.ts'
import type { SweepBaseParams, SweepChunkRequest, SweepWorkerApi } from './sweep.worker.ts'

export type { SweepBaseParams }

/** Mirrors `bench/sweep-pool.ts`'s own constant and reasoning: several chunks per worker rather
 * than exactly one, so a single slow worker cannot strand the tail of the sweep. */
const CHUNKS_PER_WORKER = 4

/** Mirrors `bench/sweep-pool.ts`'s own `DEFAULT_CHUNK_TIMEOUT_MS` reasoning: comfortably above
 * any real chunk's expected wall-clock, so a hang surfaces as a named timeout rather than
 * stalling the sweep forever. */
const DEFAULT_CHUNK_TIMEOUT_MS = 10_000

/** `cores`, floored at a minimum of 1. Adopted from `cores - 1` per the Phase 7.1 worker-count
 * Key Decision (PROJECT.md): the 4-core D-17 baseline's own contention-arm evidence showed a
 * real throughput gain at width 4 with no measurable interactivity cost against PERF-07a/07b.
 * Identical rule to `bench/sweep-pool.ts`'s `workerCountForCores`, re-declared here (not
 * imported from `bench/`) since production code never imports from the `bench/` tree. */
export function workerCountForCores(cores: number): number {
  return Math.max(1, cores)
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
 * entry-date axis -- `entryDates[col]` is column `col`'s ISO entry date, length equal to the
 * TARGET grid's own `cols` (not necessarily `SWEEP_COLS`; see `rowIndices` below), precomputed
 * once by the caller (`src/app/state.ts`'s `scheduleSweep`) from `resolveEntryDateBounds`. */
export interface SweepRunRequest {
  generation: number
  params: SweepBaseParams
  entryDates: readonly string[]
  /** 07-05-PLAN.md Task 2 (D-12): row indices into the full `SWEEP_ROWS` leverage axis this run
   * should compute, positionally matching the TARGET grid's own rows -- position `i` in this
   * array is grid row `i`, and each entry is the ABSOLUTE row index `leverageForRow` resolves the
   * leverage from. Defaults to every row `0..SWEEP_ROWS - 1` (the full pass's usage) when
   * omitted. The coarse pass is the first caller to ever narrow this axis (and, via a shorter
   * `entryDates`, the column axis too). */
  rowIndices?: readonly number[]
}

interface ColumnChunk {
  columnIndices: number[]
  entryDates: string[]
}

/** Partitions `SWEEP_COLS` columns into up to `workerCount * CHUNKS_PER_WORKER` contiguous
 * column ranges (never more than `SWEEP_COLS` chunks, and never fewer than 1) -- mirrors
 * `bench/sweep-pool.ts`'s own cell-partitioning arithmetic, applied to columns instead of cells
 * so each chunk stays a column-aligned unit `sweep.worker.ts` can resolve one `KernelSeries` per
 * column against.
 *
 * 07.1-02: exported so its exactly-once column coverage (every column belongs to exactly one
 * chunk, with no gap and no duplicate) can be proven directly, at every worker count, in the
 * fast Node `unit` project -- see `tests/sweep/partition.test.ts`. `bench/sweep.bench.test.ts`'s
 * pool-versus-serial equality check only samples 50 of the grid's 10,000 cells on a coprime
 * stride, which is not enough to catch a partition that skips or double-counts a column. */
export function partitionColumns(entryDates: readonly string[], workerCount: number): ColumnChunk[] {
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

/** 07-05-PLAN.md Task 1 (D-13): true exactly when `resultGeneration` is STRICTLY behind
 * `currentGeneration` -- the ONLY comparison standing between an arriving chunk and the live grid
 * (T-07-06). Equal generations are NOT stale: the coarse and full passes of one sweep (plan
 * 07-05 Task 2) share a single generation number, so the full pass's own chunks must still merge
 * after the coarse pass has already "spent" that generation bumping it. */
export function isStaleGeneration(resultGeneration: number, currentGeneration: number): boolean {
  return resultGeneration < currentGeneration
}

/** One arriving chunk's own local shape, ready to merge: `columnIndices` are POSITIONS in the
 * TARGET grid's own column axis (never absolute `SWEEP_COLS` indices -- see `SweepRunRequest`'s
 * doc comment), and `rowCount` is the target grid's own row count for this chunk.
 *
 * 07-06-PLAN.md (orchestrator-authorized scope extension): `annualized` is a required member,
 * not optional -- every chunk result (real or the synthetic incomplete-chunk fallback below)
 * always carries all four metric arrays, matching `chunkBufferByteLength`'s 4-segment wire
 * layout. */
export interface ChunkMergeInput {
  columnIndices: readonly number[]
  rowCount: number
  multiples: Float32Array
  drawdowns: Float32Array
  annualized: Float32Array
  flags: Uint8Array
}

/**
 * 07-05-PLAN.md Task 1 (T-07-06): the pure function standing between every arriving chunk and the
 * live grid. Returns `true` when `chunk` merged (its cells were written into `grid`), `false`
 * when it was discarded as stale -- in which case every one of `grid`'s cells is left
 * byte-identical to before the call. Directly testable in the Node `unit` project with no pool,
 * no Worker and no browser (`tests/sweep/cancellation.test.ts`).
 */
export function mergeChunkResult(
  chunk: ChunkMergeInput,
  resultGeneration: number,
  currentGeneration: number,
  grid: SweepGrid,
): boolean {
  if (isStaleGeneration(resultGeneration, currentGeneration)) return false
  const { rowCount } = chunk
  for (let colPos = 0; colPos < chunk.columnIndices.length; colPos++) {
    const col = chunk.columnIndices[colPos]
    if (col === undefined) continue
    for (let rowPos = 0; rowPos < rowCount; rowPos++) {
      const srcCell = colPos * rowCount + rowPos
      const gridCell = rowPos * grid.cols + col
      grid.multiples[gridCell] = chunk.multiples[srcCell] ?? 0
      grid.drawdowns[gridCell] = chunk.drawdowns[srcCell] ?? 0
      // 07-06-PLAN.md (orchestrator-authorized scope extension): ANNUALIZED_UNDEFINED, never 0,
      // for the same out-of-bounds-index defensive fallback the other two arrays use above (a
      // genuinely undefined annualized return is NaN already at this point -- sweep-grid.ts's own
      // sentinel contract -- this `??` only guards a TS noUncheckedIndexedAccess read that never
      // actually misses within chunk.columnIndices.length * rowCount).
      grid.annualized[gridCell] = chunk.annualized[srcCell] ?? ANNUALIZED_UNDEFINED
      grid.flags[gridCell] = chunk.flags[srcCell] ?? 0
    }
  }
  return true
}

/** T-07-12: builds a synthetic all-`CELL_FLAG_INCOMPLETE` chunk result for a chunk whose worker
 * call timed out or failed -- every one of its cells degrades to the same flat neutral grey an
 * incomplete-hold cell (D-28) already renders, rather than inventing a third grey-adjacent state
 * or rejecting the whole sweep. Routed through the same `mergeChunkResult` every real result
 * uses, so a stale failed chunk is discarded by the identical generation check. */
function buildIncompleteChunkResult(chunk: ColumnChunk, rowCount: number): ChunkMergeInput {
  const cellCount = chunk.columnIndices.length * rowCount
  const flags = new Uint8Array(cellCount)
  flags.fill(CELL_FLAG_INCOMPLETE)
  return {
    columnIndices: chunk.columnIndices,
    rowCount,
    multiples: new Float32Array(cellCount),
    drawdowns: new Float32Array(cellCount),
    // Zero-filled (the typed array default), matching D-20/computeChunkMetrics's own D-28
    // incomplete-cell convention: an incomplete-hold cell's annualized value is 0, never the
    // ANNUALIZED_UNDEFINED sentinel -- that sentinel is reserved for a genuinely undefined
    // solver result on an otherwise-complete cell, not a pool-level chunk failure.
    annualized: new Float32Array(cellCount),
    flags,
  }
}

/** 07-05-PLAN.md Task 1: the object one `runSweep` call resolves to. */
export interface SweepRunHandle {
  generation: number
  /** Cells this run flagged `CELL_FLAG_INCOMPLETE` because their chunk's worker call timed out
   * or failed (T-07-12) -- distinct from D-28's per-cell incomplete-hold flag, which the worker
   * itself sets independent of any pool-level chunk failure. */
  failedCellCount: number
  /** True when a strictly later generation started before every one of this run's chunks had
   * settled: a caller that receives `stale: true` must not treat `grid` as this sweep's live
   * result (D-13) -- the newer generation's own `runSweep` call owns painting from here. */
  stale: boolean
}

export interface SweepPool {
  /**
   * Runs one sweep against `request`, writing every resolved cell's `multiples`, `drawdowns` and
   * `flags` into `grid` (mutated in place; `grid.cols` must equal `request.entryDates.length` and
   * `grid.rows` must equal `(request.rowIndices ?? every row).length`). Resolves once every
   * chunk's result has settled (merged, discarded as stale, or flagged incomplete on failure).
   *
   * 07-05-PLAN.md Task 1 (T-07-02, PERF-06): bumps the pool's own generation SYNCHRONOUSLY,
   * before any await, when `request.generation` is strictly ahead of the pool's current one --
   * the O(1) main-thread cancellation PERF-06 asks for. Never tears down or reconstructs a
   * worker to cancel: a call starting a new sweep never awaits any prior in-flight generation
   * before this synchronous bump takes effect.
   */
  runSweep(grid: SweepGrid, request: SweepRunRequest): Promise<SweepRunHandle>
  /** The number of live workers this pool constructed -- the same across every `runSweep` call
   * against this pool instance, which is what makes the persistent-pool contract checkable: two
   * consecutive sweeps report the same worker count. */
  readonly workerCount: number
  /** Terminates every worker in this pool. The ONLY place any worker here is ever torn down --
   * ordinary cancel-and-restart (`runSweep`, above) never terminates or reconstructs one
   * (T-07-02). Used only when sweep mode is left entirely. */
  dispose(): void
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
 * down (that is `dispose()`'s job alone). Every `runSweep` call partitions the request's columns
 * into chunks, dispatches them across the persistent pool via a shared work queue
 * (`CHUNKS_PER_WORKER` per worker), and merges each chunk's transferred result buffer into `grid`
 * as it arrives, gated on every arrival by `isStaleGeneration`/`mergeChunkResult`.
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

  /** The pool's own generation floor (T-07-02): monotonically non-decreasing -- only ever bumped
   * forward by `runSweep`, never rewound, so a call bearing an older generation number can never
   * "revive" and become current again. */
  let currentGeneration = 0

  function runSweep(grid: SweepGrid, request: SweepRunRequest): Promise<SweepRunHandle> {
    const generation = request.generation
    // The bump itself: synchronous, before any await anywhere in this function, so starting a
    // new sweep never waits on a prior in-flight generation (PERF-06).
    if (generation > currentGeneration) {
      currentGeneration = generation
    }

    const rowIndices = request.rowIndices ?? ALL_ROW_INDICES
    if (grid.cols !== request.entryDates.length) {
      throw new Error(
        `sweep-pool: grid.cols (${grid.cols}) does not equal request.entryDates.length ` +
          `(${request.entryDates.length})`,
      )
    }
    if (grid.rows !== rowIndices.length) {
      throw new Error(
        `sweep-pool: grid.rows (${grid.rows}) does not equal request.rowIndices.length ` +
          `(${rowIndices.length})`,
      )
    }

    const chunks = partitionColumns(request.entryDates, workerCount)
    let nextChunkIndex = 0
    let failedCellCount = 0
    const rowCount = rowIndices.length

    async function drainQueue(entry: PoolEntry): Promise<void> {
      const { remote, workerIndex, failure } = entry
      while (nextChunkIndex < chunks.length) {
        // A stale generation's remaining, not-yet-dispatched chunks are skipped outright: no
        // worker time is spent computing a result nobody will ever paint (T-07-02).
        if (isStaleGeneration(generation, currentGeneration)) return

        const chunkIndex = nextChunkIndex
        nextChunkIndex += 1
        const chunk = chunks[chunkIndex]
        if (!chunk) continue

        const cellCount = chunk.columnIndices.length * rowCount
        const buffer = new ArrayBuffer(chunkBufferByteLength(cellCount))

        const chunkRequest: SweepChunkRequest = {
          generation,
          params: request.params,
          columnIndices: chunk.columnIndices,
          entryDates: chunk.entryDates,
          rowIndices: rowIndices as number[],
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
          clearTimeout(timeoutHandle)

          // 07-06-PLAN.md (orchestrator-authorized scope extension): 4-segment layout, matching
          // sweep-grid.ts's chunkBufferByteLength and sweep.worker.ts's runChunk write order.
          const chunkCellCount = chunk.columnIndices.length * rowCount
          const multiples = new Float32Array(resultBuffer, 0, chunkCellCount)
          const drawdowns = new Float32Array(resultBuffer, chunkCellCount * 4, chunkCellCount)
          const annualized = new Float32Array(resultBuffer, chunkCellCount * 4 * 2, chunkCellCount)
          const flags = new Uint8Array(resultBuffer, chunkCellCount * 4 * 3, chunkCellCount)

          // T-07-06: the generation comparison, and nothing else, decides whether this arriving
          // chunk reaches `grid`.
          mergeChunkResult(
            { columnIndices: chunk.columnIndices, rowCount, multiples, drawdowns, annualized, flags },
            generation,
            currentGeneration,
            grid,
          )
        } catch {
          // T-07-12: a timed-out or failed chunk degrades to CELL_FLAG_INCOMPLETE cells and a
          // counter, rather than rejecting the whole sweep. Still routed through the same
          // generation-gated merge, so a stale failure cannot corrupt a live grid either.
          clearTimeout(timeoutHandle)
          const incomplete = buildIncompleteChunkResult(chunk, rowCount)
          const merged = mergeChunkResult(incomplete, generation, currentGeneration, grid)
          if (merged) failedCellCount += chunk.columnIndices.length * rowCount
        }
      }
    }

    return Promise.all(pool.map((entry) => drainQueue(entry))).then(() => {
      const stale = isStaleGeneration(generation, currentGeneration)
      if (!stale) grid.generation = generation
      return { generation, failedCellCount, stale }
    })
  }

  function dispose(): void {
    // T-07-02: the ONLY place any worker in this pool is ever torn down.
    for (const entry of pool) {
      entry.worker.terminate()
    }
  }

  return { runSweep, workerCount, dispose }
}
