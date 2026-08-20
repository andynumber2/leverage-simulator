---
phase: 04-first-defensible-backtest-in-the-browser
plan: 01
subsystem: app
tags: [vite, solid-js, uplot, browser, tracer, typed-arrays, performance-marks]

requires:
  - phase: 03-simulation-kernel-and-the-upro-tqqq-gate
    provides: src/kernel/backtest.ts (runBacktest), src/data/kernel-inputs.ts (buildKernelInputs, BacktestRequest), src/validation/cost-parameters.ts (GENERIC_3X_EXPENSE_RATIO, FINANCING_SPREAD_DEFAULT), the passing UPRO/TQQQ gate this app's numbers rest on
  - phase: 01-performance-architecture
    provides: PERF-02's 0.21ms single-run measurement, the basis for D-01's synchronous-main-thread decision
provides:
  - "src/data/bundle-source.ts: BundleByteSource interface and loadBundleFromSource, the one bundle assembly loop (D-02)"
  - "src/data/load-bundle-node.ts / src/data/load-bundle-browser.ts: the two byte sources delegating to it"
  - "A node:-free src/data/kernel-inputs.ts, reachable from the browser module graph"
  - "A static Vite + Solid app (index.html, vite.config.ts, src/app/*) that fetches the committed bundle, runs the kernel on the main thread, and paints a log-scale uPlot equity curve"
  - "tests/app/tracer.browser.test.ts: the end-to-end browser regression, run under npm run test:app"
  - "app-data-ready / app-interactive / app-recompute performance marks and measure, the contract plan 04-03's PERF-08 and 04-06's PERF-07b harnesses read"
affects: ["04-02 (scale toggle wires into the scaleMode signal shipped here)", "04-04/04-05 (parameter column fills the empty aside App.tsx already lays out)", "04-08 (theme switching and the offline/no-external-origin gate build on styles.css and index.html shipped here)"]

actuals:
  tokens: 15149
  tasks: 3
  commits: 4

tech-stack:
  added: [solid-js@1.9.15, uplot@1.6.32, vite@8.2.1, vite-plugin-solid@2.11.14, vite-plugin-pwa@1.3.0]
  patterns:
    - "D-02 byte-source split: one assembly loop (loadBundleFromSource) parameterized over a BundleByteSource interface, so Node and browser share every line of manifest-parse-and-decode logic and differ only in how bytes are fetched"
    - "D-03 rAF coalescing: a module-level scheduled boolean plus a single requestAnimationFrame call site collapses any number of parameter writes within one frame into one buildKernelInputs + runBacktest call, instrumented with a named app-recompute performance measure on every run"
    - "uPlot native distr (3=log, 1=linear) for the y scale; never a hand-transformed Math.log10 value and never a custom tick formatter"
    - "CSS custom properties read via getComputedStyle at canvas render time, since canvas gets no free prefers-color-scheme styling"
    - "axis.size measured on a private canvas 2D context with the CSS-sized font, not uPlot's own context and not divided by devicePixelRatio -- avoids desyncing uPlot's cached ctx.font and keeps the gutter width in CSS pixels, uPlot's own unit for axis.size"

key-files:
  created:
    - src/data/bundle-source.ts
    - src/data/load-bundle-node.ts
    - src/data/load-bundle-browser.ts
    - index.html
    - vite.config.ts
    - src/app/main.tsx
    - src/app/App.tsx
    - src/app/state.ts
    - src/app/styles.css
    - src/app/components/ResultColumn/EquityCurveChart.tsx
    - tests/app/tracer.browser.test.ts
  modified:
    - src/data/kernel-inputs.ts
    - tsconfig.json
    - vitest.config.ts
    - package.json
    - .github/workflows/ci.yml
    - bench/kernel-series-bridge.ts
    - scripts/run-backtest.ts
    - tests/data/contribution-schedule.test.ts
    - tests/data/selector-concurrency.test.ts
    - tests/data/kernel-inputs.test.ts
    - tests/kernel/module-boundary.test.ts
    - tests/kernel/ruin.test.ts
    - tests/kernel/pitfalls-a.test.ts
    - tests/validation/upro-tqqq-gate.test.ts

