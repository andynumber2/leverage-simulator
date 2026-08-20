---
phase: 04
slug: first-defensible-backtest-in-the-browser
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
# NOTE: one threat (T-04-35, medium) is genuinely OPEN but sits below the `high` block threshold,
# so it does not count here. threats_open: 0 means "nothing blocking", not "nothing open".
threats_open: 0
asvs_level: 1
created: 2026-08-20
---

# Phase 04: Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Register origin: authored at plan time. All eight PLAN files (`04-01` through `04-08`) carry a
parseable `<threat_model>` block; this file consolidates them and records the verification evidence
found in the implementation. ASVS level 1 (grep-depth verification), with two threats verified
deeper because grep depth was demonstrably insufficient for them (T-04-12, T-04-35).

This file records **two audit passes**. The first (2026-08-20, pass 1) found T-04-05 open and
blocking. The gate was fixed in `.github/workflows/ci.yml` and re-verified in pass 2 the same day.
Both passes are recorded rather than the second overwriting the first, because the finding and the
sequence are the useful artifact, not just the final state. See F-2.

Register arithmetic: the eight blocks define **34 distinct threats**, not 35. `T-04-07` and
`T-04-08` are not defined in any plan in this phase (`grep -rn "T-04-07\|T-04-08" .planning/`
returns zero hits) and are not carried here as phantom rows. `T-04-05` appears in both `04-01` and
`04-08`; it is deduplicated to one row and verified against `04-08`'s stated mitigation, which is
where `04-01` explicitly deferred it. `T-04-SC` is the supply-chain row.

