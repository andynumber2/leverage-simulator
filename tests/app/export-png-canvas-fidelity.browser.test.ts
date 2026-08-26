/**
 * tests/app/export-png-canvas-fidelity.browser.test.ts
 *
 * Regression coverage for the Safari blank-canvas export defect
 * (`.planning/debug/resolved/png-export-blank-canvas-safari.md`).
 *
 * The defect: `html-to-image` routes every live `<canvas>`'s pixels through a `data:image/png`
 * URL embedded as an `<img>` inside a `<foreignObject>` in a serialized `data:image/svg+xml`
 * document. WebKit resolves the outer SVG image's `load` and `decode()` BEFORE those nested
 * subresources decode, so on the FIRST capture of a given canvas bitmap they rasterize as nothing.
 * Every canvas in `.screenshot-region` came out blank; the second capture happened to work.
 *
 * Why this is a separate file from `export-png.browser.test.ts`: these assertions are about
 * canvas PIXEL FIDELITY rather than the export row's wiring, and this is the one file the
 * `app-webkit` vitest project runs. That project exists because the defect was WebKit-only and
 * shipped past a fully green Chromium suite -- a Chromium-only gate could not have caught it, and
 * did not. The whole `app` suite cannot be run under WebKit yet (52 of 189 fail there, dominated
 * by WebKit's `history.replaceState` rate limit which Chromium does not enforce, plus
 * Chromium-generated `__screenshots__` baselines), so WebKit coverage is scoped to exactly the
 * invariants that would have caught this class of bug.
 *
 * Every assertion below is browser-agnostic and runs in both projects. None of them is expressed
 * as "not blank" alone: a blankness check passes on a capture that has silently lost an overlay,
 * which is a mistake an earlier revision of the fix actually made (drawing the canvases last
 * erased the heatmap's axis tick labels). The tests therefore pin all four load-bearing
 * properties: first-capture fidelity, capture-to-capture determinism, overlay survival, and the
 * no-background-behind-a-canvas invariant the layered composite rests on.
 */

import { afterEach, beforeEach, expect, test } from 'vitest'

import { mountApp } from '../../src/app/main.tsx'
import { currentKernelResult, resetAppState, resultMode, sweepGrid } from '../../src/app/state.ts'
import { resetThemeState } from '../../src/app/theme.ts'
import { EXPORT_FRAME_PX, EXPORT_PIXEL_RATIO, EXPORT_WIDTH_PX, exportRegionAsPng } from '../../src/export/png-export.ts'

/** Matches `png-export.ts`'s own `resolveExportBackgroundColor` tolerance for a channel being a
 * hair off after PNG encode/decode. */
const CHANNEL_TOLERANCE = 24

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
      throw new Error('export-png-canvas-fidelity: waitFor timed out waiting for a condition')
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
    const g = sweepGrid()
    return g !== null && g !== staleGrid && g.cols === 200 && g.rows === 50
  }, 35_000)
  return el
}

function regionOf(el: HTMLElement): HTMLElement {
  return el.querySelector<HTMLElement>('[data-testid="screenshot-region"]')!
}

interface DecodedImage {
  width: number
  height: number
  data: Uint8ClampedArray
}

async function decode(blob: Blob): Promise<DecodedImage> {
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('export-png-canvas-fidelity: canvas has no 2d context')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return { width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data }
}

/** Each region canvas's box in EXPORT-image coordinates. Measured by putting the live region into
 * the same export layout `exportRegionAsPng` applies and restoring it immediately, because the
 * region is captured at `EXPORT_WIDTH_PX` regardless of the browser viewport (D-03), so a box
 * measured at the live width would not line up with the exported pixels. */
function canvasBoxesInExportSpace(
  region: HTMLElement,
  image: DecodedImage,
): { element: HTMLCanvasElement; label: string; x: number; y: number; w: number; h: number }[] {
  const original = region.style.cssText
  region.style.width = `${EXPORT_WIDTH_PX}px`
  region.style.padding = `${EXPORT_FRAME_PX}px`
  region.style.boxSizing = 'border-box'
  void region.offsetHeight
  const regionRect = region.getBoundingClientRect()
  const scaleX = image.width / regionRect.width
  const scaleY = image.height / regionRect.height
  const boxes = [...region.querySelectorAll('canvas')].map((element) => {
    const rect = element.getBoundingClientRect()
    return {
      element,
      label: element.dataset.testid ?? element.className ?? 'canvas',
      x: Math.round((rect.left - regionRect.left) * scaleX),
      y: Math.round((rect.top - regionRect.top) * scaleY),
      w: Math.round(rect.width * scaleX),
      h: Math.round(rect.height * scaleY),
    }
  })
  region.style.cssText = original
  void region.offsetHeight
  return boxes
}

/** Fraction of pixels inside `box` that differ from the export background by more than
 * `CHANNEL_TOLERANCE` on any channel. A blank canvas region scores 0. */
