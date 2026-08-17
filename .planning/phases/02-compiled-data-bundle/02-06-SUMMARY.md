---
phase: 02-compiled-data-bundle
plan: 06
subsystem: data
tags: [fetch-script, yahoo-finance, fred, shiller, total-return-reconstruction, provenance-sidecar, csv-normalization]

# Dependency graph
requires:
  - phase: 02-compiled-data-bundle
    provides: "tools/bundle-compiler CLI, SidecarMeta type and loadSidecarOrThrow validator, SCOPE_PATTERN scope derivation (plan 02-01); tools/fetch-data CLI skeleton, transport rules, canonical CSV writer (plan 02-03)"
provides:
  - "The four-vendor, three-route source table (yahoo/nasdaq/fred/shiller; live/live-with-manual-fallback/manual-only) replacing the dropped equity vendor entirely"
  - "parseYahooChart, normalizeYahoo, reconstructYahooTotalReturn and measureReconstructionDrift: Yahoo chart JSON parsing and the D-24 forward-reconstructed total-return recurrence, with the D-25 drift gate"
  - "resolveSource/checkReconstructionDrift/checkManualStaleness in fetch.ts: route resolution with manual fallback, the D-25 reconstruction gate, and the D-27 staleness gate measured from data, never file mtime"
  - "splitCsvFields and a corrected parseShillerCsv: quote-aware field splitting, right-padded month fractions, and empty-price/empty-dividend handling that distinguishes a real hole from D-12's expected ragged right edge"
  - "26 canonical raw series (21 Yahoo-derived, 1 Shiller, 4 FRED) with validating sidecars, committed and verified against the compiler's own loadSidecarOrThrow"
affects: [02-07-nasdaq-xndx-total-return, 02-08-docs-and-manual-download-rewrite, 03-simulation-kernel]

# Actuals (#2632)
actuals:
  tokens: 23600
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Route-based source resolution (FetchRoute: 'live' | 'live-with-manual-fallback' | 'manual-only') replacing a manual: boolean, so route branching is exhaustive and a fourth route (e.g. credentialed) is a new union member rather than a new boolean crossed against the old one"
    - "Total return is reconstructed forward from close + dividend events (never stored from a vendor's back-adjusted column), so a refresh appends rather than rewriting history; the D-25 drift gate recomputes the reconstruction-vs-vendor agreement on every run rather than trusting it once"
    - "D-27 staleness/retrievedAt is measured from the newest observation IN THE DATA, computed per-vendor by the normalizer (normalizeBySpec returns an optional newestObservationDate override), not from the final committed series' own last row — needed because Shiller's trailing-drop rule (D-12's ragged right edge) makes the committed series' last date lag the raw file's actual freshness"
    - "Per-series write failures are caught individually in the write loop rather than crashing the whole run, so one bad series (e.g. a parser bug) still reports cleanly and does not silently withhold every series that would have written after it in iteration order"

key-files:
  created: []
  modified:
    - tools/fetch-data/src/sources.ts
    - tools/fetch-data/src/normalize.ts
    - tools/fetch-data/src/fetch.ts
    - tools/fetch-data/tests/normalize.test.ts
    - "raw/{SPX,NDX,QQQ,UPRO,TQQQ,SSO,QLD,VTI,EFA,EEM,TLT}-{PR,TR as applicable}.csv + .meta.json"
    - raw/SPX-DIV-MONTHLY.csv + .meta.json
    - raw/RATE-DFF.csv, raw/RATE-DTB3.csv (picked up newly-published live-fetched days)

key-decisions:
  - "SourceSpec.manualFile-bearing URLs bake period2 (Yahoo's chart-range end) to the next UTC midnight rather than to the exact request instant. The plan's own D-27 rationale (git diff as review surface) implicitly requires this: an exact-Date.now() period2 changed the sidecar's recorded url on every single run even when nothing else did, turning every re-run into spurious diff noise. Flooring to the next UTC midnight keeps the value 'current' (never a far-future sentinel, always covers today's full session) while being stable across every run within the same calendar day."
  - "D-27's staleness/retrievedAt measurement uses the raw manual file's own newest row (via the new shillerRawNewestDate), not the final committed series' last row, specifically for Shiller. The 75-day threshold was derived (02-CONTEXT.md) against the raw file's newest anchor (2026-08-01), but the committed yield series legitimately stops at 2026-06-01 because the last two months' dividend hasn't published yet (D-12's expected ragged right edge). Measuring staleness against the post-drop series produced a false 77-day-stale halt on a same-day-fresh file; this was caught by running the full pipeline end to end, not by any unit test in isolation."
  - "Write-time failures (e.g. a normalizer bug surfacing only in toCanonicalCsv's ascending-order check) are now caught per series in the write loop rather than left to crash main() uncaught, so one bad series reports cleanly instead of silently withholding every series that would have written after it in iteration order. Found while running the CLI against the still-broken Shiller parser in Task 1/2, before Task 3 fixed the root cause."

