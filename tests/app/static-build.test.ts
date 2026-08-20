/**
 * tests/app/static-build.test.ts
 *
 * APP-03/T-04-05: mechanically proves the emitted `dist/` build reaches no external origin,
 * rather than relying on a habit or a code-review glance. Runs against a real `dist/` produced by
 * `npm run build` -- fails with a named message if `dist/` is absent (`beforeAll`) rather than
 * passing vacuously on a missing directory; verified once during implementation by running this
 * file with `dist/` renamed away and confirming the named failure appears.
 *
 * Scans every emitted `.js`, `.css` and `.html` file for an absolute `http`/`https` URL against an
 * explicit, reasoned allow-list declared in THIS file. Every hit not on that allow-list fails the
 * test naming the file and the URL -- deliberately not weakened to a bare "no analytics" string
 * match, which would pass for anything not named analytics. Adding a new external URL to the app
 * therefore becomes a deliberate edit to this array with a written reason, not a silent change
 * nobody sees.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

import { beforeAll, describe, expect, test } from 'vitest'

const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const DIST_DIR = resolve(REPO_ROOT, 'dist')

/**
 * Reasoned allow-list. Each entry is a URL-prefix pattern (matched via `startsWith`, not an exact
 * string) plus a one-line reason a human wrote deliberately -- never widened to a bare substring
 * like "sec.gov" without the full scheme+host prefix, so a look-alike hostile domain cannot slip
 * in under a loosely written pattern.
 */
const ALLOWED_EXTERNAL_URLS: ReadonlyArray<{ readonly prefix: string; readonly reason: string }> = [
  {
    prefix: 'http://www.w3.org/2000/svg',
    reason: 'the SVG namespace URI, used by DOM APIs (createElementNS) to identify an element as SVG -- not a network request',
  },
  {
    prefix: 'http://www.w3.org/1998/Math/MathML',
    reason:
      'the MathML namespace URI, emitted by Solid.js\'s own DOM-namespace-detection codegen for foreignObject/math ' +
      'elements -- the same class of identifier as the SVG namespace URI above, not a network request',
  },
  {
    prefix: 'https://bit.ly/wb-precache',
    reason:
      'a documentation link inside Workbox\'s own bundled console.warn() message text (dist/workbox-*.js) -- library ' +
      'code explaining itself to a developer in devtools, never fetched by the running app',
  },
  {
    prefix: 'https://www.sec.gov/',
    reason:
      'SEC EDGAR prospectus citation strings in src/validation/cost-parameters.ts, documenting where the sourced ' +
      'default expense ratio and financing spread numbers came from (D-18\'s "every default carries its source ' +
      'inline" requirement) -- plain string data compiled into the bundle, never fetched at runtime',
  },
]

const URL_PATTERN = /https?:\/\/[^\s"'<>)]+/g

function collectFiles(dir: string, extensions: readonly string[]): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectFiles(full, extensions))
    } else if (extensions.includes(extname(entry.name))) {
      results.push(full)
    }
  }
  return results
}

function isAllowed(url: string): boolean {
  return ALLOWED_EXTERNAL_URLS.some(({ prefix }) => url.startsWith(prefix))
}

beforeAll(() => {
  if (!existsSync(DIST_DIR)) {
    throw new Error(
      `static-build.test: "${DIST_DIR}" does not exist -- run "npm run build" first. This gate must ` +
        'run against a real production build; it fails loudly here rather than passing vacuously on ' +
        'a missing directory.',
    )
  }
})

describe('static-build gate (APP-03, T-04-05)', () => {
  test('every emitted js/css/html file is free of external URLs outside the reasoned allow-list', () => {
    const files = collectFiles(DIST_DIR, ['.js', '.css', '.html'])
    expect(files.length, 'no js/css/html files found under dist/ -- the build produced nothing to scan').toBeGreaterThan(0)

    const violations: string[] = []
    for (const file of files) {
      const content = readFileSync(file, 'utf8')
      const matches = content.match(URL_PATTERN) ?? []
      for (const url of matches) {
        if (!isAllowed(url)) violations.push(`${file}: ${url}`)
      }
    }
    expect(violations, `unreviewed external URL(s) found:\n${violations.join('\n')}`).toEqual([])
  })

  test('dist/index.html references no script or link element from a non-relative host', () => {
    const indexHtml = readFileSync(resolve(DIST_DIR, 'index.html'), 'utf8')
    const srcOrHrefUrls = [
      ...indexHtml.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g),
    ].map((m) => m[1]!)
    const nonRelative = srcOrHrefUrls.filter((url) => /^[a-z][a-z0-9+.-]*:\/\//i.test(url))
    expect(nonRelative, `dist/index.html references a non-relative host: ${nonRelative.join(', ')}`).toEqual([])
  })

  test('no server-side runtime file was emitted (Cloudflare Pages Functions dir, a worker entry, a proxying _redirects)', () => {
    expect(existsSync(resolve(DIST_DIR, 'functions')), 'dist/functions/ (Pages Functions) was emitted').toBe(false)
    expect(existsSync(resolve(DIST_DIR, '_worker.js')), 'dist/_worker.js (a Pages Worker entry) was emitted').toBe(false)
    expect(existsSync(resolve(DIST_DIR, '_redirects')), 'dist/_redirects (a proxy/redirect rule file) was emitted').toBe(
      false,
    )
  })

  test('no canvas-capture or image-export code ships this phase (SHARE-04 is Phase 8, D-20)', () => {
    const jsFiles = collectFiles(DIST_DIR, ['.js'])
    const captureCallSites: string[] = []
    for (const file of jsFiles) {
      const content = readFileSync(file, 'utf8')
      if (content.includes('.toDataURL(')) captureCallSites.push(`${file}: canvas.toDataURL(...)`)
      if (/canvas\s*\.\s*toBlob\s*\(/.test(content)) captureCallSites.push(`${file}: canvas.toBlob(...)`)
    }
    expect(captureCallSites, `unexpected canvas-capture call site(s):\n${captureCallSites.join('\n')}`).toEqual([])

    const packageJson = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const declaredPackages = new Set([
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
    ])
    const bannedImageExportPackages = ['html-to-image', 'dom-to-image', 'dom-to-image-more', 'html2canvas']
    const declaredBanned = bannedImageExportPackages.filter((pkg) => declaredPackages.has(pkg))
    expect(declaredBanned, `package.json declares an image-export dependency: ${declaredBanned.join(', ')}`).toEqual([])
  })
})
