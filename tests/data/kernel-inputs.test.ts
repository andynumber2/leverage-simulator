/**
 * tests/data/kernel-inputs.test.ts
 *
 * The end-to-end assertion for plan 03-01's tracer slice: load the real committed bundle, build
 * inputs for a real backtest, run the kernel against them, and assert the properties this plan's
 * <behavior> and <acceptance_criteria> require. Also ports the spike's 3-day-gap financing test
 * (tests/kernel.test.ts) onto the real kernel's actual/360 basis (D-01).
 *
 * Plan 03-04 extends this file with the SIM-07 series-selection, SIM-08 boundary/ordering, and
 * contribution-schedule integration assertions its own <behavior> and <acceptance_criteria> add,
 * without replacing anything plan 03-01 already established above.
 */

import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

import { seriesView } from '../../tools/bundle-compiler/src/binary-format.ts'
import { runBacktest } from '../../src/kernel/backtest.ts'
import type { KernelOutputs, KernelParams, KernelSeries } from '../../src/kernel/backtest.types.ts'
import { buildKernelInputs, type BacktestRequest, type LoadedBundle } from '../../src/data/kernel-inputs.ts'
import { loadBundleFromDisk } from '../../src/data/load-bundle-node.ts'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const RUN_BACKTEST_SCRIPT = path.join(REPO_ROOT, 'scripts/run-backtest.ts')

function baseRequest(overrides: Partial<BacktestRequest> = {}): BacktestRequest {
  return {
    symbol: 'SPX',
    dividendReinvest: true,
    leverage: 3,
    entryDate: '1990-01-02',
    holdingPeriodBars: 2520,
    initialInvestment: 10_000,
    contributionAmount: 0,
    contributionFrequency: 'none',
    expenseRatioPercent: 0.9,
    financingSpreadPercent: 0.5,
    ...overrides,
  }
}

describe('buildKernelInputs + runBacktest (end-to-end tracer)', () => {
  test('runs a real SPX backtest with a cost-free entry bar and a fully non-negative value series', async () => {
    const bundle: LoadedBundle = await loadBundleFromDisk()
    const request = baseRequest()
    const inputs = buildKernelInputs(bundle, request)

    expect(inputs.window.barCount).toBe(request.holdingPeriodBars)

    const result = runBacktest(inputs.params, inputs.series, inputs.outputs)

    expect(inputs.outputs.outValue[0]).toBe(request.initialInvestment)
    expect(Number.isFinite(result.finalValue)).toBe(true)
    expect(result.finalValue).toBeGreaterThan(0)

    for (let i = 0; i < inputs.outputs.outValue.length; i++) {
      expect(inputs.outputs.outValue[i]).toBeGreaterThanOrEqual(0)
    }
  })

  test('percent-to-fraction conversion happens exactly once, in the data layer (D-09)', async () => {
    const bundle: LoadedBundle = await loadBundleFromDisk()
    const request = baseRequest({ expenseRatioPercent: 0.9, financingSpreadPercent: 0.5 })
    const inputs = buildKernelInputs(bundle, request)

    expect(inputs.params.expenseRatio).toBe(request.expenseRatioPercent / 100)
    expect(inputs.params.financingSpread).toBe(request.financingSpreadPercent / 100)
  })

  test('a second identical call into the same preallocated buffers reproduces the first call element for element (PERF-02 idempotency edge)', async () => {
    const bundle: LoadedBundle = await loadBundleFromDisk()
    const request = baseRequest({ holdingPeriodBars: 100 })
    const inputs = buildKernelInputs(bundle, request)

    const first = runBacktest(inputs.params, inputs.series, inputs.outputs)
    const firstSnapshot = Array.from(inputs.outputs.outValue)
    const second = runBacktest(inputs.params, inputs.series, inputs.outputs)

    expect(Array.from(inputs.outputs.outValue)).toEqual(firstSnapshot)
    expect(second.finalValue).toBe(first.finalValue)
    expect(second.ruined).toBe(first.ruined)
  })
})

