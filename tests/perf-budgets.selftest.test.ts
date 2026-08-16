/**
 * tests/perf-budgets.selftest.test.ts — D-09: the permanent gate-liveness self-test.
 *
 * Runs in the fast Node `unit` project on every PR forever. Feeds the budget checker a
 * deliberately over-budget fixture and asserts it produces a `fail` verdict, so the gate cannot
 * silently rot into a no-op when the harness is refactored — this is what turns VALIDATION.md's
 * "manual-only, code-review" item for the PERF-01a anchor invariant into a mechanical assertion.
 */

import { describe, expect, test } from 'vitest'

import type { PerfBudget } from '../perf-budgets.ts'
import { PERF_BUDGETS } from '../perf-budgets.ts'
import { checkBudget } from '../bench/report.ts'
import type { MeasurementRow } from '../bench/report.ts'

function makeRow(overrides: Partial<MeasurementRow> = {}): MeasurementRow {
  return {
    budgetId: 'PERF-05',
    requirementId: 'PERF-05',
    measuredMs: 100,
    normalizedMs: 100,
    budgetMs: 16,
    anchorMs: 16,
    anchorLabel: 'one frame',
    source: 'spike-synthetic',
    verdict: 'fail',
    ...overrides,
  }
}

describe('gate-liveness self-test (D-09)', () => {
  test('a deliberately over-budget fixture yields a fail verdict', () => {
    // PERF-05's real budget is 16ms; 100ms is unambiguously, deliberately over-budget.
    const overBudget = makeRow({ budgetId: 'PERF-05', normalizedMs: 100, budgetMs: 16 })
    const verdict = checkBudget(overBudget)
    expect(
      verdict,
      `expected budget "${overBudget.budgetId}" (measured ${overBudget.normalizedMs}ms > ` +
        `budget ${overBudget.budgetMs}ms) to fail — if this ever reads "pass", the gate has ` +
        'rotted into a no-op',
    ).toBe('fail')
  })

  test('the gate mechanism is genuinely load-bearing: forcing a pass would be caught', () => {
    // Sanity-checks the self-test itself, not just checkBudget: an intentionally-broken
    // "always pass" implementation must NOT satisfy the assertion above.
    const alwaysPass = (): 'pass' => 'pass'
    const overBudget = makeRow({ normalizedMs: 100, budgetMs: 16 })
    expect(alwaysPass()).not.toBe(checkBudget(overBudget))
  })
})

describe('PERF-01a anchor invariant: relaxed thresholds must carry a written reason', () => {
  function requiresReason(budget: Pick<PerfBudget, 'thresholdMs' | 'anchorMs'>): boolean {
    return budget.thresholdMs > budget.anchorMs
  }

  function hasNonEmptyReason(budget: Pick<PerfBudget, 'relaxationReason'>): boolean {
    return Boolean(budget.relaxationReason && budget.relaxationReason.trim().length > 0)
  }

  test('every real PERF_BUDGETS entry satisfies the invariant', () => {
    for (const budget of Object.values(PERF_BUDGETS)) {
      if (requiresReason(budget)) {
        expect(
          hasNonEmptyReason(budget),
          `${budget.id}: thresholdMs (${budget.thresholdMs}) > anchorMs (${budget.anchorMs}) ` +
            'but relaxationReason is missing or blank',
        ).toBe(true)
      }
    }
  })

  test('thresholdMs === anchorMs requires no relaxationReason', () => {
    expect(requiresReason({ thresholdMs: 16, anchorMs: 16 })).toBe(false)
  })

  test('thresholdMs > anchorMs with a non-empty relaxationReason satisfies the invariant', () => {
    const budget = { thresholdMs: 20, anchorMs: 16, relaxationReason: 'measured floor, escalated' }
    expect(requiresReason(budget)).toBe(true)
    expect(hasNonEmptyReason(budget)).toBe(true)
  })

  test('an empty or whitespace-only relaxationReason is treated as absent', () => {
    expect(hasNonEmptyReason({ relaxationReason: '' })).toBe(false)
    expect(hasNonEmptyReason({ relaxationReason: '   ' })).toBe(false)
    expect(hasNonEmptyReason({ relaxationReason: undefined })).toBe(false)
  })

  test('PERF_BUDGETS has exactly 11 entries across exactly the 8 requirement ids PERF-02..PERF-09', () => {
    const entries = Object.values(PERF_BUDGETS)
    expect(entries).toHaveLength(11)

    const requirementIds = new Set(entries.map((b) => b.requirementId))
    expect(Array.from(requirementIds).sort()).toEqual([
      'PERF-02',
      'PERF-03',
      'PERF-04',
      'PERF-05',
      'PERF-06',
      'PERF-07',
      'PERF-08',
      'PERF-09',
    ])
  })
})
