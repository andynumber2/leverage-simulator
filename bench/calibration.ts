/**
 * bench/calibration.ts: D-06/D-07, calibration-normalized, minimum-of-N timing.
 *
 * GitHub-hosted runners vary roughly 20-40% in throughput run to run. Without normalization the
 * budget gate either flakes on a slow runner or has to be loosened by that same factor, which
 * would let a genuine regression of the same size through. Every timed metric, including the
 * calibration loop's own repeats, divides by a score derived from a fixed reference workload
 * run in the same process/browser instance immediately before the metric.
 */

/** Minimum of N=5 repeats per D-07. Minimum is the correct statistic for latency: scheduling
 * noise only ever adds time, it never subtracts, so the smallest observed value is the closest
 * available estimate of the workload's true cost on this run. */
export const REPEAT_COUNT = 5

/** Per Pitfall 1 in 01-RESEARCH.md: a repeat that completes in a handful of microseconds risks
 * `performance.now()` timer coarsening (security-hardened browsers commonly coarsen timer
 * resolution) dominating the measurement, and risks the JIT proving the loop dead and eliding
 * it. Every repeat, calibration and metric alike, is sized to span at least this many
 * milliseconds. */
export const MIN_MEASUREMENT_MS = 10

/**
 * Runs `fn` `n` times, timing each run with `performance.now()` deltas, and returns the
 * smallest elapsed time observed. `fn` may be sync or async; each call is awaited in sequence
 * so no two repeats overlap.
 *
 * Throws when the minimum observed repeat is strictly below `MIN_MEASUREMENT_MS`: a repeat that
 * fast carries no information about the workload's true cost, only about the timer's own
 * resolution (see this file's header comment and Pitfall 1 in 01-RESEARCH.md). The remedy is to
 * batch more calls per timed unit via `measureBatchedMinOfN`, never to trust a sub-floor figure.
 */
export async function measureMinOfN(n: number, fn: () => void | Promise<void>): Promise<number> {
  let min = Number.POSITIVE_INFINITY
  for (let i = 0; i < n; i++) {
    const start = performance.now()
    // eslint-disable-next-line no-await-in-loop
    await fn()
    const elapsed = performance.now() - start
    if (elapsed < min) {
      min = elapsed
    }
  }
  if (min < MIN_MEASUREMENT_MS) {
    throw new Error(
      `measureMinOfN: minimum observed repeat (${min}ms) is below the ${MIN_MEASUREMENT_MS}ms ` +
        'timer-resolution floor: batch more calls per timed unit (measureBatchedMinOfN) rather ' +
        'than trusting this figure',
    )
  }
  return min
}

/**
 * Runs `fn` `batchSize` times inside a single timed unit, `n` times over, and returns the
 * smallest observed batch time divided by `batchSize`: a per-call figure. Implemented on top of
 * `measureMinOfN` so the `MIN_MEASUREMENT_MS` floor is enforced against the batch total exactly
 * once, with no second copy of the check to drift (T-01-17): the floor check fires before the
 * division below ever runs, so it always sees the batch minimum, never the per-call quotient.
 *
 * The returned value is a per-call figure recovered from a batch, not a cold single-call
 * measurement, and reads as a different kind of number for exactly that reason (T-01-14): the
 * caller is responsible for disclosing `batchSize` alongside any number derived from this
 * function, in the run output and in any document that cites it.
 */
export async function measureBatchedMinOfN(
  n: number,
  batchSize: number,
  fn: () => void,
): Promise<number> {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error(
      `measureBatchedMinOfN: batchSize must be a finite positive integer, got ${batchSize}`,
    )
  }
  const batchMinMs = await measureMinOfN(n, () => {
    for (let i = 0; i < batchSize; i++) {
      fn()
    }
  })
  return batchMinMs / batchSize
}

// --- Reference workload --------------------------------------------------------------------
// A fixed-iteration, allocation-free, monomorphic Float64Array arithmetic loop, structurally
// similar to the real simulation kernel's hot path (per F1/F2 in .planning/research/
// PITFALLS.md: preallocated typed arrays, a single consistent numeric representation, no
// boxed/optional values). This keeps the calibration score tracking the same kind of
// throughput the sweep benchmark itself depends on, rather than an unrelated micro-benchmark
// (e.g. string concatenation) whose score could diverge from the sweep's actual bottleneck.

/** Size of the preallocated scratch buffer the reference loop reads and writes in place. */
const REFERENCE_SCRATCH_SIZE = 1024

