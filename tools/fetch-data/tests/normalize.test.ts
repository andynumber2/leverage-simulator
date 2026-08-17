import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  normalizeFred,
  normalizeShillerDividendYield,
  normalizeStooq,
  parseShillerCsv,
  toCanonicalCsv,
} from '../src/normalize.ts'
import { fetchText } from '../src/fetch.ts'
import { loadSidecarOrThrow } from '../../bundle-compiler/src/raw-input.ts'

describe('normalizeStooq', () => {
  test('extracts date and close, dropping every other column', () => {
    const csv = ['Date,Open,High,Low,Close,Volume', '2009-06-25,39.87,40.35,38.85,39.61,15000', '2009-06-26,39.61,40.00,39.00,39.90,12000'].join('\n')
    const rows = normalizeStooq(csv)
    expect(rows).toEqual([
      { date: '2009-06-25', value: 39.61 },
      { date: '2009-06-26', value: 39.9 },
    ])
  })

  test('throws naming the header when Close is absent', () => {
    const csv = ['Date,Open,High,Low,Volume', '2009-06-25,39.87,40.35,38.85,15000'].join('\n')
    expect(() => normalizeStooq(csv)).toThrowError(/Date.*Close.*header/)
  })

  test('throws naming the header when Date is absent', () => {
    const csv = ['Open,High,Low,Close,Volume', '39.87,40.35,38.85,39.61,15000'].join('\n')
    expect(() => normalizeStooq(csv)).toThrowError(/Date.*Close.*header/)
  })

  test('throws naming the line when Close is not finite', () => {
    const csv = ['Date,Open,High,Low,Close,Volume', '2009-06-25,39.87,40.35,38.85,n/a,15000'].join('\n')
    expect(() => normalizeStooq(csv)).toThrowError(/line 2/)
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
    // Fixture reproducing Shiller's documented column semantics (P = nominal price level, D =
    // trailing-twelve-month nominal dividend sum). Not a live-pulled Shiller row: this session
    // has no network path to econ.yale.edu (see sources.ts header comment). The point pinned
    // here is the arithmetic contract (D/P, never D*12/P), not a specific historical value.
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
    const csv = ['Date,P,D,E', '1871.1,4.44,0.26,0.4'].join('\n')
    const rows = parseShillerCsv(csv)
    expect(rows).toEqual([{ date: '1871-01-01', price: 4.44, dividend: 0.26 }])
  })

  test('stops at a blank-date trailing row rather than throwing', () => {
    const csv = ['Date,P,D,E', '1871.01,4.44,0.26,0.4', ',,,', 'Source: some footnote'].join('\n')
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

describe('sidecar round trip', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'fetch-data-sidecar-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('a sidecar built the way fetch.ts builds it validates against loadSidecarOrThrow unmodified', () => {
    const csvPath = path.join(tmpDir, 'SPX-PR.csv')
    const sidecarPath = path.join(tmpDir, 'SPX-PR.meta.json')
    writeFileSync(csvPath, 'date,value\n1928-01-03,17.76\n')
    writeFileSync(
      sidecarPath,
      JSON.stringify({
        source: 'Stooq',
        url: 'https://stooq.com/q/d/l/?s=%5Espx&i=d',
        retrievedAt: '2026-08-17',
        seriesKind: 'price',
        license: 'Permissive for personal use; redistribution terms unclear (accepted risk, D-05/D-06)',
        termsUrl: 'https://stooq.com/legal/',
        scope: 'SPX',
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
})
