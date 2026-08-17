---
phase: 02-compiled-data-bundle
plan: 07
subsystem: data
tags: [fetch-script, nasdaq-index, total-return-cross-check, csv-normalization, standing-test]

# Dependency graph
requires:
  - phase: 02-compiled-data-bundle
    provides: "splitCsvFields (quote-aware CSV field splitter), parseYahooChart, normalizeNasdaq's sibling normalizers, and the 26-series raw tree (plan 02-06)"
provides:
  - "raw/NDX-TR.csv and raw/NDX-TR.meta.json: the Nasdaq-100 Total Return index (XNDX), the twenty-seventh and final raw series in the bundled universe"
  - "normalizeNasdaq, NasdaqNormalizeResult, MAX_NASDAQ_ZERO_ROWS: a fourth vendor's CSV normalizer with every export quirk (BOM, CRLF, descending dates, two-digit years, quoted thousands separators, a trailing all-empty line, two phantom zero-valued rows) named and counted"
  - "tools/fetch-data/tests/cross-check.test.ts: the standing S&P and Nasdaq-100 total-return-vs-price-return divergence checks, run against the committed vendor files on every test invocation, with a negative control"
affects: [02-04-total-return-construction, 02-05-bundle-compiler-run, 03-simulation-kernel]

# Actuals (#2632)
actuals:
  tokens: 6442
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A vendor export defect (a fabricated zero-valued row) is dropped in the fetch script's normalizer, never routed through the compiler's raw/calendar-exceptions.json override — that file is reserved for a real vendor bar on a date the reference calendar lacks, and using it for a defect would admit a fabricated 0.0 index level into a compiled series and then whitelist the date (D-03, D-10, D-11)"
    - "A drop is never silent: normalizeNasdaq returns every dropped date, the run prints it beneath that stem's coverage row, and exceeding a declared bound throws naming the count and the dates"
    - "The check that would have caught a mislabelled total-return series (first-shared-bar near-equality plus monotonic year-end divergence) is now a standing test against the committed vendor files, not a one-off session comparison, with a negative control proving it fires on a constructed counterexample"

key-files:
  created:
    - tools/fetch-data/tests/cross-check.test.ts
    - raw/NDX-TR.csv
    - raw/NDX-TR.meta.json
  modified:
    - tools/fetch-data/src/normalize.ts
    - tools/fetch-data/src/sources.ts
    - tools/fetch-data/src/fetch.ts
    - tools/fetch-data/tests/normalize.test.ts

key-decisions:
  - "Zero-valued rows in the Nasdaq export (today's not-yet-published placeholder and the 2012-10-29 Hurricane Sandy phantom bar) are dropped inside normalizeNasdaq itself, not admitted through raw/calendar-exceptions.json. The override file exists to accept a real vendor bar the reference calendar lacks; using it here would instead launder a fabricated 0.0 index level into the compiled series and then whitelist the date. Verified: git diff --exit-code -- raw/calendar-exceptions.json exits 0 after this plan's full run."
  - "The Nasdaq terms URL is https://indexes.nasdaqomx.com/Home/Disclaimer, confirmed live this session via a read-only header request: HTTP 200, no redirect. The index-history download page itself (https://indexes.nasdaqomx.com/Index/History/XNDX) also resolved 200 and is recorded as the spec's url field, per the pattern SourceSpec.url documents for a manual-only entry (the page a human visits, not a URL this script fetches)."

patterns-established:
  - "normalizeNasdaq follows the same nine-step contract documented in this plan's own <interfaces> section: strip BOM, split lines (reusing splitLines's CRLF handling), validate header by exact name match, split fields with splitCsvFields (reused from plan 02-06's Shiller parser), drop all-empty lines, parse M/D/YY dates with an explicit century pivot, strip thousands separators, drop and count zero-valued rows with a bounded throw, then reverse to ascending order and assert strict monotonicity."

