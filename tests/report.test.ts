/**
 * tests/report.test.ts — coverage for bench/report.ts's pure functions, run in the fast Node
 * `unit` project. Complements tests/perf-budgets.selftest.test.ts (D-09's gate-liveness proof
 * and the PERF-01a anchor invariant) with the remaining behaviors from 01-01-PLAN.md's Task 1/
 * Task 2 `<behavior>` blocks.
 */

import { describe, expect, test } from 'vitest'

import { BENCH_TOTAL_RUNTIME_CAP_MS } from '../perf-budgets.ts'
import {
  assertRunInvariants,
  checkBudget,
  escalationTriggered,
  formatMeasured,
  renderTable,
} from '../bench/report.ts'
import type { EnvironmentBlock } from '../bench/environment-block.ts'
import type { MeasurementRow } from '../bench/report.ts'

function row(overrides: Partial<MeasurementRow> = {}): MeasurementRow {
  return {
    budgetId: 'PERF-05',
    requirementId: 'PERF-05',
    measuredMs: 10,
    normalizedMs: 10,
    budgetMs: 16,
    anchorMs: 16,
    anchorLabel: 'one frame',
    source: 'spike-synthetic',
    verdict: 'pass',
    ...overrides,
  }
}

const environment: EnvironmentBlock = {
  hardwareConcurrency: 4,
  userAgent: 'test-agent/1.0',
  os: 'linux 6.0.0',
  calibrationScore: 1,
  ci: true,
  timestamp: '2026-08-16T00:00:00.000Z',
}

/** A full, always-present row set covering all eight requirement groups (PERF-02..PERF-09),
 * mirroring what bench/report.ts's buildFullRowSet produces from PERF_BUDGETS — used directly
 * here so these tests do not depend on any particular measurement having run. */
const fullRowSet: MeasurementRow[] = [
  row({ budgetId: 'PERF-02', requirementId: 'PERF-02', measuredMs: null, normalizedMs: null, budgetMs: 16, anchorMs: 16, anchorLabel: 'one frame', verdict: 'unmeasured' }),
  row({ budgetId: 'PERF-03', requirementId: 'PERF-03', measuredMs: null, normalizedMs: null, budgetMs: 1000, anchorMs: 1000, anchorLabel: 'holds attention', verdict: 'unmeasured' }),
  row({ budgetId: 'PERF-04', requirementId: 'PERF-04', measuredMs: null, normalizedMs: null, budgetMs: 100, anchorMs: 100, anchorLabel: 'feels instant', verdict: 'unmeasured' }),
  row({ budgetId: 'PERF-05', requirementId: 'PERF-05', measuredMs: 4, normalizedMs: 4, budgetMs: 16, anchorMs: 16, anchorLabel: 'one frame', verdict: 'pass' }),
  row({ budgetId: 'PERF-06', requirementId: 'PERF-06', measuredMs: null, normalizedMs: null, budgetMs: 16, anchorMs: 16, anchorLabel: 'one frame', verdict: 'unmeasured' }),
  row({ budgetId: 'PERF-07a', requirementId: 'PERF-07', measuredMs: null, normalizedMs: null, budgetMs: 50, anchorMs: 50, anchorLabel: 'long task threshold', verdict: 'unmeasured' }),
  row({ budgetId: 'PERF-07b', requirementId: 'PERF-07', measuredMs: null, normalizedMs: null, budgetMs: 16, anchorMs: 16, anchorLabel: 'one frame', verdict: 'unmeasured' }),
  row({ budgetId: 'PERF-08a', requirementId: 'PERF-08', measuredMs: null, normalizedMs: null, budgetMs: 1500, anchorMs: 1500, anchorLabel: 'cold load ceiling', verdict: 'unmeasured' }),
  row({ budgetId: 'PERF-08b', requirementId: 'PERF-08', measuredMs: null, normalizedMs: null, budgetMs: 1000, anchorMs: 1000, anchorLabel: 'holds attention', verdict: 'unmeasured' }),
  row({ budgetId: 'PERF-08c', requirementId: 'PERF-08', measuredMs: null, normalizedMs: null, budgetMs: 300, anchorMs: 300, anchorLabel: 'warm load ceiling', verdict: 'unmeasured' }),
  row({ budgetId: 'PERF-09', requirementId: 'PERF-09', measuredMs: null, normalizedMs: null, budgetMs: 16, anchorMs: 16, anchorLabel: 'one frame', verdict: 'unmeasured' }),
]

