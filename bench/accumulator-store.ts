/**
 * bench/accumulator-store.ts: Node-only, filesystem-backed accumulator for the browser-to-Node
 * bridge.
 *
 * `vitest.config.ts`'s `browser.commands` implementations and `bench/global-setup.ts`'s
 * teardown run as separate module instances of the Vitest/vite-node runtime, even though both
 * execute in the same OS process: a plain in-memory module-level array does not survive across
 * that boundary (verified empirically: the command wrote successfully, but a later in-memory
 * read from global-setup.ts's own import of the same source file saw no data). The filesystem is
 * genuinely shared regardless of which module instance touches it, so this file persists every
 * recorded row and the environment block to `.bench/.raw/` and reads them back at teardown.
 *
 * Deliberately never imported by any `*.bench.test.ts` file: it imports `node:fs`/`node:os`,
 * which break the browser bundle if pulled in transitively (see bench/report.ts's header
 * comment).
 */

import { randomUUID } from 'node:crypto'
import { link, mkdir, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { platform, release } from 'node:os'
import { isAbsolute, join } from 'node:path'

import type { BrowserCapturedEnvironment, EnvironmentBlock } from './environment-block.ts'
import type { MeasurementRow } from './report.ts'

/**
 * Resolves the directory the accumulator reads and writes under, relative to `process.cwd()`.
 * `BENCH_RESULTS_DIR` lets a spawning process (the D-09 self-test, tests/perf-budgets.selftest
 * .test.ts) point a real harness run at an isolated directory so it cannot clobber the real
 * `.bench` artifact. Unset or empty (after trimming) resolves to the literal `.bench`. Because
 * this value composes directly into a filesystem path that `resetAccumulatorStore` recursively
 * removes, an absolute path or a `..` segment is rejected outright rather than silently
 * resolved, so a misconfigured caller cannot point this at an arbitrary location on disk.
 */
export function resolveBenchResultsDir(): string {
  const raw = process.env.BENCH_RESULTS_DIR
  const trimmed = raw ? raw.trim() : ''
  if (trimmed.length === 0) {
    return '.bench'
  }
  if (isAbsolute(trimmed)) {
    throw new Error(
      `resolveBenchResultsDir: BENCH_RESULTS_DIR must be a relative path, got absolute value "${trimmed}"`,
    )
  }
  const segments = trimmed.split(/[/\\]/)
  if (segments.some((segment) => segment === '..')) {
    throw new Error(
      `resolveBenchResultsDir: BENCH_RESULTS_DIR must not contain a parent-directory segment, got "${trimmed}"`,
    )
  }
  return trimmed
}

function rawDir(): string {
  return join(process.cwd(), resolveBenchResultsDir(), '.raw')
}

function calibrationPath(): string {
  return join(rawDir(), 'calibration.json')
}

/** Clears any state left over from a previous run of the same process. Called once, from
 * bench/global-setup.ts's setup phase, before any measurement can be recorded. */
export async function resetAccumulatorStore(): Promise<void> {
  await rm(rawDir(), { recursive: true, force: true })
  await mkdir(rawDir(), { recursive: true })
}

/**
 * One file per (budget id, source) pair, NOT per budget id.
 *
 * More than one file can legitimately measure the same budget with different sources: PERF-05 is
 * measured both by the Phase 1 `spike-synthetic` canvas arm and by the `production` heatmap
 * repaint. Keying the filename on budget id alone meant the second writer silently overwrote the
 * first on disk, so the reported headline depended on test file execution order and
 * `buildFullRowSet` never saw the row it was supposed to choose between. Including the source
 * keeps both rows, and `buildFullRowSet` resolves them deterministically (production wins).
 *
 * Two writes for the SAME budget id and source is a real collision with no principled winner, so
 * it throws rather than silently dropping a measurement.
 */
export async function persistMeasurement(row: MeasurementRow): Promise<void> {
  await mkdir(rawDir(), { recursive: true })
  const path = join(rawDir(), `row-${row.budgetId}-${row.source}.json`)
  try {
    await writeFile(path, JSON.stringify(row), { encoding: 'utf8', flag: 'wx' })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(
        `persistMeasurement: budget "${row.budgetId}" was already recorded this run with source ` +
          `"${row.source}"; two recorders for the same budget and source have no principled ` +
          'winner, so one must downgrade to an info line',
      )
    }
    throw err
  }
}

/** Persists the run's environment block, filling in the two fields (`os`, `ci`) that are
 * genuinely Node-side concerns: `process.env` and `node:os` are exactly what is available in
 * this Node-context command implementation. */
export async function persistEnvironment(block: BrowserCapturedEnvironment): Promise<void> {
  await mkdir(rawDir(), { recursive: true })
  const full: EnvironmentBlock = {
    ...block,
    os: `${platform()} ${release()}`,
    ci: process.env.CI === 'true' || process.env.CI === '1',
  }
  await writeFile(join(rawDir(), 'environment.json'), JSON.stringify(full), 'utf8')
}

