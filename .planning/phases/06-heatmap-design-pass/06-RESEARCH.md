# Phase 6: Heatmap Design Pass - Research

**Researched:** 2026-08-21
**Domain:** Canvas 2D data visualization design (color scales, categorical overlays, colorblind
simulation), applied to a throwaway four-way design comparison, not production implementation
**Confidence:** MEDIUM-HIGH — the rendering and measurement patterns are HIGH confidence (they
extend code already proven in this repo); the exact CVD-simulation matrix coefficients and one
locked-document dependency question are flagged LOW/open, deliberately, rather than guessed.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

D-01 through D-29, verbatim from `06-CONTEXT.md`'s `<decisions>` section, govern this phase.
Full text is reproduced there; the load-bearing ones this research report leans on most:

- **D-01/D-02:** Four forms compete on plot *form*, not palette: (1) dense cell grid, (2) filled
  iso-contour bands (the "pork chop plot"), (3) small multiples, (4) grid with contour overlay.
- **D-03:** All four render from one real precomputed sweep (SPX total-return, offline, committed
  as a binary fixture), never synthetic values.
- **D-08/D-09:** Leverage 1x-5x over 50 rows; entry axis spans the **full strict-tier range for
  SPX/total-return** over 200 columns.
- **D-10/D-11:** Fixed 20-year holding period (not hold-to-today); S&P 500 total return is the
  fixture symbol.
- **D-12:** Each form picks its own display geometry; criterion 4's repaint figure is measured
  per form at that form's own geometry, each still a real 10,000-cell field.
- **D-13/D-14/D-15/D-16:** Diverging colour scale centred exactly at 1.0x, blue-orange or
  purple-green family (never red-green), symmetric log (`log10(multiple)`) about 1.0x, one
  background-neutral palette shared by both themes, fixed colour domain stated on the legend.
- **D-17:** The colourblind check is an automated test, no committed images, ~50 lines, no
  dependency.
- **D-18/D-20:** Ruin renders as a hatched fill in the existing destructive colour with its own
  legend entry; incomplete-hold renders as flat muted grey carrying no value, also its own legend
  entry. Never flat black, never a faded real colour.
- **D-21/D-22/D-23:** A permanent line of body-size copy directly under the grid, above the
  legend, reframe-then-mechanism structure, rendered at real width in all four mockups.
- **D-24/D-25:** Continuous ramp, non-uniform tick spacing at true symlog positions; the two
  categorical entries are detached swatches, visually off the ramp.
- **D-26/D-27/D-28/D-29:** Two artifacts bind Phase 7 (`06-HEATMAP-SPEC.md` + a PROJECT.md Key
  Decision); two modules graduate to `src/` (the colour function, the sweep fixture); all four
  mockup HTML files are kept, committed, under
  `.planning/phases/06-heatmap-design-pass/mockups/`; the fixture is committed as binary
  (~90KB, Float32 plus flag bytes).

### Claude's Discretion

Verbatim from `06-CONTEXT.md`:

- The exact diverging palette family and its stops, subject to D-13/D-15/D-17.
- The exact fixed colour domain endpoints for D-16, and the clipping treatment beyond them.
- The exact wording of D-22's two sentences, within the reframe-then-mechanism structure.
- The hatch geometry for D-18 (angle, spacing, stroke width) at each form's chosen cell size, and
  whether it is drawn per-cell or as a clipped full-region pattern.
- The perceptual-distance metric and threshold D-17's assertion uses.
- Which of the two Phase 1 canvas paths (`putImageData` versus `fillRect`) each form uses, and how
  criterion 4's per-form measurement is wired.
- File layout inside `.planning/phases/06-heatmap-design-pass/mockups/`, and how the four forms
  and the D-05 comparison page share the fixture loader and the theme switch.
- Whether the offline sweep script that produces the D-29 fixture lives in `tools/` or `scripts/`.

### Deferred Ideas (OUT OF SCOPE)

Verbatim from `06-CONTEXT.md`: a written per-criterion scorecard; judging mockups as cropped PNGs
at forum width (Phase 8's SHARE-04 territory); a cell hover readout in the shipped heatmap
(explicitly still open for Phase 7, not declined); scale type following the metric; a fit-to-data
colour domain control; the full 1x-20x leverage range and the extended-tier 1929 entry span; both
sweep modes rendered side by side.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VIZ-05 | The heatmap design is validated against throwaway mockups before implementation, since no existing tool pairs these axes | "Architecture Patterns" (four-form comparison-page pattern), "Runtime State Inventory"-adjacent "The fixture's inputs" findings below give the offline sweep script a concrete, reusable pipeline so all four mockups render real data, not placeholders |
| VIZ-07 | Colour scales are perceptually uniform and colorblind-safe; orders-of-magnitude outcomes map through log/non-linear colour | "Standard Stack" (symlog transform, CVD simulation method), "Common Pitfalls" (E1-E4), "Code Examples" (colour-function skeleton, CVD matrix sourcing) |
| VIZ-10 | The heatmap carries visible copy stating entry windows overlap and the grid is a sensitivity analysis over one shared history | "Common Pitfalls" (PITFALLS D5, quoted in full), "Architecture Patterns" (caveat placement precedent from Phase 4/5) |
</phase_requirements>

## Summary

This phase builds no shipped feature; it builds four competing throwaway renderings of the same
10,000-cell field and a written argument for which one wins. The two things that make that
argument defensible are already fully specified by `06-CONTEXT.md` and `06-UI-SPEC.md` — this
report's job is to ground the *implementation* details those documents leave open: the exact
entry-date domain the D-29 fixture must sweep (verified against the compiled manifest, not
assumed), the exact pipeline that produces a backtest per cell (an existing script,
`scripts/run-backtest.ts`, is the direct precursor and should be read before writing the sweep
script), the exact repaint-measurement pattern criterion 4 must extend
(`bench/canvas-repaint.bench.test.ts`, already proven and already measuring 0.37ms of PERF-05's
16ms budget on the CI baseline for a comparable single-arm paint), and the exact CVD-simulation
method that can be hand-rolled correctly in the ~50 lines D-17 budgets, sourced from a paper and a
public-domain reference implementation rather than from memory or from the widely-circulated but
self-admittedly inaccurate "Coblis" matrices.

Two real tensions surfaced during this research that the planner must resolve, not this report:
(1) `06-UI-SPEC.md`'s Registry Safety section states the mockups introduce **no new dependency**
at all, which is in tension with `d3-contour` being the standard, well-vetted way to generate the
iso-contour bands forms 2 and 4 need (hand-rolled marching squares with band-fill is real,
error-prone geometry code); (2) D-28's "no build step" mockups still need to import D-27's colour
function from `src/`, and browsers block cross-file ES-module imports over a bare `file://` origin,
so "no build step" almost certainly means "not part of `vite build`'s output," not "opened by
double-clicking the file" — the mockups need *some* static file server (`vite dev` is already in
the toolchain and is the cheapest option). Both are flagged in Open Questions below with a
recommended default, not silently resolved.