function inkFraction(image: DecodedImage, box: { x: number; y: number; w: number; h: number }, bg: number[]): number {
  let ink = 0
  let total = 0
  const x1 = Math.min(image.width, box.x + box.w)
  const y1 = Math.min(image.height, box.y + box.h)
  for (let y = Math.max(0, box.y); y < y1; y += 1) {
    for (let x = Math.max(0, box.x); x < x1; x += 1) {
      const i = (y * image.width + x) * 4
      total += 1
      const delta =
        Math.abs(image.data[i]! - bg[0]!) + Math.abs(image.data[i + 1]! - bg[1]!) + Math.abs(image.data[i + 2]! - bg[2]!)
      if (delta > CHANNEL_TOLERANCE) ink += 1
    }
  }
  return total === 0 ? 0 : ink / total
}

function exportBackgroundRgb(): number[] {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim()
  const probe = document.createElement('canvas')
  probe.width = 1
  probe.height = 1
  const ctx = probe.getContext('2d')!
  ctx.fillStyle = raw
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return [r!, g!, b!]
}

function countDifferingPixels(a: DecodedImage, b: DecodedImage): number {
  expect(a.width, 'two captures of an unchanged region must have identical width').toBe(b.width)
  expect(a.height, 'two captures of an unchanged region must have identical height').toBe(b.height)
  let differing = 0
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) differing += 1
  }
  return differing
}

test(
  'the FIRST capture after mount renders the equity curve canvas, not a blank region (the Safari defect)',
  async () => {
    const el = await mountSingleRun()
    const region = regionOf(el)

    // Deliberately the first `exportRegionAsPng` call of this page session: the defect only ever
    // showed on the first capture of a given canvas bitmap, so a test that warmed up first would
    // pass against the broken code.
    const image = await decode(await exportRegionAsPng(region))
    const bg = exportBackgroundRgb()
    const boxes = canvasBoxesInExportSpace(region, image)

    expect(boxes.length, 'single-run region should contain the equity curve canvas').toBeGreaterThan(0)
    for (const box of boxes) {
      expect(
        inkFraction(image, box, bg),
        `canvas "${box.label}" is blank in the FIRST exported capture: 0 pixels differ from the background ` +
          'inside its box. This is the WebKit foreignObject nested-subresource defect.',
      ).toBeGreaterThan(0.01)
    }
  },
  60_000,
)

test(
  'two consecutive captures of an unchanged region are pixel-identical',
  async () => {
    const el = await mountSingleRun()
    const region = regionOf(el)

    const first = await decode(await exportRegionAsPng(region))
    const second = await decode(await exportRegionAsPng(region))

    // The defect's signature was precisely that these two differed: blank canvas first, correct
    // canvas second. Determinism is also a product requirement in its own right, since the whole
    // point of the export is a shareable artifact of a specific run.
    //
    // Note for whoever reads this next: this test is NOT the load-bearing guard for the original
    // defect, and should not be relied on as one. Verified by running this file against the
    // pre-fix code in WebKit: the two first-capture tests failed and THIS one passed, because by
    // the time it runs, an earlier test in the file has already put the same canvas bitmap's data
    // URL into WebKit's cache, so both of its captures come back correct. The first-capture
    // assertions above are what actually bite.
    expect(
      countDifferingPixels(first, second),
      'two captures of an unchanged region differ, so the export is not deterministic',
    ).toBe(0)
  },
  60_000,
)

test(
  'sweep mode: EVERY canvas in the region renders in the first capture, and the heatmap axis tick overlay survives it',
  async () => {
    const el = await mountSweep()
    const region = regionOf(el)

    const image = await decode(await exportRegionAsPng(region))
    const bg = exportBackgroundRgb()
    const boxes = canvasBoxesInExportSpace(region, image)

    // Sweep mode carries several canvases (heatmap field, crosshair overlay, both slice charts,
    // the legend ramp and the legend swatches). The original defect blanked all of them, so this
    // asserts over whatever the region actually contains rather than naming one.
    expect(boxes.length, 'sweep region should contain several canvases').toBeGreaterThan(1)
    for (const box of boxes) {
      expect(
        inkFraction(image, box, bg),
        `canvas "${box.label}" is blank in the FIRST exported sweep capture`,
      ).toBeGreaterThan(0.01)
    }

    // Z-ORDER. The heatmap's zoom-aware axis tick labels are `pointer-events: none` spans placed
    // AFTER both canvases inside `.heatmap-field-stack`, deliberately overlaying the field
    // (`HeatmapPanel.tsx`). An earlier revision of the fix drew the canvases last and erased them,
    // and every "is it blank" assertion above still passed. Each label paints an opaque
    // `--color-surface` pill, a color the heatmap's own diverging ramp never produces, so its
    // presence INSIDE the field canvas's box is a direct check that the overlay survived.
    const tick = region.querySelector<HTMLElement>('[data-testid="heatmap-axis-tick-entry-date"]')
    expect(tick, 'expected at least one heatmap entry-date axis tick to be rendered').not.toBeNull()
    const surface = getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim()
    const probe = document.createElement('canvas')
    probe.width = 1
    probe.height = 1
    const probeCtx = probe.getContext('2d')!
    probeCtx.fillStyle = surface
    probeCtx.fillRect(0, 0, 1, 1)
    const [sr, sg, sb] = probeCtx.getImageData(0, 0, 1, 1).data

    const field = boxes.find((box) => box.label === 'heatmap-canvas')
    expect(field, 'heatmap field canvas not found in the export-space box list').toBeDefined()
    let surfacePixels = 0
    for (let y = Math.max(0, field!.y); y < Math.min(image.height, field!.y + field!.h); y += 1) {
      for (let x = Math.max(0, field!.x); x < Math.min(image.width, field!.x + field!.w); x += 1) {
        const i = (y * image.width + x) * 4
        if (
          Math.abs(image.data[i]! - sr!) <= 8 &&
          Math.abs(image.data[i + 1]! - sg!) <= 8 &&
          Math.abs(image.data[i + 2]! - sb!) <= 8
        ) {
          surfacePixels += 1
        }
      }
    }
    expect(
      surfacePixels,
      'no --color-surface pixels inside the heatmap field box: the axis tick label overlay was ' +
        'erased by the canvas composite',
    ).toBeGreaterThan(100)
  },
  180_000,
)

