/**
 * bench/chunk-metrics-kernel-ablation.ts
 *
 * A faithful clone of `computeChunkMetrics` (`src/sweep/sweep.worker.ts`) with exactly ONE
 * difference: the `runBacktest(kernelParams, resolution, outputs)` call becomes
 * `kernel(kernelParams, resolution, outputs)`, an injected function. Everything else is
 * preserved: the columns-outside/rows-inside order, the once-per-column `resolveColumnSeries`
 * call, the once-per-column `calendarDays` computation, the D-28/D-20 incomplete-column path, the
 * scratch `KernelOutputs` growth discipline, the D-24 `useIrr` resolution and both annualized
 * branches, and the `cell = colPos * rowCount + rowPos` indexing.
 *
 * This clone exists because `src/sweep/sweep.worker.ts` is byte-identical-protected for
 * quick-260824-r5d: injecting a kernel makes the call site polymorphic across arms, which is a
 * known and separately measured effect (`bench/kernel-ablation.bench.test.ts`'s harness-fidelity
 * test). Its faithfulness to the real `computeChunkMetrics` is proven by measurement in that
 * bench file -- bit-identical output over a real 17-column request, with both calls' own wall
 * clock recorded -- rather than asserted here.
 *
 * `SweepChunkRequest` and `SweepChunkMetrics` are imported from `src/sweep/sweep.worker.ts`
 * rather than redeclared, so a future shape change there breaks the typecheck instead of
 * silently diverging.
 */

import { LONG_GAP_FLAG_MIN_DAYS, type KernelOutputs, type KernelParams } from '../src/kernel/backtest.types.ts'
import type { LoadedBundle } from '../src/data/bundle-source.ts'
import { CELL_FLAG_INCOMPLETE, CELL_FLAG_RUINED } from '../src/data/sweep-fixture-format.ts'
import { solveCagr } from '../src/metrics/cagr.ts'
import { buildCashFlows, solveIrr, type CashFlows } from '../src/metrics/irr.ts'
import { toDaysSinceEpoch } from '../tools/bundle-compiler/src/calendar.ts'
import { ANNUALIZED_UNDEFINED, leverageForRow } from '../src/sweep/sweep-grid.ts'
import { resolveColumnSeries, type ColumnSeriesRequest } from '../src/sweep/resolve-column-series.ts'
import type { SweepChunkMetrics, SweepChunkRequest } from '../src/sweep/sweep.worker.ts'
import type { AblationKernel } from './backtest-ablation-variants.ts'

// Scratch KernelOutputs, reused across every cell within one call: allocated lazily, once the
// bundle's own calendar length is known, and grown only if a later call ever needs more --
// mirrors sweep.worker.ts's own scratchOutValue/scratchOutRuined discipline, kept module-scope
// here in the same way.
let scratchOutValue: Float64Array = new Float64Array(0)
let scratchOutRuined: Uint8Array = new Uint8Array(0)
let scratchOutLongGap: Uint8Array = new Uint8Array(0)

function getScratchOutputs(minLength: number): KernelOutputs {
  if (scratchOutValue.length < minLength) {
    scratchOutValue = new Float64Array(minLength)
    scratchOutRuined = new Uint8Array(minLength)
    scratchOutLongGap = new Uint8Array(minLength)
  }
  return { outValue: scratchOutValue, outRuined: scratchOutRuined, outLongGap: scratchOutLongGap }
}

// Scratch cash-flow buffers, reused across every cell that takes the `solveIrr` branch within one
// call, mirroring sweep.worker.ts's own scratchCashFlows discipline.
let scratchCashFlows: CashFlows = { daysSinceEntry: new Float64Array(0), amount: new Float64Array(0), count: 0 }

/**
 * `computeChunkMetrics`, with `runBacktest` replaced by an injected `kernel`. See this file's
 * header comment for the faithfulness discipline.
 */
