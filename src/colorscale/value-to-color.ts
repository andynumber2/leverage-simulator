/**
 * src/colorscale/value-to-color.ts
 *
 * D-27a: the graduated colour function -- a symmetric-log diverging scale, interpolated in
 * Oklab, plus the two categorical branches (D-18 ruin, D-20 incomplete-hold). Zero imports, so
 * both a plain HTML mockup (`.planning/phases/06-heatmap-design-pass/mockups/`) and Phase 7's
 * Solid renderer can consume it without dragging in a framework. This is the real version of
 * `bench/canvas-grid.ts`'s `mapValueToRgba` (D-27): read that file, do not extend it in place --
 * this module does not carry over its green-channel-fixed-at-64 paint-equivalence trick, which
 * is local to that bench file's own arm-comparison plumbing.
 *
 * D-13: diverging, centred exactly at 1.0x (`log10(1.0) = 0`, the domain's own midpoint).
 * D-14: symmetric log about 1.0x -- `log10(multiple)`, so a 10x gain and a 0.1x loss sit
 * equidistant from the neutral colour in ramp position `t`.
 * D-15: one background-neutral, mid-luminance midpoint shared by both themes, never a pure
 * white/black centre.
 * D-16: the colour domain is a fixed constant (`[-2, +2]` in log10, i.e. multiples in
 * `[0.01x, 100x]`), never fitted to a sweep's own range; values outside it clamp to the endpoint
 * colour.
 * D-18/D-20: `ruined` wins over `incomplete` when both are set (checked in that order below);
 * neither categorical branch is ever blended with the continuous ramp.
 *
 * Oklab conversion coefficients are Björn Ottosson's published sRGB<->Oklab matrices
 * (https://bottosson.github.io/posts/oklab/, "Oklab" 2020), transcribed once here (T-06-04):
 * `tests/value-to-color.test.ts` asserts a round-trip (`oklabToSrgb(srgbToOklab(c))` returns `c`)
 * so a mis-transcribed coefficient fails the build rather than silently shifting the palette.
 */

/** Four integer RGBA channel values, each in the inclusive range 0 to 255. */
export type Rgba = readonly [r: number, g: number, b: number, a: number]

export interface ColorScaleInput {
  /** The metric value this cell represents (e.g. multiple-of-contributed). Ignored when `ruined`
   * or `incomplete` is true. */
  value: number
  /** D-18: a ruined position renders as the destructive base colour regardless of `value`. */
  ruined: boolean
  /** D-20: an incomplete hold renders as the muted grey regardless of `value`. Checked after
   * `ruined`, so a cell flagged both ways renders as ruin (D-18 wins, asserted explicitly by
   * `tests/value-to-color.test.ts`). */
  incomplete: boolean
}

/** D-16: the fixed colour domain, in log10 of the multiple. `10 ** DOMAIN_LOG_MIN` is 0.01x,
 * `10 ** DOMAIN_LOG_MAX` is 100x. A committed constant, never derived from any sweep's own
 * min/max -- see this module's header comment. */
export const DOMAIN_LOG_MIN = -2
export const DOMAIN_LOG_MAX = 2

interface RampStop {
  /** Position along the ramp, 0 to 1 inclusive. `t=0.5` is the diverging centre (D-13). */
  readonly t: number
  readonly hex: string
}

/** D-13: blue-orange family, never red-green (PITFALLS E3). D-15: the midpoint (`t=0.50`) is a
 * low-chroma WARM neutral at roughly L* 66, not a pure grey, chosen to read on both the light
 * (`#F5F6F7`) and dark (`#14161A`) surfaces without a theme-swapped variant. The quarter stops
 * (`t=0.25`/`t=0.75`) were re-picked from the plan's original washed-out pastel starting values
 * (`#6BAED6`/`#FDAE6B`) to the saturated `#3182BD`/`#E6550D`: those pastels sit at nearly the same
 * Oklab lightness as the midpoint itself (L 0.72 and 0.75 against the midpoint's 0.72), so the two
 * inner quarter-segments carried almost no perceptual distance while the two outer segments
 * carried most of it -- a 33-sample perceptual-step ratio of ~3.45, failing VIZ-07's 2.5 ceiling
 * (`tests/value-to-color.test.ts`). The saturated replacements sit at Oklab L ~0.585/~0.636,
 * roughly midway between each endpoint and the neutral centre, evening the lightness profile
 * across all four segments (measured ratio ~1.33) without changing the hue family or which end is
 * blue/orange. */
export const RAMP_STOPS: readonly RampStop[] = [
  { t: 0.0, hex: '#08519C' },
  { t: 0.25, hex: '#3182BD' },
  { t: 0.5, hex: '#A9A29A' },
  { t: 0.75, hex: '#E6550D' },
  { t: 1.0, hex: '#A63603' },
]

/** D-18: the light-theme destructive colour (`04-UI-SPEC.md` §Color), reused for the ruin hatch
 * fill -- the hatch texture, not the hue, is what makes ruin categorical (D-18), so one hue
 * serves both themes. */
export const RUIN_BASE_RGBA: Rgba = [0xc4, 0x34, 0x1f, 255]

/** D-20: a cooler, roughly 20 L* darker grey than the ramp midpoint, so an unfinished hold reads
 * as distinct from a break-even outcome rather than as "the same colour, faded." */
export const INCOMPLETE_RGBA: Rgba = [0x6e, 0x73, 0x78, 255]

/** D-24: legend ramp tick positions, in symlog-mapped multiple space -- `rampPositionFor` places
 * each at its true (non-uniform) position rather than evenly spacing the ticks. */
