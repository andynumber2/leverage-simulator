/**
 * tools/fetch-data/tests/cross-check.test.ts
 *
 * Standing vendor cross-checks (D-04, D-14, T-02-37). Both bundled total-return series must agree
 * with their price-return sibling almost exactly on their first shared bar, then pull ahead of it
 * monotonically at every calendar year's last shared bar, never back. That is the signature of a
 * real total-return series. A price series mislabelled as total return sits on top of its price
 * sibling at every year end and produces a final normalized ratio of one - which is precisely what
 * the previous equity vendor's data would have shown, had this check existed before that vendor's
 * dividend-adjusted column, served under a price label, reached twenty-two committed files (see
 * `02-CONTEXT.md`'s "Source Stack Reversal"). This is the check that would have caught it, before
 * a single file was committed.
 *
 * Both checks read the real committed vendor files under `raw/manual/`, not fixtures, so a
 * refresh that quietly changes the data is what makes a run here fail - not a fixture someone
 * forgot to update.
 *
 * Assertion is on year ends, not on every bar: the two indices in each pair round independently,
 * so daily quotients wander by fractions of a basis point for reasons unrelated to dividends, and
 * a strict day-over-day monotonicity assertion would be false for the wrong reason.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import { normalizeNasdaq, parseYahooChart, type CanonicalRow } from '../src/normalize.ts'

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..')

const GSPC_JSON_TEXT = readFileSync(path.join(REPO_ROOT, 'raw/manual/GSPC.json'), 'utf8')
const SP500TR_JSON_TEXT = readFileSync(path.join(REPO_ROOT, 'raw/manual/SP500TR.json'), 'utf8')
const NDX_JSON_TEXT = readFileSync(path.join(REPO_ROOT, 'raw/manual/NDX.json'), 'utf8')
const XNDX_CSV_TEXT = readFileSync(path.join(REPO_ROOT, 'raw/manual/XNDX.csv'), 'utf8')

interface YearEndDivergence {
  firstSharedDate: string
  firstSharedRelDiff: number
  yearEndDecreases: number
  yearCount: number
  finalNormalizedRatio: number
}

/**
 * Builds the shared-bar set between a price series and its total-return sibling, measures the
 * first-shared-bar relative difference, then walks the last shared bar of each calendar year to
 * compute the total-return/price quotient, normalized by that same quotient on the first shared
 * bar (so the sequence starts at exactly one and rises as dividends accumulate). Counts every
 * year-over-year decrease in that normalized sequence: zero is the real-total-return signature; a
 * price series relabelled as total return produces a constant sequence of ones instead.
 */
function checkYearEndDivergence(priceRows: CanonicalRow[], totalReturnRows: CanonicalRow[]): YearEndDivergence {
  const priceByDate = new Map(priceRows.map((r) => [r.date, r.value]))
  const trByDate = new Map(totalReturnRows.map((r) => [r.date, r.value]))
  const shared = [...priceByDate.keys()].filter((date) => trByDate.has(date)).sort()
  if (shared.length === 0) {
    throw new Error('checkYearEndDivergence: no shared bars between the two series')
  }

  const firstSharedDate = shared[0]!
  const firstPriceValue = priceByDate.get(firstSharedDate)!
  const firstTotalReturnValue = trByDate.get(firstSharedDate)!
  const firstSharedRelDiff = Math.abs(firstTotalReturnValue - firstPriceValue) / firstPriceValue
  const firstQuotient = firstTotalReturnValue / firstPriceValue

  const lastSharedDateByYear = new Map<string, string>()
  for (const date of shared) {
    lastSharedDateByYear.set(date.slice(0, 4), date)
  }
  const years = [...lastSharedDateByYear.keys()].sort()
  const normalizedRatios = years.map((year) => {
    const date = lastSharedDateByYear.get(year)!
    return trByDate.get(date)! / priceByDate.get(date)! / firstQuotient
  })

  let yearEndDecreases = 0
  for (let i = 1; i < normalizedRatios.length; i++) {
    if (normalizedRatios[i]! < normalizedRatios[i - 1]!) yearEndDecreases++
  }

  return {
    firstSharedDate,
    firstSharedRelDiff,
    yearEndDecreases,
    yearCount: years.length,
    finalNormalizedRatio: normalizedRatios[normalizedRatios.length - 1]!,
  }
}

describe('S&P total return against S&P price', () => {
  const priceChart = parseYahooChart(GSPC_JSON_TEXT)
  const trChart = parseYahooChart(SP500TR_JSON_TEXT)
  const priceRows: CanonicalRow[] = priceChart.dates.map((date, i) => ({ date, value: priceChart.closes[i]! }))
  const trRows: CanonicalRow[] = trChart.dates.map((date, i) => ({ date, value: trChart.closes[i]! }))
  const result = checkYearEndDivergence(priceRows, trRows)

  test('first shared bar is 1988-01-04 and the two values agree within 0.1 percent relative', () => {
    expect(result.firstSharedDate).toBe('1988-01-04')
    expect(result.firstSharedRelDiff).toBeLessThan(0.001)
  })

  test('the normalized year-end ratio never decreases across 39 year-ends, and the final ratio exceeds 1.10', () => {
    expect(result.yearCount).toBe(39)
    expect(result.yearEndDecreases).toBe(0)
    expect(result.finalNormalizedRatio).toBeGreaterThan(1.1)
  })
})

describe('Nasdaq-100 total return against Nasdaq-100 price', () => {
  const priceChart = parseYahooChart(NDX_JSON_TEXT)
  const priceRows: CanonicalRow[] = priceChart.dates.map((date, i) => ({ date, value: priceChart.closes[i]! }))
  const trRows = normalizeNasdaq(XNDX_CSV_TEXT).rows
  const result = checkYearEndDivergence(priceRows, trRows)

  test('first shared bar is 1999-03-04 and the two values agree within 0.1 percent relative', () => {
    expect(result.firstSharedDate).toBe('1999-03-04')
    expect(result.firstSharedRelDiff).toBeLessThan(0.001)
  })

  test('the normalized year-end ratio never decreases across 28 year-ends, and the final ratio exceeds 1.10', () => {
    expect(result.yearCount).toBe(28)
    expect(result.yearEndDecreases).toBe(0)
    expect(result.finalNormalizedRatio).toBeGreaterThan(1.1)
  })
})

describe('negative control: the year-end check is load-bearing', () => {
  test('fails to clear the divergence thresholds when the total-return series is a copy of its price series', () => {
    const priceRows: CanonicalRow[] = [
      { date: '2020-01-02', value: 100 },
      { date: '2020-12-31', value: 110 },
      { date: '2021-06-15', value: 90 },
      { date: '2021-12-31', value: 120 },
    ]
    const copiedTotalReturnRows: CanonicalRow[] = priceRows.map((row) => ({ ...row }))

    const result = checkYearEndDivergence(priceRows, copiedTotalReturnRows)

    // A price series relabelled as total return sits on top of its price sibling at every year
    // end: the normalized ratio never moves off one, and the "final ratio above 1.10" assertion
    // that catches a real total-return series is exactly what would have caught this.
    expect(result.finalNormalizedRatio).toBeCloseTo(1, 10)
    expect(() => expect(result.finalNormalizedRatio).toBeGreaterThan(1.1)).toThrow()
  })
})
