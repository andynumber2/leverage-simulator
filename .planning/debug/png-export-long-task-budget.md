---
status: awaiting_human_verify
trigger: "PNG export breaches the PERF-07a 50ms main-thread long-task budget on the 4-core CI baseline"
created: 2026-08-27
updated: 2026-08-27
---

# PNG export exceeds the PERF-07a long-task budget on 4 cores

## Symptoms

**Expected behavior**
Clicking Export PNG produces no main-thread task exceeding the 50ms long-task threshold
(PERF-07a, `perf-budgets.ts:153-162`, requirement PERF-07). This is roadmap success criterion 4
for Phase 8.

**Actual behavior**
On the authoritative D-17 CI baseline (`ci: true`, `hardwareConcurrency: 4`) the PNG path produces
exactly one long task well over budget:

| CI run | rawMs | normalizedMs | budget | calibrationScore | verdict |
|---|---|---|---|---|---|
| 33026990805 | 120.0000 | 128.6863 | 50 | 0.9325 | fail |
| 33028716813 | ~120 | 134.7594 | 50 | 0.9350 | fail |

The other two paths measured by the same browser command in the same run are clean:
`csv` 0.00ms / 0 long tasks / pass, and `dcaApply` 0.00ms / 0 long tasks / pass. The breach is
specific to the PNG path in `src/export/png-export.ts`. Info line from the artifact:
`PERF-07a export path "png": rawMs=120.0000 normalizedMs=128.6863 longTaskCount=1 verdict=fail pngPathTaken=clipboard`

**Error messages**
`Error: assertWithinBudget: budget "PERF-07a" failed: measured 134.7593582888959ms exceeds budget 50ms`
thrown from `bench/perf-08-export.bench.test.ts:201`.

**Timeline**
Never actually passed on a 4-core machine. The dev-sandbox run
(`hardwareConcurrency: 9`, `ci: false`) recorded 0.00ms and `08-VERIFICATION.md` read that as
"essentially maximal headroom", which is a misreading of the instrument (see Established Facts 2).
No CI run existed on the branch at verification time. The first CI run on the branch failed.

**Reproduction**
`npm run bench` on a 4-core machine, or push to the branch and let CI run. The measuring command
is `measureExportTiming` in `vitest.config.ts` (roughly lines 205-300), which clicks
`[data-testid="export-png-button"]` in a fresh Playwright context with clipboard permissions and
`acceptDownloads: true`, observing `PerformanceObserver({ type: 'longtask', buffered: true })`
installed via `addInitScript` before any navigation.

## Established Facts

These are already measured. Do NOT re-derive them; build on them.

1. **`compositeLiveCanvases` is NOT the cost.** `src/export/png-export.ts:292-297` records a
   development measurement, in the code, stating that disabling the canvas composite and the
   background fill entirely left the PNG path's long task at "exactly 52ms, unchanged". The same
   comment attributes the cost to "how the library's canvas embedding is suppressed", pointing at
   `resolveTransparentPixelDataUrl` / `suppressLibraryCanvasRasterization`. That attribution is
   itself unverified and is a hypothesis, not a fact: reading
   `suppressLibraryCanvasRasterization` (`png-export.ts:130-186`) it only shadows `toDataURL` with
   an own property returning a cached 1x1 data URL per canvas, which should be microseconds.
   Worth testing rather than trusting.

2. **The instrument cannot measure headroom.** PERF-07a is observed with
   `PerformanceObserver({ type: 'longtask' })`. Per spec, longtask entries are emitted only for
   tasks exceeding 50ms, and `PERF_BUDGETS['PERF-07a'].thresholdMs` is also 50. The measurement is
   therefore binary by construction: either no entry at all (reported as `0.00ms` with
   `longTaskCount: 0`, verdict pass) or an entry above 50ms (verdict fail). It cannot distinguish
   5ms from 49ms. Consequences: (a) the dev-sandbox `0.00ms` carries no headroom information,
   (b) any fix that lands the path at 49ms will report as a clean pass while being one slow
   machine away from failing again, so a fix should be validated with a direct timing measurement
   (`performance.now()` around the phases), not only by the longtask observer going quiet.

