/**
 * tools/bundle-compiler/tests/headers.test.ts
 *
 * DATA-09's second half. Content hashing (versioning.test.ts) makes a changed asset land on a new
 * URL; `public/_headers` is what makes the browser treat the old URL as permanently cacheable and
 * the new one as a fresh fetch. Neither half alone prevents a redeploy serving a stale asset, and
 * only the hashing half had a test.
 *
 * The assertion that actually earns its place is the last kind: every file the compiler really
 * emits into `public/data/` must be matched by a rule granting an immutable Cache-Control. A rule
 * that exists but no longer matches the emitted filenames is the failure mode a string-equality
 * check on `_headers` would sail straight past.
 *
 * Everything is parsed once at module scope, so each test stands alone and a missing or malformed
 * `_headers` fails at import with the file path in the message rather than cascading undefined
 * through six unrelated assertions.
 */

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..')
const HEADERS_PATH = path.join(REPO_ROOT, 'public', '_headers')
const DATA_DIR = path.join(REPO_ROOT, 'public', 'data')

/** One year, the value Cloudflare's own immutable-asset guidance uses. */
const MIN_IMMUTABLE_MAX_AGE = 31536000

interface HeaderRule {
  glob: string
  headers: Record<string, string>
}

/**
 * Parses the Cloudflare Pages `_headers` format: a path pattern at column zero, followed by one
 * or more indented `Name: value` lines. Blank lines separate rules. The format has no comment
 * syntax, so none is stripped.
 */
function parseHeaders(content: string): HeaderRule[] {
  const rules: HeaderRule[] = []
  let current: HeaderRule | undefined

  content.split('\n').forEach((rawLine, index) => {
    if (rawLine.trim() === '') return

    const isIndented = /^\s/.test(rawLine)
    if (!isIndented) {
      current = { glob: rawLine.trim(), headers: {} }
      rules.push(current)
      return
    }

    if (!current) {
      throw new Error(`public/_headers line ${index + 1}: header line before any path pattern: "${rawLine}"`)
    }
    const match = rawLine.match(/^\s+([^:]+):\s*(.*)$/)
    if (!match) {
      throw new Error(`public/_headers line ${index + 1}: indented line is not "Name: value": "${rawLine}"`)
    }
    current.headers[match[1]!.trim()] = match[2]!.trim()
  })

  return rules
}

/**
 * Translates a Cloudflare path pattern to a regex. `*` matches within one path segment and never
 * crosses `/`, so a rule for `/data/*.bin` does not silently claim `/data/nested/x.bin`.
 */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped.replace(/\*/g, '[^/]*')}$`)
}

const RULES = parseHeaders(readFileSync(HEADERS_PATH, 'utf8'))

function isImmutable(rule: HeaderRule): boolean {
  const value = rule.headers['Cache-Control']
  if (!value || !value.includes('immutable')) return false
  const maxAge = Number(value.match(/max-age=(\d+)/)?.[1] ?? '0')
  return maxAge >= MIN_IMMUTABLE_MAX_AGE
}

function rulesMatching(urlPath: string): HeaderRule[] {
  return RULES.filter((rule) => globToRegex(rule.glob).test(urlPath))
}

const EMITTED_FILES = readdirSync(DATA_DIR)

describe('public/_headers cache policy (DATA-09)', () => {
  test('the file parses into at least one rule', () => {
    expect(RULES.length, `public/_headers at ${HEADERS_PATH} declares no rules`).toBeGreaterThan(0)
  })

  test('a rule covers the binary assets with an immutable, one-year Cache-Control', () => {
    const rule = RULES.find((r) => r.glob === '/data/*.bin')
    expect(rule, 'no rule found for /data/*.bin').toBeDefined()
    expect(rule!.headers['Cache-Control'], '/data/*.bin has no Cache-Control').toContain('immutable')
    expect(
      Number(rule!.headers['Cache-Control']!.match(/max-age=(\d+)/)?.[1] ?? '0'),
    ).toBeGreaterThanOrEqual(MIN_IMMUTABLE_MAX_AGE)
  })

  test('a rule covers the manifest with an immutable, one-year Cache-Control', () => {
    const rule = RULES.find((r) => r.glob === '/data/manifest.*.json')
    expect(rule, 'no rule found for /data/manifest.*.json').toBeDefined()
    expect(rule!.headers['Cache-Control'], '/data/manifest.*.json has no Cache-Control').toContain(
      'immutable',
    )
    expect(
      Number(rule!.headers['Cache-Control']!.match(/max-age=(\d+)/)?.[1] ?? '0'),
    ).toBeGreaterThanOrEqual(MIN_IMMUTABLE_MAX_AGE)
  })

  test('every .bin file the compiler actually emitted is covered by an immutable rule', () => {
    const binFiles = EMITTED_FILES.filter((f) => f.endsWith('.bin'))
    expect(binFiles.length, `no .bin files found in ${DATA_DIR}`).toBeGreaterThan(0)

    const uncovered = binFiles.filter((f) => !rulesMatching(`/data/${f}`).some(isImmutable))
    expect(
      uncovered,
      `these emitted assets would be served without an immutable Cache-Control, so a redeploy could serve them stale: ${uncovered.join(', ')}`,
    ).toEqual([])
  })

  test('the manifest the compiler actually emitted is covered by an immutable rule', () => {
    const manifests = EMITTED_FILES.filter((f) => f.startsWith('manifest.') && f.endsWith('.json'))
    expect(manifests, `expected exactly one manifest.*.json in ${DATA_DIR}`).toHaveLength(1)
    expect(
      rulesMatching(`/data/${manifests[0]!}`).some(isImmutable),
      `${manifests[0]} is not covered by any immutable rule`,
    ).toBe(true)
  })

  test('nothing in public/data/ is left uncovered, whatever the compiler emits', () => {
    // Broader than the two checks above: catches a new asset kind (a .idx, a .meta.json) being
    // emitted without _headers being taught about it.
    const uncovered = EMITTED_FILES.filter((f) => !rulesMatching(`/data/${f}`).some(isImmutable))
    expect(
      uncovered,
      `emitted files with no immutable Cache-Control rule: ${uncovered.join(', ')}`,
    ).toEqual([])
  })

  test('no immutable rule is granted to a path that carries no content hash', () => {
    // An immutable year-long cache on a stable URL (index.html, a bare /data/manifest.json) is
    // unrecoverable without a URL change. Every immutable rule must therefore target a pattern
    // with a wildcard standing in for the content hash. This holds trivially today and is here
    // for Phase 4, when the app shell arrives and index.html must NOT inherit this policy.
    const offenders = RULES.filter(isImmutable)
      .filter((r) => !r.glob.includes('*'))
      .map((r) => r.glob)
    expect(
      offenders,
      `immutable caching on a non-content-hashed path cannot be revoked without renaming the file: ${offenders.join(', ')}`,
    ).toEqual([])
  })

  test('the glob matcher does not cross a path separator, so a rule cannot over-claim a nested path', () => {
    expect(globToRegex('/data/*.bin').test('/data/spx.abc123.bin')).toBe(true)
    expect(globToRegex('/data/*.bin').test('/data/nested/spx.abc123.bin')).toBe(false)
    expect(globToRegex('/data/manifest.*.json').test('/data/manifest.f0a9dfbdfa.json')).toBe(true)
    expect(globToRegex('/data/manifest.*.json').test('/data/manifest.json')).toBe(false)
  })
})
