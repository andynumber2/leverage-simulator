/**
 * tests/report.test.ts: coverage for bench/report.ts's pure functions, run in the fast Node
 * `unit` project. Complements tests/perf-budgets.selftest.test.ts (D-09's gate-liveness proof
 * and the PERF-01a anchor invariant) with the remaining behaviors from 01-01-PLAN.md's Task 1/
 * Task 2 `<behavior>` blocks.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { BENCH_TOTAL_RUNTIME_CAP_MS, PERF_BUDGETS, PERF_03_BASELINE_HARDWARE_CONCURRENCY } from '../perf-budgets.ts'
import {
  assertRunInvariants,
  assertWithinBudget,
  buildFullRowSet,
  checkBudget,
  escalationTriggered,
  formatMeasured,
  hostMatchesPerf03Baseline,
  renderTable,
} from '../bench/report.ts'
import { resolveBenchResultsDir } from '../bench/accumulator-store.ts'
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
 * mirroring what bench/report.ts's buildFullRowSet produces from PERF_BUDGETS: used directly
 * here so these tests do not depend on any particular measurement having run.
 *
 * PERF-08a/08b/08c carry a real (passing) measurement, not `unmeasured`: 04-03's PERF-08
 * coverage invariant requires this of any "healthy, in-budget" fixture from this point on.
 * PERF-07a/07b deliberately stay unmeasured -- that harness is a separate, later plan in this
 * same phase, and the coverage invariant must not require it yet (see the dedicated PERF-08
 * coverage describe block below). */
const fullRowSet: MeasurementRow[] = [
  row({ budgetId: 'PERF-02', requirementId: 'PERF-02', measuredMs: null, normalizedMs: null, budgetMs: 16, anchorMs: 16, anchorLabel: 'one frame', verdict: 'unmeasured' }),
  row({ budgetId: 'PERF-03', requirementId: 'PERF-03', measuredMs: null, normalizedMs: null, budgetMs: 1000, anchorMs: 1000, anchorLabel: 'holds attention', verdict: 'unmeasured' }),
  row({ budgetId: 'PERF-04', requirementId: 'PERF-04', measuredMs: null, normalizedMs: null, budgetMs: 100, anchorMs: 100, anchorLabel: 'feels instant', verdict: 'unmeasured' }),
  row({ budgetId: 'PERF-05', requirementId: 'PERF-05', measuredMs: 4, normalizedMs: 4, budgetMs: 16, anchorMs: 16, anchorLabel: 'one frame', verdict: 'pass' }),
  row({ budgetId: 'PERF-06', requirementId: 'PERF-06', measuredMs: null, normalizedMs: null, budgetMs: 16, anchorMs: 16, anchorLabel: 'one frame', verdict: 'unmeasured' }),
  row({ budgetId: 'PERF-07a', requirementId: 'PERF-07', measuredMs: null, normalizedMs: null, budgetMs: 50, anchorMs: 50, anchorLabel: 'long task threshold', verdict: 'unmeasured' }),
  row({ budgetId: 'PERF-07b', requirementId: 'PERF-07', measuredMs: null, normalizedMs: null, budgetMs: 16, anchorMs: 16, anchorLabel: 'one frame', verdict: 'unmeasured' }),
  row({ budgetId: 'PERF-08a', requirementId: 'PERF-08', measuredMs: 100, normalizedMs: 100, budgetMs: 1500, anchorMs: 1500, anchorLabel: 'cold load ceiling', source: 'production', verdict: 'pass' }),
  row({ budgetId: 'PERF-08b', requirementId: 'PERF-08', measuredMs: 100, normalizedMs: 100, budgetMs: 1000, anchorMs: 1000, anchorLabel: 'holds attention', source: 'production', verdict: 'pass' }),
  row({ budgetId: 'PERF-08c', requirementId: 'PERF-08', measuredMs: 100, normalizedMs: 100, budgetMs: 300, anchorMs: 300, anchorLabel: 'warm load ceiling', source: 'production', verdict: 'pass' }),
  row({ budgetId: 'PERF-09', requirementId: 'PERF-09', measuredMs: null, normalizedMs: null, budgetMs: 16, anchorMs: 16, anchorLabel: 'one frame', verdict: 'unmeasured' }),
]

