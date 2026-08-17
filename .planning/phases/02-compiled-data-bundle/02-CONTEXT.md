# Phase 2: Compiled Data Bundle - Context

**Gathered:** 2026-08-17
**Updated:** 2026-08-17 (source-stack reversal — see "Source Stack Reversal" below)
**Status:** Ready for planning

> **Source Stack Reversal (2026-08-17).** D-04's locked stack named Stooq for daily equity and
> ETF prices. Stooq cannot deliver it and was replaced. This update rewrites D-04, D-05, D-06 and
> D-07, annotates D-14 and D-15 with now-verified facts, and adds D-24 through D-28. Every other
> decision is unchanged. Plans 02-01 and 02-02 are unaffected. Plan 02-03's committed artifacts are
> superseded, not rewritten (D-28); plans 02-04 and 02-05 were written against the old stack and
> need revising before they execute.
>
> **What Stooq actually did**, established by direct evidence this session, not inference:
> - `^spx` no longer exists. Stooq renamed it `^USLC`, its own US Large Cap index, with history
>   only to 2013. The project needs daily S&P prices to 1928 (D-17).
> - `^ndx` returns 22,882 bars starting **1938-01-03** at a value of 2.24. The Nasdaq-100 launched
>   in 1985. Forty-seven years of that file are not the Nasdaq-100, and its 1985 values do not match
>   the index's own launch level on either the split-adjusted or unadjusted reading.
> - Stooq's `Close` column is **dividend-adjusted**. On 1999-03-10 Stooq gave QQQ 43.2932; Yahoo
>   gives `close` 51.0625 and `adjclose` 43.0271. Stooq was serving a total-return series under a
>   price label. Every Stooq file would have been committed as `-PR`, and plan 02-04's construction
>   would have counted dividends twice. The byte-identity halt plan 02-03 built to catch the
>   total-return problem would never have fired, because the two files were never going to be
>   identical.
>
> The Stooq URLs and symbol conventions in `tools/fetch-data/src/sources.ts` came from a single
> MEDIUM-confidence web-search snippet (`.planning/research/.cache/f567254a…json`) and from
> unverified recall, never from a successful fetch — `sources.ts:70` says so in a comment. The
> lesson recorded in D-28 is that a vendor claim is not established until a real pull confirms it.

<domain>
## Phase Boundary

This phase delivers a build-time data pipeline and nothing that renders. Specifically:

1. A **CLI compiler** (`compile-data ./raw ./public/data`) that turns a directory of raw CSVs plus
   their provenance sidecars into content-hashed binary assets and a JSON manifest.
2. A **fetch script** that refreshes the raw CSVs from their sources, whose output is reviewed as a
   git diff.
3. **Validation gates in the compiler**: trading-calendar agreement, gap policy, and an explicit
   exceptions mechanism, so a disagreement is named rather than absorbed.
4. **Machine-readable provenance**: per-series source, terms, date range, and a typed record of
   every splice, interpolation and carry-forward, from which the strict and extended tier ranges
   are computed rather than declared.
5. **Two new bench rows** (bundle bytes, decode-to-typed-array time) added to the existing
   `npm run bench` harness, with their thresholds declared in `perf-budgets.ts`.

Not in scope: any UI, the simulation kernel, the tier selector, the methodology page, or the
on-screen provenance surface. Those are Phases 3, 4 and 5. This phase produces the data and the
manifest those phases read.

**Live constraint carried in from Phase 1:** ROADMAP.md states this phase is constrained by "the
spike's decode-cost and memory figures". Those figures do not exist. PERF-08a/b/c are still
UNMEASURED (`01-SPIKE-RESULTS.md:101`). Criterion 5 is where the decode number is first produced,
so the binary-format decisions below were made against the locked 1000ms budget rather than
against a measurement.

</domain>

<decisions>
## Implementation Decisions

### Raw Inputs and Provenance

- **D-01:** Raw CSVs are **committed to the repo and are the source of truth**, alongside a
  separate refresh script. PROJECT.md rejects live lookup because vendor revisions would silently
  change past conclusions; committing makes any revision a reviewable diff instead.
- **D-02:** Provenance is declared in a **sidecar JSON per raw file** (`raw/SPX-TR.csv` +
  `raw/SPX-TR.meta.json`), carrying at minimum source, URL, retrieval date, series kind, and
  license/terms. The compiler **refuses to compile an unaccompanied CSV**. Adding a symbol stays a
  local two-file drop, and provenance cannot drift from the series it describes because they move
  together.
- **D-03:** The compiler accepts **exactly one canonical CSV schema** (`date,value`, ISO dates, no
  blanks) and validates it hard. Per-source normalization (Stooq vs FRED vs Shiller column
  layouts) happens in the fetch script, not the compiler. One input contract, one thing to test.
