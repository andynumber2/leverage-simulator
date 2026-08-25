/**
 * tests/sweep/cancellation.test.ts
 *
 * 07-05-PLAN.md Task 1: proves cancellation is a generation comparison, never a pool teardown.
 * Runs in the fast Node `unit` project -- `src/sweep/sweep-pool.ts` imports cleanly in Node, and
 * every assertion here needs no browser: the merge-path tests call `mergeChunkResult` directly
 * (a pure function, no pool, no Worker), and the pool-level tests use a stub `Worker` that never
 * resolves a chunk, so the 50-cycle/chunk-failure behaviors are provable without a real Comlink
 * wire protocol on the other end.
 *
 * Four behaviors, per the plan's own <behavior> block:
 * 1. `isStaleGeneration` is true exactly when the result's generation is lower than the current
 *    one, false when equal.
 * 2. A stale-generation chunk result fed into `mergeChunkResult` leaves the target grid
 *    byte-identical; a current-generation chunk merges normally.
 * 3. The pool survives 50 consecutive cancel-and-restart cycles with a constant worker count, and
 *    never constructs a new Worker.
 * 4. A chunk that times out marks its cells `CELL_FLAG_INCOMPLETE` and increments the run's
 *    `failedCellCount`, rather than rejecting the whole sweep.
 */

import { describe, expect, test } from 'vitest'

import { CELL_FLAG_INCOMPLETE } from '../../src/data/sweep-fixture-format.ts'
import { createSweepGrid, type SweepGridMeta } from '../../src/sweep/sweep-grid.ts'
import {
  createSweepPool,
  isStaleGeneration,
  mergeChunkResult,
  type ChunkMergeInput,
  type SweepBaseParams,
  type SweepRunRequest,
} from '../../src/sweep/sweep-pool.ts'

function testMeta(entryDates: string[], leverages: number[]): SweepGridMeta {
  return {
    bundleVersion: 'test',
    symbol: 'TEST',
    dividendReinvest: true,
    entryDates,
    leverages,
    holdingYears: 0,
    initialInvestment: 10_000,
    expenseRatioPercent: 0.9,
    financingSpreadPercent: 0.5,
    ruinedCount: 0,
    incompleteCount: 0,
    minMultiple: 0,
    maxMultiple: 0,
    clippedBelowCount: 0,
    clippedAboveCount: 0,
    holdMode: 'end-of-data',
    endOfDataDate: '2020-01-01',
  }
}

/** A `Worker`-shaped stub whose `postMessage` never responds: any Comlink RPC call dispatched
 * against it hangs until the caller's own `chunkTimeoutMs` fires, which is exactly the failure
 * path the chunk-failure test below needs to exercise, and exactly what lets the 50-cycle test
 * run fast without a real Comlink wire protocol on the other end -- `createSweepPool` only ever
 * needs `addEventListener`/`removeEventListener`/`postMessage`/`terminate` to exist. */
function makeStubWorker(onTerminate: () => void): Worker {
  const listeners = new Map<string, Set<(event: unknown) => void>>()
  const stub = {
    postMessage: () => {
      // Never responds -- every dispatched chunk call times out per the caller's own
      // chunkTimeoutMs, which is the point.
    },
    addEventListener: (type: string, cb: (event: unknown) => void) => {
      let set = listeners.get(type)
      if (set === undefined) {
        set = new Set()
        listeners.set(type, set)
      }
      set.add(cb)
    },
    removeEventListener: (type: string, cb: (event: unknown) => void) => {
      listeners.get(type)?.delete(cb)
    },
    terminate: () => {
      onTerminate()
    },
  }
  return stub as unknown as Worker
}

describe('isStaleGeneration', () => {
  test('true exactly when resultGeneration is strictly behind currentGeneration', () => {
    expect(isStaleGeneration(1, 2)).toBe(true)
    expect(isStaleGeneration(2, 1)).toBe(false)
  })

  test('false when equal -- a shared generation (coarse + full pass) is never stale against itself', () => {
    expect(isStaleGeneration(5, 5)).toBe(false)
  })
})

