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

## png-export-long-task-budget: PNG export breaches the PERF-07a 50ms main-thread long-task budget on the 4-core CI baseline

- **Date:** 2026-08-27
- **Error patterns:** `assertWithinBudget: budget "PERF-07a" failed: measured 134.75ms exceeds budget 50ms`, long task, longtask, PerformanceObserver, main-thread block, blocked main thread on export, `hardwareConcurrency: 4`, CI-only failure, passes locally fails in CI, `pngPathTaken=clipboard`, html-to-image, `toCanvas`, `cloneNode`, `cloneCSSStyle`, `getComputedStyle(el).cssText` empty string, `getStyleProperties`, `includeStyleProperties`, 495 computed properties, `data:image/svg+xml`, foreignObject, `XMLSerializer.serializeToString`, `encodeURIComponent`, 928 KB data URL, `bench/perf-08-export.bench.test.ts`
- **Root cause(s):** AND-gate of two conditions, neither sufficient alone. **(1)** `html-to-image` copies EVERY computed CSS property onto every cloned element. `cloneCSSStyle` prefers `getComputedStyle(el).cssText` and only falls back to a per-property copy, but a computed-style declaration serializes to the empty string per CSSOM, so the fallback ALWAYS runs, over `getStyleProperties`'s default of all 495 properties `document.documentElement` reports. Across `.screenshot-region`'s 84 elements that is ~42,000 `getPropertyValue`/`setProperty` pairs producing 674,612 chars of inline style, which is then XML-serialized, percent-encoded into a 928 KB `data:` URL, and parsed back by the browser. One cause, three line items. **AND (2)** all of it runs in ONE main-thread task. `cloneChildren` walks the subtree with `children.reduce((deferred, child) => deferred.then(...))`, and promise continuations are microtasks, which never yield to the event loop. The only real task boundaries anywhere in the pipeline are `createImage`'s `onload` -> `decode()` -> `requestAnimationFrame`, reached once per canvas, and the single-run region holds exactly ONE canvas, about 11ms in. Sweep mode is the control: seven canvases, seven boundaries, worst block a fifth of single-run mode's while rendering MORE. The breach needs both conditions plus a machine slow enough to push the product past 50ms, which is why it reproduces on 4-core CI and never in the 9-core sandbox.
- **Fix:** Pass html-to-image's supported `includeStyleProperties` option, derived at runtime as the union of every property name declared by any rule in any readable stylesheet (recursing into grouping and keyframe rules, including `adoptedStyleSheets`) plus every property name present in any inline `style` attribute in the document. 495 properties become 108, and ~78% of the work stops happening. Nothing is deferred and no task is split. Two safety properties are built in: **(a)** if any stylesheet's `cssRules` is unreadable the derivation returns false and the capture runs with the library's full default list, since a slow correct export beats a fast wrong one; **(b)** the list lives in ONE array instance refreshed in place, because html-to-image memoizes the first `includeStyleProperties` it is handed and holds it by reference, so a fresh array per capture would be read once and every later capture would silently reuse the first one's list. Result: longest main-thread block falls 47.4ms -> 16.7ms at 1x and 210.4ms -> 51.4ms at 4x CDP CPU throttle, with the exported PNG's SHA-256 and byte length IDENTICAL across both result modes, both themes, and throttle 1x through 4x.
- **Files changed:** src/export/png-export.ts, tests/app/export-png-style-properties.browser.test.ts (new, 4 tests), vitest.config.ts (`app-webkit` project now runs the new file too), tests/app/export-png-canvas-fidelity.browser.test.ts (header comment only)
- **Why not caught:** The gate existed and was correct; the *reading* of it was wrong. `bench/perf-08-export.bench.test.ts` measures PERF-07a on every bench run and it did catch this on the first CI run on the branch. What failed is that verification happened only on a 9-core dev sandbox, where the same path reported `0.00ms` / `longTaskCount: 0` / pass, and `08-VERIFICATION.md` recorded that as "essentially maximal headroom". The instrument cannot express headroom (see Durable finding 2), so no amount of care in reading that number could have produced a true statement about margin. Structural gap: no gate ran the bench at a representative core count before the phase was marked verified.
- **Recurrence guard:** `tests/app/export-png-style-properties.browser.test.ts` (4 tests) run under BOTH Chromium (`app`) and WebKit (`app-webkit`), since the narrowing is judged against each browser's own computed-property set and UA stylesheet and a Chromium-only proof would certify nothing about Safari. Oracle is `derived`: byte-equality of the exported PNG against the library's own default behavior, captured in the same page session by widening the array the library cached, plus specified completeness assertions over the declaration sources. Mutation-proven rather than assumed, all three mutants caught: dropping `color` from the derived list fails 3 of 4 tests including byte-equality; removing the inline-style scan fails 2 of 4; making the narrowing never apply fails 4 of 4.

