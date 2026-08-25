---
phase: 07-sweep-engine-and-the-heatmap
reviewed: 2026-08-23T00:00:00Z
depth: standard
files_reviewed: 51
files_reviewed_list:
  - bench/heatmap-form-2.bench.test.ts
  - bench/heatmap-panzoom.bench.test.ts
  - bench/sweep-progressive.bench.test.ts
  - bench/sweep.bench.test.ts
  - src/app/App.tsx
  - src/app/components/ResultColumn/HeatmapPanel.tsx
  - src/app/components/ResultColumn/HoverReadout.tsx
  - src/app/components/ResultColumn/MetricToggle.tsx
  - src/app/components/ResultColumn/SliceChart.tsx
  - src/app/components/ResultColumn/SweepCaption.tsx
  - src/app/components/ResultColumn/SweepLegend.tsx
  - src/app/components/ResultColumn/SweepModeToggle.tsx
  - src/app/parameter-defaults.ts
  - src/app/permalink.ts
  - src/app/state.ts
  - src/app/styles.css
  - src/colorscale/value-to-color.ts
  - src/heatmap/crosshair.ts
  - src/heatmap/curve-label.ts
  - src/heatmap/field-sampler.ts
  - src/heatmap/hatch-pattern.ts
  - src/heatmap/iso-lines.ts
  - src/heatmap/paint-contour.ts
  - src/heatmap/polygon-fill.ts
  - src/heatmap/short-horizon.ts
  - src/heatmap/sweep-copy.ts
  - src/heatmap/viewport.ts
  - src/metrics/irr.ts
  - src/sweep/resolve-column-series.ts
  - src/sweep/sweep-grid.ts
  - src/sweep/sweep-pool.ts
  - src/sweep/sweep.worker.ts
  - tests/app/crosshair.browser.test.ts
  - tests/app/narrow-viewport.browser.test.ts
  - tests/app/parameter-defaults.test.ts
  - tests/app/permalink-methodology.test.ts
  - tests/app/permalink.browser.test.ts
  - tests/app/permalink.test.ts
  - tests/app/ruin-and-horizon.browser.test.ts
  - tests/app/slice-charts.browser.test.ts
  - tests/app/sweep-caption.browser.test.ts
  - tests/app/sweep-controls.browser.test.ts
  - tests/app/sweep-progressive.browser.test.ts
  - tests/app/sweep-tracer.browser.test.ts
  - tests/color-scale-cvd.test.ts
  - tests/field-sampler.test.ts
  - tests/heatmap/crosshair.test.ts
  - tests/heatmap/paint-contour.test.ts
  - tests/heatmap/polygon-fill.test.ts
  - tests/heatmap/short-horizon.test.ts
  - tests/heatmap/viewport.test.ts
  - tests/iso-lines.test.ts
  - tests/metrics/irr.test.ts
  - tests/sweep/cancellation.test.ts
  - tests/sweep/column-series.test.ts
  - tests/sweep/metrics-one-pass.test.ts
  - tests/value-to-color.test.ts
findings:
  critical: 0
  warning: 4
  info: 0
  total: 4
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-08-23T00:00:00Z
**Depth:** standard
**Files Reviewed:** 51 (source + bench + test files listed above)
**Status:** issues_found

## Summary

