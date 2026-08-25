/**
 * bench/kernel-scalar-arrays.bench.test.ts
 *
 * PERF-03 lever 1 measurement (07.1-PERF-03-BASELINE.md section 9: the kernel's write-only
 * per-bar output arrays, named there as an unspent lever, reasoned but not measured). Diagnostic
 * only: every result below reaches `.bench/bench-results.json` exclusively through
 * `commands.recordInfoLine` (bench/sweep-pool-profile.bench.test.ts's own precedent), never
 * through the gated measurement-row channel -- a `PERF-03-lever1-scalar-arrays` budget id does
 * not exist in perf-budgets.ts, and recording a MeasurementRow here would trip
 * assertRunInvariants' unknown-budget-id check.
 *
 * The four equivalence tests below run first and must pass, bit-identical field by field under
 * `Object.is` against the shipped kernel, over the real bundled ~25,000-bar SPX series. The
 * timing arm is added after these tests, gated on all four passing in the same file run via a
 * file-scoped `equivalenceCasesProven` counter -- a faster wrong answer can never be reported as
 * an improvement.
 */

import { commands } from 'vitest/browser'
import { beforeAll, expect, test } from 'vitest'

import type { KernelOutputs, KernelParams, KernelResult, KernelSeries } from '../src/kernel/backtest.types.ts'
import { runBacktest } from '../src/kernel/backtest.ts'
import { runBacktestScalarOnly } from './backtest-scalar-only.ts'
import { measureBatchedMinOfN, normalize, REPEAT_COUNT } from './calibration.ts'
import { resolveRunCalibration } from './canonical-calibration.ts'
import { captureEnvironment } from './environment-block.ts'

let returns: Float64Array
let shortRate: Float64Array
let calendarDaysElapsed: Int32Array
let barCount: number
let seriesId: string
let basePayloadParams: KernelParams

let equivalenceCasesProven = 0

beforeAll(async () => {
  const payload = await commands.readKernelSeries()
  returns = Float64Array.from(payload.returns)
  shortRate = Float64Array.from(payload.shortRate)
  calendarDaysElapsed = Int32Array.from(payload.calendarDaysElapsed)
  barCount = payload.barCount
  seriesId = payload.seriesId
  basePayloadParams = {
    leverage: payload.leverage,
    initialInvestment: payload.initialInvestment,
    contributionAmount: payload.contributionAmount,
    financingSpread: payload.financingSpread,
    expenseRatio: payload.expenseRatio,
    longGapMinDays: payload.longGapMinDays,
  }
})

function makeSeries(contributionFlags: Uint8Array): KernelSeries {
  return { returns, shortRate, calendarDaysElapsed, contributionFlags }
}

function makeOutputs(): KernelOutputs {
  return {
    outValue: new Float64Array(barCount),
    outRuined: new Uint8Array(barCount),
    outLongGap: new Uint8Array(barCount),
  }
}

function allZeroFlags(): Uint8Array {
  return new Uint8Array(barCount)
}

/** Per-field Object.is comparison (Vitest's toBe), never toEqual: toEqual does not distinguish
 * signed zero, and the variant reorders no arithmetic, so any difference here is a bug in the
 * variant, never a tolerance question. */
function assertFieldsBitIdentical(caseName: string, shipped: KernelResult, variant: KernelResult): void {
  const fields = [
    'finalValue',
    'ruined',
    'ruinBarIndex',
    'droppedContributionsTotal',
    'totalContributed',
    'longGapBarCount',
    'barCount',
    'maxDrawdown',
  ] as const
  for (const field of fields) {
    expect(
      variant[field],
      `${caseName}: field "${field}" must be bit-identical (Object.is) to the shipped kernel's`,
    ).toBe(shipped[field])
  }
}

// --- Equivalence proof: must pass before the timing test below is allowed to run ---------------

test('equivalence: zero contribution, the failing PERF-03 headline branch', () => {
  const params: KernelParams = { ...basePayloadParams, contributionAmount: 0 }
  const series = makeSeries(allZeroFlags())
  const shippedOutputs = makeOutputs()
  const variantOutputs = makeOutputs()

  const shipped = runBacktest(params, series, shippedOutputs)
  const variant = runBacktestScalarOnly(params, series, variantOutputs)

  expect(shipped.barCount, 'zero-contribution case must span the full committed history').toBeGreaterThan(20000)

  assertFieldsBitIdentical('zero-contribution', shipped, variant)

  // Direct proof the variant wrote nothing to its own output buffer, not an inference from
  // reading its source.
  expect(shippedOutputs.outValue[shipped.barCount - 1]).toBe(shipped.finalValue)
  const sampleIndices = [0, Math.floor(barCount / 2), barCount - 1]
  for (const idx of sampleIndices) {
    expect(variantOutputs.outValue[idx], `variant outValue[${idx}] must remain untouched (0)`).toBe(0)
  }

  equivalenceCasesProven++
})

