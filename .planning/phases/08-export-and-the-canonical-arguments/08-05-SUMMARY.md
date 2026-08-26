---
phase: 08-export-and-the-canonical-arguments
plan: 05
subsystem: export
tags: [html-to-image, playwright, webkit, vitest, performance, safari]

requires:
  - phase: 08-01
    provides: the .screenshot-region PNG export path (D-01/D-02/D-03/D-04)
  - phase: 08-02
    provides: the CSV export path (SHARE-05)
  - phase: 08-04
    provides: the Scenarios overlay and the spx-3x-dca-2000 preset (F-04)
provides:
  - measureExportTiming browser command (PERF-07a for PNG, CSV, DCA-apply)
  - bench/perf-08-export.bench.test.ts, three PERF-07a MeasurementRow records
  - the real-Safari PNG export defect fix (src/export/png-export.ts)
  - tests/app/export-png-canvas-fidelity.browser.test.ts and the scoped app-webkit vitest project
  - the DCA loading-state decision (no loading state built)
affects: [export, performance, testing]

actuals:
  tokens: 32214
  tasks: 3
  commits: 9

tech-stack:
  added: []
  patterns:
    - "Real-browser human-verify checkpoints for platform-specific rendering paths that a Chromium-only
       test matrix cannot exercise (WebKit foreignObject/canvas timing) are load-bearing, not
       ceremonial: this plan's Task 3 gate found a defect present since 08-01 that had never once
       been caught."
    - "A composited canvas draw (destination-over, reverse document order, live backing store drawn
       directly) is the fix for library rasterization paths that route canvas pixels through a nested
       subresource document WebKit does not decode synchronously; the library element stays in the
       clone for layout, but carries no pixels."
    - "A placeholder value substituted into a third-party library's rasterization path must be
       verified transparent/decoded through the browser's own encoder, not a hand-written literal or
       a values-look-right assumption -- the first hand-written 1x1 payload here was not actually
       transparent, and a naive blankness-only assertion would not have caught it."

key-files:
  created:
    - bench/perf-08-export.bench.test.ts
    - tests/app/export-png-canvas-fidelity.browser.test.ts
    - .planning/debug/resolved/png-export-blank-canvas-safari.md
  modified:
    - vitest.config.ts
    - bench/browser-commands.d.ts
    - src/export/png-export.ts
    - package.json
    - .planning/PROJECT.md
    - .planning/REQUIREMENTS.md
    - .planning/debug/knowledge-base.md

key-decisions:
  - "Real-Safari PNG verification is a blocking human-verify gate, and it caught a real defect on
     first run: it is not a formality."
  - "The Safari blank-canvas defect is fixed by compositing live canvas backing stores directly onto
     html-to-image's output canvas (destination-over, reverse document order), not by the
     documented double-capture workaround, because the workaround roughly doubles export cost and
     would have invalidated PERF-07a."
  - "A scoped app-webkit vitest project (one file, the new canvas-fidelity regression, 2.9s) was
     adopted; the whole app suite was NOT moved to WebKit, because it measures 52 of 189 failing for
     reasons unrelated to this defect (WebKit's history.replaceState rate limit, Chromium-generated
     screenshot baselines)."
  - "No loading state is built for the DCA preset apply (UI-SPEC E3's 'Computing...' row). Measured
     dcaApplyMaxLongTaskMs is 0.00ms with zero long tasks, well under one frame, so the state would
     never be observable."
  - "SHARE-04 and SHARE-05 are marked Complete in REQUIREMENTS.md against real evidence: SHARE-04 by
     the confirmed real-Safari re-verification against the post-fix bundle, SHARE-05 by 08-02's
     already-complete build plus this plan's PERF-07a measurement of its main-thread cost."

patterns-established:
  - "Pattern: when a fix targets a measured performance path, re-measure on the SAME host against a
     pre-fix baseline taken there, not against a figure recorded on a different machine, before
     drawing any before/after conclusion."

requirements-completed: [SHARE-04, SHARE-05, SHARE-06]