3. **Remaining suspect, unconfirmed.** `html-to-image`'s `toCanvas`: it serializes the whole
   `.screenshot-region` subtree into one `data:image/svg+xml` URL (`util.js`, `svgToDataURL`),
   loads that into a single `Image`, and draws it (`index.js`, `toCanvas`). Plus the final
   `canvas.toBlob(resolve, 'image/png')` encode at `png-export.ts:309-311`. Both are main-thread.

## Constraints on any fix

- **PERF-01a**: no budget value, threshold, calibration constant or anchor may change.
  `perf-budgets.ts`, `bench/calibration.ts`, `bench/canonical-calibration.ts` must end
  byte-identical. This is the project's standing rule against retuning the yardstick in response
  to a measurement.
- **The real-Safari canvas-fidelity fix must keep working.** That defect (every region canvas
  blank on the first capture in WebKit) was live in production and was caught by a human gate.
  `tests/app/export-png-canvas-fidelity.browser.test.ts` (`npm run test:app:webkit`, 5 tests) is
  the recurrence guard and must keep passing.
- **The exported image must stay equivalent in content**: fixed 1160px 2x capture, forced opaque
  themed background, and correct z-order (the heatmap's `pointer-events: none` axis tick labels
  must stay above the canvases; this is why the composite uses `destination-over`).
- **Safari's transient-activation requirement**: `exportRegionAsPng` must keep returning a promise
  synchronously from the click handler so `navigator.clipboard.write` retains user activation
  (`ExportRow.tsx:106-124`, 08-RESEARCH.md Pattern 2).
- **CR-01 serialization must survive**: `exportQueue` in `png-export.ts:340+` serializes
  overlapping exports; removing it reintroduces a confirmed page-corruption bug.
- Project CLAUDE.md: never use the em dash character, anywhere. Minimize ternaries, never nest.

## Success criteria

Find where the time actually goes, with a measurement rather than a reading of the code. Then
determine whether the PNG path can be brought under 50ms on 4 cores without changing what is
exported.

**If it cannot**, say so plainly, with the measurement behind it, and characterise what would have
to give (a smaller capture, a different library, accepting the breach as a documented escalation
in the manner of PERF-03). Do not propose a workaround that games the instrument, and do not
propose relaxing the budget. An honest "this does not fit in 50ms on 4 cores, here is the
breakdown" is a complete and acceptable answer to this session.

## Current Focus

status: root cause confirmed by direct measurement; fix verified byte-identical; implementing.

