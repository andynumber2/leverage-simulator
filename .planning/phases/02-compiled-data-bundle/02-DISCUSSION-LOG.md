# Phase 2: Compiled Data Bundle - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-17
**Phase:** 2-Compiled Data Bundle
**Areas discussed:** Raw inputs + provenance, Calendar alignment policy, Tier construction + derived series, Binary layout + precision

---

## Raw Inputs + Provenance

### Do the raw CSVs live in the repo, or does a script fetch them at compile time?

| Option | Description | Selected |
|--------|-------------|----------|
| Commit raw + fetch script | Raw CSVs checked in as source of truth; separate script refreshes them and shows a diff | ✓ |
| Commit raw CSVs only | Manual drops, no fetcher | |
| Fetch at build + commit checksums | Only checksums and a fetch manifest versioned | |

**User's choice:** Commit raw + fetch script
**Notes:** Rests on PROJECT.md's rejection of live lookup, which cites vendor revisions silently changing past conclusions.

### How does an operator declare provenance for a dropped CSV?

| Option | Description | Selected |
|--------|-------------|----------|
| Sidecar JSON per file | `raw/SPX-TR.csv` + `raw/SPX-TR.meta.json`; compiler refuses an unaccompanied CSV | ✓ |
| One registry file | `raw/sources.json` listing every input | |
| Filename convention only | Encode symbol, kind and source in the filename | |

**User's choice:** Sidecar JSON per file
**Notes:** Filename convention rejected because it cannot carry a URL, retrieval date or license, all of which DATA-06 needs.

### What CSV format does the compiler accept?

| Option | Description | Selected |
|--------|-------------|----------|
| One canonical schema | `date,value` only, validated hard; fetch script normalizes | ✓ |
| Per-source adapters in the compiler | Sidecar declares `format: stooq \| fred \| shiller` | |
| Canonical schema + adapters | Both paths supported | |

**User's choice:** One canonical schema
**Notes:** Keeps the compiler's input contract single and testable; adding a source stays a fetch-script change.

### Lock the source stack now, or leave it to the phase researcher?

| Option | Description | Selected |
|--------|-------------|----------|
| Lock: Stooq + FRED + Shiller | Free, no API key; researcher verifies coverage rather than re-choosing | ✓ |
| Researcher picks and documents | CONTEXT states coverage requirements only | |
| Lock, but keyed sources allowed | Adds Tiingo / Nasdaq Data Link where free sources fall short | |

**User's choice:** Lock: Stooq + FRED + Shiller
**Notes:** Keyed sources rejected because a build-time API key conflicts with the fetch script being runnable by anyone who clones the repo.

### How should the licensing question be handled?

| Option | Description | Selected |
|--------|-------------|----------|
| Record terms per source, proceed | Sidecar carries license/terms; manifest surfaces it | ✓ |
| Keep the repo private | Sidesteps redistribution entirely | |
| Free sources only, no commit of restricted data | Commit FRED and Shiller; gitignore Stooq | |

**User's choice:** Record terms per source, proceed
**Notes:** The user accepted the recommendation but asked where the terms would physically be recorded, which prompted the follow-up below. Private-repo option noted as conflicting with the project's purpose, since the deployed app is public and the compiled bundle is itself derived vendor data.

### Where does the licensing record live?

| Option | Description | Selected |
|--------|-------------|----------|
| Sidecar authors, manifest carries, methodology renders, Key Decision records the risk | Four surfaces, one authored | ✓ |
| Same, plus a `raw/README.md` | Additional human-readable summary | |
| Sidecar and manifest only | Skip the Key Decision | |

**User's choice:** Yes, as described
**Notes:** `raw/README.md` rejected as a fourth surface that can drift. Skipping the Key Decision rejected because the licensing risk was accepted deliberately and a JSON field makes it invisible to anyone reviewing project decisions.

### Is the fetch script's refresh pinned to an as-of date?

| Option | Description | Selected |
|--------|-------------|----------|
| Always latest, diff on refresh | Git diff is the review surface | ✓ |
| Pinned as-of date per source | Sidecar carries `asOf` | |
| Latest, plus a checksum gate in CI | CI fails on checksum mismatch | |

**User's choice:** Always latest, diff on refresh
**Notes:** Pinning rejected because Stooq and Shiller do not cleanly support date-bounded queries, so it would be honored inconsistently.

---

## Calendar Alignment Policy

### What is the reference calendar?

| Option | Description | Selected |
|--------|-------------|----------|
| Derive from S&P daily | Longest-running US equity series defines the calendar | ✓ |
| Derive from S&P, with a calendar field in the sidecar | Same, plus an explicit per-series calendar declaration | |
| Calendar library as authority | External NYSE calendar package | |

