---
phase: 02-compiled-data-bundle
plan: 04
subsystem: data
tags: [bundle-compiler, rate-series, total-return-construction, tier-computation, seam-records]

# Dependency graph
requires:
  - phase: 02-compiled-data-bundle
    provides: "compileBundle pipeline, binary format, gap policy, manifest schema (plan 02-01/02-02); the full 27-series raw/ tree with real Yahoo/Nasdaq/Shiller/FRED data and no symbol lacking a real total-return source (plans 02-06/02-07)"
provides:
  - "rate-series.ts: RATE_SOURCE_PRECEDENCE, buildShortRateSeries, interpolateMonthlyToDaily -- one daily short-rate series spliced from the four locked rate sources in precedence order, every hand-off and interpolated run recorded as a typed seam"
  - "total-return.ts: buildTotalReturnSeries, assertTotalReturnSourceExists -- pre-real-total-return construction from price return plus interpolated dividend yield, applied generically wherever a dividend-monthly input exists for a scope"
  - "tiers.ts: computeTierRanges -- strict/extended date ranges per (scope, dividend mode) pair, computed by scanning seam records' degradesToNonDaily flag, never hand-declared"
  - "SeamRecord.degradesToNonDaily -- the boolean tiers.ts scans; set by every seam producer in the compiler (gap-policy.ts, rate-series.ts, total-return.ts)"
  - "compileBundle wired end to end: the four RATE-scope raw inputs feed the shared '@rate' asset, every scope's total-return series is extended backward where a dividend-monthly input exists, every manifest series carries computed tiers and every contributing source, and assertRateCoversAllTiers guards DATA-04's coverage requirement"
affects: [02-05-app-decoder-perf-budgets, 03-simulation-kernel, 05-attribution-and-credibility-surface]

# Actuals (#2632)
actuals:
  tokens: 26400
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Rate-source precedence resolved by data, not by hardcoded year: each rank's usage window is [its own first date, the day before the earliest first date among every higher-ranked source], so the RATE-TB3MS/RATE-NBER three-month overlap resolves by construction rather than an assumed hand-off date"
    - "Total-return construction always chains backward from the real series' exact first value (never forward from an early anchor), so continuity at the splice date is a mathematical identity of the recurrence, not a runtime check that can fail"
    - "computeTierRanges is called from inside manifest.ts's buildManifest (not compile.ts), scanning each series' own seams against the shared rate series' seams -- one place computes every tier, including the rate series' own self-referential tier, with no special case"
    - "The reserved rate-source scope is matched by raw input `scope === 'RATE'`, not by `seriesKind === 'rate'` -- a non-reserved scope can still carry its own ordinary rate-kind series through the normal per-scope pipeline, which plan 02-02's pre-existing fixtures relied on"

key-files:
  created:
    - tools/bundle-compiler/src/rate-series.ts
    - tools/bundle-compiler/src/total-return.ts
    - tools/bundle-compiler/src/tiers.ts
    - tools/bundle-compiler/tests/rate-series.test.ts
    - tools/bundle-compiler/tests/series.test.ts
    - tools/bundle-compiler/tests/seams.test.ts
    - tools/bundle-compiler/tests/manifest.test.ts
  modified:
    - tools/bundle-compiler/src/seams.ts
    - tools/bundle-compiler/src/gap-policy.ts
    - tools/bundle-compiler/src/raw-input.ts
    - tools/bundle-compiler/src/manifest.ts
    - tools/bundle-compiler/src/compile.ts
    - tools/bundle-compiler/tests/calendar.test.ts
    - tools/bundle-compiler/tests/gap-policy.test.ts
    - tools/bundle-compiler/tests/roundtrip.test.ts
    - tools/bundle-compiler/tests/fixtures/make-fixture.ts

