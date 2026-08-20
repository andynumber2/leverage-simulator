# Phase 5: Attribution and the Credibility Surface - Research

**Researched:** 2026-08-20
**Domain:** In-browser cost decomposition (Shapley-value counterfactual attribution), synthetic-vs-real validation UI, manifest-driven provenance surface, generated-module methodology page
**Confidence:** HIGH (grounded in code read this session) for wiring/mechanics; MEDIUM for the Shapley non-compounding-arm cost model (a modelling choice CONTEXT.md's F-03 explicitly defers to this document); LOW/ASSUMED only where flagged

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Cost Decomposition (ATTR-01, ATTR-02)**
- **D-01:** Components are measured by counterfactual runs, not by summing in-loop accruals. Each component's size is the difference between two final values with a factor switched on or off. Rejected: summing the `financingCost`/`expenseCost` terms the kernel already computes per bar and discards (contemporaneous dollars, not terminal impact); shipping both and cross-checking.
- **D-02:** The naive baseline is `initial * (1 + L * cumulativeReturn)`. Forced, not chosen: ATTR-01 names volatility drag as a component, and drag only exists as a measurable quantity if the baseline applies leverage to the cumulative return.
- **D-03:** Interaction terms are allocated by Shapley value over all orderings, not a fixed ladder. Shapley averages each factor's marginal contribution across all 6 orderings (8 subset evaluations), order-independent, reconciles exactly. Rejected: the natural ladder (drag, financing, ER) and its reverse. Reversibility: costly — published figures would change if the allocation method changes later.
- **D-04:** A component may be reported as a gain, signed, with no reframing. Volatility drag can be negative (a gain) in a sustained uptrend; shares are allowed to exceed 100% or go negative; copy explains it. Rejected: renaming the row by sign; suppressing the percentage half whenever a component flips sign.
- **D-05:** With contributions on, the naive rung is per-cash-flow: each contribution grows by `1 + L * (index cumulative return from its own bar to the end)`, naive final value is their sum. Rejected: restricting attribution to lump-sum runs; computing against a same-total lump sum at the entry date.
- **D-06:** ATTR-02's percentages are each component's share of the total gap (`naive - actual`), not %/yr. Shares visibly sum to 100% (subject to D-04's signed case). Rejected: annualized %/yr; all three figures per row.

**Attribution Presentation (ATTR-03)**
- **D-07:** The naive curve is a permanent ghost series on the equity chart — a second muted uPlot series, on by default, never behind a toggle. Rejected: a zero-cost mode that swaps the whole result; a naive-value row in the panel with no second curve.
- **D-08:** The attribution breakdown is always visible, directly under the metrics panel. Three signed component rows plus the naive/actual pair, permanently in the result column, inside Phase 4's D-20 screenshot region. Rejected: an expandable disclosure collapsed by default; tabbing the result column into Curve/Attribution/Validation.

**Synthetic-versus-Real Validation (VALID-04)**
- **D-09:** The comparison is its own always-reachable section with its own canonical parameters, independent of whatever run the user currently has on screen. Rejected: an overlay on the main chart; folding it into the methodology page.
- **D-10:** The synthetic is built from a fixed canonical config, but the user's cost parameters flow through live. Leverage pinned at 3x, the total-return leg forced (Phase 3's amended D-10), window pinned per fund to the resolved inception overlap. Expense ratio and financing spread are NOT pinned — an edit in the control column moves the tracking error on screen. Rejected: mirroring the user's current run; rendering static committed figures.
- **D-11:** The tracking-error figure is computed live in the browser through `computeTrackingError`. Phase 3's D-12 header already names the in-app view as its third intended caller. Rejected: emitting the gate's figure into a generated module at build time (freezes on committed cost defaults, defeats D-10's live demonstration).
- **D-12:** Both D-11 gates plus the full rate-regime sub-window table are shown, including the rows that look worst — the post-2022 high-rate drift of +0.94% (UPRO) and +1.12% (TQQQ). Rejected: headline gates only.

**Provenance Surface (CRED-01)**
- **D-13:** A dense provenance strip sits between the parameter column and the result, inside Phase 4's D-20 screenshot region: active tier, effective date range, source names, seams crossed, bundle version. Rejected: a block at the foot of the parameter column; a page footer.
- **D-14:** Only the seams the active run window actually crosses are shown at all times, in full; remaining seams for that series are one click away. Rejected: a seam count with detail behind a click; every seam inline.
- **D-15:** The app names its sources and does not surface licence terms. Source names and links in the strip; no licence or redistribution status rendered anywhere. Consequence accepted knowingly: `sources.ts` and the manifest carry `license`/`termsUrl` text the app never renders. Rejected: licence status inline per source; stating Yahoo/Nasdaq accepted-risk positions on the methodology page.
- **D-16:** A test fails the build when the strip renders a provenance string that does not trace to a manifest field. Rejected: relying on types alone.

**Methodology Page (CRED-04)**
- **D-17:** A full-screen overlay opened by a URL param, not a route. `?methodology=1` appended to the existing permalink opens it over the app; closing it strips the param and the run behind it is untouched. Rejected: a hand-rolled hash route; a separate static page in the Vite build. Reversibility: costly — `methodology` becomes part of D-13's published, one-way permalink param contract the moment a link carrying it is shared.
- **D-18:** The page is generated from the code's own registries wherever a structured source exists — cost parameter values/confidence/citations from `src/validation/cost-parameters.ts`, the two day-count bases from kernel constants, sources/seams from the manifest, the tolerance breakdown from `TOLERANCE_MECHANISMS`. Prose is written only for the narrative connecting them. Rejected: hand-authored prose with a test asserting quoted numbers match; hand-authored and unchecked.
- **D-19:** All four known limitations are stated, including the ones that hand a skeptic ammunition: (a) extended tier's bias direction, (b) financing spread is ASSUMED after five retrieval attempts, (c) the gate tolerance is weaker than its number (roughly 3.2-3.5% of the 3.955% tolerance is premium/discount noise, TQQQ's margin is a thin ~11%), (d) the post-2022 high-rate sub-window drift and why Phase 3 deliberately left it alone.

**Tiers and Defaults (APP-02, CRED-02, CRED-03, CRED-05)**
- **D-20:** No gate on the extended tier; every extended result carries the warning instead. One click, CRED-02 warning plus CRED-03 magnitude render on every extended-tier result, inside the screenshot region. Rejected: a one-time acknowledgment before first use (not in the URL, so a link recipient never sees it); relegating the warning to the D-13 provenance strip.
- **D-21:** The CRED-03 magnitude is a build-time figure, committed and tested. A test downsamples a known-good daily era to monthly, interpolates it back, re-runs, and emits the measured gap into a generated module the warning renders. Rejected: computing it live for the current symbol/window (adds a second full simulation path to every parameter change against the 16ms budget); a per-symbol committed table (deferred as a refinement).
- **D-22:** Every parameter carrying a shipped default is labelled as being at its default, and offers a reset — not just expense ratio and financing spread (Phase 4's D-18) but leverage, entry date, holding mode, initial investment, contribution amount and frequency, tier and dividend mode. Rejected: labelling only the two parameters with a sourced value; a global reset-everything control (deferred).
- **D-23:** A cold arrival with no URL params lands on a neutral default run, visibly at its defaults. The entry date needs a rule defensible in one sentence — the longest window the strict tier allows for the default symbol — never a hand-picked date. Closes Phase 4's F-04. Rejected: an empty pane until the user sets an entry date; landing on a deliberately unflattering window.

### Claude's Discretion
- Component decomposition inside the Solid app, and how the attribution/validation/methodology surfaces are factored relative to the existing `ResultColumn` components.
- The exact query-param name and value format for D-17's methodology overlay, subject to D-13's "every param, always, readable" contract.
- Which known-good daily era and symbol D-21's downsample test uses, and the interpolation method it inverts (must match what the bundle compiler actually does, not a plausible substitute).
- The visual treatment of the D-07 ghost curve (dash pattern, opacity, legend copy), subject to it being unmistakably subordinate to the real series.
- Whether the D-09 validation section is separately permalinkable. Not discussed; recommended.
- Numeric formatting of signed attribution components, reusing `src/metrics/format.ts` rather than adding a second formatter.

### Deferred Ideas (OUT OF SCOPE)
- A global "reset everything to defaults" control — revisit alongside Phase 8's preset scenarios (SHARE-06).
- A per-symbol table of CRED-03 bias magnitudes rather than D-21's single representative figure — deferred as a refinement, not declined.
- Surfacing the Yahoo and Nasdaq accepted-licence-risk positions in the app — declined under D-15.
- Keeping the last N data bundles deployed and addressable — carried over from Phase 4; Phase 8 candidate.
- The overlapping-windows caveat (VIZ-10) — Phase 6/7, not here.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ATTR-01 | Decompose the naive-vs-actual gap into volatility drag, financing cost, expense ratio | Shapley counterfactual algorithm below (Architecture Patterns §1), including the resolution for F-03's non-compounding-arm cost model |
| ATTR-02 | Report in $ and %, reconciling with no unexplained residual | Shapley's efficiency property (values sum exactly to `v(N)-v(∅)` by construction) — Architecture Patterns §1; `format.ts` extension plan |
| ATTR-03 | Zero-cost comparison mode: naive beside actual | D-07 ghost curve; F-02's log-axis-negative-value fix (Common Pitfalls §1, Code Examples §4) |
| CRED-01 | Provenance strip: tier, range, sources, seams, always visible | `Manifest`/`ManifestSeries` shape read and quoted (Architecture Patterns §3); `LoadedBundle.manifest` already in memory |
| CRED-02 | Extended-tier bias-direction warning, prominent | Existing `Tier` plumbing (`bounds.ts`), `EntryDateControl.tsx`'s hardcoded-`'strict'` gap that must be fixed for APP-02 (Common Pitfalls §3) |
| CRED-03 | Quantified magnitude via downsample/interpolate/re-measure | Generated-module pattern from `tools/bundle-compiler/src/compile.ts` (Architecture Patterns §2) adapted for a committed, test-verified figure |
| CRED-04 | Methodology page: cost model, day-count, sources, limitations, one click away | `COST_PARAMETERS`/`TOLERANCE_MECHANISMS` registries (already read, quoted); D-17's permalink-param collision with `decodeParams`'s allow-list (Common Pitfalls §2 — load-bearing) |
| CRED-05 | Defaults labelled and editable | `CostControls.tsx`'s existing default/reset pattern (Architecture Patterns §4) as the template to generalize |
| VALID-04 | In-app synthetic-vs-real view | F-01's extraction requirement from `tests/validation/upro-tqqq-gate.test.ts`'s private helpers (Architecture Patterns §5) |
| APP-02 | Tier selector, meaning stated on screen | `Tier` type already carries both members (`bounds.ts:54`); `EntryDateControl.tsx` gap (Common Pitfalls §3) |

</phase_requirements>

## Summary

Phase 5 is almost entirely new application-layer code composed from kernel and validation primitives that already exist and are already correct — no new library, no new external data, no new build step beyond one small generated-module addition. `runBacktest` (`src/kernel/backtest.ts`) is the one function every counterfactual arm calls; `computeTrackingError` (`src/validation/tracking-error.ts`) is already pure, test-context-free, and its own header names the in-app view as an intended caller. The hard parts are not "what library" but "what exact computation" — three of them, none of which CONTEXT.md's decisions fully specify at the arithmetic level, and this document resolves as far as it safely can without becoming a plan:

1. **The Shapley counterfactual grid (ATTR-01/02, D-01/D-03).** Three "factors" (compounding, financing, expense) mean 8 subset evaluations. Four of those subsets have compounding switched off but a cost switched on — CONTEXT.md's F-03 flags this as undefined and explicitly defers the resolution to research. This document proposes a concrete, day-count-consistent, non-compounded deduction formula (Architecture Patterns §1) so the planner is not left improvising cost arithmetic mid-implementation.
2. **Zeroing financing inside a real kernel call is not a param flip.** `financingCost = value * (leverage-1) * (rate + financingSpread) * (calendarGap/360)` (`backtest.ts:136`, verbatim below) depends on `series.shortRate`, a per-bar array, not just `params.financingSpread`. Setting `financingSpread: 0` alone leaves the base short-rate cost of leverage in the arm meant to have zero financing. The counterfactual "financing off" kernel call needs a **zero-filled `shortRate` array**, not just a param edit (Code Examples §1).
3. **The naive ghost curve can go negative on a log axis that cannot render it (F-02).** This is verified against the exact same log-scale code that already killed the renderer once this milestone (`quick-260820-4qx`). This document proposes reusing the codebase's own `null`-gap technique (`EquityCurveChart.tsx`'s `buildTerminatorData`, already using `(number | null)[]`) rather than inventing a new mechanism.
4. **D-17's `?methodology=1` collides with `decodeParams`'s strict allow-list.** Verified this session: `decodeParams` rejects the *entire* permalink, including the run parameters, if any key outside `PERMALINK_KEYS` is present (`permalink.ts:236-239`, quoted below). The methodology overlay must be read and stripped from `location.search` before `decodeParams` ever sees it — it cannot be added to `PERMALINK_KEYS` without also making it a required key on every other permalink (this was not previously discovered; it is genuinely load-bearing for D-17).
5. **APP-02's tier selector has one already-wired half and one not-yet-wired half.** `resolveEntryDateBounds` already takes a `Tier` argument (`bounds.ts:66-71`) — but `EntryDateControl.tsx` calls it with the string literal `'strict'` hardcoded (`EntryDateControl.tsx:34`), so today's UI would silently ignore a tier selector's extended-mode value for min/max bounds. This is a real wiring gap the planner must close, not a hypothetical risk.
6. **D-23 ("cold arrival lands on a neutral default, closing Phase 4's F-04") appears to already be implemented.** `state.ts:608` (`setRequestStore('entryDate', seriesEntry.tiers.strict.firstDate)`) already resolves the default entry date from the manifest at load time. CONTEXT.md frames D-23 as phase-5 work that "closes" F-04; the mechanism is already present in the codebase read this session. The planner should verify this rather than re-implement it — the remaining phase-5 work under D-22/D-23 for entry date is almost certainly just the *default-label-and-reset UI treatment*, not the resolution logic itself.

**Primary recommendation:** build attribution as one pure function (`computeAttribution(bundle, request): AttributionResult`) that internally calls `buildKernelInputs`/`runBacktest` for the four compounding-on arms and a small pure non-compounded-cost helper for the four compounding-off arms, reduces the 8 values to 3 Shapley shares with the reconciliation guaranteed by construction, and is called from inside the existing `scheduleRun` coalescing boundary so PERF-07b's re-measurement covers it for real.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cost decomposition (Shapley grid) | Browser/Client (main thread, inside `scheduleRun`) | — | Single-run, must land inside the existing 16ms coalesced recompute (PERF-07b); no worker needed at this cell count (8 kernel-scale evaluations) |
| Naive baseline / ghost curve series | Browser/Client | — | Derived from the same run's return series already in memory; no new data fetch |
| Synthetic-vs-real validation view | Browser/Client | — | `computeTrackingError` is already free of I/O; the extraction target (F-01) moves helper logic from a test file into `src/validation/`, still browser-reachable |
| Provenance strip | Browser/Client | — | Reads `LoadedBundle.manifest`, already resident after `initializeApp` |
| Methodology page content | Browser/Client (rendering) | Build tool (CRED-03's generated magnitude only) | Registries (`COST_PARAMETERS`, `TOLERANCE_MECHANISMS`) are already browser-importable TS constants; only D-21's downsample measurement needs a build/test-time step, mirroring `data-bundle.generated.ts` |
| Tier selector / extended-tier warning | Browser/Client | — | Reads `Manifest.series[].tiers`, already decoded client-side |
| Default-parameter labelling | Browser/Client | — | Pure UI-state comparison against imported constants, no new data |

No capability in this phase touches a server, a database, or a build-time API call — this remains a fully static SPA (APP-03 unaffected).

## Standard Stack

No new runtime dependency is required for this phase. Every library this phase touches (Solid.js 1.9.15, uPlot 1.6.32, Comlink 4.4.2, Vitest 4.1.10, fast-check 4.9.0, vite-plugin-pwa 1.3.0) is already installed and pinned `[VERIFIED: package.json]` — confirmed by reading `package.json`'s `dependencies`/`devDependencies` blocks this session (no version drift from Phase 4's committed research).

### Core (unchanged from Phase 4, reused)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| solid-js | 1.9.15 | UI framework | Already the app framework; attribution/provenance/methodology are new components in the same tree |
| uplot | 1.6.32 | Ghost curve series | `EquityCurveChart.tsx` already renders a second/third series (the ruin terminator) the same way D-07's ghost curve needs to |
| vitest | 4.1.10 | Test runner | `tests/validation/upro-tqqq-gate.test.ts` already exercises the exact helpers VALID-04 needs extracted |
| fast-check | 4.9.0 | Property tests | Shapley's efficiency property (components sum to the total gap) is a natural property-based invariant |

### Package Legitimacy Audit

**Not applicable.** No new external package is introduced by this phase's scope. All work is new first-party TypeScript/TSX composed from already-committed kernel, validation and data-layer modules. If a future planning pass introduces a genuinely new dependency (none identified in this research), the Package Legitimacy Gate protocol must be run against it before that plan is approved.

## Architecture Patterns

### System Architecture Diagram

```
                 scheduleRun() [rAF-coalesced, D-03]
                          |
                          v
        +----------------------------------------+
        |  buildKernelInputs(bundle, request)     |   <- existing, unchanged
        +----------------------------------------+
                          |
                          v
        +----------------------------------------+
        |  runBacktest(params, series, outputs)   |   <- existing, unchanged (actual result)
        +----------------------------------------+
                          |
                          v
        +----------------------------------------+
        |  computeAttribution(bundle, request)    |   <- NEW, Phase 5
        |    for each of 8 subsets S of           |
        |    {compounding, financing, expense}:   |
        |      if compounding in S:               |
        |        runBacktest(paramsForS, ...)     |  -> real kernel call
        |      else:                              |
        |        naiveWithSimpleCosts(S, ...)     |  -> pure closed-form
        |    reduce 8 values -> Shapley shares     |
        +----------------------------------------+
                          |
              +-----------+-----------+
              v                       v
   AttributionPanel (D-08)   Ghost naive series (D-07)
   [always visible, under         [added to EquityCurveChart's
    MetricsPanel]                  uPlot series array]

  Independent, always-reachable section (D-09):
        +----------------------------------------+
        |  ValidationView (VALID-04)              |
        |  fixed canonical params (leverage=3,    |
        |  total-return leg) + user's live cost   |
        |  params -> buildKernelInputs/runBacktest|
        |  -> computeTrackingError (existing,     |
        |     extracted helpers from F-01)        |
        +----------------------------------------+

  Always-visible strip, reads LoadedBundle.manifest directly (no new fetch):
        +----------------------------------------+
        |  ProvenanceStrip (CRED-01)              |
        |  active seams filtered to run window    |
        +----------------------------------------+

  Overlay, opened by stripping/reading a URL param BEFORE decodeParams runs:
        +----------------------------------------+
        |  MethodologyOverlay (CRED-04)           |
        |  renders COST_PARAMETERS,               |
        |  TOLERANCE_MECHANISMS, day-count         |
        |  constants, manifest sources/seams,      |
        |  D-21's generated CRED-03 figure         |
        +----------------------------------------+
```

### Pattern 1: Shapley-value cost decomposition (ATTR-01/02/03, resolves F-03)

**What:** Three binary "factors" — `compounding` (daily-compounded leverage vs. D-02's naive multiply), `financing`, `expense` — define a cooperative game over `2^3 = 8` subsets. `v(S)` is the run's final portfolio value with exactly the factors in `S` switched on. The Shapley value of each factor is its average marginal contribution across all `3! = 6` orderings of the other two factors (equivalently, a weighted sum over the 8 `v(S)` values). This is the standard textbook Shapley-value construction for a 3-player game `[ASSUMED: standard cooperative game theory, not verified against a citable source this session — the arithmetic itself is not in dispute, only whether it is the right tool, which CONTEXT.md's D-03 has already locked]`.

**Why this reconciles exactly (ATTR-02's "no unexplained residual"):** Shapley values satisfy the *efficiency axiom* — the three factors' values sum exactly to `v({compounding,financing,expense}) - v(∅)`, i.e., `actual - naive`. This is why D-01/D-03 chose it over a fixed ladder: the reconciliation is a mathematical guarantee of the method, not something that has to be separately verified per run.

**The resolution F-03 asks this document to provide** — what `v(S)` means for the four subsets where `compounding ∉ S`:

- `v(∅)` = D-02's naive baseline with no costs: `initialInvestment * (1 + leverage * cumulativeIndexReturn)` where `cumulativeIndexReturn` is the product of `(1 + returns[i])` over the run window minus 1 (the same `KernelSeries.returns` array `buildKernelInputs` already produces).
- `v({financing})` = naive baseline **minus** a simple, non-compounded financing deduction, using the same actual/360 day-count basis the kernel uses (`backtest.ts:136`, quoted below) but applied against the run's *cash flows*, never against a value path that compounds: for lump-sum runs, `sum over bars i of initialInvestment * (leverage-1) * (shortRate[i] + financingSpread) * (calendarDaysElapsed[i] / 360)`. This reuses the exact per-bar `shortRate`/`calendarDaysElapsed` arrays `buildKernelInputs` already builds — no new data derivation, just a different (non-compounding) reduction over the same arrays.
- `v({expense})` = naive baseline minus `sum over bars i of initialInvestment * expenseRatio * (calendarDaysElapsed[i] / 365)` — same actual/365 basis as `backtest.ts:140`, same non-compounding treatment.
- `v({financing, expense})` = naive baseline minus **both** deductions above, summed (no compounding interaction exists between them in the naive path, so simple addition is exact — unlike the compounding-on arms, there is no multiplicative interaction to allocate here).
- `v({compounding})`, `v({compounding, financing})`, `v({compounding, expense})`, `v({compounding, financing, expense})` = real `runBacktest` calls with the non-`compounding` factors' kernel inputs zeroed per-arm (see Code Example 1 for exactly how "financing zeroed" must be implemented — it is not a one-line param change).
- `v({compounding, financing, expense})` is by construction the same number as the user's actual on-screen result (`currentKernelResult().finalValue`); this arm should read that cached result rather than re-running the kernel a ninth time.

With contributions on (D-05), the same per-bar deduction sums generalize naturally: `initialInvestment` above is replaced by "principal outstanding as of bar i under the naive per-cash-flow rule," i.e., the sum of every contribution applied at or before bar `i`. This must be stated explicitly on the CRED-04 methodology page as a modelling choice (per F-03's own instruction) — it is a reasoned, consistent, and reconciling definition, but it is a choice, not a fact independently verifiable against an external source, and should be tagged `[ASSUMED: this document's own reasoned resolution of F-03, not drawn from an external source]` in the plan and on the methodology page copy.

**Confidence:** MEDIUM. The Shapley *method* is locked by D-03. The specific non-compounding cost formula above is this document's own proposed resolution of F-03's genuinely open question — it is internally consistent (reconciles exactly, matches both day-count bases) but is a novel synthesis, not something read off an existing test or spec. The planner should treat this as a strong starting point, not a locked figure, and the discuss-phase / plan-checker should confirm it before implementation.

### Pattern 2: Generated-module pattern for a committed, test-derived figure (CRED-03, D-21)

**What:** The codebase already has exactly one precedent for "a script writes a generated TS module that the app imports as a constant": `tools/bundle-compiler/src/compile.ts`'s `writeGeneratedPointerModule` (lines 192-217, read this session), which writes `src/data-bundle.generated.ts` via a write-then-rename discipline. That module is written by an **explicit CLI invocation** (`npm run compile-data`), not automatically by `npm test` or `npm run build` — confirmed via `package.json`'s `scripts` block: `"compile-data": "node --experimental-strip-types tools/bundle-compiler/src/cli.ts"` `[VERIFIED: package.json]`.

D-21 wants something adjacent but different in trigger: "A test downsamples a known-good daily era to monthly, interpolates it back, re-runs, and emits the measured gap into a generated module the warning renders." No existing pattern in this codebase runs a *test* that writes a *source* file as a side effect — `cost-parameters.ts`'s own header describes a **pinning test** pattern instead (a test that recomputes a value and asserts it matches a committed constant, never writing the constant itself): `"...tests/validation/cost-parameters.test.ts's pinning assertions in the same commit, is the git-history evidence..."` (`cost-parameters.ts:5-6`, read this session).

**Recommended pattern for D-21**, synthesizing both precedents: a small standalone script (e.g. `scripts/measure-extended-tier-bias.ts`, following the existing `--experimental-strip-types` node-script convention already used by `run-backtest.ts`/`fetch.ts`/`cli.ts`) that performs the downsample-interpolate-remeasure and writes a generated module (`src/validation/extended-tier-bias.generated.ts`) via the same write-then-rename discipline as `writeAsset`/`writeGeneratedPointerModule`, wired to a new `npm run` script. A companion **pinning test** (mirroring `cost-parameters.test.ts`'s pattern) recomputes the same figure at test time and asserts it matches the committed generated module, so CI catches the figure moving when the data does (per D-21's own stated goal) without the test suite itself performing file writes.

**Confidence:** MEDIUM-HIGH. The two precedents (generated-pointer-module write discipline, pinning-test verification) are both `[VERIFIED: code read this session]`; the specific synthesis proposed here (a new script + a new npm command + a pinning test) is this document's own recommendation, consistent with both existing patterns but not itself a pattern already in the repo.

### Pattern 3: Provenance strip built entirely from `Manifest` shape (CRED-01/02/03/04)

The full manifest series shape, verified by reading `tools/bundle-compiler/src/manifest.ts:22-35` this session:

```typescript
export interface ManifestSeries {
  id: string
  scope: string
  kind: SeriesKind
  asset: string
  calendarStartIndex: number
  length: number
  firstDate: string
  lastDate: string
  units: string
  sources: Array<{ source: string; url: string; retrievedAt: string; license: string; termsUrl: string }>
  seams: SeamRecord[]
  tiers: { strict: DateRange | null; extended: DateRange | null }
}
```

And the seam record shape, `tools/bundle-compiler/src/seams.ts:11-27`:

```typescript
export interface SeamRecord {
  kind: SeamKind          // 'splice' | 'interpolation' | 'carry-forward'
  firstDate: string
  lastDate: string
  sourceBefore: string
  sourceAfter: string
  method: string
  degradesToNonDaily: boolean
}
```

Every field D-13/D-14/D-15/D-16 need — tier, date range, source names, seam dates, `degradesToNonDaily` for tier-boundary logic — is already present and already decoded into `LoadedBundle.manifest` by `loadBundleFromSource` (`src/data/bundle-source.ts:38-56`, read this session). No new data-layer code is needed; the provenance strip is a pure rendering pass over `loadedBundle().manifest.series.find(s => s.id === activeSeriesId)`.

**D-14's "only the seams the active window crosses"** is a pure filter: `seams.filter(s => s.firstDate <= window.lastDate && s.lastDate >= window.firstDate)` (standard interval-overlap test) against the resolved run window's own `firstDate`/`lastDate`, which `buildKernelInputs`'s `KernelInputs.window` already carries.

**D-16's "a test fails the build when the strip renders a string that doesn't trace to a manifest field"** has a direct precedent to model after: SIM-10's own module-boundary assertion (referenced but not re-read this session — the pattern is "assert an import graph or a rendered-string set against a golden/derived source," which this codebase already does at least once for import boundaries).

### Pattern 4: Default-labelled, resettable control (CRED-05, template for D-22)

`src/app/components/ParameterColumn/CostControls.tsx` (read in full this session) is the one component in the codebase that already does everything D-22 asks for, for two of the eight parameters it must now cover:

```typescript
// CostControls.tsx:75-76 — the isDefault check every other control needs to add
const expenseRatioIsDefault = () => expenseRatioPercent() === DEFAULT_EXPENSE_RATIO_PERCENT
const financingSpreadIsDefault = () => financingSpreadPercent() === DEFAULT_FINANCING_SPREAD_PERCENT
```

```typescript
// CostControls.tsx:125-130 — the Show/fallback pattern that swaps citation copy
<Show
  when={expenseRatioIsDefault()}
  fallback={<SourceCitation text={userSuppliedExpenseRatioCitation()} />}
>
  <SourceCitation costParameterId="generic-3x-expense-ratio" />
</Show>
```

**Gap to close, not just replicate:** this pattern's "reset" is implicit — clearing the text input restores the default (`CostControls.tsx:80-84`). That gesture does not exist for a `<select>` (SymbolControl, tier, holding mode, contribution frequency) or for a native `<input type="date">` whose only "clear" already means something else (`EntryDateControl.tsx:64-68` — clearing reverts to the earliest bound, not necessarily today's *default*). D-22 says every defaulted parameter "offers a reset" — for select/date controls this likely needs an explicit small reset affordance (e.g., a button rendered only when `!isDefault()`), not a reuse of the empty-string gesture. This is a real per-control design decision the plan needs to make once, consistently, rather than leaving each control to invent its own reset UX.

**`EntryDateControl.tsx` specifically does not yet follow this pattern at all** — its `SourceCitation` (line 73) renders unconditionally regardless of whether `entryDate` is actually at its default, and its citation text hardcodes the word "strict" regardless of the selected tier. Both must change together with the APP-02 tier-selector work (see Common Pitfalls §3).

### Pattern 5: Extracting VALID-04's synthetic-construction helpers (F-01)

Verified this session by reading `tests/validation/upro-tqqq-gate.test.ts` in full (420 lines). Every one of the following is currently a **private, unexported function inside the test file**, not reachable from `src/`:

- `readSeriesLevels` (lines 113-134) — reads one manifest series' decoded level array plus `calendarStartIndex`/`lastDate`.
- `sliceLevelsToWindow` (lines 138-154) — slices a decoded level series to an absolute-calendar-index window.
- `deriveReturns` (lines 159-168) — `level[k]/level[k-1] - 1`, bar 0 defined as 0.
- `localIndexAtOrBefore` / `localIndexAtOrAfter` (lines 172-216) — binary search over the calendar array for sub-window boundaries.
- `MIN_OVERLAP_YEARS = 15` (line 47), `LEVERAGE = 3` (line 49), and both rate-regime era boundary literals `NEAR_ZERO_RATE_ERA_END = '2015-12-31'` / `HIGH_RATE_ERA_START = '2022-01-01'` (lines 42-43).

The gate test's own header states the no-fitting constraint governs any change here: *"VALID-03/D-20's no-fitting protocol governs a failure here... `COST_PARAMETERS`... is never edited in response to a measurement taken by this file"* (lines 11-14, quoted verbatim) — this constraint must survive the extraction unchanged, since VALID-04's in-app view becomes a second consumer of the same no-fitting-governed pipeline.

**Recommended extraction target:** a new `src/validation/synthetic-comparison.ts` (or similarly named module under `src/validation/`) exporting the five helpers plus the two era-boundary constants, with the gate test rewritten to import from it rather than defining its own copies — closing D-11's "one implementation for all three callers" the same way `computeTrackingError` already does. This is the larger part of D-09/D-11/D-12's real implementation cost, as F-01 itself states, and the plan should size a task around it explicitly rather than folding it into "build the validation view."

### Anti-Patterns to Avoid

- **Summing per-bar `financingCost`/`expenseCost` as the attribution figure.** D-01 explicitly rejects this: those are contemporaneous dollars that never compounded forward, not terminal impact. The kernel already computes and discards these values every bar (`backtest.ts:136-141`) — do not resurrect them as attribution output.
- **A fixed drag→financing→expense ladder.** D-03 explicitly rejects both the natural ladder and its reverse as order-dependent and adversarially indefensible.
- **Zeroing financing by setting only `params.financingSpread = 0`.** Leaves the base short-rate cost of leverage (`(leverage-1) * shortRate[i]`) in an arm meant to represent "no financing at all." See Code Example 1.
- **Truncating the naive ghost curve at its first zero-crossing.** Unlike ruin, the naive curve's negative excursion is not an absorbing state (F-02) — it can recover, and a viewer comparing curves needs to see that recovery, not a curve that silently vanishes.
- **Adding `methodology` to `PERMALINK_KEYS`.** `decodeParams`'s required-key sweep (`permalink.ts:274-279`) would then demand `methodology` on every existing permalink, breaking every link generated before this phase shipped. Handle it as an out-of-band flag read from `location.search` before `decodeParams` runs (Code Example 2).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tracking-error / return-drift statistics for VALID-04 | A second stdev/geometric-return calculator in the browser | `computeTrackingError` (`src/validation/tracking-error.ts`, already free of test-context/kernel/data-layer imports) | Its own header already names the in-app view as its third intended caller; D-12 exists specifically so there is exactly one implementation |
| Leveraged-return simulation for any counterfactual arm | A second, simplified backtest loop | `runBacktest` (`src/kernel/backtest.ts`), called with modified `KernelParams`/`KernelSeries` per arm | SIM-10: one kernel module, no second implementation to drift; the counterfactual arms are exactly the kind of "same call with a parameter zeroed" use case this module was built to support |
| Reading/decoding the manifest a second time for the provenance strip | A parallel manifest fetch or a second decode path | `loadedBundle().manifest`, already resident after `initializeApp` | `LoadedBundle` (`bundle-source.ts:25-29`) is the single decoded representation; a second read risks drifting from what the running app actually loaded |
| Numeric string formatting for signed attribution dollars/percentages | A second formatter module | Extend `src/metrics/format.ts` (currently `formatPercent`/`formatMultiple`/`formatCurrency`, none of which currently handle an explicitly-signed `+$X` / `-$X` presentation) | CONTEXT.md's own discretion note says to extend this file, not add a second one; a signed-currency variant is a small, additive change |

**Key insight:** every piece of attribution and validation math this phase needs is a *composition* of two already-correct, already-tested primitives (`runBacktest`, `computeTrackingError`) plus new arithmetic that is genuinely new (the non-compounding cost deductions) and therefore genuinely needs its own tests — it is not a case of "don't reinvent a wheel," it is "assemble two wheels you already have plus one axle you don't."

## Common Pitfalls

### Pitfall 1: The naive ghost curve is unplottable on a log axis exactly where it matters most (F-02)

**What goes wrong:** `EquityCurveChart.tsx` sets `y: { distr: isLog ? 3 : 1 }` for uPlot's native log scale (`EquityCurveChart.tsx:232`, read this session). uPlot's log distribution cannot render a zero or negative value. D-02's naive baseline is `initial * (1 + leverage * cumulativeReturn)`, which goes negative once the index falls more than `1/leverage` — a 33.4% drawdown at 3x, comfortably cleared by the 1929-1932, 2000-2002 and 2008-2009 windows (CONTEXT.md's own F-02, corroborated this session by reading the exact `distr: 3` line it refers to).

**Why it happens:** the real, cost-bearing series can also ruin (clamp to exactly 0), and the codebase already has a pattern for that — `buildTerminatorData` (`EquityCurveChart.tsx:150-155`) truncates the plotted series before the ruin bar and adds a single terminator point. But ruin is an *absorbing state* (D-22/D-23 in the kernel: once ruined, always ruined) — the naive curve going negative is not absorbing; it can cross back above zero later in the same run.

**How to avoid:** reuse the exact mechanism already proven safe in this codebase for a *different* reason — `uPlot.AlignedData` already accepts `(number | null)[]` per series (verified: `buildTerminatorData`'s own return type at `EquityCurveChart.tsx:150`, and its use at `EquityCurveChart.tsx:210` inside `data: uPlot.AlignedData`). Build the naive series as `null` at every bar where the naive value is `<= 0`, and the real value otherwise — this produces gaps in the ghost line exactly where it is unplottable, without truncating the whole series and without a second, invented mechanism. This needs to be built as new code (no existing helper computes "naive value at bar i," since the naive baseline is a Phase 5 concept), but the *insertion technique* into uPlot should be the same `null`-gap idiom already in this file, not a new one.

**Warning signs:** any implementation that computes the naive series once and stops the array short — verify by testing against a window that both crosses -1/L into negative territory AND recovers above it before the run ends (the three historical windows named above are real repro cases already in the bundled dataset).

### Pitfall 2: `?methodology=1` collides with the permalink's strict allow-list (newly found this session, load-bearing)

**What goes wrong:** `decodeParams` treats the *entire* `URLSearchParams` object as the permalink — every key present must be a member of `PERMALINK_KEYS`, or the whole decode fails and the run is evicted:

```typescript
// permalink.ts:236-239, verbatim
for (const key of presentKeys) {
  if (!isPermalinkKey(key)) {
    return decodeError(`permalink: unknown query parameter "${key}"`)
  }
}
```

And `applyPermalinkFromLocation` (`state.ts:503`, verbatim: `const decoded = decodeParams(new URLSearchParams(window.location.search))`) passes the *raw* `location.search` straight in — every key, unfiltered.

**Why it happens:** D-17 was written assuming `?methodology=1` simply "appends to the existing permalink" and "closing it strips the param" — true at the URL-string level, but not automatically true at the `decodeParams` level, because `decodeParams` has no concept of "an extra, permalink-unrelated flag." Worse: even if `methodology` were added to `PERMALINK_KEYS`, the required-key sweep (`permalink.ts:274-279`) would then make it a *required* key on every permalink, breaking every link that predates this phase.

**How to avoid:** read and strip `methodology` from a **copy** of `URLSearchParams` before calling `decodeParams`, entirely outside the `PERMALINK_KEYS` allow-list mechanism — e.g., in `applyPermalinkFromLocation`, do `const rawParams = new URLSearchParams(window.location.search); const methodologyRequested = rawParams.get('methodology'); rawParams.delete('methodology'); const decoded = decodeParams(rawParams)`. Closing the overlay then needs its own `history.replaceState` call that removes only `methodology` from the current URL, leaving every other param (and the run's `history.replaceState` cadence already established by `state.ts`'s existing flush logic) untouched.

**Warning signs:** any permalink carrying `?methodology=1` alongside a full run gets evicted with "permalink: unknown query parameter \"methodology\"" instead of opening the overlay — this is trivially testable and should be an explicit test case, not discovered in manual QA.

### Pitfall 3: APP-02's tier selector will silently do nothing to entry-date bounds unless `EntryDateControl.tsx` is fixed (newly found this session)

**What goes wrong:** `EntryDateControl.tsx:34` calls `resolveEntryDateBounds(bundle.manifest, request.symbol, request.dividendReinvest, 'strict')` — the fourth argument is the string literal `'strict'`, not the app's current tier selection:

```typescript
// EntryDateControl.tsx:29-35, verbatim
export function EntryDateControl(props: EntryDateControlProps) {
  const bounds = createMemo<EntryDateBoundsResult | null>(() => {
    const bundle = loadedBundle()
    if (bundle === null) return null
    const request = backtestRequest()
    return resolveEntryDateBounds(bundle.manifest, request.symbol, request.dividendReinvest, 'strict')
  })
```

`bounds.ts`'s own comment already anticipates this: *"D-09: Phase 4 pins 'strict' throughout, but the type carries both members from day one so Phase 5 adds a tier-selector control over an existing parameter rather than migrating one in"* (`bounds.ts:52-53`, quoted verbatim) — confirming this hardcoding is a known, deliberate placeholder Phase 4 left for Phase 5 to remove, not an accident.

**Why it happens:** `Tier` (`bounds.ts:54`, `export type Tier = 'strict' | 'extended'`) and `resolveEntryDateBounds`'s tier-aware signature (`bounds.ts:66-71`) already exist — the plumbing is there, but nothing in the app currently reads or stores a selected tier value distinct from the literal `'strict'`.

**How to avoid:** once APP-02 introduces a `tier` signal (likely alongside `backtestRequest()`'s other fields, or as its own store field feeding `buildKernelInputs`), `EntryDateControl.tsx` must read that live tier value instead of the literal, and its `SourceCitation` text (currently hardcoded `` `earliest available, ${backtestRequest().symbol} strict tier` `` at line 73) must interpolate the actual selected tier the same way. Any other control or computation that currently reads `'strict'` as a literal (grep for the string `'strict'` across `src/app/` before finalizing the plan) needs the same audit — this file is the one found this session, but it may not be the only one.

**Warning signs:** selecting the extended tier in the UI but the entry-date picker's `min` attribute still refuses dates before the strict tier's earliest date — this is the exact bug APP-02/CRED-02 exist to avoid (a tier selector that cannot reach the era it claims to unlock).

### Pitfall 4: D-23's "closes Phase 4's F-04" framing may already be satisfied — verify before re-implementing

**What goes wrong (if unverified):** a plan could re-implement default-entry-date resolution logic that already exists, wasting a task, or worse, could implement a second, slightly different resolution path that disagrees with the existing one.

**What's actually there:** `state.ts:87-98`'s `DEFAULT_REQUEST` seeds `entryDate: ''` as a sentinel (comment at `state.ts:81-83`: *"`entryDate` is resolved from the loaded manifest's `SPX/total-return` strict-tier `firstDate` in `initializeApp`, not hard-coded here"*), and `applyLoadedBundle` (function starting `state.ts:593`) resolves it for real at `state.ts:607-608`:

```typescript
// state.ts:607-608, verbatim
if (request.entryDate === '') {
  setRequestStore('entryDate', seriesEntry.tiers.strict.firstDate)
```

**How to avoid wasted work:** treat D-23 as **already substantially implemented** by Phase 4, and scope Phase 5's D-23-related work narrowly to (a) confirming this resolution still reads `'strict'` correctly once a tier selector exists (it should almost certainly stay pinned to the strict tier for the *default* landing run regardless of whatever tier a user later selects, per D-23's own "defensible in one sentence" framing — but this is a discretion call, not settled by this document), and (b) applying D-22's default-label-and-reset treatment to the entry-date control, which — per Pitfall 3 above and Pattern 4 above — does **not** currently exist for this field even though the underlying default-resolution mechanism does.

### Pitfall 5: The three Shapley cost mechanisms (§A1/A4/A6 in PITFALLS.md, per CONTEXT.md's canonical refs) must not silently re-derive numbers the kernel already gets right

**What goes wrong:** it is tempting, when building the non-compounding-arm cost formula (Pattern 1), to reach for a simplified or approximated version of the day-count math "since it's just an approximation anyway." That approximation then risks disagreeing with the kernel's own actual/360 and actual/365 conventions, producing an attribution that doesn't actually reconcile against the real run's own cost accrual pattern even though the Shapley *arithmetic* still sums correctly (efficiency only guarantees internal consistency between the 8 `v(S)` values, not that any one of them is a faithful non-compounded analogue of the kernel's convention).

**How to avoid:** reuse `FINANCING_DAY_COUNT_BASIS = 360` and `EXPENSE_DAY_COUNT_BASIS = 365` from `src/kernel/backtest.types.ts:95/101` (both re-declared as local constants in `backtest.ts:46/49` per that module's own "zero runtime imports" discipline — the non-compounding helper should import the *types.ts* constants, since it is not part of the zero-import-discipline kernel module itself) and the same `calendarDaysElapsed` array `buildKernelInputs` already produces, so the two conventions the methodology page must describe (D-18) are demonstrably the same two conventions used everywhere in the app, not a third approximation invented for attribution alone.

## Code Examples

### Code Example 1: Correctly zeroing financing for a counterfactual kernel arm

```typescript
// The naive fix (WRONG for a "no financing" counterfactual):
const noFinancingParams: KernelParams = { ...realParams, financingSpread: 0 }
// financingCost = value * (leverage - 1) * (shortRate[i] + 0) * (calendarGap / 360)
// -- still nonzero whenever shortRate[i] != 0, because the base short-rate cost of
// leverage is not "the spread", it's (leverage-1)*shortRate, entirely separate from
// params.financingSpread (backtest.ts:136).

// Correct: zero the per-bar rate array too, not just the spread param.
const zeroRateSeries: KernelSeries = {
  ...realSeries,
  shortRate: new Float64Array(realSeries.shortRate.length), // all zeros
}
const noFinancingParams: KernelParams = { ...realParams, financingSpread: 0 }
const noFinancingOutputs = allocateKernelOutputs(barCount) // fresh preallocated buffers, SIM-11
const noFinancingResult = runBacktest(noFinancingParams, zeroRateSeries, noFinancingOutputs)
// noFinancingResult.finalValue is now v({compounding, expense}) if expense stayed real,
// or v({compounding}) if expenseRatio is also zeroed in noFinancingParams.
```

Source: reasoning over `backtest.ts:136` (`const financingCost = value * (leverage - 1) * (rate + financingSpread) * (calendarGap / FINANCING_DAY_COUNT_BASIS)`, read and quoted in full above) and `backtest.types.ts:17-30`'s `KernelSeries.shortRate` field, both read this session. `[VERIFIED: src/kernel/backtest.ts:136; src/kernel/backtest.types.ts:20-23]`.

### Code Example 2: Reading the methodology overlay flag without breaking `decodeParams`

```typescript
// state.ts's applyPermalinkFromLocation, modified sketch:
function applyPermalinkFromLocation(): void {
  if (permalinkApplied) return
  permalinkApplied = true

  const rawParams = new URLSearchParams(window.location.search)
  const methodologyRequested = rawParams.get('methodology') !== null
  rawParams.delete('methodology') // NEW: stripped before decodeParams ever sees it

  const decoded = decodeParams(rawParams) // unchanged call, now never sees "methodology"
  // ... existing decode-result handling unchanged ...

  if (methodologyRequested) setMethodologyOverlayOpen(true) // new signal, drives the overlay
}
```

Closing the overlay must remove only `methodology` from the live URL via `history.replaceState`, using the same entry-replacing discipline `state.ts` already uses for run-parameter flushes (`state.ts:268`, `window.history.replaceState(null, '', newUrl)`), not a full page navigation.

Source: `permalink.ts:225-240` and `state.ts:503` (both quoted verbatim above), read this session. `[VERIFIED: src/app/permalink.ts:236-239; src/app/state.ts:503]`.

### Code Example 3: Existing default/reset pattern to generalize (D-22 template)

```typescript
// CostControls.tsx:75-76, 125-130 — the two-part pattern every other control needs:
const expenseRatioIsDefault = () => expenseRatioPercent() === DEFAULT_EXPENSE_RATIO_PERCENT

<Show
  when={expenseRatioIsDefault()}
  fallback={<SourceCitation text={userSuppliedExpenseRatioCitation()} />}
>
  <SourceCitation costParameterId="generic-3x-expense-ratio" />
</Show>
```

`[VERIFIED: src/app/components/ParameterColumn/CostControls.tsx:75-76,125-130]`.

### Code Example 4: `null`-gap technique already proven in this codebase, reusable for the naive ghost curve

```typescript
// EquityCurveChart.tsx:150-155, verbatim — the existing precedent for a uPlot series
// with intentional gaps, currently used for the ruin terminator, not the naive curve:
function buildTerminatorData(ys: Float64Array, ruined: boolean): (number | null)[] | undefined {
  if (!ruined || ys.length === 0) return undefined
  const data: (number | null)[] = new Array(ys.length).fill(null)
  data[ys.length - 1] = ys[ys.length - 1] ?? null
  return data
}
```

The naive ghost series needs the same `(number | null)[]` shape, but with `null` substituted at every index where the naive value is `<= 0` (rather than everywhere except one final index) — a different fill pattern, same underlying uPlot mechanism (`uPlot.AlignedData` tolerating `null` per-series, already exercised at `EquityCurveChart.tsx:210`).

`[VERIFIED: src/app/components/ResultColumn/EquityCurveChart.tsx:150-155,210]`.

## State of the Art

Not applicable in the usual "library X superseded library Y" sense — this phase adds no new library. The one relevant "state of the art" question is internal: Phase 4 left two known placeholders (`bounds.ts:52-53`'s comment about the hardcoded `'strict'`, and `DEFAULT_REQUEST.entryDate`'s empty-string sentinel) explicitly for Phase 5 to complete. Both are documented above (Pitfalls 3 and 4) rather than in this section, since they are intra-project sequencing facts, not external ecosystem shifts.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The non-compounding cost-deduction formula proposed for Shapley's compounding-off arms (Pattern 1) is the correct/only reasonable resolution of F-03 | Architecture Patterns §1 | If the planner or discuss-phase settles on a different non-compounding formula, every downstream attribution number (and any UI copy describing "how attribution is computed") changes — costly per D-03's own reversibility note, since these are the figures users screenshot |
| A2 | Shapley value's efficiency axiom is being applied correctly for a 3-player game (general cooperative-game-theory knowledge, not verified against a citable source this session) | Architecture Patterns §1 | If the weighting is wrong, ATTR-02's reconciliation ("without an unexplained residual") would silently fail on some runs — should be covered by a property-based test (fast-check) asserting the three shares always sum to `naive - actual` before this ships |
| A3 | An explicit reset button (rather than reusing each control's existing "clear" gesture) is the right UX for D-22's "offers a reset" on select/date-type controls | Architecture Patterns §4 | Low product risk, but inconsistent per-control UX if left to each control to decide independently; should be a single design decision made once in planning, not per-control |
| A4 | A tier selection should stay pinned to `'strict'` for the D-23 default *landing* run even after APP-02 adds a tier control, rather than the landing run itself becoming tier-selectable | Common Pitfalls §4 | If wrong, the "longest window the strict tier allows" rule (D-23) needs re-derivation for whichever tier becomes the landing default |

## Open Questions

1. **Does the Shapley non-compounding cost formula (Pattern 1) need to be locked as a Key Decision before implementation, given D-03's own "costly reversibility" note applies to the allocation *method* but this document's formula is a layer beneath that method?**
   - What we know: D-03 locks the *method* (Shapley over 3 factors). CONTEXT.md's F-03 explicitly says the *interpretation* of each non-compounding arm "is a modelling choice the researcher must state and justify on the CRED-04 page, not one to make silently in an implementation."
   - What's unclear: whether "stating and justifying on the methodology page" is sufficient process, or whether this specific formula should go through a discuss-phase checkpoint given its reversibility profile matches D-03's own (screenshot-quoted figures).
   - Recommendation: the planner should treat Pattern 1's formula as a proposal requiring explicit confirmation (checkpoint:human-verify or a discuss-phase follow-up) rather than silently building it, given CONTEXT.md's own emphasis on this exact risk.

2. **Should the D-09 validation section be its own permalinkable URL, and if so, does it reuse `PERMALINK_KEYS` or need its own smaller param set?**
   - What we know: CONTEXT.md flags this as "Not discussed; recommended" under Claude's Discretion. D-10 pins leverage/total-return-leg/window but leaves cost params live from the user's *current* run.
   - What's unclear: whether "the user's current run" for D-10's live cost-parameter pass-through implies the validation view should carry its own URL state (fund selection at minimum) distinct from the main run's permalink, or whether it silently follows whatever `backtestRequest()` currently holds without its own shareable state.
   - Recommendation: decide this before wiring the validation view's cost-parameter inputs, since it affects whether `PERMALINK_KEYS` needs a new key (fund selector) at all, and interacts with Pitfall 2's `decodeParams` allow-list mechanics the same way `methodology` does.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 `[VERIFIED: package.json]` |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npm test` (runs the `unit` project — Node, no browser) |
| Full suite command | `npm test && npm run test:app && npm run bench` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ATTR-01/02 | Shapley shares reconcile exactly to `naive - actual` for any params | unit + property (fast-check) | `vitest run tests/attribution/*.test.ts` | ❌ Wave 0 |
| ATTR-01/02 | Financing-zeroed counterfactual arm has zero financing cost regardless of `shortRate` | unit | `vitest run tests/attribution/*.test.ts` | ❌ Wave 0 |
| ATTR-03 | Naive ghost series renders `null` gaps exactly where naive value `<= 0` | unit (pure function, mirrors `log-axis-splits.ts`'s Node-testable-`.ts`-not-`.tsx` split) | `vitest run tests/app/*.test.ts` | ❌ Wave 0 |
| VALID-04 | Extracted helpers (`readSeriesLevels` etc.) produce identical results to the current private test-file copies | unit (regression against existing gate test) | `vitest run tests/validation/*.test.ts` | ✅ existing gate test is the reference oracle |
| VALID-04 | In-app tracking-error view matches `computeTrackingError`'s existing gate-test output for the same inputs | app/browser (Vitest browser mode) | `npm run test:app` | ❌ Wave 0 |
| CRED-01/16 | Every rendered provenance string traces to a manifest field (D-16's build-failing test) | unit | `vitest run tests/app/*.test.ts` | ❌ Wave 0 |
| CRED-03 | Committed generated-module bias figure matches a freshly recomputed downsample/interpolate/remeasure pass (pinning test, Pattern 2) | unit | `vitest run tests/validation/*.test.ts` | ❌ Wave 0 |
| APP-02 | `EntryDateControl` bounds respond to the selected tier, not a hardcoded `'strict'` | app/browser | `npm run test:app` | ❌ Wave 0 (regression test for Pitfall 3) |
| PERF-07b | Coalesced recompute stays under 16ms with attribution's extra evaluations live | bench (Playwright-backed) | `npm run bench` | ✅ `bench/perf-07.bench.test.ts` already measures this generically — re-run against the phase-5 build, no new bench file required unless attribution runs outside `scheduleRun`'s existing marks |

### Sampling Rate
- **Per task commit:** `npm test` (Node unit project — fast, covers attribution arithmetic, extraction helpers, generated-module pinning test)
- **Per wave merge:** `npm test && npm run test:app` (adds browser-mode coverage for the new UI surfaces)
- **Phase gate:** `npm run bench` must stay green on `PERF-07b` (existing test, no new file needed unless the attribution evaluations happen outside `scheduleRun`'s current `performance.mark` boundaries — if a plan adds attribution as a *separate* scheduled computation rather than inside the existing coalesced recompute, `bench/perf-07.bench.test.ts`'s marks will not capture it, silently under-measuring PERF-07b's re-measurement requirement)

### Wave 0 Gaps
- [ ] `tests/attribution/shapley.test.ts` (or similar) — covers ATTR-01/02, the Shapley reconciliation property, and Code Example 1's financing-zeroing correctness
- [ ] `tests/app/naive-ghost-series.test.ts` — covers ATTR-03's `null`-gap construction (Pitfall 1 / Code Example 4)
- [ ] `src/validation/synthetic-comparison.ts` (extraction target, Pattern 5) plus a regression test asserting identical output to the current private test-file helpers, before VALID-04's app-facing view is built on top of it
- [ ] `tests/app/provenance-strip.test.ts` — covers CRED-01/D-16's manifest-traceability assertion
- [ ] `tests/validation/extended-tier-bias.test.ts` (pinning test) — covers CRED-03/D-21, once `scripts/measure-extended-tier-bias.ts` (or equivalent) and its generated module exist
- [ ] `tests/app/permalink-methodology.test.ts` — covers D-17's `?methodology=1` handling and specifically the Pitfall 2 regression (a permalink with `methodology=1` alongside a full run must NOT evict)
- [ ] `tests/app/entry-date-tier.test.ts` — covers Pitfall 3's regression directly (extended-tier selection must widen `EntryDateControl`'s min bound)

## Security Domain

`security_enforcement` is not set to `false` in `.planning/config.json` (not independently re-checked this session, but no prior phase recorded disabling it) — treated as enabled per the default.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth surface anywhere in this app (APP-03: no backend) |
| V3 Session Management | No | No sessions; state lives entirely in the URL and in-memory signals |
| V4 Access Control | No | No user roles or protected resources |
| V5 Input Validation | Yes | `decodeParams`'s existing allow-list-by-name discipline (`permalink.ts:233-240`, already `[VERIFIED]` this session) is the standard this phase must extend, not weaken, when adding the `methodology` flag (Pitfall 2) — the flag must be read via an explicit, named check (`rawParams.get('methodology')`), never a dynamic/bracket property assignment from a URL-derived key, matching the existing file's own stated discipline: *"no dynamic property assignment from a URL-derived key ever happens"* (`permalink.ts:25`, paraphrased from the header comment already quoted in full above) |
| V6 Cryptography | No | No crypto in this phase; `computeBundleVersion`'s SHA-256 use (data layer, unrelated to this phase) is pre-existing and untouched |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A hand-crafted permalink carrying an unrecognized key (prototype-pollution-shaped key like `__proto__`, or simply garbage) | Tampering | Already mitigated by `decodeParams`'s allow-list (`isPermalinkKey`, `permalink.ts:164`) — this phase's `methodology` handling must be implemented as a second, equally strict named check, not a general "pass through any extra key" relaxation |
| A hand-crafted permalink with `methodology` present alongside a tampered/invalid run-parameter set, attempting to use the overlay's "run behind it is untouched" framing to mask an otherwise-evicted run | Tampering / Information Disclosure (minor) | The overlay open/close logic must not short-circuit `decodeParams`'s own validation of the remaining params — `methodology` should be stripped and read *before* decode, but decode's pass/fail result for everything else must still govern whether a run renders, exactly as today |

## Sources

### Primary (HIGH confidence — code read directly this session via `Read`/`Bash cat -n`, with line citations)
- `src/kernel/backtest.ts` (full file) — day-count bases, financing/expense formulas, ruin/contribution ordering
- `src/kernel/backtest.types.ts` (full file) — `KernelSeries`/`KernelParams`/`KernelOutputs`/`KernelResult` shapes, day-count constants
- `src/validation/tracking-error.ts` (full file) — `computeTrackingError`, both D-11 gates, precision discipline
- `src/validation/cost-parameters.ts` (full file) — `COST_PARAMETERS`, `TOLERANCE_MECHANISMS`, no-fitting protocol header
- `tests/validation/upro-tqqq-gate.test.ts` (full file, 420 lines) — every private helper F-01 names, both era boundaries, the gate's own no-fitting-protocol restatement
- `tools/bundle-compiler/src/manifest.ts` (full file) — `Manifest`/`ManifestSeries` shape, `buildManifest`, `writeManifest`
- `tools/bundle-compiler/src/seams.ts` (full file) — `SeamRecord`, `SeamCollector`
- `src/data/bundle-source.ts` (full file) — `LoadedBundle`, `loadBundleFromSource`
- `src/metrics/format.ts` (full file) — existing formatter contract, its explicit gaps (no signed-currency variant yet)
- `src/app/permalink.ts` (lines 1-110, 225-300) — `PERMALINK_KEYS`, `encodeParams`/`decodeParams`, the allow-list rejection mechanism (Pitfall 2)
- `src/app/state.ts` (lines 80-100, 375-460, 525-620) — `DEFAULT_REQUEST`, `scheduleRun`'s rAF coalescing and `performance.mark` boundaries, `applyPermalinkFromLocation`, `applyLoadedBundle`'s entry-date resolution
- `src/app/bounds.ts` (lines 1-90) — `Tier`, `resolveEntryDateBounds`, `listSymbols`, `dividendModesFor`
- `src/app/components/ParameterColumn/SourceCitation.tsx`, `CostControls.tsx`, `EntryDateControl.tsx` (full files) — the D-22 default/reset template and the confirmed Pitfall 3 hardcoding
- `src/app/components/ResultColumn/MetricsPanel.tsx`, `EquityCurveChart.tsx`, `log-axis-splits.ts`, `ValidationExplanation.tsx` (full files) — existing panel/chart patterns to extend
- `perf-budgets.ts` (PERF-07b entry, lines ~163-170) — budget/threshold/anchor for the re-measurement
- `bench/perf-07.bench.test.ts` (full file) — the exact existing bench test PERF-07b's re-measurement runs through
- `tools/bundle-compiler/src/compile.ts` (lines 192-217, 480-487) — `writeGeneratedPointerModule`, the generated-module write-then-rename precedent for Pattern 2
- `src/data-bundle.generated.ts` (full file) — the existing generated-module output shape
- `package.json` (full file) — confirmed no new dependency is needed; all versions pinned and unchanged from Phase 4

### Secondary (MEDIUM confidence)
- CONTEXT.md's own canonical references to `.planning/research/PITFALLS.md` §A1/A2/A4/A6/A8/A9/B2/C4/D2/E6/G1/G2/G3 and `.planning/phases/03-.../03-GATE-DIAGNOSIS.md` — not independently re-read this session (already synthesized into CONTEXT.md's locked decisions); treated as authoritative per CONTEXT.md's own citation, not re-verified

### Tertiary (LOW confidence / this document's own synthesis, not drawn from any source)
- Pattern 1's specific non-compounding cost-deduction formula (Shapley's compounding-off arms) — genuinely new arithmetic proposed to resolve F-03, tagged `[ASSUMED]` throughout and flagged as Open Question 1
- The general Shapley-value efficiency-axiom claim — standard game theory, not verified against a specific citable source this session

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependency; every version confirmed directly against `package.json` this session
- Architecture (wiring/extraction patterns): HIGH — grounded in code read line-by-line this session, with verbatim quotes
- Architecture (Shapley non-compounding cost formula): MEDIUM — internally consistent original synthesis resolving an explicitly-flagged open question (F-03), not verified against an external or existing-code source
- Pitfalls (permalink collision, tier hardcoding, F-04 already-closed status): HIGH — all three newly discovered this session via direct code reading, not present in CONTEXT.md, independently verifiable by any reader at the cited line numbers
- Security: MEDIUM — no new attack surface beyond extending an already-verified pattern (`decodeParams`'s allow-list), but the `methodology`-flag handling is new code not yet written or tested

**Research date:** 2026-08-20
**Valid until:** 30 days (no fast-moving external dependency; the codebase itself is the primary source and could shift under active development — re-verify line citations if Phase 5 planning is delayed materially past this date)
