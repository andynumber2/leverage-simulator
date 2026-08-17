/**
 * tools/bundle-compiler/tests/fixtures/make-fixture.ts
 *
 * `makeRawFixture(overrides)` builder in the style of `tests/kernel.test.ts`'s `makeFixedSeries`.
 * Writes a temporary raw directory holding a deliberately short series (~30 trading days) for two
 * scopes plus their sidecars, and returns the directory path and the parsed expected values.
 * Build each fixture per test; fixtures are not shared or mutated across tests.
 */

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export interface FixtureSeriesSpec {
  scope: string
  seriesKind: 'price' | 'total-return' | 'rate' | 'dividend-monthly'
  units: 'index-level' | 'percent-annualized' | 'ratio'
  values?: number[]
}

export interface MakeRawFixtureOptions {
  series?: FixtureSeriesSpec[]
  dates?: string[]
}

export interface RawFixture {
  dir: string
  scopes: string[]
  /** Parsed expected values per scope, as the fixture wrote them, keyed by scope. */
  expected: Record<string, { dates: string[]; values: number[] }>
}

function makeTradingDates(count: number): string[] {
  const dates: string[] = []
  const cursor = new Date(Date.UTC(2020, 0, 2)) // 2020-01-02, a Thursday
  while (dates.length < count) {
    const day = cursor.getUTCDay()
    if (day !== 0 && day !== 6) {
      dates.push(cursor.toISOString().slice(0, 10))
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

const DEFAULT_SERIES: FixtureSeriesSpec[] = [
  { scope: 'AAA', seriesKind: 'price', units: 'index-level' },
  { scope: 'BBB', seriesKind: 'price', units: 'index-level' },
]

export function makeRawFixture(options: MakeRawFixtureOptions = {}): RawFixture {
  const dir = mkdtempSync(path.join(tmpdir(), 'bundle-compiler-fixture-'))
  const dates = options.dates ?? makeTradingDates(30)
  const specs = options.series ?? DEFAULT_SERIES

  const expected: RawFixture['expected'] = {}
  const scopes: string[] = []

  specs.forEach((spec, index) => {
    scopes.push(spec.scope)
    const values = spec.values ?? dates.map((_, i) => 100 + index * 10 + i * 0.5)

    const csvLines = ['date,value', ...dates.map((date, i) => `${date},${values[i]}`)]
    const csvPath = path.join(dir, `${spec.scope}-${spec.seriesKind}.csv`)
    writeFileSync(csvPath, `${csvLines.join('\n')}\n`)

    const sidecar = {
      source: 'Fixture',
      url: 'https://example.test/fixture',
      retrievedAt: '2026-01-01',
      seriesKind: spec.seriesKind,
      license: 'Public Domain',
      termsUrl: 'https://example.test/terms',
      scope: spec.scope,
      units: spec.units,
    }
    writeFileSync(csvPath.replace(/\.csv$/, '.meta.json'), JSON.stringify(sidecar, null, 2))

    expected[spec.scope] = { dates, values }
  })

  return { dir, scopes, expected }
}
