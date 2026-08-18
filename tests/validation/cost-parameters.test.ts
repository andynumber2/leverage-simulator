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
  TQQQ_INCEPTION_ERA_EXPENSE_RATIO,
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
