# tools/fetch-data

Refreshes `raw/` from the locked four-vendor source stack (D-04, revised 2026-08-17 after the
Source Stack Reversal; see `.planning/PROJECT.md`'s superseded Key Decision rows for what changed
and why): Yahoo Finance for daily equity and ETF prices, Nasdaq for the Nasdaq-100 total-return
index, FRED for the four short-rate series, Shiller for the pre-1988 monthly dividend input.

```bash
npm run fetch-data
```

Every fetched or manually-supplied file is normalized into the canonical `date,value` schema
(D-03) and written to `raw/<stem>.csv` plus `raw/<stem>.meta.json`, via `tools/fetch-data/src/
{sources,normalize,fetch}.ts`.

## The three routes

Route resolution is per-series, declared in `sources.ts`, not a single project-wide mode:

- **`live`**: FRED's four rate series. Always fetched over https; a failure is a hard error, no
  fallback.
- **`live-with-manual-fallback`**: Yahoo Finance (SPX price, SPX total return, NDX price, and all
  nine ETFs). The script attempts a live fetch first; on any failure it reads the declared manual
  file under `raw/manual/` instead. Yahoo's chart API returns HTTP 429 to this development
  sandbox on the first request, from both `query1` and `query2`, regardless of headers, while the
  vendor's own web host (`finance.yahoo.com`) returns 200 from the same machine. That is an
  address-level block on a shared egress address, not a malformed request; no header change fixes
  it. See "Yahoo fallback recipe" in `MANUAL-DOWNLOAD.md`.
- **`manual-only`**: Nasdaq (the NDX-TR / XNDX series) and Shiller (the monthly dividend input).
  This script never attempts to fetch either; both require a one-time browser export plus a
  spreadsheet-to-CSV conversion. See `MANUAL-DOWNLOAD.md`.

## Refresh procedure

1. Run `npm run fetch-data`. FRED's four rate series and every Yahoo series with a live path
   refresh automatically.
2. If it reports missing manual files, follow `MANUAL-DOWNLOAD.md`, then re-run.
3. Once every source has data, the script prints a coverage table (source, vendor column, route,
   first date, last date, row count, reconstruction drift where applicable) and halts on:
   - any series short of its declared expected first date,
   - any reconstructed total-return stem whose drift against the vendor's own adjusted close is
     at or above the declared reconstruction tolerance (see below),
   - any manually-supplied file whose newest observation has gone stale past its declared
     threshold (see below).
4. Commit the resulting `raw/*.csv` + `raw/*.meta.json` diff. **There is no as-of pinning**
   (D-07): the command always pulls latest, so the git diff on refresh is the review surface. A
   total-return refresh appends rows rather than rewriting them, because the level is
   reconstructed forward from a fixed seed (D-24): the seed is the first bar's raw close, which
   never moves, so a new dividend only ever adds a new row rather than rewriting history the way
   storing Yahoo's own back-adjusted close would. That is the reason D-24 exists, and it is why
   the diff stays a real review surface instead of noise.

## The two declared gates

A refresh is judged against two numbers, both declared in the source code, not in this document,
so this section quotes them rather than owning them.

**Reconstruction tolerance (D-25).** `tools/fetch-data/src/normalize.ts` declares
`MAX_RECONSTRUCTION_DRIFT = 0.005` (0.5%). This is the maximum absolute relative deviation, over
the whole growth path, between a reconstructed total-return series (built from `close` plus
dividend events, D-24) and the vendor's own back-adjusted close. It is anchored to the measured
worst case across the nine reconstructed ETFs, EEM at 0.17642% over the path; 0.005 is roughly
2.8x that measured worst case, enough headroom to absorb further years of compounding float
rounding in the vendor's own adjustment factors without a spurious failure, while staying two
orders of magnitude below the defect class the gate exists to catch (a missed split moves the
path by 100% or more; a dropped dividend introduces a permanent step equal to that dividend's
yield).

**Staleness thresholds (D-27).** Every manually-supplied source declares `maxStalenessDays` in
`sources.ts`: 10 days for every daily Yahoo fallback file and the Nasdaq XNDX export (2.5x the
longest legitimate gap between US equity trading bars, a Friday close to a Monday-holiday
reopen), and 75 days for Shiller's monthly dividend input. Both are measured against the newest
observation's date in the data itself, never the file's modification time: an mtime does not
survive a git clone, so an mtime-based gate would call every fresh clone pristine and defeat the
check entirely. There is no flag to bypass either gate (D-11's grounds: a bypass flag's failure
mode is someone leaving it on in CI).

## Licence position per source (D-05, D-06)

Recorded once here, authored per-source in `sources.ts`, copied into every sidecar's
`license`/`termsUrl` fields, and carried through to the compiled manifest, never hand-typed per
file.

| Source | Licence position |
|---|---|
| FRED | Public domain (U.S. government work). Explicitly redistributable. |
| Shiller | Publicly available academic dataset. Explicitly redistributable. |
| Yahoo Finance | Personal-use terms; the chart endpoint is undocumented with no published redistribution grant. Knowingly accepted risk, not an oversight, see `.planning/PROJECT.md` Key Decisions (D-05, D-06). |
| Nasdaq | The index site publishes its own terms of use; redistribution of the index history is not explicitly granted. Knowingly accepted risk, same posture as Yahoo's, see `.planning/PROJECT.md` Key Decisions (D-05, D-06). |

## Files

- `src/sources.ts`: `SourceSpec`, `SOURCES` (Yahoo + Nasdaq + Shiller), `RATE_SOURCES` (FRED,
  fetched automatically). The single source of truth for every URL, route, manual filename,
  staleness threshold, licence text and terms url quoted in this document.
- `src/normalize.ts`: `parseYahooChart`, `normalizeYahoo`, `reconstructYahooTotalReturn`,
  `measureReconstructionDrift` (D-24, D-25); `normalizeFred`; `splitCsvFields`,
  `parseShillerCsv`, `shillerRawNewestDate`, `normalizeShillerDividendYield` (the Shiller monthly
  parser); `normalizeNasdaq` (the XNDX export normalizer); `toCanonicalCsv`.
- `src/fetch.ts`: the CLI (`npm run fetch-data`): `resolveSource` (route dispatch with manual
  fallback), `checkReconstructionDrift` (D-25), `checkManualStaleness` (D-27), the coverage
  table.
- `tests/normalize.test.ts`: unit tests for every normalizer, both gates, the route invariant,
  and a sidecar round-trip check against the compiler's own `loadSidecarOrThrow`.
- `tests/cross-check.test.ts`: the standing S&P and Nasdaq-100 total-return-vs-price-return
  divergence checks, run against the committed vendor files on every test invocation.
- `MANUAL-DOWNLOAD.md`: the human handoff for the two manual-only sources, plus the documented
  Yahoo fallback recipe.
