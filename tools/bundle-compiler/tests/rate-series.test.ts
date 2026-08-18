/**
 * tools/bundle-compiler/tests/rate-series.test.ts
 *
 * Task 1 proof: RATE_SOURCE_PRECEDENCE splices the four rate sources in precedence order with
 * every boundary read from the data, monthly windows interpolate to daily, and every splice /
 * interpolation / carry-forward is recorded as a typed seam carrying `degradesToNonDaily`.
 */

import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import { fromDaysSinceEpoch, toDaysSinceEpoch, type ReferenceCalendar } from '../src/calendar.ts'
import { RATE_CARRY_FORWARD_LIMIT_DAYS } from '../src/gap-policy.ts'
import { buildShortRateSeries, interpolateMonthlyToDaily, RATE_SOURCE_PRECEDENCE } from '../src/rate-series.ts'
import type { RawSeries, SidecarMeta } from '../src/raw-input.ts'
import { SeamCollector } from '../src/seams.ts'

function makeBusinessDays(startIso: string, endIso: string): string[] {
  const start = toDaysSinceEpoch(startIso)
  const end = toDaysSinceEpoch(endIso)
  const dates: string[] = []
  for (let d = start; d <= end; d++) {
    const iso = fromDaysSinceEpoch(d)
    const dow = new Date(d * 86_400_000).getUTCDay()
    if (dow !== 0 && dow !== 6) dates.push(iso)
  }
  return dates
}

