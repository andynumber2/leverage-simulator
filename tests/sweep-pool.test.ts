/**
 * tests/sweep-pool.test.ts: quick-260818-v2d Task 1, the no-op proof that pinning PERF-03's
 * pool width to the declared 4-core baseline does not move the figure measured on the D-17
 * baseline itself. `bench/sweep-pool.ts` imports cleanly in Node (verified in
 * 260818-v2d-RESEARCH.md), so this runs in the fast `unit` project rather than the browser
 * `bench` project.
 */

import { describe, expect, test } from 'vitest'

import { PERF_03_BASELINE_HARDWARE_CONCURRENCY } from '../perf-budgets.ts'
import { BASELINE_WORKER_COUNT, workerCountForCores } from '../bench/sweep-pool.ts'

describe('workerCountForCores', () => {
  test(
    'workerCountForCores(4) equals BASELINE_WORKER_COUNT: the pinned width is exactly the ' +
      'width auto-resolution produced on the D-17 baseline, where all 13 recorded runs ' +
      'resolved workerCount 3, so pinning cannot move the baseline figure',
    () => {
      expect(workerCountForCores(4)).toBe(3)
      expect(BASELINE_WORKER_COUNT).toBe(workerCountForCores(PERF_03_BASELINE_HARDWARE_CONCURRENCY))
      expect(BASELINE_WORKER_COUNT).toBe(3)
    },
  )

  test('the floor survives the extraction: 1 core and 0 cores both resolve to 1 worker', () => {
    expect(workerCountForCores(1)).toBe(1)
    expect(workerCountForCores(0)).toBe(1)
  })

  test('the rule itself is unchanged: 9 cores still resolves to 8 workers, only PERF-03\'s input is now fixed', () => {
    expect(workerCountForCores(9)).toBe(8)
  })
})
