/**
 * bench/sweep-pool-profile.bench.test.ts
 *
 * 07.1-01-PLAN.md Task 1 (ROADMAP success criterion 1): a diagnostic-only bench arm that records
 * exclusively through the info-line channel (never the gated measurement-row channel -- see this
 * file's own tests, which call only `commands.recordInfoLine`), attributing the PERF-03 headline
 * figure's wall clock to its component costs -- pool construction, worker startup (cold vs warm
 * sweep), per-cell kernel time with zero pool involvement, and the dispatch/transfer/idle residual
 * -- and doing the same for the D-24 solveIrr contribution-schedule branch, plus that branch's
 * measured cash-flow count and npv-evaluations-per-solve ratio.
 *
 * Not a throwaway: stays committed as the standing, re-runnable measurement this and every later
 * plan in this phase reads its attribution from. Deliberately kept separate from
 * bench/sweep.bench.test.ts's measureMinOfN closure (07.1-RESEARCH.md Pattern 2), and never
 * modifies that file, so none of this file's instrumentation can perturb the gated PERF-03 figure
 * it exists to explain.
 */

import { commands } from 'vitest/browser'
import { beforeAll, test } from 'vitest'

import { runBacktest } from '../src/kernel/backtest.ts'
import { LONG_GAP_FLAG_MIN_DAYS, type KernelOutputs, type KernelParams } from '../src/kernel/backtest.types.ts'
import type { LoadedBundle } from '../src/data/bundle-source.ts'
import { loadBundleFromFetch } from '../src/data/load-bundle-browser.ts'
import { FINANCING_SPREAD_DEFAULT, GENERIC_3X_EXPENSE_RATIO } from '../src/validation/cost-parameters.ts'
import { resolveEntryDateBounds } from '../src/app/bounds.ts'
import { resolveColumnSeries, type ColumnSeriesRequest } from '../src/sweep/resolve-column-series.ts'
import {
  SWEEP_COLS,
  SWEEP_ROWS,
  createSweepGrid,
  leverageForRow,
  type SweepGrid,
  type SweepGridMeta,
} from '../src/sweep/sweep-grid.ts'
import { createSweepPool, type SweepBaseParams, type SweepPool } from '../src/sweep/sweep-pool.ts'
import { computeChunkMetrics, type SweepChunkRequest } from '../src/sweep/sweep.worker.ts'
import { buildCashFlows, npv, solveIrr, type CashFlow } from '../src/metrics/irr.ts'
import { fromDaysSinceEpoch, indexOfDate, toDaysSinceEpoch } from '../tools/bundle-compiler/src/calendar.ts'
import { measureMinOfN, normalize } from './calibration.ts'
import { resolveRunCalibration } from './canonical-calibration.ts'
import { captureEnvironment } from './environment-block.ts'
import { formatMeasured } from './report.ts'
// BASELINE_WORKER_COUNT: quick-260818-v2d's pinned pool width -- reused rather than redeclared,
// same reason bench/sweep.bench.test.ts reuses it (this file's own pool width can never disagree
// with the gated file's).
import { BASELINE_WORKER_COUNT } from './sweep-pool.ts'

const SYMBOL = 'SPX'
const DIVIDEND_REINVEST = true
const INITIAL_INVESTMENT = 10_000

/** Zero-contribution (CAGR) arms and the pool-level IRR arm: sized to keep this file's own
 * standing cost small against BENCH_TOTAL_RUNTIME_CAP_MS while still exercising a real
 * multi-chunk pool run (BASELINE_WORKER_COUNT * CHUNKS_PER_WORKER chunks) at the full SWEEP_ROWS
 * row count -- narrower than SWEEP_COLS (200) precisely because this file's cost is additive on
 * top of the gated bench/sweep.bench.test.ts's own runtime. */
const PROFILE_COLS = 24

/** The serial solveIrr arm: narrower than PROFILE_COLS because a serial (single-thread,
 * zero-pool, zero-dispatch) computeChunkMetrics call over the solveIrr branch is measurably more
 * expensive per cell than the CAGR branch (07.1-RESEARCH.md Summary: bisection over up to
 * ~1,176 cash flows per cell versus one closed-form Math.pow call), so this arm stays narrower to
 * keep its own wall-clock cost small. */