key-decisions:
  - "Package legitimacy gate (Task 1) approved solid-js, vite-plugin-solid, and vite despite each carrying a SUS 'too-new' verdict (publish-date heuristic, not package age); all three resolved to their expected canonical repos under github.com/solidjs and github.com/vitejs at millions of weekly downloads."
  - "D-01/D-03/D-19/D-21/D-02 all confirmed as specified: synchronous main-thread kernel call, rAF-coalesced single-run-per-frame, log-scale default, single result-slot element, one shared byte-decode assembly loop."
  - "Two post-tracer fixes closed the plan's single 'backstop' must_have (Y-axis tick labels do not overrun the plot area). uPlot's fixed 50 CSS px y-axis default clips the 3x landing run's wide equity values at 12px monospace, so the gutter is now measured from the labels uPlot is about to draw via axis.size, split into a directly-testable axisSizeForLabels helper. The first attempt measured with a CSS-sized font but divided by devicePixelRatio, halving the computed width on a 2x display (45px vs the needed 75px) -- narrower than even uPlot's own default -- because uPlot recomputes axis sizes on dppxchange and axis.size is already specified in CSS pixels, so the correct dependence on ratio is none. The shipped fix measures on a private canvas 2D context with the CSS-sized font and applies no ratio arithmetic; it also avoids writing to uPlot's own ctx (which would desync its cached ctx.font). Two new regressions cover this: the gutter exceeds uPlot's 50px default, and the gutter is byte-identical between a stubbed 2x and the native 1x ratio. This closes the backstop must_have with tests rather than leaving it a backstop."
  - "The tracer feedback gate (a checkpoint:human-verify on the rendered chart) was presented, the user viewed the equity curve in a browser, reported the axis clipping now fixed above, and approved the tracer. No further human-verify is owed for this plan."

requirements-completed: [APP-03, DATA-08, VIZ-08]

coverage:
  - id: D1
    description: "One bundle assembly loop (loadBundleFromSource) shared by loadBundleFromDisk (Node) and loadBundleFromFetch (browser); kernel-inputs.ts carries no node: import and is reachable from the browser module graph"
    requirement: DATA-08
    verification:
      - kind: unit
        ref: "npm test (32 files, 459 tests) -- Phase 1-3 suites unaffected by the loader split"
        status: pass
      - kind: other
        ref: "grep -c 'node:' src/data/kernel-inputs.ts and src/data/load-bundle-browser.ts both return 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "The built app, opened in a browser, fetches the committed bundle over HTTP, decodes it into typed arrays through the shared decode path, runs the Phase 3 kernel synchronously on the main thread, and paints a real SPX 3x total-return equity curve on a log y axis for the default landing run, with no backend and no runtime request to any other origin"
    requirement: APP-03
    verification:
      - kind: e2e
        ref: "tests/app/tracer.browser.test.ts#the default landing run computes and paints a real SPX 3x total-return equity curve"
        status: pass
      - kind: manual_procedural
        ref: "Tracer feedback gate: user viewed the built app in a browser and approved the rendered chart (post-fix)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The y scale uses uPlot's native logarithmic distribution (distr: 3), never a hand-transformed value or custom tick formatter, and the choice of scale is stored in a visible-toggle-ready signal (the toggle control itself ships in plan 04-02)"
    requirement: VIZ-08
    verification:
      - kind: unit
        ref: "grep -c 'distr' src/app/components/ResultColumn/EquityCurveChart.tsx >= 1; grep -c 'Math.log' == 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "Y-axis tick labels do not overrun the plot area at the widest formatted value, in both linear and log mode, independent of device pixel ratio"
    verification:
      - kind: unit
        ref: "tests/app/tracer.browser.test.ts#the y-axis gutter is measured from its labels, so wide equity values are not clipped"
        status: pass
      - kind: unit
        ref: "tests/app/tracer.browser.test.ts#the y-axis gutter is the same width on a 2x display as on a 1x one"
        status: pass
      - kind: unit
        ref: "tests/app/tracer.browser.test.ts#axisSizeForLabels sizes to the widest label plus the tick and gap"
        status: pass
    human_judgment: false

