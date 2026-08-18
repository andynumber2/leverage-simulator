/**
 * scripts/run-backtest.ts
 *
 * ROADMAP criterion 4's one-shot end-to-end runner: loads the compiled bundle, resolves a
 * backtest request through the data layer, runs the kernel, and prints a dated equity curve plus
 * a summary line. Exercises the full parameter surface this plan defines; `--frequency` values
 * other than `none` are rejected loudly by `buildKernelInputs` (plan 03-04's gap, not a silent
 * no-op here).
 *
 * `--expense-ratio` and `--financing-spread` default to PROJECT.md's placeholder figures (0.90%
 * and 0.50%), labelled as such in the printed header. Plan 03-04 repoints these defaults at the
 * sourced, cited constants from plan 03-03.
 */

import { parseArgs } from 'node:util'

import { fromDaysSinceEpoch } from '../tools/bundle-compiler/src/calendar.ts'
import { runBacktest } from '../src/kernel/backtest.ts'
import { buildKernelInputs, loadBundleFromDisk, type BacktestRequest } from '../src/data/kernel-inputs.ts'

const USAGE =
  'usage: run-backtest --entry <ISO date> [--symbol SPX] [--leverage 3] [--holding-bars N] ' +
  '[--initial 10000] [--contribution 0] [--frequency none] [--dividends reinvest|price] ' +
  '[--expense-ratio 0.90] [--financing-spread 0.50] [--print head-tail|all|<N>]'

const CONTRIBUTION_FREQUENCIES = new Set(['none', 'daily', 'monthly', 'quarterly', 'yearly'])

function parseDividends(value: string): boolean {
  if (value === 'reinvest') return true
  if (value === 'price') return false
  throw new Error(`run-backtest: --dividends must be "reinvest" or "price", got "${value}"`)
}

function parseFrequency(value: string): BacktestRequest['contributionFrequency'] {
  if (!CONTRIBUTION_FREQUENCIES.has(value)) {
    throw new Error(
      `run-backtest: --frequency must be one of ${Array.from(CONTRIBUTION_FREQUENCIES).join(', ')}, got "${value}"`,
    )
  }
  return value as BacktestRequest['contributionFrequency']
}

function datesForWindow(calendar: Int32Array, entryIndex: number, barCount: number): string[] {
  const dates: string[] = []
  for (let k = 0; k < barCount; k++) {
    const days = calendar[entryIndex + k]
    if (days === undefined) {
      throw new Error(`run-backtest: calendar index ${entryIndex + k} is out of range`)
    }
    dates.push(fromDaysSinceEpoch(days))
  }
  return dates
}

function printLine(dates: string[], outValue: Float64Array, i: number): void {
  process.stdout.write(`${dates[i]} ${(outValue[i] ?? 0).toFixed(2)}\n`)
}

function printEquityCurve(dates: string[], outValue: Float64Array, mode: string): void {
  const n = dates.length

  if (mode === 'all') {
    for (let i = 0; i < n; i++) printLine(dates, outValue, i)
    return
  }

  if (mode === 'head-tail') {
    const headCount = Math.min(5, n)
    for (let i = 0; i < headCount; i++) printLine(dates, outValue, i)
    if (n > 10) {
      process.stdout.write('...\n')
    }
    const tailStart = Math.max(headCount, n - 5)
    for (let i = tailStart; i < n; i++) printLine(dates, outValue, i)
    return
  }

  const count = Number(mode)
  if (Number.isFinite(count) && count > 0) {
    const limit = Math.min(Math.trunc(count), n)
    for (let i = 0; i < limit; i++) printLine(dates, outValue, i)
    return
  }

  throw new Error(`run-backtest: unrecognized --print mode "${mode}" (expected "head-tail", "all", or an integer)`)
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      symbol: { type: 'string', default: 'SPX' },
      leverage: { type: 'string', default: '3' },
      entry: { type: 'string' },
      'holding-bars': { type: 'string' },
      initial: { type: 'string', default: '10000' },
      contribution: { type: 'string', default: '0' },
      frequency: { type: 'string', default: 'none' },
      dividends: { type: 'string', default: 'reinvest' },
      'expense-ratio': { type: 'string', default: '0.90' },
      'financing-spread': { type: 'string', default: '0.50' },
      print: { type: 'string', default: 'head-tail' },
    },
    strict: true,
    allowPositionals: false,
  })

  if (values.entry === undefined) {
    process.stderr.write(`run-backtest: --entry is required\n${USAGE}\n`)
    process.exitCode = 1
    return
  }

  const request: BacktestRequest = {
    symbol: values.symbol as string,
    dividendReinvest: parseDividends(values.dividends as string),
    leverage: Number(values.leverage),
    entryDate: values.entry,
    holdingPeriodBars: values['holding-bars'] !== undefined ? Number(values['holding-bars']) : null,
    initialInvestment: Number(values.initial),
    contributionAmount: Number(values.contribution),
    contributionFrequency: parseFrequency(values.frequency as string),
    expenseRatioPercent: Number(values['expense-ratio']),
    financingSpreadPercent: Number(values['financing-spread']),
  }

  const bundle = await loadBundleFromDisk()
  const inputs = buildKernelInputs(bundle, request)
  const result = runBacktest(inputs.params, inputs.series, inputs.outputs)

  process.stdout.write(`run-backtest: series=${inputs.meta.seriesId}\n`)
  process.stdout.write(`run-backtest: bundleVersion=${inputs.meta.bundleVersion}\n`)
  process.stdout.write(
    `run-backtest: window=${inputs.window.firstDate}..${inputs.window.lastDate} (${inputs.window.barCount} bars)\n`,
  )
  process.stdout.write(`run-backtest: truncatedForRateCoverage=${inputs.meta.truncatedForRateCoverage}\n`)
  process.stdout.write(`run-backtest: leverage=${inputs.params.leverage}\n`)
  process.stdout.write(`run-backtest: initialInvestment=${inputs.params.initialInvestment}\n`)
  process.stdout.write(
    `run-backtest: expenseRatio=${inputs.params.expenseRatio} (actual/365 day-count basis; PROJECT.md placeholder default unless --expense-ratio was passed)\n`,
  )
  process.stdout.write(
    `run-backtest: financingSpread=${inputs.params.financingSpread} (actual/360 day-count basis; PROJECT.md placeholder default unless --financing-spread was passed)\n`,
  )

  const dates = datesForWindow(bundle.calendar, inputs.window.entryIndex, inputs.window.barCount)
  printEquityCurve(dates, inputs.outputs.outValue, values.print as string)

  process.stdout.write(
    `run-backtest: summary finalValue=${result.finalValue} ruined=${result.ruined} ` +
      `ruinBarIndex=${result.ruinBarIndex} totalContributed=${result.totalContributed} ` +
      `droppedContributionsTotal=${result.droppedContributionsTotal} longGapBarCount=${result.longGapBarCount} ` +
      `barCount=${result.barCount}\n`,
  )
}

main().catch((err: unknown) => {
  process.stderr.write(`run-backtest: ${(err as Error).message}\n`)
  process.exitCode = 1
})
