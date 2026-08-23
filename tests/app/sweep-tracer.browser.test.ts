/**
 * tests/app/sweep-tracer.browser.test.ts
 *
 * 07-01-PLAN.md Task 2's end-to-end browser regression: mounts the real app (through `mountApp`,
 * the same path production's `main.tsx` uses), switches the result column to sweep mode by
 * clicking the tracer's own control, and asserts a real sweep over the real bundle paints a real
 * filled-contour field -- no synthetic series, no committed fixture, no shortcut anywhere in the
 * path (07-01-PLAN.md's must_haves).
 *
 * Also covers two acceptance criteria this file is the only place that can prove: the pool is
 * persistent across sweeps (constructs its workers once, reuses them on a second sweep), and the
 * renderer is grid-size agnostic (F-07: a deliberately non-default 51x14 grid paints without
 * error).
 */

import { afterEach, beforeEach, expect, test } from 'vitest'

import { MANIFEST_PATH } from '../../src/data-bundle.generated.ts'
import { mountApp } from '../../src/app/main.tsx'
import { resetAppState, resultMode, sweepGrid } from '../../src/app/state.ts'
import { paintSweepField } from '../../src/heatmap/paint-contour.ts'
import { CELL_FLAG_INCOMPLETE, CELL_FLAG_RUINED } from '../../src/data/sweep-fixture-format.ts'
import { createSweepGrid, leverageForRow, SWEEP_COLS, SWEEP_ROWS, type SweepGridMeta } from '../../src/sweep/sweep-grid.ts'
import { createSweepPool, type SweepBaseParams, type SweepRunRequest } from '../../src/sweep/sweep-pool.ts'

async function waitFor(predicate: () => boolean, timeoutMs = 20_000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('sweep-tracer.browser.test: waitFor timed out waiting for a condition')
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

/** Samples a coarse grid of pixels across `canvas` and returns the set of distinct RGBA strings
 * found -- a uniform canvas (one colour everywhere) fails whatever check calls this. */
function distinctSampledColors(canvas: HTMLCanvasElement, stridePx = 20): Set<string> {
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('sweep-tracer.browser.test: 2D context unavailable for sampling')
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
  // Same harness-param clearing tracer.browser.test.ts already does: the Vitest browser-mode
  // iframe carries its own sessionId/iframeId query params, unrelated to this app's own
  // permalink decode.
  window.history.replaceState(null, '', window.location.pathname)
})

afterEach(() => {
  disposeApp?.()
  disposeApp = undefined
  container?.remove()
  container = undefined
})

test(
  'switching to sweep mode paints a real filled-contour field computed from the real bundle through the real kernel',
  async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    disposeApp = mountApp(container)

    // 07-06-PLAN.md Task 2: SweepModeToggle now renders unconditionally (present-but-disabled
    // while loading, D-18), so this waits for the "Sweep" radio specifically to become enabled --
    // its mere presence in the DOM no longer implies the manifest has decoded.
    await waitFor(() => {
      const toggle = container!.querySelector<HTMLInputElement>('[data-testid="sweep-mode-sweep"]')
      return toggle !== null && !toggle.disabled
    })

    const toggle = container.querySelector<HTMLInputElement>('[data-testid="sweep-mode-sweep"]')
    expect(toggle).not.toBeNull()
    toggle!.click()

    expect(resultMode()).toBe('sweep')

    await waitFor(() => container!.querySelector('[data-testid="heatmap-canvas"]') !== null)
    const canvas = container.querySelector<HTMLCanvasElement>('[data-testid="heatmap-canvas"]')
    expect(canvas).not.toBeNull()
    expect(canvas!.width).toBe(800)
    expect(canvas!.height).toBe(240)

    // Waits for the real sweep (200x50 backtests over the real bundle, across a real Worker
    // pool) to resolve -- generously timed, this is the one genuinely slow assertion in this
    // file. 07-05-PLAN.md Task 2: sweepGrid() now resolves in two stages, the coarse pass's
    // narrower grid first, then the full 200x50 grid replacing it whole -- this waits
    // specifically for the full grid, which is what this test's own cell-count/canvas assertions
    // below are about.
    await waitFor(() => sweepGrid() !== null && sweepGrid()!.cols === 200 && sweepGrid()!.rows === 50, 30_000)

    const grid = sweepGrid()!
    expect(grid.cols).toBe(200)
    expect(grid.rows).toBe(50)

    const cellCount = grid.cols * grid.rows
    let validCells = 0
    for (let i = 0; i < cellCount; i++) {
      const flags = grid.flags[i] ?? 0
      const isCategorical = (flags & (CELL_FLAG_RUINED | CELL_FLAG_INCOMPLETE)) !== 0
      const value = grid.multiples[i] ?? 0
      if (isCategorical || (Number.isFinite(value) && value > 0)) validCells++
    }
    expect(validCells).toBeGreaterThanOrEqual(9500)

    // The painted canvas is genuinely varied, not a uniform fill -- waits one more frame past
    // the grid's own resolution for the paint effect to have flushed.
    await waitFor(() => distinctSampledColors(canvas!).size >= 8, 5000)
    const colors = distinctSampledColors(canvas!)
    expect(colors.size).toBeGreaterThanOrEqual(8)
  },
  35_000,
)

