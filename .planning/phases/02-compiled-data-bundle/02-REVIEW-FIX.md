---
phase: 02-compiled-data-bundle
fixed_at: 2026-08-17T22:08:34Z
review_path: .planning/phases/02-compiled-data-bundle/02-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 02: Code Review Fix Report

**Fixed at:** 2026-08-17T22:08:34Z
**Source review:** .planning/phases/02-compiled-data-bundle/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (WR-01, WR-02, WR-03; scope was `critical_warning`, so IN-01/IN-02/IN-03 were left untouched)
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: `buildTotalReturnSeries` assumes the price series reaches the real total-return series' own first date, with no explicit check

**Files modified:** `tools/bundle-compiler/src/total-return.ts`
**Commit:** a7f8757
**Applied fix:** Added the precondition check exactly as suggested in the review, placed after the early-return for "no construction needed" and before the loop first reads `priceAt`: if the price series' calendar coverage ends before `sIndex` (the real total-return series' own first date), throw a domain-scoped error naming the scope and the real series' first date, instead of letting the loop read past the end of `priceSeries.values` and surface as a generic non-finite-level error. This is error-message/precondition work only -- no arithmetic changed. Confirmed no computed number moved: `npm run compile-data raw <dir>` output remains byte-identical to the committed `public/data/`.

### WR-02: `splitCsvFields` does not handle RFC4180 escaped quotes (`""`) inside a quoted field

**Files modified:** `tools/fetch-data/src/normalize.ts`
**Commit:** 37dce9a
**Applied fix:** Applied the fix exactly as suggested in the review: when encountering a `"` while already inside a quoted field, look ahead one character; if it is also `"`, append a literal `"` to the current field and skip both characters (the RFC4180 escape), otherwise toggle `inQuotes` as before. None of the currently-committed vendor CSVs (Shiller, Nasdaq) contain this escape sequence, so the fix is latent-bug prevention, not a change to any currently-parsed value -- confirmed via the full unit suite (269 tests) still passing and the compiled bundle output remaining byte-identical to `public/data/`.

### WR-03: `applyGapPolicy` only batches fatal violations within one classification tier before throwing

**Files modified:** `tools/bundle-compiler/src/gap-policy.ts`
**Commit:** 55735a5
**Applied fix:** Chose the doc-comment-correction option from the review's two alternatives rather than restructuring the throw to defer past classification 2/3. Deferring the extra-bar throw would mean evaluating the interior-gap scan even when extra bars already exist, a control-flow change against the phase's numerically load-bearing gap-classification path with no offsetting correctness benefit (the current behavior does not corrupt output, only reports incompletely across runs). Narrowed `applyGapPolicy`'s doc comment to state precisely what the code does: classification 1 (extra bars) throws before classification 2/3 (interior gaps) is evaluated, so violations in different classifications on the same series surface across separate compile runs, not one. No computed number or control flow changed; verified via full unit suite and byte-identical compiled output.

## Skipped Issues

None -- all three in-scope findings were fixed.

## Verification

All three required checks passed after all three fixes were applied, run inside the isolated review-fix worktree (`.claude/worktrees/rf-02-68195-1787004420`, branch `gsd-reviewfix/02-68195`, fast-forwarded onto `gsd/phase-02-compiled-data-bundle` on cleanup):

- `npm run typecheck` -- exit 0, no errors.
- `npx vitest run --project unit` -- 17 test files, 269 tests, all passed.
- `npm run compile-data raw <dir>` -- succeeded, and `diff -rq` against the committed `public/data/` reported zero differences (byte-identical). This is the phase's load-bearing invariant; none of the three fixes moved a single output byte.

Out-of-scope findings (IN-01, IN-02, IN-03) were left untouched per `fix_scope: critical_warning`.

---

_Fixed: 2026-08-17T22:08:34Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
