/**
 * tests/app/presets.generated.test.ts
 *
 * 08-03-PLAN.md Task 3, D-18's pinning test: recomputes every preset outcome from the committed
 * bundle via `computePresetOutcomes` (`scripts/compute-presets.ts`) and asserts it against
 * `src/app/presets.generated.ts`'s committed constants, mirroring
 * `tests/validation/extended-tier-bias.test.ts`'s four-test shape. Fails the build when the data
 * moves and the figures were not regenerated -- the whole point of committing them rather than
 * computing them at page-load time (D-18).
 *
 * This test imports only `computePresetOutcomes`, never the module's file-writing half: the
 * writer is guarded behind `import.meta.main` in the script itself, so merely importing the
 * measurement function performs no file I/O.
 */

import { describe, expect, test } from 'vitest'

import { computePresetOutcomes } from '../../scripts/compute-presets.ts'
import { loadBundleFromDisk } from '../../src/data/load-bundle-node.ts'
import { PRESET_OUTCOMES, PRESET_OUTCOMES_BUNDLE_VERSION } from '../../src/app/presets.generated.ts'

describe('D-18: the committed preset outcomes match a live recomputation', () => {
  test('every outcome deeply equals the committed PRESET_OUTCOMES to full float64 precision', async () => {
    const bundle = await loadBundleFromDisk()
    const outcomes = computePresetOutcomes(bundle)
    expect(outcomes).toEqual(PRESET_OUTCOMES)
  })

  test('every metadata field per preset (id, firstDate, lastDate, barCount, ruined, truncatedForRateCoverage) matches', async () => {
    const bundle = await loadBundleFromDisk()
    const outcomes = computePresetOutcomes(bundle)
    expect(outcomes.length).toBe(PRESET_OUTCOMES.length)
    for (let i = 0; i < outcomes.length; i++) {
      const recomputed = outcomes[i]!
      const committed = PRESET_OUTCOMES[i]!
      expect(recomputed.id).toBe(committed.id)
      expect(recomputed.firstDate).toBe(committed.firstDate)
      expect(recomputed.lastDate).toBe(committed.lastDate)
      expect(recomputed.barCount).toBe(committed.barCount)
      expect(recomputed.ruined).toBe(committed.ruined)
      expect(recomputed.truncatedForRateCoverage).toBe(committed.truncatedForRateCoverage)
    }
  })

  test('every committed outcome is within sane bounds, and the bundle version matches the loaded manifest', async () => {
    const bundle = await loadBundleFromDisk()
    for (const outcome of PRESET_OUTCOMES) {
      expect(outcome.finalValue).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(outcome.finalValue)).toBe(true)
      expect(outcome.maxDrawdown).toBeGreaterThanOrEqual(0)
      expect(outcome.maxDrawdown).toBeLessThanOrEqual(1)
      if (outcome.irr !== null) expect(Number.isFinite(outcome.irr)).toBe(true)
      if (outcome.cagr !== null) expect(Number.isFinite(outcome.cagr)).toBe(true)
    }
    expect(PRESET_OUTCOMES_BUNDLE_VERSION).toBe(bundle.manifest.bundleVersion)
  })

  test('recomputing twice from the same committed bundle is deterministic to full float64 precision', async () => {
    const bundle = await loadBundleFromDisk()
    const first = computePresetOutcomes(bundle)
    const second = computePresetOutcomes(bundle)
    expect(second).toEqual(first)
  })
})
