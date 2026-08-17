---
phase: 02-compiled-data-bundle
plan: 05
subsystem: data
tags: [bundle-compiler, perf-budgets, bench, brotli, decode-timing, generated-pointer-module]

# Dependency graph
requires:
  - phase: 02-compiled-data-bundle
    provides: "compileBundle pipeline, rate splicing, total-return construction and computed tiers (plan 02-04); the full 27-series raw/ tree with real Yahoo/Nasdaq/Shiller/FRED data and no symbol lacking a real total-return source (plans 02-06/02-07)"
provides:
  - "The compiled public/data/ bundle, committed: one shared calendar asset, one shared rate asset, one asset per symbol (11 symbols x 2 series each), and the content-hashed manifest -- proven byte-identical on recompile from the committed raw/ tree"
  - "src/data-bundle.generated.ts (MANIFEST_PATH, BUNDLE_VERSION): the seam Phase 4 imports to locate the manifest without fetching from a fixed, unhashed path (D-22)"
  - "perf-budgets.ts's BudgetUnit ('ms' | 'bytes'), DECLARED_CONNECTION_BYTES_PER_SEC, and two new gated rows (DATA-BUNDLE-BYTES, DATA-BUNDLE-DECODE), both reusing requirementId PERF-08"
  - "bench/bundle-bytes.ts (measureBundleBytes) and the readBundleBytes browser-to-Node command: the compiled bundle's real on-disk raw and brotli-compressed byte totals"
  - "bench/bundle-size.bench.test.ts and bench/decode-time.bench.test.ts: the two new bench rows, both recorded through the same run-level gate every other budget uses"
  - "tools/bundle-compiler/tests/universe.test.ts: DATA-07 coverage assertion against the real committed manifest"
affects: [03-simulation-kernel, 04-app-shell-and-loading, 05-attribution-and-credibility-surface]

# Actuals (#2632)
actuals:
  tokens: 19000
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "compileBundle's srcDir parameter is optional and defaults to skip: the compiler's own fixture-based unit tests call it with two args (never touching the real repo's src/ tree), only cli.ts passes the real 'src' directory it resolves the same way as rawDir/outDir"
    - "A byte-denominated PerfBudget row sets measuredMs === normalizedMs (never divided by the calibration score); the unit field on PerfBudget, not a budget-id allowlist, is what tells bench/report.ts's score-coherence check to skip it, so the exemption cannot silently widen"
    - "The decode-time bench row fetches the compiled bundle by URL from the dev server's public/ mount rather than reading it through a Node command, keeping the measurement in the same browser environment as every other bench figure (Phase 1's one-environment rule)"
    - "A sub-floor bench measurement resolves its batch size by doubling at runtime and catching measureBatchedMinOfN's floor-violation error, rather than a value hand-picked in advance -- confirmed empirically necessary this session (500 was insufficient, 2000 cleared the floor)"

key-files:
  created:
    - src/data-bundle.generated.ts
    - tools/bundle-compiler/tests/universe.test.ts
    - bench/bundle-bytes.ts
    - bench/bundle-size.bench.test.ts
    - bench/decode-time.bench.test.ts
    - public/data/ (14 files: calendar, shared rate, 11 symbol assets, manifest)
  modified:
    - tools/bundle-compiler/src/compile.ts
    - tools/bundle-compiler/src/cli.ts
    - .github/workflows/ci.yml
    - perf-budgets.ts
    - tests/perf-budgets.selftest.test.ts
    - bench/report.ts
    - tests/report.test.ts
    - vitest.config.ts
    - bench/browser-commands.d.ts

key-decisions:
  - "compileBundle gained an optional third srcDir parameter rather than an unconditional derivation from outDir's path structure. Deriving srcDir from outDir (e.g. two levels up) would resolve to an unwritable or wrong location for the compiler's own temp-dir-based unit tests (mkdtempSync directly under the OS tmp root, not nested under a public/ sibling), either throwing EACCES or, worse, silently writing fixture-derived content into the real repo's src/data-bundle.generated.ts on every test run. Only cli.ts (a Rule 3 deviation, not in this plan's declared files_modified list) passes the real value; every existing two-arg test call site is untouched."
  - "The score-coherence exemption in assertRunInvariants is keyed to PERF_BUDGETS[row.budgetId].unit, not to a hardcoded DATA-BUNDLE-BYTES check, per this plan's own T-02-23 threat register entry: a byte row's normalizedMs equals its measuredMs by construction, so the exemption generalizes to any future byte-denominated row without a code change."
  - "The decode bench test fetches assets by URL (direct fetch(MANIFEST_PATH) against the Vite dev server's public/ mount) rather than falling back to Vite's ?url static-import mechanism: the direct fetch worked on the first attempt this session, and a ?url import cannot address the manifest's dynamically-named, content-hashed asset filenames statically anyway."

