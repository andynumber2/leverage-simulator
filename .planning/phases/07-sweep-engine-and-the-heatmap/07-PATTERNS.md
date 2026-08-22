# Phase 7: Sweep Engine and the Heatmap - Pattern Map

**Mapped:** 2026-08-22
**Files analyzed:** 14 (new) + 4 (extended)
**Analogs found:** 18 / 18

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/sweep/sweep-pool.ts` | service (Worker pool orchestrator) | event-driven / batch | `bench/sweep-pool.ts` | role-match (structure); needs new cancellation mechanism |
| `src/sweep/sweep.worker.ts` | service (Worker RPC target) | batch / transform | `bench/sweep.worker.ts` | role-match (structure); computes real kernel, not synthetic |
| `src/sweep/sweep-grid.ts` | model (live per-cell result grid) | transform | `src/data/sweep-fixture-format.ts` (in-memory `SweepFixture` shape only, not the binary codec) | role-match |
| `src/sweep/resolve-column-series.ts` | service (per-column series resolution) | transform | `src/data/kernel-inputs.ts` (`buildKernelInputs`) | exact (same resolution logic minus per-cell `leverage`) |
| `src/heatmap/iso-lines.ts` | utility (pure geometry) | transform | `.planning/.../mockups/shared/iso-lines.ts` | exact (near-verbatim graduation, D-11) |
| `src/heatmap/field-sampler.ts` | utility (pure geometry, D-08 oracle) | transform | `.planning/.../mockups/shared/field-sampler.ts` | exact (near-verbatim graduation, D-11) |
| `src/heatmap/polygon-fill.ts` | utility (new: ring-stitcher + polygon builder) | transform | `.planning/.../mockups/shared/iso-lines.ts` (segment emission) + `.planning/.../mockups/forms/form-2-filled-contour.ts` (consumer shape) | role-match, new algorithm |
| `src/heatmap/paint-contour.ts` | component (canvas renderer) | transform / streaming (progressive) | `.planning/.../mockups/forms/form-2-filled-contour.ts` | exact (adapted to variable grid + live data) |
| `src/heatmap/hatch-pattern.ts` | utility (canvas pattern) | transform | `.planning/.../mockups/shared/mockup-runtime.ts` (`makeHatchPattern`) | exact (graduation candidate, not named by D-11 but same shape) |
| `src/colorscale/value-to-color.ts` (extended) | utility (colour scale) | transform | itself (Phase 6) | exact — add `SEQUENTIAL_RAMP_STOPS` + second interpolator, or parameterize `interpolateRamp` |
| `src/metrics/irr.ts` (extended, perf only) | utility (numeric solver) | transform | itself (Phase 4/5) | exact — replace `Math.pow` NPV loop with Horner-style loop (D-24 perf lead) |
| `src/app/state.ts` (extended) | store | event-driven | itself (existing `scheduleRun`/`updateBacktestRequest` store pattern) | exact — add sweep store alongside single-run store |
| `src/app/permalink.ts` (extended) | utility (codec) | transform | itself (existing `PERMALINK_KEYS` allow-list codec) | exact — extend `PERMALINK_KEYS` + `encodeField`/decode branches |
| `src/app/components/ResultColumn/HeatmapPanel.tsx` | component | request-response | `src/app/components/ResultColumn/EquityCurveChart.tsx` | role-match (Solid component wrapping canvas/uPlot against store) |
| `src/app/components/ResultColumn/SliceChart.tsx` | component (uPlot marginal chart) | request-response | `src/app/components/ResultColumn/EquityCurveChart.tsx` | exact (same uPlot integration pattern, one row/col reader) |
| `src/app/components/ResultColumn/SweepModeToggle.tsx` | component (mode switch) | request-response | `src/app/components/ParameterColumn/HoldingModeControl.tsx` | role-match (radiogroup-style toggle over `state.ts`) |
| `src/app/components/ParameterColumn/HoldingModeControl.tsx` (reused, not modified) | component | request-response | itself | exact — D-27 reuses as-is for sweep-mode toggle wiring |
| `perf-budgets.ts` (extended: PERF-04/06/09 measurement wiring) | config | batch | itself (PERF-03/05 already declared) | exact |
| `bench/heatmap-form-2.bench.test.ts` (moved/retargeted, F-05) | test | batch | itself | exact — recorder moves from mockup form to `src/heatmap/paint-contour.ts` |

## Pattern Assignments

### `src/sweep/sweep-pool.ts` (service, event-driven/batch)

**Analog:** `bench/sweep-pool.ts` (208 lines, read in full)

**Worker-count / chunking pattern** (lines 30-58):
```typescript
export function workerCountForCores(cores: number): number {
  return Math.max(1, cores - 1)
}
export function resolveWorkerCount(): number {
  return workerCountForCores(navigator.hardwareConcurrency || 1)
}
const CHUNKS_PER_WORKER = 4 // one worker never idles while chunks remain (PITFALLS F4)
```

**Transfer-not-clone + chunk timeout pattern** (lines 170-195):
```typescript
const buffer = new ArrayBuffer(cellsInChunk * Float64Array.BYTES_PER_ELEMENT)
const timeout = new Promise<never>((_resolve, reject) => {
  timeoutHandle = setTimeout(() => reject(new Error(`sweep worker ${workerIndex} timed out...`)), chunkTimeoutMs)
})
const resultBuffer = await Promise.race([
  remote.runChunk(chunk, Comlink.transfer(buffer, [buffer])),
  failure,
  timeout,
])
```

**Worker-failure-as-promise pattern** (lines 78-98) — attach failure listeners BEFORE dispatching any chunk, so a module-eval throw is not missed:
```typescript
function watchWorkerFailure(worker: Worker, index: number): Promise<never> {
  const failure = new Promise<never>((_resolve, reject) => {
    worker.addEventListener('error', (event) => reject(new Error(`sweep worker ${index} failed: ${event.message}`)))
    worker.addEventListener('messageerror', () => reject(new Error(`sweep worker ${index} failed: messageerror event`)))
  })
  failure.catch(() => {}) // prevents unhandled-rejection warning on the success path
  return failure
}
```

**What must NOT be copied:** the `finally { for (const worker of workers) worker.terminate() }` teardown (lines 196-200) — this tears down the pool on every call, which is correct for a one-shot bench but wrong for the production pool. Per RESEARCH.md Pattern 2, the production pool must be **persistent across sweeps** (constructed once, kept alive for sweep-mode's lifetime) with a **generation/epoch token** on each `ChunkRequest`, so a cancelled sweep is an O(1) "ignore this result, its generation is stale" check on the main thread rather than a worker-teardown-and-reconstruct. Comlink has no built-in cancellation primitive (verified against `github.com/GoogleChromeLabs/comlink/issues/372`), so this generation-token layer is new code, not something to find in the library.

---

### `src/sweep/sweep.worker.ts` (service, batch/transform)

**Analog:** `bench/sweep.worker.ts` (70 lines, read in full)

**Comlink expose + scratch-buffer-reuse pattern** (lines 15-70):
```typescript
import * as Comlink from 'comlink'

