---
status: awaiting_human_verify
trigger: "PNG export renders a blank equity-curve canvas on the FIRST capture after any chart rebuild, in Safari only. The second capture is correct. Reported by the user during plan 08-05 Task 3's manual Safari verification."
created: 2026-08-26
updated: 2026-08-26
phase: 08-export-and-the-canonical-arguments
blocks: "08-05 Task 3 human-verify checkpoint (SHARE-04)"
---

# Debug: PNG export blank canvas on first capture in Safari

## Symptoms

**Expected behavior:** Clicking Export PNG produces an image containing the full
`.screenshot-region`, including the live `<canvas>` content (the equity curve, and in sweep mode
the heatmap), on every capture including the first one after page load.

**Actual behavior:** In Safari, the first capture after a fresh load returns an image whose
equity-curve area is blank. Clicking Export a second time returns a correct image with the curve
present. After that it keeps working, until the chart canvas is rebuilt, at which point the next
capture is blank again and the second one is correct. Toggling the theme rebuilds the chart and
re-triggers the cycle. Clearing the site cache and loading fresh reproduces it from the top.

**Error messages:** None reported. No console errors. The capture succeeds and returns a Blob;
only the canvas-derived region of the image is blank.

**Timeline:** Present since the PNG export path shipped in plan 08-01 (commit `8172379`). Never
worked correctly in Safari. Not a regression.

**Reproduction:**
1. Clear site data (or use a fresh Private window) and load the app in Safari.
2. Wait for the default landing run to render.
3. Click Export PNG. Paste the clipboard image somewhere. Equity curve is missing.
4. Click Export PNG again. Paste. Equity curve is present.
5. Toggle the theme (which destroys and recreates the uPlot instance). Click Export PNG.
   Curve missing again. Click again. Present.

**Browser scope:** Safari/WebKit only. Chromium is unaffected, verified by the user in Chrome and
by the repo's own Chromium-only `app` test project, which is green (189/189).

## Current Focus

status_note: "Fix applied and verified in Playwright WebKit and Chromium. Awaiting human verification in real Safari (08-05 Task 3 gate)."

next_action: "User confirms in real Safari, after unregistering the service worker. Then archive to resolved/ and append to the knowledge base."

## Candidate fixes (from the orchestrator's pre-session analysis, NOT yet tested)

1. **Preferred, root-cause targeted.** Before calling `toBlob`, walk the live `<canvas>` elements
   inside the region, call `canvas.toDataURL()` with the same default arguments the library uses
   (no arguments, see `clone-node.js:48`), construct an `Image` with that exact URL and
   `await img.decode()`. This places the identical byte string into WebKit's image cache under the
   same key the library will later request, so the foreignObject rasterization finds it warm on the
   first capture. Roughly 20 lines in `src/export/png-export.ts`, one extra `toDataURL` per canvas.
   UNPROVEN ASSUMPTION: that WebKit serves the SVG document's nested subresource load from the same
   memory-cache entry. Plausible, not established. Must be verified, not assumed.

2. **Documented fallback.** Call the capture twice and discard the first result. This is what the
   `html-to-image` issue tracker recommends and the user's own observation shows it always works.
   It is a bandaid, it roughly doubles export cost, and it would invalidate 08-05's PERF-07a PNG
   figure. Use only if (1) is disproven in real Safari.

3. **Variant of (1).** Temporarily substitute each live `<canvas>` in the region with an
   already-decoded `<img>` for the duration of the capture, then restore. This bypasses
   `cloneCanvasElement` entirely so the clone contains an element we decoded ourselves. Same
   cache-key question as (1) but removes the library from that step.

## Constraints

- `src/export/png-export.ts` is the only call site. Its scope is `.screenshot-region` only
  (T-08-02) and the `data-export-exclude` filter (F-02) may only ever subtract from that scope,
  never widen it.
- The live region is resized to `EXPORT_WIDTH_PX` and restored in a `finally` block. Any fix must
  preserve that restoration on every path, including throws.
- The sweep-mode heatmap canvas is very likely affected by the same defect. Check it; do not fix
  only the equity curve and declare the bug closed.
- **08-05's measured PERF-07a PNG figure (0.00ms) was taken in Chromium against this buggy code.**
  Any fix that adds a decode step invalidates it and requires a re-measure through the existing
  `bench/perf-08-export.bench.test.ts` harness.