**Primary recommendation:** Reuse `scripts/run-backtest.ts` + `buildKernelInputs` +
`loadBundleFromDisk` unchanged as the offline sweep script's per-cell engine (only the
outer entry-date × leverage loop and binary serialization are new code); hand-roll D-27's colour
function with no dependency (symlog + two-stop diverging lerp is genuinely simple; d3-scale would
also work but conflicts with the locked "no new dependency" line); hand-roll the CVD simulation
using the Viénot/Brettel/Mollon 1999 method (the simplest of the three legitimate published
methods to implement as a fixed 3×3-matrix multiplication), sourcing exact coefficients from
`github.com/DaltonLens/libDaltonLens` (public-domain, unit-tested) rather than transcribing from
memory or from an unverified gist; and extend `bench/canvas-repaint.bench.test.ts`'s
paint-equivalence-then-measure pattern per form for criterion 4.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Offline sweep computation (D-03/D-29) | Build-time script (Node) | — | Runs once, offline, outside the browser entirely; reuses the kernel through the same data-layer seam `scripts/run-backtest.ts` already proves out. Never ships to the browser. |
| Sweep fixture storage (D-29) | Static binary asset | — | Committed file, read directly by both the offline script (write) and every mockup (read via `fetch`/`XMLHttpRequest` over a local static server). No server-side component exists or is needed. |
| Value-to-colour mapping (D-27) | Browser / Client (pure function, framework-free) | — | Must be importable by both plain-HTML mockups (D-28, no framework) and, later, Solid app code (Phase 7) — sits in neither the kernel nor the data layer, and must not import Solid. |
| Four mockup renderers (D-02) | Browser / Client (Canvas 2D) | — | Each is a standalone rendering surface reading the shared fixture and colour function; no server round-trip, no persistence. |
| D-05 comparison-page shell | Browser / Client (Solid.js) | — | The only place Solid is used this phase; hosts the four mockups side by side, theme toggle, no other logic. |
| CVD legibility check (D-17) | Automated test (Node, `unit` Vitest project) | — | Pure colour-space math over the colour function's own output; needs no DOM, no canvas, no browser — belongs in the fast Node project alongside `tests/canvas-grid.test.ts`'s existing pure-function tests. |
| Repaint measurement (criterion 4) | Automated test (Playwright-backed, `bench` Vitest project) | — | Real paint cost requires a real `CanvasRenderingContext2D`; this project already exists and is calibration-normalized against the same PERF-05 budget row. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript (project's existing Vite/Node 22 toolchain) | 5.9.3 [VERIFIED: package.json] | Language for the colour function, the offline sweep script, and the comparison-page shell | Already the project's only language; no reason to introduce a second one for a design pass |
| Solid.js | 1.9.15 [VERIFIED: package.json] | The D-05 comparison-page shell only | Already installed and the project's locked UI framework (`06-UI-SPEC.md` "Design System"); the four mockups themselves stay framework-free per D-28 |
| Hand-rolled Canvas 2D (`putImageData`, per Phase 1's D-15 measurement) | native browser API | Dense-grid base layer (forms 1, 4) | `bench/canvas-grid.ts`'s `paintPutImageData` is the direct precursor: on the D-17 CI baseline, PERF-05 measured 0.37ms of its 16ms budget (2.3%) [VERIFIED: PROJECT.md Key Decisions row, quoted below] — comfortable headroom before any per-form overhead (hatch pattern, contour overlay) is added |
| Hand-rolled symlog + diverging colour interpolation (no library) | — | D-27's colour function | See "Dependency tension" in Open Questions: `06-UI-SPEC.md`'s Registry Safety section states the mockups introduce no new dependency; the symlog transform (`Math.log10`) plus a two-stop linear lerp between Lab or sRGB colour stops is well within D-17's own "~50 lines, no dependency" precedent for the CVD check |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `d3-contour` | 4.0.2 [VERIFIED: npm registry, package-legitimacy OK, 15.6M weekly downloads] | Marching-squares iso-band/iso-contour generation over the 200×50 grid, for forms 2 and 4 | **Only if the planner decides to relax the "no new dependency" line** (see Open Questions). Hand-rolling iso-band fill (not just iso-line) with correct polygon merging is real, error-prone geometry code — exactly what the project's own Don't Hand-Roll posture (`.claude/CLAUDE.md` Q2) argues against reimplementing |
| `marchingsquares` (RaumZeit/MarchingSquares.js) | 1.3.3 [VERIFIED: npm registry, package-legitimacy OK, 197K weekly downloads] | Same purpose as `d3-contour`, without pulling in any other `d3-*` package | Alternative if the planner wants contour generation without touching the `d3-contour` API surface; both are equally legitimate, `d3-contour` is more widely used |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled symlog + diverging lerp | `d3-scale` (`scaleSymlog`) + `d3-interpolate` | `d3-scale` 4.0.2 and `d3-interpolate` 3.0.1 are both [VERIFIED: npm registry, package-legitimacy OK, 60M+/68M+ weekly downloads] and already recommended by the project's own `.claude/CLAUDE.md` stack doc — but neither is installed yet (`package.json` has zero `d3-*` packages), and `06-UI-SPEC.md`'s locked text says the mockups introduce no new dependency. Hand-rolling avoids the conflict entirely for a transform this simple |
| Hand-rolled CIE76/CIEDE2000 ΔE | `d3-color-difference` | [SUS: npm registry, package-legitimacy check flagged `low-downloads`, 118 weekly downloads]. `[WARNING: flagged as suspicious — verify before using.]` D-17 explicitly wants "no dependency" for this ~50-line check anyway, so this alternative is rejected on both grounds |
| Hand-rolled Viénot 1999 CVD matrices | `colour-science` (Python) or `libDaltonLens` (C) as a runtime dependency | Neither has a maintained npm package; porting the *coefficients* from `libDaltonLens` (public domain, unit-tested) into a small hand-rolled TypeScript function is the recommended path, not adding a runtime dependency in either language |

**Installation:**

No new runtime dependency is recommended by default (see "Dependency tension" in Open
Questions). If the planner elects to relax the constraint for contour generation only:

```bash
npm install d3-contour
```

**Version verification:** confirmed live against the npm registry this session (`npm view
<package> version`), not from training data — see the VERIFIED tags above.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| d3-scale | npm | published 2021-09-24 | 63.9M/wk | github.com/d3/d3-scale | OK | Not recommended by default (dependency tension); approved if planner adds it |
| d3-interpolate | npm | published 2021-06-05 | 68.4M/wk | github.com/d3/d3-interpolate | OK | Same as above |
| d3-array | npm | published 2023-05-30 | 85.0M/wk | github.com/d3/d3-array | OK | Same as above (only needed if `d3-scale`/`d3-contour` pull it in transitively) |
| d3-contour | npm | published 2023-01-11 | 15.6M/wk | github.com/d3/d3-contour | OK | Conditional — see Open Questions; use only if forms 2/4 need iso-bands and hand-rolling is descoped |
| marchingsquares | npm | published 2019-04-28 | 197K/wk | github.com/RaumZeit/MarchingSquares.js | OK | Alternative to `d3-contour`, same conditional status |
| d3-color-difference | npm | published 2018-04-20 | 118/wk | github.com/danburzo/d3-color-difference | SUS (low-downloads) | REMOVED — hand-roll CIE76/CIEDE2000 instead, consistent with D-17 |

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** `d3-color-difference` — not recommended; if a future
planner reconsiders it, gate the install behind a `checkpoint:human-verify` task.

## Architecture Patterns

### System Architecture Diagram

```
                    OFFLINE (build-time, Node, runs once)
  ┌──────────────────────────────────────────────────────────────────────┐
  │  offline sweep script (tools/ or scripts/, D-29)                     │
  │                                                                       │
  │  loadBundleFromDisk() ──► buildKernelInputs() ──► runBacktest()      │
  │       (existing)              (existing)             (existing)      │
  │                                                            │          │
  │  for each of 200 entry dates × 50 leverage levels:        │          │
  │    - resolve entryDate, holdingPeriodBars=20yr worth       │          │
  │    - compute multiple-of-contributed = finalValue/totalContributed   │
  │    - compute maxDrawdown (D-04 stress case)                          │
  │    - flag ruined, flag incomplete-hold (D-19/D-20)                   │
  │                                                            ▼          │
  │  serialize 10,000 cells ──► sweep-fixture.bin (Float32 + flag bytes) │
  └──────────────────────────────────────────────────────────────────────┘
                                     │  committed to git (D-29)
                                     ▼
                    BROWSER (D-05 comparison page, dev-server-served)
  ┌──────────────────────────────────────────────────────────────────────┐
  │  fetch(sweep-fixture.bin) ──► decode to typed arrays (once, shared)  │
  │                                     │                                 │
  │            ┌────────────────────────┼────────────────────────┐       │
  │            ▼                        ▼                        ▼       │
  │      Form 1: dense grid      Form 2: filled contour   Form 3: small  │
  │      (Canvas putImageData)   (marching squares / d3)  multiples      │
  │            │                        │                        │       │
  │            └──────────┬─────────────┴────────────┬───────────┘       │
  │                       ▼                            ▼                 │
  │            Form 4: grid + contour overlay    each form reads the     │
  │            (base layer 1 + line layer 2)     SAME colour function    │
  │                       │                       (D-27, shared)         │
  │                       ▼                                              │
  │       every form: legend (D-24/D-25) + VIZ-10 caveat (D-21/D-22)     │
  │                       │                                              │
  │                       ▼                                              │
  │       criterion 4: repaint measured per form on a metric-value       │
  │       change (bench project, calibration-normalized against          │
  │       PERF-05's locked 16ms budget)                                  │
  └──────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
.planning/phases/06-heatmap-design-pass/
├── mockups/
│   ├── form-1-dense-grid.html
│   ├── form-2-filled-contour.html
│   ├── form-3-small-multiples.html
│   ├── form-4-grid-with-contour.html
│   ├── comparison.html            # or a Solid entry the dev server serves (D-05)
│   ├── sweep-fixture.bin          # D-29, committed binary
│   └── shared/                    # fixture loader, theme-switch wiring shared across mockups
│       └── fixture-loader.ts
src/
├── colorscale/                    # or a sibling name, see F-05 below — D-27's graduated function
│   └── value-to-color.ts          # symlog transform, diverging stops, ruin/incomplete branches
tools/ (or scripts/, Claude's Discretion)
└── sweep-fixture/
    └── build-sweep-fixture.ts     # the D-29 offline sweep script
tests/
├── color-scale-cvd.test.ts        # D-17's automated CVD assertion (unit project)
└── value-to-color.test.ts         # D-27's colour function unit tests (unit project)
bench/
└── heatmap-repaint.bench.test.ts  # criterion 4, per-form, extends canvas-repaint.bench.test.ts's pattern
```

### Pattern 1: Offline sweep reuses the existing single-run pipeline unchanged

**What:** `scripts/run-backtest.ts` already does exactly one cell of what D-29's sweep script must
do 10,000 times: load the bundle from disk, resolve a `BacktestRequest` through
`buildKernelInputs`, run `runBacktest`, read `result.finalValue` / `result.totalContributed` /
`result.maxDrawdown` / `result.ruined`.

**When to use:** For every one of the 10,000 (entry-date, leverage) cells in the D-29 fixture.

**Example (the reusable core, adapted from the actual script this session read in full):**
```typescript
// Source: scripts/run-backtest.ts (existing, read this session — do not reimplement)
import { runBacktest } from '../src/kernel/backtest.ts'
import { buildKernelInputs, type BacktestRequest } from '../src/data/kernel-inputs.ts'
import { loadBundleFromDisk } from '../src/data/load-bundle-node.ts'
import {
  FINANCING_SPREAD_DEFAULT,
  GENERIC_3X_EXPENSE_RATIO,
} from '../src/validation/cost-parameters.ts'

const bundle = await loadBundleFromDisk()

// One cell. The sweep script's outer loop iterates entryDate x leverage over this shape,
// preallocating output typed arrays once (SIM-11 discipline) rather than per cell.
const request: BacktestRequest = {
  symbol: 'SPX',
  dividendReinvest: true, // total-return, per D-11
  leverage: 1.0, // sweep row, 1x..5x over 50 rows (D-08)
  entryDate: '1988-01-05', // sweep column, over the strict-tier range (D-09) -- see below
  holdingPeriodBars: null, // resolve to a 20-calendar-year bar count per entry date, or pass
                            // the actual bar-count for a fixed 20-year window (D-10/D-11)
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

**Reversibility of the entry-date domain choice:** the exact 200 column dates depend on the
*compiled bundle's own manifest*, not a hand-picked range — see "The fixture's inputs" below.

### Pattern 2: The colour function as a pure, dependency-free, dual-context-importable module

**What:** D-27's graduated colour function must be callable from both a plain-HTML mockup (no
bundler resolving bare npm specifiers, per D-28) and, later, Solid app code (Phase 7) — so it
should have zero imports of its own.

**Skeleton (values NOT verified — placeholders only, see Open Questions for exact stops):**
```typescript
// New file, e.g. src/colorscale/value-to-color.ts (site TBD, see F-05 finding below)
export interface ColorScaleInput {
  value: number      // the metric value, e.g. multiple-of-contributed
  ruined: boolean    // D-18
  incomplete: boolean // D-20 (holding period truncated by D-19's right-edge)
}

const DOMAIN_LOG_MIN = /* Claude's Discretion, D-16 */ -1  // e.g. 0.1x
const DOMAIN_LOG_MAX = /* Claude's Discretion, D-16 */ 1   // e.g. 10x

export function valueToColor(input: ColorScaleInput): [r: number, g: number, b: number, a: number] {
  if (input.ruined) return RUIN_HATCH_BASE_RGBA   // D-18: rendered as a hatch by the caller, not
                                                   // interpolated into the continuous domain at all
  if (input.incomplete) return INCOMPLETE_GREY_RGBA // D-20: flat, no value encoded
  const logValue = Math.log10(Math.max(input.value, Number.MIN_VALUE)) // D-14: symlog about 1.0x
  const clamped = Math.min(DOMAIN_LOG_MAX, Math.max(DOMAIN_LOG_MIN, logValue))
  const t = (clamped - DOMAIN_LOG_MIN) / (DOMAIN_LOG_MAX - DOMAIN_LOG_MIN) // [0,1], D-16 fixed domain
  return interpolateDivergingStops(t) // D-13/D-15: exact stops are Claude's Discretion
}
```

**Precedent this deliberately does NOT reuse in place:** `bench/canvas-grid.ts`'s
`mapValueToRgba` is the Phase 1 precursor (log10-normalize + two-hue linear lerp with green fixed
at 64 as a test-only equivalence-proof artifact) — D-27's own text says to read it, not extend it
in place. The green-channel-fixed-at-64 trick is specific to that file's paint-equivalence test
and must not carry into the real colour function.

### Pattern 3: Theme-aware canvas repaint

**What:** Canvas gets no free `prefers-color-scheme` styling; every mockup must explicitly
subscribe to theme changes and repaint.

**Example:**
```typescript
// Source: src/app/components/ResultColumn/EquityCurveChart.tsx (existing, read this session)
function readCssColor(customProperty: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(customProperty).trim()
}
// ...
import { onThemeChange } from '../../theme.ts' // reused verbatim per 06-UI-SPEC's Design System
const unsubscribe = onThemeChange(() => repaintCanvas())
```

### Pattern 4: Paint-equivalence before trusting a timing figure

**What:** `bench/canvas-repaint.bench.test.ts` proves both canvas arms painted the expected pixel
colours *before* either arm's timing is trusted (sampling the first and last cell against
`mapValueToRgba`'s own output). Per finding F-02 below, this same proof pattern must run per
mockup form before criterion 4's four repaint figures are treated as comparable to each other
(they are not directly comparable across forms per se — each only needs to individually clear
16ms — but each form's *own* proof that it painted the real field, not a placeholder, is what
makes its own figure trustworthy).

### Anti-Patterns to Avoid

- **Reintroducing image artifacts to satisfy criterion 2:** D-17 explicitly rejects committing CVD
  simulation PNGs or mockup renders. The criterion is met by a live, CI-running assertion plus a
  written finding, never a binary screenshot.
- **A second colour-mapping implementation for the app to re-derive later:** D-27's whole point is
  that Phase 7 imports the graduated function rather than re-deriving the palette from prose in
  `06-HEATMAP-SPEC.md`. Do not let any mockup inline its own copy of the mapping.
- **Treating `formatMultiple`'s two-decimal-always output as literally what D-24's legend ticks
  render.** See the Pitfall below — this is a real, verified discrepancy.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Iso-band/iso-contour generation over a 200×50 grid (forms 2, 4) | A hand-rolled marching-squares implementation with polygon merging and multi-level band fill | `d3-contour` or `marchingsquares` (see Open Questions for the dependency-tension caveat) | Correct iso-band fill (not just single-threshold isolines) requires cell-boundary interpolation, polygon stitching across cell edges, and level-set management — genuinely complex geometry code with easy off-by-one and self-intersection bugs, exactly the kind of "don't hand-roll" case this project's own `.claude/CLAUDE.md` Q2 argues against for charting generally |
| CVD-accurate colour transforms | A hand-derived or memory-transcribed protanopia/deuteranopia/tritanopia matrix | Coefficients ported from `github.com/DaltonLens/libDaltonLens` (public domain, unit-tested reference implementation of the Viénot/Brettel/Mollon and Machado methods) | The most widely-circulated "quick" CVD matrices (the "Coblis"/colorjack.com set) are, by their own original author's admission, "a very inaccurate one-night hack" [CITED: gist.github.com/Lokno/df7c3bfdc9ad32558bb7, WebFetch this session] — a plausible-looking wrong matrix passes code review and silently fails the exact thing D-17 exists to catch |

**Key insight:** this phase's two hardest technical sub-problems (contour generation, CVD
simulation) are both "looks easy, is actually a published-research problem with known-wrong
shortcuts already in wide circulation" — the research effort here is spent finding the
*legitimate* source, not avoiding a dependency reflexively.

## The Fixture's Inputs (verified against the compiled bundle, not assumed)

- **SPX/total-return strict tier:** `firstDate: "1988-01-05"`, `lastDate: "2026-08-14"`
  [VERIFIED: `public/data/manifest.f0a9dfbdfa.json`, `SPX/total-return` series entry, read this
  session — `"tiers": {"strict": {"firstDate": "1988-01-05", "lastDate": "2026-08-14"}}`]. This is
  the range D-09's "full strict-tier range for the fixture symbol" resolves to — narrower than
  `SPX/price-return`'s own strict tier (1954-01-04) because the total-return series' pre-1988
  seams are interpolation-derived (`degradesToNonDaily: true`), so the strict tier for the
  dividend-reinvested series specifically starts in 1988.
- **`@rate/rate` strict tier:** `firstDate: "1954-01-04"`, `lastDate: "2026-08-14"` [VERIFIED: same
  manifest file, `@rate/rate` series entry] — not the binding constraint since SPX/total-return's
  own tier is narrower.
- **Consequence for D-19's incomplete-hold columns:** a fixed 20-year hold means the last entry
  date with a *complete* window is roughly `2026-08-14` minus 20 years ≈ **2006-08-14**. Entry
  dates in the `2006-08-14..2026-08-14` tail of the 200-column axis (per D-09, spanning the full
  strict tier, not stopping at the complete-hold boundary) are exactly D-19/D-20's incomplete-hold
  state — this is not an edge case to special-case for, it is roughly the final 20% of the columns,
  by construction of the chosen ranges.
- **Cost defaults:** `GENERIC_3X_EXPENSE_RATIO = 0.009` (0.9%) and `FINANCING_SPREAD_DEFAULT =
  0.005` (midpoint of the 0.2%-0.8% range) [VERIFIED: `src/validation/cost-parameters.ts`, read
  this session] — the same defaults `scripts/run-backtest.ts` falls back to when no CLI override is
  given; the offline sweep script should use these unless CONTEXT.md's Claude's Discretion is
  exercised otherwise.
- **`KernelResult` fields available per cell** [VERIFIED: `src/kernel/backtest.types.ts:60-82`,
  read this session]: `finalValue`, `ruined` (boolean), `ruinBarIndex`, `droppedContributionsTotal`,
  `totalContributed`, `longGapBarCount`, `barCount`, `maxDrawdown` (float64, 0 for never-drawdown,
  1 for a ruined run, strictly between otherwise). `multiple-of-contributed` is computed by the
  caller as `finalValue / totalContributed` [VERIFIED: `src/app/state.ts:189`, quoted verbatim:
  `const finalValueMultiple = result.totalContributed > 0 ? result.finalValue / result.totalContributed : 0`],
  not returned by the kernel directly.
- **The binary asset header precedent:** `tools/bundle-compiler/src/binary-format.ts` already
  defines `MAGIC = 0x4c56_4744`, `FORMAT_VERSION = 1`, and `encodeHeader`/`decodeHeader` functions
  that raise a version-mismatch error rather than silently misreading a stale asset [VERIFIED:
  `tools/bundle-compiler/src/binary-format.ts:37-38, 104, 176`, read this session]. D-29's fixture
  format is a new, separate binary layout (sweep cells, not a price series), but should follow the
  same "magic + version header, fail loud on mismatch" shape rather than inventing an unversioned
  format.

## Common Pitfalls

### Pitfall E1: Sequential scale on a threshold metric (already resolved by D-13, verify it stays resolved)

**What goes wrong:** "Using a sequential color scale (single hue, light-to-dark) for a metric that
has a meaningful zero/breakeven point... hides where the breakeven boundary actually is."
[CITED: `.planning/research/PITFALLS.md` §E1, read this session]

**Why it happens:** Sequential scales are the more common default in most charting libraries.

**How to avoid:** D-13 already locks a diverging scale centred exactly at 1.0x. The pitfall risk
in *this* phase is a plan that treats "diverging" as satisfied by any two-hue gradient without
actually locating the true midpoint at `log10(1.0) = 0` — verify the colour function's `t=0.5`
input maps to the neutral stop, not an approximation.

**Warning signs:** "A diverging red-to-blue scale where the visual midpoint... does not align with
the number the tool itself defines as breakeven." [CITED: PITFALLS §E1]

### Pitfall E4: Ruin hidden inside the continuous scale (resolved by D-18, watch the hatch geometry)

**What goes wrong:** Colouring ruin as "simply the darkest/most-extreme point on a continuous
scale... visually implies it's just a more-extreme version of a bad-but-alive outcome... a
log-scale color mapping literally cannot represent zero at all." [CITED: PITFALLS §E4]

**How to avoid:** D-18 already resolves this with a hatch. The residual risk this research
surfaces (finding F-03 below) is that the hatch becomes illegible at a small cell size and a form
that cannot show it clearly has failed E4's actual concern even though the *code* technically
special-cases ruin.

**Phase:** This phase — "directly follows from A7's kernel-level ruin flag." [CITED: PITFALLS §E4]

### Pitfall D5: Overlapping windows read as independent trials (VIZ-10, quoted in full)

**What goes wrong:** "Adjacent entry dates one trading day apart share nearly all of their
underlying daily-return data... Presented as 10,000 independent backtests in a heatmap, this
creates a strong visual impression of a large, robust sample of 'evidence'... a technically
sophisticated hostile reader can dismiss the entire tool on this single, valid statistical
objection." [CITED: PITFALLS §D5]

**How to avoid, concretely:** "Do not describe or imply '10,000 independent backtests' anywhere in
copy; describe it accurately as 'the same market history viewed from every possible starting
point.'" [CITED: PITFALLS §D5] — this is the exact framing D-22's suggested copy already uses.

**Phase:** "Visualization (heatmap/sweep) — this needs to be in the UI-spec, not left to be
noticed during a later credibility review." [CITED: PITFALLS §D5] It is: this phase's D-21/D-22/D-23.

### Pitfall F5: 10,000 SVG/DOM nodes (already resolved, constrains every form's implementation)

**What goes wrong:** "SVG has significant per-node overhead in the DOM... rendering one `<rect>`
per heatmap cell at the stated sweep scale... can cause severe interaction jank." [CITED:
PITFALLS §F5]

**How to avoid:** "Render the heatmap as a single `<canvas>` bitmap... rather than one DOM node per
cell." [CITED: PITFALLS §F5] Already the project's locked Phase 1 architecture decision. The
residual risk this phase must not reintroduce: form 3 (small multiples) and form 2/4 (contour
paths) must still render via canvas, not per-cell/per-segment SVG or DOM nodes, even though their
*visual* shape is less grid-like than form 1.

### Pitfall (new, this session): the legend tick copy in `06-UI-SPEC.md` does not literally match `formatMultiple`'s output

**What goes wrong:** `06-UI-SPEC.md`'s Copywriting Contract shows D-24's ramp ticks as `0.1x`,
`0.5x`, `1x` (emphasised), `2x`, `10x` — but `src/metrics/format.ts`'s `formatMultiple` [VERIFIED:
`src/metrics/format.ts:31-37`, quoted verbatim: `return \`${ratio.toFixed(2)}x\`` unless the
magnitude exceeds `1e6`, in which case it switches to `toExponential(1)`] always renders exactly
two decimal places for any in-range value — `1` becomes `"1.00x"`, `0.1` becomes `"0.10x"`, never
the bare `"1x"`/`"0.1x"` the UI-SPEC's copy table shows.

**Why it happens:** The UI-SPEC's copywriting examples are illustrative of *which values* get
ticks, not necessarily literal transcriptions of `formatMultiple`'s exact string output; the
06-UI-SPEC.md text itself says legend ticks "reuse `src/metrics/format.ts`'s existing formatting
contract... rather than a second formatter," which is a real instruction to call `formatMultiple`,
not to hand-format bare integers.

**How to avoid:** The planner must pick one explicitly rather than let it be discovered at
verify time: (a) call `formatMultiple` as instructed and accept `"1.00x"`/`"0.10x"` tick labels
(honors the "no second formatter" instruction literally), or (b) treat the UI-SPEC's bare-integer
examples as authoritative and add a trimming step on top of `formatMultiple`'s output (which is,
by the UI-SPEC's own words, "a second formatter"). This is a genuine tension between two clauses
of an already-approved document, not a new decision to make from scratch.

**Warning signs:** A mockup whose legend literally reads "1.00x" when the design contract's own
copy table was read as showing "1x."

## Code Examples

### CVD simulation method selection (Viénot 1999, recommended over Brettel 1997 or Machado 2009 for a ~50-line hand-rolled check)

Per this session's research [CITED: daltonlens.org/understanding-cvd-simulation/,
WebFetch this session]: "Viénot 1999 is easiest for ~50-line hardcoded implementation: it reduces
to sRGB decoding, one or two 3×3 matrix multiplications, and sRGB encoding — no geometric plane
calculations required," versus Brettel 1997's per-pixel half-plane projection (needed for
tritanopia's fuller accuracy) or Machado 2009's added opponent-colour-theory stage (needed for
anomalous trichromacy severity gradients, not needed here since D-17 only requires the three full
dichromacy simulations).

