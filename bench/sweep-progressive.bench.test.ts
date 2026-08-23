/**
 * bench/sweep-progressive.bench.test.ts
 *
 * 07-05-PLAN.md Task 3: the single recorder of both the PERF-04 and PERF-06 `MeasurementRow`s.
 * Both arms run against the real bundle through the real production pool (`src/sweep/
 * sweep-pool.ts`'s `createSweepPool`), never a synthetic stand-in for the sweep mechanism itself.
 *
 * PERF-04 measures the coarse pass at its real, shipped shape: `COARSE_COL_STRIDE`/
 * `COARSE_ROW_STRIDE` (imported from `src/app/state.ts`, not re-declared here) applied to the
 * real `SWEEP_COLS`/`SWEEP_ROWS` axes, painted through the real `paintSweepField`. Correctness
 * (a complete field, zero holes) is asserted before the timing is trusted, following the
 * discipline every other bench file in this project already carries.
 *
 * PERF-06 measures the O(1) main-thread generation-bump cost `sweep-pool.ts`'s `runSweep`
 * performs when a new sweep starts while a prior one is in flight -- the actual value is expected
 * to be small enough that it needs `measureBatchedMinOfN` (like DATA-BUNDLE-DECODE) rather than
 * `measureMinOfN`, and small enough to keep well inside `BENCH_TOTAL_RUNTIME_CAP_MS`, this arm
 * runs against a deliberately small (but real, real-pool, real-bundle) grid -- the same
 * reduced-but-real-system discipline `bench/sweep.bench.test.ts`'s `SERIAL_REFERENCE_SAMPLE_COUNT`
 * already establishes for a different correctness check. Correctness is asserted before the
 * timing is trusted too: at least one stale chunk from the superseded (victim) generation is
 * proven never to have reached its own grid, and the pool's worker count is proven unchanged
 * across the whole cancel storm.
 */

import { commands } from 'vitest/browser'
import { beforeAll, expect, test } from 'vitest'

import { MANIFEST_PATH } from '../src/data-bundle.generated.ts'
import { CELL_FLAG_INCOMPLETE, CELL_FLAG_RUINED } from '../src/data/sweep-fixture-format.ts'
import { paintSweepField } from '../src/heatmap/paint-contour.ts'
import { COARSE_COL_STRIDE, COARSE_ROW_STRIDE, strideIndices } from '../src/app/state.ts'
import { createSweepGrid, leverageForRow, SWEEP_COLS, SWEEP_ROWS, type SweepGrid, type SweepGridMeta } from '../src/sweep/sweep-grid.ts'
import {
  createSweepPool,
  type SweepBaseParams,
  type SweepPool,
  type SweepRunHandle,
  type SweepRunRequest,
} from '../src/sweep/sweep-pool.ts'
import { PERF_BUDGETS } from '../perf-budgets.ts'
import { measureBatchedMinOfN, measureMinOfN, normalize, REPEAT_COUNT } from './calibration.ts'
import { resolveRunCalibration } from './canonical-calibration.ts'
import { captureEnvironment } from './environment-block.ts'
import { assertWithinBudget, checkBudget, type MeasurementRow } from './report.ts'

/** PERF-06's starting batch size (doubled at runtime, never hand-tuned in advance, mirroring
 * `bench/decode-time.bench.test.ts`'s own doubling loop for a sub-floor operation): the O(1)
 * main-thread generation bump this measures is fast enough that a small batch clears in well
 * under `MIN_MEASUREMENT_MS`, so the batch grows until the measured minimum clears the floor. */
const PERF06_INITIAL_BATCH_SIZE = 200

/** Safety ceiling on the doubling loop, mirroring `bench/decode-time.bench.test.ts`'s own
 * `MAX_DECODE_BATCH_SIZE` guard: a pathological environment fails loudly (naming the batch size
 * reached) rather than looping toward `BENCH_TOTAL_RUNTIME_CAP_MS` silently. */
