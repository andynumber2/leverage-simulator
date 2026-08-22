/**
 * src/colorscale/value-to-color.ts
 *
 * D-27a: the graduated colour function -- a symmetric-log diverging scale, interpolated in
 * Oklab, plus the two categorical branches (D-18 ruin, D-20 incomplete-hold). Zero FRAMEWORK
 * imports, so both a plain HTML mockup (`.planning/phases/06-heatmap-design-pass/mockups/`) and
 * Phase 7's Solid renderer can consume it without dragging in a framework -- 07-02-PLAN.md Task 2
 * adds this module's one deliberate exception, `src/metrics/format.ts` (itself zero-imports, not
 * a framework), so every legend tick label routes through the project's single formatting
 * contract rather than a second inline formatter. This is the real version of
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
 * 07-02-PLAN.md Task 1 (Research Pattern 6): `interpolateRamp` is no longer THE ramp -- it is one
 * instantiation of `buildRampInterpolator`, a factory that converts an explicit `RampStop[]`
 * array to Oklab once and returns a closure performing the same piecewise-linear interpolation
 * this module always has. This is a mechanical refactor: every value `interpolateRamp` produced
 * before this change is byte-identical after it (`tests/value-to-color.test.ts`'s equivalence
 * block asserts this explicitly).
 *
 * 07-02-PLAN.md Task 2 (D-25/D-26): `interpolateSequentialRamp` is the second instantiation, a
 * single-hue violet family for max drawdown, which has no meaningful midpoint (PITFALLS E1) and
 * must never render through this module's diverging ramp. `SweepMetric` names the three swept
 * metrics; `scaleTypeForMetric`/`rampPositionForMetric`/`bandLevelsForMetric`/
 * `legendTicksForMetric`/`emphasizedBandLevelFor` are the per-metric routing this module now
 * owns, so `src/heatmap/field-sampler.ts` never chooses a ramp or a domain itself (this plan's
 * own `key_links`).
 *
 * Oklab conversion coefficients are Björn Ottosson's published sRGB<->Oklab matrices
 * (https://bottosson.github.io/posts/oklab/, "Oklab" 2020), transcribed once here (T-06-04):
 * `tests/value-to-color.test.ts` asserts a round-trip (`oklabToSrgb(srgbToOklab(c))` returns `c`)
 * so a mis-transcribed coefficient fails the build rather than silently shifting the palette.
 */

import { formatMultiple, formatPercent, formatSignedPercent } from '../metrics/format.ts'

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

/** D-25/D-26: max drawdown's sequential ramp, single-hue violet -- blue and orange belong to the
 * diverging ramp above, red is reserved for ruin (`RUIN_BASE_RGBA`), and green is excluded
 * project-wide (PITFALLS E3). Linear in the drawdown fraction (`DRAWDOWN_DOMAIN_MIN/MAX`), not
 * log: a percentage drawdown does not span orders of magnitude the way a return multiple does.
 * These are `07-UI-SPEC.md`'s own recommended stops, measured against this project's real
 * thresholds before being committed here (07-02-PLAN.md Task 2): 33-sample Oklab perceptual-step
 * ratio ~1.34 (ceiling 2.5, VIZ-07), minimum adjacent CIE76 delta E across 16 band centres ~3.86
 * under the worst-case simulated deficiency (floor 3.0), minimum categorical delta E from both
 * `INCOMPLETE_RGBA` and `RUIN_BASE_RGBA` ~39.6 (floor 10.0) -- all measured by
 * `tests/value-to-color.test.ts` and `tests/color-scale-cvd.test.ts`, not asserted from memory.
 * No stop moved from the UI-SPEC's recommended values; both thresholds passed on the first
 * measurement. */
export const SEQUENTIAL_RAMP_STOPS: readonly RampStop[] = [
  { t: 0.0, hex: '#EEEBFB' },
  { t: 0.33, hex: '#B7A9EA' },
  { t: 0.67, hex: '#7857C4' },
  { t: 1.0, hex: '#3B1B7E' },
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

/** Fail-loud validation for `buildRampInterpolator`'s `stops` argument (07-02-PLAN.md Task 1):
 * names both the offending value and the expectation, matching this module's existing
 * fail-loud convention (`tests/*.test.ts` T-06-01/T-06-02 style). Requires at least two stops,
 * the first at `t=0`, the last at `t=1`, and every interior `t` strictly ascending -- exactly the
 * shape `RAMP_STOPS` already has. */
function validateRampStops(stops: readonly RampStop[]): void {
  if (stops.length < 2) {
    throw new Error(`buildRampInterpolator: stops must contain at least two entries, got ${stops.length}`)
  }
  const first = stops[0]!
  if (first.t !== 0) {
    throw new Error(`buildRampInterpolator: stops[0].t must be 0, got ${first.t}`)
  }
  const last = stops[stops.length - 1]!
  if (last.t !== 1) {
    throw new Error(`buildRampInterpolator: stops[${stops.length - 1}].t must be 1, got ${last.t}`)
  }
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1]!
    const curr = stops[i]!
    if (curr.t <= prev.t) {
      throw new Error(
        `buildRampInterpolator: stops must have strictly ascending t values, but stops[${i}].t (${curr.t}) is not greater than stops[${i - 1}].t (${prev.t})`,
      )
    }
  }
}

