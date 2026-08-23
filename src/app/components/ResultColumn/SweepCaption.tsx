/**
 * src/app/components/ResultColumn/SweepCaption.tsx
 *
 * 07-07-PLAN.md Task 3 (D-30): two sentences under the field so a cropped screenshot still says
 * what it is -- mounted from `HeatmapPanel.tsx` INSIDE the sweep panel's own screenshot region so
 * both lines travel with any crop (T-07-05).
 *
 * Line 1, the VIZ-04 mode statement, is read from `props.grid.meta` -- the PAINTED grid, never
 * `backtestRequest()` (the pending request): `meta.holdMode` decides fixed-versus-open-ended
 * wording, so during an in-flight mode change the strip keeps describing the field currently on
 * screen until the new sweep's coarse pass replaces `props.grid` itself. Fixed mode reads
 * `meta.holdingPeriodBars` (a 07-07-PLAN.md Rule-2 addition to `SweepGridMeta`/`buildSweepGridMeta`
 * -- `meta.holdingYears` stays the still-deferred `0` `07-05-PLAN.md` left it at); open-ended mode
 * reads `meta.endOfDataDate`, the identical "end of data, not today" framing
 * `HoldingModeControl.tsx` already uses.
 *
 * Line 2, the VIZ-10 caveat, is `VIZ10_CAVEAT_SENTENCES` (`sweep-copy.ts`) joined into one
 * paragraph, the same one-source-of-truth discipline `06-HEATMAP-SPEC.md` section 6 states.
 *
 * Line 3, conditional: appended (never replacing lines 1/2) when `sweepFailedCellCount()` is
 * greater than zero.
 *
 * No em dash characters. Minimized ternaries, never nested.
 */

import { createMemo, Show } from 'solid-js'

import { VIZ10_CAVEAT_SENTENCES } from '../../../heatmap/sweep-copy.ts'
import type { SweepGrid } from '../../../sweep/sweep-grid.ts'
import { sweepFailedCellCount } from '../../state.ts'

/** ~1 trading year, the same figure `HoldingModeControl.tsx`'s own fallback bar count uses --
 * the VIZ-04 copywriting contract's fixed conversion from bars to years. */
const TRADING_DAYS_PER_YEAR = 252

/** Round-half-up to exactly one decimal place: `2520 / 252 = 10.0`, `2646 / 252 = 10.5`. Plain
 * `Math.round` on an already-scaled value is round-half-to-even-adjacent in JS for some inputs at
 * the float boundary; `Math.floor(x + 0.5)` is the explicit round-half-up this copy contract
 * requires, applied at one-decimal scale. `bars` is always >= 0 (D-32's own invariant), so no
 * negative-rounding case needs handling. */
function roundToOneDecimalHalfUp(value: number): number {
  return Math.floor(value * 10 + 0.5) / 10
}

/** The VIZ-04 mode statement, read from the PAINTED grid's own `meta`, never the pending
 * request. */
function modeStatement(grid: SweepGrid): string {
  const meta = grid.meta
  if (meta.holdMode === 'fixed') {
    const bars = meta.holdingPeriodBars ?? 0
    const years = roundToOneDecimalHalfUp(bars / TRADING_DAYS_PER_YEAR)
    return `Every cell held for ${years.toFixed(1)} years.`
  }
  return `Every cell held to end of data (${meta.endOfDataDate}).`
}

export interface SweepCaptionProps {
  /** `null` before any sweep pass has ever resolved (E4/E6 loading) -- both `<p>` lines still
   * mount, the mode line simply has nothing to say yet, so the DOM shape never changes across the
   * null-to-coarse transition (`domElementFingerprint`-style stability, matching
   * `tests/app/sweep-progressive.browser.test.ts`'s existing proof for the rest of this panel). */
  grid: SweepGrid | null
  /** Overrides `sweepFailedCellCount()` (the production default). Exists so
   * `tests/app/sweep-caption.browser.test.ts` can exercise the E6 error line deterministically,
   * without simulating a real Worker-pool chunk failure -- `HeatmapPanel.tsx` never passes this,
   * so production always reads the live signal. */
  failedCellCount?: number
}

export function SweepCaption(props: SweepCaptionProps) {
  const mode = createMemo(() => (props.grid === null ? '' : modeStatement(props.grid)))
  const caveat = () => VIZ10_CAVEAT_SENTENCES.join(' ')
  const failedCount = () => props.failedCellCount ?? sweepFailedCellCount()

  const bodyStyle = {
    margin: '0',
    'font-size': 'var(--font-size-body)',
    'font-family': 'var(--font-ui)',
    'line-height': '1.5',
    color: 'var(--color-text)',
  } as const

  return (
    <div class="sweep-caption" data-testid="sweep-caption" style={{ 'margin-top': 'var(--space-md)' }}>
      <p data-testid="sweep-caption-mode" style={bodyStyle}>
        {mode()}
      </p>
      <p data-testid="sweep-caption-caveat" style={bodyStyle}>
        {caveat()}
      </p>
      <Show when={failedCount() > 0}>
        <p data-testid="sweep-caption-failures" style={bodyStyle}>
          {`${failedCount()} cells could not be computed. Try a different parameter.`}
        </p>
      </Show>
    </div>
  )
}
