/**
 * tools/bundle-compiler/tests/roundtrip.test.ts
 *
 * Proof for criterion 5: compiles a fixture into a temporary output directory, reads the emitted
 * manifest, and for every ManifestSeries decodes its asset and asserts every value is strictly
 * equal to the number the fixture wrote, with no tolerance. Also covers determinism (recompiling
 * unchanged inputs is byte-identical), the missing-sidecar abort message, and a fast-check
 * property over the raw encode/decode round trip.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import fc from 'fast-check'
import { describe, expect, test } from 'vitest'

import { decodeHeader, encodeHeader, seriesView, type SeriesDescriptor } from '../src/binary-format.ts'
import { compileBundle } from '../src/compile.ts'
import { encodeSeriesAsset } from '../src/encode.ts'
import { DEFAULT_RATE_SERIES, makeRawFixture } from './fixtures/make-fixture.ts'

function makeOutDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'bundle-compiler-out-'))
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

function readFilesSnapshot(dir: string): Record<string, Buffer> {
  const snapshot: Record<string, Buffer> = {}
  for (const entry of readdirSync(dir)) {
    if (statSync(path.join(dir, entry)).isFile()) {
      snapshot[entry] = readFileSync(path.join(dir, entry))
    }
  }
  return snapshot
}

describe('compileBundle round trip', () => {
  test('decoded values equal the parsed CSV values exactly for every manifest series', () => {
    const fixture = makeRawFixture()
    const outDir = makeOutDir()
    try {
      const result = compileBundle(fixture.dir, outDir)
      const manifest = JSON.parse(readFileSync(path.join(outDir, result.manifestFile), 'utf8')) as {
        series: Array<{ id: string; scope: string; asset: string }>
      }

      expect(manifest.series.length).toBeGreaterThan(0)

      for (const entry of manifest.series) {
        const assetBuffer = readFileSync(path.join(outDir, entry.asset))
        const arrayBuffer = toArrayBuffer(assetBuffer)
        const header = decodeHeader(arrayBuffer, result.bundleVersion)
        const descriptor = header.descriptors.find((d) => d.id === entry.id)
        expect(descriptor).toBeDefined()

        const view = seriesView(arrayBuffer, header, descriptor!)
        const expectedValues = fixture.expected[entry.id]!.values
        expect(view.length).toBe(expectedValues.length)
        for (let i = 0; i < expectedValues.length; i++) {
          expect(view[i]).toBe(expectedValues[i])
        }
      }
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('adding a third scope changes only the emitted set, not the code', () => {
    const fixture = makeRawFixture({
      series: [
        { scope: 'AAA', seriesKind: 'price', units: 'index-level' },
        { scope: 'AAA', seriesKind: 'total-return', units: 'index-level' },
        { scope: 'BBB', seriesKind: 'price', units: 'index-level' },
        { scope: 'BBB', seriesKind: 'total-return', units: 'index-level' },
        { scope: 'CCC', seriesKind: 'price', units: 'index-level', values: undefined },
        { scope: 'CCC', seriesKind: 'total-return', units: 'index-level' },
        ...DEFAULT_RATE_SERIES,
      ],
    })
    const outDir = makeOutDir()
    try {
      const result = compileBundle(fixture.dir, outDir)
      // 3 symbol-scope assets (AAA, BBB, CCC) plus the shared rate asset.
      expect(result.assetFiles.length).toBe(4)
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('compiling the fixture twice into the same output directory produces byte-identical output', () => {
    const fixture = makeRawFixture()
    const outDir = makeOutDir()
    try {
      compileBundle(fixture.dir, outDir)
      const first = readFilesSnapshot(outDir)

      compileBundle(fixture.dir, outDir)
      const second = readFilesSnapshot(outDir)

      expect(Object.keys(second).sort()).toEqual(Object.keys(first).sort())
      for (const filename of Object.keys(first)) {
        expect(second[filename]!.equals(first[filename]!)).toBe(true)
      }
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('removing a fixture sidecar and recompiling aborts naming both the CSV path and the sidecar path', () => {
    const fixture = makeRawFixture()
    const outDir = makeOutDir()
    try {
      const csvPath = path.join(fixture.dir, 'AAA-price.csv')
      const sidecarPath = path.join(fixture.dir, 'AAA-price.meta.json')
      unlinkSync(sidecarPath)

      let thrown: Error | undefined
      try {
        compileBundle(fixture.dir, outDir)
      } catch (err) {
        thrown = err as Error
      }

      expect(thrown).toBeDefined()
      expect(thrown!.message).toContain(csvPath)
      expect(thrown!.message).toContain(sidecarPath)
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })
})

describe('binary-format encode/decode', () => {
  test('encodeHeader then decodeHeader returns a structurally equal header', () => {
    const descriptors: SeriesDescriptor[] = [
      { kind: 'price-return', id: 'AAA/price-return', calendarStartIndex: 0, length: 10, dataByteOffset: 0 },
      { kind: 'total-return', id: 'AAA/total-return', calendarStartIndex: 0, length: 10, dataByteOffset: 80 },
    ]
    const bytes = encodeHeader({ assetKind: 'series', bundleVersion: 'abc123', descriptors, dataByteLength: 160 })
    const header = decodeHeader(toArrayBuffer(Buffer.from(bytes)), 'abc123')

    expect(header.assetKind).toBe('series')
    expect(header.bundleVersion).toBe('abc123')
    expect(header.dataByteLength).toBe(160)
    expect(header.headerByteLength % 8).toBe(0)
    expect(header.descriptors).toEqual(descriptors)
  })

  test('decodeHeader throws when magic disagrees with the constant', () => {
    const bytes = encodeHeader({ assetKind: 'calendar', bundleVersion: 'x', descriptors: [], dataByteLength: 0 })
    const corrupted = Uint8Array.from(bytes)
    corrupted[0] = (corrupted[0]! ^ 0xff) & 0xff
    expect(() => decodeHeader(toArrayBuffer(Buffer.from(corrupted)), 'x')).toThrow()
  })

  test('decodeHeader throws when formatVersion disagrees with the constant', () => {
    const bytes = encodeHeader({ assetKind: 'calendar', bundleVersion: 'x', descriptors: [], dataByteLength: 0 })
    const corrupted = Uint8Array.from(bytes)
    // formatVersion lives at byte offset 4 (uint16 little-endian); bump it.
    corrupted[4] = (corrupted[4]! + 1) & 0xff
    expect(() => decodeHeader(toArrayBuffer(Buffer.from(corrupted)), 'x')).toThrow()
  })

  test('encodeSeriesAsset produces a buffer whose headerByteLength is a multiple of DATA_SECTION_ALIGNMENT', () => {
    const descriptors = [{ kind: 'rate' as const, id: '@RATE/rate', calendarStartIndex: 0, length: 3 }]
    const bytes = encodeSeriesAsset('v1', '@RATE', descriptors, [Float64Array.from([1, 2, 3])])
    const header = decodeHeader(toArrayBuffer(Buffer.from(bytes)), 'v1')
    expect(header.headerByteLength % 8).toBe(0)
  })
})

describe('property: Float64 round trip is lossless', () => {
  test('arbitrary finite float64 arrays encode then decode to exactly the same values', () => {
    const extremeValues = fc.constantFrom(0, -0, Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE, -Number.MIN_VALUE)
    const element = fc.oneof(fc.double({ noNaN: true, noDefaultInfinity: true }), extremeValues)

    fc.assert(
      fc.property(fc.array(element, { minLength: 1, maxLength: 500 }), (values) => {
        const descriptors = [{ kind: 'rate' as const, id: '@RATE/rate', calendarStartIndex: 0, length: values.length }]
        const bytes = encodeSeriesAsset('property-run', '@RATE', descriptors, [Float64Array.from(values)])
        const arrayBuffer = toArrayBuffer(Buffer.from(bytes))
        const header = decodeHeader(arrayBuffer, 'property-run')
        const descriptor = header.descriptors[0]!
        const view = seriesView(arrayBuffer, header, descriptor)

        expect(view.length).toBe(values.length)
        for (let i = 0; i < values.length; i++) {
          expect(Object.is(view[i], values[i])).toBe(true)
        }
      }),
      { numRuns: 50 },
    )
  })
})
