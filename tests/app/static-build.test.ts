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
import { extname, join, resolve, sep } from 'node:path'

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

  test('canvas-capture/image-export code exists (SHARE-04, Phase 8, D-04) and is confined to src/export/ plus the declared html-to-image dependency (F-01)', () => {
    // (a) Over every source .ts/.tsx file, any file containing a toDataURL(...) or
    // canvas.toBlob(...) call site sits under src/export/. Phase 4-7 built .screenshot-region for
    // exactly this capture and deliberately deferred the capture code to this phase (F-01) -- the
    // inverted guard now asserts that code EXISTS and stays scoped, rather than that it is absent.
    const srcFiles = collectFiles(resolve(REPO_ROOT, 'src'), ['.ts', '.tsx'])
    const misplacedCaptureCallSites: string[] = []
    let captureCallSiteFound = false
    for (const file of srcFiles) {
      const content = readFileSync(file, 'utf8')
      const hasCapture = content.includes('.toDataURL(') || /canvas\s*\.\s*toBlob\s*\(/.test(content)
      if (!hasCapture) continue
      captureCallSiteFound = true
      if (!file.includes(`${sep}src${sep}export${sep}`)) {
        misplacedCaptureCallSites.push(file)
      }
    }
    expect(
      misplacedCaptureCallSites,
      `capture call site(s) found outside src/export/:\n${misplacedCaptureCallSites.join('\n')}`,
    ).toEqual([])

    // (b) Over the same tree, any file importing the rasterization package sits under src/export/.
    const misplacedRasterizationImports: string[] = []
    let rasterizationImportFound = false
    for (const file of srcFiles) {
      const content = readFileSync(file, 'utf8')
      if (!content.includes('html-to-image')) continue
      rasterizationImportFound = true
      if (!file.includes(`${sep}src${sep}export${sep}`)) {
        misplacedRasterizationImports.push(file)
      }
    }
    expect(
      misplacedRasterizationImports,
      `html-to-image imported outside src/export/:\n${misplacedRasterizationImports.join('\n')}`,
    ).toEqual([])

    expect(captureCallSiteFound, 'expected a canvas-capture call site under src/export/ -- F-01 inversion found none').toBe(
      true,
    )
    expect(
      rasterizationImportFound,
      'expected an html-to-image import under src/export/ -- F-01 inversion found none',
    ).toBe(true)

    const packageJson = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const declaredPackages = new Set([
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
    ])

    // (c) package.json dependencies declares exactly html-to-image.
    expect(declaredPackages.has('html-to-image'), 'package.json does not declare html-to-image as a dependency').toBe(true)

    // (d) package.json declares none of the three sibling rasterization packages the original ban
    // listed by name -- the allow-list is now exactly one name, not zero.
    const stillBannedImageExportPackages = ['dom-to-image', 'dom-to-image-more', 'html2canvas']
    const declaredBanned = stillBannedImageExportPackages.filter((pkg) => declaredPackages.has(pkg))
    expect(declaredBanned, `package.json declares a banned image-export dependency: ${declaredBanned.join(', ')}`).toEqual(
      [],
    )
  })
})
