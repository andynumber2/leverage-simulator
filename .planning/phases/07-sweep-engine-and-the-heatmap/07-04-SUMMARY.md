---
phase: 07-sweep-engine-and-the-heatmap
plan: 04
subsystem: viz
tags: [canvas, marching-squares, contour-fill, performance-gate, heatmap, offscreen-cache]

requires:
  - phase: 07-01
    provides: "src/heatmap/iso-lines.ts, field-sampler.ts, paint-contour.ts's FillPath seam, and the live SweepGrid container (src/sweep/sweep-grid.ts) plan 07-04 builds on"
provides:
  - "src/heatmap/polygon-fill.ts: stitchBandRings/buildBandPolygons, a general-purpose marching-squares ring stitcher with field-edge closure, hole classification, and categorical-cell exclusion -- built, gated, and kept as a rejected-but-checkable alternative fill path"
  - "src/heatmap/paint-contour.ts's 'polygon' FillPath member, wired but not shipped"
  - "src/heatmap/paint-contour.ts's D-09 offscreen-resample mitigation: RESAMPLE_INTERNAL_MAX_AREA_PX, internalResampleDimensions, the generation/metric-keyed offscreen cache -- the SHIPPED fill path"
  - "bench/heatmap-form-2.bench.test.ts's official PERF-05 MeasurementRow, repointed at the shipped renderer (closes Finding F-05)"
affects: [07-05, 07-06, 07-07, 07-08, 07-09, 07-10]

actuals:
  tokens: 19400
  tasks: 4
  commits: 3

tech-stack:
  added: []
  patterns:
    - "A rejected implementation path stays in the source and test trees, never deleted, with the FillPath/similar seam's own module header carrying the full decision record (measured figures, root cause, owner verification) so a future reader can see why without rebuilding it"
    - "A bench file's own gating assertions for a decision that has since been finalized against the LOSING option are kept alive via Vitest's test.fails (not deleted, not silently downgraded): the suite stays green, but the test still fails internally for the documented reason and would loudly surface if that ever stopped being true"
    - "An offscreen-canvas resample cache keyed on (data generation, metric, cols, rows, internal resolution): invalidated per data/metric change, never per frame, with the internal resample resolution anchored to a specific prior CI measurement rather than an arbitrary fraction of display area"

key-files:
  created:
    - src/heatmap/polygon-fill.ts
    - tests/heatmap/polygon-fill.test.ts
  modified:
    - src/heatmap/paint-contour.ts
    - bench/heatmap-form-2.bench.test.ts

key-decisions:
  - "D-06 escalation resolved to d09-fallback, not fix-stitcher or hybrid. The owner independently reproduced this plan's bench measurement interactively in the live dev server: at the app's default holdMode: 'end-of-data' (no categorical cells), resample and polygon were close (~12-15ms vs ~16-20ms at 800x240), but with a fixed ~10-year holding period (reintroducing the fixture's ~2,600 contiguous incomplete cells), polygon jumped to ~110-130ms against resample's ~12-13ms -- independently reproducing this plan's own 149.71ms bench figure. The polygon path degrades roughly 10x precisely when ruin/incomplete cells appear on screen, which is the case the heatmap exists to show, so the committed fixture is judged a legitimate real user configuration, not a synthetic worst case, and no further investment in the stitcher was warranted"
  - "polygon-fill.ts and its FillPath member are kept, not deleted, per explicit instruction: the rejection needs to stay checkable by a future reader without rebuilding the stitcher from scratch"
  - "RESAMPLE_INTERNAL_MAX_AREA_PX (175,000px) anchors the D-09 offscreen cache's internal resample resolution to the previously measured 171,136px/12.80ms CI figure (06-HEATMAP-SPEC.md Finding A) rather than an arbitrary fraction of the display's own area, so the chosen resolution is traceable to a real prior measurement"
  - "The bench file's official PERF-05 MeasurementRow moved from the (now-rejected) polygon path to the shipped resample+D-09 path; the rejected path's own repaint cost is kept as a recordInfoLine-only figure (never a competing 'production' MeasurementRow, since bench/report.ts's resolveByBudgetId throws on two same-source rows for one budget id by design)"

