---
phase: 05-attribution-and-the-credibility-surface
plan: 08
subsystem: ui
tags: [solid-js, parameter-column, defaults-registry, credibility]

requires:
  - phase: 05-attribution-and-the-credibility-surface
    provides: "05-05's TierControl and activeTier()/setActiveTier() signal; 04-05's CostControls
      isDefault/citation-swap pattern this plan generalizes to all ten defaulted parameters"
provides:
  - "src/app/parameter-defaults.ts: PARAMETER_DEFAULTS, one registry naming every shipped default
    and how to return to it, for all ten D-22 parameters"
  - "DefaultBadge.tsx/ResetButton.tsx: the two shared components every defaulted control renders"
  - "InitialInvestmentControl.tsx: the initial investment is now editable in the parameter column,
    not only through a pasted permalink"
  - "Every parameter control with a shipped default (leverage, entry date, holding mode, initial
    investment, contribution amount, contribution frequency, tier, dividend mode, expense ratio,
    financing spread) now shows a default badge or a reset control, driven by the one registry"
affects: []

actuals:
  tokens: 17590
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "One defaults registry (ParameterId -> { isDefault, reset }) as the single source of every
      shipped default and every at-default predicate; controls read the registry rather than
      declaring their own default constant or isDefault predicate"
    - "createEffect(on(committedValue, clearLocalError, { defer: true })) in every control with a
      local error/draft signal, so an external store write (Reset chief among them) that bypasses
      the control's own input handler still clears a lingering invalid-input state -- required by
      UI-SPEC F8's 'Reset stays enabled and clears it' must-have, not obvious from the plan text
      alone"
    - "entryDate's shipped default is resolved at call time (resolveEntryDateDefaultBounds /
      entryDateIsDefault, exported as plain functions taking the manifest explicitly) against the
      STRICT tier always, mirroring applyLoadedBundle's A4 landing-run anchor -- the one registry
      entry that is not a literal comparison against DEFAULT_REQUEST"

key-files:
  created:
    - src/app/parameter-defaults.ts
    - src/app/components/ParameterColumn/DefaultBadge.tsx
    - src/app/components/ParameterColumn/ResetButton.tsx
    - src/app/components/ParameterColumn/InitialInvestmentControl.tsx
    - tests/app/parameter-defaults.test.ts
    - tests/app/parameter-defaults.browser.test.ts
  modified:
    - src/app/state.ts
    - src/app/styles.css
    - src/app/components/ParameterColumn/SymbolControl.tsx
    - src/app/components/ParameterColumn/TierControl.tsx
    - src/app/components/ParameterColumn/EntryDateControl.tsx
    - src/app/components/ParameterColumn/HoldingModeControl.tsx
    - src/app/components/ParameterColumn/ContributionControl.tsx
    - src/app/components/ParameterColumn/LeverageControl.tsx
    - src/app/components/ParameterColumn/CostControls.tsx
    - src/app/components/ParameterColumn/ParameterColumn.tsx
    - tests/app/narrow-viewport.browser.test.ts

key-decisions:
  - "contributionAmount's registry reset writes both contributionAmount and contributionFrequency
    back to their shipped defaults together, mirroring ContributionControl's own existing
    empty-input path (clearing the amount already resets frequency to 'none') -- one write path,
    not a new one"
  - "contributionFrequency's own reset is a single-field write (frequency only, back to 'none'),
    left independently resettable even while amount stays nonzero. contribution-schedule.ts's
    'none' frequency produces an empty schedule regardless of amount, so this combination is inert
    rather than invalid -- Reset can never itself produce an unreachable state"
  - "HoldingModeControl's pre-existing DEFAULT_FIXED_BAR_COUNT constant (the fallback bar count
    used only the first time a user switches into fixed mode -- unrelated to D-22's shipped
    default) renamed to FALLBACK_FIXED_BAR_COUNT so it stops matching the Task 2 acceptance grep
    for 'no control declares its own default constant'"
  - "Rule 1 bug found by the plan's own narrow-viewport backstop (item 8, added this plan):
    .reset-button's negative margin-left (added to visually align the button's text flush left
    against its 44px touch-target padding) pushed the dividend-mode reset button outside its
    containing .parameter-group at 320px. Fixed by dropping the negative margin and left-aligning
    the button's content via justify-content instead"
  - "Rule 2 (missing critical functionality, UI-SPEC F8's own must-have): ResetButton writes a
    parameter's committed value directly through the registry, bypassing each control's own input
    handler entirely -- which meant a control's local error/draft signal (LeverageControl's
    rangeError, CostControls' two error signals, ContributionControl's amountError,
    InitialInvestmentControl's error) never cleared on an external Reset. Added a
    createEffect(on(committedValue, ..., { defer: true })) to each of the four files so the
    committed value's OWN change -- regardless of origin -- clears the matching local error"

