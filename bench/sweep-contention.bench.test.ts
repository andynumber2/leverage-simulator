/**
 * bench/sweep-contention.bench.test.ts
 *
 * 07.1-04-PLAN.md Task 1: informational-only bench arm answering, for the first time in this
 * project, whether the main thread can still complete its per-coalesced-recompute workload (the
 * real `runBacktest` call `src/app/state.ts`'s `scheduleRun` performs) inside PERF-07b's 16ms
 * frame budget, and without a scheduling gap past PERF-07a's 50ms long-task ceiling, while a real
 * full-grid sweep is in flight through the real production pool (`src/sweep/sweep-pool.ts`'s
 * `createSweepPool`) -- at the current pool width (`BASELINE_WORKER_COUNT`) and at one worker
 * above it.
 *
 * What this answers: whether the shared CPU lets a real single-run kernel call land inside the
 * interactivity budgets while a real sweep churns concurrently, at both widths, so a worker-count
 * change (`workerCountForCores`) can be decided against evidence rather than an inference.
 *
 * What this does NOT answer: whether the production reactive path, Solid's own rendering and the
 * browser's paint pipeline behave the same under this load, because this arm drives no UI --
 * `bench/perf-07.bench.test.ts`'s Playwright pointer drag remains the only arm that exercises the
 * production slider, and it never runs concurrently with a sweep. This arm is new evidence about
 * scheduling, not a replacement for that drag (07.1-RESEARCH.md Pitfall 3).
 *
 * Records only through `commands.recordInfoLine`, never `commands.recordMeasurement`: this is
 * disclosure, not a new gated budget row (07.1-RESEARCH.md Pitfall 3's own warning against a Key
 * Decision that cites only a throughput figure). Informational only, mirroring
 * `bench/sweep-pool-profile.bench.test.ts`'s and `bench/playwright-context-probe.bench.test.ts`'s
 * own convention.
 *
 * Local sandbox figures (this bench project's own host) are informational and non-baseline
 * (PERF-11): the figures that decide anything come from plan 07.1-06's CI run at
 * `hardwareConcurrency=4`, the declared D-17 baseline. Every info line below carries its own
 * `hardwareConcurrency` so a reader never mistakes a sandbox figure for the baseline.
 *
 * Cost control: one cold-versus-warm pair per width (not repeated across REPEAT_COUNT), plus one
 * in-flight full-grid sweep per width to drive the contention measurement itself -- two full-grid
 * sweeps per width (warm, in-flight) plus one small, grid-size-independent cold sweep per width,
 * per this task's own sizing instruction.
 */

import { commands } from 'vitest/browser'
import { beforeAll, test } from 'vitest'

import { runBacktest } from '../src/kernel/backtest.ts'
import { LONG_GAP_FLAG_MIN_DAYS, type KernelOutputs, type KernelParams } from '../src/kernel/backtest.types.ts'
import type { LoadedBundle } from '../src/data/bundle-source.ts'
import { loadBundleFromFetch } from '../src/data/load-bundle-browser.ts'
import { FINANCING_SPREAD_DEFAULT, GENERIC_3X_EXPENSE_RATIO } from '../src/validation/cost-parameters.ts'
import { resolveEntryDateBounds } from '../src/app/bounds.ts'
import { resolveColumnSeries, type ColumnSeriesOk, type ColumnSeriesRequest } from '../src/sweep/resolve-column-series.ts'
import { SWEEP_COLS, SWEEP_ROWS, createSweepGrid, leverageForRow, type SweepGridMeta } from '../src/sweep/sweep-grid.ts'
import { createSweepPool, partitionColumns, type SweepBaseParams } from '../src/sweep/sweep-pool.ts'
import { fromDaysSinceEpoch, indexOfDate, toDaysSinceEpoch } from '../tools/bundle-compiler/src/calendar.ts'
import { normalize } from './calibration.ts'
import { resolveRunCalibration } from './canonical-calibration.ts'
import { captureEnvironment } from './environment-block.ts'
// BASELINE_WORKER_COUNT: quick-260818-v2d's pinned pool width, reused rather than redeclared --
// the two widths this arm measures are BASELINE_WORKER_COUNT and BASELINE_WORKER_COUNT + 1, never
// a host-following width, so this arm's own pool widths can never disagree with PERF-03's.
import { BASELINE_WORKER_COUNT } from './sweep-pool.ts'

