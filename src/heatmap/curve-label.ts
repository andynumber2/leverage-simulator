/**
 * src/heatmap/curve-label.ts
 *
 * 07-09-PLAN.md Task 4 (D-33): labels ONLY the field's own emphasized contour boundary --
 * breakeven (`1.00x`) for the `multiple` metric, `0%/yr` for `annualized` -- inline, ON the curve
 * itself, matching the 2px `var(--color-text)` emphasis `paint-contour.ts` already draws for that
 * one boundary. A cropped screenshot is the entire reason this exists: without an inline label the
 * drawn boundary still shows exactly WHERE the outcome crosses a threshold, but loses WHICH
 * threshold, and the legend (a separate DOM element, easily cropped out of a screenshot) is the
 * only other place that number lives.
 *
 * `drawdown` has no emphasized boundary (`emphasizedBandLevelFor('drawdown')` returns `null` --
 * `07-UI-SPEC.md`'s own no-emphasized-tick rule for a sequential scale with no threshold), so this
 * module never invents one: `paint-contour.ts` only calls in here when `emphasizedBandLevelFor`
 * returned non-null for the active metric.
 *
 * **Finding B stays only PARTIALLY closed.** `06-HEATMAP-SPEC.md` Finding B's full complaint was
 * that `BAND_LEVELS`' round-number boundaries are unlabelled entirely. D-33 labels exactly the ONE
 * emphasized boundary per metric, inline, in full contour-map convention -- that is the fullest
 * realisation of why `BAND_MULTIPLES`' round numbers were chosen in the first place (Finding B),
 * but the other nine `BAND_MULTIPLES` boundaries (`multiple`'s 0.05x/0.1x/0.25x/.../50x) stay
 * unlabelled on the field itself, reachable only through the separate legend. Labelling all ten in
 * full contour-map convention (placement along each curve, collision avoidance against every other
 * label, not just this one against the short-horizon rule) is deferred to a future plan.
 *
 * Segments in, segments out: `labelAnchorFor`/`labelAnchorAvoiding` take already DISPLAY-pixel
 * segments (`paint-contour.ts` converts from `iso-lines.ts`'s grid-space `IsoSegment`s via its own
 * `gridColToDisplayX`/`gridRowToDisplayY` before calling in here), so this module has zero
 * dependency on `iso-lines.ts`'s own type and no grid-space arithmetic of its own -- matching this
 * directory's sibling modules' DOM-facing-export discipline (`short-horizon.ts`'s
 * `paintShortHorizonRule` is the closest precedent: pure geometry selection functions plus one
 * Canvas-drawing export, no Solid, no framework import).
 */

/** One iso-line segment already converted to DISPLAY pixel coordinates (never grid space) -- the
 * caller (`paint-contour.ts`) owns the grid-to-display conversion, exactly the same conversion it
 * already applies before stroking every other contour boundary. */
export interface DisplaySegment {
  x1: number
  y1: number
  x2: number
  y2: number
}

/** The field's own paint-area dimensions in DISPLAY pixels, matching `short-horizon.ts`'s
 * identically-shaped `ShortHorizonFieldRect`. */
export interface CurveLabelFieldRect {
  widthPx: number
  heightPx: number
}

export interface CurveLabelAnchor {
  /** The label's own centre point, in DISPLAY pixels. */
  xPx: number
  yPx: number
  /** The chosen segment's own local angle (`Math.atan2` of its own dy/dx), so the label rotates
   * to read along the curve's local direction rather than sitting horizontally across it. */
  angleRad: number
  /** Index into the `segments` array the anchor was chosen from -- `labelAnchorAvoiding`'s own
   * fallback loop uses this to remove the just-rejected candidate and retry, and
   * `paint-contour.ts` uses it (plus every OTHER segment whose own bounding box the final label's
   * bounding box also covers) to decide which segments to skip stroking under the label. */
  segmentIndex: number
}

/** 12px/400, the same "Label / inline annotation" typographic role `short-horizon.ts`'s own
 * `LABEL_FONT` uses for its boundary label -- this label and that one are the same visual species
 * (an inline boundary annotation drawn directly on the field), so they share the same type
 * treatment rather than each picking its own. */
export const CURVE_LABEL_FONT_SIZE_PX = 12
export const CURVE_LABEL_FONT = `${CURVE_LABEL_FONT_SIZE_PX}px system-ui, -apple-system, "Segoe UI", sans-serif`

/** Nominal line-height used only to size this label's own bounding box for the curve-interruption
 * (skip-stroke-under-the-label) and short-horizon-rule-collision checks -- not itself drawn. */
export const CURVE_LABEL_FONT_HEIGHT_PX = CURVE_LABEL_FONT_SIZE_PX