coverage:
  - id: D1
    description: "PNG export renders every canvas correctly on the first capture in real Safari, in both light and dark theme and in both single-run and sweep mode"
    requirement: SHARE-04
    verification:
      - kind: manual_procedural
        ref: "Real Safari verification against post-fix bundle assets/index-vwbqaOH_.js, service worker eliminated first"
        status: pass
      - kind: e2e
        ref: "tests/app/export-png-canvas-fidelity.browser.test.ts (app-webkit project, 5 tests)"
        status: pass
    human_judgment: true
    rationale: "Visual/pixel fidelity of a pasted export image in real Safari cannot be fully judged by an automated oracle alone; the automated WebKit regression test is the recurrence guard, the human verification is the acceptance signal this gate exists to require."
  - id: D2
    description: "PNG, CSV, and DCA-preset-apply paths each measured against PERF-07a's 50ms main-thread long-task budget, all passing"
    requirement: SHARE-04
    verification:
      - kind: e2e
        ref: "bench/perf-08-export.bench.test.ts (three MeasurementRow records, budgetId PERF-07a)"
        status: pass
    human_judgment: false
  - id: D3
    description: "DCA loading-state decision recorded: no loading state needed, backed by the measured figure"
    requirement: SHARE-06
    verification:
      - kind: e2e
        ref: "bench/perf-08-export.bench.test.ts dcaApplyMaxLongTaskMs measurement"
        status: pass
    human_judgment: false

duration: continuation session (resumed from a resolved checkpoint; full plan span cb940ae..e3a792b spans 2026-08-26T05:33Z to 2026-08-26T20:34Z, including an intervening /gsd-debug session and real-device human verification wait)
completed: 2026-08-26
status: complete
---

# Phase 8 Plan 05: PERF-07a Export Measurement and the Real-Safari PNG Fix Summary

**Real-Safari verification of PNG export FAILED on first run, surfacing a WebKit-only defect live since plan 08-01 (every region canvas blank on the first capture after any chart rebuild); fixed by compositing live canvas pixels outside html-to-image's foreignObject pass, re-verified passing in real Safari, and closed with a scoped app-webkit test project rather than a full-suite WebKit migration.**

## Performance

- **Tasks:** 3 completed (Task 1 and Task 2 committed in an earlier session; this continuation
  completed Task 3)