/**
 * 07-02-PLAN.md Task 1 (Research Pattern 6): the factory `interpolateRamp` is now one
 * instantiation of. Converts `stops` to Oklab once, at factory-call time (never per call in the
 * returned closure's hot loop), and returns a function performing piecewise-linear interpolation
 * between the precomputed Oklab stops, converting back to sRGB with per-channel clamping and
 * rounding (`oklabToSrgb`). The returned function clamps its own `t` argument into `[0, 1]`.
 * Throws via `validateRampStops` on a malformed `stops` array, naming the offending value.
 */
export function buildRampInterpolator(stops: readonly RampStop[]): (t: number) => Rgba {
  validateRampStops(stops)

  const stopsOklab: readonly { t: number; oklab: OklabColor }[] = stops.map((stop) => ({
    t: stop.t,
    oklab: srgbToOklab(hexToRgba(stop.hex)),
  }))

  return function interpolate(t: number): Rgba {
    const clampedT = clamp(t, 0, 1)

    let lower = stopsOklab[0]!
    let upper = stopsOklab[stopsOklab.length - 1]!
    for (let i = 0; i < stopsOklab.length - 1; i++) {
      const a = stopsOklab[i]!
      const b = stopsOklab[i + 1]!
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
}

/** The diverging ramp (D-13/D-14), now one instantiation of `buildRampInterpolator` rather than
 * its own bespoke closure -- byte-identical output to every value it produced before this
 * refactor (`tests/value-to-color.test.ts`'s equivalence block asserts this explicitly). */
export const interpolateRamp = buildRampInterpolator(RAMP_STOPS)

/** D-25: max drawdown's sequential ramp, the second instantiation of `buildRampInterpolator`.
 * `interpolateSequentialRamp(0)` is `SEQUENTIAL_RAMP_STOPS`' own `#EEEBFB`;
 * `interpolateSequentialRamp(1)` is `#3B1B7E`. Differs from `interpolateRamp` at every interior
 * `t` (`tests/value-to-color.test.ts` asserts this at `t = 0.25, 0.5, 0.75`), since the two ramps
 * share no stop colours. */
export const interpolateSequentialRamp = buildRampInterpolator(SEQUENTIAL_RAMP_STOPS)

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
 *
 * `value` is always the `multiple` metric here -- this is the field's own single-metric colour
 * function, unchanged by D-25/D-26. `src/heatmap/field-sampler.ts` is the one caller that must
 * choose between metrics, and it does so via `rampPositionForMetric`/`scaleTypeForMetric` below,
 * never by routing a non-multiple value through this function.
 */
export function valueToColor(input: ColorScaleInput): Rgba {
  if (input.ruined) return RUIN_BASE_RGBA
  if (input.incomplete) return INCOMPLETE_RGBA
  return interpolateRamp(rampPositionFor(input.value))
}

/** 07-02-PLAN.md: the three metrics a sweep can render. `field-sampler.ts` imports this as
 * `Metric` (a type alias) so its own exported name never changes, even as this module gains the
 * authority to route every metric's ramp, domain and band boundaries. */
export type SweepMetric = 'multiple' | 'drawdown' | 'annualized'

/** Which ramp family a metric renders through. `multiple` and `annualized` are diverging (both
 * have a real, meaningful threshold at their domain's exact midpoint -- 1.00x and 0%/yr
 * respectively); `drawdown` is sequential (a pure magnitude with no midpoint, PITFALLS E1). */
export type ScaleType = 'diverging' | 'sequential'

export function scaleTypeForMetric(metric: SweepMetric): ScaleType {
  switch (metric) {
    case 'multiple':
    case 'annualized':
      return 'diverging'
    case 'drawdown':
      return 'sequential'
    default: {
      const exhaustive: never = metric
      throw new Error(`value-to-color: unknown metric "${String(exhaustive)}"`)
    }
  }
}

/** D-26: max drawdown's fixed, linear domain -- `0%` to `80%`, clipped beyond, never fitted to a
 * sweep's own range (this plan's `must_haves.prohibitions`). Linear, not log: a percentage
 * drawdown does not span orders of magnitude the way a return multiple does. */
export const DRAWDOWN_DOMAIN_MIN = 0
export const DRAWDOWN_DOMAIN_MAX = 0.8

/** D-26: the annualized-return metric's fixed, linear domain, symmetric about `0` so the
 * `0%/yr` breakeven threshold lands at ramp position `0.5` exactly -- what makes the diverging
 * scale honest for this metric (the same reasoning `DOMAIN_LOG_MIN/MAX`'s symmetry about `1.0x`
 * gives the `multiple` metric). Planner-authored default (07-02-PLAN.md `planner_assumptions`):
 * symmetry about 0 is not negotiable, the magnitude is, and is flagged there for review. */
export const ANNUALIZED_DOMAIN_MIN = -0.3
export const ANNUALIZED_DOMAIN_MAX = 0.3

/**
 * Routes a raw metric value to its ramp position `t` (0 to 1, clamped -- a value beyond a
 * metric's domain clamps to the nearest endpoint, never throws or extrapolates). `multiple` uses
 * the existing symlog transform (`rampPositionFor`); `drawdown` and `annualized` are linear
 * normalisations over their own fixed domains above. `rampPositionForMetric(1.0, 'multiple')`,
 * `rampPositionForMetric(0, 'annualized')` are each exactly `0.5`;
 * `rampPositionForMetric(0, 'drawdown')` is exactly `0`.
 */
export function rampPositionForMetric(value: number, metric: SweepMetric): number {
  switch (metric) {
    case 'multiple':
      return rampPositionFor(value)
    case 'drawdown':
      return clamp((value - DRAWDOWN_DOMAIN_MIN) / (DRAWDOWN_DOMAIN_MAX - DRAWDOWN_DOMAIN_MIN), 0, 1)
    case 'annualized':
      return clamp((value - ANNUALIZED_DOMAIN_MIN) / (ANNUALIZED_DOMAIN_MAX - ANNUALIZED_DOMAIN_MIN), 0, 1)
    default: {
      const exhaustive: never = metric
      throw new Error(`value-to-color: unknown metric "${String(exhaustive)}"`)
    }
  }
}

/** The `multiple` metric's own round-number contour boundaries, duplicated (not imported) from
 * `src/heatmap/field-sampler.ts`'s private `BAND_MULTIPLES` -- this module has zero framework
 * imports by design (see this module's header) and `field-sampler.ts` already imports FROM this
 * module, so importing back would create a cycle. Both arrays must stay in sync by hand; keeping
 * `field-sampler.ts`'s own `BAND_LEVELS` export "unchanged for existing callers" (07-02-PLAN.md
 * Task 3) depends on this array producing byte-identical ramp positions via the same
 * `rampPositionFor`. */
const MULTIPLE_BAND_MULTIPLES: readonly number[] = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50]
const MULTIPLE_BAND_LEVELS: readonly number[] = [0, ...MULTIPLE_BAND_MULTIPLES.map(rampPositionFor), 1]

/** `drawdown`'s round-number contour boundaries: 10-point steps from 10% to 70% (Finding B's rule
 * -- boundaries are chosen in the metric's own units, never spaced evenly in ramp position). */
const DRAWDOWN_BAND_MULTIPLES: readonly number[] = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]

