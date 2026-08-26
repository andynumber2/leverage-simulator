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
 * of the exported image rather than cropped by it.
 *
 * D-03/Assumption A1 (08-01 Task 3, closed empirically, not assumed): `html-to-image`'s own
 * `width`/`style` options apply the requested width to its internal CLONE's inline style, but
 * that alone does not reliably force every descendant to re-lay-out at that width -- measured
 * directly against this app's real single-run region: a captured region's total HEIGHT genuinely
 * differed between an 800px-wide and a 1440px-wide live browser viewport, with the style override
 * already in place (08-RESEARCH.md's own flagged risk, `bubkoo/html-to-image#320`). The fix is to
 * put the LIVE region itself into the export layout, force a real layout pass, and only then hand
 * it to `toBlob` -- not to clone the region by hand first (`cloneNode` drops live `<canvas>` pixel
 * content, which `.screenshot-region` depends on for the chart/heatmap). The live region is
 * restored to its original inline style in a `finally` block regardless of outcome, so a real
 * user's page is never left resized. */
export async function exportRegionAsPng(region: HTMLElement): Promise<Blob> {
  const backgroundColor = resolveExportBackgroundColor()
  const originalCssText = region.style.cssText
  region.style.width = `${EXPORT_WIDTH_PX}px`
  region.style.padding = `${EXPORT_FRAME_PX}px`
  region.style.boxSizing = 'border-box'
  region.style.backgroundColor = backgroundColor
  // Forces a synchronous layout pass at the new width before toBlob reads it, rather than
  // leaving the resize queued behind whatever async work toBlob does first.
  void region.offsetHeight

  try {
    const blob = await toBlob(region, {
      pixelRatio: EXPORT_PIXEL_RATIO,
      backgroundColor,
      filter: exportNodeFilter,
    })
    if (blob === null) {
      throw new PngExportError('png-export: toBlob returned null')
    }
    return blob
  } finally {
    region.style.cssText = originalCssText
  }
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
