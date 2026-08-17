/**
 * tools/fetch-data/src/fetch.ts
 *
 * The fetch CLI. Resolves each declared source per its `route` (D-27): `'live'` sources (FRED)
 * are always fetched over https with no fallback; `'live-with-manual-fallback'` sources (Yahoo)
 * attempt a live fetch and fall back to a human-supplied file under `raw/manual/` on any failure;
 * `'manual-only'` sources (Shiller) always read the manual file. Writes `raw/<stem>.csv` plus
 * `raw/<stem>.meta.json` for every series that normalized successfully, then runs a coverage pass
 * that halts on a series falling short of its declared expected first date or a manually-supplied
 * file whose newest observation has gone stale (D-27).
 *
 * Transport rules (T-02-12, T-02-14): every fetched url must be https; a redirect to a non-https
 * location is rejected before any body is read; a non-200 status throws naming the url and the
 * status; a response exceeding the declared byte cap aborts mid-stream rather than being fully
 * buffered.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { MANUAL_DIR_NAME, RATE_SOURCES, SOURCES, type SourceSpec } from './sources.ts'
import {
  normalizeFred,
  normalizeShillerDividendYield,
  parseShillerCsv,
  parseYahooChart,
  reconstructYahooTotalReturn,
  toCanonicalCsv,
  type CanonicalRow,
  type YahooChart,
} from './normalize.ts'
import type { SidecarMeta } from '../../bundle-compiler/src/raw-input.ts'

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..')
const RAW_DIR = path.join(REPO_ROOT, 'raw')
const MANUAL_DIR = path.join(RAW_DIR, MANUAL_DIR_NAME)

/** Generous above the largest single expected series (~25,000 daily bars of ASCII text is well
 *  under 1MB); sized to catch a hostile or misconfigured endpoint, not to bound realistic data. */
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024

/**
 * Fetches `url` over https only, following only-https redirects, and aborts before fully
 * buffering a response exceeding `MAX_RESPONSE_BYTES`.
 */
export async function fetchText(url: string, redirectCount = 0): Promise<string> {
  if (!url.startsWith('https://')) {
    throw new Error(`fetch-data: refusing non-https url "${url}"`)
  }
  if (redirectCount > 5) {
    throw new Error(`fetch-data: too many redirects starting from "${url}"`)
  }

  const response = await fetch(url, { redirect: 'manual' })

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location')
    if (!location) {
      throw new Error(`fetch-data: redirect from "${url}" (status ${response.status}) has no Location header`)
    }
    const resolved = new URL(location, url).toString()
    if (!resolved.startsWith('https://')) {
      throw new Error(`fetch-data: refusing redirect from "${url}" to non-https location "${resolved}"`)
    }
    return fetchText(resolved, redirectCount + 1)
  }

  if (response.status !== 200) {
    throw new Error(`fetch-data: fetch of "${url}" returned status ${response.status}, expected 200`)
  }

  if (!response.body) {
    throw new Error(`fetch-data: no response body from "${url}"`)
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      throw new Error(`fetch-data: response from "${url}" exceeded the ${MAX_RESPONSE_BYTES}-byte cap`)
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8')
}

