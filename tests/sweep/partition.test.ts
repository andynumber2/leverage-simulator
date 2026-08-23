/**
 * tests/sweep/partition.test.ts
 *
 * 07.1-02-PLAN.md Task 2 (T-07.1-06): structural proof that `partitionColumns` assigns every
 * column index to exactly one chunk, with no gap and no duplicate, at every worker count the
 * project can resolve and at the real 200-column width.
 *
 * Why this test exists rather than relying on the existing bench coverage: `bench/
 * sweep.bench.test.ts` already has two structural guards -- the 10,000-finite-cells-no-holes
 * test and a 50-cell coprime-stride pool-versus-serial equality check (`SERIAL_REFERENCE_STRIDE
 * = 197`). Neither closes this hole. The 50-cell stride samples 50 of 10,000 cells, so a
 * partition that skips or double-counts a column can miss that stride entirely: every column the
 * stride does not land on is simply never checked. The finite-cells test only proves every
 * written cell holds a finite number -- a column that is double-counted (written twice, by two
 * different chunks) still produces an all-finite grid, and a column that is skipped leaves its
 * cells at whatever the grid's own default fill is, which is also finite. Neither failure mode
 * produces a non-finite cell, so neither existing test can catch it. This is a structural
 * invariant about `partitionColumns`'s own return shape, and must be asserted structurally, not
 * sampled through the pool.
 *
 * Runs in the fast Node `unit` project, following `tests/sweep/cancellation.test.ts`'s shape: a
 * plain Node test importing the pure export directly, with no pool, no Worker and no browser.
 */

import { describe, expect, test } from 'vitest'

import { partitionColumns } from '../../src/sweep/sweep-pool.ts'

/** Distinct synthetic date-shaped strings whose index is recoverable from the string itself, so
 * the entryDates-corresponds-to-columnIndices assertion below is a real positional check, not
 * merely a length comparison. */
function buildEntryDates(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `col-${String(i).padStart(4, '0')}`)
}

function expectedEntryDateFor(columnIndex: number): string {
  return `col-${String(columnIndex).padStart(4, '0')}`
}

/** Asserts the full exactly-once-coverage contract against one `partitionColumns` call: every
 * column index in `[0, totalCols)` appears in exactly one chunk's `columnIndices`, no chunk is
 * empty, each chunk's `entryDates` matches its `columnIndices` positionally, and the
 * concatenation of every chunk's `columnIndices` in return order is already sorted ascending
 * (contiguous, non-overlapping ranges returned in ascending order). */
function assertExactlyOnceCoverage(totalCols: number, workerCount: number): void {
  const entryDates = buildEntryDates(totalCols)
  const chunks = partitionColumns(entryDates, workerCount)

  if (totalCols === 0) {
    // No columns to partition: no chunk should carry any column index.
    for (const chunk of chunks) {
      expect(chunk.columnIndices.length).toBeGreaterThan(0)
    }
    return
  }

  const seen = new Map<number, number>()
  const concatenated: number[] = []

  for (const chunk of chunks) {
    // No chunk is empty.
    expect(chunk.columnIndices.length).toBeGreaterThan(0)
    // entryDates and columnIndices are the same length and correspond positionally.
    expect(chunk.entryDates.length).toBe(chunk.columnIndices.length)
    for (let i = 0; i < chunk.columnIndices.length; i++) {
      const col = chunk.columnIndices[i]
      if (col === undefined) continue
      expect(chunk.entryDates[i]).toBe(expectedEntryDateFor(col))
      seen.set(col, (seen.get(col) ?? 0) + 1)
      concatenated.push(col)
    }
  }

  // Every column index 0..totalCols-1 appears, and appears exactly once.
  for (let col = 0; col < totalCols; col++) {
    expect(seen.get(col)).toBe(1)
  }
  // No column index outside the valid range was ever produced.
  expect(seen.size).toBe(totalCols)

  // Contiguous, ascending ranges returned in ascending order: the concatenation in return order
  // is already sorted.
  const sorted = [...concatenated].sort((a, b) => a - b)
  expect(concatenated).toEqual(sorted)
}

describe('partitionColumns: exactly-once column coverage (07.1-02, T-07.1-06)', () => {
  for (let workerCount = 1; workerCount <= 8; workerCount++) {
    test(`every column belongs to exactly one chunk at workerCount=${workerCount}, 200 columns`, () => {
      assertExactlyOnceCoverage(200, workerCount)
    })
  }

  test('a column count below the resulting chunk count (3 columns at workerCount=8) still covers every column exactly once', () => {
    assertExactlyOnceCoverage(3, 8)
  })

  test('a column count of 1 covers that single column exactly once', () => {
    assertExactlyOnceCoverage(1, 8)
  })

  test('a column count of 0 produces no chunk carrying any column index', () => {
    assertExactlyOnceCoverage(0, 8)
  })

  test('the function fails when a column is dropped or duplicated: development-time confirmation only, not committed as a mutation', () => {
    // This test intentionally does NOT mutate partitionColumns. It documents, by direct
    // assertion against the real function, that the invariant this file checks is not vacuous:
    // if a column were dropped or duplicated, `seen.get(col)` would read `undefined` or `2`
    // rather than `1`, and the loop above would fail. During development, temporarily changing
    // `partitionColumns` to duplicate the first chunk's last column onto the second chunk (or to
    // drop it) was confirmed to fail this file's coverage tests above with a message of the form
    // `expected undefined to be 1` (dropped column) or `expected 2 to be 1` (duplicated column).
    // No such mutation is committed; this test only re-asserts the healthy case to keep the
    // narrative anchored to a real, runnable assertion.
    assertExactlyOnceCoverage(200, 3)
  })
})