/** `annualized`'s round-number contour boundaries: 10-point steps from -20% to +20%. */
const ANNUALIZED_BAND_MULTIPLES: readonly number[] = [-0.2, -0.1, 0, 0.1, 0.2]

/**
 * Per-metric contour band boundaries, in ramp-position space, always starting at `0` and ending
 * at `1` (the domain's own floor and ceiling), always strictly ascending. Derived from round
 * numbers in the metric's own units and converted via `rampPositionForMetric` -- never spaced
 * evenly in ramp position directly (Finding B: ramp position is an internal colour-lookup
 * coordinate, not a user-facing threshold). `multiple` keeps the existing `BAND_MULTIPLES`-derived
 * levels; `drawdown` and `annualized` are new (07-02-PLAN.md Task 2).
 */
export function bandLevelsForMetric(metric: SweepMetric): readonly number[] {
  switch (metric) {
    case 'multiple':
      return MULTIPLE_BAND_LEVELS
    case 'drawdown':
      return [0, ...DRAWDOWN_BAND_MULTIPLES.map((value) => rampPositionForMetric(value, metric)), 1]
    case 'annualized':
      return [0, ...ANNUALIZED_BAND_MULTIPLES.map((value) => rampPositionForMetric(value, metric)), 1]
    default: {
      const exhaustive: never = metric
      throw new Error(`value-to-color: unknown metric "${String(exhaustive)}"`)
    }
  }
}

