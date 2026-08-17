# Manual download instructions (Route C / Route B)

`npm run fetch-data` cannot pull these 23 series itself. Stooq serves a JavaScript
proof-of-work bot challenge to every plain-https request, so no scripted fetch against it
returns real data (confirmed this session; no workaround was attempted or should be attempted
— see `README.md`). Shiller's `ie_data.xls` is unreachable from this development sandbox
(`curl -L https://www.econ.yale.edu/~shiller/data/ie_data.xls` returned connection failure,
curl exit 7), so it is also a manual pull, by design (Route B) rather than a network fault to
route around.

For each row below: open the **Download** URL in a real browser, save the file exactly as
named under **Save to**, then re-run `npm run fetch-data`. The script reads whatever is
present and reports whatever is still missing — you can do these in any order, in one sitting
or across several.

## Browser steps (Stooq rows)

1. Open the Download URL. Stooq's bot-challenge page runs a short JavaScript proof-of-work in
   your real browser and then serves the CSV; this only works in a browser, not a script.
2. Save the resulting file (Stooq serves it as a plain CSV download) as the exact filename in
   **Save to**, inside `raw/manual/` at the repo root.
3. Do not rename columns, edit values, or open-and-resave through a spreadsheet program — the
   file must be Stooq's own bytes so `normalizeStooq` sees the vendor's real column layout.

## Browser steps (Shiller row)

1. Open `https://www.econ.yale.edu/~shiller/data/ie_data.xls` and save `ie_data.xls`.
2. Convert it to CSV once, keeping the "Data" sheet (the sheet with monthly `Date`, `P`, `D`,
   `E` columns): `soffice --headless --convert-to csv ie_data.xls` (LibreOffice headless), or
   open in a spreadsheet program and "Save As" CSV.
3. Save the result as `raw/manual/SPX-DIV-MONTHLY.csv`.
4. **`parseShillerCsv` (tools/fetch-data/src/normalize.ts) has not been run against a real
   converted file this session** — there was no network path to verify it against. If it
   throws or produces obviously wrong dates/values, check that the header row still contains
   literal `Date`, `P`, `D` cells and that `Date` cells look like `1871.01` (not reformatted by
   the spreadsheet program into a different date type), then adjust the parser.

## UNVERIFIED total-return symbols (RESEARCH.md assumption A2)

Every `*-TR` row below reuses the **identical Stooq symbol** as its `*-PR` sibling. This is a
placeholder, not a confirmed total-return endpoint: Stooq's column set was only ever confirmed
as `Date,Open,High,Low,Close,Volume`, with no adjusted-close or dividend-reinvested column
documented for any symbol in this universe. **Before downloading a `[GUESS]` row as-is**,
check Stooq's site for a distinct total-return variant of that symbol (their search box, or a
`.tr`/similar suffix convention if one exists for that instrument). If you find a real
distinct symbol, use its download URL instead and note the substitution when you report back.
If no distinct symbol exists, download the `[GUESS]` URL anyway — `fetch.ts`'s coverage pass
will detect that the file is byte-identical to the price-return sibling and halt naming the
symbol, which is the intended outcome: a real "no total-return data available for this
symbol" finding recorded as a D-04 Key Decision, not a silently wrong series.

**When you're done, report back which `[GUESS]` symbols 404'd, which ones downloaded fine,
and which (if any) you found a real distinct TR symbol for.**

## Full download table

