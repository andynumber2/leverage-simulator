---
phase: 02-compiled-data-bundle
plan: 03
subsystem: data
tags: [fetch-script, fred, stooq, shiller, csv-normalization, provenance-sidecar, https-transport]

# Dependency graph
requires:
  - phase: 02-compiled-data-bundle
    provides: "tools/bundle-compiler CLI, SidecarMeta type and loadSidecarOrThrow validator, SCOPE_PATTERN scope derivation (plan 02-01)"
provides:
  - "tools/fetch-data CLI (npm run fetch-data): pulls FRED rate series over https, reads Stooq/Shiller series from raw/manual/ when a human has supplied them, normalizes both into the canonical date,value schema, writes sidecars, and halts on coverage/total-return-identity findings"
  - "raw/RATE-{DFF,DTB3,TB3MS,NBER}.csv + sidecars: real, committed, fetched-and-verified FRED data"
  - "tools/fetch-data/MANUAL-DOWNLOAD.md: the exact per-file human handoff for the 23 series this script cannot fetch itself"
  - "A corrected FRED CSV shape (header + missing-value marker) verified live, superseding 02-RESEARCH.md's unverified Code Examples"
affects: [02-04-rate-total-return-tiers, 02-05-app-decoder-perf-budgets]

# Actuals (#2632)
actuals:
  tokens: 15573
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Manual-source uniformity: a Route C (Stooq) or Route B (Shiller) manual file at raw/manual/<stem>.csv is normalized through the identical vendor-specific function a live fetch would have used, so there is one normalization contract and one coverage check regardless of how the bytes arrived"
    - "fetch.ts's coverage pass never runs partially: if any declared source's data is missing, the run prints the complete missing list and exits before the expected-first-date / total-return-identity checks, so a halt always reflects the full picture, not a partial one"
    - "Write-then-rename for every raw CSV and sidecar (matches plan 02-01's encode.ts discipline), hand-rolled in fetch.ts rather than imported from the compiler, per the plan's explicit 'do not import anything else from the compiler' instruction"

key-files:
  created:
    - tools/fetch-data/src/sources.ts
    - tools/fetch-data/src/normalize.ts
    - tools/fetch-data/src/fetch.ts
    - tools/fetch-data/tests/normalize.test.ts
    - tools/fetch-data/README.md
    - tools/fetch-data/MANUAL-DOWNLOAD.md
    - raw/RATE-DFF.csv
    - raw/RATE-DFF.meta.json
    - raw/RATE-DTB3.csv
    - raw/RATE-DTB3.meta.json
    - raw/RATE-TB3MS.csv
    - raw/RATE-TB3MS.meta.json
    - raw/RATE-NBER.csv
    - raw/RATE-NBER.meta.json
  modified:
    - package.json
    - .planning/PROJECT.md

key-decisions:
  - "Route C for Stooq (manual browser download, normalized through the same normalizeStooq contract a live fetch would use) and Route B for Shiller (manual spreadsheet conversion, no xlsx dependency) — both resolved by explicit user decision before this execution began, recorded in PROJECT.md as two new Key Decisions rows."
  - "Every *-TR (total-return) SourceSpec reuses its *-PR sibling's Stooq vendor symbol, flagged totalReturnGuess: true, because no distinct Stooq total-return symbol is confirmed for any bundled instrument (RESEARCH.md assumption A2). This is expected to trip fetch.ts's byte-identical halt once real files land; that halt is the intended mechanism for turning an assumption into a recorded finding, not a bug to route around."
  - "Corrected 02-RESEARCH.md's FRED Code Examples against a live pull this session: the header is observation_date,<SERIES_ID> (not DATE,VALUE), and the missing-observation marker is a truly blank field (not the literal '.'). normalizeFred treats both as the marker for defense in depth."
  - "Task 2 (the xlsx package-legitimacy checkpoint) does not apply under Route B: no xlsx dependency was ever added, so the CVE-2023-30533 exposure this plan's original Task 2 was gated against is moot by construction, not accepted."

