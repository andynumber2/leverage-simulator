---
phase: 02-compiled-data-bundle
verified: 2026-08-17T22:03:24Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
mode_note: "ROADMAP.md marks this phase 'Mode: mvp' but the phase goal fails gsd-tools' user-story.validate check (it is not in 'As a X, I want Y, so that Z.' form). This is a non-user-facing infrastructure phase (CLI compiler, no UI), so MVP user-flow narrowing does not apply. Verified with standard goal-backward methodology against ROADMAP's five explicit Success Criteria instead of refusing outright, per the phase's own nature and the orchestrator's explicit instruction to verify against those criteria."
---

# Phase 2: Compiled Data Bundle Verification Report

**Phase Goal:** Every number the app will ever show traces back to a real, dated, sourced series, and adding a symbol is a CSV drop plus a recompile
**Verified:** 2026-08-17T22:03:24Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `compile-data ./raw ./public/data` turns raw CSVs into versioned binary assets plus a JSON manifest; adding a symbol is CSV drop + recompile, no code change | VERIFIED | Ran `npm run compile-data raw .verify-tmp-out`; output is **byte-identical** to committed `public/data/` (`diff -rq` reported no differences, including all content-hash filenames). `tools/bundle-compiler/tests/roundtrip.test.ts::"adding a third scope changes only the emitted set, not the code"` passes (part of 269/269 unit suite). |
| 2 | Compiler refuses to emit when a symbol's calendar disagrees with the rate series, naming offending dates, rather than forward-filling silently | VERIFIED | `tools/bundle-compiler/src/gap-policy.ts` implements three fatal classifications (extra bar, interior price gap, over-limit rate gap) each throwing with the offending date(s) named; `gap-policy.test.ts` (18 tests) exercises every branch including the exact-boundary edge cases (`RATE_CARRY_FORWARD_LIMIT_DAYS` and `+1`), all passing. `raw/calendar-exceptions.json` is the sole override (`[]` in the committed real bundle — no disagreements needed with real data). |
| 3 | Manifest carries per-series source, date range, exact seam dates; strict/extended tiers computed from seam records, not hand-declared | VERIFIED | Inspected `public/data/manifest.f0a9dfbdfa.json` directly: `SPX/total-return` carries 2 typed seams (`interpolation` 1927-12-30→1987-12-31, `splice` 1988-01-04) with kind/dates/sourceBefore/sourceAfter/method, and computed `tiers.strict.firstDate = "1988-01-05"` / `tiers.extended.firstDate = "1927-12-30"`, matching D-14/D-15 exactly. `tools/bundle-compiler/src/tiers.ts`'s `computeTierRanges` scans `SeamRecord.degradesToNonDaily`; no tier value is hand-typed anywhere in the codebase (grep confirms no other declaration). |
| 4 | Bundled universe covers S&P 500 (to 1928), Nasdaq-100/QQQ, UPRO/TQQQ/SSO/QLD, VTI/EFA/EEM/TLT, each PR+TR, plus a daily short-rate series | VERIFIED | Manifest lists 11 symbol assets (EEM, EFA, NDX, QLD, QQQ, SPX, SSO, TLT, TQQQ, UPRO, VTI), each with both `price-return` and `total-return` series, plus one shared `@rate/rate` asset and one shared calendar. Calendar `firstDate: "1927-12-30"` (S&P daily to 1928, per D-13's precedent). Rate series spans 1927-12-30→2026-08-14 with 7 seams splicing NBER→TB3MS→DTB3→DFF in precedence order. |
| 5 | Bench reports bundle byte size and decode time; decode fits PERF-08's 1000ms budget; round-trip test asserts exact match; content-hashed filenames prevent stale serving | VERIFIED | Ran `npm run bench -- --testNamePattern "bundle"` and `"DATA-BUNDLE-DECODE"` independently: `DATA-BUNDLE-BYTES = 726,806 bytes` (budget 1,125,000, pass) and `DATA-BUNDLE-DECODE = 0.01ms` (budget 100ms — the carved-out share of PERF-08b's 1000ms, pass). Both figures match 02-05-SUMMARY.md's claims exactly, independently reproduced, not merely trusted. `roundtrip.test.ts` asserts decoded values equal parsed CSV values exactly. `public/_headers` sets `Cache-Control: public, max-age=31536000, immutable` on `/data/*.bin` and `/data/manifest.*.json`; every asset filename and the manifest itself carry content hashes. |

