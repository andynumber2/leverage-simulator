/**
 * src/data/bundle-source.ts
 *
 * D-02: the one bundle assembly loop, parameterized over a byte source. `loadBundleFromDisk`
 * (Node, `src/data/load-bundle-node.ts`) and `loadBundleFromFetch` (browser,
 * `src/data/load-bundle-browser.ts`) differ only in how they read a manifest string and an
 * asset's bytes; both delegate to `loadBundleFromSource` here for the actual parse-decode-map
 * work. This file imports no Node builtin module, which is the entire point of the split: it is
 * reachable from the browser bundle graph.
 */

import { calendarView, decodeHeader, type AssetHeader } from '../../tools/bundle-compiler/src/binary-format.ts'
import type { Manifest } from '../../tools/bundle-compiler/src/manifest.ts'
import { BUNDLE_VERSION } from '../data-bundle.generated.ts'

/** A source of the manifest text and every named asset's bytes. `loadBundleFromDisk` builds one
 * over the filesystem; `loadBundleFromFetch` builds one over `fetch`. Neither byte source
 * type appears in this file's own imports. */
export interface BundleByteSource {
  readManifest(): Promise<string>
  readAsset(fileName: string): Promise<ArrayBuffer>
}

/** The decoded manifest, every asset's decoded header/buffer, and the shared calendar view. */
export interface LoadedBundle {
  manifest: Manifest
  calendar: Int32Array
  assets: Map<string, { buffer: ArrayBuffer; header: AssetHeader }>
}

/**
 * Parses the manifest, reads and header-decodes the shared calendar asset, builds the
 * `calendarView`, then reads and header-decodes every `manifest.assets[]` entry into the
 * returned `Map`. Every asset passes through `decodeHeader(buffer, BUNDLE_VERSION)`, so a stale
 * cached asset raises `BundleVersionMismatchError` at load rather than returning numbers that
 * quietly disagree with the manifest describing them.
 */
export async function loadBundleFromSource(source: BundleByteSource): Promise<LoadedBundle> {
  const manifestJson = await source.readManifest()
  const manifest = JSON.parse(manifestJson) as Manifest

  const assets = new Map<string, { buffer: ArrayBuffer; header: AssetHeader }>()

  const calendarBuffer = await source.readAsset(manifest.calendar.file)
  const calendarHeader = decodeHeader(calendarBuffer, BUNDLE_VERSION)
  assets.set(manifest.calendar.file, { buffer: calendarBuffer, header: calendarHeader })
  const calendar = calendarView(calendarBuffer, calendarHeader)

  for (const asset of manifest.assets) {
    const buffer = await source.readAsset(asset.file)
    const header = decodeHeader(buffer, BUNDLE_VERSION)
    assets.set(asset.file, { buffer, header })
  }

  return { manifest, calendar, assets }
}