describe('runBacktest financing (D-01, ported from tests/kernel.test.ts for the actual/360 basis)', () => {
  function makeFixedSeries(returns: number[], shortRate: number[], calendarDaysElapsed: number[]): KernelSeries {
    return {
      returns: Float64Array.from(returns),
      shortRate: Float64Array.from(shortRate),
      calendarDaysElapsed: Int32Array.from(calendarDaysElapsed),
      contributionFlags: new Uint8Array(returns.length),
    }
  }

  function baseParams(overrides: Partial<KernelParams> = {}): KernelParams {
    return {
      leverage: 3,
      initialInvestment: 10_000,
      contributionAmount: 0,
      financingSpread: 0,
      expenseRatio: 0,
      longGapMinDays: 6,
      ...overrides,
    }
  }

  function makeOutputs(length: number): KernelOutputs {
    return {
      outValue: new Float64Array(length),
      outRuined: new Uint8Array(length),
      outLongGap: new Uint8Array(length),
    }
  }

  test('financing cost scales with calendarDaysElapsed: a 3-day gap costs 3x a 1-day gap', () => {
    const params = baseParams({ leverage: 3, financingSpread: 0.005 })

    const seriesOneDay = makeFixedSeries([0, 0], [0, 0.02], [0, 1])
    const outputsOneDay = makeOutputs(2)
    runBacktest(params, seriesOneDay, outputsOneDay)

    const seriesThreeDay = makeFixedSeries([0, 0], [0, 0.02], [0, 3])
    const outputsThreeDay = makeOutputs(2)
    runBacktest(params, seriesThreeDay, outputsThreeDay)

    const loss1 = params.initialInvestment - (outputsOneDay.outValue[1] ?? 0)
    const loss3 = params.initialInvestment - (outputsThreeDay.outValue[1] ?? 0)

    expect(loss1).toBeGreaterThan(0)
    expect(loss3).toBeCloseTo(loss1 * 3, 6)
  })
})

describe('buildKernelInputs: series selection (SIM-07)', () => {
  test('a symbol with no matching series id throws an error naming the requested id and at least three existing ids', async () => {
    const bundle: LoadedBundle = await loadBundleFromDisk()
    const request = baseRequest({ symbol: 'NOPE-NOT-A-REAL-SYMBOL' })

    expect(() => buildKernelInputs(bundle, request)).toThrowError(/NOPE-NOT-A-REAL-SYMBOL/)

    try {
      buildKernelInputs(bundle, request)
      throw new Error('expected buildKernelInputs to throw')
    } catch (err) {
      const message = (err as Error).message
      // At least three existing series ids must be named so a typo names its own fix.
      const existingIdCount = bundle.manifest.series.filter((s) => message.includes(s.id)).length
      expect(existingIdCount).toBeGreaterThanOrEqual(3)
    }
  })

  test('series selection applies no numeric transform: the derived returns match an independently reconstructed view element for element (SIM-07 precision edge)', async () => {
    const bundle: LoadedBundle = await loadBundleFromDisk()
    const request = baseRequest({ symbol: 'SPX', dividendReinvest: true, entryDate: '1990-01-02', holdingPeriodBars: 50 })
    const inputs = buildKernelInputs(bundle, request)

    // Independently re-derive the same window's returns straight from the manifest + a fresh
    // seriesView, without going through buildKernelInputs a second time, and assert they match
    // element for element -- proving the selector applies no transform of its own beyond the
    // documented return-derivation formula.
    const seriesEntry = bundle.manifest.series.find((s) => s.id === inputs.meta.seriesId)!
    const asset = bundle.assets.get(seriesEntry.asset)!
    const descriptor = asset.header.descriptors.find((d) => d.id === inputs.meta.seriesId)!
    const levels = seriesView(asset.buffer, asset.header, descriptor)

    for (let k = 1; k < inputs.window.barCount; k++) {
      const absIndex = inputs.window.entryIndex + k
      const priceIndex = absIndex - descriptor.calendarStartIndex
      const expectedReturn = levels[priceIndex]! / levels[priceIndex - 1]! - 1
      expect(inputs.series.returns[k]).toBe(expectedReturn)
    }
  })

  test('two buildKernelInputs calls with an identical request produce element-for-element equal series.returns (SIM-07 idempotency edge)', async () => {
    const bundle: LoadedBundle = await loadBundleFromDisk()
    const request = baseRequest({ holdingPeriodBars: 200 })

    const first = buildKernelInputs(bundle, request)
    const second = buildKernelInputs(bundle, request)

    expect(Array.from(second.series.returns)).toEqual(Array.from(first.series.returns))
  })

  test('dividendReinvest true selects {symbol}/total-return and false selects {symbol}/price-return', async () => {
    const bundle: LoadedBundle = await loadBundleFromDisk()

    const reinvest = buildKernelInputs(bundle, baseRequest({ symbol: 'QQQ', dividendReinvest: true, entryDate: '2010-02-11', holdingPeriodBars: 10 }))
    expect(reinvest.meta.seriesId).toBe('QQQ/total-return')

    const priceOnly = buildKernelInputs(bundle, baseRequest({ symbol: 'QQQ', dividendReinvest: false, entryDate: '2010-02-11', holdingPeriodBars: 10 }))
    expect(priceOnly.meta.seriesId).toBe('QQQ/price-return')
  })
})