- **D-04 [REVISED 2026-08-17, supersedes the Stooq stack]:** The source stack is **locked, not
  delegated**, and is now **four vendors, each the narrowest source that actually carries what it is
  asked for**, all verified live this session:
  - **Yahoo Finance** (`query1.finance.yahoo.com/v8/finance/chart/<SYMBOL>`, JSON) for daily
    equity and ETF prices, their dividend and split events, `^GSPC` (24,773 bars from
    **1927-12-30**), `^NDX` (10,298 bars from 1985-10-01) and `^SP500TR` (9,728 bars from
    **1988-01-04**).
  - **Nasdaq** (`indexes.nasdaqomx.com/Index/History/XNDX`, **EOD**) for the Nasdaq-100 Total Return
    index, from **1999-03-04**. **Export EOD, never start-of-day.** The export form offers both, and
    the choice is not cosmetic: every other input in the bundle is a close (Yahoo's `close` and
    `adjclose`, FRED's daily rates), and the kernel derives daily returns close-to-close. A
    start-of-day series would sit one half-session out of phase with every other input and would
    misstate the daily-rebalance volatility drag, which is the quantity this project exists to
    measure. Anyone re-exporting this file must pick EOD for that reason, not merely for
    consistency. Yahoo carries the `^XNDX` ticker but stores **no
    history** for it (`firstTradeDate: null`, `validRanges: ["1d","5d"]`), which is why this is a
    separate vendor rather than a fifth Yahoo symbol.
  - **FRED** for `DFF`/`DTB3`/`TB3MS` plus the pre-1934 short rate in D-13. Unchanged, already
    fetched and committed.
  - **Shiller** for pre-1988 monthly S&P dividends. Unchanged.

  Stooq is **dropped entirely**, not demoted to a cross-check: keeping it would retain a
  proof-of-work bot challenge and a manual browser step for a vendor that mislabeled a
  total-return series as `Close`, and D-25's reconstruction gate is a stronger internal check than
  a second opinion from a vendor we no longer trust.
  — **Reversibility:** costly — four vendor formats (Yahoo JSON, Nasdaq CSV, FRED CSV, Shiller CSV)
  are normalized in the fetch script, and every sidecar, manifest entry and Phase 5 provenance
  string is authored from this table.
- **D-05 [REVISED 2026-08-17]:** Licensing is still handled by **recording terms per source and
  proceeding**. FRED and Shiller remain explicitly redistributable. **Yahoo's terms are personal-use
  and its chart endpoint is undocumented**; **Nasdaq's index site carries its own terms**. Both are
  knowingly accepted risks, recorded rather than resolved, exactly as Stooq's were.
- **D-06 [MECHANISM UNCHANGED, vendors restated]:** The recording machinery does not move, because
  it was never Stooq-specific. The **sidecar** carries `license`/`termsUrl`/`retrievedAt` (authored
  once per source in `sources.ts`), the **manifest** carries those fields through per series (copied
  by the compiler, never hand-typed), and the **Phase 5 methodology page** renders from the
  manifest. Only the per-vendor text changes, plus a replacement **Key Decision in PROJECT.md**
  covering Yahoo and Nasdaq. The two Stooq rows are marked superseded, not deleted (D-28).
- **D-07 [REVISED 2026-08-17]:** The fetch script **always pulls latest**; there is still no as-of
  pinning, and the git diff on refresh is still the review surface. The original rationale (Stooq
  and Shiller lack date-bounded queries) is void, but the decision stands on the stronger ground it
  always rested on: a vendor revision to a historical value must surface as a changed line in a
  reviewable commit rather than silently changing a past conclusion. **D-24 is what makes this
  actually true** for the total-return series — storing Yahoo's back-adjusted `adjclose` would
  rewrite every row on every refresh and reduce the diff to noise.

### Calendar Alignment

- **D-08:** The reference trading calendar is **derived from the longest-running US equity series**
  (daily S&P), not from a calendar library. It gets the pre-1952 Saturday sessions right by
  construction, which covers roughly a quarter of this project's deepest history and is exactly
  where library holiday rules are least trustworthy. Nothing in the bundled universe departs from
  the US equity calendar: UPRO, TQQQ, SSO, QLD, VTI, EFA, EEM and TLT all trade on NYSE Arca or
  Nasdaq. A future non-US-listed index would need an explicit calendar declaration.
  — **Reversibility:** costly — every compiled asset's index offsets (D-19) are denominated
  against this calendar, so changing its derivation invalidates the stored start indices in every
  binary asset and the seam dates computed from them.
- **D-09:** Gap policy splits by series kind. An **interior gap in a price series is fatal** and the
  compiler names the offending dates. A **rate-series gap carries forward up to a small declared
  limit**, and **every carried day is recorded as a seam** in the manifest and surfaced in the UI.
  This honors DATA-02: the prohibition is on *silently* forward-filling, and a manifest-recorded
  seam is the opposite of silent. The concrete driver is Columbus Day and Veterans Day, when the
  bond market closes and the stock market stays open, so FRED's rate series legitimately lacks a
  value on a day the price series has one, roughly twice a year across the whole history.
- **D-10:** A symbol carrying a **bar on a date the reference calendar does not contain is fatal**,
  with the dates named. An extra bar means either the vendor is wrong or the calendar is wrong, and
  both need a human. Dropping the bar risks deleting real data; extending the calendar would let one
  vendor's bad row create a phantom trading day that cascades into false failures everywhere else.
- **D-11:** The **only override is `raw/calendar-exceptions.json`**, listing symbol, date and a
  written reason per entry. The compiler accepts those exact dates and copies each exception into
  the manifest, so an accepted quirk is visible in the UI's provenance and reviewable as a diff. An
  unexplained new gap still aborts. A CLI flag was rejected because its failure mode is someone
  leaving it on in CI, which turns DATA-02 into a no-op.
- **D-12:** **Ragged right edges are allowed.** Each series carries its own first and last date in
  the manifest; the compiler **warns but does not abort** when a series trails the newest end date
  by more than a declared threshold. The problem being solved is not differing end dates (ragged
  left edges are already normal: UPRO 2009, TQQQ 2010, EEM 2003) but that **a stale refresh is
  indistinguishable from a legitimately short series**, and that hold-to-today silently becomes
  per-symbol when one series lags by months. Phase 4 reads the per-symbol end date to bound
  hold-to-today.

### Tiers and Derived Series

- **D-13:** The **1928-1933 short-rate gap is filled from a fourth source** (NBER Macrohistory
  monthly short rates), spliced to `TB3MS` at 1934 and to `DTB3`/`DFF` at 1954, with every splice
  recorded as a seam. Under the D-04 stack alone there is **no short rate at all before 1934**,
  which is precisely the 1929 crash and the 1929-1932 drawdown the extended tier exists to reach.
  Bounding the tier at 1934 instead was rejected because it would put the crash outside every tier;
  an assumed constant rate was rejected as a fabricated input in the one era the tool most needs to
  be believed about. **Research task:** confirm the NBER series exists in a machine-readable form
  covering 1928-1934.
- **D-14 [CONFIRMED against real data 2026-08-17]:** A tier is a property of **(symbol, dividend
  mode)**, not of the bundle or of a symbol alone. The strict range is the intersection of the
  genuinely-daily inputs a given run actually uses, so S&P strict price-return reaches 1954 (daily
  price + daily rate) while S&P strict total-return starts 1988 (daily TR). Per-symbol scoping would
  discard 34 years of genuinely-daily price history for no data reason; bundle-wide scoping would
  let EEM's 2003 start collapse strict to 2003 for everything.

  The 1988 boundary is now **verified, not assumed**: `^SP500TR`'s first bar is **1988-01-04**,
  exactly the date this decision declared. The design had always assumed this series without naming
  it. **NDX has the same shape**: price-return from 1985-10-01, total-return from 1999-03-04
  (XNDX's first bar). Nothing is lost in practice, since QQQ starts 1999-03-10 and no Nasdaq-100
  total-return backtest was available before 1999 from any source in this stack.
- **D-15 [ANNOTATED 2026-08-17]:** Pre-1988 total return is constructed as **daily price return plus
  a daily dividend yield interpolated from Shiller's monthly series**, spliced to real daily TR at
  1988. Every splice and interpolation date lands in the manifest as a seam, so the construction is
  visible at day level. The "real daily TR" side of that splice is now named: **`^SP500TR`**.

  This construction path applies to the **S&P only**. The 9 ETFs get real total return from their
  own dividend events across their whole lives (D-24), and NDX gets it from XNDX, so neither needs
  a Shiller-interpolated segment. `^GSPC`'s `adjclose` equals its `close` on all 24,773 bars,
  because an index pays no dividends — the S&P is the one symbol where construction is unavoidable.
- **D-16:** A seam is a **typed record carrying kind (`splice` | `interpolation` | `carry-forward`),
  the affected date range, the source on each side, and the method used**. Tier ranges are computed
  by scanning these records, satisfying criterion 3's computed-not-declared rule. A per-day mask was
  rejected as an extra array per series charged against a 1000ms decode budget that has never been
  measured; it is reconstructible from the ranges if a later phase needs it.
  — **Reversibility:** costly — Phase 5's on-screen provenance and the extended-tier warning are
  both rendered from these records, so changing the record structure later means changing what the
  UI can honestly say.
- **D-17 [informational]:** **Finding recorded, no action taken this phase.** Phase 5 criterion 4 states the
  extended tier's bias is that "interpolated monthly data smooths daily volatility and therefore
  understates volatility drag." That reasoning appears wrong: daily S&P *prices* genuinely reach
  1928, so returns are not interpolated. Only rates and dividends are, and neither drives volatility
  drag. The real extended-tier bias is more likely about **financing-cost precision**, not drag, and
  Phase 5's proposed quantification (downsample daily to monthly, interpolate back, measure the gap)
  would measure roughly nothing as specified. D-16's typed seam records give Phase 5 what it needs
  to restate the bias honestly. Revising another phase's success criteria is outside this phase's
  boundary, and the claim deserves measurement before it is overturned.

### Binary Layout and Precision

- **D-18:** **One asset per symbol, both its series inside**, plus one shared rate asset, one shared
  calendar asset, and the manifest. A run needs one symbol plus the shared rate series, so this is a
  single fetch for what a run uses; adding a symbol adds a file without rewriting existing ones; and
  content hashing per file means a refreshed symbol invalidates only its own asset rather than
  forcing every user to re-download everything.
- **D-19:** Series are stored as **raw float64 with no transform**. `new Float64Array(buffer,
  offset, len)` is a view rather than a copy, so decode is effectively free and criterion 5's
  exact-match round trip holds by construction. Estimated ~1.3MB raw across the universe before
  edge compression. Float32 was rejected because it breaks exact-match round trip and because ~7
  significant digits compounding across 25,000 bars is the wrong risk for a project whose product
  is that the math is right. Lossless XOR pre-compression was rejected because it turns decode into
  a per-value loop, spending the one budget that has never been measured.
  — **Reversibility:** reversible — the format version byte in the header lets a later phase
  introduce a compressed layout behind the same decoder entry point if a measured size or decode
  figure demands it.
- **D-20:** Assets store **index levels as sourced**, and the kernel derives returns in its hot
  loop. The compiled data then matches the raw CSV value-for-value, so a skeptic can check any bar
  against the source and the round-trip test compares against what was actually downloaded. Storing
  precomputed returns would leave nothing in the bundle comparable to a source CSV, to save one
  division in a loop already doing far more work.
- **D-21:** Dates travel via a **shared compiled calendar asset** (days-since-epoch `Int32Array`),
  with each series header storing its **start index and length** into that calendar. Zero per-series
  date bytes, and cross-symbol alignment becomes an index comparison rather than a date join, which
  is what the sweep engine wants. Rebuilding the calendar at runtime was rejected as a second
  implementation that can drift from the compiler's, and the pre-1952 Saturday sessions are exactly
  where it would drift.
- **D-22:** DATA-09 is enforced two ways at once. The **manifest is itself imported as a
  content-hashed asset**, so `index.html` is the only uncached document and every data URL is
  immutable. **Each binary header also carries the bundle version**, and the decoder throws if it
  disagrees with the manifest. A stale asset then fails loudly at decode rather than producing
  quietly wrong numbers.
- **D-23:** Bench gains a **new decode budget row carved out of PERF-08b's 1000ms**, and
  `PerfBudget` gains a **unit field** so bundle bytes become a first-class gated row anchored to
  transfer time on a declared connection speed. This keeps D-21 of Phase 1 (`perf-budgets.ts` as the
  single source of truth) intact. Adding rows is not relaxing existing ones, so Phase 1's D-19 lock
  is untouched and no relaxation Key Decision is owed. Measuring decode against PERF-08b directly
  was rejected because decode is only one component of it: a decode passing at 900ms would look
  fine and blow the real budget the moment Phase 4 adds fetch and first render on top.

### Total-Return Construction and Fetch Route (added 2026-08-17)

- **D-24:** ETF total return is **reconstructed from `close` plus Yahoo's dividend events**, not
  taken from `adjclose`. Yahoo's `adjclose` is back-adjusted: every new dividend retroactively
  rescales the entire history, so storing it would rewrite all ~6,900 rows of every ETF series on
  every refresh and destroy the git-diff review surface D-01 and D-07 exist for. Reconstruction
  makes past values immutable, so a refresh appends and a genuine vendor revision shows up as
  exactly one changed line.

  **Verified workable before deciding.** Reconstructing forward as
  `TR_t = TR_{t-1} × (close_t + D_t) / close_{t-1}` reproduces Yahoo's own `adjclose` closely.
  Dividend and split events are present in every downloaded file (QQQ 89 dividends, TLT 287,
  UPRO 46 + 5 splits, TQQQ 21 + 8 splits).

  **[CORRECTED 2026-08-17]** An earlier revision of this decision cited "QQQ 0.0033%, UPRO 0.0080%,
  VTI 0.0147%, TLT 0.0150%, TQQQ 0.0828% (worst case)". That figure was wrong twice over: it was a
  **final-bar** deviation rather than the maximum over the path, and it covered only 5 of the 9
  ETFs. The plan-02-06 planner caught it and re-measured all nine. Corrected figures:

  | Symbol | Final-bar deviation | Max over path |
  |---|---|---|
  | QQQ | 0.00328% | 0.01810% |
  | EFA | 0.00377% | 0.11790% |
  | UPRO | 0.00797% | 0.03783% |
  | VTI | 0.01470% | 0.04214% |
  | TLT | 0.01502% | 0.04412% |
  | SSO | 0.02177% | 0.04178% |
  | TQQQ | 0.08279% | 0.09269% |
  | EEM | 0.11287% | **0.17642%** |
  | QLD | 0.14374% | 0.16916% |

  The true worst case is **EEM at 0.17642% over the path**. D-25's tolerance must be anchored to
  that, not to the withdrawn 0.0828%: a gate set at 0.0828% would have failed on its first run.
  The residual is still float rounding in Yahoo's adjustment factors, not a modelling difference.
  — **Reversibility:** costly — every `-TR` raw CSV, the D-25 gate and its tolerance, and the
  manifest's seam records for the ETF series all derive from this choice.
- **D-25:** The reconstruction-vs-`adjclose` agreement is a **hard gate in the fetch script**: every
  refresh recomputes the comparison and **exits non-zero** if any symbol drifts past a declared
  tolerance. This catches a vendor changing its dividend data, a missed split, or a bug in the
  reconstruction at the moment it happens rather than in a backtest months later. Consistent with
  D-09, D-10 and D-11 failing loudly. The tolerance value is the planner's call, anchored to the
  corrected 0.17642% max-over-path worst case above. A test-suite-only check was rejected because it lets a bad
  refresh be committed first; a log-only record was rejected because nothing would stop a broken
  series shipping.
- **D-26:** `raw/` carries **both the derived CSV and the vendor's original JSON**, both committed.
  D-03 and D-20 then hold unchanged: normalization still happens in the fetch script, the compiler
  still stores exactly what its input CSV says value-for-value, and a skeptic can re-derive that
  CSV from committed vendor bytes rather than having to trust the derivation. Cost accepted: roughly
  9 MB of vendor JSON in the repo. Committing only the derived CSV was rejected because the dividend
  events the reconstruction is built from would then exist nowhere in the repo, and Yahoo can change
  them.
- **D-27:** **Yahoo and FRED are fetched automatically; Nasdaq and Shiller stay manual; Yahoo falls
  back to `raw/manual/` when the fetch fails.** Yahoo's API answered the user's browser directly but
  returns HTTP 429 to this development sandbox on the first request, from both `query1` and
  `query2`, regardless of `User-Agent` or `Accept` headers, while `finance.yahoo.com` itself returns
  200 from the same host. That is an IP-level block on the API hosts against a shared egress
  address, not a malformed request — no header change fixes it, and no workaround is known. So the
  same command must work on a developer machine (where the fetch succeeds) and on a shared-IP CI
  runner (where it will not).

  The fallback must not become a trap: every run **reports per symbol whether the data was fetched
  live or read from `raw/manual/`**, the sidecar's `retrievedAt` records it, and a manual file older
  than a declared threshold **fails the run** rather than being silently used.

  **[CLARIFIED 2026-08-17, user decision]** `retrievedAt` records **recency, not route**. It is the
  run date for a live pull and **the newest observation's date in the data** for a manual file, so a
  stale file cannot carry a fresh-looking sidecar. `SidecarMeta` gains **no** new key and
  `raw-input.ts`'s strict `ALLOWED_KEYS` validator is untouched. The route (fetched vs manual) is
  printed in the run output but not stored. A machine-readable `route` field for Phase 5's
  provenance surface was considered and declined; adding one later means regenerating every sidecar.

  Staleness is deliberately measured against the newest observation **in the data**, never file
  mtime: mtime does not survive a `git clone`, so an mtime gate would report every fresh clone as
  pristine and defeat the check for exactly the reader D-01 exists to serve. This reuses D-12's
  reasoning, which exists for precisely this failure: a stale refresh being indistinguishable from a
  legitimate one. A `--allow-manual` CLI flag was rejected on D-11's grounds — someone leaves it on
  in CI.
- **D-28:** **Committed history is superseded, not rewritten.** `02-03-SUMMARY.md` stays untouched
  as the honest record of what was built and why; the new plan's SUMMARY supersedes it. The two
  Stooq rows in PROJECT.md's Key Decisions table are **marked superseded with a pointer to their
  replacements**, not deleted. Live instruction docs — `tools/fetch-data/README.md` and
  `MANUAL-DOWNLOAD.md` — **are** rewritten, because they are procedures someone follows, not
  history. Rewriting everything in place was rejected because it would erase that Stooq was chosen,
  that it served a dividend-adjusted series under a `Close` label, and that the failure was caught
  by cross-checking against a second vendor — which is exactly the knowledge that stops it
  recurring. `MANUAL-DOWNLOAD.md` is rewritten around the two genuinely manual sources (Nasdaq XNDX
  and Shiller, both browser export plus Excel-to-CSV conversion), with the Yahoo URL template kept
  as the documented fallback recipe for when the API refuses.

### Claude's Discretion

Not raised during discussion; planner and researcher decide:

- Whether XNDX's phantom `0.00000000000` bar on **2012-10-29** (the Hurricane Sandy closure —
  `^GSPC`, `^NDX` and QQQ all correctly have no bar on 2012-10-29 or 2012-10-30) is handled by a
  drop-zero-valued-rows rule in the normalizer or by a `raw/calendar-exceptions.json` entry under
  D-11. A drop rule also covers the two other defects in that export: today's row is a
  `0.00000000000` placeholder, and the file ends with an empty line.
- The declared tolerance for D-25's gate, anchored to the measured 0.083% worst case.
- The declared staleness threshold for D-27's manual-fallback check.
- Whether the four vendor formats (Yahoo JSON, Nasdaq CSV, FRED CSV, Shiller CSV) share a common
  normalizer interface or stay independent functions.
- Whether the two `parseShillerCsv` bugs found this session (below, under Specific Ideas) are fixed
  in the same plan as the source swap or in their own.



- The exact sidecar field list beyond the required source, URL, retrieval date, series kind, and
  license/terms.
- The binary header layout (magic bytes, format version, series count, offsets) and its shared
  TypeScript type.
- The numeric value of the rate carry-forward limit (D-09) and the staleness threshold (D-12).
- The manifest's JSON schema and whether it is validated at build time.
- The compiler's test strategy: golden files versus property tests over the encode/decode round
  trip, and how criterion 5's exact-match assertion is structured.
- CLI ergonomics, argument parsing, and the format of failure output.
- Whether the compiler is a workspace package or a script in the existing tree.
- Directory layout under `raw/` and naming conventions for compiled assets.
- The declared connection speed used to anchor the bundle-size budget (D-23).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and scope
- `.planning/REQUIREMENTS.md` §Data Pipeline — DATA-01 through DATA-07 and DATA-09 in full.
  DATA-02's fail-loudly rule and DATA-06's machine-readable-provenance rule govern this phase.
- `.planning/ROADMAP.md` §"Phase 2: Compiled Data Bundle" — the five success criteria this phase is
  verified against. Criterion 3's computed-not-declared rule and criterion 5's exact-match round
  trip are the two hardest.
- `.planning/ROADMAP.md` §"Phase 5: Attribution and the Credibility Surface" criterion 4 — the
  extended-tier bias claim that D-17 records as probably wrong.
- `.planning/ROADMAP.md` §Sequencing Notes — Phase 2's compiler and an early synthetic-data Phase 3
  kernel can proceed independently.

### Project constraints and prior decisions
- `.planning/PROJECT.md` §Context — the data-seam paragraph naming the exact FRED start dates
  (`DFF` 1954-07-01, `DTB3` 1954-01-04, `TB3MS` 1934-01-01) that force D-13 and D-14.
- `.planning/PROJECT.md` §Out of Scope — why live ticker lookup was rejected, which is the reasoning
  D-01 rests on.
- `.planning/PROJECT.md` §Key Decisions — the table D-06's licensing decision must be appended to.
- `.planning/phases/01-performance-spike-and-budget-lock/01-CONTEXT.md` — Phase 1's D-03 (Vitest
  browser mode), D-04 (bench table + JSON), D-05 (UNMEASURED rows), D-19 (budgets locked), D-20
  (70% escalation trigger) and D-21 (`perf-budgets.ts` as single source of truth) all bind here.