This is the first phase with a real untrusted-input surface. Phases 1 through 3 shipped a numeric
kernel and a Node CLI over committed data; this phase ships a browser app whose entire parameter
set is reconstructible from a URL query string that anyone can craft and send to anyone. The
register reflects that: T-04-01/02/03 are the query-string boundary, and the rest are the same
result-integrity concerns the earlier phases had, now with a rendering surface attached.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| URL query string to app state | The largest untrusted-input surface in the project; a permalink is the product's whole point and is by construction attacker-authorable | Arbitrary `URLSearchParams` |
| npm registry to build | Third-party package code executes at install and build time | Package tarballs |
| CDN / static host to browser | Bundle assets and app JS cross an untrusted network | Content-hashed binary + JS |
| Service worker cache to app | Precached bytes are served with no network round trip and outlive a redeploy | Cached responses |
| Kernel output to rendered DOM | Computed float64 values become text a reader will quote as fact | Numbers and formatted strings |
| Kernel output to a third-party renderer | Computed float64 values become uPlot scale bounds and axis-split inputs | Raw `Float64Array` |
| User input to kernel parameters | Free-form control input crosses into the arithmetic the whole result rests on | Strings and numbers |
| Build output to measurement harness | A measurement reading the wrong artifact certifies nothing | `dist/` bytes |
| Thrown error message to rendered explanation | Internal error text becomes user-visible copy | Error strings containing user values |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-04-SC | Tampering | npm installs of solid-js, vite-plugin-solid, vite, uplot, vite-plugin-pwa | high | mitigate | Zero install lifecycle hooks in the entire installed tree: a walk of `node_modules` reading every `package.json` finds 0 packages declaring `preinstall`, `install` or `postinstall`. Plan-time `package-legitimacy check` recorded at `04-01-PLAN.md:206-227`; the blocking human approval is recorded verbatim at `04-01-SUMMARY.md:65` (three SUS "too-new" verdicts resolved to canonical `github.com/solidjs` and `github.com/vitejs` repos) | closed |
| T-04-01 | Tampering | `src/app/permalink.ts` `decodeParams` | high | mitigate | Allow-list by name before any value is read: `src/app/permalink.ts:236-240` rejects any key not in `PERMALINK_KEYS`, `:244-248` rejects duplicates via `getAll` (not `get`, which silently returns the first), `:274-279` rejects missing required keys. Every field is assigned by its own literal name at `:357-373`; no computed property assignment from a URL-derived key exists. `grep -rnE '\beval\(\|new Function\(' src/` returns 0 matches | closed |
| T-04-02 | Information Disclosure | `ValidationExplanation` and `BundleVersionBanner` rendering URL-derived strings | high | mitigate | Every URL-derived string reaches the DOM as a JSX text child only: `ValidationExplanation.tsx:55` (`{variant.message}`) and `MetricsPanel.tsx:37-72`. `grep -rn "innerHTML\|outerHTML\|insertAdjacentHTML\|document.write" src/` returns 0 matches. Verified beyond the register's claim: `grep -rn "href=\|src=\|<a " src/app/` also returns 0 matches, so there is no attribute sink where JSX text escaping would not have applied. `bundleVersion` is additionally shape-constrained to 12 hex chars at `permalink.ts:353-355` before it can reach the banner | closed |
| T-04-03 | Denial of Service (client) | A malformed or adversarial permalink | high | mitigate | `decodeParams` returns a discriminated result and never throws; the adversarial battery at `tests/app/permalink.test.ts:298-321` covers `__proto__=x&constructor=y&prototype=z`, `symbol=SPX&__proto__[polluted]=true`, a 10,000-char value, NUL bytes and `=&=&=`, asserting no throw for any of them. A decode failure routes to the explanation path rather than blanking: `state.ts:520-523` evicts and `applyLoadedBundle` skips the overwriting run (`state.ts:612-618`), proven end to end at `tests/app/permalink.browser.test.ts:266-278`. **See Finding F-1**: this threat's own territory was breached during the phase by a permalink that decoded successfully | closed |
| T-04-04 | Tampering | `src/data/bundle-source.ts` asset decode | medium | mitigate | `decodeHeader(calendarBuffer, BUNDLE_VERSION)` at `src/data/bundle-source.ts:45` and `decodeHeader(buffer, BUNDLE_VERSION)` inside the per-asset loop at `:51`, so every asset without exception is version-pinned at load. Asset filenames are content-hashed by the compiler (`dist/data/manifest.f0a9dfbdfa.json`) | closed |
| T-04-05 | Information Disclosure | The emitted `dist/` bundle | high | mitigate | **Closed in pass 2 after being open and blocking in pass 1. See Finding F-2.** The gate (`tests/app/static-build.test.ts:88-141`, reasoned allow-list at `:32-56`) now executes in CI against a fresh build produced in the same job: `.github/workflows/ci.yml:73` runs `npm run build` before `npm test` (`:75`), `npm run test:app` (`:77`) and `npm run bench` (`:79`). Re-verified independently: with `dist/` absent the suite reports `4 tests | 4 skipped` and exits 1 at `static-build.test.ts:79`; after `npm run build` all four gate tests execute and pass, and the full unit suite is 546/546 across 39 files | closed |
| T-04-06 | Spoofing | Static host serving the app | low | accept | Cloudflare Pages serves over HTTPS by default; no app-specific control improves on it. See ACC-02 | closed |
| T-04-09 | Denial of Service (client) | `loadBundleFromFetch` on a failed or truncated asset fetch | medium | mitigate | `fetchOrThrow` throws a named error carrying the URL and HTTP status at `src/data/load-bundle-browser.ts:17-19`; `runInitialLoad` catches it into `loadErrorMessage`/`status='failed'` at `state.ts:629-633`; `App.tsx:84-91` renders the message with a Retry button calling `initializeApp()`. `loadInFlight` is cleared in a `finally` (`state.ts:568-572`) so Retry performs a genuine retry | closed |
| T-04-10 | Tampering | `src/kernel/backtest.ts` in-loop drawdown addition | high | mitigate | `src/kernel/backtest.ts` was modified in Phase 4 (`c2a4459 feat(04-02)`) but `git log -- src/validation` shows its newest commit is still `330724a fix(03-06)`: no Phase 4 commit touches a cost parameter. `npx vitest run --project unit tests/validation/upro-tqqq-gate.test.ts` re-run during this audit: 2 passed | closed |
| T-04-11 | Information Disclosure | `MetricsPanel` rendering computed values | medium | mitigate | All four displayed values route through `src/metrics/format.ts` (`MetricsPanel.tsx:37,49,60,65,72`); every formatter takes `Number.isFinite` guards on entry and after rounding (`format.ts:22,24,32,41,43`); the never-NaN/never-Infinity property is asserted over the float64 extremes at `tests/metrics/format.test.ts:59-82` | closed |
| T-04-12 | Denial of Service (client) | `EquityCurveChart` on a ruined run under a log distribution | medium | mitigate | The register's stated mitigation is present: truncation at `EquityCurveChart.tsx:134` and the terminator marker at `:150-155,204-207`. **That mitigation was necessary and insufficient.** The sufficient control is `src/app/components/ResultColumn/log-axis-splits.ts:33-71` (`logDecadeSplits`), wired at `EquityCurveChart.tsx:221-225` with a mandatory identity `filter`, covered by `tests/app/log-axis-splits.test.ts` (11 cases) and `tests/app/log-axis-splits.browser.test.ts:70-130`. **See Finding F-1** | closed |
| T-04-13 | Repudiation | No server-side record of a displayed figure | low | accept | No accounts, no server log; the self-describing permalink is the accountability mechanism. See ACC-03 | closed |
| T-04-14 | Tampering | `perf-budgets.ts` thresholds and `bench/calibration.ts` | high | mitigate | `git log -- perf-budgets.ts` newest commit is `2203510` (2026-08-18, pre-phase); `git log -- bench/calibration.ts` newest is `c45d14d` (2026-08-18, pre-phase). Phase 4 begins at `030c37a` (2026-08-19). Neither file carries a `04-*` commit. **Re-confirmed in pass 2** after the CI reorder put `npm run build` ahead of the test steps: `git diff --exit-code -- perf-budgets.ts bench/calibration.ts` exits 0 on a tree with a freshly built `dist/` present | closed |
| T-04-15 | Spoofing | `bench/preview-server.ts` serving a stale or absent `dist/` | high | mitigate | `bench/preview-server.ts:41-46` throws naming the missing path and the producing command (`Run "npm run build" first`). Build-before-bench ordering is pinned by a positional-index assertion at `tests/ci-workflow.test.ts:145-158`, which still passes after the pass-2 reorder and is still load-bearing (the comment-stripped workflow contains exactly one mention of each command). **Re-confirmed in pass 2**, see F-2 item 2: `dist/` is byte-identical before and after the two steps now interposed between build and bench | closed |
| T-04-16 | Repudiation | A PERF-08 figure quoted later without its measurement band | medium | mitigate | `bench/perf-08.bench.test.ts:36-42` records the WINDOWS entry 2 band as a `PERF-08-band` info line on every run, before any budget row is written, so the band travels inside `.bench/bench-results.json` | closed |
| T-04-17 | Denial of Service | An orphaned preview-server listener holding a port across runs | low | mitigate | `bench/preview-server.ts:67-69` closes the server in a `finally` wrapping the whole callback | closed |
| T-04-18 | Tampering | `LeverageControl` and `EntryDateControl` input handling | high | mitigate | Band `(0, 20]` enforced at `LeverageControl.tsx:40-42`, applied on both the slider path (`:65-69`) and the keystroke path (`:71-90`); a rejected keystroke leaves the displayed text unchanged rather than coercing, and blur reverts to the last valid value (`:92-98`) so `buildKernelInputs` is never called with NaN. Entry-date `min`/`max` derive from `resolveEntryDateBounds` (`EntryDateControl.tsx:34,57-58`). Asserted at `tests/app/controls.browser.test.ts:259-274` and `:276-288`. **See Residual R-1**: the permalink is a second, unbanded entry point to the same field | closed |
| T-04-19 | Information Disclosure | `ValidationExplanation` rendering a symbol or date derived from state | medium | mitigate | Same evidence as T-04-02: `ValidationExplanation.tsx:55` is a JSX text child; zero `innerHTML` and zero attribute sinks in `src/app/` | closed |
| T-04-20 | Denial of Service (client) | An unknown symbol arriving from a hand-edited URL | medium | mitigate | `src/app/bounds.ts` returns a discriminated result and documents "never throw" at `:64`; asserted at `tests/app/bounds.test.ts:100` ("an unknown symbol returns a named error result rather than throwing") and `:62` | closed |
| T-04-21 | Elevation of Privilege | none applicable | low | accept | No auth surface, no privileged operation, no server. ASVS V2/V3/V4 do not apply. See ACC-04 | closed |
| T-04-22 | Tampering | `CostControls` percent-to-fraction handling | high | mitigate | `grep -c '/ 100\|\* 100' src/app/components/ParameterColumn/CostControls.tsx` returns exactly 2 (`:40-41`), the cap the plan's acceptance criteria set at `04-05-PLAN.md:252`. `buildKernelInputs`' own conversion at `src/data/kernel-inputs.ts:198-199` is unchanged since `540c073 feat(03-01)`, confirmed by `git log -L198,200` | closed |
| T-04-23 | Information Disclosure | `ValidationExplanation` rendering a thrown message containing user-supplied values | medium | mitigate | Same evidence as T-04-02/T-04-19. The thrown text is rendered verbatim as a text child, never composed into markup | closed |
| T-04-24 | Tampering | `src/validation/cost-parameters.ts` | high | mitigate | `git log --oneline -5 -- src/validation` newest commit is `330724a fix(03-06)`. No Phase 4 commit writes the sourced constants; the app only imports them (`state.ts:74`, `SourceCitation.tsx:14`). **Re-confirmed in pass 2**: `git diff --exit-code -- src/validation` exits 0 with a freshly built `dist/` present | closed |
| T-04-25 | Denial of Service (client) | A cross-field impossibility reaching `buildKernelInputs` as an uncaught throw | medium | mitigate | `state.ts:394-419` catches every throw out of the rAF callback; the holding-period overrun branch (`:396-406`) retries and renders the caveat over a still-computed result. Asserted at `tests/app/validation.browser.test.ts:128-159`, which requires the chart and metrics panel to both remain in the DOM alongside the caveat | closed |
| T-04-26 | Tampering | `perf-budgets.ts`, `bench/calibration.ts`, and the drag's own parameters | high | mitigate | Same git evidence as T-04-14, including the pass-2 re-confirmation. The drag's step count is the named constant `INTERACTION_DRAG_STEP_COUNT` (`vitest.config.ts:32`) and is disclosed in the recorded artifact at `bench/perf-07.bench.test.ts:129,137`, so weakening it changes the committed info line | closed |
| T-04-27 | Spoofing | A drag that never reaches the reactive path still reporting a pass | high | mitigate | `bench/perf-07.bench.test.ts:63-68` fails the run when `recomputeCount === 0` or `recomputeCount > stepCount`, naming both. A drag that missed the slider reports zero and cannot read as a trivially passing 0ms figure | closed |
| T-04-28 | Repudiation | A PERF-07 figure quoted later without its measurement band | medium | mitigate | `bench/perf-07.bench.test.ts:75-80` records the `PERF-07-band` info line; `:124-138` records `stepCount` and `recomputeCount` on both the 07a and 07b rows | closed |
| T-04-29 | Denial of Service | An orphaned preview-server listener or browser context | low | mitigate | `vitest.config.ts:377-381` closes the page in an inner `finally` and the fresh `BrowserContext` in an outer one, both inside `withPreviewServer`'s own `finally` (`bench/preview-server.ts:67-69`) | closed |
| T-04-30 | Spoofing | A link claiming a bundle version the deployed bundle does not carry | medium | mitigate | `BundleVersionBanner.tsx:34-36` names both versions and states the data has changed; the run is computed against the deployed bundle, pinned by `decodeHeader` (T-04-04). Asserted at `tests/app/permalink.browser.test.ts:250-264`, which requires the chart and metrics to still render beside the banner | closed |
| T-04-31 | Information Disclosure | Clipboard write of the permalink | low | accept | Explicit user action on data the user typed; no third party. See ACC-05 | closed |
| T-04-32 | Tampering | Service-worker precache surviving a redeploy | medium | mitigate | All three declared parts verified: Workbox's precache manifest carries a per-entry `revision` hash (`node_modules/workbox-build/build/lib/transform-manifest.js:20-25`); `registerType: 'autoUpdate'` at `vite.config.ts:35`; `decodeHeader(buffer, BUNDLE_VERSION)` still raises on a genuinely stale asset (`bundle-source.ts:45,51`). Corroborated end to end by `tests/app/offline.browser.test.ts:17-30`, which passed in pass 2 as part of a 53/53 app suite run against a fresh build | closed |
| T-04-33 | Tampering | `_headers` cache misconfiguration serving a stale shell | medium | mitigate | `public/_headers:1-5` scopes both immutable rules to content-hashed paths only (`/data/*.bin`, `/data/manifest.*.json`); `:12-16` gives `index.html` and `sw.js` `no-cache`. Both Phase 2 immutable rules survive verbatim. The file is emitted to `dist/_headers`. **See Residual R-2**: no standing test guards this | closed |
| T-04-35 | Denial of Service (client) | A precache larger than the configured maximum silently skipping assets | medium | mitigate | **OPEN, non-blocking. See Finding F-3.** The declared mechanism does not exist: Workbox filters the oversized entry out of the manifest and returns a warning string (`node_modules/workbox-build/build/lib/maximum-size-transform.js:18-26`), which `vite-plugin-pwa` prints via `console.warn` (`node_modules/vite-plugin-pwa/dist/chunk-G4TAN34B.js:71-73`). The build exits 0. The committed value (`vite.config.ts:45`) and its comment (`:38-44`) are also derived from the wrong quantity | open |

