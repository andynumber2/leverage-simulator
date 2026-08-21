/**
 * src/data/sweep-fixture-format.ts
 *
 * D-29: the versioned binary layout for the committed sweep fixture
 * (`.planning/phases/06-heatmap-design-pass/mockups/sweep-fixture.bin`), plus its encoder and
 * fail-loud decoder. Follows `tools/bundle-compiler/src/binary-format.ts`'s magic-plus-version
 * shape (T-06-01) with a new layout and a new magic -- this is a different asset kind from the
 * compiled data bundle and must never be mistaken for one, or vice versa.
 *
 * Byte layout, little-endian throughout:
 *
 * | Offset | Type   | Field           |
 * |--------|--------|-----------------|
 * | 0      | uint32 | magic           |
 * | 4      | uint16 | formatVersion   |
 * | 6      | uint16 | reserved (zero) |
 * | 8      | uint32 | cols            |
 * | 12     | uint32 | rows            |
 * | 16     | uint32 | metaByteLength  |
 * | 20     | bytes  | meta (UTF-8 JSON, `metaByteLength` bytes) |
 *
 * Then zero padding to the next multiple of 8, then the payload:
 *
 * | Type         | Field                                    |
 * |--------------|-------------------------------------------|
 * | Float32Array | multiple-of-contributed, `cols * rows`     |
 * | Float32Array | max drawdown, `cols * rows`                |
 * | Uint8Array   | flag bytes, `cols * rows`                  |
 *
 * Then zero padding to a multiple of 8. `decodeSweepFixture` recomputes this exact total length
 * from the header's own `cols`/`rows`/`metaByteLength` fields and throws when the buffer's actual
 * byte length disagrees (T-06-02): a forged or corrupted length can never drive a runaway
 * typed-array allocation, and a truncated or padded fixture can never be read as a plausible field.
 */

const FIXED_HEADER_BYTES = 20

/** Distinct from `tools/bundle-compiler/src/binary-format.ts`'s `MAGIC` (`0x4c56_4744`): this is a
 * different asset kind and must fail loudly, not silently decode, if the two are ever confused. */
export const SWEEP_MAGIC = 0x53574631 // ASCII "1FWS" little-endian ("SWF1" read big-endian)
export const SWEEP_FORMAT_VERSION = 1

/** D-18: a ruined cell's flag byte has this bit set. */
export const CELL_FLAG_RUINED = 1
/** D-19/D-20: an incomplete-hold cell's flag byte has this bit set. */
export const CELL_FLAG_INCOMPLETE = 2

/** Aligns `value` up to the next multiple of `alignment` (`alignment` must be a power of two).
 * Mirrors `tools/bundle-compiler/src/binary-format.ts`'s own `alignTo`, not imported from it: that
 * module's `alignTo` is unexported, and this format has its own independent alignment need
 * (8-byte, not 4-byte). */
function alignTo(value: number, alignment: number): number {
  return (value + (alignment - 1)) & ~(alignment - 1)
}

/** The JSON meta block's exact field set, in the fixed key order `encodeSweepFixture` always
 * writes (D-03's determinism requirement: two runs of `scripts/build-sweep-fixture.ts` produce a
 * byte-identical file, which requires this object's own key order to never vary with input). */
export interface SweepFixtureMeta {
  bundleVersion: string
  symbol: string
  dividendReinvest: boolean
  /** ISO date strings, length `cols`. */
  entryDates: readonly string[]
  /** Length `rows`. */
  leverages: readonly number[]
  holdingYears: number
  initialInvestment: number
  expenseRatioPercent: number
  financingSpreadPercent: number
  ruinedCount: number
  incompleteCount: number
  minMultiple: number
  maxMultiple: number
  clippedBelowCount: number
  clippedAboveCount: number
}

/** The decoded fixture: geometry, meta, and three zero-copy typed-array views over the same
 * underlying buffer (mirroring `tools/bundle-compiler/src/binary-format.ts`'s `seriesView`
 * convention). Every array has length `cols * rows`. */
export interface SweepFixture {
  cols: number
  rows: number
  meta: SweepFixtureMeta
  /** Multiple-of-contributed per cell. `0` for an incomplete-hold cell (never a partial value,
   * D-20). */
  multiples: Float32Array
  /** Max drawdown per cell. `0` for an incomplete-hold cell, same reasoning as `multiples`. */
  drawdowns: Float32Array
  /** `CELL_FLAG_RUINED` / `CELL_FLAG_INCOMPLETE` bits, or `0` for a complete, non-ruined cell. */
  flags: Uint8Array
}

