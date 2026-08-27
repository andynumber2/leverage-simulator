/**
 * tests/app/export-png.browser.test.ts
 *
 * SHARE-04/D-01/D-02/D-03/D-21: real-browser capture assertions for the PNG export path. Stubs
 * `navigator.clipboard` the same way `tests/app/permalink.browser.test.ts` already does for Copy
 * link -- this environment grants no clipboard-write permission, and Playwright cannot reliably
 * read real clipboard contents, so the stub captures the `ClipboardItem` the handler constructs
 * and reads the Blob back off it via `getType('image/png')`, per 08-01-PLAN.md's own guidance to
 * intercept the blob rather than assert on real clipboard state.
 *
 * 08-01 Task 2 (D-22/F-02) adds: sweep-mode sibling placement, the F-02 exclusion mechanism
 * (`data-export-exclude`) proven directly against the live `HoverReadout` node via an instance
 * spy on its own `getAttribute` -- more precise than a pixel scan, since `--color-surface`
 * white already appears throughout the rest of the captured chrome and would make a pure
 * color-presence/absence check ambiguous -- the committed crosshair surviving a real capture
 * (proven empirically by pixel scan, since that exercises html-to-image's actual canvas-rasterization
 * path, which the exclusion mechanism above does not touch), and the Copy-link
 * flush-before-read discipline surviving relocation into the export row.
 *
 * 08-01 Task 3 (D-02/D-03) adds: theme parity (a captured frame pixel matches the theme's real
 * `--color-bg`, opaque, in both themes, driven through the real `setThemeOverride` write path
 * `ThemeToggle.tsx` itself calls) and viewport independence (the identical run captured at two
 * different browser viewport widths is dimension- and pixel-identical), closing
 * `08-RESEARCH.md`'s Assumption A1 by measurement rather than by assumption.
 */

import { page } from 'vitest/browser'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { mountApp } from '../../src/app/main.tsx'
import { gridColToDisplayX, gridRowToDisplayY } from '../../src/heatmap/paint-contour.ts'
import {
  backtestRequest,
  currentKernelResult,
  DEFAULT_REQUEST,
  resetAppState,
  resultMode,
  sweepGrid,
  updateBacktestRequest,
} from '../../src/app/state.ts'
import { resetThemeState, setThemeOverride } from '../../src/app/theme.ts'
import { EXPORT_PIXEL_RATIO, EXPORT_WIDTH_PX, exportRegionAsPng } from '../../src/export/png-export.ts'

const HEATMAP_WIDTH_PX = 800
const HEATMAP_HEIGHT_PX = 240
/** Matches `tests/app/narrow-viewport.browser.test.ts`'s own `DEFAULT_VIEWPORT` -- restored after
 * every test in this file so a viewport change in one test can never leak into the next. */
const DEFAULT_VIEWPORT = { width: 1280, height: 720 } as const

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('export-png.browser.test: waitFor timed out waiting for a condition')
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

let container: HTMLDivElement | undefined
let disposeApp: (() => void) | undefined
let clipboardDescriptor: PropertyDescriptor | undefined
/** Set `true` only by the one test that actually calls `page.viewport(...)` -- `afterEach` skips
 * the restore's own CDP round trip entirely for every other test in this file, since resizing an
 * already-default-sized viewport is pure overhead in a file that already runs a real 10,000-cell
 * sweep and several `html-to-image` captures; this repo's test container is memory-constrained
 * enough that the saved round trips are worth it. */
let viewportChanged = false

beforeEach(() => {
  window.history.replaceState(null, '', window.location.pathname)
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
})

