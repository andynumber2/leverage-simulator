# Phase 8: Export and the Canonical Arguments - Pattern Map

**Mapped:** 2026-08-26
**Files analyzed:** 15 (new) + 4 (modified)
**Analogs found:** 15 / 15

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/export/png-export.ts` | utility | transform (DOM->Blob) | `src/app/components/ParameterColumn/CopyLinkButton.tsx` (fallback sequencing) + RESEARCH.md Pattern 1/2 (no direct repo analog for rasterization) | partial (no repo analog for capture itself) |
| `src/app/components/ResultColumn/ExportRow.tsx` | component | request-response (click -> async export) | `src/app/components/ParameterColumn/CopyLinkButton.tsx` | exact (clipboard write + fallback + transient state machine) |
| `src/export/csv-export.ts` | service | worker-orchestration | `src/sweep/sweep-pool.ts` (`runSweep`'s one-shot Worker construction is the closer shape actually needed here, despite the pool being persistent) | role-match |
| `src/export/csv.worker.ts` | service (worker) | transform (typed arrays -> Blob) | `src/sweep/sweep.worker.ts` | exact (Comlink.expose guard, module shape) |
| `src/export/download.ts` | utility | file I/O | none in-repo (new primitive); RESEARCH.md Code Examples "Download trigger" | no analog, spec provided |
| `src/app/presets.ts` | model | static data | `src/validation/cost-parameters.ts`-style registry (constants + typed definitions) | role-match |
| `src/app/presets.generated.ts` | model (generated) | build-time transform | `src/validation/extended-tier-bias.generated.ts` | exact |
| `scripts/compute-presets.ts` | utility (build script) | batch | `scripts/measure-extended-tier-bias.ts` | exact |
| `tests/app/presets.generated.test.ts` | test | pinning | `tests/validation/extended-tier-bias.test.ts` | exact |
| `tests/app/export-csv.test.ts` | test | CRUD/transform assertions | `tests/validation/extended-tier-bias.test.ts` (Node-side recompute-and-assert shape) | role-match |
| `tests/app/export-png.browser.test.ts` | test | browser interaction | existing `tests/app/*.browser.test.ts` suite (not read this session; same project convention) | role-match |
| `bench/perf-08-png-export.bench.test.ts` | test (bench) | performance measurement | `bench/perf-07.bench.test.ts` (longtask-observer pattern, referenced directly in RESEARCH.md) | exact |
| `src/app/components/ResultColumn/ScenariosOverlay.tsx` | component | request-response (overlay open/close) | `src/app/components/MethodologyOverlay.tsx` | exact |
| `src/app/App.tsx` (MODIFIED) | component | request-response | itself (existing file) | exact — insertion point identified |
| `src/app/components/ParameterColumn/ParameterColumn.tsx` (MODIFIED) | component | request-response | itself — loses `CopyLinkButton` | exact |
| `src/app/state.ts` (MODIFIED — export `computeDerivedMetrics`) | service | CRUD (derived-state compute) | itself | exact |
| `tests/app/static-build.test.ts` (MODIFIED — invert F-01 ban) | test | assertion inversion | itself | exact |

## Pattern Assignments

### `src/app/components/ResultColumn/ExportRow.tsx` (component, request-response)

**Analog:** `src/app/components/ParameterColumn/CopyLinkButton.tsx` (full file read, 94 lines)

**Imports pattern** (lines 23-25):
```typescript
import { createSignal, Show } from 'solid-js'

import { currentKernelResult, flushPermalinkUrl } from '../../state.ts'
```
Copy this shape for `ExportRow.tsx`, but it will need three independent transient-state signals (one per button) rather than one, and imports from `../../../state.ts` (one directory deeper, under `ResultColumn/`).

**State-machine pattern** (lines 27-47): a `CopyState = 'idle' | 'confirmed' | 'failed'` union, a `LABELS` record keyed by that union, and a `scheduleReset()` that clears any pending timer before re-arming a 2000ms revert-to-idle timeout. Reuse this exact shape per button (Export PNG needs `idle/confirmed/failed`; Export CSV per the UI-SPEC only needs `idle/failed`, no confirmed state, since the browser's own download UI is the confirmation — do not invent a CSV "confirmed" label).

**Click handler + failure-fallback pattern** (lines 49-68):
```typescript
async function handleClick(): Promise<void> {
  flushPermalinkUrl()
  const url = window.location.href
  try {
    if (navigator.clipboard === undefined) {
      throw new Error('Clipboard API unavailable')
    }
    await navigator.clipboard.writeText(url)
    setCopyState('confirmed')
    scheduleReset()
  } catch {
    setFailedUrl(url)
    setCopyState('failed')
  }
}
```
The Export PNG handler is structurally the same try/catch-into-failed-state shape, but per D-23/RESEARCH.md Pattern 2 it must NOT await the blob before calling `clipboard.write()` — pass the `Promise<Blob>` directly as the `ClipboardItem` value (Safari activation gate). Model the Export PNG handler on this control flow but substitute the body per RESEARCH.md's `handleExportPngClick` example (already fully specified there, not restated here).

**Markup pattern** (lines 70-93): a wrapping row div with `data-testid`, a `<button disabled={disabled()} data-copy-state={copyState()}>`, and a conditional fallback shown only in the failed state. `ExportRow.tsx` composes three of these button blocks side by side (`.export-row` per 08-UI-SPEC.md's "action strip attached to the result, not a second panel"), each disabled per its own condition:
- Copy link / Export PNG: `disabled = () => currentKernelResult() === null` (unchanged from today).
- Export CSV: additionally disabled when `resultMode() === 'sweep'` (D-08), with the adjacent muted note `"Switch to Single run to export a daily series."` per 08-UI-SPEC.md's Copywriting Contract, styled like `.tier-option-disabled-reason` (not read this session — locate and match its exact class name at implementation time).

**Relocation note (D-22):** `CopyLinkButton.tsx` itself is NOT deleted or rewritten — it is imported into `ExportRow.tsx` exactly as `ParameterColumn.tsx` currently does, and `ParameterColumn.tsx` drops its own import/render call site. Do not duplicate `CopyLinkButton`'s internals into `ExportRow.tsx`; compose the existing component alongside two new sibling button components (or two new sub-components following its exact pattern).

---

### `src/export/csv.worker.ts` (service/worker, transform)

**Analog:** `src/sweep/sweep.worker.ts` (imports and guard read, full header read)

**Comlink expose guard pattern** (mirrored from `sweep.worker.ts`'s own documented convention, confirmed in its header): expose only when `self` exists, so the Node `unit` test project can import the pure function without a real Worker context:
```typescript
import * as Comlink from 'comlink'
// ...pure function(s) here...
const csvWorkerApi = { buildCsv }
export type CsvWorkerApi = typeof csvWorkerApi
if (typeof self !== 'undefined') {
  Comlink.expose(csvWorkerApi)
}
```
This exact shape is given fully-formed in `08-RESEARCH.md`'s Pattern 3 code example — copy it verbatim rather than re-derive it. The pure `buildCsv` function must be exported separately from the `Comlink.expose` call, exactly as `sweep.worker.ts`'s header states was done for `computeChunkMetrics`, so `tests/app/export-csv.test.ts` can call it directly in the Node `unit` project without a real Worker/postMessage boundary.

**Worker construction pattern** (`src/sweep/sweep-pool.ts:63`):
```typescript
return new Worker(new URL('./sweep.worker.ts', import.meta.url), { type: 'module' })
```
`csv-export.ts`'s orchestration copies this exact `new URL(..., import.meta.url)` + `{ type: 'module' }` construction, but unlike the persistent sweep pool (which never calls `worker.terminate()` per its own header comment, "no `runSweep` call ever tears one down"), the CSV export worker is one-shot: construct, call, then `worker.terminate()` in a `finally` block, per RESEARCH.md's Pattern 3 `csv-export.ts` example. Do not reuse the persistent-pool pattern here — a one-shot `Comlink.wrap` + `finally { worker.terminate() }` is the correct shape, already given in full in RESEARCH.md.

**Structured-clone vs transfer:** `sweep-pool.ts` uses `Comlink.transfer(buffer, [buffer])` for its chunk buffers (line 377). The CSV worker must NOT do this for its input typed arrays (per D-09/RESEARCH.md Pitfall/Assumption A2): the arrays handed to the worker are caller-made copies (`.slice()`), not the live `KernelOutputs` buffers the chart still reads, so a plain structured-clone argument is the correct default. Only the RETURNED `Blob` crosses back, which Comlink handles natively.

---

### `src/app/presets.generated.ts` + `scripts/compute-presets.ts` + `tests/app/presets.generated.test.ts` (model/build-script/test, build-time transform)

**Analog:** `src/validation/extended-tier-bias.generated.ts`, `scripts/measure-extended-tier-bias.ts`, `tests/validation/extended-tier-bias.test.ts` (all three read in full)

**Generated-module header + write-to-temp-then-rename pattern** (`measure-extended-tier-bias.ts` lines 301-345):
```typescript
function writeGeneratedModule(srcDir: string, result: PresetOutcomesResult, measurementDate: string): void {
  mkdirSync(srcDir, { recursive: true })
  const contents = `/**
 * GENERATED FILE. Do not hand-edit.
 * Regenerated by \`npm run compute-presets\` (scripts/compute-presets.ts).
 * ...
 */