let cachedSeed: number | null = null
let cachedSeries: SyntheticSeries | null = null
function getSeriesForSeed(seed: number): SyntheticSeries { /* cache keyed by seed, one series per worker lifetime */ }

const scratchValue = new Float64Array(BAR_COUNT)   // allocation-free dispatch loop, mirrors kernel's own SIM-11 discipline
const scratchRuined = new Uint8Array(BAR_COUNT)

const sweepWorkerApi = {
  runChunk(request: ChunkRequest, buffer: ArrayBuffer): ArrayBuffer {
    const series = getSeriesForSeed(request.seed)
    const out = new Float64Array(buffer)
    for (let cell = request.startCell; cell < request.endCellExclusive; cell++) {
      const row = Math.floor(cell / SWEEP_COLS)
      const col = cell % SWEEP_COLS
      const result = runSpikeBacktest(paramsForCell(row, col), series, scratchValue, scratchRuined)
      out[cell - request.startCell] = result.finalValue
    }
    return Comlink.transfer(buffer, [buffer])
  },
}
export type SweepWorkerApi = typeof sweepWorkerApi
Comlink.expose(sweepWorkerApi)
```

**What changes for production (per RESEARCH.md Pattern 1 — load-bearing, not optional):** the bench worker caches ONE series per worker (synthetic, seed-keyed) and loops cells directly. The production worker must instead resolve **one `KernelSeries` per entry-date COLUMN** (via a `resolveColumnSeries` equivalent to `buildKernelInputs`, see below) and loop `runBacktest` over the 50 leverage rows against that shared series — never resolve a fresh series per cell (would repeat an O(barCount) resolution up to 50x more than necessary and blow PERF-03's already-80.8%-spent budget). Each `runChunk` call should therefore be column-partitioned (a chunk = a contiguous range of entry-date columns), not flat-cell-partitioned like the bench prototype.

---

### `src/sweep/resolve-column-series.ts` (service, transform)

**Analog:** `src/data/kernel-inputs.ts`, function `buildKernelInputs` (lines 133-262, read in full)

**Series-resolution shape to reuse verbatim except for the `leverage` field:**
```typescript
// buildKernelInputs, src/data/kernel-inputs.ts:230-238 — leverage lives only in `params`,
// never inside the per-bar loop that builds returns/shortRate/calendarDaysElapsed.
const params: KernelParams = {
  leverage: request.leverage,       // <- the ONE field the sweep varies per row, not per column
  initialInvestment: request.initialInvestment,
  contributionAmount: request.contributionAmount,
  financingSpread,
  expenseRatio,
  longGapMinDays: LONG_GAP_FLAG_MIN_DAYS,
}
const series: KernelSeries = { returns, shortRate, calendarDaysElapsed, contributionFlags }
```

**Per-bar loop to reuse unmodified** (lines 199-222): builds `returns`, `shortRate`, `calendarDaysElapsed` from `priceLevels`/`ratePercent`/`bundle.calendar` — reads NO leverage anywhere, confirming it is safe to resolve once per column and reuse across all 50 rows.

**Validation-throws-loud pattern to preserve** (lines 145-149, 174-184): out-of-range entry date or overrun holding period throws with the offending value AND the supported range, never silently truncates. The column resolver should keep this discipline per column (fail that column's whole sweep row range with a named error) rather than swallowing it into a categorical grey cell — D-28 already defines the categorical treatment for a right-edge overrun; a genuinely invalid entry date is a different, harder error that should surface distinctly.

---

### `src/heatmap/iso-lines.ts` and `src/heatmap/field-sampler.ts` (utility, transform — D-11 graduation)

**Analogs:** `.planning/phases/06-heatmap-design-pass/mockups/shared/iso-lines.ts` (149 lines) and `.../field-sampler.ts` (360 lines), both already pure TypeScript with zero DOM/framework imports.

**Graduation is near-verbatim.** `iso-lines.ts`'s own header states the constraint directly:
```typescript
// Plain TypeScript, zero imports, no geometry constants of its own: every coordinate this module
// emits is in GRID space (fractional column/row), never display pixels.
```
`field-sampler.ts` already imports from `src/` (not `mockups/`) for its colour/format dependencies:
```typescript
import {
  CELL_FLAG_INCOMPLETE, CELL_FLAG_RUINED, type SweepFixture,
} from '../../../../../src/data/sweep-fixture-format.ts'
import {
  INCOMPLETE_RGBA, interpolateRamp, rampPositionFor, RUIN_BASE_RGBA, type Rgba,
} from '../../../../../src/colorscale/value-to-color.ts'
```
Moving the files into `src/heatmap/` only requires shortening these two import paths to relative-within-`src/`; no logic changes. Both already run unmodified in the fast Node `unit` Vitest project (D-08's oracle test is cheap because of this).

**Critical constraint for D-12 (coarse-then-refine paint):** `resampleField` and `marchingSquaresSegments` already accept grid dimensions as parameters (F-07) — this rules out any "optimize by hardcoding 200×50" shortcut in the new polygon-fill/paint code; both graduated modules and any new module built on top of them must keep accepting an arbitrary `cols`/`rows` pair.

---

### `src/heatmap/polygon-fill.ts` (NEW module, D-05)

No direct analog exists — this is genuinely new code (the ring-stitching layer `iso-lines.ts`'s own header calls "the genuinely hard part of marching squares" and explicitly skips). Build it as a consumer of `marchingSquaresSegments`'s `IsoSegment[]` output (grid-space coordinates, per-band), producing closed polygon rings that `paint-contour.ts` fills via `ctx.fill()`. Follow `iso-lines.ts`'s existing convention: pure TypeScript, zero imports outside `src/heatmap/`, grid-space coordinates only (never display pixels) — the caller does the grid-to-display transform, exactly as `field-sampler.ts`'s `resampleField` already does for the base pass so a segment always lands on the same field the base pass painted.

---

### `src/heatmap/paint-contour.ts` (component, transform/streaming)

**Analog:** `.planning/phases/06-heatmap-design-pass/mockups/forms/form-2-filled-contour.ts` (242 lines) — the winning form's own two-pass render (base fill + stroked boundaries), consuming `resampleField` and `FORM_2_GEOMETRY`.

**Key adaptation required (not present in the analog):** the mockup form renders a static, committed `SweepFixture`. Production must parameterize over the LIVE sweep grid (D-12's variable, growing `cols`) and accept either the polygon-fill path (D-05, primary) or the per-pixel `resampleField` path (D-09, fallback) behind one interface, so D-06's escalation is a swap at this seam, not a rewrite.

---

### `src/heatmap/hatch-pattern.ts` (utility, transform — graduation candidate not named by D-11)

**Analog:** `.planning/phases/06-heatmap-design-pass/mockups/shared/mockup-runtime.ts`, function `makeHatchPattern` (line 119) and its usage `renderLegend` (line 283: `makeHatchPattern(ctx, RUIN_BASE_RGBA)`).

RESEARCH.md's own gap note (4th finding) flags that `makeHatchPattern`, `VIZ10_CAVEAT_SENTENCES` (line 44), and `renderLegend` (line 192) all currently live in `mockup-runtime.ts`, which D-11 does not name for graduation. VIZ-06's hatch and D-30's caption-strip caveat both need this content in production. **Open decision for the planner:** graduate `mockup-runtime.ts`'s relevant exports into `src/heatmap/` alongside `iso-lines.ts`/`field-sampler.ts`, or reimplement as Solid components consuming the same colour/text constants. Either way, `VIZ10_CAVEAT_SENTENCES`'s exact sentence text and `RUIN_BASE_RGBA` must be the single source, not re-typed.

---

### `src/colorscale/value-to-color.ts` (extended in place, D-25)

**Analog:** itself — read in full (229 lines).

**What must change** (RESEARCH.md verified finding, lines 63-64 & 173):
```typescript
// interpolateRamp closes over module-level RAMP_STOPS_OKLAB, itself derived from RAMP_STOPS.
// It takes NO stops parameter — cannot be reused as-is for D-25's sequential ramp.
const RAMP_STOPS_OKLAB: readonly { t: number; oklab: OklabColor }[] = RAMP_STOPS.map(...)
export function interpolateRamp(t: number): Rgba { /* reads only RAMP_STOPS_OKLAB */ }
```
Two viable fixes, either is consistent with the module's existing style: (a) add `SEQUENTIAL_RAMP_STOPS` + a second exported interpolator closing over it, following the exact same Oklab-piecewise-linear pattern already in `interpolateRamp`; or (b) parameterize `interpolateRamp(t, stops)` and update the one existing call site (`valueToColor`). The module's existing domain-and-clamp discipline (`DOMAIN_LOG_MIN`/`DOMAIN_LOG_MAX`, `clamp()`, `rampPositionFor`) is diverging-scale-specific (symmetric about 0) — the new sequential ramp for max drawdown (pure magnitude, no midpoint) needs its own domain constants, not a reuse of `DOMAIN_LOG_MIN`/`MAX`. Preserve the branch order discipline in `valueToColor` (ruined first, then incomplete, then continuous) unchanged — D-25 only adds a metric-conditional choice of WHICH ramp/domain the continuous branch uses, it does not touch the categorical branches.

---

### `src/metrics/irr.ts` (extended in place, D-24 perf lead — F-06 unmeasured)

**Analog:** itself. Not fully read this pass (out of budget); RESEARCH.md's verified claim: `npv` currently discounts each cash flow with `Math.pow` per call, and on a regular monthly schedule the discount factors form a geometric progression, so a Horner-style loop (one multiply per flow, no `pow`) is a drop-in replacement inside the existing bisection solve. Read `src/metrics/irr.ts` and `src/metrics/cagr.ts` directly during planning/execution before touching this file — F-06 flags this as an unmeasured hypothesis, not a proven number; benchmark before committing to the sweep's per-cell cost model.

---

### `src/app/components/ResultColumn/SliceChart.tsx` (component, request-response — VIZ-01/VIZ-02)

**Analog:** `src/app/components/ResultColumn/EquityCurveChart.tsx` (296 lines; header + first 80 lines read)

**Theme + destroy-recreate pattern to follow exactly:**
```typescript
import 'uplot/dist/uPlot.min.css'
import { createEffect, createSignal, onCleanup } from 'solid-js'
import uPlot from 'uplot'
import { onThemeChange } from '../../theme.ts'
```
Header states the governing rule directly: *"Stroke/axis colors are read from `--color-accent` / `--color-text-muted` via `getComputedStyle` at render time, since canvas gets no free `prefers-color-scheme` styling."* And: *"subscribes to `onThemeChange` and bumps a local `themeVersion` signal ... tracked by the same `createEffect` ... `rebuildChart` already destroys and recreates the uPlot instance on every call (rather than patching `setScale`/`setData`)."*

**Log-axis floor workaround to reuse, not reimplement** — `log-axis-splits.ts`'s `logDecadeSplits` import and the custom exponential-notation formatter:
```typescript
const LOG_AXIS_EXPONENTIAL_LOWER_EXPONENT = -4
const LOG_AXIS_EXPONENTIAL_UPPER_EXPONENT = 13
export function formatLogAxisValue(value: number): string {
  const exponent = Math.log10(Math.abs(value))
  if (exponent <= LOG_AXIS_EXPONENTIAL_LOWER_EXPONENT || exponent >= LOG_AXIS_EXPONENTIAL_UPPER_EXPONENT) {
    return value.toExponential(0)
  }
  return value.toLocaleString()
}
```
RESEARCH.md Pattern 4 flags this exact floor as relevant to the slice charts: *"The marginal slice charts of D-16 span the same kind of order-of-magnitude range and will hit the same floor."* Import `logDecadeSplits` from `./log-axis-splits.ts` directly rather than re-deriving.

**Data source is a pure array read, not a computation** — VIZ-01/VIZ-02 data is one row or one column of the live sweep grid (`src/sweep/sweep-grid.ts`), read the same way `field-sampler.ts` treats a fixture: O(200) or O(50), no new math.

---

### `src/app/components/ResultColumn/SweepModeToggle.tsx` and mode-switch wiring (D-15)

**Analog:** `src/app/components/ParameterColumn/HoldingModeControl.tsx` (145 lines, read in full) — both the radiogroup markup pattern and the store-read/store-write wiring.

**Radiogroup + store pattern to follow:**
```typescript
import { createMemo, createSignal, Show } from 'solid-js'
import { activeTier, backtestRequest, loadedBundle, updateBacktestRequest } from '../../state.ts'
import { PARAMETER_DEFAULTS } from '../../parameter-defaults.ts'
import { DefaultBadge } from './DefaultBadge.tsx'
import { ResetButton } from './ResetButton.tsx'
// ...
<div class="parameter-group ..." data-testid="...">
  <div role="radiogroup" aria-label="...">
    <label><input type="radio" name="..." checked={...} onChange={() => select...()} />...</label>
  </div>
  <Show when={PARAMETER_DEFAULTS.x.isDefault()} fallback={<ResetButton .../>}>
    <DefaultBadge .../>
  </Show>