const IRR_PROFILE_COLS = 8

/** A representative leverage row for the cashFlowCount/npvEvaluationsPerSolve figures below: row
 * 25 of 50, leverageForRow(25) ~= 3.04x -- roughly the middle of the swept 1x-5x axis, not an
 * edge case. Cash-flow count depends on entry date (hold length), not leverage, so any single row
 * is representative for that figure; the specific row is recorded alongside every figure it
 * produced. */
const REPRESENTATIVE_ROW = 25

/** Large enough that both the npv-only and the solveIrr batch clear MIN_MEASUREMENT_MS with
 * comfortable margin (solveIrr's own bisection loop runs up to 100 npv evaluations per call over
 * the same cash-flow list) -- recorded alongside the ratio it produced, per this task's own
 * requirement. */
const NPV_SOLVE_BATCH_SIZE = 5000

function baseParams(overrides: Partial<SweepBaseParams> = {}): SweepBaseParams {
  return {
    symbol: SYMBOL,
    dividendReinvest: DIVIDEND_REINVEST,
    initialInvestment: INITIAL_INVESTMENT,
    contributionAmount: 0,
    contributionFrequency: 'none',
    expenseRatioPercent: GENERIC_3X_EXPENSE_RATIO * 100,
    financingSpreadPercent: FINANCING_SPREAD_DEFAULT * 100,
    holdingPeriodBars: null,
    ...overrides,
  }
}

/** Same construction as bench/sweep.bench.test.ts's buildEarlyEntryDates: the first SWEEP_COLS
 * real trading sessions from the extended tier's own earliest date, so this file's columns are
 * the same shape (99.15%+ of the longest column's bar count) as the gated file's -- every arm
 * below slices whatever narrower width it needs from this one shared axis, never a separately
 * constructed one that could quietly drift shape. */
function buildEarlyEntryDates(bundle: LoadedBundle): string[] {
  const bounds = resolveEntryDateBounds(bundle.manifest, SYMBOL, DIVIDEND_REINVEST, 'extended')
  if (!bounds.ok) {
    throw new Error(
      `sweep-pool-profile: could not resolve extended-tier entry-date bounds for ${SYMBOL}: ${bounds.reason}`,
    )
  }
  const startAbsIndex = indexOfDate({ days: bundle.calendar }, toDaysSinceEpoch(bounds.firstDate))
  if (startAbsIndex === -1) {
    throw new Error(`sweep-pool-profile: extended-tier firstDate "${bounds.firstDate}" is not a calendar trading session`)
  }
  const dates: string[] = []
  for (let i = 0; i < SWEEP_COLS; i++) {
    const days = bundle.calendar[startAbsIndex + i]
    if (days === undefined) {
      throw new Error(`sweep-pool-profile: calendar index ${startAbsIndex + i} is out of range building the entry-date axis`)
    }
    dates.push(fromDaysSinceEpoch(days))
  }
  return dates
}

function columnRequestFor(params: SweepBaseParams, entryDate: string): ColumnSeriesRequest {
  return {
    symbol: params.symbol,
    dividendReinvest: params.dividendReinvest,
    entryDate,
    holdingPeriodBars: params.holdingPeriodBars,
    contributionAmount: params.contributionAmount,
    contributionFrequency: params.contributionFrequency,
  }
}

function makeMeta(entryDates: readonly string[], params: SweepBaseParams): SweepGridMeta {
  // Display metadata neither runSweep nor computeChunkMetrics ever reads -- placeholder values
  // are safe here because nothing in this file asserts against them (mirrors
  // bench/sweep.bench.test.ts's own makeMeta).
  return {
    bundleVersion: 'bench',
    symbol: params.symbol,
    dividendReinvest: params.dividendReinvest,
    entryDates,
    leverages: Array.from({ length: SWEEP_ROWS }, (_, row) => leverageForRow(row)),
    holdingYears: 0,
    initialInvestment: params.initialInvestment,
    expenseRatioPercent: params.expenseRatioPercent,
    financingSpreadPercent: params.financingSpreadPercent,
    ruinedCount: 0,
    incompleteCount: 0,
    minMultiple: 0,
    maxMultiple: 0,
    clippedBelowCount: 0,
    clippedAboveCount: 0,
    holdMode: 'end-of-data',
    endOfDataDate: '',
  }
}