requirements-completed: [DATA-03, DATA-06, DATA-07]

coverage:
  - id: D1
    description: "normalizeNasdaq parses the real committed raw/manual/XNDX.csv into 6905 rows from 1999-03-04 (value 1933.03) through 2026-08-14 (value 36683.4551509005), dropping exactly two zero-valued rows (2026-08-17, 2012-10-29) and reporting both"
    requirement: DATA-03
    verification:
      - kind: unit
        ref: "tools/fetch-data/tests/normalize.test.ts#normalizeNasdaq > against the real committed file"
        status: pass
      - kind: integration
        ref: "npm run fetch-data (real run): NDX-TR row in the coverage table, plus 'NDX-TR: dropped 2 zero-valued row(s): 2026-08-17, 2012-10-29' printed beneath it"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every export quirk (BOM, CRLF, quoted thousands separators, two-digit-year century pivot, header mismatch, monotonicity/duplicate violations, the MAX_NASDAQ_ZERO_ROWS bound) is covered by an isolated unit test, not only the real-file integration test"
    requirement: DATA-06
    verification:
      - kind: unit
        ref: "tools/fetch-data/tests/normalize.test.ts#normalizeNasdaq (11 tests: BOM strip, quoted-thousands parse, century pivot both directions, zero-row drop plus trailing-blank-line drop, MAX_NASDAQ_ZERO_ROWS bound, header mismatch, non-ascending/duplicate-after-reversal)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The compiler's calendar-exceptions override was not touched to resolve the zero-row defect"
    requirement: DATA-02
    verification:
      - kind: other
        ref: "git diff --exit-code -- raw/calendar-exceptions.json (exits 0 after a full npm run fetch-data)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Standing cross-checks: S&P total return vs S&P price (first shared bar 1988-01-04, 0.031252% relative, 39 year-ends, 0 decreases, final normalized ratio 2.2387) and Nasdaq-100 total return vs Nasdaq-100 price (first shared bar 1999-03-04, 0.000002% relative, 28 year-ends, 0 decreases, final normalized ratio 1.2209), both measured against the real committed raw/manual files, both matching this plan's <interfaces> table to the decimal places recorded there"
    requirement: DATA-07
    verification:
      - kind: unit
        ref: "tools/fetch-data/tests/cross-check.test.ts (5 tests: 2 per pair plus the negative control)"
        status: pass
    human_judgment: false
  - id: D5
    description: "npm run fetch-data exits 0 over the full twenty-seven-series raw tree; every sidecar validates through the compiler's own loadSidecarOrThrow"
    requirement: DATA-06
    verification:
      - kind: integration
        ref: "npm run fetch-data (real run, this session) — exit code 0, ls raw/*.csv | wc -l == 27, ls raw/*.meta.json | wc -l == 27, all 27 validate via loadSidecarOrThrow"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-08-17
status: complete
---

# Phase 02 Plan 07: Nasdaq-100 Total Return Index and the Cross-Check Standing Test Summary

**Closed the last hole in the raw tree with a fourth vendor's CSV normalizer (BOM, CRLF, descending two-digit-year dates, quoted thousands separators, a trailing blank line, and two named/counted zero-valued phantom rows), then committed the divergence check that would have caught the previous vendor's mislabelled total-return column as a standing test against the real committed vendor files.**

## Performance

- **Duration:** ~20min
- **Completed:** 2026-08-17
- **Tasks:** 2 of 2
- **Files modified:** 4 source/test files, 1 new test file, 2 new raw data files (NDX-TR.csv + sidecar)

## Accomplishments