requirements-completed: [CRED-05]

coverage:
  - id: D1
    description: "A cold arrival with no URL parameters renders the default badge on all ten
      defaulted parameters and no reset control anywhere in the column"
    requirement: CRED-05
    verification:
      - kind: automated_ui
        ref: "tests/app/parameter-defaults.browser.test.ts#a cold arrival with no query string
          renders the default badge on all ten defaulted parameters and no reset control"
        status: pass
      - kind: automated_ui
        ref: "tests/app/narrow-viewport.browser.test.ts#8. the default badge and reset affordance
          neither collide with nor wrap unpredictably against their control, at 320px, across all
          ten defaulted parameters"
        status: pass
    human_judgment: false
  - id: D2
    description: "Editing any one of the ten parameters swaps that parameter's badge for a reset
      control and leaves the other nine badges in place; clicking reset restores the badge and the
      value"
    requirement: CRED-05
    verification:
      - kind: automated_ui
        ref: "tests/app/parameter-defaults.browser.test.ts#editing one parameter swaps that badge
          for a reset control and leaves the other nine badges in place"
        status: pass
      - kind: automated_ui
        ref: "tests/app/parameter-defaults.browser.test.ts#clicking reset restores the badge and
          the leverage value"
        status: pass
    human_judgment: false
  - id: D3
    description: "The initial investment is editable in the parameter column, not only through a
      pasted permalink, and the edited value reaches the computed result; a negative value is
      rejected at the control and never reaches the result"
    requirement: CRED-05
    verification:
      - kind: automated_ui
        ref: "tests/app/parameter-defaults.browser.test.ts#the initial-investment control edits the
          value that reaches the result"
        status: pass
      - kind: automated_ui
        ref: "tests/app/parameter-defaults.browser.test.ts#a negative initial investment is
          rejected at the control with an inline message and does not reach the result"
        status: pass
      - kind: automated_ui
        ref: "tests/app/parameter-defaults.browser.test.ts#ParameterColumn renders
          InitialInvestmentControl before ContributionControl"
        status: pass
    human_judgment: false
  - id: D4
    description: "The entry date's default is the manifest-resolved strict-tier earliest date for
      the active series and dividend mode (never a written-in literal, and never the currently
      selected tier), and resetting it restores that resolved date"
    requirement: CRED-05
    verification:
      - kind: unit
        ref: "tests/app/parameter-defaults.test.ts (7 entryDate-specific cases: resolved default,
          false-not-throw for no manifest / no strict tier / missing series, strict-tier-always
          resolution)"
        status: pass
      - kind: automated_ui
        ref: "tests/app/parameter-defaults.browser.test.ts#resetting the entry date restores the
          manifest-resolved strict-tier earliest date"
        status: pass
    human_judgment: false
  - id: D5
    description: "Reset cannot fail: it writes the shipped default through the control's existing
      validated setter, and when a control is in an invalid state (a rejected keystroke) reset
      stays enabled and clears that state"
    requirement: CRED-05
    verification:
      - kind: unit
        ref: "tests/app/parameter-defaults.test.ts#reset from an arbitrary off-default numeric
          value never throws and always lands on the shipped default"
        status: pass
      - kind: automated_ui
        ref: "tests/app/parameter-defaults.browser.test.ts#typing an invalid leverage value leaves
          the reset control enabled and clicking it clears the invalid state"
        status: pass
    human_judgment: false
  - id: D6
    description: "One defaults registry supplies every shipped default and at-default predicate;
      no control or registry entry declares its own default-value constant"
    requirement: CRED-05
    verification:
      - kind: other
        ref: "grep -rnE '^const DEFAULT_' src/app/components/ParameterColumn/*.tsx (0 matches);
          grep -c DEFAULT_REQUEST src/app/parameter-defaults.ts (19); Object.keys(PARAMETER_DEFAULTS
          ).length === 10 (tests/app/parameter-defaults.test.ts)"
        status: pass
    human_judgment: false
  - id: D7
    description: "The default badge and reset control use the same two fixed strings on every
      control, disabled with the rest of the parameter column until the manifest decodes"
    requirement: CRED-05
    verification:
      - kind: automated_ui
        ref: "tests/app/parameter-defaults.browser.test.ts (badge()/resetButton() helpers query by
          data-testid across all ten ParameterId values in every test in the file, asserting
          identical fixed-string rendering by construction -- DefaultBadge/ResetButton each render
          exactly one hardcoded string node)"
        status: pass
    human_judgment: false
status: complete
---

# Phase 05 Plan 08: The Default-Value Badge and Reset, Generalized to All Ten Parameters Summary

