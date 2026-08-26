/**
 * src/export/png-export.ts
 *
 * SHARE-04/D-01/D-02/D-03/D-04: the `html-to-image` call site that turns the whole
 * `.screenshot-region` DOM subtree into a PNG `Blob`, at one fixed export width and 2x pixel
 * density independent of the exporting viewport (D-03), with a forced opaque background matching
 * the theme currently on screen and a visible frame margin (D-02).
 *
 * `EXPORT_WIDTH_PX`/`EXPORT_PIXEL_RATIO` are exported so tests assert against these constants
 * rather than a repeated literal -- and so a future change to the export width is a one-line,
 * reviewable edit, not a hunt through call sites (D-03 rates this reversibility "costly": every
 * export already shared under the old width becomes non-comparable with a new one).
 *
 * T-08-02: this module's scope is `.screenshot-region` only, passed in by the caller -- it never
 * reaches for `document.body` itself, so nothing outside the result region can be rasterized.
 * The `data-export-exclude` filter (F-02, wired in plan 08-01 Task 2) only ever subtracts from
 * that scope, never widens it.
 */

import { toBlob } from 'html-to-image'

import { backtestRequest } from '../app/state.ts'

/** D-03's 1100-1200px band, Claude's discretion. */
export const EXPORT_WIDTH_PX = 1160
/** D-03's "2x pixel density". */
export const EXPORT_PIXEL_RATIO = 2
/** D-02's visible margin, matching the existing `--space-lg` token value. */
export const EXPORT_FRAME_PX = 24

export class PngExportError extends Error {}

/** T-08-02: excludes any element carrying `data-export-exclude="true"` (currently only
 * `HoverReadout`'s root, F-02) from the rasterized clone -- transient pointer state is not part
 * of the argument being made, unlike a click-committed selection. */
function exportNodeFilter(node: HTMLElement): boolean {
  if (typeof node.getAttribute !== 'function') return true
  return node.getAttribute('data-export-exclude') !== 'true'
}

/** D-02: reads the theme background custom property currently applied to the document, the same
 * property both `:root` and `[data-theme='dark']` declare as a solid hex value in
 * `src/app/styles.css`. Leading/trailing whitespace in a `getPropertyValue` result is a documented
 * possibility this trims defensively rather than passing straight to `html-to-image`, which would
 * otherwise silently rasterize a transparent background if the trimmed value were ever empty. */
function resolveExportBackgroundColor(): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--color-bg')
  const trimmed = raw.trim()
  if (trimmed === '') {
    throw new PngExportError('png-export: --color-bg resolved to an empty value; refusing to capture a transparent background')
  }
  return trimmed
}

/** SHARE-04/D-01/D-02/D-03: captures `region` (always `.screenshot-region`, T-08-02) at the fixed
 * export width and pixel ratio, with the frame applied as padding so the visible margin is part
 * of the exported image rather than cropped by it. The `style` override's `width` is what makes
 * the region lay out AT the export width before rasterization, not merely scale a viewport-sized
 * layout up afterward (D-03's viewport-independence guarantee; verified empirically in plan 08-01
 * Task 3 against 08-RESEARCH.md's Assumption A1). */
export async function exportRegionAsPng(region: HTMLElement): Promise<Blob> {
  const backgroundColor = resolveExportBackgroundColor()
  const blob = await toBlob(region, {
    width: EXPORT_WIDTH_PX,
    pixelRatio: EXPORT_PIXEL_RATIO,
    backgroundColor,
    style: {
      width: `${EXPORT_WIDTH_PX}px`,
      padding: `${EXPORT_FRAME_PX}px`,
      boxSizing: 'border-box',
      backgroundColor,
    },
    filter: exportNodeFilter,
  })
  if (blob === null) {
    throw new PngExportError('png-export: toBlob returned null')
  }
  return blob
}

/** T-08-01: builds the filename from `backtestRequest()` fields that arrive via `decodeParams`,
 * which is already a total function over arbitrary `URLSearchParams` with per-field allow-list
 * validation (`symbol` against the manifest, `entryDate` against `ISO_DATE_PATTERN`, `leverage`
 * as a validated number) -- no raw query value is interpolated here. As a second layer, anything
 * outside `[A-Za-z0-9._-]` is stripped from the assembled name before it reaches the `download`
 * attribute, so a path separator or control character can never reach the OS save dialog. */
export function pngFilename(): string {
  const request = backtestRequest()
  const leverageStr = request.leverage.toFixed(2).replace(/\.00$/, '')
  const raw = `leverage-sim-${request.symbol}-${leverageStr}x-${request.entryDate}.png`
  return raw.replace(/[^A-Za-z0-9._-]/g, '')
}
