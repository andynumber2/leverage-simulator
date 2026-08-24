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
import { runBacktestNoGuards } from './backtest-ablation-variants.ts'
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

  // --- Equivalence: arm 1 (runBacktestNoGuards), the four cases 260824-46s used -----------------

  test('equivalence: arm 1 (runBacktestNoGuards), zero contribution, the failing PERF-03 headline branch', () => {
    const p: KernelParams = { ...basePayloadParams, contributionAmount: 0 }
    const series = makeSeries(allZeroFlags())
    const shipped = runBacktest(p, series, makeOutputs())
    const variant = runBacktestNoGuards(p, series, makeOutputs())

    expect(shipped.barCount, 'zero-contribution case must span the full committed history').toBeGreaterThan(20000)
    assertKernelResultBitIdentical('zero-contribution', shipped, variant)
    provenCaseCount++
  })

  test('equivalence: arm 1 (runBacktestNoGuards), contribution schedule (D-21)', () => {
    const p: KernelParams = { ...basePayloadParams, contributionAmount: 100 }
    const flags = allZeroFlags()
    for (let i = 0; i < barCount; i += 21) {
      flags[i] = 1
    }
    const series = makeSeries(flags)
    const shipped = runBacktest(p, series, makeOutputs())
    const variant = runBacktestNoGuards(p, series, makeOutputs())

    expect(shipped.totalContributed, 'contributions must actually have been applied').toBeGreaterThan(p.initialInvestment)
    assertKernelResultBitIdentical('contribution-schedule', shipped, variant)
    provenCaseCount++
  })

  test('equivalence: arm 1 (runBacktestNoGuards), a run that ruins (D-22/D-23)', () => {
    const flags = allZeroFlags()
    let leverage = 20
    let probe = runBacktest({ ...basePayloadParams, leverage, contributionAmount: 0 }, makeSeries(flags), makeOutputs())
    while (!probe.ruined && leverage < 1000) {
      leverage *= 2
      probe = runBacktest({ ...basePayloadParams, leverage, contributionAmount: 0 }, makeSeries(flags), makeOutputs())
    }
    if (!probe.ruined) {
      throw new Error(`equivalence ruin case: leverage swept up to ${leverage} without the real series ruining`)
    }

    const p: KernelParams = { ...basePayloadParams, leverage, contributionAmount: 0 }
    const shipped = runBacktest(p, makeSeries(flags), makeOutputs())
    const variant = runBacktestNoGuards(p, makeSeries(flags), makeOutputs())

    expect(shipped.ruined, 'ruin case must actually ruin').toBe(true)
    expect(shipped.ruinBarIndex, 'ruin case must record a valid ruin bar index').toBeGreaterThanOrEqual(0)
    expect(
      shipped.maxDrawdown,
      'a ruin crossing must drive maxDrawdown to exactly 1 against a strictly positive prior peak',
    ).toBe(1)
    assertKernelResultBitIdentical('ruin', shipped, variant)
    provenCaseCount++
  })

  test('equivalence: arm 1 (runBacktestNoGuards), leverage below 1 (D-08 unclamped financing credit)', () => {
    const p: KernelParams = { ...basePayloadParams, leverage: 0.5, contributionAmount: 0 }
    const series = makeSeries(allZeroFlags())
    const shipped = runBacktest(p, series, makeOutputs())
    const variant = runBacktestNoGuards(p, series, makeOutputs())

    expect(shipped.ruined, 'leverage-below-1 case must exercise the negative-financing non-ruin path').toBe(false)
    assertKernelResultBitIdentical('leverage-below-1', shipped, variant)
    provenCaseCount++
  })

  // --- Timing: gated on the proven-case counter, arm 1 only in this task -------------------------

  const EXPECTED_PROVEN_CASES = 5 // fidelity (1) + arm-1 equivalence cases (4)

  /** Elision guard: both arms accumulate into this file-scoped sink so neither's kernel result
   * the JIT can prove dead is eligible to be elided from either arm's measured cost. */
  let elisionSink = 0

  test('PERF-03 kernel ablation: arm 1 vs shipped, one round at the 17-column span', async () => {
    if (provenCaseCount !== EXPECTED_PROVEN_CASES) {
      throw new Error(
        `PERF-03 kernel ablation timing test refuses to run: expected ${EXPECTED_PROVEN_CASES} proven cases ` +
          `(fidelity + arm-1 equivalence), got ${provenCaseCount}. A faster wrong answer must never be ` +
          'reported as an improvement.',
      )
    }

    const score = await resolveRunCalibration()
    await commands.recordEnvironment(captureEnvironment(score))

    // One warm-up round over both arms, discarded.
    elisionSink += computeChunkMetricsWithKernel(bundle, request17, runBacktest).multiples[0] ?? 0
    elisionSink += computeChunkMetricsWithKernel(bundle, request17, runBacktestNoGuards).multiples[0] ?? 0

    // One measured round: single-call performance.now() deltas, no batching -- a span-17 call is
    // roughly 113ms on this sandbox, comfortably clear of MIN_MEASUREMENT_MS.
    const shippedStart = performance.now()
    const shippedResult = computeChunkMetricsWithKernel(bundle, request17, runBacktest)
    const shippedMs = performance.now() - shippedStart
    elisionSink += shippedResult.multiples[0] ?? 0

    const variantStart = performance.now()
    const variantResult = computeChunkMetricsWithKernel(bundle, request17, runBacktestNoGuards)
    const variantMs = performance.now() - variantStart
    elisionSink += variantResult.multiples[0] ?? 0

    if (!Number.isFinite(elisionSink) || elisionSink === 0) {
      throw new Error(
        `PERF-03 kernel ablation: elision guard sink is ${elisionSink}; a kernel result the JIT can prove ` +
          'dead would manufacture an arbitrarily good ratio for the arm with less to elide',
      )
    }

    const ratio = variantMs / shippedMs
    const cellCount = REAL_CHUNK_COLS * SWEEP_ROWS

    await commands.recordInfoLine(
      'PERF-03-kernel-ablation',
      `PERF-03-kernel-ablation (Task 1, arm 1 only): hardwareConcurrency=${navigator.hardwareConcurrency} ` +
        `calibrationScore=${score.toFixed(4)} barCount=${barCount} cellCount=${cellCount} ` +
        `fidelityRealMs=${fidelityRealMs.toFixed(4)} fidelityCloneMs=${fidelityCloneMs.toFixed(4)} ` +
        `shippedMs=${shippedMs.toFixed(4)} noGuardsMs=${variantMs.toFixed(4)} noGuardsRatio=${ratio.toFixed(4)}`,
    )
  })
})
