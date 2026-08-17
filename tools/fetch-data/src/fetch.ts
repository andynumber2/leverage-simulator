/**
 * tools/fetch-data/src/fetch.ts
 *
 * The fetch CLI: for FRED sources, pulls over https and normalizes. For Stooq and Shiller
 * sources, reads a manually-placed vendor file from `raw/manual/<stem>.csv` and normalizes it
 * exactly as if it had been fetched (Route C for Stooq, Route B for Shiller — see sources.ts's
 * header comment). Writes `raw/<stem>.csv` plus `raw/<stem>.meta.json`, then runs a coverage pass
 * that halts on any series falling short of its declared expected first date, or on a
 * total-return stem whose data is byte-identical to its price-return sibling.
 *
 * Transport rules (T-02-12, T-02-14): every fetched url must be https; a redirect to a non-https
 * location is rejected before any body is read; a non-200 status throws naming the url and the
 * status; a response exceeding the declared byte cap aborts mid-stream rather than being fully
 * buffered.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { RATE_SOURCES, SOURCES, type SourceSpec } from './sources.ts'
import {
  normalizeFred,
  normalizeShillerDividendYield,
  normalizeStooq,
  parseShillerCsv,
  toCanonicalCsv,
  type CanonicalRow,
} from './normalize.ts'
import type { SidecarMeta } from '../../bundle-compiler/src/raw-input.ts'

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..')
const RAW_DIR = path.join(REPO_ROOT, 'raw')
const MANUAL_DIR = path.join(RAW_DIR, 'manual')

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

interface FetchResult {
  spec: SourceSpec
  rows: CanonicalRow[]
}

interface MissingManualSource {
  spec: SourceSpec
  manualPath: string
}

async function processFredSource(spec: SourceSpec): Promise<FetchResult> {
  const text = await fetchText(spec.url)
  const rows = normalizeFred(text)
  return { spec, rows }
}

function processManualSource(spec: SourceSpec): FetchResult | MissingManualSource {
  const manualPath = path.join(MANUAL_DIR, `${spec.stem}.csv`)
  if (!existsSync(manualPath)) {
    return { spec, manualPath }
  }
  const text = readFileSync(manualPath, 'utf8')
  if (spec.vendor === 'stooq') {
    return { spec, rows: normalizeStooq(text) }
  }
  if (spec.vendor === 'shiller') {
    const shillerRows = parseShillerCsv(text)
    return { spec, rows: normalizeShillerDividendYield(shillerRows) }
  }
  throw new Error(`fetch-data: unexpected manual vendor "${spec.vendor}" for "${spec.stem}"`)
}

function isMissing(result: FetchResult | MissingManualSource): result is MissingManualSource {
  return !('rows' in result)
}

function rowsSignature(rows: CanonicalRow[]): string {
  return rows.map((r) => `${r.date},${r.value}`).join('\n')
}

/** Compares an actual first date against `expectedFirstDate`, which is either a bare "YYYY" (year
 *  match only) or a full "YYYY-MM-DD"/"YYYY-MM". Returns a halt message, or null when satisfied
 *  or when the source has no declared expectation (RESEARCH.md open question 2). */
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

function checkTotalReturnDistinct(results: Map<string, FetchResult>): string[] {
  const halts: string[] = []
  for (const result of results.values()) {
    if (result.spec.seriesKind !== 'total-return') continue
    const prStem = result.spec.stem.replace(/-TR$/, '-PR')
    const prResult = results.get(prStem)
    if (!prResult) continue
    if (rowsSignature(result.rows) === rowsSignature(prResult.rows)) {
      halts.push(
        `${result.spec.stem}: total-return data is byte-identical to ${prStem}'s price-return data; ` +
          `no distinct total-return series was obtained from the locked source stack (RESEARCH.md assumption A2)`,
      )
    }
  }
  return halts
}

function printCoverageTable(results: FetchResult[]): void {
  process.stdout.write(
    '\ncompile-data coverage: series | source | vendor column | first date | last date | rows\n',
  )
  for (const { spec, rows } of results) {
    const first = rows[0]?.date ?? '(empty)'
    const last = rows[rows.length - 1]?.date ?? '(empty)'
    process.stdout.write(
      `  ${spec.stem} | ${spec.vendorName} | ${spec.vendorColumn} | ${first} | ${last} | ${rows.length}\n`,
    )
  }
}

async function main(): Promise<void> {
  const retrievedAt = new Date().toISOString().slice(0, 10)
  const results: FetchResult[] = []
  const missing: MissingManualSource[] = []
  const errors: string[] = []

  for (const spec of RATE_SOURCES) {
    try {
      results.push(await processFredSource(spec))
    } catch (err) {
      errors.push(`${spec.stem}: ${(err as Error).message}`)
    }
  }

  for (const spec of SOURCES) {
    try {
      const result = processManualSource(spec)
      if (isMissing(result)) {
        missing.push(result)
      } else {
        results.push(result)
      }
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

  // Write every source that produced data, so a partial manual set still lands real,
  // already-available series (e.g. the FRED rate inputs) even while Stooq/Shiller await a human.
  for (const { spec, rows } of results) {
    const csvPath = path.join(RAW_DIR, `${spec.stem}.csv`)
    const sidecarPath = path.join(RAW_DIR, `${spec.stem}.meta.json`)
    writeFileAtomic(csvPath, toCanonicalCsv(rows))
    writeFileAtomic(sidecarPath, `${JSON.stringify(buildSidecar(spec, retrievedAt), null, 2)}\n`)
  }

  if (missing.length > 0) {
    process.stderr.write(
      `\nfetch-data: ${missing.length} source(s) need a manually-downloaded file before this run can complete:\n\n`,
    )
    for (const { spec, manualPath } of missing) {
      const guessNote = spec.totalReturnGuess
        ? ' [UNVERIFIED total-return symbol — see MANUAL-DOWNLOAD.md]'
        : ''
      process.stderr.write(`  ${spec.stem}${guessNote}\n`)
      process.stderr.write(`    download: ${spec.url}\n`)
      process.stderr.write(`    save to:  ${path.relative(REPO_ROOT, manualPath)}\n\n`)
    }
    process.stderr.write('See tools/fetch-data/MANUAL-DOWNLOAD.md for the full instructions.\n')
    process.exitCode = 1
    return
  }

  // Coverage pass only runs once every source produced data (T-02-16: no partial, silent commit).
  printCoverageTable(results)

  const resultsByStem = new Map(results.map((r) => [r.spec.stem, r]))
  const halts: string[] = []
  for (const { spec, rows } of results) {
    const first = rows[0]?.date
    if (first) {
      const halt = checkExpectedFirstDate(spec, first)
      if (halt) halts.push(halt)
    }
  }
  halts.push(...checkTotalReturnDistinct(resultsByStem))

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
