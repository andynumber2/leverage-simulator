/**
 * bench/sweep-residual.bench.test.ts
 *
 * quick-260824-52h: attributes 07.1-PERF-03-PROFILE.md section 2's 273.98ms unexplained residual
 * AT the real 10,000-cell grid, by direct measurement, with no extrapolation. This is a
 * MEASUREMENT arm. It ships no optimization, records no `MeasurementRow` (informational only, via
 * `commands.recordInfoLine`, never `commands.recordMeasurement`), and never touches
 * `bench/sweep.bench.test.ts`, `perf-budgets.ts`, `bench/calibration.ts`, `src/kernel/backtest.ts`
 * or `src/sweep/sweep-pool.ts` -- every task's `<verify>` in the plan runs `git diff --exit-code`
 * against all five.
 *
 * Task 1 (tracer): instruments exactly ONE real 200x50 sweep, twice (profiling off, then
 * profiling on), through the real production pool (`src/sweep/sweep-pool.ts`, unedited) and the
 * real production worker (`src/sweep/sweep.worker.ts`, whose only change is the inert profiling
 * seam this file exercises). The pool's `workerFactory` option (an existing production seam,
 * already used from the bench tree by `bench/sweep-progressive.bench.test.ts`) lets this file
 * observe every chunk dispatch and every chunk response at the real pool boundary, without editing
 * `sweep-pool.ts` at all: a worker's own `postMessage` is shadowed to timestamp dispatch, and a
 * `message` listener registered on the worker instance timestamps everything arriving back,
 * routing on the worker's reserved profile-message key into a separate stream from ordinary
 * Comlink chunk responses. The zero-messages-when-disabled assertion below is the inertness proof
 * this task owes -- a runtime observation on the real full-grid path, not a claim about the
 * source.
 *
 * Task 2: extends the SAME file and the SAME instrumented sweep -- no second full-grid sweep.
 * Derives per-worker busy/idle, the tail, the per-worker drain-end spread, and main-thread
 * occupied/idle from the event stream Task 1's profiling-on pass already captured (kept in
 * module-scope `onPass*` variables, since Vitest runs this file's tests in declaration order).
 * Separately measures, at the real full-grid chunk shape (17 columns x SWEEP_ROWS rows, zero pool
 * involvement): buffer-allocation cost, `mergeChunkResult` cost, and serial `computeChunkMetrics`
 * cost at span 2 (the span the original 255.42us/cell figure came from) and span 17 (the span the
 * full grid actually runs), to test the linearity assumption the residual rests on. Reconciles all
 * of the above against the profiling-on pass's own measured wall clock, reporting an explicit
 * `unattributedMs` with its sign preserved -- a nonzero remainder is a required honest output, not
 * a failure.
 */

import * as Comlink from 'comlink'
import { commands } from 'vitest/browser'
import { beforeAll, expect, test } from 'vitest'

import type { LoadedBundle } from '../src/data/bundle-source.ts'
import { loadBundleFromFetch } from '../src/data/load-bundle-browser.ts'
import { FINANCING_SPREAD_DEFAULT, GENERIC_3X_EXPENSE_RATIO } from '../src/validation/cost-parameters.ts'
import { resolveEntryDateBounds } from '../src/app/bounds.ts'
import {
  SWEEP_COLS,
  SWEEP_ROWS,
  chunkBufferByteLength,
  createSweepGrid,
  leverageForRow,
  type SweepGrid,
  type SweepGridMeta,
} from '../src/sweep/sweep-grid.ts'
import {
  createSweepPool,
  mergeChunkResult,
  type ChunkMergeInput,
  type SweepBaseParams,
  type SweepPool,
} from '../src/sweep/sweep-pool.ts'
import {
  computeChunkMetrics,
  SWEEP_PROFILE_MESSAGE_KEY,
  type SweepChunkProfileMessage,
  type SweepChunkRequest,
  type SweepWorkerApi,
} from '../src/sweep/sweep.worker.ts'
import { fromDaysSinceEpoch, indexOfDate, toDaysSinceEpoch } from '../tools/bundle-compiler/src/calendar.ts'
import { MIN_MEASUREMENT_MS, measureBatchedMinOfN, normalize } from './calibration.ts'
import { resolveRunCalibration } from './canonical-calibration.ts'
import { captureEnvironment } from './environment-block.ts'
import { formatMeasured } from './report.ts'
// BASELINE_WORKER_COUNT: quick-260818-v2d's pinned pool width -- reused rather than redeclared,
// same reason bench/sweep.bench.test.ts and bench/sweep-pool-profile.bench.test.ts reuse it.
import { BASELINE_WORKER_COUNT } from './sweep-pool.ts'

