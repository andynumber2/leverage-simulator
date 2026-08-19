---
phase: 04-first-defensible-backtest-in-the-browser
plan: 04
subsystem: ui
tags: [solid-js, forms, validation, manifest-driven-bounds]

requires:
  - phase: 04-first-defensible-backtest-in-the-browser
    provides: "plan 01's tracer (App.tsx's result-column slot, state.ts's rAF-coalesced scheduleRun, the empty parameter-column aside) and plan 02's DerivedMetrics/MetricsPanel/RuinBanner/updateBacktestRequest write path"
provides:
  - "src/app/bounds.ts: listSymbols, dividendModesFor, resolveEntryDateBounds -- pure manifest resolution, no I/O, discriminated error result instead of throwing (D-09, D-12)"
  - "src/app/components/ParameterColumn/{SymbolControl,EntryDateControl,LeverageControl,SourceCitation,ParameterColumn}.tsx: the first three parameter controls, wired through updateBacktestRequest"
  - "src/app/components/ResultColumn/ValidationExplanation.tsx: renders buildKernelInputs' own thrown message verbatim, destructive color (D-11/D-12)"
  - "src/app/state.ts: scheduleRun now catches a thrown buildKernelInputs error, clears the run and stores the message -- the one mechanism a D-12 eviction reaches the screen through"
affects: ["04-05 (HoldingModeControl, ContributionControl, CostControls extend ParameterColumn and reuse SourceCitation's costParameterId form; ValidationExplanation gains the cross-field caveat variant and stacking order)", "04-06/04-07 (permalink and PERF-07b now have real scrubbable input to encode/measure against)"]

actuals:
  tokens: 12700
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "buildKernelInputs as the single validation authority: EntryDateControl sets HTML min/max for the bounds it can resolve up front (D-10), but D-12's eviction (a bound recomputing out from under an already-set value) is not re-derived as a second check -- it surfaces because buildKernelInputs itself throws a named range error, which scheduleRun's new catch block turns into currentValidationError() and D-11's clear-and-explain state, verbatim, never re-authored"
    - "Reject-the-keystroke validation: LeverageControl's numeric readout only updates its own displayed draft text on a keystroke that parses to an in-range value or a recognized partial state (empty, lone '-'/'.', trailing '.'); an out-of-range parse leaves the controlled input's value bound to the prior draft, so the invalid character never visibly lands, rather than accepting it and coercing after the fact"
    - "SourceCitation's dual form (text | costParameterId): a hand-written string for a computed default with no COST_PARAMETERS entry (used this plan), and a costParameterId whose value/citation/confidence are read straight off COST_PARAMETERS so a citation can never drift from the constant it describes (unused this plan, built for 04-05's CostControls)"

key-files:
  created:
    - src/app/bounds.ts
    - src/app/components/ParameterColumn/ParameterColumn.tsx
    - src/app/components/ParameterColumn/SourceCitation.tsx
    - src/app/components/ParameterColumn/SymbolControl.tsx
    - src/app/components/ParameterColumn/EntryDateControl.tsx
    - src/app/components/ParameterColumn/LeverageControl.tsx
    - src/app/components/ResultColumn/ValidationExplanation.tsx
    - tests/app/bounds.test.ts
    - tests/app/controls.browser.test.ts
  modified:
    - src/app/App.tsx
    - src/app/state.ts
    - src/app/styles.css

key-decisions:
  - "buildKernelInputs' own D-32 range-rejection error is the single source of D-12 eviction copy: scheduleRun catches it, clears kernelInputs/kernelResult/derivedMetrics and stores the message for ValidationExplanation, rather than EntryDateControl re-deriving its own is-this-date-still-valid check against bounds.ts a second time. This means the two validation paths (control-level min/max and cross-parameter range rejection) never disagree with each other by construction."
  - "The pre-existing '.validation-explanation' CSS class (the 04-02-era 'This run has no plottable bars' placeholder, muted text) was split from the new destructive-colored ValidationExplanation component's class of the same name -- renamed the old placeholder's class to '.empty-run-notice' so the D-18/UI-SPEC-required destructive color for D-11/D-12 evictions doesn't silently repaint an unrelated pre-existing message."
  - "LeverageControl rejects an out-of-range keystroke by leaving the controlled input's draft text unchanged (never writing the invalid text into displayed state), rather than displaying the rejected number alongside an error message -- read literally, UI-SPEC E2's 'the numeric readout rejects the keystroke' means the character itself does not take visible effect, not that it is shown and then flagged."

requirements-completed: [APP-01, APP-04, DATA-08]

