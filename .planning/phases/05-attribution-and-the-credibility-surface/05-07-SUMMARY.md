---
phase: 05-attribution-and-the-credibility-surface
plan: 07
subsystem: ui
tags: [solid-js, methodology, permalink, cost-model, validation, credibility]

requires:
  - phase: 05-attribution-and-the-credibility-surface
    provides: "05-04's ProvenanceStrip (the methodology link this plan wires up) and 05-05's live activeTier()/permalink tier wiring"
provides:
  - "MethodologyOverlay: a full-screen page stating the cost model, day-count conventions, data sources and four known limitations, generated from COST_PARAMETERS/TOLERANCE_MECHANISMS/the kernel's day-count constants/the manifest/the D-21 generated bias figure"
  - "The methodology URL flag: read and stripped from a copy of URLSearchParams before decodeParams runs, never added to PERMALINK_KEYS, opening the overlay independent of decode outcome"
  - "openMethodologyOverlay/closeMethodologyOverlay/methodologyOverlayOpen in state.ts, with a race-safe write path against the existing trailing-edge permalink flush"
affects: []

actuals:
  tokens: 12994
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "A URL flag read and deleted from a COPY of URLSearchParams before the strict permalink decoder ever sees it, so a key deliberately kept off the allow-list cannot break existing links or get rejected by decodeParams's own unknown-key check"
    - "Two race-safety layers around a URL flag that lives outside the app's own read/write cycle: the flag-writing function flushes any pending trailing-edge write first, and the run-parameter writer re-adds the flag when it is currently set, so neither write path can silently drop the other's key"
    - "A Solid createMemo gated on a UI-open signal (not just on the data it needs), and wrapped in try/catch, so a live diagnostic computation triggered by opening a rarely-used overlay cannot take down the whole app if it ever runs against a defective input -- a real bug this plan found and fixed against an existing zero-series-manifest test"

key-files:
  created:
    - src/app/components/MethodologyOverlay.tsx
    - tests/app/permalink-methodology.test.ts
    - tests/app/methodology-overlay.browser.test.ts
  modified:
    - src/app/state.ts
    - src/app/components/ResultColumn/ProvenanceStrip.tsx
    - src/app/App.tsx
    - src/app/styles.css

key-decisions:
  - "Tasks 2 and 3 were executed and committed together. Both target the same component render tree and the same verify file (methodology-overlay.browser.test.ts); splitting the four limitation paragraphs (Task 3) out of the cost-model/day-count/sources sections (Task 2) into a separate commit would have meant temporarily stubbing then un-stubbing the limitations section for no benefit, since the two were written as one coherent component from the start."
  - "The two gate-diagnosis figures that have no committed constant anywhere in the codebase (TQQQ's margin against the tracking-error tolerance, and the post-2022 high-rate return-drift for both funds, D-19c/D-19d) are computed live from the already-loaded bundle, using the exact same canonical construction (fund's own inception-era expense ratio, FINANCING_SPREAD_DEFAULT, resolveOverlapWindow) the CI gate test and ValidationSection already use -- never the parameter column's live, user-editable cost values, so the page states a fixed methodological fact rather than one that moves with whatever the reader has the sliders set to. The noise-component share and its absolute floor ARE read from a registry (TOLERANCE_MECHANISMS' one measured row, divided into TRACKING_ERROR_TOLERANCE), reproducing STATE.md's own recorded ~89%/3.52% figures without hardcoding them."
  - "The gate-diagnostic memo is gated on methodologyOverlayOpen(), not just on the bundle being loaded, and wrapped in try/catch. Gating on bundle load alone crashed the app: an existing test (tracer.browser.test.ts) deliberately loads a zero-series manifest to test the failure path, and applyLoadedBundle's own series-lookup throw happens AFTER setBundle() already fired -- so the bundle signal briefly holds a real-but-empty-series object, which an eagerly-computing memo tried to run the gate's fund/index lookups against and threw inside Solid's reactive graph, taking two unrelated tests down with it."

requirements-completed: [CRED-04]

