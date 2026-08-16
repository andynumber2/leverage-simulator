/**
 * bench/report.ts: D-04, row shape, table renderer, budget checker, run-level invariants.
 *
 * `checkBudget` is the single numeric comparison between a normalized measurement and its
 * budget; no other place in the codebase compares `normalizedMs` against `budgetMs` (WR-03).
 * `assertWithinBudget` is the per-metric delegate each `*.bench.test.ts` file calls, so its
 * failure message always comes from this one comparison. The authoritative gate is
 * `assertRunInvariants`'s verdict check: it fails the run whenever any row carries
 * `verdict === 'fail'`, independent of whether any individual bench file's own assertion ran or
 * was removed. `bench/global-setup.ts`'s teardown is the only code path that can produce a
 * non-zero exit for `npm run bench` without a test file, which is why the run-level check, not
 * the per-file `expect()`, is what a breach can never bypass.
 */

import type { BudgetId, PerfBudget, RequirementId } from '../perf-budgets.ts'
import { ESCALATION_TRIGGER_RATIO, BENCH_TOTAL_RUNTIME_CAP_MS, PERF_BUDGETS } from '../perf-budgets.ts'
import type { EnvironmentBlock } from './environment-block.ts'

export type Verdict = 'pass' | 'fail' | 'unmeasured'

/** `spike-synthetic`: measured against seeded synthetic input by throwaway spike code (this
 * phase). `production`: measured against the real kernel/UI once a later phase re-registers the
 * row. Per PERF-11's prohibition, a spike-synthetic figure must never be presented as if it were
 * a production measurement: this field is what makes that distinction mechanical rather than
 * a documentation promise. */
export type MeasurementSource = 'spike-synthetic' | 'production'

export interface MeasurementRow {
  budgetId: BudgetId
  requirementId: RequirementId
  /** Raw minimum-of-N wall-clock milliseconds, before calibration normalization. `null` when
   * this budget id has no registered measurement module this run. */
  measuredMs: number | null
  /** `measuredMs` divided by the run's calibration score. This is the value compared against
   * `budgetMs`. `null` exactly when `measuredMs` is `null`. */
  normalizedMs: number | null
  budgetMs: number
  anchorMs: number
  anchorLabel: string
  source: MeasurementSource
  verdict: Verdict
}

/**
 * `unmeasured` when there is no normalized value to compare. Otherwise `fail` when the
 * normalized value is strictly greater than the budget, `pass` when it is less than or equal:
 * PERF-01 fails a run only when a measured value *exceeds* its budget, so a value exactly at
 * threshold passes.
 */
export function checkBudget(row: Pick<MeasurementRow, 'normalizedMs' | 'budgetMs'>): Verdict {
  if (row.normalizedMs === null) {
    return 'unmeasured'
  }
  return row.normalizedMs > row.budgetMs ? 'fail' : 'pass'
}

/**
 * The single per-metric delegate every `*.bench.test.ts` file calls instead of hand-writing its
 * own `normalizedMs > budgetMs` comparison. Throws, naming the budget id, the normalized value
 * and the budget value, when `checkBudget` returns `fail`. Returns without throwing for `pass`
 * and for `unmeasured`: this function only ever reports an actual budget breach, never a
 * missing measurement. `checkBudget` remains the only place the numeric comparison itself lives
 * (WR-03), so this function's outcome and a row's recorded `verdict` can never disagree.
 */
export function assertWithinBudget(
  row: Pick<MeasurementRow, 'budgetId' | 'normalizedMs' | 'budgetMs'>,
): void {
  const verdict = checkBudget(row)
  if (verdict === 'fail') {
    throw new Error(
      `assertWithinBudget: budget "${row.budgetId}" failed: measured ${row.normalizedMs}ms ` +
        `exceeds budget ${row.budgetMs}ms`,
    )
  }
}

/**
 * True when the normalized value has reached or passed `ESCALATION_TRIGGER_RATIO` (70%, D-20)
 * of budget. This does not fail the run by itself: it is a deliberately-earlier-than-breach
 * warning so later phases' known additional work has headroom to land before the budget itself
 * is missed.
 */
export function escalationTriggered(normalizedMs: number | null, budgetMs: number): boolean {
  if (normalizedMs === null) {
    return false
  }
  return normalizedMs >= budgetMs * ESCALATION_TRIGGER_RATIO
}