patterns-established:
  - "The generated pointer module (src/data-bundle.generated.ts) is written with the same write-then-rename discipline as every binary asset (encode.ts's writeAsset), deterministic and reproducible across recompiles."
  - "Every new PerfBudget entry that reuses an existing requirementId documents its derivation in its own description field, so a threshold is never an unexplained round number."

requirements-completed: [DATA-07, DATA-01, DATA-09]

coverage:
  - id: D1
    description: "npm run compile-data raw public/data compiles the whole real 27-series universe with no error and no calendar exception needed; the emitted manifest covers all eleven symbols, each with a price-return and a total-return series, plus the shared rate series and calendar"
    requirement: DATA-07
    verification:
      - kind: unit
        ref: "tools/bundle-compiler/tests/universe.test.ts (real committed manifest, 8 tests)"
        status: pass
      - kind: integration
        ref: "npm run compile-data raw public/data (real run, this session): exit 0, no warnings, 23 series (11 symbols x 2 + @rate/rate), bundleVersion 45a9f1ae6444"
        status: pass
    human_judgment: false
  - id: D2
    description: "The compiled bundle is committed and CI recompiles it from the committed raw inputs, failing on any difference; the interim raw/-existence guard is removed"
    requirement: DATA-01
    verification:
      - kind: integration
        ref: "npm run compile-data raw public/data && git diff --exit-code -- public/data src/data-bundle.generated.ts (exit 0, verified twice this session)"
        status: pass
    human_judgment: false
  - id: D3
    description: "src/data-bundle.generated.ts (MANIFEST_PATH, BUNDLE_VERSION) locates the content-hashed manifest through a generated pointer module rather than an unhashed document"
    requirement: DATA-09
    verification:
      - kind: unit
        ref: "node -e assertion checking MANIFEST_PATH/BUNDLE_VERSION exports are present"
        status: pass
    human_judgment: false
  - id: D4
    description: "PerfBudget gains a required unit field ('ms' | 'bytes'); two new rows (DATA-BUNDLE-BYTES, DATA-BUNDLE-DECODE) reuse requirementId PERF-08, both thresholds equal their anchors (no relaxationReason owed), and the count self-test is updated in the same commit"
    verification:
      - kind: unit
        ref: "tests/perf-budgets.selftest.test.ts (13-entry count, 8 requirement ids, unit-field/byte-count assertion)"
        status: pass
      - kind: integration
        ref: "npm run typecheck (exit 0, exhaustiveness check holds)"
        status: pass
    human_judgment: false
  - id: D5
    description: "bench/report.ts's renderTable prints a byte suffix for the byte row and a millisecond suffix for every duration row; assertRunInvariants' score-coherence check skips a byte row on a non-1.0-score machine and still fires for a divergent millisecond row"
    verification:
      - kind: unit
        ref: "tests/report.test.ts 'D-23: unit-denominated rows' describe block (4 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "npm run bench reports DATA-BUNDLE-BYTES and DATA-BUNDLE-DECODE as two live, gated rows with real non-zero measured values and a pass verdict; the decode figure is amortized past the timer-resolution floor via measureBatchedMinOfN with its batch disclosed"
    requirement: DATA-01
    verification:
      - kind: integration
        ref: "npm run bench (real run, this session): DATA-BUNDLE-BYTES 726,806 compressed bytes / 1,125,000 budget (pass), DATA-BUNDLE-DECODE 0.01ms normalized / 100ms budget (pass), batch doubled 500->2000 (batchMinMs 12.2-13.0ms, clears the 10ms floor)"
        status: pass
      - kind: integration
        ref: "npm run bench:selftest (exit 1, unchanged) and a live threshold-lowering probe (npm run bench exit 1 naming DATA-BUNDLE-DECODE, reverted with zero diff against perf-budgets.ts)"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-08-17
status: complete
---

