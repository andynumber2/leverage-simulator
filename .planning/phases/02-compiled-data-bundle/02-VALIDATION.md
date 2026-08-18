---
phase: 2
slug: compiled-data-bundle
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-17
validated: 2026-08-18
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> The plan-phase seed was never filled in: every field was still a template placeholder when
> `/gsd-validate-phase 02` ran on 2026-08-18. This file is a reconstruction from the executed
> plans (02-01..02-08), their SUMMARYs, and the tests actually in the tree.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10, `unit` project (Node). Phase 2's tests live under `tools/bundle-compiler/tests/` and `tools/fetch-data/tests/`, both covered by the project's `tools/**/tests/**/*.test.ts` include |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test` (= `vitest run --project unit`) |
| **Full suite command** | `npm test` plus `npm run bench` (bench carries the DATA-BUNDLE-BYTES and DATA-BUNDLE-DECODE rows) |
| **Determinism gate** | `npm run compile-data raw public/data && git diff --exit-code -- public/data src/data-bundle.generated.ts` |
| **Measured runtime** | 5.8 s quick (31 files / 446 tests) |

---

## Sampling Rate

- **After every task commit:** `npm test`
- **After any change to `raw/` or the compiler:** the determinism gate above
- **Before `/gsd-verify-work`:** full suite green
- **Max feedback latency:** 6 seconds (quick, measured)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|--------|
| T1 | 02-01 | 1 | DATA-01 — CLI ingests raw CSVs, emits versioned binary assets plus a JSON manifest; adding a symbol is CSV drop + recompile | — | N/A | integration | `npm test -- tools/bundle-compiler/tests/roundtrip.test.ts` ("adding a third scope changes only the emitted set, not the code") | ✅ green |
| T1 | 02-02 | 1 | DATA-02 — calendars aligned across symbols and the rate series; fails loudly on misalignment rather than forward-filling | — | A silent forward-fill would fabricate history; every fatal classification names the offending date | unit | `npm test -- tools/bundle-compiler/tests/gap-policy.test.ts` (extra bar, interior price gap, over-limit rate gap, plus both exact-boundary cases) | ✅ green |
| T1 | 02-02 | 1 | DATA-02 — calendar derivation itself | — | N/A | unit | `npm test -- tools/bundle-compiler/tests/calendar.test.ts` | ✅ green |
| T1 | 02-04 | 1 | DATA-03 — price-return and total-return emitted per symbol | — | N/A | unit | `npm test -- tools/bundle-compiler/tests/series.test.ts`; `universe.test.ts` ("every declared symbol has exactly one price-return and one total-return series") | ✅ green |
| T1 | 02-04 | 1 | DATA-04 — daily short-rate series covering the full range of each history tier | — | N/A | unit | `npm test -- tools/bundle-compiler/tests/rate-series.test.ts`; `manifest.test.ts` (`assertRateCoversAllTiers` aborts naming the pair and both dates); `universe.test.ts` (real-bundle range check) | ✅ green |
| T1 | 02-04 | 1 | DATA-05 — strict and extended tiers per symbol, computed not hand-declared | — | N/A | unit | `npm test -- tools/bundle-compiler/tests/seams.test.ts` (8 tests over `computeTierRanges`) | ✅ green |
| T1 | 02-06 | 1 | DATA-06 — machine-readable provenance: source, date range, exact seam date per series | — | N/A | unit | `npm test -- tools/bundle-compiler/tests/manifest.test.ts` (provenance byte-identical to sidecars; seams sorted and not coalesced) | ✅ green |
| T1 | 02-06 | 1 | DATA-06 — the real bundle actually carries those records, and tier labels agree with the seams beside them | — | N/A | integration | `npm test -- tools/bundle-compiler/tests/real-bundle-seams.test.ts` | ✅ green |
| T1 | 02-05 | 1 | DATA-07 — declared universe present, each with both series plus the shared rate series and calendar | — | N/A | integration | `npm test -- tools/bundle-compiler/tests/universe.test.ts` (9 tests against the real committed bundle) | ✅ green |
| T2 | 02-05 | 1 | DATA-09 — content-versioned assets; a stale cached asset cannot be served | — | A version disagreement raises rather than returning numbers | unit | `npm test -- tools/bundle-compiler/tests/versioning.test.ts` (`BundleVersionMismatchError`, filename purity, byte-identical recompile, no orphan) | ✅ green |
| T2 | 02-05 | 1 | DATA-09 — the cache policy half: emitted assets are actually served immutable | — | An asset served without immutable caching defeats content hashing | unit | `npm test -- tools/bundle-compiler/tests/headers.test.ts` | ✅ green |
| T2 | 02-05 | 2 | DATA-09 — the committed bundle is provably the output of the committed `raw/` | — | N/A | integration | `npm test -- tests/ci-workflow.test.ts` (`DATA-09 recompile-determinism gate`); the gate itself runs in CI | ✅ green |
| T1 | 02-03 | 1 | Source data normalization and cross-checks feeding DATA-01/03/04 | — | N/A | unit | `npm test -- tools/fetch-data/tests/normalize.test.ts tools/fetch-data/tests/cross-check.test.ts` (includes a negative control proving the year-end check is load-bearing) | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covered all phase requirements: Phase 1 installed and configured Vitest, and
the `unit` project's `tools/**/tests/**/*.test.ts` include already picked up this phase's tests. No
Wave 0 setup was needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| The UI generates its tier labels from manifest provenance rather than hardcoding them | DATA-06 (second clause) | No UI exists yet. This clause lands with the app shell in Phase 4 and belongs to that phase's validation, not this one. The data side is automated: `real-bundle-seams.test.ts` proves the declared tiers agree with the seam records a UI would read | When Phase 4 renders tier labels, assert the rendered label text is derived from the manifest and not from a literal |
| Source licensing and redistribution terms per series | DATA-06 (provenance) | Judging whether a license genuinely permits redistribution is a legal reading, not a runtime assertion. `universe.test.ts` automates the mechanical half (every series carries a non-empty url, license and termsUrl) | Read the `sources` block of each series in the manifest; confirm each license string reflects the actual terms at its `termsUrl` |

---

## Validation Sign-Off

- [x] All tasks have automated verify or a documented manual reason
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none needed)
- [x] No watch-mode flags
- [x] Feedback latency < 180s (measured 5.8s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-08-18

---

## Validation Audit 2026-08-18

| Metric | Count |
|--------|-------|
| Gaps found | 3 |
| Resolved | 3 |
| Escalated | 0 |

DATA-01 through DATA-07 were already well covered, including real-bundle assertions in
`universe.test.ts`. All three gaps were the same class: a mechanism the phase depends on that was
verified only by a human reading a file.

**Gap 1 — DATA-09, cache policy, MISSING.** Content hashing was thoroughly tested; `public/_headers`,
which is what makes the browser treat a hashed URL as permanently cacheable, had no test at all.
Neither half alone prevents a redeploy serving a stale asset. Closed by
`tools/bundle-compiler/tests/headers.test.ts` (8 tests). The load-bearing assertion is not that the
rules exist but that every file the compiler *actually emits* into `public/data/` is matched by a
rule granting an immutable Cache-Control, so a rule that stops matching the emitted filenames fails.

**Gap 2 — DATA-09, CI determinism gate, MISSING.** The `compile-data` + `git diff --exit-code` step
is what proves the committed bundle is the output of the committed `raw/`. Nothing asserted the step
survives edits to `ci.yml`. Closed by extending `tests/ci-workflow.test.ts` with a
`DATA-09 recompile-determinism gate` block, reusing the comment-stripping helper that file already
carries so a rationale comment cannot satisfy the assertion.

**Gap 3 — DATA-06, real-bundle seam records, PARTIAL.** Seam recording and tier computation were
well covered on fixtures, but on the real bundle 02-VERIFICATION.md truth 3 verified the seams by
reading `manifest.*.json` by hand. Closed by `tools/bundle-compiler/tests/real-bundle-seams.test.ts`
(17 tests). The central assertion re-derives tiers.ts's narrowing rule from the manifest's own seam
records rather than calling `computeTierRanges`, because calling it would compare the compiler
against itself and pass for any self-consistent output, including one that lost a seam.

**Mutation-checked.** Nine mutations, each turning the suite red: dropping `immutable` and shortening
max-age; renaming the `.bin` glob so it stops matching emitted files; deleting the manifest rule;
granting immutable caching to a non-hashed `/index.html`; deleting SPX's interpolation seam;
removing one rate splice to open a chain hole; drifting SPX's declared strict tier away from its
seams; deleting the `compile-data` CI step; and narrowing `git diff` so it stops checking
`src/data-bundle.generated.ts`.

**Two defects were found and fixed in the generated tests before acceptance.** Both were
vacuous-pass holes: four assertions guarded by `if (!rateSeams) return`, which would have passed
silently had the rate series disappeared; and two tier-consistency assertions whose conditions could
never be false (one gated on `rateDegradingSeams.length === 0`, which is always false because the
rate series always has degrading seams, so its loop body never executed). Those two were the
assertions meant to protect DATA-06's "labels cannot drift from the data" clause, so accepting them
would have recorded coverage that did not exist. Both files were also carrying order-dependent state
assigned in one test and read by its siblings; parsing was hoisted to module scope so each test
stands alone.

**Suite after audit:** 31 files / 446 tests green (was 29 / 417), `tsc --noEmit` clean.
