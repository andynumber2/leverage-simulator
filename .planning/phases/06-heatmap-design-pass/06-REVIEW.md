---
phase: 06-heatmap-design-pass
reviewed: 2026-08-21T19:48:06Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - src/colorscale/value-to-color.ts
  - src/data/sweep-fixture-format.ts
  - scripts/build-sweep-fixture.ts
  - .planning/phases/06-heatmap-design-pass/mockups/shared/field-sampler.ts
  - .planning/phases/06-heatmap-design-pass/mockups/shared/iso-lines.ts
  - .planning/phases/06-heatmap-design-pass/mockups/shared/mockup-runtime.ts
  - tests/color-scale-cvd.test.ts
  - tests/field-sampler.test.ts
  - tests/iso-lines.test.ts
  - tests/sweep-fixture-format.test.ts
  - tests/value-to-color.test.ts
  - bench/heatmap-repaint.bench.test.ts
  - bench/heatmap-form-2.bench.test.ts
  - bench/heatmap-form-3.bench.test.ts
  - bench/heatmap-form-4.bench.test.ts
  - bench/sweep-fixture-bridge.ts
  - package.json
  - vitest.config.ts
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues
---

# Phase 06: Code Review Report

**Reviewed:** 2026-08-21T19:48:06Z
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

No critical defects. The numeric core is solid: `value-to-color.ts`'s log10/clamp handling of
zero, negative, and out-of-domain inputs is correct and well covered (including the 135-cell
domain-floor clip path called out in the review brief); `BAND_LEVELS` is strictly ascending with
no duplicate boundaries and `bandIndexFor`'s tie rule is verified against non-uniform gaps;
`field-sampler.ts`'s bilinear stencil correctly refuses to blend a categorical corner into a
valued neighbour, and its four-corner tie-break rule (lower row, then lower column) is exercised
from multiple angles in `tests/field-sampler.test.ts`; `iso-lines.ts`'s saddle disambiguation is
checked against two hand-computed worked examples plus a closed-contour endpoint-pairing property
test, which is a genuinely strong test for a marching-squares implementation.
`sweep-fixture-format.ts`'s encoder and decoder agree on every offset, the total-length check runs
before any payload typed-array view is constructed (so a forged `cols`/`rows` cannot drive a
runaway allocation even though `cols * rows` is not itself bounds-checked), and the fail-loud
contract is tested for every documented failure mode.

Three Warnings below are genuine robustness/maintainability gaps, none of them defects that
produce a visibly wrong heatmap today. The most important is the test-fragility one
(`tests/sweep-fixture-format.test.ts` hardcoding a content-hashed manifest filename that the
codebase already has a stable accessor for) because it will fail the build on an unrelated bundle
regeneration.

## Warnings

### WR-01: `encodeSweepFixture` does not validate `meta.entryDates`/`meta.leverages` length before writing

**File:** `src/data/sweep-fixture-format.ts:156-204`
**Issue:** `encodeSweepFixture` throws if `fixture.multiples.length`, `fixture.drawdowns.length`,
or `fixture.flags.length` disagree with `cols * rows` (lines 158-172), but never checks that
`fixture.meta.entryDates.length === fixture.cols` or `fixture.meta.leverages.length ===
fixture.rows`. `decodeSweepFixture` does check these (lines 263-272) and throws
`SweepFixtureFormatError`, so a caller that builds a mismatched `meta` object gets a file written
to disk successfully and only discovers the corruption the next time something reads it — the
opposite of the "fail loudly" contract this module's own header comment states as its purpose.
`tests/sweep-fixture-format.test.ts`'s own "entryDates length disagrees with cols" test
demonstrates this: it encodes a bad fixture without error, then decodes it to prove the failure.
**Fix:**
```ts
if (fixture.meta.entryDates.length !== fixture.cols) {
  throw new Error(
    `encodeSweepFixture: meta.entryDates.length (${fixture.meta.entryDates.length}) does not equal cols (${fixture.cols})`,
  )
}
if (fixture.meta.leverages.length !== fixture.rows) {
  throw new Error(
    `encodeSweepFixture: meta.leverages.length (${fixture.meta.leverages.length}) does not equal rows (${fixture.rows})`,
  )
}
```

### WR-02: `mountMockup` discards `onThemeChange`'s unsubscribe function

