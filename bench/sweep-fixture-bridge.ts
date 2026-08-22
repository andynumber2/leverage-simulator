/**
 * bench/sweep-fixture-bridge.ts: the Node-side loader `bench/heatmap-form-2.bench.test.ts` uses
 * to hand the browser bench context the committed Phase 6 sweep fixture's raw bytes. Mirrors
 * `bench/bundle-bytes.ts`/`bench/kernel-series-bridge.ts`'s Node-only separation: this module
 * imports `node:fs`, so it must never be imported by a `*.bench.test.ts` file directly, only
 * through `vitest.config.ts`'s `browser.commands` bridge.
 *
 * The payload crosses a structured-clone boundary into the browser context. Per
 * `kernel-series-bridge.ts`'s own header comment, a typed array does not survive that boundary
 * intact, so the file's bytes are converted to a plain `number[]` for transport; the browser side
 * rebuilds a `Uint8Array`/`ArrayBuffer` from it once, outside the timed region.
 */

import { readFileSync } from 'node:fs'

export interface SweepFixtureBytesPayload {
  bytes: number[]
}

/** Reads `filePath` (the committed `sweep-fixture.bin`) and returns its bytes as a plain
 * `number[]` payload. */
export function readSweepFixtureBytes(filePath: string): SweepFixtureBytesPayload {
  const buffer = readFileSync(filePath)
  return { bytes: Array.from(buffer) }
}
