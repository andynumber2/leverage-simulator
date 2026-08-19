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
import {
  ESCALATION_TRIGGER_RATIO,
  BENCH_TOTAL_RUNTIME_CAP_MS,
  PERF_03_BASELINE_HARDWARE_CONCURRENCY,
  PERF_BUDGETS,
} from '../perf-budgets.ts'
import type { EnvironmentBlock } from './environment-block.ts'

export type Verdict = 'pass' | 'fail' | 'unmeasured'

/**
 * 04-03: the highest phase whose PERF-08 sub-budgets must already carry a real measurement (not
 * `unmeasured`) by the time a bench run's invariants are checked. Scoped to `requirementId ===
 * 'PERF-08'` specifically, not every budget row due by this phase, so this check tracks only the
 * family of rows this plan closes out: PERF-07's rows carry the same `implementedInPhase: 4` but
 * are measured by a separate, later plan in this same phase, and must not trip this check before
 * that plan lands.
 */
export const PERF_08_COVERAGE_PHASE = 4

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
 * quick-260818-v2d: true when the recorded environment's `hardwareConcurrency` equals the
 * declared PERF-03 baseline width (`PERF_03_BASELINE_HARDWARE_CONCURRENCY`,
 * perf-budgets.ts). PERF-03's pool is measured at that pinned width on every host (bench/
 * sweep-pool.ts's `BASELINE_WORKER_COUNT`), so a host reporting any other width did not supply
 * the parallel width the pinned measurement assumes, and its PERF-03 figure is not a PERF-03
 * measurement in the sense the budget is denominated against.
 */
export function hostMatchesPerf03Baseline(environment: EnvironmentBlock): boolean {
  return environment.hardwareConcurrency === PERF_03_BASELINE_HARDWARE_CONCURRENCY
}

/**
 * Relative tolerance for the score-coherence check in `assertRunInvariants`. `normalizedMs` is
 * an exact IEEE division of `measuredMs` by the run's calibration score (`bench/calibration.ts`'s
 * `normalize`), so the round trip `measuredMs - normalizedMs * score` is accurate to a few ulps.
 * `1e-9` relative is many orders of magnitude looser than that true residual, while still
 * catching the 2x divergence observed on GitHub Actions run 31963076671 (environment block
 * 0.7375 versus PERF-03's own score 1.4400).
 */
