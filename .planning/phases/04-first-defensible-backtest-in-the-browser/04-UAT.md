---
status: testing
phase: 04-first-defensible-backtest-in-the-browser
source: [04-VERIFICATION.md]
started: 2026-08-20T00:30:00Z
updated: 2026-08-20T00:30:00Z
---

## Current Test

number: 1
name: IRR headline and CAGR secondary row at ~320px, 20x over full history
expected: |
  The 28px IRR headline value never wraps or clips, and a wrapping secondary metric does not
  push the panel outside the screenshot region (UI-SPEC E7 overflow).
awaiting: user response

## Tests

All seven are narrow-viewport (~320px) text-wrap-versus-clip checks. Every one was declared
`verification: backstop` by its own plan, so none is a discovered defect; they are the layout
cases no automated assertion covers. Overflow itself is mechanically measurable
(scrollWidth vs clientWidth, bounding-rect containment); only "does it read well" is a
genuine judgement call.

### 1. IRR headline / CAGR secondary at 320px
expected: 28px headline never wraps or clips; a wrapping secondary metric does not push the panel
  outside the screenshot region (UI-SPEC E7 overflow, 04-02 backstop). Drive 20x over the full
  bundled history for the largest final multiple.
result: [pending]

### 2. Ruin banner full sentence at 320px
expected: the banner text, including the interpolated ISO ruin date, wraps across lines rather
  than clipping or truncating the date (UI-SPEC E8 overflow, 04-02 backstop). Force a ruined run,
  e.g. 20x SPX across 2008/2020.
result: [pending]

### 3. Longest symbol label vs fixed parameter-column width at 320px
expected: the longest bundled symbol label does not force the fixed-width parameter column wider
  than its design width (UI-SPEC E1 overflow, 04-04 backstop).
result: [pending]

### 4. Symbol label plus inline SourceCitation at 320px
expected: label plus citation wraps onto additional lines rather than clipping or overlapping
  (UI-SPEC E1 long-text, 04-04 backstop).
result: [pending]

### 5. Cost-control citations at 320px
expected: citation strings wrap under their control rather than clipping or colliding with
  adjacent controls; the longest (the financing-spread midpoint-of-range wording) reflows to at
  most two lines without pushing the Copy link button below the fold
  (UI-SPEC E5 overflow/long-text, 04-05 backstop x2).
result: [pending]

### 6. Stacked ValidationExplanation variants at 320px
expected: two or more simultaneous variants (e.g. bundle-version mismatch plus cross-field caveat)
  do not push the chart out of the D-20 screenshot region (UI-SPEC E9 overflow, 04-05 backstop).
  screenshot-region.browser.test.ts covers only the normal and ruined happy-path states.
result: [pending]

### 7. Screenshot region integrity under the above
expected: across cases 1-6 the D-20 screenshot region still contains the chart and the metrics
  panel together, so a pasted screenshot remains self-contained.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