afterEach(async () => {
  disposeApp?.()
  disposeApp = undefined
  container?.remove()
  container = undefined
  if (clipboardDescriptor !== undefined) {
    Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
  }
  resetAppState()
  vi.unstubAllGlobals()
  // Bug found during 08-01 Task 2: the clipboard-rejection test below spies on
  // `document.createElement` via `vi.spyOn(...).mockImplementation(...)`, which
  // `vi.unstubAllGlobals()` does NOT undo (that call only reverts `vi.stubGlobal`). Left
  // unrestored, every DOM node the rest of this file creates -- including every node
  // `html-to-image` clones during a capture -- passed through the mocked wrapper for the
  // remainder of the file, which measurably slowed later heavy tests (a full sweep mount) enough
  // to blow their own timeouts. `restoreAllMocks` is the general fix: every `vi.spyOn` this file
  // creates reverts to its original implementation after the test that created it.
  vi.restoreAllMocks()
  // 08-01 Task 3: the theme-parity/viewport-independence test below drives a real
  // `setThemeOverride('dark')` and resizes the real browser viewport -- both restored here so
  // neither leaks into whichever test runs next, the same discipline this file's earlier
  // `updateBacktestRequest(DEFAULT_REQUEST)` fix applies to the crosshair-commit test above.
  resetThemeState()
  if (viewportChanged) {
    viewportChanged = false
    await page.viewport(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height)
  }
}, 60_000)

async function mountAndWaitForMetrics(timeoutMs = 5000): Promise<HTMLDivElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)
  await waitFor(() => container!.querySelector('[data-testid="metrics-panel"]') !== null, timeoutMs)
  return container
}

/** Captures whatever `ClipboardItem`s the handler passes to `navigator.clipboard.write`, so the
 * test can read the PNG Blob back off them (`getType`) without needing real clipboard-write
 * permission or Playwright's clipboard-read APIs. */
function stubClipboardWrite(): { items: () => readonly ClipboardItem[] } {
  let captured: readonly ClipboardItem[] = []
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      write: async (items: ClipboardItem[]) => {
        captured = items
      },
    },
  })
  return { items: () => captured }
}

async function decodePngDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob)
  const dims = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return dims
}

/** Draws the blob to an offscreen canvas and reads back its pixel buffer, so the test can prove
 * the capture is not a single flat color (D-02's forced-opaque-background requirement combined
 * with real chart/panel content underneath it). */
async function decodePngPixels(blob: Blob): Promise<Uint8ClampedArray> {
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('export-png.browser.test: canvas has no 2d context')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data
}

test('the export row is a following sibling of the screenshot region, never a descendant of it', async () => {
  const el = await mountAndWaitForMetrics()
  const region = el.querySelector('[data-testid="screenshot-region"]')!
  const exportRow = el.querySelector('[data-testid="export-row"]')!

  expect(region.contains(exportRow), 'export row must not be a descendant of the screenshot region').toBe(false)
  const position = region.compareDocumentPosition(exportRow)
  expect(
    (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    'export row must appear after the screenshot region in document order',
  ).toBe(true)
})

test('the Export PNG button is disabled before a result and enabled once a result exists', async () => {
  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)

  const button = container.querySelector<HTMLButtonElement>('[data-testid="export-png-button"]')
  expect(button, 'export-png-button not found before load resolves').not.toBeNull()
  expect(button!.disabled).toBe(true)

  await waitFor(() => currentKernelResult() !== null)
  expect(button!.disabled).toBe(false)
})

test('the export row always renders exactly three buttons worth of shape: Copy link, Export PNG and Export CSV', async () => {
  const el = await mountAndWaitForMetrics()
  const pngButton = el.querySelector<HTMLButtonElement>('[data-testid="export-png-button"]')
  const csvButton = el.querySelector<HTMLButtonElement>('[data-testid="export-csv-button"]')
  expect(pngButton).not.toBeNull()
  expect(csvButton).not.toBeNull()
  // 08-02 wires Export CSV's real handler: enabled here (a completed single-run result exists),
  // matching Export PNG's own disabled condition -- see tests/app/export-csv.browser.test.ts for
  // D-08's separate sweep-mode disabled condition.
  expect(csvButton!.disabled, 'Export CSV should be enabled once a single-run result exists (08-02)').toBe(false)
})

