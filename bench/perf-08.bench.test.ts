/**
 * bench/perf-08.bench.test.ts: Task 2 (04-03), PERF-08a/08b/08c measurement.
 *
 * Follows bench/kernel.bench.test.ts's five-step shape (resolve calibration, measure, normalize,
 * record environment and measurement, assert within budget) exactly, with the single measurement
 * (commands.measureAppLoadTiming, wrapped Node-side in bench/preview-server.ts's
 * withPreviewServer) producing three figures instead of one. Every figure carries
 * `source: 'production'`: the measurement runs against the real `npm run build` output, never
 * synthetic input.
 */

import { commands } from 'vitest/browser'
import { expect, test } from 'vitest'

import { PERF_BUDGETS } from '../perf-budgets.ts'
import { normalize } from './calibration.ts'
import { resolveRunCalibration } from './canonical-calibration.ts'
import { captureEnvironment } from './environment-block.ts'
import {
  assertWithinBudget,
  checkBudget,
  escalationTriggered,
  type MeasurementRow,
} from './report.ts'

test('PERF-08a/08b/08c: cold and warm load timing against a production preview build', async () => {
  const score = await resolveRunCalibration()

  const timing = await commands.measureAppLoadTiming()

  await commands.recordEnvironment(captureEnvironment(score))

  // WINDOWS.md entry 2's measurement band, stated beside every PERF-08 figure rather than left
  // implicit: normalize()'s correction is real but partial, so a headroom claim from this run
  // carries a stated margin, never a bare point figure.
  await commands.recordInfoLine(
    'PERF-08-band',
    'PERF-08 measurement band (WINDOWS.md entry 2): normalize() residual is 6.36% relative ' +
      'over 13 recorded D-17 baseline runs, so a single CI run supports a headroom claim only ' +
      'to roughly +/-13% (2 standard deviations), and a two-run comparison only to roughly ' +
      '+/-20%.',
  )

  const budget08a = PERF_BUDGETS['PERF-08a']
  const normalized08a = normalize(timing.coldInteractiveMs, score)
  const row08a: MeasurementRow = {
    budgetId: budget08a.id,
    requirementId: budget08a.requirementId,
    measuredMs: timing.coldInteractiveMs,
    normalizedMs: normalized08a,
    budgetMs: budget08a.thresholdMs,
    anchorMs: budget08a.anchorMs,
    anchorLabel: budget08a.anchorLabel,
    source: 'production',
    verdict: checkBudget({ normalizedMs: normalized08a, budgetMs: budget08a.thresholdMs }),
  }

  const budget08b = PERF_BUDGETS['PERF-08b']
  const normalized08b = normalize(timing.coldDataReadyMs, score)
  const row08b: MeasurementRow = {
    budgetId: budget08b.id,
    requirementId: budget08b.requirementId,
    measuredMs: timing.coldDataReadyMs,
    normalizedMs: normalized08b,
    budgetMs: budget08b.thresholdMs,
    anchorMs: budget08b.anchorMs,
    anchorLabel: budget08b.anchorLabel,
    source: 'production',
    verdict: checkBudget({ normalizedMs: normalized08b, budgetMs: budget08b.thresholdMs }),
  }

  const budget08c = PERF_BUDGETS['PERF-08c']
  const normalized08c = normalize(timing.warmInteractiveMs, score)
  const row08c: MeasurementRow = {
    budgetId: budget08c.id,
    requirementId: budget08c.requirementId,
    measuredMs: timing.warmInteractiveMs,
    normalizedMs: normalized08c,
    budgetMs: budget08c.thresholdMs,
    anchorMs: budget08c.anchorMs,
    anchorLabel: budget08c.anchorLabel,
    source: 'production',
    verdict: checkBudget({ normalizedMs: normalized08c, budgetMs: budget08c.thresholdMs }),
  }

  const rows: MeasurementRow[] = [row08a, row08b, row08c]
  for (const row of rows) {
    // eslint-disable-next-line no-await-in-loop
    await commands.recordMeasurement(row)
  }

  // Per-row reproducibility disclosure: the raw figure, the normalized figure, the calibration
  // score, and the long-task max/count and hardwareConcurrency observed during the cold load
  // (shared across all three rows, since all three come from the one measured page load). The
  // long-task figures are disclosed here as reproducibility information only, never as a verdict
  // of their own -- that measurement belongs to a different plan.
  await commands.recordInfoLine(
    'PERF-08a-info',
    `PERF-08a: rawMs=${timing.coldInteractiveMs.toFixed(4)} normalizedMs=${normalized08a.toFixed(4)} ` +
      `calibrationScore=${score} longTaskMaxMs=${timing.maxLongTaskDurationMs.toFixed(4)} ` +
      `longTaskCount=${timing.longTaskCount} hardwareConcurrency=${timing.hardwareConcurrency}`,
  )
  await commands.recordInfoLine(
    'PERF-08b-info',
    `PERF-08b: rawMs=${timing.coldDataReadyMs.toFixed(4)} normalizedMs=${normalized08b.toFixed(4)} ` +
      `calibrationScore=${score} longTaskMaxMs=${timing.maxLongTaskDurationMs.toFixed(4)} ` +
      `longTaskCount=${timing.longTaskCount} hardwareConcurrency=${timing.hardwareConcurrency}`,
  )
  await commands.recordInfoLine(
    'PERF-08c-info',
    `PERF-08c: rawMs=${timing.warmInteractiveMs.toFixed(4)} normalizedMs=${normalized08c.toFixed(4)} ` +
      `calibrationScore=${score} longTaskMaxMs=${timing.maxLongTaskDurationMs.toFixed(4)} ` +
      `longTaskCount=${timing.longTaskCount} hardwareConcurrency=${timing.hardwareConcurrency}`,
  )

  // D-20: a figure at or above 70% of its own budget escalates deliberately rather than the
  // budget being relaxed. This surfaces the candidate; it does not fail the run by itself.
  const escalations = rows.filter((row) => escalationTriggered(row.normalizedMs, row.budgetMs))
  if (escalations.length > 0) {
    await commands.recordInfoLine(
      'PERF-08-escalation',
      `PERF-08 escalation candidate(s) (D-20, at or above 70% of budget): ` +
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
