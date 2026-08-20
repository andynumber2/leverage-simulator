---
phase: 04-first-defensible-backtest-in-the-browser
verified: 2026-08-20T04:18:16Z
status: passed
score: 22/22 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 15/22
  gaps_closed:
    - "IRR headline / CAGR secondary at 320px do not wrap/clip (UI-SPEC E7 overflow)"
    - "Ruin banner wraps rather than clips the ISO ruin date at 320px (UI-SPEC E8 overflow)"
    - "Longest bundled symbol label does not widen the fixed parameter column at 320px (UI-SPEC E1 overflow)"
    - "Symbol label plus inline SourceCitation wraps rather than clips at 320px (UI-SPEC E1 long-text)"
    - "Cost-control citations wrap without clipping/colliding, Copy link stays above the fold at 320px (UI-SPEC E5 overflow/long-text)"
    - "A stacked ValidationExplanation set does not push the chart out of the D-20 screenshot region at 320px (UI-SPEC E9 overflow)"
  gaps_remaining: []
  regressions: []
---

# Phase 4: First Defensible Backtest in the Browser Verification Report

**Phase Goal:** A person can open the app, describe a real leveraged position, and get an outcome they can hand to someone else as a link.
**Verified:** 2026-08-20T04:18:16Z
**Status:** passed
**Re-verification:** Yes — after gap closure. Previous run (2026-08-20T00:23:14Z) returned
`human_needed`, 15/22 verified, 7 present-but-behavior-unverified.

## Method

