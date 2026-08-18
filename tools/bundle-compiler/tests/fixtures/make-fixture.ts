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
  /** Overrides the fixture-level `dates` for this series only, e.g. to punch a hole or add an
   * extra bar. When omitted, the series uses the shared fixture-level date list. */
  dates?: string[]
  values?: number[]
  /** Overrides the CSV filename stem (default: `${scope}-${seriesKind}`). Needed for the four
   * rate sources, whose raw stems (`RATE-DFF`, `RATE-DTB3`, `RATE-TB3MS`, `RATE-NBER`) do not
   * follow that pattern (plan 02-04, RATE_SOURCE_PRECEDENCE). */
  filenameStem?: string
}

export interface MakeRawFixtureOptions {
  series?: FixtureSeriesSpec[]
  dates?: string[]
}

export interface RawFixture {
  dir: string
  scopes: string[]
  /** Parsed expected values as the fixture wrote them, keyed by `${scope}/${binaryKind}` (the
   * same id shape a compiled manifest series carries, e.g. `"AAA/price-return"`, `"@rate/rate"`)
   * -- not by bare scope, since one scope can carry more than one compiled series (D-15 requires
   * every price-return scope to also carry a total-return series). */
  expected: Record<string, { dates: string[]; values: number[] }>
}

const SIDECAR_KIND_TO_BINARY_KIND: Record<FixtureSeriesSpec['seriesKind'], string> = {
  price: 'price-return',
  'total-return': 'total-return',
  rate: 'rate',
  'dividend-monthly': 'dividend-monthly', // never a compiled series id; present only for completeness
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

/**
 * Plan 02-04 wires `buildShortRateSeries` into `compileBundle` unconditionally: a real compile
 * always needs all four `RATE_SOURCE_PRECEDENCE` raw stems present. Every default fixture caller
 * (including plans 02-01/02-02's pre-existing tests) now gets a minimal, valid four-source rate
 * stack for free. `RATE-DFF` (rank 1, no ceiling above it) is given the shared fixture-level
 * `dates` in full, so it alone covers the whole fixture calendar range and the compiled `@rate`
 * series is byte-identical to `RATE-DFF`'s own fixture values -- the other three ranks share the
 * same start date and so resolve to empty/unused windows by the precedence rule (rate-series.ts),
 * harmless for a fixture that isn't itself testing rate-source precedence (see
 * rate-series.test.ts for that).
 */
export const DEFAULT_RATE_SERIES: FixtureSeriesSpec[] = [
  { scope: 'RATE', seriesKind: 'rate', units: 'percent-annualized', filenameStem: 'RATE-DFF' },
  { scope: 'RATE', seriesKind: 'rate', units: 'percent-annualized', filenameStem: 'RATE-DTB3' },
  { scope: 'RATE', seriesKind: 'rate', units: 'percent-annualized', filenameStem: 'RATE-TB3MS' },
  { scope: 'RATE', seriesKind: 'rate', units: 'percent-annualized', filenameStem: 'RATE-NBER' },
]

/**
 * D-15 requires every scope carrying a price-return series to also carry a total-return series
 * (constructed or sourced). AAA/BBB each get a plain total-return sibling covering the identical
 * fixture-level `dates`, so `applyGapPolicy` sees no gap and no total-return construction is
 * triggered (no dividend-monthly input is present for either scope) -- the default fixture stays
 * the simplest possible D-15-compliant shape.
 */
const DEFAULT_SERIES: FixtureSeriesSpec[] = [
  { scope: 'AAA', seriesKind: 'price', units: 'index-level' },
  { scope: 'AAA', seriesKind: 'total-return', units: 'index-level' },
  { scope: 'BBB', seriesKind: 'price', units: 'index-level' },
  { scope: 'BBB', seriesKind: 'total-return', units: 'index-level' },
  ...DEFAULT_RATE_SERIES,
]

export function makeRawFixture(options: MakeRawFixtureOptions = {}): RawFixture {
  const dir = mkdtempSync(path.join(tmpdir(), 'bundle-compiler-fixture-'))
  const dates = options.dates ?? makeTradingDates(30)
  const specs = options.series ?? DEFAULT_SERIES

  const expected: RawFixture['expected'] = {}
  const scopes: string[] = []

  specs.forEach((spec, index) => {
    scopes.push(spec.scope)
    const seriesDates = spec.dates ?? dates
    const values = spec.values ?? seriesDates.map((_, i) => (spec.seriesKind === 'rate' ? 1 + i * 0.001 : 100 + index * 10 + i * 0.5))
    const filenameStem = spec.filenameStem ?? `${spec.scope}-${spec.seriesKind}`

    const csvLines = ['date,value', ...seriesDates.map((date, i) => `${date},${values[i]}`)]
    const csvPath = path.join(dir, `${filenameStem}.csv`)
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

    const binaryKind = SIDECAR_KIND_TO_BINARY_KIND[spec.seriesKind]
    expected[`${spec.scope}/${binaryKind}`] = { dates: seriesDates, values }
    // The compiled rate series is emitted under the synthetic "@rate" scope, not "RATE"; alias
    // RATE-DFF's expected values under that id so a generic "look up by manifest entry id" test
    // (roundtrip.test.ts) finds a match, matching the "DFF alone covers everything" fixture design
    // documented above.
    if (filenameStem === 'RATE-DFF') {
      expected['@rate/rate'] = { dates: seriesDates, values }
    }
  })

  return { dir, scopes, expected }
}