function chunkRequestFor(params: SweepBaseParams, columnEntryDates: readonly string[], generation: number): SweepChunkRequest {
  const colCount = columnEntryDates.length
  return {
    generation,
    params,
    columnIndices: Array.from({ length: colCount }, (_, i) => i),
    entryDates: columnEntryDates.slice(),
    rowIndices: Array.from({ length: SWEEP_ROWS }, (_, i) => i),
  }
}

/** Resolves one column and runs the backtest for REPRESENTATIVE_ROW, returning the cash-flow
 * sequence buildCashFlows produces for it -- exactly the two calls src/sweep/sweep.worker.ts's
 * computeChunkMetrics makes inside each pool worker for the solveIrr branch. */
function buildFlowsFor(bundle: LoadedBundle, params: SweepBaseParams, entryDate: string): CashFlow[] {
  const resolution = resolveColumnSeries(bundle, columnRequestFor(params, entryDate))
  if (resolution.incomplete) {
    throw new Error(
      `sweep-pool-profile: expected an open-ended hold (holdingPeriodBars: null), which can never ` +
        `overrun (D-29) and therefore can never be incomplete (entryDate=${entryDate})`,
    )
  }
  const outputs: KernelOutputs = {
    outValue: new Float64Array(resolution.barCount),
    outRuined: new Uint8Array(resolution.barCount),
    outLongGap: new Uint8Array(resolution.barCount),
  }
  const kernelParams: KernelParams = {
    leverage: leverageForRow(REPRESENTATIVE_ROW),
    initialInvestment: params.initialInvestment,
    contributionAmount: params.contributionAmount,
    financingSpread: params.financingSpreadPercent / 100,
    expenseRatio: params.expenseRatioPercent / 100,
    longGapMinDays: LONG_GAP_FLAG_MIN_DAYS,
  }
  const result = runBacktest(kernelParams, resolution, outputs)
  return buildCashFlows(kernelParams, resolution, outputs, result)
}

let bundle: LoadedBundle
let entryDates: string[]
let pool: SweepPool

beforeAll(async () => {
  bundle = await loadBundleFromFetch()
  entryDates = buildEarlyEntryDates(bundle)
  // This file's OWN pool, constructed in its OWN beforeAll -- does not import
  // bench/sweep.bench.test.ts's module-level state (each bench file is its own module, per
  // 07.1-PATTERNS.md). Pinned to the declared baseline width via BASELINE_WORKER_COUNT, same as
  // the gated file, so every figure below is denominated against the same pool width PERF-03 is.
  pool = createSweepPool({ workerCount: BASELINE_WORKER_COUNT })
})

