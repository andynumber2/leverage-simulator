---
status: complete
phase: 08-export-and-the-canonical-arguments
source: [08-01-SUMMARY.md, 08-02-SUMMARY.md, 08-03-SUMMARY.md, 08-04-SUMMARY.md, 08-05-SUMMARY.md]
started: 2026-08-26T22:01:04Z
updated: 2026-08-26T22:15:39Z
---

## Current Test

[testing complete]

## Tests

### 1. Export PNG delivers the screenshot region to the clipboard, with a download fallback
expected: A user with a completed single-run result clicks Export PNG and gets a PNG of the whole screenshot region on the clipboard, or downloaded when the Clipboard API is unavailable
result: pass
source: automated
coverage_id: 08-01-D1

### 2. Export row renders unconditionally as a sibling of the screenshot region
expected: The export row renders unconditionally (present-but-disabled before a result, in both result modes), as a following sibling of the screenshot region, never a descendant
result: pass
source: automated
coverage_id: 08-01-D2

### 3. Copy link relocated into the export row
expected: Copy link relocated into the export row (D-22), flush-before-read discipline intact, absent from the parameter column
result: pass
source: automated
coverage_id: 08-01-D3

### 4. Hover readout excluded from capture, committed crosshair survives
expected: In sweep mode, the transient hover readout is excluded from a capture while the committed crosshair overlay survives it (F-02)
result: pass
source: automated
coverage_id: 08-01-D4

### 5. Theme parity and viewport independence of the capture
expected: D-02 theme parity and D-03 viewport independence, closing 08-RESEARCH.md's Assumption A1 by measurement
result: pass
source: automated
coverage_id: 08-01-D5

### 6. Static-build guard inverted, capture code confined to src/export/
expected: F-01's static-build guard inverted (not deleted): capture code exists and stays confined to src/export/
result: pass
source: automated
coverage_id: 08-01-D6

### 7. Export CSV downloads the eight-column per-bar file
expected: A user with a completed single-run result clicks Export CSV and the browser downloads a file whose rows carry date, index return, short rate, calendar days elapsed, contribution flag, contribution amount, long-gap flag and portfolio value, one row per bar of the run window (D-06)
result: pass
source: automated
coverage_id: 08-02-D1

### 8. Recompute from the CSV reaches the kernel's finalValue within 1e-9
expected: A recompute driven only by the emitted CSV's columns and the preamble's leverage/expense/financing values reaches the kernel's real finalValue to within 1e-9 relative (roadmap criterion 2)
result: pass
source: automated
coverage_id: 08-02-D2

### 9. CSV preamble carries full provenance and the accepted-cost note
expected: The hash-commented preamble carries every permalink parameter, bundle version, tier, effective date range, source names and the permalink URL, plus the D-07 accepted-cost note naming both Excel and Google Sheets
result: pass
source: automated
coverage_id: 08-02-D3

### 10. CSV built in a Worker without disturbing the on-screen chart
expected: The CSV is built inside a Worker; the main thread receives a Blob and triggers the download, without disturbing the chart still on screen (D-09/T-08-09)
result: pass
source: automated
coverage_id: 08-02-D4

### 11. Export CSV disabled in sweep mode with a reason note
expected: Export CSV is disabled whenever the result mode is sweep, independent of whether a result exists, with the adjacent muted disabled-reason note (D-08)
result: pass
source: automated
coverage_id: 08-02-D5

### 12. Kernel byte-identical across the CSV plan
expected: The kernel is byte-identical before and after this plan (D-06, PERF-03 measurement hold)
result: pass
source: automated
coverage_id: 08-02-D6

### 13. computeDerivedMetrics callable from Node against the real bundle
expected: computeDerivedMetrics is exported from state.ts and callable from a Node script against the real on-disk bundle, with no browser-only global touched on its call path
result: pass
source: automated
coverage_id: 08-03-D1

### 14. Preset library covers criterion 3's four windows, unflattering-first
expected: PRESET_DEFINITIONS has 10 entries covering roadmap criterion 3's four named windows, declared unflattering-first with exactly 4 featured in the D-15 order
result: pass
source: automated
coverage_id: 08-03-D2

### 15. Real-fund presets never double-charge expense
expected: Every real-fund preset (TQQQ, UPRO) sets leverage exactly 1.0 and expenseRatioPercent exactly 0 (D-16), asserted by a test with a message stating the double-charge consequence
result: pass
source: automated
coverage_id: 08-03-D3

