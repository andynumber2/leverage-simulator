/**
 * tests/app/export-png.browser.test.ts
 *
 * SHARE-04/D-01/D-02/D-03/D-21: real-browser capture assertions for the PNG export path. Stubs
 * `navigator.clipboard` the same way `tests/app/permalink.browser.test.ts` already does for Copy
 * link -- this environment grants no clipboard-write permission, and Playwright cannot reliably
 * read real clipboard contents, so the stub captures the `ClipboardItem` the handler constructs
 * and reads the Blob back off it via `getType('image/png')`, per 08-01-PLAN.md's own guidance to
 * intercept the blob rather than assert on real clipboard state.
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { mountApp } from '../../src/app/main.tsx'
import { currentKernelResult, resetAppState } from '../../src/app/state.ts'
import { EXPORT_PIXEL_RATIO, EXPORT_WIDTH_PX } from '../../src/export/png-export.ts'

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

beforeEach(() => {
  window.history.replaceState(null, '', window.location.pathname)
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
})

afterEach(() => {
  disposeApp?.()
  disposeApp = undefined
  container?.remove()
  container = undefined
  if (clipboardDescriptor !== undefined) {
    Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
  }
  resetAppState()
  vi.unstubAllGlobals()
})

async function mountAndWaitForMetrics(): Promise<HTMLDivElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)
  await waitFor(() => container!.querySelector('[data-testid="metrics-panel"]') !== null)
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

test('the export row always renders exactly three buttons worth of shape: Export PNG plus the disabled Export CSV placeholder', async () => {
  const el = await mountAndWaitForMetrics()
  const pngButton = el.querySelector('[data-testid="export-png-button"]')
  const csvButton = el.querySelector<HTMLButtonElement>('[data-testid="export-csv-button"]')
  expect(pngButton).not.toBeNull()
  expect(csvButton).not.toBeNull()
  expect(csvButton!.disabled, 'Export CSV ships disabled from this task; 08-02 wires its handler').toBe(true)
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
