# tools/fetch-data

Refreshes `raw/` from the locked source stack (D-04): Stooq for daily equity/ETF prices, FRED
for the three modern short-rate series plus the pre-1934 NBER-mirrored short rate, Shiller for
the pre-1988 monthly dividend input.

```bash
npm run fetch-data
```

Every fetched or manually-supplied file is normalized into the canonical `date,value` schema
(D-03) and written to `raw/<stem>.csv` plus `raw/<stem>.meta.json`, via `tools/fetch-data/src/
{sources,normalize,fetch}.ts`.

## Route C for Stooq, Route B for Shiller

**This script does not fetch Stooq.** Stooq serves a JavaScript proof-of-work bot challenge to
every plain-https request; no response body from a scripted request is real data. This was
confirmed directly this session and is not something to route around: no proof-of-work solver
or anti-bot bypass will be written for this project, and no alternative vendor or narrowed
universe is being substituted. **Stooq stays the source of record for equity/ETF price data,
but it is refreshed by a human through a real browser**, not by `npm run fetch-data`. See
`MANUAL-DOWNLOAD.md` for the full per-file instructions.

**Shiller's `ie_data.xls` is also a manual pull**, for a different reason: this development
sandbox has no network path to `econ.yale.edu` (a direct `curl -L` against the download URL
returned connection failure, exit 7, confirmed this session). Rather than gate the whole
pipeline on that being sandbox-specific, Shiller follows the same Route B pattern the plan
already reserved for a legacy-spreadsheet ingestion problem: a human downloads and converts
`ie_data.xls` to CSV once (see `MANUAL-DOWNLOAD.md`), which also means **no `xlsx` npm
dependency was ever installed** — the Task-2-equivalent package-legitimacy question (npm's
`xlsx@0.18.5` carries an npm-unpatched CVE, CVE-2023-30533) is moot under this route, not
resolved by accepting the risk.

`fetch.ts` treats both routes identically at the code level: a manually-placed vendor file at
`raw/manual/<stem>.csv` is read and normalized through the exact same `normalizeStooq` /
`normalizeShillerDividendYield` functions a live fetch would have used, so there is one
normalization contract and one coverage check regardless of how the bytes arrived. If a
required manual file is missing, the script prints its exact download URL and target path and
exits non-zero, listing every missing file in one pass (see `MANUAL-DOWNLOAD.md`).

FRED is the only source this script fetches itself, over https, with manual redirect handling
and a byte cap (T-02-12, T-02-14).

## Refresh procedure

1. Run `npm run fetch-data`. FRED's four rate series always refresh automatically.
2. If it reports missing manual files, follow `MANUAL-DOWNLOAD.md`, then re-run.
3. Once every source has data, the script prints a coverage table and halts on any series
   short of its declared expected first date, or any `*-TR` file identical to its `*-PR`
   sibling (RESEARCH.md assumption A2 — total-return availability per symbol was never
   confirmed for this vendor stack).
4. Commit the resulting `raw/*.csv` + `raw/*.meta.json` diff. **There is no as-of pinning**
   (D-07): the script always pulls/reads latest, so the git diff on refresh is the review
   surface. A vendor revision to a historical value shows up as a changed line in a reviewable
   commit rather than silently changing a past conclusion.

## Licence position per source (D-05, D-06)

Recorded once here, authored per-source in `sources.ts`, copied into every sidecar's
`license`/`termsUrl` fields, and carried through to the compiled manifest — never hand-typed
per file.

| Source | Licence position |
|---|---|
| FRED | Public domain (U.S. government work). Explicitly redistributable. |
| Shiller | Publicly available academic dataset. Explicitly redistributable. |
| Stooq | Permissive for personal use; redistribution terms are unclear. This is a **knowingly accepted risk**, not an oversight — see `.planning/PROJECT.md` Key Decisions for the full reasoning (D-06). |

## Files

- `src/sources.ts` — `SourceSpec`, `SOURCES` (Stooq + Shiller, all manual), `RATE_SOURCES`
  (FRED, fetched automatically).
- `src/normalize.ts` — `normalizeStooq`, `normalizeFred`, `parseShillerCsv`,
  `normalizeShillerDividendYield`, `toCanonicalCsv`.
- `src/fetch.ts` — the CLI (`npm run fetch-data`).
- `tests/normalize.test.ts` — unit tests for every normalizer, the transport rules, and a
  sidecar-round-trip check against the compiler's own `loadSidecarOrThrow`.
- `MANUAL-DOWNLOAD.md` — the human handoff: exact URLs, save paths, and browser steps.
