---
phase: 08-export-and-the-canonical-arguments
plan: 01
subsystem: ui
tags: [html-to-image, solid-js, png-export, clipboard-api, theming, responsive-layout]

requires:
  - phase: 04-first-defensible-backtest-in-the-browser
    provides: ".screenshot-region (D-20), CopyLinkButton.tsx (SHARE-01), theme.ts (D-19/VIZ-11)"
  - phase: 07-sweep-engine-and-the-heatmap
    provides: "HeatmapPanel's own sweep .screenshot-region, HoverReadout, the committed crosshair overlay (D-22 drill-down)"
provides:
  - "End-to-end PNG export: click-to-clipboard with a download fallback, real in both result modes"
  - "The export row (Copy link / Export PNG / Export CSV) mounted unconditionally in App.tsx, outside both result-mode Show guards"
  - "src/export/download.ts and src/export/png-export.ts, the two shared primitives plan 08-02's CSV export composes"
  - "F-02's data-export-exclude filter, applied to HoverReadout"
  - "D-02/D-03 closed empirically: theme-parity and viewport-independence proofs against the real DOM, not assumed from html-to-image's stated option behaviour"
affects: [08-02, 08-03, 08-04, 08-05]

actuals:
  tokens: 10465
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "html-to-image toBlob() call site scoped to src/export/, with a node filter keyed on data-export-exclude for transient-state exclusion"
    - "Force the LIVE region into the export layout (not a hand-rolled clone) before calling toBlob, to make text/layout genuinely reflow at the fixed export width while preserving live <canvas> pixel content"

key-files:
  created:
    - src/export/download.ts
    - src/export/png-export.ts
    - src/app/components/ResultColumn/ExportRow.tsx
    - tests/app/export-png.browser.test.ts
  modified:
    - src/app/App.tsx
    - src/app/components/ParameterColumn/ParameterColumn.tsx
    - src/app/components/ResultColumn/HoverReadout.tsx
    - src/app/styles.css
    - tests/app/static-build.test.ts
    - tests/app/narrow-viewport.browser.test.ts

key-decisions:
  - "ExportRow is mounted ONCE, unconditionally, as a sibling of both result-mode Show blocks (matching SweepModeToggle's existing D-18 placement) rather than once per mode -- this is what UI-SPEC E1's zero-one-many invariant (the row's shape never changes) actually requires, and it made Task 2's per-mode mount instruction moot: one placement already covers both modes."
  - "exportRegionAsPng resizes the LIVE region in place (not a hand-cloned copy) before calling html-to-image's toBlob, restoring it in a finally block -- cloneNode() was rejected because cloning drops live canvas pixel content, which the chart and heatmap depend on."

requirements-completed: [SHARE-04]