- `.planning/phases/01-performance-spike-and-budget-lock/01-SPIKE-RESULTS.md` §"remain UNMEASURED"
  — the evidence that PERF-08a/b/c have no figure, contradicting ROADMAP's claim that this phase is
  constrained by measured decode and memory figures.

### Existing code this phase extends
- `perf-budgets.ts` — the typed budget table D-23 extends with a decode row and a unit field. Its
  compile-time exhaustiveness check at the bottom of the file must keep passing.
- `bench/report.ts` — the table and JSON emitter that gains the two new rows.
- `bench/global-setup.ts`, `bench/environment-block.ts` — the environment stamping every reported
  figure inherits.

### Technology research
- `.claude/CLAUDE.md` §"Q4 — Binary data format for bundled time series" — the raw-ArrayBuffer
  recommendation D-19 follows, and the delta-encoding and fixed-point suggestions D-19 explicitly
  declines on exact-round-trip grounds.
- `.claude/CLAUDE.md` §"Q5 — The bundle compiler CLI" — the single-language argument for a
  TypeScript compiler sharing its header type with the app's decoder.
- `.claude/CLAUDE.md` §"Q6 — Cloudflare Pages specifics" — `_headers`, content-hashed immutability
  and the service-worker precache rules D-22 composes with.
- `.claude/CLAUDE.md` §"Q7 — Testing numerical code" — golden-file versus property-based division of
  labor, relevant to criterion 5's round-trip test.