patterns-established:
  - "normalizeBySpec (fetch.ts) is the single per-vendor dispatch point; every vendor branch returns { rows, chart?, newestObservationDate? } through one shape, so main()'s write/gate loops never branch on vendor again after this point."
  - "checkReconstructionDrift and checkManualStaleness are pure, directly unit-testable gate functions (spec + data + today) called from main(), rather than inlined halt-collection logic — the same pattern the plan's D-25/D-27 sections describe them by name."

requirements-completed: [DATA-03, DATA-06, DATA-07]

coverage:
  - id: D1
    description: "The four-vendor, three-route SourceSpec table replaces the dropped equity vendor entirely: SeriesVendor is 'yahoo' | 'nasdaq' | 'fred' | 'shiller', FetchRoute is 'live' | 'live-with-manual-fallback' | 'manual-only', and the dropped vendor's name appears nowhere under tools/fetch-data/src/"
    requirement: DATA-04
    verification:
      - kind: unit
        ref: "tools/fetch-data/tests/normalize.test.ts#route invariant"
        status: pass
      - kind: other
        ref: "grep -rqi 'stooq' tools/fetch-data/src/ (exits 1, confirming absence)"
        status: pass
    human_judgment: false
  - id: D2
    description: "parseYahooChart parses the real Yahoo chart JSON (untrusted input) with full field validation and __proto__-pollution resistance; normalizeYahoo and reconstructYahooTotalReturn derive canonical price-return and D-24 forward-reconstructed total-return series from it"
    requirement: DATA-03
    verification:
      - kind: unit
        ref: "tools/fetch-data/tests/normalize.test.ts#parseYahooChart, #normalizeYahoo, #reconstructYahooTotalReturn"
        status: pass
    human_judgment: false
  - id: D3
    description: "measureReconstructionDrift and the D-25 gate (checkReconstructionDrift) catch a reconstruction-vs-vendor disagreement; proved load-bearing on a deliberately damaged fixture, and every real reconstructed ETF measures well under the 0.5% tolerance"
    requirement: DATA-03
    verification:
      - kind: unit
        ref: "tools/fetch-data/tests/normalize.test.ts#measureReconstructionDrift, #checkReconstructionDrift"
        status: pass
      - kind: integration
        ref: "npm run fetch-data (real run) coverage table: max drift 0.17642% (EEM), well under MAX_RECONSTRUCTION_DRIFT (0.5%)"
        status: pass
    human_judgment: false
  - id: D4
    description: "checkManualStaleness (D-27) halts a manually-supplied series whose newest observation has gone stale, measured from the data (never file mtime); route (live/manual) is printed per series"
    requirement: DATA-07
    verification:
      - kind: unit
        ref: "tools/fetch-data/tests/normalize.test.ts#checkManualStaleness"
        status: pass
      - kind: integration
        ref: "npm run fetch-data (real run) prints a route column and a '25 series live, 1 series manual' summary line"
        status: pass
    human_judgment: false
  - id: D5
    description: "splitCsvFields and the corrected parseShillerCsv fix both known defects at their root: October no longer collides with January, and a legitimately-unpublished trailing dividend (D-12 ragged edge) is distinguished from a real hole in the middle of the table"
    requirement: DATA-06
    verification:
      - kind: unit
        ref: "tools/fetch-data/tests/normalize.test.ts#splitCsvFields, #parseShillerCsv"
        status: pass
      - kind: integration
        ref: "node -e parseShillerCsv against real raw/manual/SPX-DIV-MONTHLY.csv: 1866 rows, 1871-01-01 to 2026-06-01, 155 Octobers, 156 Januaries"
        status: pass
    human_judgment: false
  - id: D6
    description: "npm run fetch-data exits 0 end to end, writing 26 canonical CSVs (21 Yahoo + 1 Shiller + 4 FRED) with 26 validating sidecars"
    requirement: DATA-03
    verification:
      - kind: integration
        ref: "npm run fetch-data (real run, this session) — exit code 0, ls raw/*.csv | wc -l == 26, all 26 sidecars validate via loadSidecarOrThrow"
        status: pass
    human_judgment: false