export const PRESET_OUTCOMES = ${JSON.stringify(result, null, 2)}
`
  const finalPath = path.join(srcDir, 'presets.generated.ts')
  const tmpPath = path.join(srcDir, `.presets.generated.ts.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  writeFileSync(tmpPath, contents)
  renameSync(tmpPath, finalPath)
}
```
Copy this write-to-temp-then-rename discipline exactly (it exists so no consumer ever observes a partially-written file).

**Entry-point guard pattern** (`measure-extended-tier-bias.ts` lines 347-362):
```typescript
if (import.meta.main) {
  const bundle = await loadBundleFromDisk()
  const result = measurePresetOutcomes(bundle) // pure function, exported separately
  const measurementDate = new Date().toISOString().slice(0, 10)
  const srcDir = path.join(process.cwd(), 'src', 'app')
  writeGeneratedModule(srcDir, result, measurementDate)
  process.stdout.write(`compute-presets: wrote ${path.join(srcDir, 'presets.generated.ts')}\n`)
}
```
`import.meta.main` is true only when the script is the process entry point, never when the pinning test imports it — so importing `computePresetOutcomes` for recomputation performs no file I/O. This is the exact mechanism `08-CONTEXT.md` D-18 names as the precedent to copy.

**Pinning test pattern** (`tests/validation/extended-tier-bias.test.ts`, full file, 58 lines):
```typescript
import { loadBundleFromDisk } from '../../src/data/load-bundle-node.ts'
import { computePresetOutcomes } from '../../scripts/compute-presets.ts'
import { PRESET_OUTCOMES } from '../../src/app/presets.generated.ts'