reasoning_checkpoint:
  hypothesis: "The long task is a single contiguous main-thread block inside html-to-image's
    `toCanvas`. It is one block because the library's clone pipeline is a pure PROMISE chain
    (microtasks, which do not end a task) whose only real task boundaries come from
    `createImage`'s onload/decode/rAF, and `createImage` is reached exactly once during a
    single-run capture because `.screenshot-region` contains exactly ONE canvas. Everything
    after that one boundary -- the rest of the clone recursion, embedWebFonts, embedImages,
    applyStyle, XMLSerializer.serializeToString, encodeURIComponent, and the assignment of the
    resulting 928 KB data: URL to img.src -- runs as microtask continuations inside the single
    rAF task that resolved it. The work in that block is dominated by html-to-image copying
    ALL 495 computed CSS properties onto every one of the 84 cloned elements, because
    `getComputedStyle(el).cssText` is the empty string in Chromium so `cloneCSSStyle` always
    takes its per-property fallback branch."
  confirming_evidence:
    - "MessageChannel macrotask probe: one block of 47-51ms (9-core sandbox, unthrottled),
      starting exactly at the `img.raf` mark and ending at the img.src assignment. Everything
      else in the path is under 10ms."
    - "Library-internal marks inside that block: clone recursion remainder 25.7ms, serialize
      7.3ms (674,612 chars), encodeURIComponent 1.6ms (928,201 chars), data: URL parse ~13ms."
    - "84 elements x 495 computed properties = ~42,000 getPropertyValue/setProperty pairs, and
      674,612 / 84 = 7,937 serialized chars per element."
    - "Sweep mode has 7 canvases and therefore 7 boundaries; its worst block is 22ms at the same
      throttle where single-run mode is 107ms. Same code, same library, more boundaries."
  falsification_test: "Cutting the copied property set without touching anything else must move
    the block proportionally AND leave the exported PNG bytes unchanged. If the block did not
    move, the property copy is not the cost; if the bytes changed, the property set is load-bearing."
  fix_rationale: "Pass html-to-image's supported `includeStyleProperties` option, derived at
    runtime as the union of every property name any readable stylesheet rule declares and every
    property name present in any inline style attribute. A property no stylesheet and no inline
    style declares cannot differ from what the SVG document's own UA stylesheet/initial values
    produce, so it does not need copying. This removes ~78% of the real work; it is not a task
    split and not an instrument change."
  blind_spots:
    - "Constructed/adopted stylesheets and shadow-root stylesheets are not in document.styleSheets.
      adoptedStyleSheets is included in the walk; shadow roots are not (this app has none)."
    - "html-to-image memoizes the FIRST includeStyleProperties array it is given and holds it by
      reference, so the list is frozen for the page's lifetime unless the same array instance is
      refreshed in place. The implementation does exactly that."
    - "Verified in Chromium only at this stage; WebKit fidelity is covered by the existing
      app-webkit suite."
  candidate_causes:
    - "code: html-to-image copies all 495 computed properties per element (CONFIRMED)"
    - "code: the clone pipeline is one microtask chain with a single task boundary (CONFIRMED)"
    - "environment: 4-core CI is ~2.2x slower on this block than the 9-core dev sandbox (CONFIRMED
      by CPU-throttle sweep; the sandbox's 0.00ms reading was the instrument's 50ms floor, not headroom)"
    - "data: region content size -- ruled out, sweep mode has MORE content and a SMALLER block"
  and_gate: "yes. Neither cause alone breaches. The property-copy cost alone would be harmless if
    it were spread across tasks (sweep mode proves this: more canvases, more boundaries, 22ms).
    The single-boundary chain alone would be harmless if the work inside it were small. The breach
    needs both, plus a machine slow enough to push the product past 50ms -- which is why it
    reproduces on 4-core CI and not in the 9-core sandbox."

test: A/B against the real production build, driven through the real Export PNG button, comparing
  SHA-256 of the exported Blob and the longest main-thread block from a MessageChannel probe, at
  CDP CPU throttle 1x/2x/3x/4x and across both result modes and both themes.
expecting: block falls by roughly 4x with an unchanged PNG hash.
next_action: awaiting user confirmation that Export PNG still produces the expected image in a
  real browser session. On "confirmed fixed", move this file to .planning/debug/resolved/ and
  append the knowledge-base entry.

## Evidence

- timestamp: 2026-08-27
  checked: "Phase breakdown of captureRegionAsPng via temporary performance.now() marks, plus a
    MessageChannel ping-pong probe recording macrotask boundaries (resolution far below the 50ms
    longtask floor, which Established Fact 2 says the observer cannot give). Production build,
    vite preview, real Export PNG click, 9-core sandbox, unthrottled."
  found: |
    toCanvas wall 98.5ms, toBlob wall 1015ms, everything else <= 0.4ms.
    Longest contiguous main-thread block: 47.4 / 47.1 / 51.0 ms across runs, entirely inside toCanvas.
    Second block 13-15ms (entry through the first canvas). toBlob's worst block is 8ms.
  implication: "The 120ms CI long task is ONE block inside toCanvas. compositeLiveCanvases (0.0ms),
    the background fill (0.0ms), the style mutation/forced reflow (0.2ms),
    suppressLibraryCanvasRasterization (0.2ms) and the PNG encode itself are all irrelevant --
    canvas.toBlob costs 1 second of wall clock but almost nothing on the main thread, because
    Chromium encodes PNG off-thread. Established Fact 1 is confirmed rather than merely inherited,
    and Established Fact 3's second suspect (the toBlob encode) is eliminated."