### Project rules
- `CLAUDE.md` (repo root) — the worktree exception.
- `.claude/CLAUDE.md` §"GSD Workflow Enforcement" — no direct repo edits outside a GSD workflow.

### Source-stack reversal (added 2026-08-17)
- `tools/fetch-data/src/sources.ts` — the `SourceSpec` table D-04 rewrites. Its `STOOQ_SYMBOLS`
  comment at line 70 is the record that the symbol conventions were never verified.
- `tools/fetch-data/src/normalize.ts` — `parseShillerCsv` (two bugs, see Specific Ideas) and the
  `normalizeStooq` that a `normalizeYahoo` and `normalizeNasdaq` replace.
- `tools/fetch-data/MANUAL-DOWNLOAD.md` — rewritten per D-28 around Nasdaq XNDX and Shiller only.
- `tools/fetch-data/README.md` — rewritten per D-28: routes, refresh procedure, per-vendor licence.
- `.planning/phases/02-compiled-data-bundle/02-03-SUMMARY.md` — **superseded, do not edit** (D-28).
  Its "Deferred Acceptance Checks" list is still the correct list of checks to re-run.
- `.planning/phases/02-compiled-data-bundle/02-04-PLAN.md` §line 285 — the abort branch that keys
  off "plan 02-03's summary lists any symbols with no real total-return series". That list is now
  empty for the 9 ETFs and the S&P, and NDX resolves via XNDX, so this plan needs revising before
  it executes.
