/**
 * tests/app/theme.browser.test.ts
 *
 * D-19/VIZ-11: proves the theme module end to end -- resolution from an emulated
 * `prefers-color-scheme`, the manual override overriding it, a live system-preference flip
 * leaving an active override untouched, clearing the override returning to following the
 * system, and (the one thing only a rendered pixel can prove) the chart canvas's own sampled
 * pixel colour actually changing between the two themes, read from canvas pixel data rather than
 * from CSS -- which is the only way to prove the explicit repaint happened.
 *
 * `stubSystemPrefersDark` replaces `window.matchMedia` with a fake `MediaQueryList` whose
 * `matches` value and `change` listeners this file controls directly, since there is no
 * `commands`-bridge access to Playwright's real `page.emulateMedia` from the `app` project (only
 * the `bench` project's custom commands reach into the Node-side Playwright host). `theme.ts`'s
 * own header comment explains why this stub is only observed correctly because `getMediaQueryList`
 * re-queries `window.matchMedia` on every call rather than caching a `MediaQueryList` at module
 * import time.
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { mountApp } from '../../src/app/main.tsx'
import { resetAppState } from '../../src/app/state.ts'
import { resetThemeState, setThemeOverride } from '../../src/app/theme.ts'

const LIGHT_BG = '#f5f6f7'
const DARK_BG = '#14161a'

interface SystemPreferenceStub {
  /** Flips the emulated system preference and fires every registered `change` listener, the same
   * way a real OS-level dark-mode toggle would fire `MediaQueryList`'s `change` event. */
  flip: (prefersDark: boolean) => void
}

function stubSystemPrefersDark(initial: boolean): SystemPreferenceStub {
  let current = initial
  const listeners = new Set<() => void>()
  const fakeMediaQueryList = {
    get matches() {
      return current
    },
    addEventListener: (_type: string, callback: () => void) => {
      listeners.add(callback)
    },
    removeEventListener: (_type: string, callback: () => void) => {
      listeners.delete(callback)
    },
  } as unknown as MediaQueryList
  vi.stubGlobal('matchMedia', (_query: string) => fakeMediaQueryList)
  return {
    flip: (prefersDark: boolean) => {
      current = prefersDark
      for (const callback of listeners) callback()
    },
  }
}

async function settle(): Promise<void> {
  // Two animation frames: the first runs before the browser paints the frame it was scheduled
  // in, the second only after that paint -- same discipline main.tsx's own app-data-ready mark
  // uses, so a synchronous Solid effect triggered by setThemeOverride has genuinely flushed and
  // painted before the next assertion reads DOM/canvas state.
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('theme.browser.test: waitFor timed out waiting for a condition')
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

function readBackgroundToken(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim()
}

/** Scans a canvas for the first pixel that differs from its own top-left (background) pixel --
 * whatever axis, gridline or curve ink happens to be drawn there. Every one of those elements
 * reads `--color-accent`/`--color-text-muted` at render time (EquityCurveChart.tsx), so any
 * non-background pixel changing colour between the two themes is a legitimate proof of the
 * explicit repaint, not a coincidence tied to one specific series. */
function findNonBackgroundPixel(canvas: HTMLCanvasElement): { x: number; y: number } {
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('theme.browser.test: canvas has no 2d context')
  const { width, height } = canvas
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data
  const bg: [number, number, number, number] = [data[0]!, data[1]!, data[2]!, data[3]!]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const r = data[idx]!
      const g = data[idx + 1]!
      const b = data[idx + 2]!
      const a = data[idx + 3]!
      if (r !== bg[0] || g !== bg[1] || b !== bg[2] || a !== bg[3]) {
        return { x, y }
      }
    }
  }
  throw new Error('theme.browser.test: no non-background pixel found on the equity curve canvas')
}

function readPixel(canvas: HTMLCanvasElement, x: number, y: number): [number, number, number, number] {
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('theme.browser.test: canvas has no 2d context')
  const data = ctx.getImageData(x, y, 1, 1).data
  return [data[0]!, data[1]!, data[2]!, data[3]!]
}

let container: HTMLDivElement | undefined
let disposeApp: (() => void) | undefined

beforeEach(() => {
  // Plan 04-07's iframe-harness-param note: clear the Vitest browser-mode iframe's own incidental
  // query params before every mount, same as tracer.browser.test.ts.
  window.history.replaceState(null, '', window.location.pathname)
})

afterEach(() => {
  disposeApp?.()
  disposeApp = undefined
  container?.remove()
  container = undefined
  resetAppState()
  resetThemeState()
  document.documentElement.removeAttribute('data-theme')
  vi.unstubAllGlobals()
  performance.clearMarks('app-data-ready')
  performance.clearMarks('app-interactive')
  performance.clearMeasures('app-recompute')
})

async function mountAndWaitForChart(): Promise<void> {
  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)
  await waitFor(() => container!.querySelector('[data-testid="equity-curve-chart"] canvas') !== null)
}

test('with prefers-color-scheme emulated dark, data-theme resolves to dark and the background computes to the dark token', async () => {
  stubSystemPrefersDark(true)
  await mountAndWaitForChart()

  expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  expect(readBackgroundToken()).toBe(DARK_BG)
})

test('forcing the light override flips both, even while the system reports dark', async () => {
  stubSystemPrefersDark(true)
  await mountAndWaitForChart()
  expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

  setThemeOverride('light')
  await settle()

  expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  expect(readBackgroundToken()).toBe(LIGHT_BG)
})

test('flipping the emulated system preference while an override is active does not change the resolved theme', async () => {
  const system = stubSystemPrefersDark(false)
  await mountAndWaitForChart()
  expect(document.documentElement.getAttribute('data-theme')).toBe('light')

  setThemeOverride('light')
  await settle()

  system.flip(true) // the OS now reports dark; the active override must still win
  await settle()

  expect(document.documentElement.getAttribute('data-theme')).toBe('light')
})

test('clearing the override returns to following the system', async () => {
  const system = stubSystemPrefersDark(true)
  await mountAndWaitForChart()
  expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

  setThemeOverride('light')
  await settle()
  expect(document.documentElement.getAttribute('data-theme')).toBe('light')

  setThemeOverride('system')
  await settle()
  expect(document.documentElement.getAttribute('data-theme')).toBe('dark') // system is still dark

  system.flip(false)
  await settle()
  expect(document.documentElement.getAttribute('data-theme')).toBe('light') // still following
})

test("the chart canvas's sampled stroke pixel differs between the light and dark themes", async () => {
  await mountAndWaitForChart()

  const canvasBefore = container!.querySelector<HTMLCanvasElement>('[data-testid="equity-curve-chart"] canvas')
  expect(canvasBefore).not.toBeNull()
  const { x, y } = findNonBackgroundPixel(canvasBefore!)
  const lightPixel = readPixel(canvasBefore!, x, y)

  setThemeOverride('dark')
  await settle()
  await waitFor(() => container!.querySelector('[data-testid="equity-curve-chart"] canvas') !== null)

  // rebuildChart destroys and recreates uPlot's own canvas element on every rebuild (including
  // this theme-triggered one), so the post-toggle canvas is genuinely a new DOM node -- re-query
  // rather than reuse the reference captured above.
  const canvasAfter = container!.querySelector<HTMLCanvasElement>('[data-testid="equity-curve-chart"] canvas')
  expect(canvasAfter).not.toBeNull()
  const darkPixel = readPixel(canvasAfter!, x, y)

  expect(darkPixel).not.toEqual(lightPixel)
})