test('equivalence: contribution schedule (D-21)', () => {
  const params: KernelParams = { ...basePayloadParams, contributionAmount: 100 }
  const flags = allZeroFlags()
  for (let i = 0; i < barCount; i += 21) {
    flags[i] = 1
  }
  const series = makeSeries(flags)

  const shipped = runBacktest(params, series, makeOutputs())
  const variant = runBacktestScalarOnly(params, series, makeOutputs())

  expect(
    shipped.totalContributed,
    'contributions must actually have been applied',
  ).toBeGreaterThan(params.initialInvestment)

  assertFieldsBitIdentical('contribution-schedule', shipped, variant)
  equivalenceCasesProven++
})

test('equivalence: a run that ruins (D-22/D-23)', () => {
  const flags = allZeroFlags()

  // Leverage swept upward from 20 until the run actually ruins over this history, rather than
  // assumed: if 20x does not ruin, the leverage is raised, never the assertion weakened.
  let leverage = 20
  let probe = runBacktest({ ...basePayloadParams, leverage, contributionAmount: 0 }, makeSeries(flags), makeOutputs())
  while (!probe.ruined && leverage < 1000) {
    leverage *= 2
    probe = runBacktest({ ...basePayloadParams, leverage, contributionAmount: 0 }, makeSeries(flags), makeOutputs())
  }
  if (!probe.ruined) {
    throw new Error(
      `equivalence ruin case: leverage swept up to ${leverage} without the real series ruining`,
    )
  }

  const params: KernelParams = { ...basePayloadParams, leverage, contributionAmount: 0 }
  const shippedOutputs = makeOutputs()
  const variantOutputs = makeOutputs()
  const shipped = runBacktest(params, makeSeries(flags), shippedOutputs)
  const variant = runBacktestScalarOnly(params, makeSeries(flags), variantOutputs)

  expect(shipped.ruined, 'ruin case must actually ruin').toBe(true)
  expect(shipped.ruinBarIndex, 'ruin case must record a valid ruin bar index').toBeGreaterThanOrEqual(0)
  expect(
    shipped.maxDrawdown,
    'a ruin crossing must drive maxDrawdown to exactly 1 against a strictly positive prior peak',
  ).toBe(1)

  assertFieldsBitIdentical('ruin', shipped, variant)
  equivalenceCasesProven++
})

test('equivalence: leverage below 1 (D-08 unclamped financing credit)', () => {
  const params: KernelParams = { ...basePayloadParams, leverage: 0.5, contributionAmount: 0 }
  const series = makeSeries(allZeroFlags())

  const shipped = runBacktest(params, series, makeOutputs())
  const variant = runBacktestScalarOnly(params, series, makeOutputs())

  expect(shipped.ruined, 'leverage-below-1 case must exercise the negative-financing non-ruin path').toBe(false)

  assertFieldsBitIdentical('leverage-below-1', shipped, variant)
  equivalenceCasesProven++
})

// --- Timing: gated on all four equivalence cases above, over the zero-contribution branch ------

const LEVER1_INFO_KEY = 'PERF-03-lever1-scalar-arrays'
const SAMPLE_COUNT = 5
const INITIAL_BATCH_SIZE = 250
const MAX_BATCH_DOUBLINGS = 4

/** Elision guard: both timed loops accumulate into this file-scoped sink so a kernel result the
 * JIT can prove dead is never eligible to be elided from either arm's measured cost. */
let elisionSink = 0