patterns-established:
  - "Pattern: a fill/render path decision gate (D-06/D-07 style) records BOTH arms' measured figures in the losing arm's own module/file header, not only in the winning arm's code -- a reader auditing the winning path sees the full comparison without archaeology"

requirements-completed: [VIZ-03, PERF-05]

coverage:
  - id: D1
    description: "polygon-fill.ts: a general marching-squares ring stitcher (stitchBandRings/buildBandPolygons) with field-edge closure, hole classification (bullseye case), and categorical-cell exclusion, isolated with six named failure-mode tests plus two stitchBandRings-level checks"
    requirement: VIZ-03
    verification:
      - kind: unit
        ref: "tests/heatmap/polygon-fill.test.ts (9 tests: coverage/area-epsilon, field-edge closure, bullseye hole handling, categorical exclusion at edge+interior, constant field, degenerate grids x2, stitchBandRings x2)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The D-07 gate ran to completion: paintSweepField through 'polygon' measured against the 'resample' oracle at three named tolerances, and PERF-05 measured at the declared 1200x400 shipped-panel geometry -- both criteria genuinely missed, with the full figures recorded rather than any tolerance/budget/geometry relaxed"
    verification:
      - kind: other
        ref: "bench/heatmap-form-2.bench.test.ts's test.fails equivalence check (kept as a live regression detector post-decision) and its polygon-rejected informational PERF-05 measurement, both recorded in .bench/bench-results.json's infoLines"
        status: pass
    human_judgment: false
  - id: D3
    description: "The shipped fill path (resample + D-09 offscreen-cache mitigation) holds the PERF-05 budget at the declared 1200x400 shipped-panel geometry, with the metric-change repaint never triggering a re-sweep"
    requirement: PERF-05
    verification:
      - kind: other
        ref: "bench/heatmap-form-2.bench.test.ts's official PERF-05 MeasurementRow: normalizedMs~8.2-8.5ms against the 16ms budget, verdict=pass, recorded in .bench/bench-results.json"
        status: pass
      - kind: automated_ui
        ref: "tests/app/sweep-tracer.browser.test.ts (3 tests, unmodified, still pass against the new D-09-cached 'resample' path)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The ship/reject decision itself: the owner independently verified both paths interactively in the live app against real hold-mode configurations before selecting d09-fallback"
    verification: []
    human_judgment: true
    rationale: "The decision required an owner review of the live app outside any automated gate. Already completed -- recorded here as the coverage entry that closes the loop between the bench's own gate result and the human decision it fed into, per D-06's design."

duration: 58min
completed: 2026-08-23
status: complete
---

# Phase 07 Plan 04: Heatmap Fill Algorithm (D-05/D-06/D-07 Gate) Summary

**Attempted the O(cells) polygon-fill rebuild `06-HEATMAP-SPEC.md` Finding A ranked first; it failed the D-07 gate on both equivalence and the PERF-05 budget by a wide margin, and the owner rejected it on independently-reproduced evidence -- the shipped heatmap fill is D-09's offscreen-resample-cache fallback, with the rejected polygon path kept in the tree as a checkable, never-deleted record.**

## Performance

