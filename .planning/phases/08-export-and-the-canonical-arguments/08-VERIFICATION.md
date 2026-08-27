---
phase: 08-export-and-the-canonical-arguments
verified: 2026-08-26T21:05:00Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 8: Export and the Canonical Arguments Verification Report

**Phase Goal:** A result leaves the app in whatever form the argument needs: a picture, the raw numbers, or a curated link.
**Verified:** 2026-08-26
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | PNG export stays legible pasted into a forum post/chat, in light and dark, including real Safari | ✓ VERIFIED | `src/export/png-export.ts` implements fixed-width layout, forced opaque background, D-02/D-03 theme-parity and viewport-independence proofs (`tests/app/export-png.browser.test.ts`). A genuine WebKit defect (every region canvas blank on first capture) was found by plan 08-05's own real-Safari gate, root-caused and fixed in `53fa1e4` (composite live canvas backing stores via `destination-over`, reverse document order), confirmed present in the current tree (`grep` on `compositeLiveCanvases`/`suppressLibraryCanvasRasterization`/`destination-over` all found at `png-export.ts:110-298`). A code-review-found concurrency bug (CR-01: overlapping exports could permanently corrupt the live page's layout) was fixed in `61b7dd8` — confirmed present (`exportQueue`, promise-serialized `captureRegionAsPng`, `pngExportInFlight` guard in `ExportRow.tsx:81-84`). Real-Safari re-verification against the post-fix bundle is recorded in `.planning/debug/resolved/png-export-blank-canvas-safari.md` (`human_verification.confirmed: true`) with build-identity and service-worker controls documented, not merely asserted. `tests/app/export-png-canvas-fidelity.browser.test.ts` (5 tests) runs under a scoped WebKit vitest project (`npm run test:app:webkit`, confirmed present at `vitest.config.ts:806-816`) and is proven non-vacuous (red-phase: 2/5 fail against the pre-fix code in WebKit, 5/5 pass in Chromium against the same code). |
| 2 | CSV export carries enough columns that a skeptic can recompute the same final value in a spreadsheet | ✓ VERIFIED | `src/export/csv-columns.ts` declares the 8-column D-06 set (date, indexReturn, shortRate, calendarDaysElapsed, contributionFlag, contributionAmount, longGapFlag, portfolioValue). `tests/app/export-csv.test.ts`'s "recompute from the emitted CSV (roadmap criterion 2)" test independently reimplements the kernel's recurrence purely from the CSV's own text and reaches the kernel's real `finalValue` to within 1e-9 relative — re-run standalone during this verification (`vitest run -t "recompute from the emitted CSV"`, 2/2 pass). No value is rounded (`String(value)` in `csv.worker.ts`). A `#`-commented preamble carries all 17 permalink params, bundle version, tier, date range, sources and the permalink URL itself (`csv-preamble.ts`, tested). CSV is built inside a one-shot Worker (`csv-export.ts`), main thread only receives the Blob. |
| 3 | Named presets cover the canonical arguments, one click from landing, shareable permalinks, and the set is not a cherry-pick | ✓ VERIFIED | `src/app/presets.ts` declares 10 presets, unflattering-first, `Object.freeze()`'d. Directly inspected: `spx-3x-1929` (3x S&P from the 1929 peak, extended tier), `ndx-3x-2000-peak` (synthetic 3x NDX from the March 2000 peak — documented substitution for the roadmap's literal "TQQQ from 2000" wording, since real TQQQ history only starts 2010-02-11; labelled `synthetic` in the UI per D-10, tested by `criterion-3 coverage`), `spx-3x-high-rate-1979` (the 1979-1982 financing-rate peak, extended tier), and `spx-3x-2010s` (the flattering 2010s-in-isolation window) are all present and asserted by `tests/app/presets.test.ts`'s "criterion-3 coverage" test (re-run standalone, pass). 4 of 10 are `featured: true` and render one click from the landing state via `<FeaturedPresetRow />`, mounted unconditionally in `App.tsx:214`; the full 10-preset library is reachable one further click via `<ScenariosOverlay />` (`App.tsx:228`). `applyPreset` (`state.ts`) writes through the same validated setters every control uses and fills `bundleVersion` from the live manifest (D-19), so Copy link on an applied preset is a normal correct permalink — proven by `tests/app/scenarios-overlay.browser.test.ts`'s real click-to-decoded-URL assertion. Every real-fund preset (TQQQ, UPRO) sets `leverage: 1` and `expenseRatioPercent: 0` to avoid double-charging the fund's own fee (D-16), enforced by a test with a deliberate-break proof recorded in `08-03-SUMMARY.md`. Headline figures are computed once at build time (`scripts/compute-presets.ts` → `presets.generated.ts`) and pinned by `tests/app/presets.generated.test.ts` (re-run standalone, 4/4 pass) — a hand-typed or drifted figure cannot pass. |
| 4 | PNG/CSV export and a 25,000-row-scale run stay inside the 50ms main-thread task budget, measured | ✓ VERIFIED (with a caveat, see below) | `bench/perf-08-export.bench.test.ts` measures all three interactions (PNG export, CSV export, DCA preset apply) through the same `MeasurementRow`/`normalize()` path every other PERF-0x figure in this project uses (`checkBudget`, `assertWithinBudget`, `PERF_BUDGETS['PERF-07a']`, `selectMaxLongTaskDuration` imported from `bench/long-task-selector.ts` rather than reimplemented). Re-ran the test's own self-check (`selectMaxLongTaskDuration` picks max, never sum) as part of reading the file; the recorded local run (`.bench/.raw/row-PERF-07a-production.json`) shows all three paths at 0.00ms with 0 long tasks, `verdict=pass`, essentially maximal headroom under the 50ms budget. **Caveat, stated plainly per the review brief:** this recorded figure is a dev-sandbox reading (`hardwareConcurrency=9`, `.bench/.raw/environment.json` shows `"ci":false`), not the D-17 CI baseline (`ubuntu-latest`, 4 cores) that Phase 7's reconciliation treated as authoritative for PERF-0x figures — `gh run list` shows no CI run at all yet on this branch. The measurement methodology and code path are correct and the values genuinely leave large margin (0 long tasks observed, not a near-miss), so the criterion's literal wording ("measured") is satisfied; a full-suite CI run of `npm run bench` will also collide this file's `PERF-07a/production` row with `bench/perf-07.bench.test.ts`'s own row by design (documented in the bench file's own header comment) and downgrade to an info line rather than a second persisted row — this is a deliberate, tested design choice (`rowPersisted` fallback, verified in code), not a gap. |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/export/download.ts` | Shared Blob-to-download primitive | ✓ VERIFIED | 30 lines, `triggerDownload`, `revokeObjectURL` in `finally` |
| `src/export/png-export.ts` | PNG capture, fixed-width, opaque bg, WebKit fix, CR-01 serialization | ✓ VERIFIED | 362 lines; `compositeLiveCanvases`, `suppressLibraryCanvasRasterization`, `exportQueue` promise serialization all present |
| `src/app/components/ResultColumn/ExportRow.tsx` | Copy link / Export PNG / Export CSV, always 3 buttons | ✓ VERIFIED | 243 lines; mounted unconditionally in `App.tsx:210`, sibling of both `.screenshot-region`s |
| `src/export/csv-columns.ts`, `csv.worker.ts`, `csv-preamble.ts`, `csv-export.ts` | D-06 columns, Worker build, D-07 preamble, orchestration | ✓ VERIFIED | All present; recompute test passes standalone |
| `src/app/presets.ts`, `presets.generated.ts`, `scripts/compute-presets.ts` | 10 presets, build-time figures, generator | ✓ VERIFIED | All present; pinning test passes standalone; content inspected directly |
| `src/app/components/ResultColumn/PresetCard.tsx`, `FeaturedPresetRow.tsx`, `src/app/components/ScenariosOverlay.tsx` | Card, featured row, full-library overlay | ✓ VERIFIED | All present, mounted in `App.tsx` |
| `bench/perf-08-export.bench.test.ts` | PERF-07a measurement for 3 export paths | ✓ VERIFIED | Present, uses shared MeasurementRow/normalize path; see caveat above |
| `tests/app/export-png-canvas-fidelity.browser.test.ts` | WebKit canvas-fidelity regression | ✓ VERIFIED | 376 lines, 5 tests, scoped `app-webkit` vitest project confirmed at `vitest.config.ts:806` |

### Key Link Verification

| From | To | Via | Status |
|------|-----|-----|--------|
| `App.tsx` | `ExportRow.tsx` | rendered as unconditional sibling after both `.screenshot-region` blocks | ✓ WIRED (`App.tsx:210`) |
| `ExportRow.tsx` | `png-export.ts` | `exportRegionAsPng` call in click handler | ✓ WIRED |
| `ExportRow.tsx` | `csv-export.ts` | `buildCsvBlob` call in click handler | ✓ WIRED |
| `App.tsx` | `FeaturedPresetRow.tsx` / `ScenariosOverlay.tsx` | unconditional mounts | ✓ WIRED (`App.tsx:214,228`) |
| `PresetCard.tsx` | `state.ts` | `applyPreset` on click | ✓ WIRED |
| `scripts/compute-presets.ts` | `state.ts` | `computeDerivedMetrics` (F-07, one shared metric selector) | ✓ WIRED |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SHARE-04 | 08-01, 08-05 | User can export the current chart as a PNG | ✓ SATISFIED | PNG export end-to-end, real-Safari confirmed post-fix |
| SHARE-05 | 08-02, 08-05 | User can export a run's daily series as CSV | ✓ SATISFIED | CSV export, recompute-to-finalValue proof |
| SHARE-06 | 08-03, 08-04, 08-05 | Named preset scenarios, one click, shareable permalinks | ✓ SATISFIED | 10-preset library, featured row, overlay, applyPreset |

No orphaned requirements: REQUIREMENTS.md's per-phase table lists exactly SHARE-04/05/06 for Phase 8, matching the union of `requirements:` fields across all 5 plans. `REQUIREMENTS.md` itself marks all three `[x]` Complete.

### Anti-Patterns Found

Scanned all phase-8-created/modified export and preset files for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` (excluding legitimate prose about the WebKit fix's "1x1 placeholder") and for the em-dash character (project CLAUDE.md rule, and the specific WR-02 finding from code review). Zero matches in either scan. No debt markers, no stub returns, no hardcoded empty data flowing to render.

### Code Review Findings (08-REVIEW.md)

1 critical (CR-01, overlapping PNG exports could permanently corrupt the live page layout) and 3 warnings (WR-01 unrestored style on a throw path, WR-02 em dash in a comment, WR-03 dead-code export) were found and all four independently confirmed fixed in the current tree:
- CR-01/WR-01: `exportQueue` promise serialization and the try/finally restructuring, both present at `png-export.ts:236-345`.
- WR-02: no em dash found anywhere in the scanned files.
- WR-03: `tests/app/scenarios-overlay.browser.test.ts` imports the real `presetById` (aliased `lookupPresetById`) rather than duplicating it.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `npm run typecheck` | `tsc --noEmit` | exit 0 | ✓ PASS |
| CSV recompute-to-finalValue (single named test) | `vitest run --project unit -t "recompute from the emitted CSV"` | 2/2 pass | ✓ PASS |
| Preset pinning test (single named test) | `vitest run --project unit -t "D-18: the committed preset outcomes"` | 4/4 pass | ✓ PASS |
| D-16 real-fund double-charge guard (single named test) | `vitest run --project unit -t "D-16: every real-fund preset"` | 1/1 pass | ✓ PASS |
| Test enumeration (existence proof, not a full run) | `vitest list --project unit` | all phase-8 test names present | ✓ PASS |
| WebKit-scoped project declared | `grep app-webkit vitest.config.ts` | project present, `instances: [{ browser: 'webkit' }]` | ✓ PASS |
| ExportRow/FeaturedPresetRow/ScenariosOverlay mounted | `grep` in `App.tsx` | all three imported and rendered | ✓ PASS |
| Em dash scan | `grep` for em dash across phase-8 files | zero matches | ✓ PASS |

Full suites were not re-run in this verification (the orchestrator's independently-run counts — 845/845 unit, 195/195 Chromium app, 5/5 WebKit — are corroborated by the standalone single-test and enumeration checks above, per the "at most once per verification" rule for full suites).

### Human Verification Required

None. The one item that would ordinarily require human judgment — real-Safari PNG rendering fidelity — was already performed by the user during plan execution (recorded in `.planning/debug/resolved/png-export-blank-canvas-safari.md` with build-identity and service-worker controls) and is not re-raised here per the verification brief.

### Gaps Summary

No gaps. All four roadmap success criteria are met by evidence directly inspected in the codebase, not only by SUMMARY claims. The one item worth a developer's attention going forward (not a phase-8 gap): criterion 4's export-path timing figures are dev-sandbox measurements only, not yet confirmed against the D-17 CI baseline (no CI run exists yet on this branch), though the measured margin (0 long tasks across all three paths) makes an actual budget breach on the CI baseline unlikely. This does not block phase closure — 08-05-PLAN.md's own must-haves ask for a real, honestly-recorded measurement through the shared MeasurementRow/normalize path, which exists.

---

*Verified: 2026-08-26*
*Verifier: Claude (gsd-verifier)*
