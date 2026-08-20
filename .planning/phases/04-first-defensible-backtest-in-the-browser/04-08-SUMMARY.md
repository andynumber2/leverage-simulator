---
phase: 04-first-defensible-backtest-in-the-browser
plan: 08
subsystem: ui
tags: [solid-js, pwa, service-worker, workbox, vite-plugin-pwa, offline, theme, prefers-color-scheme, static-build-gate]

requires:
  - phase: 04-first-defensible-backtest-in-the-browser
    provides: "plan 04-01's styles.css tokens/[data-theme='dark'] block, EquityCurveChart's getComputedStyle color reads, index.html's no-external-origin baseline, and vite.config.ts's Solid plugin"
provides:
  - "src/app/theme.ts: resolveTheme/setThemeOverride/onThemeChange/initTheme -- prefers-color-scheme plus a session-only manual override, resolved to a data-theme attribute (D-19)"
  - "src/app/components/ThemeToggle.tsx: the manual override control, mounted beside the log/linear toggle, deliberately never accent-colored"
  - "public/manifest.webmanifest + public/icon.svg: the hand-authored PWA manifest vite-plugin-pwa's generateSW strategy requires, referencing no external origin"
  - "vite.config.ts's VitePWA(generateSW) precaching the app shell plus every compiled .bin asset and the JSON manifest (D-04), maximumFileSizeToCacheInBytes measured against a real build"
  - "vitest.config.ts's app-project runOfflineCheck command: registers the service worker, disables the network, reloads, and reports whether app-interactive was reached with zero failed requests"
  - "tests/app/static-build.test.ts: the APP-03/T-04-05 gate over the emitted dist/ output, with a reasoned external-URL allow-list"
  - "src/app/components/ResultColumn/ResultSummaryHeader.tsx + App.tsx's data-testid=\"screenshot-region\" element: the D-20 self-contained rectangle"
affects: ["Phase 8 SHARE-04 (the screenshot region D-20 reserved and this plan built is exactly what a PNG-export feature would capture)"]

actuals:
  tokens: 15870
  tasks: 3
  commits: 3

