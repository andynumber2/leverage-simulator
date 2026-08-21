/**
 * scripts/build-sweep-fixture.ts
 *
 * D-03/D-08/D-09/D-10/D-11: the offline sweep that produces the committed Phase 6 design-pass
 * fixture. Runs the real Phase 3 kernel over a 200 (entry date) by 50 (leverage) grid of SPX
 * total-return, fixed 20-year holding period, and serializes the result through
 * `src/data/sweep-fixture-format.ts` to
 * `.planning/phases/06-heatmap-design-pass/mockups/sweep-fixture.bin`.
 *
 * Reaches the kernel only through `buildKernelInputs` plus `runBacktest`, the exact seam
 * `scripts/run-backtest.ts` uses (SIM-10): this script does not import `seriesView` or
 * `decodeHeader` directly and does not re-implement the manifest/asset byte path.
 *
 * Deterministic: takes no arguments, reads no clock and no randomness. The JSON meta block's key
 * order is authored once, in `sweep-fixture-format.ts`'s `toOrderedMeta`, so two runs over an
 * unchanged bundle produce a byte-identical file.
 */

import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { fromDaysSinceEpoch, indexOfDate, toDaysSinceEpoch } from '../tools/bundle-compiler/src/calendar.ts'
import { runBacktest } from '../src/kernel/backtest.ts'
import { buildKernelInputs, type BacktestRequest } from '../src/data/kernel-inputs.ts'
import { loadBundleFromDisk } from '../src/data/load-bundle-node.ts'
import { DOMAIN_LOG_MAX, DOMAIN_LOG_MIN } from '../src/colorscale/value-to-color.ts'
import {
  CELL_FLAG_INCOMPLETE,
  CELL_FLAG_RUINED,
  encodeSweepFixture,
  type SweepFixture,
  type SweepFixtureMeta,
} from '../src/data/sweep-fixture-format.ts'
import { FINANCING_SPREAD_DEFAULT, GENERIC_3X_EXPENSE_RATIO } from '../src/validation/cost-parameters.ts'

/** D-09: 200 entry columns. */
const ENTRY_COLS = 200
/** D-08: 50 leverage rows. */
const LEVERAGE_ROWS = 50
/** D-08: leverage runs 1.00x to 5.00x inclusive over the 50 rows, ~0.0816x steps. */
const LEVERAGE_MIN = 1
const LEVERAGE_MAX = 5
/** D-10/D-11: a fixed 20-year holding period, never hold-to-today. */
const HOLDING_YEARS = 20
/** D-11. */
const SWEEP_SYMBOL = 'SPX'
const SWEEP_SERIES_ID = 'SPX/total-return'

const INITIAL_INVESTMENT = 10_000

const OUTPUT_PATH = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  '.planning/phases/06-heatmap-design-pass/mockups/sweep-fixture.bin',
)

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * First index in `calendar[0..calendar.length-1]` whose stored day number is `>= target`, or
 * `calendar.length` when no such index exists (i.e. `target` falls after the calendar's last
 * bar). Standard lower-bound binary search over the ascending calendar array, mirroring
 * `src/data/contribution-schedule.ts`'s own unexported `lowerBound` (not imported from there:
 * that helper is scoped to a bounded run window, this script searches the full calendar).
 */
function lowerBoundFullCalendar(calendar: Int32Array, target: number): number {
  let low = 0
  let high = calendar.length
  while (low < high) {
    const mid = (low + high) >>> 1
    const value = calendar[mid]
    if (value !== undefined && value < target) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  return low
}

/**
 * The entry date plus `HOLDING_YEARS` calendar years, as a days-since-epoch integer. Clamps the
 * day-of-month to the target month's last day (the same Feb-29-in-a-non-leap-target-year
 * discipline `src/data/contribution-schedule.ts`'s monthly/quarterly/yearly stepping already
 * uses), rather than letting `Date.UTC` silently roll the date into the following month.
 */
function targetExitDays(entryDays: number): number {
  const iso = fromDaysSinceEpoch(entryDays)
  const parts = iso.split('-')
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  const targetYear = year + HOLDING_YEARS
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, month, 0)).getUTCDate()
  const clampedDay = Math.min(day, lastDayOfTargetMonth)
  return toDaysSinceEpoch(`${targetYear}-${pad2(month)}-${pad2(clampedDay)}`)
}