key-decisions:
  - "RawSeries gains a `rawStem` field (the raw CSV filename stem) not in this plan's declared files_modified list. rate-series.ts must match a loaded rate input against its RATE_SOURCE_PRECEDENCE stem (RATE-DFF/RATE-DTB3/RATE-TB3MS/RATE-NBER), and `scope` cannot do this: all four rate inputs derive the identical scope \"RATE\" from their shared filename prefix. Rule 3 (blocking issue) -- without it, precedence-ordered splicing has no way to identify which loaded series is which source. Documented as a deviation below."
  - "The reserved rate-source scope is matched by `scope === 'RATE'`, not `seriesKind === 'rate'`, in compile.ts's input partitioning. Plan 02-02's pre-existing fixtures (calendar.test.ts, gap-policy.test.ts) use an arbitrary-scoped rate-kind series (e.g. scope 'BBB', seriesKind 'rate') purely to exercise D-09's carry-forward path, unrelated to the real RATE_SOURCE_PRECEDENCE concept. Filtering by seriesKind alone would have silently pulled those fixtures' series into buildShortRateSeries's stem-matching logic and thrown \"rate source RATE-DFF is missing\". Filtering by the reserved scope name is also what the real raw/ tree's own convention already implies (only scope \"RATE\" carries seriesKind \"rate\" in production)."
  - "assertTotalReturnSourceExists is only invoked for a scope that carries its own price-return series. A scope whose only series is an arbitrary rate-kind fixture input (used by plan 02-02's tests) is not a \"symbol\" under D-15's total-return requirement and is exempt, rather than spuriously aborting."
  - "The splice-continuity test (a constructed level chained forward one bar reproducing the real level at S) documents a relative tolerance of 1e-9, which the backward-chaining design satisfies as a mathematical identity rather than an empirical near-match: the constructed run is always seeded from S's own exact real value and walked backward, so there is no independent forward computation that could diverge from it at the boundary. The Pitfall-1 sensitivity guard (a 12x-inflated yield producing a materially different level) is tested at the constructed run's earliest date instead of at the boundary itself, since that is where a wrong yield's effect is actually visible under this construction method."
  - "assertRateCoversAllTiers (compile.ts) is exported and unit-tested via fault injection, not only exercised through compileBundle. Since extended is defined as computeTierRanges's own intersection with the rate range, a correct implementation can never trip the guard through the real pipeline -- proving it load-bearing requires calling it directly with a deliberately out-of-bounds series list."

patterns-established:
  - "Every seam-producing function in the compiler (gap-policy.ts's two carry-forward sites, rate-series.ts's splice/interpolation/carry-forward sites, total-return.ts's interpolation/splice sites) sets degradesToNonDaily explicitly at the point of construction, with a one-line comment stating why; nothing downstream infers it from `kind` or `method` text."
  - "buildManifest (manifest.ts) is the single place `computeTierRanges` is called, uniformly for every series including the rate series' own manifest entry (passing its own seams/range as both the pair and rate arguments reduces to the same computation, no special case)."

requirements-completed: [DATA-03, DATA-04, DATA-05, DATA-06]