- timestamp: 2026-08-27
  checked: "html-to-image 1.11.13's own internals, instrumented in node_modules/html-to-image/es/
    (index.js, util.js) with the same mark mechanism, then rebuilt."
  found: |
    Marks inside the 49ms block, unthrottled (delta from previous mark):
      img.raf                       <- block STARTS here (rAF that resolves createImage)
      cloneNode:end                 25.7ms
      embedWebFonts:end              0.6ms
      embedImages:end                0.9ms
      applyStyle:end                 0.1ms
      serialize:end len=674612       7.3ms
      encodeURIComponent len=928201  1.6ms
      img.src = <928 KB data: URL>  ~13ms   <- block ENDS in here
    At 4x CPU throttle the same block is 200-219ms with the same proportions
    (clone 102.6, serialize 32.3, encode 7.3, data: URL parse ~55).
  implication: "The block is the clone-and-serialize pipeline, not the rasterization. drawImage of
    the finished 2320x1758 SVG costs 2.1ms unthrottled and lands in a LATER task anyway."

- timestamp: 2026-08-27
  checked: "Why the pipeline is one task rather than several. Read clone-node.js: cloneChildren
    walks children with `children.reduce((deferred, child) => deferred.then(...))` -- a promise
    chain. Promise continuations are microtasks and do not yield to the event loop. The only real
    task boundaries in the whole pipeline are createImage's onload -> decode() -> requestAnimationFrame."
  found: |
    .screenshot-region in single-run mode: 84 elements, exactly 1 canvas, 0 images.
    So createImage is reached exactly once during the clone, ~11ms in. That is the ONE boundary.
    Everything after it runs as microtasks inside the rAF callback that resolved it.
  implication: "The in-source comment at png-export.ts:88-95 is half right and half wrong. It is
    right that the `data:,` shortcut removed boundaries and fused the work. It is wrong that
    keeping the <img> path 'keeps those task boundaries' plural -- with one canvas in the region
    there is exactly one, and it lands near the START of the clone, so the split is 15ms + 49ms
    rather than anything balanced. The 0.00ms reading that comment cites as proof was the
    instrument's 50ms floor on a 9-core machine, not a measurement of headroom."

