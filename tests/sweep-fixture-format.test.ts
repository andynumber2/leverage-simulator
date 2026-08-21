/**
 * tests/sweep-fixture-format.test.ts
 *
 * 06-01-PLAN.md Task 2: pure-function coverage for `src/data/sweep-fixture-format.ts`'s
 * encode/decode round-trip and its fail-loud decode contract (T-06-01, T-06-02). Runs in the
 * fast Node `unit` project. Builds a small synthetic fixture in memory for the round-trip and
 * error cases, then separately reads the committed
 * `.planning/phases/06-heatmap-design-pass/mockups/sweep-fixture.bin` from disk and asserts its
 * decoded geometry and axis endpoints against the manifest, so a regenerated fixture that
 * silently changed shape fails the build.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

import {
  CELL_FLAG_INCOMPLETE,
  CELL_FLAG_RUINED,
  SWEEP_FORMAT_VERSION,
  SWEEP_MAGIC,
  SweepFixtureFormatError,
  decodeSweepFixture,
  encodeSweepFixture,
  type SweepFixture,
  type SweepFixtureMeta,
} from '../src/data/sweep-fixture-format.ts'

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const COMMITTED_FIXTURE_PATH = path.join(
  REPO_ROOT,
  '.planning/phases/06-heatmap-design-pass/mockups/sweep-fixture.bin',
)
const MANIFEST_PATH = path.join(REPO_ROOT, 'public/data/manifest.f0a9dfbdfa.json')

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

function makeSyntheticFixture(cols: number, rows: number): SweepFixture {
  const cellCount = cols * rows
  const multiples = new Float32Array(cellCount)
  const drawdowns = new Float32Array(cellCount)
  const flags = new Uint8Array(cellCount)
  for (let i = 0; i < cellCount; i++) {
    multiples[i] = i * 0.01 - 3
    drawdowns[i] = (i % 100) / 100
    flags[i] = i % 7 === 0 ? CELL_FLAG_RUINED : i % 5 === 0 ? CELL_FLAG_INCOMPLETE : 0
  }

  const meta: SweepFixtureMeta = {
    bundleVersion: 'test-bundle-version',
    symbol: 'SPX',
    dividendReinvest: true,
    entryDates: Array.from({ length: cols }, (_, i) => `2000-01-${String((i % 28) + 1).padStart(2, '0')}`),
    leverages: Array.from({ length: rows }, (_, i) => 1 + (i * 4) / (rows - 1)),
    holdingYears: 20,
    initialInvestment: 10_000,
    expenseRatioPercent: 0.9,
    financingSpreadPercent: 0.5,
    ruinedCount: flags.filter((f) => (f & CELL_FLAG_RUINED) !== 0).length,
    incompleteCount: flags.filter((f) => (f & CELL_FLAG_INCOMPLETE) !== 0).length,
    minMultiple: Math.min(...multiples),
    maxMultiple: Math.max(...multiples),
    clippedBelowCount: 0,
    clippedAboveCount: 0,
  }

  return { cols, rows, meta, multiples, drawdowns, flags }
}

describe('encodeSweepFixture / decodeSweepFixture: round-trip', () => {
  test('round-trips every meta field, every Float32 value bit-for-bit, and every flag byte', () => {
    const fixture = makeSyntheticFixture(7, 5)
    const encoded = encodeSweepFixture(fixture)
    const decoded = decodeSweepFixture(toArrayBuffer(Buffer.from(encoded)))

    expect(decoded.cols).toBe(fixture.cols)
    expect(decoded.rows).toBe(fixture.rows)
    expect(decoded.meta).toEqual(fixture.meta)
    expect(Array.from(decoded.multiples)).toEqual(Array.from(fixture.multiples))
    expect(Array.from(decoded.drawdowns)).toEqual(Array.from(fixture.drawdowns))
    expect(Array.from(decoded.flags)).toEqual(Array.from(fixture.flags))
  })

  test('encoding the same fixture twice produces byte-identical output', () => {
    const fixture = makeSyntheticFixture(5, 3)
    const first = encodeSweepFixture(fixture)
    const second = encodeSweepFixture(fixture)
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true)
  })
})

describe('decodeSweepFixture: fail-loud contract (T-06-01, T-06-02)', () => {
  function encodedBuffer(): Buffer {
    const fixture = makeSyntheticFixture(4, 3)
    return Buffer.from(encodeSweepFixture(fixture))
  }

  test('a wrong magic throws SweepFixtureFormatError naming both the found and expected value', () => {
    const bytes = encodedBuffer()
    bytes.writeUInt32LE(0xdeadbeef, 0)
    expect(() => decodeSweepFixture(toArrayBuffer(bytes))).toThrowError(SweepFixtureFormatError)
    try {
      decodeSweepFixture(toArrayBuffer(bytes))
      expect.unreachable('expected decodeSweepFixture to throw')
    } catch (err) {
      const message = (err as Error).message
      expect(message).toContain('0xdeadbeef')
      expect(message).toContain(SWEEP_MAGIC.toString(16))
    }
  })

  test('a wrong format version throws SweepFixtureFormatError naming both the found and expected value', () => {
    const bytes = encodedBuffer()
    bytes.writeUInt16LE(SWEEP_FORMAT_VERSION + 1, 4)
    expect(() => decodeSweepFixture(toArrayBuffer(bytes))).toThrowError(SweepFixtureFormatError)
    try {
      decodeSweepFixture(toArrayBuffer(bytes))
      expect.unreachable('expected decodeSweepFixture to throw')
    } catch (err) {
      const message = (err as Error).message
      expect(message).toContain(String(SWEEP_FORMAT_VERSION + 1))
      expect(message).toContain(String(SWEEP_FORMAT_VERSION))
    }
  })

  test('an unparseable meta block throws SweepFixtureFormatError', () => {
    const bytes = encodedBuffer()
    // Corrupt the first byte of the meta JSON block (offset 20) without changing metaByteLength,
    // so the buffer stays long enough to reach the parse attempt.
    bytes[20] = '!'.charCodeAt(0)
    expect(() => decodeSweepFixture(toArrayBuffer(bytes))).toThrowError(SweepFixtureFormatError)
  })

  test('a meta block whose entryDates length disagrees with cols throws SweepFixtureFormatError', () => {
    const fixture = makeSyntheticFixture(4, 3)
    const badMeta: SweepFixtureMeta = { ...fixture.meta, entryDates: fixture.meta.entryDates.slice(0, -1) }
    const encoded = encodeSweepFixture({ ...fixture, meta: badMeta })
    expect(() => decodeSweepFixture(toArrayBuffer(Buffer.from(encoded)))).toThrowError(SweepFixtureFormatError)
    try {
      decodeSweepFixture(toArrayBuffer(Buffer.from(encoded)))
      expect.unreachable('expected decodeSweepFixture to throw')
    } catch (err) {
      const message = (err as Error).message
      expect(message).toContain('entryDates')
      expect(message).toContain(String(fixture.cols))
    }
  })

  test('a meta block whose leverages length disagrees with rows throws SweepFixtureFormatError', () => {
    const fixture = makeSyntheticFixture(4, 3)
    const badMeta: SweepFixtureMeta = { ...fixture.meta, leverages: [...fixture.meta.leverages, 9] }
    const encoded = encodeSweepFixture({ ...fixture, meta: badMeta })
    expect(() => decodeSweepFixture(toArrayBuffer(Buffer.from(encoded)))).toThrowError(SweepFixtureFormatError)
  })

  test('a buffer truncated by one byte throws SweepFixtureFormatError', () => {
    const bytes = encodedBuffer()
    const truncated = bytes.subarray(0, bytes.length - 1)
    expect(() => decodeSweepFixture(toArrayBuffer(Buffer.from(truncated)))).toThrowError(SweepFixtureFormatError)
  })
})

describe('the committed sweep-fixture.bin', () => {
  test('decodes with cols 200, rows 50, leverages[0] 1, leverages[49] 5, and entryDates[0] equal to the manifest strict firstDate', () => {
    const bytes = readFileSync(COMMITTED_FIXTURE_PATH)
    const decoded = decodeSweepFixture(toArrayBuffer(bytes))

    expect(decoded.cols).toBe(200)
    expect(decoded.rows).toBe(50)
    expect(decoded.meta.leverages[0]).toBe(1)
    expect(decoded.meta.leverages[49]).toBe(5)

    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as {
      series: Array<{ id: string; tiers: { strict: { firstDate: string; lastDate: string } | null } }>
    }
    const seriesEntry = manifest.series.find((s) => s.id === 'SPX/total-return')
    expect(seriesEntry).toBeDefined()
    expect(seriesEntry!.tiers.strict).not.toBeNull()
    expect(decoded.meta.entryDates[0]).toBe(seriesEntry!.tiers.strict!.firstDate)
  })
})