coverage:
  - id: D1
    description: "One daily short-rate series splices RATE-DFF/RATE-DTB3/RATE-TB3MS/RATE-NBER in precedence order; the RATE-TB3MS/RATE-NBER three-month overlap resolves by construction (RATE-TB3MS wins the whole overlap) rather than an assumed date; every hand-off and interpolated run is a typed seam with degradesToNonDaily set correctly"
    requirement: DATA-04
    verification:
      - kind: unit
        ref: "tools/bundle-compiler/tests/rate-series.test.ts (16 tests: precedence/coverage, overlap-window resolution, splice/interpolation/carry-forward seam correctness, zero-row and duplicate-date aborts, no-hardcoded-boundary-year check)"
        status: pass
      - kind: integration
        ref: "npm run compile-data raw public/data (real run, this session): rate series 1927-12-30 to 2026-08-14, splices at 1934-01-01 (NBER->TB3MS), 1954-01-04 (TB3MS->DTB3), 1954-07-01 (DTB3->DFF), all read from the loaded data's own first dates"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every scope emits both a price-return and a total-return series; the S&P's pre-1988 total return is constructed from price return plus a dividend yield interpolated from SPX-DIV-MONTHLY, continuous into the real daily series at 1988-01-04 with no duplicated bar"
    requirement: DATA-03
    verification:
      - kind: unit
        ref: "tools/bundle-compiler/tests/series.test.ts (11 tests: splice-date exactness, boundary continuity within 1e-9, day-count accrual scaling, Pitfall-1 sensitivity, interpolation bounding, source-existence guard)"
        status: pass
      - kind: integration
        ref: "npm run compile-data raw public/data (real run): SPX/total-return spliced at 1988-01-04 (interpolation seam 1927-12-30 to 1987-12-31, splice seam at 1988-01-04, both degradesToNonDaily true), sources = [Robert Shiller (Yale), Yahoo Finance, Yahoo Finance]"
        status: pass
    human_judgment: false
  - id: D3
    description: "Strict and extended tier ranges are computed per (scope, dividend mode) pair by scanning seam records; the tier is a property of the pair, not the symbol -- proved against real S&P data"
    requirement: DATA-05
    verification:
      - kind: unit
        ref: "tools/bundle-compiler/tests/seams.test.ts (8 tests: intersection/narrowing rules, strict:null on full coverage, no-narrowing when no degrading seam overlaps, price-return vs total-return divergence for one scope)"
        status: pass
      - kind: integration
        ref: "npm run compile-data raw public/data (real run): SPX price-return strict 1954-01-04..2026-08-14 (day after the daily-rate coverage start), SPX total-return strict 1988-01-05..2026-08-14 (day after the real daily total-return splice) -- different strict starts for the same symbol, proving D-14"
        status: pass
    human_judgment: false
  - id: D4
    description: "The manifest carries every contributing source per series (not only the newest), every seam sorted deterministically, computed tiers including an explicit strict: null, and the DATA-04 rate-coverage guard is load-bearing"
    requirement: DATA-06
    verification:
      - kind: unit
        ref: "tools/bundle-compiler/tests/manifest.test.ts (8 tests: provenance byte-identity, 3-source total-return provenance, seam ordering and non-coalescing, strict:null as an explicit key, byte-identical recompile, assertRateCoversAllTiers fault-injected pass/fail)"
        status: pass
      - kind: integration
        ref: "npm run compile-data raw public/data run twice: identical bundleVersion (45a9f1ae6444) and every asset filename both times"
        status: pass
    human_judgment: false
  - id: D5
    description: "npm run typecheck and npx vitest run --project unit both exit 0 across the whole repo, including plan 02-01/02-02's pre-existing fixture-based tests adapted to the new unconditional rate-splicing and total-return requirements"
    requirement: DATA-04
    verification:
      - kind: integration
        ref: "npm run typecheck (exit 0); npx vitest run --project unit (255/255 tests passing, 16 files)"
        status: pass
    human_judgment: false

duration: ~2h
completed: 2026-08-17
status: complete
---

# Phase 02 Plan 04: Rate Splicing, Total-Return Construction, and Computed Tiers Summary

**Spliced the four locked rate sources into one daily short-rate series with the RATE-TB3MS/RATE-NBER overlap resolved from the data, constructed the S&P's pre-1988 total return from price return plus interpolated Shiller dividend yield, and made the strict/extended tier boundary a computed property of typed seam records instead of a hand-declared constant -- verified end to end against the real 27-series raw/ tree.**

## Performance

- **Duration:** ~2h
- **Completed:** 2026-08-17
- **Tasks:** 3 of 3
- **Files modified:** 9 source/test files modified, 7 new files created

## Accomplishments