coverage:
  - id: D1
    description: "listSymbols/dividendModesFor/resolveEntryDateBounds resolve the eleven-symbol universe, dividend-mode availability and strict-tier entry-date bounds from the manifest, with a discriminated error result (not a throw) on an unknown symbol or absent tier"
    requirement: APP-01
    verification:
      - kind: unit
        ref: "tests/app/bounds.test.ts (9 cases: eleven-symbol exclusion of @rate, ascending/idempotent ordering, dividend-mode reporting, strict-tier-vs-full-range distinction, NDX dividend-mode date divergence, unknown-symbol error result, buildKernelInputs round-trip) -- all pass"
        status: pass
    human_judgment: false
  - id: D2
    description: "SymbolControl: single native select populated from listSymbols in manifest-derived ascending order, identical across mounts; dividend-reinvest toggle disabled with an inline stated reason when a mode is missing from the manifest"
    requirement: APP-01
    verification:
      - kind: e2e
        ref: "tests/app/controls.browser.test.ts > selecting each of the eleven symbols resolves a distinct meta.seriesId and repaints without throwing; > the select's option order is ascending and identical across two mounts; > the dividend toggle is disabled with a stated reason for a symbol whose dividend mode is missing from the manifest"
        status: pass
    human_judgment: false
  - id: D3
    description: "EntryDateControl: min/max attributes track resolveEntryDateBounds live from symbol+dividend mode+strict tier; a value evicted by a bound recompute is never moved, is explained by name (D-12), and clears the chart/metrics (D-11); a partially typed date neither recomputes nor evicts"
    requirement: APP-04
    verification:
      - kind: e2e
        ref: "tests/app/controls.browser.test.ts > the NDX dividend-mode eviction clears the result and names 1999-03-04, with chart and metrics absent from the DOM; > a partially typed date does not recompute or evict"
        status: pass
    human_judgment: false
  - id: D4
    description: "LeverageControl: slider writes on every 'input' event, coalesced by the existing rAF guard to one recompute per frame; out-of-range input is rejected at the control rather than coerced; clearing the readout reverts to the last valid value on blur so the kernel is never called with NaN"
    requirement: APP-04
    verification:
      - kind: e2e
        ref: "tests/app/controls.browser.test.ts > dragging the leverage slider across its range issues at most one kernel run per animation frame (two 35-event bursts, one recompute each); > a leverage keystroke that would exceed 20 is rejected at the control and the value is unchanged; > clearing the leverage readout restores the last valid value on blur; > the leverage readout element's computed font-family resolves to the monospace stack"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every control in the parameter column renders disabled while the load status is loading, per DATA-08's offline/loading-state contract"
    requirement: DATA-08
    verification:
      - kind: e2e
        ref: "tests/app/controls.browser.test.ts > every control in the parameter column is disabled while the load status is loading"
        status: pass
    human_judgment: false
  - id: D6
    description: "No parameter is silently coerced anywhere in ParameterColumn (APP-04's core prohibition); the whole-suite verification loop (typecheck, unit, app, build) stays green"
    verification:
      - kind: other
        ref: "grep -rn 'Math.min|Math.max|clamp' src/app/components/ParameterColumn returns nothing; npm run typecheck && npm test (496 tests) && npm run test:app (20 tests) && npm run build all exit 0"
        status: pass
    human_judgment: false

duration: ~1h
completed: 2026-08-19
status: complete
---

# Phase 4 Plan 4: Symbol, Entry Date, and Leverage Summary

**Three parameter controls (symbol select with dividend-reinvest toggle, live-bounded entry date, scrubbable leverage slider) wired through the existing rAF-coalesced recompute, with a manifest-derived pure bounds module and buildKernelInputs' own D-32 error becoming the single source of D-11/D-12's clear-and-explain state.**

## Performance

- **Duration:** ~1h
- **Tasks:** 3
- **Files modified:** 12 (9 created, 3 modified)
- **Commits:** 3

## Accomplishments

- `src/app/bounds.ts`: a pure, I/O-free module resolving the eleven-symbol selectable universe (excluding `@rate`, sorted ascending for a screenshot-stable order), dividend-mode availability, and strict-tier entry-date bounds -- an unknown symbol or absent tier returns a discriminated result instead of throwing.
- `SymbolControl`, `EntryDateControl`, `LeverageControl`, `SourceCitation`, `ParameterColumn`: the first three parameter controls, filling the previously-empty parameter column, every one disabled until the manifest decodes.
- `ValidationExplanation` + `state.ts`'s `scheduleRun` catch: `buildKernelInputs`' own thrown range-rejection message (naming the offending value and the actual supported range) becomes the D-11/D-12 clear-and-explain surface verbatim -- no second copy of the range check was written.
- A leverage slider that can genuinely be scrubbed: writes on every `input` event, coalesced by the pre-existing rAF guard to one recompute per frame regardless of event count, proven with a 35-event synchronous burst producing exactly one `app-recompute` measure.
- 20 new browser-test cases across `tests/app/bounds.test.ts` (9, unit) and `tests/app/controls.browser.test.ts` (11 new, app project) covering every UI-SPEC E1/E2/E3 state this plan's controls own.