const PERF06_MAX_BATCH_SIZE = PERF06_INITIAL_BATCH_SIZE * 2 ** 6

/** Deliberately small (real, not synthetic) grid dimensions for PERF-06's cancel-storm
 * measurement, over a single-worker pool -- what is being timed is the O(1) main-thread
 * generation bump, not sweep throughput, so the smallest genuinely real grid (one column, one
 * row) proves the same mechanism at a fraction of the compute cost a full 200x50 grid across a
 * full-width pool would spend per cancel; every one of the (potentially several thousand)
 * dispatched chunks below is still a real column-series resolution and a real backtest against
 * the real bundle, through the real production pool. */
const PERF06_SMALL_COLS = 1
const PERF06_SMALL_ROWS = 1

let entryDate: string
let params: SweepBaseParams

function testMeta(entryDates: readonly string[], leverages: readonly number[]): SweepGridMeta {
  return {
    bundleVersion: 'bench',
    symbol: params.symbol,
    dividendReinvest: params.dividendReinvest,
    entryDates,
    leverages,
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
    endOfDataDate: entryDate,
  }
}

/** Asserts `grid` is a COMPLETE field: every cell is either categorical (ruined/incomplete) or a
 * finite value -- zero holes. Thrown before any timing figure derived from `grid` is trusted, so
 * a fast-because-it-painted-nothing figure can never pass (Task 3's own instruction). */
function assertGridComplete(grid: SweepGrid): void {
  const cellCount = grid.cols * grid.rows
  let holes = 0
  for (let i = 0; i < cellCount; i++) {
    const flag = grid.flags[i] ?? 0
    const isCategorical = (flag & (CELL_FLAG_RUINED | CELL_FLAG_INCOMPLETE)) !== 0
    const value = grid.multiples[i] ?? Number.NaN
    if (!isCategorical && !Number.isFinite(value)) {
      holes += 1
    }
  }
  if (holes > 0) {
    throw new Error(
      `sweep-progressive bench: coarse grid has ${holes} hole(s) out of ${cellCount} cells -- ` +
        'neither categorical nor finite; the timing figure this guards is not trustworthy',
    )
  }
}

beforeAll(async () => {
  const manifestResponse = await fetch(MANIFEST_PATH)
  const manifest = (await manifestResponse.json()) as {
    series: Array<{ id: string; tiers: { strict: { firstDate: string } | null } }>
  }
  const spxTotalReturn = manifest.series.find((s) => s.id === 'SPX/total-return')
  if (spxTotalReturn === undefined || spxTotalReturn.tiers.strict === null) {
    throw new Error('sweep-progressive bench: manifest has no SPX/total-return strict-tier entry')
  }
  entryDate = spxTotalReturn.tiers.strict.firstDate
  params = {
    symbol: 'SPX',
    dividendReinvest: true,
    initialInvestment: 10_000,
    contributionAmount: 0,
    contributionFrequency: 'none',
    expenseRatioPercent: 0.9,
    financingSpreadPercent: 0.5,
    holdingPeriodBars: null,
  }
})

// --- PERF-04: the coarse pass's own real shape, measured against the shipped path ------------

