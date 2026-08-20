/**
 * src/data/load-bundle-node.ts
 *
 * D-02: the Node byte source. Resolves the manifest at
 * `path.join(rootDir ?? process.cwd(), 'public', MANIFEST_PATH)` and every asset beside it, then
 * delegates the actual parse-decode-map work to `loadBundleFromSource`
 * (`src/data/bundle-source.ts`). `loadBundleFromDisk`'s `(rootDir?: string) =>
 * Promise<LoadedBundle>` signature is unchanged from its prior home in `kernel-inputs.ts`.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { MANIFEST_PATH } from '../data-bundle.generated.ts'
import { loadBundleFromSource, type BundleByteSource, type LoadedBundle } from './bundle-source.ts'

async function readAsArrayBuffer(filePath: string): Promise<ArrayBuffer> {
  const buf = await readFile(filePath)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

/**
 * Resolves the manifest at `path.join(rootDir ?? process.cwd(), 'public', MANIFEST_PATH)`, reads
 * every `assets[].file` plus the shared calendar file from the same directory, and calls
 * `decodeHeader(buffer, BUNDLE_VERSION)` on each so a stale cached asset raises
 * `BundleVersionMismatchError` at load rather than returning numbers that quietly disagree with
 * the manifest describing them.
 */
export async function loadBundleFromDisk(rootDir?: string): Promise<LoadedBundle> {
  const baseDir = rootDir ?? process.cwd()
  const manifestPath = path.join(baseDir, 'public', MANIFEST_PATH)
  const dataDir = path.dirname(manifestPath)

  const source: BundleByteSource = {
    readManifest: () => readFile(manifestPath, 'utf-8'),
    readAsset: (fileName: string) => readAsArrayBuffer(path.join(dataDir, fileName)),
  }

  return loadBundleFromSource(source)
}
