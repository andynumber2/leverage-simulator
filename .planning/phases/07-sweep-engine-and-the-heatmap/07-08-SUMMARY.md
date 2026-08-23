---
phase: 07-sweep-engine-and-the-heatmap
plan: 08
subsystem: viz
tags: [canvas2d, crosshair, hit-testing, hover-readout, drill-down, sweep, heatmap]

requires:
  - phase: 07-sweep-engine-and-the-heatmap
    plan: "07-06"
    provides: "src/app/state.ts's displayedMetric signal and the D-21 result-slot toggles"
  - phase: 07-sweep-engine-and-the-heatmap
    plan: "07-07"
    provides: "src/app/components/ResultColumn/SliceChart.tsx's resolveFixedRow/resolveFixedCol (which already read crosshairCell()), nearestColForEntryDate/nearestRowForLeverage, and HeatmapPanel.tsx's screenshot-region layout"
provides:
  - "src/heatmap/crosshair.ts: crosshairCellFor (snap-to-nearest-cell hit test, vertical flip inverted), clampLeverageToGrid (off-grid leverage clamped for DRAWING only), CrosshairCellHit/FieldRect types"
  - "src/app/components/ResultColumn/HoverReadout.tsx: the transient per-cell receipt, edge-flipping near the panel's right/bottom"
  - "src/app/components/ResultColumn/HeatmapPanel.tsx: the crosshair overlay canvas (ghost + committed), pointer handlers, and the click-to-drill-down path"
  - "src/app/state.ts: UpdateBacktestRequestOptions.skipSweep -- a write path that patches entryDate/leverage WITHOUT scheduling a re-sweep"
affects: [07-09, 07-10]

actuals:
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Hit-test geometry lives in a DOM-free, Solid-free module (src/heatmap/crosshair.ts) so cell resolution and the off-grid clamp are unit-testable in the fast Node `unit` project, matching the zero-import discipline of its sibling heatmap modules"
    - "An off-range stored value is clamped for DRAWING and left untouched in the store, with the clamp reported back as a boolean flag so the renderer can mark the clamped state (dashed guide) rather than present a clamped position as an exact one"
    - "A dedicated boolean option on an existing write path (updateBacktestRequest's skipSweep) expresses 'this write is a view change, not an input change', instead of introducing a parallel setter that would let the two paths drift"

key-files:
  created:
    - src/heatmap/crosshair.ts
    - src/app/components/ResultColumn/HoverReadout.tsx
    - tests/heatmap/crosshair.test.ts
    - tests/app/crosshair.browser.test.ts
  modified:
    - src/app/components/ResultColumn/HeatmapPanel.tsx
    - src/app/state.ts

key-decisions:
  - "Off-grid leverage (Pitfall 6, undecided in 07-CONTEXT.md): the DRAWN crosshair clamps to the nearest grid edge row and the STORED leverage is left completely untouched, so LeverageControl still reads 10x and switching back to Single run still runs 10x. The clamped state is marked with a dashed leverage guide rather than presented as an exact position."
  - "state.ts is outside this plan's declared files_modified; adding an optional, default-false skipSweep option to updateBacktestRequest was a Rule 3 deviation. It is the smallest change that satisfies the T-07-MUST 'committing a cell must not start a sweep' requirement without altering any existing call site's behavior, and it keeps drill-down on the same write path every parameter control already uses."
  - "D-17 is enforced in BOTH directions: a createEffect re-resolves crosshairCell() from the live backtestRequest().entryDate/leverage whenever either changes AND a crosshair is already committed. It never summons a crosshair from a bare keyboard edit, matching E5's 'before any pointer interaction, neither renders'. crosshairCell() is read untracked inside that effect so its own writes cannot re-trigger it."
  - "Finding F-03 (the field canvas has no keyboard nudge of its own, per D-21) is answered by that same effect rather than by adding a second input surface: the crosshair STATE stays keyboard-reachable through the existing entry-date and leverage controls, which drive the identical store fields."
  - "Drill-down is a single click and nothing else (D-22): no tooltip button, no dblclick affordance anywhere in the result column, asserted directly."

patterns-established:
  - "resetAppState deliberately preserves the last resolved sweepGrid (its own documented decision: the grid is a pure function of a subsequent scheduleSweep, not app-load state). A test file that mounts the real app more than once must therefore gate its 'sweep is ready' wait on grid REFERENCE inequality against the pre-mount grid, not on grid dimensions alone -- runSweepNow builds a fresh SweepGrid object per pass, so reference inequality is the only condition that waits for this mount's own sweep. A bare dimensions check resolves instantly against the previous test's grid and lets the new sweep land mid-assertion."
  - "The permalink is written on the trailing edge of a COMPLETED run (storeSuccessfulRun -> schedulePermalinkSync), while updateBacktestRequest's store write is synchronous and its scheduleRun is rAF-coalesced. A test that flushes the permalink immediately after observing a store field finds nothing pending; it must first wait for the run carrying that value to resolve (currentKernelInputs())."

requirements-completed: [VIZ-03]

