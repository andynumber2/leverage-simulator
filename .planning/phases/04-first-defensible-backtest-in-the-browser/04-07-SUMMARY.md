---
phase: 04-first-defensible-backtest-in-the-browser
plan: 07
subsystem: ui
tags: [solid-js, url-state, fast-check, permalink, share]

requires:
  - phase: 04-first-defensible-backtest-in-the-browser
    provides: "plan 04-05's ValidationExplanation three-variant stacking surface (bundle-mismatch slot reserved), state.ts's scheduleRun/storeSuccessfulRun, and BacktestRequest's full ten-field surface"
provides:
  - "src/app/permalink.ts: PermalinkParams, PERMALINK_KEYS, encodeParams, decodeParams — the one canonical wire format in both directions (D-13 through D-16)"
  - "src/app/state.ts: applyPermalinkFromLocation (boot-time decode, once per module lifetime) and syncPermalinkUrl (every completed run re-serialized via history.replaceState)"
  - "src/app/components/ParameterColumn/CopyLinkButton.tsx: the phase's one explicit user action"
  - "src/app/components/ResultColumn/BundleVersionBanner.tsx: bundleVersionMismatchVariant, filling ValidationExplanation's reserved bundle-mismatch slot"
  - "tests/app/permalink.test.ts + tests/app/permalink.browser.test.ts: round-trip property, golden runs, and fresh-browser reproduction coverage"
affects: ["Phase 5+ tier=extended permalinks (decodeParams already accepts both Tier members)", "Phase 8 SHARE-04 PNG export (the screenshot region D-20 reserved is now paired with a link that reproduces exactly what it shows)"]

actuals:
  tokens: 20900
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "PERMALINK_KEYS as the single declared-order source of truth: encodeParams iterates it through a per-key encodeField switch (no default case, so TypeScript's own exhaustiveness check fails to compile if a key is ever added without updating the encoder); decodeParams uses the same array as an allow-list for unknown/duplicate/missing-key detection. Neither direction repeats the key list."
    - "Integer-cents/basis-points fast-check arbitraries for money/leverage/percent fields (`fc.integer({min,max}).map(n => n / 100)`), not raw doubles snapped after generation — makes `decodeParams(encodeParams(p))` a genuinely stable strict-equality round trip across the whole generated space, not just by chance, because toFixed(N) and Number(string) are correctly-rounded inverses for exactly the canonical-precision decimal values this construction produces."
    - "Discriminated three-state decode result ({status:'empty'|'error'|'ok'}) instead of the two-state sketch in RESEARCH.md's code example — the plan's own <behavior> requires distinguishing 'no query string, use the default landing run' from 'a malformed query string, evict and explain', and a two-state PermalinkParams-or-error shape cannot express that distinction without conflating an empty and a malformed link."
    - "BundleVersionBanner.tsx as a pure function, not a rendered Solid component, despite the .tsx extension and 'component inventory' listing — ValidationExplanation already owns the fixed bundle-mismatch/single-field-eviction/cross-field-caveat stacking order in one place (plan 04-05); a second independently rendered banner would either duplicate that order or bypass it."

key-files:
  created:
    - src/app/permalink.ts
    - src/app/components/ParameterColumn/CopyLinkButton.tsx
    - src/app/components/ResultColumn/BundleVersionBanner.tsx
    - tests/app/permalink.test.ts
    - tests/app/permalink.browser.test.ts
  modified:
    - src/app/state.ts
    - src/app/App.tsx
    - src/app/components/ParameterColumn/ParameterColumn.tsx
    - src/app/components/ResultColumn/ValidationExplanation.tsx
    - src/app/styles.css
    - tests/app/controls.browser.test.ts
    - tests/app/metrics.browser.test.ts
    - tests/app/tracer.browser.test.ts
    - tests/app/validation.browser.test.ts