**User's choice:** Derive from S&P daily
**Notes:** The user first asked which equities would not fit an NYSE calendar. Answer: none in the current universe, since UPRO, TQQQ, SSO, QLD, VTI, EFA, EEM and TLT all trade on NYSE Arca or Nasdaq; EFA and EEM hold foreign assets but that shows up as NAV behavior, not missing bars. The risk appears only with a future foreign index, a 24/7 series, or a non-equity session calendar. The pre-1952 NYSE Saturday-session point emerged here and became the strongest argument against a calendar library, since roughly a quarter of the project's deepest history falls in that era.

### Where is the line on DATA-02's fail-loudly rule?

| Option | Description | Selected |
|--------|-------------|----------|
| Fatal for prices, bounded recorded carry-forward for rates | Price gaps abort; rate gaps carry forward within a limit and are recorded as seams | ✓ |
| Any interior gap is fatal | Operator patches the raw CSV by hand | |
| Carry-forward always allowed, always recorded | No limit | |

**User's choice:** Fatal for prices, bounded recorded carry-forward for rates
**Notes:** Driven by the Columbus Day / Veterans Day case, where the bond market closes and the stock market stays open, so FRED legitimately lacks a rate on a day prices exist. Hand-patching rejected because edited vendor data destroys the provenance argument and is indistinguishable from a real value in a diff.

### A symbol has a bar on a date the reference calendar lacks

| Option | Description | Selected |
|--------|-------------|----------|
| Fatal, name the dates | Either the vendor or the calendar is wrong; both need a human | ✓ |
| Drop the extra bars, record as a seam | Never blocks a compile | |
| Extend the reference calendar to include it | Union of observed trading days | |

**User's choice:** Fatal, name the dates
**Notes:** Extending rejected because one vendor's bad row would create a phantom trading day that every other series then appears to be missing.

### How does the operator unblock a known accepted quirk?

| Option | Description | Selected |
|--------|-------------|----------|
| Exceptions file with a reason per entry | `raw/calendar-exceptions.json`, copied into the manifest | ✓ |
| No override, fix the raw data | Hand-edit the CSV | |
| A CLI flag | `--allow-gaps` | |

**User's choice:** Exceptions file with a reason per entry
**Notes:** CLI flag rejected because its failure mode is someone leaving it on in CI, turning DATA-02 into a no-op.

### Ragged right edges, and how loud is the staleness warning?

| Option | Description | Selected |
|--------|-------------|----------|
| Warn, do not abort | Per-symbol end date in the manifest; warn past a threshold | ✓ |
| Warn, and fail in CI only | Stale bundle cannot deploy | |
| Record it, no warning | Manifest only | |

**User's choice:** Ragged allowed; warn, do not abort
**Notes:** The user pushed back that they did not see why differing end dates are a problem, and agreed with the recommendation while asking for the reasoning. The distinction that resolved it: ragged left edges are already normal (UPRO 2009, TQQQ 2010, EEM 2003), but a ragged right edge usually signals a silently failed refresh rather than a fact about the world, and hold-to-today silently becomes per-symbol when one series lags by months. The value is detection, not the data model. CI-fail rejected because a genuinely delisted symbol would permanently red CI.

---

## Tier Construction + Derived Series

### What is a tier a property of?

| Option | Description | Selected |
|--------|-------------|----------|
| Per symbol and dividend mode | Strict range is the intersection of the inputs a given run uses | ✓ |
| Per symbol | One strict range per symbol across both series | |
| Global bundle-wide | One strict range for the whole bundle | |

**User's choice:** Per symbol and dividend mode
**Notes:** Per-symbol would collapse S&P strict to 1988 and discard 34 years of genuinely-daily price history; bundle-wide would let EEM's 2003 start collapse strict to 2003 for everything.

### How is total return constructed before 1988?

| Option | Description | Selected |
|--------|-------------|----------|
| Shiller monthly dividends, interpolated to daily | Spliced to real daily TR at 1988, every seam recorded | ✓ |
| No total return before 1988 | Dividend toggle disabled pre-1988 | |
| Shiller dividends as a monthly step | Hold each month's yield flat | |

**User's choice:** Shiller monthly dividends, interpolated to daily
**Notes:** No-TR option rejected because the 1929 case would then exist only in price-return terms.

### How is the 1928 to 1933 short rate handled?

