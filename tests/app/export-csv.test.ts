/**
 * tests/app/export-csv.test.ts
 *
 * 08-02-PLAN.md Task 1: `buildCsv`'s behaviour, run directly against the pure function in the
 * Node `unit` project (no Worker, no `postMessage` boundary -- `csv.worker.ts`'s own
 * `typeof self` guard is what makes this importable here).
 */

import { describe, expect, test } from 'vitest'

import { CSV_COLUMNS, CSV_HEADER_LINE } from '../../src/export/csv-columns.ts'
import { buildCsv, type CsvBuildRequest } from '../../src/export/csv.worker.ts'

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