- `rate-series.ts`: `buildShortRateSeries` splices `RATE-DFF`/`RATE-DTB3`/`RATE-TB3MS`/`RATE-NBER` in `RATE_SOURCE_PRECEDENCE` order. Each rank's usage window is derived purely from the loaded data's own first dates (never a hardcoded year), which resolves the `RATE-TB3MS`/`RATE-NBER` three-month overlap (RESEARCH.md Pitfall 4) by construction: `RATE-TB3MS` wins its entire range and `RATE-NBER` is used strictly before it begins. `interpolateMonthlyToDaily` (also defined here, reused by `total-return.ts`) linearly interpolates a monthly series to daily, bounded by its own anchor dates, with the anchor-date value exact.
- `SeamRecord` gains the required `degradesToNonDaily: boolean`, set explicitly at every seam-producing site in the compiler (`gap-policy.ts`'s two carry-forward sites: `false`; `rate-series.ts`'s splice/interpolation/carry-forward sites and `total-return.ts`'s interpolation/splice sites: `true` where a monthly source is involved).
- `total-return.ts`: `buildTotalReturnSeries` chains the constructed level backward from the real total-return series' exact first value, using daily price return plus a dividend contribution (interpolated annualized yield times calendar days elapsed since the previous trading day, divided by 365 -- SIM-03's calendar-day accrual convention). Applies generically wherever a dividend-monthly input exists for a scope; only the S&P has one in the current universe. `assertTotalReturnSourceExists` aborts naming a scope with neither a real total-return input nor a dividend-monthly input.
- `tiers.ts`: `computeTierRanges` computes `extended` as the intersection of a pair's own range with the shared rate series' range, and narrows `strict` past every seam with `degradesToNonDaily` true, emitting an explicit `strict: null` (never zero-length or inverted) when no strict window survives.
- `manifest.ts`'s `buildManifest` now computes every series' `tiers` itself (satisfying the plan's own `grep -c computeTierRanges tools/bundle-compiler/src/manifest.ts` acceptance check), uniformly including the rate series' own self-referential tier entry.
- `compile.ts` wires all three modules together: the four `RATE`-scope raw inputs are pulled out of the normal per-scope pipeline into the shared `@rate` asset; every scope with a dividend-monthly input gets its total-return series extended backward; every manifest series lists every contributing raw input's provenance (not only the newest); and the exported `assertRateCoversAllTiers` guards DATA-04's coverage requirement, unit-tested via fault injection since a correct `computeTierRanges` can never trip it through the real pipeline.
- Ran `npm run compile-data raw public/data` against the real, complete 27-series `raw/` tree this session: exits 0, no warnings, and a second run reproduces an identical `bundleVersion` and every asset filename (determinism confirmed). The generated `public/data/` output was not committed -- that is plan 02-05's responsibility per `02-01-SUMMARY.md`'s "Next Phase Readiness" note.

## Task Commits

1. **Task 1: One daily short-rate series spanning 1928 to today, spliced in a declared precedence order** - `b0c2081` (feat)
2. **Task 2: Both series per symbol, with pre-1988 total return constructed and recorded at day level** - `a82034c` (feat)
3. **Task 3: Tier ranges computed by scanning seam records, and the manifest carrying the full provenance** - `36ba257` (feat)

**Plan metadata:** this SUMMARY.md, committed separately per the calling agent's instructions (STATE.md/ROADMAP.md are the orchestrator's to update).

## Files Created/Modified

- `tools/bundle-compiler/src/rate-series.ts` -- `RATE_SOURCE_PRECEDENCE`, `buildShortRateSeries`, `interpolateMonthlyToDaily`
- `tools/bundle-compiler/src/total-return.ts` -- `buildTotalReturnSeries`, `assertTotalReturnSourceExists`, `AlignedInputSeries`
- `tools/bundle-compiler/src/tiers.ts` -- `computeTierRanges`, `TierRanges`
- `tools/bundle-compiler/src/seams.ts` -- `SeamRecord.degradesToNonDaily`
- `tools/bundle-compiler/src/gap-policy.ts` -- both carry-forward seam sites set `degradesToNonDaily: false`
- `tools/bundle-compiler/src/raw-input.ts` -- `RawSeries.rawStem` (deviation, see below)
- `tools/bundle-compiler/src/manifest.ts` -- `buildManifest` computes `tiers` per series via `computeTierRanges`; `ManifestSeriesInput` type
- `tools/bundle-compiler/src/compile.ts` -- rate/total-return/tiers wiring, `assertRateCoversAllTiers`
- `tools/bundle-compiler/tests/rate-series.test.ts`, `tests/series.test.ts`, `tests/seams.test.ts`, `tests/manifest.test.ts` -- new, 43 tests total across the four files
- `tools/bundle-compiler/tests/calendar.test.ts`, `tests/gap-policy.test.ts`, `tests/roundtrip.test.ts`, `tests/fixtures/make-fixture.ts` -- adapted so plan 02-01/02-02's pre-existing fixture-based tests keep compiling under this plan's new unconditional rate-splicing and D-15 total-return requirements