**File:** `.planning/phases/06-heatmap-design-pass/mockups/shared/mockup-runtime.ts:446`
**Issue:** `onThemeChange(callback: () => void): () => void` (see `src/app/theme.ts:115`) returns
an unsubscribe function specifically so a caller can stop listening. `mountMockup` calls
`onThemeChange(() => paint(ctx))` and never captures or invokes the returned unsubscribe. In the
current throwaway mockup usage (one `mountMockup` call per page load, page never torn down) this
is harmless. This file is explicitly flagged as production-bound for Phase 7 ("real algorithms
Phase 7 will lift from the throwaway mockups"); if `mountMockup` (or logic adapted from it) is
reused inside a component that mounts and unmounts repeatedly, every mount adds a permanent entry
to `theme.ts`'s module-level `listeners` Set, each one holding a closure over a `ctx` from a
canvas that may since be detached — an unbounded listener leak and wasted repaint work on a dead
canvas.
**Fix:** Have `mountMockup` capture and return (or otherwise expose) the unsubscribe function, so
Phase 7's ported version can call it on unmount:
```ts
const unsubscribe = onThemeChange(() => paint(ctx))
paint(ctx)
return unsubscribe // or attach to a lifecycle hook the caller controls
```

### WR-03: Hardcoded content-hashed manifest filename bypasses the codebase's own stable accessor

**File:** `tests/sweep-fixture-format.test.ts:36`
**Issue:** `MANIFEST_PATH = path.join(REPO_ROOT, 'public/data/manifest.f0a9dfbdfa.json')` embeds
the current build's content hash directly. Every other manifest consumer in this codebase
(`src/data/load-bundle-node.ts`, `src/data/load-bundle-browser.ts`, and this same phase's own
`scripts/build-sweep-fixture.ts` via `loadBundleFromDisk`) resolves the manifest through the
generated `MANIFEST_PATH` export in `src/data-bundle.generated.ts`, which always matches the
current bundle. Regenerating the data bundle (a routine, unrelated operation) changes the content
hash and breaks this test with a file-not-found error that has nothing to do with a real
regression in the fixture format.
**Fix:** Import the generated constant instead of hardcoding the hash:
```ts
import { MANIFEST_PATH } from '../src/data-bundle.generated.ts'
const MANIFEST_FULL_PATH = path.join(REPO_ROOT, 'public', MANIFEST_PATH)
```

## Info

### IN-01: Nested ternary operators in `field-sampler.ts`

**File:** `.planning/phases/06-heatmap-design-pass/mockups/shared/field-sampler.ts:68,104`
**Issue:** `const clamped = t < 0 ? 0 : t > 1 ? 1 : t` (`bandIndexFor`) and `return value < 0 ? 0 :
value > max ? max : value` (`clampIndex`) are chained/nested ternaries. This is a common
three-way-clamp idiom, but it violates the project's stated style rule against nested ternaries.
Since this file is explicitly production-bound, worth a pass before Phase 7 lifts it.
**Fix:**
```ts
function clampIndex(value: number, max: number): number {
  if (value < 0) return 0
  if (value > max) return max
  return value
}
```

### IN-02: Domain-floor clamping is visually indistinguishable from legitimate at-floor values (by design, correctly disclosed)

**File:** `src/colorscale/value-to-color.ts:209-214`, `.../mockup-runtime.ts:268-271`
**Issue:** Per the review brief's focus area 2: a `multiple` far below `10 ** DOMAIN_LOG_MIN`
(e.g. 0.0001x) and a `multiple` exactly at the floor (0.01x) both resolve to `rampPosition = 0`
and render as the identical endpoint colour — there is no separate "clipped" indicator. Confirmed
this is the intended D-16 behaviour, not an oversight: `renderLegend` labels the ramp's ends `"X
and below"` / `"X and above"` (`mockup-runtime.ts:269,271`), which is the disclosure mechanism —
a reader is told the endpoint colour represents a range, not a point. No fix needed; noted per the
review brief's explicit instruction to verify and report this either way.

### IN-03: `field-sampler.ts`'s `drawdown` metric reuses the multiple-of-contributed colour domain

**File:** `.planning/phases/06-heatmap-design-pass/mockups/shared/field-sampler.ts:161-204`
**Issue:** `sampleField`/`resampleField` call `rampPositionFor(value)` on whichever array `metric`
selects, including `fixture.drawdowns`. `rampPositionFor` is a symlog transform centred at `1.0`
(D-13/D-14), built for a multiple-of-contributed value that diverges around breakeven. A drawdown
value (a magnitude, typically in `[0, 1]`, where `0` is the best outcome and larger is worse) fed
through this same transform produces `log10(drawdown) <= 0` for essentially every real drawdown,
so drawdown never reaches the ramp's upper (orange) half, and a drawdown of exactly `0` (no loss
at all — the best possible outcome) clamps to the domain floor and renders in the same deep-blue
endpoint colour currently used for the worst possible multiple outcome. This is a real semantic
inversion if used as-is. It is not a Phase 6 defect: `06-HEATMAP-SPEC.md` §11 explicitly states "a
working switcher across all metrics is Phase 7 scope," and the current drawdown toggle exists only
to force a genuine repaint for the PERF-05 benchmarks, not to ship a correct drawdown colour
mapping. Flagging so Phase 7 does not assume this mapping is production-ready when it lifts
`sampleField`/`resampleField` verbatim.
**Fix:** Not required for this phase. Phase 7 should give `drawdown` its own colour domain/ramp
(or at minimum a linear `[0,1]` mapping) rather than routing it through `rampPositionFor`.

---

_Reviewed: 2026-08-21T19:48:06Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
