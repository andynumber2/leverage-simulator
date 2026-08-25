/**
 * tests/heatmap/paint-contour.test.ts
 *
 * Orchestrator-routed fix, originating from 07-07-SUMMARY.md's known-defect report against
 * `src/heatmap/paint-contour.ts`'s `getRampValues`: a two-way branch
 * (`metric === 'multiple' ? grid.multiples : grid.drawdowns`) over the three-member `Metric`
 * union, silently reading `grid.drawdowns` for the `annualized` metric and stroking contour
 * lines derived from the wrong array. `displayedMetric()` reaches `annualized` in the shipped UI
 * (07-06/07-07), so this was live, not latent.
 *
 * Covers both halves of the fix together, since the array swap alone is not sufficient:
 * `valuesForContourMetric` (the exhaustive array selection) and `getRampValues` (the full
 * pipeline, array selection plus the metric-aware `rampPositionForMetric` transform -- the prior
 * code called the `multiple`-only `rampPositionFor` unconditionally, which is wrong for
 * `drawdown`/`annualized` even once the array is correct).
 *
 * Runs in the fast Node `unit` project: neither function under test touches the DOM or a canvas.
 */

import { describe, expect, test } from 'vitest'

import { bandLevelsForMetric, rampPositionForMetric } from '../../src/colorscale/value-to-color.ts'
import { marchingSquaresSegments } from '../../src/heatmap/iso-lines.ts'
import { getRampValues, valuesForContourMetric } from '../../src/heatmap/paint-contour.ts'
import { createSweepGrid, type SweepGridMeta } from '../../src/sweep/sweep-grid.ts'

function testMeta(entryDates: string[], leverages: number[]): SweepGridMeta {
  return {
    bundleVersion: 'test',
    symbol: 'TEST',
    dividendReinvest: true,
    entryDates,
    leverages,
    holdingYears: 0,
    initialInvestment: 10_000,
    expenseRatioPercent: 0.9,
    financingSpreadPercent: 0.5,
    ruinedCount: 0,
    incompleteCount: 0,
    minMultiple: 0,
    maxMultiple: 0,
    clippedBelowCount: 0,
    clippedAboveCount: 0,
    holdMode: 'end-of-data',
    endOfDataDate: '2020-01-01',
  }
}

describe('paint-contour.ts: metric-to-array routing (07-07 known-defect fix)', () => {
  test('valuesForContourMetric reads the array matching each metric, never a two-way multiple/drawdown fallback', () => {
    const grid = createSweepGrid(2, 2, testMeta(['2020-01-01', '2020-01-02'], [1, 2]))
    grid.multiples.set([1, 2, 3, 4])
    grid.drawdowns.set([0.1, 0.2, 0.3, 0.4])
    grid.annualized.set([0.05, 0.06, 0.07, 0.08])

    expect(Array.from(valuesForContourMetric(grid, 'multiple'))).toEqual(Array.from(grid.multiples))
    expect(Array.from(valuesForContourMetric(grid, 'drawdown'))).toEqual(Array.from(grid.drawdowns))

    // The exact defect: the old code was `metric === 'multiple' ? grid.multiples : grid.drawdowns`,
    // which returned grid.drawdowns for 'annualized'. Assert both that annualized reads its own
    // array AND that it disagrees with drawdowns (the array the old ternary's fallback branch
    // would have returned).
    const annualizedValues = Array.from(valuesForContourMetric(grid, 'annualized'))
    expect(annualizedValues).toEqual(Array.from(grid.annualized))
    expect(annualizedValues).not.toEqual(Array.from(grid.drawdowns))
  })

  test('getRampValues for annualized never reflects the drawdown array: a field with a varying drawdowns array but a CONSTANT annualized value produces zero contour crossings', () => {
    const cols = 4
    const rows = 4
    const grid = createSweepGrid(
      cols,
      rows,
      testMeta(
        Array.from({ length: cols }, (_, i) => `2020-01-0${i + 1}`),
        Array.from({ length: rows }, (_, r) => 1 + r),
      ),
    )

    // drawdowns vary widely across the field -- under the old two-way ternary's fallback branch,
    // painting the 'annualized' metric would read THIS array and produce real contour segments.
    for (let i = 0; i < cols * rows; i++) {
      grid.drawdowns[i] = i % 2 === 0 ? 0.05 : 0.75
    }
    // annualized is perfectly constant: a correctly-routed contour pass has nothing to stroke.
    grid.annualized.fill(0.1)

    const rampValues = getRampValues(grid, 'annualized')
    const levels = bandLevelsForMetric('annualized')

    let totalSegments = 0
    for (const level of levels) {
      totalSegments += marchingSquaresSegments(rampValues, cols, rows, level, grid.flags).length
    }
    expect(totalSegments).toBe(0)
  })

  test('getRampValues applies the metric-aware ramp-position transform, not the multiple-only symlog transform, for drawdown and annualized', () => {
    const grid = createSweepGrid(2, 2, testMeta(['2020-01-01', '2020-01-02'], [1, 2]))
    grid.drawdowns.set([0.1, 0.2, 0.3, 0.4])
    grid.annualized.set([-0.1, 0, 0.1, 0.2])

    const drawdownRamp = getRampValues(grid, 'drawdown')
    for (let i = 0; i < 4; i++) {
      expect(drawdownRamp[i]).toBeCloseTo(rampPositionForMetric(grid.drawdowns[i]!, 'drawdown'), 10)
    }

    const annualizedRamp = getRampValues(grid, 'annualized')
    for (let i = 0; i < 4; i++) {
      expect(annualizedRamp[i]).toBeCloseTo(rampPositionForMetric(grid.annualized[i]!, 'annualized'), 10)
    }
  })
})
