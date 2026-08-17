import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  MAX_RECONSTRUCTION_DRIFT,
  measureReconstructionDrift,
  normalizeFred,
  normalizeShillerDividendYield,
  normalizeYahoo,
  parseShillerCsv,
  parseYahooChart,
  reconstructYahooTotalReturn,
  toCanonicalCsv,
  type YahooChart,
} from '../src/normalize.ts'
import { fetchText, resolveSource } from '../src/fetch.ts'
import type { SourceSpec } from '../src/sources.ts'
import { loadSidecarOrThrow } from '../../bundle-compiler/src/raw-input.ts'

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..')
const QQQ_JSON_PATH = path.join(REPO_ROOT, 'raw', 'manual', 'QQQ.json')
const QQQ_JSON_TEXT = readFileSync(QQQ_JSON_PATH, 'utf8')

function tsFor(y: number, m: number, d: number, hourUtc = 14, minuteUtc = 30): number {
  return Math.floor(Date.UTC(y, m - 1, d, hourUtc, minuteUtc) / 1000)
}

interface FixtureBar {
  ts: number
  close: number
  adjclose: number
}

interface FixtureOptions {
  symbol?: string
  bars: FixtureBar[]
  dividends?: { ts: number; amount: number }[]
  splits?: { ts: number; numerator: number; denominator: number }[]
  chartError?: unknown
  extraDividendKeys?: Record<string, unknown>
}

function makeYahooChartJson(opts: FixtureOptions): string {
  const dividends: Record<string, unknown> = { ...opts.extraDividendKeys }
  for (const d of opts.dividends ?? []) {
    dividends[String(d.ts)] = { amount: d.amount, date: d.ts }
  }
  const splits: Record<string, unknown> = {}
  for (const s of opts.splits ?? []) {
    splits[String(s.ts)] = {
      date: s.ts,
      numerator: s.numerator,
      denominator: s.denominator,
      splitRatio: `${s.numerator}:${s.denominator}`,
    }
  }
  const payload = {
    chart: {
      result: opts.chartError
        ? null
        : [
            {
              meta: { symbol: opts.symbol ?? 'TEST' },
              timestamp: opts.bars.map((b) => b.ts),
              events: { dividends, splits },
              indicators: {
                quote: [{ close: opts.bars.map((b) => b.close) }],
                adjclose: [{ adjclose: opts.bars.map((b) => b.adjclose) }],
              },
            },
          ],
      error: opts.chartError ?? null,
    },
  }
  return JSON.stringify(payload)
}

describe('parseYahooChart', () => {
  test('parses the committed real QQQ.json into 6902 bars from 1999-03-10 to 2026-08-17 with 89 dividends and 1 split', () => {
    const chart = parseYahooChart(QQQ_JSON_TEXT)
    expect(chart.dates).toHaveLength(6902)
    expect(chart.dates[0]).toBe('1999-03-10')
    expect(chart.dates[chart.dates.length - 1]).toBe('2026-08-17')
    expect(chart.dividends.size).toBe(89)
    expect(chart.splits.size).toBe(1)
  })

  test('the America/New_York conversion agrees with a bare UTC conversion on every bar of the real QQQ file', () => {
    const raw = JSON.parse(QQQ_JSON_TEXT) as {
      chart: { result: [{ timestamp: number[] }] }
    }
    const chart = parseYahooChart(QQQ_JSON_TEXT)
    const utcFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const timestamps = raw.chart.result[0]!.timestamp
    for (let i = 0; i < timestamps.length; i++) {
      const utcDate = utcFormatter.format(new Date(timestamps[i]! * 1000))
      expect(chart.dates[i]).toBe(utcDate)
    }
  })

  test('throws when chart.error is non-null', () => {
    const json = makeYahooChartJson({ bars: [{ ts: tsFor(2020, 1, 2), close: 10, adjclose: 10 }] })
    const parsed = JSON.parse(json)
    parsed.chart.error = { code: 'Not Found', description: 'No data found' }
    expect(() => parseYahooChart(JSON.stringify(parsed))).toThrowError(/chart\.error/)
  })

  test('throws when chart.result is absent or empty', () => {
    expect(() => parseYahooChart(JSON.stringify({ chart: { result: [], error: null } }))).toThrowError(
      /result is absent or empty/,
    )
  })

  test('throws when the close array is shorter than the timestamp array', () => {
    const json = makeYahooChartJson({
      bars: [
        { ts: tsFor(2020, 1, 2), close: 10, adjclose: 10 },
        { ts: tsFor(2020, 1, 3), close: 11, adjclose: 11 },
      ],
    })
    const parsed = JSON.parse(json)
    parsed.chart.result[0].indicators.quote[0].close = [10]
    expect(() => parseYahooChart(JSON.stringify(parsed))).toThrowError(/different lengths/)
  })

  test('throws when a close is null', () => {
    const json = makeYahooChartJson({
      bars: [
        { ts: tsFor(2020, 1, 2), close: 10, adjclose: 10 },
        { ts: tsFor(2020, 1, 3), close: 11, adjclose: 11 },
      ],
    })
    const parsed = JSON.parse(json)
    parsed.chart.result[0].indicators.quote[0].close[1] = null
    expect(() => parseYahooChart(JSON.stringify(parsed))).toThrowError(/is null, non-finite or not greater than zero/)
  })

  test('throws when timestamps are not strictly ascending', () => {
    const json = makeYahooChartJson({
      bars: [
        { ts: tsFor(2020, 1, 3), close: 10, adjclose: 10 },
        { ts: tsFor(2020, 1, 2), close: 11, adjclose: 11 },
      ],
    })
    expect(() => parseYahooChart(json)).toThrowError(/not strictly ascending/)
  })

  test('a chart payload carrying a "__proto__" key does not alter the returned object prototype', () => {
    const json = makeYahooChartJson({
      bars: [{ ts: tsFor(2020, 1, 2), close: 10, adjclose: 10 }],
      extraDividendKeys: { __proto__: { amount: 999, date: tsFor(2020, 1, 2) } },
    })
    const chart = parseYahooChart(json)
    expect(Object.getPrototypeOf(chart)).toBe(Object.prototype)
    expect(Object.getPrototypeOf({})).toBe(Object.prototype)
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
  })
})