## Decisions Made

See `key-decisions` in frontmatter for full rationale. In short: `RawSeries` gained a `rawStem` field to let `rate-series.ts` distinguish the four same-scoped rate sources by filename; the reserved rate scope is matched by `scope === 'RATE'` rather than `seriesKind === 'rate'`, preserving plan 02-02's arbitrary-scoped rate-kind test fixtures; `assertTotalReturnSourceExists` only fires for scopes that actually carry a price-return series; and `assertRateCoversAllTiers` is exported and directly fault-injection-tested since the real pipeline structurally cannot trip it.

## Measured Figures (recorded per this plan's `<output>` instructions)

### Rate-series splice boundaries, real data (this session)

| Hand-off | Boundary date | Before source | After source | degradesToNonDaily |
|---|---|---|---|---|
| RATE-NBER -> RATE-TB3MS | 1934-01-01 | RATE-NBER (monthly, window ends 1933-12-31) | RATE-TB3MS | true |
| RATE-TB3MS -> RATE-DTB3 | 1954-01-04 | RATE-TB3MS (monthly, window ends 1954-01-03) | RATE-DTB3 | true |
| RATE-DTB3 -> RATE-DFF | 1954-07-01 | RATE-DTB3 (daily, window ends 1954-06-30) | RATE-DFF | false |

Compiled rate series: **1927-12-30 to 2026-08-14** (bounded at the front by the reference calendar's own first day, at the back by RATE-DFF's own last date). Two additional single-day `carry-forward` seams (1954-01-19, 1954-02-12) fill small internal RATE-DTB3 gaps, `degradesToNonDaily: false`.

### S&P total-return construction, real data (this session)

- Interpolation seam: **1927-12-30 to 1987-12-31** (constructed run, `SPX-DIV-MONTHLY` interpolated to daily).
- Splice seam: **1988-01-04 to 1988-01-04** (the single day the real `SPX-TR` value is used; the constructed run's last date is 1987-12-31, the trading day before).
- Both seams carry `degradesToNonDaily: true`, per this plan's own design (the splice itself is marked degrading even though the value on that single day is the genuine sourced value, matching the `<interfaces>` section's literal specification).
- Compiled `SPX/total-return` sources: `Robert Shiller (Yale)`, `Yahoo Finance` (SPX-PR), `Yahoo Finance` (SPX-TR) -- three contributing raw inputs.

### Computed tier ranges, real data (this session)

| Pair | Strict | Extended |
|---|---|---|
| SPX/price-return | 1954-01-04 to 2026-08-14 | 1927-12-30 to 2026-08-14 |
| SPX/total-return | 1988-01-05 to 2026-08-14 | 1927-12-30 to 2026-08-14 |
| @rate/rate | 1954-01-04 to 2026-08-14 | 1927-12-30 to 2026-08-14 |

SPX price-return's strict tier starts the day after the daily-rate coverage begins (RATE-DTB3's first date); SPX total-return's strict tier starts the day after the real daily total-return splice -- two different strict starts for the same symbol, which is exactly D-14's "the tier is a property of the pair, not the symbol alone" claim, now proved against real data rather than asserted.

### Documented relative tolerance and day-count convention