*Status: open / closed / open (below high threshold, non-blocking)*
*Severity: critical > high > medium > low. Only open threats at or above `workflow.security_block_on` (high) count toward `threats_open`*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Open Threats

### Blocking (severity >= high)

**None.** T-04-05 was the only blocking open threat; it was fixed and re-verified in pass 2 (F-2).

### Non-blocking (severity below high)

| Threat ID | Category | Severity | Mitigation Expected | Files Searched |
|-----------|----------|----------|---------------------|----------------|
| T-04-35 | Denial of Service (client) | medium | A build-time failure when the precache maximum is too low | `vite.config.ts`, `node_modules/workbox-build/build/lib/`, `node_modules/vite-plugin-pwa/dist/`, `tests/app/offline.browser.test.ts` |

`threats_open: 0` means no threat at or above the `high` block threshold is open. It does not mean
nothing is open. T-04-35 is open and stays open.

---

## Findings

### F-1: T-04-12's mitigation was necessary but not sufficient, and the register text was narrower than the threat

This is the most important finding in the phase, and it is a finding about threat modelling, not
about the code. It should survive the fact that the bug is now fixed.

**What the register said.** T-04-12 recorded: *"The series is truncated at the bar before ruin and a
terminator marker is drawn instead, asserted by the browser test's deliberately-ruined case; no zero
value ever enters a log-distributed series."* That mitigation was implemented exactly as written
(`EquityCurveChart.tsx:134,150-155`) and it was verified present.