**Pipeline (coefficients NOT included here — see Don't Hand-Roll above for sourcing):**
```
sRGB (0-255) → linearRGB (inverse gamma ~2.4) → LMS (Hunt-Pointer-Estevez matrix)
  → apply dichromacy projection matrix (protanopia | deuteranopia; Brettel's geometry for tritanopia)
  → LMS → linearRGB → sRGB
```

**Exact matrix coefficients:** not verified this session and deliberately not transcribed from the
low-confidence gist found during research (self-described as "a very inaccurate one-night hack").
Source them from `github.com/DaltonLens/libDaltonLens` (public domain, MIT-equivalent, unit-tested)
or `github.com/joergdietrich/daltonize` (Viénot 1999, already sRGB-adapted) at implementation time.

### CIE76 ΔE (recommended default for D-17's perceptual-distance metric, given the ~50-line budget)

**JND threshold, sourced this session:** "Mahy et al. 1994 proposed a threshold average of 2.3
Delta-E (dE) CIE1976 for just-noticeable difference (JND)... widely cited in color science
literature." [CITED: multiple secondary sources aggregated via WebSearch this session, MEDIUM
confidence — the primary Mahy et al. 1994 paper itself was not directly read]. Recommend asserting
adjacent colour-scale bands differ by **at least ΔE76 ≥ 3.0** under each of the three CVD
simulations (a margin above the bare 2.3 JND, since CVD simulation compresses the effective gamut
and a pair separable in full colour vision can compress closer together, not further apart, under
simulation).

