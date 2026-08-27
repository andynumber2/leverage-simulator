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

import { toCanvas } from 'html-to-image'

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

/** Mirrors `exportNodeFilter` above for an arbitrary descendant, walking up to but NOT including
 * `region` itself -- exactly `html-to-image`'s own semantics, which exempt the clone root from the
 * filter (`clone-node.js`: `if (!isRoot && options.filter && !options.filter(node)) return null`)
 * and drop the whole subtree under any node the filter rejects. The compositing step below MUST
 * apply this same predicate: a canvas that `html-to-image` filtered out of the clone must not be
 * painted back in by us, or the fix would WIDEN the exported scope past `.screenshot-region` minus
 * F-02, which T-08-02 forbids. */
function isExcludedFromExport(node: Element, region: HTMLElement): boolean {
  let current: Element | null = node
  while (current !== null && current !== region) {
    if (current.getAttribute('data-export-exclude') === 'true') return true
    current = current.parentElement
  }
  return false
}

/** A 1x1 fully transparent PNG, substituted for each live canvas's real `toDataURL()` output
 * during a capture. Transparent at whatever size the clone stretches it to, so it contributes
 * nothing to the rasterized DOM layer and the composited canvas pixels show through unobstructed.
 *
 * Produced by the browser's own PNG encoder from a fresh 1x1 canvas (initialized to transparent
 * black by specification) rather than written here as a base64 literal. A hardcoded literal was
 * tried first and was not transparent: it rasterized as a solid blue wash over every chart, and
 * only on the SECOND capture, because the first capture hit the very decode race this fix exists
 * to eliminate and therefore drew nothing. That is a uniquely bad failure mode to reintroduce by
 * hand, and there is no reason to hand-write bytes the platform will generate correctly.
 *
 * Computed once, lazily, on first use. The shadowing installed by
 * `suppressLibraryCanvasRasterization` only ever applies to canvases INSIDE the region, so this
 * scratch canvas's own `toDataURL` is always the real one.
 *
 * Deliberately NOT `'data:,'`, which would have been the more obvious choice: `cloneCanvasElement`
 * special-cases that exact value and returns `canvas.cloneNode(false)` synchronously
 * (`node_modules/html-to-image/lib/clone-node.js`), which is correct but measurably worse for
 * PERF-07a. The `<img>` path awaits `createImage` (onload, then `decode()`, then a
 * `requestAnimationFrame`) once per canvas, and that await is the only thing anywhere in the
 * library's clone that ends a main-thread task. Taking it away fused the work into a single 52ms
 * task, over PERF-07a's 50ms long-task threshold. Keeping the `<img>` path with a 1x1 payload
 * keeps the boundary AND drops the full-size PNG encode `toDataURL()` would otherwise run per
 * canvas.
 *
 * CORRECTION, from the PERF-07a investigation that followed (see `exportStyleProperties` below,
 * and `.planning/debug/resolved/png-export-long-task-budget.md`): an earlier revision of this
 * comment read the follow-up "0.00ms with zero long tasks" as proof that the `<img>` path split
 * the work into "several short tasks". It does not. In single-run mode this region holds exactly
 * one canvas, so it produces exactly ONE boundary, about 11ms into the clone, and everything
 * after it still runs in a single task. That 0.00ms was `PerformanceObserver`'s 50ms longtask
 * floor reporting silence on a 9-core dev machine, not headroom; the same path measured 120ms on
 * the 4-core CI baseline. The boundary is real and worth keeping, there is just only one of it. */
let transparentPixelDataUrl: string | undefined

function resolveTransparentPixelDataUrl(): string {
  if (transparentPixelDataUrl === undefined) {
    const scratch = document.createElement('canvas')
    scratch.width = 1
    scratch.height = 1
    transparentPixelDataUrl = scratch.toDataURL()
  }
  return transparentPixelDataUrl
}

