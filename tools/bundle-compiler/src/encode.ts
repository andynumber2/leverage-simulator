/**
 * tools/bundle-compiler/src/encode.ts
 *
 * Binary asset assembly, content-hashed filenames, aligned data sections. Never constructs a
 * Float64Array directly (that is binary-format.ts's decode-side job exclusively); this module
 * writes raw bytes into a data section via DataView.
 */

import { createHash } from 'node:crypto'
import { renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import {
  DATA_SECTION_ALIGNMENT,
  encodeHeader,
  type SeriesDescriptor,
} from './binary-format.ts'

export { DATA_SECTION_ALIGNMENT }

const INT32_BYTES = 4
const FLOAT64_BYTES = 8

/**
 * Encodes the shared calendar asset: header (assetKind 'calendar', one descriptor of kind
 * 'calendar') plus a contiguous Int32Array data section of days-since-epoch values.
 */
export function encodeCalendarAsset(bundleVersion: string, calendarDays: Int32Array): Uint8Array {
  const dataByteLength = calendarDays.length * INT32_BYTES
  const descriptor: SeriesDescriptor = {
    kind: 'calendar',
    id: '@calendar/calendar',
    calendarStartIndex: 0,
    length: calendarDays.length,
    dataByteOffset: 0,
  }

  const headerBytes = encodeHeader({
    assetKind: 'calendar',
    bundleVersion,
    descriptors: [descriptor],
    dataByteLength,
  })

  const buffer = new Uint8Array(headerBytes.length + dataByteLength)
  buffer.set(headerBytes, 0)
  const dataView = new DataView(buffer.buffer, buffer.byteOffset + headerBytes.length, dataByteLength)
  for (let i = 0; i < calendarDays.length; i++) {
    dataView.setInt32(i * INT32_BYTES, calendarDays[i]!, true)
  }

  return buffer
}

/**
 * Encodes a series-container asset for one scope: header (assetKind 'series') plus one
 * contiguous Float64Array run per descriptor, in descriptor order. `dataByteOffset` on each
 * output descriptor is computed here (contiguous, in the order `descriptors`/`values` are given)
 * and does not need to be pre-filled by the caller.
 */
export function encodeSeriesAsset(
  bundleVersion: string,
  scope: string,
  descriptors: ReadonlyArray<Omit<SeriesDescriptor, 'dataByteOffset'>>,
  values: ReadonlyArray<Float64Array>,
): Uint8Array {
  if (descriptors.length !== values.length) {
    throw new Error(
      `encode: descriptors (${descriptors.length}) and values (${values.length}) length mismatch for scope "${scope}"`,
    )
  }

  let cursor = 0
  const finalDescriptors: SeriesDescriptor[] = descriptors.map((descriptor, index) => {
    const seriesValues = values[index]!
    const withOffset: SeriesDescriptor = { ...descriptor, dataByteOffset: cursor }
    cursor += seriesValues.length * FLOAT64_BYTES
    return withOffset
  })
  const dataByteLength = cursor

  const headerBytes = encodeHeader({
    assetKind: 'series',
    bundleVersion,
    descriptors: finalDescriptors,
    dataByteLength,
  })

  const buffer = new Uint8Array(headerBytes.length + dataByteLength)
  buffer.set(headerBytes, 0)

  let byteCursor = headerBytes.length
  for (const seriesValues of values) {
    const byteLength = seriesValues.length * FLOAT64_BYTES
    const dataView = new DataView(buffer.buffer, buffer.byteOffset + byteCursor, byteLength)
    for (let i = 0; i < seriesValues.length; i++) {
      dataView.setFloat64(i * FLOAT64_BYTES, seriesValues[i]!, true)
    }
    byteCursor += byteLength
  }

  return buffer
}

/**
 * Returns `${baseName}.${hash}.${ext}` where hash is the first 10 hex characters of the SHA-256
 * of `bytes`. A pure function of the bytes: identical bytes always produce identical names, and a
 * single flipped bit always produces a different name.
 */
export function contentHashedFilename(baseName: string, ext: string, bytes: Uint8Array): string {
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 10)
  return `${baseName}.${hash}.${ext}`
}

/**
 * Writes `bytes` to `${outDir}/${filename}` via a temporary path in the same directory, then
 * renames into place, so an interrupted compile never leaves a truncated asset: a reader always
 * sees either the previous complete file or the new complete file.
 */
export function writeAsset(outDir: string, filename: string, bytes: Uint8Array): void {
  const finalPath = path.join(outDir, filename)
  const tmpPath = path.join(outDir, `.${filename}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  writeFileSync(tmpPath, bytes)
  renameSync(tmpPath, finalPath)
}
