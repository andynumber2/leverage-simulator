/**
 * tests/kernel/allocation.test.ts: Task 2 (03-05), SIM-11's no-GC-pressure claim proven by a
 * forced-collection heap-delta measurement over 10,000 real `runBacktest` invocations, plus a
 * batch-flatness cross-check. Both fail loudly when the evidence is unavailable rather than
 * skipping (T-03-19): the only way this suite reports green is by actually measuring.
 *
 * Two independent signals, per 03-RESEARCH.md's "Allocation-Free Hot Loop and GC-Pressure
 * Measurement" section: a heap-delta measurement with collection forced at a fixed interval
 * inside the loop (not only at its ends, since V8's old-generation collector prefers an idle
 * thread and this loop never idles), and a batch-flatness cross-check (the browser-side technique
 * PERF-02's calibration harness already uses, mirrored here without a browser).
 */

import { expect, test } from 'vitest'

import { measureBatchedMinOfN, REPEAT_COUNT } from '../../bench/calibration.ts'
import { runBacktest } from '../../src/kernel/backtest.ts'
import type { KernelResult, KernelSeries } from '../../src/kernel/backtest.types.ts'
import { baseKernelParams, makeKernelSeries, makeOutputs } from './fixtures.ts'

const BAR_COUNT = 25_000
const ITERATIONS = 10_000
const GC_INTERVAL = 1_000

/**
 * `runBacktest` builds one small `KernelResult` object per call (SIM-10's return-shape contract),
 * so 10,000 calls legitimately produce 10,000 short-lived objects, which the forced collections
 * below reclaim. This tolerance covers the Node/V8 test harness's own resident growth across a
 * long synchronous loop (module bookkeeping, JIT tier-up bookkeeping, `expect()`'s own overhead
 * on the surrounding assertions), not the kernel's -- a genuine per-call array/typed-array leak
 * over 10,000 iterations would land orders of magnitude above this figure, not fractionally
 * above it.
 */
const HEAP_DELTA_TOLERANCE_BYTES = 5_000_000

/** Deterministic, hand-built series (not the committed bundle): this is an allocation test, not a
 * correctness test, and tests/data/kernel-inputs.test.ts and tests/kernel/pitfalls-a.test.ts /
 * ruin.test.ts already own correctness. A fixed repeating return pattern with periodic long
 * calendar gaps exercises the same branches (financing, expense, long-gap flag) the production
 * kernel takes on a real run, without ever driving `value` to zero (no ruin branch): the 10,000th
 * call's result must equal the first call's, which only holds if the run never ruins (a ruined
 * run's `finalValue` is always exactly 0 regardless of which call produced it, which would make
 * this specific equality assertion vacuous). */
function buildDeterministicSeries(barCount: number): KernelSeries {
  const RETURN_CYCLE = [0.0005, -0.0005, 0.0003, -0.0003]
  const returns: number[] = new Array(barCount)
  const shortRate: number[] = new Array(barCount)
  const calendarDaysElapsed: number[] = new Array(barCount)

  for (let i = 0; i < barCount; i++) {
    returns[i] = i === 0 ? 0 : (RETURN_CYCLE[i % RETURN_CYCLE.length] ?? 0)
    shortRate[i] = 0.02
    if (i === 0) {
      calendarDaysElapsed[i] = 0
    } else if (i % 500 === 0) {
      // Periodically clears LONG_GAP_FLAG_MIN_DAYS (6), exercising outLongGap's branch.
      calendarDaysElapsed[i] = 7
    } else if (i % 5 === 0) {
      calendarDaysElapsed[i] = 3
    } else {
      calendarDaysElapsed[i] = 1
    }
  }

  return makeKernelSeries(returns, shortRate, calendarDaysElapsed)
}

