# Phase 4: First Defensible Backtest in the Browser - Research

**Researched:** 2026-08-19
**Domain:** Vite + Solid.js static SPA scaffolding, browser-side binary data decode, IRR/XIRR
root-finding, uPlot log-scale/theming, Workbox offline precaching, and in-browser performance
measurement (long tasks, cold/warm load) via Vitest browser mode's Playwright provider.
**Confidence:** MEDIUM-HIGH — the data/kernel seam and every locked decision are read directly
from committed source (HIGH); the PERF-07/PERF-08 *measurement harness architecture* is
synthesized from Vitest/Playwright documentation because no prior phase built one (MEDIUM, flagged
explicitly below as the phase's highest-uncertainty area).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Compute Placement and the Browser Data Path**
- **D-01:** A single backtest runs on the main thread (no worker/Comlink for the single run).
- **D-02:** One loader core, two byte sources — extract the byte source as a parameter so Node
  (`readFile`) and browser (`fetch`) share one decode path. Reversibility: costly.
- **D-03:** Re-runs are coalesced to one per animation frame (rAF-scheduled effect, not per input
  event, not only on `change`).
- **D-04:** Offline is `vite-plugin-pwa` `generateSW`, precaching everything (app shell + all 14
  content-hashed `.bin` assets + manifest), `maximumFileSizeToCacheInBytes` raised past 2MB
  default for the 1.66MB bundle.

**Metrics and Ruin**
- **D-05:** IRR is always the headline, in a slot that never changes identity. CAGR is secondary,
  carrying the METR-02 qualifier when contributions are non-zero.
- **D-06:** METR-04's denominator is money actually invested (`finalValue / totalContributed`).
  `droppedContributionsTotal` is its own line, never folded into the ratio.
- **D-07:** Ruin is a state change of the whole result panel, with metrics retained subordinate to
  a categorical banner naming the ruin date; chart marks the ruin bar with a terminator.
- **D-08:** IRR is solved by bounded bisection with an explicit undefined result. Bisect over
  roughly -99.99% to +1000%. If the bracket does not straddle zero, print "IRR undefined for this
  cash-flow pattern." A ruined run resolves to -100% at the boundary. `NaN`/`Infinity` never reach
  the screen.

**Validation, Tiers and Data Edges**
- **D-09:** Phase 4 pins the strict tier and carries the tier in the URL; no selector ships.
  Reversibility: reversible.
- **D-10:** Constrain what a single control can know; explain everything else. Single-control
  bounds are enforced by the control; cross-field impossibilities are accepted and explained.
- **D-11:** While parameters are invalid the result area is cleared (chart and metrics removed,
  only the explanation remains).
- **D-12:** Date bounds recompute live from (symbol, dividend mode, tier); an evicted date is
  explained, not moved.

**Permalink Contract**
- **D-13:** Every parameter is emitted in the URL, always, as flat readable query params (~200
  chars, nothing omitted). Reversibility: one-way (published contract).
- **D-14:** Hold-to-today encodes both the mode and the end date resolved at creation
  (`holdMode=today` + resolved end date).
- **D-15:** A bundle-version mismatch computes against the deployed bundle and banners the change
  (names both versions, states the data has changed). Retaining old bundles is out of scope for
  Phase 4 (Deferred).
- **D-16:** SHARE-03 is a fast-check round-trip property (`decode(encode(params))` identity) plus
  committed golden runs (full URLs asserted to a stated tolerance).

**Visual Treatment** — governed by 04-UI-SPEC.md (approved); decisions below are its starting
direction:
- **D-17:** Controls left, result right; persistent control column; collapses to stacked on
  narrow viewports.
- **D-18:** The voice is a technical instrument panel — dense, monospace numerics, tight spacing,
  muted surface with the chart as the only saturated element. Every default parameter carries its
  source inline.
- **D-19:** Log y-axis by default with a visible toggle; theme follows `prefers-color-scheme` with
  manual override; uPlot reads CSS custom properties at render time and repaints on theme change.
- **D-20:** Phase 4 designs the screenshot region but ships no export (SHARE-04 is Phase 8).
- **D-21:** The result column is built as a slot that can hold either the equity curve or the
  heatmap (Phase 7 fills it later). Reversibility: reversible.

### Claude's Discretion
- Component decomposition inside the Solid app, state container shape, and CSS approach.
- Exact query-param names and value formats, subject to D-13's "every param, always, readable".
- The IRR bisection tolerance and iteration cap, subject to D-08's bracket and undefined result.
- Where max drawdown is computed (see Findings F-01), subject to it being one implementation.

### Deferred Ideas (OUT OF SCOPE)
- Keeping the last N data bundles deployed and addressable (stronger half of SHARE-02) — Phase 8
  candidate.
- The tier selector (APP-02) and extended-tier bias warning (CRED-02) — Phase 5.
- Restarting a fresh position after ruin — out of scope per Phase 3's D-21.
- PNG export, CSV export and preset scenarios (SHARE-04/05/06) — Phase 8.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| APP-01 | Select a symbol from the bundled universe | Manifest's 10 series ids (SPX/NDX/QQQ/UPRO/TQQQ/SSO/QLD/VTI/EFA/EEM/TLT are 11 scopes actually — see verified list below) drive a native `<select>`; `BacktestRequest.symbol` is the existing seam. |
| APP-03 | Fully static build, no backend/DB/runtime external calls | Vite 8.2.1 static build + Cloudflare Pages `_headers`; `public/_headers` already exists from Phase 2 for `/data/*`, extend for `index.html`. |
| APP-04 | Invalid/impossible combos prevented or explained, never coerced | D-10/D-11/D-12 already specify the mechanism; `buildKernelInputs`'s existing thrown errors (D-32) are the source of the explanation text. |
| DATA-08 | Load/decode into typed arrays with no per-row parsing, works offline after first load | D-02's shared byte-source seam + `vite-plugin-pwa` `generateSW` (D-04). Zero-copy decode already proven by `bench/decode-time.bench.test.ts`. |
| METR-01 | IRR is the default annualized metric when contributions non-zero | D-05/D-08; new module, XIRR-style bisection over calendar-day-weighted cash flows (Code Examples below). |
| METR-02 | CAGR suppressed/qualified when contributions make it misleading | D-05; secondary slot, qualifier copy in UI-SPEC Copywriting Contract. |
| METR-03 | Max drawdown computed and reported | F-01: no implementation exists; this research resolves the placement question (see Don't Hand-Roll / Architecture Patterns). |
| METR-04 | Final value as multiple of total contributed | `KernelResult.finalValue` / `KernelResult.totalContributed`, already returned (verified in code_context). |
| METR-05 | Ruin flag, categorical outcome | `KernelResult.ruined` / `ruinBarIndex`, already returned. |
| VIZ-08 | Equity curves offer log scale, visible toggle | uPlot native `scales: { y: { distr: 3 } }` (verified pattern below). |
| VIZ-11 | Legible in light and dark | CSS custom properties + explicit uPlot repaint on theme change (pattern below). |
| SHARE-01 | Every parameter in URL as readable query params | `URLSearchParams` is sufficient at this parameter-set size (no compression library needed — see Don't Hand-Roll). |
| SHARE-02 | URL carries bundle version, mismatch reproduces or states change | D-15; `BUNDLE_VERSION` from `src/data-bundle.generated.ts` is already the comparison value. |
| SHARE-03 | Determinism test | D-16: fast-check round-trip + golden fixtures (already a devDependency). |
| PERF-07 | No main-thread task > 50ms; 60fps slider drag | New measurement harness — Long Task API + rAF frame-delta sampling during a synthetic drag (Architecture Patterns / Validation Architecture below). |
| PERF-08 | Cold interactive < 1500ms, load+decode < 1000ms, warm < 300ms | New measurement harness — requires a fresh page navigation to a **production preview build**, which Vitest browser-mode's own test context cannot do directly; resolved via the existing `commands` bridge pattern reaching into Playwright's `BrowserContext` (Architecture Patterns below). |
</phase_requirements>

## Summary

Phase 4 has two genuinely distinct halves. The first half is mechanical: `BacktestRequest`,
`buildKernelInputs`, and `runBacktest` already form a complete, tested, typed pipeline
(`src/data/kernel-inputs.ts`, `src/kernel/backtest.ts`) that a UI can call directly with no new
data-layer invention beyond D-02's Node/browser byte-source split. The metrics the UI needs
(final value, ruin flag, ruin bar index, dropped contributions, total contributed) are already
fields on `KernelResult`. This half is "wire it up," not "design it."

The second half is genuinely new: there is no Vite scaffold, no Solid app, no uPlot chart, no
service worker, no permalink codec, no IRR solver, and no drawdown computation anywhere in the
repo (F-03, F-01). None of these are exotic — IRR-by-bisection, a log-scale uPlot chart, a
`URLSearchParams`-based permalink, and a Workbox `generateSW` config are all well-trodden
patterns — but every one of them is being built from zero this phase, and the plan should size
Wave 0 (scaffold: `vite.config.ts`, `index.html`, `tsconfig.json` JSX settings, `src/app/`)
as real work, not a preamble.

The one area with no established pattern anywhere in this codebase or its prior research is
measuring PERF-07 (long tasks, 60fps drag) and PERF-08 (cold/warm load, interactive-in-Xms)
inside the project's existing "one measurement environment" discipline (Vitest browser mode,
Playwright provider, `npm run bench`). Vitest browser-mode tests run inside an orchestrator
iframe and cannot navigate to an arbitrary URL from test code — this is a confirmed, documented
Vitest limitation, not a guess. The existing `commands` bridge (already used for
`recordMeasurement`/`readBundleBytes`/`readKernelSeries`) is the mechanism this project already
relies on for "ask the Node-side Playwright host to do something the browser test context
cannot," and it generalizes to PERF-08: the `context` object every custom command receives *is*
Playwright's real `BrowserContext`, which supports `context.newPage()` and `page.goto()` to an
arbitrary URL, including a `vite preview`-served production build. This is the load-bearing
architectural finding of this research pass (MEDIUM confidence — synthesized from Vitest's own
docs, not previously built in this repo) and the plan should treat it as an open design task with
a concrete starting point, not an unknown.

**Primary recommendation:** Scaffold Vite + Solid + uPlot as a thin wiring layer over the
already-complete kernel/data seam; extend `KernelResult` with a `maxDrawdown` scalar computed
in-loop (not a second pass) since SIM-11's allocation discipline and Phase 7's METR-06
single-pass requirement both favor it; build IRR as a new pure module using calendar-day-weighted
bisection over the same day-count discipline the kernel already uses; and build the PERF-08
harness as a new Node-side `commands` entry that opens a fresh Playwright page against a
`vite preview` server, not by trying to make it work inside a Vitest browser-mode test body.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Bundle fetch + zero-copy decode | Browser / Client | CDN / Static (asset hosting) | DATA-08 requires no backend; assets are static, content-hashed files served by Cloudflare Pages/CDN, decoded client-side into typed-array views (D-02). |
| Single-run kernel execution | Browser / Client | — | D-01: runs synchronously on the main thread inside a rAF-coalesced effect (D-03); no worker tier involved this phase. |
| IRR / CAGR / drawdown / ruin metric computation | Browser / Client | — | Pure functions over `KernelResult`/`KernelInputs`, no network or persistence involved. |
| Chart rendering (equity curve) | Browser / Client | — | uPlot draws to an in-page `<canvas>`; theme repaint driven by `prefers-color-scheme` read client-side. |
| Parameter validation (APP-04) | Browser / Client | — | No backend exists to validate against; `buildKernelInputs`'s thrown errors are the single source of truth for what is invalid. |
| Permalink encode/decode | Browser / Client | — | `URLSearchParams` read/write against `window.location`; no server-side redirect or shortening service (APP-03 forbids runtime external calls). |
| Offline asset availability | Browser / Client | CDN / Static | Service worker (Workbox `generateSW`) intercepts fetches client-side; the CDN only serves the *first* load. |
| Static asset hosting + immutable caching | CDN / Static | — | Cloudflare Pages serves content-hashed files with `_headers`-driven `Cache-Control: immutable`; no origin compute. |
| Performance measurement (PERF-07/08) | Build / Tooling (dev-time) | Browser / Client | The harness itself runs at CI/dev time via Playwright, but it measures the real Browser/Client tier's behavior — same framing Phase 1's research already used for the bench harness generally. |

No capability in this phase belongs to a Frontend-Server (SSR), API/Backend, or Database tier —
consistent with APP-03 and the project's "no backend, no database" constraint. This map should be
sanity-checked against the plan: any task that proposes a server-side validation step, a backend
permalink resolver, or a database-backed symbol list is a tier misassignment for this phase.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vite | 8.2.1 [VERIFIED: npm registry, `npm view vite version` this session] | Build tool, dev server, static output | Already pinned in `.claude/CLAUDE.md`; zero-config Worker/WASM/binary-asset support, trivial static output for Cloudflare Pages. |
| solid-js | 1.9.15 [VERIFIED: npm registry, `npm view solid-js version` this session — one patch ahead of the 1.9.14 pinned in `.claude/CLAUDE.md`] | UI framework | Fine-grained reactivity, no virtual DOM; matches the project's own Q3 rationale (no re-render cost layered on top of canvas redraws). |
| vite-plugin-solid | 2.11.14 [VERIFIED: npm registry] | Vite integration for Solid JSX/HMR | Standard Vite+Solid starter combination (already in `.claude/CLAUDE.md`'s Version Compatibility table). |
| uplot | 1.6.32 [VERIFIED: npm registry] | Equity-curve line chart | Zero dependencies, canvas-based, native log-scale support (`distr: 3`) — see VIZ-08. |
| vite-plugin-pwa | 1.3.0 [VERIFIED: npm registry] | Offline support (Workbox `generateSW` wrapper) | D-04 already locks this choice. |
| comlink | 4.4.2 [VERIFIED: npm registry — already installed] | Worker RPC | Not used for the single-run path (D-01); kept as-is since `bench/sweep-pool.ts` already depends on it from Phase 1 and Phase 7 inherits the seam. |
| fast-check | 4.9.0 [VERIFIED: npm registry — already installed] | Property-based testing | D-16's round-trip property (`decode(encode(params))` identity). |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| none beyond core | — | — | This phase needs no color-scale library (`d3-scale`/`d3-interpolate`): the equity curve is a single accent-colored stroke, not a color-mapped series. Defer `d3-scale`/`d3-interpolate` to Phase 6/7's heatmap, per `.claude/CLAUDE.md` Q2. `URLSearchParams` (native, no library) is sufficient for the permalink at the parameter-set size D-13 describes (~200 chars) — do not add `lz-string` or a hand-rolled base64url encoder this phase. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `URLSearchParams` (native) | `lz-string`-compressed permalink | Only worth it if the flat param set exceeds a URL-length concern; D-13 states ~200 chars, well under any browser's practical URL limit (all major browsers accept well over 2000 chars) — adding a compression dependency here would also defeat D-13's "flat readable query params" requirement. |
| uPlot native log scale (`distr: 3`) | Manually log-transforming values before passing to a linear-scale chart | uPlot's built-in log distribution handles axis tick formatting and `uPlot.rangeLog()` correctly; hand-transforming would require reimplementing tick generation for no benefit. |
| In-loop max drawdown (extend `KernelResult`) | Post-hoc pass over `outValue` in a new UI-layer module | See Architecture Patterns / Don't Hand-Roll below — in-loop is recommended, but a post-hoc pass is a legitimate lower-risk alternative if touching the locked D-30 kernel boundary is judged too costly for this phase; the tradeoff is one extra `O(n)` traversal per run (negligible at 0.21ms baseline, PERF-02) versus editing a module three other phases already depend on. |

**Installation:**
```bash
npm install solid-js@1.9.15 uplot@1.6.32
npm install --save-dev vite@8.2.1 vite-plugin-solid@2.11.14 vite-plugin-pwa@1.3.0
```

**Version verification:** All five packages confirmed via `npm view <pkg> version` against the
live registry this session (2026-08-19). `solid-js` is one patch release ahead of the version
pinned in `.claude/CLAUDE.md` (1.9.15 vs. 1.9.14) — install the current patch unless the project
has a reason to pin exactly 1.9.14.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| solid-js | npm | latest published 2026-08-17 | 3.08M/wk | github.com/solidjs/solid | SUS (`too-new`) | **Approved — false positive.** The `too-new` heuristic reads the latest version's publish date, not package age; solid-js is an established, high-download framework with an official GitHub repo. Same false-positive pattern Phase 1's research documented for `playwright`. |
| vite-plugin-solid | npm | latest published 2026-07-27 | 615K/wk | github.com/solidjs/vite-plugin-solid | SUS (`too-new`) | **Approved — false positive**, same reasoning as above. Official solidjs-org package. |
| vite | npm | latest published 2026-08-06 | 142.9M/wk | github.com/vitejs/vite | SUS (`too-new`) | **Approved — false positive.** Already the project's pinned build tool; 142M/week downloads and the canonical Vite repo make "too-new" a publish-cadence artifact, not a legitimacy signal. |
| uplot | npm | latest published 2025-03-14 | 409K/wk | github.com/leeoniya/uPlot | OK | Approved. |
| vite-plugin-pwa | npm | latest published 2026-05-05 | 3.69M/wk | github.com/vite-pwa/vite-plugin-pwa | OK | Approved. |
| comlink | npm | already installed | 2.18M/wk | github.com/GoogleChromeLabs/comlink | OK | Approved (no new install). |
| fast-check | npm | already installed | 27.7M/wk | github.com/dubzzz/fast-check | OK | Approved (no new install). |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `solid-js`, `vite-plugin-solid`, `vite` — all three
documented above as `too-new` false positives (the seam's heuristic keys off latest-version
publish recency, which every actively-maintained package trips). No `checkpoint:human-verify`
needed for these three specifically; the planner should still run this same
`package-legitimacy check` command at install time in case a genuinely different verdict appears
by then.

No package in this table had a `postinstall` script (`scripts.postinstall: null` for every
package checked this session).

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────┐
                    │  Cloudflare Pages (static hosting, CDN)   │
                    │  serves content-hashed /data/*.bin,       │
                    │  manifest.*.json, index.html, app JS      │
                    └───────────────┬───────────────────────────┘
                                    │ HTTP GET (first load only)
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Browser                                                                │
│                                                                         │
│  ┌──────────────┐   fetch()    ┌───────────────────┐                  │
│  │ Service       │◄────────────┤ loadBundleFromFetch │  (D-02: mirrors│
│  │ Worker cache  │   (or SW     │ (new, browser-only  │  loadBundleFrom│
│  │ (Workbox      │   intercept  │  byte source)        │  Disk's shape)│
│  │ precache)     │   on repeat) └─────────┬───────────┘                │
│  └──────────────┘                         │ ArrayBuffer(s)             │
│                                            ▼                            │
│                              ┌──────────────────────────┐              │
│                              │ decodeHeader / seriesView  │ (zero-copy  │
│                              │ / calendarView (unchanged) │  view, no   │
│                              │ tools/bundle-compiler/     │  per-row    │
│                              │ src/binary-format.ts       │  parsing)   │
│                              └─────────────┬─────────────┘              │
│                                            │ LoadedBundle                │
│                                            ▼                             │
│  Input events (symbol, leverage,  ┌──────────────────────┐             │
│  entry date, holding mode,        │ buildKernelInputs()    │ (D-32:     │
│  contributions, costs) ──────────►│ (unchanged data seam)  │ throws on  │
│         │                         └──────────┬────────────┘ invalid    │
│         │ writes to reactive state           │ KernelInputs (params/    │
│         │                                    │ series/outputs/window)   │
│         ▼                                    ▼                          │
│  ┌──────────────────┐         ┌───────────────────────────┐            │
│  │ rAF-coalesced      │────────►│ runBacktest()               │ (D-01: │
│  │ effect (D-03):     │         │ (kernel, unchanged, main    │ main   │
│  │ one run+paint per  │         │ thread; +maxDrawdown scalar,│ thread)│
│  │ animation frame    │         │ see F-01 resolution)         │        │
│  └──────────────────┘         └─────────────┬───────────────┘            │
│                                              │ KernelResult               │
│                    ┌─────────────────────────┼─────────────────────────┐ │
│                    ▼                         ▼                         ▼ │
│         ┌────────────────┐      ┌─────────────────────┐   ┌───────────┐ │
│         │ IRR/CAGR solver  │      │ EquityCurveChart      │   │ Permalink │ │
│         │ (new, XIRR-style │      │ (uPlot, log/linear,    │   │ codec     │ │
│         │ bisection)       │      │ theme-aware repaint)   │   │ (encode/  │ │
│         └────────┬─────────┘      └───────────┬────────────┘   │ decode    │ │
│                   │                            │                 │ URLSearch│ │
│                   ▼                            │                 │ Params)  │ │
│         ┌─────────────────────┐                │                └────┬─────┘ │
│         │ MetricsPanel /       │◄───────────────┘                     │       │
│         │ RuinBanner /         │                                       │       │
│         │ ValidationExplanation│                                       ▼       │
│         └─────────────────────┘                        window.location / │
│                                                          Copy Link button  │
└──────────────────────────────────────────────────────────────────────┘
```

Data flows one direction on every recompute: input event -> reactive state -> `buildKernelInputs`
-> `runBacktest` -> metric derivation (IRR/drawdown/multiple) -> render (chart + panel). The
permalink codec reads/writes the same reactive state it never touches the kernel directly — on
load it seeds initial state; on every change it re-serializes to `window.location` (via
`history.replaceState`, not `pushState`, so scrubbing a slider does not spam browser history).

### Recommended Project Structure

```
src/
├── app/
│   ├── main.tsx              # Solid render root, mounts <App/>
│   ├── App.tsx                # top-level layout (ParameterColumn | ResultColumn)
│   ├── state.ts                # reactive param store (Solid signals/store), the one
│   │                            # source of truth the permalink codec and kernel both read
│   ├── permalink.ts             # encode(params) -> URLSearchParams, decode(URLSearchParams)
│   │                            # -> params | ValidationError (D-13 through D-16)
│   ├── components/
│   │   ├── ParameterColumn/     # SymbolControl, LeverageControl, EntryDateControl,
│   │   │                        # HoldingModeControl, ContributionControl, CostControls,
│   │   │                        # SourceCitation, CopyLinkButton  (per UI-SPEC inventory)
│   │   └── ResultColumn/        # EquityCurveChart, MetricsPanel, RuinBanner,
│   │                            # ValidationExplanation, BundleVersionBanner, LoadingNotice
│   └── theme.ts                 # prefers-color-scheme + manual override -> data-theme attr
├── data/
│   ├── kernel-inputs.ts         # EXISTING — extend loadBundleFromDisk's byte-source split
│   │                             # here (D-02), do not duplicate the assembly loop
│   ├── load-bundle-browser.ts   # NEW — fetch-based byte source, same LoadedBundle shape
│   └── contribution-schedule.ts # EXISTING — unchanged
├── kernel/
│   ├── backtest.ts               # EXISTING — extend KernelResult with maxDrawdown (F-01)
│   └── backtest.types.ts         # EXISTING — extend KernelResult, no new imports
└── metrics/
    ├── irr.ts                    # NEW — XIRR-style bisection (D-08)
    └── format.ts                 # NEW — percentage/multiple/currency formatting rules
                                    # from UI-SPEC's MetricsPanel long-text row
public/
├── _headers                      # EXISTING (Phase 2) — extend for index.html short-cache
├── data/                          # EXISTING — compiled bundle, unchanged
└── manifest.webmanifest           # NEW — vite-plugin-pwa requirement
vite.config.ts                      # NEW — Solid plugin, PWA plugin, dev server public/ mount
index.html                           # NEW — Vite entry
```

### Pattern 1: D-02's shared byte-source seam

**What:** `loadBundleFromDisk` currently hard-codes `readFile`/`path.join` (Node-only). Extract a
`readAsset(path: string): Promise<ArrayBuffer>` parameter so the same assembly loop (manifest
parse, per-asset `decodeHeader`, `Map<string, {buffer, header}>` build) runs under both Node
(tests, `scripts/run-backtest.ts`) and the browser.

**When to use:** Any time the browser needs the identical `LoadedBundle` shape the Node-side tests
already exercise — which is every call site in this phase.

**Example (browser byte source, new file `src/data/load-bundle-browser.ts`):**
```typescript
// New file — mirrors loadBundleFromDisk's asset-collection loop exactly, only the byte source
// differs. MANIFEST_PATH and BUNDLE_VERSION are the same generated constants (verified this
// session in src/data-bundle.generated.ts).
import { MANIFEST_PATH, BUNDLE_VERSION } from '../data-bundle.generated.ts'
import { decodeHeader, calendarView, type AssetHeader } from '../../tools/bundle-compiler/src/binary-format.ts'
import type { Manifest } from '../../tools/bundle-compiler/src/manifest.ts'
import type { LoadedBundle } from './kernel-inputs.ts' // once loadBundleFromDisk's shared
                                                          // internals are extracted (D-02)

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`load-bundle-browser: fetching "${url}" failed with status ${response.status}`)
  }
  return response.arrayBuffer()
}

export async function loadBundleFromFetch(): Promise<LoadedBundle> {
  const manifestResponse = await fetch(MANIFEST_PATH)
  const manifest = (await manifestResponse.json()) as Manifest
  const dataDir = MANIFEST_PATH.slice(0, MANIFEST_PATH.lastIndexOf('/') + 1)

  const assets = new Map<string, { buffer: ArrayBuffer; header: AssetHeader }>()

  const calendarBuffer = await fetchArrayBuffer(dataDir + manifest.calendar.file)
  const calendarHeader = decodeHeader(calendarBuffer, BUNDLE_VERSION)
  assets.set(manifest.calendar.file, { buffer: calendarBuffer, header: calendarHeader })
  const calendar = calendarView(calendarBuffer, calendarHeader)

  for (const asset of manifest.assets) {
    const buffer = await fetchArrayBuffer(dataDir + asset.file)
    const header = decodeHeader(buffer, BUNDLE_VERSION)
    assets.set(asset.file, { buffer, header })
  }

  return { manifest, calendar, assets }
}
```
This is a direct structural mirror of the verified `loadBundleFromDisk` (`src/data/
kernel-inputs.ts:95-115`), not a reimplementation of the decode logic — `decodeHeader`,
`seriesView`, `calendarView` are called identically. `bench/decode-time.bench.test.ts` already
proves `fetch`-by-URL against the Vite-served `public/` mount works in this exact browser
environment (Vitest browser mode, Playwright/Chromium).

### Pattern 2: IRR by bisection over calendar-day-weighted cash flows

**What:** D-08 locks bisection over a `[-0.9999, 10.0]` annualized-rate bracket. The cash-flow
sequence is not bar-uniform (contributions land on trading days, which have irregular calendar
gaps — the kernel already tracks this via `calendarDaysElapsed`), so the correct discount
exponent per cash flow is `daysSinceEntry / 365`, XIRR-style, not `barIndex / barsPerYear`.

**When to use:** Whenever contributions are non-zero (METR-01); with zero contributions this
degenerates to the closed-form CAGR (D-05's "IRR equals CAGR for a single cash flow" note).

**Example (new file `src/metrics/irr.ts`):**
```typescript
// D-08: bracket roughly -99.99% to +1000%, ~[-0.9999, 10.0]. Single sign change guaranteed by
// D-21 dropping post-ruin contributions (Descartes' rule), so bisection cannot converge to a
// wrong root. Undefined result printed rather than NaN/Infinity ever reaching the UI.
export interface CashFlow {
  daysSinceEntry: number // 0 for the initial investment
  amount: number // negative = outflow (invested), positive = inflow (final value)
}

const LOWER_BRACKET = -0.9999
const UPPER_BRACKET = 10.0
const MAX_ITERATIONS = 100
const TOLERANCE = 1e-9 // Claude's Discretion per CONTEXT.md — tune against golden fixtures

function npv(rate: number, flows: readonly CashFlow[]): number {
  let total = 0
  for (const flow of flows) {
    total += flow.amount / Math.pow(1 + rate, flow.daysSinceEntry / 365)
  }
  return total
}

export function solveIrr(flows: readonly CashFlow[]): number | null {
  let lo = LOWER_BRACKET
  let hi = UPPER_BRACKET
  const npvLo = npv(lo, flows)
  const npvHi = npv(hi, flows)
  // No sign change across the declared bracket: undefined, not NaN (D-08).
  if ((npvLo > 0 && npvHi > 0) || (npvLo < 0 && npvHi < 0)) {
    return null
  }
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const mid = (lo + hi) / 2
    const npvMid = npv(mid, flows)
    if (Math.abs(npvMid) < TOLERANCE) {
      return mid
    }
    const sameSign = (npvMid > 0) === (npvLo > 0)
    if (sameSign) {
      lo = mid
    } else {
      hi = mid
    }
  }
  return (lo + hi) / 2
}
```
A ruined run's terminal cash flow is `0` at `ruinBarIndex`'s day offset (per D-22/D-23, verified
in `src/kernel/backtest.ts`: `outValue[ruinBarIndex] = 0`), which resolves to `-100%` at the lower
bracket boundary as D-08 specifies, with no special-casing needed in `solveIrr` itself.

### Pattern 3: Max drawdown — in-loop extension of the kernel (resolves F-01)

**What:** `KernelResult` (verified, `src/kernel/backtest.types.ts:60-77`) has no drawdown field.
Two placements are viable; this research recommends extending the kernel's own loop rather than a
UI-layer post-hoc pass, for three reasons verified against the actual code: (1) SIM-11's
allocation-free-hot-loop discipline is already proven in `runBacktest` (verified,
`src/kernel/backtest.ts`) — tracking a running peak and running max-drawdown is two more scalars
in a loop that already tracks five; (2) `KernelResult` is already the "small summary object built
once, after the loop" (verified docstring, `backtest.types.ts:59`) — `maxDrawdown` is structurally
identical to `finalValue`, `totalContributed`, etc., not a new kind of output; (3) Phase 7's
METR-06 explicitly requires "a sweep computes all display metrics per cell in a single pass" —
computing drawdown in-loop now means Phase 7's sweep worker gets it for free from the same
`runBacktest` call, rather than needing a second pass per cell at 10,000-cell scale.

**When to use:** This changes `KernelParams`/`KernelResult`'s shape — a decision that touches
`tests/kernel/module-boundary.test.ts` (verified: it asserts `backtest.ts` imports only
`./backtest.types.ts`, which an added scalar field does not violate) and every test file that
constructs a `KernelResult` literal. Flag this as a cross-cutting task in Wave 0, not a
buried detail in a UI task.

**Example (extending the verified loop in `src/kernel/backtest.ts`):**
```typescript
// Two more scalars alongside the existing five (value, ruined, ruinBarIndex,
// droppedContributionsTotal, totalContributed, longGapBarCount) — no new array, no allocation.
let peakValue = initialInvestment
let maxDrawdown = 0 // fraction, e.g. 0.35 means -35% from peak

// ...inside the existing per-bar loop, after outValue[i] is finalized for this bar:
if (outValue[i] > peakValue) {
  peakValue = outValue[i]
} else if (peakValue > 0) {
  const drawdown = 1 - outValue[i] / peakValue
  if (drawdown > maxDrawdown) {
    maxDrawdown = drawdown
  }
}
// A ruined bar's outValue is 0, so its drawdown is exactly 1 (100%) against any positive peak —
// consistent with D-07's "ruin is categorical," and this is the correct numeric floor, not a
// special case to add.
```

### Pattern 4: uPlot log-scale toggle and theme-aware repaint

**What:** VIZ-08's log toggle uses uPlot's native `scales.y.distr: 3` (confirmed:
`leeoniya/uPlot`'s type definitions declare `distr: Literal[1,2,3,4,100]` with `3` = logarithmic,
corroborated independently by the official `log-scales.html` demo and GitHub issue #29
[CITED: WebSearch summary of leeoniya/uPlot docs/README.md and demos, 2026-08-19, MEDIUM — no
direct fetch of the uPlot source was performed this session]). VIZ-11's theme requirement needs
an explicit repaint on `prefers-color-scheme` change, since canvas gets no free CSS-variable
styling (D-19 already states this; confirmed independently this session that uPlot's own GitHub
issue #436 exists specifically because this is a known non-trivial integration — the issue's
resolution content was not retrievable this session, so treat the *mechanism* below as this
research's own synthesis from the general "read `getComputedStyle`, recreate/re-render on
`matchMedia` change" pattern [CITED: multiple independent canvas-theming writeups, WebSearch
2026-08-19, MEDIUM] rather than a copied uPlot-specific snippet).

**When to use:** Every render and every theme toggle.

**Example:**
```typescript
// Toggle log/linear: swap distr, call chart.setScale or rebuild — uPlot requires updating the
// scale config, not just data, for a distr change to take effect.
function setLogScale(chart: uPlot, isLog: boolean): void {
  chart.setScale('y', isLog ? { distr: 3 } : { distr: 1 })
}

// Theme repaint: read CSS custom properties fresh on every theme change, then update series
// stroke and axis colors and force a redraw (uPlot has no automatic prefers-color-scheme hook).
function repaintForTheme(chart: uPlot): void {
  const styles = getComputedStyle(document.documentElement)
  const accent = styles.getPropertyValue('--color-accent').trim()
  const textMuted = styles.getPropertyValue('--color-text-muted').trim()
  chart.series[1]!.stroke = () => accent
  chart.axes[0]!.stroke = () => textMuted
  chart.axes[1]!.stroke = () => textMuted
  chart.redraw()
}

const media = window.matchMedia('(prefers-color-scheme: dark)')
media.addEventListener('change', () => repaintForTheme(chart))
```

### Pattern 5: rAF-coalesced kernel run (D-03)

**What:** Input events write reactive state; a single `requestAnimationFrame`-scheduled effect
runs `buildKernelInputs` + `runBacktest` + chart update, capped at one run per frame regardless of
how many input events fired.

**Example:**
```typescript
let scheduled = false
function scheduleRun(): void {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(() => {
    scheduled = false
    const inputs = buildKernelInputs(bundle, currentRequest())
    const result = runBacktest(inputs.params, inputs.series, inputs.outputs)
    updateChartAndMetrics(inputs, result)
  })
}
```
This directly satisfies PERF-07b's "no main-thread task exceeds one frame" for the interaction
path, since every possible burst of input events during a frame collapses to the single scheduled
callback.

### Pattern 6: PERF-08 measurement — Node-side `commands` bridge to a fresh Playwright page

**What:** Vitest browser-mode test code cannot call `page.goto()` to navigate to an arbitrary URL
— confirmed via Vitest's own open issue tracker (`vitest-dev/vitest#7875`, "Enable `page.goto()`
through custom commands in browser mode") and Vitest's browser-mode Context API docs, which state
tests don't have direct access to Playwright's page because it runs on the server; the `Commands
API` is the documented workaround [CITED: vitest.dev/guide/browser/context — WebSearch summary,
2026-08-19, MEDIUM]. This project already uses exactly that Commands API pattern for
`readBundleBytes`/`readKernelSeries` (verified, `vitest.config.ts`). Vitest's own docs on the
custom-command `context` parameter state that for the Playwright provider, the second exposed
property is `context`, described as "refers to the unique BrowserContext" [CITED:
vitest.dev/guide/browser/commands — WebSearch summary, 2026-08-19, MEDIUM]. A Playwright
`BrowserContext` supports `context.newPage()` and `page.goto(url)` to any reachable URL — this is
the mechanism PERF-08 needs and none of the existing bench files needed, because PERF-02/05/
DATA-BUNDLE-DECODE all measure isolated function calls inside the *existing* test-runner page,
never a fresh full-page navigation.

**When to use:** Add a new `commands.measureColdLoad` / `commands.measureWarmLoad` entry to
`vitest.config.ts`'s `browser.instances[].commands` block, implemented Node-side, that:
1. Ensures a `vite preview`-served build of the real production `dist/` output is running (start
   it once in `bench/global-setup.ts`, analogous to how the dev server already serves `public/`
   for `decode-time.bench.test.ts` — but a **production build**, not dev-server ESM, since dev
   server bundling/HMR overhead does not represent PERF-08's real target).
2. Opens a fresh page via the real `BrowserContext` the command receives, with cache disabled for
   the cold-load measurement and a second navigation (same context, cache warm) for the
   warm-load measurement.
3. Reads Navigation Timing (`performance.getEntriesByType('navigation')[0]`) plus an app-emitted
   `performance.mark('app-interactive')` (the app calls this once the first result renders) to
   compute "reaches interactive" without guessing at a generic `domContentLoaded` proxy.
4. Attaches a `PerformanceObserver({ entryTypes: ['longtask'] })` before navigation for PERF-07a
   (`entry.duration` max, not the TBT sum some public examples compute [CITED: chrisbremmer/
   playwright-performance example code, WebSearch/WebFetch 2026-08-19, MEDIUM] — PERF-07's stated
   ceiling is "no task exceeds 50ms," which is a max, not a sum).
5. Closes the page and returns the timing numbers across the `commands` bridge, exactly like
   `recordMeasurement` already does.

**Example (illustrative shape, not a verified working implementation — this is this session's
synthesis, flagged MEDIUM):**
```typescript
// vitest.config.ts — new command, same shape as the existing readBundleBytes/readKernelSeries
// commands (verified pattern in the current file).
measureColdLoad: async (context) => {
  const page = await context.context.newPage() // context.context is the real Playwright
                                                  // BrowserContext (per Vitest's documented
                                                  // custom-command context shape)
  await page.route('**/*', (route) => route.continue()) // cache-busting handled by a fresh
                                                           // context per cold-load call
  const longTasks: number[] = []
  await page.exposeFunction('__recordLongTask', (duration: number) => longTasks.push(duration))
  await page.addInitScript(() => {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // @ts-expect-error injected by exposeFunction
        window.__recordLongTask(entry.duration)
      }
    }).observe({ type: 'longtask', buffered: true })
  })
  const start = performance.now()
  await page.goto(PREVIEW_SERVER_URL, { waitUntil: 'load' })
  await page.waitForFunction(() => performance.getEntriesByName('app-interactive').length > 0)
  const interactiveMs = performance.now() - start
  await page.close()
  return { interactiveMs, longTasks }
}
```

### Anti-Patterns to Avoid
- **Building the sweep worker path (Comlink) for the single run:** D-01 already rejects this;
  PERF-02's measured 0.21ms leaves ~75x headroom against the 16ms frame budget, so a
  `postMessage` round trip only adds latency here.
- **Measuring PERF-08 by timing a Vitest browser-mode test's own module-import time:** this
  measures the Vitest orchestrator's iframe bootstrapping cost, not the real app's cold-load
  path, and would produce a number with no relationship to what a real user's browser does on
  first visit to the deployed Cloudflare Pages URL.
- **A second, hand-rolled Playwright script outside `npm run bench`:** breaks Phase 1's D-03
  ("budget assertions are ordinary `expect` calls... no separate reporting pipeline") — the
  `commands` bridge keeps PERF-08 inside the same `vitest run --project bench` invocation CI
  already gates on.
- **Encoding the permalink through `pushState`:** D-03's rAF-coalesced recompute fires on every
  slider-drag frame; using `pushState` here would spam the browser's back-button history with
  thousands of entries during a single scrub. Use `history.replaceState`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reading a discrete offline-availability signal for the whole bundle | Custom `Cache-Control`-only offline detection | `vite-plugin-pwa` `generateSW` (D-04) | Plain HTTP caching, even `immutable`, only governs revalidation on a network request — it does not make the app available with zero network, which DATA-08 explicitly requires (`.claude/CLAUDE.md` Q6, already researched). |
| URL-safe parameter serialization | Hand-rolled base64url or delimiter-based string format | Native `URLSearchParams` | At ~200 chars (D-13), no compression or custom escaping is needed; `URLSearchParams` already handles encoding correctly and is zero-dependency. |
| Log-scale axis math and tick formatting | Manual `Math.log10` transform + custom tick label generator | uPlot's `distr: 3` + `uPlot.rangeLog`/`uPlot.fmtNum` | uPlot ships this exact feature; reimplementing it risks getting tick rounding or negative/zero-value edge cases wrong in a chart whose entire point is not misleading the viewer (PITFALLS E6). |
| Cold/warm load and long-task detection | A hand-rolled `setTimeout`-based "time until DOM looks ready" heuristic | Navigation Timing API (`PerformanceNavigationTiming`) + `PerformanceObserver({entryTypes:['longtask']})` | These are the standard browser-native instrumentation APIs for exactly these two measurements; a heuristic timer would not correlate with what real users' browsers report and would not survive review as a credible PERF-08 methodology for a tool whose whole premise is rigor. |
| Money-weighted return (IRR) | A closed-form approximation (e.g., treating contributions as if they compound at CAGR) | Bisection over the actual dated cash-flow sequence (D-08, Pattern 2 above) | METR-01 requires genuine IRR, and PITFALLS D4 specifically warns that a naive root-finder can silently converge to a nonsensical root or produce `NaN` with no explanation — D-08's bounded bisection with an explicit undefined result is the standard, correct answer, not a shortcut to avoid reimplementing. |

**Key insight:** Every "don't hand-roll" item above already has a first-party, already-installed
(or already-decided) library or browser API that does it correctly; the risk in this phase is not
missing a library, it's under-budgeting the wiring and edge-case work of using the *correct*
feature of each one (uPlot's `distr`, not a from-scratch log transform; the browser's own Long
Task API, not a proxy timer).

## Common Pitfalls

### Pitfall 1: Editing the locked kernel boundary without touching every dependent test
**What goes wrong:** `KernelResult`/`KernelOutputs` are consumed by `tests/kernel/*.test.ts`,
`tests/data/kernel-inputs.test.ts`, `bench/kernel.bench.test.ts`, `bench/kernel-series-bridge.ts`,
and `tests/kernel/module-boundary.test.ts` (all verified to exist this session). Adding
`maxDrawdown` to `KernelResult` (Pattern 3) without updating every literal construction of a
`KernelResult` in those files produces type errors, not silent bugs — but the volume of touch
points is easy to under-scope in a plan that treats this as "one field."
**Why it happens:** The kernel boundary being "locked" (D-30) makes it look closed, when what it
actually means is "typed-array-and-scalar contract," which explicitly permits adding a scalar.
**How to avoid:** Grep every `KernelResult` literal and every destructure of it before writing the
task list; budget a dedicated task for the kernel extension, separate from the UI tasks that
consume `maxDrawdown`.
**Warning signs:** `npm run typecheck` failing in `tests/` or `bench/` after touching
`backtest.types.ts`.

### Pitfall 2: Measuring PERF-08 against the Vite dev server instead of a production build
**What goes wrong:** The dev server ships unbundled ESM modules with HMR client overhead; its
cold-load timing has no relationship to what Cloudflare Pages actually serves. `bench/
decode-time.bench.test.ts` already fetches from the dev server's `public/` mount, which is fine
for measuring *decode* (the asset bytes are identical either way) but would be wrong for measuring
*interactive time*, which depends on the JS bundle's real production size and structure.
**Why it happens:** The dev server is already running and reachable in the existing bench setup,
so it is the path of least resistance to reuse.
**How to avoid:** PERF-08's harness (Pattern 6) must navigate to a `vite preview`-served
production build, started fresh in `bench/global-setup.ts` (or a dedicated setup step) — not the
dev server.
**Warning signs:** A PERF-08 figure that looks suspiciously stable or fast across very different
bundle-size changes, which would indicate the measurement isn't actually sensitive to the
production bundle at all.

### Pitfall 3: Log-scale chart plotting a ruined position as a broken line to -Infinity
**What goes wrong:** `Math.log(0)` is `-Infinity`; a naive `distr: 3` scale fed a `0` value at the
ruin bar either throws inside uPlot's scale-range computation or renders a nonsensical spike.
**Why it happens:** The kernel correctly clamps ruined bars to exactly `0` (D-22/D-23, verified in
`backtest.ts`), which is the right *value* but the wrong thing to hand a log axis directly.
**How to avoid:** D-07/D-19 already specify the fix — truncate the plotted series at the bar
before ruin and render a separate destructive-colored terminator marker at the ruin date, rather
than passing the zero value into the log-scaled series at all.
**Warning signs:** A chart that silently stops rendering (blank canvas) or throws a range error
specifically on ruined runs, which is easy to miss in manual testing if the default landing run
(SPX 3x hold-to-today) never ruins.

### Pitfall 4: `tsconfig.json` has no JSX settings, and no scaffold exists yet (F-03)
**What goes wrong:** The current `tsconfig.json` (verified this session) has no `jsx` or
`jsxImportSource` compiler options. `npm run typecheck` (`tsc --noEmit`) will fail on the first
`.tsx` file added unless `"jsx": "preserve"` and `"jsxImportSource": "solid-js"` are added, even
though `vite-plugin-solid`'s Babel transform handles the actual JSX-to-DOM compilation separately
from typechecking.
**Why it happens:** No prior phase touched the frontend framework; this genuinely is the first
`.tsx` file in the repo.
**How to avoid:** Treat `tsconfig.json` JSX configuration as an explicit Wave 0 scaffolding step,
verified by a trivial `.tsx` file typechecking cleanly before any real component is written.
**Warning signs:** `tsc --noEmit` erroring on JSX syntax with a message about an unknown file
extension or unsupported syntax.

### Pitfall 5 (PITFALLS.md G4, cited): Nondeterministic permalink reproduction
**What goes wrong:** If URL parameter order, number formatting (e.g., `3` vs `3.0` vs `3.00`), or
date formatting varies between encode and decode, `decode(encode(params)) !== params`, breaking
D-16's fast-check round-trip property before it ever reaches a real reproducibility concern.
**How to avoid:** Fix a canonical serialization format per field type (e.g., leverage always
formatted with a fixed decimal count, dates always ISO `YYYY-MM-DD`) in one place (`src/app/
permalink.ts`), used by both encode and decode, never inferred ad hoc at each call site.
**Warning signs:** The fast-check property failing on a specific generated float (e.g.,
`leverage: 2.9999999999999996`) that round-trips through `toString()` differently than expected.

## Code Examples

### vite.config.ts skeleton (Solid + PWA + dev-server public mount)
```typescript
// Source: pattern synthesis from vite-plugin-solid README and vite-plugin-pwa FAQ
// [CITED: WebFetch of vite-pwa-org.netlify.app/guide/faq, 2026-08-19, MEDIUM]. Exact keys for
// this project's specific asset set (14 .bin files, one manifest) should be verified against a
// real `npm run build` output listing before finalizing globPatterns.
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    solid(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,bin,webmanifest}'],
        // D-04: raised past the 2MB Workbox default for the ~1.66MB compiled bundle; confirm the
        // exact figure against a real `npm run build` output — this is a starting value.
        maximumFileSizeToCacheInBytes: 3_000_000,
      },
    }),
  ],
})
```

### URLSearchParams permalink codec (D-13 through D-16)
```typescript
// New file: src/app/permalink.ts. One canonical format per field, shared by encode and decode
// (Pitfall 5 above). BacktestRequest fields verified against src/data/kernel-inputs.ts:34-46.
export interface PermalinkParams {
  symbol: string
  dividendReinvest: boolean
  leverage: number
  entryDate: string // ISO YYYY-MM-DD
  holdMode: 'fixed' | 'today'
  holdingPeriodBars: number | null // present only when holdMode === 'fixed'
  resolvedEndDate: string // D-14: always present, resolved at creation
  initialInvestment: number
  contributionAmount: number
  contributionFrequency: 'none' | 'daily' | 'monthly' | 'quarterly' | 'yearly'
  expenseRatioPercent: number
  financingSpreadPercent: number
  tier: 'strict' // D-09: only value this phase emits; Phase 5 adds 'extended'
  bundleVersion: string // D-15
}

export function encode(params: PermalinkParams): URLSearchParams {
  const usp = new URLSearchParams()
  usp.set('symbol', params.symbol)
  usp.set('dividendReinvest', String(params.dividendReinvest))
  usp.set('leverage', params.leverage.toFixed(2))
  usp.set('entryDate', params.entryDate)
  usp.set('holdMode', params.holdMode)
  if (params.holdingPeriodBars !== null) {
    usp.set('holdingPeriodBars', String(params.holdingPeriodBars))
  }
  usp.set('resolvedEndDate', params.resolvedEndDate)
  usp.set('initialInvestment', params.initialInvestment.toFixed(2))
  usp.set('contributionAmount', params.contributionAmount.toFixed(2))
  usp.set('contributionFrequency', params.contributionFrequency)
  usp.set('expenseRatioPercent', params.expenseRatioPercent.toFixed(4))
  usp.set('financingSpreadPercent', params.financingSpreadPercent.toFixed(4))
  usp.set('tier', params.tier)
  usp.set('bundleVersion', params.bundleVersion)
  return usp
}
// decode() is the exact inverse, validating each field's presence/parseability and returning a
// tagged error (never throwing past the caller) so a malformed/hand-edited URL routes to
// D-11/D-12's clear-and-explain path rather than crashing the app.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Vitest browser mode configured via a bare `provider: 'playwright'` string | `provider: playwright()` imported from `@vitest/browser-playwright` | Vitest 4.0 [CITED: Phase 1's own research, already applied in this repo's `vitest.config.ts`] | Already correctly applied in this repo; noted here only so Phase 4's new PERF-08 command follows the same current pattern, not a stale one found in older tutorials. |
| Newton's-method IRR solvers in most off-the-shelf financial JS libraries | Bounded bisection with explicit "undefined" result | N/A — this is a project-specific decision (D-08), not an industry-wide shift | Most `npm` XIRR packages (e.g., common finance libraries) use Newton's method with a fallback; this project deliberately avoids that pattern per PITFALLS D4's warning, so do not port logic from a typical `xirr`-style npm package without adapting it to D-08's bracket-and-undefined contract. |

**Deprecated/outdated:** none specific to this phase beyond the Vitest 4.0 provider-import
pattern already noted (and already correctly applied) in this repo.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | Vitest's custom-command `context` parameter's `.context` property is a real Playwright `BrowserContext` supporting `.newPage()`/`page.goto()` to an arbitrary URL, for the Playwright provider this project uses | Architecture Patterns, Pattern 6 | If the exposed object does not actually support `newPage()` (e.g., a restricted wrapper), the entire PERF-08 measurement architecture recommended here needs a different mechanism — the planner should verify this with a minimal spike (`console.log(typeof context.context.newPage)`) before committing a full harness design to it. |
| A2 | uPlot's `distr: 3` log-scale option correctly handles a series with widely varying magnitude (a 3x-90-year run) without needing manual pre-scaling | Architecture Patterns, Pattern 4; Code Examples | If uPlot's log-scale tick generation has edge cases at extreme magnitudes, the E6 pitfall (misleading linear axis) could resurface in a different form (mis-ticked log axis); low risk since this is a documented, demoed uPlot feature, but not independently verified against this project's actual value range this session. |
| A3 | `maximumFileSizeToCacheInBytes: 3_000_000` is a sufficient starting value for the compiled bundle's real production `dist/` output size (app JS + all assets combined) | Standard Stack, Installation; Code Examples | If the real production build (JS bundle + 1.66MB data + service worker overhead) exceeds 3MB, Workbox will warn or (per `vite-plugin-pwa` 0.20.2+) throw at build time — low-risk since it fails loudly at build, not silently at runtime, but the planner should verify against a real `npm run build` output before finalizing. |
| A4 | The uPlot theme-repaint mechanism (Pattern 4) — read CSS custom properties via `getComputedStyle`, then `chart.setSeries`/`chart.redraw()` — is sufficient without a full chart teardown/recreation | Architecture Patterns, Pattern 4 | If uPlot caches computed styles internally in a way that resists a partial update, theme toggling might require destroying and recreating the `uPlot` instance instead, which is more code but not a different architecture; this session could not retrieve uPlot's own GitHub issue #436 resolution content to confirm either way. |
| A5 | `history.replaceState` (not `pushState`) is the correct API for D-03's rAF-coalesced permalink updates | Architecture Patterns, Anti-Patterns | Low risk — this is standard, uncontroversial browser API usage, not a project-specific unknown; included here only because it directly follows from a locked decision (D-03) and is worth stating explicitly for the planner. |

## Open Questions

1. **Does the Playwright `BrowserContext` exposed via Vitest's custom-command `context` parameter
   actually support `newPage()` in this project's pinned `@vitest/browser-playwright@4.1.10` /
   `vitest@4.1.10` / `playwright@1.62.1` combination?**
   - What we know: Vitest's documentation describes the `context` property as "the unique
     BrowserContext," and Playwright's own `BrowserContext` API supports `newPage()`.
   - What's unclear: This session could not run a live spike against this project's actual
     installed versions to confirm the object passed through is a fully-functional, unrestricted
     `BrowserContext` (as opposed to a proxy with a reduced surface).
   - Recommendation: The planner should schedule a small Wave 0 spike task — a trivial new
     `commands` entry that calls `context.context.newPage()` and asserts it resolves — before
     committing PERF-08's full harness design. If it does not work as expected, the fallback is a
     separate Playwright script invoked as its own `npm run` step, at the cost of D-03's "one
     measurement pipeline" discipline from Phase 1.

2. **What confirms the compiled production bundle's actual on-disk size for
   `maximumFileSizeToCacheInBytes` and `DATA-BUNDLE-BYTES`'s already-locked 1,125,000-byte
   budget once the app JS is added on top of the existing 1.66MB data assets?**
   - What we know: `DATA-BUNDLE-BYTES` (verified, `perf-budgets.ts`) already budgets 1,125,000
     bytes for the *data* transfer specifically, separate from app JS.
   - What's unclear: Whether the app JS + Workbox precache manifest overhead pushes the *total*
     cold-load transfer meaningfully closer to PERF-08a/b's 1500ms/1000ms budgets once a real
     Solid+uPlot bundle exists.
   - Recommendation: Measure early (first working scaffold, before feature-completeness) rather
     than waiting until the full UI is built, so a budget-pressure signal surfaces while there is
     still room to address it architecturally.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | build tooling, `npm run` scripts | ✓ | 22 (per `.github/workflows/ci.yml`, `actions/setup-node@v4` with `node-version: 22`) | — |
| Playwright Chromium | Vitest browser-mode `bench` project (existing) and the new PERF-08 commands | ✓ (already installed and cached per CI workflow) | 1.62.1 | — |
| `vite preview` (bundled with `vite`) | PERF-08's production-build serving (Pattern 6) | ✓ once `vite` is installed this phase | 8.2.1 | none needed — `vite preview` ships with the `vite` package itself |
| Cloudflare `wrangler` CLI | Local Pages preview + deploy verification of `_headers` behavior (mentioned in `.claude/CLAUDE.md` Development Tools) | ✗ not installed in this research session's sandbox | — | Not required to *build* or *test* the app; only needed for a manual local-preview verification step before deploy. Document as a `checkpoint:human-verify` if the plan wants a pre-deploy `wrangler pages dev` check. |

**Missing dependencies with no fallback:** none — everything PERF-07/08 and the app scaffold need
is either already installed or installed as part of this phase's own `npm install`.

**Missing dependencies with fallback:** `wrangler` (manual verification step only, not required
for automated tests/build).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 [VERIFIED: `package.json`], three existing projects: `unit` (Node), `bench` (Playwright/Chromium browser mode), `bench-selftest` (Node) |
| Config file | `vitest.config.ts` (verified, existing) — Phase 4 adds new files under `tests/app/`, `tests/metrics/`, and a new `bench/cold-load.bench.test.ts` / `bench/interaction.bench.test.ts`, no new project needed |
| Quick run command | `npm test` (unit project only, Node, fast) |
| Full suite command | `npm run typecheck && npm test && npm run bench` (matches `.github/workflows/ci.yml`'s exact verified step order) |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|--------------------|-------------|
| APP-01 | Symbol select populates from bundled manifest | unit (jsdom-free, data-layer only) | `npx vitest run --project unit tests/data/kernel-inputs.test.ts` (extend existing) | ✅ (existing file, extend) |
| APP-03 | Static build produces deployable `dist/` with no runtime external calls | bench/build-check | `npm run build && node -e "assert dist/ has no fetch to non-relative URLs"` | ❌ Wave 0 — new `tests/app/static-build.test.ts` |
| APP-04 | Invalid combos explained, never coerced | unit | `npx vitest run --project unit tests/app/validation.test.ts` | ❌ Wave 0 |
| DATA-08 | Offline after first load | bench (browser, service-worker-aware) | `npx vitest run --project bench bench/offline.bench.test.ts` | ❌ Wave 0 |
| METR-01 | IRR headline, non-zero contributions | unit | `npx vitest run --project unit tests/metrics/irr.test.ts` | ❌ Wave 0 |
| METR-02 | CAGR suppressed/qualified | unit | `npx vitest run --project unit tests/metrics/cagr.test.ts` | ❌ Wave 0 |
| METR-03 | Max drawdown | unit (extends kernel tests) | `npx vitest run --project unit tests/kernel/drawdown.test.ts` | ❌ Wave 0 |
| METR-04 | Final value multiple | unit | already covered by `KernelResult.finalValue`/`totalContributed` — extend `tests/kernel/ruin.test.ts` | ✅ (existing file, extend) |
| METR-05 | Ruin flag categorical | unit | `tests/kernel/ruin.test.ts` (existing) | ✅ |
| VIZ-08 | Log scale toggle visible | UI-state (held-out visual check per UI-SPEC's 🧪 backstop rows) | manual/visual — not automatable at this budget | N/A, flagged in UI-SPEC |
| VIZ-11 | Legible light/dark | UI-state (held-out visual check) | manual/visual | N/A, flagged in UI-SPEC |
| SHARE-01 | Every param in URL | unit (fast-check property) | `npx vitest run --project unit tests/app/permalink.test.ts` | ❌ Wave 0 |
| SHARE-02 | Bundle version mismatch banner | unit | `tests/app/permalink.test.ts` (same file, mismatch case) | ❌ Wave 0 |
| SHARE-03 | Determinism test | unit (fast-check round-trip + golden fixtures, D-16) | `tests/app/permalink.test.ts` | ❌ Wave 0 |
| PERF-07 | No task > 50ms, 60fps drag | bench (new, Pattern 6-adjacent) | `npx vitest run --project bench bench/interaction.bench.test.ts` | ❌ Wave 0 — architecturally new, see Open Question 1 |
| PERF-08 | Cold/warm load timing | bench (new, Pattern 6) | `npx vitest run --project bench bench/cold-load.bench.test.ts` | ❌ Wave 0 — architecturally new, see Open Question 1 |

### Sampling Rate
- **Per task commit:** `npm test` (unit project — fast, Node-only, no Playwright startup cost).
- **Per wave merge:** `npm run typecheck && npm test && npm run bench` (matches CI exactly).
- **Phase gate:** Full suite green (`npm run bench` passing, including the new PERF-07/PERF-08
  rows transitioning from `unmeasured` to `pass`) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `vite.config.ts`, `index.html`, `tsconfig.json` JSX settings — no scaffold exists (F-03).
- [ ] `tests/app/` directory (`validation.test.ts`, `permalink.test.ts`, `static-build.test.ts`).
- [ ] `tests/metrics/` directory (`irr.test.ts`, `cagr.test.ts`).
- [ ] `tests/kernel/drawdown.test.ts` (extends the existing kernel test suite for F-01's
      resolution).
- [ ] `bench/cold-load.bench.test.ts`, `bench/interaction.bench.test.ts` — both blocked on Open
      Question 1's spike (whether the `commands` `context.context.newPage()` mechanism works as
      expected) before their real implementation can be written.
- [ ] `bench/offline.bench.test.ts` — needs a way to assert service-worker-served offline
      behavior inside Vitest browser mode; not yet designed this session, flag for planner.
- [ ] Framework install: none — Vitest/Playwright are already fully configured; only the app-side
      packages (`solid-js`, `vite-plugin-solid`, `uplot`, `vite-plugin-pwa`, `vite`) are new.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | No | No auth surface exists or is planned (Out of Scope: "User accounts, server-side persistence"). |
| V3 Session Management | No | No sessions; all state is client-side and URL-encoded. |
| V4 Access Control | No | No privileged operations; every user has identical capability. |
| V5 Input Validation | Yes | Every parameter — from both UI controls and a hand-edited/malicious permalink URL — must be validated before reaching `buildKernelInputs`. `buildKernelInputs`'s existing thrown errors (D-32, verified) are the validation source of truth; the permalink decoder must route any unparseable/out-of-range value through the same D-11/D-12 clear-and-explain path, never `eval`, never direct property assignment from `URLSearchParams` values into a type presumed safe. |
| V6 Cryptography | No | No secrets, no auth tokens, no encryption need anywhere in this phase's scope. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Reflected XSS via permalink query params rendered into the DOM (e.g., an entry date or symbol string echoed back into an error message) | Tampering / Information Disclosure | Solid's JSX text interpolation auto-escapes by default (no `innerHTML`/`dangerouslySetInnerHTML`-equivalent used anywhere in this phase's component inventory per UI-SPEC); never construct DOM strings via template-literal HTML concatenation for any value derived from `URLSearchParams`. |
| Malicious/malformed permalink causing a crash or an unhandled exception rather than a graceful "invalid" state | Denial of Service (client-side) | The permalink decoder must be a total function over arbitrary `URLSearchParams` input — every field parse wrapped so a failure produces a typed validation error routed to D-11/D-12's UI, never an uncaught throw that blanks the page. |
| Service worker precache poisoning via a compromised/MITM'd first load | Tampering | Out of this phase's control surface (Cloudflare Pages serves over HTTPS by default; no additional mitigation is specific to this app beyond standard HTTPS delivery, which Cloudflare Pages provides). Note only, no action needed. |
| Cache-Control misconfiguration serving a stale bundle after redeploy (DATA-09's own stated concern) | Tampering (data integrity) | Already mitigated by the existing content-hashed filenames + immutable caching (`public/_headers`, verified this session) plus `BundleVersionMismatchError`'s loud failure on any stale-asset mismatch (verified, `tools/bundle-compiler/src/binary-format.ts`). |

No new attack surface is introduced beyond client-side input validation of URL-derived state —
this phase adds no server, no auth, and no data write path, consistent with the project's
Out-of-Scope table ("Trading, brokerage integration, live prices... this is an analysis tool, not
something that touches money").

## Sources

### Primary (HIGH confidence)
- `src/kernel/backtest.types.ts`, `src/kernel/backtest.ts`, `src/data/kernel-inputs.ts`,
  `src/data/contribution-schedule.ts`, `src/data-bundle.generated.ts`,
  `tools/bundle-compiler/src/binary-format.ts`, `tools/bundle-compiler/src/manifest.ts`,
  `perf-budgets.ts`, `vitest.config.ts`, `bench/decode-time.bench.test.ts`,
  `bench/calibration.ts`, `bench/report.ts`, `bench/environment-block.ts`,
  `.github/workflows/ci.yml`, `tests/kernel/module-boundary.test.ts`, `package.json`,
  `tsconfig.json`, `public/_headers`, `public/data/manifest.f0a9dfbdfa.json` — all read directly
  this session.
- `npm view <pkg> version` for `vite`, `solid-js`, `vite-plugin-solid`, `uplot`,
  `vite-plugin-pwa`, `comlink` — run directly this session, 2026-08-19.
- `gsd_run query package-legitimacy check --ecosystem npm ...` — run directly this session,
  2026-08-19.
- `.planning/phases/04-first-defensible-backtest-in-the-browser/04-CONTEXT.md` and
  `04-UI-SPEC.md` — the phase's locked decisions and approved design contract, read this session.
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/config.json` — read this session.

### Secondary (MEDIUM confidence)
- `vitest.dev/guide/browser/context` and `vitest.dev/guide/browser/commands` — WebFetch summaries,
  2026-08-19, confirming the Playwright-provider `context` object's `.page`/`.frame`/`.iframe`/
  `.context` shape (Architecture Patterns Pattern 6, Assumption A1).
- `vitest-dev/vitest` GitHub issue #7875 — WebSearch summary, 2026-08-19, confirming Vitest
  browser-mode test code cannot itself call `page.goto()` to an arbitrary URL.
- `vite-pwa-org.netlify.app/guide/faq` — WebFetch summary, 2026-08-19, `maximumFileSizeToCacheInBytes`
  and `globPatterns` guidance.
- `chrisbremmer/playwright-performance` GitHub repo — WebFetch summary, 2026-08-19, Long Task
  `PerformanceObserver` example pattern (adapted to a max, not sum, per PERF-07a's actual wording).
- uPlot `distr: 3` log-scale confirmation — WebSearch summary corroborated across two independent
  sources (viser.studio type stubs, `leeoniya/uPlot` GitHub issue #29 and official demo page),
  2026-08-19.

### Tertiary (LOW confidence)
- uPlot GitHub issue #436 (dark/light theme support) — fetch attempted this session but returned
  only the issue's opening post, not maintainer responses; the theming mechanism in Pattern 4 is
  this research's own synthesis from general canvas-theming practice, not a verified uPlot-specific
  answer. Flagged as Assumption A4.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version verified against the live npm registry this session, and
  the choice itself was already locked by prior CONTEXT.md decisions and `.claude/CLAUDE.md`.
- Architecture (data/kernel wiring): HIGH — read directly from committed, tested source this
  session; nothing here is inferred.
- Architecture (PERF-07/08 measurement harness): MEDIUM — no prior implementation exists in this
  repo or its research history; the recommended mechanism is synthesized from Vitest/Playwright
  documentation and flagged with an explicit Wave 0 spike recommendation (Open Question 1).
- Pitfalls: HIGH for the kernel-boundary and tsconfig pitfalls (directly observed this session);
  MEDIUM for the log-scale-and-ruin pitfall (reasoned from verified kernel behavior + uPlot's
  documented log-scale limitation, not independently reproduced against a real chart this
  session).

**Research date:** 2026-08-19
**Valid until:** 30 days (stable stack, no fast-moving dependencies in this phase's scope beyond
the already-noted Vitest/Playwright browser-mode surface, which the project's own Phase 1
research already flagged as worth re-checking periodically).
