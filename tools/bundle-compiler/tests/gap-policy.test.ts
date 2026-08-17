/**
 * tools/bundle-compiler/tests/gap-policy.test.ts
 *
 * Task 1 proof: extra bars and interior gaps are classified and either filled or refused per
 * D-09/D-10/D-11, `loadCalendarExceptions` validates the override file, and the CLI end to end
 * refuses an interior price gap and accepts it once a matching exception is authored.
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

import { fromDaysSinceEpoch, toDaysSinceEpoch, type ReferenceCalendar } from '../src/calendar.ts'
import {
  applyGapPolicy,
  loadCalendarExceptions,
  RATE_CARRY_FORWARD_LIMIT_DAYS,
  STALENESS_WARN_DAYS,
  type CalendarException,
} from '../src/gap-policy.ts'
import type { RawSeries, SidecarMeta } from '../src/raw-input.ts'
import { SeamCollector } from '../src/seams.ts'
import { makeRawFixture } from './fixtures/make-fixture.ts'

const CLI_PATH = fileURLToPath(new URL('../src/cli.ts', import.meta.url))

function consecutiveDates(count: number, startIso: string): string[] {
  const start = toDaysSinceEpoch(startIso)
  const result: string[] = []
  for (let i = 0; i < count; i++) result.push(fromDaysSinceEpoch(start + i))
  return result
}

function makeCalendar(dates: string[]): ReferenceCalendar {
  return { days: Int32Array.from(dates.map(toDaysSinceEpoch)) }
}

function makeSeries(
  scope: string,
  seriesKind: SidecarMeta['seriesKind'],
  dates: string[],
  values: number[],
  units: SidecarMeta['units'] = 'index-level',
): RawSeries {
  const meta: SidecarMeta = {
    source: 'Test',
    url: 'https://example.test/fixture',
    retrievedAt: '2026-01-01',
    seriesKind,
    license: 'Public Domain',
    termsUrl: 'https://example.test/terms',
    scope,
    units,
  }
  return { scope, meta, dates, values }
}

describe('applyGapPolicy: extra bars (D-10)', () => {
  test('a bar on a date the reference calendar does not contain throws naming that date', () => {
    const allDates = consecutiveDates(10, '2024-03-01')
    const calendarDates = allDates.filter((_, i) => i !== 4) // calendar has a natural hole at index 4
    const calendar = makeCalendar(calendarDates)
    const series = makeSeries('BBB', 'rate', allDates, allDates.map((_, i) => 100 + i), 'percent-annualized')

    expect(() => applyGapPolicy(series, calendar, [], new SeamCollector(), allDates[allDates.length - 1]!)).toThrow(
      new RegExp(allDates[4]!.replace(/[-]/g, '\\-')),
    )
  })

  test('does not extend the calendar', () => {
    const allDates = consecutiveDates(10, '2024-03-01')
    const calendarDates = allDates.filter((_, i) => i !== 4)
    const calendar = makeCalendar(calendarDates)
    const series = makeSeries('BBB', 'rate', allDates, allDates.map((_, i) => 100 + i), 'percent-annualized')

    let thrown: Error | undefined
    try {
      applyGapPolicy(series, calendar, [], new SeamCollector(), allDates[allDates.length - 1]!)
    } catch (err) {
      thrown = err as Error
    }
    expect(thrown).toBeDefined()
    expect(calendar.days.length).toBe(calendarDates.length)
  })

  test('an exception naming the exact scope and date drops the bar and compiles', () => {
    const allDates = consecutiveDates(10, '2024-03-01')
    const calendarDates = allDates.filter((_, i) => i !== 4)
    const calendar = makeCalendar(calendarDates)
    const series = makeSeries('BBB', 'rate', allDates, allDates.map((_, i) => 100 + i), 'percent-annualized')
    const exceptions: CalendarException[] = [{ scope: 'BBB', date: allDates[4]!, reason: 'test override' }]

    const result = applyGapPolicy(series, calendar, exceptions, new SeamCollector(), allDates[allDates.length - 1]!)
    expect(result.values.length).toBe(calendarDates.length)
  })

  test('an exception naming the same date but a different scope does not suppress the abort', () => {
    const allDates = consecutiveDates(10, '2024-03-01')
    const calendarDates = allDates.filter((_, i) => i !== 4)
    const calendar = makeCalendar(calendarDates)
    const series = makeSeries('BBB', 'rate', allDates, allDates.map((_, i) => 100 + i), 'percent-annualized')
    const exceptions: CalendarException[] = [{ scope: 'ZZZ', date: allDates[4]!, reason: 'wrong scope' }]

    expect(() => applyGapPolicy(series, calendar, exceptions, new SeamCollector(), allDates[allDates.length - 1]!)).toThrow(
      new RegExp(allDates[4]!.replace(/[-]/g, '\\-')),
    )
  })
})

describe('applyGapPolicy: interior price gaps (D-09)', () => {
  test('missing one interior calendar date throws with that date in the message', () => {
    const dates = consecutiveDates(10, '2024-04-01')
    const gapped = dates.filter((_, i) => i !== 5)
    const calendar = makeCalendar(dates)
    const series = makeSeries('AAA', 'price', gapped, gapped.map((_, i) => 100 + i))

    expect(() => applyGapPolicy(series, calendar, [], new SeamCollector(), dates[dates.length - 1]!)).toThrow(
      new RegExp(dates[5]!.replace(/[-]/g, '\\-')),
    )
  })

  test('missing three interior calendar dates throws once, naming all three', () => {
    const dates = consecutiveDates(10, '2024-04-01')
    const gapped = dates.filter((_, i) => i !== 2 && i !== 5 && i !== 7)
    const calendar = makeCalendar(dates)
    const series = makeSeries('AAA', 'price', gapped, gapped.map((_, i) => 100 + i))

    let thrown: Error | undefined
    try {
      applyGapPolicy(series, calendar, [], new SeamCollector(), dates[dates.length - 1]!)
    } catch (err) {
      thrown = err as Error
    }
    expect(thrown).toBeDefined()
    expect(thrown!.message).toContain(dates[2]!)
    expect(thrown!.message).toContain(dates[5]!)
    expect(thrown!.message).toContain(dates[7]!)
  })

  test('an exception naming the exact gap date compiles, filling it via carry-forward and recording one seam', () => {
    const dates = consecutiveDates(10, '2024-04-01')
    const gapped = dates.filter((_, i) => i !== 5)
    const calendar = makeCalendar(dates)
    const values = gapped.map((_, i) => 100 + i)
    const series = makeSeries('AAA', 'price', gapped, values)
    const exceptions: CalendarException[] = [{ scope: 'AAA', date: dates[5]!, reason: 'vendor quirk' }]
    const seams = new SeamCollector()

    const result = applyGapPolicy(series, calendar, exceptions, seams, dates[dates.length - 1]!)
    expect(result.values.length).toBe(dates.length)
    // The filled slot repeats the previous observation's value exactly.
    expect(result.values[5]).toBe(values[4])
    const records = seams.records()
    expect(records.length).toBe(1)
    expect(records[0]!.kind).toBe('carry-forward')
    expect(records[0]!.firstDate).toBe(dates[5])
    expect(records[0]!.lastDate).toBe(dates[5])
  })
})

describe('applyGapPolicy: rate carry-forward limit (D-09)', () => {
  test('a gap whose adjacent-observation difference is 3 carries the previous value with exactly one seam', () => {
    // Calendar has a natural single-day hole at index 5 (day '2024-05-06'); the rate series is
    // additionally missing the very next calendar entry (index 6, '2024-05-07'). Prev present
    // observation is index 4, next is index 7: a 3-day difference from one missing calendar entry.
    const allDates = consecutiveDates(16, '2024-05-01')
    const calendarDates = allDates.filter((_, i) => i !== 5)
    const calendar = makeCalendar(calendarDates)
    const rateDates = calendarDates.filter((d) => d !== allDates[6])
    const rateValues = rateDates.map((_, i) => 1 + i * 0.01)
    const series = makeSeries('RRR', 'rate', rateDates, rateValues, 'percent-annualized')
    const seams = new SeamCollector()

    const result = applyGapPolicy(series, calendar, [], seams, rateDates[rateDates.length - 1]!)
    const missingIndex = calendarDates.indexOf(allDates[6]!)
    expect(result.values[missingIndex]).toBe(result.values[missingIndex - 1])
    const records = seams.records()
    expect(records.length).toBe(1)
    expect(records[0]!.kind).toBe('carry-forward')
    expect(records[0]!.firstDate).toBe(allDates[6])
    expect(records[0]!.lastDate).toBe(allDates[6])
  })

  test(`a gap whose adjacent-observation difference is exactly RATE_CARRY_FORWARD_LIMIT_DAYS (${RATE_CARRY_FORWARD_LIMIT_DAYS}) carries and seams`, () => {
    // Calendar has a natural two-day hole at indices 5,6; the rate series is additionally missing
    // the entry right after the hole (index 7). Prev=index4, next=index8: a 4-day difference.
    const allDates = consecutiveDates(16, '2024-06-01')
    const calendarDates = allDates.filter((_, i) => i !== 5 && i !== 6)
    const calendar = makeCalendar(calendarDates)
    const rateDates = calendarDates.filter((d) => d !== allDates[7])
    const rateValues = rateDates.map((_, i) => 1 + i * 0.01)
    const series = makeSeries('RRR', 'rate', rateDates, rateValues, 'percent-annualized')
    const seams = new SeamCollector()

    const result = applyGapPolicy(series, calendar, [], seams, rateDates[rateDates.length - 1]!)
    expect(result.values.length).toBe(calendarDates.length)
    expect(seams.records().length).toBe(1)
  })

  test(`a gap whose adjacent-observation difference is RATE_CARRY_FORWARD_LIMIT_DAYS + 1 (${RATE_CARRY_FORWARD_LIMIT_DAYS + 1}) throws naming the dates`, () => {
    // Same natural two-day hole; the rate series is additionally missing the two entries right
    // after the hole (indices 7,8). Prev=index4, next=index9: a 5-day difference.
    const allDates = consecutiveDates(16, '2024-07-01')
    const calendarDates = allDates.filter((_, i) => i !== 5 && i !== 6)
    const calendar = makeCalendar(calendarDates)
    const rateDates = calendarDates.filter((d) => d !== allDates[7] && d !== allDates[8])
    const rateValues = rateDates.map((_, i) => 1 + i * 0.01)
    const series = makeSeries('RRR', 'rate', rateDates, rateValues, 'percent-annualized')

    let thrown: Error | undefined
    try {
      applyGapPolicy(series, calendar, [], new SeamCollector(), rateDates[rateDates.length - 1]!)
    } catch (err) {
      thrown = err as Error
    }
    expect(thrown).toBeDefined()
    expect(thrown!.message).toContain(allDates[7]!)
    expect(thrown!.message).toContain(allDates[8]!)
  })

  test('a series carrying a date absent from the reference calendar throws naming that date, not extending the calendar', () => {
    const dates = consecutiveDates(10, '2024-08-01')
    const calendarDates = dates.filter((_, i) => i !== 3)
    const calendar = makeCalendar(calendarDates)
    const series = makeSeries('RRR', 'rate', dates, dates.map((_, i) => 1 + i * 0.01), 'percent-annualized')

    expect(() => applyGapPolicy(series, calendar, [], new SeamCollector(), dates[dates.length - 1]!)).toThrow(
      new RegExp(dates[3]!.replace(/[-]/g, '\\-')),
    )
    expect(calendar.days.length).toBe(calendarDates.length)
  })
})

describe('loadCalendarExceptions', () => {
  function makeTempRawDir(): string {
    return mkdtempSync(path.join(tmpdir(), 'gap-policy-exceptions-'))
  }

  test('returns an empty list when the file does not exist', () => {
    const dir = makeTempRawDir()
    try {
      expect(loadCalendarExceptions(dir)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('returns the parsed entries when the file is valid', () => {
    const dir = makeTempRawDir()
    try {
      writeFileSync(
        path.join(dir, 'calendar-exceptions.json'),
        JSON.stringify([{ scope: 'AAA', date: '2020-01-01', reason: 'test' }]),
      )
      expect(loadCalendarExceptions(dir)).toEqual([{ scope: 'AAA', date: '2020-01-01', reason: 'test' }])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('throws naming the entry index when reason is empty or whitespace', () => {
    const dir = makeTempRawDir()
    try {
      writeFileSync(
        path.join(dir, 'calendar-exceptions.json'),
        JSON.stringify([{ scope: 'AAA', date: '2020-01-01', reason: '   ' }]),
      )
      expect(() => loadCalendarExceptions(dir)).toThrow(/entry 0/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('throws naming the entry index when date is not YYYY-MM-DD', () => {
    const dir = makeTempRawDir()
    try {
      writeFileSync(
        path.join(dir, 'calendar-exceptions.json'),
        JSON.stringify([{ scope: 'AAA', date: '01/01/2020', reason: 'test' }]),
      )
      expect(() => loadCalendarExceptions(dir)).toThrow(/entry 0/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('throws naming the entry index when an entry carries an unknown key', () => {
    const dir = makeTempRawDir()
    try {
      writeFileSync(
        path.join(dir, 'calendar-exceptions.json'),
        JSON.stringify([{ scope: 'AAA', date: '2020-01-01', reason: 'test', wildcard: '*' }]),
      )
      expect(() => loadCalendarExceptions(dir)).toThrow(/entry 0/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('CLI end to end (acceptance criteria)', () => {
  function runCli(rawDir: string, outDir: string): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync('node', ['--experimental-strip-types', CLI_PATH, path.relative(tmpdir(), rawDir), path.relative(tmpdir(), outDir)], {
      cwd: tmpdir(),
      encoding: 'utf8',
    })
    return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
  }

  test('exits non-zero on an interior price gap, naming the date; exits 0 once an exception names it', () => {
    const dates = consecutiveDates(10, '2024-09-01')
    const gapped = dates.filter((_, i) => i !== 4)
    const fixture = makeRawFixture({
      series: [
        { scope: 'AAA', seriesKind: 'price', units: 'index-level', dates },
        { scope: 'BBB', seriesKind: 'price', units: 'index-level', dates: gapped },
      ],
    })
    const outDir1 = mkdtempSync(path.join(tmpdir(), 'gap-policy-cli-out-'))
    const outDir2 = mkdtempSync(path.join(tmpdir(), 'gap-policy-cli-out-'))
    try {
      const before = runCli(fixture.dir, outDir1)
      expect(before.status).not.toBe(0)
      expect(before.stderr).toContain(dates[4]!)

      writeFileSync(
        path.join(fixture.dir, 'calendar-exceptions.json'),
        JSON.stringify([{ scope: 'BBB', date: dates[4]!, reason: 'test-fixture override' }]),
      )
      const after = runCli(fixture.dir, outDir2)
      expect(after.status).toBe(0)
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true })
      rmSync(outDir1, { recursive: true, force: true })
      rmSync(outDir2, { recursive: true, force: true })
    }
  })
})

describe('constants', () => {
  test('RATE_CARRY_FORWARD_LIMIT_DAYS is 4', () => {
    expect(RATE_CARRY_FORWARD_LIMIT_DAYS).toBe(4)
  })

  test('STALENESS_WARN_DAYS is 10', () => {
    expect(STALENESS_WARN_DAYS).toBe(10)
  })
})
