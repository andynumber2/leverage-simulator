/**
 * bench/kernel-ablation.bench.test.ts
 *
 * quick-260824-r5d: the last unmeasured PERF-03 lever. 260824-52h isolated that real per-chunk
 * kernel compute divided by worker count explains 98.3% of sweep wall clock on its sandbox, with
 * no meaningful pool-overhead lever left to spend. Its section 5 names real per-cell kernel
 * compute at the 17-column chunk shape as the only place remaining headroom could come from, and
 * states nobody has measured whether it is reducible. This file measures exactly that.
 *
 * Diagnostic only. Every result reaches `.bench/bench-results.json` exclusively through
 * `commands.recordInfoLine`, under the single key `PERF-03-kernel-ablation` -- never through
 * `commands.recordMeasurement`: a `PERF-03-kernel-ablation` budget id does not exist in
 * perf-budgets.ts, and recording a MeasurementRow here would trip `assertRunInvariants`'
 * unknown-budget-id check.
 *
 * No kernel change ships. `src/kernel/backtest.ts`, `src/sweep/sweep-pool.ts`,
 * `src/sweep/sweep.worker.ts`, `bench/sweep.bench.test.ts`, `perf-budgets.ts` and
 * `bench/calibration.ts` stay byte-identical: every task's `<verify>` runs `git diff
 * --exit-code` against all six. Nothing under `src/` may import `backtest-ablation-variants.ts`
 * or `chunk-metrics-kernel-ablation.ts`.
 *
 * Every arm runs at the real 17-column chunk span. 260824-52h's own `spanRatio=0.51`
 * (`span17PerCellUs=132.82` versus `span2PerCellUs=260.00`) is why: per-cell cost at the real
 * full-grid chunk span is roughly half the per-cell cost at a narrower span, and measuring an
 * ablation at a narrow span is the exact error that produced the phantom 273.98ms residual this
 * project already refuted once.
 *
 * Gated off by default: every test in this file is skipped unless
 * `VITE_PERF03_ABLATION === '1'` reaches the browser context via `import.meta.env`. The flagged
 * invocation is:
 *
 *   BENCH_RESULTS_DIR=.bench/ablation VITE_PERF03_ABLATION=1 \
 *     npx vitest run --project bench bench/kernel-ablation.bench.test.ts
 *
 * That invocation exits non-zero BY CONSTRUCTION: `assertRunInvariants`' PERF-08 coverage gate
 * (bench/report.ts) finds the due PERF-08 rows unmeasured in a single-file run, because this file
 * measures none of them. The results artifact is written to `.bench/ablation/bench-results.json`
 * before that gate throws, so the info line this file records is always recoverable regardless of
 * the process exit code. The non-zero exit is a structural coverage-gate fact, never a budget
 * verdict, and is not worked around here.
 */

import { commands } from 'vitest/browser'
import { beforeAll, describe, expect, test } from 'vitest'

import type { LoadedBundle } from '../src/data/bundle-source.ts'
import { loadBundleFromFetch } from '../src/data/load-bundle-browser.ts'
import { FINANCING_SPREAD_DEFAULT, GENERIC_3X_EXPENSE_RATIO } from '../src/validation/cost-parameters.ts'
import { resolveEntryDateBounds } from '../src/app/bounds.ts'
import { SWEEP_COLS, SWEEP_ROWS } from '../src/sweep/sweep-grid.ts'
import type { SweepBaseParams } from '../src/sweep/sweep-pool.ts'
import { computeChunkMetrics, type SweepChunkRequest } from '../src/sweep/sweep.worker.ts'
import { runBacktest } from '../src/kernel/backtest.ts'
import type { KernelOutputs, KernelParams, KernelResult, KernelSeries } from '../src/kernel/backtest.types.ts'
import { fromDaysSinceEpoch, indexOfDate, toDaysSinceEpoch } from '../tools/bundle-compiler/src/calendar.ts'
import { computeChunkMetricsWithKernel } from './chunk-metrics-kernel-ablation.ts'
import {
  type AblationKernel,
  runBacktestCombined,
  runBacktestDayCountLut,
  runBacktestDayCountReciprocal,
  runBacktestDedupDrawdown,
  runBacktestDrawdownSkip,
  runBacktestNoGuards,
  runBacktestPeelBarZero,
} from './backtest-ablation-variants.ts'
import { runBacktestScalarOnly } from './backtest-scalar-only.ts'
import { resolveRunCalibration } from './canonical-calibration.ts'
import { captureEnvironment } from './environment-block.ts'

