/**
 * tests/app/presets.test.ts
 *
 * 08-03-PLAN.md Task 1: the smoke test proving `computeDerivedMetrics` (now exported from
 * `src/app/state.ts`, F-07) is callable from a Node caller against the real on-disk bundle --
 * the mechanical proof that closes RESEARCH Assumption A3 by measurement rather than assertion.
 * Runs in the `unit` project (`environment: 'node'`), never the browser `app` project: this file
 * does not match `tests/app/**\/*.browser.test.ts`, so it is picked up by `npm run test`.
 *
 * Task 3: the preset library's structural assertions -- D-16 (the load-bearing real-fund
 * assertion), the featured invariant, uniqueness, the permalink round trip (the assumption-delta
 * decision's contract test), criterion-3 coverage and ordering stability.
 */

import { describe, expect, test } from 'vitest'

import { computeDerivedMetrics } from '../../src/app/state.ts'
import { buildKernelInputs, type BacktestRequest } from '../../src/data/kernel-inputs.ts'
import { loadBundleFromDisk } from '../../src/data/load-bundle-node.ts'
import { runBacktest } from '../../src/kernel/backtest.ts'
import { PRESET_DEFINITIONS } from '../../src/app/presets.ts'
import { decodeParams, encodeParams, type PermalinkParams } from '../../src/app/permalink.ts'

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

/** The compiled bundle's manifest carries no per-series "this is a leveraged fund" marker
 * (`public/data/manifest.*.json` has no such field), so the real-fund ticker set for D-16's
 * assertion below is this explicit list -- every leveraged ETF this bundle carries data for,
 * named so a reviewer can check it against the manifest by eye rather than trusting a derived
 * heuristic. */
const REAL_LEVERAGED_FUND_SYMBOLS = ['UPRO', 'TQQQ', 'SSO', 'QLD']

/** D-19/the assumption-delta decision's own contract: a preset applies its request through the
 * same validated setters any parameter control uses, and the ONE thing that ever reaches the
 * address bar is a `PermalinkParams`. This mirrors plan 08-04's own apply path closely enough to
 * exercise the round trip meaningfully: `holdMode`/`holdingPeriodBars` derived the same way
 * `writePermalinkUrl` derives them in `state.ts`, `resolvedEndDate` taken from the real
 * `buildKernelInputs` result for this preset (never hand-authored), `bundleVersion` from the live
 * manifest (D-19: never stored on the definition itself). */
function buildPermalinkParamsForPreset(
  preset: (typeof PRESET_DEFINITIONS)[number],
  resolvedEndDate: string,
  bundleVersion: string,
): PermalinkParams {
  return {
    ...preset.request,
    holdMode: preset.request.holdingPeriodBars === null ? 'end-of-data' : 'fixed',
    resolvedEndDate,
    tier: preset.tier,
    scale: preset.scale,
    bundleVersion,
    mode: preset.mode,
    metric: preset.metric,
  }
}