</div>
```
D-27 reuses `HoldingModeControl.tsx` itself unchanged as the sweep-mode toggle (fixed-period vs. "Hold to end of data (\<date\>)") — it is not a new component, just rewired to also drive the sweep's holding-period axis. `SweepModeToggle.tsx` (Single run / Sweep switch, D-15) is the genuinely new component and should follow this same radiogroup-over-store shape, reading/writing a new signal in `state.ts` (e.g. `resultMode`) the same way `activeTier`/`setActiveTier` already read/write `tier`.

**CRED-05/D-22 default-badge convention (mandatory for every new sweep control):** every parameter control carries `PARAMETER_DEFAULTS`'s shared default badge/reset affordance — `src/app/parameter-defaults.ts` is the shared source, referenced explicitly in CONTEXT.md's Established Patterns.

---

### `src/app/state.ts` (extended — sweep store, D-15/D-17)

**Analog:** itself (768 lines; store-shape excerpts read via grep).

**Existing store pattern to extend, not replace:**
```typescript
const [scale, setScaleSignal] = createSignal<ScaleMode>('log')
const [tier, setTierSignal] = createSignal<Tier>('strict')
export function activeTier(): Tier { return tier() }
export function setActiveTier(newTier: Tier): void {
  setTierSignal(newTier)
  scheduleRun()
}
export function scheduleRun(): void {
  // ... requestAnimationFrame(() => { ... }) -- coalesces any number of writes into one run
}
```
The sweep store should mirror this exactly: a `sweepRequest`/`sweepGrid`/`resultMode` signal set, a `scheduleSweep()` that rAF-coalesces writes the same way `scheduleRun()` does (RESEARCH.md's architecture diagram explicitly calls this out: "scheduleSweep() (rAF-coalesced, mirrors existing scheduleRun D-03)"), and reuse of `BacktestRequest`'s existing fields (`entryDate`, `leverage`, `symbol`, etc.) so D-17's crosshair and D-22's drill-down are reads/writes of the SAME store fields the single-run path already owns — not a parallel, divergent request shape.

---

### `src/app/permalink.ts` (extended — D-04's new fields)

**Analog:** itself (376 lines; excerpts read via grep).

**Allow-list codec pattern to extend, not bypass:**
```typescript
export const PERMALINK_KEYS = [ /* ... existing fields ... */ ] as const
export type PermalinkKey = (typeof PERMALINK_KEYS)[number]

