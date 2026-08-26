# Phase 8: Export and the Canonical Arguments - Research

**Researched:** 2026-08-26
**Domain:** DOM-to-PNG rasterization, Clipboard API, Worker-built CSV export, build-time-generated content
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**PNG export (SHARE-04)**
- D-01: The PNG captures the whole `.screenshot-region` DOM subtree, not a canvas-only export.
- D-02: Export in the theme currently on screen, with a forced opaque background and a visible margin/frame.
- D-03: Every export renders at one fixed CSS width (roughly 1100-1200px), at 2x pixel density, independent of the viewport that took it. Reversibility: costly.
- D-04: Add `html-to-image` as a runtime dependency. Consequences: fourth runtime dependency; `tests/app/static-build.test.ts` bans it by name and must be deliberately inverted (F-01); must clear the package-legitimacy gate. Reversibility: reversible.
- D-05: The PNG path is measured against PERF-07a and escalated under PERF-01a if it breaches, never relaxed.

**CSV export (SHARE-05)**
- D-06: The CSV carries date, index return, short rate, calendar days elapsed, contribution flag and amount, long-gap flag, and portfolio value -- every input the recurrence consumes plus its output. The kernel is not touched.
- D-07: A `#`-commented preamble sits above the header row, carrying every permalink parameter, the bundle version, the active tier, the effective date range, the source names, and the permalink URL itself. Known cost accepted: `#` lines are not standard CSV.
- D-08: CSV export is single-run only. Sweep mode has no single daily series; the user drills down via Phase 7 D-22 first.
- D-09: The CSV is built in a Worker. The main thread receives a Blob and triggers the download.

**The preset set (SHARE-06)**
- D-10: "TQQQ from 2000" ships as synthetic 3x Nasdaq-100 from the March 2000 peak, labelled as synthetic.
- D-11: The high-rate financing preset is a 1979-1982 entry, extended tier, with `ExtendedTierWarning` shown rather than avoided.
- D-12: Each preset declares its own result mode, carried in the existing `mode` permalink key.
- D-13: Each preset is labelled with its window and the outcome it demonstrates, with unflattering cases ordered first.
- D-14: Eight or more presets ship as a library: a featured row of four inline plus a "Scenarios" overlay holding the full set, following `MethodologyOverlay.tsx`'s pattern.
- D-15: The featured four are: real TQQQ through COVID, real UPRO through COVID, real UPRO since inception, and 3x S&P 500 from the March 2000 peak. Three unflattering to one flattering. All four strict tier.
- D-16: Any preset built on a real leveraged ETF must set leverage to exactly 1.0 AND expense ratio to exactly 0, asserted by a test.
- D-17: One dollar-cost-averaging preset ships in the library, exercising IRR/`solveIrr`. Known cost: `solveIrr` measured ~3.9x over budget on the contribution branch.
- D-18: Each preset's headline outcome figure is computed at BUILD time via `scripts/compute-presets.ts` emitting `src/app/presets.generated.ts`, pinned by a regeneration test, copying `scripts/measure-extended-tier-bias.ts`'s precedent exactly.

**Preset plumbing and export affordances**
- D-19: A preset stores its parameter set, never a URL string; `bundleVersion` is filled in from the live manifest when applied.
- D-20: Featured status is one `featured` boolean on the preset definition.
- D-21: The PNG and CSV buttons live in an export row in the result column, OUTSIDE `.screenshot-region`.
- D-22: Phase 4's "Copy link" button moves from the parameter column into the new export row.
- D-23: PNG writes to the clipboard with a download fallback; CSV downloads. `CopyLinkButton.tsx` is the template for the failure-fallback pattern.

### Claude's Discretion
- The exact export width within the 1100-1200px band, and the frame/margin treatment under D-02.
- Filename conventions for both exports.
- The precise CSV column order, header naming, number formatting and date format, subject to the project's standing rule that no value is rounded before render time.
- The full library list beyond D-15's featured four and D-10/D-11/D-17's named entries, including exact entry dates and holding periods. Roadmap criterion 3's four named windows must all appear in the library.
- Whether the crosshair overlay and hover readout appear in a sweep-mode PNG capture (F-02).
- Export button labelling and disabled-state behaviour during load, mid-sweep, or on an invalid parameter combination.

### Deferred Ideas (OUT OF SCOPE)
- A sweep-mode grid CSV (one row per cell).
- In-tool preset authoring, promotion and demotion by the user.
- Per-bar cost decomposition columns in the CSV (financing charge, expense charge, leveraged return).
- A DCA counterpart for every flagship window.
- Keeping the last N data bundles deployed and addressable.
- A global "reset everything to defaults" control.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SHARE-04 | User can export the current chart as a PNG | `html-to-image` API confirmed (toBlob/toPng/toCanvas + options), Safari `foreignObject` risk documented, Clipboard-write-with-promise pattern for cross-browser async-gesture safety, PERF-07a measurement pattern identified in `bench/perf-07.bench.test.ts` for extension |
| SHARE-05 | User can export a run's underlying daily series as CSV | Every D-06 column confirmed to already exist caller-side in `KernelSeries`/`KernelOutputs`/`KernelParams` (verified by reading `backtest.types.ts` and `kernel-inputs.ts`); Worker/Comlink pattern confirmed from `sweep-pool.ts`/`sweep.worker.ts`; structured-clone cost of moving arrays into a Worker flagged as a pitfall to measure |
| SHARE-06 | Named preset scenarios cover the canonical arguments, each a shareable permalink | Manifest date ranges verified directly (`public/data/manifest.f0a9dfbdfa.json`) confirming D-10/D-11/D-15's tier claims; `scripts/compute-presets.ts` build-time-generation pattern verified against the exact `measure-extended-tier-bias.ts`/`extended-tier-bias.generated.ts`/pinning-test precedent; `computeDerivedMetrics` identified as the one shared function the generator and the live UI must both call (closes F-07) |