| Option | Description | Selected |
|--------|-------------|----------|
| Add a fourth source for the gap | NBER Macrohistory monthly short rates, spliced at 1934 and 1954 | ✓ |
| Extended tier starts 1934 | Tier bounded by its worst input | |
| Assumed constant rate before 1934, loudly flagged | Documented single rate | |

**User's choice:** Add a fourth source for the gap
**Notes:** Surfaced as the sharpest gap in the phase: under the locked source stack there is no short rate at all for 1928 to 1933, which is exactly the 1929 crash and the 1929-1932 drawdown the extended tier exists to reach. Bounding at 1934 rejected because the tool could not then answer the question it was built for. Assumed constant rejected as a fabricated input in the era the tool most needs to be believed about. Leaves a research task: confirm the NBER series is available machine-readably for 1928-1934.

### What does a seam record contain?

| Option | Description | Selected |
|--------|-------------|----------|
| Typed records with method and affected range | kind, range, source on each side, method | ✓ |
| Typed records plus a per-day mask | Parallel byte array marking constructed bars | |
| Seam dates only | Boundary dates, nothing else | |

**User's choice:** Typed records with method and affected range
**Notes:** Per-day mask rejected as an extra array charged against a 1000ms decode budget that has never been measured, and reconstructible from ranges if needed. Dates-only rejected as satisfying the letter of criterion 3 while defeating its purpose.

### What should Phase 2 do about the extended-tier bias claim?

| Option | Description | Selected |
|--------|-------------|----------|
| Record the finding, change nothing else | Carry it to Phase 5; typed seam records already give Phase 5 what it needs | ✓ |
| Also emit a per-series bias descriptor | Manifest field naming direction and mechanism per constructed series | |
| Escalate the roadmap wording now | Revise Phase 5 criterion 4 as part of this phase | |

**User's choice:** Record the finding, change nothing else
**Notes:** Raised by Claude at the top of the area: Phase 5 criterion 4's claim that interpolation smooths daily volatility and understates drag appears wrong, since daily S&P prices genuinely reach 1928 and only rates and dividends are interpolated. Bias descriptor rejected as authored prose in the compiler, the one thing that can drift from the data. Escalation rejected as outside this phase's boundary and premature before measurement.

---

## Binary Layout + Precision

### One asset per series, one per symbol, or a single bundle file?

| Option | Description | Selected |
|--------|-------------|----------|
| One asset per symbol, both series inside | Plus a shared rate asset, a shared calendar asset, and the manifest | ✓ |
| Single bundle file | Everything in one ArrayBuffer with an index | |
| One asset per series | Finest granularity, ~20 small files | |

**User's choice:** One asset per symbol, both series inside
**Notes:** Single-bundle rejected because refreshing any symbol changes the whole bundle's hash and forces every user to re-download everything.

### What numeric encoding do the series use?

| Option | Description | Selected |
|--------|-------------|----------|
| Raw float64, no transform | Zero-copy typed-array view; exact round trip by construction | ✓ |
| Float32 | Halves the bytes | |
| Float64 with lossless XOR pre-compression | Gorilla-style, exactly reversible | |

**User's choice:** Raw float64, no transform
**Notes:** Constrained by criterion 5's exact-match round-trip requirement. Float32 breaks it and risks ~7-significant-digit error compounding across 25,000 bars. XOR pre-compression preserves exactness but turns decode into a per-value loop, spending the one budget (PERF-08b) that has never been measured. Estimated ~1.3MB raw before edge compression.

### Levels or precomputed returns?

| Option | Description | Selected |
|--------|-------------|----------|
| Levels, kernel derives returns | Compiled data matches the raw CSV value-for-value | ✓ |
| Precomputed daily returns | Saves one division in the hot loop | |
| Both | Provenance plus speed | |

**User's choice:** Levels, kernel derives returns
**Notes:** Returns-only would leave nothing in the bundle a skeptic could compare against a source CSV. Both was rejected as two representations that can disagree, a correctness risk taken on to avoid one arithmetic operation.

### How do the dates travel?

| Option | Description | Selected |
|--------|-------------|----------|
| Shared calendar asset, series carry a start index | Days-since-epoch Int32Array; header stores start index and length | ✓ |
| Per-series date array | Self-contained files | |
| Start date plus the calendar rebuilt at runtime | Smallest bundle | |

**User's choice:** Shared calendar asset, series carry a start index
**Notes:** Runtime rebuild rejected as a second calendar implementation that can drift from the compiler's, and the pre-1952 Saturday sessions are exactly where it would drift.

### How is DATA-09 enforced?