const SYMBOL = 'SPX'
const DIVIDEND_REINVEST = true
const INITIAL_INVESTMENT = 10_000

/** The real full-grid chunk shape (07.1-PERF-03-PROFILE.md context 3): `partitionColumns` splits
 * 200 columns into 12 chunks at `BASELINE_WORKER_COUNT=3` -- 8 chunks of 17 columns, 4 of 16. 17
 * is the shape the allocation, merge and serial-span-17 arms below all measure against. */
const REAL_CHUNK_COLS = 17
const REAL_CHUNK_CELL_COUNT = REAL_CHUNK_COLS * SWEEP_ROWS

/** The narrow warm-up sweep's column count: matches `partitionColumns`' own chunk count at
 * `BASELINE_WORKER_COUNT * CHUNKS_PER_WORKER = 12` on any host, so the warm-up exercises the same
 * dispatch shape (one column per chunk) without the full grid's compute cost. Because the first 12
 * columns are the earliest, longest-window entry dates, this also sizes every worker's scratch
 * arrays to their maximum. */
const WARMUP_COLS = 12

/** The span the original `perCellKernelUs=255.42` figure (07.1-PERF-03-PROFILE.md section 2) came
 * from: 12 chunks of 2 columns each (`PROFILE_COLS=24` at the time). */
const SPAN_TWO_COLS = 2

/** Doubling-batch micro-arm sizing (allocation, merge): mirrors `bench/sweep-progressive.bench.
 * test.ts`'s own `PERF06_INITIAL_BATCH_SIZE`/`PERF06_MAX_BATCH_SIZE` retry pattern for a
 * sub-`MIN_MEASUREMENT_MS` operation -- start small, double until the batch clears the floor, fail
 * loudly (naming the batch size reached) rather than looping toward `BENCH_TOTAL_RUNTIME_CAP_MS`
 * silently. */
const MICRO_ARM_INITIAL_BATCH_SIZE = 2_000
const MICRO_ARM_MAX_BATCH_SIZE = MICRO_ARM_INITIAL_BATCH_SIZE * 2 ** 8

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

/** Same construction as bench/sweep.bench.test.ts's/bench/sweep-pool-profile.bench.test.ts's
 * buildEarlyEntryDates: the first SWEEP_COLS real trading sessions from the extended tier's own
 * earliest date, so this file's axis is the same shape (99.15%+ of the longest column's bar count)
 * as the gated file's. */
function buildEarlyEntryDates(bundle: LoadedBundle): string[] {
  const bounds = resolveEntryDateBounds(bundle.manifest, SYMBOL, DIVIDEND_REINVEST, 'extended')
  if (!bounds.ok) {
    throw new Error(
      `sweep-residual: could not resolve extended-tier entry-date bounds for ${SYMBOL}: ${bounds.reason}`,
    )
  }
  const startAbsIndex = indexOfDate({ days: bundle.calendar }, toDaysSinceEpoch(bounds.firstDate))
  if (startAbsIndex === -1) {
    throw new Error(`sweep-residual: extended-tier firstDate "${bounds.firstDate}" is not a calendar trading session`)
  }
  const dates: string[] = []
  for (let i = 0; i < SWEEP_COLS; i++) {
    const days = bundle.calendar[startAbsIndex + i]
    if (days === undefined) {
      throw new Error(`sweep-residual: calendar index ${startAbsIndex + i} is out of range building the entry-date axis`)
    }
    dates.push(fromDaysSinceEpoch(days))
  }
  return dates
}