**What actually happened.** On 2026-08-20, after the phase was executed, a real client-side denial of
service was found in this exact component. uPlot's built-in `logAxisSplits`
(`node_modules/uplot/dist/uPlot.esm.js:1494-1534`) advances its `do...while` by repeated addition
and then re-rounds through `roundDec`; below a sufficiently small positive log-scale minimum the
re-rounded value snaps back onto the previous value and the loop never advances. The renderer hangs
and the tab dies.

**The trigger was never a zero.** It was tiny *positive pre-ruin* values. Symbol NDX at leverage 10
from entry 1999-03-04 decays to 1.07e-24 at bar 2408, well before its ruin bar. The zero-exclusion
mitigation was never engaged on that path and could not have been: the values that killed the
renderer were exactly the values the mitigation was designed to keep.

**The reachable surface is wider than the reported repro.** A sweep of the in-band parameter space
performed during this audit (11 series x leverage {1,3,10,15,20} x 20 entry points each, against the
committed bundle) found the plotted minimum bottoms at **4.58e-37** for SPX/price-return at
leverage 20 from entry 1964-11-19, with a plotted maximum of 1.27e4 in the same run: a span of
2.77e40. That is 13 decades deeper than the NDX case that was actually reported. Every one of those
parameter sets is inside the shipped `(0, 20]` leverage band and is expressible as a permalink.

**Why this borders on T-04-03.** The trigger was reachable by permalink. A crafted or even innocently
shared link killed the recipient's page. T-04-03 ("a malformed or adversarial permalink", high) was
closed on the strength of `decodeParams` being total, but totality of the decoder is not totality of
the app: this permalink *decoded successfully*, with every field in range, and then killed the tab
downstream. The register's decomposition put the permalink DoS threat at the parser and the chart
DoS threat at the ruin case, and the actual defect fell in the gap between them.

**The fix is real and complete.** Verified at depth rather than at grep depth.

`logDecadeSplits` (`src/app/components/ResultColumn/log-axis-splits.ts:33-71`) cannot fail to advance
for any finite positive bounds:

1. Non-finite or non-positive bounds return `[]` before any loop (`:34-35`). uPlot tolerates an empty
   splits list, and the `_space == 0` guard at `uPlot.esm.js:4499-4500` covers the degenerate-scale
   case independently.
2. `smaller`/`larger` are taken from `Math.min`/`Math.max` (`:38-39`), so inverted bounds are total.
3. `lo = Math.floor(Math.log10(smaller))` and `hi = Math.ceil(Math.log10(larger))` are integers.
   `Math.log10` is finite for every positive double including the smallest denormal
   (`Math.log10(5e-324) = -323.306...`), so `lo >= -324` and `hi <= 309` before correction.
4. The two ULP-correction loops (`:49-50`) are hard-bounded at 4 iterations each and are not
   user-controlled, giving `lo >= -328`, `hi <= 313`.
5. `smaller <= larger` implies `floor(log10(smaller)) <= ceil(log10(larger))`, so `hi - lo >= 0`
   before correction; correction only decreases `lo` and increases `hi`, so `hi >= lo` always. Hence
   `step = Math.max(1, Math.ceil((hi - lo) / 8))` is an integer `>= 1` (`:54`). Equal bounds give
   `step = 1`, not `0`.
6. The loop counter `e` is an integer well below 2^53 incremented by an integer `>= 1`, so `e`
   strictly advances on every iteration and the loop runs at most `hi - lo + 1 <= 642` times.
7. `10 ** e` underflows to exactly `0` below about `e = -324`; the `Number.isFinite(value) && value > 0`
   filter (`:60,68`) drops those, so no zero, negative or non-finite value can enter a log series
   through this generator.

Empirical confirmation run during this audit: 400,000 randomized pairs drawn log-uniformly across
`[1e-330, 1e320]` plus targeted denormal, equal-bound, inverted-bound and `MAX_VALUE` cases produced
zero non-increasing adjacent pairs, a maximum list length of 9 (bound is `TARGET_DECADE_SPLIT_COUNT + 2 = 10`),
and no run exceeding 0.06ms.

**One inexactness, not a defect.** The docstring's "spans from at or below `scaleMin` to at or above
`scaleMax`" guarantee does not hold at the extreme float64 ends: `logDecadeSplits(5e-324, 1.797e308)`
returns `[1e-244 .. 1e236]`, and `logDecadeSplits(5e-324, 5e-324)` returns `[1e-323]`, which is above
`scaleMin`. This is a labelling inaccuracy on the axis, not a hang, and it is unreachable from equity
data: the reachable minimum (4.58e-37) is 287 decades above the denormal floor. The unit test's span
assertions (`tests/app/log-axis-splits.test.ts:38-42`) use a range table that does not include
denormals, which is why this was not caught there.

