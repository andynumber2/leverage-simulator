# Phase 3: Simulation Kernel and the UPRO/TQQQ Gate - Pattern Map

**Mapped:** 2026-08-18
**Files analyzed:** 9
**Analogs found:** 7 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/kernel/backtest.ts` | service (pure compute) | transform (batch, allocation-free) | `bench/kernel.ts` (`runSpikeBacktest`) | exact (structural port) |
| `src/kernel/backtest.types.ts` | model | — | `bench/kernel.ts` (`SpikeKernelParams`/`SpikeKernelResult`) | exact |
| `src/validation/tracking-error.ts` | service | transform (batch, statistical) | none in-repo (new pattern) | no analog — follow RESEARCH.md's Gate 1/Gate 2 spec directly |
| `src/validation/cost-parameters.ts` | config | — | `perf-budgets.ts` (citation-pinned constants table) | role-match |
| `src/data/kernel-inputs.ts` (contribution date resolution, calendarDaysElapsed, percent→fraction) | utility | transform | `tools/bundle-compiler/src/binary-format.ts` (`calendarView`/`seriesView`) + `tools/bundle-compiler/src/calendar.ts` (`toDaysSinceEpoch`) | role-match |
| `tests/kernel/pitfalls-a.test.ts` | test | — | `tests/kernel.test.ts` | exact |
| `tests/validation/upro-tqqq-gate.test.ts` | test | request-response (build-failing gate) | `bench/kernel.bench.test.ts` (measure→record→assert shape) | role-match |
| `bench/kernel.bench.test.ts` (modified) | test (bench) | request-response | itself, prior version | exact |
| `scripts/run-backtest.ts` | utility (CLI script) | request-response | none in-repo | no analog — CLI decoder usage documented in binary-format.ts comments |

## Pattern Assignments

### `src/kernel/backtest.ts` (service, transform)

**Analog:** `bench/kernel.ts`, full file read (168 lines).

**Header/doc pattern** (lines 1-22): document the day-count convention and allocation discipline directly above the function, same structure — but the real kernel's header must state `/360` financing and calendar `/365` ER (D-01/D-02), not the spike's `/365`/`/252`.

**Types pattern** (lines 33-48):
```typescript
export interface SpikeKernelParams {
  leverage: number
  entryIndex: number
  initialInvestment: number
  contributionAmount: number
  contributionIntervalBars: number
  financingSpread: number
  expenseRatio: number
}

