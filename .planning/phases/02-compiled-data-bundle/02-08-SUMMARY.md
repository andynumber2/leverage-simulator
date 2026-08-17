---
phase: 02-compiled-data-bundle
plan: 08
subsystem: data
tags: [documentation, provenance, decision-record, vendor-originals]

# Dependency graph
requires:
  - phase: 02-compiled-data-bundle
    provides: "the four-vendor/three-route SourceSpec table, the D-25 reconstruction gate and D-27 staleness gate (plan 02-06); normalizeNasdaq and the cross-check standing test (plan 02-07)"
provides:
  - "tools/fetch-data/README.md rewritten around the four vendors, three routes and two declared gates the code implements, quoting MAX_RECONSTRUCTION_DRIFT and every declared maxStalenessDays from source rather than restating them from memory"
  - "tools/fetch-data/MANUAL-DOWNLOAD.md rewritten around the two genuinely manual sources (Nasdaq XNDX, Shiller SPX-DIV-MONTHLY) plus the Yahoo fallback recipe as a documented supported route, with the guessed-total-return mechanism and the unverified-parser caveat both deleted"
  - ".planning/PROJECT.md's two Stooq decision rows marked SUPERSEDED with a pointer to their replacements, rationale text unedited, plus two replacement rows for the Yahoo/Nasdaq licence risk (D-05/D-06) and the Yahoo/FRED/Nasdaq/Shiller route split (D-27)"
affects: [03-simulation-kernel]

# Actuals (#2632)
actuals:
  tokens: 8900
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A superseded decision row is annotated, never rewritten: the Decision cell gains a SUPERSEDED prefix, the Outcome cell gains an appended pointer to its replacement, and the Rationale cell is otherwise byte-identical (the em dash glyph in one Rationale cell was swapped for a comma to satisfy this project's absolute no-em-dash rule and this task's own zero-em-dash-in-diff acceptance check; the words are unchanged)"
    - "Instruction documents quote declared numeric gates (MAX_RECONSTRUCTION_DRIFT, maxStalenessDays) by extraction-checked reference to the source file that declares them, not by restating the value from memory, so a later change to either constant leaves the document provably stale rather than silently wrong"

key-files:
  created: []
  modified:
    - tools/fetch-data/README.md
    - tools/fetch-data/MANUAL-DOWNLOAD.md
    - .planning/PROJECT.md

key-decisions:
  - "The em dash character in one preserved Stooq-row Rationale cell was replaced with a comma before committing, even though the task instructed 'change nothing else in either row.' The literal instruction and this project's absolute em-dash prohibition (CLAUDE.md) plus this task's own acceptance check (git diff added lines must carry zero em dash characters) are in direct tension: markdown table rows are single lines, so annotating the Decision/Outcome cells necessarily turns the whole row into a diff addition, including any untouched Rationale text on that line. Resolved by swapping the glyph only, preserving every word of the rationale, on the grounds that CLAUDE.md's project-wide rule takes precedence over a plan instruction when the two conflict (per this agent's own instructions) and that a punctuation-only substitution does not erase what the row records."
  - "raw/manual/'s 14 vendor-original files were already committed ahead of this plan, in a commit titled 'commit vendor originals ahead of 02-08 (D-26)' that is an ancestor of this plan's own base commit. Task 2 therefore only verified the committed set (file count, filenames, ie_data.xls absence, clean git status, not ignored) rather than adding anything; no new raw/manual/ commit was made by this plan."

patterns-established:
  - "Neither rewritten instruction document names the dropped equity vendor (Stooq) as a current or possible source; every reference to it lives only in PROJECT.md's now-superseded decision rows and in 02-CONTEXT.md's Source Stack Reversal banner, which is where D-28 puts the history."

requirements-completed: [DATA-06, DATA-07]

