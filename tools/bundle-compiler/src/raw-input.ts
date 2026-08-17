/**
 * tools/bundle-compiler/src/raw-input.ts
 *
 * Sidecar loading and validation, and the canonical date,value CSV parser (D-02, D-03, T-02-01,
 * T-02-03).
 *
 * Scope derivation: the compiler derives a series' scope from its raw filename's stem up to the
 * first "-", upper-cased (T-02-03), independently of the sidecar's own authored `scope` field.
 * The sidecar's `scope` must equal the derived scope, or the compiler aborts: this is defense in
 * depth so a sidecar cannot claim a scope other than the one its own filename implies.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

export const SCOPE_PATTERN = /^[A-Z0-9._-]+$/

const SIDECAR_SERIES_KINDS = ['price', 'total-return', 'rate', 'dividend-monthly'] as const
const SIDECAR_UNITS = ['index-level', 'percent-annualized', 'ratio'] as const

type SidecarSeriesKind = (typeof SIDECAR_SERIES_KINDS)[number]
type SidecarUnits = (typeof SIDECAR_UNITS)[number]

export interface SidecarMeta {
  source: string
  url: string
  retrievedAt: string
  seriesKind: SidecarSeriesKind
  license: string
  termsUrl: string
  scope: string
  units: SidecarUnits
}

const ALLOWED_KEYS = [
  'source',
  'url',
  'retrievedAt',
  'seriesKind',
  'license',
  'termsUrl',
  'scope',
  'units',
] as const satisfies ReadonlyArray<keyof SidecarMeta>

function deriveScopeFromFilename(csvPath: string): string {
  const stem = path.basename(csvPath, '.csv')
  const firstSegment = stem.split('-')[0] ?? stem
  return firstSegment.toUpperCase()
}

function isAllowedKey(key: string): key is (typeof ALLOWED_KEYS)[number] {
  return (ALLOWED_KEYS as ReadonlyArray<string>).includes(key)
}

/**
 * Loads and validates the sidecar for `csvPath`. Derives the sidecar path by replacing the
 * trailing `.csv` with `.meta.json`. Aborts naming both paths when the sidecar is absent. Builds
 * the returned object key by key into a fresh literal (never spreads the parsed JSON, never
 * deep-merges it), so a `__proto__` or `constructor` key in the file cannot reach a
 * compiler-owned object (T-02-01).
 */
