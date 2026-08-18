---
phase: 03
slug: simulation-kernel-and-the-upro-tqqq-gate
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-08-18
---

# Phase 03 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Register origin: authored at plan time. All six PLAN files (`03-01` through `03-06`) carry a
parseable `<threat_model>` block; this file consolidates them and records the verification
evidence found in the implementation. ASVS level 1 (grep-depth verification).

This phase ships no network surface, no authentication, no persistence and no untrusted user
input path: it is a numeric kernel plus a Node CLI, both operating on data committed to this
repository. Every threat below is correspondingly about **result integrity and provenance**
(a wrong number presented as a right one) rather than about an attacker.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| CLI argv → `buildKernelInputs` | Operator-supplied symbol, dates, leverage, amounts and frequency cross into index arithmetic over typed arrays | Unvalidated strings and numbers |
| on-disk `public/data/*.bin` → decoder | A stale or truncated cached asset crosses into `Float64Array` views | Binary, version-tagged |
| data layer → kernel | Already-validated typed arrays and scalars cross into an allocation-free hot loop with no internal bounds checks | `Float64Array` / `Int32Array` / `Uint8Array` |
| compiled calendar → schedule resolver | A binary-searched `Int32Array` drives which bars receive money | Trading-day numbers |
| external filings and web fetches → committed constants | Retrieved (or unretrievable) figures cross into constants every downstream number depends on | Cost parameters + confidence tags |
| sourced constants → printed defaults | Cost parameters with varying confidence cross into a user-facing header | Numbers + provenance labels |
| Node host → browser bench context | Decoded bundle data crosses a structured-clone boundary into the measured region's setup | Typed arrays |
| measured residual → author response | A red gate creates pressure to change the thing that made it red | Verdict + author intent |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-03-01 | Information disclosure | `runBacktest` typed-array indexing | medium | mitigate | Two pre-loop length asserts cover all six arrays and throw naming every length — `src/kernel/backtest.ts:63-79` | closed |
| T-03-02 | Tampering | `decodeHeader` on a cached asset | high | mitigate | `decodeHeader(buffer, BUNDLE_VERSION)` called on the calendar and on every asset at load — `src/data/kernel-inputs.ts:96,102` | closed |
| T-03-03 | Tampering (result integrity) | `buildKernelInputs` parameter handling | high | mitigate | D-32 throws naming the offending value and the supported range for an out-of-range entry date (`kernel-inputs.ts:186-191`), a non-trading entry date (`:196`) and an over-long holding period (`:225-232`). No silent clamp on the path | closed |
| T-03-04 | Denial of service | NaN/Infinity from a malformed scalar | medium | mitigate | `assertFinite` on `leverage`, `initialInvestment`, `expenseRatioPercent`, `financingSpreadPercent` — `kernel-inputs.ts:170-173`. Ruin is a categorical `Uint8Array` flag (D-22), never a sentinel in `outValue` — `backtest.types.ts:53` | closed |
| T-03-05 | Repudiation | Undisclosed effective end date | low | mitigate | `meta.truncatedForRateCoverage` computed at `kernel-inputs.ts:216`, surfaced at `:299`, printed unconditionally at `scripts/run-backtest.ts:251` | closed |
| T-03-06 | Tampering (result integrity) | Ruin representation | high | mitigate | Every ruin assertion uses the categorical flag plus exact-zero equality (`toBe(0)`), never an epsilon — `tests/kernel/ruin.test.ts:28,32,46,59,87-90` | closed |
| T-03-07 | Denial of service | Negative value entering a downstream colour scale | medium | mitigate | Leverage-20 case drives the position far below zero and asserts exactly 0 on the crossing bar and every later bar — `tests/kernel/ruin.test.ts:51-59`; kernel clamps at `backtest.ts:132-133` | closed |
| T-03-08 | Repudiation | Silent checklist gap | medium | mitigate | `PITFALLS_A_CHECKLIST` asserted to have exactly twelve entries A1..A12, each a non-empty `coveredBy` or a non-empty `disposition.reason` — `tests/kernel/ruin.test.ts:235-251` | closed |
| T-03-09 | Repudiation | The no-fitting claim (ROADMAP criterion 2) | high | mitigate | `git log --diff-filter=A -- src/validation/` shows `da257a5 feat(03-03): source and pin the UPRO/TQQQ gate cost parameters (D-19)` as the first file added, before `2974140` (tracking-error). Commit ordering is the evidence | closed |
| T-03-10 | Tampering (result integrity) | A cost constant edited to tighten a fit | high | mitigate | Pinning tests assert each constant against the value its own citation names — `tests/validation/cost-parameters.test.ts:29-55`. Only later edit to `cost-parameters.ts` (`330724a`) changed one *tolerance mechanism's* `basisPointsPerYear`, not a cost parameter, under D-15's named-mechanism revision rule; both expense ratios and both spread bounds are unchanged since `da257a5` | closed |
| T-03-11 | Spoofing | A confidence tag overstating its retrieval | high | mitigate | `confidence` is a required field of `CostParameter`; every entry asserted to carry a >=20-char citation, an ISO `sourceDate` and a declared confidence value, and every `ASSUMED` entry asserted to name at least one attempted retrieval URL — `tests/validation/cost-parameters.test.ts:57-89` | closed |
| T-03-12 | Tampering | A tolerance widened without a named mechanism | high | mitigate | `RETURN_DRIFT_TOLERANCE`/`TRACKING_ERROR_TOLERANCE` are summed from `TOLERANCE_MECHANISMS` (`src/validation/cost-parameters.ts:488-517`), never literals; the test recomputes both independently from the public mechanism list — `tests/validation/cost-parameters.test.ts:109-122` | closed |
| T-03-13 | Tampering (result integrity) | Contribution schedule resolution | high | mitigate | Two nominal dates resolving to one bar throw naming both nominal dates and the shared bar's ISO date — `src/data/contribution-schedule.ts:170-181` | closed |
| T-03-14 | Information disclosure | Binary search over the calendar slice | medium | mitigate | `lowerBound` is called with `lo = entryCalendarIndex + 1` and `hi = lastCalendarIndex`, both derived from the already-validated window, and returns `hi + 1` (treated as "not found", not clamped) when the target is past the end — `contribution-schedule.ts:81-93,164-169` | closed |
| T-03-15 | Tampering (result integrity) | Silent parameter coercion | high | mitigate | Unknown frequency throws naming the value and the supported set (`contribution-schedule.ts:143-149`); out-of-range entry date and over-long holding period throw (`kernel-inputs.ts:186,225`); leverage band `(0, 20]` enforced at `scripts/run-backtest.ts:147-151`. See **Residual R-1** below — the leverage band sits at the CLI layer, not at the `buildKernelInputs` seam the register names | closed |
| T-03-16 | Repudiation | An unlabelled default read as a measured figure | medium | mitigate | The header prints `user-provided`/`DEFAULT`, the source constant's name, its confidence tag and `FINANCING_SPREAD_RANGE`'s full band, on every run — `scripts/run-backtest.ts:255-265` | closed |
| T-03-17 | Repudiation | PERF-02 measuring throwaway code | high | mitigate | Bench imports `runBacktest` from `src/kernel/backtest.ts` and tags `source: 'production'` — `bench/kernel.bench.test.ts:14,63,68,93` | closed |
| T-03-18 | Repudiation | A GC assertion passing vacuously | high | mitigate | `globalThis.gc()` forced at a fixed interval inside the loop, not only at its ends, plus an independent batch-flatness cross-check — `tests/kernel/allocation.test.ts:84,103,107` | closed |
| T-03-19 | Denial of service | Unavailable `--expose-gc` silently disabling the only SIM-11 evidence | medium | mitigate | The guard throws rather than skipping and names the config entry supplying the flag — `tests/kernel/allocation.test.ts:70-77`, supplied by `vitest.config.ts:30-37` | closed |
| T-03-20 | Tampering | A budget relaxed to accommodate a measurement | high | mitigate | `perf-budgets.ts` is untouched in Phase 3 — its most recent commit is `190e15a feat(02-05)` | closed |
| T-03-21 | Tampering (result integrity) | Cost parameters under a failing gate | high | mitigate | D-20's three permitted outcomes restated verbatim in the gate file header, all of which leave cost parameters untouched — `tests/validation/upro-tqqq-gate.test.ts:55-70`. The one red-gate resolution (`330724a`) changed no expense ratio and no financing spread | closed |
| T-03-22 | Tampering (result integrity) | Window selection | high | mitigate | The window is derived from manifest fields at run time and asserted to clear `MIN_OVERLAP_YEARS = 15`; a fund whose own `lastDate` precedes the resolved window's also fails — `tests/validation/upro-tqqq-gate.test.ts:46,268-286` | closed |
| T-03-23 | Denial of service | NaN from a degenerate window | medium | mitigate | Three named guards: fewer than 2 bars, unequal input lengths, and any non-finite value inside the window — `src/validation/tracking-error.ts:70-105` | closed |
| T-03-24 | Repudiation | A residual narrowed rather than reported | high | mitigate | Every window's result block prints on every run before either gate assertion, carrying bars, years, dates, both gates and both annualized returns — `tests/validation/upro-tqqq-gate.test.ts:363-374` | closed |
| T-03-25 | Spoofing | A sign error passing a loose tolerance | medium | mitigate | Unconditional assertion that the synthetic's annualized return is strictly below `3 * indexAnnualizedReturn` over the identical window, independent of either tolerance — `tests/validation/upro-tqqq-gate.test.ts:404-414` | closed |
| T-03-SC | Tampering | npm/pip/cargo installs | low | accept | Zero new packages installed in any of the six plans; `03-RESEARCH.md`'s Package Legitimacy Audit records the audit as not applicable. See ACC-01 | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `workflow.security_block_on` (high) count toward `threats_open`*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Residual Observations

