---
status: complete
phase: 04-first-defensible-backtest-in-the-browser
source: [04-VERIFICATION.md]
started: 2026-08-20T00:30:00Z
updated: 2026-08-20T03:37:00Z
---

## Current Test

number: none
awaiting: nothing

## Tests

All seven are narrow-viewport (~320px) text-wrap-versus-clip checks. Every one was declared
`verification: backstop` by its own plan, so none is a discovered defect; they are the layout
cases no automated assertion covers. Overflow itself is mechanically measurable
(scrollWidth vs clientWidth, bounding-rect containment); only "does it read well" is a
genuine judgement call.

Covered by automation: `tests/app/narrow-viewport.browser.test.ts` (quick task 260820-4qx),
which converts each of these seven items into a mechanical scrollWidth/clientWidth/bounding-rect
assertion at a real 320px viewport rather than held-out human judgment.

### 1. IRR headline / CAGR secondary at 320px
expected: 28px headline never wraps or clips; a wrapping secondary metric does not push the panel
  outside the screenshot region (UI-SPEC E7 overflow, 04-02 backstop). Drive 20x over the full
  bundled history for the largest final multiple.
result: covered by `tests/app/narrow-viewport.browser.test.ts` test 1 (IRR headline and CAGR
  secondary metric at 320px, the widest non-ruined leverage/symbol combination in the bundled
  universe). Passed.

### 2. Ruin banner full sentence at 320px
expected: the banner text, including the interpolated ISO ruin date, wraps across lines rather
  than clipping or truncating the date (UI-SPEC E8 overflow, 04-02 backstop). Force a ruined run,
  e.g. 20x SPX across 2008/2020.
result: covered by `tests/app/narrow-viewport.browser.test.ts` test 2 (ruin banner at 320px,
  20x SPX). Passed.

### 3. Longest symbol label vs fixed parameter-column width at 320px
expected: the longest bundled symbol label does not force the fixed-width parameter column wider
  than its design width (UI-SPEC E1 overflow, 04-04 backstop).
result: covered by `tests/app/narrow-viewport.browser.test.ts` test 3 (longest bundled symbol
  label vs the parameter column at 320px, derived from the live manifest). Passed.

### 4. Symbol label plus inline SourceCitation at 320px
expected: label plus citation wraps onto additional lines rather than clipping or overlapping
  (UI-SPEC E1 long-text, 04-04 backstop).
result: covered by `tests/app/narrow-viewport.browser.test.ts` test 4 (symbol label plus inline
  SourceCitation at 320px, dividend-unavailable case). Passed.

### 5. Cost-control citations at 320px
expected: citation strings wrap under their control rather than clipping or colliding with
  adjacent controls, and wrap freely to whatever height the text needs without pushing the Copy
  link button below the fold (UI-SPEC E5 overflow/long-text, 04-05 backstop x2).
result: covered by `tests/app/narrow-viewport.browser.test.ts` test 5 (cost-control citations at
  320px). The test asserts wrap-not-clip for every cost-control citation, asserts each citation's
  rect stays contained within its own `.parameter-group`, and asserts the Copy link button is
  present. Passed.

  Expectation amended 2026-08-20. This row originally carried an "at most two lines" ceiling
  copied from UI-SPEC E5's long-text row. Measured against the real
  `src/validation/cost-parameters.ts` content, the longest citation is
  `generic-3x-expense-ratio`'s, a full PROJECT.md quotation plus explanation, which reflows to
  roughly 8 lines at 320px. The ceiling was a guess written before that text existed, and the two
  ways to meet it both cost more than they buy: shortening the string corrupts the SIM-09 sourced
  audit trail, and a tooltip or disclosure violates `SourceCitation.tsx`'s no-concealment rule.
  UI-SPEC E5's long-text row was rewritten to drop the ceiling, and this row follows it. Height
  is not the property that mattered; no clipping, no collision, and Copy link above the fold are,
  and all three hold.

### 6. Stacked ValidationExplanation variants at 320px
expected: two or more simultaneous variants (e.g. bundle-version mismatch plus cross-field caveat)
  do not push the chart out of the D-20 screenshot region (UI-SPEC E9 overflow, 04-05 backstop).
  screenshot-region.browser.test.ts covers only the normal and ruined happy-path states.
result: covered by `tests/app/narrow-viewport.browser.test.ts` test "6/7" (stacked bundle-mismatch
  plus cross-field-caveat explanation at 320px). Passed.

### 7. Screenshot region integrity under the above
expected: across cases 1-6 the D-20 screenshot region still contains the chart and the metrics
  panel together, so a pasted screenshot remains self-contained.
result: covered by `tests/app/narrow-viewport.browser.test.ts`'s
  `assertScreenshotRegionSelfContained` helper, which runs inside scenarios 1, 2 and 6/7 (the
  combined test named "6/7." in that file) in addition to being the subject of its own row here.
  Passed in every scenario that reaches a completed run.

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0
blocked: 0

All seven items are covered by `tests/app/narrow-viewport.browser.test.ts`. Item 5's original
"at most two lines" ceiling was amended rather than met; see that item's result and `## Gaps`.

## Gaps

- **Resolved 2026-08-20: item 5's two-line ceiling was dropped from the spec, not met.** The
  longest sourced citation (`generic-3x-expense-ratio`) renders at roughly 8 lines at 320px. It
  wraps cleanly, stays inside its own control, and leaves the Copy link button above the fold, so
  no user-visible property is violated. The ceiling was authored before the real citation text
  existed and could only have been met by corrupting the SIM-09 audit trail or by concealing
  sourced text, both of which the project forbids. UI-SPEC E5's long-text row now states that
  citations wrap to whatever height they need, with the button position as the only constraint.
