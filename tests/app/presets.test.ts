/**
 * tests/app/presets.test.ts
 *
 * 08-03-PLAN.md Task 1: the smoke test proving `computeDerivedMetrics` (now exported from
 * `src/app/state.ts`, F-07) is callable from a Node caller against the real on-disk bundle --
 * the mechanical proof that closes RESEARCH Assumption A3 by measurement rather than assertion.
 * Runs in the `unit` project (`environment: 'node'`), never the browser `app` project: this file
 * does not match `tests/app/**\/*.browser.test.ts`, so it is picked up by `npm run test`.
 *
 * Tasks 2 and 3 (same plan) extend this file with the preset library's structural assertions
 * (D-16, the featured invariant, uniqueness, the permalink round trip, criterion-3 coverage and
 * ordering stability) once `src/app/presets.ts` exists.
 */

import { describe, expect, test } from 'vitest'

import { computeDerivedMetrics } from '../../src/app/state.ts'
import { buildKernelInputs } from '../../src/data/kernel-inputs.ts'
import { loadBundleFromDisk } from '../../src/data/load-bundle-node.ts'
import { runBacktest } from '../../src/kernel/backtest.ts'

describe('F-07: computeDerivedMetrics is callable from Node against the real bundle', () => {
  test('a short single run produces a DerivedMetrics object with the expected shape', async () => {
    const bundle = await loadBundleFromDisk()
    const inputs = buildKernelInputs(bundle, {
      symbol: 'SPX',
      dividendReinvest: true,
      leverage: 3,
      entryDate: '2010-01-04',
      holdingPeriodBars: 252,
      initialInvestment: 10_000,
      contributionAmount: 0,
      contributionFrequency: 'none',
      expenseRatioPercent: 0.91,
      financingSpreadPercent: 0.5,
    })
    const result = runBacktest(inputs.params, inputs.series, inputs.outputs)
    const metrics = computeDerivedMetrics(bundle, inputs, result)

    expect(metrics.irr === null || Number.isFinite(metrics.irr)).toBe(true)
    expect(metrics.cagr === null || Number.isFinite(metrics.cagr)).toBe(true)
    expect(Number.isFinite(metrics.finalValueMultiple)).toBe(true)
    // A non-ruining short run over a calm 2010 window: ruinDate must be null.
    expect(metrics.ruinDate).toBeNull()
  })
})