**Same class of defect elsewhere in this phase's rendering.** Every place this phase feeds a computed
float64 into uPlot was checked:

- **Linear y-axis branch (`numAxisSplits`, `uPlot.esm.js:1479-1490`).** This loop has the identical
  non-advance shape (`for (let val = scaleMin; val <= scaleMax; val = roundDec(val + foundIncr, numDec))`)
  and two ways to hang. Both are structurally blocked. (a) `findIncr` returns `[0, 0]` when no
  increment in `numIncrs` (which tops out at 5e31) can reach `minSpace`, i.e. when the span exceeds
  roughly 1.3e33; a `foundIncr` of 0 would loop forever, but `uPlot.esm.js:4498-4500` returns early on
  `_space == 0` before `axis.splits` is ever called. (b) `val + foundIncr === val` requires
  `foundIncr < ulp(val)`, i.e. a span more than about 16 orders of magnitude below the scalar
  magnitude; `_rangeNum`'s clamp at `uPlot.esm.js:401-403` flattens `delta` to 0 whenever the span is
  11+ orders below the raw values, and `findIncr` then guarantees `foundIncr >= minSpace * delta / dim`,
  which lands roughly 5 orders of magnitude clear of the ULP boundary. The app also never configures
  the linear branch: `EquityCurveChart.tsx:220-225` adds `splits`/`filter`/`values` only inside
  `if (isLog)`, leaving uPlot's own defaults on the linear path untouched. Checked against the worst
  reachable case (4.58e-37 to 1.27e4): `_rangeNum` pads to about `[-2000, 14000]` and the split loop
  terminates in 8 iterations.
- **X axis (`_timeAxisSplits`, `uPlot.esm.js:1140-1160`).** Same `while (1)` shape. X values are
  `days * 86400` from the compiled trading calendar (`EquityCurveChart.tsx:139-140`), bounded to real
  dates in the 1e9 to 2e9 second range, with `foundIncr >= 1` second and 3 decimal places of rounding
  at magnitudes well inside float64 integer precision. Not reachable.
- **Empty and single-point series.** `plottableBars` is 0 when `ruinBarIndex === 0`
  (`EquityCurveChart.tsx:134`), which is reachable at high leverage; the resulting empty
  `Float64Array` gives a null data range, `findIncr` returns `[0, 0]`, and the `_space == 0` guard
  fires. `buildTerminatorData` returns `undefined` for a zero-length series (`:151`), so no third
  series is added.
- **uPlot's own range computation (`rangeLog`, `uPlot.esm.js:265-300`).** For `min === max` it divides
  by the base, which can underflow to 0 at denormal magnitudes, producing a log scale minimum of 0.
  `logDecadeSplits` returns `[]` for that (`:35`) rather than emitting `-Infinity` positions from a
  generated split.
- **`axis.size` convergence.** uPlot's `convergeSize` is hard-bounded at `CYCLE_LIMIT = 3`
  (`uPlot.esm.js:3389`), and the app's own `sizeYAxis` adds a `cycleNum > 1` bail-out returning the
  settled width (`EquityCurveChart.tsx:184`).
- **`formatLogAxisValue` (`EquityCurveChart.tsx:57-63`).** Total: `Math.log10(Math.abs(0))` is
  `-Infinity`, which takes the `toExponential(0)` branch rather than throwing.

No other reachable instance of this defect class was found in this phase. The log branch was the only
one, and it is now bypassed entirely.

**Process finding to carry forward.** T-04-12's register row named a *mechanism* (the ruin zero) as
the threat rather than the *property* the renderer needs (every value handed to a log axis must be
positive **and** far enough from the float64 floor that the third party's own tick generator
terminates). A mitigation written against a mechanism can be fully implemented and fully verified and
still leave the threat open, and grep-depth verification will report it closed with a straight face.
Where this phase hands computed numbers to a third-party renderer, the register row should state the
numeric domain the renderer is being promised, not the one input case the author happened to think of.

### F-2: T-04-05's mechanical gate could not run in CI (found blocking in pass 1, fixed and re-verified in pass 2)

**Pass 1, 2026-08-20: found OPEN and blocking.**

`tests/app/static-build.test.ts` was correct code. Its `beforeAll` deliberately throws when `dist/`
is absent (`:77-85`) rather than passing vacuously, and `04-08-SUMMARY.md:105` records that this was
verified by hand with `dist/` renamed away.

The problem was where it sat in the pipeline. `.gitignore:3` ignores `dist/` and `git ls-files dist`
returns 0 files, so CI checks out without it. The pre-fix `ci.yml` ran `npm test` and
`npm run test:app` *before* `npm run build`. On a clean runner all four tests in the gate file failed
on the `beforeAll` throw, `npm test` exited non-zero, and the job stopped before the build ever
executed. The gate never scanned a build in CI. Locally it scanned whatever `dist/` happened to be on
disk, which can be arbitrarily stale relative to `src/`.

The same ordering defect hit `npm run test:app`: `tests/app/offline.browser.test.ts` goes through
`withPreviewServer`, which throws on a missing `dist/index.html` (`bench/preview-server.ts:41-46`),
and the `app` project has no `globalSetup` that builds (`vitest.config.ts:388-395`).

Traceable origin: `04-03-SUMMARY.md:103` records the deliberate choice to put `npm run build`
*between* `npm run test:app` and `npm run bench`, correct for the build-before-bench requirement that
plan was solving. Plan `04-08` then added two gates that require `dist/` and run earlier, and
`04-08-SUMMARY.md:216` records the local verification as
`npm run typecheck && npm test && npm run test:app && npm run bench && npm run build`, with the build
last, so the local greens were obtained against a `dist/` left over from an earlier build.

The defect was **latent rather than merely dormant**: `ci.yml` triggers only on `pull_request` and
pushes to `main`, and the phase branch was unpushed, so the pipeline had never had the chance to go
red. Opening the PR is what would have surfaced it for the first time.

**Pass 2, 2026-08-20: fixed and re-verified. CLOSED.**