/** Half of the fix, and the half that makes the export DETERMINISTIC rather than merely non-blank.
 *
 * `compositeLiveCanvases` below draws the real canvas pixels onto the capture. If `html-to-image`
 * ALSO embeds its own copy, the two are composited on top of each other, and since a chart canvas
 * is transparent except where it draws, the result is the union of two independently resampled
 * copies of the same curve. Measured in WebKit with the composite in place but this suppression
 * absent: first capture 8.1058% non-background inside the equity canvas box (the composite alone,
 * because the nested image was still blank), second capture 8.7993% (the union), 116,634 pixels
 * different between two captures of an unchanged region. Correct-looking both times, and still not
 * the same image twice.
 *
 * So the library is taken out of the canvas business entirely: each live canvas's `toDataURL` is
 * shadowed with an own property returning a 1x1 transparent PNG instead of the canvas's real pixels.
 * The clone still gets an element at the exact same box, stretched to the canvas's computed size --
 * so layout is untouched, which `filter` could not have promised (excluding a node drops its
 * children and collapses its box, and the two 16x16 legend swatch canvases are inline-level, so
 * their labels would shift) -- but it carries no chart pixels, so there is nothing left for the
 * nested-subresource race to lose. Even if that 1x1 payload fails to decode in time, transparent is
 * exactly what this wants.
 *
 * Returns the restore function; the caller runs it in a `finally`, the same discipline
 * `exportRegionAsPng` already applies to the region's inline style. */
function suppressLibraryCanvasRasterization(region: HTMLElement): () => void {
  const placeholder = resolveTransparentPixelDataUrl()
  const restores: (() => void)[] = []
  for (const live of region.querySelectorAll('canvas')) {
    const ownDescriptor = Object.getOwnPropertyDescriptor(live, 'toDataURL')
    Object.defineProperty(live, 'toDataURL', {
      configurable: true,
      writable: true,
      value: () => placeholder,
    })
    restores.push(() => {
      if (ownDescriptor === undefined) {
        // The normal case: `toDataURL` lives on the prototype, so deleting the shadowing own
        // property restores the real method rather than leaving a copy of it behind.
        delete (live as Partial<HTMLCanvasElement>).toDataURL
        return
      }
      Object.defineProperty(live, 'toDataURL', ownDescriptor)
    })
  }
  return () => {
    for (const restore of restores) restore()
  }
}

/** THE Safari fix. Root cause (established by direct measurement in Playwright WebKit 2336, see
 * `.planning/debug/resolved/png-export-blank-canvas-safari.md`): `html-to-image` does not put
 * canvas PIXELS into its output. It replaces every live `<canvas>` with an
 * `<img src="data:image/png;...">` (`clone-node.js`, `cloneCanvasElement`), serializes the whole
 * clone into one `data:image/svg+xml` URL (`util.js`, `svgToDataURL`), and loads THAT into a single
 * `Image` before drawing it (`index.js`, `toCanvas`). The nested `<img>`s are therefore subresources
 * of a different document, and WebKit resolves the outer image's `load` and `decode()` before those
 * subresources have decoded -- so they rasterize as nothing. Every canvas in the region comes out
 * blank on the first capture; the second capture happens to work, which is what made this look like
 * a caching problem.
 *
 * It is not a caching problem, and both of the cache-shaped fixes were tested and disproven against
 * real WebKit before this one was written: pre-decoding the byte-identical `toDataURL()` string in
 * the parent document does nothing (WebKit does not satisfy the SVG document's subresource load
 * from it), and substituting an already-decoded `<img>` for the canvas does nothing either (its
 * `src` is still a `data:` URL the SVG document must re-fetch).
 *
 * So this stops sending canvas pixels across that boundary at all: each live canvas's own backing
 * store is drawn straight onto the export image at that canvas's measured box. `drawImage`'s
 * destination-rectangle form handles a backing store that differs from the CSS box (a HiDPI chart)
 * by construction. Nothing here depends on decode timing, so it is browser independent rather than
 * a WebKit special case.
 *
 * Z-ORDER, which is why this is a layered composite rather than a simple overdraw. Elements that
 * paint ABOVE a canvas must stay above it, and this region has real ones: the heatmap's zoom-aware
 * axis tick labels are `pointer-events: none` spans placed after both canvases inside
 * `.heatmap-field-stack`, deliberately overlaying the field (`HeatmapPanel.tsx`). Drawing the
 * canvases over the top erased them, which a Chromium before/after pixel diff caught, and every
 * "is the canvas blank" assertion still passed while it was broken. So the canvases are painted
 * UNDERNEATH what `html-to-image` produced, via `destination-over` on its own canvas: the DOM layer
 * is rendered with no background of its own, so it is transparent wherever nothing painted, and the
 * tick labels stay exactly where the browser put them.
 *
 * The one property that makes the layering sound is that nothing paints BEHIND a canvas: measured
 * across both result modes, no ancestor of any canvas in this region has a background-color or
 * background-image. `tests/app/export-png-canvas-fidelity.browser.test.ts` pins that as a standing
 * invariant, since
 * a future card background introduced behind a chart would otherwise be drawn over it here. */
