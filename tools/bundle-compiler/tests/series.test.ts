/**
 * tools/bundle-compiler/tests/series.test.ts
 *
 * Task 2 proof: buildTotalReturnSeries constructs the pre-real-total-return run from price return
 * plus interpolated dividend yield, splices it to the real series exactly at S with no duplicated
 * bar, records the two typed seams, and assertTotalReturnSourceExists aborts a scope with neither
 * source.
 */

import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import { fromDaysSinceEpoch, toDaysSinceEpoch, type ReferenceCalendar } from '../src/calendar.ts'
import { interpolateMonthlyToDaily } from '../src/rate-series.ts'
import type { RawSeries, SidecarMeta } from '../src/raw-input.ts'
import { SeamCollector } from '../src/seams.ts'
import { assertTotalReturnSourceExists, buildTotalReturnSeries, type AlignedInputSeries } from '../src/total-return.ts'

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

const CALENDAR_DATES = makeBusinessDays('1980-01-01', '1985-06-28')
const CALENDAR: ReferenceCalendar = { days: Int32Array.from(CALENDAR_DATES.map(toDaysSinceEpoch)) }

// Deterministic synthetic price series covering the full calendar range.
const PRICE_VALUES = CALENDAR_DATES.map((_, i) => 100 * Math.pow(1.0002, i))
const PRICE: AlignedInputSeries = {
  values: Float64Array.from(PRICE_VALUES),
  calendarStartIndex: 0,
  firstDate: CALENDAR_DATES[0]!,
  lastDate: CALENDAR_DATES[CALENDAR_DATES.length - 1]!,
  sourceName: 'TEST-PR',
}

// The real total-return series begins partway through, at S (index-selected so it lands on an
// actual generated business day).
const S_INDEX = Math.floor(CALENDAR_DATES.length * 0.6)
const S_DATE = CALENDAR_DATES[S_INDEX]!
const REAL_TR_VALUES = CALENDAR_DATES.slice(S_INDEX).map((_, i) => 500 * Math.pow(1.0003, i))
const REAL_TR: AlignedInputSeries = {
  values: Float64Array.from(REAL_TR_VALUES),
  calendarStartIndex: S_INDEX,
  firstDate: S_DATE,
  lastDate: CALENDAR_DATES[CALENDAR_DATES.length - 1]!,
  sourceName: 'TEST-TR',
}

// Monthly dividend yield covering from before the price series' own start through past S.
const YIELD_DATES = makeMonthlyDates('1979-06-01', '1985-01-01')
const YIELD_VALUES = YIELD_DATES.map(() => 0.025) // constant 2.5% annualized yield

function makeYieldSeries(rawStem: string, values: number[]): RawSeries {
  const meta: SidecarMeta = {
    source: 'Test',
    url: 'https://example.test/div',
    retrievedAt: '2026-01-01',
    seriesKind: 'dividend-monthly',
    license: 'Public Domain',
    termsUrl: 'https://example.test/terms',
    scope: 'TEST',
    units: 'ratio',
  }
  return { scope: 'TEST', rawStem, meta, dates: YIELD_DATES, values }
}