test('clicking Export PNG produces a correctly sized, non-blank PNG Blob passed to the clipboard as a promise', async () => {
  const el = await mountAndWaitForMetrics()
  const clipboard = stubClipboardWrite()

  const region = el.querySelector('[data-testid="screenshot-region"]')!
  // Structural proof that the captured region is not stripped of its receipts (D-01's whole
  // reason for capturing `.screenshot-region` rather than a canvas-only export): both are
  // present in the exact node exportRegionAsPng receives, with no filtering applied to either.
  expect(region.querySelector('[data-testid="provenance-tier"]'), 'provenance strip missing from the captured region').not.toBeNull()
  expect(region.querySelector('[data-testid="metrics-panel"]'), 'metrics panel missing from the captured region').not.toBeNull()

  const button = el.querySelector<HTMLButtonElement>('[data-testid="export-png-button"]')!
  button.click()

  await waitFor(() => button.getAttribute('data-export-state') === 'confirmed')

  const items = clipboard.items()
  expect(items.length).toBe(1)
  const blob = await items[0]!.getType('image/png')
  expect(blob.type).toBe('image/png')

  const { width, height } = await decodePngDimensions(blob)
  expect(width).toBe(EXPORT_WIDTH_PX * EXPORT_PIXEL_RATIO)
  expect(height).toBeGreaterThan(0)

  const pixels = await decodePngPixels(blob)
  const distinctValues = new Set<number>()
  for (let i = 0; i < pixels.length; i += 4) {
    distinctValues.add((pixels[i]! << 16) | (pixels[i + 1]! << 8) | pixels[i + 2]!)
    if (distinctValues.size >= 2) break
  }
  expect(distinctValues.size, 'captured PNG is blank -- a single flat color across every sampled pixel').toBeGreaterThanOrEqual(2)
})

test("two overlapping exportRegionAsPng calls (CR-01) both resolve to a valid PNG and leave the region's inline style fully restored", async () => {
  const el = await mountAndWaitForMetrics()
  const region = el.querySelector<HTMLElement>('[data-testid="screenshot-region"]')!
  const originalCssText = region.style.cssText

  // Fired without an intervening await, the same interleaving a double-clicked Export PNG
  // button produces (08-REVIEW.md CR-01): call2 starts while call1 is still mid-capture.
  const call1 = exportRegionAsPng(region)
  const call2 = exportRegionAsPng(region)
  const [blob1, blob2] = await Promise.all([call1, call2])

  expect(blob1.type).toBe('image/png')
  expect(blob2.type).toBe('image/png')
  expect(
    region.style.cssText,
    'region left in its export layout after two overlapping captures finished -- CR-01 regression',
  ).toBe(originalCssText)
})

test('when the clipboard write rejects, Export PNG falls back to a download and never enters the failed state on that path alone', async () => {
  const el = await mountAndWaitForMetrics()
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      write: () => Promise.reject(new Error('export-png.browser.test: simulated clipboard rejection')),
    },
  })

  let downloadedFilename: string | null = null
  const originalCreateElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => {
    const el2 = originalCreateElement(tag, options)
    if (tag === 'a') {
      const anchor = el2 as HTMLAnchorElement
      const originalClick = anchor.click.bind(anchor)
      anchor.click = () => {
        downloadedFilename = anchor.download
        originalClick()
      }
    }
    return el2
  })

  const button = el.querySelector<HTMLButtonElement>('[data-testid="export-png-button"]')!
  button.click()

  await waitFor(() => downloadedFilename !== null)
  expect(downloadedFilename).toMatch(/^leverage-sim-.*\.png$/)
  expect(button.getAttribute('data-export-state')).not.toBe('failed')
})

// -------------------------------------------------------------------------------------------
// 08-01 Task 2 (D-22/F-02): sweep-mode sibling placement, the hover-readout exclusion, the
// committed crosshair surviving a real capture, and the Copy-link flush discipline surviving
// relocation into the export row.
// -------------------------------------------------------------------------------------------

