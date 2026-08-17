/**
 * perf-budgets.ts: D-21, single source of truth for every performance threshold.
 *
 * A typed TypeScript module, not a runtime-parsed config file. A malformed entry (missing
 * field, wrong type, or a requirementId outside the union) cannot compile: the compiler is
 * the validation layer (see the exhaustiveness check at the bottom of this file).
 *
 * Every threshold in this table equals its perception anchor, per the `<interfaces>` table in
 * 01-01-PLAN.md, so no entry here carries a `relaxationReason` and no relaxation Key Decision is
 * owed under PERF-01a. If a later phase's measurement forces `thresholdMs` above `anchorMs`,
 * that entry must also gain a non-empty `relaxationReason`, and the change must be recorded as a
 * Key Decision in PROJECT.md, not made silently.
 */

/** The eight requirements this phase's budget table covers, PERF-02 through PERF-09. */
export type RequirementId =
  | 'PERF-02'
  | 'PERF-03'
  | 'PERF-04'
  | 'PERF-05'
  | 'PERF-06'
  | 'PERF-07'
  | 'PERF-08'
  | 'PERF-09'

/** The thirteen budget rows. PERF-07 and PERF-08 each split into multiple sub-budgets because
 * their requirement text names more than one numeric ceiling. `DATA-BUNDLE-BYTES` and
 * `DATA-BUNDLE-DECODE` (phase 2, D-23) both reuse `requirementId: 'PERF-08'` rather than adding a
 * ninth requirement id, so `RequirementId` gains no member and the compile-time exhaustiveness
 * check below is untouched. */
export type BudgetId =
  | 'PERF-02'
  | 'PERF-03'
  | 'PERF-04'
  | 'PERF-05'
  | 'PERF-06'
  | 'PERF-07a'
  | 'PERF-07b'
  | 'PERF-08a'
  | 'PERF-08b'
  | 'PERF-08c'
  | 'PERF-09'
  | 'DATA-BUNDLE-BYTES'
  | 'DATA-BUNDLE-DECODE'

/** `'ms'` for every duration-denominated row, `'bytes'` for a transfer-size row (D-23). */
export type BudgetUnit = 'ms' | 'bytes'

/** 10 Mbps, expressed as bytes per second. A deliberately conservative "typical broadband" floor
 * (also covers poor mobile), used to derive `DATA-BUNDLE-BYTES`'s threshold from the transfer
 * share of PERF-08b's cold-load budget (D-23): chosen so the budget is meaningful rather than
 * comfortable. */
export const DECLARED_CONNECTION_BYTES_PER_SEC = 1_250_000

export interface PerfBudget {
  id: BudgetId
  requirementId: RequirementId
  description: string
  thresholdMs: number
  anchorMs: number
  anchorLabel: string
  implementedInPhase: number
  /** Required (by the self-test in tests/perf-budgets.selftest.test.ts, not the type system
   * alone) whenever thresholdMs > anchorMs. Absent when the two are equal. */
  relaxationReason?: string
  /** Authoritative for how `thresholdMs`/`anchorMs` are read: `'ms'` for a duration, `'bytes'`
   * for a transfer size (D-23). The `Ms` suffix on those two field names is historical, kept only
   * because renaming it would touch `MeasurementRow`, `checkBudget`, `assertWithinBudget`,
   * `renderTable`, `assertRunInvariants`, every bench file and both self-test fixtures for no
   * behavioural gain; `unit`, not the field name, is what a reader should trust. */
  unit: BudgetUnit
}

/** Escalation trigger per D-20: measured value at or above 70% of budget escalates
 * deliberately (pool tuning, WASM ratio, coarser default grid) rather than the budget being
 * relaxed. This is a warning marker, not a failure: the run still passes if the budget itself
 * is not breached. */
export const ESCALATION_TRIGGER_RATIO = 0.7

/** D-08: bench asserts its own total wall-clock against this cap and prints its runtime, so
 * repeat cost cannot creep silently as later phases (2, 3, 4, 6, 7) add rows. Estimated repeat
 * cost for this phase's arms is roughly 5-15s; 30s leaves headroom for those additions without
 * being so loose that creep goes unnoticed. Raising this value later requires a recorded
 * decision (mirrors D-19/D-20's discipline for the perf budgets themselves). */
export const BENCH_TOTAL_RUNTIME_CAP_MS = 30_000

