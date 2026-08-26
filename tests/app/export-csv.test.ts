/**
 * tests/app/export-csv.test.ts
 *
 * 08-02-PLAN.md Task 1: `buildCsv`'s behaviour, run directly against the pure function in the
 * Node `unit` project (no Worker, no `postMessage` boundary -- `csv.worker.ts`'s own
 * `typeof self` guard is what makes this importable here).
 *
 * 08-02-PLAN.md Task 2: `buildPreambleLines`'s behaviour against the real committed bundle, and
 * roadmap criterion 2 itself -- a recompute driven only by the emitted CSV's columns and the
 * preamble's leverage/expense-ratio/financing-spread values reaches the kernel's real
 * `finalValue`. The recompute below deliberately parses with a bare `split('\n')`/`split(',')`,
 * never a project parsing helper, because the point is that an outsider with only the file can do
 * this.
 */

import { describe, expect, test } from 'vitest'

import { PERMALINK_KEYS } from '../../src/app/permalink.ts'
import { buildKernelInputs, type BacktestRequest } from '../../src/data/kernel-inputs.ts'
import { loadBundleFromDisk } from '../../src/data/load-bundle-node.ts'
import { CSV_COLUMNS, CSV_HEADER_LINE } from '../../src/export/csv-columns.ts'
import { buildPreambleLines } from '../../src/export/csv-preamble.ts'
import { buildCsv, type CsvBuildRequest } from '../../src/export/csv.worker.ts'
import { runBacktest } from '../../src/kernel/backtest.ts'
import { EXPENSE_DAY_COUNT_BASIS, FINANCING_DAY_COUNT_BASIS } from '../../src/kernel/backtest.types.ts'
import { fromDaysSinceEpoch } from '../../tools/bundle-compiler/src/calendar.ts'

function twoBarRequest(overrides: Partial<CsvBuildRequest> = {}): CsvBuildRequest {
  return {
    preambleLines: ['line one', 'line two'],
    dates: ['2020-01-02', '2020-01-03'],
    returns: new Float64Array([0, 0.01]),
    shortRate: new Float64Array([0.02, 0.02]),
    calendarDaysElapsed: new Int32Array([0, 1]),
    contributionFlags: new Uint8Array([0, 1]),
    contributionAmount: 500,
    outValue: new Float64Array([10_000, 10_100]),
    outLongGap: new Uint8Array([0, 0]),
    ...overrides,
  }
}

describe('CSV_COLUMNS / CSV_HEADER_LINE', () => {
  test('has exactly eight columns in D-06 order with the exact header line', () => {
    expect(CSV_COLUMNS.length).toBe(8)
    expect(CSV_HEADER_LINE).toBe(
      'date,indexReturn,shortRate,calendarDaysElapsed,contributionFlag,contributionAmount,longGapFlag,portfolioValue',
    )
  })
})

async function blobText(blob: Blob): Promise<string> {
  return blob.text()
}