/**
 * Thrown by `decodeSweepFixture` on any structural disagreement between the buffer and the
 * layout this module declares. Always names both the found and the expected value (T-06-01), so a
 * corrupted or stale fixture fails loudly rather than rendering a plausible-looking wrong field.
 */
export class SweepFixtureFormatError extends Error {
  constructor(message: string) {
    super(`sweep-fixture-format: ${message}`)
    this.name = 'SweepFixtureFormatError'
  }
}

/** Key order is authored here, once, rather than relying on `meta`'s own (caller-controlled)
 * property insertion order -- this is what makes `encodeSweepFixture`'s JSON byte-identical across
 * two calls with structurally-equal but differently-constructed meta objects. */
function toOrderedMeta(meta: SweepFixtureMeta): SweepFixtureMeta {
  return {
    bundleVersion: meta.bundleVersion,
    symbol: meta.symbol,
    dividendReinvest: meta.dividendReinvest,
    entryDates: meta.entryDates,
    leverages: meta.leverages,
    holdingYears: meta.holdingYears,
    initialInvestment: meta.initialInvestment,
    expenseRatioPercent: meta.expenseRatioPercent,
    financingSpreadPercent: meta.financingSpreadPercent,
    ruinedCount: meta.ruinedCount,
    incompleteCount: meta.incompleteCount,
    minMultiple: meta.minMultiple,
    maxMultiple: meta.maxMultiple,
    clippedBelowCount: meta.clippedBelowCount,
    clippedAboveCount: meta.clippedAboveCount,
  }
}

/**
 * Computes the payload's start offset (the byte immediately after the header-plus-meta section,
 * padded up to a multiple of 8) from the already-known `metaEndOffset` (`FIXED_HEADER_BYTES +
 * metaByteLength`). Shared by both `encodeSweepFixture` and `decodeSweepFixture` so the two can
 * never disagree about where the payload begins.
 */
function payloadStartFor(metaEndOffset: number): number {
  return alignTo(metaEndOffset, 8)
}

/**
 * Computes the fixture's total on-disk byte length from `cols`, `rows` and `metaByteLength`
 * alone -- independent of the meta JSON's actual content -- so `decodeSweepFixture` can assert the
 * buffer's real length against this value before trusting anything the meta block claims.
 */
function totalLengthFor(cols: number, rows: number, metaByteLength: number): number {
  const payloadStart = payloadStartFor(FIXED_HEADER_BYTES + metaByteLength)
  const cellCount = cols * rows
  const payloadBytes = cellCount * 4 /* multiples */ + cellCount * 4 /* drawdowns */ + cellCount /* flags */
  return alignTo(payloadStart + payloadBytes, 8)
}

/**
 * Encodes `fixture` into a fresh `Uint8Array` per this module's layout. Never mutates `fixture`'s
 * own arrays; copies every value into the newly allocated buffer.
 */
export function encodeSweepFixture(fixture: SweepFixture): Uint8Array {
  const cellCount = fixture.cols * fixture.rows
  if (fixture.multiples.length !== cellCount) {
    throw new Error(
      `encodeSweepFixture: multiples.length (${fixture.multiples.length}) does not equal cols * rows (${cellCount})`,
    )
  }
  if (fixture.drawdowns.length !== cellCount) {
    throw new Error(
      `encodeSweepFixture: drawdowns.length (${fixture.drawdowns.length}) does not equal cols * rows (${cellCount})`,
    )
  }
  if (fixture.flags.length !== cellCount) {
    throw new Error(
      `encodeSweepFixture: flags.length (${fixture.flags.length}) does not equal cols * rows (${cellCount})`,
    )
  }

  const metaBytes = new TextEncoder().encode(JSON.stringify(toOrderedMeta(fixture.meta)))
  const metaByteLength = metaBytes.length

  const payloadStart = payloadStartFor(FIXED_HEADER_BYTES + metaByteLength)
  const multipleBytesLen = cellCount * 4
  const drawdownBytesLen = cellCount * 4
  const totalLength = totalLengthFor(fixture.cols, fixture.rows, metaByteLength)

  const buffer = new Uint8Array(totalLength)
  const view = new DataView(buffer.buffer)

  view.setUint32(0, SWEEP_MAGIC, true)
  view.setUint16(4, SWEEP_FORMAT_VERSION, true)
  view.setUint16(6, 0, true)
  view.setUint32(8, fixture.cols, true)
  view.setUint32(12, fixture.rows, true)
  view.setUint32(16, metaByteLength, true)
  buffer.set(metaBytes, FIXED_HEADER_BYTES)

  const multipleView = new Float32Array(buffer.buffer, payloadStart, cellCount)
  multipleView.set(fixture.multiples)

  const drawdownOffset = payloadStart + multipleBytesLen
  const drawdownView = new Float32Array(buffer.buffer, drawdownOffset, cellCount)
  drawdownView.set(fixture.drawdowns)

  const flagsOffset = drawdownOffset + drawdownBytesLen
  buffer.set(fixture.flags, flagsOffset)

  return buffer
}

