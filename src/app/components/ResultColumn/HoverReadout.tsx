/**
 * src/app/components/ResultColumn/HoverReadout.tsx
 *
 * 07-08-PLAN.md Task 2 (D-20): a small floating card, not a layout element -- `sm` padding
 * throughout, absolutely positioned within `HeatmapPanel.tsx`'s own field stack, never
 * participating in the panel's outer spacing rhythm (07-UI-SPEC.md Spacing exception).
 *
 * Carries the pointed-at cell's ENTIRE receipt: entry date, leverage, and every metric the sweep
 * computed for that cell (multiple, drawdown, and IRR/CAGR), not only the currently displayed
 * one -- METR-06 computes them all in one pass, so this costs nothing. Field labels are exactly
 * `Entry`, `Leverage`, `Multiple`, `Drawdown`, and `IRR`/`CAGR`, mirroring
 * `MetricToggle.tsx`'s own IRR/CAGR naming rule (`backtestRequest().contributionAmount`).
 *
 * A ruined or incomplete cell replaces the numeric multiple/drawdown/annualized rows with the
 * categorical label itself (`Ruined` / `Incomplete hold`) rather than showing a stale or zeroed
 * number beside a categorical state (T-07-18). A cell whose annualized value is
 * `ANNUALIZED_UNDEFINED` (`NaN`) renders a dash in that row, never `0` and never the generic
 * `formatSignedPercent` "n/a" placeholder, so an undefined annualized return is visually distinct
 * from every other undefined-metric case in the app.
 *
 * Positioned above and to the right of `props.anchorXPx`/`anchorYPx` (the pointed-at cell's own
 * display-space centre, `07-UI-SPEC.md` Visual Hierarchy item 7's "offset above-right"), flipping
 * to the left and/or below when the default position would spill past `panelWidthPx`/
 * `panelHeightPx` -- verified at the field's own corner cells. The card's own footprint
 * (`CARD_WIDTH_PX`/`CARD_HEIGHT_PX`) is fixed rather than measured, so the flip/clamp maths above
 * has an exact, not merely estimated, bound to clamp against.
 *
 * `pointer-events: none`: the card must never itself become the hover target, or moving toward it
 * to read a value would move the pointer off the cell it is reporting on.
 *
 * Every value routes through `src/metrics/format.ts` (`formatMultiple`/`formatPercent`/
 * `formatSignedPercent`); no second formatter is introduced. The entry date is rendered as the
 * grid's own ISO string directly, matching `EntryDateControl.tsx`'s identical convention.
 *
 * No em dash characters. Minimized ternaries, never nested.
 *
 * F-02 (08-CONTEXT.md Open Question, resolved in 08-01 Task 2): the root element below carries the
 * F-02 export-exclusion attribute (see `png-export.ts`'s node filter), the one place in the app it
 * is used. It names transient pointer state, not the argument being made, so the filter drops it
 * from a PNG capture. The committed crosshair overlay canvas (`HeatmapPanel.tsx`) carries no such
 * attribute and stays in the image -- a click-committed cell names the cell being argued about.
 */

import { Show } from 'solid-js'

import { CELL_FLAG_INCOMPLETE, CELL_FLAG_RUINED } from '../../../data/sweep-fixture-format.ts'
import { formatMultiple, formatPercent, formatSignedPercent } from '../../../metrics/format.ts'
import { ANNUALIZED_UNDEFINED, cellIndex, type SweepGrid } from '../../../sweep/sweep-grid.ts'
import { backtestRequest } from '../../state.ts'

/** Fixed card footprint, in display px -- see this file's header for why fixed rather than
 * measured. Generous enough to hold every row's longest realistic content (a ten-character ISO
 * date, a six-character signed percent) without wrapping. */
const CARD_WIDTH_PX = 176
const CARD_HEIGHT_PX = 156
/** Gap between the pointed-at cell's own centre and the card's near edge, in display px. */
const CARD_GAP_PX = 12

export interface HoverReadoutCell {
  col: number
  row: number
}

export interface HoverReadoutProps {
  grid: SweepGrid
  cell: HoverReadoutCell
  /** The pointed-at cell's own display-space centre, within the same coordinate space
   * `panelWidthPx`/`panelHeightPx` describe (`HeatmapPanel.tsx`'s field stack, matching
   * `paint-contour.ts`'s `gridColToDisplayX`/`gridRowToDisplayY`). */
  anchorXPx: number
  anchorYPx: number
  panelWidthPx: number
  panelHeightPx: number
}