describe('buildCsv', () => {
  test('a two-bar request produces preamble lines, one header line, and exactly two data lines, ending in a single newline', async () => {
    const req = twoBarRequest()
    const blob = buildCsv(req)
    const text = await blobText(blob)

    expect(text.endsWith('\n')).toBe(true)
    expect(text.endsWith('\n\n')).toBe(false)

    const lines = text.slice(0, -1).split('\n')
    expect(lines[0]).toBe('# line one')
    expect(lines[1]).toBe('# line two')
    expect(lines[2]).toBe(CSV_HEADER_LINE)
    expect(lines.length).toBe(2 + 1 + 2)
  })

  test('every data line has exactly as many comma-separated fields as CSV_COLUMNS', async () => {
    const req = twoBarRequest()
    const text = await blobText(buildCsv(req))
    const lines = text.slice(0, -1).split('\n')
    const dataLines = lines.slice(req.preambleLines.length + 1)

    expect(dataLines.length).toBe(2)
    for (const line of dataLines) {
      expect(line.split(',').length).toBe(CSV_COLUMNS.length)
    }
  })

  test('every numeric cell round-trips exactly through Number(), including a long decimal expansion', async () => {
    const oneThird = 1 / 3
    const req = twoBarRequest({
      returns: new Float64Array([0, oneThird]),
      outValue: new Float64Array([10_000, oneThird]),
    })
    const text = await blobText(buildCsv(req))
    const lines = text.slice(0, -1).split('\n')
    const dataLines = lines.slice(req.preambleLines.length + 1)
    const secondRowFields = dataLines[1]!.split(',')

    // indexReturn is field index 1, portfolioValue is field index 7 (CSV_COLUMNS order).
    expect(Number(secondRowFields[1])).toBe(oneThird)
    expect(Number(secondRowFields[7])).toBe(oneThird)
  })

  test('the contribution amount cell is the scalar amount on a flagged bar and exactly 0 otherwise', async () => {
    const req = twoBarRequest({ contributionFlags: new Uint8Array([0, 1]), contributionAmount: 500 })
    const text = await blobText(buildCsv(req))
    const lines = text.slice(0, -1).split('\n')
    const dataLines = lines.slice(req.preambleLines.length + 1)

    // contributionAmount is field index 5.
    expect(dataLines[0]!.split(',')[5]).toBe('0')
    expect(dataLines[1]!.split(',')[5]).toBe('500')
  })

  test('mutates none of its input arrays', () => {
    const req = twoBarRequest()
    const returnsBefore = req.returns.slice()
    const outValueBefore = req.outValue.slice()

    buildCsv(req)

    expect(req.returns).toEqual(returnsBefore)
    expect(req.outValue).toEqual(outValueBefore)
  })

  test('every non-date data cell is a pure finite-number token, never free text a spreadsheet could evaluate as a formula (T-08-06)', async () => {
    // A legitimate negative daily return: "-0.01" DOES begin with "-", and that is fine -- a
    // spreadsheet only treats a leading "=/+/-/@" as a formula trigger when the rest of the cell
    // is NOT a valid number. The actual mitigation this test proves is that every one of these
    // cells is `String(number)` output, which can only ever produce a clean numeric literal,
    // never attacker-controlled free text.
    const req = twoBarRequest({
      returns: new Float64Array([0, -0.01]),
      outValue: new Float64Array([10_000, 9_999.5]),
    })
    const text = await blobText(buildCsv(req))
    const lines = text.slice(0, -1).split('\n')
    const dataLines = lines.slice(req.preambleLines.length + 1)

    for (const line of dataLines) {
      const fields = line.split(',')
      // Field 0 (date) is checked separately below; every other field must be a finite number.
      for (let i = 1; i < fields.length; i++) {
        expect(Number.isFinite(Number(fields[i]))).toBe(true)
      }
      expect(fields[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  test('a single-bar request produces exactly one data row', async () => {
    const req = twoBarRequest({
      dates: ['2020-01-02'],
      returns: new Float64Array([0]),
      shortRate: new Float64Array([0.02]),
      calendarDaysElapsed: new Int32Array([0]),
      contributionFlags: new Uint8Array([0]),
      outValue: new Float64Array([10_000]),
      outLongGap: new Uint8Array([0]),
    })
    const text = await blobText(buildCsv(req))
    const lines = text.slice(0, -1).split('\n')
    const dataLines = lines.slice(req.preambleLines.length + 1)

    expect(dataLines.length).toBe(1)
  })
})

// -----------------------------------------------------------------------------------------------
// 08-02-PLAN.md Task 2: buildPreambleLines, against the real committed bundle.
// -----------------------------------------------------------------------------------------------

function csvTestRequest(overrides: Partial<BacktestRequest> = {}): BacktestRequest {
  return {
    symbol: 'SPX',
    dividendReinvest: true,
    leverage: 2,
    entryDate: '1990-01-02',
    holdingPeriodBars: 300,
    initialInvestment: 10_000,
    contributionAmount: 0,
    contributionFrequency: 'none',
    expenseRatioPercent: 0.9,
    financingSpreadPercent: 0.5,
    ...overrides,
  }
}

const TEST_PERMALINK_URL = 'https://example.test/?symbol=SPX'

describe('buildPreambleLines', () => {
  test('the named permalink-key set equals PERMALINK_KEYS minus holdingPeriodBars for an end-of-data run', async () => {
    const bundle = await loadBundleFromDisk()
    const request = csvTestRequest({ holdingPeriodBars: null })
    const inputs = buildKernelInputs(bundle, request)
    const lines = buildPreambleLines(inputs, request, 'strict', 'log', 'single', 'multiple', TEST_PERMALINK_URL, bundle.manifest)

    const namedKeys = lines
      .filter((line) => PERMALINK_KEYS.some((key) => line.startsWith(`${key}: `)))
      .map((line) => line.split(':')[0])
    const expectedKeys = PERMALINK_KEYS.filter((key) => key !== 'holdingPeriodBars')

    expect(namedKeys.length).toBe(16)
    expect([...namedKeys].sort()).toEqual([...expectedKeys].sort())
  })

  test('the named permalink-key set equals all seventeen PERMALINK_KEYS for a fixed-period run', async () => {
    const bundle = await loadBundleFromDisk()
    const request = csvTestRequest({ holdingPeriodBars: 300 })
    const inputs = buildKernelInputs(bundle, request)
    const lines = buildPreambleLines(inputs, request, 'strict', 'log', 'single', 'multiple', TEST_PERMALINK_URL, bundle.manifest)

    const namedKeys = lines
      .filter((line) => PERMALINK_KEYS.some((key) => line.startsWith(`${key}: `)))
      .map((line) => line.split(':')[0])

    expect(namedKeys.length).toBe(17)
    expect([...namedKeys].sort()).toEqual([...PERMALINK_KEYS].sort())
  })

  test('names the permalink URL, the bundle version, the tier, the effective date range and the source names', async () => {
    const bundle = await loadBundleFromDisk()
    const request = csvTestRequest()
    const inputs = buildKernelInputs(bundle, request)
    const lines = buildPreambleLines(inputs, request, 'strict', 'log', 'single', 'multiple', TEST_PERMALINK_URL, bundle.manifest)

    expect(lines).toContain(`permalink: ${TEST_PERMALINK_URL}`)
    expect(lines).toContain(`bundleVersion: ${inputs.meta.bundleVersion}`)
    expect(lines).toContain('tier: strict')
    expect(lines.some((line) => line.startsWith('Data: '))).toBe(true)
    expect(lines.some((line) => line.startsWith('Sources: '))).toBe(true)
  })
})

describe('the preamble once passed through buildCsv (D-07)', () => {
  test('every preamble line begins with a hash character, and one line names both Excel and Google Sheets', async () => {
    const bundle = await loadBundleFromDisk()
    const request = csvTestRequest()
    const inputs = buildKernelInputs(bundle, request)
    const preambleLines = buildPreambleLines(inputs, request, 'strict', 'log', 'single', 'multiple', TEST_PERMALINK_URL, bundle.manifest)

    const blob = buildCsv({
      preambleLines,
      dates: ['2020-01-02'],
      returns: new Float64Array([0]),
      shortRate: new Float64Array([0]),
      calendarDaysElapsed: new Int32Array([0]),
      contributionFlags: new Uint8Array([0]),
      contributionAmount: 0,
      outValue: new Float64Array([10_000]),
      outLongGap: new Uint8Array([0]),
    })
    const text = await blobText(blob)
    const emittedLines = text.slice(0, -1).split('\n')
    const emittedPreamble = emittedLines.slice(0, preambleLines.length)

    expect(emittedPreamble.length).toBe(preambleLines.length)
    for (const line of emittedPreamble) {
      expect(line.startsWith('#')).toBe(true)
    }
    expect(emittedPreamble.some((line) => line.includes('Excel') && line.includes('Google Sheets'))).toBe(true)
  })
})

// -----------------------------------------------------------------------------------------------
// 08-02-PLAN.md Task 2: roadmap criterion 2 -- a recompute driven only by the emitted file reaches
// the kernel's real finalValue.
// -----------------------------------------------------------------------------------------------

describe('recompute from the emitted CSV (roadmap criterion 2)', () => {
  test('a recompute driven only by the CSV columns and the preamble leverage/expense/financing values reaches finalValue to within 1e-9 relative', async () => {
    const bundle = await loadBundleFromDisk()
    const request = csvTestRequest()
    const inputs = buildKernelInputs(bundle, request)
    const result = runBacktest(inputs.params, inputs.series, inputs.outputs)

    const dates: string[] = []
    for (let i = 0; i < inputs.window.barCount; i++) {
      dates.push(fromDaysSinceEpoch(bundle.calendar[inputs.window.entryIndex + i] ?? 0))
    }

    const preambleLines = buildPreambleLines(inputs, request, 'strict', 'log', 'single', 'multiple', TEST_PERMALINK_URL, bundle.manifest)
    const blob = buildCsv({
      preambleLines,
      dates,
      returns: inputs.series.returns,
      shortRate: inputs.series.shortRate,
      calendarDaysElapsed: inputs.series.calendarDaysElapsed,
      contributionFlags: inputs.series.contributionFlags,
      contributionAmount: inputs.params.contributionAmount,
      outValue: inputs.outputs.outValue,
      outLongGap: inputs.outputs.outLongGap,
    })
    const text = await blobText(blob)

    // Deliberately a bare split, no project parsing helper -- the whole point is that an outsider
    // with only the file can do this.
    const allLines = text.slice(0, -1).split('\n')
    const dataLines = allLines.slice(preambleLines.length + 1)
    expect(dataLines.length).toBe(inputs.window.barCount)

    let leverage: number | null = null
    let expenseRatioPercent: number | null = null
    let financingSpreadPercent: number | null = null
    for (const line of preambleLines) {
      if (line.startsWith('leverage: ')) leverage = Number(line.slice('leverage: '.length))
      if (line.startsWith('expenseRatioPercent: ')) expenseRatioPercent = Number(line.slice('expenseRatioPercent: '.length))
      if (line.startsWith('financingSpreadPercent: ')) financingSpreadPercent = Number(line.slice('financingSpreadPercent: '.length))
    }
    expect(leverage).not.toBeNull()
    expect(expenseRatioPercent).not.toBeNull()
    expect(financingSpreadPercent).not.toBeNull()

    const expenseRatio = expenseRatioPercent! / 100
    const financingSpread = financingSpreadPercent! / 100

    let value = request.initialInvestment
    for (let i = 1; i < dataLines.length; i++) {
      const fields = dataLines[i]!.split(',')
      const indexReturn = Number(fields[1])
      const shortRate = Number(fields[2])
      const calendarDaysElapsed = Number(fields[3])
      const contributionFlag = Number(fields[4])
      const contributionAmount = Number(fields[5])

      value = value * (1 + leverage! * indexReturn)
      const financingCost = value * (leverage! - 1) * (shortRate + financingSpread) * (calendarDaysElapsed / FINANCING_DAY_COUNT_BASIS)
      value -= financingCost
      const expenseCost = value * expenseRatio * (calendarDaysElapsed / EXPENSE_DAY_COUNT_BASIS)
      value -= expenseCost

      if (value <= 0) {
        value = 0
      } else if (contributionFlag === 1) {
        value += contributionAmount
      }
    }

    expect(Math.abs(value - result.finalValue) / result.finalValue).toBeLessThan(1e-9)
  })

  test('a single-bar run (holdingPeriodBars: 0) emits exactly one data row whose portfolio value equals the initial investment (D-03)', async () => {
    const bundle = await loadBundleFromDisk()
    const request = csvTestRequest({ holdingPeriodBars: 0 })
    const inputs = buildKernelInputs(bundle, request)
    const result = runBacktest(inputs.params, inputs.series, inputs.outputs)
    expect(inputs.window.barCount).toBe(1)
    expect(result.finalValue).toBe(request.initialInvestment)

    const dates = [fromDaysSinceEpoch(bundle.calendar[inputs.window.entryIndex] ?? 0)]
    const preambleLines = buildPreambleLines(inputs, request, 'strict', 'log', 'single', 'multiple', TEST_PERMALINK_URL, bundle.manifest)
    const blob = buildCsv({
      preambleLines,
      dates,
      returns: inputs.series.returns,
      shortRate: inputs.series.shortRate,
      calendarDaysElapsed: inputs.series.calendarDaysElapsed,
      contributionFlags: inputs.series.contributionFlags,
      contributionAmount: inputs.params.contributionAmount,
      outValue: inputs.outputs.outValue,
      outLongGap: inputs.outputs.outLongGap,
    })
    const text = await blobText(blob)
    const allLines = text.slice(0, -1).split('\n')
    const dataLines = allLines.slice(preambleLines.length + 1)

    expect(dataLines.length).toBe(1)
    const portfolioValue = Number(dataLines[0]!.split(',')[7])
    expect(portfolioValue).toBe(request.initialInvestment)
  })
})
