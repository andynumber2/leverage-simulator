/**
 * tests/app/sweep-progressive.browser.test.ts
 *
 * 07-05-PLAN.md Task 2's browser regression: mounts the real app, switches to sweep mode, and
 * proves the coarse-to-fine progressive paint (D-12/D-13/D-14) end to end -- a complete
 * low-resolution field paints first, includes both axis endpoints, introduces no progress
 * affordance anywhere in the DOM, and a parameter change mid-sweep never blanks the canvas.
 * Also proves D-32's live re-sweep-on-drag: a holding-period control change bumps
 * `sweepGeneration()` within a single animation frame.
 */

import { afterEach, beforeEach, expect, test } from 'vitest'

import { mountApp } from '../../src/app/main.tsx'
import { coarseSweepGrid, resetAppState, resultMode, sweepGeneration, sweepGrid } from '../../src/app/state.ts'

async function waitFor(predicate: () => boolean, timeoutMs = 30_000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('sweep-progressive.browser.test: waitFor timed out waiting for a condition')
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

/** Polls once per animation frame (never a fixed setTimeout delay, which would defeat the very
 * thing this helper measures) until `sweepGeneration()` moves past `previousGeneration`, and
 * returns the elapsed wall-clock time. A fixed delay before dispatch would exceed the assertion
 * this feeds; a single rAF-coalesced dispatch (scheduleSweep's own coalescing) would not. */
async function waitForGenerationBump(previousGeneration: number, timeoutMs = 5000): Promise<number> {
  const start = performance.now()
  while (sweepGeneration() <= previousGeneration) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('sweep-progressive.browser.test: timed out waiting for a sweepGeneration bump')
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
  return performance.now() - start
}

/** Every element in `container`, described by tag name + `data-testid` (when present) -- a
 * content-based fingerprint of the DOM's own shape, independent of attribute values that
 * legitimately change frame to frame (e.g. `checked`, inline styles). */
function domElementFingerprint(container: HTMLElement): string[] {
  const elements = container.querySelectorAll('*')
  const fingerprint: string[] = []
  for (const el of elements) {
    const testId = el.getAttribute('data-testid')
    fingerprint.push(testId ? `${el.tagName}[data-testid=${testId}]` : el.tagName)
  }
  return fingerprint
}

function sampleCanvasColors(canvas: HTMLCanvasElement, stridePx = 20): Set<string> {
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('sweep-progressive.browser.test: 2D context unavailable for sampling')
  const colors = new Set<string>()
  for (let y = 0; y < canvas.height; y += stridePx) {
    for (let x = 0; x < canvas.width; x += stridePx) {
      const pixel = ctx.getImageData(x, y, 1, 1).data
      colors.add(`${pixel[0]},${pixel[1]},${pixel[2]},${pixel[3]}`)
    }
  }
  return colors
}

let container: HTMLDivElement | undefined
let disposeApp: (() => void) | undefined

beforeEach(() => {
  window.history.replaceState(null, '', window.location.pathname)
  resetAppState()
})

afterEach(() => {
  disposeApp?.()
  disposeApp = undefined
  container?.remove()
  container = undefined
})

async function mountAndEnterSweepMode(): Promise<HTMLDivElement> {
  const el = document.createElement('div')
  document.body.appendChild(el)
  disposeApp = mountApp(el)

  await waitFor(() => el.querySelector('[data-testid="sweep-mode-toggle"]') !== null)
  const toggle = el.querySelector<HTMLButtonElement>('[data-testid="sweep-mode-toggle"]')
  expect(toggle).not.toBeNull()
  toggle!.click()
  expect(resultMode()).toBe('sweep')
  return el
}

test(
  'the coarse pass paints a complete field first, whose axis endpoints match the full pass, ' +
    'with no progress affordance anywhere in the DOM',
  async () => {
    container = await mountAndEnterSweepMode()

    const domBeforeCoarse = domElementFingerprint(container)

    await waitFor(() => coarseSweepGrid() !== null, 5000)
    const coarse = coarseSweepGrid()!

    // D-12: a complete field, not the full 200x50 grid.
    expect(coarse.cols).toBeLessThan(200)
    expect(coarse.rows).toBeLessThan(50)

    // No spinner, bar, percentage or live cell count anywhere in sweep mode (D-14): the DOM's
    // own element shape is identical on the frame after the parameter change and again after
    // the coarse paint -- nothing was added and then removed.
    const domAfterCoarse = domElementFingerprint(container)
    expect(domAfterCoarse).toEqual(domBeforeCoarse)
    expect(container.querySelector('[role="progressbar"]')).toBeNull()
    expect(container.querySelector('[aria-busy="true"]')).toBeNull()

    // The full pass replaces the coarse one whole; its own axis endpoints must agree with the
    // coarse pass's (strideIndices always includes both endpoints, D-12).
    await waitFor(() => sweepGrid() !== null && sweepGrid()!.cols === 200 && sweepGrid()!.rows === 50, 35_000)
    const full = sweepGrid()!

    expect(coarse.meta.entryDates[0]).toBe(full.meta.entryDates[0])
    expect(coarse.meta.entryDates[coarse.meta.entryDates.length - 1]).toBe(
      full.meta.entryDates[full.meta.entryDates.length - 1],
    )
    expect(coarse.meta.leverages[0]).toBeCloseTo(full.meta.leverages[0]!, 9)
    expect(coarse.meta.leverages[coarse.meta.leverages.length - 1]).toBeCloseTo(
      full.meta.leverages[full.meta.leverages.length - 1]!,
      9,
    )
  },
  40_000,
)

test(
  'a parameter change mid-sweep never leaves the canvas uniform-blank, and a holding-period ' +
    'change bumps sweepGeneration within a single animation frame',
  async () => {
    container = await mountAndEnterSweepMode()

    // Steady state: let the first sweep fully resolve so there is a real, complete, painted
    // field on screen before the mid-sweep parameter change below.
    await waitFor(() => sweepGrid() !== null && sweepGrid()!.cols === 200 && sweepGrid()!.rows === 50, 35_000)

    const canvas = container.querySelector<HTMLCanvasElement>('[data-testid="heatmap-canvas"]')
    expect(canvas).not.toBeNull()
    const steadyColors = sampleCanvasColors(canvas!)
    expect(steadyColors.size).toBeGreaterThanOrEqual(2)

    const generationBeforeChange = sweepGeneration()

    // D-32: a holding-period control change while sweep mode is active re-sweeps live. Fixed
    // mode is the change (open-ended is the DEFAULT_REQUEST seed): a real user action, not a
    // direct store write, so this exercises updateBacktestRequest's own scheduleSweep call.
    const fixedRadio = container.querySelector<HTMLInputElement>('[data-testid="holding-mode-fixed"]')
    expect(fixedRadio).not.toBeNull()
    fixedRadio!.click()

    // Sampled on the very next frame after the change, before the new sweep's own coarse pass
    // has had any chance to land: the canvas must still show the PREVIOUS complete field, never
    // a blank/uniform one (D-13).
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const midChangeColors = sampleCanvasColors(canvas!)
    expect(midChangeColors.size).toBeGreaterThanOrEqual(2)

    const elapsedMs = await waitForGenerationBump(generationBeforeChange)
    // A fixed delay before dispatch (e.g. the module's own 200ms permalink-flush debounce, an
    // unrelated timer that must not be confused with this one) would clear this bound; a single
    // rAF-coalesced dispatch does not.
    expect(elapsedMs).toBeLessThan(100)
  },
  45_000,
)
