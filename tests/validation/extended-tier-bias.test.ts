/**
 * tests/validation/extended-tier-bias.test.ts
 *
 * D-21/T-05-14's pinning test: recomputes CRED-03's measured bias from the committed bundle via
 * `measureExtendedTierBias` (`scripts/measure-extended-tier-bias.ts`) and asserts every field
 * against `src/validation/extended-tier-bias.generated.ts`'s committed constants, mirroring
 * `tests/validation/cost-parameters.test.ts`'s pinning pattern. Fails the build when the data
 * moves and the figure was not regenerated -- the whole point of committing it rather than
 * computing it at runtime (D-21).
 *
 * This test imports only `measureExtendedTierBias`, never the module's file-writing half: the
 * writer is guarded behind `import.meta.main` in the script itself, so merely importing the
 * measurement function performs no file I/O (verified below by the zero-write-call assertion in
 * this file's own source, per the plan's own acceptance criteria).
 */

import { describe, expect, test } from 'vitest'

import { loadBundleFromDisk } from '../../src/data/load-bundle-node.ts'
import { measureExtendedTierBias } from '../../scripts/measure-extended-tier-bias.ts'
import {
  EXTENDED_TIER_BIAS_ANNUALIZED_FRACTION,
  EXTENDED_TIER_BIAS_ERA_FIRST_DATE,
  EXTENDED_TIER_BIAS_ERA_LAST_DATE,
  EXTENDED_TIER_BIAS_INTERPOLATION_METHOD,
  EXTENDED_TIER_BIAS_LEVERAGE,
  EXTENDED_TIER_BIAS_SYMBOL,
} from '../../src/validation/extended-tier-bias.generated.ts'

describe('CRED-03: the committed extended-tier bias figure matches a live recomputation', () => {
  test('the annualized understated-drag fraction equals the committed constant to full float64 precision', async () => {
    const bundle = await loadBundleFromDisk()
    const result = measureExtendedTierBias(bundle)
    expect(result.annualizedUnderstatedDragFraction).toBe(EXTENDED_TIER_BIAS_ANNUALIZED_FRACTION)
  })

  test('every metadata field (symbol, era dates, leverage, interpolation method) matches the recomputation', async () => {
    const bundle = await loadBundleFromDisk()
    const result = measureExtendedTierBias(bundle)
    expect(result.symbol).toBe(EXTENDED_TIER_BIAS_SYMBOL)
    expect(result.eraFirstDate).toBe(EXTENDED_TIER_BIAS_ERA_FIRST_DATE)
    expect(result.eraLastDate).toBe(EXTENDED_TIER_BIAS_ERA_LAST_DATE)
    expect(result.leverage).toBe(EXTENDED_TIER_BIAS_LEVERAGE)
    expect(result.interpolationMethod).toBe(EXTENDED_TIER_BIAS_INTERPOLATION_METHOD)
  })

  test('the committed figure is a finite positive fraction', () => {
    expect(Number.isFinite(EXTENDED_TIER_BIAS_ANNUALIZED_FRACTION)).toBe(true)
    expect(EXTENDED_TIER_BIAS_ANNUALIZED_FRACTION).toBeGreaterThan(0)
  })

  test('recomputing twice from the same committed bundle is deterministic to full float64 precision', async () => {
    const bundle = await loadBundleFromDisk()
    const first = measureExtendedTierBias(bundle)
    const second = measureExtendedTierBias(bundle)
    expect(second.annualizedUnderstatedDragFraction).toBe(first.annualizedUnderstatedDragFraction)
  })
})