Not open threats — the register's mitigations are present. Recorded because the *placement* of
one control differs from where the register put it, and that difference becomes load-bearing in
a later phase.

**R-1 — the leverage band is a CLI control, not a data-layer control.**
T-03-15 names `buildKernelInputs` as its component, but `buildKernelInputs` only calls
`assertFinite('leverage', ...)` (`src/data/kernel-inputs.ts:170`). The `(0, 20]` band lives in
`scripts/run-backtest.ts:147-151`. Today the CLI is the only caller, so the threat is closed. In
Phase 6/7 a Worker or UI calling `buildKernelInputs` directly bypasses the band entirely: a
leverage of `1e9` or `-3` would be accepted and produce a finite but meaningless curve rather
than throwing. Every other D-32 guard (entry date, holding period, contribution frequency) is
already at the data-layer seam; leverage is the one that is not.

*Carry-forward:* when Phase 6/7 adds a second caller of `buildKernelInputs`, move the band check
into `buildKernelInputs` and have the CLI defer to it, rather than duplicating the constants.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| ACC-01 | T-03-SC | Supply-chain risk from new dependencies is nil for this phase: all six plans install zero new packages. `fast-check` 4.9.0, the only test dependency used here, was installed and audited in Phase 1. `03-RESEARCH.md`'s Package Legitimacy Audit records the audit as not applicable for Phase 3 | Andy Barcinski | 2026-08-18 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-18 | 26 | 26 | 0 | /gsd-secure-phase (ASVS L1, orchestrator-verified) |

Method: registers extracted from all six `03-0*-PLAN.md` `<threat_model>` blocks and
deduplicated (T-03-SC appears once per plan, identical in each). No `## Threat Flags` section was
present in any SUMMARY; `03-04-SUMMARY.md:162` records one post-Task-3 register-vs-implementation
review that added the T-03-15 unknown-frequency guard (`5c60c7c`). Each mitigation was verified
against the implementation at grep depth, which is the depth ASVS level 1 specifies. No deeper
boundary-placement (L2) or end-to-end trace (L3) verification was performed — R-1 above was found
incidentally at L1 and is the kind of finding an L2 pass exists to look for systematically.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-18