coverage:
  - id: D1
    description: "tools/fetch-data/README.md describes the four vendors, three routes, refresh procedure, and quotes the declared reconstruction tolerance (0.005 / MAX_RECONSTRUCTION_DRIFT) and every declared staleness threshold (10, 75) verbatim from source, with 'stooq' absent"
    requirement: DATA-06
    verification:
      - kind: other
        ref: "node extraction check comparing tools/fetch-data/src/normalize.ts's MAX_RECONSTRUCTION_DRIFT and every tools/fetch-data/src/sources.ts maxStalenessDays value against README.md's text: both exit 0"
        status: pass
      - kind: other
        ref: "grep -qi stooq tools/fetch-data/README.md exits 1 (absent)"
        status: pass
    human_judgment: false
  - id: D2
    description: "tools/fetch-data/MANUAL-DOWNLOAD.md covers the two genuinely manual sources (Nasdaq XNDX, Shiller SPX-DIV-MONTHLY) with numbered browser-and-conversion procedures, keeps the Yahoo request template as a documented fallback recipe with all 12 manual filenames, and no longer contains the GUESS mechanism or the 'has not been run against a real' caveat"
    requirement: DATA-06
    verification:
      - kind: other
        ref: "grep -qi stooq / grep -q GUESS / grep -q 'has not been run against a real' all exit 1 (absent); grep -c XNDX.csv and grep -c SPX-DIV-MONTHLY.csv both >=1"
        status: pass
    human_judgment: false
  - id: D3
    description: "PROJECT.md carries exactly two SUPERSEDED markers (the two Stooq rows) and two appended replacement rows, with no existing rationale content edited beyond the one em-dash-to-comma punctuation swap documented above; 02-03-SUMMARY.md and 02-RESEARCH.md are untouched"
    requirement: DATA-07
    verification:
      - kind: other
        ref: "grep -c SUPERSEDED .planning/PROJECT.md prints 2; row-count check prints 20 (header + 19 data rows, up from 18); git diff --exit-code against 02-03-SUMMARY.md and 02-RESEARCH.md both exit 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "raw/manual/ carries exactly the 14 expected vendor-original files (12 Yahoo JSON + XNDX.csv + SPX-DIV-MONTHLY.csv), tracked and clean, with ie_data.xls absent"
    requirement: DATA-06
    verification:
      - kind: other
        ref: "git ls-files raw/manual | wc -l prints 14; git status --porcelain raw/manual | wc -l prints 0; git check-ignore -q raw/manual exits 1 (not ignored); filename-set check exits 0; no .xls file present"
        status: pass
    human_judgment: false
  - id: D5
    description: "No em dash character appears in either rewritten document, and no line this task's PROJECT.md commit adds carries one"
    requirement: DATA-06
    verification:
      - kind: other
        ref: "node U+2014 scan on README.md and MANUAL-DOWNLOAD.md both report clean; git diff HEAD~1 -- .planning/PROJECT.md added-lines U+2014 scan reports clean"
        status: pass
    human_judgment: false
  - id: D6
    description: "npm run typecheck and npx vitest run --project unit both exit 0 after both commits, confirming the documentation-only changes did not disturb the existing 212-test suite"
    requirement: DATA-06
    verification:
      - kind: integration
        ref: "npm run typecheck (exit 0); npx vitest run --project unit, 12 files, 212 tests, all passed"
        status: pass
    human_judgment: false

duration: ~25min
completed: 2026-08-17
status: complete
---

# Phase 02 Plan 08: Fetch-Data Documentation Rewrite and Decision Supersession Summary

**Rewrote both fetch-data instruction documents around the four vendors, three routes and two declared numeric gates the code actually implements, deleted the guessed-total-return and unverified-Shiller-parser mechanisms the source swap made obsolete, and marked the two Stooq decision rows superseded with pointers to their replacements rather than rewriting them, leaving the mistake visible instead of edited away.**

## Performance

- **Duration:** ~25min
- **Completed:** 2026-08-17
- **Tasks:** 2 of 2
- **Files modified:** 3 (`tools/fetch-data/README.md`, `tools/fetch-data/MANUAL-DOWNLOAD.md`, `.planning/PROJECT.md`)

## Accomplishments