# Phase 02 Plan 05: Compile the Real Bundle and Gate Its Size and Decode Time Summary

**Compiled the full 27-series raw/ tree into a committed 23-series bundle with no calendar disagreement to resolve, added a generated MANIFEST_PATH/BUNDLE_VERSION pointer module, and gave `npm run bench` two new live rows -- 726,806 compressed bytes against a 1,125,000-byte budget and a 0.01ms normalized decode against a 100ms budget -- both gated through the existing run-level invariant check.**

## Performance

- **Duration:** ~35min
- **Completed:** 2026-08-17
- **Tasks:** 3 of 3
- **Files modified:** 28 (9 source/config files, 14 compiled bundle assets, 5 new files)

## Accomplishments

- `npm run compile-data raw public/data` compiled the whole real, committed 27-series `raw/` tree with exit 0, no warnings, and **no calendar disagreement**: `raw/calendar-exceptions.json` needed no new entries this session. The emitted manifest carries 23 series (11 symbols x price-return + total-return, plus the shared `@rate/rate` series), matching `bundleVersion=45a9f1ae6444` -- the same value 02-04-SUMMARY.md recorded, confirming the `raw/` tree was unchanged since then.
- Extended `compileBundle` with an optional `srcDir` parameter that writes `src/data-bundle.generated.ts` (`MANIFEST_PATH`, `BUNDLE_VERSION`) after the manifest, write-then-rename, deterministic. Made it optional specifically so the compiler's own temp-dir-based unit tests never touch the real repo's `src/` tree (see Deviations).
- Committed the compiled `public/data/` bundle (14 files, 1,664,060 raw bytes / 726,806 brotli-compressed) and the generated pointer module. A second compile against the same `raw/` tree reproduced byte-identical output, confirmed via `git diff --exit-code` against the staged content.
- Added `tools/bundle-compiler/tests/universe.test.ts`: 8 tests asserting DATA-07 coverage against the real committed manifest -- every declared symbol has exactly one price-return and one total-return series, no unexpected symbol is present, the shared rate series and calendar exist, every series carries sourced provenance and computed tiers, the rate series covers the widest extended range at both ends (DATA-04), and NDX's asymmetric ragged left edges (1985-10-01 price-return, 1999-03-04 total-return) are asserted as legitimate rather than caught as a defect.
- Removed the interim `if [ -d raw ]` recompile-determinism guard in `.github/workflows/ci.yml` now that both `raw/` and `public/data/` are committed, and extended the diff check to cover the generated pointer module.
- Added `BudgetUnit` (`'ms' | 'bytes'`), `DECLARED_CONNECTION_BYTES_PER_SEC` (1,250,000, 10 Mbps) and a required `unit` field to `PerfBudget` in `perf-budgets.ts`. Set `unit: 'ms'` on all eleven existing entries with no other change, then added `DATA-BUNDLE-BYTES` (bytes, 1,125,000 threshold/anchor -- 900ms of PERF-08b's budget at the declared connection speed) and `DATA-BUNDLE-DECODE` (ms, 100 threshold/anchor -- the complementary 100ms decode share). Both reuse `requirementId: 'PERF-08'`, so `RequirementId` gained no member and the compile-time exhaustiveness check was untouched.
- Made `bench/report.ts` unit-aware: `renderTable` reads the row's declared unit for its suffix instead of a hardcoded `ms`, and `assertRunInvariants`'s score-coherence check skips any row whose budget unit is not `'ms'` (a byte count's `normalizedMs` equals its `measuredMs` by construction and would otherwise fail coherence on any machine whose calibration score isn't exactly 1.0). `checkBudget` and `assertWithinBudget` are untouched -- no parallel assertion path.
- Updated `tests/perf-budgets.selftest.test.ts`'s hardcoded entry-count self-test to 13 (RESEARCH.md's own predicted Pitfall 2) and added a unit-field/byte-count assertion; extended `tests/report.test.ts` with the byte/ms suffix, the score-coherence exemption and its still-firing millisecond counterpart, and `buildFullRowSet` coverage for both new ids.
- Built `bench/bundle-bytes.ts` (Node-only, mirrors `bench/accumulator-store.ts`'s separation from browser-imported code): `measureBundleBytes` sums raw and brotli-compressed (`zlib.brotliCompressSync`, deterministic, no dependency) byte lengths of every file in the compiled output directory, throwing on an empty directory. Wired a `readBundleBytes` browser-to-Node command in `vitest.config.ts` (same pattern as `readCalibration`) and declared its type in `bench/browser-commands.d.ts`.
- Built `bench/bundle-size.bench.test.ts`: records `DATA-BUNDLE-BYTES` with `measuredMs`/`normalizedMs` both set to the compressed byte total (never divided by the calibration score), `source: 'production'`, and an info line disclosing file count, raw total, compressed total and ratio.
- Built `bench/decode-time.bench.test.ts`: locates the manifest via the generated `MANIFEST_PATH` pointer, fetches it and every asset it references directly from the dev server's `public/` mount (the direct fetch worked; the plan's `?url`-import fallback was not needed), holds every asset's `ArrayBuffer` outside the timed region, and times `decodeHeader` + `seriesView` across all 23 series with `measureBatchedMinOfN`. Batch size starts at 500 (matching `PERF_02_BATCH_SIZE`) and doubles at runtime by catching the floor-violation error until the batch minimum clears `MIN_MEASUREMENT_MS` -- empirically required doubling to 2000 this session (batch minimum 12.2-13.0ms across three runs).
- `npm run bench` exits 0 with both new rows visible under the `PERF-08` group header, both `unmeasured` before their bench files existed and both real, non-zero, passing measurements after: `DATA-BUNDLE-BYTES` 726,806 bytes (64.6% of its 1,125,000-byte budget, well under the 70% escalation trigger) and `DATA-BUNDLE-DECODE` 0.01ms normalized (0.01% of its 100ms budget). Total bench runtime ~6s against the 30s cap.