test('PERF-04: the coarse pass paints a complete field within budget, over the real bundle through the production pool', async () => {
  const score = await resolveRunCalibration()

  const coarseColPositions = strideIndices(SWEEP_COLS, COARSE_COL_STRIDE)
  const coarseRowIndices = strideIndices(SWEEP_ROWS, COARSE_ROW_STRIDE)
  const coarseEntryDates: string[] = coarseColPositions.map(() => entryDate)
  const coarseLeverages = coarseRowIndices.map((row) => leverageForRow(row))

  const pool: SweepPool = createSweepPool()

  const canvas = document.createElement('canvas')
  canvas.width = 800
  canvas.height = 240
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    throw new Error('PERF-04 bench: 2D context unavailable in this browser instance')
  }

  let generationCounter = 0
  let lastGrid: SweepGrid | undefined

  async function measureCoarsePass(): Promise<void> {
    generationCounter += 1
    const grid = createSweepGrid(
      coarseColPositions.length,
      coarseRowIndices.length,
      testMeta(coarseEntryDates, coarseLeverages),
    )
    const request: SweepRunRequest = {
      generation: generationCounter,
      entryDates: coarseEntryDates,
      rowIndices: coarseRowIndices,
      params,
    }
    await pool.runSweep(grid, request)
    paintSweepField(ctx!, grid, { metric: 'multiple' })
    lastGrid = grid
  }

  // Cold first pass pays one-time bundle-fetch-inside-worker cost a warm coarse pass never pays
  // again -- warm the pool before the timed repeats below (same discipline heatmap-form-2's
  // bench warms its canvas buffer).
  await measureCoarsePass()

  const rawMs = await measureMinOfN(REPEAT_COUNT, measureCoarsePass)

  // Correctness before trusting the figure: the coarse grid must be COMPLETE.
  assertGridComplete(lastGrid!)

  const normalizedMs = normalize(rawMs, score)

  await commands.recordEnvironment(captureEnvironment(score))

  const budget = PERF_BUDGETS['PERF-04']
  const row: MeasurementRow = {
    budgetId: budget.id,
    requirementId: budget.requirementId,
    measuredMs: rawMs,
    normalizedMs,
    budgetMs: budget.thresholdMs,
    anchorMs: budget.anchorMs,
    anchorLabel: budget.anchorLabel,
    source: 'production',
    verdict: checkBudget({ normalizedMs, budgetMs: budget.thresholdMs }),
  }
  await commands.recordMeasurement(row)

  await commands.recordInfoLine(
    'PERF-04-coarse-pass',
    `PERF-04: rawMs=${rawMs.toFixed(4)} normalizedMs=${normalizedMs.toFixed(4)} ` +
      `calibrationScore=${score} coarseCellCount=${lastGrid!.cols * lastGrid!.rows} ` +
      `coarseCols=${lastGrid!.cols} coarseRows=${lastGrid!.rows} ` +
      `coarseColStride=${COARSE_COL_STRIDE} coarseRowStride=${COARSE_ROW_STRIDE} ` +
      `workerCount=${pool.workerCount} (coarseCellCount/coarseColStride/coarseRowStride let the ` +
      'stride constants declared in src/app/state.ts be re-tuned against this measured figure ' +
      'rather than re-guessed)',
  )

  expect(() => assertWithinBudget(row)).not.toThrow()

  pool.dispose()
})

// --- PERF-06: the O(1) generation-bump cost, measured against the shipped mechanism -----------