test(
  'no ancestor of any region canvas paints a background, the invariant the layered composite rests on',
  async () => {
    const el = await mountSweep()
    const region = regionOf(el)

    // `exportRegionAsPng` builds the image as background, then live canvases, then
    // html-to-image's transparent DOM layer on top. That ordering is only correct while nothing
    // paints BEHIND a canvas -- a card background introduced on an ancestor would be drawn over
    // the chart it sits behind. Measured true across both result modes when the fix landed; this
    // fails loudly rather than silently covering a chart if that ever changes.
    const offenders: string[] = []
    for (const canvas of region.querySelectorAll('canvas')) {
      let current: HTMLElement | null = canvas.parentElement
      while (current !== null && current !== region.parentElement) {
        const style = getComputedStyle(current)
        const opaque = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent'
        if (opaque || style.backgroundImage !== 'none') {
          offenders.push(
            `${canvas.dataset.testid ?? 'canvas'} <- ${current.dataset.testid ?? (current.className || current.tagName)} ` +
              `(background-color: ${style.backgroundColor}, background-image: ${style.backgroundImage})`,
          )
        }
        current = current.parentElement
      }
    }
    expect(
      offenders,
      'an ancestor of a region canvas now paints a background. png-export.ts draws the DOM layer ' +
        'ON TOP of the live canvases, so that background will cover the chart in the exported PNG. ' +
        'Either remove it or rework compositeLiveCanvases into a masked composite.',
    ).toEqual([])
  },
  180_000,
)

test(
  'the exported canvas region reproduces the live canvas content rather than an approximation of it',
  async () => {
    const el = await mountSingleRun()
    const region = regionOf(el)

    const image = await decode(await exportRegionAsPng(region))
    const boxes = canvasBoxesInExportSpace(region, image)
    const box = boxes[0]!

    // Rasterize the live canvas at the same scale the export used, then compare ink coverage.
    // This is what distinguishes "something was drawn" from "the right thing was drawn": a
    // capture that lost the curve but kept the chart's gridlines would clear a bare blankness
    // check and fail here.
    const bg = exportBackgroundRgb()
    const reference = document.createElement('canvas')
    reference.width = box.w
    reference.height = box.h
    const refCtx = reference.getContext('2d')!
    // Composited onto the export background exactly as `exportRegionAsPng` does, then measured
    // with the SAME ink metric, so the two numbers are directly comparable. Measuring the live
    // canvas by alpha instead would count a different population (uPlot's gridlines are drawn at
    // partial alpha) and the comparison would be meaningless.
    refCtx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim()
    refCtx.fillRect(0, 0, box.w, box.h)
    refCtx.drawImage(box.element, 0, 0, box.w, box.h)
    const referenceImage: DecodedImage = {
      width: box.w,
      height: box.h,
      data: refCtx.getImageData(0, 0, box.w, box.h).data,
    }
    const referenceFraction = inkFraction(referenceImage, { x: 0, y: 0, w: box.w, h: box.h }, bg)
    const exportedFraction = inkFraction(image, box, bg)

    expect(referenceFraction, 'the live canvas itself is blank, so this test proves nothing').toBeGreaterThan(0.01)
    expect(
      Math.abs(exportedFraction - referenceFraction),
      `exported ink coverage ${exportedFraction.toFixed(4)} does not match the live canvas's ` +
        `${referenceFraction.toFixed(4)} inside the same box`,
    ).toBeLessThan(0.02)
    expect(EXPORT_PIXEL_RATIO, 'export pixel ratio changed; the box math above assumes the exported constant').toBe(2)
  },
  60_000,
)
