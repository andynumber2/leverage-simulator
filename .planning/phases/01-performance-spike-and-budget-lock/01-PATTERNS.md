# Phase 1 Gap Closure: Pattern Map

**Mapped:** 2026-08-16
**Mode:** gap_closure — scoped to the two gaps in `01-VERIFICATION.md` (unenforced `MIN_MEASUREMENT_MS` floor; D-09 self-test validates the wrong layer), cross-referenced against `01-REVIEW.md` CR-01/CR-02/WR-01/WR-02/WR-03.
**Files analyzed:** 7 (all modifications to existing files; no new files except possibly a helper)
**Analogs found:** 7 / 7 (every file is its own best analog — this is a bug-fix pass on a harness that already established its own conventions)

## File Classification

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|-----------------|----------------|
| `bench/calibration.ts` | utility (timing primitive) | transform (raw ms in, floor-checked/normalized ms out) | itself (`measureMinOfN`, `calibrationScore`) + deleted `spike/wasm-microbench/harness/js-batched-reference.ts` for the amortization pattern | exact (self) |
| `bench/report.ts` | utility (invariant/assertion) | batch (aggregates all rows once per run) | itself (`assertRunInvariants`) | exact (self) |
| `bench/global-setup.ts` | config/lifecycle hook | event-driven (Vitest globalSetup/teardown) | itself | exact (self) |
| `bench/kernel.bench.test.ts` | test | request-response (measure → normalize → record → assert) | itself, and `bench/canvas-repaint.bench.test.ts` (sibling with identical shape) | exact (self + sibling) |
| `bench/canvas-repaint.bench.test.ts` | test | request-response | itself, and `bench/kernel.bench.test.ts` | exact (self + sibling) |
| `bench/sweep.bench.test.ts` | test | request-response | `bench/kernel.bench.test.ts` (same measure/normalize/record/assert shape) | exact (sibling) |
| `tests/perf-budgets.selftest.test.ts` | test (self-test / gate-liveness) | request-response (currently calls a pure function; needs to become process/e2e) | none in-repo — **no analog exists for spawning a child process or running the harness end-to-end** (see "No Analog Found") | none |
| `package.json` | config | — | itself (`scripts.bench`) | exact (self) |

## Pattern Assignments

### `bench/calibration.ts` (utility, transform)

**Analog:** itself — the fix is additive, not a copy from elsewhere.

**Current `measureMinOfN` body** (lines 28-40), unchanged today, no floor check:
```typescript
export async function measureMinOfN(n: number, fn: () => void | Promise<void>): Promise<number> {
  let min = Number.POSITIVE_INFINITY
  for (let i = 0; i < n; i++) {
    const start = performance.now()
    // eslint-disable-next-line no-await-in-loop
    await fn()
    const elapsed = performance.now() - start
    if (elapsed < min) {
      min = elapsed
    }
  }
  return min
}
```

**`MIN_MEASUREMENT_MS` declaration** (line 21): `export const MIN_MEASUREMENT_MS = 10` — currently referenced nowhere else in the codebase (confirmed by grep in VERIFICATION.md and independently here).

**`calibrationScore` current non-finite guard** (lines 88-104, the pattern to mirror for the new floor check — same "throw with a diagnostic naming the actual problem" shape):
```typescript
export function calibrationScore(): number {
  let min = Number.POSITIVE_INFINITY
  let sink = 0
  for (let i = 0; i < REPEAT_COUNT; i++) {
    const start = performance.now()
    sink += runReferenceLoop()
    const elapsed = performance.now() - start
    if (elapsed < min) {
      min = elapsed
    }
  }
  if (!Number.isFinite(sink)) {
    throw new Error('calibrationScore: reference loop produced a non-finite accumulator')
  }
  return min / NOMINAL_REFERENCE_MS
}
```