tech-stack:
  added: [vite-plugin-pwa@1.3.0 (already a devDependency in package.json/package-lock.json from plan 04-01's research; this plan is its first actual use -- node_modules had to be synced with `npm install` before it could be imported)]
  patterns:
    - "theme.ts re-queries window.matchMedia on every resolve/init call rather than caching a MediaQueryList at module import time, because a static ES module import resolves before any test body runs -- caching early would freeze on whatever matchMedia returned before a test's vi.stubGlobal('matchMedia', ...) could ever apply. resetThemeState() mirrors state.ts's resetAppState() for the same reason: module-level singletons need an explicit test-only reset to avoid one test's override leaking into the next within the same file."
    - "EquityCurveChart's existing rebuildChart() (destroy-and-recreate, never a partial uPlot update) is reused unchanged as the theme-repaint mechanism -- a themeVersion signal bumped by onThemeChange is tracked by the same createEffect that already rebuilds on scale/result/inputs changes, so no theme-specific chart code exists at all."
    - "vitest.config.ts's app-project browser.commands block (previously empty) now follows the bench project's own withPreviewServer + fresh-BrowserContext pattern for runOfflineCheck -- a Vitest browser-mode test body has no direct Playwright page/context access, so a Node-side custom command is the only way to genuinely disable the network and reload."
    - "page.viewport(width, height) from vitest/browser (not the deprecated @vitest/browser/context) resizes the real test iframe, which is what makes App.tsx's @media (min-width: 900px) breakpoint actually engage in screenshot-region.browser.test.ts -- resizing a container element does not affect a viewport-based media query."

key-files:
  created:
    - src/app/theme.ts
    - src/app/components/ThemeToggle.tsx
    - tests/app/theme.browser.test.ts
    - public/manifest.webmanifest
    - public/icon.svg
    - tests/app/offline.browser.test.ts
    - src/app/components/ResultColumn/ResultSummaryHeader.tsx
    - tests/app/screenshot-region.browser.test.ts
    - tests/app/static-build.test.ts
  modified:
    - src/app/App.tsx
    - src/app/components/ResultColumn/EquityCurveChart.tsx
    - src/app/styles.css
    - vite.config.ts
    - vitest.config.ts
    - bench/browser-commands.d.ts
    - public/_headers
    - index.html

key-decisions:
  - "ThemeToggle is a single 44x44 control cycling system -> light -> dark -> system (not a three-button group like LogScaleToggle), per the plan's own 'a small control cycling the override' wording, and is deliberately never accent-colored -- accent stays reserved for the equity-curve stroke, the active scale toggle, focus outlines and the Copy link button, per the task's own instruction."
  - "vite.config.ts sets manifest: false on the VitePWA plugin so it does not generate its own competing manifest.webmanifest -- public/manifest.webmanifest is a hand-authored static file, and index.html's <link rel=\"manifest\"> points at it directly."
  - "maximumFileSizeToCacheInBytes (2,500,000) was set only after measuring the real `npm run build` PWA output ('precache 19 entries (1757.82 KiB)'), not carried forward from RESEARCH.md's 3,000,000 placeholder -- the comment names the measured figure and the date."
  - "runOfflineCheck's DATA-08-adjacency check (a non-default symbol computes offline) sets the entry date to 2015-01-02 after switching symbols, not just the symbol alone -- the default landing run's entry date is SPX's own earliest strict-tier date, which predates every other bundled symbol's strict tier, so a bare symbol switch alone reliably hits D-12's eviction path rather than proving a genuine offline compute. 2015-01-02 postdates every bundled symbol's strict-tier first date (latest: TQQQ/total-return at 2010-02-11)."
  - "The static-build test's external-URL allow-list carries four reasoned entries, not the plan's two named examples alone: the SVG namespace URI and a Workbox console.warn documentation link (bit.ly/wb-precache) as named, plus the MathML namespace URI (Solid.js's own DOM-namespace codegen) and the SEC EDGAR citation strings src/validation/cost-parameters.ts embeds for D-18's inline-source-citation requirement -- both discovered by actually scanning a real build rather than guessing the allow-list contents in advance."
  - "The D-20 screenshot region wraps ResultSummaryHeader (new: symbol, effective date range from KernelInputs.window, bundle version) plus the chart-scale-row/chart/ruin-banner/metrics-panel block in one data-testid=\"screenshot-region\" element. ValidationExplanation renders OUTSIDE the region -- the plan's own D-20 element list names exactly five things (symbol, date range, bundle version, chart, metrics) plus the ruin banner, not the D-11/D-12 error surface."

requirements-completed: [VIZ-11, DATA-08, APP-03]

coverage:
  - id: D1
    description: "Both palettes ship and the theme follows prefers-color-scheme with a manual override that a live system-preference flip does not override, resolved to a data-theme attribute"
    requirement: VIZ-11
    verification:
      - kind: e2e
        ref: "tests/app/theme.browser.test.ts > with prefers-color-scheme emulated dark, data-theme resolves to dark and the background computes to the dark token; > forcing the light override flips both, even while the system reports dark; > flipping the emulated system preference while an override is active does not change the resolved theme; > clearing the override returns to following the system"
        status: pass
    human_judgment: false
  - id: D2
    description: "The chart canvas explicitly repaints on a theme change (no free prefers-color-scheme styling on canvas) -- proven from sampled canvas pixel data, not CSS"
    requirement: VIZ-11
    verification:
      - kind: e2e
        ref: "tests/app/theme.browser.test.ts > the chart canvas's sampled stroke pixel differs between the light and dark themes"
        status: pass
    human_judgment: false
  - id: D3
    description: "The service worker precaches the app shell plus all 13 compiled .bin assets and the JSON manifest (D-04) -- the whole bundled universe, not just the shell"
    requirement: DATA-08
    verification:
      - kind: other
        ref: "npm run build's own PWA v1.3.0 output ('precache 19 entries (1757.82 KiB)'); grep -oE 'url:\"data/[^\"]*\"' dist/sw.js | wc -l returns 14 (13 .bin files + manifest.*.json)"
        status: pass
    human_judgment: false
  - id: D4
    description: "After one successful load, a fresh offline reload reaches app-interactive with zero failed requests, and a symbol other than the default landing run's can be selected and computed while offline"
    requirement: DATA-08
    verification:
      - kind: e2e
        ref: "tests/app/offline.browser.test.ts > the offline reload reaches app-interactive with zero failed requests, and a non-default symbol computes offline"
        status: pass
      - kind: other
        ref: "npm run bench's DATA-BUNDLE-BYTES row still reports verdict=pass -- the service worker does not change what a cold load transfers"
        status: pass
    human_judgment: false
  - id: D5
    description: "The emitted dist/ build reaches no external origin: every js/css/html file is scanned for an absolute URL against a reasoned allow-list; no non-relative index.html script/link host; no server-side runtime file; no canvas-capture code or image-export dependency"
    requirement: APP-03
    verification:
      - kind: unit
        ref: "tests/app/static-build.test.ts (4 tests, unit project); manually verified once with dist/ renamed away that the beforeAll throws the named 'run \"npm run build\" first' message"
        status: pass
    human_judgment: false
  - id: D6
    description: "One element (data-testid=screenshot-region) contains the symbol, the effective date range, the bundle version, the chart, the metrics and the ruin banner when present, self-contained at both the widest and narrowest supported viewports, in both the normal and ruined states; no capture/export code ships this phase"
    verification:
      - kind: e2e
        ref: "tests/app/screenshot-region.browser.test.ts (4 tests: normal/ruined states x 320px/1440px viewports via vitest/browser's page.viewport)"
        status: pass
    human_judgment: false

duration: ~2h
completed: 2026-08-20
status: complete
---

# Phase 4 Plan 8: Theme, Offline Precaching, and the Static-Build Gate Summary

**Both palettes ship with an explicitly repainted canvas on theme change (D-19/VIZ-11), a `vite-plugin-pwa` service worker precaches the whole bundled universe so the app works offline for every symbol after one load (D-04/DATA-08), and a mechanical `dist/`-scanning test now gates the build against any external-origin reference (APP-03) -- with the D-20 screenshot region (symbol, date range, bundle version, chart, metrics, ruin banner) built as one self-contained, testably-contained element.**

## Performance

- **Duration:** ~2h
- **Tasks:** 3 (all `type="auto"`, no checkpoints)
- **Files modified:** 17 (9 created, 8 modified)
- **Commits:** 3

## Accomplishments

- `src/app/theme.ts`: `resolveTheme`/`setThemeOverride`/`onThemeChange`/`initTheme`, resolving `prefers-color-scheme` plus a session-only manual override to a `data-theme` attribute; `getMediaQueryList` re-queries `window.matchMedia` on every call (never cached at module-import time) so `tests/app/theme.browser.test.ts`'s `vi.stubGlobal('matchMedia', ...)` stubs are genuinely observed.
- `ThemeToggle.tsx`: a single 44x44 control cycling system -> light -> dark -> system, hand-authored inline SVG icons (`currentColor`, no hex literal), deliberately never accent-colored.
- `EquityCurveChart.tsx`: subscribes to `onThemeChange` and reuses its existing destroy-and-recreate `rebuildChart()` as the repaint mechanism on a theme change -- no new chart code path.
- `vite.config.ts` + `public/manifest.webmanifest` + `public/icon.svg`: `VitePWA(generateSW)` precaches the app shell plus all 13 `.bin` assets and the JSON manifest; `manifest: false` so the plugin doesn't generate a competing manifest; `maximumFileSizeToCacheInBytes` set from a real measured build total, not RESEARCH.md's placeholder.
- `vitest.config.ts`'s new `runOfflineCheck` app-project command: registers the service worker, disables the network at the Playwright layer, reloads, and reports interactive status, failed-request count, and whether a non-default symbol computed offline.
- `public/_headers`: adds short-cache rules for `/index.html` and `/sw.js`, leaving both Phase 2 immutable rules untouched.
- `tests/app/static-build.test.ts`: scans every emitted `.js`/`.css`/`.html` file for an external URL against a four-entry reasoned allow-list (SVG namespace, MathML namespace, a Workbox doc link, and the SEC EDGAR citation strings D-18 requires); also gates the non-relative-host, server-side-runtime-file, and no-capture-code checks.
- `ResultSummaryHeader.tsx` + `App.tsx`'s `data-testid="screenshot-region"` wrapper: the D-20 self-contained rectangle, proven contained at 320px and 1440px viewports in both normal and ruined states.

## Task Commits

1. **Task 1: Theme resolution, the manual override, and an explicitly repainted canvas** - `42b96a3` (feat)
2. **Task 2: Offline after first load, for the whole bundled universe** - `57746e3` (feat)
3. **Task 3: The static-build gate and the self-contained screenshot region** - `e7c94b4` (feat)

## Files Created/Modified

- `src/app/theme.ts` - theme resolution, override, change notification (D-19)
- `src/app/components/ThemeToggle.tsx` - the manual override control
- `tests/app/theme.browser.test.ts` - 5 cases covering resolution, override, live system flip, clearing, and canvas repaint
- `src/app/components/ResultColumn/EquityCurveChart.tsx` - subscribes to `onThemeChange`, rebuilds on theme change
- `src/app/App.tsx` - mounts `ThemeToggle`, calls `initTheme()`, wraps the D-20 screenshot region
- `src/app/styles.css` - `.theme-toggle` (never accent), `.screenshot-region`, `.result-summary-header` tokens
- `vite.config.ts` - `VitePWA(generateSW)`, measured `maximumFileSizeToCacheInBytes`
- `public/manifest.webmanifest` / `public/icon.svg` - the hand-authored PWA manifest and its local icon
- `public/_headers` - short-cache rules for `/index.html` and `/sw.js`, both Phase 2 rules untouched
- `index.html` - `<link rel="manifest">` / `<link rel="icon">`, `theme-color` meta
- `vitest.config.ts` - `runOfflineCheck` command on the `app` project
- `bench/browser-commands.d.ts` - `OfflineCheckReport` type augmentation
- `tests/app/offline.browser.test.ts` - offline-after-first-load + non-default-symbol-offline proof
- `src/app/components/ResultColumn/ResultSummaryHeader.tsx` - symbol, effective date range, bundle version
- `tests/app/static-build.test.ts` - the APP-03 gate (unit project)
- `tests/app/screenshot-region.browser.test.ts` - containment proof, 4 cases

## Decisions Made

See `key-decisions` in frontmatter: ThemeToggle's single-control cycling design and never-accent styling, `manifest: false`, the measured `maximumFileSizeToCacheInBytes`, `runOfflineCheck`'s entry-date fix for the offline-symbol-switch proof, the four-entry (not two) reasoned URL allow-list, and the screenshot region's exact element boundary (excluding `ValidationExplanation`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `vite-plugin-pwa` was declared in `package.json`/`package-lock.json` but not installed in `node_modules`**
- **Found during:** Task 2, first attempt to import `VitePWA` from `vite.config.ts`
- **Issue:** Plan 04-01's research pinned and locked `vite-plugin-pwa@1.3.0`, but no prior plan had actually imported it, so `node_modules/vite-plugin-pwa` did not exist.
- **Fix:** Ran `npm install` (no new package resolution -- the exact pinned version was already in `package-lock.json`, this only synced `node_modules` with the existing lockfile). Package-legitimacy research already covers `vite-plugin-pwa` as "Approved" in 04-RESEARCH.md's audit table.
- **Files modified:** none (`package.json`/`package-lock.json` unchanged -- confirmed via `git diff --stat`)
- **Verification:** `npm run typecheck && npm run build` both succeed with the plugin active.
- **Committed in:** not applicable (no file changes to commit; `node_modules` is gitignored)

**2. [Rule 1 - Bug] `runOfflineCheck`'s non-default-symbol check initially failed because a bare symbol switch reliably evicted the run**
- **Found during:** Task 2, first run of `tests/app/offline.browser.test.ts`
- **Issue:** The default landing run's entry date is SPX's own earliest strict-tier date (1988-01-05), which predates every OTHER bundled symbol's strict-tier first date (latest: TQQQ/total-return at 2010-02-11). Switching only the symbol select left the stale, too-early entry date in place, which `buildKernelInputs` correctly rejects (D-12), so `metrics-panel` never appeared and the check always reported `nonDefaultSymbolComputed: false`.
- **Fix:** After switching the symbol, `runOfflineCheck` also fills the entry-date input with `2015-01-02` (a date past every bundled symbol's strict-tier first date) before waiting for `metrics-panel`.
- **Files modified:** `vitest.config.ts`
- **Verification:** `tests/app/offline.browser.test.ts` passes; the comment in `vitest.config.ts` documents why the date is needed.
- **Committed in:** `57746e3` (Task 2's own commit)

---

**Total deviations:** 2 auto-fixed (1 blocking dependency-sync, 1 self-caught test-logic bug)
**Impact on plan:** No scope creep. Neither deviation touched a file outside this plan's own artifact list.

## Issues Encountered

None beyond the deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The D-20 screenshot region (`data-testid="screenshot-region"`) is a stable DOM contract Phase 8's SHARE-04 PNG export can capture directly -- no redesign needed, per D-20's own explicit intent.
- The theme module's `onThemeChange` subscription pattern is available for any future component (e.g. a Phase 6/7 heatmap canvas) that needs the same explicit-repaint-on-theme-change treatment `EquityCurveChart` already has.
- `vite-plugin-pwa`'s precache is content-hash-based (Workbox's own mechanism), so future bundle updates invalidate only what changed -- no additional cache-busting work needed from later phases.
- No blockers carried forward from this plan. This is the last plan of Phase 4.

## Self-Check: PASSED

Verified on disk: `src/app/theme.ts`, `src/app/components/ThemeToggle.tsx`, `public/manifest.webmanifest`, `public/icon.svg`, `src/app/components/ResultColumn/ResultSummaryHeader.tsx`, `tests/app/theme.browser.test.ts`, `tests/app/offline.browser.test.ts`, `tests/app/static-build.test.ts`, `tests/app/screenshot-region.browser.test.ts` all present.
Verified in `git log`: `42b96a3`, `57746e3`, `e7c94b4` all present on branch `worktree-agent-a1dbe01c038711fd3`.
Verified via full suite: `npm run typecheck && npm test (523) && npm run test:app (45, run twice) && npm run bench && npm run build` all exit 0. `DATA-BUNDLE-BYTES`/`DATA-BUNDLE-DECODE`/`PERF-07a`/`PERF-07b`/`PERF-08a`/`PERF-08b`/`PERF-08c` all report verdict `pass`. `public/_headers` still contains both Phase 2 immutable rules verbatim.

---
*Phase: 04-first-defensible-backtest-in-the-browser*
*Completed: 2026-08-20*
