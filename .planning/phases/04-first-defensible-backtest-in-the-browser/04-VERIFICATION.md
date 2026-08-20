---
phase: 04-first-defensible-backtest-in-the-browser
verified: 2026-08-20T00:23:14Z
status: human_needed
score: 15/22 must-haves verified
behavior_unverified: 7
overrides_applied: 0
human_verification:
  - test: "At the narrowest supported viewport (~320px), drive a 20x leverage run over the full bundled history (a large final-multiple / long-duration IRR headline) and observe the 28px IRR headline and the CAGR secondary row."
    expected: "The headline value never wraps or clips, and a wrapping secondary metric does not push the panel outside the screenshot region (UI-SPEC E7 overflow, 04-02-PLAN backstop)."
    why_human: "No automated test exercises text-wrap/clip behavior at 320px for the metrics panel; CSS relies on default block wrapping with no assertion of the rendered glyph boundaries."
  - test: "At the narrowest supported viewport, force a ruined run (e.g. leverage 20 over the SPX window including 2008/2020) and observe the RuinBanner's full sentence, including the interpolated ISO ruin date."
    expected: "The banner text wraps across lines rather than clipping or truncating the ruin date (UI-SPEC E8 overflow, 04-02-PLAN backstop)."
    why_human: "No automated test exercises text-wrap/clip behavior for RuinBanner at 320px."
  - test: "At the narrowest supported viewport, select the bundled symbol with the longest label/ticker and observe the parameter column width and the symbol label's layout."
    expected: "The longest symbol label does not force the fixed-width parameter column wider than its design width (UI-SPEC E1 overflow, 04-04-PLAN backstop)."
    why_human: "No automated test measures the parameter column's rendered width against the longest symbol label at 320px."
  - test: "At the narrowest supported viewport, observe a symbol label together with its inline SourceCitation text beside SymbolControl."
    expected: "The label plus citation wraps onto additional lines rather than clipping or overlapping (UI-SPEC E1 long-text, 04-04-PLAN backstop)."
    why_human: "No automated test asserts wrap-vs-clip behavior for this combination at 320px."
  - test: "At the narrowest supported viewport, observe every cost-control citation string, including the financing-spread midpoint-of-range wording (the longest sourced citation in the app)."
    expected: "Citation strings wrap under their control rather than clipping/colliding with adjacent controls, and the longest one reflows to at most two lines without pushing the Copy link button below the fold (UI-SPEC E5 overflow/long-text, 04-05-PLAN backstop x2)."
    why_human: "No automated test asserts citation wrap behavior or measures line count / Copy-link-button position at 320px."
  - test: "At the narrowest supported viewport, produce a state with two or more simultaneous ValidationExplanation variants stacked (e.g. a bundle-version mismatch plus a cross-field caveat) and observe the layout."
    expected: "The stacked explanation list does not push the chart out of the D-20 screenshot region (UI-SPEC E9 overflow, 04-05-PLAN backstop)."
    why_human: "No automated test measures whether a multi-variant ValidationExplanation stack displaces the screenshot region at 320px; screenshot-region.browser.test.ts only covers the normal/ruined happy-path states, not a stacked-explanation state."
---

# Phase 4: First Defensible Backtest in the Browser Verification Report

**Phase Goal:** A person can open the app, describe a real leveraged position, and get an outcome they can hand to someone else as a link.
**Verified:** 2026-08-20T00:23:14Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Method

