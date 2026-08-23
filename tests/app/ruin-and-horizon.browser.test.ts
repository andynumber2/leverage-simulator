/**
 * tests/app/ruin-and-horizon.browser.test.ts
 *
 * 07-09-PLAN.md's full coverage across all four tasks:
 * - Task 1: the labelled short-horizon rule (`paintShortHorizonRule`) -- dashed, muted, cell
 *   colours left completely intact, label flip near the panel's right edge.
 * - Task 2: ruin proven categorical on a sweep where it genuinely occurs.
 * - Task 3: the hatch and the rule proven to read cleanly together where they overlap.
 * - Task 4: the breakeven curve's inline label.
 *
 * Runs in the browser project (`tests:app`): `paintSweepField`/`paintShortHorizonRule` need a
 * real `CanvasRenderingContext2D` and `document.documentElement`'s CSS custom properties.
 */

import { describe, expect, test } from 'vitest'

// Side-effect import: applies the app's real `:root` CSS custom properties to `document`, so
// `getComputedStyle(document.documentElement)` resolves `--color-text-muted`/`--color-accent`
// to their real production light-theme values rather than the empty string a bare canvas test
// would otherwise see (matching `tests/app/theme.browser.test.ts`'s own reliance on `mountApp`
// having already loaded this stylesheet for the same reason).
import '../../src/app/styles.css'

import { mountApp } from '../../src/app/main.tsx'
import { loadStatus, setActiveTier, setResultMode, sweepGrid, updateBacktestRequest } from '../../src/app/state.ts'
import type { Tier } from '../../src/app/bounds.ts'
import { gridColToDisplayX, gridRowToDisplayY, getRampValues, paintSweepField } from '../../src/heatmap/paint-contour.ts'
import { SHORT_HORIZON_LABEL, shortHorizonColumn } from '../../src/heatmap/short-horizon.ts'
import { labelAnchorAvoiding, CURVE_LABEL_FONT, CURVE_LABEL_FONT_HEIGHT_PX, type DisplaySegment } from '../../src/heatmap/curve-label.ts'
import { marchingSquaresSegments } from '../../src/heatmap/iso-lines.ts'
import { emphasizedBandLevelFor, interpolateRamp, interpolateSequentialRamp } from '../../src/colorscale/value-to-color.ts'
import { formatMultiple, formatSignedPercent } from '../../src/metrics/format.ts'
import { CELL_FLAG_INCOMPLETE, CELL_FLAG_RUINED } from '../../src/data/sweep-fixture-format.ts'
import { createSweepGrid, leverageForRow, type SweepGrid, type SweepGridMeta } from '../../src/sweep/sweep-grid.ts'

const MS_PER_DAY = 24 * 60 * 60 * 1000

function isoDateMinusDays(endOfDataDate: string, days: number): string {
  const parts = endOfDataDate.split('-').map(Number)
  const ms = Date.UTC(parts[0]!, parts[1]! - 1, parts[2]!) - days * MS_PER_DAY
  const date = new Date(ms)
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function testMeta(overrides: Partial<SweepGridMeta>): SweepGridMeta {
  return {
    bundleVersion: 'test',
    symbol: 'TEST',
    dividendReinvest: true,
    entryDates: [],
    leverages: [1, 2, 3, 4],
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
    ...overrides,
  }
}

function makeCanvas(widthPx: number, heightPx: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = widthPx
  canvas.height = heightPx
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('ruin-and-horizon.browser.test: 2D context unavailable')
  return ctx
}

function readCssRgb(name: string): [number, number, number] {
  const hex = getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace('#', '')
  return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)]
}

function pixelAt(data: Uint8ClampedArray, widthPx: number, x: number, y: number): [number, number, number, number] {
  const idx = (y * widthPx + x) * 4
  return [data[idx]!, data[idx + 1]!, data[idx + 2]!, data[idx + 3]!]
}

function rgbDistance(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)
}

// -------------------------------------------------------------------------------------------
// Task 1: the labelled short-horizon rule
// -------------------------------------------------------------------------------------------

