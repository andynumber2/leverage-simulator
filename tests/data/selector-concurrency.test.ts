/**
 * tests/data/selector-concurrency.test.ts
 *
 * Closes the one verification gap 03-VERIFICATION.md left open: 03-04-PLAN.md's SIM-07
 * concurrency truth was marked `verification: backstop`, meaning it abstains to human review
 * rather than passing silently without evidence, and the phase shipped no test for it.
 *
 * The truth, verbatim from that plan:
 *
 *   "The series selector performs no I/O and holds no mutable state after `loadBundleFromDisk`
 *    returns, so parallel callers over one `LoadedBundle` observe the same views (SIM-07
 *    concurrency edge)."
 *
 * It is held here three ways rather than by inspection. Two are source-text assertions, so a
 * future edit that introduces module state or a synchronous read turns this file red on its own;
 * one is behavioural, so an actual shared-state leak between concurrent callers is caught even if
 * it arrives through a route the source scans do not model.
 *
 * This matters beyond tidiness: Phase 7's sweep runs ~10,000 backtests across a Worker pool over
 * one decoded bundle. If `buildKernelInputs` held so much as one cached scalar between calls, that
 * sweep would produce results that depend on call order, and the heatmap would be quietly wrong in
 * a way no single-backtest test could surface.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

import { buildKernelInputs, type BacktestRequest } from '../../src/data/kernel-inputs.ts'
import { loadBundleFromDisk } from '../../src/data/load-bundle-node.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const KERNEL_INPUTS_PATH = path.resolve(__dirname, '../../src/data/kernel-inputs.ts')

function readSelectorSource(): string {
  return readFileSync(KERNEL_INPUTS_PATH, 'utf-8')
}

/** Strips line and block comments so a prose mention of `let` or `readFileSync` in a doc comment
 * cannot fail the source scans below, and so commenting code out genuinely removes it. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

function baseRequest(overrides: Partial<BacktestRequest> = {}): BacktestRequest {
  return {
    symbol: 'SPX',
    dividendReinvest: false,
    leverage: 3,
    entryDate: '1990-01-02',
    holdingPeriodBars: 250,
    initialInvestment: 10_000,
    contributionAmount: 0,
    contributionFrequency: 'none',
    expenseRatioPercent: 0.9,
    financingSpreadPercent: 0.5,
    ...overrides,
  }
}

/** A deliberately varied request set: different symbols, dividend toggles, leverages, entry dates,
 * holding modes and contribution schedules, so any cached-between-calls state has something to be
 * wrong about. A selector that memoized on symbol alone, for instance, would return SPX views for
 * the NDX requests and fail the comparison below. */
function varietyRequests(): BacktestRequest[] {
  return [
    baseRequest(),
    baseRequest({ dividendReinvest: true }),
    baseRequest({ symbol: 'NDX', entryDate: '1999-03-04', holdingPeriodBars: 300 }),
    baseRequest({ symbol: 'NDX', dividendReinvest: true, entryDate: '2000-01-03', holdingPeriodBars: 120 }),
    baseRequest({ leverage: 1 }),
    baseRequest({ leverage: 0.5, entryDate: '2005-01-03' }),
    baseRequest({ leverage: 20, entryDate: '2010-01-04', holdingPeriodBars: 60 }),
    baseRequest({ contributionAmount: 500, contributionFrequency: 'monthly', holdingPeriodBars: 500 }),
    baseRequest({ contributionAmount: 100, contributionFrequency: 'quarterly', entryDate: '1995-01-03' }),
    baseRequest({ holdingPeriodBars: null, entryDate: '2015-01-02' }),
  ]
}

