/**
 * tests/sweep/metrics-one-pass.test.ts
 *
 * 07-03-PLAN.md Task 1 (METR-06): proves `src/sweep/sweep.worker.ts`'s `computeChunkMetrics`
 * writes `multiples`, `drawdowns`, `annualized` and `flags` for every cell from the SAME
 * `runBacktest` call, at a 50-cell stride sample checked against a serially recomputed reference,
 * following `bench/sweep.bench.test.ts`'s `SERIAL_REFERENCE_STRIDE` precedent. Loads the real
 * committed bundle through the same Node loader `tests/sweep/column-series.test.ts` uses
 * (`loadBundleFromDisk`), so this file runs in the fast Node `unit` project -- `computeChunkMetrics`
 * is Comlink-free and never touches `fetch` (see `sweep.worker.ts`'s own header comment).
 *
 * Five behaviors, per the plan's own <behavior>/<acceptance_criteria>:
 * 1. multiples/drawdowns/annualized/flags all match a serial reference at a 50-cell stride sample
 *    spanning both axes (the CAGR branch, `contributionAmount === 0`).
 * 2. The IRR branch (`contributionAmount !== 0`) matches `solveIrr(buildCashFlows(...))` too.
 * 3. An undefined annualized result (a zero initial investment makes `solveCagr` return `null`)
 *    stores a non-finite value, never `0`.
 * 4. An incomplete cell (D-28 fixed-period overrun) carries `CELL_FLAG_INCOMPLETE` and stores `0`
 *    in all three metric arrays.
 * 5. `bandIndexFor`'s existing upper-band tie rule resolves an interior boundary to exactly one
 *    band (METR-06 adjacency), independent of which metric produced the ramp position.
 */

import { describe, expect, test } from 'vitest'

import { runBacktest } from '../../src/kernel/backtest.ts'
import { LONG_GAP_FLAG_MIN_DAYS, type KernelOutputs, type KernelParams } from '../../src/kernel/backtest.types.ts'
import type { LoadedBundle } from '../../src/data/bundle-source.ts'
import { loadBundleFromDisk } from '../../src/data/load-bundle-node.ts'
import { CELL_FLAG_INCOMPLETE, CELL_FLAG_RUINED } from '../../src/data/sweep-fixture-format.ts'
import { solveCagr } from '../../src/metrics/cagr.ts'
import { buildCashFlows, solveIrr } from '../../src/metrics/irr.ts'
import { BAND_LEVELS, bandIndexFor } from '../../src/heatmap/field-sampler.ts'
import { resolveColumnSeries, type ColumnSeriesRequest } from '../../src/sweep/resolve-column-series.ts'
import { ANNUALIZED_UNDEFINED, leverageForRow, SWEEP_ROWS } from '../../src/sweep/sweep-grid.ts'
import { computeChunkMetrics, type SweepBaseParams, type SweepChunkRequest } from '../../src/sweep/sweep.worker.ts'
import { fromDaysSinceEpoch, indexOfDate, toDaysSinceEpoch } from '../../tools/bundle-compiler/src/calendar.ts'

const SYMBOL = 'SPX'
const EXPENSE_RATIO_PERCENT = 0.9
const FINANCING_SPREAD_PERCENT = 0.5
const INITIAL_INVESTMENT = 10_000

/** The same strict-tier bounds `tests/sweep/column-series.test.ts` already proves are real
 * trading sessions in the compiled calendar (1988-01-05 to 2026-08-14). */
const RANGE_START = '1988-01-05'
const RANGE_END = '2026-08-14'

function baseParams(overrides: Partial<SweepBaseParams> = {}): SweepBaseParams {
  return {
    symbol: SYMBOL,
    dividendReinvest: true,
    initialInvestment: INITIAL_INVESTMENT,
    contributionAmount: 0,
    contributionFrequency: 'none',
    expenseRatioPercent: EXPENSE_RATIO_PERCENT,
    financingSpreadPercent: FINANCING_SPREAD_PERCENT,
    holdingPeriodBars: null,
    ...overrides,
  }
}