/**
 * Rounds half-up to two decimal places for display. This value is never fed back into
 * `checkBudget` or `escalationTriggered`: those compare the unrounded float derived from
 * `performance.now()` deltas.
 */
export function formatMeasured(ms: number | null): string {
  if (ms === null) {
    return 'unmeasured'
  }
  // `Math.round(x * 100) / 100` alone misrounds classic cases like 16.005 (whose float64
  // representation is fractionally below 16.005) down to 16.00. A small fixed epsilon, safe
  // for the millisecond-scale magnitudes this function ever sees, corrects that without
  // resorting to string-based decimal arithmetic.
  const rounded = Math.round(ms * 100 + 1e-9) / 100
  return rounded.toFixed(2)
}

// --- Accumulator -----------------------------------------------------------------------------
// The Node-side sink that the browser-to-Node bridge (vitest.config.ts's `browser.commands`,
// invoked from *.bench.test.ts via `commands.recordMeasurement(...)`) writes into. Read back by
// bench/global-setup.ts's teardown, which owns the run's lifecycle (it is the file that flushes
// this state to stdout and to the JSON artifact and then resets it).
//
// This module is imported by both browser-context test files and Node-context config/setup
// files, so it must never import a Node builtin (see bench/environment-store.ts, which is
// Node-only for exactly this reason: a `node:os` import here previously broke the browser
// bundle with "Module has been externalized for browser compatibility").

const accumulatedRows: MeasurementRow[] = []

/** Routes a completed row from the browser context to the Node-side accumulator. */
export function recordMeasurement(row: MeasurementRow): void {
  accumulatedRows.push(row)
}

export function getAccumulatedRows(): readonly MeasurementRow[] {
  return accumulatedRows
}

/** Test-only reset so a fresh run (or a fresh test file) does not inherit stale accumulator
 * state from a previous run of the same process. */
export function resetAccumulator(): void {
  accumulatedRows.length = 0
}

// --- Full row set ------------------------------------------------------------------------------

/**
 * Builds the complete, always-eleven-row set from `PERF_BUDGETS`: every budget id that has a
 * recorded measurement this run uses that row; every budget id with no recorded measurement
 * gets a synthesized `unmeasured` row that still carries its threshold and anchor. This is a
 * lookup against the explicit accumulator, never a try/catch around a missing function, per
 * RESEARCH.md Pattern 4's anti-pattern note, a thrown error during measurement must surface as
 * a crash, not silently downgrade to `unmeasured`.
 */
export function buildFullRowSet(measured: readonly MeasurementRow[]): MeasurementRow[] {
  const byBudgetId = new Map(measured.map((row) => [row.budgetId, row]))
  const budgetIds = Object.keys(PERF_BUDGETS) as BudgetId[]
  return budgetIds.map((id) => {
    const existing = byBudgetId.get(id)
    if (existing) {
      return existing
    }
    const budget: PerfBudget = PERF_BUDGETS[id]
    return {
      budgetId: budget.id,
      requirementId: budget.requirementId,
      measuredMs: null,
      normalizedMs: null,
      budgetMs: budget.thresholdMs,
      anchorMs: budget.anchorMs,
      anchorLabel: budget.anchorLabel,
      source: 'spike-synthetic',
      verdict: 'unmeasured',
    } satisfies MeasurementRow
  })
}

// --- Table rendering ---------------------------------------------------------------------------

function compareRows(a: MeasurementRow, b: MeasurementRow): number {
  if (a.requirementId !== b.requirementId) {
    return a.requirementId.localeCompare(b.requirementId)
  }
  return a.budgetId.localeCompare(b.budgetId)
}

function allRequirementIds(): RequirementId[] {
  const ids = new Set(Object.values(PERF_BUDGETS).map((b) => b.requirementId))
  return Array.from(ids).sort((a, b) => a.localeCompare(b))
}

/**
 * Renders the environment block, an authoritative-vs-informational banner, and the full table
 * (grouped by requirement id ascending, rows sorted by budget id ascending within each group,
 * a pure function of row *content*, independent of input array order, per the Task 1 behavior
 * spec). Columns: metric, source, measured, budget, anchor, verdict, escalate.
 */