export async function loadAccumulatedRows(): Promise<MeasurementRow[]> {
  await mkdir(rawDir(), { recursive: true })
  const entries = await readdir(rawDir())
  const rowFiles = entries.filter((name) => name.startsWith('row-') && name.endsWith('.json'))
  const rows: MeasurementRow[] = []
  for (const file of rowFiles) {
    // eslint-disable-next-line no-await-in-loop
    const content = await readFile(join(rawDir(), file), 'utf8')
    rows.push(JSON.parse(content) as MeasurementRow)
  }
  return rows
}

export async function loadCapturedEnvironment(): Promise<EnvironmentBlock | null> {
  try {
    const content = await readFile(join(rawDir(), 'environment.json'), 'utf8')
    return JSON.parse(content) as EnvironmentBlock
  } catch {
    return null
  }
}

/**
 * Write-once canonical calibration score for a run, shared through this file's filesystem-backed
 * bridge for the same module-instance-boundary reason documented at the top of this file.
 *
 * Why this exists: bench/kernel.bench.test.ts, bench/sweep.bench.test.ts and
 * bench/canvas-repaint.bench.test.ts each used to sample their own calibrationScore(), so
 * different rows in one run were denominated in different scores, and the recorded environment
 * block (last-write-wins) was not necessarily the score that normalized any given row. GitHub
 * Actions run 31963076671 attempt 1 recorded this divergence directly: the environment block
 * printed 0.7375 while PERF-03's own score was 1.4400 (1486.70 / 1032.43), a 2x divergence
 * inside one run.
 *
 * The same module-instance-boundary reasoning documented at the top of this file is why the
 * sharing is filesystem backed rather than in memory: a plain in-memory module accumulator does
 * not survive across the separate vite-node module instances the browser-commands bridge and
 * global-setup teardown run as.
 *
 * This changes only how the score is sampled, shared and recorded across the three bench files,
 * never how it is computed or applied: `NOMINAL_REFERENCE_MS` and `normalize()` in
 * bench/calibration.ts are untouched.
 *
 * The first caller to successfully claim a score for this run wins; every later caller,
 * including a racing concurrent one, receives that same stored value. `link()` is the
 * write-once primitive here: unlike a check-then-act existence test (which two concurrent
 * callers can both pass), `link()` is atomic at the filesystem level and fails with `EEXIST`
 * rather than clobbering an existing file. The temporary file is fully written before the link
 * is attempted, so a losing caller can never observe a partially written winner.
 */
export async function claimCalibrationScore(sample: number): Promise<number> {
  if (!Number.isFinite(sample) || sample <= 0) {
    throw new Error(
      `claimCalibrationScore: sample (${sample}) is zero, negative or non-finite: a broken ` +
        "sample must not become the run's denominator",
    )
  }
  await mkdir(rawDir(), { recursive: true })
  const finalPath = calibrationPath()
  const tmpPath = join(rawDir(), `.calibration.json.tmp-${process.pid}-${randomUUID()}`)
  await writeFile(tmpPath, JSON.stringify({ calibrationScore: sample }), 'utf8')
  try {
    await link(tmpPath, finalPath)
    return sample
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      const content = await readFile(finalPath, 'utf8')
      return (JSON.parse(content) as { calibrationScore: number }).calibrationScore
    }
    throw error
  } finally {
    // Removed on every path, including the rethrow path, so a failed run does not leave litter
    // in .raw/. Best-effort: the temp file may already be gone if link() itself failed part way.
    await unlink(tmpPath).catch(() => {})
  }
}

/** Mirrors `loadCapturedEnvironment`: reads and parses the claimed score, `null` when no score
 * has been claimed yet this run or on any read failure. */
export async function loadCalibrationScore(): Promise<number | null> {
  try {
    const content = await readFile(calibrationPath(), 'utf8')
    return (JSON.parse(content) as { calibrationScore: number }).calibrationScore
  } catch {
    return null
  }
}

/**
 * Free-text info lines a `*.bench.test.ts` file wants printed in the run's stdout table
 * alongside the measurement rows (e.g. bench/sweep.bench.test.ts's resolved worker count and
 * chosen chunk count, for PERF-03 reproducibility). Not part of MeasurementRow's typed shape:
 * this is deliberately a narrow, additive escape hatch rather than a change to the row schema.
 * Added in Task 2 of plan 01-02 because a browser-context `console.log` does not reach
 * `npm run bench`'s stdout under the default (non-verbose) Vitest reporter, verified
 * empirically: the same log line appears only with `--reporter=verbose`, which this project's
 * `bench` script does not pass. Persisted the same way as every other browser-to-Node payload in
 * this file, for the same module-instance-boundary reason documented at the top of this file.
 */
export async function persistInfoLine(id: string, line: string): Promise<void> {
  await mkdir(rawDir(), { recursive: true })
  await writeFile(join(rawDir(), `info-${id}.json`), JSON.stringify(line), 'utf8')
}

export async function loadInfoLines(): Promise<string[]> {
  await mkdir(rawDir(), { recursive: true })
  const entries = await readdir(rawDir())
  const infoFiles = entries.filter((name) => name.startsWith('info-') && name.endsWith('.json'))
  const lines: string[] = []
  for (const file of infoFiles) {
    // eslint-disable-next-line no-await-in-loop
    const content = await readFile(join(rawDir(), file), 'utf8')
    lines.push(JSON.parse(content) as string)
  }
  return lines.sort()
}