function dispatchPointer(el: HTMLElement, type: 'pointermove' | 'pointerleave', xPx: number, yPx: number): void {
  const rect = el.getBoundingClientRect()
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      clientX: rect.left + xPx,
      clientY: rect.top + yPx,
      pointerId: 1,
    }),
  )
}

function dispatchClick(el: HTMLElement, xPx: number, yPx: number): void {
  const rect = el.getBoundingClientRect()
  el.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      clientX: rect.left + xPx,
      clientY: rect.top + yPx,
    }),
  )
}

function cellDisplayXY(col: number, row: number, cols: number, rows: number): { x: number; y: number } {
  return {
    x: gridColToDisplayX(col, HEATMAP_WIDTH_PX, cols),
    y: gridRowToDisplayY(row, HEATMAP_HEIGHT_PX, rows),
  }
}

function cssColorToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '')
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

/** Light theme's own fixed accent hex (`src/app/styles.css`), matching `tests/app/crosshair.browser.test.ts`'s
 * identical constant -- the app is not switched to dark theme by this file. */
const ACCENT_RGB = cssColorToRgb('#2e6bd6')

function containsColorClose(pixels: Uint8ClampedArray, target: { r: number; g: number; b: number }, tolerance = 20): boolean {
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]!
    const g = pixels[i + 1]!
    const b = pixels[i + 2]!
    const a = pixels[i + 3]!
    if (a < 200) continue
    if (Math.abs(r - target.r) <= tolerance && Math.abs(g - target.g) <= tolerance && Math.abs(b - target.b) <= tolerance) {
      return true
    }
  }
  return false
}

/** Draws `blob` to an offscreen canvas and reads back its pixel buffer -- the same decode
 * `decodePngPixels` above performs, duplicated locally rather than reused across the boundary
 * because `exportRegionAsPng` is called directly in some tests below (bypassing the button's
 * clipboard/download path entirely) and needs the identical decode shape. */
async function decodeBlobPixels(blob: Blob): Promise<Uint8ClampedArray> {
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('export-png.browser.test: canvas has no 2d context')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data
}

async function mountRealAppInSweepMode(): Promise<HTMLDivElement> {
  window.history.replaceState(null, '', window.location.pathname)
  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)
  await waitFor(() => currentKernelResult() !== null, 15_000)
  const staleGrid = sweepGrid()
  container.querySelector<HTMLInputElement>('[data-testid="sweep-mode-sweep"]')!.click()
  expect(resultMode()).toBe('sweep')
  await waitFor(() => {
    const g = sweepGrid()
    return g !== null && g !== staleGrid && g.cols === 200 && g.rows === 50
  }, 35_000)
  return container
}