test(
  'PERF-06: cancelling an in-flight sweep is an O(1) main-thread generation bump, over the ' +
    'real bundle through the production pool',
  async () => {
    const score = await resolveRunCalibration()

    let constructCount = 0
    const pool: SweepPool = createSweepPool({
      workerCount: 1,
      workerFactory: () => {
        constructCount += 1
        return new Worker(new URL('../src/sweep/sweep.worker.ts', import.meta.url), { type: 'module' })
      },
    })

    const smallEntryDates: string[] = Array.from({ length: PERF06_SMALL_COLS }, () => entryDate)
    const smallRowIndices: number[] = Array.from({ length: PERF06_SMALL_ROWS }, (_, i) => i)
    const smallLeverages = smallRowIndices.map((row) => leverageForRow(row))

    let generationCounter = 0
    const dispatched: Array<{ handle: Promise<SweepRunHandle>; grid: SweepGrid; generation: number }> = []

    function fireCancel(): void {
      generationCounter += 1
      const generation = generationCounter
      const grid = createSweepGrid(PERF06_SMALL_COLS, PERF06_SMALL_ROWS, testMeta(smallEntryDates, smallLeverages))
      const request: SweepRunRequest = {
        generation,
        entryDates: smallEntryDates,
        rowIndices: smallRowIndices,
        params,
      }
      // Fire-and-forget: the timed region is the synchronous dispatch cost (the generation bump
      // plus the initial chunk dispatch), never the real chunk computation this call kicks off in
      // the background -- exactly the O(1) main-thread cost PERF-06 is about.
      dispatched.push({ handle: pool.runSweep(grid, request), grid, generation })
    }

    // Warm-up: one full round trip, awaited, before any timed repeat.
    fireCancel()
    await dispatched[0]!.handle
    const warmupCount = dispatched.length
    const constructCountAfterWarmup = constructCount

    // Doubles the batch size until the batch minimum clears MIN_MEASUREMENT_MS, mirroring
    // bench/decode-time.bench.test.ts's own retry loop for the same reason: the O(1) bump this
    // measures is fast enough that a modest batch underflows the timer-resolution floor. Every
    // dispatched call, across every attempt, is a real sweep against the real pool -- a failed
    // attempt's dispatched work is not wasted measurement-wise, it settles at the Promise.all
    // below alongside everything else.
    let batchSize = PERF06_INITIAL_BATCH_SIZE
    let rawMs: number | undefined
    while (rawMs === undefined) {
      try {
        // eslint-disable-next-line no-await-in-loop
        rawMs = await measureBatchedMinOfN(REPEAT_COUNT, batchSize, fireCancel)
      } catch (error) {
        const isFloorError = error instanceof Error && /below the .*timer-resolution floor/.test(error.message)
        if (!isFloorError) {
          throw error
        }
        if (batchSize >= PERF06_MAX_BATCH_SIZE) {
          throw new Error(
            `PERF-06 bench: batch size reached ${batchSize} (the declared ceiling) without ` +
              `clearing the timer-resolution floor: ${(error as Error).message}`,
          )
        }
        batchSize *= 2
      }
    }

    // Settle every dispatched sweep before asserting anything about the grids -- a chunk that
    // "arrives after the bump" needs to have actually arrived.
    await Promise.all(dispatched.map((d) => d.handle))

    const normalizedMs = normalize(rawMs, score)

    // Correctness before trusting the figure: at least one stale chunk from an earlier,
    // now-superseded generation must never have reached its own grid, and no Worker was
    // constructed during the whole cancel storm.
    const victim = dispatched[warmupCount]!
    const victimHandle = await victim.handle
    expect(victimHandle.stale).toBe(true)
    expect(victim.grid.generation).toBe(0)
    let victimTouched = false
    for (const flag of victim.grid.flags) {
      if (flag !== 0) victimTouched = true
    }
    for (const value of victim.grid.multiples) {
      if (value !== 0) victimTouched = true
    }
    expect(victimTouched).toBe(false)
    expect(constructCount).toBe(constructCountAfterWarmup)

    await commands.recordEnvironment(captureEnvironment(score))

    const budget = PERF_BUDGETS['PERF-06']
    const row: MeasurementRow = {
      budgetId: budget.id,
      requirementId: budget.requirementId,
      measuredMs: rawMs,
      normalizedMs,
      budgetMs: budget.thresholdMs,
      anchorMs: budget.anchorMs,
      anchorLabel: budget.anchorLabel,
      source: 'production',
      verdict: checkBudget({ normalizedMs, budgetMs: budget.thresholdMs }),
    }
    await commands.recordMeasurement(row)

    await commands.recordInfoLine(
      'PERF-06-cancel-bump',
      `PERF-06: rawMs=${rawMs.toFixed(4)} normalizedMs=${normalizedMs.toFixed(4)} ` +
        `calibrationScore=${score} batchSize=${batchSize} repeatCount=${REPEAT_COUNT} ` +
        `totalGenerationBumps=${dispatched.length} smallCols=${PERF06_SMALL_COLS} ` +
        `smallRows=${PERF06_SMALL_ROWS} workerCount=${pool.workerCount} constructCount=${constructCount}`,
    )

    expect(() => assertWithinBudget(row)).not.toThrow()

    pool.dispose()
  },
  60_000,
)
