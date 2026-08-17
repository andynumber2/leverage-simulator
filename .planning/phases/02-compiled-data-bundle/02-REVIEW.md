---
phase: 02-compiled-data-bundle
reviewed: 2026-08-17T00:00:00Z
depth: standard
files_reviewed: 47
files_reviewed_list:
  - .github/workflows/ci.yml
  - bench/browser-commands.d.ts
  - bench/bundle-bytes.ts
  - bench/bundle-size.bench.test.ts
  - bench/decode-time.bench.test.ts
  - bench/report.ts
  - package.json
  - perf-budgets.ts
  - raw/NDX-TR.meta.json
  - raw/RATE-DFF.meta.json
  - raw/RATE-DTB3.meta.json
  - raw/RATE-NBER.meta.json
  - raw/RATE-TB3MS.meta.json
  - raw/calendar-exceptions.json
  - src/data-bundle.generated.ts
  - tests/perf-budgets.selftest.test.ts
  - tests/report.test.ts
  - tools/bundle-compiler/src/binary-format.ts
  - tools/bundle-compiler/src/calendar.ts
  - tools/bundle-compiler/src/cli.ts
  - tools/bundle-compiler/src/compile.ts
  - tools/bundle-compiler/src/encode.ts
  - tools/bundle-compiler/src/gap-policy.ts
  - tools/bundle-compiler/src/manifest.ts
  - tools/bundle-compiler/src/rate-series.ts
  - tools/bundle-compiler/src/raw-input.ts
  - tools/bundle-compiler/src/seams.ts
  - tools/bundle-compiler/src/tiers.ts
  - tools/bundle-compiler/src/total-return.ts
  - tools/bundle-compiler/tests/calendar.test.ts
  - tools/bundle-compiler/tests/fixtures/make-fixture.ts
  - tools/bundle-compiler/tests/gap-policy.test.ts
  - tools/bundle-compiler/tests/manifest.test.ts
  - tools/bundle-compiler/tests/rate-series.test.ts
  - tools/bundle-compiler/tests/roundtrip.test.ts
  - tools/bundle-compiler/tests/seams.test.ts
  - tools/bundle-compiler/tests/series.test.ts
  - tools/bundle-compiler/tests/universe.test.ts
  - tools/bundle-compiler/tests/versioning.test.ts
  - tools/fetch-data/MANUAL-DOWNLOAD.md
  - tools/fetch-data/README.md
  - tools/fetch-data/src/fetch.ts
  - tools/fetch-data/src/normalize.ts
  - tools/fetch-data/src/sources.ts
  - tools/fetch-data/tests/cross-check.test.ts
  - tools/fetch-data/tests/normalize.test.ts
  - tsconfig.json
  - vitest.config.ts
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-08-17T00:00:00Z
**Depth:** standard
**Files Reviewed:** 47
**Status:** issues_found

## Summary

This phase implements the bundle compiler (`tools/bundle-compiler`) and the data-fetch/normalize
layer (`tools/fetch-data`), plus the perf-budget/bench scaffolding that measures the compiled
bundle's transfer size and decode time.