- `.planning/phases/02-compiled-data-bundle/02-05-PLAN.md` §line 198, §line 212 — the universe test
  and its acceptance check assert a price-return and a total-return series for all 11 symbols.
  Still satisfiable under the new stack, but written against Stooq assumptions.
- `.planning/phases/02-compiled-data-bundle/02-RESEARCH.md` — assumption A2 ("no total-return data
  available for this vendor stack") is disproven and needs marking resolved; the "Stooq CSV shape
  (confirmed this session)" heading around line 600 is false and its own citation line says so.
- `.planning/PROJECT.md` §Key Decisions — the two Stooq rows to mark superseded (D-28), plus the
  replacement rows for Yahoo and Nasdaq (D-05/D-06).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

The repo contains the Phase 1 bench harness and nothing else. No `src/`, no Vite app, no compiler.

- `perf-budgets.ts` — typed budget table with a compile-time exhaustiveness check. D-23 extends it
  rather than adding a parallel config.
- `bench/report.ts`, `bench/environment-block.ts`, `bench/global-setup.ts` — the reporting path the
  two new rows plug into, including UNMEASURED handling and the environment block.
- `bench/synthetic-data.ts` — seeded GBM generator. Not reusable as data (this phase's whole point
  is real series) but its determinism pattern is a model for compiler test fixtures.
- `tests/perf-budgets.selftest.test.ts` — the self-test asserting a `relaxationReason` exists
  whenever `thresholdMs > anchorMs`. D-23's unit field must not break it.

### Established Patterns

- **`perf-budgets.ts` is the only place a threshold is declared** (Phase 1 D-21). The compiler
  catches malformed entries; there is no runtime parsing.
- **Vitest browser mode for anything the browser actually runs** (Phase 1 D-03). Decode timing is a
  browser measurement, not a Node one, per Phase 1 D-02's one-environment rule.
- **Budgets are locked; a miss escalates rather than relaxes** (Phase 1 D-19, D-20).
- Two Vitest projects exist (`unit`, `bench`) plus `bench-selftest`. Compiler tests are unit-side;
  decode timing is bench-side.

### Integration Points

- **Phase 3** consumes the compiled arrays and the shared calendar as the kernel's input, and needs
  UPRO/TQQQ real price series from this bundle for its validation gate.
- **Phase 4** reads per-symbol date ranges (D-12) to bound entry dates and hold-to-today, reads the
  bundle version (D-22) to stamp permalinks, and is where PERF-08a/b/c first get measured end to
  end.
- **Phase 5** renders tier labels, seam dates, sources and the extended-tier warning from the
  manifest's typed seam records (D-16), never from hand-authored strings.
- **Phase 7's** sweep engine benefits from D-21's shared-calendar index alignment.

### Raw inputs already on disk (2026-08-17)

`raw/manual/` holds every vendor input, all validated this session — zero nulls, zero out-of-order
timestamps, no duplicate dates, every symbol meeting or beating its declared first date:

| File | Bars | Range |
|---|---|---|
| `GSPC.json` | 24,773 | 1927-12-30 → 2026-08-17 |
| `SP500TR.json` | 9,728 | 1988-01-04 → 2026-08-17 |
| `NDX.json` | 10,298 | 1985-10-01 → 2026-08-17 |
| `XNDX.csv` | 6,905 usable | 1999-03-04 → 2026-08-14 |
| `QQQ.json` | 6,902 | 1999-03-10 → 2026-08-17 |
| `VTI.json` | 6,329 | 2001-06-15 → 2026-08-17 |
| `EFA.json` | 6,279 | 2001-08-27 → 2026-08-17 |
| `TLT.json` | 6,051 | 2002-07-30 → 2026-08-17 |
| `EEM.json` | 5,873 | 2003-04-14 → 2026-08-17 |
| `SSO.json`, `QLD.json` | 5,070 each | 2006-06-21 → 2026-08-17 |
| `UPRO.json` | 4,312 | 2009-06-25 → 2026-08-17 |
| `TQQQ.json` | 4,153 | 2010-02-11 → 2026-08-17 |
| `SPX-DIV-MONTHLY.csv` | 1,868 | 1871-01 → 2026-08 (monthly, complete, no gaps) |

`raw/RATE-{DFF,DTB3,TB3MS,NBER}.csv` plus sidecars are already committed from plan 02-03 and are
unaffected by this reversal.

**`ie_data.xls` is NOT committed and NOT kept** (settled 2026-08-17, after the planner argued the
opposite and was overruled). D-26's argument is that a derived series must stay re-derivable from
committed vendor bytes, and it is decisive for the Yahoo JSON: `fetch.ts` reads it, and the
total-return reconstruction depends on dividend events that exist nowhere else and that Yahoo
revises retroactively. It does **not** carry over to Shiller. Nothing in the codebase reads `.xls`
(`fetch.ts` reads `raw/manual/<stem>.csv` and the Yahoo JSON only), and the converted
`SPX-DIV-MONTHLY.csv` already carries the full source sheet including `P` and `D`, so the canonical
`D / P` series is checkable against the committed CSV alone. The workbook sits one level further
back than any input. The one artifact the LibreOffice conversion introduces (October as a one-digit
fraction, `1871.1`) is already characterised above and handled by the parser, so there is no
unaudited conversion left for the workbook to audit. Do not re-add it.

</code_context>

<specifics>
## Specific Ideas

- The user asked which equities would not fit an NYSE calendar. The answer that settled D-08: none
  in the current universe, since every bundled symbol is US-listed; the risk appears only if a
  foreign index (Nikkei, FTSE, DAX), a 24/7 series, or a non-equity session calendar is added
  later. The pre-1952 Saturday-session point emerged from that exchange and is the strongest
  argument for deriving rather than importing the calendar.
- The user asked why differing end dates are a problem at all, and was right to: ragged left edges
  are already normal and uncontroversial. The distinction that resolved D-12 is that a ragged
  *right* edge usually signals an operational failure (a silently failed refresh) rather than a
  fact about the world, so the value is in detection, not in the data model.
- The user asked where the licensing terms would physically be recorded. D-06 is that answer:
  authored once in the sidecar, copied to the manifest, rendered by the UI, with the accepted-risk
  reasoning promoted to a PROJECT.md Key Decision.

### From the 2026-08-17 manual-download session

- **The user twice refused a designed-for-hypotheticals answer and was right both times.** Asked to
  choose a fallback for a total-return ticker that might not exist, the response was to verify it in
  session instead. `^SP500TR` was confirmed in one request; `^XNDX` was confirmed missing from Yahoo
  in one request. Neither hypothetical survived contact. The same instinct caught the Yahoo 429:
  "you get rate limited on the first request, something is missing in the request" prompted the
  header and host tests that established it as an IP block rather than a malformed request.
- **`parseShillerCsv` has two bugs, both found by running it against the real converted file.** They
  are not yet fixed — the user chose to finish the downloads first.
  1. **October is parsed as January.** Shiller's export drops the trailing zero, so October 1871 is
     `1871.1`, sitting between `1871.09` and `1871.11`. The parser calls `padStart(2, '0')`, turning
     `"1"` into `"01"`. All 155 Octobers become January duplicates. It fails loudly downstream
     (`toCanonicalCsv: rows out of ascending order`), so nothing corrupts silently. Correct rule for
     this file: a one-digit fraction means ×10; only `.1` ever occurs single-digit, verified across
     all 155 rows.
  2. **The last two rows have an empty `D` and become a 0.0% yield.** 2026-07 and 2026-08 have no
     dividend yet; `Number('')` is `0`, which passes `Number.isFinite`. This is the failure mode
     that *survives* fixing bug 1 and quietly poisons the tail of the interpolated series.
  Latent, not currently biting: the naive `split(',')` mis-maps every column right of index 9,
  because data rows contain quoted thousands separators (`" 5,184,574.52 "`). `Date`/`P`/`D` sit at
  0/1/2 so today's reads are unaffected.
- **The Nasdaq XNDX export is a fourth distinct vendor format**: BOM, CRLF, **descending** date
  order, `M/D/YY` two-digit years, and quoted thousands separators. It downloads as **Excel and
  needs a manual conversion to CSV** — the same Route B step Shiller needs, and it must be in the
  refresh procedure. **Bar count [CORRECTED 2026-08-17]:** 6,907 data lines, of which 2 carry a
  `0.00000000000` placeholder (today's row and the 2012-10-29 Sandy row), leaving **6,905 usable
  bars**. An earlier revision of this file said 6,908, which was the newline count.
- **Yahoo's chart API rejects an over-wide date range on some symbols.** `period1=-2208988800`
  (1900) worked for `^GSPC` but returned `Unprocessable Entity — Only 100 years worth of day
  granularity data are allowed to be fetched per request` for `^XNDX`. `period1=0` (1970) is the
  safe default for anything post-1970.
- The `^SP500TR`-vs-`^GSPC` and XNDX-vs-`^NDX` comparisons are worth keeping as standing tests, not
  just one-off checks: both total-return series match their price sibling almost exactly on their
  first shared bar (256.02 vs 255.94; 1933.03 vs 1933.03) and then diverge monotonically. That
  signature is what Stooq's data would have failed.

</specifics>

<deferred>
## Deferred Ideas

- **Per-day constructed-data mask.** Rejected in D-16 on decode-budget grounds. Revisit if Phase 5
  needs bar-level bias quantification and the measured decode figure leaves room.
- **Compressed or quantized binary layout** (XOR/Gorilla, scaled int32, delta encoding). Rejected in
  D-19 against criterion 5's exact-match requirement and an unmeasured decode budget. The format
  version byte in the header is the seam that makes this addable later.
- **Restating Phase 5's extended-tier bias claim.** D-17 records the finding; the correction itself
  belongs to Phase 5, which owns the warning and the quantification.
- **Bundle-size trend tracking over time.** Same reasoning as Phase 1's deferred trend history: the
  CI artifact is the raw material if it ever becomes valuable.
- **Keyed data sources** (Tiingo, Nasdaq Data Link). Rejected in D-04 because a build-time API key
  conflicts with the fetch script being runnable by anyone who clones the repo. Revisit only if a
  free source proves inadequate for a series the universe needs.

</deferred>

---

*Phase: 2-Compiled Data Bundle*
*Context gathered: 2026-08-17*
*Updated 2026-08-17: source-stack reversal (Stooq → Yahoo + Nasdaq), D-04 through D-07 revised,
D-14/D-15 confirmed against real data, D-24 through D-28 added.*