```typescript
// sRGB (0-255) -> CIE Lab, then Euclidean distance -- the CIE76 formula, ~20-30 lines total,
// no dependency. Exact RGB->XYZ->Lab matrix/formula is standard and widely published
// (D65 illuminant, sRGB companding) -- verify against a primary colorimetry reference at
// implementation time rather than transcribing from this report.
function deltaE76(labA: [number, number, number], labB: [number, number, number]): number {
  const [l1, a1, b1] = labA
  const [l2, a2, b2] = labB
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2)
}
```

### Extending the repaint-equivalence-then-measure pattern per form

```typescript
// Pattern source: bench/canvas-repaint.bench.test.ts (existing, read this session)
// Per form: prove the paint matches the shared colour function's output at two sample cells
// BEFORE trusting the timing, exactly as the Phase 1 fillRect/putImageData comparison did.
// Each form's bench test asserts against PERF_BUDGETS['PERF-05'] (thresholdMs: 16), the same
// budget row criterion 4 names -- do not invent a new budget id for this phase.
import { PERF_BUDGETS } from '../perf-budgets.ts'
const budget = PERF_BUDGETS['PERF-05'] // { thresholdMs: 16, anchorMs: 16, anchorLabel: 'one frame' }
```

## Runtime State Inventory

Not applicable — this is a design-pass/greenfield-mockup phase, not a rename/refactor/migration.
No existing stored data, live service config, OS-registered state, secrets, or build artifacts
carry the string(s) this phase introduces.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Exact CVD-simulation matrix coefficients (Viénot/Brettel/Mollon or Machado) are correctly obtainable from `libDaltonLens`/`daltonize` without further verification at implementation time | Common Pitfalls, Code Examples | If the executor transcribes coefficients incorrectly or from a lower-quality source, D-17's CVD check silently validates a palette that is not actually colorblind-safe — the exact failure mode this phase exists to prevent. Mitigation already stated: verify against the named public-domain reference at implementation time, do not trust this report's prose description alone |
| A2 | ΔE76 ≥ 3.0 is an appropriate threshold for "adjacent bands stay perceptually separable" | Code Examples (CIE76) | Too low: passes a palette a CVD viewer cannot actually distinguish. Too high: no diverging palette passes and the check becomes unsatisfiable. Recommend the planner treat this as a tunable constant validated empirically against the chosen palette stops, not a hard-coded final answer |
| A3 | `d3-contour`/`marchingsquares` are needed at all — hand-rolling a *single-threshold* isoline (not full iso-band fill) may be small enough to not need a dependency, if forms 2/4's "filled bands" requirement is satisfied by a simpler layered-threshold approach | Don't Hand-Roll, Open Questions | If wrong, the planner adds an unnecessary dependency in tension with the locked "no new dependency" line; if the simpler approach is insufficient, the planner discovers this only after starting to hand-roll it |