key-decisions:
  - "Task 1 checkpoint (resolved by the user before this executor resumed): fifteen permalink keys in one fixed emission order. holdMode's wire value is 'end-of-data', not 'today' — the UI framing was deliberately changed away from 'today' because a manually-refreshed bundle cannot deliver on it, and a wire contract is one-way (D-13), so it must not re-embed that misconception permanently. holdingPeriodBars is OMITTED when holdMode is 'end-of-data' (resolvedEndDate alone performs D-14's freeze; emitting both would encode the same fact twice with nothing saying which wins on a later disagreement). scale is KEPT despite being a display choice, because a recipient viewing the same leveraged curve on a different axis is not seeing the same picture (PITFALLS E6)."
  - "resolvedEndDate is populated from inputs.window.lastDate (the ACTUAL end THIS run computed to) while holdingPeriodBars/holdMode are populated from request's ORIGINAL values (what was actually asked for, not a resolved fallback) — so a fixed holding period that overran and was D-10-retried still encodes as holdMode=fixed with the original bar count, and reopening the link reproduces the identical caveat-and-compute retry rather than a silently different, already-truncated fixed run."
  - "The entry-date-clobber fix: applyLoadedBundle's setRequestStore('entryDate', ...) is now conditional on request.entryDate === '' (the store's un-set sentinel), instead of unconditional on every mount. This was the exact trap flagged in prior-wave context — the pre-existing test suite implicitly relied on the unconditional overwrite to reset state between browser tests, so fixing it required two existing test files to explicitly restore a valid configuration at the end of tests that deliberately leave the store evicted, plus a decode-error boot path (permalinkDecodeFailedAtBoot) that skips exactly one scheduleRun so an evicted permalink is not silently overwritten by a freshly computed default-landing-run result."
  - "'Run to today' secondary action (plan's own Task 3 text) is NOT built. Prior-wave context explicitly supersedes it: HoldingModeControl already always names the LIVE resolved end date in open-ended mode (recomputed against whatever bundle is currently loaded, not frozen at link-creation time), so there is nothing to refresh — the D-15 bundle-mismatch banner already covers the case where the deployed bundle has since changed."

requirements-completed: [SHARE-01, SHARE-02, SHARE-03]

coverage:
  - id: D1
    description: "Task 1's checkpoint decision (fifteen-key permalink schema, holdMode='end-of-data' not 'today', holdingPeriodBars omitted in end-of-data mode, scale kept) is recorded and implemented verbatim in src/app/permalink.ts's PERMALINK_KEYS/encodeField/decodeParams"
    requirement: SHARE-01
    verification:
      - kind: unit
        ref: "tests/app/permalink.test.ts > PERMALINK_KEYS carries exactly the fifteen keys the checkpoint decided; > emits all fifteen keys, in PERMALINK_KEYS order, in fixed hold mode; > omits holdingPeriodBars ... in end-of-data hold mode"
        status: pass
    human_judgment: false
  - id: D2
    description: "encodeParams/decodeParams round-trip over the generated PermalinkParams space (fast-check property, integer-cents/basis-points arbitraries), plus an explicit awkward-value set including the Pitfall 5 leverage-normalization case"
    requirement: SHARE-03
    verification:
      - kind: unit
        ref: "tests/app/permalink.test.ts > deep-equals the original params for every generated parameter set, in both hold modes; > an explicit constant set of awkward values round-trips cleanly"
        status: pass
    human_judgment: false
  - id: D3
    description: "decodeParams is a total function: unknown/duplicated/missing keys, an unrecognized holdMode, leverage <= 0 or non-numeric, an out-of-band date, and adversarial/prototype-polluting input all decode to a named error rather than throwing"
    requirement: SHARE-01
    verification:
      - kind: unit
        ref: "tests/app/permalink.test.ts > decodeParams: negative cases, each naming the offending key (11 tests); > never throws for a battery of adversarial input, including prototype-polluting key names"
        status: pass
    human_judgment: false
  - id: D4
    description: "Four committed golden URLs (default landing run, monthly-contribution run, high-leverage ruin, fixed-holding-period run) decode, run end to end against the real committed bundle, and match recorded IRR/CAGR/max drawdown/final value within a named tolerance"
    requirement: SHARE-03
    verification:
      - kind: unit
        ref: "tests/app/permalink.test.ts > golden runs: a committed permalink URL reproduces its recorded metrics (4 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The app boots from a decoded permalink: a permalink-supplied entry date survives the mount that follows (the fixed clobber bug), and a decoded golden URL reproduces the same rendered metric strings as driving the controls to the identical parameters"
    requirement: SHARE-01
    verification:
      - kind: e2e
        ref: "tests/app/permalink.browser.test.ts > a golden permalink URL loaded fresh reproduces the same rendered metric strings as driving the controls to the same parameters"
        status: pass
    human_judgment: false
  - id: D6
    description: "The URL is kept in sync via history.replaceState only (never pushState): a 35-event leverage-slider scrub updates the URL's leverage param without growing window.history.length"
    requirement: SHARE-01
    verification:
      - kind: e2e
        ref: "tests/app/permalink.browser.test.ts > the URL after a slider scrub carries the scrubbed leverage and window.history.length is unchanged across the scrub"
        status: pass
      - kind: other
        ref: "grep -rn 'pushState' src/app returns nothing; grep -rc 'replaceState' src/app/state.ts is 3"
        status: pass
    human_judgment: false
  - id: D7
    description: "A bundleVersion mismatch renders the D-15 banner naming both versions while the run still computes against the deployed bundle; a URL missing a required key renders the named decode explanation with no chart"
    requirement: SHARE-02
    verification:
      - kind: e2e
        ref: "tests/app/permalink.browser.test.ts > a bundleVersion mismatch renders the D-15 banner naming both versions while the chart and metrics still render; > a URL missing a required key renders the named decode explanation and no chart"
        status: pass
    human_judgment: false
  - id: D8
    description: "CopyLinkButton: disabled until a completed result exists, enabled once one does, fixed rendered width across idle/confirmed/failed states, and a scrollable monospace fallback field on a clipboard write rejection"
    requirement: SHARE-01
    verification:
      - kind: e2e
        ref: "tests/app/permalink.browser.test.ts > the Copy link button is disabled while the load status is loading, and enabled once a result exists; > the Copy link button never resizes across its default, confirmation and failure states; > with clipboard permission denied, the button shows its failure label and the permalink appears as selectable text"
        status: pass
    human_judgment: false

