# Phase 2: Compiled Data Bundle - Research

**Researched:** 2026-08-17
**Domain:** Build-time data pipeline, CSV/XLS ingestion, calendar-aligned binary compilation, provenance manifest
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

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
- **D-13:** The **1928-1933 short-rate gap is filled from a fourth source** (NBER Macrohistory
  monthly short rates), spliced to `TB3MS` at 1934 and to `DTB3`/`DFF` at 1954, with every splice
  recorded as a seam. Under the D-04 stack alone there is **no short rate at all before 1934**,
  which is precisely the 1929 crash and the 1929-1932 drawdown the extended tier exists to reach.
  Bounding the tier at 1934 instead was rejected because it would put the crash outside every tier;
  an assumed constant rate was rejected as a fabricated input in the one era the tool most needs to
  be believed about. **Research task:** confirm the NBER series exists in a machine-readable form
  covering 1928-1934. *(Resolved by this research, see Open Question 1 and Assumption A3: yes,
  mirrored on FRED as `M1329AUSM193NNBR`, but not confirmed via a direct pull this session.)*
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
- **D-17:** **Finding recorded, no action taken this phase.** Phase 5 criterion 4 states the
  extended tier's bias is that "interpolated monthly data smooths daily volatility and therefore
  understates volatility drag." That reasoning appears wrong: daily S&P *prices* genuinely reach
  1928, so returns are not interpolated. Only rates and dividends are, and neither drives volatility
  drag. The real extended-tier bias is more likely about **financing-cost precision**, not drag, and
  Phase 5's proposed quantification (downsample daily to monthly, interpolate back, measure the gap)
  would measure roughly nothing as specified. D-16's typed seam records give Phase 5 what it needs
  to restate the bias honestly. Revising another phase's success criteria is outside this phase's
  boundary, and the claim deserves measurement before it is overturned.
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

### Deferred Ideas (OUT OF SCOPE)

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

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|--------------------|
| DATA-01 | CLI compiler ingests raw CSVs, emits versioned binary assets + JSON manifest; adding a symbol is drop-CSV-and-recompile | Project structure and system-architecture diagram (Architecture Patterns) lay out the compiler's stages; `node:util parseArgs` recommended for the CLI entry point (Standard Stack) |
| DATA-02 | Compiler aligns trading calendars and the rate series, fails loudly on misalignment rather than forward-filling | Pattern 2 (calendar derivation) and the FRED "." missing-value convention (Code Examples) give the concrete mechanics D-09's gap policy operates on |
| DATA-03 | Compiler emits both price-return and total-return per symbol | Confirmed Stooq/FRED/Shiller column shapes (Code Examples) identify which raw columns feed each series; Pitfall 1 (Shiller TTM dividend) is the specific correctness risk for total-return construction |
| DATA-04 | Daily short-rate series spans the full range of every tier | D-13's open research task resolved (Open Question 1 / Assumption A3): the pre-1934 gap-filler is FRED-mirrored NBER series `M1329AUSM193NNBR`; Pitfall 4 flags the overlap-window splice risk against `TB3MS` |
| DATA-05 | Two tiers per symbol (strict/extended) computed from seam records, not hand-declared | Pattern 3 (typed seam records driving computed tier ranges) is the direct mechanism for D-14/D-16's computed-not-declared requirement |
| DATA-06 | Machine-readable provenance per series: source, date range, every seam date; UI generates labels from this | Pattern 1 (sidecar-gated compilation) and Pattern 3 (seam records) together are what the manifest's provenance fields are built from |
| DATA-07 | Bundled universe: S&P 500 to 1928, Nasdaq-100/QQQ, UPRO/TQQQ/SSO/QLD, VTI/EFA/EEM/TLT | Source stack confirmed (Stooq for equities/ETFs, FRED for rates, Shiller + NBER-via-FRED for deep history); Open Question 2 flags the one unverified depth claim (Stooq's S&P coverage to 1928) |
| DATA-09 | Content-versioned assets; a redeploy cannot serve a stale bundle alongside a new manifest | Pattern 4 (content-hashed filenames without a bundler) plus the `_headers` immutable-caching config directly implement this; binary header's `bundleVersion` field ties the decode-throws-on-mismatch half of D-22 together |

*DATA-08 (browser decode into typed arrays, offline-after-first-load) is explicitly Phase 4's
requirement per REQUIREMENTS.md's traceability table, not this phase's, included here only for
completeness, not as a phase-2 deliverable.*
</phase_requirements>

## Summary

CONTEXT.md already locks nearly every architectural decision for this phase (D-01 through D-23):
committed raw CSVs with sidecar provenance, a single canonical `date,value` schema, a compiler
that fails loudly on calendar disagreement, a calendar derived from the daily S&P series itself,
typed seam records instead of a per-day mask, and a raw-`Float64Array` binary layout with a
shared calendar asset. This document does not re-litigate those decisions. It fills the gaps a
planner needs and that CONTEXT.md explicitly left open: the concrete shape of the four raw data
sources (URL, columns, missing-value convention), whether D-13's open research task (does a
machine-readable pre-1934 short rate exist) resolves yes or no, a concrete binary header design,
the two packages this phase newly needs and their legitimacy, and the exact mechanics of
extending `perf-budgets.ts`/`bench/report.ts` for D-23's two new rows without breaking the
existing self-test.

