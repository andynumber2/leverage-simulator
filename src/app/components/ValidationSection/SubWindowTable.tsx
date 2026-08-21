/**
 * src/app/components/ValidationSection/SubWindowTable.tsx
 *
 * D-12/D-13: the full rate-regime sub-window breakdown, including the post-2022 high-rate rows,
 * rendered as ordinary rows in an ordinary table -- no row carries a conditional class, a warning
 * colour, a footnote marker, an ordering change or any other treatment keyed on how unfavourable
 * its own figures are (T-05-07's mitigation: every row shares one CSS class and one markup
 * shape). Every cell routes through `src/metrics/format.ts`. Never gated (D-13: sub-windows are
 * reported, not gated).
 */

import { For } from 'solid-js'

import { formatPercent, formatSignedPercent } from '../../../metrics/format.ts'
import type { TrackingErrorResult } from '../../../validation/tracking-error.ts'

export interface SubWindowTableProps {
  rows: TrackingErrorResult[]
}

export function SubWindowTable(props: SubWindowTableProps) {
  return (
    <div class="sub-window-table" data-testid="sub-window-table">
      <h3 class="sub-window-table__heading">By rate regime</h3>
      <For each={props.rows}>
        {(row) => (
          <div class="sub-window-row" data-testid="sub-window-row">
            <span class="sub-window-row__label">{row.label}</span>
            <span class="sub-window-row__figure">
              <span class="sub-window-row__figure-label">Tracking error</span>
              <span class="sub-window-row__figure-value">{formatPercent(row.annualizedTrackingError)}</span>
            </span>
            <span class="sub-window-row__figure">
              <span class="sub-window-row__figure-label">Return drift</span>
              <span class="sub-window-row__figure-value">{formatSignedPercent(row.annualizedReturnDrift)}</span>
            </span>
          </div>
        )}
      </For>
    </div>
  )
}