/** Picks `count` real, evenly-spaced trading-session dates between `startDate` and `endDate`
 * (inclusive), read straight off the bundle's own compiled calendar -- every returned date is
 * guaranteed to be a real trading session, never a guessed weekend or holiday. */
function pickEntryDates(bundle: LoadedBundle, count: number, startDate: string, endDate: string): string[] {
  const startAbsIndex = indexOfDate({ days: bundle.calendar }, toDaysSinceEpoch(startDate))
  const endAbsIndex = indexOfDate({ days: bundle.calendar }, toDaysSinceEpoch(endDate))
  if (startAbsIndex === -1 || endAbsIndex === -1) {
    throw new Error('pickEntryDates: startDate/endDate must be real trading sessions in the compiled calendar')
  }
  const dates: string[] = []
  for (let i = 0; i < count; i++) {
    const frac = count === 1 ? 0 : i / (count - 1)
    const absIndex = Math.round(startAbsIndex + frac * (endAbsIndex - startAbsIndex))
    const days = bundle.calendar[absIndex]
    if (days === undefined) {
      throw new Error(`pickEntryDates: calendar index ${absIndex} is out of range`)
    }
    dates.push(fromDaysSinceEpoch(days))
  }
  return dates
}

function buildRequest(params: SweepBaseParams, entryDates: string[], rowIndices: number[]): SweepChunkRequest {
  return {
    generation: 0,
    params,
    columnIndices: entryDates.map((_, i) => i),
    entryDates,
    rowIndices,
  }
}

interface ReferenceCell {
  multiple: number
  drawdown: number
  annualized: number
  flag: number
}

/** Recomputes ONE cell's expected values independently of `computeChunkMetrics`: resolves the
 * column fresh, runs `runBacktest` once, and derives `annualized` via the same D-24 branch rule
 * `computeChunkMetrics` uses -- but from a freshly-allocated `KernelOutputs`/cash-flow array each
 * call, never the worker's own scratch buffers, so this reference cannot share a bug with the
 * code under test. */
function computeReferenceCell(
  bundle: LoadedBundle,
  params: SweepBaseParams,
  entryDate: string,
  row: number,
): ReferenceCell {
  const columnRequest: ColumnSeriesRequest = {
    symbol: params.symbol,
    dividendReinvest: params.dividendReinvest,
    entryDate,
    holdingPeriodBars: params.holdingPeriodBars,
    contributionAmount: params.contributionAmount,
    contributionFrequency: params.contributionFrequency,
  }
  const resolution = resolveColumnSeries(bundle, columnRequest)
  if (resolution.incomplete) {
    return { multiple: 0, drawdown: 0, annualized: 0, flag: CELL_FLAG_INCOMPLETE }
  }

  const outputs: KernelOutputs = {
    outValue: new Float64Array(resolution.barCount),
    outRuined: new Uint8Array(resolution.barCount),
    outLongGap: new Uint8Array(resolution.barCount),
  }
  const leverage = leverageForRow(row)
  const kernelParams: KernelParams = {
    leverage,
    initialInvestment: params.initialInvestment,
    contributionAmount: params.contributionAmount,
    financingSpread: params.financingSpreadPercent / 100,
    expenseRatio: params.expenseRatioPercent / 100,
    longGapMinDays: LONG_GAP_FLAG_MIN_DAYS,
  }
  const result = runBacktest(kernelParams, resolution, outputs)

  const multiple = result.totalContributed > 0 ? result.finalValue / result.totalContributed : 0
  const drawdown = result.maxDrawdown
  const flag = result.ruined ? CELL_FLAG_RUINED : 0

  let annualizedValue: number | null
  if (params.contributionAmount !== 0) {
    const flows = buildCashFlows(kernelParams, resolution, outputs, result)
    annualizedValue = solveIrr(flows)
  } else {
    const calendarDays = toDaysSinceEpoch(resolution.lastDate) - toDaysSinceEpoch(resolution.firstDate)
    annualizedValue = solveCagr(kernelParams.initialInvestment, result.finalValue, calendarDays)
  }
  const annualized = annualizedValue === null ? ANNUALIZED_UNDEFINED : annualizedValue

  return { multiple, drawdown, annualized, flag }
}