function makeMeta(entryDates: readonly string[], params: SweepBaseParams): SweepGridMeta {
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

// --- Instrumentation: dispatch/response/profile event capture at the real pool boundary --------

interface RawEvent {
  workerIndex: number
  timestamp: number
}

interface RawProfileEvent extends RawEvent {
  generation: number
  firstColumn: number
  columnCount: number
  cellCount: number
  computeMs: number
  wireMs: number
  totalMs: number
}

/** Gates both recorders below so nothing outside a deliberately measured sweep is captured --
 * neither the warm-up sweep nor the `setChunkProfiling` RPC calls themselves. */
let recording = false

let dispatchEvents: RawEvent[] = []
let responseEvents: RawEvent[] = []
let profileEvents: RawProfileEvent[] = []

function resetEventLog(): void {
  dispatchEvents = []
  responseEvents = []
  profileEvents = []
}

function isProfileMessage(data: unknown): data is SweepChunkProfileMessage {
  if (typeof data !== 'object' || data === null) {
    return false
  }
  return (data as Record<string, unknown>)[SWEEP_PROFILE_MESSAGE_KEY] === true
}

const workerWraps: Array<Comlink.Remote<SweepWorkerApi>> = []

/** The bench's own instrumented worker factory: constructs the REAL production worker (the same
 * `new Worker(new URL('../src/sweep/sweep.worker.ts', ...))` construction
 * `bench/sweep-progressive.bench.test.ts` already uses from the bench tree), shadows its
 * `postMessage` to timestamp every dispatch, and registers a `message` listener that timestamps
 * every arrival and routes on the reserved profile key. `sweep-pool.ts` itself is never edited --
 * this is the `workerFactory` seam it already exposes. */
function instrumentedWorkerFactory(index: number): Worker {
  const worker = new Worker(new URL('../src/sweep/sweep.worker.ts', import.meta.url), { type: 'module' })

  const nativePostMessage = worker.postMessage.bind(worker) as (...args: unknown[]) => void
  ;(worker as unknown as { postMessage: (...args: unknown[]) => void }).postMessage = (...args: unknown[]) => {
    if (recording) {
      dispatchEvents.push({ workerIndex: index, timestamp: performance.now() })
    }
    nativePostMessage(...args)
  }

  worker.addEventListener('message', (event: MessageEvent) => {
    if (!recording) {
      return
    }
    const data: unknown = event.data
    if (isProfileMessage(data)) {
      profileEvents.push({
        workerIndex: index,
        timestamp: performance.now(),
        generation: data.generation,
        firstColumn: data.firstColumn,
        columnCount: data.columnCount,
        cellCount: data.cellCount,
        computeMs: data.computeMs,
        wireMs: data.wireMs,
        totalMs: data.totalMs,
      })
      return
    }
    responseEvents.push({ workerIndex: index, timestamp: performance.now() })
  })

  workerWraps[index] = Comlink.wrap<SweepWorkerApi>(worker)
  return worker
}

// --- Per-chunk timing table, built from the three event streams by per-worker ordinal position --
// Each worker processes its chunks strictly sequentially (drainQueue awaits one runChunk before
// requesting the next), so the k-th dispatch on worker w, the k-th profile message on worker w and
// the k-th response on worker w describe the SAME chunk. No message carries a chunk identifier of
// its own; this ordinal correlation is what stands in for one.

interface ChunkTiming {
  workerIndex: number
  firstColumn: number
  columnCount: number
  cellCount: number
  /** Offset from the sweep's own start, in ms. */
  dispatchMs: number
  /** Offset from the sweep's own start, in ms. */
  responseMs: number
  roundTripMs: number
  computeMs: number
  wireMs: number
  totalMs: number
}

function groupByWorker<T extends RawEvent>(events: readonly T[]): Map<number, T[]> {
  const byWorker = new Map<number, T[]>()
  for (const event of events) {
    const arr = byWorker.get(event.workerIndex) ?? []
    arr.push(event)
    byWorker.set(event.workerIndex, arr)
  }
  return byWorker
}

function buildChunkTimings(
  dispatch: readonly RawEvent[],
  response: readonly RawEvent[],
  profile: readonly RawProfileEvent[],
  sweepStartMs: number,
): ChunkTiming[] {
  const dispatchByWorker = groupByWorker(dispatch)
  const responseByWorker = groupByWorker(response)
  const profileByWorker = groupByWorker(profile)

  const timings: ChunkTiming[] = []
  for (const [workerIndex, workerDispatches] of dispatchByWorker) {
    const workerResponses = responseByWorker.get(workerIndex) ?? []
    const workerProfiles = profileByWorker.get(workerIndex) ?? []
    for (let i = 0; i < workerDispatches.length; i++) {
      const dispatchEvent = workerDispatches[i]
      const responseEvent = workerResponses[i]
      const profileEvent = workerProfiles[i]
      if (dispatchEvent === undefined || responseEvent === undefined || profileEvent === undefined) {
        throw new Error(
          `sweep-residual: worker ${workerIndex} chunk ordinal ${i} is missing a dispatch, response, ` +
            'or profile event -- the three streams are not ordinally aligned',
        )
      }
      timings.push({
        workerIndex,
        firstColumn: profileEvent.firstColumn,
        columnCount: profileEvent.columnCount,
        cellCount: profileEvent.cellCount,
        dispatchMs: dispatchEvent.timestamp - sweepStartMs,
        responseMs: responseEvent.timestamp - sweepStartMs,
        roundTripMs: responseEvent.timestamp - dispatchEvent.timestamp,
        computeMs: profileEvent.computeMs,
        wireMs: profileEvent.wireMs,
        totalMs: profileEvent.totalMs,
      })
    }
  }
  return timings.sort((a, b) => a.dispatchMs - b.dispatchMs)
}

interface Interval {
  start: number
  end: number
}

/** Per worker, each response-to-next-dispatch window -- the interval during which the main thread
 * MIGHT be doing merge/allocation/Comlink-resolution work for that worker's just-arrived chunk,
 * bounded above because the main thread could also simply be idle in that window. */
function buildInterChunkWindows(timings: readonly ChunkTiming[]): Interval[] {
  const byWorker = groupByWorker(
    timings.map((t) => ({ workerIndex: t.workerIndex, timestamp: t.dispatchMs, responseMs: t.responseMs })),
  )
  const intervals: Interval[] = []
  for (const workerTimings of byWorker.values()) {
    const sorted = [...workerTimings].sort((a, b) => a.timestamp - b.timestamp)
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i]
      const next = sorted[i + 1]
      if (current === undefined || next === undefined) {
        continue
      }
      if (next.timestamp > current.responseMs) {
        intervals.push({ start: current.responseMs, end: next.timestamp })
      }
    }
  }
  return intervals
}