- Built `normalizeNasdaq` (`tools/fetch-data/src/normalize.ts`) implementing the nine-step contract this plan's own `<interfaces>` section specified: strip a leading UTF-8 BOM, split lines via `splitLines` (already CRLF-aware), require the header to match `Trade Date,Index Value,Net Change,High,Low` exactly (locating date/value columns by name, not position), split each data line with `splitCsvFields` (reused unmodified from plan 02-06's Shiller parser — `grep -c splitCsvFields` now reports 5 uses in the file), drop a line whose every field is empty, parse `M/D/YY` dates with an explicit century pivot at 70, strip thousands separators before numeric conversion, drop and count zero-valued rows (throwing past `MAX_NASDAQ_ZERO_ROWS = 5`, naming the count and dates), then reverse to ascending order and assert strict monotonicity with no duplicate date.
- Added the `NDX-TR` `SourceSpec` (`tools/fetch-data/src/sources.ts`): vendor `'nasdaq'`, route `'manual-only'`, manual file `XNDX.csv`, staleness threshold 10 days (matching the other daily manual sources), expected first date `1999-03-04`. Removed the plan-02-06-era comment noting the total-return sibling was still to come.
- Wired the Nasdaq branch into `fetch.ts`'s `normalizeBySpec` dispatch and extended the coverage table to print every dropped date beneath its stem's row, so a drop is never silent.
- Committed `tools/fetch-data/tests/cross-check.test.ts`: the S&P and Nasdaq-100 total-return-vs-price-return divergence checks, reading `raw/manual/GSPC.json`/`SP500TR.json`/`NDX.json`/`XNDX.csv` directly (not fixtures), plus a negative control proving the check fires on a constructed pair whose total-return series is a copy of its price series.
- `npm run fetch-data` exits 0 over the full 27-series raw tree; `raw/calendar-exceptions.json` is unchanged; every sidecar validates through `loadSidecarOrThrow`.

## Task Commits

1. **Task 1: The Nasdaq-100 total-return index, with every export quirk named and counted** - `3d85e93` (feat)
2. **Task 2: Commit the check that caught the previous vendor as a standing test** - `5fe1df5` (test)

**Plan metadata:** this SUMMARY.md, committed separately per the calling agent's instructions (STATE.md/ROADMAP.md are the orchestrator's to update).

## Files Created/Modified

- `tools/fetch-data/src/normalize.ts` — `NasdaqNormalizeResult`, `normalizeNasdaq`, `MAX_NASDAQ_ZERO_ROWS`
- `tools/fetch-data/src/sources.ts` — `NASDAQ_LICENSE`, `NASDAQ_TERMS_URL`, `NASDAQ_VENDOR_NAME`, the `NDX_TR` spec
- `tools/fetch-data/src/fetch.ts` — Nasdaq vendor dispatch in `normalizeBySpec`, dropped-date printing in `printCoverageTable`
- `tools/fetch-data/tests/normalize.test.ts` — 11 new `normalizeNasdaq` tests (82 tests total in this file after this plan)
- `tools/fetch-data/tests/cross-check.test.ts` — new file, 5 tests: 2 per cross-check pair plus the negative control
- `raw/NDX-TR.csv` + `raw/NDX-TR.meta.json` — the twenty-seventh raw series, real data, written by a real run this session

## Decisions Made

See `key-decisions` in frontmatter. In short: the zero-row defect is a normalizer drop rule, not a calendar exception, for the reasons this plan's `<interfaces>` section states (T-02-33); and the Nasdaq terms URL (`https://indexes.nasdaqomx.com/Home/Disclaimer`) was confirmed live (HTTP 200, no redirect) rather than carried over from research.

## Measured Figures (recorded per this plan's `<output>` instructions)

### Nasdaq export, measured against the committed `raw/manual/XNDX.csv` this session