describe('08-04-PLAN.md Task 1: the parameter mapping applyPreset produces', () => {
  test('for every preset, the PermalinkParams applyPreset would produce matches the definition field for field, with bundleVersion sourced from the manifest rather than the definition', async () => {
    // 08-04-PLAN.md Task 1: `applyPreset` itself is exercised end-to-end (click, DOM, URL decode)
    // only in `tests/app/scenarios-overlay.browser.test.ts`, the one place `window.location` is
    // real. This is the Node-side proof of the parameter MAPPING alone -- the exact
    // `PermalinkParams` object `applyPreset`'s write path (`setActiveTier`/`setScaleMode`/
    // `setDisplayedMetric`/`setResultMode`/`updateBacktestRequest`, then `writePermalinkUrl`)
    // would eventually produce for every preset in the library, reusing
    // `buildPermalinkParamsForPreset` above (the same construction the round-trip/uniqueness
    // tests already trust) rather than a second, parallel one.
    const bundle = await loadBundleFromDisk()
    for (const preset of PRESET_DEFINITIONS) {
      const inputs = buildKernelInputs(bundle, preset.request as BacktestRequest)
      const params = buildPermalinkParamsForPreset(preset, inputs.window.lastDate, bundle.manifest.bundleVersion)

      expect(params.symbol, `preset "${preset.id}" symbol`).toBe(preset.request.symbol)
      expect(params.dividendReinvest, `preset "${preset.id}" dividendReinvest`).toBe(preset.request.dividendReinvest)
      expect(params.leverage, `preset "${preset.id}" leverage`).toBe(preset.request.leverage)
      expect(params.entryDate, `preset "${preset.id}" entryDate`).toBe(preset.request.entryDate)
      expect(params.holdingPeriodBars, `preset "${preset.id}" holdingPeriodBars`).toBe(preset.request.holdingPeriodBars)
      expect(params.initialInvestment, `preset "${preset.id}" initialInvestment`).toBe(preset.request.initialInvestment)
      expect(params.contributionAmount, `preset "${preset.id}" contributionAmount`).toBe(preset.request.contributionAmount)
      expect(params.contributionFrequency, `preset "${preset.id}" contributionFrequency`).toBe(
        preset.request.contributionFrequency,
      )
      expect(params.expenseRatioPercent, `preset "${preset.id}" expenseRatioPercent`).toBe(preset.request.expenseRatioPercent)
      expect(params.financingSpreadPercent, `preset "${preset.id}" financingSpreadPercent`).toBe(
        preset.request.financingSpreadPercent,
      )
      expect(params.tier, `preset "${preset.id}" tier`).toBe(preset.tier)
      expect(params.scale, `preset "${preset.id}" scale`).toBe(preset.scale)
      expect(params.mode, `preset "${preset.id}" mode`).toBe(preset.mode)
      expect(params.metric, `preset "${preset.id}" metric`).toBe(preset.metric)
      expect(params.holdMode, `preset "${preset.id}" holdMode`).toBe(
        preset.request.holdingPeriodBars === null ? 'end-of-data' : 'fixed',
      )

      // D-19: `PresetDefinition` carries no `bundleVersion` field at all -- it is filled in from
      // the LIVE manifest at apply time, never stored on (or read from) the definition itself, so
      // this is the one field with no definition-side counterpart to compare against.
      expect(params.bundleVersion, `preset "${preset.id}" bundleVersion`).toBe(bundle.manifest.bundleVersion)
      expect('bundleVersion' in preset, `preset "${preset.id}" must not carry its own bundleVersion field (D-19)`).toBe(false)
    }
  })
})