// The three sweep-mode assertions below share ONE `mountRealAppInSweepMode()` call rather than
// one mount each. This repo's test container is memory-constrained (the same reason
// `tests/app/log-axis-splits.browser.test.ts` bounds its own series length, per that file's own
// header) and a full sweep-mode mount runs a real 200x50/10,000-cell sweep; three independent
// mounts in one file measurably starved later tests of the resources to complete their own
// initial single-run compute within any reasonable timeout, deterministically, not flakily.
test(
  'sweep mode: export-row sibling placement, hover-readout exclusion, and a committed crosshair surviving capture',
  async () => {
    const el = await mountRealAppInSweepMode()
    const grid = sweepGrid()!
    const overlay = el.querySelector<HTMLCanvasElement>('[data-testid="heatmap-crosshair-overlay"]')!
    const region = el.querySelector<HTMLElement>('[data-testid="screenshot-region"]')!

    // (1) The export row is a following sibling of the sweep screenshot region, never a
    // descendant of it -- HeatmapPanel's own root IS the sweep `.screenshot-region`.
    const exportRow = el.querySelector('[data-testid="export-row"]')!
    expect(region.contains(exportRow), 'export row must not be a descendant of the sweep screenshot region').toBe(false)
    const position = region.compareDocumentPosition(exportRow)
    expect(
      (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      'export row must appear after the sweep screenshot region in document order',
    ).toBe(true)

    // (2) A capture taken while the hover readout is visible excludes it via the
    // data-export-exclude filter. Spied on the exact live readout node's own `getAttribute`, not
    // the prototype -- precise proof that `png-export.ts`'s node filter evaluated THIS element
    // and read the F-02 attribute off it, rather than a pixel-color inference that
    // `--color-surface` white (already present throughout the rest of the captured chrome) would
    // make ambiguous.
    const hoverPoint = cellDisplayXY(50, 10, grid.cols, grid.rows)
    dispatchPointer(overlay, 'pointermove', hoverPoint.x, hoverPoint.y)
    await waitFor(() => el.querySelector('[data-testid="hover-readout"]') !== null)

    const readout = el.querySelector<HTMLElement>('[data-testid="hover-readout"]')!
    const getAttributeSpy = vi.spyOn(readout, 'getAttribute')
    await exportRegionAsPng(region)
    const exclusionChecks = getAttributeSpy.mock.calls
      .map((args, i) => ({ args, result: getAttributeSpy.mock.results[i]!.value as string | null }))
      .filter(({ args }) => args[0] === 'data-export-exclude')
    expect(exclusionChecks.length, 'png-export.ts never queried the hover-readout node for data-export-exclude').toBeGreaterThan(0)
    expect(exclusionChecks.every(({ result }) => result === 'true')).toBe(true)
    getAttributeSpy.mockRestore()

    // (3) A capture taken after a crosshair cell has been committed still contains the
    // accent-colored crosshair overlay -- proven empirically by pixel scan, since that exercises
    // html-to-image's actual canvas-rasterization path, which the attribute-filter proof above
    // does not touch.
    const clickPoint = cellDisplayXY(150, 40, grid.cols, grid.rows)
    dispatchClick(overlay, clickPoint.x, clickPoint.y)
    await waitFor(() => el.querySelector('[data-testid="heatmap-canvas"]') !== null)

    const blob = await exportRegionAsPng(region)
    const pixels = await decodeBlobPixels(blob)
    expect(
      containsColorClose(pixels, ACCENT_RGB),
      'captured PNG contains no accent-colored pixel -- the committed crosshair overlay did not survive the capture',
    ).toBe(true)

    // Bug found while writing this test: the crosshair commit above writes real leverage/
    // entryDate values into `state.ts`'s module-level `backtestRequest` STORE (drill-down,
    // Phase 7 D-22), and `resetAppState()` deliberately does not reset that store (only
    // `loadStatus`/kernel-result/UI-mode signals -- see its own comment). In a real page load a
    // fresh module instance restores `DEFAULT_REQUEST` for free; within one Vitest browser-mode
    // test FILE the module instance is shared across every test, so without this the next test's
    // fresh mount inherited this sweep's row-40 leverage, which happened to land on a parameter
    // combination producing zero plottable bars -- silently starving every later test that waits
    // on `[data-testid="metrics-panel"]`, deterministically, not flakily. Restoring explicitly
    // here keeps this test's own mutation from leaking into whichever test runs next.
    updateBacktestRequest(DEFAULT_REQUEST)
  },
  60_000,
)

test(
  'a Copy link issued immediately after a leverage change yields the settled URL, not a stale one',
  async () => {
    // This test runs immediately after the sweep test above. `state.ts`'s module-singleton sweep
    // Worker pool is left alive by design (`sweepPool` outlives any single sweep and is never
    // torn down by `resetAppState`), so a fresh mount's own initial single-run compute can take
    // longer here than the file's other, lighter mounts -- a modestly generous timeout, not a
    // sign of anything wrong.
    const el = await mountAndWaitForMetrics(20_000)

    const writtenValues: string[] = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (text: string) => { writtenValues.push(text); return Promise.resolve() } },
    })

    const slider = el.querySelector<HTMLInputElement>('[data-testid="leverage-slider"]')!
    const newLeverage = (backtestRequest().leverage === 3 ? 2 : 3).toFixed(2)
    slider.value = newLeverage
    slider.dispatchEvent(new Event('input', { bubbles: true }))
    await waitFor(() => backtestRequest().leverage === Number(newLeverage))

    // No explicit flush call here -- this is the load-bearing case: a Copy link issued
    // IMMEDIATELY after the scrub, before any other code path has flushed the pending
    // trailing-edge-debounced permalink write. CopyLinkButton.tsx's own handleClick must call
    // flushPermalinkUrl() synchronously before reading window.location.href, or this click
    // would copy the URL from before the scrub.
    const copyButton = el.querySelector<HTMLButtonElement>('[data-testid="copy-link-button"]')!
    expect(copyButton.closest('[data-testid="export-row"]'), 'Copy link must be composed inside the export row (D-22)').not.toBeNull()
    copyButton.click()

    await waitFor(() => writtenValues.length > 0)
    const copiedUrl = new URL(writtenValues[0]!)
    expect(copiedUrl.searchParams.get('leverage')).toBe(newLeverage)
  },
  30_000,
)