**Primary recommendation:** Build the compiler as a plain TypeScript directory under
`tools/bundle-compiler/` in the existing single package (no npm workspace), using `node:util`'s
built-in `parseArgs` for the two-positional-argument CLI, `fast-check` for round-trip and
gap-detection invariants, and `xlsx` (SheetJS) only for the one input that genuinely needs it
(Shiller's `.xls`), flagged for a human-verify checkpoint before install because npm's registry
serves a version with a known, npm-unpatched CVE.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Raw CSV/XLS ingestion and per-source normalization | Build-time CLI (Node) | n/a | Runs once at compile time, never in the browser; D-03 explicitly keeps per-source parsing out of the compiler's canonical-schema validator |
| Trading-calendar derivation and gap validation | Build-time CLI (Node) | n/a | D-08/D-09/D-10 are compiler-time refusals; nothing about calendar alignment is a runtime concern |
| Binary asset + manifest emission | Build-time CLI (Node) | n/a | Output only; the CLI's entire job per DATA-01 |
| Binary asset decode into typed arrays | Browser / Client | n/a | DATA-08 (Phase 4) reads these assets; this phase only proves the round trip is lossless, it does not ship a runtime decoder into the app yet |
| Content-hash-based cache immutability | CDN / Static (Cloudflare Pages) | Build-time CLI (Node, filename computation) | The hash is computed at build time (Node) but the immutability guarantee is enforced by the CDN honoring `_headers` |
| Bench reporting of bundle size / decode time | Browser (timing) + Node (byte count) | n/a | Byte count is a Node `stat`/buffer-length fact; decode timing must run in the same browser harness as the rest of `perf-budgets.ts` per Phase 1 D-02/D-03's one-environment rule |

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `fast-check` | npm | matches installed `4.9.0`, published 2026-07-08 | ~27.7M/wk | github.com/dubzzz/fast-check | OK | Approved, already named in `.claude/CLAUDE.md`'s locked Standard Stack, confirmed live via `npm view fast-check version` this session |
| `xlsx` (SheetJS) | npm | latest npm publish 2022-03-24 (registry is stale) | ~10.4M/wk | github.com/SheetJS/sheetjs | OK (registry signals) / **SUS (security)** | Flagged, planner must add a `checkpoint:human-verify` task before install |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `xlsx`, the `package-legitimacy check` seam itself
returns `OK` (real package, real repo, high downloads), but this session's own CVE search found
`xlsx` [ASSUMED] (discovered via WebSearch, not previously named in project docs) has a known
prototype-pollution vulnerability (CVE-2023-30533 / GHSA-4r6h-8v6p-xvw6) affecting all versions
through 0.19.2, fixed in 0.19.3, and **0.19.3+ was never published to the npm registry**, npm's
`latest` (`0.18.5`) is the vulnerable version, per SheetJS's own advisory at
`cdn.sheetjs.com/advisories/CVE-2023-30533` [CITED: cdn.sheetjs.com/advisories/CVE-2023-30533].
The fixed versions are distributed only via SheetJS's own CDN (`cdn.sheetjs.com`), not npm.
Because this phase's only use of `xlsx` is parsing a file the fetch script downloads itself from
a source pinned in D-04 (not an attacker-supplied upload), the blast radius is a supply-chain
question (is `cdn.sheetjs.com` trustworthy, is Shiller's site itself compromised or MITM'd) rather
than a runtime user-input question, still real, not zero. **Recommendation for the planner:**
gate the `xlsx` install behind a `checkpoint:human-verify` task, and prefer installing from
`https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz` (SheetJS's documented npm-workaround, pinned
by tarball URL + integrity hash in `package.json`) over `npm install xlsx`, so the shipped version
is the patched one. Re-verify this CVE's status at implementation time, it is dated 2023 and the
npm-publish gap may have changed.

*No other new runtime packages are needed. Stooq and FRED both serve simple `date,value`-shaped
CSVs (columns confirmed below); the canonical `date,value` schema the compiler validates (D-03) is
simple enough to hand-parse (split on newline, split on comma, `Date.parse`/`parseFloat`) without
a CSV library, this is not the "deceptively complex" category the Don't Hand-Roll section below
reserves for genuinely hard problems.*

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:util` `parseArgs` | built into Node 22 (stable since Node 20) | CLI argument parsing for `compile-data ./raw ./public/data` | Zero-dependency, stable, sufficient for a two-positional-argument CLI with no subcommands [CITED: web search, multiple corroborating sources incl. Node.js release notes coverage] |
| `fast-check` | 4.9.0 (confirmed current via `npm view` this session) [VERIFIED: npm registry] | Property-based tests for encode/decode round trip and gap-detection invariants | Already the project's locked choice (`.claude/CLAUDE.md` Q7); integrates directly into Vitest's `unit` project with no adapter |
| `xlsx` (SheetJS) | pin via CDN tarball, not `npm install xlsx` (see Package Legitimacy Audit) | Parse Shiller's `ie_data.xls` in the fetch script | Only viable way to read a legacy binary `.xls` file in Node without a from-scratch OLE2/BIFF parser [ASSUMED, discovered via WebSearch, needs human-verify checkpoint] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:crypto` (`createHash('sha256')`) | built in | Content-hash asset filenames | Needed for D-22/DATA-09; no external package required, `createHash('sha256').update(buffer).digest('hex').slice(0, N)` appended to the filename before the extension is the standard pattern used by every bundler that does this (Vite, Webpack, esbuild all do the same operation internally) |
| `node:fs`, `node:path` | built in | Directory scan of `raw/`, writing compiled assets | No library needed for a flat directory read/write |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node:util parseArgs` | `commander` or `yargs` | Only worth it if the CLI grows subcommands or generated `--help` text beyond what two positional args need; premature for this phase's single command |
| Hand-rolled `date,value` CSV split | `csv-parse` / `papaparse` | The canonical schema (D-03) has no quoting, no embedded commas, no multi-line fields, a general CSV parser buys nothing a `String.split('\n')`/`.split(',')` doesn't already do correctly for this exact, self-controlled format |
| SheetJS `xlsx` for Shiller's file | Hand-rolled `.xls` (BIFF) binary parser | `.xls` is a legacy OLE2 compound binary format; writing a parser for it is precisely the "deceptively complex" category Don't Hand-Roll exists for. If the CDN-tarball trust concern is unacceptable, the fallback is a one-time manual conversion of `ie_data.xls` to CSV (e.g. via LibreOffice headless) checked into `raw/` alongside its sidecar, removing the runtime dependency entirely, worth raising with the user as an option during planning |

**Installation:**
```bash
npm install --save-dev fast-check@4.9.0
# xlsx: see Package Legitimacy Audit before installing, prefer the CDN tarball over `npm install xlsx`
```

**Version verification performed this session:**
- `npm view fast-check version` → `4.9.0`, published `2026-07-08T21:33:03Z` [VERIFIED: npm registry]
- `npm view xlsx` → latest npm-published version `0.18.5`, published `2022-03-24T14:23:09Z`
  [VERIFIED: npm registry]. This stale-publish date is itself the evidence for the CVE-unpatched-on-npm finding above.

## Architecture Patterns

### System Architecture Diagram

```
raw/*.csv + raw/*.meta.json + raw/calendar-exceptions.json
        |
        v
[Fetch script]  <-- pulls latest from Stooq / FRED / Shiller / FRED-mirrored-NBER
        |  (writes raw/*.csv, normalized to canonical date,value schema)
        |  (git diff is the human review surface, per D-07)
        v
raw/*.csv (committed, source of truth)
        |
        v
[compile-data CLI]  (tools/bundle-compiler/)
        |
        |-- 1. Load sidecars; refuse any CSV missing a sidecar (D-02)
        |-- 2. Validate canonical schema per file (D-03)
        |-- 3. Derive reference calendar from the longest daily S&P series (D-08)
        |-- 4. Align every symbol + rate series against that calendar:
        |       - interior price gap -> FATAL, name the dates (D-09)
        |       - rate-series gap -> carry-forward up to limit, record seam (D-09)
        |       - bar on a non-calendar date -> FATAL unless in
        |         calendar-exceptions.json (D-10/D-11)
        |       - ragged right edge -> WARN past threshold, not fatal (D-12)
        |-- 5. Splice pre-1934 short rate (NBER-via-FRED) to TB3MS at 1934,
        |       to DTB3/DFF at 1954; splice Shiller-derived daily dividend
        |       yield to real daily TR at 1988 (D-13/D-15); record every
        |       splice/interpolation/carry-forward as a typed seam (D-16)
        |-- 6. Compute strict/extended tier ranges per (symbol, dividend mode)
        |       by scanning seam records, never hand-declared (D-14/criterion 3)
        |-- 7. Emit binary assets: calendar.bin (shared), rate.bin (shared),
        |       one <symbol>.bin per symbol (price-return + total-return),
        |       each content-hashed into its filename (D-18/D-19/D-21/D-22)
        v
public/data/manifest.<hash>.json + public/data/*.<hash>.bin
        |
        v
[Phase 4: app decoder]  new Float64Array(buffer, offset, len) -- zero-copy view
        |
        v
[bench: two new rows]  bundle byte size, decode-to-typed-array time (D-23)
```

### Recommended Project Structure
```
raw/
├── SPX-PR.csv                  # canonical date,value
├── SPX-PR.meta.json             # sidecar: source, url, retrievedAt, seriesKind, license
├── SPX-TR.csv
├── SPX-TR.meta.json
├── ... one CSV+sidecar pair per raw input series
├── calendar-exceptions.json     # D-11's only override
tools/
└── bundle-compiler/
    ├── src/
    │   ├── cli.ts                # parseArgs entry point
    │   ├── binary-format.ts      # shared header/layout type, the ONE place this is defined
    │   ├── calendar.ts           # derive + validate against reference calendar
    │   ├── seams.ts              # typed seam record type + tier-range computation
    │   ├── sidecar.ts            # sidecar schema + validation
    │   ├── encode.ts             # write .bin assets + content-hash filenames
    │   └── manifest.ts           # build + write manifest.json
    └── tests/
        ├── golden/                # golden-file fixtures (Q7)
        └── *.test.ts              # property tests (fast-check) + unit tests
public/
└── data/                          # compiler output: *.bin, manifest.<hash>.json
_headers                           # Cloudflare Pages cache rules (D-22/Q6)
```

### Pattern 1: Sidecar-gated compilation (D-02)
**What:** The compiler refuses to process any `raw/*.csv` that lacks a matching `.meta.json`.
**When to use:** As the very first validation step, before schema or calendar checks, the phase's
"adding a symbol is a two-file drop" property depends on this being unconditional.
**Example:**
```typescript
// tools/bundle-compiler/src/sidecar.ts, original design, grounded in D-02
interface SidecarMeta {
  source: string
  url: string
  retrievedAt: string   // ISO date
  seriesKind: 'price' | 'total-return' | 'rate' | 'dividend-monthly'
  license: string
  termsUrl: string
}

function loadSidecarOrThrow(csvPath: string): SidecarMeta {
  const sidecarPath = csvPath.replace(/\.csv$/, '.meta.json')
  if (!existsSync(sidecarPath)) {
    throw new Error(
      `compile-data: ${csvPath} has no sidecar at ${sidecarPath}. ` +
        'Every raw CSV must carry provenance (D-02), refusing to compile.',
    )
  }
  return validateSidecarSchema(JSON.parse(readFileSync(sidecarPath, 'utf8')))
}
```

### Pattern 2: Reference calendar derived from data, not a library (D-08)
**What:** Build the trading-calendar `Int32Array` (days-since-epoch) directly from the dates
present in the longest-running daily S&P series, rather than from a holiday-rule library.
**When to use:** Once, before any symbol alignment; every other series is checked against this
array, never against a second, independently-derived calendar.
**Why it matters (validated this session):** NYSE's pre-1952 six-day week wasn't purely
Saturday-10am-to-noon on a fixed schedule, NYSE also took ad hoc extra Saturday closures in
1919, 1928, 1929 and 1933 for paperwork backlogs, and eliminated Saturday trading for good on
1952-09-29 [CITED: web search, corroborated across marketsmedia.com and tradinghours.com
summaries]. A calendar library encodes the *rule* (six-day week until a cutover date); it would
not know about the ad hoc closures. A calendar built from which dates the real S&P series
actually has bars for gets both right by construction, this is the concrete mechanism behind
D-08's stated rationale, not just a restatement of it.

### Pattern 3: Typed seam records drive computed tier ranges (D-14/D-16)
**What:** Every splice, interpolation, and carry-forward is one record:
`{ kind: 'splice' | 'interpolation' | 'carry-forward', startDate, endDate, sourceBefore,
sourceAfter, method }`. The strict/extended range for a given `(symbol, dividendMode)` pair is
computed by scanning these records for the given series' inputs, never hand-declared.
**When to use:** Any time the compiler performs a splice (D-13's rate-source stitching, D-15's
1988 TR splice) or an interpolation (D-15's monthly-to-daily dividend yield) or a carry-forward
(D-09's rate gap fill).
**Example:**
```typescript
// tools/bundle-compiler/src/seams.ts, original design, grounded in D-14/D-16
interface SeamRecord {
  kind: 'splice' | 'interpolation' | 'carry-forward'
  startDate: string   // ISO
  endDate: string      // ISO
  sourceBefore: string
  sourceAfter: string
  method: string        // e.g. "linear interpolation of Shiller monthly TTM dividend"
}

function computeTierRange(seams: SeamRecord[], allDailyInputsFrom: string): 'strict' | 'extended' {
  // strict = no interpolation/splice-into-monthly-source seam touches this series' date range
  const hasNonDailyInput = seams.some((s) => s.method.includes('monthly'))
  return hasNonDailyInput ? 'extended' : 'strict'
}
```

### Pattern 4: Content-hashed asset filenames without a bundler (D-22/DATA-09)
**What:** Since this CLI writes directly to `public/data/` rather than going through Vite's asset
pipeline, filename hashing must be hand-implemented, matching the same guarantee Vite/Webpack
give bundled assets.
**Example:**
```typescript
// tools/bundle-compiler/src/encode.ts
import { createHash } from 'node:crypto'

function contentHashedFilename(baseName: string, ext: string, bytes: Uint8Array): string {
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 10)
  return `${baseName}.${hash}.${ext}`
}
```
Pair with a Cloudflare Pages `_headers` file at the build output root:
```
/data/*.bin
  Cache-Control: public, max-age=31536000, immutable

/data/manifest.*.json
  Cache-Control: public, max-age=31536000, immutable
```
[CITED: developers.cloudflare.com/pages/configuration/headers, glob-pattern + immutable pattern
for fingerprinted assets]. `index.html` (and any unhashed file) is left off this list so it stays
short/no-cache by Cloudflare Pages' default, per D-22's "index.html is the only uncached document"
design.

### Anti-Patterns to Avoid
- **Trusting a per-file `expect()` to be the gate:** Phase 1's `bench/report.ts` pattern is that
  `assertRunInvariants` (the run-level check) is the authoritative gate, not each bench file's own
  assertion (`WR-03`) [VERIFIED: bench/report.ts:8-12]. Quoted: `"assertRunInvariants's verdict
  check: it fails the run whenever any row carries verdict === 'fail', independent of whether any
  individual bench file's own assertion ran or was removed."` D-23's two new rows must plug into
  this same run-level check, not add a parallel, bypassable assertion.
- **A CLI flag to skip calendar validation:** Explicitly rejected in D-11, "its failure mode is
  someone leaving it on in CI." Do not add one even for local debugging convenience; use
  `calendar-exceptions.json` for every case, including ad hoc local testing.
- **Downloading `.xls` at compile time instead of fetch time:** Per D-01/D-03, network access is
  the fetch script's job; the compiler only ever reads already-committed `raw/` files. Do not let
  the `xlsx` dependency leak into the compiler itself, it belongs only in the fetch script.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Legacy `.xls` binary parsing (Shiller data) | A from-scratch OLE2/BIFF reader | `xlsx` (SheetJS), pinned via CDN tarball per the security note above | `.xls` is a compound binary format (OLE2 container + BIFF records); this is exactly the class of format not worth reimplementing for a single input file |
| Content-addressed cache busting | A hand-rolled version query string (`?v=2`) | SHA-256-prefixed filename (Pattern 4 above) | D-22 and Q6 both explicitly reject query-string versioning: Cloudflare's edge cache and browser cache key more reliably on path than query string in some configurations |
| Trading calendar holiday rules | A holiday-rule calendar library (e.g. a market-calendar npm package) | Derive from the daily S&P series itself (Pattern 2) | D-08's own reasoning, reinforced by this session's finding that library-encoded holiday *rules* would still miss NYSE's ad hoc 1919/1928/1929/1933 Saturday closures that only show up in the actual data |

**Key insight:** Every "don't hand-roll" item above is about *external format complexity*
(a legacy binary spreadsheet format, cache semantics with documented footguns), not about the
domain logic (gap detection, seam recording, tier computation), that logic is exactly what
CONTEXT.md's D-08 through D-17 already specify in enough detail that hand-writing it is the
correct choice, not a shortcut.

## Runtime State Inventory

Not applicable, this is a greenfield phase (new compiler, new CLI, no rename/refactor of
existing runtime state). Omitted per the greenfield exemption.

## Common Pitfalls

### Pitfall 1: Confusing Shiller's `D` column with a single month's dividend payment
**What goes wrong:** Treating Shiller's monthly `D` value as "the dividend paid that month" and
dividing it directly into a daily yield produces a dividend rate roughly 12x too high.
**Why it happens:** Shiller's `D` (and `E`) columns are trailing-twelve-month (TTM) sums, not
single-month observations [CITED: web search summary of Shiller data documentation, multiple
corroborating sources]. A reader skimming column headers assumes "D" means "this month's
dividend."
**How to avoid:** When constructing the daily dividend yield for pre-1988 total return (D-15),
derive the annualized yield as `D / P` (already TTM-consistent) and interpolate that yield to
daily, not `D` itself treated as a monthly cash amount.
**Warning signs:** A synthetic pre-1988 total-return series that diverges from the real post-1988
series by roughly an order of magnitude at the 1988 splice boundary is the signature of this bug.

### Pitfall 2: Extending `RequirementId` breaks the Phase 1 self-test silently
**What goes wrong:** D-23 requires two new bench rows (bundle size, decode time). The decode row
is explicitly "carved out of PERF-08b's 1000ms" (same `requirementId: 'PERF-08'`, a new
`BudgetId`), which is a mechanical, additive change. The bundle-*size* row has no existing
requirement ID to carve from, DATA-09 is about stale-cache prevention, not a byte ceiling. If the
planner adds a new `RequirementId` value (e.g. a synthetic `'DATA-09'` or `'PERF-08'` reuse) to
satisfy the type, `tests/perf-budgets.selftest.test.ts`'s hardcoded assertion
`expect(entries).toHaveLength(11)` and its literal 8-element array of requirement ids
[VERIFIED: tests/perf-budgets.selftest.test.ts:137-152]. Quoted:
```
test('PERF_BUDGETS has exactly 11 entries across exactly the 8 requirement ids PERF-02..PERF-09', () => {
    const entries = Object.values(PERF_BUDGETS)
    expect(entries).toHaveLength(11)

    const requirementIds = new Set(entries.map((b) => b.requirementId))
    expect(Array.from(requirementIds).sort()).toEqual([
      'PERF-02',
      'PERF-03',
      'PERF-04',
      'PERF-05',
      'PERF-06',
      'PERF-07',
      'PERF-08',
      'PERF-09',
    ])
  })
```
will fail on the very next `npm test` unless this test is deliberately updated in the same plan
that adds the new budget row(s).
**Why it happens:** The self-test was written when 11 rows / 8 ids was a closed set (Phase 1's own
scope); D-23 is the first phase to reopen that count.
**How to avoid:** The plan must include a task that updates this test's literal `11` and its
8-element array alongside `perf-budgets.ts`'s new entries, in the same commit, not as an
afterthought discovered by a failing `npm test`.
**Warning signs:** `npm test` failing on `perf-budgets.selftest.test.ts` immediately after adding
a `perf-budgets.ts` entry is expected, not a regression to chase elsewhere.

### Pitfall 3: Reusing `measureMinOfN` for the decode-time bench row without a floor check
**What goes wrong:** Phase 1's `01-VERIFICATION.md` Gap 2 (closed in plan 01-06) found that an
unenforced minimum-measurement floor produced literal `0ms`/`0.00ms` readings that carried no real
information, see 01-SPIKE-RESULTS.md §2 ("PERF-02's raw minimum-of-five at
`0.09999999962747097ms`... far below the 10ms floor... carried only the timer's own resolution").
A `Float64Array` view-based decode (D-19's whole point: "decode is effectively free") is likely to
land at or near this same floor.
**Why it happens:** `new Float64Array(buffer, offset, length)` is a zero-copy view, so its
"decode" cost may be sub-millisecond, exactly the regime Phase 1 already proved the timer cannot
resolve without batching.
**How to avoid:** Reuse `measureBatchedMinOfN` (added in plan 01-06 specifically for this
situation), not the plain `measureMinOfN`, for the decode-time row, and confirm the batch minimum
clears `MIN_MEASUREMENT_MS` before trusting the figure, the exact discipline 01-06 established
for `PERF-02`/`PERF-05`.
**Warning signs:** A decode-time bench row reporting `0.00ms` is not a passing result to celebrate;
it is Gap 2 recurring.

### Pitfall 4: NBER-via-FRED splice boundary date mismatch
**What goes wrong:** The NBER-macrohistory-mirrored-on-FRED series (`M1329AUSM193NNBR`) is dated
"Jan 1920 to March 1934" [CITED: web search summary of the series' FRED page metadata] while
`TB3MS` starts `1934-01-01`. There is a 3-month overlap window (Jan-Mar 1934), not a clean
hand-off date. A splice implementation that assumes the two series meet at a single boundary date
with no overlap will either double-count or silently prefer one arbitrarily.
**Why it happens:** D-13 states "spliced to TB3MS at 1934" as if it's a point, but the two series'
actual date ranges overlap by a full quarter.
**How to avoid:** Decide and record (as a seam) which series wins during the overlap, likely
`TB3MS` for its full range, `M1329AUSM193NNBR` only for `< 1934-01-01`, and make that choice a
named `splice` seam record with an explicit `startDate`/`endDate`, not an implicit "first source
found" resolution.
**Warning signs:** A silent test pass that never actually exercises the overlap window (e.g. a
golden-file fixture whose date range skips January-March 1934) would hide this.

## Code Examples

### FRED CSV shape (confirmed this session)
```
DATE,VALUE
1954-07-01,1.13
1954-07-02,1.25
...
1990-11-19,.
```
[CITED: web search summary of FRED CSV documentation]. The `.` placeholder for a missing
observation (e.g. Columbus Day/Veterans Day for the rate series, per D-09's stated driver) is what
the compiler's carry-forward logic parses against; a plain `parseFloat('.')` yields `NaN`, which
must be the trigger for the carry-forward path, not an uncaught `NaN` propagating into the binary
asset.

### Stooq CSV shape (confirmed this session)
```
Date,Open,High,Low,Close,Volume
2009-06-25,39.87,40.35,38.85,39.61,15000
```
[CITED: web search summary of Stooq CSV format from multiple corroborating sources]. Download
endpoint pattern `https://stooq.com/q/d/l/?s=SYMBOL&i=d`; the fetch script's normalization step
extracts `Date,Close` (or an adjusted-close-equivalent if Stooq provides one for the given
symbol, verify per-symbol at fetch-script implementation time, since Stooq's column set was only
confirmed as `Date,Open,High,Low,Close,Volume` in this search, with **no adjusted-close column**
noted by one source) into the canonical `date,value` schema.

### Binary header layout (original design for this phase, grounded in D-18/D-19/D-21/D-22)
```typescript
// tools/bundle-compiler/src/binary-format.ts
// Shared, single-source-of-truth type for both the compiler's encoder and (Phase 4's) decoder.

export const MAGIC_BYTES = 0x4c56_4744 // "LVGD" as a uint32, arbitrary but fixed
export const FORMAT_VERSION = 1

/** calendar.bin layout: header + Int32Array of days-since-epoch. Shared by every symbol/rate
 * asset via (startIndex, length) offsets into this one array (D-21). */
export interface CalendarHeader {
  magic: number        // uint32, must equal MAGIC_BYTES
  version: number       // uint16
  bundleVersion: string // matches manifest's bundleVersion; decoder throws on mismatch (D-22)
  count: number          // uint32, number of Int32 entries following the header
}

/** <symbol>.bin layout: header + N series descriptors + one contiguous Float64 data section. */
export interface SymbolAssetHeader {
  magic: number
  version: number
  bundleVersion: string
  seriesCount: number    // uint16, 2 for a symbol with both price- and total-return
  series: SeriesDescriptor[]
}

export interface SeriesDescriptor {
  kind: 'price-return' | 'total-return' | 'rate'
  calendarStartIndex: number // uint32, index into calendar.bin's array
  length: number               // uint32, number of daily values
  dataByteOffset: number        // uint32, byte offset into this file's Float64 data section
}
```
This is an original design produced during this research session to satisfy D-18/D-19/D-21/D-22
together, not transcribed from an external source, it is offered as a concrete starting point,
not a locked decision; the planner/Claude's Discretion note in CONTEXT.md explicitly leaves the
exact header layout open.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Manual `?v=2` query-string cache busting | Content-hashed filenames + `immutable` `Cache-Control` | Standard practice for years, reaffirmed by Cloudflare's own Pages docs [CITED: developers.cloudflare.com/pages/configuration/headers] | Directly informs D-22's implementation |
| CommonJS `require`-based CLI arg libraries as default | `node:util parseArgs` for simple cases | Stable since Node 20 (2023) | Removes a dependency this phase would otherwise add |

**Deprecated/outdated:**
- `xlsx` npm package's registry-published version (`0.18.5`): superseded by `0.19.3`+ upstream,
  but that fix was never republished to npm, see Package Legitimacy Audit.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `xlsx` (SheetJS) is the right tool for parsing Shiller's `.xls` | Standard Stack, Don't Hand-Roll | If wrong (e.g. project prefers a manual one-time `.xls`→`.csv` conversion instead), the fetch script gains an unnecessary dependency with a known CVE history |
| A2 | Stooq's per-symbol CSV has no adjusted-close column for any of this project's symbols (UPRO, TQQQ, SSO, QLD, VTI, EFA, EEM, TLT, SPX, NDX/QQQ) | Code Examples | If a symbol's Stooq feed does carry a split/dividend-adjusted column under a different name, the fetch script's price-return vs total-return extraction could silently pick the wrong column |
| A3 | `M1329AUSM193NNBR`'s Jan 1920-Mar 1934 range is confirmed only via search-result summaries of its FRED page, not a direct CSV pull (both direct FRED page fetches in this session returned HTTP 403) | Common Pitfall 4, Standard Stack | If the actual date range or splice boundary differs from what's recorded here, D-13's 1928-1933 gap-fill plan needs adjustment before implementation |
| A4 | The binary header layout in Code Examples is workable as designed | Code Examples | Low risk, CONTEXT.md explicitly leaves this to planner/implementer discretion, so any workable layout satisfying D-18/D-19/D-21/D-22 is acceptable; this is a starting point, not a constraint |

**Note on STATE.md's existing blocker:** STATE.md already records "Exact FRED series start dates
... were verified via web search, not a direct API pull. Re-confirm against live sources at
implementation time" as an open Phase 2 blocker. This session's research reproduces the same
web-search-only verification for DFF/DTB3/TB3MS (now corroborated across 2-3 independent sources
each) and extends the same caveat to the newly-discovered `M1329AUSM193NNBR` NBER-mirror series
(A3 above). None of these were confirmed via a direct, successful API/CSV pull in this session , 
both direct `fred.stlouisfed.org` fetches attempted here returned HTTP 403 (likely bot-blocking,
not a data problem). The fetch script's first real run against these URLs is the actual
confirmation; treat every FRED-related figure in this document as [CITED], never [VERIFIED].

## Open Questions

1. **Does the pre-1934 NBER short-rate series actually cover 1928 without gaps?**
   - What we know: FRED mirrors it as `M1329AUSM193NNBR`, monthly, "Jan 1920 to March 1934" per
     search-result summaries of its FRED metadata.
   - What's unclear: Whether the underlying monthly observations are gap-free across 1928-1933
     specifically (the exact years D-13 cites as the gap this source needs to fill), since this
     session could not pull the actual CSV (403 on direct fetch).
   - Recommendation: The fetch script's first real pull of this series, plus the compiler's own
     gap-detection (D-09/D-10), will surface this automatically, no separate research spike
     needed, but the planner should not assume this is a solved problem before that first pull.

2. **Does every bundled symbol's Stooq feed actually reach back to each series' claimed start
   date (UPRO 2009, TQQQ 2010, EEM 2003, S&P to 1928)?**
   - What we know: These start dates are cited in CONTEXT.md D-12 as already-known facts, not
     flagged as needing verification.
   - What's unclear: Whether Stooq specifically (as opposed to some other vendor) has data that
     deep for the S&P index component (Stooq's own historical daily equity-index coverage depth
     for `^spx` back to 1928 was not directly confirmed in this session).
   - Recommendation: First fetch-script run against Stooq for the S&P symbol is the actual test;
     if Stooq's depth falls short of 1928, D-04's locked source stack may need revisiting (a
     Key Decision), not a planner workaround.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Node.js | Compiler CLI runtime | Yes | matches `@types/node@22.19.5` in `package.json`, Node 22 LTS per project's Standard Stack | n/a |
| Network access (Stooq, FRED, Yale econ.yale.edu) | Fetch script only, not the compiler | Not verified in this sandbox (both direct `fred.stlouisfed.org` fetches returned 403; may be sandbox-specific bot-blocking rather than a real outage) | n/a | The compiler itself never needs network access (D-01), only the fetch script does, and its output is a reviewable git diff regardless of when/where it runs |
| `xlsx`/CDN access (`cdn.sheetjs.com`) | Fetch script's Shiller-file parsing | Not verified this session | n/a | Manual one-time `.xls`→`.csv` conversion, committed as a `raw/` input, removes the runtime dependency entirely (see Don't Hand-Roll table) |

**Missing dependencies with no fallback:** none, every dependency above has a stated fallback.

**Missing dependencies with fallback:** network access for the fetch script (not exercised by the
compiler or its tests) and `xlsx`/CDN access (manual conversion fallback).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (existing `unit` project, Node environment) |
| Config file | `vitest.config.ts` (existing `unit` project at lines 18-22, no new project needed for the compiler's own tests) [VERIFIED: vitest.config.ts:16-23]. Quoted: `{ test: { name: 'unit', environment: 'node', include: ['tests/**/*.test.ts'] } }` |
| Quick run command | `npm test` (runs the `unit` project) |
| Full suite command | `npm test && npm run bench` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| DATA-01 | CLI compiles a raw dir into binary assets + manifest, no code change to add a symbol | integration | `vitest run --project unit tools/bundle-compiler/tests/compile.test.ts` | ❌ Wave 0 |
| DATA-02 | Compiler refuses on calendar disagreement, names offending dates | unit + property (fast-check) | `vitest run --project unit tools/bundle-compiler/tests/calendar.test.ts` | ❌ Wave 0 |
| DATA-03 | Compiler emits both price-return and total-return per symbol | unit (golden file) | `vitest run --project unit tools/bundle-compiler/tests/series.test.ts` | ❌ Wave 0 |
| DATA-04 | Daily short-rate series covers full range of each tier | unit | `vitest run --project unit tools/bundle-compiler/tests/rate-series.test.ts` | ❌ Wave 0 |
| DATA-05 | Strict/extended tiers computed, not declared | property (fast-check) | `vitest run --project unit tools/bundle-compiler/tests/seams.test.ts` | ❌ Wave 0 |
| DATA-06 | Manifest carries machine-readable provenance + seam dates | unit (golden file, manifest schema) | `vitest run --project unit tools/bundle-compiler/tests/manifest.test.ts` | ❌ Wave 0 |
| DATA-07 | Bundled universe covers the named symbol list, both series each | integration (against real fetched `raw/` fixtures) | `vitest run --project unit tools/bundle-compiler/tests/universe.test.ts` | ❌ Wave 0 |
| DATA-09 | Content-hashed filenames; stale-bundle-version decode throw | unit + property | `vitest run --project unit tools/bundle-compiler/tests/versioning.test.ts` | ❌ Wave 0 |
| criterion 5 (round trip, bench rows) | Decoded arrays match compiler's in-memory series exactly; bundle size + decode time reported | property (round trip) + bench (browser-timed) | `vitest run --project unit tools/bundle-compiler/tests/roundtrip.test.ts` + `npm run bench` | ❌ Wave 0 (both) |

### Sampling Rate
- **Per task commit:** `npm test` (fast, Node-side unit/property tests, no browser startup)
- **Per wave merge:** `npm test && npm run bench` (adds the two new browser-timed rows)
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus `npm run bench:selftest` to
  confirm the gate-liveness self-test (updated per Pitfall 2 above) still catches an
  over-budget fixture.

### Wave 0 Gaps
- [ ] `tools/bundle-compiler/tests/*.test.ts`, the entire compiler test suite; nothing exists yet.
- [ ] `tools/bundle-compiler/tests/fixtures/`, small synthetic `raw/` fixture (a handful of
      symbols, a deliberately short date range) for fast unit/property tests, distinct from the
      real, large bundled universe.
- [ ] Update `tests/perf-budgets.selftest.test.ts`'s hardcoded `11`/8-element-array assertions
      (Pitfall 2) in the same plan that adds `perf-budgets.ts` entries, not a pre-existing gap,
      but a required edit this phase's own work creates.
- [ ] Framework install: `npm install --save-dev fast-check@4.9.0`, not yet in `package.json`.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V5 Input Validation | Yes | The compiler is, in effect, a parser for four different external data formats (Stooq CSV, FRED CSV, Shiller `.xls`, sidecar JSON) plus a user-supplied `calendar-exceptions.json`. Validate the canonical `date,value` schema hard (D-03, already locked) and validate sidecar/manifest JSON against an explicit schema (not just `JSON.parse` + trust) before using any field |
| V12 Files and Resources | Yes | Directory scan of `raw/` and writes to `public/data/` are both filesystem operations on paths derived from CLI args (`compile-data ./raw ./public/data`), resolve and validate these paths are within the expected project tree before reading/writing, since a malformed or malicious path argument could otherwise write outside the intended output directory |
| V2/V3/V4 (Auth/Session/Access Control) | No | This is a local build-time CLI with no network-facing surface of its own; no authentication or session concept applies |
| V6 Cryptography | Partial | The only cryptographic operation is `createHash('sha256')` for content-addressed filenames, not a security boundary (collision resistance for cache-busting only), so no key management or secret-handling concern applies |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Malicious/malformed `.xls` triggering `xlsx`'s prototype-pollution CVE | Tampering / Elevation of Privilege | Pin `xlsx` to a patched version (>=0.19.3, via CDN tarball, not npm's stale `0.18.5`) before this phase ships; treat Shiller's file as semi-trusted (self-fetched, not user-uploaded) but not fully trusted |
| Sidecar/manifest JSON with unexpected shape (e.g. prototype-polluting keys like `__proto__`) crashing or corrupting the compiler | Tampering | Parse with `JSON.parse` (which does not special-case `__proto__` the way some deep-merge utilities do) and validate against an explicit field allowlist before use, rather than spreading parsed JSON directly into objects used elsewhere |
| CLI path arguments (`./raw`, `./public/data`) resolving outside the project directory via `../` traversal or a symlink | Tampering | Resolve both arguments with `path.resolve` and confirm they remain within (or are exactly) the expected project subtree before any read/write; fail loudly rather than silently writing elsewhere, consistent with this phase's overall "fail loudly" ethos (D-02/D-09/D-10) |

## Sources

### Primary (HIGH confidence)
- `npm view fast-check version` / `npm view xlsx`, direct registry queries run this session
- `perf-budgets.ts`, `bench/report.ts`, `vitest.config.ts`, `tests/perf-budgets.selftest.test.ts`,
  `bench/environment-block.ts`, read directly this session, quoted verbatim where cited

### Secondary (MEDIUM confidence)
- Web search, corroborated across 2+ independent sources: FRED CSV format and DFF/DTB3/TB3MS
  start dates, Stooq CSV endpoint and columns, `node:util parseArgs` stability, Cloudflare Pages
  `_headers` immutable-caching pattern, NYSE pre-1952 Saturday-session history
- SheetJS's own CVE advisory page (`cdn.sheetjs.com/advisories/CVE-2023-30533`), vendor's own
  disclosure, treated as authoritative for that specific claim

### Tertiary (LOW confidence)
- Web search, single-source or search-summary-only, not independently corroborated: Shiller
  `ie_data.xls` exact column semantics (TTM dividend framing), `M1329AUSM193NNBR`'s exact date
  range and splice-boundary overlap with `TB3MS` (both direct FRED fetches in this session
  returned HTTP 403, so this is search-summary-derived, not a direct pull), flagged in
  Assumptions Log A3 and Open Question 1

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM, `fast-check` is HIGH (verified + previously locked); `xlsx` is MEDIUM
  with a real, specific security caveat requiring a human-verify checkpoint
- Architecture: MEDIUM, the binary format, calendar-derivation, and seam-record patterns are
  directly grounded in CONTEXT.md's already-locked decisions (D-08 through D-22), which this
  document treats as authoritative; the header layout itself is original design, offered as a
  starting point per CONTEXT.md's explicit discretion note
- Pitfalls: MEDIUM-HIGH, Pitfalls 1-3 are grounded in either direct file reads
  (perf-budgets.selftest.test.ts, 01-SPIKE-RESULTS.md) or corroborated web search; Pitfall 4 is
  flagged explicitly as resting on uncorroborated search-summary data (A3)

**Research date:** 2026-08-17
**Valid until:** 30 days for the stable facts (Node API stability, Cloudflare caching mechanics,
binary format design); re-verify the `xlsx` CVE/npm-publish status and all FRED/Stooq/Shiller
URLs and date ranges at implementation time regardless of this window, since none were confirmed
via a direct successful pull in this session (both direct FRED fetches returned HTTP 403).
