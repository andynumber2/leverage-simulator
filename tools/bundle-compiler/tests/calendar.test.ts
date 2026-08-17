/**
 * tools/bundle-compiler/tests/calendar.test.ts
 *
 * Task 2 proof: deriveCalendar's selection rule and the strictly-ascending no-duplicates
 * invariant (unit-level), plus the end-to-end compileBundle integration for the extra-bar
 * abort's distinct message, the staleness boundary in both directions, ragged-left-edge silence,
 * the manifest's calendarExceptions passthrough and ordering, and the orphan-scope abort.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import { deriveCalendar, fromDaysSinceEpoch, toDaysSinceEpoch } from '../src/calendar.ts'
import { compileBundle } from '../src/compile.ts'
import type { RawSeries, SidecarMeta } from '../src/raw-input.ts'
import { makeRawFixture } from './fixtures/make-fixture.ts'

function consecutiveDates(count: number, startIso: string): string[] {
  const start = toDaysSinceEpoch(startIso)
  const result: string[] = []
  for (let i = 0; i < count; i++) result.push(fromDaysSinceEpoch(start + i))
  return result
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

function makeOutDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'calendar-test-out-'))
}

describe('deriveCalendar', () => {
  test('selects the earliest-starting price series regardless of row count', () => {
    const early = makeSeries('EARLY', 'price', consecutiveDates(5, '2024-01-01'), [1, 2, 3, 4, 5])
    const late = makeSeries(
      'LATE',
      'price',
      consecutiveDates(20, '2024-06-01'),
      Array.from({ length: 20 }, (_, i) => i),
    )
    const calendar = deriveCalendar([late, early])
    expect(Array.from(calendar.days)).toEqual(Array.from(early.dates.map(toDaysSinceEpoch)))
  })

  test('when two price series share the same first date, the longer one wins', () => {
    const short = makeSeries('SHORT', 'price', consecutiveDates(5, '2024-01-01'), [1, 2, 3, 4, 5])
    const long = makeSeries(
      'LONG',
      'price',
      consecutiveDates(9, '2024-01-01'),
      Array.from({ length: 9 }, (_, i) => i),
    )
    const calendar = deriveCalendar([short, long])
    expect(calendar.days.length).toBe(9)
  })

  test('the derived calendar is strictly ascending with no duplicates', () => {
    const series = makeSeries(
      'AAA',
      'price',
      consecutiveDates(30, '2024-01-01'),
      Array.from({ length: 30 }, (_, i) => i),
    )
    const calendar = deriveCalendar([series])
    for (let i = 1; i < calendar.days.length; i++) {
      expect(calendar.days[i]!).toBeGreaterThan(calendar.days[i - 1]!)
    }
  })
})

describe('compileBundle gap policy integration', () => {
  test('aborts with a distinct extra-bar message when a series carries a bar the calendar does not contain, leaving the calendar length unchanged', () => {
    const fullDates = consecutiveDates(10, '2024-08-01')
    const calendarDates = fullDates.filter((_, i) => i !== 4)
    const fixture = makeRawFixture({
      series: [
        { scope: 'AAA', seriesKind: 'price', units: 'index-level', dates: calendarDates },
        { scope: 'BBB', seriesKind: 'rate', units: 'percent-annualized', dates: fullDates },
      ],
    })
    const outDir = makeOutDir()
    try {
      let thrown: Error | undefined
      try {
        compileBundle(fixture.dir, outDir)
      } catch (err) {
        thrown = err as Error
      }
      expect(thrown).toBeDefined()
      expect(thrown!.message).toContain(fullDates[4]!)
      expect(thrown!.message).toMatch(/reference calendar does not contain/)
      expect(thrown!.message).not.toMatch(/interior gap/)

      const calendarFromInputs = deriveCalendar([
        makeSeries('AAA', 'price', calendarDates, calendarDates.map((_, i) => 100 + i)),
      ])
      expect(calendarFromInputs.days.length).toBe(calendarDates.length)
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('a series trailing the newest date by exactly STALENESS_WARN_DAYS produces no warning; one more day produces exactly one', () => {
    const dates = consecutiveDates(40, '2024-09-01')

    const buildFixture = (trail: number) => {
      const shortDates = dates.slice(0, dates.length - trail)
      return makeRawFixture({
        series: [
          { scope: 'AAA', seriesKind: 'price', units: 'index-level', dates },
          { scope: 'CCC', seriesKind: 'price', units: 'index-level', dates: shortDates },
        ],
      })
    }

    const exactFixture = buildFixture(10)
    const overFixture = buildFixture(11)
    const outDir1 = makeOutDir()
    const outDir2 = makeOutDir()
    try {
      const exactResult = compileBundle(exactFixture.dir, outDir1)
      expect(exactResult.warnings.length).toBe(0)

      const overResult = compileBundle(overFixture.dir, outDir2)
      expect(overResult.warnings.length).toBe(1)
      expect(overResult.warnings[0]).toContain('CCC')
    } finally {
      rmSync(exactFixture.dir, { recursive: true, force: true })
      rmSync(overFixture.dir, { recursive: true, force: true })
      rmSync(outDir1, { recursive: true, force: true })
      rmSync(outDir2, { recursive: true, force: true })
    }
  })

  test('a ragged left edge produces no warning', () => {
    const dates = consecutiveDates(40, '2024-10-01')
    const laterStart = dates.slice(20)
    const fixture = makeRawFixture({
      series: [
        { scope: 'AAA', seriesKind: 'price', units: 'index-level', dates },
        { scope: 'DDD', seriesKind: 'price', units: 'index-level', dates: laterStart },
      ],
    })
    const outDir = makeOutDir()
    try {
      const result = compileBundle(fixture.dir, outDir)
      expect(result.warnings.length).toBe(0)
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('every calendar-exceptions.json entry reaches the manifest byte-identical, sorted by scope then date', () => {
    const fullDates = consecutiveDates(10, '2024-11-01')
    const calendarDates = fullDates.filter((_, i) => i !== 4)
    const fixture = makeRawFixture({
      series: [
        { scope: 'AAA', seriesKind: 'price', units: 'index-level', dates: calendarDates },
        { scope: 'BBB', seriesKind: 'rate', units: 'percent-annualized', dates: fullDates },
        { scope: 'CCC', seriesKind: 'rate', units: 'percent-annualized', dates: fullDates },
      ],
    })
    writeFileSync(
      path.join(fixture.dir, 'calendar-exceptions.json'),
      JSON.stringify([
        { scope: 'CCC', date: fullDates[4], reason: 'CCC reason' },
        { scope: 'BBB', date: fullDates[4], reason: 'BBB reason' },
      ]),
    )
    const outDir = makeOutDir()
    try {
      const result = compileBundle(fixture.dir, outDir)
      const manifest = JSON.parse(readFileSync(path.join(outDir, result.manifestFile), 'utf8')) as {
        calendarExceptions: Array<{ scope: string; date: string; reason: string }>
      }
      expect(manifest.calendarExceptions).toEqual([
        { scope: 'BBB', date: fullDates[4], reason: 'BBB reason' },
        { scope: 'CCC', date: fullDates[4], reason: 'CCC reason' },
      ])
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('an exception naming a scope with no raw input aborts, naming that scope', () => {
    const fixture = makeRawFixture()
    writeFileSync(
      path.join(fixture.dir, 'calendar-exceptions.json'),
      JSON.stringify([{ scope: 'ZZZ', date: '2020-01-01', reason: 'orphan entry' }]),
    )
    const outDir = makeOutDir()
    try {
      let thrown: Error | undefined
      try {
        compileBundle(fixture.dir, outDir)
      } catch (err) {
        thrown = err as Error
      }
      expect(thrown).toBeDefined()
      expect(thrown!.message).toContain('ZZZ')
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })
})