The amended `.github/workflows/ci.yml` runs `npm run build` at line 73, ahead of `npm test` (`:75`),
`npm run test:app` (`:77`) and `npm run bench` (`:79`). The step carries a comment recording why the
old ordering was wrong. Verified independently rather than accepted on report:

1. **The pre-fix failure mode reproduces exactly as described.** With `dist/` moved aside,
   `npx vitest run --project unit tests/app/static-build.test.ts` reports
   `tests/app/static-build.test.ts (4 tests | 4 skipped)`, raises
   `Error: static-build.test: ".../dist" does not exist` at `static-build.test.ts:79`, and exits 1.
   The gate genuinely could not run.
2. **The gate now executes against a real fresh build.** `npm run build` from an absent `dist/` exits
   0 (`precache 19 entries (1759.73 KiB)`, no Workbox size warning). All four gate tests then execute
   and pass by name under `--reporter=verbose`, rather than skipping.
3. **Full suites green in the CI order.** `npm test` after the build: **546 passed (546)** across
   **39 files**, matching the coordinator's figure. `npm run test:app`: **53 passed (53)** across 10
   files, which is more than the 45 recorded at `04-08-SUMMARY.md:216` because the log-axis
   regression files (F-1) were added afterwards.
4. **The ordering pin survives and is still load-bearing.** `tests/ci-workflow.test.ts` passes 17/17,
   including the build-before-bench positional assertion at `:145-158`. That assertion compares
   `indexOf` positions in the comment-stripped workflow; the comment-stripped text contains exactly
   one occurrence of `npm run build` and one of `npm run bench` (the raw file has two of the former,
   the second being the new explanatory comment), so the assertion is measuring the real run steps
   and not comment prose. The pin requires "before", not "immediately before", so the reorder keeps
   it satisfied.

**Item 2 of the re-verification brief: does building earlier weaken anything previously verified?**
No. Checked three ways, empirically rather than by assumption.

- **T-04-14 / T-04-26 / T-04-24 (the `git diff --exit-code` gates).** Confirmed rather than assumed:
  `git check-ignore -v dist` reports `.gitignore:3:dist/`, and `git status --porcelain` on a tree
  with a freshly built `dist/` lists only the intended `.github/workflows/ci.yml` modification and
  this untracked report. Running the gate commands verbatim on that tree:
  `git diff --exit-code -- perf-budgets.ts bench/calibration.ts` exits 0,
  `git diff --exit-code -- src/validation` exits 0, and the DATA-09 gate
  `git diff --exit-code -- public/data src/data-bundle.generated.ts` exits 0. There are two
  independent reasons this cannot regress: `dist/` is gitignored, and `git diff` reports only
  modifications to tracked files, never untracked ones, so an un-ignored `dist/` still could not dirty
  it. Separately, the DATA-09 gate sits at `ci.yml:35-41`, before the build, so it is not even inside
  the affected window.
- **T-04-15 (preview server serving a stale or absent `dist/`).** *Absent* is impossible: step 73 must
  exit 0 for the job to reach step 79. *Stale* would require something between them to modify `src/`
  or `dist/`. Verified by hashing: `find dist -type f | sort | xargs sha256sum | sha256sum` is
  `8bc0c8dc8a0f...` both before and after running `npm test` and `npm run test:app`, so `dist/` is
  byte-identical at the moment `npm run bench` starts. One wording note, not a gap: the register's
  phrase "CI runs `npm run build` immediately before `npm run bench`" is no longer literally true,
  since two read-only steps now intervene. The substance holds and is now measured rather than
  inferred.
- **No new vacuity introduced.** `dist/` now exists during unit-test collection. It cannot be picked
  up as test input: the `unit` project's include patterns are `tests/**/*.test.ts` and
  `tools/**/tests/**/*.test.ts`, and its exclude list carries `**/dist/**` (`vitest.config.ts:41,49`).

**Verdict: CLOSED.** The mitigation is present, correct, and executable in CI, and the register's
closing clause ("adding an external origin becomes a deliberate, reviewed test edit") is now true.
See Residual R-5 for the one remaining factual caveat, which does not keep the threat open.

### F-3: T-04-35's declared mechanism does not exist (open, non-blocking)

T-04-35 recorded: *"Workbox fails at build time rather than at runtime when the maximum is too low,
and the committed value carries a comment naming the measured total it was derived from."* Both halves
were checked against the installed dependency rather than taken from the plan.

**First half is false.** `maximumSizeTransform`
(`node_modules/workbox-build/build/lib/maximum-size-transform.js:18-26`) `filter`s the oversized entry
out of the precache manifest and pushes a warning string. `transformManifest` collects those into a
`warnings` array (`transform-manifest.js:52`) and returns normally. `vite-plugin-pwa` prints them with
`console.warn` (`chunk-G4TAN34B.js:71-73`). Nothing throws; `npm run build` exits 0 with the asset
silently absent from the precache. That is precisely the "silently skipping assets" the threat names,
degraded only to a console line in build output nobody reads on a green build.