coverage:
  - id: D1
    description: "The pointer snaps to the nearest cell centre, inverting the same vertical flip resampleField applies, and resolves to null outside the field rectangle"
    requirement: VIZ-03
    verification:
      - kind: unit
        ref: "tests/heatmap/crosshair.test.ts -- one pixel inside the top-left corner resolves to (col 0, row SWEEP_ROWS-1) and one pixel inside the bottom-right corner resolves to (col SWEEP_COLS-1, row 0), proving the flip is inverted; an on-boundary pointer resolves deterministically to the cell whose interval begins there; null outside the rect on every side; a non-zero field-rect origin is respected"
        status: pass
    human_judgment: false
  - id: D2
    description: "A stored leverage outside the sweep grid's [1, 5] range draws the committed crosshair clamped to the nearest grid edge with its leverage guide dashed, leaves the stored value untouched, and never throws"
    requirement: VIZ-03
    verification:
      - kind: unit
        ref: "tests/heatmap/crosshair.test.ts -- clamped false for 1.0/3.0/5.0, clamped true for 0.5 (row 0) and 10 (last row); every row within [0, SWEEP_ROWS-1] across a wide finite range; never throws for non-finite input"
        status: pass
      - kind: automated_ui
        ref: "tests/app/crosshair.browser.test.ts -- a stored leverage outside [1, 5] draws the committed leverage guide dashed, never solid (read from getImageData by counting fully transparent samples along the line)"
        status: pass
    human_judgment: false
  - id: D3
    description: "E5 empty: before any pointer interaction neither crosshair nor readout renders, and no reserved empty slot is left behind"
    requirement: VIZ-03
    verification:
      - kind: automated_ui
        ref: "tests/app/crosshair.browser.test.ts -- no crosshair pixel is painted and no readout is mounted before any pointer interaction"
        status: pass
    human_judgment: false
  - id: D4
    description: "The ghost and committed crosshairs are visually distinguishable without a label: ghost 1px dashed muted, committed 2px solid accent; hover commits nothing"
    requirement: VIZ-03
    verification:
      - kind: automated_ui
        ref: "tests/app/crosshair.browser.test.ts -- hovering paints a dashed muted ghost and leaves crosshairCell() unchanged; moving off the field clears it; clicking paints a solid 2px accent crosshair distinct from the ghost in both colour and dash pattern (both read directly from getImageData)"
        status: pass
    human_judgment: false
  - id: D5
    description: "E5 zero-one-many: at most one ghost and at most one committed crosshair exist at any time; a second click moves the committed crosshair rather than accumulating a pin set"
    requirement: VIZ-03
    verification:
      - kind: automated_ui
        ref: "tests/app/crosshair.browser.test.ts -- a second click moves the committed crosshair rather than adding a second one"
        status: pass
    human_judgment: false
  - id: D6
    description: "E5 populated/partial: the readout carries the entry date, the leverage and every metric the sweep computed for that cell; a ruined or incomplete cell shows the categorical label in place of the numeric rows, never a stale or zeroed number"
    requirement: VIZ-03
    verification:
      - kind: automated_ui
        ref: "tests/app/crosshair.browser.test.ts -- all five field labels render for a normal cell; a ruined cell shows 'Ruined' and omits the multiple/drawdown/annualized rows entirely"
        status: pass
    human_judgment: false
  - id: D7
    description: "E5 overflow: near the panel's right or bottom edge the readout flips to stay on screen rather than clipping"
    requirement: VIZ-03
    verification:
      - kind: automated_ui
        ref: "tests/app/crosshair.browser.test.ts -- the readout at the field's bottom-right corner cell stays entirely inside the panel"
        status: pass
    human_judgment: false
  - id: D8
    description: "Clicking a cell writes its entry date and leverage to the existing BacktestRequest fields, so switching to Single run shows the full receipts for exactly that cell -- and the click itself never starts a sweep"
    requirement: VIZ-03
    verification:
      - kind: automated_ui
        ref: "tests/app/crosshair.browser.test.ts -- against the REAL mounted app: clicking a cell writes entryDate/leverage and switching to Single run computes those exact parameters (currentKernelInputs().window.firstDate / params.leverage); committing a cell leaves sweepGeneration() unchanged; the flushed permalink URL carries the clicked cell's entryDate/leverage; no [ondblclick] affordance exists anywhere in the result column"
        status: pass
    human_judgment: false
  - id: D9
    description: "The crosshair state stays reachable without a pointer, through the existing keyboard-operable entry-date and leverage controls, which drive the same store fields"
    requirement: VIZ-03
    verification:
      - kind: automated_ui
        ref: "tests/app/crosshair.browser.test.ts -- a keyboard-driven leverage change (vitest/browser userEvent.keyboard, a browser-trusted key event, not a synthetic dispatchEvent) moves an already-committed crosshair to the corresponding row"
        status: pass
    human_judgment: false

completed: 2026-08-23
status: complete
---

# Phase 07 Plan 08: Crosshairs, the Hover Readout, and Drill-Down Summary

**The sweep field is now pointable cell by cell (snap-to-nearest hit testing with the vertical flip inverted), readable cell by cell (a hover readout that is the cell's receipt, not an echo of its colour), and continuous with the single-run view (one click writes the parameter column's own entryDate/leverage and never starts a sweep).**

