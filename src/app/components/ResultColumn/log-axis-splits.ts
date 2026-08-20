/**
 * src/app/components/ResultColumn/log-axis-splits.ts
 *
 * A separate plain `.ts` module rather than another export inside `EquityCurveChart.tsx`: the
 * Node `unit` vitest project cannot parse `.tsx` (no `vite-plugin-solid` on that project and
 * `tsconfig`'s `"jsx": "preserve"` makes rolldown fail with `Parse failure: Unexpected JSX
 * expression` on the component's return statement), so a pure-function module here is what
 * makes `logDecadeSplits` unit-testable in Node at all. Do not move this back into the `.tsx`
 * file.
 *
 * Root cause this file exists to fix: uPlot's built-in `logAxisSplits`
 * (node_modules/uplot/dist/uPlot.esm.js:1495) runs a `do...while` that advances by repeatedly
 * multiplying by the axis increment, and `roundDec` can snap `split + foundIncr` back onto
 * `split` once the log y-scale minimum drops below roughly 1e-22 -- the loop then never
 * advances and the renderer hangs. `logDecadeSplits` below is built from integer decade
 * exponents stepped by an integer `step >= 1`, so every step provably advances regardless of
 * how small `scaleMin` is.
 */

/** Target number of decade splits before the step size grows past 1. Exported so the split
 * count's own length bound is a named, testable constant rather than a magic number repeated in
 * both the generator and its tests. */
export const TARGET_DECADE_SPLIT_COUNT = 8

/**
 * Pure, total decade-split generator for a log-10 y axis. Returns a strictly increasing list of
 * positive tick values spanning from at or below `scaleMin` to at or above `scaleMax`, with at
 * most `TARGET_DECADE_SPLIT_COUNT + 2` elements.
 *
 * A log axis has no meaning for a non-finite or non-positive bound, so those return an empty
 * array rather than looping or emitting NaN -- uPlot tolerates an empty splits list.
 */
export function logDecadeSplits(scaleMin: number, scaleMax: number): number[] {
  if (!Number.isFinite(scaleMin) || !Number.isFinite(scaleMax)) return []
  if (scaleMin <= 0 || scaleMax <= 0) return []

  // Derived from min/max rather than trusting argument order, so a swapped call is still total.
  const smaller = Math.min(scaleMin, scaleMax)
  const larger = Math.max(scaleMin, scaleMax)

  let lo = Math.floor(Math.log10(smaller))
  let hi = Math.ceil(Math.log10(larger))

  // `Math.log10`/`10 ** n` are not exact inverses at the bit level, so `10 ** lo` can land a few
  // ULPs above `smaller` (and `10 ** hi` a few ULPs below `larger`) even though `lo`/`hi` are the
  // mathematically correct decade boundary. A bounded correction (at most a couple of steps, not
  // a user-controlled loop) keeps the "at or below scaleMin" / "at or above scaleMax" guarantee
  // exact rather than off by a rounding error at the exact repro boundary.
  for (let guard = 0; guard < 4 && 10 ** lo > smaller; guard++) lo -= 1
  for (let guard = 0; guard < 4 && 10 ** hi < larger; guard++) hi += 1

  // The property that makes the loop terminate: step is always at least 1, so `e` strictly
  // advances every iteration no matter how wide `hi - lo` is.
  const step = Math.max(1, Math.ceil((hi - lo) / TARGET_DECADE_SPLIT_COUNT))

  const splits: number[] = []
  let lastExponent = lo
  for (let e = lo; e <= hi; e += step) {
    const value = 10 ** e
    if (Number.isFinite(value) && value > 0) splits.push(value)
    lastExponent = e
  }

  // `step` can overshoot past `hi`; if the last pushed exponent stopped short of it, add `hi`
  // itself so the list always spans to at or above `scaleMax`.
  if (lastExponent < hi) {
    const topValue = 10 ** hi
    if (Number.isFinite(topValue) && topValue > 0) splits.push(topValue)
  }

  return splits
}