- Rows after normalization: **6905**, from **1999-03-04** (value `1933.03`) through **2026-08-14** (value `36683.4551509005`).
- Dropped dates: exactly two — `2026-08-17` (today's not-yet-published placeholder) and `2012-10-29` (the Hurricane Sandy phantom bar). Both printed on every `npm run fetch-data` run beneath the `NDX-TR` coverage row.
- Every figure matches this plan's `<interfaces>` table to the decimal places recorded there.

### Nasdaq terms URL resolution

`https://indexes.nasdaqomx.com/Home/Disclaimer` — confirmed via a read-only header request this session: HTTP 200, no redirect. (The index-history download page, `https://indexes.nasdaqomx.com/Index/History/XNDX`, also resolved 200 and is recorded as the spec's `url` field.)

### Measured age of every manually-supplied file at run time (2026-08-17)

- `raw/manual/XNDX.csv` (Nasdaq, `route: 'manual-only'`, always manual): newest observation `2026-08-14`, age 3 days against the 10-day threshold. Not stale — this is the vendor's normal publication lag.

### Standing cross-checks, measured against the committed vendor files

| Pair | First shared bar | Price value | Total-return value | Relative difference | Year-end ratio decreases | Final normalized ratio |
|---|---|---|---|---|---|---|
| S&P total return vs S&P price | 1988-01-04 | 255.94000244140625 | 256.0199890136719 | 0.031252% | 0 across 39 year-ends | 2.2387 |
| Nasdaq-100 total return vs Nasdaq-100 price | 1999-03-04 | 1933.030029296875 | 1933.03 | 0.000002% | 0 across 28 year-ends | 1.2209 |

Both rows match this plan's `<interfaces>` table exactly, confirming the test implementation computes the same divergence this plan's planning session measured. The negative control (a total-return series copied from its price series) produces a constant normalized ratio of exactly 1 and fails the "final ratio above 1.10" threshold, proving the check is load-bearing.

### The raw tree is now complete

**27 series total.** Every one of the eleven bundled symbols (SPX, NDX, QQQ, UPRO, TQQQ, SSO, QLD, VTI, EFA, EEM, TLT) now has both a price-return and a real total-return raw input from a vendor that genuinely publishes it. **No symbol in the bundled universe lacks a real total-return source.** Plan 02-04's total-return-construction abort branch (keyed off this fact per its own line 285) can proceed.

## Deviations from Plan

None — plan executed exactly as written. Every acceptance criterion in both tasks passed on the first implementation without a Rule 1/2/3 auto-fix.

## Issues Encountered

None.

## User Setup Required

None. `raw/manual/XNDX.csv` was already present (supplied by the 2026-08-17 manual download session per this plan's Task 1 precondition) and did not need to be re-downloaded.

## Next Phase Readiness

- `raw/` now carries the complete 27-series universe: 21 Yahoo-derived + 1 Nasdaq + 1 Shiller + 4 FRED. Every ETF has both price-return and total-return series, SPX has both, and NDX now has both (price-return from Yahoo, total-return from Nasdaq).
- Plan 02-08 (docs and manual-download rewrite) can add `XNDX.csv`'s download instructions to `MANUAL-DOWNLOAD.md` alongside the Yahoo files plan 02-06 already documented there.
- `tools/bundle-compiler`'s `compile-data` CLI has not been re-run against the new `raw/` tree in this plan (out of scope); that remains plan 02-04/02-05's work, now unblocked by a complete, validated `raw/` directory with no symbol missing a real total-return source.

## Self-Check: PASSED

Files confirmed present: `tools/fetch-data/src/normalize.ts`, `tools/fetch-data/src/sources.ts`, `tools/fetch-data/src/fetch.ts`, `tools/fetch-data/tests/normalize.test.ts`, `tools/fetch-data/tests/cross-check.test.ts`, `raw/NDX-TR.csv`, `raw/NDX-TR.meta.json` (`ls raw/*.csv | wc -l` == 27, `ls raw/*.meta.json | wc -l` == 27).

Commits confirmed present via `git log --oneline`: `3d85e93` (Task 1), `5fe1df5` (Task 2).

`npm run typecheck` and `npx vitest run --project unit` (212 tests, whole repo) both exit 0. `npm run fetch-data` exits 0.

---
*Phase: 02-compiled-data-bundle*
*Completed: 2026-08-17*