### Durable finding 1: `getComputedStyle(el).cssText` is the empty string, by specification

This is the transferable lesson, not the option name. CSSOM specifies that a computed-style
`CSSStyleDeclaration` is read-only and its `cssText` getter returns the empty string. Any code, in
this repo or in any dependency, that treats `getComputedStyle(el).cssText` as a fast path for "copy
this element's whole style" therefore gets a silent, **always-taken** fallback to whatever its slow
path is. The fast branch is dead code and nothing warns you.

In html-to-image that fallback is a per-property copy over its full default property list: every
property `document.documentElement` reports, 495 here (475 standard plus 20 of this app's custom
properties). The cost is not "the library is slow"; it is that a documented-empty getter converted
an opt-in fast path into an always-on O(elements x all-properties) copy, whose output then has to be
serialized and percent-encoded and parsed twice more downstream.

When profiling any DOM-serialization or DOM-to-image library, **check whether its fast path is
reachable at all before optimizing around it**. `includeStyleProperties` is html-to-image's specific
escape hatch and will not transfer to another library. The CSSOM quirk will.

### Durable finding 2: the longtask instrument cannot measure headroom, and `0.00ms` is not good news

PERF-07a is observed with `PerformanceObserver({ type: 'longtask' })`. Longtask entries exist only
for tasks exceeding 50ms, and `PERF_BUDGETS['PERF-07a'].thresholdMs` is also 50. The measurement is
binary by construction:

| Observed | Means | Does NOT mean |
|---|---|---|
| `0.00ms`, `longTaskCount: 0`, pass | nothing on this machine crossed 50ms | anything at all about margin |
| an entry above 50ms, fail | the block exceeded 50ms | the block is only slightly over |

It cannot distinguish 5ms from 49ms. `08-VERIFICATION.md` read a `0.00ms` on a 9-core sandbox as
"essentially maximal headroom"; the real block there was 47ms, one slow machine from failing, and
the same path measured 120ms raw on the 4-core CI baseline. The number was not misreported, it was
over-interpreted.

**Rule: any future PERF-07a headroom claim needs a direct `performance.now()` measurement, or a
MessageChannel macrotask probe (what this session used, resolution far below the 50ms floor), not
the observer going quiet.** Observer silence supports exactly one sentence: "nothing crossed 50ms on
this machine."

Record the post-fix margin with the same honesty. The fixed path still measures ~51ms at 4x CDP CPU
throttle. The fix moves the CI baseline from roughly 2.4x over budget to about 55% of it, against a
50ms budget and a 35ms D-20 escalation trigger. That margin is real but not large: a machine roughly
3.5x slower than this sandbox would breach again. This fix did not make DOM-to-PNG capture cheap in
the limit.

### Durable finding 3: the disproven attribution, recorded so it is not re-derived

An in-source comment (then at `src/export/png-export.ts:292-297`) attributed this long task to "how
the library's canvas embedding is suppressed", pointing at `resolveTransparentPixelDataUrl` and
`suppressLibraryCanvasRasterization`. **Measurement disproved it.** Everything that comment
implicated is negligible:

| Suspect | Measured main-thread cost | Against |
|---|---|---|
| `suppressLibraryCanvasRasterization` | 0.0-0.2ms | a 49ms block elsewhere |
| `compositeLiveCanvases` | 0.0-0.1ms | same |
| background `fillRect` | 0.0ms | same |
| style mutation / forced reflow | 0.2ms | same |
| `canvas.toBlob` PNG encode | ~1015ms WALL clock, worst block 8.5ms | Chromium encodes PNG off-thread |
| `drawImage` of the 2320x1758 SVG | 2.1ms at 1x, 12.6ms at 4x, in a LATER task | cannot produce a 50ms task |

The suppression is in fact load-bearing in the **opposite** direction from what the comment claimed:
its 1x1 placeholder is what keeps the `<img>` path, and that `createImage` await is the only thing
in the entire clone pipeline that ends a main-thread task. The comment's real error was reading one
boundary as several.

The false-lead wording is gone. The corrected notes now live at `src/export/png-export.ts:96-103`
(the `resolveTransparentPixelDataUrl` correction, stating that the `<img>` path keeps ONE boundary,
not "several short tasks") and `src/export/png-export.ts:429-433` (the composite rationale, stating
that the second buffer was NOT what breached PERF-07a and that the cost was inside html-to-image's
clone-and-serialize pipeline). Do not restore the old attribution.

---
