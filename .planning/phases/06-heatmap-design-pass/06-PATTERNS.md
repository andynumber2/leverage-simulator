# Phase 6: Heatmap Design Pass - Pattern Map

**Mapped:** 2026-08-21
**Files analyzed:** 9 (new) + 1 modified (PROJECT.md Key Decision, out of scope for code patterns)
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `tools/sweep-fixture/build-sweep-fixture.ts` (or `scripts/`, Claude's Discretion) | script/utility | batch (10,000x CRUD-style kernel call + serialize) | `scripts/run-backtest.ts` | exact (same request-building/loader pipeline, looped) |
| `src/data/sweep-fixture-format.ts` (binary encode/decode for D-29 fixture) | utility | file-I/O (binary read/write) | `tools/bundle-compiler/src/binary-format.ts` | exact (identical "magic+version header, fail loud" shape) |
| `src/colorscale/value-to-color.ts` (D-27 graduated colour function) | utility | transform (pure function) | `bench/canvas-grid.ts` (`mapValueToRgba`) | role-match (explicit Phase 1 precursor named by D-27; do not extend in place) |
| `tests/value-to-color.test.ts` | test | transform | `tests/canvas-grid.test.ts` | exact (same pure-function assertion style, same `unit` project) |
| `tests/color-scale-cvd.test.ts` (D-17 CVD assertion) | test | transform | `tests/canvas-grid.test.ts` | role-match (pure-function unit test in `unit` project; no direct CVD analog exists) |
| `tests/sweep-fixture-format.test.ts` | test | file-I/O (round-trip) | `tools/bundle-compiler` decode tests (see `decodeHeader`/`BundleVersionMismatchError` pattern) | role-match |
| `bench/heatmap-repaint.bench.test.ts` (one file, or one per form) | test/bench | request-response (paint-then-measure) | `bench/canvas-repaint.bench.test.ts` | exact (equivalence-then-measure pattern explicitly named to extend) |
| `.planning/phases/06-heatmap-design-pass/mockups/*.html` + `shared/fixture-loader.ts` | component (plain HTML/vanilla JS, outside `src/`) | request-response (fetch fixture, canvas paint, theme subscribe) | `src/app/components/ResultColumn/EquityCurveChart.tsx` (theme-read pattern only) + `bench/canvas-grid.ts` (paint pattern) | role-match (no direct plain-HTML analog exists in-repo; compose from two) |
| `.planning/phases/06-heatmap-design-pass/mockups/comparison.html` (D-05, Solid entry) | component | request-response | `src/app/theme.ts` (subscribe/toggle wiring) | role-match |

## Pattern Assignments

### `tools/sweep-fixture/build-sweep-fixture.ts` (script, batch)

**Analog:** `scripts/run-backtest.ts` (read in full this session)

**Imports pattern** (lines 19-30):
```typescript
import { fromDaysSinceEpoch } from '../tools/bundle-compiler/src/calendar.ts'
import { runBacktest } from '../src/kernel/backtest.ts'
import { buildKernelInputs, type BacktestRequest } from '../src/data/kernel-inputs.ts'
import { loadBundleFromDisk } from '../src/data/load-bundle-node.ts'
import {
  COST_PARAMETERS,
  FINANCING_SPREAD_DEFAULT,
  FINANCING_SPREAD_RANGE,
  GENERIC_3X_EXPENSE_RATIO,
} from '../src/validation/cost-parameters.ts'
```
The sweep script imports the identical set, minus the CLI-arg parsing (`parseArgs`) machinery,
which is single-run-specific and not needed for a fixed 200x50 sweep.

**Core per-cell pattern** (the reusable core, already adapted in RESEARCH.md's Pattern 1 — copy
verbatim, do not reimplement the byte path):
```typescript
const bundle = await loadBundleFromDisk()

const request: BacktestRequest = {
  symbol: 'SPX',
  dividendReinvest: true,          // D-11: total-return
  leverage: 1.0,                    // sweep row, 1x..5x over 50 rows (D-08)
  entryDate: '1988-01-05',          // sweep column, over the strict-tier range (D-09)
  holdingPeriodBars: null,          // resolve to the fixed 20-year bar count (D-10/D-11)
  initialInvestment: 10_000,
  contributionAmount: 0,
  contributionFrequency: 'none',
  expenseRatioPercent: GENERIC_3X_EXPENSE_RATIO * 100,
  financingSpreadPercent: FINANCING_SPREAD_DEFAULT * 100,
}
const inputs = buildKernelInputs(bundle, request)
const result = runBacktest(inputs.params, inputs.series, inputs.outputs)
const multipleOfContributed = result.totalContributed > 0
  ? result.finalValue / result.totalContributed
  : 0 // matches src/app/state.ts:189's own formula, verbatim
```

**Allocation discipline (SIM-11), extracted from `src/data/kernel-inputs.ts`'s module doc:**
the outer 200x50 loop must preallocate its output typed arrays (values, ruined-flag bytes,
incomplete-flag bytes) once before the loop starts and write into them per cell — never allocate
inside the loop. `buildKernelInputs`/`runBacktest` themselves already follow this discipline
(SIM-10/SIM-11 asserted by `tests/kernel/module-boundary.test.ts` and
`tests/kernel/allocation.test.ts`); the new sweep script's own outer loop must match it, not just
rely on the kernel already doing so.

**Module-boundary constraint (SIM-10), extracted from `tests/kernel/module-boundary.test.ts`:**
```typescript
/** SIM-10: the only module specifier the kernel is permitted to import. */
const ALLOWED_SPECIFIERS = new Set(['./backtest.types.ts'])
```
The sweep script must call the kernel only through `buildKernelInputs` + `runBacktest`, the same
seam `scripts/run-backtest.ts` and `tests/kernel/module-boundary.test.ts` already enforce — it
must not create a second, parallel path into `src/kernel/`.

**Entry-date domain (verified, not to be re-derived):** SPX/total-return strict tier is
`1988-01-05` to `2026-08-14` [manifest `public/data/manifest.f0a9dfbdfa.json`]. 200 columns
should be resolved from this range via the bundle's own calendar/tier machinery
(`tools/bundle-compiler/src/seams.ts`'s `computeTierRanges`), not a hand-picked date list.

**Cost defaults:** `GENERIC_3X_EXPENSE_RATIO = 0.009`, `FINANCING_SPREAD_DEFAULT = 0.005`
[`src/validation/cost-parameters.ts`], same defaults `scripts/run-backtest.ts` falls back to.

**Error handling pattern:** `scripts/run-backtest.ts` fails loud on bad CLI input via
`process.stderr.write` + `process.exitCode = 1` (see lines 141-145, 148-151). The sweep script has
no CLI surface, but should fail loud (throw, not silently skip) on any cell whose
`buildKernelInputs`/`runBacktest` call throws — a corrupted or out-of-range cell must abort the
whole sweep, not silently produce a hole in the fixture.

---

### `src/data/sweep-fixture-format.ts` (utility, file-I/O — binary header + payload)

**Analog:** `tools/bundle-compiler/src/binary-format.ts` (read in full this session)

**Header shape to copy** (lines 37-38, 176-200 excerpted):
```typescript
export const MAGIC = 0x4c56_4744          // pick a new, distinct magic for the sweep fixture
export const FORMAT_VERSION = 1

export class BundleVersionMismatchError extends Error {
  readonly headerBundleVersion: string
  readonly expectedBundleVersion: string
  constructor(headerBundleVersion: string, expectedBundleVersion: string) {
    super(
      `binary-format: asset bundleVersion "${headerBundleVersion}" does not match expected "${expectedBundleVersion}"`,
    )
    this.name = 'BundleVersionMismatchError'
    this.headerBundleVersion = headerBundleVersion
    this.expectedBundleVersion = expectedBundleVersion
  }
}

export function decodeHeader(buffer: ArrayBuffer, expectedBundleVersion: string): AssetHeader {
  const view = new DataView(buffer)
  const magic = view.getUint32(0, true)
  if (magic !== MAGIC) {
    throw new Error(`binary-format: asset magic 0x${magic.toString(16)} does not match expected 0x${MAGIC.toString(16)}`)
  }
  const formatVersion = view.getUint16(4, true)
  if (formatVersion !== FORMAT_VERSION) {
    throw new Error(`binary-format: asset formatVersion ${formatVersion} does not match expected ${FORMAT_VERSION}`)
  }
  // ... rest of header decode
}
```

**Applies to D-29's fixture:** same "magic + version header, fail loud on mismatch" shape (not the
same field layout — this is a new 10,000-cell sweep-result format, not a price series). Per the
Security Domain section of RESEARCH.md, the fixture parser must throw on a magic/version mismatch
rather than silently misreading a stale or corrupted fixture — this is the one V5 input-validation
surface this phase has.

**Payload layout guidance:** Float32 value per cell + a flag byte per cell (ruined/incomplete),
per D-29 ("~90KB, Float32 plus flag bytes"). Follow `binary-format.ts`'s alignment discipline
(`DATA_SECTION_ALIGNMENT = 8`, `alignTo` helper) if the payload needs typed-array views at
non-trivial offsets; a flat `Float32Array` + separate `Uint8Array` of flags, each read via
`new Float32Array(buffer, offset, length)`, avoids most alignment concerns since both are already
naturally aligned when placed after a padded header.

---

### `src/colorscale/value-to-color.ts` (utility, pure transform — D-27)

**Analog:** `bench/canvas-grid.ts`'s `mapValueToRgba` (read in full this session) — **explicitly
named by D-27 as "the Phase 1 precursor... read it, do not extend it in place."**

**What to read, not copy verbatim** (lines 67-85):
```typescript
export function mapValueToRgba(value: number): RgbaColor {
  const safeValue = value > 0 ? value : Number.MIN_VALUE
  const logValue = Math.log10(safeValue)
  const clampedLog = Math.min(VALUE_LOG_MAX, Math.max(VALUE_LOG_MIN, logValue))
  const t = (clampedLog - VALUE_LOG_MIN) / (VALUE_LOG_MAX - VALUE_LOG_MIN)
  const r = Math.round(255 * t)
  const g = 64   // <-- test-only equivalence-proof artifact, DO NOT carry into the real function
  const b = Math.round(255 * (1 - t))
  const a = 255
  return [r, g, b, a]
}
```
**What must differ in the real function** (per D-13/D-14/D-15/D-18/D-20, and RESEARCH.md's
Pattern 2 skeleton, values NOT verified — placeholders only):
```typescript
export interface ColorScaleInput {
  value: number
  ruined: boolean
  incomplete: boolean
}

export function valueToColor(input: ColorScaleInput): [r: number, g: number, b: number, a: number] {
  if (input.ruined) return RUIN_HATCH_BASE_RGBA        // D-18: caller draws the hatch, not a lerp
  if (input.incomplete) return INCOMPLETE_GREY_RGBA    // D-20: flat, no value encoded
  const logValue = Math.log10(Math.max(input.value, Number.MIN_VALUE))   // D-14: symlog about 1.0x
  const clamped = Math.min(DOMAIN_LOG_MAX, Math.max(DOMAIN_LOG_MIN, logValue))
  const t = (clamped - DOMAIN_LOG_MIN) / (DOMAIN_LOG_MAX - DOMAIN_LOG_MIN)  // D-16 fixed domain
  return interpolateDivergingStops(t)  // D-13/D-15: diverging, background-neutral midpoint
}
```
Differences from the analog: (1) diverging not single-lerp — midpoint must sit at `t=0.5`
exactly where `log10(1.0)=0` normalizes to; (2) two categorical branches (ruin/incomplete) that
`mapValueToRgba` has no equivalent of; (3) the green-channel-fixed-at-64 trick is a **test-only**
paint-equivalence artifact specific to `canvas-grid.ts` and must not appear in the real function.

**Module placement (F-05):** a new sibling directory of `src/metrics/`, e.g. `src/colorscale/` —
must not live under `src/app/` (mockups are plain HTML, must not drag in Solid) and must not be
imported by the kernel (SIM-10's `ALLOWED_SPECIFIERS` boundary test would need updating if it
ever were, which it should not be).

---

### `tests/value-to-color.test.ts` (test, transform)

**Analog:** `tests/canvas-grid.test.ts` (read in full this session)

**Structure to copy** (lines 1-51):
```typescript
import { describe, expect, test } from 'vitest'
import { CELL_COUNT, GRID_COLS, GRID_ROWS, makeGridValues, mapValueToRgba } from '../bench/canvas-grid.ts'

describe('mapValueToRgba', () => {
  test('returns four integer channel values, each in [0, 255]', () => {
    for (const value of [1e-4, 1e-3, 0.5, 1, 10, 100, 1000, 1e4]) {
      const [r, g, b, a] = mapValueToRgba(value)
      for (const channel of [r, g, b, a]) {
        expect(Number.isInteger(channel)).toBe(true)
        expect(channel).toBeGreaterThanOrEqual(0)
        expect(channel).toBeLessThanOrEqual(255)
      }
    }
  })
})
```
`tests/value-to-color.test.ts` should follow the same table-driven, pure-function style, plus
new cases this analog has no equivalent of: (a) `t=0.5`/`value=1.0` maps to the exact neutral
midpoint stop (Pitfall E1's residual risk — verify the true midpoint, not an approximation), (b)
`ruined: true` always returns the fixed ruin-hatch base colour regardless of `value`, (c)
`incomplete: true` always returns the fixed grey regardless of `value`, (d) domain clipping at
the fixed D-16 endpoints (values beyond either endpoint still return a valid, clamped colour, not
NaN/undefined channels). Runs in the fast Node `unit` project, same as the analog (no canvas
needed — pure function only).

---

### `tests/color-scale-cvd.test.ts` (test, transform — D-17)

**No direct in-repo analog** (F-05/Open Question 1's CVD-simulation problem has no repo
precedent). Use `tests/canvas-grid.test.ts`'s table-driven pure-function style as the structural
analog (`describe`/`test` blocks over a fixed set of sample inputs, asserting numeric bounds), but
the CVD transform matrices themselves must be sourced externally per RESEARCH.md's Don't
Hand-Roll section (`github.com/DaltonLens/libDaltonLens`), not invented. Runs in the `unit`
project — pure colour-space math needs no DOM/canvas.

---

### `tests/sweep-fixture-format.test.ts` (test, file-I/O round-trip)

**Analog:** `tools/bundle-compiler/src/binary-format.ts`'s `decodeHeader`/`encodeHeader` pair and
its `BundleVersionMismatchError` (read in full this session). Follow the existing binary-compiler
test convention (not read this session, but implied by the encode/decode pair existing as a
matched set): encode a small fixture in memory, decode it back, assert every field round-trips
exactly; separately assert `decodeHeader`-equivalent behavior throws on a corrupted magic byte and
on a mismatched format version, mirroring `BundleVersionMismatchError`'s fail-loud contract.

---

### `bench/heatmap-repaint.bench.test.ts` (bench, request-response — criterion 4)

**Analog:** `bench/canvas-repaint.bench.test.ts` (read in full this session)

**Imports pattern** (lines 20-37):
```typescript
import { commands } from 'vitest/browser'
import { beforeEach, expect, test } from 'vitest'

import { CELL_SIZE_PX, GRID_COLS, GRID_ROWS, makeGridValues, mapValueToRgba, paintFillRect, paintPutImageData, type RgbaColor } from './canvas-grid.ts'
import { PERF_BUDGETS } from '../perf-budgets.ts'
import { measureBatchedMinOfN, normalize, REPEAT_COUNT } from './calibration.ts'
import { resolveRunCalibration } from './canonical-calibration.ts'
import { captureEnvironment } from './environment-block.ts'
import { assertWithinBudget, checkBudget, type MeasurementRow } from './report.ts'
```

**Equivalence-before-timing pattern** (lines 101-156, the load-bearing pattern per F-02 — must be
proven per form before any timing figure is trusted):
```typescript
test('equivalence: paintX writes the expected color into the expected cells, proven before timing', () => {
  const { ctx } = makeDisplayCanvas()
  clearToBackground(ctx)
  for (const { col, row } of SAMPLE_CELLS) {
    expect(samplePixelAtCellCenter(ctx, col, row)).toEqual(BACKGROUND)
  }
  paintX(ctx, values)
  for (const { col, row } of SAMPLE_CELLS) {
    const expected = mapValueToRgba(values[cellIndex(col, row)] ?? 0)
    expect(samplePixelAtCellCenter(ctx, col, row)).toEqual(expected)
  }
})
```

**Measurement + `normalize()` + `.bench/bench-results.json` reporting convention** (lines 160-218,
extend per-form, not shared across forms per D-12/F-02):
```typescript
const score = await resolveRunCalibration()
const rawMs = await measureBatchedMinOfN(REPEAT_COUNT, BATCH_SIZE, () => { paintForm(ctx, values) })
const normalizedMs = normalize(rawMs, score)
await commands.recordEnvironment(captureEnvironment(score))

const budget = PERF_BUDGETS['PERF-05']
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
expect(() => assertWithinBudget(row)).not.toThrow()
```
Every per-form criterion-4 figure must go through this exact `normalize()` → `MeasurementRow` →
`commands.recordMeasurement` → `assertWithinBudget` chain, landing in `.bench/bench-results.json`
with a verdict and machine/core-count attribution — never a hand-recorded number in a doc. Do not
invent a new budget id; every form's test asserts against the same `PERF_BUDGETS['PERF-05']` row
(`thresholdMs: 16`) named by criterion 4.

**Deviation from the analog required by D-12:** the original file measures two arms on **one
shared canvas geometry** (`CANVAS_WIDTH = GRID_COLS * CELL_SIZE_PX`). The heatmap version measures
**four forms at four different geometries** (each form's own `CELL_SIZE_PX`/strip width/contour
canvas size) — per F-02, state explicitly in a comment that the four normalized figures are each
individually gated against 16ms but are not directly comparable to each other as a ranking, since
they are not painting the same canvas dimensions.

---

### Mockup HTML files + `shared/fixture-loader.ts` (plain HTML/vanilla JS, outside `src/`)

**No single existing analog** — this is the first plain-HTML, non-Solid, non-bundled surface in
the repo. Compose from two:

**Theme-read-at-render-time pattern**, analog `src/app/components/ResultColomn/EquityCurveChart.tsx` /
`src/app/theme.ts` (read in full this session):
```typescript
// Reused verbatim, per 06-UI-SPEC.md's Design System row: "the theme toggle, reused verbatim
// from src/app/theme.ts"
import { onThemeChange, resolveTheme } from '../../../src/app/theme.ts'

function readCssColor(customProperty: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(customProperty).trim()
}
const unsubscribe = onThemeChange(() => repaintCanvas())
```
Note `theme.ts`'s own explicit warning (lines 11-17): it re-queries `window.matchMedia` on every
call rather than caching at module scope, specifically so it composes correctly with
non-Solid-app contexts that import it after their own setup runs — this property is what makes it
safe to import from a plain-HTML mockup context, not just from Solid app code.

**Canvas paint pattern (per-cell fillRect and single-pass putImageData)**, analog
`bench/canvas-grid.ts`'s `paintFillRect` / `paintPutImageData` (lines 92-152) — reused per
CONTEXT.md's Claude's Discretion note ("Which of the two Phase 1 canvas paths... each form
uses"). Each mockup form picks one of these two paint strategies at its own D-12 geometry, calling
`valueToColor` (the graduated function) instead of `mapValueToRgba`.

**Serving mechanism (Open Question 2, resolved per RESEARCH.md's recommendation):** serve via
`vite dev` rather than a bare `file://` open or a separate static server — the mockups' `import`
of `src/colorscale/value-to-color.ts` and `src/app/theme.ts` needs real ESM resolution, which
`vite dev` already provides with zero new tooling.

---

### `mockups/comparison.html` (D-05, Solid entry point)

**Analog:** `src/app/theme.ts`'s subscribe/toggle wiring (same file as above) for the one
interactive element (theme toggle) this page has. No other Solid analog is needed — D-05's page
is deliberately simple (four co-equal panels, no other state).

---

## Shared Patterns

### Fail-loud binary header (V5 input validation)
**Source:** `tools/bundle-compiler/src/binary-format.ts` `decodeHeader` + `BundleVersionMismatchError`
**Apply to:** `src/data/sweep-fixture-format.ts`'s D-29 fixture decoder
```typescript
const magic = view.getUint32(0, true)
if (magic !== MAGIC) {
  throw new Error(`... magic 0x${magic.toString(16)} does not match expected 0x${MAGIC.toString(16)}`)
}
```
A corrupted or stale committed fixture must throw, never render a plausible-looking wrong heatmap.

### Kernel access seam (SIM-10)
**Source:** `src/data/kernel-inputs.ts` (`buildKernelInputs`), `tests/kernel/module-boundary.test.ts`
**Apply to:** `tools/sweep-fixture/build-sweep-fixture.ts` — the offline sweep script must go
through `buildKernelInputs` + `runBacktest` exactly as `scripts/run-backtest.ts` does, must not
reimplement the byte path, and must not give the kernel a second import source.

### Numeric formatting contract
**Source:** `src/metrics/format.ts` (`formatMultiple`)
**Apply to:** D-24's legend tick labels — reuse `formatMultiple`, do not add a second formatter.
Note the unresolved tension recorded in RESEARCH.md's Pitfall section: `formatMultiple` always
renders two decimals (`"1.00x"`), while `06-UI-SPEC.md`'s copy table shows bare integers
(`"1x"`). The planner/executor must pick one explicitly (call it as-is, or add a documented
trimming step) rather than let it be discovered at verify time.

### Theme-aware canvas repaint
**Source:** `src/app/theme.ts` (`onThemeChange`), `EquityCurveChart.tsx` (`getComputedStyle` read)
**Apply to:** every mockup form's canvas (D-06 requires both themes; canvas gets no free
`prefers-color-scheme` styling).

### Calibration-normalized performance measurement
**Source:** `bench/canvas-repaint.bench.test.ts` (`normalize`, `MeasurementRow`, `.bench/bench-results.json`)
**Apply to:** `bench/heatmap-repaint.bench.test.ts`, criterion 4's per-form figures. Every figure
must be real-hardware, calibration-normalized, and machine/core-count attributed — never
hand-recorded.

## No Analog Found

None — all 9 new/modified files have at least a role-match analog. The plain-HTML mockup surface
(no bundler, no framework) has no single precedent and is explicitly composed from two existing
patterns (theme read + canvas paint) rather than one direct analog; this is noted above, not
listed as a gap, since RESEARCH.md's own Architecture Patterns section already specifies the
composition.

## Metadata

**Analog search scope:** `scripts/`, `bench/`, `tests/`, `src/data/`, `src/app/theme.ts`,
`src/app/components/ResultColumn/EquityCurveChart.tsx`, `src/metrics/format.ts`,
`tools/bundle-compiler/src/binary-format.ts`, `tests/kernel/module-boundary.test.ts`
**Files scanned:** 9 read in full or targeted sections this session (all listed as analogs above)
**Pattern extraction date:** 2026-08-21