/** D-24's naming rule, duplicated from `MetricToggle.tsx`'s own (unexported) `annualizedLabel`:
 * both read the identical `backtestRequest().contributionAmount` condition, so the readout's
 * third label always agrees with the metric toggle's own third segment. */
function annualizedLabel(): 'IRR' | 'CAGR' {
  return backtestRequest().contributionAmount !== 0 ? 'IRR' : 'CAGR'
}

interface ReadoutRowProps {
  label: string
  value: string
}

function ReadoutRow(props: ReadoutRowProps) {
  return (
    <div
      class="hover-readout-row"
      data-testid="hover-readout-row"
      style={{
        display: 'flex',
        'justify-content': 'space-between',
        'align-items': 'baseline',
        gap: 'var(--space-sm)',
        'margin-top': 'var(--space-xs)',
      }}
    >
      <span
        class="hover-readout-label"
        style={{ 'font-size': 'var(--font-size-label)', 'font-family': 'var(--font-ui)', color: 'var(--color-text-muted)' }}
      >
        {props.label}
      </span>
      <span
        class="hover-readout-value"
        style={{ 'font-size': 'var(--font-size-secondary-metric)', 'font-family': 'var(--font-mono)', color: 'var(--color-text)' }}
      >
        {props.value}
      </span>
    </div>
  )
}

export function HoverReadout(props: HoverReadoutProps) {
  const idx = () => cellIndex(props.cell.col, props.cell.row, props.grid.cols)
  const flags = () => props.grid.flags[idx()] ?? 0
  const ruined = () => (flags() & CELL_FLAG_RUINED) !== 0
  const incomplete = () => (flags() & CELL_FLAG_INCOMPLETE) !== 0
  const categorical = () => ruined() || incomplete()
  const categoricalLabel = () => (ruined() ? 'Ruined' : 'Incomplete hold')

  const entryDate = () => props.grid.meta.entryDates[props.cell.col] ?? ''
  const leverage = () => props.grid.meta.leverages[props.cell.row] ?? 0
  const multiple = () => props.grid.multiples[idx()] ?? 0
  const drawdown = () => props.grid.drawdowns[idx()] ?? 0
  const annualizedRaw = () => props.grid.annualized[idx()] ?? ANNUALIZED_UNDEFINED
  const annualizedText = () => (Number.isFinite(annualizedRaw()) ? formatSignedPercent(annualizedRaw()) : '-')

  const left = () => {
    let x = props.anchorXPx + CARD_GAP_PX
    if (x + CARD_WIDTH_PX > props.panelWidthPx) x = props.anchorXPx - CARD_GAP_PX - CARD_WIDTH_PX
    return Math.max(0, Math.min(x, Math.max(0, props.panelWidthPx - CARD_WIDTH_PX)))
  }
  const top = () => {
    let y = props.anchorYPx - CARD_GAP_PX - CARD_HEIGHT_PX
    if (y < 0) y = props.anchorYPx + CARD_GAP_PX
    return Math.max(0, Math.min(y, Math.max(0, props.panelHeightPx - CARD_HEIGHT_PX)))
  }

  return (
    <div
      class="hover-readout"
      data-testid="hover-readout"
      data-export-exclude="true"
      style={{
        position: 'absolute',
        left: `${left()}px`,
        top: `${top()}px`,
        width: `${CARD_WIDTH_PX}px`,
        height: `${CARD_HEIGHT_PX}px`,
        padding: 'var(--space-sm)',
        'box-sizing': 'border-box',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        'border-radius': '4px',
        'pointer-events': 'none',
        'z-index': '2',
      }}
    >
      <ReadoutRow label="Entry" value={entryDate()} />
      <ReadoutRow label="Leverage" value={formatMultiple(leverage())} />
      <Show
        when={!categorical()}
        fallback={
          <div
            class="hover-readout-categorical"
            data-testid="hover-readout-categorical"
            style={{
              'font-size': 'var(--font-size-secondary-metric)',
              'font-family': 'var(--font-mono)',
              color: 'var(--color-text)',
              'margin-top': 'var(--space-sm)',
            }}
          >
            {categoricalLabel()}
          </div>
        }
      >
        <ReadoutRow label="Multiple" value={formatMultiple(multiple())} />
        <ReadoutRow label="Drawdown" value={formatPercent(drawdown())} />
        <ReadoutRow label={annualizedLabel()} value={annualizedText()} />
      </Show>
    </div>
  )
}
