/**
 * tests/kernel/module-boundary.test.ts
 *
 * SIM-10's one-module claim and D-32's fail-loud boundary, each held mechanically by a test that
 * goes red the moment the invariant is violated, not by a comment (03-01-PLAN.md Task 2).
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

import { runBacktest } from '../../src/kernel/backtest.ts'
import type { KernelOutputs, KernelParams, KernelSeries } from '../../src/kernel/backtest.types.ts'
import { buildKernelInputs, loadBundleFromDisk, type BacktestRequest } from '../../src/data/kernel-inputs.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const KERNEL_DIR = path.resolve(__dirname, '../../src/kernel')

/** SIM-10: the only module specifier the kernel is permitted to import. */
const ALLOWED_SPECIFIERS = new Set(['./backtest.types.ts'])

/** Extracts every quoted module specifier from a line beginning with `import`, read at test
 * time so a future violation of SIM-10 turns this test red without any other change. */
function extractImportSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const importRe = /^import[^'"]*['"]([^'"]+)['"]/gm
  let match: RegExpExecArray | null
  while ((match = importRe.exec(source)) !== null) {
    specifiers.push(match[1]!)
  }
  return specifiers
}

function baseKernelInputsRequest(overrides: Partial<BacktestRequest> = {}): BacktestRequest {
  return {
    symbol: 'SPX',
    dividendReinvest: false,
    leverage: 3,
    entryDate: '1990-01-02',
    holdingPeriodBars: 10,
    initialInvestment: 10_000,
    contributionAmount: 0,
    contributionFrequency: 'none',
    expenseRatioPercent: 0.9,
    financingSpreadPercent: 0.5,
    ...overrides,
  }
}

describe('SIM-10: the kernel imports nothing but its own types', () => {
  test('src/kernel/backtest.ts imports only ./backtest.types.ts', () => {
    const source = readFileSync(path.join(KERNEL_DIR, 'backtest.ts'), 'utf-8')
    const specifiers = extractImportSpecifiers(source)
    const disallowed = specifiers.filter((s) => !ALLOWED_SPECIFIERS.has(s))
    expect(disallowed, `disallowed import specifier(s) found in src/kernel/backtest.ts`).toEqual([])
  })

  test('src/kernel/backtest.types.ts imports nothing at all', () => {
    const source = readFileSync(path.join(KERNEL_DIR, 'backtest.types.ts'), 'utf-8')
    const specifiers = extractImportSpecifiers(source)
    expect(specifiers, `unexpected import specifier(s) found in src/kernel/backtest.types.ts`).toEqual([])
  })

  test('src/kernel/backtest.ts declares no top-level mutable binding outside a function body (PERF-02 concurrency backstop)', () => {
    const source = readFileSync(path.join(KERNEL_DIR, 'backtest.ts'), 'utf-8')
    const lines = source.split('\n')
    const offendingLines = lines.filter((line) => /^(export\s+)?(let|var)\s/.test(line))
    expect(offendingLines, 'top-level mutable binding found in src/kernel/backtest.ts').toEqual([])
  })
})

describe('D-32: buildKernelInputs fails loudly on out-of-range parameters', () => {
  test("an entry date before the selected series' firstDate throws, naming the offending date", async () => {
    const bundle = await loadBundleFromDisk()
    expect(() => buildKernelInputs(bundle, baseKernelInputsRequest({ entryDate: '1800-01-02' }))).toThrowError(
      /1800-01-02/,
    )
  })

  test("an entry date after the selected series' lastDate throws, naming the offending date", async () => {
    const bundle = await loadBundleFromDisk()
    expect(() => buildKernelInputs(bundle, baseKernelInputsRequest({ entryDate: '2999-01-01' }))).toThrowError(
      /2999-01-01/,
    )
  })

  test('an entry date exactly at firstDate succeeds', async () => {
    const bundle = await loadBundleFromDisk()
    const priceEntry = bundle.manifest.series.find((s) => s.id === 'SPX/price-return')
    expect(priceEntry).toBeDefined()

    const inputs = buildKernelInputs(
      bundle,
      baseKernelInputsRequest({ entryDate: priceEntry!.firstDate, holdingPeriodBars: 1 }),
    )
    expect(inputs.window.barCount).toBe(1)
  })

  test('a holdingPeriodBars one larger than the remaining supported bars throws while the exact remaining count succeeds', async () => {
    const bundle = await loadBundleFromDisk()
    const request = baseKernelInputsRequest({ holdingPeriodBars: null })

    const maxWindow = buildKernelInputs(bundle, request)
    const maxBars = maxWindow.window.barCount

    const exact = buildKernelInputs(bundle, { ...request, holdingPeriodBars: maxBars })
    expect(exact.window.barCount).toBe(maxBars)

    expect(() => buildKernelInputs(bundle, { ...request, holdingPeriodBars: maxBars + 1 })).toThrowError(
      new RegExp(String(maxBars + 1)),
    )
  })
})

describe('runBacktest: pre-loop length asserts', () => {
  function makeSeries(length: number): KernelSeries {
    return {
      returns: new Float64Array(length),
      shortRate: new Float64Array(length),
      calendarDaysElapsed: new Int32Array(length),
      contributionFlags: new Uint8Array(length),
    }
  }

  function makeParams(): KernelParams {
    return {
      leverage: 3,
      initialInvestment: 10_000,
      contributionAmount: 0,
      financingSpread: 0,
      expenseRatio: 0,
      longGapMinDays: 6,
    }
  }

  test('an undersized outValue throws a message containing both lengths', () => {
    const series = makeSeries(5)
    const outputs: KernelOutputs = {
      outValue: new Float64Array(3),
      outRuined: new Uint8Array(5),
      outLongGap: new Uint8Array(5),
    }

    let thrown: unknown
    try {
      runBacktest(makeParams(), series, outputs)
    } catch (err) {
      thrown = err
    }

    expect(thrown).toBeInstanceOf(Error)
    const message = (thrown as Error).message
    expect(message).toContain('5')
    expect(message).toContain('3')
  })
})
