/**
 * src/metrics/format.ts
 *
 * The single formatting contract (04-UI-SPEC.md "Copywriting Contract", METR-01 through METR-04):
 * every rendered metric value routes through here, so no component formats a number inline. Every
 * formatter takes the null case explicitly and never returns a string containing `NaN` or
 * `Infinity` for any float64 input, including 0, negative zero and the float64 extremes.
 */

/** The undefined-value placeholder for a formatter with no metric-specific undefined copy of its
 * own. The headline/secondary metric slots that DO have specific undefined copy (D-08's "IRR
 * undefined for this cash-flow pattern") render that copy directly rather than this string. */
const UNDEFINED_PLACEHOLDER = 'n/a'

/** Above this multiple, `formatMultiple` switches to scientific notation so the rendered string
 * stays bounded regardless of magnitude. */
const SCIENTIFIC_NOTATION_THRESHOLD = 1e6

/** Renders a fraction (e.g. 0.0342) as a percentage to exactly two decimals with a trailing
 * percent sign ("3.42%"). -1 renders "-100.00%", the total-loss boundary value. */
export function formatPercent(fraction: number | null): string {
  if (fraction === null || !Number.isFinite(fraction)) return UNDEFINED_PLACEHOLDER
  const percent = fraction * 100
  if (!Number.isFinite(percent)) return UNDEFINED_PLACEHOLDER
  return `${percent.toFixed(2)}%`
}

/** Renders a ratio (e.g. 1.5) as a multiple to exactly two decimals with a trailing lowercase x
 * ("1.50x"), switching to two-significant-digit scientific notation above 1e6 so no metric string
 * exceeds a bounded width regardless of the underlying number. */
export function formatMultiple(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return UNDEFINED_PLACEHOLDER
  if (Math.abs(ratio) > SCIENTIFIC_NOTATION_THRESHOLD) {
    return `${ratio.toExponential(1)}x`
  }
  return `${ratio.toFixed(2)}x`
}

/** Renders a grouped whole-dollar figure with no fractional cents ("$10,000"). */
export function formatCurrency(amount: number | null): string {
  if (amount === null || !Number.isFinite(amount)) return UNDEFINED_PLACEHOLDER
  const rounded = Math.round(amount)
  if (!Number.isFinite(rounded)) return UNDEFINED_PLACEHOLDER
  return `$${rounded.toLocaleString('en-US')}`
}
