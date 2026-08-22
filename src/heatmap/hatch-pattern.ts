/**
 * src/heatmap/hatch-pattern.ts
 *
 * 07-01-PLAN.md Task 1, Pitfall 7: graduates the two PURE helpers `mockup-runtime.ts` defined but
 * D-11 did not name for graduation -- `makeHatchPattern` and `integerLeverageTicks` -- so the
 * ruin-hatch geometry has exactly one definition shared by the Phase 6 mockups and Phase 7's
 * production renderer, the same reasoning `iso-lines.ts`/`field-sampler.ts` were graduated under.
 *
 * Deviation from the plan's literal instruction (Rule 1 auto-fix, documented in
 * 07-01-SUMMARY.md): the plan's prohibition list names `fixtureRowForLeverage` as staying behind
 * in `mockup-runtime.ts` alongside the genuinely DOM-facing scaffolding (`renderLegend`,
 * `renderCaveat`, `mountMockup`, `loadSweepFixture`). But `fixtureRowForLeverage` is
 * `integerLeverageTicks`'s own sole dependency and has no other caller anywhere in the repo, so
 * leaving it behind would either strand it as dead code in `mockup-runtime.ts` or force this
 * module (`src/heatmap/`, production code) to import back from a `.planning/` mockup file that
 * does not survive a milestone archive. Both are worse than moving the one small pure function
 * `integerLeverageTicks` already privately depended on. It moves here as an unexported, private
 * helper -- never re-exported, since nothing outside `integerLeverageTicks` calls it.
 */

import type { Rgba } from '../colorscale/value-to-color.ts'

/**
 * D-18: builds a `CanvasPattern` from a small offscreen tile filled with `rgba` and overdrawn
 * with 45-degree strokes at a 6-display-pixel period and a 2px stroke width (F-03's geometry,
 * Claude's discretion). Three half-overlapping diagonal segments per tile (the main corner-to-
 * corner line plus one partial segment at each of the other two corners) are what keep the
 * diagonal visually continuous once the tile repeats -- a single corner-to-corner stroke alone
 * would break at every tile boundary. Defined in DISPLAY pixels and applied as a fill (typically
 * under a clip path over the union of flagged cells), so it stays legible at any form's own cell
 * size (D-12).
 */
export function makeHatchPattern(ctx: CanvasRenderingContext2D, rgba: Rgba): CanvasPattern {
  const period = 6
  const tile = document.createElement('canvas')
  tile.width = period
  tile.height = period
  const tileCtx = tile.getContext('2d')
  if (!tileCtx) {
    throw new Error('hatch-pattern: 2D context unavailable for the hatch tile')
  }

  const [r, g, b, a] = rgba
  tileCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`
  tileCtx.fillRect(0, 0, period, period)

  tileCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
  tileCtx.lineWidth = 2
  tileCtx.beginPath()
  tileCtx.moveTo(0, period)
  tileCtx.lineTo(period, 0)
  tileCtx.moveTo(-period / 2, period / 2)
  tileCtx.lineTo(period / 2, -period / 2)
  tileCtx.moveTo(period / 2, period * 1.5)
  tileCtx.lineTo(period * 1.5, period / 2)
  tileCtx.stroke()

  const pattern = ctx.createPattern(tile, 'repeat')
  if (!pattern) {
    throw new Error('hatch-pattern: createPattern returned null for the hatch tile')
  }
  return pattern
}

/**
 * The fractional fixture row (0 at `leverages[0]`, `leverages.length - 1` at the last entry)
 * whose value equals `target`, via linear interpolation between the two entries bracketing it.
 * Assumes `leverages` is monotonically ascending (D-08's fixture construction), but does NOT
 * assume EVEN spacing between rows -- this still works if a future fixture's leverage axis is
 * not evenly stepped. Out-of-range `target` clamps to the nearest end index rather than
 * extrapolating.
 *
 * Private to this module: `integerLeverageTicks` below is its only caller (see this file's
 * header deviation note).
 */
function fixtureRowForLeverage(leverages: readonly number[], target: number): number {
  const n = leverages.length
  if (n === 0) return 0
  const first = leverages[0]!
  const last = leverages[n - 1]!
  if (target <= first) return 0
  if (target >= last) return n - 1
  for (let i = 0; i < n - 1; i++) {
    const a = leverages[i]!
    const b = leverages[i + 1]!
    if (target >= a && target <= b) {
      const span = b - a
      const t = span === 0 ? 0 : (target - a) / span
      return i + t
    }
  }
  return n - 1
}

/**
 * Integer leverage values spanning `leverages`' own actual range (`Math.ceil` of the minimum to
 * `Math.floor` of the maximum, inclusive), each paired with its fractional fixture row position
 * via `fixtureRowForLeverage`. D-08 fixes 50 rows over 1x-5x, but this derives the label set and
 * placement from the fixture's own meta rather than hardcoding either the row count or the 1/5
 * bounds, so it stays correct if D-08's own range is ever revisited. Integer leverages do NOT, in
 * general, land on exact row indices (1x-5x over 50 rows steps by 4/49), so callers place each
 * label by interpolating its VALUE to a pixel position, never by picking a nearest row.
 */
export function integerLeverageTicks(
  leverages: readonly number[],
): ReadonlyArray<{ leverage: number; rowF: number }> {
  if (leverages.length === 0) return []
  const first = leverages[0]!
  const last = leverages[leverages.length - 1]!
  const start = Math.ceil(first)
  const end = Math.floor(last)
  const ticks: Array<{ leverage: number; rowF: number }> = []
  for (let leverage = start; leverage <= end; leverage++) {
    ticks.push({ leverage, rowF: fixtureRowForLeverage(leverages, leverage) })
  }
  return ticks
}