**Fix shape for `measureMinOfN`** (per CR-01's fix block and REVIEW.md, add after the loop, before `return min`):
```typescript
if (min < MIN_MEASUREMENT_MS) {
  throw new Error(
    `measureMinOfN: minimum observed repeat (${min}ms) is below the ${MIN_MEASUREMENT_MS}ms ` +
      'timer-resolution floor — batch more calls per timed unit rather than trusting this figure',
  )
}
```
Also apply WR-02's companion guard to `calibrationScore` (`if (min <= 0) throw ...`) and to `normalize()` (guard `score <= 0` or non-finite before dividing), since both are the same root cause reachable from a different call site.

**Batched-loop amortization reference implementation** — the deleted throwaway spike file, recovered from git history at `git show efce5f4^:spike/wasm-microbench/harness/js-batched-reference.ts`. This is the exact pattern CR-01/Gap-2's "missing" list asks to be applied to the permanent JS bench files:
```typescript
const REPEAT_COUNT = 5
const BATCH_SIZE = 5000

function measureMinOfN(n: number, fn: () => void): number {
  let min = Number.POSITIVE_INFINITY
  for (let i = 0; i < n; i++) {
    const start = performance.now()
    fn()
    const elapsed = performance.now() - start
    if (elapsed < min) min = elapsed
  }
  return min
}

const batchRawMs = measureMinOfN(REPEAT_COUNT, () => {
  for (let i = 0; i < BATCH_SIZE; i++) {
    runSpikeBacktest(params, series, outValue, outRuined)
  }
})
const perCallRawMs = batchRawMs / BATCH_SIZE
```
Apply this shape at the two sub-floor call sites named in VERIFICATION.md Gap 2: PERF-02's kernel call in `bench/kernel.bench.test.ts` (currently a single un-batched `runSpikeBacktest` call per repeat, lines 34-36) and the `putImageData` arm in `bench/canvas-repaint.bench.test.ts` (lines 159-163). Wrap the existing `fn` passed to `measureMinOfN` in an inner `for` loop of `BATCH_SIZE` iterations, then divide the returned raw ms by `BATCH_SIZE` before calling `normalize()`. `BATCH_SIZE` should be tuned so the batched raw time clears `MIN_MEASUREMENT_MS`, matching the spike's precedent of 5000.

---

### `bench/report.ts` (utility, batch)

**Analog:** itself.

**Full current `assertRunInvariants` body** (lines 219-249) — this is the run-level function the fix must extend:
```typescript
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
      'assertRunInvariants: zero rows measured this run — a harness that measures nothing is ' +
        'broken, not passing',
    )
  }

  for (const row of rows) {
    if (!(row.budgetId in PERF_BUDGETS)) {
      throw new Error(`assertRunInvariants: row references unknown budget id "${row.budgetId}"`)
    }
  }

  if (totalRuntimeMs > BENCH_TOTAL_RUNTIME_CAP_MS) {
    throw new Error(
      `assertRunInvariants: total bench runtime ${totalRuntimeMs}ms exceeds the declared cap ` +
        `of ${BENCH_TOTAL_RUNTIME_CAP_MS}ms (D-08) — repeat cost has crept; raising the cap ` +
        'requires a recorded decision, not a silent edit',
    )
  }
}
```
Note it receives `rows: readonly MeasurementRow[]` — already has full visibility into every row's `verdict` field, it just never reads it.

**`Row` type** (`MeasurementRow`, lines 23-37):
```typescript
export interface MeasurementRow {
  budgetId: BudgetId
  requirementId: RequirementId
  measuredMs: number | null
  normalizedMs: number | null
  budgetMs: number
  anchorMs: number
  anchorLabel: string
  source: MeasurementSource
  verdict: Verdict
}
```
`Verdict = 'pass' | 'fail' | 'unmeasured'` (line 14).

**`checkBudget` signature** (lines 45-50):
```typescript
export function checkBudget(row: Pick<MeasurementRow, 'normalizedMs' | 'budgetMs'>): Verdict {
  if (row.normalizedMs === null) {
    return 'unmeasured'
  }
  return row.normalizedMs > row.budgetMs ? 'fail' : 'pass'
}
```

**Fix (per CR-02 and WR-03), add inside `assertRunInvariants`, following the existing throw-with-diagnostic style used by every other check in the function:**
```typescript
const failing = rows.filter((r) => r.verdict === 'fail')
if (failing.length > 0) {
  throw new Error(
    `assertRunInvariants: ${failing.length} row(s) failed budget: ` +
      failing.map((r) => r.budgetId).join(', '),
  )
}
```
WR-03 additionally recommends centralizing the duplicated `normalizedMs > budgetMs` comparison into a single `assertWithinBudget(row: MeasurementRow): void` in this file, called from all three bench test files instead of each hand-writing `expect(normalizedMs).toBeLessThanOrEqual(...)`. This is optional relative to the two blocking gaps but directly enables a cleaner self-test target — evaluate against phase scope before including.

---

### `bench/global-setup.ts` (config/lifecycle hook, event-driven)

**Analog:** itself — this file already wires `assertRunInvariants` into the only place that can produce a non-zero exit; no change needed here unless `assertRunInvariants`'s signature changes.

**Current teardown, exact call site of the invariant check** (lines 43-70):
```typescript
const measured = await loadAccumulatedRows()
const rows = buildFullRowSet(measured)

// eslint-disable-next-line no-console
console.log(renderTable(rows, environment, totalRuntimeMs))

const infoLines = await loadInfoLines()
if (infoLines.length > 0) {
  // eslint-disable-next-line no-console
  console.log(infoLines.join('\n'))
}

await mkdir(RESULTS_DIR, { recursive: true })
const tmpPath = join(dirname(RESULTS_PATH), `.bench-results.json.tmp-${process.pid}`)
const payload = JSON.stringify({ environment, rows, totalRuntimeMs, infoLines }, null, 2)
await writeFile(tmpPath, payload, 'utf8')
await rename(tmpPath, RESULTS_PATH)

// Throws on any violated invariant, which is what turns a budget/coverage/runtime problem
// into a non-zero exit code for `npm run bench` — no separate reporting pipeline (D-03).
assertRunInvariants(rows, totalRuntimeMs)
```
This confirms: once `assertRunInvariants` checks `verdict === 'fail'`, the existing teardown wiring is sufficient — a thrown error here already propagates to a non-zero `vitest run --project bench` exit with no further plumbing needed. No changes required to this file itself.

---

### `bench/kernel.bench.test.ts`, `bench/canvas-repaint.bench.test.ts`, `bench/sweep.bench.test.ts` (test, request-response)

**Analog:** each other — all three share one measure → normalize → record → assert shape.

**Exact inline gate lines:**
- `bench/kernel.bench.test.ts:56` — `expect(normalizedMs).toBeLessThanOrEqual(budget.thresholdMs)`
- `bench/canvas-repaint.bench.test.ts:202` — `expect(winner.normalizedMs).toBeLessThanOrEqual(budget.thresholdMs)`
- `bench/sweep.bench.test.ts:125` — `expect(normalizedMs).toBeLessThanOrEqual(budget.thresholdMs)`

**Full measure/record/assert block from `kernel.bench.test.ts` (lines 33-57)** — the canonical shape to preserve when adding batching to the PERF-02 call site:
```typescript
const score = calibrationScore()
const rawMs = await measureMinOfN(REPEAT_COUNT, () => {
  runSpikeBacktest(params, series, outValue, outRuined)
})
const normalizedMs = normalize(rawMs, score)

await commands.recordEnvironment(captureEnvironment(score))

const budget = PERF_BUDGETS['PERF-02']
const row: MeasurementRow = {
  budgetId: budget.id,
  requirementId: budget.requirementId,
  measuredMs: rawMs,
  normalizedMs,
  budgetMs: budget.thresholdMs,
  anchorMs: budget.anchorMs,
  anchorLabel: budget.anchorLabel,
  source: 'spike-synthetic',
  verdict: checkBudget({ normalizedMs, budgetMs: budget.thresholdMs }),
}
await commands.recordMeasurement(row)

expect(normalizedMs).toBeLessThanOrEqual(budget.thresholdMs)
```
Batching per CR-01's fix wraps only the `fn` passed to `measureMinOfN`; `rawMs` becomes `batchRawMs / BATCH_SIZE` before being passed to `normalize()` and recorded — the rest of this shape is unchanged.

**`canvas-repaint.bench.test.ts`'s `putImageData` arm (lines 159-163)**, the other sub-floor call site:
```typescript
const { ctx: putImageDataCtx } = makeDisplayCanvas()
const putImageDataRawMs = await measureMinOfN(REPEAT_COUNT, () => {
  paintPutImageData(putImageDataCtx, values)
})
const putImageDataNormalizedMs = normalize(putImageDataRawMs, score)
```
Batching here requires a fresh canvas or a documented equivalence justification per repaint inside the batch loop — check whether `paintPutImageData` is idempotent against repeated calls on the same canvas/values before simply looping `BATCH_SIZE` times in place (the existing correctness test above this block, lines 140-146, already proves per-call correctness and is a safe place to note this doesn't change).

If `MIN_MEASUREMENT_MS` enforcement is added inside `measureMinOfN` (as CR-01 recommends) rather than solely at call sites, these three files need no direct edits beyond the batching added at the two named sub-floor sites — the floor check throws automatically for any future call site that regresses below it.

---

### `tests/perf-budgets.selftest.test.ts` (test, gate-liveness self-test)

**Analog:** none in-repo (see "No Analog Found" below). Closest is its own current structure, which must change layer.

**Current full structure** (107 lines): imports `checkBudget` from `bench/report.ts` directly, builds a `MeasurementRow` fixture via `makeRow()`, and asserts `checkBudget(overBudget)` returns `'fail'` (lines 32-43), plus a "sanity that the self-test itself is load-bearing" test (lines 45-51), plus separate `describe` block(s) for the PERF-01a anchor-invariant checks (lines 54-107, unrelated to D-09, keep unchanged).

**What must change:** per CR-02's fix and VERIFICATION.md's `missing:` list, item 2 — "A self-test that exercises that run-level check end-to-end (or spawns the actual bench command) with a deliberately over-budget fixture and asserts a non-zero exit, per D-09's literal wording." Two viable approaches, in order of fidelity to D-09's literal wording:

1. **Spawn the real `npm run bench` (or `vitest run --project bench`) as a child process** against a fixture that forces one budget row to fail, and assert non-zero exit code + expected message in stderr/stdout. This is D-09's literal wording ("asserts it exits non-zero with the correct message") but no existing test in this repo does this — see "No Analog Found."
2. **Call `assertRunInvariants` directly** with a fabricated `rows` array containing one `verdict: 'fail'` row, and assert it throws with a message naming the failing budget id. This tests the actual run-level backstop function (once CR-02's fix lands) without spawning a process — cheaper, still closes Gap 1 in VERIFICATION.md, but is not literally "spawns the harness."

Given `package.json`'s `bench` script (`"bench": "vitest run --project bench"`) requires a real browser via Playwright and takes 5-15s (D-08), and this self-test currently runs in the fast `unit` project on every PR, approach 2 (direct `assertRunInvariants` call) is the pragmatic fit unless the planner decides D-09's literal process-spawn wording is a hard requirement — flag this choice for the planner rather than presupposing it here.

**`makeRow()` fixture helper (lines 17-30)** is reusable regardless of which approach is chosen:
```typescript
function makeRow(overrides: Partial<MeasurementRow> = {}): MeasurementRow {
  return {
    budgetId: 'PERF-05',
    requirementId: 'PERF-05',
    measuredMs: 100,
    normalizedMs: 100,
    budgetMs: 16,
    anchorMs: 16,
    anchorLabel: 'one frame',
    source: 'spike-synthetic',
    verdict: 'fail',
    ...overrides,
  }
}
```

---

### `package.json` (config)

**Analog:** itself.

**Current `scripts` block (lines 7-11):**
```json
"scripts": {
  "typecheck": "tsc --noEmit",
  "test": "vitest run --project unit",
  "bench": "vitest run --project bench"
},
```
No change needed to this file unless the self-test fix (above) chooses the child-process-spawn approach and needs a distinct npm script to invoke, or needs the exact command string (`"vitest run --project bench"`) to construct its spawn call. If approach 2 (direct `assertRunInvariants` call) is chosen, this file requires no edits.

## Shared Patterns

### Throw-with-diagnostic-message, never return a boolean
**Source:** `bench/report.ts` (`assertRunInvariants`, all four existing checks) and `bench/calibration.ts` (`calibrationScore`'s non-finite guard)
**Apply to:** the new floor check in `measureMinOfN`, the new `verdict === 'fail'` check in `assertRunInvariants`, and `normalize()`'s zero/non-finite score guard (WR-02)

Every existing invariant in this codebase throws a `new Error(...)` with a message naming the specific value and the specific rule violated, rather than returning `false`/`undefined`. New checks must follow this exact shape — do not introduce a boolean-returning validator anywhere in `bench/`.

### Batched-loop amortization for sub-floor single-call costs
**Source:** deleted `spike/wasm-microbench/harness/js-batched-reference.ts` (recovered via `git show efce5f4^:spike/wasm-microbench/harness/js-batched-reference.ts`)
**Apply to:** `bench/kernel.bench.test.ts`'s PERF-02 call site, `bench/canvas-repaint.bench.test.ts`'s `putImageData` arm

Wrap the timed `fn` in a fixed-size inner loop (`BATCH_SIZE`, precedent value 5000), divide the returned raw ms by `BATCH_SIZE` before normalizing. Preallocate all buffers/params outside the timed region exactly as the untouched single-call version already does.

### Measure → normalize → record → assert
**Source:** `bench/kernel.bench.test.ts`, `bench/canvas-repaint.bench.test.ts`, `bench/sweep.bench.test.ts`
**Apply to:** any edit to the three bench test files must preserve this exact four-step shape: `measureMinOfN` → `normalize` → `commands.recordMeasurement(row)` → `expect(normalizedMs).toBeLessThanOrEqual(budget.thresholdMs)`. Do not remove the inline `expect()` even after `assertRunInvariants` gains a run-level backstop — WR-03 flags the duplication as a warning to eventually centralize, not a directive to delete the per-file gate now.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `tests/perf-budgets.selftest.test.ts` (rewritten portion) | test (process/e2e) | request-response via child process, or direct call to a throwing function | No test anywhere in this repository spawns a child process or shell command — `grep -rln "execSync\|spawn\|execa\|child_process"` across all `.ts` files (excluding `node_modules`) matches only `bench/sweep-pool.ts`, and that match is a doc-comment use of the English word "spawn" referring to Web Worker construction (`navigator.hardwareConcurrency - 1`, "never spawn zero workers"), not `child_process.spawn`. There is no process-spawning test pattern to copy in this codebase; if the planner chooses D-09's literal "spawns the actual bench command" reading, this is greenfield within the repo and should use Node's built-in `node:child_process` `execFileSync`/`spawnSync` directly rather than adding a new dependency (no `execa` or similar is currently installed). If the planner instead chooses the direct-`assertRunInvariants`-call approach, this gap does not apply — `bench/report.ts` and its existing exports are a sufficient analog. |

## Metadata

**Analog search scope:** `bench/`, `tests/`, `perf-budgets.ts`, `package.json`, `.github/workflows/ci.yml` (read for context, unchanged), deleted `spike/wasm-microbench/` recovered via `git show <pre-deletion-commit>^:<path>`
**Files scanned:** 8 read directly (`calibration.ts`, `report.ts`, `global-setup.ts`, `perf-budgets.selftest.test.ts`, `package.json`, `kernel.bench.test.ts`, `canvas-repaint.bench.test.ts` excerpt, `sweep.bench.test.ts` line grep) plus 1 recovered from git history (`js-batched-reference.ts`)
**Pattern extraction date:** 2026-08-16