function compositeLiveCanvases(region: HTMLElement, context: CanvasRenderingContext2D, scaleX: number, scaleY: number): void {
  const regionRect = region.getBoundingClientRect()
  if (regionRect.width === 0 || regionRect.height === 0) return

  // REVERSE document order, and load-bearing. The caller has the context in `destination-over`,
  // so each successive draw lands FURTHER BACK. Painting front-to-back therefore means iterating
  // back-to-front: the heatmap's crosshair overlay must be drawn before the field canvas it sits
  // on top of, or it ends up behind it and disappears.
  const canvases = [...region.querySelectorAll('canvas')].reverse()

  for (const live of canvases) {
    if (live.width === 0 || live.height === 0) continue
    if (isExcludedFromExport(live, region)) continue
    const style = getComputedStyle(live)
    if (style.visibility === 'hidden' || style.display === 'none') continue
    const rect = live.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) continue
    context.drawImage(
      live,
      (rect.left - regionRect.left) * scaleX,
      (rect.top - regionRect.top) * scaleY,
      rect.width * scaleX,
      rect.height * scaleY,
    )
  }
}

/** The set of CSS property names `html-to-image` is told to copy from each live element onto its
 * clone, in place of the library's default of EVERY computed property. THE PERF-07a FIX; see
 * `.planning/debug/resolved/png-export-long-task-budget.md` for the full measurement.
 *
 * Why the default is expensive. `cloneCSSStyle` prefers `getComputedStyle(el).cssText` and only
 * falls back to copying one property at a time. That preference never fires in practice: a
 * computed-style declaration serializes to the EMPTY STRING per CSSOM, in Chromium and WebKit
 * both, so the per-property branch always runs, over `getStyleProperties`'s default list of every
 * property `document.documentElement` reports -- 495 of them in Chromium. Across this region's 84
 * elements that is ~42,000 `getPropertyValue`/`setProperty` pairs and 674,612 characters of inline
 * style, which then has to be XML-serialized, percent-encoded to a 928 KB `data:` URL, and parsed
 * back by the browser. Measured on the production build: 25.7ms clone, 7.3ms serialize, 1.6ms
 * encode, ~13ms `data:` URL parse, all inside ONE main-thread task, on a machine roughly twice as
 * fast as the CI baseline where PERF-07a is measured.
 *
 * Why it is one task rather than several, which is what turns it into a long task rather than a
 * sequence of short ones. `cloneChildren` walks the subtree with
 * `children.reduce((deferred, child) => deferred.then(...))` -- a promise chain, and promise
 * continuations are microtasks, which do not yield to the event loop. The only real task
 * boundaries anywhere in the clone are `createImage`'s `onload` -> `decode()` ->
 * `requestAnimationFrame`, reached once per canvas. `.screenshot-region` in single-run mode holds
 * exactly ONE canvas, so there is exactly one boundary, it lands about 11ms in, and every
 * remaining phase runs as microtask continuations inside the animation-frame callback that
 * resolved it. Sweep mode has seven canvases, therefore seven boundaries, and its worst block
 * measures a fifth of single-run mode's while rendering more -- same code, same library, more
 * boundaries. This is also the correction to `resolveTransparentPixelDataUrl`'s claim above that
 * the `<img>` path "keeps those task boundaries": it keeps ONE, which was enough to stay under a
 * 50ms floor on a 9-core dev machine and is not enough on 4-core CI.
 *
 * Why narrowing the list is sound rather than a fidelity gamble. The clone is serialized into a
 * `<foreignObject>` inside a standalone SVG document that carries none of this page's
 * stylesheets, which is why the library inlines computed values at all. But that document does
 * carry the browser's own UA stylesheet, and it applies the same initial values this page starts
 * from. So a property that no stylesheet rule and no inline `style` attribute anywhere in the
 * document declares cannot have been moved off the value the clone would compute for itself, and
 * copying it is pure payload. Everything that CAN move it is covered: author rules (including
 * ones inserted through CSSOM and ones nested inside `@media`/`@supports`/`@keyframes`, which the
 * walk recurses into), `adoptedStyleSheets`, inline style attributes, and presentational
 * attributes (which `cloneNode` copies verbatim, so they resolve identically in the clone).
 * Custom properties are included even though every standard property is copied with its `var()`
 * already substituted, because the cost of keeping them is small and the argument for dropping
 * them is one more thing to be wrong about.
 *
 * Verified, not assumed: the exported PNG's SHA-256 is byte-identical with and without this
 * option, across both result modes, both themes, and CPU throttle rates from 1x to 4x, while the
 * longest main-thread block falls from 47/98/153/210ms to 14/30/40/51ms. Nothing is deferred --
 * about 78% of the work stops happening. `tests/app/export-png-style-properties.browser.test.ts`
 * is the standing guard.
 *
 * ONE array instance for the page's lifetime, deliberately. `getStyleProperties` memoizes the
 * first `includeStyleProperties` value it is handed and holds it BY REFERENCE for the rest of the
 * module's life, so handing it a freshly built array per capture would mean every capture after
 * the first silently reused the first one's list. Refreshing this instance in place keeps the
 * library's cached reference current instead -- which matters because a page can be exported in
 * single-run mode and then in sweep mode, whose heatmap tick labels carry inline properties the
 * first capture never saw. */