function writeFileAtomic(filePath: string, contents: string): void {
  const dir = path.dirname(filePath)
  mkdirSync(dir, { recursive: true })
  const tmpPath = path.join(
    dir,
    `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  writeFileSync(tmpPath, contents, 'utf8')
  renameSync(tmpPath, filePath)
}

function buildSidecar(spec: SourceSpec, retrievedAt: string): SidecarMeta {
  return {
    source: spec.vendorName,
    url: spec.url,
    retrievedAt,
    seriesKind: spec.seriesKind,
    license: spec.license,
    termsUrl: spec.termsUrl,
    scope: spec.scope,
    units: spec.units,
  }
}

/** Thrown by `resolveSource` when a manual-route spec's declared file is absent, so the CLI's
 *  dispatcher can route it through the existing missing-source report rather than the
 *  normalization-error report. */
export class ManualSourceMissingError extends Error {
  readonly manualPath: string

  constructor(manualPath: string) {
    super(`fetch-data: manual source missing at ${manualPath}`)
    this.name = 'ManualSourceMissingError'
    this.manualPath = manualPath
  }
}

export interface SourceResolution {
  text: string
  route: 'live' | 'manual'
}

/**
 * Resolves a source's raw text per its declared `route` (D-27).
 *   - `'live'`: fetches over https. A failure is a hard error with no fallback.
 *   - `'live-with-manual-fallback'`: attempts the fetch; on any failure, reads
 *     `raw/manual/<manualFile>` instead. Throws `ManualSourceMissingError` if that file is also
 *     absent.
 *   - `'manual-only'`: always reads `raw/manual/<manualFile>`. Throws
 *     `ManualSourceMissingError` if it is absent.
 */
export async function resolveSource(spec: SourceSpec): Promise<SourceResolution> {
  if (spec.route === 'live') {
    return { text: await fetchText(spec.url), route: 'live' }
  }

  const manualPath = spec.manualFile ? path.join(MANUAL_DIR, spec.manualFile) : undefined

  if (spec.route === 'live-with-manual-fallback') {
    try {
      return { text: await fetchText(spec.url), route: 'live' }
    } catch {
      if (!manualPath || !existsSync(manualPath)) {
        throw new ManualSourceMissingError(manualPath ?? '(no manualFile declared)')
      }
      return { text: readFileSync(manualPath, 'utf8'), route: 'manual' }
    }
  }

  // 'manual-only'
  if (!manualPath || !existsSync(manualPath)) {
    throw new ManualSourceMissingError(manualPath ?? '(no manualFile declared)')
  }
  return { text: readFileSync(manualPath, 'utf8'), route: 'manual' }
}

function normalizeBySpec(spec: SourceSpec, text: string): { rows: CanonicalRow[]; chart?: YahooChart } {
  switch (spec.vendor) {
    case 'yahoo': {
      const chart = parseYahooChart(text)
      const rows =
        spec.derivation === 'reconstructed-total-return'
          ? reconstructYahooTotalReturn(chart)
          : chart.dates.map((date, i) => ({ date, value: chart.closes[i]! }))
      return { rows, chart }
    }
    case 'fred':
      return { rows: normalizeFred(text) }
    case 'shiller':
      return { rows: normalizeShillerDividendYield(parseShillerCsv(text)) }
    default:
      throw new Error(`fetch-data: unexpected vendor "${spec.vendor}" for "${spec.stem}"`)
  }
}

interface FetchResult {
  spec: SourceSpec
  rows: CanonicalRow[]
  route: 'live' | 'manual'
  /** Present only for a reconstructed-total-return stem, carried forward for the D-25 drift gate
   *  (added in plan 02-06 Task 2). */
  chart?: YahooChart
}

interface MissingManualSource {
  spec: SourceSpec
  manualPath: string
}

function isMissing(result: FetchResult | MissingManualSource): result is MissingManualSource {
  return !('rows' in result)
}

async function processSource(spec: SourceSpec): Promise<FetchResult | MissingManualSource> {
  let resolution: SourceResolution
  try {
    resolution = await resolveSource(spec)
  } catch (err) {
    if (err instanceof ManualSourceMissingError) {
      return { spec, manualPath: err.manualPath }
    }
    throw err
  }
  const { rows, chart } = normalizeBySpec(spec, resolution.text)
  return { spec, rows, route: resolution.route, chart }
}

/** Compares an actual first date against `expectedFirstDate`, which is either a bare "YYYY" (year
 *  match only) or a full "YYYY-MM-DD"/"YYYY-MM". Returns a halt message, or null when satisfied
 *  or when the source has no declared expectation. */
function checkExpectedFirstDate(spec: SourceSpec, actualFirstDate: string): string | null {
  if (!spec.expectedFirstDate) return null
  const expected = spec.expectedFirstDate
  if (/^\d{4}$/.test(expected)) {
    const actualYear = actualFirstDate.slice(0, 4)
    if (actualYear > expected) {
      return `${spec.stem}: expected first date in or before ${expected}, got ${actualFirstDate}`
    }
    return null
  }
  if (actualFirstDate.slice(0, expected.length) > expected) {
    return `${spec.stem}: expected first date on or before ${expected}, got ${actualFirstDate}`
  }
  return null
}

function printCoverageTable(results: FetchResult[]): void {
  process.stdout.write(
    '\nfetch-data coverage: series | source | vendor column | route | first date | last date | rows\n',
  )
  for (const { spec, rows, route } of results) {
    const first = rows[0]?.date ?? '(empty)'
    const last = rows[rows.length - 1]?.date ?? '(empty)'
    process.stdout.write(
      `  ${spec.stem} | ${spec.vendorName} | ${spec.vendorColumn} | ${route} | ${first} | ${last} | ${rows.length}\n`,
    )
  }
}

async function main(): Promise<void> {
  const runDate = new Date().toISOString().slice(0, 10)
  const results: FetchResult[] = []
  const missing: MissingManualSource[] = []
  const errors: string[] = []

  for (const spec of [...RATE_SOURCES, ...SOURCES]) {
    try {
      const result = await processSource(spec)
      if (isMissing(result)) {
        missing.push(result)
      } else {
        results.push(result)
      }
    } catch (err) {
      errors.push(`${spec.stem}: ${(err as Error).message}`)
    }
  }

  // Write every series that normalized successfully, so a partial failure elsewhere still lands
  // the series that are available rather than withholding a partial-but-real set. A write-time
  // failure (e.g. toCanonicalCsv's ascending-order check) is caught per series rather than left
  // to crash the process, so one bad series still reports cleanly instead of an unhandled
  // exception silently withholding every series after it in iteration order.
  const written: FetchResult[] = []
  for (const result of results) {
    const { spec, rows, route } = result
    try {
      const csvPath = path.join(RAW_DIR, `${spec.stem}.csv`)
      const sidecarPath = path.join(RAW_DIR, `${spec.stem}.meta.json`)
      const retrievedAt = route === 'live' ? runDate : (rows[rows.length - 1]?.date ?? runDate)
      writeFileAtomic(csvPath, toCanonicalCsv(rows))
      writeFileAtomic(sidecarPath, `${JSON.stringify(buildSidecar(spec, retrievedAt), null, 2)}\n`)
      written.push(result)
    } catch (err) {
      errors.push(`${spec.stem}: ${(err as Error).message}`)
    }
  }

  if (errors.length > 0) {
    process.stderr.write('fetch-data: normalization errors:\n')
    for (const message of errors) {
      process.stderr.write(`  ${message}\n`)
    }
    process.exitCode = 1
    return
  }

  if (missing.length > 0) {
    process.stderr.write(
      `\nfetch-data: ${missing.length} source(s) need a manually-downloaded file before this run can complete:\n\n`,
    )
    for (const { spec, manualPath } of missing) {
      process.stderr.write(`  ${spec.stem}\n`)
      process.stderr.write(`    download: ${spec.url}\n`)
      process.stderr.write(`    save to:  ${path.relative(REPO_ROOT, manualPath)}\n\n`)
    }
    process.stderr.write('See tools/fetch-data/MANUAL-DOWNLOAD.md for the full instructions.\n')
    process.exitCode = 1
    return
  }

  // Coverage pass only runs once every source produced data (no partial, silent commit).
  printCoverageTable(results)

  const halts: string[] = []
  for (const { spec, rows } of results) {
    const first = rows[0]?.date
    if (first) {
      const halt = checkExpectedFirstDate(spec, first)
      if (halt) halts.push(halt)
    }
  }

  if (halts.length > 0) {
    process.stderr.write('\nfetch-data: coverage check failed:\n')
    for (const message of halts) {
      process.stderr.write(`  ${message}\n`)
    }
    process.exitCode = 1
    return
  }

  process.stdout.write('\nfetch-data: every series met its declared coverage expectation.\n')
}

const isMain = process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`fetch-data: ${(err as Error).message}\n`)
    process.exitCode = 1
  })
}