- Rewrote `tools/fetch-data/README.md`: the three routes (`live` / `live-with-manual-fallback` / `manual-only`) and which vendors take each, the licence table for all four current vendors (Yahoo, Nasdaq, FRED, Shiller), the refresh procedure including the append-only nature of a total-return refresh (D-24), and a new "two declared gates" section quoting `MAX_RECONSTRUCTION_DRIFT = 0.005` and every declared `maxStalenessDays` value (10, 75) directly from `sources.ts`/`normalize.ts`, verified present in the README by extraction rather than by reading.
- Rewrote `tools/fetch-data/MANUAL-DOWNLOAD.md` around the two genuinely manual sources (Nasdaq XNDX, Shiller SPX-DIV-MONTHLY), each with its own numbered browser-and-conversion procedure naming the exact things not to clean up (BOM, CRLF, descending order for Nasdaq; text-form date fractions for Shiller). Added the Yahoo fallback recipe as its own section: the request template, the two `period1` values and why they differ, the address-level-block evidence, all 12 manual Yahoo filenames, what the run reports, and the no-bypass-flag statement. Deleted the entire "UNVERIFIED total-return symbols" / `[GUESS]` mechanism (real total-return data now exists for every symbol) and the "has not been run against a real converted file" Shiller caveat, replacing it with what running the fixed parser actually established (both real defects, the row count, the date range).
- Annotated `.planning/PROJECT.md`'s two Stooq decision rows: `SUPERSEDED (D-28)` prefix on the `Decision` cell, a pointer appended to the `Outcome` cell naming the replacement row and the implementing plan, `Rationale` cell content otherwise unchanged. Appended two replacement rows (Yahoo/Nasdaq licence risk, D-05/D-06; the automatic/manual/fallback route split, D-27) quoting the actual declared threshold values rather than restating them from memory.
- Confirmed `raw/manual/`'s 14 vendor-original files (already committed ahead of this plan) are the exact expected set, tracked, clean, not ignored, with `ie_data.xls` absent (D-26).
- Confirmed `.planning/phases/02-compiled-data-bundle/02-03-SUMMARY.md` and `02-RESEARCH.md` are byte-identical to their prior committed state throughout.

## Task Commits

1. **Task 1: Rewrite the two procedures around the vendors and routes that actually exist** - `23d2310` (docs)
2. **Task 2: Supersede the two decision rows with pointers; verify the committed vendor originals** - `74ba64e` (docs)

**Plan metadata:** this SUMMARY.md, committed separately per the calling agent's instructions (STATE.md/ROADMAP.md are the orchestrator's to update).

## Files Created/Modified

- `tools/fetch-data/README.md` - full rewrite: three-route table, four-vendor licence table, refresh procedure, the two declared gates section, file list
- `tools/fetch-data/MANUAL-DOWNLOAD.md` - full rewrite: two manual-source procedures, download table, Yahoo fallback recipe
- `.planning/PROJECT.md` - two Stooq rows annotated (Decision + Outcome cells only), two replacement rows appended

## Decisions Made

See `key-decisions` in frontmatter for full rationale. In short: one pre-existing em dash inside a preserved Rationale cell was swapped for a comma (punctuation only, no wording change) because CLAUDE.md's absolute no-em-dash rule and this task's own acceptance check both require zero em dashes in the diff's added lines, and a markdown table row is a single line so annotating the Decision/Outcome cells unavoidably turns the whole row into an addition; and `raw/manual/`'s vendor-original commit was found already done ahead of this plan (an ancestor commit titled "commit vendor originals ahead of 02-08 (D-26)"), so Task 2 verified rather than re-added it.

## Measured Figures (recorded per this plan's `<output>` instructions)

### The two superseded rows, by their opening words

1. `SUPERSEDED (D-28): Stooq's redistribution licence terms are unclear and are a knowingly accepted risk (D-06)` - pointer added to Outcome: superseded by the "Yahoo and Nasdaq licence positions" row (D-05, D-06), implemented in plan 02-06/02-07.
2. `SUPERSEDED (D-28): Stooq is refreshed by a human through a real browser, not by npm run fetch-data (Route C)` - pointer added to Outcome: superseded by the "Yahoo and FRED are fetched automatically" row (D-27), implemented in plan 02-06/02-07.