describe('normalizeYahoo', () => {
  test('returns one row per bar carrying the raw close, ascending, no duplicates', () => {
    const rows = normalizeYahoo(QQQ_JSON_TEXT)
    expect(rows).toHaveLength(6902)
    expect(rows[0]!.date).toBe('1999-03-10')
    const dates = new Set(rows.map((r) => r.date))
    expect(dates.size).toBe(rows.length)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.date > rows[i - 1]!.date).toBe(true)
    }
  })
})

describe('reconstructYahooTotalReturn', () => {
  function makeChart(overrides: Partial<YahooChart> = {}): YahooChart {
    return {
      symbol: 'TEST',
      dates: ['2020-01-02', '2020-01-03', '2020-01-06'],
      closes: [100, 102, 101],
      adjCloses: [99, 101, 100],
      dividends: new Map(),
      splits: new Map(),
      ...overrides,
    }
  }

  test('seeds at the first bar raw close, exactly matching normalizeYahoo first row', () => {
    const chart = parseYahooChart(QQQ_JSON_TEXT)
    const tr = reconstructYahooTotalReturn(chart)
    const pr = normalizeYahoo(QQQ_JSON_TEXT)
    expect(tr[0]!.value).toBe(pr[0]!.value)
  })

  test('on a three-bar fixture with one dividend on the middle bar, the second level equals seed * (close2 + dividend) / close1', () => {
    const chart = makeChart({
      dividends: new Map([['2020-01-03', 0.5]]),
    })
    const rows = reconstructYahooTotalReturn(chart)
    expect(rows[0]!.value).toBe(100)
    expect(rows[1]!.value).toBeCloseTo((100 * (102 + 0.5)) / 100, 10)
    expect(rows[2]!.value).toBeCloseTo((rows[1]!.value * (101 + 0)) / 102, 10)
  })

  test('throws naming the symbol and date when a dividend event date matches no bar', () => {
    const chart = makeChart({
      symbol: 'TEST',
      dividends: new Map([['2020-01-04', 1]]),
    })
    expect(() => reconstructYahooTotalReturn(chart)).toThrowError(/TEST.*2020-01-04/)
  })
})

