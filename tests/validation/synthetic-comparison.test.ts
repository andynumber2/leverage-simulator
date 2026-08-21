/**
 * tests/validation/synthetic-comparison.test.ts
 *
 * F-01/Task 1: direct coverage of `src/validation/synthetic-comparison.ts`'s extracted helpers,
 * beyond the behaviour-preservation the rewritten `tests/validation/upro-tqqq-gate.test.ts`
 * already proves by producing byte-identical gate figures before and after the extraction. Real
 * bundled series exercise the happy paths (every bundled fund/index pair overlaps well past
 * `MIN_OVERLAP_YEARS`); a hand-built minimal bundle exercises the too-short-overlap failure path,
 * since no bundled pair is short enough to reach it.
 */

import { beforeAll, describe, expect, test } from 'vitest'

import { FORMAT_VERSION, type AssetHeader, type SeriesDescriptor, type SeriesKind } from '../../tools/bundle-compiler/src/binary-format.ts'
import { fromDaysSinceEpoch, toDaysSinceEpoch } from '../../tools/bundle-compiler/src/calendar.ts'
import type { Manifest } from '../../tools/bundle-compiler/src/manifest.ts'
import type { LoadedBundle } from '../../src/data/bundle-source.ts'
import { loadBundleFromDisk } from '../../src/data/load-bundle-node.ts'
import {
  buildRateRegimeWindows,
  deriveReturns,
  HIGH_RATE_ERA_START,
  localIndexAtOrAfter,
  localIndexAtOrBefore,
  MIN_OVERLAP_YEARS,
  NEAR_ZERO_RATE_ERA_END,
  readSeriesLevels,
  resolveOverlapWindow,
  SYNTHETIC_LEVERAGE,
  sliceLevelsToWindow,
} from '../../src/validation/synthetic-comparison.ts'

describe('constants', () => {
  test('SYNTHETIC_LEVERAGE, MIN_OVERLAP_YEARS and the two era boundaries match the gate test values they replace', () => {
    expect(SYNTHETIC_LEVERAGE).toBe(3)
    expect(MIN_OVERLAP_YEARS).toBe(15)
    expect(NEAR_ZERO_RATE_ERA_END).toBe('2015-12-31')
    expect(HIGH_RATE_ERA_START).toBe('2022-01-01')
  })
})

describe('deriveReturns', () => {
  test('bar 0 is 0 and every later bar is level[k]/level[k-1] - 1', () => {
    const values = new Float64Array([100, 110, 99, 99])
    const returns = deriveReturns(values)
    expect(returns[0]).toBe(0)
    expect(returns[1]).toBeCloseTo(0.1, 10)
    expect(returns[2]).toBeCloseTo(99 / 110 - 1, 10)
    expect(returns[3]).toBe(0)
  })

  test('a zero previous level produces a 0 return rather than dividing by zero', () => {
    const values = new Float64Array([0, 50])
    const returns = deriveReturns(values)
    expect(returns[1]).toBe(0)
  })
})

describe('localIndexAtOrBefore / localIndexAtOrAfter', () => {
  // Calendar with gaps: days 101, 103, 105, 107 are absent.
  const calendar = new Int32Array([100, 102, 104, 106, 108])

  test('agree at a date exactly present in the calendar', () => {
    expect(localIndexAtOrBefore(calendar, 0, 5, 104)).toBe(2)
    expect(localIndexAtOrAfter(calendar, 0, 5, 104)).toBe(2)
  })

  test('straddle by one index when the target date is absent', () => {
    expect(localIndexAtOrBefore(calendar, 0, 5, 105)).toBe(2)
    expect(localIndexAtOrAfter(calendar, 0, 5, 105)).toBe(3)
  })

  test('localIndexAtOrBefore returns -1 when every day is after the target', () => {
    expect(localIndexAtOrBefore(calendar, 0, 5, 50)).toBe(-1)
  })

  test('localIndexAtOrAfter returns barCount when every day is before the target', () => {
    expect(localIndexAtOrAfter(calendar, 0, 5, 500)).toBe(5)
  })
})

