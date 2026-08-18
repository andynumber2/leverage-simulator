/**
 * tests/validation/cost-parameters.test.ts
 *
 * D-19's pinning test: each COST_PARAMETERS entry is asserted against the exact value its own
 * citation names, so a later change to a constant without a matching citation change fails this
 * suite (SIM-09). Extended in a second commit (03-03-PLAN.md Task 3) with the D-14 tolerance-
 * derivation assertions -- see cost-parameters.ts's header comment for the full no-fitting
 * protocol this file mechanically enforces.
 */

import { describe, expect, test } from 'vitest'

import {
  COST_PARAMETERS,
  FINANCING_SPREAD_DEFAULT,
  FINANCING_SPREAD_RANGE,
  GENERIC_3X_EXPENSE_RATIO,
  RETURN_DRIFT_TOLERANCE,
  TOLERANCE_MECHANISMS,
  TOLERANCE_SAFETY_FACTOR,
  TQQQ_INCEPTION_ERA_EXPENSE_RATIO,
  TRACKING_ERROR_TOLERANCE,
  UPRO_INCEPTION_ERA_EXPENSE_RATIO,
  type CostParameterConfidence,
} from '../../src/validation/cost-parameters.ts'

const CONFIDENCE_LEVELS: readonly CostParameterConfidence[] = ['VERIFIED', 'CITED', 'ASSUMED']

describe('COST_PARAMETERS: each constant is pinned to the value its own citation names', () => {
  test('upro-inception-era-expense-ratio equals its cited filing figure (0.95% net)', () => {
    expect(COST_PARAMETERS['upro-inception-era-expense-ratio'].value).toBe(0.0095)
  })

  test('tqqq-inception-era-expense-ratio equals its cited filing figure (0.95% net)', () => {
    expect(COST_PARAMETERS['tqqq-inception-era-expense-ratio'].value).toBe(0.0095)
  })

  test('generic-3x-expense-ratio equals PROJECT.md\'s placeholder (0.90%)', () => {
    expect(COST_PARAMETERS['generic-3x-expense-ratio'].value).toBe(0.009)
  })

  test('financing-spread-lower equals its cited band lower bound (20bp)', () => {
    expect(COST_PARAMETERS['financing-spread-lower'].value).toBe(0.002)
  })

  test('financing-spread-upper equals its cited band upper bound (80bp)', () => {
    expect(COST_PARAMETERS['financing-spread-upper'].value).toBe(0.008)
  })

  test('the exported named constants read off COST_PARAMETERS rather than duplicating a literal', () => {
    expect(UPRO_INCEPTION_ERA_EXPENSE_RATIO).toBe(COST_PARAMETERS['upro-inception-era-expense-ratio'].value)
    expect(TQQQ_INCEPTION_ERA_EXPENSE_RATIO).toBe(COST_PARAMETERS['tqqq-inception-era-expense-ratio'].value)
    expect(GENERIC_3X_EXPENSE_RATIO).toBe(COST_PARAMETERS['generic-3x-expense-ratio'].value)
  })
})

