/**
 * bench/global-setup.ts — D-04/D-08: the bench run's Node-side lifecycle.
 *
 * Vitest's `globalSetup` runs once, in the main Node process, before any browser instance for
 * the `bench` project starts, and its returned teardown function runs once after every test in
 * that project has finished. This is therefore the natural place to time the run's total
 * wall-clock (D-08), flush the accumulator that the `browser.commands` bridge (vitest.config.ts)
 * persisted via bench/accumulator-store.ts, print the table, write the JSON artifact, and
 * enforce the run-level invariants — throwing here is what turns a violation into a non-zero
 * exit code.
 */

import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { loadAccumulatedRows, loadCapturedEnvironment, resetAccumulatorStore } from './accumulator-store.ts'
import { assertRunInvariants, buildFullRowSet, renderTable } from './report.ts'

const RESULTS_DIR = join(process.cwd(), '.bench')
const RESULTS_PATH = join(RESULTS_DIR, 'bench-results.json')

export default async function setup(): Promise<() => Promise<void>> {
  await resetAccumulatorStore()
  const runStart = Date.now()

  return async function teardown(): Promise<void> {
    const totalRuntimeMs = Date.now() - runStart

    const environment = await loadCapturedEnvironment()
    if (!environment) {
      throw new Error(
        'bench/global-setup: no environment block was captured this run — every run must ' +
          'stamp a full environment block (D-18); a bench run with no captured environment ' +
          'has not measured anything real',
      )
    }

    const measured = await loadAccumulatedRows()
    const rows = buildFullRowSet(measured)

    // eslint-disable-next-line no-console
    console.log(renderTable(rows, environment, totalRuntimeMs))

    await mkdir(RESULTS_DIR, { recursive: true })
    const tmpPath = join(dirname(RESULTS_PATH), `.bench-results.json.tmp-${process.pid}`)
    const payload = JSON.stringify({ environment, rows, totalRuntimeMs }, null, 2)
    await writeFile(tmpPath, payload, 'utf8')
    // Write-then-rename: an interrupted run leaves either no artifact (crash before rename) or
    // a complete one (rename is atomic on the same filesystem), never a truncated one.
    await rename(tmpPath, RESULTS_PATH)

    // Throws on any violated invariant, which is what turns a budget/coverage/runtime problem
    // into a non-zero exit code for `npm run bench` — no separate reporting pipeline (D-03).
    assertRunInvariants(rows, totalRuntimeMs)
  }
}