// -------------------------------------------------------------------------------------------
// 08-01 Task 3 (D-02/D-03): theme parity and viewport independence, closing 08-RESEARCH.md's
// Assumption A1 by measurement.
// -------------------------------------------------------------------------------------------

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

interface DecodedImage {
  width: number
  height: number
  data: Uint8ClampedArray
}

/** The one decode helper both Task 3 blocks share (per the plan's own instruction to put it in
 * the test file, not `src/`) -- returns dimensions and the full pixel buffer together, so a test
 * needs only one `createImageBitmap` round trip per capture. */
async function decodeImage(blob: Blob): Promise<DecodedImage> {
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('export-png.browser.test: canvas has no 2d context')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  return { width: canvas.width, height: canvas.height, data }
}

function pixelAt(image: DecodedImage, x: number, y: number): { r: number; g: number; b: number; a: number } {
  const idx = (y * image.width + x) * 4
  return { r: image.data[idx]!, g: image.data[idx + 1]!, b: image.data[idx + 2]!, a: image.data[idx + 3]! }
}

function cssColorToRgbTask3(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '')
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

/** `src/app/styles.css`'s own `--color-bg` values (matching `tests/app/theme.browser.test.ts`'s
 * identical constants), read here rather than off `getComputedStyle` so the test has an
 * independent expectation to check the capture against. */
const LIGHT_BG_RGB = cssColorToRgbTask3('#f5f6f7')
const DARK_BG_RGB = cssColorToRgbTask3('#14161a')

/** FNV-1a, 32-bit -- a plain deterministic content hash over the decoded pixel buffer. Not
 * cryptographic; only needs to distinguish "identical" from "different" across two captures of
 * up to a few million bytes. */