async function main(): Promise<void> {
  const bundle = await loadBundleFromDisk()

  const seriesEntry = bundle.manifest.series.find((s) => s.id === SWEEP_SERIES_ID)
  if (seriesEntry === undefined) {
    const ids = bundle.manifest.series.map((s) => s.id).sort()
    throw new Error(
      `build-sweep-fixture: no series named "${SWEEP_SERIES_ID}" in the compiled manifest; existing series ids: ${ids.join(', ')}`,
    )
  }
  const strictTier = seriesEntry.tiers.strict
  if (strictTier === null) {
    throw new Error(`build-sweep-fixture: "${SWEEP_SERIES_ID}" has no strict tier in the compiled manifest`)
  }

  const firstCalIndex = indexOfDate({ days: bundle.calendar }, toDaysSinceEpoch(strictTier.firstDate))
  const lastCalIndex = indexOfDate({ days: bundle.calendar }, toDaysSinceEpoch(strictTier.lastDate))
  if (firstCalIndex === -1 || lastCalIndex === -1) {
    throw new Error(
      `build-sweep-fixture: strict tier bounds [${strictTier.firstDate}, ${strictTier.lastDate}] for "${SWEEP_SERIES_ID}" ` +
        'do not resolve to trading sessions in the compiled calendar',
    )
  }

  const entryDates: string[] = new Array(ENTRY_COLS)
  const entryAbsIndices: number[] = new Array(ENTRY_COLS)
  for (let col = 0; col < ENTRY_COLS; col++) {
    const entryAbsIndex =
      firstCalIndex + Math.round((col * (lastCalIndex - firstCalIndex)) / (ENTRY_COLS - 1))
    const days = bundle.calendar[entryAbsIndex]
    if (days === undefined) {
      throw new Error(`build-sweep-fixture: computed entry calendar index ${entryAbsIndex} is out of range`)
    }
    entryAbsIndices[col] = entryAbsIndex
    entryDates[col] = fromDaysSinceEpoch(days)
  }

  const leverages: number[] = new Array(LEVERAGE_ROWS)
  for (let row = 0; row < LEVERAGE_ROWS; row++) {
    leverages[row] = LEVERAGE_MIN + (row * (LEVERAGE_MAX - LEVERAGE_MIN)) / (LEVERAGE_ROWS - 1)
  }

  // The script's own three fixture-level accumulator buffers (SIM-11 discipline extended to this
  // script's own outer loop): allocated exactly once, written into by index, never reallocated or
  // re-pushed-to across the 10,000-cell sweep below.
  const cellCount = ENTRY_COLS * LEVERAGE_ROWS
  const multiples = new Float32Array(cellCount)
  const drawdowns = new Float32Array(cellCount)
  const flags = new Uint8Array(cellCount)

  let ruinedCount = 0
  let incompleteCount = 0
  let minMultiple = Number.POSITIVE_INFINITY
  let maxMultiple = Number.NEGATIVE_INFINITY
  let clippedBelowCount = 0
  let clippedAboveCount = 0
  const domainMin = 10 ** DOMAIN_LOG_MIN
  const domainMax = 10 ** DOMAIN_LOG_MAX

  const expenseRatioPercent = GENERIC_3X_EXPENSE_RATIO * 100
  const financingSpreadPercent = FINANCING_SPREAD_DEFAULT * 100

  for (let row = 0; row < LEVERAGE_ROWS; row++) {
    const leverage = leverages[row]!
    for (let col = 0; col < ENTRY_COLS; col++) {
      // A-E5: row-major, index = leverageRow * ENTRY_COLS + entryColumn.
      const cellIndex = row * ENTRY_COLS + col
      const entryDate = entryDates[col]!
      const entryAbsIndex = entryAbsIndices[col]!

      const exitDays = targetExitDays(bundle.calendar[entryAbsIndex]!)
      const exitAbsIndex = lowerBoundFullCalendar(bundle.calendar, exitDays)

      if (exitAbsIndex >= bundle.calendar.length) {
        // D-19: the target 20-year exit date falls after the calendar's last bar. Flag
        // incomplete, write 0 into both metric arrays, and never call the kernel for this cell
        // (D-20: an incomplete cell can never carry a partial value).
        flags[cellIndex] = CELL_FLAG_INCOMPLETE
        multiples[cellIndex] = 0
        drawdowns[cellIndex] = 0
        incompleteCount++
        continue
      }

      const holdingPeriodBars = exitAbsIndex - entryAbsIndex + 1

      const request: BacktestRequest = {
        symbol: SWEEP_SYMBOL,
        dividendReinvest: true,
        leverage,
        entryDate,
        holdingPeriodBars,
        initialInvestment: INITIAL_INVESTMENT,
        contributionAmount: 0,
        contributionFrequency: 'none',
        expenseRatioPercent,
        financingSpreadPercent,
      }

      let multiple: number
      let drawdown: number
      let ruined: boolean
      try {
        const inputs = buildKernelInputs(bundle, request)
        const result = runBacktest(inputs.params, inputs.series, inputs.outputs)
        multiple = result.totalContributed > 0 ? result.finalValue / result.totalContributed : 0
        drawdown = result.maxDrawdown
        ruined = result.ruined
      } catch (err) {
        throw new Error(
          `build-sweep-fixture: cell (row=${row}, col=${col}, leverage=${leverage}, entryDate=${entryDate}) failed: ` +
            `${err instanceof Error ? err.message : String(err)}`,
        )
      }

      multiples[cellIndex] = multiple
      drawdowns[cellIndex] = drawdown
      flags[cellIndex] = ruined ? CELL_FLAG_RUINED : 0

      if (ruined) ruinedCount++
      if (multiple < minMultiple) minMultiple = multiple
      if (multiple > maxMultiple) maxMultiple = multiple
      if (multiple < domainMin) clippedBelowCount++
      if (multiple > domainMax) clippedAboveCount++
    }
  }

  if (!Number.isFinite(minMultiple)) minMultiple = 0
  if (!Number.isFinite(maxMultiple)) maxMultiple = 0

  const meta: SweepFixtureMeta = {
    bundleVersion: bundle.manifest.bundleVersion,
    symbol: SWEEP_SYMBOL,
    dividendReinvest: true,
    entryDates,
    leverages,
    holdingYears: HOLDING_YEARS,
    initialInvestment: INITIAL_INVESTMENT,
    expenseRatioPercent,
    financingSpreadPercent,
    ruinedCount,
    incompleteCount,
    minMultiple,
    maxMultiple,
    clippedBelowCount,
    clippedAboveCount,
  }

  const fixture: SweepFixture = {
    cols: ENTRY_COLS,
    rows: LEVERAGE_ROWS,
    meta,
    multiples,
    drawdowns,
    flags,
  }

  const encoded = encodeSweepFixture(fixture)
  writeFileSync(OUTPUT_PATH, encoded)

  process.stdout.write(`build-sweep-fixture: bundleVersion=${bundle.manifest.bundleVersion}\n`)
  process.stdout.write(`build-sweep-fixture: cols=${ENTRY_COLS} rows=${LEVERAGE_ROWS} cellCount=${cellCount}\n`)
  process.stdout.write(
    `build-sweep-fixture: entryDates=[${entryDates[0]}..${entryDates[ENTRY_COLS - 1]}] leverages=[${leverages[0]}..${leverages[LEVERAGE_ROWS - 1]}]\n`,
  )
  process.stdout.write(`build-sweep-fixture: ruinedCount=${ruinedCount}\n`)
  process.stdout.write(`build-sweep-fixture: incompleteCount=${incompleteCount}\n`)
  process.stdout.write(`build-sweep-fixture: minMultiple=${minMultiple}\n`)
  process.stdout.write(`build-sweep-fixture: maxMultiple=${maxMultiple}\n`)
  process.stdout.write(`build-sweep-fixture: clippedBelowCount=${clippedBelowCount}\n`)
  process.stdout.write(`build-sweep-fixture: clippedAboveCount=${clippedAboveCount}\n`)
  process.stdout.write(`build-sweep-fixture: wrote ${encoded.byteLength} bytes to ${OUTPUT_PATH}\n`)
}

main().catch((err: unknown) => {
  process.stderr.write(`build-sweep-fixture: ${(err as Error).message}\n`)
  process.exitCode = 1
})