</phase_requirements>

## Summary

This phase adds one runtime dependency (`html-to-image`) and zero new architectural primitives:
every mechanism CONTEXT.md specifies (Worker/Comlink for CSV, `MethodologyOverlay`'s overlay
pattern for Scenarios, `CopyLinkButton`'s clipboard-fallback pattern, the
`measure-extended-tier-bias.ts` generated-module-plus-pinning-test pattern for presets) already
exists in this codebase and this phase is reusing it, not inventing it. The research below fills
in the mechanical detail CONTEXT.md's decisions depend on but do not spell out: `html-to-image`'s
exact API surface and its one real risk (Safari's `foreignObject` security model, untested by this
project's CI which runs Chromium only), the precise Clipboard API sequencing required for the
write-to-clipboard path to survive Safari's stricter user-activation rules, and the exact call
chain (`buildKernelInputs` -> `runBacktest` -> `computeDerivedMetrics`) `compute-presets.ts` must
reuse rather than reimplement.

Two verified facts materially affect planning. First, every CSV column D-06 lists is already
sitting in memory on the object the app already holds (`currentKernelInputs()` and its mutated
`outputs` buffers) -- confirmed by reading `backtest.types.ts` and `kernel-inputs.ts` directly, not
inferred. Moving that data into a Worker per D-09 means a structured-clone (or transfer-after-copy)
of roughly eight ~25,000-element typed arrays, which is a real but almost certainly small cost that
should be measured, not assumed, against PERF-07a. Second, the manifest dates independently confirm
every date claim CONTEXT.md's D-10, D-11 and D-15 make (`TQQQ/total-return` 2010-02-11,
`UPRO/total-return` 2009-06-25, `NDX/total-return` 1999-03-04, `SPX/total-return` strict
1988-01-05) -- these are not assumptions to re-verify at plan time.

**Primary recommendation:** Build the PNG and CSV export paths as two independent modules behind
the export row, each reusing an existing repo pattern verbatim (`html-to-image` for PNG,
Comlink-worker for CSV, `MethodologyOverlay`-style overlay plus `compute-presets.ts`-generates-
`presets.generated.ts` for Scenarios), and measure the PNG path's PERF-07a compliance with a new
Playwright browser command that follows `bench/perf-07.bench.test.ts`'s existing longtask-observer
pattern rather than inventing a new measurement mechanism.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| PNG capture (DOM -> raster) | Browser / Client | -- | `html-to-image` serializes live DOM and computed styles; requires the real render tree, cannot run in a Worker (no DOM access there) |
| Clipboard write / download fallback | Browser / Client | -- | `navigator.clipboard.write()` and the anchor-download fallback are both main-thread browser APIs with user-activation requirements |
| CSV row construction | Browser / Client (Worker) | -- | D-09: built in a Worker off the main thread; the worker receives already-computed typed arrays, does no simulation, no DOM |
| Preset parameter definitions | Browser / Client (static data) | Build tooling | D-19: plain data structures bundled into the client; no server, no persistence |
| Preset headline figures | Build tooling | -- | D-18: computed once at build time by `scripts/compute-presets.ts` (a Node CLI script), emitted as a generated TS module, never computed on page load |
| Permalink construction for a preset | Browser / Client | -- | Reuses `src/app/permalink.ts`'s existing `encodeParams`, the one canonical call site (D-19, Pitfall 5) |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `html-to-image` | 1.11.13 [VERIFIED: npm registry] | DOM subtree -> PNG rasterization for SHARE-04 | D-04's locked choice; MIT-licensed, 6.24M weekly downloads, actively maintained (github.com/bubkoo/html-to-image), zero postinstall script [VERIFIED: npm registry via package-legitimacy gate] |

