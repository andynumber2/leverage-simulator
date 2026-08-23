/**
 * src/heatmap/short-horizon.ts
 *
 * 07-09-PLAN.md Task 1: D-29's short-horizon boundary rule. In open-ended
 * (`grid.meta.holdMode === 'end-of-data'`) sweep mode, entry-date columns near the right edge
 * necessarily hold for only a few weeks or months before the bundled data runs out
 * (PITFALLS E5), so their outcome is dominated by short-term noise rather than by the
 * leverage/cost dynamics the tool exists to illustrate. This module marks where that region
 * begins WITHOUT altering any cell's own colour: `06-HEATMAP-SPEC.md` Finding F-01 names the
 * incomplete-hold grey (D-28's fixed-period treatment, `CELL_FLAG_INCOMPLETE`) as the
 * precedent to start from, and this is exactly where that precedent stops -- every cell right
 * of the rule in open-ended mode carries a real, correct value, so greying it would say "no
 * value here" about a cell that has one (PITFALLS E5's own washed-out-cell failure mode).
 *
 * Zero-import beyond `src/sweep/sweep-grid.ts`'s TYPE (no DOM, no other heatmap module),
 * matching this directory's sibling modules' discipline (`iso-lines.ts`, `field-sampler.ts`):
 * `SHORT_HORIZON_BARS`/`SHORT_HORIZON_LABEL`/`shortHorizonColumn` run unmodified in the fast
 * Node `unit` project. `paintShortHorizonRule` is the one DOM-facing export (canvas text/stroke
 * calls), exercised only by the browser project.
 *
 * `shortHorizonColumn` is computed from `grid.meta.entryDates`/`grid.meta.endOfDataDate` alone
 * -- dates, never a cell value or flag -- so it is invariant under a partially failed sweep
 * (T-07-21): a chunk that fails to compute does not move or invalidate the rule.
 *
 * Trading-bar estimation: this module has no access to the bundled trading calendar (importing
 * it would break the zero-import-outside-src discipline above and pull binary-bundle-decoding
 * machinery into a module that must run in the fast Node `unit` project with no fixture on
 * disk). The remaining horizon is instead estimated from the CALENDAR-day span between an
 * entry date and `endOfDataDate`, converted to bars at the same 252-bars-per-year density
 * `SHORT_HORIZON_BARS` itself is defined against (`BARS_PER_YEAR`/`CALENDAR_DAYS_PER_YEAR`
 * below). This is an estimate, not an exact trading-bar count -- acceptable here because the
 * rule is a coarse "under N years" marker, not a value that feeds any computation, and the
 * estimate's error (at most a few trading days across a calendar year, from weekends/holidays)
 * is far smaller than the width of one grid column on D-03's 200-column entry-date axis.
 */

import type { SweepGrid } from '../sweep/sweep-grid.ts'

/** Bars-per-year density `SHORT_HORIZON_BARS` is defined against, matching every other
 * holding-period-in-bars convention in this codebase (e.g. `src/sweep/sweep-grid.ts`'s own doc
 * comments, `07-UI-SPEC.md`'s `holdingPeriodBars / 252` mode-statement formula). */
const BARS_PER_YEAR = 252

/** Average calendar days per year (accounts for leap years over any multi-year span), used
 * only to convert a calendar-day span into an estimated bar count -- see this module's header. */
const CALENDAR_DAYS_PER_YEAR = 365.25

/** D-29: the short-horizon threshold, 3 years at `BARS_PER_YEAR` bars/year. Planner-authored
 * within `07-CONTEXT.md` D-29's stated discretion (value is Claude's Discretion, provided the
 * label states it) -- flagged for review in this plan's own `planner_assumptions`. */
export const SHORT_HORIZON_BARS = 756

/** Computed from `SHORT_HORIZON_BARS`, used only by the fail-loud check below -- a prose label
 * reads better with a written-out literal than a template-interpolated number, so
 * `SHORT_HORIZON_LABEL` itself carries the digit as a literal, but that literal's CORRECTNESS is
 * derived from, and continuously checked against, this value rather than trusted by hand. `756 /
 * 252 === 3` exactly. */
const SHORT_HORIZON_YEARS = SHORT_HORIZON_BARS / BARS_PER_YEAR

