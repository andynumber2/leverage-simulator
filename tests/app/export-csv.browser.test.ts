/**
 * tests/app/export-csv.browser.test.ts
 *
 * 08-02-PLAN.md Task 3: the real browser round trip the Node test cannot -- the downloaded Blob's
 * `type` and line-count shape, the equity curve canvas surviving a real export (T-08-09's
 * mechanical proof that the Worker received `.slice()` copies rather than the live `KernelOutputs`
 * buffers the chart is still reading), and D-08's sweep-mode disable/reason-note cycle.
 *
 * This repo's test container is memory-constrained (`tests/app/export-png.browser.test.ts`'s own
 * header documents the ~1.9GB ceiling this file inherits). The sweep-mode assertions below share
 * ONE mount and ONE real 10,000-cell sweep rather than one each, following that file's precedent.
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { mountApp } from '../../src/app/main.tsx'
import {
  activeTier,
  backtestRequest,
  currentKernelInputs,
  displayedMetric,
  loadedBundle,
  resetAppState,
  resultMode,
  scaleMode,
} from '../../src/app/state.ts'
import { buildPreambleLines } from '../../src/export/csv-preamble.ts'

async function waitFor(predicate: () => boolean, timeoutMs = 15_000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('export-csv.browser.test: waitFor timed out waiting for a condition')
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

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
  vi.restoreAllMocks()
})

async function mountAndWaitForMetrics(timeoutMs = 15_000): Promise<HTMLDivElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mountApp(container)
  await waitFor(() => container!.querySelector('[data-testid="metrics-panel"]') !== null, timeoutMs)
  return container
}

/** Captures the actual Blob `triggerDownload` (`src/export/download.ts`) hands to
 * `URL.createObjectURL`, and the filename the synthetic anchor's `download` attribute carries.
 * Intercepting at this layer -- rather than fetching the resulting `blob:` URL back -- sidesteps
 * any ordering question between the anchor click and `download.ts`'s own `URL.revokeObjectURL`
 * call in its `finally` block. */
function captureDownload(): { blob: () => Blob | null; filename: () => string | null } {
  let capturedBlob: Blob | null = null
  let capturedFilename: string | null = null

  const originalCreateObjectURL = URL.createObjectURL.bind(URL)
  vi.spyOn(URL, 'createObjectURL').mockImplementation((obj: Blob | MediaSource) => {
    if (obj instanceof Blob) capturedBlob = obj
    return originalCreateObjectURL(obj as Blob)
  })

  const originalCreateElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => {
    const el = originalCreateElement(tag, options)
    if (tag === 'a') {
      const anchor = el as HTMLAnchorElement
      const originalClick = anchor.click.bind(anchor)
      anchor.click = () => {
        capturedFilename = anchor.download
        originalClick()
      }
    }
    return el
  })

  return { blob: () => capturedBlob, filename: () => capturedFilename }
}

/** Independently predicts the preamble's line count from the live app's own current state, the
 * same way `ExportRow.tsx`'s real handler does -- used only to compute an expected line count;
 * the exact timestamp text inside each build differs (`new Date().toISOString()`), the count does
 * not. */
function expectedPreambleLineCount(): number {
  const inputs = currentKernelInputs()!
  const bundle = loadedBundle()!
  const lines = buildPreambleLines(
    inputs,
    backtestRequest(),
    activeTier(),
    scaleMode(),
    'single',
    displayedMetric(),
    window.location.href,
    bundle.manifest,
  )
  return lines.length
}

function equityCurveCanvas(el: HTMLElement): HTMLCanvasElement {
  const canvas = el.querySelector<HTMLCanvasElement>('[data-testid="equity-curve-chart"] canvas')
  if (canvas === null) throw new Error('export-csv.browser.test: equity curve canvas not found')
  return canvas
}

function canvasHasNonBlankContent(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d')
  if (ctx === null) return false
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const distinctValues = new Set<number>()
  for (let i = 0; i < data.length; i += 4) {
    distinctValues.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!)
    if (distinctValues.size >= 2) return true
  }
  return false
}

test('in single-run mode, Export CSV is enabled and clicking it produces a text/csv Blob whose shape matches the preamble plus header plus barCount, without disturbing the chart', async () => {
  const el = await mountAndWaitForMetrics()
  const button = el.querySelector<HTMLButtonElement>('[data-testid="export-csv-button"]')!
  expect(button.disabled).toBe(false)

  const canvas = equityCurveCanvas(el)
  expect(canvasHasNonBlankContent(canvas), 'equity curve canvas is blank before the export').toBe(true)

  const preambleLineCount = expectedPreambleLineCount()
  const barCount = currentKernelInputs()!.window.barCount

  const capture = captureDownload()
  button.click()

  await waitFor(() => capture.blob() !== null)
  const blob = capture.blob()!
  expect(blob.type).toBe('text/csv')

  const text = await blob.text()
  expect(text.startsWith('#')).toBe(true)
  const lines = text.slice(0, -1).split('\n')
  expect(lines.length).toBe(preambleLineCount + 1 + barCount)

  expect(capture.filename()).toMatch(/^leverage-sim-.*\.csv$/)

  // T-08-09: the chart still renders non-blank content after the export -- the Worker received
  // .slice() copies, not the live KernelOutputs buffers the chart is still reading.
  expect(canvasHasNonBlankContent(canvas), 'equity curve canvas went blank after the CSV export').toBe(true)
})

// The two D-08 assertions below (three-button shape, disable/reason-note cycle) share ONE mount
// and ONE real sweep-mode switch rather than one each -- see this file's own header.
test(
  'sweep mode: Export CSV disables with the D-08 reason note, single mode re-enables it, and the export row keeps exactly three buttons in both modes',
  async () => {
    const el = await mountAndWaitForMetrics()
    const button = el.querySelector<HTMLButtonElement>('[data-testid="export-csv-button"]')!
    expect(button.disabled).toBe(false)
    expect(el.querySelector('[data-testid="export-csv-disabled-reason"]')).toBeNull()
    expect(el.querySelectorAll('[data-testid="export-row"] button').length).toBe(3)

    el.querySelector<HTMLInputElement>('[data-testid="sweep-mode-sweep"]')!.click()
    await waitFor(() => resultMode() === 'sweep')
    await waitFor(() => button.disabled === true)

    const note = el.querySelector('[data-testid="export-csv-disabled-reason"]')
    expect(note).not.toBeNull()
    expect(note!.textContent).toBe('Switch to Single run to export a daily series.')
    expect(el.querySelectorAll('[data-testid="export-row"] button').length).toBe(3)

    el.querySelector<HTMLInputElement>('[data-testid="sweep-mode-single"]')!.click()
    await waitFor(() => resultMode() === 'single')
    await waitFor(() => button.disabled === false)
    expect(el.querySelector('[data-testid="export-csv-disabled-reason"]')).toBeNull()
  },
  60_000,
)