## Task Commits

1. **Task 1: The pure bounds module** - `8d67310` (feat)
2. **Task 2: Symbol/dividend-mode select, live-bounded entry date, eviction explanation** - `b4cdcb3` (feat)
3. **Task 3: Scrubbable leverage slider and browser coverage** - `a557e26` (feat)

## Files Created/Modified

- `src/app/bounds.ts` - `listSymbols`, `dividendModesFor`, `resolveEntryDateBounds`
- `src/app/components/ParameterColumn/SourceCitation.tsx` - dual-form inline citation (hand-written text or `COST_PARAMETERS`-derived)
- `src/app/components/ParameterColumn/SymbolControl.tsx` - native select + dividend-reinvest toggle
- `src/app/components/ParameterColumn/EntryDateControl.tsx` - live min/max, D-12 eviction surfaces via `buildKernelInputs`
- `src/app/components/ParameterColumn/LeverageControl.tsx` - scrubbable slider + reject-the-keystroke monospace readout
- `src/app/components/ParameterColumn/ParameterColumn.tsx` - persistent container, all controls gated on load status
- `src/app/components/ResultColumn/ValidationExplanation.tsx` - renders the caught error verbatim, destructive color
- `src/app/state.ts` - `scheduleRun` now catches `buildKernelInputs`' throw, `currentValidationError()` exported
- `src/app/App.tsx` - wires `ParameterColumn` and `ValidationExplanation` into the layout
- `src/app/styles.css` - parameter-group/control-label/entry-date/leverage-readout/source-citation tokens; split `.validation-explanation` (destructive) from the pre-existing placeholder, renamed `.empty-run-notice`
- `tests/app/bounds.test.ts` - 9 cases, unit project
- `tests/app/controls.browser.test.ts` - 11 cases, app project

## Decisions Made

See `key-decisions` in frontmatter: `buildKernelInputs`' thrown error as the single D-12 authority, the `.validation-explanation`/`.empty-run-notice` CSS split, and the reject-the-keystroke leverage readout.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, self-caught before final verification] Cross-test state leak broke the dividend-mode-missing test**
- **Found during:** Task 3, first `npm run test:app` run after writing `controls.browser.test.ts`
- **Issue:** `src/app/state.ts`'s signals are module-level singletons, not reset between tests in the same file. The symbol-iteration test (declared earlier in the file) left `backtestRequest().symbol` at `VTI` (the last of eleven options iterated); the dividend-toggle test assumed it was still the default `SPX`, so its manifest stub (removing `SPX/price-return`) had no effect on the actually-selected symbol and the toggle rendered enabled.
- **Fix:** The dividend-toggle test now explicitly resets `symbol: 'SPX', dividendReinvest: true` and waits for that run to resolve before asserting, rather than relying on mount-time defaults.
- **Files modified:** `tests/app/controls.browser.test.ts`
- **Verification:** `npm run test:app` passes deterministically across three consecutive runs.
- **Committed in:** `a557e26` (part of Task 3's commit; test written and fixed before commit)

---

**Total deviations:** 1 (test-authoring bug, caught and fixed before commit)
**Impact on plan:** No app-code deviation. The fix stayed inside the one test file Task 3 already owned.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `ParameterColumn` is ready for 04-05's `HoldingModeControl`, `ContributionControl` and `CostControls` to slot in beside `SymbolControl`/`LeverageControl`/`EntryDateControl` without layout rework.
- `SourceCitation`'s `costParameterId` form is built but unexercised this plan -- 04-05's `CostControls` is its first real caller.
- `ValidationExplanation` renders only the single D-12 eviction message this plan produces; 04-05 extends it with the cross-field caveat variant and the stacking order (bundle mismatch, then single-field evictions, then cross-field caveats) named in the UI-SPEC.
- `scheduleRun`'s catch block is now the one place a thrown `buildKernelInputs` error becomes screen state -- any future control that can produce an out-of-range or otherwise-rejected parameter combination gets D-11/D-12 behavior for free, with no new validation code required.
- No blockers carried forward from this plan.

## Self-Check: PASSED

All 12 claimed files verified present on disk; all 3 claimed commit hashes (`8d67310`, `b4cdcb3`, `a557e26`) verified present in `git log`.

---
*Phase: 04-first-defensible-backtest-in-the-browser*
*Completed: 2026-08-19*