### 16. Preset headline figures pinned to a live recomputation
expected: Every preset's headline figure is computed once at build time against the compiled bundle and committed; a pinning test fails CI when the figure no longer matches a live recomputation
result: pass
source: automated
coverage_id: 08-03-D4

### 17. A preset is nothing more than a named parameter set
expected: Every preset's request round-trips through encodeParams/decodeParams unchanged, and no two presets encode to the same query string
result: pass
source: automated
coverage_id: 08-03-D5

### 18. applyPreset writes only through validated setters
expected: applyPreset turns a PresetDefinition into live app state through the same validated setters every parameter control uses, never a raw store write
result: pass
source: automated
coverage_id: 08-04-D1

### 19. Featured row renders the four D-15 presets in declaration order
expected: The featured row renders exactly the four D-15 presets, in D-13's unflattering-first declaration order, always visible from the landing state
result: pass
source: automated
coverage_id: 08-04-D2

### 20. Scenarios overlay opens, closes and renders no DOM while closed
expected: The Scenarios overlay holds every preset in the library, opens/closes by trigger, close button and Escape, and renders no DOM while closed
result: pass
source: automated
coverage_id: 08-04-D3

### 21. Sweep preset dispatches exactly one sweep and carries mode=sweep
expected: The one preset declaring sweep mode opens the sweep and resolves a full grid, carrying mode=sweep in the permalink, with exactly one sweep dispatched per click
result: pass
source: automated
coverage_id: 08-04-D4

### 22. Synthetic and extended-tier tags render, warning banner survives
expected: Synthetic and extended-tier tags render the required copy; the extended-tier preset still shows the full ExtendedTierWarning banner on the result screen
result: pass
source: automated
coverage_id: 08-04-D5

### 23. Featured row and overlay layout backstops closed by measurement
expected: Both UI-SPEC E2 backstop layout risks (featured row overflow, overlay long-text clipping) are closed by measurement
result: pass
source: automated
coverage_id: 08-04-D6

### 24. Export and DCA paths within the PERF-07a 50ms long-task budget
expected: PNG, CSV, and DCA-preset-apply paths each measured against PERF-07a's 50ms main-thread long-task budget, all passing
result: pass
source: automated
coverage_id: 08-05-D2

### 25. DCA loading-state decision recorded and backed by measurement
expected: DCA loading-state decision recorded: no loading state needed, backed by the measured figure
result: pass
source: automated
coverage_id: 08-05-D3

### 26. Real-Safari PNG export fidelity
expected: PNG export renders every canvas correctly on the first capture in real Safari, in both light and dark theme and in both single-run and sweep mode
result: pass
source: human
reported: "yeah, it looks fine to me. One caveat is that it started in dark theme, so I did single run, dark, light, and then sweep, light, dark. And you cannot change the theme in the sweep screen, so I had to switch back to the single run to click the button between the third and the fourth capture, but they all look fine to me."
note: All four theme/mode combinations were captured and all render correctly. The theme toggle being unavailable on the sweep screen is a pre-existing UI placement issue, not a Phase 8 defect (see Observations).
coverage_id: 08-05-D1
rationale: Visual/pixel fidelity of a pasted export image in real Safari cannot be fully judged by an automated oracle alone; the automated WebKit regression test is the recurrence guard, the human verification is the acceptance signal this gate exists to require.

## Summary

total: 26
passed: 26
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]

## Observations

Not gaps: noted during testing, out of Phase 8 scope.

- observation: "The theme toggle is unavailable while the app is in sweep mode, so switching theme
    to capture a dark-mode sweep export requires leaving sweep mode, toggling, and re-entering."
  severity: minor
  test: 26
  scope: pre-existing
  evidence: "src/app/App.tsx:160-162 renders <ThemeToggle /> inside .chart-scale-row, which sits
    inside the single-run branch of the result column. Sweep mode does not render that branch.
    Placement dates to commit 42b96a3 (Phase 4-08), before sweep mode existed (Phase 7); no
    Phase 8 commit touches it."
  suggested_follow_up: "Hoist ThemeToggle out of .chart-scale-row to a result-mode-independent
    location (app header or the export row), so theme is switchable in both result modes."

