/**
 * src/data/load-bundle-browser.ts
 *
 * D-02: the fetch byte source. Resolves the manifest at the generated `MANIFEST_PATH` and every
 * asset beside it over `fetch`, then delegates the actual parse-decode-map work to
 * `loadBundleFromSource` (`src/data/bundle-source.ts`). This file imports no Node builtin module,
 * which is the entire point of the D-02 split: it is the byte source the browser bundle uses.
 */

import { MANIFEST_PATH } from '../data-bundle.generated.ts'
import { loadBundleFromSource, type BundleByteSource, type LoadedBundle } from './bundle-source.ts'

const DATA_DIR = MANIFEST_PATH.slice(0, MANIFEST_PATH.lastIndexOf('/') + 1)

async function fetchOrThrow(url: string): Promise<Response> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`load-bundle-browser: fetching "${url}" failed with status ${response.status}`)
  }
  return response
}

/**
 * Fetches the manifest at `MANIFEST_PATH` and every `assets[].file` plus the shared calendar
 * file beside it, and calls `decodeHeader(buffer, BUNDLE_VERSION)` on each (via
 * `loadBundleFromSource`) so a stale cached asset raises `BundleVersionMismatchError` at load
 * rather than returning numbers that quietly disagree with the manifest describing them. A
 * non-OK response throws a named error carrying the failing URL and HTTP status.
 */
export async function loadBundleFromFetch(): Promise<LoadedBundle> {
  const source: BundleByteSource = {
    readManifest: async () => {
      const response = await fetchOrThrow(MANIFEST_PATH)
      return response.text()
    },
    readAsset: async (fileName: string) => {
      const response = await fetchOrThrow(DATA_DIR + fileName)
      return response.arrayBuffer()
    },
  }

  return loadBundleFromSource(source)
}