test('sweep-pool-profile: attributed breakdown, zero-contribution (CAGR) branch', async () => {
  // D-18: every bench run must stamp a full environment block, this file included, even though
  // it records no duration row.
  const score = await resolveRunCalibration()
  await commands.recordEnvironment(captureEnvironment(score))

  const params = baseParams()
  const profileEntryDates = entryDates.slice(0, PROFILE_COLS)
  const grid: SweepGrid = createSweepGrid(PROFILE_COLS, SWEEP_ROWS, makeMeta(profileEntryDates, params))

  // poolConstructionMs: a performance.now() delta across a FRESH createSweepPool call -- the
  // shared `pool` from beforeAll stays untouched here so this fresh one alone answers "how much
  // does constructing BASELINE_WORKER_COUNT workers cost."
  const constructionStart = performance.now()
  const freshPool = createSweepPool({ workerCount: BASELINE_WORKER_COUNT })
  const poolConstructionMs = performance.now() - constructionStart

  // coldSweepMs: the FIRST runSweep against that fresh pool -- carries each worker's module
  // evaluation and its one-time loadBundleFromFetch decode.
  const coldSweepMs = await measureMinOfN(1, async () => {
    await freshPool.runSweep(grid, { generation: 1, params, entryDates: profileEntryDates })
  })

  // warmSweepMs: a SECOND runSweep at a later generation against the SAME pool, no other change
  // -- coldSweepMs minus warmSweepMs is the worker-startup figure criterion 1 asks for.
  const warmSweepMs = await measureMinOfN(1, async () => {
    await freshPool.runSweep(grid, { generation: 2, params, entryDates: profileEntryDates })
  })

  freshPool.dispose()

  // serialKernelMs: a direct, synchronous call to computeChunkMetrics on the CALLING thread --
  // zero pool, zero dispatch, zero transfer. This is the pure per-cell kernel cost.
  const serialStart = performance.now()
  const serialResult = computeChunkMetrics(bundle, chunkRequestFor(params, profileEntryDates, 1))
  const serialKernelMs = performance.now() - serialStart
  const serialCellCount = serialResult.multiples.length

  // Derived, each labelled as derived rather than measured, per this task's own requirement.
  const idealParallelMs = serialKernelMs / pool.workerCount
  const poolOverheadMs = warmSweepMs - idealParallelMs
  const perCellKernelUs = (serialKernelMs * 1000) / (PROFILE_COLS * SWEEP_ROWS)
  const extrapolatedFullGridSerialMs = (perCellKernelUs * SWEEP_COLS * SWEEP_ROWS) / 1000

  const hardwareConcurrency = navigator.hardwareConcurrency
  await commands.recordInfoLine(
    'sweep-pool-profile-cagr',
    'sweep-pool-profile CAGR (zero-contribution) branch: ' +
      `cols=${PROFILE_COLS} rows=${SWEEP_ROWS} cells=${PROFILE_COLS * SWEEP_ROWS} serialCellCount=${serialCellCount} ` +
      `hardwareConcurrency=${hardwareConcurrency} workerCount=${pool.workerCount} ` +
      `poolConstructionMs=${formatMeasured(poolConstructionMs)} normalizedPoolConstructionMs=${formatMeasured(normalize(poolConstructionMs, score))} ` +
      `coldSweepMs=${formatMeasured(coldSweepMs)} normalizedColdSweepMs=${formatMeasured(normalize(coldSweepMs, score))} ` +
      `warmSweepMs=${formatMeasured(warmSweepMs)} normalizedWarmSweepMs=${formatMeasured(normalize(warmSweepMs, score))} ` +
      `workerStartupMs=${formatMeasured(coldSweepMs - warmSweepMs)} (derived, coldSweepMs - warmSweepMs) ` +
      `serialKernelMs=${formatMeasured(serialKernelMs)} normalizedSerialKernelMs=${formatMeasured(normalize(serialKernelMs, score))} ` +
      `idealParallelMs=${formatMeasured(idealParallelMs)} (derived, serialKernelMs / workerCount) ` +
      `poolOverheadMs=${formatMeasured(poolOverheadMs)} (derived, warmSweepMs - idealParallelMs) ` +
      `perCellKernelUs=${formatMeasured(perCellKernelUs)} (derived) ` +
      `extrapolatedFullGridSerialMs=${formatMeasured(extrapolatedFullGridSerialMs)} (derived, extrapolated to SWEEP_COLS x SWEEP_ROWS)`,
  )
})

