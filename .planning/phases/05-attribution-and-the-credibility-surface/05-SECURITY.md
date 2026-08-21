---
phase: 05
slug: attribution-and-the-credibility-surface
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-08-21
---

# Phase 05 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Register origin: authored at plan time. All nine PLAN files carry a parseable `<threat_model>`
block, so this audit verifies mitigations rather than building a retroactive STRIDE register.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| URL query string -> app state | Untrusted URL text decoded by the strict `permalink.ts` allow-list; the `methodology` flag is read by literal name and deleted from a copy before `decodeParams` runs. | Run parameters, tier selection, overlay flag |
| URL query string -> tier selection | The existing `tier` permalink key now drives real behaviour instead of being written and ignored. | Two-member enum (`strict` / `extended`) |
| Bundled binary asset -> kernel/attribution arrays | Build-time-controlled data decoded into typed arrays; attribution reads the same arrays the kernel consumes. | Float64 price/rate series |
| Bundled manifest `sources[].url` -> DOM anchor href | A build-time-authored URL is placed into an `href` attribute. | Source URLs |
| Manifest tier ranges -> entry-date bounds | The manifest decides which dates a tier admits; the control must not widen bounds beyond what the manifest carries. | Date ranges |
| Computed float64 series -> uPlot canvas renderer | Non-finite or non-positive values reaching a log-distribution scale. | Equity/ghost curve values |
| Parameter-column input -> request store -> kernel | Newly exposed numeric inputs become new paths into the run parameters. | Initial investment, cost parameters |
| Build-time measurement -> committed source constant | A script-produced number becomes a credibility claim rendered to users. | Extended-tier bias figure |
| Registry constants -> rendered methodology claims | The methodology page's credibility rests on rendering what the code actually is. | Cost parameters, tolerances, day-count constants |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-05-01 | Denial of Service | `computeAttribution` in `scheduleRun` | medium | mitigate | Counterfactual arms preallocate output buffers once per call; no allocation inside per-bar loops. PERF-07b re-measured in plan 05-09. | closed |
| T-05-02 | Tampering | `AttributionResult` -> rendered strings | low | mitigate | `src/metrics/format.ts` returns `UNDEFINED_PLACEHOLDER` on every `null`/non-finite input (verified at lines 22, 24, 32, 41). | closed |
| T-05-03 | Denial of Service | `EquityCurveChart` log-scale renderer | medium | mitigate | `src/app/components/ResultColumn/naive-series.ts` writes `value > 0 ? value : null` before any value reaches uPlot. | closed |
| T-05-04 | Tampering | Naive value definition drift | low | mitigate | Final-bar agreement test pins `buildNaiveGhostData` against `computeAttribution`'s `naiveFinalValue`. | closed |
| T-05-05 | Tampering | Synthetic construction leg selection | medium | mitigate | `ValidationSection.tsx` hardcodes `SPX/total-return`, `UPRO/total-return`, `NDX/total-return`, `TQQQ/total-return`; zero `price-return` occurrences in the file. | closed |
| T-05-06 | Repudiation | Cost-parameter fitting | high | mitigate | No-fitting protocol header carried into the extracted module; `tests/validation/cost-parameters.test.ts` CI gate unchanged by the extraction. | closed |
| T-05-07 | Information Disclosure | Sub-window table row suppression | medium | mitigate | Identical markup and class list on every regime row, asserted by a browser test. | closed |
| T-05-08 | Tampering | `ProvenanceStrip` source anchors | medium | mitigate | `HTTP_URL_PATTERN = /^https?:\/\//` gates anchor rendering; non-matching sources render as plain text (`ProvenanceStrip.tsx:34`). | closed |
| T-05-09 | Repudiation | Hand-authored provenance drift | medium | mitigate | D-16 real-bundle traceability test resolves every rendered string's `manifestPath` against the real manifest; verified to fail on a deliberate prose edit. | closed |
| T-05-10 | Information Disclosure | Licence/terms text in result region | low | mitigate | `provenance-fields.ts` contains zero `license`/`termsUrl` references (grep count 0), plus a test asserting no rendered value contains that text. | closed |
| T-05-11 | Tampering | `tier` permalink value | low | mitigate | `src/app/permalink.ts` last modified in commit `09ce583` (phase 04-07); untouched by phase 05. Existing two-member validation rejects the whole permalink on an unknown value. | closed |
| T-05-12 | Tampering | Entry-date bounds widening | medium | mitigate | `TierControl.tsx` calls `resolveEntryDateBounds` per option and never constructs a bound; `bounds.ts:84-90` returns `ok: false` with the resolver's own reason when `entry.tiers[tier]` is null. | closed |
| T-05-13 | Repudiation | Citation naming a tier the bounds did not come from | medium | mitigate | `EntryDateControl.tsx:82` interpolates the same `activeTier()` signal used at line 43 for the bounds call; `tests/app/entry-date-tier.browser.test.ts:108` asserts the citation text after a tier change. | closed |
| T-05-14 | Repudiation | Committed bias magnitude | high | mitigate | `tests/validation/extended-tier-bias.test.ts` recomputes the figure from the committed bundle via `measureExtendedTierBias` and asserts every field to full float64 precision on every CI run. | closed |
| T-05-15 | Tampering | Interpolation method drift | medium | mitigate | `scripts/measure-extended-tier-bias.ts:48` imports `interpolateMonthlyToDaily` from the bundle compiler's own `rate-series.ts`; no reimplementation present. | closed |
| T-05-16 | Repudiation | Warning suppression | medium | mitigate | `ExtendedTierWarning.tsx` has no dismiss, acknowledgment, `onClose`, or `localStorage` path (grep-confirmed absent); browser test asserts it renders on repeated results. | closed |
| T-05-17 | Tampering | Methodology flag read from `location.search` | medium | mitigate | `src/app/state.ts:621-622` uses literal `rawParams.has('methodology')` / `.delete('methodology')`; no dynamic property assignment from a URL-derived key. `permalink.ts` unmodified. | closed |
| T-05-18 | Tampering / Information Disclosure | Flag masking an evicted run | medium | mitigate | The decode result still governs whether a run renders; test asserts a flagged permalink with an invalid run produces the same eviction as the unflagged equivalent. | closed |
| T-05-19 | Repudiation | Methodology prose drifting from the code | high | mitigate | Every value on the page reads from `COST_PARAMETERS`, `TOLERANCE_MECHANISMS`, kernel day-count constants, `extended-tier-bias.generated.ts`, or the manifest. Grep criteria forbid duplicate numeric literals; browser test compares rendered substrings against imported constants. | closed |
| T-05-20 | Tampering | Overlay URL write racing the run-parameter flush | low | mitigate | Overlay writes go through the same `history.replaceState` path (`state.ts:247-251`) and flush pending trailing-edge writes first; test asserts open-then-close restores the exact original query string. | closed |
| T-05-21 | Tampering | `InitialInvestmentControl` numeric input | medium | mitigate | `InitialInvestmentControl.tsx:49` rejects `!Number.isFinite(value) || value < 0`; unparseable drafts return early at line 46 leaving the request untouched. `buildKernelInputs`'s finite-number assertion remains the backstop. | closed |
| T-05-22 | Denial of Service | Reset writing an invalid value | low | mitigate | Reset routes through `PARAMETER_DEFAULTS[id].reset()` (each control's validated setter), never a raw store write; browser test asserts reset from an invalid state clears it. | closed |
| T-05-23 | Repudiation | A default silently drifting from the badge | medium | mitigate | `src/app/parameter-defaults.ts` is the single registry supplying both `isDefault()` and `reset()`; no `ParameterColumn` control declares a local default constant (grep-confirmed). | closed |
| T-05-24 | Repudiation | PERF-07b budget or workload adjustment | high | mitigate | `perf-budgets.ts` last modified in commit `2203510` (quick-260818-v2d) and `190e15a` (02-05); untouched by phase 05. Calibration reference and counterfactual arm count unchanged. | closed |
| T-05-25 | Repudiation | Single-run headroom overclaim | medium | mitigate | The 05-09 measurement is recorded against the documented measurement band, not read as supporting a tighter headroom claim. | closed |
| T-05-SC | Tampering | npm installs (all nine plans) | low | accept | See Accepted Risks Log, R-05-SC. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-05-SC | T-05-SC | Phase 05 adds no runtime dependency and performs no package-manager install in any of its nine plans. `05-RESEARCH.md` § Package Legitimacy Audit records this; `fast-check` and `uplot` were already pinned in `package.json`. The one new `package.json` entry (plan 05-06) is a script, not a dependency. Supply-chain surface is unchanged from phase 04. | Phase 05 threat model (all nine PLAN files) | 2026-08-21 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-21 | 26 | 26 | 0 | /gsd-secure-phase (orchestrator, ASVS L1 grep-depth) |

Audit method: register extracted from all nine `05-0N-PLAN.md` `<threat_model>` blocks and
cross-read against `## Threat Flags` in `05-01`, `05-02`, `05-03`, `05-04`, and `05-07`
SUMMARY files. `05-05`, `05-06`, `05-08`, and `05-09` SUMMARY files carry no `## Threat Flags`
section, so their eleven threats (T-05-11 through T-05-16, T-05-21 through T-05-25) were
classified from direct implementation evidence rather than executor attestation. Every
evidence citation in the register above is a file, line, or commit verified during this run.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-21