function fnv1aHash(data: Uint8ClampedArray): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < data.length; i++) {
    hash ^= data[i]!
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

// Theme parity and viewport independence share ONE `mountAndWaitForMetrics()` mount rather than
// one each -- the same resource-accumulation reasoning as the sweep-mode test above: this is the
// 8th and 9th real app mount in this file, and this repo's memory-constrained test container
// measurably could not sustain two more independent mounts back to back with the rest of the
// file's mounts ahead of them, deterministically, not flakily.
test(
  'theme parity and viewport independence: a captured frame pixel matches the live theme, opaque; the same run at two viewport widths is dimension- and pixel-identical',
  async () => {
    const el = await mountAndWaitForMetrics()
    const region = el.querySelector<HTMLElement>('[data-testid="screenshot-region"]')!

    // (1) D-02 theme parity: a captured frame pixel matches --color-bg, opaque, in both themes.
    setThemeOverride('light')
    await nextFrame()
    const lightBlob = await exportRegionAsPng(region)
    const light = await decodeImage(lightBlob)
    // (2, 2) sits inside EXPORT_FRAME_PX's (24px, scaled by EXPORT_PIXEL_RATIO) margin
    // regardless of the ratio, since 2 < 24 * EXPORT_PIXEL_RATIO -- the plan's own coordinate.
    const lightPixel = pixelAt(light, 2, 2)
    expect(lightPixel.a, 'light-theme frame pixel is not fully opaque').toBe(255)
    expect({ r: lightPixel.r, g: lightPixel.g, b: lightPixel.b }).toEqual(LIGHT_BG_RGB)

    setThemeOverride('dark')
    await nextFrame()
    const darkBlob = await exportRegionAsPng(region)
    const dark = await decodeImage(darkBlob)
    const darkPixel = pixelAt(dark, 2, 2)
    expect(darkPixel.a, 'dark-theme frame pixel is not fully opaque').toBe(255)
    expect({ r: darkPixel.r, g: darkPixel.g, b: darkPixel.b }).toEqual(DARK_BG_RGB)

    setThemeOverride('light')
    await nextFrame()

    // (2) D-03 viewport independence: the same run captured at two different browser viewport
    // widths is dimension- and pixel-identical -- closes 08-RESEARCH.md's Assumption A1 by
    // measurement.
    viewportChanged = true
    await page.viewport(1440, 900)
    await nextFrame()
    const wideBlob = await exportRegionAsPng(region)
    const wide = await decodeImage(wideBlob)

    await page.viewport(800, 900)
    await nextFrame()

    // UI-SPEC E1 overflow backstop, verified by measurement rather than by eye: the export row's
    // three buttons wrap via `.export-row`'s own `flex-wrap` rather than overflowing the result
    // column at this width (below the app's 900px stacking breakpoint, D-17). Measured here,
    // reusing the 800px viewport this block already set, rather than a separate mount.
    const exportRow = el.querySelector<HTMLElement>('[data-testid="export-row"]')!
    expect(
      exportRow.scrollWidth,
      `export row clips rather than wraps at 800px (scrollWidth ${exportRow.scrollWidth} > clientWidth ${exportRow.clientWidth})`,
    ).toBeLessThanOrEqual(exportRow.clientWidth)

    const narrowBlob = await exportRegionAsPng(region)
    const narrow = await decodeImage(narrowBlob)

    expect(narrow.width, 'export width must not depend on the live viewport').toBe(wide.width)
    expect(narrow.height, 'export height must not depend on the live viewport').toBe(wide.height)
    expect(narrow.width).toBe(EXPORT_WIDTH_PX * EXPORT_PIXEL_RATIO)

    // The real proof the fixed export width REFLOWED the region rather than merely scaling a
    // viewport-sized layout up: an identical content hash, not just identical dimensions.
    expect(
      fnv1aHash(narrow.data),
      '800px- and 1440px-viewport captures of the same run have different pixel content -- ' +
        '08-RESEARCH.md Assumption A1 is NOT closed: the fixed export width did not reflow every ' +
        'child (see this file\'s own comment on EquityCurveChart.tsx\'s clientWidth-at-build-time sizing)',
    ).toBe(fnv1aHash(wide.data))
  },
  // This is the last, heaviest test in the file: 4 separate `exportRegionAsPng` captures running
  // after 7 prior real app mounts (one a full 10,000-cell sweep). Measured needing well over
  // 40s under this repo's real, memory-constrained test-container load even after trimming this
  // file's own avoidable overhead (a shared mount, a skippable per-test viewport-restore round
  // trip) -- 120s is a property of the shared sandbox, not of this test's own correctness, which
  // isolated runs (this test alone) confirm completes in under 2s.
  120_000,
)