test('sweep-pool-profile: attributed breakdown, D-24 solveIrr contribution-schedule branch', async () => {
  const score = await resolveRunCalibration()
  await commands.recordEnvironment(captureEnvironment(score))

  const params = baseParams({ contributionAmount: 250, contributionFrequency: 'monthly' })
  const profileEntryDates = entryDates.slice(0, PROFILE_COLS)
  const grid: SweepGrid = createSweepGrid(PROFILE_COLS, SWEEP_ROWS, makeMeta(profileEntryDates, params))

  // warmSweepMs: the SAME shared pool from beforeAll, which has run no sweep before this test in
  // file declaration order -- a discarded warm-up call first (so this branch's own first-call
  // cost, e.g. any lazy scratch-array growth in the workers, does not land in the measured
  // figure), then the measured call, mirroring the CAGR arm's own cold-vs-warm distinction.
  await pool.runSweep(grid, { generation: 3, params, entryDates: profileEntryDates })
  const warmSweepMs = await measureMinOfN(1, async () => {
    await pool.runSweep(grid, { generation: 4, params, entryDates: profileEntryDates })
  })

  // serialKernelMs: computeChunkMetrics on the calling thread, at the narrower IRR_PROFILE_COLS
  // width (see this constant's own doc comment for why).
  const irrEntryDates = entryDates.slice(0, IRR_PROFILE_COLS)
  const serialStart = performance.now()
  const serialResult = computeChunkMetrics(bundle, chunkRequestFor(params, irrEntryDates, 1))
  const serialKernelMs = performance.now() - serialStart
  const serialCellCount = serialResult.multiples.length

  // cashFlowCount, measured for both the first and the last column of the tested (IRR_PROFILE_COLS)
  // axis -- 07.1-RESEARCH.md Open Question 3 asks specifically whether solveIrr's per-cell cost is
  // uniform across the tested axis, and a single column cannot answer that.
  const firstEntryDate = irrEntryDates[0]!
  const lastEntryDate = irrEntryDates[irrEntryDates.length - 1]!
  const firstFlows = buildFlowsFor(bundle, params, firstEntryDate)
  const lastFlows = buildFlowsFor(bundle, params, lastEntryDate)
  const cashFlowCountRatio = lastFlows.length / firstFlows.length

  // npvEvaluationsPerSolve: measured, not counted from source. A batch of npv() calls against the
  // FIRST column's flows gives npvMs; the same batch of solveIrr() calls (over the same flows)
  // gives solveIrrMs; solveIrrMs / npvMs is the implied evaluation count.
  const npvStart = performance.now()
  for (let i = 0; i < NPV_SOLVE_BATCH_SIZE; i++) {
    npv(0.05, firstFlows)
  }
  const npvMs = performance.now() - npvStart

  const solveIrrStart = performance.now()
  for (let i = 0; i < NPV_SOLVE_BATCH_SIZE; i++) {
    solveIrr(firstFlows)
  }
  const solveIrrMs = performance.now() - solveIrrStart
  const npvEvaluationsPerSolve = solveIrrMs / npvMs

  const hardwareConcurrency = navigator.hardwareConcurrency
  const leverage = leverageForRow(REPRESENTATIVE_ROW)
  await commands.recordInfoLine(
    'sweep-pool-profile-irr',
    'sweep-pool-profile D-24 solveIrr (monthly contribution) branch: ' +
      `warmSweepCols=${PROFILE_COLS} serialCols=${IRR_PROFILE_COLS} rows=${SWEEP_ROWS} ` +
      `serialCellCount=${serialCellCount} hardwareConcurrency=${hardwareConcurrency} workerCount=${pool.workerCount} ` +
      `warmSweepMs=${formatMeasured(warmSweepMs)} normalizedWarmSweepMs=${formatMeasured(normalize(warmSweepMs, score))} ` +
      `serialKernelMs=${formatMeasured(serialKernelMs)} normalizedSerialKernelMs=${formatMeasured(normalize(serialKernelMs, score))} ` +
      `idealParallelMs=${formatMeasured(serialKernelMs / pool.workerCount)} (derived, serialKernelMs / workerCount) ` +
      `poolOverheadMs=${formatMeasured(warmSweepMs - serialKernelMs / pool.workerCount)} (derived, warmSweepMs - idealParallelMs) ` +
      `representativeRow=${REPRESENTATIVE_ROW} representativeLeverage=${leverage.toFixed(4)} ` +
      `cashFlowCountFirst=${firstFlows.length} cashFlowCountFirstEntryDate=${firstEntryDate} ` +
      `cashFlowCountLast=${lastFlows.length} cashFlowCountLastEntryDate=${lastEntryDate} ` +
      `cashFlowCountRatio=${formatMeasured(cashFlowCountRatio)} ` +
      `npvEvaluationsPerSolve=${formatMeasured(npvEvaluationsPerSolve)} batchSize=${NPV_SOLVE_BATCH_SIZE} ` +
      `npvMs=${formatMeasured(npvMs)} solveIrrMs=${formatMeasured(solveIrrMs)}`,
  )
})