export function computeChunkMetricsWithKernel(
  bundle: LoadedBundle,
  request: SweepChunkRequest,
  kernel: AblationKernel,
): SweepChunkMetrics {
  const colCount = request.columnIndices.length
  const rowCount = request.rowIndices.length
  const cellCount = colCount * rowCount

  const multiples = new Float32Array(cellCount)
  const drawdowns = new Float32Array(cellCount)
  const annualized = new Float32Array(cellCount)
  const flags = new Uint8Array(cellCount)

  const { params } = request
  const expenseRatio = params.expenseRatioPercent / 100
  const financingSpread = params.financingSpreadPercent / 100
  // D-24: decided ONCE per sweep from the request, never per cell -- mirrors METR-01/METR-02's
  // single-run rule (`src/app/state.ts`'s `computeDerivedMetrics`) rather than re-deriving it.
  const useIrr = params.contributionAmount !== 0

  for (let colPos = 0; colPos < colCount; colPos++) {
    const entryDate = request.entryDates[colPos]
    if (entryDate === undefined) {
      throw new Error(
        `chunk-metrics-kernel-ablation: entryDates[${colPos}] is missing (columnIndices/entryDates length mismatch)`,
      )
    }

    const columnRequest: ColumnSeriesRequest = {
      symbol: params.symbol,
      dividendReinvest: params.dividendReinvest,
      entryDate,
      holdingPeriodBars: params.holdingPeriodBars,
      contributionAmount: params.contributionAmount,
      contributionFrequency: params.contributionFrequency,
    }
    const resolution = resolveColumnSeries(bundle, columnRequest)

    if (resolution.incomplete) {
      // D-28/D-20: every cell in this column is incomplete -- never a partial value in any of
      // the three metric arrays.
      for (let rowPos = 0; rowPos < rowCount; rowPos++) {
        const cell = colPos * rowCount + rowPos
        multiples[cell] = 0
        drawdowns[cell] = 0
        annualized[cell] = 0
        flags[cell] = CELL_FLAG_INCOMPLETE
      }
      continue
    }

    const outputs = getScratchOutputs(resolution.barCount)
    // D-24's CAGR branch shares the same calendar span every row in this column uses -- computed
    // once per column, exactly where `src/app/state.ts`'s single-run path computes it.
    const calendarDays = toDaysSinceEpoch(resolution.lastDate) - toDaysSinceEpoch(resolution.firstDate)

    for (let rowPos = 0; rowPos < rowCount; rowPos++) {
      const row = request.rowIndices[rowPos]
      if (row === undefined) {
        throw new Error(`chunk-metrics-kernel-ablation: rowIndices[${rowPos}] is missing`)
      }
      const leverage = leverageForRow(row)
      const kernelParams: KernelParams = {
        leverage,
        initialInvestment: params.initialInvestment,
        contributionAmount: params.contributionAmount,
        financingSpread,
        expenseRatio,
        longGapMinDays: LONG_GAP_FLAG_MIN_DAYS,
      }

      // The ONE difference from computeChunkMetrics: `kernel(...)` instead of `runBacktest(...)`.
      const result = kernel(kernelParams, resolution, outputs)

      const cell = colPos * rowCount + rowPos
      multiples[cell] = result.totalContributed > 0 ? result.finalValue / result.totalContributed : 0
      drawdowns[cell] = result.maxDrawdown
      flags[cell] = result.ruined ? CELL_FLAG_RUINED : 0

      // METR-06/D-24: the SAME `result` this cell's multiple/drawdown/flag came from -- never a
      // second kernel call, never a re-derived formula.
      const annualizedValue = useIrr
        ? solveIrr(buildCashFlows(kernelParams, resolution, outputs, result, scratchCashFlows))
        : solveCagr(kernelParams.initialInvestment, result.finalValue, calendarDays)
      annualized[cell] = annualizedValue === null ? ANNUALIZED_UNDEFINED : annualizedValue
    }
  }

  return { multiples, drawdowns, annualized, flags }
}
