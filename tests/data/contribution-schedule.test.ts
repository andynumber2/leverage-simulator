/**
 * tests/data/contribution-schedule.test.ts
 *
 * Every behavior D-25 through D-28 require, proven against the real committed calendar loaded
 * through `loadBundleFromDisk`, plus hand-built `Int32Array` calendars for the collision case and
 * a synthetic long-closure case where a nominal date's roll-forward must skip an entire multi-day
 * gap in one binary-search step.
 */

import { describe, expect, test } from 'vitest'

import { fromDaysSinceEpoch, indexOfDate, toDaysSinceEpoch } from '../../tools/bundle-compiler/src/calendar.ts'
import { runBacktest } from '../../src/kernel/backtest.ts'
import type { KernelOutputs, KernelParams, KernelSeries } from '../../src/kernel/backtest.types.ts'
import { buildContributionFlags, resolveContributionBars } from '../../src/data/contribution-schedule.ts'
import type { LoadedBundle } from '../../src/data/kernel-inputs.ts'
import { loadBundleFromDisk } from '../../src/data/load-bundle-node.ts'

function entryIndexFor(bundle: LoadedBundle, isoDate: string): number {
  const idx = indexOfDate({ days: bundle.calendar }, toDaysSinceEpoch(isoDate))
  if (idx === -1) {
    throw new Error(`test fixture error: "${isoDate}" is not a trading session in the compiled calendar`)
  }
  return idx
}