describe('COST_PARAMETERS: every entry carries a real citation, source date and confidence tag', () => {
  for (const [id, entry] of Object.entries(COST_PARAMETERS)) {
    test(`${id} has a non-empty citation of at least 20 characters`, () => {
      expect(entry.citation.length).toBeGreaterThanOrEqual(20)
    })

    test(`${id} has an ISO YYYY-MM-DD sourceDate`, () => {
      expect(entry.sourceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    test(`${id} has a confidence tag that is one of the three declared union members`, () => {
      expect(CONFIDENCE_LEVELS).toContain(entry.confidence)
    })

    test(`${id}'s value is a fraction in (0, 1), never a percentage (D-09, catches the F-02 class of error)`, () => {
      expect(entry.value).toBeGreaterThan(0)
      expect(entry.value).toBeLessThan(1)
    })
  }
})

describe('SIM-09: an ASSUMED entry\'s citation cannot masquerade as merely undocumented', () => {
  const assumedEntries = Object.values(COST_PARAMETERS).filter((entry) => entry.confidence === 'ASSUMED')

  test('at least one ASSUMED entry exists (the financing-spread bounds)', () => {
    expect(assumedEntries.length).toBeGreaterThan(0)
  })

  for (const entry of assumedEntries) {
    test(`${entry.id}'s citation names at least one attempted retrieval route (an http:// or https:// URL)`, () => {
      expect(entry.citation).toMatch(/https?:\/\//)
    })
  }
})

describe('FINANCING_SPREAD_RANGE and FINANCING_SPREAD_DEFAULT', () => {
  test('FINANCING_SPREAD_RANGE.lower is strictly less than FINANCING_SPREAD_RANGE.upper', () => {
    expect(FINANCING_SPREAD_RANGE.lower).toBeLessThan(FINANCING_SPREAD_RANGE.upper)
  })

  test('FINANCING_SPREAD_DEFAULT equals the midpoint of FINANCING_SPREAD_RANGE', () => {
    expect(FINANCING_SPREAD_DEFAULT).toBe((FINANCING_SPREAD_RANGE.lower + FINANCING_SPREAD_RANGE.upper) / 2)
  })

  test('FINANCING_SPREAD_RANGE reads off COST_PARAMETERS rather than duplicating a literal', () => {
    expect(FINANCING_SPREAD_RANGE.lower).toBe(COST_PARAMETERS['financing-spread-lower'].value)
    expect(FINANCING_SPREAD_RANGE.upper).toBe(COST_PARAMETERS['financing-spread-upper'].value)
  })
})

/** Recomputes the D-14 sum independently of src/validation/cost-parameters.ts's own
 * `sumMechanismsForScope` helper (which is not exported), so this test does not merely call the
 * same code twice -- it re-derives the expected tolerance from TOLERANCE_MECHANISMS's public
 * shape and TOLERANCE_SAFETY_FACTOR, the same inputs a future reviewer would use by hand. */
function recomputeToleranceForScope(scope: 'tracking-error' | 'drift'): number {
  const inScope = TOLERANCE_MECHANISMS.filter((m) => m.appliesTo === scope || m.appliesTo === 'both')
  // TOLERANCE_SAFETY_FACTOR covers a REASONED estimate being off by half, so it applies only to
  // reasoned rows; a row marked `measured: true` was read off a dataset and is added at face
  // value. Inflating a measurement by 1.5x would slacken the gate by 50% for no epistemic gain.
  const reasonedBasisPoints = inScope
    .filter((m) => m.measured !== true)
    .reduce((sum, m) => sum + m.basisPointsPerYear, 0)
  const measuredBasisPoints = inScope
    .filter((m) => m.measured === true)
    .reduce((sum, m) => sum + m.basisPointsPerYear, 0)
  return (reasonedBasisPoints * TOLERANCE_SAFETY_FACTOR + measuredBasisPoints) / 10_000
}

describe('TOLERANCE_MECHANISMS: D-14\'s enumerated, priced, cited derivation', () => {
  test('every mechanism has a non-empty basis', () => {
    for (const mechanism of TOLERANCE_MECHANISMS) {
      expect(mechanism.basis.length).toBeGreaterThan(0)
    }
  })

  test('every mechanism has a basisPointsPerYear strictly greater than zero', () => {
    for (const mechanism of TOLERANCE_MECHANISMS) {
      expect(mechanism.basisPointsPerYear).toBeGreaterThan(0)
    }
  })

  test('at least five mechanisms are scoped to drift (directly or via "both")', () => {
    const driftMechanisms = TOLERANCE_MECHANISMS.filter((m) => m.appliesTo === 'drift' || m.appliesTo === 'both')
    expect(driftMechanisms.length).toBeGreaterThanOrEqual(5)
  })

  test('at least four mechanisms are scoped to precision/tracking-error (directly or via "both")', () => {
    const precisionMechanisms = TOLERANCE_MECHANISMS.filter(
      (m) => m.appliesTo === 'tracking-error' || m.appliesTo === 'both',
    )
    expect(precisionMechanisms.length).toBeGreaterThanOrEqual(4)
  })
})

describe('RETURN_DRIFT_TOLERANCE and TRACKING_ERROR_TOLERANCE: computed, not literal', () => {
  test('RETURN_DRIFT_TOLERANCE equals the independently recomputed sum of drift mechanisms times the safety factor', () => {
    expect(RETURN_DRIFT_TOLERANCE).toBeCloseTo(recomputeToleranceForScope('drift'), 12)
  })

  test('TRACKING_ERROR_TOLERANCE equals the independently recomputed sum of precision mechanisms times the safety factor', () => {
    expect(TRACKING_ERROR_TOLERANCE).toBeCloseTo(recomputeToleranceForScope('tracking-error'), 12)
  })

  test('TOLERANCE_SAFETY_FACTOR is 1.5', () => {
    expect(TOLERANCE_SAFETY_FACTOR).toBe(1.5)
  })

  test('a measured mechanism is excluded from the safety factor, a reasoned one is not', () => {
    // Pins the D-15 repricing rule introduced when the NAV/market-close row was measured: the
    // safety factor exists to cover a REASONED estimate being off by half, so applying it to a
    // measurement would slacken the gate by 50% for no epistemic gain. If a future edit reverts
    // to multiplying every row, this goes red rather than quietly widening both tolerances.
    const measured = TOLERANCE_MECHANISMS.filter((m) => m.measured === true)
    expect(measured.length, 'at least one mechanism should be measured').toBeGreaterThan(0)

    for (const scope of ['tracking-error', 'drift'] as const) {
      const inScope = TOLERANCE_MECHANISMS.filter((m) => m.appliesTo === scope || m.appliesTo === 'both')
      const measuredBp = inScope.filter((m) => m.measured === true).reduce((s, m) => s + m.basisPointsPerYear, 0)
      if (measuredBp === 0) continue
      const naiveEverythingScaled =
        (inScope.reduce((s, m) => s + m.basisPointsPerYear, 0) / 10_000) * TOLERANCE_SAFETY_FACTOR
      const actual = scope === 'drift' ? RETURN_DRIFT_TOLERANCE : TRACKING_ERROR_TOLERANCE
      expect(
        actual,
        `${scope}: the tolerance must be strictly tighter than scaling every row, including the ` +
          'measured one, by the safety factor',
      ).toBeLessThan(naiveEverythingScaled)
    }
  })

  test('every measured mechanism states how it was measured, so the figure is reproducible', () => {
    for (const mechanism of TOLERANCE_MECHANISMS.filter((m) => m.measured === true)) {
      expect(
        /measur|sample standard deviation|annualiz|n=/i.test(mechanism.basis),
        `measured mechanism "${mechanism.id}" must describe its measurement in its basis`,
      ).toBe(true)
    }
  })

  test('both tolerances are expressed as annualized fractions, not basis points or percentages', () => {
    // A genuine tracking-error/drift tolerance in fraction form for this domain is well under 1
    // (100%); basis-points or percent-point figures mistakenly left unconverted would be orders
    // of magnitude larger or smaller than this band.
    expect(RETURN_DRIFT_TOLERANCE).toBeGreaterThan(0)
    expect(RETURN_DRIFT_TOLERANCE).toBeLessThan(0.05)
    expect(TRACKING_ERROR_TOLERANCE).toBeGreaterThan(0)
    expect(TRACKING_ERROR_TOLERANCE).toBeLessThan(0.05)
  })
})