export function encodeParams(params: PermalinkParams): URLSearchParams {
  const qs = new URLSearchParams()
  for (const key of PERMALINK_KEYS) {
    const value = encodeField(key, params)
    if (value !== null) qs.set(key, value)
  }
  return qs
}

export function decodeParams(qs: URLSearchParams): DecodeParamsResult {
  // T-04-01: allow-list by name. Never eval, never Function constructor, never bracket access.
  for (const key of qs.keys()) {
    if (!isKnownKey(key)) return decodeError(`permalink: unknown query parameter "${key}"`)
  }
  for (const key of PERMALINK_KEYS) {
    if (isDuplicated) return decodeError(`permalink: query parameter "${key}" is duplicated`)
  }
  // ... per-field validation, each with a named decodeError ...
}
```
D-04's new fields (sweep mode, holding period, displayed metric, tier, symbol, cost params) must be added to `PERMALINK_KEYS` following the exact same total-function discipline: every new key gets a named `decodeError` branch (not a silent default), duplication and unknown-key checks apply uniformly, and `decodeParams` stays a pure function over arbitrary `URLSearchParams` input. D-35 (zoom/pan NOT in the permalink) means no new key should be added for viewport state — scope the new keys strictly to what D-04 names.

## Shared Patterns

### Allocation-free hot loops (SIM-11 discipline)
**Source:** `src/kernel/backtest.ts` (header comment + implementation, read in full)
**Apply to:** `src/sweep/sweep.worker.ts`, `src/sweep/resolve-column-series.ts`
```typescript
// Every accumulator is a scalar; output arrays are preallocated by the caller; the result
// object is built once, after the loop. No module-level mutable binding — concurrent callers
// holding their own output buffers cannot interfere with one another.
```
The sweep worker must preallocate its scratch `KernelOutputs` buffers ONCE per worker (mirroring `bench/sweep.worker.ts`'s `scratchValue`/`scratchRuined` pattern) and reuse them across every `runBacktest` call in a chunk — never allocate per cell or per column.

### Fail-loud validation with named value + expected range
**Source:** `src/data/kernel-inputs.ts` (throw patterns, lines 145-149, 174-184) and `src/data/sweep-fixture-format.ts` (`SweepFixtureFormatError`, throughout)
**Apply to:** `src/sweep/resolve-column-series.ts`, `src/app/permalink.ts` extensions
```typescript
throw new Error(
  `kernel-inputs: holdingPeriodBars ${request.holdingPeriodBars} from entryDate "${request.entryDate}" ` +
    `runs past the last supported bar (max ${maxBars} bars, ending ${dateAtAbsIndex(...)})`,
)
```
Every new validation path in the sweep engine and permalink codec should name both the offending value and the valid range/set, never a bare "invalid input" message.

### Module header states plan, decision IDs, and reasoning
**Source:** uniform across `src/`, `bench/`, and the mockups (every file read this pass opens with this)
**Apply to:** every new file in this phase
```typescript
/**
 * src/sweep/sweep-pool.ts
 *
 * D-XX: <what this does and which decision ID it implements>. <why, referencing the
 * specific finding/pitfall/prior-phase precedent it follows or departs from>.
 */