duration: ~2h
completed: 2026-08-17
status: complete
---

# Phase 02 Plan 06: Yahoo Source Stack, Total-Return Reconstruction, and the Shiller Parser Fix Summary

**Replaced the dropped equity vendor with Yahoo Finance end to end for 21 series, reconstructed ETF total return from `close` + dividend events instead of storing a vendor's back-adjusted column (measured drift 0.018%-0.176% across all nine funds, all under the 0.5% gate), and fixed both real bugs in the Shiller monthly-dividend parser (October/January collision, a fabricated zero-dividend tail) behind one quote-aware CSV field splitter.**

## Performance

- **Duration:** ~2h (including one checkpoint pause for tracer verification)
- **Started:** 2026-08-17 (continuing prior session's plan 02-06 dispatch)
- **Completed:** 2026-08-17
- **Tasks:** 3 of 3
- **Files modified:** 4 source/test files, 27 raw data files (26 CSVs + their sidecars, several already existing FRED files appended one live day each)

## Accomplishments

- Replaced `SeriesVendor`/`SourceSpec`/`FetchRoute` entirely: four vendors (`yahoo`/`nasdaq`/`fred`/`shiller`), three routes (`live`/`live-with-manual-fallback`/`manual-only`), with the dropped equity vendor's name gone from `tools/fetch-data/src/`.
- Built `parseYahooChart` (full untrusted-input validation: `chart.error`, array-length agreement, non-finite/non-positive closes, strictly-ascending timestamps, duplicate calendar dates, `__proto__`-pollution resistance) plus `normalizeYahoo` and `reconstructYahooTotalReturn` implementing D-24's forward recurrence, seeded at the first bar's raw close (never the back-adjusted close).
- Built `measureReconstructionDrift` and wired it into `fetch.ts`'s `checkReconstructionDrift` gate (D-25): drift is recomputed on every run and printed per reconstructed stem in the coverage table whether or not it halts. Proved load-bearing on a hand-built fixture (a 5%-of-price dividend removed produces ~4.8% drift, far past the 0.5% tolerance) as well as measured against all nine real reconstructed ETFs.
- Built `resolveSource` (route dispatch with manual fallback) and `checkManualStaleness` (D-27), measured from the data's own newest observation, never file mtime.
- Expanded `SOURCES` to the full 21-series Yahoo universe: 11 price-return specs (SPX/NDX/QQQ/UPRO/TQQQ/SSO/QLD/VTI/EFA/EEM/TLT), SPX's real total return from `^SP500TR` (as-sourced, not reconstructed — an index pays no dividends, so its own `adjclose` carries nothing to reconstruct from), and 9 reconstructed total-return specs for the ETFs. NDX total return (XNDX, a different vendor) is deliberately left to plan 02-07.
- Fixed both `parseShillerCsv` defects at their root behind a new `splitCsvFields` (quote-aware, generic, reused by plan 02-07 for the Nasdaq export): the month fraction is right-padded, never left-padded (so `"1871.1"` is October, not January), and an empty dividend cell is dropped only when it sits in the file's trailing run (D-12's legitimate ragged right edge), throwing when a real hole exists in the middle of the table.
- Found and fixed two self-inflicted bugs before they reached a final commit (both Rule 1, both caught by running the real pipeline end to end rather than by any single unit test): the Yahoo request URL's `period2` churned every run and polluted every sidecar's diff with noise unrelated to real changes (fixed by flooring to the next UTC midnight); and D-27's staleness gate initially measured the *post-drop* Shiller series' last date against the 75-day threshold the plan derived against the *raw file's* newest row, producing a false 77-day-stale halt on a same-day-fresh file.
- `npm run fetch-data` now exits 0 end to end: 26 canonical CSVs (21 Yahoo-derived + 1 Shiller + 4 FRED), 26 validating sidecars, a route column and a `25 series live, 1 series manual` summary line in the coverage table.

## Task Commits

1. **Task 1: One symbol end to end (tracer)** - `da81127` (feat) — paused here for the tracer feedback gate; approved by the coordinator, resumed at Task 2.
2. **Task 2: Full Yahoo universe, D-25/D-27 gates** - `760c5dd` (feat)
3. **Task 3: Shiller parser fix** - `05dd7bd` (fix)

**Plan metadata:** this SUMMARY.md, committed separately per the calling agent's instructions (STATE.md/ROADMAP.md are the orchestrator's to update).