describe('measureReconstructionDrift', () => {
  test('over the committed QQQ file, drift is under both the declared gate and a tighter per-symbol bound', () => {
    const chart = parseYahooChart(QQQ_JSON_TEXT)
    const tr = reconstructYahooTotalReturn(chart)
    const drift = measureReconstructionDrift(chart, tr)
    expect(drift.maxRelDeviation).toBeLessThan(MAX_RECONSTRUCTION_DRIFT)
    expect(drift.maxRelDeviation).toBeLessThan(0.0002)
  })

  test('exceeds MAX_RECONSTRUCTION_DRIFT on a fixture with one dividend removed, so the gate is proved load-bearing', () => {
    // A single real-world QQQ dividend is too small a fraction of price (well under the 0.5%
    // gate) to reliably trip the gate on its own. The point of this test is the gate's
    // mechanics, not a real-world magnitude. A hand-built fixture with flat prices and one
    // dividend worth 5% of price isolates that mechanic cleanly: the "true" adjusted-close path
    // is what a correct reconstruction (with the dividend) would have produced, and a damaged
    // reconstruction that omits the same dividend event must diverge from it by the
    // dividend/price fraction, far past the 0.5% tolerance.
    const dates = ['2020-01-02', '2020-01-03', '2020-01-06']
    const closes = [100, 100, 100]
    const trueChart: YahooChart = {
      symbol: 'FIXTURE',
      dates,
      closes,
      adjCloses: [100, 100, 100],
      dividends: new Map([['2020-01-03', 5]]),
      splits: new Map(),
    }
    const trueReconstruction = reconstructYahooTotalReturn(trueChart)

    const damagedChart: YahooChart = {
      ...trueChart,
      adjCloses: trueReconstruction.map((r) => r.value),
      dividends: new Map(),
    }
    const damagedReconstruction = reconstructYahooTotalReturn(damagedChart)
    const drift = measureReconstructionDrift(damagedChart, damagedReconstruction)
    expect(drift.maxRelDeviation).toBeGreaterThan(MAX_RECONSTRUCTION_DRIFT)
  })
})

describe('normalizeFred', () => {
  test('drops a blank-field placeholder row rather than emitting blank/zero/NaN', () => {
    const csv = ['observation_date,DTB3', '2020-10-09,0.10', '2020-10-12,', '2020-10-13,0.11'].join('\n')
    const rows = normalizeFred(csv)
    expect(rows).toEqual([
      { date: '2020-10-09', value: 0.1 },
      { date: '2020-10-13', value: 0.11 },
    ])
  })

  test('drops a literal "." placeholder row', () => {
    const csv = ['observation_date,DFF', '1954-07-01,1.13', '1990-11-19,.', '1990-11-20,1.20'].join('\n')
    const rows = normalizeFred(csv)
    expect(rows).toEqual([
      { date: '1954-07-01', value: 1.13 },
      { date: '1990-11-20', value: 1.2 },
    ])
  })

  test('keys off column position, not header name', () => {
    const csv = ['observation_date,M1329AUSM193NNBR', '1920-01-01,4.50'].join('\n')
    const rows = normalizeFred(csv)
    expect(rows).toEqual([{ date: '1920-01-01', value: 4.5 }])
  })

  test('throws naming the line number when a value is present, non-numeric, and not the placeholder', () => {
    const csv = ['observation_date,DFF', '1954-07-01,notanumber'].join('\n')
    expect(() => normalizeFred(csv)).toThrowError(/line 2/)
  })
})

describe('normalizeShillerDividendYield', () => {
  test('derives yield as dividend / price (TTM-consistent), not dividend * 12', () => {
    const rows = normalizeShillerDividendYield([{ date: '1988-01-01', price: 250, dividend: 8.5 }])
    expect(rows).toEqual([{ date: '1988-01-01', value: 8.5 / 250 }])
  })

  test('pins the exact expected value for one known fixture row', () => {
    const rows = normalizeShillerDividendYield([{ date: '1929-09-01', price: 31.3, dividend: 1.35 }])
    expect(rows[0]!.value).toBeCloseTo(0.043131, 6)
  })

  test('a value roughly 12x too high is the documented Pitfall 1 signature, not the derived yield', () => {
    const [row] = normalizeShillerDividendYield([{ date: '1929-09-01', price: 31.3, dividend: 1.35 }])
    const wrongMonthlyTreatment = (1.35 * 12) / 31.3
    expect(row!.value).not.toBeCloseTo(wrongMonthlyTreatment, 3)
  })

  test('throws on non-positive price', () => {
    expect(() => normalizeShillerDividendYield([{ date: '1929-09-01', price: 0, dividend: 1.35 }])).toThrow(
      /non-positive price/,
    )
  })
})