**One `PARAMETER_DEFAULTS` registry, two shared components (`DefaultBadge`/`ResetButton`), and a
new `InitialInvestmentControl` -- extending Phase 4's default-badge/reset treatment from two cost
fields to all ten of D-22's defaulted parameters, so no result can be dismissed as depending on an
assumption the user was never shown.**

## Performance

- **Duration:** ~70 min
- **Tasks:** 3 completed
- **Files modified:** 17 (6 created, 11 modified)

## Accomplishments

- `src/app/parameter-defaults.ts`: `PARAMETER_DEFAULTS`, a `Record<ParameterId, { isDefault, reset
  }>` covering leverage, entry date, holding mode, initial investment, contribution amount,
  contribution frequency, tier, dividend mode, expense ratio and financing spread -- nine entries
  compare directly against the now-exported `DEFAULT_REQUEST`; the tenth (entry date) resolves its
  default live against the manifest's STRICT tier, matching `applyLoadedBundle`'s own
  default-landing-run anchor regardless of which tier is currently selected for bounds purposes
- `DefaultBadge.tsx`/`ResetButton.tsx`: the two shared components every defaulted control now
  renders, `ResetButton` invoking the registry's own validated write on click so Reset can never
  itself produce an invalid value
- All ten defaulted parameters carry the treatment: `SymbolControl` (dividend mode), `TierControl`,
  `EntryDateControl`, `HoldingModeControl`, `ContributionControl` (amount and frequency),
  `LeverageControl`, and both `CostControls` fields (expense ratio, financing spread) -- the last
  three previously had a local `isDefault`/citation-swap pattern (`CostControls`) or no treatment
  at all (`LeverageControl`, the entry date, holding mode, tier, dividend mode)
- `InitialInvestmentControl.tsx`: new control mounted before `ContributionControl`, the initial
  investment is now editable in place rather than reachable only through a pasted permalink
- Found and fixed a real bug via the plan's own narrow-viewport backstop test (item 8): the reset
  button's negative `margin-left` pushed the dividend-mode reset control outside its containing
  `.parameter-group` at 320px
- Found and fixed a real gap in the must-have "Reset ... clears an invalid state": `ResetButton`
  writes directly through the registry, bypassing each control's own input handler and therefore
  never clearing that control's local error/draft signal on its own -- added a
  `createEffect(on(committedValue, ..., { defer: true }))` to every control with local error state
  (Leverage, CostControls x2, ContributionControl amount, InitialInvestment) so any change to the
  committed value, external or not, clears the matching error

## Task Commits

Each task was committed atomically:

1. **Task 1: One defaults registry plus the shared badge and reset components** - `220616e` (feat)
2. **Task 2: Apply the treatment to the five data-selection controls** - `81e3d05` (feat)
3. **Task 3: An initial-investment control, the numeric controls, and the browser proof** -
   `029b195` (feat)

_Note: no separate plan-metadata commit in this worktree -- the orchestrator makes the final
metadata commit centrally after merge (isolation="worktree")._

## Files Created/Modified

- `src/app/parameter-defaults.ts` - new: `ParameterId`, `PARAMETER_DEFAULTS`,
  `resolveEntryDateDefaultBounds`, `entryDateIsDefault`
- `src/app/components/ParameterColumn/DefaultBadge.tsx` - new: the shared "default" badge
- `src/app/components/ParameterColumn/ResetButton.tsx` - new: the shared "Reset" button
- `src/app/components/ParameterColumn/InitialInvestmentControl.tsx` - new: the initial-investment
  control
- `src/app/state.ts` - `DEFAULT_REQUEST` exported (no other change)
- `src/app/styles.css` - `.default-badge`, `.reset-button`, `.initial-investment-control`,
  `.initial-investment-input`, `.initial-investment-error`
- `src/app/components/ParameterColumn/SymbolControl.tsx` - dividend-mode badge/reset
- `src/app/components/ParameterColumn/TierControl.tsx` - tier badge/reset
- `src/app/components/ParameterColumn/EntryDateControl.tsx` - entry-date badge/reset alongside the
  existing citation
- `src/app/components/ParameterColumn/HoldingModeControl.tsx` - holding-mode badge/reset;
  `DEFAULT_FIXED_BAR_COUNT` renamed `FALLBACK_FIXED_BAR_COUNT`
- `src/app/components/ParameterColumn/ContributionControl.tsx` - frequency's local
  `frequencyIsDefault` signal removed in favor of the registry; amount badge/reset added; a
  `createEffect` clears `amountError` on any committed-value change
- `src/app/components/ParameterColumn/LeverageControl.tsx` - badge/reset; a `createEffect` clears
  `rangeError`/`draftText` on any committed-value change