/** The union of `intervals`' total covered length -- summing raw interval lengths would
 * overcount any overlap, and the main thread is single-threaded, so no two windows can genuinely
 * both be "occupied" at once even if their recorded intervals overlap. */
function unionIntervalsMs(intervals: readonly Interval[]): number {
  if (intervals.length === 0) {
    return 0
  }
  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  let total = 0
  const first = sorted[0]
  if (first === undefined) {
    return 0
  }
  let curStart = first.start
  let curEnd = first.end
  for (let i = 1; i < sorted.length; i++) {
    const iv = sorted[i]
    if (iv === undefined) {
      continue
    }
    if (iv.start <= curEnd) {
      curEnd = Math.max(curEnd, iv.end)
    } else {
      total += curEnd - curStart
      curStart = iv.start
      curEnd = iv.end
    }
  }
  total += curEnd - curStart
  return total
}

/** Doubles `batchSize` until `measureBatchedMinOfN` clears `MIN_MEASUREMENT_MS`, mirroring
 * `bench/sweep-progressive.bench.test.ts`'s own PERF-06 retry loop for a sub-floor operation. */
async function measureWithGrowingBatch(
  fn: () => void,
  initialBatchSize: number,
  maxBatchSize: number,
): Promise<{ perCallMs: number; batchSize: number }> {
  let batchSize = initialBatchSize
  for (;;) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const perCallMs = await measureBatchedMinOfN(5, batchSize, fn)
      return { perCallMs, batchSize }
    } catch (error) {
      const isFloorError = error instanceof Error && /below the .*timer-resolution floor/.test(error.message)
      if (!isFloorError) {
        throw error
      }
      if (batchSize >= maxBatchSize) {
        throw new Error(
          `measureWithGrowingBatch: batch size reached ${batchSize} (the declared ceiling) without ` +
            `clearing the ${MIN_MEASUREMENT_MS}ms floor: ${(error as Error).message}`,
        )
      }
      batchSize *= 2
    }
  }
}

// --- Module-scope state, shared across this file's tests (Vitest runs one file's tests in ------
// declaration order) -----------------------------------------------------------------------------

let bundle: LoadedBundle
let entryDates: string[]
let pool: SweepPool
let fileStartMs = 0

let onPassDispatch: RawEvent[] = []
let onPassResponse: RawEvent[] = []
let onPassProfile: RawProfileEvent[] = []
let onPassSweepStartMs = 0
let onPassWallClockMs = 0
let offPassWallClockMs = 0
let calibrationScoreForRun = 1
let sweepParamsForRun: SweepBaseParams

beforeAll(async () => {
  fileStartMs = performance.now()
  bundle = await loadBundleFromFetch()
  entryDates = buildEarlyEntryDates(bundle)
  // Pinned to BASELINE_WORKER_COUNT (3), same as bench/sweep.bench.test.ts and
  // bench/sweep-pool-profile.bench.test.ts -- every figure below is denominated against the same
  // pool width PERF-03 is, regardless of this host's own hardwareConcurrency.
  pool = createSweepPool({ workerCount: BASELINE_WORKER_COUNT, workerFactory: instrumentedWorkerFactory })
})

// --- Task 1: one instrumented full-grid sweep, end to end, inertness proven at runtime ----------