test(
  'the sweep pool is persistent: two consecutive sweeps report the same worker count and construct no new workers',
  async () => {
    // Real manifest bounds so the worker's own resolveColumnSeries call (against the REAL
    // fetched bundle) succeeds -- this test exercises sweep-pool.ts/sweep.worker.ts directly,
    // independent of the app/state.ts wiring the first test covers.
    const manifestResponse = await fetch(MANIFEST_PATH)
    const manifest = (await manifestResponse.json()) as {
      series: Array<{ id: string; tiers: { strict: { firstDate: string } | null } }>
    }
    const spxTotalReturn = manifest.series.find((s) => s.id === 'SPX/total-return')
    expect(spxTotalReturn).toBeDefined()
    expect(spxTotalReturn!.tiers.strict).not.toBeNull()
    const entryDate = spxTotalReturn!.tiers.strict!.firstDate

    let constructCount = 0
    const pool = createSweepPool({
      workerCount: 2,
      workerFactory: (i) => {
        constructCount++
        return new Worker(new URL('../../src/sweep/sweep.worker.ts', import.meta.url), { type: 'module' })
      },
    })
    expect(pool.workerCount).toBe(2)
    expect(constructCount).toBe(2)

    const params: SweepBaseParams = {
      symbol: 'SPX',
      dividendReinvest: true,
      initialInvestment: 10_000,
      contributionAmount: 0,
      contributionFrequency: 'none',
      expenseRatioPercent: 0.9,
      financingSpreadPercent: 0.5,
      holdingPeriodBars: null,
    }
    const entryDates: string[] = new Array(SWEEP_COLS).fill(entryDate)
    const meta: SweepGridMeta = {
      bundleVersion: 'test',
      symbol: 'SPX',
      dividendReinvest: true,
      entryDates,
      leverages: Array.from({ length: SWEEP_ROWS }, (_, row) => leverageForRow(row)),
      holdingYears: 0,
      initialInvestment: 10_000,
      expenseRatioPercent: 0.9,
      financingSpreadPercent: 0.5,
      ruinedCount: 0,
      incompleteCount: 0,
      minMultiple: 0,
      maxMultiple: 0,
      clippedBelowCount: 0,
      clippedAboveCount: 0,
      holdMode: 'end-of-data',
      endOfDataDate: entryDate,
    }

    const firstGrid = createSweepGrid(SWEEP_COLS, SWEEP_ROWS, meta)
    const firstRequest: SweepRunRequest = { generation: 1, params, entryDates }
    await pool.runSweep(firstGrid, firstRequest)
    expect(constructCount).toBe(2)
    expect(pool.workerCount).toBe(2)

    const secondGrid = createSweepGrid(SWEEP_COLS, SWEEP_ROWS, meta)
    const secondRequest: SweepRunRequest = { generation: 2, params, entryDates }
    await pool.runSweep(secondGrid, secondRequest)
    expect(constructCount).toBe(2)
    expect(pool.workerCount).toBe(2)
  },
  35_000,
)

test('paintSweepField renders a deliberately non-default 51x14 grid without error, producing at least 4 distinct sampled RGBA values', () => {
  const cols = 51
  const rows = 14
  const meta: SweepGridMeta = {
    bundleVersion: 'test',
    symbol: 'TEST',
    dividendReinvest: true,
    entryDates: Array.from({ length: cols }, (_, i) => `2000-01-${String((i % 28) + 1).padStart(2, '0')}`),
    leverages: Array.from({ length: rows }, (_, i) => 1 + (i * 4) / (rows - 1)),
    holdingYears: 0,
    initialInvestment: 10_000,
    expenseRatioPercent: 0.9,
    financingSpreadPercent: 0.5,
    ruinedCount: 0,
    incompleteCount: 0,
    minMultiple: 0,
    maxMultiple: 0,
    clippedBelowCount: 0,
    clippedAboveCount: 0,
    holdMode: 'end-of-data',
    endOfDataDate: '2020-01-01',
  }
  const grid = createSweepGrid(cols, rows, meta)
  // Spread values log-uniformly across the colour domain so the field is genuinely varied, not
  // uniform.
  for (let i = 0; i < grid.multiples.length; i++) {
    const t = i / (grid.multiples.length - 1)
    grid.multiples[i] = 10 ** (-2 + t * 4) // 0.01x through 100x
  }

  const canvas = document.createElement('canvas')
  canvas.width = 204 // 51 * 4, an arbitrary display size unrelated to the production 800x240
  canvas.height = 70
  const ctx = canvas.getContext('2d')
  expect(ctx).not.toBeNull()

  expect(() => paintSweepField(ctx!, grid, { metric: 'multiple' })).not.toThrow()

  const colors = distinctSampledColors(canvas, 5)
  expect(colors.size).toBeGreaterThanOrEqual(4)
})