duration: ~5h (across a container restart pause between the tracer commit and the two gate-driven fixes)
completed: 2026-08-19
status: complete
---

# Phase 4 Plan 1: The Browser Tracer Summary

**A static Vite + Solid app fetches the committed bundle by HTTP, decodes it zero-copy through the same assembly loop the Node tests use, runs the Phase 3 kernel synchronously on the main thread, and paints a real SPX 3x total-return equity curve on a log-scale uPlot chart -- proven end to end by a five-case browser regression and approved by the user after two axis-gutter fixes.**

## Performance

- **Tasks:** 3 (1 blocking-human package-legitimacy checkpoint, 2 auto)
- **Files modified:** 27 (11 created, 16 modified)
- **Commits:** 4

## Accomplishments

- Split `loadBundleFromDisk` into one shared assembly loop (`loadBundleFromSource`) plus two byte sources (`load-bundle-node.ts`, `load-bundle-browser.ts`), leaving `kernel-inputs.ts` free of any `node:` import (D-02).
- Stood up the static Vite + Solid scaffold: `index.html`, `vite.config.ts`, `tsconfig.json` JSX settings, `dev`/`build`/`preview`/`test:app` npm scripts, and a fourth `app` Vitest project on Playwright/Chromium.
- Wired one real end-to-end path: fetch bundle, decode, `buildKernelInputs`, `runBacktest`, uPlot paint, with a loading state before it and a named failure state (carrying the failing URL/status or the missing-series detail) instead of it.
- Instrumented the D-03 rAF-coalesced recompute with `app-data-ready`, `app-interactive`, and per-run `app-recompute` performance marks/measures, the contract later plans' PERF-08 and PERF-07b harnesses read.
- Closed the plan's one `backstop` must_have with real regressions: the y-axis gutter is now measured from the labels being drawn, independent of device pixel ratio, rather than left to uPlot's fixed 50px default.

## Task Commits

1. **Task 1: Package legitimacy gate** - human checkpoint, approved inline (no code commit)
2. **Task 2: Split the bundle byte source (D-02) and stand up the static Vite/Solid scaffold** - `030c37a` (feat)
3. **Task 3: End-to-end tracer -- real SPX 3x equity curve painted in the browser** - `360c5b2` (feat)
4. **Gate-driven fix 1: measure the y-axis gutter instead of uPlot's fixed 50px default** - `bf5b6ba` (fix)
5. **Gate-driven fix 2: make the gutter measurement device-pixel-ratio independent** - `0b0cdab` (fix)

`91338b6` merges the executor worktree onto the phase branch; `80a0b1e` records a pause for a container restart between the tracer commit and the two gate fixes.

## Files Created/Modified

- `src/data/bundle-source.ts` - `BundleByteSource`, `LoadedBundle`, `loadBundleFromSource`: the one assembly loop
- `src/data/load-bundle-node.ts` - `loadBundleFromDisk(rootDir?)`, unchanged signature, now over a `BundleByteSource`
- `src/data/load-bundle-browser.ts` - `loadBundleFromFetch()`, the browser byte source, throws a named error on a non-OK response
- `src/data/kernel-inputs.ts` - dropped `node:fs/promises`/`node:path` and the `loadBundleFromDisk` body; re-exports `LoadedBundle` as a type only
- `index.html` / `vite.config.ts` - static entry and Solid build config, `build.target: es2022`, no external-origin reference
- `src/app/state.ts` - reactive `BacktestRequest` store, `scaleMode` signal (seeded `log`), load-status signal, the single `requestAnimationFrame` coalescing call site, `initializeApp()`
- `src/app/App.tsx` - two-column layout (empty parameter `aside`, single result-slot `main`), loading/failure/chart branches keyed off `loadStatus()`
- `src/app/main.tsx` - `mountApp()`, the one mount path production and the test share; fires `app-data-ready`/`app-interactive` marks
- `src/app/components/ResultColumn/EquityCurveChart.tsx` - one uPlot instance, native `distr` log/linear, colors read via `getComputedStyle`, measured y-axis gutter (`axisSizeForLabels`)
- `src/app/styles.css` - the UI-SPEC color/spacing/type-scale tokens as CSS custom properties, light and `[data-theme="dark"]`
- `tests/app/tracer.browser.test.ts` - 5 cases: default landing run end-to-end, zero-series failure state, gutter exceeds uPlot's default, gutter is DPR-independent, `axisSizeForLabels` unit arithmetic
- Nine call sites of `loadBundleFromDisk` (`bench/`, `scripts/`, six test files) - import path only, changed from `kernel-inputs.ts` to `load-bundle-node.ts`