## Open Questions

1. **Does `06-UI-SPEC.md`'s "no new dependency" line bind the whole phase, or was it written before
   the contour-form requirement's dependency implications were considered?**
   - What we know: `06-UI-SPEC.md`'s Registry Safety section states "The mockups introduce no new
     dependency," citing "D-14's 'no dependency' wording in CONTEXT.md" — but `06-CONTEXT.md`'s
     actual D-14 decision is about the symlog transform, not dependencies; the "no dependency"
     wording that does exist in CONTEXT.md is D-17's, which is scoped explicitly to the CVD check
     ("~50 lines, no dependency"), not to the whole phase. `06-CONTEXT.md`'s own `<code_context>`
     section separately says the mockups "should not introduce a dependency the app does not
     have" — a softer, narrower framing than "zero new dependencies."
   - What's unclear: whether the UI-SPEC's broader phrasing is authoritative (it is an *approved*
     locked document) or a citation error inherited from a misattributed decision id.
   - Recommendation: default to hand-rolling everything (colour function, CVD check, and if
     feasible a scoped single/dual-threshold contour routine for forms 2/4) so the plan is correct
     under either reading. If forms 2/4's iso-*band* fill (not just lines) proves too complex to
     hand-roll well inside the phase's throwaway-mockup budget, escalate this exact tension back to
     the user or `/gsd-discuss-phase` before adding `d3-contour`, rather than silently deciding it.

