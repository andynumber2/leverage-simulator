/**
 * scripts/run-backtest.ts
 *
 * ROADMAP criterion 4's one-shot end-to-end runner: loads the compiled bundle, resolves a
 * backtest request through the data layer, runs the kernel, and prints a dated equity curve plus
 * a summary line. Exercises the full parameter surface this plan defines: fractional leverage,
 * an initial investment plus a calendar-anchored recurring contribution at any supported
 * frequency, the dividend-reinvest toggle, both holding modes (fixed period or hold-to-today),
 * and both cost parameters -- defaulting to plan `03-03`'s sourced, cited constants when not
 * passed on the command line.
 *
 * `--expense-ratio` and `--financing-spread` default to `GENERIC_3X_EXPENSE_RATIO` and
 * `FINANCING_SPREAD_DEFAULT` from `src/validation/cost-parameters.ts` (SIM-09, D-16); the printed
 * header always names each constant and its confidence tag, and prints `FINANCING_SPREAD_RANGE`'s
 * full band, whether or not the default was actually used for this run (D-18: the bounds are the
 * sensitivity story, never a hidden knob).
 */

import { parseArgs } from 'node:util'

import { fromDaysSinceEpoch } from '../tools/bundle-compiler/src/calendar.ts'
import { runBacktest } from '../src/kernel/backtest.ts'
import { buildKernelInputs, type BacktestRequest } from '../src/data/kernel-inputs.ts'
import { loadBundleFromDisk } from '../src/data/load-bundle-node.ts'
import {
  COST_PARAMETERS,
  FINANCING_SPREAD_DEFAULT,
  FINANCING_SPREAD_RANGE,
  GENERIC_3X_EXPENSE_RATIO,
} from '../src/validation/cost-parameters.ts'

const USAGE =
  'usage: run-backtest --entry <ISO date> [--symbol SPX] [--leverage 3] [--holding-bars N] ' +
  '[--initial 10000] [--contribution 0] [--frequency none] [--dividends reinvest|price] ' +
  '[--expense-ratio <percent>] [--financing-spread <percent>] [--print head-tail|all|<N>] [--json]'

const CONTRIBUTION_FREQUENCIES = new Set(['none', 'daily', 'monthly', 'quarterly', 'yearly'])

const MIN_LEVERAGE = 0 // exclusive: leverage must be strictly greater than 0
const MAX_LEVERAGE = 20 // inclusive (SIM-01: 1x through 20x, fractional allowed; sub-1x is a
// deliberate credit case per D-08, so the accepted band is (0, 20], not [1, 20])

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

/** First three and last three entries of `dates`, deduplicated when the array has 6 or fewer
 * entries total (so a short schedule isn't printed twice). Used by both the formatted header and
 * the `--json` output so a user can check the resolved schedule by eye against what was asked
 * for, without printing every contribution date in a multi-decade run. */
function headTailDates(dates: readonly string[]): { head: string[]; tail: string[] } {
  if (dates.length <= 6) {
    return { head: Array.from(dates), tail: [] }
  }
  return { head: dates.slice(0, 3), tail: dates.slice(-3) }
}

