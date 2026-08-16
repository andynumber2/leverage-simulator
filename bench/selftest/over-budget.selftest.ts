/**
 * bench/selftest/over-budget.selftest.ts: D-09, the deliberately over-budget fixture.
 *
 * Runs as the sole test in the `bench-selftest` Vitest project (vitest.config.ts), which reuses
 * `bench/global-setup.ts` unchanged. This file's own assertion is not what proves D-09: it is
 * the real teardown, reading this row back through the real accumulator store and running the
 * real `assertRunInvariants` against it, that must fail the run. `tests/perf-budgets.selftest
 * .test.ts` spawns `npm run bench:selftest` and asserts that outcome from the outside.
 *
 * This file runs in a Node context (no browser instance in this project), so it imports
 * `persistEnvironment`/`persistMeasurement` directly from `bench/accumulator-store.ts` rather
 * than going through the browser `commands` bridge that the real `*.bench.test.ts` files use.
 */

import { expect, test } from 'vitest'

import { PERF_BUDGETS } from '../../perf-budgets.ts'
import { persistEnvironment, persistMeasurement } from '../accumulator-store.ts'
import { checkBudget, type MeasurementRow } from '../report.ts'

test('over-budget fixture: a deliberately breached row persists with verdict fail', async () => {
  const budget = PERF_BUDGETS['PERF-05']

  // Unambiguously over budget: PERF-05's real threshold is 16ms, and 100ms clears it by more
  // than 6x. The verdict comes from the real checkBudget, not a hardcoded 'fail', so this fixture
  // exercises the production comparison rather than assuming its outcome.
  const measuredMs = 100
  const normalizedMs = 100
  const row: MeasurementRow = {
    budgetId: budget.id,
    requirementId: budget.requirementId,
    measuredMs,
    normalizedMs,
    budgetMs: budget.thresholdMs,
    anchorMs: budget.anchorMs,
    anchorLabel: budget.anchorLabel,
    source: 'spike-synthetic',
    verdict: checkBudget({ normalizedMs, budgetMs: budget.thresholdMs }),
  }

  await persistEnvironment({
    hardwareConcurrency: 1,
    userAgent: 'bench-selftest gate self-test fixture',
    calibrationScore: 1,
    timestamp: new Date().toISOString(),
  })
  await persistMeasurement(row)

  // This assertion only proves the fixture itself is honest. The run's failure comes from the
  // teardown's assertRunInvariants call reading this row back, not from this line.
  expect(row.verdict).toBe('fail')
})
