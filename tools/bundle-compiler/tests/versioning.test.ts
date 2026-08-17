/**
 * tools/bundle-compiler/tests/versioning.test.ts
 *
 * Proof for Task 2 (D-22, both halves): a decoder handed an asset whose header bundle version
 * disagrees with the manifest throws rather than returning numbers, every asset filename is a
 * pure function of its own bytes, and a recompile of unchanged inputs is byte-identical with no
 * orphaned asset left behind.
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { expect, test } from 'vitest'

import { BundleVersionMismatchError, decodeHeader, encodeHeader } from '../src/binary-format.ts'
import { compileBundle } from '../src/compile.ts'
import { contentHashedFilename } from '../src/encode.ts'
import { makeRawFixture } from './fixtures/make-fixture.ts'

function makeOutDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'bundle-compiler-versioning-out-'))
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

test('decodeHeader throws BundleVersionMismatchError naming both values when the header bundle version disagrees', () => {
  const bytes = encodeHeader({ assetKind: 'calendar', bundleVersion: 'header-version', descriptors: [], dataByteLength: 0 })
  const arrayBuffer = toArrayBuffer(Buffer.from(bytes))

  let thrown: unknown
  try {
    decodeHeader(arrayBuffer, 'manifest-version')
  } catch (err) {
    thrown = err
  }

  expect(thrown).toBeInstanceOf(BundleVersionMismatchError)
  const err = thrown as BundleVersionMismatchError
  expect(err.headerBundleVersion).toBe('header-version')
  expect(err.expectedBundleVersion).toBe('manifest-version')
  expect(err.message).toContain('header-version')
  expect(err.message).toContain('manifest-version')
})

test('decodeHeader returns the header when the bundle version matches', () => {
  const bytes = encodeHeader({ assetKind: 'calendar', bundleVersion: 'v1', descriptors: [], dataByteLength: 0 })
  const arrayBuffer = toArrayBuffer(Buffer.from(bytes))
  const header = decodeHeader(arrayBuffer, 'v1')
  expect(header.bundleVersion).toBe('v1')
})

test('contentHashedFilename is a pure function of the bytes', () => {
  const bytesA = Uint8Array.from([1, 2, 3, 4, 5])
  const bytesB = Uint8Array.from([1, 2, 3, 4, 5])
  const bytesFlipped = Uint8Array.from([1, 2, 3, 4, 6])

  expect(contentHashedFilename('x', 'bin', bytesA)).toBe(contentHashedFilename('x', 'bin', bytesB))
  expect(contentHashedFilename('x', 'bin', bytesA)).not.toBe(contentHashedFilename('x', 'bin', bytesFlipped))
})

test('changing one byte of one input CSV changes that scope asset filename and the bundle version', () => {
  // NOTE (deviation, documented in 02-01-SUMMARY.md): the plan's <behavior> line for this test
  // additionally claims sibling scopes' filenames stay unchanged. That claim contradicts the
  // plan's own twice-stated design (Task 1's must_haves and D-22): "every binary header carries
  // the manifest's bundleVersion" — one shared, global value, embedded in every asset. Since
  // computeBundleVersion combines every asset's own content hash, any single-scope change changes
  // the global bundleVersion, which is re-embedded in every header (including untouched scopes'),
  // which changes every asset's bytes and therefore every asset's content-hashed filename. This is
  // the safe, by-design consequence of the locked global-bundleVersion decode check, not a bug:
  // it never allows a stale asset to be served under an unchanged name. This test asserts the
  // real, by-design behavior instead of the internally-contradictory line.
  const fixture = makeRawFixture()
  const outDir = makeOutDir()
  try {
    const first = compileBundle(fixture.dir, outDir)
    const firstAaa = first.assetFiles.find((f) => f.startsWith('aaa.'))
    const firstBbb = first.assetFiles.find((f) => f.startsWith('bbb.'))
    expect(firstAaa).toBeDefined()
    expect(firstBbb).toBeDefined()

    // Mutate one byte of AAA's raw CSV: flip the last value's final digit.
    const csvPath = path.join(fixture.dir, 'AAA-price.csv')
    const original = readFileSync(csvPath, 'utf8')
    const mutated = original.replace(/114\.5\n$/, '114.6\n')
    expect(mutated).not.toBe(original)
    writeFileSync(csvPath, mutated)

    const second = compileBundle(fixture.dir, outDir)
    const secondAaa = second.assetFiles.find((f) => f.startsWith('aaa.'))
    const secondBbb = second.assetFiles.find((f) => f.startsWith('bbb.'))

    expect(secondAaa).toBeDefined()
    expect(secondAaa).not.toBe(firstAaa)
    // BBB's own series data did not change, but its embedded (shared, global) bundleVersion did,
    // so its filename changes too -- see NOTE above.
    expect(secondBbb).toBeDefined()
    expect(secondBbb).not.toBe(firstBbb)
    expect(second.bundleVersion).not.toBe(first.bundleVersion)
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true })
    rmSync(outDir, { recursive: true, force: true })
  }
})

test('compiling twice into the same output directory leaves exactly the same file set with no orphan', () => {
  const fixture = makeRawFixture()
  const outDir = makeOutDir()
  try {
    compileBundle(fixture.dir, outDir)
    const first = new Set(readdirSync(outDir))

    compileBundle(fixture.dir, outDir)
    const second = new Set(readdirSync(outDir))

    expect(second).toEqual(first)
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true })
    rmSync(outDir, { recursive: true, force: true })
  }
})
