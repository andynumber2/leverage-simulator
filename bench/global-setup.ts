/**
 * bench/global-setup.ts: D-04/D-08, the bench run's Node-side lifecycle.
 *
 * Vitest's `globalSetup` runs once, in the main Node process, before any browser instance for
 * the `bench` project starts, and its returned teardown function runs once after every test in
 * that project has finished. This is therefore the natural place to time the run's total
 * wall-clock (D-08), flush the accumulator that the `browser.commands` bridge (vitest.config.ts)
 * persisted via bench/accumulator-store.ts, print the table, write the JSON artifact, and
 * enforce the run-level invariants: throwing here is what turns a violation into a non-zero
 * exit code.
 */

import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  loadAccumulatedRows,
  loadCapturedEnvironment,
  loadInfoLines,
  resetAccumulatorStore,
  resolveBenchResultsDir,
} from './accumulator-store.ts'
import { assertEnvironmentBlockComplete } from './environment-block.ts'
import { assertRunInvariants, buildFullRowSet, renderTable } from './report.ts'

function resultsDir(): string {
  return join(process.cwd(), resolveBenchResultsDir())
}

function resultsPath(): string {
  return join(resultsDir(), 'bench-results.json')
}

export default async function setup(): Promise<() => Promise<void>> {
  await resetAccumulatorStore()
  const runStart = Date.now()

  return async function teardown(): Promise<void> {
    const totalRuntimeMs = Date.now() - runStart

    const environment = await loadCapturedEnvironment()
    if (!environment) {
      throw new Error(
        'bench/global-setup: no environment block was captured this run: every run must ' +
          'stamp a full environment block (D-18); a bench run with no captured environment ' +
          'has not measured anything real',
      )
    }

    // Validate that individual environment block fields are complete and coherent,
    // so a malformed block fails immediately rather than producing an unlabelled figure.
    assertEnvironmentBlockComplete(environment)

    const measured = await loadAccumulatedRows()
    const rows = buildFullRowSet(measured)

    // eslint-disable-next-line no-console
    console.log(renderTable(rows, environment, totalRuntimeMs))

    const infoLines = await loadInfoLines()
    if (infoLines.length > 0) {
      // eslint-disable-next-line no-console
      console.log(infoLines.join('\n'))
    }

    const dir = resultsDir()
    const path = resultsPath()
    await mkdir(dir, { recursive: true })
    const tmpPath = join(dirname(path), `.bench-results.json.tmp-${process.pid}`)
    // infoLines carries reproducibility detail that has no single-row home in `rows` (e.g.
    // 01-03's both-canvas-arm figures, of which only the winner becomes a MeasurementRow): it
    // must land in the JSON artifact too, not only in stdout, or a figure recorded via
    // recordInfoLine would be unrecoverable once the terminal scrolls.
    const payload = JSON.stringify({ environment, rows, totalRuntimeMs, infoLines }, null, 2)
    await writeFile(tmpPath, payload, 'utf8')
    // Write-then-rename: an interrupted run leaves either no artifact (crash before rename) or
    // a complete one (rename is atomic on the same filesystem), never a truncated one.
    await rename(tmpPath, path)

    // Throws on any violated invariant, which is what turns a budget/coverage/runtime problem
    // into a non-zero exit code for `npm run bench`: no separate reporting pipeline (D-03).
    // process.exitCode is set explicitly before rethrowing rather than relying solely on the
    // thrown error, so the guarantee holds even in a Vitest project configuration where an
    // uncaught error from globalSetup's teardown alone would not otherwise flip the exit code.
    try {
      assertRunInvariants(rows, totalRuntimeMs, environment, infoLines)
    } catch (error) {
      process.exitCode = 1
      throw error
    }
  }
}