const exportStyleProperties: string[] = []

/** Adds every property name declared by any rule in `rules`, recursing into grouping rules
 * (`@media`, `@supports`, `@layer`) and keyframe rules. Shorthands need no special handling: a
 * declaration block enumerates its longhands, so `margin: 0` contributes all four
 * `margin-*` names and `font: 12px serif` contributes all nineteen font longhands. */
function collectRuleStyleProperties(rules: CSSRuleList, names: Set<string>): void {
  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index]
    if (rule === undefined) continue
    const declarations = (rule as CSSStyleRule).style
    if (declarations !== undefined) {
      for (let property = 0; property < declarations.length; property += 1) {
        const name = declarations[property]
        if (name !== undefined) names.add(name)
      }
    }
    const nested = (rule as CSSGroupingRule).cssRules
    if (nested !== undefined) collectRuleStyleProperties(nested, names)
  }
}

/** Brings `exportStyleProperties` up to date with everything the document currently declares, and
 * reports whether the result is trustworthy enough to narrow the capture with.
 *
 * Returns false, meaning "capture with the library's full default list", whenever the set cannot
 * be established completely: a stylesheet whose `cssRules` throws (a cross-origin sheet, which
 * this app does not load today but a future one might) would leave the list silently short, and a
 * short list is a wrong exported image. A slow correct export beats a fast wrong one, so an
 * unreadable sheet gives up the optimization rather than the fidelity. */