describe('Task 1: short-horizon rule (D-29)', () => {
  // 20 columns, entryDates spaced 100 calendar days apart -- crosses the 3-year (1095.75-day)
  // threshold strictly between column 9 and column 10 (see tests/heatmap/short-horizon.test.ts
  // for the exact arithmetic), so shortHorizonColumn(grid) is deterministically 10.
  const endOfDataDate = '2020-01-01'
  const cols = 20
  const rows = 4
  const widthPx = 200 // cellWidthPx = 10, an exact integer -- the rule's column-10 x is 100
  const heightPx = 80
  const openEndedEntryDates = Array.from({ length: cols }, (_, col) => isoDateMinusDays(endOfDataDate, 2000 - 100 * col))

  function makeFlatGrid(): SweepGrid {
    const grid = createSweepGrid(cols, rows, testMeta({ entryDates: openEndedEntryDates, holdMode: 'end-of-data', endOfDataDate }))
    // A perfectly flat field: no contour level crossings anywhere, so the ONLY thing painted
    // besides the base fill is the short-horizon rule itself -- isolates the rule's own pixels
    // from any contour-stroke pixels for clean sampling.
    grid.multiples.fill(2)
    return grid
  }

  test('shortHorizonColumn resolves to column 10 on this fixture (sanity check shared by the pixel tests below)', () => {
    const grid = makeFlatGrid()
    expect(shortHorizonColumn(grid)).toBe(10)
  })

  test("the rule's stroke is dashed, its colour is close to the muted text custom property, and closer to muted than to accent", () => {
    const grid = makeFlatGrid()
    const ctx = makeCanvas(widthPx, heightPx)
    paintSweepField(ctx, grid, { metric: 'multiple' })
    const data = ctx.getImageData(0, 0, widthPx, heightPx).data

    const muted = readCssRgb('--color-text-muted')
    const accent = readCssRgb('--color-accent')
    const ruleX = 10 * (widthPx / cols) // column 10's own left edge, in display pixels: 100

    // Dash period [4, 3] starting at y=0: y=44 (44 mod 7 === 2) falls inside an "on" segment,
    // y=40 (40 mod 7 === 5) falls inside an "off" segment. Scan a small x-window around ruleX at
    // each y (anti-aliasing can spread a 1px stroke across neighbouring columns) and take the
    // closest match to muted.
    function closestToMutedNear(y: number): number {
      let best = Number.POSITIVE_INFINITY
      for (let x = ruleX - 2; x <= ruleX + 2; x++) {
        const [r, g, b] = pixelAt(data, widthPx, x, y)
        best = Math.min(best, rgbDistance([r, g, b], muted))
      }
      return best
    }

    const onDistance = closestToMutedNear(44)
    const offDistance = closestToMutedNear(40)

    // "On": some pixel near the rule's column at y=44 reads close to muted.
    expect(onDistance).toBeLessThan(40)
    // "Off": the same x-window at y=40 reads clearly farther from muted than the on-sample --
    // proof of an intermittent (dashed), not solid, stroke.
    expect(offDistance).toBeGreaterThan(onDistance + 20)

    // Not the accent colour: the on-sample is closer to muted than to accent.
    let bestAccentDistance = Number.POSITIVE_INFINITY
    for (let x = ruleX - 2; x <= ruleX + 2; x++) {
      const [r, g, b] = pixelAt(data, widthPx, x, 44)
      bestAccentDistance = Math.min(bestAccentDistance, rgbDistance([r, g, b], accent))
    }
    expect(onDistance).toBeLessThan(bestAccentDistance)

    // Not the 2px breakeven treatment: the field is perfectly flat (no gradient anywhere), so
    // marchingSquaresSegments finds zero level crossings and paintSweepField draws no contour
    // line at all -- the rule is the only line-shaped mark on this canvas by construction.
  })

  test('a pixel in a cell just right of the rule and a pixel in a cell just left of it (same band, flat field) render the identical RGBA', () => {
    const grid = makeFlatGrid()
    const ctx = makeCanvas(widthPx, heightPx)
    paintSweepField(ctx, grid, { metric: 'multiple' })
    const data = ctx.getImageData(0, 0, widthPx, heightPx).data

    const cellWidthPx = widthPx / cols
    const ruleX = 10 * cellWidthPx // 100
    const y = 60 // clear of both the label's own y-band (top) and the dash-sampling y-band above

    const justLeft = pixelAt(data, widthPx, ruleX - 3, y) // deep inside column 9
    const justRight = pixelAt(data, widthPx, ruleX + 3, y) // deep inside column 10

    expect(justRight).toEqual(justLeft)
  })

  test('the label renders to the right of the rule by default (not near the panel edge)', () => {
    // A narrow rule position (column 2 of 20) leaves ample room to its right for the label.
    const grid = createSweepGrid(
      cols,
      rows,
      testMeta({
        entryDates: Array.from({ length: cols }, (_, col) => (col < 3 ? isoDateMinusDays(endOfDataDate, 1000) : isoDateMinusDays(endOfDataDate, 2000))),
        holdMode: 'end-of-data',
        endOfDataDate,
      }),
    )
    grid.multiples.fill(2)
    expect(shortHorizonColumn(grid)).toBe(0)

    const wideWidthPx = 600
    const ctx = makeCanvas(wideWidthPx, heightPx)
    paintSweepField(ctx, grid, { metric: 'multiple' })
    const data = ctx.getImageData(0, 0, wideWidthPx, heightPx).data
    const muted = readCssRgb('--color-text-muted')

    const ruleX = 0 * (wideWidthPx / cols) // column 0 -- the rule sits at the panel's own left edge

    let foundToRight = false
    let foundToLeft = false
    for (let y = 0; y <= 16; y++) {
      for (let x = 0; x < wideWidthPx; x++) {
        const [r, g, b] = pixelAt(data, wideWidthPx, x, y)
        if (rgbDistance([r, g, b], muted) < 30) {
          if (x > ruleX + 5) foundToRight = true
          if (x < ruleX - 5) foundToLeft = true
        }
      }
    }

    expect(foundToRight).toBe(true)
    expect(foundToLeft).toBe(false) // nothing to the left: x < 0 does not exist on this canvas
  })

  test('the label flips to the left of the rule when the rule falls near the panel\'s right edge, staying entirely inside the panel', () => {
    // Force the rule to the rightmost possible column on a narrow canvas, where SHORT_HORIZON_LABEL
    // (a long sentence) cannot fit to the right without clipping off-panel.
    const narrowCols = 10
    const narrowWidthPx = 220
    const entryDates = Array.from({ length: narrowCols }, (_, col) => (col === narrowCols - 1 ? isoDateMinusDays(endOfDataDate, 1000) : isoDateMinusDays(endOfDataDate, 2000)))
    const grid = createSweepGrid(narrowCols, rows, testMeta({ entryDates, holdMode: 'end-of-data', endOfDataDate }))
    grid.multiples.fill(2)
    const col = shortHorizonColumn(grid)
    expect(col).toBe(narrowCols - 1)

    const ctx = makeCanvas(narrowWidthPx, heightPx)
    paintSweepField(ctx, grid, { metric: 'multiple' })
    const data = ctx.getImageData(0, 0, narrowWidthPx, heightPx).data
    const muted = readCssRgb('--color-text-muted')

    const ruleX = col! * (narrowWidthPx / narrowCols)

    // Independently confirm the label text is actually long enough to force the flip (a sanity
    // check on the fixture, not the implementation under test).
    ctx.font = '12px system-ui, -apple-system, "Segoe UI", sans-serif'
    const textWidth = ctx.measureText(SHORT_HORIZON_LABEL).width
    expect(ruleX + 4 + textWidth).toBeGreaterThan(narrowWidthPx)

    let foundToLeft = false
    for (let y = 0; y <= 16; y++) {
      for (let x = 0; x < narrowWidthPx; x++) {
        const [r, g, b] = pixelAt(data, narrowWidthPx, x, y)
        if (rgbDistance([r, g, b], muted) < 30 && x < ruleX - 5) {
          foundToLeft = true
        }
      }
    }
    // getImageData itself cannot return data past narrowWidthPx, so "clipping" for an unflipped
    // label would instead show as an ABSENCE of label pixels anywhere in this buffer -- confirm
    // the flip actually produced VISIBLE label pixels (foundToLeft), rather than the label having
    // silently rendered mostly off-canvas.
    expect(foundToLeft).toBe(true)
  })
})