describe('checkBudget', () => {
  test('strictly above threshold fails', () => {
    expect(checkBudget(row({ normalizedMs: 20, budgetMs: 16 }))).toBe('fail')
  })

  test('exactly at threshold passes: PERF-01 fails only when a value exceeds its budget', () => {
    expect(checkBudget(row({ normalizedMs: 16, budgetMs: 16 }))).toBe('pass')
  })

  test('below threshold passes', () => {
    expect(checkBudget(row({ normalizedMs: 10, budgetMs: 16 }))).toBe('pass')
  })

  test('null measurement is unmeasured', () => {
    expect(checkBudget(row({ normalizedMs: null, budgetMs: 16 }))).toBe('unmeasured')
  })

  test('compares the unrounded value, never the display-rounded one', () => {
    // 16.001 rounds to "16.00" for display, but the real comparison must still fail: if
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

  test('throws when any row carries verdict fail, naming the failing budget id', () => {
    const withFailure = fullRowSet.map((r) =>
      r.budgetId === 'PERF-05' ? { ...r, normalizedMs: 100, verdict: 'fail' as const } : r,
    )
    expect(() => assertRunInvariants(withFailure, 500)).toThrow(/PERF-05/)
    expect(() => assertRunInvariants(withFailure, 500)).toThrow(/failed budget/i)
  })

  test('a full row set plus an environment block whose calibrationScore matches every measured row does not throw', () => {
    // fullRowSet's measured rows are PERF-05 (4/4) and PERF-08a/08b/08c (100/100 each), so a
    // score of 1 keeps measuredMs === normalizedMs * score for every one of them.
    const coherentEnvironment: EnvironmentBlock = { ...environment, calibrationScore: 1 }
    expect(() => assertRunInvariants(fullRowSet, 500, coherentEnvironment)).not.toThrow()
  })

  test('a row whose implied score diverges from the environment block by 2x throws, naming the budget id and both scores', () => {
    const divergentRows = fullRowSet.map((r) =>
      r.budgetId === 'PERF-05' ? { ...r, measuredMs: 8, normalizedMs: 4 } : r,
    )
    // measuredMs / normalizedMs = 2 for PERF-05, but the environment block records 1: a 2x
    // divergence, the same shape as GitHub Actions run 31963076671.
    const divergentEnvironment: EnvironmentBlock = { ...environment, calibrationScore: 1 }
    expect(() => assertRunInvariants(divergentRows, 500, divergentEnvironment)).toThrow(/PERF-05/)
    expect(() => assertRunInvariants(divergentRows, 500, divergentEnvironment)).toThrow(/implied score 2/)
    expect(() => assertRunInvariants(divergentRows, 500, divergentEnvironment)).toThrow(/environment score 1/)
  })

  test('unmeasured rows are skipped by the coherence check, not treated as a divergence', () => {
    const coherentEnvironment: EnvironmentBlock = { ...environment, calibrationScore: 1 }
    // Every unmeasured row in fullRowSet (PERF-02, PERF-03, PERF-04, PERF-06, PERF-07a, PERF-07b,
    // PERF-09) has measuredMs/normalizedMs both null; the measured rows (PERF-05, PERF-08a/08b/
    // 08c) are all coherent with a score of 1.
    expect(() => assertRunInvariants(fullRowSet, 500, coherentEnvironment)).not.toThrow()
  })

  test('called with two arguments (no environment block), the coherence check is skipped entirely', () => {
    const divergentRows = fullRowSet.map((r) =>
      r.budgetId === 'PERF-05' ? { ...r, measuredMs: 8, normalizedMs: 4 } : r,
    )
    expect(() => assertRunInvariants(divergentRows, 500)).not.toThrow()
  })

  test('a row with normalizedMs === 0 and measuredMs === 0 is coherent with any score and does not throw or produce NaN', () => {
    const someEnvironment: EnvironmentBlock = { ...environment, calibrationScore: 3.7 }
    const zeroRow = fullRowSet.map((r) => {
      if (r.budgetId === 'PERF-05') return { ...r, measuredMs: 0, normalizedMs: 0 }
      // fullRowSet's PERF-08a/08b/08c are denominated at score 1 (measuredMs === normalizedMs);
      // re-denominate them at this test's score so they stay coherent rather than accidentally
      // exercising the divergence check this test is not about.
      if (r.budgetId === 'PERF-08a' || r.budgetId === 'PERF-08b' || r.budgetId === 'PERF-08c') {
        return { ...r, normalizedMs: (r.measuredMs as number) / someEnvironment.calibrationScore }
      }
      return r
    })
    expect(() => assertRunInvariants(zeroRow, 500, someEnvironment)).not.toThrow()
  })

  test('two failing rows supplied in reverse budget-id order produce the same message as ascending order', () => {
    const ascending = fullRowSet.map((r) => {
      if (r.budgetId === 'PERF-05') return { ...r, normalizedMs: 100, verdict: 'fail' as const }
      if (r.budgetId === 'PERF-08a') return { ...r, normalizedMs: 5000, verdict: 'fail' as const }
      return r
    })
    const descending = [...ascending].reverse()

    let ascendingMessage = ''
    let descendingMessage = ''
    try {
      assertRunInvariants(ascending, 500)
    } catch (error) {
      ascendingMessage = (error as Error).message
    }
    try {
      assertRunInvariants(descending, 500)
    } catch (error) {
      descendingMessage = (error as Error).message
    }
    expect(ascendingMessage).not.toBe('')
    expect(ascendingMessage).toBe(descendingMessage)
    // PERF-05 sorts before PERF-08a ascending, so it must appear first regardless of input order.
    expect(ascendingMessage.indexOf('PERF-05')).toBeLessThan(ascendingMessage.indexOf('PERF-08a'))
  })
})

describe('assertRunInvariants: PERF-08 coverage (04-03)', () => {
  test('throws when a PERF-08 sub-budget due by PERF_08_COVERAGE_PHASE is still unmeasured, naming its budget id', () => {
    const rows = fullRowSet.map((r) =>
      r.budgetId === 'PERF-08a'
        ? { ...r, measuredMs: null, normalizedMs: null, verdict: 'unmeasured' as const }
        : r,
    )
    expect(() => assertRunInvariants(rows, 500)).toThrow(/PERF-08a/)
    expect(() => assertRunInvariants(rows, 500)).toThrow(/still unmeasured/i)
  })

  test('throws naming all three PERF-08a/08b/08c ids when all three regress to unmeasured', () => {
    const rows = fullRowSet.map((r) =>
      r.budgetId === 'PERF-08a' || r.budgetId === 'PERF-08b' || r.budgetId === 'PERF-08c'
        ? { ...r, measuredMs: null, normalizedMs: null, verdict: 'unmeasured' as const }
        : r,
    )
    expect(() => assertRunInvariants(rows, 500)).toThrow(/PERF-08a/)
    expect(() => assertRunInvariants(rows, 500)).toThrow(/PERF-08b/)
    expect(() => assertRunInvariants(rows, 500)).toThrow(/PERF-08c/)
  })

  test('does not throw when PERF-07a/07b remain unmeasured: the coverage check is scoped to requirementId PERF-08 only', () => {
    // fullRowSet's PERF-07a/07b are already unmeasured (that harness is a separate, later plan
    // in this same phase); the PERF-08 coverage check must stay silent about them.
    expect(() => assertRunInvariants(fullRowSet, 500)).not.toThrow()
  })

  test('does not throw for a budget id whose own implementedInPhase is after PERF_08_COVERAGE_PHASE', () => {
    // PERF-03/04/06/09 carry implementedInPhase: 7 and remain unmeasured in fullRowSet; none of
    // them are requirementId PERF-08, so this is really the same scoping guarantee restated
    // against the non-PERF-08 unmeasured rows already present in the fixture.
    expect(
      fullRowSet.some((r) => r.requirementId !== 'PERF-08' && r.verdict === 'unmeasured'),
    ).toBe(true)
    expect(() => assertRunInvariants(fullRowSet, 500)).not.toThrow()
  })
})

describe('assertWithinBudget', () => {
  test('throws naming the budget id, the normalized value and the budget value when over budget', () => {
    expect(() =>
      assertWithinBudget({ budgetId: 'PERF-05', normalizedMs: 100, budgetMs: 16 }),
    ).toThrow(/PERF-05/)
    expect(() =>
      assertWithinBudget({ budgetId: 'PERF-05', normalizedMs: 100, budgetMs: 16 }),
    ).toThrow(/100/)
    expect(() =>
      assertWithinBudget({ budgetId: 'PERF-05', normalizedMs: 100, budgetMs: 16 }),
    ).toThrow(/16/)
  })

  test('does not throw for a passing verdict', () => {
    expect(() =>
      assertWithinBudget({ budgetId: 'PERF-05', normalizedMs: 10, budgetMs: 16 }),
    ).not.toThrow()
  })

  test('does not throw for an unmeasured row', () => {
    expect(() =>
      assertWithinBudget({ budgetId: 'PERF-05', normalizedMs: null, budgetMs: 16 }),
    ).not.toThrow()
  })

  test('does not throw at exact equality', () => {
    expect(() =>
      assertWithinBudget({ budgetId: 'PERF-05', normalizedMs: 16, budgetMs: 16 }),
    ).not.toThrow()
  })
})

describe('D-23: unit-denominated rows (DATA-BUNDLE-BYTES, DATA-BUNDLE-DECODE)', () => {
  const byteRow: MeasurementRow = {
    budgetId: 'DATA-BUNDLE-BYTES',
    requirementId: 'PERF-08',
    measuredMs: 900_000,
    normalizedMs: 900_000,
    budgetMs: 1_125_000,
    anchorMs: 1_125_000,
    anchorLabel: '900ms of PERF-08b at the declared 10 Mbps connection',
    source: 'production',
    verdict: 'pass',
  }

  /** The rest of the PERF-08 family (04-03's coverage invariant requires all of it measured,
   * not just `byteRow`'s own DATA-BUNDLE-BYTES id), so `buildFullRowSet([byteRow, ...])` below
   * exercises score-coherence in isolation without also tripping the coverage check these tests
   * are not about. Parametrized by `score` (`normalizedMs = measuredMs / score`) so each caller
   * stays coherent under whatever `calibrationScore` its own test uses. */
  function perf08FamilyRows(score: number): MeasurementRow[] {
    return [
      row({ budgetId: 'DATA-BUNDLE-DECODE', requirementId: 'PERF-08', measuredMs: 1, normalizedMs: 1 / score, budgetMs: 100, anchorMs: 100, anchorLabel: 'feels instant', source: 'production', verdict: 'pass' }),
      row({ budgetId: 'PERF-08a', requirementId: 'PERF-08', measuredMs: 100, normalizedMs: 100 / score, budgetMs: 1500, anchorMs: 1500, anchorLabel: 'cold load ceiling', source: 'production', verdict: 'pass' }),
      row({ budgetId: 'PERF-08b', requirementId: 'PERF-08', measuredMs: 100, normalizedMs: 100 / score, budgetMs: 1000, anchorMs: 1000, anchorLabel: 'holds attention', source: 'production', verdict: 'pass' }),
      row({ budgetId: 'PERF-08c', requirementId: 'PERF-08', measuredMs: 100, normalizedMs: 100 / score, budgetMs: 300, anchorMs: 300, anchorLabel: 'warm load ceiling', source: 'production', verdict: 'pass' }),
    ]
  }

  test('renderTable prints a byte suffix for a byte-denominated row and a millisecond suffix for a millisecond row', () => {
    const msRow = row({ budgetId: 'PERF-02', requirementId: 'PERF-02', normalizedMs: 5, measuredMs: 5, budgetMs: 16, anchorMs: 16, verdict: 'pass' })
    const output = renderTable([byteRow, msRow], environment, 500)
    expect(output).toContain('measured=900000.00bytes')
    expect(output).toContain('budget=1125000bytes')
    expect(output).toContain('anchor=1125000bytes')
    expect(output).toContain('measured=5.00ms')
    expect(output).toContain('budget=16ms')
  })

  test('buildFullRowSet synthesizes unmeasured rows for both new budget ids, carrying their real threshold and anchor', () => {
    const full = buildFullRowSet([])
    const bytesRow = full.find((r) => r.budgetId === 'DATA-BUNDLE-BYTES')
    const decodeRow = full.find((r) => r.budgetId === 'DATA-BUNDLE-DECODE')
    expect(bytesRow).toBeDefined()
    expect(bytesRow!.verdict).toBe('unmeasured')
    expect(bytesRow!.budgetMs).toBe(PERF_BUDGETS['DATA-BUNDLE-BYTES'].thresholdMs)
    expect(bytesRow!.anchorMs).toBe(PERF_BUDGETS['DATA-BUNDLE-BYTES'].anchorMs)
    expect(decodeRow).toBeDefined()
    expect(decodeRow!.verdict).toBe('unmeasured')
    expect(decodeRow!.budgetMs).toBe(PERF_BUDGETS['DATA-BUNDLE-DECODE'].thresholdMs)
    expect(decodeRow!.anchorMs).toBe(PERF_BUDGETS['DATA-BUNDLE-DECODE'].anchorMs)
  })

  test('assertRunInvariants does not treat a byte row (normalizedMs === measuredMs) as score-divergent when the machine score is not 1.0', () => {
    const full = buildFullRowSet([byteRow, ...perf08FamilyRows(3.7)])
    const nonUnitScoreEnvironment: EnvironmentBlock = { ...environment, calibrationScore: 3.7 }
    expect(() => assertRunInvariants(full, 500, nonUnitScoreEnvironment)).not.toThrow()
  })

  test('assertRunInvariants still throws for a divergent millisecond row even when a coherent byte row is also present', () => {
    const divergentMsRow = row({
      budgetId: 'PERF-02',
      requirementId: 'PERF-02',
      measuredMs: 10,
      normalizedMs: 5,
      budgetMs: 16,
      anchorMs: 16,
      verdict: 'pass',
    })
    const full = buildFullRowSet([byteRow, ...perf08FamilyRows(1), divergentMsRow])
    const environmentScoreOne: EnvironmentBlock = { ...environment, calibrationScore: 1 }
    expect(() => assertRunInvariants(full, 500, environmentScoreOne)).toThrow(/PERF-02/)
  })
})

describe('hostMatchesPerf03Baseline', () => {
  test('true when the environment records the declared PERF-03 baseline width', () => {
    expect(
      hostMatchesPerf03Baseline({ ...environment, hardwareConcurrency: PERF_03_BASELINE_HARDWARE_CONCURRENCY }),
    ).toBe(true)
  })

  test('false when the environment records any other width', () => {
    expect(
      hostMatchesPerf03Baseline({ ...environment, hardwareConcurrency: PERF_03_BASELINE_HARDWARE_CONCURRENCY + 1 }),
    ).toBe(false)
    expect(hostMatchesPerf03Baseline({ ...environment, hardwareConcurrency: 2 })).toBe(false)
  })
})

describe('assertRunInvariants: PERF-03 host-width guard (quick-260818-v2d)', () => {
  function withPerf03(rows: MeasurementRow[], overrides: Partial<MeasurementRow>): MeasurementRow[] {
    return rows.map((r) => (r.budgetId === 'PERF-03' ? { ...r, ...overrides } : r))
  }

  test('does not throw for the baseline environment fixture with a passing PERF-03 verdict: the guard is silent on the baseline', () => {
    const rows = withPerf03(fullRowSet, { measuredMs: 700, normalizedMs: 700, verdict: 'pass' })
    expect(() => assertRunInvariants(rows, 500, environment)).not.toThrow()
  })

  test('throws when hardwareConcurrency is 2 and ci is true, naming both the recorded and declared widths', () => {
    const rows = withPerf03(fullRowSet, { measuredMs: 700, normalizedMs: 700, verdict: 'pass' })
    const offBaseline: EnvironmentBlock = { ...environment, hardwareConcurrency: 2 }
    expect(() => assertRunInvariants(rows, 500, offBaseline)).toThrow(/2/)
    expect(() => assertRunInvariants(rows, 500, offBaseline)).toThrow(/4/)
  })

  test('throws when hardwareConcurrency is 8 and ci is true, naming both the recorded and declared widths', () => {
    const rows = withPerf03(fullRowSet, { measuredMs: 700, normalizedMs: 700, verdict: 'pass' })
    const offBaseline: EnvironmentBlock = { ...environment, hardwareConcurrency: 8 }
    expect(() => assertRunInvariants(rows, 500, offBaseline)).toThrow(/8/)
    expect(() => assertRunInvariants(rows, 500, offBaseline)).toThrow(/4/)
  })

  test('throws when ci is false, hardwareConcurrency is 9, and the PERF-03 row carries verdict pass: a bench file cannot restore a verdict the host does not support', () => {
    const rows = withPerf03(fullRowSet, { measuredMs: 700, normalizedMs: 700, verdict: 'pass' })
    const offBaselineLocal: EnvironmentBlock = { ...environment, hardwareConcurrency: 9, ci: false }
    expect(() => assertRunInvariants(rows, 500, offBaselineLocal)).toThrow(/pass/)
  })

  test('does not throw when ci is false, hardwareConcurrency is 9, and the PERF-03 row is unmeasured', () => {
    const offBaselineLocal: EnvironmentBlock = { ...environment, hardwareConcurrency: 9, ci: false }
    expect(() => assertRunInvariants(fullRowSet, 500, offBaselineLocal)).not.toThrow()
  })

  test('still throws /failed budget/ naming PERF-05 when a row fails AND the host is off-baseline with ci true: the verdict gate keeps precedence over the host guard', () => {
    const withFailure = fullRowSet.map((r) =>
      r.budgetId === 'PERF-05' ? { ...r, normalizedMs: 100, verdict: 'fail' as const } : r,
    )
    const offBaseline: EnvironmentBlock = { ...environment, hardwareConcurrency: 1 }
    expect(() => assertRunInvariants(withFailure, 500, offBaseline)).toThrow(/failed budget/i)
    expect(() => assertRunInvariants(withFailure, 500, offBaseline)).toThrow(/PERF-05/)
  })
})

describe('renderTable: PERF-03 verdict withheld banner (quick-260818-v2d)', () => {
  test('emits a line containing PERF-03 VERDICT WITHHELD and both widths when the environment is off-baseline', () => {
    const offBaseline: EnvironmentBlock = { ...environment, hardwareConcurrency: 9, ci: false }
    const output = renderTable(fullRowSet, offBaseline, 500)
    expect(output).toContain('PERF-03 VERDICT WITHHELD')
    expect(output).toContain('9')
    expect(output).toContain('4')
  })

  test('emits no PERF-03 VERDICT WITHHELD line for the baseline fixture', () => {
    const output = renderTable(fullRowSet, environment, 500)
    expect(output).not.toContain('PERF-03 VERDICT WITHHELD')
  })
})

describe('resolveBenchResultsDir', () => {
  const ORIGINAL = process.env.BENCH_RESULTS_DIR

  beforeEach(() => {
    delete process.env.BENCH_RESULTS_DIR
  })

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.BENCH_RESULTS_DIR
    } else {
      process.env.BENCH_RESULTS_DIR = ORIGINAL
    }
  })

  test('returns .bench when unset', () => {
    expect(resolveBenchResultsDir()).toBe('.bench')
  })

  test('returns .bench when set to an empty or whitespace-only string', () => {
    process.env.BENCH_RESULTS_DIR = '   '
    expect(resolveBenchResultsDir()).toBe('.bench')
  })

  test('returns the trimmed relative value when set', () => {
    process.env.BENCH_RESULTS_DIR = '  .bench/selftest  '
    expect(resolveBenchResultsDir()).toBe('.bench/selftest')
  })

  test('throws when the value is an absolute path', () => {
    process.env.BENCH_RESULTS_DIR = '/tmp/somewhere'
    expect(() => resolveBenchResultsDir()).toThrow(/absolute/i)
  })

  test('throws when the value contains a parent-directory segment', () => {
    process.env.BENCH_RESULTS_DIR = '../escape'
    expect(() => resolveBenchResultsDir()).toThrow(/parent-directory/i)
  })
})