- timestamp: 2026-08-27
  checked: "What the clone spends 25.7ms on. Read cloneCSSStyle: it uses getComputedStyle(el).cssText
    when non-empty, else copies getStyleProperties(options) one property at a time. Measured
    getComputedStyle(el).cssText in the page."
  found: |
    getComputedStyle(el).cssText is the EMPTY STRING in Chromium (per spec, computed-style
    declarations serialize to ''), so the fast branch is dead code and the per-property branch
    always runs. getStyleProperties defaults to every property on document.documentElement:
    495 of them (475 standard + 20 of this app's --custom properties).
    84 elements x 495 properties = ~42,000 getPropertyValue + setProperty pairs, producing
    674,612 chars of inline style -- 7,937 chars per element.
  implication: "The dominant cost is copying 495 computed properties onto every cloned element,
    and that same copy is what makes the serialized SVG 928 KB, which is what makes the data: URL
    parse expensive. One cause, three line items."

- timestamp: 2026-08-27
  checked: "A/B against the real production build through the real Export PNG button. A = library
    default (495 properties). B = includeStyleProperties set to the union of every property name
    declared by any rule in any readable stylesheet plus every property name in any inline style
    attribute (108 names here). SHA-256 of the exported Blob compared, 3 runs each, at CDP CPU
    throttle 1x/2x/3x/4x."
  found: |
    longest main-thread block, ms (median of 3):
      throttle   A (495 props)   B (108 props)   ratio
      1x             47.4            14.0         3.4
      2x             98.7            29.7         3.3
      3x            153.4            40.4         3.8
      4x            210.4            51.2         4.1
    serialized SVG: 928,234 chars -> 205,913 chars.
    Exported PNG SHA-256 73b094c85c615cce..., size 414,485 bytes: IDENTICAL in every A and every B
    run at every throttle rate.
  implication: "The property copy is both the cost and removable. The CI baseline's 120ms raw sits
    between the 2x and 3x rows (~2.2x), where B measures ~30ms -- roughly 32ms normalized at CI's
    0.9325 calibration score, against a 50ms budget. This is a real reduction in main-thread work,
    not a task split: no work is deferred, ~78% of it stops happening."

- timestamp: 2026-08-27
  checked: "The same A/B across both result modes and both themes at 2x throttle, since the bench
    only ever measures the default single-run light view."
  found: |
      scenario        elements  canvases   A block   B block   PNG hash A == PNG hash B
      single/light       84        1        107.5      28.3            yes
      single/dark        82        1        108.3      29.5            yes
      sweep/light        62        7         47.8      21.9            yes
      sweep/dark         62        7         45.6      22.5            yes
  implication: "Confirms the mechanism independently. Sweep mode has MORE canvases and therefore
    more createImage boundaries, so its clone is already split across tasks and its worst block is
    a fifth of single-run mode's despite rendering more. The breach is specific to a region with
    exactly one canvas. Output is byte-identical in all four scenarios."

## Eliminated

- hypothesis: "The canvas composite and background fill are the cost"
  evidence: "png-export.ts:292-297 in-code development measurement: disabling both entirely left
    the long task at exactly 52ms, unchanged."
  eliminated_by: "pre-existing measurement, recorded in the source"

- hypothesis: "The canvas composite and background fill are the cost (re-confirmed independently)"
  evidence: "Direct performance.now() marks: compositeLiveCanvases 0.0-0.1ms, background fillRect
    0.0ms, against a 49ms block elsewhere."
  eliminated_by: "phase instrumentation, 2026-08-27"

- hypothesis: "The final canvas.toBlob PNG encode is on the main thread and part of the breach"
  evidence: "toBlob costs 1013-1015ms of WALL CLOCK but its worst main-thread block is 8.5ms;
    Chromium encodes PNG off-thread. It cannot produce a 50ms task."
  eliminated_by: "MessageChannel macrotask probe, 2026-08-27"

- hypothesis: "suppressLibraryCanvasRasterization / resolveTransparentPixelDataUrl is the cost
    (the attribution the in-source comment at png-export.ts:290-291 guessed at)"
  evidence: "suppressLibraryCanvasRasterization measures 0.0-0.2ms. Its 1x1 placeholder is in fact
    the only thing PRODUCING a task boundary in the whole clone pipeline -- it is load-bearing in
    the opposite direction from what the comment claims, and the comment's real error was assuming
    one boundary is several."
  eliminated_by: "phase instrumentation plus reading clone-node.js, 2026-08-27"

- hypothesis: "html-to-image's rasterization of the serialized SVG (drawImage) is the cost"
  evidence: "drawImage of the finished 2320x1758 SVG image measures 2.1ms unthrottled, 12.6ms at
    4x, and runs in a later task than the block."
  eliminated_by: "library-internal marks, 2026-08-27"

- hypothesis: "The region is simply too big to capture inside 50ms"
  evidence: "Sweep mode renders MORE (7 canvases, a full heatmap) and its worst block is 22ms at
    a throttle where single-run mode's is 107ms. Size is not what separates them; the number of
    task boundaries in the clone is."
  eliminated_by: "cross-mode A/B, 2026-08-27"

## Resolution

root_cause: |
  Two conditions, both required (the AND-gate fired; neither alone breaches).

  1. html-to-image copies EVERY computed CSS property onto every cloned element. `cloneCSSStyle`
     prefers `getComputedStyle(el).cssText` and only falls back to a per-property copy, but a
     computed-style declaration serializes to the empty string per CSSOM, so the fallback always
     runs, over `getStyleProperties`'s default of all 495 properties `document.documentElement`
     reports. Across `.screenshot-region`'s 84 elements that is ~42,000 getPropertyValue/
     setProperty pairs producing 674,612 characters of inline style, which then has to be
     XML-serialized, percent-encoded into a 928 KB `data:` URL, and parsed back by the browser.

  2. All of that runs in ONE main-thread task. `cloneChildren` walks the subtree with a promise
     chain (`children.reduce((deferred, child) => deferred.then(...))`), and promise continuations
     are microtasks, which do not yield to the event loop. The only real task boundaries anywhere
     in the pipeline are `createImage`'s onload -> decode() -> requestAnimationFrame, reached once
     per canvas. The single-run region holds exactly ONE canvas, so there is exactly one boundary,
     about 11ms in, and every remaining phase runs as microtask continuations inside the
     animation-frame callback that resolved it.

  Sweep mode is the control: seven canvases, seven boundaries, worst block a fifth of single-run
  mode's while rendering more. And the 9-core dev sandbox never showed it because the
  `PerformanceObserver` longtask instrument has a 50ms floor and the block there was 47ms.

fix: |
  Pass html-to-image's supported `includeStyleProperties` option, derived at runtime as the union
  of every property name declared by any rule in any readable stylesheet (recursing into grouping
  and keyframe rules, and including `adoptedStyleSheets`) and every property name present in any
  inline `style` attribute in the document. 495 properties become 108. A property that no
  stylesheet rule and no inline style declares cannot have been moved off the value the clone
  computes for itself, because the SVG document the clone is serialized into carries the browser's
  own UA stylesheet and the same initial values.

  Nothing is deferred and no task is split: about 78% of the work stops happening.

  Two safety properties are built in. (a) If any stylesheet's `cssRules` is unreadable, the
  derivation returns false and the capture runs with the library's full default list -- a slow
  correct export beats a fast wrong one. (b) The list lives in ONE array instance refreshed in
  place, because html-to-image memoizes the first `includeStyleProperties` it is handed and holds
  it by reference; a fresh array per capture would be read once and every later capture would
  silently reuse the first one's list.

  Also corrected two in-source comments that had recorded wrong attributions for this cost.

verification: |
  guardrail_verdict: accepted

  1. Bug reproduced before the fix and gone after, same instrument, production build, real Export
     PNG click, longest contiguous main-thread block from a MessageChannel macrotask probe
     (median of 3 per cell):

       CDP CPU throttle   before    after
       1x                  47.4      16.7
       2x                  98.7      25.2
       3x                 153.4      40.8
       4x                 210.4      51.4
       3x, sweep mode      30.6      30.8

     The CI baseline's 120ms raw sits between the 2x and 3x rows, where the fixed path measures
     ~27-30ms raw, roughly 29-32ms normalized at CI's 0.9325 calibration score, against a 50ms
     budget and a 35ms D-20 escalation trigger.

  2. Output equivalence, the property that mattered most: the exported PNG's SHA-256 and byte
     length are IDENTICAL with and without the narrowing, across single-run and sweep result
     modes, light and dark themes, and throttle rates 1x through 4x. Pinned as a standing test.

  3. Regression guard: tests/app/export-png-style-properties.browser.test.ts, 4 tests, run under
     BOTH Chromium (`app`) and WebKit (`app-webkit`) -- the narrowing is judged against each
     browser's own computed-property set and UA stylesheet, so a Chromium-only proof would certify
     nothing about Safari.
     oracle_type: derived (byte-equality against the library's own default behavior, captured in
     the same page session by widening the array the library cached), plus specified completeness
     assertions over the declaration sources.

  4. Mutation testing at the fix site, all three caught:
       drop 'color' from the derived list      -> 3 of 4 tests fail, including byte-equality
       remove the inline-style scan            -> 2 of 4 fail
       make the narrowing never apply          -> 4 of 4 fail

  5. Suites: unit 853/853 pass; app (Chromium) 199/199 pass, 30 files; app-webkit 9/9 pass
     including the 5 Safari canvas-fidelity tests that are the recurrence guard for the earlier
     blank-canvas defect; bench 34 passed / 1 expected fail / 34 skipped, PERF-07a verdict=pass.
     The bench teardown's runtime-cap error (D-08) reproduces byte-for-byte on a stashed clean
     tree (32421ms clean vs 31598ms with the fix, i.e. this change makes it slightly better) and
     is unrelated.

  6. PERF-01a: `git diff --stat -- perf-budgets.ts bench/calibration.ts bench/canonical-calibration.ts`
     is empty. No budget, threshold, calibration constant or anchor was touched.

  honest limit: this is not unconditional. At 4x CPU throttle the path still measures ~51ms, so a
  machine roughly 3.5x slower than this sandbox would breach again. The fix moves the CI baseline
  from ~2.4x over budget to ~55% of it; it does not make DOM-to-PNG capture cheap in the limit.

files_changed:
  - src/export/png-export.ts: derived includeStyleProperties list, in-place refresh, unreadable-sheet
    fallback, test seam; two corrected in-source attributions of this cost
  - tests/app/export-png-style-properties.browser.test.ts: new, 4 tests, the standing guard
  - vitest.config.ts: app-webkit project now runs the new file too, with the rationale
  - tests/app/export-png-canvas-fidelity.browser.test.ts: header comment, "one file" -> "two files"