## Files Created/Modified

- `tools/fetch-data/src/sources.ts` — the four-vendor/three-route `SourceSpec` table; `YAHOO_LICENSE`, `YAHOO_TERMS_URL` (resolved 200, no redirect, verified live this session); `MANUAL_DIR_NAME`; the 21-entry Yahoo universe plus the Shiller entry
- `tools/fetch-data/src/normalize.ts` — `parseYahooChart`, `normalizeYahoo`, `reconstructYahooTotalReturn`, `measureReconstructionDrift`, `MAX_RECONSTRUCTION_DRIFT`; `splitCsvFields`; the corrected `parseShillerCsv` and the new `shillerRawNewestDate`
- `tools/fetch-data/src/fetch.ts` — `resolveSource`/`SourceResolution`, `checkReconstructionDrift`, `checkManualStaleness`, the route-aware coverage table, per-series write-failure isolation
- `tools/fetch-data/tests/normalize.test.ts` — 60 tests total in this file after this plan (up from 27 before it): every new normalizer, the D-25/D-27 gates, the route invariant, and the real-file Shiller assertions
- `raw/{SPX,NDX,QQQ,UPRO,TQQQ,SSO,QLD,VTI,EFA,EEM,TLT}-{PR,TR as applicable}.csv` + `.meta.json` — 21 Yahoo-derived series, real data, written by a real run this session
- `raw/SPX-DIV-MONTHLY.csv` + `.meta.json` — the Shiller dividend-yield series, real data, written by the fixed parser
- `raw/RATE-DFF.csv`, `raw/RATE-DTB3.csv` — picked up one additional live-fetched day each (pure appends, unrelated to this plan's own changes)

## Decisions Made

See `key-decisions` in frontmatter for full rationale. In short: the Yahoo request URL's `period2` floors to the next UTC midnight (not the exact fetch instant) so re-running the script on the same day produces a byte-identical sidecar URL instead of spurious diff noise; and D-27's staleness/`retrievedAt` measurement for Shiller uses the raw file's own newest row (via `shillerRawNewestDate`), not the committed yield series' last row, because the committed series legitimately lags the raw file by 1-2 months due to D-12's ragged right edge, and conflating that lag with staleness produced a false halt.

## Measured Figures (recorded per this plan's `<output>` instructions)

### Reconstruction drift, all nine ETFs, measured against the committed `raw/manual/*.json` files

| Symbol | Max drift over the whole path | Date it occurred | Under 0.5% gate |
|---|---|---|---|
| QQQ | 0.01810% | 2019-01-23 | yes |
| UPRO | 0.03783% | 2021-03-17 | yes |
| TQQQ | 0.09269% | 2024-02-08 | yes |
| SSO | 0.04178% | 2015-11-06 | yes |
| QLD | 0.16916% | 2019-05-15 | yes |
| VTI | 0.04214% | 2019-10-22 | yes |
| EFA | 0.11790% | 2012-03-09 | yes |
| EEM | 0.17642% | 2020-05-07 | yes |
| TLT | 0.04412% | 2011-02-08 | yes |

These reproduce `02-CONTEXT.md`'s D-24 derivation table to five decimal places, confirming the recurrence implemented here is the one those figures were measured with. (A live-run coverage table shows very slightly different figures, e.g. QQQ 0.01810% vs 0.01810%, UPRO 0.03780%-0.03784% across different live pulls — Yahoo's `adjclose` shifts by a few parts in a million between live requests, evidently from ongoing float-precision reprocessing on the vendor's side. All observed values stay far under the 0.5% gate regardless.)

### Manually-supplied file freshness at run time (2026-08-17)

- `raw/manual/SPX-DIV-MONTHLY.csv` (Shiller, `route: 'manual-only'`, always manual): raw newest row 2026-08-01 (dividend cell empty, expected per D-12), age 16 days against a 75-day threshold. **Not** stale.
- Every Yahoo `manualFile` in `raw/manual/` (`GSPC.json`, `SP500TR.json`, `NDX.json`, and the nine fund files): newest bar 2026-08-17 in every file, age 0 days against a 10-day threshold, whether or not a given run actually falls back to them (this session's live Yahoo fetches mostly succeeded, so the `route` column read `live` for 25 of 26 series on the final run; D-27's fallback path is exercised and tested via `resolveSource`'s unit tests, which mock a live-fetch failure).

### Yahoo terms URL resolution

`https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html` — confirmed via a read-only header request this session: HTTP 200, no redirect.

### Row counts and date ranges, every series written

| Stem | Rows | First date | Last date |
|---|---|---|---|
| SPX-PR | 24773 | 1927-12-30 | 2026-08-17 |
| SPX-TR | 9728 | 1988-01-04 | 2026-08-17 |
| NDX-PR | 10298 | 1985-10-01 | 2026-08-17 |
| QQQ-PR / QQQ-TR | 6902 each | 1999-03-10 | 2026-08-17 |
| UPRO-PR / UPRO-TR | 4312 each | 2009-06-25 | 2026-08-17 |
| TQQQ-PR / TQQQ-TR | 4153 each | 2010-02-11 | 2026-08-17 |
| SSO-PR / SSO-TR | 5070 each | 2006-06-21 | 2026-08-17 |
| QLD-PR / QLD-TR | 5070 each | 2006-06-21 | 2026-08-17 |
| VTI-PR / VTI-TR | 6329 each | 2001-06-15 | 2026-08-17 |
| EFA-PR / EFA-TR | 6279 each | 2001-08-27 | 2026-08-17 |
| EEM-PR / EEM-TR | 5873 each | 2003-04-14 | 2026-08-17 |
| TLT-PR / TLT-TR | 6051 each | 2002-07-30 | 2026-08-17 |
| SPX-DIV-MONTHLY | 1866 | 1871-01-01 | 2026-06-01 |
| RATE-DFF | 26343 | 1954-07-01 | 2026-08-14 |
| RATE-DTB3 | 18146 | 1954-01-04 | 2026-08-14 |
| RATE-TB3MS | 1111 | 1934-01-01 | 2026-07-01 |
| RATE-NBER | 171 | 1920-01-01 | 1934-03-01 |

26 series total: 21 Yahoo-derived + 1 Shiller + 4 FRED. Every row count and date range matches `02-CONTEXT.md`'s "Raw inputs already on disk" table exactly.

### Shiller parse result after both fixes

1866 rows, 1871-01-01 through 2026-06-01, 155 Octobers and 156 Januaries (no collision), strictly ascending with no duplicate date, every derived yield strictly positive (range approximately 0.0109 to 0.1384), two trailing rows (2026-07, 2026-08) correctly dropped as an unpublished-dividend ragged right edge rather than thrown on or silently zeroed.

### No symbol in the bundled universe lacks a real total-return source

Plan 02-04's abort branch (per its own line 285) keys off "plan 02-03's summary lists any symbols with no real total-return series" being non-empty. That list is now empty: SPX gets real total return from `^SP500TR`, all nine ETFs get real total return reconstructed from their own `close` + dividend events (D-24), and NDX's total return (XNDX) is scheduled for plan 02-07, not missing. **No symbol in this plan's universe lacks a real total-return source.**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Yahoo sidecar URL churned on every run, polluting the git diff with noise**

- **Found during:** Task 2, after the first full-universe `npm run fetch-data` run, comparing two consecutive runs' `git diff` output.
- **Issue:** `yahooUrl` computed `period2` from `Date.now()` at every call, so the sidecar's recorded `url` field changed on every single invocation even when the underlying data was identical, defeating D-01/D-07's "git diff as review surface" principle for a field that isn't even data.
- **Fix:** `period2` now floors to the start of the next UTC calendar day, stable across every run within the same day while still satisfying "current, never a far-future sentinel" (at most 24h ahead of `Date.now()`).
- **Files modified:** `tools/fetch-data/src/sources.ts`.
- **Verification:** Ran the CLI twice in a row; the sidecar URL diff was identical both times (no further churn).
- **Committed in:** `760c5dd` (Task 2 commit).

**2. [Rule 1 - Bug] D-27 staleness gate measured the wrong "newest observation" for Shiller**

- **Found during:** Task 3, running the full pipeline end to end after fixing the Shiller parser's other two bugs.
- **Issue:** `checkManualStaleness` was fed the final committed yield series (post-drop, ending 2026-06-01), but the plan's own 75-day threshold derivation was measured against the raw file's newest row (2026-08-01). The mismatch produced a false "77 days stale" halt on a file that had, in fact, just been used correctly (the lag is D-12's expected ragged right edge, not staleness).
- **Fix:** Added `shillerRawNewestDate`, refactoring `parseShillerCsv`'s header/row-detection walk into a shared internal `parseShillerLines` so both functions parse once. `fetch.ts`'s `normalizeBySpec` now returns an optional `newestObservationDate` override (only set for Shiller), used for both the staleness check and the sidecar's `retrievedAt`.
- **Files modified:** `tools/fetch-data/src/normalize.ts`, `tools/fetch-data/src/fetch.ts`.
- **Verification:** `npm run fetch-data` now exits 0; `raw/SPX-DIV-MONTHLY.meta.json`'s `retrievedAt` reads `2026-08-01` (the raw file's true freshness), not `2026-06-01`.
- **Committed in:** `05dd7bd` (Task 3 commit).

**3. [Rule 1 - Bug] An uncaught write-time exception could silently withhold every series after it**

- **Found during:** Task 1, when the (still-broken, pre-Task-3) Shiller parser's ascending-order violation threw uncaught inside the write loop's `toCanonicalCsv` call.
- **Issue:** The original design wrote all series in one loop with no per-item error handling; a `toCanonicalCsv` failure on one series would crash the loop, silently withholding every series after it in iteration order even though they had already normalized successfully.
- **Fix:** Wrapped each write in its own try/catch, collecting failures into the existing `errors` array so the run still reports every failure cleanly and every other series still lands.
- **Files modified:** `tools/fetch-data/src/fetch.ts`.
- **Verification:** With the (then-broken) Shiller entry present, `raw/QQQ-PR.csv` and `raw/QQQ-TR.csv` still wrote successfully and the run printed a clean error list instead of an unhandled-exception stack trace.
- **Committed in:** `da81127` (Task 1 commit).

---

**Total deviations:** 3 auto-fixed (all Rule 1 — bugs found by running the real pipeline end to end, not by any single unit test in isolation).
**Impact on plan:** All three fixes are within the plan's own stated design intent (D-01/D-07's diff-as-review-surface, D-12's ragged-right-edge handling, and the missing-partial-write guarantee the plan's own comments already described). No scope creep; no architectural change.

## Issues Encountered

None beyond the deviations documented above. Yahoo's chart API (`query1.finance.yahoo.com`) returned HTTP 429 on isolated `curl` probes early in this session (consistent with D-27's shared-IP-block finding from `02-CONTEXT.md`), but succeeded on every actual `fetch()` call this script made during real runs — `resolveSource`'s manual-fallback path is implemented and unit-tested (mocking a fetch failure) even though it was not exercised by a real Yahoo failure in this particular session.