/** D-29's exact copy (`07-UI-SPEC.md` Copywriting Contract row "Short-horizon boundary rule
 * label"). */
export const SHORT_HORIZON_LABEL = 'Right of here: under 3 years held'

/** D-29 requires the threshold to be STATED in the label rather than implied. Fails loudly at
 * module load (the same found-vs-expected discipline `src/data/sweep-fixture-format.ts` already
 * uses) if `SHORT_HORIZON_LABEL`'s literal "3" is ever left stale after `SHORT_HORIZON_BARS` is
 * re-tuned -- re-tuning the threshold without updating the label text is a compile-passing,
 * runtime-failing mistake this check exists to catch immediately rather than silently ship. */
if (!SHORT_HORIZON_LABEL.includes(`under ${SHORT_HORIZON_YEARS} years held`)) {
  throw new Error(
    `short-horizon: SHORT_HORIZON_LABEL ("${SHORT_HORIZON_LABEL}") does not match SHORT_HORIZON_BARS ` +
      `(${SHORT_HORIZON_BARS} bars, ${SHORT_HORIZON_YEARS} years) -- update the label's literal text`,
  )
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Parses a `YYYY-MM-DD` ISO date string (trusted -- these come from the bundled manifest and
 * `SweepGridMeta`, not user input) into a UTC epoch-millisecond timestamp via `Date.UTC`, the
 * same UTC-anchored construction `src/app/permalink.ts`'s `parseIsoDate` and
 * `src/data/contribution-schedule.ts` already use elsewhere in this codebase, so date-only
 * arithmetic never drifts by a local timezone offset. */
function parseIsoDateUtcMs(iso: string): number {
  const parts = iso.split('-')
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  return Date.UTC(year, month - 1, day)
}

/** The estimated remaining trading-bar count between `entryDateIso` and `endOfDataDateIso`, per
 * this module's header. Negative when `entryDateIso` is after `endOfDataDateIso` (should not
 * occur for a real entry-date axis, but not clamped: a negative value is still correctly "below
 * the threshold" for `shortHorizonColumn`'s own comparison). */
function estimatedRemainingBars(entryDateIso: string, endOfDataDateIso: string): number {
  const remainingCalendarDays = (parseIsoDateUtcMs(endOfDataDateIso) - parseIsoDateUtcMs(entryDateIso)) / MS_PER_DAY
  return (remainingCalendarDays / CALENDAR_DAYS_PER_YEAR) * BARS_PER_YEAR
}

/**
 * The grid-space (fractional-column) index of the first entry-date column whose estimated
 * remaining horizon to `grid.meta.endOfDataDate` falls strictly below `SHORT_HORIZON_BARS`, or
 * `null` when no such column exists.
 *
 * `null` in three distinct cases, per this plan's own `must_haves`:
 * - `grid.meta.holdMode === 'fixed'`: the rule never applies in fixed-period mode (D-28's grey
 *   treatment applies there instead), regardless of what the dates would otherwise imply.
 * - open-ended mode, but every column still leaves at least the threshold horizon (e.g. a short
 *   overall bundled history entirely inside the threshold, or a threshold tuned very small):
 *   no column crosses.
 * - a grid with fewer columns than the threshold could possibly imply: falls out of the same
 *   loop with no crossing found, returning `null` rather than throwing or returning a negative
 *   index.
 *
 * Reads only `grid.meta.entryDates`/`grid.meta.endOfDataDate`/`grid.meta.holdMode` -- never a
 * cell value or flag (T-07-21) -- so the result is unchanged by a wholesale replacement of every
 * cell's own data, and stays correct over a field containing chunk-failure cells.
 */
export function shortHorizonColumn(grid: SweepGrid): number | null {
  if (grid.meta.holdMode === 'fixed') return null

  const { entryDates, endOfDataDate } = grid.meta
  for (let col = 0; col < entryDates.length; col++) {
    const entryDate = entryDates[col]
    if (entryDate === undefined) continue
    if (estimatedRemainingBars(entryDate, endOfDataDate) < SHORT_HORIZON_BARS) {
      return col
    }
  }
  return null
}

/** The field's own paint-area dimensions in DISPLAY pixels -- matches `paintSweepField`'s own
 * `widthPx`/`heightPx` (the full canvas: production `paint-contour.ts` applies no separate
 * axis-gutter offset inside canvas coordinate space, unlike the Phase 6 mockup's `FieldRect`;
 * the left gutter is CSS padding on the wrapping element, per 07-07-SUMMARY.md's
 * `onGutterMeasured` pattern). */
export interface ShortHorizonFieldRect {
  widthPx: number
  heightPx: number
}

function getCssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value === '' ? fallback : value
}