Did not trust the prior report, the SUMMARYs, or the orchestrator's stated gate results. For
every one of the 22 previously-established must-haves — not only the 7 that were outstanding —
re-checked the backing source under `src/app/**`, `src/metrics/**`, `src/kernel/backtest.ts`,
`src/data/bundle-source.ts` directly, and re-ran the specific test file(s) behind each claim
myself rather than reading a prior pass/fail number. Ran `npm run typecheck`, `npm test`, and
`npm run test:app` myself and confirmed they match what the orchestrator reported (546/546,
53/53, typecheck clean) rather than accepting those figures on trust. Specifically re-ran every
chart-dependent test (`metrics.browser.test.ts`, `tracer.browser.test.ts`,
`screenshot-region.browser.test.ts`, `theme.browser.test.ts`) because the log-axis fix touched
`EquityCurveChart.tsx`, which those must-haves all depend on. Read the new
`tests/app/narrow-viewport.browser.test.ts`, `log-axis-splits.ts`, `log-axis-splits.test.ts`, and
`log-axis-splits.browser.test.ts` in full and ran each. Diffed commit `425143d` against
`04-UI-SPEC.md` and `src/validation/cost-parameters.ts` directly to confirm the E5 long-text
ceiling amendment is real and its stated reason holds, rather than accepting the SUMMARY's
characterization of it.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The app is a fully static build; opening it fetches the committed bundle and computes a real result with no backend and no runtime request to another origin (APP-01, APP-03) | ✓ VERIFIED | `src/app/App.tsx`, `src/data/bundle-source.ts`; `tests/app/static-build.test.ts` re-run, 4/4 pass |
| 2 | Data loads via one shared, node-free decode path reachable from the browser bundle graph, and the app works fully offline after first load, for every bundled symbol (DATA-08) | ✓ VERIFIED | `grep -c 'node:' src/data/kernel-inputs.ts src/data/load-bundle-browser.ts` = 0; `tests/app/offline.browser.test.ts` re-run, passes |
| 3 | Every backtest parameter is a real control wired through `updateBacktestRequest`/`scheduleRun`; invalid combinations are explained, never silently coerced (APP-01, APP-04) | ✓ VERIFIED | `src/app/bounds.ts`, `src/app/components/ParameterColumn/*.tsx`; `tests/app/controls.browser.test.ts` (11/11), `tests/app/validation.browser.test.ts` (8/8) re-run, pass |
| 4 | IRR (bounded bisection, XIRR-style) is the permanent headline metric, identity never changes with contribution state (METR-01) | ✓ VERIFIED | `src/metrics/irr.ts`; `tests/metrics/irr.test.ts`, `tests/app/metrics.browser.test.ts` re-run, pass |
| 5 | CAGR is available but carries a "misleading with contributions" qualifier when contributions are non-zero (METR-02) | ✓ VERIFIED | `MetricsPanel.tsx`; re-run, passes |
| 6 | Maximum drawdown computed in-loop, exactly 0/1 at boundaries, strictly between for a real multi-peak run (METR-03) | ✓ VERIFIED | `src/kernel/backtest.ts`; `tests/kernel/drawdown.test.ts` (5/5) re-run, pass |
| 7 | Final value as a multiple of total contributed, with dropped-post-ruin contributions kept as a separate line (METR-04) | ✓ VERIFIED | `MetricsPanel.tsx` lines 63-75; `src/metrics/format.ts` |
| 8 | A ruined run is a categorical banner state; the chart never plots the ruin bar's clamped zero on a log scale (METR-05) | ✓ VERIFIED | `RuinBanner.tsx`, `EquityCurveChart.tsx` terminator series; `metrics.browser.test.ts` ruin case re-run, passes |
| 9 | A persistent, visible log/linear scale toggle defaults to log, using uPlot's native `distr` (never a hand-transformed value) (VIZ-08) | ✓ VERIFIED | `LogScaleToggle.tsx`; `EquityCurveChart.tsx` `distr: isLog ? 3 : 1`, no `Math.log` transform. Re-verified with the log axis genuinely exercised at a pathological small minimum (see Notable Fix below) rather than only the landing-page range — `log-axis-splits.browser.test.ts` passes, including the linear-toggle-still-works assertion in the same test |
| 10 | Both light and dark palettes ship; theme follows `prefers-color-scheme` with a manual override; the canvas is explicitly repainted on theme change | ✓ VERIFIED | `src/app/theme.ts`, `ThemeToggle.tsx`; `tests/app/theme.browser.test.ts` (5/5) re-run, pass |
| 11 | Every parameter is encoded in the URL as flat, fixed-order query params; unrecognized input is rejected loudly; `decode(encode(x))` round-trips exactly (SHARE-01, SHARE-03) | ✓ VERIFIED | `src/app/permalink.ts`; `tests/app/permalink.test.ts` (23/23), `tests/app/permalink.browser.test.ts` (8/8) re-run, pass |
| 12 | The URL carries the deployed data-bundle version; a mismatch computes against the deployed bundle and banners both versions (SHARE-02) | ✓ VERIFIED | `BundleVersionBanner.tsx`; `permalink.browser.test.ts` mismatch case re-run, passes |
| 13 | Copying the link can never yield a stale URL, even though the URL write is debounced (PERF-07 gap-closure) | ✓ VERIFIED | `CopyLinkButton.tsx` calls `flushPermalinkUrl()` synchronously before reading `window.location.href`; re-run, passes |
| 14 | No main-thread task exceeds 50ms during a real slider drag; the coalesced recompute stays under the 16ms frame budget (PERF-07) | ✓ VERIFIED | `.bench/bench-results.json`: PERF-07a/07b both pass (re-read directly, unchanged from prior run) |
| 15 | Cold load under 1500ms/1000ms; warm load under 300ms, against the real production preview build (PERF-08) | ✓ VERIFIED | `.bench/bench-results.json`: PERF-08a/08b/08c all pass, `source: production` |
| 16 | At 320px, the 28px IRR headline and CAGR secondary row do not wrap/clip for extreme values, and a wrapping secondary metric does not push the panel out of the screenshot region (UI-SPEC E7 overflow) | ✓ VERIFIED | `tests/app/narrow-viewport.browser.test.ts` test 1: derives the widest non-ruined CAGR across the live bundled universe (not a guessed symbol), asserts `scrollWidth <= clientWidth` on both the IRR and CAGR nodes, asserts screenshot-region containment. Ran directly, passes |
| 17 | At 320px, the ruin banner wraps and never clips the interpolated ISO ruin date (UI-SPEC E8 overflow) | ✓ VERIFIED | `narrow-viewport.browser.test.ts` test 2: forces a real 20x SPX ruin, asserts wrap-not-clip on the banner and screenshot-region containment. Ran directly, passes |
| 18 | At 320px, the longest bundled symbol label does not force the fixed-width parameter column wider (UI-SPEC E1 overflow) | ✓ VERIFIED | `narrow-viewport.browser.test.ts` test 3: derives the longest symbol from the live manifest, asserts the select wraps not clips and the parameter column's right edge stays inside the 320px viewport. Ran directly, passes |
| 19 | At 320px, a symbol label plus its inline source citation wraps rather than clips (UI-SPEC E1 long-text) | ✓ VERIFIED | `narrow-viewport.browser.test.ts` test 4: stubs the manifest fetch to force the real dividend-unavailable SourceCitation case, asserts wrap-not-clip on both the label and citation and rect containment within the symbol control. Ran directly, passes |
| 20 | At 320px, citation strings wrap under their control without clipping or colliding, and the Copy link button stays above the fold (UI-SPEC E5 overflow/long-text, amended) | ✓ VERIFIED (per amended spec) | `narrow-viewport.browser.test.ts` test 5: asserts wrap-not-clip and containment-within-`.parameter-group` for every cost-control citation, and that Copy link is present. The original "at most two lines" ceiling on the longest citation was dropped from `04-UI-SPEC.md` at commit `425143d`, confirmed by direct diff — see Requirement Amendment below. Ran directly, passes |
| 21 | At 320px, a stacked set of simultaneous ValidationExplanation variants does not push the chart out of the D-20 screenshot region (UI-SPEC E9 overflow) | ✓ VERIFIED | `narrow-viewport.browser.test.ts` test "6/7": drives a real simultaneous bundle-mismatch + cross-field-caveat state (two independently-triggered variants, not synthetic), asserts wrap-not-clip on both and screenshot-region containment. Ran directly, passes |
| 22 | A PERF-08 cold-load measurement runs with no other timed measurement concurrent, and the preview server always closes | ✓ VERIFIED | `bench/preview-server.ts`: `try { ... } finally { await server.close() }`, confirmed by direct code read |