## Accomplishments

- `src/heatmap/crosshair.ts` is pure grid-space geometry with no DOM and no Solid import, so it runs in the fast Node `unit` project alongside its sibling heatmap modules. `crosshairCellFor` inverts the same vertical flip `resampleField` applies (fixture row 0 paints at the BOTTOM), which is the trap this task was written around: a linear display-y-to-row map without the inversion points at the mirrored leverage and looks plausible while being wrong. Both flipped corners are asserted directly.
- `clampLeverageToGrid` resolves Pitfall 6, which `07-CONTEXT.md` left undecided. `LeverageControl` accepts `(0, 20]` and D-17 reuses it unchanged, but D-01 fixes the grid to `[1, 5]` over 50 rows. The rule adopted, following D-21's snap-to-nearest precedent: clamp the DRAWN position to the nearest edge row, leave the STORED value untouched, and return a `clamped` flag so the renderer marks the state with a dashed leverage guide instead of presenting a clamped position as an exact one.
- `HeatmapPanel.tsx` gained a crosshair overlay canvas above the field. Hover paints a 1px dashed muted ghost and mounts `HoverReadout.tsx`; it moves nothing else (not the slices, not the permalink, not `crosshairCell()`). Click commits via `setCrosshairCell` -- the same signal `SliceChart.tsx`'s `resolveFixedRow`/`resolveFixedCol` already read from 07-07 -- so the marginal slices pick up the new fixed row and column the instant it fires.
- `HoverReadout.tsx` renders the entry date, the leverage, and every metric the sweep computed for the pointed cell, formatting every value through `src/metrics/format.ts` (no second formatter introduced). A `CELL_FLAG_RUINED`/`CELL_FLAG_INCOMPLETE` cell shows its categorical label in place of the numeric rows rather than beside them. The readout flips near the panel's right and bottom edges, verified at the field's own corner cell.
- Drill-down (D-22) is the click plus the existing mode switch and nothing else: the same handler writes `entryDate`/`leverage` through `updateBacktestRequest`, so switching to Single run shows the full receipts for exactly that cell. `skipSweep: true` is load-bearing -- the crosshair's position is a cell WITHIN an already-computed field, not a new sweep input -- and is proven by a `sweepGeneration()`-unchanged assertion against the real mounted app.
- D-17 holds in both directions: a `createEffect` re-resolves `crosshairCell()` from the live `backtestRequest()` fields whenever they change and a crosshair is already committed, so a keyboard edit of the entry-date or leverage control moves the committed crosshair. This is also the answer to Finding F-03 -- the field canvas stays pointer-only per D-21, but the crosshair state is keyboard-reachable through the controls that own the same store fields.

## Task Commits

- `d8b1d8d` feat(07-08): snap-to-cell hit testing and off-grid leverage clamp
- `45b8051` feat(07-08): ghost/committed crosshairs and the hover readout
- `750c805` feat(07-08): crosshair click drills into entryDate/leverage without re-sweeping

## Deviations

- **Rule 3, `src/app/state.ts`:** not in this plan's declared `files_modified`. Committing a crosshair cell needed a write path that patches `entryDate`/`leverage` without re-sweeping, and no existing exported function provided one. An optional, default-`false` `skipSweep` option on `updateBacktestRequest` is the smallest change that satisfies the requirement while leaving every existing call site's behavior byte-identical, and it avoids a parallel setter that could drift from the one the parameter controls use.

## Surprises

- Two browser assertions in this plan's own test file failed only when the file ran as a whole, and passed in isolation. Root cause was neither the crosshair nor `skipSweep`: `resetAppState` deliberately preserves the last resolved `sweepGrid` (documented in `state.ts` as "a pure function of a subsequent `scheduleSweep()` call, not app-load state"), so the second and third real-app mounts in the file satisfied a `sweepGrid()!.cols === 200` wait instantly against the PREVIOUS test's grid, then let their own sweep land mid-assertion and bump `sweepGeneration()`. The mount helper now gates on grid reference inequality against the pre-mount grid; `runSweepNow` builds a fresh `SweepGrid` per pass, so that is the only condition which waits for this mount's own sweep. The same staleness hazard exists in every real-app test file, and is worth carrying forward to 07-10.
- The permalink assertion failed for a second, independent reason: the permalink is written on the trailing edge of a COMPLETED run, while `updateBacktestRequest`'s store write is synchronous and its `scheduleRun` is rAF-coalesced. Waiting on `backtestRequest().entryDate` therefore resolves before any run exists to serialize, and the flush finds nothing pending. The test now waits for `currentKernelInputs()` to carry the clicked entry date first.

## Verification

- `npm run typecheck` clean.
- `npm run test` (unit project): 774 tests, 770 pass, 4 skipped, 0 fail.
- `npm run test:app` (browser project): 148 tests, 148 pass, 0 fail, including all 14 in `tests/app/crosshair.browser.test.ts`.
- `npm run build` succeeds; the `static-build` and offline-reload gates pass against the produced `dist/`.