describe('parseShillerCsv', () => {
  test('finds the header row past preamble lines and reads Date/P/D by name', () => {
    const csv = [
      'Shiller Online Data, updated monthly',
      'https://www.econ.yale.edu/~shiller/data.htm',
      '',
      'Date,P,D,E,CPI',
      '1871.01,4.44,0.26,0.4,12.46',
      '1871.10,4.60,0.27,0.4,12.55',
    ].join('\n')
    const rows = parseShillerCsv(csv)
    expect(rows).toEqual([
      { date: '1871-01-01', price: 4.44, dividend: 0.26 },
      { date: '1871-10-01', price: 4.6, dividend: 0.27 },
    ])
  })

  test('does not confuse "1871.1" (January, single-digit month) with October', () => {
    // NOTE: this pins the parser's *current* (buggy) left-padding behavior, which plan 02-06
    // Task 3 fixes at its root (right-pad the fraction, since "1871.1" is Shiller's own encoding
    // for October, not January). Left as-is here because Task 1 does not touch parseShillerCsv.
    const csv = ['Date,P,D,E', '1871.1,4.44,0.26,0.4'].join('\n')
    const rows = parseShillerCsv(csv)
    expect(rows).toEqual([{ date: '1871-01-01', price: 4.44, dividend: 0.26 }])
  })

  test('throws when no Date/P/D header row is found', () => {
    expect(() => parseShillerCsv('a,b,c\n1,2,3')).toThrowError(/header row/)
  })
})

describe('toCanonicalCsv', () => {
  test('emits the header line, LF endings and a trailing newline', () => {
    const csv = toCanonicalCsv([
      { date: '2020-01-01', value: 1 },
      { date: '2020-01-02', value: 2 },
    ])
    expect(csv).toBe('date,value\n2020-01-01,1\n2020-01-02,2\n')
    expect(csv.includes('\r')).toBe(false)
  })

  test('throws on unsorted rows', () => {
    expect(() =>
      toCanonicalCsv([
        { date: '2020-01-02', value: 2 },
        { date: '2020-01-01', value: 1 },
      ]),
    ).toThrowError(/ascending order/)
  })

  test('throws on a duplicate date', () => {
    expect(() =>
      toCanonicalCsv([
        { date: '2020-01-01', value: 1 },
        { date: '2020-01-01', value: 2 },
      ]),
    ).toThrowError(/duplicate date/)
  })
})

describe('fetchText transport rules', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  test('throws on a non-https url before reading any body', async () => {
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy as unknown as typeof fetch
    await expect(fetchText('http://example.com/data.csv')).rejects.toThrowError(/non-https/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('throws on a redirect to a non-https location before reading any body', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      status: 302,
      headers: new Headers({ location: 'http://example.com/data.csv' }),
    })
    global.fetch = fetchSpy as unknown as typeof fetch
    await expect(fetchText('https://example.com/data.csv')).rejects.toThrowError(/non-https/)
  })

  test('follows an https-to-https redirect', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        status: 301,
        headers: new Headers({ location: 'https://example.com/final.csv' }),
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: new Headers(),
        body: makeStreamFromText('date,value\n2020-01-01,1\n'),
      })
    global.fetch = fetchSpy as unknown as typeof fetch
    const text = await fetchText('https://example.com/data.csv')
    expect(text).toBe('date,value\n2020-01-01,1\n')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  test('throws naming the url and status on a non-200 response', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ status: 404, headers: new Headers() })
    global.fetch = fetchSpy as unknown as typeof fetch
    await expect(fetchText('https://example.com/missing.csv')).rejects.toThrowError(/404/)
  })

  test('aborts rather than buffering a response over the byte cap', async () => {
    const bigChunk = new Uint8Array(21 * 1024 * 1024)
    const fetchSpy = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers(),
      body: makeStreamFromChunks([bigChunk]),
    })
    global.fetch = fetchSpy as unknown as typeof fetch
    await expect(fetchText('https://example.com/huge.csv')).rejects.toThrowError(/byte cap/)
  })
})

function baseYahooSpec(overrides: Partial<SourceSpec> = {}): SourceSpec {
  return {
    stem: 'QQQ-PR',
    scope: 'QQQ',
    seriesKind: 'price',
    units: 'index-level',
    vendor: 'yahoo',
    vendorName: 'Yahoo Finance',
    url: 'https://query1.finance.yahoo.com/v8/finance/chart/QQQ',
    vendorColumn: 'close',
    license: 'Personal-use terms',
    termsUrl: 'https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html',
    route: 'live-with-manual-fallback',
    manualFile: 'QQQ.json',
    maxStalenessDays: 10,
    derivation: 'as-sourced',
    ...overrides,
  }
}