describe('resolveContributionBars (D-25 through D-28, real compiled calendar)', () => {
  test('frequency "none" returns an empty schedule for a multi-decade window', async () => {
    const bundle = await loadBundleFromDisk()
    const entryIndex = entryIndexFor(bundle, '1990-01-02')
    const schedule = resolveContributionBars(bundle.calendar, entryIndex, bundle.calendar.length - 1, 'none')

    expect(schedule.barIndices.length).toBe(0)
    expect(schedule.nominalDates.length).toBe(0)
  })

  test('frequency "daily" returns every bar index from 1 through the window length, never 0', async () => {
    const bundle = await loadBundleFromDisk()
    const entryIndex = entryIndexFor(bundle, '2015-01-02')
    const lastIndex = entryIndex + 10
    const schedule = resolveContributionBars(bundle.calendar, entryIndex, lastIndex, 'daily')

    expect(Array.from(schedule.barIndices)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(schedule.barIndices).not.toContain(0)
  })

  test('a 2015-01-31 monthly entry clamps February to the 28th and rolls March back to the 31st, and a 2016-01-31 monthly entry clamps February to the 29th (leap year)', () => {
    // Anchored on synthetic dense (every-calendar-day) calendars so the clamp behavior itself is
    // isolated from any real-calendar trading-day roll: the entry's own day-of-month drives the
    // clamp regardless of which days are open for trading.
    const jan31 = toDaysSinceEpoch('2015-01-31')
    const syntheticCalendar2015 = Int32Array.from(
      Array.from({ length: 120 }, (_, i) => jan31 + i), // dense run covering every calendar day for 4 months
    )
    const schedule2015 = resolveContributionBars(syntheticCalendar2015, 0, syntheticCalendar2015.length - 1, 'monthly')
    expect(schedule2015.nominalDates[0]).toBe('2015-02-28')
    expect(schedule2015.nominalDates[1]).toBe('2015-03-31')

    const jan31Leap = toDaysSinceEpoch('2016-01-31')
    const syntheticCalendar2016 = Int32Array.from(Array.from({ length: 120 }, (_, i) => jan31Leap + i))
    const schedule2016 = resolveContributionBars(syntheticCalendar2016, 0, syntheticCalendar2016.length - 1, 'monthly')
    expect(schedule2016.nominalDates[0]).toBe('2016-02-29')
  })

  test('quarterly steps 3 months per period and yearly steps 12, both from the same clamp-then-roll rule', () => {
    const day16 = toDaysSinceEpoch('2015-01-16')
    const dense = Int32Array.from(Array.from({ length: 800 }, (_, i) => day16 + i))

    const quarterly = resolveContributionBars(dense, 0, dense.length - 1, 'quarterly')
    expect(quarterly.nominalDates[0]).toBe('2015-04-16')
    expect(quarterly.nominalDates[1]).toBe('2015-07-16')

    const yearly = resolveContributionBars(dense, 0, dense.length - 1, 'yearly')
    expect(yearly.nominalDates[0]).toBe('2016-01-16')
    expect(yearly.nominalDates[1]).toBe('2017-01-16')
  })

  test('a nominal date that is itself a trading day resolves to itself; a nominal date on a non-trading day rolls forward to the next trading day present in the calendar (D-26)', async () => {
    const bundle = await loadBundleFromDisk()
    const entryIndex = entryIndexFor(bundle, '2015-01-16')
    const lastIndex = entryIndex + 400
    const schedule = resolveContributionBars(bundle.calendar, entryIndex, lastIndex, 'monthly')

    expect(schedule.barIndices.length).toBeGreaterThan(0)

    let sawExactMatch = false
    let sawRoll = false

    for (let i = 0; i < schedule.barIndices.length; i++) {
      const barIndex = schedule.barIndices[i]!
      const nominalDate = schedule.nominalDates[i]!
      const resolvedDate = fromDaysSinceEpoch(bundle.calendar[entryIndex + barIndex]!)
      const nominalIsTradingDay = indexOfDate({ days: bundle.calendar }, toDaysSinceEpoch(nominalDate)) !== -1

      if (nominalIsTradingDay) {
        expect(resolvedDate).toBe(nominalDate)
        sawExactMatch = true
      } else {
        expect(resolvedDate > nominalDate).toBe(true)
        sawRoll = true
      }
    }

    // Over a 400-bar (roughly 13-month) real-calendar window, both cases are expected to occur at
    // least once -- if neither did, the fixture window should be widened rather than the
    // assertion relaxed.
    expect(sawExactMatch).toBe(true)
    expect(sawRoll).toBe(true)
  })

  test('a nominal date whose roll-forward would land past the window last bar is not scheduled at all', async () => {
    const bundle = await loadBundleFromDisk()
    const entryIndex = entryIndexFor(bundle, '2015-01-02')

    // Bound the window at exactly the bar immediately before the second monthly contribution
    // would land, using a generous first pass to discover where that bar is.
    const wideSchedule = resolveContributionBars(bundle.calendar, entryIndex, entryIndex + 1000, 'monthly')
    const secondBarIndex = wideSchedule.barIndices[1]!
    const boundedLastIndex = entryIndex + secondBarIndex - 1

    const boundedSchedule = resolveContributionBars(bundle.calendar, entryIndex, boundedLastIndex, 'monthly')
    expect(boundedSchedule.barIndices.length).toBe(1)
  })

  test('a near-2015-01-17 monthly entry (the compiled calendar has no session on the 17th itself, a Saturday; this test anchors on the 16th, the last trading day at/before it) produces exactly 12 contributions in the following 12 months, and a run using that schedule reports totalContributed = initialInvestment + amount * 12 (D-28)', async () => {
    const bundle = await loadBundleFromDisk()
    const entryIndex = entryIndexFor(bundle, '2015-01-16')

    const wideSchedule = resolveContributionBars(bundle.calendar, entryIndex, entryIndex + 1000, 'monthly')
    const thirteenthBarIndex = wideSchedule.barIndices[12]!
    const boundedLastIndex = entryIndex + thirteenthBarIndex - 1

    const schedule = resolveContributionBars(bundle.calendar, entryIndex, boundedLastIndex, 'monthly')
    expect(schedule.barIndices.length).toBe(12)

    const barCount = boundedLastIndex - entryIndex + 1
    const contributionFlags = buildContributionFlags(barCount, schedule)

    const params: KernelParams = {
      leverage: 1,
      initialInvestment: 10_000,
      contributionAmount: 500,
      financingSpread: 0,
      expenseRatio: 0,
      longGapMinDays: 6,
    }
    const series: KernelSeries = {
      returns: new Float64Array(barCount),
      shortRate: new Float64Array(barCount),
      calendarDaysElapsed: Int32Array.from({ length: barCount }, (_, i) => (i === 0 ? 0 : 1)),
      contributionFlags,
    }
    const outputs: KernelOutputs = {
      outValue: new Float64Array(barCount),
      outRuined: new Uint8Array(barCount),
      outLongGap: new Uint8Array(barCount),
    }

    const result = runBacktest(params, series, outputs)
    expect(result.totalContributed).toBe(10_000 + 500 * 12)
  })

  test('returned barIndices are strictly ascending and duplicate-free for every non-none frequency over a real multi-year window', async () => {
    const bundle = await loadBundleFromDisk()
    const entryIndex = entryIndexFor(bundle, '2000-03-15')
    const lastIndex = entryIndex + 5000

    for (const frequency of ['daily', 'monthly', 'quarterly', 'yearly'] as const) {
      const schedule = resolveContributionBars(bundle.calendar, entryIndex, lastIndex, frequency)
      for (let i = 1; i < schedule.barIndices.length; i++) {
        expect(schedule.barIndices[i]!).toBeGreaterThan(schedule.barIndices[i - 1]!)
      }
    }
  })
})

describe('resolveContributionBars collision and long-closure cases (hand-built calendars)', () => {
  test('two nominal dates resolving to the same trading bar throws an error naming both nominal dates', () => {
    const entryDays = toDaysSinceEpoch('2020-01-15')
    const farFutureDay = toDaysSinceEpoch('2020-06-01')
    // Only two trading days exist in this synthetic calendar: the entry itself, and one far-future
    // session. Every monthly nominal date after the entry rolls forward to that single available
    // session, so the second monthly period collides with the first on the same bar.
    const calendar = Int32Array.from([entryDays, farFutureDay])

    expect(() => resolveContributionBars(calendar, 0, 1, 'monthly')).toThrowError(/2020-02-15.*2020-03-15|2020-03-15.*2020-02-15/)
  })

  test('a nominal date landing inside a multi-day closure rolls forward past the entire gap in one step, to the first trading day after reopening', () => {
    const day0 = toDaysSinceEpoch('2020-01-06') // entry day-of-month 6, a value the clamp never touches
    // 14 consecutive trading days (day0 .. day0+13), then a 20-day closure (day0+14 .. day0+33,
    // no trading), then 27 more consecutive trading days resuming at day0+34.
    const firstBlock = Array.from({ length: 14 }, (_, i) => day0 + i)
    const secondBlock = Array.from({ length: 27 }, (_, i) => day0 + 34 + i)
    const calendar = Int32Array.from([...firstBlock, ...secondBlock])

    const schedule = resolveContributionBars(calendar, 0, calendar.length - 1, 'monthly')

    // The first monthly nominal date (2020-02-06, day0+31) falls squarely inside the closure gap
    // (day0+14 through day0+33); it must resolve to the first trading day after reopening
    // (day0+34, calendar index 14, relative bar index 14), not to any date inside the gap.
    expect(schedule.nominalDates[0]).toBe('2020-02-06')
    expect(schedule.barIndices[0]).toBe(14)
    expect(calendar[14]).toBe(day0 + 34)
  })

  test('an empty gap between entry and the sole other session still resolves correctly for a synthetic collision-free case', () => {
    const entryDays = toDaysSinceEpoch('2021-05-10')
    const nextDays = toDaysSinceEpoch('2021-06-10') // exactly one month later, itself a trading day
    const calendar = Int32Array.from([entryDays, nextDays])

    const schedule = resolveContributionBars(calendar, 0, 1, 'monthly')
    expect(schedule.barIndices.length).toBe(1)
    expect(schedule.barIndices[0]).toBe(1)
    expect(schedule.nominalDates[0]).toBe('2021-06-10')
  })
})

describe('resolveContributionBars unknown-frequency guard (T-03-15, D-32)', () => {
  test('a runtime frequency value outside the declared union throws naming the value and the supported set, rather than propagating NaN', () => {
    const bundle = Int32Array.from([toDaysSinceEpoch('2020-01-06'), toDaysSinceEpoch('2020-06-01')])
    // Cast bypasses TypeScript's compile-time union check to simulate an unvalidated caller.
    const bogusFrequency = 'fortnightly' as unknown as Parameters<typeof resolveContributionBars>[3]

    expect(() => resolveContributionBars(bundle, 0, 1, bogusFrequency)).toThrowError(/fortnightly/)
  })
})

describe('buildContributionFlags', () => {
  test('writes 1 at every scheduled bar index and 0 elsewhere', () => {
    const schedule = { barIndices: Int32Array.from([2, 5, 9]), nominalDates: ['a', 'b', 'c'] }
    const flags = buildContributionFlags(10, schedule)

    expect(Array.from(flags)).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 0, 1])
  })

  test('allocates exactly one Uint8Array of the requested length for an empty schedule', () => {
    const flags = buildContributionFlags(5, { barIndices: new Int32Array(0), nominalDates: [] })
    expect(flags.length).toBe(5)
    expect(Array.from(flags)).toEqual([0, 0, 0, 0, 0])
  })
})