export const LEGEND_TICK_MULTIPLES: readonly number[] = [0.1, 0.5, 1, 2, 10]

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function srgbChannelToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function linearChannelToSrgb(c: number): number {
  const clamped = clamp(c, 0, 1)
  return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
}

function hexToRgba(hex: string): Rgba {
  const value = hex.startsWith('#') ? hex.slice(1) : hex
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return [r, g, b, 255]
}

/** One point in Oklab space: `L` lightness, `a`/`b` the two opponent chroma axes. */
export interface OklabColor {
  L: number
  a: number
  b: number
}

/**
 * Converts an 8-bit-per-channel sRGB colour (0-255 each, alpha ignored) to Oklab. Coefficients
 * per this module's header comment.
 */
export function srgbToOklab(rgb: Rgba): OklabColor {
  const rLin = srgbChannelToLinear(rgb[0] / 255)
  const gLin = srgbChannelToLinear(rgb[1] / 255)
  const bLin = srgbChannelToLinear(rgb[2] / 255)

  const l = 0.4122214708 * rLin + 0.5363325363 * gLin + 0.0514459929 * bLin
  const m = 0.2119034982 * rLin + 0.6806995451 * gLin + 0.1073969566 * bLin
  const s = 0.0883024619 * rLin + 0.2817188376 * gLin + 0.6299787005 * bLin

  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  }
}

/**
 * Inverts `srgbToOklab`, converting back to an 8-bit-per-channel sRGB `Rgba` (alpha 255), with
 * per-channel clamping to `[0, 255]` and integer rounding.
 */
export function oklabToSrgb(oklab: OklabColor): Rgba {
  const l_ = oklab.L + 0.3963377774 * oklab.a + 0.2158037573 * oklab.b
  const m_ = oklab.L - 0.1055613458 * oklab.a - 0.0638541728 * oklab.b
  const s_ = oklab.L - 0.0894841775 * oklab.a - 1.291485548 * oklab.b

  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_

  const rLin = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s

  const r = Math.round(clamp(linearChannelToSrgb(rLin), 0, 1) * 255)
  const g = Math.round(clamp(linearChannelToSrgb(gLin), 0, 1) * 255)
  const b = Math.round(clamp(linearChannelToSrgb(bLin), 0, 1) * 255)

  return [r, g, b, 255]
}

const RAMP_STOPS_OKLAB: readonly { t: number; oklab: OklabColor }[] = RAMP_STOPS.map((stop) => ({
  t: stop.t,
  oklab: srgbToOklab(hexToRgba(stop.hex)),
}))

/**
 * Piecewise-linear interpolation of `RAMP_STOPS` in Oklab space, at ramp position `t` (0 to 1
 * inclusive, clamped otherwise). Converts back to sRGB with per-channel clamping and rounding
 * (via `oklabToSrgb`). `interpolateRamp(0.5)` is exactly the midpoint stop's own colour, since
 * `t=0.5` is itself one of `RAMP_STOPS`' declared positions.
 */
export function interpolateRamp(t: number): Rgba {
  const clampedT = clamp(t, 0, 1)

  let lower = RAMP_STOPS_OKLAB[0]!
  let upper = RAMP_STOPS_OKLAB[RAMP_STOPS_OKLAB.length - 1]!
  for (let i = 0; i < RAMP_STOPS_OKLAB.length - 1; i++) {
    const a = RAMP_STOPS_OKLAB[i]!
    const b = RAMP_STOPS_OKLAB[i + 1]!
    if (clampedT >= a.t && clampedT <= b.t) {
      lower = a
      upper = b
      break
    }
  }

  const span = upper.t - lower.t
  const localT = span === 0 ? 0 : (clampedT - lower.t) / span

  const oklab: OklabColor = {
    L: lower.oklab.L + (upper.oklab.L - lower.oklab.L) * localT,
    a: lower.oklab.a + (upper.oklab.a - lower.oklab.a) * localT,
    b: lower.oklab.b + (upper.oklab.b - lower.oklab.b) * localT,
  }

  return oklabToSrgb(oklab)
}

/**
 * Maps a positive `multiple` to its ramp position `t` (0 to 1), the same symlog transform
 * `valueToColor`'s continuous path uses, so the legend can place a tick at its true position
 * without re-deriving the transform. Non-positive input floors to `Number.MIN_VALUE` before the
 * log, matching `valueToColor`'s own floor (never `-Infinity`/`NaN`).
 */
export function rampPositionFor(multiple: number): number {
  const safeValue = multiple > 0 ? multiple : Number.MIN_VALUE
  const logValue = Math.log10(safeValue)
  const clampedLog = clamp(logValue, DOMAIN_LOG_MIN, DOMAIN_LOG_MAX)
  return (clampedLog - DOMAIN_LOG_MIN) / (DOMAIN_LOG_MAX - DOMAIN_LOG_MIN)
}

/**
 * The graduated colour function (D-27a). Branch order: `ruined` first (returns
 * `RUIN_BASE_RGBA`), then `incomplete` (returns `INCOMPLETE_RGBA`), then the continuous symlog
 * path -- `Math.log10` of `value` (floored at `Number.MIN_VALUE` so a zero or negative input
 * never produces `-Infinity`/`NaN`), clamped into `[DOMAIN_LOG_MIN, DOMAIN_LOG_MAX]` (D-16),
 * normalised to `t` in `[0, 1]`, and returned via `interpolateRamp(t)`. Because the domain is
 * symmetric about zero, `log10(1.0) = 0` lands at exactly `t = 0.5`, the ramp's own midpoint stop
 * (D-13, D-14).
 */
export function valueToColor(input: ColorScaleInput): Rgba {
  if (input.ruined) return RUIN_BASE_RGBA
  if (input.incomplete) return INCOMPLETE_RGBA
  return interpolateRamp(rampPositionFor(input.value))
}
