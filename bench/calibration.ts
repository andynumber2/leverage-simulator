/**
 * bench/calibration.ts — D-06/D-07: calibration-normalized, minimum-of-N timing.
 *
 * GitHub-hosted runners vary roughly 20-40% in throughput run to run. Without normalization the
 * budget gate either flakes on a slow runner or has to be loosened by that same factor, which
 * would let a genuine regression of the same size through. Every timed metric — including the
 * calibration loop's own repeats — divides by a score derived from a fixed reference workload
 * run in the same process/browser instance immediately before the metric.
 */

/** Minimum of N=5 repeats per D-07. Minimum is the correct statistic for latency: scheduling
 * noise only ever adds time, it never subtracts, so the smallest observed value is the closest
 * available estimate of the workload's true cost on this run. */
export const REPEAT_COUNT = 5

/** Per Pitfall 1 in 01-RESEARCH.md: a repeat that completes in a handful of microseconds risks
 * `performance.now()` timer coarsening (security-hardened browsers commonly coarsen timer
 * resolution) dominating the measurement, and risks the JIT proving the loop dead and eliding
 * it. Every repeat — calibration and metric alike — is sized to span at least this many
 * milliseconds. */
export const MIN_MEASUREMENT_MS = 10

/**
 * Runs `fn` `n` times, timing each run with `performance.now()` deltas, and returns the
 * smallest elapsed time observed. `fn` may be sync or async; each call is awaited in sequence
 * so no two repeats overlap.
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
  return min
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
  return min / NOMINAL_REFERENCE_MS
}

/**
 * Divides a raw measured time by a calibration score, per D-06. This is the only place a
 * measured value is adjusted before comparison against a budget; `formatMeasured` (bench/
 * report.ts) rounds for display only and must never feed back into this calculation.
 */
export function normalize(rawMs: number, score: number): number {
  return rawMs / score
}