// The default-run gate: every test below is skipped unless this env var reaches the browser
// context. See this file's header comment for the exact flagged invocation. Cast locally rather
// than adding a `vite/client` types reference project-wide: this file is the only one that reads
// `import.meta.env`.
interface AblationImportMeta {
  env?: { VITE_PERF03_ABLATION?: string }
}
const ABLATION_ENABLED = (import.meta as unknown as AblationImportMeta).env?.VITE_PERF03_ABLATION === '1'

const SYMBOL = 'SPX'
const DIVIDEND_REINVEST = true
const INITIAL_INVESTMENT = 10_000

/** The real full-grid chunk shape (07.1-PERF-03-PROFILE.md context 3, reused by
 * bench/sweep-residual.bench.test.ts): `partitionColumns` splits 200 columns into 12 chunks at
 * `BASELINE_WORKER_COUNT=3` -- 8 chunks of 17 columns, 4 of 16. 17 is the span every arm below
 * runs at. */
const REAL_CHUNK_COLS = 17

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

/** Same construction as bench/sweep-residual.bench.test.ts's buildEarlyEntryDates: the first
 * SWEEP_COLS real trading sessions from the extended tier's own earliest date. */
function buildEarlyEntryDates(bundle: LoadedBundle): string[] {
  const bounds = resolveEntryDateBounds(bundle.manifest, SYMBOL, DIVIDEND_REINVEST, 'extended')
  if (!bounds.ok) {
    throw new Error(`kernel-ablation: could not resolve extended-tier entry-date bounds for ${SYMBOL}: ${bounds.reason}`)
  }
  const startAbsIndex = indexOfDate({ days: bundle.calendar }, toDaysSinceEpoch(bounds.firstDate))
  if (startAbsIndex === -1) {
    throw new Error(`kernel-ablation: extended-tier firstDate "${bounds.firstDate}" is not a calendar trading session`)
  }
  const dates: string[] = []
  for (let i = 0; i < SWEEP_COLS; i++) {
    const days = bundle.calendar[startAbsIndex + i]
    if (days === undefined) {
      throw new Error(`kernel-ablation: calendar index ${startAbsIndex + i} is out of range building the entry-date axis`)
    }
    dates.push(fromDaysSinceEpoch(days))
  }
  return dates
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

let bundle: LoadedBundle
let entryDates: string[]
let params: SweepBaseParams
let request17: SweepChunkRequest

// The equivalence-case series, read once via the same production bridge
// bench/kernel-scalar-arrays.bench.test.ts uses.
let returns: Float64Array
let shortRate: Float64Array
let calendarDaysElapsed: Int32Array
let barCount: number
let basePayloadParams: KernelParams

// Proof-before-timing gate: the timing test throws unless this equals its expected value.
// Vitest continues after a failed test, so this counter is the mechanism, not declaration order.
let provenCaseCount = 0

// Recorded by the fidelity test, read by the timing test's info line: the injected-callee
// polymorphism tax is a measured number, not an assumption.
let fidelityRealMs = 0
let fidelityCloneMs = 0

/** The four cases 260824-46s and bench/kernel-scalar-arrays.bench.test.ts both use, built once in
 * beforeAll (the ruin case needs a leverage sweep against the real series) and looked up by index
 * from the test bodies below -- test() calls register at module-load time, before beforeAll has
 * run, so the registration loops below iterate a static list of case NAMES, never this array
 * itself. */
interface EquivalenceCase {
  name: string
  params: KernelParams
  flags: Uint8Array
  assertNonVacuous: (shipped: KernelResult) => void
}
const CASE_NAMES = ['zero-contribution', 'contribution-schedule', 'ruin', 'leverage-below-1'] as const
let equivalenceCases: EquivalenceCase[] = []

beforeAll(async () => {
  bundle = await loadBundleFromFetch()
  entryDates = buildEarlyEntryDates(bundle)
  params = baseParams()
  request17 = chunkRequestFor(params, entryDates.slice(0, REAL_CHUNK_COLS), 1)

  const payload = await commands.readKernelSeries()
  returns = Float64Array.from(payload.returns)
  shortRate = Float64Array.from(payload.shortRate)
  calendarDaysElapsed = Int32Array.from(payload.calendarDaysElapsed)
  barCount = payload.barCount
  basePayloadParams = {
    leverage: payload.leverage,
    initialInvestment: payload.initialInvestment,
    contributionAmount: payload.contributionAmount,
    financingSpread: payload.financingSpread,
    expenseRatio: payload.expenseRatio,
    longGapMinDays: payload.longGapMinDays,
  }

  const zeroFlags = new Uint8Array(barCount)
  const contribFlags = new Uint8Array(barCount)
  for (let i = 0; i < barCount; i += 21) {
    contribFlags[i] = 1
  }

  // Leverage swept upward from 20, exactly as 260824-46s did, until the real series actually
  // ruins over this history, rather than assumed.
  let ruinLeverage = 20
  let probe = runBacktest(
    { ...basePayloadParams, leverage: ruinLeverage, contributionAmount: 0 },
    { returns, shortRate, calendarDaysElapsed, contributionFlags: zeroFlags },
    { outValue: new Float64Array(barCount), outRuined: new Uint8Array(barCount), outLongGap: new Uint8Array(barCount) },
  )
  while (!probe.ruined && ruinLeverage < 1000) {
    ruinLeverage *= 2
    probe = runBacktest(
      { ...basePayloadParams, leverage: ruinLeverage, contributionAmount: 0 },
      { returns, shortRate, calendarDaysElapsed, contributionFlags: zeroFlags },
      { outValue: new Float64Array(barCount), outRuined: new Uint8Array(barCount), outLongGap: new Uint8Array(barCount) },
    )
  }
  if (!probe.ruined) {
    throw new Error(`beforeAll: leverage swept up to ${ruinLeverage} without the real series ruining`)
  }

  equivalenceCases = [
    {
      name: 'zero-contribution',
      params: { ...basePayloadParams, contributionAmount: 0 },
      flags: zeroFlags,
      assertNonVacuous: (shipped) => {
        expect(shipped.barCount, 'zero-contribution case must span the full committed history').toBeGreaterThan(20000)
      },
    },
    {
      name: 'contribution-schedule',
      params: { ...basePayloadParams, contributionAmount: 100 },
      flags: contribFlags,
      assertNonVacuous: (shipped) => {
        expect(shipped.totalContributed, 'contributions must actually have been applied').toBeGreaterThan(
          basePayloadParams.initialInvestment,
        )
      },
    },
    {
      name: 'ruin',
      params: { ...basePayloadParams, leverage: ruinLeverage, contributionAmount: 0 },
      flags: zeroFlags,
      assertNonVacuous: (shipped) => {
        expect(shipped.ruined, 'ruin case must actually ruin').toBe(true)
        expect(shipped.ruinBarIndex, 'ruin case must record a valid ruin bar index').toBeGreaterThanOrEqual(0)
        expect(
          shipped.maxDrawdown,
          'a ruin crossing must drive maxDrawdown to exactly 1 against a strictly positive prior peak',
        ).toBe(1)
      },
    },
    {
      name: 'leverage-below-1',
      params: { ...basePayloadParams, leverage: 0.5, contributionAmount: 0 },
      flags: zeroFlags,
      assertNonVacuous: (shipped) => {
        expect(shipped.ruined, 'leverage-below-1 case must exercise the negative-financing non-ruin path').toBe(false)
      },
    },
  ]
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

/** Per-field Object.is comparison (Vitest's toBe), never toEqual, for the same reason
 * bench/kernel-scalar-arrays.bench.test.ts uses it: any difference here is a bug in the variant,
 * never a tolerance question, because these variants reorder no arithmetic. */
function assertKernelResultBitIdentical(caseName: string, shipped: KernelResult, variant: KernelResult): void {
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

// --- Harness fidelity: the clone must be proven bit-identical before it is trusted -------------

describe.skipIf(!ABLATION_ENABLED)('kernel ablation (VITE_PERF03_ABLATION=1)', () => {
  test('harness fidelity: computeChunkMetricsWithKernel matches the real computeChunkMetrics at a real 17-column request', () => {
    const realStart = performance.now()
    const real = computeChunkMetrics(bundle, request17)
    const realMs = performance.now() - realStart

    const cloneStart = performance.now()
    const clone = computeChunkMetricsWithKernel(bundle, request17, runBacktest)
    const cloneMs = performance.now() - cloneStart

    const cellCount = real.multiples.length
    expect(cellCount, 'cellCount must be exactly 17 * SWEEP_ROWS').toBe(REAL_CHUNK_COLS * SWEEP_ROWS)
    expect(
      Array.from(real.multiples).some((m) => m !== 0),
      'at least one multiple must be nonzero (non-vacuity)',
    ).toBe(true)

    for (let i = 0; i < cellCount; i++) {
      expect(Object.is(clone.multiples[i], real.multiples[i]), `multiples[${i}]: clone=${clone.multiples[i]} real=${real.multiples[i]}`).toBe(true)
      expect(Object.is(clone.drawdowns[i], real.drawdowns[i]), `drawdowns[${i}]: clone=${clone.drawdowns[i]} real=${real.drawdowns[i]}`).toBe(true)
      expect(
        Object.is(clone.annualized[i], real.annualized[i]),
        `annualized[${i}]: clone=${clone.annualized[i]} real=${real.annualized[i]}`,
      ).toBe(true)
      expect(Object.is(clone.flags[i], real.flags[i]), `flags[${i}]: clone=${clone.flags[i]} real=${real.flags[i]}`).toBe(true)
    }

    // Recorded for the info line: the injected-callee polymorphism tax is a measured number.
    fidelityRealMs = realMs
    fidelityCloneMs = cloneMs

    provenCaseCount++
  })

  // --- Equivalence: arms 1, 2-lut, 3(drawdown skip), 4(peel bar zero), 5(dedup drawdown),
  // 6(scalar-only), 8(combined) -- every candidate EXPECTED bit-preserving, over the same four
  // cases 260824-46s used. Table-driven per this task's own instruction: the expected proven-case
  // count comes from this table's length, not a hand-written literal, so adding an arm without
  // proving it cannot pass the gate below. Arm 3 (day-count reciprocal) is NOT in this table --
  // it is not expected bit-preserving and is measured separately, by deviation, below.

  const bitPreservingArms: Array<{ armLabel: string; kernel: AblationKernel }> = [
    { armLabel: '1(noGuards)', kernel: runBacktestNoGuards },
    { armLabel: '2(dayCountLut)', kernel: runBacktestDayCountLut },
    { armLabel: '3(drawdownSkip)', kernel: runBacktestDrawdownSkip },
    { armLabel: '4(peelBarZero)', kernel: runBacktestPeelBarZero },
    { armLabel: '5(dedupDrawdown)', kernel: runBacktestDedupDrawdown },
    { armLabel: '6(scalarOnly)', kernel: runBacktestScalarOnly },
    { armLabel: '8(combined)', kernel: runBacktestCombined },
  ]

  for (const arm of bitPreservingArms) {
    for (let caseIndex = 0; caseIndex < CASE_NAMES.length; caseIndex++) {
      const caseName = CASE_NAMES[caseIndex]
      test(`equivalence: arm ${arm.armLabel}, ${caseName}`, () => {
        const c = equivalenceCases[caseIndex]!
        const series = makeSeries(c.flags)
        const shipped = runBacktest(c.params, series, makeOutputs())
        const variant = arm.kernel(c.params, series, makeOutputs())

        c.assertNonVacuous(shipped)
        assertKernelResultBitIdentical(`${arm.armLabel}:${caseName}`, shipped, variant)
        provenCaseCount++
      })
    }
  }

  // --- Deviation: arm 2 variant (runBacktestDayCountReciprocal), NOT expected bit-preserving.
  // finalValue, maxDrawdown, droppedContributionsTotal and totalContributed are recorded as max
  // absolute and max relative deviation from the shipped result across the four cases; ruined,
  // ruinBarIndex, longGapBarCount and barCount are asserted EXACTLY equal (a broken variant fails
  // loudly), and relative deviation on finalValue is asserted below 1e-9 (a genuine rounding
  // difference is recorded, never hidden).

  const RECIPROCAL_DEVIATION_FIELDS = ['finalValue', 'maxDrawdown', 'droppedContributionsTotal', 'totalContributed'] as const
  const reciprocalMaxAbsDeviation: Record<(typeof RECIPROCAL_DEVIATION_FIELDS)[number], number> = {
    finalValue: 0,
    maxDrawdown: 0,
    droppedContributionsTotal: 0,
    totalContributed: 0,
  }
  const reciprocalMaxRelDeviation: Record<(typeof RECIPROCAL_DEVIATION_FIELDS)[number], number> = {
    finalValue: 0,
    maxDrawdown: 0,
    droppedContributionsTotal: 0,
    totalContributed: 0,
  }
  let reciprocalDeviationCaseCount = 0

  for (let caseIndex = 0; caseIndex < CASE_NAMES.length; caseIndex++) {
    const caseName = CASE_NAMES[caseIndex]
    test(`deviation: arm 2 variant (runBacktestDayCountReciprocal, NOT bit-preserving), ${caseName}`, () => {
      const c = equivalenceCases[caseIndex]!
      const series = makeSeries(c.flags)
      const shipped = runBacktest(c.params, series, makeOutputs())
      const variant = runBacktestDayCountReciprocal(c.params, series, makeOutputs())

      c.assertNonVacuous(shipped)

      expect(variant.ruined, `${caseName}: ruined must be exactly equal (a broken variant fails loudly)`).toBe(shipped.ruined)
      expect(variant.ruinBarIndex, `${caseName}: ruinBarIndex must be exactly equal`).toBe(shipped.ruinBarIndex)
      expect(variant.longGapBarCount, `${caseName}: longGapBarCount must be exactly equal`).toBe(shipped.longGapBarCount)
      expect(variant.barCount, `${caseName}: barCount must be exactly equal`).toBe(shipped.barCount)

      for (const field of RECIPROCAL_DEVIATION_FIELDS) {
        const shippedValue = shipped[field]
        const variantValue = variant[field]
        const absDeviation = Math.abs(shippedValue - variantValue)
        const relDeviation = shippedValue !== 0 ? absDeviation / Math.abs(shippedValue) : absDeviation
        if (absDeviation > reciprocalMaxAbsDeviation[field]) {
          reciprocalMaxAbsDeviation[field] = absDeviation
        }
        if (relDeviation > reciprocalMaxRelDeviation[field]) {
          reciprocalMaxRelDeviation[field] = relDeviation
        }
      }

      expect(
        reciprocalMaxRelDeviation.finalValue,
        `${caseName}: relative deviation on finalValue must stay below 1e-9`,
      ).toBeLessThan(1e-9)

      reciprocalDeviationCaseCount++
    })
  }

  // --- Timing: gated on both counters above, SAMPLE_COUNT rounds over all nine arms at the
  // 17-column span, arm order rotated by round index so no arm sits systematically early or late.

  const EXPECTED_PROVEN_CASES = 1 + bitPreservingArms.length * CASE_NAMES.length // fidelity + every bit-preserving arm's four cases
  const EXPECTED_RECIPROCAL_DEVIATION_CASES = CASE_NAMES.length
  const SAMPLE_COUNT = 3

  interface NineArm {
    name: string
    kernel: AblationKernel
    bitPreserving: boolean
  }
  const nineArms: NineArm[] = [
    { name: 'shipped', kernel: runBacktest, bitPreserving: true },
    { name: 'noGuards', kernel: runBacktestNoGuards, bitPreserving: true },
    { name: 'dayCountLut', kernel: runBacktestDayCountLut, bitPreserving: true },
    { name: 'dayCountReciprocal', kernel: runBacktestDayCountReciprocal, bitPreserving: false },
    { name: 'drawdownSkip', kernel: runBacktestDrawdownSkip, bitPreserving: true },
    { name: 'peelBarZero', kernel: runBacktestPeelBarZero, bitPreserving: true },
    { name: 'dedupDrawdown', kernel: runBacktestDedupDrawdown, bitPreserving: true },
    { name: 'scalarOnly', kernel: runBacktestScalarOnly, bitPreserving: true },
    { name: 'combined', kernel: runBacktestCombined, bitPreserving: true },
  ]

  function minMedianMax(values: number[]): { min: number; median: number; max: number } {
    const sorted = [...values].sort((a, b) => a - b)
    const min = sorted[0]!
    const max = sorted[sorted.length - 1]!
    const mid = Math.floor(sorted.length / 2)
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
    return { min, median, max }
  }

  /** Elision guard: every arm accumulates into this file-scoped sink so no arm's kernel result
   * the JIT can prove dead is eligible to be elided from that arm's measured cost. */
  let elisionSink = 0

  test('PERF-03 kernel ablation: all nine arms, three rotated rounds at the 17-column span', async () => {
    if (provenCaseCount !== EXPECTED_PROVEN_CASES) {
      throw new Error(
        `PERF-03 kernel ablation timing test refuses to run: expected ${EXPECTED_PROVEN_CASES} proven ` +
          `bit-preserving cases (fidelity + every bit-preserving arm's four cases), got ${provenCaseCount}. ` +
          'A faster wrong answer must never be reported as an improvement.',
      )
    }
    if (reciprocalDeviationCaseCount !== EXPECTED_RECIPROCAL_DEVIATION_CASES) {
      throw new Error(
        `PERF-03 kernel ablation timing test refuses to run: expected ${EXPECTED_RECIPROCAL_DEVIATION_CASES} ` +
          `reciprocal deviation cases recorded, got ${reciprocalDeviationCaseCount}.`,
      )
    }

    const armStartMs = performance.now()
    const score = await resolveRunCalibration()
    await commands.recordEnvironment(captureEnvironment(score))

    // One full warm-up round over all nine arms, discarded.
    for (const arm of nineArms) {
      elisionSink += computeChunkMetricsWithKernel(bundle, request17, arm.kernel).multiples[0] ?? 0
    }

    // SAMPLE_COUNT measured rounds. Every arm runs exactly once per round; arm order rotates by
    // round index. Each round's ratios are computed against that SAME round's own shipped-arm
    // time, never against a different round's.
    const roundRawMs: Array<Record<string, number>> = []
    for (let round = 0; round < SAMPLE_COUNT; round++) {
      const offset = round % nineArms.length
      const order = [...nineArms.slice(offset), ...nineArms.slice(0, offset)]
      const raw: Record<string, number> = {}
      for (const arm of order) {
        const start = performance.now()
        const result = computeChunkMetricsWithKernel(bundle, request17, arm.kernel)
        const elapsed = performance.now() - start
        elisionSink += result.multiples[0] ?? 0
        raw[arm.name] = elapsed
      }
      roundRawMs.push(raw)
    }

    if (!Number.isFinite(elisionSink) || elisionSink === 0) {
      throw new Error(
        `PERF-03 kernel ablation: elision guard sink is ${elisionSink}; a kernel result the JIT can prove ` +
          'dead would manufacture an arbitrarily good ratio for the arm with less to elide',
      )
    }

    const ratiosByArm: Record<string, number[]> = {}
    for (const arm of nineArms) {
      ratiosByArm[arm.name] = []
    }
    for (const raw of roundRawMs) {
      const shippedMs = raw.shipped!
      for (const arm of nineArms) {
        ratiosByArm[arm.name]!.push(raw[arm.name]! / shippedMs)
      }
    }

    const cellCount = REAL_CHUNK_COLS * SWEEP_ROWS
    const perArmText = nineArms
      .filter((a) => a.name !== 'shipped')
      .map((a) => {
        const stats = minMedianMax(ratiosByArm[a.name]!)
        return (
          `${a.name}(bitPreserving=${a.bitPreserving} minRatio=${stats.min.toFixed(4)} ` +
          `medianRatio=${stats.median.toFixed(4)} maxRatio=${stats.max.toFixed(4)})`
        )
      })
      .join(' ')

    const armWallClockMs = performance.now() - armStartMs

    await commands.recordInfoLine(
      'PERF-03-kernel-ablation',
      `PERF-03-kernel-ablation (Task 2, all nine arms, ${SAMPLE_COUNT} rotated rounds at the 17-column span): ` +
        `hardwareConcurrency=${navigator.hardwareConcurrency} calibrationScore=${score.toFixed(4)} ` +
        `barCount=${barCount} cellCount=${cellCount} sampleCount=${SAMPLE_COUNT} ` +
        `fidelityRealMs=${fidelityRealMs.toFixed(4)} fidelityCloneMs=${fidelityCloneMs.toFixed(4)} ` +
        `${perArmText} ` +
        `dayCountReciprocalMaxAbsDeviation=${JSON.stringify(reciprocalMaxAbsDeviation)} ` +
        `dayCountReciprocalMaxRelDeviation=${JSON.stringify(reciprocalMaxRelDeviation)} ` +
        `armWallClockMs=${armWallClockMs.toFixed(2)}`,
    )
  })
})