- **Splice-continuity tolerance:** 1e-9 relative difference (documented in `series.test.ts`). Because the construction always chains backward from the real series' own exact value at `S`, continuity at the boundary is a mathematical identity of the recurrence rather than an empirical near-match, so this tolerance is realistically bounded by floating-point round-off, not by any modeling error.
- **Calendar-day accrual convention** (Phase 3 inherits this): the dividend contribution for a constructed bar equals the interpolated annualized yield at that bar's own date, times the number of calendar days elapsed since the previous trading day, divided by 365. A bar following a three-calendar-day weekend accrues three days of dividend, proved by a dedicated test (`series.test.ts`) asserting the per-step contribution scales exactly 3x between a one-day and a three-day gap at the same yield.

### `npm run compile-data raw public/data`, real run this session

Exit code 0, no warnings. Assets: `calendar.51c75c1cba.bin`, `rate-rate.2a001d2da2.bin`, and one asset per symbol (`eem`, `efa`, `ndx`, `qld`, `qqq`, `spx`, `sso`, `tlt`, `tqqq`, `upro`, `vti`) -- 11 symbols matching the full bundled universe. `bundleVersion=45a9f1ae6444`. A second run against the same unchanged `raw/` tree reproduced an identical `bundleVersion` and every asset filename byte for byte.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `RawSeries` needed a `rawStem` field not in this plan's declared `files_modified` list**

