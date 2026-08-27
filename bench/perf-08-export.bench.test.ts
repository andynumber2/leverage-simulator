/**
 * bench/perf-08-export.bench.test.ts: Task 2 (08-05), PERF-07a measurement for the PNG export
 * path, the CSV export path, and the DCA preset apply.
 *
 * Follows bench/perf-07.bench.test.ts's five-step shape (resolve calibration, measure,
 * normalize, record environment and measurement, assert within budget) exactly, and reuses that
 * file's own `selectMaxLongTaskDuration` (imported, not reimplemented) plus its own max-not-sum
 * self-test, copied below against a second, independent list.
 *
 * ONE MeasurementRow is attempted here, not three, and that is a deliberate consequence of this
 * codebase's own write-once collision guard, not a shortcut: bench/accumulator-store.ts's
 * `persistMeasurement` writes one file per (budgetId, source) pair with `flag: 'wx'` and throws
 * `EEXIST` on a second write for the same pair, and its own thrown message states the fix
 * directly -- "two recorders for the same budget and source have no principled winner, so one
 * must downgrade to an info line." Three `PERF-07a`/`production` rows would collide on the
 * second write within this file alone.
 *
 * That guard is not a workaround to route around here: PERF-07a's own description is "no
 * main-thread task exceeds the long-task threshold during ANY interaction", a single ceiling
 * across every interaction ever measured against it, not a per-interaction budget. Recording the
 * maximum of the three new interactions as the one PERF-07a/production row is what the budget's
 * own wording asks for, and it is provably lossless for the pass/fail decision: since the
 * recorded figure is already the maximum of the three, the recorded row clearing budget means
 * every individual path cleared budget too, and the recorded row breaching means the worst path
 * is exactly the figure the row names.
 *
 * A second, cross-file collision exists too, verified empirically: bench/perf-07.bench.test.ts
 * also claims the `PERF-07a`/`production` slot for its own leverage-slider-drag measurement, and
 * `.bench/.raw/` is reset once per `npm run bench` invocation, not once per file -- so a full,
 * unfiltered suite run (every bench file in one invocation, e.g. CI) hits the identical `EEXIST`
 * collision across files, regardless of how this file's own three paths are consolidated
 * internally. Which file wins the slot depends on Vitest's file execution order, which is not
 * guaranteed -- CI run 33026990805 recorded this file running first, the opposite of what an
 * earlier version of this comment assumed, and that wrong assumption is what left
 * bench/perf-07.bench.test.ts's own record attempt unguarded and crashing the run. The fix is
 * now shared, not local to this file: `tryRecordMeasurement` (bench/report.ts) is what every
 * recorder contesting a slot calls, here and in bench/perf-07.bench.test.ts, so the same
 * degrade-and-continue behavior applies regardless of which file loses the race. The pass/fail
 * decision itself never depends on whether the row was actually persisted: `assertWithinBudget`
 * is a pure function of the row's own fields, called unconditionally below, so a real breach
 * still fails this test whether or not the row's bytes made it into `.bench/.raw/`. The three
 * individual per-path figures, their own verdicts, and the DCA-specific figure Task 3's
 * checkpoint needs are all recorded in full, as info lines, regardless of which branch the row
 * attempt takes -- no information is lost either way.
 *
 * `selectMaxLongTaskDuration` is imported from bench/long-task-selector.ts, not from
 * bench/perf-07.bench.test.ts directly: see that module's header comment for the correctness bug
 * (a real, unwanted re-run of perf-07's own leverage-slider drag) importing straight from a
 * `*.bench.test.ts` file caused, found while implementing this task.
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
  tryRecordMeasurement,
  type MeasurementRow,
} from './report.ts'

test('PERF-07a export selector picks the maximum of a known list, never the sum', () => {
  const durations = [4, 9, 41, 2]
  expect(selectMaxLongTaskDuration(durations)).toBe(41)
  expect(selectMaxLongTaskDuration(durations)).not.toBe(
    durations.reduce((total, d) => total + d, 0),
  )
  expect(selectMaxLongTaskDuration([])).toBe(0)
})

interface ExportPathFigure {
  label: 'png' | 'csv' | 'dcaApply'
  measuredMs: number
  longTaskCount: number
}

test('PERF-07a: max long task across the PNG export, the CSV export and the DCA preset apply', async () => {
  const score = await resolveRunCalibration()

  const timing = await commands.measureExportTiming()

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

  const budget = PERF_BUDGETS['PERF-07a']

  const perPath: ExportPathFigure[] = [
    { label: 'png', measuredMs: timing.pngMaxLongTaskMs, longTaskCount: timing.longTaskCounts.png },
    { label: 'csv', measuredMs: timing.csvMaxLongTaskMs, longTaskCount: timing.longTaskCounts.csv },
    {
      label: 'dcaApply',
      measuredMs: timing.dcaApplyMaxLongTaskMs,
      longTaskCount: timing.longTaskCounts.dcaApply,
    },
  ]

  // T-08-21's zero-guard: a path reporting zero long tasks AND a zero count is trusted as a real
  // pass, not a missed interaction, only because measureExportTiming's own state checks (button
  // state change, a download event, the headline text settling on a new value) already proved
  // that interaction reached its endpoint before the command returned -- a missed click throws
  // inside the command itself and never reaches this line as a silent 0.
  for (const path of perPath) {
    if (path.measuredMs === 0 && path.longTaskCount === 0) {
      // eslint-disable-next-line no-await-in-loop
      await commands.recordInfoLine(
        `PERF-07a-export-${path.label}-zero`,
        `PERF-07a export path "${path.label}": zero long tasks observed (0ms, count 0) -- the ` +
          "passing outcome that path's own measurement asks for, not a broken instrument; " +
          "measureExportTiming's own state checks already proved the interaction reached its " +
          'endpoint before returning.',
      )
    }
  }

  // The recorded row: the maximum of the three, reusing perf-07's own selector rather than a
  // second Math.max reimplementation, per this file's own max-not-sum discipline.
  const overallMaxLongTaskMs = selectMaxLongTaskDuration(perPath.map((path) => path.measuredMs))
  const worstPath = perPath.find((path) => path.measuredMs === overallMaxLongTaskMs) ?? perPath[0]!

  const normalizedMs = normalize(overallMaxLongTaskMs, score)
  const row: MeasurementRow = {
    budgetId: budget.id,
    requirementId: budget.requirementId,
    measuredMs: overallMaxLongTaskMs,
    normalizedMs,
    budgetMs: budget.thresholdMs,
    anchorMs: budget.anchorMs,
    anchorLabel: budget.anchorLabel,
    source: 'production',
    verdict: checkBudget({ normalizedMs, budgetMs: budget.thresholdMs }),
  }
  // See this file's header comment for the two collision surfaces (within-file and cross-file
  // with bench/perf-07.bench.test.ts) a bare `await commands.recordMeasurement(row)` would be
  // exposed to. The shared helper (bench/report.ts) resolves rather than throws on a rejection;
  // the pass/fail decision below does not depend on which branch this takes.
  const recordAttempt = await tryRecordMeasurement(
    (measurement) => commands.recordMeasurement(measurement),
    row,
  )
  if (!recordAttempt.persisted) {
    await commands.recordInfoLine('PERF-07a-export-row-collision', recordAttempt.message ?? '')
  }

  // Per-path detail, since only the maximum becomes the one recorded MeasurementRow (this file's
  // header comment explains why: bench/accumulator-store.ts's persistMeasurement collision
  // guard). Each line states the path's own raw and normalized figures and its own verdict
  // against the same budget, plus the PNG branch actually measured (T-08-21).
  for (const path of perPath) {
    const pathNormalizedMs = normalize(path.measuredMs, score)
    const pathVerdict = checkBudget({
      normalizedMs: pathNormalizedMs,
      budgetMs: budget.thresholdMs,
    })
    const pngBranchNote = path.label === 'png' ? ` pngPathTaken=${timing.pngPathTaken}` : ''
    // eslint-disable-next-line no-await-in-loop
    await commands.recordInfoLine(
      `PERF-07a-export-${path.label}-info`,
      `PERF-07a export path "${path.label}": rawMs=${path.measuredMs.toFixed(4)} ` +
        `normalizedMs=${pathNormalizedMs.toFixed(4)} calibrationScore=${score} ` +
        `longTaskCount=${path.longTaskCount} verdict=${pathVerdict}${pngBranchNote}`,
    )
  }

  await commands.recordInfoLine(
    'PERF-07a-export-info',
    `PERF-07a export (${recordAttempt.persisted ? 'recorded row' : 'row collided, info-line only'}, the ` +
      `maximum of the three paths): worstPath=${worstPath.label} ` +
      `rawMs=${overallMaxLongTaskMs.toFixed(4)} normalizedMs=${normalizedMs.toFixed(4)} ` +
      `calibrationScore=${score} verdict=${row.verdict}`,
  )

  // D-20: a figure at or above 70% of its own budget escalates deliberately rather than the
  // budget being relaxed. Checking the recorded (maximum) row is sufficient to catch this
  // condition for all three paths: since the recorded figure is already the maximum, any
  // individual path crossing the trigger implies the recorded row does too.
  if (escalationTriggered(row.normalizedMs, row.budgetMs)) {
    await commands.recordInfoLine(
      'PERF-07a-export-escalation',
      `PERF-07a export escalation candidate (D-20, at or above 70% of budget): worstPath=` +
        `${worstPath.label} normalizedMs=${normalizedMs.toFixed(4)} budgetMs=${budget.thresholdMs}`,
    )
  }

  expect(() => assertWithinBudget(row)).not.toThrow()
})