2. **How do plain-HTML, no-build-step mockups actually get served and import D-27's `src/`
   colour function?**
   - What we know: D-28 says the mockups are "plain HTML files... outside `src/` and outside the
     Vite build, so no build or deploy cost" and "each mockup opens straight from disk with no
     build step" (paraphrasing D-29's parallel language about the fixture). Browsers block ES
     module imports across a bare `file://` origin (CORS), so a mockup cannot literally be
     double-clicked and still `import` a relative TypeScript module.
   - What's unclear: whether "no build step" means "not part of `vite build`'s production output"
     (compatible with being served by `vite dev`, which already resolves TS and bare specifiers
     without adding anything to `dist/`) or something stricter.
   - Recommendation: serve the mockups through `vite dev` (already in the toolchain, zero new
     tooling, and the closest reading of D-28's actual worry — "no build/deploy cost" for the
     production bundle) rather than a bare static file server, since `vite dev` can serve a `.ts`
     colour-function module with on-the-fly transform and both plain-HTML mockups and the D-05
     Solid comparison page can load it the same way.

3. **Where does D-27's colour function live in `src/`?** (Finding F-05, carried from CONTEXT.md,
   not newly resolved by this research)
   - What we know: it cannot live under `src/app/` (mockups must not drag in Solid), it is not
     kernel code, and it is not data-layer code; `src/metrics/` is the closest existing sibling but
     the function is not a metric in the sense `src/metrics/cagr.ts`/`irr.ts`/`format.ts` are.
   - What's unclear: the exact directory name.
   - Recommendation: a new sibling directory, e.g. `src/colorscale/` or `src/viz/`, so
     SIM-10's module-boundary test (which asserts what the kernel may import) is trivially
     unaffected — this module is never imported by the kernel in either direction.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 22 (`--experimental-strip-types`) | Offline sweep script (D-29) | Yes [VERIFIED: package.json `devDependencies`/`scripts`, existing `scripts/run-backtest.ts` already runs this way] | project-pinned | — |
