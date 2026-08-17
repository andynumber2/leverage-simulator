/**
 * tools/bundle-compiler/src/binary-format.ts
 *
 * The single shared definition of the on-disk header and series descriptor layout, used by both
 * the encoder (encode.ts) and every decoder, including the app's future Phase 4 decoder. Nothing
 * else in this repo re-declares any part of this layout.
 *
 * Byte layout, little-endian throughout (02-01-PLAN.md <interfaces>):
 *
 * | Offset | Type   | Field                    |
 * |--------|--------|--------------------------|
 * | 0      | uint32 | magic                    |
 * | 4      | uint16 | formatVersion            |
 * | 6      | uint16 | assetKind                |
 * | 8      | uint32 | bundleVersionByteLength  |
 * | 12     | uint32 | descriptorCount          |
 * | 16     | uint32 | headerByteLength         |
 * | 20     | uint32 | dataByteLength           |
 * | 24     | bytes  | bundleVersion (UTF-8, padded to 4)  |
 *
 * Then `descriptorCount` descriptors, each 4-byte aligned:
 *
 * | Type   | Field              |
 * |--------|--------------------|
 * | uint16 | kindCode           |
 * | uint16 | idByteLength       |
 * | uint32 | calendarStartIndex |
 * | uint32 | length             |
 * | uint32 | dataByteOffset     |
 * | bytes  | id (UTF-8, padded to 4) |
 *
 * The header is padded up to DATA_SECTION_ALIGNMENT (8) before the data section starts, so
 * `new Float64Array(buffer, headerByteLength + dataByteOffset, length)` is always constructible
 * (a Float64Array view over a non-multiple-of-8 byte offset throws a RangeError).
 */

export const MAGIC = 0x4c56_4744
export const FORMAT_VERSION = 1

/** Data section start offset alignment, in bytes. Load-bearing for Float64Array construction. */
export const DATA_SECTION_ALIGNMENT = 8

export type AssetKind = 'calendar' | 'series'
export type SeriesKind = 'price-return' | 'total-return' | 'rate' | 'calendar'

const ASSET_KIND_CODES: Record<AssetKind, number> = {
  calendar: 1,
  series: 2,
}
const ASSET_KIND_BY_CODE: Record<number, AssetKind> = {
  1: 'calendar',
  2: 'series',
}

const SERIES_KIND_CODES: Record<SeriesKind, number> = {
  'price-return': 1,
  'total-return': 2,
  rate: 3,
  calendar: 4,
}
const SERIES_KIND_BY_CODE: Record<number, SeriesKind> = {
  1: 'price-return',
  2: 'total-return',
  3: 'rate',
  4: 'calendar',
}

export interface SeriesDescriptor {
  kind: SeriesKind
  id: string
  calendarStartIndex: number
  length: number
  dataByteOffset: number
}

export interface AssetHeader {
  formatVersion: number
  assetKind: AssetKind
  bundleVersion: string
  headerByteLength: number
  dataByteLength: number
  descriptors: SeriesDescriptor[]
}

const FIXED_HEADER_BYTES = 24
const DESCRIPTOR_FIXED_BYTES = 16 // kindCode(2) + idByteLength(2) + calendarStartIndex(4) + length(4) + dataByteOffset(4)

function alignTo(value: number, alignment: number): number {
  return (value + (alignment - 1)) & ~(alignment - 1)
}

export interface EncodeHeaderInput {
  assetKind: AssetKind
  bundleVersion: string
  descriptors: ReadonlyArray<SeriesDescriptor>
  dataByteLength: number
}

/**
 * Encodes the fixed header and descriptor table into a padded byte buffer whose length is the
 * computed `headerByteLength` (a multiple of DATA_SECTION_ALIGNMENT). Does not write any data
 * section bytes; callers append the data section starting at the returned buffer's length.
 */
export function encodeHeader(input: EncodeHeaderInput): Uint8Array {
  const encoder = new TextEncoder()
  const bundleVersionBytes = encoder.encode(input.bundleVersion)
  const bundleVersionByteLength = bundleVersionBytes.length
  const bundleVersionPadded = alignTo(bundleVersionByteLength, 4)

  const idByteArrays: Uint8Array[] = []
  let descriptorSectionBytes = 0
  for (const descriptor of input.descriptors) {
    const idBytes = encoder.encode(descriptor.id)
    idByteArrays.push(idBytes)
    descriptorSectionBytes += DESCRIPTOR_FIXED_BYTES + alignTo(idBytes.length, 4)
  }

  const preAlignHeaderLength = FIXED_HEADER_BYTES + bundleVersionPadded + descriptorSectionBytes
  const headerByteLength = alignTo(preAlignHeaderLength, DATA_SECTION_ALIGNMENT)

  const buffer = new Uint8Array(headerByteLength)
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)

  view.setUint32(0, MAGIC, true)
  view.setUint16(4, FORMAT_VERSION, true)
  view.setUint16(6, ASSET_KIND_CODES[input.assetKind], true)
  view.setUint32(8, bundleVersionByteLength, true)
  view.setUint32(12, input.descriptors.length, true)
  view.setUint32(16, headerByteLength, true)
  view.setUint32(20, input.dataByteLength, true)

  buffer.set(bundleVersionBytes, FIXED_HEADER_BYTES)

  let offset = FIXED_HEADER_BYTES + bundleVersionPadded
  for (const [index, descriptor] of input.descriptors.entries()) {
    const idBytes = idByteArrays[index]!
    view.setUint16(offset, SERIES_KIND_CODES[descriptor.kind], true)
    view.setUint16(offset + 2, idBytes.length, true)
    view.setUint32(offset + 4, descriptor.calendarStartIndex, true)
    view.setUint32(offset + 8, descriptor.length, true)
    view.setUint32(offset + 12, descriptor.dataByteOffset, true)
    buffer.set(idBytes, offset + DESCRIPTOR_FIXED_BYTES)
    offset += DESCRIPTOR_FIXED_BYTES + alignTo(idBytes.length, 4)
  }

  return buffer
}