interface CostDefaultInfo {
  provided: boolean
  percent: number
  fraction: number
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
      'expense-ratio': { type: 'string' },
      'financing-spread': { type: 'string' },
      print: { type: 'string', default: 'head-tail' },
      json: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  })

  if (values.entry === undefined) {
    process.stderr.write(`run-backtest: --entry is required\n${USAGE}\n`)
    process.exitCode = 1
    return
  }

  const leverage = Number(values.leverage)
  if (!Number.isFinite(leverage) || leverage <= MIN_LEVERAGE || leverage > MAX_LEVERAGE) {
    process.stderr.write(
      `run-backtest: --leverage must be a finite number greater than ${MIN_LEVERAGE} and at most ` +
        `${MAX_LEVERAGE} (fractional allowed; sub-1x is a supported credit case, D-08), got "${values.leverage}"\n`,
    )
    process.exitCode = 1
    return
  }

  // SIM-09/D-16: unspecified cost parameters default to plan 03-03's sourced constants, never to
  // a bare literal. `provided` is tracked so the header can say, out loud, which figure is the
  // user's own input and which is a labelled default.
  const expenseRatio: CostDefaultInfo =
    values['expense-ratio'] !== undefined
      ? { provided: true, percent: Number(values['expense-ratio']), fraction: Number(values['expense-ratio']) / 100 }
      : { provided: false, percent: GENERIC_3X_EXPENSE_RATIO * 100, fraction: GENERIC_3X_EXPENSE_RATIO }

  const financingSpread: CostDefaultInfo =
    values['financing-spread'] !== undefined
      ? {
          provided: true,
          percent: Number(values['financing-spread']),
          fraction: Number(values['financing-spread']) / 100,
        }
      : { provided: false, percent: FINANCING_SPREAD_DEFAULT * 100, fraction: FINANCING_SPREAD_DEFAULT }

  const request: BacktestRequest = {
    symbol: values.symbol as string,
    dividendReinvest: parseDividends(values.dividends as string),
    leverage,
    entryDate: values.entry,
    holdingPeriodBars: values['holding-bars'] !== undefined ? Number(values['holding-bars']) : null,
    initialInvestment: Number(values.initial),
    contributionAmount: Number(values.contribution),
    contributionFrequency: parseFrequency(values.frequency as string),
    expenseRatioPercent: expenseRatio.percent,
    financingSpreadPercent: financingSpread.percent,
  }

  const bundle = await loadBundleFromDisk()
  const inputs = buildKernelInputs(bundle, request)
  const result = runBacktest(inputs.params, inputs.series, inputs.outputs)

  const dates = datesForWindow(bundle.calendar, inputs.window.entryIndex, inputs.window.barCount)
  const contributionDates = headTailDates(inputs.meta.contributionNominalDates)

  const expenseRatioParam = COST_PARAMETERS['generic-3x-expense-ratio']
  const financingLowerParam = COST_PARAMETERS['financing-spread-lower']
  const financingUpperParam = COST_PARAMETERS['financing-spread-upper']

  if (values.json === true) {
    const output = {
      header: {
        seriesId: inputs.meta.seriesId,
        bundleVersion: inputs.meta.bundleVersion,
        window: { firstDate: inputs.window.firstDate, lastDate: inputs.window.lastDate, barCount: inputs.window.barCount },
        truncatedForRateCoverage: inputs.meta.truncatedForRateCoverage,
        leverage: inputs.params.leverage,
        initialInvestment: inputs.params.initialInvestment,
        costDefaults: {
          expenseRatio: {
            provided: expenseRatio.provided,
            fraction: inputs.params.expenseRatio,
            percent: expenseRatio.percent,
            source: 'GENERIC_3X_EXPENSE_RATIO',
            confidence: expenseRatioParam.confidence,
          },
          financingSpread: {
            provided: financingSpread.provided,
            fraction: inputs.params.financingSpread,
            percent: financingSpread.percent,
            source: 'FINANCING_SPREAD_DEFAULT',
            confidenceLower: financingLowerParam.confidence,
            confidenceUpper: financingUpperParam.confidence,
            range: { lowerPercent: FINANCING_SPREAD_RANGE.lower * 100, upperPercent: FINANCING_SPREAD_RANGE.upper * 100 },
          },
        },
        contribution: {
          frequency: request.contributionFrequency,
          count: inputs.meta.contributionCount,
          nominalDatesHead: contributionDates.head,
          nominalDatesTail: contributionDates.tail,
        },
      },
      curve: dates.map((date, i) => ({ date, value: inputs.outputs.outValue[i] ?? 0 })),
      summary: {
        finalValue: result.finalValue,
        ruined: result.ruined,
        ruinBarIndex: result.ruinBarIndex,
        totalContributed: result.totalContributed,
        droppedContributionsTotal: result.droppedContributionsTotal,
        longGapBarCount: result.longGapBarCount,
        barCount: result.barCount,
      },
    }
    process.stdout.write(`${JSON.stringify(output)}\n`)
    return
  }

  process.stdout.write(`run-backtest: series=${inputs.meta.seriesId}\n`)
  process.stdout.write(`run-backtest: bundleVersion=${inputs.meta.bundleVersion}\n`)
  process.stdout.write(
    `run-backtest: window=${inputs.window.firstDate}..${inputs.window.lastDate} (${inputs.window.barCount} bars)\n`,
  )
  process.stdout.write(`run-backtest: truncatedForRateCoverage=${inputs.meta.truncatedForRateCoverage}\n`)
  process.stdout.write(`run-backtest: leverage=${inputs.params.leverage}\n`)
  process.stdout.write(`run-backtest: initialInvestment=${inputs.params.initialInvestment}\n`)
  process.stdout.write(
    `run-backtest: expenseRatio=${inputs.params.expenseRatio} (actual/365 day-count basis; ` +
      `${expenseRatio.provided ? 'user-provided' : 'DEFAULT'} -- source GENERIC_3X_EXPENSE_RATIO, ` +
      `confidence=${expenseRatioParam.confidence})\n`,
  )
  process.stdout.write(
    `run-backtest: financingSpread=${inputs.params.financingSpread} (actual/360 day-count basis; ` +
      `${financingSpread.provided ? 'user-provided' : 'DEFAULT'} -- source FINANCING_SPREAD_DEFAULT ` +
      `(midpoint of FINANCING_SPREAD_RANGE), confidence lower=${financingLowerParam.confidence} ` +
      `upper=${financingUpperParam.confidence}, range=[${(FINANCING_SPREAD_RANGE.lower * 100).toFixed(2)}%, ` +
      `${(FINANCING_SPREAD_RANGE.upper * 100).toFixed(2)}%])\n`,
  )
  process.stdout.write(
    `run-backtest: contributionFrequency=${request.contributionFrequency} count=${inputs.meta.contributionCount}` +
      (inputs.meta.contributionCount > 0
        ? ` dates=${contributionDates.head.join(',')}${contributionDates.tail.length > 0 ? `,...,${contributionDates.tail.join(',')}` : ''}`
        : '') +
      '\n',
  )

  printEquityCurve(dates, inputs.outputs.outValue, values.print as string)

  process.stdout.write(
    `run-backtest: summary finalValue=${result.finalValue} ruined=${result.ruined} ` +
      `ruinBarIndex=${result.ruinBarIndex} totalContributed=${result.totalContributed} ` +
      `droppedContributionsTotal=${result.droppedContributionsTotal} longGapBarCount=${result.longGapBarCount} ` +
      `barCount=${result.barCount}\n`,
  )
  if (result.droppedContributionsTotal > 0) {
    process.stdout.write(
      `run-backtest: droppedContributionsTotal is nonzero -- these contributions were scheduled at or ` +
        `after the position was ruined and were never invested (D-21)\n`,
    )
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`run-backtest: ${(err as Error).message}\n`)
  process.exitCode = 1
})
