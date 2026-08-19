/**
 * tests/app/bounds.test.ts
 *
 * 04-04-PLAN.md Task 1's behavior cases, run against the real committed bundle in the `unit`
 * Vitest project (plain `.test.ts`, no browser needed since `src/app/bounds.ts` has no DOM
 * dependency).
 */

import { describe, expect, test } from 'vitest'

import { dividendModesFor, listSymbols, resolveEntryDateBounds } from '../../src/app/bounds.ts'
import { buildKernelInputs, type BacktestRequest } from '../../src/data/kernel-inputs.ts'
import { loadBundleFromDisk } from '../../src/data/load-bundle-node.ts'

function baseRequest(overrides: Partial<BacktestRequest> = {}): BacktestRequest {
  return {
    symbol: 'SPX',
    dividendReinvest: true,
    leverage: 3,
    entryDate: '1990-01-02',
    holdingPeriodBars: 1,
    initialInvestment: 10_000,
    contributionAmount: 0,
    contributionFrequency: 'none',
    expenseRatioPercent: 0.9,
    financingSpreadPercent: 0.5,
    ...overrides,
  }
}

describe('listSymbols', () => {
  test('returns exactly eleven entries for the committed bundle, excluding the @rate scope', async () => {
    const bundle = await loadBundleFromDisk()
    const symbols = listSymbols(bundle.manifest)

    expect(symbols.length).toBe(11)
    expect(symbols).not.toContain('@rate')
    expect(symbols.some((s) => s.startsWith('@'))).toBe(false)
  })

  test('is sorted ascending', async () => {
    const bundle = await loadBundleFromDisk()
    const symbols = listSymbols(bundle.manifest)

    expect(symbols).toEqual([...symbols].sort())
  })

  test('two calls produce a deeply equal array (ordering contract: two screenshots agree)', async () => {
    const bundle = await loadBundleFromDisk()

    expect(listSymbols(bundle.manifest)).toEqual(listSymbols(bundle.manifest))
  })
})

describe('dividendModesFor', () => {
  test('SPX reports both total-return and price-return available', async () => {
    const bundle = await loadBundleFromDisk()

    expect(dividendModesFor(bundle.manifest, 'SPX')).toEqual({ totalReturn: true, priceReturn: true })
  })

  test('an unknown symbol reports neither mode available', async () => {
    const bundle = await loadBundleFromDisk()

    expect(dividendModesFor(bundle.manifest, 'NOPE-NOT-A-REAL-SYMBOL')).toEqual({
      totalReturn: false,
      priceReturn: false,
    })
  })
})

describe('resolveEntryDateBounds', () => {
  test('SPX total-return strict tier bounds equal the manifest strict-tier range, not the series full range', async () => {
    const bundle = await loadBundleFromDisk()
    const entry = bundle.manifest.series.find((s) => s.id === 'SPX/total-return')!
    expect(entry.tiers.strict).not.toBeNull()

    const bounds = resolveEntryDateBounds(bundle.manifest, 'SPX', true, 'strict')

    expect(bounds).toEqual({ ok: true, firstDate: entry.tiers.strict!.firstDate, lastDate: entry.tiers.strict!.lastDate })
    // The strict tier is narrower than the series' own full range for SPX/total-return
    // (D-09: strict 1988-01-05 vs the series' pre-tier-narrowing range) -- proving this reads
    // the tier, not the series' bare firstDate/lastDate fields.
    expect((bounds as { firstDate: string }).firstDate).not.toBe(entry.firstDate)
  })

  test('NDX resolves a different minimum for price-return than for total-return, proving dividend mode is a real input', async () => {
    const bundle = await loadBundleFromDisk()

    const priceReturn = resolveEntryDateBounds(bundle.manifest, 'NDX', false, 'strict')
    const totalReturn = resolveEntryDateBounds(bundle.manifest, 'NDX', true, 'strict')

    expect(priceReturn.ok).toBe(true)
    expect(totalReturn.ok).toBe(true)
    if (priceReturn.ok && totalReturn.ok) {
      expect(priceReturn.firstDate).not.toBe(totalReturn.firstDate)
    }
  })

  test('an unknown symbol returns a named error result rather than throwing', async () => {
    const bundle = await loadBundleFromDisk()

    const result = resolveEntryDateBounds(bundle.manifest, 'NOPE-NOT-A-REAL-SYMBOL', true, 'strict')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toMatch(/NOPE-NOT-A-REAL-SYMBOL/)
    }
  })

  test('every returned bound round-trips through buildKernelInputs without throwing', async () => {
    const bundle = await loadBundleFromDisk()
    const bounds = resolveEntryDateBounds(bundle.manifest, 'SPX', true, 'strict')
    expect(bounds.ok).toBe(true)
    if (!bounds.ok) return

    expect(() => buildKernelInputs(bundle, baseRequest({ entryDate: bounds.firstDate }))).not.toThrow()
    expect(() => buildKernelInputs(bundle, baseRequest({ entryDate: bounds.lastDate }))).not.toThrow()
  })
})