- PERF-01a is absolute in this project: never alter a threshold, calibration anchor or
  normalization constant in response to a measurement. If the fix pushes the PNG figure over
  PERF-07a's 50ms budget, escalate it as a PROJECT.md Key Decision. Do not tune the budget.
- Project CLAUDE.md forbids the em dash character anywhere in output, including code comments.

## Environment

- Playwright WebKit 2336 IS INSTALLED AND LAUNCHES. `npx playwright install-deps webkit` was run by
  the orchestrator and succeeded; a smoke test confirmed launch with UA
  `AppleWebKit/605.1.15 Version/26.5 Safari/605.1.15`. Import it from `playwright-core` (the bare
  `playwright` package did not resolve in a scratch ESM script; `playwright-core` did). You have a
  real WebKit reproduction loop. USE IT rather than round-tripping every hypothesis through the
  user's manual Safari.
- Playwright WebKit is NOT real Safari. A reproduction there is strong evidence and a fast
  fix-verify loop, but a PASS there does not close plan 08-05's Task 3 gate, which names real
  Safari specifically. Final confirmation still requires the user.
- The repo's `app` vitest project is Chromium-only (`vitest.config.ts`, `instances: [{ browser:
  'chromium' }]`). Adding a `webkit` instance was flagged as a deferred scope decision in
  08-RESEARCH.md; this bug is the argument for taking it, if WebKit can be made to run.
- `npm run test` is the `unit` project and EXCLUDES browser tests. Run `npm run test:app` too, and
  report both counts separately.
- The app registers a `vite-plugin-pwa` service worker that precaches `index.html`, so a stale
  build can be served indefinitely in Safari. Any manual verification instruction handed to the
  user MUST include unregistering the worker and closing all tabs for the origin first, or the
  result is meaningless.

## Evidence

- timestamp: 2026-08-26
  finding: |
    Read `node_modules/html-to-image/lib/clone-node.js:44-54`. `cloneCanvasElement` calls
    `canvas.toDataURL()` and returns `createImage(dataURL)`. Read `util.js:201-214`: `createImage`
    resolves after `onload`, then `img.decode()`, then one `requestAnimationFrame`. So the
    substituted image is decoded, but only as a standalone document image, before serialization.
- timestamp: 2026-08-26
  finding: |
    Read `util.js:216-223`. `svgToDataURL` serializes the clone with `XMLSerializer` into a
    `data:image/svg+xml;charset=utf-8,...` URL. The nested `<img>` data URLs are therefore embedded
    as text inside a new SVG document, and are loaded as that document's own subresources when the
    outer image loads. This is the boundary the decode guarantee does not cross.
- timestamp: 2026-08-26
  finding: |
    Ruled out, with evidence: (a) theme tokens: both `:root` and `[data-theme='dark']` declare
    `--color-accent` as a solid hex in `src/app/styles.css:11,37`, so no empty-token path;
    (b) detached ArrayBuffers: `src/export/csv-export.ts:12` and `src/export/csv.worker.ts:12`
    explicitly avoid `Comlink.transfer` for this exact reason, and the only transfers in `src/` are
    `sweep-pool.ts:377` and `sweep.worker.ts:327,363`, which move the sweep's own scratch buffers,
    never the single-run `KernelOutputs` the equity chart reads.
- timestamp: 2026-08-26
  finding: |
    The user initially reported this as "the curve is gone when I toggle theme", which read as an
    on-screen chart failure. It is not: the on-screen chart is fine in both browsers. It is the
    EXPORTED PNG that is blank. The theme toggle is only relevant because it rebuilds the canvas
    and therefore changes the data URL.
- timestamp: 2026-08-26
  checked: |
    REPRODUCED in Playwright WebKit 2336 against the real production build (`npm run build` +
    vite preview), driving the real Export PNG button. Oracle: decode the exported blob back into
    an OffscreenCanvas in-page and count non-background pixels inside each live canvas element's
    bounding box, measured in export coordinates (region re-laid-out to EXPORT_WIDTH_PX, scaled by
    EXPORT_PIXEL_RATIO). Harness: scratchpad `repro/repro.mjs`.
  found: |
    Single-run mode, WebKit, one page session, two consecutive captures:
      capture 1: equity-curve canvas box = 0 non-background pixels out of 1,321,920 (0.0000%)
      capture 2: same box = 107,867 / 1,321,920 (8.1599%)
      pixel diff between the two captures: 132,110 differing pixels, bbox (49,223,1788x654),
      which lies entirely inside the canvas box (48,202,1836x720).
    Chromium, identical procedure: capture 1 == capture 2 byte-for-byte (0 differing pixels),
    canvas box 8.2277% both times.
  implication: |
    The reported symptom is exact and mechanical, and the browser differential is clean. The
    defect is confined to canvas-derived pixels. Two consecutive captures of an unchanged region
    are not identical in WebKit, which is itself an invariant violation independent of any
    theory about the cause.
- timestamp: 2026-08-26
  checked: |
    Sweep mode in WebKit, enumerating EVERY `<canvas>` inside `.screenshot-region` rather than
    only the one named in the bug report.
  found: |
    Seven canvases in the region, ALL blank on capture 1 and all correct on capture 2:
      heatmap-canvas              1.9418% -> 99.8237%
      heatmap-crosshair-overlay   (same box as above)
      horizontal-slice-chart      0.0000% -> 11.3557%
      vertical-slice-chart        0.5552% ->  6.8401%
      legend-ramp                 0.0000% -> 100.0000%
      legend-swatches (x2)        0.0000% ->  96.8750%
    Capture-1-vs-2 diff bbox (48,48,2026x1114) spans the whole canvas-bearing area, not just the
    heatmap.
  implication: |
    Confirms the Constraints section's warning. This is not an equity-curve bug. It is a defect in
    the shared rasterization path that hits every live canvas in the region, so both the fix and
    the regression test must be canvas-generic, not component-specific.
- timestamp: 2026-08-26
  checked: |
    PROBE A (scratchpad `repro/probe.mjs`): is the canvas data URL stable across png-export.ts's
    region resize? Hashed `canvas.toDataURL()` at live layout, immediately after applying the
    EXPORT_WIDTH_PX layout, and 500ms after.
  found: |
    Identical SHA-256 prefix `03245a3dcdcb7510` in all three states, canvas backing store 918x360
    throughout. Corroborated by static reading: there is no `ResizeObserver` anywhere in
    `src/app/components/ResultColumn/*` (the uPlot instance takes its width once at construction,
    `EquityCurveChart.tsx:258`).
  implication: |
    The export resize cannot mutate a canvas bitmap, so any pre-capture warm-up necessarily
    operates on the exact byte string html-to-image will later embed. This removes the only
    confound that could have made candidate fix 1 fail for a reason other than the cache
    assumption itself, which makes PROBE B below a clean test of that assumption.
- timestamp: 2026-08-26
  checked: |
    PROBE B: candidate fix 1's UNPROVEN ASSUMPTION, tested directly. Before the FIRST capture,
    pre-decoded every region canvas via `new Image()` with the identical `toDataURL()` string and
    the identical property order html-to-image uses (`crossOrigin='anonymous'`, `decoding='async'`,
    then `onload` -> `img.decode()` -> one rAF), then clicked Export PNG once.
  found: |
    First capture still 0 non-background pixels out of 1,321,920 (0.0000%). No improvement
    whatsoever over the un-warmed first capture.
  implication: |
    CANDIDATE FIX 1 IS DISPROVEN. WebKit does NOT serve the SVG document's nested foreignObject
    subresource load from the parent document's decoded-image memory cache. The assumption the
    orchestrator flagged as plausible-but-unestablished is false.
- timestamp: 2026-08-26
  checked: |
    PROBE C (scratchpad `repro/probeC.mjs`): candidate fix 3. Temporarily replaced each live
    `<canvas>` in the region with an already-loaded-and-decoded `<img>` at the identical computed
    box, then captured once.
  found: |
    First capture still 0 non-background pixels out of 1,321,920 (0.0000%).
  implication: |
    CANDIDATE FIX 3 IS DISPROVEN, and it fails for the same reason as candidate 1. The debug
    file's premise that candidate 3 "does not depend on that assumption" was wrong: swapping in a
    pre-decoded `<img>` still leaves a `data:` URL to be re-fetched and re-decoded as a
    subresource of the serialized SVG document. The cloning route into the SVG is irrelevant; the
    subresource boundary is what fails.
- timestamp: 2026-08-26
  checked: |
    Whether compositing the live canvas bitmaps onto html-to-image's output is z-order safe in
    this app: for every canvas in the region, sampled an 8x8 grid over its box with
    `document.elementFromPoint` and recorded anything painted above it (scratchpad
    `repro/overlap.mjs`), in single mode, sweep mode, and sweep mode with a committed crosshair.
  found: |
    The only elements ever painted above a canvas are uPlot's transparent `DIV.u-over` and
    `DIV.u-axis` chrome (which paint nothing of their own; uPlot draws axes onto the canvas), and
    `CANVAS.heatmap-crosshair-overlay` above `CANVAS.heatmap-canvas`. The crosshair case is a
    canvas-over-canvas pair whose correct order is already document order. `HoverReadout` never
    appears because it carries `data-export-exclude="true"` and is filtered out (F-02).
  implication: |
    Drawing every region canvas onto html-to-image's output in document order, after it
    rasterizes the DOM, preserves the visible result exactly for this app. The pre-fix Chromium
    capture (known-correct today) is the reference that proves it: if any DOM chrome above a
    canvas actually painted pixels, the composite would erase them and the post-fix Chromium
    capture would differ from the pre-fix one.
- timestamp: 2026-08-26
  checked: |
    Whether the FIX ITSELF regressed anything, by pixel-diffing the post-fix Chromium capture
    against a PRE-FIX Chromium capture taken on this host before any source change (Chromium was
    already correct, so it is a valid reference for "nothing was lost").
  found: |
    Round 1 (canvases drawn OVER html-to-image's output): the heatmap's axis tick labels were
    ERASED. 15,219 large-delta pixels; the crop showed "1997-09-02" and the "1x" leverage ticks
    present in the baseline and gone after. Every blankness assertion still passed while this was
    broken.
  implication: |
    The first overlap probe (`elementFromPoint` sampling) was UNSOUND: the tick labels are
    `pointer-events: none`, so hit-testing cannot see them. Re-probed by geometry plus document
    order instead, which found them immediately. Overdraw was replaced by a layered composite.
- timestamp: 2026-08-26
  checked: |
    Whether anything paints BEHIND a region canvas, which is the property that makes the layered
    composite (background, then canvases, then the transparent DOM layer on top) sound.
  found: |
    No canvas in either result mode has any ancestor with a background-color or background-image.
    Post-fix Chromium diff against the pre-fix baseline: single-run max channel delta 6 with zero
    large deltas; sweep only 128 large-delta pixels, all in the two 16x16 legend swatches, where
    the nested `<img>` used to land 1 device pixel short of its box and the direct draw now fills
    it exactly. Visually confirmed correct.
  implication: |
    The composite reproduces the known-good rendering rather than approximating it. The invariant
    is now pinned by a test rather than left as an undocumented assumption.
- timestamp: 2026-08-26
  checked: |
    PERF-07a re-measure through `bench/perf-08-export.bench.test.ts`, as the Constraints require,
    measuring the PRE-FIX code on THIS host first so the comparison is like-for-like rather than
    against 08-05's figure from another machine.
  found: |
    Pre-fix on this host: png rawMs=0.0000, longTaskCount=0, verdict=pass (reproduces 08-05's
    0.00ms). First fix revision: rawMs=56.0000, normalized 98.68ms, verdict=FAIL against the 50ms
    budget. Second revision (destination-over, no second full-size buffer): rawMs=52.0000,
    normalized 91.63ms, still FAIL. Ablation with the composite and background fill both disabled:
    STILL rawMs=52.0000, which proved the compositing was not the cost at all.
    The real cause was suppressing the library's canvas embedding with `'data:,'`, which routes
    `cloneCanvasElement` down a synchronous `cloneNode(false)` branch and removes the per-canvas
    `createImage` awaits that had been splitting the library's work across several short tasks.
    Substituting a 1x1 transparent PNG instead keeps the `<img>` path and its task boundaries:
    final measurement png rawMs=0.0000, longTaskCount=0, verdict=pass.
  implication: |
    PERF-07a is back to the pre-fix figure exactly. No threshold, anchor, or normalization constant
    was touched (PERF-01a), and no escalation is needed. The 52ms intermediate result is recorded
    here because it is the reason the final implementation uses a 1x1 pixel rather than the more
    obvious `'data:,'`.
- timestamp: 2026-08-26
  checked: |
    Whether a WebKit regression test would actually have caught this bug (the deferred scope
    decision from 08-RESEARCH.md), by running the new regression file against the ORIGINAL buggy
    `png-export.ts` in both engines.
  found: |
    Against the buggy code: WebKit 2 failed / 3 passed, failing with the exact diagnostic
    ("canvas is blank in the FIRST exported capture: 0 pixels differ from the background inside
    its box"). Chromium against that SAME buggy code: 5 passed. Against the fixed code both are
    5/5. Running the WHOLE `app` suite under WebKit: 52 of 189 fail, dominated by WebKit's
    `history.replaceState` rate limit (which Chromium does not enforce) and Chromium-generated
    `__screenshots__` baselines. Scoped `app-webkit` project runtime: 2.9s.
  implication: |
    Decided on evidence: added a WebKit vitest project scoped to the canvas-fidelity file only.
    It demonstrably catches this bug class, costs 2.9s, and avoids a 52-failure suite migration
    that is a separate piece of work.
- timestamp: 2026-08-26
  checked: |
    The first 1x1 placeholder was a hardcoded base64 literal believed to be a transparent pixel.
  found: |
    It is not transparent. WebKit rendered a solid blue wash over the entire chart area, and ONLY
    on the second capture, because the first capture lost it to the very decode race being fixed.
    Caught by the capture-1-vs-capture-2 determinism check.
  implication: |
    Replaced with a pixel generated by the browser's own encoder from a fresh 1x1 canvas, which is
    transparent by specification. Recorded because a hand-written literal here fails in an
    unusually deceptive way: correct-looking first capture, corrupted second.

## Eliminated

- hypothesis: "Theme custom properties resolve empty in one palette, so uPlot draws with no stroke"
  evidence: "Both palettes declare every token as a solid hex value (src/app/styles.css:11-48)."
- hypothesis: "A typed-array buffer backing the chart series is detached by a worker transfer"
  evidence: "Comlink.transfer is deliberately not used on KernelOutputs; the only transfers are the sweep pool's own scratch buffers."
- hypothesis: "Safari was rendering a stale precached build via the service worker"
  evidence: "Plausible and worth ruling out (the SW does precache index.html), but the user reproduced the cycle deterministically after a cache clear, and the first-blank/second-correct pattern is not explicable by staleness."
- hypothesis: "The on-screen equity curve disappears on theme change"
  evidence: "Withdrawn. The on-screen chart renders correctly in both browsers; the defect is in the exported image only."
- hypothesis: "Candidate fix 1: pre-decoding the identical toDataURL string warms WebKit's image cache so the nested foreignObject subresource resolves synchronously"
  evidence: "PROBE B. Prewarmed every region canvas with the byte-identical data URL (proven identical by PROBE A's hash) using html-to-image's own createImage property order, then captured. First capture still 0/1,321,920 non-background pixels. WebKit does not satisfy the SVG document's subresource load from the parent document's cache."
  timestamp: 2026-08-26
- hypothesis: "Candidate fix 3: substituting each live canvas with an already-decoded <img> bypasses cloneCanvasElement and therefore the defect"
  evidence: "PROBE C. Swapped every region canvas for a loaded-and-decoded <img> at the identical box, then captured. First capture still 0/1,321,920. The substituted img's src is still a data: URL that the serialized SVG document must load as its own subresource, so it hits the identical boundary. The route into the clone was never the variable."
  timestamp: 2026-08-26
- hypothesis: "The blankness depends on the canvas data URL changing (theme toggle changing the cache key)"
  evidence: "Refined, not eliminated. PROBE A shows the URL is stable across the export resize, and the observed cycle is consistent with a per-URL cache entry. But since PROBE B shows warming that entry from the parent document does not help, the cache is not the mechanism a fix can act on."
  timestamp: 2026-08-26

## Resolution

root_cause: |
  `html-to-image` never puts canvas PIXELS into its output. `cloneCanvasElement` replaces each live
  `<canvas>` with an `<img src="data:image/png;...">`, `svgToDataURL` serializes the whole clone
  into a single `data:image/svg+xml` URL, and `toCanvas` loads THAT into one `Image` and draws it.
  The per-canvas images are therefore subresources of a different document, and WebKit resolves the
  outer image's `load` and `decode()` before those subresources have decoded, so they rasterize as
  nothing. Every canvas in `.screenshot-region` is blank on the first capture of a given bitmap; the
  second capture works, which is what made it look like a caching problem.

  This is an AND-gate failure of two conditions: WebKit's foreignObject subresource timing
  (environment, not fixable here) AND the export routing canvas pixels across that boundary (code,
  the only actionable condition). Chromium runs the same code correctly, and WebKit renders the same
  canvases correctly on screen, so neither condition alone is sufficient.

fix: |
  `src/export/png-export.ts` stops sending canvas pixels through the foreignObject entirely.

  1. `suppressLibraryCanvasRasterization` shadows each region canvas's `toDataURL` for the duration
     of the capture so the library embeds a 1x1 transparent PNG instead of the chart. The canvas
     ELEMENT stays in the clone at its exact box, so layout is untouched, but it carries no pixels
     and there is nothing left to race. Restored in a `finally`.
  2. `toCanvas` replaces `toBlob` so the result can be composited before encoding, and is called
     with no `backgroundColor`, leaving the DOM layer transparent wherever nothing painted.
  3. `compositeLiveCanvases` draws each non-excluded live canvas's own backing store into that
     canvas with `globalCompositeOperation = 'destination-over'`, in REVERSE document order, then
     fills D-02's opaque theme background last. Everything the DOM painted above a canvas (the
     heatmap's `pointer-events: none` axis tick labels) stays above it.

  The 1x1 placeholder is generated by the browser's own encoder, and is deliberately not `'data:,'`:
  that value routes the library down a synchronous `cloneNode(false)` branch, removing the
  per-canvas awaits that keep its work split into short tasks, which alone pushed PERF-07a from 0 to
  a 52ms long task.

verification: |
  - Playwright WebKit 2336, real production build, real Export PNG button, both result modes:
    FIRST capture correct and byte-identical to the second (0 differing pixels). Pre-fix the first
    capture measured 0 non-background pixels out of 1,321,920 inside the equity canvas box.
  - Sweep mode: all seven region canvases correct on the first capture.
  - Chromium post-fix vs PRE-FIX baseline: single-run max channel delta 6, zero large deltas; sweep
    only the 128-pixel legend-swatch edge that the direct draw now fills exactly. Nothing erased.
  - PERF-07a re-measured: png rawMs=0.0000, longTaskCount=0, verdict=pass, identical to the pre-fix
    figure on the same host. No budget, anchor or normalization constant altered.
  - `npm run test` (unit): 845 passed / 63 files.
  - `npm run test:app` (Chromium): 194 passed / 29 files (was 189/28; +5 new).
  - `npm run test:app:webkit` (new WebKit gate): 5 passed / 1 file, 2.9s.
  - Red-phase proof: the new gate fails 2/5 against the ORIGINAL code in WebKit and passes 5/5
    against that same original code in Chromium.
  - NOT YET CONFIRMED in real Safari. Playwright WebKit is not Safari; 08-05 Task 3 names Safari.

files_changed:
  - "src/export/png-export.ts: the fix"
  - "tests/app/export-png-canvas-fidelity.browser.test.ts: new regression file, 5 tests"
  - "vitest.config.ts: new app-webkit project scoped to that file"
  - "package.json: test:app:webkit script"

## Observations logged, not fixed (out of scope for this session)

- WebKit enforces a `history.replaceState` rate limit ("more than 100 times per 10 seconds") that
  Chromium does not. It surfaced as `SecurityError` in 16 test failures when the whole `app` suite
  was run under WebKit, thrown from `writePermalinkUrl` (`src/app/state.ts:883`) via
  `flushPermalinkUrl`. Most of those are the test harness's own per-test permalink reset, but the
  app's real permalink write path is the same code, so a real Safari user making rapid parameter
  changes could plausibly trip it. Worth its own investigation; deliberately not touched here.
- Adopting WebKit across the whole `app` project needs WebKit `__screenshots__` baselines in
  addition to the above. 52 of 189 fail today.