const SYMBOL = 'SPX'
const DIVIDEND_REINVEST = true
const INITIAL_INVESTMENT = 10_000

/** A frame count this small would mean the in-flight sweep resolved before the workload sampled
 * enough frames to report a maximum/median without single-sample artifacts -- fail loudly rather
 * than disclose an unsupported figure. */
const MIN_FRAME_COUNT = 10

function baseParams(): SweepBaseParams {
  return {
    symbol: SYMBOL,
    dividendReinvest: DIVIDEND_REINVEST,
    initialInvestment: INITIAL_INVESTMENT,
    contributionAmount: 0,
    contributionFrequency: 'none',
    expenseRatioPercent: GENERIC_3X_EXPENSE_RATIO * 100,
    financingSpreadPercent: FINANCING_SPREAD_DEFAULT * 100,
    holdingPeriodBars: null,
  }
}

/** Duplicated from `bench/sweep.bench.test.ts` rather than imported (07.1-PATTERNS.md: each
 * bench file constructs its own module-level state). The first `SWEEP_COLS` real trading sessions
 * from the extended tier's own start date -- see that file's header for why this keeps every
 * column's backtest at 99.15%+ of the full bar count. */
function buildEarlyEntryDates(bundle: LoadedBundle): string[] {
  const bounds = resolveEntryDateBounds(bundle.manifest, SYMBOL, DIVIDEND_REINVEST, 'extended')
  if (!bounds.ok) {
    throw new Error(`sweep-contention bench: could not resolve extended-tier entry-date bounds for ${SYMBOL}: ${bounds.reason}`)
  }
  const startAbsIndex = indexOfDate({ days: bundle.calendar }, toDaysSinceEpoch(bounds.firstDate))
  if (startAbsIndex === -1) {
    throw new Error(`sweep-contention bench: extended-tier firstDate "${bounds.firstDate}" is not a calendar trading session`)
  }
  const dates: string[] = []
  for (let i = 0; i < SWEEP_COLS; i++) {
    const days = bundle.calendar[startAbsIndex + i]
    if (days === undefined) {
      throw new Error(`sweep-contention bench: calendar index ${startAbsIndex + i} is out of range building the entry-date axis`)
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

function makeMeta(entryDates: readonly string[], leverages: readonly number[], params: SweepBaseParams): SweepGridMeta {
  // Display metadata `runSweep` never reads (verified by reading src/sweep/sweep-pool.ts top to
  // bottom); placeholder values are safe here because nothing in this file asserts against them.
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
    endOfDataDate: '',
  }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length === 0) return 0
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
  }
  return sorted[mid] ?? 0
}

let bundle: LoadedBundle
let entryDates: string[]
let leverages: number[]
let params: SweepBaseParams
let kernelSeries: ColumnSeriesOk
let kernelOutputs: KernelOutputs
let kernelParams: KernelParams

beforeAll(async () => {
  bundle = await loadBundleFromFetch()
  entryDates = buildEarlyEntryDates(bundle)
  leverages = Array.from({ length: SWEEP_ROWS }, (_, row) => leverageForRow(row))
  params = baseParams()

  // The single resolved KernelSeries plus its scratch KernelOutputs the main-thread workload
  // runs against, per this task's own instruction: resolved ONCE here, reused across every
  // rAF-driven runBacktest call below, so only runBacktest itself is timed -- the same kernel
  // call src/app/state.ts's scheduleRun makes per coalesced recompute, directly comparable with
  // PERF-07b's 16ms budget.
  const resolution = resolveColumnSeries(bundle, columnRequestFor(params, entryDates[0]!))
  if (resolution.incomplete) {
    throw new Error(
      'sweep-contention bench: expected an open-ended hold (holdingPeriodBars: null), which can ' +
        'never overrun (D-29) and therefore can never be incomplete',
    )
  }
  kernelSeries = resolution
  kernelOutputs = {
    outValue: new Float64Array(resolution.barCount),
    outRuined: new Uint8Array(resolution.barCount),
    outLongGap: new Uint8Array(resolution.barCount),
  }
  kernelParams = {
    leverage: leverageForRow(0),
    initialInvestment: params.initialInvestment,
    contributionAmount: params.contributionAmount,
    financingSpread: params.financingSpreadPercent / 100,
    expenseRatio: params.expenseRatioPercent / 100,
    longGapMinDays: LONG_GAP_FLAG_MIN_DAYS,
  }
})