/**
 * The one contour boundary drawn emphasised (2px, `var(--color-text)`, matching
 * `paint-contour.ts`'s existing breakeven treatment) for a given metric, or `null` when the
 * metric has no such threshold. `multiple`: `1.00x`. `annualized`: `0%/yr`. `drawdown`: `null` --
 * a sequential scale has no breakeven-equivalent to call out (`07-UI-SPEC.md`'s own
 * no-emphasized-tick rule for the sequential ramp).
 */
export function emphasizedBandLevelFor(metric: SweepMetric): number | null {
  switch (metric) {
    case 'multiple':
      return rampPositionForMetric(1.0, metric)
    case 'annualized':
      return rampPositionForMetric(0, metric)
    case 'drawdown':
      return null
    default: {
      const exhaustive: never = metric
      throw new Error(`value-to-color: unknown metric "${String(exhaustive)}"`)
    }
  }
}

/** One legend tick: the raw value in the metric's own units, the ramp position it sits at
 * (`rampPositionForMetric`), and its formatted label -- always routed through
 * `src/metrics/format.ts`, never a second inline formatter (07-02-PLAN.md Task 2). */
export interface LegendTick {
  value: number
  rampPosition: number
  label: string
}

/** Values interior to `annualized`'s domain, at the same 15-point-step granularity as
 * `DRAWDOWN`'s ticks (`0%`, `20%`, `40%`, `60%` there) scaled to `annualized`'s narrower
 * `[-30%, +30%]` range. */
const ANNUALIZED_INTERIOR_TICK_VALUES: readonly number[] = [-0.15, 0, 0.15]

/** Values interior to `drawdown`'s domain (the clipped end, `80%`, is handled separately below
 * with its own "and above" label). */
const DRAWDOWN_INTERIOR_TICK_VALUES: readonly number[] = [0, 0.2, 0.4, 0.6]

/**
 * The legend's tick values and formatted labels for a given metric. `multiple` reuses the
 * existing `LEGEND_TICK_MULTIPLES`; `drawdown` is `0%`, `20%`, `40%`, `60%` plus the clipped end
 * label `"80% and above"`; `annualized` is `"-30%/yr and below"`, `-15%/yr`, `0%/yr`, `+15%/yr`,
 * `"+30%/yr and above"`. Every numeric portion of every label routes through
 * `src/metrics/format.ts`.
 */
export function legendTicksForMetric(metric: SweepMetric): readonly LegendTick[] {
  switch (metric) {
    case 'multiple':
      return LEGEND_TICK_MULTIPLES.map((value) => ({
        value,
        rampPosition: rampPositionForMetric(value, metric),
        label: formatMultiple(value),
      }))
    case 'drawdown': {
      const interiorTicks: LegendTick[] = DRAWDOWN_INTERIOR_TICK_VALUES.map((value) => ({
        value,
        rampPosition: rampPositionForMetric(value, metric),
        label: formatPercent(value),
      }))
      const clippedTick: LegendTick = {
        value: DRAWDOWN_DOMAIN_MAX,
        rampPosition: rampPositionForMetric(DRAWDOWN_DOMAIN_MAX, metric),
        label: `${formatPercent(DRAWDOWN_DOMAIN_MAX)} and above`,
      }
      return [...interiorTicks, clippedTick]
    }
    case 'annualized': {
      const lowClippedTick: LegendTick = {
        value: ANNUALIZED_DOMAIN_MIN,
        rampPosition: rampPositionForMetric(ANNUALIZED_DOMAIN_MIN, metric),
        label: `${formatSignedPercent(ANNUALIZED_DOMAIN_MIN)}/yr and below`,
      }
      const interiorTicks: LegendTick[] = ANNUALIZED_INTERIOR_TICK_VALUES.map((value) => ({
        value,
        rampPosition: rampPositionForMetric(value, metric),
        label: `${formatSignedPercent(value)}/yr`,
      }))
      const highClippedTick: LegendTick = {
        value: ANNUALIZED_DOMAIN_MAX,
        rampPosition: rampPositionForMetric(ANNUALIZED_DOMAIN_MAX, metric),
        label: `${formatSignedPercent(ANNUALIZED_DOMAIN_MAX)}/yr and above`,
      }
      return [lowClippedTick, ...interiorTicks, highClippedTick]
    }
    default: {
      const exhaustive: never = metric
      throw new Error(`value-to-color: unknown metric "${String(exhaustive)}"`)
    }
  }
}