- **Found during:** Task 1, designing `buildShortRateSeries`'s stem-matching logic.
- **Issue:** The four rate sources (`RATE-DFF.csv`, `RATE-DTB3.csv`, `RATE-TB3MS.csv`, `RATE-NBER.csv`) all derive the identical `scope` ("RATE") from their shared filename prefix (`deriveScopeFromFilename` splits on the first `-`). `RATE_SOURCE_PRECEDENCE` is an ordered list of raw *stems*, and `scope` alone gives no way to tell the four loaded `RawSeries` objects apart.
- **Fix:** Added `rawStem: string` (the CSV filename stem) to `RawSeries`, populated in `loadRawInputs`. Every existing hand-built `RawSeries` fixture in the test suite (`gap-policy.test.ts`'s and `calendar.test.ts`'s `makeSeries` helpers) was updated to supply it (`rawStem: scope`, preserving prior behavior for tests that don't care about the distinction).
- **Files modified:** `tools/bundle-compiler/src/raw-input.ts`, `tools/bundle-compiler/tests/gap-policy.test.ts`, `tools/bundle-compiler/tests/calendar.test.ts`.
- **Verification:** `npx vitest run --project unit` -- full suite green both before and after this addition.
- **Committed in:** `b0c2081` (Task 1 commit).

**2. [Rule 3 - Blocking issue] Plan 02-01/02-02's pre-existing fixture-based tests broke under the new unconditional rate-splicing and D-15 total-return requirements**

- **Found during:** Task 3, wiring `buildShortRateSeries` and `buildTotalReturnSeries` into `compile.ts` and running the full suite.
- **Issue:** `compileBundle` now unconditionally calls `buildShortRateSeries`, which requires all four `RATE_SOURCE_PRECEDENCE` stems to be present, and `assertTotalReturnSourceExists` now aborts any scope carrying a price-return series with no total-return counterpart. Plan 02-01/02-02's own tests (`roundtrip.test.ts`, `versioning.test.ts`, `calendar.test.ts`, `gap-policy.test.ts`) used minimal price-only fixtures that predate both requirements and broke on `npm test` (10 failures on first integration run).
- **Fix:** Extended `tests/fixtures/make-fixture.ts` with a `filenameStem` override (for the four non-`${scope}-${seriesKind}`-shaped rate filenames) and an exported `DEFAULT_RATE_SERIES` block, included by default in `DEFAULT_SERIES` and spread into every custom-`series` fixture call site that needed it; added a `total-return` sibling for every price-only fixture scope that lacked one; re-keyed `RawFixture.expected` from bare `scope` to `${scope}/${binaryKind}` (a manifest `id`-shaped key), since one scope can now legitimately carry more than one compiled series and the prior scope-only key silently let a later spec's `expected` entry overwrite an earlier one.
- **Files modified:** `tools/bundle-compiler/tests/fixtures/make-fixture.ts`, `tests/calendar.test.ts`, `tests/gap-policy.test.ts`, `tests/roundtrip.test.ts`.
- **Verification:** `npx vitest run --project unit` -- 255/255 passing (up from 247 pre-plan, all pre-existing tests still exercising their original intent).
- **Committed in:** `36ba257` (Task 3 commit).

**3. [Rule 1 - Bug, self-caught before commit] Filtering rate inputs by `seriesKind` instead of `scope` would have silently absorbed plan 02-02's unrelated rate-kind fixtures**

- **Found during:** Task 3, first integration test run.
- **Issue:** An initial implementation filtered `rateInputs = allInputs.filter(input => input.meta.seriesKind === 'rate')`. Plan 02-02's `calendar.test.ts` and `gap-policy.test.ts` deliberately use an arbitrary-scoped `seriesKind: 'rate'` series (e.g. scope `'BBB'`) to exercise D-09's carry-forward gap policy, unrelated to the real `RATE_SOURCE_PRECEDENCE` concept. Filtering by `seriesKind` alone pulled those series into `buildShortRateSeries`'s stem-matching logic, which then threw `"rate source RATE-DFF is missing"`.
- **Fix:** Filter by `scope === 'RATE'` (the reserved scope all four real rate sources share) instead, leaving any other scope's rate-kind series in the normal per-scope compile path exactly as plan 02-02 built it.
- **Files modified:** `tools/bundle-compiler/src/compile.ts`.
- **Verification:** `npx vitest run --project unit` -- the affected tests pass without further fixture changes beyond Deviation 2's additions.
- **Committed in:** `36ba257` (Task 3 commit).

---

**Total deviations:** 2 Rule 3 (blocking-issue) auto-fixes, 1 Rule 1 (bug) self-caught before any commit. No architectural changes (no Rule 4 territory) and no scope creep beyond what was needed to keep the full test suite green under this plan's own new requirements.
**Impact on plan:** All three tasks' `<behavior>`, `<acceptance_criteria>`, and the plan's overall `<verification>` items pass, including a real end-to-end run against the committed `raw/` tree.

## Issues Encountered

None beyond the deviations documented above, all resolved within this plan's own scope.

## User Setup Required

None. No external service configuration required; the real compile ran entirely against already-committed `raw/` data.

## Next Phase Readiness

- `tools/bundle-compiler`'s `compile-data` CLI now runs end to end against the real, complete 27-series `raw/` tree with no warnings and a proven-deterministic recompile. Plan 02-05 (app decoder + perf budgets) can build directly against the manifest schema and binary assets as compiled.
- Plan 02-05 must commit `public/data/` (the compiled output) and, per `02-01-SUMMARY.md`, remove `.github/workflows/ci.yml`'s `if [ -d raw ]` recompile-determinism guard once it does, since both `raw/` and `public/data/` will then be committed.
- `SeamRecord.degradesToNonDaily` and `computeTierRanges` give Phase 5 exactly the typed provenance it needs to render tier labels, seam dates, and (per D-17, still unactioned by design) a corrected extended-tier bias statement, all from the manifest rather than hand-authored strings.
- No blockers.

## Self-Check: PASSED

Files confirmed present: `tools/bundle-compiler/src/rate-series.ts`, `tools/bundle-compiler/src/total-return.ts`, `tools/bundle-compiler/src/tiers.ts`, and all four new test files (`tests/rate-series.test.ts`, `tests/series.test.ts`, `tests/seams.test.ts`, `tests/manifest.test.ts`).

Commits confirmed present via `git log --oneline`: `b0c2081` (Task 1), `a82034c` (Task 2), `36ba257` (Task 3).

`npm run typecheck` and `npx vitest run --project unit` (255 tests, whole repo) both exit 0. `npm run compile-data raw public/data` exits 0 against the real committed `raw/` tree, twice, byte-identically.

---
*Phase: 02-compiled-data-bundle*
*Completed: 2026-08-17*