**Second half is a category error.** `maximumFileSizeToCacheInBytes` is a **per-file** limit. The
comment at `vite.config.ts:38-44` derives it from the whole-bundle total ("precache 19 entries
(1757.82 KiB) ... ~1,799,988 bytes total") and reasons about "a modestly larger future build". The
committed 2,500,000 is safe today only incidentally, because the largest single `.bin` is far below it.
A future maintainer sizing this against total growth, exactly as the comment instructs, would size it
wrong: the limit would still trip on a single large symbol series long before the total reached it.

**A real backstop does exist, but not the one named.** `tests/app/offline.browser.test.ts:17-30`
asserts `failedRequestCount === 0` on an offline reload and that a non-default symbol computes
offline, which a dropped `.bin` would break. That is a runtime-behaviour gate, not a build-time
failure. Pass 2 improved its standing incidentally: with the CI reorder it now actually runs against a
real build, which it previously could not (F-2). It passed in pass 2 as part of a 53/53 app suite.
The current build emits no size warning at all (`precache 19 entries (1759.73 KiB)`), so nothing is
being dropped today.

**Non-blocking** at severity medium under `block_on: high`. Remediation: correct the comment to name
the per-file quantity and the largest single asset it was sized against, and note that the actual
detection mechanism is the offline test, not a build failure.

---

## Residual Observations

Not open threats. The register's mitigations are present. Recorded because the *scope* or *placement*
of a control differs from what the register assumed.

**R-1: Phase 3's carry-forward R-1 has materialized: the leverage band is still not at the data
layer, and the permalink is now a second, unbanded caller.**

`03-SECURITY.md`'s R-1 predicted: *"In Phase 6/7 a Worker or UI calling `buildKernelInputs` directly
bypasses the band entirely."* It happened in Phase 4, two phases early.

`buildKernelInputs` still only calls `assertFinite('leverage', ...)` (`src/data/kernel-inputs.ts:134`);
there is no `(0, 20]` check at that seam. `LeverageControl.tsx:34-35` duplicates the constants as
script-local values and enforces the band at the control (T-04-18, closed on that evidence). But
`decodeParams` validates `leverage` only as `parsePositiveFiniteNumber` (`permalink.ts:291-294`), and
`applyPermalinkFromLocation` writes it straight into the store (`state.ts:510`), from which
`scheduleRun` hands it to `buildKernelInputs` unfiltered (`state.ts:391`). A permalink carrying
`leverage=1000` is accepted and computed.

Impact was measured rather than assumed. Running the real kernel against the committed bundle at
leverage 20, 50, 200, 1000 and 1e6 from SPX's first strict-tier bar: every out-of-band value ruins
within 1 to 3 bars, producing a 1 to 3 bar truncated series with a ruin banner. No NaN, no
non-finite value, no extreme axis range, no hang. So this is a correctness and consistency gap (the
UI refuses a value the URL accepts), not a live vulnerability.

*Carry-forward, restated with more urgency than Phase 3 gave it:* move the band into
`buildKernelInputs` and have both `LeverageControl` and `decodeParams` defer to it. Phase 4 added the
second caller Phase 3 said would force this, and the duplicate-constants comment at
`LeverageControl.tsx:30-33` ("must move in lockstep") is now a three-way lockstep obligation across
`scripts/run-backtest.ts`, `LeverageControl.tsx` and, implicitly, `permalink.ts`.

**R-2: three of this phase's controls are plan-time acceptance criteria, not standing tests.**

T-04-33's register text says the `_headers` rules are "asserted by the acceptance criteria checking
both original rules survive verbatim." `grep -rn "_headers" tests/ bench/ src/ vitest.config.ts`
returns zero hits: the assertion was a one-time execution-time check
(`04-08-SUMMARY.md:216` records it), not a committed regression test. The same applies to T-04-22's
occurrence-count grep (`04-05-PLAN.md:252`) and T-04-19/T-04-23's `innerHTML` grep. All three
properties hold right now (verified directly in this audit), and all three would regress silently.
The `ci-workflow.test.ts` pattern already in this repo is the model for making them standing, and
F-2 is a worked example of why that pattern is worth extending: the one ordering property that *was*
pinned by a test survived the pass-2 reorder automatically.

**R-3: the T-04-05 gate's file filter excludes the one emitted file that contains external
origins.**

`collectFiles(DIST_DIR, ['.js', '.css', '.html'])` (`static-build.test.ts:89`) does not scan
`.json`, `.webmanifest` or `_headers`. `dist/data/manifest.f0a9dfbdfa.json` contains 20+ absolute
external URLs (`query1.finance.yahoo.com`, `fred.stlouisfed.org`, `indexes.nasdaqomx.com`,
`legal.yahoo.com`) as provenance citations.

This is currently inert and was confirmed inert rather than assumed: those fields are decoded by
`bundle-source.ts` but never rendered, and `grep -rn "href=\|src=\|<a " src/app/` returns zero
matches, so this phase has no attribute sink at all. It becomes live the moment a later phase renders
a source citation as a clickable link, at which point a manifest-supplied string reaches an `href`,
which JSX text escaping does not cover. Widening the gate's extension list now is cheap; the
allow-list would simply need the four data-source hosts added with their reasons. Pass 2 raises the
value of doing this: the gate now genuinely runs in CI, so widening its scope buys real coverage
rather than notional coverage.

**R-4: no standing regression test covers the T-04-09 fetch-failure and Retry path.**

The code path is complete and verified (`load-bundle-browser.ts:17-19` to `state.ts:629-633` to
`App.tsx:84-91`), and `resetAppState` exists specifically so a test can stub `fetch` and force a
genuine reload (`state.ts:448-462` documents this as one of its reasons). No test does. The stub
pattern is already in use elsewhere (`controls.browser.test.ts:138-154`).

**R-5: the amended workflow has not yet executed in a real CI job.**

`ci.yml` triggers only on `pull_request` and pushes to `main`
(`.github/workflows/ci.yml:6-10`), and the phase branch is unpushed, so no run of the corrected
pipeline exists on the server yet. Pass 2's verification reproduced the CI step sequence locally
(`npm run build`, then `npm test`, then `npm run test:app`) and all of it is green, which is why
T-04-05 is closed rather than held open: the control is present, correct and demonstrably executable.
What remains is confirmation on the real runner. Push the branch, open the PR, and confirm the job
goes green, in particular that the four `static-build gate (APP-03, T-04-05)` tests appear as passed
rather than skipped in the CI log. If that run is red for a reason this audit did not anticipate,
T-04-05 reopens.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| ACC-02 | T-04-06 | Cloudflare Pages serves over HTTPS by default and no control specific to this app improves on that. Recorded at plan time in `04-01-PLAN.md`. Not invalidated by what shipped: the app makes no runtime external call, so there is no second origin whose transport could be downgraded independently | Andy Barcinski | 2026-08-19 |
| ACC-03 | T-04-13 | The tool has no accounts and no server log; the self-describing permalink from plan 04-07 is the project's own accountability mechanism. Recorded at plan time in `04-02-PLAN.md`. **Strengthened, not invalidated, by what shipped**: `encodeParams` emits all fifteen keys in one fixed order (`permalink.ts:51-67,106-120`) including `bundleVersion`, and `tests/app/permalink.test.ts:420` pins golden URLs to their recorded metrics, so a displayed figure is reproducible from its link | Andy Barcinski | 2026-08-19 |
| ACC-04 | T-04-21 | No auth surface, no privileged operation and no server exist in this phase; ASVS V2, V3 and V4 do not apply. Recorded at plan time in `04-04-PLAN.md`. Not invalidated: `static-build.test.ts:112-118` mechanically asserts no `dist/functions/`, no `dist/_worker.js` and no `dist/_redirects` was emitted, so the "no server" premise is now checked rather than assumed, and as of pass 2 that check actually runs in CI | Andy Barcinski | 2026-08-19 |
| ACC-05 | T-04-31 | The clipboard write is an explicit user action on data the user typed; no third party is involved, and APP-03 forbids a runtime external call regardless. Recorded at plan time in `04-07-PLAN.md`. Not invalidated: `CopyLinkButton` calls `flushPermalinkUrl()` before reading `window.location.href` (`state.ts:297-312`) and falls back to selectable text on permission denial (`tests/app/permalink.browser.test.ts:324-341`), so nothing leaves the page that the user did not already have on screen | Andy Barcinski | 2026-08-19 |
| ACC-06 | T-04-34 | Service worker precache poisoning on a compromised first load is out of this app's control surface; Cloudflare Pages serves over HTTPS by default and no app-specific control improves on it (`04-RESEARCH.md` Security Domain records the same disposition). Recorded at plan time in `04-08-PLAN.md`. **Partially mitigated in depth by what shipped**, without changing the acceptance: `decodeHeader(buffer, BUNDLE_VERSION)` (`bundle-source.ts:45,51`) rejects a poisoned asset that does not carry the deployed bundle version, which narrows the window to a same-version substitution | Andy Barcinski | 2026-08-19 |

No accepted risk in this phase has been invalidated by what shipped. ACC-03, ACC-04 and ACC-06 are
each better supported now than at plan time.

---

## Security Audit Trail

| Audit Date | Pass | Threats Total | Closed | Open (blocking) | Open (non-blocking) | Run By |
|------------|------|---------------|--------|-----------------|---------------------|--------|
| 2026-08-20 | 1 | 34 | 32 | 1 (T-04-05) | 1 (T-04-35) | /gsd-secure-phase (ASVS L1, with L2/L3 depth on T-04-12 and T-04-35) |
| 2026-08-20 | 2 | 34 | 33 | 0 | 1 (T-04-35) | /gsd-secure-phase re-verification of T-04-05 after the `ci.yml` fix |

Pass 2 scope: T-04-05 re-verified from scratch (pre-fix failure reproduced, post-fix execution
confirmed), plus the three threats the reorder could plausibly have disturbed (T-04-14, T-04-15,
T-04-24/T-04-26). Everything else carries forward from pass 1 unchanged. T-04-35 was re-examined and
deliberately left open.

Method: registers extracted from all eight `04-0*-PLAN.md` `<threat_model>` blocks and deduplicated
(`T-04-05` appears in both `04-01` and `04-08` and is verified against `04-08`'s stated mitigation, as
`04-01` explicitly deferred it there). `T-04-07` and `T-04-08` are undefined in this phase and are not
carried as phantom rows. No `## Threat Flags` section is present in any of the eight SUMMARY files, so
no unregistered flags were surfaced by the executor; the three findings and five residuals above were
found by this audit.

Depth: grep-depth (L1) for most threats, which is what ASVS level 1 specifies. Three exceptions where
L1 was demonstrably insufficient and deeper verification was performed:

- **T-04-12** was traced end to end through uPlot's own source, `logDecadeSplits` was verified for
  termination by proof and by 400,000-case fuzz over the full positive double range, and every other
  computed-number-to-uPlot boundary in the phase (linear splits, time splits, empty series, `rangeLog`,
  size convergence, the axis value formatter) was inspected for the same defect class. This is L3 work
  and it was done because the phase's own history proves L1 would have reported this threat closed
  while it was live.
- **T-04-35** was verified against the installed `workbox-build` and `vite-plugin-pwa` source rather
  than against the plan's claim about them, which is how the declared mechanism was found not to exist.
- **T-04-05** was verified by executing the gate in both states (build absent, build fresh) rather
  than by confirming the file exists, in pass 1 and again in pass 2. A grep-depth pass would have
  reported it closed in pass 1, since the named artifact was present and its logic was correct.

Two mitigations in this register are plan-time git gates rather than shipped code (T-04-10/14/24/26).
These were verified from `git log` on the gated paths, not from the plans asserting they ran:
`perf-budgets.ts` (newest `2203510`, 2026-08-18), `bench/calibration.ts` (newest `c45d14d`,
2026-08-18) and `src/validation` (newest `330724a fix(03-06)`) all predate Phase 4's first commit
`030c37a` (2026-08-19). The UPRO/TQQQ gate was re-executed during pass 1 and is green. The gate
commands themselves were re-executed verbatim in pass 2 against a tree carrying a freshly built
`dist/`, and all exit 0.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed. No threat at or above the `high` block threshold is open.
      **This is not "nothing is open": T-04-35 (medium) is open and non-blocking by policy, not by
      resolution.**
- [x] `status: verified` set in frontmatter
- [ ] T-04-35 resolved. Deferred, non-blocking. See F-3.
- [ ] Corrected pipeline confirmed green on a real CI runner. See R-5.

**Approval:** verified 2026-08-20 (pass 2). The one blocking threat found in pass 1 was fixed and
independently re-verified; the fix weakens nothing previously verified, checked empirically for the
three threats it could plausibly have disturbed. Ship is not blocked. Two items are owed and neither
gates this phase: correct T-04-35's `vite.config.ts` comment and its recorded mechanism (F-3), and
confirm the amended workflow green on its first real run (R-5).