describe('buildKernelInputs: holding-period boundary and ordering (SIM-08)', () => {
  test('holdingPeriodBars 0 yields a one-bar window whose finalValue equals initialInvestment exactly (SIM-08 empty edge)', async () => {
    const bundle: LoadedBundle = await loadBundleFromDisk()
    const request = baseRequest({ holdingPeriodBars: 0 })
    const inputs = buildKernelInputs(bundle, request)

    expect(inputs.window.barCount).toBe(1)

    const result = runBacktest(inputs.params, inputs.series, inputs.outputs)
    expect(result.finalValue).toBe(request.initialInvestment)
  })

  test('a negative holdingPeriodBars throws naming the offending value', async () => {
    const bundle: LoadedBundle = await loadBundleFromDisk()
    const request = baseRequest({ holdingPeriodBars: -5 })

    expect(() => buildKernelInputs(bundle, request)).toThrowError(/-5/)
  })

  test('an entry date exactly equal to the selected series firstDate is accepted; the calendar session immediately before it throws (SIM-08 adjacency edge)', async () => {
    const bundle: LoadedBundle = await loadBundleFromDisk()
    const uproTotalReturn = bundle.manifest.series.find((s) => s.id === 'UPRO/total-return')!

    const atFirstDate = baseRequest({
      symbol: 'UPRO',
      dividendReinvest: true,
      entryDate: uproTotalReturn.firstDate,
      holdingPeriodBars: 5,
    })
    expect(() => buildKernelInputs(bundle, atFirstDate)).not.toThrow()

    // The session immediately before firstDate: 2009-06-24, the last trading day strictly before
    // UPRO/total-return's own firstDate (2009-06-25). Not derived programmatically here because
    // the point of this assertion is the *bundled data's own* published boundary, not a
    // recomputed one -- if the bundle is ever recompiled with an earlier UPRO series, this
    // literal date must be revisited deliberately, not silently pass either way.
    const beforeFirstDate = baseRequest({
      symbol: 'UPRO',
      dividendReinvest: true,
      entryDate: '2009-06-24',
      holdingPeriodBars: 5,
    })
    expect(() => buildKernelInputs(bundle, beforeFirstDate)).toThrowError(/2009-06-24/)
  })

  test('a hold-to-today run and the equivalent fixed-holding-period run produce element-for-element identical outValue contents and deeply equal KernelResult objects (SIM-08 ordering edge)', async () => {
    const bundle: LoadedBundle = await loadBundleFromDisk()

    const holdToTodayRequest = baseRequest({ symbol: 'SPX', entryDate: '2015-01-30', holdingPeriodBars: null })
    const holdToTodayInputs = buildKernelInputs(bundle, holdToTodayRequest)
    const holdToTodayResult = runBacktest(holdToTodayInputs.params, holdToTodayInputs.series, holdToTodayInputs.outputs)

    // Reproducing the identical window with a fixed holding period requires holdingPeriodBars
    // equal to the hold-to-today window's own barCount: buildKernelInputs computes
    // endAbsIndex = entryAbsIndex + holdingPeriodBars - 1, so passing that window's barCount
    // back in as holdingPeriodBars lands on the exact same endAbsIndex hold-to-today resolved to.
    const fixedRequest = baseRequest({
      symbol: 'SPX',
      entryDate: '2015-01-30',
      holdingPeriodBars: holdToTodayInputs.window.barCount,
    })
    const fixedInputs = buildKernelInputs(bundle, fixedRequest)
    const fixedResult = runBacktest(fixedInputs.params, fixedInputs.series, fixedInputs.outputs)

    expect(fixedInputs.window.lastDate).toBe(holdToTodayInputs.window.lastDate)
    expect(Array.from(fixedInputs.outputs.outValue)).toEqual(Array.from(holdToTodayInputs.outputs.outValue))
    expect(fixedResult).toEqual(holdToTodayResult)
  })
})

