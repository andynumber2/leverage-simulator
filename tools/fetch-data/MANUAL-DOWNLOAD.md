# Manual download instructions

Two sources need a one-time browser export plus a spreadsheet-to-CSV conversion, because both
distribute the requested history as a spreadsheet download rather than through a scriptable
endpoint: Nasdaq's index-history page and Shiller's `ie_data.xls`. Yahoo Finance additionally has
a manual fallback path, documented below as a recipe rather than a required step: `npm run
fetch-data` fetches Yahoo live wherever it can and only needs a manual file when the live fetch
fails.

## 1. Nasdaq-100 Total Return index (XNDX)

1. Open `https://indexes.nasdaqomx.com/Index/History/XNDX` in a browser and download the full
   history export.
2. Save the file exactly as `raw/manual/XNDX.csv`, at the repo root, without opening it in a
   spreadsheet program first.
3. Do not clean up the file before saving it. `normalizeNasdaq` (`tools/fetch-data/src/
   normalize.ts`) depends on three things the vendor's export carries as-is: a leading UTF-8 byte
   order mark, Windows-style CRLF line endings, and descending row order (newest first).
   Stripping the BOM, converting line endings, or re-sorting the rows produces a file the parser
   was never tested against.
4. Re-run `npm run fetch-data`. The script drops two known zero-valued rows from this export
   (today's not-yet-published placeholder and the 2012-10-29 Hurricane Sandy phantom bar) and
   reports both; that is expected, not a failure.

## 2. Shiller monthly dividend input (SPX-DIV-MONTHLY)

1. Open `https://www.econ.yale.edu/~shiller/data/ie_data.xls` and save `ie_data.xls`.
2. Convert it to CSV once, keeping the "Data" sheet (the sheet whose header row carries the
   literal `Date`, `P`, `D` column names): `soffice --headless --convert-to csv ie_data.xls`
   (LibreOffice headless), or open in a spreadsheet program and "Save As" CSV.
3. Save the result as `raw/manual/SPX-DIV-MONTHLY.csv`. Do not commit `ie_data.xls` itself:
   nothing in this codebase reads it, and the converted CSV already carries the full source sheet
   (D-26).
4. The date cells must survive the conversion as text of the year-point-fraction form (for
   example `1871.01`, `1871.1`), not reformatted into a spreadsheet date type. `parseShillerCsv`
   (`tools/fetch-data/src/normalize.ts`) reads the fraction as a two-place decimal of the year and
   right-pads a single digit, never left-pads, so `1871.1` parses as October, not January.

Running the fixed parser against the real converted file established two things this document
used to flag as unverified. First, the October/January collision: an earlier version of the
parser left-padded a single-digit month fraction, so `1871.1` (October) parsed as `1871.01`
(January); the fix right-pads instead. Second, a fabricated zero-dividend tail: the parser used
to treat every empty dividend cell as a zero, which would have invented a false dividend drop at
the end of the table; it now drops only a trailing run of empty cells (Shiller has not yet
published that month's trailing-twelve-month sum) and throws if an empty cell appears anywhere
earlier, where it would be a real hole. Against the committed `raw/manual/SPX-DIV-MONTHLY.csv`
this produces 1866 rows, 1871-01-01 through 2026-06-01, 155 Octobers and 156 Januaries, no
collision.

## Full download table

| Stem | Download URL | Save to | Conversion |
|---|---|---|---|
| `NDX-TR` | `https://indexes.nasdaqomx.com/Index/History/XNDX` | `raw/manual/XNDX.csv` | none, save the export as-is |
| `SPX-DIV-MONTHLY` | `https://www.econ.yale.edu/~shiller/data/ie_data.xls` | `raw/manual/SPX-DIV-MONTHLY.csv` | spreadsheet to CSV, keep the "Data" sheet |

Re-run `npm run fetch-data` after either file lands. The script reads whatever is present and
reports whatever is still missing; both files can be dropped in any order, in one sitting or
across several.

## Yahoo fallback recipe

`npm run fetch-data` fetches Yahoo Finance live wherever it can (`route:
'live-with-manual-fallback'` in `sources.ts`) and only reads a manual file when the live fetch
fails. This section documents that fallback as a supported route (D-27), not an emergency: it
was needed on every run from this development sandbox.

**What was established.** Yahoo's chart API (`query1.finance.yahoo.com`,
`query2.finance.yahoo.com`) returned HTTP 429 to a direct request from this sandbox on the first
attempt, regardless of headers (`User-Agent`, `Accept` made no difference), while
`finance.yahoo.com`'s own web host returned 200 from the same machine, and the same chart API
answered a real browser directly. That pattern, one address blocked and a different address on
the same vendor succeeding with no header fixing it, is an address-level block against a shared
egress address, not a malformed request. No workaround was attempted or should be attempted.

**Request template.**

```
https://query1.finance.yahoo.com/v8/finance/chart/<SYMBOL>?period1=<PERIOD1>&period2=<PERIOD2>&interval=1d&events=div%2Csplit
```

`<PERIOD2>` is always computed as the start of tomorrow (UTC) at request time. `<PERIOD1>` takes
one of two values, and which one to use depends on the symbol: `^GSPC` (the S&P 500 index,
reaching back to 1927-12-30 per D-17's pre-1928 depth) uses the wide value `-2208988800`
(1900-01-01 UTC); every other symbol in this universe starts after 1970 and uses the default
value `0` (1970-01-01 UTC). The wide value is not a safe default for every symbol: requesting it
against a symbol whose real history starts after 1970 produced an explicit "Only 100 years worth
of day granularity data are allowed" error from the vendor.

**If the live fetch fails, download and save one JSON file per symbol** to `raw/manual/`, using
the request template above with that symbol's own `<PERIOD1>` value:

| Symbol | `<PERIOD1>` | Save to |
|---|---|---|
| `^GSPC` | wide (`-2208988800`) | `raw/manual/GSPC.json` |
| `^SP500TR` | default (`0`) | `raw/manual/SP500TR.json` |
| `^NDX` | default (`0`) | `raw/manual/NDX.json` |
| `QQQ` | default (`0`) | `raw/manual/QQQ.json` |
| `UPRO` | default (`0`) | `raw/manual/UPRO.json` |
| `TQQQ` | default (`0`) | `raw/manual/TQQQ.json` |
| `SSO` | default (`0`) | `raw/manual/SSO.json` |
| `QLD` | default (`0`) | `raw/manual/QLD.json` |
| `VTI` | default (`0`) | `raw/manual/VTI.json` |
| `EFA` | default (`0`) | `raw/manual/EFA.json` |
| `EEM` | default (`0`) | `raw/manual/EEM.json` |
| `TLT` | default (`0`) | `raw/manual/TLT.json` |

**What the run reports.** Every run prints a coverage table naming, per series, whether that
series was fetched live or read from `raw/manual/` (the route column), and the sidecar's
`retrievedAt` records the run date for a live pull or the newest observation's date in the data
for a manual file, so a stale file cannot carry a fresh-looking sidecar. A manual file whose
newest observation is older than its declared staleness threshold fails the run outright (10
days for every daily Yahoo file). There is no flag to bypass that check, on D-11's grounds: a
bypass flag's failure mode is someone leaving it on in CI.