Given the domain framing ("a silent wrong number is a Critical finding here"), I traced the
numerically load-bearing paths by hand rather than trusting the docstrings: calendar derivation
(`calendar.ts`), gap classification/carry-forward (`gap-policy.ts`), the four-source rate splice
with its precedence-window computation (`rate-series.ts`), pre-real-total-return construction
(`total-return.ts`, including the dividend day-count accrual and the units of the Shiller yield
input), tier-range computation from seam records (`tiers.ts`), the two-pass bundle-version
derivation and binary encode/decode round trip (`compile.ts`, `binary-format.ts`, `encode.ts`),
and the untrusted-input normalizers for Yahoo/FRED/Shiller/Nasdaq (`normalize.ts`). I also
cross-checked several of these against the real committed `raw/` data and the real committed
`public/data/manifest.*.json` output rather than fixtures alone (e.g. verified the rate-source
precedence windows resolve correctly given DTB3's real first date, 1954-01-04, precedes DFF's,
1954-07-01 — the "min over all higher ranks" cutoff computation in `computeRankWindows` handles
this non-monotonic case correctly, confirmed against the real compiled `@rate/rate` manifest
entry's seam list).

I did not find a Critical-severity defect: no case where the compiler silently produces a wrong
number, corrupts the binary format, or mis-splices a rate/dividend source. The two candidate bugs
I traced most suspiciously (a possible unit mismatch between the Shiller dividend-yield input and
the rate series' `percent-annualized` unit, and a possible out-of-bounds read in the backward
total-return construction when the price series doesn't reach back to the real series' first date)
both turned out to be either non-issues (the Shiller sidecar correctly declares `units: "ratio"`,
a decimal fraction, and the code multiplies it directly with no missing `/100`) or defended by a
downstream `Number.isFinite` guard that throws a domain-scoped error rather than returning a wrong
value. The remaining findings below are robustness/quality gaps: places where an unvalidated
assumption is currently true of the committed data but not enforced, or where an untrusted-input
parser has a documented-but-real gap that the current vendor files happen not to exercise.

## Warnings

### WR-01: `buildTotalReturnSeries` assumes the price series reaches the real total-return series' own first date, with no explicit check

**File:** `tools/bundle-compiler/src/total-return.ts:86-121`
**Issue:** The backward construction loop reads `priceAt(i+1)` up to `i+1 = sIndex` (the real
total-return series' own first date `S`), via `priceAt(calendarIndex) => priceSeries.values[calendarIndex - priceStartIndex]!`.
Nothing asserts that `priceSeries` (the aligned price-return input) actually extends through
`sIndex`. If a future symbol's price-return raw input ends before its total-return raw input
begins, `priceAt(sIndex)` reads past the end of `priceSeries.values`, returns `undefined`, and the
non-null assertion (`!`) does not perform a runtime check — the resulting arithmetic produces
`NaN`, which is caught by the `Number.isFinite(level)` guard a few lines later and thrown as
`"total-return construction ... produced a non-finite level at <date>"`. The failure is loud, not
silent, but the error message does not point at the actual root cause (a price-series coverage
gap), so a future maintainer debugging this would have to work backward from "non-finite level" to
"the price series doesn't reach back far enough" themselves.
**Fix:** Add an explicit precondition check before the construction loop, naming the scope and both
dates directly:
```ts
if (priceSeries.calendarStartIndex + priceSeries.values.length - 1 < sIndex) {
  throw new Error(
    `compile-data: total-return construction for "${scope}": price series ends before ` +
    `real total-return series' own first date "${realTotalReturnSeries.firstDate}"`,
  )
}
```

### WR-02: `splitCsvFields` does not handle RFC4180 escaped quotes (`""`) inside a quoted field

**File:** `tools/fetch-data/src/normalize.ts:471-490`
**Issue:** `splitCsvFields` toggles `inQuotes` on every `"` character with no lookahead for the
standard CSV escape sequence (`""` representing one literal `"` inside a quoted field). A field
like `"5,000""x"` (meant to represent the literal value `5,000"x`) would be parsed as `5,000x` —
the embedded quote character is silently dropped rather than preserved, with no error. The
docstring explicitly frames this as a generic parser ("this parser should not be one column
addition away from silently reading the wrong number"), and it is reused for both the Shiller
dividend CSV and the Nasdaq export, both of which are untrusted vendor exports per this phase's
stated concern. None of the currently-committed vendor files exercise this path (verified via the
passing `tests/normalize.test.ts` suite against the real committed files), so this is latent, not
manifesting today — but a future Nasdaq or Shiller export that legitimately quotes an embedded
quote character would corrupt that field without any error surfacing.
**Fix:** Handle the `""` escape explicitly:
```ts
if (ch === '"') {
  if (inQuotes && line[i + 1] === '"') {
    current += '"'
    i++
    continue
  }
  inQuotes = !inQuotes
  continue
}
```

### WR-03: `applyGapPolicy` only batches fatal violations within one classification tier before throwing

**File:** `tools/bundle-compiler/src/gap-policy.ts:144-281`
**Issue:** The module doc comment states the function "collects every violation of a given
classification before throwing, so one compile run names everything that needs fixing rather than
the first offender only." In practice, classification 1 (extra bars, lines 149-169) throws
immediately if any extra bar is found, before classification 2/3 (interior gaps, lines 192-281) is
ever evaluated. A raw CSV that carries both an extra bar and an unrelated interior gap will only
ever report the extra bar on the first compile; after that is fixed (or excepted) and the compiler
is re-run, the interior gap surfaces on the second run. This doesn't corrupt any output — it's a
diagnostics completeness gap relative to what the doc comment promises ("one compile run names
everything").
**Fix:** Either narrow the doc comment to scope the "one run" claim to within a classification
tier (as the code actually behaves), or defer the extra-bar throw until after the interior-gap
scan has also run, collecting both violation sets before the first throw.

## Info

### IN-01: Nasdaq two-digit-year century pivot is a hardcoded, time-bounded assumption

**File:** `tools/fetch-data/src/normalize.ts:722-729`
**Issue:** `normalizeNasdaq`'s date parser resolves a two-digit year via `twoDigitYear < 70 ? 2000 : 1900`. This is explicitly documented as safe only because "this series begins in 1999 and cannot contain a year this pivot resolves wrongly" — but that assumption silently expires in the year 2070, at which point a legitimate `'70'` (meaning 2070) would resolve to 1970. Low urgency (44 years out), flagged for awareness only.
**Fix:** No action needed now; consider a comment reminder or a guard that throws if a parsed date exceeds a sanity bound (e.g. more than a few years in the future) so a future silent misparse fails loudly instead.

### IN-02: `decodeHeader` does not bounds-check declared lengths against the actual buffer before slicing

**File:** `tools/bundle-compiler/src/binary-format.ts:176-231`
**Issue:** `decodeHeader` trusts `bundleVersionByteLength`, `descriptorCount`, and each descriptor's `idByteLength` to be consistent with the buffer's real size before constructing `Uint8Array` views over them. A truncated or corrupted asset file would surface as a low-level `RangeError` from the `DataView`/`Uint8Array` constructor rather than a `binary-format:`-prefixed domain error. Low risk in this project's threat model (the binary assets are produced and consumed entirely by this repo's own build pipeline, not accepted from an external/untrusted source at runtime), but worth noting since `decodeHeader` is also the function Phase 4's browser-side decoder will reuse against a fetched asset.
**Fix:** Optional: validate `headerByteLength`/descriptor byte ranges against `buffer.byteLength` up front and throw a `binary-format:`-prefixed error naming the mismatch, for a clearer failure if a fetch is ever truncated.

### IN-03: `assertRateCoversAllTiers` cannot be tripped by the real compile pipeline

**File:** `tools/bundle-compiler/src/compile.ts:164-179`
**Issue:** `extended` (computed in `tiers.ts`'s `computeTierRanges`) is, by construction, the
intersection of the pair's own range and the rate range, which means `rateRange` always covers
`extended` trivially — the guard this function exists to provide can never actually fire from
real pipeline data, only from the hand-constructed fault-injection test in
`manifest.test.ts`. This is already self-documented in the function's own doc comment ("this always
holds by construction ... this assertion is what keeps that true as symbols are added") and
directly unit-tested for load-bearingness, so it's intentional defensive code, not a defect —
noted here only so a future reader doesn't mistake "this can never fail today" for "this is dead
code that should be removed."
**Fix:** None; no action needed.

---

_Reviewed: 2026-08-17T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
