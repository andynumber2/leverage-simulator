---
phase: 08-export-and-the-canonical-arguments
reviewed: 2026-08-26T00:00:00Z
depth: standard
files_reviewed: 33
files_reviewed_list:
  - bench/browser-commands.d.ts
  - bench/long-task-selector.ts
  - bench/perf-07.bench.test.ts
  - bench/perf-08-export.bench.test.ts
  - package.json
  - scripts/compute-presets.ts
  - src/app/App.tsx
  - src/app/components/ParameterColumn/ParameterColumn.tsx
  - src/app/components/ResultColumn/ExportRow.tsx
  - src/app/components/ResultColumn/FeaturedPresetRow.tsx
  - src/app/components/ResultColumn/HoverReadout.tsx
  - src/app/components/ResultColumn/PresetCard.tsx
  - src/app/components/ScenariosOverlay.tsx
  - src/app/presets.generated.ts
  - src/app/presets.ts
  - src/app/state.ts
  - src/app/styles.css
  - src/export/csv-columns.ts
  - src/export/csv-export.ts
  - src/export/csv-preamble.ts
  - src/export/csv.worker.ts
  - src/export/download.ts
  - src/export/png-export.ts
  - tests/app/export-csv.browser.test.ts
  - tests/app/export-csv.test.ts
  - tests/app/export-png-canvas-fidelity.browser.test.ts
  - tests/app/export-png.browser.test.ts
  - tests/app/narrow-viewport.browser.test.ts
  - tests/app/presets.generated.test.ts
  - tests/app/presets.test.ts
  - tests/app/scenarios-overlay.browser.test.ts
  - tests/app/static-build.test.ts
  - vitest.config.ts
findings:
  critical: 1
  warning: 3
  info: 0
  total: 4
status: fixed
fixed_at: 2026-08-26T20:51:27Z
fix_commits:
  CR-01: 61b7dd8
  WR-01: 61b7dd8
  WR-02: d670d86
  WR-03: d65d42e
---

# Phase 08: Code Review Report

**Reviewed:** 2026-08-26
**Depth:** standard
**Files Reviewed:** 33
**Status:** fixed (all 4 findings resolved, see per-finding outcomes below)

## Summary

This phase adds PNG export (`src/export/png-export.ts`), CSV export (`src/export/csv-export.ts`
and friends), a build-time preset library (`src/app/presets.ts` / `presets.generated.ts` /
`scripts/compute-presets.ts`), and the featured-row/Scenarios-overlay preset UI. The PNG export
module in particular was already rewritten once during this phase to fix a real WebKit defect
(the `.planning/debug/resolved/png-export-blank-canvas-safari.md` investigation), and that fix
itself is careful, well-reasoned, and well-tested (z-order, background-behind-canvas invariant,
determinism between two consecutive captures, a scoped WebKit regression suite). PERF-01a
(`perf-budgets.ts`, `bench/calibration.ts`, `bench/canonical-calibration.ts`) is verifiably
untouched across the whole phase. The `.screenshot-region` capture scope is never widened past
`region.querySelectorAll(...)` anywhere in `png-export.ts`; `document.body` is never reached for.
CSV formula-injection mitigation (T-08-06) is real: every data cell is `String(numeric)` or an
ISO date, never free text. Filename construction in both export modules is allow-list sanitized
after being built only from already-validated `backtestRequest()` fields.