## Task Commits

1. **Task 1: Compile the real universe, resolve every disagreement in writing, and commit the bundle** - `b944cc2` (feat)
2. **Task 2: Two new budget rows and a unit field, without relaxing anything or breaking the count self-test** - `190e15a` (feat)
3. **Task 3: Measure the bundle's transfer size and its decode time, and gate both** - `684f7da` (feat)

**Plan metadata:** this SUMMARY.md, committed separately per the calling agent's instructions (STATE.md/ROADMAP.md are the orchestrator's to update).

## Files Created/Modified

- `tools/bundle-compiler/src/compile.ts` -- `writeGeneratedPointerModule`, optional `srcDir` param on `compileBundle`
- `tools/bundle-compiler/src/cli.ts` -- resolves and passes the real `src/` directory (deviation, see below)
- `src/data-bundle.generated.ts` -- generated, committed: `MANIFEST_PATH`, `BUNDLE_VERSION`
- `public/data/` -- the compiled bundle: 14 files (calendar, shared rate, 11 symbol assets, manifest)
- `tools/bundle-compiler/tests/universe.test.ts` -- new, DATA-07 coverage against the real manifest
- `.github/workflows/ci.yml` -- removed the interim `raw/`-existence guard
- `perf-budgets.ts` -- `BudgetUnit`, `DECLARED_CONNECTION_BYTES_PER_SEC`, `unit` field, `DATA-BUNDLE-BYTES`, `DATA-BUNDLE-DECODE`
- `bench/report.ts` -- `renderTable`/`assertRunInvariants` unit-aware
- `tests/perf-budgets.selftest.test.ts`, `tests/report.test.ts` -- updated/extended
- `bench/bundle-bytes.ts` -- new, Node-only, `measureBundleBytes`
- `bench/bundle-size.bench.test.ts`, `bench/decode-time.bench.test.ts` -- new
- `vitest.config.ts`, `bench/browser-commands.d.ts` -- `readBundleBytes` command

## Decisions Made

See `key-decisions` in frontmatter for full rationale. In short: `compileBundle`'s `srcDir` is an optional third parameter (not derived from `outDir`'s path structure) so the compiler's own fixture-based tests never touch the real `src/` tree; the score-coherence exemption is keyed to the budget's `unit` field rather than a budget-id allowlist, so it generalizes to any future byte row; and the decode bench test fetches assets by URL rather than falling back to a static `?url` import, since the direct fetch worked and the manifest's asset filenames are content-hashed and unknown at test-write time anyway.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `cli.ts` needed to pass the new `srcDir` parameter, but was not in this plan's declared `files_modified` list**