function refreshExportStyleProperties(): boolean {
  const names = new Set<string>()
  const sheets: CSSStyleSheet[] = [...document.styleSheets, ...document.adoptedStyleSheets]
  for (const sheet of sheets) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      return false
    }
    collectRuleStyleProperties(rules, names)
  }
  for (const element of document.querySelectorAll('[style]')) {
    const declarations = (element as HTMLElement).style
    if (declarations === undefined) continue
    for (let property = 0; property < declarations.length; property += 1) {
      const name = declarations[property]
      if (name !== undefined) names.add(name)
    }
  }
  // An empty set means no stylesheet has been parsed yet, which is not a real answer about what
  // the page declares -- capture with the full list rather than with nothing.
  if (names.size === 0) return false
  for (const name of names) {
    if (!exportStyleProperties.includes(name)) exportStyleProperties.push(name)
  }
  return true
}

/** Test seam for `tests/app/export-png-style-properties.browser.test.ts`. Nothing in the app calls
 * it.
 *
 * Returns the LIVE array rather than a copy, deliberately. That file's central assertion captures
 * the same region twice in one page session, once through the derived list and once with the list
 * widened back to the browser's full computed-property set, and asserts the two PNGs are
 * byte-identical. Since html-to-image caches this array by reference, widening THIS instance is
 * the only way to reach the library's default behavior after the cache is already seeded, which
 * makes the reference capture possible at all. */
