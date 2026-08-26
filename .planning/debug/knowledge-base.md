# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of
new investigations.

---

## png-export-blank-canvas-safari: every `<canvas>` in the PNG export is blank on the first capture, WebKit/Safari only

- **Date:** 2026-08-26
- **Error patterns:** blank canvas in exported PNG, first capture blank second capture correct, Safari only, WebKit only, Chromium unaffected, html-to-image, foreignObject, toBlob, toCanvas, cloneCanvasElement, canvas.toDataURL, svgToDataURL, data:image/svg+xml, subresource decode race, theme toggle rebuilds chart, uPlot, heatmap canvas, no console errors
- **Root cause(s):** `html-to-image` never puts canvas pixels into its output: `cloneCanvasElement` swaps each live `<canvas>` for an `<img src="data:image/png;...">`, then `svgToDataURL` serializes the whole clone into one `data:image/svg+xml` URL and `toCanvas` loads THAT into a single `Image`. The per-canvas images are therefore subresources of a *different* document; **WebKit resolves the outer image's `load` and `decode()` before those nested subresources have decoded, so they rasterize as nothing**. AND-gate of two conditions, neither sufficient alone: (1) WebKit's foreignObject nested-subresource timing, which is environment and not fixable in this repo, AND (2) the export routing canvas pixels across that boundary at all, which is code and the only actionable condition. Chromium runs the identical code correctly, and WebKit renders the same canvases correctly on screen.
- **Fix:** `src/export/png-export.ts` stops sending canvas pixels through the foreignObject. It shadows each region canvas's `toDataURL` for the duration of the capture so the library embeds a 1x1 transparent PNG (element stays in the clone at its exact box, so layout is untouched, but there is nothing left to race), switches `toBlob` to `toCanvas` with no `backgroundColor`, then composites each live canvas's own backing store into the result with `globalCompositeOperation = 'destination-over'` in reverse document order, filling the opaque theme background last. Shadowing is undone in a `finally`.
- **Files changed:** src/export/png-export.ts, tests/app/export-png-canvas-fidelity.browser.test.ts (new, 5 tests), vitest.config.ts (new `app-webkit` project), package.json (`test:app:webkit` script)
- **Why not caught:** No gate existed for this class. The `app` browser project was Chromium-only (`vitest.config.ts`, `instances: [{ browser: 'chromium' }]`), so WebKit-specific rasterization behavior sat outside every automated gate in the repo. Proven structural rather than incidental: the new regression file run against the ORIGINAL buggy code fails 2/5 in WebKit with the exact diagnostic, and passes 5/5 in Chromium against that same buggy code. No Chromium-only test, however well written, could have caught it. 08-RESEARCH.md had already flagged a WebKit instance as a deferred scope decision; this bug is what converted the deferral into a decision.
- **Recurrence guard:** `tests/app/export-png-canvas-fidelity.browser.test.ts` (5 tests) plus a new `app-webkit` vitest project scoped to that one file, run via `npm run test:app:webkit`. Red-phase proven (2/5 fail against the original code in WebKit), so the guard is known to bite rather than assumed to.

### Durable finding 1: the WebKit-in-CI decision, and its scope boundary

The decision was **scoped WebKit, not WebKit everywhere**, and the boundary is measured, not
guessed. Record the boundary, not just the verdict:

| Scope | Result | Cost |
|---|---|---|
| `app-webkit` project, canvas-fidelity file only | 5/5 green | **2.9s** |
| Whole `app` suite under WebKit | **52 of 189 fail** | not viable today |

The 52 failures are dominated by two causes with nothing to do with this bug: WebKit's
`history.replaceState` rate limit (which Chromium does not enforce) and `__screenshots__` baselines
that were generated under Chromium.

**Do not widen the `app-webkit` project's `include` glob** without first generating WebKit
screenshot baselines and addressing the permalink write rate. Widening it turns a 2.9s green gate
into a 52-failure red one. Conversely, do not read "WebKit is too expensive" from those 52
failures: the scoped gate is the counter-example, and it is the only gate in the repo that can see
this bug class at all.

### Durable finding 2: why the canvas placeholder is a real 1x1 PNG and never `'data:,'`

`'data:,'` is the obvious choice for "embed nothing" and it is **wrong here for a non-obvious
reason**. It routes `cloneCanvasElement` down a synchronous `cloneNode(false)` branch, which
removes the per-canvas `createImage` awaits (`onload`, then `decode()`, then a
`requestAnimationFrame`). Those awaits had been splitting the library's work across several short
tasks. Without them the work coalesces into one long task.

Measured on one host through `bench/perf-08-export.bench.test.ts`:

| Variant | png rawMs | Verdict vs PERF-07a's 50ms |
|---|---|---|
| Pre-fix code | 0.0000 | pass, longTaskCount=0 |
| Fix using `'data:,'` placeholder | 52.0000 (normalized 91.63) | **FAIL** |
| Same, with composite and background fill both ABLATED | 52.0000 | **FAIL**, proving compositing was not the cost |
| Fix using a real 1x1 transparent PNG | 0.0000 | pass, longTaskCount=0 |

The ablation row is the load-bearing one: it rules out the composite as the cause and pins the cost
on the placeholder value alone. Anyone later "simplifying" that 1x1 PNG to `'data:,'` will silently
reintroduce a 52ms long task and breach PERF-07a, with no visual symptom to warn them. The rationale
is also carried in a comment at `src/export/png-export.ts:86`.

Second trap in the same place: the 1x1 payload **must actually be transparent**. A hand-written
base64 literal believed to be transparent was not, and WebKit rendered a solid blue wash over the
whole chart area, visible ONLY on the second capture (the first capture lost it to the very decode
race being fixed). Generate the pixel from a fresh 1x1 canvas via the browser's own encoder, where
transparency is guaranteed by specification. This failure mode is invisible to any blankness
assertion; it was caught only by the capture-1-vs-capture-2 determinism check.

### Verifying a Safari fix: how to actually defeat the service worker

The app registers a `vite-plugin-pwa` service worker that precaches `index.html`, so Safari will
serve a stale build indefinitely and quietly invalidate any manual verification.

**`Develop > Service Workers` does NOT unregister anything.** That menu opens the worker's own Web
Inspector window and exposes no unregister control. This session handed the user that instruction
and it cost real time. The paths that actually work:

1. **Settings > Privacy > Manage Website Data > select the origin > Remove.** Clears the
   registration along with the site data. This is what the confirming run used.
2. **Develop > Disable Service Workers.** Bypasses the worker for the session, which is enough for
   a one-off verification.

Then confirm build identity independently: read the hashed bundle filename out of the page's
resource list and match it against local `dist/`. The confirming run verified
`assets/index-vwbqaOH_.js`. "I cleared it" is not evidence that the new build is the one running.

### Follow-up candidate, not fixed

WebKit enforces a `history.replaceState` rate limit ("more than 100 times per 10 seconds") that
Chromium does not. It surfaced as `SecurityError` in 16 of the 52 full-suite WebKit failures, thrown
from `writePermalinkUrl` (`src/app/state.ts:883`) via `flushPermalinkUrl`. Most are the test
harness's own per-test permalink reset, but the app's real permalink write path is the same code, so
a real Safari user making rapid parameter changes could plausibly trip it. Deliberately not
investigated in this session.

---
