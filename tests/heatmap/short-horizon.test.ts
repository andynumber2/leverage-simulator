/**
 * tests/heatmap/short-horizon.test.ts
 *
 * 07-09-PLAN.md Task 1: `src/heatmap/short-horizon.ts`'s pure, DOM-free surface --
 * `SHORT_HORIZON_BARS`, `SHORT_HORIZON_LABEL`, `shortHorizonColumn`. `paintShortHorizonRule` (the
 * one DOM-facing export) is exercised in `tests/app/ruin-and-horizon.browser.test.ts` instead,
 * since it needs a real canvas. Runs in the fast Node `unit` project.
 */

import { describe, expect, test } from 'vitest'

import { SHORT_HORIZON_BARS, SHORT_HORIZON_LABEL, shortHorizonColumn } from '../../src/heatmap/short-horizon.ts'
import { createSweepGrid, type SweepGridMeta } from '../../src/sweep/sweep-grid.ts'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** `endOfDataDate` minus `days` calendar days, via the same UTC-anchored arithmetic
 * `short-horizon.ts` itself uses -- kept independent (not imported) so this test is a genuine
 * check against the module's own documented calendar-day-to-bar conversion, not a tautology. */
function isoDateMinusDays(endOfDataDate: string, days: number): string {
  const parts = endOfDataDate.split('-').map(Number)
  const ms = Date.UTC(parts[0]!, parts[1]! - 1, parts[2]!) - days * MS_PER_DAY
  const date = new Date(ms)
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function testMeta(overrides: Partial<SweepGridMeta>): SweepGridMeta {
  return {
    bundleVersion: 'test',
    symbol: 'TEST',
    dividendReinvest: true,
    entryDates: [],
    leverages: [1, 2, 3, 4],
    holdingYears: 0,
    initialInvestment: 10_000,
    expenseRatioPercent: 0.9,
    financingSpreadPercent: 0.5,
    ruinedCount: 0,
    incompleteCount: 0,
    minMultiple: 0,
    maxMultiple: 0,
    clippedBelowCount: 0,
    clippedAboveCount: 0,
    holdMode: 'end-of-data',
    endOfDataDate: '2020-01-01',
    ...overrides,
  }
}

describe('SHORT_HORIZON_BARS / SHORT_HORIZON_LABEL', () => {
  test('SHORT_HORIZON_BARS is 756 (3 years at 252 bars/year)', () => {
    expect(SHORT_HORIZON_BARS).toBe(756)
  })

  test('SHORT_HORIZON_LABEL states the threshold as a number of years', () => {
    expect(SHORT_HORIZON_LABEL).toBe('Right of here: under 3 years held')
  })
})

describe('shortHorizonColumn', () => {
  // 20 columns, entryDates spaced 100 calendar days apart, each 2000 days before
  // endOfDataDate at column 0, decreasing to 100 days at column 19: crosses the
  // 1095.75-day (3-year) threshold strictly between column 9 (1100 days, still >=) and
  // column 10 (1000 days, <), a wide enough margin that leap-year rounding cannot move it.
  const endOfDataDate = '2020-01-01'
  const openEndedEntryDates = Array.from({ length: 20 }, (_, col) => isoDateMinusDays(endOfDataDate, 2000 - 100 * col))

  test('returns null for a fixed-period grid, even when the dates would otherwise cross the threshold', () => {
    const grid = createSweepGrid(20, 4, testMeta({ entryDates: openEndedEntryDates, holdMode: 'fixed', endOfDataDate }))
    expect(shortHorizonColumn(grid)).toBeNull()
  })

  test('returns the first open-ended column whose remaining horizon drops below the threshold', () => {
    const grid = createSweepGrid(20, 4, testMeta({ entryDates: openEndedEntryDates, holdMode: 'end-of-data', endOfDataDate }))
    expect(shortHorizonColumn(grid)).toBe(10)
  })

  test('the returned index is unchanged when every cell value and flag in the grid is replaced with different values', () => {
    const grid = createSweepGrid(20, 4, testMeta({ entryDates: openEndedEntryDates, holdMode: 'end-of-data', endOfDataDate }))
    const before = shortHorizonColumn(grid)

    grid.multiples.fill(999)
    grid.drawdowns.fill(0.99)
    grid.annualized.fill(0.99)
    grid.flags.fill(3) // CELL_FLAG_RUINED | CELL_FLAG_INCOMPLETE on every cell

    expect(shortHorizonColumn(grid)).toBe(before)
    expect(before).toBe(10)
  })

  test('returns null in open-ended mode when no column crosses the threshold (every entry date leaves at least the threshold horizon)', () => {
    // Every column at least 5 years (1826 days) from endOfDataDate: none crosses the 3-year line.
    const farEntryDates = Array.from({ length: 5 }, (_, col) => isoDateMinusDays(endOfDataDate, 1826 + 10 * col))
    const grid = createSweepGrid(5, 4, testMeta({ entryDates: farEntryDates, holdMode: 'end-of-data', endOfDataDate }))
    expect(shortHorizonColumn(grid)).toBeNull()
  })

  test('a grid too short to cross the threshold returns null rather than a negative index', () => {
    // Every entry date is only weeks from endOfDataDate: all columns are already short-horizon,
    // so the "first crossing" is column 0, never a negative or out-of-range index.
    const shortEntryDates = ['2019-12-01', '2019-12-15', '2019-12-25']
    const grid = createSweepGrid(3, 2, testMeta({ entryDates: shortEntryDates, holdMode: 'end-of-data', endOfDataDate }))
    const result = shortHorizonColumn(grid)
    expect(result).not.toBeLessThan(0)
    expect(result).toBe(0)
  })
})