coverage:
  - id: D1
    description: "A user with a completed single-run result clicks Export PNG and gets a PNG of the whole screenshot region on the clipboard, or downloaded when the Clipboard API is unavailable"
    requirement: SHARE-04
    verification:
      - kind: automated_ui
        ref: "tests/app/export-png.browser.test.ts#clicking Export PNG produces a correctly sized, non-blank PNG Blob passed to the clipboard as a promise"
        status: pass
      - kind: automated_ui
        ref: "tests/app/export-png.browser.test.ts#when the clipboard write rejects, Export PNG falls back to a download and never enters the failed state on that path alone"
        status: pass
    human_judgment: false
  - id: D2
    description: "The export row renders unconditionally (present-but-disabled before a result, in both result modes), as a following sibling of the screenshot region, never a descendant"
    requirement: SHARE-04
    verification:
      - kind: automated_ui
        ref: "tests/app/export-png.browser.test.ts#the export row is a following sibling of the screenshot region, never a descendant of it"
        status: pass
      - kind: automated_ui
        ref: "tests/app/export-png.browser.test.ts#sweep mode: export-row sibling placement, hover-readout exclusion, and a committed crosshair surviving capture"
        status: pass
    human_judgment: false
  - id: D3
    description: "Copy link relocated into the export row (D-22), flush-before-read discipline intact, absent from the parameter column"
    requirement: SHARE-04
    verification:
      - kind: automated_ui
        ref: "tests/app/export-png.browser.test.ts#a Copy link issued immediately after a leverage change yields the settled URL, not a stale one"
        status: pass
      - kind: unit
        ref: "grep -c 'CopyLinkButton' src/app/components/ParameterColumn/ParameterColumn.tsx == 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "In sweep mode, the transient hover readout is excluded from a capture while the committed crosshair overlay survives it (F-02)"
    requirement: SHARE-04
    verification:
      - kind: automated_ui
        ref: "tests/app/export-png.browser.test.ts#sweep mode: export-row sibling placement, hover-readout exclusion, and a committed crosshair surviving capture"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-02 theme parity and D-03 viewport independence, closing 08-RESEARCH.md's Assumption A1 by measurement"
    requirement: SHARE-04
    verification:
      - kind: automated_ui
        ref: "tests/app/export-png.browser.test.ts#theme parity and viewport independence: a captured frame pixel matches the live theme, opaque; the same run at two viewport widths is dimension- and pixel-identical"
        status: pass
    human_judgment: false
  - id: D6
    description: "F-01's static-build guard inverted (not deleted): capture code exists and stays confined to src/export/"
    requirement: SHARE-04
    verification:
      - kind: unit
        ref: "tests/app/static-build.test.ts#canvas-capture/image-export code exists (SHARE-04, Phase 8, D-04) and is confined to src/export/ plus the declared html-to-image dependency (F-01)"
        status: pass
    human_judgment: false

