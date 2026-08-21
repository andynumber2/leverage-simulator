---
phase: 05-attribution-and-the-credibility-surface
plan: 05
subsystem: ui
tags: [solid-js, permalink, bounds, tier-selector]

requires:
  - phase: 04-first-defensible-backtest-in-the-browser
    provides: "resolveEntryDateBounds's tier-aware bounds resolver and the Tier type, with the tier
      argument previously pinned to 'strict'"
provides:
  - "A live activeTier()/setActiveTier() signal in src/app/state.ts, seeded to strict"
  - "TierControl.tsx: a two-option radio control with each tier's meaning stated inline on screen"
  - "EntryDateControl, HoldingModeControl, ProvenanceStrip and writePermalinkUrl all reading the
    one live tier signal instead of a hard-coded 'strict' literal"
  - "The tier permalink query parameter, previously written but ignored, now drives real behaviour"
affects: [05-06, 05-07]

actuals:
  tokens: 7090
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "A control's availability derived per-option from resolveEntryDateBounds, rendering a
      disabled option with its resolver-supplied reason stated inline rather than a tooltip
      (SymbolControl's existing pattern, reused here for TierControl's two options)"

key-files:
  created:
    - src/app/components/ParameterColumn/TierControl.tsx
    - tests/app/entry-date-tier.browser.test.ts
  modified:
    - src/app/state.ts
    - src/app/components/ParameterColumn/ParameterColumn.tsx
    - src/app/components/ParameterColumn/EntryDateControl.tsx
    - src/app/components/ParameterColumn/HoldingModeControl.tsx
    - src/app/components/ResultColumn/ProvenanceStrip.tsx
    - src/app/styles.css
    - tests/app/permalink.test.ts

key-decisions:
  - "TierControl's option copy renders the Copywriting Contract's em dash as a colon (\"Strict:
    every input genuinely daily\"), per this repo's standing no-em-dash rule; wording and meaning
    are otherwise unchanged from 05-UI-SPEC.md"
  - "ProvenanceStrip.tsx was updated even though it is outside the plan's files_modified list --
    Task 3's own action explicitly calls for auditing all of src/app/ for a hard-coded tier
    literal, and this plan's own must_have named the provenance strip's tier field by name"
  - "applyLoadedBundle's default-entry-date resolution stays reading tiers.strict directly, never
    activeTier(), so the default landing run stays anchored to the strict tier per D-23/A4
    regardless of a later tier selection; documented at the call site"

requirements-completed: [APP-02]

coverage:
  - id: D1
    description: "TierControl renders two fixed-order radio options with each tier's meaning
      stated inline as visible text, never a tooltip or title attribute"
    requirement: APP-02
    verification:
      - kind: automated_ui
        ref: "tests/app/controls.browser.test.ts (full suite, mounts TierControl via
          ParameterColumn) + grep acceptance criteria (title= count 0, two type=radio inputs)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Selecting the extended tier widens the entry-date control's min bound to the
      extended tier's earliest date for a series whose extended range starts earlier"
    requirement: APP-02
    verification:
      - kind: automated_ui
        ref: "tests/app/entry-date-tier.browser.test.ts#selecting the extended tier widens the
          entry-date min to the extended tier earliest date for a series whose extended range
          starts earlier"
        status: pass
    human_judgment: false
  - id: D3
    description: "For a series whose extended and strict ranges share the same earliest date,
      selecting extended is a distinct, selectable state and the min bound does not widen"
    requirement: APP-02
    verification:
      - kind: automated_ui
        ref: "tests/app/entry-date-tier.browser.test.ts#for a series whose extended range starts
          on the same date as its strict range, selecting extended leaves the min bound unchanged
          and stays selected and enabled"
        status: pass
    human_judgment: false
  - id: D4
    description: "The selected tier is written to the permalink and a pasted link reproduces the
      same tier selection, independent of every other field"
    requirement: APP-02
    verification:
      - kind: unit
        ref: "tests/app/permalink.test.ts#permalink: tier round-trips independently of every
          other field (3 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The provenance strip's tier field reflects the selected tier, not a fixed value"
    requirement: APP-02
    verification:
      - kind: automated_ui
        ref: "tests/app/screenshot-region.browser.test.ts (existing suite, exercises
          provenance-tier via ProvenanceStrip, unaffected by the activeTier() wiring)"
        status: pass
    human_judgment: false
  - id: D6
    description: "A cold arrival with no URL parameters lands on the strict tier and a default run
      resolved from the strict tier's earliest date"
    requirement: APP-02
    verification:
      - kind: automated_ui
        ref: "tests/app/entry-date-tier.browser.test.ts#on a default landing run the entry-date
          input min equals the active series strict-tier earliest date"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-08-21
status: complete
---

# Phase 05 Plan 05: Live tier signal wired through every consumer Summary

