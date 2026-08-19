# Phase 4: First Defensible Backtest in the Browser - Pattern Map

**Mapped:** 2026-08-19
**Files analyzed:** 20 (new/modified)
**Analogs found:** 12 exact/role-match, 3 convention-only, 5 no analog (genuinely new to this repo)

**Important framing (per orchestrator note):** this phase introduces the first Vite + Solid
frontend into a repo that has so far been Node-side TypeScript only (`src/data/`, `src/kernel/`,
`bench/`, `tools/`, `scripts/`). There is no in-repo Solid component, no uPlot wrapper, no browser
bundle loader, and no Playwright-page-navigation harness to copy from directly. For those files
this document names the nearest *convention* analog (structure, naming, doc-comment style, error
style) rather than inventing a fictitious one.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/data/kernel-inputs.ts` (extend: extract byte source, D-02) | service/loader | file-I/O -> transform | itself (existing) | exact (modify in place) |
| `src/data/load-bundle-browser.ts` (new) | service/loader | file-I/O (fetch) -> transform | `src/data/kernel-inputs.ts` `loadBundleFromDisk` (lines 95-116) | exact structural mirror |
| `src/kernel/backtest.types.ts` (extend: `maxDrawdown` field) | model/types | CRUD (typed-array contract) | itself (existing) | exact (modify in place) |
| `src/kernel/backtest.ts` (extend: in-loop drawdown, F-01) | service (pure compute) | transform | itself (existing) | exact (modify in place) |
| `src/metrics/irr.ts` (new) | utility (pure compute) | transform | `src/validation/tracking-error.ts` (pure numeric module, no I/O) — see below | role-match, convention analog |
| `src/metrics/format.ts` (new) | utility | transform | `src/validation/cost-parameters.ts` (pure formatting/constants module) | role-match, convention analog |
| `src/app/permalink.ts` (new) | utility (codec) | transform (encode/decode) | `tools/bundle-compiler/src/binary-format.ts` (`decodeHeader`/`encodeHeader` symmetric codec pair) | role-match, convention analog |
| `src/app/state.ts` (new) | store | event-driven (reactive) | none in repo | **no analog** — Solid-specific, see below |
| `src/app/theme.ts` (new) | utility | event-driven (media query) | none in repo | **no analog** |
| `src/app/main.tsx` (new) | entrypoint | request-response (mount) | none in repo | **no analog** |
| `src/app/App.tsx` (new) | component | request-response (render) | none in repo | **no analog** |
| `src/app/components/**/*.tsx` (new, ~13 files per UI-SPEC inventory) | component | request-response (render) | none in repo | **no analog** — see Solid/uPlot convention notes below |
| `vite.config.ts` (new) | config | — | `vitest.config.ts` (existing root-level Vite-family config, `defineConfig` + plugin composition style) | convention analog |
| `index.html` (new) | config/entry | — | none in repo | no analog (trivial Vite scaffold) |
| `tsconfig.json` (modify: add `jsx`/`jsxImportSource`) | config | — | itself (existing) | exact (modify in place) |
| `public/manifest.webmanifest` (new) | config | — | `public/_headers` (existing Phase 2 static config file under `public/`) | convention analog |
| `public/_headers` (extend: `index.html` short-cache rule) | config | — | itself (existing) | exact (modify in place) |
| `tests/data/kernel-inputs.test.ts` (extend for D-02 signature change) | test | request-response (assert) | itself (existing) | exact (modify in place) |
| `tests/app/permalink.test.ts` (new — SHARE-03, D-16) | test (property-based + golden) | transform (assert round-trip) | `tools/bundle-compiler/tests/roundtrip.test.ts` (fast-check round-trip property, lines 182-186 + golden-fixture assertions) | exact — same pattern (round-trip property + committed golden values) |
| `tests/metrics/irr.test.ts` (new) | test | transform (assert) | `tests/validation/tracking-error.test.ts` (pure-function numeric test, tolerance-based assertions) | role-match |
| `bench/perf-07.bench.test.ts` / `bench/perf-08.bench.test.ts` (new) | test (performance) | event-driven (browser measurement) | `bench/kernel.bench.test.ts` (measure -> normalize -> record -> assert shape) | role-match structure; **navigation mechanism has no analog** (Pattern 6 in RESEARCH.md is a synthesis, not a copy) |
| `vitest.config.ts` (extend: new `commands.measureColdLoad`/`measureWarmLoad`, `bench/global-setup.ts` production-preview server) | config | event-driven (Node<->browser bridge) | itself (existing `commands` block, lines 63-96) | exact — same bridge pattern, new commands |

## Pattern Assignments

### `src/data/load-bundle-browser.ts` (service/loader, file-I/O)

**Analog:** `src/data/kernel-inputs.ts` — `loadBundleFromDisk` (lines 95-116) and its
`readAsArrayBuffer` helper (lines 83-86).

**Imports pattern** (mirrors lines 12-26, browser-appropriate subset):
```typescript
import {
  calendarView,
  decodeHeader,
  type AssetHeader,
} from '../../tools/bundle-compiler/src/binary-format.ts'
import type { Manifest } from '../../tools/bundle-compiler/src/manifest.ts'
import { BUNDLE_VERSION, MANIFEST_PATH } from '../data-bundle.generated.ts'
```
Note: no `node:fs/promises`, no `node:path` — `fetch` + string concatenation replace them (D-02
explicitly rejects a parallel implementation of the assembly loop; only the byte source differs).

**Core loader pattern** (structural copy of lines 95-116, byte source swapped):
```typescript
async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`load-bundle-browser: fetching "${url}" failed with status ${response.status}`)
  }
  return response.arrayBuffer()
}
```
Reuse the identical `Map<string, {buffer, header}>` assembly loop; `decodeHeader`, `calendarView`,
`seriesView` are called unchanged. Do not duplicate `buildKernelInputs` — it stays pure over
`LoadedBundle` per D-02 and is untouched by this file.

**Error handling pattern** — matches the module's existing style: throw a plain `Error` prefixed
with the module/function name and the exact offending value (see lines 120-121, 133-136, 144,
193-196, 202). No custom error classes exist anywhere in `src/data/` or `src/kernel/` — do not
introduce one for this file; stay consistent with throw-a-named-Error.

**D-02's actual refactor target:** extract the shared byte-source parameter directly in
`src/data/kernel-inputs.ts` itself (`readAsArrayBuffer` becomes a caller-supplied function), not
just add a sibling file — re-read RESEARCH.md's Pattern 1 code block (lines 337-386) before
writing the task; it shows the target shape already assuming that extraction happened.

---

### `src/kernel/backtest.types.ts` / `src/kernel/backtest.ts` (extend for `maxDrawdown`, F-01)

**Analog:** the file itself — this is an in-place extension of an existing, heavily-conventioned
module, not a new pattern.

**Doc-comment convention to preserve** (see `backtest.types.ts` lines 59-74 and `backtest.ts`
lines 1-39): every field on `KernelResult` carries an inline `/** ... */` comment naming which
Decision governs it (e.g. `(D-22)`, `(D-21)`). The new `maxDrawdown` field must follow the same
citation style, e.g. `/** Largest peak-to-trough fractional decline, tracked in-loop (Phase 4
F-01). */`.

**Core in-loop pattern** (extend the existing per-bar loop in `backtest.ts`, around line 87
onward — two new scalars alongside the existing five: `value`, `ruined`, `ruinBarIndex`,
`droppedContributionsTotal`, `totalContributed`, `longGapBarCount`):
```typescript
let peakValue = initialInvestment
let maxDrawdown = 0
// ...inside the existing per-bar loop, after outValue[i] is finalized for bar i:
if (outValue[i] > peakValue) {
  peakValue = outValue[i]
} else if (peakValue > 0) {
  const drawdown = 1 - outValue[i] / peakValue
  if (drawdown > maxDrawdown) maxDrawdown = drawdown
}
```
SIM-11 discipline (no allocation in the hot loop, verified in the existing file's own doc comment,
lines 29-32) governs this addition: two more scalar `let`s, no new array, no allocation.

**Cross-cutting cost — Pitfall 1 (RESEARCH.md):** every `KernelResult` literal construction
across `tests/kernel/*.test.ts`, `tests/data/kernel-inputs.test.ts`, `bench/kernel.bench.test.ts`,
`bench/kernel-series-bridge.ts`, `tests/kernel/module-boundary.test.ts` needs the new field added.
Grep `KernelResult` before scoping this task — do not treat it as "one field."

---

### `src/metrics/irr.ts` (utility, pure compute — no in-repo IRR/bisection analog exists)

**Convention analog:** `src/validation/tracking-error.ts` and `src/validation/cost-parameters.ts`
— both are pure numeric modules with no I/O, heavily-cited doc comments naming the Decision that
governs each constant/branch, and exported pure functions with explicit input/output types.

**Doc-comment convention to copy:** file-level header comment naming the file path, the phase, and
which Decisions it implements (see `cost-parameters.ts` lines 1-58 for the density expected —
Phase 4's `irr.ts` header should name D-08 and the bracket/tolerance/iteration-cap values as
"Claude's Discretion, subject to D-08's bracket and undefined-result requirement" verbatim, since
CONTEXT.md explicitly flags this as discretionary).

**Core pattern:** RESEARCH.md's Pattern 2 (lines 393-450) is the concrete implementation to use
directly — bisection over `[-0.9999, 10.0]`, explicit `null` return (never `NaN`/`Infinity`) when
the bracket doesn't straddle zero. This is the one place in RESEARCH.md where the code example
should be copied close to verbatim rather than treated as a starting sketch, since D-08 already
locks the algorithm and bracket.

**Error/undefined handling pattern:** matches `kernel-inputs.ts`'s "explicit sentinel, never throw
for an expected edge case" style used for `ruinBarIndex: -1` (backtest.types.ts line 66) — `solveIrr`
returns `number | null`, not a thrown error, since an unsolvable bracket is an expected, displayable
outcome (D-08's "IRR undefined for this cash-flow pattern" copy), not a programmer error.

---

### `src/app/permalink.ts` (codec, encode/decode — SHARE-01/02/03, D-13 through D-16)

**Analog:** `tools/bundle-compiler/src/binary-format.ts`'s `encodeHeader`/`decodeHeader` pair is
the closest in-repo symmetric-codec precedent (a value goes in, a canonical serialized form comes
out, and the reverse must reproduce the original exactly) — read that pair's structure for the
"one canonical format, both directions in one file" convention, even though the wire format here
is `URLSearchParams`, not a binary header.

**Core pattern — canonical serialization in one place (Pitfall 5):**
```typescript
// src/app/permalink.ts — one place owns every field's string format, used by both directions.
export function encodeParams(params: BacktestRequest & { tier: string; holdMode: 'today' | 'fixed'; resolvedEndDate: string; bundleVersion: string }): URLSearchParams {
  const qs = new URLSearchParams()
  qs.set('symbol', params.symbol)
  qs.set('leverage', params.leverage.toFixed(2))       // fixed decimal count, never toString()
  qs.set('entryDate', params.entryDate)                 // already ISO YYYY-MM-DD
  // ... every BacktestRequest field, D-13: nothing omitted, no default elided
  return qs
}
export function decodeParams(qs: URLSearchParams): BacktestRequest | { error: string } {
  // mirror encodeParams field-for-field; return a named error rather than throwing, consistent
  // with kernel-inputs.ts's "explanation, not silent coercion" style (D-10/D-11/D-12)
}
```
Use `history.replaceState`, never `pushState` (Anti-Pattern in RESEARCH.md, D-03 interaction).

**Test analog — exact match:** `tools/bundle-compiler/tests/roundtrip.test.ts` lines 182-186:
```typescript
const extremeValues = fc.constantFrom(0, -0, Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE, -Number.MIN_VALUE)
const element = fc.oneof(fc.double({ noNaN: true, noDefaultInfinity: true }), extremeValues)
fc.assert(
  fc.property(fc.array(element, { minLength: 1, maxLength: 500 }), (values) => {
    // round-trip assertion
  }),
)
```
Copy this shape for `decode(encode(params))` identity (D-16), generating `BacktestRequest`-shaped
arbitraries instead of raw float arrays, plus a second `describe` block with committed golden full
URLs asserted to a stated tolerance (same file's earlier byte-exact decode assertions, lines
41-60ish, are the golden-fixture-comparison precedent — tolerance-based here, not exact, per
D-16's "computation drift a round-trip cannot see").

---

### `src/app/state.ts`, `src/app/theme.ts`, `src/app/main.tsx`, `src/app/App.tsx`, `src/app/components/**/*.tsx` (Solid components — no in-repo analog)

**No analog exists in this repository.** This is genuinely the first `.tsx`/Solid/reactive-UI
code in the codebase (confirmed: `find src -type f` returns zero `.tsx` files, zero `solid-js`
imports anywhere). Do not invent a fictitious analog.

**What to follow instead:**
1. **Doc-comment / citation convention** from every other module in this repo: file-level header
   naming the Decision IDs it implements (e.g. `state.ts`'s header should name D-03's rAF-coalescing
   and D-13's "every param always" contract). This convention is load-bearing across the whole repo
   (`kernel-inputs.ts`, `backtest.ts`, `cost-parameters.ts` all do this) and should not be dropped
   just because the language switches to JSX.
2. **RESEARCH.md's Pattern 5** (lines 537-556) is the concrete rAF-coalescing implementation for
   `state.ts`'s recompute effect — copy that shape directly, it is D-03 made concrete.
3. **RESEARCH.md's Pattern 4** (lines 496-535) is the concrete uPlot log-scale-toggle and
   theme-repaint implementation for the `EquityCurveChart` component and `theme.ts`.
4. **04-UI-SPEC.md's Component inventory** (lines 298-315) is the authoritative file/component list
   and must be treated as the structure — do not add or merge components beyond what it names.
5. **Error/validation style**: every validation-surfacing component (`ValidationExplanation`,
   `EntryDateControl`) must reuse `buildKernelInputs`'s thrown-error messages as the source of
   explanation text (per RESEARCH.md APP-04 row) — do not author new error copy that duplicates
   what `kernel-inputs.ts` already throws; catch and display, don't re-derive.

---

### `vite.config.ts` (config)

**Convention analog:** `vitest.config.ts` (existing, full file read) — same `defineConfig` +
plugin-composition + doc-comment-per-nonobvious-choice style. Note its header pattern: a top-of-file
comment naming the exact filesystem convention being relied on (see `vitest.config.ts` lines 18-20,
"Convention this repo's compiler and CLI both follow... the compiled bundle always lands at
'public/data'"). `vite.config.ts` should state its own such convention (dev-server `public/` mount
serves the same `public/data/*.bin` files the compiler CLI writes, per D-02/RESEARCH.md's confirmed
`bench/decode-time.bench.test.ts` precedent).

**Core pattern:** RESEARCH.md's `vite.config.ts` skeleton (lines 728-746, truncated in this pass but
already shown with `solid()` + `VitePWA({...})` plugin composition) — use directly, `globPatterns`
and `maximumFileSizeToCacheInBytes` values confirmed against a real `npm run build` output per its
own inline caveat.

---

### `bench/perf-07.bench.test.ts` / `bench/perf-08.bench.test.ts` (performance test, browser measurement)

**Analog for the measure -> normalize -> record -> assert shape:** `bench/kernel.bench.test.ts`
(full structure read above, lines 1-80+) — `measureBatchedMinOfN`, `normalize`, `resolveRunCalibration`,
`commands.recordEnvironment`, `commands.recordInfoLine`, `assertWithinBudget`/`checkBudget` from
`bench/report.ts`. Every new PERF-07/08 test should follow this exact five-step shape; do not invent
a new reporting or assertion pattern.

**No analog for the navigation mechanism itself** (opening a fresh Playwright page against a
`vite preview`-served production build from inside a `commands` implementation) — RESEARCH.md's
Pattern 6 (lines 561-625) is a synthesis from Vitest/Playwright docs, not a copy of existing code
in this repo, and is flagged MEDIUM confidence there. Treat it as a design task, following the
existing `commands` bridge shape in `vitest.config.ts` (lines 63-96) for how new commands are wired
(Node-side implementation, `_context` first param, JSON-serializable return), but the
`context.newPage()` / `page.goto()` body itself has no precedent to copy from in this repo.

**Bridge pattern to copy exactly** (`vitest.config.ts` lines 63-96 — every existing command follows
this shape):
```typescript
measureColdLoad: async (_context) => {
  // Node-side implementation; persists via bench/accumulator-store.ts, same as recordMeasurement
},
```

---

## Shared Patterns

### Error style: named `Error` with offending value, never a custom error class
**Source:** `src/data/kernel-inputs.ts` lines 120-121, 133-136, 144, 193-196, 202; `src/kernel/backtest.ts` lines 63-69, 71-75.
**Apply to:** `load-bundle-browser.ts`, `permalink.ts`'s decode-error path, `irr.ts` (though `irr.ts`
uses an explicit `null` sentinel instead per D-08 — see above), any new validation surfacing.
```typescript
throw new Error(`<module-name>: "<field>" <what's wrong>, got <value>`)
```

### Doc-comment header convention: cite the Decision IDs a file implements
**Source:** every existing `src/` and `tools/bundle-compiler/src/` module (see `backtest.ts` lines
1-39, `kernel-inputs.ts` lines 1-10, `cost-parameters.ts` lines 1-58).
**Apply to:** every new file in this phase, including `.tsx` components — this is a repo-wide
convention, not a Node-code-only one.

### Bridge command pattern: Node<->browser via `vitest.config.ts` `commands`
**Source:** `vitest.config.ts` lines 63-96 (`recordMeasurement`, `recordEnvironment`,
`recordInfoLine`, `readCalibration`, `claimCalibration`, `readBundleBytes`, `readKernelSeries`).
**Apply to:** any new PERF-07/08 measurement command; the shape (`async (_context, ...args) => {...
persist to disk via bench/accumulator-store.ts ...}`) is fixed by five existing precedents.

### Round-trip property + golden fixture testing
**Source:** `tools/bundle-compiler/tests/roundtrip.test.ts` (byte-exact decode assertions +
fast-check property at lines 182-186).
**Apply to:** `tests/app/permalink.test.ts` (SHARE-03/D-16) directly; `tests/metrics/irr.test.ts` can
use fast-check for algebraic invariants (e.g. "IRR of a single cash flow equals CAGR") per
RESEARCH.md Q7's division-of-labor note, with golden fixtures for tolerance-based UPRO/TQQQ-style
comparisons only where an external reference exists (not applicable to `irr.ts` itself, which has no
external reference — property-based only).

### Pure numeric module structure (no I/O, heavily cited constants)
**Source:** `src/validation/cost-parameters.ts`, `src/validation/tracking-error.ts`.
**Apply to:** `src/metrics/irr.ts`, `src/metrics/format.ts`.

## No Analog Found

Files with no close match in the codebase — planner should use RESEARCH.md's code examples and
04-UI-SPEC.md's component inventory as the primary source instead of an in-repo analog:

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/app/main.tsx` | entrypoint | mount | First Solid entrypoint in the repo; use RESEARCH.md's Vite/Solid scaffold conventions. |
| `src/app/App.tsx` | component | render | First `.tsx` component; structure from UI-SPEC's Screen structure (D-17/D-21) diagram. |
| `src/app/state.ts` | store | reactive | No Solid signal/store precedent exists; RESEARCH.md Pattern 5 (rAF coalescing) is the closest concrete guidance. |
| `src/app/theme.ts` | utility | media-query event | No `prefers-color-scheme`/CSS-custom-property precedent in-repo; RESEARCH.md Pattern 4 supplies the mechanism. |
| `src/app/components/ResultColumn/EquityCurveChart.tsx` | component | render (canvas) | First uPlot integration; RESEARCH.md Patterns 3 (log-cannot-plot-zero) and 4 (theme repaint) are the concrete guidance, Pitfall 3 is the specific failure mode to avoid. |
| `src/app/components/ResultColumn/*` (MetricsPanel, RuinBanner, ValidationExplanation, BundleVersionBanner, LoadingNotice) | component | render | No component precedent; copy is fixed verbatim by 04-UI-SPEC.md's Copywriting Contract table — treat that table as the pattern source, not prose. |
| `src/app/components/ParameterColumn/*` | component | render | No component precedent; state/validation wiring should reuse `buildKernelInputs`'s thrown-error text per APP-04 mapping above. |
| `index.html` | entry | — | Trivial, no in-repo precedent; standard Vite template. |
| `public/manifest.webmanifest` | config | — | No PWA manifest precedent; `vite-plugin-pwa` generates most of this, minimal hand-authoring. |
| PERF-08 navigation harness body (inside `bench/global-setup.ts` additions and the new `commands.measureColdLoad`/`measureWarmLoad`) | test infra | browser navigation | No prior phase built a fresh-page-navigation harness; RESEARCH.md Pattern 6 is a synthesis (MEDIUM confidence), not a copy. |

## Metadata

**Analog search scope:** `src/`, `bench/`, `tests/`, `tools/bundle-compiler/src/`,
`tools/bundle-compiler/tests/`, `tools/fetch-data/`, root config files (`vitest.config.ts`,
`tsconfig.json`, `perf-budgets.ts`, `package.json`).
**Files scanned:** ~55 (full repo listing) + 6 read in full or targeted excerpt (`kernel-inputs.ts`,
`backtest.types.ts`, `backtest.ts`, `vitest.config.ts`, `kernel.bench.test.ts`, `module-boundary.test.ts`,
`cost-parameters.ts` header, `roundtrip.test.ts` fast-check section, `kernel-inputs.test.ts` header).
**Pattern extraction date:** 2026-08-19