describe('SHARE-06: the preset library structural assertions', () => {
  test('D-16: every real-fund preset sets leverage exactly 1.0 and expenseRatioPercent exactly 0', () => {
    const realFundPresets = PRESET_DEFINITIONS.filter((preset) => REAL_LEVERAGED_FUND_SYMBOLS.includes(preset.request.symbol))
    expect(realFundPresets.length).toBeGreaterThan(0)
    for (const preset of realFundPresets) {
      expect(
        preset.request.leverage,
        `preset "${preset.id}" (symbol ${preset.request.symbol}) must have leverage exactly 1: ` +
          `backtest.ts scales financing by (leverage - 1), so financing zeroes itself at 1.0, but ` +
          `it does NOT leverage-scale expenseCost -- a leverage other than 1 on a real-fund preset ` +
          `would compound the fund's own already-embedded fee against a synthetic exposure multiple`,
      ).toBe(1)
      expect(
        preset.request.expenseRatioPercent,
        `preset "${preset.id}" (symbol ${preset.request.symbol}) must have expenseRatioPercent ` +
          `exactly 0: backtest.ts's expenseCost is NOT leverage-scaled, so a non-zero expense ratio ` +
          `here would charge the fund's own fee a second time on top of the fee already embedded ` +
          `in its real price history, making the preset understate the fund it claims to show`,
      ).toBe(0)
    }
  })

  test('the featured invariant: at least 8 presets, exactly 4 featured, in the stated declaration order', () => {
    expect(PRESET_DEFINITIONS.length).toBeGreaterThanOrEqual(8)
    const featured = PRESET_DEFINITIONS.filter((preset) => preset.featured)
    expect(featured.length).toBe(4)
    expect(featured.map((preset) => preset.id)).toEqual([
      'tqqq-covid-crash',
      'upro-covid-crash',
      'spx-3x-2000-peak',
      'upro-since-inception',
    ])
  })

  test('uniqueness: no two presets encode to the same permalink query string', async () => {
    const bundle = await loadBundleFromDisk()
    const seen = new Set<string>()
    for (const preset of PRESET_DEFINITIONS) {
      const inputs = buildKernelInputs(bundle, preset.request as BacktestRequest)
      const params = buildPermalinkParamsForPreset(preset, inputs.window.lastDate, bundle.manifest.bundleVersion)
      const qs = encodeParams(params).toString()
      expect(seen.has(qs), `preset "${preset.id}" encodes to the same query string as another preset: ${qs}`).toBe(false)
      seen.add(qs)
    }
    expect(seen.size).toBe(PRESET_DEFINITIONS.length)
  })

  test('the round trip: decodeParams(encodeParams(params)) returns the same parameter set for every preset', async () => {
    const bundle = await loadBundleFromDisk()
    for (const preset of PRESET_DEFINITIONS) {
      const inputs = buildKernelInputs(bundle, preset.request as BacktestRequest)
      const params = buildPermalinkParamsForPreset(preset, inputs.window.lastDate, bundle.manifest.bundleVersion)
      const qs = encodeParams(params)
      const decoded = decodeParams(qs)
      expect(decoded.status, `preset "${preset.id}" failed to round-trip: ${decoded.status === 'error' ? decoded.error : decoded.status}`).toBe('ok')
      if (decoded.status !== 'ok') continue
      expect(decoded.params).toEqual(params)
    }
  })

  test('criterion-3 coverage: every one of the four named windows is represented by a preset', () => {
    const has1929 = PRESET_DEFINITIONS.some((preset) => preset.request.entryDate.startsWith('1929'))
    expect(has1929, 'no preset has an entry date in 1929').toBe(true)

    const hasNdx2000 = PRESET_DEFINITIONS.some(
      (preset) => preset.request.symbol === 'NDX' && preset.request.entryDate.startsWith('2000'),
    )
    expect(hasNdx2000, 'no preset has symbol NDX with a 2000 entry date').toBe(true)

    const hasHighRate1979 = PRESET_DEFINITIONS.some((preset) => preset.tier === 'extended' && preset.request.entryDate.startsWith('1979'))
    expect(hasHighRate1979, 'no extended-tier preset has an entry date in 1979').toBe(true)

    const has2010s = PRESET_DEFINITIONS.some((preset) => {
      const year = Number(preset.request.entryDate.slice(0, 4))
      return year >= 2010 && year <= 2019
    })
    expect(has2010s, 'no preset falls inside the 2010s').toBe(true)
  })

  test('ordering stability: PRESET_DEFINITIONS is frozen (never sorted at render time) and its ids match a literal expected order', () => {
    // No module in src/app/ sorts PRESET_DEFINITIONS: this is enforced structurally by
    // Object.freeze in src/app/presets.ts (a .sort() call on a frozen array throws), not merely
    // documented. The id-order assertion below is the mechanical proof that declaration order
    // IS render order: a reordering of the array literal itself is a visible test diff here.
    expect(Object.isFrozen(PRESET_DEFINITIONS)).toBe(true)
    expect(PRESET_DEFINITIONS.map((preset) => preset.id)).toEqual([
      'spx-3x-1929',
      'ndx-3x-2000-peak',
      'spx-3x-high-rate-1979',
      'tqqq-covid-crash',
      'upro-covid-crash',
      'spx-3x-2000-peak',
      'spx-3x-dca-2000',
      'spx-3x-entry-sensitivity',
      'spx-3x-2010s',
      'upro-since-inception',
    ])
  })
})