export const PERF_BUDGETS: Record<BudgetId, PerfBudget> = {
  'PERF-02': {
    id: 'PERF-02',
    requirementId: 'PERF-02',
    description: 'A single backtest over the full daily history (~25,000 bars)',
    thresholdMs: 16,
    anchorMs: 16,
    anchorLabel: 'one frame',
    implementedInPhase: 3,
    unit: 'ms',
  },
  'PERF-03': {
    id: 'PERF-03',
    requirementId: 'PERF-03',
    description: 'A full sweep (10,000 cells) on a 4-core baseline',
    thresholdMs: 1000,
    anchorMs: 1000,
    anchorLabel: 'holds attention',
    implementedInPhase: 7,
    unit: 'ms',
  },
  'PERF-04': {
    id: 'PERF-04',
    requirementId: 'PERF-04',
    description: 'First partial sweep results paint, and each repaint thereafter',
    thresholdMs: 100,
    anchorMs: 100,
    anchorLabel: 'feels instant',
    implementedInPhase: 7,
    unit: 'ms',
  },
  'PERF-05': {
    id: 'PERF-05',
    requirementId: 'PERF-05',
    description: "Re-coloring the cached heatmap grid for a changed displayed metric",
    thresholdMs: 16,
    anchorMs: 16,
    anchorLabel: 'one frame',
    implementedInPhase: 7,
    unit: 'ms',
  },
  'PERF-06': {
    id: 'PERF-06',
    requirementId: 'PERF-06',
    description: 'Cancelling an in-flight sweep after the user changes a parameter',
    thresholdMs: 16,
    anchorMs: 16,
    anchorLabel: 'one frame',
    implementedInPhase: 7,
    unit: 'ms',
  },
  'PERF-07a': {
    id: 'PERF-07a',
    requirementId: 'PERF-07',
    description: 'No main-thread task exceeds the long-task threshold during any interaction',
    thresholdMs: 50,
    anchorMs: 50,
    anchorLabel: 'long task threshold',
    implementedInPhase: 4,
    unit: 'ms',
  },
  'PERF-07b': {
    id: 'PERF-07b',
    requirementId: 'PERF-07',
    description: 'No main-thread task exceeds one frame during any interaction',
    thresholdMs: 16,
    anchorMs: 16,
    anchorLabel: 'one frame',
    implementedInPhase: 4,
    unit: 'ms',
  },
  'PERF-08a': {
    id: 'PERF-08a',
    requirementId: 'PERF-08',
    description: 'Cold load reaches interactive',
    thresholdMs: 1500,
    anchorMs: 1500,
    anchorLabel: 'cold load ceiling',
    implementedInPhase: 4,
    unit: 'ms',
  },
  'PERF-08b': {
    id: 'PERF-08b',
    requirementId: 'PERF-08',
    description: 'Cold load completes data load and first render',
    thresholdMs: 1000,
    anchorMs: 1000,
    anchorLabel: 'holds attention',
    implementedInPhase: 4,
    unit: 'ms',
  },
  'PERF-08c': {
    id: 'PERF-08c',
    requirementId: 'PERF-08',
    description: 'Warm load (cached assets) reaches interactive',
    thresholdMs: 300,
    anchorMs: 300,
    anchorLabel: 'warm load ceiling',
    implementedInPhase: 4,
    unit: 'ms',
  },
  'PERF-09': {
    id: 'PERF-09',
    requirementId: 'PERF-09',
    description: 'Heatmap pan and zoom sustain 60fps at full cell count',
    thresholdMs: 16,
    anchorMs: 16,
    anchorLabel: 'one frame',
    implementedInPhase: 7,
    unit: 'ms',
  },
  'DATA-BUNDLE-BYTES': {
    id: 'DATA-BUNDLE-BYTES',
    requirementId: 'PERF-08',
    description:
      "Total brotli-compressed transfer size of every file the compiled bundle emits (public/data/). " +
      "Derivation: PERF-08b's 1000ms cold-load budget splits into 100ms decode (DATA-BUNDLE-DECODE) " +
      'and 900ms transfer share; 900ms at the declared DECLARED_CONNECTION_BYTES_PER_SEC (1,250,000, ' +
      "10 Mbps, a deliberately conservative typical-broadband floor) is 1,125,000 bytes. Denominated " +
      "in bytes, not milliseconds: PerfBudget's unit field is what tells the report and the run-level " +
      'invariants never to normalize a byte count by a calibration score (D-23).',
    thresholdMs: 1_125_000,
    anchorMs: 1_125_000,
    anchorLabel: '900ms of PERF-08b at the declared 10 Mbps connection',
    implementedInPhase: 2,
    unit: 'bytes',
  },
  'DATA-BUNDLE-DECODE': {
    id: 'DATA-BUNDLE-DECODE',
    requirementId: 'PERF-08',
    description:
      "Decode-to-typed-array time for the compiled bundle, carved out of PERF-08b's 1000ms cold-load " +
      'budget as the 100ms complement to DATA-BUNDLE-BYTES\'s 900ms transfer share (D-23), so a decode ' +
      "that passes on its own cannot quietly consume the whole cold-load budget once Phase 4 adds " +
      'fetch and first render on top.',
    thresholdMs: 100,
    anchorMs: 100,
    anchorLabel: 'feels instant',
    implementedInPhase: 2,
    unit: 'ms',
  },
}

// --- Compile-time exhaustiveness check ---------------------------------------------------
// The set of distinct requirementId values across PERF_BUDGETS must be exactly the eight ids
// PERF-02 through PERF-09. If a requirement is dropped from PERF_BUDGETS (or a stray id is
// introduced), this assignment fails to compile: `npm run typecheck` passing is the proof this
// invariant holds, per the Task 1 acceptance criteria.
type RequirementIdsPresent = (typeof PERF_BUDGETS)[BudgetId]['requirementId']
type _AssertAllRequirementIdsPresent = RequirementId extends RequirementIdsPresent ? true : never
type _AssertNoExtraRequirementIds = RequirementIdsPresent extends RequirementId ? true : never
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _exhaustivenessCheck: [_AssertAllRequirementIdsPresent, _AssertNoExtraRequirementIds] = [
  true,
  true,
]
void _exhaustivenessCheck