describe('SIM-07 concurrency edge: the series selector holds no mutable state after load', () => {
  test('kernel-inputs.ts declares no module-level mutable binding', () => {
    const source = stripComments(readSelectorSource())
    // A top-level `let`/`var` is the shape a cache between calls would take. Function-local
    // `let` is fine and common, so this only matches declarations at column 0.
    const offenders = source.split('\n').filter((line) => /^(export\s+)?(let|var)\s/.test(line))
    expect(
      offenders,
      `src/data/kernel-inputs.ts must declare no module-level mutable binding, because one would ` +
        `be shared by every concurrent caller over the same LoadedBundle. Offending line(s):\n` +
        offenders.join('\n'),
    ).toEqual([])
  })

  test('buildKernelInputs performs no I/O: the module imports no synchronous filesystem API and the selector is not async', () => {
    const source = stripComments(readSelectorSource())

    // loadBundleFromDisk legitimately awaits node:fs/promises. The selector must not read at all,
    // and being synchronous it could only do so through a *Sync API -- so the absence of any
    // synchronous filesystem call in the whole module is what proves it.
    const syncIoCalls = source.match(/\b(readFileSync|readdirSync|existsSync|statSync|openSync)\b/g) ?? []
    expect(
      syncIoCalls,
      'src/data/kernel-inputs.ts must contain no synchronous filesystem call: buildKernelInputs is ' +
        'synchronous, so a *Sync API is the only way it could perform I/O.',
    ).toEqual([])

    expect(
      /export\s+(async\s+)?function\s+buildKernelInputs/.test(source),
      'buildKernelInputs must be declared as a plain exported function so this test can assert on it',
    ).toBe(true)
    expect(
      /export\s+async\s+function\s+buildKernelInputs/.test(source),
      'buildKernelInputs must NOT be async: an async selector could await I/O, which SIM-07 forbids ' +
        'after loadBundleFromDisk has returned',
    ).toBe(false)
  })

  test('concurrent callers over one LoadedBundle observe exactly what sequential callers observe', async () => {
    const bundle = await loadBundleFromDisk()
    const requests = varietyRequests()

    // Sequential reference first, on its own bundle handle, so the concurrent run below cannot
    // have influenced it.
    const sequential = requests.map((r) => buildKernelInputs(bundle, r))

    // Now interleave the same requests through the microtask queue, in a different order, over
    // the SAME LoadedBundle. Any state cached on the bundle or in the module between calls shows
    // up as a mismatch against the sequential reference.
    const shuffled = requests.map((r, i) => ({ r, i })).sort((a, b) => ((a.i * 7) % 10) - ((b.i * 7) % 10))
    const concurrentPairs = await Promise.all(
      shuffled.map(async ({ r, i }) => {
        await Promise.resolve()
        const built = buildKernelInputs(bundle, r)
        await Promise.resolve()
        return { i, built }
      }),
    )

    expect(concurrentPairs.length).toBe(requests.length)

    for (const { i, built } of concurrentPairs) {
      const ref = sequential[i]!
      const label = `request ${i} (${requests[i]!.symbol}, dividendReinvest=${requests[i]!.dividendReinvest})`

      expect(built.meta.seriesId, `${label}: seriesId`).toBe(ref.meta.seriesId)
      expect(built.window.entryIndex, `${label}: entryIndex`).toBe(ref.window.entryIndex)
      expect(built.window.barCount, `${label}: barCount`).toBe(ref.window.barCount)
      expect(built.window.firstDate, `${label}: firstDate`).toBe(ref.window.firstDate)
      expect(built.window.lastDate, `${label}: lastDate`).toBe(ref.window.lastDate)
      expect(built.params, `${label}: params`).toEqual(ref.params)

      // The views themselves, element for element. This is the assertion that would catch a
      // selector handing two callers different slices of the same buffer.
      expect(Array.from(built.series.returns), `${label}: returns`).toEqual(Array.from(ref.series.returns))
      expect(Array.from(built.series.shortRate), `${label}: shortRate`).toEqual(Array.from(ref.series.shortRate))
      expect(
        Array.from(built.series.calendarDaysElapsed),
        `${label}: calendarDaysElapsed`,
      ).toEqual(Array.from(ref.series.calendarDaysElapsed))
      expect(
        Array.from(built.series.contributionFlags),
        `${label}: contributionFlags`,
      ).toEqual(Array.from(ref.series.contributionFlags))
    }
  })

  test('each call returns its own output buffers, so concurrent callers cannot scribble on each other', async () => {
    const bundle = await loadBundleFromDisk()
    const request = baseRequest()

    const a = buildKernelInputs(bundle, request)
    const b = buildKernelInputs(bundle, request)

    expect(a.outputs.outValue, 'two calls must not share one outValue buffer').not.toBe(b.outputs.outValue)
    expect(a.outputs.outRuined, 'two calls must not share one outRuined buffer').not.toBe(b.outputs.outRuined)
    expect(a.outputs.outLongGap, 'two calls must not share one outLongGap buffer').not.toBe(b.outputs.outLongGap)

    // Writing through one call's buffer must leave the other's untouched.
    a.outputs.outValue[0] = 123456
    expect(b.outputs.outValue[0], "a write through one call's buffer must not be visible in another's").not.toBe(
      123456,
    )
  })
})