Read all 8 PLAN.md/SUMMARY.md pairs, 04-CONTEXT.md, 04-UI-SPEC.md, 04-RESEARCH.md, and REQUIREMENTS.md.
Cross-checked every SUMMARY claim against the actual source (`src/app/**`, `src/metrics/**`,
`src/kernel/backtest.ts`, `src/data/bundle-source.ts`) rather than trusting the prose. Ran the
specific test files backing each must-have individually (not just relying on the orchestrator's
whole-suite run) — `permalink.browser.test.ts`, `permalink.test.ts`, `validation.browser.test.ts`,
`metrics.browser.test.ts`, `controls.browser.test.ts`, `tracer.browser.test.ts`,
`theme.browser.test.ts`, `offline.browser.test.ts`, `screenshot-region.browser.test.ts`,
`static-build.test.ts`, `tests/metrics/*`, `tests/kernel/drawdown.test.ts` — all pass. Confirmed
`npm run typecheck` clean. Cross-checked the five documented mid-phase deviations against the
current HEAD (`5f974b3`) rather than the (partly superseded) PLAN text.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The app is a fully static build; opening it fetches the committed bundle and computes a real result with no backend and no runtime request to another origin (APP-01, APP-03) | ✓ VERIFIED | `src/app/App.tsx`, `src/data/bundle-source.ts` (`loadBundleFromSource`, zero-copy typed-array decode, no per-row parsing); `tests/app/static-build.test.ts` mechanically scans `dist/` for external URLs against a reasoned 4-entry allow-list, passes |
| 2 | Data loads via one shared, node-free decode path reachable from the browser bundle graph, and the app works fully offline after first load, for every bundled symbol (DATA-08) | ✓ VERIFIED | `grep -c 'node:' src/data/kernel-inputs.ts src/data/load-bundle-browser.ts` = 0; `vite.config.ts` VitePWA precaches 19 entries (13 `.bin` + manifest + shell); `tests/app/offline.browser.test.ts` passes (network disabled, non-default symbol computes) |
| 3 | Every backtest parameter (symbol, leverage, entry date, holding mode, contributions, expense ratio, financing spread) is a real control wired through `updateBacktestRequest`/`scheduleRun`; invalid or impossible combinations are explained, never silently coerced (APP-01, APP-04) | ✓ VERIFIED | `src/app/bounds.ts` (manifest-derived, no hardcoded symbol list); `src/app/components/ParameterColumn/*.tsx`; `tests/app/controls.browser.test.ts` (11/11), `tests/app/validation.browser.test.ts` (8/8) pass |
| 4 | IRR (bounded bisection, XIRR-style) is the permanent headline metric, identity never changes with contribution state (METR-01) | ✓ VERIFIED | `src/metrics/irr.ts`, `MetricsPanel.tsx` headline label is a static string; `tests/metrics/irr.test.ts`, `tests/app/metrics.browser.test.ts` pass |
| 5 | CAGR is available but carries a "misleading with contributions" qualifier when contributions are non-zero (METR-02) | ✓ VERIFIED | `MetricsPanel.tsx` lines 46–56 (`Show when={contributionAmount !== 0}`); test passes |
| 6 | Maximum drawdown computed in-loop (no new array), exactly 0/1 at boundaries, strictly between for a real multi-peak run (METR-03) | ✓ VERIFIED | `src/kernel/backtest.ts`; `tests/kernel/drawdown.test.ts` (5/5) |
| 7 | Final value as a multiple of total contributed, with dropped-post-ruin contributions kept as a separate line, never folded into the ratio (METR-04) | ✓ VERIFIED | `MetricsPanel.tsx` lines 63–75; format contract in `src/metrics/format.ts` |
| 8 | A ruined run is a categorical banner state, not a badge beside normal numbers, and the chart never plots the ruin bar's clamped zero on a log scale (METR-05) | ✓ VERIFIED | `RuinBanner.tsx`, `EquityCurveChart.tsx` terminator series, `App.tsx` places banner above metrics; `tests/app/metrics.browser.test.ts` ruin case passes |
| 9 | A persistent, visible log/linear scale toggle defaults to log, using uPlot's native `distr` (never a hand-transformed value) (VIZ-08) | ✓ VERIFIED | `LogScaleToggle.tsx`; `grep -c distr EquityCurveChart.tsx` ≥ 1, `grep -c 'Math.log'` = 0 |
| 10 | Both light and dark palettes ship; theme follows `prefers-color-scheme` with a manual override; the canvas is explicitly repainted on theme change (no free canvas theming) (VIZ-11) | ✓ VERIFIED | `src/app/theme.ts`, `ThemeToggle.tsx`, `EquityCurveChart.tsx` `onThemeChange`; `tests/app/theme.browser.test.ts` (5/5, including a sampled-pixel repaint assertion) |
| 11 | Every parameter is encoded in the URL as flat, fixed-order query params; unknown/duplicate/missing keys and an unrecognized `holdMode` are rejected loudly, never defaulted; `decode(encode(x))` round-trips exactly (SHARE-01, SHARE-03) | ✓ VERIFIED | `src/app/permalink.ts` (15 keys, allow-list decode, no dynamic property assignment); `tests/app/permalink.test.ts` (23/23, fast-check round-trip + golden URLs); `tests/app/permalink.browser.test.ts` (8/8, fresh-browser reproduction) |
| 12 | The URL carries the deployed data-bundle version; a mismatch computes against the deployed bundle and banners both versions (SHARE-02) | ✓ VERIFIED | `BundleVersionBanner.tsx`, `permalink.browser.test.ts`'s mismatch-banner case passes |
| 13 | Copying the link can never yield a stale URL, even though the URL write is debounced for PERF-07 (mid-phase regression fix, gap-closure) | ✓ VERIFIED | `CopyLinkButton.tsx` calls `flushPermalinkUrl()` synchronously before reading `window.location.href`; `visibilitychange`/`pagehide` listeners also flush; `permalink.browser.test.ts`'s scrub/flush and coalesced-`replaceState` cases pass |
| 14 | No main-thread task exceeds 50ms during a real slider drag; the coalesced recompute stays well under the 16ms frame budget (PERF-07) | ✓ VERIFIED | `.bench/bench-results.json`: PERF-07a 0.00ms/50ms pass, PERF-07b 4.71ms/16ms pass (normalized); `bench/perf-07.bench.test.ts` drives a real Playwright pointer drag, not synthetic events |
| 15 | Cold load reaches interactive under 1500ms and data-ready under 1000ms; warm load under 300ms, measured against the real production preview build (PERF-08) | ✓ VERIFIED | `.bench/bench-results.json`: PERF-08a 209.08ms/1500ms, PERF-08b 209.08ms/1000ms, PERF-08c 108.07ms/300ms, all pass, `source: production` |
| 16 | At the narrowest supported viewport, the 28px IRR headline and CAGR secondary row do not wrap/clip for extreme values, and a wrapping secondary metric does not push the panel out of the screenshot region (UI-SPEC E7 overflow) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Component/CSS present, no `overflow:hidden`/`nowrap` on metric rows (default wrap applies), but no test measures actual rendered glyph boundaries at 320px. `04-02-PLAN.md` declared this `verification: backstop` |
| 17 | At the narrowest supported viewport, the ruin banner wraps and never clips the interpolated ISO ruin date (UI-SPEC E8 overflow) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Same as above; `04-02-PLAN.md` backstop, no automated coverage found |
| 18 | At the narrowest supported width, the longest bundled symbol label does not force the fixed-width parameter column wider (UI-SPEC E1 overflow) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `04-04-PLAN.md` backstop, no automated coverage found |
| 19 | At the narrowest supported width, a symbol label plus its inline source citation wraps rather than clips (UI-SPEC E1 long-text) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `04-04-PLAN.md` backstop, no automated coverage found |
| 20 | At the narrowest supported width, citation strings (including the longest, the financing-spread midpoint-of-range wording) wrap under their control without clipping or pushing the Copy link button below the fold (UI-SPEC E5 overflow/long-text) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `04-05-PLAN.md` backstop (two items), no automated coverage found |
| 21 | A stacked set of simultaneous ValidationExplanation variants does not push the chart out of the D-20 screenshot region (UI-SPEC E9 overflow) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `04-05-PLAN.md` backstop; `screenshot-region.browser.test.ts` covers only the normal/ruined happy-path states, not a multi-variant ValidationExplanation stack |
| 22 | A PERF-08 cold-load measurement runs with no other timed measurement concurrent, and the preview server always closes (PERF-08 concurrency edge) | ✓ VERIFIED | `bench/preview-server.ts`: `try { ... } finally { await server.close() }` confirmed by direct code read; PERF-08/07 bench files run sequentially in one process |