coverage:
  - id: D1
    description: "A methodology page stating the full cost model, day-count conventions, data sources and known limitations is reachable in one click from any result"
    requirement: CRED-04
    verification:
      - kind: automated_ui
        ref: "tests/app/methodology-overlay.browser.test.ts#the methodology link in the provenance strip opens the overlay without changing any run parameter"
        status: pass
      - kind: automated_ui
        ref: "tests/app/methodology-overlay.browser.test.ts#the overlay renders the four section headings in the fixed Copywriting Contract order"
        status: pass
    human_judgment: false
  - id: D2
    description: "Opening the methodology page leaves the run behind it untouched, and a permalink carrying the flag opens the page over an intact or an evicted run without masking validation"
    requirement: CRED-04
    verification:
      - kind: unit
        ref: "tests/app/permalink-methodology.test.ts (5 cases: valid+flag, valid+flag matches unflagged decode, invalid+flag still evicts, no-flag stays closed, open-then-close byte-identical)"
        status: pass
      - kind: automated_ui
        ref: "tests/app/methodology-overlay.browser.test.ts#the overlay opens directly from a permalink carrying the flag"
        status: pass
    human_judgment: false
  - id: D3
    description: "Closing the page removes only the methodology key from the URL, and the methodology key is never added to the permalink allow-list"
    requirement: CRED-04
    verification:
      - kind: automated_ui
        ref: "tests/app/methodology-overlay.browser.test.ts#the close button and the Escape key both close the overlay and restore the original query string"
        status: pass
      - kind: other
        ref: "git diff --stat src/app/permalink.ts (no change)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The cost model, day-count conventions and data sources sections are generated from the code's own registries and manifest, each cost parameter with its confidence and citation"
    requirement: CRED-04
    verification:
      - kind: automated_ui
        ref: "tests/app/methodology-overlay.browser.test.ts#the cost-model section renders a row for every COST_PARAMETERS entry, each showing its confidence level"
        status: pass
      - kind: automated_ui
        ref: "tests/app/methodology-overlay.browser.test.ts#the day-count section renders both day-count bases"
        status: pass
    human_judgment: false
  - id: D5
    description: "All four known limitations are stated at full strength, each with a number traceable to a registry or generated constant"
    requirement: CRED-04
    verification:
      - kind: automated_ui
        ref: "tests/app/methodology-overlay.browser.test.ts#the limitations section renders exactly four limitation paragraphs, each with a number traceable to a registry constant"
        status: pass
    human_judgment: false

metrics:
  duration: ~55min
  completed: 2026-08-21
status: complete
---

# Phase 05 Plan 07: The Methodology Overlay Summary

**A full-screen methodology page (`MethodologyOverlay.tsx`) reachable in one click from the provenance strip, rendering the cost model, day-count conventions, data sources and four known limitations entirely from `COST_PARAMETERS`, `TOLERANCE_MECHANISMS`, the kernel's day-count constants and the loaded manifest, opened via a URL flag that is read and stripped before the strict permalink decoder ever sees it.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 3 (Tasks 2 and 3 committed together, see Deviations)
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments

