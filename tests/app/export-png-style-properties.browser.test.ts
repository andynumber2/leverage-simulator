/**
 * tests/app/export-png-style-properties.browser.test.ts
 *
 * Standing guard for the PERF-07a fix in `src/export/png-export.ts`
 * (`.planning/debug/resolved/png-export-long-task-budget.md`).
 *
 * The fix hands `html-to-image` an `includeStyleProperties` list derived at runtime, in place of
 * its default of copying every computed CSS property (495 of them in Chromium) onto all 84 cloned
 * elements. That default was the whole of the long task: 674,612 characters of inline style to
 * write, XML-serialize, percent-encode into a 928 KB `data:` URL and parse back, all inside one
 * main-thread task, measured at 120ms on the 4-core CI baseline against a 50ms budget.
 *
 * Narrowing that list is only safe while the derivation stays complete. Two failure modes are
 * possible and neither is loud on its own:
 *
 *   1. A property the page really does declare stops being found -- a stylesheet the walk does not
 *      reach (a shadow root's own sheet, a cross-origin sheet), or a property some future code
 *      sets inline on an element the scan does not cover. The export then silently renders that
 *      property at its default value and nobody notices until someone looks closely at a shared
 *      PNG. Tests 1-3 below fail instead.
 *   2. The narrowing quietly stops applying -- `refreshExportStyleProperties` starts returning
 *      false, or a future `html-to-image` copies the array instead of holding it by reference.
 *      Output stays correct and the 120ms breach comes back. Test 4 fails instead.
 *
 * Test 4 is the real oracle: it captures the same region twice in one page session, once through
 * the narrowed list and once with that same array widened back to the browser's full
 * computed-property set, and asserts the two PNGs are byte-identical. That equivalence was
 * established during the investigation across both result modes, both themes and CPU throttle
 * rates from 1x to 4x; this pins it.
 */

import { afterEach, beforeEach, expect, test } from 'vitest'
import { toSvg } from 'html-to-image'

import { mountApp } from '../../src/app/main.tsx'
import { currentKernelResult, resetAppState, resultMode, sweepGrid } from '../../src/app/state.ts'
import { resetThemeState } from '../../src/app/theme.ts'
import { EXPORT_PIXEL_RATIO, exportRegionAsPng, exportStylePropertiesForTest } from '../../src/export/png-export.ts'

let container: HTMLDivElement | undefined
let disposeApp: (() => void) | undefined

beforeEach(() => {
  window.history.replaceState(null, '', window.location.pathname)
})

afterEach(() => {
  disposeApp?.()
  disposeApp = undefined
  container?.remove()
  container = undefined
  resetAppState()
  resetThemeState()
}, 60_000)

async function waitFor(predicate: () => boolean, timeoutMs = 15_000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('export-png-style-properties: waitFor timed out waiting for a condition')
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

async function mountSingleRun(): Promise<HTMLDivElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)
  await waitFor(() => container!.querySelector('[data-testid="metrics-panel"]') !== null)
  await waitFor(() => currentKernelResult() !== null)
  return container
}

async function mountSweep(): Promise<HTMLDivElement> {
  const el = await mountSingleRun()
  const staleGrid = sweepGrid()
  el.querySelector<HTMLInputElement>('[data-testid="sweep-mode-sweep"]')!.click()
  expect(resultMode()).toBe('sweep')
  await waitFor(() => {
    const grid = sweepGrid()
    return grid !== null && grid !== staleGrid && grid.cols === 200 && grid.rows === 50
  }, 35_000)
  return el
}

function regionOf(el: HTMLElement): HTMLElement {
  return el.querySelector<HTMLElement>('[data-testid="screenshot-region"]')!
}

/** Every property name the live region currently carries in an inline `style` attribute, which is
 * the half of the derivation that cannot be read off the stylesheets. uPlot positions its cursor
 * elements this way and the heatmap positions its axis tick labels this way, so this set is not
 * empty in either result mode. */
function inlineStylePropertiesIn(region: HTMLElement): string[] {
  const names = new Set<string>()
  for (const element of [region, ...region.querySelectorAll('*')]) {
    const declarations = (element as HTMLElement).style
    if (declarations === undefined) continue
    for (let index = 0; index < declarations.length; index += 1) {
      const name = declarations[index]
      if (name !== undefined) names.add(name)
    }
  }
  return [...names]
}

/** Every property name declared by any rule in any readable stylesheet, computed here
 * independently of the implementation so this file checks the derivation rather than restating
 * it. Grouping rules are recursed into so a declaration inside `@media`/`@supports`/`@layer` or a
 * `@keyframes` block counts. */
function declaredStyleProperties(): string[] {
  const names = new Set<string>()
  const walk = (rules: CSSRuleList): void => {
    for (let index = 0; index < rules.length; index += 1) {
      const rule = rules[index]
      if (rule === undefined) continue
      const declarations = (rule as CSSStyleRule).style
      if (declarations !== undefined) {
        for (let property = 0; property < declarations.length; property += 1) {
          const name = declarations[property]
          if (name !== undefined) names.add(name)
        }
      }
      const nested = (rule as CSSGroupingRule).cssRules
      if (nested !== undefined) walk(nested)
    }
  }
  for (const sheet of [...document.styleSheets, ...document.adoptedStyleSheets]) walk(sheet.cssRules)
  return [...names]
}