test('runBacktest performs 10,000 real invocations into reused buffers with no net heap growth after forced collection', () => {
  // T-03-19: fails loud, naming the flag and the config entry that supplies it, rather than
  // skipping -- a config regression here would otherwise silently remove the only SIM-11
  // evidence in the repo.
  if (typeof globalThis.gc !== 'function') {
    throw new Error(
      'tests/kernel/allocation.test.ts requires globalThis.gc(), which requires Node\'s ' +
        "--expose-gc flag. vitest.config.ts's `unit` project execArgv entry supplies this flag " +
        'to the pool\'s worker processes; without it, this heap-delta proof of SIM-11 cannot run.',
    )
  }

  const series = buildDeterministicSeries(BAR_COUNT)
  const params = baseKernelParams({ financingSpread: 0.005, expenseRatio: 0.0095 })
  const outputs = makeOutputs(BAR_COUNT)

  globalThis.gc()
  const heapBeforeBytes = process.memoryUsage().heapUsed

  let firstFinalValue: number | null = null
  let lastResult: KernelResult | null = null

  for (let i = 0; i < ITERATIONS; i++) {
    const result = runBacktest(params, series, outputs)
    if (i === 0) {
      firstFinalValue = result.finalValue
    }
    if (i === ITERATIONS - 1) {
      lastResult = result
    }
    // Deliberate: collection is forced at a fixed interval inside the loop, not only before and
    // after it, because a single before-and-after pair can pass while real garbage sits
    // uncollected -- V8's old-generation collector prefers an idle thread, and this loop never
    // idles.
    if ((i + 1) % GC_INTERVAL === 0) {
      globalThis.gc()
    }
  }

  globalThis.gc()
  const heapAfterBytes = process.memoryUsage().heapUsed
  const heapDeltaBytes = heapAfterBytes - heapBeforeBytes

  expect(
    heapDeltaBytes,
    `heapUsed grew by ${heapDeltaBytes} bytes across ${ITERATIONS} runBacktest calls into reused ` +
      `buffers (tolerance ${HEAP_DELTA_TOLERANCE_BYTES} bytes, heapBefore=${heapBeforeBytes}, ` +
      `heapAfter=${heapAfterBytes}): a delta beyond tolerance indicates a per-call allocation the ` +
      'forced collections could not reclaim',
  ).toBeLessThanOrEqual(HEAP_DELTA_TOLERANCE_BYTES)

  // Fails if any per-call state leaked into module scope: the buffers are genuinely reused, not
  // reallocated, so an identical run into the same buffers must reproduce an identical result.
  expect(lastResult?.finalValue).toBe(firstFinalValue)
  // Same reasoning as the timeout on the test below: ITERATIONS backtests plus forced collections
  // is duration-dependent on runner speed, while the assertion is about heap delta. Measured 1321ms
  // locally against 2907ms on ubuntu-latest, so the 5000ms default leaves no margin on a slower
  // 2-core runner.
}, 60_000)

// REPEAT_COUNT x (500 + 5000) backtests over BAR_COUNT bars is roughly 690M bar-iterations, which
// runs in a few seconds on a dev machine and comfortably past Vitest's 5000ms default on a shared
// CI runner (observed: 5431ms on ubuntu-latest, GitHub Actions run 32190604539). The assertion here
// is about the RATIO of per-call cost between the two batch sizes, so wall-clock duration is an
// incidental consequence of the workload rather than anything under test, and inheriting a default
// timeout that scales with runner speed made this red on slow hardware and green on fast. Shrinking
// the batches would narrow the very spread that makes a super-linear GC signature visible, so the
// timeout is raised to fit the workload instead. Kept finite so a genuine hang still fails.
test('per-call cost stays flat from batch size 500 to batch size 5000 (no per-call allocation signature)', async () => {
  const series = buildDeterministicSeries(BAR_COUNT)
  const params = baseKernelParams({ financingSpread: 0.005, expenseRatio: 0.0095 })
  const outputs = makeOutputs(BAR_COUNT)

  const smallBatchPerCallMs = await measureBatchedMinOfN(REPEAT_COUNT, 500, () => {
    runBacktest(params, series, outputs)
  })
  const largeBatchPerCallMs = await measureBatchedMinOfN(REPEAT_COUNT, 5000, () => {
    runBacktest(params, series, outputs)
  })
  const ratio = largeBatchPerCallMs / smallBatchPerCallMs

  // A per-call GC pause (the browser-side signature a hidden per-call allocation produces, per
  // 03-RESEARCH.md) would grow super-linearly with batch size; a genuinely allocation-free call
  // stays flat. This is the Node-side mirror of PERF-02's own calibration technique, needing no
  // browser, so it belongs next to the heap-delta assertion above.
  expect(
    ratio,
    `batch=500 perCallMs=${smallBatchPerCallMs.toFixed(4)} batch=5000 ` +
      `perCallMs=${largeBatchPerCallMs.toFixed(4)} ratio=${ratio.toFixed(4)}`,
  ).toBeLessThanOrEqual(1.5)
}, 60_000)