No other new runtime dependency is needed. CSV construction is plain string building (D-09 already
rejects a library); the preset overlay reuses `MethodologyOverlay.tsx`'s existing pattern; the
generator script reuses Node's built-in `fs` exactly as `measure-extended-tier-bias.ts` does.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `comlink` | 4.4.2 (already installed) | Worker RPC for the CSV-building worker (D-09) | Reuse the exact `new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' })` + `Comlink.wrap`/`Comlink.expose` pattern already used by `src/sweep/sweep-pool.ts`/`sweep.worker.ts` -- do not introduce a second worker-construction idiom |

### Alternatives Considered

CONTEXT.md's D-01 and D-04 already resolved the PNG-library alternatives (canvas-only export,
hand-composed export canvas, hand-rolled `foreignObject` pass) with reasoning this research
confirms rather than revisits: `html-to-image`'s own internal mechanism for embedded `<canvas>`
elements is exactly "read `toDataURL()` off each canvas, substitute an `<img>` in the DOM clone,
then rasterize the whole SVG" -- confirming D-01's premise that the library, not a hand-rolled
canvas redraw, is what makes capturing the mixed HTML+canvas region tractable in one pass.

**Installation:**
```bash
npm install html-to-image
```

**Version verification:** confirmed via `npm view html-to-image version` = `1.11.13`, last
published 2025-04-19 [VERIFIED: npm registry]. Confirmed via the package-legitimacy gate: `OK`
verdict, no postinstall script, MIT license, repo `github.com/bubkoo/html-to-image`
[VERIFIED: npm registry].

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|--------------|---------|-------------|
| html-to-image | npm | published 2025-04-19 (current major line active for years) | 6.24M/week | github.com/bubkoo/html-to-image | OK | Approved |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

`html-to-image` was discovered via CONTEXT.md's own D-04 (a user/prior-research decision, already
named in `.claude/CLAUDE.md`'s supporting-libraries table), not via this session's web search --
its registry existence and clean signals were independently confirmed this session via
`npm view` and the package-legitimacy gate [VERIFIED: npm registry], so it earns the `[VERIFIED]`
tag rather than `[ASSUMED]`.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ Browser main thread                                                  │
│                                                                        │
│  [Export row: Copy link | Export PNG | Export CSV]  (D-21, D-22)     │
│         │                    │                  │                    │
│         │ flushPermalinkUrl  │ click             │ click              │
│         │ + writeText        │                   │                    │
│         ▼                    ▼                   ▼                    │
│  clipboard.writeText   html-to-image.toBlob   postMessage(          │
│  (existing pattern)    (.screenshot-region,        seriesRefs,       │
│                         width/pixelRatio opts)      params, meta)    │
│                              │                      │                 │
│                              ▼                      ▼                 │
│                    clipboard.write([          ┌──────────────┐        │
│                      new ClipboardItem({      │ CSV Worker   │        │
│                        'image/png': blob      │ (Comlink)    │        │
│                      })                       │ D-09         │        │
│                    ]) -- promise passed        │              │        │
│                    directly, not awaited       │ builds       │        │
│                    first (Safari activation)   │ preamble +   │        │
│                              │                  │ rows string  │        │
│                    catch -> download <a>       │ -> Blob      │        │
│                    fallback (CopyLinkButton     └──────┬───────┘        │
│                    pattern, D-23)                       │ Blob          │
│                                                          ▼               │
│                                                  main thread receives   │
│                                                  Blob, triggers <a       │
│                                                  download> (D-09)       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ Build time (Node, scripts/compute-presets.ts, D-18)                  │
│                                                                        │
│  presets.ts (parameter sets, D-19)                                    │
│         │                                                              │
│         ▼                                                              │
│  loadBundleFromDisk() -> buildKernelInputs() -> runBacktest()         │
│         │                          (identical call chain to           │
│         │                           scripts/run-backtest.ts and       │
│         │                           measure-extended-tier-bias.ts)     │
│         ▼                                                              │
│  computeDerivedMetrics()  (the SAME function src/app/state.ts's live  │
│         │                  recompute path calls -- closes F-07)       │
│         ▼                                                              │
│  src/app/presets.generated.ts (committed, hand-off-limits header)      │
│         │                                                              │
│         ▼                                                              │
│  tests/app/presets.generated.test.ts (pinning test, fails CI on drift)│
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── app/
│   ├── presets.ts                  # NEW: preset parameter-set definitions (D-19), plain data
│   ├── presets.generated.ts        # NEW: build-time headline figures (D-18), committed, GENERATED
│   └── components/
│       └── ResultColumn/
│           ├── ExportRow.tsx       # NEW: Copy link / Export PNG / Export CSV (D-21, D-22)
│           └── ScenariosOverlay.tsx# NEW: mirrors MethodologyOverlay.tsx's pattern (D-14)
├── export/
│   ├── png-export.ts               # NEW: html-to-image call site, width/pixelRatio/background opts
│   ├── csv-export.ts               # NEW: main-thread orchestration -- posts to worker, receives Blob
│   ├── csv.worker.ts               # NEW: Comlink-exposed CSV row/preamble builder (D-09)
│   └── download.ts                 # NEW: shared Blob -> <a download> trigger, used by CSV and the PNG fallback
scripts/
└── compute-presets.ts              # NEW: build-time generator (D-18), mirrors measure-extended-tier-bias.ts
tests/
├── app/
│   ├── export-png.browser.test.ts  # NEW: real-browser capture assertions
│   ├── export-csv.test.ts          # NEW: Node-side CSV content/format assertions
│   └── static-build.test.ts        # MODIFIED (F-01): invert the ban, assert capture is scoped to src/export/
└── app/presets.generated.test.ts   # NEW: pinning test, mirrors extended-tier-bias.test.ts
bench/
└── perf-08-png-export.bench.test.ts # NEW: PERF-07a measurement for the PNG path (F-05), mirrors perf-07.bench.test.ts
```

### Pattern 1: PNG capture with a fixed export width and forced background