| Playwright (chromium) | `bench` project's per-form repaint measurement | Yes [VERIFIED: `package.json` `devDependencies`, `playwright: 1.62.1`] | 1.62.1 | — |
| Vite dev server | Serving the mockups with real ESM resolution (Open Question 2) | Yes, already the project's `npm run dev` | project-pinned | A minimal static file server (`npx serve`, `python -m http.server`) if the planner decides against `vite dev` |
| `d3-contour` / `marchingsquares` | Forms 2 and 4's iso-band rendering, only if the dependency question is resolved in favor of adding one | Not installed [VERIFIED: `package.json` `dependencies`, no `d3-*` entries] | — | Hand-rolled scoped marching-squares routine |

**Missing dependencies with no fallback:** none — every dependency this phase might add has a
documented hand-rolled fallback, consistent with D-17's own precedent.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 [VERIFIED: package.json] |
| Config file | `vitest.config.ts` (three projects: `unit`, `bench`, `app`) |
| Quick run command | `npm run test` (fast Node `unit` project) |
| Full suite command | `npm run test && npm run test:app && npm run bench` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VIZ-05 | At least 3 (D-02: 4) throwaway mockups exist, each rendering a full-scale 10,000-cell field from real swept data | manual-only (existence + written rejection reasoning is a human-judged artifact) | — | N/A — judged via the D-05 comparison page and `06-HEATMAP-SPEC.md`, not asserted |
| VIZ-07 | Colour scale is diverging, symlog, colorblind-safe (D-17's CVD check) | unit | `npx vitest run --project unit tests/color-scale-cvd.test.ts` | ❌ Wave 0 |
| VIZ-07 | Colour function's symlog transform and categorical branches (ruin/incomplete) are correct | unit | `npx vitest run --project unit tests/value-to-color.test.ts` | ❌ Wave 0 |
| VIZ-10 | Overlapping-windows caveat text is present, at real width, in all four mockups plus comparison page | manual/backstop, per `06-UI-SPEC.md`'s own E3 row (discharged by visual inspection at the D-05 comparison step) | — | N/A |
| Criterion 4 | Each form repaints its 10,000-cell field on a metric change in under 16ms | bench (Playwright-backed, calibration-normalized) | `npx vitest run --project bench bench/heatmap-repaint.bench.test.ts` | ❌ Wave 0 |
| — | D-29 fixture round-trips through its binary encode/decode exactly | unit | `npx vitest run --project unit tests/sweep-fixture-format.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run test` (unit project only, fast)
- **Per wave merge:** `npm run test && npm run bench` (bench project measures criterion 4 per form)
- **Phase gate:** Full suite green (including `npm run test:app` if any browser-mode backstop
  assertion is added for the overflow/collision checks `06-UI-SPEC.md` already flags as 🧪
  backstop rows) before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `tests/color-scale-cvd.test.ts` — D-17's automated CVD assertion, covers VIZ-07
- [ ] `tests/value-to-color.test.ts` — D-27's colour function unit tests, covers VIZ-07
- [ ] `tests/sweep-fixture-format.test.ts` — D-29's binary format round-trip, no existing coverage
- [ ] `bench/heatmap-repaint.bench.test.ts` (or one file per form) — criterion 4, extends the
      `bench/canvas-repaint.bench.test.ts` pattern, no existing coverage for this phase's four
      forms
- [ ] Framework install: none — Vitest, Playwright and the three-project config already exist and
      need no new setup

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A — no auth surface anywhere in this static, offline tool |
| V3 Session Management | No | N/A |
| V4 Access Control | No | N/A |
| V5 Input Validation | Yes, minimally | The D-29 binary fixture parser must fail loudly on a magic/version mismatch, following the exact existing pattern in `tools/bundle-compiler/src/binary-format.ts`'s `decodeHeader` [VERIFIED: read this session] rather than silently misreading a stale or corrupted fixture |
| V6 Cryptography | No | N/A — no secrets, no signing, no encryption surface in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Corrupted or stale committed binary fixture silently misread as valid sweep data | Tampering | Magic-number + format-version header check, fail loud (existing `decodeHeader` pattern) — a corrupted fixture must throw, not render a plausible-looking wrong heatmap |
| A dependency added for contour generation carries a supply-chain risk (SLOP/SUS package) | Tampering (supply chain) | Package Legitimacy Audit above — `d3-contour`/`marchingsquares` both cleared OK; `d3-color-difference` is SUS and excluded |

This phase's security surface is minimal by construction: no network calls beyond loading a local
static fixture, no user input beyond a theme toggle already covered by Phase 4's security review,
no persistence, and no code that reaches the production `src/app/` build (D-27's colour function
and D-29's fixture are the only two artifacts that do, and neither introduces new input surface
beyond what V5's fixture-header check already covers).

## Sources

### Primary (HIGH confidence)

- `06-CONTEXT.md`, `06-UI-SPEC.md`, `REQUIREMENTS.md`, `STATE.md`, `ROADMAP.md` — read in full this
  session
- `public/data/manifest.f0a9dfbdfa.json` — read this session for SPX/total-return and `@rate/rate`
  tier ranges
- `bench/canvas-grid.ts`, `bench/canvas-repaint.bench.test.ts`, `perf-budgets.ts`,
  `src/kernel/backtest.types.ts`, `src/kernel/backtest.ts` (partial), `src/data/kernel-inputs.ts`,
  `src/data/bundle-source.ts`, `src/data/load-bundle-node.ts`, `scripts/run-backtest.ts`,
  `src/metrics/format.ts`, `src/app/theme.ts`,
  `src/app/components/ResultColumn/log-axis-splits.ts`,
  `src/app/components/ResultColumn/EquityCurveChart.tsx` (grep), `src/validation/cost-parameters.ts`
  (grep), `tools/bundle-compiler/src/binary-format.ts`, `tools/bundle-compiler/src/seams.ts`,
  `.planning/research/PITFALLS.md` §A7, D5, E1-E5, F5 — all read in full this session
- `.planning/PROJECT.md` Key Decisions table, `.planning/WINDOWS.md` (all five entries) — read this
  session
- npm registry (`npm view`) and `gsd-tools package-legitimacy check` — direct lookups this session
  for `d3-scale`, `d3-interpolate`, `d3-array`, `d3-contour`, `marchingsquares`,
  `d3-color-difference`

### Secondary (MEDIUM confidence)

- daltonlens.org, "Understanding CVD simulation" and "Review of Open Source Color Blindness
  Simulations" — WebFetch this session, identifies Viénot 1999 as the simplest correct method and
  `libDaltonLens`/`daltonize` as trustworthy coefficient sources
- Mahy et al. 1994 ΔE76 JND ≈ 2.3 — aggregated via WebSearch this session across multiple
  secondary color-science sources; the primary 1994 paper itself was not directly read

### Tertiary (LOW confidence)

- gist.github.com/Lokno/df7c3bfdc9ad32558bb7 ("Coblis" matrices) — WebFetch this session,
  explicitly cited here only as a *negative* example (known-inaccurate, do not use)

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM — package versions and legitimacy verified live; the CVD matrix
  coefficients and exact colour-scale stops are deliberately left unverified pending
  implementation-time sourcing from a primary reference, not guessed here
- Architecture: HIGH — every pattern extends code already proven in this repo (Phase 1's canvas
  arms, Phase 3-5's kernel/data-layer seams, Phase 4's theme mechanism)
- Pitfalls: HIGH — PITFALLS.md sections directly quoted from the file this session, plus one new
  pitfall (the `formatMultiple` legend-tick discrepancy) verified against actual source code

**Research date:** 2026-08-21
**Valid until:** 30 days (stable domain; the two Open Questions should be resolved before or
during planning, not left to drift past this window)