patterns-established:
  - "SourceSpec (sources.ts) is the single authored table for vendor URL, column, expected first date, and licence/terms text; both the fetch loop and MANUAL-DOWNLOAD.md's table are derived from it, so licence text and URLs are never retyped."

requirements-completed: []

# DATA-07/03/04 are NOT marked complete: the bundled universe (equity/ETF price+total-return
# series, Shiller dividend input) is not yet present under raw/ pending a human manual download.
# Only the four FRED rate series are real and committed. See "Deferred Acceptance Checks" below.

coverage:
  - id: D1
    description: "normalizeStooq extracts date/Close by header name, drops every other column, and throws naming the header when Date or Close is absent, or naming the line when a value isn't finite"
    verification:
      - kind: unit
        ref: "tools/fetch-data/tests/normalize.test.ts#normalizeStooq"
        status: pass
    human_judgment: false
  - id: D2
    description: "normalizeFred drops both a blank-field and a literal '.' missing-observation marker (corrected from RESEARCH.md's unverified '.'-only assumption), keys off column position not header name, and throws naming the line for a non-numeric non-marker value"
    verification:
      - kind: unit
        ref: "tools/fetch-data/tests/normalize.test.ts#normalizeFred"
        status: pass
    human_judgment: false
  - id: D3
    description: "normalizeShillerDividendYield derives yield as dividend/price (TTM-consistent, never dividend*12) and parseShillerCsv locates the header row past preamble lines and disambiguates single-digit vs double-digit months"
    verification:
      - kind: unit
        ref: "tools/fetch-data/tests/normalize.test.ts#normalizeShillerDividendYield and #parseShillerCsv"
        status: pass
    human_judgment: true
    rationale: "The unit tests pin the arithmetic contract against fixtures, but parseShillerCsv has never run against Shiller's real converted file (no network path to econ.yale.edu this session) — a human must confirm it against the real raw/manual/SPX-DIV-MONTHLY.csv once supplied, per MANUAL-DOWNLOAD.md's explicit caveat."
  - id: D4
    description: "toCanonicalCsv emits the canonical header/LF/trailing-newline shape and throws on unsorted or duplicate-date rows"
    verification:
      - kind: unit
        ref: "tools/fetch-data/tests/normalize.test.ts#toCanonicalCsv"
        status: pass
    human_judgment: false
  - id: D5
    description: "fetchText enforces https-only, rejects a redirect to a non-https location before reading any body, follows an https-to-https redirect, throws naming the url and status on non-200, and aborts mid-stream (not after full buffering) past the byte cap"
    verification:
      - kind: unit
        ref: "tools/fetch-data/tests/normalize.test.ts#fetchText transport rules"
        status: pass
    human_judgment: false
  - id: D6
    description: "Every sidecar this script would write validates against the compiler's own loadSidecarOrThrow unmodified, across all four seriesKind values (price, rate, dividend-monthly represented; total-return shares the price sidecar shape)"
    verification:
      - kind: unit
        ref: "tools/fetch-data/tests/normalize.test.ts#sidecar round trip"
        status: pass
      - kind: other
        ref: "node --experimental-strip-types -e \"import('./tools/bundle-compiler/src/raw-input.ts').then(m=>{...loadSidecarOrThrow for every raw/*.csv...})\" — ran against the real committed raw/ tree, all 4 files pass"
        status: pass
    human_judgment: false
  - id: D7
    description: "npm run fetch-data fetches all four FRED rate series live, writes canonical CSVs + sidecars, and correctly halts (exit 1) listing all 23 still-missing manual sources with their download URL and save path"
    verification:
      - kind: integration
        ref: "npm run fetch-data (run this session) — real network pull against fredgraph.csv for DFF/DTB3/TB3MS/M1329AUSM193NNBR, real files written to raw/, exit code 1 with the full missing-source list printed"
        status: pass
    human_judgment: false
  - id: D8
    description: "The bundled Stooq equity/ETF universe and the Shiller dividend input are present under raw/ with sidecars, and every series meets its declared expected first date, or the shortfall is named"
    verification: []
    human_judgment: true
    rationale: "Blocked on a human manual download (Route C/B) — no automation can complete this from inside the current environment. See 'Deferred Acceptance Checks' below for the exact commands to re-run once raw/manual/ is populated."