- `src/app/components/ParameterColumn/CostControls.tsx` - local `isDefault` predicates and
  default-value constants removed in favor of the registry; two `createEffect`s clear each field's
  error signal on its own committed-value change
- `src/app/components/ParameterColumn/ParameterColumn.tsx` - mounts `InitialInvestmentControl`
  immediately before `ContributionControl`
- `tests/app/parameter-defaults.test.ts` - new: 19 unit cases (Node `unit` project), including a
  synthetic-manifest fixture for the entry-date behaviors
- `tests/app/parameter-defaults.browser.test.ts` - new: 8 mounted-app cases
- `tests/app/narrow-viewport.browser.test.ts` - new backstop item 8 (badge/reset density at 320px)

## Decisions Made

See `key-decisions` in the frontmatter above for the full rationale on each; briefly:

- `contributionAmount`'s reset writes both `contributionAmount` and `contributionFrequency`
  together (mirroring the control's own existing empty-input path); `contributionFrequency`'s own
  reset is a single-field write, left independently resettable since a `'none'` frequency is inert
  (not invalid) alongside a nonzero amount.
- `HoldingModeControl`'s pre-existing `DEFAULT_FIXED_BAR_COUNT` (an unrelated internal fallback,
  not a D-22 shipped default) renamed to `FALLBACK_FIXED_BAR_COUNT` to stop matching the plan's own
  "no control declares its own default constant" acceptance grep.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `.reset-button`'s negative margin pushed a control outside its container at
320px**
- **Found during:** Task 3, writing the new narrow-viewport backstop item 8
- **Issue:** `.reset-button`'s `margin-left: calc(-1 * var(--space-sm))` (added to visually
  compensate for the button's own left padding) pushed the dividend-mode reset button's left edge
  outside its containing `.parameter-group`'s bounding rect at a 320px viewport.
- **Fix:** Removed the negative margin; changed `justify-content` to `flex-start` and the button's
  own left/right padding to `0` so its content aligns flush left without a negative-margin trick.
- **Files modified:** `src/app/styles.css`
- **Verification:** `npx vitest run --project app tests/app/narrow-viewport.browser.test.ts` (7/7
  passing, including the new item 8)
- **Committed in:** `029b195` (Task 3 commit)

**2. [Rule 2 - Missing critical functionality] Reset did not clear a control's own local error
state**
- **Found during:** Task 3, writing `parameter-defaults.browser.test.ts`'s invalid-state test
- **Issue:** `ResetButton` invokes `PARAMETER_DEFAULTS[id].reset()` directly -- a raw store write
  through `updateBacktestRequest`/`setActiveTier` -- bypassing each control's own input handler
  entirely. Four controls (`LeverageControl`, `CostControls` x2, `ContributionControl`'s amount,
  `InitialInvestmentControl`) keep a local `createSignal` for their own inline error/draft text,
  set only inside their own handler functions; an external Reset therefore fixed the underlying
  store value but left a stale error message on screen, violating UI-SPEC F8's own must-have
  ("Reset stays enabled and clears it").
- **Fix:** Added `createEffect(on(committedValue, () => clearLocalError, { defer: true }))` to each
  of the four files, so any change to the control's own committed store value -- its own commit
  included -- clears the matching local error/draft signal.
- **Files modified:** `src/app/components/ParameterColumn/LeverageControl.tsx`,
  `CostControls.tsx`, `ContributionControl.tsx`, `InitialInvestmentControl.tsx`
- **Verification:** `npx vitest run --project app tests/app/parameter-defaults.browser.test.ts`
  (8/8 passing, including the reset-clears-invalid-state case)
- **Committed in:** `029b195` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical functionality)
**Impact on plan:** Both fixes were required for the plan's own must-haves to actually hold (the
backstop test and the F8 error-row requirement respectively). No scope creep.

## Issues Encountered

`tests/app/narrow-viewport.browser.test.ts`'s `BacktestRequest` store is a module-level singleton
shared across every test in that file; the new item 8 test initially inherited off-default
`entryDate`/`holdingPeriodBars` values left by an earlier scenario in the same file, undercounting
the cold-arrival badge count (8 instead of 10). Fixed by explicitly restoring `DEFAULT_REQUEST`
(plus `PARAMETER_DEFAULTS.entryDate.reset()` for the entry date, since `DEFAULT_REQUEST.entryDate`
is the store's own `''` un-set sentinel, not the manifest-resolved default) at the start of the new
test, rather than assuming a clean baseline.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

CRED-05 is complete: every one of the ten defaulted parameters is shown as a default and is
editable, so no result can be dismissed as depending on an assumption the user was never shown.
`npm test`, `npm run test:app` and `npx tsc --noEmit` are all green.

---
*Phase: 05-attribution-and-the-credibility-surface*
*Completed: 2026-08-21*