export interface SpikeKernelResult {
  finalValue: number
  ruined: boolean
}
```
Real kernel's params drop `contributionIntervalBars` (D-25: calendar-date-anchored, precomputed bar-index array instead) and result gains `ruinBarIndex`, `droppedContributions` (D-21/D-22).

**Hot loop pattern, verbatim structure to port** (lines 57-133):
```typescript
export function runSpikeBacktest(
  params: SpikeKernelParams,
  series: SyntheticSeries,
  outValue: Float64Array,
  outRuined: Uint8Array,
): SpikeKernelResult {
  const { returns, shortRate, calendarDaysElapsed } = series
  const barCount = returns.length
  const { leverage, entryIndex, initialInvestment, contributionAmount,
    contributionIntervalBars, financingSpread, expenseRatio } = params

  let value = initialInvestment
  let ruined = false
  let lastOutIdx = -1

  for (let i = entryIndex; i < barCount; i++) {
    const outIdx = i - entryIndex
    lastOutIdx = outIdx

    if (ruined) {
      outValue[outIdx] = 0
      outRuined[outIdx] = 1
      continue
    }

    const dailyReturn = returns[i] ?? 0
    const rate = shortRate[i] ?? 0
    const calendarGap = calendarDaysElapsed[i] ?? 1

    // A1: leverage applied to the daily return and compounded, never to a cumulative return.
    value = value * (1 + leverage * dailyReturn)

    // A2/A8: financing on the borrowed portion (leverage - 1), calendar-day accrual.
    if (leverage > 1) {
      const financingCost =
        value * (leverage - 1) * (rate + financingSpread) * (calendarGap / CALENDAR_DAYS_PER_YEAR)
      value -= financingCost
    }

    // A4: expense ratio, a genuinely different accrual basis from financing.
    value -= value * (expenseRatio / TRADING_DAYS_PER_YEAR)

    // A7: ruin clamp: the instant the computed value would reach or cross zero.
    if (value <= 0) {
      value = 0
      ruined = true
      outValue[outIdx] = 0
      outRuined[outIdx] = 1
      continue
    }

    if (contributionIntervalBars > 0 && outIdx > 0 && outIdx % contributionIntervalBars === 0) {
      value += contributionAmount
    }

    outValue[outIdx] = value
    outRuined[outIdx] = 0
  }

  const finalValue = lastOutIdx >= 0 ? outValue[lastOutIdx] ?? 0 : initialInvestment
  return { finalValue, ruined }
}
```

**Required corrections when porting** (from 03-CONTEXT.md, not optional):
1. Financing: change `calendarGap / 365` (line 100) to `calendarGap / 360` (D-01). Keep `CALENDAR_DAYS_PER_YEAR` constant name only if renamed to reflect 360; do not reuse the spike's constant value.
2. Expense ratio: change `expenseRatio / TRADING_DAYS_PER_YEAR` (flat /252, line 106) to `expenseRatio * (calendarGap / 365)` (D-02) — this is a structural change (introduces `calendarGap` into the ER term), not a constant swap.
3. Contribution scheduling: replace `outIdx % contributionIntervalBars === 0` (bar-count driven, lines 119-123) with a lookup against a precomputed calendar-date-anchored bar-index array supplied by the caller (D-25). This changes the params shape, not just the arithmetic.
4. Add percent-to-fraction conversion at the data-layer boundary, not inside this loop (D-09) — `rate` and `financingSpread` must already be fractions when they reach this function.
5. Bar 0 (entry) must be cost-free (D-03): the loop currently applies return/financing/ER starting at `i = entryIndex` unconditionally; the real kernel must special-case `i === entryIndex` to set `value = initialInvestment` with no return/cost applied, and start cost accrual at `i = entryIndex + 1`.
6. Ruin bar and dropped-contribution tracking: extend `SpikeKernelResult` with `ruinBarIndex` (D-22) and `droppedContributionsTotal` (D-21); the current `continue`-based ruin branch needs to accumulate the latter when a contribution would have landed post-ruin.
7. Long-gap flag output (D-04): add a third output array (e.g. `outLongGapFlag: Uint8Array`) written whenever `calendarGap` exceeds the chosen threshold; no hot-loop branch cost beyond a compare already being done for `calendarGap`.

**Allocation-free contract** (comment block, lines 18-21): keep verbatim — caller-preallocated `Float64Array`/`Uint8Array` outputs, ruin flag in its own array (not a sentinel), nothing allocated per bar.

---

### `src/kernel/backtest.types.ts` (model)

**Analog:** `bench/kernel.ts` lines 33-48 (same file as above, types section only). Split into its own file per RESEARCH.md's recommended structure — extract `SpikeKernelParams`/`SpikeKernelResult` shape as the base, apply the 7 changes listed above (drop `contributionIntervalBars`, add `ruinBarIndex`, `droppedContributionsTotal`, and the contribution-bar-index array field per D-25/D-31).

---

### `src/validation/tracking-error.ts` (service, transform)

**No direct in-repo analog** — this is a genuinely new computation (D-12: standalone module, sibling to the kernel, not imported by it). Follow 03-CONTEXT.md D-11 directly:
- Gate 1: annualized tracking error = `stdev(dailyReturnDiff) * sqrt(252)`.
- Gate 2: annualized return difference (drift).
- Signature should not assume a test context (D-12: shared by phase tests, CI data-change check, and Phase 5's in-app view) — export a pure function taking two `Float64Array` return series and a window, returning `{ trackingErrorAnnualized, returnDriftAnnualized }`.

Closest *structural* precedent for "compute stat, compare to threshold, throw/report" is `bench/report.ts`'s `checkBudget`/`assertWithinBudget` pattern (see Shared Patterns below) — reuse that shape for the gate's pass/fail check, not for the statistic itself.

---

### `src/validation/cost-parameters.ts` (config)

**Analog:** `perf-budgets.ts`, full file read (243 lines).

**Citation-pinned constant table pattern** (lines 1-13, 55-97):
```typescript
/**
 * perf-budgets.ts: D-21, single source of truth for every performance threshold.
 * A typed TypeScript module, not a runtime-parsed config file. A malformed entry (missing
 * field, wrong type, or a requirementId outside the union) cannot compile: the compiler is
 * the validation layer (see the exhaustiveness check at the bottom of this file).
 */