describe('readSeriesLevels / sliceLevelsToWindow against the real bundle', () => {
  let bundle: LoadedBundle

  beforeAll(async () => {
    bundle = await loadBundleFromDisk()
  })

  test('reads a real bundled series and slices it to a small window matching direct level lookups', () => {
    const spx = readSeriesLevels(bundle, 'SPX/total-return')
    expect(spx.levels.length).toBeGreaterThan(0)
    expect(spx.lastDate.length).toBe(10)

    const entryAbsIndex = spx.calendarStartIndex + 10
    const barCount = 5
    const sliced = sliceLevelsToWindow(spx.levels, spx.calendarStartIndex, entryAbsIndex, barCount)
    expect(sliced.length).toBe(barCount)
    for (let k = 0; k < barCount; k++) {
      expect(sliced[k]).toBe(spx.levels[10 + k])
    }
  })

  test('throws naming the series id when the series is not in the manifest', () => {
    expect(() => readSeriesLevels(bundle, 'DOES-NOT-EXIST/total-return')).toThrow(/DOES-NOT-EXIST\/total-return/)
  })
})

describe('resolveOverlapWindow against the real bundle', () => {
  let bundle: LoadedBundle

  beforeAll(async () => {
    bundle = await loadBundleFromDisk()
  })

  test('UPRO: resolves the overlap start to the fund\'s own (later) inception date, and the span clears MIN_OVERLAP_YEARS', () => {
    const window = resolveOverlapWindow(bundle, 'SPX/total-return', 'UPRO/total-return')
    expect(window.entryDate).toBe('2009-06-25')
    expect(window.years).toBeGreaterThanOrEqual(MIN_OVERLAP_YEARS)
    expect(window.barCount).toBeGreaterThan(0)
    expect(window.firstDate).toBe(window.entryDate)
    expect(window.lastDate > window.firstDate).toBe(true)
  })

  test('TQQQ: resolves the overlap start to the fund\'s own (later) inception date, and the span clears MIN_OVERLAP_YEARS', () => {
    const window = resolveOverlapWindow(bundle, 'NDX/total-return', 'TQQQ/total-return')
    expect(window.entryDate).toBe('2010-02-11')
    expect(window.years).toBeGreaterThanOrEqual(MIN_OVERLAP_YEARS)
  })

  test('throws naming the missing series id when the index series is not in the manifest', () => {
    expect(() => resolveOverlapWindow(bundle, 'DOES-NOT-EXIST/total-return', 'UPRO/total-return')).toThrow(
      /DOES-NOT-EXIST\/total-return/,
    )
  })

  test('throws naming the missing series id when the fund series is not in the manifest', () => {
    expect(() => resolveOverlapWindow(bundle, 'SPX/total-return', 'DOES-NOT-EXIST/total-return')).toThrow(
      /DOES-NOT-EXIST\/total-return/,
    )
  })
})

describe('buildRateRegimeWindows against the real bundle', () => {
  let bundle: LoadedBundle

  beforeAll(async () => {
    bundle = await loadBundleFromDisk()
  })

  test('UPRO: the resolved window reaches into both the near-zero-rate and high-rate eras, so both sub-windows are built', () => {
    const window = resolveOverlapWindow(bundle, 'SPX/total-return', 'UPRO/total-return')
    const regimes = buildRateRegimeWindows(bundle.calendar, window.entryIndex, window.barCount, 'UPRO')
    expect(regimes.length).toBe(2)
    expect(regimes[0]!.label).toContain('near-zero-rate era')
    expect(regimes[0]!.label).toContain(NEAR_ZERO_RATE_ERA_END)
    expect(regimes[1]!.label).toContain('high-rate era')
    expect(regimes[1]!.label).toContain(HIGH_RATE_ERA_START)
    // Every regime window nests inside the full resolved window.
    for (const regime of regimes) {
      expect(regime.firstBar).toBeGreaterThanOrEqual(0)
      expect(regime.lastBar).toBeLessThanOrEqual(window.barCount - 1)
      expect(regime.firstBar).toBeLessThanOrEqual(regime.lastBar)
    }
  })

  test('a window entirely inside the near-zero-rate era yields no high-rate sub-window', () => {
    // A short synthetic window ending well before HIGH_RATE_ERA_START never reaches that era.
    const calendar = new Int32Array(200)
    const start = toDaysSinceEpoch('2012-01-01')
    for (let i = 0; i < calendar.length; i++) calendar[i] = start + i
    const regimes = buildRateRegimeWindows(calendar, 0, calendar.length, 'FAKE')
    expect(regimes.length).toBe(1)
    expect(regimes[0]!.label).toContain('near-zero-rate era')
  })
})

// --- Too-short-overlap failure path: no bundled fund/index pair is short enough to reach this,
// so a minimal hand-built bundle exercises it directly. ---