**Score:** 22/22 truths verified

### Notable Fix Landed Since Prior Verification

Writing the mechanical narrow-viewport tests (item 16 above) surfaced a real renderer-killing
defect distinct from any of the 7 backstop items: uPlot's built-in `logAxisSplits`
(`node_modules/uplot/dist/uPlot.esm.js:1495`) runs a `do...while` loop that stalls once the log
y-scale minimum drops below roughly 1e-22 (`roundDec` snaps `split + foundIncr` back onto
`split`), hanging the Chromium renderer. Confirmed reachable in the real app: symbol NDX,
total-return, leverage 10, entry 1999-03-04, log scale — a permalink any visitor could construct
or receive — decays to a plotted minimum below 1e-24 before its ruin bar. A link into that state
would have killed the page for whoever opened it, which is a direct hit against the phase goal
("get an outcome they can hand to someone else as a link").

Fixed at `a55b611` with `src/app/components/ResultColumn/log-axis-splits.ts`
(`logDecadeSplits`): a pure decade-split generator built from integer exponents stepped by an
integer `step >= 1`, so every step provably advances regardless of how small the scale minimum
is. Wired into `EquityCurveChart.tsx`'s log branch only, with an identity `filter` (uPlot's
default `log10AxisValsFilt` otherwise blanks the generated splits) and a `formatLogAxisValue`
formatter that switches to exponential notation past +-4 decades so `Intl.NumberFormat` cannot
collapse every sub-1e-4 decade to the literal string "0". The linear branch is untouched.

Verified independently, not taken on the commit message's word:
- Read the diff against `EquityCurveChart.tsx` directly — confirms the change is scoped to the
  `isLog` branch only.
- `tests/app/log-axis-splits.test.ts` (23 unit cases: monotonicity, span correctness, bounded
  length, NaN/Infinity/zero/negative totality, argument-order independence, min===max) — ran
  directly, 23/23 pass.