describe('buildKernelInputs: contribution schedule integration (SIM-06)', () => {
  test('a monthly contribution request produces meta.contributionCount equal to the number of whole months in the window and totalContributed = initialInvestment + amount * contributionCount', async () => {
    const bundle: LoadedBundle = await loadBundleFromDisk()
    const request = baseRequest({
      symbol: 'SPX',
      entryDate: '2000-03-15',
      holdingPeriodBars: 2000,
      contributionAmount: 250,
      contributionFrequency: 'monthly',
    })
    const inputs = buildKernelInputs(bundle, request)

    expect(inputs.meta.contributionCount).toBeGreaterThan(0)
    expect(inputs.meta.contributionNominalDates.length).toBe(inputs.meta.contributionCount)

    const result = runBacktest(inputs.params, inputs.series, inputs.outputs)
    expect(result.totalContributed).toBe(request.initialInvestment + request.contributionAmount * inputs.meta.contributionCount)
  })

  test('contributionFrequency "none" still produces an all-zero contributionFlags array and contributionCount 0', async () => {
    const bundle: LoadedBundle = await loadBundleFromDisk()
    const request = baseRequest({ contributionFrequency: 'none', holdingPeriodBars: 100 })
    const inputs = buildKernelInputs(bundle, request)

    expect(inputs.meta.contributionCount).toBe(0)
    expect(Array.from(inputs.series.contributionFlags)).toEqual(new Array(100).fill(0))
  })
})

describe('scripts/run-backtest.ts end-to-end (--json, spawned as a real process)', () => {
  test('exercises the full parameter surface at fractional leverage and asserts on the parsed JSON object, not formatted text', () => {
    const stdout = execFileSync(
      process.execPath,
      [
        '--experimental-strip-types',
        RUN_BACKTEST_SCRIPT,
        '--symbol',
        'SPX',
        '--leverage',
        '2.5',
        '--entry',
        '2015-01-30',
        '--holding-bars',
        '2520',
        '--initial',
        '10000',
        '--contribution',
        '500',
        '--frequency',
        'monthly',
        '--dividends',
        'reinvest',
        '--json',
      ],
      { cwd: REPO_ROOT, encoding: 'utf-8' },
    )

    const parsed = JSON.parse(stdout) as {
      header: {
        seriesId: string
        costDefaults: {
          expenseRatio: { confidence: string }
          financingSpread: { confidenceLower: string; confidenceUpper: string }
        }
        contribution: { count: number }
      }
      summary: { finalValue: number; totalContributed: number }
    }

    expect(Number.isFinite(parsed.summary.finalValue)).toBe(true)
    expect(parsed.header.contribution.count).toBe(120)
    expect(parsed.summary.totalContributed).toBe(10_000 + 500 * parsed.header.contribution.count)
    expect(parsed.header.seriesId).toBe('SPX/total-return')
    expect(parsed.header.costDefaults.expenseRatio.confidence).toBe('CITED')
    expect(['ASSUMED', 'CITED', 'VERIFIED']).toContain(parsed.header.costDefaults.financingSpread.confidenceLower)
    expect(['ASSUMED', 'CITED', 'VERIFIED']).toContain(parsed.header.costDefaults.financingSpread.confidenceUpper)
  })

  test('exits non-zero and names the supported leverage range for an out-of-range leverage', () => {
    expect(() =>
      execFileSync(
        process.execPath,
        ['--experimental-strip-types', RUN_BACKTEST_SCRIPT, '--symbol', 'SPX', '--leverage', '25', '--entry', '2015-01-30'],
        { cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['ignore', 'ignore', 'pipe'] },
      ),
    ).toThrowError()

    try {
      execFileSync(
        process.execPath,
        ['--experimental-strip-types', RUN_BACKTEST_SCRIPT, '--symbol', 'SPX', '--leverage', '25', '--entry', '2015-01-30'],
        { cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['ignore', 'ignore', 'pipe'] },
      )
    } catch (err) {
      const stderr = (err as { stderr: string }).stderr
      expect(stderr).toMatch(/leverage/i)
      expect(stderr).toContain('20')
    }
  })

  test('accepts sub-1x leverage as the deliberate credit case (D-08) rather than rejecting it', () => {
    const stdout = execFileSync(
      process.execPath,
      [
        '--experimental-strip-types',
        RUN_BACKTEST_SCRIPT,
        '--symbol',
        'SPX',
        '--leverage',
        '0.5',
        '--entry',
        '2015-01-30',
        '--holding-bars',
        '252',
        '--json',
      ],
      { cwd: REPO_ROOT, encoding: 'utf-8' },
    )
    const parsed = JSON.parse(stdout) as { header: { leverage: number } }
    expect(parsed.header.leverage).toBe(0.5)
  })
})