- **Files modified this continuation:** 2 (`.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`)
- **Files touched by the whole plan (including the intervening debug session that resolved Task
  3's gate):** 10

## Accomplishments

- `measureExportTiming` browser command (Task 1, `cb940ae`) producing three independent,
  labelled main-thread long-task figures against a real production preview build.
- `bench/perf-08-export.bench.test.ts` (Task 2, `77b0782`) recording PERF-07a for the PNG path,
  the CSV path, and the DCA preset apply. All three passed inside 50ms with no escalation owed:
  PNG 0.00ms/0 long tasks (`pngPathTaken=clipboard`), CSV 0.00ms/0 long tasks, DCA apply
  0.00ms/0 long tasks. `git diff` against `perf-budgets.ts`, `bench/calibration.ts`, and
  `bench/canonical-calibration.ts` stayed empty; no threshold or anchor moved.
- **Task 3's real-Safari gate FAILED on first run.** It surfaced a genuine WebKit defect: the
  first PNG capture after any chart rebuild rendered every canvas region blank (equity curve,
  heatmap, crosshair overlay, both slice charts, legend ramp, legend swatches), present since
  plan 08-01, never caught by the repo's Chromium-only `app` test project. This is exactly the
  failure mode 08-RESEARCH.md's Pitfall 1 named, and exactly what this plan's Task 3 gate existed
  to catch. Diagnosed and fixed in an intervening `/gsd-debug` session (already committed on this
  branch: `53fa1e4` fix, `d44be38`/`0646feb`/`48bf7d4`/`d9ccdb9` debug session records), root
  cause and full evidence in `.planning/debug/resolved/png-export-blank-canvas-safari.md`.
- **Root cause:** `html-to-image` never routes canvas PIXELS into its output. `cloneCanvasElement`
  replaces each live `<canvas>` with an `<img src="data:image/png;...">`, `svgToDataURL`
  serializes the whole clone into a single `data:image/svg+xml` URL, and `toCanvas` loads that
  into one `Image`. The per-canvas images are therefore subresources of a different document, and
  WebKit resolves the outer image's `load`/`decode()` before those subresources decode, so they
  rasterize as nothing. The second capture happens to work, which is what made it look like a
  caching problem; it is not one. Two cache-shaped candidate fixes (pre-decoding the identical
  `toDataURL()` string; substituting an already-decoded `<img>`) were tested directly against real
  WebKit and both disproven before the shipped fix was written.
- **The fix** (`src/export/png-export.ts`): shadows each region canvas's `toDataURL` during
  capture so the library embeds a 1x1 transparent PNG instead of chart pixels, then composites
  each live canvas's own backing store directly into html-to-image's output canvas with
  `globalCompositeOperation = 'destination-over'` in reverse document order, filling the opaque
  theme background last. The 1x1 placeholder is generated by the browser's own PNG encoder, not a
  hand-written literal: a hand-written first attempt was not actually transparent and rendered a
  solid blue wash, caught only by a capture-1-vs-capture-2 byte-determinism check, not by a
  blankness assertion alone.
- PERF-07a's PNG figure was re-measured after the fix, against a pre-fix baseline taken on the
  same host rather than trusted from Task 2's other-host figure: `png rawMs=0.0000,
  longTaskCount=0, verdict=pass`, identical to the pre-fix figure. An intermediate revision that
  suppressed canvas embedding with `'data:,'` instead of a real 1x1 PNG measured a 52ms long task,
  because that value routes `html-to-image` down a synchronous `cloneNode(false)` branch that
  removes the per-canvas awaits keeping its work split into short tasks. No threshold, anchor, or
  normalization constant was altered at any point (PERF-01a).
- A new `tests/app/export-png-canvas-fidelity.browser.test.ts` (5 tests) plus a scoped
  `app-webkit` vitest project (`npm run test:app:webkit`) closes the coverage gap that let the
  defect through: it fails 2/5 against the ORIGINAL buggy code in WebKit and passes 5/5 against
  that same original code in Chromium, proving the gap was structural, not a badly-written test.
  Running the whole `app` suite under WebKit was evaluated and rejected for now: 52 of 189 tests
  fail, dominated by WebKit's `history.replaceState` rate limit (which Chromium does not enforce)
  and Chromium-generated `__screenshots__` baselines, neither of which this fix touches.
- The user re-verified in real Safari against the confirmed post-fix bundle
  (`assets/index-vwbqaOH_.js`, read from the page's resource list, not assumed), with the service
  worker eliminated first via Settings > Privacy > Manage Website Data so no stale precache could
  serve, and reported the tests passed.
- **Part B, the DCA loading-state decision:** `dcaApplyMaxLongTaskMs` measured 0.00ms with zero
  long tasks, well under one frame. Per the plan's own decision tree that lands in the "under
  roughly one frame (16ms)" band: no loading state is needed. 08-UI-SPEC.md E3's "Computing..."
  row is satisfied vacuously, since the state is never observable, and is therefore not built.

## Task Commits

1. **Task 1: The measureExportTiming browser command** - `cb940ae` (feat) — completed in an
   earlier session, verified present in this continuation.
2. **Task 2: The PERF-07a bench file and the honest recording of whatever it says** - `77b0782`
   (feat) — completed in an earlier session, verified present in this continuation.
3. **Task 3: Real-Safari verification of the PNG capture, and the DCA loading-state decision** -
   checkpoint task; the blocking half was resolved by an intervening `/gsd-debug` session
   (`53fa1e4` fix, `d44be38`/`0646feb`/`48bf7d4`/`d9ccdb9` debug records, merged into this
   branch's base as `6826e26`) and confirmed by the user in real Safari. This continuation
   verified those commits present, ran the full verification suite, and recorded the outcome:
   `e3a792b` (docs).

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified

- `bench/perf-08-export.bench.test.ts` - PERF-07a bench for PNG export, CSV export, and DCA
  preset apply (Task 2, prior session)
- `vitest.config.ts` - `measureExportTiming` browser command; `app-webkit` vitest project scoped
  to the new canvas-fidelity regression file
- `bench/browser-commands.d.ts` - type declaration for `measureExportTiming`
- `src/export/png-export.ts` - the Safari fix: canvas-rasterization suppression plus the
  reverse-order `destination-over` composite
- `tests/app/export-png-canvas-fidelity.browser.test.ts` - new WebKit regression file, 5 tests,
  red-phase proven against the original buggy code
- `package.json` - `test:app:webkit` script
- `.planning/debug/resolved/png-export-blank-canvas-safari.md` - the full investigation record
- `.planning/debug/knowledge-base.md` - updated with this session's findings
- `.planning/PROJECT.md` - new Key Decisions row recording the defect, the fix, the scoped
  WebKit-adoption decision, and the PERF-07a re-measurement
- `.planning/REQUIREMENTS.md` - SHARE-04 and SHARE-05 marked Complete against real evidence

## Decisions Made

- Real-Safari verification stays a blocking gate for PNG export and is not weakened to
  Playwright WebKit alone; Playwright WebKit is a fast reproduction loop, not a substitute for the
  real browser, per the debug record's own explicit distinction.
- The fix composites live canvas pixels directly rather than adopting the documented
  double-capture workaround, because the workaround roughly doubles PNG export cost and would
  have invalidated PERF-07a's PNG figure.
- WebKit test coverage is adopted scoped to the canvas-fidelity regression file only (2.9s, 5/5
  green), not extended to the whole `app` suite (52/189 fail today, dominated by causes unrelated
  to this defect). Widening it is explicitly deferred, not silently declined.
- No loading state is built for the DCA preset apply; the measured figure (0.00ms, well under one
  frame) makes UI-SPEC E3's "Computing..." row unobservable, so building it would be dead code.
- SHARE-04 and SHARE-05 are marked Complete in REQUIREMENTS.md. SHARE-05 (CSV) was already fully
  built and tested in plan 08-02; this plan's Task 2 measured its main-thread cost. SHARE-04
  (PNG) is now backed by a confirmed real-Safari pass against the post-fix bundle, not merely a
  Chromium pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] PNG export blank canvas on first capture in real Safari**
- **Found during:** Task 3's real-Safari human-verify checkpoint (the gate's designed purpose)
- **Issue:** `html-to-image` never routes canvas pixels into its output; the nested `<img>`
  subresources it substitutes for each `<canvas>` do not decode synchronously in WebKit before
  the outer capture resolves, so every canvas in `.screenshot-region` renders blank on the first
  capture after any chart rebuild. Present since plan 08-01.
- **Fix:** `src/export/png-export.ts` shadows each live canvas's `toDataURL` to embed a
  browser-generated 1x1 transparent PNG during capture, then composites the real backing stores
  directly into the output canvas with `destination-over` in reverse document order, with the
  opaque theme background filled last.
- **Files modified:** `src/export/png-export.ts`,
  `tests/app/export-png-canvas-fidelity.browser.test.ts`, `vitest.config.ts`, `package.json`
- **Verification:** Playwright WebKit 2336 (first capture correct and byte-identical to the
  second, both result modes); Chromium post-fix vs. pre-fix pixel diff (nothing erased); PERF-07a
  re-measured pass at 0.00ms; real Safari confirmed by the user against the post-fix bundle.
- **Committed in:** `53fa1e4` (fix commit, landed via the intervening debug session, already on
  this branch's base)

---

**Total deviations:** 1 auto-fixed (1 bug, found by the plan's own designed gate)
**Impact on plan:** The auto-fix is exactly what Task 3's blocking checkpoint exists to catch and
resolve before the phase seals. No scope creep: the fix touched only the PNG export call site and
its test coverage, not the CSV path, the preset system, or any simulation code.

## Issues Encountered

None beyond the documented Rule 1 fix above. The fix required diagnosing across two disproven
candidate hypotheses (pre-decode warming; substituting a pre-decoded `<img>`) before the correct
root cause (the subresource-document boundary itself) was identified; the full diagnostic trail
is preserved in `.planning/debug/resolved/png-export-blank-canvas-safari.md` rather than
repeated here.

## User Setup Required

None - no external service configuration required.

## Verification Run (this continuation)

- `npm run typecheck` - exit 0, clean.
- `npm run build` - succeeds; output bundle hash `assets/index-vwbqaOH_.js` matches the bundle
  the user confirmed in real Safari.
- `npm run test` (unit) - **845 passed / 845** (63 files).
- `npm run test:app` (Chromium) - **194 passed / 194** (29 files).
- `npm run test:app:webkit` (WebKit, new gate) - **5 passed / 5** (1 file), 3.16s.
- `git diff perf-budgets.ts bench/calibration.ts bench/canonical-calibration.ts` - empty. No
  threshold, anchor, or calibration constant altered anywhere in this plan.

## Next Phase Readiness

Phase 8's three requirements (SHARE-04, SHARE-05, SHARE-06) are all now Complete in
REQUIREMENTS.md against real evidence, including a real-device pass on the one deliverable this
repo's automated matrix structurally could not verify alone. The scoped `app-webkit` project and
its one regression file are a permanent addition to the test suite (`npm run test:app:webkit`);
widening WebKit coverage to the rest of the `app` suite remains a named, deliberately deferred
follow-up (WebKit `history.replaceState` rate limit; WebKit-generated `__screenshots__`
baselines), not something this plan attempted or silently declined.

---
*Phase: 08-export-and-the-canonical-arguments*
*Completed: 2026-08-26*

## Self-Check: PASSED

All created/modified files present on disk (`08-05-SUMMARY.md`, `src/export/png-export.ts`,
`tests/app/export-png-canvas-fidelity.browser.test.ts`, `bench/perf-08-export.bench.test.ts`).
All referenced commits (`cb940ae`, `77b0782`, `53fa1e4`, `0646feb`, `48bf7d4`, `d9ccdb9`,
`e3a792b`, `a74cc0d`) found in this worktree's git history.