Read every source file listed in scope (sweep engine, sweep worker/pool, heatmap rendering
pipeline, colour scale, permalink codec, app state, and the sweep-mode UI components), plus the
bench and test files for cross-reference. The codebase is unusually well documented (every module
carries an extensive rationale header referencing prior decisions), and the numerical core
(`sweep.worker.ts`'s `computeChunkMetrics`, `resolve-column-series.ts`, `metrics/irr.ts`,
`sweep-pool.ts`'s merge/staleness logic) traces correctly against its own stated contracts: the
column/row bilinear indexing, the coarse/full two-pass staleness handling, the buffer layout
offsets between worker and pool, and the vertical-flip inversions across `field-sampler.ts` /
`paint-contour.ts` / `crosshair.ts` / `viewport.ts` are all internally consistent.

Four real defects were found, all in the WARNING tier — none corrupt displayed numbers or crash
the app, but each is a genuine, provable behavioral gap against the app's own stated correctness
and input-validation discipline. No BLOCKER-level issues (security, data corruption, or crashes)
were found; the permalink decoder (the one genuine untrusted-input surface) is otherwise
carefully allow-listed and total, and the sweep merge path correctly discards stale chunks. See
`## Warnings` below for concrete failure scenarios and fixes.

## Warnings

### WR-01: `sweepFailedCellCount()` can go stale relative to the grid actually on screen

**File:** `src/app/state.ts:549-579` (`runSweepNow`)
**Issue:** `setSweepFailedCellCountSignal(coarseHandle.failedCellCount + fullHandle.failedCellCount)`
(line 579) only runs after BOTH the coarse pass and the full pass of one generation resolve
non-stale. The coarse pass, however, is already painted to screen earlier in the same function
(`setSweepGridSignal(coarseGrid)`, line 556) as soon as it resolves non-stale — independent of
whether the full pass that follows ever completes. If a newer generation starts before that
generation's own full pass resolves (`fullHandle.stale === true`, lines 571-576), the function
returns immediately, and `setSweepFailedCellCountSignal` is never called for this generation at
all. Any chunk failures from the coarse pass (`coarseHandle.failedCellCount`) that are *already
visible* as `CELL_FLAG_INCOMPLETE` (grey) cells in the currently-painted coarse grid are therefore
never reflected in `sweepFailedCellCount()`, which `SweepCaption.tsx` reads to render "N cells
could not be computed. Try a different parameter." The caption instead keeps showing whichever
count the *last fully-completed* generation produced (0, if none ever completed this session) —
a real mismatch between what is visibly on screen (grey incomplete cells) and what the caption
claims. This is not a contrived edge case: the codebase's own documentation describes exactly the
triggering pattern ("dragging the holding-period control ... start a sweep per drag position"),
where a coarse pass reliably lands before a rapid follow-up parameter change supersedes that
generation's own full pass.
**Fix:** Update `sweepFailedCellCountSignal` immediately after each pass paints (using that
pass's own `handle.failedCellCount`), not only after the full pass of a generation completes, e.g.
call `setSweepFailedCellCountSignal(coarseHandle.failedCellCount)` right after
`setSweepGridSignal(coarseGrid)`, and again with the combined total after the full pass.

### WR-02: A single Worker runtime error permanently degrades every future sweep's coverage, with no recovery or work redistribution

**File:** `src/sweep/sweep-pool.ts:62-80` (`watchWorkerFailure`), `:302-406` (`runSweep`/`drainQueue`)
**Issue:** `watchWorkerFailure` builds one `failure` promise per worker **at pool-construction
time**, tied to that worker's `error`/`messageerror` DOM events, and every dispatched chunk races
`Promise.race([remote.runChunk(...), failure, timeout])` against it (line 366-370). Once `failure`
rejects (a genuine Worker runtime error — not exotic: an uncaught exception inside worker code, a
transient `postMessage` structured-clone failure, or the browser evicting/killing a background
worker under memory pressure), it is a **permanently settled** promise. Every subsequent
`Promise.race` call for that same worker — for the rest of the *session*, since the pool is
persistent and never reconstructs a worker outside `dispose()` — now resolves via the
already-rejected `failure` almost instantly, so every future chunk assigned to that worker is
immediately marked `CELL_FLAG_INCOMPLETE` via the `catch` block (lines 389-397). Because
`nextChunkIndex` is incremented (claiming a chunk from the shared queue) *before* the worker
attempts it (lines 336-337), a chunk claimed by the now-permanently-failing worker is never handed
to a healthy worker instead. With `workerCount` workers, this means roughly `1/workerCount` of
**every future sweep for the rest of the page's lifetime** silently renders as grey
"incomplete" cells after a single transient Worker error, with no self-healing and no distinct
user-facing signal beyond the ordinary failed-cell caption line (which — per WR-01 — can itself
be stale). `tests/sweep/cancellation.test.ts` only exercises the per-chunk `timeout` promise
(recreated fresh every chunk, so it does not persist), never the worker-scoped `error`/
`messageerror` path, so this permanent-degradation behavior is untested.
**Fix:** On a worker `error`/`messageerror`, either replace that pool slot with a freshly
constructed worker (self-healing), or stop assigning further chunks to a known-dead worker and let
the remaining healthy workers absorb the rest of the queue.

### WR-03: `SweepPool.dispose()` is documented as being called when sweep mode is left, but has no caller anywhere in `src/`

**File:** `src/sweep/sweep-pool.ts:258-261` (`dispose` doc comment), `src/app/state.ts:344-351`
(`getSweepPool`, module-level `sweepPool` singleton)
**Issue:** `dispose()`'s own doc comment states: "Used only when sweep mode is left entirely." No
call site exists: `grep -rn '\.dispose(' src/` returns zero matches. `resetAppState()` explicitly
leaves `sweepPool` untouched (per its own comment, "the same discipline `sweepPool` itself
follows, never rebuilt here"), and `setResultMode('single')` (`src/app/state.ts:202-207`) never
calls `dispose()` either. In practice this means: once a user ever enters sweep mode,
`workerCountForCores(hardwareConcurrency)` background Workers are constructed and kept alive for
the rest of the page's session even if the user immediately switches back to Single run and never
revisits sweep mode. This may be an intentional simplification (a persistent pool is cheap to keep
warm), but as written it contradicts the function's own documented contract and leaves `dispose()`
effectively unreachable dead code from the application's perspective (it is only exercised by
tests that call it directly).
**Fix:** Either wire a real call site for `dispose()` when sweep mode is left for the session (if
that lifecycle is actually desired), or update the doc comment to state plainly that the pool
lives for the app's entire session and `dispose()` exists for tests/future use only.

### WR-04: The permalink decoder does not bound `leverage` (or the money fields) the way the corresponding UI control does, unlike every other field

**File:** `src/app/permalink.ts:334-337` (leverage decode via `parsePositiveFiniteNumber`),
`:357-365` (`initialInvestment`/`contributionAmount` via `parseNonNegativeFiniteNumber`)
**Issue:** This module's own header states it is "the one genuine untrusted-input surface," and
the rest of `decodeParams` is written accordingly: dates are round-tripped through `Date.UTC` to
reject out-of-calendar values, `holdingPeriodBars` is a bounded non-negative integer, and every
enum (`holdMode`, `tier`, `scale`, `mode`, `metric`) is checked against a fixed allow-list.
`leverage`, however, is accepted via `parsePositiveFiniteNumber` — "finite and `> 0`" — with **no
upper bound**, even though `src/heatmap/crosshair.ts`'s own header states the live
`LeverageControl.tsx` UI control only ever produces values in `(0, 20]`. A hand-edited or
malformed permalink query string such as `...&leverage=1e300&...` decodes successfully
(`status: 'ok'`) and flows directly into `buildKernelInputs`/`runBacktest`, whose only leverage
check is `assertFinite` (no range bound). The app's D-11/D-12 "clear and explain" eviction path
only fires for a thrown `buildKernelInputs` error (out-of-range entry date, or a holding period
that overruns the data) — an extreme-but-finite leverage never throws, so the chart/metrics
silently render whatever the kernel computes for a leverage value the UI itself could never
produce (immediate ruin, or `Infinity`/`NaN` propagating into `finalValueMultiple`/IRR/CAGR).
`initialInvestment` and `contributionAmount` have the same unbounded-finite-number gap.
**Fix:** Give `leverage` (and, if the UI itself bounds them, the money fields) the same upper
bound in `decodeParams` that the corresponding UI control enforces, rejecting an out-of-range
permalink value by name the same way an unrecognized `holdMode`/`tier`/`scale` value is rejected
today.

---

_Reviewed: 2026-08-23T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