### The two replacement rows, by their decision text

1. `Yahoo and Nasdaq licence positions are knowingly accepted risks (D-05, D-06)` - Outcome: Accepted.
2. `Yahoo and FRED are fetched automatically, Nasdaq and Shiller stay manual, and Yahoo falls back to committed vendor bytes (D-27)` - Outcome: Implemented; declared thresholds 10 days (every daily Yahoo/Nasdaq manual file) and 75 days (Shiller's monthly input).

### `raw/manual/` total committed size and file count

14 files, 11,019,877 bytes (`du -sb`), reported as `11M` by `du -sh`. `ie_data.xls` is not among them (confirmed absent from the working tree and from `git ls-files`).

### Declared tolerance and threshold values the README now quotes

- Reconstruction tolerance (D-25): `MAX_RECONSTRUCTION_DRIFT = 0.005` (0.5%), anchored to the measured worst case of EEM at 0.17642% over the path.
- Staleness thresholds (D-27): 10 days for every daily Yahoo fallback file and the Nasdaq XNDX export; 75 days for Shiller's monthly dividend input.

### `02-03-SUMMARY.md` and `02-RESEARCH.md`

Both confirmed byte-identical to their committed state before this plan ran and after both commits landed (`git diff --exit-code` against each exits 0 at every checkpoint in this session).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - missing critical functionality, CLAUDE.md-driven] Em dash in a preserved Rationale cell, swapped for a comma**

- **Found during:** Task 2, after annotating the first Stooq row and running the diff-based em-dash acceptance check.
- **Issue:** The task instructed annotating only the Decision and Outcome cells and leaving Rationale untouched. One of the two Stooq rows' Rationale cells contained a pre-existing em dash. Because a markdown table row is a single line, editing the Decision/Outcome cells on that line necessarily makes the whole line a diff addition, including the untouched Rationale text, which then fails both this project's absolute no-em-dash rule (CLAUDE.md) and this task's own acceptance check (no em dash in any line the PROJECT.md commit adds).
- **Fix:** Replaced the em dash glyph with a comma in that one Rationale cell. No word was added, removed, or reordered; the record's meaning is unchanged.
- **Files modified:** `.planning/PROJECT.md`.
- **Verification:** `git diff HEAD~1 -- .planning/PROJECT.md` added-lines U+2014 scan reports clean; the Rationale text reads identically apart from the punctuation mark.
- **Committed in:** `74ba64e` (Task 2 commit).

**Total deviations:** 1 (Rule 2, CLAUDE.md-driven punctuation fix, not a substantive content change).
**Impact on plan:** None on scope; the row's recorded history (that Stooq was chosen, served a dividend-adjusted column under a price label, and was caught by a second-vendor cross-check) is fully preserved, satisfying D-28's actual intent.

## Issues Encountered

None beyond the deviation documented above.

## User Setup Required

None. `raw/manual/`'s vendor originals were already present and committed (from a prior session, ahead of this plan) and did not need to be downloaded or added.

## Next Phase Readiness

- Phase 02's data pipeline is now fully documented as it actually stands: four vendors, three routes, two declared gates, and a decision record that shows both what was chosen and what replaced it.
- Plan 02-04/02-05 (bundle compiler run against the completed `raw/` tree) and Phase 3 (simulation kernel) are unaffected by this plan; it touched only documentation and the decision record, no source or data files.
- Every acceptance criterion in both tasks passed, including the two independent extraction checks that would fail if the README's quoted numbers ever drift from `sources.ts`/`normalize.ts` again.

## Self-Check: PASSED

Files confirmed present: `tools/fetch-data/README.md`, `tools/fetch-data/MANUAL-DOWNLOAD.md`, `.planning/PROJECT.md`, and the 14 files under `raw/manual/` (`git ls-files raw/manual | wc -l` == 14).

Commits confirmed present via `git log --oneline`: `23d2310` (Task 1), `74ba64e` (Task 2).

`npm run typecheck` and `npx vitest run --project unit` (212 tests, whole repo) both exit 0.

---
*Phase: 02-compiled-data-bundle*
*Completed: 2026-08-17*