interface WidthMeasurement {
  workerCount: number
  chunkCount: number
  coldFirstSweepMs: number
  warmSweepMs: number
  sweepDurationUnderLoadMs: number
  frameCount: number
  maxRecomputeMs: number
  medianRecomputeMs: number
  maxFrameGapMs: number
  medianFrameGapMs: number
}

/** Measures one worker-count width, in a fresh pool constructed and disposed inside this call. */
async function measureWidth(workerCount: number): Promise<WidthMeasurement> {
  const pool = createSweepPool({ workerCount })

  // Cold: a deliberately small (real, not synthetic) grid forces every worker to pay its
  // one-time module evaluation plus loadBundleFromFetch decode
  // (07.1-PERF-03-PROFILE.md section 2's workerStartupMs), without spending full-grid compute on
  // a figure that is grid-size-independent -- the added worker's own one-time cost, disclosed
  // beside the throughput figure rather than hidden.
  const coldGrid = createSweepGrid(1, 1, makeMeta([entryDates[0]!], [leverageForRow(0)], params))
  const coldStart = performance.now()
  await pool.runSweep(coldGrid, {
    generation: 1,
    params,
    entryDates: [entryDates[0]!],
    rowIndices: [0],
  })
  const coldFirstSweepMs = performance.now() - coldStart

  // Warm: the first FULL-grid sweep on the now-warm pool -- steady-state throughput, still
  // unloaded (no concurrent main-thread workload yet).
  const warmGrid = createSweepGrid(SWEEP_COLS, SWEEP_ROWS, makeMeta(entryDates, leverages, params))
  const warmStart = performance.now()
  await pool.runSweep(warmGrid, { generation: 2, params, entryDates })
  const warmSweepMs = performance.now() - warmStart

  // In-flight: a second full-grid sweep, held while a repeating main-thread workload runs from
  // requestAnimationFrame -- the contention measurement itself. The sweep's own promise is held
  // in `sweepPromise` without blocking anything: awaiting a promise never blocks the event loop,
  // so the rAF-scheduled workload below keeps running while this function is suspended on it.
  const loadGrid = createSweepGrid(SWEEP_COLS, SWEEP_ROWS, makeMeta(entryDates, leverages, params))
  const recomputeDurations: number[] = []
  const frameGaps: number[] = []
  let lastFrameTime: number | null = null
  let running = true

  function frame(now: number): void {
    if (!running) return
    if (lastFrameTime !== null) {
      frameGaps.push(now - lastFrameTime)
    }
    lastFrameTime = now
    const start = performance.now()
    runBacktest(kernelParams, kernelSeries, kernelOutputs)
    recomputeDurations.push(performance.now() - start)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  const loadStart = performance.now()
  const sweepPromise = pool.runSweep(loadGrid, { generation: 3, params, entryDates })
  await sweepPromise
  const sweepDurationUnderLoadMs = performance.now() - loadStart
  // Stop the workload when the sweep's promise resolves, per this task's own instruction.
  running = false

  pool.dispose()

  const frameCount = recomputeDurations.length
  if (frameCount <= MIN_FRAME_COUNT) {
    throw new Error(
      `sweep-contention bench: only ${frameCount} frame(s) completed during the in-flight sweep ` +
        `at workerCount=${workerCount} -- too few to report a maximum/median without ` +
        `single-sample artifacts (need > ${MIN_FRAME_COUNT})`,
    )
  }

  return {
    workerCount,
    chunkCount: partitionColumns(entryDates, workerCount).length,
    coldFirstSweepMs,
    warmSweepMs,
    sweepDurationUnderLoadMs,
    frameCount,
    maxRecomputeMs: Math.max(...recomputeDurations),
    medianRecomputeMs: median(recomputeDurations),
    maxFrameGapMs: Math.max(...frameGaps),
    medianFrameGapMs: median(frameGaps),
  }
}

function formatWidthLine(result: WidthMeasurement, score: number): string {
  const rn = (ms: number): string => `${ms.toFixed(4)}/${normalize(ms, score).toFixed(4)}`
  return (
    `sweep-contention: workerCount=${result.workerCount} hardwareConcurrency=${navigator.hardwareConcurrency} ` +
    `chunkCount=${result.chunkCount} calibrationScore=${score} ` +
    `coldFirstSweepMs(raw/normalized)=${rn(result.coldFirstSweepMs)} ` +
    `warmSweepMs(raw/normalized)=${rn(result.warmSweepMs)} ` +
    `sweepDurationUnderLoadMs(raw/normalized)=${rn(result.sweepDurationUnderLoadMs)} ` +
    `frameCount=${result.frameCount} ` +
    `maxRecomputeMs(raw/normalized)=${rn(result.maxRecomputeMs)} (PERF-07b budget=16ms) ` +
    `medianRecomputeMs(raw/normalized)=${rn(result.medianRecomputeMs)} ` +
    `maxFrameGapMs(raw/normalized)=${rn(result.maxFrameGapMs)} (PERF-07a budget=50ms) ` +
    `medianFrameGapMs(raw/normalized)=${rn(result.medianFrameGapMs)} ` +
    'source=sandbox-informational (PERF-11: this is NOT the D-17 baseline; the deciding figure ' +
    "is plan 07.1-06's CI run at hardwareConcurrency=4)"
  )
}

function formatComparisonLine(a: WidthMeasurement, b: WidthMeasurement): string {
  return (
    `sweep-contention-comparison: workerCount ${a.workerCount}->${b.workerCount} ` +
    `sweepDurationUnderLoadMs ${a.sweepDurationUnderLoadMs.toFixed(4)}->${b.sweepDurationUnderLoadMs.toFixed(4)} ` +
    `(delta ${(b.sweepDurationUnderLoadMs - a.sweepDurationUnderLoadMs).toFixed(4)}ms) ` +
    `maxRecomputeMs ${a.maxRecomputeMs.toFixed(4)}->${b.maxRecomputeMs.toFixed(4)} ` +
    `(delta ${(b.maxRecomputeMs - a.maxRecomputeMs).toFixed(4)}ms, PERF-07b budget=16ms) ` +
    `maxFrameGapMs ${a.maxFrameGapMs.toFixed(4)}->${b.maxFrameGapMs.toFixed(4)} ` +
    `(delta ${(b.maxFrameGapMs - a.maxFrameGapMs).toFixed(4)}ms, PERF-07a budget=50ms) ` +
    `frameCount ${a.frameCount}->${b.frameCount} (delta ${b.frameCount - a.frameCount}) ` +
    'source=sandbox-informational (PERF-11: this is NOT the D-17 baseline; the deciding ' +
    "comparison is plan 07.1-06's CI run at hardwareConcurrency=4)"
  )
}

const widthResults: WidthMeasurement[] = []

test(
  `sweep-contention: workerCount=${BASELINE_WORKER_COUNT} (current width) under a real ` +
    'concurrent full-grid sweep',
  async () => {
    const score = await resolveRunCalibration()
    const result = await measureWidth(BASELINE_WORKER_COUNT)
    widthResults.push(result)
    await commands.recordEnvironment(captureEnvironment(score))
    await commands.recordInfoLine(`sweep-contention-width-${result.workerCount}`, formatWidthLine(result, score))
  },
  30_000,
)

test(
  `sweep-contention: workerCount=${BASELINE_WORKER_COUNT + 1} (one worker above current) under ` +
    'a real concurrent full-grid sweep',
  async () => {
    const score = await resolveRunCalibration()
    const result = await measureWidth(BASELINE_WORKER_COUNT + 1)
    widthResults.push(result)
    await commands.recordEnvironment(captureEnvironment(score))
    await commands.recordInfoLine(`sweep-contention-width-${result.workerCount}`, formatWidthLine(result, score))
  },
  30_000,
)

test('sweep-contention: comparison between the two widths', async () => {
  const score = await resolveRunCalibration()
  if (widthResults.length !== 2) {
    throw new Error(
      `sweep-contention bench: expected 2 width results recorded before the comparison test, got ${widthResults.length}`,
    )
  }
  await commands.recordEnvironment(captureEnvironment(score))
  const [a, b] = widthResults as [WidthMeasurement, WidthMeasurement]
  await commands.recordInfoLine('sweep-contention-comparison', formatComparisonLine(a, b))
})