export function loadSidecarOrThrow(csvPath: string): SidecarMeta {
  const sidecarPath = csvPath.replace(/\.csv$/, '.meta.json')
  if (!existsSync(sidecarPath)) {
    throw new Error(
      `compile-data: ${csvPath} has no sidecar at ${sidecarPath}. Every raw CSV must carry provenance (D-02), refusing to compile.`,
    )
  }

  const parsed: unknown = JSON.parse(readFileSync(sidecarPath, 'utf8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`compile-data: ${sidecarPath} must contain a JSON object`)
  }
  const source = parsed as Record<string, unknown>

  for (const key of Object.keys(source)) {
    if (!isAllowedKey(key)) {
      throw new Error(`compile-data: ${sidecarPath} carries unknown key "${key}", not in the allowed field list`)
    }
  }

  const values: Record<string, unknown> = {}
  for (const key of ALLOWED_KEYS) {
    const value = source[key]
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`compile-data: ${sidecarPath} is missing required string field "${key}"`)
    }
    values[key] = value
  }

  const seriesKind = values['seriesKind'] as string
  if (!(SIDECAR_SERIES_KINDS as ReadonlyArray<string>).includes(seriesKind)) {
    throw new Error(
      `compile-data: ${sidecarPath} has seriesKind "${seriesKind}", expected one of ${SIDECAR_SERIES_KINDS.join(', ')}`,
    )
  }

  const units = values['units'] as string
  if (!(SIDECAR_UNITS as ReadonlyArray<string>).includes(units)) {
    throw new Error(`compile-data: ${sidecarPath} has units "${units}", expected one of ${SIDECAR_UNITS.join(', ')}`)
  }

  const derivedScope = deriveScopeFromFilename(csvPath)
  if (!SCOPE_PATTERN.test(derivedScope)) {
    throw new Error(
      `compile-data: ${csvPath} derives scope "${derivedScope}" from its filename, which fails SCOPE_PATTERN ${SCOPE_PATTERN}`,
    )
  }

  const declaredScope = values['scope'] as string
  if (declaredScope !== derivedScope) {
    throw new Error(
      `compile-data: ${sidecarPath} declares scope "${declaredScope}" but ${csvPath}'s filename derives scope "${derivedScope}"`,
    )
  }

  return {
    source: values['source'] as string,
    url: values['url'] as string,
    retrievedAt: values['retrievedAt'] as string,
    seriesKind: seriesKind as SidecarSeriesKind,
    license: values['license'] as string,
    termsUrl: values['termsUrl'] as string,
    scope: derivedScope,
    units: units as SidecarUnits,
  }
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isRealCalendarDate(iso: string): boolean {
  const parts = iso.split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  const d = Number(parts[2])
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

export interface CanonicalCsvRow {
  date: string
  value: number
}

/**
 * Parses the canonical `date,value` CSV schema (D-03). Tolerates a trailing newline and `\r\n`
 * line endings. Requires the header line `date,value` (case-insensitive). Throws naming the
 * 1-based line number for any malformed row, and throws when dates repeat or are not strictly
 * ascending.
 */
export function parseCanonicalCsv(text: string): CanonicalCsvRow[] {
  const normalized = text.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  if (lines.length === 0) {
    throw new Error('compile-data: CSV is empty, expected a "date,value" header line')
  }

  const headerLine = lines[0]!
  if (headerLine.trim().toLowerCase() !== 'date,value') {
    throw new Error(`compile-data: CSV line 1 must be the header "date,value" (case-insensitive), got "${headerLine}"`)
  }

  const rows: CanonicalCsvRow[] = []
  let previousDate: string | null = null

  for (let i = 1; i < lines.length; i++) {
    const lineNumber = i + 1
    const line = lines[i]!
    const fields = line.split(',')
    if (fields.length !== 2) {
      throw new Error(`compile-data: CSV line ${lineNumber} has ${fields.length} fields, expected 2 ("date,value")`)
    }
    const dateStr = fields[0]!
    const valueStr = fields[1]!

    if (!ISO_DATE_PATTERN.test(dateStr)) {
      throw new Error(`compile-data: CSV line ${lineNumber} has a non-ISO date "${dateStr}", expected YYYY-MM-DD`)
    }
    if (!isRealCalendarDate(dateStr)) {
      throw new Error(`compile-data: CSV line ${lineNumber} date "${dateStr}" is not a real calendar date`)
    }
    if (valueStr === '') {
      throw new Error(`compile-data: CSV line ${lineNumber} has a blank value`)
    }
    const value = Number(valueStr)
    if (!Number.isFinite(value)) {
      throw new Error(`compile-data: CSV line ${lineNumber} value "${valueStr}" is not a finite number`)
    }

    if (previousDate !== null) {
      if (dateStr === previousDate) {
        throw new Error(`compile-data: CSV line ${lineNumber} repeats date "${dateStr}"`)
      }
      if (dateStr < previousDate) {
        throw new Error(
          `compile-data: CSV line ${lineNumber} date "${dateStr}" is out of ascending order (previous was "${previousDate}")`,
        )
      }
    }
    previousDate = dateStr
    rows.push({ date: dateStr, value })
  }

  return rows
}

export interface RawSeries {
  scope: string
  /**
   * The raw CSV's filename stem (no directory, no `.csv` extension), e.g. `"RATE-DFF"`. Distinct
   * from `scope`: several raw stems can share one derived `scope` (all four rate inputs derive
   * scope `"RATE"`), so `rawStem` is what `rate-series.ts` matches against `RATE_SOURCE_PRECEDENCE`
   * (plan 02-04).
   */
  rawStem: string
  meta: SidecarMeta
  dates: string[]
  values: number[]
}

/**
 * Reads every `*.csv` in `rawDir`, pairs each with its sidecar, parses it against the canonical
 * schema, and returns the results sorted by scope then kind.
 */
export function loadRawInputs(rawDir: string): RawSeries[] {
  const csvFiles = readdirSync(rawDir)
    .filter((entry) => entry.endsWith('.csv'))
    .sort()

  const series: RawSeries[] = csvFiles.map((file) => {
    const csvPath = path.join(rawDir, file)
    const meta = loadSidecarOrThrow(csvPath)
    const text = readFileSync(csvPath, 'utf8')
    const rows = parseCanonicalCsv(text)
    return {
      scope: meta.scope,
      rawStem: path.basename(file, '.csv'),
      meta,
      dates: rows.map((r) => r.date),
      values: rows.map((r) => r.value),
    }
  })

  series.sort((a, b) => {
    if (a.scope !== b.scope) return a.scope < b.scope ? -1 : 1
    if (a.meta.seriesKind !== b.meta.seriesKind) return a.meta.seriesKind < b.meta.seriesKind ? -1 : 1
    return 0
  })

  return series
}