- `state.ts` reads the `methodology` URL flag off a copy of `URLSearchParams`, deletes it before `decodeParams` runs, and opens the overlay independent of whether the remaining decode succeeds, fails, or is empty -- the flag never masks a D-11/D-12 eviction and `permalink.ts`'s allow-list is untouched (`git diff --stat` shows no change).
- `openMethodologyOverlay`/`closeMethodologyOverlay` write only the `methodology` key via the same entry-replacing `history.replaceState` discipline `writePermalinkUrl` already uses, flushing any pending trailing-edge run-parameter write first; `writePermalinkUrl` itself re-adds the flag when the overlay is open, so the two write paths cannot silently strip each other's key.
- `MethodologyOverlay.tsx` renders the four Copywriting Contract sections in order: cost model (every `COST_PARAMETERS` entry with its value/confidence/citation, the Shapley/non-compounding attribution method in prose, and the full `TOLERANCE_MECHANISMS` breakdown), day-count conventions (both kernel day-count bases and the long-gap threshold, no literal `360`/`365` in the source), data sources (every manifest series' sources and seams, never license/termsUrl text), and known limitations (all four D-19 statements at full strength).
- The two gate-diagnosis figures the codebase has never pinned as a constant (TQQQ's margin against the tracking-error tolerance, and the post-2022 high-rate return-drift for UPRO and TQQQ) are computed live from the already-loaded bundle using the CI gate's own canonical construction, gated on the overlay actually being open.
- `ProvenanceStrip`'s "View methodology" link now opens the overlay on click while staying copyable/middle-clickable; `App.tsx` mounts `<MethodologyOverlay />` as the last child of the top-level layout, over everything else.

## Task Commits

1. **Task 1: Read and strip the methodology flag before the permalink decoder sees it** - `67bec9f` (feat)
2. **Tasks 2+3: The overlay, generated from registries, with all four known limitations** - `1ed0958` (feat)

_Note: no separate plan-metadata commit in this worktree -- the orchestrator makes the final metadata commit centrally after merge (isolation="worktree")._

## Files Created/Modified

- `src/app/state.ts` - `methodologyOverlayOpen()`/`openMethodologyOverlay()`/`closeMethodologyOverlay()`; `applyPermalinkFromLocation` strips the flag before decode; `writePermalinkUrl` preserves the flag while the overlay is open; `resetAppState` resets it
- `src/app/components/MethodologyOverlay.tsx` - the full-screen overlay, generated from registries, plus the live (but overlay-open-gated, try/catch-wrapped) gate-diagnosis computation for D-19c/D-19d
- `src/app/components/ResultColumn/ProvenanceStrip.tsx` - the methodology link now calls `openMethodologyOverlay()` on click
- `src/app/App.tsx` - mounts `<MethodologyOverlay />` as the last child of the top-level layout
- `src/app/styles.css` - `.methodology-overlay` and its section/row/limitation classes
- `tests/app/permalink-methodology.test.ts` - 5 Node-project cases covering the flag-strip-before-decode logic and the open/close URL round trip, using a minimal in-memory `window`/`history` stand-in (no jsdom)
- `tests/app/methodology-overlay.browser.test.ts` - 9 mounted-app cases covering both Task 2 and Task 3's verify criteria

## Decisions Made

- **Tasks 2 and 3 committed together** (see `key-decisions` above) -- both target one component and one verify file; artificially splitting them would have required stubbing-then-filling the limitations section for no benefit.
- **The two un-pinned gate-diagnosis figures are computed live, not hand-authored literals or a new generated module.** Reusing the existing pure functions (`resolveOverlapWindow`, `buildKernelInputs`, `runBacktest`, `buildRateRegimeWindows`, `computeTrackingError`) at the gate's own canonical cost parameters keeps the figures correct if the underlying data or model ever changes, at the cost of a small live computation gated behind the overlay actually opening.
- **The gate-diagnostic memo is gated on `methodologyOverlayOpen()`, not just on the bundle loading**, and wrapped in `try`/`catch` -- see Deviations below, this was a real bug the test suite caught.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The eager gate-diagnostic memo crashed the app against an existing error-path test**
- **Found during:** `npm run test:app` (full suite run after Task 2/3 implementation)
- **Issue:** `MethodologyOverlay`'s `gateSnapshots` memo initially recomputed whenever `loadedBundle()` changed, with no guard on whether the overlay was open. `tests/app/tracer.browser.test.ts`'s existing "a manifest that decodes to zero series renders the named failure line" test calls `setBundle(loadedBundleResult)` with a real-but-empty-series bundle object BEFORE `applyLoadedBundle`'s own series-lookup throws (the throw happens after the signal write, inside the same function). The memo's `resolveOverlapWindow(bundle, 'SPX/total-return', ...)` call threw synchronously inside Solid's reactive graph -- an uncaught throw there is not contained to this component, and it broke two subsequent, otherwise-unrelated tests in the same file.
- **Fix:** Gated the memo on `methodologyOverlayOpen()` (so it never runs at all while the overlay is closed, which is the common case and also matches the must-have's "already resident in memory by the time it can be opened" more literally) and wrapped the computation in `try`/`catch`, degrading gracefully to "not yet available" text instead of throwing.
- **Files modified:** `src/app/components/MethodologyOverlay.tsx`
- **Verification:** `npx vitest run --project app tests/app/tracer.browser.test.ts tests/app/methodology-overlay.browser.test.ts` (14/14 passing); full `npm run test:app` (90/90 passing)
- **Committed in:** `1ed0958` (part of the Tasks 2+3 commit)

**2. [Rule 1 - Bug] Byte-identical round-trip assertion needed the pending permalink flush accounted for**
- **Found during:** `npx vitest run --project app tests/app/methodology-overlay.browser.test.ts` (first run)
- **Issue:** The "close button and Escape key restore the original query string" test captured its `before` baseline immediately after the default landing run completed, but that run's own trailing-edge permalink write was still pending (debounced). `openMethodologyOverlay()`'s own flush-then-write (T-05-20) settled that pending write as a side effect of opening, so the URL after closing legitimately differed from the too-early `before` snapshot for a reason unrelated to the methodology flag itself.
- **Fix:** Called `flushPermalinkUrl()` before capturing `before`, matching the pattern `permalink.browser.test.ts`'s own tests already use.
- **Files modified:** `tests/app/methodology-overlay.browser.test.ts`
- **Verification:** `npx vitest run --project app tests/app/methodology-overlay.browser.test.ts` (9/9 passing)
- **Committed in:** `1ed0958` (part of the Tasks 2+3 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs, one found by the existing suite catching a real crash, one a test-harness timing fix)
**Impact on plan:** Both fixes were necessary for correctness against the existing test suite. No scope creep.

## Issues Encountered

The plan's Task 1 `<verify>` command (`npx vitest run --project unit tests/app/permalink-methodology.test.ts`) runs `state.ts` in the Node `unit` project, which has no DOM. `state.ts` only touches `window`/`document`/`fetch`/`requestAnimationFrame` inside function bodies (never at module load), so the test file stubs a minimal in-memory `window.location`/`window.history` object (real enough that `history.replaceState` round-trips back through `location.search`) plus no-op `document`/`fetch`/`requestAnimationFrame` stubs, rather than pulling in jsdom for a project that otherwise has none. This is a new pattern in the test suite (every prior `state.ts` consumer is a `.browser.test.ts` running in the real-browser `app` project); documented inline in the test file's own header comment.

## User Setup Required

None - no external service configuration required.

## Threat Flags

None beyond the threat model's own named mitigations, which this plan implements directly: T-05-17 (the flag is read by literal name via `.has`/`.delete`, no dynamic property access, `permalink.ts` unmodified); T-05-18 (the decode result still governs whether a run renders, independent of the overlay); T-05-19 (every number on the page traces to a registry, generated constant, or a live computation over the already-loaded bundle -- covered by the grep and substring-comparison acceptance criteria); T-05-20 (the flush-then-write race guard, covered by the deviation #2 test fix above). No new network endpoint, auth path, or schema change was introduced; the live gate-diagnostic computation reads only the already-loaded, build-time-authored bundle.

## Next Phase Readiness

- CRED-04 is complete: the methodology overlay is reachable from any result, generated from the code's own registries, and does not disturb the permalink contract.
- This closes the last plan of Phase 5 (05-attribution-and-the-credibility-surface) per the wave sequence; no blockers for the phase-level wrap-up.

## Self-Check: PASSED

- FOUND: src/app/components/MethodologyOverlay.tsx
- FOUND: tests/app/permalink-methodology.test.ts
- FOUND: tests/app/methodology-overlay.browser.test.ts
- FOUND: 67bec9f (Task 1 commit)
- FOUND: 1ed0958 (Tasks 2+3 commit)

---
*Phase: 05-attribution-and-the-credibility-surface*
*Completed: 2026-08-21*