```

### Zero-import, pure-TypeScript geometry/colour modules
**Source:** `src/colorscale/value-to-color.ts` (header: "Zero imports, so both a plain HTML mockup ... and Phase 7's Solid renderer can consume it without dragging in a framework"), `.../mockups/shared/iso-lines.ts` and `field-sampler.ts` (same discipline, verified by direct import inspection)
**Apply to:** `src/heatmap/iso-lines.ts`, `src/heatmap/field-sampler.ts`, `src/heatmap/polygon-fill.ts`
Keep these modules importing only from other zero/near-zero-import `src/` modules (colour scale, sweep-fixture types) — never from Solid, never from the app's DOM-facing components — so they stay usable from both the mockups (still committed, per D-11's stated reason for keeping the losing forms judgeable) and the production renderer, and stay eligible for the fast Node `unit` Vitest project rather than the slower browser-mode project.

### Theme-aware canvas/uPlot rendering via `getComputedStyle`, never framework CSS
**Source:** `src/app/components/ResultColumn/EquityCurveChart.tsx` header
**Apply to:** `src/app/components/ResultColumn/SliceChart.tsx`, `src/heatmap/paint-contour.ts`'s chrome (axes, legend, caption strip — NOT the heatmap palette itself, which D-15 of Phase 6 explicitly does not swap by theme)
```typescript
// canvas gets no free prefers-color-scheme styling — colors are read from CSS custom
// properties via getComputedStyle() at render time, and the instance is rebuilt (not patched)
// whenever onThemeChange fires.
```

### Comlink transfer-not-clone for every typed-array crossing the Worker boundary
**Source:** `bench/sweep.worker.ts` header and `bench/sweep-pool.ts` (`Comlink.transfer(buffer, [buffer])` on both call and return sides)
**Apply to:** `src/sweep/sweep-pool.ts`, `src/sweep/sweep.worker.ts`
Both directions of every chunk's buffer traffic must use `Comlink.transfer`, never rely on Comlink's default structured-clone — this is PITFALLS F3 and is load-bearing for PERF-03's budget, not a style preference.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/heatmap/polygon-fill.ts` | utility | transform | No ring-stitching code exists anywhere in the codebase; `iso-lines.ts`'s own header explicitly names this as unbuilt, deliberately skipped work. Build fresh, following the zero-import/grid-space conventions of its sibling `iso-lines.ts`/`field-sampler.ts` (see Shared Patterns), not any existing polygon-fill logic. |
| Generation-token cancellation layer inside `src/sweep/sweep-pool.ts` | service (cross-cutting concern) | event-driven | Confirmed absent from both Comlink itself and `bench/sweep-pool.ts` (which only tears down the whole pool in a `finally`). RESEARCH.md Pattern 2 is the design guidance to follow (MEDIUM confidence, flagged `[ASSUMED]` as the specific shape); there is no existing in-repo implementation to copy structure from. |

## Metadata

**Analog search scope:** `src/`, `bench/`, `.planning/phases/06-heatmap-design-pass/mockups/`, `perf-budgets.ts`
**Files scanned (read in full or substantially):** `bench/sweep-pool.ts`, `bench/sweep.worker.ts`, `src/kernel/backtest.ts`, `src/data/kernel-inputs.ts`, `src/colorscale/value-to-color.ts`, `src/data/sweep-fixture-format.ts`, `src/app/components/ResultColumn/EquityCurveChart.tsx` (header + top), `src/app/components/ParameterColumn/HoldingModeControl.tsx`, `.planning/.../mockups/shared/iso-lines.ts` (header), `.planning/.../mockups/shared/field-sampler.ts` (header + imports), `.planning/.../mockups/shared/mockup-runtime.ts` (export index), `src/app/state.ts` (grep index), `src/app/permalink.ts` (grep index)
**Pattern extraction date:** 2026-08-22