duration: ~100min (this resumed session; excludes the original dead executor's Task 1 work already committed at d48b4f7)
completed: 2026-08-26
status: complete
---

# Phase 8 Plan 1: PNG Export and the Export Row Summary

**PNG export via html-to-image with click-to-clipboard and a download fallback; Copy link relocated into a unified export row that is now proven theme- and viewport-independent by measurement, not assumption.**

## Performance

- **Duration:** ~100 min (this resumed session)
- **Started:** 2026-08-26T02:53:00Z (approx, this session's read of the resume context)
- **Completed:** 2026-08-26T04:21:41Z
- **Tasks:** 3 (Task 1 resumed/completed, Tasks 2 and 3 executed fresh)
- **Files modified:** 11 (4 created earlier by the rescued commit, 7 further modified across this session's 3 commits)

## Accomplishments

- Fixed the one real defect left in the rescued Task 1 code: `<ExportRow />` was nested inside the single-run `Show` guard in `App.tsx`, so it disappeared during load and in sweep mode. Hoisted it to an unconditional sibling of both result-mode `Show` blocks, the same placement `SweepModeToggle` already uses (D-18) — one mount now correctly covers both modes.
- Found and fixed two latent gaps in the rescued `static-build.test.ts` F-01 inversion that only surface once you actually run it: the capture-call-site detector didn't match html-to-image's real `toBlob(...)` call shape, and the emitted bundle embeds two harmless library-internal strings (an XHTML namespace URI, a `https://` string-literal comparison inside html-to-image's own minified code) that the external-URL scanner flagged. Both fixed with reasoned allow-list entries and a broadened detection pattern.
- Relocated `CopyLinkButton` into `ExportRow` (D-22), composed unchanged, flush-before-read discipline intact.
- Applied F-02's `data-export-exclude` attribute to `HoverReadout`, resolving 08-RESEARCH.md's open question: the transient hover readout is excluded from a capture; the committed crosshair overlay canvas is not.
- Closed 08-RESEARCH.md's Assumption A1 empirically: measured (not assumed) that html-to-image's `width`/`style` options alone do not reflow every descendant of a captured region at different live viewport widths. Fixed `exportRegionAsPng` to resize the *live* region into the export layout before calling `toBlob`, restoring it afterward — verified byte-identical output across an 1440px and an 800px viewport.
- Verified theme parity: a captured frame pixel matches the live theme's real `--color-bg`, fully opaque, in both light and dark themes, driven through the real `setThemeOverride()` write path.

## Task Commits

1. **Task 1 (completion of the rescued work): hoist ExportRow, close F-01 gate gaps** — `4a6d934` (fix)
2. **Task 2: relocate Copy link into the export row, exclude hover readout from PNG capture** — `8a5d2f1` (feat)
3. **Task 3: close D-02 theme parity and D-03 viewport independence empirically** — `024f7a4` (feat)

Task 1's original code landed at `d48b4f7` (rescued from a dead executor worktree, prior to this session) and is unmodified except for the specific fixes documented above.

_Note: this plan is not TDD-gated (`type="tracer"` for Task 1, `type="auto" tdd="true"` for Tasks 2/3 whose `<behavior>` blocks were satisfied directly, since the underlying components and test infrastructure already existed from Task 1)._

## Files Created/Modified

- `src/export/download.ts` — `triggerDownload(blob, filename)`, the shared Blob-to-download primitive (created at d48b4f7, unmodified this session)
- `src/export/png-export.ts` — `exportRegionAsPng`, `EXPORT_WIDTH_PX`, `EXPORT_PIXEL_RATIO`, `EXPORT_FRAME_PX`, `pngFilename`; this session rewrote the capture path to resize the live region rather than rely on html-to-image's clone-time style override alone (Task 3)
- `src/app/components/ResultColumn/ExportRow.tsx` — the three-button export row; this session added the composed `CopyLinkButton` (Task 2)
- `src/app/App.tsx` — hoisted `<ExportRow />` to an unconditional sibling of both result-mode `Show` blocks (Task 1 completion)
- `src/app/components/ParameterColumn/ParameterColumn.tsx` — dropped its `CopyLinkButton` render call site (Task 2)
- `src/app/components/ResultColumn/HoverReadout.tsx` — added `data-export-exclude="true"` to its root (Task 2)
- `src/app/styles.css` — `.export-row .copy-link-row` zeroes the nested wrapper's own `margin-top` (Task 2)
- `tests/app/static-build.test.ts` — F-01 inversion detection and allow-list fixes (Task 1 completion)
- `tests/app/export-png.browser.test.ts` — extended across all three tasks: sweep-mode assertions, the flush-discipline assertion, the theme-parity and viewport-independence assertions, plus two test-infrastructure bug fixes (see Deviations)
- `tests/app/narrow-viewport.browser.test.ts` — updated a stale error message referencing Copy link's old parameter-column location

## Decisions Made

- **ExportRow mounts once, unconditionally, for both result modes.** The plan's Task 1 text (written before the resume) had it inside the single-run `Show`; the resume context's explicit fix (hoist to a sibling, unconditional) is what UI-SPEC E1's zero-one-many invariant actually requires. This made Task 2's separate "mount for sweep mode too" instruction moot — one placement, above both `Show` blocks, already satisfies both.
- **`exportRegionAsPng` resizes the live region, not a hand-cloned copy.** `cloneNode(true)` was considered and rejected: cloning a `<canvas>` produces a blank canvas (canvas pixel content is bitmap state, not part of what `cloneNode` copies), which would have silently broken chart/heatmap capture. Resizing the live node in place, forcing a layout pass, then restoring it in a `finally` block preserves correctness for both the reflow requirement (D-03) and the canvas-content requirement (D-01).
- **Sweep-mode Task 2/3 assertions consolidated into fewer tests, sharing one mount each**, rather than one mount per assertion — a direct, necessary response to this specific sandbox's severe memory constraint (see Issues Encountered).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `<ExportRow />` nested inside the single-run `Show` guard**
- **Found during:** Task 1 (resuming the rescue)
- **Issue:** Violated 08-UI-SPEC.md E1's empty and zero-one-many requirements — the row disappeared during load and in sweep mode.
- **Fix:** Hoisted to an unconditional sibling of both result-mode `Show` blocks in `App.tsx`.
- **Files modified:** `src/app/App.tsx`
- **Committed in:** `4a6d934`

**2. [Rule 1 - Bug] `static-build.test.ts`'s F-01 capture-call-site detector never matched the real call site**
- **Found during:** Task 1 (resuming the rescue)
- **Issue:** The plan's own detection pattern (`.toDataURL(` or `canvas.toBlob(`) doesn't match html-to-image's real usage (`import { toBlob } from 'html-to-image'`, called bare, not as a `canvas.` method).
- **Fix:** Added a third pattern matching a bare `toBlob(` call.
- **Files modified:** `tests/app/static-build.test.ts`
- **Committed in:** `4a6d934`

**3. [Rule 1 - Bug] Two harmless library-internal strings flagged by the external-URL scanner**
- **Found during:** Task 1 (resuming the rescue)
- **Issue:** html-to-image's bundled code embeds the XHTML namespace URI (`createElementNS`) and a `https://` string-prefix comparison literal (checking whether a discovered CSS `url()` is already absolute) — both flagged as "external URLs" by the existing regex-based scanner.
- **Fix:** Added both as reasoned allow-list entries, matching the file's existing pattern for the SVG/MathML namespace URIs.
- **Files modified:** `tests/app/static-build.test.ts`
- **Committed in:** `4a6d934`

**4. [Rule 1 - Bug] `afterEach` never restored a `document.createElement` spy**
- **Found during:** Task 2, while diagnosing why the sweep-mode test timed out only when run after the earlier tests
- **Issue:** `tests/app/export-png.browser.test.ts`'s clipboard-rejection test spies on `document.createElement` via `vi.spyOn(...).mockImplementation(...)`. `afterEach` called `vi.unstubAllGlobals()`, which does not undo a `vi.spyOn` mock. The unrestored spy wrapped every subsequent DOM node creation in the file, measurably slowing later heavy tests.
- **Fix:** Added `vi.restoreAllMocks()` to `afterEach`.
- **Files modified:** `tests/app/export-png.browser.test.ts`
- **Committed in:** `8a5d2f1`

**5. [Rule 1 - Bug] A committed crosshair's leverage/entryDate leaked across tests via `state.ts`'s module-singleton store**
- **Found during:** Task 2, same diagnosis
- **Issue:** The sweep-mode test's crosshair-commit assertion writes real leverage/entryDate values into `state.ts`'s module-level `backtestRequest` store (Phase 7 D-22 drill-down). `resetAppState()` deliberately does not reset that store (by design — a real page load gets a fresh module instance). Within one Vitest browser-mode test file the module instance is shared across every test, so the mutation silently leaked into whichever test ran next, landing on a parameter combination that happened to produce zero plottable bars and starving that test's wait for the metrics panel.
- **Fix:** The sweep test now calls `updateBacktestRequest(DEFAULT_REQUEST)` before it ends.
- **Files modified:** `tests/app/export-png.browser.test.ts`
- **Committed in:** `8a5d2f1`

---

**Total deviations:** 5 auto-fixed (3 Rule 1 bugs in rescued Task 1 code discovered by actually running it, 2 Rule 1 test-infrastructure bugs discovered while writing Task 2's new tests).
**Impact on plan:** All five were necessary for correctness; none reflect scope creep. The two test-infrastructure bugs (unrestored mock, leaked module state) are general fixes that make this file's isolation correct for any future test added to it, not just the ones this plan added.

## Issues Encountered

**This sandbox's test container has 1.9GB of total RAM** (`free -h`, confirmed directly). A single continuous `npx vitest run --project app tests/app/export-png.browser.test.ts` invocation runs 8 real app mounts — one a full 10,000-cell sweep — plus 8 separate `html-to-image` captures, and this specific container's memory budget cannot sustain that in one uninterrupted browser session: the Chromium tab process disconnects partway through (`[vitest] Browser connection was closed` / `[birpc] rpc is closed`), not a test assertion failure.

This is a pre-existing characteristic of this sandbox, not a regression introduced by this plan: the identical crash signature also occurs during a full `npm run test:app` run in `tests/app/slice-charts.browser.test.ts`, a file this plan never touched, once enough of the 26-file suite has run ahead of it. `.claude/CLAUDE.md`'s own Q1 notes this project's compute is expected to run in a Worker pool sized to the host's actual core count and memory; this container is a worst case for that assumption, not a representative one.

Work done in response, short of touching production code to add test-only cleanup hooks:
- Merged the three sweep-mode assertions (Task 2) into one test sharing one mount, and the theme-parity and viewport-independence assertions (Task 3) into one test sharing one mount, cutting the file's total real app mounts from a theoretical 11 down to 8.
- Fixed the two genuine memory-relevant bugs above (unrestored `document.createElement` spy, leaked `backtestRequest` state).
- Skip the per-test viewport-restore CDP round trip in `afterEach` for the 7 of 8 tests that never touch the viewport.

**Verification performed in place of a single full-file run:** every one of the file's 8 tests passes individually (`-t "<test name>"`, isolated invocation) and in every partial-batch combination tried this session (first 5 together, last 3 together, sweep+flush+theme together). `npm run typecheck`, `npm run build`, and `npm run test` (819/819 unit tests, including the inverted `static-build.test.ts`) all pass cleanly. `tests/app/permalink.browser.test.ts`, `tests/app/controls.browser.test.ts`, and `tests/app/narrow-viewport.browser.test.ts` (25 tests) pass together in one run. `tests/app/crosshair.browser.test.ts` (22 tests, itself doing 3 real sweep mounts) passes cleanly on its own. Real CI (this repo's own GitHub Actions `ubuntu-latest` D-17 baseline, referenced throughout `.planning/STATE.md`'s PERF-03 investigation) has materially more memory than this sandbox and is expected to run the whole file in one pass without incident.

## User Setup Required

None — no external service configuration required. `html-to-image@1.11.13` is a build-time/runtime npm dependency only; no API keys or accounts.

## Next Phase Readiness

- `src/export/download.ts` and `src/export/png-export.ts`'s `EXPORT_WIDTH_PX`/`EXPORT_PIXEL_RATIO`/`EXPORT_FRAME_PX` constants are the shared primitives plan 08-02 (Export CSV) composes into the same `ExportRow`.
- The export row's shape (exactly three buttons, Copy link / Export PNG / Export CSV) is now stable — 08-02 wires the CSV button's handler behind the already-shipped disabled placeholder without touching the row's structure.
- No blockers. The one open item is documented above (this sandbox's memory ceiling for a single continuous full-file browser test run) and is an environment characteristic, not a code defect requiring follow-up work in this codebase.

---
*Phase: 08-export-and-the-canonical-arguments*
*Completed: 2026-08-26*

## Self-Check: PASSED

All key files confirmed present on disk: `src/export/download.ts`, `src/export/png-export.ts`,
`src/app/components/ResultColumn/ExportRow.tsx`, `src/app/App.tsx`,
`src/app/components/ParameterColumn/ParameterColumn.tsx`,
`src/app/components/ResultColumn/HoverReadout.tsx`, `src/app/styles.css`,
`tests/app/static-build.test.ts`, `tests/app/export-png.browser.test.ts`,
`tests/app/narrow-viewport.browser.test.ts`.

All commit hashes confirmed present in `git log`: `4a6d934`, `8a5d2f1`, `024f7a4`, `fb4873b`.