The one material defect found is a real concurrency bug in the PNG export path: nothing prevents
two overlapping calls to `exportRegionAsPng` (trivially triggered by a user double-clicking
"Export PNG" before the first click's async capture finishes), and the function's shared,
mutable DOM state (the live region's inline style, and each canvas's shadowed `toDataURL`) is not
protected against that overlap. Traced in detail below; it can leave the live page visibly
resized after both exports finish, which the function's own comments state is "the one failure
this function must never have."

## Critical Issues

### CR-01: Overlapping `exportRegionAsPng` calls can permanently corrupt the live region's layout and each other's captured output

**Outcome: fixed** (commit `61b7dd8`). `exportRegionAsPng` in `src/export/png-export.ts` now
serializes every call through a module-level promise queue, so a second call's capture work never
starts until every earlier call has finished restoring the region -- the root-cause fix, not just
the button-level guard the original Fix suggestion sketched. `ExportRow.tsx` additionally disables
the Export PNG button while an export is in flight, as user-facing feedback layered on top. A
regression test (`tests/app/export-png.browser.test.ts`, "two overlapping exportRegionAsPng calls
(CR-01)...") fires two overlapping calls and asserts the region's inline style is fully restored;
confirmed to fail without the fix and pass with it.

**File:** `src/export/png-export.ts:236-318`, `src/app/components/ResultColumn/ExportRow.tsx:93-125,194-203`

**Issue:** `exportRegionAsPng` mutates shared, live DOM state with no mutual exclusion:
`region.style.cssText` is captured as `originalCssText` (line 237) and the region is resized in
place (lines 238-245); a `finally` at the end restores `region.style.cssText = originalCssText`
(line 315). Nothing in `ExportRow.tsx`'s `handleExportPngClick` prevents this function from being
entered twice concurrently -- the Export PNG button's `disabled` state (`ExportRow.tsx:199`) is
bound only to `currentKernelResult() === null`, never to an in-flight export, and `pngState` is
not set to any "busy" value at the start of the handler (only at the end, to `'confirmed'` or
`'failed'`). A user double-clicking Export PNG (an entirely ordinary UI interaction) fires
`handleExportPngClick` twice; each call runs synchronously up to its own first `await` inside
`toCanvas(...)` before yielding, and `toCanvas`'s internal pipeline (per-canvas `Image`
decode/`requestAnimationFrame` waits, per this phase's own debug record) genuinely spans multiple
event-loop turns, giving the second click ample opportunity to start before the first finishes.

Tracing two overlapping calls (call1 starts at t0, call2 starts at t1 while call1 is still
awaiting `toCanvas`):

- At t1, call2 captures `originalCssText_2 = region.style.cssText`, but the region has already
  been resized by call1 -- so `originalCssText_2` is call1's EXPORT layout, not the page's true
  original style.
- Whichever call's `finally` (lines 308-317) runs first restores `region.style.cssText` to ITS
  OWN captured `originalCssText`. If call1 finishes first, it correctly restores the true
  original -- but call2 is still mid-capture and now measures/composites against a region that
  has been un-resized out from under it (`region.getBoundingClientRect()` at line 266,
  `compositeLiveCanvases`'s own `getBoundingClientRect()` calls), corrupting call2's output.
- When call2 finishes and runs ITS `finally`, it sets `region.style.cssText` back to
  `originalCssText_2` -- which is call1's EXPORT layout (1160px width, frame padding,
  `background-color: transparent`), not the page's true original style. **The live page is left
  visibly resized after both exports complete.**
- The same interleaving corrupts `suppressLibraryCanvasRasterization`'s restore bookkeeping
  (lines 130-153): each call captures `Object.getOwnPropertyDescriptor(live, 'toDataURL')` as its
  own `ownDescriptor` at entry. If call2 captures call1's shadow as its `ownDescriptor` (because
  call1 already installed its shadow by the time call2 starts), and call1's restore later
  deletes the own property entirely (its own `ownDescriptor` was `undefined`), call2's later
  restore then reinstalls call1's already-removed shadow via
  `Object.defineProperty(live, 'toDataURL', ownDescriptor)` -- permanently leaving that canvas's
  `toDataURL` shadowed to return the 1x1 placeholder for the lifetime of the element.

This directly violates the function's own stated invariant (`png-export.ts:233-234`: "The live
region is restored to its original inline style in a `finally` block regardless of outcome, so a
real user's page is never left resized"; line 310-311: "leaving a real user's page resized is the
one failure this function must never have"). The bug is not in the restoration discipline itself
(each individual `finally` is correctly nested and unconditional) -- it is the absence of any
guard preventing two calls from sharing the same live, mutable DOM node at once.

**Fix:** Add a re-entrancy guard in `ExportRow.tsx` so a second click while a PNG export is
already in flight is a no-op (mirroring how `csvDisabled()`/`disabled()` already gate the
buttons on other conditions), e.g.:

```tsx
const [pngExportInFlight, setPngExportInFlight] = createSignal(false)

async function handleExportPngClick(): Promise<void> {
  if (pngExportInFlight()) return
  setPngExportInFlight(true)
  try {
    // ... existing body ...
  } finally {
    setPngExportInFlight(false)
  }
}
```

and bind the button's `disabled` to `disabled() || pngExportInFlight()`. This is the minimal fix
that preserves the existing single-call code path's correctness without adding a lock inside
`png-export.ts` itself (a module-level mutex there would also work, but the button is the
natural place a "no double-submit" invariant belongs, and it is the only call site).

## Warnings

### WR-01: `exportRegionAsPng` does not restore the region's resized style if `suppressLibraryCanvasRasterization` itself throws

**Outcome: fixed** (commit `61b7dd8`, same commit as CR-01 -- both required the same restructuring
of `captureRegionAsPng`). The resize and the call to `suppressLibraryCanvasRasterization` now live
inside the same `try` the outer `finally` (`region.style.cssText = originalCssText`) protects, so a
throw from either path still restores the region's original style.

**File:** `src/export/png-export.ts:236-250`

**Issue:** `originalCssText` is captured and the region is resized (lines 237-248) BEFORE
`suppressLibraryCanvasRasterization(region)` is called (line 250), and the `try/finally` that
restores `region.style.cssText = originalCssText` (lines 252-317) only wraps the code AFTER that
call. If `suppressLibraryCanvasRasterization` throws (e.g. `Object.defineProperty` rejecting a
non-configurable property on a canvas element in some future or unusual DOM state), the function
propagates that throw with the region left resized and never restored -- exactly the failure
mode the function's own comments (lines 233-234, 310-311) say must never happen. Low likelihood
in today's DOM (canvas elements are ordinary, configurable), but the code's own stated invariant
is violated on this one path, and the fix is cheap.

**Fix:** Move the call to `suppressLibraryCanvasRasterization` inside the same `try`, or wrap it
in its own `try`/`finally` alongside the resize:

```ts
const originalCssText = region.style.cssText
try {
  region.style.width = `${EXPORT_WIDTH_PX}px`
  // ... existing resize ...
  const restoreCanvasRasterization = suppressLibraryCanvasRasterization(region)
  try {
    // ... existing capture body ...
  } finally {
    restoreCanvasRasterization()
  }
} finally {
  region.style.cssText = originalCssText
}
```

### WR-02: Em dash character in a code comment violates the project's absolute "no em dash anywhere" rule

**Outcome: fixed** (commit `d670d86`). `PresetCard.tsx`'s header comment now describes the
substitution ("the extended-tier tag's source copy uses a dash the project's own CLAUDE.md forbids
(an em dash)") without reproducing the em dash character. Confirmed by grep: no em dash character
remains anywhere in the file.

**File:** `src/app/components/ResultColumn/PresetCard.tsx:18`

**Issue:** The project's global CLAUDE.md states "Never use the em dash character (—) in any
output: prose, commit messages, code comments, or documentation," and this project's own
CLAUDE.md-enforcement precedent (recorded in this same file's header and in `08-04-SUMMARY.md`)
treats that rule as absolute and overriding source-document text on conflict. Line 18 of this
file's own header comment quotes the UI-SPEC's original tag copy verbatim, including its em dash
("Extended tier — interpolated data"), to explain the substitution made in the actual
rendered string (`TAG_COPY['extended-tier']`, line 48, which correctly uses a hyphen). The
rendered/output string is correct; the em dash character itself still appears in the comment
text, which the rule's own wording ("including code comments") does not exempt even for a quoted
source string.

**Fix:** Rephrase the comment to describe the substitution without reproducing the em dash
character, e.g. "the extended-tier tag's source copy uses a dash the project's own CLAUDE.md
forbids (an em dash); rendered here with a hyphen instead."

### WR-03: `presetById` exported from `src/app/presets.ts` is dead code

**Outcome: fixed** (commit `d65d42e`), via the preferred option. `tests/app/scenarios-overlay.browser.test.ts`
now imports the real `presetById` (aliased `lookupPresetById`) and wraps it with the test file's
existing non-optional-return assertion, rather than duplicating the lookup locally -- the production
function now has real test coverage, and its local duplicate is gone.

**File:** `src/app/presets.ts:342-345`

**Issue:** `presetById` is exported but never imported anywhere in `src/` or `tests/`. The one
place that looks like a consumer, `tests/app/scenarios-overlay.browser.test.ts:83-86`, defines
its own local function of the identical name and identical purpose
(`PRESET_DEFINITIONS.find((p) => p.id === id)`) rather than importing the real one, so the two
implementations exist in parallel with no test coverage on the actual exported function.

**Fix:** Either delete the unused export, or have the test file import and use it directly
(`import { presetById } from '../../src/app/presets.ts'`), removing its local duplicate --
the latter is preferable since it also gives the production function real test coverage.

## Fix Verification

All 4 findings fixed (3 commits: CR-01+WR-01 share one commit since they required the same
restructuring of `captureRegionAsPng`). Verified in the main working tree (not a worktree) with
hooks enabled:

- `npm run typecheck`: clean, no errors.
- `npm run build`: succeeded.
- `npm run test` (unit): 845/845 passed.
- `npm run test:app` (Chromium): 195/195 passed (194 pre-existing + 1 new CR-01 regression test).
- `npm run test:app:webkit` (WebKit): 5/5 passed.

The CR-01 regression test (`tests/app/export-png.browser.test.ts`, "two overlapping
exportRegionAsPng calls (CR-01)...") was confirmed to fail against the pre-fix code (temporarily
reverted the promise-queue serialization, reran the test, observed the expected assertion failure
on the region's leftover export-layout `cssText`) and pass against the fix.

---

_Reviewed: 2026-08-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
_Fixed: 2026-08-26_
_Fixer: Claude (gsd-code-fixer)_