// -------------------------------------------------------------------------------------------
// Task 2: the named verification sweep, and ruin proven categorical on it
// -------------------------------------------------------------------------------------------

async function waitFor(predicate: () => boolean, timeoutMs = 40_000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('ruin-and-horizon.browser.test: waitFor timed out waiting for a condition')
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

/**
 * The named verification sweep this plan resolves Finding F-02 with (07-CONTEXT.md): SPX,
 * dividend-reinvested, EXTENDED tier (entry-date axis begins 1927-12-30, including the 1929
 * entries roadmap criterion 2 names), open-ended (hold-to-end-of-data) mode, the app's default
 * initial investment and zero contribution amount, at the fixed D-01/D-03 grid shape (leverage
 * 1x-5x over 50 rows, entry-date axis 200 columns).
 */
const VERIFICATION_SYMBOL = 'SPX'
const VERIFICATION_DIVIDEND_REINVEST = true
const VERIFICATION_TIER: Tier = 'extended'
const VERIFICATION_HOLDING_PERIOD_BARS = null // open-ended (hold to end of data)
const VERIFICATION_INITIAL_INVESTMENT = 10_000
const VERIFICATION_CONTRIBUTION_AMOUNT = 0
// Leverage axis: fixed 1x-5x over 50 rows (D-01/D-03, src/sweep/sweep-grid.ts's SWEEP_ROWS).
// Entry-date axis: fixed 200 columns (D-01/D-03, src/sweep/sweep-grid.ts's SWEEP_COLS).

/** A fixed 10-year holding period, re-run against the identical verification-sweep parameters,
 * to prove D-31: ruin renders identically in both sweep modes. `2520` bars matches this
 * codebase's own established 10-year fixture value (`tests/app/sweep-caption.browser.test.ts`'s
 * "Every cell held for 10.0 years." case). */
const FIXED_HOLDING_PERIOD_BARS = 2520

/** 33 evenly spaced samples of `ramp`, `t = 0, 1/32, ..., 1` -- the exact sampling VIZ-06's own
 * must-have specifies for proving a ruined cell is categorically different from every point on
 * the active continuous ramp, never merely its darkest end. */
function rampSamples(ramp: (t: number) => readonly [number, number, number, number]): Array<readonly [number, number, number, number]> {
  return Array.from({ length: 33 }, (_, i) => ramp(i / 32))
}

function matchesAnySample(pixel: readonly [number, number, number, number], samples: readonly (readonly [number, number, number, number])[]): boolean {
  return samples.some((s) => s[0] === pixel[0] && s[1] === pixel[1] && s[2] === pixel[2] && s[3] === pixel[3])
}

let describeApp: HTMLDivElement | undefined
let describeDispose: (() => void) | undefined

describe('Task 2: ruin proven categorical on the named verification sweep', () => {
  test(
    'ruinedCount > 0, every ruined cell is a high-leverage row, a ruined pixel matches none of 33 ramp samples on either ramp, texture varies within one ruined cell, and D-31 holds under the fixed-period re-run',
    async () => {
      describeApp = document.createElement('div')
      document.body.appendChild(describeApp)
      describeDispose = mountApp(describeApp)

      try {
        await waitFor(() => loadStatus() === 'ready')

        updateBacktestRequest({
          symbol: VERIFICATION_SYMBOL,
          dividendReinvest: VERIFICATION_DIVIDEND_REINVEST,
          initialInvestment: VERIFICATION_INITIAL_INVESTMENT,
          contributionAmount: VERIFICATION_CONTRIBUTION_AMOUNT,
          holdingPeriodBars: VERIFICATION_HOLDING_PERIOD_BARS,
        })
        setActiveTier(VERIFICATION_TIER)
        setResultMode('sweep')

        await waitFor(() => sweepGrid() !== null && sweepGrid()!.cols === 200 && sweepGrid()!.rows === 50, 40_000)
        const openEndedGrid = sweepGrid()!

        // --- ruinedCount > 0, on a sweep where ruin genuinely occurs (closes Finding C) ---
        const cellCount = openEndedGrid.cols * openEndedGrid.rows
        let ruinedCount = 0
        let firstRuinedIndex = -1
        for (let i = 0; i < cellCount; i++) {
          if (((openEndedGrid.flags[i] ?? 0) & CELL_FLAG_RUINED) !== 0) {
            ruinedCount++
            if (firstRuinedIndex === -1) firstRuinedIndex = i
          }
        }
        expect(ruinedCount).toBeGreaterThan(0)
        expect(firstRuinedIndex).toBeGreaterThanOrEqual(0)

        // --- every ruined cell's leverage is at least 4.5 (confined to high-leverage rows) ---
        for (let i = 0; i < cellCount; i++) {
          if (((openEndedGrid.flags[i] ?? 0) & CELL_FLAG_RUINED) === 0) continue
          const row = Math.floor(i / openEndedGrid.cols)
          expect(leverageForRow(row)).toBeGreaterThanOrEqual(4.5)
        }

        // --- pixel sampling: a ruined cell's colour is categorical, and its hatch is a texture ---
        const ruinedRow = Math.floor(firstRuinedIndex / openEndedGrid.cols)
        const ruinedCol = firstRuinedIndex % openEndedGrid.cols
        const sampleWidthPx = 2400 // cellWidthPx = 12, 2x the hatch's own 6px tile period
        const sampleHeightPx = 600 // cellHeightPx = 12, same margin
        const cellWidthPx = sampleWidthPx / openEndedGrid.cols
        const cellHeightPx = sampleHeightPx / openEndedGrid.rows
        const imgRow = openEndedGrid.rows - 1 - ruinedRow
        const cellX0 = ruinedCol * cellWidthPx
        const cellY0 = imgRow * cellHeightPx

        for (const metric of ['multiple', 'drawdown'] as const) {
          const canvas = document.createElement('canvas')
          canvas.width = sampleWidthPx
          canvas.height = sampleHeightPx
          const ctx = canvas.getContext('2d')!
          paintSweepField(ctx, openEndedGrid, { metric })
          const data = ctx.getImageData(0, 0, sampleWidthPx, sampleHeightPx).data

          function pixelAt(x: number, y: number): readonly [number, number, number, number] {
            const idx = (Math.floor(y) * sampleWidthPx + Math.floor(x)) * 4
            return [data[idx]!, data[idx + 1]!, data[idx + 2]!, data[idx + 3]!]
          }

          const centerPixel = pixelAt(cellX0 + cellWidthPx / 2, cellY0 + cellHeightPx / 2)
          const divergingSamples = rampSamples(interpolateRamp)
          const sequentialSamples = rampSamples(interpolateSequentialRamp)
          expect(matchesAnySample(centerPixel, divergingSamples), `metric=${metric}: ruined pixel must never match a diverging-ramp sample`).toBe(false)
          expect(matchesAnySample(centerPixel, sequentialSamples), `metric=${metric}: ruined pixel must never match a sequential-ramp sample`).toBe(false)

          // Two pixels at different offsets within this single ruined cell's own rectangle
          // differ from each other -- a flat fill cannot pass this, a hatch texture can.
          const cornerA = pixelAt(cellX0 + 2, cellY0 + 2)
          const cornerB = pixelAt(cellX0 + cellWidthPx - 2, cellY0 + cellHeightPx - 2)
          expect(cornerA, `metric=${metric}: two offsets within one ruined cell must differ (texture, not a flat fill)`).not.toEqual(cornerB)
        }

        // --- D-31: ruin renders identically in both modes ---
        //
        // The two modes evaluate windows of very different lengths for the SAME entry-date
        // column (the extended tier's earliest columns hold for many decades open-ended, vs a
        // fixed 2520-bar/10-year window), so a full flag-equality comparison is the WRONG claim:
        // a position that survives its full 10-year fixed window can still go on to ruin later
        // in a much longer open-ended continuation, and that later ruin is a legitimate
        // difference, not a bug. The sound, mode-invariant claim is one-directional: `backtest.ts`
        // writes the ruin bar and every subsequent bar as exactly 0 (a permanent state), so a
        // position that ruins WITHIN the fixed window's own first `FIXED_HOLDING_PERIOD_BARS`
        // bars must ALSO show as ruined in the open-ended run, whose window is a strict superset
        // of those same first bars for every entry-date column. This is exactly "a position that
        // reached zero after eight months is a real, complete, categorical outcome" (07-09-PLAN.md
        // Task 2's own framing): ruin that happens early does not un-happen because the window
        // being asked about is longer.
        updateBacktestRequest({ holdingPeriodBars: FIXED_HOLDING_PERIOD_BARS })
        await waitFor(() => {
          const g = sweepGrid()
          return g !== null && g !== openEndedGrid && g.cols === 200 && g.rows === 50 && g.meta.holdMode === 'fixed'
        }, 40_000)
        const fixedGrid = sweepGrid()!

        let fixedRuinedCompleteCount = 0
        for (let i = 0; i < cellCount; i++) {
          const fixedFlags = fixedGrid.flags[i] ?? 0
          if ((fixedFlags & CELL_FLAG_INCOMPLETE) !== 0) continue // only complete-window cells compare
          if ((fixedFlags & CELL_FLAG_RUINED) === 0) continue // only cells ruined WITHIN the fixed window assert anything
          fixedRuinedCompleteCount++
          const openEndedRuined = ((openEndedGrid.flags[i] ?? 0) & CELL_FLAG_RUINED) !== 0
          expect(
            openEndedRuined,
            `cell ${i}: ruined within the fixed ${FIXED_HOLDING_PERIOD_BARS}-bar window, so the open-ended run's strictly longer window covering the same bars must show it ruined too (D-31)`,
          ).toBe(true)
        }
        // Sanity: this sweep genuinely produced fixed-window ruin to compare (an empty set would
        // make the loop above vacuously true and prove nothing).
        expect(fixedRuinedCompleteCount).toBeGreaterThan(0)
      } finally {
        describeDispose?.()
        describeDispose = undefined
        describeApp?.remove()
        describeApp = undefined
      }
    },
    120_000,
  )

  test('if the hatch pattern cannot be constructed for any reason, a ruined cell still renders categorically rather than falling through to the continuous ramp', () => {
    const cols = 4
    const rows = 4
    const grid = createSweepGrid(
      cols,
      rows,
      ({
        bundleVersion: 'test',
        symbol: 'TEST',
        dividendReinvest: true,
        entryDates: Array.from({ length: cols }, (_, i) => `2000-01-0${i + 1}`),
        leverages: [1, 2, 3, 4],
        holdingYears: 0,
        initialInvestment: 10_000,
        expenseRatioPercent: 0.9,
        financingSpreadPercent: 0.5,
        ruinedCount: 1,
        incompleteCount: 0,
        minMultiple: 0,
        maxMultiple: 0,
        clippedBelowCount: 0,
        clippedAboveCount: 0,
        holdMode: 'end-of-data',
        endOfDataDate: '2020-01-01',
      }) satisfies SweepGridMeta,
    )
    grid.multiples.fill(2)
    grid.flags[0] = CELL_FLAG_RUINED

    const widthPx = 400
    const heightPx = 400
    const ctx = document.createElement('canvas').getContext('2d')!
    ctx.canvas.width = widthPx
    ctx.canvas.height = heightPx

    // Forces pattern construction to fail: the injected factory returns null, exactly the
    // scenario this plan's own acceptance criteria names.
    paintSweepField(ctx, grid, { metric: 'multiple', hatchPatternFactory: () => null })

    const cellWidthPx = widthPx / cols
    const cellHeightPx = heightPx / rows
    const imgRow = rows - 1 - 0 // cell (row 0, col 0) is the ruined one
    const data = ctx.getImageData(0, 0, widthPx, heightPx).data
    const x = Math.floor(0 * cellWidthPx + cellWidthPx / 2)
    const y = Math.floor(imgRow * cellHeightPx + cellHeightPx / 2)
    const idx = (y * widthPx + x) * 4
    const pixel: readonly [number, number, number, number] = [data[idx]!, data[idx + 1]!, data[idx + 2]!, data[idx + 3]!]

    const divergingSamples = rampSamples(interpolateRamp)
    const sequentialSamples = rampSamples(interpolateSequentialRamp)
    expect(matchesAnySample(pixel, divergingSamples)).toBe(false)
    expect(matchesAnySample(pixel, sequentialSamples)).toBe(false)
  })
})

// -------------------------------------------------------------------------------------------
// Task 3: the hatch and the rule read cleanly together where they overlap
// -------------------------------------------------------------------------------------------

describe('Task 3: the hatch and the short-horizon rule read cleanly together (F-04)', () => {
  // Same 20x4 shape and entry-date construction as Task 1's fixture, so shortHorizonColumn(grid)
  // is again deterministically 10 and ruleX is again exactly 100 -- see that describe block's own
  // comment for the arithmetic. Reused rather than re-derived so this test's own fixture is
  // provably the same rule geometry Task 1 already verified in isolation.
  const endOfDataDate = '2020-01-01'
  const cols = 20
  const rows = 4
  const widthPx = 200
  const heightPx = 80
  const openEndedEntryDates = Array.from({ length: cols }, (_, col) => isoDateMinusDays(endOfDataDate, 2000 - 100 * col))

  function makeStraddlingGrid(): SweepGrid {
    const grid = createSweepGrid(cols, rows, testMeta({ entryDates: openEndedEntryDates, holdMode: 'end-of-data', endOfDataDate }))
    grid.multiples.fill(2) // flat field: no contour crossings, isolating hatch + rule pixels
    // Ruined block straddles the rule's own column (10): columns 8-12, rows 0-2 (leaving row 3 --
    // the TOP of the canvas, where the rule's own label and its backing panel sit -- untouched, so
    // sampling below stays clear of the label's own pixels).
    for (let row = 0; row <= 2; row++) {
      for (let col = 8; col <= 12; col++) {
        grid.flags[row * cols + col] = CELL_FLAG_RUINED
      }
    }
    return grid
  }

  test('shortHorizonColumn resolves to column 10 on this fixture (sanity check shared with Task 1)', () => {
    expect(shortHorizonColumn(makeStraddlingGrid())).toBe(10)
  })

  test("at three row positions inside the hatched block, the rule's muted stroke is present at the rule's own column, and the hatch survives one cell either side", () => {
    const grid = makeStraddlingGrid()
    const ctx = makeCanvas(widthPx, heightPx)
    paintSweepField(ctx, grid, { metric: 'multiple' })
    const data = ctx.getImageData(0, 0, widthPx, heightPx).data

    const muted = readCssRgb('--color-text-muted')
    const cellWidthPx = widthPx / cols
    const cellHeightPx = heightPx / rows
    const ruleX = 10 * cellWidthPx // 100

    // rows 0, 1, 2 (grid space) map to image rows 3, 2, 1 (rows - 1 - row) -- three separate row
    // positions strictly inside the hatched block (row 3/image-row 0 is deliberately excluded, see
    // makeStraddlingGrid's own comment).
    const sampleImgRows = [1, 2, 3] // image rows corresponding to grid rows 2, 1, 0
    for (const imgRow of sampleImgRows) {
      const yCenter = imgRow * cellHeightPx + cellHeightPx / 2

      // The rule's own muted stroke is present somewhere in a small y-window around this row's
      // centre, at the rule's own column -- the dashed period means not every single y matches,
      // so scan a window rather than one exact y (mirrors Task 1's own dash-sampling approach).
      let ruleFound = false
      for (let dy = -8; dy <= 8 && !ruleFound; dy++) {
        const y = Math.round(yCenter) + dy
        if (y < 0 || y >= heightPx) continue
        for (let dx = -2; dx <= 2; dx++) {
          const [r, g, b] = pixelAt(data, widthPx, Math.round(ruleX) + dx, y)
          if (rgbDistance([r, g, b], muted) < 40) {
            ruleFound = true
            break
          }
        }
      }
      expect(ruleFound, `image row ${imgRow}: the rule's muted stroke must be findable near the rule's own column`).toBe(true)

      // One cell either side of the rule (columns 9 and 11), the hatch survives: two pixels at
      // different offsets within that single cell differ from each other (the same texture proof
      // Task 2 uses), proving the rule did not suppress the hatch it's drawn over.
      for (const col of [9, 11]) {
        const cellX0 = col * cellWidthPx
        const cellY0 = imgRow * cellHeightPx
        const cornerA = pixelAt(data, widthPx, Math.floor(cellX0 + 2), Math.floor(cellY0 + 2))
        const cornerB = pixelAt(data, widthPx, Math.floor(cellX0 + cellWidthPx - 2), Math.floor(cellY0 + cellHeightPx - 2))
        expect(cornerA, `image row ${imgRow}, col ${col}: hatch texture must survive next to the rule`).not.toEqual(cornerB)
      }
    }
  })

  test("the label's bounding box region contains the panel surface colour behind the text, so the label is legible over the hatch texture", () => {
    // A wider canvas than this describe block's other two tests use (700 vs 200px): at 200px wide,
    // SHORT_HORIZON_LABEL (a full sentence) is wider than the whole canvas regardless of which side
    // it renders on, which is exactly what Task 1's own "renders to the right by default" test
    // avoids the same way (a 600px canvas there). 700px here gives the label room to render fully
    // on one side so its backing rectangle -- and the padding strip this test samples inside --
    // stays entirely on-canvas.
    const wideWidthPx = 700
    const cellWidthPx = wideWidthPx / cols
    const grid = makeStraddlingGrid()
    const ctx = makeCanvas(wideWidthPx, heightPx)
    paintSweepField(ctx, grid, { metric: 'multiple' })
    const data = ctx.getImageData(0, 0, wideWidthPx, heightPx).data

    const surface = readCssRgb('--color-surface')
    const ruleX = 10 * cellWidthPx // 350, comfortable room on both sides at this width

    // Independently recompute the expected backing rectangle, mirroring short-horizon.ts's own
    // paintShortHorizonRule geometry exactly (LABEL_GAP_PX=4, --space-xs padding=4, font size 12).
    const measureCtx = document.createElement('canvas').getContext('2d')!
    measureCtx.font = '12px system-ui, -apple-system, "Segoe UI", sans-serif'
    const textWidth = measureCtx.measureText(SHORT_HORIZON_LABEL).width
    const gap = 4
    const padding = 4
    const fitsRight = ruleX + gap + textWidth <= wideWidthPx
    expect(fitsRight, 'sanity check on the fixture: the label must fit to the right at this canvas width').toBe(true)
    const backingX = ruleX + gap - padding

    // Sample just inside the backing rectangle's own leading edge -- inside the padding strip
    // reserved between the backing's own border and where the glyph ink begins, so this pixel is
    // reliably pure backing fill rather than possibly landing on a text stroke.
    const sampleX = Math.round(backingX) + 1
    const sampleY = 1 // 1px inside the backing's own top edge (backingY = LABEL_GAP_PX - padding = 0)

    const [r, g, b] = pixelAt(data, wideWidthPx, sampleX, sampleY)
    expect(rgbDistance([r, g, b], surface), 'the label backing must be the panel surface colour, not the field or hatch beneath it').toBeLessThan(15)
  })
})

// -------------------------------------------------------------------------------------------
// Task 4: the breakeven curve's inline label
// -------------------------------------------------------------------------------------------

describe('Task 4: inline breakeven curve label (D-33)', () => {
  const cols = 20
  const rows = 4
  const widthPx = 200
  const heightPx = 80

  function makeGradientGrid(metric: 'multiple' | 'drawdown', holdMode: 'fixed' | 'end-of-data' = 'fixed'): SweepGrid {
    const grid = createSweepGrid(
      cols,
      rows,
      testMeta({
        entryDates: Array.from({ length: cols }, () => '2000-01-01'),
        holdMode,
        holdingYears: holdMode === 'fixed' ? 5 : 0,
        endOfDataDate: '2020-01-01',
      }),
    )
    if (metric === 'multiple') {
      // Linear gradient from 2.00x down to -2.00x across the columns, identical for every row --
      // crosses breakeven (1.00x) at a fixed fractional column (col = 4.75, solved from
      // 2 - (col/19)*4 = 1), the same for every row-cell, so marchingSquaresSegments returns one
      // segment per row-band that together form a single continuous vertical line.
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          grid.multiples[row * cols + col] = 2 - (col / (cols - 1)) * 4
        }
      }
    } else {
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          grid.drawdowns[row * cols + col] = 0.1 + (col / (cols - 1)) * 0.5
        }
      }
    }
    return grid
  }

  /** Independently recomputes the emphasized level's own display-space segments through the same
   * public pipeline `paint-contour.ts` uses internally (`getRampValues` -> `marchingSquaresSegments`
   * -> `gridColToDisplayX`/`gridRowToDisplayY`), so this test derives its expectations from the
   * same public API surface the implementation is built on, not from a second, hand-rolled copy of
   * the field arithmetic. */
  function emphasizedDisplaySegments(grid: SweepGrid, metric: 'multiple' | 'drawdown'): DisplaySegment[] {
    const level = emphasizedBandLevelFor(metric)
    if (level === null) return []
    const rampValues = getRampValues(grid, metric)
    const gridSegments = marchingSquaresSegments(rampValues, grid.cols, grid.rows, level, grid.flags)
    return gridSegments.map((segment) => ({
      x1: gridColToDisplayX(segment.x1, widthPx, grid.cols),
      y1: gridRowToDisplayY(segment.y1, heightPx, grid.rows),
      x2: gridColToDisplayX(segment.x2, widthPx, grid.cols),
      y2: gridRowToDisplayY(segment.y2, heightPx, grid.rows),
    }))
  }

  test('multiple-of-contributed: "1.00x" (via formatMultiple) renders within two pixels of a breakeven iso-segment', () => {
    expect(formatMultiple(1.0)).toBe('1.00x')
    expect(formatMultiple(1.0)).toMatch(/^\d\.\d{2}x$/) // two fixed decimals, trailing lowercase x

    const grid = makeGradientGrid('multiple')
    const displaySegments = emphasizedDisplaySegments(grid, 'multiple')
    expect(displaySegments.length).toBeGreaterThan(0)
    const anchor = labelAnchorAvoiding(displaySegments, { widthPx, heightPx }, null, 0)
    expect(anchor).not.toBeNull()

    const ctx = makeCanvas(widthPx, heightPx)
    paintSweepField(ctx, grid, { metric: 'multiple' })
    const data = ctx.getImageData(0, 0, widthPx, heightPx).data
    const textColor = readCssRgb('--color-text')

    let found = false
    for (let dy = -2; dy <= 2 && !found; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = Math.round(anchor!.xPx) + dx
        const y = Math.round(anchor!.yPx) + dy
        if (x < 0 || x >= widthPx || y < 0 || y >= heightPx) continue
        const [r, g, b] = pixelAt(data, widthPx, x, y)
        if (rgbDistance([r, g, b], textColor) < 30) {
          found = true
          break
        }
      }
    }
    expect(found, 'label ink must appear within two pixels of the independently-computed anchor').toBe(true)
  })

  test('drawdown: no inline curve label renders (sequential scale has no emphasized threshold)', () => {
    expect(emphasizedBandLevelFor('drawdown')).toBeNull()

    const grid = makeGradientGrid('drawdown')
    const ctx = makeCanvas(widthPx, heightPx)
    paintSweepField(ctx, grid, { metric: 'drawdown' })
    const data = ctx.getImageData(0, 0, widthPx, heightPx).data
    const textColor = readCssRgb('--color-text')

    // No boundary is ever drawn at the 2px var(--color-text) emphasis for drawdown (isEmphasized
    // is never true, since emphasizedBandLevelFor('drawdown') is null), so --color-text should
    // never appear anywhere on this canvas at all.
    let anyTextColor = false
    outer: for (let y = 0; y < heightPx; y++) {
      for (let x = 0; x < widthPx; x++) {
        const [r, g, b] = pixelAt(data, widthPx, x, y)
        if (rgbDistance([r, g, b], textColor) < 15) {
          anyTextColor = true
          break outer
        }
      }
    }
    expect(anyTextColor).toBe(false)
  })

  test('the stroked breakeven line is interrupted under the label bounding box, not stroked continuously through it', () => {
    const grid = makeGradientGrid('multiple')
    const displaySegments = emphasizedDisplaySegments(grid, 'multiple')
    const anchor = labelAnchorAvoiding(displaySegments, { widthPx, heightPx }, null, 0)
    expect(anchor).not.toBeNull()

    const ctx = makeCanvas(widthPx, heightPx)
    paintSweepField(ctx, grid, { metric: 'multiple' })
    const data = ctx.getImageData(0, 0, widthPx, heightPx).data
    const textColor = readCssRgb('--color-text')

    // This fixture's breakeven crossing is at the SAME x for every row (see makeGradientGrid's own
    // comment), so the emphasized stroke is one continuous vertical line down the full canvas
    // height except where paint-contour.ts skips the segment(s) under the label's own bounding box.
    const strokeX = Math.round(anchor!.xPx)
    const hasTextColorAt = (y: number): boolean => {
      for (let dx = -1; dx <= 1; dx++) {
        const [r, g, b] = pixelAt(data, widthPx, strokeX + dx, y)
        if (rgbDistance([r, g, b], textColor) < 30) return true
      }
      return false
    }

    const presentYs: number[] = []
    const absentYs: number[] = []
    for (let y = 0; y < heightPx; y++) {
      if (hasTextColorAt(y)) presentYs.push(y)
      else absentYs.push(y)
    }

    expect(presentYs.length, 'the line must be intact somewhere away from the label').toBeGreaterThan(0)
    expect(absentYs.length, 'the line must be interrupted somewhere, under the label').toBeGreaterThan(0)

    // The interruption is a genuine gap SANDWICHED inside the line's own present-y range (not
    // merely absent above/below the line's own natural extent, which this fixture's construction
    // does not produce anyway since the line spans the full canvas height by construction).
    const minPresent = Math.min(...presentYs)
    const maxPresent = Math.max(...presentYs)
    const interruptedInsideRange = absentYs.some((y) => y > minPresent && y < maxPresent)
    expect(interruptedInsideRange, 'the absent run must sit strictly inside the line\'s own present-y range').toBe(true)
  })

  test('the breakeven curve label, forced near the short-horizon rule, does not collide with the rule label (F-04)', () => {
    // A 40x20 grid, wide enough that SHORT_HORIZON_LABEL comfortably fits and the diagonal
    // breakeven crossing below spans a genuine range of x positions to choose an anchor from.
    const wideCols = 40
    const wideRows = 20
    const wideWidthPx = 800
    const wideHeightPx = 400
    const endOfDataDate = '2020-01-01'

    // shortHorizonColumn resolves to column 20 (exact centre): columns < 20 are comfortably above
    // the 3-year threshold (2000 calendar days remaining), columns >= 20 are comfortably below it
    // (500 calendar days remaining) -- same isoDateMinusDays construction Task 1's own fixture uses.
    const entryDates = Array.from({ length: wideCols }, (_, col) => isoDateMinusDays(endOfDataDate, col < 20 ? 2000 : 500))
    const grid = createSweepGrid(wideCols, wideRows, testMeta({ entryDates, holdMode: 'end-of-data', endOfDataDate }))
    expect(shortHorizonColumn(grid)).toBe(20)
    const ruleX = 20 * (wideWidthPx / wideCols) // 400, the canvas's own horizontal centre

    // Diagonal breakeven crossing at col === row (valid for row 0..19, i.e. columns 0..19, the
    // LEFT half of the grid): the crossing nearest the rule sits at (row 19, col 19), whose display
    // x is close to ruleX -- a genuine near-collision the label must be steered away from, per this
    // task's own F-04 resolution ("prefer an anchor at least the label's own width away from the
    // rule's column, falling back to the next-shallowest segment").
    for (let row = 0; row < wideRows; row++) {
      for (let col = 0; col < wideCols; col++) {
        grid.multiples[row * wideCols + col] = 1 + (col - row) * 0.05
      }
    }

    // emphasizedDisplaySegments closes over the OTHER tests' own 200x80 module-level geometry
    // constants, which do not match this test's 800x400 canvas -- recompute directly at this
    // test's own size rather than reuse that helper.
    const level = emphasizedBandLevelFor('multiple')!
    const rampValues = getRampValues(grid, 'multiple')
    const gridSegments = marchingSquaresSegments(rampValues, wideCols, wideRows, level, grid.flags)
    const wideDisplaySegments: DisplaySegment[] = gridSegments.map((segment) => ({
      x1: gridColToDisplayX(segment.x1, wideWidthPx, wideCols),
      y1: gridRowToDisplayY(segment.y1, wideHeightPx, wideRows),
      x2: gridColToDisplayX(segment.x2, wideWidthPx, wideCols),
      y2: gridRowToDisplayY(segment.y2, wideHeightPx, wideRows),
    }))
    expect(wideDisplaySegments.length).toBeGreaterThan(0)

    const measureCtx = document.createElement('canvas').getContext('2d')!
    measureCtx.font = CURVE_LABEL_FONT
    const curveLabelText = formatMultiple(1.0)
    const curveTextWidth = measureCtx.measureText(curveLabelText).width

    const anchor = labelAnchorAvoiding(wideDisplaySegments, { widthPx: wideWidthPx, heightPx: wideHeightPx }, ruleX, curveTextWidth)
    expect(anchor).not.toBeNull()
    // The invariant `labelAnchorAvoiding` itself is responsible for: the chosen anchor clears the
    // rule's column by at least the label's own width.
    expect(Math.abs(anchor!.xPx - ruleX)).toBeGreaterThanOrEqual(curveTextWidth)

    // The short-horizon rule label's own bounding box (mirrors short-horizon.ts's own geometry).
    measureCtx.font = '12px system-ui, -apple-system, "Segoe UI", sans-serif'
    const ruleLabelTextWidth = measureCtx.measureText(SHORT_HORIZON_LABEL).width
    const gap = 4
    const padding = 4
    const fitsRight = ruleX + gap + ruleLabelTextWidth <= wideWidthPx
    const ruleLabelMinX = fitsRight ? ruleX + gap - padding : ruleX - gap - ruleLabelTextWidth - padding
    const ruleLabelMaxX = ruleLabelMinX + ruleLabelTextWidth + padding * 2
    const ruleLabelMinY = 0
    const ruleLabelMaxY = 12 + padding * 2

    // The curve label's own bounding box, centred on the chosen anchor.
    const curveHalfW = curveTextWidth / 2
    const curveHalfH = CURVE_LABEL_FONT_HEIGHT_PX / 2
    const curveLabelMinX = anchor!.xPx - curveHalfW
    const curveLabelMaxX = anchor!.xPx + curveHalfW
    const curveLabelMinY = anchor!.yPx - curveHalfH
    const curveLabelMaxY = anchor!.yPx + curveHalfH

    const intersects =
      curveLabelMinX <= ruleLabelMaxX && curveLabelMaxX >= ruleLabelMinX && curveLabelMinY <= ruleLabelMaxY && curveLabelMaxY >= ruleLabelMinY
    expect(intersects, 'the curve label and the short-horizon rule label must not overlap').toBe(false)

    // Cross-validate against the real render: text-colour ink appears near the independently
    // computed anchor, proving paint-contour.ts's own internal choice matches this prediction
    // (both call the identical exported labelAnchorAvoiding with the identical inputs).
    const ctx = makeCanvas(wideWidthPx, wideHeightPx)
    paintSweepField(ctx, grid, { metric: 'multiple' })
    const data = ctx.getImageData(0, 0, wideWidthPx, wideHeightPx).data
    const textColor = readCssRgb('--color-text')
    let found = false
    for (let dy = -3; dy <= 3 && !found; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const x = Math.round(anchor!.xPx) + dx
        const y = Math.round(anchor!.yPx) + dy
        if (x < 0 || x >= wideWidthPx || y < 0 || y >= wideHeightPx) continue
        const [r, g, b] = pixelAt(data, wideWidthPx, x, y)
        if (rgbDistance([r, g, b], textColor) < 30) {
          found = true
          break
        }
      }
    }
    expect(found, 'the real render must place label ink near the independently-predicted anchor').toBe(true)
  })
})