**Score:** 5/5 ROADMAP success criteria verified (0 present-but-behavior-unverified).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tools/bundle-compiler/src/*.ts` | CLI compiler: binary format, calendar, gap policy, rate splicing, total-return construction, tiers, manifest, encode, compile, cli | VERIFIED | All files present, substantive (not stubs), exercised by 17 test files / 269 passing tests. `npm run typecheck` clean. |
| `tools/fetch-data/src/*.ts` | Fetch/normalize CLI for Yahoo/Nasdaq/FRED/Shiller | VERIFIED | `sources.ts` carries the 4-vendor/3-route table; `normalize.ts` implements all four normalizers plus D-24's reconstruction and D-25's drift gate; no Stooq code path remains anywhere under `tools/`, `src/`, `raw/`, `public/` (grep confirmed zero hits). |
| `public/data/*.bin`, `manifest.*.json` | The compiled real universe, committed | VERIFIED | 14 files present (calendar + rate + 11 symbols + manifest). Recompile from committed `raw/` reproduces every file byte-identically. |
| `src/data-bundle.generated.ts` | Pointer module (MANIFEST_PATH, BUNDLE_VERSION) | VERIFIED | `MANIFEST_PATH = '/data/manifest.f0a9dfbdfa.json'` and `BUNDLE_VERSION = '45a9f1ae6444'` match the committed manifest's own filename and `bundleVersion` field exactly. |
| `perf-budgets.ts` — `DATA-BUNDLE-BYTES`, `DATA-BUNDLE-DECODE` | Two gated bench rows, byte-unit-aware, no relaxation | VERIFIED | Both rows present with `thresholdMs === anchorMs` (no relaxation owed); `unit: 'bytes'` / `unit: 'ms'` correctly distinguishes them; compile-time exhaustiveness check (`tsc --noEmit`) passes. |
| `.github/workflows/ci.yml` | Recompile-determinism gate | VERIFIED | `npm run compile-data raw public/data && git diff --exit-code -- public/data src/data-bundle.generated.ts` runs on every CI job, proving shipped bytes are provably the compiler's output. |
| `raw/manual/*` | Vendor originals, committed (D-26) | VERIFIED | 14 files present (`GSPC.json`, `SP500TR.json`, `NDX.json`, `XNDX.csv`, `QQQ.json`, `VTI.json`, `EFA.json`, `TLT.json`, `EEM.json`, `SSO.json`, `QLD.json`, `UPRO.json`, `TQQQ.json`, `SPX-DIV-MONTHLY.csv`). `ie_data.xls` correctly absent per the documented decision. `git status` clean. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `raw/*.csv` + `.meta.json` | `public/data/*.bin` + `manifest.*.json` | `npm run compile-data raw public/data` | WIRED | Independently re-ran; output byte-identical to committed bundle. |
| `tools/fetch-data` normalizers | `tools/bundle-compiler`'s `loadSidecarOrThrow` | Every committed sidecar validates against the compiler's own strict loader | WIRED | Confirmed via passing `normalize.test.ts` and `tools/bundle-compiler` sidecar-loading tests against the real committed files (part of the 269-test suite). |
| `src/data-bundle.generated.ts` | `public/data/manifest.*.json` | `MANIFEST_PATH` string literal | WIRED | Filename and `BUNDLE_VERSION` match the manifest exactly (cross-checked by hand). |
| `perf-budgets.ts` budget rows | `bench/bundle-bytes.ts`, `bench/decode-time.bench.test.ts` | `budgetId` lookup in `assertRunInvariants` | WIRED | Ran both bench tests; both report through the same run-level gate as every other budget row (`verdict=pass` printed in the shared table format). |

### Prohibitions (must_haves.prohibitions)

| Prohibition | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| MUST NOT store Yahoo's back-adjusted `adjclose` as the total-return series | 02-06 | VERIFIED (resolved) | `normalize.ts:73` doc comment: "consumed only by ... `measureReconstructionDrift`, never stored directly (D-24)." `reconstructYahooTotalReturn` builds the series from `close` + dividend events via the D-24 recurrence; `adjCloses` only feeds the drift-gate comparison. |
| MUST NOT resolve a vendor export defect (Nasdaq's zero-valued rows) through `raw/calendar-exceptions.json` | 02-07 | VERIFIED (resolved) | Committed `raw/calendar-exceptions.json` is `[]`. The two zero-valued Nasdaq rows are dropped inside `normalizeNasdaq` itself, reported by date on every run, per 02-07-SUMMARY.md and confirmed present in `normalize.ts`. |
| MUST NOT rewrite or delete the record that Stooq was chosen, served a dividend-adjusted column under a price label, and was caught by a second-vendor cross-check | 02-08 | VERIFIED (resolved) | `.planning/PROJECT.md`'s two Stooq rows are prefixed `SUPERSEDED (D-28)` with pointers to their replacements; rationale text intact (only a single em-dash-to-comma punctuation substitution, per CLAUDE.md's no-em-dash rule, documented as a deviation in 02-08-SUMMARY.md). |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| DATA-01 | 02-01, 02-05 | CLI compiler emits versioned assets + manifest; adding a symbol = CSV drop + recompile | SATISFIED | Verified above (Truth 1). REQUIREMENTS.md checkbox is `[x]`. |
| DATA-02 | 02-02 | Compiler aligns calendars, fails loudly on misalignment | SATISFIED (functionally) — **REQUIREMENTS.md checkbox stale** | Verified above (Truth 2) with passing tests and code inspection. `02-02-SUMMARY.md` declares `requirements-completed: [DATA-02]`, but `.planning/REQUIREMENTS.md` line 61 still reads `[ ] **DATA-02**` and its coverage table (line 289) still says "Pending." Traced via `git log`: the commit that should have flipped this checkbox (`bc9283d`, 02-02's own summary commit) only added the SUMMARY file and never touched REQUIREMENTS.md; the later commit `e65adf0` (02-04's summary) flipped DATA-03/04/05/06 but left DATA-02 untouched. This is a documentation bookkeeping miss, not a functional gap — see the Gaps Summary below for the recommended fix. |
| DATA-03 | 02-04, 02-06, 02-07 | Per-symbol price-return + total-return series | SATISFIED | Verified above (Truth 4). Checkbox `[x]`. |
| DATA-04 | 02-04 | Daily short-rate series covering every tier's full range | SATISFIED | Verified above (Truth 4, rate series spans 1927-12-30→2026-08-14). Checkbox `[x]`. |
| DATA-05 | 02-04 | Strict + extended tiers, computed not declared | SATISFIED | Verified above (Truth 3). Checkbox `[x]`. |
| DATA-06 | 02-01, 02-04, 02-06, 02-07, 02-08 | Machine-readable provenance per series | SATISFIED | Verified above (Truth 3, `sources` array on every series). Checkbox `[x]`. |
| DATA-07 | 02-03, 02-05, 02-06, 02-07, 02-08 | Universe coverage (S&P, NDX/QQQ, UPRO/TQQQ/SSO/QLD, VTI/EFA/EEM/TLT) | SATISFIED | Verified above (Truth 4). Checkbox `[x]`. |
| DATA-09 | 02-01, 02-05 | Content-versioned assets, no stale-cache risk | SATISFIED | Verified above (Truth 5, `_headers` + content-hashed filenames + `BundleVersionMismatchError` decode-time check). Checkbox `[x]`. |

No orphaned requirements: REQUIREMENTS.md's Phase 2 mapping (DATA-01 through DATA-07, DATA-09) is exactly the set declared across the eight plans' `requirements` frontmatter. DATA-08 correctly belongs to Phase 4 and is out of this phase's scope.

### Anti-Patterns Found

None blocking. `grep` for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER|not yet implemented|not available|coming soon` across every file touched by this phase's plans returned zero real hits (`PLACEHOLDER_BUNDLE_VERSION` is a legitimate identifier for the documented two-pass encode design, not a debt marker).

Three Warning-severity and three Info-severity findings from `02-REVIEW.md` (0 Critical) remain open and are worth tracking as non-blocking follow-up, not phase-blocking gaps:
- WR-01: `buildTotalReturnSeries` has no explicit precondition check when a price series doesn't reach the real total-return series' own first date (fails loudly via a `Number.isFinite` guard today, but with a less-direct error message).
- WR-02: `splitCsvFields` doesn't handle RFC4180 `""`-escaped quotes (latent; no committed vendor file exercises this path).
- WR-03: `applyGapPolicy`'s doc comment overstates "one run names every violation" — true only within one classification tier, not across all three.
- IN-01/IN-02/IN-03: all explicitly self-documented as no-action-needed by the reviewer.

### Behavioral Spot-Checks / Reproduced Measurements

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `npm run typecheck` | `tsc --noEmit` | Clean, no output | PASS |
| Full unit suite | `npm test -- --project unit` | 17 files, 269/269 tests passed | PASS |
| Recompile determinism | `npm run compile-data raw .verify-tmp-out` then `diff -rq public/data .verify-tmp-out` | Identical (no output from diff) | PASS |
| Bundle byte-size bench | `npm run bench -- --testNamePattern bundle` | `DATA-BUNDLE-BYTES 726806.00bytes / 1125000bytes verdict=pass` | PASS |
| Decode-time bench | `npm run bench -- --testNamePattern DATA-BUNDLE-DECODE` | `DATA-BUNDLE-DECODE 0.01ms / 100ms verdict=pass` | PASS |
| CI recompile gate present | inspected `.github/workflows/ci.yml` | `compile-data` + `git diff --exit-code` step present | PASS |
| No Stooq remnants | `grep -rli stooq tools/ src/ raw/ public/` | No hits | PASS |

`npm run fetch-data` was deliberately **not** re-run (it hits live vendor endpoints per the task's own guidance); its committed outputs were verified instead via the round-trip recompile and the full test suite, which exercises `normalize.ts`, `cross-check.test.ts` and the sidecar validators against the real committed `raw/` files.

### Human Verification Required

None. This phase produces a build-time CLI pipeline with no UI and no runtime browser behavior beyond the already-measured decode bench; every claim was independently reproducible from the command line.

### Gaps Summary

No gaps block the phase goal. One documentation-only inconsistency was found and should be corrected as a trivial follow-up, not a re-execution:

- **REQUIREMENTS.md's DATA-02 checkbox and coverage-table row were never flipped to complete**, even though plan 02-02 fully implements and tests DATA-02 (calendar alignment, fail-loud gap policy, `calendar-exceptions.json` override mechanism) and its own SUMMARY declares `requirements-completed: [DATA-02]`. Recommended fix: change `.planning/REQUIREMENTS.md` line 61 from `- [ ] **DATA-02**` to `- [x] **DATA-02**` and its coverage-table row (line 289) from `| DATA-02 | Phase 2 | Pending |` to `| DATA-02 | Phase 2 | Complete |`. This is a one-line docs correction; DATA-02's functionality is verified working above.

---

_Verified: 2026-08-17T22:03:24Z_
_Verifier: Claude (gsd-verifier)_