**What:** `html-to-image.toBlob(node, options)` accepts `width`/`height` (applied to the node's
style before cloning), `pixelRatio` (device-pixel-ratio multiplier baked into the raster), and
`backgroundColor` (painted behind the whole capture). This is the exact mechanism D-02 and D-03
depend on.
**When to use:** Every PNG export call.
**Example:**
```typescript
// Source: html-to-image README (github.com/bubkoo/html-to-image) [CITED]
import { toBlob } from 'html-to-image'

const EXPORT_WIDTH_PX = 1150 // Claude's discretion within the 1100-1200px band (D-03)
const EXPORT_PIXEL_RATIO = 2 // D-03's "2x pixel density"

async function exportRegionAsPng(region: HTMLElement, backgroundColor: string): Promise<Blob> {
  const blob = await toBlob(region, {
    width: EXPORT_WIDTH_PX,
    pixelRatio: EXPORT_PIXEL_RATIO,
    backgroundColor, // D-02: forced opaque background, read from the live theme's CSS custom property
  })
  if (blob === null) throw new Error('png-export: toBlob returned null')
  return blob
}
```
**Caveat verified this session:** a documented GitHub issue (bubkoo/html-to-image#320) reports
that setting `width`/`height` alone does not always reflow a node's own internal children when
those children size themselves from the *current* viewport rather than from CSS the library can
override by mutating inline style. `.screenshot-region`'s two known trees (`App.tsx`'s single-run
region and `HeatmapPanel.tsx`'s sweep region) both size their internal canvases from fixed pixel
constants (`HEATMAP_WIDTH_PX`/`HEATMAP_HEIGHT_PX`) rather than from the viewport, which is the
condition under which this failure mode does not apply -- but this should be verified empirically
against the real DOM tree at implementation time, not assumed from the library's stated option
behaviour alone [ASSUMED -- see Assumptions Log A1].

### Pattern 2: Clipboard write that survives Safari's user-activation model

**What:** Safari (WebKit) treats `navigator.clipboard.write()` as requiring transient user
activation that does **not** survive an `await` gap the way Chromium's implementation does. The
documented, WebKit-team-endorsed workaround is to pass the `Promise<Blob>` directly as the
`ClipboardItem` value, never to `await` the blob first and call `write()` afterward.
**When to use:** The Export PNG button's click handler, exactly.
**Example:**
```typescript
// Source: WebKit blog "Async Clipboard API" + web.dev "Unblocking clipboard access" [CITED]
// https://webkit.org/blog/10855/async-clipboard-api/
// https://web.dev/articles/async-clipboard
async function handleExportPngClick(region: HTMLElement, backgroundColor: string): Promise<void> {
  const blobPromise = exportRegionAsPng(region, backgroundColor) // NOT awaited here

  if (navigator.clipboard === undefined || typeof ClipboardItem === 'undefined') {
    // D-23: Clipboard API unavailable -- fall back to download immediately.
    triggerDownload(await blobPromise, pngFilename())
    return
  }

  try {
    // Pass the promise directly: Safari's activation gate requires the Clipboard API call
    // itself to be synchronous from the click handler, not merely the code that triggered it.
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })])
  } catch {
    // D-23's fallback: same pattern CopyLinkButton.tsx already uses for its own clipboard call.
    triggerDownload(await blobPromise, pngFilename())
  }
}
```
**Why this matters for planning:** a plan task that writes `const blob = await toBlob(...)` and
*then* calls `navigator.clipboard.write([new ClipboardItem({'image/png': blob})])` will work in
Chromium (this project's only CI browser) but is a documented Safari failure mode -- confirmed via
independent sources (WebKit's own blog and web.dev), not merely inferred [CITED].

### Pattern 3: Worker-built CSV via Comlink, mirroring the existing sweep pool

**What:** A dedicated Comlink-exposed worker that receives copies of the already-computed typed
arrays plus scalar params and the permalink preamble strings, builds the `#`-commented preamble
and the CSV body as one string, and returns a `Blob`.
**When to use:** Every CSV export click (D-09).
**Example:**
```typescript
// src/export/csv.worker.ts -- follows src/sweep/sweep.worker.ts's exact Comlink.expose guard
import * as Comlink from 'comlink'

export interface CsvBuildRequest {
  preambleLines: readonly string[] // D-07: permalink params, bundle version, tier, date range, sources, permalink URL
  dates: readonly string[]         // resolved once on the main thread via fromDaysSinceEpoch(calendar[entryIndex + k])
  returns: Float64Array
  shortRate: Float64Array
  calendarDaysElapsed: Int32Array
  contributionFlags: Uint8Array
  contributionAmount: number       // scalar from KernelParams -- multiplied by the flag per row
  outValue: Float64Array
  outLongGap: Uint8Array
}

function buildCsv(req: CsvBuildRequest): Blob {
  const header = 'date,indexReturn,shortRate,calendarDaysElapsed,contributionFlag,contributionAmount,longGapFlag,portfolioValue'
  const lines: string[] = [...req.preambleLines.map((l) => `# ${l}`), header]
  for (let i = 0; i < req.dates.length; i++) {
    const contributionAmount = req.contributionFlags[i] === 1 ? req.contributionAmount : 0
    lines.push(
      [
        req.dates[i],
        req.returns[i],
        req.shortRate[i],
        req.calendarDaysElapsed[i],
        req.contributionFlags[i],
        contributionAmount,
        req.outLongGap[i],
        req.outValue[i],
      ].join(','),
    )
  }
  return new Blob([lines.join('\n')], { type: 'text/csv' })
}

const csvWorkerApi = { buildCsv }
export type CsvWorkerApi = typeof csvWorkerApi

if (typeof self !== 'undefined') {
  Comlink.expose(csvWorkerApi)
}
```
```typescript
// src/export/csv-export.ts -- main-thread orchestration, mirrors sweep-pool.ts's Worker construction
import * as Comlink from 'comlink'
import type { CsvBuildRequest, CsvWorkerApi } from './csv.worker.ts'

export async function buildCsvBlob(req: CsvBuildRequest): Promise<Blob> {
  const worker = new Worker(new URL('./csv.worker.ts', import.meta.url), { type: 'module' })
  try {
    const remote = Comlink.wrap<CsvWorkerApi>(worker)
    // Comlink structured-clones plain objects/typed arrays by default (no Comlink.transfer here):
    // the arrays passed in are COPIES the caller made from the live KernelInputs buffers, so a
    // structured-clone copy at the postMessage boundary is a second copy, not a detach of the
    // live data the chart still needs (see Common Pitfalls).
    return await remote.buildCsv(req)
  } finally {
    worker.terminate() // one-shot worker, unlike the persistent sweep pool -- terminate after use
  }
}
```
**Not verified this session:** whether `remote.buildCsv(req)`'s typed-array arguments should be
passed via `Comlink.transfer()` (zero-copy, but detaches the source buffer) or left as plain
structured-clone arguments (a copy, but the source stays usable). Given the arrays involved are
caller-made *copies* already (not the live `KernelOutputs` buffers the chart still reads), a
structured-clone copy of those copies is the safer default; `Comlink.transfer()` would only make
sense if the caller deliberately produced disposable copies for this one call. Flagged for
plan-time measurement, not assumed [ASSUMED -- see Assumptions Log A2].

### Pattern 4: Build-time preset generation, copying the existing generated-module precedent exactly

**What:** `scripts/measure-extended-tier-bias.ts` is a real, working, currently-committed example
of exactly the pattern D-18 asks for: a pure measurement function, a thin `import.meta.main`-guarded
file-writing entry point, a generated module with a `GENERATED FILE. Do not hand-edit.` header, and
a pinning test that recomputes and asserts equality.
**When to use:** `scripts/compute-presets.ts`.
**Example:**
```typescript
// Source: read directly from scripts/measure-extended-tier-bias.ts and
// tests/validation/extended-tier-bias.test.ts this session [VERIFIED: scripts/measure-extended-tier-bias.ts:1-100, tests/validation/extended-tier-bias.test.ts:1-49]
// scripts/compute-presets.ts (shape only -- follow the real file's import.meta.main guard exactly)
import { loadBundleFromDisk } from '../src/data/load-bundle-node.ts'
import { buildKernelInputs } from '../src/data/kernel-inputs.ts'
import { runBacktest } from '../src/kernel/backtest.ts'
// computeDerivedMetrics is currently a module-private function in src/app/state.ts (verified:
// `function computeDerivedMetrics(...)` at state.ts:593, not exported) -- it must be exported
// from state.ts or extracted to a shared module before compute-presets.ts (a Node script with no
// DOM/Solid context) can call it. This is a real, small refactor this plan must schedule, not an
// existing seam this research can point to as already reusable.
import { computeDerivedMetrics } from '../src/app/state.ts' // requires export, see note above
import { PRESET_DEFINITIONS } from '../src/app/presets.ts'

export function computePresetOutcomes(bundle: Awaited<ReturnType<typeof loadBundleFromDisk>>) {
  return PRESET_DEFINITIONS.map((preset) => {
    const inputs = buildKernelInputs(bundle, preset.request)
    const result = runBacktest(inputs.params, inputs.series, inputs.outputs)
    const metrics = computeDerivedMetrics(bundle, inputs, result)
    return { id: preset.id, result, metrics }
  })
}
```
**Load-bearing finding, not previously stated in CONTEXT.md:** `computeDerivedMetrics`
[VERIFIED: src/app/state.ts:593] `function computeDerivedMetrics(currentBundle: LoadedBundle, inputs: KernelInputs, result: KernelResult): DerivedMetrics {` is currently **not exported** from
`state.ts`. F-07 (the shared-formatter concern) is satisfied only if `compute-presets.ts` calls
this exact function rather than reimplementing IRR/CAGR selection -- so this phase's plan must
include exporting it (or extracting it to a module both `state.ts` and `compute-presets.ts` import),
not merely importing it as though it were already public.

### Anti-Patterns to Avoid

- **Awaiting the PNG blob before calling `navigator.clipboard.write()`:** breaks Safari (Pattern 2 above). Always pass the `Promise<Blob>` as the `ClipboardItem` value.
- **Transferring (not copying) the live `KernelOutputs` typed arrays into the CSV worker:** `Comlink.transfer()` on the buffers `currentKernelInputs()` still holds would detach them mid-render, breaking the still-displayed chart. Copy first (`.slice()`), then hand the copy to the worker.
- **Reimplementing IRR/CAGR selection logic inside `compute-presets.ts`:** the one shared `computeDerivedMetrics` function must be the only place that decision is made (F-07); duplicating it creates exactly the two-representations-of-one-fact risk this codebase has consistently avoided elsewhere (Pitfall 5, D-19).
- **Testing the PNG export path only in Chromium and treating D-04's "already survived Safari quirks" claim as settled:** this project's `app` test project runs Chromium only (`instances: [{ browser: 'chromium' }]` [VERIFIED: vitest.config.ts:424]); no automated signal in this repo currently proves Safari behaviour for this specific DOM tree.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| DOM subtree -> raster PNG | A hand-rolled `foreignObject`-serialization pass | `html-to-image` | D-04 already settled this; the library has already solved the style-inlining, font-embedding and canvas-substitution problems this exact capture needs, and a hand-rolled pass would need to solve all three from scratch for zero benefit this phase |
| Blob-to-file download | A server round-trip or a data-URL `<a>` (memory-heavy for a 25,000-row CSV) | `URL.createObjectURL(blob)` + a synthetic `<a download>` click, then `URL.revokeObjectURL` | Standard, zero-dependency browser pattern; `CopyLinkButton.tsx`'s existing failure-fallback discipline is the template for wiring the click handler, not a new pattern |
| Cross-browser clipboard-write sequencing | Ad hoc try/catch around a naive `await blob; then write()` | The Promise-passed-directly-to-ClipboardItem pattern (Pattern 2) | This is a narrow, well-documented browser quirk (WebKit's own blog documents it) with one correct fix, not a design decision with alternatives |

**Key insight:** every "don't hand-roll" item in this phase is a hand-roll CONTEXT.md's own
decisions already declined (D-01 rejects hand-rolling the `foreignObject` pass explicitly) -- this
research's job was confirming those declines are correct against the library's actual documented
behaviour, not re-litigating them.

## Common Pitfalls

### Pitfall 1: Safari's `foreignObject` security model is untested by this project's CI
**What goes wrong:** `html-to-image` captures can render blank or vary run-to-run in Safari because WebKit applies a stricter security model to SVG `foreignObject` than Chromium/Firefox, and has flaky image-decode timing.
**Why it happens:** WebKit's `foreignObject` implementation does not guarantee synchronous decode of embedded content the way Chromium's does.
**How to avoid:** Manually verify the PNG export path in real Safari (not just Chromium, which is the only browser this project's `app` test project drives [VERIFIED: vitest.config.ts:424]) before shipping; do not rely on D-04's "already survived the Safari `foreignObject` quirks" framing as verified fact without a manual check, since no automated test in this repo currently exercises WebKit.
**Warning signs:** A PNG export that is blank, partially rendered, or missing the canvas-drawn heatmap/chart specifically in Safari while working correctly in Chrome/Firefox.

### Pitfall 2: Structured-clone cost of moving typed arrays into the CSV worker counts against the wrong budget if not measured
**What goes wrong:** D-09 says "the CSV is built in a Worker" so PERF-07a "holds structurally," but the `postMessage` call that hands the copied typed arrays to the worker still runs its structured-clone serialization on the main thread, synchronously, as part of the call that dispatches the work.
**Why it happens:** Structured clone of ArrayBuffers/TypedArrays is fast (near-memcpy speed) but is not literally zero-cost, and the arrays involved (~25,000 elements x up to 4 numeric arrays plus 2 byte arrays) are copied at least once (the caller's own defensive copy from the live `KernelOutputs`) before the postMessage clone.
**How to avoid:** Measure the main-thread time from click to `postMessage` dispatch directly (not just assume "it's in a Worker so it's free"), and record the figure the same way this project has recorded every other PERF-0x figure (STATE.md's own carried-forward warning: "every derived-not-measured number in this project that got tested turned out wrong").
**Warning signs:** A CSV export that feels instant in manual testing but a bench run that shows a multi-millisecond main-thread task on export click.

### Pitfall 3: `computeDerivedMetrics` is not currently exported
**What goes wrong:** `compute-presets.ts` cannot import a function that `state.ts` does not export, so a plan that assumes F-07's "one shared formatter" is a zero-cost reuse will fail to compile until `computeDerivedMetrics` [VERIFIED: src/app/state.ts:593] is exported or extracted.
**Why it happens:** `computeDerivedMetrics` was written as a module-private helper inside the live app's reactive state module, with no prior need for a Node-side caller.
**How to avoid:** Schedule the export (or extraction to a shared, Solid-free module) as an explicit task, not an implicit side effect of "call the existing function."
**Warning signs:** A TypeScript compile error importing `computeDerivedMetrics` from `state.ts` in a Node script context.

### Pitfall 4: `#`-commented CSV preamble breaks naive spreadsheet auto-import
**What goes wrong:** D-07 already accepts this cost explicitly ("Excel and Sheets import them as rows in column A rather than skipping them"), but it is worth restating precisely so the plan's acceptance criteria do not silently expect a clean import: a skeptic opening the file in Excel via double-click will see the preamble lines as garbage rows above the real header, not as ignored comments.
**Why it happens:** Standard CSV (RFC 4180) has no comment syntax; `#`-prefixing is a convention some tools (pandas, some CLI tools) support but general spreadsheet software does not.
**How to avoid:** State this cost in the plan's acceptance criteria and in any user-facing copy near the Export CSV button, rather than let it surface as a support question later. Already an accepted, documented cost in CONTEXT.md -- restated here so it is not lost between decision and task.
**Warning signs:** none needed at this phase -- this is a known, accepted tradeoff, listed here so the plan does not silently regress it into "just strip the preamble" during implementation.

### Pitfall 5: `tests/app/static-build.test.ts`'s ban must be inverted, not deleted (F-01)
**What goes wrong:** A plan that simply removes the ban (rather than replacing it with a positive assertion) loses the guard's entire value -- the correct end state is "capture code exists, and only inside `src/export/`," not "no assertion about capture code exists at all."
**Why it happens:** The path of least resistance when a test starts failing is to delete or weaken it.
**How to avoid:** [VERIFIED: tests/app/static-build.test.ts:120-146] the current test bans `.toDataURL(`/`canvas.toBlob(` call sites anywhere in `dist/` and bans `html-to-image`/`dom-to-image`/`dom-to-image-more`/`html2canvas` from `package.json` entirely. The replacement assertion should confirm the declared dependency is exactly `html-to-image` (not one of the other three) and that any `.toDataURL(`/`canvas.toBlob(` call site in the emitted bundle traces back to `html-to-image`'s own bundled code or this phase's own `src/export/` module, not to an unrelated new call site elsewhere in the app.
**Warning signs:** A green build with a silently deleted or trivially-weakened test file.

## Code Examples

### Download trigger (shared by CSV and the PNG clipboard-failure fallback)
```typescript
// src/export/download.ts -- Source: standard Blob-download browser pattern [CITED: MDN Blob docs]
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
```

### PERF-07a measurement for the PNG export path (extends the existing pattern, does not replace it)
```typescript
// vitest.config.ts's browser commands block already implements this exact mechanism for the
// slider-drag interaction (measureInteractionTiming) -- confirmed by reading the real
// implementation this session [VERIFIED: vitest.config.ts:287-318]. A PNG-export measurement
// command should follow the identical shape: install a PerformanceObserver({type: 'longtask',
// buffered: true}) via addInitScript BEFORE navigation, expose a recording function, navigate,
// click the Export PNG button, then read back the recorded longtask durations and select the max
// (never the sum -- see bench/perf-07.bench.test.ts's selectMaxLongTaskDuration, which this new
// bench file should reuse directly rather than reimplement).
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `document.execCommand('copy')` for clipboard writes | `navigator.clipboard.write()` / `writeText()` (Async Clipboard API) | Broadly supported since ~2020-2022 across Chromium/Firefox/Safari; this project already uses the async API in `CopyLinkButton.tsx` | No action needed -- the project is already on the current approach for text; this phase extends the same API to binary image data, which has the additional Safari-activation nuance documented in Pattern 2 |

**Deprecated/outdated:** none specific to this phase's stack; `html-to-image` itself is the actively maintained successor lineage of the older `dom-to-image` project (same rasterization technique, `html-to-image` is the maintained fork per its own README, `dom-to-image` and `dom-to-image-more` are both already banned by name in the existing `static-build.test.ts` guard, consistent with `html-to-image` being the intended choice).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `html-to-image`'s `width`/`height` options will correctly reflow both `.screenshot-region` trees (App.tsx's single-run region and HeatmapPanel.tsx's sweep region) without needing a manual re-layout step, because both trees size their canvases from fixed pixel constants rather than viewport-relative units | Pattern 1 | If wrong, D-03's fixed-export-width guarantee silently fails for one or both regions, producing exports whose layout still depends on the exporting user's own viewport -- exactly the failure mode D-03 exists to prevent. Verify empirically against both real trees before committing to this approach in a plan. |
| A2 | Passing the caller-copied typed arrays to the CSV worker as plain (structured-clone) Comlink arguments, rather than via `Comlink.transfer()`, is the correct default because those arrays are already disposable copies, not the live `KernelOutputs` buffers | Pattern 3 | If wrong (e.g. if a plan instead passes the live buffers directly without copying first), `Comlink.transfer()` would detach the buffers mid-render, corrupting or blanking the still-displayed chart's data. Low risk if the plan follows the copy-first pattern shown; worth an explicit test asserting the main-thread chart still renders correctly after a CSV export. |
| A3 | `computeDerivedMetrics`'s current signature and behaviour can be reused unchanged by a Node-side caller (no browser-only API dependency inside it) | Pattern 4 | If `computeDerivedMetrics` or its callees (`solveIrr`, `solveCagr`) depend on anything DOM/browser-specific, the export-and-reuse plan in Pattern 4 would need a larger refactor than "export one function." Not verified this session beyond confirming its declared signature; its body was not read line-by-line for browser-API dependencies. |

## Open Questions

1. **Does the sweep-mode `.screenshot-region` need its committed crosshair and hover readout suppressed for a PNG export?** (F-02, already flagged in CONTEXT.md as Claude's discretion)
   - What we know: `HeatmapPanel.tsx`'s region [VERIFIED: src/app/components/ResultColumn/HeatmapPanel.tsx:548-620] contains a field canvas, a separate crosshair-overlay canvas at identical geometry, absolutely-positioned axis-tick `<span>` elements, and a conditionally-rendered `HoverReadout`.
   - What's unclear: whether a transient (pointer-hover-only) `HoverReadout` should be forced-hidden before capture (it names ephemeral pointer state, arguably not part of "the argument"), while the committed crosshair (set by click, per Phase 7 D-22) should stay (it names the cell the user is arguing about).
   - Recommendation: distinguish the two in the plan explicitly -- suppress `HoverReadout` unconditionally before capture (it is pointer-transient state, not committed selection), keep the crosshair if a cell has been clicked (it is the argument being made).

2. **Will the `solveIrr` latency measured in STATE.md (~3.9x over its own internal budget) make the DCA preset (D-17) visibly slow when reached from the Scenarios overlay, and does that latency need a loading indicator this phase does not currently have a pattern for?**
   - What we know: STATE.md records `solveIrr` "roughly 3.9x over budget" on the contribution branch, reachable only via a contribution-schedule run, which the DCA preset deliberately exercises (F-04).
   - What's unclear: whether the app currently shows any loading/pending state for a slow single-run recompute (single-run compute has historically been assumed near-instant per PERF-02's 16ms budget, which this specific branch does not meet).
   - Recommendation: measure the actual DCA preset's click-to-result latency before finalizing the preset's entry parameters, and if it's materially slow, decide explicitly (as a plan-time checkpoint, not silently) whether a loading state is needed for this one preset -- do not assume the existing "loads within one frame" UI assumptions hold for this specific reachable path.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Chromium (Playwright) | Browser-mode tests (`app`, `bench` projects) | Yes [VERIFIED: package.json devDependencies `playwright: 1.62.1`] | 1.62.1 | -- |
| WebKit/Safari (Playwright) | Manual verification of Pitfall 1 (Safari `foreignObject` behaviour) | Not configured in this repo's test matrix [VERIFIED: vitest.config.ts:424 `instances: [{ browser: 'chromium' }]`] | -- | Manual, out-of-CI verification in real Safari; Playwright does support a `webkit` browser target if the team chooses to add automated coverage, but that is a scope decision for the plan, not assumed here |
| Async Clipboard API (`navigator.clipboard.write`, `ClipboardItem`) | SHARE-04's clipboard-write path | Present in all evergreen browsers this project targets; requires a secure context (HTTPS, which Cloudflare Pages provides) | -- | D-23's own documented fallback: download via `<a download>` when the API is unavailable or the context is insecure |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** Safari/WebKit automated coverage is absent from this repo's test matrix; the fallback is a manual verification step this phase's plan should schedule explicitly given D-04's claim rests on it.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10, three relevant projects: `unit` (Node), `app` (Chromium via `@vitest/browser-playwright`), `bench` (Playwright-backed performance harness) [VERIFIED: vitest.config.ts] |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test` (unit project only) |
| Full suite command | `npm run test` + `npm run test:app` + `npm run bench` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| SHARE-04 | PNG capture produces a non-empty, correctly-sized Blob from `.screenshot-region` in both themes | browser | `npx vitest run --project app tests/app/export-png.browser.test.ts` | ❌ Wave 0 |
| SHARE-04 | Capture stays within PERF-07a's 50ms long-task budget (measured, escalated if exceeded per D-05) | bench | `npm run bench -- bench/perf-08-png-export.bench.test.ts` | ❌ Wave 0 |
| SHARE-05 | CSV preamble carries every D-07 field; body carries every D-06 column; a hand-computed recurrence over the CSV matches `finalValue` | unit (Node) | `npx vitest run --project unit tests/app/export-csv.test.ts` | ❌ Wave 0 |
| SHARE-05 | CSV is built in a Worker (structural proof, not a timing assertion) | unit (Node) | mirrors `tests/sweep/cancellation.test.ts`'s pure-function-extraction pattern for testing worker logic without a real Worker | ❌ Wave 0 |
| SHARE-06 | Every preset's committed headline figure matches a live recomputation from the current bundle | unit (Node) | `npx vitest run --project unit tests/app/presets.generated.test.ts` (mirrors `tests/validation/extended-tier-bias.test.ts` exactly) | ❌ Wave 0 |
| SHARE-06 | Real-fund presets (D-16) assert leverage===1.0 AND expenseRatio===0 | unit (Node) | same generated-module pinning test, or a dedicated assertion in `presets.ts`'s own test | ❌ Wave 0 |
| SHARE-06 | Featured row shows exactly the four D-15 presets; Scenarios overlay shows the full library | browser | `npx vitest run --project app tests/app/scenarios-overlay.browser.test.ts` | ❌ Wave 0 |
| F-01 | `static-build.test.ts`'s inverted assertion: capture code exists, scoped to `src/export/` and the declared `html-to-image` dependency only | unit (Node) | modifies existing `tests/app/static-build.test.ts` | ✅ (modify, not create) |

### Sampling Rate
- **Per task commit:** `npm run test` (fast unit project).
- **Per wave merge:** `npm run test` + `npm run test:app` + `npm run bench`.
- **Phase gate:** Full suite green, including the new PNG-export bench file, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/app/export-png.browser.test.ts` -- covers SHARE-04's capture correctness
- [ ] `bench/perf-08-png-export.bench.test.ts` -- covers SHARE-04's PERF-07a measurement (F-05), following `bench/perf-07.bench.test.ts`'s exact five-step shape
- [ ] `tests/app/export-csv.test.ts` -- covers SHARE-05's column/preamble/recompute correctness
- [ ] `tests/app/presets.generated.test.ts` -- covers SHARE-06's pinning requirement, mirrors `tests/validation/extended-tier-bias.test.ts`
- [ ] `tests/app/scenarios-overlay.browser.test.ts` -- covers SHARE-06's featured-row/overlay UI
- [ ] Export `computeDerivedMetrics` from `src/app/state.ts` (or extract it) before `compute-presets.ts` can import it -- a build-time prerequisite, not a test file, but blocks every SHARE-06 test above

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | No | No auth surface in this app (APP-03: no backend) |
| V3 Session Management | No | No sessions |
| V4 Access Control | No | No access-controlled resources |
| V5 Input Validation | Marginal | CSV cell values in this phase are exclusively build-controlled (manifest strings) or kernel-computed numbers -- never raw user text -- so classic CSV-formula-injection (a cell starting with `=`/`+`/`-`/`@` executing as a spreadsheet formula) has no live attack surface today. Worth a one-line defensive note in the plan (prefix any future free-text cell with a leading `'`/tab) so this stays true if a future phase adds a user-editable label to a preset or export. |
| V6 Cryptography | No | No cryptographic operations in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| CSV formula injection (a cell value like `=cmd|'/bin/calc'!A1` executing in Excel/Sheets) | Tampering | Not currently reachable (see V5 above) since every CSV cell in D-06's column set is either a kernel-computed number or an ISO date string, never free text; document the constraint so a future column addition does not silently reintroduce it |
| Clipboard-write scope creep (writing more than the intended image type) | Information disclosure (low severity, client-only) | `ClipboardItem` is constructed with an explicit MIME-type key (`'image/png'`) matching the Blob's own `type`; no other clipboard formats are written |

## Sources

### Primary (HIGH confidence)
- `npm view html-to-image version` / `time.modified` / `license` / `repository.url` / `scripts.postinstall` -- direct registry queries, this session [VERIFIED: npm registry]
- Package-legitimacy gate (`gsd-tools query package-legitimacy check --ecosystem npm html-to-image`) -- `OK` verdict, 6.24M weekly downloads, no postinstall [VERIFIED: npm registry]
- Direct file reads this session: `tests/app/static-build.test.ts`, `src/kernel/backtest.ts`, `src/kernel/backtest.types.ts`, `src/data/kernel-inputs.ts`, `src/metrics/format.ts`, `src/app/permalink.ts`, `src/app/components/ParameterColumn/CopyLinkButton.tsx`, `src/app/App.tsx`, `src/app/components/ResultColumn/HeatmapPanel.tsx`, `src/app/components/MethodologyOverlay.tsx`, `src/sweep/sweep-pool.ts`, `src/sweep/sweep.worker.ts`, `src/app/state.ts`, `scripts/measure-extended-tier-bias.ts`, `src/validation/extended-tier-bias.generated.ts`, `tests/validation/extended-tier-bias.test.ts`, `perf-budgets.ts`, `bench/perf-07.bench.test.ts`, `vitest.config.ts`, `scripts/run-backtest.ts`, `public/data/manifest.f0a9dfbdfa.json`, `src/app/components/ResultColumn/ProvenanceStrip.tsx`, `src/app/components/ResultColumn/provenance-fields.ts` [VERIFIED: each cited inline above with path/line where the claim is load-bearing]

### Secondary (MEDIUM confidence)
- WebSearch: html-to-image Safari `foreignObject` known-issue summary (corroborates the semisignal.com and html2canvas-issue-tracker pattern of documented WebKit `foreignObject` limitations) [CITED]
- WebSearch: WebKit blog "Async Clipboard API" (webkit.org/blog/10855) and web.dev "Unblocking clipboard access" -- the Promise-passed-to-ClipboardItem pattern for Safari user-activation [CITED]
- WebFetch of `html-to-image`'s README (raw.githubusercontent.com/bubkoo/html-to-image) -- API surface (`toPng`/`toBlob`/`toCanvas`, options table) [CITED: github.com/bubkoo/html-to-image]

### Tertiary (LOW confidence)
- WebSearch summary of GitHub issue bubkoo/html-to-image#320 ("Setting width and height does not produce expected result") -- a single community-reported issue, not independently reproduced this session; treated as a flagged risk (Assumption A1), not a settled fact

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- `html-to-image` is a locked decision from CONTEXT.md, independently confirmed via npm registry and the package-legitimacy gate this session
- Architecture: HIGH -- every pattern (Worker/Comlink, overlay, generated-module-plus-pinning-test) was verified by reading the actual precedent files in this repo, not inferred from convention
- Pitfalls: MEDIUM -- the Safari `foreignObject` and Clipboard-activation risks are corroborated by multiple independent sources (WebKit's own blog, web.dev, community issue reports) but not reproduced against this specific app's DOM tree this session

**Research date:** 2026-08-26
**Valid until:** 30 days (stable browser APIs and a pinned dependency version; re-verify `html-to-image`'s version and the Safari behaviour claim if implementation slips past this window)