test('PERF-03 lever 1: scalar-only vs shipped kernel, A/B ratio over five samples', async () => {
  const armWallClockStart = performance.now()

  // The gate: a faster wrong answer can never be reported as an improvement. Declaration order
  // alone is not the guarantee (Vitest continues after a failed test); this check is what makes
  // proof-before-timing mechanical rather than a convention.
  if (equivalenceCasesProven !== 4) {
    throw new Error(
      `PERF-03 lever 1 timing test refuses to run: expected 4 proven equivalence cases, got ` +
        `${equivalenceCasesProven}. A faster wrong answer must never be reported as an improvement.`,
    )
  }

  // The zero-contribution branch only: the failing PERF-03 headline row measures this branch.
  const params: KernelParams = { ...basePayloadParams, contributionAmount: 0 }
  const series = makeSeries(allZeroFlags())

  const score = await resolveRunCalibration()
  await commands.recordEnvironment(captureEnvironment(score))

  const shippedOutputs = makeOutputs()
  const variantOutputs = makeOutputs()

  function runShipped(): void {
    const result = runBacktest(params, series, shippedOutputs)
    elisionSink += result.finalValue
  }
  function runVariant(): void {
    const result = runBacktestScalarOnly(params, series, variantOutputs)
    elisionSink += result.finalValue
  }

  // Size the batch once, against the faster arm (the scalar variant), before any sample is
  // recorded, so both arms in every sample share one batch size and the ratio stays apples to
  // apples. Doubles on a caught throw (how the MIN_MEASUREMENT_MS floor reports a sub-floor
  // batch), never lowers the floor itself.
  let batchSize = INITIAL_BATCH_SIZE
  let sized = false
  for (let attempt = 0; attempt <= MAX_BATCH_DOUBLINGS && !sized; attempt++) {
    try {
      await measureBatchedMinOfN(REPEAT_COUNT, batchSize, runVariant)
      sized = true
    } catch {
      if (attempt === MAX_BATCH_DOUBLINGS) {
        throw new Error(
          `PERF-03 lever 1: batch size ${batchSize} still under the MIN_MEASUREMENT_MS floor ` +
            `after ${MAX_BATCH_DOUBLINGS} doublings; raise INITIAL_BATCH_SIZE`,
        )
      }
      batchSize *= 2
    }
  }

  interface Sample {
    shippedNormalizedMs: number
    variantNormalizedMs: number
    ratio: number
  }
  const samples: Sample[] = []

  // SAMPLE_COUNT independent A/B samples, arm order alternated between samples (shipped first on
  // even-indexed samples, variant first on odd-indexed) so a monotone host drift over the test's
  // own wall clock cannot bias one arm systematically.
  for (let sampleIndex = 0; sampleIndex < SAMPLE_COUNT; sampleIndex++) {
    const shippedFirst = sampleIndex % 2 === 0
    let shippedRawMs: number
    let variantRawMs: number
    if (shippedFirst) {
      shippedRawMs = await measureBatchedMinOfN(REPEAT_COUNT, batchSize, runShipped)
      variantRawMs = await measureBatchedMinOfN(REPEAT_COUNT, batchSize, runVariant)
    } else {
      variantRawMs = await measureBatchedMinOfN(REPEAT_COUNT, batchSize, runVariant)
      shippedRawMs = await measureBatchedMinOfN(REPEAT_COUNT, batchSize, runShipped)
    }
    const shippedNormalizedMs = normalize(shippedRawMs, score)
    const variantNormalizedMs = normalize(variantRawMs, score)
    samples.push({
      shippedNormalizedMs,
      variantNormalizedMs,
      ratio: variantNormalizedMs / shippedNormalizedMs,
    })
  }

  if (!Number.isFinite(elisionSink) || elisionSink === 0) {
    throw new Error(
      `PERF-03 lever 1: elision guard sink is ${elisionSink}; a kernel result the JIT can prove ` +
        'dead would manufacture an arbitrarily good ratio for the arm with less to elide',
    )
  }

  const ratios = samples.map((s) => s.ratio).sort((a, b) => a - b)
  const min = ratios[0]!
  const max = ratios[ratios.length - 1]!
  const mid = Math.floor(ratios.length / 2)
  const median = ratios.length % 2 === 0 ? (ratios[mid - 1]! + ratios[mid]!) / 2 : ratios[mid]!

  const armWallClockMs = performance.now() - armWallClockStart

  const sampleText = samples
    .map(
      (s, i) =>
        `sample${i}(shippedNormalizedMs=${s.shippedNormalizedMs.toFixed(4)} ` +
        `variantNormalizedMs=${s.variantNormalizedMs.toFixed(4)} ratio=${s.ratio.toFixed(4)})`,
    )
    .join(' ')

  await commands.recordInfoLine(
    LEVER1_INFO_KEY,
    `PERF-03-lever1-scalar-arrays (scalar-only per-bar output arrays, timed over the ` +
      `zero-contribution branch, the failing PERF-03 headline row): batchSize=${batchSize} sampleCount=${SAMPLE_COUNT} ` +
      `barCount=${barCount} seriesId=${seriesId} hardwareConcurrency=${navigator.hardwareConcurrency} ` +
      `calibrationScore=${score.toFixed(4)} ${sampleText} minRatio=${min.toFixed(4)} ` +
      `medianRatio=${median.toFixed(4)} maxRatio=${max.toFixed(4)} armWallClockMs=${armWallClockMs.toFixed(2)}`,
  )
})