- `tests/app/log-axis-splits.browser.test.ts` — reproduces the exact NDX/10x/1999-03-04 repro,
  asserts the plotted minimum is genuinely below 1e-22 (so the test cannot silently drift onto a
  benign range), asserts a canvas paints instead of the renderer hanging, asserts no two adjacent
  y-axis labels render identically, and asserts the linear scale still works after toggling back.
  Ran directly, 1/1 passes. The test file's own header documents that a regression here fails as
  a renderer death ("Browser connection was closed... 0ms"), not an assertion failure — read and
  confirmed this framing is accurate to how such a hang would actually present.

This also means truth 9 (log/linear toggle) is re-verified against a genuinely pathological
range, not just the landing-page range the original verification checked.

### Requirement Amendment (UI-SPEC E5 long-text)

`04-UI-SPEC.md`'s E5 long-text row originally required the longest sourced citation to reflow to
at most two lines at 320px. Verified this was a genuine spec amendment, not a silently-dropped
requirement: diffed commit `425143d` directly. The ceiling was written before the real citation
text existed; measured against the actual content of `src/validation/cost-parameters.ts`, the
longest citation (`generic-3x-expense-ratio`, a full PROJECT.md quotation plus explanation)
renders at roughly 8 lines at 320px, not 2. The two ways to meet the original ceiling both cost
more than they buy: shortening the string edits sourced text and breaks the SIM-09 audit trail;
a tooltip or disclosure violates `SourceCitation.tsx`'s explicit no-concealment rule. The
properties that actually matter — no clipping, no collision with adjacent controls, Copy link
above the fold — all hold and are asserted by `narrow-viewport.browser.test.ts` test 5. Treating
the amended spec as the contract per the phase instructions: truth 20 above is scored against
the amended wording, and this note makes the change auditable rather than absorbed silently.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/data/bundle-source.ts` | One shared assembly loop | ✓ VERIFIED | No `node:` import; zero-copy typed-array decode |
| `src/app/permalink.ts` | Canonical two-way codec | ✓ VERIFIED | 15 keys, exhaustive `encodeField` switch, total `decodeParams` |
| `src/app/components/ParameterColumn/CopyLinkButton.tsx` | The phase's one explicit action | ✓ VERIFIED | Disabled until a result exists; flushes debounced URL sync before copy |
| `src/app/components/ResultColumn/BundleVersionBanner.tsx` | Mismatch notice | ✓ VERIFIED | Fills `ValidationExplanation`'s reserved slot |
| `src/app/components/ResultColumn/log-axis-splits.ts` | Loop-safe log-axis decade splits (new since prior run) | ✓ VERIFIED | Pure, total, unit-tested (23 cases) and browser-exercised against the real pathological repro |
| `bench/preview-server.ts`, `bench/perf-08.bench.test.ts`, `bench/perf-07.bench.test.ts` | Real production-build measurement harnesses | ✓ VERIFIED | `source: 'production'`, real Playwright pointer drag, try/finally server close |
| `src/app/theme.ts`, `ThemeToggle.tsx` | prefers-color-scheme + override | ✓ VERIFIED | `resolveTheme`/`setThemeOverride`/`onThemeChange`; explicit chart repaint |
| `tests/app/static-build.test.ts` | APP-03 mechanical gate | ✓ VERIFIED | Scans emitted `dist/` for external URLs, 4/4 pass |
| `tests/app/narrow-viewport.browser.test.ts` | Mechanizes the 7 prior backstop items (new since prior run) | ✓ VERIFIED | 6 tests (one test combines items 6 and 7), all pass, exercises real app state at a genuine 320px viewport via `page.viewport` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `CopyLinkButton.tsx` | `state.ts` | `flushPermalinkUrl()` before reading `window.location.href` | ✓ WIRED | Re-confirmed by direct source read + `permalink.browser.test.ts` |
| `state.ts` (`writePermalinkUrl`) | `permalink.ts` (`encodeParams`) | `history.replaceState`, never `pushState` | ✓ WIRED | `grep -rn 'pushState' src/app` empty |
| `state.ts` (`applyPermalinkFromLocation`) | `permalink.ts` (`decodeParams`) | Boot-time decode | ✓ WIRED | `permalink.browser.test.ts` fresh-load case passes |
| `EquityCurveChart.tsx` | `theme.ts` | `onThemeChange` triggers `rebuildChart()` | ✓ WIRED | `theme.browser.test.ts` sampled-pixel repaint case re-run, passes |
| `EquityCurveChart.tsx` (log branch) | `log-axis-splits.ts` (`logDecadeSplits`) | `yAxis.splits`/`yAxis.filter`/`yAxis.values`, log branch only | ✓ WIRED | Direct source read; linear branch confirmed untouched (no `isLog` keys added there) |
| `HoldingModeControl.tsx` | `state.ts` (`scheduleRun`) | Fixed-period overrun retried with `holdingPeriodBars: null` | ✓ WIRED | `validation.browser.test.ts` overrun case re-run, passes |

### Behavioral Spot-Checks (all run directly by this verification, not taken from the orchestrator)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Typecheck | `npm run typecheck` | exit 0, clean | ✓ PASS |
| Full unit suite | `npm test` | 546/546, 39 files | ✓ PASS (matches orchestrator) |
| Full app/browser suite | `npm run test:app` | 53/53, 10 files | ✓ PASS (matches orchestrator) |
| Narrow-viewport UAT automation | `npx vitest run --project app tests/app/narrow-viewport.browser.test.ts` | 6/6 pass | ✓ PASS |
| Log-axis-splits unit totality | `npx vitest run tests/app/log-axis-splits.test.ts` | 23/23 pass | ✓ PASS |
| Log-axis-splits real-repro browser test | `npx vitest run --project app tests/app/log-axis-splits.browser.test.ts` | 1/1 pass | ✓ PASS |
| Permalink codec + goldens | `npx vitest run tests/app/permalink.test.ts` | 23/23 pass | ✓ PASS |
| Permalink/metrics/controls/tracer/validation/theme/offline/screenshot-region browser suites | `npx vitest run --project app tests/app/permalink.browser.test.ts tests/app/metrics.browser.test.ts tests/app/controls.browser.test.ts tests/app/tracer.browser.test.ts tests/app/validation.browser.test.ts tests/app/theme.browser.test.ts tests/app/offline.browser.test.ts tests/app/screenshot-region.browser.test.ts` | 46/46 pass across 8 files | ✓ PASS |
| Static-build gate | `npx vitest run tests/app/static-build.test.ts` | 4/4 pass | ✓ PASS |
| Metrics/drawdown unit suite | `npx vitest run tests/metrics/ tests/kernel/drawdown.test.ts` | 22/22 pass across 3 files | ✓ PASS |

No disagreement between this run and the orchestrator's stated gate figures.

### Probe Execution

Not applicable — no `scripts/*/tests/probe-*.sh` convention in this project. Equivalent
(`npm run bench`) figures already reported under prior verification, re-confirmed unchanged in
`.bench/bench-results.json` (PERF-07a/07b, PERF-08a/08b/08c all `pass`).

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|--------------|--------|----------|
| APP-01 | Symbol select from bundled universe | ✓ SATISFIED | `bounds.ts`/`SymbolControl.tsx`; REQUIREMENTS.md `[x]`, `Complete` |
| APP-03 | Fully static build, no backend | ✓ SATISFIED | `static-build.test.ts`; REQUIREMENTS.md `[x]`, `Complete` |
| APP-04 | Invalid combos prevented/explained | ✓ SATISFIED | `ValidationExplanation.tsx`; REQUIREMENTS.md `[x]`, `Complete` |
| DATA-08 | Typed-array decode, offline after load | ✓ SATISFIED | `bundle-source.ts`, `offline.browser.test.ts`; REQUIREMENTS.md `[x]`, `Complete` |
| METR-01 | IRR default annualized metric | ✓ SATISFIED | REQUIREMENTS.md `[x]`, `Complete` |
| METR-02 | CAGR suppressed/qualified | ✓ SATISFIED | REQUIREMENTS.md `[x]`, `Complete` |
| METR-03 | Max drawdown | ✓ SATISFIED | REQUIREMENTS.md `[x]`, `Complete` |
| METR-04 | Final value multiple | ✓ SATISFIED | REQUIREMENTS.md `[x]`, `Complete` |
| METR-05 | Ruin flag as categorical outcome | ✓ SATISFIED | REQUIREMENTS.md `[x]`, `Complete` |
| VIZ-08 | Log scale toggle, visible | ✓ SATISFIED | REQUIREMENTS.md `[x]`, `Complete` |
| VIZ-11 | Legible in light and dark | ✓ SATISFIED | REQUIREMENTS.md `[x]`, `Complete` (bookkeeping now closed — see below) |
| SHARE-01 | Every parameter in URL | ✓ SATISFIED | REQUIREMENTS.md `[x]`, `Complete` (bookkeeping now closed) |
| SHARE-02 | URL carries bundle version | ✓ SATISFIED | REQUIREMENTS.md `[x]`, `Complete` (bookkeeping now closed) |
| SHARE-03 | Determinism test | ✓ SATISFIED | REQUIREMENTS.md `[x]`, `Complete` (bookkeeping now closed) |
| PERF-07 | No main-thread task > 50ms | ✓ SATISFIED | REQUIREMENTS.md `[x]`, `Complete` (bookkeeping now closed) |
| PERF-08 | Cold/warm load budgets | ✓ SATISFIED | REQUIREMENTS.md `[x]`, `Complete` |

The prior report's documentation gap (VIZ-11, SHARE-01/02/03, PERF-07 showing `[ ]`/`Pending`
despite passing implementation) is closed. Confirmed by direct `grep` against
`.planning/REQUIREMENTS.md`: all five now read `[x]`/`Complete`, and every remaining `Pending`
row in the traceability table is correctly attributed to Phase 5 or later, none to Phase 4.

No orphaned requirements.

### Anti-Patterns Found

None. Re-scanned every file touched since the prior verification
(`src/app/components/ResultColumn/log-axis-splits.ts`,
`src/app/components/ResultColumn/EquityCurveChart.tsx`, `tests/app/narrow-viewport.browser.test.ts`,
`tests/app/log-axis-splits.test.ts`, `tests/app/log-axis-splits.browser.test.ts`) for
`TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER`, `console.log`, and hardcoded-empty-data stub patterns.
None found. `log-axis-splits.ts`'s bounded correction loops (`guard < 4`) are explicitly
commented and provably terminating, not stray debt.

### Human Verification Required

None. All 7 items previously deferred to human judgment are now mechanically asserted by
`tests/app/narrow-viewport.browser.test.ts`, independently re-run and confirmed passing by this
verification, not accepted on the prior UAT record's word.

## Gaps Summary

No gaps. All 22 must-haves verified, up from 15/22. The 7 previously-outstanding items are closed
by real mechanical assertions against a genuine 320px viewport, exercising real app state
(dividend-unavailable citations, a real 20x ruin, a real bundle-version mismatch plus a real
cross-field caveat simultaneously, the live manifest's actual longest symbol) rather than
synthetic fixtures. One item (UI-SPEC E5's two-line ceiling) was amended rather than met, and
that amendment is documented above with its reasoning and the commit that made it, per the
instruction to surface rather than silently absorb it. One regression-class defect (the uPlot
log-axis renderer hang, directly reachable via a permalink, i.e. a direct threat to the phase
goal of handing someone a working link) was found in the course of closing those items and is
independently fixed, unit-tested (23 cases) and reproduced/re-verified in a real browser test
against the exact pathological parameters that triggered it. `npm run typecheck`, `npm test`
(546/546), and `npm run test:app` (53/53) all pass, independently re-run by this verification and
matching the orchestrator's reported figures. The phase's documentation gap (stale REQUIREMENTS.md
checkboxes for VIZ-11/SHARE-01-03/PERF-07) is closed.

Phase goal achieved: a person can open the app, describe a real leveraged position via wired
controls, get a computed outcome with the IRR headline, CAGR, drawdown, and ruin state, and copy
a permalink that reproduces that exact outcome for someone else — including, now, the extreme
parameter combinations (deep leverage, log scale, narrow viewport) that could previously break
either the renderer or the readable layout.

---

*Verified: 2026-08-20T04:18:16Z*
*Verifier: Claude (gsd-verifier)*