/** `Float32Array` storage rounds every value `computeChunkMetrics` writes, so an exact-equality
 * assertion against a float64 reference would fail on rounding alone -- this checks a relative
 * tolerance generous enough to absorb Float32 precision loss at any magnitude, and treats
 * `!Number.isFinite(expected)` (the `ANNUALIZED_UNDEFINED` sentinel) as its own case, since a
 * relative-tolerance comparison against NaN or Infinity is never meaningful. */
function expectFloatMatches(actual: number, expected: number, label: string): void {
  if (!Number.isFinite(expected)) {
    expect(Number.isFinite(actual), `${label}: expected non-finite, got ${actual}`).toBe(false)
    return
  }
  const scale = Math.max(1, Math.abs(expected))
  expect(
    Math.abs(actual - expected),
    `${label}: actual=${actual} expected=${expected}`,
  ).toBeLessThan(scale * 1e-4)
}

describe('computeChunkMetrics: one pass writes all four arrays, proven against a serial reference', () => {
  const N_COLUMNS = 7
  const SERIAL_REFERENCE_SAMPLE_COUNT = 50
  // Coprime with N_COLUMNS * SWEEP_ROWS (7 * 50 = 350 = 2 x 5^2 x 7): 197 shares no factor with
  // 350, following bench/sweep.bench.test.ts's own SERIAL_REFERENCE_STRIDE precedent, so the
  // sample visits distinct rows and distinct columns rather than repeating a short cycle.
  const SERIAL_REFERENCE_STRIDE = 197

  test(
    'multiples, drawdowns, annualized and flags all match a serially recomputed reference at a ' +
      '50-cell stride sample spanning both axes (CAGR branch, contributionAmount === 0)',
    async () => {
      const bundle = await loadBundleFromDisk()
      const entryDates = pickEntryDates(bundle, N_COLUMNS, RANGE_START, RANGE_END)
      const rowIndices = Array.from({ length: SWEEP_ROWS }, (_, i) => i)
      const params = baseParams()
      const request = buildRequest(params, entryDates, rowIndices)

      const computed = computeChunkMetrics(bundle, request)

      const cellSpace = N_COLUMNS * SWEEP_ROWS
      for (let i = 0; i < SERIAL_REFERENCE_SAMPLE_COUNT; i++) {
        const cell = (i * SERIAL_REFERENCE_STRIDE) % cellSpace
        const colPos = Math.floor(cell / SWEEP_ROWS)
        const rowPos = cell % SWEEP_ROWS
        const entryDate = entryDates[colPos]!
        const row = rowIndices[rowPos]!

        const reference = computeReferenceCell(bundle, params, entryDate, row)

        expectFloatMatches(computed.multiples[cell] ?? Number.NaN, reference.multiple, `cell ${cell} multiple`)
        expectFloatMatches(computed.drawdowns[cell] ?? Number.NaN, reference.drawdown, `cell ${cell} drawdown`)
        expectFloatMatches(computed.annualized[cell] ?? Number.NaN, reference.annualized, `cell ${cell} annualized`)
        expect(computed.flags[cell], `cell ${cell} flag`).toBe(reference.flag)
      }
    },
  )
})