describe('SHARE-06: every preset\'s committed headline figure matches a live recomputation', () => {
  test('each preset outcome equals the committed constant to full float64 precision', async () => {
    const bundle = await loadBundleFromDisk()
    const result = computePresetOutcomes(bundle)
    expect(result).toEqual(PRESET_OUTCOMES)
  })
  // additional per-field assertions, determinism-across-two-recomputes assertion, mirroring the analog's 4-test shape
})
```
Follow the analog's exact four-test shape: (1) primary figure equality, (2) every metadata field, (3) sanity bounds (finite/positive where applicable — for presets this becomes D-16's assertion instead: every real-fund preset has `leverage === 1.0 && expenseRatioPercent === 0`), (4) determinism across two recomputations from the same bundle.

**Load-bearing prerequisite (RESEARCH.md Pitfall 3, F-07):** `computeDerivedMetrics` [`src/app/state.ts:593`] is currently NOT exported. Before `compute-presets.ts` can call it, it must be exported from `state.ts` (or extracted to a shared, Solid-free module). This is a scheduled prerequisite task, not an incidental side effect — the analog pattern assumes a pure, importable function; `computeDerivedMetrics` is not yet one.

**Call chain to reuse, not reimplement** (per RESEARCH.md Pattern 4, F-07):
```typescript
import { loadBundleFromDisk } from '../src/data/load-bundle-node.ts'
import { buildKernelInputs } from '../src/data/kernel-inputs.ts'
import { runBacktest } from '../src/kernel/backtest.ts'
import { computeDerivedMetrics } from '../src/app/state.ts' // requires export first
import { PRESET_DEFINITIONS } from '../src/app/presets.ts'
```
`buildKernelInputs` signature and `KernelInputs`/`KernelParams`/`KernelSeries`/`KernelOutputs` shapes are fully specified in `src/data/kernel-inputs.ts` (lines 33-70) and `src/kernel/backtest.types.ts` (full file, 101 lines) — every CSV column D-06 needs and every field `compute-presets.ts` needs already exists on these types; no kernel change is needed.

---

### `src/app/components/ResultColumn/ScenariosOverlay.tsx` (component, request-response)

**Analog:** `src/app/components/MethodologyOverlay.tsx` (full file read, 374 lines)

**Overlay shell pattern** (lines 172-238): gated entirely on an open/close boolean signal (`methodologyOverlayOpen()` -> analogous `scenariosOverlayOpen()`), rendering nothing when closed via `<Show when={...}>` at the outermost level — "renders no DOM until its flag opens it" per the file's own header. Structure to copy:
```typescript
export function ScenariosOverlay() {
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && scenariosOverlayOpen()) {
      closeScenariosOverlay()
    }
  }
  onMount(() => document.addEventListener('keydown', handleKeydown))
  onCleanup(() => document.removeEventListener('keydown', handleKeydown))

  return (
    <Show when={scenariosOverlayOpen()}>
      <div class="scenarios-overlay" data-testid="scenarios-overlay" role="dialog" aria-modal="true">
        <div class="scenarios-overlay-header">
          <h1 class="scenarios-overlay-title">Scenarios</h1>
          <button type="button" class="scenarios-overlay-close" data-testid="scenarios-overlay-close" aria-label="Close" onClick={() => closeScenariosOverlay()}>
            {/* copy the exact close-icon <svg> markup from MethodologyOverlay.tsx lines 232-235 verbatim */}
          </button>
        </div>
        <div class="scenarios-overlay-content">
          <For each={ALL_PRESETS}>
            {(preset) => <PresetCard preset={preset} />}
          </For>
        </div>
      </div>
    </Show>
  )
}
```
Copy the close-icon SVG markup verbatim (lines 232-235) rather than re-authoring it — it is the established close-affordance icon for every overlay in this app.

**Mounting pattern:** `MethodologyOverlay` is mounted unconditionally as the last child of the layout (confirmed in its own header comment and by App.tsx's import list). `ScenariosOverlay` mounts the same way, alongside `<MethodologyOverlay />` in `App.tsx`.

**`For` + registry-driven row rendering pattern** (lines 242-256, 269-277, 307-322): every section iterates a typed array/registry with `<For each={...}>`, never hand-unrolled per-item JSX. `ScenariosOverlay`'s preset list follows this exact idiom over `PRESET_DEFINITIONS` (or a merged view combining `presets.ts` definitions with `presets.generated.ts` outcomes).

**Defensive `try/catch` around a `createMemo` computing from `loadedBundle()`** (lines 183-195): not needed for `ScenariosOverlay` since D-18 moves all preset figures to build time — this pattern is specific to `MethodologyOverlay`'s live-computed gate figures and should NOT be copied into `ScenariosOverlay`, which reads only static generated data.

---

### `src/app/App.tsx` (MODIFIED)

**Analog:** itself — insertion points identified by direct read (lines 1-40, 120-190).

**Import list insertion** (after line 33, alongside the other `ResultColumn` imports):
```typescript
import { ExportRow } from './components/ResultColumn/ExportRow.tsx'
import { ScenariosOverlay } from './components/ResultColumn/ScenariosOverlay.tsx'
```

**`.screenshot-region` boundary (D-21 — export row lives OUTSIDE it):** the existing single-run region is the `<div class="screenshot-region" data-testid="screenshot-region">` block starting at line 153, closing after `AttributionPanel`/`ProvenanceStrip`/metrics (not shown past line 190 in this read, but the div's own comment at lines 145-152 states its exact contents). `ExportRow` must be inserted as a SIBLING immediately after this div closes, never as a child inside it — this is structural, not a rendering filter (per D-21's explicit rejection of a `data-export-hide` attribute approach).

**Overlay mount:** `<MethodologyOverlay />` is imported at line 32 and (per its own header) mounted unconditionally as the layout's last child; add `<ScenariosOverlay />` as an additional unconditional sibling in the same location.

---

## Shared Patterns

### Clipboard-write-with-fallback (D-23)
**Source:** `src/app/components/ParameterColumn/CopyLinkButton.tsx` lines 49-68 (full pattern above)
**Apply to:** `ExportRow.tsx`'s Copy link button (reused component, unchanged) and its new Export PNG button (same try/catch shape, different body per RESEARCH.md Pattern 2's Safari-safe sequencing — promise passed directly to `ClipboardItem`, never awaited first).

### Comlink Worker construction and one-shot lifecycle
**Source:** `src/sweep/sweep-pool.ts:63` (construction), `src/sweep/sweep.worker.ts` header (`Comlink.expose` guard)
**Apply to:** `src/export/csv-export.ts` / `src/export/csv.worker.ts`. Key deviation from the sweep pool: CSV worker is one-shot (`worker.terminate()` in `finally`), not persistent.

### Build-time-generated module + pinning test
**Source:** `scripts/measure-extended-tier-bias.ts`, `src/validation/extended-tier-bias.generated.ts`, `tests/validation/extended-tier-bias.test.ts` (all three, full read)
**Apply to:** `scripts/compute-presets.ts` / `src/app/presets.generated.ts` / `tests/app/presets.generated.test.ts`. Exact structural copy: pure measurement function exported separately from `import.meta.main`-guarded writer; write-to-temp-then-rename; four-test pinning shape.

### Full-screen overlay, gated on a boolean signal, rendering nothing when closed
**Source:** `src/app/components/MethodologyOverlay.tsx` (full file)
**Apply to:** `src/app/components/ResultColumn/ScenariosOverlay.tsx`. Reuse the close-icon SVG verbatim, the `Escape`-key `onMount`/`onCleanup` handler pair verbatim, and the `<For>`-driven row-rendering idiom for the preset list.

### No value rounded before render time
**Source:** stated in `src/kernel/backtest.types.ts`'s `KernelResult.maxDrawdown` doc (lines 74-80: "Unrounded float64; rounding happens only at render time in `src/metrics/format.ts`") and reiterated in `MethodologyOverlay.tsx`'s header (line 9: "Every number routes through `src/metrics/format.ts`; no value here is re-rounded")
**Apply to:** `csv.worker.ts`'s row construction (write raw `Float64Array` values as full-precision numbers, never `.toFixed()`), and `ScenariosOverlay`'s outcome-line rendering (source the figure from `presets.generated.ts`, format through the same shared formatter `MetricsPanel`/`state.ts` already use — per F-07, one shared formatter, not a second one for presets).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/export/png-export.ts` | utility | DOM->raster transform | No existing code in this repo rasterizes a DOM subtree; `08-RESEARCH.md` Pattern 1 gives the full concrete `toBlob(node, { width, pixelRatio, backgroundColor })` call to use instead of an in-repo analog. |
| `src/export/download.ts` | utility | file I/O (Blob->download) | No existing Blob-download trigger exists in this repo; `08-RESEARCH.md`'s "Code Examples > Download trigger" section gives the full, ready-to-copy implementation (`URL.createObjectURL` + synthetic `<a download>` + `URL.revokeObjectURL`). |
| `tests/app/export-png.browser.test.ts` | test | browser capture assertions | No prior test in this repo asserts on a rasterization Blob's size/dimensions; follow this repo's general `*.browser.test.ts` conventions (not read this session — locate one such existing file at implementation time for exact Vitest browser-mode boilerplate) rather than a capture-specific analog, since none exists. |

## Metadata

**Analog search scope:** `src/app/`, `src/app/components/`, `src/sweep/`, `src/validation/`, `scripts/`, `tests/validation/`, `tests/app/`, `src/kernel/`, `src/data/`
**Files scanned (fully or by targeted excerpt):** `MethodologyOverlay.tsx`, `CopyLinkButton.tsx`, `sweep-pool.ts`, `sweep.worker.ts`, `measure-extended-tier-bias.ts`, `extended-tier-bias.generated.ts`, `extended-tier-bias.test.ts`, `static-build.test.ts`, `state.ts` (excerpt), `permalink.ts` (header), `backtest.types.ts`, `kernel-inputs.ts` (excerpt), `App.tsx` (excerpts)
**Pattern extraction date:** 2026-08-26