/** 12px/400, the "Label / inline annotation" typographic role `07-UI-SPEC.md`'s Typography
 * table assigns to this exact label, in the app's UI-text stack (this is prose, not a numeric
 * readout, so it does not route through the numerics-only monospace stack `SliceChart.tsx`'s
 * `AXIS_FONT` uses). */
const LABEL_FONT = '12px system-ui, -apple-system, "Segoe UI", sans-serif'

/** Gap, in display pixels, between the rule and its label text on either side of the line. */
const LABEL_GAP_PX = 4

/**
 * Draws the short-horizon boundary: a 1px DASHED vertical rule in `var(--color-text-muted)` at
 * `columnIndex`'s own LEFT edge, plus `SHORT_HORIZON_LABEL` beside it. Deliberately muted and
 * thin (not the accent colour, not the 2px solid breakeven treatment `paint-contour.ts` already
 * draws) so it reads as a deliberate marked boundary without competing with the field's own
 * emphasised contour line or the committed crosshair for visual priority (`07-UI-SPEC.md`'s
 * Visual Hierarchy item 8) -- "quiet" here does not mean "faint to the point of missable": the
 * caller is responsible for verifying real contrast against the field colours on both sides.
 *
 * Cell colours are left completely untouched by this function: it paints strictly ON TOP of an
 * already-painted field (called from `paintSweepField`'s annotation pass, after every band fill
 * and stroke), never underneath, never blended.
 *
 * The label renders to the right of the line by default, flipping to the left when the line
 * falls near the panel's own right edge, so it never clips off-panel (the E8 overflow backstop).
 */
export function paintShortHorizonRule(
  ctx: CanvasRenderingContext2D,
  fieldRect: ShortHorizonFieldRect,
  columnIndex: number,
  cols: number,
): void {
  const { widthPx, heightPx } = fieldRect
  const cellWidthPx = widthPx / cols
  const x = columnIndex * cellWidthPx
  // Canvas centres a stroked path ON its coordinate, so a 1px line at an exact pixel BOUNDARY
  // (x = an integer, as it always is when cellWidthPx is a whole number of display pixels, the
  // common case) anti-aliases into a ~50% blend split across the two neighbouring pixel columns
  // -- a washed-out intermediate colour, not the crisp muted line VIZ-09 requires to "stay
  // legible in a cropped screenshot" (07-UI-SPEC.md Visual Hierarchy item 8). Snapping to the
  // nearest pixel centre (`+ 0.5`) is the standard canvas crisp-line technique and gives full
  // coverage on one pixel column instead of half coverage on two.
  const snappedX = Math.round(x) + 0.5

  const muted = getCssVar('--color-text-muted', '#5b6169')

  ctx.save()
  ctx.strokeStyle = muted
  ctx.lineWidth = 1
  // Task 3's own dash period, distinguishable from the ruin hatch's 6-display-pixel diagonal
  // period -- see that task's own header note once it lands.
  ctx.setLineDash([4, 3])
  ctx.beginPath()
  ctx.moveTo(snappedX, 0)
  ctx.lineTo(snappedX, heightPx)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()

  ctx.save()
  ctx.font = LABEL_FONT
  ctx.fillStyle = muted
  ctx.textBaseline = 'top'
  const textWidth = ctx.measureText(SHORT_HORIZON_LABEL).width
  const fitsRight = x + LABEL_GAP_PX + textWidth <= widthPx
  if (fitsRight) {
    ctx.textAlign = 'left'
    ctx.fillText(SHORT_HORIZON_LABEL, x + LABEL_GAP_PX, LABEL_GAP_PX)
  } else {
    ctx.textAlign = 'right'
    ctx.fillText(SHORT_HORIZON_LABEL, x - LABEL_GAP_PX, LABEL_GAP_PX)
  }
  ctx.restore()
}