- **Found during:** Task 1, wiring `compileBundle`'s new optional `srcDir` parameter through to a real invocation.
- **Issue:** This plan's frontmatter `files_modified` and Task 1's own `<files>` tag list `compile.ts` but not `cli.ts`. Without updating `cli.ts` to resolve and pass the real `src/` directory, `npm run compile-data raw public/data` would never actually write `src/data-bundle.generated.ts`, directly contradicting the plan's own `<behavior>` block ("`src/data-bundle.generated.ts` exports a `MANIFEST_PATH`...").
- **Fix:** Added three lines to `cli.ts`: resolve `srcDir` via the same `resolveContained('src', cwd)` containment check already applied to `rawDir`/`outDir`, and pass it as `compileBundle`'s third argument. No change to the CLI's own usage/argument count (`compile-data <rawDir> <outDir>` unchanged; `srcDir` is not a third positional).
- **Files modified:** `tools/bundle-compiler/src/cli.ts`.
- **Verification:** `npm run compile-data raw public/data` now writes `src/data-bundle.generated.ts`; the acceptance-criteria `node -e` check confirming `MANIFEST_PATH`/`BUNDLE_VERSION` exports pass.
- **Committed in:** `b944cc2` (Task 1 commit).

---

**Total deviations:** 1 Rule 3 (blocking-issue) auto-fix. No architectural changes (no Rule 4 territory) and no scope creep beyond what was needed to make Task 1's own stated behavior true.
**Impact on plan:** All three tasks' `<behavior>`, `<acceptance_criteria>`, and the plan's overall `<verification>` items pass, including real, non-simulated measurements for both new bench rows.

## Issues Encountered

None beyond the deviation documented above. The decode-time bench test's initial batch size (500, matching `PERF_02_BATCH_SIZE`) was insufficient to clear the 10ms floor on the first empirical run (measured well under 10ms per 500-call batch); the doubling loop resolved this automatically to 2000, confirming RESEARCH.md Pitfall 3's prediction that a zero-copy view decode lands in exactly the sub-floor regime Phase 1 already proved the timer cannot resolve without batching.

## User Setup Required

None. No external service configuration required; the real compile ran entirely against already-committed `raw/` data, and both bench measurements ran against the freshly compiled, committed `public/data/` bundle.

## Next Phase Readiness

- Phase 2's fifth success criterion (a number attached to the data layer) is now satisfied: the compiled bundle is committed, CI proves it reproducible from the sourced `raw/` inputs, and both its transfer size and decode time are live, gated bench rows.
- Phase 3 (simulation kernel) can read the compiled bundle directly: real UPRO/TQQQ price series are available at `public/data/upro.*.bin` / `public/data/tqqq.*.bin` via the manifest.
- Phase 4 (app shell and loading) has the seam it needs: `import { MANIFEST_PATH, BUNDLE_VERSION } from '../src/data-bundle.generated.ts'` locates the manifest without any hand-authored path, and `DATA-BUNDLE-BYTES`/`DATA-BUNDLE-DECODE` are already measured and gated ahead of Phase 4 adding fetch and first render on top of them.
- Both new budget rows measured comfortably under their thresholds this session (64.6% and 0.01% of budget respectively), with headroom before either approaches the 70% D-20 escalation trigger even as the universe or format layout evolves.
- No blockers.

## Self-Check: PASSED

Files confirmed present: `tools/bundle-compiler/src/compile.ts`, `tools/bundle-compiler/src/cli.ts`, `src/data-bundle.generated.ts`, `tools/bundle-compiler/tests/universe.test.ts`, `perf-budgets.ts`, `bench/report.ts`, `bench/bundle-bytes.ts`, `bench/bundle-size.bench.test.ts`, `bench/decode-time.bench.test.ts`, `public/data/manifest.f0a9dfbdfa.json`.

Commits confirmed present via `git log --oneline`: `b944cc2` (Task 1), `190e15a` (Task 2), `684f7da` (Task 3).

`npm run typecheck` and `npx vitest run --project unit` (269 tests, whole repo) both exit 0. `npm run compile-data raw public/data` exits 0 and `git diff --exit-code -- public/data src/data-bundle.generated.ts` exits 0 immediately after, twice. `npm run bench` exits 0 with both new rows passing; `npm run bench:selftest` still exits non-zero against the deliberately over-budget fixture.

---
*Phase: 02-compiled-data-bundle*
*Completed: 2026-08-17*