- **Duration:** 58min
- **Started:** 2026-08-22T23:44:00Z (approx.)
- **Completed:** 2026-08-23T00:40:54Z
- **Tasks:** 4
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- Built `src/heatmap/polygon-fill.ts`: `stitchBandRings` closes an unstitched `IsoSegment[]` into rings via a field-edge boundary walk (built from the identical crossing formula `iso-lines.ts` uses, so joins are exact); `buildBandPolygons` derives each band's polygon as a region-above-level subtraction between consecutive levels, cancelling identical rings and reclassifying holes from scratch, then punches out every categorical cell as an explicit hole ring. Nine tests isolate each named failure mode (full coverage/area-epsilon, field-edge closure, bullseye hole handling, categorical exclusion at the field edge and interior, a constant field's single-band ring, degenerate grids).
- Wired the `'polygon'` `FillPath` into `paint-contour.ts` behind the seam plan 07-01 created, and ran the D-07 gate in `bench/heatmap-form-2.bench.test.ts`: an equivalence check against the `'resample'` oracle at three named tolerances (2.0% differing pixels, 2px boundary-proximity, exact match inside categorical cells), then a PERF-05 measurement at the declared 1200x400 shipped-panel geometry (06-HEATMAP-SPEC.md Finding A's own predicted worst case).
- **Both gate criteria missed by a wide margin, honestly measured and recorded, nothing relaxed.** 12.92% of pixels differed (2.0% ceiling); 35,532 categorical-cell pixels differed (0 ceiling) because `resampleField`'s bilinear stencil smooths a ruined/incomplete cell's colour across its neighbouring cells while `polygon-fill.ts`'s hole rings are exact to the cell's own rectangle; PERF-05 measured 149.71ms against the 16ms budget (~9.4x over), dominated by O(categorical cells x bands x rings) hole-punching and O(rings squared) ring operations on the real fixture's ~2,600 contiguous incomplete cells.
- Task 3's checkpoint (a genuine blocking pause, per D-06) presented these figures to the owner, who independently reproduced the same ~10x degradation interactively in the live app under a fixed 10-year holding period, and selected **d09-fallback**.
- Shipped D-09's documented mitigation: `paintResampleFill` now resamples at a reduced internal resolution (`RESAMPLE_INTERNAL_MAX_AREA_PX`, anchored to the previously measured 171,136px/12.80ms CI figure) into an offscreen canvas cached per data/metric change, then upscales via `drawImage` with smoothing on. Repointed the bench file's official PERF-05 row at this shipped path: measured ~8.2-8.5ms against the 16ms budget, comfortably inside it. `polygon-fill.ts` and the `'polygon'` `FillPath` member are kept, never deleted; the equivalence test is now `test.fails` (a live regression detector on the rejected path, not a blocking gate).

## Task Commits

Each task was committed atomically:

1. **Task 1: Stitch marching-squares segments into closed band rings** - `e61f1ee` (feat)
2. **Task 2: Run the D-07 gate: same picture, and inside the repaint budget** - `36c5bfc` (feat)
3. **Task 3: D-06 escalation, only a real pause on a gate miss** - checkpoint, resolved by the coordinator to `d09-fallback`, no code commit (decision-only task)
4. **Task 4: Ship the decided path and leave the oracle standing** - `a5ca5d1` (feat)

**Plan metadata:** (recorded after this SUMMARY commits)

## Files Created/Modified

- `src/heatmap/polygon-fill.ts` - Marching-squares ring stitcher: `stitchBandRings`, `buildBandPolygons`, `BandRing`, `GridPoint`. Kept, wired, rejected as the shipped default.
- `tests/heatmap/polygon-fill.test.ts` - Nine tests isolating each named failure mode of the stitcher (coverage, field-edge closure, bullseye holes, categorical exclusion, constant field, degenerate grids).
- `src/heatmap/paint-contour.ts` - `FillPath` gains `'polygon'` (built, gated, rejected, kept) alongside `'resample'` (shipped default). Module header carries the full D-06/D-07/D-09 decision record. New: `RESAMPLE_INTERNAL_MAX_AREA_PX`, `internalResampleDimensions`, the generation/metric-keyed offscreen resample cache, `paintPolygonFill`, `categoricalFillColor`, `BAND_FILL_COLORS`, `rgbaToCss`. `gridColToDisplayX`/`gridRowToDisplayY` now exported for the bench file's own boundary-geometry needs.
- `bench/heatmap-form-2.bench.test.ts` - Rewritten off the Phase 6 mockup entirely (closes Finding F-05) onto a live `SweepGrid` adapted from the committed fixture. Runs the D-07 gate (equivalence + PERF-05, `test.fails`-marked post-decision for the equivalence check); official PERF-05 row now measures the shipped `resample` + D-09 path; the rejected polygon path's cost is a `recordInfoLine`-only figure; adds a direct `resampleField` exercise so the D-08 oracle is demonstrably live in the test tree by name.

## Decisions Made

- **D-06 escalation resolved to d09-fallback** (not fix-stitcher, not hybrid). See `key-decisions` in frontmatter for the full owner-verification record: interactive dev-server comparison at both `holdMode: 'end-of-data'` (close: ~12-15ms vs ~16-20ms) and a fixed 10-year hold (not close: ~12-13ms vs ~110-130ms), independently reproducing this plan's own 149.71ms bench figure. The polygon path degrades ~10x exactly when ruin/incomplete cells appear on screen -- the case the heatmap exists to show -- so the committed fixture is a legitimate real user configuration, not a synthetic worst case, and the owner saw no reason to keep investing in the stitcher.
- **polygon-fill.ts and the `'polygon'` FillPath member are kept, never deleted.** The rejection needs to stay checkable by a future reader without rebuilding the stitcher from scratch, and `tests/heatmap/polygon-fill.test.ts` + the bench file's own `test.fails` equivalence check keep it exercised as a live regression detector.
- **RESAMPLE_INTERNAL_MAX_AREA_PX (175,000px)** anchors the D-09 offscreen cache's internal resample resolution to the previously measured 171,136px/12.80ms CI figure (06-HEATMAP-SPEC.md Finding A), not an arbitrary fraction of display area -- traceable to a real prior measurement rather than an invented constant.
- **The bench file's official PERF-05 row moved from the polygon path to the shipped resample+D-09 path.** `bench/report.ts`'s `resolveByBudgetId` throws on two `'production'`-sourced rows for the same budget id by design (no principled winner between two live measurements of the same budget), so the rejected path's own figure is recorded via `recordInfoLine` only, never as a competing row.
- **Finding A is recorded as NOT closed.** The shipped path is D-09's mitigation, not the O(cells) rebuild Finding A hoped would make the whole finding evaporate. All four downstream concerns it named stay live: the offscreen cache (implemented), the metric-switch breach (a metric change still forces one full resample at the reduced resolution), the panel-size ceiling (bounded, not eliminated), and zoom softness (accepted -- `imageSmoothingEnabled` is deliberately on for the upscale draw).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/inconsistency] The bench file's own PERF-05 grep-style acceptance criterion did not match the literal `budgetId: 'PERF-05'` string in either the pre-existing or the rewritten file**
- **Found during:** Task 2
- **Issue:** Task 2's acceptance criteria list a grep for the literal string `budgetId: 'PERF-05'`, but both the file this plan replaced and the rewritten version derive `budgetId` from `PERF_BUDGETS['PERF-05'].id` (a variable reference, avoiding drift between the budget table and the recorder), so the literal string never appears. Confirmed via `git show` against the pre-Task-2 committed version, which also does not match.
- **Fix:** Left the established `budget.id`-derived pattern in place (a strictly better practice than hardcoding a literal string) rather than introducing a hardcoded string purely to satisfy an imprecise grep. The underlying invariant the grep was checking for -- exactly one file records the PERF-05 budget -- is enforced programmatically by `bench/report.ts`'s `resolveByBudgetId`, which throws on a genuine duplicate.
- **Files modified:** None beyond what Task 2 already touched.
- **Verification:** Manual grep comparison against git history; the programmatic duplicate-detection invariant is exercised by `assertRunInvariants` on every bench run.
- **Committed in:** `36c5bfc` (Task 2 commit, no separate fix needed)

**2. [Rule 2 - Missing critical functionality] The `resampleField` oracle was not exercised by name anywhere in the test tree after Task 2's rewrite**
- **Found during:** Task 4 (while verifying Task 4's own acceptance criteria against the final bench file)
- **Issue:** Task 2's bench file only reached `resampleField` indirectly, through `paintSweepField(..., { fillPath: 'resample' })`. Task 4's own acceptance criteria requires `grep -c "resampleField" tests/heatmap/polygon-fill.test.ts bench/heatmap-form-2.bench.test.ts` to be at least 1 combined, "proving the oracle survives" -- it was 0.
- **Fix:** Added a small, direct exercise of `resampleField` in the bench file (imports it from `field-sampler.ts`, calls it against the live grid, asserts the returned buffer's length), independent of `paintSweepField`'s own D-09-cached call path.
- **Files modified:** `bench/heatmap-form-2.bench.test.ts`
- **Verification:** `npm run typecheck`; `grep -c "resampleField" tests/heatmap/polygon-fill.test.ts bench/heatmap-form-2.bench.test.ts` now returns 3 combined.
- **Committed in:** `a5ca5d1` (Task 4 commit)

---

**Total deviations:** 2 auto-fixed (Rule 1: an imprecise acceptance-criteria grep pattern, left unaddressed in favour of the established better pattern; Rule 2: a missing direct oracle exercise, added).
**Impact on plan:** Neither deviation changed scope or behaviour. Both preserve the plan's actual intent (one PERF-05 recorder, a demonstrably-live D-08 oracle) more faithfully than a literal reading of the acceptance criteria text would have.

## Issues Encountered

- **Running `bench/heatmap-form-2.bench.test.ts` in isolation (the plan's own literal `<verify>` command) always trips the run-level PERF-08-coverage invariant once PERF-05 itself passes**, because that isolated run omits the OTHER bench files (`bench/perf-08.bench.test.ts` etc.) that measure PERF-08. Confirmed pre-existing and unrelated to this plan's work: `git show` against the pre-07-01 committed version of this same file shows the identical structural exposure (it was masked in Task 2's own run only because PERF-05 itself failed first, an earlier-checked invariant). Confirmed absent as a real defect by running the full `npm run bench` suite, which passes the PERF-08-coverage check cleanly and fails only on two separately pre-existing, `dist/`-build-dependent tests (`bench/perf-07.bench.test.ts`, `bench/perf-08.bench.test.ts`), the same class of environmental gap already observed in `tests/app/static-build.test.ts` and `tests/app/offline.browser.test.ts` (both require `npm run build` first, out of scope for this plan). Not fixed, per the deviation rules' scope boundary (pre-existing, not caused by this plan's changes).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The shipped heatmap fill path (`'resample'` + D-09's offscreen-resample cache) is stable, holds PERF-05 at the declared shipped-panel geometry, and is what plans 07-05 through 07-10 (viewport, crosshair, legend, curve labels, coarse-pass cancellation, caption) build against.
- **Finding A is explicitly NOT closed.** Any future plan touching pan/zoom or the metric toggle inherits its four still-live concerns: the offscreen cache (implemented, invalidated per data/metric change, not per frame), the metric-switch breach (a metric change still forces one internal-resolution resample), the panel-size ceiling (bounded by `RESAMPLE_INTERNAL_MAX_AREA_PX`, not eliminated), and zoom softness (accepted tradeoff, `imageSmoothingEnabled` on for the upscale draw). A pan/zoom-focused later plan (07-09/07-10's territory per the roadmap) should read this plan's `paint-contour.ts` header before assuming any of these are solved.
- `polygon-fill.ts` remains available behind the `FillPath` seam (`fillPath: 'polygon'`) for any future reconsideration, with its own test suite and the bench file's `test.fails` regression detector intact -- a future attempt does not need to rebuild the stitcher, only address the two documented root causes (the categorical bilinear-dilation mismatch and the O(cells x bands) hole-punching cost) if the tradeoff is ever revisited.
- No blockers.

## Self-Check: PASSED

All four created/modified files this plan touches are tracked (`git status --short` clean after each commit):
`src/heatmap/polygon-fill.ts`, `tests/heatmap/polygon-fill.test.ts`, `src/heatmap/paint-contour.ts`,
`bench/heatmap-form-2.bench.test.ts`. All three task commit hashes this SUMMARY cites (`e61f1ee`,
`36c5bfc`, `a5ca5d1`) are present in `git log --oneline`, verified via `git log --oneline -5`
immediately before this SUMMARY was written.

---
*Phase: 07-sweep-engine-and-the-heatmap*
*Completed: 2026-08-23*
