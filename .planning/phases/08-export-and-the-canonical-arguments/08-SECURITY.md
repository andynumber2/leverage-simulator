---
phase: 8
slug: export-and-the-canonical-arguments
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (high)
threats_open: 0
asvs_level: 1
created: 2026-08-26
---

# Phase 8 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Register origin: authored at plan time. All five plans (08-01 through 08-05) carried a
`<threat_model>` block with trust boundaries and a STRIDE register. This audit verifies the
declared mitigations exist in the implementation; it did not scan for new threats.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| URL query string → app state | Untrusted permalink parameters cross at boot via `decodeParams`, then reach the rasterized region, the PNG filename and the CSV preamble | Parameter scalars (symbol, dates, leverage, cost knobs) — public, user-chosen |
| App DOM → clipboard / downloaded file | Data leaves app control; consumer is the OS and any application the user pastes into | PNG image bytes, CSV text |
| App main thread → CSV Worker | Structured-clone boundary; worker has no DOM and no network access | Copied `Float64Array` series |
| CSV file → spreadsheet software | Consumer is Excel / Sheets / a script, none controlled by this app | Numeric and ISO-date cells |
| npm registry → runtime bundle | `html-to-image` executes in-page with full DOM read access | Third-party code |
| Compiled data bundle → build script → generated source | `scripts/compute-presets.ts` reads `public/data/` and emits a committed source file compiled into the shipped app | Numeric outcomes, ISO dates |
| Preset definition → reactive parameter store | Widest single store write outside boot-time permalink decode | Full parameter set |
| Preview server → measured browser context | Bench harness serves a production build to a context with clipboard permissions and downloads enabled | Measurement output |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-08-01 | Tampering | `pngFilename()` in `src/export/png-export.ts` | medium | mitigate | `png-export.ts:361` strips everything outside `[A-Za-z0-9._-]` from the assembled name before it reaches the `download` attribute; only `decodeParams`-validated fields are interpolated | closed |
| T-08-02 | Information disclosure | `exportRegionAsPng` node filter | medium | mitigate | Scope is the caller-supplied `.screenshot-region` only; module never reaches for `document.body` (`png-export.ts:14-16`). `exportNodeFilter` (`:33-38`) only subtracts. The canvas-compositing step reapplies the same predicate (`:57-65`) so a filtered-out canvas is not painted back in | closed |
| T-08-03 | Information disclosure | `navigator.clipboard.write` | low | mitigate | `ExportRow.tsx:124` constructs `ClipboardItem` with exactly one MIME key, `image/png`, matching the Blob type produced at `png-export.ts:310`. No second clipboard format written | closed |
| T-08-04 | Denial of service | `triggerDownload` object-URL lifetime | low | mitigate | `download.ts:27-28` revokes in a `finally`; nested `finally` at `:24` covers the anchor teardown | closed |
| T-08-05 | Elevation of privilege | `html-to-image` at runtime | low | accept | See Accepted Risks AR-08-01 | closed |
| T-08-SC | Tampering | npm install of `html-to-image` | high | mitigate | Package Legitimacy Audit in 08-RESEARCH.md returned `OK` with no `[ASSUMED]`/`[SUS]` rows. `package.json:38` pins exactly `1.11.13`; `package-lock.json:4018-4020` resolves that exact version from the npm registry and is committed | closed |
| T-08-06 | Tampering | CSV cell contents (formula injection) | medium | mitigate | `csv-columns.ts` header comment encodes the standing constraint (free-text columns must be apostrophe/tab-prefixed). `tests/app/export-csv.test.ts:122` asserts every non-date data cell is a pure finite-number token, so no cell can lead with `=`, `+`, `-` or `@` | closed |
| T-08-07 | Information disclosure | CSV preamble contents | low | accept | See Accepted Risks AR-08-02 | closed |
| T-08-08 | Denial of service | One-shot Worker lifecycle | medium | mitigate | `csv-export.ts:26-31` constructs the Worker per call and terminates it in a `finally`, so a rejected build cannot leak a live Worker | closed |
| T-08-09 | Tampering | Detaching live kernel buffers | high | mitigate | `ExportRow.tsx:155-160` copies every array with `.slice()` before the call; `csv-export.ts:12-14` documents that `Comlink.transfer` is deliberately not used, so the request crosses as a plain structured clone with no transfer list. The live chart buffers are never detached | closed |
| T-08-10 | Denial of service | Object-URL lifetime on repeated download | low | mitigate | Inherited from `download.ts`; same `finally`-revoke as T-08-04. No new mechanism | closed |
| T-08-11 | Tampering | `src/app/presets.generated.ts` | high | mitigate | Generator input is the repo's own committed data bundle; every emitted value passes through `JSON.stringify` (`compute-presets.ts:102-114`) so no value escapes its literal; `tests/app/presets.generated.test.ts:26` recomputes and asserts deep equality on every run, failing CI on a hand-edited file | closed |
| T-08-12 | Repudiation | Drift between a preset's displayed figure and the model | high | mitigate | The pinning test above is the control. `presets.generated.ts:182` (`PRESET_OUTCOMES_BUNDLE_VERSION = "45a9f1ae6444"`) and `:186` (`PRESET_OUTCOMES_MEASUREMENT_DATE = "2026-08-26"`) make every committed figure's provenance auditable. Generator and live UI share `computeDerivedMetrics` | closed |
| T-08-13 | Tampering | Real-fund presets silently double-charging expense | high | mitigate | `tests/app/presets.test.ts:128` asserts every real-fund preset sets leverage exactly 1.0 and `expenseRatioPercent` exactly 0, with the failure message naming `backtest.ts`'s non-leverage-scaled `expenseCost` as the reason | closed |
| T-08-14 | Elevation of privilege | Build-script file write | low | mitigate | `compute-presets.ts:173` computes the target as `process.cwd()` + literal `src`/`app` segments with no input-derived component; `:157-158` uses write-to-temp-then-rename (`renameSync`), so a partial write is never observable | closed |
| T-08-15 | Information disclosure | Preset definitions | low | accept | See Accepted Risks AR-08-03 | closed |
| T-08-16 | Tampering | `applyPreset`'s write path | high | mitigate | `state.ts:774-781` calls only the exported setters (`setActiveTier`, `setScaleMode`, `setDisplayedMetric`, `setResultMode`, `updateBacktestRequest`) plus `closeScenariosOverlay()`. Zero module-private signal writers in the body. `tests/app/presets.test.ts:82` asserts every preset produces a parameter set the encoder accepts | closed |
| T-08-17 | Spoofing | Card outcome text | medium | mitigate | `PresetCard.tsx:40` looks up `PRESET_OUTCOMES` by id; `:56-65` formats only through `formatMultiple`/`formatPercent` from `src/metrics/format.ts`. No `toFixed` or `Math.round` in the component. Source figures held honest by T-08-11's pinning test | closed |
| T-08-18 | Information disclosure | Card DOM injection | low | mitigate | No `innerHTML` in `PresetCard.tsx` or `ScenariosOverlay.tsx`; all text originates in committed source and renders as Solid text children, escaped by default | closed |
| T-08-19 | Denial of service | Overlay key handler lifetime | low | mitigate | `ScenariosOverlay.tsx:35-39` registers the `keydown` handler in `onMount` and removes it in `onCleanup`, matching the `MethodologyOverlay` precedent. Repeated opens cannot accumulate listeners | closed |
| T-08-20 | Denial of service | Double sweep on one preset click | medium | mitigate | `state.ts:779` passes `{ skipSweep: true }` to `updateBacktestRequest` when `preset.mode === 'sweep'`. `tests/app/scenarios-overlay.browser.test.ts:187-198` asserts `sweepGeneration()` advances by exactly 1 | closed |
| T-08-21 | Repudiation | A measured figure that measured the wrong thing | high | mitigate | The command returns `pngPathTaken` and `longTaskCounts` (`bench/browser-commands.d.ts:74,80`); `bench/perf-08-export.bench.test.ts:171` labels which PNG branch fired, and `:113-117` is the zero-guard that fails a path reporting 0ms with count 0 unless the interaction's own state checks proved it landed | closed |
| T-08-22 | Tampering | Budget or calibration constants | high | mitigate | Verified by git history rather than by assertion alone: `perf-budgets.ts` last changed 2026-08-18 (`2203510`), `bench/calibration.ts` 2026-08-18 (`c45d14d`), `bench/canonical-calibration.ts` 2026-08-16 (`9b627ca`) — all predate Phase 8 (2026-08-26). No Phase 8 commit touches any of the three | closed |
| T-08-23 | Elevation of privilege | Clipboard permission grant in the bench context | low | accept | See Accepted Risks AR-08-04 | closed |
| T-08-24 | Information disclosure | Downloaded artifacts during the bench run | low | mitigate | `vitest.config.ts:210-213` sets `acceptDownloads: true` with no `downloadsPath`, so Playwright uses its per-context temporary directory; the context is closed in a `finally` (`freshContext.close()`). No `saveAs` call anywhere in `bench/`, so no downloaded artifact reaches the repo tree | closed |
| T-08-25 | Spoofing | Safari verification claimed without being performed | medium | mitigate | The checkpoint ran as `gate="blocking"` and caught a real defect (blank canvas on first capture in real Safari). 08-05-SUMMARY.md records the stated result against the named post-fix bundle (`assets/index-vwbqaOH_.js`), with the debug record at `.planning/debug/resolved/png-export-blank-canvas-safari.md` | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-08-01 | T-08-05 | `html-to-image` runs with the app's own privileges, which for a static page means no credentials, no backend and no storage beyond the URL. Version pinned exactly to `1.11.13`, package cleared the legitimacy gate with no postinstall script, and `tests/app/static-build.test.ts` proves the emitted build reaches no external origin. Residual risk is a future supply-chain compromise on upgrade, accepted at ASVS L1 for a credential-free static site | Plan 08-01 threat model | 2026-08-26 |
| AR-08-02 | T-08-07 | The CSV preamble carries only parameters the user chose plus manifest-derived provenance already visible in the on-screen provenance strip. There is no private data in this app: no accounts, no backend, no storage | Plan 08-02 threat model | 2026-08-26 |
| AR-08-03 | T-08-15 | Preset definitions are public market-window parameters with no private content | Plan 08-03 threat model | 2026-08-26 |
| AR-08-04 | T-08-23 | The clipboard grant is scoped to a fresh throwaway Playwright context serving only the local preview origin, and the context is closed at the end of the command. No persistent browser profile is touched | Plan 08-05 threat model | 2026-08-26 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-26 | 25 | 25 | 0 | /gsd-secure-phase (ASVS L1, block_on: high) |

Depth note: ASVS L1 verification is grep-depth, confirming each declared mitigation is present at
its named site. It does not include L2 boundary-placement analysis or L3 end-to-end traces.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-26