## Decisions Made

See `key-decisions` in frontmatter: the package-legitimacy approval, the D-01/D-02/D-03/D-19/D-21 confirmations, and the two-layer axis-gutter root cause (fixed 50px default, then a devicePixelRatio division error) are recorded there in full.

## Deviations from Plan

### Auto-fixed Issues (post-tracer-gate, Rule 1)

**1. [Rule 1 - Bug] uPlot's fixed 50px y-axis default clipped wide equity values**
- **Found during:** Tracer feedback gate (human-verify on the rendered chart)
- **Issue:** The landing run's equity values ("10,000,000") render wider than uPlot's default 50 CSS px y-axis gutter at the chart's 12px monospace axis font, clipping leading digits.
- **Fix:** Added `axisSizeForLabels`, an `axis.size` hook that measures the widest label uPlot is about to draw (tick size + gap + label width) instead of relying on the fixed default.
- **Files modified:** `src/app/components/ResultColumn/EquityCurveChart.tsx`, `tests/app/tracer.browser.test.ts`
- **Verification:** New regression asserts the rendered `.u-over` gutter exceeds uPlot's 50px default; fails without the fix.
- **Committed in:** `bf5b6ba`

**2. [Rule 1 - Bug] Gutter measurement divided by devicePixelRatio, halving the computed width on Retina displays**
- **Found during:** Same gate, re-tested on a 2x display after fix 1 landed
- **Issue:** The first fix measured label widths with a CSS-sized font but then divided by `devicePixelRatio`, computing 45px instead of the needed 75px on a 2x display -- narrower even than uPlot's own default. `axis.size` is already specified in CSS pixels, so the correct dependence on ratio is none; uPlot recomputes axis sizes on `dppxchange`, which is why the symptom was display-dependent (clipped on a Retina panel, correct once dragged to a 1x monitor).
- **Fix:** Measure on a private canvas 2D context with the CSS-sized font and no ratio arithmetic. A private context also avoids desyncing uPlot's own cached `ctx.font` (its `setFontStyle` skips the assignment when the font string is unchanged).
- **Files modified:** `src/app/components/ResultColumn/EquityCurveChart.tsx`, `tests/app/tracer.browser.test.ts`
- **Verification:** New regression stubs `devicePixelRatio` to 2 and asserts the gutter is byte-identical to the 1x measurement.
- **Committed in:** `0b0cdab`

---

**Total deviations:** 2 auto-fixed (both Rule 1, both surfaced by the same tracer feedback gate)
**Impact on plan:** Both fixes close the plan's single `backstop` must_have with real regressions rather than leaving it a backstop. No scope creep; both fixes stayed inside `EquityCurveChart.tsx` and its test file.

## Issues Encountered

A container restart paused execution between the tracer commit (`360c5b2`) and the two gate-driven fixes; recorded in `80a0b1e`. No state was lost -- the fixes resumed against the same tracer gate.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `scaleMode` signal and the log/linear `distr` wiring are ready for plan 04-02's visible toggle control.
- The empty `aside.parameter-column` in `App.tsx` is ready for plans 04-04/04-05 to fill without touching layout.
- `styles.css`'s `[data-theme="dark"]` block and `index.html`'s no-external-origin baseline are ready for plan 04-08's theme switching and offline gate.
- `app-data-ready`/`app-interactive`/`app-recompute` marks are live and ready for plan 04-03's PERF-08 and plan 04-06's PERF-07b harnesses to read.
- No blockers carried forward from this plan.

---
*Phase: 04-first-defensible-backtest-in-the-browser*
*Completed: 2026-08-19*
