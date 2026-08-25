/**
 * tests/sweep-pool.test.ts: quick-260818-v2d Task 1's no-op proof that pinning PERF-03's pool
 * width to the declared 4-core baseline does not move the figure measured on the D-17 baseline
 * itself. `bench/sweep-pool.ts` imports cleanly in Node (verified in 260818-v2d-RESEARCH.md), so
 * this runs in the fast `unit` project rather than the browser `bench` project.
 *
 * Phase 7.1 worker-count Key Decision (PROJECT.md): `workerCountForCores` was changed from
 * `cores - 1` to `cores` (width 4 on the 4-core baseline), then reverted after the authoritative
 * D-17 baseline run (32676218114) crossed D-20's 70%-of-budget trigger on PERF-07b and measured
 * no PERF-03 headline improvement at width 4. `BASELINE_WORKER_COUNT` is 3, not 4.
 */

import { describe, expect, test } from 'vitest'

import { PERF_03_BASELINE_HARDWARE_CONCURRENCY } from '../perf-budgets.ts'
import { BASELINE_WORKER_COUNT, workerCountForCores } from '../bench/sweep-pool.ts'

describe('workerCountForCores', () => {
  test(
    'workerCountForCores(4) equals BASELINE_WORKER_COUNT: the reserved-core width is exactly ' +
      'the width auto-resolution produces on the declared 4-core baseline, so pinning cannot ' +
      'move the baseline figure away from what the host itself would resolve',
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

  test('the rule reserves one core: 9 cores resolves to 8 workers', () => {
    expect(workerCountForCores(9)).toBe(8)
  })
})
