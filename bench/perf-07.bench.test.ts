/**
 * bench/perf-07.bench.test.ts: Task 2 (04-06), PERF-07a/07b measurement.
 *
 * Follows bench/kernel.bench.test.ts's five-step shape (resolve calibration, measure, normalize,
 * record environment and measurement, assert within budget) exactly, with the single measurement
 * (commands.measureInteractionTiming, a real Playwright pointer drag of the production leverage
 * slider, wrapped Node-side in bench/preview-server.ts's withPreviewServer) producing two figures
 * instead of one. Both rows carry `source: 'production'`.
 *
 * PERF-07a's measuredMs is a maximum, never a sum (see selectMaxLongTaskDuration below): the
 * requirement's ceiling is that no task exceeds 50ms, so a total-blocking-time figure would
 * measure a different thing and could pass while a single 80ms task went unreported.
 *
 * PERF-07b's measuredMs is the maximum `app-recompute` duration observed during the drag -- the
 * coalesced run-and-repaint D-03 says the 16ms frame budget applies to, not a raw frame delta
 * that would also count browser compositing the app does not control.
 *
 * 05-09: `storeSuccessfulRun` (src/app/state.ts) calls `computeAttribution` inside the same
 * `recompute-start`/`recompute-end` mark pair `scheduleRun` already wraps every recompute in, so
 * this test's existing `app-recompute` measurement window covers attribution's extra kernel calls
 * without a second bench file or a second mark pair. `ATTRIBUTION_COUNTERFACTUAL_ARM_COUNT` below
 * names how many of those extra kernel calls attribution performs per recompute, so the PERF-07b
 * info line states the workload the measured figure represents.
 */

import { commands } from 'vitest/browser'
import { expect, test } from 'vitest'

import { PERF_BUDGETS } from '../perf-budgets.ts'
import { normalize } from './calibration.ts'
import { resolveRunCalibration } from './canonical-calibration.ts'
import { captureEnvironment } from './environment-block.ts'
import { selectMaxLongTaskDuration } from './long-task-selector.ts'
import {
  assertWithinBudget,
  checkBudget,
  escalationTriggered,
  tryRecordMeasurements,
  type MeasurementRow,
} from './report.ts'

// PERF-07a's measuredMs selector: see bench/long-task-selector.ts's header comment for why it
// lives in a plain, non-test module (08-05) rather than being defined inline here.

/**
 * 05-09: the number of extra `runBacktest` calls `computeAttribution`'s Shapley decomposition
 * performs per recompute (`src/validation/attribution.ts`'s `buildSubsetValues`), beyond the one
 * `runBacktest` call `scheduleRun` itself already makes for the actual run. Of the eight subsets
 * `buildSubsetValues` evaluates, four contain the `compounding` factor and require a real kernel
 * call; one of those four (financing-on, expense-on) reuses `actualResult.finalValue` rather than
 * re-running the kernel, leaving three real counterfactual `runCounterfactualArm` calls. Named
 * here, not re-derived, so this figure and attribution.ts's own module comment cannot drift.
 */
const ATTRIBUTION_COUNTERFACTUAL_ARM_COUNT = 3

test('PERF-07a measuredMs selector picks the maximum of a known list, never the sum', () => {
  const durations = [5, 12, 47, 3]
  expect(selectMaxLongTaskDuration(durations)).toBe(47)
  expect(selectMaxLongTaskDuration(durations)).not.toBe(
    durations.reduce((total, d) => total + d, 0),
  )
  expect(selectMaxLongTaskDuration([])).toBe(0)
})