test('sweep-residual: one real full-grid sweep, instrumented end to end, inertness proven at runtime', async () => {
  const score = await resolveRunCalibration()
  await commands.recordEnvironment(captureEnvironment(score))

  const params = baseParams()
  sweepParamsForRun = params
  calibrationScoreForRun = score

  const grid: SweepGrid = createSweepGrid(SWEEP_COLS, SWEEP_ROWS, makeMeta(entryDates, params))

  // Warm-up: ONE narrow sweep, not recorded (recording stays false) -- pays each worker's module
  // evaluation and one-time bundle fetch, and sizes every worker's scratch arrays to the longest
  // (earliest) columns, before any measured sweep.
  const warmupEntryDates = entryDates.slice(0, WARMUP_COLS)
  const warmupGrid: SweepGrid = createSweepGrid(warmupEntryDates.length, SWEEP_ROWS, makeMeta(warmupEntryDates, params))
  await pool.runSweep(warmupGrid, { generation: 1, params, entryDates: warmupEntryDates })

  // Pass 1: profiling OFF -- the inertness proof, on the real full-grid path.
  resetEventLog()
  recording = true
  const offSweepStartMs = performance.now()
  await pool.runSweep(grid, { generation: 2, params, entryDates })
  const offWallClockMs = performance.now() - offSweepStartMs
  recording = false

  const profileMessagesWhenDisabled = profileEvents.length
  const dispatchEventsOff = dispatchEvents.length
  const responseEventsOff = responseEvents.length

  if (profileMessagesWhenDisabled !== 0) {
    throw new Error(
      `sweep-residual: expected zero profile messages with profiling disabled, got ` +
        `${profileMessagesWhenDisabled} -- the inertness proof failed on the real full-grid path`,
    )
  }
  expect(dispatchEventsOff).toBe(12)
  expect(responseEventsOff).toBe(12)

  offPassWallClockMs = offWallClockMs

  // Pass 2: profiling ON, on every worker, through the Comlink endpoint the production pool never
  // calls (no `self.addEventListener` was added anywhere in the worker; the flag is reached only
  // through this exposed setter).
  await Promise.all(workerWraps.map((wrap) => wrap.setChunkProfiling(true)))

  resetEventLog()
  recording = true
  const onSweepStartMs = performance.now()
  await pool.runSweep(grid, { generation: 3, params, entryDates })
  const onWallClockMs = performance.now() - onSweepStartMs
  recording = false

  await Promise.all(workerWraps.map((wrap) => wrap.setChunkProfiling(false)))

  const profileMessagesWhenEnabled = profileEvents.length
  const dispatchEventsOn = dispatchEvents.length
  const responseEventsOn = responseEvents.length

  expect(profileMessagesWhenEnabled).toBe(12)
  expect(dispatchEventsOn).toBe(12)
  expect(responseEventsOn).toBe(12)

  // Per-worker ordinal soundness: every worker's own dispatch, profile and response counts must
  // agree, or the per-chunk table below is correlating events that do not belong to the same
  // chunk.
  const dispatchByWorker = groupByWorker(dispatchEvents)
  const responseByWorker = groupByWorker(responseEvents)
  const profileByWorker = groupByWorker(profileEvents)
  for (let workerIndex = 0; workerIndex < pool.workerCount; workerIndex++) {
    const dCount = dispatchByWorker.get(workerIndex)?.length ?? 0
    const rCount = responseByWorker.get(workerIndex)?.length ?? 0
    const pCount = profileByWorker.get(workerIndex)?.length ?? 0
    expect(dCount, `worker ${workerIndex} dispatch count`).toBe(rCount)
    expect(rCount, `worker ${workerIndex} response count`).toBe(pCount)
  }

  onPassDispatch = dispatchEvents
  onPassResponse = responseEvents
  onPassProfile = profileEvents
  onPassSweepStartMs = onSweepStartMs
  onPassWallClockMs = onWallClockMs

  const timings = buildChunkTimings(onPassDispatch, onPassResponse, onPassProfile, onPassSweepStartMs)

  const offNormalizedMs = normalize(offWallClockMs, score)
  const onNormalizedMs = normalize(onWallClockMs, score)
  const perturbationMs = onWallClockMs - offWallClockMs
  const hardwareConcurrency = navigator.hardwareConcurrency

  const tableHeader =
    'worker | firstCol | colSpan | cells | dispatchOffsetMs | responseOffsetMs | roundTripMs | ' +
    'computeMs | wireMs | totalMs'
  const tableRows = timings.map(
    (t) =>
      `  ${t.workerIndex} | ${t.firstColumn} | ${t.columnCount} | ${t.cellCount} | ` +
      `${formatMeasured(t.dispatchMs)} | ${formatMeasured(t.responseMs)} | ${formatMeasured(t.roundTripMs)} | ` +
      `${formatMeasured(t.computeMs)} | ${formatMeasured(t.wireMs)} | ${formatMeasured(t.totalMs)}`,
  )

  await commands.recordInfoLine(
    'sweep-residual-chunks',
    'sweep-residual Task 1: one real 200x50 (10,000-cell) sweep through the production pool, ' +
      `hardwareConcurrency=${hardwareConcurrency} workerCount=${pool.workerCount} chunkCount=12 ` +
      `profileMessagesWhenDisabled=${profileMessagesWhenDisabled} ` +
      `profileMessagesWhenEnabled=${profileMessagesWhenEnabled} ` +
      `dispatchEvents=${dispatchEventsOn} responseEvents=${responseEventsOn} ` +
      `offWallClockMs=${formatMeasured(offWallClockMs)} offNormalizedMs=${formatMeasured(offNormalizedMs)} ` +
      `onWallClockMs=${formatMeasured(onWallClockMs)} onNormalizedMs=${formatMeasured(onNormalizedMs)} ` +
      `profilingPerturbationMs=${formatMeasured(perturbationMs)} (onWallClockMs - offWallClockMs) ` +
      `calibrationScore=${score}\n${tableHeader}\n${tableRows.join('\n')}`,
  )
})