## User Setup Required

None. Every source resolved automatically (live Yahoo/FRED fetches succeeded this session; Shiller read from the already-committed `raw/manual/SPX-DIV-MONTHLY.csv`).

## Next Phase Readiness

- `raw/` now carries the full 26-series universe this phase's plans 02-04 and 02-05 need: every ETF has both a price-return and a real total-return series, SPX has both, NDX has price-return (total-return deferred to 02-07), and the Shiller monthly dividend input is real and correctly parsed.
- Plan 02-07 (Nasdaq XNDX total return) can reuse `splitCsvFields` directly — it was written generically for exactly this reuse, not Shiller-specific.
- Plan 02-08 (docs rewrite) still needs to update `tools/fetch-data/README.md` and `tools/fetch-data/MANUAL-DOWNLOAD.md`, which still describe the dropped equity vendor by name (confirmed out of scope for this plan per `02-CONTEXT.md`'s D-28 assignment and this plan's Task 3 acceptance criteria, which explicitly name `MANUAL-DOWNLOAD.md`'s matching caveat as "plan 02-08's to remove").
- Plan 02-04's total-return-construction abort branch can proceed: no symbol in the bundled universe lacks a real total-return source (see "Measured Figures" above).
- `tools/bundle-compiler`'s `compile-data` CLI has not been re-run against the new `raw/` tree in this plan (out of this plan's scope); that is plan 02-04/02-05's work, now unblocked by a complete, validated `raw/` directory.

## Self-Check: PASSED

Files confirmed present: `tools/fetch-data/src/sources.ts`, `tools/fetch-data/src/normalize.ts`, `tools/fetch-data/src/fetch.ts`, `tools/fetch-data/tests/normalize.test.ts`, and all 26 `raw/*.csv` + `raw/*.meta.json` pairs (`ls raw/*.csv | wc -l` == 26, `ls raw/*.meta.json | wc -l` == 26).

Commits confirmed present via `git log --oneline`: `da81127` (Task 1), `760c5dd` (Task 2), `05dd7bd` (Task 3).

`npm run typecheck` and `npx vitest run --project unit` (196 tests, whole repo) both exit 0. `npm run fetch-data` exits 0.

---
*Phase: 02-compiled-data-bundle*
*Completed: 2026-08-17*