describe('computeChunkMetrics: the solveIrr branch (D-24, contributionAmount !== 0)', () => {
  test('annualized matches solveIrr(buildCashFlows(...)) for every cell with a monthly contribution schedule', async () => {
    const bundle = await loadBundleFromDisk()
    const entryDates = pickEntryDates(bundle, 3, RANGE_START, RANGE_END)
    const rowIndices = [0, 17, 49]
    const params = baseParams({ contributionAmount: 250, contributionFrequency: 'monthly' })
    const request = buildRequest(params, entryDates, rowIndices)

    const computed = computeChunkMetrics(bundle, request)

    for (let colPos = 0; colPos < entryDates.length; colPos++) {
      for (let rowPos = 0; rowPos < rowIndices.length; rowPos++) {
        const cell = colPos * rowIndices.length + rowPos
        const reference = computeReferenceCell(bundle, params, entryDates[colPos]!, rowIndices[rowPos]!)

        expectFloatMatches(
          computed.annualized[cell] ?? Number.NaN,
          reference.annualized,
          `cell ${cell} annualized (IRR branch)`,
        )
        expect(computed.flags[cell], `cell ${cell} flag`).toBe(reference.flag)
      }
    }
  })
})

describe('computeChunkMetrics: an undefined annualized result stores ANNUALIZED_UNDEFINED, never 0', () => {
  test('a zero initial investment makes solveCagr return null, and the cell stores a non-finite value, not 0', async () => {
    const bundle = await loadBundleFromDisk()
    const entryDate = pickEntryDates(bundle, 1, '2005-06-15', '2005-06-15')[0]!
    const rowIndices = [10]
    const params = baseParams({ initialInvestment: 0 })
    const request = buildRequest(params, [entryDate], rowIndices)

    const computed = computeChunkMetrics(bundle, request)

    expect(Number.isFinite(computed.annualized[0])).toBe(false)
    expect(computed.annualized[0]).not.toBe(0)
    expect(computed.annualized[0]).toBe(ANNUALIZED_UNDEFINED)
  })
})

describe('computeChunkMetrics: an incomplete cell (D-28) stores 0 in every metric array', () => {
  test('a fixed holding period past the last supported bar carries CELL_FLAG_INCOMPLETE and 0 in multiples, drawdowns and annualized', async () => {
    const bundle = await loadBundleFromDisk()
    const entryDate = pickEntryDates(bundle, 1, RANGE_END, RANGE_END)[0]! // 2026-08-14
    const rowIndices = [0, 25, 49]
    const requestedBars = 100_000 // unreachable from this late an entry date, mirrors column-series.test.ts's D-28 case
    const params = baseParams({ holdingPeriodBars: requestedBars })
    const request = buildRequest(params, [entryDate], rowIndices)

    const computed = computeChunkMetrics(bundle, request)

    for (let rowPos = 0; rowPos < rowIndices.length; rowPos++) {
      expect(
        (computed.flags[rowPos] ?? 0) & CELL_FLAG_INCOMPLETE,
        `row ${rowPos} incomplete flag`,
      ).toBe(CELL_FLAG_INCOMPLETE)
      expect(computed.multiples[rowPos], `row ${rowPos} multiple`).toBe(0)
      expect(computed.drawdowns[rowPos], `row ${rowPos} drawdown`).toBe(0)
      expect(computed.annualized[rowPos], `row ${rowPos} annualized`).toBe(0)
    }
  })
})

describe('METR-06 adjacency: bandIndexFor resolves an interior boundary to exactly one band', () => {
  test('a value exactly on an interior band boundary resolves to a single band index, never both and never neither', () => {
    // bandIndexFor's own upper-band tie rule (unchanged by this plan) applies identically
    // whichever metric produced the ramp position -- annualized included, now that METR-06 makes
    // annualized a real per-cell value alongside multiple-of-contributed. Proven directly here
    // against BAND_LEVELS' own interior boundary, mirroring tests/field-sampler.test.ts's
    // existing coverage of the same property.
    const boundary = BAND_LEVELS[1]!
    const resolvedIndex = bandIndexFor(boundary)
    expect(resolvedIndex).toBe(1)
    expect(Number.isInteger(resolvedIndex)).toBe(true)
  })
})
