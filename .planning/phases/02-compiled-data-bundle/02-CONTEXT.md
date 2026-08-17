# Phase 2: Compiled Data Bundle - Context

**Gathered:** 2026-08-17
**Status:** Ready for planning

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
- **D-04:** The source stack is **locked, not delegated**: Stooq for daily equity and ETF prices,
  FRED for `DFF`/`DTB3`/`TB3MS`, Shiller for pre-1988 monthly S&P dividends, plus the pre-1934
  short-rate source in D-13. The researcher **verifies coverage and total-return availability per
  symbol** against this stack rather than re-choosing it.
- **D-05:** Licensing is handled by **recording terms per source and proceeding**. FRED and Shiller
  are explicitly redistributable; Stooq's terms are permissive for personal use and unclear for
  redistribution. This is a knowingly accepted risk, not an oversight.
- **D-06:** That risk is recorded in exactly three places, only one of which is authored: the
  **sidecar** carries `license`/`termsUrl`/`retrievedAt` (authored once), the **manifest** carries
  those fields through per series (copied by the compiler, never hand-typed), and the **Phase 5
  methodology page** renders from the manifest. The accepted-risk reasoning itself is promoted to a
  **Key Decision in PROJECT.md**, because it is an accepted risk rather than an implementation
  detail.
- **D-07:** The fetch script **always pulls latest**; there is no as-of pinning. The git diff on
  refresh is the review surface, and a revised historical value shows up as a changed line in a
  commit. Pinning was rejected because Stooq and Shiller do not support date-bounded queries
  consistently, so it would be honored unevenly.

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
- **D-14:** A tier is a property of **(symbol, dividend mode)**, not of the bundle or of a symbol
  alone. The strict range is the intersection of the genuinely-daily inputs a given run actually
  uses, so S&P strict price-return reaches 1954 (daily price + daily rate) while S&P strict
  total-return starts 1988 (daily TR). Per-symbol scoping would discard 34 years of genuinely-daily
  price history for no data reason; bundle-wide scoping would let EEM's 2003 start collapse strict
  to 2003 for everything.
- **D-15:** Pre-1988 total return is constructed as **daily price return plus a daily dividend yield
  interpolated from Shiller's monthly series**, spliced to real daily TR at 1988. Every splice and
  interpolation date lands in the manifest as a seam, so the construction is visible at day level.
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

### Claude's Discretion

Not raised during discussion; planner and researcher decide:

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
