/**
 * bench/synthetic-data.ts: D-16, deterministic seeded synthetic series, shared unchanged by the
 * JS arm (this file) and the Rust arm plan 01-04 ports it to.
 *
 * Generator (must be reproduced bit-for-bit by the Rust port):
 * - Algorithm: mulberry32, a 32-bit xorshift-family PRNG. State: a single uint32 `state`.
 *   Update per call: `state = (state + 0x6d2b79f5) | 0`, then two xorshift-multiply rounds:
 *   `t = imul(state ^ (state >>> 15), state | 1)`, `t = (t + imul(t ^ (t >>> 7), t | 61)) ^ t`,
 *   output `((t ^ (t >>> 14)) >>> 0) / 4294967296`, a uniform value in [0, 1).
 * - Seed constant: `DEFAULT_SEED = 0x5eed5eed`, used whenever no explicit seed is supplied.
 * - Normal transform: Box-Muller (trigonometric form). Two uniform draws `u1, u2` per normal
 *   deviate: `z = sqrt(-2 * ln(u1)) * cos(2*pi*u2)`. `u1` is clamped away from exactly 0 (to
 *   `1e-12`) so `ln(u1)` never diverges. Only the cosine branch's single deviate is used per
 *   pair of uniform draws: the companion sine-branch deviate is not computed, trading a small
 *   amount of PRNG-stream efficiency for a simpler, more easily ported implementation.
 *
 * Determinism: the same seed always produces byte-identical output arrays, on any machine, on
 * any run: required so PERF-02/PERF-03 figures are comparable across the dev machine, the CI
 * baseline, and (in plan 01-04) the JS-vs-Rust arms.
 */

export const BAR_COUNT = 25_000

/** Default seed used whenever no explicit seed is supplied. Shared by every call site in this
 * phase (bench/kernel.bench.test.ts, bench/sweep-pool.ts, bench/sweep.worker.ts,
 * bench/sweep.bench.test.ts) so "the same sweep" always means the same underlying series. */
export const DEFAULT_SEED = 0x5eed5eed

export interface SyntheticSeries {
  /** Daily returns from geometric Brownian motion, length BAR_COUNT. */
  returns: Float64Array
  /** Synthetic daily short rate, varies over the series rather than sitting at a constant. */
  shortRate: Float64Array
  /** Calendar days elapsed since the prior bar (1 normally, 3 over a typical weekend, a small
   * number of 4-day gaps for holiday weekends). */
  calendarDaysElapsed: Int32Array
}

/** Daily drift, ~7.6%/year compounded at 252 trading days: a plausible positive equity drift. */
const DAILY_DRIFT = 0.0003
/** Daily volatility, within the "plausible equity range, roughly 0.008 to 0.016 daily" the Task
 * 1 behavior spec names. */
const DAILY_VOL = 0.012

/** Short rate oscillates slowly across a handful of cycles over the full series, rather than
 * sitting flat, so financing cost is genuinely rate-sensitive across the backtest. */
const SHORT_RATE_BASE = 0.02
const SHORT_RATE_AMPLITUDE = 0.015
const SHORT_RATE_CYCLES = 3
const SHORT_RATE_NOISE_HALF_WIDTH = 0.00025

/** Roughly one bar in five (every 5th bar, standing in for "Monday") carries a multi-day
 * calendar gap; a small fraction of those (holiday Mondays) carry a 4-day gap instead of 3. */
const GAP_BAR_STRIDE = 5
const HOLIDAY_GAP_PROBABILITY = 0.05

function mulberry32(seed: number): () => number {
  let state = seed
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** One standard normal deviate via the trigonometric Box-Muller transform, consuming two draws
 * from `rng`. See the module header for the exact formula the Rust port must reproduce. */
function nextGaussian(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-12)
  const u2 = rng()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

/**
 * Builds a deterministic BAR_COUNT-length synthetic series from `seed`. Calling this twice with
 * the same seed returns element-wise identical arrays.
 */
export function makeSeededGbmSeries(seed: number = DEFAULT_SEED): SyntheticSeries {
  const rng = mulberry32(seed)
  const returns = new Float64Array(BAR_COUNT)
  const shortRate = new Float64Array(BAR_COUNT)
  const calendarDaysElapsed = new Int32Array(BAR_COUNT)

  for (let i = 0; i < BAR_COUNT; i++) {
    const z = nextGaussian(rng)
    returns[i] = DAILY_DRIFT + DAILY_VOL * z

    const cyclePosition = (i / BAR_COUNT) * 2 * Math.PI * SHORT_RATE_CYCLES
    const rateNoise = (rng() - 0.5) * 2 * SHORT_RATE_NOISE_HALF_WIDTH
    const rate = SHORT_RATE_BASE + SHORT_RATE_AMPLITUDE * Math.sin(cyclePosition) + rateNoise
    shortRate[i] = Math.max(0, rate)

    if (i % GAP_BAR_STRIDE === 0) {
      calendarDaysElapsed[i] = rng() < HOLIDAY_GAP_PROBABILITY ? 4 : 3
    } else {
      calendarDaysElapsed[i] = 1
    }
  }

  return { returns, shortRate, calendarDaysElapsed }
}
