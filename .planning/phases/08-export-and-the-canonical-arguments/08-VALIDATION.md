---
phase: 8
slug: export-and-the-canonical-arguments
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-26
updated: 2026-08-26
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10, four projects: `unit` (Node), `app` (Chromium via @vitest/browser-playwright), `bench` (Playwright-backed perf harness), `bench-selftest` |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test` (the `unit` project only) |
| **Full suite command** | `npm run test && npm run test:app && npm run build && npm run bench` |
| **Estimated runtime** | `npm run test` ~30s · `npm run test:app` ~90s · `npm run bench` ~4min (spins a preview server per command) |

Project include globs, confirmed from `vitest.config.ts`:
- `unit` → `tests/**/*.test.ts` (Node environment), so `tests/app/export-csv.test.ts`, `tests/app/presets.test.ts` and `tests/app/presets.generated.test.ts` land here.
- `app` → `tests/app/**/*.browser.test.ts` (Chromium only, `instances: [{ browser: 'chromium' }]`).
- `bench` → `bench/**/*.bench.test.ts`.

---

## Sampling Rate

- **After every task commit:** `npm run test` (the fast `unit` project).
- **After every plan wave:** `npm run test && npm run test:app`.
- **After wave 4:** add `npm run build && npm run bench -- bench/perf-08-export.bench.test.ts`.
- **Before `/gsd-verify-work`:** full suite green, including the new PNG-export bench file.
- **Max feedback latency:** 30 seconds for the `unit` project, which every task in waves 1 through 3 has at least one assertion in except the two browser-only capture tasks below.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | SHARE-04 | T-08-01 / T-08-02 / T-08-SC | Filename sanitised to `[A-Za-z0-9._-]`; capture scoped to `.screenshot-region`, never `document.body`; pinned dependency version with lockfile committed | browser + unit | `npx vitest run --project app tests/app/export-png.browser.test.ts` and `npm run build && npx vitest run --project unit tests/app/static-build.test.ts` | ❌ W0 (both new/modified in-task) | ⬜ pending |
| 08-01-02 | 01 | 1 | SHARE-04 | T-08-02 | Only the transient hover readout carries the exclusion attribute; controls stay outside the region structurally | browser | `npx vitest run --project app tests/app/export-png.browser.test.ts tests/app/permalink.browser.test.ts tests/app/controls.browser.test.ts` | ❌ W0 | ⬜ pending |
| 08-01-03 | 01 | 1 | SHARE-04 | T-08-02 | Opaque background asserted per theme; a transparent capture fails rather than shipping | browser | `npx vitest run --project app tests/app/export-png.browser.test.ts tests/app/narrow-viewport.browser.test.ts` | ❌ W0 | ⬜ pending |
| 08-02-01 | 02 | 2 | SHARE-05 | T-08-06 / T-08-08 / T-08-09 | Caller-made `.slice()` copies, no transfer list, worker terminated in a `finally` | unit | `npx vitest run --project unit tests/app/export-csv.test.ts` | ❌ W0 | ⬜ pending |
| 08-02-02 | 02 | 2 | SHARE-05 | T-08-06 | Every cell is a kernel number or an ISO date; no cell can open as a spreadsheet formula | unit | `npx vitest run --project unit tests/app/export-csv.test.ts` | ❌ W0 | ⬜ pending |
| 08-02-03 | 02 | 2 | SHARE-05 | T-08-09 | Chart still renders non-blank after export, proving no buffer was detached | browser | `npx vitest run --project app tests/app/export-csv.browser.test.ts` | ❌ W0 | ⬜ pending |
| 08-03-01 | 03 | 2 | SHARE-06 | T-08-12 | One shared metric-selection function for the generator and the UI | unit | `npx vitest run --project unit tests/app/presets.test.ts` | ❌ W0 | ⬜ pending |
| 08-03-02 | 03 | 2 | SHARE-06 | T-08-11 / T-08-14 | Every emitted value passes through `JSON.stringify`; write-to-temp-then-rename; fixed output path with no input-derived component | unit (script run) | `npm run compute-presets && npm run typecheck` | ❌ W0 | ⬜ pending |
| 08-03-03 | 03 | 2 | SHARE-06 | T-08-11 / T-08-12 / T-08-13 | Pinning test proven non-vacuous by a deliberate break; D-16 assertion proven non-vacuous the same way | unit | `npx vitest run --project unit tests/app/presets.generated.test.ts tests/app/presets.test.ts` | ❌ W0 | ⬜ pending |
| 08-04-01 | 04 | 3 | SHARE-06 | T-08-16 / T-08-20 | `applyPreset` calls only exported validated setters; exactly one sweep scheduled per click | unit | `npx vitest run --project unit tests/app/presets.test.ts` | ❌ W0 | ⬜ pending |
| 08-04-02 | 04 | 3 | SHARE-06 | T-08-17 / T-08-18 | Card figures read from generated data and formatted through the one formatter; all card text rendered as escaped text children | build | `npm run typecheck && npm run build` | ✅ (existing commands) | ⬜ pending |
| 08-04-03 | 04 | 3 | SHARE-06 | T-08-19 / T-08-20 | Escape handler removed on cleanup; `sweepGeneration()` advanced by exactly 1 | browser | `npx vitest run --project app tests/app/scenarios-overlay.browser.test.ts` | ❌ W0 | ⬜ pending |
| 08-05-01 | 05 | 4 | SHARE-04, SHARE-05, SHARE-06 | T-08-23 / T-08-24 | Throwaway context, scoped permissions, downloads discarded with the context | build | `npm run typecheck && npm run build` | ✅ (existing commands) | ⬜ pending |
| 08-05-02 | 05 | 4 | SHARE-04, SHARE-05, SHARE-06 | T-08-21 / T-08-22 | Labelled figures with per-measurement long-task counts; `git diff` on budget and calibration files asserted empty | bench | `npm run build && npm run bench -- bench/perf-08-export.bench.test.ts` | ❌ W0 | ⬜ pending |
| 08-05-03 | 05 | 4 | SHARE-04 | T-08-25 | Blocking checkpoint; resume signal requires the Safari result to be stated, not merely approved | manual | — (see Manual-Only Verifications) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Every test file below is created by the task that needs it, in the same commit as the code it
covers, rather than as a separate scaffolding wave. The framework, the browser harness, the bench
harness and the preview server all already exist, so there is no framework install to do.

- [ ] `tests/app/export-png.browser.test.ts` — SHARE-04 capture correctness (created by 08-01 Task 1)
- [ ] `tests/app/export-csv.test.ts` — SHARE-05 column, preamble, precision and recompute assertions (created by 08-02 Task 1)
- [ ] `tests/app/export-csv.browser.test.ts` — SHARE-05 real round trip and sweep-mode gating (created by 08-02 Task 3)
- [ ] `tests/app/presets.test.ts` — SHARE-06 library structure, D-16, uniqueness, permalink round trip (created by 08-03 Task 1)
- [ ] `tests/app/presets.generated.test.ts` — SHARE-06 pinning test (created by 08-03 Task 3)
- [ ] `tests/app/scenarios-overlay.browser.test.ts` — SHARE-06 featured row, overlay, apply-and-permalink (created by 08-04 Task 3)
- [ ] `bench/perf-08-export.bench.test.ts` — roadmap criterion 4 measurement (created by 08-05 Task 2)
- [ ] `src/app/state.ts` export of `computeDerivedMetrics` — not a test file, but blocks every SHARE-06 test above (08-03 Task 1)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PNG capture renders correctly in real Safari, in both themes and both result modes | SHARE-04 | This repo's `app` project drives Chromium only (`vitest.config.ts`, `instances: [{ browser: 'chromium' }]`). WebKit applies a stricter security model to SVG `foreignObject` and does not guarantee synchronous decode of embedded content, so no automated signal in this repo proves the behaviour D-04's adoption rationale partly rests on. | Full steps are in `08-05-PLAN.md` Task 3, section A: build, serve, open in real Safari, export in light and dark, export in sweep mode with a committed crosshair, and confirm the heatmap canvas survived the capture. |
| The DCA preset's loading-state decision | SHARE-06 | The decision is a judgment on a measured figure, not a check on a fixed expectation: below one frame no state is needed, above 50ms the choice between adding UI-SPEC E3's `"Computing..."` state and changing the preset window is a design call. | `08-05-PLAN.md` Task 3, section B: read `dcaApplyMaxLongTaskMs` from Task 2's run output and record the decision with its reason. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or a blocking manual checkpoint (14 of 15 tasks carry `<automated>`; task 08-05-03 is the blocking Safari checkpoint, which by construction cannot be automated in this repo's Chromium-only matrix)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (every test file is created by the task that needs it, listed above)
- [x] No watch-mode flags in any verify command
- [x] Feedback latency under 30s for the `unit` project, under 90s for `app`
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