/**
 * Decodes `buffer` per this module's layout. Throws `SweepFixtureFormatError`, naming both the
 * found and the expected value, when: the magic does not match; the format version does not
 * match; the buffer is too short to contain the declared meta block; the meta block fails to
 * parse as JSON; `meta.entryDates.length` disagrees with `cols`; `meta.leverages.length`
 * disagrees with `rows`; or the buffer's total byte length disagrees with the exact length the
 * header implies (T-06-02: checked BEFORE any payload typed-array view is constructed, so a
 * forged length can never drive a runaway allocation).
 *
 * The three payload arrays are zero-copy views over `buffer`, mirroring
 * `tools/bundle-compiler/src/binary-format.ts`'s `seriesView` convention.
 */
export function decodeSweepFixture(buffer: ArrayBuffer): SweepFixture {
  if (buffer.byteLength < FIXED_HEADER_BYTES) {
    throw new SweepFixtureFormatError(
      `buffer byteLength (${buffer.byteLength}) is shorter than the fixed header (expected at least ${FIXED_HEADER_BYTES})`,
    )
  }

  const view = new DataView(buffer)

  const magic = view.getUint32(0, true)
  if (magic !== SWEEP_MAGIC) {
    throw new SweepFixtureFormatError(
      `magic 0x${magic.toString(16)} does not match expected 0x${SWEEP_MAGIC.toString(16)}`,
    )
  }

  const formatVersion = view.getUint16(4, true)
  if (formatVersion !== SWEEP_FORMAT_VERSION) {
    throw new SweepFixtureFormatError(
      `formatVersion ${formatVersion} does not match expected ${SWEEP_FORMAT_VERSION}`,
    )
  }

  const cols = view.getUint32(8, true)
  const rows = view.getUint32(12, true)
  const metaByteLength = view.getUint32(16, true)

  const metaEndOffset = FIXED_HEADER_BYTES + metaByteLength
  if (buffer.byteLength < metaEndOffset) {
    throw new SweepFixtureFormatError(
      `buffer byteLength (${buffer.byteLength}) is shorter than the declared meta block end (expected at least ${metaEndOffset})`,
    )
  }

  const metaBytes = new Uint8Array(buffer, FIXED_HEADER_BYTES, metaByteLength)
  const metaJson = new TextDecoder().decode(metaBytes)
  let meta: SweepFixtureMeta
  try {
    meta = JSON.parse(metaJson) as SweepFixtureMeta
  } catch (err) {
    throw new SweepFixtureFormatError(
      `meta block failed to parse as JSON (expected valid UTF-8 JSON): ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!Array.isArray(meta.entryDates) || meta.entryDates.length !== cols) {
    throw new SweepFixtureFormatError(
      `meta.entryDates.length (${Array.isArray(meta.entryDates) ? meta.entryDates.length : 'not an array'}) does not match cols (expected ${cols})`,
    )
  }
  if (!Array.isArray(meta.leverages) || meta.leverages.length !== rows) {
    throw new SweepFixtureFormatError(
      `meta.leverages.length (${Array.isArray(meta.leverages) ? meta.leverages.length : 'not an array'}) does not match rows (expected ${rows})`,
    )
  }

  const expectedTotalLength = totalLengthFor(cols, rows, metaByteLength)
  if (buffer.byteLength !== expectedTotalLength) {
    throw new SweepFixtureFormatError(
      `buffer byteLength (${buffer.byteLength}) does not match the length the header implies (expected ${expectedTotalLength})`,
    )
  }

  const cellCount = cols * rows
  const payloadStart = payloadStartFor(metaEndOffset)
  const multipleBytesLen = cellCount * 4
  const drawdownBytesLen = cellCount * 4

  const multiples = new Float32Array(buffer, payloadStart, cellCount)
  const drawdownOffset = payloadStart + multipleBytesLen
  const drawdowns = new Float32Array(buffer, drawdownOffset, cellCount)
  const flagsOffset = drawdownOffset + drawdownBytesLen
  const flags = new Uint8Array(buffer, flagsOffset, cellCount)

  return { cols, rows, meta, multiples, drawdowns, flags }
}
