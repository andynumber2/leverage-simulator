/**
 * bench/bundle-size.bench.test.ts: DATA-BUNDLE-BYTES measurement (D-23).
 *
 * Calls the `readBundleBytes` command to get the compiled bundle's real on-disk brotli-compressed
 * transfer size -- a Node-side filesystem fact, the same "browser-context test asks the Node
 * process for something only Node can measure" pattern `readCalibration` already uses. Records a
 * `MeasurementRow` whose `measuredMs` and `normalizedMs` are both the compressed byte total: a
 * byte count is never divided by the calibration score, since that score corrects for machine
 * speed and a file size is not a duration (D-23). Finishes with the same `assertWithinBudget`
 * per-file delegate every other bench file uses; the authoritative gate remains the run-level
 * verdict check inside `assertRunInvariants`.
 */

import { commands } from 'vitest/browser'
import { expect, test } from 'vitest'

import { PERF_BUDGETS } from '../perf-budgets.ts'
import { resolveRunCalibration } from './canonical-calibration.ts'
import { captureEnvironment } from './environment-block.ts'
import { assertWithinBudget, checkBudget, type MeasurementRow } from './report.ts'

test('DATA-BUNDLE-BYTES: the compiled bundle transfer size stays under budget', async () => {
  // The run's canonical calibration figure is still resolved and recorded here (shared with
  // every other bench file this run), even though this row's own measured value never divides by
  // it: the environment block is one per run, not one per row, and every bench file is
  // responsible for keeping it populated regardless of what its own metric is denominated in.
  const score = await resolveRunCalibration()
  const bundleBytes = await commands.readBundleBytes()

  await commands.recordEnvironment(captureEnvironment(score))

  // Discloses the file count, the raw total and the compressed total, so a later reader can see
  // the compression ratio the threshold assumed.
  const ratio = bundleBytes.rawBytes === 0 ? 0 : bundleBytes.compressedBytes / bundleBytes.rawBytes
  await commands.recordInfoLine(
    'DATA-BUNDLE-BYTES-info',
    `DATA-BUNDLE-BYTES: files=${bundleBytes.files.length} rawBytes=${bundleBytes.rawBytes} ` +
      `compressedBytes=${bundleBytes.compressedBytes} ratio=${ratio.toFixed(4)}`,
  )

  const budget = PERF_BUDGETS['DATA-BUNDLE-BYTES']
  const measured = bundleBytes.compressedBytes
  const row: MeasurementRow = {
    budgetId: budget.id,
    requirementId: budget.requirementId,
    // Both measuredMs and normalizedMs carry the same compressed byte total: PerfBudget's unit
    // field ('bytes' for this row) is what tells bench/report.ts never to normalize it by the
    // calibration score.
    measuredMs: measured,
    normalizedMs: measured,
    budgetMs: budget.thresholdMs,
    anchorMs: budget.anchorMs,
    anchorLabel: budget.anchorLabel,
    // 'production': this measures the real compiled bundle (Task 1's committed public/data/),
    // not throwaway spike code against synthetic input.
    source: 'production',
    verdict: checkBudget({ normalizedMs: measured, budgetMs: budget.thresholdMs }),
  }
  await commands.recordMeasurement(row)

  expect(() => assertWithinBudget(row)).not.toThrow()
})