export function renderTable(
  rows: readonly MeasurementRow[],
  environment: EnvironmentBlock,
  totalRuntimeMs: number,
): string {
  const sorted = [...rows].sort(compareRows)
  const lines: string[] = []

  lines.push('=== Environment ===')
  lines.push(`hardwareConcurrency: ${environment.hardwareConcurrency}`)
  lines.push(`userAgent: ${environment.userAgent}`)
  lines.push(`os: ${environment.os}`)
  lines.push(`deviceMemory: ${environment.deviceMemory ?? 'n/a'}`)
  lines.push(`calibrationScore: ${environment.calibrationScore}`)
  lines.push(`ci: ${environment.ci}`)
  lines.push(`timestamp: ${environment.timestamp}`)
  lines.push('')
  lines.push(
    environment.ci
      ? '>>> AUTHORITATIVE ubuntu-latest BASELINE RUN (D-17) <<<'
      : '>>> informational dev-machine run (not the D-17 baseline) <<<',
  )
  lines.push('')

  for (const requirementId of allRequirementIds()) {
    lines.push(`=== ${requirementId} ===`)
    const groupRows = sorted.filter((r) => r.requirementId === requirementId)
    for (const row of groupRows) {
      const escalate = escalationTriggered(row.normalizedMs, row.budgetMs) ? 'yes' : 'no'
      lines.push(
        `  ${row.budgetId} | source=${row.source} | measured=${formatMeasured(row.normalizedMs)}ms` +
          ` | budget=${row.budgetMs}ms | anchor=${row.anchorMs}ms (${row.anchorLabel})` +
          ` | verdict=${row.verdict} | escalate=${escalate}`,
      )
    }
  }

  lines.push('')
  lines.push(
    `Total bench runtime: ${formatMeasured(totalRuntimeMs)}ms (cap: ${BENCH_TOTAL_RUNTIME_CAP_MS}ms)`,
  )

  return lines.join('\n')
}

/**
 * Throws (rather than returning a boolean) when any run-level invariant is violated, so a
 * violation always surfaces as a crashed, non-zero-exit bench run rather than a value a caller
 * could accidentally ignore.
 *
 * - Every one of the eight requirement group headers (PERF-02..PERF-09) must be present.
 * - At least one row must be genuinely measured: a harness that measures nothing is broken,
 *   not passing (PERF-10's empty-input edge case).
 * - Every row's budgetId must exist in PERF_BUDGETS.
 * - No row may carry verdict "fail". This is the authoritative gate: it has visibility into
 *   every row regardless of which bench file recorded it, so a breach cannot be silenced by
 *   removing or weakening a single bench file's own assertion.
 * - totalRuntimeMs must not exceed BENCH_TOTAL_RUNTIME_CAP_MS.
 */
export function assertRunInvariants(rows: readonly MeasurementRow[], totalRuntimeMs: number): void {
  const present = new Set(rows.map((r) => r.requirementId))
  const missing = allRequirementIds().filter((id) => !present.has(id))
  if (missing.length > 0) {
    throw new Error(
      `assertRunInvariants: missing requirement group header(s): ${missing.join(', ')}`,
    )
  }

  const anyMeasured = rows.some((r) => r.verdict !== 'unmeasured')
  if (rows.length === 0 || !anyMeasured) {
    throw new Error(
      'assertRunInvariants: zero rows measured this run: a harness that measures nothing is ' +
        'broken, not passing',
    )
  }

  for (const row of rows) {
    if (!(row.budgetId in PERF_BUDGETS)) {
      throw new Error(`assertRunInvariants: row references unknown budget id "${row.budgetId}"`)
    }
  }

  // The authoritative gate (WR-03/D-09): this check has visibility into every row's verdict
  // independent of any single bench file's own assertion, so removing or weakening one bench
  // file's `expect()` can no longer let a breach exit 0. Sorted ascending by budget id because
  // loadAccumulatedRows reads row files in readdir order, which is not guaranteed stable: an
  // unsorted message would make an identical two-failure run print differently on different
  // machines.
  const failing = rows.filter((r) => r.verdict === 'fail')
  if (failing.length > 0) {
    const failingIds = failing.map((r) => r.budgetId).sort((a, b) => a.localeCompare(b))
    throw new Error(
      `assertRunInvariants: ${failing.length} row(s) failed budget: ${failingIds.join(', ')}`,
    )
  }

  if (totalRuntimeMs > BENCH_TOTAL_RUNTIME_CAP_MS) {
    throw new Error(
      `assertRunInvariants: total bench runtime ${totalRuntimeMs}ms exceeds the declared cap ` +
        `of ${BENCH_TOTAL_RUNTIME_CAP_MS}ms (D-08): repeat cost has crept; raising the cap ` +
        'requires a recorded decision, not a silent edit',
    )
  }
}