/** Iteration count tuned so a single repeat spans at least MIN_MEASUREMENT_MS on typical
 * hardware (verified empirically during implementation; see 01-01-SUMMARY.md). */
const REFERENCE_ITERATIONS = 40_000_000

/** The reference loop's measured minimum-of-N time on the machine this constant was tuned
 * against defines calibrationScore's anchor: a machine that matches this baseline scores 1.0.
 * A slower machine (larger measured reference time) scores above 1.0; normalize() divides by
 * that score, pulling its measured metrics back down toward what the baseline machine would
 * have measured. A faster machine scores below 1.0 and normalize() leaves its already-small
 * measurements essentially unchanged (division by <1 slightly inflates them, correctly
 * reflecting that a fast machine's raw numbers understate cost on the baseline). This constant
 * is denominated in the D-17 ubuntu-latest baseline environment; changing it is a costly,
 * budget-invalidating decision, per D-06's reversibility rating. */
const NOMINAL_REFERENCE_MS = 40

const referenceScratch = new Float64Array(REFERENCE_SCRATCH_SIZE)

function runReferenceLoop(): number {
  let acc = 0
  for (let i = 0; i < REFERENCE_ITERATIONS; i++) {
    const idx = i & (REFERENCE_SCRATCH_SIZE - 1)
    const prev = referenceScratch[idx] ?? 0
    const next = prev * 1.0000001 + 0.0000001
    referenceScratch[idx] = next
    acc += next
  }
  // Returned (and used by the caller) so the JIT cannot prove the loop dead and eliminate it,
  // per Pitfall 1's "sum into a value that is returned" guidance.
  return acc
}

/**
 * Runs the reference loop REPEAT_COUNT times, takes the minimum wall-clock time, and scales it
 * against NOMINAL_REFERENCE_MS so a machine matching the baseline scores 1.0.
 */
export function calibrationScore(): number {
  let min = Number.POSITIVE_INFINITY
  let sink = 0
  for (let i = 0; i < REPEAT_COUNT; i++) {
    const start = performance.now()
    sink += runReferenceLoop()
    const elapsed = performance.now() - start
    if (elapsed < min) {
      min = elapsed
    }
  }
  // `sink` is never read past this point other than to keep the loop from being proven dead;
  // NaN/Infinity would indicate the reference loop itself is broken.
  if (!Number.isFinite(sink)) {
    throw new Error('calibrationScore: reference loop produced a non-finite accumulator')
  }
  // Same root cause as the metric floor reached from a different call site (WR-02): this loop
  // times itself directly rather than routing through measureMinOfN, so it needs its own floor
  // check. A non-finite or sub-floor minimum means calibration itself is broken, and a zero or
  // near-zero score would otherwise silently produce Infinity for every downstream figure once
  // normalize() divides by it. The remedy is to raise REFERENCE_ITERATIONS, never to retune
  // NOMINAL_REFERENCE_MS, which is budget-denominating (see the constant's own doc comment).
  if (!Number.isFinite(min) || min < MIN_MEASUREMENT_MS) {
    throw new Error(
      `calibrationScore: minimum observed reference-loop repeat (${min}ms) is non-finite or ` +
        `below the ${MIN_MEASUREMENT_MS}ms timer-resolution floor: raise REFERENCE_ITERATIONS, ` +
        'never retune NOMINAL_REFERENCE_MS, which is budget-denominating',
    )
  }
  return min / NOMINAL_REFERENCE_MS
}

/**
 * Divides a raw measured time by a calibration score, per D-06. This is the only place a
 * measured value is adjusted before comparison against a budget; `formatMeasured` (bench/
 * report.ts) rounds for display only and must never feed back into this calculation.
 *
 * Throws rather than silently producing `Infinity` or `NaN` when `score` is zero, negative or
 * non-finite (WR-02): a broken calibration score must never propagate through every downstream
 * figure as an unreadable number. Also throws when `rawMs` itself is non-finite.
 */
export function normalize(rawMs: number, score: number): number {
  if (!Number.isFinite(score) || score <= 0) {
    throw new Error(
      `normalize: calibration score (${score}) is zero, negative or non-finite: calibration ` +
        'is broken, not the measured value',
    )
  }
  if (!Number.isFinite(rawMs)) {
    throw new Error(`normalize: rawMs (${rawMs}) is non-finite`)
  }
  return rawMs / score
}