| Option | Description | Selected |
|--------|-------------|----------|
| Hash the manifest too, plus a version stamp in every asset header | Decoder throws on mismatch | ✓ |
| Hashed assets, manifest served no-cache | Standard pattern | |
| Vite content hashing alone | Zero extra machinery | |

**User's choice:** Hash the manifest too, plus a version stamp in every asset header
**Notes:** A stale asset then fails loudly at decode instead of producing quietly wrong numbers. Vite-hashing-alone leaves a partial deploy undetectable.

### How do bundle size and decode time enter the bench harness?

| Option | Description | Selected |
|--------|-------------|----------|
| New decode budget row, and extend the type with a unit for bytes | Keeps `perf-budgets.ts` as single source of truth | ✓ |
| Gate decode, report size informationally | No type change | |
| Measure decode against PERF-08b directly | Smallest change | |

**User's choice:** New decode budget row, and extend the type with a unit for bytes
**Notes:** Raised that `PerfBudget` currently models only millisecond thresholds, so a byte budget does not fit the existing type. Measuring against PERF-08b directly rejected because decode is only one component of it: a decode passing at 900ms would look fine and blow the real budget once Phase 4 adds fetch and first render.

---

## Claude's Discretion

- Exact sidecar field list beyond source, URL, retrieval date, series kind and license/terms
- Binary header layout (magic bytes, format version, series count, offsets) and its shared TypeScript type
- Numeric value of the rate carry-forward limit and the staleness threshold
- Manifest JSON schema and whether it is build-time validated
- Compiler test strategy: golden files versus property tests over the round trip
- CLI ergonomics, argument parsing, failure output format
- Whether the compiler is a workspace package or a script in the existing tree
- Directory layout under `raw/` and compiled asset naming
- The declared connection speed anchoring the bundle-size budget

## Deferred Ideas

- Per-day constructed-data mask (revisit if Phase 5 needs bar-level bias quantification)
- Compressed or quantized binary layout (XOR/Gorilla, scaled int32, delta encoding)
- Restating Phase 5's extended-tier bias claim (belongs to Phase 5)
- Bundle-size trend tracking over time
- Keyed data sources (Tiingo, Nasdaq Data Link)

---
---

# Session 2 — Source-Stack Reversal

**Date:** 2026-08-17 (later same day, after the manual-download session)
**Areas discussed:** S&P total-return source, adjclose stability on refresh, D-04/D-05/D-06 rewrite, Manual vs automated fetch

**Why this session happened:** the manual download of the 23 Stooq/Shiller files in
`MANUAL-DOWNLOAD.md` failed. Stooq had renamed `^spx` to `^USLC` (a different index, 2013+),
its `^ndx` carried 47 years of data predating the Nasdaq-100's 1985 launch, and its `Close`
column turned out to be dividend-adjusted. D-04's locked source stack did not hold.

---

## S&P total-return source

| Option | Description | Selected |
|--------|-------------|----------|
| ^SP500TR from Yahoo | S&P 500 Total Return index; guessed that its inception explains D-14's 1988 boundary | ✓ |
| SPY adjclose, splice at 1993 | Certain to exist, but loses 5 years and is an ETF not the index | |
| Shiller construction throughout | No splice, no ticker dependency, but nothing real to validate against | |

**User's choice:** ^SP500TR from Yahoo
**Notes:** Verified in-session: first bar 1988-01-04, exactly the declared boundary. 9,728 bars,
zero nulls. Cross-checked against ^GSPC (256.02 vs 255.94 on day one, 6609.29 vs 3257.85 by 2020).

---

## NDX total-return source

| Option | Description | Selected |
|--------|-------------|----------|
| ^XNDX from Yahoo | Nasdaq-100 Total Return, same pattern as ^SP500TR | ✓ (ticker), source changed |
| QQQ adjclose as proxy | Certain to work, but folds QQQ's expense ratio into an index series | |
| No NDX total return | Honest, but amends 02-05's universe test and DATA-07 | |

**User's choice:** ^XNDX — but Yahoo stores no history for it (`firstTradeDate: null`,
`validRanges: ["1d","5d"]`). The user then found `indexes.nasdaqomx.com/Index/History/XNDX`.
**Notes:** A follow-up question about what to do if a total-return ticker turned out missing was
**withdrawn** — the user redirected to verifying the tickers live rather than designing for a
hypothetical. Both were then resolved empirically. Nasdaq's export goes back only to 1999-03-04,
which is acceptable under D-14 (tier is a property of the pair). Exports as Excel, needs manual
CSV conversion. The user chose EOD over start-of-day prices.

---

## adjclose stability on refresh