function fullComputedPropertyNames(): string[] {
  const computed = getComputedStyle(document.documentElement)
  const names: string[] = []
  for (let index = 0; index < computed.length; index += 1) {
    const name = computed[index]
    if (name !== undefined) names.push(name)
  }
  return names
}

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

test('the derived list covers every property the document declares, in both result modes', async () => {
  const el = await mountSingleRun()
  const singleRun = exportStylePropertiesForTest()
  expect(
    singleRun.complete,
    'every stylesheet in this app is same-origin and readable, so the derivation must not be ' +
      'falling back to the library default -- a false here means the 120ms PERF-07a breach is back',
  ).toBe(true)

  for (const name of declaredStyleProperties()) {
    expect(singleRun.properties, `stylesheet-declared property "${name}" is missing from the export list`).toContain(name)
  }
  for (const name of inlineStylePropertiesIn(regionOf(el))) {
    expect(
      singleRun.properties,
      `property "${name}" appears in an inline style attribute inside the region but is missing ` +
        'from the export list, so the exported PNG would render it at its default value',
    ).toContain(name)
  }

  // `content` is the single point of failure for pseudo-elements: html-to-image's non-cssText
  // branch has no special handling for it (`clone-pseudos.ts`, `formatCSSProperties`), so a
  // pseudo-element renders as nothing at all if `content` is not in the list.
  expect(singleRun.properties, 'pseudo-element `content` must be copied or ::before/::after vanish').toContain('content')

  // The narrowing has to actually narrow, or nothing was gained.
  expect(
    singleRun.properties.length,
    'the derived list must be a small fraction of the browser full computed-property set',
  ).toBeLessThan(fullComputedPropertyNames().length / 2)
}, 90_000)

test('switching result mode extends the list in place rather than leaving it stale', async () => {
  const el = await mountSweep()
  const sweep = exportStylePropertiesForTest()
  expect(sweep.complete).toBe(true)
  for (const name of inlineStylePropertiesIn(regionOf(el))) {
    expect(
      sweep.properties,
      `sweep mode puts "${name}" in an inline style attribute inside the region. html-to-image ` +
        'memoizes the FIRST includeStyleProperties array it is given and holds it by reference, ' +
        'so this name has to reach the array the single-run capture already handed it',
    ).toContain(name)
  }
}, 120_000)

test('an unreadable stylesheet gives up the optimization rather than the fidelity', async () => {
  await mountSingleRun()
  const sheet = document.styleSheets[0]
  expect(sheet, 'the app stylesheet must be present for this test to mean anything').toBeDefined()

  Object.defineProperty(sheet!, 'cssRules', {
    configurable: true,
    get: () => {
      throw new DOMException('simulated cross-origin stylesheet', 'SecurityError')
    },
  })
  try {
    expect(
      exportStylePropertiesForTest().complete,
      'a stylesheet whose rules cannot be read leaves the derived list silently short, and a ' +
        'short list is a wrong exported image -- the capture must fall back to the full list',
    ).toBe(false)
  } finally {
    delete (sheet as unknown as { cssRules?: unknown }).cssRules
  }

  expect(exportStylePropertiesForTest().complete, 'readable again once the sheet is restored').toBe(true)
}, 90_000)

test('narrowing the copied property set leaves the exported PNG byte-identical', async () => {
  const el = await mountSingleRun()
  const region = regionOf(el)

  // Strict ordering, and load-bearing. html-to-image memoizes the first `includeStyleProperties`
  // it is handed for the lifetime of its module, so this must be the FIRST call into the library
  // in this page: it is what seeds that cache with png-export's own array instance. Every
  // subsequent call below then reads whatever that array currently holds.
  const narrowPng = await sha256(await exportRegionAsPng(region))
  const narrowSvgLength = (await toSvg(region, { pixelRatio: EXPORT_PIXEL_RATIO })).length

  // Widen that same instance back to exactly the list html-to-image would have built for itself,
  // which is what `getStyleProperties` falls back to when no option is passed.
  const { properties } = exportStylePropertiesForTest()
  const narrowLength = properties.length
  for (const name of fullComputedPropertyNames()) {
    if (!properties.includes(name)) properties.push(name)
  }
  expect(properties.length, 'the full computed set must be strictly larger than the derived list').toBeGreaterThan(narrowLength)

  const wideSvgLength = (await toSvg(region, { pixelRatio: EXPORT_PIXEL_RATIO })).length
  // Guards this test against becoming vacuous. If a future html-to-image copied the array instead
  // of holding it by reference, widening would have no effect, both captures would run the same
  // list and the byte-equality assertion below would pass while proving nothing. It would also
  // mean the in-place refresh the other tests rely on had stopped working.
  expect(
    wideSvgLength,
    'widening the array must reach the library, or nothing below is being compared',
  ).toBeGreaterThan(narrowSvgLength * 2)

  const widePng = await sha256(await exportRegionAsPng(region))
  expect(
    widePng,
    'copying only the properties the document declares must produce the same image as copying ' +
      'every computed property -- if these differ, the derivation is dropping something the page needs',
  ).toBe(narrowPng)
}, 120_000)