/**
 * Decodes the header and descriptor table from an asset buffer. Only reads the header portion
 * (up to `headerByteLength`); never touches or requires the data section. Throws when `magic` or
 * `formatVersion` disagrees with the constants in this module.
 */
export function decodeHeader(buffer: ArrayBuffer): AssetHeader {
  const view = new DataView(buffer)

  const magic = view.getUint32(0, true)
  if (magic !== MAGIC) {
    throw new Error(
      `binary-format: asset magic 0x${magic.toString(16)} does not match expected 0x${MAGIC.toString(16)}`,
    )
  }

  const formatVersion = view.getUint16(4, true)
  if (formatVersion !== FORMAT_VERSION) {
    throw new Error(
      `binary-format: asset formatVersion ${formatVersion} does not match expected ${FORMAT_VERSION}`,
    )
  }

  const assetKindCode = view.getUint16(6, true)
  const assetKind = ASSET_KIND_BY_CODE[assetKindCode]
  if (assetKind === undefined) {
    throw new Error(`binary-format: unknown assetKind code ${assetKindCode}`)
  }

  const bundleVersionByteLength = view.getUint32(8, true)
  const descriptorCount = view.getUint32(12, true)
  const headerByteLength = view.getUint32(16, true)
  const dataByteLength = view.getUint32(20, true)

  const decoder = new TextDecoder()
  const bundleVersionBytes = new Uint8Array(buffer, FIXED_HEADER_BYTES, bundleVersionByteLength)
  const bundleVersion = decoder.decode(bundleVersionBytes)

  let offset = FIXED_HEADER_BYTES + alignTo(bundleVersionByteLength, 4)
  const descriptors: SeriesDescriptor[] = []
  for (let i = 0; i < descriptorCount; i++) {
    const kindCode = view.getUint16(offset, true)
    const kind = SERIES_KIND_BY_CODE[kindCode]
    if (kind === undefined) {
      throw new Error(`binary-format: unknown series kind code ${kindCode} at descriptor ${i}`)
    }
    const idByteLength = view.getUint16(offset + 2, true)
    const calendarStartIndex = view.getUint32(offset + 4, true)
    const length = view.getUint32(offset + 8, true)
    const dataByteOffset = view.getUint32(offset + 12, true)
    const idBytes = new Uint8Array(buffer, offset + DESCRIPTOR_FIXED_BYTES, idByteLength)
    const id = decoder.decode(idBytes)
    descriptors.push({ kind, id, calendarStartIndex, length, dataByteOffset })
    offset += DESCRIPTOR_FIXED_BYTES + alignTo(idByteLength, 4)
  }

  return { formatVersion, assetKind, bundleVersion, headerByteLength, dataByteLength, descriptors }
}

/**
 * Returns a zero-copy Float64Array view over one series' data, decoding the header internally to
 * locate the data section. Callers that need many views over the same buffer should prefer
 * decoding once via `decodeHeader` and slicing manually if this per-call decode becomes
 * measurable; the plan for this phase accepts that cost here in exchange for a simple two-arg
 * call site.
 */
export function seriesView(buffer: ArrayBuffer, descriptor: SeriesDescriptor): Float64Array {
  const header = decodeHeader(buffer)
  return new Float64Array(buffer, header.headerByteLength + descriptor.dataByteOffset, descriptor.length)
}

/**
 * Returns a zero-copy Int32Array view over the calendar asset's days-since-epoch array.
 */
export function calendarView(buffer: ArrayBuffer): Int32Array {
  const header = decodeHeader(buffer)
  const descriptor = header.descriptors.find((d) => d.kind === 'calendar')
  if (descriptor === undefined) {
    throw new Error('binary-format: calendarView called on an asset with no calendar descriptor')
  }
  return new Int32Array(buffer, header.headerByteLength + descriptor.dataByteOffset, descriptor.length)
}