export function exportStylePropertiesForTest(): { properties: string[]; complete: boolean } {
  const complete = refreshExportStyleProperties()
  return { properties: exportStyleProperties, complete }
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
 * it to the capture -- not to clone the region by hand first (`cloneNode` drops live `<canvas>` pixel
 * content, which `.screenshot-region` depends on for the chart/heatmap). The live region is
 * restored to its original inline style in a `finally` block regardless of outcome, so a real
 * user's page is never left resized.
 *
 * CR-01 fix: the resize and `suppressLibraryCanvasRasterization` call now live INSIDE the same
 * `try` this function's own `finally` protects (WR-01), so a throw from either one still restores
 * the region's original style. `exportRegionAsPng` below is the only exported entry point and
 * serializes calls to this function, so `originalCssText` here is always the region's true
 * pre-export style, never a previous overlapping call's export layout. */
async function captureRegionAsPng(region: HTMLElement): Promise<Blob> {
  const backgroundColor = resolveExportBackgroundColor()
  const originalCssText = region.style.cssText
  try {
    region.style.width = `${EXPORT_WIDTH_PX}px`
    region.style.padding = `${EXPORT_FRAME_PX}px`
    region.style.boxSizing = 'border-box'
    // D-02's opaque themed background is filled onto the export image directly (below) rather than
    // onto the live region or via html-to-image's own `backgroundColor` option. Both of those would
    // make the DOM layer opaque, and the layered composite needs it transparent wherever nothing
    // painted so the canvases can sit underneath it. The exported result is identical either way.
    region.style.backgroundColor = 'transparent'
    // Forces a synchronous layout pass at the new width before the capture reads it, rather than
    // leaving the resize queued behind whatever async work the capture does first.
    void region.offsetHeight

    const restoreCanvasRasterization = suppressLibraryCanvasRasterization(region)

    try {
      // `toCanvas` rather than `toBlob` so the live canvas bitmaps can be composited into the
      // result before it is encoded. `toBlob` is just `toCanvas` followed by an encode, so this
      // splits an existing step rather than adding one; see compositeLiveCanvases for why the
      // split is needed.
      const captureOptions: NonNullable<Parameters<typeof toCanvas>[1]> = {
        pixelRatio: EXPORT_PIXEL_RATIO,
        filter: exportNodeFilter,
      }
      if (refreshExportStyleProperties()) {
        captureOptions.includeStyleProperties = exportStyleProperties
      }
      const canvas = await toCanvas(region, captureOptions)

      const context = canvas.getContext('2d')
      if (context === null) {
        throw new PngExportError('png-export: could not acquire a 2d context on the export canvas')
      }

      const regionRect = region.getBoundingClientRect()
      // Derived from the capture's real dimensions rather than assumed to be EXPORT_PIXEL_RATIO:
      // html-to-image clamps its own canvas to the browser's maximum dimension for very large
      // regions (`util.js`, `checkCanvasDimensions`), and this keeps the composite aligned if it
      // ever does.
      const scaleX = regionRect.width === 0 ? EXPORT_PIXEL_RATIO : canvas.width / regionRect.width
      const scaleY = regionRect.height === 0 ? EXPORT_PIXEL_RATIO : canvas.height / regionRect.height

      // Everything below is painted UNDER what html-to-image already rasterized, straight into
      // its own canvas. The obvious alternative -- allocate a second full-size canvas, fill it,
      // composite into it, then copy the DOM layer on top -- is what this function did first, and
      // it cost an extra full-size allocation plus a full-canvas drawImage for an identical image.
      // `destination-over` needs neither.
      //
      // For the record, since the measurement is counter-intuitive: that second buffer was NOT
      // what breached PERF-07a during this work. Disabling the composite and the background fill
      // entirely left the PNG path's long task at exactly 52ms, unchanged, and direct phase
      // instrumentation later put both at 0.0-0.1ms against a 49ms block. The cost was inside
      // html-to-image's clone-and-serialize pipeline; see exportStyleProperties above.
      const previousOperation = context.globalCompositeOperation
      context.globalCompositeOperation = 'destination-over'
      try {
        // Must run while the region is STILL in the export layout, since it measures each
        // canvas's box in the same coordinate space `toCanvas` rasterized. The `finally` below
        // restores the region only after this returns.
        compositeLiveCanvases(region, context, scaleX, scaleY)
        // Last, so it lands beneath every canvas as well as beneath the DOM layer. This is D-02's
        // forced-opaque themed background, applied here rather than through html-to-image's own
        // `backgroundColor` option, which would have filled it in FIRST and left nothing for the
        // canvases to slide underneath.
        context.fillStyle = backgroundColor
        context.fillRect(0, 0, canvas.width, canvas.height)
      } finally {
        context.globalCompositeOperation = previousOperation
      }

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/png')
      })
      if (blob === null) {
        throw new PngExportError('png-export: toBlob returned null')
      }
      return blob
    } finally {
      restoreCanvasRasterization()
    }
  } finally {
    // Leaving a real user's page resized is the one failure this function must never have, so
    // this outermost `finally` covers the resize itself, not just the capture that follows it
    // (WR-01: `suppressLibraryCanvasRasterization` throwing used to skip this restore entirely).
    region.style.cssText = originalCssText
  }
}

/** CR-01 fix: overlapping calls to `captureRegionAsPng` (trivially triggered by a double-clicked
 * Export PNG button) shared the live region's inline style and each canvas's shadowed
 * `toDataURL`, with no guard preventing a second call from starting its own resize before the
 * first call's `finally` restored the region -- see 08-REVIEW.md CR-01 for the full trace. This
 * is the module's only exported entry point, and it serializes every call through a promise
 * queue: a call's capture work does not start until every earlier call has finished (success or
 * failure), so `captureRegionAsPng` never sees the region or a canvas mid-mutation by another
 * call. Building the queued promise is synchronous, so a caller that must invoke this function
 * synchronously from a click handler (08-RESEARCH.md Pattern 2 -- Safari's transient-activation
 * requirement for `navigator.clipboard.write`) still gets a promise back synchronously; only the
 * capture's own async work is deferred behind the queue. */
let exportQueue: Promise<void> = Promise.resolve()

export function exportRegionAsPng(region: HTMLElement): Promise<Blob> {
  const run = exportQueue.then(() => captureRegionAsPng(region))
  // Swallow rejection here so one failed export doesn't wedge the queue for the next call; the
  // real rejection still propagates to this call's own caller via `run`.
  exportQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
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