test('PERF-07a/07b: max long task and max coalesced recompute during a real leverage slider drag', async () => {
  const score = await resolveRunCalibration()

  const timing = await commands.measureInteractionTiming()

  // T-04-27: a drag that never reached the reactive path (missed the slider, or the app failed
  // to wire it) reports zero recomputes and must fail here, not read as a trivially passing 0ms
  // PERF-07b figure. Bounding above by stepCount is the other half of the same proof: coalescing
  // must reduce the recompute count below the event count, never increase it.
  if (timing.recomputeCount === 0 || timing.recomputeCount > timing.stepCount) {
    throw new Error(
      `PERF-07: app-recompute count (${timing.recomputeCount}) is outside the expected ` +
        `(0, ${timing.stepCount}] range for a ${timing.stepCount}-step drag -- the drag likely ` +
        'never reached the reactive path',
    )
  }

  await commands.recordEnvironment(captureEnvironment(score))

  // WINDOWS.md entry 2's measurement band, stated beside every PERF-07 figure rather than left
  // implicit: normalize()'s correction is real but partial, so a headroom claim from this run
  // carries a stated margin, never a bare point figure.
  await commands.recordInfoLine(
    'PERF-07-band',
    'PERF-07 measurement band (WINDOWS.md entry 2): normalize() residual is 6.36% relative over ' +
      '13 recorded D-17 baseline runs, so a single CI run supports a headroom claim only to ' +
      'roughly +/-13% (2 standard deviations), and a two-run comparison only to roughly +/-20%.',
  )

  const budget07a = PERF_BUDGETS['PERF-07a']
  const normalized07a = normalize(timing.maxLongTaskDurationMs, score)
  const row07a: MeasurementRow = {
    budgetId: budget07a.id,
    requirementId: budget07a.requirementId,
    measuredMs: timing.maxLongTaskDurationMs,
    normalizedMs: normalized07a,
    budgetMs: budget07a.thresholdMs,
    anchorMs: budget07a.anchorMs,
    anchorLabel: budget07a.anchorLabel,
    source: 'production',
    verdict: checkBudget({ normalizedMs: normalized07a, budgetMs: budget07a.thresholdMs }),
  }

  const budget07b = PERF_BUDGETS['PERF-07b']
  const normalized07b = normalize(timing.maxRecomputeDurationMs, score)
  const row07b: MeasurementRow = {
    budgetId: budget07b.id,
    requirementId: budget07b.requirementId,
    measuredMs: timing.maxRecomputeDurationMs,
    normalizedMs: normalized07b,
    budgetMs: budget07b.thresholdMs,
    anchorMs: budget07b.anchorMs,
    anchorLabel: budget07b.anchorLabel,
    source: 'production',
    verdict: checkBudget({ normalizedMs: normalized07b, budgetMs: budget07b.thresholdMs }),
  }

  // Recorded through the shared degrade-and-continue helper (bench/report.ts), not a bare
  // `await commands.recordMeasurement(row)` in a loop: PERF-07a shares its (budgetId, source)
  // slot with bench/perf-08-export.bench.test.ts, and Vitest's file execution order is not
  // guaranteed (CI run 33026990805 ran that file first). A rejected attempt on one row must not
  // prevent the other row in this same file from being attempted, which is exactly what the
  // helper's per-row isolation proves.
  const rows: MeasurementRow[] = [row07a, row07b]
  const recordAttempts = await tryRecordMeasurements(
    (row) => commands.recordMeasurement(row),
    rows,
  )
  const collisions = rows
    .map((row, index) => ({ row, attempt: recordAttempts[index]! }))
    .filter(({ attempt }) => !attempt.persisted)
  for (const { row, attempt } of collisions) {
    // eslint-disable-next-line no-await-in-loop
    await commands.recordInfoLine(`${row.budgetId}-row-collision`, attempt.message ?? '')
  }

  // Per-row reproducibility disclosure, plus the drag's step count and the observed
  // app-recompute count together -- what lets a reader see that coalescing actually happened
  // (recomputeCount well under stepCount) rather than take it on trust.
  const perf07aZeroNote =
    timing.longTaskCount === 0
      ? ' (zero long tasks observed: no task exceeding the long-task threshold is exactly the ' +
        'passing outcome PERF-07a asks for, not a broken instrument)'
      : ''
  await commands.recordInfoLine(
    'PERF-07a-info',
    `PERF-07a: rawMs=${timing.maxLongTaskDurationMs.toFixed(4)} ` +
      `normalizedMs=${normalized07a.toFixed(4)} calibrationScore=${score} ` +
      `longTaskCount=${timing.longTaskCount} stepCount=${timing.stepCount} ` +
      `recomputeCount=${timing.recomputeCount} ` +
      `hardwareConcurrency=${timing.hardwareConcurrency} ` +
      `persisted=${recordAttempts[0]!.persisted}${perf07aZeroNote}`,
  )
  await commands.recordInfoLine(
    'PERF-07b-info',
    `PERF-07b: rawMs=${timing.maxRecomputeDurationMs.toFixed(4)} ` +
      `normalizedMs=${normalized07b.toFixed(4)} calibrationScore=${score} ` +
      `stepCount=${timing.stepCount} recomputeCount=${timing.recomputeCount} ` +
      `hardwareConcurrency=${timing.hardwareConcurrency} ` +
      `persisted=${recordAttempts[1]!.persisted} ` +
      `attributionLive=true attributionCounterfactualArmCount=${ATTRIBUTION_COUNTERFACTUAL_ARM_COUNT} ` +
      '(each recompute measured here includes computeAttribution\'s ' +
      `${ATTRIBUTION_COUNTERFACTUAL_ARM_COUNT} extra runBacktest calls, run inside the same ` +
      'recompute-start/recompute-end mark pair scheduleRun already wraps every recompute in)',
  )

  // D-20: a figure at or above 70% of its own budget escalates deliberately rather than the
  // budget being relaxed. This surfaces the candidate; it does not fail the run by itself.
  const escalations = rows.filter((row) => escalationTriggered(row.normalizedMs, row.budgetMs))
  if (escalations.length > 0) {
    await commands.recordInfoLine(
      'PERF-07-escalation',
      `PERF-07 escalation candidate(s) (D-20, at or above 70% of budget): ` +
        `${escalations.map((row) => row.budgetId).join(', ')}`,
    )
  }

  // The precise per-metric signal: fails this test next to the code that measured the value.
  // The authoritative gate is the verdict check inside assertRunInvariants, which fails the run
  // even if these lines are removed.
  for (const row of rows) {
    expect(() => assertWithinBudget(row)).not.toThrow()
  }
})
