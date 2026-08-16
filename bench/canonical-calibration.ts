/**
 * bench/canonical-calibration.ts: the run's single canonical calibration score, resolved from
 * the browser context and shared across bench/kernel.bench.test.ts, bench/sweep.bench.test.ts
 * and bench/canvas-repaint.bench.test.ts.
 *
 * The score is sampled here, in the browser context, and not in bench/global-setup.ts, because
 * the reference loop must run in the same engine and process as the measurements it denominates
 * (see bench/calibration.ts's header comment). global-setup.ts runs in the Node host process,
 * not inside the browser instance being measured, so it cannot produce a score that reflects the
 * browser's own throughput.
 *
 * `resolveRunCalibration` reads the stored value first and only samples (and claims) when
 * nothing has been claimed yet, rather than unconditionally sampling and claiming every time it
 * is called. The reference loop costs roughly REPEAT_COUNT times the nominal reference time per
 * call (bench/calibration.ts), so re-sampling in every bench file would spend that cost against
 * BENCH_TOTAL_RUNTIME_CAP_MS for a value that is then discarded once the claim loses the race.
 *
 * The claim is still authoritative: `resolveRunCalibration` always returns whatever
 * `commands.claimCalibration` resolved to, not the locally sampled value, so a race between two
 * bench files converges on one value rather than merely being unlikely to diverge. This is
 * deliberate (a lost race must be correct, not just improbable): the local sample is discarded
 * in favor of the command's resolved value whenever another caller's claim already won.
 *
 * Deliberately imports only `commands` from `vitest/browser` and `calibrationScore` from
 * `./calibration.ts`. It must never import `./accumulator-store.ts`, directly or transitively:
 * that module pulls in `node:fs` and `node:os`, which break the browser bundle (see its own
 * header comment and bench/report.ts's header comment).
 */

import { commands } from 'vitest/browser'

import { calibrationScore } from './calibration.ts'

/**
 * Resolves this run's canonical calibration score: the stored value when one has already been
 * claimed, or a freshly sampled value submitted as a claim otherwise. Always returns the claim
 * command's resolved value, never the locally sampled one, so a losing racer still converges on
 * the run's single winning score.
 */
export async function resolveRunCalibration(): Promise<number> {
  const existing = await commands.readCalibration()
  if (existing !== null) {
    return existing
  }
  const sample = calibrationScore()
  return commands.claimCalibration(sample)
}