function buildFakeSeriesAsset(
  id: string,
  kind: SeriesKind,
  calendarStartIndex: number,
  values: readonly number[],
): { buffer: ArrayBuffer; header: AssetHeader } {
  const data = new Float64Array(values)
  const descriptor: SeriesDescriptor = { kind, id, calendarStartIndex, length: values.length, dataByteOffset: 0 }
  const header: AssetHeader = {
    formatVersion: FORMAT_VERSION,
    assetKind: 'series',
    bundleVersion: 'test',
    headerByteLength: 0,
    dataByteLength: data.byteLength,
    descriptors: [descriptor],
  }
  return { buffer: data.buffer as ArrayBuffer, header }
}

function buildFakeBundle(dayCount: number): LoadedBundle {
  const startDay = toDaysSinceEpoch('2020-01-01')
  const days = new Int32Array(dayCount)
  for (let i = 0; i < dayCount; i++) days[i] = startDay + i

  const indexValues = Array.from({ length: dayCount }, (_, i) => 100 + i * 0.1)
  const fundValues = Array.from({ length: dayCount }, (_, i) => 50 + i * 0.05)
  const rateValues = Array.from({ length: dayCount }, () => 5)

  const indexAsset = buildFakeSeriesAsset('FAKE/total-return', 'total-return', 0, indexValues)
  const fundAsset = buildFakeSeriesAsset('FAKEFUND/total-return', 'total-return', 0, fundValues)
  const rateAsset = buildFakeSeriesAsset('@rate/rate', 'rate', 0, rateValues)

  const firstDate = fromDaysSinceEpoch(days[0]!)
  const lastDate = fromDaysSinceEpoch(days[dayCount - 1]!)

  const manifest: Manifest = {
    formatVersion: FORMAT_VERSION,
    bundleVersion: 'test',
    calendar: { file: 'calendar.bin', bytes: 0, length: dayCount, firstDate, lastDate },
    assets: [
      { file: 'fake-index.bin', bytes: 0, series: ['FAKE/total-return'] },
      { file: 'fake-fund.bin', bytes: 0, series: ['FAKEFUND/total-return'] },
      { file: 'fake-rate.bin', bytes: 0, series: ['@rate/rate'] },
    ],
    series: [
      {
        id: 'FAKE/total-return',
        scope: 'FAKE',
        kind: 'total-return',
        asset: 'fake-index.bin',
        calendarStartIndex: 0,
        length: dayCount,
        firstDate,
        lastDate,
        units: 'level',
        sources: [],
        seams: [],
        tiers: { strict: null, extended: null },
      },
      {
        id: 'FAKEFUND/total-return',
        scope: 'FAKEFUND',
        kind: 'total-return',
        asset: 'fake-fund.bin',
        calendarStartIndex: 0,
        length: dayCount,
        firstDate,
        lastDate,
        units: 'level',
        sources: [],
        seams: [],
        tiers: { strict: null, extended: null },
      },
      {
        id: '@rate/rate',
        scope: '@rate',
        kind: 'rate',
        asset: 'fake-rate.bin',
        calendarStartIndex: 0,
        length: dayCount,
        firstDate,
        lastDate,
        units: 'percent',
        sources: [],
        seams: [],
        tiers: { strict: null, extended: null },
      },
    ],
    calendarExceptions: [],
  }

  const assets = new Map<string, { buffer: ArrayBuffer; header: AssetHeader }>()
  assets.set('fake-index.bin', indexAsset)
  assets.set('fake-fund.bin', fundAsset)
  assets.set('fake-rate.bin', rateAsset)

  return { manifest, calendar: days, assets }
}

describe('resolveOverlapWindow: too-short-overlap failure path', () => {
  test('throws a stated failure naming the resolved window and the shortfall, never returning a silently short window', () => {
    const fakeBundle = buildFakeBundle(400) // ~1.1 years, well below MIN_OVERLAP_YEARS
    expect(() => resolveOverlapWindow(fakeBundle, 'FAKE/total-return', 'FAKEFUND/total-return')).toThrow(
      /below the required 15/,
    )
  })

  test('a window whose span clears MIN_OVERLAP_YEARS does not throw', () => {
    const fakeBundle = buildFakeBundle(16 * 365) // ~16 years, above MIN_OVERLAP_YEARS
    const window = resolveOverlapWindow(fakeBundle, 'FAKE/total-return', 'FAKEFUND/total-return')
    expect(window.years).toBeGreaterThanOrEqual(MIN_OVERLAP_YEARS)
  })
})