duration: 40min
completed: 2026-08-17
status: complete
---

# Phase 02 Plan 03: Fetch-Data Tooling and Real FRED Rate Series (Route C for Stooq) Summary

**`npm run fetch-data` CLI that fetches FRED's four rate series live over https (real data, committed) and reads Stooq/Shiller series from a human-supplied `raw/manual/` drop, normalizing both paths through one shared contract with a coverage-and-halt pass; the 23 equity/ETF/dividend series still need that human step.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-08-17T03:20:00Z (approx.)
- **Completed:** 2026-08-17T03:32:32Z
- **Tasks:** 2 of the plan's original 3 (Task 2's package-legitimacy checkpoint does not apply under Route B — no `xlsx` dependency was ever added)
- **Files modified:** 17 (13 created source/data/doc files, package.json + PROJECT.md modified, 8 raw data/sidecar pairs committed)

## Accomplishments

- Built `tools/fetch-data/src/{sources,normalize,fetch}.ts`: the locked source table (`SOURCES`, `RATE_SOURCES`), every normalizer (`normalizeStooq`, `normalizeFred`, `normalizeShillerDividendYield`, `parseShillerCsv`, `toCanonicalCsv`), and the CLI with https-only transport, manual-redirect handling, and a streaming byte cap.
- Ran `npm run fetch-data` for real: pulled and committed all four FRED short-rate series (`RATE-DFF`, `RATE-DTB3`, `RATE-TB3MS`, `RATE-NBER`) as real, verified data with validating sidecars.
- Corrected two errors in `02-RESEARCH.md`'s FRED Code Examples against a live pull this session (header shape, missing-value marker) — see Deviations.
- Confirmed `M1329AUSM193NNBR` (the pre-1934 NBER-mirrored short rate, D-13's gap-filler) is gap-free across its full 1920-01 through 1934-03 range (171 rows for 171 months), resolving `02-RESEARCH.md` open question 1 and assumption A3 from `[CITED]` to `[VERIFIED]`.
- Wrote `tools/fetch-data/MANUAL-DOWNLOAD.md`: a per-file table (URL, save path, expected first date, total-return-guess flag) for the 23 series this script cannot fetch itself, plus browser steps and the exact report-back ask.
- Wrote `tools/fetch-data/README.md` recording Route C/Route B, the refresh procedure, and the per-source licence position.
- Appended exactly two rows to `.planning/PROJECT.md`'s Key Decisions table (D-06 licensing accepted-risk, Route C) with no existing row changed.
- 27 new unit tests (normalize.test.ts), all passing; full project suite (136 tests) green; `npm run typecheck` clean.

## Task Commits

1. **Task 1: fetch-data tooling + real FRED rate series** - `dedd1b9` (feat)
2. **Task 3: manual-download handoff + licensing docs** - `1a891b1` (docs)

_Task 2 (the plan's original package-legitimacy checkpoint before an `xlsx` install) does not apply: Route B means no `xlsx` dependency was ever added, so there is nothing to gate an install of._

**Plan metadata:** this SUMMARY.md, committed separately per the calling agent's instructions (STATE.md/ROADMAP.md are the orchestrator's to update).

## Files Created/Modified

- `tools/fetch-data/src/sources.ts` — `SourceSpec`, `SOURCES` (11 Stooq symbols × PR/TR + Shiller dividend input, all `manual: true`), `RATE_SOURCES` (4 FRED series, `manual: false`)
- `tools/fetch-data/src/normalize.ts` — every normalizer, plus the corrected FRED CSV-shape documentation
- `tools/fetch-data/src/fetch.ts` — the CLI: https transport (`fetchText`), atomic writes, sidecar construction via the compiler's own `SidecarMeta` type, missing-manual-source reporting, coverage table, and two halt conditions
- `tools/fetch-data/tests/normalize.test.ts` — 27 tests across every normalizer, the transport rules, and a sidecar round trip against `loadSidecarOrThrow`
- `tools/fetch-data/README.md` — Route C/B, refresh procedure, licence table
- `tools/fetch-data/MANUAL-DOWNLOAD.md` — the human handoff
- `raw/RATE-{DFF,DTB3,TB3MS,NBER}.csv` + `.meta.json` — real fetched data, committed
- `package.json` — added the `fetch-data` script
- `.planning/PROJECT.md` — two new Key Decisions rows (D-06 licensing, Route C)

## Decisions Made

See `key-decisions` in frontmatter. In short: Route C (Stooq, manual browser download) and Route B (Shiller, manual spreadsheet conversion) were already decided by the user before this execution began (the prior run's Task 1 checkpoint on the Stooq bot-challenge blocker); this execution built the tooling around that decision rather than re-litigating it. All `*-TR` Stooq entries carry an honest `totalReturnGuess: true` flag rather than a fabricated-but-confident symbol name, because no real Stooq total-return symbol is documented anywhere in this project's research.

## Deviations from Plan

### Auto-fixed / adapted, not flagged as issues

**1. [Structural, per explicit resume instructions] Task boundaries restructured around Route C/B**

- **Found during:** Plan start (this execution is itself a restructured re-run of a previously-halted attempt).
- **What changed:** The original plan's Task 1 assumed a live Stooq/FRED fetch was possible and deferred Shiller to Task 3 behind a package-legitimacy checkpoint (Task 2). Under Route C/B, Stooq is never fetched programmatically at all, and Route B for Shiller means no `xlsx` dependency, so Task 2's checkpoint has no install to gate. `normalizeShillerDividendYield` was therefore built in the same pass as the rest of `normalize.ts` (originally scoped to Task 3) rather than deferred.
- **Why:** Explicitly directed by this execution's `<resume_instructions>`: "Restructure the work so that everything automatable lands FIRST and the human's manual step is a single, precise, one-pass handoff at the end."
- **Impact:** Two commits instead of three; Task 2 is absent from the commit log by design, not skipped as an oversight.

**2. [Rule 1 - correction against live evidence] Two FRED CSV-shape corrections applied per resume instructions, then independently re-confirmed**

- **Found during:** Task 1, before writing `normalizeFred`.
- **Issue:** `02-RESEARCH.md`'s Code Examples claimed header `DATE,VALUE` and missing-marker `.`, both unverified in that research session (both direct fetches there returned HTTP 403).
- **Fix:** This session's direct pulls of `fredgraph.csv` for DFF, DTB3, TB3MS, and M1329AUSM193NNBR all succeeded (HTTP 200). Header confirmed as `observation_date,<SERIES_ID>`. `od -c` around 2020-10-12 in DTB3 confirmed the missing marker is a truly blank field (`2020-10-12,\n`), not `.`. `normalizeFred` accepts both as the marker for defense in depth (a `.` may still appear on some FRED series or cached copies).
- **Verification:** Live pull output pasted into `sources.ts`'s header comment; unit tests cover both marker forms.

**3. [Rule 1 - bug fix] `sources.ts`'s Shiller `termsUrl` initially used `http://`**

- **Found during:** Verifying the "no bare `http://` anywhere in `sources.ts`" acceptance check.
- **Fix:** Changed to `https://www.econ.yale.edu/~shiller/data.htm`. Also corrected the matching test fixture in `normalize.test.ts`.
- **Files modified:** `tools/fetch-data/src/sources.ts`, `tools/fetch-data/tests/normalize.test.ts`.
- **Committed in:** `dedd1b9`.

---

**Total deviations:** 1 structural (directed by resume instructions), 2 auto-fixed (Rule 1: research-error correction confirmed live, and a stray `http://`).
**Impact on plan:** No scope creep. All deviations either directly follow the explicit resume instructions or are same-task correctness fixes confirmed against live evidence.

## Deferred Acceptance Checks

The following acceptance checks from the original plan **cannot pass yet** because they assume `raw/*.csv` already contains the full bundled universe. They are listed verbatim so the orchestrator (or a human, after the manual download) can re-run them:

1. `ls raw/*.csv | wc -l` — currently **4** (RATE-* only), needs **≥20** once Stooq/Shiller land.
2. `ls raw/*.meta.json | wc -l` — currently **4**, must continue to equal the CSV count once more land.
3. `node -e "...const t=fs.readFileSync('raw/SPX-PR.csv',...)..."` — `raw/SPX-PR.csv` does not exist yet; the SPX-PR-reaches-1928 check (or the recorded-halt alternative) cannot run.
4. `npm run fetch-data` currently exits **1** (by design: 23 missing manual sources) rather than exiting 0 with a full coverage table. Re-run after `MANUAL-DOWNLOAD.md`'s files are supplied; expect either a clean exit 0 coverage table, or halts naming specific `*-TR` symbols per the `totalReturnGuess` flags (this is an expected, not a failing, outcome per RESEARCH.md assumption A2).
5. `npm run compile-data raw public/data` — run as the plan's smoke check this session; **fails as expected**: `compile-data: no price-kind series found to derive the reference calendar from`. This is the documented expected failure (no equity/ETF series exist yet), not a bug. Re-run once Stooq data lands; it is still expected to fail at that point per the original plan's own note (rate splice / total-return construction land in plan 02-04, gap-policy disagreements resolve in plan 02-05).
6. `parseShillerCsv` has never run against a real Shiller-converted file (see coverage `D3`'s `human_judgment: true` rationale) — verify once `raw/manual/SPX-DIV-MONTHLY.csv` is supplied.
7. Research open question 2 (does every symbol's Stooq feed reach its claimed start date) remains open for every symbol except the four FRED rate series (resolved) — `fetch.ts`'s coverage pass is built and tested to answer this the moment real files land, per RESEARCH.md's own recommendation that this not be assumed before a real pull.

## Issues Encountered

None beyond the deviations documented above. Network access to `fred.stlouisfed.org` succeeded from this environment (contrary to `02-RESEARCH.md`'s HTTP 403 experience); network access to `econ.yale.edu` failed (connection refused, curl exit 7) and to `stooq.com` was never attempted per the user's explicit decision.

## User Setup Required

**A human must download 23 files through a real browser before `raw/` is complete.** See `tools/fetch-data/MANUAL-DOWNLOAD.md` for the exact URLs, save paths, and browser steps:

- 22 Stooq files (11 symbols × price-return + total-return: `SPX,NDX,QQQ,UPRO,TQQQ,SSO,QLD,VTI,EFA,EEM,TLT`)
- 1 Shiller file (`ie_data.xls`, converted to CSV once)

After downloading, run `npm run fetch-data` again. It reads whatever is present and reports whatever is still missing.

## Next Phase Readiness

- `tools/fetch-data/` is fully built, tested, and ready to process real files the moment they land in `raw/manual/`.
- Plan 02-04 (rate splice, total-return construction) can already build against the four real, committed `RATE-*` series — those are genuinely done, not stubbed.
- Plan 02-04/02-05 cannot exercise the equity/ETF price data, the universe test, or the compiler's full pipeline until the manual download completes. This is a real, external blocker (a human with a browser), not something further automation in this environment can resolve.
- **Blocker for the orchestrator:** the 23-file manual download in `MANUAL-DOWNLOAD.md` must complete, then `npm run fetch-data` re-run, before this plan's coverage/halt logic can be exercised against real data and before plan 02-04/02-05 have a full `raw/` tree to build against.

## Self-Check: PASSED

Files confirmed present: `tools/fetch-data/src/sources.ts`, `tools/fetch-data/src/normalize.ts`,
`tools/fetch-data/src/fetch.ts`, `tools/fetch-data/tests/normalize.test.ts`,
`tools/fetch-data/README.md`, `tools/fetch-data/MANUAL-DOWNLOAD.md`, `raw/RATE-DFF.csv`,
`raw/RATE-DFF.meta.json`, `raw/RATE-DTB3.csv`, `raw/RATE-TB3MS.csv`, `raw/RATE-NBER.csv`.

Commits confirmed present via `git log --oneline`: `dedd1b9` (Task 1), `1a891b1` (Task 3).

---
*Phase: 02-compiled-data-bundle*
*Completed: 2026-08-17*