describe('checkBudget', () => {
  test('strictly above threshold fails', () => {
    expect(checkBudget(row({ normalizedMs: 20, budgetMs: 16 }))).toBe('fail')
  })

  test('exactly at threshold passes — PERF-01 fails only when a value exceeds its budget', () => {
    expect(checkBudget(row({ normalizedMs: 16, budgetMs: 16 }))).toBe('pass')
  })

  test('below threshold passes', () => {
    expect(checkBudget(row({ normalizedMs: 10, budgetMs: 16 }))).toBe('pass')
  })

  test('null measurement is unmeasured', () => {
    expect(checkBudget(row({ normalizedMs: null, budgetMs: 16 }))).toBe('unmeasured')
  })

  test('compares the unrounded value, never the display-rounded one', () => {
    // 16.001 rounds to "16.00" for display, but the real comparison must still fail — if
    // checkBudget ever used formatMeasured's rounded output internally, this would misreport
    // "pass".
    expect(checkBudget(row({ normalizedMs: 16.001, budgetMs: 16 }))).toBe('fail')
    expect(formatMeasured(16.001)).toBe('16.00')
  })
})

describe('escalationTriggered (D-20: 70% of budget)', () => {
  test('exactly at 70% triggers', () => {
    expect(escalationTriggered(11.2, 16)).toBe(true)
  })

  test('just below 70% does not trigger', () => {
    expect(escalationTriggered(11.19, 16)).toBe(false)
  })

  test('a triggered escalation does not itself fail the budget', () => {
    expect(escalationTriggered(11.2, 16)).toBe(true)
    expect(checkBudget(row({ normalizedMs: 11.2, budgetMs: 16 }))).toBe('pass')
  })

  test('null measurement never escalates', () => {
    expect(escalationTriggered(null, 16)).toBe(false)
  })
})

describe('formatMeasured', () => {
  test('rounds half-up to two decimal places, including the classic 16.005 float case', () => {
    expect(formatMeasured(16.005)).toBe('16.01')
  })

  test('does not round up when the third decimal is below the half-up boundary', () => {
    expect(formatMeasured(16.004)).toBe('16.00')
  })

  test('null renders as "unmeasured"', () => {
    expect(formatMeasured(null)).toBe('unmeasured')
  })
})

describe('renderTable', () => {
  test('output is independent of input row array order', () => {
    const forward = renderTable(fullRowSet, environment, 500)
    const shuffled = [...fullRowSet].reverse()
    const backward = renderTable(shuffled, environment, 500)
    expect(backward).toBe(forward)
  })

  test('contains all eight requirement group headers', () => {
    const output = renderTable(fullRowSet, environment, 500)
    for (const id of ['PERF-02', 'PERF-03', 'PERF-04', 'PERF-05', 'PERF-06', 'PERF-07', 'PERF-08', 'PERF-09']) {
      expect(output).toContain(`=== ${id} ===`)
    }
  })

  test('two rows with identical measured values are neither deduplicated nor merged', () => {
    const duplicateValueRows: MeasurementRow[] = [
      row({ budgetId: 'PERF-02', requirementId: 'PERF-02', normalizedMs: 5, measuredMs: 5, verdict: 'pass' }),
      row({ budgetId: 'PERF-05', requirementId: 'PERF-05', normalizedMs: 5, measuredMs: 5, verdict: 'pass' }),
    ]
    const output = renderTable(duplicateValueRows, environment, 500)
    expect(output).toContain('PERF-02')
    expect(output).toContain('PERF-05')
    expect((output.match(/measured=5\.00ms/g) ?? []).length).toBe(2)
  })
})

describe('assertRunInvariants', () => {
  test('throws when a requirement group is missing', () => {
    const missingOne = fullRowSet.filter((r) => r.requirementId !== 'PERF-09')
    expect(() => assertRunInvariants(missingOne, 500)).toThrow(/PERF-09/)
  })

  test('throws when every row is unmeasured', () => {
    const allUnmeasured = fullRowSet.map((r) => ({ ...r, verdict: 'unmeasured' as const }))
    expect(() => assertRunInvariants(allUnmeasured, 500)).toThrow(/zero rows measured/i)
  })

  test('throws when total runtime exceeds the declared cap', () => {
    expect(() => assertRunInvariants(fullRowSet, BENCH_TOTAL_RUNTIME_CAP_MS + 1)).toThrow(/exceeds/i)
  })

  test('passes at exactly the cap', () => {
    expect(() => assertRunInvariants(fullRowSet, BENCH_TOTAL_RUNTIME_CAP_MS)).not.toThrow()
  })

  test('throws when a row references a budget id absent from PERF_BUDGETS', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bogus = [...fullRowSet, row({ budgetId: 'PERF-99' as any, requirementId: 'PERF-09' })]
    expect(() => assertRunInvariants(bogus, 500)).toThrow(/PERF-99/)
  })

  test('a fully-measured, in-budget row set does not throw', () => {
    expect(() => assertRunInvariants(fullRowSet, 500)).not.toThrow()
  })
})