export const SCORE_COHERENCE_RELATIVE_TOLERANCE = 1e-9

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
  if (!hostMatchesPerf03Baseline(environment)) {
    lines.push(
      `>>> PERF-03 VERDICT WITHHELD: this host recorded hardwareConcurrency ` +
        `${environment.hardwareConcurrency}, not the declared PERF-03 baseline of ` +
        `${PERF_03_BASELINE_HARDWARE_CONCURRENCY}; three workers timesharing fewer cores is an ` +
        'irreducible cost no anchor can or should erase, and a wider host is simply not the ' +
        'machine the budget is denominated against <<<',
    )
    lines.push('')
  }

  for (const requirementId of allRequirementIds()) {
    lines.push(`=== ${requirementId} ===`)
    const groupRows = sorted.filter((r) => r.requirementId === requirementId)
    for (const row of groupRows) {
      const escalate = escalationTriggered(row.normalizedMs, row.budgetMs) ? 'yes' : 'no'
      // D-23: the row's declared unit (bytes vs ms), not a hardcoded "ms" suffix, so a
      // byte-denominated row (DATA-BUNDLE-BYTES) reads as bytes rather than a false duration.
      const unit = PERF_BUDGETS[row.budgetId].unit
      lines.push(
        `  ${row.budgetId} | source=${row.source} | measured=${formatMeasured(row.normalizedMs)}${unit}` +
          ` | budget=${row.budgetMs}${unit} | anchor=${row.anchorMs}${unit} (${row.anchorLabel})` +
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
 * - At least one row must be genuinely measured, or at least one info line must have been
 *   recorded: a harness that produces neither a measurement nor a diagnostic line is broken,
 *   not passing (PERF-10's empty-input edge case). The info-line escape hatch exists for
 *   diagnostic-only bench files (04-03's `playwright-context-probe.bench.test.ts`) that pin a
 *   mechanism fact rather than a duration: `recordInfoLine` is still a genuine, asserted signal
 *   that the harness ran and reported something real, which is what this invariant exists to
 *   require -- it was never specifically about `MeasurementRow` as the only acceptable shape of
 *   evidence.
 * - Every row's budgetId must exist in PERF_BUDGETS.
 * - No row may carry verdict "fail". This is the authoritative gate: it has visibility into
 *   every row regardless of which bench file recorded it, so a breach cannot be silenced by
 *   removing or weakening a single bench file's own assertion.
 * - Every `requirementId === 'PERF-08'` budget id whose `implementedInPhase` is at or before
 *   `PERF_08_COVERAGE_PHASE` must not carry verdict "unmeasured": once a PERF-08 sub-budget's
 *   harness has landed, that row going back to unmeasured is a run failure, not a silent
 *   omission (04-03). Checked after the verdict-fail gate above, not before it, for the same
 *   reason the PERF-03 host-width guard below is: a deliberately-over-budget self-test fixture
 *   must keep failing on its own breach, not on this check masking it.
 * - When `environment` is supplied, every measured row's implied score
 *   (`measuredMs / normalizedMs`) must agree with `environment.calibrationScore`: this
 *   structurally prevents a future bench file that samples its own score from producing rows
 *   denominated differently from the recorded environment block, turning that divergence into a
 *   failed run rather than a silently divergent report.
 * - totalRuntimeMs must not exceed BENCH_TOTAL_RUNTIME_CAP_MS.
 */
export function assertRunInvariants(
  rows: readonly MeasurementRow[],
  totalRuntimeMs: number,
  environment?: EnvironmentBlock,
  infoLines: readonly string[] = [],
): void {
  const present = new Set(rows.map((r) => r.requirementId))
  const missing = allRequirementIds().filter((id) => !present.has(id))
  if (missing.length > 0) {
    throw new Error(
      `assertRunInvariants: missing requirement group header(s): ${missing.join(', ')}`,
    )
  }

  const anyMeasured = rows.some((r) => r.verdict !== 'unmeasured') || infoLines.length > 0
  if (rows.length === 0 || !anyMeasured) {
    throw new Error(
      'assertRunInvariants: zero rows measured and zero info lines recorded this run: a ' +
        'harness that reports nothing is broken, not passing',
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

  // PERF-08 coverage (04-03): reads the "due" set from PERF_BUDGETS itself (requirementId ===
  // 'PERF-08' and implementedInPhase <= PERF_08_COVERAGE_PHASE), not a hand-maintained id list,
  // so a future PERF-08 sub-budget added at a later phase is excluded automatically until its
  // own implementedInPhase is reached. Deliberately placed after the verdict-fail gate above,
  // not before it, for the same reason the PERF-03 host-width guard below is: `bench/selftest/
  // over-budget.selftest.ts` records only a PERF-05 row and must keep failing on its own
  // deliberate breach, not on this check masking it with an unrelated "PERF-08 unmeasured"
  // reason.
  const duePerf08Ids = (Object.keys(PERF_BUDGETS) as BudgetId[]).filter(
    (id) =>
      PERF_BUDGETS[id].requirementId === 'PERF-08' &&
      PERF_BUDGETS[id].implementedInPhase <= PERF_08_COVERAGE_PHASE,
  )
  const stillUnmeasuredPerf08 = rows.filter(
    (r) => duePerf08Ids.includes(r.budgetId) && r.verdict === 'unmeasured',
  )
  if (stillUnmeasuredPerf08.length > 0) {
    const ids = stillUnmeasuredPerf08
      .map((r) => r.budgetId)
      .sort((a, b) => a.localeCompare(b))
    throw new Error(
      `assertRunInvariants: PERF-08 budget id(s) due for measurement by phase ` +
        `${PERF_08_COVERAGE_PHASE} are still unmeasured: ${ids.join(', ')}`,
    )
  }

  // Score coherence (quick-260816-p8z): only runs when a caller supplies an environment block.
  // Uses the multiplied form (measuredMs - normalizedMs * score) rather than dividing
  // measuredMs / normalizedMs, so a legitimately zero measurement cannot produce NaN from a
  // zero denominator. Collected and thrown once, sorted ascending by budget id, for the same
  // stable-message reason the verdict check above documents.
  if (environment) {
    // PERF-03 host-width guard (quick-260818-v2d): deliberately placed after the verdict-fail
    // gate above, not before it. `bench/selftest/over-budget.selftest.ts` records
    // hardwareConcurrency 1 (off-baseline) and must keep failing on its own deliberate PERF-05
    // breach, not on this guard: if this guard ran first, an off-baseline self-test host would
    // report the wrong failure reason and mask the gate-liveness proof the self-test exists for.
    if (!hostMatchesPerf03Baseline(environment)) {
      const perf03Row = rows.find((r) => r.budgetId === 'PERF-03')
      if (environment.ci) {
        throw new Error(
          `assertRunInvariants: this run recorded hardwareConcurrency ${environment.hardwareConcurrency}, ` +
            `not the declared PERF-03 baseline of ${PERF_03_BASELINE_HARDWARE_CONCURRENCY}: a CI run on a ` +
            'host that is not the declared baseline cannot be presented as an authoritative D-17 baseline run',
        )
      }
      if (perf03Row && perf03Row.verdict !== 'unmeasured') {
        throw new Error(
          `assertRunInvariants: this run recorded hardwareConcurrency ${environment.hardwareConcurrency}, ` +
            `not the declared PERF-03 baseline of ${PERF_03_BASELINE_HARDWARE_CONCURRENCY}, but PERF-03 ` +
            `carries verdict "${perf03Row.verdict}" instead of "unmeasured": a bench file cannot restore a ` +
            'verdict the host does not support',
        )
      }
    }

    const divergent = rows
      .filter((r) => r.measuredMs !== null && r.normalizedMs !== null)
      // D-23: a byte-denominated row's normalizedMs equals its measuredMs by design (a byte
      // count is never divided by a calibration score), so its implied score is always 1
      // regardless of the machine's real score. Without this exemption the coherence check
      // would fail every byte row on any machine whose score is not exactly 1.0.
      .filter((r) => PERF_BUDGETS[r.budgetId].unit === 'ms')
      .filter((r) => {
        const measuredMs = r.measuredMs as number
        const normalizedMs = r.normalizedMs as number
        const residual = Math.abs(measuredMs - normalizedMs * environment.calibrationScore)
        const scale = SCORE_COHERENCE_RELATIVE_TOLERANCE * Math.max(1, Math.abs(measuredMs))
        return residual > scale
      })
      .sort((a, b) => a.budgetId.localeCompare(b.budgetId))
    if (divergent.length > 0) {
      const details = divergent
        .map((r) => {
          const measuredMs = r.measuredMs as number
          const normalizedMs = r.normalizedMs as number
          const impliedScore = normalizedMs === 0 ? 0 : measuredMs / normalizedMs
          return `${r.budgetId} (implied score ${impliedScore}, environment score ` +
            `${environment.calibrationScore})`
        })
        .join(', ')
      throw new Error(
        `assertRunInvariants: ${divergent.length} row(s) diverge from the recorded ` +
          `environment.calibrationScore: ${details}`,
      )
    }
  }

  if (totalRuntimeMs > BENCH_TOTAL_RUNTIME_CAP_MS) {
    throw new Error(
      `assertRunInvariants: total bench runtime ${totalRuntimeMs}ms exceeds the declared cap ` +
        `of ${BENCH_TOTAL_RUNTIME_CAP_MS}ms (D-08): repeat cost has crept; raising the cap ` +
        'requires a recorded decision, not a silent edit',
    )
  }
}
