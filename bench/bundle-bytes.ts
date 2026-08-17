/**
 * bench/bundle-bytes.ts: Node-only measurement of the compiled bundle's transfer size (D-23).
 *
 * Reads every file the bundle compiler emitted into the compiled output directory, sums the raw
 * byte lengths and the brotli-compressed byte lengths (`zlib.brotliCompressSync` at its default
 * settings: deterministic, no dependency), since compressed size is what an edge actually
 * transfers. Deliberately never imported by any `*.bench.test.ts` file: it imports `node:fs` and
 * `node:zlib`, which break the browser bundle if pulled in transitively (see bench/report.ts's
 * header comment; bench/accumulator-store.ts follows the same Node-only separation).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { brotliCompressSync } from 'node:zlib'

export interface BundleBytes {
  files: string[]
  rawBytes: number
  compressedBytes: number
}

/**
 * Measures every regular file directly inside `dir` (non-recursive: the compiled bundle is a
 * flat directory of assets plus the manifest, per D-18). Files are visited in sorted order so
 * `rawBytes`/`compressedBytes` are deterministic across two calls over an unchanged directory.
 * Throws naming `dir` when it contains no files: a size measurement over an empty directory would
 * report a comfortable zero and mean nothing.
 */
export function measureBundleBytes(dir: string): BundleBytes {
  const entries = readdirSync(dir)
    .filter((entry) => statSync(path.join(dir, entry)).isFile())
    .sort()
  if (entries.length === 0) {
    throw new Error(`measureBundleBytes: "${dir}" contains no files; nothing to measure`)
  }

  let rawBytes = 0
  let compressedBytes = 0
  for (const entry of entries) {
    const bytes = readFileSync(path.join(dir, entry))
    rawBytes += bytes.length
    compressedBytes += brotliCompressSync(bytes).length
  }

  return { files: entries, rawBytes, compressedBytes }
}