describe('mergeChunkResult', () => {
  test('a stale-generation chunk result leaves the target grid byte-identical', () => {
    const meta = testMeta(['2020-01-01', '2020-01-02'], [1, 2])
    const grid = createSweepGrid(2, 2, meta)
    // Seed the grid with distinguishable, non-zero values so "unchanged" is a meaningful claim,
    // not a before/after comparison of two zero-filled arrays.
    grid.multiples.set([1.1, 2.2, 3.3, 4.4])
    grid.drawdowns.set([0.1, 0.2, 0.3, 0.4])
    // 07-06-PLAN.md (orchestrator-authorized scope extension): annualized is now a 4th merged
    // array, seeded here the same way multiples/drawdowns are, so "unchanged" covers it too.
    grid.annualized.set([0.05, 0.06, 0.07, 0.08])
    grid.flags.set([0, 0, 0, 0])
    const before = {
      multiples: Array.from(grid.multiples),
      drawdowns: Array.from(grid.drawdowns),
      annualized: Array.from(grid.annualized),
      flags: Array.from(grid.flags),
    }

    const chunk: ChunkMergeInput = {
      columnIndices: [0, 1],
      rowCount: 2,
      multiples: new Float32Array([9, 9, 9, 9]),
      drawdowns: new Float32Array([9, 9, 9, 9]),
      annualized: new Float32Array([9, 9, 9, 9]),
      flags: new Uint8Array([9, 9, 9, 9]),
    }

    const merged = mergeChunkResult(chunk, 1, 2, grid)

    expect(merged).toBe(false)
    expect(Array.from(grid.multiples)).toEqual(before.multiples)
    expect(Array.from(grid.drawdowns)).toEqual(before.drawdowns)
    expect(Array.from(grid.annualized)).toEqual(before.annualized)
    expect(Array.from(grid.flags)).toEqual(before.flags)
  })

  test('a current-generation chunk result merges normally', () => {
    const meta = testMeta(['2020-01-01', '2020-01-02'], [1, 2])
    const grid = createSweepGrid(2, 2, meta)

    const chunk: ChunkMergeInput = {
      columnIndices: [0, 1],
      rowCount: 2,
      multiples: new Float32Array([1.5, 2.5, 3.5, 4.5]),
      drawdowns: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      // 07-06-PLAN.md (orchestrator-authorized scope extension): distinguishable annualized
      // values, mapped through the exact same colPos/rowPos -> gridCell transform as multiples/
      // drawdowns below -- proving the merge loop's 4th segment lands at the right cell, not
      // just that the field exists.
      annualized: new Float32Array([0.11, 0.22, 0.33, 0.44]),
      flags: new Uint8Array([0, 1, 0, 0]),
    }

    const merged = mergeChunkResult(chunk, 3, 3, grid)

    expect(merged).toBe(true)
    // srcCell = colPos * rowCount + rowPos; gridCell = rowPos * grid.cols + col.
    // col=0,row=0 -> src 0 -> grid[0]; col=0,row=1 -> src 1 -> grid[2]
    // col=1,row=0 -> src 2 -> grid[1]; col=1,row=1 -> src 3 -> grid[3]
    expect(Array.from(grid.multiples)).toEqual([1.5, 3.5, 2.5, 4.5])
    const drawdowns = Array.from(grid.drawdowns)
    const expectedDrawdowns = [0.1, 0.3, 0.2, 0.4]
    for (let i = 0; i < expectedDrawdowns.length; i++) {
      expect(drawdowns[i]).toBeCloseTo(expectedDrawdowns[i]!, 5)
    }
    const annualized = Array.from(grid.annualized)
    const expectedAnnualized = [0.11, 0.33, 0.22, 0.44]
    for (let i = 0; i < expectedAnnualized.length; i++) {
      expect(annualized[i]).toBeCloseTo(expectedAnnualized[i]!, 5)
    }
    expect(Array.from(grid.flags)).toEqual([0, 0, 1, 0])
  })
})

describe('createSweepPool: cancel-and-restart never tears down or reconstructs a worker', () => {
  test(
    '50 consecutive generation bumps leave a constant worker count and construct no new Worker',
    async () => {
      let constructCount = 0
      let terminateCount = 0
      const pool = createSweepPool({
        workerCount: 3,
        chunkTimeoutMs: 30,
        workerFactory: () => {
          constructCount += 1
          return makeStubWorker(() => {
            terminateCount += 1
          })
        },
      })

      expect(pool.workerCount).toBe(3)
      expect(constructCount).toBe(3)

      const entryDates = ['2020-01-01', '2020-01-02']
      const params: SweepBaseParams = {
        symbol: 'TEST',
        dividendReinvest: true,
        initialInvestment: 10_000,
        contributionAmount: 0,
        contributionFrequency: 'none',
        expenseRatioPercent: 0.9,
        financingSpreadPercent: 0.5,
        holdingPeriodBars: null,
      }

      const handles = []
      for (let i = 1; i <= 50; i++) {
        const meta = testMeta(entryDates, [1, 2])
        const grid = createSweepGrid(2, 2, meta)
        const request: SweepRunRequest = { generation: i, params, entryDates, rowIndices: [0, 1] }
        handles.push(pool.runSweep(grid, request))
      }

      await Promise.all(handles)

      expect(pool.workerCount).toBe(3)
      expect(constructCount).toBe(3)
      expect(terminateCount).toBe(0)
    },
    10_000,
  )

  test('a chunk that times out marks its cells CELL_FLAG_INCOMPLETE and increments failedCellCount', async () => {
    const pool = createSweepPool({
      workerCount: 1,
      chunkTimeoutMs: 30,
      workerFactory: () => makeStubWorker(() => {}),
    })

    const entryDates = ['2020-01-01', '2020-01-02']
    const params: SweepBaseParams = {
      symbol: 'TEST',
      dividendReinvest: true,
      initialInvestment: 10_000,
      contributionAmount: 0,
      contributionFrequency: 'none',
      expenseRatioPercent: 0.9,
      financingSpreadPercent: 0.5,
      holdingPeriodBars: null,
    }
    const meta = testMeta(entryDates, [1, 2])
    const grid = createSweepGrid(2, 2, meta)
    const request: SweepRunRequest = { generation: 1, params, entryDates, rowIndices: [0, 1] }

    const handle = await pool.runSweep(grid, request)

    expect(handle.stale).toBe(false)
    expect(handle.failedCellCount).toBeGreaterThan(0)
    expect(handle.failedCellCount).toBe(grid.cols * grid.rows)
    for (const flag of grid.flags) {
      expect((flag & CELL_FLAG_INCOMPLETE) !== 0).toBe(true)
    }
  })
})