/**
 * Picks the anchor point and rotation for an inline curve label from `segments` (already
 * DISPLAY-pixel, per this module's header). Scores every segment by a combination of its own local
 * slope (shallower reads better, so the label sits along a readable near-horizontal stretch of the
 * curve rather than a near-vertical one) and its horizontal distance from the field's own centre
 * (closer reads better, tending to place the label where a reader's eye already is rather than at
 * a field edge), and returns the lowest-scoring segment's own midpoint and angle. Returns `null`
 * only when `segments` is empty -- the emphasized boundary was not crossed anywhere in the field
 * (e.g. every cell renders exactly `0.00x` and the caller already skipped calling in here, since
 * `marchingSquaresSegments` itself returns no segments for a level nothing crosses).
 */
export function labelAnchorFor(segments: readonly DisplaySegment[], fieldRect: CurveLabelFieldRect): CurveLabelAnchor | null {
  if (segments.length === 0) return null

  const centerX = fieldRect.widthPx / 2
  let bestIndex = 0
  let bestScore = Number.POSITIVE_INFINITY

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!
    const dx = segment.x2 - segment.x1
    const dy = segment.y2 - segment.y1
    const midX = (segment.x1 + segment.x2) / 2
    const absSlope = dx === 0 ? Number.POSITIVE_INFINITY : Math.abs(dy / dx)
    const normalizedDistFromCenter = fieldRect.widthPx === 0 ? 0 : Math.abs(midX - centerX) / fieldRect.widthPx
    const score = absSlope + normalizedDistFromCenter
    if (score < bestScore) {
      bestScore = score
      bestIndex = i
    }
  }

  const chosen = segments[bestIndex]!
  return {
    xPx: (chosen.x1 + chosen.x2) / 2,
    yPx: (chosen.y1 + chosen.y2) / 2,
    angleRad: Math.atan2(chosen.y2 - chosen.y1, chosen.x2 - chosen.x1),
    segmentIndex: bestIndex,
  }
}

/**
 * `labelAnchorFor`, with one added constraint: the returned anchor's `xPx` must be at least
 * `minDistancePx` away from `avoidXPx` (Task 1's short-horizon rule column, in display pixels, or
 * `null` when no rule is present in this render at all -- fixed-period mode, or an open-ended
 * sweep where no column crosses the threshold). `07-09-PLAN.md` Task 4's own resolution for the
 * F-04 collision between this label and the rule's own label: "prefer an anchor at least the
 * label's own width away from the rule's column, falling back to the next-shallowest segment."
 * Implements exactly that by repeatedly calling `labelAnchorFor` over a shrinking candidate pool,
 * removing the just-rejected segment each time it collides, until a clear candidate is found or
 * every segment has been tried. Returns `null` when either `segments` is empty or no candidate
 * clears `minDistancePx`.
 */
export function labelAnchorAvoiding(
  segments: readonly DisplaySegment[],
  fieldRect: CurveLabelFieldRect,
  avoidXPx: number | null,
  minDistancePx: number,
): CurveLabelAnchor | null {
  if (avoidXPx === null) return labelAnchorFor(segments, fieldRect)

  let candidates = segments
  let indexMap = candidates.map((_, i) => i)

  for (let attempt = 0; attempt <= segments.length; attempt++) {
    const anchor = labelAnchorFor(candidates, fieldRect)
    if (anchor === null) return null

    if (Math.abs(anchor.xPx - avoidXPx) >= minDistancePx) {
      return { ...anchor, segmentIndex: indexMap[anchor.segmentIndex]! }
    }

    candidates = candidates.filter((_, i) => i !== anchor.segmentIndex)
    indexMap = indexMap.filter((_, i) => i !== anchor.segmentIndex)
  }

  return null
}

function getCssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value === '' ? fallback : value
}

/**
 * Draws `text` centred at `anchor`, rotated to `anchor.angleRad` so it reads along the curve's own
 * local direction. Colour matches `paint-contour.ts`'s existing 2px `var(--color-text)` emphasis
 * stroke exactly (D-33: "matching the emphasis it already carries"), never a second,
 * independently-chosen colour. This function only draws the text -- the caller
 * (`paint-contour.ts`) is responsible for NOT stroking the curve under this label's own bounding
 * box first (its own skip-segment pass, computed from this same `anchor` plus the text's own
 * measured width and `CURVE_LABEL_FONT_HEIGHT_PX`), so the text sits IN the line rather than on
 * top of it.
 */
export function paintCurveLabel(ctx: CanvasRenderingContext2D, anchor: CurveLabelAnchor, text: string): void {
  const textColor = getCssVar('--color-text', '#14161a')
  ctx.save()
  ctx.translate(anchor.xPx, anchor.yPx)
  ctx.rotate(anchor.angleRad)
  ctx.font = CURVE_LABEL_FONT
  ctx.fillStyle = textColor
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 0, 0)
  ctx.restore()
}