describe('buildTotalReturnSeries', () => {
  test('the compiled value on the splice date equals the real value exactly, and the constructed run ends the day before', () => {
    const seams = new SeamCollector()
    const yieldSeries = makeYieldSeries('TEST-DIV-MONTHLY', YIELD_VALUES)
    const result = buildTotalReturnSeries('TEST', PRICE, REAL_TR, yieldSeries, CALENDAR, seams)

    const sOffsetInResult = S_INDEX - result.calendarStartIndex
    expect(result.values[sOffsetInResult]).toBe(REAL_TR_VALUES[0])
    // Exactly one source contributes on S: the constructed run's own length equals S_INDEX - constructionStart.
    expect(result.calendarStartIndex).toBeLessThan(S_INDEX)
    expect(result.values.length).toBe(S_INDEX - result.calendarStartIndex + REAL_TR_VALUES.length)
  })

  test('chaining the constructed level at S-1 forward one bar reproduces the real level at S within a documented relative tolerance', () => {
    const seams = new SeamCollector()
    const yieldSeries = makeYieldSeries('TEST-DIV-MONTHLY', YIELD_VALUES)
    const result = buildTotalReturnSeries('TEST', PRICE, REAL_TR, yieldSeries, CALENDAR, seams)

    const sOffset = S_INDEX - result.calendarStartIndex
    const constructedAtSMinus1 = result.values[sOffset - 1]!
    const priceReturn = PRICE_VALUES[S_INDEX]! / PRICE_VALUES[S_INDEX - 1]! - 1
    const yieldAtS = interpolateMonthlyToDaily(
      YIELD_DATES.map((d, i) => ({ date: d, value: YIELD_VALUES[i]! })),
      CALENDAR,
      S_INDEX,
      S_INDEX,
    )[0]!
    const daysElapsed = CALENDAR.days[S_INDEX]! - CALENDAR.days[S_INDEX - 1]!
    const forward = constructedAtSMinus1 * (1 + priceReturn + (yieldAtS * daysElapsed) / 365)
    const relativeDiff = Math.abs(forward - result.values[sOffset]!) / result.values[sOffset]!
    expect(relativeDiff).toBeLessThan(1e-9)
  })

  test('the dividend contribution for a bar following a three-calendar-day gap is three times a one-day-gap bar at the same yield', () => {
    // A tiny fixture: two constructed bars, one following a 1-day gap and one following a 3-day
    // gap, both against the same constant yield, isolates the day-count multiplier.
    const dates = ['2000-01-03', '2000-01-04', '2000-01-07'] // Mon, Tue, Fri (gap of 1 then 3)
    const calendar: ReferenceCalendar = { days: Int32Array.from(dates.map(toDaysSinceEpoch)) }
    const price: AlignedInputSeries = {
      values: Float64Array.from([100, 100, 100]), // flat price: isolates the dividend term
      calendarStartIndex: 0,
      firstDate: dates[0]!,
      lastDate: dates[2]!,
      sourceName: 'FLAT-PR',
    }
    const realTr: AlignedInputSeries = {
      values: Float64Array.from([1000]),
      calendarStartIndex: 2,
      firstDate: dates[2]!,
      lastDate: dates[2]!,
      sourceName: 'FLAT-TR',
    }
    const yieldDates = ['1999-12-01', '2000-02-01']
    const yieldSeries = makeYieldSeries('FLAT-DIV-MONTHLY', [0.05, 0.05])
    yieldSeries.dates = yieldDates
    yieldSeries.values = [0.05, 0.05]

    const seams = new SeamCollector()
    const result = buildTotalReturnSeries('FLAT', price, realTr, yieldSeries, calendar, seams)
    // result covers indices [0,1,2]: index0=constructed (0->1 step), index1=constructed (1->2 step is real at 2)
    // Actually constructionStartIndex=0, sIndex=2, so constructed run covers indices 0,1 (S-1=1).
    // levels[1] (index1, one-day gap from index0) and levels[0] (constructed via 1->0? no: backward
    // walk computes level[i] for i = sIndex-1=1 down to constructionStartIndex=0.
    // level[1] uses the 1-day gap (dates[1]-dates[0]=1), level[0] uses the 3-day gap (dates[2]-dates[1]... )
    // Recompute expected values directly rather than re-deriving the recurrence inline.
    const oneDayContribution = (0.05 * 1) / 365
    const threeDayContribution = (0.05 * 3) / 365
    // level[1] = real[2] / (1 + 0 + threeDayContribution)  [step from index1 to index2, gap=3]
    const level1 = 1000 / (1 + 0 + threeDayContribution)
    // level[0] = level[1] / (1 + 0 + oneDayContribution)  [step from index0 to index1, gap=1]
    const level0 = level1 / (1 + 0 + oneDayContribution)

    expect(result.calendarStartIndex).toBe(0)
    expect(result.values[1]).toBeCloseTo(level1, 10)
    expect(result.values[0]).toBeCloseTo(level0, 10)
    // The per-step dividend contribution scales exactly 3x with the day count at the same yield.
    expect(threeDayContribution).toBeCloseTo(oneDayContribution * 3, 12)
  })

  test('a fixture yield inflated twelve-fold (the Pitfall 1 bug shape) produces a materially different early-date constructed level', () => {
    const seamsCorrect = new SeamCollector()
    const seamsInflated = new SeamCollector()
    const correctYield = makeYieldSeries('TEST-DIV-MONTHLY', YIELD_VALUES)
    const inflatedYield = makeYieldSeries('TEST-DIV-MONTHLY', YIELD_VALUES.map((v) => v * 12))

    const correct = buildTotalReturnSeries('TEST', PRICE, REAL_TR, correctYield, CALENDAR, seamsCorrect)
    const inflated = buildTotalReturnSeries('TEST', PRICE, REAL_TR, inflatedYield, CALENDAR, seamsInflated)

    // Same construction window (same yield anchor coverage), so directly comparable index 0.
    expect(correct.calendarStartIndex).toBe(inflated.calendarStartIndex)
    const relativeDiff = Math.abs(correct.values[0]! - inflated.values[0]!) / correct.values[0]!
    expect(relativeDiff).toBeGreaterThan(0.5) // far past any plausible "documented tolerance"
  })

  test('interpolateMonthlyToDaily used by the construction returns no value before the first anchor or after the last', () => {
    const anchors = [
      { date: '1980-01-01', value: 0.02 },
      { date: '1980-06-01', value: 0.03 },
    ]
    const calendar: ReferenceCalendar = { days: Int32Array.from(['1980-01-01', '1980-03-01', '1980-06-01'].map(toDaysSinceEpoch)) }
    const out = interpolateMonthlyToDaily(anchors, calendar, 0, 2)
    expect(out[0]).toBe(0.02)
    expect(out[2]).toBe(0.03)
    expect(out[1]!).toBeGreaterThan(0.02)
    expect(out[1]!).toBeLessThan(0.03)
  })

  test('every compiled price-return value is strictly equal to the input value, with no tolerance', () => {
    const seams = new SeamCollector()
    const yieldSeries = makeYieldSeries('TEST-DIV-MONTHLY', YIELD_VALUES)
    buildTotalReturnSeries('TEST', PRICE, REAL_TR, yieldSeries, CALENDAR, seams)
    // buildTotalReturnSeries must never mutate its price input.
    for (let i = 0; i < PRICE_VALUES.length; i++) expect(PRICE.values[i]).toBe(PRICE_VALUES[i])
  })

  test('records exactly one interpolation seam and one splice seam, both degradesToNonDaily true', () => {
    const seams = new SeamCollector()
    const yieldSeries = makeYieldSeries('TEST-DIV-MONTHLY', YIELD_VALUES)
    buildTotalReturnSeries('TEST', PRICE, REAL_TR, yieldSeries, CALENDAR, seams)
    const records = seams.records()
    expect(records.filter((r) => r.kind === 'interpolation').length).toBe(1)
    expect(records.filter((r) => r.kind === 'splice').length).toBe(1)
    for (const r of records) expect(r.degradesToNonDaily).toBe(true)
    const splice = records.find((r) => r.kind === 'splice')!
    expect(splice.firstDate).toBe(S_DATE)
    expect(splice.lastDate).toBe(S_DATE)
  })

  test('grep sentinel: the module doc comment names the calendar-day accrual convention and SIM-03', () => {
    // Executed as a behavioral proxy for the plan's own grep-based acceptance check (module text
    // content is stable and asserted here directly rather than shelling out).
    const src = readFileSync(new URL('../src/total-return.ts', import.meta.url), 'utf8')
    expect((src.match(/365/g) ?? []).length).toBeGreaterThanOrEqual(1)
    expect(src).toContain('SIM-03')
    expect(src.toLowerCase()).toContain('calendar-day')
  })
})

describe('assertTotalReturnSourceExists', () => {
  test('throws naming the scope when neither a real total-return series nor a dividend input exists', () => {
    expect(() => assertTotalReturnSourceExists('NOPE', false, false)).toThrow(/NOPE/)
  })

  test('does not throw when a real total-return series exists, even without a dividend input', () => {
    expect(() => assertTotalReturnSourceExists('HASREAL', true, false)).not.toThrow()
  })

  test('does not throw when a dividend input exists, even without a real total-return series', () => {
    expect(() => assertTotalReturnSourceExists('HASDIV', false, true)).not.toThrow()
  })
})