export interface PerfBudget {
  id: BudgetId
  requirementId: RequirementId
  description: string
  thresholdMs: number
  anchorMs: number
  anchorLabel: string
  implementedInPhase: number
  relaxationReason?: string
  unit: BudgetUnit
}
export const PERF_BUDGETS: Record<BudgetId, PerfBudget> = { /* ... */ }
```

**Compile-time exhaustiveness check** (lines 230-243) — the pattern to copy for D-19's "pin each constant to its cited value" requirement:
```typescript
type RequirementIdsPresent = (typeof PERF_BUDGETS)[BudgetId]['requirementId']
type _AssertAllRequirementIdsPresent = RequirementId extends RequirementIdsPresent ? true : never
type _AssertNoExtraRequirementIds = RequirementIdsPresent extends RequirementId ? true : never
const _exhaustivenessCheck: [_AssertAllRequirementIdsPresent, _AssertNoExtraRequirementIds] = [true, true]
void _exhaustivenessCheck
```

**Apply to `cost-parameters.ts`:** same typed-record-with-required-metadata-fields shape, but each entry needs a `citation: string` (or `source`/`sourceDate`) field instead of `anchorMs`/`anchorLabel`, e.g. `{ id: 'UPRO_EXPENSE_RATIO_INCEPTION', value: 0.0095, citation: '...', confidence: 'ASSUMED' | 'CITED' | 'VERIFIED' }`. A pinning test (analog: none exists yet, write new) should assert `cost-parameters.ts`'s exported constant equals the value named in its own citation comment, per D-19.

**Escalation-marker precedent** (lines 74-78): `ESCALATION_TRIGGER_RATIO` is a similar "known threshold with a documented non-failing warning band" concept — reusable if VALID-02's tolerance also wants a soft-warn tier, though 03-CONTEXT.md D-13/D-20 already specify build-failing-only on the full window with sub-windows reported-not-gated, so this may not be needed.

---

### `src/data/kernel-inputs.ts` (utility, transform)

**Analog:** `tools/bundle-compiler/src/binary-format.ts` (decode/view functions, lines 1-90 read for header/layout, lines 230-251 read for `seriesView`/`calendarView`) and `tools/bundle-compiler/src/calendar.ts` lines 18-27 (`toDaysSinceEpoch`).

**Zero-copy view pattern to reuse for reading bundle data** (`binary-format.ts` lines 236-249):
```typescript
export function seriesView(buffer: ArrayBuffer, header: AssetHeader, descriptor: SeriesDescriptor): Float64Array {
  return new Float64Array(buffer, header.headerByteLength + descriptor.dataByteOffset, descriptor.length)
}

export function calendarView(buffer: ArrayBuffer, header: AssetHeader): Int32Array {
  const descriptor = header.descriptors.find((d) => d.kind === 'calendar')
  if (descriptor === undefined) {
    throw new Error('binary-format: calendarView called on an asset with no calendar descriptor')
  }
  return new Int32Array(buffer, header.headerByteLength + descriptor.dataByteOffset, descriptor.length)
}
```

**Days-since-epoch pattern** (`calendar.ts` lines 18-27, verbatim):
```typescript
export function toDaysSinceEpoch(iso: string): number {
  const parts = iso.split('-')
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY)
}
```

**Use for:** `calendarDaysElapsed` precomputation (D-31: diff consecutive `calendarView` values once, outside the kernel), percent→fraction conversion on the rate series (D-09, a single `/100` map pass over the `Float64Array` the `seriesView` returns), and contribution date→bar-index resolution (D-25/D-26/D-27: index-walk against the calendar `Int32Array`, per RESEARCH.md's "Don't Hand-Roll" table — binary/linear search against the compiled calendar, not a new date library).

---

### `tests/kernel/pitfalls-a.test.ts` (test)

**Analog:** `tests/kernel.test.ts`, full file read (166 lines).

**Fixture-builder pattern** (lines 12-35):
```typescript
function makeFixedSeries(returns: number[], shortRate: number[], calendarDaysElapsed: number[]): SyntheticSeries {
  return {
    returns: Float64Array.from(returns),
    shortRate: Float64Array.from(shortRate),
    calendarDaysElapsed: Int32Array.from(calendarDaysElapsed),
  }
}