| Option | Description | Selected |
|--------|-------------|----------|
| Reconstruct from close + dividends | Past values immutable; refresh appends instead of rewriting | ✓ |
| Store adjclose as sourced | Simplest, matches D-20, but every refresh rewrites all rows | |
| Store both | Strongest verification, but doubles the raw tree against an unmeasured decode budget | |

**User's choice:** Reconstruct from close + dividends
**Notes:** Verified before committing to it — reconstruction reproduces adjclose to 0.0033% (QQQ)
through 0.0828% (TQQQ, worst case across 372x growth).

| Option | Description | Selected |
|--------|-------------|----------|
| Hard gate in the fetch script | Exits non-zero past a declared tolerance | ✓ |
| Gate in the test suite instead | Runs in CI, but a bad refresh commits first | |
| Record the delta, do not gate | Visible in the manifest, but nothing blocks a broken series | |

**User's choice:** Hard gate in the fetch script

| Option | Description | Selected |
|--------|-------------|----------|
| Derived CSV + vendor JSON, both committed | D-03 and D-20 hold; derivation stays auditable | ✓ |
| Derived CSV only | Smallest repo, but the dividend events exist nowhere | |
| Derived CSV + separate dividends CSV | Auditable and smaller, but misses split events | |

**User's choice:** Derived CSV + vendor JSON, both committed (~9 MB accepted)

---

## D-04/D-05/D-06 rewrite

| Option | Description | Selected |
|--------|-------------|----------|
| Yahoo + Nasdaq + FRED + Shiller | Four vendors, each the narrowest source carrying what it is asked for | ✓ |
| Same, plus Stooq as a cross-check | Keeps a bot challenge for a vendor we no longer trust | |
| Yahoo only, drop XNDX | One format, but discards a verified real TR series | |

**User's choice:** Yahoo + Nasdaq + FRED + Shiller

| Option | Description | Selected |
|--------|-------------|----------|
| Same mechanism, restated per vendor | D-05/D-06 machinery was never Stooq-specific; only text changes | ✓ |
| Same, plus record endpoint's unofficial status | One more authored field per source | |
| Escalate licensing before proceeding | Blocks on a question D-05 already answered | |

**User's choice:** Same mechanism, restated per vendor

| Option | Description | Selected |
|--------|-------------|----------|
| Supersede, do not rewrite | 02-03-SUMMARY.md stays as history; live docs get rewritten | ✓ |
| Rewrite everything in place | One consistent story, but erases why Stooq failed | |
| Add a single errata document | Least churn, but readers of the summary get no signal | |

**User's choice:** Supersede, do not rewrite

---

## Manual vs automated fetch

| Option | Description | Selected |
|--------|-------------|----------|
| Yahoo + FRED automated, Nasdaq + Shiller manual | Originally recommended | |
| Everything manual except FRED | Predictable, but refreshes stop happening | |
| Yahoo automated with manual fallback | Robust to the rate limiting already hit | ✓ |

**User's choice:** Yahoo automated with manual fallback
**Notes:** The user pushed back on the original recommendation: "I'm curious why you would
recommend that when we're getting rate limited... you get rate limited on the first request.
There's something missing in the request to Yahoo." Testing followed: default curl UA 429,
browser UA 429, query2 429, `finance.yahoo.com` homepage 200, stooq.com 200. Conclusion: an
IP-level block on the API hosts against this sandbox's shared egress address, not a malformed
request, and no known workaround. That is the argument for the fallback: it will likely work on a
developer machine and likely fail on a shared-IP CI runner.

| Option | Description | Selected |
|--------|-------------|----------|
| Report provenance per symbol, fail on stale | Reuses D-12's staleness reasoning | ✓ |
| Report provenance, warn only | Warnings get skimmed | |
| Fallback requires an explicit flag | D-11 already rejected a flag on CI grounds | |

**User's choice:** Report provenance per symbol, fail on stale

| Option | Description | Selected |
|--------|-------------|----------|
| Rewrite MANUAL-DOWNLOAD.md around the two real manual sources | Keeps one "the fetch failed, now what" doc | ✓ |
| Split into two documents | Cleaner separation, two docs to sync | |
| Fold into README.md | README already long | |

**User's choice:** Rewrite it around the two real manual sources

---

## Claude's Discretion (session 2)

- Whether XNDX's phantom 2012-10-29 zero bar is a drop-zero rule or a calendar exception
- The tolerance for D-25's gate and the staleness threshold for D-27's fallback
- Whether the four vendor formats share a normalizer interface
- Whether the two `parseShillerCsv` bugs are fixed in the source-swap plan or their own

## Deferred Ideas (session 2)

None — discussion stayed within phase scope.