function makeMonthlyDates(startIso: string, endIso: string): string[] {
  const dates: string[] = []
  const [sy, sm] = startIso.split('-').map(Number) as [number, number]
  const [ey, em] = endIso.split('-').map(Number) as [number, number]
  let y = sy
  let m = sm
  while (y < ey || (y === ey && m <= em)) {
    dates.push(`${y}-${String(m).padStart(2, '0')}-01`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return dates
}

function makeRateSeries(rawStem: string, dates: string[], values: number[]): RawSeries {
  const meta: SidecarMeta = {
    source: 'Test',
    url: 'https://example.test/rate',
    retrievedAt: '2026-01-01',
    seriesKind: 'rate',
    license: 'Public Domain',
    termsUrl: 'https://example.test/terms',
    scope: 'RATE',
    units: 'percent-annualized',
  }
  return { scope: 'RATE', rawStem, meta, dates, values }
}

const CALENDAR_DATES = makeBusinessDays('1980-01-01', '2000-02-05')
const CALENDAR: ReferenceCalendar = { days: Int32Array.from(CALENDAR_DATES.map(toDaysSinceEpoch)) }

// Rank 4 (deepest history, monthly): 1985-01-01 through 1990-03-01. Overlaps rank 3 by exactly
// three months (Jan, Feb, Mar 1990), the RESEARCH.md Pitfall 4 case.
const NBER_DATES = makeMonthlyDates('1985-01-01', '1990-03-01')
const NBER_VALUES = NBER_DATES.map((_, i) => 4 + i * 0.01)

// Rank 3 (monthly): 1990-01-01 through 1999-01-01.
const TB3MS_DATES = makeMonthlyDates('1990-01-01', '1999-01-01')
const TB3MS_VALUES = TB3MS_DATES.map((_, i) => 3 + i * 0.02)

// Rank 2 (daily): 1999-01-04 through 2000-01-02, with a deliberate one-business-day gap
// (1999-06-15 dropped) to exercise the within-source carry-forward path.
const DTB3_ALL_DATES = makeBusinessDays('1999-01-04', '2000-01-02')
const DTB3_DATES = DTB3_ALL_DATES.filter((d) => d !== '1999-06-15')
const DTB3_VALUES = DTB3_DATES.map((_, i) => 5 + i * 0.001)

// Rank 1 (daily, most current): 2000-01-03 through 2000-01-31.
const DFF_DATES = makeBusinessDays('2000-01-03', '2000-01-31')
const DFF_VALUES = DFF_DATES.map((_, i) => 6 + i * 0.001)

function makeFourSources(): RawSeries[] {
  return [
    makeRateSeries('RATE-DFF', DFF_DATES, DFF_VALUES),
    makeRateSeries('RATE-DTB3', DTB3_DATES, DTB3_VALUES),
    makeRateSeries('RATE-TB3MS', TB3MS_DATES, TB3MS_VALUES),
    makeRateSeries('RATE-NBER', NBER_DATES, NBER_VALUES),
  ]
}

describe('RATE_SOURCE_PRECEDENCE', () => {
  test('is DFF, DTB3, TB3MS, NBER, highest precedence first', () => {
    expect(RATE_SOURCE_PRECEDENCE).toEqual(['RATE-DFF', 'RATE-DTB3', 'RATE-TB3MS', 'RATE-NBER'])
  })
})

describe('buildShortRateSeries: precedence and coverage', () => {
  test('returns one value per calendar date from the earliest used date to the newest used date', () => {
    const seams = new SeamCollector()
    const result = buildShortRateSeries(makeFourSources(), CALENDAR, seams)

    const expectedFirstIdx = CALENDAR_DATES.findIndex((d) => d >= NBER_DATES[0]!)
    expect(result.calendarStartIndex).toBe(expectedFirstIdx)

    const lastCoveredDate = DFF_DATES[DFF_DATES.length - 1]!
    const expectedLastIdx = [...CALENDAR_DATES].map((d, i) => (d <= lastCoveredDate ? i : -1)).filter((i) => i >= 0).pop()!
    expect(result.calendarStartIndex + result.values.length - 1).toBe(expectedLastIdx)
  })

  test('every value on and after RATE-DFF\'s own first date comes from RATE-DFF', () => {
    const seams = new SeamCollector()
    const result = buildShortRateSeries(makeFourSources(), CALENDAR, seams)
    const dffFirstIdx = CALENDAR_DATES.indexOf(DFF_DATES[0]!)
    const outStart = result.calendarStartIndex
    for (let i = dffFirstIdx; i < CALENDAR_DATES.length && CALENDAR_DATES[i]! <= DFF_DATES[DFF_DATES.length - 1]!; i++) {
      const date = CALENDAR_DATES[i]!
      const dffIdx = DFF_DATES.indexOf(date)
      expect(dffIdx).toBeGreaterThanOrEqual(0)
      expect(result.values[i - outStart]).toBe(DFF_VALUES[dffIdx])
    }
  })

  test('every value between RATE-DTB3\'s first date and RATE-DFF\'s first date comes from RATE-DTB3', () => {
    const seams = new SeamCollector()
    const result = buildShortRateSeries(makeFourSources(), CALENDAR, seams)
    const outStart = result.calendarStartIndex
    const dtb3FirstIdx = CALENDAR_DATES.indexOf(DTB3_DATES[0]!)
    const dffFirstIdx = CALENDAR_DATES.indexOf(DFF_DATES[0]!)
    for (let i = dtb3FirstIdx; i < dffFirstIdx; i++) {
      const date = CALENDAR_DATES[i]!
      if (date === '1999-06-15') continue // the deliberate carry-forward gap, checked separately
      const dtb3Idx = DTB3_DATES.indexOf(date)
      expect(dtb3Idx).toBeGreaterThanOrEqual(0)
      expect(result.values[i - outStart]).toBe(DTB3_VALUES[dtb3Idx])
    }
  })

  test('the deliberate one-day RATE-DTB3 gap carries the previous value forward with one seam', () => {
    const seams = new SeamCollector()
    const result = buildShortRateSeries(makeFourSources(), CALENDAR, seams)
    const outStart = result.calendarStartIndex
    const gapIdx = CALENDAR_DATES.indexOf('1999-06-15')
    const prevIdx = CALENDAR_DATES.indexOf('1999-06-14')
    expect(result.values[gapIdx - outStart]).toBe(result.values[prevIdx - outStart])

    const carryForwardSeams = seams.records().filter((r) => r.kind === 'carry-forward')
    expect(carryForwardSeams.length).toBe(1)
    expect(carryForwardSeams[0]!.firstDate).toBe('1999-06-15')
    expect(carryForwardSeams[0]!.lastDate).toBe('1999-06-15')
    expect(carryForwardSeams[0]!.degradesToNonDaily).toBe(false)
  })

  test('every value in the RATE-TB3MS/RATE-NBER three-month overlap window equals the RATE-TB3MS fixture value, with one splice seam bounding the hand-off', () => {
    const seams = new SeamCollector()
    const result = buildShortRateSeries(makeFourSources(), CALENDAR, seams)
    const outStart = result.calendarStartIndex

    for (const date of ['1990-01-02', '1990-02-01', '1990-03-01']) {
      const idx = CALENDAR_DATES.indexOf(date)
      const expected = interpolateMonthlyToDaily(
        TB3MS_DATES.map((d, i) => ({ date: d, value: TB3MS_VALUES[i]! })),
        CALENDAR,
        idx,
        idx,
      )[0]!
      expect(result.values[idx - outStart]).toBe(expected)
    }

    const spliceSeams = seams.records().filter((r) => r.kind === 'splice' && r.sourceBefore === 'RATE-NBER')
    expect(spliceSeams.length).toBe(1)
    expect(spliceSeams[0]!.sourceAfter).toBe('RATE-TB3MS')
    expect(spliceSeams[0]!.lastDate).toBe('1989-12-31')
    expect(spliceSeams[0]!.degradesToNonDaily).toBe(true)
  })

  test('exactly three splice seams total (NBER->TB3MS, TB3MS->DTB3, DTB3->DFF), each with a distinct hand-off', () => {
    const seams = new SeamCollector()
    buildShortRateSeries(makeFourSources(), CALENDAR, seams)
    const spliceSeams = seams.records().filter((r) => r.kind === 'splice')
    expect(spliceSeams.length).toBe(3)
    const pairs = spliceSeams.map((s) => `${s.sourceBefore}->${s.sourceAfter}`).sort()
    expect(pairs).toEqual(['RATE-DTB3->RATE-DFF', 'RATE-NBER->RATE-TB3MS', 'RATE-TB3MS->RATE-DTB3'])
  })

  test('the DTB3->DFF splice (both daily) has degradesToNonDaily false', () => {
    const seams = new SeamCollector()
    buildShortRateSeries(makeFourSources(), CALENDAR, seams)
    const splice = seams.records().find((r) => r.kind === 'splice' && r.sourceBefore === 'RATE-DTB3')!
    expect(splice.degradesToNonDaily).toBe(false)
  })

  test('every interpolation seam has degradesToNonDaily true and every carry-forward seam has it false', () => {
    const seams = new SeamCollector()
    buildShortRateSeries(makeFourSources(), CALENDAR, seams)
    const records = seams.records()
    const interpolations = records.filter((r) => r.kind === 'interpolation')
    expect(interpolations.length).toBe(2) // one per monthly rank's whole used window (NBER, TB3MS)
    for (const s of interpolations) expect(s.degradesToNonDaily).toBe(true)
    for (const s of records.filter((r) => r.kind === 'carry-forward')) expect(s.degradesToNonDaily).toBe(false)
  })

  test('values are stored unchanged from the source, in annualized percent', () => {
    const seams = new SeamCollector()
    const result = buildShortRateSeries(makeFourSources(), CALENDAR, seams)
    const outStart = result.calendarStartIndex
    const someDffIdx = CALENDAR_DATES.indexOf(DFF_DATES[3]!)
    expect(result.values[someDffIdx - outStart]).toBe(DFF_VALUES[3])
  })

  test('a rate input with zero data rows aborts naming the file', () => {
    const sources = makeFourSources()
    sources[0] = { ...sources[0]!, dates: [], values: [] }
    const seams = new SeamCollector()
    expect(() => buildShortRateSeries(sources, CALENDAR, seams)).toThrow(/RATE-DFF/)
  })

  test('a duplicated date within one source aborts naming the date', () => {
    const sources = makeFourSources()
    const dupDates = [DFF_DATES[0]!, DFF_DATES[0]!, ...DFF_DATES.slice(1)]
    const dupValues = [DFF_VALUES[0]!, DFF_VALUES[0]!, ...DFF_VALUES.slice(1)]
    sources[0] = { ...sources[0]!, dates: dupDates, values: dupValues }
    const seams = new SeamCollector()
    expect(() => buildShortRateSeries(sources, CALENDAR, seams)).toThrow(new RegExp(DFF_DATES[0]!.replace(/-/g, '\\-')))
  })

  test('a gap wider than the declared carry-forward limit aborts', () => {
    const sources = makeFourSources()
    // Drop five consecutive business days from RATE-DFF, well past RATE_CARRY_FORWARD_LIMIT_DAYS.
    const wideGapDates = DFF_DATES.filter((_, i) => i < 5 || i > 5 + RATE_CARRY_FORWARD_LIMIT_DAYS + 2)
    const wideGapValues = wideGapDates.map((d) => DFF_VALUES[DFF_DATES.indexOf(d)]!)
    sources[0] = { ...sources[0]!, dates: wideGapDates, values: wideGapValues }
    const seams = new SeamCollector()
    expect(() => buildShortRateSeries(sources, CALENDAR, seams)).toThrow(/carry-forward limit/)
  })

  test('no splice boundary year (1934 or 1954) is hardcoded in executable rate-series.ts code', () => {
    const src = readFileSync(new URL('../src/rate-series.ts', import.meta.url), 'utf8')
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(/\b(1934|1954)\b/.test(stripped)).toBe(false)
  })
})

describe('interpolateMonthlyToDaily', () => {
  test('the value on a month-anchor date equals that anchor\'s value exactly', () => {
    const anchors = [
      { date: '2000-01-01', value: 1 },
      { date: '2000-02-01', value: 2 },
      { date: '2000-03-01', value: 3 },
    ]
    const dates = ['2000-01-01', '2000-02-01', '2000-03-01', '2000-01-16']
    const calendar: ReferenceCalendar = { days: Int32Array.from(dates.map(toDaysSinceEpoch)) }
    const out = interpolateMonthlyToDaily(anchors, calendar, 0, 3)
    expect(out[0]).toBe(1)
    expect(out[1]).toBe(2)
    expect(out[2]).toBe(3)
  })

  test('a mid-month value lies strictly between its two bracketing anchors', () => {
    const anchors = [
      { date: '2000-01-01', value: 1 },
      { date: '2000-02-01', value: 2 },
    ]
    const midDate = '2000-01-16'
    const calendar: ReferenceCalendar = { days: Int32Array.from([toDaysSinceEpoch(midDate)]) }
    const out = interpolateMonthlyToDaily(anchors, calendar, 0, 0)
    expect(out[0]!).toBeGreaterThan(1)
    expect(out[0]!).toBeLessThan(2)
  })
})
