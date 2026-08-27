/**
 * src/export/csv.worker.ts
 *
 * 08-02-PLAN.md Task 1: the Comlink-exposed CSV builder (D-09). Follows `src/sweep/sweep.worker.ts`'s
 * exact module layout -- the pure `buildCsv` function is exported separately from the
 * `Comlink.expose` call, and that call is guarded (see the bottom of this file) so
 * `tests/app/export-csv.test.ts` can import `buildCsv` directly in the Node `unit` project with no
 * Worker or `postMessage` boundary.
 *
 * D-09/RESEARCH Anti-Patterns A2: `buildCsv` never mutates its input arrays and takes plain,
 * structured-clone-friendly arguments -- the caller (`src/export/csv-export.ts`) never uses
 * `Comlink.transfer` for this call, deliberately, because the typed arrays it hands over are
 * caller-made copies (`ExportRow.tsx`'s `.slice()` calls), not the live `KernelOutputs` buffers the
 * chart is still reading; transferring them would risk detaching a buffer the caller still holds.
 *
 * Every numeric cell is written with `String(value)`, JavaScript's shortest round-trippable
 * float64 representation -- no formatting, no padding, no fixed decimal count. `src/metrics/
 * format.ts` is the project's one render-time rounding site; this module is not a render (project
 * standing rule, `08-CONTEXT.md`).
 */

import * as Comlink from 'comlink'

import { CSV_HEADER_LINE } from './csv-columns.ts'

/** D-06's eight columns' worth of per-bar inputs plus outputs, already sliced to the run window by
 * the caller -- `dates[i]` is the ISO date for bar `i`, resolved on the main thread from the
 * compiled calendar (this module never imports the calendar decoder). Every typed array must be at
 * least as long as `dates`. */
export interface CsvBuildRequest {
  preambleLines: readonly string[]
  dates: readonly string[]
  returns: Float64Array
  shortRate: Float64Array
  calendarDaysElapsed: Int32Array
  contributionFlags: Uint8Array
  contributionAmount: number
  outValue: Float64Array
  outLongGap: Uint8Array
}

/**
 * Pure and synchronous: emits `req.preambleLines` each prefixed with `# `, then `CSV_HEADER_LINE`,
 * then one line per bar in `req.dates`. The contribution-amount cell is `req.contributionAmount`
 * on a bar whose flag is 1 and the literal `0` otherwise, computed with an `if` rather than a
 * conditional expression (project style: minimise the ternary operator). Mutates none of its
 * input arrays.
 */
export function buildCsv(req: CsvBuildRequest): Blob {
  const barCount = req.dates.length
  const lines: string[] = []

  for (const line of req.preambleLines) {
    lines.push(`# ${line}`)
  }
  lines.push(CSV_HEADER_LINE)

  for (let i = 0; i < barCount; i++) {
    const date = req.dates[i] ?? ''
    const indexReturn = req.returns[i] ?? 0
    const shortRate = req.shortRate[i] ?? 0
    const calendarDaysElapsed = req.calendarDaysElapsed[i] ?? 0
    const contributionFlag = req.contributionFlags[i] ?? 0

    let contributionAmount = 0
    if (contributionFlag === 1) {
      contributionAmount = req.contributionAmount
    }

    const longGapFlag = req.outLongGap[i] ?? 0
    const portfolioValue = req.outValue[i] ?? 0

    lines.push(
      [
        date,
        String(indexReturn),
        String(shortRate),
        String(calendarDaysElapsed),
        String(contributionFlag),
        String(contributionAmount),
        String(longGapFlag),
        String(portfolioValue),
      ].join(','),
    )
  }

  return new Blob([lines.join('\n') + '\n'], { type: 'text/csv' })
}

const csvWorkerApi = {
  buildCsv(req: CsvBuildRequest): Blob {
    return buildCsv(req)
  },
}

export type CsvWorkerApi = typeof csvWorkerApi

// Guard: `self` does not exist in the Node `unit` test project, and `Comlink.expose`'s default
// `ep = globalThis` would otherwise throw on `ep.addEventListener` at module import time -- see
// `src/sweep/sweep.worker.ts`'s identical guard.
if (typeof self !== 'undefined') {
  Comlink.expose(csvWorkerApi)
}