describe('resolveSource', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  test('on a Yahoo spec whose fetch throws, returns the manual file bytes and reports the manual route', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    global.fetch = fetchSpy as unknown as typeof fetch
    const resolution = await resolveSource(baseYahooSpec())
    expect(resolution.route).toBe('manual')
    expect(resolution.text).toBe(QQQ_JSON_TEXT)
  })

  test('on a spec whose fetch succeeds, reports the live route', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers(),
      body: makeStreamFromText(QQQ_JSON_TEXT),
    })
    global.fetch = fetchSpy as unknown as typeof fetch
    const resolution = await resolveSource(baseYahooSpec())
    expect(resolution.route).toBe('live')
    expect(resolution.text).toBe(QQQ_JSON_TEXT)
  })

  test('on a live-route spec, fetches over https with no fallback and throws on failure', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('DNS failure'))
    global.fetch = fetchSpy as unknown as typeof fetch
    const spec = baseYahooSpec({
      vendor: 'fred',
      route: 'live',
      manualFile: undefined,
      maxStalenessDays: undefined,
    })
    await expect(resolveSource(spec)).rejects.toThrowError(/DNS failure/)
  })
})

describe('sidecar round trip', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'fetch-data-sidecar-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('a sidecar built the way fetch.ts builds it validates against loadSidecarOrThrow unmodified', () => {
    const csvPath = path.join(tmpDir, 'QQQ-PR.csv')
    const sidecarPath = path.join(tmpDir, 'QQQ-PR.meta.json')
    writeFileSync(csvPath, 'date,value\n1999-03-10,51.0625\n')
    writeFileSync(
      sidecarPath,
      JSON.stringify({
        source: 'Yahoo Finance',
        url: 'https://query1.finance.yahoo.com/v8/finance/chart/QQQ',
        retrievedAt: '2026-08-17',
        seriesKind: 'price',
        license: 'Personal-use terms; chart endpoint is undocumented with no published redistribution grant (accepted risk, D-05/D-06)',
        termsUrl: 'https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html',
        scope: 'QQQ',
        units: 'index-level',
      }),
    )
    expect(() => loadSidecarOrThrow(csvPath)).not.toThrow()
  })

  test('a rate sidecar (scope RATE) validates too', () => {
    const csvPath = path.join(tmpDir, 'RATE-DFF.csv')
    writeFileSync(csvPath, 'date,value\n1954-07-01,1.13\n')
    writeFileSync(
      path.join(tmpDir, 'RATE-DFF.meta.json'),
      JSON.stringify({
        source: 'FRED (Federal Reserve Bank of St. Louis)',
        url: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFF',
        retrievedAt: '2026-08-17',
        seriesKind: 'rate',
        license: 'Public Domain (U.S. Government work)',
        termsUrl: 'https://fred.stlouisfed.org/legal/',
        scope: 'RATE',
        units: 'percent-annualized',
      }),
    )
    expect(() => loadSidecarOrThrow(csvPath)).not.toThrow()
  })

  test('a dividend-monthly sidecar (scope SPX, units ratio) validates', () => {
    const csvPath = path.join(tmpDir, 'SPX-DIV-MONTHLY.csv')
    writeFileSync(csvPath, 'date,value\n1871-01-01,0.058558\n')
    writeFileSync(
      path.join(tmpDir, 'SPX-DIV-MONTHLY.meta.json'),
      JSON.stringify({
        source: 'Robert Shiller (Yale)',
        url: 'https://www.econ.yale.edu/~shiller/data/ie_data.xls',
        retrievedAt: '2026-08-17',
        seriesKind: 'dividend-monthly',
        license: 'Publicly available academic dataset, explicitly redistributable (D-05)',
        termsUrl: 'https://www.econ.yale.edu/~shiller/data.htm',
        scope: 'SPX',
        units: 'ratio',
      }),
    )
    expect(() => loadSidecarOrThrow(csvPath)).not.toThrow()
  })

  test('the real raw/QQQ-PR.csv and raw/QQQ-TR.csv sidecars, once written by a run, validate unmodified', () => {
    const prCsv = path.join(REPO_ROOT, 'raw', 'QQQ-PR.csv')
    const trCsv = path.join(REPO_ROOT, 'raw', 'QQQ-TR.csv')
    if (!existsSync(prCsv) || !existsSync(trCsv)) {
      // Written by running `npm run fetch-data`, not by this test suite. Skip quietly when the
      // run hasn't happened yet in this checkout.
      return
    }
    expect(() => loadSidecarOrThrow(prCsv)).not.toThrow()
    expect(() => loadSidecarOrThrow(trCsv)).not.toThrow()
  })
})

function makeStreamFromText(text: string): ReadableStream<Uint8Array> {
  return makeStreamFromChunks([new TextEncoder().encode(text)])
}

function makeStreamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index]!)
        index++
      } else {
        controller.close()
      }
    },
  }) as unknown as ReadableStream<Uint8Array> & {
    getReader: () => ReadableStreamDefaultReader<Uint8Array>
  }
}