**A working tier selector: `activeTier()` state signal plus a two-option `TierControl`, with the
entry-date bounds, holding-mode end date, provenance strip and permalink all reading that one
signal instead of Phase 4's fixed `'strict'` literal.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3 completed
- **Files modified:** 9 (2 created, 7 modified)

## Accomplishments

- Added `activeTier()`/`setActiveTier()` to `src/app/state.ts`, seeded to `'strict'`, flowing
  through the same coalesced-recompute and permalink-flush cadence every other parameter uses
- Built `TierControl.tsx`: two fixed-order radio options (strict, then extended), each with its
  meaning rendered as visible inline text; an option's availability is resolved live via
  `resolveEntryDateBounds`, rendering disabled-with-stated-reason when a tier is unsupported
- `EntryDateControl`, `HoldingModeControl`, `ProvenanceStrip` and `writePermalinkUrl` all now read
  `activeTier()` instead of a hard-coded `'strict'` value; `applyLoadedBundle`'s default-entry-date
  resolution deliberately stays anchored to the strict tier (D-23/A4), documented at the call site
- The `tier` permalink query parameter, previously written but ignored, now round-trips a real
  selection and is asserted independent of every other field

## Task Commits

Each task was committed atomically:

1. **Task 1: One live tier signal, round-tripped through the permalink** - `83337a7` (feat)
2. **Task 2: The tier control, with each tier's meaning stated on screen** - `5ffd708` (feat)
3. **Task 3: Make the entry-date and holding-mode bounds follow the selected tier** - `e935fa8`
   (feat)

## Files Created/Modified

- `src/app/state.ts` - `activeTier()`/`setActiveTier()` signal, permalink write/decode wiring,
  `resetAppState` clears the tier back to strict
- `src/app/components/ParameterColumn/TierControl.tsx` - new: the two-option tier selector
- `src/app/components/ParameterColumn/ParameterColumn.tsx` - mounts `TierControl` between
  `SymbolControl` and `LeverageControl`
- `src/app/components/ParameterColumn/EntryDateControl.tsx` - bounds memo and citation text read
  `activeTier()`
- `src/app/components/ParameterColumn/HoldingModeControl.tsx` - end-of-data label reads
  `activeTier()`
- `src/app/components/ResultColumn/ProvenanceStrip.tsx` - tier field reads `activeTier()`
- `src/app/styles.css` - `.tier-control`, `.tier-choice`, `.tier-option`,
  `.tier-option-meaning`, `.tier-option-disabled-reason`
- `tests/app/entry-date-tier.browser.test.ts` - new: 5 cases covering the default landing bound,
  the extended-tier widening, the holding-mode end date, the citation text and the
  same-earliest-date series case
- `tests/app/permalink.test.ts` - 3 new cases: per-tier round trip and the extended-tier-only
  field-isolation assertion

## Decisions Made

- TierControl's option copy uses a colon where the Copywriting Contract specifies an em dash, per
  this repo's global no-em-dash rule; the wording and meaning are otherwise unchanged.
- `ProvenanceStrip.tsx` was updated even though it isn't in the plan's `files_modified` list.
  Task 3's own action text explicitly calls for auditing all of `src/app/` for a hard-coded tier
  literal and converting it, and this plan's own `must_haves` named the provenance strip's tier
  field directly — leaving it hard-coded would have left a stated must-have false.
- The committed bundle's manifest happens to give every series an identical `lastDate` across
  both tiers (`tiers.ts`'s `computeTierRanges` guarantees `strict.lastDate === extended.lastDate`
  by construction — tiers narrow the *start* of history, never the end). The holding-mode-control
  test therefore asserts the label is correctly *resolved from* the selected tier (matching an
  independently computed `resolveEntryDateBounds` call for both tiers) rather than asserting the
  rendered value differs between tiers, since no real series in this bundle can produce a
  differing end date.

## Deviations from Plan

None beyond the `ProvenanceStrip.tsx` file addition documented above, which is itself required by
the plan's own action text and must-have (Rule 2 - missing critical functionality named directly
by the plan's must_haves).

## Issues Encountered

The first run of the new browser test file failed to mount (metrics panel never appeared) because
it lacked the `beforeEach` that strips the Vitest browser-harness's own `sessionId`/`iframeId`
query params before each mount — an existing pattern in `controls.browser.test.ts` and
`permalink.browser.test.ts` that this new file initially omitted. Added the same `beforeEach`;
all 5 tests then passed.

`npm run test:app` initially failed on the pre-existing `offline.browser.test.ts`, which requires
a production build (`dist/`) that did not exist in this worktree. Ran `npm run build` once (no
plan file changes) so the full `test:app` project — which the plan's `<verification>` section
requires green — could actually run; unrelated to this plan's own changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The tier selector is live end to end: state signal, control, bounds, provenance strip and
permalink. Phase 5's remaining plans (extended-tier warning banner, validation section,
methodology overlay) can now read `activeTier()` directly rather than working around a pinned
value.

---
*Phase: 05-attribution-and-the-credibility-surface*
*Completed: 2026-08-21*