**Score:** 15/22 truths verified (7 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/data/bundle-source.ts` | One shared assembly loop (D-02) | ✓ VERIFIED | `loadBundleFromSource`, no `node:` import, delegates to header-decode/`calendarView` — zero per-row parsing |
| `src/app/permalink.ts` | Canonical two-way codec (D-13–D-16) | ✓ VERIFIED | `PERMALINK_KEYS` (15 keys), exhaustive `encodeField` switch, total `decodeParams` |
| `src/app/components/ParameterColumn/CopyLinkButton.tsx` | The phase's one explicit action | ✓ VERIFIED | Disabled until a result exists; flushes debounced URL sync before copy |
| `src/app/components/ResultColumn/BundleVersionBanner.tsx` | D-15 mismatch notice | ✓ VERIFIED | Pure function filling `ValidationExplanation`'s reserved slot |
| `bench/preview-server.ts`, `bench/perf-08.bench.test.ts`, `bench/perf-07.bench.test.ts` | Real production-build measurement harnesses | ✓ VERIFIED | `source: 'production'`, real Playwright pointer drag, `withPreviewServer` try/finally |
| `src/app/theme.ts`, `ThemeToggle.tsx` | prefers-color-scheme + override (D-19) | ✓ VERIFIED | `resolveTheme`/`setThemeOverride`/`onThemeChange`; explicit chart repaint |
| `tests/app/static-build.test.ts` | APP-03 mechanical gate | ✓ VERIFIED | Scans emitted `dist/` for external URLs, 4/4 tests pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `CopyLinkButton.tsx` | `state.ts` | `flushPermalinkUrl()` called before reading `window.location.href` | ✓ WIRED | Confirmed by direct source read + `permalink.browser.test.ts` |
| `state.ts` (`writePermalinkUrl`) | `permalink.ts` (`encodeParams`) | `history.replaceState`, never `pushState` | ✓ WIRED | `grep -rn 'pushState' src/app` empty; `replaceState` count 3 in `state.ts` |
| `state.ts` (`applyPermalinkFromLocation`) | `permalink.ts` (`decodeParams`) | Boot-time decode, once per module lifetime | ✓ WIRED | `permalink.browser.test.ts` fresh-load reproduction case passes |
| `EquityCurveChart.tsx` | `theme.ts` | `onThemeChange` triggers `rebuildChart()` | ✓ WIRED | `theme.browser.test.ts` sampled-pixel repaint assertion passes |
| `HoldingModeControl.tsx` | `state.ts` (`scheduleRun`) | Fixed-period overrun throw retried with `holdingPeriodBars: null`, caveat rendered verbatim | ✓ WIRED | `validation.browser.test.ts` overrun case passes |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `SymbolControl.tsx` (`listSymbols`) | symbol option list | `manifest.series[].scope`, sorted ascending | Yes | ✓ FLOWING |
| `EquityCurveChart.tsx` | plotted `[xs, ys]` | `KernelInputs.outputs.outValue` from a real `runBacktest` call | Yes | ✓ FLOWING |
| `MetricsPanel.tsx` | IRR/CAGR/drawdown/multiple | `computeDerivedMetrics` over the same `KernelResult` | Yes | ✓ FLOWING |
| `CopyLinkButton.tsx` fallback field | `failedUrl()` | `window.location.href` at copy time | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Permalink round-trip + goldens | `npx vitest run tests/app/permalink.test.ts` | 23/23 pass | ✓ PASS |
| Fresh-browser permalink reproduction, no-stale-link-on-copy | `npx vitest run --project app tests/app/permalink.browser.test.ts` | 8/8 pass | ✓ PASS |
| Metrics/ruin/scale-toggle browser suite | `npx vitest run --project app tests/app/metrics.browser.test.ts` | included in 20/20 pass (with controls/tracer) | ✓ PASS |
| Controls (symbol/date/leverage) browser suite | `npx vitest run --project app tests/app/controls.browser.test.ts` | included in 20/20 pass | ✓ PASS |
| Tracer end-to-end + y-axis gutter regressions | `npx vitest run --project app tests/app/tracer.browser.test.ts` | 5/5 pass | ✓ PASS |
| Validation/explanation-surface browser suite | `npx vitest run --project app tests/app/validation.browser.test.ts` | 8/8 pass | ✓ PASS |
| Theme/offline/screenshot-region browser suite | `npx vitest run --project app tests/app/theme.browser.test.ts tests/app/offline.browser.test.ts tests/app/screenshot-region.browser.test.ts` | 10/10 pass | ✓ PASS |
| Static-build APP-03 gate | `npx vitest run tests/app/static-build.test.ts` | 4/4 pass | ✓ PASS |
| Metrics/drawdown unit suite | `npx vitest run tests/metrics/ tests/kernel/drawdown.test.ts` | 22/22 pass | ✓ PASS |
| Typecheck | `npm run typecheck` | clean | ✓ PASS |

### Probe Execution

Not applicable — this phase has no `scripts/*/tests/probe-*.sh` convention; its equivalent is the
`npm run bench` harness, already reported under Behavioral Spot-Checks / orchestrator state (PERF-07a/b,
PERF-08a/b/c all `pass`, corroborated directly from `.bench/bench-results.json`).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|--------------|--------|----------|
| APP-01 | 04-04 | Symbol select from bundled universe | ✓ SATISFIED | `bounds.ts`/`SymbolControl.tsx`; REQUIREMENTS.md checkbox `[x]`, table `Complete` |
| APP-03 | 04-01, 04-03, 04-08 | Fully static build, no backend | ✓ SATISFIED | `static-build.test.ts`; REQUIREMENTS.md `[x]`, `Complete` |
| APP-04 | 04-04, 04-05 | Invalid combos prevented/explained | ✓ SATISFIED | `ValidationExplanation.tsx`; REQUIREMENTS.md `[x]`, `Complete` |
| DATA-08 | 04-01, 04-04, 04-08 | Typed-array decode, offline after load | ✓ SATISFIED | `bundle-source.ts`, `offline.browser.test.ts`; REQUIREMENTS.md `[x]`, `Complete` |
| METR-01 | 04-02 | IRR default annualized metric | ✓ SATISFIED | `irr.ts`, `MetricsPanel.tsx`; REQUIREMENTS.md `[x]`, `Complete` |
| METR-02 | 04-02 | CAGR suppressed/qualified | ✓ SATISFIED | `MetricsPanel.tsx`; REQUIREMENTS.md `[x]`, `Complete` |
| METR-03 | 04-02 | Max drawdown | ✓ SATISFIED | `backtest.ts`, `drawdown.test.ts`; REQUIREMENTS.md `[x]`, `Complete` |
| METR-04 | 04-02 | Final value multiple | ✓ SATISFIED | `MetricsPanel.tsx`; REQUIREMENTS.md `[x]`, `Complete` |
| METR-05 | 04-02 | Ruin flag as categorical outcome | ✓ SATISFIED | `RuinBanner.tsx`; REQUIREMENTS.md `[x]`, `Complete` |
| VIZ-08 | 04-01, 04-02 | Log scale toggle, visible | ✓ SATISFIED | `LogScaleToggle.tsx`; REQUIREMENTS.md `[x]`, `Complete` |
| VIZ-11 | 04-08 | Legible in light and dark | ✓ SATISFIED (implementation) | `theme.ts`, `theme.browser.test.ts` — **but REQUIREMENTS.md still shows `[ ]` unchecked and `Pending` in the traceability table** |
| SHARE-01 | 04-07 | Every parameter in URL | ✓ SATISFIED (implementation) | `permalink.ts`, `permalink.test.ts` — **but REQUIREMENTS.md still shows `[ ]` unchecked and `Pending`** |
| SHARE-02 | 04-07 | URL carries bundle version | ✓ SATISFIED (implementation) | `BundleVersionBanner.tsx` — **but REQUIREMENTS.md still shows `[ ]` unchecked and `Pending`** |
| SHARE-03 | 04-07 | Determinism test | ✓ SATISFIED (implementation) | fast-check round-trip + golden URLs in `permalink.test.ts` — **but REQUIREMENTS.md still shows `[ ]` unchecked and `Pending`** |
| PERF-07 | 04-06 | No main-thread task > 50ms | ✓ SATISFIED (implementation) | `.bench/bench-results.json` PERF-07a/07b both `pass` — **but REQUIREMENTS.md still shows `[ ]` unchecked and table `Pending`** |
| PERF-08 | 04-03 | Cold/warm load budgets | ✓ SATISFIED | `.bench/bench-results.json` PERF-08a/08b/08c all `pass`; REQUIREMENTS.md `[x]`, `Complete` |

No orphaned requirements: every ID in `.planning/REQUIREMENTS.md`'s Phase 4 traceability rows appears
in exactly one plan's `requirements:` frontmatter.

### Anti-Patterns Found

None. Scanned every file touched in Phase 4 (`src/app/**`, `src/metrics/**`,
`src/kernel/backtest.ts`, `src/data/bundle-source.ts`, `src/data/load-bundle-*.ts`) for
`TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER`, `console.log`, and hardcoded-empty-data stub patterns. All
"placeholder"/"not available" hits are legitimate copy (an `n/a` formatter fallback, an inline
"total return not available for this symbol" reason string) rather than unfinished code.

## Documentation Gap (not a functional gap)

`.planning/REQUIREMENTS.md` was updated for APP-01/APP-03/APP-04/DATA-08/METR-01–05/VIZ-08/PERF-08
(commits `b9eaf95`, `f14d70a`, `b035211`, `0b8d56e`) but was **not** updated after plans 04-05
through 04-08 landed. Five requirement checkboxes and traceability-table rows still read
`[ ]`/`Pending` despite the underlying functionality being real, tested, and passing:
**VIZ-11, SHARE-01, SHARE-02, SHARE-03, PERF-07**. This is a stale-bookkeeping issue, not a
functional one — every one of the five is independently verified above — but it should be closed
(checkbox + table row) before the phase is marked done, since the next phase's planner reads this
file, not the source, to know what already exists.

## Human Verification Required

Seven UI-SPEC "backstop" must-haves, declared by their own PLAN.md frontmatter as
`verification: backstop` (i.e., the plan authors already flagged these as not mechanically
verifiable and deferred them to human judgment), remain unclosed by any automated test. All are
narrow-viewport (≈320px) text-wrap-vs-clip checks. See the `human_verification` list in this
file's frontmatter for the full seven items with exact test/expected/why-human detail. Summary:

1. IRR headline / CAGR secondary row wrap at 320px for extreme values (UI-SPEC E7 overflow)
2. Ruin banner wrap at 320px (UI-SPEC E8 overflow)
3. Longest symbol label does not widen the parameter column at 320px (UI-SPEC E1 overflow)
4. Symbol label + citation wraps rather than clips at 320px (UI-SPEC E1 long-text)
5. Cost-control citation strings wrap without clipping/colliding, longest one stays ≤2 lines and doesn't push Copy link below the fold (UI-SPEC E5 overflow/long-text)
6. A stacked multi-variant ValidationExplanation does not push the chart out of the screenshot region (UI-SPEC E9 overflow)

(Item 5 bundles two PLAN-declared backstop items sharing one test scenario.)

## Gaps Summary

No blocking gaps. All 16 phase requirement IDs (APP-01, APP-03, APP-04, DATA-08, METR-01–05,
VIZ-08, VIZ-11, SHARE-01–03, PERF-07, PERF-08) are implemented, wired, and covered by passing
tests or measured, passing bench figures. The five documented mid-phase deviations (hold-to-today
→ hold-to-end-of-data rename, the 14/15-key permalink contract with `holdMode=end-of-data`, the
y-axis gutter DPR fix, the deterministic app-test suite, and the PERF-07 permalink-debounce fix
plus its no-stale-link correctness guarantee) were all independently confirmed against the current
HEAD, not taken on the SUMMARYs' word.

Two non-blocking items remain:

- **Documentation gap:** REQUIREMENTS.md needs its checkboxes/table updated for VIZ-11, SHARE-01,
  SHARE-02, SHARE-03, PERF-07 (functionally complete, bookkeeping stale).
- **Human verification:** 7 narrow-viewport text-wrap/clip checks that the plans themselves marked
  `backstop` (not mechanically verifiable) and that no later plan happened to cover incidentally.

---

*Verified: 2026-08-20T00:23:14Z*
*Verifier: Claude (gsd-verifier)*
