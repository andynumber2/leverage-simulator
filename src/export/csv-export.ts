/**
 * src/export/csv-export.ts
 *
 * 08-02-PLAN.md Task 1: one-shot Worker orchestration for the CSV path (D-09). `buildCsvBlob`
 * constructs a fresh Worker per call, using the same `new URL(..., import.meta.url)` plus
 * `{ type: 'module' }` construction `src/sweep/sweep-pool.ts:63` uses for its persistent pool, and
 * terminates it in a `finally`. This differs deliberately from the sweep pool, which never tears a
 * worker down: a CSV export is a rare, one-off action, not a sustained hot path, so there is no
 * benefit to keeping a worker alive between exports and every real cost to leaking one.
 *
 * D-09/RESEARCH Anti-Patterns A2: the request object crosses the Worker boundary as a plain
 * structured-clone argument -- `Comlink.transfer` is deliberately NOT used here. The typed arrays
 * `ExportRow.tsx` hands to `buildCsvBlob` are caller-made copies (`.slice()`), never the live
 * `KernelOutputs` buffers the chart is still reading, so transferring them would buy nothing and
 * risks detaching a buffer the caller still holds.
 */

import * as Comlink from 'comlink'

import { backtestRequest } from '../app/state.ts'
import type { CsvBuildRequest, CsvWorkerApi } from './csv.worker.ts'

/** Constructs a one-shot Worker, calls `buildCsv` through it, and always terminates the worker
 * before returning or throwing. */
export async function buildCsvBlob(req: CsvBuildRequest): Promise<Blob> {
  const worker = new Worker(new URL('./csv.worker.ts', import.meta.url), { type: 'module' })
  try {
    const remote = Comlink.wrap<CsvWorkerApi>(worker)
    return await remote.buildCsv(req)
  } finally {
    worker.terminate()
  }
}

/** Mirrors `pngFilename()`'s shape (`src/export/png-export.ts`, plan 08-01): reads
 * `backtestRequest()`, which only ever carries values that arrived through `decodeParams`'s
 * per-field allow-list validation, so no raw query value is interpolated here. As a second layer,
 * anything outside `[A-Za-z0-9._-]` is stripped from the assembled name before it reaches the
 * `download` attribute. */
export function csvFilename(): string {
  const request = backtestRequest()
  const leverageStr = request.leverage.toFixed(2).replace(/\.00$/, '')
  const raw = `leverage-sim-${request.symbol}-${leverageStr}x-${request.entryDate}.csv`
  return raw.replace(/[^A-Za-z0-9._-]/g, '')
}