| Stem | Download URL | Save to | Expected first date | Total-return symbol |
|---|---|---|---|---|
| `SPX-PR` | `https://stooq.com/q/d/l/?s=^spx&i=d` | `raw/manual/SPX-PR.csv` | 1928 | — |
| `SPX-TR` | `https://stooq.com/q/d/l/?s=^spx&i=d` | `raw/manual/SPX-TR.csv` | 1928 | **[GUESS]** |
| `NDX-PR` | `https://stooq.com/q/d/l/?s=^ndx&i=d` | `raw/manual/NDX-PR.csv` | unverified (research open question 2) | — |
| `NDX-TR` | `https://stooq.com/q/d/l/?s=^ndx&i=d` | `raw/manual/NDX-TR.csv` | unverified | **[GUESS]** |
| `QQQ-PR` | `https://stooq.com/q/d/l/?s=qqq.us&i=d` | `raw/manual/QQQ-PR.csv` | 1999 | — |
| `QQQ-TR` | `https://stooq.com/q/d/l/?s=qqq.us&i=d` | `raw/manual/QQQ-TR.csv` | 1999 | **[GUESS]** |
| `UPRO-PR` | `https://stooq.com/q/d/l/?s=upro.us&i=d` | `raw/manual/UPRO-PR.csv` | 2009 | — |
| `UPRO-TR` | `https://stooq.com/q/d/l/?s=upro.us&i=d` | `raw/manual/UPRO-TR.csv` | 2009 | **[GUESS]** |
| `TQQQ-PR` | `https://stooq.com/q/d/l/?s=tqqq.us&i=d` | `raw/manual/TQQQ-PR.csv` | 2010 | — |
| `TQQQ-TR` | `https://stooq.com/q/d/l/?s=tqqq.us&i=d` | `raw/manual/TQQQ-TR.csv` | 2010 | **[GUESS]** |
| `SSO-PR` | `https://stooq.com/q/d/l/?s=sso.us&i=d` | `raw/manual/SSO-PR.csv` | 2006 | — |
| `SSO-TR` | `https://stooq.com/q/d/l/?s=sso.us&i=d` | `raw/manual/SSO-TR.csv` | 2006 | **[GUESS]** |
| `QLD-PR` | `https://stooq.com/q/d/l/?s=qld.us&i=d` | `raw/manual/QLD-PR.csv` | 2006 | — |
| `QLD-TR` | `https://stooq.com/q/d/l/?s=qld.us&i=d` | `raw/manual/QLD-TR.csv` | 2006 | **[GUESS]** |
| `VTI-PR` | `https://stooq.com/q/d/l/?s=vti.us&i=d` | `raw/manual/VTI-PR.csv` | 2001 | — |
| `VTI-TR` | `https://stooq.com/q/d/l/?s=vti.us&i=d` | `raw/manual/VTI-TR.csv` | 2001 | **[GUESS]** |
| `EFA-PR` | `https://stooq.com/q/d/l/?s=efa.us&i=d` | `raw/manual/EFA-PR.csv` | 2001 | — |
| `EFA-TR` | `https://stooq.com/q/d/l/?s=efa.us&i=d` | `raw/manual/EFA-TR.csv` | 2001 | **[GUESS]** |
| `EEM-PR` | `https://stooq.com/q/d/l/?s=eem.us&i=d` | `raw/manual/EEM-PR.csv` | 2003 | — |
| `EEM-TR` | `https://stooq.com/q/d/l/?s=eem.us&i=d` | `raw/manual/EEM-TR.csv` | 2003 | **[GUESS]** |
| `TLT-PR` | `https://stooq.com/q/d/l/?s=tlt.us&i=d` | `raw/manual/TLT-PR.csv` | 2002 | — |
| `TLT-TR` | `https://stooq.com/q/d/l/?s=tlt.us&i=d` | `raw/manual/TLT-TR.csv` | 2002 | **[GUESS]** |
| `SPX-DIV-MONTHLY` | `https://www.econ.yale.edu/~shiller/data/ie_data.xls` | `raw/manual/SPX-DIV-MONTHLY.csv` (after conversion, see above) | 1871-01 | n/a (dividend input, not a return series) |

The FRED rate series (`RATE-DFF`, `RATE-DTB3`, `RATE-TB3MS`, `RATE-NBER`) are **not** in this
table — `npm run fetch-data` already pulls and writes those automatically over https.

## After downloading

Run `npm run fetch-data` again. Once every file above is present, the script prints a
per-series coverage table (source, vendor column, first date, last date, row count) and halts
naming any series that:

- falls short of its declared expected first date, or
- is a `*-TR` file that's byte-identical to its `*-PR` sibling (no real total-return data was
  obtained from Stooq for that symbol).

A halt is not a bug to route around — it's the mechanism that turns "Stooq might not have
total-return data for TQQQ" from an assumption into a recorded finding. If it fires, that's a
D-04 Key Decision for the developer: accept price-return-only for that symbol, or find another
source, not something `fetch.ts` should paper over.