duration: ~70min
completed: 2026-08-19
status: complete
---

# Phase 4 Plan 7: The Permalink Codec, URL Sync, and Bundle-Mismatch Banner Summary

**A fifteen-key, fixed-order URLSearchParams codec (`src/app/permalink.ts`) that reproduces a run exactly in a fresh browser via `history.replaceState`, with a fast-check round-trip property, four golden runs against the real bundle, a Copy Link action, and a D-15 bundle-mismatch banner that fills the slot plan 04-05 reserved.**

## Performance

- **Duration:** ~70 min
- **Tasks:** 3 (Task 1 was a checkpoint resolved by the user before this executor resumed)
- **Files modified:** 14 (5 created, 9 modified)
- **Commits:** 2 (this executor's resumption; Task 1's decision itself produced no commit)

## Accomplishments

- `src/app/permalink.ts`: `PERMALINK_KEYS` (the fifteen checkpoint-decided keys, fixed order), `encodeParams` (one canonical fixed-decimal/ISO-date/bare-union format per field, iterating `PERMALINK_KEYS` through a per-key switch TypeScript's own exhaustiveness check protects), and `decodeParams` (a total function over arbitrary `URLSearchParams`: allow-list rejection of unknown/duplicated/missing keys by name, a loud rejection of an unrecognized `holdMode`, and never a dynamic property assignment from a URL-derived key).
- `tests/app/permalink.test.ts`: a fast-check round-trip property over an integer-cents/basis-points-constructed `PermalinkParams` arbitrary (strict `toEqual` holds across the whole generated space), the full negative-case battery from `<behavior>`, and four golden URLs run end to end against the real committed bundle (default landing run, a monthly-contribution run, a high-leverage dot-com-crash ruin, and a fixed-holding-period run), each within a named tolerance.
- `src/app/state.ts`: `applyPermalinkFromLocation` decodes `window.location.search` once per module lifetime at the top of `initializeApp`, before `applyLoadedBundle` runs; `syncPermalinkUrl` re-serializes every completed run through `encodeParams` into `history.replaceState`. Fixed the entry-date-clobber trap (`applyLoadedBundle` now only defaults `entryDate` when it is still `''`) that prior-wave context flagged as the main risk in this plan.
- `CopyLinkButton.tsx` and `BundleVersionBanner.tsx`: the phase's one explicit action (disabled until a result exists, fixed-width across its three label states, a monospace selectable-text fallback on clipboard failure) and the D-15 mismatch notice that fills `ValidationExplanation`'s already-reserved slot without touching its stacking order.
- `tests/app/permalink.browser.test.ts`: fresh-browser reproduction (a golden URL matches driving the controls), URL-sync-without-history-growth across a 35-event slider scrub, the bundle-mismatch banner, the missing-required-key eviction, and both Copy Link states.
- Did NOT build the plan's "Run to today" secondary action — superseded by prior-wave context: `HoldingModeControl` already always names the live resolved end date in open-ended mode, so nothing needs refreshing; the D-15 banner already covers a stale bundle.

## Task Commits

1. **Task 1: Confirm the published permalink parameter contract** — checkpoint, resolved by the user before this executor resumed (no commit of its own; the decision is recorded verbatim above and in `src/app/permalink.ts`'s header comment)
2. **Task 2: The permalink codec, its round-trip property, and the committed golden runs** — `09ce583` (feat)
3. **Task 3: URL sync, the copy-link action, the mismatch banner, and fresh-browser reproduction** — `954dfbe` (feat)

## Files Created/Modified

- `src/app/permalink.ts` - the codec, both directions, in one file
- `src/app/components/ParameterColumn/CopyLinkButton.tsx` - the phase's one explicit action
- `src/app/components/ResultColumn/BundleVersionBanner.tsx` - the D-15 mismatch-variant function
- `tests/app/permalink.test.ts` - round-trip property, negative cases, golden runs
- `tests/app/permalink.browser.test.ts` - fresh-browser reproduction, URL sync, mismatch banner, Copy Link states
- `src/app/state.ts` - `applyPermalinkFromLocation`, `syncPermalinkUrl`, `currentLinkBundleVersion`, the entry-date-clobber fix
- `src/app/App.tsx` - wires `bundleVersionMismatchVariant` into `explanationVariants()`
- `src/app/components/ParameterColumn/ParameterColumn.tsx` - renders `CopyLinkButton`
- `src/app/components/ResultColumn/ValidationExplanation.tsx` - doc-comment update naming the now-real producer of the `bundle-mismatch` slot
- `src/app/styles.css` - `.copy-link-row`/`.copy-link-button`/`.copy-link-fallback` tokens
- `tests/app/controls.browser.test.ts`, `tests/app/metrics.browser.test.ts`, `tests/app/tracer.browser.test.ts`, `tests/app/validation.browser.test.ts` - see Deviations

## Decisions Made

See `key-decisions` in frontmatter: the Task 1 checkpoint's resolved schema, the resolvedEndDate-vs-original-request encoding split, the entry-date-clobber fix, and skipping "Run to today".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a pre-existing fast-check `fc.date()` flake in the new round-trip property**
- **Found during:** Task 2, first `npm test` run against the new file
- **Issue:** `fc.date({ min, max })` without `noInvalidDate: true` can generate an `Invalid Date`, and `.toISOString()` throws `RangeError: Invalid time value` on one.
- **Fix:** Added `noInvalidDate: true` to `isoDateArb`'s `fc.date(...)` call.
- **Files modified:** `tests/app/permalink.test.ts`
- **Verification:** `npm test` (519/519) clean across repeated runs.
- **Committed in:** `09ce583` (Task 2's own commit)

**2. [Rule 1 - Bug, caused by this plan's own fix] The entry-date-clobber fix broke four existing app-test files' implicit reliance on the bug it fixed**
- **Found during:** Task 3, first `npm run test:app` run after wiring the permalink decode into `initializeApp`
- **Issue:** Two separate, compounding problems surfaced together:
  1. Vitest's browser-mode iframe carries its own `sessionId`/`iframeId` query params (harness plumbing). `decodeParams` correctly rejects these as unknown keys, and my new boot-time decode-error path suppressed the very first `scheduleRun()` — meaning EVERY existing app-test file's very first mount produced no result at all, timing out.
  2. Once (1) was fixed by clearing `window.location.search` before each mount, a second, deeper issue appeared: `controls.browser.test.ts`'s "NDX dividend-mode eviction" test and `validation.browser.test.ts`'s "an evicted entry date" test each deliberately leave the module-level request store evicted at their own end. Before this plan, `applyLoadedBundle`'s UNCONDITIONAL `entryDate` reset on every mount silently repaired that leftover invalid state for whatever test ran next — exactly the bug this plan's own acceptance criteria required fixing. Once fixed, a later test's fresh mount inherited the still-evicted state and never produced a result, hanging.
- **Fix:** Added a `beforeEach` clearing `window.location.search` to `controls.browser.test.ts`, `metrics.browser.test.ts`, `tracer.browser.test.ts`, and `validation.browser.test.ts`. Added explicit valid-state restoration at the end of the two tests that deliberately leave the store evicted. Added a two-frame settle wait before capturing the "before" baseline in `controls.browser.test.ts`'s "a partially typed date does not recompute or evict" test, since a freshly mounted component can render a stale, already-cached `metrics-panel` from a PRIOR test's leftover module signal before the CURRENT mount's own redundant `scheduleRun()` (every mount schedules exactly one, whether or not anything changed) has itself settled — a pre-existing race this plan's fix made newly observable, not something this plan introduced.
- **Files modified:** `tests/app/controls.browser.test.ts`, `tests/app/metrics.browser.test.ts`, `tests/app/tracer.browser.test.ts`, `tests/app/validation.browser.test.ts`
- **Verification:** `npm run test:app` (35/35) run three times consecutively, all green.
- **Committed in:** `954dfbe` (Task 3's own commit)

**3. [Rule 3 - Blocking] Removed the literal string "pushState" from two doc comments**
- **Found during:** Task 3, acceptance-criteria grep check
- **Issue:** The acceptance criteria's `grep -c 'pushState' src/app` is 0 is a literal substring check across ALL of `src/app`, including comments — my own doc comments explaining "never `pushState`" tripped it.
- **Fix:** Reworded both comments to describe the API by behavior ("a new-entry-appending write") rather than by name.
- **Files modified:** `src/app/state.ts`
- **Verification:** `grep -rn 'pushState' src/app` returns nothing.
- **Committed in:** `954dfbe` (Task 3's own commit)

---

**Total deviations:** 3 (2 self-caught bugs fixed before/at commit time, 1 blocking acceptance-criteria fix)
**Impact on plan:** No scope creep beyond the two files this plan's own artifact list didn't originally name (the four `tests/app/*.browser.test.ts` files required a minimal, well-justified fix to keep passing under the entry-date-clobber correction this plan's own acceptance criteria required). The two-frame settle-wait and beforeEach additions are narrowly scoped to restoring test isolation, not new test coverage.

## Issues Encountered

None beyond the deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `PermalinkParams`'s `tier` field already accepts `'extended'` on decode (only `'strict'` is ever emitted by Phase 4); Phase 5 can add the tier-selector control over this existing parameter without touching the codec.
- The screenshot region D-20 reserved (Phase 8's SHARE-04 PNG export) is now paired with a permalink that reproduces exactly what it shows — Phase 8 has both halves of "hand someone a receipt" ready.
- `BUNDLE_VERSION` mismatch handling only ever reaches the "states clearly the data has changed" branch (SHARE-02's second branch) since `MANIFEST_PATH` addresses exactly one manifest; retaining the last N bundles for faithful old-link reproduction remains a recorded Deferred Idea, not started here.
- No blockers carried forward from this plan.

## Self-Check: PASSED

Verified on disk: `src/app/permalink.ts`, `src/app/components/ParameterColumn/CopyLinkButton.tsx`, `src/app/components/ResultColumn/BundleVersionBanner.tsx`, `tests/app/permalink.test.ts`, `tests/app/permalink.browser.test.ts` all present.
Verified in `git log`: `09ce583`, `954dfbe` both present on branch `worktree-agent-a6967f4a04335c948`.

---
*Phase: 04-first-defensible-backtest-in-the-browser*
*Completed: 2026-08-19*