// --- Task 2: close the attribution, test the three assumptions the residual rests on ------------

test(
  'sweep-residual: closes the attribution against the on-pass event stream, tests the three ' +
    'assumptions the residual rests on',
  async () => {
    const score = calibrationScoreForRun
    await commands.recordEnvironment(captureEnvironment(score))

    const params = sweepParamsForRun
    const workerCount = pool.workerCount

    const timings = buildChunkTimings(onPassDispatch, onPassResponse, onPassProfile, onPassSweepStartMs)
    if (timings.length !== 12) {
      throw new Error(`sweep-residual Task 2: expected 12 chunk timings from Task 1, got ${timings.length}`)
    }

    // Per-worker busy/idle, from the SAME event stream Task 1 already captured.
    const busyByWorker = new Map<number, number>()
    for (const t of timings) {
      busyByWorker.set(t.workerIndex, (busyByWorker.get(t.workerIndex) ?? 0) + t.roundTripMs)
    }
    const perWorkerBusyIdle = Array.from(busyByWorker.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([workerIndex, busyMs]) => {
        const idleMs = onPassWallClockMs - busyMs
        return `worker${workerIndex}Busy=${formatMeasured(busyMs)} worker${workerIndex}Idle=${formatMeasured(idleMs)}`
      })
      .join(' ')

    // Tail: interval from the first chunk completing to the last chunk completing.
    const responseOffsets = timings.map((t) => t.responseMs)
    const tailMs = Math.max(...responseOffsets) - Math.min(...responseOffsets)

    // Drain-end spread: interval from the earliest per-worker LAST response to the latest -- the
    // quantity idealParallelFullGridMs's workerCount division actually assumes is zero.
    const lastResponsePerWorker = new Map<number, number>()
    for (const t of timings) {
      const current = lastResponsePerWorker.get(t.workerIndex) ?? Number.NEGATIVE_INFINITY
      if (t.responseMs > current) {
        lastResponsePerWorker.set(t.workerIndex, t.responseMs)
      }
    }
    const lastResponses = Array.from(lastResponsePerWorker.values())
    const drainEndSpreadMs = Math.max(...lastResponses) - Math.min(...lastResponses)

    // Main-thread occupied/idle: the UNION (not the sum -- the main thread is single-threaded) of
    // every worker's own response-to-next-dispatch window. An upper bound on merge plus
    // allocation plus Comlink resolution, since the main thread could simply be idle in that
    // window instead.
    const interChunkWindows = buildInterChunkWindows(timings)
    const mainThreadOccupiedMs = unionIntervalsMs(interChunkWindows)
    const mainThreadIdleMs = onPassWallClockMs - mainThreadOccupiedMs

    // Buffer allocation, at the real full-grid chunk shape (17 columns x SWEEP_ROWS rows), zero
    // pool involvement, batched to clear MIN_MEASUREMENT_MS, guarded against JIT elision by a sink
    // read after the timed region.
    let allocationSink = 0
    const { perCallMs: allocationPerCallMs, batchSize: allocationBatchSize } = await measureWithGrowingBatch(
      () => {
        const buf = new ArrayBuffer(chunkBufferByteLength(REAL_CHUNK_CELL_COUNT))
        allocationSink += buf.byteLength
      },
      MICRO_ARM_INITIAL_BATCH_SIZE,
      MICRO_ARM_MAX_BATCH_SIZE,
    )
    if (allocationSink === 0) {
      throw new Error('sweep-residual: allocation sink is zero -- allocations may have been elided')
    }
    const allocationTotalMsPerGrid = allocationPerCallMs * 12

    // mergeChunkResult, at the same real chunk shape, against a real full-size grid, batched the
    // same way, sink read from the grid after the timed region.
    const mergeGrid: SweepGrid = createSweepGrid(SWEEP_COLS, SWEEP_ROWS, makeMeta(entryDates, params))
    const mergeInput: ChunkMergeInput = {
      columnIndices: Array.from({ length: REAL_CHUNK_COLS }, (_, i) => i),
      rowCount: SWEEP_ROWS,
      multiples: new Float32Array(REAL_CHUNK_CELL_COUNT).fill(1),
      drawdowns: new Float32Array(REAL_CHUNK_CELL_COUNT).fill(0.1),
      annualized: new Float32Array(REAL_CHUNK_CELL_COUNT).fill(0.05),
      flags: new Uint8Array(REAL_CHUNK_CELL_COUNT),
    }
    const { perCallMs: mergePerCallMs, batchSize: mergeBatchSize } = await measureWithGrowingBatch(
      () => {
        mergeChunkResult(mergeInput, 1, 1, mergeGrid)
      },
      MICRO_ARM_INITIAL_BATCH_SIZE,
      MICRO_ARM_MAX_BATCH_SIZE,
    )
    let mergeSink = 0
    for (let i = 0; i < REAL_CHUNK_CELL_COUNT; i++) {
      mergeSink += mergeGrid.multiples[i] ?? 0
    }
    if (mergeSink === 0) {
      throw new Error('sweep-residual: merge sink is zero -- merges may have been elided')
    }
    const mergeTotalMsPerGrid = mergePerCallMs * 12

    // Serial computeChunkMetrics, zero pool involvement, at span 2 (the span the recorded
    // 255.42us/cell figure came from) and span 17 (the span the full grid actually runs), on the
    // same entry-date axis. Neither arm is batched: both clear MIN_MEASUREMENT_MS as single calls
    // on the D-17 host (roughly 25ms and roughly 217ms respectively).
    const span2EntryDates = entryDates.slice(0, SPAN_TWO_COLS)
    const span2Start = performance.now()
    const span2Result = computeChunkMetrics(bundle, chunkRequestFor(params, span2EntryDates, 1))
    const span2Ms = performance.now() - span2Start
    const span2CellCount = span2Result.multiples.length
    const span2PerCellUs = (span2Ms * 1000) / span2CellCount

    const span17EntryDates = entryDates.slice(0, REAL_CHUNK_COLS)
    const span17Start = performance.now()
    const span17Result = computeChunkMetrics(bundle, chunkRequestFor(params, span17EntryDates, 1))
    const span17Ms = performance.now() - span17Start
    const span17CellCount = span17Result.multiples.length
    const span17PerCellUs = (span17Ms * 1000) / span17CellCount

    const spanRatio = span17PerCellUs / span2PerCellUs

    // First-vs-last chunk in-worker per-cell cost, under the real concurrent load, from the SAME
    // on-pass event stream -- tests whether the source perCellKernelUs figure's own first-columns
    // bias (longest windows, most expensive cells) matters at the real full-grid axis.
    const firstChunkProfile = onPassProfile.find((p) => p.firstColumn === 0)
    const lastChunkProfile = onPassProfile.reduce<RawProfileEvent | undefined>((max, p) => {
      if (max === undefined || p.firstColumn > max.firstColumn) {
        return p
      }
      return max
    }, undefined)
    if (firstChunkProfile === undefined || lastChunkProfile === undefined) {
      throw new Error('sweep-residual: could not locate the first or last chunk in the on-pass profile stream')
    }
    const firstChunkPerCellUs = (firstChunkProfile.computeMs * 1000) / firstChunkProfile.cellCount
    const lastChunkPerCellUs = (lastChunkProfile.computeMs * 1000) / lastChunkProfile.cellCount
    const firstVsLastChunkRatio = firstChunkPerCellUs / lastChunkPerCellUs

    // Concurrency factor: in-worker per-cell cost under the real 3-worker load (averaged across
    // the 8 span-17 chunks the full grid actually dispatches) divided by the serial per-cell cost
    // at that SAME span. No figure in this phase has ever measured this ratio directly.
    const span17ChunkProfiles = onPassProfile.filter((p) => p.columnCount === REAL_CHUNK_COLS)
    if (span17ChunkProfiles.length === 0) {
      throw new Error('sweep-residual: no span-17 chunks found in the on-pass profile stream')
    }
    const avgConcurrentSpan17PerCellUs =
      span17ChunkProfiles.reduce((sum, p) => sum + (p.computeMs * 1000) / p.cellCount, 0) / span17ChunkProfiles.length
    const concurrencyFactor = avgConcurrentSpan17PerCellUs / span17PerCellUs

    // The reconciliation. Attributed parts, all at the real 10,000-cell grid: the ideal-parallel
    // floor RECOMPUTED from the measured serial span-17 per-cell figure (not the extrapolated
    // one), measured allocation total, measured merge total, measured in-worker wire total,
    // measured tail, measured main-thread occupied ms.
    const idealParallelFullGridFromMeasuredSpan17Ms = (span17PerCellUs * SWEEP_COLS * SWEEP_ROWS) / 1000 / workerCount
    const wireTotalMs = onPassProfile.reduce((sum, p) => sum + p.wireMs, 0)
    const attributedMs =
      idealParallelFullGridFromMeasuredSpan17Ms + allocationTotalMsPerGrid + mergeTotalMsPerGrid + wireTotalMs + tailMs + mainThreadOccupiedMs
    const unattributedMs = onPassWallClockMs - attributedMs

    const armWallClockMs = performance.now() - fileStartMs

    await commands.recordInfoLine(
      'sweep-residual-attribution',
      'sweep-residual Task 2: attribution derived from Task 1\'s on-pass event stream, ' +
        `hardwareConcurrency=${navigator.hardwareConcurrency} workerCount=${workerCount} ` +
        `onPassWallClockMs=${formatMeasured(onPassWallClockMs)} ` +
        `${perWorkerBusyIdle} ` +
        `tailMs=${formatMeasured(tailMs)} drainEndSpreadMs=${formatMeasured(drainEndSpreadMs)} ` +
        `mainThreadOccupiedMs=${formatMeasured(mainThreadOccupiedMs)} (upper bound on merge+allocation+Comlink resolution) ` +
        `mainThreadIdleMs=${formatMeasured(mainThreadIdleMs)} ` +
        `allocationPerChunkUs=${formatMeasured(allocationPerCallMs * 1000)} allocationTotalMsPerGrid=${formatMeasured(allocationTotalMsPerGrid)} ` +
        `allocationBatchSize=${allocationBatchSize} ` +
        `mergePerChunkUs=${formatMeasured(mergePerCallMs * 1000)} mergeTotalMsPerGrid=${formatMeasured(mergeTotalMsPerGrid)} ` +
        `mergeBatchSize=${mergeBatchSize} ` +
        `span2PerCellUs=${formatMeasured(span2PerCellUs)} span17PerCellUs=${formatMeasured(span17PerCellUs)} ` +
        `spanRatio=${formatMeasured(spanRatio)} (span17PerCellUs / span2PerCellUs, tests the linearity assumption) ` +
        `firstChunkPerCellUs=${formatMeasured(firstChunkPerCellUs)} lastChunkPerCellUs=${formatMeasured(lastChunkPerCellUs)} ` +
        `firstVsLastChunkRatio=${formatMeasured(firstVsLastChunkRatio)} ` +
        `avgConcurrentSpan17PerCellUs=${formatMeasured(avgConcurrentSpan17PerCellUs)} ` +
        `concurrencyFactor=${formatMeasured(concurrencyFactor)} (concurrent span-17 per-cell / serial span-17 per-cell) ` +
        `idealParallelFullGridFromMeasuredSpan17Ms=${formatMeasured(idealParallelFullGridFromMeasuredSpan17Ms)} ` +
        `wireTotalMs=${formatMeasured(wireTotalMs)} ` +
        `attributedMs=${formatMeasured(attributedMs)} ` +
        `unattributedMs=${formatMeasured(unattributedMs)} (onPassWallClockMs - attributedMs, sign preserved) ` +
        `offPassWallClockMs=${formatMeasured(offPassWallClockMs)} calibrationScore=${score} ` +
        `armWallClockMs=${formatMeasured(armWallClockMs)} (this file's own wall clock, beforeAll start to this line, repeatCount=1 per profiling state, single-sample)`,
    )
  },
)