function baseParams(overrides: Partial<SpikeKernelParams> = {}): SpikeKernelParams {
  return { leverage: 3, entryIndex: 0, initialInvestment: 10_000, contributionAmount: 0,
    contributionIntervalBars: 0, financingSpread: 0, expenseRatio: 0, ...overrides }
}
```

**Ruin test, the direct structural template for D-23's PITFALLS A7 test** (lines 93-105):
```typescript
test('ruin: a single -40% day at leverage 3 produces a value of exactly 0 with the ruin flag set', () => {
  const series = makeFixedSeries([-0.4], [0], [1])
  const outValue = new Float64Array(1)
  const outRuined = new Uint8Array(1)
  const params = baseParams({ leverage: 3 })
  const result = runSpikeBacktest(params, series, outValue, outRuined)
  expect(outValue[0]).toBe(0)
  expect(outRuined[0]).toBe(1)
  expect(result.finalValue).toBe(0)
  expect(result.ruined).toBe(true)
})
```

**Three-day-gap financing test, the template for D-01's calendar-day-scaling test** (lines 129-147):
```typescript
test('financing cost scales with calendarDaysElapsed: a 3-day gap costs 3x a 1-day gap', () => {
  const params = baseParams({ leverage: 3, financingSpread: 0.005 })
  const seriesOneDay = makeFixedSeries([0], [0.02], [1])
  const seriesThreeDay = makeFixedSeries([0], [0.02], [3])
  // ... run both, assert loss3 ≈ loss1 * 3
})
```
Note: this exact 3x-scaling assertion still holds for `/360` financing since it's linear in `calendarGap`; reuse verbatim with the constant swapped.

**1x invariant test** (lines 76-91) is the direct precedent for SIM-04/D-06 (extend tolerance to the 1e-9 relative deviation D-06 specifies, `toBeCloseTo` with a computed digit count or a manual relative-error assertion rather than `toBeCloseTo(reference, 6)`).

**No-allocation contract test** (lines 149-165) — same pattern applies to the real kernel; extend for SIM-11.

**New assertions this file must add that `tests/kernel.test.ts` does not cover:** D-08 sub-1x negative-financing-as-credit (fast-check property, per RESEARCH.md's Don't-Hand-Roll recommendation), D-03 bar-0 cost-free anchor, D-21 dropped-contribution total, D-22 ruin bar index output, D-04 long-gap flag.

---

### `tests/validation/upro-tqqq-gate.test.ts` (test, request-response)

**Analog:** `bench/kernel.bench.test.ts`, full file read (76 lines) — the measure→record→assert shape, adapted from a perf-budget check to a tracking-error-tolerance check.

**Shape to copy** (lines 24-76): build inputs (here: decode the compiled bundle via `binary-format.ts`'s `seriesView`/`calendarView` rather than `makeSeededGbmSeries`), compute the statistic via the shared module (`tracking-error.ts` instead of `runSpikeBacktest`), then assert against a budget/tolerance object:
```typescript
const budget = PERF_BUDGETS['PERF-02']
const row: MeasurementRow = { /* ... */ verdict: checkBudget({ normalizedMs, budgetMs: budget.thresholdMs }) }
expect(() => assertWithinBudget(row)).not.toThrow()
```
For the gate test, load the real bundle via `tools/bundle-compiler/src/binary-format.ts` (`decodeHeader`, `seriesView`, `calendarView` — see `src/data/kernel-inputs.ts` pattern above), run the kernel at leverage 3 against `SPX/price-return`, compare to `UPRO/total-return` via `tracking-error.ts`, and assert both Gate 1 and Gate 2 stay under the D-14-derived tolerance from `cost-parameters.ts`.

This must run in the Node `unit` project (`vitest.config.ts` `include: ['tests/**/*.test.ts', ...]`), not the browser `bench` project, since it needs filesystem access to the compiled `public/data/` bundle and is a correctness gate, not a timing measurement.

---

### `bench/kernel.bench.test.ts` (modified, test/bench)

**Analog:** itself (prior version), full file read (76 lines). Per Claude's Discretion in 03-CONTEXT.md, swap `runSpikeBacktest`/`SpikeKernelParams` import (line 14) for the real kernel's `runBacktest`/`KernelParams` from `src/kernel/backtest.ts`, and swap `makeSeededGbmSeries` (line 16, from `bench/synthetic-data.ts`) for real bundled series loaded via `binary-format.ts`, since PERF-02 must be measured "on real hardware" against the actual ~25,000-bar history, not the synthetic GBM series the spike used. Everything else (the `measureBatchedMinOfN`/`resolveRunCalibration`/`commands.recordMeasurement` scaffold, lines 40-76) is reused unchanged.

---

### `scripts/run-backtest.ts` (utility, CLI/request-response)

**No direct in-repo analog.** Nearest structural precedent is `tools/bundle-compiler/src/cli.ts` (referenced in `vitest.config.ts` comment, line 18: "the compiled bundle always lands at `public/data`") for the general shape of a Node CLI entry point in this repo, but that file was not read this pass since it is a compiler CLI, not a backtest runner. This script composes `src/data/kernel-inputs.ts` (bundle loading, D-30 boundary) + `src/kernel/backtest.ts` (the run itself) and prints the equity curve; treat it as new integration code, not a port.

## Shared Patterns

### Allocation-free hot loop with caller-owned output buffers
**Source:** `bench/kernel.ts` lines 1-22 (doc comment), 57-133 (implementation)
**Apply to:** `src/kernel/backtest.ts` only. This is the load-bearing SIM-11 pattern: every per-bar write goes into a preallocated `Float64Array`/`Uint8Array`; the function returns a small summary object built once, after the loop.

### Measure → normalize → record → assert (perf/statistical gates)
**Source:** `bench/kernel.bench.test.ts` lines 40-76, backed by `bench/report.ts`'s `checkBudget`/`assertWithinBudget`/`assertRunInvariants`
**Apply to:** `bench/kernel.bench.test.ts` (modified) for PERF-02, and structurally (not literally — different statistic, different pass/fail predicate) informs `tests/validation/upro-tqqq-gate.test.ts`'s compute-then-assert-against-committed-threshold shape.

### Citation-pinned constant table with compile-time exhaustiveness
**Source:** `perf-budgets.ts` lines 1-13, 55-72, 230-243
**Apply to:** `src/validation/cost-parameters.ts` — typed `Record`, one entry per sourced constant, each carrying provenance metadata, with a compile-time (or pinning-test) check that nothing is added/dropped silently.

### Zero-copy typed-array views over the compiled bundle
**Source:** `tools/bundle-compiler/src/binary-format.ts` lines 236-249 (`seriesView`, `calendarView`)
**Apply to:** `src/data/kernel-inputs.ts` and `scripts/run-backtest.ts` — every read of bundled series/calendar data must go through these existing decode functions, never a re-parse.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/validation/tracking-error.ts` | service | transform (statistical) | No existing tracking-error/statistical-comparison module in this repo; this is the phase's first. Follow D-10/D-11 spec directly; borrow only the pass/fail-check shape from `bench/report.ts`. |
| `scripts/run-backtest.ts` | utility (CLI) | request-response | No existing "run a backtest and print output" script; nearest sibling (`tools/bundle-compiler/src/cli.ts`) is a compiler CLI with a different job and was not read this pass — read it directly when planning this file if a CLI-argument-parsing pattern is wanted. |

## Metadata

**Analog search scope:** `bench/`, `tests/`, `tools/bundle-compiler/src/`, repo root (`perf-budgets.ts`, `vitest.config.ts`)
**Files scanned:** `bench/kernel.ts`, `tests/kernel.test.ts`, `bench/kernel.bench.test.ts`, `vitest.config.ts`, `perf-budgets.ts`, `tools/bundle-compiler/src/binary-format.ts` (targeted ranges), `bench/report.ts` (grep only, `assertRunInvariants`/`checkBudget` signatures), `tools/bundle-compiler/src/calendar.ts` (excerpt via RESEARCH.md, cross-checked)
**Pattern extraction date:** 2026-08-18
